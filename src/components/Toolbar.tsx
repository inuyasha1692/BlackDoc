import {
  Download,
  FilePlus2,
  FolderOpen,
  PanelRightOpen,
  Save,
  SaveAll,
} from "lucide-react";

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
  documentName: string;
  status: SaveStatus;
  busy: boolean;
  outlineCollapsed: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onToggleOutline: () => void;
}

export function Toolbar({
  documentName,
  status,
  busy,
  outlineCollapsed,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onExport,
  onToggleOutline,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="brand" aria-label="BlockDoc">
        <span className="brand-mark">B</span>
        <span className="brand-name">BlockDoc</span>
      </div>

      <div className="toolbar-actions" role="toolbar" aria-label="文档操作">
        <button onClick={onNew} title="新建文档" type="button">
          <FilePlus2 aria-hidden="true" size={17} />
          <span>新建</span>
        </button>
        <button onClick={onOpen} title="打开文件 (Ctrl+O)" type="button">
          <FolderOpen aria-hidden="true" size={17} />
          <span>打开</span>
        </button>
        <span className="toolbar-separator" aria-hidden="true" />
        <button
          disabled={busy}
          onClick={onSave}
          title="保存 (Ctrl+S)"
          type="button"
        >
          <Save aria-hidden="true" size={17} />
          <span>保存</span>
        </button>
        <button
          disabled={busy}
          onClick={onSaveAs}
          title="另存为 (Ctrl+Shift+S)"
          type="button"
        >
          <SaveAll aria-hidden="true" size={17} />
          <span>另存为</span>
        </button>
        <button
          disabled={busy}
          onClick={onExport}
          title="导出单文件 HTML"
          type="button"
        >
          <Download aria-hidden="true" size={17} />
          <span>导出 HTML</span>
        </button>
      </div>

      <div className="toolbar-document">
        <span className="document-name" title={documentName}>
          {documentName}
        </span>
        <span className={`save-status ${status}`} role="status">
          {STATUS_LABELS[status]}
        </span>
        {outlineCollapsed && (
          <button
            aria-label="展开大纲"
            className="icon-button"
            onClick={onToggleOutline}
            title="展开大纲"
            type="button"
          >
            <PanelRightOpen aria-hidden="true" size={18} />
          </button>
        )}
      </div>
    </header>
  );
}

