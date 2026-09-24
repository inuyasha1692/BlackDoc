import type { BlackDocBlock } from "../editor/schema";
import { invoke } from "@tauri-apps/api/core";

export interface DraftRecord {
  id: string;
  blocks: BlackDocBlock[];
  updatedAt: string;
}

export const writeDraft = async (blocks: BlackDocBlock[]): Promise<void> => {
  await invoke("desktop_write_draft", { blocks });
};

export const deleteDraft = async (): Promise<void> => {
  await invoke("desktop_delete_draft");
};
