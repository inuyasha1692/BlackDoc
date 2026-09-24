import { BlockNoteEditor } from "@blocknote/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blackDocSchema } from "../editor/schema";
import { DocumentOutline } from "./DocumentOutline";

afterEach(() => { cleanup(); document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("outline inside a split pane", () => {
  it("keeps the toggle available in the outline header after collapse", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<DocumentOutline blocks={[]} collapsed={false} onToggle={onToggle} />);
    const outline = screen.getByRole("complementary", { name: "文档大纲" });
    const button = screen.getByRole("button", { name: "收起大纲" });

    expect(outline).toContainElement(button);
    expect(screen.getByText("大纲")).toBeVisible();
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.mouseEnter(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("收起大纲");
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole("tooltip")).toBeNull();

    rerender(<DocumentOutline blocks={[]} collapsed onToggle={onToggle} />);

    expect(outline).toBeVisible();
    expect(screen.getByRole("button", { name: "展开大纲" })).toBe(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("document-outline-content")).toHaveAttribute("aria-hidden", "true");
    expect(document.getElementById("document-outline-content")).toHaveAttribute("inert");
    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("展开大纲");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("tracks visible right headings even when the page is already at its bottom", async () => {
    const editor = BlockNoteEditor.create({
      schema: blackDocSchema,
      initialContent: [{ type: "splitPane", children: [
        { type: "splitColumn", props: { side: "left" }, children: [
          { id: "left", type: "heading", content: "Left heading" },
        ] },
        { type: "splitColumn", props: { side: "right" }, children: [
          { id: "first", type: "heading", content: "First right" },
          { id: "last", type: "heading", content: "Last right" },
        ] },
      ] }],
    });
    const targets = document.createElement("div");
    targets.innerHTML = '<div id="block=left"></div><div class="split-pane-right-scroll"><div id="block=first"></div><div id="block=last"></div></div>';
    document.body.append(targets);
    const rectangle = (top: number, bottom = top + 30) => ({ top, bottom }) as DOMRect;
    const scroll = targets.querySelector<HTMLElement>(".split-pane-right-scroll")!;
    scroll.getBoundingClientRect = () => rectangle(100, 400);
    document.getElementById("block=left")!.getBoundingClientRect = () => rectangle(110);
    document.getElementById("block=first")!.getBoundingClientRect = () => rectangle(0);
    document.getElementById("block=last")!.getBoundingClientRect = () => rectangle(115);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(200);
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(1000);

    render(<DocumentOutline blocks={editor.document} collapsed={false} onToggle={vi.fn()} />);
    fireEvent.scroll(scroll);
    await waitFor(() => expect(screen.getByRole("button", { name: "Last right" }))
      .toHaveAttribute("aria-current", "location"));
    expect(screen.getByRole("button", { name: "First right" })).not.toHaveAttribute("aria-current");
    editor._tiptapEditor.destroy();
  });
});
