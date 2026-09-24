import { createExtension, TrailingNodeExtension } from "@blocknote/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, type Transaction } from "@tiptap/pm/state";
import { transactionTouchesNodeTypes } from "./transactionTouchesNodeTypes";

const structuralBlockTypes = new Set(["blockContainer", "column"]);

function trailingWidgetStateAt(doc: PMNode, pos: number): boolean | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    const parent = $pos.node(depth - 1);
    const isTrailingContainer =
      node.type.name === "column" ||
      (node.type.name === "blockGroup" && parent.type.name === "doc");
    if (isTrailingContainer && $pos.index(depth) === node.childCount - 1) {
      const lastBlock = node.lastChild;
      const lastContent = lastBlock?.firstChild;
      return !(
        lastBlock?.type.name === "blockContainer" &&
        lastContent?.type.name === "paragraph" &&
        lastContent.content.size === 0
      );
    }
  }
  return null;
}

function requiresTrailingNodeRefresh(
  transaction: Transaction,
  oldDoc: PMNode,
  newDoc: PMNode,
) {
  if (transactionTouchesNodeTypes(transaction, structuralBlockTypes, false)) {
    return true;
  }
  const oldSelection = transaction.mapping.invert();
  return [transaction.selection.from, transaction.selection.to].some(pos => {
    const before = trailingWidgetStateAt(oldDoc, oldSelection.map(pos, -1));
    const after = trailingWidgetStateAt(newDoc, pos);
    return before !== after && (before !== null || after !== null);
  });
}

function optimizeTrailingPlugin(plugin: Plugin): Plugin {
  const stateField = plugin.spec.state;
  const key = plugin.spec.key;
  if (!stateField?.apply || !key) return plugin;

  return new Plugin({
    ...plugin.spec,
    state: {
      ...stateField,
      apply(transaction, previous, oldState, newState) {
        if (
          !transaction.docChanged ||
          transaction.getMeta(key) ||
          requiresTrailingNodeRefresh(transaction, oldState.doc, newState.doc)
        ) {
          return stateField.apply!.call(plugin, transaction, previous, oldState, newState);
        }
        return previous.map(transaction.mapping, transaction.doc);
      },
    },
  });
}

export const OptimizedTrailingNodeExtension = createExtension(({ editor }) => {
  const extension = TrailingNodeExtension()({ editor });
  return {
    ...extension,
    key: "blackdoc-trailing-node",
    prosemirrorPlugins: extension.prosemirrorPlugins?.map(optimizeTrailingPlugin),
  };
});
