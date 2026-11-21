# docs/ui/r40 · 登录页口径清理（干净态 + 十九 tab 壳基线）

- 轮次：r40（口径清理与扫描器加固轻量轮）。渲染层改动只涉及用户可见字符串：登录页脚注改为「本页不占主界面 tab 数量」且不含数字，另清理 10 处单位数轮次号种子/预览文案；`?shot=` 守卫、`shot-note` / `seam-note` 图注与钉态种子函数原样保留（宪法第一条诚实性）。
- 拍法：`powershell -File scripts/shot.ps1 shots -Round r40`（headless Edge + 一次性 CDP 截图 helper `scripts/r39-shot.mjs`，api/web 由 `shot.ps1 up/down` 收净）；全程 `XIEFLOW_DB_PATH` 指向 `scripts/.tmp-r40shot/shot.db` scratch 库，批次末删除，仓库 `data/xieflow.db` 未作数据源。
- 捕获期 seam 披露：与 r39 同款——本机 api 持久化 remote 模式；截图 helper 在 CDP 层把 `/api/auth/mode` 钉为 local、把 401 响应替换为最小空态 JSON；报表 / 报告两 tab 另用内置 `?shot=reports-empty` / `?shot=wr-empty` 空态钉态。**只影响截图进程网络响应与 URL，不改产品代码 / 数据库 / 用户数据。**

<!-- R40_HASHES_BEGIN -->
`01-login-clean-text=32840BA2` —— **1/1 互异**。
<!-- R40_HASHES_END -->

| 图 | 形态 | 对应断言 / 证据 |
|---|---|---|
| [01-login-clean-text.png](docs/ui/r40/01-login-clean-text.png) | 登录页干净态：页脚小字「登录后才可访问业务数据；本页不占主界面 tab 数量，账号信息仅保存在本机浏览器中。」——无「14 个 tab」旧数字与 token 开发者口径；蓝色提示条与徽章「账号与网络版服务」在席 | e2e「r40 AuthPages 登录页改为不含数字的 tab 数量口径」；check:text `\br\d{1,3}\b` 扫描零命中 |
| [shell/](docs/ui/shell/README.md) | 十九 tab 壳基线（r40 同批重拍，tab 数不变，徽章沿用 r39 纯用户文案） | e2e「r40 壳索引·R40 当前哈希块在场」；check:text 6265 literals / 24 tsx / 0 命中 |

- 全库 **357 PNG / 355 互异**（r39 为 356/354，+1 = r40 矩阵新增；十九壳为同路径替换不增总数）；同态组仅 r4 已披露 2 组，r40 零新增。
- 矩阵↔壳 SHA256 交叉重叠 0；20 张逐张 `read_image` 目验：登录页页脚口径正确、19 壳逐 tab 蓝实心激活，无空白 / 乱码 / 塌陷（5 张窄容器壳右缘裁切为 r31~r39 继承形态，非 r40 回归）。
- r39→r40 壳逐名比对：**changed=5 / same=14**（schedules / projects / chat / knowledge / meetings 因 scratch 库空态与 CDP 捕获时序差异变化，其余同名字节沿用；不宣称逐位全异，按 r25 先例如实披露）。
