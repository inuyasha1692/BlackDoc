import { ShowSelectionExtension } from "@blocknote/core/extensions";
import {
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useEditorState,
  useExtension,
} from "@blocknote/react";
import { PaintBucket } from "lucide-react";
import { CellSelection } from "prosemirror-tables";
import { useEffect, useState } from "react";
import { colorTableCells } from "../editor/tableCellColors";
import { TABLE_CELL_COLORS } from "./TableCellColorMenu";
import "./formattingColors.css";

export function TableSelectionBackgroundColorButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const dict = useDictionary();
  const [open, setOpen] = useState(false);
  const { showSelection } = useExtension(ShowSelectionExtension);
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const selection = currentEditor.prosemirrorState.selection;
      if (!currentEditor.isEditable || !(selection instanceof CellSelection)) {
        return undefined;
      }

      const backgrounds = new Set<string>();
      selection.forEachCell(cell => {
        backgrounds.add(cell.attrs.backgroundColor ?? "default");
      });
      return {
        backgroundColor: backgrounds.size === 1
          ? [...backgrounds][0]
          : "mixed",
      };
    },
  });

  useEffect(() => {
    showSelection(open, "tableSelectionBackgroundColor");
    return () => showSelection(false, "tableSelectionBackgroundColor");
  }, [open, showSelection]);

  if (!state) return null;

  const apply = (color: string) => {
    const current = editor.prosemirrorState;
    if (!(current.selection instanceof CellSelection)) return;

    const positions: number[] = [];
    current.selection.forEachCell((_cell, pos) => positions.push(pos));
    editor.prosemirrorView.dispatch(
      colorTableCells(current, positions, "backgroundColor", color),
    );
    setOpen(false);
    setTimeout(() => editor.focus());
  };

  const buttonLabel = "单元格背景颜色";

  return (
    <Components.Generic.Popover.Root open={open} onOpenChange={setOpen}>
      <Components.Generic.Popover.Trigger>
        <Components.FormattingToolbar.Button
          className="bn-button"
          data-test="table-cell-background-color"
          icon={<PaintBucket aria-hidden="true" size={17} />}
          label={buttonLabel}
          mainTooltip={buttonLabel}
          onClick={() => setOpen(current => !current)}
        />
      </Components.Generic.Popover.Trigger>
      <Components.Generic.Popover.Content
        className="bn-popover-content formatting-color-panel table-cell-background-panel"
        variant="form-popover"
      >
        <div className="formatting-color-label">{buttonLabel}</div>
        <div
          aria-label={buttonLabel}
          className="formatting-color-swatches cell-background-color-swatches"
          role="group"
        >
          {TABLE_CELL_COLORS.map(color => (
            <button
              key={color}
              aria-label={`${buttonLabel}：${dict.color_picker.colors[color]}`}
              aria-pressed={state.backgroundColor === color}
              data-test={`table-cell-background-${color}`}
              onClick={() => apply(color)}
              onMouseDown={event => event.preventDefault()}
              title={`${buttonLabel}：${dict.color_picker.colors[color]}`}
              type="button"
            >
              <span
                className={`bn-color-icon color-fill ${color === "default" ? "color-clear" : ""}`}
                data-background-color={color}
                data-text-color="default"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
        <button
          className="formatting-color-reset"
          onClick={() => apply("default")}
          onMouseDown={event => event.preventDefault()}
          type="button"
        >
          恢复默认
        </button>
      </Components.Generic.Popover.Content>
    </Components.Generic.Popover.Root>
  );
}
