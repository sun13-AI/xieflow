# docs/ui/r38 · 看板卡片元数据矩阵（空态 / 标签 / 负责人 / 截止日 / 逾期红标 / 窄屏 / 错误态）

- 轮次：r38（M10 后功能补强：看板卡片元数据，向后兼容）。渲染层改动：看板页卡片正面加标签 chip / 负责人 / 截止日 / 逾期红标；新建/编辑面板加标签输入 / 负责人（复用 r24 MemberPicker）/ 截止日 date；看板筛选栏加标签下拉；**十九 tab 壳基线同批重拍**（tab 数不变，顶栏徽章推进 r38）。
- 拍法：`node scripts/run-ps1.js scripts/shot.ps1 shots -Round r38`（headless Edge 一次性进程，服务 `up/down` 收净；DB 走 scratch 库并末删除，仓库 `data/xieflow.db` 全程未作 DB_PATH）。七态用 `?shot=board-meta-*` 确定性钉态；标签/负责人/逾期数值为手算写死口径，真值链路由 e2e / HTTP audit 独立背书。
- 首用全链路：`node scripts/r38-firstuse-cdp.mjs`（headless CDP 真点：建卡 → 加标签/负责人/截止日 → 看逾期红标 → 标签筛选 → reload 不丢 → 探针清理）。

<!-- R38_HASHES_BEGIN -->
`01-card-empty=55362619` · `02-card-labels=C33F7F15` · `03-card-assignee=D676F780` ·
`04-card-due=711AA1FD` · `05-card-overdue=4F1FB299` · `06-card-narrow=111045D5` ·
`07-card-error=4ABA79C5` —— **7/7 互异**。
<!-- R38_HASHES_END -->

| 图 | 形态 | 对应断言 / 证据 |
|---|---|---|
| [01-card-empty.png](docs/ui/r38/01-card-empty.png) | 卡片元数据空态：无项目 / 无卡片 | e2e「r38 向后兼容·老卡 labels 为空数组」；audit「r38 向后兼容·老卡 labels=[]」 |
| [02-card-labels.png](docs/ui/r38/02-card-labels.png) | 标签 chip：卡片正面「前端 / 紧急」+ 筛选栏「前端」命中 2 张 | audit「r38 建卡·标签 trim/去重回带」；audit「r38 筛选·前端标签 2 张」 |
| [03-card-assignee.png](docs/ui/r38/03-card-assignee.png) | 负责人编辑面板：MemberPicker 通讯录选人（张工·研发部） | audit「r38 建卡·负责人摘要姓名/部门回带」；e2e「r38 web·负责人复用 r24 选择器」 |
| [04-card-due.png](docs/ui/r38/04-card-due.png) | 截止日设置：编辑面板 date 输入 + 卡片正面「截止：2026-11-01」 | audit「r38 建卡·截止日回带」 |
| [05-card-overdue.png](docs/ui/r38/05-card-overdue.png) | 逾期红标：待办列卡显示红底「逾期」，已完成列同日不标红 | audit「r38 手算·逾期恰好 1 张」；e2e「r38 逾期·完成列不标红」 |
| [06-card-narrow.png](docs/ui/r38/06-card-narrow.png) | 488×1100 `?narrow=1` 窄屏：标签 chip 与筛选栏在场 | 矩阵↔壳 SHA 零重叠；窄屏 seam 钉态 |
| [07-card-error.png](docs/ui/r38/07-card-error.png) | 错误态：红条「标签过长（最多 40 字）」+ 编辑面板保留 | audit「r38 4xx·超长标签 -> 400」 |

- 全库 **349 PNG / 347 互异**（r37 为 342/340，+7 = r38 矩阵 7 张；十九壳为同路径替换不增总数）；同态组仅 r4 已披露 2 组，r38 零新增。
- 矩阵↔壳 SHA256 交叉重叠 0；七张矩阵 + 十九张壳逐张 `read_image` 目验：无登录页 / 空白 / 乱码 / 裁切 / 塌陷。
