import type { Node as PMNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

export function transactionTouchesNodeTypes(
  transaction: Transaction,
  nodeTypes: ReadonlySet<string>,
  includeAncestors = true,
): boolean {
  const touches = (doc: PMNode, from: number, to: number) => {
    const start = Math.max(0, Math.min(from, doc.content.size));
    const end = Math.max(start, Math.min(Math.max(to, start + 1), doc.content.size));
    const $start = doc.resolve(start);
    if (includeAncestors) {
      for (let depth = 0; depth <= $start.depth; depth += 1) {
        if (nodeTypes.has($start.node(depth).type.name)) return true;
      }
    } else {
      const node = doc.nodeAt(start);
      if (nodeTypes.has(node?.type.name ?? "") ||
        nodeTypes.has(node?.firstChild?.type.name ?? "")) return true;
    }

    let found = false;
    doc.nodesBetween(start, end, (node, pos) => {
      if (
        nodeTypes.has(node.type.name) &&
        pos >= start &&
        pos + node.nodeSize <= end
      ) {
        found = true;
        return false;
      }
      return !found;
    });
    return found;
  };

  for (let index = 0; index < transaction.steps.length; index += 1) {
    const step = transaction.steps[index];
    const oldDoc = transaction.docs[index];
    const newDoc = transaction.docs[index + 1] ?? transaction.doc;
    const positionedStep = step as typeof step & { pos?: number };
    if (positionedStep.pos !== undefined) {
      const pos = positionedStep.pos;
      if (
        touches(oldDoc, pos, pos + 1) ||
        touches(newDoc, pos, pos + 1)
      ) return true;
    }

    let rangeTouches = false;
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      if (
        touches(oldDoc, oldStart, oldEnd) ||
        touches(newDoc, newStart, newEnd)
      ) {
        rangeTouches = true;
      }
    });
    if (rangeTouches) return true;
  }

  return false;
}
