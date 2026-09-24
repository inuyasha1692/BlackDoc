import { BlockNoteEditor } from "@blocknote/core";
import { CellSelection, TableMap } from "prosemirror-tables";
import { afterEach, describe, expect, it } from "vitest";
import { colorTableCells, colorTargetCells } from "./tableCellColors";

const editors: BlockNoteEditor[] = [];
function setup() {
  const editor = BlockNoteEditor.create({
    initialContent: [{
      id: "table", type: "table",
      content: {
        type: "tableContent", headerRows: 1,
        rows: [0, 1, 2].map(row => ({
          cells: [0, 1, 2].map(col => ({
            type: "tableCell" as const,
            props: { backgroundColor: row === 0 && col === 0 ? "red" : "blue", textColor: "green" },
            content: `${row},${col}`,
          })),
        })),
      },
    }],
  });
  editor.mount(document.createElement("div"));
  editors.push(editor);
  let positions: number[] = [];
  editor.prosemirrorState.doc.descendants((node, pos) => {
    if (node.type.spec.tableRole === "table") {
      positions = TableMap.get(node).map.map(offset => pos + 1 + offset);
      return false;
    }
  });
  const select = (from: number, to: number) => {
    editor.prosemirrorView.dispatch(editor.prosemirrorState.tr.setSelection(
      CellSelection.create(editor.prosemirrorState.doc, positions[from], positions[to]),
    ));
  };
  const apply = (row: number, col: number, color: string, property: "backgroundColor" | "textColor" = "backgroundColor") => {
    const state = editor.prosemirrorState;
    editor.prosemirrorView.dispatch(colorTableCells(state, colorTargetCells(state, "table", row, col), property, color));
  };
  const colorAt = (index: number) => editor.prosemirrorState.doc.nodeAt(positions[index])!.attrs.backgroundColor;
  return { editor, positions, select, apply, colorAt };
}

afterEach(() => editors.splice(0).forEach(editor => editor._tiptapEditor.destroy()));

describe("table selection colors", () => {
  it("colors every selected cell, even if the clicked cell already has that color", () => {
    const { editor, positions, select, apply, colorAt } = setup();
    select(0, 4);
    const contents = positions.map(pos => editor.prosemirrorState.doc.nodeAt(pos)!.textContent);
    apply(0, 0, "red");
    expect(positions.map((_, index) => colorAt(index))).toEqual([
      "red", "red", "blue", "red", "red", "blue", "blue", "blue", "blue",
    ]);
    expect(positions.map(pos => editor.prosemirrorState.doc.nodeAt(pos)!.textContent)).toEqual(contents);
    expect(editor.prosemirrorState.selection).toBeInstanceOf(CellSelection);
  });

  it("supports reverse selection and opening from its last cell", () => {
    const { select, apply, colorAt } = setup();
    select(4, 0);
    apply(1, 1, "yellow");
    expect([0, 1, 3, 4].map(colorAt)).toEqual(["yellow", "yellow", "yellow", "yellow"]);
    expect(colorAt(5)).toBe("blue");
  });

  it("only changes the hovered cell when it is outside the selection", () => {
    const { select, apply, colorAt } = setup();
    select(0, 4);
    apply(2, 2, "yellow");
    expect(colorAt(0)).toBe("red");
    expect(colorAt(4)).toBe("blue");
    expect(colorAt(8)).toBe("yellow");
  });

  it("supports a single cell and clearing a range's background", () => {
    const { select, apply, colorAt } = setup();
    apply(2, 2, "yellow");
    expect(colorAt(7)).toBe("blue");
    expect(colorAt(8)).toBe("yellow");
    select(0, 4);
    apply(1, 1, "default");
    expect([0, 1, 3, 4].map(colorAt)).toEqual(["default", "default", "default", "default"]);
  });

  it("undoes and redoes all changed cells in a single step", () => {
    const { editor, select, apply } = setup();
    select(0, 4);
    const before = JSON.stringify(editor.document);
    apply(1, 1, "yellow");
    const after = JSON.stringify(editor.document);
    editor.undo();
    expect(JSON.stringify(editor.document)).toBe(before);
    editor.redo();
    expect(JSON.stringify(editor.document)).toBe(after);
  });

  it("sets text color without replacing backgrounds or content", () => {
    const { editor, positions, select, apply, colorAt } = setup();
    select(0, 4);
    apply(1, 1, "purple", "textColor");
    expect([0, 1, 3, 4].map(index => editor.prosemirrorState.doc.nodeAt(positions[index])!.attrs.textColor))
      .toEqual(["purple", "purple", "purple", "purple"]);
    expect(colorAt(0)).toBe("red");
    expect(colorAt(4)).toBe("blue");
  });
});
