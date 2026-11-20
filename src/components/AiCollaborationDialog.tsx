import { useState } from "react";
import { ActionDialog } from "./ActionDialog";

export const AI_SKILL_INSTALL_PROMPT = "请访问 https://github.com/inuyasha1692/BlackDoc ，阅读仓库中的 skills/README.md，并检查当前 Agent 使用的 blackdoc-document 技能。未安装时，按说明完整安装 skills/blackdoc-document；已安装旧版时，在原位置更新技能文件；文件已与仓库一致时，直接使用。请告知安装或更新结果，以及是否需要重新加载技能或开启新会话。技能加载后，请验证能否读取当前打开的 BlackDoc 文档；验证时不要修改文档。";

export function AiCollaborationDialog({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("");

  const copyPrompt = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(AI_SKILL_INSTALL_PROMPT);
      } else {
        const input = document.createElement("textarea");
        input.value = AI_SKILL_INSTALL_PROMPT;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.append(input);
        try {
          input.select();
          if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
        } finally { input.remove(); }
      }
      setMessage("已复制，请粘贴到你的 AI 助手中。");
    } catch {
      setMessage("复制失败，请手动选择并复制下面的文字。");
    }
  };

  return (
    <ActionDialog title="Agent 共同编辑安装帮助" actions={[
      { label: "复制安装或更新提示词", tone: "primary", onClick: copyPrompt },
      { label: "关闭", onClick: onClose },
    ]}>
      <p>将下面的提示词发给你的 AI 助手，按其提示安装或更新协作技能。技能加载后，可以请求助手编辑当前打开的文档。</p>
      <p>旧版技能需要更新后才支持按块编辑。已加载新版技能时，可跳过此步骤。</p>
      <p>请使用与 BlackDoc 在同一台 Windows 电脑上运行的本地助手。安装或更新后，可能需要重新加载技能或开启新会话。</p>
      <p className="ai-collaboration-prompt">{AI_SKILL_INSTALL_PROMPT}</p>
      {message && <p role="status">{message}</p>}
    </ActionDialog>
  );
}
