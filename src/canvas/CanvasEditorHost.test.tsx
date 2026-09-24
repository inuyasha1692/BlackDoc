import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { CanvasEditorHost } from "./CanvasPreview";
import { blackDocSchema } from "../editor/schema";

vi.mock("./CanvasEditor", () => ({
  default: ({ onChange }: { onChange: (scene: string) => void }) =>
    <button type="button" onClick={() => onChange('{"elements":[],"appState":{},"files":{}}')}>修改画布</button>,
}));

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps the document visible after editing and closing an embedded canvas", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const editor = BlockNoteEditor.create({
    schema: blackDocSchema,
    initialContent: [
      { id: "before", type: "paragraph", content: "正文前段" },
      { id: "canvas", type: "canvas" },
      { id: "after", type: "paragraph", content: "正文后段" },
    ],
  });
  const view = render(<StrictMode><BlockNoteView editor={editor} /><CanvasEditorHost editor={editor} /></StrictMode>);
  try {
    const update = vi.spyOn(editor, "updateBlock");
    expect(view.container).toHaveTextContent("正文前段");
    expect(view.container).toHaveTextContent("正文后段");
    act(() => window.dispatchEvent(new CustomEvent("blackdoc-open-canvas", { detail: "canvas" })));
    fireEvent.click(await screen.findByRole("button", { name: "修改画布" }));
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "完成编辑" }));
    await act(async () => {});
    expect(update).toHaveBeenCalledOnce();
    const canvas = editor.getBlock("canvas");
    expect(canvas?.type).toBe("canvas");
    if (canvas?.type === "canvas") expect(canvas.props.scene).toBe('{"elements":[],"appState":{},"files":{}}');
    expect(editor.document.map(block => block.id)).toEqual(["before", "canvas", "after"]);
    expect(view.container).toHaveTextContent("正文前段");
    expect(view.container).toHaveTextContent("正文后段");
  } finally {
    view.unmount();
    editor._tiptapEditor.destroy();
  }
});

it("discards pending canvas edits when the document is replaced", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const editor = BlockNoteEditor.create({ schema: blackDocSchema, initialContent: [
    { id: "canvas", type: "canvas" },
  ] });
  const view = render(<CanvasEditorHost editor={editor} />);
  try {
    const update = vi.spyOn(editor, "updateBlock");
    act(() => window.dispatchEvent(new CustomEvent("blackdoc-open-canvas", { detail: "canvas" })));
    fireEvent.click(await screen.findByRole("button", { name: "修改画布" }));
    act(() => window.dispatchEvent(new Event("blackdoc-close-canvas")));
    expect(update).not.toHaveBeenCalled();
    const canvas = editor.getBlock("canvas");
    expect(canvas?.type).toBe("canvas");
    if (canvas?.type === "canvas") expect(canvas.props.scene).toBe("");
  } finally {
    view.unmount();
    editor._tiptapEditor.destroy();
  }
});
