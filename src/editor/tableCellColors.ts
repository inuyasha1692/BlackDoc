import { getNodeById } from "@blocknote/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { CellSelection } from "prosemirror-tables";

export type CellColorProperty = "backgroundColor" | "textColor";

export function colorTargetCells(
  state: EditorState,
  blockId: string,
  rowIndex: number,
  colIndex: number,
): number[] {
  const block = getNodeById(blockId, state.doc);
  if (!block) return [];
  const tablePos = block.posBeforeNode + 1;
  const table = state.doc.nodeAt(tablePos);
  if (table?.type.spec.tableRole !== "table" || rowIndex < 0 || rowIndex >= table.childCount) return [];
  const row = table.child(rowIndex);
  if (colIndex < 0 || colIndex >= row.childCount) return [];
  const rowPos = state.doc.resolve(tablePos + 1).posAtIndex(rowIndex);
  const cellPos = state.doc.resolve(rowPos + 1).posAtIndex(colIndex);
  const selected: number[] = [];
  if (state.selection instanceof CellSelection) {
    state.selection.forEachCell((_cell, pos) => selected.push(pos));
  }
  return selected.includes(cellPos) ? selected : [cellPos];
}

export function colorTableCells(
  state: EditorState,
  positions: readonly number[],
  property: CellColorProperty,
  color: string,
): Transaction {
  const tr = state.tr;
  for (const pos of new Set(positions)) {
    const cell = state.doc.nodeAt(pos);
    if (cell && ["cell", "header_cell"].includes(cell.type.spec.tableRole)) {
      tr.setNodeMarkup(pos, undefined, { ...cell.attrs, [property]: color });
    }
  }
  return tr;
}
