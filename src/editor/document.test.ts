import type { Block } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import {
  getDocumentTitle,
  htmlFileName,
  isBlockDocument,
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
    expect(sourceFileName(blocks)).toBe("建筑系统.blockdoc.json");
  });

  it("sanitizes Windows file names and supplies a fallback", () => {
    expect(sanitizeFileStem('方案: A/B*?')).toBe("方案 A B");
    expect(sanitizeFileStem("CON")).toBe("_CON");
    expect(sanitizeFileStem("   ")).toBe("未命名文档");
  });

  it("derives the HTML name from a saved source name", () => {
    expect(htmlFileName("建筑系统.blockdoc.json", blocks)).toBe(
      "建筑系统.html",
    );
    expect(htmlFileName(null, blocks)).toBe("建筑系统.html");
  });

  it("rejects malformed source documents", () => {
    expect(isBlockDocument(blocks)).toBe(true);
    expect(isBlockDocument([])).toBe(false);
    expect(isBlockDocument({ blocks })).toBe(false);
    expect(isBlockDocument([{ type: 42 }])).toBe(false);
  });
});

