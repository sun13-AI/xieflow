# docs/ui/r35 · 日历 ICS 导出与订阅矩阵（导出 / 落盘 / 订阅 / 导入预览 / 成功 / 窄屏 / 错误态）

- 轮次：r35（M10 后功能补强）。渲染层改动：日程页加「导出 .ics」菜单、落盘回执、订阅设置卡（生成/复制 URL）、导入预览表与确认写入、错误红条；**18 tab 数量不变**，十八 tab 壳基线因日程页变化同批重拍。
- 拍法：`node scripts/run-ps1.js scripts/shot.ps1 shots -Round r35`（headless Edge 一次性进程，服务 `up/down` 收净；DB 走 `scripts/.tmp-r35shot/shot.db` scratch 库，仓库 `data/xieflow.db` 未作 DB_PATH）。七态用 `?shot=ics-*` 确定性钉态，与真实交互共用同一组件；运行时真值由 e2e / HTTP audit / CDP 全链路背书。
- 首用全链路：`node scripts/r35-firstuse-cdp.mjs --browser "<Edge 路径>" --web-port 5173 --api-port 8787`（headless CDP 真点导出→查看内容→预览→确认→reload）。

<!-- R35_HASHES_BEGIN -->
`01-ics-export-menu=DEF260B8` · `02-ics-saved=509440DD` · `03-ics-feed-card=03218775` ·
`04-ics-import-preview=FF4C3C95` · `05-ics-import-success=DD24F464` · `06-ics-narrow=E87AA291` ·
`07-ics-error=F87DB836` —— **7/7 互异**。
<!-- R35_HASHES_END -->

| 图 | 形态 | 对应断言 / 证据 |
|---|---|---|
| [01-ics-export-menu.png](docs/ui/r35/01-ics-export-menu.png) | 导出菜单：本月日程 / 待办截止两个真下载按钮 | e2e「r35 web·导出菜单 seam 在场」；audit「GET export.ics -> 200 / text/calendar」 |
| [02-ics-saved.png](docs/ui/r35/02-ics-saved.png) | 落盘佐证：文件名 + 事件数 + 字节数绿条 | audit「下载文件名带范围」「回读 VEVENT 字段」；CDP「saved receipt」 |
| [03-ics-feed-card.png](docs/ui/r35/03-ics-feed-card.png) | 订阅设置卡：本地随机 key + 订阅 URL + 复制 | audit「key 存 settings」「正确 key 订阅源 200 / 错 key 404」 |
| [04-ics-import-preview.png](docs/ui/r35/04-ics-import-preview.png) | 导入预览：解析事件数 + 标题/日期/时间/重复表 | e2e「r35 web·导入预览 seam」；audit「预览草稿逐项还原 / 零写入」 |
| [05-ics-import-success.png](docs/ui/r35/05-ics-import-success.png) | 确认写入成功绿条 | audit「确认写入 +1 / 字段一致」；CDP「reload 不丢」 |
| [06-ics-narrow.png](docs/ui/r35/06-ics-narrow.png) | 488×1100 `?narrow=1` 钉态：导入面板完整无溢出 | 矩阵↔壳 SHA 零重叠；窄屏按钮全宽 |
| [07-ics-error.png](docs/ui/r35/07-ics-error.png) | 坏 ICS 错误红条（对应真 400 文案） | audit「4xx·坏 ICS -> 400」「错误文案含 ICS」 |

- 全库 **327 PNG / 325 互异**（r34 为 320/318，+7 = 本轮矩阵新增；18 壳为替换同路径不增总数）；同态组仅 r4 已披露 2 组，r35 零新增。
- 矩阵↔壳 SHA256 交叉重叠 0；七张矩阵 + 十八张壳逐张 `read_image` 目验：无登录页 / 空白 / 乱码 / 裁切 / 塌陷；继承形态「窄容器页第 18 枚会议药丸右缘被截」仍见 5 张窄容器壳，属 r31~r34 已记账项，非 r35 回归。
