import { BlockNoteEditor } from "@blocknote/core";
import { FormattingToolbarExtension, SideMenuExtension } from "@blocknote/core/extensions";
import { afterEach, expect, it, vi } from "vitest";
import { HIDE_IMAGE_HOVER_TOOLBAR_EVENT, installSplitDividerHover } from "./splitDividerHover";

const editor = BlockNoteEditor.create();
const host = document.createElement("div");
document.body.append(host);
editor.mount(host);
const dispose = installSplitDividerHover(editor);
afterEach(() => {
  dispose();
  editor._tiptapEditor.destroy();
  host.remove();
});

it("reserves the divider for resize and dismisses both block hover toolbars", () => {
  const divider = document.createElement("button");
  divider.className = "split-width-handle";
  const icon = document.createElement("span");
  divider.append(icon);
  editor.prosemirrorView.dom.append(divider);
  const sideMenu = editor.getExtension(SideMenuExtension)!;
  const toolbar = editor.getExtension(FormattingToolbarExtension)!;
  const hide = vi.spyOn(sideMenu, "hideMenuIfNotFrozen");
  const setToolbar = vi.spyOn(toolbar.store, "setState");
  const onImageHide = vi.fn();
  const onEditorMove = vi.fn();
  const elementsFromPoint = document.elementsFromPoint;
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => [editor.prosemirrorView.dom],
  });
  window.addEventListener(HIDE_IMAGE_HOVER_TOOLBAR_EVENT, onImageHide);
  editor.prosemirrorView.dom.addEventListener("mousemove", onEditorMove, true);
  try {
    icon.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    expect(hide).toHaveBeenCalledOnce();
    expect(setToolbar).toHaveBeenCalledWith(false);
    expect(onImageHide).toHaveBeenCalledOnce();

    icon.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 100 }));
    expect(onEditorMove).not.toHaveBeenCalled();

    const content = document.createElement("span");
    editor.prosemirrorView.dom.append(content);
    content.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 110 }));
    expect(onEditorMove).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener(HIDE_IMAGE_HOVER_TOOLBAR_EVENT, onImageHide);
    editor.prosemirrorView.dom.removeEventListener("mousemove", onEditorMove, true);
    divider.remove();
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: elementsFromPoint,
    });
  }
});
