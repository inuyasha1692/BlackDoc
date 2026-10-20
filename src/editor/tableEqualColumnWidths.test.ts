import { BlockNoteEditor } from "@blocknote/core";
import { CellSelection, mergeCells, TableMap } from "prosemirror-tables";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableEqualColumnWidthsExtension } from "./tableEqualColumnWidths";

const editors: BlockNoteEditor[] = [];

function setup(columnWidths: number[] = [80, 160, 240]) {
  const editor = BlockNoteEditor.create({
    extensions: [TableEqualColumnWidthsExtension()],
    initialContent: [
      {
        id: "table", type: "table",
        content: {
          type: "tableContent", columnWidths, headerRows: 1,
          rows: [0, 1].map(row => ({ cells: columnWidths.map((_, col) => `${row},${col}`) })),
        },
      },
      {
        id: "other", type: "table",
        content: { type: "tableContent", columnWidths: [100, 200], rows: [{ cells: ["A", "B"] }] },
      },
      { id: "paragraph", type: "paragraph", content: "Text" },
    ],
  });
  editor.mount(document.createElement("div"));
  editors.push(editor);
  const table = editor.prosemirrorView.dom.querySelector("table")!;
  vi.spyOn(table, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 480, 80));
  table.querySelectorAll<HTMLTableCellElement>("td, th").forEach((cell, index) => {
    const col = index % columnWidths.length;
    const left = 100 + columnWidths.slice(0, col).reduce((a, b) => a + b, 0);
    vi.spyOn(cell, "getBoundingClientRect").mockReturnValue(new DOMRect(left, 100, columnWidths[col], 40));
  });
  const doubleClick = (cell = table.querySelector("th, td")!, clientX = 180, button = 0) => {
    const event = new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX, clientY: 120, button });
    cell.dispatchEvent(event);
    return event;
  };
  return { editor, table, doubleClick };
}

function widths(editor: BlockNoteEditor, id = "table") {
  const block = editor.getBlock(id);
  if (block?.type !== "table") throw new Error("Missing table");
  return block.content.columnWidths;
}

function firstTable(editor: BlockNoteEditor) {
  let position = -1;
  editor.prosemirrorState.doc.descendants((node, pos) => {
    if (position < 0 && node.type.spec.tableRole === "table") position = pos;
    return position < 0;
  });
  const node = editor.prosemirrorState.doc.nodeAt(position)!;
  return { node, position, map: TableMap.get(node) };
}

afterEach(() => {
  editors.splice(0).forEach(editor => editor._tiptapEditor.destroy());
  vi.restoreAllMocks();
});

describe("double-clicking a table column divider", () => {
  it.each(["right", "left"])("equalizes all columns from the %s side of a divider and supports undo/redo", side => {
    const { editor, table, doubleClick } = setup();
    const before = JSON.stringify(editor.document);
    const selection = editor.prosemirrorState.selection.toJSON();
    const cells = table.querySelectorAll("th");
    expect(doubleClick(cells[side === "right" ? 0 : 1]).defaultPrevented).toBe(true);
    expect(widths(editor)).toEqual([160, 160, 160]);
    expect(widths(editor, "other")).toEqual([100, 200]);
    expect(editor.prosemirrorState.selection.toJSON()).toEqual(selection);
    const after = JSON.stringify(editor.document);
    editor.undo();
    expect(JSON.stringify(editor.document)).toBe(before);
    editor.redo();
    expect(JSON.stringify(editor.document)).toBe(after);
  });

  it("serializes equal widths and restores them when reopening", () => {
    const { editor, doubleClick } = setup();
    doubleClick();
    const reopened = BlockNoteEditor.create({ initialContent: JSON.parse(JSON.stringify(editor.document)) });
    editors.push(reopened);
    expect(widths(reopened)).toEqual([160, 160, 160]);
  });

  it("handles unspecified widths and fractional averages", () => {
    const { editor, table, doubleClick } = setup();
    editor.updateBlock("table", { content: { type: "tableContent", rows: [{ cells: ["A", "B", "C"] }] } });
    vi.spyOn(table.querySelector("td")!, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 120, 40));
    vi.mocked(table.getBoundingClientRect).mockReturnValue(new DOMRect(100, 100, 481, 40));
    doubleClick(table.querySelector("td")!, 220);
    expect(widths(editor)).toEqual([481 / 3, 481 / 3, 481 / 3]);
  });

  it.each(["horizontal", "vertical"])("preserves %s merged cells, content and colors", direction => {
    const { editor, table, doubleClick } = setup();
    let { position, map } = firstTable(editor);
    let state = editor.prosemirrorState;
    editor.prosemirrorView.dispatch(state.tr.setSelection(CellSelection.create(
      state.doc, position + 1 + map.map[0], position + 1 + map.map[direction === "horizontal" ? 1 : map.width],
    )));
    expect(mergeCells(editor.prosemirrorState, editor.prosemirrorView.dispatch)).toBe(true);
    ({ position, map } = firstTable(editor));
    state = editor.prosemirrorState;
    const first = position + 1 + map.map[0];
    editor.prosemirrorView.dispatch(state.tr.setNodeMarkup(first, undefined, {
      ...state.doc.nodeAt(first)!.attrs, backgroundColor: "red", textColor: "green",
    }));
    const content = editor.prosemirrorState.doc.textContent;
    const cell = table.querySelector("th")!;
    vi.spyOn(cell, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, direction === "horizontal" ? 240 : 80, 40));
    doubleClick(cell, direction === "horizontal" ? 340 : 180);
    expect(widths(editor)).toEqual([160, 160, 160]);
    const updated = firstTable(editor).node;
    expect(updated.child(0).child(0).attrs).toMatchObject({
      colspan: direction === "horizontal" ? 2 : 1,
      rowspan: direction === "vertical" ? 2 : 1,
      colwidth: direction === "horizontal" ? [160, 160] : [160],
      backgroundColor: "red", textColor: "green",
    });
    expect(editor.prosemirrorState.doc.textContent).toBe(content);
    updated.descendants(cellNode => {
      if (["cell", "header_cell"].includes(cellNode.type.spec.tableRole)) {
        expect(cellNode.attrs.colwidth).toEqual(Array(cellNode.attrs.colspan).fill(160));
      }
    });
  });

  it.each(["text", "outside left", "outside right", "right button", "read-only", "one column", "no layout"])("ignores %s", scenario => {
    const { editor, table, doubleClick } = setup(scenario === "one column" ? [480] : undefined);
    let cell = table.querySelector("th")!;
    let x = 180;
    if (scenario === "text") x = 140;
    if (scenario === "outside left") x = 100;
    if (scenario === "outside right") { cell = table.querySelectorAll("th")[2]; x = 580; }
    if (scenario === "one column") x = 580;
    if (scenario === "read-only") editor.isEditable = false;
    if (scenario === "no layout") vi.mocked(table.getBoundingClientRect).mockReturnValue(new DOMRect());
    const before = JSON.stringify(editor.document);
    const event = doubleClick(cell, x, scenario === "right button" ? 2 : 0);
    expect(event.defaultPrevented).toBe(false);
    expect(JSON.stringify(editor.document)).toBe(before);
  });

  it("respects the existing minimum column width", () => {
    const { editor, table, doubleClick } = setup();
    vi.mocked(table.getBoundingClientRect).mockReturnValue(new DOMRect(100, 100, 60, 40));
    doubleClick();
    expect(widths(editor)).toEqual([35, 35, 35]);
  });

  it("excludes the outer border from column widths and keeps repeated sizing stable", () => {
    const { editor, table, doubleClick } = setup();
    vi.mocked(table.getBoundingClientRect).mockReturnValue(new DOMRect(100, 100, 481, 80));
    vi.spyOn(table.querySelector("colgroup")!, "getBoundingClientRect").mockReturnValue(new DOMRect(100.5, 100, 480, 80));
    doubleClick();
    expect(widths(editor)).toEqual([160, 160, 160]);
    vi.spyOn(table.querySelector("th")!, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 160, 40));
    const after = JSON.stringify(editor.document);
    expect(doubleClick(table.querySelector("th")!, 260).defaultPrevented).toBe(true);
    expect(JSON.stringify(editor.document)).toBe(after);
  });

  it("keeps native dragging available and equalizes through the resize handle", () => {
    const { editor, table, doubleClick } = setup();
    const { view } = editor._tiptapEditor;
    const { position, map } = firstTable(editor);
    vi.spyOn(view, "posAtCoords").mockReturnValue({ pos: position + 1 + map.map[0] + 2, inside: -1 });
    const cell = table.querySelector("th")!;
    cell.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 179, clientY: 120 }));
    expect(view.dom.classList.contains("resize-cursor")).toBe(true);
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: 180, clientY: 120 }));
    window.dispatchEvent(new MouseEvent("mouseup", { clientX: 220, clientY: 120 }));
    expect(widths(editor)).toEqual([120, 160, 240]);
    vi.spyOn(table.querySelector("th")!, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 120, 40));
    vi.mocked(table.getBoundingClientRect).mockReturnValue(new DOMRect(100, 100, 520, 80));
    const handle = table.querySelector(".column-resize-handle")!;
    expect(handle).not.toBeNull();
    doubleClick(handle, 220);
    expect(widths(editor)).toEqual([520 / 3, 520 / 3, 520 / 3]);
    editor.undo();
    expect(widths(editor)).toEqual([120, 160, 240]);
  });
});
