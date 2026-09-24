import { BlockNoteEditor } from "@blocknote/core";
import { afterEach, describe, expect, it } from "vitest";
import { blackDocSchema } from "./schema";
import { FindAndReplaceExtension } from "./findAndReplace";

const editors: ReturnType<typeof BlockNoteEditor.create>[] = [];

afterEach(() => {
  editors.splice(0).forEach((editor) => editor._tiptapEditor.destroy());
  document.body.replaceChildren();
});

function createEditor() {
  const editor = BlockNoteEditor.create({
    schema: blackDocSchema,
    extensions: [FindAndReplaceExtension()],
    initialContent: [
      { id: "before", type: "paragraph", content: "Target before" },
      { id: "pane", type: "splitPane", children: [
        { id: "left-column", type: "splitColumn", props: { side: "left" }, children: [
          { id: "left", type: "paragraph", content: "Left target" },
        ] },
        { id: "right-column", type: "splitColumn", props: { side: "right" }, children: [
          { id: "right", type: "paragraph", content: "Right target" },
        ] },
      ] },
    ],
  });
  editor.mount(document.body.appendChild(document.createElement("div")));
  editors.push(editor);
  return editor;
}

describe("find and replace extension", () => {
  it("finds matches across the document and both split columns", () => {
    const editor = createEditor();
    const tiptap = editor._tiptapEditor;
    tiptap.commands.setSearchTerm("target");
    expect(tiptap.storage.findAndReplace.results).toHaveLength(3);
    expect(tiptap.storage.findAndReplace.currentIndex).toBe(0);
    tiptap.commands.goToNextResult();
    expect(tiptap.storage.findAndReplace.currentIndex).toBe(1);
    tiptap.commands.goToNextResult();
    expect(tiptap.storage.findAndReplace.currentIndex).toBe(2);
    tiptap.commands.goToNextResult();
    expect(tiptap.storage.findAndReplace.currentIndex).toBe(0);
    tiptap.commands.clearSearch();
    expect(tiptap.storage.findAndReplace.results).toHaveLength(0);
  });

  it("replaces one or all matches while retaining valid native blocks", () => {
    const editor = createEditor();
    const tiptap = editor._tiptapEditor;
    tiptap.commands.setSearchTerm("target");
    tiptap.commands.setReplaceTerm("changed");
    tiptap.commands.goToNextResult();
    tiptap.commands.replace();
    expect(editor.getBlock("left")?.content).toEqual([
      expect.objectContaining({ text: "Left changed" }),
    ]);
    expect(tiptap.storage.findAndReplace.results).toHaveLength(2);
    tiptap.commands.replaceAll();
    expect(tiptap.storage.findAndReplace.results).toHaveLength(0);
    expect(editor.getBlock("before")?.content).toEqual([
      expect.objectContaining({ text: "changed before" }),
    ]);
    expect(editor.getBlock("right")?.content).toEqual([
      expect.objectContaining({ text: "Right changed" }),
    ]);
    expect(editor.document[1].type).toBe("splitPane");
  });
});
