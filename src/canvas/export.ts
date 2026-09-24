import "./assets";
import { parseScene } from "./scene";

export async function canvasSvg(source: string): Promise<string> {
  const scene = parseScene(source);
  for (const element of scene.elements) {
    if (element.type === "image" && !element.isDeleted &&
      (!element.fileId || !scene.files[element.fileId])) {
      throw new Error("画布中有缺失的图片，无法完整导出。");
    }
  }
  const { exportToSvg } = await import("@excalidraw/excalidraw");
  const svg = await exportToSvg({
    elements: scene.elements.filter(element => !element.isDeleted),
    appState: { ...scene.appState, exportBackground: true, exportWithDarkMode: false },
    files: scene.files,
    exportPadding: 24,
  });
  // Render SVG as an image, never as active markup in the document.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
}
