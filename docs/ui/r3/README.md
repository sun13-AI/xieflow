# r3 · 截图矩阵（日程页月视图 + 联动徽标 + 工作台今日日程 + 待办激活态，共 11 张）

截图与实现同一提交（AGENTS.md 第一条）。复拍命令：

```bash
# 起服务（另开窗口保持会话存活）
powershell -File scripts\shot.ps1 up
powershell -File scripts\shot.ps1 shots -Round r3   # r3 清单 11 张（06/10 真实链路：脚本在两拍之间真实执行改期，拍后清理）
powershell -File scripts\shot.ps1 down
```

任务单要求的 6 类形态（空态/有日程/建弹窗/联动徽标/改期同步后/窄屏）全部覆盖，另补 5 张（工作台今日日程卡、加载态、错误态、改期同步后、待办 tab 激活）。**返工 #1 修正**：06/10 曾逐字节相同（seed 在截图前一次性完成，两拍同一数据状态）——现 seed 分两拍，改期动作真实发生在 06 与 10 之间，两图 sha256 可区分。

| 文件 | 状态 | 钉态 seam | 断言对照 |
|---|---|---|---|
| 01-schedule-empty.png | 日程月视图空态（2026 年 11 月网格 + 「本月暂无日程——点网格中的任意日期开始安排」+ 今天 15 日高亮） | `?page=schedules&shot=schedule-empty` | e2e「新库 schedules 为空」；audit「GET 空区间 -> 200（空数组）」 |
| 02-schedule-month.png | 月视图有日程（15 日两条、16 日每日站会、17 日关联日程、20 日月度复盘；长标题两行折行，见返工 #1 F） | `?page=schedules&shot=schedule-data` | e2e「循环日程实例化（computeRepeatInstances）」节；audit「区间查询含刚建的 2026-11-17 日程」 |
| 03-schedule-modal.png | 新建日程弹窗（标题 200 字上限计数 / 日期 / 起止时间 / 重复下拉 / 关联待办下拉 + 联动提示） | `?page=schedules&shot=schedule-modal` | audit「POST 合法日程 -> 201」「POST 空日程标题 -> 400」「POST 非法日期（2-30）-> 400」「POST 非法 repeat（hourly）-> 400」等分支 |
| 04-schedule-badge.png | 联动徽标（关联日程块右侧待办状态徽标：进行中 / 已完成 两态） | `?page=schedules&shot=schedule-badge` | audit「生成日程 todo_id 关联该待办」；e2e「待办设 due_date 自动生成关联日程」；徽标文案取自待办 status 状态机 |
| 05-schedule-narrow.png | 窄屏（488×900：月网格两列纵排、周头隐藏、工具条纵排，`?narrow=1` seam）；**返工 #1 D**：钉态种子落本月第一周（11-02 周一晨会 / 11-04 关联样本+进行中徽标 / 11-06 周五复盘），窄屏下块/徽标布局有实证 | `?page=schedules&shot=schedule-narrow&narrow=1` | 无 UI 形态（CSS 断点规则，确定性窄屏钉态；底部截断属视口滚动裁切，同 r2 先例） |
| 06-schedule-live.png | **真实链路·改期前**（脚本 seed 待办 → 经 `PATCH /api/todos/:id/due-date` 设今天 → 自动日程落在今天 15 日格，画面上 18 日格为空；无钉态参数） | 无（真实路径） | audit「建待办（带 dueDate）自动生成关联日程」+「生成日程 date = 待办 dueDate」的端到端实证 |
| 07-workbench-today.png | 工作台「今日日程」卡（10:00–11:00 需求评审会 / 15:00–16:00 写 r3 复验材料）+ 工作台卡 schema v3 | `?shot=workbench` | e2e「settings 读写」节 +「日程改期回写待办 due_date（联动闭环）」；卡片数据源 GET /api/schedules?from=今天&to=今天 |
| 08-schedule-loading.png | 日程页加载态（「正在加载日程…」卡） | `?page=schedules&shot=schedule-loading` | 无独立断言（加载 phase 由 fetchMonth 的 pending 态保证；证据为 HTTP 层区间查询 200 链路 + 本图） |
| 09-schedule-error.png | 日程页错误态（语义化文案「服务未启动或网络异常，请稍后重试」，不暴露原始 5xx） | `?page=schedules&shot=schedule-error` | 无独立断言（语义化映射在 httpClient.ts；真实场景同 r2 已实测） |
| 10-schedule-moved.png | **真实链路·改期同步后**（06 拍完，脚本经 `PATCH /api/todos/:id/due-date` 把 seed 待办从今天改到 today+3 → 自动日程**离开 15 日格、出现在 18 日格**并带「进行中」徽标；sha256 与 06 不同，改期动作在两拍之间真实发生） | 无（真实路径） | audit「待办改期同步日程 date（反向联动闭环）」+「PATCH 待办改期 -> 200」 |
| 11-todos-tab.png | **三 tab 壳下的待办 tab 激活态**（待办蓝药丸激活；真实数据路径无 shot 参数：计数卡/四象限消费真实 api 待办） | 无（`?page=todos` 直达） | audit「GET 列表 -> 200」+ summary 计数组的端到端形态；e2e「todo 状态机」的状态徽标文案 |

说明与已知坑（r3 实测 + 返工 #1 更新）：

- **联动双向闭环的证据分工**：方向一「待办改期 → 日程变」由 06（改期前）→ 10（改期后）前后对照实拍 + audit 双向断言锁；方向二「日程改期 → 待办 dueDate 回写」由 audit 断言锁（HTTP 层无可视形态，日历上只体现为日程块落在新日期格）。
- **07 工作台卡的徽标**：工作台钉态不带待办列表，故卡片两条日程**不显示**待办状态徽标；徽标形态以 04-schedule-badge 为准（诚实注记，非缺陷）。
- **重复日程的月视图形态（返工 #1 A 后如实改写）**：repeat=weekly/monthly/daily 的日程经 `GET /api/schedules` 区间查询返回本体 + 窗口内实例（锚日在窗外的循环日程同样展开），api 层并集去重（同 id 同 date 本体优先）——HTTP 层 23 条专项断言锁死（audit「schedules repeat instances over HTTP」节：weekly 4 周窗 4 条、锚日窗外 2 条、monthly 2 月窗收敛 02-28、daily 封顶 100 等），返工前该描述曾与实测不符（实例展开失效）。02 中的「每日站会」等为钉态种子。
- **月格日程块标题（返工 #1 F）**：`.cal-chip-title` 改为两行折行 + 截断（`-webkit-line-clamp: 2`），短标题完整可读，长标题不再被单行省略号裁没；悬停 title 仍有全文。
- **06/10 同图根因（返工 #1 B，已修）**：原 seed 段在任何截图开始前一次性完成两条待办的建+改期，06 与 10 两次截图同一 URL、同一数据状态 → 逐字节相同。现 seed 分两拍：06 拍「只有今天一条」→ PATCH due-date 到 today+3 → 再拍 10；两图 sha256 可区分。
- **11 待办激活态（返工 #1 C）**：`?page=todos` 直达（无 shot 参数）走真实数据路径，三 tab 壳的待办激活形态补齐证据。
- PS 5.1 `Invoke-RestMethod` 发中文 body 会按 ANSI 编码（r2 坑），本轮 seed 一律用纯 ASCII 标题 + UTF-8 字节数组。
- `shot.ps1 shots` 连拍偶发一次 headless 进程无产出（exit 0 但无 png），重跑即过——脚本已按文件存在性守卫。
- 拍前若 api 是旧进程（schemaVersion=2），需先 `shot.ps1 down` + `up` 重启，否则页面无日程路由（r3 新增：`/api/health` 返回 schemaVersion=3 才算就绪）。
- 01 底行与 05 底部属视口滚动裁切（r2 先例一致），非布局破坏。
