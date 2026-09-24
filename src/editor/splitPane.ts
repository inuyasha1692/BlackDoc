import type { BlackDocPartialBlock } from "./schema";

export const SPLIT_WIDTH = { min: 25, max: 75, default: 50 };
export const SPLIT_HEIGHT = { min: 160, max: 1200, default: 400 };
export const SPLIT_AUTO_HEIGHT = 0;
export const SPLIT_HEIGHT_PRESETS = [240, 400, 640] as const;
export const RIGHT_SCROLL_SELECTOR = ".split-pane-right-scroll";

export const clampSplitWidth = (value: number) =>
  Math.round(Math.max(SPLIT_WIDTH.min, Math.min(SPLIT_WIDTH.max,
    Number.isFinite(value) ? value : SPLIT_WIDTH.default)));

export const clampSplitHeight = (value: number) =>
  Math.round(Math.max(SPLIT_HEIGHT.min, Math.min(SPLIT_HEIGHT.max,
    Number.isFinite(value) ? value : SPLIT_HEIGHT.default)));

export const createSplitPane = (): BlackDocPartialBlock => ({
  type: "splitPane",
  props: { leftWidth: SPLIT_WIDTH.default, rightHeight: SPLIT_HEIGHT.default },
  children: [
    { type: "splitColumn", props: { side: "left" }, children: [{ type: "paragraph" }] },
    { type: "splitColumn", props: { side: "right" }, children: [{ type: "paragraph" }] },
  ],
});

type TreeBlock = { id?: string; type: string; children?: readonly TreeBlock[] };

export function isInsideSplitPane(blocks: readonly TreeBlock[], id: string): boolean {
  const visit = (items: readonly TreeBlock[], inside: boolean): boolean =>
    items.some(block => {
      const nested = inside || block.type === "splitPane";
      return block.id === id ? nested : visit(block.children ?? [], nested);
    });
  return visit(blocks, false);
}
