import { createExtension } from "@blocknote/core";

const hasContent = (content: unknown): boolean => {
  if (typeof content === "string") {
    return content.length > 0;
  }

  return Array.isArray(content) ? content.length > 0 : content != null;
};

export const PreserveHeadingLevelExtension = createExtension(({ editor }) => ({
  key: "preserve-heading-level-on-backspace",
  keyboardShortcuts: {
    Backspace: () => {
      const { selection } = editor._tiptapEditor.state;
      if (!selection.empty || selection.$from.parentOffset !== 0) {
        return false;
      }

      const { block, prevBlock } = editor.getTextCursorPosition();
      if (
        block.type !== "heading" ||
        prevBlock?.type !== "heading" ||
        hasContent(prevBlock.content) ||
        prevBlock.children.length > 0
      ) {
        return false;
      }

      editor.removeBlocks([prevBlock.id]);
      editor.setTextCursorPosition(block.id, "start");
      return true;
    },
  },
}));
