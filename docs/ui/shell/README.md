# docs/ui/shell · 七 tab 壳激活态基线（返工 #1 B 固化，r8 起七 tab）

> r2 U1-1（工作台）→ r3 U1-2（待办）→ r4 U1-1（工作台+待办+日程三页全漏）——
> 「壳变更 → 继承页 tab 激活证据断档」三轮连漏后，ui-reviewer 建议固化为 shot.ps1
> 常备段，本目录即其产物：**tab 激活态最小集**，任何 r4+ 轮次跑
> `powershell -File scripts\shot.ps1 shots -Round r<N>` 时自动重拍（无需手工清单）。
> 规则：**tab/壳变更当轮必须补拍全部激活态**——该规则已写进 scripts/shot.ps1 头部
> 注释（SHELL BASELINE 段），由脚本自动执行，人为遗漏面归零。
> **r6 起为六 tab**（新增「表格」= 多维表格页）。
> **r8 起为七 tab**（新增「文档」= 文档块编辑器页）：新增 tab 当轮基线自动扩为七张，
> 旧六张一并重拍（壳换新 → 旧页激活态也必须带本轮壳），与 r7 基线哈希全异。
> r7 未新增 tab，但徽章改 r7、工作台 schema 卡推进到 v6，机制仍自动重拍六张；r8 徽章改
> 「r8 · 文档块编辑器（M4 起步）」、schema 卡推进到 **v7**、里程碑改「M4 文档（进行中）」。
> **r9 未新增 tab**，但壳徽章改为「r9 · Markdown 导入导出与 AI 修订（M4 收官）」，
> `shots/all -Round r9` 自动同批重拍七张，与 r8 基线逐位全异。

| 文件 | 形态 | 对应断言 |
|---|---|---|
| workbench-tab-active.png | 工作台激活（默认页；schema 版本 **v7** + 里程碑 M4 文档） | e2e「settings 读写」节；audit「GET /api/health -> 200」UI 形态 |
| todos-tab-active.png | 待办激活（?page=todos；四象限 + 计数卡 + 徽标） | audit「GET 列表 -> 200」+ summary 计数组端到端形态 |
| schedules-tab-active.png | 日程激活（?page=schedules；月视图 + 今天高亮） | e2e「新库 schedules 为空」；audit「GET 空区间 -> 200」 |
| projects-tab-active.png | 项目激活（?page=projects；空态 + 新建入口） | audit「GET /api/projects -> 200」空列表形态 |
| board-tab-active.png | 看板激活（?page=board；无项目空态引导） | audit「GET /api/projects -> 200」空列表形态的看板侧消费 |
| bases-tab-active.png | 表格激活（?page=bases；**一张表都没有的首次使用空态** + 「＋ 新建表」入口；七药丸壳 + r9 徽章） | audit「GET /api/tables -> 200」空列表形态；e2e「createTable 自动创建默认字段（7 种类型齐备）」 |
| docs-tab-active.png | **文档激活（r8 新增，r9 重拍）**（?page=docs；**一篇文档都没有的首次使用空态** + 「＋ 新建文档」/ 导入 / 导出 / 打印预览；七药丸壳 + r9 徽章） | audit「r9 GET 文档列表 -> 200」空列表形态；e2e「建文档默认首块自动在场（不是零块死路）」 |

## r9 哈希自查（七张互异，与 r8 基线逐位全异）

`workbench=7585AF58` · `todos=BC5F5C92` · `schedules=499EEE27` ·
`projects=41F34A28` · `board=EF7AAF78` · `bases=53BE476B` · `docs=1A6D435E`。

r8 基线为 `3DF3CE41 / 07C85BF7 / 2C7B6350 / 775FC85C / C29866EE / 98D9FB4C / A8EC5C84`（七张），
r9 七张全部同批重拍且逐位全异（唯一变化是壳徽章推进到 r9，机制仍生效）。

## 机制说明

- 拍摄入口：`scripts/shot.ps1` 的 `Invoke-ShellBaseline`（r4 返工 #1 加入；r8 `$tabs` 由 6 项扩为 7 项）。
- 触发条件：`-Round r4` 及以后的 `shots` / `all` 动作（r1~r3 历史轮不回拍）。
- 落盘：本目录，文件名 `<tab>-tab-active.png`（与 App.tsx PageTab 一一对应；
  新增/改名 tab 时须同步脚本内 $tabs 清单——头部注释已写明）。
- 同态说明（r6 已校正 r5 的失效表述，r7/r8 沿用）：**壳基线各张与各轮页面矩阵均不同字节**——r5 起基线随壳重拍，
  `projects-tab-active` 早已不再与 `docs/ui/r4/01、16` 同字节（r8 实测 `775FC85C`）；
  全库唯一残留的同态组在 r4 目录内部（`r4/01 = r4/16` = `9E5C0C23`、`r4/05 = r4/13` = `8397A028`），如实注记，不重复计差异。
- r8 起基线扩为七张；`docs-tab-active` 与 `docs/ui/r8/01-docs-empty.png` **刻意不同态**
  （前者 = seed 清理后真实 0 文档态，后者 = 带截图钉态注记的空态钉态），哈希互异（`A8EC5C84` vs `A1FF3DDE`）；
  与 r8 的 `03-docs-editor.png`（真实 14 块，`4D4F5AC9`）也互异——三级形态分形，无一张同字节充数。
