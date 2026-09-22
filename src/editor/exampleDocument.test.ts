import { BlockNoteEditor, type Block, type PartialBlock } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import exampleDocument from "../../files/BlockDoc功能验收示例.blockdoc.json";
import { parseBlockLink } from "./blockLinks";
import { getDocumentTitle, isBlockDocument } from "./document";

const flattenBlocks = (blocks: readonly Block[]): Block[] =>
  blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);

describe("功能验收示例文档", () => {
  it("is a valid native BlockNote block array with unique IDs", () => {
    expect(isBlockDocument(exampleDocument)).toBe(true);

    const blocks = flattenBlocks(exampleDocument as Block[]);
    const ids = blocks.map((block) => block.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getDocumentTitle(exampleDocument as Block[])).toBe(
      "BlockDoc 功能验收示例",
    );
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
      initialContent: exampleDocument as PartialBlock[],
    });

    expect(editor.document).toHaveLength(exampleDocument.length);
    expect(editor.getBlock("demo-anchor-target")?.type).toBe("heading");
  });
});

