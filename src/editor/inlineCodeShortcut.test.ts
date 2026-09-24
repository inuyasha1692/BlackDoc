import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { blackDocSchema } from "./schema";

describe("inline code shortcut", () => {
  it("toggles inline code for the selected text with Mod-E", () => {
    const editor = BlockNoteEditor.create({
      schema: blackDocSchema,
      initialContent: [{ type: "paragraph", content: "sample" }],
    });

    try {
      editor.mount(document.createElement("div"));
      editor._tiptapEditor.commands.setTextSelection({ from: 1, to: 7 });
      editor._tiptapEditor.commands.keyboardShortcut("Mod-e");

      expect(editor.document[0].content).toEqual([
        { type: "text", text: "samp", styles: { code: true } },
        { type: "text", text: "le", styles: {} },
      ]);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });
});
