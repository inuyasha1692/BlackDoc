import { BlockNoteEditor } from "@blocknote/core";
import { zh } from "@blocknote/core/locales";
import {
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
} from "@blocknote/xl-multi-column";
import type { Block } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { blackDocSchema } from "./schema";
import {
  getDocumentTitle,
  htmlFileName,
  isBlackDocument,
  sanitizeFileStem,
  sourceFileName,
} from "./document";

const blocks = [
  {
    id: "intro",
    type: "paragraph",
    props: {},
    content: [{ type: "text", text: "导语", styles: {} }],
    children: [],
  },
  {
    id: "title",
    type: "heading",
    props: { level: 1 },
    content: [
      { type: "text", text: "建筑", styles: {} },
      { type: "text", text: "系统", styles: { bold: true } },
    ],
    children: [],
  },
] as unknown as Block[];

describe("document helpers", () => {
  it("uses the first level-one heading as the document title", () => {
    expect(getDocumentTitle(blocks)).toBe("建筑系统");
    expect(sourceFileName(blocks)).toBe("建筑系统.bdoc");
  });

  it("sanitizes Windows file names and supplies a fallback", () => {
    expect(sanitizeFileStem('方案: A/B*?')).toBe("方案 A B");
    expect(sanitizeFileStem("CON")).toBe("_CON");
    expect(sanitizeFileStem("   ")).toBe("未命名文档");
  });

  it("derives the HTML name from a saved source name", () => {

    expect(htmlFileName(null, blocks)).toBe("建筑系统.html");
    expect(htmlFileName("新文件.bdoc", blocks)).toBe("新文件.html");
    expect(htmlFileName("旧文件.blackdoc", blocks)).toBe("建筑系统.html");

  });

  it("accepts two or more official columns with valid widths", () => {
    const columnList = {
      id: "columns",
      type: "columnList",
      props: {},
      children: [1, 2, 3].map((width, index) => ({
        id: "column-" + index,
        type: "column",
        props: { width },
        children: [{
          id: "paragraph-" + index,
          type: "paragraph",
          props: {},
          content: [],
          children: [],
        }],
      })),
    };
    expect(isBlackDocument([columnList])).toBe(true);
    expect(isBlackDocument([{
      ...columnList,
      children: columnList.children.slice(0, 1),
    }])).toBe(false);
    expect(isBlackDocument([{
      ...columnList,
      children: [{ ...columnList.children[0], props: { width: -1 } }, columnList.children[1]],
    }])).toBe(false);
  });

  it("exposes the official two-column and three-column slash commands", () => {
    const editor = BlockNoteEditor.create({
      schema: blackDocSchema,
      dictionary: { ...zh, multi_column: multiColumnLocales.zh },
    });
    try {
      expect(getMultiColumnSlashMenuItems(editor).map(item => item.title)).toEqual(["两列", "三列"]);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("rejects malformed source documents", () => {
    expect(isBlackDocument(blocks)).toBe(true);
    expect(isBlackDocument([])).toBe(false);
    expect(isBlackDocument({ blocks })).toBe(false);
    expect(isBlackDocument([{ type: 42 }])).toBe(false);
  });
});
