# docs/ui/r4 · 截图索引（项目 + 看板，M2 第 1 片 · 返工 #1 后全量）

> 本轮渲染层变体：五 tab 壳（工作台/待办/日程/项目/看板）+ 项目页 + 看板页。
> **返工 #1（2026-11-15）**：A 默认三列（建项目即带「待办/进行中/已完成」，死路终结）·
> B 壳基线固化 shot.ps1（docs/ui/shell/）· C 加载/错误态补图 · D 项目切换下拉。
> 拍摄纪律（r3 教训 ②落实）：真实链路图 04/05 走 seed 分步拍——POST /api/projects
> （默认三列自动在场，seed 只改名）→ 拍 04（移动前）→ **两拍之间真实执行
> `PATCH /api/cards/:id/move`**（卡 A：To Do → Doing 第 0 位）→ 再拍 05（移动后）。
> 脚本日志「moved live card: id=16 columnId=20 position=0」为证。
> 拍前已验证 `GET /api/health` 的 `schemaVersion=4`（r3 教训 ③：避免旧 api 假象）。

## 同态披露（诚实注记，r3 U1 假图教训的对照组）

- **01 = 16 = shell/projects-tab-active**（sha256 同 9E5C0C23）：三者拍的是**同一真实空态**
  （seed 清理后项目列表为空，钉态参数与真实路径渲染同形态）——同态是数据态相同所致，
  非同字节充数；三张图各自服务不同证据位（空态文案 / 返工重拍 / 壳基线）。
- **05 = 13**（sha256 同 8397A028）：同一移动后看板（真实 api 数据），13 为「看板 tab
  直入（无项目上下文）」形态，与「打开看板」入口到达的看板同态——直入形态本就同态，
  索引如实并注，不重复计数假差异。
- 其余 19 张 sha256 两两互异；04（5ABA480C）≠ 05（8397A028），移动证据链字节级成立。

| 文件 | 形态 | 对应断言 |
|---|---|---|
| 01-project-empty.png | 项目页空态（五 tab 壳「项目」激活；文案=「新建项目会自动带上『待办 / 进行中 / 已完成』三列」——与实现一致） | e2e「createProject 自动创建默认三列」；audit「POST 项目后 GET columns -> 200（默认三列已备）」 |
| 02-project-list.png | 项目列表钉态（3 个项目卡：有描述/无描述两种形态 + 「打开看板」入口） | audit「POST 合法项目 -> 201」「项目列表返回数组」；e2e「createProject 返回自增 id」 |
| 03-project-modal.png | 新建项目弹窗（名称必填 200 字计数 + 可选描述 + 取消/创建） | audit「POST 空项目名 -> 400」「POST 超长项目名（201 字）-> 400」 |
| 04-board-live.png | **真实链路·移动前**（seed 项目「r4 live shot project」：To Do 3 卡 / Doing 1 卡 / Done 0；卡 C 带「进行中」徽标；列=POST 项目自动建的默认列改名） | audit「createProject 自动创建默认三列」前态实证；e2e「移动后源列重排」前态 |
| 05-board-moved.png | **真实链路·移动后**（两拍间真实 PATCH：卡 A 移到 Doing 第 0 位；To Do 收拢为 2 卡、Doing 变 2 卡） | audit「移动后源列重排：B/C 位置收拢为 0/1（连续）」「移动后目标列：卡 A 落 0 位」 |
| 06-board-modal.png | 新建卡片弹窗（标题 + 关联待办下拉 + 「创建（落到「待办」）」目标列提示） | audit「POST 卡 C（关联真实待办）-> 201」「POST 卡关联不存在的待办 -> 400」 |
| 07-board-narrow.png | 窄屏 488×900（?narrow=1 seam，看板三列纵排，卡与徽标全部在视口内） | 无 UI 形态（CSS 断点，确定性钉态；徽标「进行中/已完成」两态在场可读） |
| 08-projects-tab-live.png | 项目页真实数据路径（无 shot 参数，消费真实 api：seed 项目 + 切换目标项目在列） | audit「GET 项目列表 -> 200」端到端实证（拍后 seed 已清理） |
| 09-projects-loading.png | 项目页加载态（「正在加载项目…」钉态） | 无独立断言（fetch pending 态，证据为 GET 200 链路 + 本图；r2 08 先例） |
| 10-projects-error.png | 项目页错误态（「加载失败」+ 语义化文案 + 钉态注释句；r3 U3-1 口径复查通过） | 无独立断言（httpClient.ts 语义化映射；停 api 实测同文案） |
| 11-board-loading.png | 看板页加载态（「正在加载看板…」钉态） | 无独立断言（fetch pending 态，证据为列/卡 GET 200 链路 + 本图） |
| 12-board-error.png | 看板页错误态（「加载失败」+ 语义化文案 + 钉态注释句） | 无独立断言（httpClient.ts 语义化映射） |
| 13-board-direct.png | **看板 tab 直入形态**（无项目上下文直达 ?page=board：默认落第一个项目 + 项目切换下拉在场） | audit「GET /api/projects -> 200」+「POST 项目后 GET columns」直入消费路径；与 05 同态（同板） |
| 14-board-no-columns-modal.png | **A2 防御形态·弹窗**（零列时打开建卡弹窗：创建按钮提示「落到『——（先建列）』」） | 防御分支无独立断言（真实路径已被默认三列消灭——audit「默认三列」锁死正常态；此图为防御态可读性证据） |
| 15-board-no-columns.png | **A2 防御形态·横幅**（零列警示：「『＋ 新建卡片』暂时不可用……」role=alert） | 同上（防御态证据；与 14 构成 A2「不静默」双形态） |
| 16-project-empty-rework.png | 返工 #1 空态文案重拍（与 01 同态——文案已改「自动带上」，重拍留档） | e2e「shared 默认列模板口径」；文案-实现一致性证据 |
| 17-board-from-new-project.png | **返工 #1 · A4 全路径证据 ①**：UI 建项目（只 POST 项目名）→ 打开看板 → **三列自动在场**（待办 3/进行中 0/已完成 0）+ 切换下拉 | audit「POST 项目后 GET columns 三列 200」端到端；e2e「createProject 自动创建默认三列」UI 形态 |
| 18-board-switched-project.png | **返工 #1 · D 证据**：?projectId=<p2> 深链 → 看板显示第二项目（下拉选中态/标题/卡片全部切换） | audit「GET /api/projects -> 200」多项目读回；切换交互 UI 形态 |
| 19-board-card-moved-ui.png | **返工 #1 · A4 全路径证据 ②**：建卡 → 真实 PATCH 移动 → 待办 2（收拢）/进行中 1（card one 落 0 位） | audit「PATCH 卡跨列移动 -> 200」+「移动后源列/目标列重排」UI 形态 |

## 已知注记（诚实披露）

- 02/03/06/07/14/15 为钉态种子数据（project-data / project-modal / board-modal /
  board-narrow / board-no-columns* seams）；08/13/17/18/19 为真实 api 数据路径。
- 04/05 为同一 seed 项目的移动前后真实对照；移动动作发生在两拍之间（脚本日志在案），
  源列/目标列的重排效果与 audit「cards CRUD + cross-column move (r4)」断言同源。
  **seed 方式返工后变更**：列不再显式 POST——只 POST 项目、默认三列自动在场（与真实
  用户路径一致），列名经 PATCH 改为 To Do/Doing/Done（U3-3 注记保留：seed 列名与默认
  模板「待办/进行中/已完成」的对应关系为改名所致，非两套模板）。
- 09/10/11/12 按宪法第一条补齐加载/错误态（r4 初版 U1-2 返工项）；10/12 的钉态注释句
  保留（r3 U3-1 复查结论：该句只出现在钉态截图内、真实错误态不含，属截图自释而非
  产品文案——ui-reviewer r3 报告 139 行口径）。
- 17/18/19 由 scripts/shot-rework.ps1 拍摄（一次 headless 进程/张），seed 项目拍后已删；
  拍摄脚本 ASCII + Parser 0 错误实测。
- 五 tab 壳激活态基线另见 [docs/ui/shell/README.md](../shell/README.md)（返工 #1 B：
  shot.ps1 固化自动拍摄，壳变更当轮自动补拍全部激活态）。
