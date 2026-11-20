# docs/ui/r26 · 通知中心矩阵（9 张）

> 改渲染层 → 新增第十六 tab「通知」+ 顶栏未读徽标 → 十六 tab 壳基线 `docs/ui/shell/` 同批重拍。
> 八张均为确定性 `?shot=` 钉态；真实事件聚合、refresh 幂等、点条跳转由 `scripts/audit-http.ts` 与 headless CDP 全链路锁定。
> 首轮如出现废片（落加载态 / 与历史图同字节）一律全矩阵重拍，废片不入库。
> r26 返工 #1：左栏新增计数口径图例（全部＝总数，各类型＝未读）；08 补顶栏徽标随已读 3→2 递减的画面证据。
> r26 返工 #2（UI U1-1）：09 补 deep-link 目标单图证——真点**非首行**审批通知（第 2/3 行，refId=2），审批页目标行按 id 选中 + `r26fix2-B-target · #2` 详情 + 身份切 `fixerBing` + `view=我的待办` + 底部 URL 条读自真实 `location.href`（`?page=approval&approvalId=2&view=todo`）。01~08 与本目录其它图均未重拍，哈希沿用返工 #1。
> 复拍：`powershell -File scripts\shot.ps1 shots -Round r26 -Shot 09-notif-deeplink-target`（seed 3 张不同审批人 pending → refresh → `scripts/r26-deeplink-shot.mjs` 一次性 headless CDP `Input.dispatchMouseEvent` 真点第 2 行 → 截图 → 删探针；不含壳基线重拍）。

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-notif-empty.png](01-notif-empty.png) | 通知空态：零条消息 + 「造事件后刷新」引导 + 左侧六类筛选 + 计数口径图例 | e2e「r26 空态 seam 在场」；audit「GET /api/notifications 空列表」 |
| [02-notif-unread.png](02-notif-unread.png) | 四条通知，三条未读加粗 + 时间 + 分类图标 + 顶栏未读徽标 3 | e2e「r26 未读加粗 seam」；audit「未读过滤 + summary.unread」 |
| [03-notif-filtered.png](03-notif-filtered.png) | 类型筛选切到「审批」只剩一条审批消息，筛选按钮激活态 | e2e「r26 类型筛选消费 shared 映射」；audit「?type=approval_pending」 |
| [04-notif-read.png](04-notif-read.png) | 点条已读后首条标题取消加粗、未读数由 3 变 2（顶栏钉态徽标固定 3，仅演示列表形态；徽标递减见 08） | e2e「r26 已读落库」；audit「POST /api/notifications/:id/read + summary.unread 真减一」 |
| [05-notif-refreshed.png](05-notif-refreshed.png) | refresh 后成功条「新增 0 条，跳过 3 条（幂等）」 | e2e「r26 重复 refresh 幂等不重复」；audit「重复 refresh created=0」 |
| [06-narrow.png](06-narrow.png) | 488×1000 `?narrow=1`：筛选横排 + 计数口径图例 + 列表单列 + 顶栏「更多 ›」在场 | `force-narrow` seam；逐张 `read_image` 目验 |
| [07-error.png](07-error.png) | r26 通知链路语义化连接失败 + 重试按钮（与 r25/07 不同字节） | `notif-error` PINNED 钉态 |
| [08-notif-badge-decrement.png](08-notif-badge-decrement.png) | 返工#1：首条已读、列表未读 2 / 全部 4，顶栏蓝徽标与「未读 2」同步由 3 递减到 2 | e2e「返工#1 徽标递减钉态」；audit「单条已读 summary.unread 真减一」 |
| [09-notif-deeplink-target.png](09-notif-deeplink-target.png) | 返工#2：真点第 2/3 行审批通知（refId=2）→ 审批页目标行按 id 高亮选中（`data-approval-id=2`）、详情 `r26fix2-B-target · #2`、当前身份自动 `fixerBing`、`我的待办` 视角激活、底栏真实 `location.href` 含 `approvalId=2&view=todo`、顶栏徽标 2；中文无乱码无裁切 | e2e「返工#1 审批通知 deep-link 携带通知 refId=91」+「返工#1 审批 deep-link 钉 todo 视角」+「返工#1 审批页按 deep-link id 一次性定位目标单」+「返工#1 审批页按目标单审批人自动切换身份」；audit「返工#1 通知详情 deepLink.approvalId 精确等于通知 refId」；头部 CDP 真点实测见 §返工 #2 报告 |

## SHA256 自查（9 张互异，与当前文件逐字一致）

- 01=`115D4E3A` · 02=`C8A61ABF` · 03=`A5A9DC6D` · 04=`4DB4B7D0` · 05=`8070012C` · 06=`3DB6BBEA` · 07=`2A4670C5` · 08=`75988AB4` · 09=`A394794A` —— **9/9 互异**。
- shell 十六张哈希见 [docs/ui/shell/README.md](../shell/README.md) 的 R26 当前块（16/16 互异，本轮未重拍）；矩阵↔壳交叉重叠 0。
- 全库 **267 PNG / 265 互异**（同态组仅 r4 已披露 2 组，返工#2 零新增）；8 张矩阵 + shell/notifications 逐张 `read_image` 目验（返工 #1），返工 #2 另对 09 单张 `read_image` 目验：目标行蓝框选中、`r26fix2-B-target · #2` 详情、`fixerBing` 身份、`我的待办` 视角与底栏 URL 条同屏可读，中文无乱码、无裁切、无塌陷。
