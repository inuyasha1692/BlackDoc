import type { Block } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { changesAffectOutline, getOutlineItems } from "./outline";

describe("changesAffectOutline", () => {
  it("ignores paragraph edits and detects heading changes in nested blocks", () => {
    expect(changesAffectOutline([
      { block: { type: "paragraph" } },
      { block: { type: "splitPane", children: [{ type: "splitColumn", children: [{ type: "paragraph" }] }] } },
    ])).toBe(false);

    expect(changesAffectOutline([
      { block: { type: "paragraph" }, prevBlock: {
        type: "splitPane",
        children: [{ type: "splitColumn", children: [{ type: "heading" }] }],
      } },
    ])).toBe(true);
  });
});

describe("getOutlineItems", () => {
  it("collects headings in document order and preserves their levels", () => {
    const blocks = [
      {
        id: "h1",
        type: "heading",
        props: { level: 1 },
        content: [{ type: "text", text: "标题", styles: {} }],
        children: [
          {
            id: "h2",
            type: "heading",
            props: { level: 2 },
            content: [{ type: "text", text: "章节", styles: {} }],
            children: [],
          },
        ],
      },
      {
        id: "empty",
        type: "heading",
        props: { level: 3 },
        content: [],
        children: [],
      },
    ] as unknown as Block[];

    expect(getOutlineItems(blocks)).toEqual([
      { id: "h1", level: 1, text: "标题" },
      { id: "h2", level: 2, text: "章节", number: "1" },
    ]);
  });

  it("numbers headings by their levels and resets child counters", () => {
    const blocks = [
      { id: "chapter-1", type: "heading", props: { level: 2 }, content: "第一章", children: [
        { id: "section-1", type: "heading", props: { level: 3 }, content: "第一节", children: [] },
        { id: "section-2", type: "heading", props: { level: 3 }, content: "第二节", children: [] },
      ] },
      { id: "chapter-2", type: "heading", props: { level: 2 }, content: "第二章", children: [
        { id: "section-1-next", type: "heading", props: { level: 3 }, content: "第一节", children: [] },
      ] },
    ] as unknown as Block[];

    expect(getOutlineItems(blocks).map(item => [item.id, item.number])).toEqual([
      ["chapter-1", "1"],
      ["section-1", "1.1"],
      ["section-2", "1.2"],
      ["chapter-2", "2"],
      ["section-1-next", "2.1"],
    ]);
  });
});
