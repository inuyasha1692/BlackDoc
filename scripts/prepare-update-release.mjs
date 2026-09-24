import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const tag = process.argv[2] ?? `v${version}`;
if (tag !== `v${version}`) throw new Error(`发布标签必须为 v${version}`);

const directory = new URL("../src-tauri/target/release/bundle/nsis/", import.meta.url);
const installers = readdirSync(directory).filter(name =>
  name.endsWith("-setup.exe") && name.includes(version) &&
  readdirSync(directory).includes(`${name}.sig`),
);
if (installers.length !== 1) throw new Error("需要恰好一个与当前版本匹配的 NSIS 安装包及其 .sig 文件");

const name = installers[0];
const signature = readFileSync(new URL(name + ".sig", directory), "utf8").trim();
const url = `https://github.com/inuyasha1692/BlackDoc/releases/download/${tag}/${encodeURIComponent(name)}`;
const metadata = {
  version,
  platforms: { "windows-x86_64": { signature, url } },
};
const output = new URL("latest.json", directory);
writeFileSync(output, JSON.stringify(metadata, null, 2) + "\n");
console.log(`更新元数据已生成：${join("src-tauri", "target", "release", "bundle", "nsis", "latest.json")}`);
