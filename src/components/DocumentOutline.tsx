import type { BlackDocBlock } from "../editor/schema";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getBlockElement, revealBlock } from "../editor/blockLinks";
import { getOutlineItems } from "../editor/outline";
import { RIGHT_SCROLL_SELECTOR } from "../editor/splitPane";

interface DocumentOutlineProps {
  blocks: readonly BlackDocBlock[];
  collapsed: boolean;
  onToggle: () => void;
}

export function DocumentOutline({
  blocks,
  collapsed,
  onToggle,
}: DocumentOutlineProps) {
  const items = useMemo(() => getOutlineItems(blocks), [blocks]);
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
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
            if (!element || element.closest(RIGHT_SCROLL_SELECTOR) !== innerScroll) {
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
            if (target && !target.closest(RIGHT_SCROLL_SELECTOR)) {
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

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateActiveHeading, true);
      window.removeEventListener("resize", updateActiveHeading);
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
            {items.map((item) => (
              <button
                aria-current={activeId === item.id ? "location" : undefined}
                className="outline-item"
                key={item.id}
                onClick={() => {
                  revealBlock(item.id);
                  setActiveId(item.id);
                }}
                onMouseDown={(event) => event.preventDefault()}
                style={{ paddingLeft: `${10 + (item.level - 1) * 12}px` }}
                title={item.number ? `${item.number} ${item.text}` : item.text}
                type="button"
              >
                {item.number ? `${item.number} ${item.text}` : item.text}
              </button>
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
