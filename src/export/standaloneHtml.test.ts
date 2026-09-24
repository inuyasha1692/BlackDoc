import type { BlackDocBlock as Block, BlackDocEditor as BlockNoteEditor } from "../editor/schema";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildStandaloneHtml } from "./standaloneHtml";

const block = (
  id: string,
  text: string,
  level?: number,
  children: Block[] = [],
): Block =>
  ({
    id,
    type: level === undefined ? "paragraph" : "heading",
    props: level === undefined ? {} : { level },
    content: [{ type: "text", text, styles: {} }],
    children,
  }) as Block;

// Match BlockNote's full-HTML wrappers, including nested block groups.
const fullHtml = (blocks: readonly Block[], withDataIds = true): string => {
  const group = document.createElement("div");
  group.className = "bn-block-group";
  for (const item of blocks) {
    const outer = document.createElement("div");
    outer.className = "bn-block-outer";
    if (withDataIds) outer.dataset.id = item.id;
    const inner = document.createElement("div");
    inner.className = "bn-block";
    const content = document.createElement("div");
    content.className = "bn-block-content";
    content.dataset.contentType = item.type;
    const text = document.createElement(
      item.type === "heading" ? `h${item.props.level}` : "p",
    );
    text.className = "bn-inline-content";
    text.textContent = Array.isArray(item.content)
      ? item.content.map((part) => ("text" in part ? part.text : "")).join("")
      : "";
    content.append(text);
    inner.append(content);
    if (item.children.length) {
      inner.insertAdjacentHTML("beforeend", fullHtml(item.children, withDataIds));
    }
    outer.append(inner);
    group.append(outer);
  }
  return group.outerHTML;
};

const exportDocument = async (
  blocks: Block[],
  markup = fullHtml(blocks),
) => {
  const blocksToFullHTML = vi.fn().mockReturnValue(markup);
  const editor = { blocksToFullHTML } as unknown as BlockNoteEditor;
  const result = await buildStandaloneHtml(editor, blocks);
  expect(blocksToFullHTML).toHaveBeenCalledExactlyOnceWith(blocks);
  return {
    ...result,
    document: new DOMParser().parseFromString(result.html, "text/html"),
  };
};

const outlineLinks = (document: Document): HTMLAnchorElement[] => {
  const aside = document.querySelector('aside[aria-label="文档大纲"]');
  expect(aside).not.toBeNull();
  const nav = aside?.querySelector('nav[aria-label="标题导航"]');
  expect(nav).not.toBeNull();
  return Array.from(nav!.querySelectorAll<HTMLAnchorElement>("a"));
};

const expectTarget = (document: Document, link: HTMLAnchorElement, id: string) => {
  expect(link.getAttribute("href")).toBe(`#block=${encodeURIComponent(id)}`);
  const anchor = document.getElementById(
    decodeURIComponent(link.getAttribute("href")!.slice(1)),
  );
  expect(anchor).not.toBeNull();
  expect(anchor?.classList.contains("bn-block-outer")).toBe(true);
  expect(document.querySelector("article")?.contains(anchor)).toBe(true);
  return anchor!;
};

describe("buildStandaloneHtml outline", () => {
  it("preserves BlockNote formatting in the standalone document", async () => {
    const { BlockNoteEditor } = await import("@blocknote/core");
    const { blackDocSchema } = await import("../editor/schema");
    const source = JSON.parse(readFileSync("files/BlackDoc功能展示示例.bdoc", "utf8")) as Block[];
    const ids = ["demo-rich-text", "demo-link-entry", "demo-divider-top", "demo-bullet-list", "demo-numbered-list-one", "demo-numbered-list-two", "demo-check-list-done", "demo-toggle-heading", "demo-table", "demo-anchor-target", "demo-embedded-image", "demo-video", "demo-audio"];
    const blocks = source.filter(item => ids.includes(item.id));
    const editor = BlockNoteEditor.create({ schema: blackDocSchema, initialContent: blocks });
    try {
      const { document, html } = await exportDocument(editor.document, editor.blocksToFullHTML(editor.document));
      const css = document.querySelector("style")?.textContent ?? "";
      expect(document.querySelector('[data-style-type="textColor"][data-value="red"]')).not.toBeNull();
      expect(css).toContain('[data-style-type="textColor"][data-value="red"]');
      expect(css).toContain('[data-background-color="yellow"]');
      expect(css).toContain('[data-content-type="checkListItem"][data-checked="true"]');
      expect(css).toContain('[data-content-type="numberedListItem"]::before');
      expect(css).toContain('[data-content-type="bulletListItem"]::before');
      expect(css).toContain('.bn-block-content[data-content-type="divider"] hr { flex: 1;');
      expect(document.querySelector('#block\\=demo-divider-top hr')).not.toBeNull();
      expect(css).toContain('content: "•"; font-size: 1.5em; height: 1.1333em;');
      expect(css).toContain('[data-content-type="checkListItem"] > div { display: flex; align-items: center;');
      expect(css).toContain('.bn-toggle-wrapper');
      expect(html).toContain('data-show-children="true"');
      expect(html).toContain('setToggle(wrapper, !expanded)');
      expect(css).toContain('.bn-block-content[data-content-type="table"] table');
      expect(css).toContain('[data-background-color="green"]');
      expect(document.querySelector('#block\\=demo-table col[style="width: 260px;"]')).not.toBeNull();
      const table = document.querySelector<HTMLTableElement>('#block\\=demo-table table')!;
      const columnWidth = Array.from(table.querySelectorAll("col"))
        .reduce((sum, column) => sum + Number.parseFloat(column.style.width), 0);
      expect(table.style.width).toBe(`${columnWidth}px`);
      expect(css).toContain('.bn-block-content[data-file-block][data-text-alignment="right"]');
      expect(html).toContain('target.classList.add("block-link-highlight")');

      // jsdom is supplied by the Vitest environment without its declaration package.
      // @ts-expect-error jsdom has no bundled type declarations.
      const { JSDOM } = await import("jsdom");
      const page = new JSDOM(html, {
        runScripts: "dangerously",
        url: "http://localhost/",
        beforeParse(window: Window & typeof globalThis) {
          window.HTMLElement.prototype.scrollIntoView = () => {};
          window.requestAnimationFrame = () => 1;
        },
      });
      const toggle = page.window.document.querySelector("#block\\=demo-toggle-heading .bn-toggle-button") as HTMLButtonElement;
      toggle.click();
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      toggle.click();
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      const link = page.window.document.querySelector("#block\\=demo-link-entry a") as HTMLAnchorElement;
      link.click();
      const target = page.window.document.getElementById("block=demo-anchor-target")!;
      expect(target.classList.contains("block-link-highlight")).toBe(true);
      expect(page.window.location.hash).toBe("#block=demo-anchor-target");
      page.window.close();
    } finally { editor._tiptapEditor.destroy(); }
  });
  it("uses the editor's desktop width and content padding in the exported layout", async () => {
    const { document } = await exportDocument([block("title", "文档标题", 1)]);
    const css = document.querySelector("style")?.textContent ?? "";
    const withoutOutline = await exportDocument([block("body", "普通正文")]);
    const editorCss = readFileSync("src/styles.css", "utf8");
    const workspace = editorCss.match(/\.workspace\s*\{([^}]*)\}/)?.[1] ?? "";
    const editorRegion = editorCss.match(/\.editor-region\s*\{([^}]*)\}/)?.[1] ?? "";
    const width = workspace.match(/\bwidth:\s*([^;]+);/)?.[1];
    const columns = workspace.match(/\bgrid-template-columns:\s*([^;]+);/)?.[1];
    const padding = editorRegion.match(/\bpadding:\s*(\d+px \d+px) \d+px;/)?.[1];

    expect(width).toBeTruthy();
    expect(columns).toBeTruthy();
    expect(padding).toBeTruthy();
    expect(css).toContain(`.document-layout { width: ${width};`);
    expect(css).toContain(`grid-template-columns: ${columns};`);
    expect(css).toContain(`.document-layout main { width: 100%; min-width: 0; padding: ${padding} `);
    expect(css).toContain(".bn-editor { padding-inline: 54px; }");
    expect(css).toContain("@media (max-width: 980px)");
    expect(document.querySelector(".document-layout > main > .bn-editor")).not.toBeNull();
    expect(withoutOutline.document.querySelector(".document-layout > main > .bn-editor")).not.toBeNull();
  });

  it("adds hierarchical heading numbers to exported headings and outline links", async () => {
    const blocks = [
      block("document-title", "文档标题", 1),
      block("chapter-one", "第一章", 2, [block("chapter-one-section", "第一节", 3)]),
      block("chapter-two", "第二章", 2),
    ];
    const { document } = await exportDocument(blocks);

    expect(document.querySelector("#block\\=document-title h1")?.textContent).toBe("文档标题");
    expect(document.querySelector("#block\\=chapter-one h2 .heading-auto-number")?.textContent).toBe("1 ");
    expect(document.querySelector("#block\\=chapter-one-section h3 .heading-auto-number")?.textContent).toBe("1.1 ");
    expect(document.querySelector("#block\\=chapter-two h2 .heading-auto-number")?.textContent).toBe("2 ");
    expect(outlineLinks(document).map(link => link.textContent)).toEqual([
      "文档标题", "1 第一章", "1.1 第一节", "2 第二章",
    ]);
  });

  it("exports labeled navigation linking each heading to its body anchor", async () => {
    const blocks = [
      block("intro", "导语"),
      block("title", "文档标题", 1),
      block("body", "正文"),
      block("section", "章节", 2),
    ];
    const { document } = await exportDocument(blocks);
    const links = outlineLinks(document);

    expect(document.querySelectorAll('aside[aria-label="文档大纲"]')).toHaveLength(1);
    expect(links.map((link) => link.textContent)).toEqual(["文档标题", "1 章节"]);
    expectTarget(document, links[0], "title");
    expectTarget(document, links[1], "section");
    expect(document.title).toBe("文档标题");
  });

  it("recursively includes headings in document order when wrappers have no data IDs", async () => {
    const blocks = [
      block("root", "总览", 1, [
        block("nested", "章节", 2, [
          block("container", "说明", undefined, [
            block("deep", "细节", 4),
          ]),
        ]),
      ]),
      block("last", "结语", 2),
    ];
    const { document } = await exportDocument(blocks, fullHtml(blocks, false));
    const links = outlineLinks(document);

    expect(links.map((link) => link.textContent)).toEqual([
      "总览", "1 章节", "1.0.1 细节", "2 结语",
    ]);
    const headings = [["root", 1], ["nested", 2], ["deep", 4], ["last", 2]] as const;
    headings.forEach(([id, level], index) => {
      const target = expectTarget(document, links[index], id);
      expect(target.querySelector(".bn-block-content")?.firstElementChild?.tagName)
        .toBe(`H${level}`);
    });
  });

  it("encodes special block IDs and escapes heading text in the outline", async () => {
    const id = '章节 /?#%&"<>一';
    const text = '<img src=x onerror="alert(1)"> & "引号" \'单引号\'';
    const { document } = await exportDocument([block(id, text, 1)]);
    const links = outlineLinks(document);

    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe(text);
    expect(links[0].innerHTML).toContain("&lt;img");
    expect(links[0].innerHTML).toContain("&amp;");
    expect(links[0].querySelector("img, script")).toBeNull();
    expect(document.querySelectorAll("[onerror]")).toHaveLength(0);
    expectTarget(document, links[0], id);
    expect(document.title).toBe(text);
  });

  it.each([
    { name: "paragraph-only", blocks: [block("body", "普通正文")] },
    { name: "empty", blocks: [] },
  ])("omits the outline for a $name document", async ({ blocks }) => {
    const { document } = await exportDocument(blocks);

    expect(document.querySelector("aside")).toBeNull();
    expect(document.querySelector('nav[aria-label="标题导航"]')).toBeNull();
    expect(document.querySelector("article")).not.toBeNull();
  });

  it("preserves existing internal links and paragraph anchors alongside the outline", async () => {
    const id = "target /段落";
    const blocks = [
      block("title", "标题", 1),
      block("source", "跳转"),
      block(id, "目标正文"),
    ];
    const container = globalThis.document.createElement("div");
    container.innerHTML = fullHtml(blocks);
    const link = globalThis.document.createElement("a");
    link.href = `#block=${encodeURIComponent(id)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "跳转";
    container.querySelectorAll(".bn-inline-content")[1].replaceChildren(link);
    const { document } = await exportDocument(blocks, container.innerHTML);
    const existingLink = document.querySelector<HTMLAnchorElement>("article a")!;

    expect(existingLink).not.toBeNull();
    expectTarget(document, existingLink, id);
    expect(existingLink.hasAttribute("target")).toBe(false);
    expect(existingLink.hasAttribute("rel")).toBe(false);
    const links = outlineLinks(document);
    expect(links).toHaveLength(1);
    expectTarget(document, links[0], "title");
    const ids = Array.from(document.querySelectorAll("[id]"), (node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("renders official multi-column blocks in standalone HTML", async () => {
    const blocks = [{
      id: "columns",
      type: "columnList",
      props: {},
      children: [1, 1.5].map((width, index) => ({
        id: "column-" + index,
        type: "column",
        props: { width },
        children: [block("column-heading-" + index, "第" + (index + 1) + "列", 2)],
      })),
    }] as unknown as Block[];
    const editor = (await import("@blocknote/core")).BlockNoteEditor.create({
      schema: (await import("../editor/schema")).blackDocSchema,
      initialContent: blocks,
    });
    try {
      const { html } = await buildStandaloneHtml(editor, editor.document);
      const document = new DOMParser().parseFromString(html, "text/html");
      expect(document.querySelectorAll(".bn-block-column-list > .bn-block-column")).toHaveLength(2);
      expect(document.querySelector(".bn-block-column-list")?.textContent).toContain("第1列");
      expect(document.querySelector(".bn-block-column[data-width='1.5']")).not.toBeNull();
      expect(html).toContain(".bn-block-column-list { display: flex");
      expect(html).toContain(".bn-block-column-list { flex-direction: column; }");
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("keeps styles and scripts inline in the standalone HTML", async () => {
    const { html, document, externalImages } = await exportDocument([
      block("title", "标题", 1),
    ]);

    expect(html).toMatch(/^<!doctype html>/i);
    expect(document.querySelector("style")?.textContent?.trim()).toBeTruthy();
    expect(document.querySelector("style")?.textContent).toContain(
      ".bn-inline-content code { padding: .08em .32em;",
    );
    expect(document.querySelectorAll("script[src], link[rel='stylesheet']"))
      .toHaveLength(0);
    const scripts = Array.from(document.querySelectorAll("script"));
    expect(scripts.length).toBeGreaterThan(0);
    scripts.forEach((script) => {
      expect(script.textContent?.trim()).toBeTruthy();
      expect(script.hasAttribute("src")).toBe(false);
    });
    expect(externalImages).toEqual([]);
  });
});
