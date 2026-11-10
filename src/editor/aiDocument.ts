import { BlockNoteEditor } from "@blocknote/core";
import { closeHistory } from "@tiptap/pm/history";
import { blackDocSchema, type BlackDocEditor, type BlackDocPartialBlock } from "./schema";
import { isBlackDocument } from "./document";

type RevisionState = { doc: BlackDocEditor["prosemirrorState"]["doc"]; key: string; path: string | null };

export function createAiRevision() {
  let previous: Omit<RevisionState, "doc"> & { doc: WeakRef<RevisionState["doc"]> } | undefined;
  let revision = "";
  return ({ doc, key, path }: RevisionState) => {
    if (!previous || previous.doc.deref() !== doc || previous.key !== key || previous.path !== path) {
      previous = { doc: new WeakRef(doc), key, path };
      revision = crypto.randomUUID();
    }
    return revision;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const textBlockTypes = new Set([
  "paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem",
]);

function isStyledText(value: unknown): boolean {
  return isRecord(value) && value.type === "text" && typeof value.text === "string" &&
    isRecord(value.styles) && Object.entries(value.styles).every(([name, value]) => {
      const schema = blackDocSchema.styleSchema;
      const style = Object.hasOwn(schema, name) ? schema[name as keyof typeof schema] : undefined;
      return style && typeof value === style.propSchema;
    });
}

function isInlineContent(value: unknown): boolean {
  if (isStyledText(value)) return true;
  if (!isRecord(value)) return false;
  if (value.type === "link") {
    return typeof value.href === "string" && Array.isArray(value.content) && value.content.every(isStyledText);
  }
  if (typeof value.type !== "string" || !isRecord(value.props)) return false;
  const schema = blackDocSchema.inlineContentSchema;
  const spec = Object.hasOwn(schema, value.type) ? schema[value.type as keyof typeof schema] : undefined;
  if (!spec || typeof spec !== "object" || !("propSchema" in spec) || spec.content !== "none") return false;
  const props: Record<string, { default?: unknown; type?: string; values?: readonly unknown[] }> = spec.propSchema;
  return Object.entries(value.props).every(([key, value]) => {
    const prop = Object.hasOwn(props, key) ? props[key] : undefined;
    return prop && typeof value === (prop.type ?? typeof prop.default) &&
      (!prop.values || prop.values.includes(value));
  });
}

function updateTextBlocks(editor: BlackDocEditor, changes: unknown) {
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("请提供要修改的文本块。");
  const seen = new Set<string>();
  const updates = changes.map((change: unknown) => {
    if (!isRecord(change) || change.op !== "updateContent" ||
      typeof change.blockId !== "string" || !change.blockId || Object.keys(change).length !== 3 ||
      !Array.isArray(change.content) || !change.content.every(isInlineContent)) {
      throw new Error("无效的文本块修改。");
    }
    if (seen.has(change.blockId)) throw new Error("同一块只能在一批修改中出现一次。");
    seen.add(change.blockId);
    return { blockId: change.blockId, content: change.content as BlackDocPartialBlock["content"] };
  });

  const before = editor.prosemirrorState.doc;
  const changed = editor.transact(tr => {
    for (const { blockId, content } of updates) {
      const block = editor.getBlock(blockId);
      if (!block || !textBlockTypes.has(block.type)) throw new Error(`未找到可修改的文本块：${blockId}`);
      editor.updateBlock(blockId, { content });
    }
    if (tr.docChanged) closeHistory(tr);
    return tr.docChanged;
  });
  if (changed && editor.prosemirrorState.doc === before) throw new Error("编辑器拒绝了这批修改。");
  if (changed) editor.transact(tr => { closeHistory(tr); });
  return changed;
}

export function applyAiDocument(editor: BlackDocEditor, request: unknown, revision: string) {
  if (!isRecord(request)) throw new Error("无效的 AI 请求。");
  if (request.revision !== revision) throw new Error("文档已变化，请重新读取快照后修改。");
  if ("changes" in request) {
    if ("blocks" in request) throw new Error("请只提交一种修改格式。");
    return updateTextBlocks(editor, request.changes);
  }
  const data = request;
  if (!isBlackDocument(data.blocks)) throw new Error("无效的文档块结构。");
  const ids = new Set<string>();
  const checkIds = (blocks: typeof data.blocks) => {
    for (const block of blocks) {
      if (!block.id || ids.has(block.id)) throw new Error("每个块必须具有唯一 ID。");
      ids.add(block.id);
      if (block.children?.length) checkIds(block.children);
    }
  };
  checkIds(data.blocks);
  // Normalize and validate against the actual schema before touching the live editor.
  const candidate = BlockNoteEditor.create({ schema: blackDocSchema, initialContent: data.blocks });
  const blocks = candidate.document;
  candidate._tiptapEditor.destroy();
  const before = editor.prosemirrorState.doc;
  const changed = editor.transact(tr => {
    closeHistory(tr);
    editor.replaceBlocks(editor.document, blocks);
    return tr.docChanged;
  });
  if (changed && editor.prosemirrorState.doc === before) throw new Error("编辑器拒绝了这批修改。");
  editor.transact(tr => { closeHistory(tr); });
  return changed;
}
