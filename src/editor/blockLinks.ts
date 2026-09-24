import { RIGHT_SCROLL_SELECTOR } from "./splitPane";

export const BLOCK_LINK_PREFIX = "#block=";
export const BLOCK_LINK_COPIED_EVENT = "blackdoc:block-link-copied";
export const BLOCK_LINK_COPY_FAILED_EVENT = "blackdoc:block-link-copy-failed";
export const BLOCK_LINK_MISSING_EVENT = "blackdoc:block-link-missing";

export const createBlockLink = (blockId: string): string =>
  `${BLOCK_LINK_PREFIX}${encodeURIComponent(blockId)}`;

export const parseBlockLink = (href: string): string | null => {
  let hash: string;

  try {
    hash = new URL(href, "http://blackdoc.local").hash;
  } catch {
    return null;
  }

  if (!hash.startsWith(BLOCK_LINK_PREFIX)) {
    return null;
  }

  try {
    return decodeURIComponent(hash.slice(BLOCK_LINK_PREFIX.length)) || null;
  } catch {
    return null;
  }
};

export const isBlockLink = (href: string): boolean =>
  parseBlockLink(href) !== null;

export const getBlockElement = (blockId: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(
    `.bn-block-outer[data-id="${CSS.escape(blockId)}"]`,
  ) ?? document.getElementById(`block=${blockId}`);

let activeHighlight: Animation | null = null;

export const revealBlock = (blockId: string): boolean => {
  const target = getBlockElement(blockId);
  if (!target) {
    return false;
  }

  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  const scroll = target.closest<HTMLElement>(RIGHT_SCROLL_SELECTOR);
  const section = scroll?.closest<HTMLElement>(".split-pane");
  if (scroll) {
    scroll.scrollTo({
      top: Math.max(0, scroll.scrollTop + target.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top - 12),
      behavior: "smooth",
    });
  }
  const top = window.scrollY + (section ?? target).getBoundingClientRect().top - 84;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });

  const highlight = getComputedStyle(document.documentElement)
    .getPropertyValue("--app-anchor-highlight").trim() || "#fff3bf";
  activeHighlight?.cancel();
  activeHighlight = target.animate(
    [
      { backgroundColor: highlight, boxShadow: `0 0 0 5px ${highlight}` },
      { backgroundColor: highlight, boxShadow: `0 0 0 5px ${highlight}`, offset: 0.45 },
      { backgroundColor: "transparent", boxShadow: "none" },
    ],
    { duration: 1800, easing: "ease-out" },
  );
  activeHighlight.addEventListener("finish", () => {
    activeHighlight = null;
  });

  return true;
};
