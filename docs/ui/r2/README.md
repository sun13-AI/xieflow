# r2 · 截图矩阵（待办页 1 页 × 5 钉态 + 真实链路 1 张）

截图与实现同一提交（AGENTS.md 第一条）。复拍命令：

```bash
# 起服务（另开窗口保持会话存活）
pwsh scripts/shot.ps1 up
pwsh scripts/shot.ps1 shots -Round r2   # 新增 -Round 参数：r1 保持原 5 态，r2 拍待办页
pwsh scripts/shot.ps1 down
```

| 文件 | 状态 | 钉态 seam | 断言对照 |
|---|---|---|---|
| 01-todo-empty.png | 待办空态（计数卡全 0 + 空态文案） | `?page=todos&shot=todo-empty` | e2e「新库 todos 为空」；HTTP 冒烟/audit「GET 列表 -> 200」 |
| 02-todo-modal.png | 新建弹窗打开（标题/象限选择/可选截止日） | `?page=todos&shot=todo-modal` | audit「POST 合法体 -> 201」「POST 空标题 -> 400」等新建分支 |
| 03-todo-quadrants.png | 四象限有数据 + summary 计数（今2/明1/周4/全部6） | `?page=todos&shot=todo-data` | e2e「今/明/周汇总计数」节；audit「summary.today/tomorrow/week」「byQuadrant.q1~q4」 |
| 04-todo-done.png | 状态流转后（首条 open→done：划线 + 重开/归档按钮 + 计数联动 2→1/4→3） | `?page=todos&shot=todo-done` | e2e「todo 状态机」节；audit「PATCH open->done -> 200」 |
| 05-todo-narrow.png | 窄屏（计数卡/象限纵排，`?narrow=1` seam） | `?page=todos&shot=todo-data&narrow=1` | 无 UI 形态（CSS 断点规则，确定性窄屏钉态） |
| 06-todo-live.png | 真实数据链路（API 真建一条 → 页面 fetch 消费，无钉态参数） | 无（真实路径） | audit「POST 合法体 -> 201」+「GET 列表（含 summary）-> 200」的端到端实证 |

已知坑（r2 实测）：
- 分离进程组里 `tsx watch` / 非 watch tsx 都会在父会话结束后退出（r1 P1 的加重变体）——
  截图前起服务需用**常驻父进程**（后台 job）托管 `Start-Process`，或直接前台 `pnpm dev:api`。
- 用 PS 5.1 `Invoke-RestMethod` 发中文 JSON body 会被按 ANSI 编码发出（库中出现 `???????`），
  须显式传 UTF-8 字节数组；audit-http 走 node fetch 无此问题。
- `shot.ps1 shots` 连拍偶发一次 headless 进程无产出（exit 0 但无 png），重跑即过——脚本已按文件存在性守卫。
