import { BlockNoteEditor } from "@blocknote/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blackDocSchema, type BlackDocEditor, type BlackDocPartialBlock } from "./schema";
import { BlockMarqueeExtension, blocksInRectangle, getBlockMarquee, moveMarqueeBlocks } from "./blockMarquee";
import { SplitPaneExtension } from "./splitPaneExtension";

const editors: BlackDocEditor[] = [];
const paragraph = (id: string): BlackDocPartialBlock => ({ id, type: "paragraph", content: id });
const column = (id: string, children: BlackDocPartialBlock[]): BlackDocPartialBlock => ({ id, type: "column", children });
function create(initialContent: BlackDocPartialBlock[]) {
  const editor = BlockNoteEditor.create({ schema: blackDocSchema,
    extensions: [BlockMarqueeExtension(), SplitPaneExtension()], initialContent });
  const host = document.createElement("div");
  host.className = "editor-region";
  document.body.append(host);
  editor.mount(host);
  editors.push(editor);
  return editor;
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor._tiptapEditor.destroy();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("block marquee operations", () => {
  it("moves only the selected children across columns and restores the layout in one undo", () => {
    const editor = create([{ id: "layout", type: "columnList", children: [
      column("left", [paragraph("a"), paragraph("b")]),
      column("right", [paragraph("c"), paragraph("d")]),
    ] }, paragraph("target")]);
    getBlockMarquee(editor)!.select(["c", "b"]);
    expect(moveMarqueeBlocks(editor, ["c", "b"], "target", "after")).toBe(true);
    expect(editor.document.map(block => block.id).slice(0, 4)).toEqual(["layout", "target", "b", "c"]);
    expect(editor.getBlock("left")!.children.map(block => block.id)).toEqual(["a"]);
    expect(editor.getBlock("right")!.children.map(block => block.id)).toEqual(["d"]);
    expect(getBlockMarquee(editor)!.getSnapshot()).toEqual(["b", "c"]);
    expect(editor.undo()).toBe(true);
    expect(editor.getBlock("left")!.children.map(block => block.id)).toEqual(["a", "b"]);
    expect(editor.getBlock("right")!.children.map(block => block.id)).toEqual(["c", "d"]);
  });

  it("removes an emptied third column, then unwraps the remaining single column", () => {
    const editor = create([{ id: "layout", type: "columnList", children: [
      column("left", [paragraph("a")]), column("middle", [paragraph("b")]), column("right", [paragraph("c")]),
    ] }, paragraph("target")]);
    moveMarqueeBlocks(editor, ["a"], "target", "after");
    expect(editor.getBlock("layout")!.children.map(block => block.id)).toEqual(["middle", "right"]);
    moveMarqueeBlocks(editor, ["b"], "target", "after");
    expect(editor.getBlock("layout")).toBeUndefined();
    expect(editor.document.map(block => block.id).slice(0, 4)).toEqual(["c", "target", "b", "a"]);
  });

  it("moves the last selected child from several layouts without losing the other columns", () => {
    const editor = create([{ id: "one", type: "columnList", children: [
      column("one-left", [paragraph("a")]), column("one-right", [paragraph("b")]),
    ] }, { id: "two", type: "columnList", children: [
      column("two-left", [paragraph("c")]), column("two-right", [paragraph("d")]),
    ] }, paragraph("target")]);
    moveMarqueeBlocks(editor, ["a", "c"], "target", "after");
    expect(editor.document.map(block => block.id).slice(0, 5)).toEqual(["b", "d", "target", "a", "c"]);
  });

  it("keeps both split-pane sides when moving out their last children", () => {
    const editor = create([{ id: "pane", type: "splitPane", children: [
      { id: "left", type: "splitColumn", props: { side: "left" }, children: [paragraph("a")] },
      { id: "right", type: "splitColumn", props: { side: "right" }, children: [paragraph("b")] },
    ] }, paragraph("target")]);
    moveMarqueeBlocks(editor, ["a", "b"], "target", "after");
    expect(editor.getBlock("pane")!.children.map(block => block.id)).toEqual(["left", "right"]);
    for (const id of ["left", "right"]) {
      expect(editor.getBlock(id)!.children).toHaveLength(1);
      expect(editor.getBlock(id)!.children[0].content).toEqual([]);
    }
    expect(editor.undo()).toBe(true);
    expect(editor.getBlock("left")!.children[0].id).toBe("a");
    expect(editor.getBlock("right")!.children[0].id).toBe("b");
  });

  it("copies and deletes mixed blocks as a group with a single undo", () => {
    const editor = create([paragraph("a"), { id: "image", type: "image", props: { url: "data:image/png;base64,YQ==" } },
      { id: "table", type: "table", content: { type: "tableContent", rows: [{ cells: ["cell"] }] } }, paragraph("target")]);
    const selection = getBlockMarquee(editor)!;
    selection.select(["table", "a", "image"]);
    const data = new Map<string, string>();
    selection.writeClipboard({ setData: (type: string, value: string) => data.set(type, value) } as unknown as DataTransfer);
    expect(data.get("blocknote/html")).toContain('data-id="image"');
    expect(data.get("text/html")).toContain("<table");
    expect(data.get("text/plain")).toContain("cell");
    selection.remove();
    expect(editor.document[0].id).toBe("target");
    expect(editor.undo()).toBe(true);
    expect(editor.document.map(block => block.id).slice(0, 4)).toEqual(["a", "image", "table", "target"]);
  });

  it("selects an intersecting parent once and prevents moving it into its own child", () => {
    const editor = create([{ ...paragraph("parent"), children: [paragraph("child")] }, paragraph("target")]);
    const selection = getBlockMarquee(editor)!;
    selection.select(["child", "parent"]);
    expect(selection.getSnapshot()).toEqual(["parent"]);
    expect(selection.includes("child")).toBe(true);
    expect(moveMarqueeBlocks(editor, ["parent"], "child", "after")).toBe(false);
    expect(editor.getBlock("parent")!.children[0].id).toBe("child");
  });

  it("rectangle hits the actual children across columns instead of the layout container", () => {
    const editor = create([{ id: "layout", type: "columnList", children: [
      column("left", [paragraph("a"), paragraph("b")]), column("right", [paragraph("c"), paragraph("d")]),
    ] }]);
    for (const [id, left, top] of [["a", 100, 100], ["b", 100, 150], ["c", 300, 100], ["d", 300, 150]] as const) {
      const content = editor.prosemirrorView.dom.querySelector<HTMLElement>(`[data-id="${id}"] .bn-block-content`)!;
      const rect = { left, top, right: left + 100, bottom: top + 30 } as DOMRect;
      content.getBoundingClientRect = () => rect;
      content.getClientRects = () => [rect] as unknown as DOMRectList;
    }
    expect(blocksInRectangle(editor.prosemirrorView, { left: 95, top: 145, right: 405, bottom: 190 })).toEqual(["b", "d"]);
  });
});
