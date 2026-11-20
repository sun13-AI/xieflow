# docs/ui/r35 · 日历 ICS 导出与订阅矩阵（导出 / 落盘 / 订阅 / 导入预览 / 成功 / 窄屏 / 错误态）

- 轮次：r35（M10 后功能补强）。渲染层改动：日程页加「导出 .ics」菜单、落盘回执、订阅设置卡（生成/复制 URL）、导入预览表与确认写入、错误红条；**18 tab 数量不变**，十八 tab 壳基线因日程页变化同批重拍。
- 拍法：`node scripts/run-ps1.js scripts/shot.ps1 shots -Round r35`（headless Edge 一次性进程，服务 `up/down` 收净；DB 走 `scripts/.tmp-r35shot/shot.db` scratch 库，仓库 `data/xieflow.db` 未作 DB_PATH）。七态用 `?shot=ics-*` 确定性钉态，与真实交互共用同一组件；运行时真值由 e2e / HTTP audit / CDP 全链路背书。
- **返工 #1 往返 seam（可复拍）**：先 `XIEFLOW_DB_PATH` 指 scratch 库起服务，再 `node scripts/r35-rework-shot.mjs --browser "<Edge 路径>" --web-port 5173 --api-port 8787 --out-dir docs/ui/r35`（headless CDP，20 项断言全绿）：HTTP seed **固定 2 条不重复日程**（需求评审会 2026-11-10 10:00–11:00 / 每日站会 2026-11-11 09:00–09:30，日期取当前月）→ 真点「导出本月日程 (.ics)」落盘 → **直接读取下载目录里那份 .ics 文件**（941 字节 / 2 个 VEVENT，回执文件名 `xieflow-schedules-<月首>-<月末>.ics` 与磁盘文件名、字节数逐字相等）→ 把**同一份文件的字节**粘进导入 textarea → 真点「解析预览」/「确认写入」→ 逐张截 02 / 04 / 05；07 用去标签后的干净文案钉态。脚本自带浏览器进程与临时目录收净，不碰用户库。
- 首用全链路：`node scripts/r35-firstuse-cdp.mjs --browser "<Edge 路径>" --web-port 5173 --api-port 8787`（headless CDP 真点导出→查看内容→预览→确认→reload）。

<!-- R35_HASHES_BEGIN -->
`01-ics-export-menu=DEF260B8` · `02-ics-saved=4D6FF9AA` · `03-ics-feed-card=03218775` ·
`04-ics-import-preview=829F87E4` · `05-ics-import-success=D65D12D3` · `06-ics-narrow=E87AA291` ·
`07-ics-error=56133B31` —— **7/7 互异**（02/04/05/07 为返工 #1 真往返重拍，其余四张沿用 r35 首轮）。
<!-- R35_HASHES_END -->

| 图 | 形态 | 对应断言 / 证据 |
|---|---|---|
| [01-ics-export-menu.png](docs/ui/r35/01-ics-export-menu.png) | 导出菜单：本月日程 / 待办截止两个真下载按钮 | e2e「r35 web·导出菜单 seam 在场」；audit「GET export.ics -> 200 / text/calendar」 |
| [02-ics-saved.png](docs/ui/r35/02-ics-saved.png) | 真落盘回执：文件名 `xieflow-schedules-2026-11-01-2026-11-30.ics` + **2 条事件** / 941 字节；下方网格可见 10 日「需求评审会」、11 日「每日站会」两枚 chip | audit「下载文件名带范围」「回读 VEVENT 字段」；CDP「saved receipt 文件名/字节 == 磁盘落盘文件」；**= 04 的导入源** |
| [03-ics-feed-card.png](docs/ui/r35/03-ics-feed-card.png) | 订阅设置卡：本地随机 key + 订阅 URL + 复制 | audit「key 存 settings」「正确 key 订阅源 200 / 错 key 404」；「复制 URL」实现只写剪贴板、**无可见 toast 态**，故无反馈态截图（返工 U3-2 图注闭合） |
| [04-ics-import-preview.png](docs/ui/r35/04-ics-import-preview.png) | 导入预览：**02 落盘文件 = 04 导入源**；textarea 同屏可见真实 ICS 片段 `BEGIN:VCALENDAR` / `VERSION:2.0` / `PRODID:-//XieFlow//Calendar//CN` / `CALSCALE:GREGORIAN`（非占位）；「解析到 **2 条事件**」表与 02 逐字段对应：需求评审会 2026-11-10 10:00–11:00、每日站会 2026-11-11 09:00–09:30，与 02 网格同标题/同日期 | e2e「r35 web·导入预览 seam」；audit「预览草稿逐项还原 / 零写入」；CDP「textarea 字节 == 02 下载文件（仅 DOM CRLF→LF 归一）」 |
| [05-ics-import-success.png](docs/ui/r35/05-ics-import-success.png) | 确认写入成功绿条「已成功导入 2 条日程」；同屏网格**非空态**，11-10 / 11-11 各有两枚同名 chip（2 枚种子 + 2 枚导入，真点后 `load()` 刷新） | audit「确认写入 +1 / 字段一致」；CDP「success banner + reload 不丢 + 网格无『本月暂无日程』」 |
| [06-ics-narrow.png](docs/ui/r35/06-ics-narrow.png) | 488×1100 `?narrow=1` 钉态：导入面板完整无溢出 | 矩阵↔壳 SHA 零重叠；窄屏按钮全宽 |
| [07-ics-error.png](docs/ui/r35/07-ics-error.png) | 坏 ICS 错误红条：`ICS 解析失败：缺少 VCALENDAR 头尾，请粘贴完整 .ics 文件`（**无 audit「坏 ICS -> 400」内部标签**，审计对应关系只写在本图注） | audit「4xx·坏 ICS -> 400」「错误文案含 ICS」；CDP「可见文案无 audit/400」 |

- 全库 **327 PNG / 325 互异**（r34 为 320/318，+7 = r35 首轮矩阵新增；返工 #1 为 02/04/05/07 同路径重拍，**不增总数**；18 壳为替换同路径亦不增总数）；同态组仅 r4 已披露 2 组，r35 零新增。
- 矩阵↔壳 SHA256 交叉重叠 0；七张矩阵 + 十八张壳逐张 `read_image` 目验：无登录页 / 空白 / 乱码 / 裁切 / 塌陷；返工 #1 的 02/04/05/07 四张另经真往返 CDP 逐张目验（02 回执 ↔ 04 textarea+预览表同标题/同日期/同 2 条；05 网格非空；07 文案无内部标签）。继承形态「窄容器页第 18 枚会议药丸右缘被截」仍见 5 张窄容器壳，属 r31~r34 已记账项，非 r35 回归。
