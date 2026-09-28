import { BlockNoteEditor } from "@blocknote/core";
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { expect, it } from "vitest";

it("inserts a table through the BlockNote command", () => {
  const editor = BlockNoteEditor.create({
    initialContent: [{ type: "paragraph", content: "before" }],
  });
  editor.mount(document.createElement("div"));
  try {
    insertOrUpdateBlockForSlashMenu(editor, {
      type: "table",
      content: {
        type: "tableContent",
        rows: Array.from({ length: 2 }, () => ({ cells: ["", "", ""] })),
      },
    });
    const table = editor.document.find(block => block.type === "table");
    expect(table?.content.rows).toHaveLength(2);
    expect(table?.content.rows[0].cells).toHaveLength(3);
  } finally {
    editor._tiptapEditor.destroy();
  }
});
