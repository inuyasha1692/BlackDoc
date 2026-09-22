import type { Block, BlockNoteEditor } from "@blocknote/core";
import { getDocumentTitle } from "../editor/document";

const EXPORT_STYLES = `
:root { color-scheme: light; font-family: Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; color: #202124; background: #fff; line-height: 1.7; }
main { width: min(100% - 40px, 760px); margin: 48px auto 80px; }
.bn-block-group { display: flex; flex-direction: column; gap: 2px; }
.bn-block-outer { position: relative; }
.bn-block-outer:target { scroll-margin-top: 24px; animation: block-link-export-highlight 1.8s ease-out; }
.bn-block-content { min-height: 1.5em; }
.bn-inline-content { margin: 0; overflow-wrap: anywhere; }
h1.bn-inline-content { margin: 0 0 22px; font-size: 2.35rem; line-height: 1.2; }
h2.bn-inline-content { margin: 32px 0 10px; font-size: 1.75rem; line-height: 1.3; }
h3.bn-inline-content { margin: 26px 0 8px; font-size: 1.38rem; line-height: 1.35; }
h4.bn-inline-content, h5.bn-inline-content, h6.bn-inline-content { margin: 22px 0 6px; line-height: 1.4; }
p.bn-inline-content { margin: 5px 0; }
a { color: #0969da; text-decoration-thickness: 1px; text-underline-offset: 3px; }
blockquote { margin: 16px 0; padding: 3px 18px; border-left: 3px solid #8b949e; color: #57606a; }
pre { overflow: auto; padding: 16px; border: 1px solid #d8dee4; border-radius: 6px; background: #f6f8fa; }
code { font-family: "SFMono-Regular", Consolas, monospace; font-size: .9em; }
table { width: 100%; margin: 18px 0; border-collapse: collapse; }
th, td { padding: 8px 10px; border: 1px solid #d0d7de; text-align: left; vertical-align: top; }
img, video { display: block; max-width: 100%; height: auto; margin: 16px auto; }
audio { width: 100%; margin: 12px 0; }
figure { margin: 18px 0; }
figcaption { margin-top: 6px; color: #656d76; font-size: .875rem; text-align: center; }
hr { margin: 28px 0; border: 0; border-top: 1px solid #d8dee4; }
ul, ol { padding-left: 28px; }
details { margin: 6px 0; }
@keyframes block-link-export-highlight { 0%, 45% { background: #fff3bf; box-shadow: 0 0 0 5px #fff3bf; } 100% { background: transparent; box-shadow: none; } }
@media (max-width: 640px) { main { width: min(100% - 28px, 760px); margin-top: 28px; } h1.bn-inline-content { font-size: 1.9rem; } }
@media print { main { width: 100%; margin: 0; } a { color: inherit; } }
`;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

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

export interface StandaloneHtmlResult {
  html: string;
  externalImages: string[];
}

export const buildStandaloneHtml = async (
  editor: BlockNoteEditor,
  blocks: readonly Block[],
): Promise<StandaloneHtmlResult> => {
  const documentTitle = getDocumentTitle(blocks) || "未命名文档";
  const container = document.createElement("div");
  container.innerHTML = editor.blocksToFullHTML([...blocks]);
  addBlockAnchors(container, blocks);
  const externalImages = await inlineRemoteImages(container);

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(documentTitle)}</title>
  <style>${EXPORT_STYLES}</style>
</head>
<body>
  <main class="bn-container">
    <article class="bn-editor">${container.innerHTML}</article>
  </main>
</body>
</html>`;

  return { html, externalImages };
};

export const downloadHtml = (html: string, fileName: string): void => {
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
