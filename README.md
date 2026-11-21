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
pnpm run test:all    # typecheck + 文档契约 + 文案扫描 + e2e（3922 断言）+ HTTP 审计（2957 断言）
```

- 打包：`pnpm run pack`（免安装目录 `release/xieflow-portable/`，双击 `start.cmd` 即用）/ `pnpm run dist`（setup zip）；均单端口 8080，数据落目录内 `data/`
- 部署三路径（网络版 / docker 私有化 / 单机版）+ 备份恢复搬迁 + FAQ 见 [docs/DEPLOY.md](docs/DEPLOY.md)；自检 `pwsh scripts/verify-deploy.ps1`
- 想研究 agent 流水线：先读宪法/编制/RUNBOOK，再看任意一轮的 [复验报告](docs/feedback/)（末行 VERDICT）→ [截图矩阵](docs/ui/) → [员工履历](docs/staff/)

##  milestones

M0 立项 ✅ → M1 待办+日程 ✅ → M2 项目+看板 ✅ → M3 多维表格 ✅ → M4 文档 ✅ → M5 AI 工作台 ✅ → M6 知识库 RAG ✅ → M7 导图+白板 ✅ → M8 组织管理 ✅ → M9 网络版 ✅ → M10 多端与单机版 ✅；**11 个里程碑全部达成**（r21 收官），此后 r22~r33 持续功能补强与遗留清理。进度看板：[docs/plan.md](docs/plan.md)。

## 界面与测试对照

按宪法第一条：**界面更新必须带截图证据（每次，无例外）**，截图与实现同一提交。当前轮 r51 为**台账精度修正轮**（无功能新增、无渲染层改动，沿用 r49 图证与七态矩阵 + 20 壳索引，透明声明沿用 r50 三处声明）；上一轮 r50 为里程碑体系复审轮；上一功能轮 r49 工作区数据备份与恢复（总入口）：工作台设置区新增「数据备份与恢复」卡（导出 JSON / 选文件预览校验 / 二次确认单事务恢复 / 重载提示），**二十 tab 数量不变、壳基线同批重拍**；图证索引见 [r49 矩阵](docs/ui/r49/README.md) 与 [shell 当前块](docs/ui/shell/README.md)：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-backup-card.png](docs/ui/r49/01-backup-card.png) | 备份卡空闲态：导出 / 选文件 / 校验预览 / 恢复（未校验禁用）+ 运行时表不备份提示 | e2e「r49 web·备份卡与确认对话框 seam」；audit「r49 导出 -> 200」 |
| [02-exported.png](docs/ui/r49/02-exported.png) | 导出落盘：备份文件名 + 快照版本 v27 + 备份时间 + 38 表 / 37 行 | e2e「r49 清单表计数/行计数」；audit「r49 导出带附件下载头」 |
| [03-file-selected.png](docs/ui/r49/03-file-selected.png) | 选择文件：文件名回显 + 校验引导 | e2e「r49 web·选文件与校验预览 seam」 |
| [04-preview.png](docs/ui/r49/04-preview.png) | 校验预览：版本 / 时间 / 表计数 / 行计数 + 逐表行数 + 零写入声明 | audit「r49 校验回执 valid=true」+「预览含 todos 行数」 |
| [05-confirm-dialog.png](docs/ui/r49/05-confirm-dialog.png) | 二次确认对话框：覆盖警示 + 勾选确认 + 口令明示 + 取消/确认恢复 | audit「r49 无二次确认 -> 400」+「错拼令牌 -> 400」 |
| [06-narrow.png](docs/ui/r49/06-narrow.png) | 窄屏 488px：卡片按钮纵排 + 文件输入可达 + 底部导航 | e2e「r49 截图·矩阵 SHA256 互异」 |
| [07-error.png](docs/ui/r49/07-error.png) | 错误态：未知表被拒红条「已拒绝，未写入任何数据」 | audit「r49 未知表 change_log -> 422」+「CHECK 违规 -> 400」 |
| [shell/](docs/ui/shell/README.md) | 二十 tab 壳基线（r49 同批重拍，r47→r49 changed=9/same=11 如实披露） | e2e「r49 截图·二十 tab 壳同批重拍 20 张」 |

> **返工 #1 透明声明**：本轮为纯数字口径修复，**无渲染层改动，沿用 r49 七图 + 二十 tab 壳图**，不新增/不重拍截图；上表索引与哈希块逐字沿用 r49，未作改动。

> **r51 台账精度修正透明声明**（沿用 r50 里程碑复审三处声明）：本轮无渲染层改动、无功能新增，**沿用 r49 七图 + 20 壳**；截图 mtime / SHA256 哈希块与 r49 索引逐字沿用，不新增、不重拍、不复制伪造图证（三处声明见本 README、[r50 报告](docs/feedback/2026-11-21-r50-yanfa.md)、[shell README R50 块](docs/ui/shell/README.md)）。

**r49 危险区声明**：备份白名单只含 38 张业务表，`sessions` / `change_log` / `entity_versions` / `users` 四类认证与同步运行时表既不导出也不替换；恢复先全量校验再单事务替换，坏 JSON / 未知表 / 版本不兼容 / 无二次确认一律拒绝且零半态（详见 [docs/plan.md r49 任务单](docs/plan.md)）。

**历史逐轮截图索引（r1~r32 全量、逐张对照断言）见 [README 归档](docs/README-ARCHIVE.md) 与 [docs/ui/](docs/ui/) 各轮 README**；矩阵 SHA256 互异、同态组仅 r4 已披露 2 组。

## 测试与断言

### 断言规模（每轮更新，下降 = 回归 = 冻结发版）

- **当前 r51**（台账精度修正轮，无功能新增）：e2e **3922**（服务离线口径；api 在线 +1 = 3923）· HTTP audit **2957** · check:text 文案扫描 **0 命中** · typecheck 5 包全绿；规模与 r49/r50 持平（无断言增删）；DOC-CONTRACT **105** checks（r50 为 98，本轮 +7 锁台账精度防回退）。r50 台账三条记账（backlog 范围 / CI 拆分轮次 / PID 瞬时性）已按 git 实证精修。
- **r50**：里程碑体系复审（台账补齐 8 行 + 不做清单零越界，DOC-CONTRACT 86→98）。
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
