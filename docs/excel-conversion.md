# 在 Codex 中将 Excel 转为 BlackDoc

当前阶段先在 Codex 中运行转换、生成新的 `.bdoc`，再在 BlackDoc 中检查和人工调校。效果稳定后再设计应用内 Excel 导入。

转换直接读取 `.xlsx` 并生成原生块。语义计划由 Codex 根据规则和事实生成；程序读取源文字，执行计划并核对来源覆盖。以 Excel to MD 的转换规则和已有人工修订结果为阅读结构基线，再根据 BlackDoc 的呈现效果调整格式保留策略。

## 本地准备

需要 Python 3.10+、openpyxl 3.1+，以及本地 Excel to MD 项目的 `convert_excel_to_md.py` 和 `excel2md.md`。转换器路径由命令指定。

在 BlackDoc 仓库的 PowerShell 中设置本次运行路径。每次转换使用新的输出目录：

```powershell
$converter = Join-Path (Resolve-Path '../Excel to MD') 'convert_excel_to_md.py'
$workbook = '待转换工作簿的绝对路径.xlsx'
$run = Join-Path (Get-Location) ('output/excel/' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
```

业务工作簿、上下文、计划、转换结果和预览放在已忽略的 `output/` 中。

## 规则来源与同步

每轮转换或修改转换流程前，读取当前 [excel2md.md](<E:/Coding WorkSpace/Excel to MD/excel2md.md>) 和 `convert_excel_to_md.py`，以实际规则、机器契约和实现为依据。规则或源转换器哈希发生变化时，先审阅差异，再重新确认本工作簿的语义计划；不能只更新旧计划的哈希来绕过检查。源工作簿与转换器哈希均一致时，可用 `context --reuse-context <旧上下文>` 复用已提取事实并读取当前规则。

2026-10-20 已将当前规则与上轮保存的上下文逐项对照。本次规则 SHA-256 为 `1dc2b12f9809b97a3360555aef7be3c585602fc7d4699907983fd2fd0084b3b3`；源转换器哈希未变化。对 BlackDoc 流程的理解同步如下：

- 顶部修订历史优先于源工作表顺序；正文保持源顺序，图片组内部按视觉阅读顺序处理。
- 表格开始只构成候选边界。由父主题或修订说明直接引出的表格继续属于该父块；修订范围由 `fill_region`、`date_heading`、`date_left_fill` 三种模式和计划中的明确起止行确定。
- 有修订候选时必须声明 `revision_blocks`；未覆盖候选须逐行列入 `manual_review`。`image_groups` 可选，图片与文字关系不明时分别输出。
- 标题、编号标签和标题例外统一依据规则 §4.1–§4.2；短名称、编号、底色和列偏移均不能单独决定标题。
- 修订历史附加列明确包含的原始超链接，即使无法解析正文目标也应保留并报告；普通未解析内部链接保留文字并报告。
- 文本框、形状先判断是否为图片内部解释性标注，再决定合并视觉对象或提取独立说明。

上述语义要求需要映射为原生块、单元格属性和块链接；Markdown 专用的 HTML 包装、锚点换行和背景占位不直接套入 `.bdoc`。标题去源底色沿用已确认的 BlackDoc 呈现规则。

本次《活动功能》回归已补齐修订历史前置、未解析内部链接的修订历史附加列例外，以及 `render_as: "separate"` / `vertical_coverage: "insufficient"` 强制分离输出。已结合全部源单元格、图片锚点、修订候选和人工 Markdown 参考版重新审阅计划；图文分区由9组减为1组。此前样例保留其原始规则版本。

## 转换流程

### 共用文档树路径

已实现 `scripts/excel_document.py`：`DocumentCompiler.compile()` 从源单元格和图片引用生成文档树；`bdoc(tree)` 与 `markdown(tree)` 分别输出两种格式。两个适配器不再判断标题、表格边界或图片归属。共用路径当前位于 BlackDoc 转换原型中，Excel to MD 项目原有独立入口尚未迁移到该模块。

语义计划根字段增加 `document_version: 1`，每个工作表提供有序的 `document` 节点和 `omitted_cells`。旧行级计划仍可运行；共用路径同时保留 `revision_blocks` 供修订候选校验。新上下文的 `document_contract` 描述该接口。

```json
{
  "document": [
    {"key": "topic", "kind": "heading", "level": 4, "content": ["C17"]},
    {"key": "label", "kind": "paragraph", "content": [{"cell": "D49", "bold": true}]},
    {"key": "detail", "kind": "paragraph", "content": ["E49"]},
    {"key": "change", "kind": "bullet", "content": ["L118"], "background": "#fff4cc",
     "children": [{"kind": "paragraph", "content": ["L119"], "background": "#fff4cc"}]},
    {"key": "table", "kind": "table", "header_rows": 1,
     "rows": [[{"content": ["B130"]}, {"content": ["H130"]}],
              [{"content": ["B136"]}, {"content": ["H136", {"cell": "R136", "separator": "\n"}]}]]}
  ],
  "omitted_cells": []
}
```

示例只解释字段，不是完整工作表计划；实际计划必须覆盖每个非空源单元格。节点可使用 `heading`、`paragraph`、`bullet`、`ordered`、`code`、`table`、`image`。内容始终引用源坐标，允许拆开同一源行或合并多个源单元格；`separator` 只允许空白。`format: "iso_date"` 可显式选择完整日期。图片节点使用事实中的 `image` 键和像素 `width`，可放在列表项的 `children` 或表格单元格的 `images` 内。

列表项下面属于同一说明的连续行，应放在同一个子段落，通过 `separator: "\n"` 连接源单元格；不要仅因 Excel 换行、跨行就生成多个子段落。确实表达独立段落、条件分支或子列表时才分块，需由语义计划明确判断。《活动功能》的“选中”说明（M90、M91）和“排序”说明（M94、M95）已按此方式确认；这项经验不用于自动合并所有列表子段落。

编译时核对源单元格恰好出现一次、显式跳过理由、图片恰好出现一次、表格矩形、块键唯一、标题护栏和修订背景。正文精确 RGB 保留在树内；修订语义背景覆盖源装饰底色。标题与修订历史表头去源底色沿用已确认策略。代码块暂不支持修订背景；遇到该组合直接报错。

同一次 `render` 会额外生成同名 `.document.json` 与 `.md`，均保护已有文件。文档树包含 `provenance` 来源映射，Markdown 以自包含图片和 HTML 表格保留原生单元格样式。它是同一结构的输出，不作为 `.bdoc` 的中间输入。适配器调试可以复用已保存的树，避免重复提取源事实和重新作语义判断。

字体颜色、文字背景色保留当前工作簿的精确色值。编辑器的 `inlineColorSpec` 为这些 CSS 色值补充行内样式，预设色名仍使用主题色。仅检查 `.bdoc` 中颜色字段存在无法验收显示效果：回归还需检查挂载后的编辑器 DOM 和独立 HTML 的实际样式。2026-10-20 的 v9 预览修复了此处渲染缺失，沿用 v8 的文档树和源色值；参考 MD 的历史色值可能与当前 Excel 不同。

### 1. 提取事实和规则

```powershell
python scripts/excel_to_bdoc.py context --workbook $workbook --converter $converter --output "$run/context.json"
```

上下文复用 Excel to MD 的规则和单元格事实，补充直接从 OOXML 绘图关系中读取的图片位置。部分 WPS 图片不会出现在 openpyxl 的图片列表中，因此不能用该列表的数量作为图片总数。

上下文包含工作簿、规则和源转换器的 SHA-256，以及 `bdoc_contract`。Codex 读取这些事实和已有人工参考结果，生成本次工作簿专用的 `semantic_plan.json`。

### 2. Codex 生成语义计划

计划根字段为 `renderer_version`、`source_sha256`、`rules_sha256`、`converter_sha256`、`title`、`sheets`，哈希从本次上下文复制。

每个工作表均需计划。每个非空行必须有 `rows` 角色或位于显式的 `tables` 区域中。文字从源单元格读取，不在计划中重新抄写或润色。

工作表计划示例：

```json
{
  "rows": {
    "2": {"kind": "heading", "level": 3},
    "3": {"kind": "paragraph"},
    "5": {"kind": "unordered_item"},
    "6": {"kind": "continuation", "indent": 1},
    "8": {"kind": "skip", "reason": "重复的章节名称"}
  },
  "tables": [
    {"start_row": 10, "end_row": 15, "columns": [2, 5, 8], "header_rows": 1}
  ],
  "image_groups": [
    {"start": 20, "end": 26, "layout": "split"}
  ],
  "revision_blocks": [],
  "manual_review": []
}
```

- 行角色沿用 `heading`、`paragraph`、`label`、`compact_label`、`ordered_item`、`unordered_item`、`condition`、`continuation`、`review`、`skip`。
- `indent` 表示嵌套到前方列表项之下，必须存在对应的父项。图片分组和表格会形成结构边界。
- 表格列号是 Excel 中从 1 开始的源列号，必须包括该范围内所有非空内容所在的列。单元格里的文字、富文本、换行和图片生成可编辑的原生表格内容。
- `image_groups` 可指定 `layout: "split"` 双分区，范围内图片放左侧、说明放右侧。只有单一、明确对应且可覆盖的图文关系才采用；`render_as: "separate"` 或 `vertical_coverage: "insufficient"` 强制按源顺序分离输出，保留独立列表、表格、主题和修订结构。
- 未分组的图片按源锚点行生成图片块。表格范围内、但位于表格列之外的图片放在表格前。
- 修订范围及标题克制规则沿用 Excel to MD。日期标记、黄色填充和编号均为判断线索。
- 修订历史沿用 Excel to MD 的识别方式和日期解析规则，表头固定，数据整行按更新时间倒序；同日保持源顺序，无法解析日期的记录保留在末尾。普通数据表保持计划中的源行顺序。
- 修订历史表头不导入源背景色，单元格背景和文字片段背景均清除，包含未命名的附加列表头；保留表头角色和粗体。
- 已识别为标题的内容去掉源单元格背景色及额外粗体。修订范围的语义背景仍由 `revision_blocks` 控制；正文和表格的底色继续按现有规则处理。
- 跳过行或整个工作表必须说明原因，图片不允许静默跳过。

### 3. 生成 `.bdoc`

```powershell
python scripts/excel_to_bdoc.py render --workbook $workbook --converter $converter --plan "$run/semantic_plan.json" --output "$run/文档.bdoc"
```

程序检查计划与工作簿、规则和源转换器是否匹配，核对修订候选范围，执行标题护栏，生成原生块，并检查每个非空源单元格的去向、图片是否遗漏或重复。目标文件或报告已存在时拒绝覆盖。

输出包括 `.bdoc` 和同名 `.report.json`。报告保留单元格到块 ID 的映射、图片映射、跳过理由、标题降级记录、未解析链接和人工确认项。表格内的源单元格链接目前定位到整个表格块。

### 4. 验证与人工调校

运行 Python 回归：

```powershell
python -m unittest discover -s scripts/tests -p 'test_*.py'
```

用实际 BlackDoc schema 加载结果，检查正文、样式、图片和块链接，并导出本地 HTML 预览：

```powershell
$env:BLACKDOC_EXCEL_SAMPLE = "$run/文档.bdoc"
$env:BLACKDOC_EXCEL_PREVIEW = "$run/预览.html"
$env:BLACKDOC_EXCEL_MARKDOWN = "$run/文档.md" # 共用树路径生成的 Markdown
$env:BLACKDOC_EXCEL_REFERENCE = '作为结构参考的 Markdown 绝对路径.md' # 可选
npx vitest run src/editor/excelBdoc.test.ts
Remove-Item Env:BLACKDOC_EXCEL_SAMPLE
Remove-Item Env:BLACKDOC_EXCEL_PREVIEW
Remove-Item Env:BLACKDOC_EXCEL_MARKDOWN
Remove-Item Env:BLACKDOC_EXCEL_REFERENCE
```

最后在 BlackDoc 中打开 `.bdoc` 检查排版与编辑体验。程序检查和 HTML 预览不等于桌面客户端的人工验收。

共用树回归同时通过 `marked` 解析新生成的 Markdown，核对两种输出的标题文本与层级、逐格表格文本、列表层级及内容、代码块、图片数量和内部跳转。指定参考 Markdown 时，另外核对标题序列、表格数量和列表标签顺序；这不代表两个文档的全部文字、样式和表格字段都相同。内容保留差异写入计划的 `reference_differences`。

### 5. 对照人工修订积累规则

每轮保留自动生成的 `.bdoc`、语义计划和来源报告，人工修订另存为一个 `.bdoc`。反馈时提供同轮自动版与人工版，先按稳定块 ID 和来源映射定位，再比较内容、顺序、块类型、层级、布局和样式。记录具体改动、改动原因及适用范围；仅删除标题底色等样式调整也属于有效反馈。

将差异先对照 Excel to MD 已有规则：遗漏的行为补入原生渲染；工作簿特例落入该文档的语义计划；确认可复用的呈现策略写入转换规则并增加相应回归检查。无法判断意图的差异保留为待讨论项。每次规则修改生成新版本，再与人工参考版核对。

当前先由 Codex 读取两份文档进行比较，逐项确认经验；后续样例稳定后再考虑差异报告工具和应用内导入。

## 首版边界和后续反馈

- 颜色映射到 BlackDoc 的主题色板；原始颜色仍保存在提取事实中。
- 支持常见数字、小数、千分位、百分比、前导零和日期格式。无法处理的格式列为人工确认项。
- 公式使用源文件已有的缓存结果；缺少缓存时保留公式文本并报告，本流程不计算 Excel 公式。
- 原生表格按计划列形成逻辑表格。复杂合并、特殊图形、图表、文本框等尚未保证完整还原；识别到的未支持绘图会进入报告。
- 图片宽度、双分区比例和高度先使用固定初值，需要通过样例继续调校。
- 首版每次生成文档副本。人工修改结果应另行保留，后续反馈区分文档特例、语义计划、渲染器和校验问题。自动增量合并人工修改尚未实现。

当前输出状态 `generated` 表示生成和来源核对完成；`needs_review` 表示存在报告中的待确认项。两者都需要实际查看转换效果。
