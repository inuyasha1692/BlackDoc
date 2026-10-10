import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { blackDocSchema, type BlackDocEditor } from "./schema";
import { FormattingToolbarController } from "@blocknote/react";
import { FormattingToolbarExtension } from "@blocknote/core/extensions";
import { BlackDocFormattingToolbar } from "../components/BlockLinkControls";

let editor: BlackDocEditor;
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("PointerEvent", MouseEvent);
  editor = BlockNoteEditor.create({ schema: blackDocSchema, initialContent: [{
    id: "table", type: "table", content: { type: "tableContent", rows: [{ cells: [{
      type: "tableCell", content: [{ type: "tableImage", props: { url: "image.png", name: "Diagram", previewWidth: 100 } }],
    }] }] },
  }] });
});
afterEach(() => { cleanup(); editor._tiptapEditor.destroy(); vi.unstubAllGlobals(); });

it("shows image actions for a selected table image and deletes only that image", async () => {
  const { container, getByRole, queryByRole, getByPlaceholderText, getByLabelText } = render(
    <BlockNoteView editor={editor} formattingToolbar={false}>
      <FormattingToolbarController formattingToolbar={BlackDocFormattingToolbar} />
    </BlockNoteView>,
  );
  await waitFor(() => expect(container.querySelector(".table-image-frame img")).not.toBeNull());
  fireEvent.mouseDown(container.querySelector(".table-image-frame img")!);
  act(() => editor.getExtension(FormattingToolbarExtension)!.store.setState(true));
  await waitFor(() => expect(getByRole("button", { name: "删除图片" })).toBeVisible());
  expect(getByRole("button", { name: "放大查看" })).toBeVisible();
  expect(getByRole("button", { name: "替换图片" })).toBeVisible();
  expect(getByRole("button", { name: "下载图片" })).toBeVisible();
  fireEvent.click(getByRole("button", { name: "居中" }));
  const table = editor.getBlock("table");
  if (table?.type !== "table") throw Error("Missing table");
  const cell = table.content.rows[0].cells[0];
  if (Array.isArray(cell)) throw Error("Missing cell props");
  expect(cell.props.textAlignment).toBe("center");
  const renameLabel = editor.dictionary.formatting_toolbar.file_rename.tooltip.image;
  const renamePlaceholder = editor.dictionary.formatting_toolbar.file_rename.input_placeholder.image;
  fireEvent.click(getByRole("button", { name: renameLabel }));
  await waitFor(() => expect(getByPlaceholderText(renamePlaceholder)).toBeVisible());
  fireEvent.change(getByPlaceholderText(renamePlaceholder), { target: { value: "改名图片" } });
  fireEvent.keyDown(getByPlaceholderText(renamePlaceholder), { key: "Enter" });
  expect(container.querySelector(".table-image-frame img")).toHaveAttribute("alt", "改名图片");
  fireEvent.change(getByLabelText("替换表格图片文件"), { target: { files: [new File(["image"], "替换.png", { type: "image/png" })] } });
  await waitFor(() => expect(container.querySelector(".table-image-frame img")).toHaveAttribute("alt", "替换.png"));
  expect(container.querySelector(".table-image-frame img")?.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  expect(width()).toBe(100);
  const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe("替换.png");
    expect(this.href).toMatch(/^data:image\/png;base64,/);
  });
  fireEvent.click(getByRole("button", { name: "下载图片" }));
  expect(download).toHaveBeenCalledOnce();
  download.mockRestore();
  expect(queryByRole("button", { name: /Bold|加粗/ })).toBeNull();
  fireEvent.click(getByRole("button", { name: "删除图片" }));
  expect(editor.getBlock("table")?.type).toBe("table");
  await waitFor(() => expect(container.querySelector(".table-image-frame")).toBeNull());
});
async function mount() {
  const { container } = render(<BlockNoteView editor={editor} />);
  await waitFor(() => expect(container.querySelector(".table-image-frame")).not.toBeNull());
  const frame = container.querySelector<HTMLElement>(".table-image-frame")!;
  const image = frame.querySelector("img")!;
  vi.spyOn(image, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 60));
  Object.defineProperty(image.closest("td,th"), "clientWidth", { value: 200 });
  fireEvent.mouseEnter(frame);
  return { frame, handle: (side: string) => frame.querySelector<HTMLButtonElement>(`.table-image-resize-handle.${side}`)! };
}
function width() {
  const table = editor.getBlock("table");
  if (table?.type !== "table") throw Error("Missing table");
  const cell = table.content.rows[0].cells[0];
  if (Array.isArray(cell)) throw Error("Missing cell props");
  const image = cell.content[0];
  if (image.type !== "tableImage") throw Error("Missing image");
  return image.props.previewWidth;
}
it.each(["left", "right"])("resizes from the %s handle and supports undo", async side => {
  const { handle } = await mount();
  fireEvent.pointerDown(handle(side), { button: 0, clientX: 100 });
  fireEvent.pointerMove(window, { clientX: side === "left" ? 70 : 130 });
  fireEvent.pointerUp(window);
  expect(width()).toBe(130);
  act(() => { editor.undo(); });
  expect(width()).toBe(100);
});
it("clamps the minimum width and cancels a drag without saving", async () => {
  const { frame, handle } = await mount();
  fireEvent.pointerDown(handle("right"), { button: 0, clientX: 100 });
  fireEvent.pointerMove(window, { clientX: -200 });
  expect(frame.style.width).toBe("24px");
  fireEvent.pointerCancel(window);
  expect(width()).toBe(100);
  fireEvent.pointerDown(handle("right"), { button: 0, clientX: 100 });
  fireEvent.pointerMove(window, { clientX: -200 });
  fireEvent.pointerUp(window);
  expect(width()).toBe(24);
});
it("keeps keyboard resizing available", async () => {
  const { handle } = await mount();
  fireEvent.keyDown(handle("right"), { key: "ArrowRight" });
  expect(width()).toBe(110);
});
