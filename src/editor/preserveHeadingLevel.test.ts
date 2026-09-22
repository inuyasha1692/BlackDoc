import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { PreserveHeadingLevelExtension } from "./preserveHeadingLevel";

const createEditor = () => {
  const editor = BlockNoteEditor.create({
    extensions: [PreserveHeadingLevelExtension()],
    initialContent: [
      {
        id: "heading-2",
        type: "heading",
        props: { level: 2 },
        content: "",
      },
      {
        id: "heading-3",
        type: "heading",
        props: { level: 3 },
        content: "三级标题",
      },
    ],
  });

  editor.mount(document.createElement("div"));
  return editor;
};

describe("deleting a heading block", () => {
  it("preserves the following heading level when backspace removes the previous heading", () => {
    const editor = createEditor();
    editor.setTextCursorPosition("heading-3", "start");

    editor._tiptapEditor.commands.keyboardShortcut("Backspace");

    expect(editor.document).toHaveLength(1);
    expect(editor.document[0]).toMatchObject({
      type: "heading",
      props: { level: 3 },
      content: [{ type: "text", text: "三级标题" }],
    });

    editor._tiptapEditor.destroy();
  });

  it("keeps the native behavior when the previous heading is not empty", () => {
    const editor = createEditor();
    editor.updateBlock("heading-2", { content: "二级标题" });
    editor.setTextCursorPosition("heading-3", "start");

    editor._tiptapEditor.commands.keyboardShortcut("Backspace");

    expect(editor.document).toHaveLength(2);
    expect(editor.getBlock("heading-3")).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "三级标题" }],
    });

    editor._tiptapEditor.destroy();
  });

  it("restores the removed heading with undo", () => {
    const editor = createEditor();
    editor.setTextCursorPosition("heading-3", "start");

    editor._tiptapEditor.commands.keyboardShortcut("Backspace");
    editor.undo();

    expect(editor.document).toHaveLength(2);
    expect(editor.getBlock("heading-2")).toMatchObject({
      type: "heading",
      props: { level: 2 },
    });
    expect(editor.getBlock("heading-3")).toMatchObject({
      type: "heading",
      props: { level: 3 },
    });

    editor._tiptapEditor.destroy();
  });
});
