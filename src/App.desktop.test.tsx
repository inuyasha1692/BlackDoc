import type { Block } from "@blocknote/core";
import { invoke } from "@tauri-apps/api/core";
import { applyAiDocument } from "./editor/aiDocument";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { AUTO_SAVE_DELAY_MS } from "./App";
import exampleDocumentSource from "../files/BlackDoc功能展示示例.bdoc?raw";
import {
  bootstrapDesktop,
  closeDesktopWindow,
  detachDesktopDocument,
  exportDesktopHtml,
  importDesktopMarkdown,
  newDesktopWindow,
  openDesktopWindow,
  openDesktopExport,
  prepareDesktopUpdate,
  saveDesktopDocument,
  type DesktopFile,
} from "./desktop";
import { importMarkdownBlocks } from "./editor/markdownImport";
import { buildStandaloneHtml } from "./export/standaloneHtml";
import { deleteDraft, writeDraft } from "./storage/draftStore";
import { checkForUpdate } from "./updates";
import { check as checkSignedUpdate } from "@tauri-apps/plugin-updater";
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";

const harness = vi.hoisted(() => ({
  editor: {
    document: [] as Block[],
    replaceBlocks: vi.fn(),
    transact: vi.fn(),
    focus: vi.fn(),
    getExtension: vi.fn(() => null),
    isEditable: true,
  },
  closeListeners: new Set<() => void>(),
  listen: vi.fn(),
  setTitle: vi.fn(),
  destroy: vi.fn(),
  closeCanvas: vi.fn(),
}));

vi.mock("@blocknote/core/locales", () => ({
  zh: { formatting_toolbar: { code: {} } },
}));
vi.mock("@blocknote/core/extensions", async (importOriginal) => ({
  ...await importOriginal<typeof import("@blocknote/core/extensions")>(),
  insertOrUpdateBlockForSlashMenu: vi.fn(),
}));
vi.mock("./updates", () => ({
  checkForUpdate: vi.fn(async () => ({ kind: "unavailable" })),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./editor/aiDocument", () => ({ applyAiDocument: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@blocknote/diagram-block", () => ({
  getDiagramSlashMenuItems: () => [],
  locales: { zh: {} },
}));
vi.mock("@blocknote/math-block", () => ({
  getMathSlashMenuItems: () => [],
  locales: { zh: {} },
}));
vi.mock("@blocknote/math-block", () => ({ getMathSlashMenuItems: () => [], locales: { zh: {} } }));
vi.mock("@blocknote/diagram-block", () => ({ getDiagramSlashMenuItems: () => [], locales: { zh: {} } }));
vi.mock("./editor/schema", () => ({ blackDocSchema: {} }));
vi.mock("./canvas/CanvasPreview", () => ({ CanvasEditorHost: () => null }));
vi.mock("@blocknote/react", () => ({
  useCreateBlockNote: () => harness.editor,
  FormattingToolbarController: () => null,
  LinkToolbarController: () => null,
  SideMenuController: () => null,
  SuggestionMenuController: () => null,
  getDefaultReactSlashMenuItems: () => [],
  TableHandlesController: () => null,
}));
vi.mock("@blocknote/mantine", () => ({
  BlockNoteView: ({ editable, onChange, theme }: { editable: boolean; theme: string; onChange: (editor: unknown, context: { getChanges: () => unknown[] }) => void }) => (
    <textarea
      aria-label="Document"
      className="ProseMirror"
      data-editor-theme={theme}
      disabled={!editable}
      value={JSON.stringify(harness.editor.document)}
      onChange={(event) => {
        harness.editor.document = JSON.parse(event.target.value) as Block[];
        onChange(harness.editor, { getChanges: () => [{}] });
      }}
      onFocus={() => onChange(harness.editor, { getChanges: () => [] })}
    />
  ),
}));
vi.mock("./components/BlockLinkControls", () => ({ BlackDocFormattingToolbar: () => null }));
vi.mock("./components/BlackDocLinkToolbar", () => ({ BlackDocLinkToolbar: () => null }));
vi.mock("./components/BlockSideMenu", () => ({ BlackDocSideMenuController: () => null }));
vi.mock("./components/DocumentOutline", () => ({ DocumentOutline: () => null }));
vi.mock("./components/FindReplaceBar", () => ({ FindReplaceBar: () => <div role="search" aria-label="查找替换" /> }));
vi.mock("./editor/findAndReplace", () => ({ FindAndReplaceExtension: () => ({}) }));
vi.mock("./editor/preserveHeadingLevel", () => ({ PreserveHeadingLevelExtension: () => ({}) }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    listen: harness.listen,
    setTitle: harness.setTitle,
    destroy: harness.destroy,
  }),
}));
vi.mock("./desktop", () => ({
  bootstrapDesktop: vi.fn(),
  closeDesktopWindow: vi.fn(),
  newDesktopWindow: vi.fn(),
  openDesktopWindow: vi.fn(),
  importDesktopMarkdown: vi.fn(),
  detachDesktopDocument: vi.fn(),
  saveDesktopDocument: vi.fn(),
  exportDesktopHtml: vi.fn(),
  openDesktopExport: vi.fn(),
  openExternalLink: vi.fn(),
  prepareDesktopUpdate: vi.fn(),
}));
vi.mock("./export/standaloneHtml", () => ({ buildStandaloneHtml: vi.fn() }));
vi.mock("./editor/markdownImport", () => ({
  importMarkdownBlocks: vi.fn(),
}));
vi.mock("./storage/draftStore", () => ({
  writeDraft: vi.fn(),
  deleteDraft: vi.fn(),
}));

function documentWithTitle(title: string): Block[] {
  return [{
    id: "title",
    type: "heading",
    props: { level: 1, isToggleable: true },
    content: [{ type: "text", text: title, styles: {} }],
    children: [],
  }] as unknown as Block[];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const original = documentWithTitle("Original");
const edited = documentWithTitle("Edited");
const file = { path: "C:/documents/original.bdoc", name: "original.bdoc" };

async function mountApp() {
  await act(async () => { render(<App />); });
}

async function clickButton(name: string) {
  const directButton = screen.queryByRole("button", { name });
  if (directButton) {
    await act(async () => { fireEvent.click(directButton); });
    return;
  }

  const menuName = name === "导入 MD"
    ? "导入 Markdown"
    : name === "深色模式"
      ? screen.getByRole("textbox", { name: "Document" }).getAttribute("data-editor-theme") === "dark"
        ? "切换到浅色模式"
        : "切换到深色模式"
      : name;
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: menuName }));
  });
}
async function editDocument(blocks = edited) {
  await act(async () => {
    fireEvent.change(screen.getByRole("textbox", { name: "Document" }), {
      target: { value: JSON.stringify(blocks) },
    });
  });
}

async function requestClose() {
  expect(harness.closeListeners.size).toBe(1);
  await act(async () => {
    for (const listener of [...harness.closeListeners]) listener();
  });
}

function expectDocument(blocks: Block[]) {
  expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue(JSON.stringify(blocks));
  expect(harness.editor.document).toEqual(blocks);
}

function expectNotClosed() {
  expect(closeDesktopWindow).not.toHaveBeenCalled();
  expect(harness.destroy).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem("blackdoc:first-launch-completed", "true");
  localStorage.setItem("blackdoc:outline-collapsed", "false");
  harness.closeListeners.clear();
  window.addEventListener("blackdoc-close-canvas", harness.closeCanvas);
  harness.editor.document = documentWithTitle("");
  harness.editor.isEditable = true;
  harness.editor.replaceBlocks.mockImplementation((_previous: Block[], blocks: Block[]) => {
    harness.editor.document = structuredClone(blocks);
  });
  harness.editor.transact.mockImplementation(callback => callback({ setMeta: vi.fn() }));
  harness.listen.mockImplementation(async (event: string, listener: () => void) => {
    expect(event).toBe("desktop-close-requested");
    harness.closeListeners.add(listener);
    return () => { harness.closeListeners.delete(listener); };
  });
  harness.setTitle.mockResolvedValue(undefined);
  vi.mocked(bootstrapDesktop).mockResolvedValue({ document: { ...file, blocks: original }, draft: null });
  vi.mocked(saveDesktopDocument).mockResolvedValue(file);
  vi.mocked(newDesktopWindow).mockResolvedValue(undefined);
  vi.mocked(openDesktopWindow).mockResolvedValue(null);
  vi.mocked(importDesktopMarkdown).mockResolvedValue(null);
  vi.mocked(detachDesktopDocument).mockResolvedValue(undefined);
  vi.mocked(closeDesktopWindow).mockResolvedValue(undefined);
  vi.mocked(deleteDraft).mockResolvedValue(undefined);
  vi.mocked(writeDraft).mockResolvedValue(undefined);
  vi.mocked(prepareDesktopUpdate).mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => { cleanup(); });
  window.removeEventListener("blackdoc-close-canvas", harness.closeCanvas);
  expect(harness.closeListeners.size).toBe(0);
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("desktop App lifecycle", () => {
  it("applies an AI request from the live connection, persists and acknowledges it", async () => {
    let delivered = false;
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "desktop_ai_enable") return (args as { enabled: boolean }).enabled ? "C:/temp/connection" : null;
      if (command === "desktop_ai_exchange") {
        const snapshot = (args as { snapshot: { revision: string } }).snapshot;
        if (!delivered) {
          delivered = true;
          return { id: "live-request", revision: snapshot.revision, blocks: edited };
        }
        return null;
      }
      throw new Error(`Unexpected command ${command}`);
    });
    vi.mocked(applyAiDocument).mockImplementation((_editor, request, revision) => {
      expect((request as { revision: string }).revision).toBe(revision);
      fireEvent.change(screen.getByRole("textbox", { name: "Document" }), {
        target: { value: JSON.stringify(edited) },
      });
    });
    await mountApp();
    await clickButton("启用 AI 文档连接");
    expectDocument(edited);
    expect(screen.getByRole("button", { name: "AI 文档已连接，复制连接目录" })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(saveDesktopDocument).toHaveBeenCalledWith(edited, file.path, file.name, false);
    expect(invoke).toHaveBeenCalledWith("desktop_ai_exchange", expect.objectContaining({
      response: expect.objectContaining({ id: "live-request", ok: true }),
    }));
    await clickButton("关闭 AI 文档连接");
    expect(screen.queryByRole("button", { name: "AI 文档已连接，复制连接目录" })).not.toBeInTheDocument();
    const calls = vi.mocked(invoke).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(vi.mocked(invoke).mock.calls).toHaveLength(calls);
  });
  it("opens the example once on first launch without saving over the bundled file", async () => {
    localStorage.removeItem("blackdoc:first-launch-completed");
    vi.mocked(bootstrapDesktop).mockResolvedValue({ document: null, draft: null });
    await mountApp();
    const example = JSON.parse(exampleDocumentSource) as Block[];
    expectDocument(example);
    expect(localStorage.getItem("blackdoc:first-launch-completed")).toBe("true");
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS); });
    expect(writeDraft).not.toHaveBeenCalled();
    expect(saveDesktopDocument).not.toHaveBeenCalled();
    await clickButton("保存");
    expect(saveDesktopDocument).toHaveBeenCalledWith(example, null, "未命名文档.bdoc", false);
    await act(async () => { cleanup(); });
    harness.editor.document = documentWithTitle("");
    await mountApp();
    expect(harness.editor.document[0].id).not.toBe("demo-document-title");
  });

  it("prioritizes a document or recovery draft on first launch", async () => {
    localStorage.removeItem("blackdoc:first-launch-completed");
    await mountApp();
    expectDocument(original);
    await act(async () => { cleanup(); });
    localStorage.removeItem("blackdoc:first-launch-completed");
    vi.mocked(bootstrapDesktop).mockResolvedValue({
      document: null,
      draft: { id: "first-launch-draft", blocks: edited, updatedAt: "2026-09-28T00:00:00Z" },
    });
    await mountApp();
    expect(screen.getByRole("dialog", { name: "发现未保存草稿" })).toBeInTheDocument();
    expect(harness.editor.document[0].id).not.toBe("demo-document-title");
    await clickButton("恢复草稿");
    expectDocument(edited);
  });

  it.each([file, null])("shows manual save progress until completion or cancellation (%s)", async (result) => {
    const saving = deferred<DesktopFile | null>();
    vi.mocked(saveDesktopDocument).mockReturnValue(saving.promise);
    await mountApp();
    expect(screen.queryByRole("status", { name: "保存进度" })).not.toBeInTheDocument();
    await clickButton("保存");
    expect(screen.getByRole("status", { name: "保存进度" })).toHaveTextContent("正在保存…");
    await act(async () => { saving.resolve(result); });
    expect(screen.queryByRole("status", { name: "保存进度" })).not.toBeInTheDocument();
  });

  it.each([true, false])("shows automatic save progress for file or draft (%s)", async (hasFile) => {
    const saving = deferred<DesktopFile | null>();
    const draft = deferred<void>();
    if (!hasFile) vi.mocked(bootstrapDesktop).mockResolvedValue({ document: null, draft: null });
    vi.mocked(saveDesktopDocument).mockReturnValue(saving.promise);
    vi.mocked(writeDraft).mockReturnValue(draft.promise);
    await mountApp();
    await editDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS); });
    expect(screen.getByRole("status", { name: "保存进度" })).toHaveTextContent(hasFile ? "正在保存…" : "正在暂存草稿…");
    await editDocument(documentWithTitle("Further edits"));
    expect(screen.getByRole("status", { name: "保存进度" })).toBeInTheDocument();
    await act(async () => { saving.resolve(file); draft.resolve(); });
    expect(screen.queryByRole("status", { name: "保存进度" })).not.toBeInTheDocument();
  });

  it("removes save progress and reports a write failure", async () => {
    const saving = deferred<DesktopFile | null>();
    vi.mocked(saveDesktopDocument).mockReturnValue(saving.promise.then(() => { throw new Error("写入失败"); }));
    await mountApp();
    await clickButton("保存");
    expect(screen.getByRole("status", { name: "保存进度" })).toBeInTheDocument();
    await act(async () => { saving.resolve(null); });
    expect(screen.queryByRole("status", { name: "保存进度" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("写入失败");
  });

  it("downloads a signed update, saves edits, then launches the installer", async () => {
    const release = {
      kind: "available" as const,
      version: "v0.2.0",
      url: "https://github.com/inuyasha1692/BlackDoc/releases/tag/v0.2.0",
    };
    vi.mocked(checkForUpdate).mockResolvedValue(release);
    const install = vi.fn(async () => {});
    const download = vi.fn(async (onEvent: (event: { event: "Started"; data: { contentLength: number } } | { event: "Progress"; data: { chunkLength: number } }) => void) => {
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 100 } });
    });
    vi.mocked(checkSignedUpdate).mockResolvedValue({ version: "0.2.0", download, install } as never);
    await mountApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await editDocument();
    await clickButton("查看更新");
    await clickButton("下载更新");
    expect(download).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "重启并安装" })).toBeInTheDocument();
    await clickButton("重启并安装");
    expect(prepareDesktopUpdate).toHaveBeenCalledOnce();
    expect(saveDesktopDocument).toHaveBeenCalledWith(edited, file.path, file.name, false);
    expect(install).toHaveBeenCalledWith({ restartAfterInstall: true });
    expect(vi.mocked(saveDesktopDocument).mock.invocationCallOrder[0]).toBeLessThan(install.mock.invocationCallOrder[0]);
  });

  it("shows the exported HTML path and opens it with the system default app", async () => {
    const path = "C:/documents/Original.html";
    vi.mocked(buildStandaloneHtml).mockResolvedValue({ html: "<html></html>", externalImages: [] });
    vi.mocked(exportDesktopHtml).mockResolvedValue({ path, name: "Original.html" });
    vi.mocked(openDesktopExport).mockResolvedValue(undefined);
    await mountApp();

    await clickButton("导出 HTML");

    const link = screen.getByRole("button", { name: path });
    expect(screen.getByRole("alert")).toHaveTextContent("HTML 已导出。");
    expect(link).toHaveAttribute("title", path);
    await act(async () => { fireEvent.click(link); });
    expect(openDesktopExport).toHaveBeenCalledOnce();
  });

  it("does not show an HTML link when export is cancelled", async () => {
    vi.mocked(buildStandaloneHtml).mockResolvedValue({ html: "<html></html>", externalImages: [] });
    vi.mocked(exportDesktopHtml).mockResolvedValue(null);
    await mountApp();

    await clickButton("导出 HTML");

    expect(screen.queryByRole("button", { name: /\.html$/ })).not.toBeInTheDocument();
  });

  it("reports a failure when the exported HTML cannot be opened", async () => {
    const path = "C:/documents/Original.html";
    vi.mocked(buildStandaloneHtml).mockResolvedValue({ html: "<html></html>", externalImages: [] });
    vi.mocked(exportDesktopHtml).mockResolvedValue({ path, name: "Original.html" });
    vi.mocked(openDesktopExport).mockRejectedValue(new Error("文件已被移走"));
    await mountApp();
    await clickButton("导出 HTML");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: path })); });

    expect(screen.getByRole("alert")).toHaveTextContent("文件已被移走");
    expect(screen.queryByRole("button", { name: path })).not.toBeInTheDocument();
  });

  it("opens the bundled example as an unsaved document with no bound file path", async () => {
    await mountApp();
    const example = JSON.parse(exampleDocumentSource) as Block[];

    await clickButton("功能示例");

    expect(detachDesktopDocument).toHaveBeenCalledOnce();
    expectDocument(example);
    expect(screen.getByRole("status")).toHaveTextContent("未保存");
    expect(deleteDraft).toHaveBeenCalledOnce();
    expect(saveDesktopDocument).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS); });
    expect(writeDraft).toHaveBeenCalledWith(example);

    await clickButton("保存");
    expect(saveDesktopDocument).toHaveBeenCalledWith(example, null, "未命名文档.bdoc", false);
  });

  it("asks before replacing a document with unsaved changes with the example", async () => {
    await mountApp();
    await editDocument();

    await clickButton("功能示例");
    expect(screen.getByRole("dialog", { name: "打开功能示例" })).toBeInTheDocument();
    expectDocument(edited);
    expect(detachDesktopDocument).not.toHaveBeenCalled();

    await clickButton("放弃更改");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(harness.editor.document[0].id).toBe("demo-document-title");
  });

  it("imports Markdown without prompting for a path until Save is clicked", async () => {
    await mountApp();
    const imported = documentWithTitle("Imported");
    vi.mocked(importDesktopMarkdown).mockResolvedValue({
      name: "map.md", markdown: "# Imported", warnings: [],
    });
    vi.mocked(importMarkdownBlocks).mockReturnValue({ blocks: imported, warnings: [] });
    vi.mocked(saveDesktopDocument).mockResolvedValue({
      path: "C:/documents/Imported.bdoc", name: "Imported.bdoc",
    });

    await clickButton("导入 MD");

    expect(detachDesktopDocument).toHaveBeenCalledOnce();
    expect(saveDesktopDocument).not.toHaveBeenCalled();
    expectDocument(imported);
    expect(screen.getByRole("alert")).toHaveTextContent("Markdown 已导入。");
    expect(screen.queryByText("正在导入 Markdown，请稍候…")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("未保存");
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS); });
    expect(writeDraft).toHaveBeenCalledWith(imported);

    await clickButton("保存");
    expect(saveDesktopDocument).toHaveBeenCalledWith(imported, null, "未命名文档.bdoc", false);
    expect(screen.getByRole("status")).toHaveTextContent("已保存");
  });

  it("shows import feedback while reading and clears it when the picker is canceled", async () => {
    await mountApp();
    const pending = deferred<Awaited<ReturnType<typeof importDesktopMarkdown>>>();
    vi.mocked(importDesktopMarkdown).mockReturnValue(pending.promise);

    await clickButton("导入 MD");
    expect(screen.getByText("正在导入 Markdown，请稍候…")).toBeInTheDocument();

    await act(async () => { pending.resolve(null); await pending.promise; });
    expect(screen.queryByText("正在导入 Markdown，请稍候…")).not.toBeInTheDocument();
  });

  it("switches the editor theme without marking the document dirty or saving it", async () => {
    await mountApp();
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveAttribute("data-editor-theme", "light");
    await clickButton("深色模式");
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveAttribute("data-editor-theme", "dark");
    expect(localStorage.getItem("blackdoc:theme")).toBe("dark");
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expectDocument(original);
    expect(screen.getByRole("status")).toHaveTextContent("已保存");
    expect(saveDesktopDocument).not.toHaveBeenCalled();
    expect(writeDraft).not.toHaveBeenCalled();
    await clickButton("深色模式");
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveAttribute("data-editor-theme", "light");
  });

  it("uses the stored dark preference when opening a document", async () => {
    localStorage.setItem("blackdoc:theme", "dark");
    await mountApp();
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveAttribute("data-editor-theme", "dark");
    expectDocument(original);
  });

  const empty = [{
    id: "blank", type: "paragraph", props: {}, content: [], children: [],
  }] as unknown as Block[];

  async function mountEmptyApp() {
    harness.editor.document = structuredClone(empty);
    vi.mocked(bootstrapDesktop).mockResolvedValue({ document: null, draft: null });
    await mountApp();
  }

  it("restores the current document when Fast Refresh recreates the editor", async () => {
    harness.editor.document = structuredClone(empty);
    vi.mocked(bootstrapDesktop).mockResolvedValue({ document: null, draft: null });
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<App />); });
    await editDocument(original);
    const firstEditor = harness.editor;
    try {
      harness.editor = {
        ...firstEditor,
        document: structuredClone(empty),
        replaceBlocks: vi.fn((_previous: Block[], blocks: Block[]) => {
          harness.editor.document = structuredClone(blocks);
        }),
      };
      await act(async () => { view.rerender(<App />); });
      expectDocument(original);
      expect(bootstrapDesktop).toHaveBeenCalledOnce();
    } finally {
      harness.editor = firstEditor;
    }
  });

  it("ignores editor state notifications without content changes", async () => {
    await mountEmptyApp();
    await act(async () => {
      fireEvent.focus(screen.getByRole("textbox", { name: "Document" }));
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(writeDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("新文档");
    await clickButton("打开");
    expect(openDesktopWindow).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("reuses the initial empty window and binds subsequent saves to the opened file", async () => {
    await mountEmptyApp();
    vi.mocked(openDesktopWindow).mockResolvedValue({ ...file, blocks: original });
    await clickButton("打开");
    expect(openDesktopWindow).toHaveBeenCalledExactlyOnceWith(true);
    expect(newDesktopWindow).not.toHaveBeenCalled();
    expectDocument(original);
    expect(screen.getByRole("status")).toHaveTextContent("已保存");
    expect(harness.setTitle).toHaveBeenLastCalledWith(`${file.name} - BlackDoc`);
    await editDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS - 1); });
    expect(saveDesktopDocument).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(saveDesktopDocument).toHaveBeenLastCalledWith(edited, file.path, file.name, false);
  });

  it.each(["cancel", "error"])("preserves the initial document after picker %s", async result => {
    await mountEmptyApp();
    if (result === "error") vi.mocked(openDesktopWindow).mockRejectedValueOnce(new Error("Cannot read file"));
    await clickButton("打开");
    expect(openDesktopWindow).toHaveBeenCalledWith(true);
    expectDocument(empty);
    expect(harness.editor.replaceBlocks).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Document" })).toBeEnabled();
    expect(deleteDraft).not.toHaveBeenCalled();
  });

  it("does not reuse an edited untitled document even after its draft is stored", async () => {
    await mountEmptyApp();
    await editDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS); });
    await clickButton("打开");
    expect(openDesktopWindow).toHaveBeenCalledExactlyOnceWith(false);
    expectDocument(edited);
    expect(deleteDraft).not.toHaveBeenCalled();
  });

  it("does not reuse a saved document window", async () => {
    await mountApp();
    await clickButton("打开");
    expect(openDesktopWindow).toHaveBeenCalledExactlyOnceWith(false);
    expectDocument(original);
  });

  it("inserts a table with Ctrl+T only in the editable editor", async () => {
    await mountApp();
    const editorInput = screen.getByRole("textbox", { name: "Document" });
    fireEvent.keyDown(editorInput, { key: "t", ctrlKey: true });
    expect(insertOrUpdateBlockForSlashMenu).toHaveBeenCalledExactlyOnceWith(harness.editor, {
      type: "table",
      content: {
        type: "tableContent",
        rows: [{ cells: ["", "", ""] }, { cells: ["", "", ""] }],
      },
    });

    fireEvent.keyDown(window, { key: "t", ctrlKey: true });
    fireEvent.keyDown(editorInput, { key: "t", ctrlKey: true, shiftKey: true });
    harness.editor.isEditable = false;
    fireEvent.keyDown(editorInput, { key: "t", ctrlKey: true });
    expect(insertOrUpdateBlockForSlashMenu).toHaveBeenCalledTimes(1);
  });

  it("blocks editing, repeated open, save and close while reusing the window", async () => {
    await mountEmptyApp();
    const pending = deferred<Awaited<ReturnType<typeof openDesktopWindow>>>();
    vi.mocked(openDesktopWindow).mockReturnValueOnce(pending.promise);
    await clickButton("打开");
    expect(screen.getByRole("textbox", { name: "Document" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "o", ctrlKey: true });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await requestClose();
    expect(openDesktopWindow).toHaveBeenCalledOnce();
    expect(saveDesktopDocument).not.toHaveBeenCalled();
    expectNotClosed();
    await act(async () => { pending.resolve({ ...file, blocks: original }); });
    expectDocument(original);
    expect(screen.getByRole("textbox", { name: "Document" })).toBeEnabled();
  });

  it.each([false, true])("closes the canvas before handling native close (dirty: %s)", async (dirty) => {
    await mountApp();
    if (dirty) await editDocument();
    harness.closeCanvas.mockClear();
    harness.closeCanvas.mockImplementation(() => {
      expect(screen.queryByRole("dialog", { name: "关闭文档" })).not.toBeInTheDocument();
      expect(closeDesktopWindow).not.toHaveBeenCalled();
    });

    await requestClose();

    expect(harness.closeCanvas).toHaveBeenCalledOnce();
    expect(harness.closeCanvas).toHaveBeenCalledWith(expect.objectContaining({
      type: "blackdoc-close-canvas",
    }));
    if (dirty) {
      expect(screen.getByRole("dialog", { name: "关闭文档" })).toBeInTheDocument();
      expectNotClosed();
    } else {
      expect(closeDesktopWindow).toHaveBeenCalledOnce();
    }
  });

  it("closes the canvas before replacing the document", async () => {
    harness.closeCanvas.mockImplementation(() => {
      expect(harness.editor.replaceBlocks).not.toHaveBeenCalled();
    });

    await mountApp();

    expect(harness.closeCanvas).toHaveBeenCalledOnce();
    expectDocument(original);
  });

  it("preserves recovery drafts when closed before bootstrap completes", async () => {
    const initial = deferred<Awaited<ReturnType<typeof bootstrapDesktop>>>();
    vi.mocked(bootstrapDesktop).mockReturnValue(initial.promise);
    await mountApp();
    await requestClose();
    expect(harness.closeCanvas).toHaveBeenCalledOnce();
    expect(deleteDraft).not.toHaveBeenCalled();
    expect(closeDesktopWindow).toHaveBeenCalledOnce();
  });

  it("waits for bootstrap, loads the document and saves edits to its desktop path", async () => {
    const initial = deferred<Awaited<ReturnType<typeof bootstrapDesktop>>>();
    vi.mocked(bootstrapDesktop).mockReturnValue(initial.promise);
    await mountApp();

    expect(screen.getByRole("textbox", { name: "Document" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(saveDesktopDocument).not.toHaveBeenCalled();

    await act(async () => { initial.resolve({ document: { ...file, blocks: original }, draft: null }); });
    expectDocument(original);
    expect(screen.getByRole("textbox", { name: "Document" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("已保存");
    expect(harness.setTitle).toHaveBeenCalledWith(`${file.name} - BlackDoc`);

    await editDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS); });
    expect(saveDesktopDocument).toHaveBeenCalledExactlyOnceWith(edited, file.path, file.name, false);
    expect(screen.getByRole("status")).toHaveTextContent("已保存");
  });

  it.each(["新建", "打开"])("opens a separate window for %s without replacing dirty content", async (name) => {
    await mountApp();
    await editDocument();
    const replacements = harness.editor.replaceBlocks.mock.calls.length;

    await clickButton(name);

    expect(name === "新建" ? newDesktopWindow : openDesktopWindow).toHaveBeenCalledOnce();
    expect(name === "新建" ? openDesktopWindow : newDesktopWindow).not.toHaveBeenCalled();
    expectDocument(edited);
    expect(harness.editor.replaceBlocks).toHaveBeenCalledTimes(replacements);
    expect(screen.getByRole("status")).toHaveTextContent("未保存");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteDraft).not.toHaveBeenCalled();
    expect(saveDesktopDocument).not.toHaveBeenCalled();
  });

  it("keeps the current file and dirty content when save-as is cancelled", async () => {
    await mountApp();
    await editDocument();
    vi.mocked(saveDesktopDocument).mockResolvedValueOnce(null);

    await clickButton("另存为");

    expect(saveDesktopDocument).toHaveBeenLastCalledWith(edited, file.path, file.name, true);
    expectDocument(edited);
    expect(screen.getByTitle(file.name)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("未保存");
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
    expect(deleteDraft).not.toHaveBeenCalled();
    await requestClose();
    expect(screen.getByRole("dialog", { name: "关闭文档" })).toBeInTheDocument();
    expectNotClosed();
  });

  it("cancels a dirty close without deleting the draft or losing edits", async () => {
    await mountApp();
    await editDocument();
    await requestClose();
    expect(screen.getByRole("dialog", { name: "关闭文档" })).toBeInTheDocument();

    await clickButton("取消");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expectDocument(edited);
    expect(deleteDraft).not.toHaveBeenCalled();
    expectNotClosed();
    await requestClose();
    expect(screen.getByRole("dialog", { name: "关闭文档" })).toBeInTheDocument();
  });

  it("keeps the close dialog open when its save picker is cancelled", async () => {
    vi.mocked(bootstrapDesktop).mockResolvedValue({ document: null, draft: null });
    vi.mocked(saveDesktopDocument).mockResolvedValue(null);
    await mountApp();
    await editDocument();
    await requestClose();

    await clickButton("保存并继续");

    expect(saveDesktopDocument).toHaveBeenCalledExactlyOnceWith(edited, null, "未命名文档.bdoc", false);
    expect(screen.getByRole("dialog", { name: "关闭文档" })).toBeInTheDocument();
    expectDocument(edited);
    expect(deleteDraft).not.toHaveBeenCalled();
    expectNotClosed();
  });

  it("refuses close while an automatic save is in flight", async () => {
    const saving = deferred<DesktopFile | null>();
    vi.mocked(saveDesktopDocument).mockReturnValue(saving.promise);
    await mountApp();
    await editDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS); });
    expect(saveDesktopDocument).toHaveBeenCalledOnce();
    harness.closeCanvas.mockClear();

    await requestClose();

    expect(harness.closeCanvas).toHaveBeenCalledOnce();
    expectNotClosed();
    expect(deleteDraft).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("正在处理文件");
    await act(async () => { saving.resolve(file); });
    expectNotClosed();
    await requestClose();
    expect(closeDesktopWindow).toHaveBeenCalledOnce();
  });

  it("cannot discard and close while save-and-continue is still writing", async () => {
    const saving = deferred<DesktopFile | null>();
    vi.mocked(saveDesktopDocument).mockReturnValue(saving.promise);
    await mountApp();
    await editDocument();
    await requestClose();
    await clickButton("保存并继续");
    expect(saveDesktopDocument).toHaveBeenCalledOnce();

    await clickButton("放弃更改");
    await requestClose();

    expectNotClosed();
    expect(deleteDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "关闭文档" })).toBeInTheDocument();
    await act(async () => { saving.resolve(file); });
    expect(closeDesktopWindow).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers the bootstrap draft and restores it as an unsaved desktop document", async () => {
    const recovered = documentWithTitle("Recovered");
    vi.mocked(bootstrapDesktop).mockResolvedValue({
      document: null,
      draft: { id: "draft-window-1", blocks: recovered, updatedAt: "2026-09-22T00:00:00Z" },
    });
    await mountApp();
    const dialog = screen.getByRole("dialog", { name: "发现未保存草稿" });
    expect(within(dialog).getByRole("button", { name: "恢复草稿" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Document" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(saveDesktopDocument).not.toHaveBeenCalled();

    harness.closeCanvas.mockClear();
    await clickButton("恢复草稿");

    expect(harness.closeCanvas).toHaveBeenCalledOnce();
    expectDocument(recovered);
    expect(screen.getByRole("textbox", { name: "Document" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("草稿已暂存");
    expect(deleteDraft).not.toHaveBeenCalled();
    await requestClose();
    expect(screen.getByRole("dialog", { name: "关闭文档" })).toBeInTheDocument();
    await clickButton("保存并继续");
    expect(saveDesktopDocument).toHaveBeenCalledExactlyOnceWith(recovered, null, "未命名文档.bdoc", false);
    expect(closeDesktopWindow).toHaveBeenCalledOnce();
  });
});
