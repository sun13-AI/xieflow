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
pnpm run test:all    # typecheck + e2e（288 断言）+ HTTP 审计（313 断言）
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
apps/
  web/               React + Vite 界面（工作台 / 待办四象限 / 日程月视图 / 项目 / 看板）
  api/               Fastify 服务（health / settings / todos / schedules / projects / board）
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
  ui/                截图矩阵（逐张对照断言；shell/ 为五 tab 壳基线）
.github/workflows/   CI：三平台 verify + tag 触发 Release
```

## 路线图

M0 立项 ✅ → M1 待办+日程 ✅ → M2 项目+看板 → M3 多维表格 → M4 文档 → M5 AI 工作台 → M6 知识库 RAG → M7 导图+白板 → M8 组织管理 → M9 网络版 → M10 多端与单机版

进度看板：[docs/plan.md](docs/plan.md)

## 界面与测试对照

按 AGENTS.md 立项规则：**界面更新必须带截图证据（每次，无例外）**，截图与实现同一提交。逐图索引（r1/r2/r3/r4/r5 矩阵全量、逐张对照断言）：

### r5 矩阵：[docs/ui/r5/](docs/ui/r5/README.md) —— 看板统计卡 + CSV 台账导出（M2 第 收官，共 8 张 + 1 份落盘 CSV）：

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

### 壳基线：[docs/ui/shell/](docs/ui/shell/README.md) —— 五 tab 激活态（r4 返工 #1 B 固化，shot.ps1 自动拍摄）：工作台 / 待办 / 日程 / 项目 / 看板各 1 张（r2/r3 U1-1 三轮连漏的流程性终结）。

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

- e2e **288** 项（服务离线口径 288，api 在线时 HTTP 冒烟节 +1 = 289）：迁移一致性 7 · settings 9 · todo CRUD 15 · 输入校验 13 · 状态机 10 · 汇总计数 7 · raw schema 4 · 迁移幂等 3 · 日程契约与守卫 28 · 循环实例化 14 · 区间查询装配 12 · v2→v3 迁移+双向联动 18 · schedules CRUD 26 · 看板排序规则（reorderPositions）12 · 看板名称守卫 6 · v3→v4 迁移+看板数据层 33 · **看板统计口径（computeBoardStats）35（r5 新增）· 看板 CSV 台账（buildBoardCsvContent）36（r5 新增）**
- HTTP audit **313** 项（服务就绪 1 · health/settings 5 · todo 新建 12 · 列表详情 7 · 状态流转 9 · summary 11 · 删除 6 · 未知路由 1 · schedules CRUD 36 · 双向联动 22 · 循环实例 over HTTP 23 · projects CRUD 25 · board columns CRUD 20 · cards CRUD + 跨列移动 50 · **board stats + CSV export 80（r5 新增）** · schedules 删除 5）
- typecheck 4 包全绿（strict + noUncheckedIndexedAccess）
- CI：ubuntu / windows / macos 三平台 verify 门禁 + tag 触发 Release
- r5 规模变化：e2e 217 → 288（+71）· audit 233 → 313（+80）；**无一条断言被删**（只涨不缩，宪法第四条）

### 核心概念（r4 已落地的部分）

- **迁移纪律**：schema 变更只走 `packages/db/src/schema.ts` 的 `MIGRATIONS` 队列（v1 settings → v2 todos → v3 schedules → v4 projects/board_columns/cards），`user_version` 管理，重开幂等、旧库原地升级只补跑缺失版本
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
- **CSV 台账导出唯一入口**（r5）：`GET /api/projects/:id/export.csv` = UTF-8 BOM（`EF BB BF`）+ CRLF + RFC4180 转义 + 中文表头 9 列，
  每列至少一行（空列占位）；**落盘必须按字节**（fetch 文本解码会剥掉 BOM，Excel 直开会乱码）
- **探针真读库**：`/api/health` 每次真写读一次 settings，不只是进程活着

## 明确不做（当前阶段）

实时汇率 · 视频会议 · 第三方 IM 集成 · 插件市场 · SaaS 多租户计费

## 许可证

[MIT](LICENSE)
