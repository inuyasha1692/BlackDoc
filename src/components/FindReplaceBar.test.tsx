import { BlockNoteEditor } from "@blocknote/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { blackDocSchema } from "../editor/schema";
import { FindAndReplaceExtension } from "../editor/findAndReplace";
import { FindReplaceBar } from "./FindReplaceBar";

const editors: ReturnType<typeof BlockNoteEditor.create>[] = [];

afterEach(() => {
  cleanup();
  editors.splice(0).forEach((editor) => editor._tiptapEditor.destroy());
  document.body.replaceChildren();
});

it("finds, navigates, replaces and clears highlights on close", () => {
  const editor = BlockNoteEditor.create({
    schema: blackDocSchema,
    extensions: [FindAndReplaceExtension()],
    initialContent: [{ id: "text", type: "paragraph", content: "Test test" }],
  });
  editor.mount(document.body.appendChild(document.createElement("div")));
  editors.push(editor);
  const onClose = vi.fn();
  const { unmount } = render(<FindReplaceBar editor={editor} onClose={onClose} />);

  fireEvent.change(screen.getByRole("searchbox", { name: "查找内容" }), {
    target: { value: "test" },
  });
  expect(screen.getByText("1 / 2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "下一个匹配" }));
  expect(screen.getByText("2 / 2")).toBeInTheDocument();
  expect(editor._tiptapEditor.state.selection.empty).toBe(true);
  expect(screen.getByRole("button", { name: "替换当前匹配" })).toHaveTextContent("替换");
  expect(screen.getByRole("button", { name: "替换全部匹配" })).toHaveTextContent("全部替换");

  fireEvent.change(screen.getByRole("textbox", { name: "替换为" }), {
    target: { value: "done" },
  });
  fireEvent.click(screen.getByRole("button", { name: "替换当前匹配" }));
  expect(editor.getBlock("text")?.content).toEqual([
    expect.objectContaining({ text: "Test done" }),
  ]);
  expect(screen.getByText("1 / 1")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "关闭查找替换" }));
  expect(onClose).toHaveBeenCalledOnce();
  unmount();
  expect(editor._tiptapEditor.storage.findAndReplace.results).toHaveLength(0);
});

it("closes with Escape from a button", () => {
  const editor = BlockNoteEditor.create({
    schema: blackDocSchema,
    extensions: [FindAndReplaceExtension()],
    initialContent: [{ id: "text", type: "paragraph", content: "hello" }],
  });
  editor.mount(document.body.appendChild(document.createElement("div")));
  editors.push(editor);
  const onClose = vi.fn();
  render(<FindReplaceBar editor={editor} onClose={onClose} />);
  fireEvent.keyDown(screen.getByRole("button", { name: "关闭查找替换" }), { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

it("allows replacing matches with empty text", () => {
  const editor = BlockNoteEditor.create({
    schema: blackDocSchema,
    extensions: [FindAndReplaceExtension()],
    initialContent: [{ id: "text", type: "paragraph", content: "hello hello" }],
  });
  editor.mount(document.body.appendChild(document.createElement("div")));
  editors.push(editor);
  render(<FindReplaceBar editor={editor} onClose={() => {}} />);
  fireEvent.change(screen.getByRole("searchbox", { name: "查找内容" }), {
    target: { value: "hello" },
  });
  fireEvent.click(screen.getByRole("button", { name: "替换全部匹配" }));
  expect(editor.getBlock("text")?.content).toEqual([
    expect.objectContaining({ text: " " }),
  ]);
});
