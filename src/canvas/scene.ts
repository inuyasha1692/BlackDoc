import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

export interface CanvasScene {
  version: 1;
  elements: readonly ExcalidrawElement[];
  appState: Pick<AppState, "viewBackgroundColor">;
  files: BinaryFiles;
}

export const emptyScene = (): CanvasScene => ({
  version: 1,
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function parseScene(source: string): CanvasScene {
  if (!source) return emptyScene();
  const value: unknown = JSON.parse(source);
  if (
    !isRecord(value) || value.version !== 1 || !Array.isArray(value.elements) ||
    !isRecord(value.appState) || typeof value.appState.viewBackgroundColor !== "string" ||
    !isRecord(value.files) || !value.elements.every(element =>
      isRecord(element) && typeof element.id === "string" && typeof element.type === "string" &&
      typeof element.x === "number" && Number.isFinite(element.x) &&
      typeof element.y === "number" && Number.isFinite(element.y),
    )
  ) {
    throw new Error("画布数据无效，无法打开或导出。");
  }
  for (const file of Object.values(value.files)) {
    if (!isRecord(file) || typeof file.dataURL !== "string" ||
      !/^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml|avif);/i.test(file.dataURL)) {
      throw new Error("画布图片必须内嵌在文档中。");
    }
  }
  return value as unknown as CanvasScene;
}

export function serializeScene(
  elements: readonly ExcalidrawElement[],
  appState: Pick<AppState, "viewBackgroundColor">,
  files: BinaryFiles,
): string {
  const active = elements.filter(element => !element.isDeleted);
  const imageIds = new Set<string>(active.flatMap(element =>
    element.type === "image" && element.fileId ? [element.fileId] : [],
  ));
  return JSON.stringify({
    version: 1,
    elements: active,
    appState: { viewBackgroundColor: appState.viewBackgroundColor },
    files: Object.fromEntries(Object.entries(files).filter(([id]) => imageIds.has(id))),
  } satisfies CanvasScene);
}
