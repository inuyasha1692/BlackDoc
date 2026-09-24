import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode, type PointerEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AlignLeft, AlignCenter, AlignRight, Pencil, PenTool, X } from "lucide-react";
import { canvasSvg } from "./export";
import type { BlackDocEditor } from "../editor/schema";
import "./canvas.css";

const CanvasEditor = lazy(() => import("./CanvasEditor"));
const OPEN_CANVAS_EVENT = "blackdoc-open-canvas";

class CanvasErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    return this.state.error
      ? <p role="alert">画布加载失败，请关闭后重试。</p>
      : this.props.children;
  }
}

function CanvasDialog({
  source, onChange, onClose,
}: {
  source: string;
  onChange: (source: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="canvas-dialog"
      aria-label="编辑画布"
      onCancel={onClose}
      onClose={() => {
        if (!dialog.current?.open) onClose();
      }}
      onKeyDown={event => {
        // Keep canvas shortcuts out of the document editor.
        if (!((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s")) {
          event.stopPropagation();
        }
      }}
      onPointerDown={event => event.stopPropagation()}
    >
      <header className="canvas-dialog-header">
        <span><PenTool size={18} aria-hidden="true" />画布</span>
        <button className="icon-button" type="button" title="完成编辑" aria-label="完成编辑" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="canvas-editor-surface">
        <CanvasErrorBoundary>
          <Suspense fallback={<p role="status">正在加载画布…</p>}>
            <CanvasEditor source={source} onChange={onChange} />
          </Suspense>
        </CanvasErrorBoundary>
      </div>
    </dialog>,
    document.body,
  );
}

export function CanvasEditorHost({ editor }: { editor: BlackDocEditor }) {
  const [active, setActive] = useState<{ id: string; source: string } | null>(null);
  const latest = useRef("");
  const activeId = useRef<string | null>(null);
  const close = (commit: boolean) => {
    const id = activeId.current;
    activeId.current = null;
    if (commit && id) {
      const block = editor.getBlock(id);
      if (block?.type === "canvas" && block.props.scene !== latest.current) {
        editor.updateBlock(block, { props: { scene: latest.current } });
      }
    }
    setActive(null);
  };
  useEffect(() => {
    const open = (event: Event) => {
      const id: unknown = (event as CustomEvent).detail;
      if (typeof id !== "string") return;
      const block = editor.getBlock(id);
      if (block?.type !== "canvas") return;
      latest.current = block.props.scene;
      activeId.current = id;
      setActive({ id, source: block.props.scene });
    };
    window.addEventListener(OPEN_CANVAS_EVENT, open);
    const discard = () => {
      activeId.current = null;
      setActive(null);
    };
    window.addEventListener("blackdoc-close-canvas", discard);
    return () => {
      window.removeEventListener(OPEN_CANVAS_EVENT, open);
      window.removeEventListener("blackdoc-close-canvas", discard);
    };
  }, [editor]);
  if (!active) return null;
  return <CanvasDialog
    source={active.source}
    onChange={source => {
      latest.current = source;
    }}
    onClose={() => close(true)}
  />;
}

export function CanvasPreview({
  source, id, previewWidth, editable, onResize, alignment = "left", onAlign,
}: {
  source: string;
  id: string;
  previewWidth: number;
  editable: boolean;
  onResize: (width: number) => void;
  alignment?: "left" | "center" | "right";
  onAlign?: (alignment: "left" | "center" | "right") => void;
}) {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number; side: number; next: number } | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? (Number.isFinite(previewWidth) && previewWidth > 0 ? previewWidth : undefined);
  const clampWidth = (value: number) => {
    const max = container.current?.clientWidth || 640;
    return Math.min(max, Math.max(Math.min(160, max), Math.round(value)));
  };
  const startResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const initial = frame.current!.getBoundingClientRect().width;
    drag.current = { x: event.clientX, width: initial, side: event.currentTarget.dataset.side === "left" ? -1 : 1, next: initial };
    setDragWidth(initial);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    const next = clampWidth(drag.current.width + (event.clientX - drag.current.x) * drag.current.side * (alignment === "center" ? 2 : 1));
    drag.current.next = next;
    setDragWidth(next);
  };
  const finishResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    const next = drag.current.next;
    drag.current = null;
    setDragWidth(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
    onResize(next);
  };
  const cancelResize = () => { drag.current = null; setDragWidth(null); };
  const keyboardResize = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const side = event.currentTarget.dataset.side === "left" ? -1 : 1;
    onResize(clampWidth(frame.current!.getBoundingClientRect().width + direction * side * 10));
  };
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void canvasSvg(source).then(uri => {
        if (!cancelled) { setImage(uri); setError(""); }
      }).catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "画布预览失败。");
      });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [source]);
  return (
    <div ref={container} className="canvas-block" contentEditable={false}>
      <div ref={frame} className="canvas-preview-frame" style={{ width: width ? `${width}px` : "100%", marginLeft: alignment === "left" ? 0 : "auto", marginRight: alignment === "right" ? 0 : "auto" }}>
      {editable && onAlign && <div className="canvas-alignment" role="group" aria-label="画板对齐">
        {([
          ["left", "画板靠左", AlignLeft], ["center", "画板居中", AlignCenter], ["right", "画板靠右", AlignRight],
        ] as const).map(([value, label, Icon]) => <button key={value} type="button" title={label} aria-label={label} aria-pressed={alignment === value}
          onMouseDown={event => event.preventDefault()}
          onClick={event => { event.stopPropagation(); onAlign(value); }}><Icon size={16} aria-hidden="true" /></button>)}
      </div>}
      <button className="canvas-preview" type="button" aria-label="编辑画布" onClick={() =>
        window.dispatchEvent(new CustomEvent(OPEN_CANVAS_EVENT, { detail: id }))
      }>
        {image && !error
          ? <img src={image} alt="画布" draggable={false} />
          : <PenTool size={32} aria-hidden="true" />}
        <span className="canvas-edit-label"><Pencil size={15} aria-hidden="true" />编辑画布</span>
      </button>
      {editable && (["left", "right"] as const).map(side => (
        <button
          key={side}
          data-side={side}
          type="button"
          className={`canvas-resize-handle canvas-resize-${side}`}
          aria-label={side === "left" ? "调整画布左侧宽度" : "调整画布右侧宽度"}
          title="拖动调整画布宽度"
          onClick={event => { event.preventDefault(); event.stopPropagation(); }}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={finishResize}
          onLostPointerCapture={cancelResize}
          onPointerCancel={cancelResize}
          onKeyDown={keyboardResize}
        />
      ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
