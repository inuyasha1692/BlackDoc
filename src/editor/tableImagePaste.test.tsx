import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { CellSelection, TableMap } from "prosemirror-tables";
import { renderToStaticMarkup } from "react-dom/server";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStandaloneHtml } from "../export/standaloneHtml";
import { isBlackDocument } from "./document";
import { blackDocSchema, type BlackDocEditor } from "./schema";
import { pasteTableImage } from "./tableImagePaste";

const editors: BlackDocEditor[] = [];

function createEditor(readImage?: (file: File) => Promise<string>, mount = true): BlackDocEditor {
  const editor = BlockNoteEditor.create({
    schema: blackDocSchema,
    initialContent: [{
      id: "table",
      type: "table",
      content: { type: "tableContent", rows: [
        { cells: ["名称", "图片"] },
        { cells: ["条目", "前后"] },
      ] },
    }, { id: "paragraph", type: "paragraph", content: "表格之后" }],
    uploadFile: async () => "data:image/png;base64,YQ==",
    pasteHandler: ({ event, editor: activeEditor, defaultPasteHandler }) =>
      pasteTableImage(activeEditor, event.clipboardData, readImage ?? (async file =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }))) || defaultPasteHandler(),
  });
  editor.elementRenderer = (node, container) => {
    container.innerHTML = renderToStaticMarkup(node);
  };
  if (mount) editor.mount(document.createElement("div"));
  editors.push(editor);
  return editor;
}

function imageCellPosition(editor: BlackDocEditor) {
  const { state } = editor._tiptapEditor;
  let cell = -1;
  state.doc.descendants((node, pos) => {
    if (node.type.spec.tableRole === "table") {
      cell = pos + 1 + TableMap.get(node).map[3];
      return false;
    }
  });
  return cell;
}

function placeCursor(editor: BlackDocEditor) {
  const { state, view } = editor._tiptapEditor;
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, imageCellPosition(editor) + 3)));
}

function paste(editor: ReturnType<typeof createEditor>, file: File) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: {
    types: ["Files"],
    items: [{ kind: "file", type: file.type, getAsFile: () => file }],
    files: [file],
    getData: () => "",
  } });
  editor._tiptapEditor.view.dom.dispatchEvent(event);
}

afterEach(() => {
  editors.splice(0).forEach(editor => editor._tiptapEditor.destroy());
  vi.restoreAllMocks();
});

describe("paste image in a table", () => {
  it("keeps the image between cell text and persists it through bdoc and HTML", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:clipboard-image");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const editor = createEditor();
    placeCursor(editor);
    paste(editor, new File(["image bytes"], "截图.png", { type: "image/png" }));

    await vi.waitFor(() => {
      const table = editor.document[0];
      const cell = table.type === "table" && table.content.type === "tableContent"
        ? table.content.rows[1].cells[1] : null;
      expect(cell && "content" in cell ? cell.content.map(part => part.type) : null)
        .toEqual(["text", "tableImage", "text"]);
      expect(JSON.stringify(cell)).toContain("data:image/png;base64,");
    });
    expect(editor.document.some(block => block.type === "image")).toBe(false);
    expect(revoke).toHaveBeenCalledWith("blob:clipboard-image");
    expect(isBlackDocument(JSON.parse(JSON.stringify(editor.document)))).toBe(true);
    const { html } = await buildStandaloneHtml(editor, editor.document);
    const exported = new DOMParser().parseFromString(html, "text/html");
    expect(exported.querySelectorAll("table tbody tr")[1]?.querySelectorAll("td,th")[1]
      .querySelector("img")?.getAttribute("src")).toContain("data:image/png;base64,");
  });

  it("finishes loading in the pasted cell after the cursor moves away", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pending-image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let resolveImage!: (url: string) => void;
    const editor = createEditor(() => new Promise(resolve => { resolveImage = resolve; }));
    placeCursor(editor);
    paste(editor, new File(["image bytes"], "截图.png", { type: "image/png" }));
    editor.setTextCursorPosition("paragraph", "end");
    editor.insertInlineContent("后续文字");
    resolveImage("data:image/png;base64,YQ==");

    await vi.waitFor(() => {
      const table = editor.document[0];
      expect(JSON.stringify(table)).toContain("data:image/png;base64,YQ==");
    });
    expect(JSON.stringify(editor.document[1].content)).toContain("后续文字");
    expect(editor.document[1].type).toBe("paragraph");
  });

  it("pastes into a selected table cell", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:selected-image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const editor = createEditor();
    const { state, view } = editor._tiptapEditor;
    view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, imageCellPosition(editor))));
    paste(editor, new File(["image bytes"], "截图.png", { type: "image/png" }));

    await vi.waitFor(() => {
      const table = editor.document[0];
      const cell = table.type === "table" && table.content.type === "tableContent"
        ? table.content.rows[1].cells[1] : null;
      expect(JSON.stringify(cell)).toContain("data:image/png;base64,");
    });
  });

  it.each(["Backspace", "Delete"])("selects a clicked table image and removes it with %s", async key => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:selectable-image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const editor = createEditor(undefined, false);
    const view = render(<BlockNoteView editor={editor} />);
    Object.defineProperty(editor.prosemirrorView, "scrollToSelection", {
      configurable: true,
      value: () => {},
    });
    act(() => {
      placeCursor(editor);
      paste(editor, new File(["image bytes"], "截图.png", { type: "image/png" }));
    });
    const image = await vi.waitFor(() => {
      const element = view.container.querySelector<HTMLImageElement>(
        '[data-inline-content-type="tableImage"] img',
      );
      expect(element).not.toBeNull();
      return element!;
    });

    fireEvent.mouseDown(image);
    expect(editor._tiptapEditor.state.selection).toBeInstanceOf(NodeSelection);
    expect(image.closest(".ProseMirror-selectednode")).not.toBeNull();
    expect(view.container.querySelector(
      '.bn-editor .ProseMirror-selectednode [data-inline-content-type="tableImage"] img, ' +
      '.bn-editor [data-inline-content-type="tableImage"].ProseMirror-selectednode img',
    )).toBe(image);
    fireEvent.keyDown(editor.prosemirrorView.dom, { key });

    const table = editor.document[0];
    const cell = table.type === "table" && table.content.type === "tableContent"
      ? table.content.rows[1].cells[1] : null;
    expect(JSON.stringify(cell)).not.toContain("tableImage");
    expect(JSON.stringify(cell)).toContain("前后");
    view.unmount();
    vi.unstubAllGlobals();
  });

  it("leaves ordinary image paste outside tables to the default handler", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:unused");
    const editor = createEditor();
    editor.setTextCursorPosition("paragraph", "end");
    paste(editor, new File(["image bytes"], "截图.png", { type: "image/png" }));

    await vi.waitFor(() => {
      expect(editor.document.some(block => block.type === "image")).toBe(true);
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
