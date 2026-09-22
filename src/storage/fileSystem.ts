import type { Block } from "@blocknote/core";
import { isBlockDocument } from "../editor/document";

const BLOCKDOC_FILE_TYPES: FilePickerAcceptType[] = [
  {
    description: "BlockDoc 文档",
    accept: {
      "application/json": [".blockdoc.json"],
    },
  },
];

export interface OpenedDocument {
  blocks: Block[];
  handle: FileSystemFileHandle;
  name: string;
}

export const supportsFileSystemAccess = (): boolean =>
  "showOpenFilePicker" in window && "showSaveFilePicker" in window;

export const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

export const openDocumentFile = async (): Promise<OpenedDocument> => {
  const [handle] = await window.showOpenFilePicker({
    types: BLOCKDOC_FILE_TYPES,
    multiple: false,
  });
  const file = await handle.getFile();
  const parsed: unknown = JSON.parse(await file.text());

  if (!isBlockDocument(parsed)) {
    throw new Error("该文件不是有效的 BlockNote 文档块数组。");
  }

  return { blocks: parsed, handle, name: file.name };
};

export const chooseSaveFile = async (
  suggestedName: string,
): Promise<FileSystemFileHandle> =>
  window.showSaveFilePicker({
    suggestedName,
    types: BLOCKDOC_FILE_TYPES,
  });

export const writeDocumentFile = async (
  handle: FileSystemFileHandle,
  blocks: readonly Block[],
): Promise<void> => {
  const writable = await handle.createWritable();
  try {
    await writable.write(`${JSON.stringify(blocks, null, 2)}\n`);
  } finally {
    await writable.close();
  }
};

