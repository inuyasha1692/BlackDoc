import { BlockNoteEditor } from "@blocknote/core";
import { CellSelection, TableMap, addColumnAfter, addColumnBefore, addRowAfter, deleteColumn } from "prosemirror-tables";
import { afterEach, describe, expect, it } from "vitest";
import { InheritColumnFormatExtension } from "./inheritColumnFormat";

const editors: BlockNoteEditor[] = [];
const createEditor = () => {
  const editor = BlockNoteEditor.create({
    tables: { cellBackgroundColor: true, cellTextColor: true },
    extensions: [InheritColumnFormatExtension()],
    initialContent: [{
      id: "table",
      type: "table",
      content: {
        type: "tableContent",
        headerRows: 1,
        rows: ["red", "blue"].map(backgroundColor => ({
          cells: [
            { type: "tableCell", props: { backgroundColor, textColor: "green", textAlignment: "center" }, content: "Left" },
            { type: "tableCell", props: { backgroundColor: "yellow" }, content: "Right" },
          ],
        })),
      },
    }],
  });
  editor.mount(document.createElement("div"));
  editors.push(editor);
  return editor;
};

function selectColumn(editor: BlockNoteEditor, col: number) {
  const { state, view } = editor._tiptapEditor;
  let cellPos = -1;
  state.doc.descendants((node, pos) => {
    if (node.type.spec.tableRole === "table") {
      cellPos = pos + 1 + TableMap.get(node).map[col];
      return false;
    }
  });
  view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, cellPos)));
}

function cells(editor: BlockNoteEditor) {
  const table = editor.getBlock("table");
  if (table?.type !== "table") throw new Error("Missing table");
  return table.content.rows.map(row => row.cells);
}

afterEach(() => {
  editors.splice(0).forEach(editor => editor._tiptapEditor.destroy());
});

describe("new column formatting", () => {
  it("inherits each left cell's colors and alignment while leaving content empty", () => {
    const editor = createEditor();
    selectColumn(editor, 0);
    addColumnAfter(editor._tiptapEditor.state, editor._tiptapEditor.view.dispatch);
    const rows = cells(editor);
    rows.forEach((row, index) => {
      expect(row).toHaveLength(3);
      expect(row[1]).toMatchObject({
        props: { backgroundColor: index === 0 ? "red" : "blue", textColor: "green", textAlignment: "center", colspan: 1, rowspan: 1 },
        content: [],
      });
      expect(row[2]).toMatchObject({ props: { backgroundColor: "yellow" } });
    });
  });

  it("uses the actual left neighbor when inserting before a middle column", () => {
    const editor = createEditor();
    selectColumn(editor, 1);
    addColumnBefore(editor._tiptapEditor.state, editor._tiptapEditor.view.dispatch);
    expect(cells(editor)[1][1]).toMatchObject({ props: { backgroundColor: "blue" }, content: [] });
  });

  it("keeps defaults when inserting the first column", () => {
    const editor = createEditor();
    selectColumn(editor, 0);
    addColumnBefore(editor._tiptapEditor.state, editor._tiptapEditor.view.dispatch);
    expect(cells(editor)[0][0]).toMatchObject({ props: { backgroundColor: "default" }, content: [] });
  });

  it("undoes and redoes insertion together with its formatting", () => {
    const editor = createEditor();
    selectColumn(editor, 0);
    const original = JSON.stringify(editor.document);
    addColumnAfter(editor._tiptapEditor.state, editor._tiptapEditor.view.dispatch);
    const inserted = JSON.stringify(editor.document);
    editor.undo();
    expect(JSON.stringify(editor.document)).toBe(original);
    editor.redo();
    expect(JSON.stringify(editor.document)).toBe(inserted);
  });

  it("does not recolor restored columns or newly inserted rows", () => {
    const editor = createEditor();
    selectColumn(editor, 1);
    const original = JSON.stringify(editor.document);
    deleteColumn(editor._tiptapEditor.state, editor._tiptapEditor.view.dispatch);
    editor.undo();
    expect(JSON.stringify(editor.document)).toBe(original);
    selectColumn(editor, 0);
    addRowAfter(editor._tiptapEditor.state, editor._tiptapEditor.view.dispatch);
    expect(cells(editor)[1][1]).toMatchObject({ props: { backgroundColor: "default" } });
  });

  it("preserves inherited formatting through JSON reload and HTML export", () => {
    const editor = createEditor();
    selectColumn(editor, 0);
    addColumnAfter(editor._tiptapEditor.state, editor._tiptapEditor.view.dispatch);
    const loaded = BlockNoteEditor.create({ initialContent: JSON.parse(JSON.stringify(editor.document)) });
    editors.push(loaded);
    expect(cells(loaded)).toEqual(cells(editor));
    const html = new DOMParser().parseFromString(editor.blocksToFullHTML(editor.document), "text/html");
    expect(html.querySelectorAll("tr")[1].children[1].getAttribute("data-background-color")).toBe("blue");
  });
});
