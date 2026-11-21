# 协流 XieFlow — AI 原生协同办公系统

> Agent 自驱迭代的协同办公平台：待办 / 日程 / 项目 / 看板 / 多维表格 / 文档 / AI 工作台 / 知识库 RAG / 导图 / 白板 / 审批 / 物资 / 组织 / 通知 / 会议 / 全局搜索。
> 产品方向参照 [多宝鱼](https://duobaoyu.work/)，迭代方法论参照 [IKanBot](https://github.com/chenpeigen2/IKanBot)。
> **本仓库本身就是一个 agent 自驱迭代的活样本**：每轮由 AI 员工（研发 / 使用者 / UI 审查官）完成，证据全部入库。
> 制度：[AGENTS.md](AGENTS.md) 宪法 · [workflows/org.md](workflows/org.md) 编制 · [RUNBOOK.md](RUNBOOK.md) 流程 · [docs/plan.md](docs/plan.md) 看板 · [docs/feedback/](docs/feedback/) 复验报告 · [docs/staff/](docs/staff/) 履历。

## 快速开始

```bash
pnpm install
# 一键启动（推荐）：双击 start.cmd，或：
powershell -File scripts\start.ps1 start   # api:8787 + web:5173
powershell -File scripts\start.ps1 stop
# 开发模式：pnpm dev:api / pnpm dev:web
pnpm run test:all    # typecheck + 文档契约 + 文案扫描 + e2e（3981 断言）+ HTTP 审计（3135 断言）
```

- 打包：`pnpm run pack`（免安装目录 `release/xieflow-portable/`，双击 `start.cmd` 即用）/ `pnpm run dist`（setup zip）；均单端口 8080，数据落目录内 `data/`
- 部署三路径（网络版 / docker 私有化 / 单机版）+ 备份恢复搬迁 + FAQ 见 [docs/DEPLOY.md](docs/DEPLOY.md)；自检 `pwsh scripts/verify-deploy.ps1`
- 想研究 agent 流水线：先读宪法/编制/RUNBOOK，再看任意一轮的 [复验报告](docs/feedback/)（末行 VERDICT）→ [截图矩阵](docs/ui/) → [员工履历](docs/staff/)

##  milestones

M0 立项 ✅ → M1 待办+日程 ✅ → M2 项目+看板 ✅ → M3 多维表格 ✅ → M4 文档 ✅ → M5 AI 工作台 ✅ → M6 知识库 RAG ✅ → M7 导图+白板 ✅ → M8 组织管理 ✅ → M9 网络版 ✅ → M10 多端与单机版 ✅；**11 个里程碑全部达成**（r21 收官），此后 r22~r33 持续功能补强与遗留清理。进度看板：[docs/plan.md](docs/plan.md)。

## 界面与测试对照

按宪法第一条：**界面更新必须带截图证据（每次，无例外）**，截图与实现同一提交。当前轮 r59 为**a11y 修复轮：日历格键盘可达 + 激活 tab 对比度 AA + 语义增强**（改了渲染层 `SchedulesPage.tsx` / `styles.css` / 10 个 TSX 语义标签 → 日程焦点/键盘六态矩阵 + **20 壳同批重拍**；索引见 [r59 矩阵](docs/ui/r59/README.md) 与 [shell 当前块](docs/ui/shell/README.md)，r57→r59 changed=20/same=0 如实披露：激活底色变化出现在每张壳图）。上一轮 r57 为**P1×3 性能修复轮：listForms / listBoardCards 批量读 + Todos 渲染 memo**（改了渲染层 `TodosPage.tsx` / `App.tsx` / 新增 `TodoItem.tsx` → 七态矩阵 + **20 壳同批重拍**；索引见 [r57 矩阵](docs/ui/r57/README.md) 与 [shell 当前块](docs/ui/shell/README.md)，r49→r57 changed=6/same=14 如实披露）。上一轮 r54 为**P0-1 补修轮：remote 业务路由统一 admin 闸门**（P0-1 补修：remote 下除公开入口 / 认证探针外所有 `/api/*` 业务路由要求 `user:manage`，非 admin 403；无功能新增、无渲染层改动，沿用 r49 图证与七态矩阵 + 20 壳索引，透明声明见下方 r54 段）；上一轮 r53 为安全漏洞修复轮；上一轮 r51 为台账精度修正轮，上一轮 r50 为里程碑体系复审轮；上一功能轮 r49 工作区数据备份与恢复（总入口）：工作台设置区新增「数据备份与恢复」卡（导出 JSON / 选文件预览校验 / 二次确认单事务恢复 / 重载提示），**二十 tab 数量不变、壳基线同批重拍**；图证索引见 [r49 矩阵](docs/ui/r49/README.md) 与 [shell 当前块](docs/ui/shell/README.md)：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [r59/01-schedule-month.png](docs/ui/r59/01-schedule-month.png) | 日历月视图默认态：42 格 role=button 全部可 Tab | CDP「42/42 日历格 tabindex=0 / Tab 覆盖 42/42」；e2e「r59 P1-1·日历格补 tabIndex={0}」 |
| [r59/06-tab-active.png](docs/ui/r59/06-tab-active.png) | 激活 tab 白字压 `#2f68e5`，实测 4.96:1 ≥ AA | CDP「激活 tab 白字对比度 4.96:1 ≥4.5」；e2e「r59 P1-2·白字压激活底 ≥4.5」 |
| [r57/01-dep-empty.png](docs/ui/r57/01-dep-empty.png) | 前置面板空态：memo 化行组件 + 候选仅在面板开启时计算 | e2e「r57 P1-3·候选计算移入 panelOpen 分支」；audit「r34 空前置列表」 |
| [r57/05-dep-cycle-error.png](docs/ui/r57/05-dep-cycle-error.png) | 循环依赖红条：memo 化行组件的错误态 | audit「r34 4xx·环文案明确」；e2e「r34 web·循环依赖红条 seam 在场」 |
| [r57/07-dep-error.png](docs/ui/r57/07-dep-error.png) | 409 阻塞错误红条：状态流转被拒 | audit「r34 409·B 前置未完成转 done 被拒」 |
| [shell/](docs/ui/shell/README.md) | **二十 tab 壳基线（r57 同批重拍，r49→r57 changed=6/same=14 如实披露）** | e2e「r57·shell README 当前哈希块与 20 张实际文件一致」 |

> **r49 历史矩阵索引（沿用）**：[01-backup-card.png](docs/ui/r49/01-backup-card.png) … [07-error.png](docs/ui/r49/07-error.png) 与「数据备份与恢复」卡、**二十 tab 数量不变**、**二次确认**对话框图证逐字保留在 [r49 索引](docs/ui/r49/README.md)，本轮不复制伪造、不覆盖历史字节。

> **返工 #1 透明声明**：本轮为纯数字口径修复，**无渲染层改动，沿用 r49 七图 + 二十 tab 壳图**，不新增/不重拍截图；上表索引与哈希块逐字沿用 r49，未作改动。

> **r53 安全修复透明声明**（沿用 r50 里程碑复审 / r51 台账精度三处声明）：本轮无渲染层改动、无功能新增，**沿用 r49 七图 + 20 壳**；截图 mtime / SHA256 哈希块与 r49 索引逐字沿用，不新增、不重拍、不复制伪造图证（三处声明见本 README、[r50 报告](docs/feedback/2026-11-21-r50-yanfa.md)、[shell README R50 块](docs/ui/shell/README.md)）。

> **r54 补修透明声明**：本轮只加 remote 统一 admin 闸门与真 HTTP 断言，**无渲染层改动、无功能新增**，沿用 r49 七图 + 20 壳；截图 mtime / SHA256 哈希块与 r49 索引逐字沿用，不新增、不重拍（三处声明同样见 [r50 报告](docs/feedback/2026-11-21-r50-yanfa.md) 与 [shell README R50 块](docs/ui/shell/README.md)）。

**r49 危险区声明**：备份白名单只含 38 张业务表，`sessions` / `change_log` / `entity_versions` / `users` 四类认证与同步运行时表既不导出也不替换；恢复先全量校验再单事务替换，坏 JSON / 未知表 / 版本不兼容 / 无二次确认一律拒绝且零半态（详见 [docs/plan.md r49 任务单](docs/plan.md)）。

**历史逐轮截图索引（r1~r32 全量、逐张对照断言）见 [README 归档](docs/README-ARCHIVE.md) 与 [docs/ui/](docs/ui/) 各轮 README**；矩阵 SHA256 互异、同态组仅 r4 已披露 2 组。

## 测试与断言

### 断言规模（每轮更新，下降 = 回归 = 冻结发版）

- **当前 r59**（a11y 修复轮：`SchedulesPage` 日历格 `tabIndex=0` + Enter/Space 同处理，CDP 实测 42/42 可达、Enter/Space 各开 modal 1 次；`.tab-active` 用 `--accent-strong:#2f68e5`，白字对比度 4.28→**4.96:1** ≥ AA；18 模态 aria-modal + 19 th scope + 全局 `:focus-visible`）：e2e **3981**（服务离线口径；api 在线 +1 = 3982）· HTTP audit **3135**（+8 a11y 静态/计算契约，零删除）· check:text 文案扫描 **0 命中** · typecheck 5 包全绿；DOC-CONTRACT **119** checks（schema v27 未变，ROUND 推进 r59，r54~r57 历史专段保留）。P2 其余项按 r58 审计记账不改。
- **r57**（P1×3 性能修复轮，`listForms` / `listBoardCards*` 批量读 + Todos 渲染 `TodoItem`/memo；SQL 次数 ≤2、HTTP 120 条 3.2/4.2ms、CDP 1000 条 17 字输入 ScriptDuration 285ms）：e2e **3962**（服务离线口径；api 在线 +1 = 3963）· HTTP audit **3127**（+7 性能基线，零删除）· check:text 文案扫描 **0 命中** · typecheck 5 包全绿；DOC-CONTRACT **111** checks（schema v27 未变，ROUND 原为 r57，r50~r54 历史专段保留）。P1-1/P1-2/P1-3 全修；P2×3（待办无虚拟化 / 备份无流式 / 搜索全表扫描）按审计记账不改。
- **r54（当前 r54 / 当前轮 r54 时的历史记录；当前 r57 见上）**（P0-1 补修轮，remote 统一 admin 闸门：除公开入口 / 认证探针外所有业务路由要求 `user:manage`，user 403 / admin 200；无渲染层改动）：e2e **3962**（服务离线口径；api 在线 +1 = 3963）· HTTP audit **3127**（复现 + 11 业务族 GET/DELETE 断言，零删除）· check:text 文案扫描 **0 命中** · typecheck 5 包全绿；DOC-CONTRACT **111** checks（schema v27 未变，ROUND 原为 r54，r50~r53 历史专段保留）。r53 六项修复保持关闭（P0-1 注册闸门 / P0-2 mode 保护 / P1-1 审批 actor / P1-2 备份 admin 闸门 / P2-2 settings 白名单 / P2-3 物资 operator）；local 单机匿名语义零变化。
- **r51**：台账精度修正（DOC-CONTRACT 105 checks，台账四证核实）。
- **r49**：e2e 3922 / audit 2957（e2e +92 / audit +66 全为备份恢复新增）· 备份卡渲染层改动 → 七图 + 20 壳同批重拍；schema v27。
- 纪律：断言只涨不缩；禁自洽占位；关键行为做变异红相留痕（改坏实现 → 断言变红 → 逐字节还原全绿）。
- **逐轮规模变化（r1~r32 的完整记账）见 [README 归档](docs/README-ARCHIVE.md)**；CI smoke 正则随 schema 版本同步至 v27；CI 三平台 verify + tag 触发 Release。

## 核心概念（实现唯一入口）

- **仓库即状态 + 双 VERDICT**：进度/证据/报告全落仓库；研发→使用者 VERDICT + UI 阻断岗 UI-VERDICT 双通过才发版；报告三态纪律（已做并验过 / 已做但没验 / 没做）。
- **状态机/规则全集中**：shared 定义 todo/schedule/board/field/approval/unit-task/auth/offline/deploy/docHistory/formula/globalSearch/todoDeps/tableGroups/cardMeta/forms 等唯一入口，api/web 零算法分支；schema 走 `user_version` 迁移队列（当前 v27）。
- **AI 工作台**：mock-planner + 12 工具真服务层 + 多轮上下文 + 三类产物 + 27 条录制回放；知识库 TF-IDF 检索 + RAG 引用溯源（无命中不编造）；全程 mock 零 token，接真实模型留接口。
- **协同办公模块**：块级文档（Markdown 双向 + AI 修订 + 版本历史/回收站 + HTML/Word 导出）、思维导图、白板画布（AI 建板 + 避让）、审批流、物资/单位任务、组织通讯录、通知中心、会议预约（冲突检测）、报表中心、全局搜索（跨 8 源只读）。
- **网络与单机**：PBKDF2 本地会话 + remote 模式统一鉴权（401 清假登录态）+ 多端同步乐观锁 + 离线队列/PWA + docker-compose 私有化 + portable 单机版。
- 逐轮核心概念的完整演进记录见 [README 归档](docs/README-ARCHIVE.md)。

## 明确不做（当前阶段）

实时汇率 · 视频会议 · 第三方 IM 集成 · 插件市场 · SaaS 多租户计费

## 许可证

[MIT](LICENSE)
