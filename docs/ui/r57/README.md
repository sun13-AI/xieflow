# docs/ui/r57 · r57 P1-3 渲染层修复：待办依赖七态矩阵

本目录是 **r57 渲染层改动的同批截图证据**：`TodoItem.tsx` 行组件 + `React.memo`、
`candidates` 只在 `panelOpen` 分支计算、`App.todoById` 走 `useMemo`。
七个状态全部来自 TodosPage 既有 `?shot=dep-*` 钉态（真实交互同一套组件），
CRUD / 环检测 / 409 红条由 e2e + audit-http 锁定，输入耗时由 `scripts/r57-perf-cdp.mjs` 实测。

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-dep-empty.png](01-dep-empty.png) | 前置面板空态：空依赖列表 + 全量候选按钮 | e2e「r34 web·前置任务面板 seam 在场」；e2e「r57 P1-3·候选计算移入 panelOpen 分支」 |
| [02-dep-add.png](02-dep-add.png) | 已加前置 + 阻塞徽标：可移除 + 候选已排除前项 | e2e「r34 web·列表阻塞态徽标 seam 在场」；audit「r34 阻塞列表 · B/C 均阻塞」 |
| [03-dep-blocked-list.png](03-dep-blocked-list.png) | 双阻塞链列表：A→B→C 链与阻塞计数 | audit「r34 手算 · B 被 1 项阻塞 / C 被 1 项阻塞」 |
| [04-dep-satisfied.png](04-dep-satisfied.png) | 前置已完成：✓ 前置已满足徽标 | audit「r34 前置状态回带 done」；e2e「r34 web·前置任务面板 seam 在场」 |
| [05-dep-cycle-error.png](05-dep-cycle-error.png) | 循环依赖红条：`dep-cycle-error` 内联错误 | audit「r34 4xx · 环文案明确」；e2e「r34 web·循环依赖红条 seam 在场」 |
| [06-dep-narrow.png](06-dep-narrow.png) | 488px 窄屏依赖面板：候选按钮纵排可达 | e2e「r34 web·添加/移除前置按钮在场」；shot seam `?narrow=1` |
| [07-dep-error.png](07-dep-error.png) | 409 动作错误红条：依赖未完成不可流转 | audit「r34 409 · B 前置未完成转 done 被拒」；e2e「r34 web·添加/移除前置按钮在场」 |

<!-- R57_MATRIX_HASHES_BEGIN -->
`01-dep-empty=C046F0D2` · `02-dep-add=33194064` · `03-dep-blocked-list=33DFD736` ·
`04-dep-satisfied=36860BE4` · `05-dep-cycle-error=5CA24077` · `06-dep-narrow=7145433A` ·
`07-dep-error=2FE075C8` —— **7/7 SHA256 互异**。
<!-- R57_MATRIX_HASHES_END -->

二十 tab 壳基线同批重拍见 [shell 当前块](../shell/README.md)（r49→r57 changed=6 / same=14 如实披露）。
截图进程全部 headless 一次性 CDP，使用 scratch `XIEFLOW_DB_PATH`，不写 `data/xieflow.db`；服务已收净。
