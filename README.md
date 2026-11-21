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
pnpm run test:all    # typecheck + 文案扫描 + e2e（3551 断言）+ HTTP 审计（2703 断言）
```

- 打包：`pnpm run pack`（免安装目录 `release/xieflow-portable/`，双击 `start.cmd` 即用）/ `pnpm run dist`（setup zip）；均单端口 8080，数据落目录内 `data/`
- 部署三路径（网络版 / docker 私有化 / 单机版）+ 备份恢复搬迁 + FAQ 见 [docs/DEPLOY.md](docs/DEPLOY.md)；自检 `pwsh scripts/verify-deploy.ps1`
- 想研究 agent 流水线：先读宪法/编制/RUNBOOK，再看任意一轮的 [复验报告](docs/feedback/)（末行 VERDICT）→ [截图矩阵](docs/ui/) → [员工履历](docs/staff/)

##  milestones

M0 立项 ✅ → M1 待办+日程 ✅ → M2 项目+看板 ✅ → M3 多维表格 ✅ → M4 文档 ✅ → M5 AI 工作台 ✅ → M6 知识库 RAG ✅ → M7 导图+白板 ✅ → M8 组织管理 ✅ → M9 网络版 ✅ → M10 多端与单机版 ✅；**11 个里程碑全部达成**（r21 收官），此后 r22~r33 持续功能补强与遗留清理。进度看板：[docs/plan.md](docs/plan.md)。

## 界面与测试对照

按宪法第一条：**界面更新必须带截图证据（每次，无例外）**，截图与实现同一提交。当前轮 r41 轻量表单收集（创建/填写/汇总；七张矩阵 + 二十 tab 壳基线）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-forms-empty.png](docs/ui/r41/01-forms-empty.png) | 「表单」tab 空态：零表单引导 + 新建入口 + 二十 tab 壳激活态 | e2e「r41 web·空态 seam」「App·二十 tab」；audit「GET 空表单列表 -> 200」 |
| [02-forms-create.png](docs/ui/r41/02-forms-create.png) | 创建表单：标题/说明 + 默认题 + 创建按钮 | e2e「r41 web·创建表单 seam」；audit「POST 建表单 -> 201」 |
| [03-forms-questions.png](docs/ui/r41/03-forms-questions.png) | 问题编辑：文本/数字/单选/勾选四类题 + 添加移除 | e2e「r41 类型·四题白名单」；audit「4xx·未知题型 -> 400」 |
| [04-forms-fill.png](docs/ui/r41/04-forms-fill.png) | 填写视图：按题型渲染控件 + 提交/汇总/返回 | e2e「r41 校验·归一答案」；audit「GET 填写视图 -> 200」 |
| [05-forms-submitted.png](docs/ui/r41/05-forms-submitted.png) | 提交成功：绿色成功条 + 填写态保留 | e2e「r41 web·提交成功 seam」；audit「提交答卷 -> 201」 |
| [06-forms-summary.png](docs/ui/r41/06-forms-summary.png) | 汇总统计：文本列举/总和 60 均值 20/分布 2:1/勾选率 67% | e2e「r41 汇总·数值手算」；audit「汇总·HTTP 手算」 |
| [07-forms-narrow.png](docs/ui/r41/07-forms-narrow.png) | 窄屏 488px：填写表单纵排 + 底部导航「更多 ›」 | e2e「r41 截图·七张 SHA256 互异」；headless CDP 钉态 |
| [shell/](docs/ui/shell/README.md) | 二十 tab 壳基线（r41 同批重拍，新增 `forms-tab-active.png`） | e2e「r41 壳索引·R41 当前哈希块在场」 |

**历史逐轮截图索引（r1~r32 全量、逐张对照断言）见 [README 归档](docs/README-ARCHIVE.md) 与 [docs/ui/](docs/ui/) 各轮 README**；矩阵 SHA256 互异、同态组仅 r4 已披露 2 组。

## 测试与断言

### 断言规模（每轮更新，下降 = 回归 = 冻结发版）

- **当前 r41**：e2e **3551**（服务离线口径；api 在线 +1）· HTTP audit **2703** · check:text 文案扫描 **6596 literals / 25 tsx / 0 命中** · typecheck 5 包全绿；**无一条断言被删**，仅期望值/标签随行为推进。
- 纪律：断言只涨不缩；禁自洽占位；关键行为做变异红相留痕（改坏实现 → 断言变红 → 逐字节还原全绿）。
- **逐轮规模变化（r1~r32 的完整记账）见 [README 归档](docs/README-ARCHIVE.md)**；CI smoke 正则随 schema 版本同步至 v25；CI 三平台 verify + tag 触发 Release。

## 核心概念（实现唯一入口）

- **仓库即状态 + 双 VERDICT**：进度/证据/报告全落仓库；研发→使用者 VERDICT + UI 阻断岗 UI-VERDICT 双通过才发版；报告三态纪律（已做并验过 / 已做但没验 / 没做）。
- **状态机/规则全集中**：shared 定义 todo/schedule/board/field/approval/unit-task/auth/offline/deploy/docHistory/formula/globalSearch/todoDeps/tableGroups/cardMeta 等唯一入口，api/web 零算法分支；schema 走 `user_version` 迁移队列（当前 v25）。
- **AI 工作台**：mock-planner + 12 工具真服务层 + 多轮上下文 + 三类产物 + 27 条录制回放；知识库 TF-IDF 检索 + RAG 引用溯源（无命中不编造）；全程 mock 零 token，接真实模型留接口。
- **协同办公模块**：块级文档（Markdown 双向 + AI 修订 + 版本历史/回收站 + HTML/Word 导出）、思维导图、白板画布（AI 建板 + 避让）、审批流、物资/单位任务、组织通讯录、通知中心、会议预约（冲突检测）、报表中心、全局搜索（跨 8 源只读）。
- **网络与单机**：PBKDF2 本地会话 + remote 模式统一鉴权（401 清假登录态）+ 多端同步乐观锁 + 离线队列/PWA + docker-compose 私有化 + portable 单机版。
- 逐轮核心概念的完整演进记录见 [README 归档](docs/README-ARCHIVE.md)。

## 明确不做（当前阶段）

实时汇率 · 视频会议 · 第三方 IM 集成 · 插件市场 · SaaS 多租户计费

## 许可证

[MIT](LICENSE)
