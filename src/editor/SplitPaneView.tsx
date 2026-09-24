import { Columns2, GripHorizontal, GripVertical, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  clampSplitHeight, clampSplitWidth, SPLIT_AUTO_HEIGHT, SPLIT_HEIGHT, SPLIT_HEIGHT_PRESETS, SPLIT_WIDTH,
} from "./splitPane";
import "./splitPane.css";

type ResizeAxis = "width" | "height";

export function SplitPaneControls({
  id, leftWidth, rightHeight, editable, onChange, onDelete,
}: {
  id: string;
  leftWidth: number;
  rightHeight: number;
  editable: boolean;
  onChange: (props: { leftWidth?: number; rightHeight?: number }) => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    axis: ResizeAxis; x: number; y: number; width: number; start: number; value: number;
  } | null>(null);
  const [preview, setPreview] = useState<{ leftWidth?: number; rightHeight?: number }>({});
  const width = clampSplitWidth(preview.leftWidth ?? leftWidth);
  const autoHeight = rightHeight === SPLIT_AUTO_HEIGHT && preview.rightHeight === undefined;
  const height = clampSplitHeight(preview.rightHeight ?? rightHeight);
  const currentHeight = () => {
    const right = ref.current?.closest(".split-pane-editor")
      ?.querySelector<HTMLElement>(".split-pane-right-scroll");
    return clampSplitHeight(autoHeight ? right?.getBoundingClientRect().height ?? height : height);
  };

  const startResize = (event: PointerEvent<HTMLButtonElement>, axis: ResizeAxis) => {
    if (event.button !== 0 || !editable) return;
    event.preventDefault();
    event.stopPropagation();
    const root = ref.current?.closest<HTMLElement>(".split-pane-editor");
    if (!root) return;
    drag.current = {
      axis, x: event.clientX, y: event.clientY,
      width: root.getBoundingClientRect().width,
      start: axis === "width" ? width : currentHeight(),
      value: axis === "width" ? width : currentHeight(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveResize = (event: PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active) return;
    const value = active.axis === "width"
      ? clampSplitWidth(active.start + (event.clientX - active.x) / active.width * 100)
      : clampSplitHeight(active.start + event.clientY - active.y);
    active.value = value;
    setPreview(active.axis === "width" ? { leftWidth: value } : { rightHeight: value });
  };
  const finishResize = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    if (!cancel && active.value !== active.start) {
      onChange(active.axis === "width" ? { leftWidth: active.value } : { rightHeight: active.value });
    }
    setPreview({});
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return <div className="split-pane-controls" contentEditable={false} ref={ref}>
    <style>{`.bn-block-outer[data-id="${CSS.escape(id)}"] { --split-left-width: ${width}%; --split-right-height: ${autoHeight ? "auto" : `${height}px`}; --split-height-handle-top: ${autoHeight ? "auto" : `calc(var(--split-toolbar-height) + ${height}px)`}; --split-height-handle-bottom: ${autoHeight ? "14px" : "auto"}; }`}</style>
    <div className="split-pane-toolbar">
      <span className="split-pane-label"><Columns2 size={15} aria-hidden="true" />双分区</span>
      {editable && <>
        <label className="split-height-label">右侧高度
          <select
            aria-label="右侧高度预设"
            value={autoHeight ? SPLIT_AUTO_HEIGHT : SPLIT_HEIGHT_PRESETS.some(value => value === height) ? height : "custom"}
            onChange={event => onChange({ rightHeight: Number(event.target.value) })}
          >
            <option value="custom" disabled>自定义</option>
            <option value={SPLIT_AUTO_HEIGHT}>自适应</option>
            <option value={240}>小</option>
            <option value={400}>中</option>
            <option value={640}>大</option>
          </select>
        </label>
        <input
          aria-label="右侧高度（像素）"
          type="number" min={SPLIT_HEIGHT.min} max={SPLIT_HEIGHT.max}
          key={autoHeight ? "auto" : height} defaultValue={autoHeight ? "" : height}
          placeholder={autoHeight ? "自动" : undefined}
          onBlur={event => {
            if (event.target.value.trim() === "") return;
            const next = clampSplitHeight(Number(event.target.value));
            if (autoHeight || next !== height) onChange({ rightHeight: next });
          }}
          onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
            event.stopPropagation();
          }}
        />
        <span className="split-height-unit">px</span>
        <button className="split-pane-delete" type="button" title="删除双分区"
          aria-label="删除双分区" onClick={onDelete}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </>}
    </div>
    {editable && <>
      <button type="button" className="split-width-handle" role="separator"
        aria-label="左右分区宽度" aria-orientation="vertical"
        aria-valuemin={SPLIT_WIDTH.min} aria-valuemax={SPLIT_WIDTH.max}
        aria-valuenow={width} aria-valuetext={`左侧 ${width}%，右侧 ${100 - width}%`}
        title={`调整左右宽度：${width}% / ${100 - width}%`}
        onPointerDown={event => startResize(event, "width")} onPointerMove={moveResize}
        onPointerUp={event => finishResize(event)} onPointerCancel={event => finishResize(event, true)}
        onLostPointerCapture={event => finishResize(event, true)}
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          onChange({ leftWidth: event.key === "Home" ? SPLIT_WIDTH.min : event.key === "End"
            ? SPLIT_WIDTH.max : clampSplitWidth(width + (event.key === "ArrowLeft" ? -1 : 1)) });
        }}>
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <button type="button" className="split-height-handle" role="separator"
        aria-label="右侧分区高度" aria-orientation="horizontal"
        aria-valuemin={SPLIT_HEIGHT.min} aria-valuemax={SPLIT_HEIGHT.max}
        aria-valuenow={autoHeight ? undefined : height} aria-valuetext={autoHeight ? "自适应" : `${height}px`}
        title={autoHeight ? "拖动以设置固定高度" : `调整右侧高度：${height}px`}
        onPointerDown={event => startResize(event, "height")} onPointerMove={moveResize}
        onPointerUp={event => finishResize(event)} onPointerCancel={event => finishResize(event, true)}
        onLostPointerCapture={event => finishResize(event, true)}
        onKeyDown={event => {
          if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          onChange({ rightHeight: event.key === "Home" ? SPLIT_HEIGHT.min : event.key === "End"
            ? SPLIT_HEIGHT.max : clampSplitHeight(currentHeight() + (event.key === "ArrowUp" ? -20 : 20)) });
        }}>
        <GripHorizontal size={18} aria-hidden="true" />
      </button>
    </>}
  </div>;
}
