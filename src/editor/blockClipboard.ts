import { getNodeById, type BlockNoteEditor, type BlockSchema, type InlineContentSchema, type StyleSchema } from "@blocknote/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

export function copyBlockToClipboard<B extends BlockSchema, I extends InlineContentSchema, S extends StyleSchema>(
  editor: BlockNoteEditor<B, I, S>, blockId: string,
): boolean {
  const view = editor.prosemirrorView;
  const node = getNodeById(blockId, view.state.doc);
  const block = editor.getBlock(blockId);
  if (!node || !block || !NodeSelection.isSelectable(node.node)) return false;
  const slice = new Slice(Fragment.from(node.node), 0, 0);
  const html = view.serializeForClipboard(slice).dom.innerHTML;
  const externalHTML = editor.blocksToHTMLLossy([block]);
  const markdown = editor.blocksToMarkdownLossy([block]);
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, node.posBeforeNode)));

  const owner = view.dom.ownerDocument;
  // An image NodeSelection can have no native range, causing Chromium to send
  // copy to BODY instead of the editor. Give the browser a real copy source and
  // handle that event at document level for the duration of this command.
  const source = owner.createElement("textarea");
  source.value = markdown || " ";
  source.tabIndex = -1;
  source.setAttribute("aria-hidden", "true");
  Object.assign(source.style, { position: "fixed", left: "-10000px", top: "0" });
  let written = false;
  const copy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.clipboardData.clearData();
    event.clipboardData.setData("blocknote/html", html);
    event.clipboardData.setData("text/html", externalHTML);
    event.clipboardData.setData("text/plain", markdown);
    written = true;
  };
  owner.addEventListener("copy", copy, true);
  owner.body.append(source);
  try {
    source.focus({ preventScroll: true });
    source.select();
    return owner.execCommand("copy") && written;
  } finally {
    owner.removeEventListener("copy", copy, true);
    source.remove();
    view.focus();
  }
}
