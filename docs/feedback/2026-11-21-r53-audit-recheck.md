# r53 · 修复验证复检：r52 原复现步骤重放（P0-1 未关闭 → 打回）

日期：2026-11-21
审计岗：auditor-r53（独立安全审计员；**只读产品代码，不改实现、不 commit**）
依据：`docs/feedback/2026-11-21-r52-audit.md`（P0×2/P1×2/P2×3 原复现步骤）→ `docs/plan.md:1143-1159` r53 任务单与验收标准 2（「原复现步骤重放：全部失败 = 修复有效」）→ `docs/feedback/2026-11-21-r53-yanfa.md`（**只读，不采信自述**）。

**AUDIT-VERDICT: 打回**（P0-1 仍可复现；按验证纪律 2 立即停止，P0-2/P1-1/P1-2/P2-2/P2-3 本轮未继续重放）

---

## 一、实测环境（与 r52 同口径）

- scratch DB：`%TEMP%/xieflow-r53-recheck-*/audit.db`（全新空库，v0 迁移起）；端口 **18787**。
- 进程：`node node_modules/tsx/dist/cli.mjs apps/api/src/server.ts`，两次进程均显式/分别设 `XIEFLOW_MODE=local`（引导）与 `XIEFLOW_MODE=remote`（重放），`XIEFLOW_API_PORT=18787`、`XIEFLOW_DB_PATH=<scratch>/audit.db`。
- 判定只取真实 HTTP 状态码与响应体字段；token 不落盘、输出即脱敏；日志只在 scratch 目录，验后随目录删除。

**引导差异说明**：r52 原步骤 1 是「remote 下匿名注册首个用户得 admin」。该入口已被本次修复关闭，故 admin 只能在 local 模式的同一 scratch 库上按原语义引导（首用户 admin），随后停服务、用**同一 DB + `XIEFLOW_MODE=remote`** 重启再重放其余原步骤。引导结果：`POST /api/auth/register r53_admin` → 201 `role=admin`；登录 200；重启后 `/api/health` → `mode=remote`。

## 二、P0-1 逐条对照（r52 原结果 vs r53 实测）

| 原步骤 | r52 原结果（状态 / 关键字段） | r53 实测（状态 / 关键字段） | 判定 |
|---|---|---|---|
| 匿名 `POST /api/auth/register {"username":"m_anon",...}` | 201 `role=admin`（开放注册） | **403** `{"code":"REGISTER_CLOSED","error":"远端模式禁止公开注册，请联系管理员创建账号"}` | ✅ 已关闭 |
| admin 经 `user:manage` 建 user：`POST /api/auth/register {"username":"m_user",...}` + Bearer admin token | 匿名即可自助注册 201 `role=user` | **201** `{"user":{"id":2,"username":"m_user","role":"user",...}}`；admin permissions 含 `user:manage` | ✅ 符合修复方案 |
| admin `POST /api/documents {"title":"admin-secret-doc"}` | 201 `id=1` | **201** `{"id":1,"title":"admin-secret-doc",...}` | 前置条件成立 |
| user token `GET /api/documents/1` | **200**，返回 admin 文档 | **200** `{"id":1,"title":"admin-secret-doc",...}`（期望 403） | ❌ **仍可复现** |
| user token `DELETE /api/documents/1`（无 body） | **200** `{"deleted":true,"soft":true}`，admin 再 GET → 404 | **200** `{"deleted":true,"soft":true}`；admin GET → **404** `{"error":"文档不存在：1"}`（期望 403） | ❌ **仍可复现，数据已被软删** |

> 探针口径说明：首轮 DELETE 因探针误带 `Content-Type: application/json` 且空 body，Fastify 回 400 `FST_ERR_CTP_EMPTY_JSON_BODY`；去掉该 header 后按 r52 原口径重放，得到上表 200 结果。该 400 是探针伪影，不作为判定依据。

**结论**：r53 只关闭了「匿名自助注册」这一入口；`GET/PATCH/DELETE /api/documents/:id` 等 22 条资源路由在 remote 下仍只做存在性校验，无角色/归属闸门（`apps/api/src/server.ts:444-453` 仅判登录，`:2267-2302` 无 `assertPermission`）。已取得合法 user 身份者仍可跨用户读、软删 admin 文档——与 r52 P0-1 的「零资源归属」核心风险一致，不满足本轮复现步骤给出的「user token GET/DELETE admin 文档应 403」验收标准。

## 三、精确复现步骤（供返工/再复验）

```bash
# 0. 全新 scratch DB + 空闲端口（本机用 18787）
export XIEFLOW_API_PORT=18787 XIEFLOW_DB_PATH=<scratch>/audit.db XIEFLOW_MODE=local
node node_modules/tsx/dist/cli.mjs apps/api/src/server.ts &      # 进程 A
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:18787/api/auth/register \
  -H 'content-type: application/json' -d '{"username":"r53_admin","password":"AuditPass123!"}'   # 201 role=admin
TOKEN_ADMIN=$(curl -s -X POST http://127.0.0.1:18787/api/auth/login \
  -H 'content-type: application/json' -d '{"username":"r53_admin","password":"AuditPass123!"}' | jq -r .token)
kill <pid A>                                                      # 同一 DB 重启
XIEFLOW_MODE=remote node node_modules/tsx/dist/cli.mjs apps/api/src/server.ts &   # 进程 B
# 1. 匿名注册已关闭（此步通过）
curl -s -w ' %{http_code}' -X POST http://127.0.0.1:18787/api/auth/register \
  -H 'content-type: application/json' -d '{"username":"m_anon","password":"AuditPass123!"}'
# -> 403 REGISTER_CLOSED
# 2. admin 建普通 user（此步通过）
curl -s -w ' %{http_code}' -X POST http://127.0.0.1:18787/api/auth/register \
  -H "authorization: Bearer $TOKEN_ADMIN" -H 'content-type: application/json' \
  -d '{"username":"m_user","password":"AuditPass123!"}'           # -> 201 role=user
TOKEN_USER=$(curl -s -X POST http://127.0.0.1:18787/api/auth/login \
  -H 'content-type: application/json' -d '{"username":"m_user","password":"AuditPass123!"}' | jq -r .token)
# 3. admin 建文档
curl -s -X POST http://127.0.0.1:18787/api/documents \
  -H "authorization: Bearer $TOKEN_ADMIN" -H 'content-type: application/json' \
  -d '{"title":"admin-secret-doc"}'                               # -> 201 id=1
# 4. ❌ user 跨用户读：期望 403，实测 200 且返回 admin 文档
curl -s -w ' %{http_code}' http://127.0.0.1:18787/api/documents/1 \
  -H "authorization: Bearer $TOKEN_USER"
# 5. ❌ user 跨用户软删：期望 403，实测 200 {"deleted":true,"soft":true}
curl -s -w ' %{http_code}' -X DELETE http://127.0.0.1:18787/api/documents/1 \
  -H "authorization: Bearer $TOKEN_USER"                          # 不要带空 JSON body header
# 6. admin 回查 -> 404，证明数据确已被删
curl -s -w ' %{http_code}' http://127.0.0.1:18787/api/documents/1 \
  -H "authorization: Bearer $TOKEN_ADMIN"
```

最小修复方向（供 lead 决策，审计岗不改码）：remote 下对资源读写/删除统一加 `assertPermission(user.role, …)`（或按 `members.user_id` 建归属并服务层 `assertCanAccess`），并保证既有断言不回退；仅关闭注册入口不足以关闭 P0-1。

## 四、其余项状态（按纪律中止，未作通过/未通过判定）

| 项 | 本轮状态 | 原因 |
|---|---|---|
| P0-2 备份恢复改 mode / 双进程重启 | **未复验** | 验证纪律 2：P0 项失败即停 |
| P1-1 审批 actor 冒充 | **未复验** | 同上 |
| P1-2 备份导出/恢复 admin 闸门 | **未复验** | 同上 |
| P2-2 settings/health 泄漏订阅 key | **未复验** | 同上 |
| P2-3 物资流水 operator 伪造 | **未复验** | 同上 |
| P2-1 autoExecute | 记账项，本轮不在复现清单 | r53 任务单明确不改 |

## 五、三态纪律与卫生

- **已做并验过**：读取 r52 报告 / r53 任务单 / r53 研发报告；静态确认 remote 钩子无角色闸门、文档路由无 `assertPermission`；scratch 全新库 + 端口 18787 真 HTTP 重放 P0-1 全链（含引导与重启）；首轮探针伪影识别并改正重跑；端口 `Get-NetTCPConnection -LocalPort 18787 -State Listen` = 空；scratch 目录 `xieflow-r53-recheck-*` 已删；`git status --short` 空、HEAD `06e0b44`。
- **已做但没验**：其余五项按纪律未重放；未跑 `test:all`（本轮职责是原步骤重放，不是重跑研发自测）。
- **没做（原因）**：未改产品代码、未补断言、未 commit、未 push、未动 `data/xieflow.db`；探针脚本只在 `%TEMP%`，验后已删；token 输出脱敏且从未写入文件。

---

## 六、续放（auditor-r53b · lead 指令：P0-1 已判未关闭，放行其余五项）

日期：2026-11-21。审计岗：auditor-r53b（独立安全审计员；**只读产品代码，不改实现、不 commit**）。依据：lead 续放指令 → r52 原复现步骤 → 本文件第一~五节（P0-1 已判未关闭，本轮不重放）。口径与 r52/r53 相同：scratch 全新库 + 真实 HTTP，只取状态码与响应体字段，不采信研发自述。

**实测环境**：`%TEMP%/xieflow-r53b-*/audit.db`（全新空库），端口 **18787**。进程 A `XIEFLOW_MODE=local` 引导（`POST /api/auth/mode {mode:"local"}` 将 `server.mode=local` 写入 DB，首用户 admin）；杀净后用**同一 DB + `XIEFLOW_MODE=remote`** 起进程 B 做五项重放；P0-2 另在拒绝恢复后再次杀净、第三次仍以 `XIEFLOW_MODE=remote` 启动做降级探针。token 只在 Node 进程内存中，输出仅打印状态码与字段名，零 token 落盘。

### 续放逐条对照（r52 原结果 vs r53 实测）

| 项 | r52 原结果 | r53 实测 | 判定 |
|---|---|---|---|
| P0-2 恢复篡改 mode + 重启降级 | user token 导出备份 200（38 表）；篡改 `settings.server.mode=local` 后 user restore 200；同 DB + `XIEFLOW_MODE=remote` 重启 → health `mode=local`、匿名 `GET /api/documents` 200 读到数据 | user 导出 **403** `FORBIDDEN`；admin 导出 200（38 表）且已不含 `server.mode` 行；user restore 篡改备份 **403** `FORBIDDEN`，admin restore **422** `errors=["受保护的设置键不得出现在备份中：server.mode"]`；拒绝后内存 `mode=remote`；第三次以 `XIEFLOW_MODE=remote` 重启 → health `mode=remote`、匿名 documents **401**、admin documents 200（文档仍在） | ✅ 已关闭 |
| P1-1 审批 actor 冒充 | user token `POST /api/approvals/1/approve {"actor":"boss"}` → **200 `status=approved`** | 同口径（审批 `currentAssignee=boss`、先按会话提交至 pending）→ **403** `{"code":"ACTOR_FORGED","error":"审批身份必须与登录会话一致"}`，回读仍 `pending` | ✅ 已关闭 |
| P1-2 备份导出/恢复闸门 | user token `GET /api/backup/export` → 200 全量 38 表；user token `POST /api/backup/restore` → 200 `restoredTables=38` | user token 导出 **403** `FORBIDDEN（user:manage）`；user token 恢复（38 表备份 + `confirm=RESTORE_WORKSPACE`）**403** `FORBIDDEN` | ✅ 已关闭 |
| P2-2 settings/health 泄漏订阅 key | admin 生成 key 后匿名 `GET /api/settings` 200 且回显 `calendar_feed_key` 值；health 亦带 settings 明细 | 同轮生成 key（长度 24）后匿名 `GET /api/settings` 与 `GET /api/health` 均 200，公开设置仅 `["last_health_check","server.mode"]`，两响应全文均不含 `calendar_feed_key` 及 key 值 | ✅ 已关闭 |
| P2-3 物资流水 operator 伪造 | `operator` 取 `body.operator`，任意声明值直接落库为审计归属 | user token 带 `operator:"forged-operator"` 入库 → 201，响应与落库回读 `operator=r53b_user`（会话用户），伪造值未生效 | ✅ 已关闭 |

### 逐项证据细节

- **P0-2**：导出快照 `tables.settings` 无 `server.mode` 行（导出过滤生效）；篡改备份在 user 侧被 admin 闸门 403 拦住，在 admin 侧被备份校验 422 拦住且错误点名 `server.mode`；拒绝恢复后 `GET /api/auth/mode` 仍 `remote`（零半态）。第三次进程仍显式 `XIEFLOW_MODE=remote`，尽管 DB 中的 `server.mode=local` 是引导阶段写入的，health 仍报 `remote`，匿名业务路由 401——ENV 优先与双层备份防线均实测成立。
- **P1-1**：admin 建审批 `currentAssignee="boss"`，申请人按会话 actor 提交 → 200 `pending`；随后 user token 冒用 `actor="boss"` 通过 → 403 `ACTOR_FORGED`，审批状态未变为 `approved`。
- **P1-2**：三路由中 export/restore 两条按清单实测均为 403；`validate` 本轮未在续放清单内，未重复实测。
- **P2-2**：订阅 key 由 `/api/feeds/key` 在同轮真实生成，避免「key 不存在所以没泄漏」的假阴性。
- **P2-3**：流水为 `type=in, quantity=1, to=r53b-loc2`，响应 201 且 `operator` 字段为会话用户；admin 回读 `/api/assets/1/transactions` 同样为会话用户。

> 探针伪影说明：首轮 P2-3 因建物资漏传 `location/custodian`、入库流水漏传 `to`，被 `assertValidAssetText` 合法校验拒绝为 400；补齐 r52 等价合法字段后整链重跑，伪影不作为判定依据。

### 三态纪律与卫生（续放）

- **已做并验过**：五项真 HTTP 重放（含三次进程启停、双进程重启、篡改备份的 403/422 与拒绝后零半态）；端口 18787 `Get-NetTCPConnection -State Listen` = 空；`xieflow-r53b-*` scratch 目录与 `%TEMP%` 探针脚本已删；`git status --short` 仅本文件未跟踪（`??`）、产品代码 `git diff --stat` 空；零 token 落盘。
- **已做但没验**：未重跑 `pnpm run test:all`（本轮职责是原复现步骤重放，不是研发自测）；P0-1 按 lead 指令未重放。
- **没做（原因）**：未改产品代码、未补断言、未 commit/push、未动 `data/xieflow.db`。

**结论**：续放五项均关闭；P0-1 仍为未关闭，整体仍不满足 r53 验收标准 2「原复现步骤重放：全部失败 = 修复有效」，须待 P0-1 修复后再统一复验。

AUDIT-VERDICT: 打回
