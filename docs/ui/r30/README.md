# docs/ui/r30 · 多维表格公式字段截图矩阵（空态 / 表达式编辑 / 实时预览 / 网格计算 / 错误红标 / 窄屏 / 循环引用）

- **轮次**：r30（M10 后功能补强）。改渲染层（表格页字段管理面板加公式类型 / 表达式输入 / 实时预览，网格加只读公式列与错误红标，**18 tab 数量不变**），按 AGENTS.md 第一条：七张矩阵 + 十八 tab 壳基线**同批重拍**，截图与索引 / 根 README 同一提交。
- **纪律**：全程 headless（`shot.ps1` 的 Edge `--headless=new` + `-WindowStyle Hidden`）；PowerShell 只 ASCII；截图服务走 `scripts\.tmp-r30shot\shot.db`（仓库 `data/xieflow.db` 只读，原库处于远程登录态故未使用），七张状态用 `?shot=bases-formula-*` 钉态，窄屏用 `?narrow=1` 显式钉态；真实「单价 × 数量 = 小计」、改依赖重算、循环引用 400、只读不落库由 e2e + audit HTTP 真断言锁定，页面钉态只呈现可观察形态。零 token、零 eval / 零外部依赖。
- **复拍命令**：`$env:XIEFLOW_DB_PATH = Join-Path (Get-Location) 'scripts\.tmp-r30shot\shot.db'; powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\shot.ps1 shots -Round r30`
- **废片处理**：首轮 shot 定义只加在「种子链」未加在「矩阵链」，导致拍出 r1 默认 5 张登录页（与 r29 同名仓库库远程态叠加）；定位后在矩阵链补 r30 分支、以 scratch 库重启 api，**全矩阵 7 张 + 十八壳同批重拍**，废片未入库；二轮 05 误显字段面板而非网格红标，改正后再次全批重拍，最终 7/7、18/18 哈希互异。

| 图 | 形态 | 对应断言 |
|---|---|---|
| [01-formula-empty.png](01-formula-empty.png) | 公式字段空态：字段管理面板选「公式」，表达式输入框为空，「添加字段」禁用；同表已有单价 / 数量列 | e2e「r30 web 表达式输入框在场 / 公式列只读」；audit「r30 公式缺表达式 -> 400」 |
| [02-expression-edit.png](02-expression-edit.png) | 表达式编辑：新字段类型「公式」+ 输入框逐字 `{单价} * {数量}`；既有小计列同样显示表达式 | e2e「r30 表达式随字段回带 / 编译引用清单」；audit「r30 小计类型 formula」 |
| [03-live-preview.png](03-live-preview.png) | 实时预览：面板「试算成功：引用字段 单价、数量 · 共 3 行」，三行计算值 50 / 21 / 18 | e2e「r30 批量重算」；audit「r30 新建字段实时预览 valid / 覆盖两行」 |
| [04-grid-computed.png](04-grid-computed.png) | 网格计算值：单价 12.5×4 / 3×7 / 9×2 → 小计列绿色只读值 50 / 21 / 18 | e2e「r30 数据层装配公式值」；audit「r30 小计真算 12.5 × 4 = 50（真 HTTP）」 |
| [05-error-red.png](05-error-red.png) | 错误红标：`商={单价}/{零}` 三行均显示红色「⚠ 除零错误：除数不能为 0」，值恒 null | e2e「r30 运行时错误·error 文案含除零」；audit「r30 除零单元格 error 文案含除零」 |
| [06-narrow.png](06-narrow.png) | 488×1000 `?narrow=1`：顶栏折叠 + 状态行 + 表格控件纵排 + 网格横向可滚动 + 底栏「更多 ›」 | `force-narrow` seam；逐张目验 |
| [07-cycle-error.png](07-cycle-error.png) | 循环引用错误：甲 `{乙}+1` / 乙 `{甲}+1`，面板红条「循环引用：甲 → 乙 → 甲」，背景网格对应单元格红标 | e2e「r30 A↔B 检出一组循环 / 环污染」；audit「r30 甲↔乙循环引用改写 -> 400」 |
| `docs/ui/shell/` 18 张 | 十八 tab 激活态同批重拍（徽章 r30），表格页空库态 | `Invoke-ShellBaseline`；e2e 逐张复算 |

## SHA256 自查（矩阵 7/7 互异；壳 18/18 互异）

<!-- R30_HASHES_BEGIN -->

- **矩阵 7 张**（亲算 `Get-FileHash -Algorithm SHA256` 前 8 位）：`01=D9935C1A` · `02=60EFB8A5` · `03=2E1CC427` · `04=16E7B981` · `05=52C91C50` · `06=A2B74343` · `07=5D9875C5` —— **7/7 互异**。
- **壳基线 18 张**（亲算）：`workbench=01A4AF98` · `todos=7484C959` · `schedules=C05952A1` · `projects=E064FF1A` · `board=97D68577` · `bases=6867BE51` · `docs=76119437` · `chat=0C2624C5` · `knowledge=DC7AAB96` · `mindmap=9A482C1E` · `whiteboard=B0005100` · `approval=A3C6CC42` · `assets=ABEA246B` · `unit-tasks=4287498E` · `org=D97B977E` · `notifications=B8B2E7A7` · `reports=E0E438EA` · `meetings=37BCE5C1` —— **18/18 互异**，与 `docs/ui/shell/README.md` 的 R30 当前块逐字一致。
- 矩阵↔壳交叉重叠 **0**；全库 **297 PNG / 295 互异**，同态组仅 r4 已披露 2 组，r30 零新增。
<!-- R30_HASHES_END -->

> e2e「r30 七张 PNG SHA256 两两互异」「shell README R30 哈希与实际文件逐字一致」逐张复算锁定本表。逐张 `read_image` 目验 7 矩阵 + shell/bases：中文无乱码、无白屏、无裁切、无塌陷；十八条药丸单行不折行；窄屏纵排与底栏完整；预览绿值 / 除零红标 / 循环引用红条语义清楚。
