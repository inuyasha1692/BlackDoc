/// <reference types="node" />
import { BlockNoteEditor } from "@blocknote/core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importMarkdownBlocks } from "./markdownImport";
import { isBlackDocument } from "./document";
import { blackDocSchema } from "./schema";
import { buildStandaloneHtml } from "../export/standaloneHtml";

const image = "data:image/png;base64,iVBORw0KGgo=";

describe("Markdown import", () => {
  it("converts image and description rows to auto-height split panes and rewrites custom anchors", () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const result = importMarkdownBlocks(editor, [
        "# 地图功能",
        "",
        "| 图片 | 说明 |",
        "| --- | --- |",
        `| <img src="${image}" alt="区域地图" style="max-width:480px" /> | <span id="区域地图"></span>区域说明<br>第二行 |`,
        "",
        "[跳转](#区域地图)",
      ].join("\n"));

      const pane = result.blocks.find(block => block.type === "splitPane");
      expect(pane?.props.rightHeight).toBe(0);
      expect(pane?.children[0].children.some(block =>
        block.type === "image" && block.props.url === image &&
        block.props.previewWidth === 480)).toBe(true);
      expect(JSON.stringify(pane?.children[1])).toContain("区域说明");
      expect(JSON.stringify(result.blocks)).toContain("#block=");
      expect(JSON.stringify(result.blocks)).not.toContain("BLACKDOCIMPORT");
      expect(result.warnings).toEqual([]);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("converts a local video link into a video block", () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const result = importMarkdownBlocks(
        editor,
        "[参考视频](data:video/mp4;base64,YWJj)",
      );
      expect(result.blocks.some(block =>
        block.type === "video" && block.props.url.startsWith("data:video/mp4;base64,"))).toBe(true);
      expect(result.warnings).toEqual([]);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("creates one pane per image row, maps HTML colors, and keeps ordinary tables", () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const result = importMarkdownBlocks(editor, [
        "| 图片 | 说明 |", "| --- | --- |",
        `| ![一](${image}) | <span style="color:#FF0000;background:#fff4cc;">红字</span> |`,
        `| ![二](${image}) | <span style="color:#0000FF;background:#CCFFCC;">蓝字</span> |`,
        "", "| 日期 | 更新内容 |", "| --- | --- |", "| 今天 | 修改 |",
      ].join("\n"));
      const panes = result.blocks.filter(block => block.type === "splitPane");
      expect(panes).toHaveLength(2);
      expect(panes.every(block => block.props.rightHeight === 0)).toBe(true);
      expect(result.blocks.filter(block => block.type === "table")).toHaveLength(1);
      expect(JSON.stringify(panes[0])).toContain('"textColor":"red"');
      expect(JSON.stringify(panes[0])).toContain('"backgroundColor":"yellow"');
      expect(JSON.stringify(panes[1])).toContain('"textColor":"blue"');
      expect(JSON.stringify(panes[1])).toContain('"backgroundColor":"green"');
      expect(result.warnings).toEqual([]);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it.each([3, 4])("keeps pictures inside consecutive %i-column display rows", columns => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const headers = ["名称", "图片", "说明", "备注"].slice(0, columns);
      const row = (name: string) => [
        name, `![${name}](${image})`, "图文说明", "待确认",
      ].slice(0, columns);
      const result = importMarkdownBlocks(editor, [
        `| ${headers.join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        `| ${row("第一行").join(" | ")} |`,
        `| ${row("第二行").join(" | ")} |`,
      ].join("\n"));
      const rows = result.blocks.filter(block => block.type === "columnList");
      expect(rows).toHaveLength(3);
      expect(rows.every(block => block.children.length === columns)).toBe(true);
      expect(rows[1].children[1].children.some(block => block.type === "image")).toBe(true);
      expect(rows[2].children[1].children.some(block => block.type === "image")).toBe(true);
      expect(result.blocks.some(block => block.type === "image")).toBe(false);
      expect(isBlackDocument(result.blocks)).toBe(true);
      expect(result.warnings).toEqual([]);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it.each([3, 4])("exports pictures inside their converted %i-column rows", async columns => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const header = ["名称", "图示", "说明", "备注"].slice(0, columns);
      const row = (name: string, description: string) =>
        [name, `![${name}](${image})`, description, "其他"].slice(0, columns);
      const result = importMarkdownBlocks(editor, [
        `| ${header.join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
        `| ${row("第一行", "描述一").join(" | ")} |`,
        `| ${row("第二行", "描述二").join(" | ")} |`,
      ].join("\n"));
      const { html } = await buildStandaloneHtml(editor, result.blocks);
      const exported = new DOMParser().parseFromString(html, "text/html");
      const rows = exported.querySelectorAll(".bn-block-column-list");
      expect(rows).toHaveLength(3);
      expect(rows[1].querySelectorAll(".bn-block-column")[1].querySelector("img")?.getAttribute("src")).toBe(image);
      expect(rows[2].querySelectorAll(".bn-block-column")[1].querySelector("img")?.getAttribute("src")).toBe(image);
      expect(rows[1].querySelectorAll(".bn-block-column")[2].textContent).toContain("描述一");
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("keeps pictures in ordinary data table cells through save and HTML export", async () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const result = importMarkdownBlocks(editor, [
        "| 名称 | 类型 | 图标 | 状态 | 备注 |",
        "| --- | --- | --- | --- | --- |",
        `| 路点 | 交互物 | 前![图一](${image})后![图二](${image}) | 激活 | 已确认 |`,
      ].join("\n"));
      const table = result.blocks.find(block => block.type === "table");
      expect(table).toBeDefined();
      const cell = table?.type === "table" && table.content.type === "tableContent"
        ? table.content.rows[1].cells[2] : null;
      expect(cell && "content" in cell ? cell.content.map(part => part.type) : null)
        .toEqual(["text", "tableImage", "text", "tableImage"]);
      expect(result.blocks.some(block => block.type === "image")).toBe(false);
      expect(result.warnings).toEqual([]);
      const restored = JSON.parse(JSON.stringify(result.blocks));
      expect(isBlackDocument(restored)).toBe(true);
      editor.replaceBlocks(editor.document, restored);
      const { html } = await buildStandaloneHtml(editor, editor.document);
      const exported = new DOMParser().parseFromString(html, "text/html");
      const imageCell = exported.querySelectorAll("table tbody tr")[1]?.querySelectorAll("td,th")[2];
      expect(imageCell?.querySelectorAll("img")).toHaveLength(2);
      expect(imageCell?.textContent).toContain("前");
      expect(imageCell?.textContent).toContain("后");
    } finally {
      editor._tiptapEditor.destroy();
    }
  });
});

const samplePath = process.env.BLACKDOC_IMPORT_SAMPLE;
if (samplePath) {
  describe("provided Markdown sample", () => {
    it("retains its title, tables, images and revision links", () => {
      const editor = BlockNoteEditor.create({ schema: blackDocSchema });
      try {
        const result = importMarkdownBlocks(editor, readFileSync(samplePath, "utf8"));
        expect(result.blocks[0].type).toBe("heading");
        const serialized = JSON.stringify(result.blocks);
        expect(result.blocks.some(block => block.type === "table")).toBe(true);
        expect(result.blocks.filter(block => block.type === "splitPane").length).toBeGreaterThan(10);
        expect((serialized.match(/"type":"image"/g) ?? []).length +
          (serialized.match(/"type":"tableImage"/g) ?? []).length).toBe(118);
        expect((serialized.match(/BLACKDOCIMPORT[A-Z]*\d+END/g) ?? []).slice(0, 5)).toEqual([]);
        expect(isBlackDocument(result.blocks)).toBe(true);
        expect(JSON.stringify(result.blocks)).toContain("#block=");
        expect(result.warnings).toEqual([]);
      } finally {
        editor._tiptapEditor.destroy();
      }
    });
  });
}
