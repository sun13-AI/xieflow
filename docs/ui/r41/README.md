# docs/ui/r41 · 轻量表单收集截图矩阵（7 张）

> 工作目录 `D:\work\好东西\xieflow`。截图与实现 / 索引 / 根 README 同一提交（宪法第一条）。
> 全程 headless CDP（一次性 Edge `--headless=new` + 临时 profile），`scripts/shot.ps1 shots -Round r41`，
> 捕获进程退出即杀、scratch 库批次末删除；未打开任何可见窗口。
> 七张均为真实 `?page=forms&shot=<pin>` 下的 FormsPage 组件，`?narrow=1` 显式钉窄屏；
> 真实 CRUD / 4xx / 汇总手算另有 e2e 与 HTTP audit 断言锁定，图仅为形态证据。

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-forms-empty.png](01-forms-empty.png) | 表单空态：二十 tab 壳「表单」激活 + 「还没有表单」引导 + ＋新建表单入口 | e2e「r41 web·空态 seam 在场」「r41 App·二十 tab」；audit「r41 GET 空表单列表 -> 200」 |
| [02-forms-create.png](02-forms-create.png) | 创建表单：标题 / 说明 / 单道默认题 + 题型下拉 / 必填勾选 / 创建按钮 | e2e「r41 web·创建表单 seam 在场」；audit「r41 POST 建表单 -> 201」 |
| [03-forms-questions.png](03-forms-questions.png) | 问题编辑：文本 / 数字 / 单选（候选项）/ 勾选四类题同屏 + 添加 / 移除 | e2e「r41 类型·四题白名单」「r41 web·问题编辑 seam 在场」；audit「r41 4xx·未知题型 -> 400」 |
| [04-forms-fill.png](04-forms-fill.png) | 填写视图：四类控件按题型渲染 + 提交 / 查看汇总 / 返回 | e2e「r41 校验·归一答案」「r41 web·填写视图 seam 在场」；audit「r41 GET 填写视图 -> 200」 |
| [05-forms-submitted.png](05-forms-submitted.png) | 提交成功：绿色成功条「答卷已提交，感谢填写。」+ 填写态保留 | e2e「r41 web·提交成功 seam 在场」；audit「r41 提交答卷 甲/乙/丙 -> 201」 |
| [06-forms-summary.png](06-forms-summary.png) | 汇总统计：共 3 份答卷 4 道题；文本列举 / 总和 60 均值 20 / 分布 2:1（67%/33%）/ 勾选率 67% | e2e「r41 汇总·数值手算 sum=60 avg=20」；audit「r41 汇总·HTTP 手算 sum=60 avg=20」 |
| [07-forms-narrow.png](07-forms-narrow.png) | 窄屏 488px：填写表单纵排 + 底部导航「更多 ›」可达，无横向溢出 | e2e「r41 截图·七张 SHA256 两两互异」；headless CDP 488×1100 钉态 |

## R41 哈希自查（7 张互异，与当前文件逐字一致）

<!-- R41_HASHES_BEGIN -->
`01-forms-empty=3F582AD5` · `02-forms-create=E4D79860` · `03-forms-questions=5988051E` ·
`04-forms-fill=D230CD5D` · `05-forms-submitted=F27A3862` · `06-forms-summary=8EE2BF84` ·
`07-forms-narrow=4E6D2768` —— **7/7 互异**。
<!-- R41_HASHES_END -->

> 首轮 02/03 与 04/05 因 `?shot=` 钉态只切 view 未切草案 / 成功条而字节相同，已修正 web 钉态
> （`forms-questions` 预置四题、`forms-submitted` 预置成功条）并**全矩阵重拍**，废片未入库；
> 重拍后 7/7 互异，矩阵↔二十 tab 壳重叠 0，全库 365 PNG / 363 互异（同态组仅 r4 已披露 2 组）。
> 二十 tab 壳基线见 [shell/README.md](../shell/README.md) R41 当前哈希块（新增 `forms-tab-active.png`）。
