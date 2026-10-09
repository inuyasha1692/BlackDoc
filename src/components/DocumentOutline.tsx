import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getBlockElement, revealBlock } from "../editor/blockLinks";
import type { OutlineItem } from "../editor/outline";
import { RIGHT_SCROLL_SELECTOR } from "../editor/splitPane";
import type { BlackDocEditor } from "../editor/schema";
import { getHeadingFoldState, HEADING_FOLDS_CHANGED, setHeadingSectionExpanded } from "../editor/headingSections";

interface DocumentOutlineProps {
  items: readonly OutlineItem[];
  collapsed: boolean;
  onToggle: () => void;
  editor?: BlackDocEditor;
}

export function DocumentOutline({
  items,
  collapsed,
  onToggle,
  editor,
}: DocumentOutlineProps) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [folds, setFolds] = useState<ReturnType<typeof getHeadingFoldState>>(() => ({ owners: new Map(), expanded: new Map() }));
  useEffect(() => {
    if (!editor) return;
    let element: HTMLElement | undefined;
    const refresh = () => setFolds(getHeadingFoldState(editor.prosemirrorView));
    const detach = () => element?.removeEventListener(HEADING_FOLDS_CHANGED, refresh);
    const attach = () => {
      detach();
      element = editor.prosemirrorView.dom;
      element.addEventListener(HEADING_FOLDS_CHANGED, refresh);
      refresh();
    };
    const removeMountListener = editor.onMount(attach);
    const removeUnmountListener = editor.onUnmount(detach);
    if (!editor._tiptapEditor.isDestroyed) attach();
    return () => {
      detach();
      removeMountListener();
      removeUnmountListener();
    };
  }, [editor]);
  const [toggleHint, setToggleHint] = useState<{ left: number; top: number } | null>(null);
  const showToggleHint = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setToggleHint({
      left: Math.min(rect.right + 8, window.innerWidth - 104),
      top: rect.top + rect.height / 2,
    });
  };

  useEffect(() => {
    if (collapsed || items.length === 0) {
      return;
    }

    let frame = 0;
    const updateActiveHeading = (event?: Event) => {
      const innerScroll = event?.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>(RIGHT_SCROLL_SELECTOR) : null;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (innerScroll) {
          const threshold = innerScroll.getBoundingClientRect().top + 40;
          let first: string | null = null;
          let current: string | null = null;
          let nearestTop = -Infinity;
          for (const item of items) {
            const element = getBlockElement(item.id);
            if (!element || element.closest(".heading-section-hidden") || element.closest(RIGHT_SCROLL_SELECTOR) !== innerScroll) {
              continue;
            }
            first ??= item.id;
            const top = element.getBoundingClientRect().top;
            // A heading still owns the content below it after leaving the viewport.
            if (top <= threshold && top >= nearestTop) {
              current = item.id;
              nearestTop = top;
            }
          }
          const next = current ?? first;
          if (next !== null) setActiveId(next);
          return;
        }

        let current = items[0]?.id ?? null;
        for (const item of items) {
          const element = getBlockElement(item.id);
          if (element?.closest(".heading-section-hidden")) continue;
          const scroll = element?.closest<HTMLElement>(RIGHT_SCROLL_SELECTOR);
          const rect = element?.getBoundingClientRect();
          const scrollRect = scroll?.getBoundingClientRect();
          if (rect && scrollRect && (rect.bottom <= scrollRect.top || rect.top >= scrollRect.bottom)) {
            continue;
          }
          const threshold = scrollRect ? Math.max(132, scrollRect.top + 40) : 132;
          if (rect && rect.top <= threshold && (!scrollRect || scrollRect.top < window.innerHeight)) {
            current = item.id;
          }
        }

        const isAtDocumentEnd = !innerScroll &&
          document.documentElement.scrollHeight > window.innerHeight &&
          window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 2;
        if (isAtDocumentEnd) {
          for (let index = items.length - 1; index >= 0; index -= 1) {
            const target = getBlockElement(items[index].id);
            if (target && !target.closest(".heading-section-hidden") && !target.closest(RIGHT_SCROLL_SELECTOR)) {
              current = items[index].id;
              break;
            }
          }
        }

        setActiveId(current);
      });
    };

    updateActiveHeading();
    window.addEventListener("scroll", updateActiveHeading, true);
    window.addEventListener("resize", updateActiveHeading);
    window.addEventListener(HEADING_FOLDS_CHANGED, updateActiveHeading);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateActiveHeading, true);
      window.removeEventListener("resize", updateActiveHeading);
      window.removeEventListener(HEADING_FOLDS_CHANGED, updateActiveHeading);
    };
  }, [collapsed, items]);

  return (
    <aside id="document-outline" className="outline" aria-label="文档大纲">
      <div className="outline-header">
        <div className="outline-title">
          <button
            aria-controls="document-outline-content"
            aria-describedby={toggleHint ? "outline-toggle-tooltip" : undefined}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "展开大纲" : "收起大纲"}
            className="icon-button outline-toggle"
            onBlur={() => setToggleHint(null)}
            onClick={() => { setToggleHint(null); onToggle(); }}
            onFocus={event => showToggleHint(event.currentTarget)}
            onMouseEnter={event => showToggleHint(event.currentTarget)}
            onMouseLeave={() => setToggleHint(null)}
            type="button"
          >
            {collapsed
              ? <PanelLeftOpen aria-hidden="true" size={18} />
              : <PanelLeftClose aria-hidden="true" size={18} />}
          </button>
          <span className="outline-label">大纲</span>
        </div>
      </div>

      <div className="outline-content" id="document-outline-content" aria-hidden={collapsed} inert={collapsed}>
        {items.length === 0 ? (
          <p className="outline-empty">添加标题后将在这里显示。</p>
        ) : (
          <nav className="outline-list">
            {items.filter(item => !folds.owners.get(item.id)?.some(owner => folds.expanded.get(owner) === false)).map((item) => (
              <div className="outline-row" key={item.id} style={{ paddingLeft: `${(item.level - 1) * 12}px` }}>
                {folds.expanded.has(item.id) ? (
                  <button
                    className="outline-fold"
                    type="button"
                    aria-label={`${folds.expanded.get(item.id) ? "折叠" : "展开"}标题：${item.text}`}
                    aria-expanded={folds.expanded.get(item.id)}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => { if (editor) setHeadingSectionExpanded(editor.prosemirrorView, item.id, !folds.expanded.get(item.id)); }}
                  >
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                ) : <span className="outline-fold-spacer" aria-hidden="true" />}
                <button
                  aria-current={activeId === item.id ? "location" : undefined}
                  className="outline-item"
                  onClick={() => {
                    revealBlock(item.id);
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  title={item.number ? `${item.number} ${item.text}` : item.text}
                  type="button"
                >
                  {item.number ? `${item.number} ${item.text}` : item.text}
                </button>
              </div>
            ))}
          </nav>
        )}
      </div>
      {toggleHint && createPortal(
        <span id="outline-toggle-tooltip" role="tooltip" className="outline-toggle-tooltip"
          style={{ left: toggleHint.left, top: toggleHint.top }}>
          {collapsed ? "展开大纲" : "收起大纲"}
        </span>, document.body,
      )}
    </aside>
  );
}
