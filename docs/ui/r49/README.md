# docs/ui/r49 · 工作区数据备份与恢复（七态矩阵，20 tab 壳同批重拍）

> 本轮渲染层有改动（工作台设置区新增「数据备份与恢复」卡 + 确认对话框），按宪法第一条重拍：
> `docs/ui/r49/` 七态矩阵 + `docs/ui/shell/` 二十 tab 壳同批重拍（workbench-tab-active 含新卡）。
> 捕获用 `scripts/shot.ps1 all -Round r49`（headless CDP：`scripts/r39-shot.mjs` 一次性进程），全程隐藏窗口、服务收净。
> 七张均为确定性 `?shot=` 钉态（表计数/版本/错误文案与 shared 规则 + HTTP 回执同构）；
> 真实备份恢复行为由 e2e「r49 工作区数据备份与恢复」与 audit「r49 备份恢复往返/4xx」断言锁定，截图只钉 UI 形态。

| 截图 | 形态 | 对应断言 |
|---|---|---|
| [01-backup-card.png](01-backup-card.png) | 备份卡空闲态：导出备份 / 选择备份文件 / 校验并预览 / 恢复工作区（未校验前禁用）+ 运行时表不备份提示 | e2e「r49 web·备份卡与确认对话框 seam」；audit「r49 导出 -> 200」 |
| [02-exported.png](02-exported.png) | 导出落盘态：文件名 `xieflow-workspace-backup-…json` + 快照版本 v27 + 备份时间 + 38 表/37 行 | e2e「r49 清单表计数/行计数」；audit「r49 导出带附件下载头」+「清单表计数 = 白名单表数」 |
| [03-file-selected.png](03-file-selected.png) | 选择文件态：文件名回显 + 「点击校验并预览查看将要恢复的内容」引导 | e2e「r49 web·选文件与校验预览 seam」；audit「r49 裸备份对象也可校验」 |
| [04-preview.png](04-preview.png) | 校验预览态：版本/时间/表计数/行计数 + 逐表行数表（todos 8 / projects 2 / documents 3 …）+ 零写入声明 | e2e「r49 校验预览含 todos 表计数」；audit「r49 校验回执 valid=true」 |
| [05-confirm-dialog.png](05-confirm-dialog.png) | 二次确认对话框：覆盖 38 表不可撤销警示 + 勾选确认框 + 确认口令明示 + 取消/确认恢复 | e2e「r49 二次确认：缺省/错拼令牌拒绝」；audit「r49 无二次确认 -> 400」+「错拼确认令牌 -> 400」 |
| [06-narrow.png](06-narrow.png) | 窄屏 488px：备份卡按钮纵排、文件输入可达、底部导航「更多 ›」在场 | e2e「r49 截图·矩阵 SHA256 互异」；headless CDP 钉态 |
| [07-error.png](07-error.png) | 错误态：未知表被拒红条「备份文件含未知表 change_log，已拒绝，未写入任何数据」 | audit「r49 未知表 change_log -> 422」+「r49 事务中 CHECK 违规 -> 400」 |

## R49 矩阵哈希自查（七张互异，与当前文件逐字一致）

<!-- R49_MATRIX_HASHES_BEGIN -->
`01-backup-card=5B094FD2` · `02-exported=691ECF99` · `03-file-selected=7736B45C` ·
`04-preview=D4777712` · `05-confirm-dialog=4308EB36` · `06-narrow=EE2B39FD` · `07-error=B11AE91B` —— **7/7 互异**。
<!-- R49_MATRIX_HASHES_END -->

> 全库 393 PNG / 391 互异（+7 = r49 矩阵新增；同态组仅 r4 已披露 2 组，r49 零新增）。
> 二十 tab 壳同批重拍，r47→r49 壳 changed=9 / same=11（workbench / projects / board / chat / knowledge /
> whiteboard / approval / org / meetings 变化，其余沿用），按 r25 先例如实披露，不宣称逐位全异；当前块见
> [shell 索引 R49 块](../shell/README.md)。
