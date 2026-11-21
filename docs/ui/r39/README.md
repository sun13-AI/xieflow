# docs/ui/r39 · 用户可见文案清理（错误态七态 + 十九 tab 壳基线）

- 轮次：r39（用户可见文案清理：错误条内部术语清零 + 机制防复发）。渲染层改动只涉及用户可见字符串：错误红条 / 登录提示 / 顶栏徽章 / 搜索提示改为纯用户文案；截图 seam 标记（注释、`shot ===` 守卫、`shot-note` / `seam-note` 标注）按宪法第一条原样保留。
- 拍法：`powershell -File scripts/shot.ps1 shots -Round r39`（headless Edge + 一次性 CDP 截图 helper `scripts/r39-shot.mjs`，服务 `up/down` 收净；仓库 `data/xieflow.db` 未作数据源）。七态用 `?shot=` 确定性钉态；十九 tab 壳同批重拍（tab 数不变，顶栏徽章文案已改为纯用户口径）。
- 捕获期 seam 披露：本机 api 持久化为 `remote` 模式；为避免未认证后台探针 401 把钉态页重定向到登录页，截图 helper 在 CDP 层把 `/api/auth/mode` 钉为 local、把 401 响应替换为最小空态 JSON。十九 tab 壳中的报表 / 报告两页另用内置 `?shot=reports-empty` / `?shot=wr-empty` 空态钉态，避免认证错误条出现在证据里。**只影响截图进程的网络响应与 URL，不改产品代码、不改数据库、不动用户数据。**

<!-- R39_HASHES_BEGIN -->
`01-board-meta-error-clean-text=844257D2` · `02-bases-group-error-clean-text=32EEE4AC` ·
`03-bases-service-error-clean-text=3BD0FC66` · `04-schedule-error-clean-text=A7886FE2` ·
`05-work-reports-error-clean-text=207D387B` · `06-search-error-clean-text=3789A6DA` ·
`07-login-clean-text=F673F18B` —— **7/7 互异**。
<!-- R39_HASHES_END -->

| 图 | 形态 | 对应断言 / 证据 |
|---|---|---|
| [01-board-meta-error-clean-text.png](docs/ui/r39/01-board-meta-error-clean-text.png) | 看板卡片错误条：「卡片失败：标签过长（最多 40 字），请缩短后重试。」+ 新建面板保留 + 新徽章 | e2e「r39 BoardPage 错误条改为纯用户文案」；audit「r39 4xx·超长标签错误体零内部术语」 |
| [02-bases-group-error-clean-text.png](docs/ui/r39/02-bases-group-error-clean-text.png) | 表格分组错误条：「分组失败：聚合字段不存在，请重新选择取值字段。」+ 分组网格保留 | e2e「r39 BasesPage 错误条改为纯用户文案」；audit「r39 4xx·非法 types 错误体零内部术语」 |
| [03-bases-service-error-clean-text.png](docs/ui/r39/03-bases-service-error-clean-text.png) | 表格页服务错误条：纯用户话术，无「截图钉态 / api 停机 / 5xx」内部术语 | check:text 扫描断言零命中；e2e「r39 文案·字段名为空错误体零内部术语」 |
| [04-schedule-error-clean-text.png](docs/ui/r39/04-schedule-error-clean-text.png) | 日程页服务错误条：纯用户话术，无截图 seam 标记 | check:text 扫描断言零命中；audit「r39 4xx·坏 ICS 错误体零内部术语」 |
| [05-work-reports-error-clean-text.png](docs/ui/r39/05-work-reports-error-clean-text.png) | 报告页错误红条：「服务未启动或网络异常，请稍后重试。」+ 重试按钮，无 r36 轮次标记 | e2e「r39 WorkReportsPage 轮次错误态标记零残留」；check:text 扫描断言 |
| [06-search-error-clean-text.png](docs/ui/r39/06-search-error-clean-text.png) | 全局搜索错误气泡：「搜索词不能为空，请输入关键词后重试。」，无 4xx / 截图钉态字样 | audit「r39 4xx·空 q / 缺 q 错误体零内部术语」；check:text 扫描断言 |
| [07-login-clean-text.png](docs/ui/r39/07-login-clean-text.png) | 登录页提示：「远端模式下需登录访问业务数据；本地模式可直接体验。」+ 新徽章「账号与网络版服务」 | check:text 扫描断言零命中；e2e「r39 用户可见文案」节 |
| [shell/](docs/ui/shell/README.md) | 十九 tab 壳基线（r39 同批重拍，tab 数不变，徽章为纯用户文案） | e2e「shell README R39 哈希逐字一致」 |

- 全库 **356 PNG / 354 互异**（r38 为 349/347，+7 = r39 矩阵新增；十九壳为同路径替换不增总数）；同态组仅 r4 已披露 2 组，r39 零新增。
- 矩阵↔壳 SHA256 交叉重叠 0；26 张逐张 `read_image` 目验：无登录页废片 / 空白 / 中文乱码 / 裁切 / 塌陷；最小 PNG 46 KB。
