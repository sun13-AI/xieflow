# docs/ui/shell · 六 tab 壳激活态基线（返工 #1 B 固化，r6 起六 tab）

> r2 U1-1（工作台）→ r3 U1-2（待办）→ r4 U1-1（工作台+待办+日程三页全漏）——
> 「壳变更 → 继承页 tab 激活证据断档」三轮连漏后，ui-reviewer 建议固化为 shot.ps1
> 常备段，本目录即其产物：**tab 激活态最小集**，任何 r4+ 轮次跑
> `powershell -File scripts\shot.ps1 shots -Round r<N>` 时自动重拍（无需手工清单）。
> 规则：**tab/壳变更当轮必须补拍全部激活态**——该规则已写进 scripts/shot.ps1 头部
> 注释（SHELL BASELINE 段），由脚本自动执行，人为遗漏面归零。
> **r6 起为六 tab**（新增「表格」= 多维表格页）：新增 tab 当轮基线自动扩为六张，
> 旧五张一并重拍（壳换新 → 旧页激活态也必须带本轮壳）。

| 文件 | 形态 | 对应断言 |
|---|---|---|
| workbench-tab-active.png | 工作台激活（默认页；schema 版本 v5 + 里程碑 M3） | e2e「settings 读写」节；audit「GET /api/health -> 200」UI 形态 |
| todos-tab-active.png | 待办激活（?page=todos；四象限 + 计数卡 + 徽标） | audit「GET 列表 -> 200」+ summary 计数组端到端形态 |
| schedules-tab-active.png | 日程激活（?page=schedules；月视图 + 今天高亮） | e2e「新库 schedules 为空」；audit「GET 空区间 -> 200」 |
| projects-tab-active.png | 项目激活（?page=projects；空态 + 新建入口） | audit「GET /api/projects -> 200」空列表形态 |
| board-tab-active.png | 看板激活（?page=board；无项目空态引导） | audit「GET /api/projects -> 200」空列表形态的看板侧消费 |
| bases-tab-active.png | 表格激活（?page=bases；**一张表都没有的首次使用空态** + 「＋ 新建表」入口；六药丸壳） | audit「GET /api/tables -> 200」空列表形态；e2e「createTable 自动创建默认字段（7 种类型齐备）」 |

## 机制说明

- 拍摄入口：`scripts/shot.ps1` 的 `Invoke-ShellBaseline`（r4 返工 #1 加入）。
- 触发条件：`-Round r4` 及以后的 `shots` / `all` 动作（r1~r3 历史轮不回拍）。
- 落盘：本目录，文件名 `<tab>-tab-active.png`（与 App.tsx PageTab 一一对应；
  新增/改名 tab 时须同步脚本内 $tabs 清单——头部注释已写明）。
- 同态说明（r6 已校正 r5 的失效表述）：**壳基线六张与各轮页面矩阵均不同字节**——r5 起基线随壳重拍，
  `projects-tab-active` 早已不再与 `docs/ui/r4/01、16` 同字节（r6 实测 `C652DD06`）；
  全库唯一残留的同态组在 r4 目录内部（`r4/01 = r4/16` = `9E5C0C23`），如实注记，不重复计差异。
- r6 起基线扩为六张：`bases-tab-active` 与本轮 `docs/ui/r6/02-bases-empty.png` **刻意不同态**
  （前者 = 一张表都没有的首次使用引导，后者 = 表在场但零行的空表），故哈希互异（`3675C103` vs `D458EB7D`）。
