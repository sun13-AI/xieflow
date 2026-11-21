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
pnpm run test:all    # typecheck + 文档契约 + 文案扫描 + e2e（3665 断言）+ HTTP 审计（2802 断言）
```

- 打包：`pnpm run pack`（免安装目录 `release/xieflow-portable/`，双击 `start.cmd` 即用）/ `pnpm run dist`（setup zip）；均单端口 8080，数据落目录内 `data/`
- 部署三路径（网络版 / docker 私有化 / 单机版）+ 备份恢复搬迁 + FAQ 见 [docs/DEPLOY.md](docs/DEPLOY.md)；自检 `pwsh scripts/verify-deploy.ps1`
- 想研究 agent 流水线：先读宪法/编制/RUNBOOK，再看任意一轮的 [复验报告](docs/feedback/)（末行 VERDICT）→ [截图矩阵](docs/ui/) → [员工履历](docs/staff/)

##  milestones

M0 立项 ✅ → M1 待办+日程 ✅ → M2 项目+看板 ✅ → M3 多维表格 ✅ → M4 文档 ✅ → M5 AI 工作台 ✅ → M6 知识库 RAG ✅ → M7 导图+白板 ✅ → M8 组织管理 ✅ → M9 网络版 ✅ → M10 多端与单机版 ✅；**11 个里程碑全部达成**（r21 收官），此后 r22~r33 持续功能补强与遗留清理。进度看板：[docs/plan.md](docs/plan.md)。

## 界面与测试对照

按宪法第一条：**界面更新必须带截图证据（每次，无例外）**，截图与实现同一提交。当前轮 r43 会议室设备与智能推荐（设备徽标 + 帮我推荐面板；七张矩阵 + 二十 tab 壳同批重拍，tab 数不变）：

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-equipment-empty.png](docs/ui/r43/01-equipment-empty.png) | 「会议」tab 存量会议室无设备空态徽标 | e2e「r43 设备·NULL 归一为空」；audit「建室不传设备默认空数组」 |
| [02-equipment-badges.png](docs/ui/r43/02-equipment-badges.png) | 会议室卡片设备徽标（投影/白板/视频会议/电话会议） | e2e「r43 web·设备徽标 seam」；audit「会议室列表设备字段真回带」 |
| [03-recommend-panel.png](docs/ui/r43/03-recommend-panel.png) | 预约表单「帮我推荐」面板：人数/设备四项/时段输入 + 按钮 | e2e「r43 web·帮我推荐按钮 seam」；audit「GET /api/rooms/recommend -> 200」 |
| [04-recommend-results.png](docs/ui/r43/04-recommend-results.png) | 推荐结果：8 人+投影按容量最接近升序（8 座在前、12 座在后），点选回填 | e2e「r43 推荐·容量最接近升序」；audit「手算·按容量最接近升序」 |
| [05-recommend-conflicts.png](docs/ui/r43/05-recommend-conflicts.png) | 冲突原因：容量不足/设备缺失/时段冲突回带会议 id/停用 | e2e「r43 原因·按序给全」；audit「冲突原因·回带冲突会议 id」 |
| [06-recommend-narrow.png](docs/ui/r43/06-recommend-narrow.png) | 窄屏 488px：推荐面板纵排 + 底部导航「更多 ›」 | e2e「r43 截图·七张 SHA256 互异」；headless CDP 钉态 |
| [07-recommend-error.png](docs/ui/r43/07-recommend-error.png) | 错误态：非法人数/设备的 400 红条 | e2e「r43 需求·非法设备被拒」；audit「4xx·非法设备 -> 400」 |
| [shell/](docs/ui/shell/README.md) | 二十 tab 壳基线（r43 同批重拍，会议页含设备徽标） | e2e「r43 截图·二十 tab 壳同批重拍 20 张」 |

**历史逐轮截图索引（r1~r32 全量、逐张对照断言）见 [README 归档](docs/README-ARCHIVE.md) 与 [docs/ui/](docs/ui/) 各轮 README**；矩阵 SHA256 互异、同态组仅 r4 已披露 2 组。

## 测试与断言

### 断言规模（每轮更新，下降 = 回归 = 冻结发版）

- **当前 r43**：e2e **3665**（服务离线口径；api 在线 +1）· HTTP audit **2802** · check:text 文案扫描 **0 命中** · typecheck 5 包全绿；**无一条断言被删**（+114 / +99），仅期望值/标签随行为推进。
- **r43 渲染层**：会议室设备徽标 + 推荐面板 → 七张矩阵 + 二十 tab 壳同批重拍（tab 数不变）；DOC-CONTRACT 文档契约套件随 schema v27 同步。
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
