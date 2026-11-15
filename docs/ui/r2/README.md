# r2 · 截图矩阵（待办页 5 钉态 + 真实链路 + 返工 #1 新增 4 形态，共 10 张）

截图与实现同一提交（AGENTS.md 第一条）。复拍命令：

```bash
# 起服务（另开窗口保持会话存活）
powershell -File scripts\shot.ps1 up
powershell -File scripts\shot.ps1 shots -Round r2   # r2 清单 10 张（含 06 真实链路：脚本自动 seed 1 条并在拍后清理）
powershell -File scripts\shot.ps1 down
```

返工 #1 起 `shots -Round r2` 与实交矩阵**逐张对齐**（r2 复验 P4② 已清：06 已入脚本清单）。

| 文件 | 状态 | 钉态 seam | 断言对照 |
|---|---|---|---|
| 01-todo-empty.png | 待办空态（计数卡全 0 + 空态文案） | `?page=todos&shot=todo-empty` | e2e「新库 todos 为空」；HTTP 冒烟/audit「GET 列表 -> 200」 |
| 02-todo-modal.png | 新建弹窗打开（标题/象限选择/可选截止日，标题限 200 字实时计数） | `?page=todos&shot=todo-modal` | audit「POST 合法体 -> 201」「POST 空标题 -> 400」「POST 超长标题 -> 400」等新建分支 |
| 03-todo-quadrants.png | 四象限有数据 + summary 计数（今2/明1/周4/全部6） | `?page=todos&shot=todo-data` | e2e「今/明/周汇总计数」节；audit「summary.today/tomorrow/week」「byQuadrant.q1~q4」 |
| 04-todo-done.png | 状态流转后（首条 open→done：划线 + 重开/归档按钮 + 计数联动 2→1/4→3） | `?page=todos&shot=todo-done` | e2e「todo 状态机」节；audit「PATCH open->done -> 200」 |
| 05-todo-narrow.png | 窄屏（计数卡/象限纵排，`?narrow=1` seam） | `?page=todos&shot=todo-data&narrow=1` | 无 UI 形态（CSS 断点规则，确定性窄屏钉态） |
| 06-todo-live.png | 真实数据链路（脚本 seed 一条 → 页面 fetch 消费，无钉态参数；拍后自动清理） | 无（真实路径） | audit「POST 合法体 -> 201」+「GET 列表（含 summary）-> 200」的端到端实证 |
| 07-workbench-tab.png | 工作台 tab 激活（tab 栏在场、工作台蓝色药丸激活 + 工作台内容卡） | `?shot=workbench` | e2e「settings 读写」节（工作台消费 settings）；App 壳 tab 状态为 useState 纯前端 |
| 08-todo-loading.png | 待办页加载态（「正在加载待办…」卡） | `?page=todos&shot=todo-loading` | 无独立断言（加载 phase 由 fetchTodos 的 pending 态保证；证据为 HTTP 层「GET 列表 -> 200」链路 + 本图） |
| 09-todo-error.png | 待办页错误态（语义化文案「服务未启动或网络异常，请稍后重试」，不暴露原始 5xx） | `?page=todos&shot=todo-error` | 无独立断言（返工 #1·B 语义化映射在 httpClient.ts；真实场景已实测：停 api 后页面显示同一文案） |
| 10-todo-empty-title.png | 弹窗空标题提交反馈（inline alert「待办标题不能为空」+ 200 字上限提示） | `?page=todos&shot=todo-modal-empty-title` | audit「POST 空标题 -> 400」（api 拒绝）；前端 inline 反馈形态为本图 |

已知坑（r2 实测）：
- 分离进程组里 `tsx watch` / 非 watch tsx 都会在父会话结束后退出（r1 P1 的加重变体）——
  复验 P1 后 shot.ps1 已改非 watch + HTTP 200 ready 判定（lead 修，返工 #1 复核一致）。
- 用 PS 5.1 `Invoke-RestMethod` 发中文 JSON body 会被按 ANSI 编码发出（库中出现 `???????`），
  须显式传 UTF-8 字节数组；audit-http 走 node fetch 无此问题（06 的 seed 标题用纯 ASCII 规避）。
- `shot.ps1 shots` 连拍偶发一次 headless 进程无产出（exit 0 但无 png），重跑即过——脚本已按文件存在性守卫。
