# r18 返工 #1 矩阵：业务请求统一 apiFetch + 401 返回路径（共 9 张 + 14 张 shell）

> 全部截图走**一次性 headless**（`--headless=new` + `-WindowStyle Hidden`），脚本 `scripts/shot-r18-rework.ps1`（ASCII-only / PS5.1 Parser 0 错误）用 scratch DB 起收服务，
> 拍后端口全 free、scratch 目录删净；仓库 `data/xieflow.db` 从未写入（mtime 仍 20:51:35）。
> 04 是 `?page=login&reason=401` 钉态；**09 是真实流程复拍**：一次性 headless 注入假 token → 导航 `?page=todos` →
> 业务 API 真返 401 → `apiFetch` 清 localStorage 并跳 `?page=login&reason=401`，与 CDP 真点证据同一链路。

| 文件 | 形态 | 对应断言 / 证据性质 |
|---|---|---|
| 01-login.png | **登录页**（独立路由；两真输入 + 登录按钮 + 注册/工作台入口；密码框已写 8–200 位规则） | 钉态 `?page=login&shot=login`；e2e「remote 带 token -> 200 / 无 token 不附 Bearer」 |
| 02-register.png | **注册页**（独立路由；两真输入 + 注册按钮；密码框下新增强度/规则即时提示） | `?page=register&shot=register`；U2-1 低成本修复可见证据 |
| 03-login-error.png | **错误态**（红条「用户名或密码错误（HTTP 401）」） | `?page=login&shot=login-error`；audit「r18 错误密码登录 -> 401」 |
| 04-401-redirect.png | **401 跳登录（钉态）**（红条含「登录后从工作台继续（原业务页请再点一次）」） | `?page=login&reason=401`；e2e「401 清 token + 跳 login&reason=401」 |
| 05-after-logout.png | **登出后**（淡红条「已退出登录，会话 token 已清除。」，登录按钮回位） | `?page=login&reason=logout`；audit「r18 全链路② 登出 -> 200」 |
| 06-settings-mode.png | **模式卡**（本机/远端按钮 + 新增数据归属说明 + 「当前 vs 偏好」释义 + 黄色后果提示） | `?shot=mode-settings`；U2-2 低成本修复可见证据；audit remote 401/local 200 |
| 07-narrow.png | 窄屏 488×900（`?narrow=1`）：登录卡完整、徽章换行不裁切 | 无独立数字断言（CSS 断点钉态，逐张目验） |
| 08-logged-in.png | **已登录顶栏**（14 药丸 + 右上「退出登录」+ 数据归属说明 + schema v14） | `?shot=ready&auth=in`；audit「r18 真 token 访问受保护路由 -> 200」 |
| 09-401-real.png | **真实 401 跳转**（1280×800；假 token 打业务路由真 401 后落独立登录页；红条返回路径可见） | headless CDP：URL=`?page=login&reason=401`、localStorage token=`null`、请求 `Authorization: Bearer f…` + 401 + `x-xieflow-auth-cleared:1`；e2e 4 条 401 断言 |

### 十四 tab 壳基线（docs/ui/r18-rework1/shell/）

App.tsx 外壳新增数据归属说明、401 不再静默降级，`shot-r18-rework.ps1` 同批重拍 14 张：
`workbench / todos / schedules / projects / board / bases / docs / chat / knowledge / mindmap / whiteboard / approval / assets / unit-tasks-tab-active.png`。
其中 8 张与此前 r18 壳基线字节相同（这些页面视觉未变：schedules/projects/docs/chat/knowledge/mindmap/whiteboard/assets），
其余 6 张随工作台模式卡或页面状态刷新；本轮 14 张自身 14/14 互异，不构成假图。

## SHA256 自查（9 + 14 = 23/23 两两互异）

`01=CCF5012F` · `02=7D8058F1` · `03=870BDDC0` · `04=ACE2377B` · `05=2E5462F2` · `06=926950CE` · `07=C374631E` · `08=5311440D` · `09=A4684897`

`workbench=A954709B` · `todos=EE076F3E` · `schedules=F1665320` · `projects=144DE148` · `board=004150A4` · `bases=7B22DCB4` · `docs=65A90E38` · `chat=1749F955` · `knowledge=30A8CC29` · `mindmap=4B576279` · `whiteboard=CC4BB17E` · `approval=784457B2` · `assets=0D364A9E` · `unit-tasks=48025367`

23 张已逐张 `read_image` 目验：中文无乱码、无裁切、红/黄/蓝提示条文案互异；02 密码规则提示与 06 数据归属说明同图可读；
07 在 488px 下登录卡完整；09 显示真实 401 返回路径文案。

## headless CDP 真点（remote + scratch DB）

1. `?page=login` → 真点「去注册」→ 填 `r18_rework_cdp` / `r18-Strong-Pass-2026` → 注册 201；
2. 真登录 → `?page=home`，右上「退出登录」，localStorage token 长度 64，服务模式「远端（需登录）」；
3. 真点「待办」：`GET /api/todos` **200** 且请求头 `authorization: Bearer d25e…02`（此前 waizhuan 复现点无此头）；
   再点「物资」「文档」：`GET /api/assets`、`GET /api/documents` 均 **200**，均渲染真实空态；
4. 注入 64 位假 token 后导航 `?page=todos`：`GET /api/todos` **401** + `x-xieflow-auth-cleared:1`，
   URL 自动变 `?page=login&reason=401`，localStorage token = `null`，红条文案可见；
5. 清理：CDP 页回 `about:blank`，8787/5173/8788 listen=0，scratch DB/临时 seam HTML/日志全删，仓库库文件未动。

## 卫生

全程 headless（`navigator.webdriver=true` 实证）；未 push / 未打 tag / 未发版 / 未写密钥文件 / 未接外部 IdP；
tokens 仅在浏览器 localStorage 与脚本进程内存中，scratch 库随目录删除归零。
