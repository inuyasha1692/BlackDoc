import { useState } from "react";
import { ActionDialog } from "./ActionDialog";

export const AI_SKILL_INSTALL_PROMPT = "请访问 https://github.com/inuyasha1692/BlackDoc ，阅读仓库中的 skills/README.md，并按照说明将 skills/blackdoc-document 完整安装到你当前环境可用的技能位置。请告知安装结果及是否需要重新加载或开启新会话。安装后，帮助我验证能否读取当前打开的 BlackDoc 文档；验证时不要修改文档。";

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
      { label: "复制安装提示词", tone: "primary", onClick: copyPrompt },
      { label: "关闭", onClick: onClose },
    ]}>
      <p>首次使用时，将下面的提示词发给你的 AI 助手，按其提示安装协作技能。安装后可直接请求助手编辑当前打开的文档。</p>
      <p>如果已在当前 AI 助手中安装过此技能，可以忽略此步骤。</p>
      <p>请使用与 BlackDoc 在同一台 Windows 电脑上运行的本地助手。安装后可能需要重新加载技能或开启新会话。</p>
      <p className="ai-collaboration-prompt">{AI_SKILL_INSTALL_PROMPT}</p>
      {message && <p role="status">{message}</p>}
    </ActionDialog>
  );
}
