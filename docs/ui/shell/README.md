# docs/ui/shell · 二十 tab 壳激活态基线（r4 返工 #1 B 固化；r17 起十四 tab，r23 扩十五，r26 扩十六，r27 扩十七，r28 扩十八；r36 扩十九；r41 扩二十；r39/r40 文案/口径清理同批重拍）

> r2 U1-1（工作台）→ r3 U1-2（待办）→ r4 U1-1（工作台+待办+日程三页全漏）——
> 「壳变更 → 继承页 tab 激活证据断档」三轮连漏后，ui-reviewer 建议固化为 shot.ps1
> 常备段，本目录即其产物：**tab 激活态最小集**，任何 r4+ 轮次跑
> `powershell -File scripts\shot.ps1 shots -Round r<N>` 时自动重拍（无需手工清单）。
> 规则：**tab/壳变更当轮必须补拍全部激活态**——该规则已写进 scripts/shot.ps1 头部注释。
>
> 演进：r6 六 tab → r8 七 → r10 八 → r12 九 → r14 十 → r15 十一 → r16 十二 → **r17 十四**（新增物资 + 单位任务）。
> **r18 tab 数量不变（仍为十四）**：登录 / 注册为独立路由（`?page=login|register`），不进 `<nav class="tabs">`；
> 但壳内容变了（r18 徽章、工作台「本机/远端」服务模式卡、schema v14、M9 里程碑、顶栏登录/退出按钮），
> 故十四张同批重拍，与 r17 十四张逐位全异。
> **r19 tab 数量仍不变（十四）**：同步卡在工作台设置区内，不新增 tab；但徽章推进 r19、
> 工作台新增「多端同步」卡、schema v15、M9 收官 → 十四张再次同批重拍，与 r18 逐位全异。
> **r20 tab 数量仍不变（十四）**：顶栏在线圆点/离线队列徽标/立即同步 + PWA 安装提示 + ≤600px 底部导航
> 均为布局变化，不新增 tab → 十四张同批重拍，与 r19 逐位全异。
> **r21 tab 数量仍不变（十四）**：私有化部署/portable 增强均未改渲染层（徽章沿用 r20），十四张沿用 r20 字节，
> 被 ui 报告记 U2-1「证据口径偏差」——r22 已闭合。
> **r22 tab 数量仍不变（十四）**：底栏右侧「更多 ›」入口 + 渐隐遮罩 + ☰ 展开态均为布局/开合变化，
> 不新增 tab；徽章推进 r22 + 更多入口 DOM seam → 十四张同批重拍，与 r21（=r20 字节）逐位全异。
> **r23 新增第十五 tab「组织」**：`?page=org` 部门树 + 人员目录独立页，补 `org-tab-active.png`；
> 徽章推进 r23「组织架构与通讯录（M10 后）」+ schema v16 → **十五张同批重拍**，与 r22 十四张逐位全异。
> **r24 渲染层改动（审批/物资加入通讯录选人入口）→ 十五张同批重拍**：徽章沿用 r23，审批壳可见申请人选人入口；
> 物资壳与 r23 **同字节 90166EF8**（折叠空态无选人入口，入口只在「新建物资」表单内，见 r24 矩阵 04），不伪造差异。
> **r25 同批重拍（渲染层改动：审批动作姓名+部门徽标 / 选人部门筛选 / 回填语义提示）→ 十五张同批重拍**：徽章沿用 r23，
> schema 推进 v18；与 r23 同名字节 8 张相同、7 张不同，与 r24 同名 11 张相同、4 张不同（board/docs/projects/todos
> 因钉态数据时序差异改变），逐名哈希在下方历史行如实对照，不宣称「逐位全异」。
> **r26 新增第十六 tab「通知」**：`?page=notifications` 聚合站内消息 + 顶栏未读徽标，补 `notifications-tab-active.png`；
> 徽章推进 r26「通知中心（站内消息聚合）」+ schema v19 → **十六张同批重拍**，与 r25 十五张同名文件逐位全异。
> **r27 新增第十七 tab「报表」**：`?page=reports` 跨模块 KPI 看板（六卡 + 环比 + 迷你条 + 明细下钻），补 `reports-tab-active.png`；
> 徽章推进 r27「报表中心（跨模块数据看板）」→ **十七张同批重拍**，与 r26 十六张逐位全异。
> **r28 新增第十八 tab「会议」**：`?page=meetings` 会议室预约 / 冲突检测（左会议室 + 中时段网格 + 右预约表单），补 `meetings-tab-active.png`；
> 徽章推进 r28「会议管理（预约/冲突检测）」+ schema v20 → **十八张同批重拍**，与 r27 十七张同名文件全异。
> **r30 tab 数量仍不变（十八）**：表格页内加公式列 / 表达式面板，不新增 tab；
> 但徽章推进 r30「多维表格公式字段」+ schema v22 + 表格页渲染变化 → **十八张同批重拍**，与 r29 十八张同名文件全异。
> **r31 tab 数量仍不变（十八）**：轻量清理只改表格页空态文案（「8 种字段类型齐备（含公式）」）
> 与公式值展示格式化，不新增 tab；徽章推进 r31「轻量清理（字段类型文案 + 浮点展示）」→
> **十八张同批重拍**，bases 张同步八类文案，与 r30 十八张同名文件全异。
> **r32 tab 数量仍不变（十八）**：文档页新增导出菜单（打印 / Word / HTML 打印版）、隐藏 iframe 打印 spy、
> HTML / Word 落盘佐证面板，顶栏徽章推进 r32「文档打印导出增强（HTML 打印 + Word 兼容）」→
> **十八张同批重拍**，docs 张同步新导出入口，与 r31 十八张同名文件全异。
> **r33 tab 数量仍不变（十八）**：顶栏加全局搜索框 / Ctrl+K 下拉检索面板，日程/会议页加深链定位条，
> 徽章推进 r33「全局搜索（跨八源只读）」→ **十八张同批重拍**，与 r32 十八张同名文件全异。
> **r34 tab 数量仍不变（十八）**：待办页加前置任务 / 阻塞链 / 循环错误入口 + 徽章推进
> r34「任务依赖（前置阻塞与环检测）」→ **十八张同批重拍**，与 r33 十八张同名文件全异。
> **r35 tab 数量仍不变（十八）**：日程页加 ICS 导出 / 订阅设置卡 / 导入预览面板 + 徽章推进
> r35「日历 ICS 导出与订阅（标准 iCalendar）」→ **十八张同批重拍**，与 r34 十八张同名文件全异；
> 返工 #1 只重拍 r35 矩阵 02/04/05/07 与改 07 用户文案，shell 渲染形态不变，十八壳字节沿用 r35 首轮。
> **r36 新增第十九 tab「报告」**：`?page=work-reports` 日报/周报自动生成（时间窗汇总 + Markdown 预览 + 存为文档 + 打印），补 `work-reports-tab-active.png`；
> 徽章推进 r36「日报与周报自动生成（模板化汇总）」→ **十九张同批重拍**，与 r35 十八张同名文件全异。
> 窄屏 390/488px 形态见 `docs/ui/r22/`、`docs/ui/r23/06-narrow.png`、`docs/ui/r24/06-narrow.png`、`docs/ui/r25/06-narrow.png`、`docs/ui/r26/06-narrow.png`、`docs/ui/r27/06-narrow.png`、`docs/ui/r28/06-narrow.png`、`docs/ui/r29/07-narrow.png`、`docs/ui/r30/06-narrow.png`、`docs/ui/r32/05-narrow.png`、`docs/ui/r33/06-search-narrow.png`、`docs/ui/r34/06-dep-narrow.png`、`docs/ui/r35/06-ics-narrow.png` 与 `docs/ui/r36/06-wr-narrow.png`。
> **r40 tab 数量仍不变（十九）**：轻量轮只改用户可见文案（登录页页脚 tab 数口径 + 单位数 rN 种子/预览清理），不新增 tab，
> 徽章沿用 r39 纯用户文案；渲染层有改动 → **十九张同批重拍**。与 r39 同名字节 changed=5 / same=14
> （schedules / projects / chat / knowledge / meetings 变化，其余沿用），不宣称逐位全异，按 r25 先例如实披露。
> **r41 新增第二十 tab「表单」**：`?page=forms` 无代码表单（创建 / 填写 / 汇总），补 `forms-tab-active.png`；
> 徽章沿用 r39 纯用户文案 + schema v26 → **二十张同批重拍**。与 r40 同名字节 changed=16 / same=3
> （approval / assets / bases / chat / docs / knowledge / meetings / mindmap / notifications / org / projects /
> reports / todos / unit-tasks / whiteboard / work-reports 变化；board / schedules / workbench 沿用），
> 如实披露，不称逐位全异。
> **r42 无渲染层改动（README 版本号 watchdog，仅脚本 + 文档）**：本轮沿用 r41 壳图，不重拍；
> 按 r21 U2-1 先例在此透明声明（当前界面基线仍是 r41 的二十张，详见 [r42 索引](../r42/README.md)）。
> **r43 tab 数量仍不变（二十）**：会议室卡片加设备徽标 +预约表单加「帮我推荐」面板，不新增 tab；
> 徽章沿用 r39 纯用户文案 + schema v27 → **二十张同批重拍**。与 r41 同名字节 changed=6 / same=14
> （todos / schedules / board / knowledge / meetings / forms 变化，其余沿用），
> 按 r25 先例如实披露，不称逐位全异。当前 R43 哈希块见下方（r44 重拍后为历史对照）。
> **r44 图证与文档口径修正（MeetingsPage 校验错误帧文案 + 05 时段 seam 同批重拍）**：tab 数量仍不变（二十）；
> 徽章沿用 r39 纯用户文案 + schema 仍 v27 → **二十张同批重拍**。与 r43 同名字节 changed=6 / same=14
> （forms / meetings / mindmap / todos / unit-tasks / whiteboard 变化，其余沿用），按 r25 先例如实披露，
> **r45 文档块拖拽排序（DocsPage 拖拽手柄 / 插入线 / 真 HTTP move）**：tab 数量仍不变（二十）；
> 徽章沿用 r39 纯用户文案 + schema 仍 v27 → **二十张同批重拍**。与 r44 同名字节 changed=9 / same=11
> （approval / board / docs / forms / mindmap / org / todos / unit-tasks / whiteboard 变化，其余沿用），
> 按 r25 先例如实披露，不称逐位全异；当前块见下方 R45 哈希块。
> **r46 索引口径修正（轻量轮，无渲染层改动）**：本轮只改索引/文档口径，不重拍壳图，**沿用 r45 二十 tab 壳图**
> （当前界面基线仍是 r45 的二十张，详见 [r46 索引](../r46/README.md)）；按 r21 U2-1 先例在此透明声明。

| 文件 | 形态 | 对应断言 |
|---|---|---|
| workbench-tab-active.png | 工作台激活（默认页；schema **v18** + 里程碑 M10 多端与单机版 + 服务模式卡「本机/远端」 + 多端同步卡 + 纯用户文案徽章 + 顶栏在线状态区 + 登录按钮） | e2e「r23 schema v16 / 外壳 seam」；audit「r23 health / mode / todos 路由契约」 |
| todos-tab-active.png | 待办激活（?page=todos；四象限 + 计数卡 + 徽标 + 纯用户文案徽章） | audit「GET 列表 -> 200」+ summary 计数组端到端形态 |
| schedules-tab-active.png | 日程激活（?page=schedules；月视图 + 今天高亮 + 导出 .ics / 订阅设置 / 导入 .ics 三入口 + 纯用户文案徽章） | e2e「新库 schedules 为空 / r35 导出菜单 seam」；audit「GET 空区间 -> 200」 |
| projects-tab-active.png | 项目激活（?page=projects；空态 + 新建入口 + 纯用户文案徽章） | audit「GET /api/projects -> 200」空列表形态 |
| board-tab-active.png | 看板激活（?page=board；无项目空态引导 + 纯用户文案徽章） | audit「GET /api/projects -> 200」空列表形态的看板侧消费 |
| bases-tab-active.png | 表格激活（?page=bases；零表首次使用空态 + 空态文案「8 种字段类型齐备（含公式）」+「＋ 新建表」+ 十九药丸壳 + 纯用户文案徽章） | audit「r31 GET /api/tables -> 200」空列表形态；e2e「r31 空态文案八类 / 旧七类零残留」 |
| docs-tab-active.png | 文档激活（?page=docs；零文档首次使用空态 + 工具栏「回收站 / 导入 Markdown / 导出 .md / 导出 ▾ / ＋ 新建文档 / 打印预览」+ 十九药丸壳 + 纯用户文案徽章） | audit「r29 GET 文档列表 / 回收站 -> 200」空列表形态；e2e「建文档默认首块自动在场 + 零版本」「r32 导出菜单 seam」 |
| chat-tab-active.png | AI 工作台激活（?page=chat；真实 0 会话态三栏引导 + 12 工具目录 + 纯用户文案徽章） | audit「r11 GET /api/tools -> 200」；e2e「默认注册表恰 12 个工具」 |
| knowledge-tab-active.png | 知识库激活（?page=knowledge；真实 0 篇文档态 + 入库引导 + 十九药丸壳 + 纯用户文案徽章） | audit「r12 GET 知识库文档列表 -> 200」空列表形态 |
| mindmap-tab-active.png | 导图激活（?page=mindmap；真实 0 张导图态 + Markdown 源/树视图双栏空态 + 纯用户文案徽章） | audit「r14 清理后导图归零」；e2e「新库导图列表为空」 |
| whiteboard-tab-active.png | 白板激活（?page=whiteboard；真实 0 张白板态 + 无限画布网格 + 工具条空态 + 纯用户文案徽章） | audit「r15 清理后白板归零」；e2e「新库白板列表为空」 |
| approval-tab-active.png | 审批激活（?page=approval；真实 0 条审批态 + 三视角切换 + 空列表引导 + 选人入口 + 纯用户文案徽章） | audit「r16 清理后审批归零」；e2e「新库审批列表为空」 |
| assets-tab-active.png | 物资激活（?page=assets；真实 0 笔物资态 + 左栏空列表引导 + 右栏未选引导 + 纯用户文案徽章；折叠态无选人入口） | audit「r17 清理后物资归零」；e2e「新库物资列表为空」 |
| unit-tasks-tab-active.png | 单位任务激活（?page=unit-tasks；真实 0 条任务态 + 「＋ 新建任务」入口 + 空树引导 + 纯用户文案徽章） | audit「r17 清理后任务归零」；e2e「空任务列表装配为空树」 |
| org-tab-active.png | **组织激活（r23 新增）**（?page=org；真实 0 部门 0 人员空态 + 部门树面板 + 人员卡片面板 + 新建部门/人员入口 + 纯用户文案徽章） | audit「r23 GET /api/org/tree -> 200 且 tree=[] / members=[]」；e2e「r23 部门树 / 搜索 / schema v16」 |
| notifications-tab-active.png | **通知激活（r26 新增）**（?page=notifications；零通知空态 + 六类筛选 + 计数口径图例 + 十九药丸壳 + 纯用户文案徽章） | e2e「r26 通知 tab / deep-link seam」；audit「GET /api/notifications 空列表」 |
| reports-tab-active.png | **报表激活（r27 新增）**（?page=reports；六张 KPI 卡 + 时间范围 + 明细空态 + 十九药丸壳 + 纯用户文案徽章） | e2e「r27 十七 tab 类型含报表页 / 报表页消费 shared 口径」；audit「GET /api/reports/overview 空库六指标全 0」 |
| work-reports-tab-active.png | **报告激活（r36 新增）**（?page=work-reports；真实 0 数据日报空态 + 日报/周报切换 + 日期锚点 + 「生成报告 / 存为文档 / 打印」三按钮 + 十九药丸壳 + 纯用户文案徽章） | e2e「r36 App·十九 tab / 报告 tab 激活态 seam」；audit「GET /api/reports/daily 空库六段皆暂无 / summary 全 0」 |
| meetings-tab-active.png | **会议激活（r28 新增）**（?page=meetings；零会议室 / 零成员空态：「还没有会议室——先在下方新建一间。」/「该日期暂无可用会议室。」/「通讯录暂无成员。」+ 十九药丸壳 + 纯用户文案徽章；各轮 shell 零数据最小集惯例，不是三室态） | e2e「r28 十八 tab 与顶栏按钮在场 / 会议页消费 shared 唯一口径」；audit「r28 清理后本轮会议归零」 |
| forms-tab-active.png | **表单激活（r41 新增）**（?page=forms；零表单空态「还没有表单。点『＋ 新建表单』创建第一张…」+ 二十药丸壳 + 纯用户文案徽章；各轮 shell 零数据最小集惯例，不是有数据态） | e2e「r41 App·二十 tab / 表单 tab 激活态 seam」；audit「r41 GET 空表单列表 -> 200」 |

## r45 哈希自查（二十张互异，与当前文件逐字一致；R45 当前哈希块，以下 R44 及以下为历史块）

<!-- R45_HASHES_BEGIN -->
`workbench=25DB4F1A` · `todos=EA209828` · `schedules=85F8FA3E` · `projects=04F53EB5` ·
`board=3ED65755` · `bases=39108DB8` · `docs=1DCE91A9` · `chat=A49B5562` ·
`knowledge=B6BCB76E` · `mindmap=8FB50B92` · `whiteboard=57ABC543` · `approval=35BE6912` ·
`assets=962259ED` · `unit-tasks=6ECDA61A` · `org=A3B5B1EF` · `notifications=DE039C98` ·
`reports=5C730CA6` · `work-reports=84F0302A` · `meetings=1F76EF8A` · `forms=7DE7F01E` —— **20/20 互异**。
<!-- R45_HASHES_END -->

> r45 渲染层改动（DocsPage 块拖拽手柄 / 插入线 / 落库回执 + 每块 ↑ / ↓ 触屏按钮保留）→ 二十张同批重拍；
> 徽章沿用 r39 纯用户文案，tab 数不变。捕获用 `scripts/r39-shot.mjs` 一次性 headless CDP，
> 探针文档经真实导入端点种子、矩阵后软删，`XIEFLOW_DB_PATH` 走 `scripts/.tmp-r45shot/shot.db` scratch 库。
> 矩阵↔壳重叠 0；r44→r45 壳 changed=9 / same=11 如上，如实披露；全库 379 PNG / 377 互异
> （+7 = r45 矩阵新增；同态组仅 r4 已披露 2 组，r45 零新增）。

## r44 哈希自查（R44 当前哈希块原样保留作历史对照；当前块见上方 R45 块，以下 R43 及以下为历史块）

<!-- R44_HASHES_BEGIN -->
`workbench=25DB4F1A` · `todos=ABD14B3D` · `schedules=85F8FA3E` · `projects=04F53EB5` ·
`board=BACD8D5A` · `bases=39108DB8` · `docs=6E792EE8` · `chat=A49B5562` ·
`knowledge=B6BCB76E` · `mindmap=36F18B32` · `whiteboard=9B4D04DE` · `approval=24722CCA` ·
`assets=962259ED` · `unit-tasks=1CBB42DB` · `org=514A3356` · `notifications=DE039C98` ·
`reports=5C730CA6` · `work-reports=84F0302A` · `meetings=1F76EF8A` · `forms=106B3347` —— **20/20 互异**。
<!-- R44_HASHES_END -->

> r44 渲染层改动（MeetingsPage 校验错误帧纯用户文案 + 05 时段 seam）→ 二十张同批重拍；徽章沿用 r39 纯用户文案。
> 捕获用 `scripts/r39-shot.mjs` 一次性 headless CDP（seam 网络钉态：`/api/auth/mode` 钉 local、401 钉空态探针），
> **不改产品代码 / 数据库 / 用户数据**（本轮仅 `?shot=` 钉态输入与用户可见文案）；截图走 `XIEFLOW_DB_PATH` scratch 库并删除。
> 矩阵↔壳重叠 0；r43→r44 壳 changed=6 / same=14 如上，如实披露；全库 372 PNG / 370 互异（同态组仅 r4 已披露 2 组）。

## r43 哈希自查（R43 当前哈希块原样保留作历史对照；当前块见上方 R44 块，以下 R41 及以下为历史块）

<!-- R43_HASHES_BEGIN -->
`workbench=25DB4F1A` · `todos=EA209828` · `schedules=85F8FA3E` · `projects=04F53EB5` ·
`board=BACD8D5A` · `bases=39108DB8` · `docs=6E792EE8` · `chat=A49B5562` ·
`knowledge=B6BCB76E` · `mindmap=8FB50B92` · `whiteboard=57ABC543` · `approval=24722CCA` ·
`assets=962259ED` · `unit-tasks=6ECDA61A` · `org=514A3356` · `notifications=DE039C98` ·
`reports=5C730CA6` · `work-reports=84F0302A` · `meetings=93EA3FC5` · `forms=7DE7F01E` —— **20/20 互异**。
<!-- R43_HASHES_END -->

> r43 渲染层改动（会议室设备徽标 + 推荐面板）→ 二十张同批重拍；徽章沿用 r39 纯用户文案。
> 捕获用 `scripts/r39-shot.mjs` 一次性 headless CDP（seam 网络钉态：`/api/auth/mode` 钉 local、401 钉空态），
> **不改产品代码 / 数据库 / 用户数据**；截图走 `XIEFLOW_DB_PATH` scratch 库并删除。
> 矩阵↔壳重叠 0；r41→r43 壳 changed=6 / same=14 如上，如实披露；全库 372 PNG / 370 互异（同态组仅 r4 已披露 2 组）。

## r41 哈希自查（二十张互异，与当前文件逐字一致；R41 当前哈希块，以下 R40 及以下为历史块）

<!-- R41_HASHES_BEGIN -->
`workbench=25DB4F1A` · `todos=ABD14B3D` · `schedules=3862FA46` · `projects=04F53EB5` ·
`board=3ED65755` · `bases=39108DB8` · `docs=6E792EE8` · `chat=A49B5562` ·
`knowledge=93B6F063` · `mindmap=8FB50B92` · `whiteboard=57ABC543` · `approval=24722CCA` ·
`assets=962259ED` · `unit-tasks=6ECDA61A` · `org=514A3356` · `notifications=DE039C98` ·
`reports=5C730CA6` · `work-reports=84F0302A` · `meetings=ED5FF9D3` · `forms=106B3347` —— **20/20 互异**。
<!-- R41_HASHES_END -->

> r41 渲染层改动（新增表单 tab + FormsPage）→ 二十张同批重拍；徽章沿用 r39「界面文案已优化（错误提示更清晰）」。
> 捕获用 `scripts/r39-shot.mjs` 一次性 headless CDP（与 r39/r40 同款 seam 网络钉态：`/api/auth/mode` 钉 local、
> 401 钉最小空态 JSON；报表 / 报告用 `?shot=reports-empty` / `?shot=wr-empty`），
> **不改产品代码 / 数据库 / 用户数据**；截图与 CDP 走 `XIEFLOW_DB_PATH` scratch 库并删除。
> 矩阵↔壳重叠 0；全库 365 PNG / 363 互异（r41 实测；同态组仅 r4 已披露 2 组）。

## r40 哈希自查（十九张互异，R40 块原样保留为历史块；当前文件见上方 R41 块）

<!-- R40_HASHES_BEGIN -->
`workbench=25DB4F1A` · `todos=EA209828` · `schedules=3862FA46` · `projects=3366A5DE` ·
`board=3ED65755` · `bases=6E3338F8` · `docs=84657AA4` · `chat=DE7A26CC` ·
`knowledge=FC461336` · `mindmap=E219934C` · `whiteboard=A2A46E10` · `approval=BE6FB8D9` ·
`assets=370BEC5B` · `unit-tasks=D2F65902` · `org=2CD84F1B` · `notifications=93E39614` ·
`reports=03B3D2F4` · `work-reports=B2AEDDFE` · `meetings=1E252C29` —— **19/19 互异**。
<!-- R40_HASHES_END -->

> r40 渲染层只改用户可见文案（登录页页脚 + 单位数 rN 种子/预览），十九张同批重拍，tab 数不变；徽章沿用 r39「界面文案已优化（错误提示更清晰）」。
> 捕获用 `scripts/r39-shot.mjs` 一次性 headless CDP（与 r39 同款 seam 网络钉态：`/api/auth/mode` 钉 local、401 钉最小空态 JSON；报表 / 报告用 `?shot=reports-empty` / `?shot=wr-empty`），**不改产品代码 / 数据库 / 用户数据**；截图与 CDP 走 `XIEFLOW_DB_PATH` scratch 库并删除。
> 矩阵↔壳重叠 0；全库 357 PNG / 355 互异（+1 = r40 登录页矩阵），同态组仅 r4 已披露 2 组。

## r39 哈希自查（十九张互异，R39 块原样保留为历史块；当前文件见上方 R40 块）

<!-- R39_HASHES_BEGIN -->
`workbench=25DB4F1A` · `todos=EA209828` · `schedules=85F8FA3E` · `projects=04F53EB5` ·
`board=3ED65755` · `bases=6E3338F8` · `docs=84657AA4` · `chat=FEC030ED` ·
`knowledge=728DBB8C` · `mindmap=E219934C` · `whiteboard=A2A46E10` · `approval=BE6FB8D9` ·
`assets=370BEC5B` · `unit-tasks=D2F65902` · `org=2CD84F1B` · `notifications=93E39614` ·
`reports=03B3D2F4` · `work-reports=B2AEDDFE` · `meetings=2828D5C1` —— **19/19 互异**。
<!-- R39_HASHES_END -->

> r39 渲染层只改用户可见文案（错误条 / 登录提示 / 顶栏徽章），十九张同批重拍，tab 数不变；徽章已改为「界面文案已优化（错误提示更清晰）」，不再含 rNN 轮次号。
> 捕获用 `scripts/r39-shot.mjs` 一次性 headless CDP：本机 api 持久化 remote 模式，截图进程在 CDP 层把 mode 探针钉 local、401 探针替换为最小空态 JSON（报表 / 报告两 tab 另用内置 `?shot=reports-empty` / `?shot=wr-empty` 空态钉态，避免认证错误条外露），**不改产品代码 / 数据库 / 用户数据**，并在 r39 矩阵 README 显式披露。
> 矩阵↔壳重叠 0；全库 356 PNG / 354 互异（+7 = r39 矩阵 7 张），同态组仅 r4 已披露 2 组。

## r38 哈希自查（十九张互异，R38 当前哈希块原样保留为历史块；当前文件见上方 R39 块）

<!-- R38_HASHES_BEGIN -->
`workbench=6BAB7DB6` · `todos=6AEECB47` · `schedules=DE3FF3D5` · `projects=75E788EF` ·
`board=54663AE4` · `bases=BA2B09FF` · `docs=7794D5A0` · `chat=FFB3E5B4` ·
`knowledge=46247EA3` · `mindmap=3F800FD1` · `whiteboard=BF538220` · `approval=E2C8BB1A` ·
`assets=59E9405D` · `unit-tasks=96F0DAF5` · `org=978A7493` · `notifications=E97E4FCF` ·
`reports=606281DF` · `work-reports=675FAD00` · `meetings=E6A79E31` —— **19/19 互异**。
<!-- R38_HASHES_END -->

> r38 渲染层改动（看板卡片正面元数据 + 编辑面板 + 筛选栏）+ 顶栏徽章推进 → 十九张同批重拍，tab 数不变；
> 矩阵↔壳重叠 0；全库 349 PNG / 347 互异（+7 = r38 矩阵 7 张），同态组仅 r4 已披露 2 组。
> 截图与 CDP 全程 headless，走 scratch local-mode 库，仓库 `data/xieflow.db` 未作 DB_PATH。

## r37 哈希自查（十九张互异，R37 当前哈希块原样保留为历史块；当前文件见上方 R38 块）

<!-- R37_HASHES_BEGIN -->
`workbench=5FACDB62` · `todos=33F6A0B9` · `schedules=373CFB32` · `projects=F1741233` ·
`board=E81CA853` · `bases=C8CD9FAE` · `docs=6B67EE2A` · `chat=E0BBC9D5` ·
`knowledge=37144ADC` · `mindmap=BAF8AE5B` · `whiteboard=A9F19806` · `approval=21A8F0F0` ·
`assets=EC2337CD` · `unit-tasks=7C336490` · `org=4622B8D2` · `notifications=C0DA2287` ·
`reports=D8BF3F44` · `work-reports=244AEC68` · `meetings=9AD2F9B5` —— **19/19 互异**。
<!-- R37_HASHES_END -->

> r37 渲染层改动（表格页分组下拉 / 折叠组头 / 汇总行）+ 顶栏徽章推进 → 十九张同批重拍，tab 数不变；
> 矩阵↔壳重叠 0；全库 342 PNG / 340 互异（+7 = r37 矩阵 7 张），同态组仅 r4 已披露 2 组。
> 截图与 CDP 全程 headless，走 scratch local-mode 库，仓库 `data/xieflow.db` 未作 DB_PATH。

## r36 哈希自查（十九张互异，R36 当前哈希块原样保留为历史块；当前文件见上方 R37 块）

<!-- R36_HASHES_BEGIN -->
`workbench=D7A7BD5A` · `todos=77E9D48D` · `schedules=A1F5E9AB` · `projects=DD4AF156` ·
`board=73D59F20` · `bases=1BD2E22A` · `docs=30EF4BA7` · `chat=0D843A9E` ·
`knowledge=99918481` · `mindmap=594D31B4` · `whiteboard=39146E44` · `approval=0844FFB0` ·
`assets=55CC5F2A` · `unit-tasks=95F1ED6F` · `org=392DB0C3` · `notifications=FE6746C4` ·
`reports=4A743935` · `work-reports=72981AEF` · `meetings=F0AE6624` —— **19/19 互异**。
<!-- R36_HASHES_END -->

> r36 新增第十九 tab「报告」（`?page=work-reports`）+ 顶栏徽章推进 + 报告页主按钮可见性修复 → 十九张同批重拍；
> 矩阵↔壳重叠 0；全库 335 PNG / 333 互异（+8 = r36 矩阵 7 张 + 新增 work-reports 壳 1 张），同态组仅 r4 已披露 2 组。
> 首轮 remote 模式误拍登录页（19 张同哈希）与次轮主按钮白字白底废片均已全批重拍、未入库。

## r25 哈希自查（十五张互异，历史块；当前文件见下方 R26 块）

<!-- R25_HASHES_BEGIN -->
`workbench=6670358F` · `todos=E6E038EF` · `schedules=241D4609` · `projects=CEA441BA` ·
`board=F6CB955D` · `bases=D83C38C3` · `docs=F584CE1B` · `chat=F6CAD4EB` ·
`knowledge=D13E8629` · `mindmap=90A657F6` · `whiteboard=DA9A75AA` · `approval=F0DDDFA5` ·
`assets=90166EF8` · `unit-tasks=2A81BA59` · `org=870B5A43` —— **15/15 互异**。
<!-- R25_HASHES_END -->

## r26 哈希自查（十六张互异，历史块；当前文件见下方 R27 块）

<!-- R26_HASHES_BEGIN -->
`workbench=9709D035` · `todos=6CFF1969` · `schedules=16204696` · `projects=A509274E` ·
`board=864C3E7F` · `bases=06928B1D` · `docs=C0707139` · `chat=1BFF37D0` ·
`knowledge=910447F9` · `mindmap=A3EA8D2C` · `whiteboard=693BC09F` · `approval=28B3764C` ·
`assets=E7A3F5CC` · `unit-tasks=8FDA145D` · `org=FBB3C5CA` · `notifications=1983938C`
—— **16/16 互异**。
<!-- R26_HASHES_END -->

## r27 哈希自查（十七张互异，历史块；当前文件见下方 R28 块）

<!-- R27_HASHES_BEGIN -->
`workbench=0881BB79` · `todos=0EB05F7B` · `schedules=72A450E6` · `projects=304317A6` ·
`board=7F79DBD1` · `bases=09653EB2` · `docs=1C60DD8C` · `chat=BD47C6FA` ·
`knowledge=6812E127` · `mindmap=183426BE` · `whiteboard=18C516D4` · `approval=6B45A8D6` ·
`assets=D010C64F` · `unit-tasks=0B3869B9` · `org=1C14209A` · `notifications=B15EF500` ·
`reports=BFC9BDD2` —— **17/17 互异**。
<!-- R27_HASHES_END -->

## r28 哈希自查（十八张互异，与当前文件逐字一致；R27 及以下为历史块）

<!-- R28_HASHES_BEGIN -->
`workbench=86946959` · `todos=A7E81B45` · `schedules=EF9A9ECB` · `projects=0FB97731` ·
`board=65431B25` · `bases=74C1CF5B` · `docs=BC146AC6` · `chat=FECCCED0` ·
`knowledge=6B79A170` · `mindmap=F51D9431` · `whiteboard=D3F64BC2` · `approval=934928D2` ·
`assets=C983F943` · `unit-tasks=DA1CA902` · `org=155FA658` · `notifications=EECAB413` ·
`reports=18010A69` · `meetings=0832E1B9` —— **18/18 互异**。
<!-- R28_HASHES_END -->

> （历史块）e2e「shell README R28 哈希与实际文件逐字一致」已被 R29 全批重拍取代；r28 新增第十八 tab「会议」。

## r29 哈希自查（十八张互异，与当前文件逐字一致；R28 及以下为历史块）

<!-- R29_HASHES_BEGIN -->
`workbench=3E816F10` · `todos=DDE2BB52` · `schedules=9284680C` · `projects=E57B124B` ·
`board=8B4CB776` · `bases=B1393B28` · `docs=66BED781` · `chat=AC1CCC32` ·
`knowledge=41F1EC55` · `mindmap=0BE3B5FA` · `whiteboard=0B8F7226` · `approval=D19876A4` ·
`assets=D7244318` · `unit-tasks=B8900858` · `org=7F4F2249` · `notifications=9314B40A` ·
`reports=159A34BA` · `meetings=A4363E90` —— **18/18 互异**。
<!-- R29_HASHES_END -->

> e2e「shell README R29 哈希与实际文件逐字一致」已被 R30 全批重拍取代；r29 文档页改渲染层、18 tab 数量不变但全批重拍。
> 全库计数见 R30 当前块（r29 新增 7 张矩阵，十八壳为替换同路径不增总数），零新增同态组。

## r30 哈希自查（十八张互异，与当前文件逐字一致；R30 当前哈希块，R29 及以下为历史块）

<!-- R30_HASHES_BEGIN -->
`workbench=01A4AF98` · `todos=7484C959` · `schedules=C05952A1` · `projects=E064FF1A` ·
`board=97D68577` · `bases=6867BE51` · `docs=76119437` · `chat=0C2624C5` ·
`knowledge=DC7AAB96` · `mindmap=9A482C1E` · `whiteboard=B0005100` · `approval=A3C6CC42` ·
`assets=ABEA246B` · `unit-tasks=4287498E` · `org=D97B977E` · `notifications=B8B2E7A7` ·
`reports=E0E438EA` · `meetings=37BCE5C1` —— **18/18 互异**。
<!-- R30_HASHES_END -->

> e2e「shell README R30 哈希与实际文件逐字一致」逐张复算 SHA256 锁定本表；r30 表格页改渲染层（公式列 / 表达式面板）、18 tab 数量不变但全批重拍。
> 全库 **297 PNG / 295 互异**（同态组仅 r4 已披露 2 组），r30 矩阵 7 + 十八壳同批重拍，零新增同态组。
> e2e「shell README R30 当前哈希块」已被 R31 全批重拍取代（历史块保留作逐名对照）。

## r31 哈希自查（十八张互异，与当前文件逐字一致；R31 当前哈希块，R30 及以下为历史块）

<!-- R31_HASHES_BEGIN -->
`workbench=EE7CAF9E` · `todos=3EF96C63` · `schedules=EF86BC0F` · `projects=069C3562` ·
`board=00D08677` · `bases=FC2BBE34` · `docs=EE575E2A` · `chat=BE383BEA` ·
`knowledge=C78FDE18` · `mindmap=593854FA` · `whiteboard=4649BECD` · `approval=9B814E8E` ·
`assets=34E08466` · `unit-tasks=B66A02D0` · `org=FC96A31B` · `notifications=A28F12E7` ·
`reports=9373415F` · `meetings=F5620C55` —— **18/18 互异**。
<!-- R31_HASHES_END -->

> e2e「shell README R31 哈希与实际文件逐字一致」逐张复算 SHA256 锁定本表；r31 表格页改渲染层（空态八类文案 / 浮点展示格式化）、18 tab 数量不变但全批重拍。
> 与 r30 十八张同名文件逐名全异（changed=18 / same=0）；矩阵↔壳重叠 0；r31 当时全库 **300 PNG / 298 互异**
>（r31 新增 3 张矩阵，十八壳为替换同路径不增总数），r31 当时全库 **300 PNG / 298 互异**，同态组仅 r4 已披露 2 组，r31 零新增。
> e2e「shell README R31 当前哈希块在场」已被 R32 全批重拍取代（本块保留作历史对照）。

## r35 哈希自查（十八张互异，历史块；当前文件见上方 R36 块）

<!-- R35_HASHES_BEGIN -->
`workbench=D6C682F3` · `todos=EC2803EA` · `schedules=0CEAC049` · `projects=D66AE501` ·
`board=1D910E72` · `bases=60664FBD` · `docs=49E7B43C` · `chat=0EDD2B83` ·
`knowledge=1238C4AD` · `mindmap=9423B6E1` · `whiteboard=A58D3813` · `approval=958D478E` ·
`assets=04F3F356` · `unit-tasks=3B9731ED` · `org=C1C0092F` · `notifications=0906E38A` ·
`reports=040A589B` · `meetings=4890F1F9` —— **18/18 互异**。
<!-- R35_HASHES_END -->

> r35 日程页加 ICS 导出菜单 / 落盘回执 / 订阅设置卡 / 导入预览与确认，18 tab 数量不变但渲染层变化 → 十八张同批重拍；
> 矩阵↔壳重叠 0；全库 327 PNG / 325 互异（+7 = r35 矩阵新增），同态组仅 r4 已披露 2 组。

## r34 哈希自查（十八张互异，与当前文件逐字一致；R34 当前哈希块，以下 R33 及以下为历史块）

<!-- R34_HASHES_BEGIN -->
`workbench=38362519` · `todos=80F5F579` · `schedules=6FA8D98E` · `projects=59A544C6` ·
`board=9EAAE846` · `bases=4E00A2E7` · `docs=61979EBB` · `chat=16107365` ·
`knowledge=7803BCD0` · `mindmap=A69D7C96` · `whiteboard=E928BFA1` · `approval=B7AE5AB4` ·
`assets=27C73ED9` · `unit-tasks=6AE20860` · `org=CAEAC3CE` · `notifications=634C1F07` ·
`reports=A85270CD` · `meetings=B5E9E583` —— **18/18 互异**。
<!-- R34_HASHES_END -->

> r34 待办页加前置任务面板 / 阻塞态 / 循环红条，18 tab 数量不变但壳因待办页变化全批重拍；
> 矩阵↔壳重叠 0；全库 320 PNG / 318 互异（+7 = r34 矩阵新增），同态组仅 r4 已披露 2 组。

## r33 哈希自查（十八张互异，与当前文件逐字一致；R33 当前哈希块，以下 R32 及以下为历史块）

<!-- R33_HASHES_BEGIN -->
`workbench=9CA2323F` · `todos=3F5AD20E` · `schedules=22580953` · `projects=85BFB7AB` ·
`board=1CB855CA` · `bases=1172B8FA` · `docs=92BCE19B` · `chat=0E2B7708` ·
`knowledge=B105AAA2` · `mindmap=BB1C0AD3` · `whiteboard=84C199D6` · `approval=08A48376` ·
`assets=67BE807C` · `unit-tasks=51502536` · `org=5297CE1B` · `notifications=63EDDD41` ·
`reports=89B02714` · `meetings=CF9F6F31` —— **18/18 互异**。
<!-- R33_HASHES_END -->

> r33 顶栏新增全局搜索框（Ctrl/Cmd+K）+ 下拉结果面板，18 tab 数量不变但壳因顶栏变化全批重拍；
> 矩阵↔壳重叠 0；全库 313 PNG / 311 互异（+7 = r33 矩阵新增）。

## r32 哈希自查（十八张互异，与当前文件逐字一致；R32 当前哈希块，R31 及以下为历史块）

<!-- R32_HASHES_BEGIN -->
`workbench=3A8E4DA3` · `todos=B6A8B3B9` · `schedules=0D63D8AA` · `projects=D6D33F5D` ·
`board=BB0625A4` · `bases=5D56BAF3` · `docs=DF4B4DDB` · `chat=C6334A73` ·
`knowledge=C61CFB9D` · `mindmap=0AE00F2D` · `whiteboard=328C657D` · `approval=8BE9390A` ·
`assets=C55FA6AA` · `unit-tasks=21F533BA` · `org=BF8E8AF3` · `notifications=586B69B8` ·
`reports=9CF1C6D4` · `meetings=927A1A4C` —— **18/18 互异**。
<!-- R32_HASHES_END -->

> e2e「shell README R32 哈希与实际文件逐字一致」逐张复算 SHA256 锁定本表；r32 文档页加导出菜单 / 打印 iframe /
> HTML·Word 落盘佐证面板且徽章推进，18 tab 数量不变但全批重拍，与 r31 十八张同名文件全异。
> 矩阵↔壳重叠 0；全库 **306 PNG / 304 互异**（r32 新增 6 张矩阵，十八壳替换同路径不增总数），同态组仅 r4 已披露 2 组，r32 零新增。

> e2e「shell README R27 哈希与实际文件逐字一致」逐张复算 SHA256 锁定本表；r27 新增第十七 tab「报表」。

> e2e「shell README R26 哈希与实际文件逐字一致」逐张复算 SHA256 锁定本表；r26 新增第十六 tab「通知」。

> e2e「shell README R25 哈希与实际文件逐字一致」逐张复算 SHA256 锁定本表；r24 曾把本块标签误留「r23」，
> r25 按 r22 先例保留历史对照行，当前块与历史行分开，断言名与所指内容一致。

### 历史哈希对照（保留上一轮/上上轮作对照行，r25 不覆盖）

- **r24 基线**：`workbench=6670358F` / `todos=9DE3AB25` / `schedules=241D4609` / `projects=632CE2E2` /
  `board=15166FE1` / `bases=D83C38C3` / `docs=0C5266B5` / `chat=F6CAD4EB` / `knowledge=D13E8629` /
  `mindmap=90A657F6` / `whiteboard=DA9A75AA` / `approval=F0DDDFA5` / `assets=90166EF8` /
  `unit-tasks=2A81BA59` / `org=870B5A43`。
- **r23 基线**：`workbench=6670358F` / `todos=9DE3AB25` / `schedules=241D4609` / `projects=CEA441BA` /
  `board=15166FE1` / `bases=7A056D63` / `docs=F584CE1B` / `chat=39E47012` / `knowledge=D13E8629` /
  `mindmap=391064D4` / `whiteboard=DA9A75AA` / `approval=CA7181C5` / `assets=90166EF8` /
  `unit-tasks=2A81BA59` / `org=F017DF9D`。
- **与 r23 逐名对照**：8 张同字节（`workbench / schedules / projects / knowledge / whiteboard / assets / unit-tasks / docs`），
  7 张改变（`todos / board / bases / chat / mindmap / approval / org`）；**与 r24 逐名对照**：11 张同字节，
  4 张改变（`board / docs / projects / todos`，为钉态数据时序差异，不伪造「全异」）。
- r22 基线：`workbench=1C96C496` / `todos=278C23F4` / `schedules=EC700171` / `projects=B5ABFFD2` /
  `board=36942D51` / `bases=EB33939D` / `docs=4B48E863` / `chat=63761823` / `knowledge=870E4715` /
  `mindmap=30576CCF` / `whiteboard=E441E8FE` / `approval=98E4FDEB` / `assets=60DDBAD6` / `unit-tasks=3DB8682C`。
- r20 基线（r21 沿用）：`workbench=E78B0690` / `todos=222FD9CC` / `schedules=AB88DF1E` / `projects=8E5FF20D` /
  `board=C0301C4F` / `bases=C0886814` / `docs=89B6C0A3` / `chat=6DF2B1D0` / `knowledge=C48E63AB` /
  `mindmap=A9253280` / `whiteboard=35BD3927` / `approval=F1FCF4E0` / `assets=43A922AC` / `unit-tasks=6CDC1097`。
- r19 基线：`workbench=E269A1B3` / `todos=28DC21AE` / `schedules=B002BB3D` / `projects=B86EAE19` /
  `board=E7BEF0B1` / `bases=DCA1920D` / `docs=610032A4` / `chat=67F006A1` / `knowledge=90C279F4` /
  `mindmap=CE292C61` / `whiteboard=26F86E19` / `approval=EC8D4CD5` / `assets=7EBFB464` / `unit-tasks=6EA8A279`。
- `chat-tab-active` 与 `docs/ui/r11/` 矩阵任一图刻意不同态：前者为真实 0 会话态，矩阵为两轮对话 / 产物 / 窄屏 / 错误态。

## 机制说明

- 拍摄入口：`scripts/shot.ps1` 的 `Invoke-ShellBaseline`（r4 返工 #1 加入；r8 由 6 扩 7，r10 扩 8，r12 扩 9，r14 扩 10，r15 扩 11，r16 扩 12，r17 扩 14；r18~r22 数量不变仍 14；**r23 扩 15，r26 扩 16，r27 扩 17，r28 扩 18，r36 扩 19**）。
- 触发条件：`-Round r4` 及以后的 `shots` / `all` 动作（r1~r3 历史轮不回拍）；r21 因未改渲染层沿用 r20 字节，r22 补拍闭合口径，r23 因新增 tab 全量重拍，r25 因渲染层改动全量重拍，r26 与 r26 返工 #1 均因通知/日程/审批渲染层改动全量重拍，r27 因新增报表 tab 与徽章推进全量重拍，r28 因新增会议 tab 全量重拍，r29 因文档页版本历史侧栏 / 回收站入口 + 徽章推进全量重拍，r30 因表格页公式列 / 表达式面板 + 徽章推进全量重拍，r31 因表格页空态文案 / 浮点展示格式化 + 徽章推进全量重拍，r32 因文档页导出菜单 / 打印 iframe / HTML·Word 佐证面板 + 徽章推进全量重拍，r33 因全局搜索顶栏 + 徽章推进全量重拍，r34 因待办前置任务/阻塞链 + 徽章推进全量重拍，r35 因日程页 ICS 导出/订阅/导入 + 徽章推进全量重拍（tab 数仍 18；返工 #1 只重拍 r35 矩阵 02/04/05/07，壳形态未变、十八壳沿用 r35 首轮字节），r36 因新增报告 tab + 徽章推进 + 主按钮可见性修复十九张全量重拍（首轮 remote 登录页废片全批重拍），r38 因看板卡片元数据 + 徽章推进全量重拍，r39 因用户可见文案清理（错误条 / 徽章）全量重拍（tab 数仍 19；截图 CDP 层钉 local mode 与空态探针，不改用户数据）。
- 落盘：本目录，文件名 `<tab>-tab-active.png`（与 App.tsx PageTab 一一对应；新增/改名 tab 时须同步脚本内 $tabs 清单）。
- 认证页为独立路由、同步卡在工作台内、更多入口为底栏布局件，三者均不进 `$tabs`；「组织」是真 tab，r23 起进基线。
- 同态说明：壳基线各张与各轮页面矩阵均不同字节；全库唯一残留同态组在 r4 目录内部
  （`r4/01 = r4/16` = `9E5C0C23`、`r4/05 = r4/13` = `8397A028`），如实注记；**全库 335 PNG / 333 互异**（r36 新增 7 张矩阵 + 1 张 work-reports 壳），r29~r36 均零新增同态组。
- `mindmap-tab-active` 与 `docs/ui/r14/` 矩阵 02/03/04 分形：0 张导图空态 / Markdown 编辑态 / 树视图态 / 折叠态，四态互异。
