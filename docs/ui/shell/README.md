# docs/ui/shell · 十一 tab 壳激活态基线（返工 #1 B 固化，r10 起八 tab，r12 起九 tab，r14 起十 tab，r15 起十一 tab）

> r2 U1-1（工作台）→ r3 U1-2（待办）→ r4 U1-1（工作台+待办+日程三页全漏）——
> 「壳变更 → 继承页 tab 激活证据断档」三轮连漏后，ui-reviewer 建议固化为 shot.ps1
> 常备段，本目录即其产物：**tab 激活态最小集**，任何 r4+ 轮次跑
> `powershell -File scripts\shot.ps1 shots -Round r<N>` 时自动重拍（无需手工清单）。
> 规则：**tab/壳变更当轮必须补拍全部激活态**——该规则已写进 scripts/shot.ps1 头部
> 注释（SHELL BASELINE 段），由脚本自动执行，人为遗漏面归零。
> **r6 起为六 tab**（新增「表格」= 多维表格页）。
> **r8 起为七 tab**（新增「文档」= 文档块编辑器页）。
> **r10 起为八 tab**（新增「AI 工作台」= 对话 / 工具调用 / 产物预览页）：新增 tab 当轮
> 基线自动扩为八张（`chat-tab-active.png`），旧七张一并重拍（壳换新 → 旧页激活态也
> 必须带本轮壳），与 r9 基线逐位全异。
> r10 壳徽章为「r10 · AI 工作台对话与工具调用（M5 起步）」，工作台 schema 卡推进
> 到 **v8**、里程碑改「M5 AI 工作台（进行中）」。
> **r11 八 tab 不变但徽章改「r11 · 多轮上下文与产物生成（M5 收官）」**，机制自动重拍旧八张，
> 与 r10 八张逐位全异（tab 数不变，壳内容变即重拍，避免 U1-1 复发）。
> **r12 起为九 tab**（新增「知识库」= 入库 / TF-IDF 检索 / 来源引用页）：新增 tab 当轮基线自动扩为九张
> （`knowledge-tab-active.png`），旧八张一并同批重拍（壳徽章推进 r12、工作台 schema 卡到 v9、里程碑 M6），
> 与 r11 八张逐位全异；488px 窄屏九药丸仍单行不折行（见 `docs/ui/r12/06-narrow.png`）。
> **r13 九 tab 不变但对话流/产物渲染改变**：徽章改「r13 · RAG 对话与引用溯源（M6 收官）」，
> `shots -Round r13` 机制自动重拍九张，与 r12 基线逐位全异（tab 数不变、壳内容变即重拍，避免 U1-1 复发）。
> **r14 起为十 tab**（新增「导图」= Markdown 源 / 树视图双页）：新增 tab 当轮基线自动扩为十张
> （`mindmap-tab-active.png`），旧九张一并同批重拍（徽章 r14、工作台 schema 卡 v10、里程碑 M7），
> 与 r13 九张逐位全异；488px 窄屏十药丸仍单行不折行（见 `docs/ui/r14/05-narrow.png`）。
> **r15 起为十一 tab**（新增「白板」= 无限画布 / 便签 / AI 建板 / 导出页）：新增 tab 当轮基线自动扩为十一张
> （`whiteboard-tab-active.png`），旧十张一并同批重拍（徽章 r15、工作台 schema 卡 v11、里程碑 M7 收官），
> 与 r14 十张逐位全异；488px 窄屏十一药丸单行不折行（见 `docs/ui/r15/06-narrow.png`）。

| 文件 | 形态 | 对应断言 |
|---|---|---|
| workbench-tab-active.png | 工作台激活（默认页；schema 版本 **v11** + 里程碑 M7 导图与白板（收官） + r15 徽章） | e2e「settings 读写」节；audit「GET /api/health -> 200」UI 形态 |
| todos-tab-active.png | 待办激活（?page=todos；四象限 + 计数卡 + 徽标） | audit「GET 列表 -> 200」+ summary 计数组端到端形态 |
| schedules-tab-active.png | 日程激活（?page=schedules；月视图 + 今天高亮） | e2e「新库 schedules 为空」；audit「GET 空区间 -> 200」 |
| projects-tab-active.png | 项目激活（?page=projects；空态 + 新建入口） | audit「GET /api/projects -> 200」空列表形态 |
| board-tab-active.png | 看板激活（?page=board；无项目空态引导） | audit「GET /api/projects -> 200」空列表形态的看板侧消费 |
| bases-tab-active.png | 表格激活（?page=bases；一张表都没有的首次使用空态 + 「＋ 新建表」入口；十一药丸壳 + r15 徽章） | audit「GET /api/tables -> 200」空列表形态；e2e「createTable 自动创建默认字段（7 种类型齐备）」 |
| docs-tab-active.png | 文档激活（?page=docs；一篇文档都没有的首次使用空态 + 「＋ 新建文档」/ 导入 / 导出 / 打印预览；十一药丸壳 + r15 徽章；修订面板行内增删改高亮由 r11 修复） | audit「r9 GET 文档列表 -> 200」空列表形态；e2e「建文档默认首块自动在场（不是零块死路）」 |
| chat-tab-active.png | **AI 工作台激活**（?page=chat；真实 0 会话态：三栏首次使用引导 + 「＋ 新建会话」+ 侧栏「可用工具 12 个」+ r15 徽章） | audit「r11 GET /api/tools -> 200」「工具目录扩到 12 个」；e2e「默认注册表恰 12 个工具」 |
| knowledge-tab-active.png | **知识库激活**（?page=knowledge；真实 0 篇知识文档态：十一药丸 + 「＋ 入库」引导 + 首次使用说明；r15 徽章；与 r13 矩阵 03 刻意分形——后者为溯源回看态） | audit「r12 GET 知识库文档列表 -> 200」空列表形态；e2e「空文本分块 0 片」 |
| mindmap-tab-active.png | **导图激活**（?page=mindmap；真实 0 张导图态：十一药丸 + 「＋ 新建」入口 + Markdown 源/树视图双栏空态 + r15 徽章） | audit「r14 清理后导图归零」「r14 GET 导图列表 -> 200」空列表形态；e2e「新库导图列表为空」 |
| whiteboard-tab-active.png | **白板激活**（?page=whiteboard；真实 0 张白板态：十一药丸 + 「＋ 新建」入口 + 无限画布网格 + 便签/AI 建板/导出工具条空态 + r15 徽章） | audit「r15 清理后白板归零」「r15 GET 白板列表 -> 200」空列表形态；e2e「新库白板列表为空」 |

## r15 哈希自查（十一张互异，与 r14 基线逐位全异）

`workbench=CC7B840C` · `todos=8156999C` · `schedules=7C207393` · `projects=C43FAE9C` ·
`board=314F520E` · `bases=3C782558` · `docs=52458F27` · `chat=FAFD3FF5` · `knowledge=1637C3F3` ·
`mindmap=344726B6` · `whiteboard=D764DC2E` —— **11/11 互异**。

r14 基线为 `181780C7 / 8D8E3E01 / 6ACFD18D / 61E7B03B / 1F291832 / 85BED3EA / 87C09668 / 0BCD5179 / 36A6C61E / 15B9BB97`（十张）；
r15 十一张全部同批重拍且逐位全异（徽章 r15 + 工作台 v11/M7 收官 + 新增第十一 tab），新第十一张 `whiteboard-tab-active` 与矩阵任一图不同字节。
`chat-tab-active` 与 `docs/ui/r11/` 矩阵任一图**刻意不同态**：前者为真实 0 会话态，矩阵为两轮对话 / 产物 / 窄屏 / 错误态。

## 机制说明

- 拍摄入口：`scripts/shot.ps1` 的 `Invoke-ShellBaseline`（r4 返工 #1 加入；r8 `$tabs` 由 6 扩为 7，r10 由 7 扩为 8，r12 由 8 扩为 9，r14 由 9 扩为 10，r15 由 10 扩为 11）。
- 触发条件：`-Round r4` 及以后的 `shots` / `all` 动作（r1~r3 历史轮不回拍）。
- 落盘：本目录，文件名 `<tab>-tab-active.png`（与 App.tsx PageTab 一一对应；
  新增/改名 tab 时须同步脚本内 $tabs 清单——头部注释已写明）。
- 同态说明（r6 已校正 r5 的失效表述，r7~r9 沿用）：**壳基线各张与各轮页面矩阵均不同字节**——r5 起基线随壳重拍，
  `projects-tab-active` 早已不再与 `docs/ui/r4/01、16` 同字节；全库唯一残留的同态组在 r4 目录内部
  （`r4/01 = r4/16` = `9E5C0C23`、`r4/05 = r4/13` = `8397A028`），如实注记，不重复计差异。
- `mindmap-tab-active` 与 `docs/ui/r14/` 矩阵 02/03/04 分形：0 张导图空态 / Markdown 编辑态 / 树视图态 / 折叠态，四态互异。
