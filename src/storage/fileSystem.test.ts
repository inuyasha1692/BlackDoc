import type { Block } from "@blocknote/core";
import { describe, expect, it, vi } from "vitest";
import { writeDocumentFile } from "./fileSystem";

describe("writeDocumentFile", () => {
  it("writes the native block array as formatted JSON and closes the file", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const handle = {
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    } as unknown as FileSystemFileHandle;
    const blocks = [
      {
        id: "title",
        type: "heading",
        props: { level: 1 },
        content: [{ type: "text", text: "测试", styles: {} }],
        children: [],
      },
    ] as unknown as Block[];

    await writeDocumentFile(handle, blocks);

    expect(handle.createWritable).toHaveBeenCalledOnce();
    expect(JSON.parse(write.mock.calls[0][0])).toEqual(blocks);
    expect(close).toHaveBeenCalledOnce();
  });
});

