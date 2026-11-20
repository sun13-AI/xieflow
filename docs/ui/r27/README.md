# docs/ui/r27 · 报表中心截图矩阵（跨模块数据看板）

- **轮次**：r27（M10 后功能补强）。改渲染层（新增第十七 tab「报表」+ KPI 卡 + 明细表 + 时间范围），按 AGENTS.md 第一条：七张矩阵 + 十七 tab 壳基线**同批重拍**，截图与索引/README 同一提交。
- **纪律**：全程 headless（`shot.ps1` 的 Edge `--headless=new` + `-WindowStyle Hidden`）；PowerShell 只 ASCII；截图脚本用 `%TEMP%\r27-shot\scratch.db` 指向 api（仓库 `data/xieflow.db` 只读未写——该库 `server.mode=remote`，若无 scratch 会跳登录页，复拍必须带该环境变量）；六张宽屏状态用 `?shot=` 钉态，窄屏用 `?narrow=1` 显式钉态，`real` 数据链路另由 e2e/audit 真 HTTP 断言锁定。
- **复拍命令**：`$env:XIEFLOW_DB_PATH = Join-Path $env:TEMP 'r27-shot\scratch.db'; powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\shot.ps1 all -Round r27`

| 图 | 形态 | 对应断言 |
|---|---|---|
| [01-reports-overview.png](01-reports-overview.png) | 报表总览有数据：六张 KPI 卡（数值 + 环比 + 迷你条）+ 当前选中「待办完成率」明细表 + 时间窗口条 | e2e「r27 总览六指标齐备 / 六指标手算核对」；audit「GET /api/reports/overview 真 HTTP 装配」 |
| [02-reports-empty.png](02-reports-empty.png) | 空数据：六卡全 0、环比 0、迷你条零高度基线 + 明细空态引导 | e2e「r27 空数据六指标全 0 不崩」；audit「空范围六指标全 0」 |
| [03-reports-range.png](03-reports-range.png) | 时间范围切到「近 90 天」：按钮蓝框激活 + 窗口条与六卡按新范围重算 | e2e「r27 时间预设 7/30/90 天」；audit「?from=&to= 闭区间回显」 |
| [04-reports-drilldown.png](04-reports-drilldown.png) | 点「审批时效」卡下钻：卡片蓝框选中 + 明细表按单显示耗时与终态 | e2e「r27 单项下钻与总览同口径 / 明细按实体 id 过滤」；audit「GET /api/reports/approvalSla 真 HTTP 回带」 |
| [05-reports-six-cards.png](05-reports-six-cards.png) | 六卡齐：待办完成率 / 日程分布 / 看板吞吐 / 审批时效 / 库存周转 / 文档产出同屏 | e2e「r27 KPI 卡顺序与枚举一致」；audit「六指标一次返回」 |
| [06-narrow.png](06-narrow.png) | 488×1000 `?narrow=1`：卡片两列 + 工具栏换行 + 明细表收窄（第三列隐藏） | `force-narrow` seam；逐张目验 |
| [07-error.png](07-error.png) | r27 报表链路语义化连接失败 + 重试按钮（与 r26/07 字节不同） | `reports-error` PINNED 钉态 |
| `docs/ui/shell/` 17 张 | 十七 tab 激活态同批重拍，新增 `reports-tab-active.png` | `Invoke-ShellBaseline`；e2e 逐张复算 |

## SHA256 自查（矩阵 7/7 互异；壳 17/17 互异）

- **矩阵 7 张**（亲算 `Get-FileHash -Algorithm SHA256` 前 8 位）：`01=6A6C6CC5` · `02=B90D5349` · `03=1878DA2D` · `04=248B4CA2` · `05=B0EC44E6` · `06=AC6C6C7B` · `07=7C48B2B2` —— **7/7 互异**。
- **壳基线 17 张**（亲算）：`workbench=0881BB79` · `todos=0EB05F7B` · `schedules=72A450E6` · `projects=304317A6` · `board=7F79DBD1` · `bases=09653EB2` · `docs=1C60DD8C` · `chat=BD47C6FA` · `knowledge=6812E127` · `mindmap=183426BE` · `whiteboard=18C516D4` · `approval=6B45A8D6` · `assets=D010C64F` · `unit-tasks=0B3869B9` · `org=1C14209A` · `notifications=B15EF500` · `reports=BFC9BDD2` —— **17/17 互异**，与 `docs/ui/shell/README.md` 的 R27 当前块逐字一致。
- 矩阵↔壳交叉重叠 **0**；全库 **275 PNG / 273 互异**，同态组仅 r4 已披露 2 组（`9E5C0C23`、`8397A028`），r27 零新增。

> e2e「r27 七张 PNG SHA256 两两互异」「shell README R27 哈希与实际文件逐字一致」逐张复算锁定本表。矩阵↔壳交叉重叠 0；全库 PNG 计数与互异数见根 README「界面与测试对照」与 `docs/ui/shell/README.md`。
