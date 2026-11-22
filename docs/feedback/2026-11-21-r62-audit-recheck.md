# r62 · 健壮性审计复验：r61 原注入方法复测（P1×2）

日期：2026-11-22（文件名按任务单钉为 2026-11-21）
审计岗：auditor-r62（独立健壮性审计员；**审计岗不改产品代码 / 不 commit**）
依据：`AGENTS.md` → `docs/plan.md:1245-1254` r62 任务单 → `docs/feedback/2026-11-21-r61-audit.md`（上轮 P1×2 注入步骤 + 数据）→ `docs/feedback/2026-11-21-r62-yanfa.md`（研发声明，只读不信自述）。
方法：**r61 原注入方法**——scratch 库 + 临时 api 端口 8793（`XIEFLOW_DB_PATH` 指向 scratch、`XIEFLOW_MODE=local`、`node --import tsx apps/api/src/server.ts`），第二 SQLite 连接临时建 `BEFORE INSERT … RAISE(ABORT)` 触发器注入中途失败，Node `fetch` 真发 HTTP；并发/批量用真 HTTP 请求。探针脚本一次性、跑完即删。

**总判定：P1×2 全部达标；回归全绿；63/63 真 HTTP 断言通过。**

---

## 一、P1 复测数据对照（r61 原数据 vs r62 复测数据）

### 1.1 P1-1 r35 ICS commit 半态 —— 达标 ✅

| 项 | r61 实测（修复前） | r62 复测（本次） |
|---|---|---|
| 注入手法 | scratch 库第二连接 `TRIGGER RAISE(ABORT)` 打断第 2 条日程 INSERT | 同法：`BEFORE INSERT ON schedules WHEN NEW.title='R62RC-ICS-…B' BEGIN SELECT RAISE(ABORT,'r62rc-ics-injected'); END` |
| HTTP 响应 | 400 | 400（错误体含 `r62rc-ics-injected`，确证由第 2 条注入点触发，非前置校验） |
| 日程数 before | 0 | 0 |
| 日程数 after | **1（leaked：R61-ICS-A）** | **0（before==after，零半态）** |
| 撤注入后重试 | — | 同 ICS 201，`count=2`，两条全落库（证明数据本身合法、非校验短路） |
| 探针清理 | — | DELETE 两条 → 范围内归零 |

结论：`apps/api/src/server.ts:898` 的 `store.createSchedules(plan.drafts)` 单事务批量写真实生效；`packages/db/src/index.ts:562-588` 的 `BEGIN IMMEDIATE` → 逐条 INSERT → `COMMIT` / catch `ROLLBACK` 在真 HTTP + 真注入下把首条一起回滚。r61 的「400 但首条已落库」半态**已关闭**。

### 1.2 P1-2 r47 批量 confirm 半态 —— 达标 ✅

| 项 | r61 实测（修复前） | r62 复测（本次） |
|---|---|---|
| 注入手法 | `[有效callId, "R61-INVALID-CALL-ID"]` | `[c1-m0-tc-1(create_todo,pending), "R62RC-INVALID-CALL-ID"]` |
| HTTP 响应 | 400 | 400（`非法 callId：R62RC-INVALID-CALL-ID`，由全量预校验给出） |
| 待办数 before | 0 | 0 |
| 待办数 after | **1（leaked：R61-CONFIRM-FIRST）** | **0（before==after，零执行）** |
| 有效 callId 状态 | 已 executed（被提前执行） | **仍 pending**，且无回执改写 |
| 非法 callId 回执 | — | 无落库回执 |
| 重复确认 | — | 已处理 callId 再 confirm → **409** `ALREADY_CONFIRMED`，待办数不变（0→0 / 1→1 两次抽查） |
| 正常全有效批次 | — | `[valid]` → 200 executed、待办 +1；**`[valid, valid]` 双项批次 → 200、`resolved.length=2`、待办 +2** |

结论：`apps/api/src/server.ts:2857-2874` 的 `locatedBatch` 全量预校验（存在性 / 归属会话 / `confirmStatus==="pending"` / action 合法性）在首个 `toolRegistry.execute` 之前完整跑完；任一非法即 4xx 且零工具调用、零状态改写。r61 的「400 但首条待办已真写库」半态**已关闭**；重复确认 409 与正常批次执行语义均未回归。

---

## 二、回归核对（单事务未被改坏）

| 项 | 实测 | 判定 |
|---|---|---|
| r7 CSV import 部分失败 | `POST /api/tables/:id/import.csv`（合法行 A + 非法数字行 + 合法行 B）→ **422**，`imported=0`，前后完整记录快照 `JSON.stringify` 逐字节相等（`{"records":[],"total":0,…}`） | ✅ 单事务零半态 |
| r7 CSV import 全合法 | 同表 2 行合法 CSV → **201**，`imported=2`，记录数 0→2 | ✅ 正常路径未坏 |
| r49 backup restore 4xx | `POST /api/backup/restore {confirm:"WRONG"}` → **400**「恢复需要二次确认：confirm 必须为 RESTORE_WORKSPACE」，待办快照逐字节相等 | ✅ 零写 |
| 4xx 抽查 · 坏 ICS | `POST /api/schedules/import.ics {ics:"garbage"}` → 400，日程数 before==after | ✅ 零半态 |
| 4xx 抽查 · 空 callIds | `POST /api/conversations/1/confirm {callIds:[]}` → 400，待办数 before==after | ✅ 零半态 |

---

## 三、工程纪律与收尾

- 全程 headless：`node --import tsx` 启 api + `Start-Process -WindowStyle Hidden`，无可见浏览器 / 控制台窗口；真 HTTP `fetch`，非 mock、非读源码自证。
- scratch 库 `scripts/.tmp-r62-audit-recheck/recheck.db` 为临时库；`data/xieflow.db` 未作数据源、未改动。
- 临时端口 8793 复测后 `Get-NetTCPConnection -LocalPort 8793 -State Listen` 返回 **FREE**；api 进程树 `taskkill /T /F` 收净，`Get-CimInstance Win32_Process` 中 `apps/api/src/server.ts` 进程数 **0**。
- scratch 目录 `scripts/.tmp-r62-audit-recheck/`（含探针、api 日志）已 `Remove-Item -Recurse -Force`，复验 `Test-Path=False`；零 token / 凭据落盘。
- 未改任何产品代码、未改 schema、未 commit / push / tag；研发报告自述只作背景，本判定全部基于独立实测数据。
- 断言合计 **63 PASS / 0 FAIL**（P1-1 15 条、P1-2 30 条、r7 回归 8 条、r49 回归 3 条、4xx 抽查 4 条 + 健康探针等）。

**AUDIT-VERDICT: 通过**
