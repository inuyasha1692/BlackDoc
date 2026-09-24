import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "./styles.css";
import { combineByGroup } from "@blocknote/core";
import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core/extensions";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check as checkSignedUpdate, type Update } from "@tauri-apps/plugin-updater";
import { zh } from "@blocknote/core/locales";
import { getDiagramSlashMenuItems, locales as diagramLocales } from "@blocknote/diagram-block";
import { getMathSlashMenuItems, locales as mathLocales } from "@blocknote/math-block";
import {
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
  multiColumnDropCursor,
} from "@blocknote/xl-multi-column";
import { BlockNoteView } from "@blocknote/mantine";
import {
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  LinkToolbarController,
  SuggestionMenuController,
  TableHandlesController,
  useCreateBlockNote,
} from "@blocknote/react";
import { AlertTriangle, Columns2, PenTool, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionDialog } from "./components/ActionDialog";
import { AboutDialog, type UpdateAction } from "./components/AboutDialog";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { BlackDocFormattingToolbar } from "./components/BlockLinkControls";
import { BlackDocLinkToolbar } from "./components/BlackDocLinkToolbar";
import { BlackDocSideMenuController } from "./components/BlockSideMenu";
import { BlackDocTableCellButton } from "./components/TableCellColorMenu";
import { DocumentOutline } from "./components/DocumentOutline";
import { FindReplaceBar } from "./components/FindReplaceBar";
import { Toolbar, type SaveStatus } from "./components/Toolbar";
import packageInfo from "../package.json";
import exampleDocumentSource from "../files/BlackDoc功能展示示例.bdoc?raw";
import { checkForUpdate, type UpdateCheckResult } from "./updates";
import { AppThemeContext } from "./theme";
import { useAppTheme } from "./useAppTheme";
import {
  bootstrapDesktop,
  closeDesktopWindow,
  detachDesktopDocument,
  exportDesktopHtml,
  openDesktopExport,
  importDesktopMarkdown,
  newDesktopWindow,
  openDesktopWindow,
  openExternalLink,
  prepareDesktopUpdate,
  saveDesktopDocument,
} from "./desktop";
import {
  BLOCK_LINK_COPIED_EVENT,
  BLOCK_LINK_COPY_FAILED_EVENT,
  BLOCK_LINK_MISSING_EVENT,
  isBlockLink,
  parseBlockLink,
  revealBlock,
} from "./editor/blockLinks";
import {
  cloneDocument,
  EMPTY_DOCUMENT,
  htmlFileName,
  isBlackDocument,
  sourceFileName,
} from "./editor/document";
import { PreserveHeadingLevelExtension } from "./editor/preserveHeadingLevel";
import { HeadingNumberExtension } from "./editor/headingNumberExtension";
import { importMarkdownBlocks } from "./editor/markdownImport";
import { FindAndReplaceExtension } from "./editor/findAndReplace";
import { InheritColumnFormatExtension } from "./editor/inheritColumnFormat";
import { TableEnterNavigationExtension } from "./editor/tableEnterNavigation";
import { blackDocSchema, type BlackDocBlock, type BlackDocEditor } from "./editor/schema";
import { createSplitPane, isInsideSplitPane } from "./editor/splitPane";
import { SplitPaneExtension, SPLIT_DOCUMENT_REPLACE_META } from "./editor/splitPaneExtension";
import { CanvasEditorHost } from "./canvas/CanvasPreview";
import { buildStandaloneHtml } from "./export/standaloneHtml";
import {
  deleteDraft,
  writeDraft,
  type DraftRecord,
} from "./storage/draftStore";

type Notice = {
  tone: "error" | "warning" | "info";
  message: string;
  exportPath?: string;
};

type PendingTransition = {
  title: string;
  run: () => Promise<void>;
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败。"));
    reader.readAsDataURL(file);
  });

const linkFromClick = (event: MouseEvent): string | null => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest<HTMLAnchorElement>("a")?.getAttribute("href") ?? null;
};

export default function App() {
  const { theme, toggleTheme } = useAppTheme();
  const editor = useCreateBlockNote({
    schema: blackDocSchema,
    initialContent: EMPTY_DOCUMENT,
    dictionary: {
      ...zh,
      formatting_toolbar: {
        ...zh.formatting_toolbar,
        code: {
          ...zh.formatting_toolbar.code,
          secondary_tooltip: "Mod+E",
        },
      },
      diagram: diagramLocales.zh,
      math: mathLocales.zh,
      multi_column: multiColumnLocales.zh,
    },
    dropCursor: multiColumnDropCursor,
    extensions: [
      PreserveHeadingLevelExtension(),
      HeadingNumberExtension(),
      FindAndReplaceExtension(),
      InheritColumnFormatExtension(),
      TableEnterNavigationExtension(),
      SplitPaneExtension(),
    ],
    tables: { cellBackgroundColor: true, cellTextColor: true },
    uploadFile: fileToDataUrl,
    links: {
      onClick: (event) => {
        const href = linkFromClick(event);
        if (!href) {
          return false;
        }

        event.preventDefault();
        const blockId = parseBlockLink(href);
        if (blockId) {
          if (!revealBlock(blockId)) {
            window.dispatchEvent(new Event(BLOCK_LINK_MISSING_EVENT));
          }
          return true;
        }

        void openExternalLink(href).catch((error: unknown) => {
          setNotice({ tone: "error", message: String(error) });
        });
        return true;
      },
    },
    pasteHandler: ({ event, editor: activeEditor, defaultPasteHandler }) => {
      const pastedText = event.clipboardData?.getData("text/plain").trim() ?? "";
      if (!isBlockLink(pastedText)) {
        return defaultPasteHandler();
      }

      if (activeEditor.getSelectedText()) {
        activeEditor.createLink(pastedText);
      } else {
        activeEditor.insertInlineContent(
          [{ type: "link", content: pastedText, href: pastedText }],
          { updateSelection: true },
        );
      }
      return true;
    },
  });

  const [blocks, setBlocks] = useState<BlackDocBlock[]>(() =>
    cloneDocument(editor.document),
  );
  const editorInstanceRef = useRef(editor);
  const bootstrappedRef = useRef(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [busy, setBusy] = useState(false);
  const [desktopReady, setDesktopReady] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [update, setUpdate] = useState<UpdateCheckResult | { kind: "checking" }>({ kind: "checking" });
  const [updateAction, setUpdateAction] = useState<UpdateAction>({ kind: "idle" });
  const downloadedUpdateRef = useRef<Update | null>(null);
  const updateBusyRef = useRef(false);
  const updateRequestRef = useRef(0);
  const checkUpdates = useCallback(async () => {
    const request = ++updateRequestRef.current;
    setUpdate({ kind: "checking" });
    const result = await checkForUpdate(packageInfo.version);
    if (request === updateRequestRef.current) setUpdate(result);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void checkUpdates(), 0);
    return () => {
      window.clearTimeout(timer);
      updateRequestRef.current += 1;
    };
  }, [checkUpdates]);
  const [recoveryDraft, setRecoveryDraft] = useState<DraftRecord | null>(null);
  const [pendingTransition, setPendingTransition] =
    useState<PendingTransition | null>(null);
  const [outlineCollapsed, setOutlineCollapsed] = useState(() => {
    const savedPreference = localStorage.getItem("blackdoc:outline-collapsed");
    if (savedPreference !== null) {
      return savedPreference === "true";
    }
    return window.matchMedia("(max-width: 980px)").matches;
  });

  const desktopPathRef = useRef<string | null>(null);
  const closingRef = useRef(false);
  const openingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const dirtyRef = useRef(false);
  const unsafeChangesRef = useRef(false);
  const changeVersionRef = useRef(0);
  const saveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const suppressChangesRef = useRef(false);
  const persistCurrentRef = useRef<() => Promise<void>>(async () => undefined);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const schedulePersistence = useCallback(
    (delay = 1000) => {
      clearSaveTimer();
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void persistCurrentRef.current();
      }, delay);
    },
    [clearSaveTimer],
  );

  const persistCurrentDocument = useCallback(async (): Promise<void> => {
    if (saveInFlightRef.current) {
      schedulePersistence(250);
      return;
    }

    const snapshot = cloneDocument(editor.document);
    const version = changeVersionRef.current;
    saveInFlightRef.current = true;

    try {
      if (desktopPathRef.current) {
        setStatus("saving");
        await saveDesktopDocument(snapshot, desktopPathRef.current, sourceFileName(snapshot), false);
        if (changeVersionRef.current === version) {
          dirtyRef.current = false;
          unsafeChangesRef.current = false;
          setStatus("saved");
        }
      } else {
        setStatus("draft-saving");
        await writeDraft(snapshot);
        if (changeVersionRef.current === version) {
          unsafeChangesRef.current = false;
          setStatus("draft-saved");
        }
      }
    } catch (error) {
      setStatus("error");
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      saveInFlightRef.current = false;
      if (changeVersionRef.current !== version) {
        schedulePersistence();
      }
    }
  }, [editor, schedulePersistence]);

  const downloadAvailableUpdate = useCallback(async () => {
    if (update.kind !== "available" || updateBusyRef.current) return;
    updateBusyRef.current = true;
    setUpdateAction({ kind: "downloading", percent: null });
    let candidate: Update | null = null;
    try {
      candidate = await checkSignedUpdate();
      if (!candidate || candidate.version.replace(/^v/, "") !== update.version.replace(/^v/, "")) {
        throw new Error("此版本的签名更新包尚未发布，请稍后重试或从发布页下载。");
      }
      let downloaded = 0;
      let total: number | undefined;
      await candidate.download((event) => {
        if (event.event === "Started") total = event.data.contentLength;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        if (event.event === "Started" || event.event === "Progress") {
          setUpdateAction({
            kind: "downloading",
            percent: total ? Math.min(100, Math.floor(downloaded / total * 100)) : null,
          });
        }
      });
      downloadedUpdateRef.current = candidate;
      setUpdateAction({ kind: "ready" });
    } catch (error) {
      if (candidate) await candidate.close().catch(() => {});
      setUpdateAction({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      updateBusyRef.current = false;
    }
  }, [update]);

  const installAvailableUpdate = useCallback(async () => {
    const candidate = downloadedUpdateRef.current;
    if (!candidate || updateBusyRef.current) return;
    updateBusyRef.current = true;
    try {
      await prepareDesktopUpdate();
      if (saveInFlightRef.current || busy || openingRef.current) {
        throw new Error("正在处理文件，请稍后再安装更新。");
      }
      window.dispatchEvent(new Event("blackdoc-close-canvas"));
      clearSaveTimer();
      await persistCurrentDocument();
      if (unsafeChangesRef.current || saveInFlightRef.current) {
        throw new Error("文档尚未保存成功，请先完成保存再安装更新。");
      }
      setUpdateAction({ kind: "installing" });
      await candidate.install({ restartAfterInstall: true });
    } catch (error) {
      setUpdateAction({ kind: "ready" });
      setNotice({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      updateBusyRef.current = false;
    }
  }, [busy, clearSaveTimer, persistCurrentDocument]);

  useEffect(() => {
    persistCurrentRef.current = persistCurrentDocument;
  }, [persistCurrentDocument]);

  const replaceDocument = useCallback(
    (nextBlocks: BlackDocBlock[]) => {
      window.dispatchEvent(new Event("blackdoc-close-canvas"));
      suppressChangesRef.current = true;
      editor.transact(tr => {
        tr.setMeta(SPLIT_DOCUMENT_REPLACE_META, true);
        editor.replaceBlocks(editor.document, nextBlocks);
      });
      setBlocks(cloneDocument(editor.document));
      queueMicrotask(() => {
        suppressChangesRef.current = false;
      });
    },
    [editor, setBlocks],
  );

  useEffect(() => {
    if (editorInstanceRef.current === editor) return;
    editorInstanceRef.current = editor;
    replaceDocument(blocks);
  }, [blocks, editor, replaceDocument]);

  const saveCurrentDocument = useCallback(
    async (saveAs = false): Promise<boolean> => {
      if (saveInFlightRef.current) {
        setNotice({ tone: "info", message: "当前保存完成后再试一次。" });
        return false;
      }

      const snapshot = cloneDocument(editor.document);
      const version = changeVersionRef.current;
      saveInFlightRef.current = true;
      setBusy(true);

      try {
        const saved = await saveDesktopDocument(
          snapshot, desktopPathRef.current, sourceFileName(snapshot), saveAs,
        );
        if (!saved) return false;
        desktopPathRef.current = saved.path;
        setFileName(saved.name);
        await deleteDraft();

        if (changeVersionRef.current === version) {
          dirtyRef.current = false;
          unsafeChangesRef.current = false;
          setStatus("saved");
        } else {
          schedulePersistence();
          return false;
        }

        return true;
      } catch (error) {
        setStatus("error");
        setNotice({
          tone: "error",
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      } finally {
        saveInFlightRef.current = false;
        setBusy(false);
      }
    },
    [editor, schedulePersistence],
  );

  const requestTransition = useCallback(
    (title: string, run: () => Promise<void>) => {
      window.dispatchEvent(new Event("blackdoc-close-canvas"));
      if (saveInFlightRef.current) {
        setNotice({ tone: "info", message: "正在保存，请稍后再试。" });
        return;
      }
      if (dirtyRef.current) {
        setPendingTransition({ title, run });
        return;
      }
      void run();
    },
    [],
  );

  const requestNewDocument = useCallback(() => {
    void newDesktopWindow().catch((error: unknown) =>
      setNotice({ tone: "error", message: String(error) }),
    );
  }, []);

  const requestOpenDocument = useCallback(() => {
    if (openingRef.current || saveInFlightRef.current || !desktopReady || recoveryDraft) return;
    const reuseCurrent = !desktopPathRef.current && !dirtyRef.current &&
      editor.document.every(block =>
        (block.type === "heading" || block.type === "paragraph") &&
        block.content.length === 0 && block.children.length === 0);
    openingRef.current = true;
    setOpening(true);
    setBusy(true);
    void (async () => {
      try {
        const opened = await openDesktopWindow(reuseCurrent);
        if (!opened) return;
        if (!isBlackDocument(opened.blocks)) throw new Error("文件不是有效的 BlackDoc 文档。");
        clearSaveTimer();
        replaceDocument(opened.blocks);
        desktopPathRef.current = opened.path;
        setFileName(opened.name);
        dirtyRef.current = false;
        unsafeChangesRef.current = false;
        changeVersionRef.current += 1;
        setStatus("saved");
        setNotice(null);
      } catch (error) {
        setNotice({ tone: "error", message: error instanceof Error ? error.message : String(error) });
      } finally {
        openingRef.current = false;
        setOpening(false);
        setBusy(false);
      }
    })();
  }, [clearSaveTimer, desktopReady, editor, recoveryDraft, replaceDocument]);

  const importSelectedMarkdown = useCallback(async () => {
    setBusy(true);
    try {
      const imported = await importDesktopMarkdown();
      if (!imported) return;
      const converted = importMarkdownBlocks(editor, imported.markdown);
      await detachDesktopDocument();
      clearSaveTimer();
      replaceDocument(converted.blocks);
      desktopPathRef.current = null;
      setFileName(null);
      dirtyRef.current = true;
      unsafeChangesRef.current = true;
      changeVersionRef.current += 1;
      setStatus("unsaved");
      await deleteDraft();
      const saved = await saveCurrentDocument();
      const warnings = [...imported.warnings, ...converted.warnings];
      if (saved) {
        setNotice({
          tone: warnings.length ? "warning" : "info",
          message: warnings.length
            ? `Markdown 已导入并保存；${warnings.slice(0, 3).join("；")}`
            : "Markdown 已导入并保存。",
        });
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }, [clearSaveTimer, editor, replaceDocument, saveCurrentDocument]);

  const requestImportMarkdown = useCallback(() => {
    requestTransition("导入 Markdown", importSelectedMarkdown);
  }, [importSelectedMarkdown, requestTransition]);

  const openExampleDocument = useCallback(async () => {
    if (openingRef.current || saveInFlightRef.current || !desktopReady || recoveryDraft) return;
    openingRef.current = true;
    setOpening(true);
    setBusy(true);
    try {
      const example: unknown = JSON.parse(exampleDocumentSource);
      if (!isBlackDocument(example)) throw new Error("功能示例文档无效。");
      await detachDesktopDocument();
      clearSaveTimer();
      replaceDocument(example);
      desktopPathRef.current = null;
      setFileName(null);
      dirtyRef.current = true;
      unsafeChangesRef.current = true;
      changeVersionRef.current += 1;
      setStatus("unsaved");
      setNotice(null);
      await deleteDraft();
      schedulePersistence();
      editor.focus();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      openingRef.current = false;
      setOpening(false);
      setBusy(false);
    }
  }, [clearSaveTimer, desktopReady, editor, recoveryDraft, replaceDocument, schedulePersistence]);

  const requestExampleDocument = useCallback(() => {
    requestTransition("打开功能示例", openExampleDocument);
  }, [openExampleDocument, requestTransition]);

  const exportCurrentDocument = useCallback(async () => {
    setBusy(true);
    try {
      const snapshot = cloneDocument(editor.document);
      const result = await buildStandaloneHtml(editor, snapshot);
      const exported = await exportDesktopHtml(result.html, htmlFileName(fileName, snapshot));
      if (!exported) return;

      setNotice(
        result.externalImages.length > 0
          ? {
              tone: "warning",
              message: `${result.externalImages.length} 张远程图片无法内嵌，导出的 HTML 仍需联网显示这些图片。`,
              exportPath: exported.path,
            }
          : { tone: "info", message: "HTML 已导出。", exportPath: exported.path },
      );
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "HTML 导出失败。",
      });
    } finally {
      setBusy(false);
    }
  }, [editor, fileName]);

  const handleEditorChange = useCallback<Parameters<BlackDocEditor["onChange"]>[0]>((_editor, { getChanges }) => {
    if (suppressChangesRef.current || !desktopReady || getChanges().length === 0) {
      return;
    }

    setBlocks(cloneDocument(editor.document));
    changeVersionRef.current += 1;
    dirtyRef.current = true;
    unsafeChangesRef.current = true;
    setStatus("unsaved");
    schedulePersistence();
  }, [desktopReady, editor, schedulePersistence, setBlocks, setStatus]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    let disposed = false;
    void bootstrapDesktop().then((initial) => {
      if (disposed) return;
      if (initial.document) {
        if (!isBlackDocument(initial.document.blocks)) throw new Error("文件不是有效的 BlackDoc 文档。");
        replaceDocument(initial.document.blocks);
        desktopPathRef.current = initial.document.path;
        setFileName(initial.document.name);
        setStatus("saved");
      }
      if (initial.draft && isBlackDocument(initial.draft.blocks)) {
        setRecoveryDraft(initial.draft);
      }
      bootstrappedRef.current = true;
      setDesktopReady(true);
    }).catch((error: unknown) => {
      if (!disposed) setNotice({ tone: "error", message: String(error) });
    });
    return () => { disposed = true; };
  }, [editor, replaceDocument]);

  useEffect(() => {
    let disposed = false;
    const subscription = getCurrentWindow().listen("desktop-close-requested", () => {
      if (disposed || closingRef.current) return;
      window.dispatchEvent(new Event("blackdoc-close-canvas"));
      if (!desktopReady || recoveryDraft) {
        void closeDesktopWindow().catch((error: unknown) =>
          setNotice({ tone: "error", message: String(error) }),
        );
        return;
      }
      if (saveInFlightRef.current || busy || openingRef.current) {
        setNotice({ tone: "info", message: "正在处理文件，请完成后再关闭。" });
        return;
      }
      const close = async () => {
        if (saveInFlightRef.current) {
          setNotice({ tone: "info", message: "正在保存，请稍后再关闭。" });
          return;
        }
        closingRef.current = true;
        clearSaveTimer();
        try {
          await deleteDraft();
          await closeDesktopWindow();
        } catch (error) {
          closingRef.current = false;
          setNotice({ tone: "error", message: String(error) });
        }
      };
      if (dirtyRef.current) {
        setPendingTransition({ title: "关闭文档", run: close });
      } else {
        void close();
      }
    });
    return () => {
      disposed = true;
      void subscription.then((unlisten) => unlisten());
    };
  }, [busy, clearSaveTimer, desktopReady, recoveryDraft]);

  useEffect(() => {
    const handleCopied = () =>
      setNotice({ tone: "info", message: "块链接已复制。" });
    const handleCopyFailed = () =>
      setNotice({ tone: "error", message: "无法访问剪贴板，块链接复制失败。" });
    const handleMissing = () =>
      setNotice({ tone: "warning", message: "链接指向的内容已不存在。" });

    window.addEventListener(BLOCK_LINK_COPIED_EVENT, handleCopied);
    window.addEventListener(BLOCK_LINK_COPY_FAILED_EVENT, handleCopyFailed);
    window.addEventListener(BLOCK_LINK_MISSING_EVENT, handleMissing);
    return () => {
      window.removeEventListener(BLOCK_LINK_COPIED_EVENT, handleCopied);
      window.removeEventListener(BLOCK_LINK_COPY_FAILED_EVENT, handleCopyFailed);
      window.removeEventListener(BLOCK_LINK_MISSING_EVENT, handleMissing);
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (unsafeChangesRef.current) {
        event.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "f" || key === "h") {
        event.preventDefault();
        if (desktopReady && !recoveryDraft && !openingRef.current) {
          setFindOpen(true);
          requestAnimationFrame(() => document.querySelector<HTMLInputElement>(
            ".find-replace-bar input[type=search]",
          )?.focus());
        }
        return;
      }
      if (!desktopReady || recoveryDraft || openingRef.current) {
        if (key === "s" || key === "o" || key === "n") event.preventDefault();
        return;
      }
      if (key === "s") {
        event.preventDefault();
        void saveCurrentDocument(event.shiftKey);
      } else if (key === "o") {
        event.preventDefault();
        requestOpenDocument();
      } else if (key === "n") {
        event.preventDefault();
        requestNewDocument();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [desktopReady, recoveryDraft, requestNewDocument, requestOpenDocument, saveCurrentDocument]);

  useEffect(() => () => clearSaveTimer(), [clearSaveTimer]);

  const toggleOutline = () => {
    setOutlineCollapsed((current) => {
      const next = !current;
      localStorage.setItem("blackdoc:outline-collapsed", String(next));
      return next;
    });
  };

  const documentName = fileName ?? sourceFileName(blocks);
  useEffect(() => {
    if (desktopReady) {
      void getCurrentWindow().setTitle(`${documentName} - BlackDoc`);
    }
  }, [desktopReady, documentName]);
  const isSaving =
    !desktopReady || busy || status === "saving" || status === "draft-saving";

  return (
    <AppThemeContext.Provider value={theme}>
    <div className="app-shell">
      <Toolbar
        theme={theme}
        onToggleTheme={toggleTheme}
        onFind={() => setFindOpen((current) => !current)}
        findOpen={findOpen}
        busy={isSaving}
        documentName={documentName}
        onExport={() => void exportCurrentDocument()}
        onNew={requestNewDocument}
        onOpen={requestOpenDocument}
        onImportMarkdown={requestImportMarkdown}
        onOpenExample={requestExampleDocument}
        onSave={() => void saveCurrentDocument(false)}
        onSaveAs={() => void saveCurrentDocument(true)}
        onAbout={() => setAboutOpen(true)}
        onShortcuts={() => setShortcutsOpen(true)}
        updateAvailable={update.kind === "available"}
        status={status}
      />
      {findOpen && <FindReplaceBar editor={editor} onClose={() => setFindOpen(false)} />}

      {update.kind === "available" && !updateDismissed && (
        <div className="update-notice" role="status">
          <span>BlackDoc v{update.version.replace(/^v/, "")} 已发布</span>
          <button onClick={() => setAboutOpen(true)} type="button">查看更新</button>
          <button
            aria-label="关闭更新提示"
            className="icon-button"
            onClick={() => setUpdateDismissed(true)}
            title="关闭更新提示"
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      )}

      {notice && (
        <div className={`notice ${notice.tone}`} role="alert">
          {notice.tone !== "info" && (
            <AlertTriangle aria-hidden="true" size={17} />
          )}
          <div className="notice-content">
            <span>{notice.message}</span>
            {notice.exportPath && (
              <button
                className="notice-file-link"
                onClick={() => {
                  void openDesktopExport().catch((error: unknown) => {
                    setNotice({ tone: "error", message: error instanceof Error ? error.message : "无法打开导出的 HTML。" });
                  });
                }}
                title={notice.exportPath}
                type="button"
              >
                {notice.exportPath}
              </button>
            )}
          </div>
          <button
            aria-label="关闭提示"
            onClick={() => setNotice(null)}
            title="关闭提示"
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      )}

      <div
        className={`workspace ${outlineCollapsed ? "outline-collapsed" : ""}`}
      >
        <DocumentOutline
          blocks={blocks}
          collapsed={outlineCollapsed}
          onToggle={toggleOutline}
        />
        <main className="editor-region">
          <BlockNoteView
            editor={editor}
            editable={desktopReady && !recoveryDraft && !opening}
            formattingToolbar={false}
            linkToolbar={false}
            onChange={handleEditorChange}
            sideMenu={false}
            slashMenu={false}
            tableHandles={false}
            theme={theme}
          >
            <SuggestionMenuController
              triggerCharacter="/"
              getItems={async (query) =>
                filterSuggestionItems(
                  combineByGroup(getDefaultReactSlashMenuItems(editor), [
                    ...getMultiColumnSlashMenuItems(editor),
                    ...getDiagramSlashMenuItems(editor),
                    ...getMathSlashMenuItems(editor),
                    ...(!isInsideSplitPane(editor.document, editor.getTextCursorPosition().block.id) ? [{
                      title: "双分区",
                      aliases: ["split", "columns", "scrollytelling", "shuangfenqu"],
                      group: "其他",
                      icon: <Columns2 aria-hidden="true" size={18} />,
                      onItemClick: () => {
                        const inserted = insertOrUpdateBlockForSlashMenu(editor, createSplitPane());
                        const first = inserted.children[0]?.children[0];
                        if (first) editor.setTextCursorPosition(first, "start");
                      },
                    }] : []),
                    {
                      title: "画布",
                      aliases: ["canvas", "drawing", "huabu"],
                      group: "其他",
                      icon: <PenTool aria-hidden="true" size={18} />,
                      onItemClick: () =>
                        insertOrUpdateBlockForSlashMenu(editor, { type: "canvas" }),
                    },
                  ]),
                  query,
                )
              }
            />
            <FormattingToolbarController
              formattingToolbar={BlackDocFormattingToolbar}
            />
            <BlackDocSideMenuController />
            <TableHandlesController tableCellHandle={BlackDocTableCellButton} />
            <LinkToolbarController linkToolbar={BlackDocLinkToolbar} />
          </BlockNoteView>
        </main>
      </div>

      <CanvasEditorHost editor={editor} />
      {aboutOpen && (
        <AboutDialog
          version={packageInfo.version}
          update={update}
          updateAction={updateAction}
          onCheck={() => void checkUpdates()}
          onDownload={() => void downloadAvailableUpdate()}
          onInstall={() => void installAvailableUpdate()}
          onClose={() => setAboutOpen(false)}
          onOpenLink={(url) => {
            void openExternalLink(url).catch(() => {
              setNotice({ tone: "error", message: "无法打开链接，请检查系统浏览器设置。" });
            });
          }}
        />
      )}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {recoveryDraft && (
        <ActionDialog
          actions={[
            {
              label: "删除草稿",
              tone: "danger",
              onClick: async () => {
                await deleteDraft();
                setRecoveryDraft(null);
              },
            },
            {
              label: "恢复草稿",
              tone: "primary",
              onClick: () => {
                replaceDocument(recoveryDraft.blocks);
                setRecoveryDraft(null);
                setBlocks(cloneDocument(editor.document));
                dirtyRef.current = true;
                unsafeChangesRef.current = false;
                changeVersionRef.current += 1;
                setStatus("draft-saved");
                editor.focus();
              },
            },
          ]}
          title="发现未保存草稿"
        >
          <p>
            草稿保存于
            {new Date(recoveryDraft.updatedAt).toLocaleString("zh-CN")}。恢复后可继续编辑或保存为本地文件。
          </p>
        </ActionDialog>
      )}

      {pendingTransition && (
        <ActionDialog
          actions={[
            {
              label: "取消",
              onClick: () => setPendingTransition(null),
            },
            {
              label: "放弃更改",
              tone: "danger",
              onClick: async () => {
                if (saveInFlightRef.current) {
                  setNotice({ tone: "info", message: "正在保存，请稍后再试。" });
                  return;
                }
                const transition = pendingTransition;
                setPendingTransition(null);
                await transition.run();
              },
            },
            {
              label: "保存并继续",
              tone: "primary",
              onClick: async () => {
                if (await saveCurrentDocument(false)) {
                  const transition = pendingTransition;
                  setPendingTransition(null);
                  await transition.run();
                }
              },
            },
          ]}
          title={pendingTransition.title}
        >
          <p>当前文档包含尚未保存到正式文件的更改。</p>
        </ActionDialog>
      )}
    </div>
    </AppThemeContext.Provider>
  );
}
