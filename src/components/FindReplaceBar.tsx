import { ArrowDown, ArrowUp, Replace, ReplaceAll, X } from "lucide-react";
import { FindAndReplacePluginKey } from "@tiptap/extension-find-and-replace";
import { useEffect, useRef, useState } from "react";
import type { BlackDocEditor } from "../editor/schema";
import { RIGHT_SCROLL_SELECTOR } from "../editor/splitPane";

type SearchState = { total: number; currentIndex: number | null };

function readSearchState(editor: BlackDocEditor): SearchState {
  const { results, currentIndex } = editor._tiptapEditor.storage.findAndReplace;
  return { total: results.length, currentIndex };
}

function revealCurrentResult(editor: BlackDocEditor) {
  requestAnimationFrame(() => {
    if (editor._tiptapEditor.isDestroyed) return;
    const mark = editor._tiptapEditor.view.dom.querySelector<HTMLElement>(
      ".find-and-replace-result-current",
    );
    if (!mark) return;

    const inner = mark.closest<HTMLElement>(RIGHT_SCROLL_SELECTOR);
    const rect = mark.getBoundingClientRect();
    if (inner) {
      const bounds = inner.getBoundingClientRect();
      inner.scrollTop += rect.top - bounds.top - inner.clientHeight / 2 + rect.height / 2;
    }

    const outer = inner?.closest<HTMLElement>(".split-pane") ?? mark;
    const outerRect = outer.getBoundingClientRect();
    const top = document.querySelector(".find-replace-bar")?.getBoundingClientRect().bottom ?? 56;
    if (outerRect.top < top + 12 || outerRect.top > window.innerHeight - 80) {
      window.scrollTo({ top: Math.max(0, window.scrollY + outerRect.top - top - 16) });
    }
  });
}

interface FindReplaceBarProps {
  editor: BlackDocEditor;
  onClose: () => void;
}

export function FindReplaceBar({ editor, onClose }: FindReplaceBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [state, setState] = useState(() => readSearchState(editor));
  const tiptap = editor._tiptapEditor;

  useEffect(() => {
    const update = () => setState(readSearchState(editor));
    tiptap.on("transaction", update);
    inputRef.current?.focus();
    return () => {
      tiptap.off("transaction", update);
      tiptap.commands.clearSearch();
    };
  }, [editor, tiptap]);

  const searchFor = (value: string) => {
    setSearch(value);
    tiptap.commands.setSearchTerm(value);
    if (value) revealCurrentResult(editor);
  };

  const navigate = (direction: "next" | "previous") => {
    const { results, currentIndex } = tiptap.storage.findAndReplace;
    if (!results.length) return;
    const nextIndex = currentIndex === null
      ? direction === "next" ? 0 : results.length - 1
      : (currentIndex + (direction === "next" ? 1 : -1) + results.length) % results.length;
    tiptap.view.dispatch(
      tiptap.state.tr.setMeta(FindAndReplacePluginKey, { currentIndex: nextIndex }),
    );
    revealCurrentResult(editor);
  };

  const replace = (all: boolean) => {
    if (all) tiptap.commands.replaceAll();
    else tiptap.commands.replace();
    if (!all) revealCurrentResult(editor);
  };

  return (
    <div className="find-replace-bar" role="search" aria-label="查找替换" onKeyDown={(event) => {
      if (event.key === "Escape") onClose();
    }}>
      <div className="find-replace-controls">
        <input
          aria-label="查找内容"
          onChange={(event) => searchFor(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              navigate(event.shiftKey ? "previous" : "next");
            }
          }}
          placeholder="查找"
          ref={inputRef}
          type="search"
          value={search}
        />
        <span aria-live="polite" className="find-replace-count">
          {state.total ? `${(state.currentIndex ?? 0) + 1} / ${state.total}` : "0 / 0"}
        </span>
        <button aria-label="上一个匹配" disabled={!state.total} onClick={() => navigate("previous")} title="上一个匹配 (Shift+Enter)" type="button">
          <ArrowUp aria-hidden="true" size={17} />
        </button>
        <button aria-label="下一个匹配" disabled={!state.total} onClick={() => navigate("next")} title="下一个匹配 (Enter)" type="button">
          <ArrowDown aria-hidden="true" size={17} />
        </button>
      </div>
      <div className="find-replace-controls">
        <input
          aria-label="替换为"
          onChange={(event) => {
            setReplacement(event.target.value);
            tiptap.commands.setReplaceTerm(event.target.value);
          }}
          placeholder="替换为"
          type="text"
          value={replacement}
        />
        <button aria-label="替换当前匹配" className="find-replace-action" disabled={!state.total || !editor.isEditable} onClick={() => replace(false)} title="替换当前匹配" type="button">
          <Replace aria-hidden="true" size={17} />
          <span>替换</span>
        </button>
        <button aria-label="替换全部匹配" className="find-replace-action" disabled={!state.total || !editor.isEditable} onClick={() => replace(true)} title="替换全部匹配" type="button">
          <ReplaceAll aria-hidden="true" size={17} />
          <span>全部替换</span>
        </button>
      </div>
      <label className="find-replace-case">
        <input checked={caseSensitive} onChange={(event) => {
          setCaseSensitive(event.target.checked);
          tiptap.commands.setCaseSensitive(event.target.checked);
          revealCurrentResult(editor);
        }} type="checkbox" />
        区分大小写
      </label>
      <button aria-label="关闭查找替换" className="find-replace-close" onClick={onClose} title="关闭查找替换 (Esc)" type="button">
        <X aria-hidden="true" size={17} />
      </button>
    </div>
  );
}
