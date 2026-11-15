# 协流 XieFlow · 路线图与轮次记账

> 宪法见设计包 AGENTS.md；轮次规则见 RUNBOOK.md（均在 D:\work\好东西\xieflow-design\）。

### 2026-11-15 · 开源（owner 指令）
- 全历史密钥扫描通过（gho_/ghp_/github_pat_ 仅命中报告内的扫描模式描述文本，无真 token）
- MIT LICENSE + README 开源化（方法论/贡献者入口/目录结构/路线图）+ RUNBOOK 入库（仓库自包含）
- 仓库 sun13-AI/xieflow 设为 public；你朋友可访问 https://github.com/sun13-AI/xieflow
- 记录：开源决策由 owner 在 ask 确认（MIT 许可证选择）

## 里程碑总览

M0 立项 → M1 待办+日程 → M2 项目+看板 → M3 多维表格 → M4 文档 → M5 AI 工作台 v1
→ M6 知识库 RAG → M7 导图+白板 → M8 组织管理 → M9 网络版 → M10 多端与单机版

## 进度看板（每轮更新）

| 轮 | 任务 | 状态 | 版本 | 断言规模 | VERDICT |
|----|------|------|------|----------|---------|
| r1 | M0 仓库骨架 | ✅已发版（本地 tag；push 待配 remote） | v0.0.1 | e2e 42 | 通过 |
| r2 | M1 第 1 片：待办 CRUD UI + 四象限 | ✅已发版（初验双打回→返工#1→双 VERDICT 通过） | v0.0.5 | e2e 69 · audit 52 | 通过（waizhuan）+ UI 通过（观察员） |
| r3 | M1 第 2 片：日程与待办双向联动 | ✅已发版（初验双打回→返工#1→复审：waizhuan P2 修复确认 + ui-reviewer 阻断岗放行） | v0.0.6 | e2e 167 · audit 138 | 通过（waizhuan）+ UI 通过（阻断岗） |

附加交付（r2 内 lead 直做，已入库 8e4fb9b）：
- 一键启动：start.cmd 双击 / scripts\start.ps1 start|stop|status（三轮全链路验证；期间排掉「僵尸 api 抢 8787」环境坑，非脚本缺陷）
- 打包命令：pnpm run pack（免安装目录）/ pnpm run dist（setup zip）——对齐 IKanBot pack/dist 语义；portable 目录实测 boot：api 200 + web 200 @8080；绕开 Node 24.14 cpSync 目录复制崩溃（0xC0000409），Windows 走 robocopy

### 2026-11-15 · r2 复验、返工与发版全记录
- 初验：waizhuan VERDICT 打回（P1 shot.ps1 分离启动 3 冷启 1 存活 / P3 vite 代理 500 错位 / P5 标题无上限）+ ui-reviewer UI-VERDICT 打回（U1×2：tab 激活零证据、三形态缺图；U2：包路径进 UI）
- lead 修 P1（非 watch + HTTP 200 判定，3/3 验证过）；yanfa-r2c 返工 A~G 全清（5b0422c）：断言 e2e 69 / audit 52，截图矩阵 10 张
- 复审：waizhuan VERDICT 通过（独立 3/3 复验）+ ui-reviewer UI-VERDICT 通过（四张新图全补实图，抓到研发加分项）→ 观察员升级门槛进度 1/2
- 发版历程：v0.0.3 CI 红（pwsh 7 只读变量 `$isWindows` 赋值炸，本机 PS5.1 不报）→ v0.0.4 CI 红（Unix pwsh 不支持 Start-Process -WindowStyle）→ **v0.0.5 三平台全绿 + Release 资产核对通过（xieflow-v0.0.5.tar.gz）**
- 宪法新增（owner 指令）：自测全程 headless/隐藏窗口，不弹任何可见窗口
- 教训沉淀：PowerShell 平台差异两连坑（自动变量名 / Windows 专属参数）→ 跨平台 ps1 必须在 pwsh 7 + PS 5.1 双环境验证；本地绿 ≠ CI 绿，tag 前 CI 实证不可省

### 2026-11-15 · r3 研发（yanfa · M1 收官轮）
- 交付：schema v2→v3 迁移（schedules 表：id/title/date/start_time/end_time/todo_id 可空外键 + repeat CHECK none-daily-weekly-monthly）· api 日程路由（CRUD + 区间查询 + 待办↔日程双向联动）· web 日程页（月视图网格 + 点日期建日程 + 关联待办状态徽标）+ 工作台「今日日程」卡
- 规则集中：循环实例化只在 `packages/shared` 的 `computeRepeatInstances`（月末收敛 1-31→2-28、不丢锚日、实例数封顶）；日程守卫（标题/日期/HH:mm/起止倒挂/repeat）同层，api 只做 400/404 映射
- 双向闭环断言：待办改期→日程变（audit「待办改期同步日程 date」）与日程改期→待办 dueDate 回写（audit「日程改期回写待办 dueDate」）各有独立断言，另 e2e 覆盖清空 dueDate 删日程 / 待办删除级联删日程
- 断言规模：e2e 69 → **155**（离线 154）· audit-http 52 → **113**（只涨未缩）；typecheck 4 包全绿；`pnpm run test:all` exit 0（返工 #1 后为 e2e 167 / audit 138，见返工记录）
- 截图矩阵：docs/ui/r3/ 共 10 张（月视图空态/有日程/建弹窗/联动徽标/改期同步后/窄屏 + 工作台今日日程卡/加载态/错误态/真实链路），逐张 read_image 目验
- 已知遗留：① data/xieflow.db 有一条既有待办「22」（非本轮产生，未删用户数据，待 lead/waizhuan 判定）② 工作台「今日日程」卡在钉态下不带待办列表，故卡片条目不显示状态徽标（徽标形态以 04-schedule-badge 为准）③ 版本号 0.0.4→0.0.5 的补正见 yanfa r3 报告自曝节（版本号与发版动作仍属 lead）

状态枚举：⏳待启动 / 🔨研发中 / 🔁返工k / ⏸熔断 / ✅已发版。

## 危险区台账

（空。本轮未触发危险区：无密钥写入、无对外发布、无用户数据删除、依赖均为新增非升级。r3 唯一越界嫌疑项：版本号 0.0.4→0.0.5 的补正，见 yanfa r3 报告自曝节，待 lead 确认）

## 任务单

### r3（进行中）· M1 第 2 片：日程与待办双向联动
- 目标：日程表落库 + 待办排期到日程 + 双向联动（改期互同步）——M1 收官轮
- 交付清单：
  1. schema v2→v3 迁移：schedules 表（id / title / date YYYY-MM-DD / start HH:mm / end HH:mm / todo_id 可空外键 / repeat none-daily-weekly-monthly）
  2. api 路由：CRUD + 按日期区间查询 + 待办联动（待办设到期日自动生成关联日程；日程改期回写待办 due_date）
  3. web 日程页：月视图网格 + 日期点击建日程 + 关联待办的日程显示待办状态徽标；工作台加「今日日程」卡
  4. 断言：e2e ≥+15（迁移/联动/循环实例化）、audit-http ≥+15（含 4xx：非法日期/非法 repeat/越权外键）
  5. 截图：月视图空态 / 月视图有日程 / 建日程弹窗 / 联动徽标 / 待办改期→日程同步后 / 窄屏 ≥6 张
- 验收标准：
  1. 全量测试绿：e2e ≥84、audit ≥67，README 双规模同步
  2. 联动双向闭环有断言锁定（待办改期→日程变 & 日程改期→待办变）
  3. 循环日程实例化规则集中定义在 shared（禁止散落 if-else）
  4. 截图矩阵 + 索引 + README 同一提交
- 前置：r2 已发版（v0.0.5）✅
- 特别项：ui-reviewer 若本轮再抓到 waizhuan 漏掉的 U1，按 org.md 门槛升级为阻断岗（双 VERDICT 并行裁决从本轮生效）

### r4（预占）· M2 第 1 片：项目 + 看板数据层
- 前置：r3 已发版

## 历史轮次（r1~r2 已收档，见下方记账区）

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
