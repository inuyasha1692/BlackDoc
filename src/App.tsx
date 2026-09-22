import type { Block } from "@blocknote/core";
import { zh } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import {
  FormattingToolbarController,
  LinkToolbarController,
  SideMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { AlertTriangle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionDialog } from "./components/ActionDialog";
import { BlockDocFormattingToolbar } from "./components/BlockLinkControls";
import { BlockDocLinkToolbar } from "./components/BlockDocLinkToolbar";
import { BlockDocSideMenu } from "./components/BlockSideMenu";
import { DocumentOutline } from "./components/DocumentOutline";
import { Toolbar, type SaveStatus } from "./components/Toolbar";
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
  isBlockDocument,
  sourceFileName,
} from "./editor/document";
import { PreserveHeadingLevelExtension } from "./editor/preserveHeadingLevel";
import { buildStandaloneHtml, downloadHtml } from "./export/standaloneHtml";
import {
  deleteDraft,
  readDraft,
  writeDraft,
  type DraftRecord,
} from "./storage/draftStore";
import {
  chooseSaveFile,
  isAbortError,
  openDocumentFile,
  supportsFileSystemAccess,
  writeDocumentFile,
} from "./storage/fileSystem";

type Notice = {
  tone: "error" | "warning" | "info";
  message: string;
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
  const editor = useCreateBlockNote({
    initialContent: EMPTY_DOCUMENT,
    dictionary: zh,
    extensions: [PreserveHeadingLevelExtension()],
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

        window.open(href, "_blank", "noopener,noreferrer");
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

  const [blocks, setBlocks] = useState<Block[]>(() =>
    cloneDocument(editor.document),
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<DraftRecord | null>(null);
  const [pendingTransition, setPendingTransition] =
    useState<PendingTransition | null>(null);
  const [outlineCollapsed, setOutlineCollapsed] = useState(() => {
    const savedPreference = localStorage.getItem("blockdoc:outline-collapsed");
    if (savedPreference !== null) {
      return savedPreference === "true";
    }
    return window.matchMedia("(max-width: 980px)").matches;
  });

  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const dirtyRef = useRef(false);
  const unsafeChangesRef = useRef(false);
  const changeVersionRef = useRef(0);
  const saveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const suppressChangesRef = useRef(false);
  const draftCheckedRef = useRef(false);
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
      if (fileHandleRef.current) {
        setStatus("saving");
        await writeDocumentFile(fileHandleRef.current, snapshot);
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
        message: error instanceof Error ? error.message : "自动保存失败。",
      });
    } finally {
      saveInFlightRef.current = false;
      if (changeVersionRef.current !== version) {
        schedulePersistence();
      }
    }
  }, [editor, schedulePersistence]);

  useEffect(() => {
    persistCurrentRef.current = persistCurrentDocument;
  }, [persistCurrentDocument]);

  const replaceDocument = useCallback(
    (nextBlocks: Block[]) => {
      suppressChangesRef.current = true;
      editor.replaceBlocks(editor.document, nextBlocks);
      setBlocks(cloneDocument(editor.document));
      queueMicrotask(() => {
        suppressChangesRef.current = false;
      });
    },
    [editor],
  );

  const saveCurrentDocument = useCallback(
    async (saveAs = false): Promise<boolean> => {
      if (saveInFlightRef.current) {
        setNotice({ tone: "info", message: "当前保存完成后再试一次。" });
        return false;
      }

      if (!supportsFileSystemAccess()) {
        setNotice({
          tone: "error",
          message: "当前浏览器不支持本地文件写入，请使用最新版 Chrome 或 Edge。",
        });
        return false;
      }

      const snapshot = cloneDocument(editor.document);
      const version = changeVersionRef.current;
      let handle = fileHandleRef.current;
      saveInFlightRef.current = true;
      setBusy(true);

      try {
        if (!handle || saveAs) {
          handle = await chooseSaveFile(sourceFileName(snapshot));
        }

        setStatus("saving");
        await writeDocumentFile(handle, snapshot);
        fileHandleRef.current = handle;
        setFileName(handle.name);
        await deleteDraft();

        if (changeVersionRef.current === version) {
          dirtyRef.current = false;
          unsafeChangesRef.current = false;
          setStatus("saved");
        } else {
          schedulePersistence();
        }

        return true;
      } catch (error) {
        if (isAbortError(error)) {
          return false;
        }

        setStatus("error");
        setNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "保存文件失败。",
        });
        return false;
      } finally {
        saveInFlightRef.current = false;
        setBusy(false);
      }
    },
    [editor, schedulePersistence],
  );

  const resetToNewDocument = useCallback(async () => {
    clearSaveTimer();
    replaceDocument(structuredClone(EMPTY_DOCUMENT) as Block[]);
    fileHandleRef.current = null;
    setFileName(null);
    dirtyRef.current = false;
    unsafeChangesRef.current = false;
    changeVersionRef.current += 1;
    setStatus("idle");
    setNotice(null);
    await deleteDraft();
    editor.focus();
  }, [clearSaveTimer, editor, replaceDocument]);

  const openSelectedDocument = useCallback(async () => {
    if (!supportsFileSystemAccess()) {
      setNotice({
        tone: "error",
        message: "当前浏览器不支持本地文件读取，请使用最新版 Chrome 或 Edge。",
      });
      return;
    }

    setBusy(true);
    try {
      const opened = await openDocumentFile();
      clearSaveTimer();
      replaceDocument(opened.blocks);
      fileHandleRef.current = opened.handle;
      setFileName(opened.name);
      dirtyRef.current = false;
      unsafeChangesRef.current = false;
      changeVersionRef.current += 1;
      setStatus("saved");
      setNotice(null);
      await deleteDraft();
      editor.focus();
    } catch (error) {
      if (!isAbortError(error)) {
        setNotice({
          tone: "error",
          message:
            error instanceof SyntaxError
              ? "文件不是有效的 JSON。"
              : error instanceof Error
                ? error.message
                : "打开文件失败。",
        });
      }
    } finally {
      setBusy(false);
    }
  }, [clearSaveTimer, editor, replaceDocument]);

  const requestTransition = useCallback(
    (title: string, run: () => Promise<void>) => {
      if (dirtyRef.current) {
        setPendingTransition({ title, run });
        return;
      }
      void run();
    },
    [],
  );

  const requestNewDocument = useCallback(() => {
    requestTransition("新建文档", resetToNewDocument);
  }, [requestTransition, resetToNewDocument]);

  const requestOpenDocument = useCallback(() => {
    requestTransition("打开其他文档", openSelectedDocument);
  }, [openSelectedDocument, requestTransition]);

  const exportCurrentDocument = useCallback(async () => {
    setBusy(true);
    try {
      const snapshot = cloneDocument(editor.document);
      const result = await buildStandaloneHtml(editor, snapshot);
      downloadHtml(result.html, htmlFileName(fileName, snapshot));

      setNotice(
        result.externalImages.length > 0
          ? {
              tone: "warning",
              message: `${result.externalImages.length} 张远程图片无法内嵌，导出的 HTML 仍需联网显示这些图片。`,
            }
          : { tone: "info", message: "HTML 已导出。" },
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

  const handleEditorChange = useCallback(() => {
    if (suppressChangesRef.current) {
      return;
    }

    setBlocks(cloneDocument(editor.document));
    changeVersionRef.current += 1;
    dirtyRef.current = true;
    unsafeChangesRef.current = true;
    setStatus("unsaved");
    schedulePersistence();
  }, [editor, schedulePersistence]);

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
    if (draftCheckedRef.current) {
      return;
    }
    draftCheckedRef.current = true;

    void readDraft()
      .then((draft) => {
        if (draft && isBlockDocument(draft.blocks)) {
          setRecoveryDraft(draft);
        }
      })
      .catch(() => {
        setNotice({
          tone: "warning",
          message: "未能检查浏览器草稿，建议尽快保存到本地文件。",
        });
      });
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
      if (key === "s") {
        event.preventDefault();
        void saveCurrentDocument(event.shiftKey);
      } else if (key === "o") {
        event.preventDefault();
        requestOpenDocument();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [requestOpenDocument, saveCurrentDocument]);

  useEffect(() => () => clearSaveTimer(), [clearSaveTimer]);

  const toggleOutline = () => {
    setOutlineCollapsed((current) => {
      const next = !current;
      localStorage.setItem("blockdoc:outline-collapsed", String(next));
      return next;
    });
  };

  const documentName = fileName ?? sourceFileName(blocks);
  const isSaving =
    busy || status === "saving" || status === "draft-saving";

  return (
    <div className="app-shell">
      <Toolbar
        busy={isSaving}
        documentName={documentName}
        onExport={() => void exportCurrentDocument()}
        onNew={requestNewDocument}
        onOpen={requestOpenDocument}
        onSave={() => void saveCurrentDocument(false)}
        onSaveAs={() => void saveCurrentDocument(true)}
        onToggleOutline={toggleOutline}
        outlineCollapsed={outlineCollapsed}
        status={status}
      />

      {notice && (
        <div className={`notice ${notice.tone}`} role="alert">
          {notice.tone !== "info" && (
            <AlertTriangle aria-hidden="true" size={17} />
          )}
          <span>{notice.message}</span>
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
        <main className="editor-region">
          <BlockNoteView
            editor={editor}
            formattingToolbar={false}
            linkToolbar={false}
            onChange={handleEditorChange}
            sideMenu={false}
            theme="light"
          >
            <FormattingToolbarController
              formattingToolbar={BlockDocFormattingToolbar}
            />
            <SideMenuController sideMenu={BlockDocSideMenu} />
            <LinkToolbarController linkToolbar={BlockDocLinkToolbar} />
          </BlockNoteView>
        </main>
        <DocumentOutline
          blocks={blocks}
          collapsed={outlineCollapsed}
          onToggle={toggleOutline}
        />
      </div>

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
  );
}
