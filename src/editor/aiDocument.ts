import { BlockNoteEditor } from "@blocknote/core";
import { closeHistory } from "@tiptap/pm/history";
import { blackDocSchema, type BlackDocEditor } from "./schema";
import { isBlackDocument } from "./document";

export function applyAiDocument(editor: BlackDocEditor, request: unknown, revision: string) {
  if (!request || typeof request !== "object") throw new Error("无效的 AI 请求。");
  const data = request as { revision?: unknown; blocks?: unknown };
  if (data.revision !== revision) throw new Error("文档已变化，请重新读取快照后修改。");
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
  editor.transact(tr => {
    closeHistory(tr);
    editor.replaceBlocks(editor.document, blocks);
  });
  editor.transact(tr => { closeHistory(tr); });
}
