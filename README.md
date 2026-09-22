# BlockDoc

BlockDoc 是一个基于 BlockNote 的本地优先块编辑器。第一版在本机启动，通过 Chrome 或 Edge 访问，并将文档保存为原生 BlockNote 块数组格式的 `.blockdoc.json` 文件。

## 本地运行

已经安装依赖后，可以直接双击仓库根目录中的 `启动 BlockDoc.cmd`。启动器会在后台运行本地服务，并使用默认浏览器打开 BlockDoc。需要结束后台服务时，双击 `关闭 BlockDoc.cmd`。

也可以从终端启动：

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

测试与检查：

```bash
npm test
npm run lint
```

## 功能验收示例

通过 BlockDoc 顶部的【打开】按钮选择 [`files/BlockDoc功能验收示例.blockdoc.json`](files/BlockDoc功能验收示例.blockdoc.json)，可以集中检查当前已经完成的块类型、文本格式、大纲、块链接、媒体、保存和 HTML 导出。

这份文件是持续维护的验收基准。以后新增可在文档中体现的功能时，应同时补充对应示例内容和自动校验，避免另建互不关联的临时样例。

完整范围和验收口径见 [V1 需求基线](docs/requirements-v1.md)。
