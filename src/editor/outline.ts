import type { Block } from "@blocknote/core";

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
}

const contentText = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (typeof item !== "object" || item === null) {
        return "";
      }
      if ("text" in item && typeof item.text === "string") {
        return item.text;
      }
      if ("content" in item) {
        return contentText(item.content);
      }
      return "";
    })
    .join("");
};

export const getOutlineItems = (blocks: readonly Block[]): OutlineItem[] => {
  const items: OutlineItem[] = [];

  const visit = (currentBlocks: readonly Block[]) => {
    for (const block of currentBlocks) {
      if (block.type === "heading") {
        const text = contentText(block.content).replace(/\s+/g, " ").trim();
        if (text) {
          items.push({
            id: block.id,
            level: Number(block.props.level) || 1,
            text,
          });
        }
      }
      visit(block.children);
    }
  };

  visit(blocks);
  return items;
};

