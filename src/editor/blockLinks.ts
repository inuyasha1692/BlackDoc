export const BLOCK_LINK_PREFIX = "#block=";
export const BLOCK_LINK_COPIED_EVENT = "blockdoc:block-link-copied";
export const BLOCK_LINK_COPY_FAILED_EVENT = "blockdoc:block-link-copy-failed";
export const BLOCK_LINK_MISSING_EVENT = "blockdoc:block-link-missing";

export const createBlockLink = (blockId: string): string =>
  `${BLOCK_LINK_PREFIX}${encodeURIComponent(blockId)}`;

export const parseBlockLink = (href: string): string | null => {
  let hash: string;

  try {
    hash = new URL(href, "http://blockdoc.local").hash;
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

  const top = window.scrollY + target.getBoundingClientRect().top - 84;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });

  activeHighlight?.cancel();
  activeHighlight = target.animate(
    [
      { backgroundColor: "#fff3bf", boxShadow: "0 0 0 5px #fff3bf" },
      { backgroundColor: "#fff3bf", boxShadow: "0 0 0 5px #fff3bf", offset: 0.45 },
      { backgroundColor: "transparent", boxShadow: "none" },
    ],
    { duration: 1800, easing: "ease-out" },
  );
  activeHighlight.addEventListener("finish", () => {
    activeHighlight = null;
  });

  return true;
};
