# docs/ui/r26 · 通知中心矩阵（7 张）

> 改渲染层 → 新增第十六 tab「通知」+ 顶栏未读徽标 → 十六 tab 壳基线 `docs/ui/shell/` 同批重拍。
> 七张均为确定性 `?shot=` 钉态；真实事件聚合、refresh 幂等、点条跳转由 `scripts/audit-http.ts` 与 headless CDP 全链路锁定。
> 首轮如出现废片（落加载态 / 与历史图同字节）一律全矩阵重拍，废片不入库。

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-notif-empty.png](01-notif-empty.png) | 通知空态：零条消息 + 「造事件后刷新」引导 + 左侧六类筛选 | e2e「r26 空态 seam 在场」；audit「GET /api/notifications 空列表」 |
| [02-notif-unread.png](02-notif-unread.png) | 四条通知，三条未读加粗 + 时间 + 分类图标 + 顶栏未读徽标 3 | e2e「r26 未读加粗 seam」；audit「未读过滤 + summary.unread」 |
| [03-notif-filtered.png](03-notif-filtered.png) | 类型筛选切到「审批」只剩一条审批消息，筛选按钮激活态 | e2e「r26 类型筛选消费 shared 映射」；audit「?type=approval_pending」 |
| [04-notif-read.png](04-notif-read.png) | 点条已读后首条标题取消加粗、未读数由 3 变 2（顶栏钉态徽标固定 3，仅演示列表形态） | e2e「r26 已读落库」；audit「POST /api/notifications/:id/read + summary.unread 真减一」 |
| [05-notif-refreshed.png](05-notif-refreshed.png) | refresh 后成功条「新增 0 条，跳过 3 条（幂等）」 | e2e「r26 重复 refresh 幂等不重复」；audit「重复 refresh created=0」 |
| [06-narrow.png](06-narrow.png) | 488×1000 `?narrow=1`：筛选横排 + 列表单列 + 顶栏「更多 ›」在场 | `force-narrow` seam；逐张 `read_image` 目验 |
| [07-error.png](07-error.png) | r26 通知链路语义化连接失败 + 重试按钮（与 r25/07 不同字节） | `notif-error` PINNED 钉态 |

## SHA256 自查（7 张互异，与当前文件逐字一致）

- 01=`52950278` · 02=`EA5F9439` · 03=`F8206455` · 04=`BEF8CCB7` · 05=`0C3FD845` · 06=`CE3ABFEF` · 07=`6343C275` —— **7/7 互异**。
- shell 十六张哈希见 [docs/ui/shell/README.md](../shell/README.md) 的 R26 当前块（16/16 互异）；矩阵↔壳交叉重叠 0。
