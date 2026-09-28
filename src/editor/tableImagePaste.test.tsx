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
  it("pastes the image from a captioned image block into a cell", () => {
    const editor = createEditor();
    editor.insertBlocks([{ id: "captioned-image", type: "image", props: {
      url: "data:image/png;base64,YQ==", name: "Diagram", caption: "图片说明", previewWidth: 180,
    } }], "paragraph", "after");
    editor.setTextCursorPosition("captioned-image");
    const values = new Map<string, string>();
    const clipboard = {
      get types() { return [...values.keys()]; }, items: [], files: [],
      clearData: () => values.clear(),
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    } as unknown as DataTransfer;
    const copied = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(copied, "clipboardData", { value: clipboard });
    editor.prosemirrorView.dom.dispatchEvent(copied);
    expect(clipboard.getData("blocknote/html")).toContain('data-caption="图片说明"');

    placeCursor(editor);
    expect(pasteTableImage(editor, clipboard, vi.fn())).toBe(true);
    const cell = (editor.getBlock("table") as Extract<typeof editor.document[number], { type: "table" }>).content.rows[1].cells[1];
    expect(JSON.stringify(cell)).toContain('"type":"tableImage"');
    expect(JSON.stringify(cell)).toContain('"name":"Diagram"');
    expect(JSON.stringify(cell)).toContain('"previewWidth":180');
    expect(JSON.stringify(cell)).not.toContain("图片说明");
  });

  it("pastes a captioned image block when only its external HTML is available", () => {
    const editor = createEditor();
    placeCursor(editor);
    const clipboard = { items: [], files: [], getData: (type: string) => type === "text/html"
      ? '<figure data-preview-width="180"><img src="data:image/png;base64,YQ==" alt="Diagram"><figcaption>图片说明</figcaption></figure>' : "" } as unknown as DataTransfer;
    expect(pasteTableImage(editor, clipboard, vi.fn())).toBe(true);
    const cell = (editor.getBlock("table") as Extract<typeof editor.document[number], { type: "table" }>).content.rows[1].cells[1];
    expect(JSON.stringify(cell)).toContain('"type":"tableImage"');
    expect(JSON.stringify(cell)).toContain('"previewWidth":180');
    expect(JSON.stringify(cell)).not.toContain("图片说明");
  });

  it.each(["copy", "cut"])("pastes an internally %s image block into cell content", async action => {
    const editor = createEditor();
    editor.insertBlocks([{ id: "source-image", type: "image", props: {
      url: "data:image/png;base64,YQ==", name: "Copied image", previewWidth: 180,
    } }], "paragraph", "after");
    editor.setTextCursorPosition("source-image");
    const values = new Map<string, string>();
    const clipboard = {
      get types() { return [...values.keys()]; }, items: [], files: [],
      clearData: () => values.clear(),
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    } as unknown as DataTransfer;
    const event = new Event(action, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboard });
    editor.prosemirrorView.dom.dispatchEvent(event);
    expect(clipboard.getData("blocknote/html")).toContain("data-content-type=\"image\"");
    if (action === "cut") await vi.waitFor(() => expect(editor.getBlock("source-image")).toBeUndefined());
    placeCursor(editor);
    const before = JSON.stringify(editor.document);
    const pasted = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasted, "clipboardData", { value: clipboard });
    editor.prosemirrorView.dom.dispatchEvent(pasted);
    expect(pasted.defaultPrevented).toBe(true);
    const table = editor.getBlock("table")!;
    expect(JSON.stringify(table)).toContain('"previewWidth":180');
    expect(JSON.stringify(table)).toContain('"name":"Copied image"');
    expect(JSON.stringify(table)).toContain('"type":"tableImage"');
    expect(editor.document.filter(block => block.type === "image")).toHaveLength(action === "copy" ? 1 : 0);
    expect(isBlackDocument(JSON.parse(JSON.stringify(editor.document)))).toBe(true);
    editor.undo();
    expect(JSON.stringify(editor.document)).toBe(before);
  });

  it("pastes multiple HTML images in order into a selected cell", () => {
    const editor = createEditor();
    const { state, view } = editor._tiptapEditor;
    view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, imageCellPosition(editor))));
    const readImage = vi.fn();
    const clipboard = { items: [], files: [], getData: (type: string) => type === "text/html"
      ? '<img src="data:image/png;base64,YQ==" alt="First" width="140"><img src="data:image/png;base64,Yg==" alt="Second" style="width:90px">' : "" } as unknown as DataTransfer;
    expect(pasteTableImage(editor, clipboard, readImage)).toBe(true);
    const cell = (editor.getBlock("table") as Extract<typeof editor.document[number], { type: "table" }>).content.rows[1].cells[1];
    expect(JSON.stringify(cell)).toMatch(/First.*Second/);
    expect(JSON.stringify(cell)).toContain('"previewWidth":140');
    expect(JSON.stringify(cell)).toContain('"previewWidth":90');
    expect(readImage).not.toHaveBeenCalled();
  });

  it.each([
    '<p>Text<img src="image.png"></p>', '<table><tr><td><img src="image.png"></td></tr></table>',
    '<figure><img src="image.png"><p>Text</p></figure>', '<img>', '<p>Text</p>',
  ])("leaves mixed or unsupported HTML to the default paste handler (%s)", html => {
    const editor = createEditor();
    placeCursor(editor);
    const before = JSON.stringify(editor.document);
    const clipboard = { items: [], files: [], getData: () => html } as unknown as DataTransfer;
    expect(pasteTableImage(editor, clipboard, vi.fn())).toBe(false);
    expect(JSON.stringify(editor.document)).toBe(before);
  });

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

  it("resizes a selected table image, persists its width and supports cancel and undo", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:resizable-image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const editor = createEditor(undefined, false);
    const view = render(<BlockNoteView editor={editor} />);
    Object.defineProperty(editor.prosemirrorView, "scrollToSelection", { configurable: true, value: () => {} });
    try {
      act(() => {
        placeCursor(editor);
        paste(editor, new File(["image bytes"], "截图.png", { type: "image/png" }));
      });
      const image = await vi.waitFor(() => {
        const element = view.container.querySelector<HTMLImageElement>('[data-inline-content-type="tableImage"] img');
        expect(element).not.toBeNull();
        return element!;
      });
      expect(view.queryByRole("button", { name: /缩放表格图片/ })).toBeNull();
      fireEvent.mouseEnter(image.parentElement!);
      expect(view.getAllByRole("button", { name: /缩放表格图片/ })).toHaveLength(2);
      fireEvent.mouseLeave(image.parentElement!);
      expect(view.queryByRole("button", { name: /缩放表格图片/ })).toBeNull();
      image.getBoundingClientRect = () => ({ width: 240 }) as DOMRect;
      Object.defineProperty(image.closest("td,th")!, "clientWidth", { configurable: true, value: 400 });
      fireEvent.mouseDown(image);
      const handle = await view.findByRole("button", { name: "缩放表格图片（右侧）" });
      const pointer = (type: string, x: number) => {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0 });
        Object.defineProperty(event, "pointerId", { value: 1 });
        return event;
      };
      const before = JSON.stringify(editor.document);
      fireEvent(handle, pointer("pointerdown", 100));
      fireEvent(window, pointer("pointermove", 160));
      expect(image.parentElement).toHaveStyle({ width: "300px" });
      expect(JSON.stringify(editor.document)).toBe(before);
      fireEvent(window, pointer("pointermove", 10000));
      expect(parseFloat(image.parentElement!.style.width)).toBeLessThanOrEqual(400);
      fireEvent(window, pointer("pointermove", -10000));
      expect(image.parentElement).toHaveStyle({ width: "24px" });
      fireEvent(window, pointer("pointercancel", 160));
      expect(JSON.stringify(editor.document)).toBe(before);

      fireEvent(handle, pointer("pointerdown", 100));
      fireEvent(window, pointer("pointermove", 160));
      fireEvent(window, pointer("pointerup", 160));
      expect(JSON.stringify(editor.document)).toContain('"previewWidth":300');
      expect(JSON.stringify(editor.document)).toContain("前");
      expect(JSON.stringify(editor.document)).toContain("后");
      const { html } = await buildStandaloneHtml(editor, editor.document);
      const exported = new DOMParser().parseFromString(html, "text/html");
      expect(exported.querySelector<HTMLImageElement>('table img')?.style.width).toBe("300px");
      expect(exported.querySelector('.table-image-resize-handle')).toBeNull();
      act(() => { editor.undo(); });
      expect(JSON.stringify(editor.document)).toBe(before);
      fireEvent.mouseDown(image);
      const leftHandle = await view.findByRole("button", { name: "缩放表格图片（左侧）" });
      fireEvent(leftHandle, pointer("pointerdown", 160));
      fireEvent(window, pointer("pointermove", 100));
      expect(image.parentElement).toHaveStyle({ width: "300px" });
      fireEvent(window, pointer("pointerup", 100));
      expect(JSON.stringify(editor.document)).toContain('"previewWidth":300');
      act(() => { editor.undo(); });
      expect(JSON.stringify(editor.document)).toBe(before);
    } finally {
      view.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("vertically centers image-only cells and updates alignment when text changes", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const editor = createEditor(undefined, false);
    const image = { type: "tableImage" as const, props: {
      url: "data:image/png;base64,YQ==", name: "Image", previewWidth: 120,
    } };
    const content = { type: "tableContent" as const, rows: [
      { cells: [[image], "Text"] },
      { cells: [[{ type: "text" as const, text: "Caption", styles: {} }, image], "Text"] },
    ] };
    editor.updateBlock("table", { content });
    const view = render(<BlockNoteView editor={editor} />);
    try {
      const cells = () => view.container.querySelectorAll("td,th");
      expect(cells()[0]).toHaveClass("table-image-only-cell");
      expect(cells()[2]).not.toHaveClass("table-image-only-cell");
      const exported = new DOMParser().parseFromString((await buildStandaloneHtml(editor, editor.document)).html, "text/html");
      expect(exported.querySelectorAll("td,th")[0].classList.contains("table-image-only-cell")).toBe(true);
      expect(exported.querySelectorAll("td,th")[2].classList.contains("table-image-only-cell")).toBe(false);
      act(() => editor.updateBlock("table", { content: { type: "tableContent", rows: [
        { cells: [[image, { type: "text", text: "Caption", styles: {} }], "Text"] },
        { cells: [[image, image], "Text"] },
      ] } }));
      expect(cells()[0]).not.toHaveClass("table-image-only-cell");
      expect(cells()[2]).toHaveClass("table-image-only-cell");
    } finally {
      view.unmount();
      vi.unstubAllGlobals();
    }
  });
});
