import { computePosition, flip, shift, size } from "@floating-ui/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { blockControlMenuMiddlewares, sideMenuHeadingPosition } from "./sideMenuPosition";

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["middle", 260, 900, 300, 12],
  ["top edge", 126, 440, 500, 62],
  ["bottom edge", 400, 440, 300, 62],
] as const)("positions the block menu at the %s", async (_name, referenceY, viewportHeight, menuHeight, topPadding) => {
  vi.stubGlobal("innerHeight", viewportHeight);
  const floating = document.createElement("div");
  const padding = { top: topPadding, right: 12, bottom: 12, left: 12 };
  const options = blockControlMenuMiddlewares(padding)!;
  const dimensions = () => ({
    width: 240,
    height: Math.min(menuHeight, Number.parseFloat(floating.style.maxHeight) || menuHeight),
  });
  const result = await computePosition(document.createElement("button"), floating, {
    placement: "left",
    strategy: "fixed",
    middleware: [
      flip(options.flip === true ? {} : options.flip || {}),
      shift(options.shift === true ? {} : options.shift || {}),
      size(options.size === true ? {} : options.size || {}),
    ],
    platform: {
      convertOffsetParentRelativeRectToViewportRelativeRect: async ({ rect }) => rect,
      getOffsetParent: async () => window,
      getDocumentElement: () => document.documentElement,
      getClientRects: async () => [],
      getScale: async () => ({ x: 1, y: 1 }),
      getElementRects: async () => ({
        reference: { x: 260, y: referenceY, width: 34, height: 32 },
        floating: { x: 0, y: 0, ...dimensions() },
      }),
      getClippingRect: async () => ({ x: 0, y: 0, width: 600, height: viewportHeight }),
      getDimensions: async () => dimensions(),
      isElement: async () => false,
      isRTL: async () => false,
    },
  });

  if (_name === "middle") {
    expect(result.y + dimensions().height / 2).toBe(referenceY + 16);
  } else if (_name === "top edge") {
    expect(result.y).toBe(padding.top);
  } else {
    expect(result.y + dimensions().height).toBe(viewportHeight - padding.bottom);
  }
  expect(result.y).toBeGreaterThanOrEqual(padding.top);
  expect(result.y + dimensions().height).toBeLessThanOrEqual(viewportHeight - padding.bottom);
  if (_name === "top edge") expect(dimensions().height).toBeLessThan(menuHeight);
});

describe("heading side menu position", () => {
  it.each([1,2,3,4,5,6])("centers the first line of h%s using actual geometry", level => {
    const element = document.createElement("div");
    element.innerHTML = `<h${level} style="line-height:24px">Heading</h${level}>`;
    element.getBoundingClientRect = () => ({top:100}) as DOMRect;
    element.firstElementChild!.getBoundingClientRect = () => ({top:120,height:48}) as DOMRect;
    expect(sideMenuHeadingPosition.fn({elements:{reference:{contextElement:element}},rects:{reference:{y:200},floating:{height:30}}})).toEqual({y:217});
  });
  it("leaves non-heading positioning untouched", () => {
    expect(sideMenuHeadingPosition.fn({elements:{reference:document.createElement("div")},rects:{reference:{y:100},floating:{height:30}}})).toEqual({});
  });
  it("leaves space between the heading fold arrow and the side menu", () => {
    const element = document.createElement("div");
    element.innerHTML = '<button class="bn-toggle-button"></button><h2 style="line-height:24px">Heading</h2>';
    element.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    element.querySelector("h2")!.getBoundingClientRect = () => ({ top: 100, height: 24 }) as DOMRect;
    expect(sideMenuHeadingPosition.fn({ x: 80, elements: { reference: element }, rects: { reference: { y: 100 }, floating: { height: 32 } } })).toEqual({ x: 56, y: 96 });
  });
});
