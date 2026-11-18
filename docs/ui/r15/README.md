# docs/ui/r15 —— 白板画布与 AI 建板（M7 收官，7 张 + 1 份真实导出 .md）

> 与实现、根 README 索引、yanfa 报告同一提交。全部由 `scripts/shot.ps1 all -Round r15` 一次性 headless（`--headless=new -WindowStyle Hidden`）产出；seed 的两张白板拍后经 HTTP DELETE 清理归零（whiteboards=0，条目 ON DELETE CASCADE）。

| 文件 | 形态 | 断言对照 / 取证方式 |
|---|---|---|
| 01-whiteboard-empty.png | **白板空态**：十一 tab 壳「白板」激活 + 左栏「还没有白板——点『＋ 新建』开始画第一张便签」+ 首次使用空态钉注；画布网格与工具条在场、0 个条目（非死路） | e2e「新库白板列表为空」「createWhiteboard 返回自增 id」；audit「r15 POST 白板 -> 201」；`?shot=whiteboard-empty` |
| 02-board-notes.png | **真实链路·画布有便签**：真 seed 白板 #5（3 张 note：产品方向 / 本周任务 / 风险与依赖，坐标 (80,80)/(340,80)/(600,80)），无限画布网格 + 平移缩放工具条 | audit「r15 POST 便签 -> 201」「r15 便签缺省色由 shared 归一」；e2e「createWhiteboardItem 返回自增 id」；`?boardId=5&shot=whiteboard-notes` |
| 03-after-drag.png | **拖拽后**：02→03 间真发 `POST /api/whiteboards/5/items/move`，第一张便签由 (80,80) 移到 (120,300)；其余两张原位不变 | audit「r15 批量移动真落库（不是临时态）」「r15 批量移动后重叠条目被避让下移」；e2e「批量移动后重叠条目被避让下移」；`?boardId=5&shot=whiteboard-dragged` |
| 04-ai-created.png | **AI 建板结果**：真 seed 白板 #6 经 `POST /:id/ai-create` 按「季度复盘」生成 7 张便签，3 列网格 + 5 色轮换，内容含真实主题且互不重叠 | audit「r15 AI 建板真生成 5-8 便签」「r15 AI 建板布局不重叠」「r15 AI 建板同主题确定性」；e2e「AI 建板生成 5-8 个便签」；`?boardId=6&shot=whiteboard-ai` |
| 05-export.png | **导出佐证**：同真实白板 #5，GET /:id/export.md 由 shared `buildWhiteboardMarkdown` 真装配，状态条显示「已导出 Markdown（N 字符）」 | audit「r15 导出 Markdown 含真实条目内容」「r15 导出 content-type 为 text/markdown」；e2e「导出 Markdown 按 y 坐标排序」；`?boardId=5&shot=whiteboard-export` |
| 06-narrow.png | 窄屏 488×1100（`?narrow=1`）：十一药丸单行不折行（`overflow-x:auto` 兜底）、徽章独占下一行；侧栏 / 工具条 / 画布纵排，便签与坐标无裁切 | 无独立数字断言（CSS 断点，确定性钉态，逐张目验；十一 tab 壳基线同批重拍） |
| 07-error.png | 错误态（语义化文案 + 操作提示 + 「重试」按钮，钉态） | 无独立断言（4xx 由 audit r15 节锁定）；`?shot=whiteboard-error` |
| whiteboard-export.md | **落盘字节证据**：真 `GET /api/whiteboards/5/export.md` 原样落盘（352 字节），标题 H1 + 3 条目（含拖拽后新坐标 (120,300)）+ 坐标/尺寸/颜色 | audit「r15 导出 Markdown 以白板标题为 H1」「r15 导出 Markdown 含真实条目内容」；UTF-8 中文无乱码 |

## SHA256 自查（全 8 位前缀）

`01=6E881B39` · `02=53BADB0D` · `03=56D6C710` · `04=022B552B` · `05=29BA5056` · `06=226C62F5` · `07=24A7D337` —— **7/7 两两互异**，落盘 `whiteboard-export.md=C757440E`（另 1 份字节证据，非 PNG）。

十一 tab 壳基线（`docs/ui/shell/`，同批重拍）：`workbench=CC7B840C` · `todos=8156999C` · `schedules=7C207393` · `projects=C43FAE9C` · `board=314F520E` · `bases=3C782558` · `docs=52458F27` · `chat=FAFD3FF5` · `knowledge=1637C3F3` · `mindmap=344726B6` · `whiteboard=D764DC2E` —— **11/11 互异**，与 r14 十张逐位全异（徽章 r15 + 新增第十一 tab）；矩阵任一图与壳任一图不同字节。全库 `docs/ui` **142 PNG / 140 互异**，同态组仅 r4 已披露 2 组（`9E5C0C23` / `8397A028`），r15 零新增。

## 目验与取证注记

7 张逐张 `read_image` 目验（中文无乱码、无裁切、无塌陷）：01 空态三处引导齐备；02 三张暖黄便签与坐标 (80,80)/(340,80)/(600,80) 清晰；03 第一张便签真移到 (120,300)，与 02 同会话同源仅坐标维度不同；04 七张便签五种底色、内容含「季度复盘」且 3 列网格互不重叠；05 导出提示条在场；06 窄屏十一药丸单行、徽章独占行、侧栏/工具条/画布纵排；07 错误态与历史轮同构。导出 .md 用 `read` 按 UTF-8 复核，标题「r15 白板演示」、3 条便签内容与新坐标逐字可读。

seed：白板 #5（3 张真便签）+ 白板 #6（AI 建板 7 张），经 `POST /api/whiteboards` / `POST /:id/items` / `POST /:id/ai-create` 真写；02→03 真发批量移动；03→04 间真 GET export.md 落盘。清理：`DELETE /api/whiteboards/5` 与 `/6`，whiteboards=0，8787/5173 全 free。
