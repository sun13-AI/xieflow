# docs/ui/r13 —— RAG 对话与引用溯源（M6 收官，7 张）

> 与实现、根 README 索引、本报告同一提交。全部由 `scripts/shot.ps1 all -Round r13` 一次性 headless（`--headless=new -WindowStyle Hidden`）产出；seeded 数据拍后经 HTTP DELETE 清理归零。

| 文件 | 形态 | 断言对照 / 取证方式 |
|---|---|---|
| 01-rag-chat.png | **真实链路·RAG 对话流**：真发「根据知识库，苹果 手机」→ `search_knowledge` 命中 2 片 → AI 气泡含 `[1]` 引用标记 + 两张来源引用卡 + 右侧产物引用清单 | audit「r13 RAG 回答带非空引用清单」「r13 AI 汇总注入真实来源标题」；e2e「ChatExecution 携带非空引用清单」；seed 真 chat |
| 02-citation-card.png | **来源引用卡钉态**：同真实 2 命中 + 紫色 spotlight + 钉注「来源、chunk 编号、片段与相关度均来自真实检索回执」 | e2e「引用 snippet 逐字取自真实 chunk」「citation.score 与 TF-IDF 命中分值相等」；`?shot=rag-citation-card` |
| 03-citation-jump.png | **引用跳转·溯源回看**：`?page=knowledge&docId=&chunkId=`（doc/chunk 取自 chat 响应 citations）→ 紫色「溯源回看」面板 + chunk 正文真读回 | audit「r13 回答引用可经 HTTP 溯源 -> 200」「r13 引用 snippet 逐字等于存储 chunk 前缀」 |
| 04-artifact-citations.png | **产物引用清单**：右侧产物面板完整 2 条引用（docTitle / chunk #id / 相关度 / 片段，可点跳转） | audit「r13 产物原文含引用清单」「r13 产物引用条数与回答一致」；`?shot=rag-artifact-citations` |
| 05-no-hit.png | **无命中态**：真发不存在的词 → 工具回执「命中 0 条」→ AI 如实说「知识库没有相关内容」+ 红条「未引用任何来源（不编造）」+ 产物 `citations: []` | audit「r13 无命中如实说知识库没有相关内容」「r13 无命中不出现伪造引用标记」 |
| 06-narrow.png | 窄屏 488×1400（`?narrow=1`）：九药丸单行不折行、徽章独占下一行；三栏纵排 + AI 回答 + 两张引用卡完整可见 | 无独立数字断言（CSS 断点，确定性钉态，逐张目验） |
| 07-error.png | 错误态（语义化文案 + 操作提示 + 「重试」按钮，钉态） | 无独立断言（4xx 由 audit r13 节锁定） |

## SHA256 自查（全 8 位前缀）

`01=35A44E58` · `02=DBFB2AC6` · `03=C7581A6C` · `04=7BA2B10D` · `05=0D0815B7` · `06=4CA7E503` · `07=27DD2CB6` —— **7/7 两两互异**。

九 tab 壳基线（`docs/ui/shell/`，同批重拍）：`workbench=295AC379` · `todos=50B3E515` · `schedules=1DF67E49` · `projects=5DBD1C86` · `board=DF301A8B` · `bases=B09BC6F0` · `docs=EBDF8D04` · `chat=0510F481` · `knowledge=C7A71E5C` —— **9/9 互异**，与 r12 九张逐位全异（徽章 r13 + 对话流/产物变更）；矩阵任一图与壳任一图不同字节。全库 `docs/ui` **127 PNG / 125 互异**，同态组仅 r4 已披露 2 组，r13 零新增。

## 目验与重拍注记

7 张逐张 `read_image` 目验：中文无乱码、无裁切、无塌陷；01/02 引用卡 doc/chunk/片段/相关度均可辨，02 的紫色 spotlight 与钉注在位；03 溯源面板正文与引用卡 snippet 逐字一致；04 引用清单两条完整（首轮 900px 高度清单被截，已把视口升到 1100px 并全矩阵重拍，废片未入库）；05 无命中文案与空引用提示清楚；06 488px 九药丸单行、两张引用卡完整；07 错误态同构。

seed：2 篇真实知识文档 + 2 个真实会话（命中 / 无命中），引用卡跳转参数直接取 chat 响应的 `citations[0]`；清理：DELETE 两会话 + 两知识文档，docs=0 / conversations=0，服务收净（8787/5173 全 free）。
