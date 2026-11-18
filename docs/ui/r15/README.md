# docs/ui/r15 —— 白板画布与 AI 建板（M7 收官，7 张 + 1 份真实导出 .md；返工 #1 同批重拍）

> 与实现、根 README 索引、yanfa 报告同一提交。全部由 `scripts/shot.ps1 all -Round r15` 一次性 headless（`--headless=new -WindowStyle Hidden`）产出；seed 的两张白板拍后经 HTTP DELETE 清理归零（whiteboards=0，条目 ON DELETE CASCADE）。
>
> **返工 #1**：修复侧栏逐板计数（U2-1，原先每行都显示选中板的条目数，#6 出现 3↔7 跨图矛盾）与状态条「拖动画布可平移查看视口外便签」提示（U2-2）；渲染层变更后 7 张矩阵 + 11 张壳基线同批重拍。seed 真实 id 为 **#8 / #9**（`AUTOINCREMENT` 不回退，按实图如实记录，不复用旧轮 #5/#6 的说法）。04 第 7 张便签底沿、06 note #40 右沿仍被视口裁切——无限画布允许裁切，状态条已给出平移提示，本索引如实标注，**不再写「无裁切」**。

| 文件 | 形态 | 断言对照 / 取证方式 |
|---|---|---|
| 01-whiteboard-empty.png | **白板空态**：十一 tab 壳「白板」激活 + 左栏「还没有白板——点『＋ 新建』开始画第一张便签」+ 首次使用空态钉注；画布网格与工具条在场、0 个条目（非死路）；底部状态条有「拖动画布可平移」提示 | e2e「新库白板列表为空」「createWhiteboard 返回自增 id」；audit「r15 POST 白板 -> 201」；`?shot=whiteboard-empty` |
| 02-board-notes.png | **真实链路·画布有便签**：真 seed 白板 **#8**（3 张 note：产品方向 / 本周任务 / 风险与依赖，坐标 (80,80)/(340,80)/(600,80)，note #39~#41）；侧栏 **#9 · 7 条 / #8 · 3 条逐板独立**（U2-1 回归锁） | audit「r15 POST 便签 -> 201」「r15 返工列表 itemCount 为该板真实条目数」；e2e「白板列表 itemCount 逐板独立」；`?boardId=8&shot=whiteboard-notes` |
| 03-after-drag.png | **拖拽后**：02→03 间真发 `POST /api/whiteboards/8/items/move`，第一张便签由 (80,80) 移到 (120,300)；其余两张原位不变，侧栏计数仍 #9=7 / #8=3 | audit「r15 批量移动真落库（不是临时态）」「r15 批量移动后重叠条目被避让下移」；`?boardId=8&shot=whiteboard-dragged` |
| 04-ai-created.png | **AI 建板结果**：真 seed 白板 **#9** 经 `POST /:id/ai-create` 按「季度复盘」生成 7 张便签（note #42~#48），3 列网格 + 5 色轮换，内容含真实主题且互不重叠；**第 7 张 (80,440) 底沿被画布下沿裁切**，状态条明示「拖动画布可平移查看视口外便签」 | audit「r15 AI 建板真生成 5-8 便签」「r15 返工 AI 建板后全量画布（含既有条目）两两无重叠」；`?boardId=9&shot=whiteboard-ai` |
| 05-export.png | **导出佐证**：同真实白板 **#8**，GET /:id/export.md 由 shared `buildWhiteboardMarkdown` 真装配，状态条显示「已导出 Markdown（220 字符）」；画布与 03 同源 | audit「r15 导出 Markdown 含真实条目内容」「r15 导出 content-type 为 text/markdown」；`?boardId=8&shot=whiteboard-export` |
| 06-narrow.png | 窄屏 488×1100（`?narrow=1`）：十一药丸单行不折行、徽章独占下一行；侧栏 / 工具条 / 画布纵排；侧栏 #9=7 / #8=3 自洽。**note #40 右沿被画布右边界裁切、#41 完全在视口外**，底部状态条给出「拖动画布可平移查看视口外便签 · 滚轮 / ± 缩放」提示——如实承认裁切，不再写「无裁切」 | 无独立数字断言（CSS 断点，确定性钉态，逐张目验；十一 tab 壳基线同批重拍） |
| 07-error.png | 错误态（语义化文案 + 操作提示 + 「重试」按钮，钉态；本轮重拍后与旧轮逐字节相同） | 无独立断言（4xx 由 audit r15 节锁定）；`?shot=whiteboard-error` |
| whiteboard-export.md | **落盘字节证据**：真 `GET /api/whiteboards/8/export.md` 原样落盘（352 字节），H1「r15 白板演示」+ 3 条目（#39/#40/#41，含拖拽后新坐标 (120,300)）+ 坐标/尺寸/颜色 | audit「r15 导出 Markdown 以白板标题为 H1」「r15 导出 Markdown 含真实条目内容」；UTF-8 中文无乱码 |

## SHA256 自查（全 8 位前缀，返工 #1 重拍后亲算）

`01=0547601C` · `02=F6D33791` · `03=1468619F` · `04=F65EAACB` · `05=A1764D8C` · `06=1A972C3E` · `07=24A7D337` —— **7/7 两两互异**；落盘 `whiteboard-export.md=4CC73771`（另 1 份字节证据，非 PNG；便签 id 随本轮 seed 变为 #39~#41，故与旧轮字节不同）。

十一 tab 壳基线（`docs/ui/shell/`，同批重拍）：`workbench=0383DADC` · `todos=8156999C` · `schedules=7C207393` · `projects=C43FAE9C` · `board=314F520E` · `bases=3C782558` · `docs=52458F27` · `chat=FAFD3FF5` · `knowledge=1637C3F3` · `mindmap=344726B6` · `whiteboard=65970CAF` —— **11/11 互异**；与 r14 基线十张逐位全异；矩阵任一图与壳任一图不同字节。`workbench` / `whiteboard` 两张因页面内联实时 `last_health_check` 时间戳与新增平移提示而与旧轮字节不同，属真实重拍非假图。全库 `docs/ui` **142 PNG / 140 互异**，同态组仅 r4 已披露 2 组（`9E5C0C23` / `8397A028`），r15 零新增。

## 目验与取证注记

7 张逐张 `read_image` 目验（中文无乱码、无塌陷）：01 空态三处引导齐备且底部平移提示在场；02 三张暖黄便签与坐标清晰，侧栏 #9=7 / #8=3 不再串台；03 第一张便签真移到 (120,300)，侧栏计数不变；04 七张便签五种底色、内容含「季度复盘」且 3 列网格互不重叠，第 7 张底沿被视口下沿裁切（已如实记录，状态条有平移提示）；05 导出提示条「220 字符」在场；06 窄屏十一药丸单行、徽章独占行、note #40 右沿裁切与底部平移提示同图可见；07 错误态与历史轮同构。导出 .md 按 UTF-8 复核，标题、3 条便签内容与新坐标逐字可读。

seed：白板 **#8**（3 张真便签，note #39~#41）+ 白板 **#9**（AI 建板 7 张，note #42~#48），经 `POST /api/whiteboards` / `POST /:id/items` / `POST /:id/ai-create` 真写；02→03 真发批量移动；03→04 间真 GET export.md 落盘。清理：`DELETE /api/whiteboards/8` 与 `/9`，whiteboards=0，8787/5173 全 free（headless 全程，无可见窗口）。
