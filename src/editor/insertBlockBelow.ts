import type { BlockNoteEditor } from "@blocknote/core";
import { closeHistory } from "@tiptap/pm/history";

export function insertBlockBelowFromMenu(editor: BlockNoteEditor, blockId: string, create: () => void): boolean {
  if (!editor.isEditable || !editor.getBlock(blockId)) return false;
  editor.prosemirrorView.dispatch(closeHistory(editor.prosemirrorState.tr));
  editor.transact(() => {
    const [placeholder] = editor.insertBlocks([{ type: "paragraph" }], blockId, "after");
    editor.setTextCursorPosition(placeholder, "start");
    editor.focus();
    create();
  });
  editor.prosemirrorView.dispatch(closeHistory(editor.prosemirrorState.tr));
  return true;
}
