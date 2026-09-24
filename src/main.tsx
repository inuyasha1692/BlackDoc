import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { applyTheme, readTheme } from "./theme";

applyTheme(readTheme());

const root = document.getElementById("root")!;
if (isTauri()) {
  void import("./App").then(({ default: App }) => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
} else {
  root.textContent = "请从 BlackDoc 桌面客户端启动编辑器。";
}
