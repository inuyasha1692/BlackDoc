import { BlockNoteEditor } from "@blocknote/core";
import { blackDocSchema, type BlackDocBlock as Block, type BlackDocPartialBlock as PartialBlock } from "./schema";
import { describe, expect, it } from "vitest";
import exampleDocumentSource from "../../files/BlackDoc功能展示示例.bdoc?raw";
import { parseBlockLink } from "./blockLinks";
import { getDocumentTitle, isBlackDocument } from "./document";
import { getHeadingNumbers } from "./headingNumbers";
import { parseScene } from "../canvas/scene";
import { EMPTY_DOCUMENT } from "./document";
import { SplitPaneExtension, SPLIT_DOCUMENT_REPLACE_META } from "./splitPaneExtension";

const exampleDocument = JSON.parse(exampleDocumentSource);

const flattenBlocks = (blocks: readonly Block[]): Block[] =>
  blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);

describe("功能展示示例文档", () => {
  it("replaces the initial empty document using the real editor loading transaction", () => {
    const editor = BlockNoteEditor.create({
      schema: blackDocSchema,
      initialContent: structuredClone(EMPTY_DOCUMENT),
      extensions: [SplitPaneExtension()],
    });
    try {
      editor.transact(tr => {
        tr.setMeta(SPLIT_DOCUMENT_REPLACE_META, true);
        editor.replaceBlocks(editor.document, exampleDocument as PartialBlock[]);
      });
      expect(editor.document).toHaveLength(exampleDocument.length);
      expect(getDocumentTitle(editor.document)).toBe("BlackDoc 功能展示示例");
    } finally {
      editor._tiptapEditor.destroy();
    }
  });
  it("is a valid native BlockNote block array with unique IDs", () => {
    expect(isBlackDocument(exampleDocument)).toBe(true);

    const blocks = flattenBlocks(exampleDocument as Block[]);
    const ids = blocks.map((block) => block.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getDocumentTitle(exampleDocument as Block[])).toBe(
      "BlackDoc 功能展示示例",
    );
  });

  it("shows numbered media and math sections without the PDF attachment", () => {
    expect(exampleDocument.some((block: { id: string }) => block.id === "demo-file")).toBe(false);
    expect(exampleDocument.find((block: { id: string }) => block.id === "demo-media-heading")?.content[0].text)
      .toBe("图片与音视频");
    expect(exampleDocument.find((block: { id: string }) => block.id === "demo-diagram-math-heading")?.content[0].text)
      .toBe("图表与数学公式");
    expect(getHeadingNumbers(exampleDocument as Block[]).get("demo-media-heading")).toBe("9");
    expect(getHeadingNumbers(exampleDocument as Block[]).get("demo-diagram-math-heading")).toBe("10");
  });

  it("orders the link, canvas, split-pane, and multi-column showcases fifth through eighth", () => {
    const sectionIds = [
      "demo-anchor-target",
      "canvas-demo-heading",
      "demo-split-heading",
      "demo-official-multicolumn-heading",
    ];
    const titles = sectionIds.map(id =>
      exampleDocument.find((block: { id: string }) => block.id === id)?.content[0].text,
    );

    expect(titles).toEqual([
      "块链接展示",
      "嵌入式画布",
      "双分区",
      "多栏",
    ]);
    const numbers = getHeadingNumbers(exampleDocument as Block[]);
    expect(sectionIds.map(id => numbers.get(id))).toEqual(["5", "6", "7", "8"]);
  });

  it("uses the BlackDoc wordmark in the embedded image showcase", () => {
    const image = exampleDocument.find((block: { id: string }) => block.id === "demo-embedded-image");
    const svg = atob(image.props.url.split(",")[1]);

    expect(svg).toContain(">BlackDoc</text>");
    expect(svg).not.toContain(">BlockDoc</text>");
  });

  it("only links to targets that exist in the example document", () => {
    const blocks = flattenBlocks(exampleDocument as Block[]);
    const ids = new Set(blocks.map((block) => block.id));
    const internalTargets = blocks.flatMap((block) => {
      if (!Array.isArray(block.content)) {
        return [];
      }

      return block.content.flatMap((item) => {
        if (item.type !== "link") {
          return [];
        }
        const target = parseBlockLink(item.href);
        return target ? [target] : [];
      });
    });

    expect(internalTargets.length).toBeGreaterThan(0);
    expect(internalTargets.every((target) => ids.has(target))).toBe(true);
  });

  it("can be loaded by the configured BlockNote schema", () => {
    const editor = BlockNoteEditor.create({
      schema: blackDocSchema,
      initialContent: exampleDocument as PartialBlock[],
    });

    expect(editor.document).toHaveLength(exampleDocument.length);
    expect(editor.getBlock("demo-anchor-target")?.type).toBe("heading");
    const canvas = editor.getBlock("demo-canvas");
    expect(canvas?.type).toBe("canvas");
    if (canvas?.type === "canvas") {
      const scene = parseScene(canvas.props.scene);
      expect(scene.elements.some(element => element.type === "text")).toBe(true);
      expect(scene.elements.some(element => element.type === "image")).toBe(true);
      expect(Object.values(scene.files).every(file => file.dataURL.startsWith("data:image/"))).toBe(true);
      expect(JSON.parse(JSON.stringify(canvas)).props.scene).toBe(canvas.props.scene);
    }
    const split = editor.getBlock("demo-split");
    expect(split?.type).toBe("splitPane");
    if (split?.type === "splitPane") {
      expect(split.props).toEqual(exampleDocument.find((block: { id: string }) => block.id === "demo-split").props);
      expect(split.children.map(child => child.type)).toEqual(["splitColumn", "splitColumn"]);
      expect(editor.getBlock("demo-split-right-late")?.type).toBe("heading");
    }
    editor._tiptapEditor.destroy();
  });
});
