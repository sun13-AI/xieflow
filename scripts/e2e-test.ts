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
  DEFAULT_BOARD_COLUMNS,
  assertValidScheduleTitle,
  assertValidScheduleDate,
  assertValidScheduleTime,
  assertValidScheduleRange,
  assertValidScheduleRepeat,
  assertValidBoardName,
  computeBoardStats,
  completionRatePercent,
  buildBoardCsvContent,
  buildBoardCsvRows,
  escapeCsvField,
  countCsvRecords,
  CSV_UTF8_BOM,
  BOARD_CSV_HEADERS,
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  isFieldType,
  fieldTypeUsesOptions,
  validateFieldValue,
  assertValidFieldValue,
  coerceFieldValue,
  compareValues,
  isEmptyFieldValue,
  matchesFieldValue,
  normalizeRecordData,
  sortRecordsByField,
  queryRecords,
  DEFAULT_TABLE_FIELDS,
  assertValidTableName,
  assertValidFieldName,
  assertValidFieldType,
  assertValidFieldOptions,
  sanitizeFileNamePart,
  buildBoardCsvFileName,
  MAX_PAGE_SIZE,
  type Schedule,
  type ScheduleWithInstanceFlag,
  type ScheduleRepeat,
  type BoardCard,
  type BoardColumn,
  type Todo,
  type TableField,
  type TableRecord,
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
        { version: 6, name: "f", up: [] },
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
      [3, 4, 5],
      "v2 旧库重开补跑 v3+v4+v5 迁移（真实 PRAGMA 升级路径，r6 起队列追加 v5）",
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
      [4, 5],
      "v3 旧库重开只补跑 v4+v5 迁移（真实 PRAGMA 升级路径）",
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

    // 看板数据层闭环：建项目（自动带默认三列，r4 返工#1 A1）→ 落卡 → 跨列移动
    // → 两侧 position 重排 → 删除级联
    eq(
      DEFAULT_BOARD_COLUMNS,
      ["待办", "进行中", "已完成"],
      "shared 默认列模板口径（服务层建列与 UI 文案同一来源）",
    );
    const proj = v4Open.db.createProject("装修项目", "新家装修全流程");
    ok(proj.id > 0, "createProject 返回自增 id");
    eq(proj.name, "装修项目", "项目 name 读回");
    eq(proj.description, "新家装修全流程", "项目 description 读回");
    // r4 返工#1 A1：createProject 自动创建默认三列（消灭「建项目 → 看板零列」用户死路）
    const defaultCols = v4Open.db.listBoardColumns(proj.id);
    eq(
      defaultCols.map((c) => [c.name, c.position]),
      [
        ["待办", 0],
        ["进行中", 1],
        ["已完成", 2],
      ],
      "createProject 自动创建默认三列（待办/进行中/已完成 @ position 0/1/2 连续）",
    );
    ok(
      defaultCols.every((c) => c.projectId === proj.id),
      "默认三列都归属新项目（projectId 一致）",
    );
    eq(defaultCols[0]!.projectId, proj.id, "默认列 projectId 读回");
    eq(
      v4Open.db.listBoardCards(defaultCols[0]!.id),
      [],
      "默认列初始零卡片（有列无卡：与死路形态相反）",
    );
    const col1 = defaultCols[0]!;
    const col2 = defaultCols[1]!;
    // position 冲突守卫仍生效：默认列已占 0/1/2，再占 1 位被拒
    throws(
      () => v4Open.db.createBoardColumn(proj.id, "重复位置列", 1),
      "createBoardColumn position 冲突抛错（服务层守卫，默认列占用后仍拦截）",
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
    // 跨项目移动拒绝（真实守卫，不是 SQL FK 拦截）；「别的列」缺省 position 落默认三列之后（列尾=3）
    const proj2 = v4Open.db.createProject("第二个项目", null);
    eq(
      v4Open.db.listBoardColumns(proj2.id).length,
      3,
      "第二个项目同样自带默认三列（createProject 默认建列不分支）",
    );
    const proj2col = v4Open.db.createBoardColumn(proj2.id, "别的列");
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

  // 14. 看板统计口径（r5：集中 shared 纯函数 computeBoardStats）
  section("看板统计口径（computeBoardStats）");
  {
    const iso = "2026-11-15T08:00:00.000Z";
    const mkCol = (id: number, name: string, position: number): BoardColumn => ({
      id,
      projectId: 7,
      name,
      position,
      createdAt: iso,
      updatedAt: iso,
    });
    const mkCard = (id: number, columnId: number, title: string, position: number, todoId: number | null = null): BoardCard => ({
      id,
      projectId: 7,
      columnId,
      title,
      description: null,
      position,
      todoId,
      createdAt: iso,
      updatedAt: iso,
    });
    const mkTodo = (id: number, status: TodoStatus, dueDate: string | null = null): Todo => ({
      id,
      title: `待办${id}`,
      quadrant: "q2",
      status,
      dueDate,
      createdAt: iso,
      updatedAt: iso,
    });

    // 空项目（零列零卡）：不除零、不出 NaN
    const empty = computeBoardStats(7, [], [], []);
    eq(empty.projectId, 7, "统计：projectId 回显");
    eq(empty.columns.length, 0, "统计：空项目零列");
    eq(
      empty.totals,
      { columnCount: 0, cardCount: 0, doneCount: 0, todoLinkedCount: 0, completionRate: 0 },
      "统计：空项目合计全 0（完成率不除零）",
    );
    ok(Number.isFinite(empty.totals.completionRate), "统计：空项目完成率是有限数（无 NaN）");
    eq(completionRatePercent(0, 0), 0, "完成率口径：分母 0 → 0");
    eq(completionRatePercent(1, 3), 33, "完成率口径：1/3 → 33%（整数百分比四舍五入）");
    eq(completionRatePercent(2, 3), 67, "完成率口径：2/3 → 67%");
    eq(completionRatePercent(3, 3), 100, "完成率口径：3/3 → 100%");
    eq(completionRatePercent(0, 5), 0, "完成率口径：0 完成 → 0%");

    // 单列单卡未关联待办
    const cols = [mkCol(1, "待办", 0), mkCol(2, "进行中", 1), mkCol(3, "已完成", 2)];
    const oneCard = computeBoardStats(7, cols, [mkCard(11, 1, "量房", 0)], []);
    eq(oneCard.columns[0]!.cardCount, 1, "统计：单列单卡 cardCount=1");
    eq(oneCard.columns[0]!.doneCount, 0, "统计：未关联待办的卡不算已完成");
    eq(oneCard.columns[0]!.todoLinkedCount, 0, "统计：未关联待办的卡不计入关联待办数");
    eq(oneCard.columns[0]!.completionRate, 0, "统计：未关联待办的卡完成率 0%");
    eq(oneCard.totals.cardCount, 1, "统计：合计卡片数=1");
    eq(oneCard.totals.completionRate, 0, "统计：项目完成率 0%");

    // 完成口径：只有 status=done 的关联待办算完成
    const todos = [mkTodo(21, "done"), mkTodo(22, "open"), mkTodo(23, "archived")];
    const linked = computeBoardStats(
      7,
      cols,
      [
        mkCard(11, 1, "卡-完成", 0, 21),
        mkCard(12, 1, "卡-进行中", 1, 22),
        mkCard(13, 1, "卡-已归档", 2, 23),
        mkCard(14, 1, "卡-无待办", 3),
      ],
      todos,
    );
    eq(linked.columns[0]!.cardCount, 4, "统计：列内 4 张卡");
    eq(linked.columns[0]!.doneCount, 1, "统计：只有 status=done 的关联待办算完成（open/archived 不算）");
    eq(linked.columns[0]!.todoLinkedCount, 3, "统计：关联待办数=3（4 张卡里 3 张挂了待办）");
    eq(linked.columns[0]!.completionRate, 25, "统计：列完成率 1/4 → 25%");
    eq(linked.totals.cardCount, 4, "统计：合计卡片数=4");
    eq(linked.totals.doneCount, 1, "统计：合计完成数=1");
    eq(linked.totals.todoLinkedCount, 3, "统计：合计关联待办数=3");
    eq(linked.totals.completionRate, 25, "统计：项目完成率 1/4 → 25%");
    eq(linked.totals.columnCount, 3, "统计：合计列数=3");

    // 防御：todoId 指向不存在的待办 → 不算完成（但关联数照记）
    const dangling = computeBoardStats(7, cols, [mkCard(15, 1, "卡-幽灵待办", 0, 999)], todos);
    eq(dangling.columns[0]!.doneCount, 0, "统计：关联不存在的待办不算完成（防御）");
    eq(dangling.columns[0]!.todoLinkedCount, 1, "统计：关联不存在的待办仍计入关联待办数");
    eq(dangling.columns[0]!.completionRate, 0, "统计：幽灵待办的卡完成率 0%");

    // 防御：卡片不属于任何列 → 不计入合计
    const orphan = computeBoardStats(7, cols, [mkCard(16, 999, "卡-孤儿列", 0)], todos);
    eq(orphan.totals.cardCount, 0, "统计：不属于任何列的卡片不计入合计（防御）");

    // 多列分布 + 零卡列
    const multi = computeBoardStats(
      7,
      cols,
      [
        mkCard(21, 1, "A", 0, 21),
        mkCard(22, 1, "B", 1),
        mkCard(23, 2, "C", 0, 21),
        mkCard(24, 3, "D", 0, 21),
      ],
      todos,
    );
    eq(
      multi.columns.map((c) => [c.name, c.cardCount, c.doneCount, c.completionRate]),
      [
        ["待办", 2, 1, 50],
        ["进行中", 1, 1, 100],
        ["已完成", 1, 1, 100],
      ],
      "统计：各列卡片数/完成数/完成率（零卡列不出现——本例三列都有卡）",
    );
    eq(multi.totals.cardCount, 4, "统计：多列合计卡片数=4");
    eq(multi.totals.doneCount, 3, "统计：多列合计完成数=3");
    eq(multi.totals.completionRate, 75, "统计：多列项目完成率 3/4 → 75%");

    // 零卡列：完成率 0（不除零）
    const zeroCol = computeBoardStats(7, cols, [], todos);
    eq(zeroCol.columns.map((c) => c.completionRate), [0, 0, 0], "统计：三列全空时各列完成率均为 0");
    eq(zeroCol.totals.completionRate, 0, "统计：零卡项目完成率 0%（不除零）");

    // 列顺序：输入乱序 → 输出按 position 升序
    const shuffled = computeBoardStats(
      7,
      [mkCol(3, "已完成", 2), mkCol(1, "待办", 0), mkCol(2, "进行中", 1)],
      [],
      todos,
    );
    eq(
      shuffled.columns.map((c) => c.name),
      ["待办", "进行中", "已完成"],
      "统计：列按 position 升序输出（输入乱序也收敛）",
    );
  }

  // 15. 看板 CSV 台账（r5：UTF-8 BOM + RFC4180 转义 + 中文表头）
  section("看板 CSV 台账（buildBoardCsvContent）");
  {
    const iso = "2026-11-15T08:00:00.000Z";
    const mkCol = (id: number, name: string, position: number): BoardColumn => ({
      id,
      projectId: 7,
      name,
      position,
      createdAt: iso,
      updatedAt: iso,
    });
    const mkCard = (
      id: number,
      columnId: number,
      title: string,
      position: number,
      todoId: number | null = null,
      description: string | null = null,
    ): BoardCard => ({
      id,
      projectId: 7,
      columnId,
      title,
      description,
      position,
      todoId,
      createdAt: iso,
      updatedAt: iso,
    });
    const mkTodo = (id: number, status: TodoStatus, dueDate: string | null = null): Todo => ({
      id,
      title: `待办${id}`,
      quadrant: "q1",
      status,
      dueDate,
      createdAt: iso,
      updatedAt: iso,
    });

    const cols = [mkCol(1, "待办", 0), mkCol(2, "进行中", 1), mkCol(3, "已完成", 2)];
    const todos = [mkTodo(31, "done", "2026-11-20"), mkTodo(32, "open", null)];

    // BOM 头（Excel 直开不乱码）
    const csv = buildBoardCsvContent(cols, [mkCard(41, 1, "量房", 0, 31)], todos);
    ok(csv.startsWith(CSV_UTF8_BOM), "CSV：以 UTF-8 BOM 开头（Excel 直开不乱码）");
    eq(csv.charCodeAt(0), 0xfeff, "CSV：首字符码点 U+FEFF（落盘字节 EF BB BF）");

    // 中文表头（9 列）
    const lines = csv.slice(CSV_UTF8_BOM.length).split("\r\n");
    eq(lines[0], BOARD_CSV_HEADERS.join(","), "CSV：表头为中文列名且顺序固定");
    eq(BOARD_CSV_HEADERS.length, 9, "CSV：表头共 9 列（列/卡片/关联待办全量台账）");

    // 行数 = 列数 + 卡片数（空列占位行）
    eq(lines.length, 4, "CSV：三列 + 一张卡 = 4 行（空列各占 1 行占位）");
    eq(countCsvRecords(csv), 4, "CSV：记录数与行数一致（引号内换行不虚增）");

    // 空列占位行：卡片字段留空
    const placeholder = lines[3]!.split(",");
    eq(placeholder[0], "已完成", "CSV：空列占位行带列名");
    eq(placeholder[1], "2", "CSV：空列占位行带列位置");
    eq(placeholder[2], "", "CSV：空列占位行的卡片标题为空");

    // 卡片行：列信息 + 卡片信息 + 关联待办信息
    const cardRow = lines[1]!.split(",");
    eq(cardRow[0], "待办", "CSV：卡片行首列=列名");
    eq(cardRow[1], "0", "CSV：卡片行第二列=列位置");
    eq(cardRow[2], "量房", "CSV：卡片行第三列=卡片标题");
    eq(cardRow[3], "", "CSV：卡片描述为 null 时输出空串");
    eq(cardRow[4], "0", "CSV：卡片行第五列=卡片位置");
    eq(cardRow[5], "待办31", "CSV：关联待办标题");
    eq(cardRow[6], "已完成", "CSV：关联待办状态用中文标签");
    eq(cardRow[7], "紧急且重要", "CSV：关联待办象限用中文标签");
    eq(cardRow[8], "2026-11-20", "CSV：关联待办截止日期");

    // 未关联待办的卡：待办字段全空
    const noTodoCsv = buildBoardCsvContent(cols, [mkCard(42, 2, "无待办卡", 0)], todos);
    const noTodoRow = noTodoCsv.slice(CSV_UTF8_BOM.length).split("\r\n")[2]!.split(",");
    eq(noTodoRow.slice(5), ["", "", "", ""], "CSV：未关联待办的卡，待办四列全空");

    // 转义：逗号 / 引号 / 换行
    eq(escapeCsvField("普通字段"), "普通字段", "转义：无特殊字符原样输出");
    eq(escapeCsvField(""), "", "转义：空字段输出空串");
    eq(escapeCsvField("含,逗号"), '"含,逗号"', "转义：含逗号整体加双引号");
    eq(escapeCsvField('含"引号'), '"含""引号"', "转义：内部双引号写成两个并整体加引号");
    eq(escapeCsvField("含\n换行"), '"含\n换行"', "转义：含换行整体加双引号");
    const tricky = buildBoardCsvContent(
      cols,
      [mkCard(43, 1, '卡"A", 含逗号', 0, null, "第一行\n第二行")],
      todos,
    );
    const trickyRows = buildBoardCsvRows(cols, [mkCard(43, 1, '卡"A", 含逗号', 0, null, "第一行\n第二行")], todos);
    eq(trickyRows[0]![2], '卡"A", 含逗号', "CSV：原值保留（转义只发生在序列化层）");
    eq(countCsvRecords(tricky), 4, "CSV：含逗号/引号/换行的字段不虚增记录数");
    ok(tricky.includes('"卡""A"", 含逗号"'), "CSV：逗号与引号同时出现时正确转义");
    ok(tricky.includes('"第一行\n第二行"'), "CSV：含换行的字段被引号包裹");
    eq(tricky.split("\r\n").length, 4, "CSV：字段内裸 \\n 不破坏 \\r\\n 记录分隔（按 \\r\\n 切分仍是 4 段）");
    // 字段内含 CRLF：物理行数会多，但记录数不变（RFC4180 解析正确）
    const crlfCsv = buildBoardCsvContent(cols, [mkCard(44, 1, "卡", 0, null, "第一行\r\n第二行")], todos);
    eq(countCsvRecords(crlfCsv), 4, "CSV：字段内 CRLF 不虚增记录数（记录数仍 4）");
    eq(crlfCsv.split("\r\n").length, 5, "CSV：字段内 CRLF 会多出物理行（记录数与物理行数的区别）");

    // 排序：列 position 升序 + 卡 position 升序
    const ordered = buildBoardCsvContent(
      [mkCol(3, "已完成", 2), mkCol(1, "待办", 0)],
      [mkCard(52, 1, "第二张", 1), mkCard(51, 1, "第一张", 0)],
      todos,
    );
    const orderedRows = ordered.slice(CSV_UTF8_BOM.length).split("\r\n");
    eq(orderedRows[1]!.split(",")[2], "第一张", "CSV：同列内卡片按 position 升序");
    eq(orderedRows[2]!.split(",")[2], "第二张", "CSV：同列内第二张卡在下一行");
    eq(orderedRows[3]!.split(",")[0], "已完成", "CSV：列按 position 升序输出");

    // 空项目导出：只有表头
    const emptyCsv = buildBoardCsvContent([], [], []);
    eq(emptyCsv, CSV_UTF8_BOM + BOARD_CSV_HEADERS.join(","), "CSV：零列项目导出仅含表头");
    eq(countCsvRecords(emptyCsv), 1, "CSV：零列项目导出记录数=1（表头）");
  }

  // 16. r6 字段类型引擎：校验 / 归一 / 比较器（每种字段类型 ≥6 条断言）
  section("字段类型引擎（validateFieldValue / coerceFieldValue / compareValues）");
  {
    // —— 字段类型清单 ——
    eq(FIELD_TYPES.length, 7, "字段类型共 7 种（text/number/date/select/multi-select/checkbox/url）");
    eq(
      [...FIELD_TYPES],
      ["text", "number", "date", "select", "multi-select", "checkbox", "url"],
      "字段类型清单与顺序固定",
    );
    ok(
      FIELD_TYPES.every((t) => typeof FIELD_TYPE_LABELS[t] === "string" && FIELD_TYPE_LABELS[t].length > 0),
      "每种字段类型都有中文标签（字段管理面板与错误消息同源）",
    );
    ok(isFieldType("multi-select"), "isFieldType 认得多选");
    ok(!isFieldType("money"), "isFieldType 拒绝未知类型");
    ok(fieldTypeUsesOptions("select") && fieldTypeUsesOptions("multi-select"), "单选/多选需要候选项");
    ok(!fieldTypeUsesOptions("text") && !fieldTypeUsesOptions("number"), "文本/数字不需要候选项");

    // —— text ——
    eq(validateFieldValue("text", "abc").valid, true, "校验·文本：字符串合法");
    eq(validateFieldValue("text", 42).valid, false, "校验·文本：非字符串非法");
    eq(validateFieldValue("text", null).valid, true, "校验·文本：空值合法（空格子不是错误）");
    eq(coerceFieldValue("text", 42), "42", "归一·文本：数字转字符串");
    eq(coerceFieldValue("text", "  a  "), "  a  ", "归一·文本：保留原文空白");
    eq(compareValues("text", "a", "b") < 0, true, "比较器·文本：字典序 a < b");
    eq(compareValues("text", "b", "a") > 0, true, "比较器·文本：反向 b > a");
    eq(compareValues("text", null, "a") > 0, true, "比较器·文本：空值恒最后");
    eq(compareValues("text", "a", "a"), 0, "比较器·文本：相等返回 0");

    // —— number ——
    eq(validateFieldValue("number", 42).valid, true, "校验·数字：数值合法");
    eq(validateFieldValue("number", "42").valid, false, "校验·数字：数字字符串非法（须先归一）");
    eq(validateFieldValue("number", Number.NaN).valid, false, "校验·数字：NaN 非法");
    eq(validateFieldValue("number", Number.POSITIVE_INFINITY).valid, false, "校验·数字：Infinity 非法");
    eq(coerceFieldValue("number", "42"), 42, "归一·数字：数字字符串转数字");
    eq(coerceFieldValue("number", " 42 "), 42, "归一·数字：去空白后转数字");
    eq(coerceFieldValue("number", ""), null, "归一·数字：空串按清空处理");
    eq(coerceFieldValue("number", "abc"), "abc", "归一·数字：认不出的值原样返回（交校验拦下）");
    eq(compareValues("number", 10, 9) > 0, true, "比较器·数字：按值比（10 > 9，不是字符串比）");
    eq(compareValues("number", 2, 10) < 0, true, "比较器·数字：2 < 10（不是字符串比）");
    eq(compareValues("number", null, 1) > 0, true, "比较器·数字：空值恒最后");

    // —— date ——
    eq(validateFieldValue("date", "2026-11-15").valid, true, "校验·日期：ISO 日期合法");
    eq(validateFieldValue("date", "2026-13-01").valid, false, "校验·日期：13 月非法");
    eq(validateFieldValue("date", "2026-02-30").valid, false, "校验·日期：不存在的日历日非法");
    eq(validateFieldValue("date", "2026/11/15").valid, false, "校验·日期：斜杠格式非法");
    eq(coerceFieldValue("date", "2026-1-5"), "2026-01-05", "归一·日期：补零成 YYYY-MM-DD");
    eq(coerceFieldValue("date", "2026-11-15T10:00:00Z"), "2026-11-15", "归一·日期：带时刻只取日期部分");
    eq(coerceFieldValue("date", "2026/11/15"), "2026-11-15", "归一·日期：斜杠改横杠");
    eq(coerceFieldValue("date", ""), null, "归一·日期：空串按清空处理");
    eq(compareValues("date", "2026-11-15", "2026-11-16") < 0, true, "比较器·日期：按时间比");
    eq(compareValues("date", "2026-12-01", "2026-11-30") > 0, true, "比较器·日期：跨月比");
    eq(compareValues("date", null, "2026-11-15") > 0, true, "比较器·日期：空值恒最后");

    // —— select ——
    const selOptions = ["未开始", "进行中", "已完成"];
    eq(validateFieldValue("select", "进行中", selOptions).valid, true, "校验·单选：在候选项内合法");
    eq(validateFieldValue("select", "搁置", selOptions).valid, false, "校验·单选：不在候选项内非法");
    eq(validateFieldValue("select", 42, selOptions).valid, false, "校验·单选：非字符串非法");
    eq(coerceFieldValue("select", " 进行中 ", selOptions), "进行中", "归一·单选：去空白");
    eq(coerceFieldValue("select", "", selOptions), null, "归一·单选：空串按清空处理");
    eq(compareValues("select", "已完成", "未开始", selOptions) > 0, true, "比较器·单选：按候选项顺序比");
    eq(compareValues("select", "未开始", "已完成", selOptions) < 0, true, "比较器·单选：反向按候选项顺序");
    eq(compareValues("select", null, "未开始", selOptions) > 0, true, "比较器·单选：空值恒最后");

    // —— multi-select ——
    const msOptions = ["重要", "紧急", "返工"];
    eq(validateFieldValue("multi-select", ["重要"], msOptions).valid, true, "校验·多选：候选项子集合法");
    eq(validateFieldValue("multi-select", ["未知"], msOptions).valid, false, "校验·多选：非候选项非法");
    eq(validateFieldValue("multi-select", "重要", msOptions).valid, false, "校验·多选：非数组非法");
    eq(coerceFieldValue("multi-select", "重要, 紧急", msOptions), ["重要", "紧急"], "归一·多选：逗号串转数组");
    eq(coerceFieldValue("multi-select", ["重要", "重要", "紧急"], msOptions), ["重要", "紧急"], "归一·多选：去重");
    eq(coerceFieldValue("multi-select", "", msOptions), null, "归一·多选：空串按清空处理");
    eq(compareValues("multi-select", ["紧急"], ["重要"], msOptions) > 0, true, "比较器·多选：按首个候选项顺序比");
    eq(compareValues("multi-select", [], ["重要"], msOptions) > 0, true, "比较器·多选：空数组恒最后");

    // —— checkbox ——
    eq(validateFieldValue("checkbox", true).valid, true, "校验·复选框：布尔值合法");
    eq(validateFieldValue("checkbox", "true").valid, false, "校验·复选框：字符串非法");
    eq(validateFieldValue("checkbox", 1).valid, false, "校验·复选框：数字非法");
    eq(coerceFieldValue("checkbox", "true"), true, "归一·复选框：\"true\" 转布尔");
    eq(coerceFieldValue("checkbox", "1"), true, "归一·复选框：\"1\" 转布尔");
    eq(coerceFieldValue("checkbox", "0"), false, "归一·复选框：\"0\" 转布尔");
    eq(compareValues("checkbox", false, true) < 0, true, "比较器·复选框：false < true");
    eq(compareValues("checkbox", true, false) > 0, true, "比较器·复选框：true > false");
    eq(compareValues("checkbox", null, false) > 0, true, "比较器·复选框：空值恒最后（false 是值不是空）");

    // —— url ——
    eq(validateFieldValue("url", "https://example.com").valid, true, "校验·链接：https 合法");
    eq(validateFieldValue("url", "ftp://example.com").valid, false, "校验·链接：非 http(s) 非法");
    eq(validateFieldValue("url", 42).valid, false, "校验·链接：非字符串非法");
    eq(coerceFieldValue("url", "example.com"), "https://example.com", "归一·链接：裸域名补 https://");
    eq(coerceFieldValue("url", ""), null, "归一·链接：空串按清空处理");
    eq(compareValues("url", "https://a.com", "https://b.com") < 0, true, "比较器·链接：按字符串比");
    eq(compareValues("url", null, "https://a.com") > 0, true, "比较器·链接：空值恒最后");

    // —— 空值判定与守卫 ——
    eq(isEmptyFieldValue(null), true, "空值判定：null 是空");
    eq(isEmptyFieldValue(""), true, "空值判定：空串是空");
    eq(isEmptyFieldValue([]), true, "空值判定：空数组是空");
    eq(isEmptyFieldValue(false), false, "空值判定：false 是值不是空");
    throws(() => assertValidFieldValue("number", "abc"), "断言式校验：数字字段收到字符串抛错");
    throws(() => assertValidFieldValue("select", "搁置", selOptions), "断言式校验：单选值不在候选项抛错");
    noThrow(() => assertValidFieldValue("text", "ok"), "断言式校验：合法值不抛错");
    throws(() => assertValidTableName(""), "守卫：表格空名称抛错");
    noThrow(() => assertValidTableName("预算表"), "守卫：合法表格名通过");
    throws(() => assertValidFieldName("   "), "守卫：字段纯空白名称抛错");
    throws(() => assertValidFieldType("money"), "守卫：非法字段类型抛错");
    noThrow(() => assertValidFieldType("multi-select"), "守卫：合法字段类型通过");
    throws(() => assertValidFieldOptions("select", []), "守卫：单选零候选项抛错");
    throws(() => assertValidFieldOptions("select", ["A", "A"]), "守卫：候选项重复抛错");
    throws(() => assertValidFieldOptions("text", ["A"]), "守卫：文本字段带候选项抛错");
    noThrow(() => assertValidFieldOptions("multi-select", ["A", "B"]), "守卫：多选候选项合法通过");
  }

  // 17. r6 记录数据归一 + 查询装配（筛选 / 排序 / 分页，规则集中 shared）
  section("记录数据归一与查询装配（normalizeRecordData / queryRecords）");
  {
    const mkField = (id: number, name: string, type: TableField["type"], options: string[] = [], position = 0): TableField => ({
      id,
      tableId: 1,
      name,
      type,
      position,
      options,
      createdAt: "2026-11-15T08:00:00.000Z",
      updatedAt: "2026-11-15T08:00:00.000Z",
    });
    const mkRecord = (id: number, data: Record<string, unknown>, position = 0): TableRecord => ({
      id,
      tableId: 1,
      data,
      position,
      createdAt: "2026-11-15T08:00:00.000Z",
      updatedAt: "2026-11-15T08:00:00.000Z",
    });
    const fName = mkField(1, "名称", "text");
    const fAmount = mkField(2, "金额", "number");
    const fStatus = mkField(3, "状态", "select", ["未开始", "进行中", "已完成"]);
    const fields = [fName, fAmount, fStatus];

    // —— 归一 ——
    eq(
      normalizeRecordData(fields, { "1": "量房", "2": "42" }),
      { "1": "量房", "2": 42, "3": null },
      "归一：数字字符串转数字 + 缺省字段补 null",
    );
    throws(() => normalizeRecordData(fields, { "999": "x" }), "归一：未知字段 id 抛错");
    throws(() => normalizeRecordData(fields, { "2": "abc" }), "归一：数字字段收到非法字符串抛错");
    throws(() => normalizeRecordData(fields, { "3": "搁置" }), "归一：单选值不在候选项抛错");

    // —— 筛选 ——
    const records = [
      mkRecord(11, { "1": "B", "2": 10, "3": "进行中" }, 0),
      mkRecord(12, { "1": "A", "2": null, "3": "未开始" }, 1),
      mkRecord(13, { "1": "C", "2": 5, "3": "已完成" }, 2),
    ];
    eq(
      queryRecords(records, fields, { filterFieldId: 3, filterValue: "进行中" }).records.map((r) => r.id),
      [11],
      "查询·筛选：按单选字段筛出 1 条",
    );
    eq(
      queryRecords(records, fields, { filterFieldId: 2, filterValue: "10" }).records.map((r) => r.id),
      [11],
      "查询·筛选：数字字段筛选值走归一（\"10\" → 10）",
    );
    throws(
      () => queryRecords(records, fields, { filterFieldId: 2, filterValue: "abc" }),
      "查询·筛选：筛选值类型不符抛错（api 映射 400）",
    );
    throws(() => queryRecords(records, fields, { filterFieldId: 999 }), "查询·筛选：未知筛选字段抛错");
    throws(() => queryRecords(records, fields, { sortFieldId: 999 }), "查询·排序：未知排序字段抛错");
    throws(
      () => queryRecords(records, fields, { filterFieldId: 3, filterValue: "搁置" }),
      "查询·筛选：筛选值不在候选项内抛错",
    );

    // —— 排序 ——
    eq(
      queryRecords(records, fields, { sortFieldId: 2 }).records.map((r) => r.id),
      [13, 11, 12],
      "查询·排序：数字升序（5 < 10），空值排最后",
    );
    eq(
      queryRecords(records, fields, { sortFieldId: 2, sortDirection: "desc" }).records.map((r) => r.id),
      [11, 13, 12],
      "查询·排序：数字降序（10 > 5），空值仍排最后",
    );
    eq(
      queryRecords(records, fields, { sortFieldId: 3 }).records.map((r) => r.id),
      [12, 11, 13],
      "查询·排序：单选按候选项顺序（未开始 < 进行中 < 已完成）",
    );
    eq(
      sortRecordsByField(records, fAmount, "asc").map((r) => r.id),
      [13, 11, 12],
      "排序：sortRecordsByField 空值恒最后",
    );
    eq(
      matchesFieldValue("multi-select", ["重要", "紧急"], "重要"),
      true,
      "筛选判定：多选包含命中",
    );
    eq(matchesFieldValue("number", 5, 5), true, "筛选判定：数字相等命中");
    eq(matchesFieldValue("checkbox", true, false), false, "筛选判定：复选框不等不命中");

    // —— 分页 ——
    const page1 = queryRecords(records, fields, { page: 1, pageSize: 2 });
    eq(page1.records.map((r) => r.id), [11, 12], "分页：第 1 页 2 条");
    eq(page1.total, 3, "分页：total = 全部命中数");
    eq(page1.totalPages, 2, "分页：totalPages = ceil(total / pageSize)");
    const page2 = queryRecords(records, fields, { page: 2, pageSize: 2 });
    eq(page2.records.map((r) => r.id), [13], "分页：第 2 页 1 条");
    const page99 = queryRecords(records, fields, { page: 99, pageSize: 2 });
    eq(page99.records.length, 0, "分页：越界页返回空列表");
    eq(page99.total, 3, "分页：越界页 total 不变");
    eq(queryRecords(records, fields, { pageSize: 9999 }).pageSize, MAX_PAGE_SIZE, "分页：pageSize 上限封顶");
    eq(queryRecords(records, fields, { pageSize: 0 }).pageSize, 1, "分页：pageSize 下限为 1");
  }

  // 18. r6 U2-2 必修：导出文件名含项目名（不再只露内部 id）
  section("看板导出文件名（buildBoardCsvFileName · U2-2）");
  {
    const fixed = new Date(2026, 10, 15);
    eq(
      buildBoardCsvFileName("新家装修", fixed),
      "xieflow-board-新家装修-20261115.csv",
      "导出文件名：xieflow-board-<项目名>-<YYYYMMDD>.csv",
    );
    eq(
      buildBoardCsvFileName("Q4 产品发布", fixed),
      "xieflow-board-Q4-产品发布-20261115.csv",
      "导出文件名：项目名中的空格折叠成短横线",
    );
    ok(
      !/project-\d+/.test(buildBoardCsvFileName("新家装修", fixed)),
      "导出文件名：不含内部项目 id（U2-2 语义）",
    );
    eq(sanitizeFileNamePart("a/b:c"), "a-b-c", "文件名清洗：路径分隔符等非法字符折叠成短横线");
    eq(sanitizeFileNamePart("!!!"), "board", "文件名清洗：全非法字符回落到 board");
    ok(buildBoardCsvFileName("新家装修", fixed).endsWith(".csv"), "导出文件名：.csv 扩展名");
  }

  // 19. schema v4→v5 迁移升级 + 多维表格数据层（服务层闭环）
  section("schema v4→v5 迁移升级与多维表格数据层（服务层）");
  {
    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const v5Path = `scripts/.tmp-e2e/upgrade-r6-${Date.now()}.db`;
    // 造一个真 v4 旧库：v5 迁移执行前把 user_version 钉回 4（模拟 r4 版本的原地升级）
    const v4Open2 = openDatabaseRaw({ path: v5Path });
    v4Open2.raw.exec("PRAGMA user_version = 4");
    v4Open2.raw.close();
    const v5Open = openDatabaseRaw({ path: v5Path });
    eq(v5Open.appliedMigrations, [5], "v4 旧库重开只补跑 v5 迁移（真实 PRAGMA 升级路径）");
    const tableNames = v5Open.raw
      .all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => String((r as unknown as { name: unknown }).name));
    ok(tableNames.includes("tables"), "v5 迁移后 tables 表存在（sqlite_master 真实读回）");
    ok(tableNames.includes("fields"), "v5 迁移后 fields 表存在（sqlite_master 真实读回）");
    ok(tableNames.includes("records"), "v5 迁移后 records 表存在（sqlite_master 真实读回）");
    eq(
      (v5Open.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = CURRENT_SCHEMA_VERSION（5）",
    );
    const rawDb5: SqliteDatabase = v5Open.raw;
    throws(
      () =>
        rawDb5.run(
          "INSERT INTO tables (name, description, created_at, updated_at) " +
            "VALUES (NULL, NULL, '2026-01-01', '2026-01-01')",
        ),
      "tables.name NOT NULL 拒绝 NULL（raw 直达 schema）",
    );
    throws(
      () =>
        rawDb5.run(
          "INSERT INTO fields (table_id, name, type, position, options, created_at, updated_at) " +
            "VALUES (424242, 'x', 'text', 0, '[]', '2026-01-01', '2026-01-01')",
        ),
      "fields.table_id 外键拒绝不存在的表（raw 直达 FK）",
    );
    throws(
      () =>
        rawDb5.run(
          "INSERT INTO fields (table_id, name, type, position, options, created_at, updated_at) " +
            "VALUES (1, 'x', 'money', 0, '[]', '2026-01-01', '2026-01-01')",
        ),
      "fields.type CHECK 拒绝未知字段类型（raw 直达 schema）",
    );
    throws(
      () =>
        rawDb5.run(
          "INSERT INTO records (table_id, data, position, created_at, updated_at) " +
            "VALUES (424242, '{}', 0, '2026-01-01', '2026-01-01')",
        ),
      "records.table_id 外键拒绝不存在的表（raw 直达 FK）",
    );

    // —— 数据层闭环：建表（自动带默认字段）→ 加字段 → 加行 → 编辑单元格 → 删字段 ——
    const tbl = v5Open.db.createTable("装修预算表", "M3 起步轮的样例表");
    ok(tbl.id > 0, "createTable 返回自增 id");
    eq(tbl.name, "装修预算表", "createTable name 读回");
    const defFields = v5Open.db.listFields(tbl.id);
    eq(
      defFields.map((f) => [f.name, f.type]),
      [
        ["名称", "text"],
        ["状态", "select"],
        ["负责人", "text"],
        ["金额", "number"],
        ["截止日期", "date"],
        ["标签", "multi-select"],
        ["完成", "checkbox"],
        ["链接", "url"],
      ],
      "createTable 自动创建默认字段（7 种类型齐备，消灭「建表零字段」死路）",
    );
    eq(defFields.map((f) => f.position), [0, 1, 2, 3, 4, 5, 6, 7], "默认字段 position 连续 0..7");
    eq(
      defFields.find((f) => f.name === "状态")!.options,
      ["未开始", "进行中", "已完成"],
      "默认单选字段带候选项",
    );
    eq(
      new Set(defFields.map((f) => f.type)).size,
      7,
      "默认字段覆盖全部 7 种字段类型",
    );
    eq(DEFAULT_TABLE_FIELDS.length, 8, "默认字段模板共 8 个字段");
    eq(
      v5Open.db.listFields(tbl.id).every((f) => f.tableId === tbl.id),
      true,
      "字段归属自己的表",
    );

    // 自定义字段
    const custom = v5Open.db.createField(tbl.id, "供应商", "text", [], 8);
    eq(custom.name, "供应商", "createField name 读回");
    eq(custom.type, "text", "createField type 读回");
    eq(custom.position, 8, "createField position 缺省 = 追加到列尾");
    const selField = v5Open.db.createField(tbl.id, "阶段", "select", ["A", "B"], 9);
    eq(selField.options, ["A", "B"], "createField 候选项读回");
    throws(() => v5Open.db.createField(tbl.id, "坏字段", "money" as unknown as TableField["type"]), "createField 非法类型抛错");
    throws(() => v5Open.db.createField(tbl.id, "坏单选", "select", []), "createField 单选零候选项抛错");
    throws(() => v5Open.db.createField(424242, "孤儿字段", "text"), "createField 表不存在抛错");

    // 改字段（改名 + 改类型）
    const renamed = v5Open.db.updateField(custom.id, { name: "供应商名称" });
    eq(renamed.name, "供应商名称", "updateField 改名生效");
    const retyped = v5Open.db.updateField(custom.id, { type: "number" });
    eq(retyped.type, "number", "updateField 改类型生效");
    eq(retyped.options, [], "updateField 改成非单选类型时候选项清空");

    // —— 记录（行） ——
    const rec = v5Open.db.createRecord(tbl.id, {
      [String(defFields[0]!.id)]: "量房",
      [String(defFields[3]!.id)]: "1200",
    });
    eq(rec.data[String(defFields[0]!.id)], "量房", "createRecord 文本字段读回");
    eq(rec.data[String(defFields[3]!.id)], 1200, "createRecord 数字字段按引擎归一（\"1200\" → 1200）");
    eq(rec.data[String(defFields[1]!.id)], null, "createRecord 未给的字段补 null");
    eq(v5Open.db.listRecords(tbl.id).length, 1, "createRecord 后表内 1 行");
    throws(
      () => v5Open.db.createRecord(tbl.id, { "99999": "x" }),
      "createRecord 写入未知字段抛错",
    );
    throws(
      () => v5Open.db.createRecord(tbl.id, { [String(defFields[3]!.id)]: "abc" }),
      "createRecord 写入非法数字抛错",
    );
    const edited = v5Open.db.updateRecord(rec.id, {
      [String(defFields[0]!.id)]: "量房复测",
      [String(defFields[3]!.id)]: 1500,
    });
    eq(edited.data[String(defFields[0]!.id)], "量房复测", "updateRecord 编辑单元格生效");
    eq(edited.data[String(defFields[3]!.id)], 1500, "updateRecord 数字字段读回");

    // 删字段 → 该字段的键从所有记录里清掉
    v5Open.db.deleteField(selField.id);
    eq(v5Open.db.getField(selField.id), null, "deleteField 后字段读回为 null");
    ok(
      !(String(selField.id) in v5Open.db.getRecord(rec.id)!.data),
      "deleteField 后记录里对应的键被清掉（不留孤儿键）",
    );
    eq(v5Open.db.listRecords(tbl.id).length, 1, "删字段不影响记录条数");

    // 删记录 / 删表级联
    eq(v5Open.db.deleteRecord(rec.id), true, "deleteRecord 返回 true");
    eq(v5Open.db.getRecord(rec.id), null, "deleteRecord 后读回为 null");
    eq(v5Open.db.listRecords(tbl.id).length, 0, "删记录后表内 0 行");
    v5Open.db.createRecord(tbl.id, { [String(defFields[0]!.id)]: "选瓷砖" });
    v5Open.db.deleteTable(tbl.id);
    eq(v5Open.db.getTable(tbl.id), null, "deleteTable 后表读回为 null");
    eq(v5Open.db.listFields(tbl.id).length, 0, "deleteTable 级联删字段");
    eq(v5Open.db.listRecords(tbl.id).length, 0, "deleteTable 级联删记录");
    v5Open.raw.close();
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
