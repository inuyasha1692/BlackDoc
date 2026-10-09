import { describe, expect, it, vi } from "vitest";
import { buildMarkdown } from "./markdown";
import type { BlackDocBlock } from "../editor/schema";
import { BlockNoteEditor } from "@blocknote/core";
import { blackDocSchema } from "../editor/schema";
import { importMarkdownBlocks } from "../editor/markdownImport";
import { webcrypto } from "node:crypto";
import { marked } from "marked";
vi.mock("../canvas/export", () => ({ canvasSvg: vi.fn() }));
const text = (value: string) => [{ type: "text", text: value, styles: {} }];
const exportNodes = (nodes: unknown[]) => buildMarkdown(nodes as BlackDocBlock[]);
describe("Markdown export", () => {
  it("preserves list starts across tables and counts contiguous lists independently at each depth", async () => {
    const table = { type: "table", content: { rows: [{ cells: [{ content: text("说明") }] }] } };
    const result = await exportNodes([
      { type: "numberedListItem", content: text("区分不同种类NPC") }, table,
      { type: "numberedListItem", props: { start: 2 }, content: text("新增任务，采集物，宝箱，兄贵宝宝") }, table,
      { type: "numberedListItem", props: { start: 3 }, content: text("任务状态提示调整") },
      { type: "heading", props: { level: 2 }, content: text("其他章节") },
      { type: "numberedListItem", content: text("第一项"), children: [
        { type: "numberedListItem", content: text("子项一") },
        { type: "numberedListItem", content: text("子项二") },
      ] },
      { type: "numberedListItem", content: text("第二项") },
    ]);
    expect(result.markdown).toContain("2. 新增任务，采集物，宝箱，兄贵宝宝");
    expect(result.markdown).toContain("3. 任务状态提示调整");
    expect(result.markdown).toContain("1. 第一项");
    expect(result.markdown).toContain("   2. 子项二");
    expect(result.markdown).toContain("2. 第二项");
    const rendered = new DOMParser().parseFromString(await marked.parse(result.markdown), "text/html");
    expect(rendered.querySelector('ol[start="2"]')?.textContent).toContain("新增任务");
    expect(rendered.querySelector('ol[start="3"]')?.textContent).toContain("任务状态提示调整");
  });
  it("keeps literal brackets and line breaks inside colored text and block backgrounds", async () => {
    const content = [
      { type: "text", text: "2025.06.09新增", styles: { textColor: "red", backgroundColor: "yellow" } },
      { type: "text", text: " \n 与客户端沟通后，明确了大世界地图上\n 然后通过配置[场景id:交互物放置id]，关联到指定的交互物上\n 若交互物上本身已经配置了交互逻辑\n 比如：点击主城", styles: { backgroundColor: "yellow" } },
    ];
    const result = await exportNodes([{ type: "paragraph", content }, { type: "paragraph", props: { backgroundColor: "yellow" }, content: text("配置[场景id:交互物放置id]\n原文中的_id_和*文字*") }]);
    const rendered = new DOMParser().parseFromString(await marked.parse(result.markdown), "text/html");
    expect(rendered.querySelectorAll("br")).toHaveLength(5);
    expect(rendered.body.textContent).toContain("[场景id:交互物放置id]");
    expect(rendered.body.textContent).toContain("原文中的_id_和*文字*");
    expect(rendered.querySelectorAll("em")).toHaveLength(0);
    expect(result.markdown).not.toContain("\\[");
  });
  it("keeps the map description in one paragraph with bold labels and explicit line breaks", async () => {
    const result = await exportNodes([{ type: "paragraph", content: [
      { type: "text", text: "「世界地图级别」实现思路\n", styles: { bold: true } },
      ...text("按文案策划设计，原画画的大世界地图，切分成若干个区域\n区域地图内部再按需求拆分成若干个地区，也可能就只有一个地区\n当这个区域地图内一个地区解锁后，隐藏掉该地区的在大世界地图上的【遮罩物】和区域地图上的【遮罩物】\n那么这个地块在大世界地图和区域地图上都会显示出来\n"),
      { type: "text", text: "「世界地图级别」功能所需素材\n", styles: { bold: true } },
      ...text("大世界地图原画素材、地区在大世界地图上的遮罩素材、区域地图的高亮素材"),
    ] }]);
    const rendered = new DOMParser().parseFromString(await marked.parse(result.markdown), "text/html");
    expect(rendered.querySelectorAll("p")).toHaveLength(1);
    expect(Array.from(rendered.querySelectorAll("strong"), element => element.textContent)).toEqual(["「世界地图级别」实现思路", "「世界地图级别」功能所需素材"]);
    expect(rendered.querySelectorAll("br")).toHaveLength(6);
    expect(rendered.body.textContent).not.toContain("**");
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const imported = importMarkdownBlocks(editor, result.markdown);
      expect(imported.blocks).toHaveLength(1);
      expect(JSON.stringify(imported.blocks)).toContain("实现思路");
    } finally { editor._tiptapEditor.destroy(); }
  });
  it("preserves source formulas, diagrams, custom anchors and excludes heading numbering", async () => {
    const result = await exportNodes([
      { id: "title", type: "heading", props: { level: 2 }, content: text("标题"), children: [] },
      { type: "paragraph", content: [{ type: "link", href: "#block=title", content: text("跳转") }, { type: "math", content: "x^2" }] },
      { type: "mathBlock", content: "\\frac{1}{2}" },
      { type: "diagram", content: "graph LR\nA-->B" },
    ]);
    expect(result.markdown).toContain('<span id="bdoc-title"></span>');
    expect(result.markdown).toContain("## 标题");
    expect(result.markdown).toContain("[跳转](#bdoc-title)$x^2$");
    expect(result.markdown).toContain("$$\n\\frac{1}{2}\n$$");
    expect(result.markdown).toContain("```mermaid\ngraph LR\nA-->B\n```");
  });
  it("restores simple image description tables and expands complex panes without dropping hidden content", async () => {
    const result = await exportNodes([
      { type: "splitPane", children: [
        { type: "splitColumn", children: [{ type: "image", props: { url: "https://example.com/a.png", name: "图片" } }] },
        { type: "splitColumn", children: [{ type: "paragraph", content: text("说明\n第二行") }] },
      ] },
      { type: "columnList", children: [
        { type: "column", children: [{ type: "heading", props: { level: 3 }, content: text("左侧") }] },
        { type: "column", children: [{ type: "paragraph", content: text("右侧全部内容") }] },
      ] },
    ]);
    expect(result.markdown).toContain("| 图片 | 说明 |");
    expect(result.markdown).toContain("说明<br>第二行");
    expect(result.markdown.indexOf("左侧")).toBeLessThan(result.markdown.indexOf("右侧全部内容"));
  });
  it("uses a Markdown table for split pane icon descriptions like the reference document", async () => {
    const result = await exportNodes([{ type: "splitPane", children: [
      { type: "splitColumn", children: [{ type: "image", props: { url: "https://example.com/map.png", previewWidth: 240 } }] },
      { type: "splitColumn", children: [
        { type: "paragraph", content: [{ type: "text", text: "任务相关", styles: { bold: true } }] },
        { type: "image", props: { url: "https://example.com/icon.png", previewWidth: 32 } },
        { type: "paragraph", content: text("可推进的任务|问号\n其他说明") },
      ] },
    ] }]);
    expect(result.markdown).toContain("| 图片 | 说明 |");
    expect(result.markdown).not.toContain("<table>");
    expect(result.markdown).toContain('height:auto;" />可推进的任务');
    const rendered = new DOMParser().parseFromString(await marked.parse(result.markdown), "text/html");
    expect(rendered.querySelectorAll("tbody td")).toHaveLength(2);
    expect(rendered.querySelectorAll("tbody td")[1].textContent).toContain("可推进的任务|问号");
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const imported = importMarkdownBlocks(editor, result.markdown);
      expect(imported.blocks).toHaveLength(1);
      expect(imported.blocks[0].type).toBe("table");
      expect(JSON.stringify(imported.blocks).match(/"type":"tableImage"/g)).toHaveLength(2);
    } finally { editor._tiptapEditor.destroy(); }
  });
  it("exports mixed text, images and nested tables inside a split pane table", async () => {
    const result = await exportNodes([{ type: "splitPane", children: [
      { type: "splitColumn", children: [{ type: "image", props: { url: "https://example.com/map.png", name: "地图" } }] },
      { type: "splitColumn", children: [
        { type: "paragraph", content: [{ type: "text", text: "探索相关", styles: { bold: true } }] },
        { type: "image", props: { url: "https://example.com/icon.png", name: "路点", previewWidth: 32 } },
        { type: "paragraph", content: [{ type: "text", text: "探测后才显示", styles: { textColor: "red" } }] },
        { type: "table", content: { rows: [{ cells: [{ content: text("嵌套说明") }] }] } },
        { type: "paragraph", content: text("表格后的说明") },
        { type: "image", props: { url: "https://example.com/last.png", name: "末尾图片", previewWidth: 24 } },
        { type: "codeBlock", props: { language: "text" }, content: text("第一行\n\n第三行") },
      ] },
    ] }]);
    const rendered = new DOMParser().parseFromString(await marked.parse(result.markdown), "text/html");
    const cells = rendered.querySelectorAll("body > table > tbody > tr > td");
    expect(cells).toHaveLength(2);
    expect(cells[0].querySelector("img")?.getAttribute("alt")).toBe("地图");
    expect(cells[1].querySelector("strong")?.textContent).toBe("探索相关");
    expect(cells[1].querySelector("img")?.getAttribute("alt")).toBe("路点");
    expect(cells[1].querySelector("table")?.textContent).toContain("嵌套说明");
    expect(cells[1].querySelector("span")?.getAttribute("style")).toContain("color:");
    expect(cells[1].textContent).toContain("表格后的说明");
    expect(cells[1].querySelector('img[alt="末尾图片"]')).not.toBeNull();
    expect(cells[1].querySelector("pre")?.textContent).toContain("第一行\n\n第三行");
    const tokens = marked.lexer(result.markdown).filter(token => token.type !== "space");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe("html");
    expect(result.markdown.trim()).not.toMatch(/\n[ \t]*\n/);
  });
  it("keeps cell colors and inline image order in HTML tables", async () => {
    const result = await exportNodes([{ type: "table", content: { rows: [{ cells: [{ type: "tableCell", props: { backgroundColor: "yellow" }, content: [...text("前"), { type: "tableImage", props: { url: "https://example.com/a.png", previewWidth: 120 } }, ...text("后")] }] }] } }]);
    expect(result.markdown).toContain('background:#fff4cc');
    expect(result.markdown).toContain('前<img src="https://example.com/a.png"');
    expect(result.markdown).toContain('height:auto;" />后');
  });
  it("round trips scientific content and links through the Markdown importer", async () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const result = await exportNodes([
        { id: "heading", type: "heading", props: { level: 2 }, content: text("目标") },
        { type: "paragraph", content: [{ type: "link", href: "#block=heading", content: text("跳转") }, { type: "math", props: {}, content: "x^2" }] },
        { type: "mathBlock", content: text("\\frac{1}{2}") },
        { type: "diagram", content: text("graph LR\nA-->B") },
        { type: "codeBlock", props: { language: "text" }, content: text("$untouched$\n$$") },
      ]);
      const imported = importMarkdownBlocks(editor, result.markdown);
      expect(imported.warnings).toEqual([]);
      expect(imported.blocks.some(block => block.type === "diagram")).toBe(true);
      expect(imported.blocks.some(block => block.type === "mathBlock")).toBe(true);
      expect(JSON.stringify(imported.blocks)).toContain('"type":"math"');
      expect(JSON.stringify(imported.blocks)).toContain("#block=");
      editor.replaceBlocks(editor.document, imported.blocks);
      expect((await buildMarkdown(editor.document)).markdown).toContain("$$\n\\frac{1}{2}\n$$");
    } finally { editor._tiptapEditor.destroy(); }
  });
  it("preserves colored paragraph text on reimport", async () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const result = await exportNodes([{ type: "paragraph", props: { backgroundColor: "yellow" }, content: [{ type: "text", text: "红色文字", styles: { textColor: "red" } }] }]);
      const imported = importMarkdownBlocks(editor, result.markdown);
      expect(JSON.stringify(imported.blocks)).toContain("红色文字");
      expect(JSON.stringify(imported.blocks)).toContain('"textColor":"red"');
      expect(JSON.stringify(imported.blocks)).toContain('"backgroundColor":"yellow"');
    } finally { editor._tiptapEditor.destroy(); }
  });
  it("extracts embedded image bytes and reuses the relative asset reference", async () => {
    vi.stubGlobal("crypto", webcrypto);
    try {
      const image = { type: "image", props: { url: "data:image/png;base64,YWJj", name: "image-20260723142332200" } };
      const result = await exportNodes([image, image]);
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].base64).toBe("YWJj");
      expect(result.markdown).toContain(`![image-20260723142332200](./assets/${result.assets[0].name})`);
      expect(result.assets[0].name).toMatch(/\.png$/);
    } finally { vi.unstubAllGlobals(); }
  });
});
