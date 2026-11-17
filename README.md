# 协流 XieFlow — AI 原生协同办公系统

> Agent 自驱迭代的协同办公平台：待办 / 日程 / 项目 / 看板 / 多维表格 / 文档 / AI 工作台。
> 产品方向参照 [多宝鱼](https://duobaoyu.work/)，迭代方法论参照 [IKanBot](https://github.com/chenpeigen2/IKanBot)（双 agent 流水线 + VERDICT 裁决 + 截图矩阵）。
> **本仓库本身就是一个 agent 自驱迭代的活样本**：每一轮迭代由 AI 员工（研发视角 / 使用者视角 / UI 审查官）完成，全程证据入库——见 [AGENTS.md](AGENTS.md)（宪法）、[workflows/org.md](workflows/org.md)（编制）、[docs/staff/](docs/staff/)（员工履历）、[docs/plan.md](docs/plan.md)（轮次看板）、[docs/feedback/](docs/feedback/)（复验报告）。

## 快速开始

```bash
pnpm install
# 一键启动（推荐）：双击 start.cmd，或：
powershell -File scripts\start.ps1 start   # 起 api:8787 + web:5173，自动开浏览器
powershell -File scripts\start.ps1 stop    # 收服务
# 开发模式：
pnpm dev:api         # api 服务 http://127.0.0.1:8787
pnpm dev:web         # web 界面 http://127.0.0.1:5173
pnpm run test:all    # typecheck + e2e（1087 断言）+ HTTP 审计（923 断言）
```

### 打包（对齐 IKanBot 的 pack/dist 语义）

```bash
pnpm run pack        # 免安装目录 release/xieflow-portable/（进目录双击 start.cmd 即用）
pnpm run dist        # 上述 + 安装包 release/xieflow-setup-<版本>.zip（解压即用）
```

- 免安装目录：内置 web 静态产物 + api 源码 + 运行时依赖，单端口 8080（web+api 同源），数据落在目录内 `data/`
- 安装包 = 免安装目录的 zip；安装语义 = 解压到任意位置 → 双击 `start.cmd`（要求 Node.js ≥ 20）

## 快速开始（贡献者 / 想研究 agent 流水线的人）

1. 读 [AGENTS.md](AGENTS.md)——项目宪法：截图矩阵无例外、每轮发版、双 agent 流水线、断言纪律、危险区清单
2. 读 [workflows/org.md](workflows/org.md)——编制表：项目总监 / 研发视角 / 使用者视角 / UI 审查官（含升级记录）
3. 读 [RUNBOOK.md](RUNBOOK.md)——一轮迭代的完整生命周期与熔断条件
4. 看任意一轮的真实痕迹：[docs/feedback/](docs/feedback/)（复验报告末行 VERDICT）→ [docs/ui/](docs/ui/)（截图矩阵逐张对照断言）→ [docs/staff/](docs/staff/)（每轮履历）

## 迭代方法论要点（从 IKanBot 继承并强化）

- **仓库即状态**：所有进度、证据、报告落仓库文件，agent 会话可断可续，新会话读仓库即可续跑
- **双 agent + VERDICT**：研发实现 → 使用者实跑复验出 VERDICT → UI 审查官字节级验图出 UI-VERDICT → 双通过才发版
- **断言锁定行为**：规模只涨不缩（下降 = 回归 = 冻结发版）；禁自洽占位断言
- **报告三态纪律**：「已做并验过 / 已做但没验 / 没做（原因）」逐条标注，写了「做了」必须真验过
- **总监过程巡查**：研发期间主动巡查代码方向（owner 指令），跑偏立即纠偏，不等复验打回

## 目录结构

```
packages/
  shared/            数据契约与状态机（集中定义，禁止散落 if-else）
  db/                schema.ts（user_version 迁移）/ index.ts / mappers.ts
  agent/             mock provider / ToolRegistry / mock-planner / 录制回放评测集（r9 起）
apps/
  web/               React + Vite 界面（工作台 / 待办四象限 / 日程月视图 / 项目 / 看板 / 多维表格网格 / 文档块编辑器 / AI 工作台）
  api/               Fastify 服务（health / settings / todos / schedules / projects / board / tables+fields+records / views / CSV import / documents / conversations+chat+artifacts）
scripts/
  e2e-test.ts        直连服务层断言
  audit-http.ts      HTTP 路由层审计（含 4xx 分支）
  shot.ps1           截图矩阵脚本（headless Edge，字节级可复现；r4 起含壳基线自动拍摄，r5 起防挂死捕获）
  shot-rework.ps1    r4 返工 #1 全路径证据拍摄（17/18/19）
  start.ps1          一键启动/停止
  pack.js            pack（免安装目录）/ dist（setup zip）
  push-via-api.mjs   GitHub REST API 推送（逐提交 tree 一致性校验）
workflows/           agent 编制表与岗位提示词
docs/
  plan.md            轮次看板与任务单（每轮更新）
  feedback/          研发报告 / 复验报告（VERDICT）/ UI 审查报告
  staff/             agent 员工档案与逐轮履历
  ui/                截图矩阵（逐张对照断言；shell/ 为九 tab 壳基线）
.github/workflows/   CI：三平台 verify + tag 触发 Release
```

## 路线图

M0 立项 ✅ → M1 待办+日程 ✅ → M2 项目+看板 ✅ → M3 多维表格 ✅ → M4 文档 ✅ → M5 AI 工作台 ✅ → M6 知识库 RAG（进行中）→ M7 导图+白板 → M8 组织管理 → M9 网络版 → M10 多端与单机版

进度看板：[docs/plan.md](docs/plan.md)

## 界面与测试对照

按 AGENTS.md 立项规则：**界面更新必须带截图证据（每次，无例外）**，截图与实现同一提交。逐图索引（r1/r2/r3/r4/r5/r6/r7/r8/r9/r10/r11/r12 矩阵全量、逐张对照断言）：

### r12 矩阵：[docs/ui/r12/](docs/ui/r12/README.md) —— 知识库入库与检索（M6 起步，共 7 张）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-knowledge-empty.png](docs/ui/r12/01-knowledge-empty.png) | 知识库空态（九 tab 壳「知识库」激活 + 「＋ 入库」引导 + 首次使用空态钉注；真实 0 篇文档） | e2e「空文本分块 0 片」；audit「r12 GET 知识库文档列表 -> 200」端到端形态 |
| [02-ingest-dialog.png](docs/ui/r12/02-ingest-dialog.png) | 入库对话框（标题 / 来源切换「纯文本·已有文档」/ 内容自动分块提示 / 确认入库；背后为 3 篇真实种子文档） | audit「r12 真入库科技稿 -> 201」「r12 非法 source_type -> 400」 |
| [03-after-ingest.png](docs/ui/r12/03-after-ingest.png) | 入库成功后文档列表（3 篇真种子文档 + 各 1 片 + 纯文本来源徽标） | audit「r12 列表真读回 3 篇」「r12 入库自动分块并算 token_count」 |
| [04-search-results.png](docs/ui/r12/04-search-results.png) | **真实链路·搜索结果**（真查「手机」2 命中，score 降序 + 「来源：docTitle · chunk #id · 第 N 片 · 纯文本」引用 + 命中词高亮） | audit「r12 TF-IDF 排序：词频最高的科技稿居首」「r12 命中带 doc_id/chunk_id 来源引用」；e2e「TF-IDF 排序：手机词频最高的「科技稿」居首」 |
| [05-source-highlight.png](docs/ui/r12/05-source-highlight.png) | **来源引用高亮钉态**（同 2 命中 + 紫色 spotlight 来源条 + 加粗黄色命中词；可溯源到具体 chunk） | audit「r12 稀有词命中可溯源到具体文档 id」；e2e「命中携带 chunk_id 来源引用」 |
| [06-narrow.png](docs/ui/r12/06-narrow.png) | 窄屏 488×900（?narrow=1）：**九药丸横排一行不折行不裁切**、徽章独占下一行；文档列表 + 搜索命中完整 | 无独立数字断言（CSS 断点，逐张目验；九 tab 壳基线同批重拍） |
| [07-error.png](docs/ui/r12/07-error.png) | 错误态（语义化文案 + 操作提示 + 「重试」按钮，钉态） | 无独立断言（4xx 由 audit r12 节锁定） |

### r11 矩阵：[docs/ui/r11/](docs/ui/r11/README.md) —— 多轮上下文与产物生成（M5 收官，共 8 张；第 8 张为 ui-reviewer U1 返工补拍）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-multiturn-chat.png](docs/ui/r11/01-multiturn-chat.png) | **真实链路·多轮对话**（会话 A 两轮：首轮 3 工具真建待办 + 次轮「再建一个」2 工具真建「（再建）」待办；上下文提示 + 「第 2 轮产物」同轮对齐） | audit「r11 第 2 轮回显 repeat 指代元数据」「r11 第 2 轮工具参数引用第 1 轮实体」；e2e「第 2 轮「再建一个」引用第 1 轮真实实体」 |
| [02-context-hint.png](docs/ui/r11/02-context-hint.png) | **上下文提示钉态**（同两轮真实数据 + 注记「2 轮对话 / 6 条落库消息 / repeat 指代已解析」） | e2e「第 2 轮注入 3 条真实落库消息」；audit 同条 |
| [03-artifact-html.png](docs/ui/r11/03-artifact-html.png) | **真实链路·HTML 产物**（iframe 渲染完整 HTML 报告：H1 + 真数据表 + 汇总，非占位） | audit「r11 HTML 内容是完整可打开文档（非占位）」；e2e「HTML 报告是完整可打开文档」 |
| [04-artifact-table.png](docs/ui/r11/04-artifact-table.png) | **真实链路·Markdown 表格产物**（GFM 表头/分隔行/参数列 + 汇总，独立真实产物） | audit「r11 Markdown 内容含真实表格分隔行」；e2e「Markdown 表格转义单元格内竖线」 |
| [05-tools-page2.png](docs/ui/r11/05-tools-page2.png) | **工具链第 2 页**（6/页分页，后 4 个 r11 新增工具在场；中间工具气泡展开 arguments） | audit「r11 工具目录扩到 12 个」；e2e「默认注册表恰 12 个工具」 |
| [06-narrow.png](docs/ui/r11/06-narrow.png) | 窄屏 488×900：**r10 U2-2 修复**（八药丸横排一行不折行不裁切、徽章独占下一行）+ 三栏纵排 | 无独立数字断言（CSS 断点，确定性钉态，逐张目验） |
| [07-error.png](docs/ui/r11/07-error.png) | 错误态（语义化文案 + 操作提示 + 「重试」按钮，钉态） | 无独立断言（4xx 由 audit r11 节锁定） |
| [08-docs-diff-inline.png](docs/ui/r11/08-docs-diff-inline.png) | **r9 U2 必修渲染证据（返工 #1 补拍）**：AI 修订面板原文 `。后面还有一句冗余说明。` 红底删除线（`removed`）+ 建议 `（精简稿）` 绿底粗体（`added`）+ 同名同句 `same` 段，三类 span 同屏可辨；seed 真建文档 → 真调 `/revise {adopt:false}` → 渲染 → 截图 → DELETE 清理 | e2e「局部修改保留 same 段」「局部修改含 removed 段（旧字高亮）」「局部修改含 added 段（新字高亮）」「去掉 removed 段后逐字等于建议文本」「去掉 added 段后逐字等于原文」（r9 U2 `computeInlineDiff` 节 11 条） |

### r10 矩阵：[docs/ui/r10/](docs/ui/r10/README.md) —— AI 工作台对话与工具调用（M5 起步，共 7 张）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-chat-empty.png](docs/ui/r10/01-chat-empty.png) | **工作台空态**（八 tab 壳「AI 工作台」激活 + 三栏首次使用引导 + 空态钉态注记；侧栏 8 个工具取自 shared `TOOL_NAMES`） | audit「r10 GET /api/tools -> 200」「工具目录恰 8 个工具」；e2e「首批工具注册表恰 8 个工具」 |
| [02-conversation-list.png](docs/ui/r10/02-conversation-list.png) | **真实链路·会话列表**（2 个真会话，B 选中 → 空对话流；#1/#2 为 api 真自增 id） | audit「r10 POST 合法会话 -> 201」「r10 GET 会话列表复核 -> 200」 |
| [03-chat-stream.png](docs/ui/r10/03-chat-stream.png) | **真实链路·对话流**（用户蓝气泡 + `工具调用 × 3` + AI 汇总灰气泡；create_todo 真建待办 #50） | audit「r10 一次对话真实触发 3 个工具调用」「r10 create_todo 经 HTTP 真创建待办（查库验证）」 |
| [04-tool-call-bubbles.png](docs/ui/r10/04-tool-call-bubbles.png) | **工具调用气泡（展开回执）**（03↔04 间真发第二次 chat；`tool_calls_json` 的 arguments 就地展开） | audit「r10 tool 消息逐条落 3 个 tool_call（查库验证）」「r10 落库工具调用 arguments 逐字段可读」 |
| [05-artifact-preview.png](docs/ui/r10/05-artifact-preview.png) | **产物预览面板（展开）**（04↔05 间真发第三次 chat；`chat-result` JSON 逐字展示，产物累积 #3） | audit「r10 产物内容含全部 3 条工具回执」「r10 两轮对话产物累积为 2 篇」 |
| [06-narrow.png](docs/ui/r10/06-narrow.png) | 窄屏 488×900（八药丸不溢出、徽章独占一行、三栏纵排、对话流与产物全在场） | 无独立数字断言（CSS 断点，确定性钉态） |
| [07-error.png](docs/ui/r10/07-error.png) | 错误态（`httpClient.ts` 语义化文案 + 操作提示 + 「重试」按钮，钉态） | 无独立断言（语义化错误映射；4xx 由 audit r10 节锁定） |

### r9 矩阵：[docs/ui/r9/](docs/ui/r9/README.md) —— Markdown 导入导出与 AI 块级修订（M4 收官，共 8 张 + 1 份真实 .md 字节证据）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-import-preview.png](docs/ui/r9/01-import-preview.png) | **真实链路·导入预览**（对话框 + 4 块预览表：标题/正文/待办已勾选/引用 + 「整篇替换不可撤销」后果提示，`?shot=docs-import-preview` 真调 preview 端点不写库） | audit「r9 预览：committable=true」「r9 预览：绝不写库」；e2e「导入计划：预览取全部（不足 5 行）」 |
| [02-import-success.png](docs/ui/r9/02-import-success.png) | **真实链路·导入成功后**（01↔02 间真发 `POST /api/documents/:id/import.md`，8 块真实读回；编辑态列表有 `•` / `1.` marker） | audit「r9 导入：imported=6」「r9 导入：HTTP 真读回 6 块」；e2e「importBlocks：整篇替换为 5 块」 |
| [03-export-download.png](docs/ui/r9/03-export-download.png) | **真实链路·导出落盘佐证**（中文文件名 + `253 字节` + 真实 Markdown 文本；另存字节文件 [r9-export-evidence.md](docs/ui/r9/r9-export-evidence.md)） | audit「r9 导出：响应文本与 shared blocksToMarkdown 逐字相等」「r9 往返：md → blocks 逐字节相等」 |
| [04-revise-diff.png](docs/ui/r9/04-revise-diff.png) | **真实链路·AI 修订 diff**（原文 vs 建议左右对照 + `mock-scripted-v1` + 中文理由；adopt 缺省零写入） | audit「r9 修订：未采纳 applied=false」「r9 未采纳不改库：块快照逐字节相等」；e2e「修订计划：未采纳 → applied=false」 |
| [05-revise-adopted.png](docs/ui/r9/05-revise-adopted.png) | **真实链路·采纳后**（04↔05 间真发 `adopt:true`，第 2 块文本变「…（精简稿）」并落库） | audit「r9 采纳：HTTP 真读回块文本已替换为建议」「r9 采纳后：导出立即反映」 |
| [06-revise-discarded.png](docs/ui/r9/06-revise-discarded.png) | 放弃后（另一篇文档原文保持完整，提示「服务端零写入」；与 05 逐字不同） | audit「r9 显式 adopt=false 仍不写库」；e2e「修订计划：adopt 缺失按未采纳处理」 |
| [07-narrow-u2-fixes.png](docs/ui/r9/07-narrow-u2-fixes.png) | 窄屏 488×900：**r8 U2-1 修复**（长文本两行完整、无 1px 裁切）+ **U2-2 修复**（编辑态列表 marker） | 无独立数字断言（CSS/布局钉态，逐张目验；文本落库由 audit 锁定） |
| [08-import-narrow.png](docs/ui/r9/08-import-narrow.png) | 窄屏导入对话框 + 4 块预览表完整可见、无横向溢出（真调 preview，零写入） | audit「r9 预览：绝不写库」 |

### r8 矩阵：[docs/ui/r8/](docs/ui/r8/README.md) —— 文档块编辑器（M4 起步，共 11 张）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-docs-empty.png](docs/ui/r8/01-docs-empty.png) | 文档空态（七 tab 壳「文档」激活 + 空态引导 + 截图钉态注记；真实空库同形态） | e2e「建文档默认首块自动在场」；audit「r8 第一次用：建文档默认首块自动在场」 |
| [02-docs-list.png](docs/ui/r8/02-docs-list.png) | **真实链路·文档列表**（3 篇真文档 + 选中文档的 2 块轻量编辑器 + 保存 / 加块 / 删文档） | audit「r8 GET 文档列表 -> 200」「r8 文档列表含刚建的文档」 |
| [03-docs-editor.png](docs/ui/r8/03-docs-editor.png) | **真实链路·编辑器多类型块**（14 块覆盖 10 种类型：一/二/三级标题 / 正文 / 无序 / 有序 / 待办勾选 / 引用 / 代码块 / 分割线；每块带类型下拉与 ↑↓×） | e2e「块类型共 10 种」「归一：todo 勾选值字符串 true→布尔」；audit「r8 块列表：position 连号」 |
| [04-docs-type-switch.png](docs/ui/r8/04-docs-type-switch.png) | **真实链路·块类型切换下拉**（10 项全展开，「当前」高亮，分割线标「不可转」禁用 = shared `canConvertBlockType`） | e2e「转换：divider→paragraph 禁止」「转换：同类型恒允许」；audit「r8 非法类型转换（divider→paragraph）-> 400」 |
| [05-docs-print-preview.png](docs/ui/r8/05-docs-print-preview.png) | **真实链路·打印预览**（A4 纸面按 position 拼装全文 + `window.print()` 按钮 + `@media print` 打印样式表隐藏工具栏） | e2e「全文装配：无序/有序编号/todo/引用/分割线同一口径」；audit「r8 文档全文读 -> 200」 |
| [06-docs-narrow.png](docs/ui/r8/06-docs-narrow.png) | 窄屏 488×900（`?narrow=1` 钉态；七药丸一排不折行、列表与编辑器纵排、块操作换行） | 无独立断言（CSS 断点，确定性钉态） |
| [07-docs-split-before.png](docs/ui/r8/07-docs-split-before.png) | **真实链路·拆块前**（1 块「回车拆块演示」） | audit「r8 回车拆块 -> 201」；e2e「splitBlock 后半段落新块」 |
| [08-docs-split-after.png](docs/ui/r8/08-docs-split-after.png) | **真实链路·拆块后**（两拍间真发 `POST /api/blocks/:id/split { caret:4 }` → 2 块「回车拆块」「演示」，position 连号；与 07 哈希互异） | audit「r8 拆块：前半段留原块」「后半段落新块」「r8 拆块后 position 连续无空洞」 |
| [09-docs-loading.png](docs/ui/r8/09-docs-loading.png) | 文档页加载态（钉态） | 无独立断言（fetch pending 态，证据为 GET 200 链路 + 本图） |
| [10-docs-error.png](docs/ui/r8/10-docs-error.png) | 文档页错误态（钉态，语义化文案） | 无独立断言（httpClient.ts 语义化映射） |
| [11-import-u2-fixes.png](docs/ui/r8/11-import-u2-fixes.png) | **r7 U2 修复证据·CSV 导入对话框**（数据行号列 + 「第 N 条数据（CSV 第 N+1 行）」口径 + 「追加 N 行 / 不可撤销」后果提示） | audit「r7 错误预览：错误行号」「r7 确认导入（全合法）-> 201」 |

### r7 矩阵：[docs/ui/r7/](docs/ui/r7/README.md) —— 视图持久化与 CSV 导入（M3 收官，共 9 张）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-views-switcher.png](docs/ui/r7/01-views-switcher.png) | **真实链路·视图切换栏多视图**（全部记录 + 4 个已保存视图 + 新建 / 编辑入口；6 行真实记录 = 3 seed + 3 真导入） | audit「r7 POST 视图 -> 201」「r7 导入：表内 4 + 3 = 7 行」；e2e「listViews 按 position 排序」 |
| [02-view-editor.png](docs/ui/r7/02-view-editor.png) | **真实链路·视图编辑面板**（视图名 / 筛选条件 / 排序规则 / 显示列勾选，均来自真实已保存 spec） | audit「r7 PATCH 编辑视图 -> 200」；e2e「updateView 未给的 spec 段沿用旧值」 |
| [03-hidden-columns.png](docs/ui/r7/03-hidden-columns.png) | **真实链路·隐藏列后网格**（8 列投影成 4 列 + 视图口径条「筛选 / 排序 / 隐藏列」） | audit「r7 按视图查询：投影后 data 恰 3 个键」；e2e「视图查询：投影只保留 visible_fields 两个字段键」 |
| [04-import-preview.png](docs/ui/r7/04-import-preview.png) | **真实链路·导入预览**（共 5 行 · 预览前 5 行 · 全部行合法；含引号内逗号的多选列） | audit「r7 预览：合法 CSV 零错误行」「r7 预览不落库」；e2e「导入计划：7 行时预览只取前 5 行」 |
| [05-import-errors.png](docs/ui/r7/05-import-errors.png) | **真实链路·导入错误行提示**（2 行不合法：第 2 行金额非数值、第 3 行状态不在候选项） | audit「r7 错误预览：错误行号 2 / 3 / 4（1 起）」；e2e「错误聚合：错误行号精确为第 2 / 3 / 4 行」 |
| [06-import-success.png](docs/ui/r7/06-import-success.png) | **真实链路·导入成功后**（绿色条「导入成功：3 行已全部落库（零半态）。」+「本次导入」视图只显示 3 条真导入行） | audit「r7 确认导入（全合法）-> 201」「r7 导入：imported=3」；e2e「原子导入：全合法时一次落 2 行」 |
| [07-views-narrow.png](docs/ui/r7/07-views-narrow.png) | 窄屏 488×900（工具条 / 视图栏纵排、网格横滚、六药丸不折行） | 无独立断言（CSS 断点，确定性钉态） |
| [08-cell-editor-fixed.png](docs/ui/r7/08-cell-editor-fixed.png) | **U2-1 修复证据·固定列宽**（格内编辑框锁在本列，后续各列列位与 01 一致，不再整表右移） | 无独立断言（纯 CSS 行为；证据为本图与 01 列位对照） |
| [09-filter-feedback.png](docs/ui/r7/09-filter-feedback.png) | **U2-2 修复证据**（成功条「已应用筛选：「状态」= 已完成 —— 命中 2 行」+ 应用 / 清除按钮 + 方向下拉禁用与「先选排序字段」提示） | audit「r7 非法排序方向 -> 400」；e2e「视图 spec：非法排序方向抛错」 |

### r6 矩阵：[docs/ui/r6/](docs/ui/r6/README.md) —— 多维表格字段引擎 + 网格视图（M3 第 1 片，共 8 张）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-bases-grid-live.png](docs/ui/r6/01-bases-grid-live.png) | **真实链路·多类型网格**（8 字段列 + 3 行；单选蓝徽标 / 多选双徽标 / 数字右对齐 / 日期 / 复选框 ☑否 / 链接可点 / 空格子「—」） | audit「字段：新表自带 8 个默认字段」「记录：多选字段读回数组」；e2e「createTable 自动创建默认字段（7 种类型齐备）」 |
| [02-bases-empty.png](docs/ui/r6/02-bases-empty.png) | **真实链路·空表**（表在场、字段表头可见、零行 + 「＋ 新增行」引导；共 0 行） | e2e「默认字段覆盖全部 7 种字段类型」；audit「字段：新表自带 8 个默认字段」 |
| [03-bases-fields-panel.png](docs/ui/r6/03-bases-fields-panel.png) | **字段管理面板**（8 行字段：名称 + 类型 + 候选项 + 删除；底部「添加字段」行） | audit「POST 字段非法类型 -> 400」「POST 单选零候选项 -> 400」「PATCH 字段改名 -> 200」；e2e「updateField 改类型生效」 |
| [04-bases-filtered-sorted.png](docs/ui/r6/04-bases-filtered-sorted.png) | **真实链路·筛选 + 排序后**（筛选=标签「重要」、排序=金额降序 → 命中 2 行、1200 → 300） | audit「筛选：已完成 -> 2 条命中」「排序：数字降序 9000 / 1500 / 300」「GET 记录（筛选值类型不符）-> 400」 |
| [05-bases-narrow.png](docs/ui/r6/05-bases-narrow.png) | 窄屏 488×900（工具条纵排、网格不折字横向滚动） | 无 UI 形态（CSS 断点，确定性钉态） |
| [06-bases-error.png](docs/ui/r6/06-bases-error.png) | 多维表格页错误态（钉态，语义化文案） | 无独立断言（httpClient.ts 语义化映射） |
| [07-bases-loading.png](docs/ui/r6/07-bases-loading.png) | 多维表格页加载态（钉态） | 无独立断言（fetch pending 态，证据为 GET 200 链路 + 本图） |
| [08-bases-cell-editor.png](docs/ui/r6/08-bases-cell-editor.png) | **单元格编辑态**（钉态：第一行「名称」格内文本框） | audit「PATCH 编辑单元格 -> 200」「记录：编辑后数字读回」；e2e「updateRecord 编辑单元格生效」 |

### r5 矩阵：[docs/ui/r5/](docs/ui/r5/README.md) —— 看板统计卡 + CSV 台账导出（M2 第 收官，共 8 张 + 1 份落盘 CSV；**r6 起列级指标改称「待办完成率」、导出文件名改为含项目名**，看板页当前文案以 r6 代码与断言为准，本目录图仍是改名前形态）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-board-stats-live.png](docs/ui/r5/01-board-stats-live.png) | **真实链路·统计卡有数据**（5 卡 / 2 完成 / 3 关联待办 / 项目完成率 40%；三列完成率条 33%·100%·0%；工具栏「导出 CSV」在场） | audit「统计：待办列完成率 1/3 -> 33%」「统计：项目完成率 2/4 -> 50%」 |
| [02-board-stats-empty.png](docs/ui/r5/02-board-stats-empty.png) | **真实链路·空项目统计**（默认三列、零卡；四块统计全 0、完成率 0%、三条空进度条） | audit「统计：空项目合计卡片数 0」「统计：空项目完成率 0（不除零）」 |
| [03-board-export-done.png](docs/ui/r5/03-board-export-done.png) | **导出按钮态**（`?export=1` 真实触发导出：反馈条「已导出 CSV：6 行（含表头）· 0.4 KB · 文件名 xieflow-board-project-23.csv」——行数/字节为真值） | audit「CSV：表头 + 5 行台账」；e2e「CSV：记录数与行数一致（引号内换行不虚增）」 |
| [04-board-export-csv.png](docs/ui/r5/04-board-export-csv.png) | **CSV 落盘内容佐证**（`board-export.csv` 原始字节的纯文本渲染：中文表头 9 列 + 5 行台账；逗号/引号/换行转义可见） | audit「CSV：含逗号与引号的标题被正确转义并加引号」「CSV：含换行的描述被引号包裹」 |
| [05-board-stats-narrow.png](docs/ui/r5/05-board-stats-narrow.png) | 窄屏 488×900（统计卡纵排 + 三行式列统计 + 进度条满宽 + 按钮纵排） | 无 UI 形态（CSS 断点，确定性钉态） |
| [06-board-modal.png](docs/ui/r5/06-board-modal.png) | 新建卡片弹窗（钉态：标题 + 关联待办下拉 + 目标列提示；背后为新统计卡与导出按钮） | audit「POST 卡 C（关联真实待办）-> 201」及越权外键 400 分支 |
| [07-board-loading.png](docs/ui/r5/07-board-loading.png) | 看板页加载态（钉态） | 无独立断言（fetch pending 态，证据为 GET 200 链路 + 本图） |
| [08-board-error.png](docs/ui/r5/08-board-error.png) | 看板页错误态（钉态，语义化文案） | 无独立断言（httpClient.ts 语义化映射） |
| [board-export.csv](docs/ui/r5/board-export.csv) | **落盘证据文件**（435 字节，sha256 `2BFF858D…`，首字节 `EF BB BF`）——按原始字节下载落盘（文本解码会剥掉 BOM） | audit「CSV：首字节 EF / BB / BF」三条字节级断言 |

### r4 矩阵：[docs/ui/r4/](docs/ui/r4/README.md) —— 项目页 + 看板页（M2 第 1 片，返工 #1 后共 19 张，04/05 为 seed 分步拍的真实移动前后对照，17/18/19 为返工全路径证据；**r5 起看板页新增统计卡与导出按钮，看板形态以 r5 目录为准**）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-project-empty.png](docs/ui/r4/01-project-empty.png) | 项目页空态（五 tab 壳「项目」激活 + 空态引导，文案=新建项目自动带三列） | e2e「createProject 自动创建默认三列」；audit「POST 项目后 GET columns」 |
| [02-project-list.png](docs/ui/r4/02-project-list.png) | 项目列表钉态（3 个项目卡，有/无描述两形态） | audit「POST 合法项目 -> 201」「项目列表返回数组」 |
| [03-project-modal.png](docs/ui/r4/03-project-modal.png) | 新建项目弹窗（名称 200 字计数 + 可选描述） | audit「POST 空项目名 -> 400」「POST 超长项目名（201 字）-> 400」 |
| [04-board-live.png](docs/ui/r4/04-board-live.png) | 真实链路·移动前（seed 项目三列：To Do 3 / Doing 1 / Done 0，卡 C 带进行中徽标；列=默认列改名） | audit「createProject 自动创建默认三列」前态实证 |
| [05-board-moved.png](docs/ui/r4/05-board-moved.png) | **真实链路·移动后**（两拍间真实 PATCH：卡 A → Doing 第 0 位，两侧列重排） | audit「移动后源列重排：B/C 位置收拢为 0/1」「移动后目标列：卡 A 落 0 位」 |
| [06-board-modal.png](docs/ui/r4/06-board-modal.png) | 新建卡片弹窗（标题 + 关联待办下拉 + 目标列提示） | audit「POST 卡 C（关联真实待办）-> 201」及越权外键 400 分支 |
| [07-board-narrow.png](docs/ui/r4/07-board-narrow.png) | 窄屏 488×900（看板三列纵排，卡 + 徽标在视口内） | 无 UI 形态（CSS 断点，确定性钉态） |
| [08-projects-tab-live.png](docs/ui/r4/08-projects-tab-live.png) | 项目页真实数据路径（消费真实 api） | audit「GET 项目列表 -> 200」端到端实证 |
| [09-projects-loading.png](docs/ui/r4/09-projects-loading.png) | 项目页加载态（r4 返工 #1 C 补图） | 无独立断言（fetch pending 态，证据为 GET 200 链路 + 本图） |
| [10-projects-error.png](docs/ui/r4/10-projects-error.png) | 项目页错误态（语义化文案 + 钉态注释句） | 无独立断言（httpClient.ts 语义化映射） |
| [11-board-loading.png](docs/ui/r4/11-board-loading.png) | 看板页加载态（r4 返工 #1 C 补图） | 无独立断言（fetch pending 态，证据为 GET 200 链路 + 本图） |
| [12-board-error.png](docs/ui/r4/12-board-error.png) | 看板页错误态（语义化文案 + 钉态注释句） | 无独立断言（httpClient.ts 语义化映射） |
| [13-board-direct.png](docs/ui/r4/13-board-direct.png) | 看板 tab 直入形态（无项目上下文：默认第一个项目 + 切换下拉；与 05 同态如实并注） | audit「GET /api/projects -> 200」直入消费路径 |
| [14-board-no-columns-modal.png](docs/ui/r4/14-board-no-columns-modal.png) | A2 防御·零列建卡弹窗（创建按钮提示「先建列」，不静默） | 防御分支（正常态由 audit「默认三列」锁死） |
| [15-board-no-columns.png](docs/ui/r4/15-board-no-columns.png) | A2 防御·零列警示横幅（role=alert 语义提示） | 防御分支（与 14 构成「不静默」双形态） |
| [16-project-empty-rework.png](docs/ui/r4/16-project-empty-rework.png) | 返工 #1 空态文案重拍（与 01 同态） | e2e「shared 默认列模板口径」文案-实现一致性 |
| [17-board-from-new-project.png](docs/ui/r4/17-board-from-new-project.png) | **返工 #1·A4 全路径①**：UI 建项目 → 打开看板 → 三列自动在场 + 切换下拉 | audit「POST 项目后 GET columns 三列」端到端 UI 形态 |
| [18-board-switched-project.png](docs/ui/r4/18-board-switched-project.png) | **返工 #1·D 证据**：项目切换深链 → 第二项目看板（下拉选中态） | audit「GET /api/projects -> 200」多项目读回 UI 形态 |
| [19-board-card-moved-ui.png](docs/ui/r4/19-board-card-moved-ui.png) | **返工 #1·A4 全路径②**：建卡 → 真实移动 → 两侧列重排 | audit「PATCH 卡跨列移动 -> 200」+ 两侧重排 UI 形态 |

### 壳基线：[docs/ui/shell/](docs/ui/shell/README.md) —— **九 tab** 激活态（r4 返工 #1 B 固化，shot.ps1 自动拍摄；r6 新增「表格」→ 六张；**r8 新增「文档」→ 七张**；r9 徽章推进；**r10 新增「AI 工作台」→ 八张**；r11 徽章推进同批重拍；**r12 新增「知识库」→ 九张**，补 `knowledge-tab-active.png` 并同批重拍旧八张，与 r11 基线哈希全异）：工作台 / 待办 / 日程 / 项目 / 看板 / 表格 / 文档 / AI 工作台 / 知识库各 1 张（r2/r3/r4 U1-1 三轮连漏的流程性终结）。

### r3 矩阵：[docs/ui/r3/](docs/ui/r3/README.md) —— 日程页月视图 + 联动徽标 + 工作台今日日程（共 11 张，返工 #1 修正 06/10 + 补 11）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-schedule-empty.png](docs/ui/r3/01-schedule-empty.png) | 日程月视图空态（本月暂无日程 + 今天高亮） | e2e「新库 schedules 为空」；audit「GET 空区间 -> 200」 |
| [02-schedule-month.png](docs/ui/r3/02-schedule-month.png) | 月视图有日程（多日散布的日程块，长标题两行折行） | e2e「循环日程实例化（computeRepeatInstances）」节；audit「区间查询含刚建的日程」 |
| [03-schedule-modal.png](docs/ui/r3/03-schedule-modal.png) | 新建日程弹窗（标题/日期/起止时间/重复/关联待办） | audit「POST 合法日程 -> 201」及 400 分支（空标题/非法日期/非法 repeat/越权外键） |
| [04-schedule-badge.png](docs/ui/r3/04-schedule-badge.png) | 联动徽标（日程块上的待办状态徽标：进行中/已完成） | audit「生成日程 todo_id 关联该待办」；e2e「待办设 due_date 自动生成关联日程」 |
| [05-schedule-narrow.png](docs/ui/r3/05-schedule-narrow.png) | 窄屏纵排（?narrow=1 seam，488×900，第一周含 3 条日程块 + 徽标） | 无 UI 形态（CSS 断点，确定性钉态） |
| [06-schedule-live.png](docs/ui/r3/06-schedule-live.png) | 真实数据链路·改期前（seed 待办 → 设 due_date → 自动日程上今天格） | audit「建待办（带 dueDate）自动生成关联日程」端到端实证 |
| [07-workbench-today.png](docs/ui/r3/07-workbench-today.png) | 工作台「今日日程」卡 + schema v3 | e2e「settings 读写」+「日程改期回写待办 due_date（联动闭环）」 |
| [08-schedule-loading.png](docs/ui/r3/08-schedule-loading.png) | 日程页加载态 | 无独立断言（fetch pending 态，证据为区间查询 200 链路 + 本图） |
| [09-schedule-error.png](docs/ui/r3/09-schedule-error.png) | 日程页错误态（语义化文案，不暴露 5xx 原始码） | 无独立断言（httpClient.ts 语义化映射；停 api 实测同文案） |
| [10-schedule-moved.png](docs/ui/r3/10-schedule-moved.png) | **改期同步后**（两拍间真实 PATCH 改期，sha256 与 06 可区分） | audit「待办改期同步日程 date（反向联动闭环）」 |
| [11-todos-tab.png](docs/ui/r3/11-todos-tab.png) | 三 tab 壳下的待办 tab 激活态 | audit「GET 列表 -> 200」+ summary 计数组端到端形态 |

### r2 矩阵：[docs/ui/r2/](docs/ui/r2/README.md) —— 待办页（共 10 张）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-todo-empty.png](docs/ui/r2/01-todo-empty.png) | 待办空态（计数卡全 0） | e2e「新库 todos 为空」 |
| [02-todo-modal.png](docs/ui/r2/02-todo-modal.png) | 新建弹窗（标题 200 字上限提示/象限/可选截止日） | audit「POST 合法体 -> 201」及 400 分支（含超长标题 400） |
| [03-todo-quadrants.png](docs/ui/r2/03-todo-quadrants.png) | 四象限有数据 + 今/明/周计数 | e2e「今/明/周汇总计数」节 + audit summary 组 |
| [04-todo-done.png](docs/ui/r2/04-todo-done.png) | 状态流转后（划线 + 按钮联动 + 计数变化） | e2e「todo 状态机」节 + audit「PATCH open->done -> 200」 |
| [05-todo-narrow.png](docs/ui/r2/05-todo-narrow.png) | 窄屏纵排（?narrow=1 seam） | 无 UI 形态（CSS 断点，确定性钉态） |
| [06-todo-live.png](docs/ui/r2/06-todo-live.png) | 真实数据链路（脚本 seed → 页面消费 → 拍后清理） | audit POST/GET 的端到端实证 |
| [07-workbench-tab.png](docs/ui/r2/07-workbench-tab.png) | 工作台 tab 激活（tab 栏 + 工作台内容） | e2e「settings 读写」节 |
| [08-todo-loading.png](docs/ui/r2/08-todo-loading.png) | 待办页加载态 | 无独立断言（fetch pending 态，证据为 GET 200 链路 + 本图） |
| [09-todo-error.png](docs/ui/r2/09-todo-error.png) | 待办页错误态（语义化文案） | 无独立断言（httpClient.ts 语义化映射） |
| [10-todo-empty-title.png](docs/ui/r2/10-todo-empty-title.png) | 弹窗空标题提交反馈（inline alert + 200 字提示） | audit「POST 空标题 -> 400」的 UI 形态 |

### r1 矩阵：[docs/ui/r1/](docs/ui/r1/README.md) —— 首页工作台 5 态（加载/空/正常/错误/窄屏）

每张图的断言对照详见 [docs/ui/r1/README.md](docs/ui/r1/README.md)。

### 断言规模（每轮更新，下降 = 回归 = 冻结发版）

- e2e **1087** 项（服务离线口径 1087，api 在线时 HTTP 冒烟节 +1 = 1088）：迁移一致性 7 · settings 9 · todo CRUD 15 · 输入校验 13 · 状态机 10 · 汇总计数 7 · raw schema 4 · 迁移幂等 3 · 日程契约与守卫 28 · 循环实例化 14 · 区间查询装配 12 · v2→v3 迁移+双向联动 18 · schedules CRUD 26 · 看板排序规则（reorderPositions）12 · 看板名称守卫 6 · v3→v4 迁移+看板数据层 33 · 看板统计口径（computeBoardStats）35 · 看板 CSV 台账（buildBoardCsvContent）36 · 字段类型引擎（validateFieldValue / coerceFieldValue / compareValues）86 · 记录数据归一与查询装配（normalizeRecordData / queryRecords）25 · 看板导出文件名（buildBoardCsvFileName · U2-2）6 · v4→v5 迁移+多维表格数据层 44 · 视图 spec 归一（normalizeViewSpec）31（r7 新增）· 按视图查询口径（多字段 AND / 多级排序 / 投影）21（r7 新增）· CSV 导入口径（parseCsvText / planCsvImport / 零半态）43（r7 新增）· v5→v6 迁移+视图数据层（持久化 / 原子导入）43（r7 新增）· **块类型引擎（normalizeBlockContent / canConvertBlockType / 拆合装配）64（r8 新增）· v6→v7 迁移+文档数据层（持久化 / 拆合移动 / 全文装配）65（r8 新增）· Markdown 双向引擎（markdownToBlocks / blocksToMarkdown / 未知语法降级）36（r9 新增）· Markdown 导入计划（normalizeMarkdownImportPayload / planMarkdownImport / 零半态）25（r9 新增）· AI 修订语义（instruction 守卫 / planRevisionApply / mock 录制回放）20（r9 新增）· 导入数据层（importBlocks 单事务整体替换 / 零半态 / 持久化 / 往返）12（r9 新增）· schema v7→v8 迁移与对话数据层（conversations / messages / artifacts）33（r10 新增）· 工具契约与脚本规划口径（TOOL_NAMES / 规划 / 汇总）34（r10 新增）· 工具注册表与真实服务层调用（ToolRegistry）26（r10 新增）· mock-planner 与工具调用录制回放（≥15 用例）9（r10 新增）· 对话编排与产物（executeChat）13（r10 新增）· **r11 契约（产物类型 / 上下文窗口 / 行内 diff）24（r11 新增）· r9 U2 行内增删改 diff 11（r11 新增）· r11 跨轮指代消解 12（r11 新增）· r11 三类产物生成器 13（r11 新增）· r11 工具链扩展真服务层 14（r11 新增）· r11 多轮上下文编排与回放扩充 22（r11 新增）· **schema v8→v9 知识库数据层 23（r12 新增）· 分块引擎 chunkText 19（r12 新增）· TF-IDF 检索引擎 searchChunks 20（r12 新增）· search_knowledge 工具真检索 5（r12 新增）**
- HTTP audit **923** 项（服务就绪 1 · health/settings 5 · todo 新建 12 · 列表详情 7 · 状态流转 9 · summary 11 · 删除 6 · 未知路由 1 · schedules CRUD 36 · 双向联动 22 · 循环实例 over HTTP 23 · projects CRUD 25 · board columns CRUD 20 · cards CRUD + 跨列移动 50 · board stats + CSV export 84 · tables / fields / records（r6）86 · views + CSV import（r7）119 · documents + blocks（r8）117 · Markdown import/export + AI revise（r9）67 · AI workbench: tools / conversations / chat / artifacts（r10）80 · **AI workbench r11: multi-turn context / artifact generators / extended tools 81（r11 新增）· Knowledge r12: ingest / TF-IDF search / source refs / 4xx 56（r12 新增）** · schedules 删除 5）
- typecheck 5 包全绿（strict + noUncheckedIndexedAccess；shared / db / web / api / **agent(r9 新增)**）
- CI：ubuntu / windows / macos 三平台 verify 门禁 + tag 触发 Release；CI 的 HTTP smoke 静态正则随 schema 版本号同步放宽为 `(2|3|4|5|6|7|8|9)`（v0.0.6 教训）
- r6 规模变化：e2e 288 → 449（+161）· audit 313 → 403（+90）；**无一条断言被删**（只涨不缩，宪法第四条）
- r7 规模变化：e2e 449 → 587（+138）· audit 403 → 522（+119）；**无一条断言被删**（只涨不缩，宪法第四条）。随版本增长只更新了 **6 条既有断言的期望值**（迁移队列最高版本 5→6：`[3,4,5]`→`[3,4,5,6]`、`[4,5]`→`[4,5,6]`、`[5]`→`[5,6]`、构造越界队列 1..6→1..7，以及 audit 两处 `health.schemaVersion` 5→6），另有 2 条 e2e 断言的**标签文字**（4/5 → 6）同步，条数不变。
- r8 规模变化：e2e 587 → **716（+129）**· audit 522 → **639（+117）**；**无一条断言被删**（只涨不缩，宪法第四条）。随 v6→v7 迁移只更新了 **6 条既有断言的期望值**（`[3,4,5,6]`→`[3,4,5,6,7]`、`[4,5,6]`→`[4,5,6,7]`、`[5,6]`→`[5,6,7]`、`[6]`→`[6,7]`、构造越界队列 1..7→1..8）与 audit 两处 `health.schemaVersion` 6→7；另有 8 条 e2e 断言的**标签文字**（4 条「v2/v3/v4/v5 旧库补跑 v6」→ 补 v7、3 条「CURRENT_SCHEMA_VERSION（6）」→（7）、1 条「重启后 user_version 仍为 6」→ 7）同步，条数不变。
- r9 规模变化：e2e 716 → **809（+93）**· audit 639 → **706（+67）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增四节 e2e（36 双向引擎 + 25 导入计划 + 20 修订语义 + 12 导入数据层）与一节 audit（67 条真实 HTTP 装配，含导入预览/零半态 422/修订采纳与放弃/4xx）；本轮**未做 schema 迁移**，既有断言期望值与 CI smoke 正则 `(2|3|4|5|6|7)` 均未改动。唯一修正是一条 audit 预览行数期望（6→5，按 `MARKDOWN_IMPORT_PREVIEW_ROWS=5` 的真实契约），条数不变。
- r10 规模变化：e2e 809 → **924（+115）**· audit 706 → **786（+80）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增五节 e2e（33 对话数据层 + 34 工具契约/规划 + 26 真实注册表 + 9 回放 + 13 编排）与一节 audit（80 条真 HTTP 装配，含 4xx：空消息/未知工具/非法参数/空标题/越权 id、逐条 tool_call 落库查库验证、create_todo 实际创建、产物与级联删除）。随 v7→v8 迁移只更新了 **6 条既有断言的期望值**（`[3,4,5,6,7]`→`[3,4,5,6,7,8]`、`[4,5,6,7]`→`[4,5,6,7,8]`、`[5,6,7]`→`[5,6,7,8]`、`[6,7]`→`[6,7,8]`、`[7]`→`[7,8]`、构造越界队列 1..8→1..9）与 audit 两处 `health.schemaVersion` 7→8；另有 e2e 若干**标签文字**同步（`CURRENT_SCHEMA_VERSION（8）`、`重启后 user_version 仍为 8`、迁移链文字加 v8），条数不变。CI smoke 正则同步为 `(2|3|4|5|6|7|8)`。

- r11 规模变化：e2e 924 → **1020（+96）**· audit 786 → **867（+81）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增六节 e2e（24 契约 + 11 行内 diff + 12 指代消解 + 13 产物生成器 + 14 工具链真服务层 + 22 多轮编排与回放）与一节 audit（81 条真 HTTP：12 工具目录 / context_window 4xx / 三轮跨轮指代 / 三类产物 /content / 产物不存在与非法类型 4xx / 4 新工具真建数据 / 清理）。**本轮无 schema 迁移**（artifacts.type 本就是 TEXT，三类新产物无需 v9），CI smoke 正则保持 `(2|3|4|5|6|7|8)`；只更新 **6 条既有断言的期望值/标签**（e2e 工具数/工具名/状态变更清单 8→12 ×3、注册表 8→12 ×1、audit 工具目录数与工具名 8→12 ×2），条数不变。

- r12 规模变化：e2e 1020 → **1087（+67）**· audit 867 → **923（+56）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增四节 e2e（23 v8→v9 知识库数据层 + 19 分块引擎 + 20 TF-IDF 检索 + 5 search_knowledge 真检索）与一节 audit（56 条真 HTTP：CRUD / 三篇文档 TF-IDF 排序 / 来源引用 / 文档源入库 / 工具真检索 / 4xx：空内容·超长内容·非法 source_type·空查询·limit 越界 / 清理）。随 v8→v9 迁移只更新 **9 条既有断言的期望值**（e2e 迁移队列越界构造 1 条 + v2~v7 旧库补跑队列末追加 9 共 6 条 + audit 两处 `health.schemaVersion` 8→9）与若干标签文字；另 1 条 search_knowledge 占位断言的期望随行为变更同步（`placeholder=true`→`undefined`），均不改条数；CI smoke 正则同步为 `(2|3|4|5|6|7|8|9)`。

### 核心概念（逐轮累积，r1~r12 已落地的部分）

- **迁移纪律**：schema 变更只走 `packages/db/src/schema.ts` 的 `MIGRATIONS` 队列（v1 settings → v2 todos → v3 schedules → v4 projects/board_columns/cards → v5 tables/fields/records → v6 views → v7 documents/blocks → **v8 conversations/messages/artifacts → v9 knowledge_docs/knowledge_chunks**），`user_version` 管理，重开幂等、旧库原地升级只补跑缺失版本
- **状态机集中**：待办状态流转（open/done/archived）定义在 `packages/shared`，非法流转服务层与路由层双层拒绝
- **汇总计数唯一入口**：今/明/周 + 四象限计数只写在 `computeTodoSummary`（shared 纯函数），api 下发、UI 消费同一口径
- **循环实例化唯一入口**：daily/weekly/monthly 展开规则只写在 `computeRepeatInstances`（shared 纯函数，含月末收敛与实例封顶）；区间查询装配只写在 `assembleRangeSchedules`
- **看板重排唯一入口**：卡片 position 重排只写在 `reorderPositions`（shared 纯函数）；跨列移动经 `moveBoardCard` 保证源列与目标列 position 连续，跨项目移动拒绝
- **双向联动闭环**：待办设 `due_date` → 自动生成关联日程；日程改期 → 回写待办；待办清空 → 关联日程删除；待办删除 → 日程级联删除
- **项目默认三列**（r4 返工 #1）：`createProject` 自动按 shared `DEFAULT_BOARD_COLUMNS` 模板建「待办 / 进行中 / 已完成」三列（position 0/1/2）——新建项目即到「看板有列」状态，无建列死路；模板口径 api/UI/文档同源
- **看板项目切换**（r4 返工 #1）：看板页头部下拉 + `?projectId=` 深链，「打开看板」不再固定第一个项目（数据层零改动）
- **看板徽标复用 r3 联动模式**：卡片 `todo_id` 可空关联待办，UI 按 todoId 查状态渲染「进行中/已完成/已归档」徽标
- **看板统计唯一入口**（r5）：统计口径只写在 shared `computeBoardStats` 纯函数——「卡片算已完成 ⟺ 关联待办状态为 done」，
  列完成率 = 该列完成卡片 ÷ 该列卡片总数，项目完成率 = 项目完成卡片 ÷ 项目卡片总数，**分母 0 记 0%（不除零）**；
  api `GET /api/projects/:id/stats` 与 UI 统计卡消费同一口径，卡片移动后统计即时变化
  （**r6 起列级指标改名「待办完成率」**，避免与列名「已完成」语义冲突——r5 UI 审查 U2-1）
- **CSV 台账导出唯一入口**（r5）：`GET /api/projects/:id/export.csv` = UTF-8 BOM（`EF BB BF`）+ CRLF + RFC4180 转义 + 中文表头 9 列，
  每列至少一行（空列占位）；**落盘必须按字节**（fetch 文本解码会剥掉 BOM，Excel 直开会乱码）
  （**r6 起文件名含项目名**：`xieflow-board-<项目名>-<YYYYMMDD>.csv`，不再只露内部 id——r5 UI 审查 U2-2；
  中文名按 RFC 5987 用 `filename*=UTF-8''` 下发，口径集中在 shared `buildBoardCsvFileName`）
- **字段类型引擎唯一入口**（r6）：7 种字段类型（text / number / date / select / multi-select / checkbox / url）的
  **校验**（`validateFieldValue`）、**写入归一**（`coerceFieldValue`：数字字符串→数字、日期补零、裸域名补 https://、
  逗号串→多选数组、"true"/"1"→布尔）、**排序比较**（`compareValues`：数值按值、日期按时间、单选按候选项顺序、
  **空值恒最后**）三条规则全部只写在 `packages/shared`——**api 层不出现任何字段类型分支**（只做装配 + 400/404 映射）
- **多维表格数据层**（r6）：schema v5 新增 `tables` / `fields` / `records` 三表（`records.data` 存 JSON，键为字段 id）；
  **建表自动带 8 个默认字段**（7 种类型齐备）——消灭「建表零字段」死路；删字段同步清掉记录里的孤儿键；
  记录写入统一过 shared `normalizeRecordData`（未知字段 / 类型不符一律拒绝）
- **记录查询唯一入口**（r6）：按字段筛选 + 按字段排序 + 分页的规则集中在 shared `queryRecords`
  （筛选值先归一再校验 → 类型不符抛错由 api 映射 400；空值恒排最后；pageSize 上限 100）
  **r7 起同一函数还承担多字段 AND 筛选、多级排序与字段投影**（视图 spec 只是它的筛选 / 排序 / 投影参数）
- **视图唯一入口**（r7）：`normalizeViewSpec`（spec 形状 / 字段存在性 / 取值类型 / 去重）与
  `describeViewSpec`（口径摘要）只在 shared；schema v6 的 `views` 表把 filter_spec / sort_spec /
  visible_fields 三个 JSON 段持久化，`GET /api/views/:id/records` 复用 `queryRecords`（api 层零口径分支）；
  **visible_fields 空数组 = 全部列可见**，非空 = 只显示这些列（投影在 shared 里做，UI 只按同一清单收列）
- **多字段 AND 筛选**（r6 遗留，r7 修）：`GET /api/tables/:id/records?filters=<JSON 数组>` 与视图的
  `filterSpec` 走同一条 AND 路径（单条件旧入口 `filterFieldId` 保持兼容）；每条条件都先按字段类型
  归一 + 校验，未知字段 / 类型不符 → 400；排序方向非法也直接 400（不再静默回落成升序）
- **CSV 导入唯一入口**（r7）：`parseCsvText`（RFC 4180，引号内逗号 / 换行 / 双引号转义、BOM、CRLF）→
  `mapCsvHeadersToFields`（列名或字段 id 映射）→ `planCsvImport`（**逐行**走 `normalizeRecordData`，
  非法行带行号 + 中文原因聚合）→ `shouldCommitImport`（**零半态**判定）→ db `importRecords` 单事务落库。
  `POST /api/tables/:id/import.csv/preview` 只预览不落库，`POST /api/tables/:id/import.csv` 全合法才 201、
  任一行非法则 422 且**一行都不落库**（部分失败零半态有 HTTP 层快照逐字节相等断言锁定）
- **块类型引擎唯一入口**（r8）：10 种块类型（paragraph / heading1-3 / bullet / numbered / todo / quote / code / divider）的
  **内容归一**（`normalizeBlockContent`：字符串或对象入参、divider 强制空文本、todo 保留 checked、code 保留 language、其余类型丢弃专属字段）、
  **转换矩阵**（`canConvertBlockType`：同类型恒等、结构块 divider 禁止与文本型互转、其余 9 种互转 + `convertBlockContent` 按目标类型重新归一）、
  **拆合**（`planBlockSplit` / `mergeBlockContent`：回车拆块前半段留原块、todo 新块重置未勾选、标题续 paragraph、退格合块沿用前块类型）、
  **全文装配**（`assembleDocumentText`：按 (position, id) 排序，标题 # / 列表 - / 有序 1. / 待办 - [x] / 引用 > / 分割线 ---）
  与 **位置重排**（`planBlockReorder` 复用 r4 `reorderPositions` 口径）——全部只写在 `packages/shared`，**api 层零块类型分支**
- **文档数据层**（r8）：schema v7 新增 `documents` / `blocks` 两表（blocks.content 存 JSON、parent_id 可空、ON DELETE CASCADE）；
  **建文档自动带一个空 paragraph 首块**（r4 教训「用户第一次用」，消灭零块死路）；拆 / 合 / 移动 / 批重排均在单事务内落库且 position 连号收拢；
  `GET /api/documents/:id/text` 按 position 拼装全文（HTTP 层有逐字相等断言锁定）；4xx 覆盖非法块类型 / 越权 document_id / 非法 position / 非法转换
- **打印链路**（r8）：文档页「打印预览」按钮 = 纸面预览（`BlockView` 按类型渲染）+ `window.print()` + `@media print` 样式表
  （打印时隐藏 topbar / tabs / 工具条 / 列表 / 块操作，只输出 `.docs-print-sheet`）
- **r7 U2 低成本修复**（r8 顺手）：CSV 导入对话框补「数据行号」列 + 错误清单改「第 N 条数据（CSV 第 N+1 行）」口径（U2-1）；
  确认按钮旁前置「将向当前表追加 N 行 / 不可撤销」后果提示（U2-4）
- **Markdown 双向唯一入口**（r9）：`markdownToBlocks`（空行分块 / ``` 围栏状态机 / `#` / `##` / `###` / `- [x]` / `-` / `1.` / `>` / `---`，未知语法一律 paragraph **逐字保留**）与
  `blocksToMarkdown`（按 (position, id) 排序、连续 numbered 编号、paragraph 防误判转义、自适应代码围栏）都在 shared；
  API 导出只装配、零方言分支；`blocks → md → blocks` 往返逐字节相等有 e2e + audit 双重断言
- **文档导入零半态**（r9）：`normalizeMarkdownImportPayload`（markdown 文本 / `{markdown}` / `{blocks}` 三形态）→
  `planMarkdownImport`（逐块走 `normalizeBlockContent`，错误带块号 + 中文原因）→ `shouldCommitMarkdownImport`（任一块非法即整体拒绝）
  → db `importBlocks`（**事务外整体校验 + 单事务 DELETE/INSERT 整篇替换**）。preview 端点只解析不写库；
  commit 全合法 200、部分失败 **422 且一块不写**（HTTP 前后快照逐字节相等）
- **AI 块级修订契约**（r9）：`RevisionProvider` 接口（instruction + 块类型 + 原文 → 建议文本 / 理由 / provider）
  由 api 一处注入 mock 实现，**M5 接真实模型只换 provider**；`assertValidRevisionInstruction` 守卫空 / 超长指令，
  `planRevisionApply` 唯一决定采纳语义——**adopt 非 true 时 applied=false 且服务端零写入**，采纳才走 updateBlock；
  未采纳前后块快照逐字节相等有 e2e + audit + CDP 真点三层实证
- **mock 模型与评测集骨架**（r9）：`packages/agent/mock-provider.ts` 固定脚本化回复（精简/扩写/要点/正式/默认，零 token、零随机、同输入恒定同输出）；
  `packages/agent/evals/` 录制回放式 `RecordedCall` / `runReplay`，错误期望必须被检出（非恒真占位）
- **r8 U2 两项修复**（r9 顺手）：窄屏长文本 textarea 按 scrollHeight 自动撑高（不再 1px 字形顶渣）；
  编辑态无序 / 有序列表块补可见 `•` / `1.` marker（with shared `computeNumberedOrdinals`）
- **AI 工作台对话数据层**（r10）：schema v8 新增 `conversations` / `messages` / `artifacts` 三表（消息 role CHECK、conversation_id ON DELETE CASCADE、`tool_calls_json` 存逐条回执）；
  `recordChatExchange` 把 user → tool → assistant → artifact 一个事务落库，删会话级联清消息与产物，reload 不丢
- **工具注册表唯一入口**（r10/r12）：12 个工具集中在 `packages/agent/tool-registry.ts`，
  handler **全部调真实服务层（XieFlowDb）**，无占位例外——`search_knowledge` 自 r12 起走真检索（见下）并回带 `doc_id` / `chunk_id` 来源引用，不再返回 `placeholder=true`。
  名称清单 / 参数归一 / 状态变更工具清单全在 shared，api 层零工具分支；未知工具 / 非法参数 → 400
- **mock 规划器与回放锁定**（r10）：`mockPlanner`（`mock-scripted-v1`）按 shared `SCRIPTED_INTENTS` 扫描消息 → 工具调用序列 → 真实执行 → shared `buildChatSummary` 汇总，零 token 零随机；
  `packages/agent/evals/tool-replay.ts` 录制 **17 条**用例，在全新内存库上真执行并核对 `intent` / 工具名+参数 / ok 标志 / 摘要 / **实际创建的 todo 与 document 标题**，错误期望必须变红（非恒真占位）；换真实模型只换 api 一处 planner 注入
- **逐条 tool_call 落库**（r10）：一次对话的每条工具调用都生成 `tc-1/tc-2/...` 回执，随 tool 角色消息写入 `tool_calls_json`；
  HTTP 层有查库断言锁定「≥2 次真实工具调用 + tool 消息逐条回执 + create_todo 实际创建」，两组变异红相（跳过 handler / 不落 tool_calls）均被检出后逐字节还原
- **探针真读库**：`/api/health` 每次真写读一次 settings，不只是进程活着
- **多轮上下文唯一入口**（r11）：`DEFAULT_CONTEXT_WINDOW=8` / `MAX_CONTEXT_WINDOW=20` / `normalizeContextWindow` 与 `toPlannerContext` / `resolveContextualMessage` 全在 shared；api 按 `context_window` 从真实落库消息截取最近 N 条注入 planner，超限时 400；「再建一个 / 把它改成」在 shared 纯函数里消解为可执行脚本消息并回显 `resolution{referenceKind,referencedTitle}`，无历史时不硬解；M5 mock 无 update 工具，「改成」按「参照上一轮实体生成修正版」解释（报告自曝）
- **产物生成器唯一入口**（r11）：`html-report` / `markdown-table` / `json-data` 三类全部从真实工具回执装配（`packages/agent/artifact-generators.ts`），标签 / 守卫 / content-type 在 shared；`POST /chat {artifactType}` 生成并落 artifacts 表，`GET /api/artifacts/:id/content` 按 type 返回可预览正文（不存在 404、非法/不符 type 400）；HTML 用 `iframe sandbox` 预览，非占位
- **12 工具真服务层**（r11）：r10 八工具之上新增 `summarize_document`（`assembleDocumentText` 真读块）/ `export_document_md`（`blocksToMarkdown` 真导出）/ `list_schedules`（真区间查询）/ `create_schedule`（`db.createSchedule` 真建日程并纳入 `STATE_CHANGING_TOOLS`），handler 全接 XieFlowDb；UI 工具目录 6/页分页
- **r9/r10 U2 必修**（r11）：`computeInlineDiff`（中文按字/英文按词 LCS，same/removed/added 段合并）集中在 shared，DocsPage 修订面板原文红删除线 / 建议绿新增高亮；产物卡按「第 N 轮产物 · 对应本轮对话」与流同轮；窄容器八药丸 `white-space: nowrap` + 488px 顶栏纵排，不折行不裁切
- **知识库入库与检索唯一入口**（r12）：schema v9 新增 `knowledge_docs`（chunk_count）/ `knowledge_chunks`（token_count + 可空 vector 列，embedding 留位）；
  `chunkText`（200 字 / 40 字重叠，断段落优先、去重叠逐字等于原文）与 `searchChunks`（TF-IDF 余弦，中文逐字+英文成词，score 降序、零分过滤）全集中 `packages/agent/knowledge.ts`，纯 TS 零依赖零 token，api 层零算法分支；
  `POST /api/knowledge/ingest` 支持纯文本 / 已有文档两种来源（文档源走 `assembleDocumentText` 装配 + source_id 回指），`GET /api/knowledge/search?q=&limit=` 与 `search_knowledge` 工具都返回可溯源到具体 chunk 的来源引用；
  三篇文档 TF-IDF 排序 + 重叠窗口与检索排序两组变异红相均由 e2e/audit 锁定
- **回放评测集扩至 27 条**（r11）：r10 17 条之上 +4 新工具 +3 多轮指代 +3 产物类型，`runToolReplay` 在全新内存库真执行并核对 `resolution` / `artifactType` / `expectState.schedules`；改坏指代或产物生成器均变红（两组变异红相）

## 明确不做（当前阶段）

实时汇率 · 视频会议 · 第三方 IM 集成 · 插件市场 · SaaS 多租户计费

## 许可证

[MIT](LICENSE)
