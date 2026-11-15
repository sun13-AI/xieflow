# 协流 XieFlow · 路线图与轮次记账

> 宪法见设计包 AGENTS.md；轮次规则见 RUNBOOK.md（均在 D:\work\好东西\xieflow-design\）。

## 里程碑总览

M0 立项 → M1 待办+日程 → M2 项目+看板 → M3 多维表格 → M4 文档 → M5 AI 工作台 v1
→ M6 知识库 RAG → M7 导图+白板 → M8 组织管理 → M9 网络版 → M10 多端与单机版

## 进度看板（每轮更新）

| 轮 | 任务 | 状态 | 版本 | 断言规模 | VERDICT |
|----|------|------|------|----------|---------|
| r1 | M0 仓库骨架 | ✅已发版（本地 tag；push 待配 remote） | v0.0.1 | e2e 42 | 通过 |
| r2 | M1 第 1 片：待办 CRUD UI + 四象限 | ✅已发版（初验双打回→返工#1→双 VERDICT 通过） | v0.0.3 | e2e 69 · audit 52 | 通过（waizhuan）+ UI 通过（观察员） |

附加交付（r2 内 lead 直做，已入库 8e4fb9b）：
- 一键启动：start.cmd 双击 / scripts\start.ps1 start|stop|status（三轮全链路验证；期间排掉「僵尸 api 抢 8787」环境坑，非脚本缺陷）
- 打包命令：pnpm run pack（免安装目录）/ pnpm run dist（setup zip）——对齐 IKanBot pack/dist 语义；portable 目录实测 boot：api 200 + web 200 @8080；绕开 Node 24.14 cpSync 目录复制崩溃（0xC0000409），Windows 走 robocopy

状态枚举：⏳待启动 / 🔨研发中 / 🔁返工k / ⏸熔断 / ✅已发版。

## 危险区台账

（空。本轮未触发危险区：无密钥写入、无对外发布、无用户数据删除、依赖均为新增非升级）

## 任务单

### r2 · M1 第 1 片：待办 CRUD UI 与四象限视图
- 目标：todos 数据层已就位（v2 迁移），本轮落 UI——列表 + 新建 + 四象限
- 交付清单：
  1. api 增待办路由（CRUD + 状态流转），web 待办页消费
  2. 四象限视图（q1~q4 分区展示）+ 「今/明/周汇总」计数
  3. 断言：api 路由层 ≥ 20 条新断言（HTTP 侧）
  4. 截图：列表空态 / 新建弹窗 / 四象限视图 / 状态流转后 / 窄屏 ≥ 5 张
- 验收标准：
  1. 全量测试绿，断言规模 ≥ 62（42 + 20）
  2. 截图矩阵 + 索引 + README 同一提交
  3. 发版 v0.0.2
- 前置：r1 已发版

### r3（预占）· M1 第 2 片：日程与待办双向联动
- 前置：r2 已发版

---

## 记账区（每轮追加）

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
