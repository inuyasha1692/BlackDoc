import type { BlackDocBlock } from "./schema";

export const getHeadingNumbers = (
  blocks: readonly BlackDocBlock[],
): Map<string, string> => {
  const counters = Array<number>(7).fill(0);
  const numbers = new Map<string, string>();

  const visit = (items: readonly BlackDocBlock[]) => {
    for (const block of items) {
      if (block.type === "heading") {
        const level = Math.min(6, Math.max(1, Number(block.props.level) || 1));
        if (level === 1) {
          counters.fill(0, 2);
        } else {
          counters[level] += 1;
          counters.fill(0, level + 1);
          numbers.set(block.id, counters.slice(2, level + 1).join("."));
        }
      }
      visit(block.children);
    }
  };

  visit(blocks);
  return numbers;
};
