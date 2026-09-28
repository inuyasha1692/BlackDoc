import type { BlockNoteEditor, BlockSchema, InlineContentSchema, StyleSchema } from "@blocknote/core";
import { FormattingToolbarExtension, SideMenuExtension } from "@blocknote/core/extensions";

export const HIDE_IMAGE_HOVER_TOOLBAR_EVENT = "blackdoc-hide-image-hover-toolbar";

export function installSplitDividerHover<
  BSchema extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema,
>(editor: BlockNoteEditor<BSchema, I, S>) {
  const sideMenu = editor.getExtension(SideMenuExtension);
  const formattingToolbar = editor.getExtension(FormattingToolbarExtension);

  const isDivider = (event: Event) => {
    const target = event.target;
    return target instanceof Element &&
      editor.prosemirrorView.dom.contains(target) &&
      Boolean(target.closest(".split-width-handle"));
  };

  const dismissBlockHover = (event: Event) => {
    if (!isDivider(event)) return;
    window.dispatchEvent(new Event(HIDE_IMAGE_HOVER_TOOLBAR_EVENT));
    formattingToolbar?.store.setState(false);
    if (sideMenu?.menuFrozen) sideMenu.unfreezeMenu();
    else sideMenu?.hideMenuIfNotFrozen();
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!isDivider(event)) return;
    dismissBlockHover(event);
    // BlockNote otherwise hit-tests the adjacent column from the divider's x/y.
    event.stopPropagation();
  };

  window.addEventListener("pointerover", dismissBlockHover, true);
  window.addEventListener("mousemove", onMouseMove, true);
  return () => {
    window.removeEventListener("pointerover", dismissBlockHover, true);
    window.removeEventListener("mousemove", onMouseMove, true);
  };
}
