import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ClipboardData } from "@excalidraw/excalidraw/clipboard";
import type { FileId } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

function embeddedImage(clipboard: DataTransfer | null) {
  const html = clipboard?.getData("blocknote/html") || clipboard?.getData("text/html");
  if (!html) return null;
  const root = new DOMParser().parseFromString(html, "text/html").body;
  const images = Array.from(root.querySelectorAll<HTMLElement>(
    '[data-content-type="image"], figure, img',
  )).filter(element => !element.parentElement?.closest(
    '[data-content-type="image"], figure',
  ));
  if (images.length !== 1) return null;
  const element = images[0];
  const block = element.matches('[data-content-type="image"], figure') ? element : null;
  const image = element instanceof HTMLImageElement ? element : element.querySelector("img");
  const url = block?.getAttribute("data-url") || image?.getAttribute("src") || "";
  const format = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml|avif);/i.exec(url)?.[1].toLowerCase();
  if (!format) return null;
  const width = block?.getAttribute("data-preview-width") || image?.style.width || image?.getAttribute("width") || "";
  // Captions belong to the copied image; other text/blocks must use normal paste.
  element.remove();
  if (root.textContent?.trim() || root.querySelector("[data-content-type],img,table,video,audio,iframe,math")) return null;
  return {
    url,
    mimeType: `image/${format === "jpg" ? "jpeg" : format}` as BinaryFileData["mimeType"],
    width: /^\d+(?:\.\d+)?(?:px)?$/.test(width) ? Number.parseFloat(width) : 0,
  };
}

function imageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) reject(new Error("图片尺寸无效"));
      else resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => reject(new Error("图片无法读取"));
    image.src = url;
  });
}

export async function pasteEmbeddedImage(data: ClipboardData, event: ClipboardEvent | null): Promise<boolean> {
  if (data.elements || data.mixedContent) return true;
  const image = embeddedImage(event?.clipboardData ?? null);
  if (!image) return true;
  // Excalidraw ignores data-URL images in HTML and falls back to Markdown text.
  // Replace that payload so its native paste path handles placement and undo.
  delete data.text;
  delete data.spreadsheet;
  delete data.errorMessage;
  try {
    const dimensions = await imageDimensions(image.url);
    const width = image.width > 0 ? image.width : dimensions.width;
    const id = crypto.randomUUID() as FileId;
    data.elements = convertToExcalidrawElements([{
      type: "image", x: 0, y: 0, width,
      height: width * dimensions.height / dimensions.width,
      fileId: id, status: "saved", scale: [1, 1],
    }]);
    data.files = { [id]: {
      id, dataURL: image.url as BinaryFileData["dataURL"],
      mimeType: image.mimeType, created: Date.now(),
    } };
  } catch {
    data.errorMessage = "无法粘贴图片，请重新复制图片后重试。";
  }
  return true;
}