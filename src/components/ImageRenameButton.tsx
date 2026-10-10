import { FileRenameButton, useBlockNoteEditor, useComponentsContext, useEditorState } from "@blocknote/react";
import { Pencil } from "lucide-react";
import { useState } from "react";

export function ImageRenameButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const [open, setOpen] = useState(false);
  const image = useEditorState({ editor, selector: ({ editor }) => {
    const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
    return editor.isEditable && blocks.length === 1 && blocks[0].type === "image" ? blocks[0] : undefined;
  } });
  if (!image) return <FileRenameButton />;
  const label = editor.dictionary.formatting_toolbar.file_rename.tooltip.image;
  return <Components.Generic.Popover.Root open={open} onOpenChange={setOpen}>
    <Components.Generic.Popover.Trigger>
      <Components.FormattingToolbar.Button className="bn-button" label={label} mainTooltip={label} icon={<Pencil size={17} aria-hidden="true" />} onClick={() => setOpen(value => !value)} />
    </Components.Generic.Popover.Trigger>
    <Components.Generic.Popover.Content className="bn-popover-content bn-form-popover" variant="form-popover">
      <Components.Generic.Form.Root>
        <Components.Generic.Form.TextInput name="file-name" icon={<Pencil size={17} aria-hidden="true" />} value={image.props.name} autoFocus
          placeholder={editor.dictionary.formatting_toolbar.file_rename.input_placeholder.image}
          onChange={event => editor.updateBlock(image.id, { props: { name: event.currentTarget.value } })}
          onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); setOpen(false); } }} />
      </Components.Generic.Form.Root>
    </Components.Generic.Popover.Content>
  </Components.Generic.Popover.Root>;
}
