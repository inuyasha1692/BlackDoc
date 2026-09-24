import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getOutlineItems } from "./outline";
import { blackDocSchema } from "./schema";
import { HeadingNumberExtension } from "./headingNumberExtension";

describe("heading number decorations", () => {
  it("renders the same numbers as the outline across split columns and after edits", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const heading = (id: string, level: number, content: string) => ({
      id, type: "heading" as const, props: { level: level as 2 | 3 | 4 }, content,
    });
    const editor = BlockNoteEditor.create({
      schema: blackDocSchema,
      extensions: [HeadingNumberExtension()],
      initialContent: [
        ...Array.from({ length: 6 }, (_, index) => heading(`before-${index}`, 2, `Before ${index}`)),
        heading("chapter", 2, "Split pane"),
        { id: "pane", type: "splitPane" as const, children: [
          { id: "left-column", type: "splitColumn" as const, props: { side: "left" as const }, children: [heading("left", 3, "Revision")] },
          { id: "right-column", type: "splitColumn" as const, props: { side: "right" as const }, children: [
            heading("right", 3, "Plan"),
            heading("first", 4, "Entrance"),
            heading("second", 4, "Layout"),
            heading("third", 4, "Materials"),
            heading("later", 3, "Instructions"),
          ] },
        ] },
      ],
    });
    const view = render(<BlockNoteView editor={editor} />);
    const content = (id: string) => view.container.querySelector<HTMLElement>(`.bn-block-outer[data-id="${id}"] > .bn-block > .bn-block-content[data-content-type="heading"]`);
    const number = (id: string) => content(id)?.getAttribute("data-heading-number");
    try {
      expect(["chapter", "left", "right", "first", "second", "third", "later"].map(number))
        .toEqual(["7", "7.1", "7.2", "7.2.1", "7.2.2", "7.2.3", "7.3"]);
      expect(content("right")?.style.getPropertyValue("--blackdoc-heading-number").trim()).toBe('"7.2 "');
      for (const item of getOutlineItems(editor.document)) {
        expect(number(item.id)).toBe(item.number);
      }
      act(() => editor.insertBlocks([heading("new-chapter", 2, "New")], "chapter", "before"));
      expect(number("left")).toBe("8.1");
      expect(number("first")).toBe("8.2.1");
    } finally {
      view.unmount();
      editor._tiptapEditor.destroy();
      vi.unstubAllGlobals();
    }
  });
});
