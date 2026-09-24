# BlackDoc

![BlackDoc 编辑器与文档大纲](docs/images/editor-overview.png)

BlackDoc 是一款基于 BlockNote 和 Tauri 的 Windows 桌面块编辑器。文档以可继续编辑的 `.bdoc` 文件保存在本地，也可以导出为便于分享的单文件 HTML。

旧版 `.blackdoc` 文档仍可打开，并可继续保存到原文件；另存为时默认使用 `.bdoc`。

## 主要特色

- **双分区阅读与写作**：把截图、表格等参考材料固定在左侧，右侧独立滚动阅读长篇说明；两侧标题仍可从大纲定位。
- **块内链接直达内容**：为任意内容块复制链接，粘贴到文档后点击即可定位并短暂高亮。适合从会议纪要、问题清单或文档修订记录跳回正文段落。
- **可编辑的嵌入式画布**：在正文中插入 Excalidraw 画布，直接绘制、连线、加文字或贴图，适合在文档里标注和讲解。源文件保留可编辑画布数据。
- **一键导出单文件 HTML**：正文、样式、大纲、块链接、双分区、多栏，以及画布预览和画布内图片都汇集到一个 HTML 文件，方便发给同事查看。导出后的画布可放大查看，但不能在 HTML 中编辑。

HTML 导出会尝试内嵌远程图片。若图片源站禁止跨域读取或网络不可用，BlackDoc 会提示仍需联网加载这些图片；文档中已内嵌的图片和画布资源会随 HTML 一起保存。

## 还有这些能力

BlackDoc 保留 BlockNote 的文本格式工具栏、`/` 插入菜单、表格、列表、媒体等编辑体验，并接入官方多栏、图表和数学公式扩展。左侧大纲、块链接、双分区、Excalidraw 画布、查找替换、自动暂存和主题切换由 BlackDoc 提供或定制。

## 试用功能示例

下载并用 BlackDoc 打开[功能展示示例](files/BlackDoc功能展示示例.bdoc)，可以检查原生编辑操作和 BlackDoc 的特色功能。双分区章节展示左侧固定参考表、右侧滚动阅读长篇说明。

更完整的操作步骤和界面截图见[使用指南](docs/user-guide.md)。

## 开发运行

Windows 桌面开发需要 Node.js、Rust MSVC 工具链、Visual Studio C++ Build Tools（含 Windows SDK）和 WebView2：

```powershell
npm install
npm run desktop:dev
```

也可以双击仓库根目录中的 `启动 BlackDoc 开发版.cmd`。开发中的前端修改会热更新；日常调试不需要重复安装客户端。

`npm run desktop:build` 可构建 Windows 安装包。开发时 Tauri 会自动启动 Vite 供客户端 WebView 加载；直接在浏览器打开该地址不会启动编辑器。客户端开发与验收步骤见[客户端说明](docs/desktop.md)。
