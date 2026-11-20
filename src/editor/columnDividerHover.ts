import type { BlockNoteEditor, BlockSchema, InlineContentSchema, StyleSchema } from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { HIDE_IMAGE_HOVER_TOOLBAR_EVENT } from "./splitDividerHover";

const HOVER_CLASS = "blackdoc-column-divider-hover";
const DIVIDER_MARGIN = 12;

// Reserve a narrow strip for BlockNote's column resize handler when floating
// block controls or image resize handles overlap the boundary.
export function installColumnDividerHover<
  B extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema,
>(editor: BlockNoteEditor<B, I, S>) {
  const dom = editor.prosemirrorView.dom;
  const sideMenu = editor.getExtension(SideMenuExtension);
  let active = false;

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    document.body.classList.toggle(HOVER_CLASS, next);
    if (next) {
      sideMenu?.hideMenuIfNotFrozen();
      window.dispatchEvent(new Event(HIDE_IMAGE_HOVER_TOOLBAR_EVENT));
    }
  };

  const move = (event: PointerEvent) => {
    if (event.buttons) return;
    if (!editor.isEditable || sideMenu?.menuFrozen || event.pointerType === "touch") {
      setActive(false);
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const candidates = target?.closest(".bn-side-menu")
      ? document.elementsFromPoint(event.clientX, event.clientY)
      : target ? [target] : [];
    const column = candidates
      .filter(element => dom.contains(element))
      .map(element => element.closest<HTMLElement>(".bn-block-column"))
      .find(element => element && dom.contains(element));
    if (!column || !column.parentElement?.classList.contains("bn-block-column-list")) {
      setActive(false);
      return;
    }
    const rect = column.getBoundingClientRect();
    const withinHeight = event.clientY >= rect.top && event.clientY <= rect.bottom;
    const nearLeft = column.previousElementSibling && Math.abs(event.clientX - rect.left) <= DIVIDER_MARGIN;
    const nearRight = column.nextElementSibling && Math.abs(event.clientX - rect.right) <= DIVIDER_MARGIN;
    setActive(Boolean(withinHeight && (nearLeft || nearRight)));
  };

  const clear = () => setActive(false);
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", clear, true);
  window.addEventListener("blur", clear);
  return () => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", clear, true);
    window.removeEventListener("blur", clear);
    clear();
  };
}
