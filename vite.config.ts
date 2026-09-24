import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function excalidrawAssets(): Plugin {
  const require = createRequire(import.meta.url);
  const fontsDirectory = join(
    dirname(require.resolve("@excalidraw/excalidraw")),
    "fonts",
  );
  let prefix = "/excalidraw-assets/fonts/";
  let fonts: Map<string, string>;

  return {
    name: "excalidraw-offline-fonts",
    async configResolved(config) {
      prefix = new URL(
        `${config.base}excalidraw-assets/fonts/`,
        "http://localhost/",
      ).pathname;
      const files = await readdir(fontsDirectory, { recursive: true });
      fonts = new Map(
        files
          .filter((file) => file.endsWith(".woff2"))
          .map((file) => [
            file.replaceAll("\\", "/"),
            join(fontsDirectory, file),
          ]),
      );
      if (!fonts.size) {
        throw new Error("Excalidraw font assets are missing.");
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split("?")[0] ?? "";
        if (!pathname.startsWith(prefix)) return next();
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405, { Allow: "GET, HEAD" }).end();
          return;
        }
        // Only serve known package files, including for encoded traversal paths.
        let filename: string | undefined;
        try {
          filename = fonts.get(decodeURIComponent(pathname.slice(prefix.length)));
        } catch {
          response.writeHead(400).end();
          return;
        }
        if (!filename) {
          response.writeHead(404).end();
          return;
        }
        void readFile(filename).then((content) => {
          response.writeHead(200, {
            "Content-Type": "font/woff2",
            "Content-Length": content.length,
            "Cache-Control": "no-cache",
          });
          response.end(request.method === "HEAD" ? undefined : content);
        }, next);
      });
    },
    async generateBundle() {
      for (const [name, filename] of fonts) {
        this.emitFile({
          type: "asset",
          fileName: `excalidraw-assets/fonts/${name}`,
          source: await readFile(filename),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), excalidrawAssets()],
});
