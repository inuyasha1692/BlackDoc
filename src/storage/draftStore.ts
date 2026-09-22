import type { Block } from "@blocknote/core";
import { openDB, type DBSchema } from "idb";

export interface DraftRecord {
  id: "current";
  blocks: Block[];
  updatedAt: string;
}

interface BlockDocDatabase extends DBSchema {
  drafts: {
    key: DraftRecord["id"];
    value: DraftRecord;
  };
}

const databasePromise = openDB<BlockDocDatabase>("blockdoc", 1, {
  upgrade(database) {
    if (!database.objectStoreNames.contains("drafts")) {
      database.createObjectStore("drafts", { keyPath: "id" });
    }
  },
});

export const readDraft = async (): Promise<DraftRecord | undefined> => {
  const database = await databasePromise;
  return database.get("drafts", "current");
};

export const writeDraft = async (blocks: Block[]): Promise<void> => {
  const database = await databasePromise;
  await database.put("drafts", {
    id: "current",
    blocks,
    updatedAt: new Date().toISOString(),
  });
};

export const deleteDraft = async (): Promise<void> => {
  const database = await databasePromise;
  await database.delete("drafts", "current");
};

