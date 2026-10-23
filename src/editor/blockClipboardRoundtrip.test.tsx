import { BlockNoteEditor, getNodeById } from "@blocknote/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { BlockNoteView } from "@blocknote/mantine";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { blackDocSchema, type BlackDocBlock, type BlackDocPartialBlock } from "./schema";
import { BlockMarqueeExtension, getBlockMarquee } from "./blockMarquee";
import { SplitPaneExtension } from "./splitPaneExtension";
import { BlockClipboardExtension, copyBlockToClipboard, pasteBlockClipboard } from "./blockClipboard";

const originalExecCommand = Object.getOwnPropertyDescriptor(document, "execCommand");
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  if (originalExecCommand) Object.defineProperty(document, "execCommand", originalExecCommand);
  else Reflect.deleteProperty(document, "execCommand");
});

it.each(["paragraph", "codeBlock"] as const)("keeps a native partial-text copy correct when pasting into $0", type => {
  const source = BlockNoteEditor.create({ extensions: [BlockClipboardExtension()], initialContent: [{ id: "source", type: "paragraph", content: [
    { type: "text", text: "before ", styles: {} }, { type: "text", text: "selected", styles: { bold: true } }, { type: "text", text: " after", styles: {} },
  ] }] });
  const target = BlockNoteEditor.create({ initialContent: [{ id: "target", type }], pasteHandler: ({ editor, event, defaultPasteHandler }) => pasteBlockClipboard(editor, event.clipboardData) || defaultPasteHandler() });
  source.mount(document.body.appendChild(document.createElement("div")));
  target.mount(document.body.appendChild(document.createElement("div")));
  const values = new Map<string, string>();
  const clipboard = { types: ["text/html", "text/plain"], getData: (type: string) => values.get(type) ?? "", setData: (type: string, value: string) => values.set(type, value), clearData: () => values.clear() };
  vi.stubGlobal("ClipboardEvent", Event);
  try {
    const view = source.prosemirrorView;
    let start = 0;
    view.state.doc.descendants((node, pos) => { if (node.isText && node.text === "selected") start = pos; });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start, start + 8)));
    const copy = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(copy, "clipboardData", { value: clipboard });
    view.dom.dispatchEvent(copy);
    expect(clipboard.getData("text/html")).toContain("data-blackdoc-clipboard");
    expect(clipboard.getData("text/plain")).not.toContain("before");
    target.setTextCursorPosition("target", "start");
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: clipboard });
    target.prosemirrorView.dom.dispatchEvent(paste);
    expect(target.document[0].type).toBe(type);
    expect(target.document[0].content).toEqual([{ type: "text", text: type === "codeBlock" ? clipboard.getData("text/plain") : "selected", styles: type === "codeBlock" ? {} : { bold: true } }]);
  } finally { source._tiptapEditor.destroy(); target._tiptapEditor.destroy(); }
});

it.each(["heading", "paragraph", "codeBlock"].flatMap(type => ["blocknote/html", "text/html"].flatMap(format => [false, true].map(existing => ({ type: type as "heading" | "paragraph" | "codeBlock", format, existing })))))("keeps a table partial-text copy correct when pasting into $type using $format (existing text: $existing)", ({ type, format, existing }) => {
  const source = BlockNoteEditor.create({ extensions: [BlockClipboardExtension()], initialContent: [{ id: "source", type: "table", content: { type: "tableContent", rows: [{ cells: [{ type: "tableCell", content: [
    { type: "text", text: "before ", styles: {} }, { type: "text", text: "selected", styles: { bold: true } }, { type: "text", text: " after", styles: {} },
  ] }] }] } }] });
  const target = BlockNoteEditor.create({ initialContent: [{ id: "target", type, content: existing ? "标题前后" : undefined }], pasteHandler: ({ editor, event, defaultPasteHandler }) => pasteBlockClipboard(editor, event.clipboardData) || defaultPasteHandler() });
  source.mount(document.body.appendChild(document.createElement("div")));
  target.mount(document.body.appendChild(document.createElement("div")));
  const values = new Map<string, string>();
  const clipboard = { types: ["text/html", "text/plain"], getData: (type: string) => values.get(type) ?? "", setData: (type: string, value: string) => values.set(type, value), clearData: () => values.clear() };
  vi.stubGlobal("ClipboardEvent", Event);
  try {
    const view = source.prosemirrorView;
    let start = 0;
    view.state.doc.descendants((node, pos) => { if (node.isText && node.text === "selected") start = pos; });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start, start + 8)));
    const copy = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(copy, "clipboardData", { value: clipboard });
    view.dom.dispatchEvent(copy);
    expect(clipboard.getData("text/html")).toContain("data-blackdoc-clipboard");
    expect(clipboard.getData("text/plain")).not.toContain("before");
    target.setTextCursorPosition("target", "start");
    if (existing) {
      const targetView = target.prosemirrorView;
      const position = targetView.state.selection.from + 2;
      targetView.dispatch(targetView.state.tr.setSelection(TextSelection.create(targetView.state.doc, position)));
    }
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { ...clipboard, types: [format, "text/plain"] } });
    target.prosemirrorView.dom.dispatchEvent(paste);
    expect(target.document[0].type).toBe(type);
    const selected = type === "codeBlock" ? clipboard.getData("text/plain") : "selected";
    expect(target.document[0].content).toEqual(type === "codeBlock"
      ? [{ type: "text", text: existing ? `标题${selected}前后` : selected, styles: {} }]
      : [
        ...(existing ? [{ type: "text", text: "标题", styles: {} }] : []),
        { type: "text", text: selected, styles: { bold: true } },
        ...(existing ? [{ type: "text", text: "前后", styles: {} }] : []),
      ]);
  } finally { source._tiptapEditor.destroy(); target._tiptapEditor.destroy(); }
});

function layoutFixture(type: string): BlackDocPartialBlock {
  const pane: BlackDocPartialBlock = type === "table" ? {
    id: "table", type: "table", content: { type: "tableContent", columnWidths: [160, 240], headerRows: 1, rows: [
      { cells: [{ type: "tableCell", props: { colspan: 2, backgroundColor: "yellow", textColor: "red", textAlignment: "center" }, content: [{ type: "text", text: "合并表头", styles: { bold: true } }] }] },
      { cells: [{ type: "tableCell", props: { rowspan: 2 }, content: "纵向合并" }, { type: "tableCell", content: [
        { type: "text", text: "图片前", styles: { italic: true } },
        { type: "tableImage", props: { url: "data:image/png;base64,YQ==", name: "表格图片", previewWidth: 100 } },
        { type: "link", href: "https://example.com", content: "图片后链接" },
      ] }] },
      { cells: ["末行"] },
    ] },
  } : { id: "pane", type: "splitPane", props: { leftWidth: 54, rightHeight: 395 }, children: [
    { type: "splitColumn", props: { side: "left" }, children: [{ type: "canvas", props: {
      previewWidth: 544, textAlignment: "left", scene: JSON.stringify({ version: 1, elements: [], appState: {}, files: {} }),
    } }] },
    { type: "splitColumn", props: { side: "right" }, children: [{ type: "paragraph", content: "右侧说明" }] },
  ] };
  return pane;
}

const richText = [
  { type: "text" as const, text: "格式文字", styles: { bold: true, italic: true, underline: true, strike: true, textColor: "red", backgroundColor: "yellow" } },
  { type: "text" as const, text: "代码", styles: { code: true } },
  { type: "link" as const, href: "https://example.com/a?b=1&c=2", content: "链接" },
  { type: "math" as const, content: "x^2+1" },
];
const fixtures: BlackDocPartialBlock[] = [
  layoutFixture("splitPane"), layoutFixture("table"),
  ...(["paragraph", "bulletListItem", "quote", "toggleListItem"] as const).map(type => ({
    id: type, type, props: { textAlignment: "right" as const, textColor: "blue", backgroundColor: "yellow" }, content: richText,
    children: [{ type: "paragraph" as const, content: "子块", children: [{ type: "paragraph" as const, content: "孙块" }] }],
  })),
  { id: "heading", type: "heading", props: { level: 6, isToggleable: true, textAlignment: "center" }, content: richText, children: [{ type: "paragraph", content: "标题子块" }] },
  { id: "numberedListItem", type: "numberedListItem", props: { start: 7 }, content: richText, children: [{ type: "numberedListItem", content: "子列表" }] },
  { id: "checkListItem", type: "checkListItem", props: { checked: true }, content: richText, children: [{ type: "checkListItem", content: "未选项" }] },
  { id: "codeBlock", type: "codeBlock", props: { language: "typescript" }, content: "const s = '<>&nbsp;';\n  console.log(s);" },
  { id: "divider", type: "divider" },
  { id: "image", type: "image", props: { url: "data:image/png;base64,YQ==", name: "图片", caption: "图片说明", showPreview: false, previewWidth: 245, textAlignment: "right", backgroundColor: "blue" } },
  { id: "video", type: "video", props: { url: "data:video/mp4;base64,YQ==", name: "视频", caption: "视频说明", showPreview: false, previewWidth: 245, textAlignment: "center", backgroundColor: "blue" } },
  { id: "audio", type: "audio", props: { url: "data:audio/mp3;base64,YQ==", name: "音频", caption: "音频说明", showPreview: false, backgroundColor: "blue" } },
  { id: "file", type: "file", props: { url: "data:application/pdf;base64,YQ==", name: "附件.pdf", caption: "附件说明", backgroundColor: "blue" } },
  { id: "canvas", type: "canvas", props: { scene: JSON.stringify({ version: 1, elements: [], files: {}, appState: {} }), previewWidth: 312, textAlignment: "center" } },
  { id: "diagram", type: "diagram", content: "graph TD\n  A[开始] --> B[结束]" },
  { id: "mathBlock", type: "mathBlock", content: "\\frac{a}{b}+x^2" },
  { id: "columnList", type: "columnList", children: [
    { type: "column", props: { width: 2 }, children: [{ type: "paragraph", content: "左列" }] },
    { type: "column", props: { width: 1 }, children: [{ type: "image", props: { url: "data:image/png;base64,YQ==", previewWidth: 123 } }] },
  ] },
];

function withoutBlockIds(block: BlackDocBlock): unknown {
  return { type: block.type, props: block.props, content: block.content, children: block.children.map(withoutBlockIds) };
}

it("covers every standalone block type in the schema", () => {
  expect(fixtures.map(b => b.type).sort()).toEqual(Object.keys(blackDocSchema.blockSchema).filter(type => !["column", "splitColumn"].includes(type)).sort());
});

it.each(fixtures.flatMap(pane => ["blocknote/html", "text/html"].flatMap(format => ["menu", "marquee", "native", "cut"].map(mode => ({ pane, type: pane.type, format, mode })))))("preserves $type via $mode across editors using $format", ({ pane, type, format, mode }) => {
  const source = BlockNoteEditor.create({ schema: blackDocSchema, extensions: [SplitPaneExtension(), BlockMarqueeExtension(), BlockClipboardExtension()], initialContent: [pane, { id: "companion", type: "paragraph", content: "同行复制块", children: [{ type: "bulletListItem", content: "同行子块" }] }] });
  const target = BlockNoteEditor.create({ schema: blackDocSchema, extensions: [SplitPaneExtension()], initialContent: [{ type: "paragraph" }], pasteHandler: ({ editor, event, defaultPasteHandler }) => pasteBlockClipboard(editor, event.clipboardData) || defaultPasteHandler() });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  render(<BlockNoteView editor={source} />);
  target.mount(document.body.appendChild(document.createElement("div")));
  const exporter = BlockNoteEditor.create({ schema: blackDocSchema });
  vi.spyOn(source, "blocksToHTMLLossy").mockImplementation(blocks => exporter.blocksToHTMLLossy(blocks));
  vi.spyOn(source, "blocksToMarkdownLossy").mockImplementation(blocks => exporter.blocksToMarkdownLossy(blocks));
  const values = new Map<string, string>();
  const clipboard = { setData: (type: string, value: string) => values.set(type, value), getData: (type: string) => values.get(type) ?? "", clearData: () => values.clear() };
  Object.defineProperty(document, "execCommand", { configurable: true, value: () => {
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboard });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  } });
  try {
    const expected = withoutBlockIds(source.getBlock(pane.id!)!);
    const companion = withoutBlockIds(source.getBlock("companion")!);
    vi.stubGlobal("ClipboardEvent", Event);
    if (mode === "menu") expect(copyBlockToClipboard(source, pane.id!)).toBe(true);
    else if (mode === "marquee") {
      const marquee = getBlockMarquee(source)!;
      marquee.select([pane.id!, "companion"]);
      marquee.writeClipboard(clipboard as unknown as DataTransfer);
    } else {
      const view = source.prosemirrorView;
      const node = getNodeById(pane.id!, view.state.doc)!;
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, node.posBeforeNode)));
      const copy = new Event(mode === "cut" ? "cut" : "copy", { bubbles: true, cancelable: true });
      Object.defineProperty(copy, "clipboardData", { value: clipboard });
      view.dom.dispatchEvent(copy);
      expect(copy.defaultPrevented).toBe(true);
    }
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { ...clipboard, types: [format] } });
    target.prosemirrorView.dom.dispatchEvent(paste);
    const result = target.document.find(b => b.type === type);
    expect(result && withoutBlockIds(result)).toEqual(expected);
    if (mode === "marquee") expect(target.document.slice(0, 2).map(withoutBlockIds)).toEqual([expected, companion]);
  } finally { cleanup(); source._tiptapEditor.destroy(); target._tiptapEditor.destroy(); exporter._tiptapEditor.destroy(); vi.unstubAllGlobals(); }
});
