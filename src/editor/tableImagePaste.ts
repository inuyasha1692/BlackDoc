import { CellSelection, isInTable, selectionCell } from "prosemirror-tables";
import { Selection } from "prosemirror-state";
import type { BlackDocEditor } from "./schema";

export function pasteTableImage(
  editor: BlackDocEditor,
  clipboard: DataTransfer | null,
  readImage: (file: File) => Promise<string>,
  onError?: (error: unknown) => void,
): boolean {
  if (!clipboard || !isInTable(editor._tiptapEditor.state)) return false;
  const file = Array.from(clipboard.items ?? [])
    .filter(item => item.kind === "file")
    .map(item => item.getAsFile())
    .find(item => item?.type.startsWith("image/"))
    ?? Array.from(clipboard.files ?? []).find(item => item.type.startsWith("image/"));
  if (!file) return false;

  const url = URL.createObjectURL(file);
  if (editor._tiptapEditor.state.selection instanceof CellSelection) {
    const { state, view } = editor._tiptapEditor;
    view.dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(selectionCell(state).pos + 1))));
  }
  editor.insertInlineContent([{
    type: "tableImage",
    props: { url, name: file.name || "粘贴图片", previewWidth: 0 },
  }], { updateSelection: true });

  const finish = (dataUrl?: string) => {
    try {
      if (editor._tiptapEditor.isDestroyed) return;
      const { state, view } = editor._tiptapEditor;
      let transaction = state.tr;
      state.doc.descendants((node, pos) => {
        if (node.type.name !== "tableImage" || node.attrs.url !== url) return;
        transaction = dataUrl
          ? transaction.setNodeMarkup(pos, undefined, { ...node.attrs, url: dataUrl })
          : transaction.delete(pos, pos + node.nodeSize);
        return false;
      });
      if (transaction.docChanged) view.dispatch(transaction);
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  void readImage(file).then(
    dataUrl => {
      try { finish(dataUrl); } catch (error) { onError?.(error); }
    },
    error => {
      try { finish(); } finally { onError?.(error); }
    },
  );
  return true;
}
