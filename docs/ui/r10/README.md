# r10 截图矩阵 · AI 工作台对话与工具调用（M5 起步）

> 入库位置 `docs/ui/r10/`；由 `powershell -File scripts/shot.ps1 all -Round r10` 一次性 headless 产出（7 张 PNG）。
> 壳基线 **8 张**由 `Invoke-ShellBaseline` 同批自动重拍到 `docs/ui/shell/`（r10 新增「AI 工作台」= 第八 tab，新增 `chat-tab-active.png`，旧七张一并重拍，与 r9 逐位全异）。
> 索引与根 `README.md`「界面与测试对照」+「断言规模」、实现代码同一提交。

| 图 | 形态 | 证据性质 | 对应断言 |
|---|---|---|---|
| [01-chat-empty.png](01-chat-empty.png) | 工作台空态：八 tab 壳「AI 工作台」激活 + 三栏（会话 / 对话流 / 产物预览）均为首次使用引导；`空态钉态：0 会话 / 0 消息 / 0 产物` 明示口径；侧栏「可用工具 8 个」取自 shared `TOOL_NAMES` | `?shot=chat-empty` 确定性钉态（不伪造工具数） | audit「r10 GET /api/tools -> 200」「工具目录恰 8 个工具」；e2e「首批工具注册表恰 8 个工具」 |
| [02-conversation-list.png](02-conversation-list.png) | **真实链路·会话列表**：2 个真会话（A「r10 对话演示」/ B「r10 空会话」），B 选中 → 对话流空态；#1/#2 是 api 真自增 id | 两会话均由 headless `POST /api/conversations` 真建，页面 `GET /api/conversations` 真读回 | audit「r10 POST 合法会话 -> 201」「r10 GET 会话列表复核 -> 200」 |
| [03-chat-stream.png](03-chat-stream.png) | **真实链路·对话流**：用户蓝气泡 + `工具调用 × 3` 虚线气泡（create_todo / list_todos / list_documents，均「成功」）+ AI 灰气泡汇总；右侧产物 #1 | seed 阶段真发一次 `/chat`，`create_todo` 真建待办 #50；页面从 `GET /messages` / `GET /artifacts` 读回 | audit「r10 一次对话真实触发 3 个工具调用」「r10 create_todo 经 HTTP 真创建待办（查库验证）」；e2e「编排产出 2 条真实工具调用」 |
| [04-tool-call-bubbles.png](04-tool-call-bubbles.png) | **工具调用气泡（展开回执）**：`?shot=chat-tools` 把 `tool_calls_json` 的 `arguments` JSON 就地展开；右侧产物 #2（第二轮 chat） | 03↔04 之间真发第二次 `/chat`（`列出项目、看板和表格`，日志 `tools=3 intent=list_projects+list_cards+list_tables`） | audit「r10 tool 消息逐条落 3 个 tool_call（查库验证）」「r10 落库工具调用 arguments 逐字段可读」 |
| [05-artifact-preview.png](05-artifact-preview.png) | **产物预览面板（展开）**：`?shot=chat-artifact` 拉高右侧面板，逐字展示 `chat-result` 的 JSON（intent / message / tools / summary）；对话流累积两轮 | 04↔05 之间真发第三次 `/chat`（`盘点待办和文档`，`tools=2`），产物累积到 #3 | audit「r10 产物内容含全部 3 条工具回执」「r10 两轮对话产物累积为 2 篇」 |
| [06-narrow.png](06-narrow.png) | 窄屏 488×900（?narrow=1）：八药丸不折行到同排（「AI 工作台」换行不溢出）、徽章独占一行、三栏纵排、对话流与产物 panel 全在场 | 确定性钉态 + 真实会话 #1 数据 | 无独立数字断言（CSS 断点，逐张目验；数据落库由 audit 锁定） |
| [07-error.png](07-error.png) | 错误态：`连接失败 / 服务未启动或网络异常，请稍后重试` + 操作提示 + 「重试」按钮 | `?shot=chat-error` 钉态，文案来自 `httpClient.ts` 的 `SERVICE_DOWN_MESSAGE` | 无独立断言（语义化错误映射；4xx 由 audit r10 节锁定） |

## SHA256 自查（7/7 互异）

`01=626892DC` · `02=818375BA` · `03=A7C7F3C6` · `04=0779CAD4` · `05=FFA78E64` · `06=EEE44989` · `07=1F2B0910` —— 7/7 两两互异；壳基线 8/8 互异且 `chat-tab-active=C858F2AF` 与矩阵 01 不同（01 带空态钉态注记，非同字节充数）。

全库 `docs/ui` **104 张 PNG / 102 个互异哈希**；唯一同态组仍是 r4 已披露的两组（`r4/01 = r4/16` = `9E5C0C23`、`r4/05 = r4/13` = `8397A028`），**r10 零新增同态组**。

## 首轮毛刺与重拍（诚实注记）

首轮 01 的 `?shot=chat-empty` 钉态把工具目录一并置空，画面显示「可用工具 0 个」，与真实注册表 8 个工具矛盾；`read_image` 目验发现后改为钉态也消费 shared `TOOL_NAMES`（8 个真实契约名）。第二轮复拍又发现 01 与壳基线 `chat-tab-active` 字节级相同（都是真实 0 会话态），于是在矩阵空态加 `空态钉态：0 会话 / 0 消息 / 0 产物` 明示注记并**全矩阵第三次重拍**；上面哈希均为最终版，废片未入库。

## 「用户第一次用」全链路（headless CDP 真点，0 会话起步）

复用环境已有 headless CDP 页面（未新开可见窗口）：`?page=chat` → 八 tab、AI 工作台激活、0 会话 → 真填「CDP r10 第一次用：对话与工具调用」→ 点「＋ 新建会话」得 `convId=7`（非死路）→ 真填消息「帮我新建一个待办：CDP 真点验证，然后列出文档」→ 点「发送」→ 用户蓝气泡 + `工具调用 × 3`（create_todo 成功建待办 #53 / list_todos 2 条 / list_documents 0 篇）+ AI 灰气泡汇总 + 产物 #10 右侧预览 → HTTP 回查 `messages roles=user,tool,assistant`、`toolCalls=3` 且工具名逐位吻合、`artifacts=1 chat-result`、库内待办 #53 真存在 → reload 页面后消息 / 三条工具调用 / 产物 JSON 全部还在 → DELETE 探针会话与待办，`conversations=0`，真实库只剩 r3 既有待办「22」→ `shot.ps1 down` 后 8787/5173 全 free。
