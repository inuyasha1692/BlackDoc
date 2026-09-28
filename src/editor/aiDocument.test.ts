import { describe, expect, it } from "vitest";
import { BlockNoteEditor } from "@blocknote/core";
import { blackDocSchema } from "./schema";
import { applyAiDocument } from "./aiDocument";

describe("AI document changes", () => {
  const create = () => BlockNoteEditor.create({ schema: blackDocSchema,
    initialContent: [{ id: "p", type: "paragraph", content: "Original" }] });
  it("applies changes immediately and preserves block IDs with undo", () => {
    const editor = create();
    editor.mount(document.createElement("div"));
    const original = editor.document;
    applyAiDocument(editor, { revision: "v1", blocks: [{ ...original[0], content: "Revised" }] }, "v1");
    expect(editor.document[0].id).toBe("p");
    expect(JSON.stringify(editor.document)).toContain("Revised");
    editor.undo();
    expect(editor.document).toEqual(original);
    editor._tiptapEditor.destroy();
  });
  it("rejects stale revisions and duplicate IDs without changing content", () => {
    const editor = create();
    const original = editor.document;
    expect(() => applyAiDocument(editor, { revision: "old", blocks: original }, "new")).toThrow("文档已变化");
    expect(() => applyAiDocument(editor, { revision: "v", blocks: [original[0], original[0]] }, "v")).toThrow("唯一 ID");
    expect(editor.document).toEqual(original);
    editor._tiptapEditor.destroy();
  });
  it("keeps AI undo separate from preceding and following manual edits", () => {
    const editor = create();
    editor.mount(document.createElement("div"));
    editor.updateBlock("p", { content: "Manual before" });
    applyAiDocument(editor, { revision: "v", blocks: [{ ...editor.document[0], content: "AI" }] }, "v");
    editor.updateBlock("p", { content: "Manual after" });
    editor.undo();
    expect(JSON.stringify(editor.document)).toContain('"text":"AI"');
    editor.undo();
    expect(JSON.stringify(editor.document)).toContain("Manual before");
    editor._tiptapEditor.destroy();
  });
  it("rejects unsupported blocks before editing the document", () => {
    const editor = create();
    const original = editor.document;
    expect(() => applyAiDocument(editor, { revision: "v", blocks: [{ id: "x", type: "unknown", children: [] }] }, "v")).toThrow();
    expect(editor.document).toEqual(original);
    editor._tiptapEditor.destroy();
  });
});
