# docs/ui/r36 · 日报与周报自动生成矩阵（空态 / 日报 / 周报 / 编辑 / 存为文档 / 窄屏 / 错误态）

- 轮次：r36（M10 后功能补强）。渲染层改动：新增第十九 tab「报告」（`?page=work-reports`），日报/周报切换 + 日期/周锚点 + 可编辑 Markdown 预览 + 计数摘要 + 存为文档 + 打印导出 + 错误红条；**十九 tab 壳基线同批重拍**（新增 `work-reports-tab-active.png`）。
- 拍法：`node scripts/run-ps1.js scripts/shot.ps1 shots -Round r36`（headless Edge 一次性进程，服务 `up/down` 收净；DB 走 `data/xieflow-r36-shot.db` scratch 库并在同批次末删除，仓库 `data/xieflow.db` 未作 DB_PATH）。七态用 `?shot=wr-*` 确定性钉态，与真实交互共用同一组件，Markdown 全部由 `shared/workReports` 真装配（非手写占位）；运行时真值由 e2e / HTTP audit / CDP 全链路背书。
- 首轮废片：默认库处于 remote 模式，七张矩阵 + 十九张壳全部拍成登录页（SHA 全同），已用 scratch local-mode 库**全批重拍**，废片未入库；第二轮目验发现「生成报告 / 存为文档」两枚主按钮白字白底（CSS 选择器优先级），修 `.wr-toolbar button.wr-primary` / `.wr-actions button.wr-primary` 后**全批再重拍**，废片未入库。
- 首用全链路：`node scripts/r36-firstuse-cdp.mjs --browser "<Edge 路径>" --web-port 5173 --api-port 8787`（headless CDP 真点生成 → 切周报 → 编辑 → 存为文档 → 文档页打开 → reload 不丢）。

<!-- R36_HASHES_BEGIN -->
`01-wr-empty=0F5C2CD7` · `02-wr-daily=E5838B55` · `03-wr-weekly=8546C8A7` ·
`04-wr-edit=79704BFC` · `05-wr-saved=6B6DCF2D` · `06-wr-narrow=3E1B201C` ·
`07-wr-error=FD134698` —— **7/7 互异**。
<!-- R36_HASHES_END -->

| 图 | 形态 | 对应断言 / 证据 |
|---|---|---|
| [01-wr-empty.png](docs/ui/r36/01-wr-empty.png) | 报告空态：六段各一条「暂无」，摘要全 0 | e2e「r36 Markdown·空数据六段各一条暂无」；audit「空库报告结构 200」 |
| [02-wr-daily.png](docs/ui/r36/02-wr-daily.png) | 日报有数据：完成 1 / 进行中 3 / 阻塞 1 / 日程 2 / 下一步 1 / 待办合计 5；阻塞项回带 `#3` | audit「r36 日报·结构化阻塞项 blockers 精确」；e2e「r36 摘要·日报逐项手算」 |
| [03-wr-weekly.png](docs/ui/r36/03-wr-weekly.png) | 周报有数据：`2026-11-16 ~ 2026-11-22` 自然周闭区间，完成 2 / 日程 3 / 待办合计 6 | audit「r36 周报·聚合 7 天真数据」；e2e「r36 周期·周报自然周闭区间」 |
| [04-wr-edit.png](docs/ui/r36/04-wr-edit.png) | 编辑态：Markdown 末尾多一条人工补充行，摘要右上角「已修改，尚未存为文档」 | e2e「r36 web·可编辑 Markdown seam」；CDP「textarea 真写入后 dirty 态」 |
| [05-wr-saved.png](docs/ui/r36/05-wr-saved.png) | 存为文档后：绿色回执「已存为文档（8 块）」；**该回执为截图钉态**，真保存链路由 audit「POST save 201 / 全文回读 / 覆盖整篇替换」与 CDP 真点背书 | audit「r36 保存·全文含报告真内容（文档页可编辑）」 |
| [06-wr-narrow.png](docs/ui/r36/06-wr-narrow.png) | 488×1100 `?narrow=1` 窄屏：日报/周报按钮纵排、摘要逐条、生成按钮全宽 | 矩阵↔壳 SHA 零重叠；窄屏 seam 钉态 |
| [07-wr-error.png](docs/ui/r36/07-wr-error.png) | 错误态：红条「报告生成失败：服务未启动或网络异常…」+ 重试按钮（纯用户文案，无内部标签） | audit「r36 4xx·非法日期 / 越权 id / 空内容」 |

- 全库 **335 PNG / 333 互异**（r35 为 327/325，+8 = r36 矩阵 7 张 + 新增 `work-reports-tab-active.png`；十九壳其余 18 张为替换同路径不增总数）；同态组仅 r4 已披露 2 组，r36 零新增。
- 矩阵↔壳 SHA256 交叉重叠 0；七张矩阵 + 十九张壳逐张 `read_image` 目验：无登录页 / 空白 / 乱码 / 裁切 / 塌陷；窄屏 06 底部导航遮住 textarea 下半段（属既有 ≤600px 底栏布局，滚动可达），不阻断编辑。
