import { BlockNoteEditor } from "@blocknote/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blackDocSchema } from "./schema";
import { isBlackDocument } from "./document";
import { getOutlineItems } from "./outline";
import { revealBlock } from "./blockLinks";
import { clampSplitHeight, clampSplitWidth, createSplitPane, isInsideSplitPane } from "./splitPane";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.style.removeProperty("--app-anchor-highlight");
  vi.restoreAllMocks();
});

describe("split pane document", () => {
  it("creates two native block containers and round-trips dimensions and headings", () => {
    const editor = BlockNoteEditor.create({
      schema: blackDocSchema,
      initialContent: [
        { id: "before", type: "heading", content: "Before" },
        { ...createSplitPane(), id: "pane", props: { leftWidth: 35, rightHeight: 640 },
          children: [
            { id: "left-column", type: "splitColumn", props: { side: "left" }, children: [
              { id: "left", type: "heading", content: "Left" },
              { type: "canvas" },
            ] },
            { id: "right-column", type: "splitColumn", props: { side: "right" }, children: [
              { id: "right", type: "heading", content: "Right" },
              { type: "table", content: { type: "tableContent", rows: [{ cells: ["A", "B"] }] } },
            ] },
          ] },
        { id: "after", type: "heading", content: "After" },
      ],
    });
    const saved = JSON.parse(JSON.stringify(editor.document));
    expect(isBlackDocument(saved)).toBe(true);
    expect(saved[1].props).toEqual({ leftWidth: 35, rightHeight: 640 });
    expect(getOutlineItems(saved).map(item => item.id)).toEqual(["before", "left", "right", "after"]);
    expect(isInsideSplitPane(saved, "right")).toBe(true);
    expect(isInsideSplitPane(saved, "before")).toBe(false);
    editor._tiptapEditor.destroy();
  });

  it("validates shape, dimensions and forbids nested or standalone columns", () => {
    expect(isBlackDocument([createSplitPane()])).toBe(true);
    expect(isBlackDocument([{ ...createSplitPane(), props: { leftWidth: 50, rightHeight: 0 } }])).toBe(true);
    expect(isBlackDocument([{ type: "splitColumn" }])).toBe(false);
    expect(isBlackDocument([{ ...createSplitPane(), children: [] }])).toBe(false);
    expect(isBlackDocument([{ ...createSplitPane(), props: { leftWidth: 1 } }])).toBe(false);
    expect(isBlackDocument([{ ...createSplitPane(), props: { rightHeight: Infinity } }])).toBe(false);
    expect(isBlackDocument([{ ...createSplitPane(), children: [
      { type: "splitColumn", props: { side: "left" }, children: [createSplitPane()] },
      { type: "splitColumn", props: { side: "right" }, children: [{ type: "paragraph" }] },
    ] }])).toBe(false);
    expect(isBlackDocument([{ ...createSplitPane(), children: [
      { type: "splitColumn", props: { side: "right" }, children: [{ type: "paragraph" }] },
      { type: "splitColumn", props: { side: "left" }, children: [{ type: "paragraph" }] },
    ] }])).toBe(false);
  });

  it("clamps resize values", () => {
    expect(clampSplitWidth(0)).toBe(25);
    expect(clampSplitWidth(100)).toBe(75);
    expect(clampSplitWidth(NaN)).toBe(50);
    expect(clampSplitHeight(0)).toBe(160);
    expect(clampSplitHeight(5000)).toBe(1200);
    expect(clampSplitHeight(NaN)).toBe(400);
  });

  it("reveals a right-side heading in both the inner region and page", () => {
    document.body.innerHTML = '<div class="split-pane"><div class="split-pane-right-scroll"><div id="block=target"></div></div></div>';
    const pane = document.querySelector<HTMLElement>(".split-pane")!;
    const scroll = document.querySelector<HTMLElement>(".split-pane-right-scroll")!;
    const target = document.getElementById("block=target")!;
    pane.getBoundingClientRect = () => ({ top: 700 }) as DOMRect;
    scroll.getBoundingClientRect = () => ({ top: 740 }) as DOMRect;
    target.getBoundingClientRect = () => ({ top: 1400 }) as DOMRect;
    scroll.scrollTop = 100;
    scroll.scrollTo = vi.fn();
    target.animate = vi.fn(() => ({ cancel: vi.fn(), addEventListener: vi.fn() }) as unknown as Animation);
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    document.documentElement.style.setProperty("--app-anchor-highlight", "#514827");
    expect(revealBlock("target")).toBe(true);
    expect(scroll.scrollTo).toHaveBeenCalledWith({ top: 748, behavior: "smooth" });
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 616, behavior: "smooth" });
    expect(target.animate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: "#514827" })]),
      expect.anything(),
    );
  });
});
