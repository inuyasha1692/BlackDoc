import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    server: {
      deps: { inline: [/@blocknote\/math-block/, /@blocknote\/diagram-block/, /katex/] },
    },
  },
});
