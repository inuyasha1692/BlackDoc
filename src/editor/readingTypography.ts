import { createExtension } from "@blocknote/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

function readingKind(block: PMNode): string {
  const content = block.firstChild;
  if (!content) return "other";
  if (["bulletListItem", "numberedListItem", "checkListItem", "toggleListItem"].includes(content.type.name)) return "list";
  if (content.type.name !== "paragraph") return content.type.name;
  let hasText = false;
  let allBold = true;
  content.descendants(node => {
    if (node.isText && node.text?.trim()) {
      hasText = true;
      if (!node.marks.some(mark => mark.type.name === "bold")) allBold = false;
    } else if (node.isInline && !node.isText && node.type.name !== "hardBreak") allBold = false;
  });
  return hasText && allBold ? "label" : "paragraph";
}

// Decorations describe presentation only; they never alter document blocks,
// heading levels, exports or undo history.
function typography(doc: PMNode) {
  const decorations: Decoration[] = [];
  const paragraph = (kind: string) => kind === "paragraph" || kind === "label";
  doc.descendants((group, groupPos) => {
    if (group.type.name !== "blockGroup") return;
    const items: { node: PMNode; pos: number; kind: string }[] = [];
    group.forEach((node, offset) => {
      if (node.type.name === "blockContainer") items.push({ node, pos: groupPos + 1 + offset, kind: readingKind(node) });
    });
    items.forEach(({ node, pos, kind }, index) => {
      const previous = items[index - 1]?.kind;
      const next = items[index + 1]?.kind;
      let before = 0;
      let after = 0;
      if (paragraph(kind)) {
        if (previous && paragraph(previous)) before = 8;
      } else if (kind === "list") {
        if (previous && paragraph(previous)) before = 6;
        if (next && paragraph(next)) after = 6;
      } else if (kind === "heading") {
        const level = Number(node.firstChild!.attrs.level);
        before = previous === "table" ? 18 : !previous ? 0 : level <= 2 ? 28 : level <= 4 ? 24 : 20;
        after = next === "table" ? 3 : level <= 2 ? 12 : level <= 4 ? 8 : 6;
      }
      decorations.push(Decoration.node(pos, pos + node.nodeSize, {
        "data-reading-kind": kind,
        style: `--reading-before: ${before}px; --reading-after: ${after}px`,
      }));
    });
  });
  return DecorationSet.create(doc, decorations);
}

const key = new PluginKey<DecorationSet>("reading-typography");
export const ReadingTypographyExtension = createExtension(() => ({
  key: "reading-typography",
  prosemirrorPlugins: [new Plugin({
    key,
    state: {
      init: (_, state) => typography(state.doc),
      apply: (tr, previous) => tr.docChanged ? typography(tr.doc) : previous,
    },
    props: { decorations: state => key.getState(state) },
  })],
}));
