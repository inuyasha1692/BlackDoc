import { describe, expect, it, vi } from "vitest";
import { BlockNoteEditor } from "@blocknote/core";
import { blackDocSchema } from "./schema";
import { applyAiDocument, createAiRevision } from "./aiDocument";

const styled = (text: string) => ({ type: "text" as const, text, styles: { bold: true } });
const change = (blockId: string, text: string) => ({ op: "updateContent", blockId, content: [styled(text)] });

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

  it("updates a single character in a document over 16 MiB without replacing media or child blocks", () => {
    const url = "data:image/png;base64," + "A".repeat(17 * 1024 * 1024);
    const link = { type: "link" as const, href: "https://example.com", content: [styled("参考")] };
    const editor = BlockNoteEditor.create({ schema: blackDocSchema, initialContent: [
      { id: "h", type: "heading", props: { level: 2 }, content: [styled("原文"), link],
        children: [{ id: "list", type: "bulletListItem", content: "子块" }] },
      { id: "image", type: "image", props: { url } },
    ] });
    try {
      editor.mount(document.createElement("div"));
      const original = editor.document;
      expect(Buffer.byteLength(JSON.stringify(original))).toBeGreaterThan(16 * 1024 * 1024);
      const imageNode = editor.prosemirrorState.doc.firstChild!.child(1);
      const request = { revision: "v1", changes: [
        { op: "updateContent", blockId: "h", content: [styled("新文"), link] },
      ] };
      expect(Buffer.byteLength(JSON.stringify(request))).toBeLessThan(512);
      const replaceBlocks = vi.spyOn(editor, "replaceBlocks");
      const createEditor = vi.spyOn(BlockNoteEditor, "create");
      try {
        expect(applyAiDocument(editor, request, "v1")).toBe(true);
        expect(replaceBlocks).not.toHaveBeenCalled();
        expect(createEditor).not.toHaveBeenCalled();
      } finally {
        replaceBlocks.mockRestore();
        createEditor.mockRestore();
      }
      expect(editor.getBlock("h")).toEqual({ ...original[0], content: request.changes[0].content });
      expect(editor.prosemirrorState.doc.firstChild!.child(1)).toBe(imageNode);
      editor.undo();
      expect(editor.getBlock("h")).toEqual(original[0]);
      expect(editor.prosemirrorState.doc.firstChild!.child(1)).toBe(imageNode);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("commits a batch as one undo step between manual edits", () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema, initialContent: [
      { id: "p", type: "paragraph", content: "Original" },
      { id: "list", type: "numberedListItem", content: "Item" },
    ] });
    try {
      editor.mount(document.createElement("div"));
      editor.updateBlock("p", { content: "Manual before" });
      const before = editor.document;
      const changes = [change("p", "Updated"), change("list", "New item")];
      expect(applyAiDocument(editor, { revision: "v", changes }, "v")).toBe(true);
      expect(editor.getBlock("list")?.content).toEqual(changes[1].content);
      editor.updateBlock("p", { content: "Manual after" });
      editor.undo();
      expect(editor.getBlock("p")?.content).toEqual(changes[0].content);
      editor.undo();
      expect(editor.document).toEqual(before);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("rejects the entire batch if a later block is missing or an inline value is malformed", () => {
    const editor = create();
    try {
      const original = editor.prosemirrorState.doc;
      expect(() => applyAiDocument(editor, {
        revision: "v", changes: [change("p", "New text"), change("gone", "New text")],
      }, "v")).toThrow("未找到可修改的文本块");
      expect(() => applyAiDocument(editor, {
        revision: "v", changes: [change("p", "New text"), change("p", "Duplicate")],
      }, "v")).toThrow("同一块");
      expect(() => applyAiDocument(editor, {
        revision: "v", changes: [{ ...change("p", "New text"), content: [{ type: "text", text: {}, styles: {} }] }],
      }, "v")).toThrow("无效的文本块");
      expect(() => applyAiDocument(editor, {
        revision: "v", changes: [change("p", "New text")], blocks: editor.document,
      }, "v")).toThrow("一种修改格式");
      expect(editor.prosemirrorState.doc).toBe(original);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("keeps the revision during selection changes and no-op writes, but rejects stale edits after manual typing, undo or session changes", () => {
    const editor = create();
    try {
      editor.mount(document.createElement("div"));
      const getRevision = createAiRevision();
      const version = (key = "session", path: string | null = "original.bdoc") =>
        getRevision({ doc: editor.prosemirrorState.doc, key, path });
      const initial = version();
      editor.setTextCursorPosition("p", "end");
      expect(version()).toBe(initial);
      expect(applyAiDocument(editor, { revision: initial, changes: [
        { op: "updateContent", blockId: "p", content: editor.getBlock("p")?.content },
      ] }, version())).toBe(false);
      expect(version()).toBe(initial);
      editor.updateBlock("p", { content: "Manual" });
      const manual = version();
      expect(manual).not.toBe(initial);
      const staleEdit = { revision: initial, changes: [change("p", "Overwrite")] };
      expect(() => applyAiDocument(editor, staleEdit, manual)).toThrow("文档已变化");
      editor.undo();
      expect(version()).not.toBe(initial);
      const beforeSwitch = version();
      expect(() => applyAiDocument(editor, { ...staleEdit, revision: beforeSwitch }, version("next"))).toThrow("文档已变化");
      const beforeSaveAs = version("next");
      expect(version("next", "new-path.bdoc")).not.toBe(beforeSaveAs);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });
});
