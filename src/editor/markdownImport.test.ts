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

  it("keeps state-image-description tables intact and embeds styled HTML images in their cells", () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const result = importMarkdownBlocks(editor, [
        "目前主要用于传送点类的交互物，会记录在服务器上，客户端读取这个状态后来改变地图上交互物两种状态的图标切换",
        "",
        "| 状态 | 图片 | 说明 |",
        "| --- | --- | --- |",
        `| <span style="background:#fff4cc;">**未激活状态**<br/></span> | <span style="background:#FFFFCC;"><img src="./assets/sheet-01-image-r387-c12.png" alt="sheet-01-image-r387-c12" style="max-width: 480px; height: auto; zoom: 33%;" /></span> | <span style="background:#fff4cc;">当一个地区解锁后，该地区上的所有传送点都会显示出来，但都处于未激活状态<br/>此时无法使用它的传送功能，需要激活后才能作为传送目标<br/></span> |`,
        `| <span style="background:#fff4cc;">**激活状态**<br/></span> | <span style="background:#FFFFCC;"><img src="./assets/sheet-01-image-r395-c12.png" alt="sheet-01-image-r395-c12" style="max-width: 480px; height: auto; zoom: 33%;" /><img src="./assets/sheet-01-image-r395-c14.png" alt="sheet-01-image-r395-c14" style="max-width: 480px; height: auto; zoom: 80%;" /></span> | <span style="background:#fff4cc;">处于这个状态下的传送点，点击才能出现传送的功能<br/></span> |`,
        `| <span style="background:#fff4cc;">**配置方式**<br/></span> | <span style="background:#FFFFCC;"><img src="./assets/sheet-01-image-r403-c05.png" alt="sheet-01-image-r403-c05" style="max-width: 480px; height: auto; zoom: 80%;" /></span> | <span style="background:#fff4cc;">场景项目中的Actor挂件中增添新的脚本。</span> |`,
      ].join("\n"));

      const table = result.blocks.find(block => block.type === "table");
      const rows = table?.type === "table" && table.content.type === "tableContent"
        ? table.content.rows : [];
      expect(rows).toHaveLength(4);
      expect(rows.slice(1).map(row => {
        const cell = row.cells[1];
        return "content" in cell ? cell.content.filter(part => part.type === "tableImage").length : 0;
      })).toEqual([1, 2, 1]);
      expect(result.blocks.some(block => block.type === "image")).toBe(false);
      expect(JSON.stringify(result.blocks)).not.toContain("【图片：");
      expect(result.warnings).toEqual([]);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("embeds images in a table nested under a list item", () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const result = importMarkdownBlocks(editor, [
        "  1. **交互物的激活状态**<br>说明",
        "",
        "      | 状态 | 图片 | 说明 |",
        "      | --- | --- | --- |",
        `      | 未激活状态 | <span style="background:#FFFFCC;"><img src="./assets/sheet-01-image-r387-c12.png" alt="sheet-01-image-r387-c12" /></span> | 说明文字 |`,
      ].join("\n"));
      const flatten = (blocks: typeof result.blocks): typeof result.blocks =>
        blocks.flatMap(block => [block, ...flatten(block.children)]);
      const table = flatten(result.blocks).find(block => block.type === "table");
      expect(table).toBeDefined();
      const imageCell = table?.type === "table" && table.content.type === "tableContent"
        ? table.content.rows[1].cells[1] : null;
      expect(imageCell && "content" in imageCell ? imageCell.content.map(part => part.type) : null)
        .toEqual(["tableImage"]);
      expect(flatten(result.blocks).some(block => block.type === "image")).toBe(false);
      expect(result.warnings).toEqual([]);
      editor.replaceBlocks(editor.document, result.blocks);
      const insertedTable = flatten(editor.document).find(block => block.type === "table");
      const insertedCell = insertedTable?.type === "table" && insertedTable.content.type === "tableContent"
        ? insertedTable.content.rows[1].cells[1] : null;
      expect(insertedCell && "content" in insertedCell
        ? insertedCell.content.map(part => part.type) : null).toEqual(["tableImage"]);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("splits images inside a nested text paragraph into blocks at their original positions", () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const result = importMarkdownBlocks(editor, [
        "  1. **交互物的可见性**<br>条件说明",
        `      <img src="${image}" alt="前图" />`,
        `      <span style="display:block;background:#fff4cc;">图片前的文字<br><img src="${image}" alt="后图" /><br>图片后的文字</span>`,
      ].join("\n"));
      const item = result.blocks.find(block => block.type === "numberedListItem");
      expect(item).toBeDefined();
      expect(item?.children.map(block => block.type)).toEqual([
        "image", "paragraph", "image", "paragraph",
      ]);
      expect(item?.children.filter(block => block.type === "image").map(block => block.props.name))
        .toEqual(["前图", "后图"]);
      expect(JSON.stringify(item)).not.toContain("【图片：");
      expect(result.blocks.slice(result.blocks.indexOf(item!) + 1).some(block => block.type === "image"))
        .toBe(false);
      expect(result.warnings).toEqual([]);
      editor.replaceBlocks(editor.document, result.blocks);
      const insertedItem = editor.document.find(block => block.type === "numberedListItem");
      expect(insertedItem?.children.map(block => block.type)).toEqual([
        "image", "paragraph", "image", "paragraph",
      ]);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("splits an inline Markdown image into a block between two text paragraphs", () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const result = importMarkdownBlocks(editor, `图片前<br>![示意图](${image})<br>图片后`);
      expect(result.blocks.map(block => block.type)).toEqual(["paragraph", "image", "paragraph"]);
      expect(JSON.stringify(result.blocks[0].content)).toContain("图片前");
      const imageBlock = result.blocks[1];
      expect(imageBlock.type === "image" ? imageBlock.props.name : null).toBe("示意图");
      expect(JSON.stringify(result.blocks[2].content)).toContain("图片后");
      expect(JSON.stringify(result.blocks)).not.toContain("【图片：");
      expect(result.warnings).toEqual([]);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("moves an image in list item text into a child block at the line break", () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const result = importMarkdownBlocks(editor, [
        `* **图层显示顺序**<br><img src="${image}" alt="图层" />`,
        "  在上层的会盖住下层",
        `* **主角标识**<img src="${image}" alt="标识" /><br>代表当前位置`,
      ].join("\n"));
      const items = result.blocks.filter(block => block.type === "bulletListItem");
      expect(items).toHaveLength(2);
      expect(items.map(item => item.children.map(child => child.type)))
        .toEqual([["image", "paragraph"], ["image", "paragraph"]]);
      expect(JSON.stringify(items[0].content)).toContain("图层显示顺序");
      expect(JSON.stringify(items[1].content)).toContain("主角标识");
      expect(JSON.stringify(items[0].children[1].content)).toContain("在上层的会盖住下层");
      expect(JSON.stringify(items[1].children[1].content)).toContain("代表当前位置");
      expect(JSON.stringify(result.blocks)).not.toContain("【图片：");
      expect(result.warnings).toEqual([]);
      editor.replaceBlocks(editor.document, result.blocks);
      expect(editor.document.filter(block => block.type === "bulletListItem")
        .map(block => block.children.map(child => child.type)))
        .toEqual([["image", "paragraph"], ["image", "paragraph"]]);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("preserves nested Markdown bullets under their parent list items", () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const markdown = [
        "* **信息层**",
        "  目前信息层下只有任务提示信息",
        "",
        "  * **任务提示箭头**<br>被追踪的任务",
        "    <img src=\"./assets/arrow.png\" alt=\"箭头\" />",
        "",
        "  * **任务感叹号，任务追踪符号**<br>若对象不在地图可见",
        "",
        "* **UI层**",
        "  在这层的内容不属于地图",
        "",
        "  * **缩放比例尺**",
        "    具体内部逻辑已经写了",
      ].join("\n");
      const result = importMarkdownBlocks(editor, markdown);
      const importedParent = result.blocks.find(block => block.type === "bulletListItem" &&
        JSON.stringify(block.content).includes("信息层"));
      expect(importedParent?.children.filter(block => block.type === "bulletListItem")
        .map(block => JSON.stringify(block.content))).toEqual([
          expect.stringContaining("任务提示箭头"),
          expect.stringContaining("任务感叹号"),
        ]);
      expect(importedParent?.children.map(block => block.type)).toEqual([
        "paragraph", "bulletListItem", "bulletListItem",
      ]);
      const ui = result.blocks.find(block => block.type === "bulletListItem" &&
        JSON.stringify(block.content).includes("UI层"));
      expect(ui?.children.some(block => block.type === "bulletListItem" &&
        JSON.stringify(block.content).includes("缩放比例尺"))).toBe(true);
      editor.replaceBlocks(editor.document, result.blocks);
      const inserted = editor.document.find(block => block.id === importedParent?.id);
      expect(inserted?.children.filter(block => block.type === "bulletListItem")).toHaveLength(2);
      expect(result.warnings).toEqual([]);
    } finally {
      editor._tiptapEditor.destroy();
    }
  });

  it("embeds Markdown and HTML images when the image row is parsed as the table header", () => {
    const editor = BlockNoteEditor.create({ schema: blackDocSchema });
    try {
      const markdownImage = "./assets/image-2026072315541809.png";
      const htmlImage = "./assets/sheet-01-image-r318-c25.png";
      const result = importMarkdownBlocks(editor, [
        `| ![image-2026072315541809](${markdownImage}) | <img src="${htmlImage}" alt="sheet-01-image-r318-c25" style="max-width:480px; height:auto;" /> |`,
        "| --- | --- |",
        "| 策划原型图 | 美术效果图 |",
      ].join("\n"));

      const table = result.blocks.find(block => block.type === "table");
      const rows = table?.type === "table" && table.content.type === "tableContent"
        ? table.content.rows : [];
      expect(rows).toHaveLength(2);
      expect(rows[0].cells.every(cell =>
        "content" in cell && cell.content.some(part => part.type === "tableImage"))).toBe(true);
      expect(result.blocks.some(block => block.type === "image")).toBe(false);
      expect(JSON.stringify(result.blocks)).not.toContain("【图片：");
      editor.replaceBlocks(editor.document, result.blocks);
      const insertedTable = editor.document.find(block => block.type === "table");
      const insertedRows = insertedTable?.type === "table" && insertedTable.content.type === "tableContent"
        ? insertedTable.content.rows : [];
      expect(insertedRows[0].cells.every(cell =>
        "content" in cell && cell.content.some(part => part.type === "tableImage"))).toBe(true);
      expect(editor.document.some(block => block.type === "image")).toBe(false);
      expect(result.warnings).toEqual([]);
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
        const source = readFileSync(samplePath, "utf8");
        const result = importMarkdownBlocks(editor, source);
        expect(result.blocks[0].type).toBe("heading");
        const serialized = JSON.stringify(result.blocks);
        expect(result.blocks.some(block => block.type === "table")).toBe(true);
        expect(result.blocks.filter(block => block.type === "splitPane").length).toBeGreaterThan(10);
        expect((serialized.match(/"type":"image"/g) ?? []).length +
          (serialized.match(/"type":"tableImage"/g) ?? []).length).toBe(118);
        const flatten = (blocks: typeof result.blocks): typeof result.blocks =>
          blocks.flatMap(block => [block, ...flatten(block.children)]);
        const listItem = (text: string) => result.blocks.find(block =>
          block.type === "bulletListItem" && JSON.stringify(block.content).includes(text));
        const info = listItem("信息层");
        expect(info?.children.filter(block => block.type === "bulletListItem")
          .map(block => JSON.stringify(block.content))).toEqual([
            expect.stringContaining("任务提示箭头"),
            expect.stringContaining("任务感叹号"),
            expect.stringContaining("主角位置提示箭头"),
          ]);
        const ui = listItem("UI");
        expect(ui?.children.filter(block => block.type === "bulletListItem")
          .map(block => JSON.stringify(block.content))).toEqual([
            expect.stringContaining("缩放比例尺"),
            expect.stringContaining("关闭按钮"),
            expect.stringContaining("图层显示顺序"),
          ]);
        expect(flatten(ui?.children ?? []).find(block => block.type === "table")).toBeDefined();
        const interaction = listItem("交互物层");
        expect(interaction?.children.some(block => block.type === "numberedListItem" &&
          JSON.stringify(block.content).includes("交互物的解锁与可见性"))).toBe(true);
        const detail = listItem("显示要素");
        expect(detail?.children.some(block => block.type === "bulletListItem" &&
          JSON.stringify(block.content).includes("交互物层"))).toBe(true);
        const stateTable = flatten(result.blocks).find(block =>
          block.type === "table" && block.content.type === "tableContent" &&
          block.content.rows.some(row => JSON.stringify(row.cells).includes("未激活状态")));
        const stateRows = stateTable?.type === "table" && stateTable.content.type === "tableContent"
          ? stateTable.content.rows : [];
        expect(stateRows.slice(1).map(row => {
          const cell = row.cells[1];
          return "content" in cell ? cell.content.filter(part => part.type === "tableImage").length : 0;
        })).toEqual([1, 2, 1]);
        expect(JSON.stringify(stateTable)).not.toContain("【图片：");
        const pictureNames = ["sheet-01-image-r354-c16", "sheet-01-image-r369-c13"];
        const pictureList = flatten(result.blocks).find(block =>
          block.type === "numberedListItem" &&
          block.children.some(child => child.type === "image" && child.props.name === pictureNames[0]));
        const picturePositions = pictureNames.map(name => pictureList?.children.findIndex(child =>
          child.type === "image" && child.props.name === name));
        expect(picturePositions[0]).toBeGreaterThanOrEqual(0);
        expect(picturePositions[1]).toBeGreaterThan(picturePositions[0]!);
        expect(pictureList?.children[picturePositions[1]! - 1]?.type).toBe("paragraph");
        expect(pictureList?.children[picturePositions[1]! + 1]?.type).toBe("paragraph");
        const placeholders: string[] = [];
        const findPlaceholders = (blocks: typeof result.blocks, parent: string) => {
          for (const block of blocks) {
            const path = `${parent}/${block.type}`;
            for (const match of JSON.stringify(block.content ?? "").matchAll(/【图片：([^】]+)】/g)) {
              placeholders.push(`${match[1]} ${path}`);
            }
            findPlaceholders(block.children, path);
          }
        };
        findPlaceholders(result.blocks, "");
        expect(placeholders).toEqual([]);
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
