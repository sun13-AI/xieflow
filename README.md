# 协流 XieFlow — AI 原生协同办公系统

> Agent 自驱迭代的协同办公平台：待办 / 日程 / 项目 / 看板 / 多维表格 / 文档 / AI 工作台 / 知识库 / 导图 / 白板 / 审批 / 物资 / 单位任务。
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
pnpm run test:all    # typecheck + e2e（2096 断言）+ HTTP 审计（1723 断言）
```

### 打包（对齐 IKanBot 的 pack/dist 语义）

```bash
pnpm run pack        # 免安装目录 release/xieflow-portable/（进目录双击 start.cmd 即用）
pnpm run dist        # 上述 + 安装包 release/xieflow-setup-<版本>.zip（解压即用）
```

- 免安装目录：内置 web 静态产物 + api 源码 + 运行时依赖，单端口 8080（web+api 同源），数据落在目录内 `data/`
- 安装包 = 免安装目录的 zip；安装语义 = 解压到任意位置 → 双击 `start.cmd`（要求 Node.js ≥ 20）
- r21 增强：`start.sh`（Linux/macOS）+ 首次运行引导（README.txt「双击 start.cmd → 打开 8080」）+ 数据目录自检（首启建 `data/` 并验证可写）

### 部署（r21 · M10 收官：三条路径）

- 网络版（cloud，已上线，remote）· 私有化（`docker/`：多阶段 Dockerfile + docker-compose.yml + 数据卷，XIEFLOW_MODE=remote）· 一体化单机版（portable 目录，local）
- 完整三路径 + 备份/恢复/搬迁四步 + FAQ 见 [docs/DEPLOY.md](docs/DEPLOY.md)；部署自检 `pwsh scripts/verify-deploy.ps1`（起服务 → health 200 → 关键路由 → 收净，headless）

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
  web/               React + Vite 界面（工作台 / 待办四象限 / 日程月视图 / 项目 / 看板 / 多维表格网格 / 文档块编辑器 / AI 工作台 / 知识库 / 导图 / 白板画布 / 审批流 / 物资台账 / 单位任务）
  api/               Fastify 服务（health / settings / todos / schedules / projects / board / tables+fields+records / views / CSV import / documents / conversations+chat+artifacts / knowledge / mindmaps / whiteboards / approvals / assets+transactions / unit-tasks）
scripts/
  e2e-test.ts        直连服务层断言
  audit-http.ts      HTTP 路由层审计（含 4xx 分支）
  shot.ps1           截图矩阵脚本（headless Edge，字节级可复现；r4 起含壳基线自动拍摄，r5 起防挂死捕获）
  shot-rework.ps1    r4 返工 #1 全路径证据拍摄（17/18/19）
  shot-r18-rework.ps1 r18 返工 #1 浏览器入口/401 清态证据拍摄（01–09 + shell/14；headless，scratch 自清）
  start.ps1          一键启动/停止
  pack.js            pack（免安装目录）/ dist（setup zip）
  verify-deploy.ps1  r21 部署自检（起服务 → health 200 → 关键路由 → 收净，headless）
  push-via-api.mjs   GitHub REST API 推送（逐提交 tree 一致性校验）
docker/              r21 私有化部署：多阶段 Dockerfile + docker-compose.yml + serve.mjs + .dockerignore
workflows/           agent 编制表与岗位提示词
docs/
  plan.md            轮次看板与任务单（每轮更新）
  DEPLOY.md          r21 部署指南：三路径 + 备份/恢复/搬迁四步 + FAQ
  feedback/          研发报告 / 复验报告（VERDICT）/ UI 审查报告
  staff/             agent 员工档案与逐轮履历
  ui/                截图矩阵（逐张对照断言；shell/ 为十五 tab 壳基线）
.github/workflows/   CI：三平台 verify + tag 触发 Release
```

## 路线图

M0 立项 ✅ → M1 待办+日程 ✅ → M2 项目+看板 ✅ → M3 多维表格 ✅ → M4 文档 ✅ → M5 AI 工作台 ✅ → M6 知识库 RAG ✅ → M7 导图+白板 ✅ → M8 组织管理 ✅ → M9 网络版 ✅ → M10 多端与单机版 ✅（r21 收官：私有化 docker-compose + 一体化单机版）——**设计总纲 11 个里程碑全部达成**

进度看板：[docs/plan.md](docs/plan.md)

## 界面与测试对照

按 AGENTS.md 立项规则：**界面更新必须带截图证据（每次，无例外）**，截图与实现同一提交。逐图索引（r1/r2/r3/r4/r5/r6/r7/r8/r9/r10/r11/r12/r13/r14/r15/r16/r17/r18/r19/r19-rework1/r20/r21/r22/r23/r24/r25 矩阵全量、逐张对照断言）：

### r25 矩阵：[docs/ui/r25/](docs/ui/r25/README.md) —— 第三轮遗留清理（共 7 张；改渲染层 → 十五 tab 壳基线同批重拍）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-approval-actor-badge.png](docs/ui/r25/01-approval-actor-badge.png) | 审批时间线提交/转交/通过三步各带「姓名（部门）」操作人徽标，通过态零出边 | audit「r25 提交/通过步骤 actor_member_id 真落库 + 摘要回带」 |
| [02-picker-dept-filter.png](docs/ui/r25/02-picker-dept-filter.png) | 选人弹窗加「部门筛选」下拉 + 搜索框 + 候选卡，自由文本输入框在场 | e2e「r25 选人弹窗部门筛选 seam 在场」 |
| [03-badge-named.png](docs/ui/r25/03-badge-named.png) | 回填徽标「李娜（市场部）」+ × 解除关联，无 `member_id` 裸号 | e2e「r25 回填徽标去除 member_id 裸号」 |
| [04-manual-hint.png](docs/ui/r25/04-manual-hint.png) | 手改姓名后徽标仍为通讯录姓名，提示「手改仅作备忘，提交以通讯录为准」 | e2e「r25 回填后手改语义提示 seam 在场」 |
| [05-assets-detail-badge.png](docs/ui/r25/05-assets-detail-badge.png) | 物资**详情**区显示保管人「赵敏（行政部）」徽标（补 r24/05 详情证据） | audit「物资摘要回带部门名」 |
| [06-narrow.png](docs/ui/r25/06-narrow.png) | 488px `?narrow=1`：弹窗单列 + 部门筛选 + 底栏「更多 ›」 | `force-narrow` seam；逐张目验 |
| [07-error.png](docs/ui/r25/07-error.png) | r25 动作链路语义化连接失败 + 重试按钮（与 r24/07 不同字节） | `approval-r25-error` PINNED 钉态 |
| [shell/](docs/ui/shell/README.md) | 十五 tab 壳基线同批重拍（与 r23 八张同字节、与 r24 十一张同字节；15/15 互异，不伪造差异） | e2e「r25 shell README R25 哈希与实际文件逐字一致」 |

### r24 矩阵：[docs/ui/r24/](docs/ui/r24/README.md) —— 通讯录成员接入审批/物资（共 7 张；改渲染层 → 十五 tab 壳基线同批重拍）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-approval-picker.png](docs/ui/r24/01-approval-picker.png) | 审批表单选人弹窗（搜索框 + 两名成员 + 原自由文本输入框在场） | e2e「r24 选人弹窗 seam」 |
| [02-approval-picked.png](docs/ui/r24/02-approval-picked.png) | 选中后审批人输入框回填姓名 + 部门徽标 + 可清除 | e2e「r24 选中后回填 seam」 |
| [03-timeline-badge.png](docs/ui/r24/03-timeline-badge.png) | 审批时间线两步各带部门徽标（研发中心/市场部） | e2e/audit「步骤 member 摘要」 |
| [04-assets-picker.png](docs/ui/r24/04-assets-picker.png) | 物资建账表单保管员选人弹窗（原保管人输入框仍在） | e2e「r24 物资选人 seam」 |
| [05-assets-badge.png](docs/ui/r24/05-assets-badge.png) | 物资卡片渲染部门徽标（行政部；详情态证据见 r25/05） | audit「物资摘要回带部门名」 |
| [06-narrow.png](docs/ui/r24/06-narrow.png) | 488px `?narrow=1`：弹窗单列 + 底栏「更多 ›」 | e2e「r24 窄屏 seam」 |
| [07-error.png](docs/ui/r24/07-error.png) | 连接失败错误态 + 重试按钮 | e2e「r24 错误态 seam」 |
| [shell/](docs/ui/shell/README.md) | 十五 tab 壳基线同批重拍（审批壳可见申请人选人入口；物资入口在新建表单内，见 r24/04；15/15 互异） | e2e「r25 shell README R25 哈希与实际文件逐字一致」 |

### r23 矩阵：[docs/ui/r23/](docs/ui/r23/README.md) —— 组织架构与通讯录（共 7 张；新增「组织」tab → 十五 tab 壳基线同批重拍，与 r22 逐位全异）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-org-empty.png](docs/ui/r23/01-org-empty.png) | 组织目录空态：部门树空态 + 人员空态 + 新建部门/人员按钮在场 | e2e「r23 组织页空态 seam」；audit「GET /api/org/tree -> 200 且空」 |
| [02-org-tree.png](docs/ui/r23/02-org-tree.png) | 三级部门树全部展开（集团总部→研发中心→前端组/后端组，市场部同级）+ 人员卡片 | e2e「r23 buildDepartmentTree 三级层级 / 环检测 / 孤儿」 |
| [03-org-members.png](docs/ui/r23/03-org-members.png) | 人员卡片列表：姓名/状态/职位/部门/角色/邮箱/电话 + 编辑删除 | e2e「r23 人员卡片 seam」；audit「按部门查询人员」 |
| [04-org-form.png](docs/ui/r23/04-org-form.png) | 新建人员表单弹窗：名称/邮箱/部门/角色/职位/电话/状态 | e2e「r23 表单 seam」；audit「非法邮箱 / 越权 id -> 400」 |
| [05-org-search.png](docs/ui/r23/05-org-search.png) | 搜索框 `engineer` 命中 3 张职位含 Engineer 的卡片（大小写不敏感） | e2e/audit「姓名·邮箱·职位大小写不敏感搜索」 |
| [06-narrow.png](docs/ui/r23/06-narrow.png) | 488px `?narrow=1`：两栏折单列、部门树在人员上方、底栏「更多 ›」在场 | e2e「r23 窄屏 seam」；r22 更多机制继承 |
| [07-error.png](docs/ui/r23/07-error.png) | 服务不可用错误态 + 重试按钮，r23 徽章在场 | e2e「r23 错误态 seam」 |
| [shell/](docs/ui/shell/README.md) | 十五 tab 壳基线同批重拍（新增 `org-tab-active.png`，r23 徽章 + 十五药丸；15/15 互异，与 r22 逐位全异） | App.tsx 渲染层变更同轮证据；e2e「r23 shell README 15 张哈希与实际文件逐字一致」 |

### r22 矩阵：[docs/ui/r22/](docs/ui/r22/README.md) —— M10 后遗留清理与质量收敛（共 3 张；改渲染层 → 十四 tab 壳基线同批重拍，与 r21 逐位全异）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-mobile-390-more.png](docs/ui/r22/01-mobile-390-more.png) | 真 390×844 CDP device metrics：底栏右侧渐隐遮罩 + 「更多 ›」入口，收起态仍可见前若干 tab + 顶部 ☰ | e2e「r22 更多按钮在菜单未展开时可见（seam 契约）」「r22 底栏右侧渐隐遮罩在场 / data-state seam」 |
| [02-mobile-390-nav-open.png](docs/ui/r22/02-mobile-390-nav-open.png) | 真 390×844：点「更多」/☰ 后展开 2 列网格，后 6~7 枚 tab 有第二条可见路径，「更多」入口自动隐藏 | e2e「r22 更多按钮在菜单展开时隐藏（seam 契约）」「r22 菜单展开时隐藏更多按钮」；`?nav=open` 钉态 |
| [03-narrow-docs-more.png](docs/ui/r22/03-narrow-docs-more.png) | 488px `?narrow=1&page=docs` 受影响页面矩阵：文档页单列 + 底栏「更多」入口在场（窄屏 seam 确定性钉态） | r1~r21 窄屏 seam；e2e「r22 更多按钮显隐纯函数接到 DOM seam」 |
| [shell/](docs/ui/shell/README.md) | 十四 tab 壳基线同批重拍（r22 徽章「遗留清理与质量收敛（M10 后）」+ 更多入口 DOM seam + 顶栏状态区；14/14 互异，与 r21 逐位全异） | App.tsx 渲染层变更同轮证据；e2e「r22 shell README 14 张哈希与实际文件逐字一致」 |

### r21 矩阵：[docs/ui/r21/](docs/ui/r21/README.md) —— 私有化部署与一体化单机版（M10 收官，共 6 张；本轮未改渲染层，故无新 tab / 无十四 tab 壳基线重拍；01–04 为真实捕获数据的文本渲染，05–06 为真实 8080 部署的 headless 截图）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-docker-topology.png](docs/ui/r21/01-docker-topology.png) | Docker 部署拓扑（Browser → app :8080 → api child :8787 → SQLite → named volume；XIEFLOW_MODE=remote + health 探针） | e2e「r21 Dockerfile 多阶段 / compose 解析 / XIEFLOW_MODE=remote / 8080:8080 / data 卷 / healthcheck」 |
| [02-startcmd-first-run.png](docs/ui/r21/02-startcmd-first-run.png) | start.cmd 首启（FIRST RUN 引导 + data 自检 + 8080 ready + health 200） | pack → start.cmd 真 boot（web 200 / api health 200 / schema 15）；e2e「首启引导四要素 / 数据目录自检」 |
| [03-portable-tree.png](docs/ui/r21/03-portable-tree.png) | portable 目录结构（start.cmd + 新增 start.sh + README.txt + data/ + portable-serve.mjs） | e2e「pack.js 生成 start.sh / POSIX shebang / 引导四要素」 |
| [04-readme-guide.png](docs/ui/r21/04-readme-guide.png) | README.txt 首启引导（双击 start.cmd → 打开 8080 → 数据落 ./data/） | e2e「README.txt 写清双击 start.cmd → 打开 8080 / 引导四要素」 |
| [05-8080-home.png](docs/ui/r21/05-8080-home.png) | 真实 8080 首页（1280×900，工作台 + 服务模式 + 多端同步卡 + 在线绿点） | portable boot `GET / -> 200`；e2e/audit「契约健康路径 200 / 模式探针 200」的可观察形态 |
| [06-narrow-488.png](docs/ui/r21/06-narrow-488.png) | 真实 488px 窄屏（`?narrow=1`）：☰ 汉堡 + 底部导航 + 单列卡片 + 无横向溢出 | r1~r20 窄屏 seam；e2e「≤600px / 44px / overflow-x hidden」（本轮未改渲染层） |

### r20 矩阵：[docs/ui/r20/](docs/ui/r20/README.md) —— 离线模式与 PWA（M10 起步，共 7 张；无新 tab，顶栏状态区与 ≤600px 底部导航只是布局变化；十四 tab 壳基线同批重拍）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-manifest-install.png](docs/ui/r20/01-manifest-install.png) | PWA 安装提示（在线绿点 + 离线缓存就绪 + 可安装为应用） | `?shot=pwa-install`；e2e「manifest standalone / 本地图标 / 零 CDN」 |
| [02-sw-registered.png](docs/ui/r20/02-sw-registered.png) | SW 注册成功（离线缓存已就绪） | `?shot=sw-ready`；e2e「cache-first / network-first / 离线 fallback / no-sw=1 测试开关」 |
| [03-net-online.png](docs/ui/r20/03-net-online.png) | 在线态（绿点 + 队列 0 + 立即同步 + 14 药丸） | `?shot=net-online`；e2e「顶栏圆点/徽标/同步按钮在场」 |
| [04-net-offline-queue.png](docs/ui/r20/04-net-offline-queue.png) | 离线态 + 队列徽标 3（红点 + 入队提示） | `?shot=offline-queue`；e2e「shouldQueueOffline / 202 语义响应」；audit 真 HTTP 重放 |
| [05-replay-success.png](docs/ui/r20/05-replay-success.png) | 重放成功（绿条 + 队列归 0） | `?shot=replay-success`；audit「按序重放 / 清理后回基线」 |
| [06-mobile-390.png](docs/ui/r20/06-mobile-390.png) | 真 390×844（CDP device metrics）：汉堡 + 底部导航 + 单列 + 零横向溢出 | CDP 实测 `scrollWidth=clientWidth=390`；e2e「<=600px / 44px / overflow-x hidden」 |
| [07-net-error.png](docs/ui/r20/07-net-error.png) | 错误态（红条重放冲突 409 + 队列 2） | `?shot=offline-error`；audit「409 conflictIndex=1 / 零半态」 |
| [shell/](docs/ui/shell/README.md) | 十四 tab 壳基线同批重拍（r20 徽章 + 顶栏状态区 + M10 起步） | App.tsx 渲染层变更同轮证据 |

### r19 返工 #1 矩阵：[docs/ui/r19-rework1/](docs/ui/r19-rework1/README.md) —— status 最新变更修复 + 同步卡 U2 低成本修复（7 张 + 14 张 shell；原 r19 矩阵字节未动）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-sync-idle.png](docs/ui/r19-rework1/01-sync-idle.png) | 同步卡空闲（最近同步 + 未同步 0 + 无冲突） | `?shot=sync-idle`；audit「status 回带最后变更 id/时间（精确=最新一条）」 |
| [02-sync-pending.png](docs/ui/r19-rework1/02-sync-pending.png) | 有未同步（未同步 3 条 + 实体版本数） | `?shot=sync-pending`；audit「增量拉取 -> 200」 |
| [03-sync-conflicts.png](docs/ui/r19-rework1/03-sync-conflicts.png) | 冲突列表（实体键 + 冲突字段 + 查看差异按钮） | `?shot=sync-conflicts`；audit「409 冲突字段列表=[title]」 |
| [04-sync-modal.png](docs/ui/r19-rework1/04-sync-modal.png) | 冲突弹窗（diff 表 + **后果提示黄条** + `title` 两版核心文案不同 + 三按钮，`稍后处理` 弱化） | `?shot=sync-modal`；e2e「返工#1 选边后果提示前置 / 稍后处理弱化 / title 两版核心文案不同」 |
| [05-sync-success.png](docs/ui/r19-rework1/05-sync-success.png) | 同步成功后（成功条 + 冲突清零） | `?shot=sync-success`；audit「选边后写入版本=3」 |
| [06-sync-narrow.png](docs/ui/r19-rework1/06-sync-narrow.png) | 窄屏 488×900（同步卡与按钮纵排不裁切） | `?shot=sync-pending&narrow=1`；无独立数字断言（CSS 断点钉态） |
| [07-sync-error.png](docs/ui/r19-rework1/07-sync-error.png) | 错误态（红条同步失败提示） | `?shot=sync-error`；无独立断言（钉态，真实 4xx 由 audit 锁定） |

### r19 矩阵：[docs/ui/r19/](docs/ui/r19/README.md) —— 多端同步与冲突处理（M9 收官，共 7 张；同步卡在工作台设置区内，不新增 tab；十四 tab 壳基线同批重拍）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-sync-idle.png](docs/ui/r19/01-sync-idle.png) | 同步卡空闲（最近同步时间 + 未同步 0 + 无冲突） | `?shot=sync-idle`；audit「GET /api/sync/status -> 200」 |
| [02-sync-pending.png](docs/ui/r19/02-sync-pending.png) | 有未同步（未同步 3 条 + 实体版本数） | `?shot=sync-pending`；audit「增量拉取 -> 200」 |
| [03-sync-conflicts.png](docs/ui/r19/03-sync-conflicts.png) | 冲突列表（实体键 + 冲突字段 + 查看差异按钮） | `?shot=sync-conflicts`；audit「409 冲突字段列表=[title]」 |
| [04-sync-modal.png](docs/ui/r19/04-sync-modal.png) | 冲突弹窗（本地 vs 远端 diff 表 + 保留本地/保留远端） | `?shot=sync-modal`；e2e「冲突弹窗提供本地/远端两个选边按钮」 |
| [05-sync-success.png](docs/ui/r19/05-sync-success.png) | 同步成功后（成功条 + 冲突清零） | `?shot=sync-success`；audit「选边后写入版本=3」 |
| [06-sync-narrow.png](docs/ui/r19/06-sync-narrow.png) | 窄屏 488×900（同步卡与按钮纵排不裁切） | `?shot=sync-pending&narrow=1`；无独立数字断言（CSS 断点钉态） |
| [07-sync-error.png](docs/ui/r19/07-sync-error.png) | 错误态（红条同步失败提示） | `?shot=sync-error`；无独立断言（钉态，真实 4xx 由 audit 锁定） |
| [shell/](docs/ui/shell/README.md) | 十四 tab 壳基线同批重拍（r19 徽章 + 同步卡 + schema v15 + M9 收官） | App.tsx 渲染层变更同轮证据 |

### r18 返工 #1 矩阵：[docs/ui/r18-rework1/](docs/ui/r18-rework1/README.md) —— 业务请求统一 apiFetch + 401 返回路径（9 张 + 十四 tab 壳基线同批重拍；09 为真实 401 跳转图）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-login.png](docs/ui/r18-rework1/01-login.png) | 登录页（密码框写明 8–200 位规则） | 钉态 `?page=login&shot=login`；e2e「remote 带 token -> 200 / 无 token 不附 Bearer」 |
| [02-register.png](docs/ui/r18-rework1/02-register.png) | 注册页（U2-1：新增密码规则/强度即时提示） | `?page=register&shot=register`；UI 记账项可见证据 |
| [03-login-error.png](docs/ui/r18-rework1/03-login-error.png) | 错误态（红条 401 错密码） | `?page=login&shot=login-error`；audit「r18 错误密码登录 -> 401」 |
| [04-401-redirect.png](docs/ui/r18-rework1/04-401-redirect.png) | 401 跳登录钉态（红条含「登录后从工作台继续」返回路径） | `?page=login&reason=401`；e2e「401 清 token + 跳 login reason=401」 |
| [05-after-logout.png](docs/ui/r18-rework1/05-after-logout.png) | 登出后（淡红条 + 登录按钮回位） | `?page=login&reason=logout`；audit「r18 登出真删会话」 |
| [06-settings-mode.png](docs/ui/r18-rework1/06-settings-mode.png) | 模式卡（U2-2：数据归属说明 + 当前/偏好释义 + 黄色后果提示） | `?shot=mode-settings`；audit remote 401 / local 200 |
| [07-narrow.png](docs/ui/r18-rework1/07-narrow.png) | 窄屏 488×900 登录卡完整 | 无独立数字断言（CSS 断点钉态，逐张目验） |
| [08-logged-in.png](docs/ui/r18-rework1/08-logged-in.png) | 已登录顶栏（14 药丸 + 退出登录 + 数据归属说明） | `?shot=ready&auth=in`；audit「r18 真 token -> 200」 |
| [09-401-real.png](docs/ui/r18-rework1/09-401-real.png) | **真实 401 跳转**（假 token 打业务路由 → 401 → 清 token → 跳 login reason=401） | headless CDP：URL + localStorage=null + 请求带 Bearer/响应 cleared 头 + e2e 4 条 401 断言 |
| [shell/](docs/ui/r18-rework1/README.md) | 十四 tab 壳基线同批重拍（14 张，14/14 互异） | App.tsx 渲染层变更同轮证据 |

### r18 矩阵：[docs/ui/r18/](docs/ui/r18/README.md) —— 账号与网络版服务（M9 起步，共 8 张；十四 tab 壳基线同批重拍；认证页为独立路由不占 tab）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-login.png](docs/ui/r18/01-login.png) | **登录页**（独立路由；用户名/密码两真输入 + 登录按钮 + 注册/工作台入口 + r18 徽章） | 钉态 `?page=login&shot=login`；audit「r18 管理员登录 -> 200」 |
| [02-register.png](docs/ui/r18/02-register.png) | **注册页**（独立路由；两真输入 + 注册按钮 + 「首个账号自动成为管理员」说明） | `?page=register&shot=register`；audit「r18 注册首个用户 -> 201」「重复用户名 -> 409」 |
| [03-login-error.png](docs/ui/r18/03-login-error.png) | **错误态**（红条「用户名或密码错误（HTTP 401）—请检查账号与密码后重试」） | `?page=login&shot=login-error`；audit「r18 错误密码登录 -> 401」 |
| [04-401-redirect.png](docs/ui/r18/04-401-redirect.png) | **401 跳登录**（红条「登录态已失效（HTTP 401），本地假登录态已清除，请重新登录。」） | `?page=login&reason=401`；audit「r18 401 响应体 cleared=true」「401 响应头 X-Xieflow-Auth-Cleared=1」 |
| [05-after-logout.png](docs/ui/r18/05-after-logout.png) | **登出后**（红条「已退出登录，会话 token 已清除。」，顶栏登录按钮回位） | `?page=login&reason=logout`；audit「r18 全链路② 登出 -> 200」「登出真删会话」 |
| [06-settings-mode.png](docs/ui/r18/06-settings-mode.png) | **设置区模式卡**（工作台「本机/远端」两按钮，本机蓝实心 + 黄色后果提示 + schema v14 + M9 里程碑） | `?shot=mode-settings`；audit「r18 管理员切 remote -> 200」「remote 业务路由 401 / local 200」 |
| [07-narrow.png](docs/ui/r18/07-narrow.png) | 窄屏 488×900（`?narrow=1`）：登录卡完整、徽章换行不裁切、两输入与按钮纵排 | 无独立数字断言（CSS 断点钉态，逐张目验） |
| [08-logged-in.png](docs/ui/r18/08-logged-in.png) | **已登录顶栏**（工作台 14 药丸 + 右上「退出登录」按钮 + schema v14） | `?shot=ready&auth=in`；audit「r18 真 token 访问受保护路由 -> 200」 |

### r17 矩阵：[docs/ui/r17/](docs/ui/r17/README.md) —— 物资台账与单位任务流转（M8 收官，共 8 张；十四 tab 壳基线同批重拍，seed 实 id 物资 #1 / 任务 #1·#2）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-assets-empty.png](docs/ui/r17/01-assets-empty.png) | **物资空态**（十四 tab 壳「物资」激活 + 「这里还没有物资——点『＋ 新建物资』开始建账」+ 首次使用空态钉注；右栏「未选择物资」引导在场，真实 0 条） | e2e「新库物资列表为空」；audit「r17 清理后物资归零」；`?shot=assets-empty` |
| [02-assets-form.png](docs/ui/r17/02-assets-form.png) | **建账表单**：物资名称 / 分类（五种）/ 初始库存 / 单位 / 位置 / 保管人六真输入 + 「确认建账」按钮；钉注写明落 assets 表 | audit「r17 POST 物资 -> 201」「r17 POST 物资名回读」；e2e「建账初始库存 5」；`?shot=assets-form` |
| [03-assets-ledger.png](docs/ui/r17/03-assets-ledger.png) | **真实链路·台账有数据**：真物资 #1，库存 5 台 / 分类设备器材 / 存放仓库A / 保管人张三；左栏列表 + 右栏详情 + 出入库表单 + 空流水引导 | audit「r17 GET 物资详情 -> 200」「r17 建账初始库存 5」；e2e「两笔物资真落库」 |
| [04-tx-timeline.png](docs/ui/r17/04-tx-timeline.png) | **流水时间线**：03→04 间真发入库 3 + 出库 2，库存 5→8→6；时间线两条「出库 / 入库」徽章 + 数量 + 操作人 + 来源→目标 + 逐字时间戳 | audit「r17 入库真落库 5→8」「r17 出库真落库 8→6」；e2e「入库后库存真回写」 |
| [05-unit-tasks-tree.png](docs/ui/r17/05-unit-tasks-tree.png) | **单位任务树**：十四 tab 壳「单位任务」激活；真任务 #1→子任务 #2 两层层级（`└` 缩进可见）、状态标签「待启动」、每行四个流转按钮 | audit「r17 GET 任务树 -> 200」「r17 树子节点 id 正确」；e2e「数据层任务树层级正确」；`?shot=tasks-tree` |
| [06-task-transitioned.png](docs/ui/r17/06-task-transitioned.png) | **流转后**：05→06 间真发 `in_progress` + `done` 两次流转，子任务 #2 标签变「已完成」（绿色），选中详情面板显示终态后果提示 | audit「r17 流转到 done」「r17 终态回退 -> 400」；e2e「in_progress→done 合法」「终态不可回退」 |
| [07-narrow.png](docs/ui/r17/07-narrow.png) | 窄屏 488×1100（`?narrow=1`）：**十四药丸单行不折行**（第十三枚物资 + 第十四枚单位任务完整可见，r17 收窄至 7px/2px）、徽章独占下一行；物资列表 / 详情纵排 | 无独立数字断言（CSS 断点，确定性钉态，逐张目验；十四 tab 壳基线同批重拍） |
| [08-error.png](docs/ui/r17/08-error.png) | 错误态（语义化文案「服务未启动或网络异常，请稍后重试」+ 十四 tab 壳「物资」激活，钉态） | 无独立断言（4xx 由 audit r17 节锁定）；`?shot=assets-error` |

### r16 矩阵：[docs/ui/r16/](docs/ui/r16/README.md) —— 审批流引擎（M8 起步，共 7 张；十二 tab 壳基线同批重拍，seed 实 id #5/#6）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-approval-empty.png](docs/ui/r16/01-approval-empty.png) | **审批空态**（十二 tab 壳「审批」激活 + 「这里还没有审批——点『＋ 新建审批』发起第一单」+ 首次使用钉注；三视角切换与当前身份框在场，真实 0 条） | e2e「新库审批列表为空」；audit「r16 清理后审批归零」；`?shot=approval-empty` |
| [02-approval-form.png](docs/ui/r16/02-approval-form.png) | **发起表单**：标题 / 类型（请假·报销·采购·其它）/ 审批人 / 抄送人四个真输入 + 「确认发起」主按钮；钉注写明落 approvals 与 approval_cc 两表 | audit「r16 POST 审批 -> 201」「r16 抄送人真落库回读」；e2e「createApproval 抄送人真落库」；`?shot=approval-form` |
| [03-todo-list.png](docs/ui/r16/03-todo-list.png) | **真实链路·待办列表**：身份 bob，02→03 间真发 `POST /api/approvals/5/submit`，两条待审 (#6 报销 / #5 请假) 由 `GET /api/approvals/view?view=todo` 真读回；#6 详情已显「提交」一步 + 抄送提示 erin | audit「r16 submit 真流转到 pending」「r16 待办只数 pending 且 assignee 是我」；e2e「db 我的待办：pending 且 assignee 是我」 |
| [04-detail-timeline.png](docs/ui/r16/04-detail-timeline.png) | **详情时间线**：真审批 #6，03→04 间真发 `POST /api/approvals/6/delegate`（bob→carol），状态仍「待审批」但当前审批人变 carol；时间线 `提交 → 转交` 两步，动作用中文标签、意见逐字可读 | audit「r16 delegate 不改状态（真 HTTP 读回）」「r16 delegate 真换 assignee」「r16 步骤 order 连号」；e2e「delegate 真换 assignee」 |
| [05-approved.png](docs/ui/r16/05-approved.png) | **审批通过态**：04→05 间真发 `POST /api/approvals/6/approve`（carol），状态「已通过」、时间线三步 `提交→转交→通过`、操作区显示「当前身份在此单上无可用操作（终态）」 | audit「r16 approve 真流转到 approved」「r16 已通过再审批 -> 400」；e2e「已结单再审批抛错」 |
| [06-narrow.png](docs/ui/r16/06-narrow.png) | 窄屏 488×1100（`?narrow=1`）：**十二药丸单行不折行**（第十一枚白板 + 第十二枚审批均完整可见）、徽章独占下一行；身份框 / 三视角 / 列表 / 详情时间线纵排 | 无独立数字断言（CSS 断点，确定性钉态，逐张目验；十二 tab 壳基线同批重拍） |
| [07-error.png](docs/ui/r16/07-error.png) | 错误态（语义化文案 + 操作提示 + 「重试」按钮，钉态） | 无独立断言（4xx 由 audit r16 节锁定）；`?shot=approval-error` |

### r15 矩阵：[docs/ui/r15/](docs/ui/r15/README.md) —— 白板画布与 AI 建板（M7 收官，共 7 张 + 1 份真实导出 .md；返工 #1 同批重拍，seed 实 id #8/#9）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-whiteboard-empty.png](docs/ui/r15/01-whiteboard-empty.png) | **白板空态**（十一 tab 壳「白板」激活 + 「还没有白板——点『＋ 新建』开始画第一张便签」+ 首次使用钉注；真实 0 张白板；底部状态条有「拖动画布可平移」提示） | e2e「新库白板列表为空」「createWhiteboard 返回自增 id」；audit「r15 POST 白板 -> 201」 |
| [02-board-notes.png](docs/ui/r15/02-board-notes.png) | **真实链路·画布有便签**（真 seed 白板 **#8**，3 张便签 note #39~#41：产品方向 / 本周任务 / 风险与依赖；侧栏 #9·7 条 / #8·3 条逐板独立） | audit「r15 返工列表 itemCount 为该板真实条目数」「r15 POST 便签 -> 201」；e2e「白板列表 itemCount 逐板独立」 |
| [03-after-drag.png](docs/ui/r15/03-after-drag.png) | **拖拽后**（02→03 间真发 `POST /api/whiteboards/8/items/move`，第一张便签落到 (120, 300)；侧栏计数不变） | audit「r15 批量移动真落库（不是临时态）」；e2e「批量移动后重叠条目被避让下移」 |
| [04-ai-created.png](docs/ui/r15/04-ai-created.png) | **AI 建板结果**（真 seed 白板 **#9** 经 `POST /ai-create` 按「季度复盘」生成 7 张 note #42~#48，配色/内容各异且互不重叠；第 7 张底沿被画布下沿裁切，状态条给出平移提示） | audit「r15 AI 建板真生成 5-8 便签」「r15 返工 AI 建板后全量画布（含既有条目）两两无重叠」；e2e「AI 建板后全量画布两两无重叠」 |
| [05-export.png](docs/ui/r15/05-export.png) | **导出佐证**（同真实白板 #8，GET /:id/export.md 由 shared 装配并显示「已导出 Markdown（220 字符）」提示） | audit「r15 导出 Markdown 含真实条目内容」「r15 导出 content-type 为 text/markdown」；e2e「导出 Markdown 按 y 坐标排序」 |
| [06-narrow.png](docs/ui/r15/06-narrow.png) | 窄屏 488×1100（`?narrow=1`）：**十一药丸单行不折行**、徽章独占下一行；侧栏 / 工具条 / 画布纵排；**note #40 右沿被画布裁切、#41 在视口外**，底部状态条明示「拖动画布可平移查看视口外便签 · 滚轮 / ± 缩放」（不再称「无裁切」） | 无独立数字断言（CSS 断点，确定性钉态，逐张目验；十一 tab 壳基线同批重拍） |
| [07-error.png](docs/ui/r15/07-error.png) | 错误态（语义化文案 + 操作提示 + 「重试」按钮，钉态） | 无独立断言（4xx 由 audit r15 节锁定） |
| [whiteboard-export.md](docs/ui/r15/whiteboard-export.md) | **落盘字节证据**（真 `GET /api/whiteboards/8/export.md` 原样落盘，H1 + 坐标/尺寸/颜色 + 便签内容） | audit「r15 导出 Markdown 以白板标题为 H1」「r15 导出 Markdown 含真实条目内容」 |

### r14 矩阵：[docs/ui/r14/](docs/ui/r14/README.md) —— 思维导图 Markdown 双视图（M7 起步，共 6 张）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-mindmap-empty.png](docs/ui/r14/01-mindmap-empty.png) | **导图空态**（十 tab 壳「导图」激活 + 「还没有导图——点『＋ 新建』开始写第一段 Markdown」+ 首次使用钉注；真实 0 张导图） | e2e「新库导图列表为空」「建导图允许空 Markdown（不是死路）」；audit「r14 POST 空内容建导图 -> 201」 |
| [02-markdown-edit.png](docs/ui/r14/02-markdown-edit.png) | **真实链路·Markdown 编辑态**（真 seed 导图 #1，58 字节源：标题/二级标题/无序/有序/缩进列表；右栏同源解析 6 节点） | audit「r14 POST Markdown 源逐字节读回」「r14 树解析：列表→子节点」；e2e「md→tree→md 逐字节相等」 |
| [03-tree-view.png](docs/ui/r14/03-tree-view.png) | **真实链路·树视图**（同一真导图，heading/bullet/numbered 节点 + 确定性 id n0/n0.0/n0.0.0.0 + 层级连线可点箭头） | audit「r14 GET /:id/tree -> 200」「r14 HTTP 树 → Markdown 逐字节等于保存的源」；e2e「缩进子节点 depth=3」 |
| [04-collapsed.png](docs/ui/r14/04-collapsed.png) | **折叠/展开后**（同一真导图折叠 `n0.0`「产品方向」→ 箭头 ▸、子树隐藏、统计「节点 6 · 折叠 1」） | e2e「折叠：点节点加入折叠集合」「展开：再次点同一节点移出集合」；shared `toggleNodeCollapse` |
| [05-narrow.png](docs/ui/r14/05-narrow.png) | 窄屏 488×1100（`?narrow=1`）：**十药丸单行不折行**、徽章独占下一行；左栏列表 / Markdown 编辑 / 树视图纵排无裁切 | 无独立数字断言（CSS 断点，确定性钉态，逐张目验；十 tab 壳基线同批重拍） |
| [06-error.png](docs/ui/r14/06-error.png) | 错误态（语义化文案 + 操作提示 + 「重试」按钮，钉态） | 无独立断言（4xx 由 audit r14 节锁定） |

### r13 矩阵：[docs/ui/r13/](docs/ui/r13/README.md) —— RAG 对话与引用溯源（M6 收官，共 7 张）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-rag-chat.png](docs/ui/r13/01-rag-chat.png) | **真实链路·RAG 对话流**（真发「根据知识库，苹果 手机」→ 真检索命中 2 片 → AI 气泡带 `[1]` 引用标记 + 两张来源引用卡 + 右侧产物引用清单） | audit「r13 RAG 回答带非空引用清单」「r13 AI 汇总注入真实来源标题」；e2e「ChatExecution 携带非空引用清单」 |
| [02-citation-card.png](docs/ui/r13/02-citation-card.png) | **来源引用卡钉态**（同真实 RAG 数据 + 紫色 spotlight 卡 + 「引用卡钉态：来源、chunk 编号、片段与相关度均来自真实检索回执」注记） | e2e「引用 snippet 逐字取自真实 chunk」「citation.score 与 TF-IDF 命中分值相等」 |
| [03-citation-jump.png](docs/ui/r13/03-citation-jump.png) | **引用跳转·溯源回看**（点引用卡 → `?page=knowledge&docId=&chunkId=` → 知识库页显示紫色「溯源回看」面板，chunk 正文由 `GET /api/knowledge/docs/:id?chunkId=` 真读回） | audit「r13 回答引用可经 HTTP 溯源 -> 200」「r13 引用 snippet 逐字等于存储 chunk 前缀」 |
| [04-artifact-citations.png](docs/ui/r13/04-artifact-citations.png) | **产物引用清单**（右侧产物面板完整显示 2 条引用：docTitle / chunk #id / 相关度 / 片段，可点跳转） | audit「r13 产物原文含引用清单」「r13 产物引用条数与回答一致」；e2e「chat-result 产物 JSON 引用清单非空」 |
| [05-no-hit.png](docs/ui/r13/05-no-hit.png) | **无命中态**（真发不存在的词 → 工具回执「命中 0 条」→ AI 如实说「知识库没有相关内容」+ 红条「未引用任何来源（不编造）」+ 产物 `citations: []`） | audit「r13 无命中如实说知识库没有相关内容」「r13 无命中不出现伪造引用标记」；e2e「零命中不出现伪造 chunk 引用」 |
| [06-narrow.png](docs/ui/r13/06-narrow.png) | 窄屏 488×1400（`?narrow=1`）：**九药丸单行不折行**、徽章独占下一行；三栏纵排 + AI 回答 + 两张引用卡完整可见 | 无独立数字断言（CSS 断点，确定性钉态，逐张目验；九 tab 壳基线同批重拍） |
| [07-error.png](docs/ui/r13/07-error.png) | 错误态（语义化文案 + 操作提示 + 「重试」按钮，钉态） | 无独立断言（4xx 由 audit r13 节锁定） |

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

### 壳基线：[docs/ui/shell/](docs/ui/shell/README.md) —— **十五 tab** 激活态（r4 返工 #1 B 固化，shot.ps1 自动拍摄；r6 新增「表格」→ 六张；**r8 新增「文档」→ 七张**；r9 徽章推进；**r10 新增「AI 工作台」→ 八张**；r11 徽章推进同批重拍；**r12 新增「知识库」→ 九张**，补 `knowledge-tab-active.png` 并同批重拍旧八张；r13 对话流/产物变更 → 九张同批重拍；**r14 新增「导图」→ 十张**；**r15 新增「白板」→ 十一张**；**r16 新增「审批」→ 十二张**，补 `approval-tab-active.png` 并同批重拍旧十一张；**r17 新增「物资」+「单位任务」→ 十四张**，补 `assets-tab-active.png` / `unit-tasks-tab-active.png` 并同批重拍旧十二张，与 r16 基线逐位全异；**r18 tab 数量不变仍十四张**（登录/注册为独立路由不占 tab），但徽章 r18 + 工作台服务模式卡 + schema v14 + M9 里程碑 + 顶栏登录按钮 → 十四张同批重拍，与 r17 逐位全异；**r19 tab 数量仍不变十四张**（同步卡在工作台设置区内不占 tab），但徽章 r19 + 工作台多端同步卡 + schema v15 + M9 收官 → 十四张同批重拍，与 r18 逐位全异；**r20 tab 数量仍不变十四张**（顶栏在线状态/队列徽标/立即同步 + ≤600px 底部导航都是布局变化，不新增 tab），但徽章 r20 + 顶栏在线圆点与队列徽标 + PWA 安装/离线缓存提示 + M10 起步 → 十四张同批重拍，与 r19 逐位全异；**r22 tab 数量仍不变十四张**（底栏「更多」入口 + ☰ 展开态均为布局/开合变化，不新增 tab），但徽章 r22「遗留清理与质量收敛（M10 后）」+ 更多入口 DOM seam → 十四张同批重拍，与 r21 逐位全异；**r23 新增「组织」tab → 十五张**，补 `org-tab-active.png` 并同批重拍旧十四张，徽章 r23「组织架构与通讯录（M10 后）」+ schema v16，与 r22 逐位全异；**r24 tab 数量仍十五**（审批/物资加入通讯录选人入口，改渲染层），十五张同批重拍，与 r23 有七张因像素变化而改变；**r25 tab 数量仍十五**（审批动作姓名+部门徽标 / 选人部门筛选 / 回填语义提示，改渲染层），十五张同批重拍，与 r23 八张同字节、与 r24 十一张同字节，不伪造差异）：工作台 / 待办 / 日程 / 项目 / 看板 / 表格 / 文档 / AI 工作台 / 知识库 / 导图 / 白板 / 审批 / 物资 / 单位任务 / 组织各 1 张（r2/r3/r4 U1-1 三轮连漏的流程性终结）；**r19 返工#1 另附 14 张同批壳基线**于 `docs/ui/r19-rework1/shell/`（11/14 与本基线逐字节相同，3 张因动态计数/时间戳漂移），不覆盖本节原图。

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

- e2e **2096** 项（服务离线口径 2096，api 在线时 HTTP 冒烟节 +1 = 2093）：**r25 第三轮遗留清理 55（r25 新增：登录用户关联成员解析 6 · usage 第五类审批动作 4 · schema v18 与 actor_member_id 可空列/外键 SET NULL 8 · 动作落库/4xx 零半态/持久化 14 · 部门筛选/去裸号/语义提示/审批徽标/矩阵索引 seam 21）** · **r24 通讯录成员接入审批/物资 86（r24 新增：shared/org 成员引用解析/姓名优先/自由文本回落/摘要与 usage 口径 24 · schema v17 与四张可空列/原列 NOT NULL/外键 SET NULL 20 · 审批物资数据层新旧双路径与停用拒绝 26 · 渲染层/CI/截图索引 seam 16）** · **r23 组织架构与通讯录 96（r23 新增：shared/org 规则 53 · schema v16 与部门/人员数据层 23 · 渲染层/文档/CI/截图索引 seam 20）** · **r22 遗留清理与质量收敛 14（r22 新增：移动底栏更多入口 seam 6 · 徽章推进 1 · 部署文档三处补强 2 · 根 README 脚本清单 1 · shell README 哈希/计数逐字一致 4）** · **r21 私有化部署与单机版 39（r21 新增：部署契约唯一口径 14 · docker/compose 静态解析 13 · portable start.sh/首启引导/数据自检 8 · DEPLOY.md 三路径四步 FAQ 4）** · **r20 离线队列与 PWA 81（r20 新增：唯一常量 9 · 队列项守卫与归一 10 · 入队语义 10 · 持久化 enqueue/dequeue/peek/clear 15 · 按序重放计划 4 · 语义化离线响应 6 · 渲染层/PWA 结构 27；另有 r19 旧徽章替换断言 1）** · **r19 多端同步（三方合并 / 冲突检测 / 版本递增 / 幂等 / schema v15 / 渲染层结构 / 返工#1 status 最新与 UI U2）83（r19 新增 74 + 返工#1 9）** · **r18 返工#1 浏览器入口与 401 清态 13（返工新增）** · **r18 认证与会话 73（r18 新增）** · 迁移一致性 7 · settings 9 · todo CRUD 15 · 输入校验 13 · 状态机 10 · 汇总计数 7 · raw schema 4 · 迁移幂等 3 · 日程契约与守卫 28 · 循环实例化 14 · 区间查询装配 12 · v2→v3 迁移+双向联动 18 · schedules CRUD 26 · 看板排序规则（reorderPositions）12 · 看板名称守卫 6 · v3→v4 迁移+看板数据层 33 · 看板统计口径（computeBoardStats）35 · 看板 CSV 台账（buildBoardCsvContent）36 · 字段类型引擎（validateFieldValue / coerceFieldValue / compareValues）86 · 记录数据归一与查询装配（normalizeRecordData / queryRecords）25 · 看板导出文件名（buildBoardCsvFileName · U2-2）6 · v4→v5 迁移+多维表格数据层 44 · 视图 spec 归一（normalizeViewSpec）31（r7 新增）· 按视图查询口径（多字段 AND / 多级排序 / 投影）21（r7 新增）· CSV 导入口径（parseCsvText / planCsvImport / 零半态）43（r7 新增）· v5→v6 迁移+视图数据层（持久化 / 原子导入）43（r7 新增）· **块类型引擎（normalizeBlockContent / canConvertBlockType / 拆合装配）64（r8 新增）· v6→v7 迁移+文档数据层（持久化 / 拆合移动 / 全文装配）65（r8 新增）· Markdown 双向引擎（markdownToBlocks / blocksToMarkdown / 未知语法降级）36（r9 新增）· Markdown 导入计划（normalizeMarkdownImportPayload / planMarkdownImport / 零半态）25（r9 新增）· AI 修订语义（instruction 守卫 / planRevisionApply / mock 录制回放）20（r9 新增）· 导入数据层（importBlocks 单事务整体替换 / 零半态 / 持久化 / 往返）12（r9 新增）· schema v7→v8 迁移与对话数据层（conversations / messages / artifacts）33（r10 新增）· 工具契约与脚本规划口径（TOOL_NAMES / 规划 / 汇总）34（r10 新增）· 工具注册表与真实服务层调用（ToolRegistry）26（r10 新增）· mock-planner 与工具调用录制回放（≥15 用例）9（r10 新增）· 对话编排与产物（executeChat）13（r10 新增）· **r11 契约（产物类型 / 上下文窗口 / 行内 diff）24（r11 新增）· r9 U2 行内增删改 diff 11（r11 新增）· r11 跨轮指代消解 12（r11 新增）· r11 三类产物生成器 13（r11 新增）· r11 工具链扩展真服务层 14（r11 新增）· r11 多轮上下文编排与回放扩充 22（r11 新增）· **schema v8→v9 知识库数据层 23（r12 新增）· 分块引擎 chunkText 19（r12 新增）· TF-IDF 检索引擎 searchChunks 20（r12 新增）· search_knowledge 工具真检索 5（r12 新增）· **r13 RAG 契约与意图识别 15 · 检索注入与引用装配 30 · executeChat 编排与引用落库 24 · RAG 回放评测集 5（共 74，r13 新增）· r14 Markdown↔树双向转换/守卫/折叠 35 · r14 schema v10 与 mindmaps 数据层 25（共 60，r14 新增）· r15 白板守卫/归一 32 · r15 重叠避让 13 · r15 mock AI 建板 9 · r15 Markdown 导出 7 · r15 画布坐标换算 6 · r15 schema v11 与白板数据层 38（共 105，r15 新增）** · r15 返工#1 +5（AI 建板全量画布零重叠与既有坐标回写 3 · 列表 itemCount 逐板独立 2）· **r16 审批状态机/步骤/三视角/schema v12 数据层 133（r16 新增）**· **r17 库存规则/任务状态机/任务树/schema v13 数据层 88（r17 新增）**
- HTTP audit **1723** 项（**r25 第三轮遗留清理 56（r25 新增：health v18 · 注册登录与关联成员解析路由 · 提交/通过步骤 actor_member_id 与摘要 · 老路径 NULL · 不存在/停用动作人 400 零半态 · usage actionCount 第五类 · 清理探针）** · **r24 通讯录成员接入审批/物资 85（r24 新增：health v17 · 老路径纯文本与 NULL 摘要 · 新路径 member_id 落库/姓名覆盖/部门摘要 · 不存在·停用·非法 id 4xx · 提交/转交/抄送成员摘要 · 物资保管员与出入库 · usage 四类计数与 404/400 · 清理归零）** · **r23 组织架构与通讯录 68（r23 新增：部门三级装配 / CRUD / move 自挂·成环·越权 / 重复部门名 / 人员 CRUD / 按部门查询 / 姓名·邮箱·职位大小写不敏感搜索 / 非法邮箱·状态·越权 id / 清理）** · **r22 部署路由契约复核 11（r22 新增：health settings 数组/时间戳键/content-type 3 · mode/envMode 回显一致 1 · todos 数组 + local 200 2 · 契约外 404 1 · 路由常量结构 2 · health/mode 真 HTTP 200 2）** · **r21 部署契约 health/mode/关键路由 19（r21 新增：契约常量 1 · health 真 HTTP 4 · mode 探针 4 · 关键路由逐一真探针 5 · 401 语义 2 · settings/404/引导校验 3）** · **r20 离线重放 42（r20 新增：空队列 4 · 非法条目 400 与零半态 10 · 按序重放与真落库 10 · PATCH 真改状态 3 · 业务 4xx 3 · 重放冲突 409 与零半态 8 · 清理与标记头 4）** · **r19 多端同步 66（r19 新增 63 + 返工#1 3：changes/status/apply / status 精确最新 id·时间 / 409 冲突字段 / 幂等 / 越权 403 / 非法 since·limit / 全链路）** · **r18 返工#1 浏览器契约真 HTTP 7（返工新增）** · **Auth r18 67（r18 新增）** · 服务就绪 1 · health/settings 5 · todo 新建 12 · 列表详情 7 · 状态流转 9 · summary 11 · 删除 6 · 未知路由 1 · schedules CRUD 36 · 双向联动 22 · 循环实例 over HTTP 23 · projects CRUD 25 · board columns CRUD 20 · cards CRUD + 跨列移动 50 · board stats + CSV export 84 · tables / fields / records（r6）86 · views + CSV import（r7）119 · documents + blocks（r8）117 · Markdown import/export + AI revise（r9）67 · AI workbench: tools / conversations / chat / artifacts（r10）80 · **AI workbench r11: multi-turn context / artifact generators / extended tools 81（r11 新增）· Knowledge r12: ingest / TF-IDF search / source refs / 4xx 56（r12 新增）· RAG r13: citations / traceback / no-hit / 4xx 43（r13 新增）· **Mindmap r14: CRUD / tree / content / 4xx 54（r14 新增）· Whiteboard r15: boards / items / batch move / ai-create / export.md / 4xx 80（r15 新增）· r15 返工 +11（AI 建板全量画布零重叠 / 既有坐标回写 / HTTP 真读回 7 · 列表 itemCount 逐板独立 2 · 复现板 CRUD 清理 2）· **Approval r16: CRUD / submit / approve / reject / delegate / withdraw / 三视角 / 4xx 103（r16 新增）**· **Assets/UnitTasks r17: 台账 / 出入库 / 流水 / 任务树 / 状态流转 / 4xx 88（r17 新增）** · schedules 删除 5）
- typecheck 5 包全绿（strict + noUncheckedIndexedAccess；shared / db / web / api / **agent(r9 新增)**）
- CI：ubuntu / windows / macos 三平台 verify 门禁 + tag 触发 Release；CI 的 HTTP smoke 静态正则随 schema 版本号同步放宽为 `(2|3|4|5|6|7|8|9|10|11|12|13|14|15|16)`（v0.0.6 教训）
- r6 规模变化：e2e 288 → 449（+161）· audit 313 → 403（+90）；**无一条断言被删**（只涨不缩，宪法第四条）
- r7 规模变化：e2e 449 → 587（+138）· audit 403 → 522（+119）；**无一条断言被删**（只涨不缩，宪法第四条）。随版本增长只更新了 **6 条既有断言的期望值**（迁移队列最高版本 5→6：`[3,4,5]`→`[3,4,5,6]`、`[4,5]`→`[4,5,6]`、`[5]`→`[5,6]`、构造越界队列 1..6→1..7，以及 audit 两处 `health.schemaVersion` 5→6），另有 2 条 e2e 断言的**标签文字**（4/5 → 6）同步，条数不变。
- r8 规模变化：e2e 587 → **716（+129）**· audit 522 → **639（+117）**；**无一条断言被删**（只涨不缩，宪法第四条）。随 v6→v7 迁移只更新了 **6 条既有断言的期望值**（`[3,4,5,6]`→`[3,4,5,6,7]`、`[4,5,6]`→`[4,5,6,7]`、`[5,6]`→`[5,6,7]`、`[6]`→`[6,7]`、构造越界队列 1..7→1..8）与 audit 两处 `health.schemaVersion` 6→7；另有 8 条 e2e 断言的**标签文字**（4 条「v2/v3/v4/v5 旧库补跑 v6」→ 补 v7、3 条「CURRENT_SCHEMA_VERSION（6）」→（7）、1 条「重启后 user_version 仍为 6」→ 7）同步，条数不变。
- r9 规模变化：e2e 716 → **809（+93）**· audit 639 → **706（+67）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增四节 e2e（36 双向引擎 + 25 导入计划 + 20 修订语义 + 12 导入数据层）与一节 audit（67 条真实 HTTP 装配，含导入预览/零半态 422/修订采纳与放弃/4xx）；本轮**未做 schema 迁移**，既有断言期望值与 CI smoke 正则 `(2|3|4|5|6|7)` 均未改动。唯一修正是一条 audit 预览行数期望（6→5，按 `MARKDOWN_IMPORT_PREVIEW_ROWS=5` 的真实契约），条数不变。
- r10 规模变化：e2e 809 → **924（+115）**· audit 706 → **786（+80）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增五节 e2e（33 对话数据层 + 34 工具契约/规划 + 26 真实注册表 + 9 回放 + 13 编排）与一节 audit（80 条真 HTTP 装配，含 4xx：空消息/未知工具/非法参数/空标题/越权 id、逐条 tool_call 落库查库验证、create_todo 实际创建、产物与级联删除）。随 v7→v8 迁移只更新了 **6 条既有断言的期望值**（`[3,4,5,6,7]`→`[3,4,5,6,7,8]`、`[4,5,6,7]`→`[4,5,6,7,8]`、`[5,6,7]`→`[5,6,7,8]`、`[6,7]`→`[6,7,8]`、`[7]`→`[7,8]`、构造越界队列 1..8→1..9）与 audit 两处 `health.schemaVersion` 7→8；另有 e2e 若干**标签文字**同步（`CURRENT_SCHEMA_VERSION（8）`、`重启后 user_version 仍为 8`、迁移链文字加 v8），条数不变。CI smoke 正则同步为 `(2|3|4|5|6|7|8)`。

- r11 规模变化：e2e 924 → **1020（+96）**· audit 786 → **867（+81）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增六节 e2e（24 契约 + 11 行内 diff + 12 指代消解 + 13 产物生成器 + 14 工具链真服务层 + 22 多轮编排与回放）与一节 audit（81 条真 HTTP：12 工具目录 / context_window 4xx / 三轮跨轮指代 / 三类产物 /content / 产物不存在与非法类型 4xx / 4 新工具真建数据 / 清理）。**本轮无 schema 迁移**（artifacts.type 本就是 TEXT，三类新产物无需 v9），CI smoke 正则保持 `(2|3|4|5|6|7|8)`；只更新 **6 条既有断言的期望值/标签**（e2e 工具数/工具名/状态变更清单 8→12 ×3、注册表 8→12 ×1、audit 工具目录数与工具名 8→12 ×2），条数不变。

- r12 规模变化：e2e 1020 → **1087（+67）**· audit 867 → **923（+56）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增四节 e2e（23 v8→v9 知识库数据层 + 19 分块引擎 + 20 TF-IDF 检索 + 5 search_knowledge 真检索）与一节 audit（56 条真 HTTP：CRUD / 三篇文档 TF-IDF 排序 / 来源引用 / 文档源入库 / 工具真检索 / 4xx：空内容·超长内容·非法 source_type·空查询·limit 越界 / 清理）。随 v8→v9 迁移只更新 **9 条既有断言的期望值**（e2e 迁移队列越界构造 1 条 + v2~v7 旧库补跑队列末追加 9 共 6 条 + audit 两处 `health.schemaVersion` 8→9）与若干标签文字；另 1 条 search_knowledge 占位断言的期望随行为变更同步（`placeholder=true`→`undefined`），均不改条数；CI smoke 正则同步为 `(2|3|4|5|6|7|8|9)`。

- r13 规模变化：e2e 1087 → **1161（+74）**· audit 923 → **966（+43）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增一节 e2e（shared RAG 契约/意图 15 + rag.ts 检索注入与引用装配 30 + executeChat 编排与引用落库 24 + 录制回放 5）与一节 audit（43 条真 HTTP：RAG 提问带 citations / 引用逐条溯源 / assistant 消息落库引用 / 产物引用清单 / 无命中不编造 / 4xx：chunkId 非法·引用 id 不存在·文档不存在 / 清理）。**本轮无 schema 迁移**（引用存 assistant.content_json 的开放字段，无需 v10），CI smoke 正则保持 `(2|3|4|5|6|7|8|9)`；typecheck 仍 5 包。

- r14 规模变化：e2e 1161 → **1221（+60）**· audit 966 → **1020（+54）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增 e2e 一节（shared 双向转换/降级/空行往返/守卫与折叠 35 + schema v10 迁移与 mindmaps 数据层 25）与一节 audit（54 条真 HTTP：CRUD + GET /:id/tree 真解析 + PUT 源保存后树同步 + 4xx：空内容·纯空白·NUL 非法 Markdown·非字符串·超长·越权 id·非数字 id·空标题 / 清理）。随 v9→v10 迁移只更新 **10 条既有断言的期望值/构造队列**（e2e 越界构造队列追加 v11、v2~v8 旧库补跑队列末追加 v10 共 8 条、audit 两处 `health.schemaVersion` 9→10）与 14 条标签文字，条数不变；CI smoke 正则同步为 `(2|3|4|5|6|7|8|9|10)`；typecheck 仍 5 包。

- r15 规模变化：e2e 1221 → **1326（+105）**· audit 1020 → **1100（+80）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增 e2e 一节（白板守卫/归一 32 + 重叠避让 13 + mock AI 建板 9 + Markdown 导出 7 + 画布坐标换算 6 + schema v11 与 whiteboards/whiteboard_items 数据层 38）与一节 audit（80 条真 HTTP：whiteboards/items CRUD + 批量移动真落库 + ai-create 真生成 7 便签且布局不重叠 + 同主题确定性 + export.md 字节装配 + 4xx：空/超长标题·非法类型·越界坐标·非法颜色·越权 board_id·跨白板条目·重复 id·非法主题·非数字 id / 清理）。随 v10→v11 迁移只更新 **17 条既有断言的期望值/构造队列**（e2e 越界构造队列追加 v12、v2~v8 旧库补跑队列末追加 v11 共 8 条、raw14 user_version 10→11、audit 两处 `health.schemaVersion` 10→11）与 14 条标签文字，条数不变；CI smoke 正则同步为 `(2|3|4|5|6|7|8|9|10|11)`；typecheck 仍 5 包。
- r15 返工#1 规模变化：e2e 1326 → **1331（+5）**· audit 1100 → **1111（+11）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增断言锁 A（AI 建板后全量画布含既有条目两两无重叠、既有条目避让坐标真回写落库，e2e+3 / audit+7）与 B（白板列表 itemCount 逐板独立、不串用选中板条目数，e2e+2 / audit+2）。变异红相：删掉 `aiCreateWhiteboard` 写回循环 → e2e 1327 通过/2 红、audit 1106 通过/2 红；逐字节还原（SHA `0D21EECC…`）后双套件全绿。typecheck 仍 5 包。
- r16 规模变化：e2e 1331 → **1464（+133）**· audit 1111 → **1214（+103）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增 e2e 一节（shared 审批五态/转移表/守卫 25 · planApprovalAction 与可用动作 28 · 三视角纯函数 9 · schema v12 与审批数据层 71 = 133）与一节 audit（103 条真 HTTP：approvals CRUD / 抄送 / submit / delegate 不改状态但换 assignee / approve / reject / withdraw / 三视角 / 4xx：非 assignee 操作·已结单再审批·非法流转·非法类型·越权 id·非法视角·缺 actor / 级联清理）。随 v11→v12 迁移只更新 **12 条既有断言的期望值/构造队列**（e2e 越界构造队列 1..12→1..13 1 条、v2~v8 旧库补跑队列末追加 12 共 7 条、raw14/raw15 `user_version` 11→12 共 2 条、audit 两处 `health.schemaVersion` 11→12 共 2 条）与若干标签文字，条数不变；CI smoke 正则同步为 `(2|3|4|5|6|7|8|9|10|11|12)`；typecheck 仍 5 包。**变异红相 1 组**：把 shared `planApprovalAction` 的 delegate 改回不换 assignee → e2e 3 红（delegate 真换 assignee / 数据层 delegate 真改 assignee / 转交后旧 assignee 不能审批）、audit 4 红（delegate 真换 assignee / 旧 assignee 审批 200≠400 / POST approve 400≠200 / approved 期望失配）；逐字节还原（SHA `5B3F0945…C80AB7`）后双套件全绿。
- r17 规模变化：e2e 1464 → **1552（+88）**· audit 1214 → **1302（+88）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增 e2e 一节（shared 任务状态机/守卫 14 · 库存规则 applyAssetTransaction 24 · 任务树 buildTaskTree 11 · schema v13 与物资/流水/任务数据层 39 = 88）与一节 audit（88 条真 HTTP：assets CRUD / 入库 / 出库 / 转移 / 按物资查流水 / 全量流水 / unit-tasks CRUD / 流转 / 任务树 / 4xx：负库存·越权 asset_id·非法分类·非法流水类型·空物资名·负初始库存·非法流转·终态回退·非法状态·越权任务·空标题·空责任单位·非法到期日·父任务不存在 / 级联清理）。随 v12→v13 迁移只更新 **14 条既有断言的期望值/构造队列**（e2e 越界构造队列 1..13→1..14 1 条、v2~v8 旧库补跑队列末追加 13 共 7 条、raw14/raw15/raw16 `user_version` 12→13 共 3 条、audit 两处 `health.schemaVersion` 12→13 共 2 条）与若干标签文字，条数不变；CI smoke 正则同步为 `(2|3|4|5|6|7|8|9|10|11|12|13)`；typecheck 仍 5 包。**变异红相 1 组**：把 shared `canTransitionUnitTask` 改成总是返回 true → e2e 6 红（done→in_progress / cancelled→pending / pending 直接 done / done 回退 / in_progress 回退 / 终态回退）、audit 3 红（终态回退 200≠400 / pending 直接 done 200≠400 / 4xx 后状态被改）；逐字节还原（SHA `F1D8D108…514B803`）后双套件全绿。
- r18 规模变化：e2e 1552 → **1625（+73）**· audit 1302 → **1369（+67）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增 e2e 一节（角色→权限映射 9 · 用户名/弱密码守卫 9 · PBKDF2 哈希/校验含 Node 内置 pbkdf2Sync 逐字节对照 16 · 会话过期边界 5 · token 本地随机 4 · schema v14 与账号/会话数据层 30 = 73）与一节 audit（67 条真 HTTP：服务模式 / 注册 / 登录 / guard / me / users 403 / logout / 短 TTL 过期 / 非法模式 / remote 业务路由 401 / local 匿名可用 / 用户第一次用全链路 / 级联清理）。随 v13→v14 迁移只更新 **17 条既有断言的期望值/构造队列**（e2e 越界构造队列 1..14→1..15 1 条、v2~v8 旧库补跑队列末追加 14 共 7 条、raw14/raw15/raw16/raw17 `user_version` 13→14 共 4 条、7 条队列期望追加 14、audit 两处 `health.schemaVersion` 13→14 共 2 条）与若干标签文字，条数不变；CI smoke 正则同步为 `(2|…|14)`；typecheck 仍 5 包。**变异红相 1 组**：把 `shared/auth.ts` 的 `validateSession` 过期判定改成 `if (false && …)` → e2e 3 红（到期时刻/过期后/库内过期会话）、audit 3 红（过期会话 guard 200≠401 / cleared 缺失 / me 200≠401）；逐字节还原（SHA `35A74A85…5D617`）后双套件全绿。
- r18 返工#1 规模变化：e2e 1625 → **1638（+13）**· audit 1369 → **1376（+7）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增 e2e 一节「浏览器请求入口与 401 清态」13 条：14 个业务页/外壳逐页裸 fetch 扫描（认证页公开端点例外，防登录 401 误跳）+ 真实 `apiFetch` 模拟：remote 带 token 200 / Bearer 头 / 原样路径 / 401 响应透传 / 清 localStorage token / 跳 `?page=login&reason=401` / 清态广播 / 本机无 token 不附假头；audit 新增 7 条真 HTTP：remote 带 token 业务与健康路由 200、匿名业务 401 + cleared 响应体/头、切模式往返。**变异红相 1 组**：把 `apps/web/src/authClient.ts` 的 401 分支改成 `if (false && res.status === 401)` → e2e **4 红**（清 token / 跳一次 / reason=401 / 广播），逐字节还原（SHA `D271D48B…FC68A`）后 `pnpm run test:all` 全绿。CDP 真点另验：remote 真登录点待办/物资/文档均 200 带 Bearer；假 token 业务 401 后 URL=`?page=login&reason=401`、localStorage token=`null`。typecheck 仍 5 包。
- r19 规模变化：e2e 1638 → **1712（+74）**· audit 1376 → **1439（+63）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增 e2e 一节（shared 变更操作/实体 id/版本守卫 12 · nextVersion 3 · since/limit 归一 11 · valuesEqual 2 · detectConflict 三方比较 12 · applyChangeSet 增量合并与幂等 4 · schema v15 与同步数据层 24 · 渲染层结构 6 = 74）与一节 audit（63 条真 HTTP：status/changes/apply 全链路 · 增量拉取幂等与 since/limit · 409 冲突字段列表与两端快照 · 不同字段合并 · 越权 403 · 非法 since/limit/载荷/版本 400 · 模式切换与清理）。随 v14→v15 迁移只更新 **17 条既有断言的期望值/构造队列**（e2e 越界构造队列追加 v16 1 条、v2~v8 旧库补跑队列末追加 v15 共 7 条、raw14~raw17 `user_version` 14→15 共 5 条、audit 两处 `health.schemaVersion` 14→15 共 2 条）与若干标签文字，条数不变；CI smoke 正则同步为 `(2|…|15)`；typecheck 仍 5 包。**变异红相 1 组**：把 shared `detectConflict` 的冲突字段改为恒空 → e2e 3 红（同字段真冲突 / hasConflict / 409 字段列表）、audit 1 红（409 字段列表 got [] want ["title"]）；逐字节还原（SHA `69A4FA85…C4B7C`）后 `pnpm run test:all` 全绿。
- r19 返工#1 规模变化：e2e 1712 → **1721（+9）**· audit 1439 → **1442（+3）**；**无一条断言被删**（只涨不缩，宪法第四条）。A：audit 把 `status 回带最后变更 id > 0` 弱断言升级为**精确等值**（v1 单条 + 6 条变更后 `lastChangeId=最新 applied.id`、`lastChangeAt=最后写入 createdAt`，+3）；e2e 新增 db 全表最新 helper `listLatestChange()` 的精确 id/时间断言与 api 零排序分支结构断言（+6）。B：e2e 新增同步卡 U2 文案锁（选边后果提示 / 稍后处理弱化 / `title` 两版核心文案不同，+3）。**变异红相 1 组**：把 `listLatestChange` 的 `ORDER BY id DESC` 改回 `ASC`（最新→最早）→ e2e **1714 通过 / 4 红**、audit **1440 通过 / 2 红**（`got 1, want 6`）；逐字节还原（SHA `3BA73EA3…5193F`，`MUTATION-PROBE` 零残留）后 `pnpm run test:all` exit 0 / **1721 / 1442** 全绿。typecheck 仍 5 包；新矩阵 `docs/ui/r19-rework1/`（7+14）与实现同提交。
- r20 规模变化：e2e 1721 → **1803（+82）**· audit 1442 → **1484（+42）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增 e2e 一节（shared 离线队列规则与 PWA 结构 81：常量 9 · 守卫/归一 10 · shouldQueueOffline 10 · 队列持久化 15 · 按序重放 4 · 202 语义响应 6 · 渲染层/manifest/SW/移动 CSS 27）并把 r19 旧徽章断言改为「旧徽章已替换无残留」（+1，条数不变）；新增 audit 一节（42 条真 HTTP：POST /api/offline/replay 按 createdAt 升序真重放 · 非法队列项 400 与零半态 · 业务 4xx 回带 conflictIndex · 乐观锁重放冲突 409 与零半态 · 清理回基线）。**本轮无 schema 迁移**，CI smoke 正则保持 `(2|…|15)`；typecheck 仍 5 包。**变异红相 1 组**：把 shared `planOfflineReplay` 的 createdAt 升序改成降序 → e2e **1801 通过 / 2 红**、audit **1481 通过 / 3 红**（按序结果与实际落库顺序同时反）；逐字节还原（SHA `856E9F4A…FCDF`，`MUTATION-PROBE` 零残留）后 `pnpm run test:all` exit 0 / **1803 / 1484** 全绿。headless CDP 真断网链路：在线载入 → CDP offline → 真点新建两条 → 队列 2/徽标 2 → 恢复在线 → 真点「立即同步」→ API 真落库 id=1/2 → 清理。
- r21 规模变化：e2e 1803 → **1842（+39）**· audit 1484 → **1503（+19）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增 e2e 一节（shared 部署契约唯一口径 14：端口/路径/数据目录/模式/关键路由/期望状态/引导校验 · docker/compose 静态解析 13：多阶段 Dockerfile + 自写最小 YAML 解析器解析 compose 结构 + healthcheck 契约路径 · portable 增强 8：start.sh/数据目录自检/首启引导四要素/verify-deploy ASCII · DEPLOY.md 三路径四步 FAQ 4）；新增 audit 一节（19 条真 HTTP：契约健康路径 200 + ok/schema/mode · 模式探针回显一致 · 5 条关键路由按契约模式逐一真探 · 401 cleared 语义 · settings 匿名公开 · 契约外 404）。**本轮无 schema 迁移**（复用 v15），CI smoke 正则保持 `(2|…|15)`；typecheck 仍 5 包。**变异红相 1 组**：把 `packages/shared/src/deploy.ts` 的 `DEPLOY_PATHS.health` 改坏为 `/api/healthz` → e2e **1838 通过 / 4 红**、audit **1497 通过 / 6 红**（健康真 HTTP 404）；逐字节还原（SHA `E3B84404…DBC71`，`MUTATION-PROBE` 零残留）后 `pnpm run test:all` exit 0 / **1842 / 1503** 全绿。portable boot 复验：`pnpm pack` → start.cmd → 8080 web 200 + api health 200（ok:true / mode:local / schema:15），首启引导与 data 自检实打印，服务与 scratch 数据收净（端口 listen=0）。hex 截图 6 张 SHA256 互异。
- r22 规模变化：e2e 1842 → **1856（+14）**· audit 1503 → **1514（+11）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增 e2e 一节（更多按钮显隐纯函数 seam 2 · 外壳/CSS seam 接线 4 · r22 徽章推进 1 · DEPLOY.md 三处补强真实校验 2 · 根 README 脚本清单 1 · shell README r22 口径/14 张哈希逐字一致/全库 PNG 计数与唯一数逐字一致 4），并把 r20 旧徽章断言改为「旧徽章已替换无残留」（条数不变）；新增 audit 一节（11 条真 HTTP：health settings 数组与 last_health_check 键 · content-type JSON · mode/envMode 一致 · todos 200 + 数组 · 契约外 404 · 5 条部署路由 /api 前缀 · 路径常量无重复 · health/mode 真 200）。**本轮无 schema 迁移**（复用 v15），CI smoke 正则保持 `(2|…|15)`；typecheck 仍 5 包。顺带修一处**既有日期碰撞挂账**：audit 中硬编码 `2026-11-20` 在 2026-11-19 成为「明天」，与 summary「明天到期」样本撞车致 6 条断言红——把两处样本日期改为 11-22 / 11-23（条数与期望值不变），复跑全绿。**变异红相 1 组**：把 shared `shouldShowTabsMore` 改成恒 `false` → e2e **1855 通过 / 1 红**（离线口径；api 在线时 1856 通过 / 1 红）（「更多按钮在菜单未展开时可见」seam 断言）；逐字节还原（SHA `4D22DCFA…A23DFE`，`MUTATION-PROBE` 源码零残留）后 `pnpm run test:all` exit 0 / **1856 / 1514** 全绿。渲染层改动 → 十四 tab 壳基线同批重拍（闭合 r21 U2-1），r22 矩阵 3 张（真 390px 01/02 走 CDP device metrics、488px 03 走 `?narrow=1` seam），全库 235 PNG / 233 互异。
- r25 规模变化：e2e 2041 → **2096（+55）**· audit 1667 → **1723（+56）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增 e2e 一节（登录成员解析/usage 第五类/schema v18 raw/动作落库与 4xx/真实文件库重开/渲染层与文档 seam）与 audit 一节（56 条真 HTTP：health v18 · 登录用户关联成员 · actorMemberId 动作与摘要 · 老路径 NULL · 400 零半态 · usage actionCount · 清理）。既有断言只做**期望值/队列/标签更新**：越界队列 18→19、七处补跑队列追加 18、十处 `user_version` 17→18、approval_steps 列清单追加 actor_member_id、audit 六处 `health.schemaVersion` 18 与五类 usage total、CI smoke 正则 `(2|…|17)`→`(2|…|18)`、r23/r24 shell README seam 改指 R25 当前块（保留 r23/r24 历史对照行），条数不变；typecheck 仍 5 包。**变异红相 1 组**：actorMemberId 透传改坏 → e2e/audit 对应断言变红 → 逐字节还原全绿（详见 r25 报告）。渲染层改动 → 十五 tab 壳基线同批重拍，r25 矩阵 7 张，全库 257 PNG / 255 互异。
- r24 规模变化：e2e 1952 → **2041（+89）**· audit 1582 → **1667（+85）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增 e2e 一节（成员解析/汇总规则 24 · schema v17 只追加四张可空列与原列 NOT NULL/外键断言 20 · 数据层新旧双路径/停用拒绝/usage/重开 26 · 渲染层/CI/截图索引 seam 16）与 audit 一节（85 条真 HTTP：老路径纯文本逐字保留 + 新路径姓名覆盖与部门摘要 + 不存在/停用/非法 member_id 4xx + 提交转交抄送 + 物资保管员与出入库 + usage 四类计数 + 清理归零）。随 v16→v17 迁移只更新既有断言的**期望值/构造队列**：越界队列追加 v18、七处旧库补跑队列追加 17、若干 user_version 16→17、approvals/steps/cc/assets 列清单追加新列、audit 四处 health.schemaVersion 17；条数不变；CI smoke 正则同步为 `(2|…|17)`；typecheck 仍 5 包。**变异红相 1 组**：`resolveAssignee` 有 member_id 时仍回落自由文本 → e2e/audit 对应姓名解析断言变红；逐字节还原（SHA 见 r24 报告）后 `pnpm run test:all` exit 0 / **2041 / 1667** 全绿。渲染层改动 → 十五 tab 壳基线同批重拍，r24 矩阵 7 张，全库 250 PNG / 248 互异。
- r23 规模变化：e2e 1856 → **1952（+96）**· audit 1514 → **1582（+68）**；**无一条断言被删**（只涨不缩，宪法第四条）。新增 e2e 一节（shared/org 规则 53：状态枚举/部门名守卫/归一/树层级·孤儿·环检测/移动防自挂防成环/人员邮箱与字段归一/三字段大小写不敏感搜索/组织树带人员 · schema v16 与数据层 23：两表五列/九列逐列核对 + 外键/CHECK/UNIQUE raw 约束 + 三级 CRUD/移动/搜索/删除置空/重开不丢 · 渲染层/文档/CI/截图索引 seam 20）与一节 audit（68 条真 HTTP：空树 + 三级装配 + CRUD + move 自挂·A→B→A 成环·越权 + 重复部门名 + 人员 CRUD/按部门/搜索/非法邮箱·状态·越权 id + 清理）。随 v15→v16 迁移只更新 **13 条既有断言的期望值/构造队列**（e2e 越界队列追加 v17 1 条、旧库补跑队列 7 条、raw14~raw19 `user_version` 15→16 共 6 条、audit 四处 `health.schemaVersion` 15→16）与若干标签文字，条数不变；CI smoke 正则同步为 `(2|…|16)`；typecheck 仍 5 包。**变异红相 1 组**：shared/org `searchMembers` 大小写敏感化 → e2e **4 红**（姓名/职位/数据层姓名/数据层职位搜索）/ audit **5 红**（姓名/邮箱/职位/部门叠加/改后职位搜索）；逐字节还原（SHA `7500FB40…72CE76`，源码零残留）后 `pnpm run test:all` exit 0 / **1952 / 1582** 全绿。渲染层改动 → 十五 tab 壳基线同批重拍（新增 `org-tab-active.png`），r23 矩阵 7 张，全库 243 PNG / 241 互异。
- 核心概念逐轮条目见下一节（r1~r22 已落地的部分）。

### 核心概念（逐轮累积，r1~r22 已落地的部分）

- **迁移纪律**：schema 变更只走 `packages/db/src/schema.ts` 的 `MIGRATIONS` 队列（v1 settings → v2 todos → v3 schedules → v4 projects/board_columns/cards → v5 tables/fields/records → v6 views → v7 documents/blocks → **v8 conversations/messages/artifacts → v9 knowledge_docs/knowledge_chunks** → v10 mindmaps → v11 whiteboards/whiteboard_items → **v12 approvals/approval_steps/approval_cc → v13 assets/asset_transactions/unit_tasks → v14 users/sessions**），`user_version` 管理，重开幂等、旧库原地升级只补跑缺失版本
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

- **RAG 对话与引用溯源唯一入口**（r13）：`packages/agent/rag.ts` 集中 `retrieve` → `buildAugmentedPrompt` → `buildRagAnswer`，命中按 `[n]` 注入真实 chunk 片段与 docId/chunkId/score；`citations[{docId,chunkId,snippet,score,docTitle,position}]` 四要件 + 展示字段，随 chat 响应 / 产物正文 / assistant.content_json 三处落库，reload 不丢；「根据知识库 / 查资料 / 文档里」类意图在 shared 识别并先调 `search_knowledge`，无命中如实说「知识库没有相关内容」且 `citations: []`（不编造）；`GET /api/knowledge/docs/:id?chunkId=` 溯源回看（非法参数 400 / 引用 id 不存在 404），UI 引用卡可点跳转；RAG 回放评测集 11 条，无命中编造与引用注入丢失两组变异红相均由 e2e/audit 锁定

- **思维导图 Markdown 双视图唯一转换入口**（r14）：`packages/shared` 集中 `parseMarkdownToTree` / `treeToMarkdown` / `toggleNodeCollapse`，`#` 标题按层级成树、列表按缩进成子节点、代码围栏整段保留、未知语法降级 text 节点逐字不丢；`raw` + `blankBefore` + `trailingBlanks` 保证 md→tree→md 逐字节往返；确定性节点 id 让折叠态可复现。schema v10 建 `mindmaps(id/title/content_markdown/created_at/updated_at)`，Markdown 源逐字落库、树只现算不落库；api 提供 CRUD / `GET /:id/tree` / `PUT /:id/content`（空内容·NUL 非法 Markdown·越权 id 全有 4xx 断言），web「导图」tab 左编辑右树、编辑即时同步并可折叠/展开；十 tab 壳基线同批重拍，标题层级变平的变异红相由 e2e/audit 双向锁定

- **白板画布布局唯一入口**（r15）：`packages/shared` 集中 `normalizeWhiteboardItem`（类型白名单 / 坐标尺寸边界 / 内容 NUL 与上限 / 颜色 hex 唯一守卫）、`collisionResolve`（按 y→x→原序落位，重叠下移到冲突项底部 + 固定间距，幂等）、`planAiWhiteboard`（按主题脚本化生成 7 张便签，零 token 零随机）、`buildWhiteboardMarkdown`（按 y→x→id 视觉顺序装配）、`screenToCanvasPoint`/`canvasToScreenPoint`/`clampWhiteboardScale`（画布坐标换算唯一口径）；api/web 零算法分支。schema v11 建 `whiteboards(id/title/created_at)` + `whiteboard_items(id/board_id/type/x/y/w/h/content/color/created_at/updated_at)`，批量移动先全量校验再避让、单事务落库、越权零半态；api 提供 boards/items CRUD + `POST /:id/items/move` + `POST /:id/ai-create` + `GET /:id/export.md`（越权 board_id / 非法类型 / 越界坐标全有 4xx 断言）；web「白板」tab 无限画布（拖拽平移 / 滚轮与按钮缩放）/ 便签 CRUD / AI 建板 / 导出，十一 tab 壳基线同批重拍；避让规则改坏的变异红相由 e2e/audit 双向锁定
- **审批状态机唯一入口**（r16）：`packages/shared` 集中 `APPROVAL_TRANSITIONS`（draft→pending→approved/rejected/withdrawn，终态零出边；delegate 不改状态、只换 assignee，pending→pending 不在转移表）、`canTransitionApproval` / `assertValidApprovalTransition` / `assertValidApprovalAction`、`planApprovalAction`（角色守卫 + 产出 nextStatus/nextAssignee/stepAssignee 唯一计划）、`availableApprovalActions`（UI 按钮可见性）、`selectApprovalsForView`（我的待办/我发起的/抄送我的唯一过滤口径）；api 五动作共用一条装配路径、零流转分支。schema v12 建 `approvals(id/title/type/applicant_id/status/current_assignee/created_at/updated_at)` + `approval_steps(id/approval_id/order/assignee/action/comment/acted_at)` + `approval_cc(id/approval_id/cc_user/created_at, UNIQUE)`；db `actOnApproval` 按 shared 计划单事务更新状态与步骤、4xx 零半态；web「审批」tab 发起表单/三视角/时间线/操作按钮/抄送提示，十二 tab 壳基线同批重拍；delegate 不换 assignee 的变异红相由 e2e/audit 双向锁定
- **物资库存与单位任务规则唯一入口**（r17）：`packages/shared` 集中 `applyAssetTransaction`（in 加 / out 减且负库存拒绝 / transfer 来源位置匹配且总量不变，纯函数不改入参）、`UNIT_TASK_TRANSITIONS` + `canTransitionUnitTask` / `assertValidUnitTaskTransition`（五态转移表，done/cancelled 终态零出边）、`buildTaskTree`（parent_id 层级装配、孤儿父节点按根处理、环路抛错、同级 id 升序确定性）；schema v13 建 `assets(id/name/category/quantity/unit/location/custodian/created_at)` + `asset_transactions(id/asset_id/type:in|out|transfer/quantity/from/to/operator/created_at)` + `unit_tasks(id/title/assignee_unit/status/due_date/parent_id)`；db `applyAssetTx` 先按 shared 算新库存再单事务更新物资+追加流水（4xx 零半态）、`transitionUnitTask` 按 shared 转移表守卫；api assets CRUD + `POST /:id/transactions` + `/api/asset-transactions` 查询 + unit-tasks CRUD / `POST /:id/transition` / `GET /tree`；web「物资」tab 台账/出入库/流水时间线 +「单位任务」tab 树视图/状态标签/流转按钮，十四 tab 壳基线同批重拍；canTransitionUnitTask 改坏的变异红相由 e2e 6 红 / audit 3 红双向锁定
- **认证与本地会话唯一入口**（r18）：`packages/shared/auth` 子路径（Node 内置 `node:crypto`，零新依赖、web 不导入）集中 `hashPassword`（PBKDF2-HMAC-SHA256，120000 次迭代 + 32 字节随机盐，e2e 与 Node 内置 pbkdf2Sync 逐字节对照）、`verifyPassword`（timingSafeEqual，非法格式 false）、`validateSession`（到期时刻即失效，纯函数）、`AUTH_PERMISSIONS`（user/admin→权限映射）、`generateSessionToken`（本地随机 64 hex，不写密钥文件、无外部 IdP）、`SERVER_MODES`（local/remote）；schema v14 建 `users(id/username/password_hash/role/created_at)` + `sessions(id/user_id/token/expires_at)`，首个注册用户自动 admin，密码只写摘要不明文；api `POST /auth/register|login|logout` + `GET /auth/me|guard|users|mode` + `POST /auth/mode`，onRequest 中间件在 remote 模式对业务路由统一 401（响应体 cleared=true + 响应头 X-Xieflow-Auth-Cleared=1，假/过期 token 一并清会话）；web 登录/注册为独立路由不占 14 tab，工作台「本机/远端」卡切换模式，401 一律 clearSession 跳登录；validateSession 过期判定改坏的变异红相由 e2e 3 红 / audit 3 红双向锁定

- **离线队列与重放唯一入口**（r20）：`packages/shared` 集中 `OFFLINE_QUEUE_KEY` / `OFFLINE_QUEUED_STATUS=202` / `OFFLINE_HEADER` 与 `normalizeOfflineQueueItem`（id/方法/路径/载荷/时间戳全守卫，外部 URL 与重放端点自身拒绝）、`shouldQueueOffline`（离线 + 写方法 + 本应用白名单路径三条件）、`enqueueOffline` / `dequeueOffline` / `planOfflineReplay`（整批校验零半态 + createdAt 升序同刻按 id，返回副本）与 `buildOfflineQueuedResponse`（web 构造真 Response）；`apps/web/authClient.ts` 的 `apiFetch` 离线写请求入 localStorage 并广播队列事件，返回 202「已入队」语义而非伪装成功落库；顶栏圆点/队列徽标/「立即同步」+ ≤600px 底部导航与 44px 触摸目标，无新 tab。`public/manifest.json` + `public/sw.js`（本地图标、静态 cache-first / API network-first / 离线 fallback、`?no-sw=1` 测试禁用）+ `POST /api/offline/replay`（app.inject 真走既有路由按序重放，首条 4xx 即停并回带 conflictIndex，零半态）；重放顺序改坏的变异红相由 e2e 2 红 / audit 3 红双向锁定

- **部署契约与三路径唯一入口**（r21）：`packages/shared/deploy` 子路径集中 `DEPLOY_PORTS` / `DEPLOY_PATHS`（health/mode/settings/todos/authMe）/ `DEPLOY_DATA`（data/xieflow.db）/ `DEPLOY_MODES`（docker=remote, portable=local, cloud=remote）/ `DEPLOY_ROUTES`（按模式期望状态）/ `expectedDeployStatus` / `missingDeployMarkers`，docker / portable / docs / verify-deploy / e2e / audit 全消费同一口径。docker 多阶段镜像（Node 20 builder → slim runtime，`XIEFLOW_MODE=remote` + `xieflow-data` 卷 + healthcheck）；portable 加 `start.sh` + README.txt 首启引导 + data 目录自检（首启建目录并验可写，不可写大声失败）；`docs/DEPLOY.md` 三路径 + 备份/恢复/搬迁四步 + FAQ；`scripts/verify-deploy.ps1` headless 起服务→health→关键路由→收净（ASCII/PS5.1）。健康路径 `DEPLOY_PATHS.health` 改坏的变异红相由 e2e 4 红 / audit 6 红（含真 HTTP 404）双向锁定；本轮无 schema 迁移、无渲染层改动（无新 tab）

## 明确不做（当前阶段）

实时汇率 · 视频会议 · 第三方 IM 集成 · 插件市场 · SaaS 多租户计费

## 许可证

[MIT](LICENSE)
