# r18 矩阵：账号与网络版服务（M9 起步，共 8 张）

> 同批重拍十四 tab 壳基线（见 `../shell/README.md`）；本轮认证页为**独立路由**（`?page=login` / `?page=register`），
> 不新增 tab，主界面 14 药丸数量不变。所有图走一次性 headless（`--headless=new` + `-WindowStyle Hidden`），
> 拍后 seed 账号由 HTTP DELETE 清理、服务模式回 local、端口收净。
> seed 阶段真发 `register → login → guard(Bearer) → logout → login(cleanup)`，token 只在 shot.ps1 进程内存中，不写密钥文件。

| 文件 | 形态 | 对应断言 / 证据性质 |
|---|---|---|
| 01-login.png | **登录页**（独立路由，14 tab 壳之外；用户名/密码两真输入 + 蓝色登录按钮 + 注册/工作台入口 + r18 徽章） | 钉态 `?page=login&shot=login`；audit「r18 管理员登录 -> 200」锁真实行为 |
| 02-register.png | **注册页**（独立路由；用户名/密码输入 + 注册按钮 + 「首个账号自动成为管理员」说明） | `?page=register&shot=register`；audit「r18 注册首个用户 -> 201」「r18 重复用户名 -> 409」 |
| 03-login-error.png | **错误态**（红色语义文案「用户名或密码错误（HTTP 401）—请检查账号与密码后重试」） | `?page=login&shot=login-error`；audit「r18 错误密码登录 -> 401」；无独立数字断言 |
| 04-401-redirect.png | **401 跳登录**（红条「登录态已失效（HTTP 401），本地假登录态已清除，请重新登录。」） | `?page=login&reason=401`；audit「r18 401 响应体 cleared=true」「r18 401 响应头 X-Xieflow-Auth-Cleared=1」 |
| 05-after-logout.png | **登出后**（红条「已退出登录，会话 token 已清除。」，登录按钮回位） | `?page=login&reason=logout`；audit「r18 全链路② 登出 -> 200」「r18 登出真删会话」 |
| 06-settings-mode.png | **设置区模式卡**（工作台「本机/远端」两按钮，本机蓝实心；当前本机免登录 + 黄色后果提示 + 服务端模式来自 GET /api/auth/mode + schema v14 + M9 里程碑） | `?shot=mode-settings`；audit「r18 管理员切 remote -> 200」「r18 切回 local -> 200」「remote 业务路由 401 / local 200」 |
| 07-narrow.png | 窄屏 488×900（`?narrow=1`）：登录卡完整、品牌/徽章换行不裁切、两输入与按钮纵排 | 无独立数字断言（CSS 断点钉态，逐张目验） |
| 08-logged-in.png | **已登录顶栏**（工作台 14 药丸 + 右上「退出登录」按钮 + schema v14 + M9 里程碑） | `?shot=ready&auth=in`；audit「r18 真 token 访问受保护路由 -> 200」 |

## SHA256 自查（8/8 互异，与 r17 八张及各轮矩阵均不同字节）

`01=4016F6B6` · `02=3618C7A0` · `03=BFBCC0D5` · `04=7D9ECB70` · `05=E0BD30A5` ·
`06=D4BD3C9F` · `07=4144472A` · `08=79059613` —— **8/8 两两互异**。

十四 tab 壳基线同批重拍 **14/14 互异**（`workbench=2F89411D` / `todos=C39599AA` / `unit-tasks=0F0DF5CC` 等，
与 r17 十四张逐位全异：徽章推进 r18、工作台新增服务模式卡、schema v14、M9 里程碑）。
全库 **168 PNG / 166 互异**，同态组仅 r4 已披露的 2 组，r18 零新增。

八张逐张 `read_image` 目验：中文无乱码、无裁切、无塌陷；03/04/05 三条红条逐字可读且彼此不同；
06 模式卡「本机/远端」与黄色后果提示同图、schema v14 与 M9 里程碑可见；07 在 488px 下登录卡完整；
08 顶栏「退出登录」与 14 药丸同图。

## 清理与卫生

- seed 账号 `r18_shot_user` 在拍摄后经 `DELETE /api/auth/users/:id` 删除，会话级联清零；
- 服务模式经 `POST /api/auth/mode {"mode":"local"}` 恢复 local；
- 全程 headless、服务收净（8787/5173 全 free）；PowerShell 新增段全 ASCII、PS5.1 Parser 0 错误；
- 未写任何密钥文件、未接外部 IdP、未 push / 未打 tag。
