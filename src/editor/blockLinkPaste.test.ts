import { BlockNoteEditor } from "@blocknote/core";
import { TextSelection } from "@tiptap/pm/state";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pasteBlockLink } from "./blockLinkPaste";
import { blackDocSchema, type BlackDocEditor } from "./schema";
import { SplitPaneExtension } from "./splitPaneExtension";

const href = "#block=cc64d143-c74a-4aaa-a7fb-3473f5f52321";
let editor: BlackDocEditor;

afterEach(() => {
  editor?._tiptapEditor.destroy();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function setup() {
  vi.stubGlobal("ClipboardEvent", Event);
  editor = BlockNoteEditor.create({
    schema: blackDocSchema,
    extensions: [SplitPaneExtension()],
    pasteHandler: ({ event, editor: activeEditor, defaultPasteHandler }) =>
      pasteBlockLink(activeEditor, event.clipboardData) || defaultPasteHandler(),
    initialContent: [
      { id: "pane", type: "splitPane", children: [
        { type: "splitColumn", props: { side: "left" }, children: [{ type: "paragraph" }] },
        { type: "splitColumn", props: { side: "right" }, children: [
          { id: "source", type: "paragraph", content: [
            { type: "text", text: "区域地图实现思路\n", styles: { bold: true } },
            { type: "text", text: "地区解锁说明\n详见", styles: {} },
            { type: "link", href, content: [{ type: "text", text: "概念表", styles: {} }] },
            { type: "text", text: "\n然后解锁地区2", styles: {} },
          ] },
        ] },
      ] },
      { id: "outside", type: "paragraph" },
    ],
  });
  editor.elementRenderer = (node, container) => {
    container.innerHTML = renderToStaticMarkup(node);
  };
  const host = document.createElement("div");
  document.body.append(host);
  editor.mount(host);
  const values = new Map<string, string>();
  const clipboard = {
    get types() { return [...values.keys()]; }, files: [], items: [],
    getData: (type: string) => values.get(type) ?? "",
    setData: (type: string, value: string) => values.set(type, value),
    clearData: () => values.clear(),
  };
  return { clipboard, values };
}

function dispatchClipboard(type: "copy" | "paste", clipboard: object) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: clipboard });
  editor.prosemirrorView.dom.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
}

describe("copying an internal link out of the right split pane", () => {
  it.each(["blocknote/html", "text/html", "text/plain"])(
    "preserves only the linked label through %s clipboard data", async format => {
      const { clipboard, values } = setup();
      const view = editor.prosemirrorView;
      const { state } = view;
      let start = -1;
      state.doc.descendants((node, pos) => {
        if (node.isText && node.text === "概念表") start = pos;
      });
      expect(start).toBeGreaterThan(0);
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, start + 3)));
      dispatchClipboard("copy", clipboard);
      expect(clipboard.getData("text/plain").trim()).toBe(`[概念表](${href})`);
      // Keep text/plain alongside HTML, as on the operating system clipboard.
      for (const type of [...values.keys()]) {
        if (type !== format && type !== "text/plain") values.delete(type);
      }
      editor.setTextCursorPosition("outside", "start");
      dispatchClipboard("paste", clipboard);
      await vi.waitFor(() => {
        expect(editor.getBlock("outside")?.content).toEqual([
          { type: "link", href, content: [{ type: "text", text: "概念表", styles: {} }] },
        ]);
      });
    },
  );

  it("preserves line breaks, bold text and the link when copying the whole paragraph", async () => {
    const { clipboard } = setup();
    const expected = editor.getBlock("source")?.content;
    const view = editor.prosemirrorView;
    const { state } = view;
    let start = -1;
    let size = 0;
    state.doc.descendants((node, pos) => {
      if (node.type.name === "blockContainer" && node.attrs.id === "source") {
        start = pos + 2;
        size = node.firstChild!.content.size;
      }
    });
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, start + size)));
    dispatchClipboard("copy", clipboard);
    expect(clipboard.getData("text/plain")).toContain(`[概念表](${href})`);
    editor.setTextCursorPosition("outside", "start");
    dispatchClipboard("paste", clipboard);
    await vi.waitFor(() => expect(editor.getBlock("outside")?.content).toEqual(expected));
  });

  it("still applies a standalone block address to selected text", () => {
    setup();
    editor.updateBlock("outside", { content: "概念表" });
    editor.setTextCursorPosition("outside", "start");
    const view = editor.prosemirrorView;
    const { state } = view;
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, state.selection.from, state.selection.from + 3)));
    dispatchClipboard("paste", { types: ["text/plain"], getData: () => href });
    expect(editor.getBlock("outside")?.content).toEqual([
      { type: "link", href, content: [{ type: "text", text: "概念表", styles: {} }] },
    ]);
  });
});
