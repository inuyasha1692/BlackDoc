import { BlockNoteEditor } from "@blocknote/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeadingSectionsExtension } from "../editor/headingSections";
import { getOutlineItems } from "../editor/outline";
import { blackDocSchema, type BlackDocEditor, type BlackDocPartialBlock } from "../editor/schema";
import { DocumentOutline } from "./DocumentOutline";

const editors: BlackDocEditor[] = [];
const heading = (id: string, level: number): BlackDocPartialBlock => ({ id, type: "heading", props: { level }, content: id });
const text = (id: string): BlackDocPartialBlock => ({ id, type: "paragraph", content: id });
function mount(blocks: BlackDocPartialBlock[]) {
  const editor = BlockNoteEditor.create({ schema: blackDocSchema, extensions: [HeadingSectionsExtension()], initialContent: blocks });
  const host = document.createElement("div");
  document.body.append(host);
  editor.mount(host);
  editors.push(editor);
  render(<DocumentOutline editor={editor} items={getOutlineItems(editor.document)} collapsed={false} onToggle={vi.fn()} />);
  return { editor, host };
}
const outer = (editor: BlackDocEditor, id: string) => editor.prosemirrorView.dom.querySelector<HTMLElement>(`.bn-block-outer[data-id="${id}"]`)!;
const bodyToggle = (editor: BlackDocEditor, id: string) => {
  act(() => { outer(editor, id).querySelector<HTMLButtonElement>(".bn-toggle-button")!.click(); });
};
const outlineToggle = (id: string, expanded: boolean) => screen.getByRole("button", { name: `${expanded ? "折叠" : "展开"}标题：${id}` });

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor._tiptapEditor.destroy();
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("outline heading folds", () => {
  it("synchronizes both directions and retains child folds after reopening the parent", () => {
    const { editor } = mount([heading("root", 1), heading("child", 2), heading("detail", 3), text("body"), heading("peer", 2), heading("next", 1)]);
    const original = structuredClone(editor.document);
    fireEvent.click(outlineToggle("child", true));
    expect(outer(editor, "body")).toHaveClass("heading-section-hidden");
    expect(outlineToggle("child", false)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "折叠标题：detail" })).toBeNull();
    expect(outlineToggle("peer", true)).toBeVisible();

    bodyToggle(editor, "root");
    expect(outlineToggle("root", false)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "展开标题：child" })).toBeNull();
    expect(outlineToggle("next", true)).toBeVisible();
    fireEvent.click(outlineToggle("root", false));
    expect(outlineToggle("child", false)).toBeVisible();
    expect(outer(editor, "body")).toHaveClass("heading-section-hidden");
    bodyToggle(editor, "child");
    expect(outlineToggle("detail", true)).toBeVisible();
    expect(outer(editor, "body")).not.toHaveClass("heading-section-hidden");
    expect(editor.document).toEqual(original);
  });

  it("keeps headings in separate split columns independent", () => {
    const { editor } = mount([{ id: "pane", type: "splitPane", children: [
      { id: "left", type: "splitColumn", props: { side: "left" }, children: [heading("left-title", 2), heading("left-detail", 3), text("left-body")] },
      { id: "right", type: "splitColumn", props: { side: "right" }, children: [heading("right-title", 3), text("right-body")] },
    ] }]);
    fireEvent.click(outlineToggle("left-title", true));
    expect(screen.queryByRole("button", { name: "折叠标题：left-detail" })).toBeNull();
    expect(outlineToggle("right-title", true)).toBeVisible();
    expect(outer(editor, "right-body")).not.toHaveClass("heading-section-hidden");
  });

  it("continues synchronizing after the editor view is remounted", () => {
    const { editor, host } = mount([heading("root", 1), heading("child", 2)]);
    act(() => { editor.unmount(); editor.mount(host); });
    bodyToggle(editor, "root");
    expect(outlineToggle("root", false)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "折叠标题：child" })).toBeNull();
  });
});
