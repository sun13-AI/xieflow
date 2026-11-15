# 协流 XieFlow — AI 原生协同办公系统

> Agent 自驱迭代的协同办公平台：待办 / 日程 / 项目 / 看板 / 多维表格 / 文档 / AI 工作台。
> 产品方向参照 [多宝鱼](https://duobaoyu.work/)，迭代方法论参照 [IKanBot](https://github.com/chenpeigen2/IKanBot)（双 agent 流水线 + VERDICT 裁决 + 截图矩阵）。
> 设计包见 `D:\work\好东西\xieflow-design\`（README 总纲 / AGENTS.md 宪法 / RUNBOOK 运行手册）。

## 快速开始

```bash
pnpm install
# 一键启动（推荐）：双击 start.cmd，或：
powershell -File scripts\start.ps1 start   # 起 api:8787 + web:5173，自动开浏览器
powershell -File scripts\start.ps1 stop    # 收服务
# 开发模式：
pnpm dev:api         # api 服务 http://127.0.0.1:8787
pnpm dev:web         # web 界面 http://127.0.0.1:5173
pnpm run test:all    # typecheck + e2e（69 断言）+ HTTP 审计（52 断言）
pwsh scripts/shot.ps1 all            # 起服务 → r1 截图 5 态 → 收服务
pwsh scripts/shot.ps1 all -Round r2  # 同上，拍 r2 待办页钉态
```

### 打包（对齐 IKanBot 的 pack/dist 语义）

```bash
pnpm run pack        # 免安装目录 release/xieflow-portable/（进目录双击 start.cmd 即用）
pnpm run dist        # 上述 + 安装包 release/xieflow-setup-<版本>.zip（解压即用）
```

- 免安装目录：内置 web 静态产物 + api 源码 + 运行时依赖，单端口 8080（web+api 同源），数据落在目录内 `data/`
- 安装包 = 免安装目录的 zip；安装语义 = 解压到任意位置 → 双击 `start.cmd`（要求 Node.js ≥ 20）
- 已实测：portable 目录启动 → api 200 / web 200；setup zip 12.2MB

数据在 `data/xieflow.db`（SQLite 单文件，node-sqlite3-wasm 纯 WASM 免原生编译）。

## 目录结构

```
packages/
  shared/            数据契约与状态机（集中定义，禁止散落 if-else）
  db/                schema.ts（user_version 迁移）/ index.ts（连接）/ mappers.ts（行↔领域对象）
apps/
  web/               React + Vite 界面（r2：工作台 + 待办页 tab 切换）
  api/               Fastify 服务（/api/health + settings + todos 路由）
scripts/
  e2e-test.ts        直连服务层断言（内存库 + 文件库 + HTTP 冒烟）
  audit-http.ts      HTTP 路由层审计（对运行中的 api 断言，含 4xx 分支）
  audit-http.ps1     一键审计（临时 api + 一次性 db，跑完杀进程）
  shot.ps1           截图矩阵脚本（headless Edge，一次性进程，-Round r1/r2）
.github/workflows/   CI：三平台 verify + tag 触发 Release
```

## 核心概念（r2 已落地的部分）

- **迁移纪律**：schema 变更只走 `packages/db/src/schema.ts` 的 `MIGRATIONS` 队列（v1 settings → v2 todos），`user_version` 管理，重开幂等
- **状态机集中**：待办状态流转（open/done/archived）定义在 `packages/shared`，非法流转服务层与路由层双层拒绝
- **汇总计数唯一入口**：今/明/周 + 四象限计数只写在 `computeTodoSummary`（shared 纯函数），api 下发、UI 消费同一口径
- **探针真读库**：`/api/health` 每次 真 写读一次 settings，不只是进程活着

## 界面与测试对照

按 AGENTS.md 立项规则：**界面更新必须带截图证据（每次，无例外）**，截图与实现同一提交。

### r2 矩阵：[docs/ui/r2/](docs/ui/r2/README.md) —— 待办页 5 钉态 + 真实链路 + 返工 #1 新增 4 形态（共 10 张）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-todo-empty.png](docs/ui/r2/01-todo-empty.png) | 待办空态（计数卡全 0） | e2e「新库 todos 为空」 |
| [02-todo-modal.png](docs/ui/r2/02-todo-modal.png) | 新建弹窗（标题 200 字上限提示/象限/可选截止日） | audit「POST 合法体 -> 201」及 400 分支（含超长标题 400） |
| [03-todo-quadrants.png](docs/ui/r2/03-todo-quadrants.png) | 四象限有数据 + 今/明/周计数 | e2e「今/明/周汇总计数」节 + audit summary 组 |
| [04-todo-done.png](docs/ui/r2/04-todo-done.png) | 状态流转后（划线 + 按钮联动 + 计数变化） | e2e「todo 状态机」节 + audit「PATCH open->done -> 200」 |
| [05-todo-narrow.png](docs/ui/r2/05-todo-narrow.png) | 窄屏纵排（?narrow=1 seam） | 无 UI 形态（CSS 断点，确定性钉态） |
| [06-todo-live.png](docs/ui/r2/06-todo-live.png) | 真实数据链路（脚本 seed → 页面消费 → 拍后清理） | audit POST/GET 的端到端实证 |
| [07-workbench-tab.png](docs/ui/r2/07-workbench-tab.png) | 工作台 tab 激活（tab 栏 + 工作台内容） | e2e「settings 读写」节 |
| [08-todo-loading.png](docs/ui/r2/08-todo-loading.png) | 待办页加载态（正在加载待办…） | 无独立断言（fetch pending 态，证据为 GET 200 链路 + 本图） |
| [09-todo-error.png](docs/ui/r2/09-todo-error.png) | 待办页错误态（语义化文案，不暴露 5xx 原始码） | 无独立断言（httpClient.ts 语义化映射；停 api 实测同文案） |
| [10-todo-empty-title.png](docs/ui/r2/10-todo-empty-title.png) | 弹窗空标题提交反馈（inline alert + 200 字提示） | audit「POST 空标题 -> 400」的 UI 形态 |

### r1 矩阵：[docs/ui/r1/](docs/ui/r1/README.md) —— 首页工作台 5 态：

| 截图 | 形态 | 对应断言（scripts/e2e-test.ts） |
|---|---|---|
| [01-loading.png](docs/ui/r1/01-loading.png) | 加载态（连接本地数据库中） | 无 UI 形态（初始 phase 由 React 状态保证，证据为 e2e「迁移与 schema 一致性」节） |
| [02-empty.png](docs/ui/r1/02-empty.png) | 空态（库就绪、无设置项） | 「新库 settings 为空」「listSettings 数量正确」 |
| [03-ready.png](docs/ui/r1/03-ready.png) | 正常态（设置项 + schema 版本卡） | 「写入后读回 value」「upsert 覆盖旧值」「/api/health 返回 ok」 |
| [04-error.png](docs/ui/r1/04-error.png) | 错误态（api 未启动，红卡 + 提示） | 无 UI 形态（错误分支由 fetchHealth catch 保证） |
| [05-narrow.png](docs/ui/r1/05-narrow.png) | 窄屏形态（meta 纵排，?narrow=1 测试 seam） | 无 UI 形态（CSS 断点规则，DPR 无关的确定性窄屏钉态） |

> 测试 seam 说明：`?shot=` 钉住页面状态、`?page=todos` 直达待办页、`?narrow=1` 钉住窄屏布局——所有状态在真实运行中都存在，参数只为让 headless 截图确定性捕获（Windows 显示缩放会干扰视口 CSS 断点，见 RUNBOOK 已知坑）。

### 断言规模（每轮更新，下降 = 回归 = 冻结发版）

- e2e **69** 项（迁移一致性 7 · settings 9 · todo CRUD 15 · 输入校验 13 · 状态机 10 · 汇总计数 7 · raw schema 约束 4 · 迁移幂等 3 · HTTP 冒烟 1，服务离线时该节降级跳过计 68；在线 69）
- audit-http **52** 项（服务就绪 1 · health/settings 5 · 新建 12 · 列表详情 7 · 状态流转 9 · summary 11 · 删除 6 · 未知路由 1）
- typecheck 4 包全绿（strict + noUncheckedIndexedAccess）
- CI：ubuntu / windows / macos 三平台 verify 门禁 + tag 触发 Release

## 明确不做（当前阶段，宪法第六条）

实时汇率 · 视频会议 · 第三方 IM 集成 · 插件市场 · SaaS 多租户计费

## 下一轮入口

r3：日程与待办双向联动（待办页已就位，日程实体与联动规则待设计）。
