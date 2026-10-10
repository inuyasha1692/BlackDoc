import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { cleanup, render, waitFor } from "@testing-library/react";
import { DOMParser } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { expect, it, vi } from "vitest";
import { blackDocSchema } from "./schema";

it("keeps inline images inside the table in the drag clipboard round trip", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const editor = BlockNoteEditor.create({ schema: blackDocSchema, initialContent: [{
    id: "table", type: "table", content: { type: "tableContent", rows: [{ cells: [{
      type: "tableCell", content: [
        { type: "text", text: "before", styles: {} },
        { type: "tableImage", props: { url: "data:image/png;base64,YQ==", name: "图", previewWidth: 100 } },
        { type: "text", text: "after", styles: {} },
      ],
    }] }] },
  }] });
  try {
    const { container } = render(<BlockNoteView editor={editor} />);
    await waitFor(() => expect(container.querySelector(".table-image-frame")).not.toBeNull());
    const view = editor.prosemirrorView;
    const original = NodeSelection.create(view.state.doc, 1).content();
    const html = view.serializeForClipboard(original).dom;
    const restored = DOMParser.fromSchema(view.state.schema).parseSlice(html);
    expect(restored.content.toJSON()).toEqual(original.content.toJSON());
  } finally {
    cleanup();
    editor._tiptapEditor.destroy();
    vi.unstubAllGlobals();
  }
});
