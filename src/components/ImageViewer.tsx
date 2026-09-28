import { useBlockNoteEditor, useComponentsContext, useEditorState } from "@blocknote/react";
import { Maximize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./imageViewer.css";

type ImageSource = { url: string; name: string };
const OPEN_IMAGE_EVENT = "blackdoc-open-image";

export function ImageViewButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const image = useEditorState({
    editor,
    selector: ({ editor }): ImageSource | undefined => {
      const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
      if (blocks.length !== 1) return;
      const block = blocks[0];
      if (block.type === "image" && block.props.url) {
        return { url: block.props.url, name: block.props.name || "图片" };
      }
    },
  });
  if (!image) return null;
  return <Components.FormattingToolbar.Button
    className="bn-button"
    label="放大查看"
    mainTooltip="放大查看"
    icon={<Maximize2 size={17} aria-hidden="true" />}
    onClick={() => window.dispatchEvent(new CustomEvent(OPEN_IMAGE_EVENT, { detail: image }))}
  />;
}

function ImageDialog({ image, onClose }: { image: ImageSource; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [originalSize, setOriginalSize] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return createPortal(<dialog
    ref={dialog}
    className="image-viewer"
    aria-label="放大查看图片"
    onCancel={onClose}
    onClose={() => { if (!dialog.current?.open) onClose(); }}
    onKeyDown={event => event.stopPropagation()}
    onPointerDown={event => event.stopPropagation()}
  >
    <header className="image-viewer-header">
      <span title={image.name}>{image.name}</span>
      <button type="button" aria-pressed={originalSize} onClick={() => setOriginalSize(value => !value)}>
        {originalSize ? "适应窗口" : "原始大小"}
      </button>
      <button type="button" className="icon-button" aria-label="关闭图片查看" title="关闭（Esc）" onClick={onClose}>
        <X size={20} aria-hidden="true" />
      </button>
    </header>
    <div className={`image-viewer-surface${originalSize ? " image-viewer-original" : ""}`}>
      {failed ? <p role="alert">图片加载失败，请关闭后重试。</p> :
        <img src={image.url} alt={image.name} onError={() => setFailed(true)} />}
    </div>
  </dialog>, document.body);
}

// The host stays mounted when the floating toolbar loses focus or closes.
export function ImageViewerHost() {
  const [image, setImage] = useState<ImageSource | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      const source: Partial<ImageSource> | undefined = (event as CustomEvent<ImageSource>).detail;
      if (source && typeof source.url === "string" && source.url) {
        setImage({ url: source.url, name: typeof source.name === "string" ? source.name : "图片" });
      }
    };
    const close = () => setImage(null);
    window.addEventListener(OPEN_IMAGE_EVENT, open);
    window.addEventListener("blackdoc-close-image", close);
    return () => {
      window.removeEventListener(OPEN_IMAGE_EVENT, open);
      window.removeEventListener("blackdoc-close-image", close);
    };
  }, []);
  return image ? <ImageDialog key={image.url} image={image} onClose={() => setImage(null)} /> : null;
}
