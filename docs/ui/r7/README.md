# r7 截图矩阵 · 视图持久化与 CSV 导入（M3 收官）

> 入库位置 `docs/ui/r7/`；由 `powershell -File scripts\shot.ps1 shots -Round r7` 一次性 headless 产出（9 张）。
> 全部截图 `--headless=new -WindowStyle Hidden` 一次性进程，无可见窗口、无常驻浏览器。
> 壳基线 6 张由脚本 `Invoke-ShellBaseline` 自动重拍到 `docs/ui/shell/`（六 tab 激活态，本轮未新增 tab）。
> 索引与根 `README.md`「界面与测试对照」、实现代码同一提交。

## 一、逐图索引（9 张）

| 图 | 形态 | 证据来源 | 对应断言 |
|---|---|---|---|
| [01-views-switcher.png](01-views-switcher.png) | **真实链路·视图切换栏多视图**：「全部记录」激活 + 4 个已保存视图（进行中事项 / 已完成 · 精简 / 全部金额降序 / 本次导入）+「＋ 新建视图」「编辑视图」；6 行真实记录（3 条 seed + 3 条真导入） | seed 经 `POST /api/tables/:id/views` 建 4 个视图、经 `POST /api/tables/:id/import.csv` 真导入 3 行 | audit「r7 POST 视图 -> 201」「r7 视图列表：1 个视图」「r7 导入：表内 4 + 3 = 7 行」；e2e「createView 返回自增 id」「listViews 按 position 排序」 |
| [02-view-editor.png](02-view-editor.png) | **真实链路·视图编辑面板**：`?editView=<id>` 打开面板，视图名 / 筛选条件（状态 = 进行中）/ 排序规则（金额 降序）/ 显示列勾选（4 勾 4 不勾）全部来自真实已保存 spec | 面板数据由 `GET /api/tables/:id/views` 真读回 | audit「r7 PATCH 编辑视图 -> 200」「r7 视图：sort_spec 读回」；e2e「updateView 改名生效」「updateView 未给的 spec 段沿用旧值」 |
| [03-hidden-columns.png](03-hidden-columns.png) | **真实链路·隐藏列后网格**：切到「已完成 · 精简」视图，8 列投影成 4 列（名称 / 状态 / 金额 / 完成），视图口径条显示「筛选 状态 = 已完成 · 排序 金额 升序 · 隐藏列 负责人、截止日期、标签、链接（命中 2 行）」 | `GET /api/views/:id/records` 真查询（shared `queryRecords` 投影） | audit「r7 按视图查询：投影后 data 恰 3 个键」「r7 编辑后：取消隐藏列，data 恢复完整字段」；e2e「视图查询：投影只保留 visible_fields 两个字段键」 |
| [04-import-preview.png](04-import-preview.png) | **真实链路·导入预览**：CSV 文本框 + 「共 5 行数据 · 预览前 5 行 · 全部行合法」+ 前 5 行原始预览表（含引号内逗号的多选列「重要,紧急」） | `?shot=bases-import-preview` 触发页面**真实** `POST /api/tables/:id/import.csv/preview` | audit「r7 预览：3 行数据」「r7 预览：合法 CSV 零错误行」「r7 预览不落库：记录数仍是 4」；e2e「导入计划：7 行时预览只取前 5 行」 |
| [05-import-errors.png](05-import-errors.png) | **真实链路·导入错误行提示**：「共 3 行数据 · 预览前 3 行 · 2 行不合法」+ 错误清单「第 2 行：字段「金额」数字字段必须是数值」「第 3 行：字段「状态」单选值必须在候选项内」 | 同一预览端点返回的真实错误行清单（行号 + 原因） | audit「r7 错误预览：错误行号 2 / 3 / 4（1 起）」「r7 错误预览：每行都带中文原因」；e2e「错误聚合：错误行号精确为第 2 / 3 / 4 行」 |
| [06-import-success.png](06-import-success.png) | **真实链路·导入成功后**：绿色反馈条「导入成功：3 行已全部落库（零半态）。」+「本次导入」视图（按负责人 = CSV 导入 筛选）只显示 3 条真导入行，金额 7701 / 7702 / 7703 | seed 真发 `POST /api/tables/:id/import.csv`（响应 `imported=3`，写进 URL），页面消费真实库数据 | audit「r7 确认导入（全合法）-> 201」「r7 导入：imported=3」；e2e「原子导入：全合法时一次落 2 行」 |
| [07-views-narrow.png](07-views-narrow.png) | 窄屏 488×900（`?narrow=1` 钉态）：六药丸 tab 一排不折行，工具条 / 视图切换栏纵排，网格横滚 | CSS 断点，确定性钉态 | 无独立断言（CSS 断点，确定性钉态） |
| [08-cell-editor-fixed.png](08-cell-editor-fixed.png) | **U2-1 修复证据·固定列宽**：格内文本框被锁在本列内，「状态」及其后各列列位与 01 完全一致，不再整表右移 | 钉态（`?shot=bases-edit`，8 字段种子）；`table-layout: fixed` + 编辑框 `box-sizing: border-box` | 无独立断言（纯 CSS 行为；e2e/audit 不覆盖渲染层），证据为本图与 01 的列位对照 |
| [09-filter-feedback.png](09-filter-feedback.png) | **U2-2 修复证据·筛选提交反馈 + 方向校验**：绿色成功条「已应用筛选：「状态」= 已完成 —— 命中 2 行。」+「应用筛选 / 清除」按钮 + 未选排序字段时方向下拉禁用且提示「先选排序字段」 | 页面调用与按钮**同一个** `applyFilter()` 处理函数（真实 API 查询，命中数来自真实响应，非静态文案） | audit「r7 非法排序方向 -> 400（方向下拉校验）」「r7 合法排序方向 asc -> 200」；e2e「视图 spec：非法排序方向抛错」 |

### 缺图 / 注记

- 任务单要求 6 态（视图切换栏 / 视图编辑面板 / 隐藏列后网格 / 导入预览 / 导入错误行提示 / 导入成功后）**全覆盖**，另加码 3 张（窄屏 / U2-1 固定列宽 / U2-2 筛选反馈）。
- 08 是**钉态**（`?shot=bases-edit` 用 8 字段种子数据开格内编辑器），用于证明列宽不跳变；其余 8 张均为真实 api 链路（04/05 的预览、06 的导入、09 的筛选都是真 HTTP 请求）。
- 09 的反馈条不是伪造文案：走的是「应用筛选」按钮的同一个 `applyFilter()`，命中数由真实 `GET /api/tables/:id/records` 返回。
- 导入对话框的「确认导入」按钮在预览有错误行时仍可点，服务端会返回 422 + 错误行清单并**一行都不落库**（见 audit 零半态 4 条断言），该失败态由 05 的错误清单 + 断言输出共同举证，未另拍「点了确认后」的重复画面。

## 二、SHA256 自查（9 张两两互异）

`01=6B71AE53` · `02=6EE45335` · `03=5047A206` · `04=95770FA0` · `05=E0CF9113` · `06=577AA72B` · `07=0FD41D77` · `08=92C349B4` · `09=4AE00D0A`

全库 `docs/ui` 共 **76 张 PNG / 74 个互异哈希**；唯一两组同态仍是 r4 已披露组
（`r4/01-project-empty` == `r4/16-project-empty-rework` = `9E5C0C23`；
`r4/05-board-moved` == `r4/13-board-direct` = `8397A028`），**r7 零新增同态组**。
9 张逐张 `read_image` 目验：中文无乱码、无裁切、无布局塌陷，各态画面互异。

## 三、壳基线（自动重拍，6 张）

`workbench-tab-active=E8068322` · `todos-tab-active=95DD13BD` · `schedules-tab-active=3B27912D` ·
`projects-tab-active=3BC1FF32` · `board-tab-active=814CEB4D` · `bases-tab-active=6AD06FCF`。

本轮**未新增 tab**，但壳徽章改为「r7 · 视图持久化与 CSV 导入」、工作台 schema 卡推进到 **v6**，
`shot.ps1 Invoke-ShellBaseline` 在 `shots -Round r7` 时自动重拍六张激活态（同批 mtime，与 r6 基线哈希全异）。
`bases-tab-active` 在 seed 清理后拍，仍是「一张表都没有」的首次使用引导（与 01 的真实有表态刻意分形，哈希互异）。
