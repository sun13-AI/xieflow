// 协流 XieFlow — e2e-test.ts：直连服务层断言业务行为（IKanBot 模式）
// r2：todo 输入校验收紧（服务层守卫）+ 今/明/周汇总计数 + raw 直达 schema 约束。
// r1 复验 P4 指出的两条自洽占位断言在本轮替换为真实行为断言（raw SQL 触达 NOT NULL /
// CHECK 约束；迁移幂等改用 PRAGMA user_version 真实读回）。
// 路由层（HTTP 侧）断言在 scripts/audit-http.ts，独立成套计数。
// r4：看板数据层——reorderPositions 排序规则（shared 纯函数）+ schema v3→v4 迁移
// （projects / board_columns / cards）+ 服务层看板 CRUD 与跨列移动闭环。
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
  REPEAT_LABELS,
  MAX_REPEAT_HORIZON_DAYS,
  addMonths,
  computeRepeatInstances,
  assembleRangeSchedules,
  reorderPositions,
  assertValidScheduleTitle,
  assertValidScheduleDate,
  assertValidScheduleTime,
  assertValidScheduleRange,
  assertValidScheduleRepeat,
  assertValidBoardName,
  type Schedule,
  type ScheduleWithInstanceFlag,
  type ScheduleRepeat,
  type BoardCard,
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
        { version: 4, name: "d", up: [] },
        { version: 5, name: "e", up: [] },
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

  // 9. 日程契约与守卫（r3：schedules 表 + 时间/重复校验）
  section("日程契约与守卫（shared）");
  db = freshDb();
  eq(Object.keys(REPEAT_LABELS).length, 4, "repeat 枚举覆盖 4 种（none/daily/weekly/monthly）");
  eq(REPEAT_LABELS.none, "不重复", "repeat 标签 none");
  eq(REPEAT_LABELS.daily, "每天", "repeat 标签 daily");
  eq(REPEAT_LABELS.weekly, "每周", "repeat 标签 weekly");
  eq(REPEAT_LABELS.monthly, "每月", "repeat 标签 monthly");
  throws(() => assertValidScheduleTitle(""), "日程空标题抛错");
  throws(() => assertValidScheduleTitle("   "), "日程纯空白标题抛错");
  throws(() => assertValidScheduleTitle("长".repeat(201)), "日程超长标题（201 字）抛错");
  noThrow(() => assertValidScheduleTitle("标".repeat(200)), "日程恰好 200 字标题合法（边界）");
  throws(() => assertValidScheduleDate("2026-2-30"), "日程非零填充日期拒绝");
  throws(() => assertValidScheduleDate("2026-02-30"), "日程 2 月 30 日拒绝");
  throws(() => assertValidScheduleDate("2026-11-15 "), "日程日期首尾空白拒绝");
  throws(() => assertValidScheduleDate(123 as unknown as string), "日程日期非字符串抛错");
  noThrow(() => assertValidScheduleDate("2026-11-15"), "日程合法日期通过");
  throws(() => assertValidScheduleTime("9:00"), "日程开始时间非零填充拒绝");
  throws(() => assertValidScheduleTime("24:00"), "日程 24 点拒绝");
  throws(() => assertValidScheduleTime("12:60"), "日程 60 分拒绝");
  throws(() => assertValidScheduleTime("12:00 "), "日程时间首尾空白拒绝");
  throws(() => assertValidScheduleTime("abc"), "日程非时间串拒绝");
  noThrow(() => assertValidScheduleTime("00:00"), "日程 00:00 合法（边界）");
  noThrow(() => assertValidScheduleTime("23:59"), "日程 23:59 合法（边界）");
  throws(
    () => assertValidScheduleRange("10:00", "09:00"),
    "结束时间早于开始时间抛错",
  );
  throws(() => assertValidScheduleRange("10:00", "10:00"), "结束时间等于开始时间抛错");
  noThrow(() => assertValidScheduleRange("10:00", "11:30"), "结束晚于开始合法");
  throws(() => assertValidScheduleRepeat("hourly"), "非法 repeat（hourly）抛错");
  throws(() => assertValidScheduleRepeat("NONE"), "repeat 大小写敏感：NONE 拒绝");
  throws(() => assertValidScheduleRepeat(3), "repeat 非字符串抛错");
  noThrow(() => assertValidScheduleRepeat("monthly"), "合法 repeat 通过");

  // 10. 循环日程实例化规则（集中 shared，禁止散落 if-else）
  section("循环日程实例化（computeRepeatInstances）");
  {
    const base: Schedule = {
      id: 7,
      title: "站会",
      date: "2026-11-16", // 周一
      start: "09:00",
      end: "09:30",
      todoId: null,
      repeat: "daily",
      createdAt: "2026-11-15T08:00:00.000Z",
      updatedAt: "2026-11-15T08:00:00.000Z",
    };
    const win = { from: "2026-11-16", to: "2026-11-18" };
    eq(
      computeRepeatInstances(base, win).map((s) => s.date),
      ["2026-11-16", "2026-11-17", "2026-11-18"],
      "daily：窗口内逐日实例化（含首日）",
    );
    const weekly = computeRepeatInstances({ ...base, repeat: "weekly" }, {
      from: "2026-11-16",
      to: "2026-12-07",
    });
    eq(
      weekly.map((s) => s.date),
      ["2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07"],
      "weekly：每 7 天一次，首日即实例",
    );
    const monthly = computeRepeatInstances({ ...base, repeat: "monthly" }, {
      from: "2026-11-16",
      to: "2027-03-16",
    });
    eq(
      monthly.map((s) => s.date),
      ["2026-11-16", "2026-12-16", "2027-01-16", "2027-02-16", "2027-03-16"],
      "monthly：同日逐月，addMonths 处理跨年",
    );
    const monthEnd = computeRepeatInstances(
      { ...base, date: "2026-01-31", repeat: "monthly" },
      { from: "2026-01-31", to: "2026-04-30" },
    );
    eq(
      monthEnd.map((s) => s.date),
      ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"],
      "monthly：1-31 在 2 月收敛为 2-28（不跳月）",
    );
    eq(
      computeRepeatInstances({ ...base, repeat: "none" }, win).map((s) => s.date),
      ["2026-11-16"],
      "none：仅首日本体",
    );
    eq(
      computeRepeatInstances(base, { from: "2026-11-17", to: "2026-11-18" }).map((s) => s.date),
      ["2026-11-17", "2026-11-18"],
      "首日本体在窗口外：实例不含首日（去重交给调用方并集）",
    );
    eq(
      computeRepeatInstances(base, { from: "2026-11-01", to: "2026-11-10" }),
      [],
      "窗口整体早于锚日：空数组",
    );
    eq(
      computeRepeatInstances(base, { from: "2026-11-16", to: "2027-01-15" }).length,
      61,
      "daily 跨 2026-11-16~2027-01-15 恰 61 天（2026 年 11 月 15 天 + 12 月 31 天 + 1 月 15 天）",
    );
    const cap = computeRepeatInstances(base, { from: "2020-01-01", to: "2027-01-01" });
    ok(
      cap.length <= MAX_REPEAT_HORIZON_DAYS,
      `实例数封顶 MAX_REPEAT_HORIZON_DAYS=${MAX_REPEAT_HORIZON_DAYS}（实际 ${cap.length}）`,
    );
    const inst = computeRepeatInstances(base, win);
    ok(
      inst.every((s) => s.id === base.id && s.title === base.title && s.todoId === null && s.repeat === "daily" && s.start === "09:00" && s.end === "09:30"),
      "实例携带本体字段（id/title/todoId/repeat/时间）",
    );
    ok(
      inst.every((s) => s.date >= win.from && s.date <= win.to),
      "实例日期全部落在查询窗口内",
    );
    eq(addMonths(new Date(2026, 0, 31), 1).getDate(), 28, "addMonths 1-31 +1 月 → 2-28（日收敛）");
    eq(addMonths(new Date(2026, 0, 31), 2).getDate(), 31, "addMonths 1-31 +2 月 → 3-31（不丢锚日）");
    eq(addMonths(new Date(2026, 4, 31), 1).getDate(), 30, "addMonths 5-31 +1 月 → 6-30");
  }

  // 10b. 区间查询装配（api GET /api/schedules 的唯一装配入口；r3 返工#1 A）
  section("区间查询装配（assembleRangeSchedules）");
  {
    const mk = (over: Partial<Schedule> & Pick<Schedule, "id" | "date" | "repeat">): Schedule => ({
      title: `s${over.id}`,
      start: "09:00",
      end: "10:00",
      todoId: null,
      createdAt: "2026-11-15T08:00:00.000Z",
      updatedAt: "2026-11-15T08:00:00.000Z",
      ...over,
    });
    const weekly = mk({ id: 101, date: "2026-11-16", title: "周会", repeat: "weekly" });
    const monthly = mk({ id: 102, date: "2026-01-31", title: "月结", repeat: "monthly" });
    const daily = mk({ id: 103, date: "2026-01-01", title: "日常", repeat: "daily" });
    const plain = mk({ id: 104, date: "2026-11-20", title: "单次", repeat: "none" });

    // 锚日窗外：weekly 锚 11-16，窗口 11-17~11-30 → 两条实例（waizhuan 实测 0 条的直接场景）
    const outside = assembleRangeSchedules([weekly], { from: "2026-11-17", to: "2026-11-30" });
    eq(
      outside.map((x) => `${x.date}:${x.isInstance}`),
      ["2026-11-23:true", "2026-11-30:true"],
      "装配：weekly 锚日在窗外，实例仍展开入窗（返工前 0 条的根因场景）",
    );
    // 锚日恰在窗起点：本体 + 后续实例
    const withBody = assembleRangeSchedules([weekly], { from: "2026-11-16", to: "2026-12-07" });
    eq(
      withBody.map((x) => `${x.date}:${x.isInstance}`),
      ["2026-11-16:false", "2026-11-23:true", "2026-11-30:true", "2026-12-07:true"],
      "装配：锚日本体 isInstance=false + 后续周实例（并集同 id 同 date 去重）",
    );
    // 锚日本体落在窗口中间：本体保留原 date，实例从窗口起点起
    const midBody = assembleRangeSchedules([weekly], { from: "2026-11-19", to: "2026-12-01" });
    eq(
      midBody.some((x) => x.id === weekly.id && x.date === "2026-11-16" && x.isInstance === false),
      false,
      "装配：锚日本体窗外不返回（本体也必须落窗）",
    );
    ok(
      midBody.every((x) => x.date >= "2026-11-19" && x.date <= "2026-12-01"),
      "装配：全部结果（本体与实例）都落在查询窗口内",
    );
    // monthly 月末收敛：2 月窗只有 02-28
    const feb = assembleRangeSchedules([monthly], { from: "2026-02-01", to: "2026-02-28" });
    eq(
      feb.map((x) => `${x.date}:${x.isInstance}`),
      ["2026-02-28:true"],
      "装配：monthly 锚 1-31 在 2 月窗收敛为 02-28 实例",
    );
    // none 日程：本体在窗内返回、窗外不返回、无实例
    eq(
      assembleRangeSchedules([plain], { from: "2026-11-01", to: "2026-11-30" }).map((x) => x.date),
      ["2026-11-20"],
      "装配：none 本体在窗内返回（无实例）",
    );
    eq(
      assembleRangeSchedules([plain], { from: "2026-10-01", to: "2026-10-31" }).length,
      0,
      "装配：none 本体窗外不返回",
    );
    // 多日程同窗：跨 id 不互相吞并；排序 date 升序、同日 start 升序
    const multi = assembleRangeSchedules(
      [weekly, monthly, daily, plain, mk({ id: 105, date: "2026-11-16", title: "早会", start: "08:00", end: "08:30", repeat: "none" })],
      { from: "2026-11-16", to: "2026-11-18" },
    );
    const dailyKeys = multi.filter((x) => x.id === daily.id).map((x) => x.date);
    eq(dailyKeys, ["2026-11-16", "2026-11-17", "2026-11-18"], "装配：多日程同窗时 daily 逐日展开不受影响");
    ok(
      !multi.some((x) => x.id === monthly.id),
      "装配：monthly 在无实例的窗不产出任何行",
    );
    const sorted = multi.map((x) => `${x.date} ${x.start}`);
    ok(
      sorted.every((k, i) => i === 0 || !(sorted[i - 1]! > k)),
      "装配：结果按 date 升序、同日按 start 升序",
    );
    // 传入窗内已重复的同 id 日程（防御）：不产生重复行
    const dup = assembleRangeSchedules([weekly, { ...weekly }], { from: "2026-11-16", to: "2026-11-16" });
    eq(
      dup.map((x) => `${x.date}:${x.isInstance}`),
      ["2026-11-16:false"],
      "装配：同 id 同 date 输入去重，本体优先（isInstance=false）",
    );
    const types: Array<ScheduleWithInstanceFlag["isInstance"]> = [true, false];
    eq(types.length, 2, "装配：isInstance 是布尔双值契约（类型层锁定）");
  }

  // 11. schema v2→v3 迁移升级（v2 旧库 → v3 带 schedules 表）+ 双向联动（服务层）
  section("schema v2→v3 迁移升级与双向联动（服务层）");
  {
    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const v3Path = `scripts/.tmp-e2e/upgrade-${Date.now()}.db`;
    // 造一个真 v2 旧库：v3 迁移执行前手动把 user_version 钉回 2（模拟 r2 版本的原地升级）
    const v2Open = openDatabaseRaw({ path: v3Path });
    v2Open.raw.exec("PRAGMA user_version = 2");
    v2Open.raw.close();
    const v3Open = openDatabaseRaw({ path: v3Path });
    v3Open.raw.exec("PRAGMA user_version = 2");
    v3Open.raw.close();
    const v3Migrated = openDatabaseRaw({ path: v3Path });
    eq(
      v3Migrated.appliedMigrations,
      [3, 4],
      "v2 旧库重开补跑 v3+v4 迁移（真实 PRAGMA 升级路径，r4 起队列追加 v4）",
    );
    const tables = v3Migrated.raw
      .all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => String((r as unknown as { name: unknown }).name));
    ok(tables.includes("schedules"), "v3 迁移后 schedules 表存在（sqlite_master 真实读回）");
    eq(
      (v3Migrated.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = 迁移队列最高版本（r4 起动态对表，不再钉死 3）",
    );
    const rawDb: SqliteDatabase = v3Migrated.raw;
    throws(
      () =>
        rawDb.run(
          "INSERT INTO schedules (title, date, start_time, end_time, todo_id, repeat, created_at, updated_at) " +
            "VALUES ('x', '2026-11-16', '09:00', '10:00', 999999, 'none', '2026-01-01', '2026-01-01')",
        ),
      "schedules.todo_id 外键拒绝不存在的待办（raw 直达 FK）",
    );
    throws(
      () =>
        rawDb.run(
          "INSERT INTO schedules (title, date, start_time, end_time, todo_id, repeat, created_at, updated_at) " +
            "VALUES ('x', '2026-11-16', '09:00', '10:00', NULL, 'hourly', '2026-01-01', '2026-01-01')",
        ),
      "schedules.repeat CHECK 拒绝 hourly（raw 直达 CHECK）",
    );
    // 联动：待办设 dueDate → 自动生成关联日程；日程改期 → 回写待办 dueDate
    const linkedTodo = v3Migrated.db.createTodo("联动样本", "q2", null);
    eq(v3Migrated.db.listSchedules().length, 0, "无截止日待办不生成日程");
    v3Migrated.db.updateTodoDueDate(linkedTodo.id, "2026-11-20");
    const autoSchedules = v3Migrated.db.listSchedules();
    eq(autoSchedules.length, 1, "待办设 due_date 自动生成关联日程（1 条）");
    const auto = autoSchedules[0]!;
    eq(auto.date, "2026-11-20", "生成日程的 date = 待办 due_date");
    eq(auto.todoId, linkedTodo.id, "生成日程的 todo_id 关联待办");
    eq(auto.start, "09:00", "生成日程默认开始 09:00");
    eq(auto.end, "10:00", "生成日程默认结束 10:00");
    const tReadback = v3Migrated.db.getTodo(linkedTodo.id)!;
    eq(tReadback.dueDate, "2026-11-20", "待办 due_date 已写入");
    // 日程改期 → 回写待办
    v3Migrated.db.updateScheduleDate(auto.id, "2026-11-23");
    const tReadback2 = v3Migrated.db.getTodo(linkedTodo.id)!;
    eq(tReadback2.dueDate, "2026-11-23", "日程改期回写待办 due_date（联动闭环）");
    eq(
      v3Migrated.db.getSchedule(auto.id)!.date,
      "2026-11-23",
      "日程本体 date 已更新",
    );
    // 解除关联：待办 dueDate 清空 → 关联日程删除
    v3Migrated.db.updateTodoDueDate(linkedTodo.id, null);
    eq(v3Migrated.db.listSchedules().length, 0, "待办清空 due_date 自动删除关联日程");
    // 待办删除 → 关联日程级联删除
    const td = v3Migrated.db.createTodo("级联样本", "q1", "2026-12-01");
    eq(v3Migrated.db.listSchedules().length, 1, "待办再设 due_date 再生成日程");
    v3Migrated.db.deleteTodo(td.id);
    eq(v3Migrated.db.listSchedules().length, 0, "待办删除级联删除关联日程");
    // updateTodoDueDate 对不存在待办抛错
    throws(
      () => v3Migrated.db.updateTodoDueDate(424242, "2026-11-20"),
      "updateTodoDueDate 不存在的待办抛错",
    );
    v3Migrated.raw.close();
    db = null;
  }

  // 12. schedules CRUD（服务层）
  section("schedules CRUD（服务层）");
  {
    db = freshDb();
    eq(db.listSchedules().length, 0, "新库 schedules 为空");
    const sc1 = db.createSchedule("项目评审会", "2026-11-17", "14:00", "15:00", null, "none");
    ok(sc1.id > 0, "createSchedule 返回自增 id");
    eq(sc1.title, "项目评审会", "title 读回");
    eq(sc1.date, "2026-11-17", "date 读回");
    eq(sc1.start, "14:00", "start 读回");
    eq(sc1.end, "15:00", "end 读回");
    eq(sc1.todoId, null, "todoId 默认 null");
    eq(sc1.repeat, "none", "repeat 默认 none");
    const sc2Todo = db.createTodo("日程关联的待办", "q2", "2026-11-19");
    const sc2 = db.createSchedule("关联日程", "2026-11-18", "09:00", "10:00", sc2Todo.id, "weekly");
    eq(sc2.todoId, sc2Todo.id, "todoId 关联真实待办（外键读回）");
    eq(db.getSchedule(sc1.id)!.title, "项目评审会", "getSchedule 命中");
    eq(db.getSchedule(99999), null, "getSchedule 未命中返回 null");
    const upd = db.updateSchedule(sc1.id, { title: "项目评审会（改）", repeat: "monthly" });
    eq(upd.title, "项目评审会（改）", "updateSchedule 改 title");
    eq(upd.repeat, "monthly", "updateSchedule 改 repeat");
    eq(db.updateSchedule(sc1.id, {}).repeat, "monthly", "updateSchedule 空补丁不改任何字段");
    throws(() => db!.updateSchedule(424242, { title: "x" }), "updateSchedule 不存在的日程抛错");
    throws(() => db!.createSchedule("", "2026-11-17", "14:00", "15:00"), "createSchedule 空标题抛错");
    throws(() => db!.createSchedule("x", "2026-02-30", "14:00", "15:00"), "createSchedule 非法日期抛错");
    throws(() => db!.createSchedule("x", "2026-11-17", "9:00", "15:00"), "createSchedule 非法开始时间抛错");
    throws(() => db!.createSchedule("x", "2026-11-17", "15:00", "14:00"), "createSchedule 结束早于开始抛错");
    throws(
      () => db!.createSchedule("x", "2026-11-17", "14:00", "15:00", undefined, "hourly" as unknown as ScheduleRepeat),
      "createSchedule 非法 repeat 抛错",
    );
    throws(
      () => db!.createSchedule("x", "2026-11-17", "14:00", "15:00", 424242),
      "createSchedule 关联不存在的待办抛错",
    );
    throws(
      () => db!.createSchedule("x", "2026-11-17", "14:00", "15:00", undefined, "none", { from: "15:00", to: "14:00" }),
      "createSchedule 检查窗口 to 早于 from 抛错",
    );
    eq(db.listSchedules().length, 3, "schedules 恰 3 条合法样本（sc1/sc2/sc2Todo 自动日程；非法输入零落库）");
    const del = db.deleteSchedule(sc2.id);
    eq(del, true, "deleteSchedule 删除成功");
    eq(db.deleteSchedule(sc2.id), false, "deleteSchedule 重复删除返回 false");
    eq(db.listSchedules().length, 2, "删除后剩 2 条");
  }

  // 12b. 看板排序规则（r4：position 重排集中 shared，api 移动路由的唯一入口）
  section("看板排序规则（reorderPositions）");
  {
    // 合法重排：n 张卡（id 唯一、按位排列），取任意一张移到任意 to
    const mkCards = (ids: number[]): Array<{ id: number }> => ids.map((id) => ({ id }));
    const ids10 = mkCards([11, 12, 13, 14, 15]);
    // 首位移到末尾
    eq(
      reorderPositions(ids10, 11, 4),
      [
        { id: 12, position: 0 },
        { id: 13, position: 1 },
        { id: 14, position: 2 },
        { id: 15, position: 3 },
        { id: 11, position: 4 },
      ],
      "重排：首位移到末尾，其余逐张前移、position 连续 0..n-1",
    );
    // 末位移到首位
    eq(
      reorderPositions(ids10, 15, 0),
      [
        { id: 15, position: 0 },
        { id: 11, position: 1 },
        { id: 12, position: 2 },
        { id: 13, position: 3 },
        { id: 14, position: 4 },
      ],
      "重排：末位移到首位，其余逐张后移",
    );
    // 中间位移动
    eq(
      reorderPositions(ids10, 13, 0),
      [
        { id: 13, position: 0 },
        { id: 11, position: 1 },
        { id: 12, position: 2 },
        { id: 14, position: 3 },
        { id: 15, position: 4 },
      ],
      "重排：中位移到首位，被跨过的卡整体让位",
    );
    // 原位移动：整列恒等映射（id 顺序不变、position 连续；api 层据此跳过兄弟卡写入）
    eq(
      reorderPositions(ids10, 12, 1),
      [
        { id: 11, position: 0 },
        { id: 12, position: 1 },
        { id: 13, position: 2 },
        { id: 14, position: 3 },
        { id: 15, position: 4 },
      ],
      "重排：原位移动返回整列恒等映射（无卡让位）",
    );
    // 单卡列
    eq(reorderPositions(mkCards([99]), 99, 0), [{ id: 99, position: 0 }], "重排：单卡列原位恒等");
    // 非法 to：负数 / 越界
    throws(() => reorderPositions(ids10, 11, -1), "重排：to 为负抛错");
    throws(() => reorderPositions(ids10, 11, 5), "重排：to 越界（= n）抛错");
    throws(() => reorderPositions(ids10, 11, 1.5), "重排：to 非整数抛错");
    // 非法 cardId：不在列表内
    throws(() => reorderPositions(ids10, 424242, 0), "重排：cardId 不在列表内抛错");
    // 乱序输入先按 position 收敛（防御语义）：输入乱序但带 position 时按 position 排
    eq(
      reorderPositions(
        [
          { id: 21, position: 2 },
          { id: 22, position: 0 },
          { id: 23, position: 1 },
        ],
        21,
        0,
      ),
      [
        { id: 21, position: 0 },
        { id: 22, position: 1 },
        { id: 23, position: 2 },
      ],
      "重排：乱序输入按 position 排序后再移动（21 从第 3 位提到首位）",
    );
    // 输出整体校验：position 恰为 0..n-1 的连续排列
    const outIds = reorderPositions(ids10, 14, 1).map((x) => x.id);
    ok(outIds.length === new Set(outIds).size, "重排：输出 id 无重复");
    ok(
      reorderPositions(ids10, 14, 1).every((x, i) => x.position === i),
      "重排：输出 position 恰为 0..n-1 连续",
    );
  }

  // 12c. 看板名称守卫（shared，api 400 映射的同一来源）
  section("看板名称守卫（assertValidBoardName）");
  {
    noThrow(() => assertValidBoardName("装修项目"), "看板合法名称通过");
    throws(() => assertValidBoardName(""), "看板空名称抛错");
    throws(() => assertValidBoardName("   "), "看板纯空白名称抛错");
    throws(() => assertValidBoardName("长".repeat(201)), "看板超长名称（201 字）抛错");
    noThrow(() => assertValidBoardName("标".repeat(200)), "看板恰好 200 字名称合法（边界）");
    throws(() => assertValidBoardName(123 as unknown as string), "看板名称非字符串抛错");
  }

  // 13. schema v3→v4 迁移升级（v3 旧库 → v4 带看板三表）+ 看板数据层闭环（服务层）
  section("schema v3→v4 迁移升级与看板数据层（服务层）");
  {
    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const v4Path = `scripts/.tmp-e2e/upgrade-r4-${Date.now()}.db`;
    // 造一个真 v3 旧库：v4 迁移执行前手动把 user_version 钉回 3（模拟 r3 版本的原地升级）
    const v3Open2 = openDatabaseRaw({ path: v4Path });
    v3Open2.raw.exec("PRAGMA user_version = 3");
    v3Open2.raw.close();
    const v4Open = openDatabaseRaw({ path: v4Path });
    eq(
      v4Open.appliedMigrations,
      [4],
      "v3 旧库重开只补跑 v4 迁移（真实 PRAGMA 升级路径）",
    );
    const tables = v4Open.raw
      .all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => String((r as unknown as { name: unknown }).name));
    ok(tables.includes("projects"), "v4 迁移后 projects 表存在（sqlite_master 真实读回）");
    ok(tables.includes("board_columns"), "v4 迁移后 board_columns 表存在（sqlite_master 真实读回）");
    ok(tables.includes("cards"), "v4 迁移后 cards 表存在（sqlite_master 真实读回）");
    eq(
      (v4Open.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = CURRENT_SCHEMA_VERSION（4）",
    );
    const rawDb: SqliteDatabase = v4Open.raw;
    throws(
      () =>
        rawDb.run(
          "INSERT INTO projects (name, description, created_at, updated_at) " +
            "VALUES (NULL, NULL, '2026-01-01', '2026-01-01')",
        ),
      "projects.name NOT NULL 拒绝 NULL（raw 直达 schema）",
    );
    throws(
      () =>
        rawDb.run(
          "INSERT INTO board_columns (project_id, name, position, created_at, updated_at) " +
            "VALUES (424242, 'x', 0, '2026-01-01', '2026-01-01')",
        ),
      "board_columns.project_id 外键拒绝不存在的项目（raw 直达 FK）",
    );
    throws(
      () =>
        rawDb.run(
          "INSERT INTO cards (project_id, column_id, title, position, created_at, updated_at) " +
            "VALUES (1, 424242, 'x', 0, '2026-01-01', '2026-01-01')",
        ),
      "cards.column_id 外键拒绝不存在的列（raw 直达 FK）",
    );
    throws(
      () =>
        rawDb.run(
          "INSERT INTO cards (project_id, column_id, title, position, todo_id, created_at, updated_at) " +
            "VALUES (1, 1, 'x', 0, 424242, '2026-01-01', '2026-01-01')",
        ),
      "cards.todo_id 外键拒绝不存在的待办（raw 直达 FK）",
    );

    // 看板数据层闭环：建项目 → 建列 → 建卡 → 跨列移动 → 两侧 position 重排 → 删除级联
    const proj = v4Open.db.createProject("装修项目", "新家装修全流程");
    ok(proj.id > 0, "createProject 返回自增 id");
    eq(proj.name, "装修项目", "项目 name 读回");
    eq(proj.description, "新家装修全流程", "项目 description 读回");
    const col1 = v4Open.db.createBoardColumn(proj.id, "待办", 0);
    const col2 = v4Open.db.createBoardColumn(proj.id, "进行中", 1);
    eq(col1.projectId, proj.id, "列 projectId 读回");
    eq(col2.position, 1, "列 position 读回");
    // 列 position 冲突：同项目内唯一 → 落库前守卫
    throws(
      () => v4Open.db.createBoardColumn(proj.id, "重复位置列", 1),
      "createBoardColumn position 冲突抛错（服务层守卫）",
    );
    const todoForCard = v4Open.db.createTodo("选瓷砖", "q2", null);
    const card1 = v4Open.db.createBoardCard(proj.id, col1.id, "量房", null, 0);
    const card2 = v4Open.db.createBoardCard(proj.id, col1.id, "出平面图", null, 1);
    const card3 = v4Open.db.createBoardCard(proj.id, col2.id, "选瓷砖", null, 0, todoForCard.id);
    eq(card3.todoId, todoForCard.id, "卡片 todoId 关联真实待办（外键读回）");
    throws(
      () => v4Open.db.createBoardCard(proj.id, col1.id, "越权外键卡", null, 0, 424242),
      "createBoardCard 关联不存在的待办抛错",
    );
    throws(
      () => v4Open.db.createBoardCard(proj.id, 424242, "缺列上下文卡", null, 0),
      "createBoardCard 列不存在抛错（columnId 越权）",
    );
    // 跨列移动：col1 的 card2 移到 col2 末尾 → col1 重排（0..0）、col2 重排（0..2）
    const moved = v4Open.db.moveBoardCard(card2.id, col2.id, 1);
    eq(moved.columnId, col2.id, "移动后卡片 columnId = 目标列");
    eq(moved.position, 1, "移动后卡片 position = 目标位");
    const col1After = v4Open.db.listBoardCards(col1.id);
    const col2After = v4Open.db.listBoardCards(col2.id);
    eq(
      col1After.map((c) => [c.id, c.position]),
      [[card1.id, 0]],
      "移动后源列重排：剩 1 张卡 position=0（连续）",
    );
    eq(
      col2After.map((c) => [c.id, c.position]),
      [
        [card3.id, 0],
        [card2.id, 1],
      ],
      "移动后目标列重排：原卡让位、新卡落位（position 连续 0..1）",
    );
    // 跨项目移动拒绝（真实守卫，不是 SQL FK 拦截）
    const proj2 = v4Open.db.createProject("第二个项目", null);
    const proj2col = v4Open.db.createBoardColumn(proj2.id, "别的列", 0);
    throws(
      () => v4Open.db.moveBoardCard(card1.id, proj2col.id, 0),
      "moveBoardCard 跨项目移动抛错（服务层守卫）",
    );
    // 待办删除 → 卡片 todo_id 置空（SET NULL 级联语义，卡片本体保留）
    v4Open.db.deleteTodo(todoForCard.id);
    eq(v4Open.db.getBoardCard(card3.id)!.todoId, null, "待办删除后卡片 todoId 置空（SET NULL）");
    eq(v4Open.db.getBoardCard(card3.id) !== null, true, "待办删除后卡片本体保留");
    // 列删除 → 列内卡片级联删除
    v4Open.db.deleteBoardColumn(col2.id);
    eq(v4Open.db.getBoardCard(card2.id), null, "列删除级联删除列内卡片");
    eq(v4Open.db.getBoardCard(card3.id), null, "列删除级联删除（另一张卡）");
    // 项目删除 → 列级联删除
    v4Open.db.deleteProject(proj.id);
    eq(v4Open.db.listBoardColumns(proj.id).length, 0, "项目删除级联删除列");
    // 列表读回
    eq(v4Open.db.listProjects().length, 1, "项目列表只剩第二个项目");
    v4Open.raw.close();
    db = null;
  }

  // 13. HTTP 冒烟 /api/health
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
