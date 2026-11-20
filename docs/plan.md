# 协流 XieFlow · 路线图与轮次记账

> 宪法见设计包 AGENTS.md；轮次规则见 RUNBOOK.md（均在 D:\work\好东西\xieflow-design\）。

### 2026-11-20 · r28 研发（yanfa-r28 · M10 后功能补强：会议管理与会议室 / 预约冲突检测）
- 交付：schema v19→v20（rooms / meetings / meeting_attendees 三表 + 索引/外键/UNIQUE）；`packages/shared/meetings.ts` 三函数（detectTimeConflict 同室重叠且边界相接不冲突 / validateMeetingWindow 结束晚于开始且最长 8h / normalizeAttendees 去重+停用校验）+ 预约编排与可用性装配，api/web 零算法分支；无新依赖、零 token、不接视频会议或外部日历
- api：会议室 CRUD + `GET /api/rooms/:id/availability?date=`；会议 CRUD / 预约（真冲突 409 + 冲突会议 id）/ 按日期与会议室查询 / 改期自我排除；参会人 GET/PUT/POST/DELETE 与 4xx 零半态
- web：新增第十八 tab「会议」——左会议室列表（含停用态）/ 中时段网格（边界相接两场并排）/ 右预约表单（通讯录参会人，停用禁选）+ 冲突红条；十八 tab 壳基线同批重拍，`?date=&roomId=` reload 不丢
- 断言：e2e 2335→**2448（+113）** · audit 1904→**1992（+88）**，无一条删改；typecheck 5 包；`pnpm run test:all` exit 0；CI smoke 正则升 v20；README 速查行/双节/r28 矩阵索引/壳 R28 哈希块逐字同步
- **变异红相 1 组**：`meetingWindowsOverlap` 严格重叠 `as < be && bs < ae` → `as <= be && bs <= ae`（边界相接误判冲突）→ e2e 4 红 + 数据层抛错中断 / audit 10 红；逐字节还原（SHA `2BA5D403…E01379A562`）双套件全绿
- 「用户第一次用」全链路（headless CDP 真点，0 数据起步）：建会议室 → 09–10 预约 → 09:30–10:30 被 409 拒绝且红条回带 #1 → 改 10–11 边界相接成功 → 通讯录选参会人预约 11–12 → reload 三场全在 → DELETE 探针归零、端口收净
- 截图：`docs/ui/r28/` 7 张 + 十八 tab 壳基线同批重拍；7/7、18/18 SHA256 互异，矩阵↔壳重叠 0，全库 283 PNG / 281 互异（同态组仅 r4 已披露 2 组），逐张 `read_image` 目验；首轮白屏废片已全批重拍未入库
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI release 配置；只走 user_version 迁移、未手改库文件；只用 scratch 库与真 HTTP 探针并清理；全程 headless、服务收净、PowerShell 新段全 ASCII、零 token
- 报告：`docs/feedback/2026-11-20-r28-yanfa.md`（三态纪律 + 自曝节 + 变异红相 + 全链路证据）

### 2026-11-20 · r28 返工#1（yanfa-r28fix · waizhuan P2-1 发版阻断 + P5 笔误 + UI U2×2）
- A：建室成功后自动选中新室（读 POST /api/rooms 响应 id，`chooseRoom(createdId)` 同步 roomId/form/URL）；`load()` 用 shared `resolveSelectedRoomId` 把深链/旧默认 id 纠偏到真实启用室（无启用室返回 0，不 POST）；下拉框 `value={form.roomId}` 与提交口径严格同源；无 `roomId` 深链 reload 自动回显
- 断言：e2e 2448 → **2460（+12，离线口径；在线 +1 = 2461）** · audit 1992 → **2004（+12）**，无一条删改；**变异红相 2 组**：shared 选中口径改回 `return 1` → e2e 4 红；删掉建室自动选中 → e2e 1 红；逐字节还原（SHA 同值、探针零残留）后全绿
- B/C：README:489 `2444`→`2461` 与 CI 正则 `19`→`20`；shell README:55 meetings 形态改真实空库态；r28/05 与根 README/05 补「id↔会议标题/时段」映射说明
- 截图：渲染层改动 → `docs/ui/r28/` 7 张 + 十八 tab 壳基线同批重拍，7/7、18/18 SHA256 互异、矩阵↔壳重叠 0、全库 283 PNG / 281 互异；索引 / shell README R28 哈希块 / 根 README 同一提交；逐张 `read_image` 目验（02/04/05/meetings/board）
- 危险区：未 push / 未打 tag / 未发版；headless 全程、服务收净、只动 scratch 库与探针、未动用户数据、零 token
- 报告：`docs/feedback/2026-11-20-r28-yanfa.md` 末尾「返工 #1」节

### 2026-11-20 · r27 研发（yanfa-r27 · M10 后功能补强：报表中心 / 跨模块数据看板）
- 交付：`packages/shared/reports.ts` 六指标纯函数（computeTodoCompletion / computeScheduleLoad / computeBoardThroughput / computeApprovalSla / computeAssetTurnover / computeDocOutput + assembleReport / parseReportRange / reportWindow / selectReportMetric），api/web 零算法分支；无新依赖、无 schema 迁移（只读既有表）
- api：`GET /api/reports/overview?from=&to=` 六指标一次返回 + `GET /api/reports/:metric?from=&to=[&id=]` 单项下钻（未知名 metric 400 / 越权 id 404 / 非法范围 400）
- web：新增第十七 tab「报表」（六张 KPI 卡：数值 + 环比 + CSS 迷你条；明细表点卡切换；近 7/30/90 天 + 自定义范围；`?metric=&from=&to=` 深链 reload 不丢），十七 tab 壳基线同批重拍
- 断言：e2e 2237→**2335（+98）** · audit 1809→**1904（+95）**，无一条删改；typecheck 5 包；`pnpm run test:all` exit 0；CI smoke 正则保持 `(2|…|19)`；README 速查行/双节/r27 矩阵索引/壳 R27 哈希块逐字同步
- **变异红相 1 组**：`computeTodoCompletion` 完成率分子 `done`→`done+1` 改坏 → e2e 6 红 / audit 2 红；逐字节还原（SHA `9B4A4659…D4455`）双套件全绿
- 「用户第一次用」全链路：造数据 → 看报表 → 切时间范围 → 点 KPI 下钻 → reload 保持（详见 r27 yanfa 报告）
- 截图：`docs/ui/r27/` 7 张 + 十七 tab 壳基线同批重拍；7/7、17/17 SHA256 互异，矩阵↔壳重叠 0，全库 275 PNG / 273 互异（同态组仅 r4 已披露 2 组），逐张 `read_image` 目验
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI release 配置；仓库 `data/xieflow.db` 只读（截图/审计走 scratch 库）；全程 headless、服务收净、PowerShell 新段全 ASCII、零 token
- 报告：`docs/feedback/2026-11-20-r27-yanfa.md`（三态纪律 + 自曝节 + 变异红相 + 全链路证据）

### 2026-11-20 · r26 研发（yanfa-r26 · M10 后功能补强：通知中心 / 站内消息聚合）
- 交付：schema v18→v19（notifications 八列 + 四索引）；`packages/shared/notifications.ts` 五件套（buildNotification / shouldNotify / notificationSummary / queryNotifications / notificationTargetTab + collectNotificationCandidates），api/web 零算法分支
- api：notifications CRUD + 未读过滤/分页 + `POST /:id/read` + `/read-all` + `/refresh`（幂等）+ `/summary`；同步 409 事件旁路落一条 `sync_conflict` 通知，不破坏 r19 零半态
- web：新增第十六 tab「通知」（六类筛选 + 未读加粗/时间/图标列表 + 点条跳模块 + 顶栏未读徽标），十六 tab 壳基线同批重拍
- 断言：e2e 2096→**2221（+125）** · audit 1723→**1791（+68）**，无一条删改；typecheck 5 包；`pnpm run test:all` exit 0；CI smoke 正则升 v19；README 速查行/双节/r26 矩阵索引/壳 R26 哈希块逐字同步
- **变异红相 1 组**：db `upsertNotification` 判重改坏 → e2e 4 红 / audit 5 红；逐字节还原（SHA `5823EA8B…AA14`）双套件全绿
- 「用户第一次用」全链路（headless CDP 真点，0 通知起步）：造审批 pending + 库存低 + 当天日程 + 真 409 冲突 → refresh 4 条 → 真点审批通知跳审批 tab 且徽标 4→3 → 返回通知页已读不 bold → reload summary unread=3/total=4 不丢 → 探针清理、端口收净
- 截图：`docs/ui/r26/` 7 张 + 十六 tab 壳基线同批重拍；7/7、16/16 SHA256 互异，全库 265 PNG / 263 互异（同态组仅 r4 已披露 2 组），8 张逐张 `read_image` 目验
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI release 配置；只走 user_version 迁移、未手改库文件；只删本轮探针与 scratch 库，`data/xieflow.db` 只读；全程 headless、服务收净、PowerShell 新段全 ASCII、零 token、不接外部 IM/邮件
- 报告：`docs/feedback/2026-11-20-r26-yanfa.md`（三态纪律 + 自曝节 + 变异红相 + 全链路证据）

### 2026-11-19 · r24 研发（yanfa-r24 · M10 后功能补强：成员接入审批/物资，向后兼容）
- 交付：schema v16→v17（approvals.applicant_member_id / approval_steps.assignee_member_id / approval_cc.cc_member_id / assets.custodian_member_id 四列全可空、FK ON DELETE SET NULL；原 TEXT NOT NULL 列逐列不动）；`packages/shared/src/org.ts` 新增 resolveAssignee / assertAssignableMember / memberSummary / memberDisplayName / countMemberUsage，api/web 零算法分支
- api：审批发起/提交/转交/抄送、物资建账/编辑/出入库均接受可选 member_id（不存在/停用/非法 id → 400），响应回带 {name,department} 摘要；GET /api/org/members/:id/usage 四类计数；老请求不传 member_id 的字段值与摘要 NULL 逐字不变
- web：新增共享 MemberPicker（通讯录搜索弹窗），审批申请人/审批人/转交目标与物资保管员/出入库操作人可选人；原自由文本输入框全部保留；审批时间线与物资卡片/详情渲染部门徽标
- 断言：e2e 1952→**2041（+89）** · audit 1582→**1667（+85）**，无一条删改；typecheck 5 包；`pnpm run test:all` exit 0；CI smoke 正则升 v17；README 速查行/双节/r24 矩阵索引/壳基线说明逐字同步
- **变异红相 1 组**：shared/org `resolveAssignee` 有 member_id 时改回落自由文本 → e2e 8 红后中断 / audit 20 红；逐字节还原（SHA `2A304216…CA7EC`）双套件全绿
- 「用户第一次用」全链路（headless CDP 真点，0 数据起步）：建部门与两名成员 → 审批选申请人/审批人发起 → 提交 → 切身份选人转交 → 物资选保管员建账 → 出入库选操作人 → usage 回查 → reload 数据全在 → DELETE 探针归零、端口收净
- 截图：`docs/ui/r24/` 7 张 + 十五 tab 壳基线同批重拍；7/7、15/15 SHA256 互异，全库 250 PNG / 248 互异（同态组仅 r4 已披露 2 组），逐张 `read_image` 目验；首轮误用远端模式库导致七张同为登录页，已用 scratch 库全矩阵重拍、废片未入库
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI release 配置；只走 user_version 迁移，未手改库文件；只删本轮探针数据与 scratch 库，仓库 `data/xieflow.db` 只读；全程 headless、服务收净、PowerShell 新段全 ASCII、零 token
- 报告：`docs/feedback/2026-11-19-r24-yanfa.md`（三态纪律 + 自曝节 + 变异红相 + 向后兼容证据）

### 2026-11-19 · r23 研发（yanfa-r23 · M10 后功能补强：组织架构与通讯录）
- 交付：schema v15→v16（departments 五列 + members 九列，外键/CHECK/UNIQUE 真约束）；`packages/shared/src/org.ts` 唯一口径（buildDepartmentTree 层级/环/孤儿、validateDepartmentMove 防自挂防成环、normalizeMember 邮箱与字段归一、searchMembers 三字段大小写不敏感、buildOrgTree 部门带人员），api/web 零算法分支
- api：departments CRUD + move、members CRUD + 按部门查询 + 模糊搜索、GET /api/org/tree；web 新第十五 tab「组织」——左部门树展开折叠 + 右人员卡片 + 新建/编辑表单 + 搜索框；**不接审批/物资**（任务单明确边界，留 r24）
- 断言：e2e 1856→**1952（+96）** · audit 1514→**1582（+68）**，无一条删减；typecheck 5 包；`pnpm run test:all` exit 0；CI smoke 正则升 v16；README 速查行/双节/r23 矩阵索引/壳基线说明逐字同步
- **变异红相 1 组**：shared/org `searchMembers` 改大小写敏感 → e2e 4 红 / audit 5 红；逐字节还原（SHA `7500FB40…72CE76`）全绿
- 「用户第一次用」全链路（headless CDP 真点，0 数据起步）：三级部门 → 建人员 → `ENGINEER` 搜索 → 移动部门 → reload 全在 → HTTP 回查 parentId/departmentId → DELETE 探针归零、端口收净
- 截图：`docs/ui/r23/` 7 张 + 十五 tab 壳基线同批重拍（新增 `org-tab-active.png`）；7/7、15/15 SHA256 互异，全库 243 PNG / 241 互异（同态组仅 r4 已披露 2 组），逐张 `read_image` 目验
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI release 配置；只走 user_version 迁移、未手改库文件；全程 headless、服务收净、PowerShell 新段全 ASCII、零 token
- 报告：`docs/feedback/2026-11-19-r23-yanfa.md`（三态纪律 + 自曝节 + 变异红相记录）

### 2026-11-18 · r15 发版（M7 收官 · 白板画布）
- 双 VERDICT 复验会话在报告落盘前中断（18h gap），会话恢复后重跑复验
- **CI 平台容错修复（lead）**：macos-latest runner 持续被平台 cancel（ubuntu/windows 每轮全绿），阻断 v0.0.15~v0.0.18 四轮 Release——job 级 `continue-on-error: ${{ matrix.os == 'macos-latest' }}`，三平台仍全跑可见，仅平台侧 cancel 不再阻断发版（不是降低测试覆盖）
- 发版：v0.0.18 → **v0.0.19**（CI 容错后首版，待 Release 资产核对）

### 2026-11-18 · r15 研发（yanfa · M7 收官：白板画布与 AI 建板）
- schema v11 两表；shared 五件套（归一/避让/mock 建板/导出/坐标换算）；api 13 路由；web 第十一 tab「白板」无限画布 + 便签 CRUD + AI 建板 + 导出，api/web 零算法分支
- 断言：e2e 1221→1326 / audit 1020→1100；变异红相 1 组独立复现
- 真实缺陷修复：viewport `setPointerCapture` 吞便签按钮 click，加 `.wb-note` 守卫

### 2026-11-17 · r13/r14 发版（M6 收官 + M7 起步）
- r13 RAG 对话与引用溯源 → v0.0.17（lead 修 P4 速查行 1087/923→1161/966）
- r14 思维导图 Markdown 双视图 → v0.0.18（Markdown↔树 37/37 + 变异红相）
- **CI 积压**：v0.0.15~v0.0.18 因 macOS runner 平台侧 cancel 缺 Release 资产——重跑 + 最终容错修复见上方

### 2026-11-18 · CI/Release 积压清账（lead 跨轮处理）
- 根因链：macos-latest 被平台 **cancelled**（不是 failure）→ job 级 continue-on-error 不覆盖 cancelled → 四轮 Release 被跳过；v0.0.19 首轮容错仍失败印证
- 正解：**拆 job**——verify-core（ubuntu+windows）为发版门禁、verify-macos 独立观察（continue-on-error）；v0.0.21 CI 实证 release success + assets=1
- 积压补发：v0.0.15~v0.0.20 六个 tag 用 git archive 逐 tag 构建源码包经 GitHub API 上传（不挪旧 tag、不伪造内容——每个包对应其 tag commit），全部 assets=1
- 终态：v0.0.10~v0.0.21 连续 12 个 Release 资产齐全；宪法第二条收尾核对闭环

### 2026-11-18 · r11 研发（yanfa-r11 · M5 收官：多轮上下文与产物生成）
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
| r15 | M7 第 2 片：白板画布与 AI 建板（M7 收官） | ✅已发版（初验 waizhuan 打回 P1 AI 建板重叠→返工#1 全画布零重叠→复审双通过） | v0.0.19 | e2e 1331 · audit 1111 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r16 | M8 第 1 片：审批流引擎（M8 起步） | ✅已发版（首轮双通过；多角色审批 44/44 + CI 二次容错拆 job） | v0.0.21 | e2e 1464 · audit 1214 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r17 | M8 第 2 片：物资台账与单位任务（M8 收官） | ✅已发版（首轮双通过；物资/任务 44/44 + 变异红相 2 组） | v0.0.22 | e2e 1552 · audit 1302 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r18 | M9 第 1 片：账号与网络版服务（M9 起步） | ✅已发版（初验 waizhuan 打回 P1 remote 401 死路→返工#1 13 页统一 apiFetch→复审双通过） | v0.0.23 | e2e 1638 · audit 1376 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r19 | M9 第 2 片：多端同步与冲突处理（M9 收官） | ✅已发版（初验 waizhuan 打回 P2 status 取最早→返工#1 精确最新→复审双通过） | v0.0.24 | e2e 1721 · audit 1442 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r20 | M10 第 1 片：离线模式与 PWA 移动适配（M10 起步） | ✅已发版（首轮双通过；真断网十步 + 390px 实测 + tar pack 修复） | v0.0.26 | e2e 1803 · audit 1484 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r21 | M10 第 2 片：私有化部署与单机版（M10 收官） | ✅已发版（最终双 VERDICT 通过） | v0.0.27 | e2e 1842 · audit 1503 | 通过（waizhuan）+ UI 通过（阻断岗） |

| r22 | M10 后·遗留清理与质量收敛（shell 索引/移动底栏/部署文档） | ✅已发版（首轮双通过；U1=0/U2=0，5 项挂账全清 + 日期碰撞真修） | v0.0.28 | e2e 1856 · audit 1514 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r23 | M10 后·组织架构与通讯录（部门树 + 人员目录） | ✅已发版（首轮双通过；三级树/环检测/大小写不敏感搜索） | v0.0.29 | e2e 1952 · audit 1582 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r24 | M10 后·组织成员接入审批/物资（向后兼容） | ✅已发版（首轮双通过；向后兼容 64/64 + 变异红相独立复现） | v0.0.30 | e2e 2041 · audit 1667 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r25 | M10 后·第三轮遗留清理（shell 哈希块/审批 actorMemberId/文档口径） | ✅已发版（首轮双通过；P3 actorMemberId 真修 35/35） | v0.0.31 | e2e 2096 · audit 1723 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r26 | M10 后·通知中心（站内消息聚合） | ✅已发版（初验 waizhuan 打回 P2 通知不定位→返工#1 deep-link refId→UI 打回零图证→返工#2 补 09 图→双终审通过） | v0.0.32 | e2e 2237 · audit 1809 | 通过（waizhuan）+ UI 终审通过（U1/U2/U3 全零） |
| r27 | M10 后·报表中心（跨模块数据看板） | ✅已发版（首轮双通过；六指标手算全对 + 修 README 笔误） | v0.0.33 | e2e 2335 · audit 1904 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r28 | M10 后·会议管理与会议室（预约/冲突检测） | ✅已发版（初验 waizhuan 打回 P2 建室后预约旧 roomId→返工#1 自动选中/深链回显→双复审通过） | v0.0.34 | e2e 2460 · audit 2004 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r29 | M10 后·文档版本历史与回收站 | ✅已发版（首轮双通过；恢复生成 v4 不覆盖 + 软删回收站 + 永久删除真二次确认） | v0.0.35 | e2e 2542 · audit 2060 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r30 | M10 后·多维表格公式字段（纯本地表达式，零 eval） | ✅已发版（首轮双通过；公式真实性 78/78 + 零 eval + raw computed 恒 null） | v0.0.36 | e2e 2664 · audit 2122 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r31 | M10 后·第九轮轻量清理（字段类型文案回归 + 浮点展示） | ✅已发版（首轮双通过；8 类字段文案 + 84.8 展示格式化，求值语义零改） | v0.0.37 | e2e 2685 · audit 2138 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r32 | M10 后·文档打印导出增强（HTML 打印版 + Word 兼容） | ✅已发版（首轮双通过；Word COM 真开 + XSS 五字符转义 + 零依赖） | v0.0.38 | e2e 2766 · audit 2185 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r33 | M10 后·全局搜索（跨模块统一检索） | ✅已发版（首轮双通过；跨八源只读检索 + 变异红相 + deep-link 直达） | v0.0.39 | e2e 2849 · audit 2262 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r34 | M10 后·任务依赖与阻塞关系（待办前置） | ✅已发版（首轮双通过；依赖守卫 40/40 + 既有状态机零回归） | v0.0.40 | e2e 2961 · audit 2324 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r35 | M10 后·日历 ICS 导出与订阅（标准 iCalendar） | ✅已发版（初验 UI 打回 U1 图证链→返工#1 同一 ICS 往返→双终审通过） | v0.0.41 | e2e 3069 · audit 2396 | 通过（waizhuan）+ UI 终审通过（U1=0） |
| r36 | M10 后·日报与周报自动生成 | ✅已发版（首轮双通过；汇总手算 88/88 + 变异红相独立复现） | v0.0.42 | e2e 3167 · audit 2471 | 通过（waizhuan）+ UI 通过（阻断岗） |
| r37 | M10 后·表格分组视图与汇总行 | 🔨规划中 | — | — | — |

## 🏁 项目总账（2026-11-19 · M10 收官）

**11 个里程碑全部达成**（M0 立项 → M1 待办/日程 → M2 项目/看板 → M3 多维表格 → M4 文档 → M5 AI 工作台 → M6 知识库/RAG → M7 导图/白板 → M8 组织管理 → M9 网络版 → M10 多端/单机版）。

| 维度 | 终值 |
|---|---|
| 轮次 | r1~r21（21 轮，含 r2/r3/r4/r11/r15/r18/r19 返工闭环） |
| 版本 | v0.0.1 → **v0.0.27**（27 次 patch 发版，Release 资产全齐） |
| 断言 | e2e 0 → **1842** · audit-http 0 → **1503** · typecheck 5 包 |
| 截图证据 | 232 张 PNG（230 互异，同态组仅 r4 已披露 2 组），逐轮矩阵 + 索引 + 根 README 三处同步 |
| 员工 | 4 岗（项目总监/研发视角/使用者视角/UI 审查官阻断岗），逐轮履历在 docs/staff/ |
| 返工 | 7 轮打回全部闭环（AI 建板重叠、remote 401 死路、status 取最早等真缺陷均根除） |
| 变异红相 | 每轮关键行为留痕（改坏实现→断言变红→SHA 还原全绿），宪法四条实证 |
| 公开仓库 | https://github.com/sun13-AI/xieflow（MIT，public） |

**方法论沉淀**：仓库即状态 · 双 agent + 双 VERDICT 裁决 · 截图字节级验图 · 断言只涨不缩 + 变异红相 · 总监过程巡查 · 每轮发版 + Release 核对 · 危险区与熔断。制度见 AGENTS.md / RUNBOOK.md / workflows/org.md。

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
- **已发版 v0.0.19**（初验 P1 打回→返工全画布零重叠→复审双通过）

### r16 · M8 第 1 片：审批流引擎（M8 起步）
- 目标：OA 审批流（发起/审批/抄送/转交/撤回）落库 + 最小 UI——M8 起步轮
- 交付清单：
  1. schema v11→v12：approvals 表（id/title/type/applicant_id/status/current_assignee/created_at/updated_at）、approval_steps 表（id/approval_id/order/assignee/action/comment/acted_at）、approval_cc 表（抄送人）
  2. 审批状态机集中 packages/shared：APPROVAL_TRANSITIONS（draft→pending→approved/rejected/withdrawn；转交不改状态只换 assignee）、canTransitionApproval(from, to)、assertValidApprovalAction
  3. api：approvals CRUD、POST /:id/submit、POST /:id/approve|reject|delegate|withdraw、GET 我的待办/我发起的/抄送我的
  4. web：新增「审批」tab——发起审批表单 + 待办审批列表 + 审批详情（步骤时间线 + 操作按钮）+ 抄送提示
  5. 断言：e2e ≥+40（状态机/步骤流转/三种视角查询）、audit ≥+30（含 4xx：非法流转/非当前 assignee 操作/已结单再审批）
  6. 截图 ≥7：审批空态/发起表单/待办列表/详情时间线/审批通过态/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥1371、audit ≥1141，README 双节同步
  2. 状态机全集中 shared，api 零流转分支；非 assignee 操作被拒有断言
  3. **新增「审批」tab 补该 tab 激活态图**（十二 tab 壳基线）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r15 已发版（v0.0.19）✅

### r17 · M8 第 2 片：物资台账与单位任务流转（M8 收官）—— 已发版 v0.0.22
- 交付：schema v13 三表；shared 三件套（applyAssetTransaction 负库拒绝/canTransitionUnitTask 五态/buildTaskTree 层级+环路）；api 15 路由单事务零半态；web 物资/单位任务两 tab（十四 tab 壳）；r16 U2 三项顺手修
- 断言：e2e 1464→1552 / audit 1214→1302；变异红相 2 组；双 VERDICT 通过

### r18 · M9 第 1 片：账号与网络版服务（M9 起步）
- 目标：从本地单机走向网络版——用户/会话认证 + server 远端模式 + 前端模式切换——M9 起步轮（CRDT 协同编辑推迟到 M10 前）
- 交付清单：
  1. schema v13→v14：users 表（id/username/password_hash/created_at）、sessions 表（id/user_id/token/expires_at）
  2. 认证规则集中 packages/shared：hashPassword(password)（scrypt/ pbkdf2 纯 Node 实现，零新依赖）、verifyPassword、validateSession（过期判定）、AUTH_PERMISSIONS（角色→权限映射）
  3. api：POST /api/auth/register|login|logout、GET /api/auth/me、auth middleware（受保护路由 401 清假登录态——r1 教训复用）
  4. server 模式：XIEFLOW_MODE=local|remote，remote 时 api 提供全量业务路由（现有）/local 时前端直连 db（现有）；前端加「本机/远端」切换卡（设置页），401 时跳登录页
  5. 断言：e2e ≥+40（哈希/校验/会话过期/权限）、audit ≥+30（含 4xx：弱密码/重复用户名/无效 token/过期会话/未授权 401）
  6. 截图 ≥7：登录页/注册页/登出后/401 跳登录/设置页模式切换/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥1592、audit ≥1332，README 双节同步
  2. 真实注册→登录→带 token 访问受保护路由→登出→401 全链路有断言；密码不明文落库（验 hash）
  3. **401 清假登录态**有断言（r1 r61 教训）；模式切换后 UI 状态正确
  4. **若新增 tab 补该 tab 激活态图**；双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r17 已发版（v0.0.22）✅
- 危险区注意：认证实现不得引入真实外部 IdP/密钥（危险区）；token 仅本地随机生成，不写任何密钥文件

### r19 · M9 第 2 片：多端同步与冲突处理（M9 收官）
- 目标：网络版多端数据同步——变更日志 + 增量拉取 + 乐观锁冲突检测——M9 收官轮（CRDT 实时协同留 M10 前评估，本轮做「最后写入 wins + 冲突提示」）
- 交付清单：
  1. schema v14→v15：change_log 表（id/entity_type/entity_id/operation/payload/user_id/created_at/version）、entity_versions 表（entity_type/entity_id/version 乐观锁）
  2. 同步规则集中 packages/shared：applyChangeSet(local, remote)（增量合并，冲突标记）、detectConflict(base, local, remote)（三方比较，返回冲突字段列表）、nextVersion(current)
  3. api：GET /api/sync/changes?since=&limit=（增量变更日志）、POST /api/sync/apply（带期望 version 的乐观锁写入，409 冲突）、GET /api/sync/status（各实体版本摘要）
  4. web：设置页加「多端同步」卡（最近同步时间/未同步变更数/冲突列表 + 手动同步按钮）；冲突时弹窗展示本地 vs 远端差异供用户选边
  5. 断言：e2e ≥+35（三方合并/冲突检测/版本递增/幂等应用）、audit ≥+30（含 409 冲突/非法 since/越权 change）
  6. 截图 ≥7：同步卡空闲/有未同步/冲突列表/冲突弹窗/同步成功后/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥1673、audit ≥1406，README 双节同步
  2. 真造「本地改 A + 远端改 B」冲突场景 → 409 + 冲突字段列表准确（waizhuan 会手算）；选择一边后版本递增且再同步无冲突
  3. 增量拉取幂等（同一 since 重复拉结果一致）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r18 已发版（v0.0.23）✅

### r20 · M10 第 1 片：离线模式与 PWA 移动适配（M10 起步）
- 目标：离线可用 + 移动端适配——Service Worker 缓存 + 离线队列 + PWA manifest + 响应式移动布局——M10 起步轮
- 交付清单：
  1. PWA 基础设施：public/manifest.json（name/icons/start_url/display:standalone）、public/sw.js（cache-first 静态资源 + network-first API + 离线 fallback）、index.html link manifest + 注册 SW
  2. 离线队列集中 packages/shared：offlineQueue 的 enqueue/dequeue/replay（localStorage 持久化，replay 按序重发），apiFetch 检测离线时改入队并返回语义化离线响应
  3. 在线/离线状态指示：web 顶栏在线圆点 + 离线时 queue 徽标（待重放条数）+ 「立即同步」按钮（replay 队列）
  4. 移动端适配：≤600px 断点下 tab 栏改底部导航/汉堡菜单、卡片单列、触摸目标 ≥44px、禁止横向溢出
  5. 断言：e2e ≥+35（队列入出重放/离线语义/状态判定）、audit ≥+25（含 4xx：队列非法条目/重放冲突）
  6. 截图 ≥7：manifest 安装提示/SW 注册成功/在线态/离线态+队列徽标/重放成功/移动窄屏 390px/错误态
- 验收标准：
  1. 全量绿：e2e ≥1756、audit ≥1467，README 双节同步
  2. 真断网（CDP offline emulation）后操作入队→恢复在线→replay 成功（waizhuan 会真模拟断网）
  3. 390px 移动视口无横向溢出、触摸目标达标；SW 在 CI/本地不干扰测试（测试环境禁用 SW）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r19 已发版（v0.0.24）✅
- 危险区注意：不引外部 CDN/图标依赖，manifest 图标用本地 SVG/PNG

### r21 · M10 第 2 片：私有化部署与一体化单机版（M10 收官）
- 目标：一键部署 + 完全离线可用的单机版——docker-compose 私有化 + portable 增强 + 部署文档——项目最终里程碑
- 交付清单：
  1. docker/：Dockerfile（多阶段构建：Node 20 构建 web → 精简运行镜像，内置 SQLite 数据卷）、docker-compose.yml（app + 数据卷 + 环境变量 XIEFLOW_MODE=remote）、.dockerignore
  2. portable 增强（scripts/pack.js）：内置 start.cmd（已验 boot）+ 新增 start.sh（Linux/macOS）+ 首次运行引导（README.txt 写清楚「双击 start.cmd → 打开 8080」）+ 数据目录自检
  3. docs/DEPLOY.md：三种部署路径（网络版/cloud 已上线、私有化 docker-compose、单机 portable 目录）+ 备份/恢复/搬迁四步 + 常见问题
  4. 部署自检脚本 scripts/verify-deploy.ps1：起服务 → health 200 → 关键路由 200 → 停服务，全程 headless（认证页 401 属预期）
  5. 断言：e2e ≥+20（部署契约/数据目录/引导文案）、audit ≥+15（health/mode/部署路由）
  6. 截图 ≥6：Docker 部署拓扑图（可用文本流程图 PNG 或 compose up 实拍）/start.cmd 首启/portable 目录结构/README 引导/8080 首页/窄屏
- 验收标准：
  1. 全量绿：e2e ≥1823、audit ≥1499，README 双节同步
  2. **portable 目录实测 boot**：pack 后 start.cmd → 8080 web+api 200（本地实跑过，本轮复验一次确保未回归）
  3. docker-compose 配置语法正确（本机无 docker 时至少 `docker compose config` 等价静态校验或用 compose-spec 解析断言）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r20 已发版（v0.0.26）✅
- M10 收官后：项目达到设计总纲全部 11 个里程碑——更新 README 路线图为全绿、director 履历总账、向 owner 交付最终总结

### r22 · M10 后 遗留清理与质量收敛轮（不新增功能，只清挂账）
- 目标：把 r18~r21 复验报告里反复挂账、不影响功能的 U2 项一次清干净，恢复证据链自洽，让后续任何读者不被旧索引误导
- 交付清单（4 项 U2 + 1 项验证）：
  1. **`docs/ui/shell/README.md` 整段推进到 r22 口径**（r20/r21 连续挂账）：标题/演进/14 行形态说明/哈希自查/全库计数全部更新为当前实际字节（r21 沿用 r20 壳图，若本轮重拍则用新哈希，并在 README 里保留 r19/r20 历史哈希作对照行）
  2. **移动底栏「更多」可发现性**（r20 U2-2 → r21 U3-3）：≤600px 底栏右侧加渐隐遮罩 + 小箭头或「更多」按钮，点开 ☰ 菜单可见剩余 tab；补 390px 底栏「更多」态 + ☰ 展开态两张截图，证明后 6~7 枚 tab 有第二条可见路径
  3. **`docs/DEPLOY.md` 三处文档补强**（r21 U2-3/U2-4）：路径 C 补 Releases zip 下载入口（指向 https://github.com/sun13-AI/xieflow/releases）、路径 B 补宿主 IP 访问提示（同网段设备用 `http://<宿主IP>:8080`）、备份恢复搬迁第 4 步补 docker 卷迁移命令示例
  4. **child 索引一致性**：r18 返工脚本 `shot-r18-rework.ps1` 补进根 README 脚本清单（r18 U3-2 记账）
  5. **变异红相留痕 ≥1 组**：如本轮改了渲染层（第 2 项），对「更多」按钮的显隐条件做变异红相（条件改恒 false → 截图 seam 断言变红 → 还原全绿）；如纯文档轮则对「文档契约断言」做等价变异
- 断言：e2e ≥+8（移动导航「更多」态/文档契约）、audit ≥+5（部署路由契约），只涨不缩
- 截图：本轮改渲染层 → 按宪法第一条**十四 tab 壳基线同批重拍**（解决 r21 U2-1 口径偏差）+ 受影响页面矩阵（390px 底栏/☰ 展开）
- 验收标准：
  1. 全量绿：e2e ≥1850、audit ≥1508，README 双节同步
  2. shell README 哈希与实际文件逐字一致（waizhuan 会亲算 14 张 SHA 核对）
  3. 390px 下「更多」入口 + ☰ 展开可达后 6 枚 tab（ui 会真点核）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r21 已发版（v0.0.27）✅

### r23 · 组织架构与通讯录（M10 后功能补强；对标 duobaoyu 全功能协同办公骨架）
- 目标：补上全功能协同办公缺的基础骨架——部门树 + 人员目录（审批 assignee / 物资 custodian 目前是自由文本，本轮只建目录与选择器，不破坏既有模块）
- 交付清单：
  1. schema v15→v16：departments 表（id/name/parent_id 可空/sort_order/created_at）、members 表（id/name/department_id/role/email/phone/title/status/user_id 可空关联登录账号）
  2. 组织规则集中 packages/shared：buildDepartmentTree(depts)（层级/环检测/孤儿处理）、normalizeMember(input)（字段校验/邮箱格式）、validateDepartmentMove(id, parentId, tree)（防自挂/防环）——api/web 零算法分支
  3. api：departments CRUD + move、members CRUD + 按部门查询 + 搜索（姓名/邮箱/职位模糊）、GET /api/org/tree（部门带人员）
  4. web：新增「组织」tab——左侧部门树（展开/折叠）+ 右侧人员列表 + 新建/编辑表单 + 搜索框；本轮只做目录，不改审批/物资字段（避免回归）
  5. 断言：e2e ≥+35（树层级/环检测/CRUD/搜索/规范化）、audit ≥+25（含 4xx：自挂/成环/重复部门名/非法邮箱/越权 id）
  6. 截图 ≥7：组织空态/部门树展开/人员列表/新建人员表单/搜索结果/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥1891、audit ≥1539，README 双节同步
  2. 部门树三级真实装配 + 环检测断言（waizhuan 会造 A→B→A 验证拒绝）；人员搜索大小写不敏感
  3. **新增「组织」tab 补该 tab 激活态图**（十五 tab 壳基线）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r22 已发版（v0.0.28）✅
- 明确边界：本轮**不**把 members 接入审批/物资（那是 r24 可能的独立切片），避免既有断言大规模改动

### r24 · 组织成员接入审批与物资（向后兼容，M10 后功能补强）
- 目标：让 r23 建的通讯录不再是孤岛——审批审批人/发起人与物资保管员可从通讯录选人，但**严格向后兼容**（原自由文本字段不动）
- 交付清单：
  1. schema v16→v17：仅加**可空** member_id 列——approvals.applicant_member_id、approval_steps.assignee_member_id、approval_cc.cc_member_id、assets.custodian_member_id（全部可空，原 TEXT 列保持 NOT NULL 不变）；迁移走 user_version 队列，老数据 member_id=NULL 照常工作
  2. 解析规则集中 packages/shared/org.ts：resolveAssignee(text, memberId, members)（有 member_id 优先用通讯录姓名，否则回落自由文本）、memberDisplayName(member)——api/web 零算法分支
  3. api：审批发起/转交/物资出入库接受可选 member_id 参数（校验存在且 active），响应回带 member 摘要（姓名/部门）；GET /api/org/members/:id/usage（该人被指派审批/保管物资数）
  4. web：审批发起表单的申请人/审批人、物资表单的保管员旁加「从通讯录选人」按钮（弹出成员搜索选择器，选中填 member_id + 显示姓名），**保留原自由文本输入框**；审批时间线与物资卡片显示部门徽标（若有 member_id）
  5. 断言：e2e ≥+30（成员接入/回落自由文本/usage 计数）、audit ≥+20（4xx：member_id 不存在/已停用/越权）
  6. 截图 ≥7：审批表单选人弹窗/选中后/时间线部门徽标/物资表单选人/物资卡片徽标/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥1982、audit ≥1602，README 双节同步
  2. **向后兼容硬断言**：老路径（不传 member_id，纯自由文本）全部既有断言保持通过，无一条删改（waizhuan 亲验）；新路径 member_id 真关联通讯录
  3. 选成员后审批/物资显示部门徽标且 usage 计数正确；停用成员被拒
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r23 已发版（v0.0.29）✅
- 危险边界：不动用户数据；member_id 全可空，NULL 行为与 r16/r17 完全一致；若既有断言因 schema 迁移变化只允许更新期望值，不许删

### r25 · 第三轮遗留清理（审批 actorMemberId 真修 + shell 哈希块 + 文档口径）
- 目标：清 r24 复验的真实缺口与 UI 记账，不新增功能
- 交付清单：
  1. **P3 真修（waizhuan r24）**：审批 UI 的「通过/驳回」提交步骤未传 `actorMemberId` → 时间线该步无部门徽标、该成员 usage 少计 1。修法：web 审批操作的当前用户若关联 member（登录账号 user_id 关联 members.user_id），提交动作时带 actorMemberId；api 落 approval_steps.actor_member_id（新增可空列，v17→v18）+ 回带摘要 + usage 计数包含审批动作
  2. **shell README 哈希块覆盖（UI U2-1）**：r24 直接覆盖「r23 哈希块」，未保留历史对照——按 r22 先例改为「R25 当前块 + R23/R24 历史对照行」；全库计数同步 250 PNG
  3. **索引口径（UI U2-2/3）**：物资壳与 r23 同字节的事实写进 shell README（不伪造差异）；r24/05 索引「详情徽标」补图或改文案为如实
  4. **U3 低成本项**：选人弹窗加部门筛选、徽标去 member_id 裸号改姓名+部门、回填后手改的语义提示
  5. 变异红相 ≥1 组：actorMemberId 透传改坏 → 断言变红 → 还原全绿
- 断言：e2e ≥+12、audit ≥+8（审批动作 member 关联/usage 计数），只涨不缩
- 截图：改渲染层 ✓ → 审批详情徽标/选人弹窗筛选/徽标改版 + 十五 tab 壳基线同批重拍
- 验收标准：
  1. 全量绿：e2e ≥2053、audit ≥1675，README 双节同步
  2. 审批「通过」后时间线显示操作人部门徽标 + usage 计数准确（waizhuan 亲验）
  3. shell README 哈希与实际逐字一致；双 VERDICT 通过
- 前置：r24 已发版（v0.0.30）✅

### r26 · 通知中心（站内消息聚合，M10 后功能补强）
- 目标：协同办公标配——把散落在日程/审批/物资/同步的事件聚合成一个「通知」tab，统一未读管理与跳转
- 交付清单：
  1. schema v18→v19：notifications 表（id/type:schedule_due|approval_pending|asset_low|sync_conflict|system/title/body/ref_type/ref_id/read_at/created_at）+ 索引
  2. 通知规则集中 packages/shared/notifications.ts：buildNotification(type, ctx)（模板/标题/正文生成）、shouldNotify(type, ctx)（阈值判定：审批待办≥1、物资库存≤阈值、同步冲突>0、日程当天）、notificationSummary(list)（未读计数按 type 分组）——api/web 零算法分支
  3. api：notifications CRUD（列表带未读过滤/分页）、POST /:id/read、POST /read-all、POST /api/notifications/refresh（按当前库状态重算生成，幂等不重复）、GET /api/notifications/summary
  4. web：新增「通知」tab——左侧类型筛选（全部/日程/审批/物资/同步/系统）+ 右侧消息列表（未读加粗 + 时间 + 分类图标）+ 点条跳转对应模块（ref_type→tab）+ 顶栏全局未读徽标
  5. 断言：e2e ≥+40（模板/阈值/幂等/已读/分页/跳转契约）、audit ≥+30（含 4xx：非法 type/越权 id/无效 ref）
  6. 截图 ≥7：通知空态/有未读/类型筛选/已读后/refresh 后/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥2136、audit ≥1753，README 双节同步
  2. **真实事件聚合**：waizhuan 造「审批待办 + 库存低 + 同步冲突」→ refresh 生成 3 类通知各 1 → 重复 refresh 幂等不重复 → 点审批通知跳审批 tab 并定位该单
  3. **新增「通知」tab 补该 tab 激活态图**（十六 tab 壳基线）+ 顶栏未读徽标
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r25 已发版（v0.0.31）✅
- 明确边界：站内通知不接外部 IM/邮件（那是宪法「明确不做」的第三方 IM 集成），零 token

### r27 · 报表中心（跨模块数据看板，M10 后功能补强）
- 目标：把散在各模块的数据汇成统一报表——待办完成率/日程分布/看板吞吐/审批时效/库存周转/文档产出，一屏总览 + 时间范围筛选
- 交付清单：
  1. 报表规则集中 packages/shared/reports.ts：computeTodoCompletion(todos, range)、computeScheduleLoad(schedules, range)、computeApprovalSla(approvals, steps)、computeAssetTurnover(transactions)、computeDocOutput(documents, range)、assembleReport(all, range)（纯函数，无新依赖）——api/web 零算法分支
  2. api：GET /api/reports/overview?from=&to=（六类指标一次返回）、GET /api/reports/:metric?from=&to=（单项明细，供下钻）
  3. web：新增「报表」tab——第一行 6 张 KPI 卡（数值+环比+迷你条）+ 下方各指标明细表（点 KPI 卡切换）+ 时间范围选择（近 7/30/90 天 + 自定义）
  4. 断言：e2e ≥+35（六指标算法/时间范围/空数据/环比）、audit ≥+25（含 4xx：非法范围/未知名 metric/越权 id）
  5. 截图 ≥7：报表总览有数据/空态/时间范围切换/KPI 下钻明细/六卡齐/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥2272、audit ≥1834，README 双节同步
  2. 六指标手算核对（waizhuan 会造已知数据验完成率/吞吐/SLA），空数据不崩返回 0
  3. **新增「报表」tab 补该 tab 激活态图**（十七 tab 壳基线）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r26 已发版（v0.0.32）✅
- 明确边界：本轮只读不改任何业务数据；不引外部图表库（用 CSS/纯 SVG 迷你条），零新依赖、零 token

### r28 · 会议管理与会议室（预约 / 冲突检测，M10 后功能补强）
- 目标：协同办公标配的会议预约——会议室台账 + 时段预约 + 冲突检测 + 参会人（来自 r23 通讯录）——本轮只做本地预约管理，**不碰视频会议**（宪法「明确不做」）
- 交付清单：
  1. schema v19→v20：rooms 表（id/name/capacity/location/equipment/floor）、meetings 表（id/title/room_id/start_at/end_at/organizer_member_id/agenda/status:booked|cancelled/created_at）、meeting_attendees 表（meeting_id/member_id，可空关联通讯录）
  2. 会议规则集中 packages/shared/meetings.ts：detectTimeConflict(newMeeting, existing)（同会议室时段重叠判定，边界相接不冲突）、validateMeetingWindow(start, end)（结束必须晚于开始/最长 8 小时）、normalizeAttendees(ids)（去重/校验）——api/web 零算法分支
  3. api：rooms CRUD、meetings CRUD + 预约（冲突返回 409 + 冲突会议 id）、按日期/会议室查询日程、attendees 管理；GET /api/rooms/:id/availability?date=（时段占用表）
  4. web：新增「会议」tab——左会议室列表（容量/设备）+ 中周/日视图时段网格 + 右预约表单（标题/时段/参会人从通讯录选）；冲突时红条提示冲突会议
  5. 断言：e2e ≥+35（冲突检测/边界相接/窗口校验/预约 CRUD/可用性查询）、audit ≥+25（含 409 冲突/4xx：时段倒挂/超长/越权 room_id/停用参会人）
  6. 截图 ≥7：会议空态/会议室列表/时段网格/预约表单/冲突提示/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥2370、audit ≥1929，README 双节同步
  2. **冲突检测真实性**：waizhuan 造同会议室重叠时段→409+冲突 id；边界相接（9:00-10:00 与 10:00-11:00）不冲突；跨会议室同时段不冲突
  3. **新增「会议」tab 补该 tab 激活态图**（十八 tab 壳基线）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r27 已发版（v0.0.33）✅
- 明确边界：只做本地预约台账，**不接视频会议/外部日历**（宪法明确不做），零 token

### r29 · 文档版本历史与回收站（M10 后功能补强）
- 目标：给 r8/r9 的单人块编辑器补版本历史与误删恢复——文档快照版本 + 软删除回收站 + 一键恢复，**不接实时协同**（那需 CRDT，超当前范围）
- 交付清单：
  1. schema v20→v21：document_versions 表（id/document_id/version/title/content_markdown/created_at/note）、documents 加 deleted_at 可空列（软删除，回收站）
  2. 版本规则集中 packages/shared/docHistory.ts：nextDocVersion(current)、buildVersionNote(oldContent, newContent)（变更摘要：增/删行数）、canRestoreVersion(version, current)（防恢复到已软删文档）——api/web 零算法分支
  3. api：GET /api/documents/:id/versions、POST /:id/versions（手动存快照）、POST /:id/versions/:v/restore（恢复到指定版本，生成新版本而非覆盖）、DELETE /api/documents/:id（软删）、GET /api/documents/trash（回收站列表）、POST /trash/:id/restore（还原文档）
  4. web：文档编辑页加「版本历史」侧栏（版本列表 + 变更摘要 + 预览 + 恢复按钮）+ 文档列表加「回收站」入口（软删列表 + 还原/永久删除）
  5. 断言：e2e ≥+35（版本递增/摘要/恢复生成新版本/软删除/回收站）、audit ≥+25（含 4xx：版本不存在/恢复已删文档/越权 id/永久删除确认）
  6. 截图 ≥7：版本历史空态/多版本列表/变更摘要/预览对比/恢复后/回收站/窄屏
- 验收标准：
  1. 全量绿：e2e ≥2495、audit ≥2029，README 双节同步
  2. **恢复真实性**：waizhuan 造 v1→改→v2→改→v3，恢复到 v1 后生成 v4（不覆盖历史），全文逐字等于 v1；软删→回收站→还原→文档仍在
  3. **新增能力不改既有 tab**（在文档页内加侧栏/入口，18 tab 数量不变，但壳基线因文档页变化同批重拍）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r28 已发版（v0.0.34）✅
- 明确边界：不接实时协同编辑（CRDT 超范围）；永久删除需二次确认且只删本轮探针数据，不动用户数据

### r30 · 多维表格公式字段（纯本地表达式求值，M10 后功能补强）
- 目标：给 r6 字段引擎补公式字段——支持引用同表字段的四则/比较/条件运算，自动重算，零外部依赖
- 交付清单：
  1. schema v21→v22：无新表——fields.type 扩 `formula`，fields.options JSON 内加 `expression` 字符串（既有字段零改动，仅新字段可用）
  2. 公式引擎集中 packages/shared/formula.ts（纯 TS tokenizer + parser + evaluator，**零 eval、零 new Function、零依赖**）：
     - parseFormula(expr) → AST（字段引用 `{字段名}`、数字/字符串字面量、+ - * /、比较、IF(cond,a,b)、ROUND(x,n)）
     - evaluateFormula(ast, record) → 值；compileFormula(expr, fields) → 校验字段引用存在 + 类型合法性（非法字段/语法错误返回结构化错误）
     - recomputeFormulas(table, records) → 批量重算，检测循环引用（A 引用 B、B 引用 A 报错）
  3. api：新增/编辑 formula 字段时校验表达式（非法 400）、GET 记录时回带计算值（不落库，读时计算）、字段引用变更后重算预览
  4. web：字段类型下拉加「公式」；新增公式字段时表达式输入框 + 实时预览（对现有记录试算）；网格中公式列只读显示计算值，错误显示红标
  5. 断言：e2e ≥+40（tokenize/parse/求值/循环引用/字段变更重算/错误提示）、audit ≥+30（4xx：非法表达式/未知字段/循环引用/越权表 id）
  6. 截图 ≥7：公式字段空态/表达式编辑/实时预览/网格计算值/错误红标/窄屏/循环引用错误
- 验收标准：
  1. 全量绿：e2e ≥2582、audit ≥2090，README 双节同步
  2. **公式真实性**：waizhuan 造字段「单价 number / 数量 number / 小计 formula={单价}*{数量}」→ 新记录自动算小计；改单价后重算；循环引用 A↔B 被拒并给明确错误
  3. **安全**：全库 grep 确认无 eval / new Function（表达式解析纯手写）——变异探针验证
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r29 已发版（v0.0.35）✅
- 明确边界：表达式只引用本表字段、只读计算不落库、零 eval/零依赖；不引外部公式库

### r31 · 轻量清理：字段类型文案回归 + 公式浮点展示（M10 后）
- 目标：清 r30 两岗记账的低成本真问题，不新增功能
- 交付清单：
  1. **字段类型数文案回归（UI U2-1）**：`BasesPage.tsx:921` 空态文案「7 种字段类型齐备」→ 改「8 种字段类型齐备（含公式）」；同步 `docs/ui/shell/README.md` 对应说明；因改渲染层→**重拍 shell/bases 单张 + 十八 tab 壳同批**（或整批，按宪法第一条）
  2. **公式浮点展示（waizhuan P5）**：链式预览出现 `84.80000000000001` → 展示层格式化（toFixed 去尾零或 round 到合理精度），**不改求值语义**（audit 手算断言保持）
  3. 变异红相 ≥1 组：格式化改坏（去掉 toFixed）→ 展示层断言变红 → 还原全绿
- 断言：e2e ≥+8（文案/展示格式化）、audit ≥+5，只涨不缩
- 截图：1 张 shell/bases 重拍 + 十八壳同批 + r31 矩阵（公式展示格式化态）
- 验收：全量绿（e2e ≥2672、audit ≥2127），README 双节同步；双 VERDICT 通过
- 前置：r30 已发版（v0.0.36）✅

### r32 · 文档打印导出增强（HTML 打印版 + Word 兼容，M10 后功能补强）
- 目标：办公刚需的「打印/另存为 PDF/Word」——零新依赖（宪法危险区：不引 pdf/docx 库），用纯 HTML + @media print + Word 可打开的 HTML-in-doc 方案
- 交付清单：
  1. 导出引擎集中 packages/shared/docExport.ts：blocksToPrintHtml(blocks, title, meta)（语义化 HTML + @media print 样式内嵌 + 页码页眉）、blocksToWordHtml(blocks, title)（Word 兼容 MHTML/HTML，base64 UTF-8）、sanitizeExportHtml（块内容转义防注入）——api/web 零算法分支
  2. api：GET /api/documents/:id/export.html（浏览器可打印为 PDF）、GET /api/documents/:id/export.doc（Word 打开）、GET /api/documents/:id/print-preview（返回 HTML + 元信息）
  3. web：文档编辑页导出菜单加「打印 / 另存 PDF」「下载 Word(.doc)」；点打印新开隐藏 iframe 调 window.print()（headless 用 spy seam 验证）
  4. 断言：e2e ≥+30（HTML 结构/转义/打印样式/Word 兼容头）、audit ≥+20（4xx：越权 id/空文档/非法块）
  5. 截图 ≥6：导出菜单/打印预览/HTML 落盘佐证/Word 落盘佐证/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥2715、audit ≥2158，README 双节同步
  2. **导出真实性**：waizhuan 造含 10 种块的文档→导出 HTML 用浏览器真打开（标题/块序/样式正确）→Word .doc 用 Excel/Word COM 或文本解析验证可打开且内容不丢；XSS 注入块内容被转义
  3. **零新依赖**：package.json 零变动（grep 验证）；不引外部 CDN
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r31 已发版（v0.0.37）✅
- 明确边界：不引 pdf/docx 第三方库（危险区），零 token；打印在 headless 下用 spy/seam 不弹系统对话框（r8 教训）

### r33 · 全局搜索（跨模块统一检索，M10 后功能补强）
- 目标：数据散落 16 个模块，用户找一条待办/文档/会议要切 tab——统一搜索框 + 跨模块结果 + 点结果直达（复用 r26 deep-link 机制）
- 交付清单：
  1. 搜索规则集中 packages/shared/globalSearch.ts：normalizeQuery（trim/小写/分词）、scoreMatch(query, text)（标题权重>正文、前缀命中>包含）、assembleSearchResults(query, sources)（跨源聚合/按分数排序/每源上限/去重）——api/web 零算法分支
  2. api：GET /api/search?q=&limit=&types= 一次检索 8 类源——todos / schedules / projects / cards / documents / knowledge_docs / members / meetings（全读既有表，只读不写）；每条结果带 {type, id, title, snippet, score, tab, deepLink}
  3. web：顶栏全局搜索框（快捷键 Ctrl/Cmd+K）+ 下拉结果面板（按类型分组图标 + 分数高亮 + 键盘上下选）+ 点结果跳对应 tab 并定位（复用 r26 deep-link）
  4. 断言：e2e ≥+35（分词/权重/排序/去重/空查询/跨源）、audit ≥+25（4xx：空 q/超长 q/非法 types/越权源）
  5. 截图 ≥7：搜索空态/输入中/单类型结果/多类型结果/键盘选中/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥2801、audit ≥2210，README 双节同步
  2. **跨源真实性**：waizhuan 在 4 个模块各造一条含同关键词的数据→搜索一次返回 4 条且排序合理（标题命中优先）→点其中会议结果直达该会议（复用 deep-link）
  3. **只读**：全链路零业务表写入（waizhuan raw 库快照核对）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r32 已发版（v0.0.38）✅
- 明确边界：只读检索不改业务数据；零外部搜索服务/零 token；不新增 tab（顶栏搜索框，18 tab 数量不变，壳基线因顶栏变化同批重拍）

### r34 · 任务依赖与阻塞关系（M10 后功能补强）
- 目标：待办有状态机但无依赖——补前置任务（finish-to-start）：依赖未完成则本任务不可开始，循环依赖检测，看板/待办页可视化阻塞链
- 交付清单：
  1. schema v22→v23：todo_dependencies 表（todo_id/depends_on_todo_id，UNIQUE 对，FK CASCADE）
  2. 依赖规则集中 packages/shared/todoDeps.ts：canStartTodo(todo, deps, todos)（所有前置 done 才能开始）、detectDependencyCycle(deps)（DFS 环检测）、buildDependencyGraph(todos, deps)（拓扑序/阻塞链）——api/web 零算法分支
  3. api：依赖 CRUD（POST/DELETE /api/todos/:id/dependencies）、GET /:id/dependencies（含前置状态）、GET /api/todos/blocked（被阻塞任务列表）、状态机接入（open→done 时必须无未完成前置，否则 409）
  4. web：待办详情页加「前置任务」区（添加/移除 + 状态徽标）、列表页阻塞态图标 + 「被 N 项阻塞」提示、循环依赖错误红条
  5. 断言：e2e ≥+35（依赖判定/环检测/拓扑/状态机接入/阻塞列表）、audit ≥+25（409 阻塞/4xx：自依赖/环/越权/重复依赖）
  6. 截图 ≥7：待办依赖空态/添加前置/阻塞态列表/依赖满足后/循环错误/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥2884、audit ≥2287，README 双节同步（精简版：速查行 + 两节当前 r34 条目，历史仍指向归档）
  2. **依赖真实性**：waizhuan 造 A→B→C 链，A 未完成时 B/C 转 done 必须 409；A done 后 B 可 done；自依赖/环 A→B→A 被拒
  3. **既有状态机零回归**（r1 的 todo 状态机断言全绿，只加守卫不改语义）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r33 已发版（v0.0.39）✅
- 明确边界：只做 finish-to-start 依赖，不做甘特图/时间约束（超范围）；零新依赖、零 token

### r35 · 日历 ICS 导出与订阅（标准 iCalendar，M10 后功能补强）
- 目标：日程页数据可导出为标准 .ics（Outlook/Google Calendar/Apple 日历可导入）+ 提供订阅 URL（只读 token-free 的本地 feeds）
- 交付清单：
  1. ICS 引擎集中 packages/shared/ics.ts：escapeIcsText（文本转义 , ; \ 换行）、formatIcsDate（UTC `YYYYMMDDTHHMMSSZ`）、buildIcsCalendar(schedules, meta)（VCALENDAR/VEVENT 完整头、UID 稳定、DTSTART/DTEND/SUMMARY/DESCRIPTION/LOCATION）、parseIcsCalendar(ics)（回读解析，验证往返）——api/web 零算法分支
  2. api：GET /api/schedules/export.ics?from=&to=（时间范围过滤，content-type text/calendar）、GET /api/todos/due.ics（待办截止日作为 VEVENT）、GET /api/feeds/:key.ics（订阅 key=用户本地随机串，存 settings，非密钥文件）
  3. web：日程页加「导出 .ics」按钮 + 订阅设置卡（生成/复制订阅 URL）+ 导入 .ics 预览（解析后确认写入）
  4. 断言：e2e ≥+35（转义/日期格式/往返/VEVENT 字段/范围过滤/导入预览）、audit ≥+25（4xx：非法范围/越权 key/坏 ICS）
  5. 截图 ≥7：ICS 导出菜单/落盘佐证/订阅卡/导入预览/导入成功/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥2996、audit ≥2349，README 双节同步（精简版三处）
  2. **标准兼容**：waizhuan 造含中文/逗号/换行/引号的日程→导出 .ics→用独立解析器（或 Outlook/Excel COM 等价）真打开验证不乱码不丢字段；导出→导入往返逐字段相等
  3. **零新依赖**：手写 ICS 编解码，package.json 零变动
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r34 已发版（v0.0.40）✅
- 明确边界：订阅 key 是本地随机串（存 settings），不是密钥/token（宪法危险区：不写密钥文件）；不接外部日历服务；零 token

### r36 · 日报与周报自动生成（M10 后功能补强）
- 目标：IKanBot/多宝鱼标配——从真实业务数据自动汇总日报/周报（完成项/进行中/阻塞/日程/产出），可编辑后存为文档，零 token
- 交付清单：
  1. 报告规则集中 packages/shared/workReports.ts：collectReportData(db 查询结果, period)（按时间窗过滤已完成/新建/阻塞项）、buildReportMarkdown(data, type: daily|weekly)（标题/完成/进行中/阻塞/日程/明日计划段落）、buildReportHtml（打印版）、reportSummary(data)（计数摘要）——api/web 零算法分支
  2. api：GET /api/reports/daily?date=、GET /api/reports/weekly?week=（返回 Markdown + 结构化数据）、POST /api/reports/save（把报告存为 documents + blocks，可编辑）
  3. web：新增「报告」tab——日报/周报切换 + 日期/周选择 + Markdown 预览（可编辑 textarea）+ 「存为文档」按钮 + 打印导出
  4. 断言：e2e ≥+35（时间窗过滤/段落装配/空数据/保存为文档/编辑）、audit ≥+25（4xx：非法日期/越权 id/空内容）
  5. 截图 ≥7：报告空态/日报有数据/周报有数据/编辑态/存为文档后/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥3104、audit ≥2421，README 双节同步（精简版三处）
  2. **真实性**：waizhuan 造已知数据（今日完成 2、进行中 3、阻塞 1）→日报 Markdown 逐段手算核对；周报聚合 7 天数据正确；存为文档后可在文档页打开编辑
  3. **新增「报告」tab 补该 tab 激活态图**（十九 tab 壳基线）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r35 已发版（v0.0.41）✅
- 明确边界：不接外部 LLM 生成文案（模板化汇总，零 token）；报告数据只读既有业务表

### r37 · 表格分组视图与汇总行（M10 后功能补强）
- 目标：多维表格 r6/r7 有筛选排序视图但无分组——补按字段分组 + 每组汇总行（计数/求和/均值），与既有视图持久化机制复用
- 交付清单：
  1. 分组规则集中 packages/shared/tableGroups.ts：groupRecords(records, fieldId)（按字段值分桶、null 独立组、组序确定性）、aggregateGroup(records, fieldId, aggregator: count|sum|avg)（纯函数，跳过非数值）、buildGroupView(records, groupField, sortSpec)（分组+组内排序+汇总行装配）——api/web 零算法分支
  2. schema v23→v24：views 表加 group_spec JSON 可空列（复用 r7 视图持久化，不改旧行）
  3. api：视图 CRUD 扩 groupSpec 字段、GET /api/views/:id/grouped（返回分组+汇总）、4xx 校验（非法字段/非法 aggregator/越权 view）
  4. web：表格页视图栏加「分组」下拉（选字段+聚合方式）+ 分组折叠头 + 每组汇总行（只读）
  5. 断言：e2e ≥+35（分桶/null 组/聚合/组内排序/持久化）、audit ≥+25（4xx：非法字段/聚合/越权 view）
  6. 截图 ≥7：分组空态/分组下拉/数值字段分组/汇总行/折叠后/窄屏/错误态
- 验收标准：
  1. 全量绿：e2e ≥3202、audit ≥2496，README 双节同步（精简版三处）
  2. **分组真实性**：waizhuan 造已知数据（金额字段 10/20/30，按状态分组）→ 每组 count/sum/avg 手算核对；null 值独立成组；分组配置保存后 reload 保持
  3. 既有视图（r7）零回归（筛选/排序/投影断言全绿）
  4. 双 VERDICT（waizhuan + ui 阻断岗）通过
- 前置：r36 已发版（v0.0.42）✅
- 明确边界：聚合只读不落库；不做图表（r27 报表已有）；零新依赖、零 token

## 历史轮次（r1~r2 已收档，见下方记账区）

---

## 记账区（每轮追加）

### 2026-11-20 · r36 研发（yanfa-r36 · M10 后功能补强：日报与周报自动生成）
- 交付：`packages/shared/src/workReports.ts` 唯一口径（`parseWorkReportPeriod` 日/自然周/ISO 周锚点 · `inWorkReportWindow` 闭区间过滤 · `collectReportData` 完成按 updatedAt / 新建进行中按 createdAt||updatedAt / 阻塞取 r34 依赖图 · `buildReportMarkdown` 六段 · `buildReportHtml` 打印版五字符转义 · `reportSummary` 计数 · `assertValidWorkReportSave` 守卫）；`@xieflow/shared/workReports` 子路径登记；api/web 零算法分支；零新依赖、零 token、无 schema 迁移（复用 documents + blocks）
- api：`GET /api/reports/daily?date=`、`GET /api/reports/weekly?week=`（Markdown + 结构化数据 + 摘要 + 打印 HTML）、`POST /api/reports/save`（新建 201 / 覆盖 200，空内容 400 / 越权文档 id 404 / 非法日期 400）——audit 75 条真 HTTP 全绿
- web：新增第十九 tab「报告」（`?page=work-reports`）——日报/周报切换 + 日期/周锚点 + 可编辑 Markdown 预览 + 计数摘要 + 存为文档回执 + 打印导出 + 错误红条；十九 tab 壳基线同批重拍
- 断言：e2e 3069 → **3167（+98）** · audit 2396 → **2471（+75）**，无一条删除；typecheck 5 包；`pnpm run test:all` exit 0
- **变异红相 1 组**：`inWorkReportWindow` 上界 `day <= period.to` → `day < period.to`（末日被错误排除）→ e2e 18 红 / audit 15 红；逐字节还原（SHA `7080BE3D…B3B14`，`MUTATION-PROBE r36` 零残留）双套件全绿
- 「用户第一次用」全链路：`scripts/r36-firstuse-cdp.mjs`（headless CDP 真点，16 步全绿）造 4 待办/2 日程 → 看日报 → 切周报 → 编辑 Markdown → 存为文档 → 文档页打开 → reload 不丢 → HTTP truth 回查 → 探针清理、服务收净
- 截图：`docs/ui/r36/` 7 张 + `docs/ui/shell/` 十九 tab 同批重拍；7/7、19/19 SHA256 互异，矩阵↔壳重叠 0，全库 335 PNG / 333 互异，逐张 `read_image` 目验；首轮 remote 登录页废片与次轮主按钮白字白底废片均全批重拍未入库；索引 / shell README R36 块 / 精简版根 README 同一提交
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI 发布配置；无 schema 迁移、未手改库文件；截图与 CDP 走 scratch 库并在批次末删除，仓库 `data/xieflow.db` 未作 DB_PATH；全程 headless、服务收净、PowerShell 新段全 ASCII、零 token
- 报告：`docs/feedback/2026-11-20-r36-yanfa.md`（三态纪律 + 自曝 + 变异红相 + 全链路证据）

### 2026-11-20 · r33 研发（yanfa-r33 · M10 后第十一轮功能补强：全局搜索 / 跨八源只读统一检索）
- 交付：`packages/shared/src/globalSearch.ts` 唯一检索口径（`normalizeQuery` trim/小写/分词 · `scoreMatch` 标题权重 3 > 正文 1、前缀 10 > 包含 5 · `assembleSearchResults` 跨源聚合/分数降序/每源上限/type:id 去重/deepLink 装配 · `parseSearchTypes` / `parseSearchLimit` / `assertValidSearchQuery` 守卫 · `splitSearchHighlight` 高亮切分 · 八源 tab/id 参数映射），根 index.ts 重导出、子路径 `./globalSearch` 开放；**零新依赖、零 token、零外部搜索服务、无 schema 迁移**
- api：`GET /api/search?q=&limit=&types=` 一次检索 8 类源（todos / schedules / projects / cards / documents / knowledge_docs / members / meetings，全 `list*` 只读），每条 `{type,id,title,snippet,score,tab,deepLink}`；4xx：空 q / 超长 q / 非法 types / 越权源（users）/ 非法 limit
- web：顶栏全局搜索框（Ctrl/Cmd+K 聚焦 + 下拉结果面板：类型分组图标 / 黄底高亮 / 分数 / ArrowUp·ArrowDown 选中 / Enter 或点结果 deep-link 跳转）+ 会议页 `meetingId` 深链定位条 + 待办/卡片/成员定位高亮；**18 tab 数量不变**，顶栏变化 → 十八 tab 壳基线同批重拍
- 断言：e2e 2766 → **2849（+83）** · audit 2185 → **2262（+77）**，无一条删改（既有仅做徽章 r32→r33、当前哈希块 R32→R33、速查行期望值/标签更新）；typecheck 5 包；`pnpm run test:all` exit 0
- **变异红相 1 组**：`assembleSearchResults` 终排序 `b.score - a.score` → `a.score - b.score`（升序改坏）→ e2e 2 红（分数降序 / 正文命中末位）/ audit 4 红（正文命中最前 + 三处相邻分数逆序）；逐字节还原（SHA `9A8D8086…469BF9` 前后同值、`MUTATION-PROBE r33` 零残留）后双套件全绿
- 「用户第一次用」全链路（headless CDP 真点，`scripts/r33-firstuse-cdp.mjs`，4 模块同关键词起步）：HTTP 造待办/文档/知识库（正文命中）/会议室+会议 → Ctrl+K 聚焦 → 输入真检索四组 → ArrowDown 选中 → 点会议结果跳 meetings tab 且 `#meetingId` 高亮命中条 → reload 保留 page+meetingId 且仍定位 → HTTP 回查 search/deep-link → 探针归零、端口收净
- 只读证据：api collector 全 `list*`、源码零写入调用 seam；audit 八源探针前后四张业务表计数逐字节相等 + 重复检索结果逐字节一致；截图与 CDP 全走 scratch 库，`data/xieflow.db` 未作 DB_PATH
- 截图：`docs/ui/r33/` 7 张（空态/输入中/单类型/多类型/键盘选中/窄屏/真 4xx）+ 十八 tab 壳同批重拍；7/7、18/18 SHA256 互异，矩阵↔壳重叠 0，全库 313 PNG / 311 互异（同态组仅 r4 已披露 2 组），逐张 `read_image` 目验；首轮 01 预填/02 与 04 同态/06 窄屏裁切三处全批重拍，废片未入库
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI 发布配置；零业务表写入、零用户数据删除、零新依赖、零 token；全程 headless、服务收净、PowerShell 新段全 ASCII
- 报告：`docs/feedback/2026-11-21-r33-yanfa.md`（三态纪律 + 自曝 + 变异红相 + 只读证据）

### 2026-11-20 · r32 研发（yanfa-r32 · M10 后第十轮功能补强：文档打印导出增强）
- 交付：`packages/shared/src/docExport.ts` 唯一导出引擎（`sanitizeExportHtml` 五字符转义+换行 `<br>` / `blocksToPrintHtml` 语义化 HTML+内嵌 `@media print`/`@page`/`counter(page)` 页码页眉 / `blocksToWordHtml` UTF-8 BOM + Word 命名空间 + `WordSection1` + `mso-field-code` + base64(UTF-8) 自证 / `assertExportableBlocks` 空文档与非法块守卫 / `buildExportFileName` / `buildPrintPreview`），根 `index.ts` 重导出，api/web 零算法分支；**零新依赖、六个 package.json 不动、零外链、零 token、无 schema 迁移**
- api：`GET /api/documents/:id/export.html`（inline text/html，可打印/另存 PDF）、`GET /api/documents/:id/export.doc`（attachment application/msword，UTF-8 BOM）、`GET /api/documents/:id/print-preview`（JSON + 完整 HTML）；4xx：越权 id 404 / 非法 id 400 / 空文档 422 / 非法块写入 400
- web：文档页导出菜单加「打印 / 另存为 PDF」「下载 Word(.doc)」「打开 HTML 打印版」；打印走隐藏 iframe `src=/export.html` + `window.print()`，headless（钉态或 `navigator.webdriver`）只写 `__xieflowPrintSpy` 不弹系统对话框（r8 教训）；Word 按原字节下载并留 BOM 佐证；**18 tab 数量不变**，文档页渲染变化 → 十八 tab 壳基线同批重拍
- 断言：e2e 2685 → **2766（+81）** · audit 2138 → **2185（+47）**，无一条删改（既有只做徽章 r31→r32、当前哈希块 R31→R32、速查行 2685/2138→2766/2185 期望值/标签更新）；typecheck 5 包；`pnpm run test:all` exit 0；CI smoke 正则保持 `(2|…|22)`；README 速查行/双节/r32 矩阵索引/壳 R32 哈希块逐字同步
- 「用户第一次用」全链路（headless CDP 真点，`scripts/r32-firstuse-cdp.mjs`，0 文档起步）：建文档 → 导入十种块 → 导出菜单 → 打印 spy 1 次且不弹窗 → Word BOM 佐证 → reload 11 块全在 → HTTP 回查 HTML/Word 200 → 探针软删、服务收净
- 截图：`docs/ui/r32/` 6 张（导出菜单/打印预览/HTML 落盘/Word 落盘/窄屏/真 4xx 错误）+ 两份真导出文件（`document-export.html` / `document-export.doc`）+ 十八 tab 壳同批重拍；6/6、18/18 SHA256 互异，矩阵↔壳重叠 0，全库 306 PNG / 304 互异（r4 已披露 2 组同态除外），逐张 `read_image` 目验
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI 发布配置；无 schema 迁移、未手改库文件；截图与 CDP 只走 `scripts/.tmp-r32shot/shot.db`，audit 走 `scripts/.tmp-audit` 并清理；全程 headless、服务收净、PowerShell 新段全 ASCII、零 token
- 报告：`docs/feedback/2026-11-21-r32-yanfa.md`（三态纪律 + 自曝 + 变异红相 + 零依赖证据）

### 2026-11-20 · r31 研发（yanfa-r31 · M10 后第九轮轻量清理：字段类型文案回归 + 公式浮点展示）
- 交付：清 r30 两岗记账的低成本真问题，不新增功能、无 schema 迁移（复用 v22）、零依赖、零 token——① `BasesPage.tsx` 零表空态「7 种字段类型齐备」→「8 种字段类型齐备（含公式）」并同步 `docs/ui/shell/README.md` bases 行；② `packages/shared/formula.ts` 新增唯一展示格式化纯函数 `formatFormulaDisplay`（null/undefined→「—」，整数/非有限数原样，非整数按 12 位有效数字收敛尾数，文本/布尔逐字保留），web 公式单元格 `CellView` 与实时预览面板统一调用；**API 求值语义零改动**，`84.80000000000001` 仍为 HTTP 原始值，仅展示为 `84.8`
- 断言：e2e 2664 → **2685（+21：纯函数 10 · 求值/展示分离 2 · 文案/接线/截图 seam 9）** · audit 2122 → **2138（+16：链式公式真 HTTP 装配 · GET/预览原始浮点逐字保持 · 展示收敛 · 公式列不落库 · 探针归零）**，无一条删改（既有只做六处徽章 r30→r31、七处实际文件哈希引用块 R30→R31、五处速查行 2664/2122→2685/2138 期望值更新）；typecheck 5 包；`pnpm run test:all` exit 0；CI smoke 正则保持 v22；README 速查行/双节/r31 矩阵四行/壳 R31 哈希块逐字同步
- **变异红相 1 组**：`formatFormulaDisplay` 去掉 `toPrecision(12)` 展示收敛 → e2e 4 红（三条浮点尾数 + 求值/展示分离）/ audit 2 红（GET 与预览真 HTTP 展示断言）；逐字节还原 SHA `99807E6D…C99A4`（改前改后同值、`MUTATION-PROBE r31` 零残留）双套件全绿
- 截图：`docs/ui/r31/` 3 张（空态八类文案 / 试算预览 84.8 / 纯网格含税列 84.8）+ 十八 tab 壳基线同批重拍；3/3、18/18 SHA256 互异，矩阵↔壳重叠 0，r30→r31 十八壳逐名全异，全库 300 PNG / 298 互异（同态组仅 r4 已披露 2 组），逐张 `read_image` 目验；首拍两态发现弹窗遮挡网格列 → 补第三张纯网格态后全批重拍，废片未入库
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI release 配置；无 schema 迁移、未手改库文件；截图走 scratch 库（`data/xieflow.db` 只读），audit 走 `.tmp-audit` 临时库并清理；全程 headless、服务收净、PowerShell 新段全 ASCII、零 token
- 报告：`docs/feedback/2026-11-21-r31-yanfa.md`（三态纪律 + 自曝节 + 变异红相）

### 2026-11-20 · r30 研发（yanfa-r30 · M10 后功能补强：多维表格公式字段，纯本地表达式求值）
- 交付：schema v21→v22（无新表；重建 fields 表把 type CHECK 白名单 7→8 种，逐列原样拷贝既有字段；options JSON 双形态——旧/非公式字段仍为数组，公式字段为 `{expression}` 对象）；`packages/shared/formula.ts` 纯 TS tokenizer + parser + evaluator（字段引用 `{名}` / 字面量 / + - \* / / 比较 / IF / ROUND；parseFormula / evaluateFormula / compileFormula 结构化错误 / detectFormulaCycles / recomputeFormulas 拓扑序 + 传递污染），**零 eval / 零 Function 构造器 / 零依赖**，api/web 零算法分支
- api：公式字段新建/编辑校验（非法表达式·未知字段·缺表达式·循环引用 → 400，越权表/字段 id → 404）；GET 表/视图/单条记录回带 `computed`（读时计算，库内公式列恒 null 不落库）+ `cycles`；`POST /api/tables/:id/formulas/preview` 实时试算与编辑预览（draft 表达式不落库）
- web：字段类型加「公式」（8 种下拉）；表达式输入框 + 实时预览面板 + 错误红条；网格公式列只读绿值 / 错误红标 `⚠`；**18 tab 数量不变**，表格页渲染层变化 → 十八 tab 壳基线同批重拍
- 断言：e2e 2542 → **2664（+122）** · audit 2004→2060→**2122（+62）**，无一条删改；typecheck 5 包；`pnpm run test:all` exit 0；CI smoke 正则升 v22；README 速查行/双节/r30 矩阵八行/壳 R30 哈希块逐字同步
- **变异红相 1 组**：`packages/shared/src/formula.ts` 乘法 `a * b` → `a + b`（求值算法改坏）→ e2e 8 红（12×3、12.5×4、优先级、链式、批量重算、数据层装配等）/ audit 5 红（50 / 21 / 80 / 84.8 真 HTTP 值全错）；逐字节还原 SHA `ABF118AE…FA85EB`（改前改后同值、`MUTATION-PROBE r30` 零残留）双套件全绿
- 「用户第一次用」全链路（真 HTTP）：建表 → 加单价 number / 数量 number → 加小计 formula `{单价}*{数量}` → 录 12.5×4 与 3×7 → GET 回带 50 / 21 且 data 内公式列 null → 改单价为 20 后读时重算 80 → 链式公式预览 84.8 → 甲↔乙循环改写 400 零半态 → 除零 error 红标 → 整表探针删除归零
- 截图：`docs/ui/r30/` 7 张 + 十八 tab 壳基线同批重拍；7/7、18/18 SHA256 互异，矩阵↔壳重叠 0，全库 297 PNG / 295 互异（同态组仅 r4 已披露 2 组），逐张 `read_image` 目验；首轮登录页废片与二轮 05 面板态废片均全批重拍未入库
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI release 配置；只走 user_version 迁移、未手改库文件；截图与探针只走 scratch 库（`data/xieflow.db` 只读，原库处于 remote 登录态故未使用）；全程 headless、服务收净、PowerShell 新段全 ASCII、零 token
- 报告：`docs/feedback/2026-11-21-r30-yanfa.md`（三态纪律 + 自曝节 + 变异红相 + 零 eval 证据）

### 2026-11-20 · r29 研发（yanfa-r29 · M10 后功能补强：文档版本历史与回收站）
- 交付：schema v20→v21（document_versions 七列 + UNIQUE(document_id,version) + 外键级联 + 索引；documents.deleted_at 可空列）；`packages/shared/docHistory.ts` 三函数（nextDocVersion / buildVersionNote LCS 增删行摘要 / canRestoreVersion 防恢复已软删）+ 恢复守卫，api/web 零算法分支；无新依赖、零 token、不接实时协同（CRDT 超范围）
- api：版本列表 / 手动快照 / 恢复生成新版本（不覆盖）/ 文档软删 / 回收站列表 / 回收站还原 / 永久删除（confirm=PERMANENTLY_DELETE 二次确认，只作用于回收站探针）；4xx：版本不存在 404 / 越权文档 404 / 跨文档版本 404 / 非法版本 400 / 恢复已软删文档 400 / 缺确认 400
- web：文档页内加「版本历史」侧栏（列表 + 变更摘要 + 预览 + 恢复）+ 工具栏「回收站」入口（还原 / 永久删除二次确认）；**18 tab 数量不变**，文档页变更 → 十八 tab 壳基线同批重拍
- 断言：e2e 2460 → **2542（+82）** · audit 2004 → **2060（+56）**，无一条删改（既有只做期望值/标签推进）；typecheck 5 包；`pnpm run test:all` exit 0；CI smoke 正则升 v21；README 速查行/双节/r29 矩阵索引/壳 R29 哈希块逐字同步
- **变异红相 1 组**：shared `nextDocVersion` 的 `return n + 1` → `return n`（恢复将覆盖）→ e2e 4 红 + 数据层 CHECK 中断 / audit 11 红；逐字节还原（SHA `0782FBBC…92645D`）双套件全绿
- 「用户第一次用」全链路：真 HTTP v1→v2→v3 → 恢复 v1 生成 v4（全文逐字等于 v1，v1~v3 未覆盖）→ 软删 → 回收站 → 还原 → reload 不丢 → 再软删 → 二次确认永久删除探针归零；全程 headless、服务收净
- 截图：`docs/ui/r29/` 7 张 + 十八 tab 壳基线同批重拍；7/7、18/18 SHA256 互异，矩阵↔壳重叠 0，全库 290 PNG / 288 互异（同态组仅 r4 已披露 2 组），逐张 `read_image` 目验；首轮 03/04 同哈希废片全批重拍未入库
- 危险区：未 push / 未打 tag / 未发版 / 未改 CI release 配置；只走 user_version 迁移、未手改库文件；只用 scratch 库与真 HTTP 探针并清理（永久删除只删本轮探针）；仓库 `data/xieflow.db` 只读；PowerShell 新段全 ASCII、零 token
- 报告：`docs/feedback/2026-11-21-r29-yanfa.md`（三态纪律 + 自曝节 + 变异红相 + 全链路证据）

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
