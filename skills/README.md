# 安装 BlackDoc 文档协作技能

`blackdoc-document` 是面向本机 Agent 的通用技能目录，包含 `SKILL.md` 和 `bridge.ps1`。将整个目录安装到当前 Agent 支持的用户级技能位置，两个文件必须保留在同一目录。

用户让 Agent 安装时：

1. 读取 BlackDoc 官方仓库中的 `skills/blackdoc-document/`，确认两份文件来自同一版本。
2. 确认当前 Agent 的用户级技能安装方式，优先使用其官方安装机制。Codex 默认使用 `CODEX_HOME/skills/blackdoc-document`；未设置 `CODEX_HOME` 时使用用户目录下的 `.codex/skills/blackdoc-document`。Claude Code 的个人技能目录为用户目录下的 `.claude/skills/blackdoc-document`。WorkBuddy 的安装方式可能因版本和运行模式而异，使用其客户端支持的本地技能安装方式；无法确认时说明情况，不要猜测目录。
3. 将目录完整安装或更新到确定的位置，不修改其他技能或用户配置。告知用户安装位置，以及是否需要重新加载技能或开启新会话。
4. 验证技能能被当前 Agent 发现。可请用户打开 BlackDoc 文档，再调用 `bridge.ps1 list` 和 `read` 验证连接；不要在未被要求时修改文档。执行读取前注意响应可能包含完整正文与嵌入资源，不要将其公开或写入共享目录。

连接工具使用 Windows PowerShell 5.1 和本机临时目录，只适用于与 BlackDoc 运行在同一台 Windows 电脑上的本地任务。云端或隔离环境若无法访问该目录，需明确告知用户。Skill 的发现和工具执行仍受各 Agent 的加载规则与权限控制。
