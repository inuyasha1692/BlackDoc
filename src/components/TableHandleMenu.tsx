import { mapTableCell } from "@blocknote/core";
import { TableHandlesExtension } from "@blocknote/core/extensions";
import {
  AddButton,
  DeleteButton,
  TableHandle,
  type TableHandleMenuProps,
  type TableHandleProps,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useExtension,
  useExtensionState,
} from "@blocknote/react";
import { Menu as MantineMenu } from "@mantine/core";
import { useMemo } from "react";
import { TABLE_CELL_COLORS } from "../editor/tableCellColors";
import "./formattingColors.css";

function TableHandleColors({ orientation }: TableHandleMenuProps) {
  const Components = useComponentsContext()!;
  const dict = useDictionary();
  const editor = useBlockNoteEditor();
  const handles = useExtension(TableHandlesExtension);
  const state = useExtensionState(TableHandlesExtension);
  const block = state?.block;
  const index = orientation === "row" ? state?.rowIndex : state?.colIndex;
  const cells = useMemo(() => {
    if (!handles || !block || index === undefined) return [];
    return orientation === "row"
      ? handles.getCellsAtRowHandle(block, index)
      : handles.getCellsAtColumnHandle(block, index);
  }, [handles, block, index, orientation]);

  if (!block || !cells.length ||
      (!editor.settings.tables.cellTextColor && !editor.settings.tables.cellBackgroundColor)) return null;

  const sections = [
    { property: "textColor", label: dict.color_picker.text_title, enabled: editor.settings.tables.cellTextColor },
    { property: "backgroundColor", label: dict.color_picker.background_title, enabled: editor.settings.tables.cellBackgroundColor },
  ] as const;

  const apply = (property: "textColor" | "backgroundColor", color: string) => {
    const current = editor.getBlock(block.id);
    if (!current || current.type !== "table") return;
    const rows = current.content.rows.map(row => ({
      ...row,
      cells: row.cells.map(cell => mapTableCell(cell)),
    }));
    for (const { row, col } of cells) rows[row].cells[col].props[property] = color;
    editor.updateBlock(current, { content: { ...current.content, rows } });
    editor.setTextCursorPosition(current);
  };

  return <MantineMenu.Sub position="right-start" floatingStrategy="fixed">
    <Components.Generic.Menu.Trigger sub>
      <Components.Generic.Menu.Item className="bn-menu-item" subTrigger>
        {dict.drag_handle.colors_menuitem}
      </Components.Generic.Menu.Item>
    </Components.Generic.Menu.Trigger>
    <Components.Generic.Menu.Dropdown sub className="bn-menu-dropdown bn-color-picker-dropdown table-handle-color-picker">
      {sections.filter(section => section.enabled).map(({ property, label }) =>
        <section key={property} aria-label={label}>
          <div className="formatting-color-label">{label}</div>
          <div className="formatting-color-swatches" role="group" aria-label={label}>
            {TABLE_CELL_COLORS.map(color => <button key={color} type="button"
              aria-label={`${label}：${dict.color_picker.colors[color]}`}
              aria-pressed={cells.every(({ cell }) => mapTableCell(cell).props[property] === color)}
              title={`${label}：${dict.color_picker.colors[color]}`}
              onMouseDown={event => event.preventDefault()}
              onClick={() => apply(property, color)}>
              <span className={`bn-color-icon ${property === "backgroundColor" ? "color-fill" : ""} ${color === "default" && property === "backgroundColor" ? "color-clear" : ""}`}
                data-text-color={property === "textColor" ? color : "default"}
                data-background-color={property === "backgroundColor" ? color : "default"}
                aria-hidden="true">{property === "textColor" ? "A" : ""}</span>
            </button>)}
          </div>
        </section>)}
    </Components.Generic.Menu.Dropdown>
  </MantineMenu.Sub>;
}

function BlackDocTableHandleMenu({ orientation }: TableHandleMenuProps) {
  const Components = useComponentsContext()!;
  const dict = useDictionary();
  const editor = useBlockNoteEditor();
  const state = useExtensionState(TableHandlesExtension);
  const block = state?.block;
  const index = orientation === "row" ? state?.rowIndex : state?.colIndex;
  const isFirst = index === 0 && editor.settings.tables.headers && block?.type === "table";
  const headerProperty = orientation === "row" ? "headerRows" : "headerCols";
  return <Components.Generic.Menu.Dropdown className="bn-menu-dropdown bn-table-handle-menu blackdoc-table-handle-menu">
    <DeleteButton orientation={orientation} />
    {orientation === "row"
      ? <><AddButton orientation="row" side="above" /><AddButton orientation="row" side="below" /></>
      : <><AddButton orientation="column" side="left" /><AddButton orientation="column" side="right" /></>}
    {isFirst && <Components.Generic.Menu.Item className="bn-menu-item"
      checked={Boolean(block.content[headerProperty])}
      onClick={() => editor.updateBlock(block.id, {
        content: { ...block.content, [headerProperty]: block.content[headerProperty] ? undefined : 1 },
      } as never)}>
      {orientation === "row" ? dict.drag_handle.header_row_menuitem : dict.drag_handle.header_column_menuitem}
    </Components.Generic.Menu.Item>}
    <TableHandleColors orientation={orientation} />
  </Components.Generic.Menu.Dropdown>;
}

export function BlackDocTableHandle(props: TableHandleProps) {
  return <TableHandle {...props} tableHandleMenu={() => <BlackDocTableHandleMenu orientation={props.orientation} />} />;
}
