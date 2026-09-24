import { TableHandlesExtension } from "@blocknote/core/extensions";
import {
  SplitButton,
  TableCellButton,
  type TableCellButtonProps,
  TableCellMenu,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useExtensionState,
} from "@blocknote/react";
import { colorTableCells, colorTargetCells, type CellColorProperty } from "../editor/tableCellColors";

const colors = ["default", "gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;

function SelectionColorMenu() {
  const Components = useComponentsContext()!;
  const dict = useDictionary();
  const editor = useBlockNoteEditor();
  const handles = useExtensionState(TableHandlesExtension);
  if (!handles || handles.rowIndex === undefined || handles.colIndex === undefined) return null;
  const { block, rowIndex, colIndex } = handles;
  const positions = colorTargetCells(editor.prosemirrorState, block.id, rowIndex, colIndex);
  const sections: { property: CellColorProperty; label: string; enabled: boolean }[] = [
    { property: "textColor", label: dict.color_picker.text_title, enabled: editor.settings.tables.cellTextColor },
    { property: "backgroundColor", label: dict.color_picker.background_title, enabled: editor.settings.tables.cellBackgroundColor },
  ];

  return (
    <TableCellMenu>
      <SplitButton />
      <Components.Generic.Menu.Root position="right" sub>
        <Components.Generic.Menu.Trigger sub>
          <Components.Generic.Menu.Item className="bn-menu-item" subTrigger>
            {dict.drag_handle.colors_menuitem}
          </Components.Generic.Menu.Item>
        </Components.Generic.Menu.Trigger>
        <Components.Generic.Menu.Dropdown sub className="bn-menu-dropdown bn-color-picker-dropdown">
          {sections.filter(section => section.enabled).map(({ property, label }) => (
            <div key={property}>
              <Components.Generic.Menu.Label>{label}</Components.Generic.Menu.Label>
              {colors.map(color => (
                <Components.Generic.Menu.Item
                  key={color}
                  data-test={`${property === "backgroundColor" ? "background" : "text"}-color-${color}`}
                  checked={positions.length > 0 && positions.every(pos =>
                    editor.prosemirrorState.doc.nodeAt(pos)?.attrs[property] === color,
                  )}
                  icon={
                    <span
                      className="bn-color-icon"
                      data-background-color={property === "backgroundColor" ? color : "default"}
                      data-text-color={property === "textColor" ? color : "default"}
                      style={{ width: 18, height: 18, fontSize: 13.5, lineHeight: "18px", textAlign: "center", pointerEvents: "none" }}
                      aria-hidden="true"
                    >A</span>
                  }
                  onClick={() => {
                    const state = editor.prosemirrorState;
                    const targets = colorTargetCells(state, block.id, rowIndex, colIndex);
                    editor.prosemirrorView.dispatch(colorTableCells(state, targets, property, color));
                  }}
                >{dict.color_picker.colors[color]}</Components.Generic.Menu.Item>
              ))}
            </div>
          ))}
        </Components.Generic.Menu.Dropdown>
      </Components.Generic.Menu.Root>
    </TableCellMenu>
  );
}

export function BlackDocTableCellButton(props: TableCellButtonProps) {
  return <TableCellButton {...props} tableCellMenu={SelectionColorMenu} />;
}
