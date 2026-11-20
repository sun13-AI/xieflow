# docs/ui/r29 · 文档版本历史与回收站截图矩阵（版本侧栏 / 快照预览 / 恢复 / 回收站）

- **轮次**：r29（M10 后功能补强）。改渲染层（文档编辑页加「版本历史」侧栏 + 文档列表加「回收站」入口，**18 tab 数量不变**），按 AGENTS.md 第一条：七张矩阵 + 十八 tab 壳基线**同批重拍**，截图与索引 / 根 README 同一提交。
- **纪律**：全程 headless（`shot.ps1` 的 Edge `--headless=new` + `-WindowStyle Hidden`）；PowerShell 只 ASCII；截图走 `%TEMP%\r29-shot\scratch.db`（仓库 `data/xieflow.db` 只读），七张状态用 `?shot=` 钉态，窄屏用 `?narrow=1` 显式钉态；真实 v1→v2→v3→恢复 v1 生成 v4、软删 / 还原 / 永久删除链路由 e2e + audit HTTP 真断言锁定，页面钉态只呈现可观察形态。零 token、不接实时协同（CRDT 超范围）。
- **复拍命令**：`$env:XIEFLOW_DB_PATH = Join-Path $env:TEMP 'r29-shot\scratch.db'; powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\shot.ps1 all -Round r29`
- **废片处理**：首轮 03（变更摘要）与 04（预览对比）两钉态共用 `previewVersion`，SHA 字节相同（重复证据）；定位后给 03 独立摘要条、04 独立预览面板，并按宪法第一条**全矩阵 7 张 + 十八壳同批重拍**，废片未入库；第二轮把 07 窄屏高度由 1000 提到 1600 让版本侧栏进入首屏，再次全批重拍，最终 7/7、18/18 哈希互异。

| 图 | 形态 | 对应断言 |
|---|---|---|
| [01-versions-empty.png](01-versions-empty.png) | 版本历史空态：文档页三栏、侧栏「还没有历史版本」+ 截图钉态说明，工具栏有「回收站」，编辑器有「存快照 / 版本历史」 | e2e「r29 新文档零版本 / 渲染层 seam」；audit「r29 新文档版本列表零版本」 |
| [02-versions-list.png](02-versions-list.png) | 多版本列表：v4（恢复自 v1）/ v3 / v2 / v1 四版按新版在前，每版带变更摘要 + 预览 / 恢复按钮；正文已回到 v1 内容 | e2e「r29 恢复后历史四版全在」；audit「r29 恢复后四版全在」 |
| [03-version-summary.png](03-version-summary.png) | 变更摘要：侧栏底部绿条高亮 v3「变更摘要：新增 2 行 / 删除 4 行」，列表各版摘要同屏可读 | e2e「r29 v1/v2 摘要由 shared 计算」；audit「r29 v1/v2 note 含增删计数」 |
| [04-version-preview.png](04-version-preview.png) | 预览对比：v4 快照 Markdown 全文 + 「恢复将生成新版本，历史版本不会被覆盖」提示 | e2e「r29 恢复生成新版本不覆盖」；audit「r29 新版本内容逐字等于 v1」 |
| [05-after-restore.png](05-after-restore.png) | 恢复后：蓝条「已恢复到 v1：生成 v4 新版本，v1~v3 历史完整保留」，正文逐字为 v1 内容 | e2e「r29 恢复后全文逐字等于 v1」；audit「r29 恢复后全文逐字等于 v1（真 HTTP）」 |
| [06-trash.png](06-trash.png) | 回收站：弹窗列出软删探针文档（带软删时间）+ 「还原 / 永久删除」；文档列表已排除该项 | e2e「r29 回收站一条 / 还原后列表回原状」；audit「r29 回收站项带 deletedAt / 二次确认」 |
| [07-narrow.png](07-narrow.png) | 488×1600 `?narrow=1`：顶栏折叠 + 文档列表 / 编辑器 / 版本历史侧栏纵排 + 底栏「更多 ›」 | `force-narrow` seam；逐张目验 |
| `docs/ui/shell/` 18 张 | 十八 tab 激活态同批重拍（徽章 r29），文档页空库态含「回收站」按钮 | `Invoke-ShellBaseline`；e2e 逐张复算 |

## SHA256 自查（矩阵 7/7 互异；壳 18/18 互异）

<!-- R29_HASHES_BEGIN -->

- **矩阵 7 张**（亲算 `Get-FileHash -Algorithm SHA256` 前 8 位）：`01=9AAED329` · `02=FB160F1F` · `03=0FFB0220` · `04=DDB65CA6` · `05=30B211D7` · `06=FC32C86A` · `07=FC91B238` —— **7/7 互异**。
- **壳基线 18 张**（亲算）：`workbench=3E816F10` · `todos=DDE2BB52` · `schedules=9284680C` · `projects=E57B124B` · `board=8B4CB776` · `bases=B1393B28` · `docs=66BED781` · `chat=AC1CCC32` · `knowledge=41F1EC55` · `mindmap=0BE3B5FA` · `whiteboard=0B8F7226` · `approval=D19876A4` · `assets=D7244318` · `unit-tasks=B8900858` · `org=7F4F2249` · `notifications=9314B40A` · `reports=159A34BA` · `meetings=A4363E90` —— **18/18 互异**，与 `docs/ui/shell/README.md` 的 R29 当前块逐字一致。
- 矩阵↔壳交叉重叠 **0**；全库 **290 PNG / 288 互异**，同态组仅 r4 已披露 2 组（`9E5C0C23`、`8397A028`），r29 零新增。
<!-- R29_HASHES_END -->

> e2e「r29 七张 PNG SHA256 两两互异」「shell README R29 哈希与实际文件逐字一致」逐张复算锁定本表。逐张 `read_image` 目验 7 矩阵 + shell/docs：中文无乱码、无白屏、无裁切、无塌陷；十八条药丸单行不折行；窄屏三栏纵排与底栏完整；恢复蓝条 / 变更摘要绿条 / 回收站弹窗语义清楚。
