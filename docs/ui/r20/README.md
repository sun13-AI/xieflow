# r20 截图矩阵（M10 起步：离线模式与 PWA）

目录：`docs/ui/r20/`；7 张任务单形态 + `docs/ui/shell/` 十四 tab 壳基线同批重拍（本轮无新 tab，顶栏状态区/底部导航只是布局变化）。

拍法：前 6 张与第 7 张走 `scripts/shot.ps1 shots -Round r20`（一次性 headless Edge、`--headless=new`、`-WindowStyle Hidden`）；**06-mobile-390.png 例外**——headless `--window-size=390,844` 会把布局视口钳到 500px（截图出现右侧裁切），故改用 Chrome DevTools Protocol `Emulation.setDeviceMetricsOverride`（390×844×1, mobile+touch）真 390 CSS px 后截取；CDP 实测 `document.documentElement.scrollWidth=390 / clientWidth=390`，只有底部 tab 栏自身 `overflow-x:auto`（预期内可横向滚动），页面主体零横向溢出。六态与错误态均用 `?shot=` 确定性钉态；真实离线行为由 audit 真 HTTP 与 headless CDP 断网链路另行锁定。

| 文件 | 形态 | 对应断言 / 证据 |
|---|---|---|
| 01-manifest-install.png | PWA 安装提示：在线绿点 + 「离线缓存已就绪」+「可安装为应用 · 离线也能打开」 | `?shot=pwa-install`；e2e「manifest display=standalone / 图标本地 / 零外部 URL」「index.html 链接 manifest」 |
| 02-sw-registered.png | SW 注册成功：在线绿点 + 「离线缓存已就绪」 | `?shot=sw-ready`；e2e「SW cache-first 静态 / network-first API / 离线 fallback / no-sw=1 测试开关」 |
| 03-net-online.png | 在线态：绿点「在线」+ 队列徽标 0 + 立即同步按钮 + 14 药丸 | `?shot=net-online`；e2e「顶栏在线状态圆点 / 队列徽标 / 立即同步按钮在场」 |
| 04-net-offline-queue.png | 离线态 + 队列徽标 3：红点「离线」+ 待同步 3 + 「离线：3 条操作已保存到本地队列。」 | `?shot=offline-queue`；e2e「shouldQueueOffline 离线写请求入队 / 在线不入队 / 202 语义响应」；audit 真 HTTP 重放 |
| 05-replay-success.png | 重放成功：绿条「已按序重放 3 条离线操作，队列已清空。」+ 队列归 0 | `?shot=replay-success`；audit「replayed=2 / 首条按 createdAt 升序 / 清理后计数回基线」 |
| 06-mobile-390.png | 真 390×844 移动视口：顶部汉堡 ☰ + 底部导航（44px 触摸目标）+ 单列卡片 + 零横向溢出 | CDP device metrics 真 390px；e2e「<=600px 断点 / overflow-x hidden / min-height 44px」 |
| 07-net-error.png | 错误态：红条「同步失败：重放冲突（HTTP 409），请处理后再试。」+ 队列 2 | `?shot=offline-error`；audit「重放中乐观锁冲突 -> 409 / conflictIndex=1 / 零半态」 |

## SHA256 自查（前缀 8 位）

`01=4CA45DE5` · `02=6063825A` · `03=9DD9AA30` · `04=175640C0` · `05=CCA12487` · `06=B7EE435F` · `07=72D19B26` —— **7/7 两两互异**。

`docs/ui/shell/` 十四张 **14/14 互异**（`workbench=E78B0690` / `todos=222FD9CC` / `schedules=AB88DF1E` / `projects=8E5FF20D` / `board=C0301C4F` / `bases=C0886814` / `docs=89B6C0A3` / `chat=6DF2B1D0` / `knowledge=C48E63AB` / `mindmap=A9253280` / `whiteboard=35BD3927` / `approval=F1FCF4E0` / `assets=43A922AC` / `unit-tasks=6CDC1097`），与 r19 逐位全异（r20 徽章 + 顶栏状态区 + M10 里程碑）；矩阵与壳交叉重叠 **0 张**。全库 **226 PNG / 224 互异**，同态组仅 r4 已披露 2 组，r20 零新增。

21 张（7 矩阵 + 14 壳）逐张 `read_image` 目验：中文无乱码、无裁切、无塌陷；01/02/03 四态在线提示互异，04/05/07 三态消息互异；06 在真 390px 下正文完整换行、底部导航固定且可横向滚动；壳基线 14 张徽章「r20 · 离线模式与 PWA（M10 起步）」与顶栏状态条在场，tab 激活态正确。

> 真实行为证据：e2e 1803 / audit 1484 全绿；headless CDP 真断网链路（建会话在线载入 → CDP offline → 真点新建待办两次 → localStorage 队列 2 条 + 徽标 2 → 恢复网络 → 真点「立即同步」→ 队列清空 + API 真落库两条 id=1/2 → HTTP 回查 → 清理）见 `docs/feedback/2026-11-18-r20-yanfa.md`。
