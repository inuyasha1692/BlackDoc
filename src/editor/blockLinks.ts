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
let activeScrollFrame: number | null = null;

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
  const innerStart = scroll?.scrollTop ?? 0;
  const innerEnd = scroll
    ? Math.max(0, innerStart + target.getBoundingClientRect().top -
      scroll.getBoundingClientRect().top - 12)
    : 0;
  const outerStart = window.scrollY;
  const outerTarget = (section ?? target).getBoundingClientRect();
  const outerEnd = section &&
    outerTarget.top >= 84 && outerTarget.top < window.innerHeight - 80
    ? outerStart
    : Math.max(0, outerStart + outerTarget.top - 84);

  if (activeScrollFrame !== null) cancelAnimationFrame(activeScrollFrame);
  activeHighlight?.cancel();
  const showHighlight = () => {
    const highlight = getComputedStyle(document.documentElement)
      .getPropertyValue("--app-anchor-highlight").trim() || "#fff3bf";
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
  };
  const move = (progress: number) => {
    if (scroll && innerEnd !== innerStart) {
      scroll.scrollTo({ top: innerStart + (innerEnd - innerStart) * progress, behavior: "instant" });
    }
    if (outerEnd !== outerStart) {
      window.scrollTo({ top: outerStart + (outerEnd - outerStart) * progress, behavior: "instant" });
    }
  };
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    activeScrollFrame = null;
    move(1);
    showHighlight();
    return true;
  }
  let startedAt: number | null = null;
  const distance = Math.max(Math.abs(innerEnd - innerStart), Math.abs(outerEnd - outerStart));
  const duration = Math.min(650, Math.max(240, distance * 0.4));
  const tick = (time: number) => {
    startedAt ??= time;
    const elapsed = Math.min(1, (time - startedAt) / duration);
    move(elapsed < 0.5 ? 4 * elapsed ** 3 : 1 - (-2 * elapsed + 2) ** 3 / 2);
    if (elapsed < 1) activeScrollFrame = requestAnimationFrame(tick);
    else {
      activeScrollFrame = null;
      showHighlight();
    }
  };
  activeScrollFrame = requestAnimationFrame(tick);

  return true;
};
