import { plainContentToString } from "@blocknote/core";
import { latexToMathMLElement } from "@blocknote/math-block";
import type { BlackDocBlock } from "../editor/schema";

const mathElement = (source: string, inline: boolean): Element => {
  const { mathMLElement, error } = latexToMathMLElement(source, inline);
  if (mathMLElement && !error) {
    mathMLElement.setAttribute("display", inline ? "inline" : "block");
    mathMLElement.setAttribute("alttext", source);
    return mathMLElement;
  }
  const fallback = document.createElement(inline ? "code" : "pre");
  fallback.className = "math-export-error";
  fallback.title = "公式无法渲染，已保留 LaTeX 源码。";
  fallback.textContent = source;
  return fallback;
};

// Inline formulas can also appear inside table cells.
const inlineSources = (content: unknown): string[] => {
  if (Array.isArray(content)) return content.flatMap(inlineSources);
  if (!content || typeof content !== "object") return [];
  const node = content as Record<string, unknown>;
  if (node.type === "math") {
    if (typeof node.content !== "string") {
      throw new Error("行内公式数据无效，HTML 导出已中止。");
    }
    return [node.content];
  }
  return ["content", "rows", "cells"].flatMap(key => inlineSources(node[key]));
};

export const serializeScientificContent = (
  blocks: readonly BlackDocBlock[],
  serialize: (blocks: BlackDocBlock[]) => string,
): HTMLDivElement => {
  const placeholders = new Map<string, string>();
  const prefix = `BLACKDOCMATH${crypto.randomUUID().replaceAll("-", "")}X`;
  // The official inline preview contains div/pre popup nodes. Serializing it
  // inside a paragraph produces invalid HTML, so replace it before HTML parsing.
  const prepare = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(prepare);
    if (!value || typeof value !== "object") return value;
    const node = value as Record<string, unknown>;
    if (node.type === "math" && typeof node.content === "string") {
      const marker = `${prefix}${placeholders.size}END`;
      placeholders.set(marker, node.content);
      return { type: "text", text: marker, styles: {} };
    }
    return Object.fromEntries(Object.entries(node).map(([key, child]) => [
      key, ["content", "rows", "cells", "children"].includes(key) ? prepare(child) : child,
    ]));
  };
  const container = document.createElement("div");
  container.innerHTML = serialize(prepare(blocks) as BlackDocBlock[]);
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const pattern = new RegExp(`${prefix}\\d+END`, "g");
  const restored = new Set<string>();
  for (const text of nodes) {
    const matches = Array.from(text.data.matchAll(pattern));
    if (!matches.length) continue;
    const fragment = document.createDocumentFragment();
    let offset = 0;
    for (const match of matches) {
      const marker = match[0];
      if (!placeholders.has(marker) || restored.has(marker)) {
        throw new Error("行内公式占位内容无效，HTML 导出已中止。");
      }
      restored.add(marker);
      fragment.append(text.data.slice(offset, match.index));
      const span = document.createElement("span");
      span.dataset.inlineContentType = "math";
      fragment.append(span);
      offset = match.index + marker.length;
    }
    fragment.append(text.data.slice(offset));
    text.replaceWith(fragment);
  }
  if (restored.size !== placeholders.size) {
    throw new Error("行内公式内容不完整，HTML 导出已中止。");
  }
  return container;
};

export const exportScientificContent = async (
  root: ParentNode,
  blocks: readonly BlackDocBlock[],
): Promise<void> => {
  const elements = new Map(Array.from(
    root.querySelectorAll<HTMLElement>(".bn-block-outer[id]"),
    element => [element.id, element] as const,
  ));
  const visit = async (items: readonly BlackDocBlock[]): Promise<void> => {
    for (const block of items) {
      const outer = elements.get(`block=${block.id}`);
      const owned = (selector: string) => Array.from(
        outer?.querySelectorAll<HTMLElement>(selector) ?? [],
      ).filter(element => element.closest(".bn-block-outer") === outer);
      if (block.type === "mathBlock" || block.type === "diagram") {
        const element = owned(`[data-content-type="${block.type}"]`)[0];
        if (!element) throw new Error("未能找到公式或图表内容，HTML 导出已中止。");
        const source = plainContentToString(block.content);
        if (block.type === "mathBlock") {
          element.replaceChildren(mathElement(source, false));
        } else if (!source.trim()) {
          const placeholder = document.createElement("p");
          placeholder.textContent = "空白 Mermaid 图表";
          element.replaceChildren(placeholder);
        } else {
          try {
            const { renderDiagramToSVG } = await import("@blocknote/diagram-block");
            const result = await renderDiagramToSVG(source, { fontFamily: "sans-serif" });
            if (result.error !== undefined) throw new Error(result.error);
            const svg = new TextDecoder().decode(result.image.data);
            const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
            if (parsed.querySelector("parsererror") ||
              parsed.documentElement.localName !== "svg" ||
              parsed.documentElement.namespaceURI !== "http://www.w3.org/2000/svg" ||
              !Number.isFinite(result.image.width) || result.image.width <= 0 ||
              !Number.isFinite(result.image.height) || result.image.height <= 0) {
              throw new Error("Invalid SVG");
            }
            // SVG-as-image isolates scripts, links and external resources from
            // the exported page; never insert Mermaid's markup as live HTML.
            const image = document.createElement("img");
            image.className = "diagram-export";
            image.alt = "Mermaid 图表";
            image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
            image.width = result.image.width;
            image.height = result.image.height;
            element.replaceChildren(image);
          } catch (cause) {
            throw new Error("Mermaid 图表渲染失败，请检查图表内容后重新导出。", { cause });
          }
        }
      } else {
        const sources = inlineSources(block.content);
        const formulas = owned('[data-inline-content-type="math"]');
        if (sources.length !== formulas.length) {
          throw new Error("行内公式内容不完整，HTML 导出已中止。");
        }
        formulas.forEach((element, index) => {
          element.replaceChildren(mathElement(sources[index], true));
          element.removeAttribute("contenteditable");
        });
      }
      await visit(block.children);
    }
  };
  await visit(blocks);
};
