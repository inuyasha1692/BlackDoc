import type { BlackDocBlock } from "./schema";
import { getHeadingNumbers } from "./headingNumbers";

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  number?: string;
}

type ChangedOutlineBlock = {
  type: string;
  children?: readonly ChangedOutlineBlock[];
};

export function changesAffectOutline(
  changes: readonly {
    block: ChangedOutlineBlock;
    prevBlock?: ChangedOutlineBlock;
  }[],
): boolean {
  const containsHeading = (block: ChangedOutlineBlock | undefined): boolean =>
    block !== undefined && (
      block.type === "heading" ||
      block.children?.some(child => containsHeading(child)) === true
    );

  return changes.some(change =>
    containsHeading(change.block) || containsHeading(change.prevBlock),
  );
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

export const getOutlineItems = (blocks: readonly BlackDocBlock[]): OutlineItem[] => {
  const items: OutlineItem[] = [];
  const numbers = getHeadingNumbers(blocks);

  const visit = (currentBlocks: readonly BlackDocBlock[]) => {
    for (const block of currentBlocks) {
      if (block.type === "heading") {
        const text = contentText(block.content).replace(/\s+/g, " ").trim();
        if (text) {
          items.push({
            id: block.id,
            level: Number(block.props.level) || 1,
            text,
            number: numbers.get(block.id),
          });
        }
      }
      visit(block.children);
    }
  };

  visit(blocks);
  return items;
};
