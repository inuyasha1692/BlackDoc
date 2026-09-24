import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BlackDocBlock, BlackDocEditor } from "../editor/schema";
import { buildStandaloneHtml } from "./standaloneHtml";
import { canvasSvg } from "../canvas/export";

vi.mock("../canvas/export", () => ({ canvasSvg: vi.fn() }));

const block: BlackDocBlock = {
  id: "canvas-test", type: "canvas", props: { scene: '{"version":1}', previewWidth: 0, textAlignment: "left" }, content: undefined, children: [],
};

const editor = {
  blocksToFullHTML: () => '<div class="bn-block-outer" data-id="canvas-test"><div class="bn-block-content" data-content-type="canvas" data-scene="private-source"><button>编辑画布</button></div></div>',
} as unknown as BlackDocEditor;

beforeEach(() => {
  vi.mocked(canvasSvg).mockReset();
  vi.mocked(canvasSvg).mockResolvedValue("data:image/svg+xml,%3Csvg%3E%3C/svg%3E");
});

describe("standalone canvas HTML", () => {
  it.each(["left", "center", "right"] as const)("exports %s canvas alignment", async textAlignment => {
    const { html } = await buildStandaloneHtml(editor, [{ ...block, props: { ...block.props, previewWidth: 320, textAlignment } }]);
    const figure = new DOMParser().parseFromString(html, "text/html").querySelector("figure")!;
    expect(figure.style.marginLeft).toBe(textAlignment === "left" ? "0px" : "auto");
    expect(figure.style.marginRight).toBe(textAlignment === "center" ? "auto" : "0px");
    expect(figure.style.width).toBe("320px");
  });
  it("replaces the editor with an embedded image and standalone zoom viewer", async () => {
    const { html } = await buildStandaloneHtml(editor, [block]);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(canvasSvg).toHaveBeenCalledWith('{"version":1}');
    expect(doc.querySelector(".canvas-export-button img")?.getAttribute("src"))
      .toBe("data:image/svg+xml,%3Csvg%3E%3C/svg%3E");
    expect(doc.querySelector(".canvas-viewer")).not.toBeNull();
    expect(doc.querySelectorAll("script[src],link[rel=stylesheet]")).toHaveLength(0);
    expect(doc.getElementById("block=canvas-test")).not.toBeNull();
    expect(html).not.toContain("private-source");
    expect(html).not.toContain("编辑画布");
  });

  it("rejects an incomplete image export instead of silently losing the canvas", async () => {
    vi.mocked(canvasSvg).mockRejectedValue(new Error("missing image"));
    await expect(buildStandaloneHtml(editor, [block])).rejects.toThrow("missing image");
  });

  it("exports canvases nested below other blocks", async () => {
    const parent = {
      id: "parent", type: "paragraph", props: {}, content: [], children: [block],
    } as unknown as BlackDocBlock;
    await buildStandaloneHtml(editor, [parent]);
    expect(canvasSvg).toHaveBeenCalledOnce();
  });

  it.each([320, 480.5, 1600])("exports the persisted %s pixel preview width", async (previewWidth) => {
    const persisted = JSON.parse(JSON.stringify({
      ...block, props: { ...block.props, previewWidth },
    })) as BlackDocBlock;
    const { html } = await buildStandaloneHtml(editor, [persisted]);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const figure = doc.querySelector("figure")!;

    expect(figure.style.width).toBe(`${previewWidth}px`);
    expect(figure.style.maxWidth).toBe("100%");
    expect(figure.style.marginLeft).toBe("0px");
    expect(figure.style.marginRight).toBe("0px");
    expect(canvasSvg).toHaveBeenCalledWith('{"version":1}');
  });

  it.each([
    ["zero", 0],
    ["missing", undefined],
    ["negative", -320],
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY],
    ["numeric string", "320"],
    ["CSS string", "320px"],
    ["null", null],
    ["boolean", true],
    ["object", { width: 320 }],
  ])("keeps the original full width for %s preview width", async (_label, previewWidth) => {
    const fixture = {
      ...block,
      props: {
        scene: block.props.scene,
        ...(previewWidth === undefined ? {} : { previewWidth }),
      },
    } as unknown as BlackDocBlock;
    const { html } = await buildStandaloneHtml(editor, [fixture]);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("figure")!.getAttribute("style")).toBeNull();
  });

  it("constrains the preview to its container and preserves the image aspect ratio", async () => {
    const { html } = await buildStandaloneHtml(editor, [block]);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const style = document.createElement("style");
    style.textContent = doc.querySelector("style")!.textContent;
    document.head.append(style);
    try {
      const rules = Array.from(style.sheet!.cssRules) as CSSStyleRule[];
      const declarations = (selector: string) =>
        rules.find(rule => rule.selectorText === selector)!.style;
      expect(declarations("figure").getPropertyValue("max-width")).toBe("100%");
      expect(declarations(".canvas-export-button").getPropertyValue("width")).toBe("100%");
      expect(declarations("img, video").getPropertyValue("max-width")).toBe("100%");
      expect(declarations("img, video").getPropertyValue("height")).toBe("auto");
      expect(declarations(".canvas-export-button img").getPropertyValue("width")).toBe("100%");
      expect(declarations(".canvas-export-button img").getPropertyValue("object-fit")).toBe("contain");
      expect(declarations(".canvas-export-button img").getPropertyValue("height")).toBe("");
      expect(doc.querySelector(".canvas-export-button img")!.hasAttribute("height")).toBe(false);
    } finally {
      style.remove();
    }
  });
});
