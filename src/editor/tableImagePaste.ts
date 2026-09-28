import { CellSelection, isInTable, selectionCell } from "prosemirror-tables";
import { Selection } from "prosemirror-state";
import type { BlackDocEditor } from "./schema";

type PastedImage = { type: "tableImage"; props: { url: string; name: string; previewWidth: number } };

function clipboardImages(clipboard: DataTransfer): PastedImage[] {
  const html = clipboard.getData("blocknote/html") || clipboard.getData("text/html");
  if (!html) return [];
  const root = new DOMParser().parseFromString(html, "text/html").body;
  const elements = Array.from(root.querySelectorAll<HTMLElement>(
    '[data-content-type="image"], [data-inline-content-type="tableImage"], figure, img',
  )).filter(element => !element.parentElement?.closest(
    '[data-content-type="image"], [data-inline-content-type="tableImage"], figure',
  ));
  if (!elements.length) return [];
  const images: PastedImage[] = [];
  for (const element of elements) {
    const owner = element.matches('[data-content-type="image"], [data-inline-content-type="tableImage"], figure') ? element : null;
    if (element.matches("figure")) {
      const remainder = element.cloneNode(true) as HTMLElement;
      remainder.querySelectorAll("img, figcaption").forEach(node => node.remove());
      if (remainder.textContent?.trim() || remainder.querySelector("table,video,audio,iframe,math")) return [];
    }
    const image = element instanceof HTMLImageElement ? element : element.querySelector("img");
    const url = owner?.getAttribute("data-url") || image?.getAttribute("src");
    if (!url?.trim()) return [];
    const width = owner?.getAttribute("data-preview-width") || image?.style.width || image?.getAttribute("width") || "";
    images.push({ type: "tableImage", props: {
      url,
      name: owner?.getAttribute("data-name") || image?.getAttribute("alt") || "粘贴图片",
      previewWidth: /^\d+(?:\.\d+)?(?:px)?$/.test(width) ? Number.parseFloat(width) : 0,
    } });
    element.remove();
  }
  // Leave mixed clipboard content to the default handler so text is not discarded.
  if (root.textContent?.trim() || root.querySelector("[data-content-type],table,video,audio,iframe,math")) return [];
  return images;
}

function insertImages(editor: BlackDocEditor, images: PastedImage[]) {
  if (editor._tiptapEditor.state.selection instanceof CellSelection) {
    const { state, view } = editor._tiptapEditor;
    view.dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(selectionCell(state).pos + 1))));
  }
  editor.insertInlineContent(images, { updateSelection: true });
}

export function pasteTableImage(
  editor: BlackDocEditor,
  clipboard: DataTransfer | null,
  readImage: (file: File) => Promise<string>,
  onError?: (error: unknown) => void,
): boolean {
  if (!editor.isEditable || !clipboard || !isInTable(editor._tiptapEditor.state)) return false;
  const file = Array.from(clipboard.items ?? [])
    .filter(item => item.kind === "file")
    .map(item => item.getAsFile())
    .find(item => item?.type.startsWith("image/"))
    ?? Array.from(clipboard.files ?? []).find(item => item.type.startsWith("image/"));
  if (!file) {
    const images = clipboardImages(clipboard);
    if (!images.length) return false;
    insertImages(editor, images);
    return true;
  }

  const url = URL.createObjectURL(file);
  insertImages(editor, [{
    type: "tableImage",
    props: { url, name: file.name || "粘贴图片", previewWidth: 0 },
  }]);

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
