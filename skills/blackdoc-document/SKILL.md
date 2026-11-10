---
name: blackdoc-document
description: Read or edit BlackDoc .bdoc documents, including documents currently open in the BlackDoc editor. Use when a user asks to inspect or change a BlackDoc document or the document open in BlackDoc.
---

# BlackDoc 文档协作

优先通过本技能目录中的 `bridge.ps1` 与已打开的 BlackDoc 文档协作。运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<本技能目录>\bridge.ps1" list` 查找连接，根据文档路径或名称选择目标；有多个候选且无法判断时询问用户。未保存文档的路径可能为空，不能仅凭空路径猜测目标。

运行 `bridge.ps1 read -Directory "<连接目录>"` 读取编辑器当前快照，再用 `bridge.ps1 apply -Directory "<连接目录>" -InputPath "<请求JSON绝对路径>"` 提交修改。调用 PowerShell 时同样使用 `-NoProfile -ExecutionPolicy Bypass -File`。

连接显示 `textEdits: true` 时，修改段落、标题或列表正文优先提交 `changes`：

```json
{"revision":"<读取的版本号>","changes":[{"op":"updateContent","blockId":"<目标块 ID>","content":[{"type":"text","text":"改后的正文","styles":{}}]}]}
```

`content` 是该块修改后的完整行内内容。沿用读取结果里的链接、样式和其他行内元素；每个块 ID 在一批中只出现一次。结构改动、表格改动或旧版 BlackDoc 仍用 `revision` 加完整 `blocks`；保留现有块 ID、未修改内容和内嵌资源，新增块使用唯一 ID。同一请求只用一种格式。不要向用户输出文档中的完整图片数据、连接凭证或临时文件内容。

成功响应表示修改已应用到编辑器并可撤销；正式文件是否已保存以编辑器状态为准。如果版本冲突，重新读取最新内容并合并后再提交；超时先读取当前正文和响应确认是否已应用，避免重复操作。不要直接修改已打开的 .bdoc 文件。

未找到打开的目标文档时，可以按用户授权和可用工具处理磁盘文件；如果明确要求编辑当前打开窗口而连接不可用，说明情况，不要假定直接写文件会刷新编辑器。
