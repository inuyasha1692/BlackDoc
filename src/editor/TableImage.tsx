import { createReactInlineContentSpec, useEditorState, type ReactCustomInlineContentRenderProps } from "@blocknote/react";
import { NodeSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import type { StyleSchema } from "@blocknote/core";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import "./tableImage.css";

const tableImageConfig = {
  type: "tableImage",
  propSchema: {
    url: { default: "" },
    name: { default: "" },
    previewWidth: { default: 0 },
  },
  content: "none",
} as const;

type ImageContent = {
  inlineContent: { props: { url: string; name: string; previewWidth: number } };
};

// Keep the inline node marker on a span so block image parsing cannot claim it.
const TableImageHTML = ({ inlineContent }: ImageContent) => <span><img
  src={inlineContent.props.url}
  alt={inlineContent.props.name}
  style={{ display: "inline-block", maxWidth: "100%", height: "auto", verticalAlign: "middle",
    width: inlineContent.props.previewWidth > 0 ? `${inlineContent.props.previewWidth}px` : undefined }}
/></span>;

const TableImageContent = ({ inlineContent, editor, getPos }: ReactCustomInlineContentRenderProps<typeof tableImageConfig, StyleSchema>) => {
  const image = useRef<HTMLImageElement>(null);
  const cleanupDrag = useRef<(() => void) | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const selected = useEditorState({ editor, selector: ({ editor }) => {
    const selection = editor.prosemirrorState.selection;
    return selection instanceof NodeSelection && selection.from === getPos();
  } });
  useEffect(() => () => cleanupDrag.current?.(), []);

  const saveWidth = (width: number) => {
    const pos = getPos();
    if (pos === undefined || !editor.isEditable) return;
    const view = editor.prosemirrorView;
    const node = view.state.doc.nodeAt(pos);
    if (node?.type.name !== "tableImage") return;
    view.dispatch(closeHistory(view.state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, previewWidth: width }));
  };
  const availableWidth = () => {
    const cell = image.current?.closest("td,th");
    const style = cell ? getComputedStyle(cell) : undefined;
    const width = cell ? cell.clientWidth - (parseFloat(style!.paddingLeft) || 0) - (parseFloat(style!.paddingRight) || 0) : 0;
    return Math.max(24, width || image.current?.getBoundingClientRect().width || 24);
  };
  const startResize = (side: "left" | "right") => (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !image.current || !editor.isEditable) return;
    event.preventDefault();
    event.stopPropagation();
    cleanupDrag.current?.();
    const initialWidth = image.current.getBoundingClientRect().width;
    const maxWidth = availableWidth();
    const startX = event.clientX;
    const pointerId = event.pointerId;
    let width = initialWidth;
    const move = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const delta = (moveEvent.clientX - startX) * (side === "left" ? -1 : 1);
      width = Math.round(Math.max(24, Math.min(maxWidth, initialWidth + delta)));
      setDragWidth(width);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      cleanupDrag.current = null;
    };
    const finish = (upEvent: globalThis.PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      cleanup();
      if (width !== initialWidth) saveWidth(width);
      setDragWidth(null);
    };
    const cancel = () => { cleanup(); setDragWidth(null); };
    cleanupDrag.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
  };
  const width = dragWidth ?? inlineContent.props.previewWidth;
  return <span className="table-image-frame" contentEditable={false}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    style={{ width: width > 0 ? width : undefined }}>
  <img
  ref={image}
  src={inlineContent.props.url}
  alt={inlineContent.props.name}
  draggable={false}
  onMouseDown={event => {
    const pos = getPos();
    if (pos === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const view = editor.prosemirrorView;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.focus();
  }}
  />
  {(hovered || selected || dragWidth !== null) && editor.isEditable && (["left", "right"] as const).map(side => <button
    key={side}
    type="button"
    className={`table-image-resize-handle ${side}`}
    aria-label={`缩放表格图片（${side === "left" ? "左侧" : "右侧"}）`}
    title="拖动调整图片大小"
    onPointerDown={startResize(side)}
    onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }}
    onKeyDown={event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      const currentWidth = image.current?.getBoundingClientRect().width ?? width;
      saveWidth(Math.max(24, Math.min(availableWidth(), Math.round(currentWidth + (event.key === "ArrowLeft" ? -10 : 10)))));
    }}
  />)}
  </span>;
};

export const TableImage = () => createReactInlineContentSpec(
  tableImageConfig,
  {
    render: TableImageContent,
    toExternalHTML: TableImageHTML,
  },
);
