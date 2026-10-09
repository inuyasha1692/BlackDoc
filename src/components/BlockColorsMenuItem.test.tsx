import type { ReactNode } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { blackDocSchema, type BlackDocEditor } from "../editor/schema";
import { BlockColorsMenuItem } from "./BlockColorsMenuItem";
const context = vi.hoisted(() => ({ editor: null as BlackDocEditor | null }));
vi.mock("@blocknote/react", async importOriginal => ({
  ...await importOriginal<typeof import("@blocknote/react")>(),
  useBlockNoteEditor: () => context.editor,
  useExtensionState: () => context.editor?.getBlock("target"),
  useDictionary: () => ({ color_picker: { text_title: "字体颜色", background_title: "背景颜色", colors: {
    default: "default", gray: "gray", brown: "brown", red: "red", orange: "orange", yellow: "yellow",
    green: "green", blue: "blue", purple: "purple", pink: "pink",
  } }, drag_handle: { colors_menuitem: "颜色" } }),
  useComponentsContext: () => {
    const Wrapper = ({ children }: { children: ReactNode }) => <div>{children}</div>;
    return { Generic: { Menu: { Root: Wrapper, Trigger: Wrapper, Item: Wrapper, Dropdown: Wrapper } } };
  },
}));
beforeEach(() => {
  context.editor = BlockNoteEditor.create({ schema: blackDocSchema, initialContent: [
    { id: "target", type: "paragraph", content: "Keep content" },
    { id: "other", type: "heading", content: "Other heading" },
  ] });
  context.editor.mount(document.createElement("div"));
});
afterEach(() => { cleanup(); context.editor?._tiptapEditor.destroy(); });
it.each(["字体颜色", "背景颜色"])("applies %s to the hovered block and preserves other content", label => {
  const onColorApplied = vi.fn();
  const before = JSON.stringify(context.editor!.getBlock("other"));
  render(<BlockColorsMenuItem onColorApplied={onColorApplied} />);
  fireEvent.click(screen.getByRole("button", { name: `${label}：red` }));
  const block = context.editor!.getBlock("target")!;
  expect(block.props).toMatchObject({ [label === "字体颜色" ? "textColor" : "backgroundColor"]: "red" });
  expect(JSON.stringify(block.content)).toContain("Keep content");
  expect(JSON.stringify(context.editor!.getBlock("other"))).toBe(before);
  expect(onColorApplied).toHaveBeenCalledOnce();
});
it("resets both colors", () => {
  context.editor!.updateBlock("target", { props: { textColor: "red", backgroundColor: "blue" } });
  render(<BlockColorsMenuItem onColorApplied={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));
  expect(context.editor!.getBlock("target")!.props).toMatchObject({ textColor: "default", backgroundColor: "default" });
});
