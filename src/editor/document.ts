import type { Block, PartialBlock } from "@blocknote/core";

export const EMPTY_DOCUMENT: PartialBlock[] = [
  {
    type: "heading",
    props: { level: 1 },
    content: [],
  },
  {
    type: "paragraph",
    content: [],
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isBlockLike = (value: unknown): boolean => {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.props !== undefined && !isRecord(value.props)) {
    return false;
  }

  if (value.children !== undefined) {
    if (!Array.isArray(value.children) || !value.children.every(isBlockLike)) {
      return false;
    }
  }

  return true;
};

export const isBlockDocument = (value: unknown): value is Block[] =>
  Array.isArray(value) && value.length > 0 && value.every(isBlockLike);

const inlineText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(inlineText).join("");
  }

  if (!isRecord(value)) {
    return "";
  }

  if (typeof value.text === "string") {
    return value.text;
  }

  return inlineText(value.content);
};

const findFirstHeading = (blocks: readonly Block[]): Block | undefined => {
  for (const block of blocks) {
    if (block.type === "heading" && block.props.level === 1) {
      return block;
    }

    const nestedHeading = findFirstHeading(block.children);
    if (nestedHeading) {
      return nestedHeading;
    }
  }

  return undefined;
};

export const getDocumentTitle = (blocks: readonly Block[]): string => {
  const heading = findFirstHeading(blocks);
  return heading ? inlineText(heading.content).replace(/\s+/g, " ").trim() : "";
};

const WINDOWS_RESERVED_NAME =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export const sanitizeFileStem = (title: string): string => {
  const titleWithoutControlCharacters = Array.from(title, (character) =>
    character.charCodeAt(0) <= 31 ? " " : character,
  ).join("");
  const stem = titleWithoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);

  if (!stem) {
    return "未命名文档";
  }

  return WINDOWS_RESERVED_NAME.test(stem) ? `_${stem}` : stem;
};

export const sourceFileName = (blocks: readonly Block[]): string =>
  `${sanitizeFileStem(getDocumentTitle(blocks))}.blockdoc.json`;

export const htmlFileName = (
  currentSourceName: string | null,
  blocks: readonly Block[],
): string => {
  if (currentSourceName?.toLowerCase().endsWith(".blockdoc.json")) {
    return `${currentSourceName.slice(0, -".blockdoc.json".length)}.html`;
  }

  return `${sanitizeFileStem(getDocumentTitle(blocks))}.html`;
};

export const cloneDocument = (blocks: readonly Block[]): Block[] =>
  structuredClone(blocks) as Block[];
