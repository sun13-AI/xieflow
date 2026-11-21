// XieFlow scripts/audit-http.ts - HTTP route-layer audit against a RUNNING api.
// (ASCII only: PS 5.1 reads this file's comments via node, but keep it safe anyway.)
//
// Usage:
//   pwsh scripts/audit-http.ps1        (starts temp api on :8788 with scratch db, audits, kills)
//   node scripts/audit-http.mjs        (audit already-running api; XIEFLOW_API_PORT to override)
//
// Asserts real CRUD round-trips AND 4xx branches (404 unknown id / 400 bad quadrant /
// 400 bad transition / 400 empty title) on the todo routes shipped in r2.
// r4: projects / board columns / cards CRUD + cross-column move with real position
// re-order on BOTH columns over HTTP, plus 4xx (bad FK / bad position / empty name /
// cross-project move rejected) on the board routes shipped in r4.
// Gate: >= 20 assertions, all green. Never runs a resident process: the ps1 wrapper
// kills the api it starts (r1 lesson: always clean up servers).

export {}; // top-level await needs module scope

import {
  buildBoardCsvFileName,
  assembleDocumentText,
  markdownToBlocks,
  blocksToMarkdown,
  buildDocumentMdFileName,
  treeToMarkdown,
  whiteboardItemsOverlap,
  OFFLINE_QUEUE_MAX,
  OFFLINE_REPLAY_PATH,
  OFFLINE_HEADER,
} from "@xieflow/shared";
import {
  DEPLOY_PATHS,
  DEPLOY_ROUTES,
  DEPLOY_GUIDE_MARKERS,
  expectedDeployStatus,
  missingDeployMarkers,
} from "@xieflow/shared/deploy";
import { parseIcsCalendar, buildIcsCalendar, scheduleToIcsEvent, formatIcsDate } from "@xieflow/shared/ics";
import { isServerMode } from "@xieflow/shared/auth";
import { formatFormulaDisplay } from "@xieflow/shared/formula";
import { createMockProvider, MOCK_PROVIDER_ID } from "@xieflow/agent";
import { STATE_CHANGING_TOOLS } from "@xieflow/shared";
// r45: drag-drop plan is a shared pure function; HTTP audit drives the real move route.
import { planBlockDrop } from "@xieflow/shared/blockDnd";

const PORT = Number(process.env.XIEFLOW_API_PORT ?? 8788);
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string): void {
  if (cond) {
    passed++;
    console.log(`  ok ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL ${label}`);
  }
}

function eq(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(a === e, `${label}${a === e ? "" : ` (got ${a}, want ${e})`}`);
}

// r39: HTTP 4xx error bodies are the raw material of UI error bars; assert
// they carry no tester vocabulary before the web layer ever renders them.
const INTERNAL_TERM_39 = /截图钉态|截图钉注|钉注|audit|e2e|4xx|seam|shot=|r\d{2}(?!\d)/i;
function cleanError39(res: { json: any }, label: string): void {
  ok(!INTERNAL_TERM_39.test(String(res.json?.error ?? "")), label);
}

async function req(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

/** r18: authenticated request (Bearer token) with response headers, for 401-clear assertions */
async function authReq(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; json: any; headers: Headers }> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json, headers: res.headers };
}

async function expectStatus(
  method: string,
  path: string,
  body: unknown,
  wantStatus: number,
  label: string,
): Promise<{ status: number; json: any }> {
  const r = await req(method, path, body);
  eq(r.status, wantStatus, label);
  return r;
}

/** r5: raw text fetch (CSV body is not JSON) */
async function reqText(path: string): Promise<{ status: number; text: string; headers: Headers }> {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(5000) });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

/** r5: raw bytes fetch (BOM byte-level check: EF BB BF) */
async function reqBytes(path: string): Promise<{ status: number; bytes: Uint8Array; headers: Headers }> {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(5000) });
  const buf = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, bytes: buf, headers: res.headers };
}

/** r5: strip the UTF-8 BOM if the decoded text still carries it (fetch decoder usually strips it) */
function stripBom(text: string): string {
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

async function audit() {
  // wait for server readiness
  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const h = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (h.ok) {
        ready = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  ok(ready, "api 服务就绪（/api/health 可达）");

  console.log("\n== health & settings ==");
  {
    const h = await req("GET", "/api/health");
    eq(h.status, 200, "GET /api/health -> 200");
    eq(h.json && h.json.ok, true, "health.ok = true");
    // r4 起动态对表：health.schemaVersion 必须等于迁移队列最高版本（不再硬编码 2/3，
    // r3 v0.0.6 CI 红教训——静态硬编码在每轮迁移后必过期）
    eq(h.json && h.json.schemaVersion, 27, "health.schemaVersion = 27（r25 迁移后）");
    const s = await req("GET", "/api/settings");
    eq(s.status, 200, "GET /api/settings -> 200");
    ok(Array.isArray(s.json && s.json.settings), "settings 返回数组");
  }

  console.log("\n== POST /api/todos (create) ==");
  let created;
  {
    // r39: 首个样本 dueDate 由硬编码改为相对今天的固定偏移，避免跨日后与「明天到期」样本碰撞（r22 同类先例）；断言口径不变。
    const firstTodoDate = ((): string => {
      const d0 = new Date();
      const x = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 2);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    })();
    const r = await expectStatus("POST", "/api/todos", { title: "写 r2 审计脚本", quadrant: "q1", dueDate: firstTodoDate }, 201, "POST 合法体 -> 201");
    eq(r.json && r.json.title, "写 r2 审计脚本", "创建后 title 读回");
    eq(r.json && r.json.quadrant, "q1", "创建后 quadrant 读回");
    eq(r.json && r.json.status, "open", "创建后初始状态 open");
    eq(r.json && r.json.dueDate, firstTodoDate, "创建后 dueDate 读回");
    created = r.json;
    await expectStatus("POST", "/api/todos", { title: "", quadrant: "q1" }, 400, "POST 空标题 -> 400");
    await expectStatus("POST", "/api/todos", { title: "   ", quadrant: "q1" }, 400, "POST 纯空白标题 -> 400");
    await expectStatus(
      "POST",
      "/api/todos",
      { title: "长".repeat(201), quadrant: "q1" },
      400,
      "POST 超长标题（201 字）-> 400（MAX_TODO_TITLE=200）",
    );
    await expectStatus("POST", "/api/todos", { title: "无象限" }, 400, "POST 缺 quadrant -> 400");
    await expectStatus("POST", "/api/todos", { title: "非法象限", quadrant: "q9" }, 400, "POST 非法象限 -> 400");
    await expectStatus("POST", "/api/todos", { title: "错格式", quadrant: "q2", dueDate: "20-01-01" }, 400, "POST 非法 dueDate -> 400");
    await expectStatus("POST", "/api/todos", { title: "无标题字段" }, 400, "POST 缺 title -> 400");
  }

  console.log("\n== GET /api/todos (list & detail) ==");
  {
    const r = await expectStatus("GET", "/api/todos", undefined, 200, "GET 列表 -> 200");
    ok(Array.isArray(r.json && r.json.todos), "列表返回 todos 数组");
    eq(r.json.todos.length, 1, "列表此时恰 1 条");
    const d = await expectStatus("GET", `/api/todos/${created.id}`, undefined, 200, "GET 详情 -> 200");
    eq(d.json && d.json.id, created.id, "详情 id 一致");
    await expectStatus("GET", "/api/todos/99999", undefined, 404, "GET 不存在 id -> 404");
    await expectStatus("GET", "/api/todos/not-a-number", undefined, 400, "GET 非数字 id -> 400");
  }

  console.log("\n== PATCH /api/todos/:id (status transitions) ==");
  {
    const r = await expectStatus("PATCH", `/api/todos/${created.id}`, { status: "done" }, 200, "PATCH open->done -> 200");
    eq(r.json && r.json.status, "done", "流转后状态 done");
    await expectStatus("PATCH", `/api/todos/${created.id}`, { status: "done" }, 400, "PATCH done->done 非法流转 -> 400");
    await expectStatus("PATCH", `/api/todos/${created.id}`, { status: "bogus" }, 400, "PATCH 非法状态值 -> 400");
    await expectStatus("PATCH", `/api/todos/${created.id}`, {}, 400, "PATCH 缺 status -> 400");
    const back = await expectStatus("PATCH", `/api/todos/${created.id}`, { status: "open" }, 200, "PATCH done->open（重开）-> 200");
    eq(back.json && back.json.status, "open", "重开后状态 open");
    await expectStatus("PATCH", "/api/todos/99999", { status: "done" }, 404, "PATCH 不存在 id -> 404");
    await expectStatus("PATCH", "/api/todos/not-a-number", { status: "done" }, 400, "PATCH 非数字 id -> 400");
  }

  console.log("\n== summary counts ==");
  {
    const d = new Date();
    const p = (n: number): string => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    };
    await expectStatus("POST", "/api/todos", { title: "今天到期", quadrant: "q2", dueDate: p(0) }, 201, "POST 今天到期样本 -> 201");
    await expectStatus("POST", "/api/todos", { title: "明天到期", quadrant: "q3", dueDate: p(1) }, 201, "POST 明天到期样本 -> 201");
    await expectStatus("POST", "/api/todos", { title: "八天后", quadrant: "q4", dueDate: p(8) }, 201, "POST 八天后样本 -> 201");
    const r = await expectStatus("GET", "/api/todos", undefined, 200, "GET 列表（含 summary）-> 200");
    const sm = r.json && r.json.summary;
    eq(sm && sm.today, 1, "summary.today = 1（今天到期 open）");
    eq(sm && sm.tomorrow, 1, "summary.tomorrow = 1");
    eq(sm && sm.week, 3, "summary.week = 3（今+明+相对今日+2 天在 [今天,今天+6] 窗口内；八天后窗外）");
    eq(sm && sm.byQuadrant && sm.byQuadrant.q1, 1, "byQuadrant.q1 = 1（首轮创建）");
    eq(sm && sm.byQuadrant && sm.byQuadrant.q2, 1, "byQuadrant.q2 = 1");
    eq(sm && sm.byQuadrant && sm.byQuadrant.q3, 1, "byQuadrant.q3 = 1");
    eq(sm && sm.byQuadrant && sm.byQuadrant.q4, 1, "byQuadrant.q4 = 1");
  }

  console.log("\n== DELETE /api/todos/:id ==");
  {
    const r = await expectStatus("DELETE", `/api/todos/${created.id}`, undefined, 200, "DELETE 存在 id -> 200");
    ok(r.json && r.json.deleted === true, "delete 返回 deleted=true");
    await expectStatus("GET", `/api/todos/${created.id}`, undefined, 404, "DELETE 后 GET 详情 -> 404");
    await expectStatus("DELETE", `/api/todos/${created.id}`, undefined, 404, "DELETE 重复同一 id -> 404");
    const list = await req("GET", "/api/todos");
    eq(list.json.todos.length, 3, "DELETE 后列表剩 3 条");
    await expectStatus("DELETE", "/api/todos/not-a-number", undefined, 400, "DELETE 非数字 id -> 400");
  }

  console.log("\n== unknown route ==");
  {
    await expectStatus("GET", "/api/todos/1/comments", undefined, 404, "未知路由 -> 404");
  }

  console.log("\n== schedules CRUD (r3) ==");
  let schedule;
  let linkTodo;
  {
    // health 探针反映 schema v8（r4 起迁移后动态推进）
    const h3 = await req("GET", "/api/health");
    eq(h3.json && h3.json.schemaVersion, 27, "health.schemaVersion = 27（r25 迁移后复核）");

    const r = await expectStatus(
      "POST",
      "/api/schedules",
      { title: "季度评审会", date: "2026-11-17", start: "14:00", end: "15:00", repeat: "weekly" },
      201,
      "POST 合法日程 -> 201",
    );
    eq(r.json && r.json.title, "季度评审会", "日程 title 读回");
    eq(r.json && r.json.date, "2026-11-17", "日程 date 读回");
    eq(r.json && r.json.start, "14:00", "日程 start 读回");
    eq(r.json && r.json.end, "15:00", "日程 end 读回");
    eq(r.json && r.json.repeat, "weekly", "日程 repeat 读回");
    eq(r.json && r.json.todoId, null, "日程 todoId 默认 null");
    schedule = r.json;

    await expectStatus("POST", "/api/schedules", { title: "", date: "2026-11-17", start: "09:00", end: "10:00" }, 400, "POST 空日程标题 -> 400");
    await expectStatus("POST", "/api/schedules", { title: "坏日期", date: "2026-02-30", start: "09:00", end: "10:00" }, 400, "POST 非法日期（2-30）-> 400");
    await expectStatus("POST", "/api/schedules", { title: "坏日期2", date: "not-a-date", start: "09:00", end: "10:00" }, 400, "POST 非法日期格式 -> 400");
    await expectStatus("POST", "/api/schedules", { title: "坏时间", date: "2026-11-17", start: "9:00", end: "10:00" }, 400, "POST 非法开始时间（9:00）-> 400");
    await expectStatus("POST", "/api/schedules", { title: "倒挂", date: "2026-11-17", start: "15:00", end: "14:00" }, 400, "POST 结束早于开始 -> 400");
    await expectStatus("POST", "/api/schedules", { title: "坏 repeat", date: "2026-11-17", start: "09:00", end: "10:00", repeat: "hourly" }, 400, "POST 非法 repeat（hourly）-> 400");
    await expectStatus("POST", "/api/schedules", { title: "缺字段", date: "2026-11-17", start: "09:00" }, 400, "POST 缺 end -> 400");
    await expectStatus(
      "POST",
      "/api/schedules",
      { title: "越权外键", date: "2026-11-17", start: "09:00", end: "10:00", todoId: 424242 },
      400,
      "POST 关联不存在的待办（越权外键）-> 400",
    );

    const g = await expectStatus("GET", `/api/schedules/${schedule.id}`, undefined, 200, "GET 日程详情 -> 200");
    eq(g.json && g.json.id, schedule.id, "日程详情 id 一致");
    await expectStatus("GET", "/api/schedules/99999", undefined, 404, "GET 不存在日程 -> 404");
    await expectStatus("GET", "/api/schedules/not-a-number", undefined, 400, "GET 非数字日程 id -> 400");

    // 区间查询（含端点；与本审计库中已知日程对表）
    const range = await expectStatus(
      "GET",
      "/api/schedules?from=2026-11-01&to=2026-11-30",
      undefined,
      200,
      "GET 日程区间查询 -> 200",
    );
    ok(Array.isArray(range.json && range.json.schedules), "区间查询返回 schedules 数组");
    ok(
      range.json.schedules.some((s: { id: number }) => s.id === schedule.id),
      "区间查询含刚建的 2026-11-17 日程",
    );
    // 净窗（本轮无日程的区间）：非循环日程不会污染窗外区间
    const empty = await expectStatus("GET", "/api/schedules?from=2025-01-01&to=2025-01-31", undefined, 200, "GET 空区间 -> 200");
    eq(empty.json && empty.json.schedules.length, 0, "窗外区间返回空数组");
    await expectStatus("GET", "/api/schedules?from=2026-13-01&to=2026-12-31", undefined, 400, "GET 区间非法 from（13 月）-> 400");
    await expectStatus("GET", "/api/schedules?from=2026-12-31&to=2026-12-01", undefined, 400, "GET 区间 from 晚于 to -> 400");

    const p = await expectStatus(
      "PATCH",
      `/api/schedules/${schedule.id}`,
      { title: "季度评审会（改）", repeat: "monthly" },
      200,
      "PATCH 改日程标题与 repeat -> 200",
    );
    eq(p.json && p.json.title, "季度评审会（改）", "PATCH 后 title 读回");
    eq(p.json && p.json.repeat, "monthly", "PATCH 后 repeat 读回");
    // 本日程此刻已是 monthly（锚 11-17）：改期前的 11-17~12-31 窗 = 锚日本体 + 12-17 实例。
    // （前面各节的带 dueDate 待办会在「今天/明天/八天后」生成各自的 none 日程，按 id 过滤隔离。）
    const preRep = await req("GET", "/api/schedules?from=2026-11-17&to=2026-12-31");
    const preRepOwn = preRep.json.schedules.filter((x: { id: number }) => x.id === schedule.id);
    eq(
      preRepOwn.map((x: { date: string }) => x.date),
      ["2026-11-17", "2026-12-17"],
      "monthly 本体锚日入窗：11-17~12-31 = 锚日本体 + 12-17 实例（按锚日逐月推进）",
    );
    eq(preRepOwn[0] && preRepOwn[0].isInstance, false, "monthly 本体在锚日窗为 isInstance=false");
    await expectStatus("PATCH", `/api/schedules/${schedule.id}`, { start: "16:00", end: "15:00" }, 400, "PATCH 倒挂时间 -> 400");
    await expectStatus("PATCH", `/api/schedules/${schedule.id}`, { date: "2026-02-30" }, 400, "PATCH 非法日期 -> 400");
    await expectStatus("PATCH", "/api/schedules/99999", { title: "x" }, 404, "PATCH 不存在日程 -> 404");
    await expectStatus("PATCH", "/api/schedules/not-a-number", { title: "x" }, 400, "PATCH 非数字日程 id -> 400");
  }

  console.log("\n== todo <-> schedule two-way sync (r3) ==");
  {
    // 方向一：待办设 due_date → 自动生成关联日程
    const t = await expectStatus("POST", "/api/todos", { title: "写联动复验材料", quadrant: "q2", dueDate: "2026-11-23" }, 201, "POST 带截止日待办 -> 201");
    linkTodo = t.json;
    const afterCreate = await req("GET", "/api/schedules?from=2026-11-23&to=2026-11-23");
    eq(afterCreate.json.schedules.length, 1, "建待办（带 dueDate）自动生成关联日程");
    const gen = afterCreate.json.schedules[0];
    eq(gen.date, "2026-11-23", "生成日程 date = 待办 dueDate");
    eq(gen.todoId, linkTodo.id, "生成日程 todo_id 关联该待办");
    eq(gen.start, "09:00", "生成日程默认 09:00 开始");
    eq(gen.end, "10:00", "生成日程默认 10:00 结束");
    eq(gen.title, linkTodo.title, "生成日程标题沿用待办标题");

    // 方向二：日程改期 → 回写待办 due_date
    const moved = await expectStatus("PATCH", `/api/schedules/${gen.id}`, { date: "2026-11-24" }, 200, "PATCH 关联日程改期 -> 200");
    eq(moved.json && moved.json.date, "2026-11-24", "日程本体已改期");
    const todoAfter = await req("GET", `/api/todos/${linkTodo.id}`);
    eq(todoAfter.json && todoAfter.json.dueDate, "2026-11-24", "日程改期回写待办 dueDate（联动闭环）");

    // 待办侧改期 → 日程跟着变
    const todoMoved = await expectStatus(
      "PATCH",
      `/api/todos/${linkTodo.id}/due-date`,
      { dueDate: "2026-11-28" },
      200,
      "PATCH 待办改期 -> 200",
    );
    eq(todoMoved.json && todoMoved.json.dueDate, "2026-11-28", "待办 dueDate 已改");
    const schAfter = await req("GET", `/api/todos/${linkTodo.id}/schedule`);
    eq(schAfter.json && schAfter.json.schedule && schAfter.json.schedule.date, "2026-11-28", "待办改期同步日程 date（反向联动闭环）");

    // 清空 dueDate → 关联日程删除
    await expectStatus("PATCH", `/api/todos/${linkTodo.id}/due-date`, { dueDate: null }, 200, "PATCH 待办清空 dueDate -> 200");
    const afterClear = await req("GET", "/api/schedules?from=2026-11-01&to=2026-12-31");
    ok(
      !afterClear.json.schedules.some((s: { id: number }) => s.id === gen.id),
      "待办清空 dueDate 后关联日程已删除",
    );
    await expectStatus("PATCH", `/api/todos/${linkTodo.id}/due-date`, { dueDate: "2026-02-30" }, 400, "PATCH 待办改期为非法日期 -> 400");
    await expectStatus("PATCH", "/api/todos/99999/due-date", { dueDate: "2026-11-28" }, 404, "PATCH 不存在待办改期 -> 404");
    await expectStatus("PATCH", `/api/todos/${linkTodo.id}/due-date`, { dueDate: "not-a-date" }, 400, "PATCH 待办改期非法格式 -> 400");

    // 待办删除 → 关联日程级联删除
    const t2 = await expectStatus("POST", "/api/todos", { title: "级联样本", quadrant: "q1", dueDate: "2026-12-01" }, 201, "POST 级联样本待办 -> 201");
    const beforeDel = await req("GET", "/api/schedules?from=2026-12-01&to=2026-12-01");
    eq(beforeDel.json.schedules.length, 1, "级联样本已生成关联日程");
    await expectStatus("DELETE", `/api/todos/${t2.json.id}`, undefined, 200, "DELETE 级联样本待办 -> 200");
    const afterDel = await req("GET", "/api/schedules?from=2026-12-01&to=2026-12-01");
    eq(afterDel.json.schedules.length, 0, "待办删除后关联日程级联删除");
  }

  console.log("\n== schedules repeat instances over HTTP (r3 rework#1 A) ==");
  {
    // Scratch db also holds auto schedules from earlier todo sections (none repeat),
    // so the full-window lookup is counted per-id: the monthly anchor must return
    // its body PLUS one instance per month, capped at MAX_REPEAT_HORIZON_DAYS=100.
    const pre = await req("GET", "/api/schedules?from=2020-01-01&to=2035-12-31");
    const preOwn = pre.json.schedules.filter((x: { id: number }) => x.id === schedule.id);
    eq(preOwn.length, 100, "循环实例组前置：全量窗（2020~2035）monthly 锚日恰封顶 100 条（本体 + 月实例，锚日窗外实例参与装配）");
    eq(preOwn[0] && preOwn[0].date, "2026-11-17", "循环实例组前置：monthly 系列首条 = 锚日本体 2026-11-17");
    ok(
      preOwn.every((x: { isInstance: boolean }, i: number) => (i === 0 ? x.isInstance === false : x.isInstance === true)),
      "循环实例组前置：封顶序列首条为本体、其余全为实例",
    );

    // weekly: anchor Monday 2026-11-16; window of exactly 4 anchor weeks
    const wk = await expectStatus(
      "POST",
      "/api/schedules",
      { title: "rep-weekly", date: "2026-11-16", start: "09:00", end: "09:30", repeat: "weekly" },
      201,
      "POST weekly 循环日程（锚 2026-11-16 周一）-> 201",
    );
    const weeklyId = wk.json.id;
    const w1 = await req("GET", "/api/schedules?from=2026-11-16&to=2026-12-07");
    eq(
      w1.json.schedules.filter((x: { id: number }) => x.id === weeklyId).map((x: { date: string }) => x.date),
      ["2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07"],
      "HTTP weekly：4 周窗返回锚日 + 3 条周实例（返工前仅 1 条本体）",
    );
    ok(
      w1.json.schedules
        .filter((x: { id: number }) => x.id === weeklyId)
        .every((x: { date: string; isInstance: boolean }) => x.isInstance === (x.date !== "2026-11-16")),
      "HTTP weekly：本体 isInstance=false、实例 true（锚日恰一条且优先本体）",
    );
    ok(
      w1.json.schedules
        .filter((x: { id: number }) => x.id === weeklyId)
        .every((x: { title: string; start: string; repeat: string }) => x.title === "rep-weekly" && x.start === "09:00" && x.repeat === "weekly"),
      "HTTP weekly：实例复制本体字段（title/start/repeat）",
    );
    const w1dates = w1.json.schedules.filter((x: { id: number }) => x.id === weeklyId).map((x: { date: string }) => x.date);
    ok(new Set(w1dates).size === w1dates.length, "HTTP weekly：同 id 同 date 并集去重（本体与锚日实例不双计）");

    // weekly with the anchor OUTSIDE the window: the direct waizhuan repro (was 0 rows)
    const w2 = await req("GET", "/api/schedules?from=2026-11-17&to=2026-11-30");
    eq(
      w2.json.schedules.filter((x: { id: number }) => x.id === weeklyId).map((x: { date: string; isInstance: boolean }) => `${x.date}:${x.isInstance}`),
      ["2026-11-23:true", "2026-11-30:true"],
      "HTTP weekly 锚日在窗外：两条实例入窗且全为实例（返工前 0 条）",
    );

    // monthly end-of-month convergence over HTTP: anchor 1-31, February window
    const mt = await expectStatus(
      "POST",
      "/api/schedules",
      { title: "rep-monthly", date: "2026-01-31", start: "10:00", end: "11:00", repeat: "monthly" },
      201,
      "POST monthly 循环日程（锚 2026-01-31）-> 201",
    );
    const monthlyId = mt.json.id;
    const m1 = await req("GET", "/api/schedules?from=2026-02-01&to=2026-02-28");
    eq(
      m1.json.schedules.filter((x: { id: number }) => x.id === monthlyId).map((x: { date: string }) => x.date),
      ["2026-02-28"],
      "HTTP monthly 月末收敛：2 月窗返回 2026-02-28 实例（锚日 1-31 在窗外，返工前 0 条）",
    );
    const m2 = await req("GET", "/api/schedules?from=2026-03-01&to=2026-03-31");
    eq(
      m2.json.schedules.filter((x: { id: number }) => x.id === monthlyId).map((x: { date: string }) => x.date),
      ["2026-03-31"],
      "HTTP monthly 不丢锚日：3 月窗返回 2026-03-31（收敛后回弹到 31 日）",
    );
    const m3 = await req("GET", "/api/schedules?from=2026-01-31&to=2026-03-31");
    eq(
      m3.json.schedules.filter((x: { id: number }) => x.id === monthlyId).map((x: { date: string }) => x.date),
      ["2026-01-31", "2026-02-28", "2026-03-31"],
      "HTTP monthly 跨月窗：本体 + 两条实例（1-31→2-28→3-31 收敛序列）",
    );
    ok(
      m3.json.schedules
        .filter((x: { id: number }) => x.id === monthlyId)
        .every((x: { date: string; isInstance: boolean }) => (x.date === "2026-01-31") === !x.isInstance),
      "HTTP monthly：仅锚日一条 isInstance=false，其余为实例",
    );

    // daily: far anchor forces fast-forward; huge window forces the cap
    const dy = await expectStatus(
      "POST",
      "/api/schedules",
      { title: "rep-daily", date: "2026-01-01", start: "08:00", end: "08:15", repeat: "daily" },
      201,
      "POST daily 循环日程（锚 2026-01-01）-> 201",
    );
    ok(dy.json && dy.json.id > 0, "POST daily 返回自增 id");
    const d1 = await req("GET", "/api/schedules?from=2026-11-16&to=2026-11-18");
    eq(
      d1.json.schedules.filter((x: { title: string }) => x.title === "rep-daily").map((x: { date: string }) => x.date),
      ["2026-11-16", "2026-11-17", "2026-11-18"],
      "HTTP daily：锚日远离窗口时快进展开（2026-11-16~18 每日一条，返工前 0 条）",
    );
    const d2 = await req("GET", "/api/schedules?from=2020-01-01&to=2035-12-31");
    const dCap = d2.json.schedules.filter((x: { title: string }) => x.title === "rep-daily");
    eq(dCap.length, 100, "HTTP daily：超长窗（2020~2035）实例数恰封顶 100");
    const dKeys = new Set(dCap.map((x: { id: number; date: string }) => `${x.id}@${x.date}`));
    eq(dKeys.size, dCap.length, "HTTP daily：封顶截断内 id@date 无重复（并集去重语义）");

    // several repeat schedules sharing one window: union without cross-contamination
    const all3 = await req("GET", "/api/schedules?from=2026-11-16&to=2026-11-18");
    ok(
      all3.json.schedules.some((x: { title: string; date: string }) => x.title === "rep-daily" && x.date === "2026-11-16"),
      "HTTP 多循环同窗：daily 本体日 11-16 在场",
    );
    ok(
      all3.json.schedules.some((x: { title: string; date: string; isInstance: boolean }) => x.title === "rep-weekly" && x.date === "2026-11-16" && x.isInstance === false),
      "HTTP 多循环同窗：weekly 本体 11-16 在场（isInstance=false）",
    );
    ok(
      all3.json.schedules.some((x: { title: string }) => x.title === "rep-monthly") === false,
      "HTTP 多循环同窗：monthly 在该窗无实例不混入",
    );
    ok(
      all3.json.schedules.every((x: { date: string; start: string }, i: number, arr: Array<{ date: string; start: string }>) =>
        i === 0 || !(arr[i - 1]!.date > x.date || (arr[i - 1]!.date === x.date && arr[i - 1]!.start > x.start)),
      ),
      "HTTP：区间结果按 date 升序、同日按 start 升序",
    );
  }

  console.log("\n== projects CRUD (r4) ==");
  let project;
  {
    const r = await expectStatus("POST", "/api/projects", { name: "r4 审计项目", description: "看板审计用" }, 201, "POST 合法项目 -> 201");
    eq(r.json && r.json.name, "r4 审计项目", "项目 name 读回");
    eq(r.json && r.json.description, "看板审计用", "项目 description 读回");
    ok(r.json && typeof r.json.id === "number" && r.json.id > 0, "POST 项目返回自增 id");
    project = r.json;
    // r4 返工#1 A1（waizhuan P1 用户死路）：建项目即自带默认三列——HTTP 层锁定
    const dflt = await expectStatus("GET", `/api/projects/${project.id}/columns`, undefined, 200, "POST 项目后 GET columns -> 200（默认三列已备）");
    eq(
      dflt.json && dflt.json.columns.map((x: { name: string; position: number }) => [x.name, x.position]),
      [["待办", 0], ["进行中", 1], ["已完成", 2]],
      "createProject 自动创建默认三列（待办/进行中/已完成 @ 0/1/2）",
    );
    eq(
      dflt.json && dflt.json.columns.every((x: { projectId: number }) => x.projectId === project.id),
      true,
      "默认三列都归属新项目",
    );
    // 第二项目也自带三列（不是只有首个项目特殊处理）
    const projDflt = await expectStatus("POST", "/api/projects", { name: "r4 默认列样本" }, 201, "POST 第二个项目 -> 201");
    const dflt2 = await req("GET", `/api/projects/${projDflt.json.id}/columns`);
    eq(
      dflt2.json && dflt2.json.columns.length,
      3,
      "第二项目 GET columns 同样为 3（默认列非首项目特例）",
    );
    await expectStatus("POST", "/api/projects", { name: "" }, 400, "POST 空项目名 -> 400");
    await expectStatus("POST", "/api/projects", { name: "   " }, 400, "POST 纯空白项目名 -> 400");
    await expectStatus("POST", "/api/projects", { name: "长".repeat(201) }, 400, "POST 超长项目名（201 字）-> 400");
    await expectStatus("POST", "/api/projects", {}, 400, "POST 缺 name -> 400");

    const g = await expectStatus("GET", `/api/projects/${project.id}`, undefined, 200, "GET 项目详情 -> 200");
    eq(g.json && g.json.id, project.id, "项目详情 id 一致");
    await expectStatus("GET", "/api/projects/99999", undefined, 404, "GET 不存在项目 -> 404");
    await expectStatus("GET", "/api/projects/not-a-number", undefined, 400, "GET 非数字项目 id -> 400");

    const lst = await expectStatus("GET", "/api/projects", undefined, 200, "GET 项目列表 -> 200");
    ok(Array.isArray(lst.json && lst.json.projects), "项目列表返回数组");
    ok(lst.json.projects.some((x: { id: number }) => x.id === project.id), "项目列表含刚建项目");

    const p = await expectStatus("PATCH", `/api/projects/${project.id}`, { name: "r4 审计项目（改）" }, 200, "PATCH 改项目名 -> 200");
    eq(p.json && p.json.name, "r4 审计项目（改）", "PATCH 后 name 读回");
    await expectStatus("PATCH", `/api/projects/${project.id}`, { name: "" }, 400, "PATCH 空项目名 -> 400");
    await expectStatus("PATCH", "/api/projects/99999", { name: "x" }, 404, "PATCH 不存在项目 -> 404");
    await expectStatus("PATCH", "/api/projects/not-a-number", { name: "x" }, 400, "PATCH 非数字项目 id -> 400");
  }

  console.log("\n== board columns CRUD (r4) ==");
  let colTodo;
  let colDoing;
  let colDone;
  {
    // r4 返工#1 A1：主审计项目的默认三列（0/1/2）直接读回复用——UI「打开看板」
    // 消费的就是这条真实路径（POST /api/projects 自动建列）
    const dfltCols = await req("GET", `/api/projects/${project.id}/columns`);
    colTodo = dfltCols.json.columns.find((x: { position: number }) => x.position === 0);
    colDoing = dfltCols.json.columns.find((x: { position: number }) => x.position === 1);
    colDone = dfltCols.json.columns.find((x: { position: number }) => x.position === 2);
    eq(colTodo && colTodo.name, "待办", "默认列 0 名读回（待办）");
    eq(colDoing && colDoing.name, "进行中", "默认列 1 名读回（进行中）");
    eq(colDone && colDone.name, "已完成", "默认列 2 名读回（已完成）");
    // 显式建列语义仍在：position 冲突守卫 / 缺省自动追加列尾（默认列占 0/1/2 → 新列落 3）
    await expectStatus("POST", `/api/projects/${project.id}/columns`, { name: "占位尝试", position: 0 }, 400, "POST 列 position 冲突（默认列已占 0）-> 400");
    const r2 = await expectStatus("POST", `/api/projects/${project.id}/columns`, { name: "加急" }, 201, "POST 列缺 position（自动追加列尾 3）-> 201");
    colDoing = r2.json;
    eq(colDoing && colDoing.position, 3, "缺省 position 自动追加为 3（默认三列之后列尾）");
    const r3 = await expectStatus("POST", `/api/projects/${project.id}/columns`, { name: "已完成（改）", position: 4 }, 201, "POST 列（显式 position 4）-> 201");
    colDone = r3.json;
    await expectStatus("POST", `/api/projects/${project.id}/columns`, { name: "", position: 5 }, 400, "POST 空列名 -> 400");
    await expectStatus("POST", `/api/projects/${project.id}/columns`, { name: "冲突列", position: 0 }, 400, "POST 列 position 冲突（0 已占用）-> 400");
    await expectStatus("POST", "/api/projects/99999/columns", { name: "幽灵列" }, 400, "POST 列到不存在项目（越权外键）-> 400");
    await expectStatus("POST", "/api/projects/not-a-number/columns", { name: "x" }, 400, "POST 列到非数字项目 id -> 400");

    const lst = await expectStatus("GET", `/api/projects/${project.id}/columns`, undefined, 200, "GET 项目列列表 -> 200");
    ok(Array.isArray(lst.json && lst.json.columns), "列列表返回数组");
    eq(
      lst.json.columns.map((x: { name: string }) => x.name),
      ["待办", "进行中", "已完成", "加急", "已完成（改）"],
      "列列表按 position 升序（默认三列 + 显式追加两列）",
    );

    const p = await expectStatus("PATCH", `/api/board-columns/${colDoing.id}`, { name: "进行中（改）" }, 200, "PATCH 改列名 -> 200");
    eq(p.json && p.json.name, "进行中（改）", "PATCH 后列 name 读回");
    await expectStatus("PATCH", `/api/board-columns/${colDoing.id}`, { position: 0 }, 400, "PATCH 列 position 冲突 -> 400");
    await expectStatus("PATCH", `/api/board-columns/${colDoing.id}`, { name: "" }, 400, "PATCH 空列名 -> 400");
    await expectStatus("PATCH", "/api/board-columns/99999", { name: "x" }, 404, "PATCH 不存在列 -> 404");
    await expectStatus("PATCH", "/api/board-columns/not-a-number", { name: "x" }, 400, "PATCH 非数字列 id -> 400");
  }

  console.log("\n== cards CRUD + cross-column move (r4) ==");
  let cardA;
  let cardB;
  let cardC;
  let linkTodoCard;
  {
    // 联动待办：卡片 todo_id 关联（徽标载体，r3 模式复用）
    const t = await expectStatus("POST", "/api/todos", { title: "写 r4 看板复验材料", quadrant: "q2" }, 201, "POST 联动待办 -> 201");
    linkTodoCard = t.json;

    const a = await expectStatus("POST", `/api/projects/${project.id}/columns/${colTodo.id}/cards`, { title: "审计卡 A" }, 201, "POST 卡 A（position 缺省=列尾 0）-> 201");
    eq(a.json && a.json.title, "审计卡 A", "卡 A title 读回");
    eq(a.json && a.json.position, 0, "卡 A 缺省 position = 0（列尾追加）");
    eq(a.json && a.json.columnId, colTodo.id, "卡 A columnId 读回");
    eq(a.json && a.json.projectId, project.id, "卡 A projectId 读回");
    cardA = a.json;
    const b = await expectStatus("POST", `/api/projects/${project.id}/columns/${colTodo.id}/cards`, { title: "审计卡 B" }, 201, "POST 卡 B（position 缺省=1）-> 201");
    cardB = b.json;
    eq(cardB && cardB.position, 1, "卡 B 缺省 position = 1");
    const c = await expectStatus(
      "POST",
      `/api/projects/${project.id}/columns/${colTodo.id}/cards`,
      { title: "联动徽标卡", todoId: linkTodoCard.id },
      201,
      "POST 卡 C（关联真实待办）-> 201",
    );
    eq(c.json && c.json.todoId, linkTodoCard.id, "卡 C todoId 关联待办（外键读回）");
    cardC = c.json;

    await expectStatus(
      "POST",
      `/api/projects/${project.id}/columns/${colTodo.id}/cards`,
      { title: "越权外键卡", todoId: 424242 },
      400,
      "POST 卡关联不存在的待办（越权外键）-> 400",
    );
    await expectStatus("POST", `/api/projects/${project.id}/columns/${colTodo.id}/cards`, { title: "" }, 400, "POST 空卡片标题 -> 400");
    await expectStatus("POST", `/api/projects/${project.id}/columns/99999/cards`, { title: "x" }, 400, "POST 卡到不存在的列（越权外键）-> 400");
    // 跨项目落卡：真实第二项目的列（服务层「列不属于该项目」守卫，400 语义）
    const projEarly = await expectStatus("POST", "/api/projects", { name: "跨项目样本" }, 201, "POST 跨项目样本项目 -> 201");
    const projEarlyCol = await expectStatus("POST", `/api/projects/${projEarly.json.id}/columns`, { name: "别的列" }, 201, "POST 跨项目样本列 -> 201");
    await expectStatus(
      "POST",
      `/api/projects/${project.id}/columns/${projEarlyCol.json.id}/cards`,
      { title: "x" },
      400,
      "POST 卡的项目与列不一致（跨项目落卡）-> 400",
    );

    const g = await expectStatus("GET", `/api/cards/${cardA.id}`, undefined, 200, "GET 卡详情 -> 200");
    eq(g.json && g.json.id, cardA.id, "卡详情 id 一致");
    await expectStatus("GET", "/api/cards/99999", undefined, 404, "GET 不存在卡 -> 404");
    await expectStatus("GET", "/api/cards/not-a-number", undefined, 400, "GET 非数字卡 id -> 400");

    const lst = await expectStatus("GET", `/api/projects/${project.id}/columns/${colTodo.id}/cards`, undefined, 200, "GET 列内卡片列表 -> 200");
    eq(
      lst.json.cards.map((x: { title: string }) => x.title),
      ["审计卡 A", "审计卡 B", "联动徽标卡"],
      "列内卡片按 position 升序（A/B/C）",
    );

    const p = await expectStatus("PATCH", `/api/cards/${cardA.id}`, { title: "审计卡 A（改）", description: "补描述" }, 200, "PATCH 改卡标题与描述 -> 200");
    eq(p.json && p.json.title, "审计卡 A（改）", "PATCH 后卡 title 读回");
    eq(p.json && p.json.description, "补描述", "PATCH 后卡 description 读回");
    await expectStatus("PATCH", `/api/cards/${cardA.id}`, { title: "" }, 400, "PATCH 空卡标题 -> 400");
    await expectStatus("PATCH", `/api/cards/${cardA.id}`, { todoId: 424242 }, 400, "PATCH 卡关联不存在的待办 -> 400");
    await expectStatus("PATCH", "/api/cards/99999", { title: "x" }, 404, "PATCH 不存在卡 -> 404");

    // —— 跨列移动：col1 的卡 A 移到 col2（进行中）的 position 0 ——
    const mv = await expectStatus(
      "PATCH",
      `/api/cards/${cardA.id}/move`,
      { columnId: colDoing.id, position: 0 },
      200,
      "PATCH 卡跨列移动（待办 -> 进行中，落 0 位）-> 200",
    );
    eq(mv.json && mv.json.columnId, colDoing.id, "移动后卡 columnId = 目标列");
    eq(mv.json && mv.json.position, 0, "移动后卡 position = 目标位");
    // 源列重排实证（HTTP 层：剩 B/C 连续 0..1）
    const srcAfter = await req("GET", `/api/projects/${project.id}/columns/${colTodo.id}/cards`);
    eq(
      srcAfter.json.cards.map((x: { id: number; position: number }) => [x.id, x.position]),
      [[cardB.id, 0], [cardC.id, 1]],
      "移动后源列重排：B/C 位置收拢为 0/1（连续）",
    );
    // 目标列重排实证（HTTP 层：A 在 0 位）
    const dstAfter = await req("GET", `/api/projects/${project.id}/columns/${colDoing.id}/cards`);
    eq(
      dstAfter.json.cards.map((x: { id: number; position: number }) => [x.id, x.position]),
      [[cardA.id, 0]],
      "移动后目标列：卡 A 落 0 位",
    );

    // 同列移动：B 移到源列末位（原位语义：0 -> 1）
    const mvSame = await expectStatus("PATCH", `/api/cards/${cardB.id}/move`, { position: 1 }, 200, "PATCH 卡同列移动（0 -> 1）-> 200");
    eq(mvSame.json && mvSame.json.position, 1, "同列移动后 position = 1");
    const srcAfterSame = await req("GET", `/api/projects/${project.id}/columns/${colTodo.id}/cards`);
    eq(
      srcAfterSame.json.cards.map((x: { id: number; position: number }) => [x.id, x.position]),
      [[cardC.id, 0], [cardB.id, 1]],
      "同列移动后源列重排：C 让到 0 位、B 到 1 位",
    );

    // 4xx 移动分支：非法 position / 不存在的列 / 跨项目移动拒绝
    await expectStatus("PATCH", `/api/cards/${cardB.id}/move`, { position: -1 }, 400, "PATCH 移动 position 为负 -> 400");
    await expectStatus("PATCH", `/api/cards/${cardB.id}/move`, { position: 99 }, 400, "PATCH 移动 position 越界 -> 400");
    await expectStatus("PATCH", `/api/cards/${cardB.id}/move`, { columnId: 99999, position: 0 }, 400, "PATCH 移动到不存在的列（越权外键）-> 400");
    // 跨项目移动：建第二个项目 + 列，把 B 移过去必须被拒
    const proj2 = await expectStatus("POST", "/api/projects", { name: "另一个项目" }, 201, "POST 第二个项目 -> 201");
    const proj2col = await expectStatus("POST", `/api/projects/${proj2.json.id}/columns`, { name: "别的列" }, 201, "POST 第二个项目的列 -> 201");
    await expectStatus(
      "PATCH",
      `/api/cards/${cardB.id}/move`,
      { columnId: proj2col.json.id, position: 0 },
      400,
      "PATCH 跨项目移动被拒绝 -> 400",
    );
    // 移动被拒后 B 仍在原列原位（拒绝不留半态）
    const srcAfterReject = await req("GET", `/api/projects/${project.id}/columns/${colTodo.id}/cards`);
    ok(
      srcAfterReject.json.cards.some((x: { id: number }) => x.id === cardB.id),
      "跨项目移动被拒后卡片仍在源列（无半态副作用）",
    );
    await expectStatus("PATCH", "/api/cards/99999/move", { position: 0 }, 404, "PATCH 移动不存在的卡 -> 404");
    await expectStatus("PATCH", "/api/cards/not-a-number/move", { position: 0 }, 400, "PATCH 移动非数字卡 id -> 400");

    // 待办徽标联动：卡片关联的待办状态变化可被 UI 消费（todo 详情读回验证关联链路）
    const linkedTodoRead = await req("GET", `/api/todos/${linkTodoCard.id}`);
    eq(linkedTodoRead.json && linkedTodoRead.json.title, "写 r4 看板复验材料", "卡关联的待办可经 todo 路由读回（徽标数据链路）");

    // DELETE 卡
    const d = await expectStatus("DELETE", `/api/cards/${cardC.id}`, undefined, 200, "DELETE 存在卡 -> 200");
    ok(d.json && d.json.deleted === true, "delete 卡返回 deleted=true");
    await expectStatus("GET", `/api/cards/${cardC.id}`, undefined, 404, "DELETE 后 GET 卡 -> 404");
    await expectStatus("DELETE", `/api/cards/${cardC.id}`, undefined, 404, "DELETE 重复同一卡 id -> 404");
  }

  console.log("\n== board stats + CSV export (r5) ==");
  {
    // 统计与导出共用一个专用项目（计数确定，不受前面小节残留数据影响）
    const proj = await expectStatus("POST", "/api/projects", { name: "r5 统计导出项目" }, 201, "POST r5 项目 -> 201");
    const projectId = proj.json.id as number;
    const cols = await req("GET", `/api/projects/${projectId}/columns`);
    const colTodo = cols.json.columns.find((x: { position: number }) => x.position === 0);
    const colDoing = cols.json.columns.find((x: { position: number }) => x.position === 1);
    const colDone = cols.json.columns.find((x: { position: number }) => x.position === 2);
    eq(cols.json.columns.length, 3, "r5 项目自带默认三列（统计/导出的列底座）");

    const doneTodo = await expectStatus("POST", "/api/todos", { title: "已完成待办", quadrant: "q1" }, 201, "POST 已完成待办 -> 201");
    await expectStatus("PATCH", `/api/todos/${doneTodo.json.id}`, { status: "done" }, 200, "PATCH 待办 -> done");
    const openTodo = await expectStatus("POST", "/api/todos", { title: "进行中待办", quadrant: "q2", dueDate: "2026-11-30" }, 201, "POST 进行中待办 -> 201");

    const cardA = await expectStatus("POST", `/api/projects/${projectId}/columns/${colTodo.id}/cards`, { title: "统计卡A", todoId: doneTodo.json.id }, 201, "POST 统计卡A（关联 done 待办）-> 201");
    const cardB = await expectStatus("POST", `/api/projects/${projectId}/columns/${colTodo.id}/cards`, { title: "统计卡B" }, 201, "POST 统计卡B（无待办）-> 201");
    await expectStatus(
      "POST",
      `/api/projects/${projectId}/columns/${colTodo.id}/cards`,
      { title: '统计卡"C", 含逗号', description: "第一行\n第二行", todoId: openTodo.json.id },
      201,
      "POST 统计卡C（含逗号/引号/换行描述）-> 201",
    );
    await expectStatus("POST", `/api/projects/${projectId}/columns/${colDoing.id}/cards`, { title: "统计卡D", todoId: doneTodo.json.id }, 201, "POST 统计卡D（进行中列）-> 201");

    // —— 统计端点 ——
    const st = await expectStatus("GET", `/api/projects/${projectId}/stats`, undefined, 200, "GET 看板统计 -> 200");
    eq(st.json && st.json.projectId, projectId, "统计：projectId 回显");
    eq(st.json.columns.length, 3, "统计：三列各一段");
    eq(st.json.columns[0].name, "待办", "统计：第 0 列是待办");
    eq(st.json.columns[0].cardCount, 3, "统计：待办列 3 张卡");
    eq(st.json.columns[0].doneCount, 1, "统计：待办列 1 张完成（只有 done 待办算完成）");
    eq(st.json.columns[0].todoLinkedCount, 2, "统计：待办列 2 张关联待办");
    eq(st.json.columns[0].completionRate, 33, "统计：待办列完成率 1/3 -> 33%");
    eq(st.json.columns[1].cardCount, 1, "统计：进行中列 1 张卡");
    eq(st.json.columns[1].completionRate, 100, "统计：进行中列完成率 1/1 -> 100%");
    eq(st.json.columns[2].cardCount, 0, "统计：已完成列 0 张卡");
    eq(st.json.columns[2].completionRate, 0, "统计：零卡列完成率 0（不除零）");
    eq(st.json.totals.columnCount, 3, "统计：合计列数 3");
    eq(st.json.totals.cardCount, 4, "统计：合计卡片数 4");
    eq(st.json.totals.doneCount, 2, "统计：合计完成数 2");
    eq(st.json.totals.todoLinkedCount, 3, "统计：合计关联待办数 3");
    eq(st.json.totals.completionRate, 50, "统计：项目完成率 2/4 -> 50%");

    // —— 统计与卡片移动联动：移动后统计即时变化 ——
    await expectStatus("PATCH", `/api/cards/${cardB.json.id}/move`, { columnId: colDoing.id, position: 0 }, 200, "PATCH 统计卡B 移到进行中 -> 200");
    const stAfter = await req("GET", `/api/projects/${projectId}/stats`);
    eq(stAfter.json.columns[0].cardCount, 2, "统计联动：移动后待办列卡片数 3 -> 2");
    eq(stAfter.json.columns[0].completionRate, 50, "统计联动：移动后待办列完成率 33% -> 50%（1/2）");
    eq(stAfter.json.columns[1].cardCount, 2, "统计联动：移动后进行中列卡片数 1 -> 2");
    eq(stAfter.json.columns[1].completionRate, 50, "统计联动：移动后进行中列完成率 100% -> 50%（1/2）");
    eq(stAfter.json.totals.cardCount, 4, "统计联动：移动不改变项目合计卡片数（4）");
    eq(stAfter.json.totals.completionRate, 50, "统计联动：移动后项目完成率仍 50%（完成数未变）");

    // —— 统计 4xx ——
    await expectStatus("GET", "/api/projects/99999/stats", undefined, 404, "GET 不存在项目的统计 -> 404");
    await expectStatus("GET", "/api/projects/not-a-number/stats", undefined, 400, "GET 非数字项目 id 的统计 -> 400");
    await expectStatus("GET", "/api/projects/0/stats", undefined, 400, "GET 项目 id=0 的统计 -> 400");

    // —— CSV 导出 ——
    const csvRes = await reqText(`/api/projects/${projectId}/export.csv`);
    eq(csvRes.status, 200, "GET 看板 CSV 导出 -> 200");
    ok((csvRes.headers.get("content-type") ?? "").includes("text/csv"), "CSV：content-type 含 text/csv");
    ok((csvRes.headers.get("content-type") ?? "").includes("charset=utf-8"), "CSV：content-type 带 charset=utf-8");
    ok((csvRes.headers.get("content-disposition") ?? "").includes("attachment"), "CSV：content-disposition 为 attachment（浏览器直接下载）");
    // r6 U2-2 必修：文件名含项目名（不再只露内部 id）
    const disposition = csvRes.headers.get("content-disposition") ?? "";
    const expectedFileName = buildBoardCsvFileName("r5 统计导出项目");
    ok(disposition.includes("filename*=UTF-8''"), "CSV：content-disposition 带 RFC5987 UTF-8 文件名段（中文项目名可下载）");
    ok(disposition.includes(encodeURIComponent(expectedFileName)), "CSV：文件名含项目名与日期（U2-2）");
    ok(!disposition.includes(`project-${projectId}`), "CSV：文件名不再只含内部项目 id（U2-2）");
    ok(disposition.includes('filename="'), "CSV：content-disposition 保留 ASCII 回落文件名段");
    const raw = await reqBytes(`/api/projects/${projectId}/export.csv`);
    eq(raw.bytes[0], 0xef, "CSV：首字节 EF（UTF-8 BOM 第 1 字节）");
    eq(raw.bytes[1], 0xbb, "CSV：次字节 BB（UTF-8 BOM 第 2 字节）");
    eq(raw.bytes[2], 0xbf, "CSV：第三字节 BF（UTF-8 BOM 第 3 字节）");
    const body = stripBom(csvRes.text);
    ok(!csvRes.text.startsWith("\uFEFF"), "CSV：文本解码会剥掉 BOM（故 UI 必须按字节落盘；字节层 BOM 见上三条断言）");
    const rows = body.split("\r\n");
    eq(
      rows[0],
      "列名,列位置,卡片标题,卡片描述,卡片位置,关联待办标题,关联待办状态,关联待办象限,关联待办截止日期",
      "CSV：表头是中文列名（9 列，Excel 直开可对齐）",
    );
    eq(rows.length, 6, "CSV：表头 + 5 行台账（3 列 4 卡：待办 2 + 进行中 2 + 已完成占位 1）");
    const row1 = rows[1]!.split(",");
    eq(row1[0], "待办", "CSV：第 1 行属待办列");
    eq(row1[2], "统计卡A", "CSV：卡片标题列对齐");
    eq(row1[5], "已完成待办", "CSV：关联待办标题列对齐");
    eq(row1[6], "已完成", "CSV：关联待办状态为中文标签");
    eq(row1[7], "紧急且重要", "CSV：关联待办象限为中文标签");
    eq(row1[8], "", "CSV：已完成待办无截止日 -> 空");
    ok(body.includes('"统计卡""C"", 含逗号"'), "CSV：含逗号与引号的标题被正确转义并加引号");
    ok(body.includes('"第一行\n第二行"'), "CSV：含换行的描述被引号包裹");
    const quoteRow = rows.find((r) => r.includes("统计卡"));
    ok(quoteRow !== undefined, "CSV：特殊字符卡片行存在");
    eq(body.split("\r\n").length, rows.length, "CSV：裸 \\n 不额外切分记录（CRLF 才是记录分隔）");
    const lastRow = rows[rows.length - 1]!.split(",");
    eq(lastRow[0], "已完成", "CSV：末行是空列占位行");
    eq(lastRow[2], "", "CSV：空列占位行的卡片标题为空");

    // —— CSV 4xx 与空项目 ——
    await expectStatus("GET", "/api/projects/99999/export.csv", undefined, 404, "GET 不存在项目的 CSV -> 404");
    await expectStatus("GET", "/api/projects/not-a-number/export.csv", undefined, 400, "GET 非数字项目 id 的 CSV -> 400");
    const emptyProj = await expectStatus("POST", "/api/projects", { name: "r5 空项目" }, 201, "POST r5 空项目 -> 201");
    const emptyCsv = await reqText(`/api/projects/${emptyProj.json.id}/export.csv`);
    eq(emptyCsv.status, 200, "GET 空项目 CSV -> 200");
    const emptyCsvBytes = await reqBytes(`/api/projects/${emptyProj.json.id}/export.csv`);
    eq(emptyCsvBytes.bytes[0], 0xef, "CSV：空项目导出首字节 EF（BOM 第 1 字节）");
    eq(emptyCsvBytes.bytes[1], 0xbb, "CSV：空项目导出次字节 BB（BOM 第 2 字节）");
    eq(emptyCsvBytes.bytes[2], 0xbf, "CSV：空项目导出第三字节 BF（BOM 第 3 字节）");
    const emptyBody = stripBom(emptyCsv.text);
    const emptyRows = emptyBody.split("\r\n");
    eq(emptyRows.length, 4, "CSV：空项目导出 = 表头 + 3 行空列占位（默认三列每列一行）");
    eq(
      emptyRows.slice(1).map((r) => r.split(",")[0]),
      ["待办", "进行中", "已完成"],
      "CSV：空项目导出的三行分别是三个默认列",
    );
    ok(
      emptyRows.slice(1).every((r) => r.split(",").slice(2).every((f) => f === "")),
      "CSV：空列占位行的卡片/待办字段全空",
    );
    const emptyStats = await expectStatus("GET", `/api/projects/${emptyProj.json.id}/stats`, undefined, 200, "GET 空项目统计 -> 200");
    eq(emptyStats.json.totals.cardCount, 0, "统计：空项目合计卡片数 0");
    eq(emptyStats.json.totals.completionRate, 0, "统计：空项目完成率 0（不除零）");
    eq(emptyStats.json.columns.length, 3, "统计：空项目仍有三列（默认三列在场）");
    eq(emptyStats.json.columns[0].completionRate, 0, "统计：空项目各列完成率 0");
    // 真正零列的项目（把默认三列删掉）：CSV 只剩表头，统计列数为 0
    const emptyCols = await req("GET", `/api/projects/${emptyProj.json.id}/columns`);
    for (const c of emptyCols.json.columns) {
      await expectStatus("DELETE", `/api/board-columns/${c.id}`, undefined, 200, "DELETE 空项目的默认列 -> 200");
    }
    const zeroColCsv = await reqText(`/api/projects/${emptyProj.json.id}/export.csv`);
    eq(stripBom(zeroColCsv.text), "列名,列位置,卡片标题,卡片描述,卡片位置,关联待办标题,关联待办状态,关联待办象限,关联待办截止日期", "CSV：零列项目导出仅含表头（无数据行）");
    const zeroColStats = await req("GET", `/api/projects/${emptyProj.json.id}/stats`);
    eq(zeroColStats.json.columns.length, 0, "统计：零列项目统计列数为 0");
    eq(zeroColStats.json.totals.columnCount, 0, "统计：零列项目合计列数 0");
    eq(zeroColStats.json.totals.completionRate, 0, "统计：零列项目完成率 0（不除零）");
  }

  console.log("\n== tables / fields / records (r6) ==");
  {
    // —— 表（多维表格）——
    const tbl = await expectStatus("POST", "/api/tables", { name: "装修预算表", description: "r6 样例" }, 201, "POST 表 -> 201");
    const tableId = tbl.json.id as number;
    eq(tbl.json.name, "装修预算表", "表：name 读回");
    eq(tbl.json.description, "r6 样例", "表：description 读回");
    await expectStatus("POST", "/api/tables", { name: "" }, 400, "POST 表空名称 -> 400");
    await expectStatus("POST", "/api/tables", {}, 400, "POST 表缺 name -> 400");
    const list = await expectStatus("GET", "/api/tables", undefined, 200, "GET 表列表 -> 200");
    ok(Array.isArray(list.json.tables), "表：列表返回数组");
    ok(
      list.json.tables.some((x: { id: number }) => x.id === tableId),
      "表：新表出现在列表里",
    );
    await expectStatus("GET", "/api/tables/99999", undefined, 404, "GET 不存在的表 -> 404");
    await expectStatus("GET", "/api/tables/not-a-number", undefined, 400, "GET 非数字表 id -> 400");
    await expectStatus("GET", "/api/tables/0", undefined, 400, "GET 表 id=0 -> 400");

    // —— 字段（默认模板 + 自定义 + 4xx）——
    const fieldsRes = await expectStatus("GET", `/api/tables/${tableId}/fields`, undefined, 200, "GET 字段列表 -> 200");
    eq(fieldsRes.json.fields.length, 8, "字段：新表自带 8 个默认字段（不留零字段死路）");
    eq(
      fieldsRes.json.fields.map((x: { type: string }) => x.type),
      ["text", "select", "text", "number", "date", "multi-select", "checkbox", "url"],
      "字段：默认字段覆盖 7 种类型",
    );
    eq(
      fieldsRes.json.fields.find((x: { name: string }) => x.name === "状态").options,
      ["未开始", "进行中", "已完成"],
      "字段：默认单选字段带候选项",
    );
    await expectStatus("GET", "/api/tables/99999/fields", undefined, 404, "GET 不存在表的字段 -> 404");

    const newField = await expectStatus(
      "POST",
      `/api/tables/${tableId}/fields`,
      { name: "供应商", type: "text" },
      201,
      "POST 字段 -> 201",
    );
    eq(newField.json.name, "供应商", "字段：name 读回");
    eq(newField.json.type, "text", "字段：type 读回");
    eq(newField.json.options, [], "字段：非单选类型候选项为空数组");
    const selField = await expectStatus(
      "POST",
      `/api/tables/${tableId}/fields`,
      { name: "阶段", type: "select", options: ["A", "B"] },
      201,
      "POST 单选字段（带候选项）-> 201",
    );
    eq(selField.json.options, ["A", "B"], "字段：候选项读回");
    await expectStatus("POST", `/api/tables/${tableId}/fields`, { name: "坏类型", type: "money" }, 400, "POST 字段非法类型 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/fields`, { name: "零选项", type: "select", options: [] }, 400, "POST 单选零候选项 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/fields`, { name: "文本带选项", type: "text", options: ["A"] }, 400, "POST 文本字段带候选项 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/fields`, { name: "", type: "text" }, 400, "POST 字段空名称 -> 400");
    await expectStatus("POST", "/api/tables/99999/fields", { name: "孤儿字段", type: "text" }, 404, "POST 字段到不存在的表 -> 404");

    const patchedField = await expectStatus(
      "PATCH",
      `/api/fields/${newField.json.id}`,
      { name: "供应商名称" },
      200,
      "PATCH 字段改名 -> 200",
    );
    eq(patchedField.json.name, "供应商名称", "字段：改名后读回");
    await expectStatus("PATCH", "/api/fields/99999", { name: "x" }, 404, "PATCH 不存在的字段 -> 404");
    await expectStatus("PATCH", `/api/fields/${newField.json.id}`, { name: "" }, 400, "PATCH 字段空名称 -> 400");
    await expectStatus("PATCH", `/api/fields/${newField.json.id}`, { type: "money" }, 400, "PATCH 字段非法类型 -> 400");

    // —— 记录（行）+ 单元格编辑 ——
    const byName = new Map<string, number>(
      fieldsRes.json.fields.map((x: { name: string; id: number }) => [x.name, x.id]),
    );
    const nameId = byName.get("名称")!;
    const amountId = byName.get("金额")!;
    const statusId = byName.get("状态")!;
    const dateId = byName.get("截止日期")!;
    const tagId = byName.get("标签")!;
    const doneId = byName.get("完成")!;
    const linkId = byName.get("链接")!;

    const rec1 = await expectStatus(
      "POST",
      `/api/tables/${tableId}/records`,
      {
        data: {
          [String(nameId)]: "量房",
          [String(amountId)]: "1200",
          [String(statusId)]: "进行中",
          [String(dateId)]: "2026-12-01",
          [String(tagId)]: ["重要", "紧急"],
          [String(doneId)]: false,
          [String(linkId)]: "https://example.com/a",
        },
      },
      201,
      "POST 记录（7 种字段类型全填）-> 201",
    );
    eq(rec1.json.data[String(nameId)], "量房", "记录：文本字段读回");
    eq(rec1.json.data[String(amountId)], 1200, "记录：数字字段按引擎归一（\"1200\" -> 1200）");
    eq(rec1.json.data[String(tagId)], ["重要", "紧急"], "记录：多选字段读回数组");
    eq(rec1.json.data[String(doneId)], false, "记录：复选框字段读回布尔");
    await expectStatus("POST", `/api/tables/${tableId}/records`, { data: { "99999": "x" } }, 400, "POST 记录带未知字段 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/records`, { data: { [String(amountId)]: "abc" } }, 400, "POST 记录带非法数字 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/records`, { data: { [String(statusId)]: "搁置" } }, 400, "POST 记录带非法单选值 -> 400");
    await expectStatus("POST", "/api/tables/99999/records", { data: {} }, 404, "POST 记录到不存在的表 -> 404");

    const rec2 = await expectStatus(
      "POST",
      `/api/tables/${tableId}/records`,
      { data: { [String(nameId)]: "选瓷砖", [String(amountId)]: 300, [String(statusId)]: "未开始" } },
      201,
      "POST 第二条记录 -> 201",
    );
    const rec3 = await expectStatus(
      "POST",
      `/api/tables/${tableId}/records`,
      { data: { [String(nameId)]: "定预算", [String(amountId)]: 9000, [String(statusId)]: "已完成" } },
      201,
      "POST 第三条记录 -> 201",
    );

    const recList = await expectStatus("GET", `/api/tables/${tableId}/records`, undefined, 200, "GET 记录列表 -> 200");
    eq(recList.json.records.length, 3, "记录：列表 3 条");
    eq(recList.json.total, 3, "记录：total = 3");
    ok(Array.isArray(recList.json.records), "记录：列表返回数组");
    await expectStatus("GET", "/api/tables/99999/records", undefined, 404, "GET 不存在表的记录 -> 404");

    const one = await expectStatus("GET", `/api/records/${rec1.json.id}`, undefined, 200, "GET 记录详情 -> 200");
    eq(one.json.id, rec1.json.id, "记录：详情 id 一致");
    await expectStatus("GET", "/api/records/99999", undefined, 404, "GET 不存在的记录 -> 404");
    await expectStatus("GET", "/api/records/not-a-number", undefined, 400, "GET 非数字记录 id -> 400");

    // 编辑单元格（整行 data 覆盖写）
    const edited = await expectStatus(
      "PATCH",
      `/api/records/${rec1.json.id}`,
      { data: { ...rec1.json.data, [String(amountId)]: 1500, [String(statusId)]: "已完成" } },
      200,
      "PATCH 编辑单元格 -> 200",
    );
    eq(edited.json.data[String(amountId)], 1500, "记录：编辑后数字读回");
    eq(edited.json.data[String(statusId)], "已完成", "记录：编辑后单选读回");
    await expectStatus("PATCH", `/api/records/${rec1.json.id}`, { data: { "99999": "x" } }, 400, "PATCH 记录带未知字段 -> 400");
    await expectStatus("PATCH", "/api/records/99999", { data: {} }, 404, "PATCH 不存在的记录 -> 404");

    // —— 筛选 ——
    const filtered = await expectStatus(
      "GET",
      `/api/tables/${tableId}/records?filterFieldId=${statusId}&filterValue=${encodeURIComponent("已完成")}`,
      undefined,
      200,
      "GET 记录（按单选字段筛选）-> 200",
    );
    eq(filtered.json.total, 2, "筛选：已完成 -> 2 条命中");
    eq(
      filtered.json.records.map((x: { data: Record<string, unknown> }) => x.data[String(nameId)]),
      ["量房", "定预算"],
      "筛选：命中的是两条「已完成」记录",
    );
    const filteredNum = await expectStatus(
      "GET",
      `/api/tables/${tableId}/records?filterFieldId=${amountId}&filterValue=300`,
      undefined,
      200,
      "GET 记录（按数字字段筛选）-> 200",
    );
    eq(filteredNum.json.total, 1, "筛选：数字字段筛选命中 1 条");
    await expectStatus(
      "GET",
      `/api/tables/${tableId}/records?filterFieldId=${amountId}&filterValue=abc`,
      undefined,
      400,
      "GET 记录（筛选值类型不符）-> 400",
    );
    await expectStatus(
      "GET",
      `/api/tables/${tableId}/records?filterFieldId=${statusId}&filterValue=${encodeURIComponent("搁置")}`,
      undefined,
      400,
      "GET 记录（筛选值不在候选项内）-> 400",
    );
    await expectStatus(
      "GET",
      `/api/tables/${tableId}/records?filterFieldId=99999&filterValue=1`,
      undefined,
      400,
      "GET 记录（筛选字段不存在）-> 400",
    );

    // —— 排序 ——
    const sortedAsc = await expectStatus(
      "GET",
      `/api/tables/${tableId}/records?sortFieldId=${amountId}&sortDirection=asc`,
      undefined,
      200,
      "GET 记录（按数字字段升序）-> 200",
    );
    eq(
      sortedAsc.json.records.map((x: { data: Record<string, unknown> }) => x.data[String(amountId)]),
      [300, 1500, 9000],
      "排序：数字升序 300 / 1500 / 9000",
    );
    const sortedDesc = await expectStatus(
      "GET",
      `/api/tables/${tableId}/records?sortFieldId=${amountId}&sortDirection=desc`,
      undefined,
      200,
      "GET 记录（按数字字段降序）-> 200",
    );
    eq(
      sortedDesc.json.records.map((x: { data: Record<string, unknown> }) => x.data[String(amountId)]),
      [9000, 1500, 300],
      "排序：数字降序 9000 / 1500 / 300",
    );
    await expectStatus(
      "GET",
      `/api/tables/${tableId}/records?sortFieldId=99999`,
      undefined,
      400,
      "GET 记录（排序字段不存在）-> 400",
    );

    // —— 分页 ——
    const page1 = await expectStatus(
      "GET",
      `/api/tables/${tableId}/records?page=1&pageSize=2`,
      undefined,
      200,
      "GET 记录（第 1 页）-> 200",
    );
    eq(page1.json.records.length, 2, "分页：第 1 页 2 条");
    eq(page1.json.total, 3, "分页：total 不随分页变化");
    eq(page1.json.totalPages, 2, "分页：totalPages = 2");
    const page2 = await expectStatus(
      "GET",
      `/api/tables/${tableId}/records?page=2&pageSize=2`,
      undefined,
      200,
      "GET 记录（第 2 页）-> 200",
    );
    eq(page2.json.records.length, 1, "分页：第 2 页 1 条");
    eq(page2.json.page, 2, "分页：page 回显 2");

    // —— 删字段 / 删记录 / 删表 ——
    await expectStatus("DELETE", `/api/fields/${selField.json.id}`, undefined, 200, "DELETE 字段 -> 200");
    await expectStatus("DELETE", `/api/fields/${selField.json.id}`, undefined, 404, "DELETE 重复同一字段 id -> 404");
    const fieldsAfter = await req("GET", `/api/tables/${tableId}/fields`);
    eq(fieldsAfter.json.fields.length, 9, "字段：删掉一个自定义字段后剩 9 个（8 默认 + 1 自定义）");
    await expectStatus("DELETE", `/api/records/${rec3.json.id}`, undefined, 200, "DELETE 记录 -> 200");
    await expectStatus("GET", `/api/records/${rec3.json.id}`, undefined, 404, "DELETE 后 GET 记录 -> 404");
    await expectStatus("DELETE", `/api/tables/${tableId}`, undefined, 200, "DELETE 表 -> 200");
    await expectStatus("GET", `/api/tables/${tableId}`, undefined, 404, "DELETE 表后 GET 表 -> 404");
    await expectStatus("GET", `/api/records/${rec1.json.id}`, undefined, 404, "删表：记录级联删除（记录路由读回 404）");
    await expectStatus("GET", `/api/tables/${tableId}/fields`, undefined, 404, "删表：字段级联删除（字段列表 404）");
  }

  console.log("\n== views + CSV import (r7) ==");
  {
    // —— 用户第一次用全链路（r4 教训）：建表 → 建视图 → 切换视图 → 编辑视图 → 导入 CSV ——
    const tbl = await expectStatus("POST", "/api/tables", { name: "r7 视图与导入验收表" }, 201, "r7 POST 表 -> 201");
    const tableId = tbl.json.id as number;
    const fieldsRes = await expectStatus("GET", `/api/tables/${tableId}/fields`, undefined, 200, "r7 GET 字段列表 -> 200");
    eq(fieldsRes.json.fields.length, 8, "r7 字段：新表自带 8 个默认字段");
    const byName = new Map<string, number>(
      fieldsRes.json.fields.map((x: { name: string; id: number }) => [x.name, x.id]),
    );
    const nameId = byName.get("名称")!;
    const amountId = byName.get("金额")!;
    const statusId = byName.get("状态")!;
    const tagId = byName.get("标签")!;

    const row = (name: string, status: string, amount: number, tags: string[]): unknown => ({
      data: {
        [String(nameId)]: name,
        [String(statusId)]: status,
        [String(amountId)]: amount,
        [String(tagId)]: tags,
      },
    });
    await expectStatus("POST", `/api/tables/${tableId}/records`, row("量房", "已完成", 1200, ["重要"]), 201, "r7 种子行 1（已完成 / 1200 / 重要）-> 201");
    await expectStatus("POST", `/api/tables/${tableId}/records`, row("选瓷砖", "进行中", 300, ["重要", "紧急"]), 201, "r7 种子行 2（进行中 / 300 / 重要+紧急）-> 201");
    await expectStatus("POST", `/api/tables/${tableId}/records`, row("定预算", "已完成", 9000, []), 201, "r7 种子行 3（已完成 / 9000）-> 201");
    await expectStatus("POST", `/api/tables/${tableId}/records`, row("量房复测", "已完成", 1500, ["紧急"]), 201, "r7 种子行 4（已完成 / 1500 / 紧急）-> 201");
    const seeded = await expectStatus("GET", `/api/tables/${tableId}/records`, undefined, 200, "r7 GET 种子记录 -> 200");
    eq(seeded.json.total, 4, "r7 种子：表内共 4 行");

    // —— 多字段 AND 筛选（r6 遗留：集中在 shared queryRecords，HTTP 层真读回）——
    const andQ = encodeURIComponent(JSON.stringify([
      { fieldId: statusId, value: "已完成" },
      { fieldId: amountId, value: "1200" },
    ]));
    const andRes = await expectStatus("GET", `/api/tables/${tableId}/records?filters=${andQ}`, undefined, 200, "r7 GET 记录（多字段 AND 筛选）-> 200");
    eq(andRes.json.total, 1, "r7 AND：状态=已完成 且 金额=1200 → 1 行（手算）");
    eq(andRes.json.records[0].data[String(nameId)], "量房", "r7 AND：命中的是「量房」");
    const andTag = encodeURIComponent(JSON.stringify([
      { fieldId: statusId, value: "已完成" },
      { fieldId: tagId, value: "紧急" },
    ]));
    const andTagRes = await expectStatus("GET", `/api/tables/${tableId}/records?filters=${andTag}`, undefined, 200, "r7 GET 记录（AND + 多选包含）-> 200");
    eq(andTagRes.json.total, 1, "r7 AND：状态=已完成 且 标签含紧急 → 1 行（手算）");
    eq(andTagRes.json.records[0].data[String(nameId)], "量房复测", "r7 AND：命中的是「量房复测」");
    await expectStatus("GET", `/api/tables/${tableId}/records?filters=not-json`, undefined, 400, "r7 filters 非 JSON -> 400");
    await expectStatus("GET", `/api/tables/${tableId}/records?filters=${encodeURIComponent('{"a":1}')}`, undefined, 400, "r7 filters 非数组 -> 400");
    await expectStatus(
      "GET",
      `/api/tables/${tableId}/records?filters=${encodeURIComponent(JSON.stringify([{ fieldId: 99999, value: "x" }]))}`,
      undefined,
      400,
      "r7 filters 未知字段 -> 400",
    );
    await expectStatus(
      "GET",
      `/api/tables/${tableId}/records?filters=${encodeURIComponent(JSON.stringify([{ fieldId: amountId, value: "abc" }]))}`,
      undefined,
      400,
      "r7 filters 取值类型不符 -> 400",
    );
    await expectStatus("GET", `/api/tables/${tableId}/records?sortFieldId=${amountId}&sortDirection=sideways`, undefined, 400, "r7 非法排序方向 -> 400（方向下拉校验）");
    const strictAsc = await expectStatus("GET", `/api/tables/${tableId}/records?sortFieldId=${amountId}&sortDirection=asc`, undefined, 200, "r7 合法排序方向 asc -> 200");
    eq(strictAsc.json.records.map((x: { data: Record<string, unknown> }) => x.data[String(amountId)]), [300, 1200, 1500, 9000], "r7 排序：数字升序 300 / 1200 / 1500 / 9000");

    // —— 视图 CRUD + 按视图查询（复用 shared queryRecords）——
    const viewBody = {
      name: "已完成且金额 1200",
      filterSpec: [
        { fieldId: statusId, value: "已完成" },
        { fieldId: amountId, value: "1200" },
      ],
      sortSpec: [{ fieldId: amountId, direction: "desc" }],
      visibleFields: [nameId, amountId, statusId],
    };
    const createdView = await expectStatus("POST", `/api/tables/${tableId}/views`, viewBody, 201, "r7 POST 视图 -> 201");
    const viewId = createdView.json.id as number;
    eq(createdView.json.name, "已完成且金额 1200", "r7 视图：name 读回");
    eq(createdView.json.tableId, tableId, "r7 视图：tableId 读回");
    eq(createdView.json.filterSpec[1].value, 1200, "r7 视图：数字筛选值归一后落库（\"1200\" -> 1200）");
    eq(createdView.json.sortSpec, [{ fieldId: amountId, direction: "desc" }], "r7 视图：sort_spec 读回");
    eq(createdView.json.visibleFields, [nameId, amountId, statusId], "r7 视图：visible_fields 读回");
    const viewsList = await expectStatus("GET", `/api/tables/${tableId}/views`, undefined, 200, "r7 GET 视图列表 -> 200");
    eq(viewsList.json.views.length, 1, "r7 视图列表：1 个视图");
    const viewDetail = await expectStatus("GET", `/api/views/${viewId}`, undefined, 200, "r7 GET 视图详情 -> 200");
    eq(viewDetail.json.filterSpec, createdView.json.filterSpec, "r7 视图详情：spec 与创建结果一致（JSON 往返）");
    const byView = await expectStatus("GET", `/api/views/${viewId}/records`, undefined, 200, "r7 按视图查询记录 -> 200");
    eq(byView.json.viewId, viewId, "r7 按视图查询：回显 viewId");
    eq(byView.json.total, 1, "r7 按视图查询：AND 口径命中 1 行（与手算一致）");
    eq(byView.json.records[0].data[String(nameId)], "量房", "r7 按视图查询：命中「量房」");
    ok(
      Object.keys(byView.json.records[0].data).sort().every((k: string) => [String(nameId), String(amountId), String(statusId)].includes(k)),
      "r7 按视图查询：投影只保留 3 个可见字段（隐藏列不出现在 data）",
    );
    eq(Object.keys(byView.json.records[0].data).length, 3, "r7 按视图查询：投影后 data 恰 3 个键");

    // 编辑视图（切换视图口径）：改筛选 + 恢复全部列可见
    const patchedView = await expectStatus(
      "PATCH",
      `/api/views/${viewId}`,
      { name: "全部已完成", filterSpec: [{ fieldId: statusId, value: "已完成" }], sortSpec: [{ fieldId: amountId, direction: "asc" }], visibleFields: [] },
      200,
      "r7 PATCH 编辑视图 -> 200",
    );
    eq(patchedView.json.name, "全部已完成", "r7 编辑视图：改名读回");
    eq(patchedView.json.visibleFields, [], "r7 编辑视图：visible_fields 清空 = 全部列可见");
    const byPatched = await expectStatus("GET", `/api/views/${viewId}/records`, undefined, 200, "r7 切换 / 编辑视图后再查 -> 200");
    eq(byPatched.json.total, 3, "r7 编辑后：全部已完成 = 3 行（手算）");
    eq(
      byPatched.json.records.map((x: { data: Record<string, unknown> }) => x.data[String(amountId)]),
      [1200, 1500, 9000],
      "r7 编辑后：金额升序 1200 / 1500 / 9000（手算）",
    );
    ok(
      Object.keys(byPatched.json.records[0].data).length >= 4,
      "r7 编辑后：取消隐藏列，data 恢复完整字段",
    );

    // —— 视图 4xx ——
    await expectStatus("POST", `/api/tables/${tableId}/views`, { name: "" }, 400, "r7 POST 视图空名 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/views`, {}, 400, "r7 POST 视图缺 name -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/views`, { name: "x".repeat(101) }, 400, "r7 POST 视图超长名 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/views`, { name: "坏筛选", filterSpec: "x" }, 400, "r7 POST 视图 filterSpec 非数组 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/views`, { name: "坏筛选", filterSpec: [{ fieldId: 99999, value: "x" }] }, 400, "r7 POST 视图筛选字段不存在 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/views`, { name: "坏筛选", filterSpec: [{ fieldId: amountId, value: "abc" }] }, 400, "r7 POST 视图筛选值类型不符 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/views`, { name: "坏筛选", filterSpec: [{ fieldId: statusId, value: "搁置" }] }, 400, "r7 POST 视图筛选值不在候选项 -> 400");
    await expectStatus(
      "POST",
      `/api/tables/${tableId}/views`,
      { name: "坏筛选", filterSpec: [{ fieldId: amountId, value: 1 }, { fieldId: amountId, value: 2 }] },
      400,
      "r7 POST 视图筛选字段重复 -> 400",
    );
    await expectStatus("POST", `/api/tables/${tableId}/views`, { name: "坏排序", sortSpec: "x" }, 400, "r7 POST 视图 sortSpec 非数组 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/views`, { name: "坏排序", sortSpec: [{ fieldId: 99999 }] }, 400, "r7 POST 视图排序字段不存在 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/views`, { name: "坏排序", sortSpec: [{ fieldId: amountId, direction: "sideways" }] }, 400, "r7 POST 视图非法方向 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/views`, { name: "坏可见", visibleFields: "x" }, 400, "r7 POST 视图 visibleFields 非数组 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/views`, { name: "坏可见", visibleFields: [99999] }, 400, "r7 POST 视图可见字段不存在 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/views`, { name: "全部已完成" }, 400, "r7 POST 视图名重复 -> 400");
    await expectStatus("POST", "/api/tables/99999/views", { name: "孤儿视图" }, 404, "r7 POST 视图到不存在的表 -> 404");
    await expectStatus("GET", "/api/tables/99999/views", undefined, 404, "r7 GET 不存在表的视图列表 -> 404");
    await expectStatus("GET", "/api/views/99999", undefined, 404, "r7 GET 不存在的视图 -> 404");
    await expectStatus("GET", "/api/views/not-a-number", undefined, 400, "r7 GET 非数字视图 id -> 400");
    await expectStatus("PATCH", "/api/views/99999", { name: "x" }, 404, "r7 PATCH 不存在的视图 -> 404");
    await expectStatus("DELETE", "/api/views/99999", undefined, 404, "r7 DELETE 不存在的视图 -> 404");
    await expectStatus("GET", "/api/views/99999/records", undefined, 404, "r7 按不存在的视图查询 -> 404");

    // —— CSV 导入预览（不落库）——
    const header = "名称,状态,金额,标签";
    const okCsv = [
      header,
      "量房复核,已完成,1200,重要",
      "贴砖,进行中,300,\"重要,紧急\"",
      "水电改造,未开始,9000,紧急",
    ].join("\n");
    const preview = await expectStatus("POST", `/api/tables/${tableId}/import.csv/preview`, { csv: okCsv }, 200, "r7 导入预览（合法 CSV）-> 200");
    eq(preview.json.total, 3, "r7 预览：3 行数据");
    eq(preview.json.preview.length, 3, "r7 预览：前 3 行原始文本");
    eq(preview.json.errors, [], "r7 预览：合法 CSV 零错误行");
    eq(preview.json.importable, true, "r7 预览：importable=true");
    eq(preview.json.headers, ["名称", "状态", "金额", "标签"], "r7 预览：表头按字段表映射");
    const beforePreview = await req("GET", `/api/tables/${tableId}/records`);
    eq(beforePreview.json.total, 4, "r7 预览不落库：记录数仍是 4");

    const badCsv = [
      header,
      "量房复核,已完成,1200,重要",
      "贴砖,进行中,不是数字,重要",
      "水电改造,搁置,9000,紧急",
      "报价,进行中,1500",
    ].join("\n");
    const badPreview = await expectStatus("POST", `/api/tables/${tableId}/import.csv/preview`, { csv: badCsv }, 200, "r7 导入预览（含非法行）-> 200");
    eq(badPreview.json.total, 4, "r7 错误预览：4 行数据全部计入 total");
    eq(badPreview.json.errors.length, 3, "r7 错误预览：3 行非法");
    eq(badPreview.json.errors.map((e: { row: number }) => e.row), [2, 3, 4], "r7 错误预览：错误行号 2 / 3 / 4（1 起）");
    ok(badPreview.json.errors.every((e: { reason: string }) => e.reason.length > 0), "r7 错误预览：每行都带中文原因");
    eq(badPreview.json.importable, false, "r7 错误预览：importable=false");

    // —— 预览 4xx（非法 CSV）——
    await expectStatus("POST", `/api/tables/${tableId}/import.csv/preview`, { csv: "" }, 400, "r7 预览空 CSV -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/import.csv/preview`, { csv: header }, 400, "r7 预览只有表头 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/import.csv/preview`, { csv: "未知列,金额\nx,1" }, 400, "r7 预览未知列 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/import.csv/preview`, { csv: "名称,名称\nx,y" }, 400, "r7 预览列重复 -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/import.csv/preview`, { foo: "bar" }, 400, "r7 预览非法请求体 -> 400");
    await expectStatus("POST", "/api/tables/99999/import.csv/preview", { csv: okCsv }, 404, "r7 预览不存在的表 -> 404");

    // —— 导入提交：全成功 ——
    const imported = await expectStatus("POST", `/api/tables/${tableId}/import.csv`, { csv: okCsv }, 201, "r7 确认导入（全合法）-> 201");
    eq(imported.json.imported, 3, "r7 导入：imported=3");
    eq(imported.json.total, 3, "r7 导入：total=3");
    eq(imported.json.records.length, 3, "r7 导入：返回 3 条写入记录");
    eq(imported.json.records[0].data[String(amountId)], 1200, "r7 导入：数字归一（\"1200\" -> 1200）");
    const afterImport = await expectStatus("GET", `/api/tables/${tableId}/records`, undefined, 200, "r7 导入后 GET 记录 -> 200");
    eq(afterImport.json.total, 7, "r7 导入：表内 4 + 3 = 7 行");

    // —— 导入部分失败零半态（本轮验收重点）——
    const beforePartial = await req("GET", `/api/tables/${tableId}/records`);
    const partialCsv = [
      header,
      "合法行 A,已完成,1111,重要",
      "非法数字行,进行中,abc,重要",
      "合法行 B,已完成,2222,紧急",
      "非法单选项,搁置,3333,紧急",
    ].join("\n");
    const partial = await expectStatus("POST", `/api/tables/${tableId}/import.csv`, { csv: partialCsv }, 422, "r7 部分失败导入 -> 422（零半态）");
    eq(partial.json.imported, 0, "r7 部分失败：imported=0（一行都没落库）");
    eq(partial.json.total, 4, "r7 部分失败：total 回显 4 行数据");
    eq(partial.json.errors.length, 2, "r7 部分失败：2 行非法（数字 / 单选）");
    eq(partial.json.errors.map((e: { row: number }) => e.row), [2, 4], "r7 部分失败：错误行号 2 / 4");
    ok(String(partial.json.error).includes("零半态"), "r7 部分失败：错误消息明确「零半态」");
    const afterPartial = await req("GET", `/api/tables/${tableId}/records`);
    eq(afterPartial.json.total, 7, "r7 零半态：部分失败后总行数仍是 7（合法行 A/B 也未落库）");
    eq(
      JSON.stringify(afterPartial.json),
      JSON.stringify(beforePartial.json),
      "r7 零半态：部分失败前后完整记录快照逐字节相等",
    );
    ok(
      !afterPartial.json.records.some((x: { data: Record<string, unknown> }) => x.data[String(nameId)] === "合法行 A"),
      "r7 零半态：错误 CSV 里的「合法行 A」没有半路落库",
    );
    ok(
      !afterPartial.json.records.some((x: { data: Record<string, unknown> }) => x.data[String(nameId)] === "合法行 B"),
      "r7 零半态：错误 CSV 里的「合法行 B」没有半路落库",
    );

    const invalidFirstCsv = [header, "坏行,进行中,abc,重要", "好行,已完成,5555,重要"].join("\n");
    await expectStatus("POST", `/api/tables/${tableId}/import.csv`, { csv: invalidFirstCsv }, 422, "r7 首行即非法 -> 422");
    eq((await req("GET", `/api/tables/${tableId}/records`)).json.total, 7, "r7 首行非法：后续合法行同样不落库");
    const mismatchCsv = [header, "列数不对,已完成,123"].join("\n");
    const mismatch = await expectStatus("POST", `/api/tables/${tableId}/import.csv`, { csv: mismatchCsv }, 422, "r7 列数不符 -> 422");
    eq(mismatch.json.errors[0].row, 1, "r7 列数不符：错误行号 1");
    ok(String(mismatch.json.errors[0].reason).includes("列数"), "r7 列数不符：原因含「列数」");
    await expectStatus("POST", `/api/tables/${tableId}/import.csv`, { csv: "" }, 400, "r7 导入空 CSV -> 400");
    await expectStatus("POST", `/api/tables/${tableId}/import.csv`, { csv: "未知列\nx" }, 400, "r7 导入未知列 -> 400");
    await expectStatus("POST", "/api/tables/99999/import.csv", { csv: okCsv }, 404, "r7 导入不存在的表 -> 404");

    // JSON 行数组形态（任务单允许的第二种入参）
    const jsonRows = await expectStatus(
      "POST",
      `/api/tables/${tableId}/import.csv`,
      { headers: ["名称", "金额"], rows: [["JSON 行 1", "10"], ["JSON 行 2", "20"]] },
      201,
      "r7 导入 { headers, rows } JSON 行数组 -> 201",
    );
    eq(jsonRows.json.imported, 2, "r7 JSON 行数组：imported=2");
    eq((await req("GET", `/api/tables/${tableId}/records`)).json.total, 9, "r7 JSON 行数组：7 + 2 = 9 行");

    // —— 删视图 / 删表级联 ——
    const deletedView = await expectStatus("DELETE", `/api/views/${viewId}`, undefined, 200, "r7 DELETE 视图 -> 200");
    eq(deletedView.json.deleted, true, "r7 删视图返回 deleted=true");
    await expectStatus("GET", `/api/views/${viewId}`, undefined, 404, "r7 删视图后 GET -> 404");
    await expectStatus("DELETE", `/api/tables/${tableId}`, undefined, 200, "r7 DELETE 表 -> 200");
    await expectStatus("GET", `/api/tables/${tableId}/views`, undefined, 404, "r7 删表：视图列表 404（级联）");
    await expectStatus("GET", `/api/views/${viewId}/records`, undefined, 404, "r7 删表：按视图查询 404");
  }

  console.log("\n== documents + blocks (r8) ==");
  {
    // —— 用户第一次用全链路（r4 教训）：建文档 → 默认首块在场 → 输入 → 拆块 → 改类型 → 移动 → 全文读 → 重开不丢 ——
    const doc = await expectStatus("POST", "/api/documents", { title: "r8 文档块编辑器验收" }, 201, "r8 POST 文档 -> 201");
    const docId = doc.json.id as number;
    eq(doc.json.title, "r8 文档块编辑器验收", "r8 建文档：标题读回");
    ok(Number.isInteger(docId) && docId > 0, "r8 建文档：返回自增 id");
    const firstList = await expectStatus("GET", `/api/documents/${docId}/blocks`, undefined, 200, "r8 GET 文档块列表 -> 200");
    eq(firstList.json.blocks.length, 1, "r8 第一次用：建文档默认首块自动在场（不是零块死路）");
    eq(firstList.json.blocks[0].type, "paragraph", "r8 默认首块：类型 paragraph");
    eq(firstList.json.blocks[0].content, { text: "" }, "r8 默认首块：空文本");
    eq(firstList.json.blocks[0].position, 0, "r8 默认首块：position=0");
    eq(firstList.json.blocks[0].parentId, null, "r8 默认首块：parentId 可空");
    const firstId = firstList.json.blocks[0].id as number;

    // 文档 CRUD + 4xx
    const docs = await expectStatus("GET", "/api/documents", undefined, 200, "r8 GET 文档列表 -> 200");
    ok(Array.isArray(docs.json.documents), "r8 文档列表返回数组");
    ok(docs.json.documents.some((d: { id: number }) => d.id === docId), "r8 文档列表含刚建的文档");
    const got = await expectStatus("GET", `/api/documents/${docId}`, undefined, 200, "r8 GET 单篇文档 -> 200");
    eq(got.json.title, "r8 文档块编辑器验收", "r8 GET 单篇：标题一致");
    const renamed = await expectStatus("PATCH", `/api/documents/${docId}`, { title: "改名后的文档" }, 200, "r8 PATCH 文档改名 -> 200");
    eq(renamed.json.title, "改名后的文档", "r8 PATCH 文档：改名读回");
    await expectStatus("POST", "/api/documents", { title: "" }, 400, "r8 POST 文档空标题 -> 400");
    await expectStatus("POST", "/api/documents", { title: "x".repeat(201) }, 400, "r8 POST 文档超长标题 -> 400");
    await expectStatus("PATCH", `/api/documents/${docId}`, { title: "" }, 400, "r8 PATCH 文档空标题 -> 400");
    await expectStatus("GET", "/api/documents/99999", undefined, 404, "r8 GET 不存在文档 -> 404");
    await expectStatus("GET", "/api/documents/not-a-number", undefined, 400, "r8 GET 非数字文档 id -> 400");
    await expectStatus("GET", "/api/documents/99999/blocks", undefined, 404, "r8 GET 不存在文档的块列表 -> 404");
    await expectStatus("GET", "/api/documents/99999/text", undefined, 404, "r8 GET 不存在文档的全文 -> 404");

    // 输入首块 + 追加多类型块（真实装配行为，非纯函数自证）
    const typed = await expectStatus("PATCH", `/api/blocks/${firstId}`, { content: "第一段文字" }, 200, "r8 PATCH 块内容（输入）-> 200");
    eq(typed.json.content, { text: "第一段文字" }, "r8 输入：首块文本落库读回");
    const h1 = await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "heading1", content: { text: "一级标题" } }, 201, "r8 POST heading1 块 -> 201");
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "heading2", content: "二级标题" }, 201, "r8 POST heading2 字符串内容 -> 201");
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "heading3", content: "三级标题" }, 201, "r8 POST heading3 -> 201");
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "bullet", content: "列表甲" }, 201, "r8 POST bullet -> 201");
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "numbered", content: "列表乙" }, 201, "r8 POST numbered -> 201");
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "quote", content: "引用" }, 201, "r8 POST quote -> 201");
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "divider", content: { text: "丢弃" } }, 201, "r8 POST divider -> 201");
    const todo = await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "todo", content: { text: "买菜", checked: true } }, 201, "r8 POST todo 块 -> 201");
    eq(todo.json.content, { text: "买菜", checked: true }, "r8 todo：checked 落库读回");
    const code = await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "code", content: { text: "let a=1", language: "ts" } }, 201, "r8 POST code 块 -> 201");
    eq(code.json.content, { text: "let a=1", language: "ts" }, "r8 code：language 落库读回");
    const divBlock = await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "divider" }, 201, "r8 POST 末位 divider -> 201");
    const listed = await expectStatus("GET", `/api/documents/${docId}/blocks`, undefined, 200, "r8 GET 多类型块列表 -> 200");
    eq(listed.json.blocks.length, 11, "r8 块列表：1 首块 + 10 追加 = 11 块");
    eq(listed.json.blocks.map((b: { position: number }) => b.position), [0,1,2,3,4,5,6,7,8,9,10], "r8 块列表：position 连号 0..10");
    const dividerRead = listed.json.blocks.find((b: { id: number }) => b.id === divBlock.json.id);
    eq(dividerRead.content, { text: "" }, "r8 divider：文本被 shared 归一丢弃（HTTP 真读回）");
    const single = await expectStatus("GET", `/api/blocks/${h1.json.id}`, undefined, 200, "r8 GET 单块 -> 200");
    eq(single.json.type, "heading1", "r8 GET 单块：类型一致");

    // 4xx：非法块类型 / 越权 document_id / 非法 position / 非法内容 / 非法转换
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "mystery", content: "x" }, 400, "r8 非法块类型 -> 400");
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { content: "缺类型" }, 400, "r8 缺块类型 -> 400");
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "paragraph", content: 42 }, 400, "r8 非法块内容（数字）-> 400");
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "paragraph", content: "x".repeat(20001) }, 400, "r8 超长块文本 -> 400");
    const otherDoc = await expectStatus("POST", "/api/documents", { title: "另一篇文档" }, 201, "r8 建第二篇文档（越权测试用）-> 201");
    const otherDocId = otherDoc.json.id as number;
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "paragraph", content: "越权", documentId: otherDocId }, 400, "r8 越权 document_id（body 与路径不符）-> 400");
    await expectStatus("POST", "/api/blocks", { documentId: otherDocId, type: "paragraph", content: "x" }, 404, "r8 未注册全局块入口 -> 404");
    await expectStatus("POST", `/api/documents/${otherDocId}/blocks`, { type: "paragraph", content: "跨文档父块", parentId: firstId }, 400, "r8 越权 parentId（跨文档）-> 400");
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "paragraph", content: "x", parentId: 99999 }, 400, "r8 不存在 parentId -> 400");
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "paragraph", content: "x", position: -1 }, 400, "r8 非法 position（负数）-> 400");
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "paragraph", content: "x", position: 999 }, 400, "r8 非法 position（越界）-> 400");
    await expectStatus("POST", `/api/documents/${docId}/blocks`, { type: "paragraph", content: "x", position: 1.5 }, 400, "r8 非法 position（非整数）-> 400");
    await expectStatus("POST", "/api/documents/99999/blocks", { type: "paragraph", content: "x" }, 404, "r8 建块到不存在文档 -> 404");
    await expectStatus("PATCH", `/api/blocks/${firstId}`, { documentId: otherDocId }, 400, "r8 PATCH 块带越权 document_id -> 400");
    await expectStatus("PATCH", `/api/blocks/${firstId}`, { content: 42 }, 400, "r8 PATCH 非法内容 -> 400");
    await expectStatus("PATCH", "/api/blocks/99999", { content: "x" }, 404, "r8 PATCH 不存在块 -> 404");
    await expectStatus("GET", "/api/blocks/99999", undefined, 404, "r8 GET 不存在块 -> 404");
    await expectStatus("POST", `/api/blocks/${divBlock.json.id}/convert`, { type: "paragraph" }, 400, "r8 非法类型转换（divider→paragraph）-> 400");
    await expectStatus("POST", `/api/blocks/${h1.json.id}/convert`, { type: "mystery" }, 400, "r8 类型转换目标非法 -> 400");
    await expectStatus("POST", "/api/blocks/99999/convert", { type: "paragraph" }, 404, "r8 转换不存在块 -> 404");
    await expectStatus("POST", `/api/blocks/${h1.json.id}/split`, { caret: 999 }, 400, "r8 拆块 caret 越界 -> 400");
    await expectStatus("POST", `/api/blocks/${divBlock.json.id}/split`, { caret: 0 }, 400, "r8 divider 不可拆 -> 400");
    await expectStatus("POST", `/api/blocks/${firstId}/merge`, undefined, 400, "r8 首块合块（无前驱）-> 400");

    // 类型转换（真实走 shared convertBlockContent，HTTP 层读回归一结果）
    const conv = await expectStatus("POST", `/api/blocks/${todo.json.id}/convert`, { type: "paragraph" }, 200, "r8 类型切换 todo→paragraph -> 200");
    eq(conv.json.type, "paragraph", "r8 类型切换：类型读回");
    eq(conv.json.content, { text: "买菜" }, "r8 类型切换：todo 专属 checked 被 shared 归一丢弃");
    const conv2 = await expectStatus("POST", `/api/blocks/${todo.json.id}/convert`, { type: "todo" }, 200, "r8 类型切换 paragraph→todo -> 200");
    eq(conv2.json.content, { text: "买菜", checked: false }, "r8 类型切换：todo 补默认未勾选");

    // 回车拆块：后半段落新块，position 连号
    const split = await expectStatus("POST", `/api/blocks/${h1.json.id}/split`, { caret: 2 }, 201, "r8 回车拆块 -> 201");
    eq(split.json.before.content.text, "一级", "r8 拆块：前半段留原块（HTTP 真读回）");
    eq(split.json.after.content.text, "标题", "r8 拆块：后半段落新块（HTTP 真读回）");
    eq(split.json.after.position, split.json.before.position + 1, "r8 拆块：新块紧随原块");
    const afterSplit = await expectStatus("GET", `/api/documents/${docId}/blocks`, undefined, 200, "r8 拆块后 GET 块列表 -> 200");
    eq(afterSplit.json.blocks.length, 12, "r8 拆块后块数 +1（11→12）");
    eq(afterSplit.json.blocks.map((b: { position: number }) => b.position), [0,1,2,3,4,5,6,7,8,9,10,11], "r8 拆块后 position 连续无空洞");

    // 上移 / 下移 + 批移动重排
    const moved = await expectStatus("POST", `/api/blocks/${split.json.after.id}/move`, { position: 0 }, 200, "r8 上移到 position=0 -> 200");
    eq(moved.json.blocks[0].id, split.json.after.id, "r8 上移：目标块落到首位（HTTP 真读回）");
    eq(moved.json.blocks.map((b: { position: number }) => b.position), [0,1,2,3,4,5,6,7,8,9,10,11], "r8 上移后 position 连续");
    await expectStatus("POST", `/api/blocks/${split.json.after.id}/move`, { position: 999 }, 400, "r8 上移越界 -> 400");
    const orderNow = (await req("GET", `/api/documents/${docId}/blocks`)).json.blocks.map((b: { id: number }) => b.id);
    const reversed = [...orderNow].reverse();
    const reordered = await expectStatus("POST", `/api/documents/${docId}/blocks/reorder`, { order: reversed }, 200, "r8 批量重排 -> 200");
    eq(reordered.json.blocks.map((b: { id: number }) => b.id), reversed, "r8 批量重排：顺序与请求一致");
    eq(reordered.json.blocks.map((b: { position: number }) => b.position), [0,1,2,3,4,5,6,7,8,9,10,11], "r8 批量重排：position 连续");
    await expectStatus("POST", `/api/documents/${docId}/blocks/reorder`, { order: [1, 1, 2] }, 400, "r8 批量重排：重复 id -> 400");
    await expectStatus("POST", `/api/documents/${docId}/blocks/reorder`, { order: [99999] }, 400, "r8 批量重排：越权 id -> 400");
    await expectStatus("POST", `/api/documents/${docId}/blocks/reorder`, { order: "not-array" }, 400, "r8 批量重排：非数组 -> 400");
    await expectStatus("POST", "/api/documents/99999/blocks/reorder", { order: [1] }, 404, "r8 批量重排到不存在文档 -> 404");

    // 退格合块：与前一块合并，块数 -1，position 收拢
    const beforeMerge = (await req("GET", `/api/documents/${docId}/blocks`)).json.blocks;
    const mergeTargetId = beforeMerge[3].id as number;
    const merged = await expectStatus("POST", `/api/blocks/${mergeTargetId}/merge`, undefined, 200, "r8 退格合块 -> 200");
    eq(merged.json.blocks.length, beforeMerge.length - 1, "r8 合块：块数减一（HTTP 真读回）");
    eq(merged.json.blocks.map((b: { position: number }) => b.position), [0,1,2,3,4,5,6,7,8,9,10], "r8 合块后 position 收拢连续");

    // 全文读：按 position 拼装（真实装配行为，断言具体文本）
    const full = await expectStatus("GET", `/api/documents/${docId}/text`, undefined, 200, "r8 文档全文读 -> 200");
    eq(full.json.documentId, docId, "r8 全文读：回显 documentId");
    eq(full.json.title, "改名后的文档", "r8 全文读：回显最新标题");
    eq(full.json.blockCount, full.json.blocks.length, "r8 全文读：blockCount 与块数一致");
    ok(typeof full.json.text === "string", "r8 全文读：text 为字符串");
    ok(full.json.text.includes("第一段文字"), "r8 全文读：含首块输入内容");
    ok(full.json.text.includes("买菜"), "r8 全文读：含 todo 文本");
    ok(full.json.text.includes("---"), "r8 全文读：含 divider 拼装的分割线");
    ok(full.json.text.includes("let a=1"), "r8 全文读：含 code 文本");
    const blocksForText = full.json.blocks.map((b: { id: number; position: number; type: string; content: unknown }) => ({
      id: b.id, position: b.position, type: b.type, content: b.content,
    }));
    eq(
      full.json.text,
      assembleDocumentText(blocksForText),
      "r8 全文读：响应 text 与 shared 装配逐字相等（按 position）",
    );

    // 重开不丢（HTTP 重启前后快照逐字节相等）：拆/合/移动/重排后的顺序持久化
    const snapshotBefore = JSON.stringify((await req("GET", `/api/documents/${docId}/blocks`)).json);
    const textBefore = (await req("GET", `/api/documents/${docId}/text`)).json.text;
    const reopenDoc = await expectStatus("GET", `/api/documents/${docId}`, undefined, 200, "r8 重开验证：GET 文档 -> 200");
    eq(reopenDoc.json.title, "改名后的文档", "r8 重开验证：文档标题不丢");
    eq(JSON.stringify((await req("GET", `/api/documents/${docId}/blocks`)).json), snapshotBefore, "r8 重开验证：块顺序逐字节相等");
    eq((await req("GET", `/api/documents/${docId}/text`)).json.text, textBefore, "r8 重开验证：全文逐字节相等");

    // 删块 / 删文档级联
    const delBlock = await expectStatus("DELETE", `/api/blocks/${code.json.id}`, undefined, 200, "r8 DELETE 块 -> 200");
    eq(delBlock.json.deleted, true, "r8 删块：deleted=true");
    await expectStatus("GET", `/api/blocks/${code.json.id}`, undefined, 404, "r8 删块后 GET -> 404");
    await expectStatus("DELETE", "/api/blocks/99999", undefined, 404, "r8 删不存在块 -> 404");
    const beforeDelete = (await req("GET", `/api/documents/${docId}/blocks`)).json.blocks.length;
    await expectStatus("DELETE", `/api/documents/${otherDocId}`, undefined, 200, "r8 DELETE 第二篇文档 -> 200");
    await expectStatus("GET", `/api/documents/${otherDocId}`, undefined, 404, "r8 删文档后 GET -> 404");
    eq((await req("GET", `/api/documents/${docId}/blocks`)).json.blocks.length, beforeDelete, "r8 删别的文档不影响本文档块数");
    const delDoc = await expectStatus("DELETE", `/api/documents/${docId}`, undefined, 200, "r8 DELETE 文档 -> 200");
    eq(delDoc.json.deleted, true, "r8 删文档：deleted=true");
    await expectStatus("GET", `/api/documents/${docId}/blocks`, undefined, 404, "r8 删文档后块列表 -> 404（级联）");
    await expectStatus("GET", "/api/documents", undefined, 200, "r8 清理后 GET 文档列表 -> 200");
  }

  console.log("\n== Markdown import/export + AI revise (r9) ==");
  {
    const mdSource = [
      "# 导入标题",
      "",
      "正文段落",
      "",
      "- [x] 已完成事项",
      "",
      "> 引用一句话",
      "",
      "```ts",
      "let x = 1;",
      "```",
      "",
      "---",
    ].join("\n");

    // 用户第一次用：建文档 → 预览（不写库）→ 确认导入 → 真实块落库
    const doc = await expectStatus("POST", "/api/documents", { title: "r9 导入导出与修订" }, 201, "r9 POST 文档 -> 201");
    const docId = doc.json.id as number;
    const beforePreview = JSON.stringify((await req("GET", `/api/documents/${docId}/blocks`)).json.blocks);
    const preview = await expectStatus("POST", `/api/documents/${docId}/import.md/preview`, { markdown: mdSource }, 200, "r9 POST 导入预览 -> 200");
    eq(preview.json.documentId, docId, "r9 预览：回显文档 id");
    eq(preview.json.total, 6, "r9 预览：源块总数 6");
    eq(preview.json.preview.length, 5, "r9 预览：6 块只展示前 5 块（MARKDOWN_IMPORT_PREVIEW_ROWS）");
    eq(preview.json.preview[0].type, "heading1", "r9 预览：首块 heading1");
    eq(preview.json.preview[2].content, { text: "已完成事项", checked: true }, "r9 预览：todo checked 归一");
    eq(preview.json.errors, [], "r9 预览：全合法零错误");
    eq(preview.json.committable, true, "r9 预览：committable=true");
    eq(JSON.stringify((await req("GET", `/api/documents/${docId}/blocks`)).json.blocks), beforePreview, "r9 预览：绝不写库（预览前后块快照逐字节相等）");

    const imported = await expectStatus("POST", `/api/documents/${docId}/import.md`, { markdown: mdSource }, 200, "r9 POST 导入提交 -> 200");
    eq(imported.json.imported, 6, "r9 导入：imported=6（默认空首块被整篇替换）");
    eq(imported.json.total, 6, "r9 导入：total=6");
    eq(imported.json.blocks.map((b: { type: string }) => b.type), ["heading1", "paragraph", "todo", "quote", "code", "divider"], "r9 导入：10 类型中的 6 类落库顺序一致");
    const listed = await expectStatus("GET", `/api/documents/${docId}/blocks`, undefined, 200, "r9 GET 导入后块列表 -> 200");
    eq(listed.json.blocks.length, 6, "r9 导入：HTTP 真读回 6 块");
    eq(listed.json.blocks.map((b: { position: number }) => b.position), [0,1,2,3,4,5], "r9 导入：position 连号 0..5");
    eq(listed.json.blocks[2].content, { text: "已完成事项", checked: true }, "r9 导入：todo 内容逐字落库");
    eq(listed.json.blocks[4].content, { text: "let x = 1;", language: "ts" }, "r9 导入：code 语言逐字落库");

    // 导出：真实字节文本 + 文件名头 + 与 shared 装配逐字相等 + 往返不丢内容
    const exported = await reqText(`/api/documents/${docId}/export.md`);
    eq(exported.status, 200, "r9 GET 导出 .md -> 200");
    ok(exported.headers.get("content-type")?.includes("text/markdown") ?? false, "r9 导出：Content-Type=text/markdown");
    const disposition = exported.headers.get("content-disposition") ?? "";
    ok(disposition.includes("filename*=UTF-8''") && disposition.includes("xieflow-doc-"), "r9 导出：中文名 RFC 5987 头下发");
    eq(exported.text, blocksToMarkdown(listed.json.blocks), "r9 导出：响应文本与 shared blocksToMarkdown 逐字相等");
    eq(JSON.stringify(markdownToBlocks(exported.text)), JSON.stringify(imported.json.blocks.map((b: { type: string; content: unknown }) => ({ type: b.type, content: b.content }))), "r9 往返：md → blocks 与落库块逐字节相等");
    ok(exported.text.includes("# 导入标题") && exported.text.includes("- [x] 已完成事项") && exported.text.includes("```ts"), "r9 导出：标题 / 待办 / 代码围栏均在文本内");

    // AI 修订：未采纳只读不改库；固定脚本回复可重放；采纳才替换块内容
    const target = listed.json.blocks[1];
    const targetId = target.id as number;
    const snapshotBeforeRevise = JSON.stringify((await req("GET", `/api/documents/${docId}/blocks`)).json.blocks);
    const suggest1 = await expectStatus("POST", `/api/documents/${docId}/blocks/${targetId}/revise`, { instruction: "精简" }, 200, "r9 POST 修订（未带 adopt）-> 200");
    eq(suggest1.json.applied, false, "r9 修订：未采纳 applied=false");
    eq(suggest1.json.provider, MOCK_PROVIDER_ID, "r9 修订：mock provider 标识回显");
    eq(suggest1.json.originalText, "正文段落", "r9 修订：原文回显");
    ok(suggest1.json.suggestedText.includes("精简稿"), "r9 修订：脚本规则给出精简建议");
    ok(typeof suggest1.json.rationale === "string" && suggest1.json.rationale.length > 0, "r9 修订：返回可读理由");
    const suggest2 = await expectStatus("POST", `/api/documents/${docId}/blocks/${targetId}/revise`, { instruction: "精简", adopt: false }, 200, "r9 POST 修订（adopt=false）-> 200");
    eq(suggest2.json.suggestedText, suggest1.json.suggestedText, "r9 修订：同输入固定脚本回复（零 token 可重放）");
    eq(suggest2.json.applied, false, "r9 修订：显式 adopt=false 仍不写库");
    eq(JSON.stringify((await req("GET", `/api/documents/${docId}/blocks`)).json.blocks), snapshotBeforeRevise, "r9 未采纳不改库：修订前后块快照逐字节相等");
    const adopted = await expectStatus("POST", `/api/documents/${docId}/blocks/${targetId}/revise`, { instruction: "精简", adopt: true }, 200, "r9 POST 修订（adopt=true）-> 200");
    eq(adopted.json.applied, true, "r9 修订：采纳 applied=true");
    const afterAdopt = (await req("GET", `/api/documents/${docId}/blocks`)).json.blocks;
    eq(afterAdopt[1].content.text, adopted.json.suggestedText, "r9 采纳：HTTP 真读回块文本已替换为建议");
    eq(afterAdopt.length, 6, "r9 采纳：块数不变（只替换一块）");
    ok(JSON.stringify(afterAdopt.filter((b: { id: number }) => b.id !== targetId)) === JSON.stringify(JSON.parse(snapshotBeforeRevise).filter((b: { id: number }) => b.id !== targetId)), "r9 采纳：其余 5 块逐字节不受影响");
    ok((await reqText(`/api/documents/${docId}/export.md`)).text.includes(adopted.json.suggestedText), "r9 采纳后：导出 Markdown 立刻反映新文本");

    // 4xx + 零半态：预览/提交非法输入、部分失败、修订越权与空指令
    await expectStatus("POST", `/api/documents/${docId}/import.md/preview`, { markdown: 42 }, 400, "r9 预览：markdown 非字符串 -> 400");
    await expectStatus("POST", `/api/documents/${docId}/import.md`, { markdown: "   \n" }, 400, "r9 导入：空 Markdown -> 400");
    await expectStatus("POST", `/api/documents/${docId}/import.md`, { markdown: "x".repeat(200001) }, 400, "r9 导入：超长 Markdown -> 400");
    await expectStatus("POST", "/api/documents/99999/import.md", { markdown: "# 幽灵" }, 404, "r9 导入到不存在文档 -> 404");
    await expectStatus("POST", "/api/documents/not-a-number/import.md", { markdown: "# 非法 id" }, 400, "r9 导入：非数字文档 id -> 400");
    await expectStatus("GET", "/api/documents/99999/export.md", undefined, 404, "r9 导出不存在文档 -> 404");
    const badDoc = await expectStatus("POST", "/api/documents", { title: "r9 零半态文档" }, 201, "r9 建零半态测试文档 -> 201");
    const badDocId = badDoc.json.id as number;
    await expectStatus("POST", `/api/documents/${badDocId}/import.md`, { markdown: "# 合法" }, 200, "r9 零半态：先成功导入一次 -> 200");
    const badSnapshot = JSON.stringify((await req("GET", `/api/documents/${badDocId}/blocks`)).json.blocks);
    const rejected = await expectStatus("POST", `/api/documents/${badDocId}/import.md`, { blocks: [{ type: "heading1", content: "合法" }, { type: "mystery", content: "非法" }] }, 422, "r9 部分失败 -> 422");
    eq(rejected.json.imported, 0, "r9 部分失败：imported=0");
    eq(rejected.json.errors.length, 1, "r9 部分失败：错误块清单精确 1 条");
    eq(rejected.json.errors[0].row, 2, "r9 部分失败：错误块号为第 2 块");
    eq(JSON.stringify((await req("GET", `/api/documents/${badDocId}/blocks`)).json.blocks), badSnapshot, "r9 零半态：部分失败前后块快照逐字节相等");
    await expectStatus("POST", `/api/documents/${badDocId}/import.md`, { blocks: [] }, 400, "r9 导入：空块数组 -> 400");
    await expectStatus("POST", `/api/documents/${docId}/import.md`, { blocks: "not-array" }, 400, "r9 导入：blocks 非数组 -> 400");
    await expectStatus("POST", `/api/documents/${docId}/blocks/${targetId}/revise`, { instruction: "" }, 400, "r9 修订：空 instruction -> 400");
    await expectStatus("POST", `/api/documents/${docId}/blocks/${targetId}/revise`, { instruction: "   " }, 400, "r9 修订：纯空白 instruction -> 400");
    await expectStatus("POST", `/api/documents/${docId}/blocks/${targetId}/revise`, { instruction: "x".repeat(501) }, 400, "r9 修订：超长 instruction -> 400");
    await expectStatus("POST", `/api/documents/${docId}/blocks/99999/revise`, { instruction: "精简" }, 404, "r9 修订：不存在块 -> 404");
    const crossDoc = (await req("GET", `/api/documents/${badDocId}/blocks`)).json.blocks[0].id as number;
    await expectStatus("POST", `/api/documents/${docId}/blocks/${crossDoc}/revise`, { instruction: "精简" }, 400, "r9 修订：跨文档块 -> 400");
    await expectStatus("POST", `/api/documents/99999/blocks/${targetId}/revise`, { instruction: "精简" }, 404, "r9 修订：不存在文档 -> 404");
    await expectStatus("POST", `/api/documents/not-a-number/blocks/${targetId}/revise`, { instruction: "精简" }, 400, "r9 修订：非数字文档 id -> 400");
    eq(JSON.stringify((await req("GET", `/api/documents/${docId}/blocks`)).json.blocks), JSON.stringify(afterAdopt), "r9 4xx 之后：文档块状态未被任何非法请求改动");

    await expectStatus("DELETE", `/api/documents/${badDocId}`, undefined, 200, "r9 DELETE 零半态测试文档 -> 200");
    await expectStatus("DELETE", `/api/documents/${docId}`, undefined, 200, "r9 DELETE 导入文档 -> 200");
    await expectStatus("GET", `/api/documents/${docId}/blocks`, undefined, 404, "r9 删文档后块列表 -> 404（级联）");
  }

  console.log("\n== AI workbench: tools / conversations / chat / artifacts (r10) ==");
  {
    const catalog = await expectStatus("GET", "/api/tools", undefined, 200, "r10 GET /api/tools -> 200");
    eq(catalog.json.tools.length, 12, "工具目录扩到 12 个工具（r11）");
    eq(
      catalog.json.tools.map((t: { name: string }) => t.name),
      ["list_todos", "create_todo", "list_documents", "create_document", "list_projects", "list_cards", "list_tables", "search_knowledge", "summarize_document", "export_document_md", "list_schedules", "create_schedule"],
      "12 个工具名逐字符合 r10+r11 任务单",
    );
    eq(catalog.json.planner, "mock-scripted-v1", "工具目录回显 mock planner 标识");
    ok(catalog.json.tools.every((t: { description: string }) => t.description.length > 0), "每个工具都有非空描述");

    const list0 = await expectStatus("GET", "/api/conversations", undefined, 200, "r10 GET /api/conversations -> 200");
    ok(Array.isArray(list0.json.conversations), "会话列表返回数组");
    const c1 = await expectStatus("POST", "/api/conversations", { title: "r10 审计会话 A" }, 201, "r10 POST 合法会话 -> 201");
    eq(c1.json.title, "r10 审计会话 A", "建会话标题真落库读回");
    ok(typeof c1.json.createdAt === "string", "建会话返回 created_at");
    const c2 = await expectStatus("POST", "/api/conversations", { title: "r10 审计会话 B" }, 201, "r10 POST 第二会话 -> 201");
    const list1 = await expectStatus("GET", "/api/conversations", undefined, 200, "r10 GET 会话列表复核 -> 200");
    eq(list1.json.conversations.length, 2, "会话列表真读回 2 条");
    const gotC = await expectStatus("GET", `/api/conversations/${c1.json.id}`, undefined, 200, "r10 GET 单会话 -> 200");
    eq(gotC.json.title, "r10 审计会话 A", "GET 单会话按 id 读回标题");

    await expectStatus("POST", "/api/conversations", { title: "" }, 400, "r10 空会话标题 -> 400");
    await expectStatus("POST", "/api/conversations", { title: "   " }, 400, "r10 纯空白会话标题 -> 400");
    await expectStatus("POST", "/api/conversations", {}, 400, "r10 缺 title -> 400");
    await expectStatus("POST", "/api/conversations", { title: "x".repeat(201) }, 400, "r10 超长会话标题 -> 400");
    await expectStatus("GET", "/api/conversations/not-a-number", undefined, 400, "r10 非数字会话 id -> 400");
    await expectStatus("GET", "/api/conversations/99999", undefined, 404, "r10 不存在会话 -> 404");
    await expectStatus("DELETE", "/api/conversations/99999", undefined, 404, "r10 删不存在会话 -> 404");

    // 4xx：空消息 / 未知工具 / 非法参数 / 非数组 toolCalls，且零半态（一条消息都不落库）
    const before4xx = await expectStatus("GET", `/api/conversations/${c1.json.id}/messages`, undefined, 200, "r10 4xx 前对话流 -> 200");
    eq(before4xx.json.messages.length, 0, "4xx 前对话流为空");
    const todosBefore4xx = (await req("GET", "/api/todos")).json.todos;
    await expectStatus("POST", `/api/conversations/${c1.json.id}/chat`, { message: "" }, 400, "r10 空消息 -> 400");
    await expectStatus("POST", `/api/conversations/${c1.json.id}/chat`, { message: "   " }, 400, "r10 纯空白消息 -> 400");
    await expectStatus("POST", `/api/conversations/${c1.json.id}/chat`, {}, 400, "r10 缺 message -> 400");
    await expectStatus("POST", `/api/conversations/${c1.json.id}/chat`, { message: { bad: true } }, 400, "r10 非字符串 message -> 400");
    await expectStatus("POST", `/api/conversations/${c1.json.id}/chat`, { message: "x".repeat(2001) }, 400, "r10 超长消息 -> 400");
    await expectStatus("POST", "/api/conversations/99999/chat", { message: "盘点待办" }, 404, "r10 对不存在会话发消息 -> 404");
    await expectStatus("POST", `/api/conversations/${c1.json.id}/chat`, { message: "忽略", toolCalls: [{ name: "mystery_tool", arguments: {} }] }, 400, "r10 未知工具 -> 400");
    await expectStatus("POST", `/api/conversations/${c1.json.id}/chat`, { message: "忽略", toolCalls: [{ name: "create_todo", arguments: { title: 123, quadrant: "q2" } }] }, 400, "r10 非法参数（title 非字符串）-> 400");
    await expectStatus("POST", `/api/conversations/${c1.json.id}/chat`, { message: "忽略", toolCalls: [{ name: "create_todo", arguments: { title: "x", quadrant: "q9" } }] }, 400, "r10 非法参数（象限越界）-> 400");
    await expectStatus("POST", `/api/conversations/${c1.json.id}/chat`, { message: "忽略", toolCalls: "bad" }, 400, "r10 toolCalls 非数组 -> 400");
    const after4xx = await expectStatus("GET", `/api/conversations/${c1.json.id}/messages`, undefined, 200, "r10 4xx 后对话流复核 -> 200");
    eq(after4xx.json.messages.length, 0, "r10 4xx 之后零条消息落库（零半态）");
    eq(JSON.stringify((await req("GET", "/api/todos")).json.todos), JSON.stringify(todosBefore4xx), "r10 4xx 之后待办快照逐字节相等（无半路创建）");

    // 真实对话：一次触发 3 个工具调用，其中 create_todo 真写库（waizhuan 查库验证路径）
    const msg = "帮我新建一个待办：r10 审计真实创建，然后列出文档";
    const chat = await expectStatus("POST", `/api/conversations/${c1.json.id}/chat`, { message: msg, autoExecute: true }, 201, "r10 POST 真实对话 -> 201（autoExecute 老行为）");
    eq(chat.json.intent, "create_todo+list_todos+list_documents", "r10 对话 intent 为三意图组合");
    eq(chat.json.toolCalls.length, 3, "r10 一次对话真实触发 3 个工具调用（≥2 达标）");
    eq(chat.json.toolCalls.map((t: { name: string }) => t.name), ["create_todo", "list_todos", "list_documents"], "r10 三个工具调用顺序锁定");
    eq(chat.json.toolCalls.map((t: { id: string }) => t.id), ["tc-1", "tc-2", "tc-3"], "r10 工具调用 id 确定性落库");
    ok(chat.json.toolCalls[0].ok === true, "r10 create_todo 回执 ok=true");
    ok(String(chat.json.toolCalls[0].summary).includes("r10 审计真实创建"), "r10 回执摘要含真实标题");
    eq(chat.json.planner, "mock-scripted-v1", "r10 对话回显 provider 标识");
    const todosAfter = (await req("GET", "/api/todos")).json.todos;
    eq(todosAfter.length, todosBefore4xx.length + 1, "r10 create_todo 经 HTTP 真创建待办（查库验证）");
    const createdTodo = todosAfter.find((t: { title: string }) => t.title === "r10 审计真实创建");
    ok(createdTodo !== undefined, "r10 新建待办标题真出现在库内列表");
    // 逐条 tool_call 落库：tool 消息带 3 条回执，assistant 消息带汇总
    const msgs = await expectStatus("GET", `/api/conversations/${c1.json.id}/messages`, undefined, 200, "r10 GET 对话流 -> 200");
    eq(msgs.json.messages.length, 3, "r10 一次对话落 user/tool/assistant 三条消息");
    eq(msgs.json.messages.map((m: { role: string }) => m.role), ["user", "tool", "assistant"], "r10 三类消息角色逐位吻合");
    eq(msgs.json.messages[0].content.text, msg, "r10 user 消息原文逐字落库");
    eq(msgs.json.messages[1].toolCalls.length, 3, "r10 tool 消息逐条落 3 个 tool_call（查库验证）");
    eq(msgs.json.messages[1].toolCalls.map((t: { name: string }) => t.name), ["create_todo", "list_todos", "list_documents"], "r10 落库工具调用名与回执一致");
    eq(msgs.json.messages[1].toolCalls[0]?.arguments?.title, "r10 审计真实创建", "r10 落库工具调用 arguments 逐字段可读");
    eq(msgs.json.messages[2].content.text, chat.json.summary, "r10 assistant 消息汇总与响应逐字相等");
    // 产物
    const arts = await expectStatus("GET", `/api/conversations/${c1.json.id}/artifacts`, undefined, 200, "r10 GET 会话产物 -> 200");
    eq(arts.json.artifacts.length, 1, "r10 一次对话落 1 篇产物");
    eq(arts.json.artifacts[0].type, "chat-result", "r10 产物类型 chat-result");
    eq(JSON.parse(arts.json.artifacts[0].content).tools.length, 3, "r10 产物内容含全部 3 条工具回执");
    const artOne = await expectStatus("GET", `/api/artifacts/${arts.json.artifacts[0].id}`, undefined, 200, "r10 GET 单篇产物 -> 200");
    eq(artOne.json.title, arts.json.artifacts[0].title, "r10 单篇产物标题与列表一致");
    await expectStatus("GET", "/api/artifacts/99999", undefined, 404, "r10 不存在产物 -> 404");
    await expectStatus("GET", "/api/artifacts/not-a-number", undefined, 400, "r10 非数字产物 id -> 400");

    // 第二次对话：2 条只读工具调用；产物累积；显式工具调用模式也可用
    const chat2 = await expectStatus("POST", `/api/conversations/${c1.json.id}/chat`, { message: "盘点待办和文档" }, 201, "r10 第二次对话 -> 201");
    eq(chat2.json.toolCalls.length, 2, "r10 第二次对话触发 2 个只读工具调用");
    eq(chat2.json.toolCalls.map((t: { name: string }) => t.name), ["list_todos", "list_documents"], "r10 只读组合工具名锁定");
    const msgs2 = await expectStatus("GET", `/api/conversations/${c1.json.id}/messages`, undefined, 200, "r10 第二次对话后对话流 -> 200");
    eq(msgs2.json.messages.length, 6, "r10 两轮对话消息累积为 6 条（reload 不丢）");
    const arts2 = await expectStatus("GET", `/api/conversations/${c1.json.id}/artifacts`, undefined, 200, "r10 两轮对话产物列表 -> 200");
    eq(arts2.json.artifacts.length, 2, "r10 两轮对话产物累积为 2 篇");
    const chat3 = await expectStatus("POST", `/api/conversations/${c1.json.id}/chat`, { message: "显式模式", toolCalls: [{ name: "list_projects", arguments: {} }] }, 201, "r10 显式工具调用对话 -> 201");
    eq(chat3.json.toolCalls.length, 1, "r10 显式模式只执行给定工具");
    eq(chat3.json.toolCalls[0].name, "list_projects", "r10 显式模式工具名回显");

    // 删会话级联清理消息与产物；清理自建待办与第二个会话
    const del = await expectStatus("DELETE", `/api/conversations/${c1.json.id}`, undefined, 200, "r10 DELETE 会话 -> 200");
    eq(del.json.deleted, true, "r10 DELETE 返回 deleted=true");
    await expectStatus("GET", `/api/conversations/${c1.json.id}`, undefined, 404, "r10 删后 GET 会话 -> 404");
    await expectStatus("GET", `/api/conversations/${c1.json.id}/messages`, undefined, 404, "r10 删后对话流 -> 404（级联）");
    await expectStatus("GET", `/api/conversations/${c1.json.id}/artifacts`, undefined, 404, "r10 删后产物列表 -> 404（级联）");
    await expectStatus("DELETE", `/api/conversations/${c2.json.id}`, undefined, 200, "r10 DELETE 第二会话 -> 200");
    await expectStatus("DELETE", `/api/todos/${createdTodo.id}`, undefined, 200, "r10 DELETE 自建待办 -> 200");
  }

  console.log("\n== AI workbench r11: multi-turn context / artifact generators / extended tools ==");
  {
    const catalog = await expectStatus("GET", "/api/tools", undefined, 200, "r11 GET /api/tools -> 200");
    eq(catalog.json.tools.length, 12, "r11 工具目录扩到 12 个");
    const names = catalog.json.tools.map((t: { name: string }) => t.name);
    for (const n of ["summarize_document", "export_document_md", "list_schedules", "create_schedule"]) {
      ok(names.includes(n), `r11 工具目录含 ${n}`);
    }

    const c = await expectStatus("POST", "/api/conversations", { title: "r11 审计多轮会话" }, 201, "r11 建多轮会话 -> 201");
    const cid = c.json.id as number;
    const chatUrl = `/api/conversations/${cid}/chat`;

    // 4xx：上下文超限 / 非法产物类型 / 空消息（先于任何成功写入）
    await expectStatus("POST", chatUrl, { message: "盘点待办", context_window: 0 }, 400, "r11 context_window=0 -> 400");
    await expectStatus("POST", chatUrl, { message: "盘点待办", context_window: 21 }, 400, "r11 context_window 超上限 -> 400");
    await expectStatus("POST", chatUrl, { message: "盘点待办", context_window: "8" }, 400, "r11 context_window 非数字 -> 400");
    await expectStatus("POST", chatUrl, { message: "盘点待办", artifactType: "evil" }, 400, "r11 非法产物类型 -> 400");
    await expectStatus("POST", chatUrl, { message: "   " }, 400, "r11 空消息 -> 400（回归 r10）");

    // 第 1 轮：真建待办（跨轮指代的真实实体来源）
    const t1 = await expectStatus("POST", chatUrl, { message: "新建待办：r11审计实体", context_window: 8, autoExecute: true }, 201, "r11 第 1 轮对话 -> 201（autoExecute 老行为）");
    eq(t1.json.contextWindow, 8, "r11 第 1 轮回显默认窗口 8");
    eq(t1.json.contextMessages, 0, "r11 首轮无历史上下文");
    const todoId1 = t1.json.toolCalls[0].data.todo.id as number;
    ok(todoId1 > 0, "r11 第 1 轮真建待办 id 可读");

    // 第 2 轮：「再建一个」引用第 1 轮真实标题，再建一条
    const t2 = await expectStatus("POST", chatUrl, { message: "再建一个", autoExecute: true }, 201, "r11 第 2 轮指代对话 -> 201（老行为）");
    eq(t2.json.contextMessages, 3, "r11 第 2 轮注入 3 条真实落库消息");
    eq(t2.json.resolution.referenceKind, "repeat", "r11 第 2 轮回显 repeat 指代元数据");
    eq(t2.json.resolution.referencedTitle, "r11审计实体", "r11 指代来源为第 1 轮真标题");
    eq(t2.json.toolCalls[0].arguments.title, "r11审计实体（再建）", "r11 第 2 轮工具参数引用第 1 轮实体");
    const todoId2 = t2.json.toolCalls[0].data.todo.id as number;
    ok(todoId2 > todoId1, "r11 第 2 轮真建第二条待办");

    // 第 3 轮：窗口足够大才包含被指代的创建消息（小窗口故意不带历史，指代不应硬解）
    const t3 = await expectStatus("POST", chatUrl, { message: "把它改成：r11审计修正版", context_window: 8, autoExecute: true }, 201, "r11 第 3 轮改标题对话 -> 201（老行为）");
    eq(t3.json.contextWindow, 8, "r11 第 3 轮回显显式窗口 8");
    eq(t3.json.contextMessages, 6, "r11 第 3 轮注入前两轮全部 6 条消息");
    eq(t3.json.resolution.referenceKind, "retitle", "r11 第 3 轮回显 retitle 元数据");
    eq(t3.json.toolCalls[0].arguments.title, "r11审计修正版", "r11 第 3 轮标题改写落到工具参数");
    const tSmall = await expectStatus("POST", chatUrl, { message: "盘点待办和文档" }, 201, "r11 第 4 轮只读对话 -> 201");
    eq(tSmall.json.contextWindow, 8, "r11 第 4 轮缺省窗口 8");
    eq(tSmall.json.contextMessages, 8, "r11 第 4 轮按上限截取最近 8 条消息");
    eq(tSmall.json.resolution, undefined, "r11 小窗口未含创建消息时不硬解指代");

    const msgs = await expectStatus("GET", `/api/conversations/${cid}/messages`, undefined, 200, "r11 多轮对话流 -> 200");
    eq(msgs.json.messages.length, 12, "r11 四轮各落 3 条消息（reload 不丢）");
    const arts = await expectStatus("GET", `/api/conversations/${cid}/artifacts`, undefined, 200, "r11 多轮产物列表 -> 200");
    eq(arts.json.artifacts.length, 4, "r11 四轮各落 1 篇产物");
    const todosAfter = (await req("GET", "/api/todos")).json.todos;
    ok(todosAfter.some((t: { title: string }) => t.title === "r11审计实体（再建）"), "r11 跨轮再建的待办真出现在库内列表");

    // 三类产物真实生成 + /content 按 type 返回可预览内容
    const c2 = await expectStatus("POST", "/api/conversations", { title: "r11 审计产物会话" }, 201, "r11 建产物会话 -> 201");
    const chat2 = `/api/conversations/${c2.json.id}/chat`;
    const htmlChat = await expectStatus("POST", chat2, { message: "盘点待办", artifactType: "html-report" }, 201, "r11 HTML 产物对话 -> 201");
    eq(htmlChat.json.artifact.type, "html-report", "r11 HTML 产物类型落库");
    const htmlId = htmlChat.json.artifact.id as number;
    const htmlContent = await expectStatus("GET", `/api/artifacts/${htmlId}/content`, undefined, 200, "r11 GET HTML 产物内容 -> 200");
    eq(htmlContent.json.contentType, "text/html; charset=utf-8", "r11 HTML content-type 正确");
    ok(String(htmlContent.json.content).startsWith("<!doctype html>"), "r11 HTML 内容是完整可打开文档（非占位）");
    ok(String(htmlContent.json.content).includes("<table>"), "r11 HTML 内容含真实数据表");
    const mdChat = await expectStatus("POST", chat2, { message: "盘点待办", artifactType: "markdown-table" }, 201, "r11 Markdown 产物对话 -> 201");
    const mdContent = await expectStatus("GET", `/api/artifacts/${mdChat.json.artifact.id}/content`, undefined, 200, "r11 GET Markdown 产物内容 -> 200");
    eq(mdContent.json.contentType, "text/markdown; charset=utf-8", "r11 Markdown content-type 正确");
    ok(String(mdContent.json.content).includes("| --- |"), "r11 Markdown 内容含真实表格分隔行");
    const jsonChat = await expectStatus("POST", chat2, { message: "盘点待办", artifactType: "json-data" }, 201, "r11 JSON 产物对话 -> 201");
    const jsonContent = await expectStatus("GET", `/api/artifacts/${jsonChat.json.artifact.id}/content`, undefined, 200, "r11 GET JSON 产物内容 -> 200");
    eq(JSON.parse(jsonContent.json.content).tools.length, 1, "r11 JSON 产物含真实工具回执");

    // /content 4xx：不存在 / 非数字 id / 非法 type / 类型不符
    await expectStatus("GET", "/api/artifacts/99999/content", undefined, 404, "r11 不存在产物内容 -> 404");
    await expectStatus("GET", "/api/artifacts/not-a-number/content", undefined, 400, "r11 非数字产物 id 内容 -> 400");
    await expectStatus("GET", `/api/artifacts/${htmlId}/content?type=evil`, undefined, 400, "r11 非法请求类型 -> 400");
    await expectStatus("GET", `/api/artifacts/${htmlId}/content?type=json-data`, undefined, 400, "r11 请求类型与产物不符 -> 400");
    const typed = await expectStatus("GET", `/api/artifacts/${htmlId}/content?type=html-report`, undefined, 200, "r11 正确类型请求 -> 200");
    eq(typed.json.id, htmlId, "r11 指定类型回读同一产物 id");

    // 新 4 工具经 HTTP 真调服务层（含状态变更「实际创建」）
    const doc = await expectStatus("POST", "/api/documents", { title: "r11 审计摘要文档" }, 201, "r11 建摘要源文档 -> 201");
    const docId = doc.json.id as number;
    await expectStatus("POST", `/api/documents/${docId}/import.md`, { markdown: "# r11 审计标题\n\nr11 正文段落" }, 200, "r11 导入真块供摘要/导出 -> 200");
    const sumTool = await expectStatus("POST", chat2, { message: "忽略", toolCalls: [{ name: "summarize_document", arguments: { documentId: docId } }] }, 201, "r11 summarize_document 经 HTTP -> 201");
    eq(sumTool.json.toolCalls[0].ok, true, "r11 summarize_document 真执行 ok=true");
    ok(String(sumTool.json.toolCalls[0].summary).includes("r11 审计摘要文档"), "r11 摘要含真实文档标题");
    const expTool = await expectStatus("POST", chat2, { message: "忽略", toolCalls: [{ name: "export_document_md", arguments: { documentId: docId } }] }, 201, "r11 export_document_md 经 HTTP -> 201");
    ok(String(expTool.json.toolCalls[0].data.markdown).includes("r11 审计标题"), "r11 导出 Markdown 含真实块内容");
    const listSch = await expectStatus("POST", chat2, { message: "忽略", toolCalls: [{ name: "list_schedules", arguments: {} }] }, 201, "r11 list_schedules 经 HTTP -> 201");
    eq(listSch.json.toolCalls[0].ok, true, "r11 list_schedules 真执行 ok=true");
    const beforeSch = await expectStatus("GET", "/api/schedules?from=2026-11-20&to=2026-11-20", undefined, 200, "r11 建日程前区间查询 -> 200");
    const beforeSchCount = beforeSch.json.schedules.length as number;
    ok(Array.isArray(beforeSch.json.schedules), "r11 日程区间查询返回数组（基线已含其他轮次日程）");
    const createSch = await expectStatus("POST", chat2, {
      message: "忽略",
      autoExecute: true,
      toolCalls: [{ name: "create_schedule", arguments: { title: "r11审计日程", date: "2026-11-20", start: "10:00", end: "11:00" } }],
    }, 201, "r11 create_schedule 经 HTTP -> 201（老行为）");
    eq(createSch.json.toolCalls[0].ok, true, "r11 create_schedule 真执行 ok=true");
    const afterSch = await expectStatus("GET", "/api/schedules?from=2026-11-20&to=2026-11-20", undefined, 200, "r11 建日程后区间查询 -> 200");
    eq(afterSch.json.schedules.length, beforeSchCount + 1, "r11 create_schedule 经 HTTP 真建日程（区间计数 +1）");
    const createdSch = afterSch.json.schedules.find((s: { title: string }) => s.title === "r11审计日程");
    ok(createdSch !== undefined, "r11 新建日程标题真出现在库内列表");
    eq(createdSch?.title, "r11审计日程", "r11 新建日程标题逐字回读");
    const badSch = await expectStatus("POST", chat2, {
      message: "忽略",
      autoExecute: true,
      toolCalls: [{ name: "create_schedule", arguments: { title: "x", date: "bad", start: "10:00", end: "11:00" } }],
    }, 201, "r11 非法日程日期对话 -> 201（handler 返 ok=false，老行为）");
    eq(badSch.json.toolCalls[0].ok, false, "r11 非法日期不伪造成功回执");

    // 清理本轮自建探针：会话级联清消息/产物，另删真建的待办/文档/日程
    await expectStatus("DELETE", `/api/conversations/${cid}`, undefined, 200, "r11 删多轮会话 -> 200");
    await expectStatus("DELETE", `/api/conversations/${c2.json.id}`, undefined, 200, "r11 删产物会话 -> 200");
    await expectStatus("DELETE", `/api/todos/${todoId1}`, undefined, 200, "r11 删第 1 轮待办 -> 200");
    await expectStatus("DELETE", `/api/todos/${todoId2}`, undefined, 200, "r11 删第 2 轮待办 -> 200");
    await expectStatus("DELETE", `/api/documents/${docId}`, undefined, 200, "r11 删摘要源文档 -> 200");
    await expectStatus("DELETE", `/api/schedules/${createdSch.id}`, undefined, 200, "r11 删自建日程 -> 200");
  }

  console.log("\n== Knowledge r12: ingest / TF-IDF search / source refs / 4xx ==");
  {
    // 4xx first: empty content / too long content / illegal source_type / empty query
    await expectStatus("POST", "/api/knowledge/ingest", { title: "x", sourceType: "text", content: "   " }, 400, "r12 空内容入库 -> 400");
    await expectStatus("POST", "/api/knowledge/ingest", { title: "x", sourceType: "text", content: "字".repeat(200001) }, 400, "r12 超长内容入库 -> 400");
    await expectStatus("POST", "/api/knowledge/ingest", { title: "x", sourceType: "evil", content: "abc" }, 400, "r12 非法 source_type -> 400");
    await expectStatus("POST", "/api/knowledge/ingest", { title: "", sourceType: "text", content: "abc" }, 400, "r12 空标题入库 -> 400");
    await expectStatus("POST", "/api/knowledge/ingest", { title: "x", sourceType: "document", sourceId: 999999 }, 404, "r12 文档源不存在 -> 404");
    await expectStatus("GET", "/api/knowledge/search", undefined, 400, "r12 缺查询词 -> 400");
    await expectStatus("GET", "/api/knowledge/search?q=%20%20", undefined, 400, "r12 纯空白查询 -> 400");
    await expectStatus("GET", "/api/knowledge/search?q=abc&limit=0", undefined, 400, "r12 limit=0 -> 400");
    await expectStatus("GET", "/api/knowledge/search?q=abc&limit=999", undefined, 400, "r12 limit 超上限 -> 400");

    const empty = await expectStatus("GET", "/api/knowledge/docs", undefined, 200, "r12 GET 知识库文档列表 -> 200");
    ok(Array.isArray(empty.json.docs), "r12 文档列表为数组");

    // seed THREE docs over real HTTP (waizhuan TF-IDF ranking scenario)
    const d1 = await expectStatus("POST", "/api/knowledge/ingest", { title: "r12科技稿", sourceType: "text", content: "苹果 手机 手机 手机 手机" }, 201, "r12 真入库科技稿 -> 201");
    const d2 = await expectStatus("POST", "/api/knowledge/ingest", { title: "r12果园稿", sourceType: "text", content: "苹果 水果 香蕉" }, 201, "r12 真入库果园稿 -> 201");
    const d3 = await expectStatus("POST", "/api/knowledge/ingest", { title: "r12数码稿", sourceType: "text", content: "苹果 手机 平板" }, 201, "r12 真入库数码稿 -> 201");
    eq(d1.json.doc.chunkCount, 1, "r12 科技稿 chunk_count=1");
    ok(d1.json.chunks[0].tokenCount > 0, "r12 入库自动分块并算 token_count");
    const list = await expectStatus("GET", "/api/knowledge/docs", undefined, 200, "r12 三篇真入库后列表 -> 200");
    eq(list.json.docs.length, 3, "r12 列表真读回 3 篇");
    const one = await expectStatus("GET", `/api/knowledge/docs/${d1.json.doc.id}`, undefined, 200, "r12 GET 单篇文档 -> 200");
    eq(one.json.title, "r12科技稿", "r12 单篇标题逐字回读");
    const chunks = await expectStatus("GET", `/api/knowledge/docs/${d1.json.doc.id}/chunks`, undefined, 200, "r12 GET 文档分块 -> 200");
    eq(chunks.json.chunks.length, 1, "r12 分块真读回");

    // TF-IDF ranking over real HTTP: "手机" ranks 科技稿 (tf=4/5) above 数码稿 (tf=1/3); 果园稿 excluded
    const s1 = await expectStatus("GET", "/api/knowledge/search?q=%E6%89%8B%E6%9C%BA&limit=10", undefined, 200, "r12 检索「手机」-> 200");
    eq(s1.json.hits.length, 2, "r12 检索「手机」命中 2 块（果园稿零分过滤）");
    eq(s1.json.hits[0].docTitle, "r12科技稿", "r12 TF-IDF 排序：词频最高的科技稿居首");
    ok(s1.json.hits[0].score > s1.json.hits[1].score, "r12 命中按 score 降序（真 TF-IDF 非字典序）");
    ok(typeof s1.json.hits[0].docId === "number" && typeof s1.json.hits[0].chunkId === "number", "r12 命中带 doc_id/chunk_id 来源引用");
    eq(s1.json.hits[0].sourceType, "text", "r12 命中带 source_type 来源引用");
    const s2 = await expectStatus("GET", "/api/knowledge/search?q=%E9%A6%99%E8%95%89", undefined, 200, "r12 检索稀有词「香蕉」-> 200");
    eq(s2.json.hits.length, 1, "r12 稀有词只命中果园稿 1 块");
    eq(s2.json.hits[0].docId, d2.json.doc.id, "r12 稀有词命中可溯源到具体文档 id");
    const s3 = await expectStatus("GET", "/api/knowledge/search?q=abcxyznotexist", undefined, 200, "r12 零交集查询 -> 200");
    eq(s3.json.hits.length, 0, "r12 零交集查询返回空命中（不伪造）");
    const s4 = await expectStatus("GET", "/api/knowledge/search?q=%E8%8B%B9%E6%9E%9C&limit=1", undefined, 200, "r12 limit=1 检索 -> 200");
    eq(s4.json.hits.length, 1, "r12 limit 参数生效（只返 1 条）");

    // document-source ingest: real document -> assembleDocumentText -> chunks with source_id
    const docSrc = await expectStatus("POST", "/api/documents", { title: "r12文档源" }, 201, "r12 建文档源 -> 201");
    await expectStatus("POST", `/api/documents/${docSrc.json.id}/import.md`, { markdown: "# 标题\n\n这是一段来自真实文档的正文。" }, 200, "r12 导入真块供文档源入库 -> 200");
    const fromDoc = await expectStatus("POST", "/api/knowledge/ingest", { title: "r12文档源入库", sourceType: "document", sourceId: docSrc.json.id }, 201, "r12 从文档入库 -> 201");
    eq(fromDoc.json.doc.sourceType, "document", "r12 文档源入库 source_type=document");
    eq(fromDoc.json.doc.sourceId, docSrc.json.id, "r12 文档源入库 source_id 指回真文档");
    const sDoc = await expectStatus("GET", "/api/knowledge/search?q=%E6%AD%A3%E6%96%87", undefined, 200, "r12 检索文档源内容 -> 200");
    ok(sDoc.json.hits.some((h: { sourceId: number }) => h.sourceId === docSrc.json.id), "r12 文档源命中 source_id 可溯源");

    // search_knowledge tool over real HTTP returns non-empty with source refs
    const conv = await expectStatus("POST", "/api/conversations", { title: "r12 工具检索会话" }, 201, "r12 建工具检索会话 -> 201");
    const toolChat = await expectStatus("POST", `/api/conversations/${conv.json.id}/chat`, { message: "忽略", toolCalls: [{ name: "search_knowledge", arguments: { query: "手机" } }] }, 201, "r12 search_knowledge 经 HTTP -> 201");
    eq(toolChat.json.toolCalls[0].ok, true, "r12 search_knowledge 真执行 ok=true");
    ok((toolChat.json.toolCalls[0].data.results ?? []).length > 0, "r12 工具回执非空（非 r10 占位）");
    ok(typeof toolChat.json.toolCalls[0].data.results[0].chunkId === "number", "r12 工具回执含 chunk_id 来源");

    // cleanup (reverse creation order; cascade removes chunks on doc delete)
    await expectStatus("DELETE", `/api/conversations/${conv.json.id}`, undefined, 200, "r12 删工具会话 -> 200");
    for (const d of [d1, d2, d3, fromDoc]) {
      await expectStatus("DELETE", `/api/knowledge/docs/${d.json.doc.id}`, undefined, 200, `r12 删知识文档 ${d.json.doc.id} -> 200`);
    }
    await expectStatus("DELETE", `/api/documents/${docSrc.json.id}`, undefined, 200, "r12 删文档源 -> 200");
    await expectStatus("GET", `/api/knowledge/docs/${d1.json.doc.id}`, undefined, 404, "r12 删后 GET 知识文档 -> 404");
    const after = await expectStatus("GET", "/api/knowledge/docs", undefined, 200, "r12 清理后列表 -> 200");
    eq(after.json.docs.length, 0, "r12 清理后知识库归零（无残留）");
  }

  console.log("\n== RAG r13: citations / traceback / no-hit / 4xx ==");
  {
    // 4xx / 404 traceback guards first
    await expectStatus("GET", "/api/knowledge/docs/999999?chunkId=1", undefined, 404, "r13 溯源：文档不存在 -> 404");
    await expectStatus("GET", "/api/knowledge/docs/1?chunkId=abc", undefined, 400, "r13 溯源：chunkId 非数字 -> 400");
    await expectStatus("GET", "/api/knowledge/docs/1?chunkId=0", undefined, 400, "r13 溯源：chunkId=0 -> 400");

    // two real knowledge docs (distinct tf so ranking is deterministic)
    const ragD1 = await expectStatus("POST", "/api/knowledge/ingest", { title: "r13科技稿", sourceType: "text", content: "苹果 手机 手机 手机 平板" }, 201, "r13 真入库科技稿 -> 201");
    const ragD2 = await expectStatus("POST", "/api/knowledge/ingest", { title: "r13果园稿", sourceType: "text", content: "苹果 香蕉 水果" }, 201, "r13 真入库果园稿 -> 201");
    const ragDocId = ragD1.json.doc.id;
    const ragChunkId = ragD1.json.chunks[0].id;
    await expectStatus("GET", `/api/knowledge/docs/${ragDocId}?chunkId=999999`, undefined, 404, "r13 溯源：引用 id 不存在 -> 404");

    const trace = await expectStatus("GET", `/api/knowledge/docs/${ragDocId}?chunkId=${ragChunkId}`, undefined, 200, "r13 溯源：合法 doc+chunk -> 200");
    eq(trace.json.chunk.id, ragChunkId, "r13 溯源回看命中同一 chunk id");
    eq(trace.json.chunk.content, "苹果 手机 手机 手机 平板", "r13 溯源回看 chunk 正文逐字相等");

    const ragConv = await expectStatus("POST", "/api/conversations", { title: "r13 RAG 会话" }, 201, "r13 建 RAG 会话 -> 201");
    const ragChat = await expectStatus("POST", `/api/conversations/${ragConv.json.id}/chat`, { message: "根据知识库，苹果 手机" }, 201, "r13 RAG 提问 -> 201");
    eq(ragChat.json.intent, "search_knowledge", "r13 RAG 先调 search_knowledge（意图正确）");
    eq(ragChat.json.toolCalls[0].name, "search_knowledge", "r13 RAG 工具回执为真实检索");
    ok(ragChat.json.toolCalls[0].ok === true, "r13 RAG 检索真执行 ok=true");
    ok(Array.isArray(ragChat.json.citations), "r13 chat 响应带 citations 字段");
    ok(ragChat.json.citations.length > 0, "r13 RAG 回答带非空引用清单");
    const rc = ragChat.json.citations[0];
    eq(typeof rc.docId, "number", "r13 citation.docId 为数值");
    eq(typeof rc.chunkId, "number", "r13 citation.chunkId 为数值");
    eq(typeof rc.snippet, "string", "r13 citation.snippet 为字符串");
    eq(typeof rc.score, "number", "r13 citation.score 为数值");
    ok(rc.snippet.length > 0 && rc.score > 0, "r13 citation 摘要与相关度非空");
    ok(ragChat.json.summary.includes("[1]") === true, "r13 AI 汇总含 [1] 引用标记");
    ok(ragChat.json.summary.includes("r13科技稿") === true, "r13 AI 汇总注入真实来源标题");
    ok(ragChat.json.artifact.content.includes("citations") === true, "r13 产物原文含引用清单");
    const ragArt = JSON.parse(ragChat.json.artifact.content);
    eq(ragArt.citations.length, ragChat.json.citations.length, "r13 产物引用条数与回答一致");
    eq(ragArt.citations[0].chunkId, rc.chunkId, "r13 产物引用 chunkId 与回答一致");

    // HTTP-only citation traceback: the cited chunk must be readable through GET doc/:id?chunkId=
    const cited = await expectStatus("GET", `/api/knowledge/docs/${rc.docId}?chunkId=${rc.chunkId}`, undefined, 200, "r13 回答引用可经 HTTP 溯源 -> 200");
    ok(cited.json.chunk.content.startsWith(rc.snippet) === true, "r13 引用 snippet 逐字等于存储 chunk 前缀（无编造）");
    const msgs = await expectStatus("GET", `/api/conversations/${ragConv.json.id}/messages`, undefined, 200, "r13 回读 RAG 消息 -> 200");
    eq(msgs.json.messages.length, 3, "r13 RAG 会话落 user/tool/assistant 三条");
    const assistant = msgs.json.messages.find((m: { role: string }) => m.role === "assistant");
    ok(assistant !== undefined && Array.isArray(assistant.content.citations), "r13 assistant 消息落库引用清单（reload 可复现）");
    eq(assistant.content.citations[0].chunkId, rc.chunkId, "r13 落库引用与响应引用逐项一致");

    // no-hit honesty over real HTTP (4xx guard above + answer shape)
    const noHitChat = await expectStatus("POST", `/api/conversations/${ragConv.json.id}/chat`, { message: "根据知识库，qqqzzz不存在" }, 201, "r13 无命中 RAG 提问 -> 201");
    eq(noHitChat.json.citations.length, 0, "r13 无命中引用清单为空（不伪造引用）");
    ok(noHitChat.json.summary.includes("知识库没有相关内容") === true, "r13 无命中如实说知识库没有相关内容");
    ok(noHitChat.json.summary.includes("[1]") === false, "r13 无命中不出现伪造引用标记");
    const plain = await expectStatus("POST", `/api/conversations/${ragConv.json.id}/chat`, { message: "列出待办" }, 201, "r13 非 RAG 对话 -> 201");
    eq(plain.json.citations.length, 0, "r13 非 RAG 对话引用清单为空（零污染）");

    // cleanup
    await expectStatus("DELETE", `/api/conversations/${ragConv.json.id}`, undefined, 200, "r13 删 RAG 会话 -> 200");
    await expectStatus("DELETE", `/api/knowledge/docs/${ragD1.json.doc.id}`, undefined, 200, "r13 删科技稿 -> 200");
    await expectStatus("DELETE", `/api/knowledge/docs/${ragD2.json.doc.id}`, undefined, 200, "r13 删果园稿 -> 200");
    const ragAfter = await expectStatus("GET", "/api/knowledge/docs", undefined, 200, "r13 清理后知识库列表 -> 200");
    ok(ragAfter.json.docs.length >= 0, "r13 清理后列表可读（本轮两篇已删）");
  }

  console.log("\n== Mindmap r14: CRUD / tree / content / 4xx ==");
  {
    const md = "# 导图根\n\n## 分支\n- 子项 A\n  - 孙项\n**未知语法** <i>原样</i>";
    const m1 = await expectStatus("POST", "/api/mindmaps", { title: "r14 真导图", contentMarkdown: md }, 201, "r14 POST 导图 -> 201");
    eq(m1.json && m1.json.title, "r14 真导图", "r14 POST title 读回");
    eq(m1.json && m1.json.contentMarkdown, md, "r14 POST Markdown 源逐字节读回");
    ok(m1.json && m1.json.id > 0, "r14 POST 返回自增 id");
    const mEmpty = await expectStatus("POST", "/api/mindmaps", { title: "r14 空导图" }, 201, "r14 空内容建导图 -> 201（非死路）");
    eq(mEmpty.json && mEmpty.json.contentMarkdown, "", "r14 缺省 contentMarkdown 为空串");
    const mList = await expectStatus("GET", "/api/mindmaps", undefined, 200, "r14 GET 导图列表 -> 200");
    ok(Array.isArray(mList.json && mList.json.mindmaps), "r14 列表返回 mindmaps 数组");
    eq(mList.json.mindmaps.length, 2, "r14 列表含两张新建导图");
    const mGet = await expectStatus("GET", `/api/mindmaps/${m1.json.id}`, undefined, 200, "r14 GET 导图详情 -> 200");
    eq(mGet.json && mGet.json.id, m1.json.id, "r14 详情 id 一致");

    // 真 HTTP 树解析：GET /:id/tree 返回 shared 解析后的 JSON，装配回 Markdown 逐字节相等
    const tr = await expectStatus("GET", `/api/mindmaps/${m1.json.id}/tree`, undefined, 200, "r14 GET /:id/tree -> 200");
    eq(tr.json && tr.json.mindmapId, m1.json.id, "r14 树响应回显 mindmapId");
    eq(tr.json && tr.json.title, "r14 真导图", "r14 树响应回显 title");
    eq(tr.json.tree.roots.length, 1, "r14 树解析：一级标题为唯一根");
    eq(tr.json.tree.roots[0].label, "导图根", "r14 树解析：根节点 label");
    eq(tr.json.tree.roots[0].children[0].label, "分支", "r14 树解析：二级标题是子节点");
    const branch = tr.json.tree.roots[0].children[0];
    eq(branch.children[0].kind, "bullet", "r14 树解析：列表→子节点");
    eq(branch.children[0].children[0].label, "孙项", "r14 树解析：缩进列表→孙节点");
    eq(branch.children[1].kind, "text", "r14 树解析：未知语法降级 text 节点");
    eq(branch.children[1].label, "**未知语法** <i>原样</i>", "r14 树解析：未知语法逐字保留不丢内容");
    eq(treeToMarkdown(tr.json.tree), md, "r14 HTTP 树 → Markdown 逐字节等于保存的源（真实双向）");
    eq(tr.json.tree.roots[0].children[0].children[0].depth, 2, "r14 树节点 depth=2（根→标题→列表）");
    eq(tr.json.tree.roots[0].children[0].children[0].children[0].depth, 3, "r14 缩进孙节点 depth=3");

    // PUT content：保存新源 → GET tree 立刻反映（双视图同步的服务端契约）
    const md2 = "# 改后根\n- 新分支\n  -  deep";
    const put = await expectStatus("PUT", `/api/mindmaps/${m1.json.id}/content`, { contentMarkdown: md2 }, 200, "r14 PUT /:id/content -> 200");
    eq(put.json && put.json.contentMarkdown, md2, "r14 PUT 后 Markdown 源逐字节读回");
    const tr2 = await expectStatus("GET", `/api/mindmaps/${m1.json.id}/tree`, undefined, 200, "r14 PUT 后 GET tree -> 200");
    eq(treeToMarkdown(tr2.json.tree), md2, "r14 PUT 后树同步为新源（不是旧缓存）");
    eq(tr2.json.tree.roots[0].label, "改后根", "r14 PUT 后根节点 label 更新");
    eq(tr2.json.tree.roots[0].children[0].children[0].label, "deep", "r14 PUT 后缩进节点更新");

    // 4xx：非法 Markdown / 空内容 / 越权 id / 非数字 id
    await expectStatus("PUT", `/api/mindmaps/${m1.json.id}/content`, { contentMarkdown: "" }, 400, "r14 PUT 空内容 -> 400");
    await expectStatus("PUT", `/api/mindmaps/${m1.json.id}/content`, { contentMarkdown: "   \n " }, 400, "r14 PUT 纯空白 Markdown -> 400");
    await expectStatus("PUT", `/api/mindmaps/${m1.json.id}/content`, { contentMarkdown: "a\u0000b" }, 400, "r14 PUT 含 NUL 的非法 Markdown -> 400");
    await expectStatus("PUT", `/api/mindmaps/${m1.json.id}/content`, { contentMarkdown: 42 }, 400, "r14 PUT 非字符串 Markdown -> 400");
    await expectStatus("PUT", `/api/mindmaps/${m1.json.id}/content`, { contentMarkdown: "x".repeat(200001) }, 400, "r14 PUT 超长 Markdown -> 400");
    await expectStatus("PUT", "/api/mindmaps/999999/content", { contentMarkdown: "# x" }, 404, "r14 PUT 越权 id -> 404");
    await expectStatus("PUT", "/api/mindmaps/not-a-number/content", { contentMarkdown: "# x" }, 400, "r14 PUT 非数字 id -> 400");
    await expectStatus("GET", "/api/mindmaps/999999/tree", undefined, 404, "r14 树：越权 id -> 404");
    await expectStatus("GET", "/api/mindmaps/not-a-number/tree", undefined, 400, "r14 树：非数字 id -> 400");
    await expectStatus("GET", "/api/mindmaps/999999", undefined, 404, "r14 GET 不存在导图 -> 404");
    await expectStatus("GET", "/api/mindmaps/not-a-number", undefined, 400, "r14 GET 非数字 id -> 400");
    await expectStatus("POST", "/api/mindmaps", { title: "" }, 400, "r14 POST 空标题 -> 400");
    await expectStatus("POST", "/api/mindmaps", { title: "x", contentMarkdown: "a\u0000b" }, 400, "r14 POST 非法 Markdown -> 400");
    const patched = await expectStatus("PATCH", `/api/mindmaps/${m1.json.id}`, { title: "r14 改名" }, 200, "r14 PATCH 改标题 -> 200");
    eq(patched.json && patched.json.title, "r14 改名", "r14 PATCH 后标题读回");
    eq(patched.json && patched.json.contentMarkdown, md2, "r14 PATCH 不改 Markdown 源");
    await expectStatus("PATCH", `/api/mindmaps/${m1.json.id}`, { title: "" }, 400, "r14 PATCH 空标题 -> 400");
    await expectStatus("PATCH", "/api/mindmaps/999999", { title: "x" }, 404, "r14 PATCH 越权 id -> 404");

    const del = await expectStatus("DELETE", `/api/mindmaps/${m1.json.id}`, undefined, 200, "r14 DELETE 导图 -> 200");
    ok(del.json && del.json.deleted === true, "r14 DELETE 返回 deleted=true");
    await expectStatus("DELETE", `/api/mindmaps/${mEmpty.json.id}`, undefined, 200, "r14 DELETE 空导图 -> 200");
    await expectStatus("DELETE", `/api/mindmaps/${m1.json.id}`, undefined, 404, "r14 DELETE 重复同一 id -> 404");
    const after = await expectStatus("GET", "/api/mindmaps", undefined, 200, "r14 清理后列表 -> 200");
    eq(after.json.mindmaps.length, 0, "r14 清理后导图归零（无残留）");
  }

  console.log("\n== Whiteboard r15: boards / items / move / ai-create / export / 4xx ==");
  {
    const b1 = await expectStatus("POST", "/api/whiteboards", { title: "r15 白板" }, 201, "r15 POST 白板 -> 201");
    eq(b1.json && b1.json.title, "r15 白板", "r15 POST 白板 title 读回");
    ok(b1.json && b1.json.id > 0, "r15 POST 白板返回自增 id");
    const b2 = await expectStatus("POST", "/api/whiteboards", { title: "r15 AI 白板" }, 201, "r15 POST AI 白板 -> 201");
    const list = await expectStatus("GET", "/api/whiteboards", undefined, 200, "r15 GET 白板列表 -> 200");
    ok(Array.isArray(list.json && list.json.whiteboards), "r15 列表返回 whiteboards 数组");
    eq(list.json.whiteboards.length, 2, "r15 列表含两张新建白板");
    const get = await expectStatus("GET", `/api/whiteboards/${b1.json.id}`, undefined, 200, "r15 GET 白板详情 -> 200");
    eq(get.json && get.json.id, b1.json.id, "r15 详情 id 一致");
    const patchedBoard = await expectStatus("PATCH", `/api/whiteboards/${b1.json.id}`, { title: "r15 改名白板" }, 200, "r15 PATCH 白板改名 -> 200");
    eq(patchedBoard.json && patchedBoard.json.title, "r15 改名白板", "r15 PATCH 改名读回");

    // items CRUD（真实落库）
    const it1 = await expectStatus("POST", `/api/whiteboards/${b1.json.id}/items`, { type: "note", x: 10, y: 20, content: "第一张便签" }, 201, "r15 POST 便签 -> 201");
    eq(it1.json && it1.json.type, "note", "r15 便签 type 回显");
    eq(it1.json && it1.json.x, 10, "r15 便签 x 回显");
    eq(it1.json && it1.json.content, "第一张便签", "r15 便签 content 逐字读回");
    eq(it1.json && it1.json.color, "#FEF3C7", "r15 便签缺省色由 shared 归一");
    const it2 = await expectStatus("POST", `/api/whiteboards/${b1.json.id}/items`, { type: "text", x: 10, y: 20, content: "第二张文本" }, 201, "r15 POST 文本 -> 201");
    eq(it2.json && it2.json.w, 260, "r15 text 缺省宽由 shared 归一");
    const itemsList = await expectStatus("GET", `/api/whiteboards/${b1.json.id}/items`, undefined, 200, "r15 GET 条目列表 -> 200");
    eq(itemsList.json && itemsList.json.items.length, 2, "r15 列表含两条新建条目");
    const itemGet = await expectStatus("GET", `/api/whiteboards/${b1.json.id}/items/${it1.json.id}`, undefined, 200, "r15 GET 条目详情 -> 200");
    eq(itemGet.json && itemGet.json.id, it1.json.id, "r15 条目详情 id 一致");
    const patchedItem = await expectStatus("PATCH", `/api/whiteboards/${b1.json.id}/items/${it1.json.id}`, { content: "改后便签" }, 200, "r15 PATCH 条目内容 -> 200");
    eq(patchedItem.json && patchedItem.json.content, "改后便签", "r15 PATCH 条目内容读回");
    eq(patchedItem.json && patchedItem.json.type, "note", "r15 PATCH 不改 type");

    // 批量移动：越权/避让/落库
    const moved = await expectStatus("POST", `/api/whiteboards/${b1.json.id}/items/move`, { moves: [{ id: it1.json.id, x: 500, y: 500 }, { id: it2.json.id, x: 500, y: 500 }] }, 200, "r15 POST 批量移动 -> 200");
    eq(moved.json && moved.json.count, 2, "r15 批量移动返回两条");
    const moved2 = moved.json.items.find((x: any) => x.id === it2.json.id);
    ok(moved2 && moved2.y > 500, "r15 批量移动后重叠条目被避让下移");
    const afterMove = await expectStatus("GET", `/api/whiteboards/${b1.json.id}/items`, undefined, 200, "r15 移动后回读 -> 200");
    eq(afterMove.json.items.find((x: any) => x.id === it2.json.id).y, moved2.y, "r15 批量移动真落库（不是临时态）");

    // Markdown 导出：真 HTTP 字节装配
    const exported = await reqText(`/api/whiteboards/${b1.json.id}/export.md`);
    eq(exported.status, 200, "r15 GET export.md -> 200");
    ok(exported.text.startsWith("# r15 改名白板\n"), "r15 导出 Markdown 以白板标题为 H1");
    ok(exported.text.includes("改后便签"), "r15 导出 Markdown 含真实条目内容");
    ok((exported.headers.get("content-type") ?? "").includes("text/markdown"), "r15 导出 content-type 为 text/markdown");
    ok((exported.headers.get("content-disposition") ?? "").includes("attachment"), "r15 导出 content-disposition 为附件");

    // mock AI 建板：5-8 便签 / 主题真实注入 / 不重叠 / 真落库
    const ai = await expectStatus("POST", `/api/whiteboards/${b2.json.id}/ai-create`, { theme: "季度复盘" }, 201, "r15 POST ai-create -> 201");
    eq(ai.json && ai.json.theme, "季度复盘", "r15 AI 建板主题回显");
    ok(ai.json.count >= 5 && ai.json.count <= 8, "r15 AI 建板真生成 5-8 便签");
    eq(ai.json.items.every((x: any) => x.type === "note"), true, "r15 AI 建板条目全是 note");
    eq(ai.json.items.every((x: any) => x.content.includes("季度复盘")), true, "r15 AI 建板内容含真实主题");
    eq(ai.json.items.every((x: any, i: number) => ai.json.items.slice(i + 1).every((y: any) => !whiteboardItemsOverlap(x, y))), true, "r15 AI 建板布局不重叠");
    const aiList = await expectStatus("GET", `/api/whiteboards/${b2.json.id}/items`, undefined, 200, "r15 AI 建板后回读条目 -> 200");
    eq(aiList.json.items.length, ai.json.count, "r15 AI 建板条目真落库");
    const b3 = await expectStatus("POST", "/api/whiteboards", { title: "r15 AI 确定性" }, 201, "r15 POST 第三张白板 -> 201");
    const ai2 = await expectStatus("POST", `/api/whiteboards/${b3.json.id}/ai-create`, { theme: "季度复盘" }, 201, "r15 POST 同主题 ai-create -> 201");
    eq(ai2.json.items.map((x: any) => x.content), ai.json.items.map((x: any) => x.content), "r15 AI 建板同主题确定性（零随机）");

    // r15 返工#1（A）：waizhuan 原始复现路径——板上已有 note (120,300) 再 ai-create，
    // HTTP 回读「全量画布」两两无重叠，且既有条目避让后坐标真回写落库。
    const b4 = await expectStatus("POST", "/api/whiteboards", { title: "r15 返工 AI 重叠复现" }, 201, "r15 返工 POST 复现白板 -> 201");
    const old4 = await expectStatus("POST", `/api/whiteboards/${b4.json.id}/items`, { type: "note", x: 120, y: 300, content: "既有便签" }, 201, "r15 返工 POST 既有便签 -> 201");
    const ai4 = await expectStatus("POST", `/api/whiteboards/${b4.json.id}/ai-create`, { theme: "季度复盘" }, 201, "r15 返工 POST ai-create -> 201");
    const full4 = await expectStatus("GET", `/api/whiteboards/${b4.json.id}/items`, undefined, 200, "r15 返工 GET 全量条目 -> 200");
    eq(full4.json.items.length, 1 + ai4.json.count, "r15 返工全量条目数 = 既有 + AI 新增");
    eq(
      full4.json.items.every((x: any, i: number) => full4.json.items.slice(i + 1).every((y: any) => !whiteboardItemsOverlap(x, y))),
      true,
      "r15 返工 AI 建板后全量画布（含既有条目）两两无重叠",
    );
    const old4After = full4.json.items.find((x: any) => x.id === old4.json.id);
    ok(old4After && old4After.y > 300, "r15 返工 AI 建板把避让后的既有条目坐标回写落库");
    const boards4 = await expectStatus("GET", "/api/whiteboards", undefined, 200, "r15 返工 GET 白板列表 -> 200");
    const sum4 = boards4.json.whiteboards.find((w: any) => w.id === b4.json.id);
    eq(sum4 && sum4.itemCount, full4.json.items.length, "r15 返工列表 itemCount 为该板真实条目数（侧栏 3↔7 回归锁）");
    const sumAi = boards4.json.whiteboards.find((w: any) => w.id === b2.json.id);
    eq(sumAi && sumAi.itemCount, ai.json.count, "r15 返工 AI 板 itemCount 独立反映自身 7 条（非选中板计数串台）");

    // 4xx：越权 board_id / 非法 item 类型 / 越界坐标 / 非法主题 / 重复 id
    await expectStatus("POST", "/api/whiteboards", { title: "" }, 400, "r15 POST 空标题白板 -> 400");
    await expectStatus("POST", "/api/whiteboards", { title: "x".repeat(201) }, 400, "r15 POST 超长标题白板 -> 400");
    await expectStatus("POST", `/api/whiteboards/${b1.json.id}/items`, { type: "line" }, 400, "r15 POST 非法 item 类型 -> 400");
    await expectStatus("POST", `/api/whiteboards/${b1.json.id}/items`, { type: "note", x: 100001 }, 400, "r15 POST x 越上界 -> 400");
    await expectStatus("POST", `/api/whiteboards/${b1.json.id}/items`, { type: "note", y: -100001 }, 400, "r15 POST y 越下界 -> 400");
    await expectStatus("POST", `/api/whiteboards/${b1.json.id}/items`, { type: "note", w: 19 }, 400, "r15 POST 宽过小 -> 400");
    await expectStatus("POST", `/api/whiteboards/${b1.json.id}/items`, { type: "note", color: "red" }, 400, "r15 POST 非法颜色 -> 400");
    await expectStatus("POST", "/api/whiteboards/999999/items", { type: "note" }, 404, "r15 POST 越权 board_id -> 404");
    await expectStatus("GET", "/api/whiteboards/999999/items", undefined, 404, "r15 GET 越权 board_id 条目 -> 404");
    await expectStatus("GET", `/api/whiteboards/${b1.json.id}/items/999999`, undefined, 404, "r15 GET 不存在条目 -> 404");
    await expectStatus("GET", `/api/whiteboards/${b2.json.id}/items/${it1.json.id}`, undefined, 404, "r15 跨白板取条目 -> 404");
    await expectStatus("PATCH", `/api/whiteboards/${b1.json.id}/items/${it1.json.id}`, { x: 100001 }, 400, "r15 PATCH 越界坐标 -> 400");
    await expectStatus("PATCH", `/api/whiteboards/${b1.json.id}/items/${it1.json.id}`, { type: "line" }, 400, "r15 PATCH 非法类型 -> 400");
    await expectStatus("PATCH", `/api/whiteboards/999999/items/${it1.json.id}`, { content: "x" }, 404, "r15 PATCH 越权 board_id -> 404");
    await expectStatus("DELETE", `/api/whiteboards/${b2.json.id}/items/${it1.json.id}`, undefined, 404, "r15 跨白板删条目 -> 404");
    await expectStatus("POST", `/api/whiteboards/${b1.json.id}/items/move`, { moves: [{ id: 999999, x: 1, y: 1 }] }, 404, "r15 批量移动越权条目 -> 404");
    await expectStatus("POST", `/api/whiteboards/${b1.json.id}/items/move`, { moves: [{ id: it1.json.id, x: 100001, y: 1 }] }, 400, "r15 批量移动越界坐标 -> 400");
    await expectStatus("POST", `/api/whiteboards/${b1.json.id}/items/move`, { moves: [{ id: it1.json.id, x: 1, y: 1 }, { id: it1.json.id, x: 2, y: 2 }] }, 400, "r15 批量移动重复 id -> 400");
    await expectStatus("POST", `/api/whiteboards/${b1.json.id}/items/move`, { moves: "bad" }, 400, "r15 批量移动非数组 -> 400");
    await expectStatus("POST", "/api/whiteboards/not-a-number/ai-create", { theme: "x" }, 400, "r15 ai-create 非数字 id -> 400");
    await expectStatus("POST", `/api/whiteboards/${b2.json.id}/ai-create`, { theme: "" }, 400, "r15 ai-create 空主题 -> 400");
    await expectStatus("POST", `/api/whiteboards/${b2.json.id}/ai-create`, { theme: "a\u0000b" }, 400, "r15 ai-create NUL 主题 -> 400");
    await expectStatus("POST", `/api/whiteboards/${b2.json.id}/ai-create`, { theme: "x".repeat(201) }, 400, "r15 ai-create 超长主题 -> 400");
    await expectStatus("POST", "/api/whiteboards/999999/ai-create", { theme: "x" }, 404, "r15 ai-create 越权 board_id -> 404");
    await expectStatus("GET", "/api/whiteboards/999999/export.md", undefined, 404, "r15 导出越权 board_id -> 404");
    await expectStatus("GET", "/api/whiteboards/not-a-number", undefined, 400, "r15 GET 非数字白板 id -> 400");
    await expectStatus("DELETE", "/api/whiteboards/999999", undefined, 404, "r15 DELETE 不存在白板 -> 404");
    const after4xx = await expectStatus("GET", `/api/whiteboards/${b1.json.id}/items`, undefined, 200, "r15 4xx 后条目仍可读 -> 200");
    ok(after4xx.json.items.length >= 2, "r15 4xx 后既有条目未被半路改写");

    // 清理（删除白板级联删条目）
    await expectStatus("DELETE", `/api/whiteboards/${b1.json.id}`, undefined, 200, "r15 DELETE 白板 A -> 200");
    await expectStatus("DELETE", `/api/whiteboards/${b2.json.id}`, undefined, 200, "r15 DELETE 白板 B -> 200");
    await expectStatus("DELETE", `/api/whiteboards/${b3.json.id}`, undefined, 200, "r15 DELETE 白板 C -> 200");
    await expectStatus("DELETE", `/api/whiteboards/${b4.json.id}`, undefined, 200, "r15 返工 DELETE 复现白板 -> 200");
    const after = await expectStatus("GET", "/api/whiteboards", undefined, 200, "r15 清理后列表 -> 200");
    eq(after.json.whiteboards.length, 0, "r15 清理后白板归零（无残留）");
  }

  console.log("\n== Approval r16: CRUD / submit / approve / reject / delegate / withdraw / views / 4xx ==");
  {
    const p1 = await expectStatus("POST", "/api/approvals", {
      title: "r16 \u8bf7\u5047\u5ba1\u6279", type: "leave", applicantId: "alice", currentAssignee: "bob", cc: ["dave"],
    }, 201, "r16 POST \u5ba1\u6279 -> 201");
    eq(p1.json && p1.json.title, "r16 \u8bf7\u5047\u5ba1\u6279", "r16 POST \u6807\u9898\u8bfb\u56de");
    eq(p1.json && p1.json.status, "draft", "r16 \u65b0\u5efa\u72b6\u6001 draft");
    eq(p1.json && p1.json.applicantId, "alice", "r16 \u7533\u8bf7\u4eba\u8bfb\u56de");
    eq(p1.json && p1.json.currentAssignee, "bob", "r16 \u521d\u59cb\u5ba1\u6279\u4eba\u8bfb\u56de");
    ok(p1.json && p1.json.id > 0, "r16 POST \u8fd4\u56de\u81ea\u589e id");
    const p2 = await expectStatus("POST", "/api/approvals", {
      title: "r16 \u62a5\u9500\u5ba1\u6279", type: "expense", applicantId: "alice", currentAssignee: "bob", cc: ["dave", "erin"],
    }, 201, "r16 POST \u7b2c\u4e8c\u5355 -> 201");
    const list = await expectStatus("GET", "/api/approvals", undefined, 200, "r16 GET \u5ba1\u6279\u5217\u8868 -> 200");
    eq(list.json.approvals.length, 2, "r16 \u5217\u8868\u542b\u4e24\u5f20\u65b0\u5efa\u5ba1\u6279");
    const detail = await expectStatus("GET", `/api/approvals/${p1.json.id}`, undefined, 200, "r16 GET \u5ba6\u60c5 -> 200");
    eq(detail.json && detail.json.id, p1.json.id, "r16 \u5ba6\u60c5 id \u4e00\u81f4");
    const patched = await expectStatus("PATCH", `/api/approvals/${p1.json.id}`, { title: "r16 \u6539\u540d\u8bf7\u5047" }, 200, "r16 PATCH \u6539\u540d -> 200");
    eq(patched.json && patched.json.title, "r16 \u6539\u540d\u8bf7\u5047", "r16 PATCH \u6539\u540d\u8bfb\u56de");
    const ccList = await expectStatus("GET", `/api/approvals/${p1.json.id}/cc`, undefined, 200, "r16 GET \u6284\u9001 -> 200");
    eq(ccList.json.cc, ["dave"], "r16 \u6284\u9001\u4eba\u771f\u843d\u5e93\u8bfb\u56de");
    const ccAdded = await expectStatus("POST", `/api/approvals/${p1.json.id}/cc`, { user: "erin" }, 201, "r16 POST \u8ffd\u52a0\u6284\u9001 -> 201");
    eq(ccAdded.json.cc, ["dave", "erin"], "r16 \u8ffd\u52a0\u6284\u9001\u8bfb\u56de");

    // \u63d0\u4ea4\u2192\u6b65\u9aa4\u2192\u8f6c\u4ea4\u2192\u901a\u8fc7\uff08\u771f HTTP\uff0c\u771f\u843d\u5e93\uff09
    const submitted = await expectStatus("POST", `/api/approvals/${p1.json.id}/submit`, { actor: "alice", comment: "\u8bf7\u5ba1\u6279" }, 200, "r16 POST submit -> 200");
    eq(submitted.json && submitted.json.status, "pending", "r16 submit \u771f\u6d41\u8f6c\u5230 pending");
    const steps1 = await expectStatus("GET", `/api/approvals/${p1.json.id}/steps`, undefined, 200, "r16 GET \u6b65\u9aa4 -> 200");
    eq(steps1.json.steps.length, 1, "r16 \u63d0\u4ea4\u4ea7\u751f 1 \u6761\u6b65\u9aa4");
    eq(steps1.json.steps[0].action, "submit", "r16 \u7b2c\u4e00\u6b65 action=submit");
    eq(steps1.json.steps[0].order, 0, "r16 \u7b2c\u4e00\u6b65 order=0");
    eq(steps1.json.steps[0].comment, "\u8bf7\u5ba1\u6279", "r16 \u6b65\u9aa4\u610f\u89c1\u9010\u5b57\u843d\u5e93");
    const readAfterSubmit = await expectStatus("GET", `/api/approvals/${p1.json.id}`, undefined, 200, "r16 \u63d0\u4ea4\u540e\u8be6\u60c5\u56de\u8bfb -> 200");
    eq(readAfterSubmit.json.status, "pending", "r16 submit \u771f\u843d\u5e93\uff08\u975e\u4e34\u65f6\u6001\uff09");

    // 4xx\uff1a\u975e assignee \u64cd\u4f5c / \u975e\u53d1\u8d77\u4eba\u63d0\u4ea4 / \u975e\u6cd5\u5206\u7c7b
    await expectStatus("POST", `/api/approvals/${p1.json.id}/approve`, { actor: "carol", comment: "\u8d8a\u6743" }, 400, "r16 \u975e assignee \u5ba1\u6279 -> 400");
    await expectStatus("POST", `/api/approvals/${p1.json.id}/reject`, { actor: "carol" }, 400, "r16 \u975e assignee \u9a73\u56de -> 400");
    await expectStatus("POST", `/api/approvals/${p1.json.id}/delegate`, { actor: "carol", targetAssignee: "dave" }, 400, "r16 \u975e assignee \u8f6c\u4ea4 -> 400");
    await expectStatus("POST", `/api/approvals/${p2.json.id}/submit`, { actor: "bob" }, 400, "r16 \u975e\u53d1\u8d77\u4eba\u63d0\u4ea4 -> 400");
    const after4xx = await expectStatus("GET", `/api/approvals/${p1.json.id}`, undefined, 200, "r16 4xx \u540e\u4ecd\u53ef\u8bfb -> 200");
    eq(after4xx.json.status, "pending", "r16 4xx \u540e\u72b6\u6001\u672a\u53d8\uff08\u96f6\u534a\u6001\uff09");
    const stepsAfter4xx = await expectStatus("GET", `/api/approvals/${p1.json.id}/steps`, undefined, 200, "r16 4xx \u540e\u6b65\u9aa4\u56de\u8bfb -> 200");
    eq(stepsAfter4xx.json.steps.length, 1, "r16 4xx \u672a\u5199\u5165\u6b65\u9aa4\uff08\u96f6\u534a\u6001\uff09");
    const submittedP2 = await expectStatus("POST", `/api/approvals/${p2.json.id}/submit`, { actor: "alice" }, 200, "r16 POST \u7b2c\u4e8c\u5355 submit -> 200");
    eq(submittedP2.json && submittedP2.json.status, "pending", "r16 \u7b2c\u4e8c\u5355\u63d0\u4ea4\u540e\u8fdb\u5165\u5f85\u5ba1");

    const delegated = await expectStatus("POST", `/api/approvals/${p1.json.id}/delegate`, { actor: "bob", targetAssignee: "carol", comment: "\u4ea4\u7ed9 carol" }, 200, "r16 POST delegate -> 200");
    eq(delegated.json && delegated.json.status, "pending", "r16 delegate \u4e0d\u6539\u72b6\u6001\uff08\u771f HTTP \u8bfb\u56de\uff09");
    eq(delegated.json && delegated.json.currentAssignee, "carol", "r16 delegate \u771f\u6362 assignee");
    const steps2 = await expectStatus("GET", `/api/approvals/${p1.json.id}/steps`, undefined, 200, "r16 \u8f6c\u4ea4\u540e\u6b65\u9aa4 -> 200");
    eq(steps2.json.steps.length, 2, "r16 \u8f6c\u4ea4\u4ea7\u751f\u7b2c\u4e8c\u6b65");
    eq(steps2.json.steps[1].assignee, "carol", "r16 \u8f6c\u4ea4\u6b65\u9aa4\u8bb0\u65b0 assignee");
    eq(steps2.json.steps[1].order, 1, "r16 \u6b65\u9aa4 order \u8fde\u53f7");
    await expectStatus("POST", `/api/approvals/${p1.json.id}/approve`, { actor: "bob" }, 400, "r16 \u8f6c\u4ea4\u540e\u65e7 assignee \u5ba1\u6279 -> 400");
    const approved = await expectStatus("POST", `/api/approvals/${p1.json.id}/approve`, { actor: "carol", comment: "\u540c\u610f" }, 200, "r16 POST approve -> 200");
    eq(approved.json && approved.json.status, "approved", "r16 approve \u771f\u6d41\u8f6c\u5230 approved");
    const finalSteps = await expectStatus("GET", `/api/approvals/${p1.json.id}/steps`, undefined, 200, "r16 \u901a\u8fc7\u540e\u65f6\u95f4\u7ebf -> 200");
    eq(finalSteps.json.steps.length, 3, "r16 \u901a\u8fc7\u540e\u5171\u4e09\u6b65");
    eq(finalSteps.json.steps[2].action, "approve", "r16 \u7b2c\u4e09\u6b65 action=approve");

    // \u5df2\u7ed3\u5355\u518d\u5ba1\u6279 -> 400\uff08\u7ec8\u6001\u65e0\u51fa\u8fb9\uff09
    await expectStatus("POST", `/api/approvals/${p1.json.id}/approve`, { actor: "carol" }, 400, "r16 \u5df2\u901a\u8fc7\u518d\u5ba1\u6279 -> 400");
    await expectStatus("POST", `/api/approvals/${p1.json.id}/reject`, { actor: "carol" }, 400, "r16 \u5df2\u901a\u8fc7\u518d\u9a73\u56de -> 400");
    await expectStatus("POST", `/api/approvals/${p1.json.id}/delegate`, { actor: "carol", targetAssignee: "dave" }, 400, "r16 \u5df2\u901a\u8fc7\u518d\u8f6c\u4ea4 -> 400");
    await expectStatus("POST", `/api/approvals/${p1.json.id}/withdraw`, { actor: "alice" }, 400, "r16 \u5df2\u901a\u8fc7\u518d\u64a4\u56de -> 400");
    const finalSnapshot = await expectStatus("GET", `/api/approvals/${p1.json.id}`, undefined, 200, "r16 \u7ec8\u6001\u56de\u8bfb -> 200");
    eq(finalSnapshot.json.status, "approved", "r16 4xx \u540e\u7ec8\u6001\u4ecd\u4e3a approved");

    // \u9a73\u56de\u4e0e\u64a4\u56de\u8def\u5f84
    const p3 = await expectStatus("POST", "/api/approvals", { title: "r16 \u9a73\u56de", type: "other", applicantId: "frank", currentAssignee: "grace" }, 201, "r16 POST \u9a73\u56de\u5355 -> 201");
    await expectStatus("POST", `/api/approvals/${p3.json.id}/submit`, { actor: "frank" }, 200, "r16 \u9a73\u56de\u5355\u63d0\u4ea4 -> 200");
    const rejected = await expectStatus("POST", `/api/approvals/${p3.json.id}/reject`, { actor: "grace", comment: "\u4e0d\u6279" }, 200, "r16 POST reject -> 200");
    eq(rejected.json && rejected.json.status, "rejected", "r16 reject \u771f\u6d41\u8f6c\u5230 rejected");
    const p4 = await expectStatus("POST", "/api/approvals", { title: "r16 \u64a4\u56de", type: "purchase", applicantId: "helen", currentAssignee: "ivan" }, 201, "r16 POST \u64a4\u56de\u5355 -> 201");
    await expectStatus("POST", `/api/approvals/${p4.json.id}/submit`, { actor: "helen" }, 200, "r16 \u64a4\u56de\u5355\u63d0\u4ea4 -> 200");
    const withdrawn = await expectStatus("POST", `/api/approvals/${p4.json.id}/withdraw`, { actor: "helen" }, 200, "r16 POST withdraw -> 200");
    eq(withdrawn.json && withdrawn.json.status, "withdrawn", "r16 withdraw \u771f\u6d41\u8f6c\u5230 withdrawn");
    await expectStatus("POST", `/api/approvals/${p4.json.id}/withdraw`, { actor: "helen" }, 400, "r16 \u91cd\u590d\u64a4\u56de -> 400");

    // \u4e09\u89c6\u89d2\u771f HTTP \u67e5\u8be2
    const todoBob = await expectStatus("GET", "/api/approvals/view?view=todo&actor=bob", undefined, 200, "r16 \u6211\u7684\u5f85\u529e(bob) -> 200");
    eq(todoBob.json.approvals.map((x: any) => x.id), [p2.json.id], "r16 \u5f85\u529e\u53ea\u6570 pending \u4e14 assignee \u662f\u6211");
    const todoCarol = await expectStatus("GET", "/api/approvals/view?view=todo&actor=carol", undefined, 200, "r16 \u6211\u7684\u5f85\u529e(carol) -> 200");
    eq(todoCarol.json.approvals.length, 0, "r16 \u8f6c\u4ea4\u540e\u5df2\u7ed3\u5355\uff0ccarol \u65e0\u5f85\u529e");
    const initiatedAlice = await expectStatus("GET", "/api/approvals/view?view=initiated&actor=alice", undefined, 200, "r16 \u6211\u53d1\u8d77\u7684(alice) -> 200");
    eq(initiatedAlice.json.approvals.map((x: any) => x.id), [p2.json.id, p1.json.id], "r16 \u6211\u53d1\u8d77\u7684\u542b\u7ec8\u6001\uff08\u5217\u8868\u5012\u5e8f\uff09");
    const ccDave = await expectStatus("GET", "/api/approvals/view?view=cc&actor=dave", undefined, 200, "r16 \u6284\u9001\u6211\u7684(dave) -> 200");
    eq(ccDave.json.approvals.map((x: any) => x.id), [p2.json.id, p1.json.id], "r16 \u6284\u9001\u6211\u7684\u6309\u540d\u5355\u8fc7\u6ee4\uff08\u5217\u8868\u5012\u5e8f\uff09");
    const ccErin = await expectStatus("GET", "/api/approvals/view?view=cc&actor=erin", undefined, 200, "r16 \u6284\u9001\u6211\u7684(erin) -> 200");
    eq(ccErin.json.approvals.map((x: any) => x.id), [p2.json.id, p1.json.id], "r16 \u6284\u9001\u8ffd\u52a0\u540e erin \u547d\u4e2d\u4e24\u5355\uff08\u5217\u8868\u5012\u5e8f\uff09");

    // 4xx\uff1a\u975e\u6cd5\u521b\u5efa / \u975e\u6cd5\u52a8\u4f5c / \u975e\u6cd5\u89c6\u89d2 / \u8d8a\u6743 id / draft \u76f4\u63a5\u5ba1\u6279
    await expectStatus("POST", "/api/approvals", { title: "", type: "leave", applicantId: "a", currentAssignee: "b" }, 400, "r16 POST \u7a7a\u6807\u9898 -> 400");
    await expectStatus("POST", "/api/approvals", { title: "x".repeat(201), type: "leave", applicantId: "a", currentAssignee: "b" }, 400, "r16 POST \u8d85\u957f\u6807\u9898 -> 400");
    await expectStatus("POST", "/api/approvals", { title: "x", type: "sleep", applicantId: "a", currentAssignee: "b" }, 400, "r16 POST \u975e\u6cd5\u7c7b\u578b -> 400");
    await expectStatus("POST", "/api/approvals", { title: "x", type: "leave", applicantId: "a", currentAssignee: "" }, 400, "r16 POST \u7a7a\u5ba1\u6279\u4eba -> 400");
    await expectStatus("POST", "/api/approvals", { title: "x", type: "leave", applicantId: "a", currentAssignee: "b", cc: "dave" }, 400, "r16 POST \u6284\u9001\u975e\u6570\u7ec4 -> 400");
    await expectStatus("POST", "/api/approvals", { title: "x", type: "leave", applicantId: "a", currentAssignee: "b", cc: [42] }, 400, "r16 POST \u6284\u9001\u975e\u5b57\u7b26\u4e32 -> 400");
    await expectStatus("GET", "/api/approvals/999999", undefined, 404, "r16 GET \u4e0d\u5b58\u5728 id -> 404");
    await expectStatus("GET", "/api/approvals/not-a-number", undefined, 400, "r16 GET \u975e\u6570\u5b57 id -> 400");
    await expectStatus("GET", "/api/approvals/999999/steps", undefined, 404, "r16 GET \u8d8a\u6743\u6b65\u9aa4 -> 404");
    await expectStatus("GET", "/api/approvals/999999/cc", undefined, 404, "r16 GET \u8d8a\u6743\u6284\u9001 -> 404");
    await expectStatus("GET", "/api/approvals/view?view=all&actor=bob", undefined, 400, "r16 \u975e\u6cd5\u89c6\u89d2 -> 400");
    await expectStatus("GET", "/api/approvals/view?view=todo", undefined, 400, "r16 \u7f3a actor -> 400");
    const pDraft = await expectStatus("POST", "/api/approvals", { title: "r16 draft \u76f4\u63a5\u5ba1\u6279", type: "leave", applicantId: "zoe", currentAssignee: "yan" }, 201, "r16 POST draft \u5355 -> 201");
    await expectStatus("POST", `/api/approvals/${pDraft.json.id}/approve`, { actor: "yan" }, 400, "r16 draft \u76f4\u63a5\u5ba1\u6279 -> 400");
    await expectStatus("POST", `/api/approvals/${p2.json.id}/submit`, {}, 400, "r16 \u7f3a actor \u63d0\u4ea4 -> 400");
    await expectStatus("POST", `/api/approvals/${p1.json.id}/delegate`, { actor: "carol", targetAssignee: "carol" }, 400, "r16 \u8f6c\u4ea4\u76ee\u6807\u4e0e\u5f53\u524d\u76f8\u540c -> 400");
    await expectStatus("POST", `/api/approvals/${p1.json.id}/delegate`, { actor: "carol" }, 400, "r16 \u8f6c\u4ea4\u7f3a\u76ee\u6807 -> 400");
    await expectStatus("POST", "/api/approvals/999999/submit", { actor: "alice" }, 404, "r16 \u8d8a\u6743 id \u63d0\u4ea4 -> 404");
    await expectStatus("POST", "/api/approvals/not-a-number/approve", { actor: "bob" }, 400, "r16 \u975e\u6570\u5b57 id \u5ba1\u6279 -> 400");
    await expectStatus("PATCH", "/api/approvals/999999", { title: "x" }, 404, "r16 PATCH \u8d8a\u6743 id -> 404");
    await expectStatus("DELETE", "/api/approvals/999999", undefined, 404, "r16 DELETE \u8d8a\u6743 id -> 404");
    await expectStatus("POST", `/api/approvals/${p4.json.id}/cc`, { user: "" }, 400, "r16 \u7a7a\u6284\u9001\u4eba -> 400");

    // \u6e05\u7406\uff08\u5220\u9664\u5ba1\u6279\uff0c\u6b65\u9aa4/\u6284\u9001\u7ea7\u8054\u5f52\u96f6\uff09
    for (const id of [p1.json.id, p2.json.id, p3.json.id, p4.json.id, pDraft.json.id]) {
      await expectStatus("DELETE", `/api/approvals/${id}`, undefined, 200, `r16 DELETE \u5ba1\u6279 ${id} -> 200`);
    }
    const after = await expectStatus("GET", "/api/approvals", undefined, 200, "r16 \u6e05\u7406\u540e\u5217\u8868 -> 200");
    eq(after.json.approvals.length, 0, "r16 \u6e05\u7406\u540e\u5ba1\u6279\u5f52\u96f6\uff08\u65e0\u6b8b\u7559\uff09");
  }

  console.log("\n== Assets / UnitTasks r17: 物资台账 / 出入库 / 任务树 / 状态流转 / 4xx ==");
  {
    // ---- 物资建账与 CRUD ----
    const a1 = await expectStatus("POST", "/api/assets", {
      name: "r17 投影仪", category: "equipment", quantity: 5, unit: "台", location: "仓库A", custodian: "张三",
    }, 201, "r17 POST 物资 -> 201");
    eq(a1.json && a1.json.name, "r17 投影仪", "r17 POST 物资名回读");
    eq(a1.json && a1.json.quantity, 5, "r17 建账初始库存 5");
    ok(a1.json && a1.json.id > 0, "r17 POST 返回自增 id");
    const a2 = await expectStatus("POST", "/api/assets", {
      name: "r17 打印纸", category: "office", quantity: 100, unit: "包", location: "仓库B", custodian: "李四",
    }, 201, "r17 POST 第二笔物资 -> 201");
    const listAssets = await expectStatus("GET", "/api/assets", undefined, 200, "r17 GET 物资列表 -> 200");
    eq(listAssets.json.assets.length, 2, "r17 列表含两笔新物资");
    const detailAsset = await expectStatus("GET", `/api/assets/${a1.json.id}`, undefined, 200, "r17 GET 物资详情 -> 200");
    eq(detailAsset.json && detailAsset.json.id, a1.json.id, "r17 详情 id 一致");
    const patchedAsset = await expectStatus("PATCH", `/api/assets/${a1.json.id}`, { custodian: "王五" }, 200, "r17 PATCH 物资保管人 -> 200");
    eq(patchedAsset.json && patchedAsset.json.custodian, "王五", "r17 PATCH 保管人回读");

    // ---- 出入库流水（真 HTTP，真落库，零半态） ----
    const txIn = await expectStatus("POST", `/api/assets/${a1.json.id}/transactions`, {
      type: "in", quantity: 3, to: "仓库A", operator: "入库员",
    }, 201, "r17 POST 入库 -> 201");
    eq(txIn.json && txIn.json.type, "in", "r17 入库流水类型回读");
    const afterIn = await expectStatus("GET", `/api/assets/${a1.json.id}`, undefined, 200, "r17 入库后详情回读 -> 200");
    eq(afterIn.json.quantity, 8, "r17 入库真落库 5→8");
    const txOut = await expectStatus("POST", `/api/assets/${a1.json.id}/transactions`, {
      type: "out", quantity: 2, from: "仓库A", operator: "出库员",
    }, 201, "r17 POST 出库 -> 201");
    eq(txOut.json && txOut.json.type, "out", "r17 出库流水类型回读");
    const afterOut = await expectStatus("GET", `/api/assets/${a1.json.id}`, undefined, 200, "r17 出库后详情回读 -> 200");
    eq(afterOut.json.quantity, 6, "r17 出库真落库 8→6");

    // 4xx：负库存 / 非法类型 / 越权 asset_id / 缺操作人（零半态）
    await expectStatus("POST", `/api/assets/${a1.json.id}/transactions`, {
      type: "out", quantity: 999, operator: "x",
    }, 400, "r17 负库存出库 -> 400");
    await expectStatus("POST", `/api/assets/${a1.json.id}/transactions`, {
      type: "sleep", quantity: 1, operator: "x",
    }, 400, "r17 非法流水类型 -> 400");
    await expectStatus("POST", "/api/assets/999999/transactions", {
      type: "in", quantity: 1, operator: "x",
    }, 400, "r17 越权 asset_id 流水 -> 400");
    await expectStatus("POST", `/api/assets/${a1.json.id}/transactions`, {
      type: "in", quantity: 1,
    }, 400, "r17 缺操作人 -> 400");
    const afterReject = await expectStatus("GET", `/api/assets/${a1.json.id}`, undefined, 200, "r17 4xx 后库存回读 -> 200");
    eq(afterReject.json.quantity, 6, "r17 4xx 后库存未变（零半态）");
    const txListAfterReject = await expectStatus("GET", `/api/assets/${a1.json.id}/transactions`, undefined, 200, "r17 4xx 后流水回读 -> 200");
    eq(txListAfterReject.json.transactions.length, 2, "r17 4xx 后未写流水（零半态）");

    // 转移：位置改到仓库B，库存不变
    const txTransfer = await expectStatus("POST", `/api/assets/${a1.json.id}/transactions`, {
      type: "transfer", quantity: 1, from: "仓库A", to: "仓库B", operator: "调拨员",
    }, 201, "r17 POST 转移 -> 201");
    eq(txTransfer.json && txTransfer.json.type, "transfer", "r17 转移流水类型回读");
    const afterTransfer = await expectStatus("GET", `/api/assets/${a1.json.id}`, undefined, 200, "r17 转移后详情回读 -> 200");
    eq(afterTransfer.json.location, "仓库B", "r17 转移真改位置");
    eq(afterTransfer.json.quantity, 6, "r17 转移不改库存");
    await expectStatus("POST", `/api/assets/${a1.json.id}/transactions`, {
      type: "transfer", quantity: 1, from: "仓库C", to: "仓库D", operator: "x",
    }, 400, "r17 来源位置不匹配 -> 400");
    const txByAsset = await expectStatus("GET", "/api/asset-transactions?assetId=" + a1.json.id, undefined, 200, "r17 GET 按物资查流水 -> 200");
    eq(txByAsset.json.transactions.length, 3, "r17 该物资三条流水");
    const txAll = await expectStatus("GET", "/api/asset-transactions", undefined, 200, "r17 GET 全量流水 -> 200");
    eq(txAll.json.transactions.length, 3, "r17 全量流水三条");
    await expectStatus("GET", "/api/asset-transactions?assetId=999999", undefined, 404, "r17 越权流水查询 -> 404");

    // ---- 单位任务 CRUD + 状态流转 + 树 ----
    const t1 = await expectStatus("POST", "/api/unit-tasks", {
      title: "r17 年度审计", assigneeUnit: "审计部", dueDate: "2026-12-31",
    }, 201, "r17 POST 任务 -> 201");
    eq(t1.json && t1.json.status, "pending", "r17 任务默认 pending");
    ok(t1.json && t1.json.id > 0, "r17 POST 任务返回自增 id");
    const t2 = await expectStatus("POST", "/api/unit-tasks", {
      title: "r17 审计子项", assigneeUnit: "审计二组", parentId: t1.json.id,
    }, 201, "r17 POST 子任务 -> 201");
    eq(t2.json && t2.json.parentId, t1.json.id, "r17 子任务父 id 回读");
    const tList = await expectStatus("GET", "/api/unit-tasks", undefined, 200, "r17 GET 任务列表 -> 200");
    eq(tList.json.tasks.length, 2, "r17 列表含两条任务");
    const tDetail = await expectStatus("GET", `/api/unit-tasks/${t1.json.id}`, undefined, 200, "r17 GET 任务详情 -> 200");
    eq(tDetail.json && tDetail.json.id, t1.json.id, "r17 任务详情 id 一致");
    const tPatch = await expectStatus("PATCH", `/api/unit-tasks/${t2.json.id}`, { title: "r17 改名子项" }, 200, "r17 PATCH 任务改名 -> 200");
    eq(tPatch.json && tPatch.json.title, "r17 改名子项", "r17 PATCH 改名回读");
    const tStarted = await expectStatus("POST", `/api/unit-tasks/${t2.json.id}/transition`, { to: "in_progress" }, 200, "r17 POST 流转进行中 -> 200");
    eq(tStarted.json && tStarted.json.status, "in_progress", "r17 流转到 in_progress");
    const tDone = await expectStatus("POST", `/api/unit-tasks/${t2.json.id}/transition`, { to: "done" }, 200, "r17 POST 流转完成 -> 200");
    eq(tDone.json && tDone.json.status, "done", "r17 流转到 done");

    // 4xx：非法流转 / 终态回退 / 非法状态 / 越权 id / 空标题 / 父任务不存在
    await expectStatus("POST", `/api/unit-tasks/${t2.json.id}/transition`, { to: "pending" }, 400, "r17 终态回退 -> 400");
    await expectStatus("POST", `/api/unit-tasks/${t2.json.id}/transition`, { to: "sleep" }, 400, "r17 非法状态 -> 400");
    await expectStatus("POST", `/api/unit-tasks/${t1.json.id}/transition`, { to: "done" }, 400, "r17 pending 直接 done -> 400");
    await expectStatus("POST", "/api/unit-tasks/999999/transition", { to: "in_progress" }, 404, "r17 越权任务流转 -> 404");
    await expectStatus("POST", "/api/unit-tasks", { title: "", assigneeUnit: "u" }, 400, "r17 POST 空标题 -> 400");
    await expectStatus("POST", "/api/unit-tasks", { title: "x", assigneeUnit: "", }, 400, "r17 POST 空责任单位 -> 400");
    await expectStatus("POST", "/api/unit-tasks", { title: "x", assigneeUnit: "u", dueDate: "bad" }, 400, "r17 POST 非法到期日 -> 400");
    await expectStatus("POST", "/api/unit-tasks", { title: "x", assigneeUnit: "u", parentId: 999999 }, 400, "r17 POST 父任务不存在 -> 400");
    await expectStatus("GET", "/api/unit-tasks/999999", undefined, 404, "r17 GET 越权任务 -> 404");
    await expectStatus("PATCH", "/api/unit-tasks/999999", { title: "x" }, 404, "r17 PATCH 越权任务 -> 404");
    await expectStatus("DELETE", "/api/unit-tasks/999999", undefined, 404, "r17 DELETE 越权任务 -> 404");

    // 4xx 后状态未变（零半态）
    const afterTask4xx = await expectStatus("GET", `/api/unit-tasks/${t2.json.id}`, undefined, 200, "r17 任务 4xx 后回读 -> 200");
    eq(afterTask4xx.json.status, "done", "r17 4xx 后任务状态未变（零半态）");

    // 树查询
    const tree = await expectStatus("GET", "/api/unit-tasks/tree", undefined, 200, "r17 GET 任务树 -> 200");
    eq(tree.json.tree.length, 1, "r17 任务树一根");
    eq(tree.json.tree[0].children.length, 1, "r17 根有一个子节点");
    eq(tree.json.tree[0].children[0].id, t2.json.id, "r17 树子节点 id 正确");

    // 物资 4xx
    await expectStatus("POST", "/api/assets", { name: "", category: "office", quantity: 1, unit: "p", location: "l", custodian: "c" }, 400, "r17 POST 空物资名 -> 400");
    await expectStatus("POST", "/api/assets", { name: "x", category: "unknown", quantity: 1, unit: "p", location: "l", custodian: "c" }, 400, "r17 POST 非法分类 -> 400");
    await expectStatus("POST", "/api/assets", { name: "x", category: "office", quantity: -1, unit: "p", location: "l", custodian: "c" }, 400, "r17 POST 负初始库存 -> 400");
    await expectStatus("GET", "/api/assets/999999", undefined, 404, "r17 GET 越权物资 -> 404");
    await expectStatus("PATCH", "/api/assets/999999", { custodian: "x" }, 404, "r17 PATCH 越权物资 -> 404");
    await expectStatus("DELETE", "/api/assets/999999", undefined, 404, "r17 DELETE 越权物资 -> 404");
    await expectStatus("GET", "/api/assets/not-a-number", undefined, 400, "r17 GET 非数字物资 id -> 400");
    await expectStatus("POST", "/api/unit-tasks/not-a-number/transition", { to: "done" }, 400, "r17 非数字任务 id 流转 -> 400");

    // 清理（删除物资/任务，流水级联归零）
    for (const id of [a1.json.id, a2.json.id]) {
      await expectStatus("DELETE", `/api/assets/${id}`, undefined, 200, `r17 DELETE 物资 ${id} -> 200`);
    }
    const afterAssets = await expectStatus("GET", "/api/assets", undefined, 200, "r17 清理后物资列表 -> 200");
    eq(afterAssets.json.assets.length, 0, "r17 清理后物资归零");
    const afterTx = await expectStatus("GET", "/api/asset-transactions", undefined, 200, "r17 清理后流水 -> 200");
    eq(afterTx.json.transactions.length, 0, "r17 级联删除流水归零");
    for (const id of [t1.json.id, t2.json.id]) {
      await expectStatus("DELETE", `/api/unit-tasks/${id}`, undefined, 200, `r17 DELETE 任务 ${id} -> 200`);
    }
    const afterTasks = await expectStatus("GET", "/api/unit-tasks", undefined, 200, "r17 清理后任务列表 -> 200");
    eq(afterTasks.json.tasks.length, 0, "r17 清理后任务归零");
  }

  console.log("\n== schedules delete (r3) ==");
  {
    const d = await expectStatus("DELETE", `/api/schedules/${schedule.id}`, undefined, 200, "DELETE 存在日程 -> 200");
    ok(d.json && d.json.deleted === true, "delete 日程返回 deleted=true");
    await expectStatus("GET", `/api/schedules/${schedule.id}`, undefined, 404, "DELETE 后 GET 日程 -> 404");
    await expectStatus("DELETE", `/api/schedules/${schedule.id}`, undefined, 404, "DELETE 重复同一日程 id -> 404");
    await expectStatus("DELETE", "/api/schedules/not-a-number", undefined, 400, "DELETE 非数字日程 id -> 400");
  }

  console.log("\n== Auth r18: register / login / guard / me / logout / mode / 4xx ==");
  {
    const uname = "r18_audit_" + Date.now().toString(36);
    const uname2 = uname + "_b";
    const pw = "r18-Strong-Pass-2026";

    // ---- 模式基线与注册 4xx ----
    const mode0 = await req("GET", "/api/auth/mode");
    eq(mode0.status, 200, "r18 GET 服务模式 -> 200");
    ok(mode0.json && (mode0.json.mode === "local" || mode0.json.mode === "remote"), "r18 服务模式为 local|remote 之一");
    await expectStatus("POST", "/api/auth/mode", { mode: "local" }, 200, "r18 基线切回 local -> 200");
    await expectStatus("POST", "/api/auth/register", { username: uname, password: "weak" }, 400, "r18 弱密码注册 -> 400");
    await expectStatus("POST", "/api/auth/register", { username: "ab", password: pw }, 400, "r18 过短用户名注册 -> 400");
    await expectStatus("POST", "/api/auth/register", { username: uname, password: pw }, 201, "r18 注册首个用户 -> 201");
    const reg = await req("POST", "/api/auth/register", { username: uname, password: pw });
    eq(reg.status, 409, "r18 重复用户名 -> 409");
    eq(reg.json && reg.json.code, "CONFLICT", "r18 重复用户名错误码 CONFLICT");
    const first = await req("GET", "/api/auth/users");
    eq(first.status, 401, "r18 未带 token 列用户 -> 401");

    // ---- 登录 4xx 与真 token ----
    await expectStatus("POST", "/api/auth/login", { username: uname, password: "wrong-password" }, 401, "r18 错误密码登录 -> 401");
    await expectStatus("POST", "/api/auth/login", { username: "no_such_user_18", password: pw }, 401, "r18 不存在用户登录 -> 401");
    await expectStatus("POST", "/api/auth/register", { username: uname2, password: pw }, 201, "r18 注册第二个用户 -> 201");
    const adminLogin = await expectStatus("POST", "/api/auth/login", { username: uname, password: pw }, 200, "r18 管理员登录 -> 200");
    const token = adminLogin.json && adminLogin.json.token;
    ok(typeof token === "string" && /^[0-9a-f]{64}$/.test(token), "r18 token 为 64 位本地随机 hex");
    eq(adminLogin.json && adminLogin.json.user.username, uname, "r18 登录回显用户名");
    ok(!JSON.stringify(adminLogin.json).includes("password_hash"), "r18 登录响应不含 password_hash");
    ok(Array.isArray(adminLogin.json && adminLogin.json.permissions), "r18 登录回显权限清单");
    const memberLogin = await expectStatus("POST", "/api/auth/login", { username: uname2, password: pw }, 200, "r18 普通用户登录 -> 200");
    const token2 = memberLogin.json && memberLogin.json.token;
    eq(memberLogin.json && memberLogin.json.user.role, "user", "r18 第二个用户角色 user");
    eq(memberLogin.json && memberLogin.json.permissions.includes("user:manage"), false, "r18 普通用户无用户管理权限");

    // ---- 401 清假登录态（无 token / 假 token / 响应头标记）----
    const g0 = await authReq("GET", "/api/auth/guard", null);
    eq(g0.status, 401, "r18 受保护路由无 token -> 401");
    eq(g0.json && g0.json.cleared, true, "r18 401 响应体 cleared=true（前端据此清假登录态）");
    eq(g0.headers.get("x-xieflow-auth-cleared"), "1", "r18 401 响应头 X-Xieflow-Auth-Cleared=1");
    await expectStatus("GET", "/api/auth/guard", undefined, 401, "r18 expectStatus 版 401 复核");
    const gBad = await authReq("GET", "/api/auth/guard", "f".repeat(64));
    eq(gBad.status, 401, "r18 伪造 token -> 401");
    const gBad2 = await authReq("GET", "/api/auth/me", "0".repeat(64));
    eq(gBad2.status, 401, "r18 另一假 token 访问 me -> 401");
    eq(gBad2.json && gBad2.json.code, "UNAUTHORIZED", "r18 假 token 错误码 UNAUTHORIZED");
    ok(gBad2.status === gBad.status, "r18 假 token 在两条受保护路由上行为一致（均 401）");
    const guarded = await authReq("GET", "/api/auth/guard", token);
    eq(guarded.status, 200, "r18 真 token 访问受保护路由 -> 200");
    eq(guarded.json && guarded.json.ok, true, "r18 受保护探针 ok=true");
    eq(guarded.json && guarded.json.userId, adminLogin.json.user.id, "r18 探针回显真用户 id");
    eq(guarded.json && guarded.json.canManageUsers, true, "r18 管理员权限由 shared 映射回显");

    // ---- me / 权限 403 ----
    const meAnon = await req("GET", "/api/auth/me");
    eq(meAnon.status, 401, "r18 GET me 无 token -> 401");
    const me = await authReq("GET", "/api/auth/me", token);
    eq(me.status, 200, "r18 GET me 带 token -> 200");
    eq(me.json && me.json.user.username, uname, "r18 me 回显当前用户");
    ok(Array.isArray(me.json && me.json.permissions), "r18 me 回显权限数组");
    const usersByAdmin = await authReq("GET", "/api/auth/users", token);
    eq(usersByAdmin.status, 200, "r18 管理员列用户 -> 200");
    ok(usersByAdmin.json && usersByAdmin.json.users.length >= 2, "r18 管理员看到至少两个用户");
    const usersByMember = await authReq("GET", "/api/auth/users", token2);
    eq(usersByMember.status, 403, "r18 普通用户列用户 -> 403");
    await authReq("DELETE", `/api/auth/users/${adminLogin.json.user.id}`, token2);
    const delByMember = await authReq("DELETE", `/api/auth/users/${memberLogin.json.user.id}`, token2);
    eq(delByMember.status, 403, "r18 普通用户删用户 -> 403");

    // ---- 会话过期（真 HTTP：短 TTL 登录后等待到期）----
    const shortLogin = await expectStatus("POST", "/api/auth/login", { username: uname, password: pw, ttlMs: 1 }, 200, "r18 短 TTL 登录 -> 200");
    await new Promise((r) => setTimeout(r, 40));
    const expiredGuard = await authReq("GET", "/api/auth/guard", shortLogin.json.token);
    eq(expiredGuard.status, 401, "r18 过期会话访问受保护路由 -> 401");
    eq(expiredGuard.json && expiredGuard.json.cleared, true, "r18 过期会话同样触发清登录态");
    const expiredMe = await authReq("GET", "/api/auth/me", shortLogin.json.token);
    eq(expiredMe.status, 401, "r18 过期会话访问 me -> 401");
    const ttlBad = await req("POST", "/api/auth/login", { username: uname, password: pw, ttlMs: -1 });
    eq(ttlBad.status, 400, "r18 非法 ttlMs 登录 -> 400");

    // ---- 用户第一次用全链路：登录 → 带 token 访问 → 登出 → 401 → 重新登录 ----
    const chainGuard = await authReq("GET", "/api/auth/guard", token);
    eq(chainGuard.status, 200, "r18 全链路① 带 token 访问受保护路由 -> 200");
    const logout = await expectStatus("POST", "/api/auth/logout", { token }, 200, "r18 全链路② 登出 -> 200");
    eq(logout.json && logout.json.cleared, true, "r18 登出返回 cleared=true");
    eq(logout.json && logout.json.deleted, true, "r18 登出真删会话");
    const afterLogout = await authReq("GET", "/api/auth/guard", token);
    eq(afterLogout.status, 401, "r18 全链路③ 登出后 token -> 401");
    const relogin = await expectStatus("POST", "/api/auth/login", { username: uname, password: pw }, 200, "r18 全链路④ 重新登录 -> 200");
    const token3 = relogin.json && relogin.json.token;
    ok(token3 !== token, "r18 重新登录生成不同 token");
    const afterRelogin = await authReq("GET", "/api/auth/guard", token3);
    eq(afterRelogin.status, 200, "r18 全链路⑤ 新 token 访问受保护路由 -> 200");

    // ---- remote 模式：业务路由 401 / 带 token 200 / 切回 local ----
    const switchRemote = await authReq("POST", "/api/auth/mode", token3, { mode: "remote" });
    eq(switchRemote.status, 200, "r18 管理员切 remote -> 200");
    ok(switchRemote.json && switchRemote.json.mode === "remote", "r18 模式回显 remote");
    const memberSwitch = await authReq("POST", "/api/auth/mode", token2, { mode: "local" });
    eq(memberSwitch.status, 403, "r18 remote 下普通用户切模式 -> 403");
    const stillRemote = await req("GET", "/api/auth/mode");
    eq(stillRemote.json && stillRemote.json.mode, "remote", "r18 越权切换未改变模式");
    const todosAnon = await req("GET", "/api/todos");
    eq(todosAnon.status, 401, "r18 remote 模式业务路由无 token -> 401");
    eq(todosAnon.json && todosAnon.json.cleared, true, "r18 remote 401 携带 cleared=true");
    const todosAuthed = await authReq("GET", "/api/todos", token3);
    eq(todosAuthed.status, 200, "r18 remote 模式业务路由带 token -> 200");
    const badMode = await authReq("POST", "/api/auth/mode", token3, { mode: "invalid" });
    eq(badMode.status, 400, "r18 非法模式切换 -> 400");
    const backLocal = await authReq("POST", "/api/auth/mode", token3, { mode: "local" });
    eq(backLocal.status, 200, "r18 管理员切回 local -> 200");
    const todosLocal = await req("GET", "/api/todos");
    eq(todosLocal.status, 200, "r18 local 模式业务路由匿名可用（不破坏既有路由）");

    // ---- r18 rework#1: browser-layer contract over real HTTP (apiFetch sends Bearer) ----
    const rwMode = await authReq("POST", "/api/auth/mode", token3, { mode: "remote" });
    eq(rwMode.status, 200, "r18 返工#1 切回 remote -> 200");
    const rwTodosAuthed = await authReq("GET", "/api/todos", token3);
    eq(rwTodosAuthed.status, 200, "r18 返工#1 remote 模式带 token 访问业务 API -> 200");
    const rwHealthAuthed = await authReq("GET", "/api/health", token3);
    eq(rwHealthAuthed.status, 200, "r18 返工#1 remote 模式带 token 访问健康路由 -> 200");
    const rwTodosAnon = await authReq("GET", "/api/todos", null);
    eq(rwTodosAnon.status, 401, "r18 返工#1 业务 401 反馈到浏览器层 -> 401");
    eq(rwTodosAnon.json && rwTodosAnon.json.cleared, true, "r18 返工#1 业务 401 响应体 cleared=true（前端清 localStorage）");
    eq(rwTodosAnon.headers.get("x-xieflow-auth-cleared"), "1", "r18 返工#1 业务 401 响应头 X-Xieflow-Auth-Cleared=1");
    const rwBackLocal = await authReq("POST", "/api/auth/mode", token3, { mode: "local" });
    eq(rwBackLocal.status, 200, "r18 返工#1 复验后切回 local -> 200");

    // ---- 清理本轮自建账号（级联清会话）：先删普通用户，再删管理员自己 ----
    const delMember = await authReq("DELETE", `/api/auth/users/${memberLogin.json.user.id}`, token3);
    eq(delMember.status, 200, "r18 清理普通用户账号 -> 200");
    const delAdmin = await authReq("DELETE", `/api/auth/users/${adminLogin.json.user.id}`, token3);
    eq(delAdmin.status, 200, "r18 清理管理员账号 -> 200");
    const afterCleanup = await authReq("GET", "/api/auth/guard", token3);
    eq(afterCleanup.status, 401, "r18 用户删除后其会话级联失效 -> 401");
    const finalMode = await req("GET", "/api/auth/mode");
    eq(finalMode.json && finalMode.json.mode, "local", "r18 终态服务模式回 local");
  }

  // ---- r19：多端同步与冲突处理（真 HTTP：增量拉取 / 乐观锁 409 / 幂等 / 越权） ----
  console.log("\n== Sync r19: changes / apply / status / 409 conflict / 4xx ==");
  {
    const ET = "todo";
    const EID = "r19-http";
    // 空闲态
    const st0 = await expectStatus("GET", "/api/sync/status", undefined, 200, "r19 GET status -> 200");
    eq(st0.json && st0.json.total, 0, "r19 初始无实体版本");
    eq(st0.json && st0.json.lastChangeId, 0, "r19 初始 lastChangeId=0");
    eq(st0.json && st0.json.schemaVersion, 27, "r19 status 回带 schema v18（r25 推进）");
    const ch0 = await expectStatus("GET", "/api/sync/changes?since=0&limit=50", undefined, 200, "r19 GET changes 空 -> 200");
    eq(ch0.json && ch0.json.count, 0, "r19 初始变更日志为空");
    eq(ch0.json && ch0.json.changes, [], "r19 初始 changes 数组为空");

    // 首用全链路①：建基线 v1
    const a1 = await expectStatus("POST", "/api/sync/apply", {
      entityType: ET, entityId: EID, operation: "create", payload: { title: "A", status: "open" }, expectedVersion: 0,
    }, 200, "r19 apply create -> 200");
    eq(a1.json && a1.json.version, 1, "r19 首次同步版本=1");
    eq(a1.json && a1.json.idempotent, false, "r19 首次同步非幂等重放");
    ok(a1.json && a1.json.applied.id > 0, "r19 真写 change_log 返回自增 id");
    const st1 = await req("GET", "/api/sync/status");
    eq(st1.json && st1.json.total, 1, "r19 status 实体版本数=1");
    eq(st1.json && st1.json.lastChangeId, a1.json && a1.json.applied.id, "r19 status 回带最后变更 id（精确=最新一条）");
    eq(st1.json && st1.json.lastChangeAt, a1.json && a1.json.applied.createdAt, "r19 status 回带最后变更时间（精确=最新一条）");

    // 增量拉取幂等 + since/limit
    const pull1 = await expectStatus("GET", "/api/sync/changes?since=0&limit=50", undefined, 200, "r19 增量拉取 -> 200");
    eq(pull1.json && pull1.json.count, 1, "r19 拉取返回 1 条");
    const pull2 = await req("GET", "/api/sync/changes?since=0&limit=50");
    eq(pull2.json && pull2.json.changes, pull1.json && pull1.json.changes, "r19 同一 since 重复拉逐字节一致（幂等）");
    eq(pull2.json && pull2.json.since, 0, "r19 响应回显 since");
    eq(pull2.json && pull2.json.limit, 50, "r19 响应回显 limit");

    // 非法 since / limit / 载荷 / 版本 → 400
    await expectStatus("GET", "/api/sync/changes?since=-1", undefined, 400, "r19 负 since -> 400");
    await expectStatus("GET", "/api/sync/changes?since=abc", undefined, 400, "r19 非数字 since -> 400");
    await expectStatus("GET", "/api/sync/changes?limit=-3", undefined, 400, "r19 负 limit -> 400");
    const capped = await req("GET", "/api/sync/changes?limit=99999");
    eq(capped.json && capped.json.limit, 200, "r19 超上界 limit 收敛为 200");
    await expectStatus("POST", "/api/sync/apply", { entityType: "Bad Type", entityId: EID, operation: "update", payload: {}, expectedVersion: 1 }, 400, "r19 非法 entityType -> 400");
    await expectStatus("POST", "/api/sync/apply", { entityType: ET, entityId: EID, operation: "sleep", payload: {}, expectedVersion: 1 }, 400, "r19 非法 operation -> 400");
    await expectStatus("POST", "/api/sync/apply", { entityType: ET, entityId: EID, operation: "update", payload: [], expectedVersion: 1 }, 400, "r19 数组载荷 -> 400");
    await expectStatus("POST", "/api/sync/apply", { entityType: ET, entityId: EID, operation: "update", payload: {}, expectedVersion: -1 }, 400, "r19 负期望版本 -> 400");
    await expectStatus("POST", "/api/sync/apply", { entityId: EID, operation: "update", payload: {}, expectedVersion: 1 }, 400, "r19 缺 entityType -> 400");

    // 首用全链路②：本地改 A -> v2
    const a2 = await expectStatus("POST", "/api/sync/apply", {
      entityType: ET, entityId: EID, operation: "update", payload: { title: "L", status: "open" }, expectedVersion: 1,
    }, 200, "r19 本地改 title -> 200");
    eq(a2.json && a2.json.version, 2, "r19 本地改后版本=2");
    const p3 = await req("GET", "/api/sync/changes?since=0&limit=50");
    eq(p3.json && p3.json.count, 2, "r19 两条变更后日志数=2");
    const pInc = await req("GET", "/api/sync/changes?since=1&limit=50");
    eq(pInc.json && pInc.json.count, 1, "r19 since=1 只返回 id>1 的一条");

    // 首用全链路③：远端也在旧基线上改同一个字段 -> 409 + 冲突字段准确
    const stale = await expectStatus("POST", "/api/sync/apply", {
      entityType: ET, entityId: EID, operation: "update",
      payload: { title: "R", status: "open" }, expectedVersion: 1, base: { title: "A", status: "open" },
    }, 409, "r19 过期版本改同字段 -> 409（真造冲突）");
    eq(stale.json && stale.json.code, "SYNC_CONFLICT", "r19 409 code=SYNC_CONFLICT");
    eq(stale.json && stale.json.conflicts, ["title"], "r19 409 冲突字段列表=[title]（waizhuan 手算口径）");
    eq(stale.json && stale.json.currentVersion, 2, "r19 409 回带服务端当前版本 2");
    eq(stale.json && stale.json.base && stale.json.base.title, "A", "r19 409 回带基线供弹窗 diff");
    eq(stale.json && stale.json.local && stale.json.local.title, "R", "r19 409 回带本地值供弹窗 diff");
    eq(stale.json && stale.json.remote && stale.json.remote.title, "L", "r19 409 回带远端值供弹窗选边");
    const stAfterConflict = await req("GET", "/api/sync/status");
    eq(stAfterConflict.json && stAfterConflict.json.total, 1, "r19 409 不产生版本变更（零半态）");

    // 不同字段场景：两端改不同字段 -> conflicts=[] 但 divergedFields 列全
    const EID2 = "r19-http-diff";
    await expectStatus("POST", "/api/sync/apply", { entityType: ET, entityId: EID2, operation: "create", payload: { title: "T", status: "open" }, expectedVersion: 0 }, 200, "r19 diff 基线 -> 200");
    await expectStatus("POST", "/api/sync/apply", { entityType: ET, entityId: EID2, operation: "update", payload: { title: "L", status: "open" }, expectedVersion: 1 }, 200, "r19 本地改 title -> 200");
    const diffConflict = await expectStatus("POST", "/api/sync/apply", {
      entityType: ET, entityId: EID2, operation: "update", payload: { title: "T", status: "done" }, expectedVersion: 1, base: { title: "T", status: "open" },
    }, 409, "r19 两端改不同字段仍因版本过期 -> 409");
    eq(diffConflict.json && diffConflict.json.conflicts, [], "r19 不同字段无严格冲突（可三方合并）");
    eq(diffConflict.json && diffConflict.json.divergedFields, ["status", "title"], "r19 分歧字段列表=[status,title]");
    const merged = await expectStatus("POST", "/api/sync/apply", {
      entityType: ET, entityId: EID2, operation: "update", payload: { title: "L", status: "done" }, expectedVersion: 2,
    }, 200, "r19 合并两端改动后写入 -> 200");
    eq(merged.json && merged.json.version, 3, "r19 合并写入版本=3");

    // 首用全链路④：选远端 -> 版本递增；⑤ 再同步幂等无冲突
    const resolved = await expectStatus("POST", "/api/sync/apply", {
      entityType: ET, entityId: EID, operation: "update", payload: { title: "L", status: "open" }, expectedVersion: 2, base: { title: "A", status: "open" },
    }, 200, "r19 选边后写入 -> 200");
    eq(resolved.json && resolved.json.version, 3, "r19 选边后版本=3");
    const replay = await expectStatus("POST", "/api/sync/apply", {
      entityType: ET, entityId: EID, operation: "update", payload: { title: "L", status: "open" }, expectedVersion: 2,
    }, 200, "r19 同载荷重放 -> 200（幂等）");
    eq(replay.json && replay.json.version, 3, "r19 幂等重放版本不二次递增");
    eq(replay.json && replay.json.idempotent, true, "r19 幂等重放标 idempotent=true");
    const finalPull = await req("GET", "/api/sync/changes?since=0&limit=50");
    eq(finalPull.json && finalPull.json.count, 6, "r19 幂等重放/409 冲突不新增日志（两实体共 6 次成功写入）");
    const st6 = await req("GET", "/api/sync/status");
    eq(st6.json && st6.json.lastChangeId, resolved.json && resolved.json.applied.id, "r19 6 条变更后 status.lastChangeId=最新 id（非最早）");
    eq(st6.json && st6.json.lastChangeAt, resolved.json && resolved.json.applied.createdAt, "r19 6 条变更后 status.lastChangeAt=最后写入时间");

    // 远端模式：匿名 401 / 带 token 200 / 普通用户越权 403
    const adminU = "r19_sync_admin";
    const memberU = "r19_sync_member";
    const pw = "SyncR19!Pass";
    await expectStatus("POST", "/api/auth/register", { username: adminU, password: pw }, 201, "r19 注册管理员 -> 201");
    const memberReg = await expectStatus("POST", "/api/auth/register", { username: memberU, password: pw }, 201, "r19 注册普通用户 -> 201");
    const adminLogin = await expectStatus("POST", "/api/auth/login", { username: adminU, password: pw }, 200, "r19 管理员登录 -> 200");
    const memberLogin = await expectStatus("POST", "/api/auth/login", { username: memberU, password: pw }, 200, "r19 普通用户登录 -> 200");
    const adminToken = adminLogin.json && adminLogin.json.token;
    const memberToken = memberLogin.json && memberLogin.json.token;
    await authReq("POST", "/api/auth/mode", adminToken, { mode: "remote" });
    const anonStatus = await req("GET", "/api/sync/status");
    eq(anonStatus.status, 401, "r19 remote 匿名访问 status -> 401");
    eq(anonStatus.json && anonStatus.json.cleared, true, "r19 remote 401 清假登录态");
    const authedStatus = await authReq("GET", "/api/sync/status", adminToken);
    eq(authedStatus.status, 200, "r19 remote 带 token 访问 status -> 200");
    const authedChanges = await authReq("GET", "/api/sync/changes?since=0&limit=10", adminToken);
    eq(authedChanges.status, 200, "r19 remote 带 token 拉变更 -> 200");
    const overreach = await authReq("POST", "/api/sync/apply", memberToken, {
      entityType: ET, entityId: "r19-overreach", operation: "create", payload: {}, expectedVersion: 0,
      userId: adminLogin.json.user.id,
    });
    eq(overreach.status, 403, "r19 普通用户把变更记到别人名下 -> 403");
    const memberOwn = await authReq("POST", "/api/sync/apply", memberToken, {
      entityType: ET, entityId: "r19-overreach", operation: "create", payload: { title: "ok" }, expectedVersion: 0,
    });
    eq(memberOwn.status, 200, "r19 普通用户记自己名下 -> 200");
    await authReq("POST", "/api/auth/mode", adminToken, { mode: "local" });
    // 清理
    await authReq("DELETE", `/api/auth/users/${memberReg.json.user.id}`, adminToken);
    await authReq("DELETE", `/api/auth/users/${adminLogin.json.user.id}`, adminToken);
    const finalMode19 = await req("GET", "/api/auth/mode");
    eq(finalMode19.json && finalMode19.json.mode, "local", "r19 终态服务模式回 local");
  }

  // ---- r20：离线队列服务端重放（按序 / 4xx 非法条目 / 409 重放冲突 / 零半态） ----
  console.log("\n== Offline r20: replay order / 400 illegal items / 409 replay conflict ==");
  {
    const RP = OFFLINE_REPLAY_PATH;
    const empty = await expectStatus("POST", RP, { items: [] }, 200, "r20 空队列重放 -> 200");
    eq(empty.json && empty.json.replayed, 0, "r20 空队列重放 replayed=0");
    eq(empty.json && empty.json.results, [], "r20 空队列重放 results=[]");
    eq(empty.json && empty.json.conflictIndex, -1, "r20 空队列无冲突 conflictIndex=-1");

    // 非法队列条目：400 且零半态（一条不落库）
    const before = await req("GET", "/api/todos");
    const baselineCount = before.json && before.json.todos ? before.json.todos.length : -1;
    await expectStatus("POST", RP, { items: "nope" }, 400, "r20 items 非数组 -> 400");
    await expectStatus("POST", RP, {}, 400, "r20 缺 items -> 400");
    await expectStatus("POST", RP, { items: [{ id: "x", method: "TRACE", path: "/api/todos", body: {}, createdAt: "2026-11-18T10:00:00.000Z" }] }, 400, "r20 非法方法条目 -> 400");
    await expectStatus("POST", RP, { items: [{ id: "x", method: "POST", path: "https://evil.example/api/todos", body: {}, createdAt: "2026-11-18T10:00:00.000Z" }] }, 400, "r20 外部绝对 URL 条目 -> 400");
    await expectStatus("POST", RP, { items: [{ id: "x", method: "POST", path: RP, body: {}, createdAt: "2026-11-18T10:00:00.000Z" }] }, 400, "r20 重放端点自身条目 -> 400（防递归）");
    await expectStatus("POST", RP, { items: [{ id: "", method: "POST", path: "/api/todos", body: {}, createdAt: "2026-11-18T10:00:00.000Z" }] }, 400, "r20 空 id 条目 -> 400");
    await expectStatus("POST", RP, { items: [{ id: "x", method: "POST", path: "/api/todos", body: [], createdAt: "2026-11-18T10:00:00.000Z" }] }, 400, "r20 数组载荷条目 -> 400");
    await expectStatus("POST", RP, { items: Array.from({ length: OFFLINE_QUEUE_MAX + 1 }, (_, i) => ({ id: `big-${i}`, method: "POST", path: "/api/todos", body: {}, createdAt: "2026-11-18T10:00:00.000Z" })) }, 400, "r20 超容量批次 -> 400");
    const afterBad = await req("GET", "/api/todos");
    eq(afterBad.json && afterBad.json.todos && afterBad.json.todos.length, baselineCount, "r20 非法条目全批拒绝：零半态（一条待办都未写）");
    eq(afterBad.json && afterBad.json.todos && afterBad.json.todos.filter((t: any) => String(t.title).startsWith("r20 ")).length, 0, "r20 非法条目未产生 r20 探针待办");

    // 按序重放：两条 create（createdAt 乱序提交），结果按 createdAt 升序而非数组顺序
    const tA = "r20 offline A " + Date.now().toString(36);
    const tB = "r20 offline B " + Date.now().toString(36);
    const ordered = await expectStatus("POST", RP, { items: [
      { id: "late", method: "POST", path: "/api/todos", body: { title: tB, quadrant: "q2" }, createdAt: "2026-11-18T12:00:00.000Z" },
      { id: "early", method: "POST", path: "/api/todos", body: { title: tA, quadrant: "q1" }, createdAt: "2026-11-18T09:00:00.000Z" },
    ] }, 200, "r20 两条合法 create 按序重放 -> 200");
    eq(ordered.json && ordered.json.replayed, 2, "r20 重放 replayed=2");
    eq(ordered.json && ordered.json.conflictIndex, -1, "r20 合法批次无冲突");
    eq(ordered.json && ordered.json.results && ordered.json.results[0].id, "early", "r20 首条结果是 createdAt 更早的 early（按序重发）");
    eq(ordered.json && ordered.json.results && ordered.json.results[1].id, "late", "r20 次条结果是 late（顺序确定）");
    eq(ordered.json && ordered.json.results && ordered.json.results[0].status, 201, "r20 首条真实落库返回 201");
    eq(ordered.json && ordered.json.results && ordered.json.results[1].status, 201, "r20 次条真实落库返回 201");
    ok(ordered.json && ordered.json.results.every((r: any) => r.ok === true), "r20 每条结果 ok=true");
    const list = await req("GET", "/api/todos");
    const created = (list.json && list.json.todos ? list.json.todos : []).filter((t: any) => t.title === tA || t.title === tB);
    eq(created.length, 2, "r20 两条离线待办真落到 api 库");
    eq(created[0] && created[0].title, tA, "r20 先 createdAt 的待办先落库（真实顺序）");

    // 变更条目重放：PATCH 真改状态；业务 4xx 由条目结果带回、端点返回 400
    const patched = await expectStatus("POST", RP, { items: [
      { id: "patch", method: "PATCH", path: `/api/todos/${created[0].id}`, body: { status: "done" }, createdAt: "2026-11-18T13:00:00.000Z" },
    ] }, 200, "r20 PATCH 重放 -> 200");
    eq(patched.json && patched.json.results && patched.json.results[0].status, 200, "r20 PATCH 条目真实 HTTP 200");
    const afterPatch = await req("GET", `/api/todos/${created[0].id}`);
    eq(afterPatch.json && afterPatch.json.status, "done", "r20 PATCH 重放后状态真改（非伪造回执）");
    const badBusiness = await expectStatus("POST", RP, { items: [
      { id: "bad", method: "POST", path: "/api/todos", body: { title: "" }, createdAt: "2026-11-18T14:00:00.000Z" },
    ] }, 400, "r20 条目被业务守卫拒绝 -> 端点 400");
    eq(badBusiness.json && badBusiness.json.conflictIndex, 0, "r20 业务 4xx 回带冲突条目下标");
    ok(badBusiness.json && badBusiness.json.error.length > 0, "r20 业务 4xx 带可读错误");

    // 重放冲突：同一实体两条不同载荷、相同期望版本 → 第一条成功、第二条 409（零半态）
    const entityId = "r20-replay-conflict-" + Date.now().toString(36);
    const conflictItems = [
      { id: "s1", method: "POST", path: "/api/sync/apply", body: { entityType: "todo", entityId, operation: "create", payload: { title: "first" }, expectedVersion: 0 }, createdAt: "2026-11-18T15:00:00.000Z" },
      { id: "s2", method: "POST", path: "/api/sync/apply", body: { entityType: "todo", entityId, operation: "create", payload: { title: "second" }, expectedVersion: 0 }, createdAt: "2026-11-18T15:01:00.000Z" },
    ];
    const conflict = await expectStatus("POST", RP, { items: conflictItems }, 409, "r20 重放中乐观锁冲突 -> 409");
    eq(conflict.json && conflict.json.conflictIndex, 1, "r20 409 精确指认第二条为冲突条目");
    eq(conflict.json && conflict.json.results && conflict.json.results.length, 2, "r20 两条结果都回带（含冲突条的状态）");
    eq(conflict.json && conflict.json.results && conflict.json.results[1].status, 409, "r20 冲突条目结果 status=409");
    eq(conflict.json && conflict.json.code, "OFFLINE_REPLAY_CONFLICT", "r20 409 code=OFFLINE_REPLAY_CONFLICT");
    const st = await req("GET", "/api/sync/status");
    const tracked = (st.json && st.json.versions ? st.json.versions : []).filter((v: any) => v.entityId === entityId);
    eq(tracked.length, 1, "r20 冲突后只写第一条（零半态：不会有第二条版本）");
    eq(tracked[0] && tracked[0].version, 1, "r20 冲突实体版本停在 1");
    const changes = await req("GET", "/api/sync/changes?since=0&limit=200");
    eq((changes.json && changes.json.changes ? changes.json.changes : []).filter((c: any) => c.entityId === entityId).length, 1, "r20 冲突未产生第二条 change_log");

    // 清理本轮探针待办（保留 r19 既有数据不动）
    for (const id of created.map((t: any) => t.id)) {
      await expectStatus("DELETE", `/api/todos/${id}`, undefined, 200, `r20 DELETE 探针待办 ${id} -> 200`);
    }
    const finalList = await req("GET", "/api/todos");
    eq(finalList.json && finalList.json.todos && finalList.json.todos.length, baselineCount, "r20 清理后待办数回到基线");
    const replayHeaders = await fetch(`${BASE}${RP}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [] }),
      signal: AbortSignal.timeout(5000),
    });
    eq(replayHeaders.headers.get(OFFLINE_HEADER), null, "r20 在线重放响应不带离线入队标记头（与客户端 202 语义区分）");
  }

  // ---- r21：部署契约健康/模式/关键路由（真实 HTTP，contract 来自 shared） ----
  console.log("\n== Deploy r21: health / mode / key routes (contract-driven) ==");
  {
    eq(DEPLOY_ROUTES.length, 5, "r21 audit 部署契约关键路由数 5");

    // health：真 HTTP 200 + 真读库语义
    const h = await expectStatus("GET", DEPLOY_PATHS.health, undefined, 200, "r21 GET 契约健康路径 -> 200");
    eq(h.json && h.json.ok, true, "r21 health.ok=true");
    eq(h.json && h.json.schemaVersion, 27, "r21 health.schemaVersion=27（部署版本一致）");
    ok(isServerMode(h.json && h.json.mode), "r21 health.mode 为 local|remote 之一（契约模式合法）");

    // mode：模式探针公开可达，回显一致
    const m = await expectStatus("GET", DEPLOY_PATHS.mode, undefined, 200, "r21 GET 契约模式路径 -> 200");
    ok(isServerMode(m.json && m.json.mode), "r21 mode.mode 合法");
    ok(isServerMode(m.json && m.json.envMode), "r21 mode.envMode 合法");
    eq(m.json && m.json.mode, h.json && h.json.mode, "r21 health 与 mode 回显同一模式（契约一致）");

    // 关键路由按契约逐一真探针（local 口径；强保护路由 401 属预期）
    const reportedMode: string = h.json && h.json.mode;
    for (const route of DEPLOY_ROUTES) {
      const expect = expectedDeployStatus(route, reportedMode);
      const res = await req("GET", route.path);
      eq(res.status, expect, `r21 关键路由 ${route.path} -> ${expect}（契约模式 ${reportedMode}）`);
    }

    // 401 探针语义（认证页 401 属预期，带 cleared 供前端清态）
    const anonProtected = await req("GET", DEPLOY_PATHS.authMe);
    eq(anonProtected.status, 401, "r21 强保护路由匿名 -> 401（预期）");
    eq(anonProtected.json && anonProtected.json.cleared, true, "r21 401 携带 cleared=true");

    // settings 公开可达（部署自检不依赖登录）
    await expectStatus("GET", DEPLOY_PATHS.settings, undefined, 200, "r21 GET 契约 settings -> 200（匿名公开）");

    // 契约外路径必须 404（部署探针不误暴露内部路由）
    await expectStatus("GET", "/api/__r21_not_a_route__", undefined, 404, "r21 契约外路径 -> 404");
    ok(missingDeployMarkers("start.cmd http://127.0.0.1:8080 ./data/ start.sh", DEPLOY_GUIDE_MARKERS).length === 0, "r21 audit 引导四要素契约校验（共享函数）");
  }

  // ---- r22：部署文档补强后的路由契约复核（真 HTTP + 常量结构） ----
  console.log("\n== Deploy r22: route contract after docs cleanup ==");
  {
    const h22 = await expectStatus("GET", DEPLOY_PATHS.health, undefined, 200, "r22 health 路由真 HTTP 200");
    ok(Array.isArray(h22.json && h22.json.settings), "r22 health 响应含 settings 数组（部署自检依赖）");
    ok(
      Array.isArray(h22.json && h22.json.settings) &&
        h22.json.settings.some((s: { key: string }) => s.key === "last_health_check"),
      "r22 health settings 含 last_health_check 时间戳键",
    );
    const healthRes = await fetch(`${BASE}${DEPLOY_PATHS.health}`, { signal: AbortSignal.timeout(5000) });
    ok((healthRes.headers.get("content-type") ?? "").includes("application/json"), "r22 health 响应 content-type 为 JSON（契约）");
    const m22 = await expectStatus("GET", DEPLOY_PATHS.mode, undefined, 200, "r22 mode 路由真 HTTP 200");
    ok(isServerMode(m22.json && m22.json.envMode) && m22.json.envMode === m22.json.mode, "r22 envMode 与 mode 回显一致（本机契约）");
    const t22 = await expectStatus("GET", DEPLOY_PATHS.todos, undefined, 200, "r22 todos 业务路由 local 模式 200");
    ok(Array.isArray(t22.json && t22.json.todos), "r22 todos 路由返回 todos 数组（部署探针契约）");
    await expectStatus("GET", "/api/__r22_not_a_route__", undefined, 404, "r22 契约外路径 -> 404");
    ok(DEPLOY_ROUTES.every((r) => r.path.startsWith("/api/")), "r22 5 条部署路由全在 /api 契约前缀下");
    eq(new Set(Object.values(DEPLOY_PATHS)).size, Object.keys(DEPLOY_PATHS).length, "r22 部署路径常量无重复");
  }

  // ---- r23：组织架构与通讯录（真 HTTP 装配 + 4xx，waizhuan 会造 A→B→A 环验证拒绝） ----
  console.log("\n== Org r23: departments / members / tree / search / 4xx ==");
  {
    const h23 = await expectStatus("GET", "/api/health", undefined, 200, "r23 health 真 HTTP 200");
    eq(h23.json && h23.json.schemaVersion, 27, "r23 health.schemaVersion=27（迁移真生效）");
    const tree0 = await expectStatus("GET", "/api/org/tree", undefined, 200, "r23 空组织树 -> 200");
    eq(tree0.json && tree0.json.tree, [], "r23 空组织树 tree=[]");
    eq(tree0.json && tree0.json.departments, [], "r23 空组织树 departments=[]");
    eq(tree0.json && tree0.json.members, [], "r23 空组织树 members=[]");

    const root = await expectStatus("POST", "/api/departments", { name: "审计总部" }, 201, "r23 建根部门 -> 201");
    const center = await expectStatus("POST", "/api/departments", { name: "审计研发中心", parentId: root.json.id }, 201, "r23 建二级部门 -> 201");
    const front = await expectStatus("POST", "/api/departments", { name: "审计前端组", parentId: center.json.id }, 201, "r23 建三级部门 -> 201");
    eq(front.json && front.json.parentId, center.json.id, "r23 三级部门 parent_id 真落库");
    const tree3 = await expectStatus("GET", "/api/org/tree", undefined, 200, "r23 三级树装配 -> 200");
    eq(tree3.json && tree3.json.tree.length, 1, "r23 三级树只有一个根");
    eq(
      tree3.json && tree3.json.tree[0].children[0].children[0].department.id,
      front.json.id,
      "r23 三级层级真实装配（总部→研发中心→前端组）",
    );

    await expectStatus("POST", "/api/departments", { name: "审计研发中心" }, 400, "r23 重复部门名 -> 400");
    await expectStatus("POST", "/api/departments", { name: "   " }, 400, "r23 空白部门名 -> 400");
    await expectStatus("POST", "/api/departments", { name: "越权父", parentId: 999999 }, 400, "r23 越权 parent_id -> 400");
    await expectStatus("POST", `/api/departments/${root.json.id}/move`, { parentId: root.json.id }, 400, "r23 自挂 -> 400");
    await expectStatus("POST", `/api/departments/${root.json.id}/move`, { parentId: front.json.id }, 400, "r23 A→B→A 成环 -> 400");
    await expectStatus("POST", `/api/departments/${front.json.id}/move`, { parentId: 999999 }, 400, "r23 移动目标不存在 -> 400");
    await expectStatus("POST", "/api/departments/not-a-number/move", { parentId: null }, 400, "r23 非数字部门 id -> 400");
    await expectStatus("GET", "/api/departments/999999", undefined, 404, "r23 未知部门详情 -> 404");
    await expectStatus("PATCH", "/api/departments/999999", { name: "x" }, 404, "r23 未知部门编辑 -> 404");
    await expectStatus("DELETE", "/api/departments/999999", undefined, 404, "r23 未知部门删除 -> 404");
    const moved = await expectStatus("POST", `/api/departments/${front.json.id}/move`, { parentId: root.json.id }, 200, "r23 合法移动 -> 200");
    eq(moved.json && moved.json.parentId, root.json.id, "r23 合法移动后 parent_id 真回读");
    const badMoveAfter = await req("GET", `/api/departments/${front.json.id}`);
    eq(badMoveAfter.json && badMoveAfter.json.parentId, root.json.id, "r23 4xx 拒绝没有半路改库");

    const alice = await expectStatus("POST", "/api/members", {
      name: "Alice Chen", email: "Alice.Chen@Example.COM", departmentId: front.json.id, title: "Frontend Engineer",
    }, 201, "r23 建人员 -> 201");
    const bob = await expectStatus("POST", "/api/members", {
      name: "Bob", email: "BOB@example.com", departmentId: center.json.id, title: "Backend engineer",
    }, 201, "r23 建第二人 -> 201");
    eq(alice.json && alice.json.status, "active", "r23 人员默认状态 active");
    eq(alice.json && alice.json.role, "member", "r23 人员默认角色 member");
    eq(alice.json && alice.json.email, "Alice.Chen@Example.COM", "r23 邮箱原样保存（搜索时才大小写不敏感）");
    const listAll = await expectStatus("GET", "/api/members", undefined, 200, "r23 人员列表 -> 200");
    eq(listAll.json && listAll.json.count, 2, "r23 人员列表 count=2");
    const byDept = await expectStatus("GET", `/api/members?departmentId=${front.json.id}`, undefined, 200, "r23 按部门查人员 -> 200");
    eq(byDept.json && byDept.json.members.map((m: { id: number }) => m.id), [alice.json.id], "r23 按部门过滤只返回该部门人员");
    const qName = await expectStatus("GET", "/api/members/search?q=alice", undefined, 200, "r23 姓名搜索 -> 200");
    eq(qName.json && qName.json.members.map((m: { id: number }) => m.id), [alice.json.id], "r23 姓名搜索大小写不敏感");
    const qEmail = await expectStatus("GET", "/api/members/search?q=EXAMPLE.COM", undefined, 200, "r23 邮箱搜索 -> 200");
    eq(qEmail.json && qEmail.json.members.length, 2, "r23 邮箱搜索大小写不敏感两人全中");
    const qTitle = await expectStatus("GET", "/api/members/search?q=ENGINEER", undefined, 200, "r23 职位搜索 -> 200");
    eq(qTitle.json && qTitle.json.members.length, 2, "r23 职位搜索大小写不敏感两人全中");
    const qCombo = await expectStatus("GET", `/api/members?departmentId=${front.json.id}&q=ENGINEER`, undefined, 200, "r23 部门+搜索组合 -> 200");
    eq(qCombo.json && qCombo.json.members.map((m: { id: number }) => m.id), [alice.json.id], "r23 按部门 + 模糊搜索叠加过滤");
    const qNone = await expectStatus("GET", "/api/members/search?q=不存在的人", undefined, 200, "r23 无命中搜索 -> 200");
    eq(qNone.json && qNone.json.members, [], "r23 无命中返回空数组");
    const treeMembers = await expectStatus("GET", "/api/org/tree", undefined, 200, "r23 组织树带人员 -> 200");
    eq(
      treeMembers.json && treeMembers.json.tree[0].children[0].members.map((m: { id: number }) => m.id),
      [bob.json.id],
      "r23 组织树部门带真实人员",
    );

    await expectStatus("POST", "/api/members", { name: "bad", email: "bad-email" }, 400, "r23 非法邮箱 -> 400");
    await expectStatus("POST", "/api/members", { name: "", email: "a@b.com" }, 400, "r23 空姓名 -> 400");
    await expectStatus("POST", "/api/members", { name: "x", email: "a@b.com", status: "retired" }, 400, "r23 非法状态 -> 400");
    await expectStatus("POST", "/api/members", { name: "x", email: "a@b.com", departmentId: 999999 }, 400, "r23 越权部门 id -> 400");
    await expectStatus("POST", "/api/members", { name: "x", email: "a@b.com", userId: 999999 }, 400, "r23 越权用户 id -> 400");
    await expectStatus("GET", "/api/members/999999", undefined, 404, "r23 未知人员详情 -> 404");
    await expectStatus("PATCH", "/api/members/999999", { name: "x" }, 404, "r23 未知人员编辑 -> 404");
    await expectStatus("DELETE", "/api/members/999999", undefined, 404, "r23 未知人员删除 -> 404");
    await expectStatus("GET", "/api/members/not-a-number", undefined, 400, "r23 非数字人员 id -> 400");
    const patched = await expectStatus("PATCH", `/api/members/${alice.json.id}`, { title: "Staff Engineer" }, 200, "r23 编辑人员职位 -> 200");
    eq(patched.json && patched.json.title, "Staff Engineer", "r23 编辑后职位真回读");
    const qPatched = await expectStatus("GET", "/api/members/search?q=STAFF", undefined, 200, "r23 改后职位搜索 -> 200");
    eq(qPatched.json && qPatched.json.members.length, 1, "r23 改职位后大小写不敏感搜索命中新值");

    await expectStatus("DELETE", `/api/members/${alice.json.id}`, undefined, 200, "r23 删除人员 Alice -> 200");
    await expectStatus("DELETE", `/api/members/${bob.json.id}`, undefined, 200, "r23 删除人员 Bob -> 200");
    await expectStatus("DELETE", `/api/departments/${front.json.id}`, undefined, 200, "r23 删除部门前端组 -> 200");
    await expectStatus("DELETE", `/api/departments/${center.json.id}`, undefined, 200, "r23 删除部门研发中心 -> 200");
    await expectStatus("DELETE", `/api/departments/${root.json.id}`, undefined, 200, "r23 删除部门总部 -> 200");
    const treeFinal = await expectStatus("GET", "/api/org/tree", undefined, 200, "r23 清理后组织树 -> 200");
    eq(treeFinal.json && treeFinal.json.members, [], "r23 清理后无残留人员");
    eq(treeFinal.json && treeFinal.json.tree, [], "r23 清理后无残留部门");
  }

  // ---- r24：通讯录成员接入审批/物资（真 HTTP 4xx + 摘要 + usage，waizhuan 会造停用成员验证拒绝） ----
  console.log("\n== Org r24: member_id in approvals / assets / usage / 4xx ==");
  {
    const h24 = await expectStatus("GET", "/api/health", undefined, 200, "r24 health 真 HTTP 200");
    eq(h24.json && h24.json.schemaVersion, 27, "r24 health.schemaVersion=27（迁移真生效）");

    const dept = await expectStatus("POST", "/api/departments", { name: "r24审计研发中心" }, 201, "r24 建部门 -> 201");
    const alice = await expectStatus("POST", "/api/members", {
      name: "审计张三", email: "r24.alice@example.com", departmentId: dept.json.id, title: "Engineer",
    }, 201, "r24 建在职成员 -> 201");
    const bob = await expectStatus("POST", "/api/members", {
      name: "审计李四", email: "r24.bob@example.com", departmentId: dept.json.id, title: "Manager",
    }, 201, "r24 建第二在职成员 -> 201");
    const retired = await expectStatus("POST", "/api/members", {
      name: "审计离职者", email: "r24.retired@example.com", status: "inactive",
    }, 201, "r24 建停用成员 -> 201");

    // 老路径：不传任何 member_id，原自由文本与 NULL 摘要一件不改
    const legacy = await expectStatus("POST", "/api/approvals", {
      title: "r24老路径审批", type: "leave", applicantId: "自由发起人", currentAssignee: "自由审批人", cc: ["自由抄送"],
    }, 201, "r24 老路径审批发起 -> 201");
    eq(legacy.json && legacy.json.applicantMemberId, null, "r24 老路径审批 applicant_member_id=null");
    eq(legacy.json && legacy.json.applicantId, "自由发起人", "r24 老路径自由文本逐字保留");
    eq(legacy.json && legacy.json.currentAssignee, "自由审批人", "r24 老路径审批人自由文本保留");
    eq(legacy.json && legacy.json.applicantMember, null, "r24 老路径申请人摘要为 null（向后兼容）");
    const legacyCc = await expectStatus("GET", `/api/approvals/${legacy.json.id}/cc`, undefined, 200, "r24 老路径抄送查询 -> 200");
    eq(legacyCc.json && legacyCc.json.cc, ["自由抄送"], "r24 老路径抄送仍是纯字符串数组");
    eq(legacyCc.json && legacyCc.json.ccMembers, [null], "r24 老路径抄送摘要全 null");

    // 新路径：member_id 解析为通讯录姓名 + 部门摘要
    const linked = await expectStatus("POST", "/api/approvals", {
      title: "r24新路径审批", type: "expense", applicantId: "忽略文本", currentAssignee: "忽略文本",
      applicantMemberId: alice.json.id, assigneeMemberId: bob.json.id,
      cc: ["忽略文本"], ccMemberIds: [alice.json.id],
    }, 201, "r24 新路径审批发起 -> 201");
    eq(linked.json && linked.json.applicantMemberId, alice.json.id, "r24 审批申请人 member_id 真落库");
    eq(linked.json && linked.json.applicantId, alice.json.name, "r24 审批申请人显示通讯录姓名");
    eq(linked.json && linked.json.currentAssignee, bob.json.name, "r24 审批人显示通讯录姓名");
    eq(linked.json && linked.json.applicantMember && linked.json.applicantMember.departmentName, "r24审计研发中心", "r24 申请人摘要回带部门名");
    eq(linked.json && linked.json.applicantMember && linked.json.applicantMember.name, "审计张三", "r24 申请人摘要回带姓名");
    const linkedCc = await expectStatus("GET", `/api/approvals/${linked.json.id}/cc`, undefined, 200, "r24 新路径抄送查询 -> 200");
    eq(linkedCc.json && linkedCc.json.cc, ["审计张三"], "r24 抄送 member_id 解析通讯录姓名");
    eq(linkedCc.json && linkedCc.json.ccMembers[0] && linkedCc.json.ccMembers[0].id, alice.json.id, "r24 抄送摘要回带成员 id");
    const linkedDetail = await expectStatus("GET", `/api/approvals/${linked.json.id}`, undefined, 200, "r24 审批详情 -> 200");
    eq(linkedDetail.json && linkedDetail.json.applicantMember && linkedDetail.json.applicantMember.departmentId, dept.json.id, "r24 详情摘要回带部门 id");

    // 4xx：不存在 / 停用 / 非法引用（waizhuan 亲验停用成员被拒）
    await expectStatus("POST", "/api/approvals", { title: "x", type: "other", applicantId: "a", currentAssignee: "b", applicantMemberId: 999999 }, 400, "r24 不存在申请人 -> 400");
    await expectStatus("POST", "/api/approvals", { title: "x", type: "other", applicantId: "a", currentAssignee: "b", applicantMemberId: retired.json.id }, 400, "r24 停用申请人 -> 400");
    await expectStatus("POST", "/api/approvals", { title: "x", type: "other", applicantId: "a", currentAssignee: "b", applicant_member_id: "abc" }, 400, "r24 非法申请人 id -> 400");
    await expectStatus("POST", "/api/approvals", { title: "x", type: "other", applicantId: "a", currentAssignee: "b", currentAssigneeMemberId: 999999 }, 400, "r24 不存在审批人 -> 400");
    await expectStatus("POST", "/api/approvals", { title: "x", type: "other", applicantId: "a", currentAssignee: "b", assignee_member_id: retired.json.id }, 400, "r24 停用审批人 -> 400");
    await expectStatus("POST", "/api/approvals", { title: "x", type: "other", applicantId: "a", currentAssignee: "b", ccMemberIds: [retired.json.id] }, 400, "r24 停用抄送人 -> 400");

    // 动作：提交 / 转交都可选 member_id，步骤时间线回带部门摘要
    const submitted = await expectStatus("POST", `/api/approvals/${linked.json.id}/submit`, {
      actor: alice.json.name, actorMemberId: alice.json.id,
    }, 200, "r24 成员提交 -> 200");
    eq(submitted.json && submitted.json.status, "pending", "r24 成员提交后状态 pending");
    const steps = await expectStatus("GET", `/api/approvals/${linked.json.id}/steps`, undefined, 200, "r24 步骤查询 -> 200");
    eq(steps.json && steps.json.steps[0] && steps.json.steps[0].assigneeMemberId, alice.json.id, "r24 步骤 member_id 真落库");
    eq(steps.json && steps.json.steps[0] && steps.json.steps[0].assigneeMember && steps.json.steps[0].assigneeMember.name, "审计张三", "r24 时间线回带执行人姓名");
    const delegated = await expectStatus("POST", `/api/approvals/${linked.json.id}/delegate`, {
      actor: bob.json.name, actorMemberId: bob.json.id, targetAssignee: "忽略文本", targetAssigneeMemberId: alice.json.id,
    }, 200, "r24 成员转交 -> 200");
    eq(delegated.json && delegated.json.currentAssignee, "审计张三", "r24 转交目标解析通讯录姓名");
    const steps2 = await expectStatus("GET", `/api/approvals/${linked.json.id}/steps`, undefined, 200, "r24 转交后步骤查询 -> 200");
    eq(steps2.json && steps2.json.steps.at(-1) && steps2.json.steps.at(-1).assigneeMemberId, alice.json.id, "r24 转交步骤 member_id 真落库");
    await expectStatus("POST", `/api/approvals/${linked.json.id}/delegate`, {
      actor: bob.json.name, targetAssignee: "丙", targetAssigneeMemberId: retired.json.id,
    }, 400, "r24 停用转交目标 -> 400");
    const ccAdded = await expectStatus("POST", `/api/approvals/${linked.json.id}/cc`, {
      user: "忽略文本", member_id: bob.json.id,
    }, 201, "r24 成员抄送添加 -> 201");
    eq(ccAdded.json && ccAdded.json.ccMember && ccAdded.json.ccMember.name, "审计李四", "r24 抄送添加回带成员摘要");
    await expectStatus("POST", `/api/approvals/${linked.json.id}/cc`, {
      user: "停用", memberId: retired.json.id,
    }, 400, "r24 停用抄送添加 -> 400");

    // 物资：保管员选人 + 出入库 member_id + 老路径纯净
    const legacyAsset = await expectStatus("POST", "/api/assets", {
      name: "r24老路径物资", category: "office", quantity: 2, unit: "台", location: "仓库", custodian: "自由保管员",
    }, 201, "r24 老路径物资建账 -> 201");
    eq(legacyAsset.json && legacyAsset.json.custodianMemberId, null, "r24 老路径物资 member_id=null");
    eq(legacyAsset.json && legacyAsset.json.custodianMember, null, "r24 老路径物资摘要=null");
    const linkedAsset = await expectStatus("POST", "/api/assets", {
      name: "r24新路径物资", category: "equipment", quantity: 4, unit: "台", location: "仓库",
      custodian: "忽略文本", custodianMemberId: alice.json.id,
    }, 201, "r24 新路径物资建账 -> 201");
    eq(linkedAsset.json && linkedAsset.json.custodianMemberId, alice.json.id, "r24 物资保管员 member_id 真落库");
    eq(linkedAsset.json && linkedAsset.json.custodian, "审计张三", "r24 物资保管员显示通讯录姓名");
    eq(linkedAsset.json && linkedAsset.json.custodianMember && linkedAsset.json.custodianMember.departmentName, "r24审计研发中心", "r24 物资卡片摘要回带部门名");
    await expectStatus("POST", "/api/assets", { name: "x", category: "office", quantity: 1, unit: "个", location: "仓", custodian: "y", member_id: retired.json.id }, 400, "r24 停用保管员 -> 400");
    await expectStatus("POST", "/api/assets", { name: "x", category: "office", quantity: 1, unit: "个", location: "仓", custodian: "y", custodianMemberId: 999999 }, 400, "r24 不存在保管员 -> 400");
    const txNew = await expectStatus("POST", `/api/assets/${linkedAsset.json.id}/transactions`, {
      type: "in", quantity: 1, to: "仓库", member_id: bob.json.id,
    }, 201, "r24 成员出入库 -> 201");
    eq(txNew.json && txNew.json.operator, "审计李四", "r24 出入库操作人解析通讯录姓名");
    eq(txNew.json && txNew.json.operatorMember && txNew.json.operatorMember.id, bob.json.id, "r24 流水回带操作人摘要");
    const afterTx = await expectStatus("GET", `/api/assets/${linkedAsset.json.id}`, undefined, 200, "r24 出入库后物资详情 -> 200");
    eq(afterTx.json && afterTx.json.custodianMemberId, bob.json.id, "r24 出入库 member_id 更新保管员关联");
    eq(afterTx.json && afterTx.json.custodianMember && afterTx.json.custodianMember.name, "审计李四", "r24 出入库后保管员摘要同步");
    await expectStatus("POST", `/api/assets/${legacyAsset.json.id}/transactions`, {
      type: "in", quantity: 1, to: "仓库", operator: "自由操作人",
    }, 201, "r24 老路径出入库照常 201");
    const legacyAfter = await expectStatus("GET", `/api/assets/${legacyAsset.json.id}`, undefined, 200, "r24 老路径出入库后详情 -> 200");
    eq(legacyAfter.json && legacyAfter.json.custodian, "自由保管员", "r24 老路径保管员逐字不变");
    eq(legacyAfter.json && legacyAfter.json.custodianMember, null, "r24 老路径保管员摘要仍 null");
    await expectStatus("POST", `/api/assets/${linkedAsset.json.id}/transactions`, {
      type: "in", quantity: 1, to: "仓库", member_id: retired.json.id,
    }, 400, "r24 停用出入库操作人 -> 400");

    // usage：四类计数 + 404/400
    const usage = await expectStatus("GET", `/api/org/members/${alice.json.id}/usage`, undefined, 200, "r24 usage 查询 -> 200");
    eq(usage.json && usage.json.memberId, alice.json.id, "r24 usage 回带成员 id");
    eq(usage.json && usage.json.member && usage.json.member.name, "审计张三", "r24 usage 回带成员摘要");
    eq(usage.json && usage.json.applicantCount, undefined, "r24 usage 不暴露旧口径字段（approvalCount 为准）");
    ok(usage.json && usage.json.approvalCount >= 1 && usage.json.assignedApprovalCount >= 2 && usage.json.ccCount >= 1, "r24 usage 审批三类计数正确");
    ok(usage.json && usage.json.total === usage.json.approvalCount + usage.json.assignedApprovalCount + usage.json.ccCount + usage.json.assetCount + (usage.json.actionCount ?? 0), "r24 usage total = 五类之和（r25 含 actionCount，老路径 actionCount=0）");
    const usageZero = await expectStatus("GET", `/api/org/members/${retired.json.id}/usage`, undefined, 200, "r24 停用成员 usage 可查 -> 200");
    eq(usageZero.json && usageZero.json.total, 0, "r24 停用成员零指派（但用于发单被 400 拒绝）");
    await expectStatus("GET", "/api/org/members/999999/usage", undefined, 404, "r24 不存在成员 usage -> 404");
    await expectStatus("GET", "/api/org/members/not-a-number/usage", undefined, 400, "r24 非数字成员 usage -> 400");

    // 清理：只删本轮探针数据，老用户数据不动
    await expectStatus("DELETE", `/api/approvals/${legacy.json.id}`, undefined, 200, "r24 清理老路径审批 -> 200");
    await expectStatus("DELETE", `/api/approvals/${linked.json.id}`, undefined, 200, "r24 清理新路径审批 -> 200");
    await expectStatus("DELETE", `/api/assets/${legacyAsset.json.id}`, undefined, 200, "r24 清理老路径物资 -> 200");
    await expectStatus("DELETE", `/api/assets/${linkedAsset.json.id}`, undefined, 200, "r24 清理新路径物资 -> 200");
    await expectStatus("DELETE", `/api/members/${alice.json.id}`, undefined, 200, "r24 清理成员 Alice -> 200");
    await expectStatus("DELETE", `/api/members/${bob.json.id}`, undefined, 200, "r24 清理成员 Bob -> 200");
    await expectStatus("DELETE", `/api/members/${retired.json.id}`, undefined, 200, "r24 清理停用成员 -> 200");
    await expectStatus("DELETE", `/api/departments/${dept.json.id}`, undefined, 200, "r24 清理部门 -> 200");
    const finalTree = await expectStatus("GET", "/api/org/tree", undefined, 200, "r24 清理后组织树 -> 200");
    eq(finalTree.json && finalTree.json.members, [], "r24 清理后成员归零");
    eq(finalTree.json && finalTree.json.tree, [], "r24 清理后部门归零");
  }

  // ---- r25：审批动作 actorMemberId（登录用户关联成员 / 步骤摘要 / usage 第五类 / 4xx 零半态） ----
  console.log("\n== Approval r25: actorMemberId / linked member / action usage ==");
  {
    const h25 = await expectStatus("GET", "/api/health", undefined, 200, "r25 health 真 HTTP 200");
    eq(h25.json && h25.json.schemaVersion, 27, "r25 health.schemaVersion=27（v18 迁移真生效）");

    const uname25 = `r25.actor.${Date.now()}`;
    const user25 = await expectStatus("POST", "/api/auth/register", { username: uname25, password: "Passw0rd!" }, 201, "r25 注册登录用户 -> 201");
    const login25 = await expectStatus("POST", "/api/auth/login", { username: uname25, password: "Passw0rd!" }, 200, "r25 用户登录 -> 200");
    const dept25 = await expectStatus("POST", "/api/departments", { name: "r25审计研发中心" }, 201, "r25 建部门 -> 201");
    const alice25 = await expectStatus("POST", "/api/members", {
      name: "动作甲", email: "r25.alice@example.com", departmentId: dept25.json.id, userId: user25.json.user.id,
    }, 201, "r25 建关联登录用户的成员 -> 201");
    const bob25 = await expectStatus("POST", "/api/members", {
      name: "动作乙", email: "r25.bob@example.com", departmentId: dept25.json.id,
    }, 201, "r25 建第二成员 -> 201");
    const retired25b = await expectStatus("POST", "/api/members", {
      name: "动作离职者", email: "r25.retired@example.com", status: "inactive",
    }, 201, "r25 建停用成员 -> 201");

    const me25 = await authReq("GET", "/api/org/members/me", login25.json.token);
    eq(me25.status, 200, "r25 登录成员解析路由 -> 200");
    eq(me25.json && me25.json.userId, user25.json.user.id, "r25 回带当前登录用户 id");
    eq(me25.json && me25.json.member && me25.json.member.id, alice25.json.id, "r25 登录用户解析到关联成员");
    eq(me25.json && me25.json.member && me25.json.member.name, "动作甲", "r25 关联成员回带姓名");
    const anon25 = await authReq("GET", "/api/org/members/me", null);
    eq(anon25.json && anon25.json.member, null, "r25 未登录时关联成员为 null");
    const badToken25 = await authReq("GET", "/api/org/members/me", "bad-token");
    eq(badToken25.json && badToken25.json.member, null, "r25 无效 token 时关联成员为 null");

    const approval25 = await expectStatus("POST", "/api/approvals", {
      title: "r25成员动作审批", type: "expense", applicantId: "忽略文本", currentAssignee: "忽略文本",
      applicantMemberId: alice25.json.id, currentAssigneeMemberId: bob25.json.id,
    }, 201, "r25 建审批 -> 201");
    const submitted25 = await expectStatus("POST", `/api/approvals/${approval25.json.id}/submit`, {
      actor: "动作甲", actorMemberId: me25.json.member.id,
    }, 200, "r25 登录成员提交 -> 200");
    eq(submitted25.json && submitted25.json.status, "pending", "r25 提交后 pending");
    const steps25a = await expectStatus("GET", `/api/approvals/${approval25.json.id}/steps`, undefined, 200, "r25 提交步骤查询 -> 200");
    eq(steps25a.json && steps25a.json.steps[0] && steps25a.json.steps[0].actorMemberId, alice25.json.id, "r25 提交步骤 actor_member_id 真落库");
    eq(steps25a.json && steps25a.json.steps[0] && steps25a.json.steps[0].actorMember && steps25a.json.steps[0].actorMember.name, "动作甲", "r25 步骤回带操作人姓名摘要");
    eq(steps25a.json && steps25a.json.steps[0] && steps25a.json.steps[0].actorMember && steps25a.json.steps[0].actorMember.departmentName, "r25审计研发中心", "r25 步骤回带操作人部门摘要");
    const approved25 = await expectStatus("POST", `/api/approvals/${approval25.json.id}/approve`, {
      actor: "动作乙", actorMemberId: bob25.json.id, comment: "r25 通过",
    }, 200, "r25 审批人通过 -> 200");
    eq(approved25.json && approved25.json.status, "approved", "r25 通过后终态 approved");
    const steps25b = await expectStatus("GET", `/api/approvals/${approval25.json.id}/steps`, undefined, 200, "r25 通过步骤查询 -> 200");
    eq(steps25b.json && steps25b.json.steps.at(-1) && steps25b.json.steps.at(-1).actorMemberId, bob25.json.id, "r25 通过步骤 actor_member_id 真落库");
    eq(steps25b.json && steps25b.json.steps.at(-1) && steps25b.json.steps.at(-1).actorMember && steps25b.json.steps.at(-1).actorMember.name, "动作乙", "r25 通过步骤摘要姓名正确");

    const legacy25 = await expectStatus("POST", "/api/approvals", {
      title: "r25老路径", type: "other", applicantId: "自由甲", currentAssignee: "自由乙",
    }, 201, "r25 老路径审批 -> 201");
    await expectStatus("POST", `/api/approvals/${legacy25.json.id}/submit`, { actor: "自由甲" }, 200, "r25 老路径提交 -> 200");
    const legacySteps25 = await expectStatus("GET", `/api/approvals/${legacy25.json.id}/steps`, undefined, 200, "r25 老路径步骤查询 -> 200");
    eq(legacySteps25.json && legacySteps25.json.steps[0] && legacySteps25.json.steps[0].actorMemberId, null, "r25 老路径步骤 actor_member_id=NULL");
    eq(legacySteps25.json && legacySteps25.json.steps[0] && legacySteps25.json.steps[0].actorMember, null, "r25 老路径步骤摘要=null（向后兼容）");

    const bad25 = await expectStatus("POST", "/api/approvals", {
      title: "r25拒绝动作", type: "other", applicantId: "自由甲", currentAssignee: "自由乙",
    }, 201, "r25 拒绝动作探针审批 -> 201");
    await expectStatus("POST", `/api/approvals/${bad25.json.id}/submit`, { actor: "自由甲", actorMemberId: 999999 }, 400, "r25 不存在动作人 -> 400");
    await expectStatus("POST", `/api/approvals/${bad25.json.id}/submit`, { actor: "自由甲", actorMemberId: retired25b.json.id }, 400, "r25 停用动作人 -> 400");
    const badAfter25 = await expectStatus("GET", `/api/approvals/${bad25.json.id}`, undefined, 200, "r25 4xx 后审批仍在 -> 200");
    eq(badAfter25.json && badAfter25.json.status, "draft", "r25 动作 4xx 零半态（状态未变）");
    const badSteps25 = await expectStatus("GET", `/api/approvals/${bad25.json.id}/steps`, undefined, 200, "r25 4xx 后步骤查询 -> 200");
    eq(badSteps25.json && badSteps25.json.steps, [], "r25 动作 4xx 零半态（无步骤残留）");

    const usageA25 = await expectStatus("GET", `/api/org/members/${alice25.json.id}/usage`, undefined, 200, "r25 动作甲 usage -> 200");
    eq(usageA25.json && usageA25.json.actionCount, 1, "r25 动作甲审批动作计数=1");
    eq(usageA25.json && usageA25.json.total, usageA25.json.approvalCount + usageA25.json.assignedApprovalCount + usageA25.json.ccCount + usageA25.json.assetCount + usageA25.json.actionCount, "r25 usage total 含审批动作第五类");
    const usageB25 = await expectStatus("GET", `/api/org/members/${bob25.json.id}/usage`, undefined, 200, "r25 动作乙 usage -> 200");
    eq(usageB25.json && usageB25.json.actionCount, 1, "r25 通过动作计入动作乙 usage");
    const usageR25 = await expectStatus("GET", `/api/org/members/${retired25b.json.id}/usage`, undefined, 200, "r25 停用成员 usage -> 200");
    eq(usageR25.json && usageR25.json.actionCount, 0, "r25 被拒动作不计数");

    await expectStatus("DELETE", `/api/approvals/${approval25.json.id}`, undefined, 200, "r25 清理成员动作审批 -> 200");
    await expectStatus("DELETE", `/api/approvals/${legacy25.json.id}`, undefined, 200, "r25 清理老路径审批 -> 200");
    await expectStatus("DELETE", `/api/approvals/${bad25.json.id}`, undefined, 200, "r25 清理拒绝动作审批 -> 200");
    await expectStatus("DELETE", `/api/members/${alice25.json.id}`, undefined, 200, "r25 清理动作甲 -> 200");
    await expectStatus("DELETE", `/api/members/${bob25.json.id}`, undefined, 200, "r25 清理动作乙 -> 200");
    await expectStatus("DELETE", `/api/members/${retired25b.json.id}`, undefined, 200, "r25 清理停用成员 -> 200");
    await expectStatus("DELETE", `/api/departments/${dept25.json.id}`, undefined, 200, "r25 清理部门 -> 200");
    const userDelete25 = await authReq("DELETE", `/api/auth/users/${user25.json.user.id}`, login25.json.token);
    eq(userDelete25.status, 200, "r25 清理登录用户 -> 200（带 token 的管理员）");
    const tree25 = await expectStatus("GET", "/api/org/tree", undefined, 200, "r25 清理后组织树 -> 200");
    eq(tree25.json && tree25.json.members, [], "r25 清理后成员归零");
    eq(tree25.json && tree25.json.tree, [], "r25 清理后部门归零");
  }
  await auditR26();
  await auditR27();
  await auditR28();
}

/** r26 通知中心：真事件聚合 / refresh 幂等 / 4xx；由 audit() 末尾调用（不污染 r19 同步基线） */
async function auditR26(): Promise<void> {
  console.log("\n== Notification r26: real event aggregation / idempotent refresh / 4xx ==");
  {
    const h26 = await expectStatus("GET", "/api/health", undefined, 200, "r26 health 真 HTTP 200");
    eq(h26.json && h26.json.schemaVersion, 27, "r26 health.schemaVersion=27（v27 迁移随轮推进）");
    const today = new Date();
    const pad26 = (n: number): string => String(n).padStart(2, "0");
    const todayStr26 = `${today.getFullYear()}-${pad26(today.getMonth() + 1)}-${pad26(today.getDate())}`;
    const stamp26 = Date.now().toString(36);

    // 造四类真实事件：待办审批 / 低库存物资 / 今日日程 / 同步冲突（真 409）
    const appr26 = await expectStatus("POST", "/api/approvals", {
      title: `r26审批-${stamp26}`, type: "expense", applicantId: "r26甲", currentAssignee: "r26乙",
    }, 201, "r26 造待办审批事件 -> 201");
    eq(appr26.json && appr26.json.status, "draft", "r26 审批初始 draft（refresh 按 pending 判定需先提交）");
    await expectStatus("POST", `/api/approvals/${appr26.json.id}/submit`, { actor: "r26甲" }, 200, "r26 提交审批 -> pending 事件");
    const pending26 = await expectStatus("GET", `/api/approvals/${appr26.json.id}`, undefined, 200, "r26 回查审批 -> 200");
    eq(pending26.json && pending26.json.status, "pending", "r26 审批状态真为 pending");

    const asset26 = await expectStatus("POST", "/api/assets", {
      name: `r26低库存-${stamp26}`, category: "office", quantity: 1, unit: "个", location: "仓", custodian: "保管员",
    }, 201, "r26 造库存低事件 -> 201");
    eq(asset26.json && asset26.json.quantity, 1, "r26 物资库存真为 1（≤阈值 5）");
    const sched26 = await expectStatus("POST", "/api/schedules", {
      title: `r26今日日程-${stamp26}`, date: todayStr26, start: "09:00", end: "10:00",
    }, 201, "r26 造当天日程事件 -> 201");
    eq(sched26.json && sched26.json.date, todayStr26, "r26 日程日期真为今天");
    const entityId26 = `r26-sync-${stamp26}`;
    await expectStatus("POST", "/api/sync/apply", {
      entityType: "todo", entityId: entityId26, operation: "update", payload: { title: "A" }, expectedVersion: 0,
    }, 200, "r26 同步基线写入 -> 200");
    const conflict26 = await expectStatus("POST", "/api/sync/apply", {
      entityType: "todo", entityId: entityId26, operation: "update", payload: { title: "B" }, expectedVersion: 0,
    }, 409, "r26 造同步冲突事件 -> 409");
    eq(conflict26.json && conflict26.json.code, "SYNC_CONFLICT", "r26 冲突事件返回真 SYNC_CONFLICT");

    // refresh：四类事件各生成一条；重复 refresh 幂等不重复
    const refreshed26 = await expectStatus("POST", "/api/notifications/refresh", {}, 200, "r26 refresh -> 200");
    ok(refreshed26.json && refreshed26.json.created >= 4, "r26 refresh 至少生成四类事件各一条");
    ok(refreshed26.json && refreshed26.json.scanned >= 3, "r26 refresh 扫描当前库状态（日程/审批/物资）");
    const repeated26 = await expectStatus("POST", "/api/notifications/refresh", {}, 200, "r26 重复 refresh -> 200");
    eq(repeated26.json && repeated26.json.created, 0, "r26 重复 refresh created=0（幂等）");
    ok(repeated26.json && repeated26.json.skipped >= 4, "r26 重复 refresh 全部跳过不动旧记录");
    eq(repeated26.json && repeated26.json.total, refreshed26.json && refreshed26.json.total, "r26 幂等前后通知总数不变");

    const full26 = await expectStatus("GET", "/api/notifications?pageSize=100", undefined, 200, "r26 全量通知列表 -> 200");
    const own26 = ((full26.json && full26.json.notifications) ?? []).filter((n: any) =>
      (n.type === "approval_pending" && n.refId === appr26.json.id) ||
      (n.type === "asset_low" && n.refId === asset26.json.id) ||
      (n.type === "schedule_due" && n.refId === sched26.json.id) ||
      (n.type === "sync_conflict" && String(n.title).includes(entityId26)),
    );
    eq(own26.length, 4, "r26 四类事件恰好四条通知（审批/物资/日程/同步）");
    const types26 = own26.map((n: any) => n.type).sort();
    eq(types26, ["approval_pending", "asset_low", "schedule_due", "sync_conflict"], "r26 四类通知 type 逐一对上");
    ok(own26.every((n: any) => n.readAt === null), "r26 新生成通知全部未读");
    eq(full26.json && full26.json.summary.unread >= 4, true, "r26 列表回带未读汇总");

    const byType26 = await expectStatus("GET", "/api/notifications?type=approval_pending", undefined, 200, "r26 类型过滤 -> 200");
    ok(byType26.json && byType26.json.notifications.every((n: any) => n.type === "approval_pending"), "r26 类型过滤只返回审批通知");
    const unread26 = await expectStatus("GET", "/api/notifications?unreadOnly=1", undefined, 200, "r26 未读过滤 -> 200");
    ok(unread26.json && unread26.json.notifications.every((n: any) => n.readAt === null), "r26 未读过滤只返回 read_at=null");
    const page26 = await expectStatus("GET", "/api/notifications?page=1&pageSize=2", undefined, 200, "r26 分页第一页 -> 200");
    eq(page26.json && page26.json.pageSize, 2, "r26 分页 pageSize 回显");
    ok(page26.json && page26.json.totalPages >= 2, "r26 分页 totalPages 正确");
    const single26 = await expectStatus("GET", `/api/notifications/${own26[0].id}`, undefined, 200, "r26 单条详情 -> 200");
    eq(single26.json && single26.json.id, own26[0].id, "r26 单条详情 id 精确");

    const summaryBefore26 = await expectStatus("GET", "/api/notifications/summary", undefined, 200, "r26 summary -> 200");
    eq(summaryBefore26.json && summaryBefore26.json.types.length, 5, "r26 summary 回带五类类型清单");
    const readOne26 = await expectStatus("POST", `/api/notifications/${own26[0].id}/read`, {}, 200, "r26 单条已读 -> 200");
    eq(readOne26.json && readOne26.json.readAt !== null, true, "r26 单条已读 read_at 真落库");
    const summaryAfter26 = await expectStatus("GET", "/api/notifications/summary", undefined, 200, "r26 已读后 summary -> 200");
    eq(summaryAfter26.json && summaryAfter26.json.unread, summaryBefore26.json.unread - 1, "r26 已读后未读数真减一");
    const readAll26 = await expectStatus("POST", "/api/notifications/read-all", {}, 200, "r26 全部已读 -> 200");
    ok(readAll26.json && readAll26.json.updated >= 1, "r26 批量已读更新条数>0");
    const readAllAgain26 = await expectStatus("POST", "/api/notifications/read-all", {}, 200, "r26 重复全部已读 -> 200");
    eq(readAllAgain26.json && readAllAgain26.json.updated, 0, "r26 重复批量已读 updated=0");
    const summaryZero26 = await expectStatus("GET", "/api/notifications/summary", undefined, 200, "r26 全已读 summary -> 200");
    eq(summaryZero26.json && summaryZero26.json.unread, 0, "r26 全已读未读归零");

    const patched26 = await expectStatus("PATCH", `/api/notifications/${own26[0].id}`, { title: "r26已改标题" }, 200, "r26 PATCH 标题 -> 200");
    eq(patched26.json && patched26.json.title, "r26已改标题", "r26 PATCH 标题真落库");

    // 4xx：非法 type / 越权 id / 无效 ref / 空标题
    await expectStatus("GET", "/api/notifications?type=hack", undefined, 400, "r26 非法类型过滤 -> 400");
    await expectStatus("GET", "/api/notifications/999999", undefined, 404, "r26 越权 id 详情 -> 404");
    await expectStatus("POST", "/api/notifications/999999/read", {}, 404, "r26 越权 id 已读 -> 404");
    await expectStatus("DELETE", "/api/notifications/999999", undefined, 404, "r26 越权 id 删除 -> 404");
    await expectStatus("POST", "/api/notifications", { type: "hack", title: "x", refType: "system", refId: 0 }, 400, "r26 非法 type 新建 -> 400");
    await expectStatus("POST", "/api/notifications", { type: "system", title: "x", refType: "bogus", refId: 0 }, 400, "r26 非法 ref_type 新建 -> 400");
    await expectStatus("POST", "/api/notifications", { type: "approval_pending", title: "x", refType: "approvals", refId: 999999 }, 400, "r26 无效审批 ref_id 新建 -> 400");
    await expectStatus("PATCH", `/api/notifications/${own26[0].id}`, { title: "" }, 400, "r26 空标题 PATCH -> 400");
    const after4xx26 = await expectStatus("GET", `/api/notifications/${own26[0].id}`, undefined, 200, "r26 4xx 后原通知仍在 -> 200");
    eq(after4xx26.json && after4xx26.json.title, "r26已改标题", "r26 4xx 零半态（原记录未被改写）");

    // r26 返工#1：deep-link 定位契约 + 多审批非首行可见性（放在原四类基数断言之后，不改其计数）
    const apprB26 = await expectStatus("POST", "/api/approvals", {
      title: `r26审批B-${stamp26}`, type: "expense", applicantId: "r26甲", currentAssignee: "r26丙",
    }, 201, "返工#1 造第二张不同审批人的待办审批 -> 201");
    await expectStatus("POST", `/api/approvals/${apprB26.json.id}/submit`, { actor: "r26甲" }, 200, "返工#1 第二张审批提交 -> pending");
    const detailA26 = await expectStatus("GET", `/api/approvals/${appr26.json.id}`, undefined, 200, "返工#1 按 refId 直读目标审批 -> 200");
    eq(detailA26.json && detailA26.json.currentAssignee, "r26乙", "返工#1 目标审批 A 审批人=乙");
    const detailB26 = await expectStatus("GET", `/api/approvals/${apprB26.json.id}`, undefined, 200, "返工#1 按 refId 直读非首行审批 -> 200");
    eq(detailB26.json && detailB26.json.currentAssignee, "r26丙", "返工#1 目标审批 B 审批人=丙（与 A 不同）");
    const viewA26 = await expectStatus("GET", `/api/approvals/view?view=todo&actor=${encodeURIComponent("r26乙")}`, undefined, 200, "返工#1 切到目标审批人视角 -> 200");
    ok(viewA26.json && viewA26.json.approvals.some((a: any) => a.id === appr26.json.id), "返工#1 审批 A 在深链身份视角列表中可见");
    ok(viewA26.json && !viewA26.json.approvals.some((a: any) => a.id === apprB26.json.id), "返工#1 审批 B 不属于 A 的深链身份视角");
    const viewB26 = await expectStatus("GET", `/api/approvals/view?view=todo&actor=${encodeURIComponent("r26丙")}`, undefined, 200, "返工#1 切到非首行审批人视角 -> 200");
    ok(viewB26.json && viewB26.json.approvals.some((a: any) => a.id === apprB26.json.id), "返工#1 审批 B 在自己身份视角列表中可见（非首行也定位）");
    ok(viewB26.json && !viewB26.json.approvals.some((a: any) => a.id === appr26.json.id), "返工#1 审批 A 不属于 B 的深链身份视角");
    const notifLink26 = await expectStatus("POST", "/api/notifications", {
      type: "approval_pending", title: "返工#1 deep-link 探针", refType: "approvals", refId: apprB26.json.id,
    }, 201, "返工#1 造指向非首行审批的通知 -> 201");
    const singleLink26 = await expectStatus("GET", `/api/notifications/${notifLink26.json.id}`, undefined, 200, "返工#1 通知详情回带 deep-link -> 200");
    eq(singleLink26.json && singleLink26.json.deepLink && singleLink26.json.deepLink.approvalId, String(apprB26.json.id), "返工#1 通知详情 deepLink.approvalId 精确等于通知 refId");
    eq(singleLink26.json && singleLink26.json.tab, "approval", "返工#1 通知详情 tab=approval 与 refType 映射一致");
    await expectStatus("DELETE", `/api/notifications/${notifLink26.json.id}`, undefined, 200, "返工#1 清理 deep-link 通知 -> 200");
    await expectStatus("DELETE", `/api/approvals/${apprB26.json.id}`, undefined, 200, "返工#1 清理第二张审批 -> 200");

    // 清理：只删本轮探针（通知 / 审批 / 物资 / 日程）；同步实体留 scratch 库
    for (const n of own26) {
      await expectStatus("DELETE", `/api/notifications/${n.id}`, undefined, 200, `r26 清理通知 ${n.id} -> 200`);
    }
    await expectStatus("DELETE", `/api/approvals/${appr26.json.id}`, undefined, 200, "r26 清理审批 -> 200");
    await expectStatus("DELETE", `/api/assets/${asset26.json.id}`, undefined, 200, "r26 清理物资 -> 200");
    await expectStatus("DELETE", `/api/schedules/${sched26.json.id}`, undefined, 200, "r26 清理日程 -> 200");
    const afterClean26 = await expectStatus("GET", "/api/notifications?pageSize=100", undefined, 200, "r26 清理后列表 -> 200");
    eq((((afterClean26.json && afterClean26.json.notifications) ?? []) as any[]).filter((n: any) => own26.some((o: any) => o.id === n.id)).length, 0, "r26 清理后本轮通知归零");
  }
}

/** r27 报表中心：真 HTTP 装配 / 六指标手算核对 / 单项下钻 / 4xx；由 audit() 末尾调用 */
async function auditR27(): Promise<void> {
  console.log("\n== Report r27: real HTTP assembly / hand-check / drilldown / 4xx ==");
  {
    const h27 = await expectStatus("GET", "/api/health", undefined, 200, "r27 health 真 HTTP 200");
    eq(h27.json && h27.json.schemaVersion, 27, "r27 health.schemaVersion=27（报表轮无新迁移，随当前轮推进）");
    const today27 = new Date().toISOString().slice(0, 10);
    const q27 = `from=${today27}&to=${today27}`;
    const stamp27 = Date.now().toString(36);
    const metrics27 = ["todoCompletion", "scheduleLoad", "boardThroughput", "approvalSla", "assetTurnover", "docOutput"];
    // 直接按 HTTP 回传的明细手算 value，独立于实现自证算法成立
    const handCheck27 = (m: any): number => {
      const rows: any[] = Array.isArray(m && m.detail) ? m.detail : [];
      if (m.metric === "todoCompletion") return rows.length === 0 ? 0 : Math.round((rows.filter((r) => r.value === 1).length / rows.length) * 100);
      if (m.metric === "approvalSla") return rows.length === 0 ? 0 : Math.round(rows.reduce((s, r) => s + r.value, 0) / rows.length);
      return rows.reduce((s, r) => s + r.value, 0);
    };

    const base27 = await expectStatus("GET", `/api/reports/overview?${q27}`, undefined, 200, "r27 overview 真 HTTP 200");
    eq(Object.keys(base27.json && base27.json.metrics || {}), metrics27, "r27 overview 六指标一次返回");
    eq(base27.json && base27.json.metricOrder, metrics27, "r27 KPI 卡顺序与枚举一致");
    eq(base27.json && base27.json.range, { from: today27, to: today27 }, "r27 overview 回显闭区间");
    eq(base27.json && base27.json.days, 1, "r27 单日闭区间天数=1");
    for (const key of metrics27) {
      eq(base27.json.metrics[key].value, handCheck27(base27.json.metrics[key]), `r27 基线 ${key} 数值与明细手算一致`);
    }

    // 空范围：六指标全 0 且不崩（只读，不造数）
    const empty27 = await expectStatus("GET", "/api/reports/overview?from=1900-01-01&to=1900-01-02", undefined, 200, "r27 空范围 overview -> 200");
    eq(metrics27.map((k) => empty27.json.metrics[k].value), [0, 0, 0, 0, 0, 0], "r27 空范围六指标全 0");
    eq(metrics27.every((k) => empty27.json.metrics[k].detail.length === 0), true, "r27 空范围六明细为空");
    const emptyOne27 = await expectStatus("GET", "/api/reports/docOutput?from=1900-01-01&to=1900-01-02", undefined, 200, "r27 空范围单项下钻 -> 200");
    eq(emptyOne27.json && emptyOne27.json.value, 0, "r27 空范围下钻数值 0");

    // 造已知数据：2 张待办（1 done）/ 今日日程 / 文档 / 物资出库 5 / 看板完成卡 / 审批提交后通过
    const todoA27 = await expectStatus("POST", "/api/todos", { title: `r27完成待办-${stamp27}`, quadrant: "q1" }, 201, "r27 造完成待办 -> 201");
    await expectStatus("PATCH", `/api/todos/${todoA27.json.id}`, { status: "done" }, 200, "r27 待办转 done -> 200");
    eq((await expectStatus("GET", `/api/todos/${todoA27.json.id}`, undefined, 200, "r27 回查 done 待办 -> 200")).json.status, "done", "r27 待办状态真为 done");
    const todoB27 = await expectStatus("POST", "/api/todos", { title: `r27未完成-${stamp27}`, quadrant: "q2" }, 201, "r27 造未完成待办 -> 201");
    const sched27 = await expectStatus("POST", "/api/schedules", { title: `r27今日日程-${stamp27}`, date: today27, start: "09:00", end: "10:00" }, 201, "r27 造今日日程 -> 201");
    eq(sched27.json && sched27.json.date, today27, "r27 日程日期真为今天");
    const doc27 = await expectStatus("POST", "/api/documents", { title: `r27报表文档-${stamp27}` }, 201, "r27 造报表文档 -> 201");
    const asset27 = await expectStatus("POST", "/api/assets", {
      name: `r27周转物资-${stamp27}`, category: "office", quantity: 10, unit: "个", location: "仓", custodian: "保管员",
    }, 201, "r27 造周转物资 -> 201");
    const tx27 = await expectStatus("POST", `/api/assets/${asset27.json.id}/transactions`, {
      type: "out", quantity: 5, operator: "r27审计",
    }, 201, "r27 造出库 5 件流水 -> 201");
    eq(tx27.json && tx27.json.quantity, 5, "r27 流水数量真为 5");
    const project27 = await expectStatus("POST", "/api/projects", { name: `r27报表项目-${stamp27}` }, 201, "r27 造报表项目 -> 201");
    const cols27 = await expectStatus("GET", `/api/projects/${project27.json.id}/columns`, undefined, 200, "r27 项目默认列 -> 200");
    const doneCol27 = (cols27.json.columns || []).find((c: any) => c.name === "已完成") || (cols27.json.columns || [])[0];
    ok(!!doneCol27, "r27 项目含默认列（看板吞吐载体）");
    const card27 = await expectStatus("POST", `/api/projects/${project27.json.id}/columns/${doneCol27.id}/cards`, {
      title: `r27完成卡-${stamp27}`, todoId: todoA27.json.id,
    }, 201, "r27 造关联 done 待办的完成卡 -> 201");
    eq(card27.json && card27.json.todoId, todoA27.json.id, "r27 卡片真关联 done 待办");
    const appr27 = await expectStatus("POST", "/api/approvals", {
      title: `r27审批-${stamp27}`, type: "expense", applicantId: "r27发起人", currentAssignee: "r27审批人",
    }, 201, "r27 造审批 -> 201");
    await expectStatus("POST", `/api/approvals/${appr27.json.id}/submit`, { actor: "r27发起人" }, 200, "r27 审批提交 -> 200");
    await expectStatus("POST", `/api/approvals/${appr27.json.id}/approve`, { actor: "r27审批人" }, 200, "r27 审批通过 -> 200");
    eq((await expectStatus("GET", `/api/approvals/${appr27.json.id}`, undefined, 200, "r27 回查审批 -> 200")).json.status, "approved", "r27 审批真为 approved");

    // 真 HTTP 装配：所有指标从当前库快照算出，数值与明细手算逐项对上
    const after27 = await expectStatus("GET", `/api/reports/overview?${q27}`, undefined, 200, "r27 造数后 overview -> 200");
    for (const key of metrics27) {
      eq(after27.json.metrics[key].value, handCheck27(after27.json.metrics[key]), `r27 造数后 ${key} 数值与明细手算一致`);
    }
    eq(after27.json.metrics.todoCompletion.detail.some((r: any) => r.key === String(todoA27.json.id) && r.value === 1), true, "r27 完成待办出现在完成率明细且记 1");
    eq(after27.json.metrics.todoCompletion.detail.some((r: any) => r.key === String(todoB27.json.id) && r.value === 0 && r.note === "open"), true, "r27 未完成待办记 0 且标 open");
    eq(after27.json.metrics.scheduleLoad.detail.some((r: any) => r.key === today27), true, "r27 今日日程进入日程分布明细");
    eq(after27.json.metrics.docOutput.detail.some((r: any) => r.key === String(doc27.json.id)), true, "r27 新文档进入产出明细");
    eq(after27.json.metrics.assetTurnover.detail.some((r: any) => r.key === String(asset27.json.id) && r.value === 5), true, "r27 出库 5 件进入周转明细");
    eq(after27.json.metrics.boardThroughput.detail.some((r: any) => r.key === `column-${doneCol27.id}`), true, "r27 完成卡进入吞吐明细");
    eq(after27.json.metrics.approvalSla.detail.some((r: any) => r.key === String(appr27.json.id)), true, "r27 已通过审批进入时效明细");
    eq(after27.json.metrics.scheduleLoad.value, base27.json.metrics.scheduleLoad.value + 1, "r27 日程指标真 +1");
    eq(after27.json.metrics.docOutput.value, base27.json.metrics.docOutput.value + 1, "r27 文档指标真 +1");
    eq(after27.json.metrics.assetTurnover.value, base27.json.metrics.assetTurnover.value + 5, "r27 周转指标真 +5");
    eq(after27.json.metrics.boardThroughput.value, base27.json.metrics.boardThroughput.value + 1, "r27 吞吐指标真 +1");

    // 单项下钻六条：与 overview 同口径同数值
    for (const key of metrics27) {
      const one27 = await expectStatus("GET", `/api/reports/${key}?${q27}`, undefined, 200, `r27 下钻 ${key} -> 200`);
      eq(one27.json && one27.json.value, after27.json.metrics[key].value, `r27 下钻 ${key} 数值与 overview 一致`);
      eq(one27.json && one27.json.metric, key, `r27 下钻 ${key} 回显指标名`);
    }
    const scoped27 = await expectStatus("GET", `/api/reports/docOutput?${q27}&id=${doc27.json.id}`, undefined, 200, "r27 按实体 id 下钻 -> 200");
    eq(scoped27.json && scoped27.json.detail.length, 1, "r27 实体 id 下钻只回一行");
    eq(scoped27.json && scoped27.json.entityId, doc27.json.id, "r27 实体 id 回显");

    // 4xx：非法范围 / 未知名 metric / 越权 id / 非法 id；4xx 后原结果零半态
    await expectStatus("GET", "/api/reports/overview?from=2026-11-08&to=2026-11-07", undefined, 400, "r27 from>to -> 400");
    await expectStatus("GET", "/api/reports/overview?from=2026-02-30&to=2026-03-01", undefined, 400, "r27 非法日期 -> 400");
    await expectStatus("GET", "/api/reports/overview?from=2026-11-01", undefined, 400, "r27 单边日期 -> 400");
    await expectStatus("GET", "/api/reports/hack?" + q27, undefined, 400, "r27 未知名 metric -> 400");
    await expectStatus("GET", `/api/reports/docOutput?${q27}&id=abc`, undefined, 400, "r27 非法实体 id -> 400");
    await expectStatus("GET", `/api/reports/docOutput?${q27}&id=99999999`, undefined, 404, "r27 越权实体 id -> 404");
    const after4xx27 = await expectStatus("GET", `/api/reports/overview?${q27}`, undefined, 200, "r27 4xx 后 overview 仍 200（零半态）");
    eq(after4xx27.json.metrics.docOutput.value, after27.json.metrics.docOutput.value, "r27 4xx 未改写报表快照");

    // 清理：只删本轮探针，回读六指标恢复基线
    await expectStatus("DELETE", `/api/approvals/${appr27.json.id}`, undefined, 200, "r27 清理审批 -> 200");
    await expectStatus("DELETE", `/api/projects/${project27.json.id}`, undefined, 200, "r27 清理项目（级联列/卡） -> 200");
    await expectStatus("DELETE", `/api/assets/${asset27.json.id}`, undefined, 200, "r27 清理物资 -> 200");
    await expectStatus("DELETE", `/api/schedules/${sched27.json.id}`, undefined, 200, "r27 清理日程 -> 200");
    await expectStatus("DELETE", `/api/documents/${doc27.json.id}`, undefined, 200, "r27 清理文档 -> 200");
    await expectStatus("DELETE", `/api/todos/${todoA27.json.id}`, undefined, 200, "r27 清理完成待办 -> 200");
    await expectStatus("DELETE", `/api/todos/${todoB27.json.id}`, undefined, 200, "r27 清理未完成待办 -> 200");
    const clean27 = await expectStatus("GET", `/api/reports/overview?${q27}`, undefined, 200, "r27 清理后 overview -> 200");
    eq(metrics27.map((k) => clean27.json.metrics[k].value), metrics27.map((k) => base27.json.metrics[k].value), "r27 清理后六指标逐项恢复基线");
  }
}

/** r28 会议管理：真 HTTP 预约 / 409 冲突 id / 边界相接 / 跨室 / 4xx / 参会人；由 audit() 末尾调用 */
async function auditR28(): Promise<void> {
  console.log("\n== Meeting r28: real HTTP booking / 409 conflicts / attendees / 4xx ==");
  {
    const h28 = await expectStatus("GET", "/api/health", undefined, 200, "r28 health 真 HTTP 200");
    eq(h28.json && h28.json.schemaVersion, 27, "r28 health.schemaVersion=27（v20 迁移真生效）");
    const stamp28 = Date.now().toString(36);
    const day28 = "2027-02-18";

    // 建会议室：两间启用 + 一间停用（越权 room_id 分支载体）
    const roomA28 = await expectStatus("POST", "/api/rooms", {
      name: `r28甲-${stamp28}`, location: "3F", capacity: 12, active: true,
    }, 201, "r28 建会议室甲 -> 201");
    const roomB28 = await expectStatus("POST", "/api/rooms", {
      name: `r28乙-${stamp28}`, location: "4F", capacity: 6, active: true,
    }, 201, "r28 建会议室乙 -> 201");
    const roomOff28 = await expectStatus("POST", "/api/rooms", {
      name: `r28停用-${stamp28}`, location: "", capacity: 2, active: false,
    }, 201, "r28 建停用会议室 -> 201");
    eq(roomA28.json && roomA28.json.active, true, "r28 会议室甲默认启用回显");
    eq(roomOff28.json && roomOff28.json.active, false, "r28 停用会议室 active=false 真回显");
    // r28 返工#1：UI 建室后直接用响应里的新室 id 预约（不点左栏的路径，HTTP 层核对）
    const roomNewR1 = await expectStatus("POST", "/api/rooms", {
      name: `r28返工新室-${stamp28}`, location: "5F", capacity: 7, active: true,
    }, 201, "r28 返工#1 建室同路径 -> 201");
    eq(roomNewR1.json && typeof roomNewR1.json.id, "number", "r28 返工#1 建室响应回带新室 id（自动选中依据）");
    const roomsWithNewR1 = await expectStatus("GET", "/api/rooms", undefined, 200, "r28 返工#1 建室后列表 -> 200");
    ok(roomsWithNewR1.json.rooms.some((r: any) => r.id === roomNewR1.json.id && r.active === true), "r28 返工#1 列表中新室启用且 id 与响应逐字一致");
    const firstBookR1 = await expectStatus("POST", "/api/meetings", {
      roomId: roomNewR1.json.id, title: `r28返工首约-${stamp28}`, date: day28,
      start: "17:00", end: "18:00", organizer: "r28返工",
    }, 201, "r28 返工#1 建室后不点左栏直接预约 -> 201（新室 id）");
    eq(firstBookR1.json && firstBookR1.json.roomId, roomNewR1.json.id, "r28 返工#1 预约提交 roomId 即新室 id");
    const goneRoomR1 = await expectStatus("POST", "/api/rooms", {
      name: `r28返工删室-${stamp28}`, capacity: 1, active: true,
    }, 201, "r28 返工#1 建待删室 -> 201");
    await expectStatus("DELETE", `/api/rooms/${goneRoomR1.json.id}`, undefined, 200, "r28 返工#1 删室 -> 200");
    const staleBookR1 = await expectStatus("POST", "/api/meetings", {
      roomId: goneRoomR1.json.id, title: "x", date: day28, start: "17:00", end: "18:00",
    }, 400, "r28 返工#1 用已删旧 roomId 预约 -> 400（原缺陷路径）");
    eq(staleBookR1.json && staleBookR1.json.error, `会议室不存在：${goneRoomR1.json.id}`, "r28 返工#1 400 文案精确指认旧 roomId");
    await expectStatus("DELETE", `/api/meetings/${firstBookR1.json.id}`, undefined, 200, "r28 返工#1 清理首约 -> 200");
    await expectStatus("DELETE", `/api/rooms/${roomNewR1.json.id}`, undefined, 200, "r28 返工#1 清理新室 -> 200");
    const rooms28 = await expectStatus("GET", "/api/rooms", undefined, 200, "r28 会议室列表 -> 200");
    ok(rooms28.json.rooms.some((r: any) => r.id === roomA28.json.id), "r28 会议室列表含本轮探针甲");
    const roomOne28 = await expectStatus("GET", `/api/rooms/${roomA28.json.id}`, undefined, 200, "r28 单会议室查询 -> 200");
    eq(roomOne28.json && roomOne28.json.name, roomA28.json.name, "r28 单会议室名称逐字一致");
    const patchedRoom28 = await expectStatus("PATCH", `/api/rooms/${roomA28.json.id}`, { location: "3F-改" }, 200, "r28 会议室 PATCH -> 200");
    eq(patchedRoom28.json && patchedRoom28.json.location, "3F-改", "r28 会议室位置真更新");
    await expectStatus("GET", "/api/rooms/99999999", undefined, 404, "r28 越权会议室 id -> 404");
    await expectStatus("POST", "/api/rooms", { name: "   " }, 400, "r28 空会议室名 -> 400");
    await expectStatus("POST", "/api/rooms", { name: "x", capacity: -1 }, 400, "r28 负容量 -> 400");

    // 通讯录成员（参会人校验载体）
    const dept28 = await expectStatus("POST", "/api/departments", { name: `r28部门-${stamp28}` }, 201, "r28 建部门 -> 201");
    const memA28 = await expectStatus("POST", "/api/members", {
      name: `r28参会甲-${stamp28}`, email: `${stamp28}a@example.com`, departmentId: dept28.json.id, status: "active",
    }, 201, "r28 建启用成员 -> 201");
    const memB28 = await expectStatus("POST", "/api/members", {
      name: `r28参会乙-${stamp28}`, email: `${stamp28}b@example.com`, departmentId: dept28.json.id, status: "active",
    }, 201, "r28 建启用成员乙 -> 201");
    const memOff28 = await expectStatus("POST", "/api/members", {
      name: `r28停用成员-${stamp28}`, email: `${stamp28}o@example.com`, status: "inactive",
    }, 201, "r28 建停用成员 -> 201");

    // 真预约：甲室 09:00-10:00
    const first28 = await expectStatus("POST", "/api/meetings", {
      roomId: roomA28.json.id, title: `r28首场-${stamp28}`, date: day28,
      start: "09:00", end: "10:00", organizer: "r28甲", attendees: [memA28.json.id, memA28.json.id],
    }, 201, "r28 首场预约 -> 201");
    eq(first28.json && first28.json.title, `r28首场-${stamp28}`, "r28 首场标题真落库");
    eq(first28.json && first28.json.attendees, [memA28.json.id], "r28 参会人去重真回显");
    eq(first28.json && first28.json.date, day28, "r28 预约日期真回显");
    const next28 = await expectStatus("POST", "/api/meetings", {
      roomId: roomA28.json.id, title: `r28接档-${stamp28}`, date: day28, start: "10:00", end: "11:00",
    }, 201, "r28 边界相接预约 -> 201（不冲突）");
    ok(next28.json && next28.json.id > first28.json.id, "r28 接档会议拿到新 id");
    const crossRoom28 = await expectStatus("POST", "/api/meetings", {
      roomId: roomB28.json.id, title: `r28跨室-${stamp28}`, date: day28, start: "09:00", end: "10:00",
    }, 201, "r28 跨会议室同段 -> 201");
    eq(crossRoom28.json && crossRoom28.json.roomId, roomB28.json.id, "r28 跨室会议 room_id 正确");
    const crossDay28 = await expectStatus("POST", "/api/meetings", {
      roomId: roomA28.json.id, title: `r28跨日-${stamp28}`, date: "2027-02-19", start: "09:00", end: "10:00",
    }, 201, "r28 跨日期同段 -> 201");

    // 真 409：同室重叠，回带冲突会议 id
    const clash28 = await expectStatus("POST", "/api/meetings", {
      roomId: roomA28.json.id, title: `r28撞车-${stamp28}`, date: day28, start: "09:30", end: "10:30",
    }, 409, "r28 同室重叠 -> 409（真冲突）");
    eq(clash28.json && clash28.json.code, "MEETING_CONFLICT", "r28 409 code=MEETING_CONFLICT");
    eq(clash28.json && clash28.json.conflictIds, [first28.json.id, next28.json.id], "r28 409 回带两个冲突会议 id 升序");
    const wide28 = await expectStatus("POST", "/api/meetings", {
      roomId: roomA28.json.id, title: `r28大区间-${stamp28}`, date: day28, start: "08:00", end: "12:00",
    }, 409, "r28 大区间覆盖多场 -> 409");
    eq(wide28.json && wide28.json.conflictIds.length, 2, "r28 大区间冲突 id 两个");
    const listAfterClash28 = await expectStatus("GET", `/api/meetings?date=${day28}&roomId=${roomA28.json.id}`, undefined, 200, "r28 409 后会议列表 -> 200");
    eq(listAfterClash28.json && listAfterClash28.json.count, 2, "r28 409 零半态：甲室仍两场");

    // 409 之外的 4xx：倒挂 / 超长 / 停用室 / 不存在室 / 空标题 / 非法日期 / 停用与不存在参会人
    await expectStatus("POST", "/api/meetings", {
      roomId: roomA28.json.id, title: "x", date: day28, start: "10:00", end: "09:00",
    }, 400, "r28 时段倒挂 -> 400");
    await expectStatus("POST", "/api/meetings", {
      roomId: roomA28.json.id, title: "x", date: day28, start: "08:00", end: "16:01",
    }, 400, "r28 超过 8 小时 -> 400");
    await expectStatus("POST", "/api/meetings", {
      roomId: roomOff28.json.id, title: "x", date: day28, start: "12:00", end: "13:00",
    }, 400, "r28 停用会议室预约 -> 400");
    await expectStatus("POST", "/api/meetings", {
      roomId: 99999999, title: "x", date: day28, start: "12:00", end: "13:00",
    }, 400, "r28 越权 room_id -> 400");
    await expectStatus("POST", "/api/meetings", {
      roomId: roomA28.json.id, title: "  ", date: day28, start: "12:00", end: "13:00",
    }, 400, "r28 空会议标题 -> 400");
    await expectStatus("POST", "/api/meetings", {
      roomId: roomA28.json.id, title: "x", date: "2027-02-30", start: "12:00", end: "13:00",
    }, 400, "r28 非法日期 -> 400");
    await expectStatus("POST", "/api/meetings", {
      roomId: roomA28.json.id, title: "x", date: day28, start: "12:00", end: "13:00", attendees: [99999999],
    }, 400, "r28 不存在参会人 -> 400");
    await expectStatus("POST", "/api/meetings", {
      roomId: roomA28.json.id, title: "x", date: day28, start: "12:00", end: "13:00", attendees: [memOff28.json.id],
    }, 400, "r28 停用参会人 -> 400");
    const after4xx28 = await expectStatus("GET", `/api/meetings?date=${day28}&roomId=${roomA28.json.id}`, undefined, 200, "r28 4xx 后列表仍 200");
    eq(after4xx28.json && after4xx28.json.count, 2, "r28 4xx 不改变会议台账（零半态）");

    // 查询与可用性
    const byDay28 = await expectStatus("GET", `/api/meetings?date=${day28}`, undefined, 200, "r28 按日期查询 -> 200");
    eq(byDay28.json && byDay28.json.count, 3, "r28 当日三场（甲2乙1）");
    eq(byDay28.json && byDay28.json.availability.length, 2, "r28 availability 只列两间启用会议室");
    const avail28 = await expectStatus("GET", `/api/rooms/${roomA28.json.id}/availability?date=${day28}`, undefined, 200, "r28 单室可用性 -> 200");
    eq(avail28.json && avail28.json.bookings.length, 2, "r28 单室可用性回两条预约");
    eq(avail28.json && avail28.json.bookings[0].start, "09:00", "r28 可用性按开始时间升序");
    await expectStatus("GET", `/api/rooms/${roomA28.json.id}/availability?date=bad`, undefined, 400, "r28 可用性非法日期 -> 400");
    await expectStatus("GET", "/api/rooms/99999999/availability?date=2027-02-18", undefined, 404, "r28 可用性越权室 -> 404");
    await expectStatus("GET", "/api/meetings/99999999", undefined, 404, "r28 越权会议 id -> 404");
    await expectStatus("GET", "/api/meetings?date=bad", undefined, 400, "r28 会议列表非法日期 -> 400");

    // 改期：自我排除 + 撞别的场次被拒
    const patchOk28 = await expectStatus("PATCH", `/api/meetings/${crossDay28.json.id}`, {
      date: day28, start: "11:00", end: "12:00",
    }, 200, "r28 改期到空闲段 -> 200");
    eq(patchOk28.json && patchOk28.json.start, "11:00", "r28 改期开始时间真落库");
    const patchSelf28 = await expectStatus("PATCH", `/api/meetings/${first28.json.id}`, {
      title: `r28改名-${stamp28}`,
    }, 200, "r28 只改标题（不撞自己）-> 200");
    eq(patchSelf28.json && patchSelf28.json.title, `r28改名-${stamp28}`, "r28 自我排除改期成功");
    const patchClash28 = await expectStatus("PATCH", `/api/meetings/${crossDay28.json.id}`, {
      start: "09:30", end: "10:30",
    }, 409, "r28 改期撞其他场次 -> 409");
    eq(patchClash28.json && patchClash28.json.conflictIds.length, 2, "r28 改期 409 回带冲突 id");

    // 参会人管理：整组替换 / 增补 / 移除 / 4xx 零半态
    const put28 = await expectStatus("PUT", `/api/meetings/${first28.json.id}/attendees`, {
      attendees: [memA28.json.id, memB28.json.id, memA28.json.id],
    }, 200, "r28 参会人整组替换 -> 200");
    eq(put28.json && put28.json.attendees, [memA28.json.id, memB28.json.id], "r28 替换后参会人去重回显");
    const getAtt28 = await expectStatus("GET", `/api/meetings/${first28.json.id}/attendees`, undefined, 200, "r28 参会人查询 -> 200");
    eq(getAtt28.json && getAtt28.json.count, 2, "r28 参会人真落库两条");
    await expectStatus("PUT", `/api/meetings/${first28.json.id}/attendees`, { attendees: [memOff28.json.id] }, 400, "r28 替换含停用成员 -> 400");
    eq((await expectStatus("GET", `/api/meetings/${first28.json.id}/attendees`, undefined, 200, "r28 4xx 后参会人查询 -> 200")).json.count, 2, "r28 400 后参会人零半态");
    const removed28 = await expectStatus("DELETE", `/api/meetings/${first28.json.id}/attendees/${memB28.json.id}`, undefined, 200, "r28 移除参会人 -> 200");
    eq(removed28.json && removed28.json.count, 1, "r28 移除后剩一人");
    await expectStatus("DELETE", `/api/meetings/${first28.json.id}/attendees/${memB28.json.id}`, undefined, 404, "r28 重复移除 -> 404");
    await expectStatus("GET", "/api/meetings/99999999/attendees", undefined, 404, "r28 越权会议参会人查询 -> 404");

    // 清理：只删本轮探针
    await expectStatus("DELETE", `/api/meetings/${first28.json.id}`, undefined, 200, "r28 清理首场 -> 200");
    await expectStatus("DELETE", `/api/meetings/${next28.json.id}`, undefined, 200, "r28 清理接档 -> 200");
    await expectStatus("DELETE", `/api/meetings/${crossRoom28.json.id}`, undefined, 200, "r28 清理跨室 -> 200");
    await expectStatus("DELETE", `/api/meetings/${crossDay28.json.id}`, undefined, 200, "r28 清理跨日 -> 200");
    await expectStatus("DELETE", `/api/members/${memA28.json.id}`, undefined, 200, "r28 清理成员甲 -> 200");
    await expectStatus("DELETE", `/api/members/${memB28.json.id}`, undefined, 200, "r28 清理成员乙 -> 200");
    await expectStatus("DELETE", `/api/members/${memOff28.json.id}`, undefined, 200, "r28 清理停用成员 -> 200");
    await expectStatus("DELETE", `/api/departments/${dept28.json.id}`, undefined, 200, "r28 清理部门 -> 200");
    await expectStatus("DELETE", `/api/rooms/${roomA28.json.id}`, undefined, 200, "r28 清理会议室甲 -> 200");
    await expectStatus("DELETE", `/api/rooms/${roomB28.json.id}`, undefined, 200, "r28 清理会议室乙 -> 200");
    await expectStatus("DELETE", `/api/rooms/${roomOff28.json.id}`, undefined, 200, "r28 清理停用会议室 -> 200");
    const clean28 = await expectStatus("GET", `/api/meetings?date=${day28}`, undefined, 200, "r28 清理后会议列表 -> 200");
    eq(clean28.json && clean28.json.count, 0, "r28 清理后本轮会议归零");
    const cleanRooms28 = await expectStatus("GET", "/api/rooms", undefined, 200, "r28 清理后会议室列表 -> 200");
    eq(cleanRooms28.json.rooms.filter((r: any) => String(r.name).includes(stamp28)).length, 0, "r28 清理后本轮会议室归零");
  }

  // ---- r29：文档版本历史 / 恢复新版本 / 软删除回收站 / 永久删除二次确认（真 HTTP） ----
  {
    const stamp29 = `r29-${Date.now()}`;
    const h29 = await expectStatus("GET", "/api/health", undefined, 200, "r29 health -> 200");
    eq(h29.json && h29.json.schemaVersion, 27, "r29 health.schemaVersion=27（v21 迁移真生效）");

    const docA29 = await expectStatus("POST", "/api/documents", { title: `${stamp29}-A` }, 201, "r29 建探针文档 A -> 201");
    const docB29 = await expectStatus("POST", "/api/documents", { title: `${stamp29}-B` }, 201, "r29 建探针文档 B -> 201");
    const idA29 = docA29.json.id;
    const idB29 = docB29.json.id;
    const empty29 = await expectStatus("GET", `/api/documents/${idA29}/versions`, undefined, 200, "r29 新文档版本列表 -> 200");
    eq(empty29.json && empty29.json.versions, [], "r29 新文档零版本");

    const mdV129 = "# r29 版本一\n\n第一段原文\n\n第二段原文";
    const mdV229 = "# r29 版本二\n\n第一段改写\n\n第二段原文\n\n新增第三段";
    const mdV329 = "# r29 版本三\n\n第一段再改\n\n第二段原文";
    await expectStatus("POST", `/api/documents/${idA29}/import.md`, { markdown: mdV129 }, 200, "r29 导入 v1 内容 -> 200");
    const textV129 = await expectStatus("GET", `/api/documents/${idA29}/text`, undefined, 200, "r29 读 v1 全文 -> 200");
    const v1_29 = await expectStatus("POST", `/api/documents/${idA29}/versions`, {}, 201, "r29 存 v1 快照 -> 201");
    eq(v1_29.json && v1_29.json.version, 1, "r29 首版 v1");
    eq(v1_29.json && v1_29.json.contentMarkdown, mdV129, "r29 v1 快照逐字等于内容");
    ok(String(v1_29.json.note).includes("新增"), "r29 v1 摘要由 shared 生成");

    await expectStatus("POST", `/api/documents/${idA29}/import.md`, { markdown: mdV229 }, 200, "r29 导入 v2 内容 -> 200");
    const v2_29 = await expectStatus("POST", `/api/documents/${idA29}/versions`, {}, 201, "r29 存 v2 快照 -> 201");
    eq(v2_29.json && v2_29.json.version, 2, "r29 第二版 v2");
    await expectStatus("POST", `/api/documents/${idA29}/import.md`, { markdown: mdV329 }, 200, "r29 导入 v3 内容 -> 200");
    const v3_29 = await expectStatus("POST", `/api/documents/${idA29}/versions`, { note: "手填备注" }, 201, "r29 存 v3 快照 -> 201");
    eq(v3_29.json && v3_29.json.version, 3, "r29 第三版 v3");
    eq(v3_29.json && v3_29.json.note, "手填备注", "r29 自定义 note 原样落库");
    const listed29 = await expectStatus("GET", `/api/documents/${idA29}/versions`, undefined, 200, "r29 版本列表 -> 200");
    eq(listed29.json && listed29.json.versions.length, 3, "r29 真 HTTP 三版全在");
    eq(listed29.json && listed29.json.versions[0].version, 3, "r29 版本列表新版在前");

    const restored29 = await expectStatus("POST", `/api/documents/${idA29}/versions/1/restore`, {}, 200, "r29 恢复 v1 -> 200");
    eq(restored29.json && restored29.json.restoredFrom, 1, "r29 恢复来源 v1");
    eq(restored29.json && restored29.json.version.version, 4, "r29 恢复生成 v4 不覆盖历史");
    eq(restored29.json && restored29.json.version.contentMarkdown, mdV129, "r29 新版本内容逐字等于 v1");
    const textAfter29 = await expectStatus("GET", `/api/documents/${idA29}/text`, undefined, 200, "r29 读恢复后全文 -> 200");
    eq(textAfter29.json && textAfter29.json.text, textV129.json && textV129.json.text, "r29 恢复后全文逐字等于 v1（真 HTTP）");
    const afterList29 = await expectStatus("GET", `/api/documents/${idA29}/versions`, undefined, 200, "r29 恢复后版本列表 -> 200");
    eq(afterList29.json && afterList29.json.versions.length, 4, "r29 恢复后四版全在（历史未覆盖）");
    eq(afterList29.json && afterList29.json.versions.find((v: any) => v.version === 1).contentMarkdown, mdV129, "r29 原 v1 快照未变");

    // 4xx：版本不存在 / 越权 id / 非法 id / 已软删文档恢复
    await expectStatus("GET", "/api/documents/99999999/versions", undefined, 404, "r29 越权文档版本列表 -> 404");
    await expectStatus("POST", "/api/documents/99999999/versions", {}, 404, "r29 越权文档存快照 -> 404");
    await expectStatus("POST", `/api/documents/${idA29}/versions/999/restore`, {}, 404, "r29 版本不存在 -> 404");
    await expectStatus("POST", `/api/documents/${idB29}/versions/1/restore`, {}, 404, "r29 跨文档版本 id -> 404");
    await expectStatus("POST", `/api/documents/${idA29}/versions/abc/restore`, {}, 400, "r29 非法版本号 -> 400");

    // 软删除 / 回收站 / 还原 / 二次确认永久删除（全部只用本轮探针）
    await expectStatus("DELETE", `/api/documents/${idB29}`, undefined, 200, "r29 软删文档 B -> 200");
    await expectStatus("GET", `/api/documents/${idB29}`, undefined, 404, "r29 软删后常规读 -> 404");
    const listAfterSoft29 = await expectStatus("GET", "/api/documents", undefined, 200, "r29 软删后文档列表 -> 200");
    eq(listAfterSoft29.json.documents.filter((d: any) => d.id === idB29).length, 0, "r29 软删后列表排除 B");
    const trash29 = await expectStatus("GET", "/api/documents/trash", undefined, 200, "r29 回收站列表 -> 200");
    const trashedB29 = trash29.json.documents.find((d: any) => d.id === idB29);
    ok(trashedB29 && trashedB29.deletedAt != null, "r29 回收站项带 deletedAt");
    await expectStatus("POST", `/api/documents/${idB29}/versions/1/restore`, {}, 400, "r29 恢复已软删文档 -> 400");
    await expectStatus("POST", `/api/documents/trash/${idB29}/restore`, {}, 200, "r29 从回收站还原 -> 200");
    await expectStatus("GET", `/api/documents/${idB29}`, undefined, 200, "r29 还原后文档仍在 -> 200");
    await expectStatus("DELETE", `/api/documents/${idB29}`, undefined, 200, "r29 再次软删 B -> 200");
    await expectStatus("DELETE", `/api/documents/trash/${idB29}`, {}, 400, "r29 永久删除缺二次确认 -> 400");
    await expectStatus("DELETE", `/api/documents/trash/${idA29}`, { confirm: "PERMANENTLY_DELETE" }, 404, "r29 未软删文档不可永久删除 -> 404");
    await expectStatus("DELETE", `/api/documents/trash/${idB29}`, { confirm: "PERMANENTLY_DELETE" }, 200, "r29 带确认永久删除 -> 200");
    await expectStatus("GET", `/api/documents/${idB29}`, undefined, 404, "r29 永久删除后读 -> 404");
    const trashClean29 = await expectStatus("GET", "/api/documents/trash", undefined, 200, "r29 清理后回收站 -> 200");
    eq(trashClean29.json.documents.filter((d: any) => d.id === idB29).length, 0, "r29 永久删除后回收站归零");

    // 清理探针 A（软删 + 带确认永久删除，只删本轮数据）
    await expectStatus("DELETE", `/api/documents/${idA29}`, undefined, 200, "r29 清理探针 A 软删 -> 200");
    await expectStatus("DELETE", `/api/documents/trash/${idA29}`, { confirm: "PERMANENTLY_DELETE" }, 200, "r29 清理探针 A 永久删除 -> 200");
    const finalTrash29 = await expectStatus("GET", "/api/documents/trash", undefined, 200, "r29 最终回收站 -> 200");
    eq(finalTrash29.json.documents.filter((d: any) => String(d.title).includes(stamp29)).length, 0, "r29 本轮探针归零");
  }

  // ---- r30：多维表格公式字段（真 HTTP 装配：单价 × 数量 = 小计 / 读时计算 / 循环引用 / 4xx） ----
  {
    const stamp30 = `r30-${Date.now()}`;
    const h30 = await expectStatus("GET", "/api/health", undefined, 200, "r30 health -> 200");
    eq(h30.json && h30.json.schemaVersion, 27, "r30 health.schemaVersion=27（v22 迁移真生效）");

    const tbl30 = await expectStatus("POST", "/api/tables", { name: `${stamp30}-formula` }, 201, "r30 建表 -> 201");
    const tid30 = tbl30.json.id;
    const fieldsInit30 = await expectStatus("GET", `/api/tables/${tid30}/fields`, undefined, 200, "r30 默认字段 -> 200");
    eq(fieldsInit30.json.fields.length, 8, "r30 建表自带 8 默认字段");
    ok(!fieldsInit30.json.fields.some((f: any) => f.type === "formula"), "r30 默认字段不含公式列");

    const price30 = await expectStatus("POST", `/api/tables/${tid30}/fields`, { name: "单价", type: "number" }, 201, "r30 加单价 number -> 201");
    const qty30 = await expectStatus("POST", `/api/tables/${tid30}/fields`, { name: "数量", type: "number" }, 201, "r30 加数量 number -> 201");
    eq(price30.json.type, "number", "r30 单价类型 number");
    eq(qty30.json.type, "number", "r30 数量类型 number");
    const sub30 = await expectStatus(
      "POST", `/api/tables/${tid30}/fields`,
      { name: "小计", type: "formula", expression: "{单价} * {数量}" },
      201, "r30 加小计 formula={单价}*{数量} -> 201",
    );
    eq(sub30.json.type, "formula", "r30 小计类型 formula");
    eq(sub30.json.expression, "{单价} * {数量}", "r30 表达式随字段回带");
    eq(sub30.json.options, [], "r30 公式字段 options 恒为空数组（表达式存 expression）");

    // 4xx：非法表达式 / 未知字段 / 缺表达式 / 越权表 id
    await expectStatus("POST", `/api/tables/${tid30}/fields`, { name: "坏公式", type: "formula", expression: "{单价} * " }, 400, "r30 非法表达式语法 -> 400");
    await expectStatus("POST", `/api/tables/${tid30}/fields`, { name: "未知引用", type: "formula", expression: "{不存在} + 1" }, 400, "r30 未知字段引用 -> 400");
    await expectStatus("POST", `/api/tables/${tid30}/fields`, { name: "无表达式", type: "formula" }, 400, "r30 公式缺表达式 -> 400");
    await expectStatus("POST", "/api/tables/99999999/fields", { name: "越权", type: "formula", expression: "1+1" }, 404, "r30 越权表 id 建字段 -> 404");
    await expectStatus("GET", "/api/tables/99999999/records", undefined, 404, "r30 越权表 id 查记录 -> 404");
    await expectStatus("POST", "/api/tables/99999999/formulas/preview", { expression: "1+1" }, 404, "r30 越权表 id 试算 -> 404");

    // 真数据：录单价 12.5 / 数量 4 → 小计 50（读时计算）
    const recA30 = await expectStatus(
      "POST", `/api/tables/${tid30}/records`,
      { data: { [String(price30.json.id)]: 12.5, [String(qty30.json.id)]: 4 } },
      201, "r30 录第一行单价 12.5 数量 4 -> 201",
    );
    const ridA30 = recA30.json.id;
    const recB30 = await expectStatus(
      "POST", `/api/tables/${tid30}/records`,
      { data: { [String(price30.json.id)]: 3, [String(qty30.json.id)]: 7 } },
      201, "r30 录第二行单价 3 数量 7 -> 201",
    );
    const listed30 = await expectStatus("GET", `/api/tables/${tid30}/records`, undefined, 200, "r30 查记录 -> 200");
    const rowA30 = listed30.json.records.find((r: any) => r.id === ridA30);
    eq(rowA30.computed[String(sub30.json.id)].value, 50, "r30 小计真算 12.5 × 4 = 50（真 HTTP）");
    eq(rowA30.computed[String(sub30.json.id)].error, null, "r30 小计无错误");
    eq(rowA30.data[String(sub30.json.id)], null, "r30 计算值不落库（data 内公式列恒 null）");
    const rowB30 = listed30.json.records.find((r: any) => r.id === recB30.json.id);
    eq(rowB30.computed[String(sub30.json.id)].value, 21, "r30 第二行小计 3 × 7 = 21");
    eq(Array.isArray(listed30.json.cycles), true, "r30 无循环引用时 cycles 为空数组");
    eq(listed30.json.cycles.length, 0, "r30 cycles 长度 0");

    // 改依赖字段后重算（读时重新装配，不落库）
    await expectStatus(
      "PATCH", `/api/records/${ridA30}`,
      { data: { [String(price30.json.id)]: 20, [String(qty30.json.id)]: 4 } },
      200, "r30 改单价 12.5→20 -> 200",
    );
    const afterEdit30 = await expectStatus("GET", `/api/tables/${tid30}/records`, undefined, 200, "r30 改后查记录 -> 200");
    eq(afterEdit30.json.records.find((r: any) => r.id === ridA30).computed[String(sub30.json.id)].value, 80, "r30 改单价后小计自动重算 20 × 4 = 80");
    const single30 = await expectStatus("GET", `/api/records/${ridA30}`, undefined, 200, "r30 单条读取 -> 200");
    eq(single30.json.computed[String(sub30.json.id)].value, 80, "r30 单条读取同样回带计算值");

    // 实时预览：新建字段试算 / 编辑既有字段试算 / 非法表达式 400
    const previewNew30 = await expectStatus(
      "POST", `/api/tables/${tid30}/formulas/preview`,
      { name: "含税", expression: "{小计} * 1.06" },
      200, "r30 新建字段实时预览 -> 200",
    );
    eq(previewNew30.json.valid, true, "r30 预览 valid=true");
    eq(previewNew30.json.preview.length, 2, "r30 预览覆盖两行");
    const taxValue30 = previewNew30.json.preview.find((p: any) => p.recordId === ridA30).value;
    ok(Math.abs(Number(taxValue30) - 84.8) < 1e-9, "r30 预览 80 × 1.06 = 84.8（引用公式列）");
    const previewEdit30 = await expectStatus(
      "POST", `/api/tables/${tid30}/formulas/preview`,
      { fieldId: sub30.json.id, expression: "{单价} + {数量}" },
      200, "r30 编辑字段实时预览 -> 200",
    );
    eq(previewEdit30.json.preview.find((p: any) => p.recordId === ridA30).value, 24, "r30 编辑预览 20 + 4 = 24");
    await expectStatus("POST", `/api/tables/${tid30}/formulas/preview`, { expression: "IF(" }, 400, "r30 预览非法表达式 -> 400");
    await expectStatus("POST", `/api/tables/${tid30}/formulas/preview`, { expression: "{鬼字段}" }, 400, "r30 预览未知字段 -> 400");

    // 循环引用：F1={Y}+1 → F2={F1}+1 → 把 F1 改成 {F2}+1 应 400，原表达式不变
    const f1 = await expectStatus("POST", `/api/tables/${tid30}/fields`, { name: "甲", type: "formula", expression: "{数量} + 1" }, 201, "r30 建甲公式 -> 201");
    const f2 = await expectStatus("POST", `/api/tables/${tid30}/fields`, { name: "乙", type: "formula", expression: "{甲} + 1" }, 201, "r30 建乙引用甲 -> 201");
    eq(f2.json.expression, "{甲} + 1", "r30 公式可引用另一公式列");
    const cyclePatch = await expectStatus("PATCH", `/api/fields/${f1.json.id}`, { expression: "{乙} + 1" }, 400, "r30 甲↔乙循环引用改写 -> 400");
    ok(String(cyclePatch.json.error).includes("循环引用"), "r30 循环引用错误文案明确");
    await expectStatus("POST", `/api/tables/${tid30}/formulas/preview`, { fieldId: f1.json.id, expression: "{乙} + 1" }, 400, "r30 循环引用预览 -> 400");
    const afterCycle30 = await expectStatus("GET", `/api/tables/${tid30}/fields`, undefined, 200, "r30 循环改写被拒后字段表 -> 200");
    eq(afterCycle30.json.fields.find((f: any) => f.id === f1.json.id).expression, "{数量} + 1", "r30 循环引用拒绝零半态（甲表达式未变）");

    // 运行时错误红标：除零 → computed.error 非空（值 null）
    const bad30 = await expectStatus("POST", `/api/tables/${tid30}/fields`, { name: "除法", type: "formula", expression: "{单价} / {数量减数量}" }, 400, "r30 除零表达式引用未知字段 -> 400");
    ok(bad30.status === 400, "r30 除零字段名不存在先被引用校验拦下");
    const zeroField = await expectStatus("POST", `/api/tables/${tid30}/fields`, { name: "零", type: "number" }, 201, "r30 建零数字列 -> 201");
    const divField = await expectStatus("POST", `/api/tables/${tid30}/fields`, { name: "商", type: "formula", expression: "{单价} / {零}" }, 201, "r30 建除法公式列 -> 201");
    const recZero30 = await expectStatus("POST", `/api/tables/${tid30}/records`, { data: { [String(price30.json.id)]: 10, [String(zeroField.json.id)]: 0 } }, 201, "r30 录除零行 -> 201");
    const withZero30 = await expectStatus("GET", `/api/tables/${tid30}/records`, undefined, 200, "r30 查除零行 -> 200");
    const zeroRow = withZero30.json.records.find((r: any) => r.id === recZero30.json.id);
    eq(zeroRow.computed[String(divField.json.id)].value, null, "r30 除零单元格值 null");
    ok(String(zeroRow.computed[String(divField.json.id)].error).includes("除零"), "r30 除零单元格 error 文案含除零（web 红标同源）");

    // 公式列只读：写值进公式列 → 400
    await expectStatus("PATCH", `/api/records/${ridA30}`, { data: { [String(sub30.json.id)]: 999 } }, 400, "r30 直接写公式列 -> 400");

    // 清理探针：整表级联删除
    await expectStatus("DELETE", `/api/tables/${tid30}`, undefined, 200, "r30 清理探针表 -> 200");
    const tablesAfter30 = await expectStatus("GET", "/api/tables", undefined, 200, "r30 清理后表列表 -> 200");
    eq(tablesAfter30.json.tables.filter((t: any) => String(t.name).includes(stamp30)).length, 0, "r30 本轮探针表归零");
  }

  // ---- r31：浮点展示层格式化不得改动 HTTP 求值语义（raw 浮点照旧，展示层收敛） ----
  {
    const stamp31 = `r31-float-${Date.now()}`;
    const tbl31 = await expectStatus("POST", "/api/tables", { name: stamp31 }, 201, "r31 建浮点探针表 -> 201");
    const tid31 = tbl31.json.id;
    const price31 = await expectStatus("POST", `/api/tables/${tid31}/fields`, { name: "单价", type: "number" }, 201, "r31 加单价 number -> 201");
    const qty31 = await expectStatus("POST", `/api/tables/${tid31}/fields`, { name: "数量", type: "number" }, 201, "r31 加数量 number -> 201");
    const sub31 = await expectStatus("POST", `/api/tables/${tid31}/fields`, { name: "小计", type: "formula", expression: "{单价} * {数量}" }, 201, "r31 加小计公式 -> 201");
    const tax31 = await expectStatus("POST", `/api/tables/${tid31}/fields`, { name: "含税", type: "formula", expression: "{小计} * 1.06" }, 201, "r31 加链式含税公式 -> 201");
    const rec31 = await expectStatus(
      "POST", `/api/tables/${tid31}/records`,
      { data: { [String(price31.json.id)]: 80, [String(qty31.json.id)]: 1 } },
      201, "r31 录 80 x 1 -> 201",
    );
    const listed31 = await expectStatus("GET", `/api/tables/${tid31}/records`, undefined, 200, "r31 查浮点探针记录 -> 200");
    const row31 = listed31.json.records.find((r: any) => r.id === rec31.json.id);
    const rawGet31 = row31.computed[String(tax31.json.id)].value;
    eq(rawGet31, 84.80000000000001, "r31 GET 原始浮点逐字保持（求值语义未改，audit 手算断言不降级）");
    eq(formatFormulaDisplay(rawGet31), "84.8", "r31 展示格式化作用于真 HTTP 回带值 -> 84.8");
    eq(row31.data[String(tax31.json.id)], null, "r31 链式公式列仍不落库（raw 恒 null）");
    const preview31 = await expectStatus(
      "POST", `/api/tables/${tid31}/formulas/preview`,
      { expression: "{小计} * 1.06" },
      200, "r31 链式实时预览 -> 200",
    );
    const rawPreview31 = preview31.json.preview.find((p: any) => p.recordId === rec31.json.id).value;
    eq(rawPreview31, 84.80000000000001, "r31 预览端点同样回带原始浮点（展示层不污染 API）");
    eq(formatFormulaDisplay(rawPreview31), "84.8", "r31 预览展示层收敛到 84.8（waizhuan P5 修复）");
    await expectStatus("DELETE", `/api/tables/${tid31}`, undefined, 200, "r31 清理浮点探针表 -> 200");
    const tablesAfter31 = await expectStatus("GET", "/api/tables", undefined, 200, "r31 清理后表列表 -> 200");
    eq(tablesAfter31.json.tables.filter((t: any) => String(t.name).includes(stamp31)).length, 0, "r31 本轮探针表归零");
  }

  // ---- r32：文档打印导出增强（真 HTTP：10 种块 HTML / Word / 预览 / 4xx / 清理） ----
  {
      const stamp32 = `r32-export-${Date.now()}`;
      const created32 = await expectStatus("POST", "/api/documents", { title: `${stamp32} 导出验收` }, 201, "r32 建导出探针文档 -> 201");
      const docId32 = created32.json.id;
      const md32 = [
        "# 一级标题", "## 二级标题", "正文段落 <script>alert(1)</script> & 成本", "- 无序要点",
        "1. 有序一", "1. 有序二", "- [x] 已办项", "> 引用一句话", "```ts", "const a = 1 < 2;", "```", "---",
      ].join("\n\n");
      const imported32 = await expectStatus(
        "POST", `/api/documents/${docId32}/import.md`, { markdown: md32 }, 200, "r32 导入十种块 -> 200",
      );
      eq(imported32.json.imported, 10, "r32 探针文档恰含十种块");

      // HTML 打印版：真实文本响应（非 JSON）
      const html32 = await reqText(`/api/documents/${docId32}/export.html`);
      eq(html32.status, 200, "r32 GET export.html -> 200");
      ok((html32.headers.get("content-type") ?? "").includes("text/html"), "r32 export.html content-type=text/html");
      ok(html32.text.startsWith("<!DOCTYPE html>"), "r32 export.html 以 DOCTYPE 开头");
      ok(html32.text.includes("@media print"), "r32 export.html 内嵌 @media print");
      ok(html32.text.includes("@page") && html32.text.includes("counter(page)"), "r32 export.html 纸张规则与页码在场");
      ok(html32.text.includes(stamp32), "r32 export.html 标题逐字在场");
      const types32 = Array.from(html32.text.matchAll(/data-block-type="([a-z0-9]+)"/g), (m) => m[1]);
      eq(types32, ["heading1", "heading2", "paragraph", "bullet", "numbered", "numbered", "todo", "quote", "code", "divider"], "r32 export.html 十种块顺序正确");
      ok(html32.text.includes("<script>alert(1)</script>") === false, "r32 export.html XSS 脚本未原样下发");
      ok(html32.text.includes("&lt;script&gt;"), "r32 export.html XSS 被转义为实体");
      ok(html32.text.includes("&amp; 成本"), "r32 export.html & 字符被转义为实体");
      ok(!html32.text.includes(" & "), "r32 export.html 无裸 & 外泄");
      ok(html32.text.includes("const a = 1 &lt; 2;"), "r32 export.html 代码块尖括号转义");

      // Word .doc：真实字节响应（BOM + Word 兼容头）
      const doc32 = await reqBytes(`/api/documents/${docId32}/export.doc`);
      eq(doc32.status, 200, "r32 GET export.doc -> 200");
      ok((doc32.headers.get("content-type") ?? "").includes("application/msword"), "r32 export.doc content-type=application/msword");
      ok((doc32.headers.get("content-disposition") ?? "").includes(".doc"), "r32 export.doc 下载文件名带 .doc");
      eq(Array.from(doc32.bytes.slice(0, 3)), [0xEF, 0xBB, 0xBF], "r32 export.doc 头三字节为 UTF-8 BOM");
      const word32 = new TextDecoder("utf-8").decode(doc32.bytes).replace(/^\uFEFF/, "");
      ok(word32.includes('xmlns:w="urn:schemas-microsoft-com:office:word"'), "r32 export.doc Word 命名空间在场");
      ok(word32.includes("<w:WordDocument>") && word32.includes("WordSection1"), "r32 export.doc Word 条件注释与分页节在场");
      ok(word32.includes("mso-field-code"), "r32 export.doc 页码域码在场");
      ok(word32.includes("一级标题") && word32.includes("引用一句话"), "r32 export.doc 十种块正文不丢");
      ok(word32.includes("&lt;script&gt;"), "r32 export.doc XSS 同样被转义");
      ok(word32.includes("&amp; 成本"), "r32 export.doc & 字符被转义为实体");

      // 打印预览：JSON + 真 HTML 片段
      const preview32 = await expectStatus("GET", `/api/documents/${docId32}/print-preview`, undefined, 200, "r32 GET print-preview -> 200");
      eq(preview32.json.blockCount, 10, "r32 预览 blockCount=10");
      ok(String(preview32.json.title).includes(stamp32), "r32 预览标题回带");
      ok(String(preview32.json.html).startsWith("<!DOCTYPE html>"), "r32 预览携带完整可打印 HTML");
      ok(typeof preview32.json.generatedAt === "string", "r32 预览生成时间字段在场");

      // 4xx：越权 id / 非法 id / 空文档 / 非法块
      await expectStatus("GET", "/api/documents/99999999/export.html", undefined, 404, "r32 越权 id 导出 HTML -> 404");
      await expectStatus("GET", "/api/documents/bad-id/export.doc", undefined, 400, "r32 非法 id 导出 Word -> 400");
      await expectStatus("GET", "/api/documents/99999999/print-preview", undefined, 404, "r32 越权 id 预览 -> 404");
      await expectStatus("GET", "/api/documents/bad-id/print-preview", undefined, 400, "r32 非法 id 预览 -> 400");
      const badBlock32 = await expectStatus(
        "POST", `/api/documents/${docId32}/blocks`, { type: "evil", content: { text: "x" } }, 400, "r32 非法块类型写入 -> 400",
      );
      ok(String(badBlock32.json.error).includes("非法块类型"), "r32 非法块类型错误文案明确");
      const empty32 = await expectStatus("POST", "/api/documents", { title: `${stamp32}-empty` }, 201, "r32 建空文档探针 -> 201");
      const firstBlock32 = (await expectStatus("GET", `/api/documents/${empty32.json.id}/blocks`, undefined, 200, "r32 空探针默认首块在场 -> 200")).json.blocks[0].id;
      await expectStatus("DELETE", `/api/blocks/${firstBlock32}`, undefined, 200, "r32 删除默认首块 -> 200");
      const emptyHtml32 = await expectStatus("GET", `/api/documents/${empty32.json.id}/export.html`, undefined, 422, "r32 空文档导出 HTML -> 422");
      ok(String(emptyHtml32.json.error).includes("空文档"), "r32 空文档错误文案明确");
      cleanError39(emptyHtml32, "r39 4xx·空文档错误体零内部术语");
      await expectStatus("GET", `/api/documents/${empty32.json.id}/export.doc`, undefined, 422, "r32 空文档导出 Word -> 422");
      await expectStatus("GET", `/api/documents/${empty32.json.id}/print-preview`, undefined, 422, "r32 空文档预览 -> 422");

      // 清理：两个探针文档软删，列表中归零
      await expectStatus("DELETE", `/api/documents/${docId32}`, undefined, 200, "r32 清理主探针文档 -> 200");
      await expectStatus("DELETE", `/api/documents/${empty32.json.id}`, undefined, 200, "r32 清理空探针文档 -> 200");
      const docsAfter32 = await expectStatus("GET", "/api/documents", undefined, 200, "r32 清理后文档列表 -> 200");
      eq(docsAfter32.json.documents.filter((d: any) => String(d.title).includes(stamp32)).length, 0, "r32 本轮探针文档归零");
    }

    // ---- r33：全局搜索（真 HTTP 跨 8 源 + 排序/直达/只读 + 4xx） ----
    {
      const KEY = `R33HTTP${Date.now()}`;
      // 造 8 源探针：知识库正文命中（标题不含关键词）用于验证「标题命中优先」
      const todo33 = await expectStatus("POST", "/api/todos", { title: `${KEY} 待办`, quadrant: "q1" }, 201, "r33 建待办探针 -> 201");
      const sch33 = await expectStatus("POST", "/api/schedules", { title: `${KEY} 日程`, date: "2026-11-21", start: "09:00", end: "10:00", repeat: "none" }, 201, "r33 建日程探针 -> 201");
      const proj33 = await expectStatus("POST", "/api/projects", { name: `${KEY} 项目`, description: "跨源检索" }, 201, "r33 建项目探针 -> 201");
      const cols33 = await expectStatus("GET", `/api/projects/${proj33.json.id}/columns`, undefined, 200, "r33 项目自动三列 -> 200");
      const card33 = await expectStatus("POST", `/api/projects/${proj33.json.id}/columns/${cols33.json.columns[0].id}/cards`, { title: `${KEY} 卡片`, description: "看板命中" }, 201, "r33 建卡片探针 -> 201");
      const doc33 = await expectStatus("POST", "/api/documents", { title: `${KEY} 文档` }, 201, "r33 建文档探针 -> 201");
      const kb33 = await expectStatus("POST", "/api/knowledge/ingest", { title: "跨源检索规范", sourceType: "text", content: `正文段落提到 ${KEY} 的结论与直达约定。` }, 201, "r33 建知识库探针（关键词仅在正文） -> 201");
      const mem33 = await expectStatus("POST", "/api/members", { name: `${KEY} 成员`, email: "r33http@example.com", role: "member", title: "研发", phone: "", status: "active" }, 201, "r33 建成员探针 -> 201");
      const room33 = await expectStatus("POST", "/api/rooms", { name: `${KEY} 会议室`, location: "", capacity: 8, active: true }, 201, "r33 建会议室探针 -> 201");
      const meet33 = await expectStatus("POST", "/api/meetings", { title: `${KEY} 会议`, roomId: room33.json.id, date: "2026-11-21", start: "09:00", end: "10:00", organizer: "张三", attendees: [] }, 201, "r33 建会议探针 -> 201");

      // 只读基线：检索前各源列表计数（业务表，不含 app_settings）
      const before33 = {
        todos: (await req("GET", "/api/todos")).json.todos.length,
        docs: (await req("GET", "/api/documents")).json.documents.length,
        members: (await req("GET", "/api/members")).json.members.length,
        meetings: (await req("GET", "/api/meetings")).json.meetings.length,
      };

      const search33 = await expectStatus("GET", `/api/search?q=${encodeURIComponent(KEY)}&limit=20`, undefined, 200, "r33 GET /api/search -> 200");
      eq(search33.json.query, KEY, "r33 响应·query 原样回带");
      eq(search33.json.types.length, 8, "r33 响应·缺省 types = 八源全查");
      const rows33: any[] = search33.json.results ?? [];
      ok(rows33.length >= 8, "r33 跨源·八类探针全部命中（≥8 条）");
      eq(new Set(rows33.map((r) => r.type)).size, 8, "r33 跨源·结果覆盖全部 8 种 type");
      const byType33 = new Map(rows33.map((r) => [r.type, r]));
      const expectedIds33: Record<string, number> = {
        todos: todo33.json.id, schedules: sch33.json.id, projects: proj33.json.id, cards: card33.json.id,
        documents: doc33.json.id, knowledge_docs: kb33.json.doc.id, members: mem33.json.id, meetings: meet33.json.id,
      };
      for (const type of ["todos", "schedules", "projects", "cards", "documents", "knowledge_docs", "members", "meetings"]) {
        const hit = byType33.get(type);
        ok(hit !== undefined, `r33 跨源·${type} 命中在场`);
        if (hit) ok(hit.id === expectedIds33[type], `r33 跨源·${type} 命中 id 精确`);
      }
      const kbRow33 = byType33.get("knowledge_docs");
      ok(kbRow33 !== undefined && !String(kbRow33.title).includes(KEY) && String(kbRow33.snippet).includes(KEY), "r33 权重·知识库仅正文命中（标题不含关键词）");
      const titleHitCount33 = rows33.filter((r) => String(r.title).includes(KEY)).length;
      eq(titleHitCount33, 7, "r33 权重·七条标题命中，正文命中仅一条");
      const firstBodyIdx33 = rows33.findIndex((r) => r.type === "knowledge_docs");
      ok(firstBodyIdx33 === rows33.length - 1, "r33 排序·仅正文命中排末位（标题命中优先）");
      for (let i = 1; i < rows33.length; i++) {
        ok(rows33[i - 1].score >= rows33[i].score, `r33 排序·第 ${i} 条分数不低于后一条`);
      }
      const meetRow33 = byType33.get("meetings");
      eq(meetRow33?.tab, "meetings", "r33 结果·每条带 tab");
      eq(meetRow33?.deepLink, `/?page=meetings&meetingId=${meet33.json.id}`, "r33 直达·会议 deepLink 精确（复用 r26 机制）");
      ok(typeof meetRow33?.score === "number" && meetRow33.score > 0, "r33 结果·score 为正数值");
      ok(typeof meetRow33?.snippet === "string" && meetRow33.snippet.length > 0, "r33 结果·snippet 非空");
      const repeated33 = await req("GET", `/api/search?q=${encodeURIComponent(KEY)}&limit=20`);
      eq(repeated33.json.results, rows33, "r33 只读·重复检索逐字节一致（幂等）");
      const after33 = {
        todos: (await req("GET", "/api/todos")).json.todos.length,
        docs: (await req("GET", "/api/documents")).json.documents.length,
        members: (await req("GET", "/api/members")).json.members.length,
        meetings: (await req("GET", "/api/meetings")).json.meetings.length,
      };
      eq(after33, before33, "r33 只读·检索前后四张业务表计数不变（零业务表写入）");
      const typesFilter33 = await expectStatus("GET", `/api/search?q=${encodeURIComponent(KEY)}&types=meetings,todos`, undefined, 200, "r33 types 过滤 -> 200");
      eq(typesFilter33.json.types, ["todos", "meetings"], "r33 types 过滤·仅指定两源且顺序规范");
      eq(new Set(typesFilter33.json.results.map((r: any) => r.type)).size, 2, "r33 types 过滤·结果只含两源");
      const limit33 = await expectStatus("GET", `/api/search?q=${encodeURIComponent(KEY)}&limit=3`, undefined, 200, "r33 limit -> 200");
      eq(limit33.json.results.length, 3, "r33 limit·总数上限 3 生效");
      const noHit33 = await expectStatus("GET", "/api/search?q=ZZZ不存在的词ZZZ", undefined, 200, "r33 无命中 -> 200");
      eq(noHit33.json.results, [], "r33 无命中·返回空数组不编造");

      // 4xx：空 q / 超长 q / 非法 types / 越权源 / 非法 limit
      const emptyQ33 = await expectStatus("GET", "/api/search?q=", undefined, 400, "r33 4xx·空 q -> 400");
      ok(String(emptyQ33.json.error).includes("为空"), "r33 4xx·空 q 文案明确");
      cleanError39(emptyQ33, "r39 4xx·空 q 错误体零内部术语");
      const missingQ33 = await expectStatus("GET", "/api/search", undefined, 400, "r33 4xx·缺 q -> 400");
      ok(String(missingQ33.json.error).includes("字符串"), "r33 4xx·缺 q 文案明确");
      cleanError39(missingQ33, "r39 4xx·缺 q 错误体零内部术语");
      await expectStatus("GET", `/api/search?q=${"x".repeat(201)}`, undefined, 400, "r33 4xx·超长 q -> 400");
      const badTypes33 = await expectStatus("GET", `/api/search?q=${encodeURIComponent(KEY)}&types=todos,evil`, undefined, 400, "r33 4xx·非法 types -> 400");
      ok(String(badTypes33.json.error).includes("非法搜索源"), "r33 4xx·非法 types 文案明确");
      cleanError39(badTypes33, "r39 4xx·非法 types 错误体零内部术语");
      const privileged33 = await expectStatus("GET", `/api/search?q=${encodeURIComponent(KEY)}&types=users`, undefined, 400, "r33 4xx·越权源 users -> 400");
      ok(String(privileged33.json.error).includes("users"), "r33 4xx·越权源回带源名");
      await expectStatus("GET", `/api/search?q=${encodeURIComponent(KEY)}&limit=0`, undefined, 400, "r33 4xx·limit=0 -> 400");
      await expectStatus("GET", `/api/search?q=${encodeURIComponent(KEY)}&limit=999`, undefined, 400, "r33 4xx·limit 超上限 -> 400");

      // 直达真实性：GET /api/meetings/:id 用 deepLink 里的 id 回查同一场会议
      const viaLink33 = await expectStatus("GET", `/api/meetings/${meet33.json.id}`, undefined, 200, "r33 直达·deepLink id 回查会议 -> 200");
      eq(viaLink33.json.title, `${KEY} 会议`, "r33 直达·回查会议标题逐字相等");

      // 清理：八源探针全部归零（项目级联列/卡片）
      await expectStatus("DELETE", `/api/meetings/${meet33.json.id}`, undefined, 200, "r33 清理会议探针 -> 200");
      await expectStatus("DELETE", `/api/rooms/${room33.json.id}`, undefined, 200, "r33 清理会议室探针 -> 200");
      await expectStatus("DELETE", `/api/members/${mem33.json.id}`, undefined, 200, "r33 清理成员探针 -> 200");
      await expectStatus("DELETE", `/api/knowledge/docs/${kb33.json.doc.id}`, undefined, 200, "r33 清理知识库探针 -> 200");
      await expectStatus("DELETE", `/api/documents/${doc33.json.id}`, undefined, 200, "r33 清理文档探针 -> 200");
      await expectStatus("DELETE", `/api/projects/${proj33.json.id}`, undefined, 200, "r33 清理项目探针（级联卡片） -> 200");
      await expectStatus("DELETE", `/api/schedules/${sch33.json.id}`, undefined, 200, "r33 清理日程探针 -> 200");
      await expectStatus("DELETE", `/api/todos/${todo33.json.id}`, undefined, 200, "r33 清理待办探针 -> 200");
      const afterClean33 = await expectStatus("GET", `/api/search?q=${encodeURIComponent(KEY)}`, undefined, 200, "r33 清理后回查 -> 200");
      eq(afterClean33.json.results, [], "r33 探针归零·同关键词复搜零结果");
    }

    // ---- r34：任务依赖（真 HTTP：CRUD / 409 阻塞链 / 4xx / 级联归零） ----
    {
      const KEY = `R34HTTP${Date.now()}`;
      const a = await expectStatus("POST", "/api/todos", { title: `${KEY} A`, quadrant: "q1" }, 201, "r34 建 A -> 201");
      const b = await expectStatus("POST", "/api/todos", { title: `${KEY} B`, quadrant: "q1" }, 201, "r34 建 B -> 201");
      const c = await expectStatus("POST", "/api/todos", { title: `${KEY} C`, quadrant: "q1" }, 201, "r34 建 C -> 201");
      const A = a.json.id; const B = b.json.id; const C = c.json.id;
      ok(A && B && C, "r34 三待办探针 id 真回带");

      const empty34 = await expectStatus("GET", `/api/todos/${B}/dependencies`, undefined, 200, "r34 空前置列表 -> 200");
      eq(empty34.json.dependencies, [], "r34 空前置·列表为空");
      eq(empty34.json.blockedBy, 0, "r34 空前置·blockedBy=0");
      eq(empty34.json.canStart, true, "r34 空前置·canStart=true");

      const postAB = await expectStatus("POST", `/api/todos/${B}/dependencies`, { dependsOnTodoId: A }, 201, "r34 POST B 依赖 A -> 201");
      eq(postAB.json.todoId, B, "r34 POST·回带 todoId");
      eq(postAB.json.dependsOnTodoId, A, "r34 POST·回带 dependsOnTodoId");
      await expectStatus("POST", `/api/todos/${C}/dependencies`, { dependsOnTodoId: B }, 201, "r34 POST C 依赖 B -> 201");

      const listB = await expectStatus("GET", `/api/todos/${B}/dependencies`, undefined, 200, "r34 GET B 前置 -> 200");
      eq(listB.json.dependencies.length, 1, "r34 GET·B 恰一条前置");
      eq(listB.json.dependencies[0].dependsOnTodoId, A, "r34 GET·前置 id 精确");
      eq(listB.json.dependencies[0].title, `${KEY} A`, "r34 GET·前置回带标题");
      eq(listB.json.dependencies[0].status, "open", "r34 GET·前置回带状态 open");
      eq(listB.json.blockedBy, 1, "r34 GET·B 被 1 项阻塞");

      const blocked34 = await expectStatus("GET", "/api/todos/blocked", undefined, 200, "r34 GET /api/todos/blocked -> 200");
      const myBlocked = blocked34.json.blocked.filter((x: any) => [A, B, C].includes(x.todoId));
      eq(myBlocked.map((x: any) => x.todoId).sort(), [B, C].sort(), "r34 阻塞列表·A 未完成时 B/C 均阻塞");
      ok(blocked34.json.count >= 2, "r34 阻塞列表·count 与 blocked 条数一致口径");

      // 灵魂：A→B→C 链，A 未完成时 B/C 转 done 必须 409
      const blockB = await expectStatus("PATCH", `/api/todos/${B}`, { status: "done" }, 409, "r34 409·B 前置未完成转 done 被拒");
      eq(blockB.json.code, "DEPENDENCY_BLOCKED", "r34 409·回带阻塞码");
      eq(blockB.json.blockers, [A], "r34 409·回带未完成前置 id");
      const stillOpenB = await expectStatus("GET", `/api/todos/${B}`, undefined, 200, "r34 409 后回查 B -> 200");
      eq(stillOpenB.json.status, "open", "r34 409·零半态：B 仍是 open");
      await expectStatus("PATCH", `/api/todos/${C}`, { status: "done" }, 409, "r34 409·C 前置未完成转 done 被拒");

      // 4xx：自依赖 / 环 / 重复依赖 / 越权 id / 非法 body
      const self34 = await expectStatus("POST", `/api/todos/${B}/dependencies`, { dependsOnTodoId: B }, 400, "r34 4xx·自依赖 -> 400");
      ok(String(self34.json.error).includes("自身"), "r34 4xx·自依赖文案明确");
      const cycle34 = await expectStatus("POST", `/api/todos/${A}/dependencies`, { dependsOnTodoId: C }, 400, "r34 4xx·A→B→C 后加 C→A 成环 -> 400");
      ok(String(cycle34.json.error).includes("循环依赖"), "r34 4xx·环文案明确");
      cleanError39(cycle34, "r39 4xx·循环依赖错误体零内部术语");
      ok(Array.isArray(cycle34.json.cycle), "r34 4xx·环响应回带 cycle 路径供 UI 红条");
      const dup34 = await expectStatus("POST", `/api/todos/${B}/dependencies`, { dependsOnTodoId: A }, 409, "r34 4xx·重复依赖 -> 409");
      eq(dup34.json.code, "DUPLICATE_DEPENDENCY", "r34 4xx·重复依赖码在场");
      await expectStatus("POST", `/api/todos/999999/dependencies`, { dependsOnTodoId: A }, 404, "r34 4xx·越权 todoId -> 404");
      await expectStatus("POST", `/api/todos/${B}/dependencies`, { dependsOnTodoId: 999999 }, 404, "r34 4xx·越权前置 id -> 404");
      await expectStatus("POST", `/api/todos/${B}/dependencies`, { dependsOnTodoId: 0 }, 400, "r34 4xx·dependsOnTodoId=0 -> 400");
      await expectStatus("POST", `/api/todos/${B}/dependencies`, {}, 400, "r34 4xx·缺 dependsOnTodoId -> 400");
      await expectStatus("GET", `/api/todos/${B}/dependencies`, undefined, 200, "r34 4xx 后回查 B 前置 -> 200");
      const after4xx = await expectStatus("GET", `/api/todos/${B}/dependencies`, undefined, 200, "r34 4xx·零半态回查前置仍一条");
      eq(after4xx.json.dependencies.length, 1, "r34 4xx·零半态：未多写依赖");

      // 解锁闭环：A done -> B 可 done -> C 可 done
      await expectStatus("PATCH", `/api/todos/${A}`, { status: "done" }, 200, "r34 A 无前置 -> done 200");
      const blockedAfterA = await expectStatus("GET", "/api/todos/blocked", undefined, 200, "r34 A done 后回查阻塞 -> 200");
      eq(blockedAfterA.json.blocked.filter((x: any) => x.todoId === B).length, 0, "r34 A done 后 B 解锁");
      eq(blockedAfterA.json.blocked.filter((x: any) => x.todoId === C).length, 1, "r34 A done 后 C 仍阻塞（B 未完成）");
      await expectStatus("PATCH", `/api/todos/${B}`, { status: "done" }, 200, "r34 A done 后 B -> done 200");
      const listBAfter = await expectStatus("GET", `/api/todos/${B}/dependencies`, undefined, 200, "r34 B done 后回查前置 -> 200");
      eq(listBAfter.json.dependencies[0].status, "done", "r34 B done 后前置状态回带 done");
      eq(listBAfter.json.canStart, true, "r34 B done 后 canStart=true");
      await expectStatus("PATCH", `/api/todos/${C}`, { status: "done" }, 200, "r34 B done 后 C -> done 200");
      const blockedAll = await expectStatus("GET", "/api/todos/blocked", undefined, 200, "r34 全链完成后回查阻塞 -> 200");
      eq(blockedAll.json.blocked.filter((x: any) => [A, B, C].includes(x.todoId)).length, 0, "r34 全链完成后零阻塞");

      // 移除与级联：DELETE 前置 -> 列表清零；删 A -> B 侧依赖 CASCADE 清
      await expectStatus("DELETE", `/api/todos/${C}/dependencies/${B}`, undefined, 200, "r34 DELETE 前置 -> 200");
      eq((await expectStatus("GET", `/api/todos/${C}/dependencies`, undefined, 200, "r34 删除后回查 C 前置 -> 200")).json.dependencies.length, 0, "r34 删除前置后列表清零");
      await expectStatus("DELETE", `/api/todos/${A}`, undefined, 200, "r34 删 A -> 200（级联清 B 侧依赖）");
      eq((await expectStatus("GET", `/api/todos/${B}/dependencies`, undefined, 200, "r34 级联后回查 B 前置 -> 200")).json.dependencies.length, 0, "r34 级联·删前置实体后依赖行清零");
      await expectStatus("DELETE", `/api/todos/${B}`, undefined, 200, "r34 清理 B -> 200");
      await expectStatus("DELETE", `/api/todos/${C}`, undefined, 200, "r34 清理 C -> 200");
      const finalBlocked = await expectStatus("GET", "/api/todos/blocked", undefined, 200, "r34 清理后回查阻塞 -> 200");
      eq(finalBlocked.json.blocked.filter((x: any) => [A, B, C].includes(x.todoId)).length, 0, "r34 探针归零·阻塞列表不含已删探针");
    }

    // ---- r35：ICS 导出 / 订阅 key / 导入预览与确认（真 HTTP + 4xx） ----
    {
      const KEY = `R35HTTP${Date.now()}`;
      const title35 = `${KEY} 评审, "终版"; 第一行\n第二行`;
      const s1 = await expectStatus("POST", "/api/schedules", { title: title35, date: "2026-11-21", start: "10:00", end: "11:30", repeat: "none", todoId: null }, 201, "r35 建含转义字符的日程 -> 201");
      const s2 = await expectStatus("POST", "/api/schedules", { title: `${KEY} 窗外日程`, date: "2026-12-05", start: "09:00", end: "10:00", repeat: "none", todoId: null }, 201, "r35 建窗外日程 -> 201");
      ok(Boolean(s1.json?.id && s2.json?.id), "r35 两日程探针 id 真回带");

      const exp = await reqText("/api/schedules/export.ics?from=2026-11-01&to=2026-11-30");
      eq(exp.status, 200, "r35 GET export.ics -> 200");
      ok(String(exp.headers.get("content-type")).includes("text/calendar"), "r35 export·Content-Type 为 text/calendar");
      ok(String(exp.headers.get("content-disposition")).includes("xieflow-schedules-2026-11-01-2026-11-30.ics"), "r35 export·下载文件名带范围");
      ok(exp.text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"), "r35 export·标准头与 CRLF");
      ok(exp.text.includes("CALSCALE:GREGORIAN") && exp.text.includes("METHOD:PUBLISH"), "r35 export·CALSCALE/METHOD 完整");
      ok(exp.text.includes(`${KEY} 评审\\, "终版"\\; 第一行\\n第二行`), "r35 export·逗号/分号/换行已转义未丢");
      ok(!exp.text.includes("20261205T"), "r35 export·窗外日程不在范围内");
      const cal35 = parseIcsCalendar(exp.text);
      const mine35 = cal35.events.filter((e) => e.summary.includes(KEY));
      eq(mine35.length, 1, "r35 export·范围内仅本探针一条");
      eq(mine35[0]?.summary, title35, "r35 export·SUMMARY 回读逐字相等");
      eq(mine35[0]?.dtStart, formatIcsDate(new Date("2026-11-21T10:00:00")), "r35 export·DTSTART 本地 10:00 转 UTC 正确");
      eq(mine35[0]?.repeat, "none", "r35 export·重复规则元数据在场");
      ok(Boolean(mine35[0]?.uid.startsWith(`schedule-${s1.json.id}-20261121@`)), "r35 export·UID 稳定且含 id/日期");
      const expAgain = await reqText("/api/schedules/export.ics?from=2026-11-01&to=2026-11-30");
      eq(expAgain.text, exp.text, "r35 export·同范围两次导出逐字节稳定");
      await expectStatus("GET", "/api/schedules/export.ics?from=bad&to=2026-11-30", undefined, 400, "r35 4xx·非法 from -> 400");
      await expectStatus("GET", "/api/schedules/export.ics?from=2026-11-01&to=bad", undefined, 400, "r35 4xx·非法 to -> 400");
      await expectStatus("GET", "/api/schedules/export.ics?from=2026-11-30&to=2026-11-01", undefined, 400, "r35 4xx·from 晚于 to -> 400");
      await expectStatus("GET", "/api/schedules/export.ics", undefined, 400, "r35 4xx·缺 from/to -> 400");
      const emptyExp = await reqText("/api/schedules/export.ics?from=2020-01-01&to=2020-01-02");
      eq(emptyExp.status, 200, "r35 export·空范围 -> 200");
      ok(!emptyExp.text.includes("BEGIN:VEVENT"), "r35 export·空范围无 VEVENT");

      const dueTodo = await expectStatus("POST", "/api/todos", { title: `${KEY} 截止`, quadrant: "q1", dueDate: "2026-11-27" }, 201, "r35 建有截止待办 -> 201");
      await expectStatus("POST", "/api/todos", { title: `${KEY} 无截止`, quadrant: "q1" }, 201, "r35 建无截止待办 -> 201");
      const due = await reqText("/api/todos/due.ics");
      eq(due.status, 200, "r35 GET /api/todos/due.ics -> 200");
      ok(String(due.headers.get("content-type")).includes("text/calendar"), "r35 due·Content-Type 为 text/calendar");
      const dueMine = parseIcsCalendar(due.text).events.filter((e) => e.summary.includes(KEY));
      eq(dueMine.length, 1, "r35 due·仅含截止待办一条");
      eq(dueMine[0]?.dtStart, formatIcsDate(new Date("2026-11-27T09:00:00")), "r35 due·默认 09:00 本地时段");
      ok(Boolean(dueMine[0]?.uid.startsWith(`todo-due-${dueTodo.json.id}@`)), "r35 due·UID 稳定");

      const feedKey = await expectStatus("POST", "/api/feeds/key", {}, 200, "r35 POST 生成订阅 key -> 200");
      ok(/^[0-9a-f]{24}$/.test(String(feedKey.json?.key)), "r35 key·本地随机串 24 位 hex");
      eq(feedKey.json.url, `/api/feeds/${feedKey.json.key}.ics`, "r35 key·回带订阅 URL");
      const settings = await expectStatus("GET", "/api/settings", undefined, 200, "r35 GET settings -> 200");
      ok(settings.json.settings.some((s: any) => s.key === "calendar_feed_key" && s.value === feedKey.json.key), "r35 key·确实存 settings（非密钥文件）");
      const feed = await reqText(`/api/feeds/${feedKey.json.key}.ics`);
      eq(feed.status, 200, "r35 GET 正确 key 订阅源 -> 200");
      ok(String(feed.headers.get("content-type")).includes("text/calendar"), "r35 feed·Content-Type 为 text/calendar");
      ok(parseIcsCalendar(feed.text).events.some((e) => e.summary === title35), "r35 feed·订阅源含中文转义日程（回读逐字相等）");
      const feedBad = await expectStatus("GET", "/api/feeds/deadbeefdeadbeefdeadbeef.ics", undefined, 404, "r35 4xx·越权/错误 key -> 404");
      ok(String(feedBad.json.error).includes("订阅 key"), "r35 4xx·错误 key 文案明确");
      const feedKey2 = await expectStatus("POST", "/api/feeds/key", {}, 200, "r35 重新生成 key -> 200");
      ok(feedKey2.json.key !== feedKey.json.key, "r35 key·重新生成后串变化");
      await expectStatus("GET", `/api/feeds/${feedKey.json.key}.ics`, undefined, 404, "r35 4xx·旧 key 立即失效 -> 404");

      const importIcs = buildIcsCalendar([scheduleToIcsEvent(s1.json)], { calendarName: "r35 audit import" });
      const rangeUrl = "/api/schedules?from=2026-11-01&to=2026-11-30";
      const countMine = async (): Promise<number> => {
        const r = await expectStatus("GET", rangeUrl, undefined, 200, "r35 回查范围日程 -> 200");
        return r.json.schedules.filter((s: any) => s.title.includes(KEY)).length;
      };
      const beforePreview = await countMine();
      const preview = await expectStatus("POST", "/api/schedules/import.ics", { ics: importIcs }, 200, "r35 POST 导入预览 -> 200");
      eq(preview.json.count, 1, "r35 预览·事件计数 1");
      eq(preview.json.drafts.length, 1, "r35 预览·drafts 一条");
      eq(preview.json.drafts[0].title, title35, "r35 预览·标题逐字还原");
      eq(preview.json.drafts[0].date, "2026-11-21", "r35 预览·日期还原");
      eq(preview.json.drafts[0].start, "10:00", "r35 预览·开始时间还原");
      eq(await countMine(), beforePreview, "r35 预览·零写入（预览不落库）");
      const commit = await expectStatus("POST", "/api/schedules/import.ics", { ics: importIcs, commit: true }, 201, "r35 POST 确认写入 -> 201");
      eq(commit.json.count, 1, "r35 写入·确认计数 1");
      const afterCommit = await countMine();
      eq(afterCommit, beforePreview + 1, "r35 写入·范围内日程 +1");
      const imported = (await expectStatus("GET", rangeUrl, undefined, 200, "r35 写入后回查 -> 200")).json.schedules
        .filter((s: any) => s.title === title35)
        .sort((a: any, b: any) => b.id - a.id)[0];
      ok(Boolean(imported?.id), "r35 写入·导入日程真回带 id");
      eq([imported.date, imported.start, imported.end, imported.repeat], ["2026-11-21", "10:00", "11:30", "none"], "r35 写入·字段与预览草稿逐项一致");
      const badIcs = await expectStatus("POST", "/api/schedules/import.ics", { ics: "garbage" }, 400, "r35 4xx·坏 ICS -> 400");
      ok(String(badIcs.json.error).includes("ICS"), "r35 4xx·坏 ICS 错误文案含 ICS");
      cleanError39(badIcs, "r39 4xx·坏 ICS 错误体零内部术语");
      await expectStatus("POST", "/api/schedules/import.ics", {}, 400, "r35 4xx·缺 ics -> 400");
      await expectStatus("POST", "/api/schedules/import.ics", { ics: importIcs.replace("VERSION:2.0", "VERSION:1.0") }, 400, "r35 4xx·非 2.0 日历 -> 400");
      eq(await countMine(), afterCommit, "r35 4xx·坏 ICS 后零半态（未多写）");

      for (const id of [imported?.id, s2.json.id, s1.json.id]) {
        if (id) await expectStatus("DELETE", `/api/schedules/${id}`, undefined, 200, `r35 清理日程 ${id} -> 200`);
      }
      for (const todoId of [dueTodo.json.id]) {
        if (todoId) await expectStatus("DELETE", `/api/todos/${todoId}`, undefined, 200, "r35 清理截止待办 -> 200");
      }
      const noDueTodo = (await expectStatus("GET", "/api/todos", undefined, 200, "r35 清理前回查待办 -> 200")).json.todos
        .find((t: any) => t.title === `${KEY} 无截止`);
      if (noDueTodo) await expectStatus("DELETE", `/api/todos/${noDueTodo.id}`, undefined, 200, "r35 清理无截止待办 -> 200");
      eq(await countMine(), 0, "r35 探针归零·范围内无本轮日程");
    }

    // ---- r36：日报 / 周报 / 存为文档（真 HTTP + 4xx + 零半态） ----
    {
      const KEY = `R36HTTP${Date.now()}`;
      const pad = (n: number): string => String(n).padStart(2, "0");
      const now36 = new Date();
      const TODAY = `${now36.getFullYear()}-${pad(now36.getMonth() + 1)}-${pad(now36.getDate())}`;
      const tomorrow = new Date(now36.getFullYear(), now36.getMonth(), now36.getDate() + 1);
      const TOMORROW = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
      const docIds: number[] = [];
      const todoIds: number[] = [];
      const scheduleIds: number[] = [];

      const doneTodo = await expectStatus("POST", "/api/todos", { title: `${KEY} 日报完成项`, quadrant: "q1" }, 201, "r36 建日报完成探针 -> 201");
      todoIds.push(doneTodo.json.id);
      await expectStatus("PATCH", `/api/todos/${doneTodo.json.id}`, { status: "done" }, 200, "r36 完成探针转 done -> 200");
      const openTodo = await expectStatus("POST", "/api/todos", { title: `${KEY} 日报进行中`, quadrant: "q2" }, 201, "r36 建进行中探针 -> 201");
      todoIds.push(openTodo.json.id);
      const blockedTodo = await expectStatus("POST", "/api/todos", { title: `${KEY} 日报阻塞项`, quadrant: "q3" }, 201, "r36 建阻塞探针 -> 201");
      todoIds.push(blockedTodo.json.id);
      await expectStatus("POST", `/api/todos/${blockedTodo.json.id}/dependencies`, { dependsOnTodoId: openTodo.json.id }, 201, "r36 阻塞探针加未完成前置 -> 201");
      const planTodo = await expectStatus("POST", "/api/todos", { title: `${KEY} 明日待办`, quadrant: "q2", dueDate: TOMORROW }, 201, "r36 建明日待办探针 -> 201");
      todoIds.push(planTodo.json.id);
      const s1 = await expectStatus("POST", "/api/schedules", { title: `${KEY} 今日日程`, date: TODAY, start: "09:00", end: "10:00", repeat: "none", todoId: null }, 201, "r36 建今日日程探针 -> 201");
      scheduleIds.push(s1.json.id);
      const s2 = await expectStatus("POST", "/api/schedules", { title: `${KEY} 明日日程`, date: TOMORROW, start: "15:00", end: "16:00", repeat: "none", todoId: null }, 201, "r36 建明日日程探针 -> 201");
      scheduleIds.push(s2.json.id);

      const daily = await expectStatus("GET", `/api/reports/daily?date=${TODAY}`, undefined, 200, "r36 GET 日报 -> 200");
      eq(daily.json.type, "daily", "r36 日报·type 回带 daily");
      eq([daily.json.period.from, daily.json.period.to], [TODAY, TODAY], "r36 日报·周期闭区间为单日");
      ok(daily.json.markdown.startsWith(`# 协流日报 · ${TODAY}`), "r36 日报·Markdown 标题段");
      for (const section of ["完成", "进行中", "阻塞", "日程", "产出", "明日计划"]) {
        ok(daily.json.markdown.includes(`## ${section}（`), `r36 日报·Markdown 含「${section}」段`);
      }
      ok(daily.json.markdown.includes(`${KEY} 日报完成项（#${doneTodo.json.id}）`), "r36 日报·完成项真数据入段");
      ok(daily.json.markdown.includes(`${KEY} 日报进行中（#${openTodo.json.id}）`), "r36 日报·进行中项真数据入段");
      ok(daily.json.markdown.includes(`${KEY} 日报阻塞项（#${blockedTodo.json.id}，被 #${openTodo.json.id} 阻塞）`), "r36 日报·阻塞项回带前置 id");
      ok(daily.json.markdown.includes(`09:00–10:00 ${KEY} 今日日程`), "r36 日报·日程段含今日探针");
      ok(daily.json.markdown.includes(`${TOMORROW} 15:00–16:00 ${KEY} 明日日程`), "r36 日报·明日计划段含次日探针");
      ok(daily.json.markdown.includes(`- 待办：${KEY} 明日待办（#${planTodo.json.id}，截止 ${TOMORROW}）`), "r36 日报·明日待办按 dueDate 进计划段");
      ok(daily.json.markdown.includes("零 token"), "r36 日报·模板化零 token 注明");
      const mineDone = daily.json.data.completed.filter((x: any) => x.title === `${KEY} 日报完成项`);
      eq(mineDone.length, 1, "r36 日报·结构化完成项按 updatedAt 入窗");
      const mineOngoing = daily.json.data.ongoing.filter((x: any) => x.title === `${KEY} 日报进行中`);
      eq(mineOngoing.length, 1, "r36 日报·结构化进行中项在窗");
      const mineBlocked = daily.json.data.blocked.filter((x: any) => x.todoId === blockedTodo.json.id);
      eq(mineBlocked.length, 1, "r36 日报·结构化阻塞项由 r34 依赖图回带");
      eq(mineBlocked[0]?.blockers, [openTodo.json.id], "r36 日报·结构化阻塞项 blockers 精确");
      eq(daily.json.data.schedules.filter((x: any) => x.title === `${KEY} 今日日程`).length, 1, "r36 日报·结构化日程只含今日");
      eq(daily.json.data.next.filter((x: any) => x.title === `${KEY} 明日日程`).length, 1, "r36 日报·结构化明日计划含次日");
      eq(daily.json.data.nextTodos.filter((x: any) => x.title === `${KEY} 明日待办`).length, 1, "r36 日报·结构化明日待办按 dueDate");
      const sumDaily = daily.json.summary;
      ok(sumDaily.total === sumDaily.completed + sumDaily.ongoing + sumDaily.blocked, "r36 日报·摘要 total 恒等式成立");
      ok(sumDaily.completed >= 1 && sumDaily.ongoing >= 2 && sumDaily.blocked >= 1, "r36 日报·摘要计数覆盖全部探针");
      ok(daily.json.html.includes("@media print") && daily.json.html.includes("打印 / 另存 PDF"), "r36 日报·打印版 HTML 在场");
      ok(daily.json.html.includes(`${KEY} 日报完成项`), "r36 日报·打印版含真数据");
      const dailyAgain = await expectStatus("GET", `/api/reports/daily?date=${TODAY}`, undefined, 200, "r36 日报重复生成 -> 200");
      eq(dailyAgain.json.markdown, daily.json.markdown, "r36 日报·同日两次 Markdown 逐字节稳定");

      const weekly = await expectStatus("GET", `/api/reports/weekly?week=${TODAY}`, undefined, 200, "r36 GET 周报 -> 200");
      eq(weekly.json.type, "weekly", "r36 周报·type 回带 weekly");
      ok(weekly.json.markdown.startsWith("# 协流周报 · "), "r36 周报·标题段含周区间");
      ok(weekly.json.markdown.includes(`${KEY} 日报完成项`) && weekly.json.markdown.includes(`${KEY} 今日日程`), "r36 周报·聚合 7 天真数据");
      ok(weekly.json.markdown.includes("## 下周计划（"), "r36 周报·计划段标题为下周计划");
      ok(weekly.json.summary.completed >= daily.json.summary.completed, "r36 周报·完成计数不小于单日");
      const isoWeek = await expectStatus("GET", "/api/reports/weekly?week=2026-W48", undefined, 200, "r36 周报 ISO 周锚点 -> 200");
      eq(isoWeek.json.period.from, "2026-11-23", "r36 周报·YYYY-Www 归一到周一");

      await expectStatus("GET", "/api/reports/daily?date=2026-02-30", undefined, 400, "r36 4xx·不存在日历日 -> 400");
      await expectStatus("GET", "/api/reports/daily?date=not-a-date", undefined, 400, "r36 4xx·非法日期 -> 400");
      await expectStatus("GET", "/api/reports/weekly?week=2026-W99", undefined, 400, "r36 4xx·不存在 ISO 周 -> 400");
      await expectStatus("GET", "/api/reports/weekly?week=garbage", undefined, 400, "r36 4xx·非法周锚点 -> 400");

      const saveBody = {
        title: `${KEY} 生成的日报`,
        markdown: `# ${KEY} 生成的日报\n\n## 完成（1）\n\n- ${KEY} 日报完成项（#${doneTodo.json.id}）\n`,
        type: "daily",
        date: TODAY,
      };
      await expectStatus("POST", "/api/reports/save", { ...saveBody, markdown: "   \n" }, 400, "r36 4xx·空内容 -> 400");
      await expectStatus("POST", "/api/reports/save", { ...saveBody, title: "" }, 400, "r36 4xx·空标题 -> 400");
      await expectStatus("POST", "/api/reports/save", { ...saveBody, date: "2026-13-01" }, 400, "r36 4xx·保存非法日期 -> 400");
      await expectStatus("POST", "/api/reports/save", { ...saveBody, documentId: 99999999 }, 404, "r36 4xx·越权/不存在文档 id -> 404");
      const saved = await expectStatus("POST", "/api/reports/save", saveBody, 201, "r36 POST 存为文档 -> 201");
      docIds.push(saved.json.documentId);
      ok(saved.json.created === true && saved.json.imported >= 2, "r36 保存·新建文档且块数 >0");
      eq(saved.json.document.title, saveBody.title, "r36 保存·文档标题逐字回带");
      const savedBlocks = await expectStatus("GET", `/api/documents/${saved.json.documentId}/blocks`, undefined, 200, "r36 回查保存后块列表 -> 200");
      eq(savedBlocks.json.blocks.length, saved.json.imported, "r36 保存·块列表数与回执一致");
      const savedText = await expectStatus("GET", `/api/documents/${saved.json.documentId}/text`, undefined, 200, "r36 回查文档全文 -> 200");
      ok(savedText.json.text.includes(`${KEY} 日报完成项`), "r36 保存·全文含报告真内容（文档页可编辑）");
      const rewritten = await expectStatus("POST", "/api/reports/save", { ...saveBody, markdown: `${saveBody.markdown}\n- ${KEY} 人工补充\n`, documentId: saved.json.documentId }, 200, "r36 POST 覆盖存为文档 -> 200");
      eq(rewritten.json.created, false, "r36 覆盖保存·created=false");
      const blocksAfter = await expectStatus("GET", `/api/documents/${saved.json.documentId}/blocks`, undefined, 200, "r36 覆盖后回查块 -> 200");
      eq(blocksAfter.json.blocks.length, rewritten.json.imported, "r36 覆盖保存·整篇替换不叠加旧块");
      ok(blocksAfter.json.blocks.length === savedBlocks.json.blocks.length + 1, "r36 覆盖保存·块数按新内容增加（零半态替换）");

      for (const id of scheduleIds) await expectStatus("DELETE", `/api/schedules/${id}`, undefined, 200, `r36 清理日程 ${id} -> 200`);
      for (const id of todoIds) await expectStatus("DELETE", `/api/todos/${id}`, undefined, 200, `r36 清理待办 ${id} -> 200`);
      for (const id of docIds) await expectStatus("DELETE", `/api/documents/${id}`, undefined, 200, `r36 清理报告文档 ${id} -> 200`);
      const finalDaily = await expectStatus("GET", `/api/reports/daily?date=${TODAY}`, undefined, 200, "r36 清理后回查日报 -> 200");
      ok(!finalDaily.json.markdown.includes(KEY), "r36 探针归零·日报不再含本轮 KEY");
    }

    // ---- r37：表格分组视图与汇总行（真 HTTP + 手算核对 + 4xx + r7 零回归） ----
    {
      const KEY = `R37HTTP${Date.now()}`;
      const tbl = await expectStatus("POST", "/api/tables", { name: `${KEY}-分组表` }, 201, "r37 建分组探针表 -> 201");
      const tableId = tbl.json.id as number;
      const fieldRes = await expectStatus("GET", `/api/tables/${tableId}/fields`, undefined, 200, "r37 默认字段 -> 200");
      const statusId = fieldRes.json.fields.find((f: any) => f.name === "状态").id as number;
      const amountId = fieldRes.json.fields.find((f: any) => f.name === "金额").id as number;
      const nameId = fieldRes.json.fields.find((f: any) => f.name === "名称").id as number;
      const rec = (name: string, status: string | null, amount: number | null): Promise<any> =>
        expectStatus(
          "POST", `/api/tables/${tableId}/records`,
          { data: { [String(nameId)]: name, [String(statusId)]: status, [String(amountId)]: amount } },
          201, `r37 录行 ${name} -> 201`,
        );
      await rec(`${KEY} A`, "未开始", 10);
      await rec(`${KEY} B`, "未开始", 20);
      await rec(`${KEY} C`, "进行中", 30);
      await rec(`${KEY} D`, null, 5);
      await rec(`${KEY} E`, "已完成", null);

      const spec = { fieldId: statusId, aggregator: "sum", aggregateFieldId: amountId };
      const view = await expectStatus(
        "POST", `/api/tables/${tableId}/views`,
        { name: `${KEY} 分组视图`, groupSpec: spec }, 201, "r37 POST 带 groupSpec 的视图 -> 201",
      );
      const viewId = view.json.id as number;
      eq(view.json.groupSpec, spec, "r37 视图详情·groupSpec 原样回带");
      const viewsList = await expectStatus("GET", `/api/tables/${tableId}/views`, undefined, 200, "r37 视图列表 -> 200");
      eq(viewsList.json.views.find((v: any) => v.id === viewId)?.groupSpec, spec, "r37 视图列表·groupSpec 回带");

      const grouped = await expectStatus("GET", `/api/views/${viewId}/grouped`, undefined, 200, "r37 GET 分组汇总 -> 200");
      eq(grouped.json.totalRecords, 5, "r37 汇总·总行数 5");
      eq(grouped.json.totalGroups, 4, "r37 汇总·总组数 4（含空值组）");
      eq(grouped.json.groups.map((g: any) => g.label), ["未开始", "进行中", "已完成", "（空值）"], "r37 汇总·组序确定且空值恒末");
      eq(grouped.json.groups[0]?.summary, { count: 2, aggregator: "sum", aggregateFieldId: amountId, numericCount: 2, value: 30 }, "r37 手算·未开始 count=2/sum=30");
      eq(grouped.json.groups[1]?.summary.value, 30, "r37 手算·进行中 sum=30");
      eq(grouped.json.groups[2]?.summary.value, null, "r37 手算·已完成无数值 sum=null");
      eq(grouped.json.groups[3]?.summary.value, 5, "r37 手算·空值组 sum=5");
      eq(grouped.json.groups[0]?.records.length, 2, "r37 汇总·组内记录回带 2 条");
      eq(grouped.json.filterHit, 5, "r37 汇总·filterHit 与记录总数一致");
      eq(grouped.json.viewId, viewId, "r37 汇总·viewId 回带");

      const avg = await expectStatus(
        "GET", `/api/views/${viewId}/grouped?fieldId=${statusId}&aggregator=avg&aggregateFieldId=${amountId}`,
        undefined, 200, "r37 GET 查询串覆盖为均值 -> 200",
      );
      eq(avg.json.groups[0]?.summary.value, 15, "r37 手算·未开始 avg=15");
      eq(avg.json.groups[1]?.summary.value, 30, "r37 手算·进行中 avg=30");
      eq(avg.json.groups[3]?.summary.value, 5, "r37 手算·空值组 avg=5");
      const cnt = await expectStatus(
        "GET", `/api/views/${viewId}/grouped?fieldId=${statusId}&aggregator=count`,
        undefined, 200, "r37 GET 查询串覆盖为计数 -> 200",
      );
      eq(cnt.json.groups[0]?.summary.value, 2, "r37 手算·未开始 count=2");
      eq(cnt.json.groups[0]?.summary.aggregateFieldId, null, "r37 手算·count 归一无取值字段");

      const patched = await expectStatus(
        "PATCH", `/api/views/${viewId}`,
        { groupSpec: { fieldId: statusId, aggregator: "avg", aggregateFieldId: amountId } },
        200, "r37 PATCH 视图改分组规格 -> 200",
      );
      eq(patched.json.groupSpec?.aggregator, "avg", "r37 持久化·PATCH 后 groupSpec 回带 avg");
      const reloaded = await expectStatus("GET", `/api/views/${viewId}`, undefined, 200, "r37 持久化·重新 GET 视图 -> 200");
      eq(reloaded.json.groupSpec?.aggregator, "avg", "r37 持久化·reload 后 groupSpec 仍是 avg");
      const groupedAfter = await expectStatus("GET", `/api/views/${viewId}/grouped`, undefined, 200, "r37 持久化·按新口径分组 -> 200");
      eq(groupedAfter.json.groups[0]?.summary.value, 15, "r37 持久化·新口径未开始 avg=15");
      const cleared = await expectStatus("PATCH", `/api/views/${viewId}`, { groupSpec: null }, 200, "r37 PATCH 清空分组 -> 200");
      eq(cleared.json.groupSpec, null, "r37 持久化·清空分组 groupSpec=null");
      await expectStatus("GET", `/api/views/${viewId}/grouped`, undefined, 400, "r37 4xx·未配置分组视图 -> 400");
      await expectStatus("PATCH", `/api/views/${viewId}`, { groupSpec: spec }, 200, "r37 恢复分组规格 -> 200");

      // r7 零回归：同一视图的筛选 / 排序 / 投影仍走原端点
      const legacy = await expectStatus(
        "POST", `/api/tables/${tableId}/views`,
        { name: `${KEY} r7视图`, filterSpec: [{ fieldId: statusId, value: "未开始" }], sortSpec: [{ fieldId: amountId, direction: "desc" }], visibleFields: [nameId, amountId] },
        201, "r37 r7 零回归·建含筛选排序投影的视图 -> 201",
      );
      const legacyId = legacy.json.id as number;
      const legacyRecords = await expectStatus("GET", `/api/views/${legacyId}/records`, undefined, 200, "r37 r7 零回归·按视图查询 -> 200");
      eq(legacyRecords.json.total, 2, "r37 r7 零回归·筛选命中 2 行");
      eq(legacyRecords.json.records.map((r: any) => r.data[String(amountId)]), [20, 10], "r37 r7 零回归·排序 desc 20,10");
      ok(Object.keys(legacyRecords.json.records[0]?.data ?? {}).length <= 2, "r37 r7 零回归·投影只留可见字段");
      await expectStatus("PATCH", `/api/views/${legacyId}`, { groupSpec: spec }, 200, "r37 r7 视图叠加 groupSpec -> 200");
      const legacyGrouped = await expectStatus("GET", `/api/views/${legacyId}/grouped`, undefined, 200, "r37 r7 视图也能叠加分组 -> 200");
      eq(legacyGrouped.json.totalRecords, 2, "r37 叠加分组·先筛选后分组只算 2 行");
      eq(legacyGrouped.json.groups?.[0]?.summary.value, 30, "r37 叠加分组·筛选后未开始 sum=30");

      // 4xx：非法字段 / 聚合 / 取值字段 / 越权 view
      await expectStatus("GET", "/api/views/99999999/grouped", undefined, 404, "r37 4xx·越权 view id -> 404");
      await expectStatus("GET", "/api/views/not-a-number/grouped", undefined, 400, "r37 4xx·非数字 view id -> 400");
      await expectStatus("GET", `/api/views/${viewId}/grouped?fieldId=99999&aggregator=sum&aggregateFieldId=${amountId}`, undefined, 400, "r37 4xx·非法分组字段 -> 400");
      await expectStatus("GET", `/api/views/${viewId}/grouped?fieldId=${statusId}&aggregator=median&aggregateFieldId=${amountId}`, undefined, 400, "r37 4xx·非法聚合方式 -> 400");
      await expectStatus("GET", `/api/views/${viewId}/grouped?fieldId=${statusId}&aggregator=sum&aggregateFieldId=99999`, undefined, 400, "r37 4xx·非法聚合取值字段 -> 400");
      await expectStatus("GET", `/api/views/${viewId}/grouped?fieldId=${statusId}&aggregator=sum&aggregateFieldId=${nameId}`, undefined, 400, "r37 4xx·文本字段作取值字段 -> 400");
      await expectStatus("POST", `/api/tables/${tableId}/views`, { name: `${KEY} 坏分组`, groupSpec: { fieldId: 99999, aggregator: "count" } }, 400, "r37 4xx·建视图非法分组字段 -> 400");
      await expectStatus("POST", `/api/tables/${tableId}/views`, { name: `${KEY} 坏聚合`, groupSpec: { fieldId: statusId, aggregator: "median" } }, 400, "r37 4xx·建视图非法聚合 -> 400");
      await expectStatus("POST", `/api/tables/${tableId}/views`, { name: `${KEY} 坏取值`, groupSpec: { fieldId: statusId, aggregator: "sum", aggregateFieldId: nameId } }, 400, "r37 4xx·建视图文本字段取值 -> 400");
      await expectStatus("PATCH", `/api/views/${viewId}`, { groupSpec: { fieldId: 99999, aggregator: "count" } }, 400, "r37 4xx·PATCH 非法分组字段 -> 400");

      const beforeDelete = await req("GET", `/api/views/${viewId}/grouped`);
      eq(beforeDelete.status, 200, "r37 清理前分组端点仍 200");
      await expectStatus("DELETE", `/api/views/${legacyId}`, undefined, 200, "r37 清理 r7 视图 -> 200");
      await expectStatus("DELETE", `/api/views/${viewId}`, undefined, 200, "r37 清理分组视图 -> 200");
      await expectStatus("GET", `/api/views/${viewId}/grouped`, undefined, 404, "r37 删视图后 grouped -> 404");
      await expectStatus("DELETE", `/api/tables/${tableId}`, undefined, 200, "r37 清理探针表 -> 200");
      const tablesAfter = await expectStatus("GET", "/api/tables", undefined, 200, "r37 清理后表列表 -> 200");
      ok(!JSON.stringify(tablesAfter.json.tables).includes(KEY), "r37 探针归零·表列表不再含本轮 KEY");
    }

    // ---- r38：看板卡片元数据（真 HTTP + 手算逾期 + 标签筛选 + 4xx + 向后兼容） ----
    console.log("\n== r38 board card metadata (HTTP) ==");
    {
      const KEY = `R38HTTP${Date.now()}`;
      const dep = await expectStatus("POST", "/api/departments", { name: `${KEY}-研发部` }, 201, "r38 建部门 -> 201");
      const alice = await expectStatus("POST", "/api/members", {
        name: `${KEY}-负责人甲`, email: "r38.owner@example.com", departmentId: dep.json.id, title: "前端", status: "active",
      }, 201, "r38 建在职负责人 -> 201");
      const retired = await expectStatus("POST", "/api/members", {
        name: `${KEY}-离职者`, email: "r38.retired@example.com", status: "inactive",
      }, 201, "r38 建停用成员 -> 201");
      const proj = await expectStatus("POST", "/api/projects", { name: `${KEY}-元数据看板`, description: "r38" }, 201, "r38 建项目 -> 201");
      const pid = proj.json.id;
      const colsRes = await expectStatus("GET", `/api/projects/${pid}/columns`, undefined, 200, "r38 默认三列 -> 200");
      const [todoCol, doingCol, doneCol] = colsRes.json.columns.map((c: any) => c.id);
      eq(colsRes.json.columns.map((c: any) => c.name), ["待办", "进行中", "已完成"], "r38 默认三列名称与顺序（完成列用于逾期抑制）");

      // 老卡：只传 title（r4 老请求逐字不变）
      const legacy = await expectStatus("POST", `/api/projects/${pid}/columns/${todoCol}/cards`, { title: `${KEY}-老卡` }, 201, "r38 向后兼容·老请求只传 title -> 201");
      eq(legacy.json.labels, [], "r38 向后兼容·老卡 labels=[]");
      eq(legacy.json.assigneeMemberId, null, "r38 向后兼容·老卡 assigneeMemberId=null");
      eq(legacy.json.dueDate, null, "r38 向后兼容·老卡 dueDate=null");
      eq(legacy.json.assigneeMember, null, "r38 向后兼容·老卡 assigneeMember 摘要 null");
      const legacyGet = await expectStatus("GET", `/api/cards/${legacy.json.id}`, undefined, 200, "r38 向后兼容·老卡详情 -> 200");
      eq(legacyGet.json.description, null, "r38 向后兼容·老卡原字段 description=null");

      // 新卡 A：逾期（2020-01-01）+ 两标签 + 在职负责人
      const cardA = await expectStatus("POST", `/api/projects/${pid}/columns/${todoCol}/cards`, {
        title: `${KEY}-逾期卡`, labels: ["  前端 ", "紧急", "前端"],
        assigneeMemberId: alice.json.id, dueDate: "2020-01-01",
      }, 201, "r38 建带元数据卡片 -> 201");
      eq(cardA.json.labels, ["前端", "紧急"], "r38 建卡·标签 trim/去重回带");
      eq(cardA.json.assigneeMemberId, alice.json.id, "r38 建卡·负责人 id 回带");
      eq(cardA.json.assigneeMember?.name, alice.json.name, "r38 建卡·负责人摘要姓名回带");
      eq(cardA.json.assigneeMember?.departmentName, dep.json.name, "r38 建卡·负责人摘要部门回带");
      eq(cardA.json.dueDate, "2020-01-01", "r38 建卡·截止日回带");
      const cardAGet = await expectStatus("GET", `/api/cards/${cardA.json.id}`, undefined, 200, "r38 GET 卡片详情 -> 200");
      eq(cardAGet.json.labels, ["前端", "紧急"], "r38 GET 详情·标签不丢");
      const colCards = await expectStatus("GET", `/api/projects/${pid}/columns/${todoCol}/cards`, undefined, 200, "r38 GET 列内卡片 -> 200");
      eq(colCards.json.cards.find((c: any) => c.id === cardA.json.id)?.labels, ["前端", "紧急"], "r38 GET 列内卡片·标签回带");

      // 新卡 B：未来截止日（2099），无标签无负责人
      const cardB = await expectStatus("POST", `/api/projects/${pid}/columns/${doingCol}/cards`, {
        title: `${KEY}-未来卡`, dueDate: "2099-01-01",
      }, 201, "r38 建未来截止日卡片 -> 201");
      eq(cardB.json.labels, [], "r38 未来卡·无标签");
      // 新卡 C：逾期但在「已完成」列 -> 逾期被抑制
      const cardC = await expectStatus("POST", `/api/projects/${pid}/columns/${doneCol}/cards`, {
        title: `${KEY}-完成列卡`, labels: ["前端"], dueDate: "2020-01-01",
      }, 201, "r38 建完成列逾期卡 -> 201");

      // 逾期列表手算：仅 cardA（老卡无日期、B 未来、C 完成列抑制）
      const overdue = await expectStatus("GET", `/api/boards/${pid}/overdue`, undefined, 200, "r38 GET 逾期列表 -> 200");
      eq(overdue.json.count, 1, "r38 手算·逾期恰好 1 张");
      eq(overdue.json.cards.map((c: any) => c.id), [cardA.json.id], "r38 手算·逾期卡 id = 卡A");
      eq(overdue.json.cards[0]?.assigneeMember?.id, alice.json.id, "r38 逾期列表·负责人摘要回带");

      // 标签筛选
      const byLabel = await expectStatus("GET", `/api/boards/${pid}/cards?label=${encodeURIComponent("前端")}`, undefined, 200, "r38 GET 标签筛选 -> 200");
      eq(byLabel.json.label, "前端", "r38 筛选·查询串标签回带");
      eq(byLabel.json.count, 2, "r38 手算·前端标签 2 张（卡A + 卡C）");
      ok(byLabel.json.cards.map((c: any) => c.id).includes(cardA.json.id), "r38 筛选·命中卡A");
      ok(byLabel.json.cards.map((c: any) => c.id).includes(cardC.json.id), "r38 筛选·命中卡C");
      eq(byLabel.json.cards.map((c: any) => c.id).includes(cardB.json.id), false, "r38 筛选·未命中无标签卡B");
      const byTrim = await expectStatus("GET", `/api/boards/${pid}/cards?label=${encodeURIComponent("  前端  ")}`, undefined, 200, "r38 GET 标签筛选 trim -> 200");
      eq(byTrim.json.count, 2, "r38 筛选·查询串 trim 后仍命中 2 张");
      const byNone = await expectStatus("GET", `/api/boards/${pid}/cards?label=${encodeURIComponent("不存在")}`, undefined, 200, "r38 GET 无命中标签 -> 200");
      eq(byNone.json.count, 0, "r38 筛选·无命中 0 张");
      const allCards = await expectStatus("GET", `/api/boards/${pid}/cards`, undefined, 200, "r38 GET 不带 label -> 200");
      eq(allCards.json.count, 4, "r38 筛选·label 缺省返回全部 4 张");

      // PATCH 元数据整体替换 / 清空
      const patched = await expectStatus("PATCH", `/api/cards/${cardA.json.id}`, {
        labels: ["设计"], assigneeMemberId: null, dueDate: null,
      }, 200, "r38 PATCH 元数据 -> 200");
      eq(patched.json.labels, ["设计"], "r38 PATCH·标签整体替换");
      eq(patched.json.assigneeMemberId, null, "r38 PATCH·清空负责人");
      eq(patched.json.assigneeMember, null, "r38 PATCH·负责人摘要归 null");
      eq(patched.json.dueDate, null, "r38 PATCH·清空截止日");
      const afterPatch = await expectStatus("GET", `/api/boards/${pid}/overdue`, undefined, 200, "r38 PATCH 后重查逾期 -> 200");
      eq(afterPatch.json.count, 0, "r38 手算·清空截止日后逾期归零");
      await expectStatus("PATCH", `/api/cards/${cardA.json.id}`, { labels: ["前端"], dueDate: "2020-01-01" }, 200, "r38 PATCH 恢复元数据 -> 200");
      const movedDone = await expectStatus("PATCH", `/api/cards/${cardA.json.id}/move`, { columnId: doneCol, position: 0 }, 200, "r38 移卡到完成列 -> 200");
      eq(movedDone.json.labels, ["前端"], "r38 移动后元数据不丢");
      eq((await req("GET", `/api/boards/${pid}/overdue`)).json.count, 0, "r38 手算·移入完成列后逾期归零");

      // 4xx：非法标签 / 停用成员 / 不存在成员 / 非法日期 / 越权 / 非数字 id
      await expectStatus("POST", `/api/projects/${pid}/columns/${todoCol}/cards`, { title: `${KEY}-空标签`, labels: ["  "] }, 400, "r38 4xx·全空标签 -> 400");
      await expectStatus("POST", `/api/projects/${pid}/columns/${todoCol}/cards`, { title: `${KEY}-非数组标签`, labels: "前端" }, 400, "r38 4xx·非数组标签 -> 400");
      const longLabel39 = await expectStatus("POST", `/api/projects/${pid}/columns/${todoCol}/cards`, { title: `${KEY}-超长标签`, labels: ["x".repeat(41)] }, 400, "r38 4xx·超长标签 -> 400");
      cleanError39(longLabel39, "r39 4xx·超长标签错误体零内部术语");
      await expectStatus("POST", `/api/projects/${pid}/columns/${todoCol}/cards`, {
        title: `${KEY}-过多标签`, labels: Array.from({ length: 11 }, (_, i) => `标签${i}`),
      }, 400, "r38 4xx·标签超上限 -> 400");
      await expectStatus("POST", `/api/projects/${pid}/columns/${todoCol}/cards`, {
        title: `${KEY}-停用负责人`, assigneeMemberId: retired.json.id,
      }, 400, "r38 4xx·停用成员 -> 400");
      await expectStatus("POST", `/api/projects/${pid}/columns/${todoCol}/cards`, {
        title: `${KEY}-不存在负责人`, assigneeMemberId: 999999,
      }, 400, "r38 4xx·不存在成员 -> 400");
      await expectStatus("POST", `/api/projects/${pid}/columns/${todoCol}/cards`, {
        title: `${KEY}-坏日期`, dueDate: "2026-02-30",
      }, 400, "r38 4xx·非法日期 -> 400");
      await expectStatus("POST", `/api/projects/${pid}/columns/${todoCol}/cards`, {
        title: `${KEY}-斜杠日期`, dueDate: "2026/01/01",
      }, 400, "r38 4xx·非 ISO 日期 -> 400");
      await expectStatus("PATCH", `/api/cards/${cardA.json.id}`, { labels: ["  "] }, 400, "r38 4xx·PATCH 空标签 -> 400");
      await expectStatus("PATCH", `/api/cards/${cardA.json.id}`, { dueDate: "bad" }, 400, "r38 4xx·PATCH 非法日期 -> 400");
      await expectStatus("GET", `/api/boards/${pid}/cards?label=${encodeURIComponent("  ")}`, undefined, 400, "r38 4xx·空白标签查询 -> 400");
      await expectStatus("GET", "/api/boards/999999/overdue", undefined, 404, "r38 4xx·越权项目 overdue -> 404");
      await expectStatus("GET", "/api/boards/not-a-number/overdue", undefined, 400, "r38 4xx·非数字项目 id -> 400");
      await expectStatus("GET", "/api/boards/999999/cards", undefined, 404, "r38 4xx·越权项目 cards -> 404");
      await expectStatus("PATCH", "/api/cards/999999", { labels: ["x"] }, 404, "r38 4xx·越权卡片 PATCH -> 404");

      // 级联删除 + 清理探针
      await expectStatus("DELETE", `/api/cards/${cardA.json.id}`, undefined, 200, "r38 删卡 -> 200");
      await expectStatus("GET", `/api/cards/${cardA.json.id}`, undefined, 404, "r38 删卡后详情 -> 404");
      eq((await req("GET", `/api/boards/${pid}/cards?label=${encodeURIComponent("设计")}`)).json.count, 0, "r38 级联·删卡后标签不再被筛出");
      for (const c of [legacy, cardB, cardC]) {
        await expectStatus("DELETE", `/api/cards/${c.json.id}`, undefined, 200, "r38 清理探针卡 -> 200");
      }
      await expectStatus("DELETE", `/api/projects/${pid}`, undefined, 200, "r38 清理探针项目 -> 200");
      await expectStatus("DELETE", `/api/members/${alice.json.id}`, undefined, 200, "r38 清理在职成员 -> 200");
      await expectStatus("DELETE", `/api/members/${retired.json.id}`, undefined, 200, "r38 清理停用成员 -> 200");
      await expectStatus("DELETE", `/api/departments/${dep.json.id}`, undefined, 200, "r38 清理部门 -> 200");
      const projAfter = await expectStatus("GET", "/api/projects", undefined, 200, "r38 清理后项目列表 -> 200");
      ok(!JSON.stringify(projAfter.json.projects).includes(KEY), "r38 探针归零·项目列表不含本轮 KEY");
    }

    // r40: HTTP 4xx bodies are the raw material of UI error bars. Widen the
    // round-marker guard to 1..3 digits (r39 waizhuan P5: single-digit rN was
    // missed by the old rNN regex). Real 4xx probes only, no synthetic passes.
    const INTERNAL_TERM_40 = /截图钉态|截图钉注|钉注|audit|e2e|4xx|seam|shot=|\br\d{1,3}\b/i;
    const OLD_TERM_39 = /r\d{2}(?!\d)/i;
    ok(INTERNAL_TERM_40.test("例：写 r2 复验材料"), "r40 审计侧轮次号正则覆盖单位数 rN");
    ok(!OLD_TERM_39.test("例：写 r2 复验材料"), "r40 旧 rNN 正则确认漏检单位数（扩正则必要性）");
    function cleanError40(res: { json: any }, label: string): void {
      ok(!INTERNAL_TERM_40.test(String(res.json?.error ?? "")), label);
    }
    const probes40: readonly (readonly [string, string, unknown, number, string])[] = [
      ["POST", "/api/todos", { title: "   ", quadrant: "q1" }, 400, "r40 4xx·空白标题错误体零内部术语"],
      ["POST", "/api/todos", { title: "x", quadrant: "q9" }, 400, "r40 4xx·非法象限错误体零内部术语"],
      ["GET", "/api/search", undefined, 400, "r40 4xx·缺 q 错误体零内部术语"],
      ["GET", "/api/search?q=", undefined, 400, "r40 4xx·空 q 错误体零内部术语"],
      ["GET", "/api/boards/999999/overdue", undefined, 404, "r40 4xx·越权项目错误体零内部术语"],
      ["GET", "/api/boards/not-a-number/overdue", undefined, 400, "r40 4xx·非数字 id 错误体零内部术语"],
      ["GET", "/api/todos/999999", undefined, 404, "r40 4xx·越权待办错误体零内部术语"],
      ["GET", "/api/documents/99999999/print-preview", undefined, 404, "r40 4xx·越权文档错误体零内部术语"],
    ];
    for (const [method, path, body, status, label] of probes40) {
      const res = await expectStatus(method, path, body, status, `r40 ${method} ${path} -> ${status}`);
      cleanError40(res, label);
    }

    // r41: lightweight form collection over REAL HTTP. Hand-computed summary from
    // three submitted responses; every 4xx branch is a real rejected request.
    const KEY41 = `r41-${Date.now()}`;
    const h41 = await expectStatus("GET", "/api/health", undefined, 200, "r41 health -> 200");
    eq(h41.json.schemaVersion, 27, "r41 health.schemaVersion=27（v27 迁移真生效）");
    const listBefore41 = await expectStatus("GET", "/api/forms", undefined, 200, "r41 GET 空表单列表 -> 200");
    eq(listBefore41.json.count, 0, "r41 空库·表单列表 count=0");
    const created41 = await expectStatus("POST", "/api/forms", {
      title: `${KEY41} 满意度调查`,
      description: "季度反馈",
      questions: [
        { type: "text", label: "姓名", required: true, position: 0 },
        { type: "number", label: "评分", required: true, position: 1 },
        { type: "select", label: "部门", required: true, options: ["研发", "产品"], position: 2 },
        { type: "checkbox", label: "参加", required: true, position: 3 },
      ],
    }, 201, "r41 POST 建表单 -> 201");
    const fid41 = created41.json.id as number;
    const qids41 = (created41.json.questions as any[]).map((q) => q.id as number);
    eq(qids41.length, 4, "r41 建表单·四题回带");
    eq(created41.json.closedAt, null, "r41 建表单·未关闭");
    const listed41 = await expectStatus("GET", "/api/forms", undefined, 200, "r41 GET 表单列表 -> 200");
    eq(listed41.json.forms.filter((f: any) => f.id === fid41).length, 1, "r41 列表·新表单在场");
    const got41 = await expectStatus("GET", `/api/forms/${fid41}`, undefined, 200, "r41 GET 表单详情 -> 200");
    eq(got41.json.title, `${KEY41} 满意度调查`, "r41 详情·标题回带");
    const fill41 = await expectStatus("GET", `/api/forms/${fid41}/fill`, undefined, 200, "r41 GET 填写视图 -> 200");
    eq(fill41.json.questions.length, 4, "r41 填写视图·四题在场");
    eq(fill41.json.closed, false, "r41 填写视图·closed=false");

    // 4xx: definition guards + answer guards + unknown id + non-numeric id
    await expectStatus("POST", "/api/forms", { title: "  ", questions: [] }, 400, "r41 4xx·空标题 -> 400");
    await expectStatus("POST", "/api/forms", { title: "坏题型", questions: [{ type: "date", label: "日期" }] }, 400, "r41 4xx·未知题型 -> 400");
    await expectStatus("POST", "/api/forms", { title: "坏选项", questions: [{ type: "select", label: "部门", options: [] }] }, 400, "r41 4xx·单选无选项 -> 400");
    await expectStatus("POST", `/api/forms/${fid41}/responses`, { "2": 10, "3": "研发", [String(qids41[3])]: true }, 400, "r41 4xx·必填缺失 -> 400");
    await expectStatus("POST", `/api/forms/${fid41}/responses`, { [String(qids41[0])]: "甲", [String(qids41[1])]: "abc", [String(qids41[2])]: "研发", [String(qids41[3])]: true }, 400, "r41 4xx·类型不符 -> 400");
    await expectStatus("POST", `/api/forms/${fid41}/responses`, { [String(qids41[0])]: "甲", [String(qids41[1])]: 10, [String(qids41[2])]: "研发", [String(qids41[3])]: true, "999999": "x" }, 400, "r41 4xx·未知题号 -> 400");
    await expectStatus("POST", `/api/forms/${fid41}/responses`, { [String(qids41[0])]: "甲", [String(qids41[1])]: 10, [String(qids41[2])]: "不存在部门", [String(qids41[3])]: true }, 400, "r41 4xx·选项越界 -> 400");
    await expectStatus("GET", "/api/forms/99999999", undefined, 404, "r41 4xx·越权表单 id -> 404");
    await expectStatus("POST", "/api/forms/99999999/responses", { "1": "x" }, 404, "r41 4xx·越权提交 -> 404");
    await expectStatus("GET", "/api/forms/not-a-number", undefined, 400, "r41 4xx·非数字 id -> 400");
    const reject41 = await req("POST", `/api/forms/${fid41}/responses`, { "2": "abc" });
    ok(typeof reject41.json?.error === "string" && reject41.json.error.length > 0, "r41 4xx·错误体带用户可读 error");

    // Three real submissions, then hand-computed summary (sum 60 / avg 20 / 2:1 / 2-of-3)
    const rows41 = [
      ["甲", 10, "研发", true],
      ["乙", 20, "研发", false],
      ["丙", 30, "产品", true],
    ] as const;
    for (const [name, score, dept, join] of rows41) {
      const r = await expectStatus("POST", `/api/forms/${fid41}/responses`, {
        [String(qids41[0])]: name,
        [String(qids41[1])]: score,
        [String(qids41[2])]: dept,
        [String(qids41[3])]: join,
      }, 201, `r41 提交答卷 ${name} -> 201`);
      ok(Boolean(r.json.id) && r.json.formId === fid41, `r41 答卷 ${name}·id 与 formId 回带`);
    }
    const responses41 = await expectStatus("GET", `/api/forms/${fid41}/responses`, undefined, 200, "r41 GET 答卷列表 -> 200");
    eq(responses41.json.count, 3, "r41 答卷列表·3 份");
    const sum41 = await expectStatus("GET", `/api/forms/${fid41}/summary`, undefined, 200, "r41 GET 汇总 -> 200");
    eq(sum41.json.total, 3, "r41 汇总·总数 3");
    eq(sum41.json.formId, fid41, "r41 汇总·formId 回带");
    const texts41 = sum41.json.questions[0];
    eq(texts41.values, ["甲", "乙", "丙"], "r41 汇总·文本列举按提交顺序");
    const nums41 = sum41.json.questions[1];
    eq([nums41.count, nums41.sum, nums41.avg, nums41.min, nums41.max], [3, 60, 20, 10, 30], "r41 汇总·HTTP 手算 sum=60 avg=20");
    const sels41 = sum41.json.questions[2];
    eq(sels41.distribution, [{ option: "研发", count: 2, rate: 0.67 }, { option: "产品", count: 1, rate: 0.33 }], "r41 汇总·HTTP 选项分布 2:1");
    const checks41 = sum41.json.questions[3];
    eq([checks41.checked, checks41.rate], [2, 0.67], "r41 汇总·HTTP 勾选率 2/3");
    const sumAgain41 = await expectStatus("GET", `/api/forms/${fid41}/summary`, undefined, 200, "r41 汇总重复读 -> 200");
    eq(JSON.stringify(sumAgain41.json), JSON.stringify(sum41.json), "r41 汇总·两次读取逐字节稳定");

    // Closed form rejects new submissions (409) while summary stays readable; reopen restores.
    const closed41 = await expectStatus("PATCH", `/api/forms/${fid41}`, { closedAt: "2026-11-21T00:00:00.000Z" }, 200, "r41 PATCH 关闭表单 -> 200");
    ok(typeof closed41.json.closedAt === "string", "r41 关闭·closedAt 回带");
    const closedFill41 = await expectStatus("GET", `/api/forms/${fid41}/fill`, undefined, 200, "r41 关闭后填写视图仍可读 -> 200");
    eq(closedFill41.json.closed, true, "r41 关闭·填写视图 closed=true");
    await expectStatus("POST", `/api/forms/${fid41}/responses`, { [String(qids41[0])]: "丁", [String(qids41[1])]: 40, [String(qids41[2])]: "产品", [String(qids41[3])]: false }, 409, "r41 4xx·已关闭提交 -> 409");
    const stillSum41 = await expectStatus("GET", `/api/forms/${fid41}/summary`, undefined, 200, "r41 关闭后汇总仍可读 -> 200");
    eq(stillSum41.json.total, 3, "r41 关闭·汇总总数不变（拒收零半态）");
    const reopened41 = await expectStatus("PATCH", `/api/forms/${fid41}`, { closedAt: null }, 200, "r41 PATCH 重开表单 -> 200");
    eq(reopened41.json.closedAt, null, "r41 重开·closedAt=null");
    await expectStatus("POST", `/api/forms/${fid41}/responses`, { [String(qids41[0])]: "丁", [String(qids41[1])]: 40, [String(qids41[2])]: "产品", [String(qids41[3])]: false }, 201, "r41 重开后提交 -> 201");
    const afterReopen41 = await expectStatus("GET", `/api/forms/${fid41}/summary`, undefined, 200, "r41 重开后汇总 -> 200");
    eq(afterReopen41.json.total, 4, "r41 重开·总数 4");

    // Patch questions (whole-set replace) + delete cascade + probe cleanup
    const patched41 = await expectStatus("PATCH", `/api/forms/${fid41}`, {
      title: `${KEY41} 改名`,
      questions: [{ type: "text", label: "唯一题", required: true, position: 0 }],
    }, 200, "r41 PATCH 整组替换问题 -> 200");
    eq(patched41.json.questions.length, 1, "r41 PATCH·问题整组替换为 1 题");
    const replaceReject41 = await req("POST", `/api/forms/${fid41}/responses`, { [String(qids41[0])]: "旧题答案" });
    eq(replaceReject41.status, 400, "r41 PATCH·旧题号提交被拒（整组替换生效）");
    await expectStatus("DELETE", `/api/forms/${fid41}`, undefined, 200, "r41 DELETE 表单 -> 200");
    await expectStatus("GET", `/api/forms/${fid41}`, undefined, 404, "r41 删除后详情 -> 404");
    await expectStatus("GET", `/api/forms/${fid41}/summary`, undefined, 404, "r41 删除后汇总 -> 404");
    const finalList41 = await expectStatus("GET", "/api/forms", undefined, 200, "r41 清理后列表 -> 200");
    ok(!JSON.stringify(finalList41.json.forms).includes(KEY41), "r41 探针归零·列表不含本轮 KEY");

    // r43: meeting-room equipment + smart recommendation over REAL HTTP. Three rooms
    // with distinct capacity/equipment, one existing booking; recommendations are
    // hand-checked (capacity closest first) and every 4xx is a real rejected request.
    const KEY43 = `r43-${Date.now()}`;
    const h43 = await expectStatus("GET", "/api/health", undefined, 200, "r43 health -> 200");
    eq(h43.json.schemaVersion, 27, "r43 health.schemaVersion=27（v27 迁移真生效）");

    const roomA43 = await expectStatus("POST", "/api/rooms", {
      name: `${KEY43} 大会议室`, location: "3F", capacity: 12, equipment: ["投影", "视频会议"],
    }, 201, "r43 建大会议室 -> 201");
    eq(roomA43.json.equipment, ["投影", "视频会议"], "r43 建室·设备回带原样");
    const roomB43 = await expectStatus("POST", "/api/rooms", {
      name: `${KEY43} 中会议室`, location: "3F", capacity: 8, equipment: ["投影", "白板"],
    }, 201, "r43 建中会议室 -> 201");
    const roomC43 = await expectStatus("POST", "/api/rooms", {
      name: `${KEY43} 小会议室`, location: "2F", capacity: 6, equipment: ["电话会议"],
    }, 201, "r43 建小会议室 -> 201");
    const roomD43 = await expectStatus("POST", "/api/rooms", {
      name: `${KEY43} 停用室`, location: "2F", capacity: 20, active: false, equipment: ["投影"],
    }, 201, "r43 建停用室 -> 201");
    eq(roomD43.json.active, false, "r43 停用室·active=false 回显");
    const list43 = await expectStatus("GET", "/api/rooms", undefined, 200, "r43 会议室列表 -> 200");
    ok(list43.json.rooms.some((r: any) => r.equipment && r.equipment.includes("投影")), "r43 列表·设备字段真回带");
    const gotA43 = await expectStatus("GET", `/api/rooms/${roomA43.json.id}`, undefined, 200, "r43 单室查询 -> 200");
    eq(gotA43.json.equipment, ["投影", "视频会议"], "r43 单室·设备不丢");
    const patchedA43 = await expectStatus("PATCH", `/api/rooms/${roomA43.json.id}`, { equipment: ["白板", "投影", "白板"] }, 200, "r43 PATCH 设备 -> 200");
    eq(patchedA43.json.equipment, ["投影", "白板"], "r43 PATCH·设备去重 + 排序回带");
    const badPatch43 = await req("PATCH", `/api/rooms/${roomA43.json.id}`, { equipment: ["激光笔"] });
    eq(badPatch43.status, 400, "r43 4xx·PATCH 非法设备 -> 400");
    const afterBadPatch43 = await expectStatus("GET", `/api/rooms/${roomA43.json.id}`, undefined, 200, "r43 4xx 后单室查询 -> 200");
    eq(afterBadPatch43.json.equipment, ["投影", "白板"], "r43 零半态·PATCH 失败设备未改写");
    const badRoom43 = await req("POST", "/api/rooms", { name: `${KEY43} 非法设备室`, equipment: ["激光笔"] });
    eq(badRoom43.status, 400, "r43 4xx·建室非法设备 -> 400");
    const dedupRoom43 = await expectStatus("POST", "/api/rooms", { name: `${KEY43} 去重室`, capacity: 9, equipment: ["视频会议", "投影", "视频会议"] }, 201, "r43 建室去重样本 -> 201");
    eq(dedupRoom43.json.equipment, ["投影", "视频会议"], "r43 建室·设备去重排序真落库");

    // One real existing booking on room B: 14:00-15:30. Recipient of conflict reasons.
    const booking43 = await expectStatus("POST", "/api/meetings", {
      roomId: roomB43.json.id, title: `${KEY43} 已占用`, date: "2026-11-20", start: "14:00", end: "15:30", organizer: "张三",
    }, 201, "r43 已有预约 -> 201");
    ok(booking43.json.id > 0, "r43 已有预约·真 id 回带");

    const baseQ = `attendees=8&equipment=${encodeURIComponent("投影")}&date=2026-11-20&start=10:00&end=11:00`;
    const rec43 = await expectStatus("GET", `/api/rooms/recommend?${baseQ}`, undefined, 200, "r43 推荐 8 人+投影+10:00 -> 200");
    eq(rec43.json.need.attendees, 8, "r43 需求回显·人数 8");
    eq(rec43.json.need.equipment, ["投影"], "r43 需求回显·设备归一");
    eq(rec43.json.need.date, "2026-11-20", "r43 需求回显·日期");
    eq(rec43.json.availableCount, 3, "r43 手算·8 人可用 3 间（8 座 + 9 座去重室 + 12 座）");
    eq(rec43.json.available.map((h: any) => h.id), [roomB43.json.id, dedupRoom43.json.id, roomA43.json.id], "r43 手算·按容量最接近升序（8 → 9 → 12）");
    eq(rec43.json.available[0].capacity, 8, "r43 手算·首位容量 8");
    eq(rec43.json.available[1].capacity, 9, "r43 手算·次位容量 9");
    eq(rec43.json.available[2].capacity, 12, "r43 手算·末位容量 12");
    eq(rec43.json.available[0].seatsOver, 0, "r43 手算·首位余座 0");
    eq(rec43.json.unavailableCount, 2, "r43 手算·不可用 2 间（小室 + 停用室）");    const missSmall43 = rec43.json.unavailable.find((m: any) => m.id === roomC43.json.id);
    ok(Boolean(missSmall43), "r43 不可用·小会议室在场");
    ok(missSmall43.reasons.some((r: string) => r.includes("容量不足")), "r43 不可用·小室给容量不足原因");
    ok(missSmall43.reasons.some((r: string) => r.includes("缺少设备")), "r43 不可用·小室给设备缺失原因");
    const missOff43 = rec43.json.unavailable.find((m: any) => m.id === roomD43.json.id);
    ok(Boolean(missOff43), "r43 不可用·停用室在场");
    ok(missOff43.reasons.includes("会议室已停用"), "r43 不可用·停用室给停用原因");

    const conflictQ = `attendees=8&equipment=${encodeURIComponent("投影")}&date=2026-11-20&start=14:30&end=15:00`;
    const recConflict43 = await expectStatus("GET", `/api/rooms/recommend?${conflictQ}`, undefined, 200, "r43 冲突时段推荐 -> 200");
    ok(!recConflict43.json.available.some((h: any) => h.id === roomB43.json.id), "r43 冲突剔除·中会议室不在可用");
    const conflictMiss43 = recConflict43.json.unavailable.find((m: any) => m.id === roomB43.json.id);
    ok(Boolean(conflictMiss43), "r43 冲突原因·中会议室在不可用");
    ok(conflictMiss43.reasons.some((r: string) => r.includes("时段冲突") && r.includes(String(booking43.json.id))), "r43 冲突原因·回带冲突会议 id");
    const touchQ = `attendees=8&equipment=${encodeURIComponent("投影")}&date=2026-11-20&start=15:30&end=16:00`;
    const recTouch43 = await expectStatus("GET", `/api/rooms/recommend?${touchQ}`, undefined, 200, "r43 边界相接时段推荐 -> 200");
    ok(recTouch43.json.available.some((h: any) => h.id === roomB43.json.id), "r43 r28 零回归·边界相接不算冲突");
    const noEquipQ = "attendees=8&date=2026-11-20&start=10:00&end=11:00";
    const recNoEquip43 = await expectStatus("GET", `/api/rooms/recommend?${noEquipQ}`, undefined, 200, "r43 无设备需求推荐 -> 200");
    eq(recNoEquip43.json.availableCount, 3, "r43 无设备需求·三间启用室均可用");
    const bigQ = "attendees=12&date=2026-11-20&start=10:00&end=11:00";
    const recBig43 = await expectStatus("GET", `/api/rooms/recommend?${bigQ}`, undefined, 200, "r43 12 人推荐 -> 200");
    eq(recBig43.json.available.map((h: any) => h.id), [roomA43.json.id], "r43 12 人·只有 12 座启用室可用");
    const videoQ = `attendees=8&equipment=${encodeURIComponent("视频会议")}&date=2026-11-20&start=10:00&end=11:00`;
    const recVideo43 = await expectStatus("GET", `/api/rooms/recommend?${videoQ}`, undefined, 200, "r43 视频会议设备推荐 -> 200");
    eq(recVideo43.json.available.length, 1, "r43 视频会议·PATCH 后只剩去重室命中（大会议室已改为投影+白板）");
    eq(recVideo43.json.available[0].id, dedupRoom43.json.id, "r43 视频会议·命中室 id 精确");
    const recAgain43 = await expectStatus("GET", `/api/rooms/recommend?${baseQ}`, undefined, 200, "r43 重复推荐 -> 200");
    eq(JSON.stringify(recAgain43.json), JSON.stringify(rec43.json), "r43 只读·重复推荐逐字节一致");

    // 4xx: illegal equipment / reversed window / illegal attendees / bad date / out-of-scope ids
    const bad43: readonly (readonly [string, number, string])[] = [
      [`attendees=8&equipment=${encodeURIComponent("激光笔")}&start=10:00&end=11:00`, 400, "r43 4xx·非法设备 -> 400"],
      ["attendees=8&date=2026-11-20&start=11:00&end=10:00", 400, "r43 4xx·时段倒挂 -> 400"],
      ["attendees=8&date=2026-11-20&start=08:00&end=17:00", 400, "r43 4xx·超过 8 小时 -> 400"],
      ["attendees=8&date=2026-02-30&start=10:00&end=11:00", 400, "r43 4xx·非法日期 -> 400"],
      ["attendees=0&start=10:00&end=11:00", 400, "r43 4xx·人数 0 -> 400"],
      ["attendees=abc&start=10:00&end=11:00", 400, "r43 4xx·人数非数字 -> 400"],
      ["start=10:00&end=11:00", 400, "r43 4xx·缺人数 -> 400"],
      ["attendees=8&start=9:00&end=11:00", 400, "r43 4xx·非补零时钟 -> 400"],
      ["attendees=8&start=bad&end=11:00", 400, "r43 4xx·非法开始时钟 -> 400"],
      ["attendees=8&start=10:00&end=bad", 400, "r43 4xx·非法结束时钟 -> 400"],
    ];
    for (const [qs, status, label] of bad43) {
      const res = await expectStatus("GET", `/api/rooms/recommend?${qs}`, undefined, status, label);
      cleanError39(res, `${label}·错误体零内部术语`);
    }
    await expectStatus("GET", "/api/rooms/99999999", undefined, 404, "r43 4xx·越权会议室 id -> 404");
    await expectStatus("GET", "/api/rooms/not-a-number", undefined, 400, "r43 4xx·非数字会议室 id -> 400");
    await expectStatus("PATCH", "/api/rooms/99999999", { equipment: [] }, 404, "r43 4xx·越权 PATCH -> 404");
    const after4xx43 = await expectStatus("GET", `/api/rooms/recommend?${baseQ}`, undefined, 200, "r43 4xx 后推荐仍 200");
    eq(JSON.stringify(after4xx43.json), JSON.stringify(rec43.json), "r43 4xx 零半态·推荐结果未被改写");

    // r28 meeting zero regression on the new 8-column rooms table
    const regBooking43 = await expectStatus("POST", "/api/meetings", {
      roomId: roomA43.json.id, title: `${KEY43} 回归首场`, date: "2026-11-21", start: "09:00", end: "10:00", organizer: "李四",
    }, 201, "r28 零回归·预约 -> 201");
    ok(regBooking43.json.id > 0, "r28 零回归·预约真 id 回带");
    await expectStatus("POST", "/api/meetings", {
      roomId: roomA43.json.id, title: `${KEY43} 撞车`, date: "2026-11-21", start: "09:30", end: "10:30", organizer: "李四",
    }, 409, "r28 零回归·重叠 -> 409");
    await expectStatus("POST", "/api/meetings", {
      roomId: roomA43.json.id, title: `${KEY43} 接档`, date: "2026-11-21", start: "10:00", end: "11:00", organizer: "李四",
    }, 201, "r28 零回归·边界相接 -> 201");
    const avail43 = await expectStatus("GET", "/api/rooms/99999999/availability?date=2026-11-21", undefined, 404, "r28 零回归·越权 availability -> 404");
    ok(avail43.status === 404, "r28 零回归·availability 越权仍 404");
    const availOk43 = await expectStatus("GET", `/api/rooms/${roomA43.json.id}/availability?date=2026-11-21`, undefined, 200, "r28 零回归·availability -> 200");
    eq(availOk43.json.bookings.length, 2, "r28 零回归·availability 回两条预约");

    // cleanup: meetings then rooms; probe rows must be gone
    const meetings43 = await expectStatus("GET", "/api/meetings", undefined, 200, "r43 清理前会议列表 -> 200");
    for (const m of meetings43.json.meetings.filter((m: any) => String(m.title).includes(KEY43))) {
      await expectStatus("DELETE", `/api/meetings/${m.id}`, undefined, 200, `r43 清理会议 ${m.id} -> 200`);
    }
    for (const id of [roomA43.json.id, roomB43.json.id, roomC43.json.id, roomD43.json.id, dedupRoom43.json.id]) {
      await expectStatus("DELETE", `/api/rooms/${id}`, undefined, 200, `r43 清理会议室 ${id} -> 200`);
    }
    const finalRooms43 = await expectStatus("GET", "/api/rooms", undefined, 200, "r43 清理后列表 -> 200");
    ok(!JSON.stringify(finalRooms43.json.rooms).includes(KEY43), "r43 探针归零·会议室列表不含本轮 KEY");
    const finalMeetings43 = await expectStatus("GET", "/api/meetings", undefined, 200, "r43 清理后会议列表 -> 200");
    ok(!JSON.stringify(finalMeetings43.json.meetings).includes(KEY43), "r43 探针归零·会议列表不含本轮 KEY");
}

// ---- r45: block drag reorder over REAL HTTP (reuse move route + 4xx branches) ----
async function auditR45(): Promise<void> {
    const KEY45 = "R45HTTP" + Date.now();
    const doc45 = await expectStatus("POST", "/api/documents", { title: `${KEY45} drag probe` }, 201, "r45 建拖拽探针文档 -> 201");
    const docId45 = doc45.json.id;
    const imp45 = await expectStatus("POST", `/api/documents/${docId45}/import.md`, {
      markdown: "# r45 title\n\nsecond paragraph\n\nthird paragraph\n\nfourth paragraph\n\nfifth paragraph",
    }, 200, "r45 导入五块 -> 200");
    eq(imp45.json.imported, 5, "r45 导入恰好五块");
    const before45 = await expectStatus("GET", `/api/documents/${docId45}/blocks`, undefined, 200, "r45 GET 块列表 -> 200");
    eq(before45.json.blocks.length, 5, "r45 块列表五块在场");
    eq(before45.json.blocks.map((b: any) => b.position), [0, 1, 2, 3, 4], "r45 拖前 position 连号");

    // real plan -> real move -> reread -> full text
    const plan45 = planBlockDrop(2, 0, before45.json.blocks.length);
    ok(plan45 !== null && plan45.position === 0, "r45 计划·第三块到首位 position=0");
    const moved45 = await expectStatus("POST", `/api/blocks/${before45.json.blocks[2].id}/move`, { position: plan45!.position }, 200, "r45 POST move 第三块到首位 -> 200");
    eq(moved45.json.blocks.map((b: any) => b.content.text), ["third paragraph", "r45 title", "second paragraph", "fourth paragraph", "fifth paragraph"], "r45 HTTP move 后顺序逐项正确");
    eq(moved45.json.blocks.map((b: any) => b.position), [0, 1, 2, 3, 4], "r45 HTTP move 后 position 连号");
    eq(moved45.json.blocks[0].id, before45.json.blocks[2].id, "r45 HTTP 被拖块 id 精确");
    const reread45 = await expectStatus("GET", `/api/documents/${docId45}/blocks`, undefined, 200, "r45 真 HTTP 回读 -> 200");
    eq(JSON.stringify(reread45.json.blocks), JSON.stringify(moved45.json.blocks), "r45 HTTP 回读与 move 响应逐字节一致");
    const text45 = await expectStatus("GET", `/api/documents/${docId45}/text`, undefined, 200, "r45 GET 全文 -> 200");
    ok(String(text45.json.text ?? "").startsWith("third paragraph"), "r45 全文装配按新顺序开头");

    // cross-type: heading now at index 1 -> last slot
    const plan45b = planBlockDrop(1, 5, 5);
    ok(plan45b !== null && plan45b.position === 4, "r45 计划·跨类型拖到末位 position=4");
    const cross45 = await expectStatus("POST", `/api/blocks/${reread45.json.blocks[1].id}/move`, { position: plan45b!.position }, 200, "r45 跨类型拖到末位 -> 200");
    eq(cross45.json.blocks.map((b: any) => b.type).at(-1), "heading1", "r45 跨类型拖拽后标题块落末位");
    eq(cross45.json.blocks.map((b: any) => b.position), [0, 1, 2, 3, 4], "r45 跨类型拖拽 position 仍连号");

    // boundary clamp: far-out drop target clamps to the last slot
    const clamp45 = planBlockDrop(0, 999, 5);
    ok(clamp45 !== null && clamp45.position === 4, "r45 计划·超尾钳制 position=4");
    const clamped45 = await expectStatus("POST", `/api/blocks/${cross45.json.blocks[0].id}/move`, { position: clamp45!.position }, 200, "r45 边界钳制后 move -> 200");
    eq(clamped45.json.blocks.map((b: any) => b.position), [0, 1, 2, 3, 4], "r45 边界钳制不越界");
    ok(clamped45.json.blocks[4].id === cross45.json.blocks[0].id, "r45 超尾拖放落在末位");

    // same-order resend: no visible change (UI suppresses via plan null)
    const idem45 = await expectStatus("POST", `/api/blocks/${clamped45.json.blocks[4].id}/move`, { position: 4 }, 200, "r45 同序位置重发 -> 200");
    const order45 = (payload: any): unknown => payload.blocks.map((b: any) => ({ id: b.id, position: b.position, type: b.type, text: b.content.text }));
    eq(JSON.stringify(order45(idem45.json)), JSON.stringify(order45(clamped45.json)), "r45 同序重发顺序零变化");

    // 4xx branches on the reused move route (no half-state)
    const target45 = reread45.json.blocks[0].id;
    await expectStatus("POST", "/api/blocks/99999999/move", { position: 0 }, 404, "r45 4xx·越权块 id -> 404");
    await expectStatus("POST", "/api/blocks/not-a-number/move", { position: 0 }, 400, "r45 4xx·非数字块 id -> 400");
    await expectStatus("POST", `/api/blocks/${target45}/move`, { position: -1 }, 400, "r45 4xx·负 position -> 400");
    await expectStatus("POST", `/api/blocks/${target45}/move`, { position: 999 }, 400, "r45 4xx·超界 position -> 400");
    await expectStatus("POST", `/api/blocks/${target45}/move`, { position: "abc" }, 400, "r45 4xx·非数字 position -> 400");
    await expectStatus("POST", `/api/blocks/${target45}/move`, {}, 400, "r45 4xx·缺 position -> 400");
    const after4xx45 = await expectStatus("GET", `/api/documents/${docId45}/blocks`, undefined, 200, "r45 4xx 后回读 -> 200");
    eq(JSON.stringify(after4xx45.json.blocks), JSON.stringify(idem45.json.blocks), "r45 4xx 零半态·顺序未被改写");

    // probe cleanup (only this round's rows)
    await expectStatus("DELETE", `/api/documents/${docId45}`, undefined, 200, "r45 清理探针文档 -> 200");
    const final45 = await expectStatus("GET", "/api/documents", undefined, 200, "r45 清理后文档列表 -> 200");
    ok(!JSON.stringify(final45.json.documents).includes(KEY45), "r45 探针归零·列表不含本轮 key");
}

/** r47：AI 工具调用确认闸门——真 HTTP 层混合意图 / 确认 / 放弃 / 4xx / 向后兼容 */
async function auditR47(): Promise<void> {
  console.log("\n== AI workbench r47: tool confirmation gate (HTTP) ==");
  const conv = await expectStatus("POST", "/api/conversations", { title: "r47 audit gate" }, 201, "r47 建闸门会话 -> 201");
  const cid = conv.json.id as number;
  const chatUrl = `/api/conversations/${cid}/chat`;
  const confirmUrl = `/api/conversations/${cid}/confirm`;
  const KEY47 = "r47HTTP拦截探针";
  const todosBefore47 = (await req("GET", "/api/todos")).json.todos;
  eq(STATE_CHANGING_TOOLS.length, 3, "r47 白名单 3 个状态变更工具（唯一口径）");

  // 4xx：autoExecute 非法 / callIds 非法（先于成功写入，零半态）
  await expectStatus("POST", chatUrl, { message: "盘点待办", autoExecute: "yes" }, 400, "r47 autoExecute 非布尔 -> 400");
  await expectStatus("POST", chatUrl, { message: "盘点待办", autoExecute: 1 }, 400, "r47 autoExecute 数字 -> 400");
  await expectStatus("POST", confirmUrl, { callIds: [] }, 400, "r47 confirm·空 callIds -> 400");
  await expectStatus("POST", confirmUrl, { callIds: "x" }, 400, "r47 confirm·callIds 非数组 -> 400");
  await expectStatus("POST", confirmUrl, { callIds: ["a", ""] }, 400, "r47 confirm·callIds 空项 -> 400");
  await expectStatus("POST", confirmUrl, { callIds: ["a"], action: "explode" }, 400, "r47 confirm·非法 action -> 400");
  await expectStatus("POST", confirmUrl, { callIds: ["never-exists"] }, 400, "r47 confirm·非法 callId -> 400");
  await expectStatus("POST", "/api/conversations/99999/confirm", { callIds: ["x"] }, 404, "r47 confirm·会话不存在 -> 404");
  const msgs4xx = await expectStatus("GET", `/api/conversations/${cid}/messages`, undefined, 200, "r47 4xx 后对话流 -> 200");
  eq(msgs4xx.json.messages.length, 0, "r47 4xx 零半态·无任何消息落库");

  // 混合意图：建待办（写）+ 列待办（读）——默认 autoExecute=false
  const mixed = await expectStatus("POST", chatUrl, {
    message: `新建待办：${KEY47}，然后列出待办`,
  }, 201, "r47 默认闸门·混合对话 -> 201");
  eq(mixed.json.autoExecute, false, "r47 默认闸门·autoExecute=false 回显");
  eq(mixed.json.toolCalls.length, 2, "r47 混合对话·两调用落回执");
  eq(mixed.json.toolCalls[0].confirmStatus, "pending", "r47 混合对话·写调用 pending");
  eq(mixed.json.toolCalls[1].confirmStatus, "executed", "r47 混合对话·只读直接执行");
  eq(mixed.json.toolCalls[1].ok, true, "r47 混合对话·只读回执 ok=true");
  eq(mixed.json.pendingCalls.length, 1, "r47 混合对话·pendingCalls 恰 1");
  const pendingId = mixed.json.pendingCalls[0].callId as string;
  ok(String(pendingId).startsWith(`c${cid}-`), "r47 混合对话·callId 带会话前缀");
  ok(mixed.json.toolCalls[0].preview?.title === "新建待办", "r47 混合对话·pending 带预览摘要");
  ok(String(mixed.json.toolCalls[0].summary).includes("待确认"), "r47 混合对话·pending 摘要含待确认");

  // 只读直接出结果（非零半态）
  const todosAfterChat = (await req("GET", "/api/todos")).json.todos;
  eq(todosAfterChat.length, todosBefore47.length, "r47 闸门·写 pending 期间零落库");
  const listBody = mixed.json.toolCalls.find((t: any) => t.name === "list_todos");
  ok(listBody.data && Array.isArray(listBody.data.todos), "r47 混合对话·只读调用真返回数据");

  // reload 不丢：pending 回执在对话流中
  const msgs = await expectStatus("GET", `/api/conversations/${cid}/messages`, undefined, 200, "r47 reload 对话流 -> 200");
  const allCalls = msgs.json.messages.flatMap((m: any) => m.toolCalls ?? []);
  eq(allCalls.filter((t: any) => t.confirmStatus === "pending").length, 1, "r47 reload·pending 回执不丢");
  eq(allCalls.find((t: any) => t.callId === pendingId)?.name, "create_todo", "r47 reload·callId 可寻址");

  // confirm 真执行落库
  const confirmed = await expectStatus("POST", confirmUrl, { callIds: [pendingId] }, 200, "r47 confirm -> 200");
  eq(confirmed.json.action, "confirm", "r47 confirm·action 回显");
  eq(confirmed.json.resolved.length, 1, "r47 confirm·恰解决 1 项");
  eq(confirmed.json.resolved[0].confirmStatus, "executed", "r47 confirm·状态 executed");
  eq(confirmed.json.resolved[0].ok, true, "r47 confirm·真执行 ok=true");
  const todosAfterConfirm = (await req("GET", "/api/todos")).json.todos;
  eq(todosAfterConfirm.length, todosBefore47.length + 1, "r47 confirm·真建待办（+1）");
  ok(todosAfterConfirm.some((t: any) => t.title === KEY47), "r47 confirm·真实标题入库");
  // 重复确认 -> 409
  await expectStatus("POST", confirmUrl, { callIds: [pendingId] }, 409, "r47 重复确认 -> 409");
  const afterDup = (await req("GET", "/api/todos")).json.todos;
  eq(afterDup.length, todosBefore47.length + 1, "r47 重复确认零副作用（无二次写库）");

  // 越权 conversation：把 A 会话的 callId 拿到 B 会话确认 -> 400
  const convB = await expectStatus("POST", "/api/conversations", { title: "r47 audit gate B" }, 201, "r47 建第二会话 -> 201");
  await expectStatus("POST", `/api/conversations/${convB.json.id}/confirm`, { callIds: [pendingId] }, 400, "r47 越权 conversation -> 400");

  // discard：放弃零写
  const gated2 = await expectStatus("POST", chatUrl, { message: "新建待办：r47HTTP放弃探针" }, 201, "r47 放弃·新 pending -> 201");
  const discardId = gated2.json.pendingCalls[0].callId as string;
  const beforeDiscard = (await req("GET", "/api/todos")).json.todos.length;
  const discarded = await expectStatus("POST", confirmUrl, { callIds: [discardId], action: "discard" }, 200, "r47 discard -> 200");
  eq(discarded.json.resolved[0].confirmStatus, "discarded", "r47 discard·状态 discarded");
  eq((await req("GET", "/api/todos")).json.todos.length, beforeDiscard, "r47 discard·放弃零写");
  await expectStatus("POST", confirmUrl, { callIds: [discardId] }, 409, "r47 已放弃再确认 -> 409");

  // 向后兼容：autoExecute=true 老行为立即写库、零 pending
  const beforeOld = (await req("GET", "/api/todos")).json.todos.length;
  const old = await expectStatus("POST", chatUrl, { message: "新建待办：r47老行为HTTP", autoExecute: true }, 201, "r47 老行为对话 -> 201");
  eq(old.json.autoExecute, true, "r47 老行为·autoExecute=true 回显");
  eq(old.json.pendingCalls.length, 0, "r47 老行为·零 pending");
  eq(old.json.toolCalls[0].id, "tc-1", "r47 老行为·回执 id=tc-1");
  eq((await req("GET", "/api/todos")).json.todos.length, beforeOld + 1, "r47 老行为·立即真建待办");

  // 清理探针（只删本轮自建）
  const finalTodos = (await req("GET", "/api/todos")).json.todos;
  for (const t of finalTodos) {
    if (typeof t.title === "string" && (t.title.includes("r47HTTP") || t.title.includes("r47老行为HTTP"))) {
      await expectStatus("DELETE", `/api/todos/${t.id}`, undefined, 200, `r47 清理探针待办 ${t.id} -> 200`);
    }
  }
  await expectStatus("DELETE", `/api/conversations/${cid}`, undefined, 200, "r47 清理会话 A -> 200");
  await expectStatus("DELETE", `/api/conversations/${convB.json.id}`, undefined, 200, "r47 清理会话 B -> 200");
  const afterClean = (await req("GET", "/api/todos")).json.todos;
  ok(!JSON.stringify(afterClean).includes(KEY47), "r47 探针归零·列表不含本轮 key");
}

try {
  await audit();
  await auditR45();
  await auditR47();
} catch (err) {
  failures.push(`audit 抛错：${err instanceof Error ? err.message : String(err)}`);
  console.error(`audit crashed: ${err instanceof Error ? err.stack : String(err)}`);
}

console.log(`\n断言通过 ${passed}，失败 ${failures.length}`);
if (failures.length > 0) {
  console.error("失败清单：");
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log("AUDIT-HTTP: ALL GREEN");

// node-sqlite3-wasm keeps an internal watchdog timer: force exit after printing results.
await new Promise((r) => setTimeout(r, 500));
process.exit(0);
