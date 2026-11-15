# docs/ui/shell · 五 tab 壳激活态基线（返工 #1 B 固化）

> r2 U1-1（工作台）→ r3 U1-2（待办）→ r4 U1-1（工作台+待办+日程三页全漏）——
> 「壳变更 → 继承页 tab 激活证据断档」三轮连漏后，ui-reviewer 建议固化为 shot.ps1
> 常备段，本目录即其产物：**五 tab 激活态最小集**，任何 r4+ 轮次跑
> `powershell -File scripts\shot.ps1 shots -Round r<N>` 时自动重拍（无需手工清单）。
> 规则：**tab/壳变更当轮必须补拍全部激活态**——该规则已写进 scripts/shot.ps1 头部
> 注释（SHELL BASELINE 段），由脚本自动执行，人为遗漏面归零。

| 文件 | 形态 | 对应断言 |
|---|---|---|
| workbench-tab-active.png | 工作台激活（默认页；schema 版本 v4 + 里程碑 M2） | e2e「settings 读写」节；audit「GET /api/health -> 200」UI 形态 |
| todos-tab-active.png | 待办激活（?page=todos；四象限 + 计数卡 + 徽标） | audit「GET 列表 -> 200」+ summary 计数组端到端形态 |
| schedules-tab-active.png | 日程激活（?page=schedules；月视图 + 今天高亮） | e2e「新库 schedules 为空」；audit「GET 空区间 -> 200」 |
| projects-tab-active.png | 项目激活（?page=projects；空态 + 新建入口） | audit「GET /api/projects -> 200」空列表形态 |
| board-tab-active.png | 看板激活（?page=board；无项目空态引导） | audit「GET /api/projects -> 200」空列表形态的看板侧消费 |

## 机制说明

- 拍摄入口：`scripts/shot.ps1` 的 `Invoke-ShellBaseline`（r4 返工 #1 加入）。
- 触发条件：`-Round r4` 及以后的 `shots` / `all` 动作（r1~r3 历史轮不回拍）。
- 落盘：本目录，文件名 `<tab>-tab-active.png`（与 App.tsx PageTab 一一对应；
  新增/改名 tab 时须同步脚本内 $tabs 清单——头部注释已写明）。
- 同态说明：projects-tab-active 与 docs/ui/r4/01、16 为同一真实空态（sha256 同
  9E5C0C23）——壳基线与页面矩阵天然共享同态图，如实注记，不重复计差异。
