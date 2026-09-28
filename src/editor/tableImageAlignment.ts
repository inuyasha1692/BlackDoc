import { createExtension } from "@blocknote/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { transactionTouchesNodeTypes } from "./transactionTouchesNodeTypes";

const tableCellTypes = new Set(["tableCell", "tableHeader", "cell", "header_cell", "tableImage"]);

function imageCellDecorations(doc: Node): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((cell, pos) => {
    if (!["cell", "header_cell"].includes(cell.type.spec.tableRole)) return;
    let images = 0;
    let onlyImages = true;
    cell.descendants(node => {
      if (node.type.name === "tableImage") images += 1;
      else if (node.isText) onlyImages &&= !node.text?.trim();
      else if (node.isLeaf) onlyImages = false;
    });
    if (images && onlyImages) {
      decorations.push(Decoration.node(pos, pos + cell.nodeSize, { class: "table-image-only-cell" }));
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

const key = new PluginKey<DecorationSet>("table-image-alignment");

export const TableImageAlignmentExtension = createExtension({
  key: "table-image-alignment",
  prosemirrorPlugins: [new Plugin({
    key,
    state: {
      init: (_, state) => imageCellDecorations(state.doc),
      apply: (transaction, previous) => {
        if (!transaction.docChanged) return previous;
        return transactionTouchesNodeTypes(transaction, tableCellTypes)
          ? imageCellDecorations(transaction.doc)
          : previous.map(transaction.mapping, transaction.doc);
      },
    },
    props: { decorations: state => key.getState(state) },
  })],
});
