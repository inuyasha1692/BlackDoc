import { Bug, ExternalLink, Lightbulb, RefreshCw } from "lucide-react";
import { ActionDialog } from "./ActionDialog";
import type { UpdateCheckResult } from "../updates";

export type UpdateAction =
  | { kind: "idle" }
  | { kind: "downloading"; percent: number | null }
  | { kind: "ready" }
  | { kind: "installing" }
  | { kind: "error"; message: string };

interface AboutDialogProps {
  version: string;
  update: UpdateCheckResult | { kind: "checking" };
  updateAction: UpdateAction;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
  onClose: () => void;
  onOpenLink: (url: string) => void;
}

const repository = "https://github.com/inuyasha1692/BlackDoc";

export function AboutDialog({
  version,
  update,
  updateAction,
  onCheck,
  onDownload,
  onInstall,
  onClose,
  onOpenLink,
}: AboutDialogProps) {
  const status = update.kind === "checking"
    ? "正在检查更新…"
    : update.kind === "available"
      ? `发现新版本 v${update.version.replace(/^v/, "")}`
      : update.kind === "current"
        ? "已是最新发布版本"
        : "暂无可用更新信息";

  return (
    <ActionDialog title="关于 BlackDoc" actions={[{ label: "关闭", onClick: onClose }]}>
      <div className="about-version">
        <span>当前版本</span>
        <strong>v{version}</strong>
      </div>
      <div className="about-update" role="status">
        <span>{status}</span>
        <button
          aria-label="检查更新"
          disabled={update.kind === "checking" || updateAction.kind === "downloading" || updateAction.kind === "ready" || updateAction.kind === "installing"}
          onClick={onCheck}
          title="检查更新"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={16} />
        </button>
      </div>
      {update.kind === "available" && (
        <div className="about-update-action">
          {updateAction.kind === "downloading" && (
            <>
              <span>正在下载更新{updateAction.percent === null ? "…" : `：${updateAction.percent}%`}</span>
              <progress aria-label="更新下载进度" max="100" value={updateAction.percent ?? undefined} />
            </>
          )}
          {updateAction.kind === "ready" && <span>下载完成。保存文档后可重启安装。</span>}
          {updateAction.kind === "installing" && <span>正在启动安装程序…</span>}
          {updateAction.kind === "error" && <span role="alert">{updateAction.message}</span>}
          {(updateAction.kind === "idle" || updateAction.kind === "error") && (
            <button className="dialog-button primary" onClick={onDownload} type="button">下载更新</button>
          )}
          {updateAction.kind === "ready" && (
            <button className="dialog-button primary" onClick={onInstall} type="button">重启并安装</button>
          )}
        </div>
      )}
      <div className="about-links">
        {update.kind === "available" && (
          <button onClick={() => onOpenLink(update.url)} type="button">
            <ExternalLink aria-hidden="true" size={16} />
            查看新版本
          </button>
        )}
        <button onClick={() => onOpenLink(`${repository}/releases`)} type="button">
          <ExternalLink aria-hidden="true" size={16} />
          查看发布记录
        </button>
        <button onClick={() => onOpenLink(`${repository}/issues/new?title=${encodeURIComponent("[问题] ")}`)} type="button">
          <Bug aria-hidden="true" size={16} />
          提交问题
        </button>
        <button onClick={() => onOpenLink(`${repository}/issues/new?title=${encodeURIComponent("[建议] ")}`)} type="button">
          <Lightbulb aria-hidden="true" size={16} />
          提出需求建议
        </button>
      </div>
    </ActionDialog>
  );
}
