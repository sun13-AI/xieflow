# docs/ui/r4 · 截图索引（项目 + 看板，M2 第 1 片）

> 本轮渲染层变体：五 tab 壳（工作台/待办/日程/项目/看板）+ 项目页 + 看板页。
> 拍摄纪律（r3 教训 ②落实）：真实链路图 04/05 走 seed 分步拍——先 seed 项目/列/卡 →
> 拍 04（移动前）→ **两拍之间真实执行 `PATCH /api/cards/:id/move`**（卡 A：To Do → Doing
> 第 0 位）→ 再拍 05（移动后）。脚本日志「moved live card: id=1 columnId=2 position=0」
> 为证。8 张 SHA256 两两互异（04=85AE61B2… / 05=C7298104…，逐字节可区分）。
> 拍前已验证 `GET /api/health` 的 `schemaVersion=4`（r3 教训 ③：避免旧 api 假象）。

| 文件 | 形态 | 对应断言 |
|---|---|---|
| 01-project-empty.png | 项目页空态（五 tab 壳，「项目」激活，空态文案引导 + 新建按钮） | e2e「迁移与 schema 一致性」；audit「GET /api/projects -> 200」空列表形态 |
| 02-project-list.png | 项目列表钉态（3 个项目卡：有描述/无描述两种形态 + 「打开看板」入口） | audit「POST 合法项目 -> 201」「项目列表返回数组」；e2e「createProject 返回自增 id」 |
| 03-project-modal.png | 新建项目弹窗（名称必填 200 字计数 + 可选描述 + 取消/创建） | audit「POST 空项目名 -> 400」「POST 超长项目名（201 字）-> 400」 |
| 04-board-live.png | **真实链路·移动前**（seed 项目「r4 live shot project」三列：To Do 3 卡 / Doing 1 卡 / Done 0；卡 C 带「进行中」徽标） | audit「PATCH 卡跨列移动 -> 200」前态实证；e2e「移动后源列重排」前态 |
| 05-board-moved.png | **真实链路·移动后**（两拍间真实 PATCH：卡 A 移到 Doing 第 0 位；To Do 收拢为 2 卡、Doing 变 2 卡） | audit「移动后源列重排：B/C 位置收拢为 0/1（连续）」「移动后目标列：卡 A 落 0 位」 |
| 06-board-modal.png | 新建卡片弹窗（标题 + 关联待办下拉 + 「创建（落到「待办」）」目标列提示） | audit「POST 卡 C（关联真实待办）-> 201」「POST 卡关联不存在的待办 -> 400」 |
| 07-board-narrow.png | 窄屏 488×900（?narrow=1 seam，看板三列纵排，卡与徽标全部在视口内） | 无 UI 形态（CSS 断点，确定性钉态；徽标「进行中/已完成」两态在场可读） |
| 08-projects-tab-live.png | 项目页真实数据路径（无 shot 参数，消费真实 api：seed 项目在列） | audit「GET 项目列表 -> 200」端到端实证（拍后 seed 已清理） |

## 已知注记（诚实披露）

- 02/03 为钉态种子数据（project-data / project-modal seam）；08 为同页真实数据路径，
  与 02 互为「钉态形态 / 真实链路」证据对（r3 11-todos-tab 惯例）。
- 04/05 为同一 seed 项目的移动前后真实对照；移动动作发生在两拍之间（脚本日志在案），
  源列/目标列的重排效果与 audit「cards CRUD + cross-column move (r4)」50 条断言同源。
- 07 窄屏用 board-narrow 钉态种子（含「进行中」「已完成」两枚徽标），底部规则行完整在视口内。
- 06 弹窗背后是 board-data 钉态种子（与 04 的真实 seed 数据集不同，索引不声称一致）。
