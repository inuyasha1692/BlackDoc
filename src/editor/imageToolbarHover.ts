import { getNodeById, type BlockNoteEditor } from "@blocknote/core";
import { FormattingToolbarExtension } from "@blocknote/core/extensions";
import { NodeSelection, type SelectionBookmark } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import { HIDE_IMAGE_HOVER_TOOLBAR_EVENT } from "./splitDividerHover";

// The popover keeps its position reference alive while closing. Restoring the
// editor cursor can move that reference, so close without an exit transition.
export const imageToolbarFloatingUIOptions = {
  useTransitionStylesProps: { duration: { open: 250, close: 0 } },
  useTransitionStatusProps: { duration: 0 },
};

export function installImageToolbarHover(editor: Pick<BlockNoteEditor, "prosemirrorView" | "_tiptapEditor" | "getExtension" | "isEditable">) {
  const toolbar = editor.getExtension(FormattingToolbarExtension);
  if (!toolbar) return () => {};
  const dom = editor.prosemirrorView.dom;
  let active: Element | null = null;
  let saved: SelectionBookmark | null = null;
  let previousToolbar = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelHide = () => { clearTimeout(hideTimer); hideTimer = undefined; };
  const inToolbar = (target: Element | null) => Boolean(target?.closest(".bn-toolbar, .bn-form-popover, .bn-menu-dropdown"));
  const restore = () => {
    cancelHide();
    if (!active) return;
    active = null;
    const bookmark = saved;
    saved = null;
    toolbar.store.setState(false);
    if (bookmark && !editor.prosemirrorView.isDestroyed) {
      const view = editor.prosemirrorView;
      view.dispatch(view.state.tr.setSelection(bookmark.resolve(view.state.doc)));
    }
    toolbar.store.setState(previousToolbar);
  };
  const mapSelection = ({ transaction }: { transaction: Transaction }) => {
    if (saved) saved = saved.map(transaction.mapping);
  };
  const enter = (event: PointerEvent) => {
    if (!editor.isEditable || event.buttons || event.pointerType === "touch") return;
    if (inToolbar(document.activeElement)) return;
    const target = event.target instanceof Element ? event.target : null;
    const image = target?.closest("img.bn-visual-media");
    const block = image?.closest('[data-content-type="image"]');
    if (!image || !block) return;
    cancelHide();
    if (active === image) return;
    restore();
    const id = block.closest(".bn-block-outer")?.getAttribute("data-id");
    const view = editor.prosemirrorView;
    const node = id ? getNodeById(id, view.state.doc) : undefined;
    if (!node) return;
    saved = view.state.selection.getBookmark();
    previousToolbar = toolbar.store.state;
    active = image;
    // Use the existing toolbar's image actions without focusing or scrolling the editor.
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, node.posBeforeNode + 1)));
    toolbar.store.setState(true);
  };
  const move = (event: PointerEvent) => {
    if (!active) return;
    const target = event.target instanceof Element ? event.target : null;
    if ((target && active.contains(target)) || inToolbar(target)) { cancelHide(); return; }
    if (hideTimer === undefined) hideTimer = setTimeout(() => {
      hideTimer = undefined;
      if (inToolbar(document.activeElement)) return;
      restore();
    }, 250);
  };
  const pointerDown = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target && active?.contains(target)) {
      // A deliberate click takes over from the temporary hover selection.
      cancelHide(); active = null; saved = null;
    } else if (!inToolbar(target)) restore();
  };
  const keyDown = (event: KeyboardEvent) => {
    if (active && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" &&
      event.target instanceof Node && dom.contains(event.target)) {
      const id = active.closest(".bn-block-outer")?.getAttribute("data-id");
      const view = editor.prosemirrorView;
      const node = id ? getNodeById(id, view.state.doc) : undefined;
      if (node) {
        cancelHide();
        active = null;
        saved = null;
        toolbar.store.setState(false);
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, node.posBeforeNode)));
        return;
      }
    }
    if (event.key === "Escape" || (event.target instanceof Node && dom.contains(event.target))) restore();
  };
  const focusOut = () => {
    if (active && hideTimer === undefined) hideTimer = setTimeout(() => {
      hideTimer = undefined;
      if (!inToolbar(document.activeElement)) restore();
    }, 250);
  };
  const showClickedImage = () => {
    if (dom.querySelector('.ProseMirror-selectednode[data-content-type="image"]')) toolbar.store.setState(true);
  };
  const scroll = (event: Event) => {
    if (!inToolbar(event.target instanceof Element ? event.target : null)) restore();
  };
  editor._tiptapEditor.on("transaction", mapSelection);
  dom.addEventListener("pointerover", enter);
  dom.addEventListener("pointerup", showClickedImage);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerdown", pointerDown, true);
  document.addEventListener("keydown", keyDown, true);
  document.addEventListener("focusout", focusOut);
  document.addEventListener("scroll", scroll, true);
  window.addEventListener(HIDE_IMAGE_HOVER_TOOLBAR_EVENT, restore);
  return () => {
    restore();
    editor._tiptapEditor.off("transaction", mapSelection);
    dom.removeEventListener("pointerover", enter);
    dom.removeEventListener("pointerup", showClickedImage);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerdown", pointerDown, true);
    document.removeEventListener("keydown", keyDown, true);
    document.removeEventListener("focusout", focusOut);
    document.removeEventListener("scroll", scroll, true);
    window.removeEventListener(HIDE_IMAGE_HOVER_TOOLBAR_EVENT, restore);
  };
}
