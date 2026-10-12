import { CornerUpLeft } from "lucide-react";
import { useBlockNoteEditor, useComponentsContext, useEditorState } from "@blocknote/react";
import { copyBlockLink, COPY_BLOCK_LINK_LABEL } from "../editor/blockLinks";

export function CopyBlockLinkButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const id = useEditorState({ editor, selector: ({ editor }) => {
    const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
    return blocks.length === 1 ? blocks[0].id : undefined;
  } });
  if (!id) return null;
  return <>
    <span className="block-link-toolbar-separator" role="separator" aria-orientation="vertical" />
    <Components.FormattingToolbar.Button className="bn-button" label={COPY_BLOCK_LINK_LABEL} mainTooltip={COPY_BLOCK_LINK_LABEL}
      icon={<CornerUpLeft size={17} aria-hidden="true" />}
      onClick={() => { void copyBlockLink(id); }} />
  </>;
}
