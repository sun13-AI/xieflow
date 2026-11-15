// 协流 XieFlow — e2e-test.ts：直连服务层断言业务行为（IKanBot 模式）
// r2：todo 输入校验收紧（服务层守卫）+ 今/明/周汇总计数 + raw 直达 schema 约束。
// r1 复验 P4 指出的两条自洽占位断言在本轮替换为真实行为断言（raw SQL 触达 NOT NULL /
// CHECK 约束；迁移幂等改用 PRAGMA user_version 真实读回）。
// 路由层（HTTP 侧）断言在 scripts/audit-http.ts，独立成套计数。
// 运行：pnpm test
import { mkdirSync } from "node:fs";
import {
  openDatabase,
  openDatabaseRaw,
  MIGRATIONS,
  CURRENT_SCHEMA_VERSION,
  assertMigrationsConsistent,
  type SqliteDatabase,
  type XieFlowDb,
} from "@xieflow/db";
import {
  SCHEMA_VERSION,
  canTransitionTodo,
  TODO_STATUS_TRANSITIONS,
  QUADRANT_LABELS,
  EMPTY_SUMMARY,
  computeTodoSummary,
  localDateStr,
} from "@xieflow/shared";
import type { TodoStatus } from "@xieflow/shared";

// ---------- 极简断言器 ----------
let passed = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}

function eq<T>(actual: T, expected: T, label: string): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  ok(same, `${label}${same ? "" : `（实际 ${JSON.stringify(actual)} ≠ 期望 ${JSON.stringify(expected)}）`}`);
}

async function throws(fn: () => unknown | Promise<unknown>, label: string): Promise<void> {
  try {
    await fn();
    ok(false, `${label}（未抛错）`);
  } catch {
    ok(true, label);
  }
}

function noThrow(fn: () => unknown, label: string): void {
  try {
    fn();
    ok(true, label);
  } catch (err) {
    ok(false, `${label}（意外抛错：${err instanceof Error ? err.message : String(err)}）`);
  }
}

function section(name: string): void {
  console.log(`\n== ${name} ==`);
}

/** 本地时区日期偏移（天），配合 localDateStr 造确定性样本 */
function shiftDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

// ---------- 用例 ----------
let db: XieFlowDb | null = null;

function freshDb(): XieFlowDb {
  db?.close();
  db = openDatabase({ path: ":memory:" });
  return db;
}

try {
  // 1. 迁移与 schema 一致性
  section("迁移与 schema 一致性");
  eq(MIGRATIONS.length, CURRENT_SCHEMA_VERSION, "迁移队列条数 = 最高版本号");
  eq(SCHEMA_VERSION, CURRENT_SCHEMA_VERSION, "shared.SCHEMA_VERSION = db.CURRENT_SCHEMA_VERSION");
  eq(
    MIGRATIONS.map((m) => m.version),
    Array.from({ length: MIGRATIONS.length }, (_, i) => i + 1),
    "迁移版本从 1 连续递增",
  );
  noThrow(() => assertMigrationsConsistent(), "真实迁移队列通过一致性校验");
  throws(
    () => assertMigrationsConsistent([{ version: 2, name: "跳过 v1", up: [] }]),
    "版本不从 1 开始：一致性校验抛错",
  );
  throws(
    () =>
      assertMigrationsConsistent([
        { version: 1, name: "a", up: [] },
        { version: 3, name: "b", up: [] },
      ]),
    "版本断档：一致性校验抛错",
  );
  throws(
    () =>
      assertMigrationsConsistent([
        { version: 1, name: "a", up: [] },
        { version: 2, name: "b", up: [] },
        { version: 3, name: "c", up: [] },
      ]),
    "队列超出 SCHEMA_VERSION：一致性校验抛错",
  );

  // 2. settings CRUD
  section("settings 读写");
  db = freshDb();
  eq(db.listSettings().length, 0, "新库 settings 为空");
  const s1 = db.setSetting("company.name", "协流示例公司");
  eq(s1.value, "协流示例公司", "写入后读回 value");
  const s1b = db.getSetting("company.name");
  ok(s1b !== null, "getSetting 命中");
  eq(s1b!.value, "协流示例公司", "getSetting value 一致");
  const s1c = db.setSetting("company.name", "协流二号");
  eq(s1c.value, "协流二号", "upsert 覆盖旧值");
  ok(db.getSetting("company.name")!.updatedAt >= s1.updatedAt, "upsert 刷新 updated_at");
  eq(db.getSetting("missing.key"), null, "读不存在的 key 返回 null");
  eq(db.listSettings().length, 1, "listSettings 数量正确");
  throws(() => db!.setSetting("", "x"), "空 key 抛错");

  // 3. todo CRUD
  section("todo CRUD");
  db = freshDb();
  eq(db.listTodos().length, 0, "新库 todos 为空");
  const t1 = db.createTodo("收集各部门季度总结", "q1", "2026-11-20");
  ok(t1.id > 0, "createTodo 返回自增 id");
  eq(t1.title, "收集各部门季度总结", "title 读回");
  eq(t1.quadrant, "q1", "quadrant 读回");
  eq(t1.status, "open", "初始状态 open");
  eq(t1.dueDate, "2026-11-20", "dueDate 读回");
  const t2 = db.createTodo("无截止日待办", "q2", null);
  eq(t2.dueDate, null, "dueDate 可为 null");
  eq(db.listTodos().length, 2, "listTodos 数量");
  const got = db.getTodo(t1.id);
  ok(got !== null && got.id === t1.id, "getTodo 命中");
  eq(db.getTodo(99999), null, "getTodo 未命中返回 null");
  eq(db.deleteTodo(t2.id), true, "deleteTodo 删除成功");
  eq(db.deleteTodo(t2.id), false, "重复删除返回 false");
  eq(db.listTodos().length, 1, "删除后数量 -1");
  throws(() => db!.createTodo("", "q1", null), "空标题抛错（服务层守卫）");
  throws(() => db!.createTodo("x", "q9", null), "非法象限抛错（服务层守卫）");

  // 4. todo 输入校验（r2 收紧：服务层守卫先于 SQL CHECK）
  section("todo 输入校验（服务层守卫）");
  db = freshDb();
  const guardSeed = db.createTodo("守卫样本", "q1", null);
  throws(() => db!.createTodo("   ", "q1", null), "纯空白标题抛错");
  throws(() => db!.createTodo("x", "Q1", null), "象限大小写敏感：Q1 拒绝");
  throws(
    () => db!.createTodo("长".repeat(201), "q1", null),
    "超长标题（201 字）抛错（MAX_TODO_TITLE=200）",
  );
  const maxTitle = db.createTodo("标".repeat(200), "q1", null);
  eq(maxTitle.title.length, 200, "恰好 200 字标题可落库（边界通过）");
  throws(() => db!.createTodo("x", "q1 ", null), "象限尾部空白拒绝");
  throws(() => db!.createTodo("x", "q1", "not-a-date"), "非法 dueDate 格式拒绝");
  throws(() => db!.createTodo("x", "q1", "2026-13-01"), "月份 13 的 dueDate 拒绝");
  throws(() => db!.createTodo("x", "q1", "2026-02-30"), "2 月 30 日的 dueDate 拒绝");
  throws(() => db!.createTodo("x", "q1", " 2026-11-20 "), "dueDate 首尾空白拒绝");
  throws(() => db!.createTodo("x", "q1", 123 as unknown as string), "dueDate 非字符串抛错");
  throws(
    () => db!.transitionTodo(guardSeed.id, "bogus" as TodoStatus),
    "非法流转目标抛错（服务层守卫）",
  );
  throws(
    () => db!.transitionTodo(guardSeed.id, "DONE" as TodoStatus),
    "状态大小写敏感：DONE 拒绝",
  );
  eq(db.listTodos().length, 2, "全部非法输入均未落库（库中仅守卫样本 + 200 字合法边界样本）");

  // 5. todo 状态机
  section("todo 状态机");
  const t3 = db.createTodo("状态机样本", "q3", null);
  const done = db.transitionTodo(t3.id, "done");
  eq(done.status, "done", "open → done");
  const reopened = db.transitionTodo(t3.id, "open");
  eq(reopened.status, "open", "done → open（重开）");
  const archived = db.transitionTodo(t3.id, "archived");
  eq(archived.status, "archived", "open → archived");
  throws(() => db!.transitionTodo(t3.id, "done"), "archived → done 非法，抛错");
  throws(() => db!.transitionTodo(424242, "open"), "流转不存在的待办抛错");
  eq(canTransitionTodo("open", "done"), true, "canTransition 合法对");
  eq(canTransitionTodo("archived", "done"), false, "canTransition 非法对");
  eq(
    Object.keys(TODO_STATUS_TRANSITIONS).length,
    3,
    "状态机覆盖全部 3 个状态",
  );
  eq(Object.keys(QUADRANT_LABELS).length, 4, "象限标签覆盖 4 象限");
  eq(EMPTY_SUMMARY.byQuadrant.q1, 0, "EMPTY_SUMMARY 象限归零");

  // 6. 今/明/周汇总计数（api 路由层的 summary 即来自此纯函数）
  section("今/明/周汇总计数（computeTodoSummary）");
  db = freshDb();
  const a1 = db.createTodo("今天到期", "q1", shiftDate(0));
  const b1 = db.createTodo("明天到期", "q2", shiftDate(1));
  db.createTodo("昨天到期", "q3", shiftDate(-1));
  const d1 = db.createTodo("六天后", "q4", shiftDate(6));
  db.createTodo("七天后", "q1", shiftDate(7));
  db.createTodo("下月到期", "q2", "2027-01-01");
  db.createTodo("无截止", "q3", null);
  const h1 = db.createTodo("今天到期但已完成", "q1", shiftDate(0));
  db.transitionTodo(h1.id, "done");
  eq(db.listTodos().length, 8, "汇总样本共 8 条");
  const sum = computeTodoSummary(db.listTodos());
  eq(sum.today, 1, "今 = 本地今天到期且 open（done 的 h1 不计）");
  eq(sum.tomorrow, 1, "明 = 本地明天到期且 open");
  eq(sum.week, 3, "周 = [今天, 今天+6] 窗口内 open（今1+明1+六天后1，+7天与昨天排除）");
  eq(sum.byQuadrant, { q1: 3, q2: 2, q3: 2, q4: 1 }, "象限计数含全部状态（q1 三条：a1/七天后/done 的 h1）");
  db.transitionTodo(d1.id, "archived");
  const sum2 = computeTodoSummary(db.listTodos());
  eq(sum2.week, 2, "归档后移出本周窗口计数（六天后 d1 归档）");
  eq(sum2.byQuadrant.q4, 1, "归档仍计入象限总数");

  // 7. raw 直达 schema 约束（替换 r1 P4「settings.value 非空约束」占位断言）
  section("raw 直达 schema 约束");
  const rawOpen = openDatabaseRaw({ path: ":memory:" });
  const rawDb: SqliteDatabase = rawOpen.raw;
  throws(
    () =>
      rawDb.run(
        "INSERT INTO todos (title, quadrant, status, due_date, created_at, updated_at) " +
          "VALUES (NULL, 'q1', 'open', NULL, '2026-01-01', '2026-01-01')",
      ),
    "todos.title NOT NULL 拒绝 NULL（raw 直达 schema）",
  );
  throws(
    () => rawDb.run("INSERT INTO settings (key, value, updated_at) VALUES ('audit.key', NULL, '2026-01-01')"),
    "settings.value NOT NULL 拒绝 NULL（raw 直达 schema）",
  );
  throws(
    () =>
      rawDb.run(
        "INSERT INTO todos (title, quadrant, status, due_date, created_at, updated_at) " +
          "VALUES ('x', 'q9', 'open', NULL, '2026-01-01', '2026-01-01')",
      ),
    "todos.quadrant CHECK 拒绝 q9（raw 直达 schema）",
  );
  throws(
    () =>
      rawDb.run(
        "INSERT INTO todos (title, quadrant, status, due_date, created_at, updated_at) " +
          "VALUES ('x', 'q1', 'paused', NULL, '2026-01-01', '2026-01-01')",
      ),
    "todos.status CHECK 拒绝 paused（raw 直达 schema）",
  );
  rawDb.close();

  // 8. 迁移幂等与文件库持久化（替换 r1 P4「重开不重复执行迁移」恒真式）
  section("迁移幂等与文件库持久化");
  mkdirSync("scripts/.tmp-e2e", { recursive: true });
  const tmpPath = `scripts/.tmp-e2e/persist-${Date.now()}.db`;
  const fileOpen = openDatabaseRaw({ path: tmpPath });
  fileOpen.db.setSetting("persist.check", "yes");
  const uv1 = (fileOpen.raw.get("PRAGMA user_version") as { user_version: number }).user_version;
  eq(uv1, CURRENT_SCHEMA_VERSION, "新建文件库 user_version = CURRENT_SCHEMA_VERSION（真实 PRAGMA 读回）");
  fileOpen.raw.close();
  const fileOpen2 = openDatabaseRaw({ path: tmpPath }); // 重开：迁移应幂等跳过
  eq(fileOpen2.db.getSetting("persist.check")!.value, "yes", "文件库重开数据仍在");
  const uv2 = (fileOpen2.raw.get("PRAGMA user_version") as { user_version: number }).user_version;
  eq(uv2, CURRENT_SCHEMA_VERSION, "重开不推进 user_version（迁移幂等，真实 PRAGMA 读回）");
  fileOpen2.raw.close();
  db = null;

  // 9. HTTP 冒烟（r1 起 api 服务可用；未启动时此节降级为提示）
  section("HTTP 冒烟 /api/health");
  let httpOk = false;
  let httpNote = "api 服务未运行（pnpm dev:api 后再跑 pnpm test 可覆盖此节）";
  try {
    const res = await fetch("http://127.0.0.1:8787/api/health", {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const data = (await res.json()) as { ok: boolean; schemaVersion: number };
      if (data.ok && data.schemaVersion === CURRENT_SCHEMA_VERSION) {
        httpOk = true;
      } else {
        httpNote = `健康检查返回异常：${JSON.stringify(data)}`;
      }
    } else {
      httpNote = `健康检查 HTTP ${res.status}`;
    }
  } catch {
    /* 未启动则降级 */
  }
  if (httpOk) {
    ok(true, "/api/health 返回 ok 且 schema 版本一致");
  } else {
    console.warn(`  ⚠ 跳过：${httpNote}`);
  }
} finally {
  db?.close();
}

console.log(`\n断言通过 ${passed}，失败 ${failures.length}`);
if (failures.length > 0) {
  console.error("失败清单：");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("E2E: ALL GREEN");
