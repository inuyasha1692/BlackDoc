import type { BlockNoteEditor } from "@blocknote/core";
import { closeHistory } from "@tiptap/pm/history";

export function changeImageIndent(editor: BlockNoteEditor, blockId: string, increase: boolean): boolean {
  if (!editor.isEditable || editor.getBlock(blockId)?.type !== "image") return false;
  editor.setTextCursorPosition(blockId);
  if (!(increase ? editor.canNestBlock() : editor.canUnnestBlock())) return false;
  editor.prosemirrorView.dispatch(closeHistory(editor.prosemirrorState.tr));
  if (increase) editor.nestBlock();
  else editor.unnestBlock();
  editor.prosemirrorView.dispatch(closeHistory(editor.prosemirrorState.tr));
  editor.focus();
  return true;
}
