import { BlockNoteEditor, blockToNode } from "@blocknote/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blackDocSchema, type BlackDocEditor, type BlackDocPartialBlock } from "./schema";
import { SPLIT_DOCUMENT_REPLACE_META, SplitPaneExtension } from "./splitPaneExtension";
import { OptimizedTrailingNodeExtension } from "./trailingNodeExtension";

const editors: BlackDocEditor[] = [];
const pane = (content: BlackDocPartialBlock[] = [{ id: "left-text", type: "paragraph", content: "Left" }]): BlackDocPartialBlock => ({
  id: "pane",
  type: "splitPane",
  children: [
    { id: "left", type: "splitColumn", props: { side: "left" }, children: content },
    { id: "right", type: "splitColumn", props: { side: "right" }, children: [{ id: "right-text", type: "paragraph", content: "" }] },
  ],
});

function createEditor(block = pane(), optimizeTrailingNode = false) {
  const editor = BlockNoteEditor.create({
    schema: blackDocSchema,
    disableExtensions: optimizeTrailingNode ? ["trailingNode"] : [],
    extensions: optimizeTrailingNode
      ? [SplitPaneExtension(), OptimizedTrailingNodeExtension()]
      : [SplitPaneExtension()],
    initialContent: [block, { id: "after", type: "paragraph", content: "After" }],
  });
  editor.mount(document.createElement("div"));
  editors.push(editor);
  return editor;
}

function position(editor: BlackDocEditor, id: string) {
  let result = -1;
  editor._tiptapEditor.state.doc.descendants((node, pos) => {
    if (node.type.name === "blockContainer" && node.attrs.id === id) result = pos;
  });
  if (result < 0) throw new Error(`Missing block ${id}`);
  return result;
}

function replacePane(editor: BlackDocEditor, replacement: BlackDocPartialBlock) {
  const { state, view } = editor._tiptapEditor;
  const pos = position(editor, "pane");
  view.dispatch(state.tr.replaceWith(pos, pos + state.doc.nodeAt(pos)!.nodeSize, blockToNode(replacement, state.schema)));
}

function paste(editor: BlackDocEditor, html: string, format = "text/html") {
  // jsdom lacks ClipboardEvent, which ProseMirror constructs during pasteHTML.
  vi.stubGlobal("ClipboardEvent", Event);
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { types: [format], getData: (type: string) => type === format ? html : "" },
  });
  editor._tiptapEditor.view.dom.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
}

function paneHTML(editor: BlackDocEditor) {
  editor.elementRenderer = (node, container) => {
    container.innerHTML = renderToStaticMarkup(node);
  };
  return editor.blocksToFullHTML([editor.getBlock("pane")!]);
}

function expectUniqueIds(editor: BlackDocEditor) {
  const ids: string[] = [];
  editor._tiptapEditor.state.doc.descendants(node => {
    if (node.type.name !== "blockContainer") return;
    expect(node.attrs.id).toEqual(expect.any(String));
    expect(node.attrs.id).not.toBe("");
    ids.push(node.attrs.id);
  });
  expect(new Set(ids).size).toBe(ids.length);
}

afterEach(() => {
  editors.splice(0).forEach(editor => editor._tiptapEditor.destroy());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ordinary heading drop transactions", () => {
  it.each([4, 5, 6] as const)("allows H%s moves in both directions with and without a pane", level => {
    for (const withPane of [false, true]) {
      const editor = createEditor(withPane ? pane() : { id: "first", type: "paragraph" });
      editor.insertBlocks([
        { id: "h4", type: "heading", props: { level: 4 }, content: "Fourth" },
        { id: "h5", type: "heading", props: { level: 5 }, content: "Fifth" },
        { id: "h6", type: "heading", props: { level: 6 }, content: "Sixth" },
      ], "after", "before");
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      const id = `h${level}`;
      const original = editor.getBlock(id)!;

      for (const direction of ["up", "down"]) {
        const { view } = editor._tiptapEditor;
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position(editor, id))));
        const { state } = view;
        const slice = state.selection.content();
        const insertPos = direction === "up" ? 1 : position(editor, "after");
        // Mirror prosemirror-view's same-editor handleDrop: delete and insert
        // share one transaction, with the destination mapped after deletion.
        const tr = state.tr.deleteSelection();
        const pos = tr.mapping.map(insertPos);
        tr.replaceRangeWith(pos, pos, slice.content.firstChild!);
        tr.setSelection(NodeSelection.create(tr.doc, pos));
        tr.setMeta("uiEvent", "drop");
        view.dispatch(tr);

        expect(view.state.doc.eq(tr.doc)).toBe(true);
        const ids = editor.document.map(block => block.id);
        expect(ids.indexOf(id)).toBe(direction === "up" ? 0 : ids.indexOf("after") - 1);
        expect(editor.getBlock(id)).toEqual(original);
        expectUniqueIds(editor);
      }
      expect(confirm).not.toHaveBeenCalled();
      confirm.mockRestore();
    }
  });
});

describe("native split pane paste", () => {
  it.each(["outside", "column"])("pastes multiple blocks %s and lets BlockNote assign IDs", target => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const editor = createEditor();
    editor.updateBlock("after", { content: [] });
    editor.setTextCursorPosition(target === "column" ? "right-text" : "after", "start");
    paste(editor, "<p>First</p><p>Second</p><p>Third</p>");
    const blocks = target === "column" ? editor.getBlock("right")!.children : editor.document.slice(1);
    expect(blocks.map(block => block.content)).toEqual(
      ["First", "Second", "Third"].map(text => [{ type: "text", text, styles: {} }]),
    );
    expectUniqueIds(editor);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("pastes a whole pane with new IDs and supports undo/redo without prompting", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const editor = createEditor();
    const original = editor.getBlock("pane")!;
    const html = paneHTML(editor);
    editor.setTextCursorPosition("after", "end");
    const before = editor._tiptapEditor.state.doc;
    paste(editor, html, "blocknote/html");
    const panes: typeof original[] = [];
    editor.forEachBlock(block => {
      if (block.type === "splitPane") panes.push(block);
      return true;
    });
    expect(panes).toHaveLength(2);
    expect(panes[0]).toEqual(original);
    expect(panes[1].children.map(column => column.props)).toEqual(
      original.children.map(column => column.props),
    );
    expect(panes[1].children[0].children[0].content).toEqual(original.children[0].children[0].content);
    expectUniqueIds(editor);
    expect(editor._tiptapEditor.view.dom.querySelectorAll(".split-pane-editor")).toHaveLength(2);
    expect(editor._tiptapEditor.view.dom.querySelectorAll(".split-pane-column")).toHaveLength(4);
    const pasted = editor._tiptapEditor.state.doc;
    editor.undo();
    expect(editor._tiptapEditor.state.doc.eq(before)).toBe(true);
    editor.redo();
    expect(editor._tiptapEditor.state.doc.eq(pasted)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("still rejects a pasted pane inside a column despite its temporary missing IDs", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const editor = createEditor();
    const html = paneHTML(editor);
    editor.setTextCursorPosition("right-text", "start");
    const before = editor._tiptapEditor.state.doc;
    paste(editor, html, "blocknote/html");
    expect(editor._tiptapEditor.state.doc.eq(before)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("split pane structural protection", () => {
  it("does not traverse the document for a paragraph edit", () => {
    const editor = createEditor(pane(), true);
    editor.setTextCursorPosition("left-text", "end");
    const descendants = vi.spyOn(PMNode.prototype, "descendants");

    const { state, view } = editor._tiptapEditor;
    view.dispatch(state.tr.insertText("x"));

    expect(descendants).not.toHaveBeenCalled();
    descendants.mockRestore();
  });

  it("updates the trailing widget when typing into the last empty paragraph", () => {
    const editor = BlockNoteEditor.create({
      schema: blackDocSchema,
      disableExtensions: ["trailingNode"],
      extensions: [OptimizedTrailingNodeExtension()],
      initialContent: [{ id: "last", type: "paragraph", content: "" }],
    });
    editor.mount(document.createElement("div"));
    editors.push(editor);
    expect(editor._tiptapEditor.view.dom.querySelector(".bn-trailing-block")).toBeNull();

    editor.setTextCursorPosition("last", "end");
    const { state, view } = editor._tiptapEditor;
    view.dispatch(state.tr.insertText("x"));

    expect(editor._tiptapEditor.view.dom.querySelector(".bn-trailing-block")).not.toBeNull();
    const descendants = vi.spyOn(PMNode.prototype, "descendants");
    const nextState = view.state;
    view.dispatch(nextState.tr.insertText("y"));
    expect(descendants).not.toHaveBeenCalled();
    descendants.mockRestore();
  });

  it("preserves numbered-list indices while typing and refreshes them after insertion", () => {
    const editor = BlockNoteEditor.create({
      schema: blackDocSchema,
      disableExtensions: ["trailingNode"],
      extensions: [OptimizedTrailingNodeExtension()],
      initialContent: [
        { id: "first-item", type: "numberedListItem", content: "First" },
        { id: "second-item", type: "numberedListItem", content: "Second" },
      ],
    });
    editor.mount(document.createElement("div"));
    editors.push(editor);
    const indexedItem = (id: string) => editor._tiptapEditor.view.dom
      .querySelector<HTMLElement>(`.bn-block-outer[data-id="${id}"] .bn-block-content`);
    expect(indexedItem("first-item")?.getAttribute("data-index")).toBe("1");
    expect(indexedItem("second-item")?.getAttribute("data-index")).toBe("2");

    editor.setTextCursorPosition("first-item", "end");
    const descendants = vi.spyOn(PMNode.prototype, "descendants");
    const { state, view } = editor._tiptapEditor;
    view.dispatch(state.tr.insertText(" edited"));
    expect(descendants).not.toHaveBeenCalled();
    descendants.mockRestore();

    editor.insertBlocks(
      [{ id: "inserted-item", type: "numberedListItem", content: "Inserted" }],
      "first-item",
      "before",
    );
    expect(indexedItem("inserted-item")?.getAttribute("data-index")).toBe("1");
    expect(indexedItem("first-item")?.getAttribute("data-index")).toBe("2");
    expect(indexedItem("second-item")?.getAttribute("data-index")).toBe("3");
  });

  it("allows regular content editing and layout props", () => {
    const editor = createEditor();
    editor.updateBlock("left-text", { content: "Edited", type: "heading" });
    editor.updateBlock("pane", { props: { leftWidth: 60, rightHeight: 500 } });
    expect(editor.getBlock("left-text")?.type).toBe("heading");
    expect(editor.getBlock("pane")?.props).toMatchObject({ leftWidth: 60, rightHeight: 500 });
  });

  it("allows native Enter and Backspace inside a column", () => {
    const editor = createEditor();
    editor.setTextCursorPosition("left-text", "end");
    editor._tiptapEditor.commands.keyboardShortcut("Enter");
    expect(editor.getBlock("left")?.children).toHaveLength(2);
    editor._tiptapEditor.commands.keyboardShortcut("Backspace");
    expect(editor.getBlock("left")?.children).toHaveLength(1);
  });

  it.each(["left", "right"])("repairs deletion of the last paragraph in %s", side => {
    const confirm = vi.spyOn(window, "confirm");
    const editor = createEditor();
    editor.removeBlocks([`${side}-text`]);
    expect(editor.getBlock(side)?.children).toMatchObject([{ type: "paragraph", content: [] }]);
    expect(confirm).not.toHaveBeenCalled();
    editor.undo();
    expect(editor.getBlock(`${side}-text`)).toBeDefined();
    editor.redo();
    expect(editor.getBlock(side)?.children).toMatchObject([{ type: "paragraph", content: [] }]);
  });

  it.each(["pane", "left", "right"])("rejects changing %s into a regular content type", id => {
    const editor = createEditor();
    const before = editor._tiptapEditor.state.doc;
    editor.updateBlock(id, { type: "paragraph" });
    expect(editor._tiptapEditor.state.doc.eq(before)).toBe(true);
  });

  it.each(["left", "right"])("rejects removing the %s wrapper", id => {
    const editor = createEditor();
    const before = editor._tiptapEditor.state.doc;
    editor.removeBlocks([id]);
    expect(editor._tiptapEditor.state.doc.eq(before)).toBe(true);
  });

  it("rejects standalone columns", () => {
    const editor = createEditor();
    editor.insertBlocks([{ type: "splitColumn", props: { side: "left" } }], "after", "after");
    expect(editor.document).toHaveLength(2);
  });

  it("rejects inserting a pane with a missing column", () => {
    const editor = createEditor();
    editor.insertBlocks([{ id: "incomplete", type: "splitPane" }], "after", "after");
    expect(editor.getBlock("incomplete")).toBeUndefined();
  });

  it("repairs newly inserted empty columns and undoes the whole insertion", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const editor = createEditor({ id: "first", type: "paragraph" });
    const block = pane([]);
    block.children![1].children = [];
    editor.insertBlocks([block], "first", "after");
    expect(editor.getBlock("left")?.children).toMatchObject([{ type: "paragraph", content: [] }]);
    expect(editor.getBlock("right")?.children).toMatchObject([{ type: "paragraph", content: [] }]);
    editor.undo();
    expect(editor.getBlock("pane")).toBeUndefined();
    editor.redo();
    expect(editor.getBlock("left")?.children).toHaveLength(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([false, true])("rejects reversed wrappers even when side props are rewritten: %s", rewriteSides => {
    const editor = createEditor();
    const before = editor._tiptapEditor.state.doc;
    const replacement = pane();
    replacement.children!.reverse();
    if (rewriteSides) replacement.children!.forEach((column, index) => {
      column.props = { side: index === 0 ? "left" : "right" };
    });
    replacePane(editor, replacement);
    expect(editor._tiptapEditor.state.doc.eq(before)).toBe(true);
  });

  it("rejects replacing a wrapper identity", () => {
    const editor = createEditor();
    const before = editor._tiptapEditor.state.doc;
    const replacement = pane();
    replacement.children![0].id = "new-left";
    replacePane(editor, replacement);
    expect(editor._tiptapEditor.state.doc.eq(before)).toBe(true);
  });

  it.each([false, true])("rejects a nested pane, including below a regular descendant: %s", deep => {
    const editor = createEditor();
    const nested = pane();
    nested.id = "nested-pane";
    nested.children!.forEach((column, index) => { column.id = `nested-${index}`; column.children = []; });
    const before = editor._tiptapEditor.state.doc;
    editor.updateBlock(deep ? "left-text" : "left", { children: [nested] });
    expect(editor._tiptapEditor.state.doc.eq(before)).toBe(true);
  });

  it("allows moving a regular block between columns and out of the pane", () => {
    const confirm = vi.spyOn(window, "confirm");
    const editor = createEditor();
    editor.transact(() => {
      const block = editor.getBlock("left-text")!;
      editor.removeBlocks(["left-text"]);
      editor.insertBlocks([block], "right-text", "after");
    });
    expect(editor.getBlock("right")?.children.map(block => block.id)).toContain("left-text");
    expect(editor.getBlock("left")?.children).toMatchObject([{ type: "paragraph", content: [] }]);
    editor.transact(() => {
      const block = editor.getBlock("left-text")!;
      editor.removeBlocks(["left-text"]);
      editor.insertBlocks([block], "after", "after");
    });
    expect(editor.document.map(block => block.id)).toContain("left-text");
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("split pane deletion confirmation", () => {
  it.each(["api", "selection", "backspace"] as const)("cancels %s deletion without document or selection mutation", method => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const editor = createEditor();
    const { view } = editor._tiptapEditor;
    if (method !== "api") {
      const { state } = editor._tiptapEditor;
      view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, position(editor, "pane"))));
    }
    const before = editor._tiptapEditor.state;
    if (method === "api") editor.removeBlocks(["pane"]);
    else if (method === "backspace") editor._tiptapEditor.commands.keyboardShortcut("Backspace");
    else view.dispatch(before.tr.deleteSelection());
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("确定删除"));
    expect(editor._tiptapEditor.state.doc.eq(before.doc)).toBe(true);
    expect(editor._tiptapEditor.state.selection.eq(before.selection)).toBe(true);
  });

  it("confirms once and allows undo/redo without another prompt", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const editor = createEditor();
    editor.removeBlocks(["pane"]);
    expect(editor.getBlock("pane")).toBeUndefined();
    editor.undo();
    expect(editor.getBlock("pane")?.type).toBe("splitPane");
    editor.redo();
    expect(editor.getBlock("pane")).toBeUndefined();
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("allows deletion of blank paragraphs without confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const editor = createEditor(pane([{ type: "paragraph", content: "  \n " }]));
    editor.removeBlocks(["pane"]);
    expect(editor.getBlock("pane")).toBeUndefined();
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(["image", "video", "audio", "file", "table", "canvas"] as const)("counts %s as content", type => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const block: BlackDocPartialBlock = type === "table"
      ? { type, content: { type: "tableContent", rows: [{ cells: [""] }] } }
      : { type };
    const editor = createEditor(pane([block]));
    editor.removeBlocks(["pane"]);
    expect(editor.getBlock("pane")).toBeDefined();
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("cancels a document-wide text selection deletion", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const editor = createEditor({
      id: "before", type: "paragraph", content: "Before",
    });
    editor.insertBlocks([pane()], "before", "after");
    const { state, view } = editor._tiptapEditor;
    const start = position(editor, "before") + 2;
    const end = position(editor, "after") + 2 + "After".length;
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, end)));
    const before = editor._tiptapEditor.state;
    view.dispatch(before.tr.deleteSelection());
    expect(editor._tiptapEditor.state.doc.eq(before.doc)).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("allows Backspace to delete the last selected column paragraph and repairs it", () => {
    const confirm = vi.spyOn(window, "confirm");
    const editor = createEditor();
    const { state, view } = editor._tiptapEditor;
    view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, position(editor, "left-text"))));
    editor._tiptapEditor.commands.keyboardShortcut("Backspace");
    expect(editor.getBlock("left-text")).toBeUndefined();
    expect(editor.getBlock("left")?.children).toMatchObject([{ type: "paragraph", content: [] }]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("confirms deletion through an enclosing ordinary block", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const editor = createEditor({ id: "ancestor", type: "paragraph", children: [pane()] });
    editor.removeBlocks(["ancestor"]);
    expect(editor.getBlock("pane")).toBeDefined();
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("allows normal text selection deletion inside a column", () => {
    const confirm = vi.spyOn(window, "confirm");
    const editor = createEditor();
    const { state, view } = editor._tiptapEditor;
    const start = position(editor, "left-text") + 2;
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, start + 4)).deleteSelection());
    expect(editor.getBlock("left-text")?.content).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("bypasses confirmation and validation for explicit document replacement", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const editor = createEditor();
    editor.transact(tr => {
      tr.setMeta(SPLIT_DOCUMENT_REPLACE_META, true);
      editor.replaceBlocks(editor.document, [{ id: "loaded", type: "paragraph", content: "Loaded" }]);
    });
    expect(editor.document).toMatchObject([{ id: "loaded" }]);
    expect(confirm).not.toHaveBeenCalled();
    // The flag deliberately trusts upstream validation, even for structural input.
    editor.transact(tr => {
      tr.setMeta(SPLIT_DOCUMENT_REPLACE_META, true);
      editor.replaceBlocks(editor.document, [{ id: "trusted", type: "splitColumn", props: { side: "left" } }]);
    });
    expect(editor.getBlock("trusted")?.type).toBe("splitColumn");
    expect(editor.getBlock("trusted")?.children).toEqual([]);
  });
});
