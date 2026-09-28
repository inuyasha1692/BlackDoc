import { BlockNoteEditor } from "@blocknote/core";
import { FormattingToolbarExtension } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/mantine";
import { FormattingToolbarController } from "@blocknote/react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { imageToolbarFloatingUIOptions, installImageToolbarHover } from "./imageToolbarHover";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("removes the floating image toolbar without showing it at the restored cursor", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.useFakeTimers();
  const editor = BlockNoteEditor.create({
    initialContent: [
      { id: "text", type: "paragraph", content: "正文位置" },
      { id: "image", type: "image", props: { url: "image.png" } },
    ],
  });
  const { container } = render(
    <BlockNoteView editor={editor} formattingToolbar={false}>
      <FormattingToolbarController
        formattingToolbar={() => <div data-testid="floating-image-toolbar">图片工具栏</div>}
        floatingUIOptions={imageToolbarFloatingUIOptions}
      />
    </BlockNoteView>,
  );
  const dispose = installImageToolbarHover(editor);
  try {
    editor.setTextCursorPosition("text", "end");
    const image = container.querySelector('[data-content-type="image"] img')!;
    await act(async () => { fireEvent.pointerOver(image); });
    expect(document.querySelector('[data-testid="floating-image-toolbar"]')).not.toBeNull();

    await act(async () => {
      fireEvent.pointerMove(document.body);
      vi.advanceTimersByTime(250);
    });
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(editor.getExtension(FormattingToolbarExtension)!.store.state).toBe(false);
    expect(document.querySelector('[data-testid="floating-image-toolbar"]')).toBeNull();
  } finally {
    dispose();
    editor._tiptapEditor.destroy();
  }
});
