import { Menu as MantineMenu } from "@mantine/core";
import { useBlockNoteEditor, useComponentsContext, useEditorState } from "@blocknote/react";
import { AlignCenter, AlignLeft, AlignRight, IndentDecrease, IndentIncrease } from "lucide-react";
import { changeImageIndent } from "../editor/imageIndent";

export function ImageIndentButton({ increase }: { increase: boolean }) {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const state = useEditorState({ editor, selector: ({ editor }) => {
    if (!editor.isEditable) return;
    const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
    if (blocks.length !== 1 || blocks[0].type !== "image") return;
    return { id: blocks[0].id, enabled: increase ? editor.canNestBlock() : editor.canUnnestBlock() };
  } });
  if (!state) return null;
  const label = increase ? "增加缩进" : "减少缩进";
  return <Components.FormattingToolbar.Button className="bn-button" label={label} mainTooltip={label}
    isDisabled={!state.enabled} icon={increase ? <IndentIncrease size={18} /> : <IndentDecrease size={18} />}
    onClick={() => changeImageIndent(editor, state.id, increase)} />;
}

export function ImageIndentMenu({ blockId, onApplied }: { blockId: string; onApplied: () => void }) {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const state = useEditorState({ editor, selector: ({ editor }) => {
    const block = editor.getBlock(blockId);
    const selected = editor.getTextCursorPosition().block.id === blockId;
    return { alignment: block?.props.textAlignment, increase: selected && editor.canNestBlock(), decrease: selected && editor.canUnnestBlock() };
  } });
  return <MantineMenu.Sub position="right-start" floatingStrategy="fixed" width={200}
    onChange={open => { if (open && editor.getBlock(blockId)) editor.setTextCursorPosition(blockId); }}>
    <Components.Generic.Menu.Trigger sub>
      <Components.Generic.Menu.Item subTrigger className="bn-menu-item" icon={<AlignLeft size={16} />}>
        缩进和对齐
      </Components.Generic.Menu.Item>
    </Components.Generic.Menu.Trigger>
    <Components.Generic.Menu.Dropdown sub className="bn-menu-dropdown">
      {([
        ["left", "左对齐", AlignLeft], ["center", "居中对齐", AlignCenter], ["right", "右对齐", AlignRight],
      ] as const).map(([alignment, label, Icon]) => <Components.Generic.Menu.Item key={alignment}
        className="bn-menu-item" icon={<Icon size={16} />} checked={state.alignment === alignment}
        onClick={() => { editor.updateBlock(blockId, { props: { textAlignment: alignment } }); onApplied(); }}>
        {label}
      </Components.Generic.Menu.Item>)}
      <Components.Generic.Menu.Divider />
      {([true, false] as const).map(increase => <MantineMenu.Item key={String(increase)}
        className="bn-menu-item" disabled={!editor.isEditable || !(increase ? state.increase : state.decrease)}
        leftSection={increase ? <IndentIncrease size={16} /> : <IndentDecrease size={16} />}
        onClick={() => { changeImageIndent(editor, blockId, increase); onApplied(); }}>
        {increase ? "增加缩进" : "减少缩进"}
      </MantineMenu.Item>)}
    </Components.Generic.Menu.Dropdown>
  </MantineMenu.Sub>;
}
