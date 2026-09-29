import { BlockNoteEditor } from "@blocknote/core";
import { FormattingToolbarExtension } from "@blocknote/core/extensions";
import { NodeSelection } from "@tiptap/pm/state";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installImageToolbarHover } from "./imageToolbarHover";
import { HIDE_IMAGE_HOVER_TOOLBAR_EVENT } from "./splitDividerHover";
import { BlockMarqueeExtension, getBlockMarquee } from "./blockMarquee";

let editor: BlockNoteEditor;
let dispose: () => void;
const originalExecCommand = Object.getOwnPropertyDescriptor(document, "execCommand");
beforeEach(() => {
  vi.useFakeTimers();
  editor = BlockNoteEditor.create({ extensions: [BlockMarqueeExtension()], initialContent: [
    { id: "text", type: "paragraph", content: "编辑位置" },
    { id: "image", type: "image", props: { url: "image.png" } },
  ] });
  const host = document.createElement("div");
  document.body.append(host);
  editor.mount(host);
  editor.setTextCursorPosition("text", "end");
  dispose = installImageToolbarHover(editor);
});
afterEach(() => {
  dispose(); editor._tiptapEditor.destroy(); document.body.innerHTML = "";
  vi.restoreAllMocks(); vi.useRealTimers();
  if (originalExecCommand) Object.defineProperty(document, "execCommand", originalExecCommand);
  else Reflect.deleteProperty(document, "execCommand");
});
const image = () => editor.prosemirrorView.dom.querySelector('[data-content-type="image"] img')!;
const imageBlock = () => editor.prosemirrorView.dom.querySelector('[data-content-type="image"]')!;
const toolbar = () => editor.getExtension(FormattingToolbarExtension)!.store;

it("only opens when the pointer reaches the image, not the rest of its block", () => {
  const before = editor.prosemirrorState.selection.toJSON();
  fireEvent.pointerOver(imageBlock());
  expect(toolbar().state).toBe(false);
  expect(editor.prosemirrorState.selection.toJSON()).toEqual(before);

  fireEvent.pointerOver(image());
  expect(toolbar().state).toBe(true);
  fireEvent.pointerMove(imageBlock());
  vi.advanceTimersByTime(250);
  expect(toolbar().state).toBe(false);
  expect(editor.prosemirrorState.selection.toJSON()).toEqual(before);
});

it("shows the image toolbar on hover without focusing, scrolling or modifying content", () => {
  const focus = vi.spyOn(editor, "focus");
  const before = JSON.stringify(editor.document);
  const selection = editor.prosemirrorState.selection.toJSON();
  fireEvent.pointerOver(image());
  expect(toolbar().state).toBe(true);
  expect(editor.prosemirrorState.selection).toBeInstanceOf(NodeSelection);
  expect(editor.getTextCursorPosition().block.id).toBe("image");
  expect(focus).not.toHaveBeenCalled();
  expect(JSON.stringify(editor.document)).toBe(before);
  fireEvent.pointerMove(document.body);
  vi.advanceTimersByTime(250);
  expect(toolbar().state).toBe(false);
  expect(editor.prosemirrorState.selection.toJSON()).toEqual(selection);
});

it("hides the toolbar before restoring the original cursor position", () => {
  fireEvent.pointerOver(image());
  const view = editor.prosemirrorView;
  const originalDispatch = view.dispatch.bind(view);
  const toolbarStatesDuringDispatch: boolean[] = [];
  const dispatch = vi.spyOn(view, "dispatch").mockImplementation(transaction => {
    toolbarStatesDuringDispatch.push(toolbar().state);
    originalDispatch(transaction);
  });

  fireEvent.pointerMove(document.body);
  vi.advanceTimersByTime(250);

  expect(toolbarStatesDuringDispatch).toEqual([false]);
  dispatch.mockRestore();
});

it("keeps the toolbar open while moving across the gap into its controls", () => {
  const controls = document.createElement("div");
  controls.className = "bn-toolbar";
  document.body.append(controls);
  fireEvent.pointerOver(image());
  fireEvent.pointerMove(document.body);
  vi.advanceTimersByTime(100);
  fireEvent.pointerMove(controls);
  vi.advanceTimersByTime(300);
  expect(toolbar().state).toBe(true);
  fireEvent.pointerMove(document.body);
  vi.advanceTimersByTime(250);
  expect(toolbar().state).toBe(false);
});

it("restores the cursor immediately when entering the split divider", () => {
  const selection = editor.prosemirrorState.selection.toJSON();
  fireEvent.pointerOver(image());
  window.dispatchEvent(new Event(HIDE_IMAGE_HOVER_TOOLBAR_EVENT));
  expect(toolbar().state).toBe(false);
  expect(editor.prosemirrorState.selection.toJSON()).toEqual(selection);
});

it("restores the editing position before typing and preserves deliberate image clicks", () => {
  const before = editor.prosemirrorState.selection.toJSON();
  fireEvent.pointerOver(image());
  fireEvent.keyDown(editor.prosemirrorView.dom, { key: "a" });
  expect(editor.prosemirrorState.selection.toJSON()).toEqual(before);
  fireEvent.pointerOver(image());
  fireEvent.pointerDown(image());
  fireEvent.pointerMove(document.body);
  vi.advanceTimersByTime(300);
  expect(editor.prosemirrorState.selection).toBeInstanceOf(NodeSelection);
});

it("copies the whole image block with Ctrl+C while its hover toolbar is active", () => {
  editor.prosemirrorView.focus();
  fireEvent.pointerOver(image());
  const values = new Map<string, string>();
  const clipboard = {
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? "",
    clearData: () => values.clear(),
  } as unknown as DataTransfer;
  Object.defineProperty(document, "execCommand", { configurable: true, value: () => {
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboard });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  } });
  fireEvent.keyDown(editor.prosemirrorView.dom, { key: "Control", ctrlKey: true });
  expect(toolbar().state).toBe(true);
  const key = new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true });
  editor.prosemirrorView.dom.dispatchEvent(key);
  expect(key.defaultPrevented).toBe(true);
  const selection = editor.prosemirrorState.selection as NodeSelection;
  expect(selection.node.type.name).toBe("blockContainer");
  expect(clipboard.getData("blocknote/html")).toContain('data-content-type="image"');
  expect(clipboard.getData("blocknote/html")).toContain('data-id="image"');
});

it("maps the saved cursor through edits and closes on scroll", () => {
  fireEvent.pointerOver(image());
  editor.updateBlock("text", { content: "扩展后的编辑位置" });
  fireEvent.scroll(document);
  expect(editor.getTextCursorPosition().block.id).toBe("text");
  expect(toolbar().state).toBe(false);
});

it("keeps marquee copy responsible for all selected blocks when hovering an image", () => {
  const command = vi.fn();
  Object.defineProperty(document, "execCommand", { configurable: true, value: command });
  editor.prosemirrorView.focus();
  getBlockMarquee(editor)!.select(["text", "image"]);
  fireEvent.pointerOver(image());
  fireEvent.keyDown(editor.prosemirrorView.dom, { key: "Control", ctrlKey: true });
  fireEvent.keyDown(editor.prosemirrorView.dom, { key: "c", ctrlKey: true });
  expect(command).not.toHaveBeenCalled();
  const values = new Map<string, string>();
  const copy = new Event("copy", { bubbles: true, cancelable: true });
  Object.defineProperty(copy, "clipboardData", { value: {
    setData: (type: string, value: string) => values.set(type, value),
  } });
  editor.prosemirrorView.dom.dispatchEvent(copy);
  expect(values.get("blocknote/html")).toContain('data-id="text"');
  expect(values.get("blocknote/html")).toContain('data-id="image"');
});

it("does not select images on hover in a read-only editor", () => {
  editor.isEditable = false;
  const before = editor.prosemirrorState.selection.toJSON();
  fireEvent.pointerOver(image());
  expect(toolbar().state).toBe(false);
  expect(editor.prosemirrorState.selection.toJSON()).toEqual(before);
});
