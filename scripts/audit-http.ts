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
    eq(h.json && h.json.schemaVersion, 4, "health.schemaVersion = 4（r4 迁移后）");
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
    // health 探针反映 schema v4（r4 起迁移后动态推进）
    const h3 = await req("GET", "/api/health");
    eq(h3.json && h3.json.schemaVersion, 4, "health.schemaVersion = 4（schedules 节复核）");

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
    const r1 = await expectStatus("POST", `/api/projects/${project.id}/columns`, { name: "待办", position: 0 }, 201, "POST 列（待办，position 0）-> 201");
    eq(r1.json && r1.json.name, "待办", "列 name 读回");
    eq(r1.json && r1.json.projectId, project.id, "列 projectId 读回");
    eq(r1.json && r1.json.position, 0, "列 position 读回");
    colTodo = r1.json;
    const r2 = await expectStatus("POST", `/api/projects/${project.id}/columns`, { name: "进行中" }, 201, "POST 列缺 position（自动追加列尾）-> 201");
    colDoing = r2.json;
    eq(colDoing && colDoing.position, 1, "缺省 position 自动追加为 1（列尾）");
    const r3 = await expectStatus("POST", `/api/projects/${project.id}/columns`, { name: "已完成", position: 2 }, 201, "POST 列（已完成，position 2）-> 201");
    colDone = r3.json;
    await expectStatus("POST", `/api/projects/${project.id}/columns`, { name: "", position: 3 }, 400, "POST 空列名 -> 400");
    await expectStatus("POST", `/api/projects/${project.id}/columns`, { name: "冲突列", position: 0 }, 400, "POST 列 position 冲突（0 已占用）-> 400");
    await expectStatus("POST", "/api/projects/99999/columns", { name: "幽灵列" }, 400, "POST 列到不存在项目（越权外键）-> 400");
    await expectStatus("POST", "/api/projects/not-a-number/columns", { name: "x" }, 400, "POST 列到非数字项目 id -> 400");

    const lst = await expectStatus("GET", `/api/projects/${project.id}/columns`, undefined, 200, "GET 项目列列表 -> 200");
    ok(Array.isArray(lst.json && lst.json.columns), "列列表返回数组");
    eq(
      lst.json.columns.map((x: { name: string }) => x.name),
      ["待办", "进行中", "已完成"],
      "列列表按 position 升序（待办/进行中/已完成）",
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
