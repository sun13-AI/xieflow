# docs/ui/shell · 十八 tab 壳激活态基线（r4 返工 #1 B 固化；r17 起十四 tab，r23 扩十五，r26 扩十六，r27 扩十七，r28 扩十八；r29/r30/r31/r32 同批重拍）

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
> 窄屏 390/488px 形态见 `docs/ui/r22/`、`docs/ui/r23/06-narrow.png`、`docs/ui/r24/06-narrow.png`、`docs/ui/r25/06-narrow.png`、`docs/ui/r26/06-narrow.png`、`docs/ui/r27/06-narrow.png`、`docs/ui/r28/06-narrow.png`、`docs/ui/r29/07-narrow.png`、`docs/ui/r30/06-narrow.png` 与 `docs/ui/r32/05-narrow.png`。

| 文件 | 形态 | 对应断言 |
|---|---|---|
| workbench-tab-active.png | 工作台激活（默认页；schema **v18** + 里程碑 M10 多端与单机版 + 服务模式卡「本机/远端」 + 多端同步卡 + r23 徽章 + 顶栏在线状态区 + 登录按钮） | e2e「r23 schema v16 / 外壳 seam」；audit「r23 health / mode / todos 路由契约」 |
| todos-tab-active.png | 待办激活（?page=todos；四象限 + 计数卡 + 徽标 + r23 徽章） | audit「GET 列表 -> 200」+ summary 计数组端到端形态 |
| schedules-tab-active.png | 日程激活（?page=schedules；月视图 + 今天高亮 + r23 徽章） | e2e「新库 schedules 为空」；audit「GET 空区间 -> 200」 |
| projects-tab-active.png | 项目激活（?page=projects；空态 + 新建入口 + r23 徽章） | audit「GET /api/projects -> 200」空列表形态 |
| board-tab-active.png | 看板激活（?page=board；无项目空态引导 + r23 徽章） | audit「GET /api/projects -> 200」空列表形态的看板侧消费 |
| bases-tab-active.png | 表格激活（?page=bases；零表首次使用空态 + 空态文案「8 种字段类型齐备（含公式）」+「＋ 新建表」+ 十八药丸壳 + r31 徽章） | audit「r31 GET /api/tables -> 200」空列表形态；e2e「r31 空态文案八类 / 旧七类零残留」 |
| docs-tab-active.png | 文档激活（?page=docs；零文档首次使用空态 + 工具栏「回收站 / 导入 Markdown / 导出 .md / 导出 ▾ / ＋ 新建文档 / 打印预览」+ 十八药丸壳 + r32 徽章） | audit「r29 GET 文档列表 / 回收站 -> 200」空列表形态；e2e「建文档默认首块自动在场 + 零版本」「r32 导出菜单 seam」 |
| chat-tab-active.png | AI 工作台激活（?page=chat；真实 0 会话态三栏引导 + 12 工具目录 + r23 徽章） | audit「r11 GET /api/tools -> 200」；e2e「默认注册表恰 12 个工具」 |
| knowledge-tab-active.png | 知识库激活（?page=knowledge；真实 0 篇文档态 + 入库引导 + 十五药丸 + r23 徽章） | audit「r12 GET 知识库文档列表 -> 200」空列表形态 |
| mindmap-tab-active.png | 导图激活（?page=mindmap；真实 0 张导图态 + Markdown 源/树视图双栏空态 + r23 徽章） | audit「r14 清理后导图归零」；e2e「新库导图列表为空」 |
| whiteboard-tab-active.png | 白板激活（?page=whiteboard；真实 0 张白板态 + 无限画布网格 + 工具条空态 + r23 徽章） | audit「r15 清理后白板归零」；e2e「新库白板列表为空」 |
| approval-tab-active.png | 审批激活（?page=approval；真实 0 条审批态 + 三视角切换 + 空列表引导 + 选人入口 + r23 徽章） | audit「r16 清理后审批归零」；e2e「新库审批列表为空」 |
| assets-tab-active.png | 物资激活（?page=assets；真实 0 笔物资态 + 左栏空列表引导 + 右栏未选引导 + r23 徽章；与 r23 同字节，折叠态无选人入口） | audit「r17 清理后物资归零」；e2e「新库物资列表为空」 |
| unit-tasks-tab-active.png | 单位任务激活（?page=unit-tasks；真实 0 条任务态 + 「＋ 新建任务」入口 + 空树引导 + r23 徽章） | audit「r17 清理后任务归零」；e2e「空任务列表装配为空树」 |
| org-tab-active.png | **组织激活（r23 新增）**（?page=org；真实 0 部门 0 人员空态 + 部门树面板 + 人员卡片面板 + 新建部门/人员入口 + r23 徽章） | audit「r23 GET /api/org/tree -> 200 且 tree=[] / members=[]」；e2e「r23 部门树 / 搜索 / schema v16」 |
| notifications-tab-active.png | **通知激活（r26 新增）**（?page=notifications；零通知空态 + 六类筛选 + 计数口径图例 + 十六药丸壳 + r26 徽章） | e2e「r26 通知 tab / deep-link seam」；audit「GET /api/notifications 空列表」 |
| reports-tab-active.png | **报表激活（r27 新增）**（?page=reports；六张 KPI 卡 + 时间范围 + 明细空态 + 十七药丸壳 + r27 徽章） | e2e「r27 十七 tab 类型含报表页 / 报表页消费 shared 口径」；audit「GET /api/reports/overview 空库六指标全 0」 |
| meetings-tab-active.png | **会议激活（r28 新增）**（?page=meetings；零会议室 / 零成员空态：「还没有会议室——先在下方新建一间。」/「该日期暂无可用会议室。」/「通讯录暂无成员。」+ 十八药丸壳 + r28 徽章；各轮 shell 零数据最小集惯例，不是三室态） | e2e「r28 十八 tab 与顶栏按钮在场 / 会议页消费 shared 唯一口径」；audit「r28 清理后本轮会议归零」 |

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

## r35 哈希自查（十八张互异，与当前文件逐字一致；R35 当前哈希块，以下 R34 及以下为历史块）

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

- 拍摄入口：`scripts/shot.ps1` 的 `Invoke-ShellBaseline`（r4 返工 #1 加入；r8 由 6 扩 7，r10 扩 8，r12 扩 9，r14 扩 10，r15 扩 11，r16 扩 12，r17 扩 14；r18~r22 数量不变仍 14；**r23 扩 15，r26 扩 16，r27 扩 17，r28 扩 18**）。
- 触发条件：`-Round r4` 及以后的 `shots` / `all` 动作（r1~r3 历史轮不回拍）；r21 因未改渲染层沿用 r20 字节，r22 补拍闭合口径，r23 因新增 tab 全量重拍，r25 因渲染层改动全量重拍，r26 与 r26 返工 #1 均因通知/日程/审批渲染层改动全量重拍，r27 因新增报表 tab 与徽章推进全量重拍，r28 因新增会议 tab 全量重拍，r29 因文档页版本历史侧栏 / 回收站入口 + 徽章推进全量重拍，r30 因表格页公式列 / 表达式面板 + 徽章推进全量重拍，r31 因表格页空态文案 / 浮点展示格式化 + 徽章推进全量重拍，r32 因文档页导出菜单 / 打印 iframe / HTML·Word 佐证面板 + 徽章推进全量重拍（tab 数仍 18）。
- 落盘：本目录，文件名 `<tab>-tab-active.png`（与 App.tsx PageTab 一一对应；新增/改名 tab 时须同步脚本内 $tabs 清单）。
- 认证页为独立路由、同步卡在工作台内、更多入口为底栏布局件，三者均不进 `$tabs`；「组织」是真 tab，r23 起进基线。
- 同态说明：壳基线各张与各轮页面矩阵均不同字节；全库唯一残留同态组在 r4 目录内部
  （`r4/01 = r4/16` = `9E5C0C23`、`r4/05 = r4/13` = `8397A028`），如实注记；**全库 306 PNG / 304 互异**（r32 新增 6 张矩阵，十八壳为替换同路径不增总数），r29/r30/r31/r32 均零新增同态组。
- `mindmap-tab-active` 与 `docs/ui/r14/` 矩阵 02/03/04 分形：0 张导图空态 / Markdown 编辑态 / 树视图态 / 折叠态，四态互异。
