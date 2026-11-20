# docs/ui/r31 · 轻量清理截图矩阵（字段类型文案回归 / 公式浮点展示格式化）

- **轮次**：r31（M10 后第九轮轻量清理）。改渲染层（表格页零表空态文案由「7 种字段类型齐备」改为「8 种字段类型齐备（含公式）」；公式单元格与试算预览统一走 shared `formatFormulaDisplay` 收敛浮点尾数；**18 tab 数量不变**），按 AGENTS.md 第一条：两张矩阵 + 十八 tab 壳基线**同批重拍**，截图与索引 / 根 README 同一提交。
- **纪律**：全程 headless（`shot.ps1` 的 Edge `--headless=new` + `-WindowStyle Hidden`）；PowerShell 只 ASCII；三态均用 `?shot=bases-empty` / `?shot=bases-formula-float` / `?shot=bases-formula-float-grid` 钉态；干净空库由 scratch 库保证（仓库 `data/xieflow.db` 只读）。求值语义零改动——HTTP 原始浮点仍为 `84.80000000000001`，由 e2e / audit 真断言锁定；展示层仅收敛为 `84.8`。零 token、零依赖新增。
- **复拍命令**：`$env:XIEFLOW_DB_PATH = Join-Path (Get-Location) 'scripts\.tmp-r31shot\shot.db'; powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\shot.ps1 shots -Round r31`
- **废片处理**：无废片入库；首拍两态（空态 + 预览态）发现预览弹窗遮挡背景网格「含税」列，补第三张纯网格态直证展示值；三态 + 十八壳同批重拍，废片未入库。

| 图 | 形态 | 对应断言 |
|---|---|---|
| [01-bases-empty-text.png](01-bases-empty-text.png) | 零表首次使用空态：「8 种字段类型齐备（含公式）」逐字可读，「＋ 新建表」入口在场，十八药丸壳 + r31 徽章 | e2e「r31 空态文案改为 8 种字段类型齐备（含公式）」；e2e「r31 旧 7 种文案零残留」 |
| [02-formula-float-display.png](02-formula-float-display.png) | 链式公式试算预览：表达式 `{小计} * 1.06`；面板「试算成功：引用字段 小计 · 共 1 行」，「记录 #11：84.8」绿值（原始浮点 84.80000000000001 不出现在展示层） | e2e「r31 展示格式化·链式浮点尾数」「求值语义不变」；audit「r31 预览端点回带原始浮点 / 展示收敛到 84.8」 |
| [03-formula-float-grid.png](03-formula-float-grid.png) | 纯网格态（弹窗关闭）：行「含税试算」的「含税」公式列绿值 `84.8`，与小计列 `80` 同屏；无 `84.80000000000001` 尾数 | e2e「r31 公式单元格与试算预览统一走 shared 展示格式化」；audit「r31 GET 原始浮点逐字保持 / 展示格式化 -> 84.8」 |
| `docs/ui/shell/` 18 张 | 十八 tab 激活态同批重拍（徽章 r31），表格页空库态同步八类文案 | `Invoke-ShellBaseline`；e2e 逐张复算 |

## SHA256 自查（矩阵 3/3 互异；壳 18/18 互异）

<!-- R31_HASHES_BEGIN -->

- **矩阵 3 张**（亲算 `Get-FileHash -Algorithm SHA256` 前 8 位）：`01=E3B26C4E` · `02=0E407BD1` · `03=FF34BC38` —— **3/3 互异**。
- **壳基线 18 张**（亲算）：`workbench=EE7CAF9E` · `todos=3EF96C63` · `schedules=EF86BC0F` · `projects=069C3562` · `board=00D08677` · `bases=FC2BBE34` · `docs=EE575E2A` · `chat=BE383BEA` · `knowledge=C78FDE18` · `mindmap=593854FA` · `whiteboard=4649BECD` · `approval=9B814E8E` · `assets=34E08466` · `unit-tasks=B66A02D0` · `org=FC96A31B` · `notifications=A28F12E7` · `reports=9373415F` · `meetings=F5620C55` —— **18/18 互异**，与 `docs/ui/shell/README.md` 的 R31 当前块逐字一致。
- 矩阵↔壳交叉重叠 **0**；r30→r31 十八壳逐名全异（changed=18 / same=0，徽章推进 r31 + bases 文案同步八类）；全库 **300 PNG / 298 互异**，同态组仅 r4 已披露 2 组，r31 零新增。
<!-- R31_HASHES_END -->

> e2e「r31 矩阵索引三态齐备」「r31 矩阵索引哈希自查块在场」锁定本表结构；逐张 `read_image` 目验 3 矩阵 + 18 壳：中文无乱码、无白屏、无裁切、无塌陷、无登录页；空态八类文案逐字可读；试算面板「记录 #11：84.8」与纯网格「含税」列绿值 84.8 两态互证。
