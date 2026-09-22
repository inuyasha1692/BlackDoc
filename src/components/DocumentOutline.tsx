import type { Block } from "@blocknote/core";
import { ChevronLeft, ListTree } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getBlockElement, revealBlock } from "../editor/blockLinks";
import { getOutlineItems } from "../editor/outline";

interface DocumentOutlineProps {
  blocks: readonly Block[];
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

  useEffect(() => {
    if (collapsed || items.length === 0) {
      return;
    }

    let frame = 0;
    const updateActiveHeading = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let current = items[0]?.id ?? null;
        for (const item of items) {
          const element = getBlockElement(item.id);
          if (element && element.getBoundingClientRect().top <= 132) {
            current = item.id;
          }
        }

        const isAtDocumentEnd =
          window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 2;
        if (isAtDocumentEnd) {
          for (let index = items.length - 1; index >= 0; index -= 1) {
            if (getBlockElement(items[index].id)) {
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

  if (collapsed) {
    return null;
  }

  return (
    <aside className="outline" aria-label="文档大纲">
      <div className="outline-header">
        <div className="outline-title">
          <ListTree aria-hidden="true" size={17} />
          <span>本文大纲</span>
        </div>
        <button
          aria-label="收起大纲"
          className="icon-button"
          onClick={onToggle}
          title="收起大纲"
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
      </div>

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
              title={item.text}
              type="button"
            >
              {item.text}
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}
