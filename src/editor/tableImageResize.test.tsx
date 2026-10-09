import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { blackDocSchema, type BlackDocEditor } from "./schema";

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
