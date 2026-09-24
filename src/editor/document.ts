import type { BlackDocBlock, BlackDocPartialBlock } from "./schema";

export const EMPTY_DOCUMENT: BlackDocPartialBlock[] = [
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

const isBlockLike = (
  value: unknown,
  insideSplit = false,
  columnAllowed = false,
  insideMultiColumn = false,
): boolean => {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.props !== undefined && !isRecord(value.props)) {
    return false;
  }

  if (value.type === "columnList") {
    if (insideMultiColumn || !Array.isArray(value.children) || value.children.length < 2) {
      return false;
    }
    return value.children.every(column =>
      isRecord(column) && column.type === "column" && isRecord(column.props) &&
      (column.props.width === undefined ||
        (typeof column.props.width === "number" && Number.isFinite(column.props.width) && column.props.width > 0)) &&
      Array.isArray(column.children) && column.children.length > 0 &&
      column.children.every(child => isRecord(child) &&
        child.type !== "column" && child.type !== "columnList" &&
        isBlockLike(child, insideSplit, false, true)),
    );
  }
  if (value.type === "column" || (value.type === "columnList" && insideMultiColumn)) {
    return false;
  }

  if (value.type === "splitPane") {
    if (insideSplit || !Array.isArray(value.children) || value.children.length !== 2) return false;
    const props = isRecord(value.props) ? value.props : {};
    if (props.leftWidth !== undefined &&
      (typeof props.leftWidth !== "number" || !Number.isFinite(props.leftWidth) ||
        props.leftWidth < 25 || props.leftWidth > 75)) return false;
    if (props.rightHeight !== undefined &&
      (typeof props.rightHeight !== "number" || !Number.isFinite(props.rightHeight) ||
        (props.rightHeight !== 0 && (props.rightHeight < 160 || props.rightHeight > 1200)))) return false;
    return value.children.every((column, index) =>
      isRecord(column) && column.type === "splitColumn" &&
      isRecord(column.props) && column.props.side === (index === 0 ? "left" : "right") &&
      isBlockLike(column, true, true, insideMultiColumn));
  }
  if (value.type === "splitColumn" && (!insideSplit || !columnAllowed ||
    !Array.isArray(value.children) || value.children.length === 0)) return false;

  if (value.children !== undefined) {
    if (!Array.isArray(value.children) ||
      !value.children.every(child => isBlockLike(child, insideSplit, false, insideMultiColumn))) {
      return false;
    }
  }

  return true;
};

export const isBlackDocument = (value: unknown): value is BlackDocBlock[] =>
  Array.isArray(value) && value.length > 0 && value.every(block => isBlockLike(block));

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

const findFirstHeading = (blocks: readonly BlackDocBlock[]): BlackDocBlock | undefined => {
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

export const getDocumentTitle = (blocks: readonly BlackDocBlock[]): string => {
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

export const sourceFileName = (blocks: readonly BlackDocBlock[]): string =>
  `${sanitizeFileStem(getDocumentTitle(blocks))}.bdoc`;

export const htmlFileName = (
  currentSourceName: string | null,
  blocks: readonly BlackDocBlock[],
): string => {
  const suffix = ".bdoc";
  if (currentSourceName?.toLowerCase().endsWith(suffix)) {
    return `${currentSourceName.slice(0, -suffix.length)}.html`;
  }

  return `${sanitizeFileStem(getDocumentTitle(blocks))}.html`;
};

export const cloneDocument = (blocks: readonly BlackDocBlock[]): BlackDocBlock[] =>
  structuredClone(blocks) as BlackDocBlock[];
