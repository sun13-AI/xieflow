# docs/ui/r14 —— 思维导图 Markdown 双视图（M7 起步，6 张）

> 与实现、根 README 索引、yanfa 报告同一提交。全部由 `scripts/shot.ps1 all -Round r14` 一次性 headless（`--headless=new -WindowStyle Hidden`）产出；seed 的真实导图拍后经 HTTP DELETE 清理归零（mindmaps=0）。

| 文件 | 形态 | 断言对照 / 取证方式 |
|---|---|---|
| 01-mindmap-empty.png | **导图空态**：十 tab 壳「导图」激活 + 左栏「还没有导图——点『＋ 新建』开始写第一段 Markdown」+ 首次使用空态钉注；Markdown 框与树视图同时为空（非死路） | e2e「新库导图列表为空」「建导图允许空 Markdown（不是死路）」；audit「r14 POST 空内容建导图 -> 201」；`?shot=mindmap-empty` |
| 02-markdown-edit.png | **真实链路·Markdown 编辑态**：真 seed 导图 #1（58 字节 Markdown 源）→ 左栏编辑框逐行显示标题/二级标题/无序与有序列表；右栏树由同一份源解析出 6 节点 | audit「r14 POST Markdown 源逐字节读回」「r14 树解析：列表→子节点」；e2e「md→tree→md 逐字节相等」；`?mapId=1&shot=mindmap-edit` |
| 03-tree-view.png | **真实链路·树视图**：同一张真导图，右栏显示 heading/bullet/numbered 节点、确定性 id（n0 / n0.0 / n0.0.0.0）与层级连线；左栏 Markdown 与右栏树并存 | audit「r14 GET /:id/tree -> 200」「r14 HTTP 树 → Markdown 逐字节等于保存的源」；e2e「标题层级/列表层级断言」；`?mapId=1&shot=mindmap-tree` |
| 04-collapsed.png | **折叠/展开后**：同一真导图折叠 `n0.0`（产品方向）→ 箭头变 ▸、子树隐藏、统计「节点 6 · 折叠 1」 | e2e「折叠：点节点加入折叠集合」「展开：再次点同一节点移出集合」；shared `toggleNodeCollapse`；`?mapId=1&shot=mindmap-collapsed` |
| 05-narrow.png | 窄屏 488×1100（`?narrow=1`）：十药丸单行不折行、徽章独占下一行；左栏导图列表 / Markdown 编辑 / 树视图三块纵排且无裁切 | 无独立数字断言（CSS 断点，确定性钉态，逐张目验；十 tab 壳基线同批重拍） |
| 06-error.png | 错误态（语义化文案 + 操作提示 + 「重试」按钮，钉态） | 无独立断言（4xx 由 audit r14 节锁定）；`?shot=mindmap-error` |

## SHA256 自查（全 8 位前缀）

`01=3B86589E` · `02=78E638D6` · `03=128F386E` · `04=BC511EAB` · `05=AD00245B` · `06=989E46D9` —— **6/6 两两互异**。

十 tab 壳基线（`docs/ui/shell/`，同批重拍）：`workbench=181780C7` · `todos=8D8E3E01` · `schedules=6ACFD18D` · `projects=61E7B03B` · `board=1F291832` · `bases=85BED3EA` · `docs=87C09668` · `chat=0BCD5179` · `knowledge=36A6C61E` · `mindmap=15B9BB97` —— **10/10 互异**，与 r13 九张逐位全异（徽章 r14 + 新增第十 tab）；矩阵任一图与壳任一图不同字节。全库 `docs/ui` **134 PNG / 132 互异**，同态组仅 r4 已披露 2 组，r14 零新增。

## 目验与取证注记

6 张逐张 `read_image` 目验：中文无乱码、无裁切、无塌陷；01/02 编辑框 placeholder 与真实 Markdown 源清晰可辨；03 六节点树层级与 `#id · kind` 元数据完整；04 折叠后箭头与「折叠 1」计数在位，02↔04 同会话同源仅折叠维度不同；05 十药丸单行、徽章独占行、三块纵排无裁切；06 错误态同构。

seed：1 张真导图（标题「r14 导图演示」，Markdown 源含标题层级 + 无序/有序列表 + 缩进子节点），经 `POST /api/mindmaps` + `PUT /:id/content` 真写；清理：`DELETE /api/mindmaps/1`，mindmaps=0，8787/5173 全 free。
