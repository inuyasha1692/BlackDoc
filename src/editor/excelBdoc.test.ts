/// <reference types="node" />
import { readFileSync, writeFileSync } from "node:fs";
import { BlockNoteEditor } from "@blocknote/core";
import { marked } from "marked";
import { describe, expect, it } from "vitest";
import { blackDocSchema, type BlackDocBlock } from "./schema";
import { isBlackDocument } from "./document";
import { buildStandaloneHtml } from "../export/standaloneHtml";

function walk(blocks: BlackDocBlock[]): BlackDocBlock[] {
  return blocks.flatMap(block => [block, ...walk(block.children)]);
}

function pictureCount(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + pictureCount(item), 0);
  if (!value || typeof value !== "object") return 0;
  const object = value as Record<string, unknown>;
  return (object.type === "image" || object.type === "tableImage" ? 1 : 0) +
    Object.values(object).reduce<number>((sum, item) => sum + pictureCount(item), 0);
}

// The editor fills in default cell spans/widths and coalesces adjacent text runs.
// Compare content and styles after just those lossless normalizations.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (const raw of value) {
      const item = canonical(raw) as Record<string, unknown>;
      const previous = result.at(-1) as Record<string, unknown> | undefined;
      if (item?.type === "text" && item.text === "") continue;
      if (item?.type === "text" && previous?.type === "text" &&
        JSON.stringify(item.styles) === JSON.stringify(previous.styles)) {
        previous.text = String(previous.text) + item.text;
      } else result.push(item);
    }
    return result;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .filter(([key, item]) => item !== undefined &&
        !(["headerRows", "headerCols"].includes(key) && item === 0) &&
        !(["rowspan", "colspan"].includes(key) && item === 1) &&
        !(key === "columnWidths" && Array.isArray(item) && item.every(width => width == null)))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

async function verify(path: string) {
  const blocks = JSON.parse(readFileSync(path, "utf8")) as BlackDocBlock[];
  expect(isBlackDocument(blocks)).toBe(true);
  const editor = BlockNoteEditor.create({ schema: blackDocSchema, initialContent: blocks });
  try {
    const normalized = walk(editor.document);
    const input = walk(blocks);
    expect(normalized.map(block => block.id)).toEqual(input.map(block => block.id));
    const content = (items: BlackDocBlock[]) => items.map(block => canonical(block.content ?? null));
    expect(content(normalized)).toEqual(content(input));
    for (const [index, block] of input.entries()) {
      expect(normalized[index].props).toMatchObject(block.props);
    }
    const { html, externalImages } = await buildStandaloneHtml(editor, editor.document);
    expect(externalImages).toEqual([]);
    const dom = new DOMParser().parseFromString(html, "text/html");
    // Color values surviving JSON normalization does not prove they render.
    for (const span of dom.querySelectorAll<HTMLElement>('[data-style-type][data-value]')) {
      const value = span.dataset.value!;
      if (!value.startsWith("#")) continue;
      const property = span.dataset.styleType === "textColor" ? "color" : "backgroundColor";
      if (!["textColor", "backgroundColor"].includes(span.dataset.styleType!)) continue;
      const expected = document.createElement("span");
      expected.style[property] = value;
      expect(span.style[property]).toBe(expected.style[property]);
      expect(span.style[property]).not.toBe("");
    }
    expect(dom.querySelectorAll("img")).toHaveLength(pictureCount(blocks));
    const ids = new Set(input.map(block => block.id));
    for (const anchor of dom.querySelectorAll<HTMLAnchorElement>('a[href^="#block="]')) {
      expect(ids.has(decodeURIComponent(anchor.hash.slice(7)))).toBe(true);
    }
    for (const image of dom.querySelectorAll<HTMLImageElement>("img")) {
      expect(image.getAttribute("src")).toMatch(/^data:image\//);
    }
    return { html, dom, blocks: editor.document };
  } finally {
    editor._tiptapEditor.destroy();
  }
}

function inlineText(value: unknown): string {
  if (Array.isArray(value)) return value.map(inlineText).join("");
  if (!value || typeof value !== "object") return "";
  const item = value as { text?: string; content?: unknown };
  return item.text ?? inlineText(item.content);
}

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

async function verifySharedMarkdown(path: string, blocks: BlackDocBlock[], referencePath?: string) {
  const markdown = readFileSync(path, "utf8");
  const dom = new DOMParser().parseFromString(await marked.parse(markdown), "text/html");
  const input = walk(blocks);
  const headings = (document: Document) => [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
    .map(heading => [Number(heading.tagName.slice(1)), normalizeText(heading.textContent ?? "")]);
  expect(headings(dom)).toEqual(input.filter(block => block.type === "heading")
    .map(block => [block.props.level, normalizeText(inlineText(block.content))]));
  const tables = input.filter(block => block.type === "table");
  expect(dom.querySelectorAll("table")).toHaveLength(tables.length);
  for (const [index, table] of [...dom.querySelectorAll("table")].entries()) {
    const content = tables[index].content as { rows: { cells: { content: unknown }[] }[] };
    expect([...table.rows].map(row => [...row.cells].map(cell => {
      const copy = cell.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
      return normalizeText(copy.textContent ?? "");
    }))).toEqual(content.rows.map(row => row.cells.map(cell => normalizeText(inlineText(cell.content)))));
  }
  expect([...dom.querySelectorAll("pre code")].map(code => code.textContent?.trimEnd()))
    .toEqual(input.filter(block => block.type === "codeBlock").map(block => inlineText(block.content).trimEnd()));
  const expectedLists: { depth: number; text: string }[] = [];
  const isList = (block: BlackDocBlock) => ["bulletListItem", "numberedListItem"].includes(block.type);
  const ownText = (block: BlackDocBlock): string => [inlineText(block.content),
    ...block.children.filter(child => !isList(child)).map(ownText)].join(" ");
  const scan = (items: BlackDocBlock[], depth = 0) => items.forEach(block => {
    if (isList(block)) expectedLists.push({ depth, text: normalizeText(ownText(block)) });
    scan(block.children, depth + (isList(block) ? 1 : 0));
  });
  scan(blocks);
  expect([...dom.querySelectorAll("li")].map(li => {
    let depth = -1;
    for (let parent = li.parentElement; parent; parent = parent.parentElement) {
      if (["UL", "OL"].includes(parent.tagName)) depth++;
    }
    const copy = li.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("ul,ol").forEach(list => list.remove());
    return { depth, text: normalizeText(copy.textContent ?? "") };
  })).toEqual(expectedLists);
  expect(dom.querySelectorAll("img")).toHaveLength(pictureCount(blocks));
  for (const link of dom.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
    expect(dom.getElementById(decodeURIComponent(link.hash.slice(1)))).not.toBeNull();
  }
  if (referencePath) {
    const reference = new DOMParser().parseFromString(await marked.parse(
      readFileSync(referencePath, "utf8")), "text/html");
    expect(headings(dom)).toEqual(headings(reference));
    expect(reference.querySelectorAll("table")).toHaveLength(tables.length);
    const label = (li: Element) => normalizeText(li.querySelector("strong")?.textContent ?? li.textContent ?? "");
    expect([...dom.querySelectorAll("li")].map(label))
      .toEqual([...reference.querySelectorAll("li")].map(label));
  }
}

describe("native Excel conversion", () => {
  it("preserves shared document headings, merged cells, nested lists, code and links across both adapters", async () => {
    const result = await verify("scripts/tests/fixtures/document.bdoc");
    await verifySharedMarkdown("scripts/tests/fixtures/document.md", result.blocks);
  });
  it("opens generated blocks with editable tables, nested lists, colors, pictures and split panes", async () => {
    const result = await verify("scripts/tests/fixtures/excel.bdoc");
    expect(result.dom.querySelectorAll("img")).toHaveLength(2);
    expect(result.blocks.filter(block => block.type === "splitPane")).toHaveLength(1);
    const parent = result.blocks.find(block => block.type === "bulletListItem");
    expect(parent?.children[0].type).toBe("paragraph");
    expect(result.blocks.some(block => "backgroundColor" in block.props && block.props.backgroundColor === "yellow")).toBe(true);
  });

  it.skipIf(!process.env.BLACKDOC_EXCEL_SAMPLE)("validates the selected local workbook output and exports a review preview", async () => {
    const sample = process.env.BLACKDOC_EXCEL_SAMPLE!;
    const result = await verify(sample);
    if (process.env.BLACKDOC_EXCEL_PREVIEW) {
      writeFileSync(process.env.BLACKDOC_EXCEL_PREVIEW, result.html, "utf8");
    }
    if (process.env.BLACKDOC_EXCEL_MARKDOWN) {
      await verifySharedMarkdown(process.env.BLACKDOC_EXCEL_MARKDOWN, result.blocks, process.env.BLACKDOC_EXCEL_REFERENCE);
    }
    expect(result.blocks.length).toBeGreaterThan(1);
  });
});
