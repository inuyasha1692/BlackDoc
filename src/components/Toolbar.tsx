import {
  Download,
  Ellipsis,
  FilePlus2,
  FileUp,
  FolderOpen,
  BookOpen,
  Info,
  Keyboard,
  Save,
  SaveAll,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AppTheme } from "../theme";

export type SaveStatus =
  | "idle"
  | "unsaved"
  | "draft-saving"
  | "draft-saved"
  | "saving"
  | "saved"
  | "error";

const STATUS_LABELS: Record<SaveStatus, string> = {
  idle: "新文档",
  unsaved: "未保存",
  "draft-saving": "正在暂存草稿…",
  "draft-saved": "草稿已暂存",
  saving: "正在保存…",
  saved: "已保存",
  error: "保存失败",
};

interface ToolbarProps {
  theme: AppTheme;
  onToggleTheme: () => void;
  onFind: () => void;
  findOpen: boolean;
  documentName: string;
  status: SaveStatus;
  busy: boolean;
  onNew: () => void;
  onOpen: () => void;
  onImportMarkdown: () => void;
  onOpenExample: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onAbout: () => void;
  onShortcuts: () => void;
  updateAvailable?: boolean;
}

export function Toolbar({
  theme,
  onToggleTheme,
  onFind,
  findOpen,
  documentName,
  status,
  busy,
  onNew,
  onOpen,
  onImportMarkdown,
  onOpenExample,
  onSave,
  onSaveAs,
  onExport,
  onAbout,
  onShortcuts,
  updateAvailable = false,
}: ToolbarProps) {
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const closeOnOutsideInteraction = (event: PointerEvent | FocusEvent) => {
      const wrapper = moreMenuRef.current;
      if (moreOpen && wrapper && !wrapper.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && moreOpen) {
        setMoreOpen(false);
        moreTriggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    document.addEventListener("focusin", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
      document.removeEventListener("focusin", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  const runMenuAction = (action: () => void) => {
    setMoreOpen(false);
    action();
  };

  return (
    <header className="toolbar">
      <div className="toolbar-context">
        <div className="brand" aria-label="BlackDoc">
          <span className="brand-mark">B</span>
          <span className="brand-name">BlackDoc</span>
        </div>
        <span className="toolbar-context-separator" aria-hidden="true" />
        <div className="toolbar-document">
          <span className="document-name" title={documentName}>
            {documentName}
          </span>
          <span className={`save-status ${status}`} role="status">
            {STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      <div className="toolbar-actions" role="toolbar" aria-label="文档操作">
        <button disabled={busy} onClick={onOpen} title="打开文件 (Ctrl+O)" type="button">
          <FolderOpen aria-hidden="true" size={17} />
          <span>打开</span>
        </button>
        <button disabled={busy} onClick={onSave} title="保存 (Ctrl+S)" type="button">
          <Save aria-hidden="true" size={17} />
          <span>保存</span>
        </button>
        <button disabled={busy} onClick={onExport} title="导出单文件 HTML" type="button">
          <Download aria-hidden="true" size={17} />
          <span>导出 HTML</span>
        </button>
      </div>

      <div className="toolbar-utilities" role="toolbar" aria-label="编辑器工具">
        <button
          aria-label="查找替换"
          aria-pressed={findOpen}
          className="icon-button"
          onClick={onFind}
          title="查找替换 (Ctrl+F)"
          type="button"
        >
          <Search aria-hidden="true" size={18} />
        </button>
        <div className="toolbar-more" ref={moreMenuRef}>
          <button
            aria-controls="toolbar-more-menu"
            aria-expanded={moreOpen}
            aria-haspopup="true"
            aria-label={updateAvailable ? "更多操作，有新版本" : "更多操作"}
            className="icon-button toolbar-more-trigger"
            onClick={() => setMoreOpen(open => !open)}
            title={updateAvailable ? "更多操作，有新版本" : "更多操作"}
            ref={moreTriggerRef}
            type="button"
          >
            <Ellipsis aria-hidden="true" size={19} />
            {updateAvailable && <span className="update-dot" aria-hidden="true" />}
          </button>
          {moreOpen && (
            <div className="toolbar-menu-panel" id="toolbar-more-menu" aria-label="更多操作">
              <div className="toolbar-menu-section" role="group" aria-label="文档">
                <span className="toolbar-menu-heading">文档</span>
                <button disabled={busy} onClick={() => runMenuAction(onNew)} type="button">
                  <FilePlus2 aria-hidden="true" size={16} />
                  <span>新建文档</span>
                </button>
                <button disabled={busy} onClick={() => runMenuAction(onImportMarkdown)} type="button">
                  <FileUp aria-hidden="true" size={16} />
                  <span>导入 Markdown</span>
                </button>
                <button disabled={busy} onClick={() => runMenuAction(onSaveAs)} type="button">
                  <SaveAll aria-hidden="true" size={16} />
                  <span>另存为</span>
                </button>
              </div>
              <div className="toolbar-menu-section" role="group" aria-label="帮助与设置">
                <span className="toolbar-menu-heading">帮助与设置</span>
                <button disabled={busy} onClick={() => runMenuAction(onOpenExample)} type="button">
                  <BookOpen aria-hidden="true" size={16} />
                  <span>功能示例</span>
                </button>
                <button onClick={() => runMenuAction(onShortcuts)} type="button">
                  <Keyboard aria-hidden="true" size={16} />
                  <span>快捷键一览</span>
                </button>
                <button
                  aria-pressed={theme === "dark"}
                  onClick={() => runMenuAction(onToggleTheme)}
                  type="button"
                >
                  {theme === "dark"
                    ? <Sun aria-hidden="true" size={16} />
                    : <Moon aria-hidden="true" size={16} />}
                  <span>{theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}</span>
                </button>
                <button
                  aria-label={updateAvailable ? "关于与更新，有新版本" : "关于与更新"}
                  onClick={() => runMenuAction(onAbout)}
                  title={updateAvailable ? "有新版本可用" : undefined}
                  type="button"
                >
                  <Info aria-hidden="true" size={16} />
                  <span>关于与更新</span>
                  {updateAvailable && <span className="toolbar-menu-update">新版本</span>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
