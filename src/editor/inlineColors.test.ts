import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { blackDocSchema } from "./schema";
import { buildStandaloneHtml } from "../export/standaloneHtml";

describe("imported inline colors", () => {
  it("renders exact text and highlight colors in the editor and standalone HTML", async () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema, initialContent: [
      { type: "paragraph", content: [
        { type: "text", text: "Discussion", styles: { textColor: "#3370FF" } },
        { type: "text", text: "Condition", styles: { backgroundColor: "#ECE2FE" } },
        { type: "text", text: "Conclusion", styles: { textColor: "#FFFFFF", backgroundColor: "#133C9A" } },
        { type: "text", text: "Theme color", styles: { textColor: "red" } },
      ] },
    ] });
    const host = document.createElement("div");
    document.body.append(host);
    editor.mount(host);
    const check = (root: ParentNode) => {
      for (const [type, value, expected] of [
        ["textColor", "#3370FF", "rgb(51, 112, 255)"],
        ["backgroundColor", "#ECE2FE", "rgb(236, 226, 254)"],
        ["textColor", "#FFFFFF", "rgb(255, 255, 255)"],
        ["backgroundColor", "#133C9A", "rgb(19, 60, 154)"],
      ]) {
        const span = root.querySelector<HTMLElement>(`[data-style-type="${type}"][data-value="${value}"]`);
        expect(span).not.toBeNull();
        expect(span!.style[type === "textColor" ? "color" : "backgroundColor"]).toBe(expected);
      }
      expect(root.querySelector<HTMLElement>('[data-style-type="textColor"][data-value="red"]')!.style.color).toBe("");
    };
    try {
      check(host);
      const { html } = await buildStandaloneHtml(editor, editor.document);
      check(new DOMParser().parseFromString(html, "text/html"));
      const imported = await editor.tryParseHTMLToBlocks(await editor.blocksToHTMLLossy());
      expect(imported[0].content).toEqual(editor.document[0].content);
    } finally {
      editor.unmount();
      host.remove();
    }
  });
});
