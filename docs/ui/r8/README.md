# r8 截图矩阵 · 文档块编辑器（M4 起步）

> 入库位置 `docs/ui/r8/`；由 `powershell -File scripts\shot.ps1 shots -Round r8` 一次性 headless 产出（11 张）。
> 全部截图 `--headless=new -WindowStyle Hidden` 一次性进程，无可见窗口、无常驻浏览器。
> 壳基线 **7 张**（含本轮新增 `docs-tab-active.png`）由脚本 `Invoke-ShellBaseline` 自动重拍到 `docs/ui/shell/`。
> 索引与根 `README.md`「界面与测试对照」+「断言规模」、实现代码同一提交。

## 一、逐图索引（11 张）

| 图 | 形态 | 证据来源 | 对应断言 |
|---|---|---|---|
| [01-docs-empty.png](01-docs-empty.png) | 文档空态：七 tab 壳「文档」激活 + 「全部文档（0）」+ 首次使用引导「建好就自带一个空正文块」；截图钉态注记显式标注 | `?shot=docs-empty` 钉态（真实空库同形态） | e2e「建文档默认首块自动在场（不是零块死路）」；audit「r8 第一次用：建文档默认首块自动在场」 |
| [02-docs-list.png](02-docs-list.png) | **真实链路·文档列表**：3 篇真文档（需求讨论纪要 / 项目周报 / r8 文档块编辑器）+ 选中文档的 2 块轻量编辑器（正文 / 待办）+ 保存 / ＋块 / 删除文档入口 | seed 经 `POST /api/documents` 建 3 篇，页面 `GET /api/documents` 真读回 | audit「r8 GET 文档列表 -> 200」「r8 文档列表含刚建的文档」「r8 GET 单篇文档 -> 200」 |
| [03-docs-editor.png](03-docs-editor.png) | **真实链路·编辑器多类型块**：14 块覆盖 10 种类型（一级/二级/三级标题、正文、无序列表 ×2、有序列表 ×2、待办 ☑/☐、引用、代码块 http、分割线、打印说明）；每块带类型下拉 + ↑↓× 控件；左侧 3 篇文档 | seed 经 13 次 `POST /api/documents/:id/blocks` + 首块 `convert` / `PATCH` 真落库 | e2e「块类型共 10 种」「归一：todo 勾选值字符串 true→布尔」「归一：code 语言去空白」；audit「r8 块列表：position 连号 0..10」 |
| [04-docs-type-switch.png](04-docs-type-switch.png) | **真实链路·块类型切换下拉**：10 项全展开，当前「无序列表」高亮，结构块「分割线」标「不可转」且禁用；其余 9 项显示类型枚举名 | `?shot=docs-type-switch` 在第 4 块真打开菜单；禁用态来自 shared `canConvertBlockType` | e2e「转换：divider→paragraph 禁止（结构块）」「转换：paragraph→divider 禁止」「转换：同类型恒允许」；audit「r8 非法类型转换（divider→paragraph）-> 400」 |
| [05-docs-print-preview.png](05-docs-print-preview.png) | **真实链路·打印预览**：A4 纸面按 position 拼装全文（标题 / 列表符号 / 有序编号 / ☑待办 / 引用竖线 / 代码块 / 分割线），顶部「打印 / 另存为 PDF（window.print）」按钮与「@media print 隐藏工具栏」说明 | `?shot=docs-print` 展开纸面预览；纸面数据来自真实 `GET /api/documents/:id/blocks` | e2e「全文装配：无序/有序编号/todo/引用/分割线同一口径」「全文装配：按 position 拼装」；audit「r8 文档全文读 -> 200」「响应 text 与 shared 装配逐字相等」 |
| [06-docs-narrow.png](06-docs-narrow.png) | 窄屏 488×900（`?narrow=1` 钉态）：七药丸一排不折行、文档列表与编辑器纵排、块操作换行到文本下方 | CSS 断点，确定性钉态 | 无独立断言（CSS 断点，确定性钉态） |
| [07-docs-split-before.png](07-docs-split-before.png) | **真实链路·拆块前**：「需求讨论纪要」1 块「回车拆块演示」 | seed 经 `PATCH /api/blocks/:id` 写入 | audit「r8 回车拆块 -> 201」；e2e「splitBlock 前半段留原块」 |
| [08-docs-split-after.png](08-docs-split-after.png) | **真实链路·拆块后**：两拍之间脚本真发 `POST /api/blocks/:id/split { caret:4 }`（日志 `before=回车拆块 after=演示 blocks=2`）→ 2 块「回车拆块」/「演示」，position 1/2 连号；与 07 哈希互异 | 真 HTTP 拆块，非钉态假数据 | audit「r8 拆块：前半段留原块」「r8 拆块：后半段落新块」「r8 拆块后 position 连续无空洞」；e2e「splitBlock 后 position 连续无空洞」 |
| [09-docs-loading.png](09-docs-loading.png) | 文档页加载态（钉态，「正在读取文档…」） | `?shot=docs-loading` 钉态 | 无独立断言（fetch pending 态，证据为 GET 200 链路 + 本图） |
| [10-docs-error.png](10-docs-error.png) | 文档页错误态（钉态，语义化文案「服务未启动或网络异常」+ 截图钉态说明） | `?shot=docs-error` 钉态 | 无独立断言（httpClient.ts 语义化映射） |
| [11-import-u2-fixes.png](11-import-u2-fixes.png) | **r7 UI 记账 U2 修复证据**：CSV 导入对话框新增「数据行号」列（第 1/2/3 条）；错误清单改「第 2 条数据（CSV 第 3 行）」；确认按钮前新增「确认导入将向「r8 U2 修复验证表」追加 3 行，导入后不可撤销」后果提示 | `?shot=bases-import-errors` 触发真实 `POST /api/tables/:id/import.csv/preview` 返回错误清单 | audit「r7 错误预览：错误行号」「r7 部分失败导入 -> 422（零半态）」；e2e「错误聚合：错误行号精确为第 2 / 3 / 4 行」 |

### 缺图 / 注记

- 任务单要求 6 态（文档空态 / 文档列表 / 编辑器多类型块 / 块类型切换 / 打印预览 / 窄屏）**全覆盖**，另加码 5 张（真实拆块前后对照 / 加载态 / 错误态 / r7 U2 修复证据）。
- 01、09、10 是**钉态**（空态带显式注记、加载 / 错误为确定性 seam）；04、05 在真实 api 数据上钉住 overlays（类型菜单 / 纸面预览）；07、08 是**两拍间真发 HTTP 拆块**的前后对照（r3 假图教训）；其余 02、03、06、11 均消费真实 api 数据。
- 05 的 `window.print()` 在真实按钮点击时调用（`openPrintPreview`）；截图态 `?shot=docs-print` 只展开纸面预览，不触发系统打印对话框（headless 无打印设备）。打印样式表为 `styles.css` 的 `@media print` 段。
- 11 的「确认导入」按钮在预览有错误行时仍可点（r7 已知体验项），服务端 422 + 零半态由 audit 锁定；本轮只做 U2 低成本项（行号口径 + 后果提示），按钮禁用留 M4 视图轮。
- 07/08 与 01/壳基线 `docs-tab-active` 刻意分形：前者为真拆块前后，01 为钉态空态（带注记），壳基线为 seed 清理后的真实 0 文档态（无注记），哈希互异。

## 二、SHA256 自查（11 张两两互异）

`01=A1FF3DDE` · `02=30297EA3` · `03=4D4F5AC9` · `04=C7C49F15` · `05=9A24E8ED` ·
`06=361E5F42` · `07=E1803B56` · `08=1797C435` · `09=51CBA222` · `10=56ECAC31` · `11=B239D851` — **11/11 互异**。

全库 `docs/ui` 共 **88 张 PNG / 86 个互异哈希**；唯一两组同态仍是 r4 已披露组
（`r4/01-project-empty` == `r4/16-project-empty-rework` = `9E5C0C23`；
`r4/05-board-moved` == `r4/13-board-direct` = `8397A028`），**r8 零新增同态组**。
11 张逐张 `read_image` 目验：中文无乱码、无裁切、无布局塌陷，各态画面互异。

## 三、壳基线（自动重拍，7 张）

`workbench-tab-active=3DF3CE41` · `todos-tab-active=07C85BF7` · `schedules-tab-active=2C7B6350` ·
`projects-tab-active=775FC85C` · `board-tab-active=C29866EE` · `bases-tab-active=98D9FB4C` ·
`docs-tab-active=A8EC5C84`。

r8 **新增第 7 个 tab「文档」**：`shot.ps1 Invoke-ShellBaseline` 的 `$tabs` 清单同步扩为 7 项，
`shots -Round r8` / `all` 自动补拍 `docs-tab-active.png` 并同批重拍旧 6 张（r2/r3/r4 三连漏机制化修复继续生效）。
`docs-tab-active` 在 seed 清理后拍，为真实「一张文档都没有」的首次使用引导；与 01 的钉态空态（带注记）哈希互异。

## 四、用户第一次用全链路（headless CDP 真点，独立于本矩阵）

浏览器中已存在的自动化页面（未新开可见窗口）真点真填：
`0 文档空态` → 点「＋ 新建文档」填「CDP r8 第一次用」→ 创建 →
URL `?page=docs&docId=7` + **默认首块自动在场（1 块）** → 输入「第一次用的第一段文字」→
回车在 caret=4 拆块 → 2 块「第一次用」/「的第一段文字」→ 第 2 块类型切「二级标题」→
上移到第 1 位 → 点「保存」→ **reload 重开**：标题 / 块顺序 / 类型 / 文本全在，
`GET /api/documents/7/text` 回查 `blockCount=2` / `text="## 的第一段文字\n第一次用"` →
DELETE 清理（剩余 0 篇）。步步真实 HTTP，非钉态假数据。
