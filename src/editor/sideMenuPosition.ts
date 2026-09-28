import type { PopoverProps } from "@mantine/core";

type ViewportPadding = { top: number; right: number; bottom: number; left: number };

export function blockControlMenuMiddlewares(padding: ViewportPadding): PopoverProps["middlewares"] {
  return {
    flip: { padding, fallbackPlacements: ["right"] },
    shift: { padding, crossAxis: true },
    size: {
      padding,
      apply({ elements }) {
        elements.floating.style.maxHeight =
          `${Math.max(0, window.innerHeight - padding.top - padding.bottom)}px`;
      },
    },
  };
}

// Measure the rendered first line so all six heading levels and custom fonts align.
export const sideMenuHeadingPosition = {
  name: "blackdoc-heading-position",
  fn: ({ elements, rects, x }: {
    x?: number;
    elements: { reference: unknown };
    rects: { floating: { height: number }; reference: { y: number } };
  }) => {
    const value = elements.reference;
    const reference = value instanceof Element ? value : (value as { contextElement?: Element } | null)?.contextElement;
    if (!(reference instanceof Element)) return {};
    const heading = reference.querySelector<HTMLElement>("h1,h2,h3,h4,h5,h6");
    if (!heading) return {};
    const lineHeight = Number.parseFloat(getComputedStyle(heading).lineHeight);
    const bounds = heading.getBoundingClientRect();
    const topOffset = bounds.top - reference.getBoundingClientRect().top;
    return {
      y: rects.reference.y + topOffset + (Number.isFinite(lineHeight) ? lineHeight : bounds.height) / 2 - rects.floating.height / 2,
      ...(x !== undefined && reference.querySelector(".bn-toggle-button") ? { x: x - 24 } : {}),
    };
  },
};
