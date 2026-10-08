import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { applyAiDocument } from "./editor/aiDocument";
import { combineByGroup, formatKeyboardShortcut } from "@blocknote/core";
import {
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
import { flip, offset, shift, size, type Middleware } from "@floating-ui/react";
import {
  FormattingToolbarController,
  type DefaultReactSuggestionItem,
  getDefaultReactSlashMenuItems,
  LinkToolbarController,
  SuggestionMenuController,
  type SuggestionMenuProps,
  TableHandlesController,
  useCreateBlockNote,
} from "@blocknote/react";
import {
  AlertTriangle,
  Columns2,
  PenTool,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionDialog } from "./components/ActionDialog";
import { AboutDialog, type UpdateAction } from "./components/AboutDialog";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { BlackDocFormattingToolbar } from "./components/BlockLinkControls";
import { ImageViewerHost } from "./components/ImageViewer";
import { BlackDocLinkToolbar } from "./components/BlackDocLinkToolbar";
import {
  BlackDocSideMenuController,
  type PendingSlashBlockRef,
} from "./components/BlockSideMenu";
import { DocumentOutline } from "./components/DocumentOutline";
import { FindReplaceBar } from "./components/FindReplaceBar";
import { Toolbar, type SaveStatus } from "./components/Toolbar";
import packageInfo from "../package.json";
import exampleDocumentSource from "../files/BlackDoc功能展示示例.bdoc?raw";
import { checkForUpdate, type UpdateCheckResult } from "./updates";
import { scrollMenuItemIntoView } from "./editor/suggestionMenuScroll";
import { HeadingSectionsExtension, RESET_DOCUMENT_FOLDS_META } from "./editor/headingSections";
import { AppThemeContext } from "./theme";
import { useAppTheme } from "./useAppTheme";

type UpdateGuideStage = "more" | "about" | "check" | "done";
type SlashMenuPlacement =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "left-start"
  | "left-end"
  | "bottom-start"
  | "top-start";
type SlashMenuItem = DefaultReactSuggestionItem & {
  iconOnly?: boolean;
};

export const AUTO_SAVE_DELAY_MS = 60_000;
const FIRST_LAUNCH_KEY = "blackdoc:first-launch-completed";
const DEFAULT_DOCUMENT_FILE_NAME = "未命名文档.bdoc";
const HiddenTableCellHandle = () => null;

const SLASH_MENU_WIDTH = 240;
const SLASH_MENU_GAP = 10;
const VIEWPORT_PADDING = 10;
const SLASH_MENU_TOP_PADDING = 56 + VIEWPORT_PADDING;
const SLASH_MENU_VIEWPORT_PADDING = {
  top: SLASH_MENU_TOP_PADDING,
  right: VIEWPORT_PADDING,
  bottom: VIEWPORT_PADDING,
  left: VIEWPORT_PADDING,
};

const getPlusAnchorPlacement = (anchor: DOMRect): "left" | "right" | "top" | "bottom" => {
  const viewportWidth = document.documentElement.clientWidth;
  const leftSpace = anchor.left - SLASH_MENU_GAP - VIEWPORT_PADDING;
  const rightSpace = viewportWidth - anchor.right - SLASH_MENU_GAP - VIEWPORT_PADDING;

  if (leftSpace >= SLASH_MENU_WIDTH) return "left";
  if (rightSpace >= SLASH_MENU_WIDTH) return "right";

  const viewportHeight = document.documentElement.clientHeight;
  const topSpace = anchor.top - SLASH_MENU_GAP - SLASH_MENU_TOP_PADDING;
  const bottomSpace = viewportHeight - anchor.bottom - SLASH_MENU_GAP - VIEWPORT_PADDING;
  return topSpace >= bottomSpace ? "top" : "bottom";
};

const getSlashMenuFallbackPlacement = (
  placement: SlashMenuPlacement,
): SlashMenuPlacement => {
  const fallbacks: Record<SlashMenuPlacement, SlashMenuPlacement> = {
    left: "right",
    right: "left",
    top: "bottom",
    bottom: "top",
    "left-start": "left-end",
    "left-end": "left-start",
    "bottom-start": "top-start",
    "top-start": "bottom-start",
  };
  return fallbacks[placement];
};

const updateGuideKey = (version: string) => `blackdoc:update-guide:${version.replace(/^v/, "")}`;

const headingShortcuts = new Map([
  ["一级标题", "Mod-1"],
  ["段落", "Mod-0"],
  ["二级标题", "Mod-2"],
  ["三级标题", "Mod-3"],
  ["四级标题", "Mod-4"],
  ["五级标题", "Mod-5"],
  ["六级标题", "Mod-6"],
]);

const headingLevels = new Map([
  ["一级标题", 1],
  ["二级标题", 2],
  ["三级标题", 3],
  ["四级标题", 4],
  ["五级标题", 5],
  ["六级标题", 6],
]);

const iconOnlySlashTitles = new Set([
  "段落",
  "一级标题",
  "二级标题",
  "三级标题",
  "四级标题",
  "五级标题",
  "六级标题",
  "有序列表",
  "无序列表",
  "检查清单",
  "代码块",
  "引用",
  "分隔线",
  "双分区",
]);

const slashIconOrder = [
  "段落",
  "一级标题",
  "二级标题",
  "三级标题",
  "四级标题",
  "五级标题",
  "六级标题",
  "有序列表",
  "无序列表",
  "检查清单",
  "代码块",
  "引用",
  "分隔线",
  "双分区",
];

function CompactSlashMenu({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
}: SuggestionMenuProps<SlashMenuItem>) {
  const menuRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const grouped = new Map<string, { item: SlashMenuItem; index: number }[]>();
    items.forEach((item, index) => {
      const group = item.group ?? "其他";
      const groupItems = grouped.get(group) ?? [];
      groupItems.push({ item, index });
      grouped.set(group, groupItems);
    });
    return [...grouped.entries()];
  }, [items]);

  useEffect(() => {
    if (selectedIndex === undefined) return;
    const menu = menuRef.current;
    const selectedItem = menu?.querySelector<HTMLElement>(
      `#bn-suggestion-menu-item-${selectedIndex}`,
    );
    if (menu && selectedItem) {
      scrollMenuItemIntoView(menu, selectedItem);
    }
  }, [selectedIndex]);

  const renderItem = (
    item: SlashMenuItem,
    index: number,
    iconOnly = false,
  ) => {
    const isSelected = selectedIndex === index;
    const label = item.badge ? `${item.title}（${item.badge}）` : item.title;
    return (
      <button
        aria-label={label}
        aria-selected={isSelected || undefined}
        className={iconOnly
          ? `slash-menu-icon${isSelected ? " is-selected" : ""}`
          : `slash-menu-row${isSelected ? " is-selected" : ""}`}
        id={`bn-suggestion-menu-item-${index}`}
        key={`${item.title}-${index}`}
        onClick={() => onItemClick?.(item)}
        onMouseDown={event => event.preventDefault()}
        role="option"
        title={label}
        type="button"
      >
        {item.icon && <span className="slash-menu-item-icon">{item.icon}</span>}
        {!iconOnly && <span className="slash-menu-item-title">{item.title}</span>}
        {!iconOnly && item.badge && <kbd>{item.badge}</kbd>}
      </button>
    );
  };

  return (
    <div
      aria-label="块组件菜单"
      className="bn-suggestion-menu blackdoc-slash-menu"
      id="bn-suggestion-menu"
      ref={menuRef}
      role="listbox"
    >
      {groups.map(([group, groupItems]) => {
        const iconItems = groupItems.filter(({ item }) => item.iconOnly);
        const regularItems = groupItems.filter(({ item }) => !item.iconOnly);
        return (
          <section className="slash-menu-group" key={group}>
            <div className="slash-menu-group-label">{group}</div>
            {iconItems.length > 0 && (
              <div className="slash-menu-icon-grid">
                {iconItems.map(({ item, index }) => renderItem(item, index, true))}
              </div>
            )}
            {regularItems.map(({ item, index }) => renderItem(item, index))}
          </section>
        );
      })}
      {items.length === 0 && loadingState === "loaded" && (
        <div className="slash-menu-empty">没有匹配的组件</div>
      )}
    </div>
  );
}

const readUpdateGuideStage = (version: string): UpdateGuideStage => {
  const saved = localStorage.getItem(updateGuideKey(version));
  return saved === "about" || saved === "check" || saved === "done" ? saved : "more";
};
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
  parseBlockLink,
  revealBlock,
} from "./editor/blockLinks";
import { pasteBlockLink } from "./editor/blockLinkPaste";
import {
  cloneDocument,
  EMPTY_DOCUMENT,
  htmlFileName,
  isBlackDocument,
  makeHeadingsToggleable,
} from "./editor/document";
import { PreserveHeadingLevelExtension } from "./editor/preserveHeadingLevel";
import { HeadingNumberExtension } from "./editor/headingNumberExtension";
import { importMarkdownBlocks } from "./editor/markdownImport";
import { filterSlashMenuItems, shouldOpenSlashMenu } from "./editor/slashMenuSearch";
import { imageToolbarFloatingUIOptions, installImageToolbarHover } from "./editor/imageToolbarHover";
import { installSplitDividerHover } from "./editor/splitDividerHover";
import { changesAffectOutline, getOutlineItems, type OutlineItem } from "./editor/outline";
import { FindAndReplaceExtension } from "./editor/findAndReplace";
import { InheritColumnFormatExtension } from "./editor/inheritColumnFormat";
import { TableEnterNavigationExtension } from "./editor/tableEnterNavigation";
import { BlackDocTableHandle } from "./components/TableHandleMenu";
import { pasteTableImage } from "./editor/tableImagePaste";
import { blackDocSchema, type BlackDocBlock, type BlackDocEditor } from "./editor/schema";
import { createSplitPane, isInsideSplitPane } from "./editor/splitPane";
import { SplitPaneExtension, SPLIT_DOCUMENT_REPLACE_META } from "./editor/splitPaneExtension";
import { BlockMarqueeExtension } from "./editor/blockMarquee";
import { OptimizedTrailingNodeExtension } from "./editor/trailingNodeExtension";
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
    disableExtensions: ["trailingNode"],
    extensions: [
      OptimizedTrailingNodeExtension(),
      PreserveHeadingLevelExtension(),
      HeadingNumberExtension(),
      FindAndReplaceExtension(),
      InheritColumnFormatExtension(),
      TableEnterNavigationExtension(),
      HeadingSectionsExtension(),
      BlockMarqueeExtension(),
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
          if (!revealBlock(blockId, "center")) {
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
      if (pasteTableImage(activeEditor, event.clipboardData, fileToDataUrl, error => {
        setNotice({ tone: "error", message: `表格图片粘贴失败：${String(error)}` });
      })) return true;
      return pasteBlockLink(activeEditor, event.clipboardData) || defaultPasteHandler();
    },
  });
  const pendingSlashBlockRef = useRef<PendingSlashBlockRef["current"]>(null);
  const [slashMenuPlacement, setSlashMenuPlacement] =
    useState<SlashMenuPlacement>("bottom-start");
  const updateSlashMenuPlacement = useCallback(() => {
    const anchor = pendingSlashBlockRef.current?.anchorRect;
    if (anchor) {
      const nextPlacement = getPlusAnchorPlacement(anchor);
      setSlashMenuPlacement(current => current === nextPlacement ? current : nextPlacement);
      return;
    }

    const view = editor.prosemirrorView;
    if (!view) return;

    const cursor = view.coordsAtPos(view.state.selection.head);
    const cursorTop = cursor.top;
    const leftSpace = cursor.left - SLASH_MENU_GAP - VIEWPORT_PADDING;
    const viewportMiddle = document.documentElement.clientHeight / 2;
    const nextPlacement = leftSpace >= SLASH_MENU_WIDTH
      ? "left-end"
      : cursorTop >= viewportMiddle
        ? "top-start"
        : "bottom-start";
    setSlashMenuPlacement(current => current === nextPlacement ? current : nextPlacement);
  }, [editor]);
  const slashMenuFloatingUIOptions = useMemo(() => ({
    elementProps: { style: { zIndex: 26 } },
    useFloatingOptions: {
      placement: slashMenuPlacement,
      middleware: [
        {
          name: "plusButtonAnchor",
          fn({ rects, middlewareData }) {
            const anchor = pendingSlashBlockRef.current?.anchorRect;
            if (!anchor || middlewareData.plusButtonAnchor?.positioned) return {};

            return {
              data: { positioned: true },
              reset: {
                placement: getPlusAnchorPlacement(anchor),
                rects: { ...rects, reference: anchor },
              },
            };
          },
        } satisfies Middleware,
        offset(10),
        ...(["left", "right", "top", "bottom"].includes(slashMenuPlacement)
          ? [shift({ padding: SLASH_MENU_VIEWPORT_PADDING })]
          : slashMenuPlacement.startsWith("left-")
          ? [shift({ mainAxis: true, crossAxis: false, padding: SLASH_MENU_VIEWPORT_PADDING })]
          : [
              flip({
                fallbackPlacements: [getSlashMenuFallbackPlacement(slashMenuPlacement)],
                padding: SLASH_MENU_VIEWPORT_PADDING,
              }),
              shift({ padding: SLASH_MENU_VIEWPORT_PADDING }),
            ]),
        size({
          apply({ elements, availableHeight }) {
            elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
            elements.floating.style.maxWidth = `calc(100vw - ${2 * VIEWPORT_PADDING}px)`;
          },
          padding: SLASH_MENU_VIEWPORT_PADDING,
        }),
      ],
    },
  }), [pendingSlashBlockRef, slashMenuPlacement]);
  useEffect(() => {
    updateSlashMenuPlacement();
    window.addEventListener("resize", updateSlashMenuPlacement);
    document.addEventListener("scroll", updateSlashMenuPlacement, true);
    return () => {
      window.removeEventListener("resize", updateSlashMenuPlacement);
      document.removeEventListener("scroll", updateSlashMenuPlacement, true);
    };
  }, [updateSlashMenuPlacement]);

  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>(() =>
    getOutlineItems(editor.document),
  );
  const editorInstanceRef = useRef(editor);

  useEffect(() => {
    if (typeof editor.getExtension !== "function") return;
    return installImageToolbarHover(editor);
  }, [editor]);

  useEffect(() => installSplitDividerHover(editor), [editor]);

  const bootstrappedRef = useRef(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [busy, setBusy] = useState(false);
  const [savingKind, setSavingKind] = useState<"document" | "draft" | null>(null);
  const [importingMarkdown, setImportingMarkdown] = useState(false);
  const [desktopReady, setDesktopReady] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [update, setUpdate] = useState<UpdateCheckResult | { kind: "checking" }>({ kind: "checking" });
  const [updateGuideStage, setUpdateGuideStage] = useState<UpdateGuideStage>("done");
  const [updateAction, setUpdateAction] = useState<UpdateAction>({ kind: "idle" });
  const downloadedUpdateRef = useRef<Update | null>(null);
  const updateBusyRef = useRef(false);
  const updateRequestRef = useRef(0);
  const checkUpdates = useCallback(async () => {
    const request = ++updateRequestRef.current;
    setUpdate({ kind: "checking" });
    const result = await checkForUpdate(packageInfo.version);
    if (request === updateRequestRef.current) {
      setUpdate(result);
      setUpdateGuideStage(result.kind === "available" ? readUpdateGuideStage(result.version) : "done");
    }
  }, []);
  const advanceUpdateGuide = useCallback((expected: UpdateGuideStage, next: UpdateGuideStage) => {
    if (update.kind !== "available" || updateGuideStage !== expected) return;
    localStorage.setItem(updateGuideKey(update.version), next);
    setUpdateGuideStage(next);
  }, [update, updateGuideStage]);
  const openAboutDialog = useCallback(() => {
    if (update.kind === "available" && updateGuideStage !== "done") {
      localStorage.setItem(updateGuideKey(update.version), "check");
      setUpdateGuideStage("check");
    }
    setAboutOpen(true);
  }, [update, updateGuideStage]);
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
  const [aiDirectory, setAiDirectory] = useState<string | null>(null);
  const aiRevisionRef = useRef({ content: "", revision: "" });
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
    (delay = AUTO_SAVE_DELAY_MS) => {
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

    const snapshot = editor.document;
    const version = changeVersionRef.current;
    saveInFlightRef.current = true;
    setSavingKind(desktopPathRef.current ? "document" : "draft");

    try {
      if (desktopPathRef.current) {
        setStatus("saving");
        await saveDesktopDocument(
          snapshot,
          desktopPathRef.current,
          fileName ?? DEFAULT_DOCUMENT_FILE_NAME,
          false,
        );
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
      setSavingKind(null);
      if (changeVersionRef.current !== version) {
        schedulePersistence();
      }
    }
  }, [editor, fileName, schedulePersistence]);

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
      const normalizedBlocks = makeHeadingsToggleable(nextBlocks);
      window.dispatchEvent(new Event("blackdoc-close-canvas"));
      window.dispatchEvent(new Event("blackdoc-close-image"));
      suppressChangesRef.current = true;
      editor.transact(tr => {
        tr.setMeta(SPLIT_DOCUMENT_REPLACE_META, true);
        tr.setMeta(RESET_DOCUMENT_FOLDS_META, true);
        editor.replaceBlocks(editor.document, normalizedBlocks);
      });
      setOutlineItems(getOutlineItems(editor.document));
      queueMicrotask(() => {
        suppressChangesRef.current = false;
      });
    },
    [editor, setOutlineItems],
  );

  useEffect(() => {
    if (editorInstanceRef.current === editor) return;
    const previousEditor = editorInstanceRef.current;
    editorInstanceRef.current = editor;
    replaceDocument(previousEditor.document);
  }, [editor, replaceDocument]);

  const saveCurrentDocument = useCallback(
    async (saveAs = false): Promise<boolean> => {
      if (saveInFlightRef.current) {
        setNotice({ tone: "info", message: "当前保存完成后再试一次。" });
        return false;
      }

      const snapshot = editor.document;
      const version = changeVersionRef.current;
      saveInFlightRef.current = true;
      setSavingKind("document");
      setBusy(true);

      try {
        const saved = await saveDesktopDocument(
          snapshot,
          desktopPathRef.current,
          fileName ?? DEFAULT_DOCUMENT_FILE_NAME,
          saveAs,
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
        setSavingKind(null);
        setBusy(false);
      }
    },
    [editor, fileName, schedulePersistence],
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
    setImportingMarkdown(true);
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
      schedulePersistence();
      const warnings = [...imported.warnings, ...converted.warnings];
      setNotice({
        tone: warnings.length ? "warning" : "info",
        message: warnings.length
          ? `Markdown 已导入；${warnings.slice(0, 3).join("；")}`
          : "Markdown 已导入。",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setImportingMarkdown(false);
      setBusy(false);
    }
  }, [clearSaveTimer, editor, replaceDocument, schedulePersistence]);

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
      const exported = await exportDesktopHtml(
        result.html,
        htmlFileName(fileName ?? DEFAULT_DOCUMENT_FILE_NAME, snapshot),
      );
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
    if (suppressChangesRef.current || !desktopReady) {
      return;
    }

    const changes = getChanges();
    if (changes.length === 0) return;

    const outlineAffected = changesAffectOutline(changes);
    if (outlineAffected) {
      setOutlineItems(getOutlineItems(editor.document));
    }
    changeVersionRef.current += 1;
    dirtyRef.current = true;
    unsafeChangesRef.current = true;
    setStatus("unsaved");
    schedulePersistence();
  }, [desktopReady, editor, schedulePersistence, setOutlineItems, setStatus]);
  useEffect(() => {
    if (!aiDirectory || !desktopReady) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let response: unknown = null;
    const revision = () => {
      const content = JSON.stringify([desktopPathRef.current, editor.document]);
      if (content !== aiRevisionRef.current.content) {
        aiRevisionRef.current = { content, revision: crypto.randomUUID() };
      }
      return aiRevisionRef.current.revision;
    };
    const poll = async () => {
      try {
        const request = await invoke<{ id?: unknown } | null>("desktop_ai_exchange", {
          snapshot: { revision: revision(), path: desktopPathRef.current, blocks: editor.document }, response,
        });
        response = null;
        if (!disposed && request) {
          try {
            if (openingRef.current || closingRef.current) throw new Error("文档正在切换或关闭。");
            applyAiDocument(editor, request, revision());
            response = { id: request.id, ok: true, revision: revision() };
            schedulePersistence(0);
          } catch (error) {
            response = { id: request.id, ok: false, error: String(error) };
          }
        }
      } catch (error) {
        if (!disposed) setNotice({ tone: "error", message: String(error) });
      }
      if (!disposed) timer = setTimeout(() => void poll(), 750);
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [aiDirectory, desktopReady, editor, schedulePersistence]);
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
      if (!initial.document && !initial.draft && localStorage.getItem(FIRST_LAUNCH_KEY) !== "true") {
        const example: unknown = JSON.parse(exampleDocumentSource);
        if (!isBlackDocument(example)) throw new Error("功能示例文档无效。");
        replaceDocument(example);
        setStatus("unsaved");
      }
      localStorage.setItem(FIRST_LAUNCH_KEY, "true");
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
      if (key === "t" && !event.shiftKey && !event.altKey &&
        event.target instanceof Element && event.target.closest(".ProseMirror") &&
        desktopReady && !recoveryDraft && !openingRef.current && editor.isEditable) {
        event.preventDefault();
        insertOrUpdateBlockForSlashMenu(editor, {
          type: "table",
          content: {
            type: "tableContent",
            rows: Array.from({ length: 2 }, () => ({ cells: ["", "", ""] })),
          },
        });
        return;
      }
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
  }, [desktopReady, editor, recoveryDraft, requestNewDocument, requestOpenDocument, saveCurrentDocument]);

  useEffect(() => () => clearSaveTimer(), [clearSaveTimer]);

  const toggleOutline = () => {
    setOutlineCollapsed((current) => {
      const next = !current;
      localStorage.setItem("blackdoc:outline-collapsed", String(next));
      return next;
    });
  };

  const documentName = fileName ?? DEFAULT_DOCUMENT_FILE_NAME;
  useEffect(() => {
    if (desktopReady) {
      void getCurrentWindow().setTitle(`${documentName} - BlackDoc`);
    }
  }, [desktopReady, documentName]);
  const isSaving =
    !desktopReady || busy || status === "saving" || status === "draft-saving";
  const getSlashMenuItems = useCallback(
    async (query: string, blockId?: string) => {
      const defaultItems = getDefaultReactSlashMenuItems(editor)
        .filter(item =>
          !item.title.startsWith("可折叠")
        )
        .map(item => {
          const shortcut = headingShortcuts.get(item.title);
          const level = headingLevels.get(item.title);
          return {
            ...item,
            ...(shortcut ? { badge: formatKeyboardShortcut(shortcut) } : {}),
            ...(level
              ? {
                  onItemClick: () =>
                    insertOrUpdateBlockForSlashMenu(editor, {
                      type: "heading",
                      props: { level, isToggleable: true },
                    }),
                }
              : {}),
          };
        });

      const groupedItems = combineByGroup(defaultItems, [
        ...getMultiColumnSlashMenuItems(editor),
        ...getDiagramSlashMenuItems(editor),
        ...getMathSlashMenuItems(editor),
        ...(!isInsideSplitPane(
          editor.document,
          blockId ?? editor.getTextCursorPosition().block.id,
        )
          ? [
              {
                title: "双分区",
                aliases: ["split", "columns", "scrollytelling", "shuangfenqu"],
                group: "其他",
                icon: <Columns2 aria-hidden="true" size={18} />,
                onItemClick: () => {
                  const inserted = insertOrUpdateBlockForSlashMenu(
                    editor,
                    createSplitPane(),
                  );
                  const first = inserted.children[0]?.children[0];
                  if (first) editor.setTextCursorPosition(first, "start");
                },
              },
            ]
          : []),
        {
          title: "画布",
          aliases: ["canvas", "drawing", "huabu"],
          group: "其他",
          icon: <PenTool aria-hidden="true" size={18} />,
          onItemClick: () =>
            insertOrUpdateBlockForSlashMenu(editor, { type: "canvas" }),
        },
      ]).map(item => {
        const iconOnly = iconOnlySlashTitles.has(item.title);
        return {
          ...item,
          subtext: undefined,
          iconOnly,
          group: iconOnly ? "基础" : item.group,
        };
      });

      const itemsByGroup = new Map<string, SlashMenuItem[]>();
      for (const item of groupedItems) {
        const group = item.group ?? "其他";
        const groupItems = itemsByGroup.get(group) ?? [];
        groupItems.push(item);
        itemsByGroup.set(group, groupItems);
      }
      const orderedItems = [...itemsByGroup.values()].flatMap(groupItems => [
        ...groupItems
          .filter(item => item.iconOnly)
          .sort((left, right) => {
            const leftRank = slashIconOrder.indexOf(left.title);
            const rightRank = slashIconOrder.indexOf(right.title);
            return (leftRank < 0 ? Number.MAX_SAFE_INTEGER : leftRank) -
              (rightRank < 0 ? Number.MAX_SAFE_INTEGER : rightRank);
          }),
        ...groupItems.filter(item => !item.iconOnly),
      ]);

      return filterSlashMenuItems(
        orderedItems,
        query,
        editor.prosemirrorView.composing,
      );
    },
    [editor],
  );
  const handleSlashMenuItemClick = useCallback(
    (item: DefaultReactSuggestionItem) => {
      item.onItemClick();
    },
    [],
  );

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
        onAbout={openAboutDialog}
        aiEnabled={aiDirectory !== null}
        onCopyAiDirectory={() => {
          if (!aiDirectory) return;
          void navigator.clipboard.writeText(aiDirectory).then(() => {
            setNotice({ tone: "info", message: `已复制 AI 连接目录：${aiDirectory}` });
          }).catch(() => setNotice({ tone: "info", message: `AI 连接目录：${aiDirectory}` }));
        }}
        onToggleAi={() => {
          void invoke<string | null>("desktop_ai_enable", { enabled: !aiDirectory }).then(directory => {
            setAiDirectory(directory);
            if (directory) setNotice({ tone: "info", message: `AI 文档连接目录：${directory}` });
          }).catch(error => setNotice({ tone: "error", message: String(error) }));
        }}
        onMoreOpen={() => advanceUpdateGuide("more", "about")}
        onShortcuts={() => setShortcutsOpen(true)}
        updateAvailable={update.kind === "available"}
        updateGuideStage={updateGuideStage}
        status={status}
      />
      {findOpen && <FindReplaceBar editor={editor} onClose={() => setFindOpen(false)} />}

      {update.kind === "available" && !updateDismissed && (
        <div className="update-notice" role="status">
          <span>BlackDoc v{update.version.replace(/^v/, "")} 已发布</span>
          <button onClick={openAboutDialog} type="button">查看更新</button>
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

      {savingKind && (
        <div className="notice save-progress" role="status" aria-label="保存进度" aria-live="polite">
          <span className="import-progress-spinner" aria-hidden="true" />
          <span>{savingKind === "draft" ? "正在暂存草稿…" : "正在保存…"}</span>
        </div>
      )}

      {importingMarkdown && (
        <div className="notice import-progress" role="status" aria-live="polite">
          <span className="import-progress-spinner" aria-hidden="true" />
          <span>正在导入 Markdown，请稍候…</span>
        </div>
      )}

      <div
        className={`workspace ${outlineCollapsed ? "outline-collapsed" : ""}`}
      >
        <DocumentOutline
          items={outlineItems}
          collapsed={outlineCollapsed}
          onToggle={toggleOutline}
        />
        <main className="editor-region">
          <BlockNoteView
            editor={editor}
            editable={desktopReady && !recoveryDraft && !opening}
            formattingToolbar={false}
            linkToolbar={false}
            onSelectionChange={updateSlashMenuPlacement}
            onChange={handleEditorChange}
            sideMenu={false}
            slashMenu={false}
            tableHandles={false}
            theme={theme}
          >
            <SuggestionMenuController
              triggerCharacter="/"
              shouldOpen={shouldOpenSlashMenu}
              portalElement={document.body}
              floatingUIOptions={slashMenuFloatingUIOptions}
              getItems={getSlashMenuItems}
              suggestionMenuComponent={CompactSlashMenu}
              onItemClick={handleSlashMenuItemClick}
            />
            <SuggestionMenuController
              triggerCharacter="、"
              shouldOpen={shouldOpenSlashMenu}
              portalElement={document.body}
              floatingUIOptions={slashMenuFloatingUIOptions}
              getItems={getSlashMenuItems}
              suggestionMenuComponent={CompactSlashMenu}
              onItemClick={handleSlashMenuItemClick}
            />
            <FormattingToolbarController
              formattingToolbar={BlackDocFormattingToolbar}
              floatingUIOptions={imageToolbarFloatingUIOptions}
            />
            <BlackDocSideMenuController
              getBlockCreationItems={getSlashMenuItems}
              blockCreationMenu={CompactSlashMenu}
              pendingSlashBlockRef={pendingSlashBlockRef}
              updateSlashMenuPlacement={updateSlashMenuPlacement}
            />
            <TableHandlesController tableCellHandle={HiddenTableCellHandle} tableHandle={BlackDocTableHandle} />
            <LinkToolbarController linkToolbar={BlackDocLinkToolbar} />
          </BlockNoteView>
        </main>
      </div>

      <CanvasEditorHost editor={editor} />
      <ImageViewerHost />
      {aboutOpen && (
        <AboutDialog
          version={packageInfo.version}
          update={update}
          updateAction={updateAction}
          showUpdateGuide={update.kind === "available" && updateGuideStage === "check"}
          onCheck={() => {
            advanceUpdateGuide("check", "done");
            void checkUpdates();
          }}
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
