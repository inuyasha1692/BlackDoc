import { BlockNoteEditor } from "@blocknote/core";
import { afterEach, expect, it } from "vitest";
import { changeImageIndent } from "./imageIndent";

const editors: BlockNoteEditor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor._tiptapEditor.destroy()));
const create = (imageFirst = false) => {
  const paragraph = { id: "text", type: "paragraph" as const, content: "Text" };
  const image = { id: "image", type: "image" as const, props: { url: "data:image/png;base64,YQ==", previewWidth: 120 } };
  const editor = BlockNoteEditor.create({ initialContent: imageFirst ? [image, paragraph] : [paragraph, image] });
  editors.push(editor);
  editor.mount(document.createElement("div"));
  return editor;
};

it("indents an image using block nesting and undoes each action separately", () => {
  const editor = create();
  const before = JSON.stringify(editor.document);
  expect(changeImageIndent(editor, "image", true)).toBe(true);
  expect(editor.document).toHaveLength(1);
  expect(editor.document[0].children[0].id).toBe("image");
  expect(editor.document[0].children[0].props).toMatchObject({ url: "data:image/png;base64,YQ==", previewWidth: 120 });
  const nested = JSON.stringify(editor.document);
  expect(changeImageIndent(editor, "image", false)).toBe(true);
  expect(JSON.stringify(editor.document)).toBe(before);
  editor.undo();
  expect(JSON.stringify(editor.document)).toBe(nested);
  editor.undo();
  expect(JSON.stringify(editor.document)).toBe(before);
});

it("disallows increasing a first image or decreasing a top-level image", () => {
  const editor = create(true);
  const before = JSON.stringify(editor.document);
  expect(changeImageIndent(editor, "image", true)).toBe(false);
  expect(changeImageIndent(editor, "image", false)).toBe(false);
  expect(JSON.stringify(editor.document)).toBe(before);
});

it("ignores missing blocks, text blocks, and read-only documents", () => {
  const editor = create();
  expect(changeImageIndent(editor, "missing", true)).toBe(false);
  expect(changeImageIndent(editor, "text", true)).toBe(false);
  editor.isEditable = false;
  expect(changeImageIndent(editor, "image", true)).toBe(false);
});
