import type { BlackDocBlock as Block, BlackDocEditor } from "../editor/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStandaloneHtml } from "./standaloneHtml";
import { BlockNoteEditor } from "@blocknote/core";
import { blackDocSchema } from "../editor/schema";

const native = (id: string, type = "heading"): Block => ({
  id, type, props: { level: 2 },
  content: [{ type: "text", text: id, styles: {} }], children: [],
}) as unknown as Block;

const split = (props: Record<string, unknown> = {}): Block => ({
  id: "split", type: "splitPane", props,
  children: ["left", "right"].map(side => ({
    id: side, type: "splitColumn", props: { side },
    children: [native(`${side}-heading`), native(`${side}-body`, "paragraph")],
  })),
}) as unknown as Block;

// The internal serializer places child groups alongside block content.
const markup = (blocks: readonly Block[], ids = true): string => {
  const group = document.createElement("div");
  group.className = "bn-block-group";
  for (const block of blocks) {
    const outer = document.createElement("div");
    outer.className = "bn-block-outer";
    if (ids) outer.dataset.id = block.id;
    const inner = document.createElement("div");
    inner.className = "bn-block";
    const content = document.createElement("div");
    content.className = "bn-block-content";
    content.dataset.contentType = block.type;
    if ((block.type as string).startsWith("split")) {
      content.innerHTML = '<button class="resize-control">resize</button>';
    } else {
      const text = document.createElement(block.type === "heading" ? "h2" : "p");
      text.textContent = block.id;
      content.append(text);
    }
    inner.append(content);
    if (block.children.length) inner.insertAdjacentHTML("beforeend", markup(block.children, ids));
    outer.append(inner);
    group.append(outer);
  }
  return group.outerHTML;
};

const exportBlocks = async (blocks: Block[], ids = true, html = markup(blocks, ids)) => {
  const editor = { blocksToFullHTML: vi.fn(() => html) } as unknown as BlackDocEditor;
  const result = await buildStandaloneHtml(editor, blocks);
  expect(editor.blocksToFullHTML).toHaveBeenCalledExactlyOnceWith(blocks);
  return new DOMParser().parseFromString(result.html, "text/html");
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("standalone split layout", () => {
  it("supports the real BlockNote full-HTML serializer and split schema", async () => {
    const editor = BlockNoteEditor.create({
      schema: blackDocSchema,
      initialContent: [split({ leftWidth: 40, rightHeight: 300 })],
    });
    try {
      const { html } = await buildStandaloneHtml(editor, editor.document);
      const result = new DOMParser().parseFromString(html, "text/html");
      expect(result.querySelector(".split-pane-left")?.textContent).toContain("left-heading");
      expect(result.querySelector(".split-pane-right-scroll")?.textContent).toContain("right-body");
      expect(result.querySelectorAll(".split-pane")).toHaveLength(1);
      expect(result.querySelectorAll(".split-pane-right-scroll")).toHaveLength(1);
      expect(result.querySelector(".split-pane-controls, .split-width-handle, .split-height-handle")).toBeNull();
      expect(result.getElementById("block=right-heading")).not.toBeNull();
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it.each([true, false])("moves native blocks into two columns with preserved anchors (IDs: %s)", async ids => {
    const result = await exportBlocks([split()], ids);
    const pane = result.querySelector<HTMLElement>(".split-pane")!;
    expect(pane.children).toHaveLength(2);
    expect(pane.children[0].id).toBe("block=left");
    expect(pane.children[1].id).toBe("block=right");
    expect(pane.querySelector(".split-pane-left h2")?.textContent).toBe("1 left-heading");
    expect(pane.querySelector(".split-pane-right-scroll h2")?.textContent).toBe("2 right-heading");
    expect(pane.querySelector(".split-pane-right-scroll p")?.textContent).toBe("right-body");
    expect(result.querySelector(".resize-control")).toBeNull();
    expect(Array.from(result.querySelectorAll("nav a"), link => link.textContent))
      .toEqual(["1 left-heading", "2 right-heading"]);
    expect(result.getElementById("block=right-heading")?.closest(".split-pane")).toBe(pane);
    expect(pane.style.getPropertyValue("--split-left-width")).toBe("50fr");
    expect(pane.style.getPropertyValue("--split-right-height")).toBe("400px");
  });

  it.each([
    [{ leftWidth: 50, rightHeight: 0 }, "50fr", "50fr", "auto"],
    [{ leftWidth: 5, rightHeight: 20 }, "25fr", "75fr", "160px"],
    [{ leftWidth: 90, rightHeight: 2000 }, "75fr", "25fr", "1200px"],
    [{ leftWidth: 37.5, rightHeight: 650 }, "37.5fr", "62.5fr", "650px"],
    [{ leftWidth: NaN, rightHeight: Infinity }, "50fr", "50fr", "400px"],
    [{ leftWidth: "20; color:red", rightHeight: null }, "50fr", "50fr", "400px"],
  ])("bounds dimensions safely: %j", async (props, left, right, height) => {
    const result = await exportBlocks([split(props)]);
    const style = result.querySelector<HTMLElement>(".split-pane")!.style;
    expect(style.getPropertyValue("--split-left-width")).toBe(left);
    expect(style.getPropertyValue("--split-right-width")).toBe(right);
    expect(style.getPropertyValue("--split-right-height")).toBe(height);
  });

  it("keeps columns on narrow screens, allows scroll chaining and removes print clipping", async () => {
    const result = await exportBlocks([split()]);
    const css = result.querySelector("style")!.textContent!;
    expect(css).toContain("grid-template-columns: minmax(0, var(--split-left-width");
    expect(css).toContain("align-items: stretch");
    expect(css).toContain(".split-pane > .bn-block-outer:nth-child(2) { border-left: 1px solid #e3e6ea;");
    expect(css).toContain("overflow-y: auto; overscroll-behavior-y: auto");
    expect(css).toContain(".split-pane-right-scroll:hover { scrollbar-color: #aab3bc transparent; }");
    expect(css).toContain(".document-outline nav { display: flex; flex-direction: column; gap: 2px;");
    expect(css).toContain(".document-outline a[aria-current=\"location\"] { color: #16734b; border-left-color: #16734b;");
    expect(css).toContain("@media print { .split-pane-right-scroll { height: auto; max-height: none; overflow: visible;");
    expect(css.match(/grid-template-columns:/g)).toHaveLength(2);
  });

  it("rejects missing column wrappers instead of silently dropping content", async () => {
    const block = split();
    await expect(exportBlocks([block], true, markup([native("unrelated")])))
      .rejects.toThrow("分栏结构无效");
    const invalid = split();
    invalid.children.reverse();
    await expect(exportBlocks([invalid])).rejects.toThrow("分栏结构无效");
  });

  it("exports empty columns", async () => {
    const block = split();
    block.children.forEach(column => { column.children = []; });
    const result = await exportBlocks([block]);
    expect(result.querySelector(".split-pane-right-scroll")?.children).toHaveLength(0);
    expect(result.querySelector("script")?.textContent).toContain("hashchange");
  });

  it("reveals the split and inner hash target and tracks right-column scroll", async () => {
    const result = await exportBlocks([split()]);
    const scrollIntoView = vi.fn();
    const pane = result.querySelector<HTMLElement>(".split-pane")!;
    const scroll = result.querySelector<HTMLElement>(".split-pane-right-scroll")!;
    const heading = result.getElementById("block=right-heading")!;
    pane.scrollIntoView = scrollIntoView;
    vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue({ top: 50, bottom: 450 } as DOMRect);
    vi.spyOn(heading, "getBoundingClientRect").mockImplementation(() =>
      ({ top: 350 - scroll.scrollTop, bottom: 380 - scroll.scrollTop }) as DOMRect);
    vi.spyOn(heading, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    const windowEvents = new Map<string, EventListener>();
    const fakeWindow = { addEventListener: vi.fn((name: string, handler: EventListener) => windowEvents.set(name, handler)) };
    let pending: FrameRequestCallback | undefined;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => { pending = callback; return 1; });
    const location = { hash: "#block=right-heading" };
    const history = { pushState: vi.fn() };
    const script = result.querySelector("script")!.textContent!;
    new Function("document", "window", "location", "history", "requestAnimationFrame", "innerHeight", "scrollY", script)(
      result, fakeWindow, location, history, requestFrame, 800, 0,
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(scroll.scrollTop).toBe(300);
    const link = result.querySelector('a[href="#block=right-heading"]')!;
    expect(link.getAttribute("aria-current")).toBe("location");
    const calls = requestFrame.mock.calls.length;
    scroll.dispatchEvent(new Event("scroll"));
    expect(requestFrame.mock.calls.length).toBeGreaterThan(calls);
    scroll.scrollTop = 400;
    pending?.(0);
    expect(link.hasAttribute("aria-current")).toBe(false);
    scroll.scrollTop = 0;
    windowEvents.get("hashchange")?.(new Event("hashchange"));
    expect(scroll.scrollTop).toBe(300);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });
});
