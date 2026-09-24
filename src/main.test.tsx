import { afterEach, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.resetModules();
});

it("does not mount the editor outside the desktop client", async () => {
  const root = document.createElement("div");
  root.id = "root";
  document.body.append(root);

  await import("./main");

  expect(root).toHaveTextContent("请从 BlackDoc 桌面客户端启动编辑器。");
  expect(root.querySelector(".app-shell")).toBeNull();
});
