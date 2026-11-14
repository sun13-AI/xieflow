# 协流 XieFlow — AI 原生协同办公系统

> Agent 自驱迭代的协同办公平台：待办 / 日程 / 项目 / 看板 / 多维表格 / 文档 / AI 工作台。
> 产品方向参照 [多宝鱼](https://duobaoyu.work/)，迭代方法论参照 [IKanBot](https://github.com/chenpeigen2/IKanBot)（双 agent 流水线 + VERDICT 裁决 + 截图矩阵）。
> 设计包见 `D:\work\好东西\xieflow-design\`（README 总纲 / AGENTS.md 宪法 / RUNBOOK 运行手册）。

## 快速开始

```bash
pnpm install
pnpm dev:api         # api 服务 http://127.0.0.1:8787
pnpm dev:web         # web 界面 http://127.0.0.1:5173
pnpm run test:all    # typecheck + e2e（42 断言）
pwsh scripts/shot.ps1 all   # 起服务 → 截图 5 态 → 收服务
```

数据在 `data/xieflow.db`（SQLite 单文件，node-sqlite3-wasm 纯 WASM 免原生编译）。

## 目录结构

```
packages/
  shared/            数据契约与状态机（集中定义，禁止散落 if-else）
  db/                schema.ts（user_version 迁移）/ index.ts（连接）/ mappers.ts（行↔领域对象）
apps/
  web/               React + Vite 界面
  api/               Fastify 健康探针服务（/api/health）
scripts/
  e2e-test.ts        直连服务层断言（内存库 + 文件库 + HTTP 冒烟）
  shot.ps1           截图矩阵脚本（headless Edge，一次性进程，带超时清理）
.github/workflows/   CI：三平台 verify + tag 触发 Release
```

## 核心概念（r1 已落地的部分）

- **迁移纪律**：schema 变更只走 `packages/db/src/schema.ts` 的 `MIGRATIONS` 队列（v1 settings → v2 todos），`user_version` 管理，重开幂等
- **状态机集中**：待办状态流转（open/done/archived）定义在 `packages/shared`，非法流转服务层抛错
- **探针真读库**：`/api/health` 每次 真 写读一次 settings，不只是进程活着

## 界面与测试对照

按 AGENTS.md 立项规则：**界面更新必须带截图证据（每次，无例外）**，截图与实现同一提交。

当前矩阵：[docs/ui/r1/](docs/ui/r1/README.md) —— 1 个页面 × 5 个状态形态 = 5 张实拍：

| 截图 | 形态 | 对应断言（scripts/e2e-test.ts） |
|---|---|---|
| [01-loading.png](docs/ui/r1/01-loading.png) | 加载态（连接本地数据库中） | 无 UI 形态（初始 phase 由 React 状态保证，证据为 e2e「迁移与 schema 一致性」节） |
| [02-empty.png](docs/ui/r1/02-empty.png) | 空态（库就绪、无设置项） | 「新库 settings 为空」「listSettings 数量正确」 |
| [03-ready.png](docs/ui/r1/03-ready.png) | 正常态（设置项 + schema 版本卡） | 「写入后读回 value」「upsert 覆盖旧值」「/api/health 返回 ok」 |
| [04-error.png](docs/ui/r1/04-error.png) | 错误态（api 未启动，红卡 + 提示） | 无 UI 形态（错误分支由 fetchHealth catch 保证） |
| [05-narrow.png](docs/ui/r1/05-narrow.png) | 窄屏形态（meta 纵排，?narrow=1 测试 seam） | 无 UI 形态（CSS 断点规则，DPR 无关的确定性窄屏钉态） |

> 测试 seam 说明：`?shot=` 钉住页面状态、`?narrow=1` 钉住窄屏布局——五种状态在真实运行中都存在，参数只为让 headless 截图确定性捕获（Windows 显示缩放会干扰视口 CSS 断点，见 RUNBOOK 已知坑）。

### 断言规模（每轮更新，下降 = 回归 = 冻结发版）

- e2e **42** 项（迁移一致性 4 · settings 9 · todo CRUD 15 · 状态机 10 · 持久化幂等 2 · HTTP 冒烟 1 · 空串校验 1）
- typecheck 4 包全绿（strict + noUncheckedIndexedAccess）
- CI：ubuntu / windows / macos 三平台 verify 门禁 + tag 触发 Release

## 明确不做（当前阶段，宪法第六条）

实时汇率 · 视频会议 · 第三方 IM 集成 · 插件市场 · SaaS 多租户计费

## 下一轮入口

r2：待办 CRUD UI（列表 + 新建弹窗 + 四象限视图），数据层已在 v2 迁移中就位。
