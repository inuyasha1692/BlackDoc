import type { BlackDocBlock } from "../editor/schema";
import { canvasSvg } from "../canvas/export";
import { marked } from "marked";

type Node = { type?: string; id?: string; text?: string; href?: string; content?: unknown; props?: Record<string, unknown>; styles?: Record<string, unknown>; children?: Node[] };
export interface MarkdownAsset { name: string; base64: string }
const html = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escape = (value: unknown) => String(value ?? "").replace(/[\\`*_{}[\]<>|]/g, "\\$&");
// HTML text must not introduce Markdown escapes or math delimiters in Typora.
const htmlText = (value: unknown) => html(value).replace(/[\\`*_[\]$|]/g, character => `&#${character.charCodeAt(0)};`);
const palette: Record<string, string> = { gray: "#9b9a97", brown: "#64473a", red: "#e03e3e", orange: "#d9730d", yellow: "#dfab01", green: "#4d6461", blue: "#0b6e99", purple: "#6940a5", pink: "#ad1a72" };
const backgrounds: Record<string, string> = { gray: "#e5e5e5", brown: "#f2d5c3", red: "#ffcccc", orange: "#ffe5cc", yellow: "#fff4cc", green: "#ccffcc", blue: "#cce5ff", purple: "#ccccff", pink: "#ffcce5" };
const css = (props: Record<string, unknown> = {}) => [
  props.textColor && props.textColor !== "default" ? `color:${palette[String(props.textColor)] ?? props.textColor}` : "",
  props.backgroundColor && props.backgroundColor !== "default" ? `background:${backgrounds[String(props.backgroundColor)] ?? props.backgroundColor}` : "",
].filter(Boolean).join(";");

export async function buildMarkdown(blocks: readonly BlackDocBlock[]) {
  const assets: MarkdownAsset[] = [];
  const warnings = new Set<string>();
  const cache = new Map<string, string>();
  const targets = new Set<string>();
  const scan = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(scan); return; }
    if (!value || typeof value !== "object") return;
    const node = value as Node;
    if (node.href?.startsWith("#block=")) targets.add(decodeURIComponent(node.href.slice(7)));
    Object.values(value).forEach(scan);
  };
  scan(blocks);
  const resource = async (url: string, name: string) => {
    if (!url.startsWith("data:")) { if (url) warnings.add("外部资源保留原链接。"); return url; }
    if (cache.has(url)) return cache.get(url)!;
    const response = await fetch(url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hash = Array.from(digest).map(byte => byte.toString(16).padStart(2, "0")).join("");
    if (cache.has(url)) return cache.get(url)!;
    const mime = response.headers.get("content-type")?.split(";")[0] ?? "";
    const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "image/gif": "gif", "image/webp": "webp", "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "application/pdf": "pdf", "application/json": "excalidraw" } as Record<string, string>)[mime] ?? name.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1] ?? "bin";
    const stem = name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]/gu, "-").slice(0, 60) || "asset";
    const filename = `${stem}-${hash}.${extension}`;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    assets.push({ name: filename, base64: btoa(binary) });
    const path = `./assets/${filename}`;
    cache.set(url, path);
    return path;
  };
  const anchor = (node: Node) => node.id && targets.has(node.id) ? `<span id="bdoc-${html(node.id)}"></span>\n\n` : "";
  const inline = async (value: unknown, asHtml = false): Promise<string> => {
    if (typeof value === "string") return asHtml ? htmlText(value).replace(/\r\n|\r|\n/g, "<br>") : escape(value).replace(/\r\n|\r|\n/g, "<br>");
    if (!Array.isArray(value)) return "";
    return (await Promise.all(value.map(async (node: Node) => {
      if (node.type === "math") return `$${String(node.content ?? "")}$`;
      if (node.type === "tableImage") return image(node.props ?? {}, asHtml);
      if (node.type === "link") {
        const href = node.href?.startsWith("#block=") ? `#bdoc-${decodeURIComponent(node.href.slice(7))}` : node.href ?? "";
        const text = await inline(node.content, asHtml);
        return asHtml ? `<a href="${html(href)}">${text}</a>` : `[${text}](${href.replaceAll(" ", "%20").replaceAll("(", "%28").replaceAll(")", "%29")})`;
      }
      if (node.type !== "text") { warnings.add(`行内组件 ${node.type} 使用文本回退。`); return inline(node.content, asHtml); }
      const styles = node.styles ?? {};
      // Format each line separately: Markdown delimiters cannot close after a newline.
      // Whitespace at the edges also belongs outside emphasis delimiters.
      return (node.text ?? "").split(/\r\n|\r|\n/).map(line => {
        if (!line.trim()) return asHtml ? html(line) : line;
        const useHtml = asHtml || !!css(styles);
        const [, leading, source, trailing] = line.match(/^(\s*)(.*?)(\s*)$/)!;
        let text = useHtml ? htmlText(source) : escape(source);
        if (styles.code && !useHtml) {
          const delimiter = "`".repeat(Math.max(1, ...Array.from(source.matchAll(/`+/g), match => match[0].length + 1)));
          const padding = source.startsWith("`") || source.endsWith("`") ? " " : "";
          text = `${delimiter}${padding}${source}${padding}${delimiter}`;
        }
        for (const [key, tag, marker] of [["bold", "strong", "**"], ["italic", "em", "*"], ["strike", "del", "~~"], ["code", "code", "`"], ["underline", "u", ""]]) {
          if (styles[key] && !(key === "code" && !useHtml)) text = useHtml || !marker ? `<${tag}>${text}</${tag}>` : `${marker}${text}${marker}`;
        }
        if (css(styles)) text = `<span style="${html(css(styles))}">${text}</span>`;
        return leading + text + trailing;
      }).join("<br>");
    }))).join("");
  };
  const image = async (props: Record<string, unknown>, asHtml = false) => {
    const path = await resource(String(props.url ?? ""), String(props.name ?? "image"));
    return Number(props.previewWidth) > 0 || asHtml
      ? `<img src="${html(path)}" alt="${html(props.name)}" style="${Number(props.previewWidth) > 0 ? `max-width:${Number(props.previewWidth)}px;` : ""}height:auto;" />`
      : `![${escape(props.name)}](${path})`;
  };
  const render = async (node: Node, listIndex = 1): Promise<string> => {
    const props = node.props ?? {};
    const children = node.children ?? [];
    let body: string;
    if (["columnList", "splitPane"].includes(node.type ?? "")) {
      const left = children[0]?.children ?? [];
      const right = children[1]?.children ?? [];
      const simple = children.length === 2 && left.length === 1 && left[0].type === "image" && right.length > 0 && right.every(item => item.type === "paragraph" && !item.children?.length);
      const inlineCells = node.type === "splitPane" && children.every(column => (column.children ?? []).every(item => ["paragraph", "heading", "image"].includes(item.type ?? "") && !item.children?.length));
      if (inlineCells) {
        const cells = [];
        for (const column of children) {
          const parts = [];
          const items = column.children ?? [];
          for (const [index, item] of items.entries()) {
            let content = item.type === "image" ? await image(item.props ?? {}, true) : await inline(item.content, !!css(item.props));
            if (item.type === "heading") content = `<strong>${content}</strong>`;
            if (css(item.props)) content = `<span style="${html(css(item.props))}">${content}</span>`;
            parts.push(anchor(item).replace(/\r?\n/g, "") + content);
            if (index < items.length - 1 && !(item.type === "image" && items[index + 1].type === "paragraph")) parts.push("<br>");
          }
          cells.push((anchor(column) + parts.join("")).replace(/\r?\n/g, "").replace(/(?<!\\)\|/g, "&#124;"));
        }
        body = `| 图片 | 说明 |\n| --- | --- |\n| ${cells[0] ?? ""} | ${cells[1] ?? ""} |`;
      }
      else if (node.type === "splitPane") {
        const cells = [];
        for (const column of children) {
          const content = anchor(column) + await marked.parse(await renderMany(column.children ?? []));
          // Blank source lines terminate Markdown HTML blocks, even inside a td.
          // Encode preformatted newlines first so compacting the cell preserves code.
          cells.push(content.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, pre => pre.replace(/\r\n|\r|\n/g, "&#10;")).replace(/\r\n|\r|\n/g, ""));
        }
        body = `<table>\n<thead><tr><th>图片</th><th>说明</th></tr></thead>\n<tbody><tr><td style="vertical-align:middle;">${cells[0] ?? ""}</td><td style="vertical-align:top;">${cells[1] ?? ""}</td></tr></tbody>\n</table>`;
      }
      else if (simple) body = `| 图片 | 说明 |\n| --- | --- |\n| ${(anchor(left[0]) + await image(left[0].props ?? {})).replaceAll("\n", "")} | ${(await Promise.all(right.map(async item => anchor(item) + await inline(item.content)))).join("<br>").replaceAll("\n", "<br>")} |`;
      else { body = await renderMany(children); warnings.add("复杂分栏和双分区已按列展开。"); }
    } else if (["column", "splitColumn"].includes(node.type ?? "")) body = await renderMany(children);
    else if (node.type === "canvas") {
      body = `![画布](${await resource(await canvasSvg(String(props.scene)), "canvas")})`;
      body += `\n\n[画布源文件](${await resource(`data:application/json;charset=utf-8,${encodeURIComponent(String(props.scene))}`, "canvas")})`;
    } else if (node.type === "image") body = await image(props);
    else if (["audio", "video", "file"].includes(node.type ?? "")) body = `[${escape(props.name || node.type)}](${await resource(String(props.url ?? ""), String(props.name ?? node.type))})`;
    else if (node.type === "diagram" || node.type === "mathBlock") {
      const source = typeof node.content === "string" ? node.content : (Array.isArray(node.content) ? node.content.map((item: Node) => item.text ?? "").join("") : "");
      body = node.type === "diagram" ? `\`\`\`mermaid\n${source}\n\`\`\`` : `$$\n${source}\n$$`;
    } else if (node.type === "table") {
      const content = node.content as { rows: { cells: unknown[] }[]; headerRows?: number; headerCols?: number };
      const cell = (value: unknown) => Array.isArray(value) ? { content: value, props: {} } : value as Node;
      const complex = !!content.headerCols || !content.headerRows || content.rows.some(row => row.cells.some(value => !!css(cell(value).props)));
      if (complex) {
        body = "<table>\n";
        for (const [r, row] of content.rows.entries()) {
          body += "<tr>";
          for (const [c, value] of row.cells.entries()) { const item = cell(value); const tag = r < (content.headerRows ?? 0) || c < (content.headerCols ?? 0) ? "th" : "td"; body += `<${tag} style="${html(css(item.props))}">${await inline(item.content, true)}</${tag}>`; }
          body += "</tr>\n";
        }
        body += "</table>";
      } else {
        const rows = await Promise.all(content.rows.map(async row => `| ${(await Promise.all(row.cells.map(value => inline(cell(value).content)))).map(text => text.replaceAll("\n", "<br>")).join(" | ")} |`));
        rows.splice(1, 0, `| ${content.rows[0].cells.map(() => "---").join(" | ")} |`);
        body = rows.join("\n");
      }
    } else {
      body = await inline(node.content, !!css(props) && node.type !== "codeBlock" && node.type !== "divider");
      if (css(props) && node.type !== "codeBlock" && node.type !== "divider") body = `<span style="display:block;${html(css(props))};">${body.replaceAll("\n", "<br>")}</span>`;
      if (node.type === "heading") body = `${"#".repeat(Number(props.level) || 1)} ${body}`;
      else if (node.type === "quote") body = body.split("\n").map(line => `> ${line}`).join("\n");
      else if (node.type === "divider") body = "---";
      else if (node.type === "codeBlock") {
        const source = (node.content as Node[]).map(item => item.text ?? "").join("");
        const fence = "`".repeat(Math.max(3, ...Array.from(source.matchAll(/`+/g), match => match[0].length + 1)));
        body = `${fence}${props.language ?? ""}\n${source}\n${fence}`;
      } else if (["bulletListItem", "numberedListItem", "checkListItem", "toggleListItem"].includes(node.type ?? "")) {
        const marker = node.type === "numberedListItem" ? `${listIndex}. ` : node.type === "checkListItem" ? `- [${props.checked ? "x" : " "}] ` : "- ";
        body = marker + body.replaceAll("\n", `\n${" ".repeat(marker.length)}`);
        if (children.length) body += "\n" + (await renderMany(children)).split("\n").map(line => " ".repeat(marker.length) + line).join("\n");
      } else if (node.type !== "paragraph") warnings.add(`组件 ${node.type} 已使用文本回退。`);
      if (children.length && !["bulletListItem", "numberedListItem", "checkListItem", "toggleListItem"].includes(node.type ?? "")) body += "\n\n" + await renderMany(children);
    }
    if (css(props) && ["image", "canvas", "table", "diagram", "mathBlock", "codeBlock"].includes(node.type ?? "")) body = `<span style="display:block;${html(css(props))};">${body}</span>`;
    return anchor(node) + body;
  };
  const renderMany = async (nodes: Node[]): Promise<string> => {
    const result = [];
    let listIndex = 0;
    for (const node of nodes) {
      if (node.type === "numberedListItem") {
        const start = Number(node.props?.start);
        listIndex = Number.isInteger(start) && start > 0 ? start : listIndex + 1;
      } else listIndex = 0;
      result.push(await render(node, listIndex || 1));
    }
    return result.join("\n\n");
  };
  const markdown = await renderMany(blocks as unknown as Node[]);
  return { markdown: markdown + "\n", assets, warnings: [...warnings] };
}
