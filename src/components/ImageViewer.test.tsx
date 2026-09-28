import { StrictMode, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImageViewButton, ImageViewerHost } from "./ImageViewer";

const { editor } = vi.hoisted(() => ({ editor: {
  getSelection: vi.fn(),
  getTextCursorPosition: vi.fn(),
} }));
vi.mock("@blocknote/react", () => ({
  useBlockNoteEditor: () => editor,
  useEditorState: ({ selector }: { selector: (state: { editor: typeof editor }) => unknown }) => selector({ editor }),
  useComponentsContext: () => ({ FormattingToolbar: { Button: ({ label, icon, onClick }: {
    label: string; icon: ReactNode; onClick: () => void;
  }) => <button aria-label={label} onClick={onClick}>{icon}</button> } }),
}));

beforeEach(() => {
  editor.getSelection.mockReturnValue(undefined);
  editor.getTextCursorPosition.mockReturnValue({ block: { type: "image", props: { url: "data:image/png;base64,test", name: "地图" } } });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});
afterEach(cleanup);

it("keeps the image viewer open after its toolbar unmounts and switches display size", () => {
  const host = render(<StrictMode><ImageViewerHost /></StrictMode>);
  const toolbar = render(<ImageViewButton />);
  fireEvent.click(screen.getByRole("button", { name: "放大查看" }));
  toolbar.unmount();
  expect(screen.getByRole("dialog", { name: "放大查看图片" })).toBeVisible();
  expect(screen.getByRole("img", { name: "地图" })).toHaveAttribute("src", "data:image/png;base64,test");
  fireEvent.click(screen.getByRole("button", { name: "原始大小" }));
  expect(screen.getByRole("img").parentElement).toHaveClass("image-viewer-original");
  fireEvent.click(screen.getByRole("button", { name: "适应窗口" }));
  expect(screen.getByRole("img").parentElement).not.toHaveClass("image-viewer-original");
  fireEvent.click(screen.getByRole("button", { name: "关闭图片查看" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  host.unmount();
});

it("closes on native cancel and when replacing the document", () => {
  render(<ImageViewerHost />);
  const open = () => act(() => { window.dispatchEvent(new CustomEvent("blackdoc-open-image", { detail: { url: "image.png", name: "图片" } })); });
  open();
  fireEvent(screen.getByRole("dialog"), new Event("cancel"));
  expect(screen.queryByRole("dialog")).toBeNull();
  open();
  act(() => { window.dispatchEvent(new Event("blackdoc-close-image")); });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("hides the button for text, empty images and multi-block selections", () => {
  for (const blocks of [
    [{ type: "paragraph", props: {} }],
    [{ type: "image", props: { url: "" } }],
    [{ type: "image", props: { url: "image.png" } }, { type: "paragraph", props: {} }],
  ]) {
    editor.getSelection.mockReturnValue({ blocks });
    const view = render(<ImageViewButton />);
    expect(screen.queryByRole("button", { name: "放大查看" })).toBeNull();
    view.unmount();
  }
});
