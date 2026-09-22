import type { Block } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { getOutlineItems } from "./outline";

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
      { id: "h2", level: 2, text: "章节" },
    ]);
  });
});

