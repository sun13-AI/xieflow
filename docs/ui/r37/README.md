# docs/ui/r37 · 表格分组视图与汇总行矩阵（空态 / 下拉 / 数值分组 / 汇总行 / 折叠后 / 窄屏 / 错误态）

- 轮次：r37（M10 后功能补强）。渲染层改动：多维表格页视图栏加「分组」下拉（字段 + 聚合方式 + 取值字段）+ 分组折叠头 + 每组只读汇总行 + 错误红条；**十九 tab 壳基线同批重拍**（本轮 tab 数不变，顶栏徽章推进 r37，表格页渲染变化）。
- 拍法：`node scripts/run-ps1.js scripts/shot.ps1 shots -Round r37`（headless Edge 一次性进程，服务 `up/down` 收净；DB 走 `scripts/.tmp-shot-r37/shot.db` scratch 库并同批末删除，仓库 `data/xieflow.db` 全程未作 DB_PATH）。七态用 `?shot=bases-group-*` 确定性钉态，汇总数值按 shared/tableGroups 真算法手算口径写在钉态（未开始 10+20=30 / avg 15；进行中 30；空值组 5），真值链路由 e2e / HTTP audit / CDP 全链路背书。
- 首用全链路：`node scripts/r37-firstuse-cdp.mjs --browser "<Edge 路径>" --web-port 5173 --api-port 8787`（headless CDP 真点 11 步全绿：HTTP 造表录 4 行 → 选视图 → 真点分组下拉设口径 → 看汇总 → 折叠组 → reload 不丢 → HTTP truth 回查 → 探针清理）。

<!-- R37_HASHES_BEGIN -->
`01-group-empty=A9616245` · `02-group-dropdown=AFDD7BEA` · `03-group-numeric=2D2AE78F` ·
`04-group-summary=E11B8399` · `05-group-collapsed=3EBA9336` · `06-group-narrow=A9F6A22D` ·
`07-group-error=5537F265` —— **7/7 互异**。
<!-- R37_HASHES_END -->

| 图 | 形态 | 对应断言 / 证据 |
|---|---|---|
| [01-group-empty.png](docs/ui/r37/01-group-empty.png) | 分组空态：视图已有但 groupSpec 为空，「（未分组）」+ 普通网格 | e2e「r37 守卫·undefined 归一为未分组」；audit「r37 4xx·未配置分组视图 -> 400」 |
| [02-group-dropdown.png](docs/ui/r37/02-group-dropdown.png) | 分组下拉展开：状态 / 求和 / 金额三选 + 应用 / 取消；组内三组 + 汇总 30/30/5 | audit「r37 手算·未开始 count=2/sum=30」；e2e「r37 web·分组下拉 seam 在场」 |
| [03-group-numeric.png](docs/ui/r37/03-group-numeric.png) | 数值字段分组（sum）展开态：未开始 10/20、进行中 30、空值 5，汇总 30/30/5 | audit「r37 手算·空值组 sum=5」；e2e「r37 汇总·空值组 sum=5」 |
| [04-group-summary.png](docs/ui/r37/04-group-summary.png) | 均值汇总行：未开始 15（10+20 均值）、进行中 30、空值 5 | audit「r37 手算·未开始 avg=15」；e2e「r37 汇总·avg 手算 15」 |
| [05-group-collapsed.png](docs/ui/r37/05-group-collapsed.png) | 折叠后：未开始组 ▸ 收起（行数/汇总隐藏），其余两组仍展开 | CDP「collapse hides group rows (4 -> 2)」；e2e「r37 web·折叠组头 seam 在场」 |
| [06-group-narrow.png](docs/ui/r37/06-group-narrow.png) | 488×1100 `?narrow=1` 窄屏：字段按钮纵排 + 分组头 + 汇总行可见 | 矩阵↔壳 SHA 零重叠；窄屏 seam 钉态 |
| [07-group-error.png](docs/ui/r37/07-group-error.png) | 错误态：红条「分组失败：聚合字段不存在（截图钉态）」+ 分组网格仍在（纯用户文案，无内部标签） | audit「r37 4xx·非法聚合取值字段 -> 400」 |

- 全库 **342 PNG / 340 互异**（r36 为 335/333，+7 = r37 矩阵 7 张；十九壳为同路径替换不增总数）；同态组仅 r4 已披露 2 组，r37 零新增。
- 矩阵↔壳 SHA256 交叉重叠 0；七张矩阵 + 十九张壳逐张 `read_image` 目验：无登录页 / 空白 / 乱码 / 裁切 / 塌陷；窄屏 06 底部导航遮住表格下半段（既有 ≤600px 底栏布局，滚动可达），不阻断功能。
