import { createBlockSpec, createExtension, defaultProps } from "@blocknote/core";
import { TextSelection } from "@tiptap/pm/state";

// The title is inline content; the body uses normal BlockNote child blocks.
export const HighlightBlock = createBlockSpec(
  {
    type: "highlight",
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      textColor: defaultProps.textColor,
    },
    content: "inline",
  },
  {
    meta: { isolating: false },
    render: () => {
      const dom = document.createElement("div");
      dom.className = "highlight-title";
      return { dom, contentDOM: dom };
    },
    toExternalHTML: () => {
      const dom = document.createElement("div");
      dom.setAttribute("data-highlight-title", "");
      return { dom, contentDOM: dom };
    },
    parse: element => element.hasAttribute("data-highlight-title") ? {} : undefined,
  },
  [createExtension({
    key: "highlight-keyboard",
    keyboardShortcuts: {
      Enter: ({ editor }) => {
        const view = editor.prosemirrorView;
        if (view.composing || !(view.state.selection instanceof TextSelection)) return false;
        const { selection } = view.state;
        const { block } = editor.getTextCursorPosition();
        if (block.type === "highlight") {
          const first = block.children[0];
          if (selection.empty && selection.$from.parentOffset === selection.$from.parent.content.size
            && first?.type === "paragraph" && Array.isArray(first.content) && !first.content.length
            && !first.children.length) {
            editor.setTextCursorPosition(first, "start");
            return true;
          }
          // Split the title at the caret, preserving formatting in the new body block.
          if (!selection.$from.sameParent(selection.$to)) return false;
          const tr = view.state.tr.deleteSelection();
          const from = tr.selection.$from;
          const tail = from.parent.content.cut(from.parentOffset);
          const titleEnd = from.end();
          let containerDepth = from.depth - 1;
          while (containerDepth > 0 && from.node(containerDepth).type.name !== "blockContainer") containerDepth--;
          if (!containerDepth) return false;
          const container = from.node(containerDepth);
          const bodyBlock = view.state.schema.nodes.blockContainer.create(null, [
            view.state.schema.nodes.paragraph.create(null, tail),
          ]);
          tr.delete(from.pos, titleEnd);
          const insertAt = from.pos + 1;
          if (container.childCount > 1) {
            tr.insert(insertAt + 1, bodyBlock);
            tr.setSelection(TextSelection.create(tr.doc, insertAt + 3));
          } else {
            tr.insert(insertAt, view.state.schema.nodes.blockGroup.create(null, [bodyBlock]));
            tr.setSelection(TextSelection.create(tr.doc, insertAt + 3));
          }
          view.dispatch(tr.scrollIntoView());
          return true;
        }
        const parent = editor.getParentBlock(block);
        if (parent?.type !== "highlight" || !selection.empty) return false;
        if (block.type === "paragraph" && !block.children.length && selection.$from.parent.content.size === 0
          && parent.children.at(-1)?.id === block.id) {
          const [next] = editor.insertBlocks([{ type: "paragraph" }], parent, "after");
          editor.removeBlocks([block]);
          editor.setTextCursorPosition(next, "start");
          return true;
        }
        if (selection.$from.parent.content.size === 0 && !block.children.length
          && editor.schema.blockSchema[block.type].content === "inline") {
          editor.updateBlock(block, { type: "paragraph" });
          return true;
        }
        return false;
      },
      Backspace: ({ editor }) => {
        const view = editor.prosemirrorView;
        const { selection } = view.state;
        if (view.composing || !(selection instanceof TextSelection) || !selection.empty
          || selection.$from.parentOffset !== 0) return false;
        const { block } = editor.getTextCursorPosition();
        const parent = editor.getParentBlock(block);
        if (block.type !== "paragraph" || block.children.length || parent?.type !== "highlight"
          || parent.children[0]?.id !== block.id) return false;
        const from = selection.$from;
        const containerDepth = from.depth - 1;
        const groupDepth = containerDepth - 1;
        const parentDepth = groupDepth - 1;
        if (from.node(containerDepth).type.name !== "blockContainer"
          || from.node(parentDepth).firstChild?.type.name !== "highlight") return false;
        const titleEnd = from.before(parentDepth) + from.node(parentDepth).firstChild!.nodeSize;
        const removeDepth = from.node(groupDepth).childCount === 1 ? groupDepth : containerDepth;
        const tr = view.state.tr.delete(from.before(removeDepth), from.after(removeDepth));
        tr.insert(titleEnd, from.parent.content);
        tr.setSelection(TextSelection.create(tr.doc, titleEnd));
        view.dispatch(tr.scrollIntoView());
        return true;
      },
      "Shift-Tab": ({ editor }) => {
        if (editor.prosemirrorView.composing) return false;
        return editor.getParentBlock(editor.getTextCursorPosition().block)?.type === "highlight";
      },
    },
  })],
);
