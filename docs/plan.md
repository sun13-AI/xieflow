# 协流 XieFlow · 路线图与轮次记账

> 宪法见设计包 AGENTS.md；轮次规则见 RUNBOOK.md（均在 D:\work\好东西\xieflow-design\）。

### 2026-11-17 · r11 研发（yanfa-r11 · M5 收官：多轮上下文与产物生成）
- 交付：多轮上下文（shared `DEFAULT_CONTEXT_WINDOW=8` / `MAX=20` / `normalizeContextWindow` / `toPlannerContext` / `resolveContextualMessage`，指代消解「再建一个 / 把它改成」纯函数化，api 按窗口截取真实落库消息注入 planner，`resolution` 元数据回显）；**产物生成器** `packages/agent/artifact-generators.ts`（HTML 报告 / Markdown 表格 / JSON 数据，全从真实工具回执装配，iframe/sandbox 预览）；工具链 8→**12**（+summarize_document / export_document_md / list_schedules / create_schedule，handler 全接 XieFlowDb，create_schedule 纳入状态变更清单）；api `chat` 带 `context_window` + `artifactType`、`GET /api/artifacts/:id/content` 按 type 返回可预览正文
- web：对话流多轮连续 + 上下文提示条 + 12 工具 6/页分页 + 产物 HTML/表格/JSON 三 tab 切换；**r9 U2 必修**（shared `computeInlineDiff` + DocsPage 原文红删/建议绿增行内高亮）、**r10 U2 必修**（产物卡「第 N 轮产物 · 对应本轮对话」与流同轮、窄容器八药丸 nowrap + 488px 顶栏纵排不折行不裁切）
- 回放评测集 17→**27**（+4 新工具 +3 多轮指代 +3 产物类型；`runToolReplay` 核对 `resolution` / `artifactType` / `expectState.schedules`）
- 断言规模：e2e 924 → **1020（+96）**· audit 786 → **867（+81）**· typecheck 5 包全绿；`pnpm run test:all` exit 0。**无一条断言被删**；只更新 6 条既有期望值/标签（e2e 工具数/工具名/状态变更清单 8→12 ×3、注册表 8→12 ×1、audit 工具目录数与工具名 8→12 ×2）；**本轮无 schema 迁移**（artifacts.type 为 TEXT，三类新产物不需 v9），CI smoke 正则保持 `(2|3|4|5|6|7|8)`
- **变异红相留痕（两组）**：① shared `resolveContextualMessage` 强制不解析 → e2e 1003-17 / audit 799-1 抛错（指代链路全红）；② HTML 产物生成器改占位 → e2e 1017-3 / audit 865-2。两组目标文件 SHA256 `BD5897CE…` / `1B8AF531…` 改前改后完全相同，`MUTATION-PROBE` 零残留，重跑全绿
- 截图矩阵：docs/ui/r11/ **7 张**（多轮对话 / 上下文提示 / 产物 HTML / 产物表格 / 工具链第 2 页 / 窄屏 U2 修复 / 错误态）+ 壳基线 8 张同批重拍（徽章 r11，与 r10 逐位全异）；7/7 与 8/8 哈希互异，全库 111 PNG / 109 互异（仅 r4 已披露 2 组同态）；首轮 01 命名与数据不符 + 窄屏第八药丸裁切两处经全矩阵重拍修正，废片未入库；逐张 `read_image` 目验
- 「用户第一次用」全链路（headless CDP 真点，0 会话起步）：建会话 conv#19 → 真发「新建待办：CDP r11 真建实体，然后列出文档」3 工具（真建 #60）→ 真发「再建一个」→ UI 显「引用上一轮…(repeat)」+ 真建 #61 + 产物 #23「第 2 轮产物」→ HTTP 回查 6 消息 / 3+2 tool_call / 2 产物 / 待办 #60#61 → reload 全在 → 切「表格」预览 tab → DELETE 探针后 conv=0 / todos=1（未动 r3 既有「22」）→ 服务收净
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI release 配置；**无 schema 迁移、未手改库文件**；只删本轮自建探针会话/待办/日程/文档；PowerShell 新增段全 ASCII（shot.ps1 81960 B、非 ASCII 0、PS5.1 Parser 0 错误）；全程 headless、服务收净、零 token（只 mock）

### 2026-11-17 · r10 研发（yanfa-r10 · M5 起步：AI 工作台对话与工具调用框架）
- 交付：schema v7→v8（conversations / messages / artifacts 三表 + role CHECK + conversation_id ON DELETE CASCADE + `tool_calls_json` 逐条回执）；`recordChatExchange` 单事务落 user/tool/assistant/artifact；工具契约与脚本规划口径全集中 shared（TOOL_NAMES / STATE_CHANGING_TOOLS / 参数归一 / SCRIPTED_INTENTS / buildChatSummary）
- packages/agent：`ToolRegistry` 8 工具 handler **全接真实 XieFlowDb**（search_knowledge 按任务单为 M6 前空占位并显式 placeholder=true）；`mock-planner.ts`（`mock-scripted-v1`）识别意图→执行→汇总；evals 从 r9 单步修订骨架扩为 **17 条多步工具轨迹录制回放**，含 7 条「实际创建」状态断言（宪法四条）
- api：conversations CRUD、GET /api/tools 目录、POST `/api/conversations/:id/chat`（mock 规划执行 + 逐条 tool_call 落库 + 产物）、messages / artifacts / artifact 单篇读取；4xx：空/超长消息、未知工具、非法参数、空/超长标题、越权 id；换真实模型只换 planner 一处注入
- web：新增第八个 tab「AI 工作台」——会话列表 + 对话流（用户蓝 / AI 灰 / tool-call 虚线气泡，可展开 arguments）+ 右侧产物预览 JSON 面板 + 窄屏三栏纵排；壳基线由七张扩为八张（`chat-tab-active.png` 同批重拍）
- 「用户第一次用」全链路（headless CDP 真点，0 会话起步）：建会话 → 真发「新建待办+列文档」→ 3 次工具调用（create_todo 真建待办 #53）落库 → AI 汇总 → 产物 #10 预览 → HTTP 回查 roles/3 条 tool_call/产物/待办全在 → reload 不丢 → 删探针会话与待办，库内 0 会话、只剩 r3 既有待办「22」；服务收净
- 断言规模：e2e 809 → **924（+115：数据层 33 + 工具契约 34 + 注册表 26 + 回放 9 + 编排 13）**· audit 706 → **786（+80：工具/会话/chat/产物/4xx/级联删除真 HTTP 装配）**· typecheck 5 包全绿；`pnpm run test:all` exit 0。**无一条断言被删**；随 v8 迁移只更新 6 条既有期望值与若干标签文字，CI smoke 正则同步为 `(2|3|4|5|6|7|8)`
- **变异红相留痕（两组）**：① `ToolRegistry.execute` 跳过 handler 改假回执 → e2e 910-14 / audit 777-4（create_todo 未真写库、回放状态断言红）；② `recordChatExchange` tool 消息存空数组 → audit 783-3（逐条 tool_call 落库/工具名/arguments 全红）。两组均逐字节还原（SHA `6DB7092A…` / `F6738570…` 前后一致）、`MUTATION-PROBE` 零残留，重跑全绿
- 截图矩阵：docs/ui/r10/ **7 张**（空态/会话列表/对话流/工具调用气泡/产物预览/窄屏/错误态）+ 壳基线 8 张；7/7 与 8/8 哈希互异，全库 104 PNG / 102 互异（仅 r4 已披露 2 组同态）；首轮 01 工具数矛盾 + 与壳 chat 同字节两处毛刺经全矩阵重拍修正，废片未入库；逐张 `read_image` 目验
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI release 配置；只走 user_version 迁移、未手改库文件；只删本轮自建探针会话与待办；PowerShell 新增段全 ASCII（shot.ps1 75998 B、非 ASCII 0、PS5.1 Parser 0 错误）；全程 headless、服务收净

### 2026-11-17 · r9 研发（yanfa-r9b · M4 收官轮：续做中断会话并收尾）
- 交付：Markdown 双向转换引擎全集中 shared（`markdownToBlocks` / `blocksToMarkdown`：10 类型、空行分块、代码围栏、未知语法逐字降级 paragraph、marker 转义往返不丢；`computeNumberedOrdinals`、`buildDocumentMdFileName`）；导入零半态（`normalizeMarkdownImportPayload` → `planMarkdownImport` → `shouldCommitMarkdownImport` → db `importBlocks` 事务外整体校验 + 单事务整篇替换）；AI 修订契约（`RevisionProvider` / `assertValidRevisionInstruction` / `planRevisionApply`，**未采纳零写入**，api 一处注入 mock provider，M5 可换真实模型）
- api：`POST /api/documents/:id/import.md/preview`（只解析不写库）、`POST /api/documents/:id/import.md`（全合法 200 / 部分失败 422 零半态）、`GET /api/documents/:id/export.md`（RFC 5987 中文名 + text/markdown）、`POST /api/documents/:id/blocks/:blockId/revise`（建议预览 / 采纳才 updateBlock；4xx：空/超长 instruction、不存在块 404、跨文档块 400）
- web：文档页加「导入 Markdown」（预览表 + 错误清单 + 后果提示 + 确认）、「导出 .md」（按字节下载）、块级「AI 修订」面板（原文/建议 diff + 理由 + 采纳/放弃）；顺手修 r8 U2 两项必修：窄屏长文本 textarea 自动撑高（不再 1px 裁切渣）、编辑态列表块补 `•` / `1.` marker
- packages/agent：mock 脚本 provider（精简/扩写/要点/正式/默认，零 token 零随机）+ evals 录制回放骨架（`RecordedCall` / `runReplay`，错误期望必须被检出）；api / 根 package / pack.js 依赖同步
- 「用户第一次用」全链路（headless CDP 真点）：0 文档 → 建文档（默认首块）→ 导入 5 块 → 修订建议（HTTP 快照 SHA `12ED9D9F…` 前后相等，零写入）→ 采纳（块文本真替换）→ 另一块放弃（快照 `6ADD6D93…` 相等）→ 导出 153 字节 → reload 5 块全在 → 导出 md 再导入新文档逐字段相等 → 删探针文档，库内 0 篇、端口收净
- 断言规模：e2e 716 → **809（+93：双向引擎 36 + 导入计划 25 + 修订语义 20 + 导入数据层 12）**· audit 639 → **706（+67：r9 真 HTTP 装配节，含 4xx 与零半态）**· typecheck **5 包**（新增 agent）全绿；`pnpm run test:all` exit 0。无断言被删；本轮无 schema 迁移，CI smoke 正则保持 `(2|3|4|5|6|7)`
- **变异红相留痕（两组）**：① `planRevisionApply` 改「总是应用」→ e2e 2 红 / audit 4 红（含「未采纳不改库」快照被改）；② `shouldCommitMarkdownImport` 改「忽略错误行」→ e2e 1 红 / audit 2 红 + 1 崩溃（部分失败 200 got、imported=1）。两组均逐字节还原，`packages/shared/src/index.ts` SHA256 `EDCBFD5F…13CC1BF6` 前后完全相同，重跑全绿
- 截图矩阵：docs/ui/r9/ 共 **8 张**（导入预览 / 导入成功后 / 导出落盘 / 修订 diff / 采纳后 / 放弃后 / 窄屏 U2 修复 / 窄屏导入）+ 1 份真实导出 .md 字节证据；逐张 `read_image` 目验，8/8 SHA256 互异，全库 96 PNG / 94 互异（仅 r4 已披露 2 组）；首轮 01/04/08 钉态因 `useEffect` 闭包 state 未提交而缺预览/diff，定位后显式传 `data.doc` 并**全矩阵重拍**（废片未入库）；七 tab 壳基线自动重拍、徽章推进 r9，与 r8 逐位全异
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI release 配置；无 schema 迁移、未手改库文件；只删本轮自建探针文档；PowerShell 新增段全 ASCII（shot.ps1 0 非 ASCII 字节 / PS5.1 Parser 0 错误），全程 headless、服务收净
- 续做说明：前任 yanfa-r9 会话中断，留下工作树 609 行半成品（shared/db/e2e/agent 骨架）且 `test:all` 红（e2e TS2322×3）；本轮先修绿（先修断言类型，e2e 809 全绿）再在其基础上续做 api/web/audit/截图/文档，未推倒重写

### 2026-11-15 · r8 研发（yanfa · M4 起步轮）
- 交付：schema v6→v7（`documents` 表 id/title/created_at/updated_at + `blocks` 表 id/document_id/type/position/content JSON/parent_id 可空 + type CHECK + 2 索引 + ON DELETE CASCADE）+ shared 块类型引擎（10 种：paragraph / heading1-3 / bullet / numbered / todo / quote / code / divider；`normalizeBlockContent` / `canConvertBlockType` / `convertBlockContent` / `planBlockSplit` / `mergeBlockContent` / `planBlockReorder` / `assembleDocumentText`，**api 层零类型分支**）+ api（documents CRUD、blocks CRUD、全文读、拆 / 合 / 移动 / 批重排 / 类型转换，4xx：非法块类型 / 越权 document_id / 非法 position / 非法转换 / 重复或越权重排 id）+ db（拆合移动单事务、position 连号收拢、持久化重开不丢）+ web（「文档」tab：文档列表 + 编辑器多类型渲染 + 回车拆块 / 退格合块 / 上移下移 / 类型切换下拉 + 打印预览 `window.print()` + `@media print` 样式表）
- 「用户第一次用」全链路（r4 教训）headless CDP 真点：**建文档 → 默认首块自动在场（非死路）→ 输入 → 回车拆块 → 类型切换 → 上移 → 保存 → reload 重开不丢**，并 `GET /api/documents/:id/text` 回查 `blockCount=2` / 全文逐字相等；验后 DELETE 清理（0 篇）。另有 HTTP 层全链路断言与 e2e 关库重开 `JSON.stringify` 逐字节相等断言锁定拆 / 合 / 移动 / 重排后的块顺序。
- 断言规模：e2e 587 → **716**（+129：块类型引擎 64 + v6→v7 迁移与文档数据层 65）· audit-http 522 → **639**（+117：documents + blocks 一节）· typecheck 4 包全绿；`pnpm run test:all` **exit 0**。CI HTTP smoke 正则同步为 `(2|3|4|5|6|7)`（v0.0.6 教训）。随迁移只更新 6 条既有断言期望值 + 8 条标签文字，条数不变，**无一条断言被删**。
- **变异红相留痕（两组）**：① 临时把 shared `splitBlockText` 改坏（忽略 caret）→ e2e **8 条失败**、audit **2 条失败**（含「r8 拆块：前半段留原块 got 一级标题 want 一级」）；② 临时去掉 `assembleDocumentText` 的 position 排序 → e2e **1 条失败**（「乱序输入按 position 排序」）。两次均逐字节还原（`packages/shared/src/index.ts` SHA256 `1A16B5C7…C71981` 前后完全相同、`git diff` 空）后全绿——证明拆块与全文装配断言不是自洽占位。
- 截图矩阵：docs/ui/r8/ 共 **11 张**（任务单 6 态全覆盖 + 真实拆块前后 + 加载 / 错误 + r7 U2 修复证据），07/08 两拍间真发 `POST /api/blocks/:id/split`；逐张 `read_image` 目验 + 全库 **88 张 PNG / 86 互异哈希**（仅 r4 已披露 2 组同态，r8 零新增）；**壳基线由 6 张扩为 7 张**（新增「文档」tab 激活态 `docs-tab-active.png`），旧六张同批重拍与 r7 哈希全异。
- 顺带修 r7 UI 记账低成本项：**U2-1** 错误行号口径（预览表加「数据行号」列、清单改「第 N 条数据（CSV 第 N+1 行）」、头部写明口径）· **U2-4** 确认按钮后果提示（「将向当前表追加 N 行 / 不可撤销」前置到决策点）。其余 U2（禁用错误态确认按钮、截断提示、当前视图指示）留 M4 视图轮。
- 已知遗留：① 块编辑器为单人版，`parent_id` 已落库与校验但 UI 未做嵌套缩进 / 层级渲染（M9 协同 CRDT 时再展开）② 块文本编辑为 textarea 单行/多行输入，未做富文本 inline 样式 ③ 打印预览为浏览器 `window.print()`，未走 printToPDF 服务端出 PDF ④ 类型切换矩阵当前规则为「结构块 divider 隔离」，后续可扩为更细的转换白名单 ⑤ 本机无 pwsh 7，shot.ps1 新增段全 ASCII + PS5.1 Parser 0 错误，unix 分支未实测（与 r5/r6/r7 同款未验项）⑥ 三平台 CI 未实跑（属 lead 发版环节）。
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI release 配置；只走 user_version 迁移，未手改库文件；只删本轮自建文档与表。

### 2026-11-15 · r7 研发（yanfa · M3 收官轮）
- 交付：schema v5→v6 迁移（`views` 表：id/table_id/name/filter_spec JSON/sort_spec JSON/visible_fields JSON/position + 索引 + ON DELETE CASCADE）+ shared 视图口径（`normalizeViewSpec` 形状/字段存在性/取值类型/去重归一、`describeViewSpec` 摘要、`assertValidSortDirection`）+ `queryRecords` 扩为**多字段 AND 筛选 / 多级排序 / 字段投影**（单条件旧入口保持兼容，api 层零口径分支）+ CSV 导入口径（`parseCsvText` RFC4180、`mapCsvHeadersToFields`、`planCsvImport` 逐行走 `normalizeRecordData` 且错误行带行号+原因聚合、`shouldCommitImport` 零半态判定、`normalizeCsvImportPayload`）+ api（views CRUD、`GET /api/views/:id/records` 按视图查询、`POST /api/tables/:id/import.csv/preview` 预览、`POST /api/tables/:id/import.csv` 单事务原子导入、`?filters=` 多条件 AND、非法方向 400）+ db（`createView`/`getView`/`listViews`/`updateView`/`deleteView`/`importRecords` BEGIN IMMEDIATE…COMMIT/ROLLBACK）+ web（视图切换栏 / 视图编辑面板：筛选·排序·隐藏列 / CSV 导入对话框：前 5 行预览+错误行清单+确认导入）
- **r6 遗留三项全修**：① 多字段 AND 筛选（集中 shared `queryRecords`，HTTP `?filters=` 与视图 spec 同一路径）② **U2-1** 编辑态整表列宽跳变 → `table-layout: fixed` + 编辑框 `box-sizing: border-box`（08 图与 01 列位对照）③ **U2-2** 筛选提交无反馈 → 「应用筛选 / 清除」按钮 + 真实命中数成功条（09 图）；无效方向下拉 → 未选排序字段时禁用+提示，非法方向 deep link 由 shared 守卫/api 400 拦下
- 验收重点「**导入部分失败零半态**」：预览端点只解析不落库；提交端点任一行非法 → 422 + 错误行清单且一行不写，全部合法 → 整个批次一个 SQLite 事务落库；audit 4 条断言锁定（imported=0 / 错误行号 / 部分失败前后记录快照 `JSON.stringify` **逐字节相等** / 合法行 A·B 均未半路落库），e2e 另有服务层「先合法后非法 → 表内仍 0 行」断言
- 「用户第一次用」全链路（r4 教训）：headless CDP 真点走通 **建表（8 默认字段）→ 视图编辑面板建视图（筛选/排序/隐藏列）→ 切换视图（全部记录 ↔ 我的视图，6 列投影）→ 编辑视图（改名+去筛选）→ 导入 CSV 对话框（预览→确认）→ 成功条 + HTTP 回查 2 行落库**，随后删表清理（库内 0 表）；HTTP 层另有 audit「建表→建视图→按视图查→编辑视图→导入」全链路断言
- 断言规模：e2e 449 → **587**（+138：视图 spec 归一 31 + 按视图查询口径 21 + CSV 导入口径 43 + v5→v6 迁移与视图数据层 43）· audit-http 403 → **522**（+119：views + CSV import 一节）· typecheck 4 包全绿；`pnpm run test:all` **exit 0**（离线 587 / 在线 588 · 522）。CI 的 HTTP smoke 静态正则同步为 `(2|3|4|5|6)`（v0.0.6 教训）
- **红相留痕**：临时把 shared `shouldCommitImport` 改成「忽略错误行」→ e2e 1 条失败、audit 4 条失败（含 `部分失败 -> 422 got 201`、`imported=0 got 2`），恢复后全绿——证明零半态断言不是自洽占位
- 截图矩阵：docs/ui/r7/ 共 **9 张**（任务单 6 态全覆盖 + 窄屏 + U2-1 固定列宽 + U2-2 筛选反馈），8 张走真实 api 链路、1 张钉态编辑器；逐张 `read_image` 目验 + SHA256 两两互异（全库 76 张 PNG / 74 互异，仅 r4 已披露 2 组同态，r7 零新增）；壳基线 6 张自动重拍（本轮未新增 tab，但徽章改 r7 / 工作台 schema v6，哈希与 r6 全异）
- 已知遗留：① 视图筛选仍为「等值 / 包含」语义，区间（金额 > 1000）与 OR 组合未做 ② CSV 导入按表头列名或字段 id 映射，未做交互式列映射面板 ③ 视图 position 不强制唯一（只影响排序，同 position 按 id 兜底）④ 本机无 pwsh 7，r7 新增 ps1 段全 ASCII + PS5.1 Parser 0 错误，unix 分支未实测（与 r5/r6 同款未验项）

### 2026-11-15 · r6 复验与发版（M3 起步）
- 首轮双通过：waizhuan **187 条真实 HTTP 断言**（7 种字段类型各走建表→加字段→加记录→筛选→排序→读回，number 按值排 [2,9,10,100] 非字典序、select 按候选项序、null 双向恒末）+ 13 个 4xx 分支 + 重启前后快照逐字节相等（9 表/81 字段/37 记录）；ui 阻断岗全库 67 张 PNG 哈希亲算、六药丸新壳机制仍生效、04↔01 像素差 5.4% 坐实筛选排序真实
- 关键工程：7 类型引擎三函数全集中 shared，api 层零类型分支（lead 巡查 grep 确认）；建表自带 8 默认字段，消灭 r4 式零字段死路
- 会话异常：yanfa-r6 在最终收尾报会话错但提交已落盘——lead 按宪法第〇条亲自复跑 test:all 全绿才放行复验（仓库事实优先）
- 发版：**v0.0.10 三平台全绿 + Release 资产核对通过（xieflow-v0.0.10.tar.gz 6.6MB）**
- 遗留：多字段 AND 筛选、编辑态列宽跳变、筛选提交无反馈、新建单选字段缺候选输入证据 → r7 一并修

### 2026-11-15 · r6 研发（yanfa · M3 起步轮）
- 交付：schema v4→v5 迁移（tables / fields / records 三表，records.data 存 JSON、键为字段 id）+ 字段类型引擎全集中 shared（`validateFieldValue` / `coerceFieldValue` / `compareValues` / `normalizeRecordData` / `queryRecords`，7 种类型 text·number·date·select·multi-select·checkbox·url，**api 层零类型分支**）+ api 路由（tables/fields/records CRUD + 按字段筛选 + 按字段排序 + 分页，4xx：非法类型 / 未知字段 / 筛选值类型不符 / 未知筛选或排序字段）+ web 多维表格页（「表格」tab：网格视图 + 单元格按类型渲染与编辑 + 字段管理面板 + 筛选/排序/分页 + 深链参数）
- 顺带修 r5 遗留：**U2-1** 列级指标改名「待办完成率」（汇总卡同步改「项目待办完成率」，避免与列名「已完成」语义冲突）+ **U2-2** 导出文件名改 `xieflow-board-<项目名>-<YYYYMMDD>.csv`（口径集中 shared `buildBoardCsvFileName`，中文名按 RFC 5987 `filename*=UTF-8''` 下发）
- 「用户第一次用」全链路实跑通（headless Edge + CDP 真点）：建表 → 加字段（面板）→ 加行 → 编辑单元格 → 筛选 → 排序 → 删表清理（探针日志见 r6 yanfa 报告第五节）
- 断言规模：e2e 288 → **449**（+161：字段类型引擎 86 + 记录归一与查询装配 25 + 导出文件名 6 + v4→v5 迁移与数据层 44）· audit-http 313 → **403**（+90：tables/fields/records 86 + U2-2 文件名 4）· typecheck 4 包全绿；`pnpm run test:all` exit 0
- 截图矩阵：docs/ui/r6/ 共 8 张（多类型网格 / 真实空表 / 字段管理面板 / 筛选排序后 / 窄屏 / 错误态 / 加载态 / 单元格编辑态），逐张 read_image 目验 + 全库 67 张 SHA256 两两互异自查（唯一同态组仍是 r4 已披露的两组）；壳基线由 5 张扩为 **6 张**（新增「表格」tab 激活态）
- 已知遗留：① 筛选为单值等值/包含语义（多字段 AND 筛选未做，留 r7 视图轮）② 记录 data 以字段 id 为键，字段改名不影响数据、但外部直接读库需先查字段表 ③ r5 目录看板图仍是改名前形态（未重拍，避免破坏 r5 真值对真图证据链）

### 2026-11-15 · r5 研发（yanfa · M2 收官轮）
- 交付：api 统计端点 `GET /api/projects/:id/stats`（各列卡片数/完成率/待办关联数 + 项目合计）· api 导出端点 `GET /api/projects/:id/export.csv`（UTF-8 BOM + CRLF + RFC4180 转义 + 中文表头 9 列 + 每列至少一行）· web 看板页统计卡（四块汇总 + 各列完成率条）与「导出 CSV」按钮（按字节落盘，保留 BOM）
- 规则集中：统计口径只写在 shared `computeBoardStats`（完成 = 关联待办状态 done；分母 0 记 0% 不除零）；CSV 生成只写在 shared `buildBoardCsvContent` / `escapeCsvField` / `countCsvRecords`（api 只装配 + 404/400 映射）
- 断言规模：e2e 217 → **288**（+71：统计口径 35 + CSV 台账 36）· audit-http 233 → **313**（+80：统计 4xx / BOM 字节头 / 列对齐 / 转义 / 空项目导出行数 / 统计-移动联动）· typecheck 4 包全绿；`pnpm run test:all` exit 0
- 截图矩阵：docs/ui/r5/ 共 8 张 + 1 份落盘 CSV（统计卡有数据 / 空项目统计 / 导出按钮态 / CSV 落盘内容 / 窄屏 / 建卡弹窗 / 加载态 / 错误态），逐张 read_image 目验 + SHA256 两两互异自查；壳基线 5 张自动重拍
- 已知遗留：① 导出后 headless 浏览器不自行退出（触发文件下载）→ shot.ps1 改为「等 PNG 落盘 → 必要时杀浏览器树」的防挂死捕获 ② r4 目录看板图是 r5 之前形态（看板页以 r5 目录为准）③ 本轮无 schema 迁移（统计/导出复用 v4 三表）

### 2026-11-15 · r5 看板统计与导出（M2 收官）
- 首轮双通过：waizhuan **Excel COM 真开**验证（9 列不串列、BOM EF BB BF、含逗号/引号/换行同格）+ 统计口径逐字段手算吻合（分母 0 三档全记 0% 无 NaN）+ 移动联动即时变化；ui 阻断岗 U1=0（58 张哈希亲算、r3 假图零复发）
- 关键工程细节：CSV 下载用 arrayBuffer 按字节落盘（fetch 文本解码会剥 BOM）；统计口径集中 shared computeBoardStats，零分母不除零
- 发版：**v0.0.9 三平台全绿 + Release 资产核对通过（xieflow-v0.0.9.tar.gz 5.3MB）**
- 遗留：U2-1 列级「完成率」与列名「已完成」语义冲突 → r6 必修；U2-2 导出文件名只含内部 id → r6 必修；P4×2 CSV 无项目名列/空列占位行 → r6 评估

### 2026-11-15 · r4 复验返工记录（M2 起步）
- 初验双打回：waizhuan P1 **用户死路**（建项目零列、建卡静默无效——纯数据层交付漏了用户第一次用的完整链路）+ ui-reviewer U1 **壳变更 tab 激活三连漏**（r2/r3/r4 同类坑第三犯）
- 返工 #1（yanfa-r4b，e64abd8）：createProject 自动三列（shared DEFAULT_BOARD_COLUMNS）+ 双守卫不静默 + **壳基线固化**（shot.ps1 Invoke-ShellBaseline，每轮自动拍五 tab 激活态——三连漏流程性归零）+ 项目切换深链 + 断言 e2e 217 / audit 233
- 复审双通过：waizhuan 亲测死路终结（三列自动在场+移动闭环）；ui 阻断岗真跑 shell 基线机制验证 + 13/05 同态裁决放行（同真实数据态多证据位，非造假）
- 发版：**v0.0.8 三平台全绿 + Release 资产核对通过**
- 教训：数据层交付必须补「用户第一次用」全链路视角；壳/布局变更当轮必须补拍全部激活态（已机制化）

### 2026-11-15 · r3 复验、返工与发版全记录（M1 收官）
- 初验双打回：waizhuan **P1 循环实例 HTTP 层完全不生效**（去重条件恒假——e2e 14 条全测纯函数、HTTP 零覆盖，伪交付被实跑戳穿）+ ui-reviewer **U1 假图**（06/10 SHA256 字节级相同，改期证据失真）
- **UI 审查官升级阻断岗**（r3 起）：连续两轮漏网 U1 命中 + 字节级比对新技术；org.md 三节改写，UI-VERDICT 与 VERDICT 并行裁决
- 返工 #1（yanfa-r3b，8de574d）：A 装配集中 shared assembleRangeSchedules + HTTP 23 条循环断言；B 假图根因（seed 一次性建完）→ seed 拆两拍真实 PATCH；C~F 补 11-todos-tab / 窄屏重拍 / 文案 / line-clamp
- 总监过程巡查制生效（owner 指令入岗）：巡查中纠偏 2 项（锚日窗外断言确认、假图根因先定位后拍）——研发回应质量高
- 复审插曲（lead 两次违宪被抓）：①开源化删根 README「界面与测试对照」节（ui 阻断岗首裁打回，lead 亲修恢复）②速查行断言规模回退 167/138→155/113 且规模节未恢复（waizhuan 打回，lead 亲修）——**复验体系不因 lead 身份豁免，宪法治所有 agent**
- 发版：v0.0.6 CI 红（HTTP smoke 硬编码 schemaVersion:2，r3 已迁 v3 过期）→ **v0.0.7 三平台全绿 + Release 资产核对通过（xieflow-v0.0.7.tar.gz）**
- 教训：本机动态断言 vs CI 静态断言的差异面；e2e 测纯函数 ≠ HTTP 层生效——用户视角实跑是唯一真相源

### 2026-11-15 · r7 复验与发版（M3 收官）
- 首轮双通过：waizhuan 零半态独立复现（部分失败 CSV → 422 + imported=0 + 前后快照逐字节相等）+ **变异红相亲自复现**（临时改坏 shouldCommitImport → 5 条断言变红 → 逐字节还原全绿）；ui 阻断岗 76 张哈希亲算、01↔03 隐藏列像素差 63.6% 坐实
- 方法论新增：变异红相留痕（把实现故意改坏证明断言非占位）——waizhuan 与 yanfa 双向独立验证，建议写入宪法四条
- 发版：**v0.0.11 三平台全绿 + Release 资产核对通过（xieflow-v0.0.11.tar.gz 8.7MB）**
- M3 里程碑收官：7 类型字段引擎 + 网格 + 视图持久化 + CSV 导入零半态

### 2026-11-15 · 开源（owner 指令）
- 全历史密钥扫描通过（gho_/ghp_/github_pat_ 仅命中报告内的扫描模式描述文本，无真 token）
- MIT LICENSE + README 开源化（方法论/贡献者入口/目录结构/路线图）+ RUNBOOK 入库（仓库自包含）
- 仓库 sun13-AI/xieflow 设为 public；你朋友可访问 https://github.com/sun13-AI/xieflow
- 记录：开源决策由 owner 在 ask 确认（MIT 许可证选择）

## 里程碑总览

M0 立项 → M1 待办+日程 → M2 项目+看板 → M3 多维表格 → M4 文档 → M5 AI 工作台 v1
→ M6 知识库 RAG → M7 导图+白板 → M8 组织管理 → M9 网络版 → M10 多端与单机版

## 进度看板（每轮更新）

| 轮 | 任务 | 状态 | 版本 | 断言规模 | VERDICT |
|----|------|------|------|----------|---------|
| r1 | M0 仓库骨架 | ✅已发版（本地 tag；push 待配 remote） | v0.0.1 | e2e 42 | 通过 |
| r2 | M1 第 1 片：待办 CRUD UI + 四象限 | ✅已发版（初验双打回→返工#1→双 VERDICT 通过） | v0.0.5 | e2e 69 · audit 52 | 通过（waizhuan）+ UI 通过（观察员） |
| r3 | M1 第 2 片：日程与待办双向联动 | ✅已发版（初验双打回→返工#1→复审：ui 放行→waizhuan P2 修复确认 + CI 两跳 v0.0.6/v0.0.7 全绿） | v0.0.7 | e2e 167 · audit 138 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r4 | M2 第 1 片：项目+看板数据层与最小 UI | ✅已发版（初验双打回→返工#1→双复审通过；壳基线机制固化） | v0.0.8 | e2e 217 · audit 233 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r5 | M2 第 2 片：看板统计与 Excel/CSV 导出（M2 收官） | ✅已发版（首轮双通过；Excel COM 真开验证） | v0.0.9 | e2e 288 · audit 313 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r6 | M3 第 1 片：多维表格字段引擎 + 网格视图 | ✅已发版（首轮双通过；187 条真实 HTTP 断言 + 67 张哈希亲算） | v0.0.10 | e2e 449 · audit 403 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r7 | M3 第 2 片：视图持久化与 CSV 导入（M3 收官） | ✅已发版（首轮双通过；零半态变异红相独立复现） | v0.0.11 | e2e 587 · audit 522 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r8 | M4 第 1 片：文档块编辑器（单人版） | ✅已发版（首轮双通过；块操作 97/97 + 变异红相 2 组独立复现） | v0.0.12 | e2e 716 · audit 639 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r9 | M4 第 2 片：Markdown 导入导出 + AI 块级修订（mock） | ✅已发版（首轮双通过；会话中断后续做收官） | v0.0.13 | e2e 809 · audit 706 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r10 | M5 第 1 片：AI 工作台对话与工具调用框架 | ✅已发版（首轮双通过；8 工具真实 handler + 17 回放） | v0.0.14 | e2e 924 · audit 786 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r11 | M5 第 2 片：多轮上下文与产物生成（M5 收官） | ✅已发版（初验 ui 打回 U1 缺图证→返工#1 补图→复审双通过） | v0.0.15 | e2e 1020 · audit 867 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r12 | M6 第 1 片：知识库入库与本地检索 | ✅已发版（首轮双通过；TF-IDF 手算核对 + 变异红相 2 组） | v0.0.16 | e2e 1087 · audit 923 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r13 | M6 第 2 片：RAG 对话与引用溯源（M6 收官） | ✅已发版（首轮双通过；引用跳转真点 + lead 修 P4 速查行） | v0.0.17 | e2e 1161 · audit 966 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r14 | M7 第 1 片：思维导图 Markdown 双视图（M7 起步） | ✅已发版（首轮双通过；Markdown↔树 37/37 + 变异红相） | v0.0.18 | e2e 1221 · audit 1020 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r15 | M7 第 2 片：白板画布（M7 收官） | 🔨研发中 | — | — | — |

附加交付（r2 内 lead 直做，已入库 8e4fb9b）：
- 一键启动：start.cmd 双击 / scripts\start.ps1 start|stop|status（三轮全链路验证；期间排掉「僵尸 api 抢 8787」环境坑，非脚本缺陷）
- 打包命令：pnpm run pack（免安装目录）/ pnpm run dist（setup zip）——对齐 IKanBot pack/dist 语义；portable 目录实测 boot：api 200 + web 200 @8080；绕开 Node 24.14 cpSync 目录复制崩溃（0xC0000409），Windows 走 robocopy

### 2026-11-15 · r2 复验、返工与发版全记录
- 初验：waizhuan VERDICT 打回（P1 shot.ps1 分离启动 3 冷启 1 存活 / P3 vite 代理 500 错位 / P5 标题无上限）+ ui-reviewer UI-VERDICT 打回（U1×2：tab 激活零证据、三形态缺图；U2：包路径进 UI）
- lead 修 P1（非 watch + HTTP 200 判定，3/3 验证过）；yanfa-r2c 返工 A~G 全清（5b0422c）：断言 e2e 69 / audit 52，截图矩阵 10 张
- 复审：waizhuan VERDICT 通过（独立 3/3 复验）+ ui-reviewer UI-VERDICT 通过（四张新图全补实图，抓到研发加分项）→ 观察员升级门槛进度 1/2
- 发版历程：v0.0.3 CI 红（pwsh 7 只读变量 `$isWindows` 赋值炸，本机 PS5.1 不报）→ v0.0.4 CI 红（Unix pwsh 不支持 Start-Process -WindowStyle）→ **v0.0.5 三平台全绿 + Release 资产核对通过（xieflow-v0.0.5.tar.gz）**
- 宪法新增（owner 指令）：自测全程 headless/隐藏窗口，不弹任何可见窗口
- 教训沉淀：PowerShell 平台差异两连坑（自动变量名 / Windows 专属参数）→ 跨平台 ps1 必须在 pwsh 7 + PS 5.1 双环境验证；本地绿 ≠ CI 绿，tag 前 CI 实证不可省

### 2026-11-15 · r3 研发（yanfa · M1 收官轮）
- 交付：schema v2→v3 迁移（schedules 表：id/title/date/start_time/end_time/todo_id 可空外键 + repeat CHECK none-daily-weekly-monthly）· api 日程路由（CRUD + 区间查询 + 待办↔日程双向联动）· web 日程页（月视图网格 + 点日期建日程 + 关联待办状态徽标）+ 工作台「今日日程」卡
- 规则集中：循环实例化只在 `packages/shared` 的 `computeRepeatInstances`（月末收敛 1-31→2-28、不丢锚日、实例数封顶）；日程守卫（标题/日期/HH:mm/起止倒挂/repeat）同层，api 只做 400/404 映射
- 双向闭环断言：待办改期→日程变（audit「待办改期同步日程 date」）与日程改期→待办 dueDate 回写（audit「日程改期回写待办 dueDate」）各有独立断言，另 e2e 覆盖清空 dueDate 删日程 / 待办删除级联删日程
- 断言规模：e2e 69 → **155**（离线 154）· audit-http 52 → **113**（只涨未缩）；typecheck 4 包全绿；`pnpm run test:all` exit 0（返工 #1 后为 e2e 167 / audit 138，见返工记录）
- 截图矩阵：docs/ui/r3/ 共 10 张（月视图空态/有日程/建弹窗/联动徽标/改期同步后/窄屏 + 工作台今日日程卡/加载态/错误态/真实链路），逐张 read_image 目验
- 已知遗留：① data/xieflow.db 有一条既有待办「22」（非本轮产生，未删用户数据，待 lead/waizhuan 判定）② 工作台「今日日程」卡在钉态下不带待办列表，故卡片条目不显示状态徽标（徽标形态以 04-schedule-badge 为准）③ 版本号 0.0.4→0.0.5 的补正见 yanfa r3 报告自曝节（版本号与发版动作仍属 lead）

状态枚举：⏳待启动 / 🔨研发中 / 🔁返工k / ⏸熔断 / ✅已发版。

## 危险区台账

（空。本轮未触发危险区：无密钥写入、无对外发布、无用户数据删除、依赖均为新增非升级。r3 唯一越界嫌疑项：版本号 0.0.4→0.0.5 的补正，见 yanfa r3 报告自曝节，待 lead 确认）

## 任务单

### r3（进行中）· M1 第 2 片：日程与待办双向联动
- 目标：日程表落库 + 待办排期到日程 + 双向联动（改期互同步）——M1 收官轮
- 交付清单：
  1. schema v2→v3 迁移：schedules 表（id / title / date YYYY-MM-DD / start HH:mm / end HH:mm / todo_id 可空外键 / repeat none-daily-weekly-monthly）
  2. api 路由：CRUD + 按日期区间查询 + 待办联动（待办设到期日自动生成关联日程；日程改期回写待办 due_date）
  3. web 日程页：月视图网格 + 日期点击建日程 + 关联待办的日程显示待办状态徽标；工作台加「今日日程」卡
  4. 断言：e2e ≥+15（迁移/联动/循环实例化）、audit-http ≥+15（含 4xx：非法日期/非法 repeat/越权外键）
  5. 截图：月视图空态 / 月视图有日程 / 建日程弹窗 / 联动徽标 / 待办改期→日程同步后 / 窄屏 ≥6 张
- 验收标准：
  1. 全量测试绿：e2e ≥84、audit ≥67，README 双规模同步
  2. 联动双向闭环有断言锁定（待办改期→日程变 & 日程改期→待办变）
  3. 循环日程实例化规则集中定义在 shared（禁止散落 if-else）
  4. 截图矩阵 + 索引 + README 同一提交
- 前置：r2 已发版（v0.0.5）✅
- 特别项：ui-reviewer 若本轮再抓到 waizhuan 漏掉的 U1，按 org.md 门槛升级为阻断岗（双 VERDICT 并行裁决从本轮生效）

### r4 · M2 第 1 片：项目 + 看板数据层与最小 UI
- 目标：项目（project）落库 + 看板（board：列/卡片）数据层 + 最小看板 UI——M2 起步轮
- 交付清单：
  1. schema v3→v4：projects 表（id/name/description/created_at）、board_columns（id/project_id/name/position）、cards（id/project_id/column_id/title/description/position/todo_id 可空关联待办）
  2. api：projects CRUD、columns CRUD + 排序、cards CRUD + 跨列移动（position 重排规则集中 shared）
  3. web：项目页（列表 + 建项目）→ 看板视图（列 + 卡片 + 跨列拖拽/按钮移动）+ 卡片关联待办徽标
  4. 断言：e2e ≥+20（迁移/排序规则/移动闭环）、audit ≥+20（含 4xx：越权外键/非法 position/空名）
  5. 截图 ≥6：项目空态/项目列表/建项目弹窗/看板有卡/移动后/窄屏
- 验收标准：
  1. 全量绿：e2e ≥187、audit ≥158，README 同步
  2. 卡片移动后两侧列 position 重排有断言锁定；position 规则集中 shared
  3. todo_id 关联复用 r3 联动模式（徽标）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r3 已发版（v0.0.7）✅

### r5 · M2 第 2 片：看板统计与 Excel 导出（M2 收官）
- 目标：看板统计（列分布/完成率）+ 台账导出（CSV UTF-8 BOM）——M2 收官轮
- 交付清单：
  1. api 统计端点：GET /api/projects/:id/stats（各列卡片数/完成率/待办关联数——口径集中 shared 纯函数 computeBoardStats）
  2. 导出端点：GET /api/projects/:id/export.csv（UTF-8 BOM，Excel 直开：列/卡片/关联待办全量台账）
  3. web：看板页统计卡（各列计数 + 完成率条）+ 导出按钮（下载 CSV）
  4. 断言：e2e ≥+15（统计口径/空项目/含待办关联）、audit ≥+15（统计 4xx、导出 BOM 头/列数/转义）
  5. 截图 ≥5：统计卡有数据/空项目统计/导出按钮态/CSV 落盘内容佐证/窄屏
- 验收标准：
  1. 全量绿：e2e ≥232、audit ≥248，README 同步
  2. CSV 用 Excel 实开验证 BOM 与列对齐（waizhuan 会真开）
  3. 统计口径与卡片移动联动（移动后统计即时变化有断言）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r4 已发版（v0.0.8）✅

### r6 · M3 第 1 片：多维表格字段引擎与网格视图（M3 起步）
- 目标：多维表格（bases/tables）落库 + 字段类型引擎 + 网格视图——M3 起步轮，字段引擎是 M3 技术重心
- 交付清单：
  1. schema v4→v5：tables（id/name/description）、fields（id/table_id/name/type/position/options JSON）、records（id/table_id/data JSON/position）
  2. 字段类型引擎（全部集中 shared，禁散落 if-else）：type = text / number / date / select / multi-select / checkbox / url
     - validateFieldValue(type, value) —— 类型校验（number 数值型、date ISO 日期、select 必须在 options 内、multi-select 子集、checkbox 布尔）
     - coerceFieldValue —— 写入前归一（number 字符串→数字、日期补齐）
     - compareValues(type, a, b) —— 排序比较器（null 恒最后、数值按值、日期按时间、select 按 options 顺序）
  3. api：tables/fields/records CRUD + 查询（按字段筛选 + 按字段排序 + 分页）
  4. web：多维表格页——网格视图（表头=字段列、行=记录、单元格按类型渲染与编辑、字段管理面板增删改字段）
  5. 断言：e2e ≥+40（每种字段类型 ≥6：校验/归一/比较器）、audit ≥+25（含 4xx：非法类型/未知字段/筛选值类型不符）
  6. 截图 ≥6：空表态/多类型网格/字段管理面板/筛选排序后/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥328、audit ≥338，README 同步
  2. 字段类型引擎三个函数全在 shared 且各有断言；api 层不出现类型分支
  3. 网格的筛选/排序结果与手算一致（waizhuan 会真手算）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r5 已发版 ✅
- 特别项：r5 遗留 U2-1（列级「完成率」与列名「已完成」语义冲突）本轮一并修

### r7 · M3 第 2 片：视图持久化与 CSV 导入（M3 收官）
- 目标：多维表格视图（筛选/排序/字段可见性可保存、可切换）+ CSV 批量导入——M3 收官轮
- 交付清单：
  1. schema v5→v6：views 表（id/table_id/name/filter_spec JSON/sort_spec JSON/visible_fields JSON/position）
  2. api：views CRUD + 按视图查询记录（复用 shared `queryRecords`，视图 spec 只是筛选/排序/投影参数）+ CSV 导入端点（multipart 或 JSON 行数组；逐行走 `normalizeRecordData`，错误行带行号与原因返回，成功行原子落库或全事务回滚——口径集中 shared）
  3. web：「表格」tab 加视图切换栏 + 视图编辑面板（勾选筛选/排序/隐藏列）+ CSV 导入对话框（预览前 5 行 + 错误行清单 + 确认导入）
  4. 断言：e2e ≥+35（视图 spec 校验/持久化/按视图查询口径/导入逐行错误聚合）、audit ≥+25（views 4xx、导入 4xx：非法 CSV/类型不符/部分失败不半态）
  5. 截图 ≥6：视图切换栏多视图/视图编辑面板/隐藏列后网格/导入预览/导入错误行提示/导入成功后
- 验收标准：
  1. 全量绿：e2e ≥484、audit ≥428，README 双节同步
  2. 视图持久化重启不丢；按视图查询结果与手算一致（waizhuan 会真手算）
  3. 导入部分失败时零半态（要么全成功要么全不落库，有断言锁定）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r6 已发版（待双 VERDICT）
- 特别项：r6 遗留 ① 多字段 AND 筛选未做（本轮视图 spec 一并支持）② r6 UI 记账 U2-1 编辑态列宽跳变、U2-2 筛选提交无反馈 —— 本轮顺手修

### r8 · M4 第 1 片：文档块编辑器（单人版）
- 目标：块级文档编辑器落地——文档/块落库 + 块操作（拆/合/移动/类型切换）+ 打印 PDF 链路——M4 起步轮（多人实时协同 CRDT 推迟到 M9）
- 交付清单：
  1. schema v6→v7：documents 表（id/title/created_at/updated_at）、blocks 表（id/document_id/type/position/content JSON/parent_id 可空）
  2. 块类型引擎集中 shared：paragraph / heading1-3 / bullet / numbered / todo / quote / code / divider；`normalizeBlockContent(type, content)` 与 `canConvertBlockType(from, to)` 校验
  3. api：documents CRUD、blocks CRUD（批移动重排复用 shared 排序思路）、文档全文读（按 position 拼装）
  4. web：「文档」tab——文档列表 + 编辑器（块级渲染 + 回车拆块 / 退格合块 / 上移下移 / 类型切换下拉）+ 打印预览按钮（HTML/CSS 走 printToPDF 同款思路：`window.print()` + 打印样式表）
  5. 断言：e2e ≥+35（块归一/类型转换/拆合移动/文档装配）、audit ≥+25（含 4xx：非法块类型/越权 document_id/非法 position）
  6. 截图 ≥6：文档空态/文档列表/编辑器多类型块/块类型切换/打印预览/窄屏
- 验收标准：
  1. 全量绿：e2e ≥622、audit ≥547，README 双节同步
  2. 块顺序在拆/合/移动后持久化且重开不丢（有断言）
  3. 打印预览有独立截图证据；块类型引擎全集中 shared，api 层零类型分支
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r7 已发版（v0.0.11）✅
- 特别项：r7 UI 记账 U2（错误行号口径/确认按钮后果提示/当前视图指示错位）择低成本项顺手修，其余留 M4 视图轮

### r9 · M4 第 2 片：文档导入导出与 AI 块级修订（M4 收官）
- 目标：Markdown 导入导出 + AI 块级修订（**mock 模型，零 token 成本**）——M4 收官轮，为 M5 AI 工作台铺工具调用框架
- 交付清单：
  1. 转换引擎集中 shared：`markdownToBlocks(md)` / `blocksToMarkdown(blocks)`（10 种块类型双向，未知语法降级为 paragraph 不丢内容）
  2. api：`POST /api/documents/:id/import.md`（Markdown 文本→块批量落库，单事务零半态——复用 r7 思路）、`GET /api/documents/:id/export.md`、**`POST /api/documents/:id/blocks/:blockId/revise`**（AI 修订：入参 instruction + 块内容，走 mock provider 返回修订建议；采纳才替换块内容——**接口 provider 无关，为 M5 接真实模型留位**）
  3. web：文档编辑器加「导入 Markdown」按钮（预览+确认）、「导出 .md」按钮、块级「AI 修订」面板（建议 diff 对照 + 采纳/放弃）
  4. mock 模型：packages/agent/mock-provider.ts（固定脚本化回复，零 token）；**评测集** packages/agent/evals/ 录制回放样式先立骨架（宪法四条：M5 起锁工具调用行为）
  5. 断言：e2e ≥+40（Markdown 双向往返/未知语法降级/导入零半态/修订采纳与放弃语义）、audit ≥+30（含 4xx：非法 Markdown/块不存在/空 instruction）
  6. 截图 ≥7：导入预览/导入成功后/导出落盘佐证/AI 修订建议 diff/采纳后/放弃后/窄屏
- 验收标准：
  1. 全量绿：e2e ≥756、audit ≥669，README 双节同步
  2. Markdown 往返：blocks → md → blocks 内容不丢（有断言）
  3. AI 修订「未采纳不改库」有断言锁定；mock provider 可切换为真实模型的接口留位
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r8 已发版（待双 VERDICT 终审）
- 特别项：r8 UI 记账 U2（06 窄屏长文本 1px 裁切渣、编辑态列表块缺 marker、纸面有序列表都显示「1.」）本轮必修前两条

### r10 · M5 第 1 片：AI 工作台对话与工具调用框架（M5 起步）
- 目标：AI 工作台（对话 + 工具调用）落地——对话持久化 + 工具注册表 + mock 模型规划执行 + 产物预览框架——M5 起步轮（真实模型留接口，开发全用 mock 零 token）
- 交付清单：
  1. schema v7→v8：conversations 表（id/title/created_at）、messages 表（id/conversation_id/role/content_json/tool_calls_json/created_at）、artifacts 表（id/conversation_id/type/title/content/created_at）
  2. 工具注册表集中 packages/agent/：ToolRegistry（name/description/parameters schema/handler），首批工具 ≥8：list_todos / create_todo / list_documents / create_document / list_projects / list_cards / list_tables / search_knowledge（M6 前返回空结果占位）
  3. agent 规划器：mock-planner.ts（脚本化：识别意图→输出工具调用序列→执行→汇总），**记录回放评测集** packages/agent/evals/ 扩充 ≥15 用例（宪法四条：工具调用行为录制回放锁定）
  4. api：conversations CRUD、POST /api/conversations/:id/chat（mock 规划执行，逐条 tool_call 落库）、artifacts 读取
  5. web：「AI 工作台」tab——会话列表 + 中间对话流（用户/AI/tool-call 气泡）+ 右侧产物预览面板
  6. 断言：e2e ≥+40（工具注册/规划执行/消息落库/产物）、audit ≥+30（含 4xx：未知工具/非法参数/空消息）
  7. 截图 ≥7：工作台空态/会话列表/对话流/工具调用气泡/产物预览/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥849、audit ≥736，README 双节同步
  2. 一次对话能真实触发 ≥2 个工具调用且结果落库（ waizhuan 会查库验证），工具调用行为由回放评测集锁定
  3. 工具注册表 handler 全为真实服务层调用（非 mock 数据），状态变更类工具（create_todo 等）有「实际创建」断言
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r9 已发版（v0.0.13）✅
- 特别项：r9 UI 记账 U2（diff 无行内高亮）记入 r11

### r11 · M5 第 2 片：多轮上下文与产物生成（M5 收官）
- 目标：多轮对话上下文 + 产物生成落地——历史消息注入规划 + 文件分析/HTML/表格产物 + 工具链扩展——M5 收官轮
- 交付清单：
  1. 多轮上下文：mock-planner 读取会话最近 N 条消息作为上下文（N 可配，默认 8），跨轮指代消解（"再建一个"/"把它改成..."）——回放评测集扩充 ≥10 用例
  2. 产物生成器集中 packages/agent/：artifact-generators.ts（HTML 报告 / Markdown 表格 / JSON 数据三类），产物落 artifacts 表并在 UI 右侧预览
  3. 工具链扩到 ≥12：在 r10 的 8 工具基础上加 summarize_document / export_document_md / list_schedules / create_schedule（全接真实服务层）
  4. api：chat 请求带 context_window 参数；产物 GET /api/artifacts/:id/content（按 type 返回可预览内容）
  5. web：对话流支持多轮连续（发送后保留上下文提示）、产物预览支持 HTML/Markdown/JSON 三类型切换
  6. 断言：e2e ≥+35（多轮上下文/产物生成/工具扩展）、audit ≥+25（含 4xx：上下文超限/产物不存在/非法类型）
  7. 截图 ≥7：多轮对话/产物 HTML 预览/产物表格预览/工具链第 2 页/窄屏/错误态/上下文提示
- 验收标准：
  1. 全量绿：e2e ≥959、audit ≥811，README 双节同步
  2. 多轮上下文有回放断言锁定（第 2 轮能引用第 1 轮产物/实体）
  3. 三类产物真实生成且可预览（waizhuan 会真打开 HTML 看内容，非占位）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r10 已发版（v0.0.14）✅
- 特别项：r9 UI 记账 U2（diff 无行内增删改高亮）本轮必修；r10 U2（会话流/产物面板错一轮、窄容器壳 8 药丸折行）本轮必修

### r12 · M6 第 1 片：知识库入库与检索（M6 起步）
- 目标：知识库文档入库 + 检索（本地关键词/TF-IDF 检索，向量化留 v2 接口）——M6 起步轮，为 M6 收官 RAG 铺路
- 交付清单：
  1. schema v8→v9：knowledge_docs 表（id/title/source_type/source_id/content/chunk_count/created_at）、knowledge_chunks 表（id/doc_id/position/content/token_count）
  2. 分块与检索引擎集中 packages/agent/：chunkText(text)（按段落/字数切分，重叠窗口）、searchChunks(query, chunks)（TF-IDF 余弦相似度，纯 TS 零依赖）——**检索实现全集中，api 层零算法分支**；embedding 接口留位（vector 列可空）
  3. api：知识库 CRUD、POST /api/knowledge/ingest（从 documents 或纯文本入库，自动分块）、GET /api/knowledge/search?q=&limit=（返回带来源引用的命中）
  4. 工具链扩：search_knowledge 从 r10 空占位改为**真检索**（返回带 doc_id/chunk_id 来源的引用）
  5. web：「知识库」tab——文档列表 + 入库按钮（选源）+ 搜索框（结果带来源高亮）
  6. 断言：e2e ≥+35（分块边界/重叠/TF-IDF 排序/空查询）、audit ≥+25（含 4xx：空内容/超长内容/非法 source_type）
  7. 截图 ≥7：知识库空态/入库对话框/入库成功后/搜索结果/来源引用高亮/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥1055、audit ≥892，README 双节同步
  2. 检索结果相关性与手算一致（waizhuan 会造 3 篇文档验证 TF-IDF 排序），来源引用可溯源到具体 chunk
  3. 分块有重叠窗口且边界不丢字（有断言）；search_knowledge 工具真检索非空
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r11 已发版（待 CI）✅
- 特别项：r10 UI 记账「窄容器壳折行」在 r11 已修，本轮保持

### r13 · M6 第 2 片：RAG 对话与引用溯源（M6 收官）
- 目标：检索增强对话——AI 回答时先检索知识库再把引用注入上下文，回答附来源溯源——M6 收官轮
- 交付清单：
  1. RAG 编排集中 packages/agent/rag.ts：retrieve(query, limit) → buildAugmentedPrompt(question, chunks) → 产物带 citations: [{docId, chunkId, snippet, score}]
  2. mock-planner 扩：识别「根据知识库/查资料/文档里」类意图 → 先调 search_knowledge → 再生成回答 → 附引用列表（回放评测集 ≥10 用例）
  3. api：chat 响应带 citations 字段；GET /api/knowledge/docs/:id 溯源回看
  4. web：对话流中 AI 气泡下方显示来源引用卡（可点跳转到知识库对应文档），产物预览含引用清单
  5. 断言：e2e ≥+35（RAG 编排/引用注入/引用溯源）、audit ≥+25（含 4xx：无命中检索/引用 id 不存在）
  6. 截图 ≥7：RAG 对话流/来源引用卡/引用跳转/产物引用清单/无命中态/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥1122、audit ≥948，README 双节同步
  2. 回答带真实引用（docId/chunkId 可溯源），waizhuan 会点引用卡验证跳转
  3. 无命中时如实说「知识库没有相关内容」不编造（有断言）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r12 已发版 ✅

### r14 · M7 第 1 片：思维导图（Markdown 双视图）—— 已发版 v0.0.18
- 交付：schema v10 mindmaps 表；shared 集中 parseMarkdownToTree / treeToMarkdown / 折叠态纯函数（md→tree→md 逐字节往返、未知语法降级不丢）；api 七路由；web 第十 tab「导图」双栏实时同步 + 折叠
- 断言：e2e 1161→1221 / audit 966→1020，typecheck 5 包；变异红相 1 组独立复现；双 VERDICT 通过

### r15 · M7 第 2 片：白板画布与 AI 建板（M7 收官）
- 目标：无限画布白板（卡片/便签/连线）+ Markdown 导出 + AI 建板（mock）——M7 收官轮
- 交付清单：
  1. schema v10→v11：whiteboards 表（id/title/created_at）、whiteboard_items 表（id/board_id/type:note|text|shape|x/y/w/h/content/color）
  2. 布局规则集中 packages/shared：normalizeWhiteboardItem(type, props)、collisionResolve(items)（重叠时自动避让或报错，规则唯一）
  3. api：whiteboards CRUD、items CRUD + 批量移动（x/y 变更审计）、POST /api/whiteboards/:id/ai-create（mock 建板：根据主题生成 5-8 个便签布局，零 token）
  4. web：新增「白板」tab——无限画布（拖拽平移/缩放）、便签创建/编辑/删除、AI 建板按钮、导出 Markdown
  5. 断言：e2e ≥+35（布局规则/批量移动/AI 建板/导出）、audit ≥+25（含 4xx：越权 board_id/非法 item 类型/越界坐标）
  6. 截图 ≥7：白板空态/画布有便签/拖拽后/AI 建板结果/导出佐证/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥1256、audit ≥1045，README 双节同步
  2. 画布平移/缩放后坐标换算正确（waizhuan 会真拖验证）；AI 建板真生成 ≥5 便签且布局不重叠
  3. **新增「白板」tab 补该 tab 激活态图**（十一 tab 壳基线）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r14 已发版（v0.0.18）✅

## 历史轮次（r1~r2 已收档，见下方记账区）

---

## 记账区（每轮追加）

### 2026-11-15 · r1 立项
- 仓库落地：monorepo 四包 / 迁移框架 v1→v2 / 状态机集中 / 健康探针 / 截图矩阵 5 张 / CI 定义
- 断言规模 0 → 42；typecheck 4 包全绿
- 关键坑（记录在 yanfa 报告）：pnpm 11 allowBuilds / CJS-ESM 导入 / PS 5.1 编码 / Windows DPR 截图
- 决策记录：窄屏测试用 ?narrow=1 显式钉态，不赌视口宽度；HTTP 冒烟优雅降级不失败

### 2026-11-15 · r1 复验与收尾
- waizhuan 实跑复验：test:all 两轮 exit 0（离线 41 / 在线 42 全绿）、health 探针真读库、双端口收净、截图逐张目验——**VERDICT: 通过**（报告 docs/feedback/2026-11-15-r1-verify.md）
- 复验问题处置：P1 shot.ps1 api 分离启动补 `< NUL` stdin 重定向，实测 15s 存活 ✅；P3 CI 分支 main→master ✅；P4 两条自洽占位断言 → 已列入 r2 改进项；P5 plan.md 随本提交纳入
- 发版：v0.0.1（本地 commit + tag）。**P2 挂账**：无 git remote，push 与 Release 资产核对待 owner 配置远端后补做（宪法第二条第 4 步届时执行）

### 2026-11-15 · P2 清账 + 远端事故记录（lead）
- 配置 remote `origin = github.com/sun13-AI/xieflow`（私有仓库，API 创建；凭据走 Windows 凭据管理器中 gh CLI 的 token，经 `scripts/credential-github.ps1` 喂给 git，token 不落盘）
- **事故**：github.com 直连间歇阻断期间改用 Git Data API 推送，一次失误（tree 缺 base_tree）导致远端两个提交丢失全部内容文件 → CI 以 lockfile not found 报错暴露 → 网络恢复后 `git push --force` 用完整本地历史覆盖
- **教训入库**：API 推送只用于只读操作；写操作必须走 git；网络问题给 git 配 `-c http.proxy=http://127.0.0.1:7897`（系统代理）
- **CI 实跑暴露并修复**：release job 缺 pnpm（127）→ 补 `pnpm/action-setup`；宪法「不挪旧 tag」执行：v0.0.1 的 release 已坏不动，**v0.0.2 补发**
- 终态：master CI ✅ / **v0.0.2 tag CI ✅ + Release 资产核对 ✅（xieflow-v0.0.2.tar.gz 已上架）**；本地 git 永久配置代理
- 环境备忘：系统代理 127.0.0.1:7897；github.com 直连不稳定时 git 必须显式走代理

### 2026-11-15 · 编制扩充（IKanBot 基准模式 + 履历建档）
- 确立**基准流程 = IKanBot 双 agent 模式**（研发 → 使用者实跑复验 → VERDICT → 打回返工 → 每轮发小版本），先跑通再谈扩展
- 四岗位设立（编制表 workflows/org.md）：项目总监（lead）/ 研发视角 / 使用者视角 / **UI 审查官（扩展岗，r2 起并行观察、不阻断）**
- 员工档案与工作履历建档 docs/staff/（四份，r1 历史追溯补记）；履历跟岗位走、不跟会话走
- 岗位提示词入库 workflows/：director / yanfa / waizhuan / ui-reviewer / lead-inspect
- 扩展岗升级门槛（先试不急着要）：连续 2 轮抓到使用者视角漏掉的 U1 + 无误报 + 每轮 <10 分钟 → r3 起进双 VERDICT 裁决
- 回应 owner 关切「测试不足」：r2 起断言面扩到 HTTP 路由层（scripts/audit-http.ts，含 4xx 分支），且禁止自洽占位断言（r1 P4 教训）
