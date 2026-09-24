import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { deleteDraft, writeDraft } from "./draftStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

it("persists and removes drafts through desktop commands", async () => {
  const blocks: Parameters<typeof writeDraft>[0] = [{
    id: "sample",
    type: "paragraph",
    props: { backgroundColor: "default", textColor: "default", textAlignment: "left" },
    content: [],
    children: [],
  }];
  await writeDraft(blocks);
  await deleteDraft();

  expect(invoke).toHaveBeenNthCalledWith(1, "desktop_write_draft", { blocks });
  expect(invoke).toHaveBeenNthCalledWith(2, "desktop_delete_draft");
});
