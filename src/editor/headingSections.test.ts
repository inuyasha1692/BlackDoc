import { BlockNoteEditor } from "@blocknote/core";
import { afterEach, describe, expect, it } from "vitest";
import { HeadingSectionsExtension, REVEAL_HEADING_SECTION, RESET_DOCUMENT_FOLDS_META } from "./headingSections";
import { blackDocSchema, type BlackDocEditor, type BlackDocPartialBlock } from "./schema";

const editors: BlackDocEditor[] = [];
const heading = (id: string, level: number): BlackDocPartialBlock => ({ id, type: "heading", props: { level }, content: id });
const text = (id: string): BlackDocPartialBlock => ({ id, type: "paragraph", content: id });
function create(blocks: BlackDocPartialBlock[]) {
  const editor = BlockNoteEditor.create({ schema: blackDocSchema, extensions: [HeadingSectionsExtension()], initialContent: blocks });
  editor.mount(document.createElement("div"));
  editors.push(editor);
  return editor;
}
const outer = (editor: BlackDocEditor, id: string) => editor.prosemirrorView.dom.querySelector<HTMLElement>(`.bn-block-outer[data-id="${id}"]`)!;
const hidden = (editor: BlackDocEditor, id: string) => outer(editor, id).classList.contains("heading-section-hidden");
const toggle = (editor: BlackDocEditor, id: string) => outer(editor, id).querySelector<HTMLButtonElement>(".bn-toggle-button")!.click();
afterEach(() => {
  for (const editor of editors.splice(0)) editor._tiptapEditor.destroy();
  localStorage.clear();
});

describe("automatic heading sections", () => {
  it("uses Ctrl+0 to convert a heading to body text while preserving content and undo", () => {
    const editor = create([{ id: "title", type: "heading", props: { level: 3 },
      content: [{ type: "text", text: "保留格式", styles: { bold: true } }], children: [text("child")] }]);
    const before = structuredClone(editor.getBlock("title")!);
    editor.setTextCursorPosition("title", "end");
    expect(editor._tiptapEditor.commands.keyboardShortcut("Mod-0")).toBe(true);
    const after = editor.getBlock("title")!;
    expect(after.type).toBe("paragraph");
    expect(after.content).toEqual(before.content);
    expect(after.children).toEqual(before.children);
    expect(editor.undo()).toBe(true);
    expect(editor.getBlock("title")!.type).toBe("heading");
  });
  it("opens headings and toggle lists expanded despite previously saved folds", () => {
    localStorage.setItem("toggle-title", "false");
    localStorage.setItem("toggle-list", "false");
    const editor = create([heading("title", 1), { id: "list", type: "toggleListItem", content: "折叠列表", children: [text("child")] }]);
    expect(hidden(editor, "list")).toBe(false);
    for (const id of ["title", "list"]) {
      expect(outer(editor, id).querySelector(".bn-toggle-wrapper")?.getAttribute("data-show-children")).toBe("true");
    }
    toggle(editor, "title");
    expect(hidden(editor, "list")).toBe(true);
  });

  it("resets folds when reopening the same document in the existing editor", () => {
    const editor = create([heading("title", 1), { id: "list", type: "toggleListItem", content: "折叠列表", children: [text("child")] }]);
    const blocks = structuredClone(editor.document);
    toggle(editor, "list");
    toggle(editor, "title");
    editor.transact(tr => {
      tr.setMeta(RESET_DOCUMENT_FOLDS_META, true);
      editor.replaceBlocks(editor.document, blocks);
    });
    expect(hidden(editor, "list")).toBe(false);
    expect(outer(editor, "list").querySelector(".bn-toggle-wrapper")?.getAttribute("data-show-children")).toBe("true");
    expect(outer(editor, "title").querySelector(".bn-toggle-wrapper")?.getAttribute("data-show-children")).toBe("true");
    expect(editor.document).toEqual(blocks);
  });
  it("folds all lower-level headings and body blocks until the next peer", () => {
    const editor = create([heading("h1", 1), text("intro"), heading("h2", 2), text("body"), heading("h3", 3), text("detail"), heading("peer", 2), text("peer-body"), heading("next", 1)]);
    const original = editor.document;
    toggle(editor, "h2");
    expect(["body", "h3", "detail"].map(id => hidden(editor, id))).toEqual([true, true, true]);
    expect(hidden(editor, "peer")).toBe(false);
    toggle(editor, "h1");
    expect(hidden(editor, "peer")).toBe(true);
    expect(hidden(editor, "next")).toBe(false);
    toggle(editor, "h1");
    expect(hidden(editor, "h2")).toBe(false);
    expect(hidden(editor, "body")).toBe(true);
    expect(editor.document).toEqual(original);
  });

  it.each([1, 2, 3, 4, 5, 6])("lets H%s fold its following body without manual nesting", level => {
    const editor = create([heading("title", level), text("body"), heading("peer", level)]);
    expect(hidden(editor, "body")).toBe(false);
    toggle(editor, "title");
    expect(hidden(editor, "body")).toBe(true);
    expect(hidden(editor, "peer")).toBe(false);
    toggle(editor, "title");
    expect(hidden(editor, "body")).toBe(false);
  });

  it("recalculates boundaries after changing a heading level and undoing it", () => {
    const editor = create([heading("title", 2), text("body"), heading("other", 3), text("other-body")]);
    toggle(editor, "title");
    expect(hidden(editor, "other")).toBe(true);
    editor.updateBlock("other", { props: { level: 2 } });
    expect(hidden(editor, "other")).toBe(false);
    expect(hidden(editor, "other-body")).toBe(false);
    editor.undo();
    expect(hidden(editor, "other")).toBe(true);
  });

  it("does not fold across separate split columns", () => {
    const editor = create([{ id: "pane", type: "splitPane", children: [
      { id: "left", type: "splitColumn", props: { side: "left" }, children: [heading("left-title", 2), text("left-body")] },
      { id: "right", type: "splitColumn", props: { side: "right" }, children: [text("right-body")] },
    ] }]);
    toggle(editor, "left-title");
    expect(hidden(editor, "left-body")).toBe(true);
    expect(hidden(editor, "right-body")).toBe(false);
  });

  it("reveals collapsed enclosing headings before outline navigation", () => {
    const editor = create([heading("h1", 1), heading("h3", 3), text("body")]);
    toggle(editor, "h3");
    toggle(editor, "h1");
    outer(editor, "body").dispatchEvent(new CustomEvent(REVEAL_HEADING_SECTION, { bubbles: true, detail: "body" }));
    expect(hidden(editor, "h3")).toBe(false);
    expect(hidden(editor, "body")).toBe(false);
  });

  it("retains existing list nesting and handles newly inserted section content", () => {
    const editor = create([heading("title", 1), { id: "list", type: "bulletListItem", content: "列表", children: [text("nested")] }, heading("next", 1)]);
    toggle(editor, "title");
    editor.insertBlocks([text("inserted")], "list", "after");
    expect(hidden(editor, "inserted")).toBe(true);
    expect(hidden(editor, "nested")).toBe(true);
    expect(editor.getBlock("list")!.children[0].id).toBe("nested");
    toggle(editor, "title");
    expect(hidden(editor, "inserted")).toBe(false);
  });

  it("keeps folding as a view change after DOM observers run", async () => {
    const editor = create([heading("title", 1), text("body"), heading("next", 1)]);
    const original = structuredClone(editor.document);
    toggle(editor, "title");
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(hidden(editor, "body")).toBe(true);
    expect(outer(editor, "title").querySelector(".bn-toggle-button")?.getAttribute("aria-expanded")).toBe("false");
    expect(editor.document).toEqual(original);
    editor.setTextCursorPosition("title", "end");
    editor._tiptapEditor.commands.insertContent("编辑");
    expect(hidden(editor, "body")).toBe(true);
    expect(hidden(editor, "next")).toBe(false);
  });

  it("moves a cursor out of folded body text and opens the section when continuing on Enter", () => {
    const editor = create([heading("title", 1), text("body"), heading("next", 1)]);
    editor.setTextCursorPosition("body", "end");
    toggle(editor, "title");
    expect(editor.getTextCursorPosition().block.id).toBe("title");
    expect(hidden(editor, "body")).toBe(true);
    const view = editor.prosemirrorView;
    view.someProp("handleKeyDown", handler => handler(view, new KeyboardEvent("keydown", { key: "Enter" })));
    expect(editor.getTextCursorPosition().block.type).toBe("paragraph");
    expect(hidden(editor, "body")).toBe(false);
  });
});
