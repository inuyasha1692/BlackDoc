import type { BlackDocBlock } from "./editor/schema";
import { invoke } from "@tauri-apps/api/core";

export interface DesktopFile {
  path: string;
  name: string;
}

export interface DesktopDraft {
  id: string;
  blocks: BlackDocBlock[];
  updatedAt: string;
}

interface DesktopBootstrap {
  document: (DesktopFile & { blocks: BlackDocBlock[] }) | null;
  draft: DesktopDraft | null;
}

let bootstrap: Promise<DesktopBootstrap> | undefined;
export const bootstrapDesktop = (): Promise<DesktopBootstrap> =>
  (bootstrap ??= invoke<DesktopBootstrap>("desktop_bootstrap"));

export const newDesktopWindow = () => invoke<void>("desktop_new_window");
export const openDesktopWindow = (reuseCurrent = false) =>
  invoke<(DesktopFile & { blocks: BlackDocBlock[] }) | null>("desktop_open_window", { reuseCurrent });
export const closeDesktopWindow = () => invoke<void>("desktop_close_window");
export const prepareDesktopUpdate = () => invoke<void>("desktop_prepare_update");
export interface DesktopMarkdown {
  name: string;
  markdown: string;
  warnings: string[];
}
export const importDesktopMarkdown = () =>
  invoke<DesktopMarkdown | null>("desktop_import_markdown");
export const detachDesktopDocument = () =>
  invoke<void>("desktop_detach_document");

export const saveDesktopDocument = (
  blocks: readonly BlackDocBlock[],
  path: string | null,
  suggestedName: string,
  saveAs: boolean,
) => invoke<DesktopFile | null>("desktop_save_document", {
  blocks, path, suggestedName, saveAs,
});

export const exportDesktopHtml = (html: string, suggestedName: string) =>
  invoke<DesktopFile | null>("desktop_export_html", { html, suggestedName });

export const openDesktopExport = () => invoke<void>("desktop_open_export");

export const openExternalLink = async (url: string): Promise<void> => {
  if (!/^(https?:|mailto:)/i.test(url)) return;
  await invoke("desktop_open_external", { url });
};
