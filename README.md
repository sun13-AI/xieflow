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
pnpm run test:all    # typecheck + e2e（213 断言）+ HTTP 审计（228 断言）
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
  shot.ps1           截图矩阵脚本（headless Edge，字节级可复现）
  start.ps1          一键启动/停止
  pack.js            pack（免安装目录）/ dist（setup zip）
  push-via-api.mjs   GitHub REST API 推送（逐提交 tree 一致性校验）
workflows/           agent 编制表与岗位提示词
docs/
  plan.md            轮次看板与任务单（每轮更新）
  feedback/          研发报告 / 复验报告（VERDICT）/ UI 审查报告
  staff/             agent 员工档案与逐轮履历
  ui/                截图矩阵（逐张对照断言）
.github/workflows/   CI：三平台 verify + tag 触发 Release
```

## 路线图

M0 立项 ✅ → M1 待办+日程 ✅ → M2 项目+看板 → M3 多维表格 → M4 文档 → M5 AI 工作台 → M6 知识库 RAG → M7 导图+白板 → M8 组织管理 → M9 网络版 → M10 多端与单机版

进度看板：[docs/plan.md](docs/plan.md)

## 界面与测试对照

按 AGENTS.md 立项规则：**界面更新必须带截图证据（每次，无例外）**，截图与实现同一提交。逐图索引（r1/r2/r3/r4 矩阵全量、逐张对照断言）：

### r4 矩阵：[docs/ui/r4/](docs/ui/r4/README.md) —— 项目页 + 看板页（M2 第 1 片，共 8 张，04/05 为 seed 分步拍的真实移动前后对照）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-project-empty.png](docs/ui/r4/01-project-empty.png) | 项目页空态（五 tab 壳「项目」激活 + 空态引导） | e2e「迁移与 schema 一致性」；audit「GET /api/projects -> 200」空列表形态 |
| [02-project-list.png](docs/ui/r4/02-project-list.png) | 项目列表钉态（3 个项目卡，有/无描述两形态） | audit「POST 合法项目 -> 201」「项目列表返回数组」 |
| [03-project-modal.png](docs/ui/r4/03-project-modal.png) | 新建项目弹窗（名称 200 字计数 + 可选描述） | audit「POST 空项目名 -> 400」「POST 超长项目名（201 字）-> 400」 |
| [04-board-live.png](docs/ui/r4/04-board-live.png) | 真实链路·移动前（seed 项目三列：To Do 3 / Doing 1 / Done 0，卡 C 带进行中徽标） | audit「PATCH 卡跨列移动 -> 200」前态实证 |
| [05-board-moved.png](docs/ui/r4/05-board-moved.png) | **真实链路·移动后**（两拍间真实 PATCH：卡 A → Doing 第 0 位，两侧列重排） | audit「移动后源列重排：B/C 位置收拢为 0/1」「移动后目标列：卡 A 落 0 位」 |
| [06-board-modal.png](docs/ui/r4/06-board-modal.png) | 新建卡片弹窗（标题 + 关联待办下拉 + 目标列提示） | audit「POST 卡 C（关联真实待办）-> 201」及越权外键 400 分支 |
| [07-board-narrow.png](docs/ui/r4/07-board-narrow.png) | 窄屏 488×900（看板三列纵排，卡 + 徽标在视口内） | 无 UI 形态（CSS 断点，确定性钉态） |
| [08-projects-tab-live.png](docs/ui/r4/08-projects-tab-live.png) | 项目页真实数据路径（消费真实 api） | audit「GET 项目列表 -> 200」端到端实证 |

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

- e2e **213** 项（服务离线口径 213，api 在线时 HTTP 冒烟节 +1）：迁移一致性 7 · settings 9 · todo CRUD 15 · 输入校验 13 · 状态机 10 · 汇总计数 7 · raw schema 4 · 迁移幂等 3 · 日程契约与守卫 28 · 循环实例化 14 · 区间查询装配 12 · v2→v3 迁移+双向联动 18 · schedules CRUD 26 · **看板排序规则（reorderPositions）12 · 看板名称守卫 6 · v3→v4 迁移+看板数据层 29**
- HTTP audit **228** 项（服务就绪 1 · health/settings 5 · todo 新建 12 · 列表详情 7 · 状态流转 9 · summary 11 · 删除 6 · 未知路由 1 · schedules CRUD 36 · 双向联动 22 · 循环实例 over HTTP 23 · **projects CRUD 20 · board columns CRUD 20 · cards CRUD + 跨列移动 50** · schedules 删除 5）
- typecheck 4 包全绿（strict + noUncheckedIndexedAccess）
- CI：ubuntu / windows / macos 三平台 verify 门禁 + tag 触发 Release

### 核心概念（r4 已落地的部分）

- **迁移纪律**：schema 变更只走 `packages/db/src/schema.ts` 的 `MIGRATIONS` 队列（v1 settings → v2 todos → v3 schedules → v4 projects/board_columns/cards），`user_version` 管理，重开幂等、旧库原地升级只补跑缺失版本
- **状态机集中**：待办状态流转（open/done/archived）定义在 `packages/shared`，非法流转服务层与路由层双层拒绝
- **汇总计数唯一入口**：今/明/周 + 四象限计数只写在 `computeTodoSummary`（shared 纯函数），api 下发、UI 消费同一口径
- **循环实例化唯一入口**：daily/weekly/monthly 展开规则只写在 `computeRepeatInstances`（shared 纯函数，含月末收敛与实例封顶）；区间查询装配只写在 `assembleRangeSchedules`
- **看板重排唯一入口**：卡片 position 重排只写在 `reorderPositions`（shared 纯函数）；跨列移动经 `moveBoardCard` 保证源列与目标列 position 连续，跨项目移动拒绝
- **双向联动闭环**：待办设 `due_date` → 自动生成关联日程；日程改期 → 回写待办；待办清空 → 关联日程删除；待办删除 → 日程级联删除
- **看板徽标复用 r3 联动模式**：卡片 `todo_id` 可空关联待办，UI 按 todoId 查状态渲染「进行中/已完成/已归档」徽标
- **探针真读库**：`/api/health` 每次真写读一次 settings，不只是进程活着

## 明确不做（当前阶段）

实时汇率 · 视频会议 · 第三方 IM 集成 · 插件市场 · SaaS 多租户计费

## 许可证

[MIT](LICENSE)
