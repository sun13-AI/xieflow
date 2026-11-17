# r12 截图矩阵 · 知识库入库与检索（M6 起步）

> 入库位置 `docs/ui/r12/`；由 `powershell -File scripts/shot.ps1 all -Round r12` 一次性 headless 产出（7 张矩阵 PNG，全矩阵第二次重拍：首轮 01 空态与壳基线 `knowledge-tab-active` 字节相同，补钉注后重拍）。
> 壳基线 **9 张**由 `Invoke-ShellBaseline` 同批自动重拍到 `docs/ui/shell/`（九 tab：新增「知识库」→ 补 `knowledge-tab-active.png` 并同批重拍旧八张，与 r11 基线逐位全异）。
> 索引与根 `README.md`「界面与测试对照」+「断言规模」、实现代码同一提交。

| 图 | 形态 | 证据性质 | 对应断言 |
|---|---|---|---|
| [01-knowledge-empty.png](01-knowledge-empty.png) | 知识库空态：九 tab 壳「知识库」激活 + 「＋ 入库」引导 + 首次使用空态钉注「真实 0 篇知识文档 / 0 分块」 | `?page=knowledge&shot=knowledge-empty` 钉态，库内真 0 篇（seed 之前） | e2e「空文本分块 0 片」；audit「r12 GET 知识库文档列表 -> 200」端到端形态 |
| [02-ingest-dialog.png](02-ingest-dialog.png) | 入库对话框：标题 + 来源切换「纯文本 / 已有文档」+ 内容自动分块提示 + 确认入库；背后为 3 篇真实种子文档 | `?shot=knowledge-ingest-dialog` 钉态 + seed 真发 3 次 `POST /api/knowledge/ingest`，文档列表来自真库 | audit「r12 真入库科技稿 -> 201」「r12 非法 source_type -> 400」 |
| [03-after-ingest.png](03-after-ingest.png) | 入库成功后文档列表：3 篇真种子文档（科技稿/果园稿/数码稿），各 1 片 + 纯文本来源徽标 | seed 真入库后页面走 `GET /api/knowledge/docs` 真读回 | audit「r12 列表真读回 3 篇」「r12 入库自动分块并算 token_count」 |
| [04-search-results.png](04-search-results.png) | **真实链路·TF-IDF 搜索结果**：真查「手机」2 命中（科技稿 score 0.9317 / 数码稿 0.5478），带「来源：docTitle · chunk #id · 第 N 片 · 纯文本」引用 + 命中词黄色高亮 | `?q=<urlencoded 手机>`，页面真发 `GET /api/knowledge/search?q=手机&limit=10` | audit「r12 TF-IDF 排序：词频最高的科技稿居首」「r12 命中带 doc_id/chunk_id 来源引用」；e2e「TF-IDF 排序：手机词频最高的「科技稿」居首」 |
| [05-source-highlight.png](05-source-highlight.png) | **来源引用高亮钉态**：同 2 命中 + 紫色 spotlight 来源条（`kb-spotlight`）+ 加粗黄色命中词，可溯源到具体 chunk | `?shot=knowledge-source-highlight&q=<手机>`，命中仍来自真检索接口（仅 CSS 强调） | audit「r12 稀有词命中可溯源到具体文档 id」；e2e「命中携带 chunk_id 来源引用」 |
| [06-narrow.png](06-narrow.png) | 窄屏 488×900（?narrow=1）：**九药丸横排一行不折行不裁切**、徽章独占下一行；文档列表 + 搜索命中 + 来源高亮完整 | 确定性钉态 + 真种子数据 + 真检索命中 | 无独立数字断言（CSS 断点，逐张目验；九 tab 壳基线同批重拍） |
| [07-error.png](07-error.png) | 错误态：`连接失败 / 服务未启动或网络异常，请稍后重试` + 操作提示 + 「重试」按钮 | `?shot=knowledge-error` 钉态，文案来自 `httpClient.ts` 的 `SERVICE_DOWN_MESSAGE` | 无独立断言（4xx 由 audit r12 节锁定） |

## SHA256 自查（7/7 互异）

`01=1165BB0D` · `02=3827B5FC` · `03=621C3BD4` · `04=1E04AD15` · `05=E24EDE48` · `06=A507C478` · `07=12FBDCF8` —— 7/7 两两互异；
壳基线 9/9 互异（`workbench=57C17236` / `todos=21630FC4` / `schedules=4ABCE022` / `projects=683678D5` / `board=E455B70C` / `bases=DBDFC06B` / `docs=AAE9E7EA` / `chat=AD5059DE` / `knowledge=E7FFFB30`），`knowledge-tab-active` 与矩阵任一图均不同字节。
全库 `docs/ui` **120 张 PNG / 118 个互异哈希**；唯一同态组仍是 r4 已披露的两组（`r4/01 = r4/16` = `9E5C0C23`、`r4/05 = r4/13` = `8397A028`），**r12 零新增同态组**。7 张逐张 `read_image` 目验：中文无乱码、无裁切、无塌陷；06 九药丸单行完整、徽章独占下一行。

## 重拍诚实注记

首轮 `01-knowledge-empty` 与壳 `knowledge-tab-active` 均为「真实 0 篇知识文档」同态画面，SHA256 同为 `E7FFFB30`（同字节充数风险）；在 KnowledgePage 空态加 `?shot=knowledge-empty` 专属钉注「真实 0 篇知识文档 / 0 分块」后**全矩阵第二次重拍**，01 变为 `1165BB0D`，壳基线保持真实 0 文档空态 `E7FFFB30`，两者互异。废片未入库（目录内只留最终 7 张）。04/05/06 两次哈希不同仅来自 seed 文档 id 自增（1/2/3 → 4/5/6），画面布局与文案逐字相同。

## 「用户第一次用」全链路（headless CDP 真点，0 知识文档起步）

复用环境已有 headless CDP 页面（未新开可见窗口）：基线 `knowledge_docs=0 / conversations=0` → `?page=knowledge` 空态（「＋ 入库」在场，非死路）→ 真填标题「CDP r12 第一次用知识库」+ 正文 → 点「确认入库」→ UI 显「入库成功…（1 片）」+ 文档列表（#7）→ 真填检索词「手机」→ 点「检索」→ 2 条命中带来源「chunk #7」+ 命中词高亮 → 切「AI 工作台」真建会话 #28 → 真发「在知识库检索 手机 科技」→ `search_knowledge` 真执行，产物 JSON 含 `docId=7 / chunkId=7 / docTitle` 来源引用 → HTTP 回查 `docs=1 / hits=1 / messages=3(roles=user,tool,assistant) / toolNames=[search_knowledge]` → reload 后文档、命中、来源高亮全在 → DELETE 会话 #28 / 知识文档 #7 后 `docs=0 / conversations=0` → `shot.ps1 down` 后 8787/5173 全 free。
