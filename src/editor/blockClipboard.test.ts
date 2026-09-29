import { BlockNoteEditor } from "@blocknote/core";
import { afterEach, expect, it, vi } from "vitest";
import { copyBlockToClipboard } from "./blockClipboard";
import { blackDocSchema, type BlackDocEditor } from "./schema";
import { SplitPaneExtension } from "./splitPaneExtension";

let editor: BlackDocEditor;
const originalExecCommand = Object.getOwnPropertyDescriptor(document, "execCommand");
afterEach(() => {
  editor?._tiptapEditor.destroy();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalExecCommand) Object.defineProperty(document, "execCommand", originalExecCommand);
  else Reflect.deleteProperty(document, "execCommand");
});

function setup() {
  editor = BlockNoteEditor.create({ schema: blackDocSchema, extensions: [SplitPaneExtension()], initialContent: [
    { id: "pane", type: "splitPane", children: [
      { id: "left", type: "splitColumn", props: { side: "left" }, children: [
        { id: "image", type: "image", props: { url: "inside.png", caption: "图片说明", previewWidth: 120 } },
      ] },
      { id: "right", type: "splitColumn", props: { side: "right" }, children: [{ type: "paragraph" }] },
    ] },
    { id: "after", type: "paragraph" },
  ] });
  const host = document.createElement("div");
  document.body.append(host);
  editor.mount(host);
  editor.setTextCursorPosition("after", "start");
  const values = new Map<string, string>([["text/plain", "previous clipboard"]]);
  const clipboard = { setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? "", clearData: () => values.clear() };
  // Chromium can target BODY when an image selection has no native DOM range.
  // Dispatch outside the editor to exercise the actual menu-copy failure path.
  Object.defineProperty(document, "execCommand", { configurable: true, value: () => {
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboard });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  } });
  return clipboard;
}

it("copies a column image even when the native copy event targets BODY, then pastes outside", () => {
  const clipboard = setup();
  expect(copyBlockToClipboard(editor, "image")).toBe(true);
  expect(clipboard.getData("text/plain")).not.toBe("previous clipboard");
  const html = clipboard.getData("blocknote/html");
  expect(html).toContain('data-content-type="image"');
  expect(html).not.toContain('data-content-type="splitPane"');
  expect(html).not.toContain('data-content-type="splitColumn"');
  editor.setTextCursorPosition("after", "start");
  vi.stubGlobal("ClipboardEvent", Event);
  const paste = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", { value: { ...clipboard, types: ["blocknote/html"] } });
  editor.prosemirrorView.dom.dispatchEvent(paste);
  expect(editor.document.filter(block => block.type === "image")).toMatchObject([
    { props: { url: "inside.png", caption: "图片说明", previewWidth: 120 } },
  ]);
  expect(editor.getBlock("left")?.children).toHaveLength(1);
});

it("does not report success or leave copy listeners behind when the browser never fires copy", () => {
  setup();
  const command = vi.spyOn(document, "execCommand").mockReturnValue(true);
  expect(copyBlockToClipboard(editor, "image")).toBe(false);
  command.mockRestore();
  const unrelated = new Event("copy", { bubbles: true, cancelable: true });
  document.body.dispatchEvent(unrelated);
  expect(unrelated.defaultPrevented).toBe(false);
});

it("preserves formatting and nested children when copying a text block from its menu", () => {
  const clipboard = setup();
  editor.insertBlocks([{ id: "text", type: "paragraph", content: [
    { type: "text", text: "Bold text", styles: { bold: true } },
  ], children: [{ id: "child", type: "paragraph", content: "Nested text" }] }], "after", "after");
  expect(copyBlockToClipboard(editor, "text")).toBe(true);
  expect(clipboard.getData("text/html")).toContain("<strong>Bold text</strong>");
  expect(clipboard.getData("text/plain")).toContain("**Bold text**");
  expect(clipboard.getData("blocknote/html")).toContain('data-id="child"');
});
