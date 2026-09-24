import type { BlackDocBlock as Block, BlackDocEditor as BlockNoteEditor } from "../editor/schema";
import { getDocumentTitle } from "../editor/document";
import { getHeadingNumbers } from "../editor/headingNumbers";
import { getOutlineItems } from "../editor/outline";
import { canvasSvg } from "../canvas/export";
import { exportScientificContent, serializeScientificContent } from "./scientificHtml";

const EXPORT_STYLES = `
:root { color-scheme: light; font-family: Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; color: #202124; background: #fff; line-height: 1.7; }
.document-layout { width: min(100%, 1680px); margin: 0 auto; display: grid; grid-template-columns: 250px minmax(0, 1fr); }
.document-layout main { width: 100%; min-width: 0; padding: 36px 24px 80px; }
.bn-editor { padding-inline: 54px; }
.document-outline { position: sticky; top: 24px; align-self: start; margin-top: 48px; max-height: calc(100vh - 48px); overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: #d7dde2 transparent; font-size: 13px; }
.document-outline:hover { scrollbar-color: #aab3bc transparent; }
.document-outline summary { cursor: pointer; padding: 0 0 10px; color: #858d96; font-size: 12px; font-weight: 600; }
.document-outline nav { display: flex; flex-direction: column; gap: 2px; padding: 0; border-left: 1px solid #e3e6ea; }
.document-outline a { display: block; margin-left: -1px; padding: 6px 10px 6px calc(10px + var(--depth) * 12px); border-left: 2px solid transparent; color: #656d76; text-decoration: none; overflow-wrap: anywhere; transition: color .15s ease, border-color .15s ease; }
.document-outline a:hover { color: #202124; }
.document-outline a[aria-current="location"] { color: #16734b; border-left-color: #16734b; font-weight: 600; }
.document-outline a:focus-visible, .document-outline summary:focus-visible { outline: 2px solid #0969da; outline-offset: -2px; }
.bn-block-outer[id] { scroll-margin-top: 24px; }
.bn-block-group { display: flex; flex-direction: column; gap: 2px; }
.bn-block-outer { position: relative; }
.bn-block-outer.block-link-highlight { scroll-margin-top: 24px; animation: block-link-export-highlight 1.8s ease-out; }
.bn-block { display: flex; flex-direction: column; }
.bn-block-content { display: flex; width: 100%; min-height: 1.5em; padding: 3px 0; }
.bn-block-group .bn-block-group { margin-left: 24px; }
.bn-block-content[data-text-alignment="center"] { justify-content: center; text-align: center; }
.bn-block-content[data-text-alignment="right"] { justify-content: flex-end; text-align: right; }
.bn-block-content[data-text-alignment="justify"] { text-align: justify; }
.bn-block-content:is([data-content-type="numberedListItem"], [data-content-type="bulletListItem"], [data-content-type="checkListItem"]) > .bn-inline-content { margin: 0; }
.bn-block-content:is([data-content-type="numberedListItem"], [data-content-type="bulletListItem"])::before { display: flex; align-items: center; justify-content: center; flex: 0 0 24px; height: 1.7em; padding-right: 4px; line-height: 1; }
.bn-block-content[data-content-type="numberedListItem"]::before { content: attr(data-index) "."; }
.bn-block-content[data-content-type="bulletListItem"]::before { content: "•"; font-size: 1.5em; height: 1.1333em; }
.bn-block-content[data-content-type="bulletListItem"] ~ .bn-block-group > .bn-block-outer > .bn-block > .bn-block-content[data-content-type="bulletListItem"]::before { content: "◦"; }
.bn-block-content[data-content-type="checkListItem"] > div { display: flex; align-items: center; height: 1.7em; }
.bn-block-content[data-content-type="checkListItem"] input { width: 16px; height: 16px; margin: 0 8px 0 4px; }
.bn-block-content[data-content-type="checkListItem"][data-checked="true"] .bn-inline-content { text-decoration: line-through; }
.bn-toggle-wrapper { display: flex; align-items: center; }
.bn-toggle-button { display: flex; padding: 3px; border: 0; background: transparent; color: inherit; cursor: pointer; }
.bn-toggle-button svg { width: 18px; height: 18px; }
.bn-toggle-wrapper[data-show-children="true"] .bn-toggle-button { transform: rotate(90deg); }
.bn-block:has(> .bn-block-content .bn-toggle-wrapper[data-show-children="false"]) > .bn-block-group { display: none; }
.bn-toggle-wrapper .bn-inline-content { margin: 0; }
[data-style-type="textColor"][data-value="gray"], [data-text-color="gray"] { color: #9b9a97; }
[data-style-type="textColor"][data-value="brown"], [data-text-color="brown"] { color: #64473a; }
[data-style-type="textColor"][data-value="red"], [data-text-color="red"] { color: #e03e3e; }
[data-style-type="textColor"][data-value="orange"], [data-text-color="orange"] { color: #d9730d; }
[data-style-type="textColor"][data-value="yellow"], [data-text-color="yellow"] { color: #dfab01; }
[data-style-type="textColor"][data-value="green"], [data-text-color="green"] { color: #4d6461; }
[data-style-type="textColor"][data-value="blue"], [data-text-color="blue"] { color: #0b6e99; }
[data-style-type="textColor"][data-value="purple"], [data-text-color="purple"] { color: #6940a5; }
[data-style-type="textColor"][data-value="pink"], [data-text-color="pink"] { color: #ad1a72; }
[data-style-type="backgroundColor"][data-value="gray"], [data-background-color="gray"] { background-color: #ebeced; }
[data-style-type="backgroundColor"][data-value="brown"], [data-background-color="brown"] { background-color: #e9e5e3; }
[data-style-type="backgroundColor"][data-value="red"], [data-background-color="red"] { background-color: #fbe4e4; }
[data-style-type="backgroundColor"][data-value="orange"], [data-background-color="orange"] { background-color: #f6e9d9; }
[data-style-type="backgroundColor"][data-value="yellow"], [data-background-color="yellow"] { background-color: #fbf3db; }
[data-style-type="backgroundColor"][data-value="green"], [data-background-color="green"] { background-color: #ddedea; }
[data-style-type="backgroundColor"][data-value="blue"], [data-background-color="blue"] { background-color: #ddebf1; }
[data-style-type="backgroundColor"][data-value="purple"], [data-background-color="purple"] { background-color: #eae4f2; }
[data-style-type="backgroundColor"][data-value="pink"], [data-background-color="pink"] { background-color: #f4dfeb; }
.split-pane { display: grid; grid-template-columns: minmax(0, var(--split-left-width, 50fr)) minmax(0, var(--split-right-width, 50fr)); gap: 16px; align-items: stretch; margin: 16px 0; }
.split-pane > .bn-block-outer { min-width: 0; }
.split-pane > .bn-block-outer:nth-child(2) { border-left: 1px solid #e3e6ea; padding-left: 8px; }
.split-pane-right-scroll { height: var(--split-right-height, 400px); overflow-y: auto; overscroll-behavior-y: auto; scrollbar-width: thin; scrollbar-color: #d7dde2 transparent; min-width: 0; }
.split-pane-right-scroll:hover { scrollbar-color: #aab3bc transparent; }
.document-outline::-webkit-scrollbar, .split-pane-right-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.document-outline::-webkit-scrollbar-track, .split-pane-right-scroll::-webkit-scrollbar-track { background: transparent; }
.document-outline::-webkit-scrollbar-thumb, .split-pane-right-scroll::-webkit-scrollbar-thumb { border: 1px solid transparent; border-radius: 6px; background: #d7dde2; background-clip: padding-box; }
.document-outline:hover::-webkit-scrollbar-thumb, .split-pane-right-scroll:hover::-webkit-scrollbar-thumb { background: #aab3bc; background-clip: padding-box; }
.bn-block-column-list { display: flex; flex-direction: row; align-items: stretch; gap: 16px; margin: 16px 0; }
.bn-block-column { display: flex; flex: 1 1 0; flex-direction: column; min-width: 0; overflow-x: auto; }
.bn-inline-content { margin: 0; overflow-wrap: anywhere; }
.heading-auto-number { color: #656d76; font-weight: 500; }
math[display="block"] { display: block math; overflow-x: auto; padding: 12px 0; }
math[display="inline"] { display: inline math; }
.math-export-error { white-space: pre-wrap; overflow-wrap: anywhere; }
.diagram-export { max-width: 100%; height: auto; }
h1.bn-inline-content { margin: 0 0 22px; font-size: 2rem; line-height: 1.2; }
h2.bn-inline-content { margin: 32px 0 10px; font-size: 1.75rem; line-height: 1.3; }
h3.bn-inline-content { margin: 26px 0 8px; font-size: 1.5rem; line-height: 1.35; }
h4.bn-inline-content { margin: 22px 0 6px; font-size: 1.25rem; line-height: 1.4; }
h5.bn-inline-content { margin: 22px 0 6px; font-size: 1.125rem; line-height: 1.4; }
h6.bn-inline-content { margin: 22px 0 6px; font-size: 1rem; line-height: 1.4; }
p.bn-inline-content { margin: 5px 0; }
a { color: #0969da; text-decoration-thickness: 1px; text-underline-offset: 3px; }
blockquote { margin: 16px 0; padding: 3px 18px; border-left: 3px solid #8b949e; color: #57606a; }
pre { overflow: auto; padding: 16px; border: 1px solid #d8dee4; border-radius: 6px; background: #f6f8fa; }
code { font-family: "SFMono-Regular", Consolas, monospace; font-size: .9em; }
.bn-inline-content code { padding: .08em .32em; border: 1px solid #e3e6ea; border-radius: 3px; background: #f0f2f4; color: #202124; }
table { margin: 18px 0; border-collapse: collapse; }
th, td { padding: 8px 10px; border: 1px solid #d0d7de; text-align: left; vertical-align: top; }
.bn-block-content[data-content-type="table"] .tableWrapper { width: 100%; overflow-x: auto; }
.bn-block-content[data-content-type="table"] table { width: auto; table-layout: fixed; margin: 0; }
.bn-block-content[data-content-type="table"] th, .bn-block-content[data-content-type="table"] td { padding: 5px 10px; }
.bn-block-content[data-content-type="table"] :is(th, td) > p { margin: 0; min-height: 1.5em; }
img, video { display: block; max-width: 100%; height: auto; margin: 16px auto; }
audio { width: 100%; margin: 12px 0; }
figure { max-width: 100%; margin: 18px 0; }
.bn-block-content[data-file-block] { display: flex; }
.bn-block-content[data-file-block][data-text-alignment="center"] { justify-content: center; }
.bn-block-content[data-file-block][data-text-alignment="right"] { justify-content: flex-end; }
.bn-block-content[data-file-block] > .bn-file-block-content-wrapper { max-width: 100%; margin: 12px 0; }
.bn-block-content[data-content-type="audio"] > .bn-file-block-content-wrapper { width: 100%; }
.bn-block-content[data-file-block] :is(img, video, audio) { margin: 0; }
.bn-visual-media-wrapper { max-width: 100%; }
.bn-visual-media { width: 100%; }
.canvas-export-button { display: block; width: 100%; padding: 0; border: 1px solid #d8dee4; border-radius: 6px; background: #fff; cursor: zoom-in; }
.canvas-export-button img { width: 100%; max-height: 600px; object-fit: contain; margin: 0; }
.canvas-viewer { width: calc(100vw - 32px); height: calc(100vh - 32px); max-width: none; max-height: none; padding: 0; border: 1px solid #d8dee4; border-radius: 6px; }
.canvas-viewer::backdrop { background: rgb(20 25 23 / 45%); }
.canvas-viewer header { height: 52px; display: flex; gap: 16px; justify-content: flex-end; align-items: center; padding: 8px 16px; border-bottom: 1px solid #ddd; }
.canvas-viewer button { width: 34px; height: 34px; border: 0; background: #f3f4f5; cursor: pointer; font-size: 20px; }
.canvas-viewer .canvas-viewer-scroll { height: calc(100% - 52px); overflow: auto; }
.canvas-viewer img { max-width: none; width: 100%; margin: 0; }
figcaption { margin-top: 6px; color: #656d76; font-size: .875rem; text-align: center; }
hr { margin: 28px 0; border: 0; border-top: 1px solid #d8dee4; }
.bn-block-content[data-content-type="divider"] hr { flex: 1; margin: .5em 0; border-top-color: #7d797a; }
ul, ol { padding-left: 28px; }
details { margin: 6px 0; }
@keyframes block-link-export-highlight { 0%, 45% { background: #fff3bf; box-shadow: 0 0 0 5px #fff3bf; } 100% { background: transparent; box-shadow: none; } }
@media (max-width: 640px) {
  .bn-block-column-list { flex-direction: column; }
}
@media (max-width: 980px) {
  .document-layout { display: flex; flex-direction: column; }
  .document-layout main { padding: 20px 12px 80px; }
  .document-outline { position: static; order: -1; width: 100%; margin-top: 20px; max-height: 35vh; }
}
@media print { .document-layout { display: block; } .document-outline { display: none; } .document-layout main { width: 100%; padding: 0; } .bn-editor { padding-inline: 0; } a { color: inherit; } }
@media print { .split-pane-right-scroll { height: auto; max-height: none; overflow: visible; } .split-pane { break-inside: auto; } }
`;

// The exported document must work offline without the React application.
const OUTLINE_SCRIPT = `
(() => {
  const outline = document.querySelector(".document-outline");
  const links = Array.from(outline?.querySelectorAll("nav a") ?? []);
  const entries = links.map(link => ({
    link,
    target: document.getElementById(decodeURIComponent(link.hash.slice(1)))
  })).filter(entry => entry.target);
  let frame = 0;
  const setToggle = (wrapper, expanded) => {
    wrapper.setAttribute("data-show-children", String(expanded));
    wrapper.querySelector(".bn-toggle-button")?.setAttribute("aria-expanded", String(expanded));
    schedule();
  };
  document.querySelectorAll(".bn-toggle-wrapper").forEach(wrapper => {
    const button = wrapper.querySelector(".bn-toggle-button");
    if (!button) return;
    button.setAttribute("aria-label", "折叠或展开");
    button.setAttribute("aria-expanded", wrapper.getAttribute("data-show-children") !== "false" ? "true" : "false");
    button.addEventListener("click", () => {
      const expanded = wrapper.getAttribute("data-show-children") !== "false";
      setToggle(wrapper, !expanded);
    });
  });
  const update = () => {
    frame = 0;
    const visible = entries.filter(entry => {
      if (!entry.target.getClientRects().length) return false;
      const rect = entry.target.getBoundingClientRect();
      for (let parent = entry.target.parentElement; parent; parent = parent.parentElement) {
        if (!parent.matches(".split-pane-right-scroll")) continue;
        const bounds = parent.getBoundingClientRect();
        if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) return false;
      }
      return true;
    });
    let active = visible[0];
    for (const entry of visible) {
      const rect = entry.target.getBoundingClientRect();
      const scroll = entry.target.closest(".split-pane-right-scroll");
      const bounds = scroll?.getBoundingClientRect();
      const threshold = bounds ? Math.max(100, bounds.top + 24) : 100;
      if (rect.top <= threshold && (!bounds || (bounds.top < innerHeight && bounds.bottom > 0))) active = entry;
    }
    const root = document.documentElement;
    if (root.scrollHeight > innerHeight && scrollY + innerHeight >= root.scrollHeight - 2) {
      active = visible[visible.length - 1];
    }
    for (const entry of entries) {
      if (entry === active) entry.link.setAttribute("aria-current", "location");
      else entry.link.removeAttribute("aria-current");
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const reveal = hash => {
    let id;
    try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") parent.open = true;
      const toggle = parent.querySelector(":scope > .bn-block-content .bn-toggle-wrapper[data-show-children='false']");
      if (toggle) setToggle(toggle, true);
    }
    const panes = [];
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      if (parent.matches(".split-pane")) panes.unshift(parent);
    }
    if (panes.length) {
      panes[0].scrollIntoView({ block: "start" });
      // Position nested targets inside their own scrolling column without
      // moving the document past the split pane's top edge.
      let child = target;
      for (let parent = target.parentElement; parent; parent = parent.parentElement) {
        if (!parent.matches(".split-pane-right-scroll")) continue;
        parent.scrollTop += child.getBoundingClientRect().top - parent.getBoundingClientRect().top - parent.clientTop;
        child = parent;
      }
      if (child === target) target.scrollIntoView({ block: "nearest" });
    } else target.scrollIntoView({ block: "start" });
    target.classList.remove("block-link-highlight");
    void target.offsetWidth;
    target.classList.add("block-link-highlight");
    schedule();
  };
  document.addEventListener("click", event => {
    const link = event.target.closest("a");
    if (!link || !link.getAttribute("href")?.startsWith("#block=")) return;
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (location.hash !== link.hash) history.pushState(null, "", link.hash);
    reveal(link.hash);
  });
  window.addEventListener("hashchange", () => reveal(location.hash));
  window.addEventListener("scroll", schedule, { passive: true });
  document.addEventListener("scroll", schedule, { passive: true, capture: true });
  window.addEventListener("resize", schedule);
  document.addEventListener("toggle", schedule, true);
  document.addEventListener("load", schedule, true);
  if (location.hash) reveal(location.hash);
  update();
})();
`;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const CANVAS_VIEWER = `
<dialog class="canvas-viewer" aria-label="查看画布">
  <header>
    <input type="range" min="1" max="4" step="0.1" value="1" aria-label="画布缩放">
    <button type="button" aria-label="关闭画布" title="关闭画布">×</button>
  </header>
  <div class="canvas-viewer-scroll"><img alt="画布放大预览"></div>
</dialog>
<script>
(() => {
  const dialog = document.querySelector(".canvas-viewer");
  const image = dialog.querySelector("img");
  const zoom = dialog.querySelector("input");
  document.querySelectorAll(".canvas-export-button").forEach(button => {
    button.addEventListener("click", () => {
      image.src = button.querySelector("img").src;
      image.style.width = "100%";
      zoom.value = "1";
      dialog.showModal();
      dialog.querySelector(".canvas-viewer-scroll").scrollTo(0, 0);
    });
  });
  zoom.addEventListener("input", () => { image.style.width = Number(zoom.value) * 100 + "%"; });
  dialog.querySelector("button").addEventListener("click", () => dialog.close());
})();
</script>`;

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败。"));
    reader.readAsDataURL(blob);
  });

const inlineRemoteImages = async (
  root: ParentNode,
): Promise<string[]> => {
  const externalImages: string[] = [];
  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img[src]"));

  await Promise.all(
    images.map(async (image) => {
      const source = image.getAttribute("src");
      if (!source || !/^https?:\/\//i.test(source)) {
        return;
      }

      try {
        const response = await fetch(source);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        image.setAttribute("src", await blobToDataUrl(await response.blob()));
      } catch {
        externalImages.push(source);
      }
    }),
  );

  return externalImages;
};

const flattenBlocks = (blocks: readonly Block[]): Block[] =>
  blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);

const addBlockAnchors = (root: ParentNode, blocks: readonly Block[]): void => {
  const orderedBlocks = flattenBlocks(blocks);
  const elements = root.querySelectorAll<HTMLElement>(".bn-block-outer");

  elements.forEach((element, index) => {
    const blockId = element.dataset.id ?? orderedBlocks[index]?.id;
    if (blockId) {
      element.id = `block=${blockId}`;
    }
  });

  root
    .querySelectorAll<HTMLAnchorElement>('a[href^="#block="]')
    .forEach((link) => {
      link.removeAttribute("target");
      link.removeAttribute("rel");
    });
};

const preserveTableWidths = (root: ParentNode): void => {
  for (const table of root.querySelectorAll<HTMLTableElement>('.bn-block-content[data-content-type="table"] table')) {
    const columns = Array.from(table.querySelectorAll<HTMLTableColElement>(":scope > colgroup > col"));
    const widths = columns.map(column => column.style.width);
    if (widths.length && widths.every(width => /^\d+(?:\.\d+)?px$/.test(width))) {
      table.style.width = `${widths.reduce((sum, width) => sum + Number.parseFloat(width), 0)}px`;
    }
  }
};

const exportSplitPanes = (root: ParentNode, blocks: readonly Block[]): void => {
  const elements = new Map(Array.from(
    root.querySelectorAll<HTMLElement>(".bn-block-outer[id]"),
    element => [element.id, element] as const,
  ));
  const dimension = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : fallback;
  // Full HTML keeps each block's child group separate from its content.
  // Move those existing nodes so native markup, anchors and media survive.
  for (const block of flattenBlocks(blocks)) {
    if ((block.type as string) !== "splitPane") continue;
    const props = block.props as Record<string, unknown>;
    const outer = elements.get(`block=${block.id}`);
    const columns = block.children;
    if (!outer || columns.length !== 2 ||
      columns.some((column, index) => (column.type as string) !== "splitColumn" ||
        (column.props as Record<string, unknown>).side !== (index === 0 ? "left" : "right"))) {
      throw new Error("分栏结构无效，HTML 导出已中止。");
    }
    const pane = document.createElement("div");
    pane.className = "split-pane";
    const width = dimension(props.leftWidth, 50, 25, 75);
    pane.style.setProperty("--split-left-width", `${width}fr`);
    pane.style.setProperty("--split-right-width", `${100 - width}fr`);
    pane.style.setProperty("--split-right-height", props.rightHeight === 0
      ? "auto" : `${dimension(props.rightHeight, 400, 160, 1200)}px`);
    for (const [index, column] of columns.entries()) {
      const element = elements.get(`block=${column.id}`);
      const group = element && Array.from(element.querySelectorAll<HTMLElement>(".bn-block-group"))
        .find(candidate => candidate.closest(".bn-block-outer") === element);
      if (!element || !outer.contains(element) || (!group && column.children.length)) {
        throw new Error("未能找到分栏内容，HTML 导出已中止。");
      }
      const content = document.createElement("div");
      content.className = index === 0 ? "split-pane-left" : "split-pane-right-scroll";
      if (group) content.append(group);
      element.replaceChildren(content);
      pane.append(element);
    }
    outer.replaceChildren(pane);
  }
};

export interface StandaloneHtmlResult {
  html: string;
  externalImages: string[];
}

export const buildStandaloneHtml = async (
  editor: BlockNoteEditor,
  blocks: readonly Block[],
): Promise<StandaloneHtmlResult> => {
  const documentTitle = getDocumentTitle(blocks) || "未命名文档";
  const container = serializeScientificContent(blocks, items => editor.blocksToFullHTML(items));
  addBlockAnchors(container, blocks);
  preserveTableWidths(container);
  const headingNumbers = getHeadingNumbers(blocks);
  const blockElements = new Map(Array.from(
    container.querySelectorAll<HTMLElement>(".bn-block-outer[id]"),
    element => [element.id, element] as const,
  ));
  for (const [id, number] of headingNumbers) {
    const outer = blockElements.get(`block=${id}`);
    const heading = outer?.querySelector<HTMLElement>("h2,h3,h4,h5,h6");
    if (!heading || heading.closest(".bn-block-outer") !== outer) continue;
    const prefix = document.createElement("span");
    prefix.className = "heading-auto-number";
    prefix.setAttribute("aria-hidden", "true");
    prefix.textContent = `${number} `;
    heading.prepend(prefix);
  }
  exportSplitPanes(container, blocks);
  await exportScientificContent(container, blocks);
  const canvases = new Map<string, { scene: string; previewWidth?: unknown; textAlignment?: unknown }>(flattenBlocks(blocks).flatMap(block =>
    block.type === "canvas" ? [[`block=${block.id}`, block.props] as const] : [],
  ));
  for (const element of container.querySelectorAll<HTMLElement>('[data-content-type="canvas"]')) {
    const source = canvases.get(element.closest(".bn-block-outer")?.id ?? "");
    if (source === undefined) throw new Error("未能找到画布数据，HTML 导出已中止。");
    const image = document.createElement("img");
    image.src = await canvasSvg(source.scene);
    image.alt = "画布";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "canvas-export-button";
    button.setAttribute("aria-label", "放大查看画布");
    button.append(image);
    const figure = document.createElement("figure");
    if (typeof source.previewWidth === "number" && Number.isFinite(source.previewWidth) && source.previewWidth > 0) {
      figure.style.width = `${source.previewWidth}px`;
      figure.style.maxWidth = "100%";
      figure.style.marginLeft = "0";
      figure.style.marginRight = "0";
    }
    if (source.textAlignment === "center" || source.textAlignment === "right") {
      figure.style.marginLeft = "auto";
      figure.style.marginRight = source.textAlignment === "center" ? "auto" : "0";
    }
    figure.append(button);
    element.replaceChildren(figure);
    element.removeAttribute("data-scene");
  }
  const externalImages = await inlineRemoteImages(container);
  const anchorIds = new Set(
    Array.from(container.querySelectorAll<HTMLElement>(".bn-block-outer[id]"), element => element.id),
  );
  const outlineItems = getOutlineItems(blocks).filter(item => anchorIds.has(`block=${item.id}`));
  const outline = outlineItems.length
    ? `<aside class="document-outline" aria-label="文档大纲">
    <details open>
      <summary>大纲</summary>
      <nav aria-label="标题导航">${outlineItems.map(item =>
        `<a href="#block=${escapeHtml(encodeURIComponent(item.id))}" style="--depth:${Math.min(5, Math.max(0, item.level - 1))}">${item.number ? `${escapeHtml(item.number)} ` : ""}${escapeHtml(item.text)}</a>`,
      ).join("\n")}</nav>
    </details>
  </aside>`
    : "";

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(documentTitle)}</title>
  <style>${EXPORT_STYLES}</style>
</head>
<body>
  <div class="document-layout">
  ${outline}
  <main class="bn-container">
    <article class="bn-editor">${container.innerHTML}</article>
  </main>
  </div>
  <script>${OUTLINE_SCRIPT}</script>
  ${canvases.size ? CANVAS_VIEWER : ""}
</body>
</html>`;

  return { html, externalImages };
};
