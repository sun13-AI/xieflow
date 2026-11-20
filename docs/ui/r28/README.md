# docs/ui/r28 · 会议管理截图矩阵（会议室预约 / 冲突检测）

- **轮次**：r28（M10 后功能补强）。改渲染层（新增第十八 tab「会议」+ 左会议室列表 / 中时段网格 / 右预约表单），按 AGENTS.md 第一条：七张矩阵 + 十八 tab 壳基线**同批重拍**，截图与索引/README 同一提交。
- **纪律**：全程 headless（`shot.ps1` 的 Edge `--headless=new` + `-WindowStyle Hidden`）；PowerShell 只 ASCII；截图脚本用 `%TEMP%\r28-shot\scratch.db` 指向 api（仓库 `data/xieflow.db` 只读——该库 `server.mode=remote`，无 scratch 会跳登录页）；七张状态用 `?shot=` 钉态，窄屏用 `?narrow=1` 显式钉态；真实预约 / 409 冲突 / 参会人链路另由 e2e/audit 真 HTTP 断言锁定。明确不接视频会议或外部日历（宪法第六条）。
- **复拍命令**：`$env:XIEFLOW_DB_PATH = Join-Path $env:TEMP 'r28-shot\scratch.db'; powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\shot.ps1 all -Round r28`
- **返工#1 同批重拍**：渲染层修正「建室后自动选中 / 深链回显 / 下拉框与提交 roomId 同源」（`MeetingsPage.tsx` + shared `resolveSelectedRoomId`）→ 按宪法第一条全矩阵 7 张 + 十八 tab 壳基线再次同批重拍，本索引与根 README / shell README 同一提交；02、04 矩阵与 7 张壳的哈希随之更新（其余同路径同态属真实同画面），SHA 复算与逐张目验见下。
- **自曝（废片处理）**：首轮 7+18 张全为空白页（5KB / 同哈希）——`shared/meetings.ts` 曾从 `shared/auth` 继承 `ConflictError`，该模块顶层 `node:crypto` 在浏览器被 Vite externalize 导致整页白屏。定位后改为本模块自定义 `MeetingConflictError`（不引认证模块），全矩阵 + 十八壳同批重拍；第二次发现 05 冲突态钉图缺红条、第三次去掉误导性绿色成功条，每次渲染层改动均全批重拍，废片未入库。

| 图 | 形态 | 对应断言 |
|---|---|---|
| [01-meetings-empty.png](01-meetings-empty.png) | 会议空态：三列骨架 + 三间会议室（含一间停用）+ 空时段网格 + 预约表单 | e2e「r28 可用性空时段 / 渲染层 seam」；audit「r28 清理后本轮会议归零」 |
| [02-meetings-list.png](02-meetings-list.png) | 会议室列表：两间启用 + 一间停用，第一会议室选中蓝框 | e2e「r28 会议室归一与启用判定」；audit「GET /api/rooms 含本轮探针」 |
| [03-meetings-grid.png](03-meetings-grid.png) | 时段网格：09:00–10:00 与 10:00–11:00 两条预约相邻显示（边界相接不冲突） | e2e「r28 边界相接无冲突」；audit「r28 边界相接预约 201」 |
| [04-meetings-form.png](04-meetings-form.png) | 预约表单：标题 / 会议室 / 日期 / 起止 / 组织者 / 通讯录参会人（停用成员禁选） | e2e「r28 参会人去重与停用拒绝」；audit「r28 PUT/POST/DELETE 参会人」 |
| [05-meetings-conflict.png](05-meetings-conflict.png) | 冲突提示：红条明示冲突会议 #11、#12 并提示改时段或换室；**id↔画面映射（钉态数据 SHOT_MEETINGS）**：#11 =「需求评审」09:00–10:00（第一会议室）、#12 =「研发对齐」10:00–11:00（第一会议室），两场边界相接；真实链路 09:30–10:30 同时撞这两场故红条回带两个 id（按 id 升序） | e2e「r28 冲突错误回带冲突会议 id」；audit「r28 409 conflictIds=[…]」 |
| [06-narrow.png](06-narrow.png) | 488×1000 `?narrow=1`：三列纵排 + 底栏「更多 ›」+ 时段网格可滚动 | `force-narrow` seam；逐张目验 |
| [07-error.png](07-error.png) | r28 会议链路语义化连接失败 + 重试（与 r27/07 字节不同） | `meetings-error` PINNED 钉态 |
| `docs/ui/shell/` 18 张 | 十八 tab 激活态同批重拍，新增 `meetings-tab-active.png` | `Invoke-ShellBaseline`；e2e 逐张复算 |

## SHA256 自查（矩阵 7/7 互异；壳 18/18 互异）

<!-- R28_HASHES_BEGIN -->

- **矩阵 7 张**（亲算 `Get-FileHash -Algorithm SHA256` 前 8 位）：`01=133E5C96` · `02=6174C537` · `03=D3C21E26` · `04=0195A958` · `05=F1F002D5` · `06=F6072830` · `07=2F85CBB2` —— **7/7 互异**。
- **壳基线 18 张**（亲算）：`workbench=86946959` · `todos=A7E81B45` · `schedules=EF9A9ECB` · `projects=0FB97731` · `board=65431B25` · `bases=74C1CF5B` · `docs=BC146AC6` · `chat=FECCCED0` · `knowledge=6B79A170` · `mindmap=F51D9431` · `whiteboard=D3F64BC2` · `approval=934928D2` · `assets=C983F943` · `unit-tasks=DA1CA902` · `org=155FA658` · `notifications=EECAB413` · `reports=18010A69` · `meetings=0832E1B9` —— **18/18 互异**，与 `docs/ui/shell/README.md` 的 R28 当前块逐字一致。
- 矩阵↔壳交叉重叠 **0**；全库 **283 PNG / 281 互异**，同态组仅 r4 已披露 2 组（`9E5C0C23`、`8397A028`），r28 零新增。
<!-- R28_HASHES_END -->

> e2e「r28 七张 PNG SHA256 两两互异」「shell README R28 哈希与实际文件逐字一致」逐张复算锁定本表。逐张 `read_image` 目验 7 矩阵 + shell/meetings：中文无乱码、无裁切、无塌陷、十八条药丸单行不折行。
