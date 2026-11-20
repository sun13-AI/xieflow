# docs/ui/r24 · 成员接入审批与物资（7 张 + 十五 tab 壳基线同批重拍）

- 范围：审批发起人/审批人/转交目标与物资保管员/出入库操作人增加「从通讯录选人」弹窗；选中后只**增量**写 member_id 并显示部门徽标，原自由文本输入框完全保留。schema v16→v17 只加四张可空列。
- 边界：老路径（不传 member_id）逐字不变；下面是确定性 `?shot=` 钉态画面证据，真实 CRUD / 4xx / usage 由 e2e + audit-http 真 HTTP 断言锁定，真实用户路径由 headless CDP 全链路背书。
- 断言：`pnpm run test:all` 全绿；e2e **2041**（+89）/ audit **1667**（+85）。变异红相 1 组（resolveAssignee 回落改坏 → 双套件红 → 逐字节还原）见 `docs/feedback/2026-11-19-r24-yanfa.md`。

## 逐图索引

| 截图 | 形态 | 对应断言 / 拍摄方式 |
|---|---|---|
| 01-approval-picker.png | 1280×900 `?page=approval&shot=approval-picker`：审批表单「从通讯录选人」弹窗，两名示例成员 + 搜索框，原自由文本审批人输入框仍在场 | `shot.ps1 shots -Round r24` 钉态；e2e「r24 选人弹窗 seam」 |
| 02-approval-picked.png | 1280×900：选中后审批人输入框自动填通讯录姓名，徽标「李娜（市场部）#12」在场，× 可清除 | `?shot=approval-picked`；e2e「r24 选中后回填 seam」 |
| 03-timeline-badge.png | 1280×900：审批详情步骤时间线两步各自带部门徽标（研发中心 / 市场部），发起人徽标同屏 | `?shot=approval-timeline-badge`；e2e/audit「步骤 member 摘要」 |
| 04-assets-picker.png | 1280×900 `?page=assets&shot=assets-picker`：物资建账表单保管员选人弹窗，原「保管人」自由文本输入框仍在场 | `?shot=assets-picker`；e2e「r24 物资选人 seam」 |
| 05-assets-badge.png | 1280×900：物资**卡片**渲染「行政部」部门徽标（本图无详情画面；详情态证据见 r25/05，原「卡片与详情」措辞已收敛） | `?shot=assets-custodian-badge`；e2e「r24 物资徽标 seam」；audit「物资摘要回带部门名」 |
| 06-narrow.png | 488×1000 `?narrow=1&shot=approval-picker`：选人弹窗在窄屏单列可见，底栏「更多 ›」在场 | `force-narrow` seam；e2e「r24 窄屏 seam」 |
| 07-error.png | 1280×900 `?shot=approval-error`：连接失败错误态 + 重试按钮，与选人态互不混淆 | `?shot=approval-error`；e2e「r24 错误态 seam」 |
| shell/（15 张） | 十五 tab 激活态同批重拍；审批/物资等受影响页出现「从通讯录选人」入口 | `Invoke-ShellBaseline`；哈希与形态见 `docs/ui/shell/README.md` |

## SHA256 自查

矩阵 7 张：`01=B80B1D38` · `02=7AAB1245` · `03=F492358A` · `04=6D67EF40` · `05=02DA5A80` · `06=00B08107` · `07=140F6E28` —— **7/7 互异**；与 shell/ 交叉重叠 0 张。

壳基线 15 张：`workbench=6670358F` · `todos=9DE3AB25` · `schedules=241D4609` · `projects=632CE2E2` · `board=15166FE1` · `bases=D83C38C3` · `docs=0C5266B5` · `chat=F6CAD4EB` · `knowledge=D13E8629` · `mindmap=90A657F6` · `whiteboard=DA9A75AA` · `approval=F0DDDFA5` · `assets=90166EF8` · `unit-tasks=2A81BA59` · `org=870B5A43` —— **15/15 互异**；与 r23 同名字节有 7 张因本轮渲染变化改变，其余像素未变故字节相同（不伪造差异）。

全库 **250 PNG / 248 互异**（同态组仅 r4 已披露 2 组，r24 零新增）；逐张 `read_image` 目验：中文无乱码、无裁切、无塌陷；窄屏 06 可见弹窗与「更多 ›」；壳审批页可见选人入口。

## 拍摄方式（诚实记账）

7 张矩阵 + 15 张壳基线全部由 `shot.ps1` 的一次性 headless Edge 进程拍摄（`--headless=new` + `-WindowStyle Hidden` + `--virtual-time-budget`），0 可见窗口。首轮误用含远端模式的库导致七张同为登录页（哈希仅 3 个），已定位为环境态并用 scratch 库（`XIEFLOW_DB_PATH` 指向 `scripts/.tmp-r24-shot.db`，local 模式）**全矩阵重拍**，废片未入库；拍摄后服务收净、scratch 库删除。选人弹窗里的成员为钉态示例数据，真实持久化与 4xx 由 HTTP/CDP 证据提供，二者不混同。
