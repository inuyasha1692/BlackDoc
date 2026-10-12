import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CopyBlockLinkButton } from "./CopyBlockLinkButton";
import { BLOCK_LINK_COPIED_EVENT, BLOCK_LINK_COPY_FAILED_EVENT, COPY_BLOCK_LINK_LABEL } from "../editor/blockLinks";
const { editor } = vi.hoisted(() => ({ editor: { getSelection: vi.fn(), getTextCursorPosition: vi.fn() } }));
vi.mock("@blocknote/react", () => ({
  useBlockNoteEditor: () => editor,
  useEditorState: ({ selector }: { selector: (state: { editor: typeof editor }) => unknown }) => selector({ editor }),
  useComponentsContext: () => ({ FormattingToolbar: { Button: ({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) => <button aria-label={label} onClick={onClick}>{icon}</button> } }),
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it.each(["paragraph", "image", "table"])("copies the enclosing %s block and places a separator before the button", async type => {
  editor.getSelection.mockReturnValue({ blocks: [{ id: "target 1", type }] });
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const copied = vi.fn();
  window.addEventListener(BLOCK_LINK_COPIED_EVENT, copied);
  try {
    render(<CopyBlockLinkButton />);
    const button = screen.getByRole("button", { name: COPY_BLOCK_LINK_LABEL });
    expect(button.previousElementSibling).toBe(screen.getByRole("separator"));
    await act(async () => { fireEvent.click(button); });
    expect(writeText).toHaveBeenCalledWith("#block=target%201");
    expect(copied).toHaveBeenCalledOnce();
  } finally { window.removeEventListener(BLOCK_LINK_COPIED_EVENT, copied); }
});
it("hides both separator and button for multiple blocks", () => {
  editor.getSelection.mockReturnValue({ blocks: [{ id: "a" }, { id: "b" }] });
  render(<CopyBlockLinkButton />);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("separator")).toBeNull();
});
it("reports clipboard failure through the existing error notice event", async () => {
  editor.getSelection.mockReturnValue(undefined);
  editor.getTextCursorPosition.mockReturnValue({ block: { id: "cursor" } });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
  const failed = vi.fn();
  window.addEventListener(BLOCK_LINK_COPY_FAILED_EVENT, failed);
  try {
    render(<CopyBlockLinkButton />);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(failed).toHaveBeenCalledOnce();
  } finally { window.removeEventListener(BLOCK_LINK_COPY_FAILED_EVENT, failed); }
});
