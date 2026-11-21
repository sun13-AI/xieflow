# r54 · 修复验证复检：P0-1 原复现步骤重放（P0-1 关闭 → 通过）

日期：2026-11-21
审计岗：auditor-r54（独立安全审计员；**只读产品代码与审计文档，不改实现、不 commit**）
依据：`docs/feedback/2026-11-21-r52-audit.md` P0-1 原复现步骤 → `docs/feedback/2026-11-21-r53-audit-recheck.md`（上轮 P0-1 未关闭记录）→ `docs/plan.md:1162-1173` r54 任务单（lead 重定方案）。**不采信研发自述；判定只取真实 HTTP 状态码与响应体字段。**

**AUDIT-VERDICT: 通过**（P0-1 关闭；顺带抽查 r53 其余五项中的 P1-1、P2-2 两项均无回归）

---

## 一、实测环境与方法

- 探针：一次性 Node ESM 脚本，全程真实 `fetch` HTTP；状态码与白名单字段打印，token 仅存进程内存、**零 token 落盘**，服务 stdio 全部忽略。
- 远端重放：`%TEMP%/xieflow-r54-audit/remote/audit.db`（全新空库），端口 **18795**（独立于 r53 的 18787 与研发用 8788/18791/18799）。
- 单机回归：另起 `%TEMP%/xieflow-r54-audit/local/audit.db`（全新空库），端口 **18796**。
- 进程：`node node_modules/tsx/dist/cli.mjs apps/api/src/server.ts`，两次分别显式设 `XIEFLOW_MODE=local` / `XIEFLOW_MODE=remote`，配套 `XIEFLOW_API_PORT` 与 `XIEFLOW_DB_PATH`；remote 阶段复用 local 引导的**同一 DB**。

**引导差异说明（与 r52 原步骤 1 的必要差别）**：r52 原步骤是「remote 下匿名注册首用户得 admin」，该入口已被 r53 关闭。故按 r53 已确立的同口径，在 local 模式的新 scratch 库上以公开注册引导首个 admin（`role=admin`），登录取 token，停服后用同一 DB + `XIEFLOW_MODE=remote` 重启再重放；全程**未调用模式切换写库**，`GET /api/health` 实测 `mode=remote`，证明闸门前提成立。remote 下匿名注册仍为 403 `REGISTER_CLOSED`，admin 建普通 user 能力保留。

探针总计 **52 条断言，0 失败**（`PROBE-SUMMARY total=52 failures=0`，进程 exit 0）。

## 二、P0-1 原复现步骤逐条对照（r52 / r53 原结果 vs r54 实测）

| 步骤 | r52 原结果 | r53 实测 | r54 实测（本轮） | 期望 | 判定 |
|---|---|---|---|---|---|
| 引导：admin 注册 + 登录（local 同语义引导） | 201 `role=admin`（remote 匿名） | 403 关入口后 local 引导 201 | local 注册 **201 `role=admin`**、登录 **200**，`permissions` 含 `user:manage` | admin 身份可用 | ✅ |
| remote 匿名注册基线 | 201 | 403 `REGISTER_CLOSED` | **403 `REGISTER_CLOSED`** | 403 | ✅ 未回退 |
| 1. admin 登录取 token | 200 | 200 | **200**，token 仅在内存 | 200 | ✅ |
| 2. admin 建文档 | 201 `id=1` | 201 `id=1` | **201 `id=1`**，title `r54-admin-secret-doc` | 201 id=1 | ✅ |
| 3. admin 经 `user:manage` 建普通 user + 登录 | 匿名自助注册 201 `role=user` | 201 `role=user` | admin 建号 **201 `role=user`**，user 登录 **200**；`/api/auth/me` 探针 **200** | 201 / 200 | ✅ |
| 4. user token `GET /api/documents/1` | **200** | **200** | **403 `{"code":"FORBIDDEN"}`** | 403 | ✅ **已关闭** |
| 5. user token `DELETE /api/documents/1`（无 body / 无 JSON header） | **200** `{"deleted":true,"soft":true}`，admin 再 GET 404 | **200**，admin GET 404 | **403 `{"code":"FORBIDDEN"}`** | 403 | ✅ **已关闭** |
| 6. admin 回查 `GET /api/documents/1` | 404（已软删） | 404（已软删） | **200**，标题逐字仍为 `r54-admin-secret-doc`；`GET /api/documents/trash` **200** 且列表中**无 id=1** | 200 且未软删 | ✅ **已关闭** |
| 7a. user token `GET /api/todos/<admin 真实 id>` | — | 200（同类越权） | **403 `FORBIDDEN`**（admin 先经 `POST /api/todos` 201 造真 todo） | 403 | ✅ |
| 7b. user token `GET /api/cards/<admin 真实 board card id>`（board 族） | — | 200（同类越权） | **403 `FORBIDDEN`**（admin 先建 project 201 / 默认列 200 / card 201） | 403 | ✅ |
| 7c. user token `GET /api/backup/export` | 200（P1-2） | 403（r53b 已关） | **403 `FORBIDDEN`** | 403 | ✅ |
| 8. 另起 local scratch，匿名 `GET /api/documents` | 200（单机语义） | 200 | **200**，响应 `{documents:[...]}` 数组在场，health `mode=local` | 200 单机语义保留 | ✅ **零回归** |

> 探针伪影规避与 r53 一致：DELETE 不携带 `Content-Type: application/json`、不带空 JSON body，避免 Fastify `FST_ERR_CTP_EMPTY_JSON_BODY` 400 被误判为闸门生效。本轮未出现该伪影。

**P0-1 结论**：r54 的 remote 统一闸门实测生效——已认证普通 user 对 admin 文档的读、软删均被 403 `FORBIDDEN` 拦下，admin 回读 200 且文档不在回收站；单机匿名语义不受影响。r53 判定的「关入口 ≠ 消除越权」已补齐，P0-1 满足 r54 验收标准。

## 三、顺带抽查 r53 其余五项中的 2 项（确认未被 r54 破坏）

| 项 | r52 原结果 | r54 实测 | 判定 |
|---|---|---|---|
| **P1-1** 审批 actor 冒充 | user token `POST /api/approvals/1/approve {"actor":"boss"}` → 200 `approved` | admin 会话造审批（`currentAssignee="boss"`）→ 201；按会话 actor 提交 → 200 `pending`；**同一 admin 会话**伪造 `actor:"boss"` 通过 → **403 `ACTOR_FORGED`**；回读仍 `pending`。特意用 admin 会话，排除 r54 统一闸门先行拦截造成的假通过，直接命中 r53 路由级修复 | ✅ 未回归 |
| **P2-2** settings/health 泄漏订阅 key | 匿名 GET 两路径 200 且回显 `calendar_feed_key` | admin `POST /api/feeds/key` → 200 真实生成 24 位 key（值不打印）；随后匿名 `GET /api/settings` / `GET /api/health` 均 **200**，两响应全文**均不含** `calendar_feed_key` 字段名与 key 值 | ✅ 未回归 |

抽查方法说明：P1-1 以 admin 会话携带伪造 actor，是为了绕开 r54 的「非 admin 403」层，直接验证 r53 的会话派生逻辑仍然在；P2-2 在同轮真实生成 key，避免「key 不存在所以没泄漏」的假阴性。

## 四、三态纪律与卫生

- **已做并验过**：读取 r52 P0-1 原步骤 / r53 未关闭记录 / plan.md r54 任务单；静态核对 `server.ts:398-473` 的公开路径、强保护路径与统一 admin 闸门后设计探针（**静态只读，不采信研发报告**）；全新 scratch 双库 + 独立端口 18795/18796 真 HTTP 重放全链（local 引导 → remote 重启 → 越权读删 → admin 回读 → 三业务路由 → 单机回归 → 两项顺查）；52/52 断言通过；端口 `Get-NetTCPConnection -LocalPort 18795,18796 -State Listen` 均为 0 监听；`Get-CimInstance Win32_Process` 中 scratch 相关 node 进程 0；scratch 目录 `xieflow-r54-audit` 路径校验后递归删除，`Test-Path=False`；写本报告前 `git status --short` 空、HEAD `af4804d`，报告落盘后仅该文件为未跟踪（`?? docs/feedback/2026-11-21-r54-audit-recheck.md`），产品代码 `git diff` 空。
- **已做但没验**：其余三项（P0-2 备份恢复改 mode、P1-2 备份导出/恢复闸门、P2-3 物资 operator 伪造）按本轮「抽查 2 项即可」口径未重放；P2-1 `autoExecute` 为记账项、不在复现清单；未跑 `pnpm run test:all`（本轮职责是原复现步骤重放，不是研发自测）；无渲染层改动，未做浏览器/截图类验证。
- **没做（原因）**：未改产品代码、未补断言、未 commit / push / 打 tag / 发版、未动 `data/xieflow.db`——审计岗职责边界与危险区纪律。

**零 token 落盘证据**：探针脚本内无 token 字面量，token 只由登录响应写入 Node 进程内存变量；输出仅打印状态码、错误码与白名单字段（role/id/title/status/mode 等），从不打印 token 值；服务端 stdio `ignore`，无日志落盘；验后 scratch 目录已删除。

---

AUDIT-VERDICT: 通过
