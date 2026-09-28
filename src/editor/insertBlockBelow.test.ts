import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { afterEach, expect, it, vi } from "vitest";
import { insertBlockBelowFromMenu } from "./insertBlockBelow";

const editors: BlockNoteEditor[] = [];
afterEach(() => { editors.splice(0).forEach(editor => editor._tiptapEditor.destroy()); });

it.each(["paragraph", "image", "table"] as const)("inserts a heading below a %s without converting the original block and undoes in one step", type => {
  const target: PartialBlock = type === "table"
    ? { id: "target", type: "table", content: { type: "tableContent", rows: [{ cells: ["表格内容"] }] } }
    : type === "paragraph" ? { id: "target", type, content: "原有内容" } : { id: "target", type };
  const editor = BlockNoteEditor.create({ initialContent: [
    target,
    { id: "next", type: "paragraph", content: "后续内容" },
  ] });
  editors.push(editor);
  editor.mount(document.createElement("div"));
  const before = JSON.stringify(editor.document);
  expect(insertBlockBelowFromMenu(editor, "target", () => {
    insertOrUpdateBlockForSlashMenu(editor, { type: "heading", props: { level: 2 }, content: "新标题" });
  })).toBe(true);
  expect(editor.document.map(block => block.type)).toEqual([type, "heading", "paragraph"]);
  expect(editor.document[0].id).toBe("target");
  expect(editor.document[2].id).toBe("next");
  expect(editor.getTextCursorPosition().block.id).toBe(editor.document[1].id);
  editor.undo();
  expect(JSON.stringify(editor.document)).toBe(before);
});

it("inserts a sibling at the same nested level", () => {
  const editor = BlockNoteEditor.create({ initialContent: [
    { id: "parent", type: "bulletListItem", content: "父项", children: [
      { id: "target", type: "paragraph", content: "子项" },
      { id: "next", type: "paragraph", content: "下一子项" },
    ] },
  ] });
  editors.push(editor);
  editor.mount(document.createElement("div"));
  insertBlockBelowFromMenu(editor, "target", () => {
    insertOrUpdateBlockForSlashMenu(editor, { type: "image", props: { url: "image.png" } });
  });
  expect(editor.document).toHaveLength(1);
  expect(editor.document[0].children.map(block => block.type)).toEqual(["paragraph", "image", "paragraph"]);
  expect(editor.document[0].children[2].id).toBe("next");
});

it("does not insert when the target was removed or the editor is read only", () => {
  const editor = BlockNoteEditor.create({ initialContent: [{ id: "target", type: "paragraph", content: "正文" }] });
  editors.push(editor);
  editor.mount(document.createElement("div"));
  const create = vi.fn();
  const before = JSON.stringify(editor.document);
  expect(insertBlockBelowFromMenu(editor, "removed", create)).toBe(false);
  editor.isEditable = false;
  expect(insertBlockBelowFromMenu(editor, "target", create)).toBe(false);
  expect(create).not.toHaveBeenCalled();
  expect(JSON.stringify(editor.document)).toBe(before);
});
