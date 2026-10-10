import { FormattingToolbar, useBlockNoteEditor, useComponentsContext, useEditorState } from "@blocknote/react";
import { AlignCenter, AlignLeft, AlignRight, Download, ImagePlus, Pencil, Trash2 } from "lucide-react";
import { NodeSelection } from "@tiptap/pm/state";
import { useRef, useState } from "react";
import { ImageViewButton } from "./ImageViewer";

export function TableImageToolbar() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const renameLabel = editor.dictionary.formatting_toolbar.file_rename.tooltip.image;
  const renamePlaceholder = editor.dictionary.formatting_toolbar.file_rename.input_placeholder.image;
  const input = useRef<HTMLInputElement>(null);
  const [rename, setRename] = useState(false);
  const [imageName, setImageName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const image = useEditorState({ editor, selector: ({ editor }) => {
    const selection = editor.prosemirrorState.selection;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== "tableImage") return;
    let alignment = "left";
    for (let depth = selection.$from.depth; depth > 0; depth--) {
      const node = selection.$from.node(depth);
      if (["cell", "header_cell"].includes(node.type.spec.tableRole)) { alignment = node.attrs.textAlignment; break; }
    }
    return { pos: selection.from, attrs: { ...selection.node.attrs }, alignment };
  } });
  if (!image) return null;
  const update = (attrs: Record<string, unknown>) => {
    const view = editor.prosemirrorView;
    const node = view.state.doc.nodeAt(image.pos);
    if (node?.type.name !== "tableImage") return;
    const transaction = view.state.tr.setNodeMarkup(image.pos, undefined, { ...node.attrs, ...attrs });
    view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, image.pos)));
  };
  const align = (textAlignment: string) => {
    const view = editor.prosemirrorView;
    const $pos = view.state.doc.resolve(image.pos);
    for (let depth = $pos.depth; depth > 0; depth--) {
      const cell = $pos.node(depth);
      if (!["cell", "header_cell"].includes(cell.type.spec.tableRole)) continue;
      const transaction = view.state.tr.setNodeMarkup($pos.before(depth), undefined, { ...cell.attrs, textAlignment });
      view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, image.pos)));
      break;
    }
  };
  const Button = Components.FormattingToolbar.Button;
  return <FormattingToolbar>
    <Button className="bn-button" label="替换图片" mainTooltip="替换图片" icon={<ImagePlus size={17} />} isDisabled={busy} onClick={() => input.current?.click()} />
    <input ref={input} type="file" aria-label="替换表格图片文件" accept="image/*" hidden onChange={async event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (!file) return;
      let targetPos = image.pos;
      const map = ({ transaction }: { transaction: import("@tiptap/pm/state").Transaction }) => { targetPos = transaction.mapping.map(targetPos, -1); };
      editor._tiptapEditor.on("transaction", map);
      setBusy(true);
      setError("");
      try {
        const url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("图片读取失败"));
          reader.readAsDataURL(file);
        });
        const view = editor.prosemirrorView;
        if (view.isDestroyed) return;
        const node = view.state.doc.nodeAt(targetPos);
        if (node?.type.name !== "tableImage" || node.attrs.url !== image.attrs.url) return;
        const transaction = view.state.tr.setNodeMarkup(targetPos, undefined, { ...node.attrs, url, name: file.name });
        view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, targetPos)));
      } catch { setError("图片读取失败，请重试"); }
      finally { editor._tiptapEditor.off("transaction", map); setBusy(false); }
    }} />
    <Button className="bn-button" label={renameLabel} mainTooltip={renameLabel} icon={<Pencil size={17} aria-hidden="true" />} isSelected={rename} onClick={() => { setImageName(image.attrs.name); setRename(value => !value); }} />
    {rename && <input className="bn-text-input" style={{ width: 180 }} aria-label={renameLabel} name="table-image-name" value={imageName} autoFocus placeholder={renamePlaceholder} onChange={event => setImageName(event.currentTarget.value)} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); update({ name: imageName }); setRename(false); editor.prosemirrorView.focus(); }
      if (event.key === "Escape") { event.preventDefault(); setRename(false); editor.prosemirrorView.focus(); }
    }} />}
    <Button className="bn-button" label="删除图片" mainTooltip="删除图片" icon={<Trash2 size={17} />} onClick={() => {
      const view = editor.prosemirrorView;
      const node = view.state.doc.nodeAt(image.pos);
      if (node?.type.name !== "tableImage" || node.attrs.url !== image.attrs.url) return;
      view.dispatch(view.state.tr.delete(image.pos, image.pos + node.nodeSize)); view.focus();
    }} />
    <Button className="bn-button" label="下载图片" mainTooltip="下载图片" icon={<Download size={17} />} onClick={() => {
      const link = document.createElement("a");
      link.href = image.attrs.url; link.download = image.attrs.name || "图片";
      link.rel = "noopener"; document.body.append(link); link.click(); link.remove();
    }} />
    <ImageViewButton />
    {([ ["left", "左对齐", AlignLeft], ["center", "居中", AlignCenter], ["right", "右对齐", AlignRight] ] as const).map(([value, label, Icon]) =>
      <Button key={value} className="bn-button" label={label} mainTooltip={`${label}（所在单元格）`} isSelected={image.alignment === value} icon={<Icon size={17} />} onClick={() => align(value)} />)}
    {error && <span role="alert">{error}</span>}
  </FormattingToolbar>;
}
