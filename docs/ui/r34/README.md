# docs/ui/r34 · 任务依赖与阻塞关系矩阵（前置任务 + 阻塞链 + 环检测）

- 轮次：r34（M10 后功能补强）。渲染层改动：待办页加「前置任务」面板（添加/移除 + 状态徽标）、列表阻塞态「被 N 项阻塞」、循环依赖红条；**18 tab 数量不变**，十八 tab 壳基线因待办页变化同批重拍。
- 拍法：`node scripts/run-ps1.js scripts/shot.ps1 shots -Round r34`（headless Edge 一次性进程，服务 `up/down` 收净；DB 走 `scripts/.tmp-r34shot/shot.db` scratch 库，仓库 `data/xieflow.db` 只读）。七态用 `?shot=dep-*` 确定性钉态，真实交互同一套组件；运行时真值由 e2e / HTTP audit / CDP 全链路背书。

<!-- R34_HASHES_BEGIN -->
`01-dep-empty=2C92D99D` · `02-dep-add=F7ED6DAC` · `03-dep-blocked-list=7A626F9F` ·
`04-dep-satisfied=F9612D45` · `05-dep-cycle-error=DBA9E285` · `06-dep-narrow=25E5CE68` ·
`07-dep-error=A0314766` —— **7/7 互异**。
<!-- R34_HASHES_END -->

| 图 | 形态 | 对应断言 / 证据 |
|---|---|---|
| [01-dep-empty.png](docs/ui/r34/01-dep-empty.png) | 前置任务空态：面板打开、无前置、候选待办可加 | e2e「r34 web·前置任务面板 seam 在场」「空前置·列表为空」 |
| [02-dep-add.png](docs/ui/r34/02-dep-add.png) | 已添加前置 A（状态徽标）+ 候选列表 | audit「POST B 依赖 A -> 201」「GET·前置回带标题/状态」 |
| [03-dep-blocked-list.png](docs/ui/r34/03-dep-blocked-list.png) | B/C 列表阻塞态「被 1 项阻塞」 | audit「阻塞列表·A 未完成时 B/C 均阻塞」 |
| [04-dep-satisfied.png](docs/ui/r34/04-dep-satisfied.png) | A done 后 B 解锁：「✓ 前置已满足」 | audit「A done 后 B 解锁」「B done 后前置状态回带 done」 |
| [05-dep-cycle-error.png](docs/ui/r34/05-dep-cycle-error.png) | 循环依赖红条：A→B→C→A 闭环文案 | audit「4xx·环 -> 400 + cycle 路径」 |
| [06-dep-narrow.png](docs/ui/r34/06-dep-narrow.png) | 488×1100 `?narrow=1` 窄屏阻塞列表完整 | 矩阵↔壳 SHA 零重叠；e2e「窄屏 seam」 |
| [07-dep-error.png](docs/ui/r34/07-dep-error.png) | 真 409 阻塞错误条（前置未完成无法完成） | audit「409·DEPENDENCY_BLOCKED + blockers」 |

- 全库 **320 PNG / 318 互异**（r33 为 313/311，+7 = 本轮矩阵新增；18 壳为替换同路径不增总数）；同态组仅 r4 已披露 2 组，r34 零新增。
- 矩阵↔壳 SHA256 交叉重叠 0；七张矩阵 + 十八张壳逐张 `read_image` 目验无登录页 / 空白 / 乱码 / 裁切 / 塌陷。
