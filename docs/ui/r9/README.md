# r9 截图矩阵 · Markdown 导入导出与 AI 块级修订（M4 收官）

> 入库位置 `docs/ui/r9/`；由 `powershell -File scripts/shot.ps1 all -Round r9` 一次性 headless 产出（8 张 PNG + 1 份真实导出字节佐证 `r9-export-evidence.md`）。
> 壳基线 **7 张**由 `Invoke-ShellBaseline` 同批自动重拍到 `docs/ui/shell/`（r9 未新增 tab，徽章改 r9）。
> 索引与根 `README.md`「界面与测试对照」+「断言规模」、实现代码同一提交。

| 图 | 形态 | 证据性质 | 对应断言 |
|---|---|---|---|
| [01-import-preview.png](01-import-preview.png) | 导入 Markdown 对话框 + **真实预览表**（4 块：标题 / 正文 / 待办已勾选 / 引用）+ 后果提示「整篇替换 / 不可撤销」；确认按钮仅在 committable 时可点 | `?shot=docs-import-preview` 触发真实 `POST /api/documents/:id/import.md/preview`（只解析不写库）；01 拍后脚本才真发 import.md | audit「r9 预览：6 块只展示前 5 块」「r9 预览：committable=true」「r9 预览：绝不写库」；e2e「导入计划：预览取全部（不足 5 行）」 |
| [02-import-success.png](02-import-success.png) | **真实链路·导入成功后**：8 块覆盖 7 种类型，列表块有可见 marker（• / 1.），每块带「AI 修订」按钮 | 01↔02 之间真发 `POST /api/documents/:id/import.md`（日志 `imported=8`），页面 `GET /api/documents/:id/blocks` 真读回 | audit「r9 导入：imported=6」「r9 导入：position 连号 0..5」「r9 导入：HTTP 真读回 6 块」；e2e「importBlocks：整篇替换为 5 块」 |
| [03-export-download.png](03-export-download.png) | 导出落盘佐证：`xieflow-doc-r9-导入导出演示-20261117.md` + `GET /api/documents/:id/export.md → 253 字节` + 真实 Markdown 文本片段 | 02↔03 之间 `Invoke-WebRequest` 真下载到 [r9-export-evidence.md](r9-export-evidence.md)（253 B，逐字可读）；页面 `?shot=docs-export` 从同一端点取文本 | audit「r9 导出：响应文本与 shared blocksToMarkdown 逐字相等」「r9 往返：md → blocks 逐字节相等」 |
| [04-revise-diff.png](04-revise-diff.png) | **AI 修订 diff 面板**：原文 vs 建议（精简稿）左右对照 + `mock-scripted-v1` 标识 + 中文理由；「放弃 / 采纳并替换」双按钮 | `?shot=docs-revise-diff` 真调 `POST …/revise { instruction:'精简' }`（**adopt 缺省 → 零写入**），面板上方同时可见「建议仅供预览」提示 | audit「r9 修订：未采纳 applied=false」「r9 未采纳不改库：修订前后块快照逐字节相等」；e2e「修订计划：未采纳 → applied=false 且文本保持原文」 |
| [05-revise-adopted.png](05-revise-adopted.png) | **采纳后**：第 2 块文本变为「…（精简稿）」+ 两条成功提示（`applied=true`） | 04↔05 之间真发 `POST …/revise { instruction:'精简', adopt:true }`（日志 `applied=True provider=mock-scripted-v1`），文档 C 真写库 | audit「r9 采纳：HTTP 真读回块文本已替换为建议」「r9 采纳后：导出 Markdown 立刻反映新文本」 |
| [06-revise-discarded.png](06-revise-discarded.png) | **放弃后**：文档 B 第 2 块仍为原文（两句完整），提示「服务端零写入」；与 05 文本逐字不同 | 文档 B 从未 adopt；`?shot=docs-revise-discarded` 只钉态展示原文，无写库动作 | audit「r9 显式 adopt=false 仍不写库」「r9 未采纳不改库」；e2e「修订计划：adopt 缺失按未采纳处理」 |
| [07-narrow-u2-fixes.png](07-narrow-u2-fixes.png) | 窄屏 488×900：七药丸不折行、列表与编辑器纵排；**r8 U2-1 修复**：长文本两行完整可见（无 1px 字形顶渣）；**U2-2 修复**：无序 `•` / 有序 `1.` 编辑态 marker 在场 | `?narrow=1` 确定性钉态 + 真实导入数据；输入框 `AutoGrowTextarea` 按 scrollHeight 撑高 | 无独立数字断言（CSS + 布局钉态；证据为逐张目验；文本落库由 audit「r9 导入：HTTP 真读回 6 块」锁定） |
| [08-import-narrow.png](08-import-narrow.png) | 窄屏导入对话框 + 预览表（4 块）完整可见，无横向溢出 | `?narrow=1&shot=docs-import-preview` 真调 preview 端点；无写库 | audit「r9 预览：绝不写库」 |

## SHA256 自查（8/8 互异）

`01=38C01ACF` · `02=35FF136B` · `03=34DE6547` · `04=7DA5BA4D` · `05=386F7051` · `06=D1E66F7A` · `07=AD713D28` · `08=5FA726E6` —— 8/8 两两互异；`r9-export-evidence.md=D10EB426`（非 PNG，单列以说明字节证据）。

全库 `docs/ui` **96 张 PNG / 94 个互异哈希**；唯一同态组仍是 r4 已披露的 `01↔16`（`9E5C0C23`）与 `05↔13`（`8397A028`），**r9 零新增同态组**。壳基线 7 张同批重拍（徽章 r9），与 r8 逐位全异。

## 首轮红相与重拍（诚实注记）

首轮 01/04/08 的钉态副作用经真实调用 preview / revise 端点，但当时 `useEffect` 里 state 尚未提交，`doc` 闭包仍为 null，导致预览表 / diff 面板缺席；`read_image` 目验发现后，改为把 `data.doc` 显式传入 `previewImport` / `requestRevise`，**全矩阵重拍**（上面 8 张为最终版，首轮废片未入库）。

## 「用户第一次用」全链路（CDP 真点，本轮额外实证）

0 文档起步 → 点「＋ 新建文档」填标题 → 建出 1 个默认空首块 → 点「导入 Markdown」→ 真填 → 预览 5 块 → 确认导入（5 块落库）→ 第 2 块「AI 修订」→ 生成建议（HTTP 前后快照 SHA `12ED9D9F…` **逐字节相等**，零写入）→ 点「采纳并替换」（块文本真替换）→ 另一块「AI 修订」→ 生成建议 → 点「放弃」（前后快照 SHA `6ADD6D93…` 相等）→ 点「导出 .md」（153 字节按字节落盘）→ reload 重开 5 块文本全在 → 导出的 md 再 POST import.md 到新文档，`type/text/checked/language` 逐字段逐字节相等（`ROUNDTRIP_EQUAL=True`）→ DELETE 两个探针文档，库内 0 篇；`shot.ps1 down` 后 8787/5173 全 free。全程使用环境已有 headless CDP 页面，未新开可见窗口。
