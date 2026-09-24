import { blockToNode, createExtension } from "@blocknote/core";
import { joinBackward } from "@tiptap/pm/commands";
import { isHistoryTransaction } from "@tiptap/pm/history";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Set on the transaction that replaces a document already validated by the loader. */
export const SPLIT_DOCUMENT_REPLACE_META = "split-document-replace";

type BlockEntry = {
  node: PMNode;
  pos: number;
  type: string;
  parentId: string | null;
};

function inspect(doc: PMNode) {
  const blocks = new Map<string, BlockEntry>();
  const panes: BlockEntry[] = [];
  const columns: BlockEntry[] = [];
  let valid = true;

  function visit(node: PMNode, pos: number, parent: BlockEntry | null, inPane: boolean) {
    let nextParent = parent;
    let nextInPane = inPane;
    if (node.type.name === "blockContainer") {
      const type = node.firstChild!.type.name;
      const entry = { node, pos, type, parentId: parent?.node.attrs.id ?? null };
      const id = node.attrs.id as string | null | undefined;
      // Native paste clears IDs until UniqueID's appended transaction assigns them.
      // These nodes still need structural validation, but do not yet have identities.
      if (id != null) {
        if (blocks.has(id)) valid = false;
        blocks.set(id, entry);
      }
      nextParent = entry;
      if (type === "splitPane") {
        panes.push(entry);
        nextInPane = true;
        const group = node.childCount === 2 ? node.child(1) : null;
        if (
          inPane || !group || group.childCount !== 2 ||
          group.child(0).firstChild?.type.name !== "splitColumn" ||
          group.child(1).firstChild?.type.name !== "splitColumn" ||
          group.child(0).firstChild?.attrs.side !== "left" ||
          group.child(1).firstChild?.attrs.side !== "right"
        ) valid = false;
      } else if (type === "splitColumn") {
        columns.push(entry);
        if (parent?.type !== "splitPane") valid = false;
      }
    }
    node.forEach((child, offset) => visit(child, pos + 1 + offset, nextParent, nextInPane));
  }

  // The document's content starts at zero, unlike all other nodes.
  doc.forEach((child, offset) => visit(child, offset, null, false));
  return { blocks, panes, columns, valid };
}

function bypass(tr: Transaction): boolean {
  if (tr.getMeta(SPLIT_DOCUMENT_REPLACE_META) || isHistoryTransaction(tr)) return true;
  const root = tr.getMeta("appendedTransaction") as Transaction | undefined;
  return root !== undefined && bypass(root);
}

function hasContent(pane: PMNode): boolean {
  let nonempty = false;
  pane.descendants(node => {
    if (nonempty) return false;
    if (node.type.name !== "blockContainer") return true;
    const content = node.firstChild!;
    if (content.type.name === "splitColumn") return true;
    if (content.type.name !== "paragraph" || content.textContent.trim()) {
      nonempty = true;
    } else {
      content.descendants(inline => {
        if (inline.isLeaf && !inline.isText && inline.type.name !== "hardBreak") nonempty = true;
      });
    }
    return true;
  });
  return nonempty;
}

export const SplitPaneExtension = createExtension(() => ({
  key: "split-pane-protection",
  keyboardShortcuts: {
    Backspace: ({ editor }) => {
      const { state, view } = editor._tiptapEditor;
      const { $from, empty } = state.selection;
      if (!empty || $from.parentOffset !== 0 || $from.parent.type.name !== "paragraph") return false;
      const depth = $from.depth;
      if (
        depth < 3 ||
        $from.node(depth - 1).type.name !== "blockContainer" ||
        $from.node(depth - 2).type.name !== "blockGroup" ||
        $from.node(depth - 3).firstChild?.type.name !== "splitColumn"
      ) return false;
      // BlockNote normally lifts nested paragraphs first. Column children instead
      // merge with their previous sibling, while the first child stays in its column.
      if ($from.index(depth - 2) === 0) return true;
      return joinBackward(state, view.dispatch, view);
    },
  },
  prosemirrorPlugins: [
    new Plugin({
      key: new PluginKey("split-pane-protection"),
      props: {
        decorations(state) {
          const decorations: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name !== "blockContainer") return;
            const content = node.firstChild!;
            if (content.type.name === "splitPane") {
              decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                class: "split-pane split-pane-editor",
              }));
            } else if (content.type.name === "splitColumn") {
              decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "split-pane-column" }));
              if (content.attrs.side === "right" && node.childCount === 2) {
                const start = pos + 1 + content.nodeSize;
                decorations.push(Decoration.node(start, start + node.child(1).nodeSize, {
                  class: "split-pane-right-scroll",
                }));
              }
            }
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
      filterTransaction(tr, state) {
        if (!tr.docChanged || bypass(tr)) return true;
        const before = inspect(state.doc);
        const after = inspect(tr.doc);
        if (!after.valid) return false;

        for (const pane of before.panes) {
          const remaining = after.blocks.get(pane.node.attrs.id);
          if (!remaining) continue;
          if (remaining.type !== "splitPane") return false;
          // Columns keep their identities and order even if their side props change.
          const oldColumns = pane.node.lastChild!;
          const newColumns = remaining.node.lastChild!;
          if (oldColumns.childCount !== newColumns.childCount) return false;
          for (let index = 0; index < oldColumns.childCount; index++) {
            if (oldColumns.child(index).attrs.id !== newColumns.child(index).attrs.id) return false;
          }
        }
        for (const column of before.columns) {
          const remaining = after.blocks.get(column.node.attrs.id);
          if (remaining && (
            remaining.type !== "splitColumn" || remaining.parentId !== column.parentId
          )) return false;
        }

        const deletesContent = before.panes.some(
          pane => pane.node.attrs.id != null &&
            !after.blocks.has(pane.node.attrs.id) && hasContent(pane.node),
        );
        return !deletesContent || window.confirm("此分栏包含内容，确定删除整个分栏及其中的内容吗？");
      },
      appendTransaction(transactions, _oldState, state) {
        if (!transactions.some(tr => tr.docChanged) || transactions.some(bypass)) return null;
        const emptyColumns = inspect(state.doc).columns.filter(column => column.node.childCount === 1);
        if (!emptyColumns.length) return null;
        const tr = state.tr;
        // Work backwards so inserting a group does not shift the remaining positions.
        for (const column of emptyColumns.reverse()) {
          const paragraph = blockToNode({ type: "paragraph" }, state.schema);
          tr.insert(
            column.pos + column.node.nodeSize - 1,
            state.schema.nodes.blockGroup.createChecked(null, paragraph),
          );
        }
        return tr;
      },
    }),
  ],
}));
