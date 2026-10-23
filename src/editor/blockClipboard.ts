import { createExtension, getNodeById, type BlockNoteEditor, type BlockSchema, type InlineContentSchema, type StyleSchema } from "@blocknote/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { NodeSelection, Plugin, TextSelection } from "@tiptap/pm/state";

export function withBlockClipboardPayload(owner: Document, externalHTML: string, internalHTML: string): string {
  const payload = owner.createElement("template");
  payload.setAttribute("data-blackdoc-clipboard", "1");
  payload.innerHTML = internalHTML;
  return externalHTML + payload.outerHTML;
}

export const BlockClipboardExtension = createExtension(() => ({
  key: "block-clipboard",
  prosemirrorPlugins: [new Plugin({
    view(view) {
      const owner = view.dom.ownerDocument;
      // BlockNote's copy/cut handler writes the clipboard at the editor first.
      // Preserve its exact selection after that handler has finished bubbling.
      const preserve = (event: ClipboardEvent) => {
        if (!(event.target instanceof Node) || !view.dom.contains(event.target) || !event.clipboardData) return;
        let internalHTML = event.clipboardData.getData("blocknote/html");
        if (!internalHTML) return;
        const { selection, doc } = view.state;
        const { $from, $to } = selection;
        // Text selected inside one cell is inline content. Keeping its table
        // ancestors in the clipboard slice can make insertion into a heading fail.
        if (event.type === "copy" && selection instanceof TextSelection && $from.sameParent($to)
          && $from.parent.isTextblock && Array.from({ length: $from.depth }, (_, index) => $from.node(index + 1))
            .some(node => node.type.spec.tableRole === "cell" || node.type.spec.tableRole === "header_cell")) {
          internalHTML = view.serializeForClipboard(new Slice(doc.slice(selection.from, selection.to).content, 0, 0)).dom.innerHTML;
          event.clipboardData.setData("blocknote/html", internalHTML);
        }
        const externalHTML = event.clipboardData.getData("text/html");
        if (externalHTML.includes('<template data-blackdoc-clipboard="1">')) return;
        event.clipboardData.setData("text/html", withBlockClipboardPayload(owner, externalHTML, internalHTML));
      };
      owner.addEventListener("copy", preserve);
      owner.addEventListener("cut", preserve);
      return { destroy() {
        owner.removeEventListener("copy", preserve);
        owner.removeEventListener("cut", preserve);
      } };
    },
  })],
}));

export function pasteBlockClipboard<B extends BlockSchema, I extends InlineContentSchema, S extends StyleSchema>(
  editor: BlockNoteEditor<B, I, S>, clipboard: DataTransfer | null,
): boolean {
  if (!clipboard || clipboard.types.includes("blocknote/html")) return false;
  const { $from, $to } = editor.prosemirrorView.state.selection;
  if ($from.parent.type.spec.code && $to.parent.type.spec.code) return false;
  const html = clipboard.getData("text/html");
  if (!html.includes("data-blackdoc-clipboard")) return false;
  const container = editor.prosemirrorView.dom.ownerDocument.createElement("div");
  container.innerHTML = html;
  const payload = container.querySelector("template[data-blackdoc-clipboard]");
  if (!payload?.innerHTML) return false;
  editor.pasteHTML(payload.innerHTML, true);
  return true;
}

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
  // Native clipboards may discard custom MIME types between document windows.
  // Keep the lossless BlockNote representation inside the standard HTML too.
  const clipboardHTML = withBlockClipboardPayload(view.dom.ownerDocument, externalHTML, html);
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
    event.clipboardData.setData("text/html", clipboardHTML);
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
