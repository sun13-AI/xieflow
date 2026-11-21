# docs/ui/r47 · AI 工具调用确认闸门（七态矩阵，20 tab 壳同批重拍）

> 本轮渲染层有改动（ChatPage 待确认卡 / 确认 / 放弃 / 自动执行开关），按宪法第一条重拍：
> `docs/ui/r47/` 七态矩阵 + `docs/ui/shell/` 二十 tab 壳同批重拍（chat-tab-active 含新开关）。
> 捕获用 `scripts/shot.ps1 all -Round r47`（headless CDP：`scripts/r39-shot.mjs` 一次性进程），全程隐藏窗口、服务收净。
> 七张均为确定性 `?shot=` 钉态（数据形态与 api 落库的 `tool_calls_json` 同构：confirmStatus / preview / callId 同源）；
> 真实闸门行为由 e2e「r47 工具调用确认闸门」与 audit「r47 confirm/discard/4xx」断言锁定，截图只钉 UI 形态。

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-pending-card.png](01-pending-card.png) | 待确认卡：create_todo 写调用「待确认 · 尚未执行」黄卡 + 标题/预览/参数 + 确认执行/放弃按钮 + 自动执行开关（默认关） | e2e「r47 编排·写调用 confirmStatus=pending」；audit「r47 混合对话·写调用 pending」 |
| [02-preview-summary.png](02-preview-summary.png) | 预览摘要：顶部「操作预览：写操作不会立即执行」蓝条 + 待确认卡 + 只读 list_todos 已确认行 | e2e「r47 预览·text 人类可读」；audit「r47 混合对话·pending 带预览摘要」 |
| [03-after-confirm.png](03-after-confirm.png) | 确认后：create_todo 变「已确认」+ 真结果「已创建待办（#47）」落回执，list_todos「已确认」 | e2e「r47 confirm·真建待办落库（+1）」；audit「r47 confirm·真建待办（+1）」 |
| [04-after-discard.png](04-after-discard.png) | 放弃后：create_todo 变「已放弃（未执行，无数据写入）」红标，零写库 | e2e「r47 discard·放弃零写（待办数不变）」；audit「r47 discard·放弃零写」 |
| [05-mixed-call.png](05-mixed-call.png) | 混合调用：同帧上=待确认写卡（pending）、下=只读 list_todos（executed），同屏对照 | e2e「r47 计划·混合意图恰 1 项 pending / 1 项 execute」；audit「r47 混合对话·只读直接执行」 |
| [06-narrow.png](06-narrow.png) | 窄屏 488px：待确认卡纵排完整 + 确认/放弃按钮可达 + 底部导航「更多 ›」 | e2e「r47 截图·矩阵 SHA256 互异」；headless CDP 钉态 |
| [07-error.png](07-error.png) | 错误态：真 4xx 语义「确认失败：非法 callId（该操作已被处理或不属于当前会话）」红条，卡片仍在 | audit「r47 confirm·非法 callId -> 400」+「r47 重复确认 -> 409」 |

## R47 哈希自查（七张互异，与当前文件逐字一致）

<!-- R47_HASHES_BEGIN -->
`01-pending-card=E3A51B09` · `02-preview-summary=EFE71F48` · `03-after-confirm=0573E730` ·
`04-after-discard=0D072DBB` · `05-mixed-call=F42FF250` · `06-narrow=39FFEB9E` · `07-error=C0DD2537` —— **7/7 互异**。
<!-- R47_HASHES_END -->

> 全库 386 PNG / 384 互异（+7 = r47 矩阵新增；同态组仅 r4 已披露 2 组，r47 零新增）。
> 二十 tab 壳同批重拍，r45→r47 壳 changed=9 / same=11（todos / schedules / projects / board / docs / chat /
> approval / org / meetings 变化，其余沿用），按 r25 先例如实披露，不宣称逐位全异；当前块见
> [shell 索引 R47 块](../shell/README.md)。
