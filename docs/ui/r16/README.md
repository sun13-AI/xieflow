# docs/ui/r16 —— 审批流引擎（M8 起步，7 张；十二 tab 壳基线同批重拍）

> 与实现、根 README 索引、yanfa 报告同一提交。全部由 `scripts/shot.ps1 all -Round r16` 一次性 headless（`--headless=new -WindowStyle Hidden`）产出；seed 的两条审批拍后经 HTTP DELETE 清理归零（approvals=0，approval_steps / approval_cc 级联归零）。
>
> seed 真 id 为 **#5（请假，alice→bob，抄送 dave，待审）/ #6（报销，alice→bob，抄送 erin）**（`AUTOINCREMENT` 不回退，按实图如实记录，不复用旧轮/前几拍的说法）。03→04 间真发 `POST /api/approvals/6/delegate`（bob→carol，状态仍 pending）；04→05 间真发 `POST /api/approvals/6/approve`（carol，状态 approved）。02→03 间真发 `POST /api/approvals/5/submit`。

| 文件 | 形态 | 断言对照 / 取证方式 |
|---|---|---|
| 01-approval-empty.png | **审批空态**：十二 tab 壳「审批」激活 + 左栏「这里还没有审批——点『＋ 新建审批』发起第一单」+ 首次使用空态钉注；当前身份框 / 三视角切换在场、真实 0 条 | e2e「新库审批列表为空」；audit「r16 清理后审批归零」；`?shot=approval-empty` |
| 02-approval-form.png | **发起表单**：标题 / 类型 / 审批人 / 抄送人四真输入 + 「确认发起」按钮；钉注写明落 approvals 与 approval_cc 两表 | audit「r16 POST 审批 -> 201」「r16 抄送人真落库回读」；e2e「createApproval 抄送人真落库」；`?shot=approval-form` |
| 03-todo-list.png | **真实链路·待办列表**：身份 bob，`GET /api/approvals/view?view=todo` 真读回两条待审（#6 报销 / #5 请假）；#6 详情已读回「提交」一步与抄送提示 erin | audit「r16 submit 真流转到 pending」「r16 待办只数 pending 且 assignee 是我」；e2e「db 我的待办：pending 且 assignee 是我」 |
| 04-detail-timeline.png | **详情时间线**：真审批 #6 经真实 delegate 后当前审批人变 carol、状态仍「待审批」；时间线 `提交 → 转交` 两步，意见逐字可读 | audit「r16 delegate 不改状态」「r16 delegate 真换 assignee」「r16 步骤 order 连号」；e2e「delegate 真改 assignee」 |
| 05-approved.png | **审批通过态**：真审批 #6 经真实 approve 后状态「已通过」，时间线 `提交→转交→通过` 三步、操作区显示「当前身份在此单上无可用操作（终态）」 | audit「r16 approve 真流转到 approved」「r16 已通过再审批 -> 400」；e2e「已结单再审批抛错」 |
| 06-narrow.png | 窄屏 488×1100（`?narrow=1`）：**十二药丸单行不折行**（第十一枚白板 + 第十二枚审批均完整可见，r16 收窄窄屏药丸至 8px/3px），徽章独占下一行；身份框 / 三视角 / 列表 / 详情时间线纵排 | 无独立数字断言（CSS 断点，确定性钉态，逐张目验；十二 tab 壳基线同批重拍） |
| 07-error.png | 错误态（语义化文案 + 操作提示 + 「重试」按钮，钉态） | 无独立断言（4xx 由 audit r16 节锁定）；`?shot=approval-error` |

## SHA256 自查（全 8 位前缀）

`01=2424DE73` · `02=28649B9C` · `03=C5A00390` · `04=437FA7C8` · `05=B514624C` · `06=3AF0A322` · `07=5BB141C4` —— **7/7 两两互异**。

十二 tab 壳基线（`docs/ui/shell/`，同批重拍）：`workbench=F3BE0E66` · `todos=B405DA06` · `schedules=37BEE7DA` · `projects=03D7D40D` · `board=71B77D03` · `bases=296CD0F2` · `docs=BD77BC50` · `chat=7007FC12` · `knowledge=E8036C68` · `mindmap=BB95DF05` · `whiteboard=E98E8DE9` · `approval=BC8BB048` —— **12/12 互异**；与 r15 十一张逐位全异（徽章推进 r16 + 工作台 schema v12/M8 起步 + 新增第十二 tab）；矩阵任一图与壳任一图不同字节。全库 `docs/ui` **150 PNG / 148 互异**，同态组仅 r4 已披露 2 组（`9E5C0C23` / `8397A028`），r16 零新增。

## 目验与取证注记

7 张逐张 `read_image` 目验（中文无乱码、无塌陷）：01 空态三处引导齐备；02 四输入与四类型选项清晰；03 两条待审按倒序可读、#6 抄送提示与提交步骤在场；04 转交后 assignee 由 bob 变 carol、状态仍待审批、时间线两步；05 终态三步与「无可用操作」提示同图可见；06 窄屏十二药丸完整无裁切（首拍第十二枚被裁，定位到后写 `.force-narrow .tab` 覆盖 r12 规则后全矩阵重拍）；07 错误态与历史轮同构。

seed：审批 #5（请假，提交后 pending）+ 审批 #6（报销，提交→转交→通过），经 `POST /api/approvals` / `POST /:id/submit` / `POST /:id/delegate` / `POST /:id/approve` 真写；拍后 `DELETE /api/approvals/5` 与 `/6`，approvals=0，8787/5173/8788/8792 全 free（headless 全程，无可见窗口）。
