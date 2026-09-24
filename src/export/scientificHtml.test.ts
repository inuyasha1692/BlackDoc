import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { createReactInlineMathSpec, createReactMathBlockSpec } from "@blocknote/math-block";
import { createReactDiagramBlockSpec, renderDiagramToSVG } from "@blocknote/diagram-block";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlackDocBlock, BlackDocEditor } from "../editor/schema";
import { buildStandaloneHtml } from "./standaloneHtml";

vi.mock("../canvas/export", () => ({ canvasSvg: vi.fn() }));
vi.mock("@blocknote/diagram-block", async importOriginal => ({
  ...await importOriginal<typeof import("@blocknote/diagram-block")>(),
  renderDiagramToSVG: vi.fn(),
}));

const schema = BlockNoteSchema.create({ blockSpecs: defaultBlockSpecs }).extend({
  blockSpecs: {
    mathBlock: createReactMathBlockSpec(),
    diagram: createReactDiagramBlockSpec(),
  },
  inlineContentSpecs: { math: createReactInlineMathSpec() },
});
type Editor = typeof schema.BlockNoteEditor;
const editors: Editor[] = [];
const createEditor = (initialContent: typeof schema.PartialBlock[]) => {
  const editor = BlockNoteEditor.create({ schema, initialContent });
  editors.push(editor);
  return editor;
};
const exportEditor = async (editor: Editor) => {
  const result = await buildStandaloneHtml(
    editor as unknown as BlackDocEditor,
    editor.document as unknown as BlackDocBlock[],
  );
  return { ...result, doc: new DOMParser().parseFromString(result.html, "text/html") };
};
const svgResult = (svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80"><text x="10" y="20">开始 → 完成</text></svg>') => ({
  image: { data: new TextEncoder().encode(svg), mimeType: "image/svg+xml" as const, width: 240, height: 80 },
});

beforeEach(() => {
  vi.mocked(renderDiagramToSVG).mockReset().mockResolvedValue(svgResult());
});
afterEach(() => {
  editors.splice(0).forEach(editor => editor._tiptapEditor.destroy());
  vi.unstubAllGlobals();
});

describe("standalone scientific content with official 0.54.2 serializers", () => {
  it("exports block and inline formulas as native MathML without runtime assets", async () => {
    const editor = createEditor([
      { id: "equation", type: "mathBlock", content: "\\frac{a}{b}" },
      { id: "paragraph", type: "paragraph", content: [
        { type: "text", text: "Before ", styles: {} },
        { type: "math", content: "x^2" },
        { type: "text", text: " after", styles: {} },
      ] },
    ]);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { doc, externalImages } = await exportEditor(editor);
    expect(doc.querySelector('math[display="block"] mfrac')).not.toBeNull();
    expect(doc.querySelector('math[display="inline"] msup')).not.toBeNull();
    expect(doc.getElementById("block=paragraph")?.textContent).toContain("Before ");
    expect(doc.getElementById("block=paragraph")?.textContent).toContain(" after");
    expect(doc.querySelectorAll("script[src],link[rel=stylesheet],.katex-html,[data-editable]"))
      .toHaveLength(0);
    expect(externalImages).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("handles formulas in table cells and nested blocks in document order", async () => {
    const editor = createEditor([
      { type: "table", content: { type: "tableContent", rows: [
        { cells: [[{ type: "math", content: "a_1" }], [{ type: "math", content: "b_2" }]] },
      ] } },
      { type: "paragraph", content: [
        { type: "math", content: "c_3" },
      ], children: [{ type: "paragraph", content: [{ type: "math", content: "d_4" }] }] },
    ]);
    const { doc } = await exportEditor(editor);
    expect(Array.from(doc.querySelectorAll("math"), el => el.getAttribute("alttext")))
      .toEqual(["a_1", "b_2", "c_3", "d_4"]);
    expect(doc.querySelector("article button,article [data-editable],.bn-source-block-popup")).toBeNull();
  });

  it("preserves invalid LaTeX as escaped text and refuses trusted HTML commands", async () => {
    const source = "\\invalid{</code><img src=x onerror=alert(1)>}";
    const editor = createEditor([
      { type: "mathBlock", content: source },
      { type: "paragraph", content: [
        { type: "math", content: source },
        { type: "math", content: "\\href{javascript:alert(1)}{click}" },
      ] },
    ]);
    const { doc } = await exportEditor(editor);
    expect(Array.from(doc.querySelectorAll(".math-export-error"), el => el.textContent))
      .toEqual([source, source]);
    expect(doc.querySelector("article img,article script,[onerror],a[href^='javascript:']")).toBeNull();
  });

  it("awaits SVG rendering and embeds isolated UTF-8 data images for nested diagrams", async () => {
    let finish!: (value: ReturnType<typeof svgResult>) => void;
    vi.mocked(renderDiagramToSVG).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const editor = createEditor([{ id: "parent", type: "paragraph", children: [
      { id: "diagram", type: "diagram", content: "graph TD\n A[开始] --> B[完成]" },
    ] }]);
    let completed = false;
    const pending = exportEditor(editor).then(result => { completed = true; return result; });
    await vi.waitFor(() => expect(renderDiagramToSVG).toHaveBeenCalledOnce());
    expect(completed).toBe(false);
    finish(svgResult());
    const { doc, externalImages } = await pending;
    const image = doc.getElementById("block=diagram")?.querySelector("img");
    expect(image?.width).toBe(240);
    expect(image?.height).toBe(80);
    expect(decodeURIComponent(image!.src.split(",")[1])).toContain("开始 → 完成");
    expect(doc.querySelector("article svg,article button,script[src]")).toBeNull();
    expect(externalImages).toEqual([]);
    expect(renderDiagramToSVG).toHaveBeenCalledWith(
      "graph TD\n A[开始] --> B[完成]", { fontFamily: "sans-serif" },
    );
  });

  it("keeps SVG scripts and event attributes out of the HTML document", async () => {
    vi.mocked(renderDiagramToSVG).mockResolvedValue(svgResult(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><text>&lt;/script&gt;</text></svg>',
    ));
    const { doc } = await exportEditor(createEditor([{ type: "diagram", content: "graph TD; A-->B" }]));
    expect(doc.querySelector("article script,article svg,[onload]")).toBeNull();
    expect(doc.querySelector("article img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  });

  it.each(["typed error", "rejection", "invalid SVG", "invalid dimensions"] as const)(
    "aborts incomplete diagram export on %s", async kind => {
      if (kind === "typed error") vi.mocked(renderDiagramToSVG).mockResolvedValue({ error: "bad source" });
      if (kind === "rejection") vi.mocked(renderDiagramToSVG).mockRejectedValue(new Error("render failed"));
      if (kind === "invalid SVG") vi.mocked(renderDiagramToSVG).mockResolvedValue(svgResult("<html/>"));
      if (kind === "invalid dimensions") vi.mocked(renderDiagramToSVG).mockResolvedValue({
        image: { ...svgResult().image, width: Number.NaN },
      });
      await expect(exportEditor(createEditor([{ type: "diagram", content: "bad source" }])))
        .rejects.toThrow("Mermaid 图表渲染失败");
    },
  );

  it("exports empty formulas and diagrams without invoking Mermaid", async () => {
    const { doc } = await exportEditor(createEditor([
      { type: "mathBlock", content: "" },
      { type: "diagram", content: "" },
      { type: "paragraph", content: [{ type: "math", content: "" }] },
    ]));
    expect(doc.querySelectorAll("math")).toHaveLength(2);
    expect(doc.querySelector("article")?.textContent).toContain("空白 Mermaid 图表");
    expect(renderDiagramToSVG).not.toHaveBeenCalled();
  });

  it("rejects missing formula wrappers instead of silently dropping content", async () => {
    const editor = createEditor([{ type: "paragraph", content: [{ type: "math", content: "x" }] }]);
    vi.spyOn(editor, "blocksToFullHTML").mockReturnValue("");
    await expect(exportEditor(editor)).rejects.toThrow("行内公式内容不完整");
  });
});
