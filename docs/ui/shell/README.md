# docs/ui/shell · 十四 tab 壳激活态基线（r4 返工 #1 B 固化；r17 起十四 tab，r18 同批重拍）

> r2 U1-1（工作台）→ r3 U1-2（待办）→ r4 U1-1（工作台+待办+日程三页全漏）——
> 「壳变更 → 继承页 tab 激活证据断档」三轮连漏后，ui-reviewer 建议固化为 shot.ps1
> 常备段，本目录即其产物：**tab 激活态最小集**，任何 r4+ 轮次跑
> `powershell -File scripts\shot.ps1 shots -Round r<N>` 时自动重拍（无需手工清单）。
> 规则：**tab/壳变更当轮必须补拍全部激活态**——该规则已写进 scripts/shot.ps1 头部注释。
>
> 演进：r6 六 tab → r8 七 → r10 八 → r12 九 → r14 十 → r15 十一 → r16 十二 → **r17 十四**（新增物资 + 单位任务）。
> **r18 tab 数量不变（仍为十四）**：登录 / 注册为独立路由（`?page=login|register`），不进 `<nav class="tabs">`；
> 但壳内容变了（r18 徽章、工作台「本机/远端」服务模式卡、schema v14、M9 里程碑、顶栏登录/退出按钮），
> 故十四张同批重拍，与 r17 十四张逐位全异（延续 r11「tab 数不变、壳内容变即重拍」纪律）。
> 488px 窄屏十四药丸仍单行不折行（见 `docs/ui/r18/07-narrow.png` 与历史 r17 窄屏证据）。

| 文件 | 形态 | 对应断言 |
|---|---|---|
| workbench-tab-active.png | 工作台激活（默认页；schema **v14** + 里程碑 M9 网络版（起步） + 服务模式卡「本机/远端」 + r18 徽章 + 顶栏登录按钮） | e2e「r18 认证与会话」节；audit「GET /api/health -> 200」「r18 GET 服务模式 -> 200」UI 形态 |
| todos-tab-active.png | 待办激活（?page=todos；四象限 + 计数卡 + 徽标 + r18 徽章） | audit「GET 列表 -> 200」+ summary 计数组端到端形态 |
| schedules-tab-active.png | 日程激活（?page=schedules；月视图 + 今天高亮 + r18 徽章） | e2e「新库 schedules 为空」；audit「GET 空区间 -> 200」 |
| projects-tab-active.png | 项目激活（?page=projects；空态 + 新建入口 + r18 徽章） | audit「GET /api/projects -> 200」空列表形态 |
| board-tab-active.png | 看板激活（?page=board；无项目空态引导 + r18 徽章） | audit「GET /api/projects -> 200」空列表形态的看板侧消费 |
| bases-tab-active.png | 表格激活（?page=bases；零表首次使用空态 + 「＋ 新建表」+ 十四药丸壳 + r18 徽章） | audit「GET /api/tables -> 200」空列表形态；e2e「createTable 自动创建默认字段」 |
| docs-tab-active.png | 文档激活（?page=docs；零文档首次使用空态 + 导入/导出/打印预览 + 十四药丸壳 + r18 徽章） | audit「r9 GET 文档列表 -> 200」空列表形态；e2e「建文档默认首块自动在场」 |
| chat-tab-active.png | AI 工作台激活（?page=chat；真实 0 会话态三栏引导 + 12 工具目录 + r18 徽章） | audit「r11 GET /api/tools -> 200」；e2e「默认注册表恰 12 个工具」 |
| knowledge-tab-active.png | 知识库激活（?page=knowledge；真实 0 篇文档态 + 入库引导 + 十四药丸 + r18 徽章） | audit「r12 GET 知识库文档列表 -> 200」空列表形态 |
| mindmap-tab-active.png | 导图激活（?page=mindmap；真实 0 张导图态 + Markdown 源/树视图双栏空态 + r18 徽章） | audit「r14 清理后导图归零」；e2e「新库导图列表为空」 |
| whiteboard-tab-active.png | 白板激活（?page=whiteboard；真实 0 张白板态 + 无限画布网格 + 工具条空态 + r18 徽章） | audit「r15 清理后白板归零」；e2e「新库白板列表为空」 |
| approval-tab-active.png | 审批激活（?page=approval；真实 0 条审批态 + 三视角切换 + 空列表引导 + r18 徽章） | audit「r16 清理后审批归零」；e2e「新库审批列表为空」 |
| assets-tab-active.png | 物资激活（?page=assets；真实 0 笔物资态 + 左栏空列表引导 + 右栏未选引导 + r18 徽章） | audit「r17 清理后物资归零」；e2e「新库物资列表为空」 |
| unit-tasks-tab-active.png | 单位任务激活（?page=unit-tasks；真实 0 条任务态 + 「＋ 新建任务」入口 + 空树引导 + r18 徽章） | audit「r17 清理后任务归零」；e2e「空任务列表装配为空树」 |

## r18 哈希自查（十四张互异，与 r17 基线逐位全异）

`workbench=2F89411D` · `todos=C39599AA` · `schedules=F1665320` · `projects=144DE148` ·
`board=4712713C` · `bases=4012D512` · `docs=65A90E38` · `chat=1749F955` · `knowledge=30A8CC29` ·
`mindmap=4B576279` · `whiteboard=CC4BB17E` · `approval=1C9435AB` · `assets=0D364A9E` ·
`unit-tasks=0F0DF5CC` —— **14/14 互异**。

> r18 同批重拍：十四张全部因徽章 r18 / 工作台 v14·M9 起步 / 新增服务模式卡 / 顶栏登录按钮而与 r17 逐位全异；
> `workbench` 另含实时 `last_health_check` 时间戳。十四张均已 `read_image` 目验（与 r18 矩阵同批），
> 十四药丸与徽章无折行、无乱码、无塌陷。

r17 基线为 `CE038E7B / 076CC989 / F46B74C7 / 5E462372 / A62A1539 / 97D550AA / FB5236B8 / B4DFF6DF / 96DDFAD0 / EBEA940D / 6BDF7848 / 8D097800 / F86A188C / D3FFF776`（十四张）；
r18 十四张全部同批重拍且逐位全异。`chat-tab-active` 与 `docs/ui/r11/` 矩阵任一图刻意不同态：
前者为真实 0 会话态，矩阵为两轮对话 / 产物 / 窄屏 / 错误态。

## 机制说明

- 拍摄入口：`scripts/shot.ps1` 的 `Invoke-ShellBaseline`（r4 返工 #1 加入；r8 由 6 扩 7，r10 扩 8，r12 扩 9，r14 扩 10，r15 扩 11，r16 扩 12，r17 扩 14；r18 数量不变仍 14）。
- 触发条件：`-Round r4` 及以后的 `shots` / `all` 动作（r1~r3 历史轮不回拍）。
- 落盘：本目录，文件名 `<tab>-tab-active.png`（与 App.tsx PageTab 一一对应；新增/改名 tab 时须同步脚本内 $tabs 清单）。
- 认证页为独立路由，不进 `$tabs`，故 r18 不新增壳图。
- 同态说明：壳基线各张与各轮页面矩阵均不同字节；全库唯一残留同态组在 r4 目录内部
  （`r4/01 = r4/16` = `9E5C0C23`、`r4/05 = r4/13` = `8397A028`），如实注记；全库 168 PNG / 166 互异，r18 零新增同态组。
- `mindmap-tab-active` 与 `docs/ui/r14/` 矩阵 02/03/04 分形：0 张导图空态 / Markdown 编辑态 / 树视图态 / 折叠态，四态互异。
