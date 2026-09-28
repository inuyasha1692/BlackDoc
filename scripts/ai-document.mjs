import { readFile, writeFile, rename, access, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const [directory, command, input] = process.argv.slice(2);
if (directory === "list") {
  const root = join(tmpdir(), "blackdoc-ai");
  const entries = await readdir(root).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const connections = [];
  for (const entry of entries) {
    const path = join(root, entry);
    try {
      const snapshotPath = join(path, "snapshot.json");
      const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
      const metadata = await stat(snapshotPath);
      connections.push({ directory: path, path: snapshot.path, revision: snapshot.revision,
        updatedAt: metadata.mtime.toISOString() });
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  console.log(JSON.stringify(connections, null, 2));
  process.exit(0);
}
if (!directory || !["read", "apply"].includes(command)) {
  throw new Error('Usage: node scripts/ai-document.mjs list | <connection-directory> read|apply [request.json]');
}
if (command === "read") {
  console.log(await readFile(join(directory, "snapshot.json"), "utf8"));
} else {
  if (!input) throw new Error("Provide a JSON file containing revision and blocks.");
  let source;
  if (input === "-") {
    source = "";
    for await (const chunk of process.stdin) source += chunk.toString();
  } else {
    source = await readFile(input, "utf8");
  }
  const request = JSON.parse(source);
  request.id = randomUUID();
  const lock = join(directory, "client.lock");
  const { open, unlink } = await import("node:fs/promises");
  const handle = await open(lock, "wx");
  try {
    try { await access(join(directory, "request.json")); throw new Error("A request is already pending."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const temporary = join(directory, `${request.id}.tmp`);
    await writeFile(temporary, JSON.stringify(request));
    await rename(temporary, join(directory, "request.json"));
    const deadline = Date.now() + 15000;
    let result;
    while (Date.now() < deadline) {
      try {
        const response = JSON.parse(await readFile(join(directory, "response.json"), "utf8"));
        if (response.id === request.id) { result = response; break; }
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!result) throw new Error("Timed out; inspect the live document before retrying.");
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await handle.close();
    await unlink(lock).catch(() => {});
  }
}
