import { BlockNoteEditor } from "@blocknote/core";
import { TextSelection } from "prosemirror-state";
import { CellSelection, mergeCells, TableMap } from "prosemirror-tables";
import { afterEach, describe, expect, it } from "vitest";
import { TableEnterNavigationExtension } from "./tableEnterNavigation";

const editors: BlockNoteEditor[] = [];

function createEditor(withExtension = true) {
  const editor = BlockNoteEditor.create({
    extensions: withExtension ? [TableEnterNavigationExtension()] : [],
    initialContent: [
      {
        id: "table",
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            { cells: ["First left", "First right"] },
            { cells: ["Second left", ""] },
            { cells: ["Last left", "Last right"] },
          ],
        },
      },
      { id: "paragraph", type: "paragraph", content: "BeforeAfter" },
    ],
  });
  editor.mount(document.createElement("div"));
  editors.push(editor);
  return editor;
}

function cellPosition(editor: BlockNoteEditor, row: number, column: number) {
  let result = -1;
  editor._tiptapEditor.state.doc.descendants((node, pos) => {
    if (node.type.spec.tableRole === "table") {
      const map = TableMap.get(node);
      result = pos + 1 + map.map[row * map.width + column];
      return false;
    }
  });
  if (result < 0) throw new Error("Missing table");
  return result;
}

function putCursor(editor: BlockNoteEditor, row: number, column: number, offset = 0) {
  const { state, view } = editor._tiptapEditor;
  view.dispatch(state.tr.setSelection(
    TextSelection.create(state.doc, cellPosition(editor, row, column) + 2 + offset),
  ));
}

function expectCursor(editor: BlockNoteEditor, row: number, column: number) {
  const { selection } = editor._tiptapEditor.state;
  const start = cellPosition(editor, row, column) + 2;
  expect(selection).toBeInstanceOf(TextSelection);
  expect(selection.empty).toBe(true);
  expect(selection.from).toBe(start);
  expect(selection.to).toBe(start);
  expect(selection.$head.parentOffset).toBe(0);
}

function pressKey(editor: BlockNoteEditor, key: string, shiftKey = false) {
  // keyboardShortcut captures document steps but loses selection-only transactions.
  editor._tiptapEditor.view.dom.dispatchEvent(new KeyboardEvent("keydown", {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  }));
}

afterEach(() => {
  editors.splice(0).forEach(editor => editor._tiptapEditor.destroy());
});

describe("table Enter navigation", () => {
  it("selects all nonempty destination text with native Enter as a baseline", () => {
    const editor = createEditor(false);
    putCursor(editor, 0, 0, 3);
    const original = editor._tiptapEditor.state.doc.toJSON();

    pressKey(editor, "Enter");

    const { doc, selection } = editor._tiptapEditor.state;
    const start = cellPosition(editor, 1, 0) + 2;
    expect(selection).toBeInstanceOf(TextSelection);
    expect(selection.empty).toBe(false);
    expect(selection.from).toBe(start);
    expect(selection.to).toBe(start + "Second left".length);
    expect(doc.textBetween(selection.from, selection.to)).toBe("Second left");
    expect(doc.toJSON()).toEqual(original);
  });

  it("moves to the same column in the next row with a collapsed cursor before nonempty text", () => {
    const editor = createEditor();
    putCursor(editor, 0, 0, 3);
    const original = editor._tiptapEditor.state.doc.toJSON();

    pressKey(editor, "Enter");

    expectCursor(editor, 1, 0);
    expect(editor._tiptapEditor.state.doc.toJSON()).toEqual(original);
    editor._tiptapEditor.commands.insertContent("X");
    expect(editor._tiptapEditor.state.selection.$head.parent.textContent).toBe("XSecond left");
  });

  it("places a collapsed cursor in an empty destination cell in the second column", () => {
    const editor = createEditor();
    putCursor(editor, 0, 1, 4);
    const original = editor._tiptapEditor.state.doc.toJSON();

    pressKey(editor, "Enter");

    expectCursor(editor, 1, 1);
    expect(editor._tiptapEditor.state.doc.toJSON()).toEqual(original);
  });

  it("navigates from an empty cell to the next nonempty cell", () => {
    const editor = createEditor();
    putCursor(editor, 1, 1);
    const original = editor._tiptapEditor.state.doc.toJSON();

    pressKey(editor, "Enter");

    expectCursor(editor, 2, 1);
    expect(editor._tiptapEditor.state.doc.toJSON()).toEqual(original);
  });

  it.each([0, 1])("keeps the cursor and document unchanged in final-row column %i", column => {
    const editor = createEditor();
    putCursor(editor, 2, column, 3);
    const original = editor._tiptapEditor.state.doc.toJSON();
    const selection = editor._tiptapEditor.state.selection.toJSON();

    pressKey(editor, "Enter");

    expect(editor._tiptapEditor.state.doc.toJSON()).toEqual(original);
    expect(editor._tiptapEditor.state.selection.toJSON()).toEqual(selection);
  });

  it("preserves native paragraph splitting outside the table", () => {
    const editor = createEditor();
    editor.setTextCursorPosition("paragraph", "start");
    const { state, view } = editor._tiptapEditor;
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, state.selection.from + 6)));

    pressKey(editor, "Enter");

    expect(editor.document).toHaveLength(3);
    expect(editor.document.slice(1)).toMatchObject([
      { type: "paragraph", content: [{ type: "text", text: "Before" }] },
      { type: "paragraph", content: [{ type: "text", text: "After" }] },
    ]);
    expect(editor._tiptapEditor.state.selection.empty).toBe(true);
    expect(editor._tiptapEditor.state.selection.$head.parentOffset).toBe(0);
  });

  it.each(["Tab", "Shift-Tab", "Shift-Enter"])("preserves native %s behavior", shortcut => {
    const editor = createEditor();
    const native = createEditor(false);
    [editor, native].forEach(instance => {
      putCursor(instance, 0, 1, 3);
      pressKey(instance, shortcut.replace("Shift-", ""), shortcut.startsWith("Shift-"));
    });

    expect(editor._tiptapEditor.state.doc.toJSON()).toEqual(native._tiptapEditor.state.doc.toJSON());
    expect(editor._tiptapEditor.state.selection.toJSON()).toEqual(native._tiptapEditor.state.selection.toJSON());
  });

  it("skips the rows occupied by a vertically merged cell", () => {
    const editor = createEditor();
    const { state, view } = editor._tiptapEditor;
    view.dispatch(state.tr.setSelection(CellSelection.create(
      state.doc,
      cellPosition(editor, 0, 0),
      cellPosition(editor, 1, 0),
    )));
    expect(mergeCells(editor._tiptapEditor.state, view.dispatch)).toBe(true);
    putCursor(editor, 0, 0, 3);
    const original = editor._tiptapEditor.state.doc.toJSON();

    pressKey(editor, "Enter");

    expectCursor(editor, 2, 0);
    expect(editor._tiptapEditor.state.doc.toJSON()).toEqual(original);
  });
});
