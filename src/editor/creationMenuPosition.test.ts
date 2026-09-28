import { computePosition, flip, shift, size } from "@floating-ui/react";
import { afterEach, expect, it } from "vitest";
import { creationMenuMiddlewares, creationMenuViewportPadding } from "./creationMenuPosition";

afterEach(() => { document.body.innerHTML = ""; });

it("reserves the rendered toolbar height", () => {
  const toolbar = document.createElement("header");
  toolbar.className = "toolbar";
  toolbar.getBoundingClientRect = () => ({ bottom: 82 }) as DOMRect;
  document.body.append(toolbar);
  expect(creationMenuViewportPadding()).toEqual({ top: 94, right: 12, bottom: 12, left: 12 });
});

it.each([
  ["normal", 350, 200, 900, 650, "right-start"],
  ["right edge", 730, 200, 900, 650, "left-start"],
  ["bottom edge", 350, 590, 900, 650, "right-start"],
  ["short window", 100, 180, 650, 300, "right-start"],
  ["narrow window", 30, 180, 260, 650, undefined],
] as const)("keeps the creation menu visible in a %s", async (_name, x, y, viewportWidth, viewportHeight, placement) => {
  const reference = document.createElement("button");
  const floating = document.createElement("div");
  const options = creationMenuMiddlewares({ top: 94, right: 12, bottom: 12, left: 12 })!;
  const dimensions = () => ({
    width: Math.min(240, parseFloat(floating.style.maxWidth) || 240),
    height: Math.min(480, parseFloat(floating.style.maxHeight) || 480),
  });
  const result = await computePosition(reference, floating, {
    placement: "right-start",
    strategy: "fixed",
    middleware: [flip(options.flip === true ? {} : options.flip || {}),
      shift(options.shift === true ? {} : options.shift || {}),
      size(options.size === true ? {} : options.size || {})],
    platform: {
      convertOffsetParentRelativeRectToViewportRelativeRect: async ({ rect }) => rect,
      getOffsetParent: async () => window,
      getDocumentElement: () => document.documentElement,
      getClientRects: async () => [],
      getScale: async () => ({ x: 1, y: 1 }),
      getElementRects: async () => ({ reference: { x, y, width: 100, height: 32 }, floating: { x: 0, y: 0, ...dimensions() } }),
      getClippingRect: async () => ({ x: 0, y: 0, width: viewportWidth, height: viewportHeight }),
      getDimensions: async () => dimensions(),
      isElement: async () => false,
      isRTL: async () => false,
    },
  });
  if (placement) expect(result.placement).toBe(placement);
  expect(result.x).toBeGreaterThanOrEqual(12);
  expect(result.y).toBeGreaterThanOrEqual(94);
  expect(result.x + dimensions().width).toBeLessThanOrEqual(viewportWidth - 12);
  expect(result.y + dimensions().height).toBeLessThanOrEqual(viewportHeight - 12);
  expect(floating.style.getPropertyValue("--creation-menu-max-height")).not.toBe("");
});
