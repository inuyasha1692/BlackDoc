import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { blackDocSchema } from "./schema";
import { SplitPaneExtension } from "./splitPaneExtension";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("resizes a right-side split-pane image to the same 24px minimum as a table image", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const editor = BlockNoteEditor.create({
    schema: blackDocSchema,
    extensions: [SplitPaneExtension()],
    initialContent: [{
      id: "pane",
      type: "splitPane",
      children: [
        { id: "left", type: "splitColumn", props: { side: "left" }, children: [{ type: "paragraph" }] },
        { id: "right", type: "splitColumn", props: { side: "right" }, children: [
          { id: "right-image", type: "image", props: { url: "image.png", previewWidth: 100 } },
        ] },
      ],
    }],
  });
  try {
    const { container } = render(<BlockNoteView editor={editor} />);
    const wrapper = container.querySelector<HTMLElement>(
      '[data-id="right-image"] .bn-file-block-content-wrapper',
    )!;
    expect(wrapper.closest(".split-pane-column")).not.toBeNull();
    Object.defineProperty(wrapper, "clientWidth", { value: 100 });
    wrapper.querySelector<HTMLElement>(".bn-resize-handle")!.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 100 }),
    );
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 200 }));
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    const image = editor.getBlock("right-image");
    expect(image?.type).toBe("image");
    if (image?.type === "image") expect(image.props.previewWidth).toBe(24);
  } finally {
    cleanup();
    editor._tiptapEditor.destroy();
  }
});
