import { BlockNoteEditor } from "@blocknote/core";
import { zh } from "@blocknote/core/locales";
import { SuggestionMenu, filterSuggestionItems } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/mantine";
import { SuggestionMenuController, getDefaultReactSlashMenuItems, type SuggestionMenuProps, type DefaultReactSuggestionItem } from "@blocknote/react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { filterSlashMenuItems } from "./slashMenuSearch";

const editors: BlockNoteEditor[] = [];
afterEach(() => { cleanup(); editors.splice(0).forEach(editor => editor._tiptapEditor.destroy()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function Results({ items, loadingState }: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  return <div role="status">{loadingState === "loaded" ? items.map(item => item.title).join("|") || "无匹配" : "加载中"}</div>;
}

it("matches the displayed Chinese title as well as its English alias", () => {
  const editor = BlockNoteEditor.create({ dictionary: zh });
  editors.push(editor);
  const items = getDefaultReactSlashMenuItems(editor);
  expect(filterSuggestionItems(items, "表格").map(item => item.title)).toContain("表格");
  expect(filterSuggestionItems(items, "table").map(item => item.title)).toContain("表格");
});

it.each([
  ["/", "biaoge"], ["、", "biaoge"],
  ["/", "biao'ge"], ["、", "biao'ge"],
])("keeps %s open while composing %s and matches 表格 after committing Chinese", async (trigger, pinyin) => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 100, 30));
  const editor = BlockNoteEditor.create({ dictionary: zh });
  editors.push(editor);
  const getItems = async (query: string) =>
    filterSlashMenuItems(getDefaultReactSlashMenuItems(editor), query, editor.prosemirrorView.composing);
  render(<BlockNoteView editor={editor} slashMenu={false}>
    <SuggestionMenuController triggerCharacter={trigger} getItems={getItems} suggestionMenuComponent={Results} />
  </BlockNoteView>);
  const suggestion = editor.getExtension(SuggestionMenu)!;
  act(() => { suggestion.openSuggestionMenu(trigger); });
  await screen.findByText(/表格/);
  const view = editor.prosemirrorView;
  const start = view.state.selection.from;
  fireEvent.compositionStart(view.dom);
  expect(view.composing).toBe(true);
  await act(async () => { view.dispatch(view.state.tr.insertText(pinyin)); });
  expect(suggestion.store.state?.show).toBe(true);
  expect(screen.getByRole("status")).toHaveTextContent("表格");
  expect(screen.queryByText("无匹配")).toBeNull();
  // Real IMEs can commit the chosen word while ProseMirror still reports composing.
  await act(async () => { view.dispatch(view.state.tr.insertText("表格", start, start + pinyin.length)); });
  expect(screen.getByRole("status")).toHaveTextContent(/^表格$/);
  expect(suggestion.store.state?.query).toBe("表格");
  fireEvent.compositionEnd(view.dom, { data: "表格" });
  expect(screen.getByRole("status")).toHaveTextContent(/^表格$/);
});
