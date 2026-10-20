import { BlockNoteEditor } from "@blocknote/core";
import { afterEach, describe, expect, it } from "vitest";
import { blackDocSchema, type BlackDocEditor, type BlackDocPartialBlock } from "./schema";
import { ReadingTypographyExtension } from "./readingTypography";
import { HeadingSectionsExtension, setHeadingSectionExpanded } from "./headingSections";

const editors: BlackDocEditor[] = [];
const paragraph = (id: string): BlackDocPartialBlock => ({ id, type: "paragraph", content: id });
const label = (id: string): BlackDocPartialBlock => ({ id, type: "paragraph", content: [
  { type: "text", text: "  ", styles: {} },
  { type: "text", text: id, styles: { bold: true, textColor: "#3370FF" } },
] });
const table: BlackDocPartialBlock = { id: "table", type: "table", content: { type: "tableContent", rows: [
  { cells: [[{ type: "text", text: "Bold cell", styles: { bold: true } }]] },
] } };
function create(blocks: BlackDocPartialBlock[]) {
  const editor = BlockNoteEditor.create({ schema: blackDocSchema, extensions: [
    ReadingTypographyExtension(), HeadingSectionsExtension(),
  ], initialContent: blocks });
  const host = document.createElement("div");
  document.body.append(host);
  editor.mount(host);
  editors.push(editor);
  return editor;
}
const outer = (editor: BlackDocEditor, id: string) => editor.prosemirrorView.dom.querySelector<HTMLElement>(`.bn-block-outer[data-id="${id}"]`)!;
const gap = (editor: BlackDocEditor, id: string, side = "before") => outer(editor, id).style.getPropertyValue(`--reading-${side}`);
afterEach(() => { for (const editor of editors.splice(0)) editor._tiptapEditor.destroy(); document.body.replaceChildren(); localStorage.clear(); });

describe("reading typography", () => {
  it("separates paragraphs and fully bold labels without changing saved blocks", async () => {
    const editor = create([paragraph("first"), paragraph("second"), label("label"), paragraph("detail")]);
    const before = structuredClone(editor.document);
    expect(gap(editor, "first")).toBe("0px");
    expect(gap(editor, "second")).toBe("8px");
    expect(gap(editor, "label")).toBe("8px");
    expect(gap(editor, "detail")).toBe("8px");
    expect(outer(editor, "label").dataset.readingKind).toBe("label");
    expect(editor.document).toEqual(before);
    expect(editor.document[2].type).toBe("paragraph");
    expect(await editor.blocksToFullHTML(editor.document)).not.toContain("data-reading-kind");
    editor.updateBlock("label", { content: "plain" });
    expect(outer(editor, "label").dataset.readingKind).toBe("paragraph");
    expect(gap(editor, "label")).toBe("8px");
    expect(editor.undo()).toBe(true);
    expect(outer(editor, "label").dataset.readingKind).toBe("label");
  });
  it("keeps mixed emphasis, empty paragraphs and inline atoms out of label styling", () => {
    const editor = create([{ id: "mixed", type: "paragraph", content: [
      { type: "text", text: "Label", styles: { bold: true } },
      { type: "text", text: " detail", styles: {} },
    ] }, { id: "empty", type: "paragraph" }, { id: "math", type: "paragraph", content: [
      { type: "text", text: "Formula", styles: { bold: true } }, { type: "math", props: { latex: "x" } },
    ] }]);
    for (const id of ["mixed", "empty", "math"]) expect(outer(editor, id).dataset.readingKind).toBe("paragraph");
  });
  it("preserves table boundary gaps and keeps cell paragraphs out of body spacing", () => {
    const editor = create([paragraph("intro"), table, label("after"), paragraph("end")]);
    expect(gap(editor, "table")).toBe("0px");
    expect(gap(editor, "table", "after")).toBe("0px");
    expect(gap(editor, "after")).toBe("0px");
    expect(outer(editor, "table").querySelector("td [data-reading-kind], th [data-reading-kind]")).toBeNull();
    editor.setTextCursorPosition("after", "end");
    expect(editor.getTextCursorPosition().block.id).toBe("after");
    editor.updateBlock("table", { content: { type: "tableContent", rows: [{ cells: ["Edited cell"] }] } });
    expect(outer(editor, "table").textContent).toContain("Edited cell");
  });
  it("adds space at list boundaries and retains compact nested list items", () => {
    const editor = create([paragraph("intro"), { id: "one", type: "bulletListItem", content: "one", children: [
      { id: "nested", type: "numberedListItem", content: "nested" },
    ] }, { id: "two", type: "bulletListItem", content: "two" }, paragraph("after"), table]);
    expect(gap(editor, "one")).toBe("6px");
    expect(gap(editor, "one", "after")).toBe("0px");
    expect(gap(editor, "two")).toBe("0px");
    expect(gap(editor, "two", "after")).toBe("6px");
    expect(gap(editor, "nested")).toBe("0px");
    editor.updateBlock("after", { type: "bulletListItem" });
    expect(gap(editor, "after", "after")).toBe("0px");
  });
  it("uses heading level spacing, omits initial space and retains folding", () => {
    const editor = create([1, 2, 3, 4, 5, 6].map(level => ({ id: `h${level}`, type: "heading", props: { level }, content: `Heading ${level}` })) as BlackDocPartialBlock[]);
    expect(gap(editor, "h1")).toBe("0px");
    for (const [id, before, after] of [["h2", "28px", "12px"], ["h3", "24px", "8px"], ["h4", "24px", "8px"], ["h5", "20px", "6px"], ["h6", "20px", "6px"]]) {
      expect(gap(editor, id)).toBe(before);
      expect(gap(editor, id, "after")).toBe(after);
    }
    setHeadingSectionExpanded(editor.prosemirrorView, "h2", false);
    expect(outer(editor, "h3").classList.contains("heading-section-hidden")).toBe(true);
    setHeadingSectionExpanded(editor.prosemirrorView, "h2", true);
    expect(outer(editor, "h3").classList.contains("heading-section-hidden")).toBe(false);
  });
  it("retains existing heading padding beside a table", () => {
    const editor = create([{ id: "before", type: "heading", content: "before" }, table,
      { id: "after", type: "heading", content: "after" }]);
    expect(gap(editor, "before", "after")).toBe("3px");
    expect(gap(editor, "after")).toBe("18px");
  });
});
