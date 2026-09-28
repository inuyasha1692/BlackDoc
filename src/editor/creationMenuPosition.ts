import type { PopoverProps } from "@mantine/core";

type ViewportPadding = { top: number; right: number; bottom: number; left: number };

export function creationMenuViewportPadding(): ViewportPadding {
  const toolbarBottom = document.querySelector(".toolbar")?.getBoundingClientRect().bottom ?? 0;
  return { top: Math.max(12, toolbarBottom + 12), right: 12, bottom: 12, left: 12 };
}

export function creationMenuMiddlewares(padding: ViewportPadding): PopoverProps["middlewares"] {
  return {
    flip: { padding, fallbackPlacements: ["left-start"], crossAxis: false },
    shift: { padding, crossAxis: true, limiter: undefined },
    size: {
      padding,
      apply({ availableWidth, availableHeight, elements }) {
        const width = Math.max(0, availableWidth);
        const height = Math.max(0, Math.min(480, availableHeight));
        Object.assign(elements.floating.style, { maxWidth: `${width}px`, maxHeight: `${height}px` });
        elements.floating.style.setProperty("--creation-menu-max-height", `${Math.max(0, height - 2)}px`);
      },
    },
  };
}
