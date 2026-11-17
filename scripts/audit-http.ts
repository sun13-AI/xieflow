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
} from "@xieflow/shared";
import { createMockProvider, MOCK_PROVIDER_ID } from "@xieflow/agent";

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
    eq(h.json && h.json.schemaVersion, 7, "health.schemaVersion = 7（r8 迁移后）");
    const s = await req("GET", "/api/settings");
    eq(s.status, 200, "GET /api/settings -> 200");
    ok(Array.isArray(s.json && s.json.settings), "settings 返回数组");
  }

  console.log("\n== POST /api/todos (create) ==");
  let created;
  {
    const r = await expectStatus("POST", "/api/todos", { title: "写 r2 审计脚本", quadrant: "q1", dueDate: "2026-11-20" }, 201, "POST 合法体 -> 201");
    eq(r.json && r.json.title, "写 r2 审计脚本", "创建后 title 读回");
    eq(r.json && r.json.quadrant, "q1", "创建后 quadrant 读回");
    eq(r.json && r.json.status, "open", "创建后初始状态 open");
    eq(r.json && r.json.dueDate, "2026-11-20", "创建后 dueDate 读回");
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
    eq(sm && sm.week, 3, "summary.week = 3（今+明+2026-11-20 在 [今天,今天+6] 窗口内；八天后窗外）");
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
    // health 探针反映 schema v7（r4 起迁移后动态推进）
    const h3 = await req("GET", "/api/health");
    eq(h3.json && h3.json.schemaVersion, 7, "health.schemaVersion = 7（schedules 节复核）");

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
    const t = await expectStatus("POST", "/api/todos", { title: "写联动复验材料", quadrant: "q2", dueDate: "2026-11-20" }, 201, "POST 带截止日待办 -> 201");
    linkTodo = t.json;
    const afterCreate = await req("GET", "/api/schedules?from=2026-11-20&to=2026-11-20");
    eq(afterCreate.json.schedules.length, 1, "建待办（带 dueDate）自动生成关联日程");
    const gen = afterCreate.json.schedules[0];
    eq(gen.date, "2026-11-20", "生成日程 date = 待办 dueDate");
    eq(gen.todoId, linkTodo.id, "生成日程 todo_id 关联该待办");
    eq(gen.start, "09:00", "生成日程默认 09:00 开始");
    eq(gen.end, "10:00", "生成日程默认 10:00 结束");
    eq(gen.title, linkTodo.title, "生成日程标题沿用待办标题");

    // 方向二：日程改期 → 回写待办 due_date
    const moved = await expectStatus("PATCH", `/api/schedules/${gen.id}`, { date: "2026-11-25" }, 200, "PATCH 关联日程改期 -> 200");
    eq(moved.json && moved.json.date, "2026-11-25", "日程本体已改期");
    const todoAfter = await req("GET", `/api/todos/${linkTodo.id}`);
    eq(todoAfter.json && todoAfter.json.dueDate, "2026-11-25", "日程改期回写待办 dueDate（联动闭环）");

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

  console.log("\n== schedules delete (r3) ==");
  {
    const d = await expectStatus("DELETE", `/api/schedules/${schedule.id}`, undefined, 200, "DELETE 存在日程 -> 200");
    ok(d.json && d.json.deleted === true, "delete 日程返回 deleted=true");
    await expectStatus("GET", `/api/schedules/${schedule.id}`, undefined, 404, "DELETE 后 GET 日程 -> 404");
    await expectStatus("DELETE", `/api/schedules/${schedule.id}`, undefined, 404, "DELETE 重复同一日程 id -> 404");
    await expectStatus("DELETE", "/api/schedules/not-a-number", undefined, 400, "DELETE 非数字日程 id -> 400");
  }
}

try {
  await audit();
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
