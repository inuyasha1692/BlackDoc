import { ActionDialog } from "./ActionDialog";

interface ShortcutsDialogProps {
  onClose: () => void;
}

const shortcuts = [
  { action: "新建文档（桌面端）", keys: "Ctrl / Cmd + N" },
  { action: "打开文档", keys: "Ctrl / Cmd + O" },
  { action: "保存", keys: "Ctrl / Cmd + S" },
  { action: "另存为", keys: "Ctrl / Cmd + Shift + S" },
  { action: "打开查找替换", keys: "Ctrl / Cmd + F 或 H" },
  { action: "切换行内代码", keys: "Ctrl / Cmd + E", context: "编辑器中" },
  { action: "下一个 / 上一个匹配", keys: "Enter / Shift + Enter", context: "查找框中" },
  { action: "关闭查找替换", keys: "Esc", context: "查找框中" },
  { action: "调整双分区尺寸", keys: "方向键微调，Home / End 到边界", context: "聚焦尺寸控制柄时" },
];

export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  return (
    <ActionDialog title="快捷键一览" actions={[{ label: "关闭", onClick: onClose }]}>
      <dl className="shortcut-list">
        {shortcuts.map(({ action, keys, context }) => (
          <div className="shortcut-row" key={action}>
            <dt>{action}</dt>
            <dd>
              <kbd>{keys}</kbd>
              {context && <span className="shortcut-context">{context}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </ActionDialog>
  );
}
