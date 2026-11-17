# r11 截图矩阵 · 多轮上下文与产物生成（M5 收官）

> 入库位置 `docs/ui/r11/`；由 `powershell -File scripts/shot.ps1 all -Round r11` 一次性 headless 产出（7 张 PNG，最终版为全矩阵第二次重拍）。
> 壳基线 **8 张**由 `Invoke-ShellBaseline` 同批自动重拍到 `docs/ui/shell/`（八 tab 不变，但徽章推进 r11 → 旧八张逐位全异）。
> 索引与根 `README.md`「界面与测试对照」+「断言规模」、实现代码同一提交。

| 图 | 形态 | 证据性质 | 对应断言 |
|---|---|---|---|
| [01-multiturn-chat.png](01-multiturn-chat.png) | **真实链路·多轮对话**：会话 A 两轮（首轮 `新建待办：r11 截图实体，然后列出文档` → 工具调用 ×3；次轮 `再建一个` → 工具调用 ×2，真建「（再建）」待办）+ 顶栏「上下文提示：最近 8 条…」+ 右侧「第 2 轮产物 · 对应本轮对话」 | seed 阶段真发两轮 `/chat`，日志 `secondResolution=repeat`；页面从 `GET /messages` / `GET /artifacts` 真读回 | audit「r11 第 2 轮回显 repeat 指代元数据」「r11 第 2 轮工具参数引用第 1 轮实体」；e2e「第 2 轮「再建一个」引用第 1 轮真实实体」 |
| [02-context-hint.png](02-context-hint.png) | 上下文提示钉态：同两轮真实数据 + 紫色注记「上下文钉态：2 轮对话 / 6 条落库消息 / repeat 指代已解析」；与 01 同数据、仅注记不同 | `?shot=chat-context` 钉态，注记文字明示口径（数据仍来自真库） | e2e「第 2 轮注入 3 条真实落库消息」；audit「r11 第 2 轮注入 3 条真实落库消息」 |
| [03-artifact-html.png](03-artifact-html.png) | **真实链路·HTML 产物预览**：右侧 iframe 渲染完整 `html-report`（H1「HTML 报告」+ 表头/真数据行 + 汇总），非空占位 | seed 真发 `artifactType=html-report` 的 `/chat`，页面走 `GET /api/artifacts/:id/content` 按 type 取内容 | audit「r11 HTML 内容是完整可打开文档（非占位）」「r11 HTML 内容含真实数据表」；e2e「HTML 报告是完整可打开文档」 |
| [04-artifact-table.png](04-artifact-table.png) | **真实链路·Markdown 表格产物**：右侧预览 GFM 表格（编号/工具/状态/摘要/参数 + 分隔行 + 汇总），与 03 不同产物 | seed 真发 `artifactType=markdown-table` 的 `/chat`，独立真实产物 | audit「r11 Markdown 内容含真实表格分隔行」；e2e「Markdown 表格含表头与分隔行」「Markdown 表格转义单元格内竖线」 |
| [05-tools-page2.png](05-tools-page2.png) | 工具链第 2 页：侧栏分页 `第 2 页` 激活，列出 `list_tables / search_knowledge / summarize_document / export_document_md / list_schedules / create_schedule`（后 4 个为 r11 新增）；中间对话流工具气泡展开 arguments | `?shot=chat-tools2&toolsPage=2` 钉态，清单来自 `GET /api/tools` 真值（12 个，6/页） | audit「r11 工具目录扩到 12 个」「r11 工具目录含 create_schedule」；e2e「默认注册表恰 12 个工具」 |
| [06-narrow.png](06-narrow.png) | 窄屏 488×900（?narrow=1）：**r10 U2-2 修复证据**——八药丸横排一行不折行、不裁切，徽章独占下一行；三栏纵排、上下文提示与工具列表完整 | 确定性钉态 + 真实两轮会话数据 | 无独立数字断言（CSS 断点，逐张目验；U2 修复由本图与前轮图对照） |
| [07-error.png](07-error.png) | 错误态：`连接失败 / 服务未启动或网络异常，请稍后重试` + 操作提示 + 「重试」按钮 | `?shot=chat-error` 钉态，文案来自 `httpClient.ts` 的 `SERVICE_DOWN_MESSAGE` | 无独立断言（语义化错误映射；4xx 由 audit r11 节锁定） |

## SHA256 自查（7/7 互异）

`01=177CD605` · `02=8509F052` · `03=21B14ADF` · `04=27F69024` · `05=FD622E7C` · `06=74798C13` · `07=5A7FB36B` —— 7/7 两两互异；壳基线 8/8 互异（见 `docs/ui/shell/README.md`），`chat-tab-active=466A8EF0` 与矩阵任一图均不同字节。

全库 `docs/ui` **111 张 PNG / 109 个互异哈希**；唯一同态组仍是 r4 已披露的两组（`r4/01 = r4/16` = `9E5C0C23`、`r4/05 = r4/13` = `8397A028`），**r11 零新增同态组**。7 张逐张 `read_image` 目验：中文无乱码、无裁切、无塌陷。

## 全矩阵重拍（诚实注记）

首轮 01 把「再建一个」的第二轮 chat 放在 01↔02 的 between-capture 段，导致 01 只显示第 1 轮却以「多轮对话」命名；`read_image` 目验发现后改为 seed 阶段真发两轮，并**全矩阵第二次重拍**。第二轮同时发现窄容器 488px 下第八药丸被裁切，补 `.force-narrow` topbar 纵排 + 药丸微缩后又全矩阵第三次重拍；上面哈希均为最终版，废片未入库。07 错误态两次字节相同（`5A7FB36B`），如实注记，不计「变化」。

## 「用户第一次用」全链路（headless CDP 真点，0 会话起步）

复用环境已有 headless CDP 页面（未新开可见窗口）：基线 `conversations=0 / todos=1（r3 既有「22」）` → `?page=chat` 显 12 工具 + 空态 → 真填标题建会话得 `convId=19` → 真发「新建待办：CDP r11 真建实体，然后列出文档」得 3 次工具调用（真建待办 #60）+ 产物 #22 → 真发「再建一个」→ UI 显「上下文最近 3 条 · 引用上一轮「CDP r11 真建实体」(repeat)」+ 真建待办 #61 + 产物 #23「第 2 轮产物」 → HTTP 回查 `messages=6, roles=user,tool,assistant,user,tool,assistant`、`toolCalls=3/2`、names 逐位吻合、artifacts=22/23、待办 #60/#61 真在库 → reload 后两轮消息、5 条工具回执、产物 JSON 全在 → 切「表格」预览 tab 可切到 Markdown 表格视图 → DELETE 探针会话 19 / 待办 60、61 后回到 `conversations=0 / todos=1`（未动 r3 既有数据）→ `shot.ps1 down` 后 8787/5173 全 free。
