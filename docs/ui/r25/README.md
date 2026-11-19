# docs/ui/r25 · 第三轮遗留清理截图矩阵（审批动作徽标 / 选人部门筛选 / 徽标去裸号 / 物资详情徽标）

- 范围：审批「通过/驳回/提交」动作由当前登录用户的关联成员带 `actorMemberId`，schema v17→v18 加 `approval_steps.actor_member_id` 可空列；时间线按姓名 + 部门渲染操作人徽标；选人弹窗加部门筛选；回填徽标去 `member_id` 裸号并补「手改姓名仅作备忘」语义提示；补物资**详情**徽标实证（闭合 r24 U2-3）。
- 证据纪律：七张矩阵 + 十五 tab 壳基线由 `scripts/shot.ps1 all -Round r25` 同一批 headless 捕获（`--headless=new` + `-WindowStyle Hidden`），`XIEFLOW_DB_PATH` 指向 `scripts/.tmp-shot-r25/` 自建 scratch local 库，仓库 `data/xieflow.db` 只读；真 HTTP / 真点链路分别由 `scripts/audit-http.ts` 与 headless CDP 背书，钉态图不冒充真实库数据。
- 首轮废片说明：首次捕获的 01/04 因钉态未进 `PINNED` 白名单落在「正在连接审批库」加载态、07 与 r24/07 同字节；定位后补 `approval-r25-error` 钉态并**全矩阵 + 壳基线重拍**，废片未入库，现存七张均为目标形态。

| 图 | 形态 | 对应断言 |
|---|---|---|
| 01-approval-actor-badge.png | 审批 #91 时间线三步：提交/转交/通过各带「姓名（部门）」操作人徽标，通过态终态零出边；`data-state=approval-actor-badge` | e2e「r25 审批动作步骤徽标 seam 在场」；audit「r25 提交/通过步骤 actor_member_id 真落库 + 摘要回带」 |
| 02-picker-dept-filter.png | 选人弹窗：「部门筛选」下拉（全部部门/研发中心/市场部）+ 搜索框 + 两名候选卡，原自由文本输入框在场 | e2e「r25 选人弹窗部门筛选 seam 在场」；MemberPicker `pick-dept` seam |
| 03-badge-named.png | 选中后回填「李娜（市场部）」+ × 清关联；无 `#member_id` 裸号 | e2e「r25 回填徽标去除 member_id 裸号」；`memberDisplayName` 纯函数 |
| 04-manual-hint.png | 手改姓名「李娜（手改备忘）」后徽标仍为「李娜（市场部）」，黄色提示「手改仅作备忘，提交以通讯录为准；× 解除关联」 | e2e「r25 回填后手改语义提示 seam 在场」 |
| 05-assets-detail-badge.png | 物资 #81 **详情区**展示保管人「赵敏（行政部）」徽标（卡片同款），坐实 r24/05 索引所述「详情」形态 | audit「r24 物资摘要回带部门名」；e2e「物资徽标 seam」 |
| 06-narrow.png | 488×1000 `?narrow=1`：弹窗单列、部门筛选与两卡完整、底栏「更多 ›」在场 | `force-narrow` seam；逐张目验 |
| 07-error.png | 语义化连接失败（r25 动作链路错误态）+ 重试按钮，与空态/选人态不混淆 | `?shot=approval-r25-error` 钉态；`approval-r25-error` 进 PINNED 白名单 |

**SHA256 自查（8 位前缀）**：`01=4DA01924` · `02=615CCC4E` · `03=1C810C2B` · `04=4E6AECA5` · `05=FBB5F6A1` · `06=E9441A71` · `07=23490694` —— **7/7 互异**；与 `docs/ui/shell/` 十五张交叉重叠 0 张。全库 **257 PNG / 255 互异**（r24 为 250/248，+7/+7；同态组仅 r4 已披露 2 组，r25 零新增）。七张矩阵 + 十五张壳基线逐张 `read_image` 目验：中文无乱码、无裁切、无塌陷，窄屏 06 弹窗与「更多 ›」可见。

### 与 r24 索引口径修正

- r24/05 原索引写「卡片与详情渲染部门徽标」，但 r24/05 图右栏为「未选择物资」；本轮 05 补真实详情态图，根 README 的 r24/05 行同步收敛为「卡片徽标（详情见 r25/05）」。
- 壳基线 `assets-tab-active.png` 与 r23 **同字节 90166EF8**：物资选人入口只在点开「新建物资」表单后出现（见 r24 矩阵 04），折叠空态无入口；根 README 与 shell README 均按此如实记载，不伪造差异。
