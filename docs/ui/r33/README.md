# docs/ui/r33 · 全局搜索矩阵（跨八源统一检索 + deep-link 直达）

- 轮次：r33（M10 后功能补强）。渲染层改动：顶栏新增全局搜索框（Ctrl/Cmd+K）+ 下拉结果面板（类型分组 / 高亮 / 键盘上下选）、会议页深链定位条；**18 tab 数量不变**，十八 tab 壳基线因顶栏变化同批重拍。
- 拍法：`node scripts/run-ps1.js scripts/shot.ps1 all -Round r33`（headless Edge 一次性进程，服务 `up/down` 收净；DB 走 `scripts/.tmp-r33shot/shot.db` scratch 库，仓库 `data/xieflow.db` 只读）。七态用 `?shot=search-*` 确定性钉态，真实交互同一套组件；运行时真值由 e2e 与 HTTP audit 背书。

<!-- R33_HASHES_BEGIN -->
`01-search-empty=790DA7DC` · `02-search-typing=CE2F5D89` · `03-search-single=89D4DB3F` ·
`04-search-multi=72C87C40` · `05-search-keyboard=31F7024E` · `06-search-narrow=332BB492` ·
`07-search-error=42A423F1` —— **7/7 互异**。
<!-- R33_HASHES_END -->

| 图 | 形态 | 对应断言 / 证据 |
|---|---|---|
| [01-search-empty.png](docs/ui/r33/01-search-empty.png) | 顶栏搜索框空态：下拉提示「输入关键词，一次检索待办 / 日程 / 项目 / 卡片 / 文档 / 知识库 / 成员 / 会议」 | e2e「r33 web·顶栏全局搜索框在场」「空查询·直接零结果」 |
| [02-search-typing.png](docs/ui/r33/02-search-typing.png) | 输入中：查询词 `R33`，两条命中，命中片段黄色高亮 | e2e「r33 打分·大小写不敏感命中」「r33 高亮切分（shared）」 |
| [03-search-single.png](docs/ui/r33/03-search-single.png) | 单类型结果：查询词 `会议`，仅「会议」分组一条 | audit「r33 types 过滤·结果只含两源」（同类路径）；e2e「每源上限」 |
| [04-search-multi.png](docs/ui/r33/04-search-multi.png) | 多类型结果：待办 / 文档 / 知识库 / 会议四组 + 分数角标 | audit「r33 跨源·结果覆盖全部 8 种 type」「七条标题命中优先」 |
| [05-search-keyboard.png](docs/ui/r33/05-search-keyboard.png) | 键盘选中：第 2 条（待办）蓝底 + 左侧蓝条 | e2e「r33 web·键盘上下选在场」；CDP 全链路真按 ArrowDown |
| [06-search-narrow.png](docs/ui/r33/06-search-narrow.png) | 488×1100 窄屏（`?narrow=1` 显式钉态）：下拉面板完整可读、底栏「更多」在场 | e2e「矩阵与壳基线零重叠」；截图脚本 `06-search-narrow` 钉态 |
| [07-search-error.png](docs/ui/r33/07-search-error.png) | 真 4xx 错误态：HTTP 400「搜索词不能为空」粉底提示 | audit「r33 4xx·空 q -> 400」「空 q 文案明确」 |

- SHA256 亲算：矩阵 7/7 互异，十八 tab 壳 18/18 互异，矩阵↔壳重叠 0；全库 **313 PNG / 311 互异**（r32 为 306/304，+7 = 本轮矩阵新增；同态组仅 r4 已披露 2 组，r33 零新增）。
- 逐张 `read_image` 目验：七张矩阵 + 十八张壳均无登录页 / 空白 / 乱码 / 裁切 / 塌陷；首轮 01 空态预填查询、02 与 04 同态、06 窄屏面板左缘裁切三处已修正并**全批重拍**，废片未入库。
- 逐张目验记录见 `docs/feedback/2026-11-21-r33-yanfa.md`。
