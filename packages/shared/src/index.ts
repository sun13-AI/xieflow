// 协流 XieFlow — 数据契约与状态定义（宪法第七条：状态机只准住在这里）

/** 待办四象限：urgent × important 二维 */
export type Quadrant = "q1" | "q2" | "q3" | "q4";

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  q1: "紧急且重要",
  q2: "不紧急但重要",
  q3: "紧急但不重要",
  q4: "不紧急不重要",
};

/** 待办状态机（集中定义，禁止散落 if-else） */
export type TodoStatus = "open" | "done" | "archived";

export const TODO_STATUS_TRANSITIONS: Record<TodoStatus, readonly TodoStatus[]> = {
  open: ["done", "archived"],
  done: ["open", "archived"],
  archived: ["open"],
};

export function canTransitionTodo(from: TodoStatus, to: TodoStatus): boolean {
  return TODO_STATUS_TRANSITIONS[from].includes(to);
}

/** 待办领域对象 */
export interface Todo {
  id: number;
  title: string;
  quadrant: Quadrant;
  status: TodoStatus;
  dueDate: string | null; // ISO 日期 YYYY-MM-DD
  createdAt: string; // ISO 时间戳
  updatedAt: string;
}

/** 「今/明/周汇总」计数 */
export interface TodoSummary {
  today: number;
  tomorrow: number;
  week: number;
  byQuadrant: Record<Quadrant, number>;
}

export const EMPTY_SUMMARY: TodoSummary = {
  today: 0,
  tomorrow: 0,
  week: 0,
  byQuadrant: { q1: 0, q2: 0, q3: 0, q4: 0 },
};

/** 「周窗口」长度（含今天）：今/明都落在窗口内，第 7 天之后的截止日不算本周 */
export const WEEK_WINDOW_DAYS = 7;

/** 本地时区 YYYY-MM-DD（今天）。汇总计数全部以本地日期为锚，不用 UTC（跨时区不漂移）。 */
export function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 本地时区当天 0 点起的第 n 天的 YYYY-MM-DD（n 可为负） */
export function localDateOffset(days: number, now: Date = new Date()): string {
  return localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
}

/**
 * 待办汇总计数（今/明/周 + 四象限）。
 * today/tomorrow/week 只数 open（已完成/归档的不占「到期焦虑」位）；
 * byQuadrant 数全部状态（象限是分区视图，归档项也要看得见）。
 * 此纯函数是 api GET /api/todos 的 summary 计算唯一入口（r2 任务单：象限计数逻辑在 api 侧实现并断言）。
 */
export function computeTodoSummary(todos: readonly Todo[], now: Date = new Date()): TodoSummary {
  const todayStr = localDateStr(now);
  const weekEndStr = localDateOffset(WEEK_WINDOW_DAYS - 1, now);
  const summary: TodoSummary = {
    today: 0,
    tomorrow: 0,
    week: 0,
    byQuadrant: { q1: 0, q2: 0, q3: 0, q4: 0 },
  };
  for (const t of todos) {
    summary.byQuadrant[t.quadrant] += 1;
    if (!t.dueDate) continue;
    const isThisWeek = t.dueDate >= todayStr && t.dueDate <= weekEndStr;
    if (!isThisWeek) continue;
    if (t.status !== "open") continue;
    summary.week += 1;
    if (t.dueDate === todayStr) summary.today += 1;
    if (t.dueDate === localDateOffset(1, now)) summary.tomorrow += 1;
  }
  return summary;
}

/** 严格 YYYY-MM-DD 且是真实存在的日历日期（2026-02-30 会被拒） */
export function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00`).getTime()) &&
    localDateStr(new Date(`${value}T00:00:00`)) === value
  );
}

// ---- 输入守卫（api 与 db 服务层共用；r2 收紧：先守卫、后落库） ----

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** 待办标题长度上限（r2 返工 #1·D：5000 字标题 201 落库且 UI 横向溢出，前后端共用同一上限） */
export const MAX_TODO_TITLE = 200;

export function assertValidQuadrant(quadrant: unknown): asserts quadrant is Quadrant {
  if (typeof quadrant !== "string" || !QUADRANT_LABELS[quadrant as Quadrant]) {
    throw new ValidationError(`非法象限：${String(quadrant)}`);
  }
}

export function assertValidTodoStatus(status: unknown): asserts status is TodoStatus {
  if (typeof status !== "string" || !TODO_STATUS_TRANSITIONS[status as TodoStatus]) {
    throw new ValidationError(`非法状态：${String(status)}`);
  }
}

export function assertValidTitle(title: unknown): asserts title is string {
  if (typeof title !== "string" || title.trim() === "") {
    throw new ValidationError("待办标题不能为空");
  }
  if (title.length > MAX_TODO_TITLE) {
    throw new ValidationError(`待办标题过长：最多 ${MAX_TODO_TITLE} 字（当前 ${title.length} 字）`);
  }
}

export function assertValidDueDate(dueDate: unknown): asserts dueDate is string | null {
  if (dueDate === null || dueDate === undefined) return;
  if (!isIsoDate(dueDate)) {
    throw new ValidationError(`非法截止日期：${String(dueDate)}`);
  }
}

/** 应用设置（r1 仅此一张业务表） */
export interface AppSetting {
  key: string;
  value: string;
  updatedAt: string;
}

// ---- r3：日程与待办双向联动（数据契约、守卫、循环实例化规则集中在此） ----

/** 日程重复规则：none 不重复 / daily 每天 / weekly 每周 / monthly 每月 */
export type ScheduleRepeat = "none" | "daily" | "weekly" | "monthly";

export const REPEAT_LABELS: Record<ScheduleRepeat, string> = {
  none: "不重复",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
};

const REPEATS: readonly ScheduleRepeat[] = ["none", "daily", "weekly", "monthly"];

/** 严格 HH:mm（00:00~23:59，零填充，不允许空白/24 点/60 分） */
export function isIsoTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** 日程领域对象 */
export interface Schedule {
  id: number;
  title: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string; // HH:mm
  todoId: number | null; // 关联待办（可空外键；联动载体）
  repeat: ScheduleRepeat;
  createdAt: string;
  updatedAt: string;
}

/** 联动默认时段：待办设 due_date 自动生成的日程占当天 09:00~10:00 */
export const LINK_SCHEDULE_DEFAULT_START = "09:00";
export const LINK_SCHEDULE_DEFAULT_END = "10:00";

/** 循环实例化扫描窗口上限（天）：防无限窗口拖垮性能，实例数封顶 */
export const MAX_REPEAT_HORIZON_DAYS = 100;

export function assertValidScheduleTitle(title: unknown): asserts title is string {
  if (typeof title !== "string" || title.trim() === "") {
    throw new ValidationError("日程标题不能为空");
  }
  if (title.length > MAX_TODO_TITLE) {
    throw new ValidationError(`日程标题过长：最多 ${MAX_TODO_TITLE} 字（当前 ${title.length} 字）`);
  }
}

export function assertValidScheduleDate(date: unknown): asserts date is string {
  if (!isIsoDate(date)) {
    throw new ValidationError(`非法日程日期：${String(date)}`);
  }
}

export function assertValidScheduleTime(time: unknown): asserts time is string {
  if (!isIsoTime(time)) {
    throw new ValidationError(`非法日程时间：${String(time)}`);
  }
}

export function assertValidScheduleRange(start: unknown, end: unknown): void {
  assertValidScheduleTime(start);
  assertValidScheduleTime(end);
  if (end <= start) {
    throw new ValidationError(`日程结束时间必须晚于开始时间：${start} → ${end}`);
  }
}

export function assertValidScheduleRepeat(repeat: unknown): asserts repeat is ScheduleRepeat {
  if (typeof repeat !== "string" || !REPEATS.includes(repeat as ScheduleRepeat)) {
    throw new ValidationError(`非法重复规则：${String(repeat)}`);
  }
}

/** 月份加法（锚日收敛：1-31 +1 月落在 2 月为 2-28，不跳月；+2 月仍回 3-31，不丢锚日） */
export function addMonths(date: Date, months: number): Date {
  const anchorDay = date.getDate();
  const first = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  first.setDate(Math.min(anchorDay, daysInMonth));
  return first;
}

export interface RepeatWindow {
  from: string; // YYYY-MM-DD（含）
  to: string; // YYYY-MM-DD（含）
}

/**
 * 循环日程实例化规则（r3 任务单：集中定义，禁止散落 if-else）。
 * 返回「查询窗口内的展开实例」：none 仅首日本体（在窗口内时）；
 * daily/weekly/monthly 以 date 为锚日逐周期推进，实例复制本体字段、仅 date 不同，
 * 全部落在窗口内；monthly 始终按原始锚日推算（1-31 在 2 月收敛为 2-28，3 月回 3-31）。
 * 锚日早于窗口时快进到窗口起点再收集；实例数封顶 MAX_REPEAT_HORIZON_DAYS。
 * 窗口非法（to < from）抛 ValidationError。
 */
export function computeRepeatInstances(
  schedule: Schedule,
  window: RepeatWindow,
): Schedule[] {
  assertValidScheduleDate(window.from);
  assertValidScheduleDate(window.to);
  assertValidScheduleRepeat(schedule.repeat);
  if (window.to < window.from) {
    throw new ValidationError(`实例化窗口非法：${window.from} → ${window.to}`);
  }
  const anchor = new Date(`${schedule.date}T00:00:00`);
  const fromTime = new Date(`${window.from}T00:00:00`).getTime();
  const toTime = new Date(`${window.to}T00:00:00`).getTime();
  const instances: Schedule[] = [];
  if (schedule.repeat === "none") {
    if (anchor.getTime() >= fromTime && anchor.getTime() <= toTime) {
      instances.push({ ...schedule });
    }
    return instances;
  }
  const stepDays = schedule.repeat === "weekly" ? 7 : 1;
  const advance = (d: Date): Date =>
    schedule.repeat === "monthly"
      ? addMonths(anchor, Math.round((d.getFullYear() - anchor.getFullYear()) * 12 + d.getMonth() - anchor.getMonth()) + 1)
      : new Date(d.getFullYear(), d.getMonth(), d.getDate() + stepDays);
  let cursor = anchor;
  // 快进：锚日在窗口前时按周期推进到窗口起点（daily 最多数千次廉价日期运算）
  while (cursor.getTime() < fromTime) {
    cursor = advance(cursor);
  }
  while (cursor.getTime() <= toTime && instances.length < MAX_REPEAT_HORIZON_DAYS) {
    instances.push({ ...schedule, date: localDateStr(cursor) });
    cursor = advance(cursor);
  }
  return instances;
}

/** 区间查询装配结果：本体与实例共用 Schedule 契约，isInstance 区分来源 */
export interface ScheduleWithInstanceFlag extends Schedule {
  isInstance: boolean;
}

/**
 * 区间查询装配规则（r3 返工#1 A：api GET /api/schedules 的唯一装配入口）。
 * 输入全量日程 + 查询窗口：
 * ① date 落窗内的日程作为本体返回（isInstance:false）；
 * ② repeat 日程不论锚日是否在窗内，其在窗口内的循环实例都参与并集——
 *   本体 date 落窗外的循环日程也必须展开（不能只展开 date 落窗内的行）；
 * ③ 同 id 同 date 只留一条，本体优先（isInstance:false）；
 * ④ 结果按 date 升序、同日按 start 升序。
 */
export function assembleRangeSchedules(
  schedules: readonly Schedule[],
  window: RepeatWindow,
): ScheduleWithInstanceFlag[] {
  const out = new Map<string, ScheduleWithInstanceFlag>();
  for (const s of schedules) {
    const bodyKey = `${s.id}@${s.date}`;
    if (window.from <= s.date && s.date <= window.to && !out.has(bodyKey)) {
      out.set(bodyKey, { ...s, isInstance: false });
    }
    if (s.repeat === "none") continue;
    for (const inst of computeRepeatInstances(s, window)) {
      const key = `${inst.id}@${inst.date}`;
      if (!out.has(key)) {
        out.set(key, { ...inst, isInstance: inst.date !== s.date });
      }
    }
  }
  return [...out.values()].sort((a, b) =>
    a.date === b.date ? (a.start < b.start ? -1 : 1) : a.date < b.date ? -1 : 1,
  );
}

/** 数据库 schema 版本号，每轮迁移必须 +1（宪法：禁止手改库文件） */
export const SCHEMA_VERSION: number = 18;


/** 迁移脚本类型：user_version 从 from 升到 to */
export interface Migration {
  version: number;
  name: string;
  up: string[]; // 按序执行的 SQL
  /** ADD COLUMN 不支持 IF NOT EXISTS：旧库被测试/回滚重置 user_version 时需存在性守卫，保证迁移幂等 */
  ensureColumns?: readonly { readonly table: string; readonly column: string; readonly sql: string }[];
}

// ---- r4：项目与看板（数据契约、名称守卫、position 重排规则集中在此） ----

/** 项目领域对象 */
export interface Project {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 看板列领域对象（属于一个项目，position 在项目内唯一） */
export interface BoardColumn {
  id: number;
  projectId: number;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** 看板卡片领域对象（属于一个项目与一列，可空关联待办；position 在列内唯一） */
export interface BoardCard {
  id: number;
  projectId: number;
  columnId: number;
  title: string;
  description: string | null;
  position: number;
  todoId: number | null; // 关联待办（可空外键；徽标载体，r3 联动模式复用）
  createdAt: string;
  updatedAt: string;
}

/** 项目/列/卡片名称统一上限（与待办/日程标题同一 MAX_TODO_TITLE=200 口径） */
export const MAX_BOARD_NAME = 200;

/** 默认看板列模板（r4 返工#1 A1）：createProject 自动按此建三列，api/UI/文档同一口径 */
export const DEFAULT_BOARD_COLUMNS: readonly string[] = ["待办", "进行中", "已完成"];

/**
 * 看板名称守卫（项目名 / 列名 / 卡片标题共用同一规则，api 只做 400 映射）。
 * 与 assertValidTodoTitle / assertValidScheduleTitle 同款：非空、≤200 字。
 */
export function assertValidBoardName(name: unknown): asserts name is string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new ValidationError("看板名称不能为空");
  }
  if (name.length > MAX_BOARD_NAME) {
    throw new ValidationError(`看板名称过长：最多 ${MAX_BOARD_NAME} 字（当前 ${name.length} 字）`);
  }
}

/** 重排结果项：卡片 id + 重排后的 position */
export interface ReorderedPosition {
  id: number;
  position: number;
}

/** 重排输入项：至少带 id；带 position 的乱序输入会先按 position 收敛 */
export interface PositionedList {
  id: number;
  position?: number;
}

/**
 * 看板 position 重排规则（r4 任务单：集中定义，禁止散落 if-else）。
 * 把 cardId 从当前位置移到 to（0 起的目标下标），返回**全部受影响卡片**的
 * 新 position（被跨过的卡整体让位）。api 的跨列移动路由用同一函数分别
 * 计算源列与目标列的重排结果，UI 拖拽/按钮移动消费同一规则。
 * 语义：
 * ① 输入先按 position 升序收敛（缺 position 的项保持出现顺序）；
 * ② cardId 必须在列表内，否则抛 ValidationError；
 * ③ to 必须是 0..n-1 的整数，否则抛 ValidationError；
 * ④ 原位移动返回单条恒等映射（api 层据此跳过兄弟卡更新）；
 * ⑤ 输出 position 恰为 0..n-1 连续、无重复。
 */
export function reorderPositions(
  cards: readonly PositionedList[],
  cardId: number,
  to: number,
): ReorderedPosition[] {
  if (!Number.isInteger(to) || to < 0 || to >= cards.length) {
    throw new ValidationError(`重排目标位置非法：${String(to)}（共 ${cards.length} 张卡）`);
  }
  const sorted = cards
    .map((c, i) => ({ id: c.id, order: c.position ?? i }))
    .sort((a, b) => a.order - b.order);
  const fromIdx = sorted.findIndex((c) => c.id === cardId);
  if (fromIdx === -1) {
    throw new ValidationError(`重排目标卡片不在列表内：${String(cardId)}`);
  }
  const [moved] = sorted.splice(fromIdx, 1);
  if (!moved) throw new ValidationError(`重排目标卡片不在列表内：${String(cardId)}`);
  sorted.splice(to, 0, moved);
  return sorted.map((c, i) => ({ id: c.id, position: i }));
}

// ---- r5：看板统计与 CSV 台账导出（口径集中 shared 纯函数，禁止散落 if-else） ----

/** 待办状态中文标签（CSV 台账与 UI 徽标同一口径） */
export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  open: "进行中",
  done: "已完成",
  archived: "已归档",
};

/**
 * 完成率口径（r5 任务单唯一口径，统计与导出共用）：
 * ① 一张卡片算「已完成」当且仅当它关联的待办状态为 done（open/archived 均不算）；
 * ② 列完成率 = 该列已完成卡片数 ÷ 该列卡片总数；项目完成率 = 项目内已完成卡片数 ÷ 项目内卡片总数；
 * ③ 分母为 0 时完成率记 0（不除零、不出 NaN）；结果为整数百分比 0..100（四舍五入）。
 */
export function completionRatePercent(done: number, total: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((done / total) * 100);
}

/** 单列统计 */
export interface BoardColumnStats {
  id: number;
  name: string;
  position: number;
  /** 本列卡片总数 */
  cardCount: number;
  /** 本列已完成卡片数（关联待办状态为 done） */
  doneCount: number;
  /** 本列关联了待办的卡片数 */
  todoLinkedCount: number;
  /** 完成率（整数百分比 0..100；本列零卡时为 0） */
  completionRate: number;
}

/** 项目看板统计（各列 + 合计） */
export interface BoardStats {
  projectId: number;
  columns: BoardColumnStats[];
  totals: {
    columnCount: number;
    cardCount: number;
    doneCount: number;
    todoLinkedCount: number;
    completionRate: number;
  };
}

/** 列按 position 升序（同 position 再按 id），卡按 position 升序（同 position 再按 id） */
function sortColumns(columns: readonly BoardColumn[]): BoardColumn[] {
  return [...columns].sort((a, b) => a.position - b.position || a.id - b.id);
}

function sortCards(cards: readonly BoardCard[]): BoardCard[] {
  return [...cards].sort((a, b) => a.position - b.position || a.id - b.id);
}

function groupCardsByColumn(cards: readonly BoardCard[]): Map<number, BoardCard[]> {
  const map = new Map<number, BoardCard[]>();
  for (const card of cards) {
    const list = map.get(card.columnId) ?? [];
    list.push(card);
    map.set(card.columnId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position || a.id - b.id);
  return map;
}

/**
 * 看板统计唯一入口（r5 任务单：口径集中 shared 纯函数）。
 * api GET /api/projects/:id/stats 与 UI 消费同一结果；卡片移动后统计立即随之变化。
 * 防御：columnId 不属于任何列的卡片不计入统计；todoId 指向不存在的待办时不算已完成。
 */
export function computeBoardStats(
  projectId: number,
  columns: readonly BoardColumn[],
  cards: readonly BoardCard[],
  todos: readonly Todo[],
): BoardStats {
  const doneTodoIds = new Set(todos.filter((t) => t.status === "done").map((t) => t.id));
  const byColumn = groupCardsByColumn(cards);
  const colStats: BoardColumnStats[] = sortColumns(columns).map((col) => {
    const list = byColumn.get(col.id) ?? [];
    let doneCount = 0;
    let todoLinkedCount = 0;
    for (const card of list) {
      if (card.todoId === null) continue;
      todoLinkedCount += 1;
      if (doneTodoIds.has(card.todoId)) doneCount += 1;
    }
    return {
      id: col.id,
      name: col.name,
      position: col.position,
      cardCount: list.length,
      doneCount,
      todoLinkedCount,
      completionRate: completionRatePercent(doneCount, list.length),
    };
  });
  const cardCount = colStats.reduce((sum, c) => sum + c.cardCount, 0);
  const doneCount = colStats.reduce((sum, c) => sum + c.doneCount, 0);
  const todoLinkedCount = colStats.reduce((sum, c) => sum + c.todoLinkedCount, 0);
  return {
    projectId,
    columns: colStats,
    totals: {
      columnCount: colStats.length,
      cardCount,
      doneCount,
      todoLinkedCount,
      completionRate: completionRatePercent(doneCount, cardCount),
    },
  };
}

// ---- CSV 台账导出（r5：Excel 直开——UTF-8 BOM + RFC4180 转义） ----

/** UTF-8 BOM（字节 EF BB BF）：Excel 双击直开不乱码 */
export const CSV_UTF8_BOM = "\uFEFF";

/** CSV 记录分隔符（RFC 4180 规定 CRLF） */
export const CSV_ROW_SEPARATOR = "\r\n";

/** 看板台账表头（中文列名） */
export const BOARD_CSV_HEADERS: readonly string[] = [
  "列名",
  "列位置",
  "卡片标题",
  "卡片描述",
  "卡片位置",
  "关联待办标题",
  "关联待办状态",
  "关联待办象限",
  "关联待办截止日期",
];

/**
 * CSV 字段转义（RFC 4180）：含逗号/引号/换行的字段整体加双引号，内部双引号写成两个。
 * 空字段输出空串（不加引号）。
 */
export function escapeCsvField(value: string): string {
  if (value === "") return "";
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * 看板台账行构建（r5 导出唯一入口）：
 * ① 每列至少一行——空列出一行占位（卡片字段留空，卡片标题为空即占位行）；
 * ② 有卡片的列按卡 position 升序逐行输出；
 * ③ 关联待办字段（标题/状态标签/象限标签/截止日期）缺失时留空。
 */
export function buildBoardCsvRows(
  columns: readonly BoardColumn[],
  cards: readonly BoardCard[],
  todos: readonly Todo[],
): string[][] {
  const todoById = new Map(todos.map((t) => [t.id, t]));
  const byColumn = groupCardsByColumn(cards);
  const rows: string[][] = [];
  for (const col of sortColumns(columns)) {
    const list = byColumn.get(col.id) ?? [];
    if (list.length === 0) {
      rows.push([col.name, String(col.position), "", "", "", "", "", "", ""]);
      continue;
    }
    for (const card of sortCards(list)) {
      const todo = card.todoId !== null ? todoById.get(card.todoId) : undefined;
      rows.push([
        col.name,
        String(col.position),
        card.title,
        card.description ?? "",
        String(card.position),
        todo ? todo.title : "",
        todo ? TODO_STATUS_LABELS[todo.status] : "",
        todo ? QUADRANT_LABELS[todo.quadrant] : "",
        todo?.dueDate ?? "",
      ]);
    }
  }
  return rows;
}

/**
 * 看板台账 CSV 全文（含 UTF-8 BOM，行尾 CRLF，末行不带多余换行）。
 * api GET /api/projects/:id/export.csv 直接下发此串——Excel 双击直开。
 */
export function buildBoardCsvContent(
  columns: readonly BoardColumn[],
  cards: readonly BoardCard[],
  todos: readonly Todo[],
): string {
  const rows: string[][] = [[...BOARD_CSV_HEADERS], ...buildBoardCsvRows(columns, cards, todos)];
  const body = rows.map((row) => row.map(escapeCsvField).join(",")).join(CSV_ROW_SEPARATOR);
  return CSV_UTF8_BOM + body;
}

/**
 * CSV 记录数（RFC 4180 解析）：引号内的换行不算记录分隔，
 * 因此含换行的字段不会虚增行数；BOM 不计。
 */
export function countCsvRecords(csvText: string): number {
  const text = csvText.startsWith(CSV_UTF8_BOM) ? csvText.slice(CSV_UTF8_BOM.length) : csvText;
  let records = 0;
  let inQuotes = false;
  let pending = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          i++;
          continue;
        }
        inQuotes = false;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      pending = true;
      continue;
    }
    if (ch === "\n") {
      records += 1;
      pending = false;
      continue;
    }
    if (ch === "\r") continue;
    pending = true;
  }
  if (pending) records += 1;
  return records;
}

// ---- r6：多维表格（表 / 字段 / 记录）+ 字段类型引擎（规则集中 shared，api 层不得出现类型分支） ----

/** 字段类型（r6 任务单：7 种） */
export type FieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multi-select"
  | "checkbox"
  | "url";

export const FIELD_TYPES: readonly FieldType[] = [
  "text",
  "number",
  "date",
  "select",
  "multi-select",
  "checkbox",
  "url",
];

/** 字段类型中文标签（字段管理面板与 API 错误消息共用同一口径） */
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "文本",
  number: "数字",
  date: "日期",
  select: "单选",
  "multi-select": "多选",
  checkbox: "复选框",
  url: "链接",
};

export function isFieldType(value: unknown): value is FieldType {
  return typeof value === "string" && (FIELD_TYPES as readonly string[]).includes(value);
}

/** 是否需要候选项（单选 / 多选）——选项守卫与 UI 候选项渲染共用 */
export function fieldTypeUsesOptions(type: FieldType): boolean {
  return type === "select" || type === "multi-select";
}

/** 多维表格（一张表 = 一张网格表） */
export interface BaseTable {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 字段（表的一列；type 决定取值校验 / 归一 / 排序口径） */
export interface TableField {
  id: number;
  tableId: number;
  name: string;
  type: FieldType;
  position: number;
  /** 单选 / 多选的候选项；其余类型恒为空数组 */
  options: string[];
  createdAt: string;
  updatedAt: string;
}

/** 记录（表的一行；data 以「字段 id 字符串 → 值」的 JSON 存储） */
export interface TableRecord {
  id: number;
  tableId: number;
  data: Record<string, unknown>;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** 表名 / 字段名长度上限（与看板名称同一量级） */
export const MAX_TABLE_NAME = 200;
export const MAX_FIELD_NAME = 100;

export function assertValidTableName(name: unknown): asserts name is string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new ValidationError("表格名称不能为空");
  }
  if (name.length > MAX_TABLE_NAME) {
    throw new ValidationError(`表格名称过长：最多 ${MAX_TABLE_NAME} 字（当前 ${name.length} 字）`);
  }
}

export function assertValidFieldName(name: unknown): asserts name is string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new ValidationError("字段名称不能为空");
  }
  if (name.length > MAX_FIELD_NAME) {
    throw new ValidationError(`字段名称过长：最多 ${MAX_FIELD_NAME} 字（当前 ${name.length} 字）`);
  }
}

export function assertValidFieldType(type: unknown): asserts type is FieldType {
  if (!isFieldType(type)) {
    throw new ValidationError(`非法字段类型：${String(type)}`);
  }
}

/**
 * 候选项守卫：单选 / 多选必须至少一个候选项；其余类型不许带候选项。
 * 候选项本身去重且不能为空串。
 */
export function assertValidFieldOptions(
  type: FieldType,
  options: readonly string[],
): void {
  const cleaned = options.map((o) => o.trim()).filter((o) => o !== "");
  if (fieldTypeUsesOptions(type)) {
    if (cleaned.length === 0) {
      throw new ValidationError(`${FIELD_TYPE_LABELS[type]}字段必须至少有一个候选项`);
    }
    if (new Set(cleaned).size !== cleaned.length) {
      throw new ValidationError("候选项不能重复");
    }
  } else if (cleaned.length > 0) {
    throw new ValidationError(`${FIELD_TYPE_LABELS[type]}字段不支持候选项`);
  }
}

/** 字段校验结果（valid=false 时 error 是可直接展示的中文原因） */
export interface FieldValidationResult {
  valid: boolean;
  error: string | null;
}

function validationOk(): FieldValidationResult {
  return { valid: true, error: null };
}

function validationFail(error: string): FieldValidationResult {
  return { valid: false, error };
}

/**
 * 字段类型校验（r6 引擎核心之一，全集中 shared）：
 * ① 空值（null / undefined）对任何类型都合法——空格子不是错误；
 * ② text / url 必须是字符串；url 还必须以 http:// 或 https:// 开头；
 * ③ number 必须是有限数值（字符串不算——字符串由 coerceFieldValue 先归一）；
 * ④ date 必须是严格 YYYY-MM-DD 的真实日历日期；
 * ⑤ checkbox 必须是布尔值；
 * ⑥ select 的值必须在候选项内；multi-select 必须是候选项的子集。
 */
export function validateFieldValue(
  type: FieldType,
  value: unknown,
  options: readonly string[] = [],
): FieldValidationResult {
  if (value === null || value === undefined) return validationOk();
  switch (type) {
    case "text":
      return typeof value === "string"
        ? validationOk()
        : validationFail("文本字段必须是字符串");
    case "url":
      if (typeof value !== "string") return validationFail("链接字段必须是字符串");
      return /^https?:\/\/\S+$/.test(value)
        ? validationOk()
        : validationFail("链接字段必须以 http:// 或 https:// 开头");
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? validationOk()
        : validationFail("数字字段必须是数值");
    case "date":
      return isIsoDate(value)
        ? validationOk()
        : validationFail("日期字段必须是 YYYY-MM-DD 合法日期");
    case "checkbox":
      return typeof value === "boolean"
        ? validationOk()
        : validationFail("复选框字段必须是布尔值");
    case "select":
      return typeof value === "string" && options.includes(value)
        ? validationOk()
        : validationFail(`单选值必须在候选项内：${options.join(" / ")}`);
    case "multi-select":
      if (!Array.isArray(value)) return validationFail("多选字段必须是数组");
      if (!value.every((v) => typeof v === "string" && options.includes(v))) {
        return validationFail(`多选值必须是候选项的子集：${options.join(" / ")}`);
      }
      return validationOk();
  }
}

/** 校验失败即抛 ValidationError（api 层只做 400 映射，不做类型分支） */
export function assertValidFieldValue(
  type: FieldType,
  value: unknown,
  options: readonly string[] = [],
): void {
  const result = validateFieldValue(type, value, options);
  if (!result.valid) {
    throw new ValidationError(`${FIELD_TYPE_LABELS[type]}字段${result.error ?? "取值非法"}`);
  }
}

/** 数字字符串 → 数字（仅当整串都是合法数值时才转，转不动就原样返回交由校验拦下） */
function coerceNumber(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : value;
  }
  return value;
}

/** 日期归一：补零 / 斜杠改横杠 / 带时刻只取日期部分；认不出就原样返回 */
function coerceDate(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const slash = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(trimmed);
  if (slash) {
    return `${slash[1]}-${slash[2]!.padStart(2, "0")}-${slash[3]!.padStart(2, "0")}`;
  }
  const short = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(trimmed);
  if (short) {
    return `${short[1]}-${short[2]!.padStart(2, "0")}-${short[3]!.padStart(2, "0")}`;
  }
  return value;
}

/** 链接归一：去空白；像域名但没写协议时补 https:// */
function coerceUrl(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[^/\s]+\.[^/\s]+$/.test(trimmed)) return `https://${trimmed}`;
  return value;
}

/** 多选归一：数组或逗号串 → 去空去重的字符串数组 */
function coerceMultiSelect(value: unknown): unknown {
  const raw: string[] = Array.isArray(value)
    ? value.map((v) => (typeof v === "string" ? v.trim() : v))
    : typeof value === "string"
      ? value.split(",").map((v) => v.trim())
      : [value];
  if (typeof value === "string" && value.trim() === "") return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || item === "") continue;
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

/** 复选框归一："true"/"1" → true，"false"/"0"/"" → false；其他原样返回 */
function coerceCheckbox(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    if (t === "") return null;
    if (t === "true" || t === "1") return true;
    if (t === "false" || t === "0") return false;
  }
  return value;
}

/**
 * 写入前归一（r6 引擎核心之二，全集中 shared）：
 * ① 空串按「清空该格」处理 → null（多选除外：空数组）；
 * ② number：数字字符串 → 数字；
 * ③ date：2026-1-5 → 2026-01-05；带时刻只取日期；
 * ④ url：像域名就补 https://；
 * ⑤ multi-select：逗号串 / 数组 → 去空去重数组；
 * ⑥ checkbox："true"/"1" → true，"false"/"0" → false；
 * ⑦ 认不出的值原样返回——由 validateFieldValue 判定并拒绝（归一不掩盖错误）。
 */
export function coerceFieldValue(
  type: FieldType,
  value: unknown,
  options: readonly string[] = [],
): unknown {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "text":
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      return value;
    case "number":
      return coerceNumber(value);
    case "date":
      return coerceDate(value);
    case "select":
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      if (trimmed === "") return null;
      return options.includes(trimmed) ? trimmed : value;
    case "multi-select":
      return coerceMultiSelect(value);
    case "checkbox":
      return coerceCheckbox(value);
    case "url":
      return coerceUrl(value);
  }
}

/** 空值判定：null / undefined / 空串 / 空数组（复选框 false 是值，不是空） */
export function isEmptyFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * 排序比较器（r6 引擎核心之三，全集中 shared）：
 * ① 空值恒最后（a 空 → 返回正数，b 空 → 返回负数；两边都空 → 0）；
 * ② number 按数值比（认不出的数当空值处理，排最后）；
 * ③ date 按时间比（ISO 字符串按时间轴）；
 * ④ select / multi-select 按候选项在 options 里的顺序比（不在选项内的排最后）；
 * ⑤ checkbox：false < true；
 * ⑥ text / url 按字符串比。
 */
export function compareValues(
  type: FieldType,
  a: unknown,
  b: unknown,
  options: readonly string[] = [],
): number {
  const aEmpty = isEmptyFieldValue(a);
  const bEmpty = isEmptyFieldValue(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  switch (type) {
    case "number": {
      const na = Number(a);
      const nb = Number(b);
      const aBad = !Number.isFinite(na);
      const bBad = !Number.isFinite(nb);
      if (aBad && bBad) return 0;
      if (aBad) return 1;
      if (bBad) return -1;
      return na === nb ? 0 : na < nb ? -1 : 1;
    }
    case "date": {
      const ta = Date.parse(String(a));
      const tb = Date.parse(String(b));
      const aBad = Number.isNaN(ta);
      const bBad = Number.isNaN(tb);
      if (aBad && bBad) return 0;
      if (aBad) return 1;
      if (bBad) return -1;
      return ta === tb ? 0 : ta < tb ? -1 : 1;
    }
    case "checkbox": {
      const ba = a === true;
      const bb = b === true;
      return ba === bb ? 0 : ba ? 1 : -1;
    }
    case "select": {
      const ia = options.indexOf(String(a));
      const ib = options.indexOf(String(b));
      if (ia === ib) return 0;
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia < ib ? -1 : 1;
    }
    case "multi-select": {
      const listA = Array.isArray(a) ? a.map(String) : [String(a)];
      const listB = Array.isArray(b) ? b.map(String) : [String(b)];
      const ia = options.indexOf(listA[0] ?? "");
      const ib = options.indexOf(listB[0] ?? "");
      if (ia !== ib) {
        if (ia < 0) return 1;
        if (ib < 0) return -1;
        return ia < ib ? -1 : 1;
      }
      return listA.length === listB.length ? 0 : listA.length < listB.length ? -1 : 1;
    }
    default: {
      const sa = String(a);
      const sb = String(b);
      return sa === sb ? 0 : sa < sb ? -1 : 1;
    }
  }
}

/** 筛选命中判定（按字段类型口径，与比较器同源） */
export function matchesFieldValue(
  type: FieldType,
  value: unknown,
  filterValue: unknown,
  options: readonly string[] = [],
): boolean {
  if (filterValue === null || filterValue === undefined) return true;
  switch (type) {
    case "number": {
      const n = Number(value);
      const f = Number(filterValue);
      if (!Number.isFinite(n) || !Number.isFinite(f)) return false;
      return n === f;
    }
    case "checkbox": {
      const b = value === true;
      const f = filterValue === true;
      return b === f;
    }
    case "multi-select": {
      const list = Array.isArray(value) ? value.map(String) : [];
      const wanted = Array.isArray(filterValue) ? filterValue.map(String) : [String(filterValue)];
      return wanted.some((w) => list.includes(w));
    }
    default:
      return String(value ?? "") === String(filterValue);
  }
}

/**
 * 记录数据归一（写入前唯一入口，全集中 shared）：
 * ① data 的键是「字段 id 字符串」；出现表里不存在的键 → 未知字段 → 抛错；
 * ② 每个值先按字段类型归一（coerceFieldValue），再校验（validateFieldValue）；
 * ③ 表里没给的字段补 null（网格渲染口径统一）。
 */
export function normalizeRecordData(
  fields: readonly TableField[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const byId = new Map(fields.map((f) => [String(f.id), f]));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    const field = byId.get(key);
    if (!field) {
      throw new ValidationError(`未知字段：${key}`);
    }
    const coerced = coerceFieldValue(field.type, data[key], field.options);
    const check = validateFieldValue(field.type, coerced, field.options);
    if (!check.valid) {
      throw new ValidationError(`字段「${field.name}」${check.error ?? "取值非法"}`);
    }
    out[key] = coerced;
  }
  for (const field of fields) {
    const key = String(field.id);
    if (!(key in out)) out[key] = null;
  }
  return out;
}

/** 排序：按字段值排；空值恒最后（升序降序都最后） */
export function sortRecordsByField(
  records: readonly TableRecord[],
  field: TableField,
  direction: "asc" | "desc" = "asc",
): TableRecord[] {
  const sign = direction === "desc" ? -1 : 1;
  const valueOf = (r: TableRecord): unknown => r.data[String(field.id)];
  const filled = records.filter((r) => !isEmptyFieldValue(valueOf(r)));
  const empty = records.filter((r) => isEmptyFieldValue(valueOf(r)));
  filled.sort((a, b) => sign * compareValues(field.type, valueOf(a), valueOf(b), field.options));
  return [...filled, ...empty];
}

/** 默认每页条数 / 每页上限（分页口径集中 shared） */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** 记录查询参数（api 只装配数据，筛选 / 排序 / 分页规则全在 shared） */
export interface RecordQuerySpec {
  filterFieldId?: number | null;
  filterValue?: unknown;
  /** 多条件 AND 筛选（r7 视图口径）；与 filterFieldId 二选一，filters 优先 */
  filters?: readonly ViewFilterCondition[];
  sortFieldId?: number | null;
  sortDirection?: "asc" | "desc";
  /** 多级排序（r7 视图口径）；与 sortFieldId 二选一，sorts 优先 */
  sorts?: readonly ViewSortRule[];
  /** 投影：只保留这些字段 id（空数组 = 全部可见，不做投影） */
  visibleFields?: readonly number[] | null;
  page?: number;
  pageSize?: number;
}

/** 记录查询结果 */
export interface RecordQueryResult {
  records: TableRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 记录查询唯一入口（r6：按字段筛选 + 按字段排序 + 分页，规则集中 shared）：
 * ① 筛选字段不存在 → 抛错（api 映射 400：未知字段）；
 * ② 筛选值先按字段类型归一再校验，不符 → 抛错（api 映射 400：筛选值类型不符）；
 * ③ 排序字段不存在 → 抛错；
 * ④ 分页：page 从 1 起，pageSize 上限 MAX_PAGE_SIZE；越界页返回空列表但 total 不变。
 *
 * r7 扩展（多字段 AND 筛选 + 视图投影，口径仍只在 shared 一处）：
 * ⑤ `filters` 多条件是 **AND** 语义（任一条件不命中即淘汰）；单条件入口
 *    （filterFieldId + filterValue）与多条件走**同一条**归一 + 校验 + 命中路径；
 * ⑥ `sorts` 多级排序按规则顺序生效，**空值恒最后**（与升降序无关）；
 * ⑦ `visibleFields` 非空时做投影：返回记录只保留这些字段 id 的键。
 */
export function queryRecords(
  records: readonly TableRecord[],
  fields: readonly TableField[],
  spec: RecordQuerySpec = {},
): RecordQueryResult {
  const byId = new Map(fields.map((f) => [f.id, f]));
  let list: TableRecord[] = [...records];

  // —— 筛选：单条件与多条件同一条路径（多条件 = AND）——
  const conditions: ViewFilterCondition[] =
    spec.filters && spec.filters.length > 0
      ? [...spec.filters]
      : spec.filterFieldId !== undefined && spec.filterFieldId !== null
        ? [{ fieldId: spec.filterFieldId, value: spec.filterValue ?? null }]
        : [];
  for (const condition of conditions) {
    const field = byId.get(condition.fieldId);
    if (!field) {
      throw new ValidationError(`筛选字段不存在：${condition.fieldId}`);
    }
    const filterValue = coerceFieldValue(field.type, condition.value ?? null, field.options);
    const check = validateFieldValue(field.type, filterValue, field.options);
    if (!check.valid) {
      throw new ValidationError(`筛选值类型不符：${check.error ?? "取值非法"}`);
    }
    list = list.filter((r) =>
      matchesFieldValue(field.type, r.data[String(field.id)], filterValue, field.options),
    );
  }

  // —— 排序：多级规则按顺序生效；空值恒最后（升降序都一样）——
  const rules: ViewSortRule[] =
    spec.sorts && spec.sorts.length > 0
      ? [...spec.sorts]
      : spec.sortFieldId !== undefined && spec.sortFieldId !== null
        ? [{ fieldId: spec.sortFieldId, direction: spec.sortDirection ?? "asc" }]
        : [];
  for (const rule of rules) {
    if (!byId.has(rule.fieldId)) {
      throw new ValidationError(`排序字段不存在：${rule.fieldId}`);
    }
  }
  if (rules.length > 0) {
    list = [...list].sort((a, b) => {
      for (const rule of rules) {
        const field = byId.get(rule.fieldId)!;
        const va = a.data[String(field.id)];
        const vb = b.data[String(field.id)];
        const aEmpty = isEmptyFieldValue(va);
        const bEmpty = isEmptyFieldValue(vb);
        if (aEmpty || bEmpty) {
          if (aEmpty && bEmpty) continue;
          return aEmpty ? 1 : -1;
        }
        const cmp = compareValues(field.type, va, vb, field.options);
        if (cmp !== 0) return rule.direction === "desc" ? -cmp : cmp;
      }
      return a.position - b.position || a.id - b.id;
    });
  }

  // —— 投影：只保留可见字段（空数组 = 全部可见，不投影）——
  const visible = spec.visibleFields;
  if (visible && visible.length > 0) {
    const keep = new Set(visible.map((v) => String(v)));
    list = list.map((r) => ({
      ...r,
      data: Object.fromEntries(Object.entries(r.data).filter(([k]) => keep.has(k))),
    }));
  }

  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(spec.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const total = list.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = Math.max(1, Math.floor(spec.page ?? 1));
  const start = (page - 1) * pageSize;
  return {
    records: list.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}

/** 默认字段模板（r6「用户第一次用」：新建表即带齐 7 种字段类型，不用先建字段） */
export interface DefaultFieldSpec {
  name: string;
  type: FieldType;
  options: string[];
}

export const DEFAULT_TABLE_FIELDS: readonly DefaultFieldSpec[] = [
  { name: "名称", type: "text", options: [] },
  { name: "状态", type: "select", options: ["未开始", "进行中", "已完成"] },
  { name: "负责人", type: "text", options: [] },
  { name: "金额", type: "number", options: [] },
  { name: "截止日期", type: "date", options: [] },
  { name: "标签", type: "multi-select", options: ["重要", "紧急"] },
  { name: "完成", type: "checkbox", options: [] },
  { name: "链接", type: "url", options: [] },
];

/**
 * 文件名安全片段（r6 U2-2：导出文件名必须含项目名，不能只露内部 id）。
 * 保留字母 / 数字 / 文字（含中文）与 - _ .，其余折叠成单个 -，去掉首尾 -。
 */
export function sanitizeFileNamePart(raw: string): string {
  const cleaned = raw
    .replace(/[^\p{L}\p{N}_.-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 60) : "board";
}

/**
 * 看板台账导出文件名（r6 U2-2 必修）：xieflow-board-<项目名>-<YYYYMMDD>.csv
 * api 的 content-disposition 与 UI 的 a.download 共用本函数——两端文件名一致。
 */
export function buildBoardCsvFileName(projectName: string, now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `xieflow-board-${sanitizeFileNamePart(projectName)}-${y}${m}${d}.csv`;
}

// ---- r7：视图（筛选 / 排序 / 字段可见性）+ CSV 导入（口径全部集中 shared，api 只装配） ----

/** 视图名称上限 */
export const MAX_VIEW_NAME = 100;

/** 排序方向白名单（升 / 降） */
export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export function assertValidSortDirection(direction: unknown): asserts direction is SortDirection {
  if (direction !== "asc" && direction !== "desc") {
    throw new ValidationError(`非法排序方向：${String(direction)}`);
  }
}

export function assertValidViewName(name: unknown): asserts name is string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new ValidationError("视图名称不能为空");
  }
  if (name.length > MAX_VIEW_NAME) {
    throw new ValidationError(`视图名称过长：最多 ${MAX_VIEW_NAME} 字（当前 ${name.length} 字）`);
  }
}

/** 视图筛选条件（一条 = 一个字段 + 一个值；多条之间是 AND） */
export interface ViewFilterCondition {
  fieldId: number;
  value: unknown;
}

/** 视图排序规则（多条按顺序生效） */
export interface ViewSortRule {
  fieldId: number;
  direction: SortDirection;
}

/** 视图（表的一个保存态：筛选 / 排序 / 字段可见性） */
export interface TableView {
  id: number;
  tableId: number;
  name: string;
  filterSpec: ViewFilterCondition[];
  sortSpec: ViewSortRule[];
  visibleFields: number[];
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** 视图 spec 入参（原始形状；归一后落库） */
export interface ViewSpecInput {
  filterSpec?: unknown;
  sortSpec?: unknown;
  visibleFields?: unknown;
}

/** 归一后的视图 spec（落库形态） */
export interface NormalizedViewSpec {
  filterSpec: ViewFilterCondition[];
  sortSpec: ViewSortRule[];
  visibleFields: number[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 视图 spec 归一（r7 唯一口径，api / db / UI 共用）：
 * ① 筛选条件：必须是数组；每条含合法 fieldId（必须存在于本表）+ 取值；
 *    取值先按字段类型归一再校验（类型不符直接拒绝，不留坏 spec）；
 *    同一字段不得重复（重复条件语义重复，直接拒绝）；
 * ② 排序规则：必须是数组；fieldId 必须存在；direction 只能是 asc / desc；
 *    同一字段不得重复；
 * ③ 可见字段：必须是数组；每个 id 必须存在（去重后落库）；
 *    **空数组 = 全部字段可见**（不投影），非空 = 只显示这些列。
 */
export function normalizeViewSpec(
  fields: readonly TableField[],
  input: ViewSpecInput,
): NormalizedViewSpec {
  const byId = new Map(fields.map((f) => [f.id, f]));

  // —— 筛选条件 ——
  const filterSpec: ViewFilterCondition[] = [];
  const seenFilter = new Set<number>();
  const rawFilter = input.filterSpec;
  if (rawFilter !== undefined && rawFilter !== null) {
    if (!Array.isArray(rawFilter)) throw new ValidationError("筛选条件必须是数组");
    for (const item of rawFilter) {
      if (!isPlainObject(item)) throw new ValidationError("筛选条件必须是对象");
      const rawId = item["fieldId"];
      const fieldId = Number(rawId);
      if (!Number.isInteger(fieldId) || fieldId <= 0) {
        throw new ValidationError(`筛选字段 id 非法：${String(rawId)}`);
      }
      const field = byId.get(fieldId);
      if (!field) throw new ValidationError(`筛选字段不存在：${fieldId}`);
      if (seenFilter.has(fieldId)) throw new ValidationError(`筛选字段重复：${fieldId}`);
      seenFilter.add(fieldId);
      const rawValue = item["value"];
      if (rawValue === undefined) throw new ValidationError(`筛选条件缺少取值：${field.name}`);
      const coerced = coerceFieldValue(field.type, rawValue, field.options);
      const check = validateFieldValue(field.type, coerced, field.options);
      if (!check.valid) {
        throw new ValidationError(`筛选值类型不符：${field.name} ${check.error ?? "取值非法"}`);
      }
      filterSpec.push({ fieldId, value: coerced });
    }
  }

  // —— 排序规则 ——
  const sortSpec: ViewSortRule[] = [];
  const seenSort = new Set<number>();
  const rawSort = input.sortSpec;
  if (rawSort !== undefined && rawSort !== null) {
    if (!Array.isArray(rawSort)) throw new ValidationError("排序规则必须是数组");
    for (const item of rawSort) {
      if (!isPlainObject(item)) throw new ValidationError("排序规则必须是对象");
      const rawId = item["fieldId"];
      const fieldId = Number(rawId);
      if (!Number.isInteger(fieldId) || fieldId <= 0) {
        throw new ValidationError(`排序字段 id 非法：${String(rawId)}`);
      }
      if (!byId.has(fieldId)) throw new ValidationError(`排序字段不存在：${fieldId}`);
      if (seenSort.has(fieldId)) throw new ValidationError(`排序字段重复：${fieldId}`);
      seenSort.add(fieldId);
      const rawDirection = item["direction"] ?? "asc";
      assertValidSortDirection(rawDirection);
      sortSpec.push({ fieldId, direction: rawDirection });
    }
  }

  // —— 字段可见性（空数组 = 全部可见）——
  const visibleFields: number[] = [];
  const rawVisible = input.visibleFields;
  if (rawVisible !== undefined && rawVisible !== null) {
    if (!Array.isArray(rawVisible)) throw new ValidationError("可见字段必须是数组");
    for (const item of rawVisible) {
      const fieldId = Number(item);
      if (!Number.isInteger(fieldId) || fieldId <= 0) {
        throw new ValidationError(`可见字段 id 非法：${String(item)}`);
      }
      if (!byId.has(fieldId)) throw new ValidationError(`可见字段不存在：${fieldId}`);
      if (!visibleFields.includes(fieldId)) visibleFields.push(fieldId);
    }
  }

  return { filterSpec, sortSpec, visibleFields };
}

/** 视图 spec 的可读摘要（UI 视图条与提示文案共用同一口径） */
export function describeViewSpec(
  view: Pick<TableView, "filterSpec" | "sortSpec" | "visibleFields">,
  fields: readonly TableField[],
): string {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const nameOf = (id: number): string => byId.get(id)?.name ?? `#${id}`;
  const filters = view.filterSpec.map(
    (c) => `${nameOf(c.fieldId)} = ${Array.isArray(c.value) ? c.value.join("、") : String(c.value ?? "")}`,
  );
  const sorts = view.sortSpec.map((r) => `${nameOf(r.fieldId)} ${r.direction === "desc" ? "降序" : "升序"}`);
  const parts: string[] = [];
  if (filters.length > 0) parts.push(`筛选 ${filters.join(" 且 ")}`);
  if (sorts.length > 0) parts.push(`排序 ${sorts.join(" → ")}`);
  if (view.visibleFields.length > 0) {
    const hidden = fields.filter((f) => !view.visibleFields.includes(f.id)).map((f) => f.name);
    if (hidden.length > 0) parts.push(`隐藏列 ${hidden.join("、")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "无筛选 / 无排序 / 全部列可见";
}

// ---- CSV 导入（r7：逐行归一 + 错误行清单 + 零半态） ----

/** 导入预览展示的行数（UI 预览前 5 行） */
export const CSV_IMPORT_PREVIEW_ROWS = 5;

/** 单次导入的最大数据行数（防超大文件打爆内存） */
export const CSV_IMPORT_MAX_ROWS = 1000;

/** 导入错误行（行号 1 起，数据行；表头不计入，全空行不占号） */
export interface CsvImportRowError {
  row: number;
  reason: string;
  column: string | null;
}

/** 导入计划（预览与提交共用同一份口径） */
export interface CsvImportPlan {
  headers: string[];
  /** 数据行总数（不含表头，不含全空行） */
  total: number;
  /** 前 5 行原始文本（UI 预览用） */
  preview: string[][];
  /** 全部合法行（已按字段类型归一） */
  rows: Record<string, unknown>[];
  /** 非法行清单（逐行带行号与原因） */
  errors: CsvImportRowError[];
}

/**
 * CSV 文本解析（RFC 4180）：引号内可含逗号 / 换行，双引号写成两个；
 * CRLF / LF / CR 都算行分隔；UTF-8 BOM 自动剥掉。
 */
export function parseCsvText(text: string): string[][] {
  const src = text.startsWith(CSV_UTF8_BOM) ? text.slice(CSV_UTF8_BOM.length) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const pushCell = (): void => {
    row.push(cell);
    cell = "";
  };
  const pushRow = (): void => {
    pushCell();
    rows.push(row);
    row = [];
  };
  while (i < src.length) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (src[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell !== "" || row.length > 0) pushRow();
  return rows;
}

/** 表头列 → 字段 id 的绑定 */
export interface CsvHeaderBinding {
  header: string;
  fieldId: number;
}

/**
 * 表头映射（列名优先匹配字段名，其次匹配字段 id 字符串）：
 * 未知列 / 空列名 / 同一字段被两列占用 → 直接拒绝（这是**整表级**错误，不是行级）。
 */
export function mapCsvHeadersToFields(
  fields: readonly TableField[],
  headers: readonly string[],
): CsvHeaderBinding[] {
  const byName = new Map(fields.map((f) => [f.name, f.id]));
  const byId = new Map(fields.map((f) => [String(f.id), f.id]));
  const out: CsvHeaderBinding[] = [];
  const used = new Set<number>();
  for (const raw of headers) {
    const header = raw.trim();
    if (header === "") throw new ValidationError("表头存在空列名");
    let fieldId = byName.get(header);
    if (fieldId === undefined) fieldId = byId.get(header);
    if (fieldId === undefined) throw new ValidationError(`未知列：${header}`);
    if (used.has(fieldId)) throw new ValidationError(`列重复：${header}`);
    used.add(fieldId);
    out.push({ header, fieldId });
  }
  return out;
}

/**
 * 导入计划（r7 唯一口径，preview 与 commit 共用）：
 * ① 逐行走 shared `normalizeRecordData`（归一 + 校验）——与单条写入同一条路径；
 * ② 非法行**不阻断**整批：错误行收集到 errors（带行号 + 中文原因），合法行进 rows；
 * ③ 全空行跳过且不占行号；列数与表头不一致的行按非法行处理；
 * ④ 没有任何数据行 → 抛错（整表级错误，api 映射 400）。
 */
export function planCsvImport(
  fields: readonly TableField[],
  headers: readonly string[],
  rows: readonly string[][],
): CsvImportPlan {
  const bindings = mapCsvHeadersToFields(fields, headers);
  const errors: CsvImportRowError[] = [];
  const okRows: Record<string, unknown>[] = [];
  const preview: string[][] = [];
  let rowNo = 0;
  for (const raw of rows) {
    if (raw.every((c) => c.trim() === "")) continue; // 全空行：跳过且不占行号
    rowNo += 1;
    if (rowNo > CSV_IMPORT_MAX_ROWS) {
      throw new ValidationError(`导入行数超过上限 ${CSV_IMPORT_MAX_ROWS}`);
    }
    if (preview.length < CSV_IMPORT_PREVIEW_ROWS) preview.push([...raw]);
    if (raw.length !== headers.length) {
      errors.push({
        row: rowNo,
        reason: `列数与表头不一致（表头 ${headers.length} 列，本行 ${raw.length} 列）`,
        column: null,
      });
      continue;
    }
    const data: Record<string, unknown> = {};
    for (let idx = 0; idx < bindings.length; idx += 1) {
      const binding = bindings[idx]!;
      data[String(binding.fieldId)] = raw[idx] ?? "";
    }
    try {
      okRows.push(normalizeRecordData(fields, data));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const named = /字段「(.+?)」/.exec(message);
      errors.push({ row: rowNo, reason: message, column: named?.[1] ?? null });
    }
  }
  if (rowNo === 0) {
    throw new ValidationError("CSV 只有表头，没有数据行");
  }
  return { headers: [...headers], total: rowNo, preview, rows: okRows, errors };
}

/**
 * 导入提交判定（零半态口径，集中在 shared）：
 * **任一行非法 → 一行都不落库**（全成功或全不落，二选一，没有中间态）。
 */
export function shouldCommitImport(plan: CsvImportPlan): boolean {
  return plan.errors.length === 0 && plan.rows.length > 0;
}

/** 导入请求体归一（{ csv } 或 { headers, rows } 两种形态） */
export interface CsvImportPayload {
  headers: string[];
  rows: string[][];
}

export function normalizeCsvImportPayload(raw: unknown): CsvImportPayload {
  if (!isPlainObject(raw)) {
    throw new ValidationError("导入体必须是对象");
  }
  const csv = raw["csv"];
  if (typeof csv === "string") {
    const parsed = parseCsvText(csv);
    if (parsed.length === 0) throw new ValidationError("CSV 内容为空");
    const headers = (parsed[0] ?? []).map((h) => h.trim());
    if (headers.length === 0 || headers.every((h) => h === "")) {
      throw new ValidationError("CSV 缺少表头行");
    }
    return { headers, rows: parsed.slice(1) };
  }
  const headersRaw = raw["headers"];
  const rowsRaw = raw["rows"];
  if (Array.isArray(headersRaw) && Array.isArray(rowsRaw)) {
    const headers = headersRaw.map((h) => {
      if (typeof h !== "string") throw new ValidationError("表头必须是字符串数组");
      return h.trim();
    });
    const rows = rowsRaw.map((r) => {
      if (!Array.isArray(r)) throw new ValidationError("rows 必须是二维字符串数组");
      return r.map((c) => {
        if (typeof c !== "string") throw new ValidationError("rows 必须是二维字符串数组");
        return c;
      });
    });
    if (headers.length === 0) throw new ValidationError("CSV 缺少表头行");
    return { headers, rows };
  }
  throw new ValidationError('导入体必须是 { csv: "..." } 或 { headers: [...], rows: [...] }');
}

// ---- r8：文档块编辑器（块类型引擎 / 拆合 / 顺序 / 全文装配，全部集中 shared，api 层零类型分支） ----

/** 块类型（r8 任务单：paragraph / heading1-3 / bullet / numbered / todo / quote / code / divider 共 10 种） */
export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote"
  | "code"
  | "divider";

export const BLOCK_TYPES: readonly BlockType[] = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bullet",
  "numbered",
  "todo",
  "quote",
  "code",
  "divider",
];

/** 块类型中文标签（类型切换下拉 / 打印预览 / API 错误消息共用同一口径） */
export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  paragraph: "正文",
  heading1: "一级标题",
  heading2: "二级标题",
  heading3: "三级标题",
  bullet: "无序列表",
  numbered: "有序列表",
  todo: "待办",
  quote: "引用",
  code: "代码块",
  divider: "分割线",
};

/** 结构块：不承载文本，不参与类型互转 / 拆 / 合（状态机口径集中在此，禁止散落 if-else） */
const STRUCTURAL_BLOCK_TYPES: readonly BlockType[] = ["divider"];

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === "string" && (BLOCK_TYPES as readonly string[]).includes(value);
}

export function assertValidBlockType(type: unknown): asserts type is BlockType {
  if (!isBlockType(type)) {
    throw new ValidationError(`非法块类型：${String(type)}`);
  }
}

/** 文档标题 / 块文本上限（防超长输入撑爆界面与库） */
export const MAX_DOCUMENT_TITLE = 200;
export const MAX_BLOCK_TEXT = 20000;

/** 归一后的块内容：text 恒在；checked 仅 todo 有；language 仅 code 有；divider 恒空 */
export interface BlockContent {
  text: string;
  checked?: boolean;
  language?: string;
}

function normalizeTodoChecked(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === 1 || raw === "1";
}

function normalizeCodeLanguage(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string") throw new ValidationError(`代码语言必须是字符串：${String(raw)}`);
  return raw.trim();
}

/**
 * 块内容归一（r8 唯一口径，api / db / UI 共用）：
 * ① 内容可为字符串（简写为 text）、对象、null / undefined；数字 / 数组一律拒绝；
 * ② text 必须是字符串且不超过 MAX_BLOCK_TEXT；
 * ③ divider 是结构块：恒归一为 { text: "" }，丢弃一切输入文本与专属字段；
 * ④ todo 保留 checked（"true"/1/true → true，其余 false）；code 保留 language（去空白）；
 *    其余类型丢弃 checked / language，保证类型转换后不残留别的类型的专属字段。
 */
export function normalizeBlockContent(type: unknown, content: unknown): BlockContent {
  assertValidBlockType(type);
  let raw: unknown = content;
  if (raw === undefined || raw === null) raw = {};
  if (typeof raw === "string") raw = { text: raw };
  if (!isPlainObject(raw)) {
    throw new ValidationError("块内容必须是字符串或对象");
  }
  const textRaw = raw["text"];
  let text = "";
  if (textRaw !== undefined && textRaw !== null) {
    if (typeof textRaw !== "string") {
      throw new ValidationError(`块文本必须是字符串：${String(textRaw)}`);
    }
    text = textRaw;
  }
  if (text.length > MAX_BLOCK_TEXT) {
    throw new ValidationError(`块文本过长：最多 ${MAX_BLOCK_TEXT} 字（当前 ${text.length} 字）`);
  }
  if (type === "divider") return { text: "" };
  if (type === "todo") return { text, checked: normalizeTodoChecked(raw["checked"]) };
  if (type === "code") return { text, language: normalizeCodeLanguage(raw["language"]) };
  return { text };
}

/**
 * 块类型转换矩阵（r8 状态机集中定义，api 层零类型分支）：
 * - 同类型恒允许（幂等）；
 * - 结构块 divider 只在自身内允许（转入/转出都会静默吞掉或凭空造出文本，直接拒绝）；
 * - 其余 9 种文本型块之间互相允许，专属字段由 normalizeBlockContent 按目标类型补齐/丢弃。
 */
export function canConvertBlockType(from: unknown, to: unknown): boolean {
  assertValidBlockType(from);
  assertValidBlockType(to);
  if (from === to) return true;
  return !STRUCTURAL_BLOCK_TYPES.includes(from) && !STRUCTURAL_BLOCK_TYPES.includes(to);
}

/** 类型转换 + 内容归一（非法转换直接抛错；api 只做 400 映射） */
export function convertBlockContent(from: unknown, to: unknown, content: unknown): BlockContent {
  if (!canConvertBlockType(from, to)) {
    throw new ValidationError(
      `不允许的块类型转换：${BLOCK_TYPE_LABELS[from as BlockType]} → ${BLOCK_TYPE_LABELS[to as BlockType]}`,
    );
  }
  return normalizeBlockContent(to, content);
}

/** 文档领域对象（documents 表） */
export interface Document {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** 文档块领域对象（blocks 表；parent_id 可空） */
export interface DocumentBlock {
  id: number;
  documentId: number;
  type: BlockType;
  position: number;
  content: BlockContent;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
}

/** 默认首块（r4 教训「用户第一次用」）：建文档即自动在场，消灭零块死路 */
export const DEFAULT_DOCUMENT_FIRST_BLOCK: { type: BlockType; content: BlockContent } = {
  type: "paragraph",
  content: { text: "" },
};

export function assertValidDocumentTitle(title: unknown): asserts title is string {
  if (typeof title !== "string" || title.trim() === "") {
    throw new ValidationError("文档标题不能为空");
  }
  if (title.length > MAX_DOCUMENT_TITLE) {
    throw new ValidationError(`文档标题过长：最多 ${MAX_DOCUMENT_TITLE} 字（当前 ${title.length} 字）`);
  }
}

/** 位置守卫：position 必须是 0..count 的整数（count = 当前块数，count 表示追加到末尾） */
export function assertValidBlockPosition(position: unknown, count: number): asserts position is number {
  const n = typeof position === "number" ? position : Number(position);
  if (!Number.isInteger(n) || n < 0 || n > count) {
    throw new ValidationError(`非法块位置：${String(position)}（允许 0..${count}）`);
  }
}

/** 拆块文本：caret 必须是 0..text.length 的整数（越界 / 负数 / 小数一律拒绝） */
export function splitBlockText(text: string, caret: number): { before: string; after: string } {
  if (typeof text !== "string") throw new ValidationError("拆块文本必须是字符串");
  if (!Number.isInteger(caret) || caret < 0 || caret > text.length) {
    throw new ValidationError(`非法拆块位置：${String(caret)}（文本长 ${text.length}）`);
  }
  return { before: text.slice(0, caret), after: text.slice(caret) };
}

/** 拆块后新块的类型：标题类回落 paragraph，列表类延续自身，code 延续 code */
const BLOCK_SPLIT_NEXT_TYPE: Record<BlockType, BlockType> = {
  paragraph: "paragraph",
  heading1: "paragraph",
  heading2: "paragraph",
  heading3: "paragraph",
  bullet: "bullet",
  numbered: "numbered",
  todo: "todo",
  quote: "quote",
  code: "code",
  divider: "paragraph",
};

export interface BlockSplitPlan {
  before: BlockContent;
  after: BlockContent;
  afterType: BlockType;
}

/**
 * 回车拆块计划（r8 唯一口径）：
 * ① divider 是结构块，不可拆（直接抛错，UI 的回车在分割线上转为「追加一个正文块」）；
 * ② 前半段留原块并保留其 checked / language；后半段落到新块；
 * ③ todo 新块重置为未勾选；code 新块沿用原 language；标题拆出的新块回落 paragraph。
 */
export function planBlockSplit(type: unknown, content: unknown, caret: number): BlockSplitPlan {
  assertValidBlockType(type);
  if (type === "divider") throw new ValidationError("分割线不可拆块");
  const normalized = normalizeBlockContent(type, content);
  const { before, after } = splitBlockText(normalized.text, caret);
  const afterType = BLOCK_SPLIT_NEXT_TYPE[type];
  return {
    before: normalizeBlockContent(type, { ...normalized, text: before }),
    after: normalizeBlockContent(afterType, { ...normalized, text: after, checked: false }),
    afterType,
  };
}

/**
 * 退格合块计划（r8 唯一口径）：把后一块文本接到前一块尾部，结果沿用**前一块**的类型，
 * 并保留前一块的 checked / language；结构块作为前一块时不参与合块（无文本可承接）。
 */
export function mergeBlockContent(
  firstType: unknown,
  firstContent: unknown,
  secondType: unknown,
  secondContent: unknown,
): BlockContent {
  assertValidBlockType(firstType);
  assertValidBlockType(secondType);
  if (STRUCTURAL_BLOCK_TYPES.includes(firstType)) {
    throw new ValidationError("分割线不参与合块（它是结构块）");
  }
  const first = normalizeBlockContent(firstType, firstContent);
  const second = normalizeBlockContent(secondType, secondContent);
  const text = first.text + second.text;
  if (text.length > MAX_BLOCK_TEXT) {
    throw new ValidationError(`合块后文本过长：最多 ${MAX_BLOCK_TEXT} 字`);
  }
  return normalizeBlockContent(firstType, { ...first, text });
}

/**
 * 批量重排（r8「批移动重排复用 shared 排序思路」）：
 * order 必须是本文档全部块 id 的一个排列（长度相同 / 无重复 / 无越权 id），
 * 返回 0..n-1 连续 position 映射，db 在单事务里一次落库。
 */
export function planBlockReorder(
  blocks: readonly { id: number; position: number }[],
  order: unknown,
): ReorderedPosition[] {
  if (!Array.isArray(order)) throw new ValidationError("重排顺序必须是数组");
  const ids = new Set(blocks.map((b) => b.id));
  if (order.length !== blocks.length) {
    throw new ValidationError(`重排顺序长度不符：${order.length} ≠ ${blocks.length}`);
  }
  const seen = new Set<number>();
  for (const raw of order) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError(`非法块 id：${String(raw)}`);
    if (seen.has(id)) throw new ValidationError(`重排顺序含重复块 id：${id}`);
    if (!ids.has(id)) throw new ValidationError(`重排顺序含越权块 id：${id}`);
    seen.add(id);
  }
  return (order as unknown[]).map((raw, i) => ({ id: Number(raw), position: i }));
}

/** 全文装配输入（宽松形状：type/content 由 shared 引擎再次校验归一） */
export interface AssemblableBlock {
  id: number;
  position: number;
  type: unknown;
  content: unknown;
}

/** 单块渲染为一行；numbered 的序号按连续有序块计数（遇到其它类型归零重数） */
function renderBlockLine(type: BlockType, content: BlockContent, numberedOrdinal: number): string {
  const text = content.text;
  switch (type) {
    case "heading1": return text === "" ? "" : `# ${text}`;
    case "heading2": return text === "" ? "" : `## ${text}`;
    case "heading3": return text === "" ? "" : `### ${text}`;
    case "bullet": return text === "" ? "" : `- ${text}`;
    case "numbered": return text === "" ? "" : `${numberedOrdinal}. ${text}`;
    case "todo": return text === "" ? "" : `- [${content.checked ? "x" : " "}] ${text}`;
    case "quote": return text === "" ? "" : `> ${text}`;
    case "code": return text;
    case "divider": return "---";
    case "paragraph": return text;
  }
}

/**
 * 文档全文读（r8 唯一口径，按 position 拼装）：
 * ① 先按 (position, id) 排序（与 db ORDER BY position, id 一致），同 position 用 id 兜底；
 * ② 每块按类型渲染成一行（标题 #、列表 -、有序 1.、待办 - [x]、引用 >、分割线 ---）；
 * ③ 空文本块不占行（新文档默认空首块 ⇒ 全文为空串，不产生无意义空行）。
 */
export function assembleDocumentText(blocks: readonly AssemblableBlock[]): string {
  const sorted = [...blocks].sort((a, b) =>
    a.position === b.position ? a.id - b.id : a.position - b.position,
  );
  const lines: string[] = [];
  let numberedOrdinal = 0;
  for (const block of sorted) {
    const type = block.type;
    assertValidBlockType(type);
    const content = normalizeBlockContent(type, block.content);
    if (type === "numbered") numberedOrdinal += 1;
    else numberedOrdinal = 0;
    const line = renderBlockLine(type, content, numberedOrdinal);
    if (line !== "") lines.push(line);
  }
  return lines.join("\n");
}

// ---- r9：Markdown 导入导出与 AI 块级修订（转换引擎 / 零半态 / 采纳语义全部集中 shared） ----
// 规则集中（宪法第七条）：Markdown 方言、导入逐块校验、修订「采纳才改」判定只住在这里，
// api / db / web 三层零块类型分支、零口径分叉。M5 接真实模型只需换 RevisionProvider 实现。

/** 单次导入的 Markdown 文本长度上限（防超大文本打爆内存） */
export const MAX_MARKDOWN_LENGTH = 200000;
/** 导入预览展示的块数 */
export const MARKDOWN_IMPORT_PREVIEW_ROWS = 5;
/** 单次导入的最大块数 */
export const MARKDOWN_IMPORT_MAX_BLOCKS = 1000;
/** 修订指令长度上限 */
export const MAX_REVISION_INSTRUCTION = 500;

/** Markdown 解析产出的块草稿（已按类型归一，未落库、无 id / position） */
export interface MarkdownBlockDraft {
  type: BlockType;
  content: BlockContent;
}

/** blocksToMarkdown 的宽松输入（真实 DocumentBlock / 草稿都可；position、id 可选） */
export interface MarkdownSourceBlock {
  type: unknown;
  content: unknown;
  position?: number;
  id?: number;
}

/** 有序列表编号：连续 numbered 从 1 计数，遇其它类型归零（打印 / 编辑态 / 导出共用） */
export function computeNumberedOrdinals(blocks: readonly { type: unknown }[]): number[] {
  let ordinal = 0;
  return blocks.map((b) => {
    if (b.type === "numbered") {
      ordinal += 1;
      return ordinal;
    }
    ordinal = 0;
    return 0;
  });
}

/** paragraph 首行是否需要「引用转义」（会被误判成标记块 / 含空行 / 空文本） */
function mdNeedsQuote(text: string): boolean {
  if (text === "" || text.indexOf("\n\n") >= 0) return true;
  const first = text.split("\n")[0] ?? "";
  return /^(?:#{1,3} |- |-{3,}\s*$|\d+\.\s|-\s*\[|>|`{3,}|\\)/.test(first);
}

/** 引用转义：每行前加一个反斜杠，解析时逐行剥掉一个，保证任意文本逐字往返 */
function quoteMdParagraph(text: string): string {
  return text.split("\n").map((line) => `\\${line}`).join("\n");
}

/** 代码围栏长度：内容里出现 N 个前导反斜引号时围栏升到 N+1，避免内容里的 ``` 截断代码块 */
function mdFenceFor(text: string): string {
  let width = 3;
  for (const line of text.split("\n")) {
    const m = /^`+/.exec(line);
    if (m) width = Math.max(width, m[0].length + 1);
  }
  return "`".repeat(width);
}

/**
 * 块 → Markdown（r9 唯一导出装配入口）：
 * ① 先按 (position, id) 排序（与 assembleDocumentText 同口径）；缺 position 时保持输入顺序；
 * ② 每块渲染成一个「段」，段间空行分隔；连续 numbered 用 computeNumberedOrdinals 递增编号；
 * ③ paragraph 文本若会被误判成标记块（# / - / 1. / > / --- / ``` / 反斜杠开头）或含空行，
 *    用逐行前置反斜杠的引用转义，保证 markdownToBlocks 往返逐字不丢内容；
 * ④ code 用 ```lang 围栏，围栏宽度随内容自适应。
 */
export function blocksToMarkdown(blocks: readonly MarkdownSourceBlock[]): string {
  const indexed = blocks.map((b, idx) => ({ b, idx }));
  indexed.sort((x, y) => {
    const px = x.b.position ?? x.idx;
    const py = y.b.position ?? y.idx;
    if (px !== py) return px - py;
    const ix = x.b.id ?? x.idx;
    const iy = y.b.id ?? y.idx;
    if (ix !== iy) return ix - iy;
    return x.idx - y.idx;
  });
  const ordinals = computeNumberedOrdinals(indexed.map((e) => e.b));
  const chunks: string[] = [];
  for (let k = 0; k < indexed.length; k += 1) {
    const b = indexed[k]!.b;
    assertValidBlockType(b.type);
    const content = normalizeBlockContent(b.type, b.content);
    const text = content.text;
    switch (b.type) {
      case "heading1": chunks.push(`# ${text}`); break;
      case "heading2": chunks.push(`## ${text}`); break;
      case "heading3": chunks.push(`### ${text}`); break;
      case "bullet": chunks.push(`- ${text}`); break;
      case "numbered": chunks.push(`${ordinals[k]}. ${text}`); break;
      case "todo": chunks.push(`- [${content.checked ? "x" : " "}] ${text}`); break;
      case "quote": chunks.push(`> ${text}`); break;
      case "divider": chunks.push("---"); break;
      case "code": {
        const fence = mdFenceFor(text);
        chunks.push(`${fence}${content.language ?? ""}\n${text}\n${fence}`);
        break;
      }
      case "paragraph":
        chunks.push(mdNeedsQuote(text) ? quoteMdParagraph(text) : text);
        break;
    }
  }
  return chunks.join("\n\n");
}

/**
 * Markdown → 块（r9 唯一解析入口，10 种块类型双向）：
 * - 空行作段分隔；``` 围栏进入 code 状态机（内部空行也算内容）；
 * - 段首行以反斜杠开头 → 引用转义的 paragraph，逐行剥掉一个反斜杠后按 \n 拼回；
 * - 段首行命中 # / ## / ### / - [x] / - / 数字. / > / --- 则按类型渲染，
 *   后续行以 \n 拼进该块文本（多行文本不丢）；
 * - 其它语法（#### / **加粗** / 表格 / HTML / 圆括号序号 / + 列表…）一律降级为 paragraph，
 *   **整段逐字保留**，不丢内容。
 */
export function markdownToBlocks(md: string): MarkdownBlockDraft[] {
  if (typeof md !== "string") throw new ValidationError("Markdown 必须是字符串");
  const src = md.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = src.split("\n");
  const out: MarkdownBlockDraft[] = [];
  const push = (type: BlockType, text: string, extra?: { checked?: boolean; language?: string }): void => {
    out.push({ type, content: normalizeBlockContent(type, { text, ...extra }) });
  };
  let i = 0;
  while (i < lines.length) {
    const head = lines[i]!;
    if (head.trim() === "") { i += 1; continue; }
    // —— 代码围栏状态机 ——
    const open = /^(`{3,})(.*)$/.exec(head);
    if (open) {
      const fence = open[1]!;
      const language = (open[2] ?? "").trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && lines[i]!.trim() !== fence) {
        body.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length) i += 1; // 吃掉闭合围栏
      push("code", body.join("\n"), { language });
      continue;
    }
    // —— 收集一个段：连续非空行 ——
    const chunk: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "") {
      chunk.push(lines[i]!);
      i += 1;
    }
    const first = chunk[0]!;
    const rest = chunk.slice(1);
    if (first.startsWith("\\")) {
      push("paragraph", chunk.map((l) => (l.startsWith("\\") ? l.slice(1) : l)).join("\n"));
      continue;
    }
    const tail = (lead: string): string => [lead, ...rest].join("\n");
    let m: RegExpExecArray | null;
    if ((m = /^### (.*)$/.exec(first))) { push("heading3", tail(m[1]!)); continue; }
    if ((m = /^## (.*)$/.exec(first))) { push("heading2", tail(m[1]!)); continue; }
    if ((m = /^# (.*)$/.exec(first))) { push("heading1", tail(m[1]!)); continue; }
    if ((m = /^-\s+\[([ xX])\]\s?(.*)$/.exec(first))) { push("todo", tail(m[2]!), { checked: m[1]!.toLowerCase() === "x" }); continue; }
    if (/^-{3,}\s*$/.test(first) && rest.length === 0) { push("divider", ""); continue; }
    if ((m = /^- (.*)$/.exec(first))) { push("bullet", tail(m[1]!)); continue; }
    if ((m = /^\d+\.\s(.*)$/.exec(first))) { push("numbered", tail(m[1]!)); continue; }
    if ((m = /^>\s?(.*)$/.exec(first))) { push("quote", tail(m[1]!)); continue; }
    push("paragraph", chunk.join("\n")); // 未知语法降级：逐字保留
  }
  return out;
}

/** 导入错误行（行号 1 起，指第 N 个块；reason 为可直接展示的中文原因） */
export interface MarkdownImportRowError {
  row: number;
  reason: string;
}

/** 导入计划（preview 与 commit 共用同一份口径，与 r7 planCsvImport 同款） */
export interface MarkdownImportPlan {
  total: number;
  rows: MarkdownBlockDraft[];
  errors: MarkdownImportRowError[];
  preview: MarkdownBlockDraft[];
}

/** 导入请求体归一：Markdown 文本 / { markdown } / { blocks } 三种形态 → 源块数组 */
export function normalizeMarkdownImportPayload(raw: unknown): MarkdownSourceBlock[] {
  let drafts: MarkdownSourceBlock[];
  if (typeof raw === "string") {
    if (raw.length > MAX_MARKDOWN_LENGTH) throw new ValidationError(`Markdown 过长：最多 ${MAX_MARKDOWN_LENGTH} 字`);
    drafts = markdownToBlocks(raw);
  } else if (isPlainObject(raw)) {
    if (raw["markdown"] !== undefined) {
      const md = raw["markdown"];
      if (typeof md !== "string") throw new ValidationError("markdown 必须是字符串");
      if (md.trim() === "") throw new ValidationError("Markdown 内容不能为空");
      if (md.length > MAX_MARKDOWN_LENGTH) {
        throw new ValidationError(`Markdown 过长：最多 ${MAX_MARKDOWN_LENGTH} 字`);
      }
      drafts = markdownToBlocks(md);
    } else if (raw["blocks"] !== undefined) {
      const blocks = raw["blocks"];
      if (!Array.isArray(blocks)) throw new ValidationError("blocks 必须是数组");
      if (blocks.length === 0) throw new ValidationError("blocks 不能为空数组");
      drafts = blocks.map((b) =>
        isPlainObject(b) ? { type: b["type"], content: b["content"] } : { type: b, content: undefined },
      );
    } else {
      throw new ValidationError("导入体必须是 { markdown } 或 { blocks }");
    }
  } else {
    throw new ValidationError("导入体必须是 Markdown 文本 / { markdown } / { blocks }");
  }
  if (drafts.length === 0) throw new ValidationError("Markdown 没有任何可导入的块");
  return drafts;
}

/**
 * 导入计划（r9 唯一口径，与 r7 planCsvImport 同款）：
 * 逐块走 shared normalizeBlockContent（含 assertValidBlockType 与文本 / 语言 / checked 校验），
 * 非法块**不阻断**整批：收集到 errors（块号 + 中文原因），合法块进 rows；
 * preview 取前 MARKDOWN_IMPORT_PREVIEW_ROWS 个合法块。
 */
export function planMarkdownImport(rows: readonly MarkdownSourceBlock[]): MarkdownImportPlan {
  const valid: MarkdownBlockDraft[] = [];
  const errors: MarkdownImportRowError[] = [];
  rows.forEach((row, idx) => {
    try {
      assertValidBlockType(row.type);
      valid.push({ type: row.type, content: normalizeBlockContent(row.type, row.content) });
    } catch (err: unknown) {
      errors.push({ row: idx + 1, reason: err instanceof Error ? err.message : String(err) });
    }
  });
  return {
    total: rows.length,
    rows: valid,
    errors,
    preview: valid.slice(0, MARKDOWN_IMPORT_PREVIEW_ROWS),
  };
}

/**
 * 导入提交判定（零半态口径，集中在 shared）：
 * **任一块非法 → 一块都不落库**（全成功或全不落，没有中间态）。
 */
export function shouldCommitMarkdownImport(plan: MarkdownImportPlan): boolean {
  return plan.errors.length === 0 && plan.rows.length > 0;
}

// ---- r9：AI 块级修订（provider 无关契约 + 「采纳才改库」判定，全部集中 shared） ----

/** 修订请求：给 provider 的入参（instruction + 块内容，不依赖任何具体模型 SDK） */
export interface RevisionRequest {
  instruction: string;
  blockType: BlockType;
  originalText: string;
}

/** 修订建议：provider 的回参（provider 无关，M5 换成真实模型也返回同一形状） */
export interface RevisionSuggestion {
  suggestedText: string;
  rationale: string;
  provider: string;
}

/** 修订 provider 契约（M5 接真实模型只需实现此接口并注入，api 层不改） */
export interface RevisionProvider {
  readonly id: string;
  propose(request: RevisionRequest): Promise<RevisionSuggestion> | RevisionSuggestion;
}

export function assertValidRevisionInstruction(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("修订指令 instruction 不能为空");
  }
  if (value.length > MAX_REVISION_INSTRUCTION) {
    throw new ValidationError(`修订指令过长：最多 ${MAX_REVISION_INSTRUCTION} 字`);
  }
}

/** 采纳判定：未采纳（adopt 非 true）时 applied=false 且 text 保持原文，api 据此不写库 */
export interface RevisionApplyPlan {
  applied: boolean;
  text: string;
}

export function planRevisionApply(
  originalText: string,
  suggestedText: string,
  adopt: unknown,
): RevisionApplyPlan {
  return adopt === true
    ? { applied: true, text: suggestedText }
    : { applied: false, text: originalText };
}

/** 文档导出文件名：xieflow-doc-<文档名>-<YYYYMMDD>.md（复用 sanitizeFileNamePart 口径） */
export function buildDocumentMdFileName(title: string, now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `xieflow-doc-${sanitizeFileNamePart(title)}-${y}${m}${d}.md`;
}

// ---- r10：AI 工作台对话与工具调用（M5 起步，全部契约/规则集中 shared） ----

/** 会话标题与聊天消息上限（守卫在 shared，api 只映射 400） */
export const MAX_CONVERSATION_TITLE = 200;
export const MAX_CHAT_MESSAGE = 2000;

export type MessageRole = "user" | "assistant" | "tool";
export const MESSAGE_ROLES: readonly MessageRole[] = ["user", "assistant", "tool"];
export const ARTIFACT_TYPES = ["chat-result", "html-report", "markdown-table", "json-data"] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export interface Conversation {
  readonly id: number;
  readonly title: string;
  readonly createdAt: string;
}

/** 消息正文：纯 JSON 对象，至少带 text；工具回执消息额外挂 toolCalls */
export interface MessageContent {
  readonly text: string;
  readonly [key: string]: unknown;
}

/** 一条落库的工具调用回执（tool_calls_json 的元素，逐条可查） */
export interface ToolCallRecord {
  readonly id: string;
  readonly name: ToolName;
  readonly arguments: Record<string, unknown>;
  readonly ok: boolean;
  readonly summary: string;
  readonly data?: unknown;
  readonly error?: string;
}

export interface Message {
  readonly id: number;
  readonly conversationId: number;
  readonly role: MessageRole;
  readonly content: MessageContent;
  readonly toolCalls: readonly ToolCallRecord[];
  readonly createdAt: string;
}

export interface Artifact {
  readonly id: number;
  readonly conversationId: number;
  readonly type: ArtifactType;
  readonly title: string;
  readonly content: string;
  readonly createdAt: string;
}

/** 12 个工具名（r10 八工具 + r11 四工具；集中清单，注册表/回放/UI 共用，禁止散落字面量） */
export const TOOL_NAMES = [
  "list_todos",
  "create_todo",
  "list_documents",
  "create_document",
  "list_projects",
  "list_cards",
  "list_tables",
  "search_knowledge",
  "summarize_document",
  "export_document_md",
  "list_schedules",
  "create_schedule",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** 状态变更类工具（回放必须带「实际创建」断言；只读工具不需要） */
export const STATE_CHANGING_TOOLS: readonly ToolName[] = ["create_todo", "create_document", "create_schedule"];

export function isToolName(value: unknown): value is ToolName {
  return typeof value === "string" && (TOOL_NAMES as readonly string[]).includes(value);
}

export function assertValidToolName(value: unknown): asserts value is ToolName {
  if (!isToolName(value)) {
    throw new ValidationError(`未知工具：${String(value)}`);
  }
}

export function assertValidMessageRole(value: unknown): asserts value is MessageRole {
  if (typeof value !== "string" || !(MESSAGE_ROLES as readonly string[]).includes(value)) {
    throw new ValidationError(`非法消息角色：${String(value)}`);
  }
}

export function assertValidArtifactType(value: unknown): asserts value is ArtifactType {
  if (typeof value !== "string" || !(ARTIFACT_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError(`非法产物类型：${String(value)}`);
  }
}

export function assertValidConversationTitle(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("会话标题不能为空");
  }
  if (value.length > MAX_CONVERSATION_TITLE) {
    throw new ValidationError(`会话标题过长：最多 ${MAX_CONVERSATION_TITLE} 字`);
  }
}

export function assertValidChatMessage(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("消息内容不能为空");
  }
  if (value.length > MAX_CHAT_MESSAGE) {
    throw new ValidationError(`消息内容过长：最多 ${MAX_CHAT_MESSAGE} 字`);
  }
}

/** 工具调用入参（name + 对象参数）：归一与守卫唯一入口，未知工具/非法参数在此抛错 */
export interface ToolCallRequest {
  readonly name: ToolName;
  readonly arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  readonly name: ToolName;
  readonly description: string;
  readonly parameters: {
    readonly type: "object";
    readonly properties: Record<
      string,
      { readonly type: string; readonly description?: string; readonly enum?: readonly string[] }
    >;
    readonly required: readonly string[];
  };
}

export interface ToolResult {
  readonly ok: boolean;
  readonly name: ToolName;
  readonly summary: string;
  readonly data: unknown;
  readonly error?: string;
}

export function normalizeToolCallRequest(raw: unknown): ToolCallRequest {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("工具调用必须是对象");
  }
  const obj = raw as Record<string, unknown>;
  assertValidToolName(obj.name);
  const args = obj.arguments ?? {};
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new ValidationError(`工具 ${obj.name} 的参数必须是对象`);
  }
  return { name: obj.name, arguments: args as Record<string, unknown> };
}

/** 脚本化意图规则表：关键词命中 → 工具调用序列。M5 全用 mock，零 token 零随机。 */
export interface ScriptedIntent {
  readonly id: ToolName;
  readonly keywords: readonly string[];
  readonly summary: string;
}

export const SCRIPTED_INTENTS: readonly ScriptedIntent[] = [
  { id: "create_todo", keywords: ["新建待办", "新建一个待办", "新建个待办", "创建一个待办", "创建待办", "添加待办", "加个待办", "建个待办", "新增待办"], summary: "新建待办" },
  { id: "create_document", keywords: ["新建文档", "创建文档", "建个文档", "添加文档", "新增文档"], summary: "新建文档" },
  { id: "create_schedule", keywords: ["新建日程", "创建日程", "安排日程", "新增日程", "添加日程"], summary: "新建日程" },
  { id: "export_document_md", keywords: ["导出文档", "导出 Markdown", "导出markdown", "导出 md", "导出MD"], summary: "导出文档 Markdown" },
  { id: "summarize_document", keywords: ["总结文档", "文档摘要", "概括文档", "文档总结"], summary: "文档摘要" },
  { id: "list_todos", keywords: ["待办", "任务"], summary: "待办清单" },
  { id: "list_documents", keywords: ["文档"], summary: "文档清单" },
  { id: "list_projects", keywords: ["项目"], summary: "项目清单" },
  { id: "list_cards", keywords: ["卡片", "看板"], summary: "看板卡片" },
  { id: "list_tables", keywords: ["表格", "多维表"], summary: "多维表格" },
  { id: "list_schedules", keywords: ["日程", "排期"], summary: "日程清单" },
  { id: "search_knowledge", keywords: ["知识库", "知识", "检索"], summary: "知识库检索" },
];

/** 从脚本消息里抽标题：「：/:</quoted>」优先，否则整句截断，保证确定性 */
function extractScriptedTitle(message: string): string {
  const colon = message.match(/[:：]\s*([^，。；;]+)/);
  if (colon?.[1]) return colon[1].trim().slice(0, MAX_TODO_TITLE);
  const quoted = message.match(/[「"']([^」"']+)[」"']/);
  if (quoted?.[1]) return quoted[1].trim().slice(0, MAX_TODO_TITLE);
  return message.trim().slice(0, MAX_TODO_TITLE);
}

/** 从脚本消息抽日程参数：日期 / 起止时间 / 去掉日期时间后的标题（确定性，零随机） */
function extractScheduleArgs(message: string): { title: string; date: string; start: string; end: string } | null {
  const dateMatch = message.match(/(\d{4}-\d{2}-\d{2})/);
  const timeMatch = message.match(/(\d{1,2}:\d{2})\s*[-~—至到]\s*(\d{1,2}:\d{2})/);
  if (!dateMatch?.[1] || !timeMatch?.[1] || !timeMatch?.[2]) return null;
  const pad = (hms: string): string => (hms.length === 4 ? `0${hms}` : hms);
  const rawTitle = (message.match(/[:：]\s*([^，。；;]+)/)?.[1] ?? message).trim();
  const title = rawTitle
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\d{1,2}:\d{2}\s*[-~—至到]\s*\d{1,2}:\d{2}/g, "")
    .replace(/[\s,，]+$/g, "")
    .trim()
    .slice(0, MAX_TODO_TITLE);
  return { title: title === "" ? "新日程" : title, date: dateMatch[1], start: pad(timeMatch[1]), end: pad(timeMatch[2]) };
}

/** 从脚本消息抽文档 id（「文档 3」/「documentId: 3」）；无 id 返回 null（handler 返 ok=false，不伪造） */
function extractDocumentId(message: string): number | null {
  const m = message.match(/文档\s*#?(\d+)|documentId\s*[:：]?\s*(\d+)/i);
  const n = Number(m?.[1] ?? m?.[2]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---- r11：多轮上下文 / 产物生成 / 行内 diff（全部契约与规则仍集中 shared） ----

/** 三类可由工具结果生成的产物（chat-result 为 r10 兼容的通用 JSON 产物） */
export const GENERATED_ARTIFACT_TYPES = ["html-report", "markdown-table", "json-data"] as const;
export type GeneratedArtifactType = (typeof GENERATED_ARTIFACT_TYPES)[number];
export const DEFAULT_ARTIFACT_TYPE: ArtifactType = "chat-result";

export const ARTIFACT_GENERATOR_LABELS: Record<ArtifactType, string> = {
  "chat-result": "对话产物",
  "html-report": "HTML 报告",
  "markdown-table": "Markdown 表格",
  "json-data": "JSON 数据",
};

export function isGeneratedArtifactType(value: unknown): value is GeneratedArtifactType {
  return typeof value === "string" && (GENERATED_ARTIFACT_TYPES as readonly string[]).includes(value);
}

export function assertValidGeneratedArtifactType(value: unknown): asserts value is GeneratedArtifactType {
  if (!isGeneratedArtifactType(value)) {
    throw new ValidationError(`非法产物生成类型：${String(value)}`);
  }
}

/** chat 请求产物类型归一：缺省 → chat-result；三类生成类型原样；其余抛错 → HTTP 400 */
export function normalizeArtifactTypeRequest(value: unknown): ArtifactType {
  if (value === undefined || value === null) return DEFAULT_ARTIFACT_TYPE;
  assertValidArtifactType(value);
  return value;
}

/** GET /api/artifacts/:id/content 的 content-type 唯一口径 */
export function contentTypeForArtifactType(type: ArtifactType): string {
  if (type === "html-report") return "text/html; charset=utf-8";
  if (type === "markdown-table") return "text/markdown; charset=utf-8";
  return "application/json; charset=utf-8";
}

/** 上下文窗口：默认 8，上限 20（防超长上下文拖垮 mock 规划） */
export const DEFAULT_CONTEXT_WINDOW = 8;
export const MAX_CONTEXT_WINDOW = 20;

export function assertValidContextWindow(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_CONTEXT_WINDOW) {
    throw new ValidationError(`context_window 必须是 1~${MAX_CONTEXT_WINDOW} 的整数`);
  }
}

export function normalizeContextWindow(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_CONTEXT_WINDOW;
  assertValidContextWindow(value);
  return value;
}

/** 规划器上下文只取 role + 文本（不含 id/时间戳，保证回放逐字节确定） */
export interface PlannerContextMessage {
  readonly role: MessageRole;
  readonly text: string;
}

export function toPlannerContext(messages: readonly Message[]): PlannerContextMessage[] {
  return messages.map((m) => ({ role: m.role, text: m.content.text }));
}

export interface ContextResolution {
  readonly resolved: boolean;
  /** 解析后的可执行脚本消息（未解析时原文返回） */
  readonly message: string;
  readonly referenceKind: "none" | "repeat" | "retitle";
  /** 被指代的上一轮实体标题（可审计） */
  readonly referencedTitle?: string;
}

const NO_RESOLUTION: ContextResolution = { resolved: false, message: "", referenceKind: "none" };

/** 从上一轮创建消息还原「新建待办 q1：标题」式确定性脚本（保留实体类型与象限/日期时间） */
function rebuildCreateMessage(priorText: string, newTitle: string): string {
  if (priorText.includes("新建日程") || priorText.includes("创建日程") || priorText.includes("安排日程")) {
    const s = extractScheduleArgs(priorText);
    if (s) return `新建日程：${newTitle} ${s.date} ${s.start}-${s.end}`;
    return `新建日程：${newTitle}`;
  }
  if (priorText.includes("新建文档") || priorText.includes("创建文档") || priorText.includes("建个文档")) {
    return `新建文档：${newTitle}`;
  }
  const q = priorText.match(/\bq([1-4])\b/i)?.[1];
  return q ? `新建待办 q${q}：${newTitle}` : `新建待办：${newTitle}`;
}

/**
 * 跨轮指代消解：仅对「再建一个 / 把它改成」类表达生效，引用最近一条创建类用户消息的真实标题。
 * 无历史或无法定位实体时原样返回（不硬解、不编造）；纯函数、零随机，可录制回放。
 * 注：M5 mock 工具集未提供 update 工具，「改成」按「参照上一轮实体生成修正版」解释并在元数据标注 retitle。
 */
export function resolveContextualMessage(message: string, context: readonly PlannerContextMessage[]): ContextResolution {
  const isRepeat = /再建一个|再建个|再来一个|再创建一?个|再来一份/.test(message);
  const isRetitle = /把它改成|把它改为|改成|改为/.test(message);
  if (!isRepeat && !isRetitle) return { ...NO_RESOLUTION, message };

  const prior = [...context].reverse().find((m) => {
    if (m.role !== "user") return false;
    return ["新建待办", "创建待办", "新建文档", "创建文档", "新建日程", "创建日程", "安排日程", "添加待办", "加个待办"].some((k) => m.text.includes(k));
  });
  if (!prior) return { ...NO_RESOLUTION, message };
  const referencedTitle = extractScriptedTitle(prior.text);

  if (isRetitle) {
    const explicit = message.match(/(?:把它)?(?:改成|改为)\s*[:：]?\s*([^，。；;,]+)/)?.[1]?.trim();
    const title = (explicit && explicit !== "" ? explicit : extractScriptedTitle(message)).slice(0, MAX_TODO_TITLE);
    return { resolved: true, message: rebuildCreateMessage(prior.text, title), referenceKind: "retitle", referencedTitle };
  }

  const explicit = message.match(/(?:再建一个|再建个|再来一个|再创建一?个|再来一份)\s*[:：,，]?\s*([^，。；;]+)/)?.[1]?.trim();
  const title = (explicit && explicit !== "" ? explicit : `${referencedTitle}（再建）`).slice(0, MAX_TODO_TITLE);
  return { resolved: true, message: rebuildCreateMessage(prior.text, title), referenceKind: "repeat", referencedTitle };
}

/** 行内 diff 段：same=未变 / removed=删除（旧文高亮）/ added=新增（新文高亮） */
export interface DiffSegment {
  readonly kind: "same" | "removed" | "added";
  readonly text: string;
}

/** 行内增删改：中文按字、英文数字按词切分，LCS 求最长公共子序列，再合并相邻同类段 */
export function computeInlineDiff(original: string, suggested: string): DiffSegment[] {
  const tokenize = (s: string): string[] => s.match(/[\u4e00-\u9fff]|[A-Za-z0-9_]+|\s+|[^\s]/g) ?? [];
  const a = tokenize(original);
  const b = tokenize(suggested);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const ops: { kind: DiffSegment["kind"]; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ kind: "removed", text: a[i]! });
      i++;
    } else {
      ops.push({ kind: "added", text: b[j]! });
      j++;
    }
  }
  while (i < n) { ops.push({ kind: "removed", text: a[i]! }); i++; }
  while (j < m) { ops.push({ kind: "added", text: b[j]! }); j++; }
  const merged: DiffSegment[] = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.kind === op.kind) merged[merged.length - 1] = { kind: last.kind, text: last.text + op.text };
    else merged.push({ ...op });
  }
  return merged;
}

/** 脚本化规划：扫描所有命中意图，按规则表顺序去重产出工具调用序列。r11 支持上下文指代消解。 */
export interface PlannedChat {
  readonly intent: string;
  readonly toolCalls: readonly ToolCallRequest[];
  /** 仅当传入上下文且命中指代时携带（回放可审计；无指代时不出现，保持 r10 输出逐字节兼容） */
  readonly resolution?: ContextResolution;
}

export function planScriptedChat(message: string, context?: readonly PlannerContextMessage[]): PlannedChat {
  const resolution = context === undefined ? undefined : resolveContextualMessage(message, context);
  const effective = resolution?.resolved ? resolution.message : message;
  const hit = SCRIPTED_INTENTS.filter((rule) => effective.includes(rule.keywords[0]!) || rule.keywords.some((k) => effective.includes(k)));
  const seen = new Set<ToolName>();
  const toolCalls: ToolCallRequest[] = [];
  for (const rule of hit) {
    if (seen.has(rule.id)) continue;
    seen.add(rule.id);
    const args: Record<string, unknown> = {};
    if (rule.id === "create_todo" || rule.id === "create_document") {
      args.title = extractScriptedTitle(effective);
      if (rule.id === "create_todo") {
        const q = effective.match(/\bq([1-4])\b/i);
        args.quadrant = q?.[1] ? `q${q[1]}` : "q2";
      }
    } else if (rule.id === "create_schedule") {
      const s = extractScheduleArgs(effective);
      if (s) {
        args.title = s.title;
        args.date = s.date;
        args.start = s.start;
        args.end = s.end;
      }
    } else if (rule.id === "summarize_document" || rule.id === "export_document_md") {
      const docId = extractDocumentId(effective);
      if (docId !== null) args.documentId = docId;
    } else if (rule.id === "list_cards") {
      const pid = effective.match(/项目\s*(\d+)|projectId\s*[:：]?\s*(\d+)/i);
      const num = Number(pid?.[1] ?? pid?.[2]);
      if (Number.isInteger(num) && num > 0) args.projectId = num;
    } else if (rule.id === "list_schedules") {
      const dates = effective.match(/\d{4}-\d{2}-\d{2}/g);
      if (dates?.[1]) {
        args.from = dates[0];
        args.to = dates[1];
      }
    } else if (rule.id === "search_knowledge") {
      args.query = effective.trim().slice(0, MAX_CHAT_MESSAGE);
    }
    toolCalls.push({ name: rule.id, arguments: args });
  }
  return {
    intent: hit.map((r) => r.id).join("+") || "empty",
    toolCalls,
    ...(resolution?.resolved ? { resolution } : {}),
  };
}

/** AI 汇总文案唯一口径：次数 + 逐条回执摘要（provider 无关） */
export function buildChatSummary(intent: string, results: readonly ToolResult[]): string {
  const lines = results.map((r, i) => `${i + 1}. ${r.name}：${r.summary}`);
  return `已完成「${intent}」：共 ${results.length} 次工具调用。${lines.length > 0 ? `\n${lines.join("\n")}` : ""}`;
}

// ---- r12（M6 起步）：知识库入库与检索（本地 RAG）契约，全部集中 shared ----

/** 知识文档来源类型：纯文本 / 真实文档（schema CHECK 同源，禁散落字面量） */
export const KNOWLEDGE_SOURCE_TYPES = ["text", "document"] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];
export function isKnowledgeSourceType(value: unknown): value is KnowledgeSourceType {
  return typeof value === "string" && (KNOWLEDGE_SOURCE_TYPES as readonly string[]).includes(value);
}
export function assertValidKnowledgeSourceType(value: unknown): asserts value is KnowledgeSourceType {
  if (!isKnowledgeSourceType(value)) {
    throw new ValidationError(`非法 source_type：${String(value)}（仅 text / document）`);
  }
}

/** 知识库输入上限（api 400 守卫与 UI 计数同源） */
export const MAX_KNOWLEDGE_TITLE = 200;
export const MAX_KNOWLEDGE_CONTENT = 200000;
export const MAX_KNOWLEDGE_QUERY = 500;
export const MAX_KNOWLEDGE_SEARCH_LIMIT = 50;

export function assertValidKnowledgeTitle(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("知识文档标题不能为空");
  }
  if (value.length > MAX_KNOWLEDGE_TITLE) {
    throw new ValidationError(`知识文档标题过长：最多 ${MAX_KNOWLEDGE_TITLE} 字`);
  }
}
export function assertValidKnowledgeContent(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("知识文档内容不能为空");
  }
  if (value.length > MAX_KNOWLEDGE_CONTENT) {
    throw new ValidationError(`知识文档内容过长：最多 ${MAX_KNOWLEDGE_CONTENT} 字`);
  }
}
export function assertValidKnowledgeQuery(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("检索词不能为空");
  }
  if (value.length > MAX_KNOWLEDGE_QUERY) {
    throw new ValidationError(`检索词过长：最多 ${MAX_KNOWLEDGE_QUERY} 字`);
  }
}
export function normalizeKnowledgeLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return 5;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > MAX_KNOWLEDGE_SEARCH_LIMIT) {
    throw new ValidationError(`limit 必须是 1~${MAX_KNOWLEDGE_SEARCH_LIMIT} 的整数`);
  }
  return n;
}

/** 知识文档 / 分块快照（mappers camelCase 唯一口径） */
export interface KnowledgeDoc {
  readonly id: number;
  readonly title: string;
  readonly sourceType: KnowledgeSourceType;
  readonly sourceId: number | null;
  readonly content: string;
  readonly chunkCount: number;
  readonly createdAt: string;
}
export interface KnowledgeChunk {
  readonly id: number;
  readonly docId: number;
  readonly position: number;
  readonly content: string;
  readonly tokenCount: number;
}
/** 分块草稿（chunkText 产出，db 入库入参；vector 可空，embedding 留位） */
export interface KnowledgeChunkDraft {
  readonly position: number;
  readonly content: string;
  readonly tokenCount: number;
}
/** 检索源块（db JOIN 文档来源字段 → agent 纯函数检索入口） */
export interface KnowledgeSearchChunk {
  readonly id: number;
  readonly docId: number;
  readonly position: number;
  readonly content: string;
  readonly docTitle: string;
  readonly sourceType: KnowledgeSourceType;
  readonly sourceId: number | null;
}
/** 检索命中（doc_id / chunk_id 来源引用可溯源到具体 chunk） */
export interface KnowledgeSearchHit {
  readonly docId: number;
  readonly chunkId: number;
  readonly position: number;
  readonly content: string;
  readonly docTitle: string;
  readonly sourceType: KnowledgeSourceType;
  readonly sourceId: number | null;
  readonly score: number;
}

// ---- r13（M6 收官）：RAG 对话与引用溯源契约，规则全集中 shared（api/web 零分支） ----

/** 引用清单条目：doc_id / chunk_id / 摘要片段 / 相关度，可回溯到具体知识分块 */
export interface RagCitation {
  readonly docId: number;
  readonly chunkId: number;
  readonly snippet: string;
  readonly score: number;
  /** 展示/跳转用来源标题与片序（四要件之外的补充字段，不参与相等性判定） */
  readonly docTitle: string;
  readonly position: number;
}
/** 引用片段长度（UID 与断言同源） */
export const RAG_SNIPPET_LENGTH = 120;
/** 无命中时的诚实答复必须含此句（禁编造，改坏即红） */
export const RAG_NO_HIT_ANSWER = "知识库没有相关内容";
/**
 * RAG 意图词：仅「根据知识库 / 查资料 / 文档里」类问法，
 * 不含 r10/r12 的「检索知识库 / 在知识库检索 XXX」（那是直接工具调用不是问答）。
 */
export const RAG_INTENT_KEYWORDS: readonly string[] = [
  "根据知识库", "从知识库", "知识库里", "知识库中", "参考知识库",
  "查资料", "查一下资料", "查查资料", "文档里", "根据文档", "参考文档",
];
export function isRagIntentQuery(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return RAG_INTENT_KEYWORDS.some((k) => value.includes(k));
}
/** 抽检索词：去掉触发前缀与语气词，失败回退原消息（确定性，零随机） */
export function extractRagQuery(value: string): string {
  let q = String(value ?? "").trim();
  const prefix = /^(?:请|帮我)?(?:根据知识库|从知识库|知识库里|知识库中|参考知识库|查一下资料|查查资料|查资料|文档里|根据文档|参考文档)\s*[:：，,、啊呀]?\s*/u;
  let prev = "";
  while (q !== prev && q.length > 0) {
    prev = q;
    q = q.replace(prefix, "").trim();
  }
  q = q.replace(/^(?:请|帮我|回答|说一下|介绍|告诉我)\s*[:：，,、]?\s*/u, "").trim();
  return q.length > 0 ? q.slice(0, MAX_CHAT_MESSAGE) : String(value ?? "").trim().slice(0, MAX_CHAT_MESSAGE);
}
/** GET /api/knowledge/docs/:id?chunkId= 的溯源参数归一（非法 → ValidationError → 400） */
export function normalizeTracebackChunkId(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError("chunkId 必须是正整数");
  return n;
}

// ---- r14（M7 起步）：思维导图 Markdown 双视图（解析/装配/折叠规则全集中 shared，api/web 零算法分支） ----

/** 导图标题与 Markdown 源上限（api 400 守卫、UI 计数同源） */
export const MAX_MINDMAP_TITLE = 200;
export const MAX_MINDMAP_CONTENT = 200000;

export function assertValidMindmapTitle(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("导图标题不能为空");
  }
  if (value.length > MAX_MINDMAP_TITLE) {
    throw new ValidationError(`导图标题过长：最多 ${MAX_MINDMAP_TITLE} 字`);
  }
}

/** 写内容守卫：非空、长度受限、禁 NUL 控制字符（非法 Markdown → 400） */
export function assertValidMindmapContent(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("Markdown 内容不能为空");
  }
  if (value.length > MAX_MINDMAP_CONTENT) {
    throw new ValidationError(`Markdown 内容过长：最多 ${MAX_MINDMAP_CONTENT} 字`);
  }
  if (value.includes("\u0000")) {
    throw new ValidationError("Markdown 含非法控制字符（NUL）");
  }
}

/** 建导图允许空 Markdown（空态不是死路）；非空时仍走完整守卫 */
export function assertValidMindmapContentOrEmpty(value: unknown): asserts value is string {
  if (value === undefined || value === null || value === "") return;
  assertValidMindmapContent(value);
}

/** 导图领域对象（schema v10 mindmaps 表 camelCase 映射） */
export interface Mindmap {
  readonly id: number;
  readonly title: string;
  readonly contentMarkdown: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 树节点来源类型：标题 / 无序 / 有序 / 待办 / 引用 / 普通文本（未知语法降级 text） */
export type MindmapNodeKind = "heading" | "bullet" | "numbered" | "todo" | "quote" | "text";

/**
 * 树节点：
 * - label 为去掉 marker 的可展示文本；raw 为逐字源行（含 marker / 围栏多行），treeToMarkdown 以 raw 装配；
 * - id 为确定性路径（n0 / n0.1 / n0.1.2），同 Markdown 得同 id → 折叠状态 reload 可复现；
 * - blankBefore 为此节点前的空行数，trailingBlanks 为文末空行数，二者保证往返不丢空行。
 */
export interface MindmapNode {
  readonly id: string;
  readonly label: string;
  readonly raw: string;
  readonly kind: MindmapNodeKind;
  readonly depth: number;
  readonly line: number;
  readonly blankBefore: number;
  children: MindmapNode[];
  readonly checked?: boolean;
}

export interface MindmapTree {
  roots: MindmapNode[];
  readonly trailingBlanks: number;
}

export const EMPTY_MINDMAP_TREE: MindmapTree = { roots: [], trailingBlanks: 0 };

/** 缩进宽度：2 空格/层（tab 折算 2 空格） */
const MINDMAP_INDENT_WIDTH = 2;

function mindmapIndent(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === " ") width += 1;
    else if (ch === "\t") width += MINDMAP_INDENT_WIDTH;
    else break;
  }
  return Math.floor(width / MINDMAP_INDENT_WIDTH);
}

/**
 * Markdown → 树（r14 唯一解析入口，转换规则集中于此）：
 * ① 标题 `#{1,6}` 按层级挂到最近更低层标题下；同级/更高层出栈为兄弟/祖先子节点；
 * ② 列表 `-`/`*`/`+`/`1.`/`- [x]` 按缩进挂到当前标题下，缩进深一层则挂到上一列表项；
 * ③ 代码围栏整段（含围栏行）作为一个 text 节点，内部任何 marker 都不参与结构解析；
 * ④ 其它语法（表格/加粗/HTML/四级以上文本…）降级 text 节点，label 与 raw 逐字保留，不丢内容；
 * ⑤ 空行计入 blankBefore / trailingBlanks，CRLF 归一为 LF。
 */
export function parseMarkdownToTree(md: string): MindmapTree {
  if (typeof md !== "string") throw new ValidationError("Markdown 必须是字符串");
  const src = md.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = src.split("\n");
  const roots: MindmapNode[] = [];
  // 虚拟根：children 即 roots；headingStack / listStack 保存真实节点
  const virtualRoot: { level: number; node: { children: MindmapNode[] } } = { level: 0, node: { children: roots } };
  const headingStack: typeof virtualRoot[] = [virtualRoot];
  let listStack: { indent: number; node: MindmapNode }[] = [];
  let i = 0;
  let blanks = 0;
  const attach = (parent: MindmapNode | typeof virtualRoot["node"], nodeFactory: (id: string, depth: number) => MindmapNode): MindmapNode => {
    const isRoot = parent === virtualRoot.node;
    const childIndex = parent.children.length;
    const nodeId = isRoot
      ? `n${childIndex}`
      : `${(parent as MindmapNode).id}.${childIndex}`;
    const depth = isRoot ? 0 : (parent as MindmapNode).depth + 1;
    const node = nodeFactory(nodeId, depth);
    parent.children.push(node);
    return node;
  };
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      blanks += 1;
      i += 1;
      continue;
    }
    // 代码围栏：整段收集为单个 text 节点，内部不做任何结构解析
    const fence = /^(\s*)(`{3,})(.*)$/.exec(line);
    if (fence) {
      const marker = fence[2]!;
      const body: string[] = [line];
      i += 1;
      while (i < lines.length) {
        body.push(lines[i]!);
        const closing = /^(\s*)(`{3,})\s*$/.exec(lines[i]!);
        i += 1;
        if (closing && closing[2]!.length >= marker.length) break;
      }
      const parent = headingStack[headingStack.length - 1]!.node;
      attach(parent, (id, depth) => ({
        id, raw: body.join("\n"), label: body[0]!.trim(), kind: "text", depth,
        line: i - body.length + 1, blankBefore: blanks, children: [],
      }));
      blanks = 0;
      listStack = [];
      continue;
    }
    const heading = /^(\s*)(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[2]!.length;
      while (headingStack.length > 1 && headingStack[headingStack.length - 1]!.level >= level) headingStack.pop();
      const parent = headingStack[headingStack.length - 1]!.node;
      const label = heading[3]!;
      const rawLine = line;
      const sourceLine = i + 1;
      const blankBefore = blanks;
      const node = attach(parent, (id, depth) => ({
        id, raw: rawLine, label, kind: "heading", depth, line: sourceLine, blankBefore, children: [],
      }));
      headingStack.push({ level, node });
      blanks = 0;
      listStack = [];
      i += 1;
      continue;
    }
    const todo = /^(\s*)[-*+]\s+\[([ xX])\]\s*(.*)$/.exec(line);
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const numbered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^(\s*)>\s?(.*)$/.exec(line);
    const listMatch = todo ?? bullet ?? numbered ?? quote;
    const parent = headingStack[headingStack.length - 1]!.node;
    if (listMatch) {
      const indent = mindmapIndent(listMatch[1] ?? "");
      while (listStack.length > 0 && listStack[listStack.length - 1]!.indent >= indent) listStack.pop();
      const listParent = listStack.length > 0 ? listStack[listStack.length - 1]!.node : parent;
      const kind: MindmapNodeKind = todo ? "todo" : numbered ? "numbered" : quote ? "quote" : "bullet";
      const label = (todo ? todo[3] : bullet ? bullet[2] : numbered ? numbered[2] : quote?.[2]) ?? line.trim();
      const checked = todo ? todo[2]!.toLowerCase() === "x" : undefined;
      const rawLine = line;
      const sourceLine = i + 1;
      const blankBefore = blanks;
      const node = attach(listParent, (id, depth) => ({
        id, raw: rawLine, label, kind, depth, line: sourceLine, blankBefore, children: [],
        ...(checked === undefined ? {} : { checked }),
      }));
      listStack.push({ indent, node });
      blanks = 0;
      i += 1;
      continue;
    }
    // 未知语法：降级为普通节点，整行逐字保留（不丢内容）
    const rawLine = line;
    const sourceLine = i + 1;
    const blankBefore = blanks;
    attach(parent, (id, depth) => ({
      id, raw: rawLine, label: rawLine.trim(), kind: "text", depth, line: sourceLine, blankBefore, children: [],
    }));
    blanks = 0;
    listStack = [];
    i += 1;
  }
  return { roots, trailingBlanks: blanks };
}

/** 树 → Markdown（r14 唯一装配入口）：按 DFS 顺序用 raw 逐字重建，blankBefore / trailingBlanks 原样还原 */
export function treeToMarkdown(tree: MindmapTree): string {
  const lines: string[] = [];
  const walk = (nodes: readonly MindmapNode[]): void => {
    for (const node of nodes) {
      for (let b = 0; b < node.blankBefore; b += 1) lines.push("");
      lines.push(node.raw);
      walk(node.children);
    }
  };
  walk(tree.roots);
  for (let b = 0; b < tree.trailingBlanks; b += 1) lines.push("");
  return lines.join("\n");
}

/** 节点总数（含各级子节点，断言与 UI 计数同源） */
export function countMindmapNodes(tree: MindmapTree): number {
  let count = 0;
  const walk = (nodes: readonly MindmapNode[]): void => {
    for (const node of nodes) {
      count += 1;
      walk(node.children);
    }
  };
  walk(tree.roots);
  return count;
}

/** 折叠状态切换（纯函数，web 直接复用；api 零算法分支） */
export function toggleNodeCollapse(collapsedIds: readonly string[], nodeId: string): string[] {
  return collapsedIds.includes(nodeId)
    ? collapsedIds.filter((id) => id !== nodeId)
    : [...collapsedIds, nodeId];
}

// ---- r15（M7 收官）：白板画布布局规则（归一 / 重叠避让 / mock 建板 / 导出 / 坐标换算全集中 shared，api/web 零算法分支） ----

/** 白板条目类型集合（schema v11 whiteboard_items.type CHECK 同源） */
export const WHITEBOARD_ITEM_TYPES = ["note", "text", "shape"] as const;
export type WhiteboardItemType = (typeof WHITEBOARD_ITEM_TYPES)[number];

/** 标题 / 内容 / 坐标 / 尺寸 / 缩放边界（api 400 守卫、UI 计数同源） */
export const MAX_WHITEBOARD_TITLE = 200;
export const MAX_WHITEBOARD_THEME = 200;
export const MAX_WHITEBOARD_CONTENT = 20000;
export const WHITEBOARD_COORD_MIN = -100000;
export const WHITEBOARD_COORD_MAX = 100000;
export const WHITEBOARD_SIZE_MIN = 20;
export const WHITEBOARD_SIZE_MAX = 2000;
/** 重叠避让固定间距（唯一口径，web/api 不另设值） */
export const WHITEBOARD_COLLISION_GAP = 16;
export const WHITEBOARD_MIN_SCALE = 0.4;
export const WHITEBOARD_MAX_SCALE = 2.5;

/** 白板领域对象（schema v11 whiteboards / whiteboard_items 表 camelCase 映射） */
export interface Whiteboard {
  readonly id: number;
  readonly title: string;
  readonly createdAt: string;
}

/** 白板列表摘要：itemCount 由数据层按板聚合，侧栏逐板显示自己的条目数（r15 返工#1 B） */
export interface WhiteboardSummary extends Whiteboard {
  readonly itemCount: number;
}

export interface WhiteboardItem {
  readonly id: number;
  readonly boardId: number;
  readonly type: WhiteboardItemType;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly content: string;
  readonly color: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 归一化输入：所有字段 unknown，守卫失败即抛 ValidationError（api 映射 400） */
export interface WhiteboardItemProps {
  readonly x?: unknown;
  readonly y?: unknown;
  readonly w?: unknown;
  readonly h?: unknown;
  readonly content?: unknown;
  readonly color?: unknown;
}

export interface NormalizedWhiteboardItem {
  readonly type: WhiteboardItemType;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly content: string;
  readonly color: string;
}

export function isWhiteboardItemType(value: unknown): value is WhiteboardItemType {
  return typeof value === "string" && (WHITEBOARD_ITEM_TYPES as readonly string[]).includes(value);
}

export function assertValidWhiteboardTitle(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("白板标题不能为空");
  }
  if (value.length > MAX_WHITEBOARD_TITLE) {
    throw new ValidationError(`白板标题过长：最多 ${MAX_WHITEBOARD_TITLE} 字`);
  }
}

/** AI 建板主题守卫（mock 脚本化生成，零 token；主题是真输入不是摆设） */
export function assertValidWhiteboardTheme(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("AI 建板主题不能为空");
  }
  if (value.length > MAX_WHITEBOARD_THEME) {
    throw new ValidationError(`AI 建板主题过长：最多 ${MAX_WHITEBOARD_THEME} 字`);
  }
  if (value.includes("\u0000")) {
    throw new ValidationError("AI 建板主题含非法控制字符（NUL）");
  }
}

const WHITEBOARD_DEFAULT_SIZE: Readonly<Record<WhiteboardItemType, { w: number; h: number; color: string }>> = {
  note: { w: 180, h: 140, color: "#FEF3C7" },
  text: { w: 260, h: 90, color: "#DBEAFE" },
  shape: { w: 160, h: 120, color: "#D1FAE5" },
};

const WHITEBOARD_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function whiteboardNumber(value: unknown, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${name} 必须是有限数值`);
  }
  if (value < min || value > max) {
    throw new ValidationError(`${name} 越界：允许 ${min} ~ ${max}`);
  }
  return value;
}

/**
 * 白板条目唯一归一入口（r15）：类型白名单 + 坐标/尺寸数值与边界 + 内容上限/NUL + 颜色 hex。
 * 缺省尺寸与底色按 type 取 shared 常量；api/web 不得另写分支。
 */
export function normalizeWhiteboardItem(type: unknown, props: WhiteboardItemProps = {}): NormalizedWhiteboardItem {
  if (!isWhiteboardItemType(type)) {
    throw new ValidationError(`非法白板条目类型：${String(type)}`);
  }
  const defaults = WHITEBOARD_DEFAULT_SIZE[type];
  const x = whiteboardNumber(props.x, 0, WHITEBOARD_COORD_MIN, WHITEBOARD_COORD_MAX, "x");
  const y = whiteboardNumber(props.y, 0, WHITEBOARD_COORD_MIN, WHITEBOARD_COORD_MAX, "y");
  const w = whiteboardNumber(props.w, defaults.w, WHITEBOARD_SIZE_MIN, WHITEBOARD_SIZE_MAX, "w");
  const h = whiteboardNumber(props.h, defaults.h, WHITEBOARD_SIZE_MIN, WHITEBOARD_SIZE_MAX, "h");
  const content = props.content === undefined || props.content === null ? "" : props.content;
  if (typeof content !== "string") throw new ValidationError("条目内容必须是字符串");
  if (content.length > MAX_WHITEBOARD_CONTENT) {
    throw new ValidationError(`条目内容过长：最多 ${MAX_WHITEBOARD_CONTENT} 字`);
  }
  if (content.includes("\u0000")) throw new ValidationError("条目内容含非法控制字符（NUL）");
  const color = props.color === undefined || props.color === null || props.color === "" ? defaults.color : props.color;
  if (typeof color !== "string" || !WHITEBOARD_COLOR_RE.test(color)) {
    throw new ValidationError("条目颜色必须是 #RRGGBB 格式");
  }
  return { type, x, y, w, h, content, color };
}

/** 矩形相交判定（贴边不算重叠；唯一口径） */
export interface WhiteboardRect {
  readonly id?: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function whiteboardItemsOverlap(a: WhiteboardRect, b: WhiteboardRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export interface CollisionResolveResult<T extends WhiteboardRect> {
  readonly items: T[];
  readonly movedIds: number[];
}

/**
 * 重叠避让唯一规则（r15）：按 (y, x, 原序) 依次落位，遇重叠则下移到冲突项底部 + WHITEBOARD_COLLISION_GAP，
 * 直到无重叠；返回原序数组（保留原对象其它字段）与被移动 id 清单。幂等：对已解算结果再跑一次零移动。
 */
export function collisionResolve<T extends WhiteboardRect>(items: readonly T[]): CollisionResolveResult<T> {
  const out: T[] = items.slice();
  const placed: WhiteboardRect[] = [];
  const movedIds: number[] = [];
  const order = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.y - b.item.y || a.item.x - b.item.x || a.index - b.index);
  for (const { item, index } of order) {
    let next: T = item;
    let guard = 0;
    while (guard < 1000) {
      const hit = placed.find((p) => whiteboardItemsOverlap(next, p));
      if (!hit) break;
      next = { ...next, y: hit.y + hit.h + WHITEBOARD_COLLISION_GAP };
      guard += 1;
    }
    if (guard >= 1000) throw new ValidationError("重叠避让次数超限（布局不可解）");
    placed.push(next);
    out[index] = next;
    if (next.y !== item.y) movedIds.push(item.id ?? index);
  }
  return { items: out, movedIds };
}

/** mock AI 建板草稿（带确定性草稿 id，落库时替换为真实自增 id） */
export interface AiWhiteboardDraft extends NormalizedWhiteboardItem {
  readonly id: number;
}

export interface AiWhiteboardPlan {
  readonly theme: string;
  readonly items: AiWhiteboardDraft[];
}

const AI_WHITEBOARD_COLORS = ["#FEF3C7", "#DBEAFE", "#D1FAE5", "#FCE7F3", "#EDE9FE"] as const;

/**
 * mock 建板（r15）：按主题脚本化生成 7 张便签（零 token / 零随机），3 列网格排布天然不重叠，
 * 并过一遍 shared `collisionResolve` 保证规则同源。换真实模型只换本函数一处注入。
 */
export function planAiWhiteboard(theme: string): AiWhiteboardPlan {
  assertValidWhiteboardTheme(theme);
  const bodies = [
    `主题：${theme} —— 本次要讨论的核心议题`,
    `目标：明确「${theme}」的交付范围与成功标准`,
    `受众：谁会用到「${theme}」，他们最在意什么`,
    `方案：实现「${theme}」的关键路径与取舍`,
    `资源：完成「${theme}」需要的人手与依赖`,
    `风险：「${theme}」推进中的阻塞点与备选方案`,
    `下一步：「${theme}」本周要落实的三个动作`,
  ];
  const drafts: AiWhiteboardDraft[] = bodies.map((content, i) => ({
    id: i + 1,
    type: "note" as const,
    x: 80 + (i % 3) * 220,
    y: 80 + Math.floor(i / 3) * 180,
    w: 180,
    h: 140,
    content,
    color: AI_WHITEBOARD_COLORS[i % AI_WHITEBOARD_COLORS.length]!,
  }));
  return { theme, items: collisionResolve(drafts).items };
}

const WHITEBOARD_TYPE_LABELS: Readonly<Record<WhiteboardItemType, string>> = {
  note: "便签",
  text: "文本",
  shape: "图形",
};

/** 白板 → Markdown：按 (y, x, id) 视觉顺序装配，坐标/尺寸/颜色/类型逐项呈现，内容逐字保留 */
export function buildWhiteboardMarkdown(title: string, items: readonly WhiteboardItem[]): string {
  const sorted = items.slice().sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id);
  const lines: string[] = [`# ${title}`, "", `> 导出自协流 XieFlow 白板 · 共 ${items.length} 个条目`, ""];
  for (const item of sorted) {
    lines.push(`## ${WHITEBOARD_TYPE_LABELS[item.type]} #${item.id}`);
    lines.push("");
    lines.push(`- 位置：(${item.x}, ${item.y}) · 尺寸：${item.w}×${item.h} · 颜色：${item.color || "默认"}`);
    lines.push("");
    lines.push(item.content.trim() === "" ? "（空条目）" : item.content);
    lines.push("");
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

/** 无限画布视口（平移 x/y 像素 + 缩放 scale） */
export interface WhiteboardViewport {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** 屏幕坐标 → 画布坐标：(screen - rect - pan) / scale（web 拖拽只调本函数，零数学分支） */
export function screenToCanvasPoint(
  screenX: number, screenY: number, rectLeft: number, rectTop: number, viewport: WhiteboardViewport,
): { x: number; y: number } {
  return { x: (screenX - rectLeft - viewport.x) / viewport.scale, y: (screenY - rectTop - viewport.y) / viewport.scale };
}

/** 画布坐标 → 屏幕坐标（上式的逆运算；拖拽落位用） */
export function canvasToScreenPoint(
  canvasX: number, canvasY: number, rectLeft: number, rectTop: number, viewport: WhiteboardViewport,
): { x: number; y: number } {
  return { x: canvasX * viewport.scale + rectLeft + viewport.x, y: canvasY * viewport.scale + rectTop + viewport.y };
}

/** 缩放钳制（非法值回落到 1） */
export function clampWhiteboardScale(scale: number): number {
  if (typeof scale !== "number" || !Number.isFinite(scale)) return 1;
  return Math.min(WHITEBOARD_MAX_SCALE, Math.max(WHITEBOARD_MIN_SCALE, scale));
}

// ---- r16（M8 起步）：审批状态机与流转契约（全集中 shared，api/web 零流转分支） ----

/** 审批五态（schema v12 approvals.status CHECK 同源；后三态为终态） */
export const APPROVAL_STATUSES = ["draft", "pending", "approved", "rejected", "withdrawn"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/**
 * 审批状态转移表（唯一口径）：draft→pending→approved/rejected/withdrawn。
 * 终态零出边；转交 delegate 不改状态、只换 assignee，因此 pending→pending 不在表内。
 */
export const APPROVAL_TRANSITIONS: Record<ApprovalStatus, readonly ApprovalStatus[]> = {
  draft: ["pending"],
  pending: ["approved", "rejected", "withdrawn"],
  approved: [],
  rejected: [],
  withdrawn: [],
};

export function canTransitionApproval(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return APPROVAL_TRANSITIONS[from].includes(to);
}

export function assertValidApprovalTransition(from: ApprovalStatus, to: ApprovalStatus): void {
  if (!canTransitionApproval(from, to)) {
    throw new ValidationError(`非法审批状态流转：${from} → ${to}`);
  }
}

export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return typeof value === "string" && (APPROVAL_STATUSES as readonly string[]).includes(value);
}

/** 审批动作集合（schema v12 approval_steps.action CHECK 同源） */
export const APPROVAL_ACTIONS = ["submit", "approve", "reject", "delegate", "withdraw"] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export function isApprovalAction(value: unknown): value is ApprovalAction {
  return typeof value === "string" && (APPROVAL_ACTIONS as readonly string[]).includes(value);
}

/** 审批类型集合（schema v12 approvals.type CHECK 同源） */
export const APPROVAL_TYPES = ["leave", "expense", "purchase", "other"] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export function isApprovalType(value: unknown): value is ApprovalType {
  return typeof value === "string" && (APPROVAL_TYPES as readonly string[]).includes(value);
}

/** 三视角：我的待办 / 我发起的 / 抄送我的 */
export const APPROVAL_VIEWS = ["todo", "initiated", "cc"] as const;
export type ApprovalView = (typeof APPROVAL_VIEWS)[number];

export function isApprovalView(value: unknown): value is ApprovalView {
  return typeof value === "string" && (APPROVAL_VIEWS as readonly string[]).includes(value);
}

export const APPROVAL_TYPE_LABELS: Readonly<Record<ApprovalType, string>> = {
  leave: "请假",
  expense: "报销",
  purchase: "采购",
  other: "其它",
};

export const APPROVAL_STATUS_LABELS: Readonly<Record<ApprovalStatus, string>> = {
  draft: "草稿",
  pending: "待审批",
  approved: "已通过",
  rejected: "已驳回",
  withdrawn: "已撤回",
};

export const APPROVAL_ACTION_LABELS: Readonly<Record<ApprovalAction, string>> = {
  submit: "提交",
  approve: "通过",
  reject: "驳回",
  delegate: "转交",
  withdraw: "撤回",
};

/** 时间线步骤展示口径（r16 U2-1）：每步的操作者角色语义与该步完成后的状态 */
export const APPROVAL_ACTION_ROLE_LABELS: Readonly<Record<ApprovalAction, string>> = {
  submit: "发起人",
  approve: "操作人",
  reject: "操作人",
  delegate: "接收人",
  withdraw: "发起人",
};
export const APPROVAL_ACTION_STATUS_AFTER: Readonly<Record<ApprovalAction, ApprovalStatus>> = {
  submit: "pending",
  approve: "approved",
  reject: "rejected",
  delegate: "pending",
  withdraw: "withdrawn",
};

export const MAX_APPROVAL_TITLE = 200;
export const MAX_APPROVAL_COMMENT = 1000;
export const MAX_APPROVAL_USER = 100;

export function assertValidApprovalTitle(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("审批标题不能为空");
  }
  if (value.length > MAX_APPROVAL_TITLE) {
    throw new ValidationError(`审批标题过长：最多 ${MAX_APPROVAL_TITLE} 字`);
  }
  if (value.includes("\u0000")) throw new ValidationError("审批标题含非法控制字符（NUL）");
}

export function assertValidApprovalType(value: unknown): asserts value is ApprovalType {
  if (!isApprovalType(value)) {
    throw new ValidationError(`非法审批类型：${String(value)}`);
  }
}

export function assertValidApprovalUser(value: unknown, label = "审批人"): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${label}不能为空`);
  }
  if (value.length > MAX_APPROVAL_USER) {
    throw new ValidationError(`${label}过长：最多 ${MAX_APPROVAL_USER} 字`);
  }
  if (value.includes("\u0000")) throw new ValidationError(`${label}含非法控制字符（NUL）`);
}

export function assertValidApprovalComment(value: unknown): asserts value is string {
  if (value === undefined || value === null) return;
  if (typeof value !== "string") throw new ValidationError("审批意见必须是字符串");
  if (value.length > MAX_APPROVAL_COMMENT) {
    throw new ValidationError(`审批意见过长：最多 ${MAX_APPROVAL_COMMENT} 字`);
  }
  if (value.includes("\u0000")) throw new ValidationError("审批意见含非法控制字符（NUL）");
}

/** 审批领域对象（schema v12 三表 camelCase 映射） */
export interface Approval {
  readonly id: number;
  readonly title: string;
  readonly type: ApprovalType;
  readonly applicantId: string;
  readonly status: ApprovalStatus;
  readonly currentAssignee: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** r24 可选成员关联；老数据为 null，纯自由文本路径不受影响 */
  readonly applicantMemberId?: number | null;
}

export interface ApprovalStep {
  readonly id: number;
  readonly approvalId: number;
  readonly order: number;
  readonly assignee: string;
  readonly action: ApprovalAction;
  readonly comment: string;
  readonly actedAt: string;
  readonly assigneeMemberId?: number | null;
  /** r25 操作人成员关联；老步骤为 null，纯自由文本路径不受影响 */
  readonly actorMemberId?: number | null;
}

export interface ApprovalCc {
  readonly id: number;
  readonly approvalId: number;
  readonly ccUser: string;
  readonly createdAt: string;
  readonly ccMemberId?: number | null;
}

/** 动作上下文：api/db/web 共用，流转判定只读这几个字段 */
export interface ApprovalActionContext {
  readonly status: ApprovalStatus;
  readonly applicantId: string;
  readonly currentAssignee: string;
  readonly actor: string;
  readonly targetAssignee?: unknown;
}

/** 动作计划：状态、assignee、步骤归属全由 shared 算出，db 只负责按计划落库 */
export interface ApprovalActionPlan {
  readonly action: ApprovalAction;
  readonly nextStatus: ApprovalStatus;
  readonly nextAssignee: string;
  readonly stepAssignee: string;
}

/**
 * 审批动作唯一决策入口（r16）：先守卫角色与状态，再产出动作计划。
 * approve/reject/delegate 只允许当前 assignee；submit/withdraw 只允许发起人；
 * delegate 只换 assignee（nextStatus === 原状态），不进入转移表。
 */
export function planApprovalAction(action: unknown, ctx: ApprovalActionContext): ApprovalActionPlan {
  if (!isApprovalAction(action)) {
    throw new ValidationError(`非法审批动作：${String(action)}`);
  }
  assertValidApprovalUser(ctx.actor, "操作人");
  if (!isApprovalStatus(ctx.status)) throw new ValidationError(`非法审批状态：${String(ctx.status)}`);

  if (action === "submit") {
    if (ctx.status !== "draft") throw new ValidationError(`提交只允许草稿态（当前 ${ctx.status}）`);
    assertValidApprovalUser(ctx.applicantId, "发起人");
    if (ctx.actor !== ctx.applicantId) throw new ValidationError("只有发起人可以提交审批");
    assertValidApprovalTransition(ctx.status, "pending");
    return { action, nextStatus: "pending", nextAssignee: ctx.currentAssignee, stepAssignee: ctx.actor };
  }
  if (action === "approve" || action === "reject") {
    if (ctx.status !== "pending") throw new ValidationError(`${APPROVAL_ACTION_LABELS[action]}只允许待审态（当前 ${ctx.status}）`);
    if (ctx.actor !== ctx.currentAssignee) throw new ValidationError("非当前审批人不能操作");
    const nextStatus: ApprovalStatus = action === "approve" ? "approved" : "rejected";
    assertValidApprovalTransition(ctx.status, nextStatus);
    return { action, nextStatus, nextAssignee: ctx.currentAssignee, stepAssignee: ctx.actor };
  }
  if (action === "withdraw") {
    if (ctx.status !== "pending") throw new ValidationError(`撤回只允许待审态（当前 ${ctx.status}）`);
    assertValidApprovalUser(ctx.applicantId, "发起人");
    if (ctx.actor !== ctx.applicantId) throw new ValidationError("只有发起人可以撤回审批");
    assertValidApprovalTransition(ctx.status, "withdrawn");
    return { action, nextStatus: "withdrawn", nextAssignee: ctx.currentAssignee, stepAssignee: ctx.actor };
  }
  // delegate：不改状态，只换 assignee；步骤记新 assignee，便于时间线呈现转交结果
  if (ctx.status !== "pending") throw new ValidationError(`转交只允许待审态（当前 ${ctx.status}）`);
  if (ctx.actor !== ctx.currentAssignee) throw new ValidationError("非当前审批人不能转交");
  assertValidApprovalUser(ctx.targetAssignee, "转交目标");
  if (ctx.targetAssignee === ctx.currentAssignee) throw new ValidationError("转交目标不能与当前审批人相同");
  return { action, nextStatus: ctx.status, nextAssignee: ctx.targetAssignee, stepAssignee: ctx.targetAssignee };
}

export function assertValidApprovalAction(action: unknown, ctx: ApprovalActionContext): asserts action is ApprovalAction {
  planApprovalAction(action, ctx);
}

/** UI 按钮可见性唯一口径：逐个试算动作计划，能算出的即当前身份可执行 */
export function availableApprovalActions(ctx: ApprovalActionContext): ApprovalAction[] {
  return APPROVAL_ACTIONS.filter((action) => {
    try {
      planApprovalAction(action, {
        ...ctx,
        targetAssignee: action === "delegate" ? "__probe_target__" : ctx.targetAssignee,
      });
      return true;
    } catch {
      return false;
    }
  });
}

/** 三视角过滤唯一口径（db 层先装配 cc 名单，再交给本函数；web 不另写分支） */
export interface ApprovalViewContext {
  readonly approvals: readonly Approval[];
  readonly ccByApproval: Readonly<Record<number, readonly string[]>>;
  readonly view: ApprovalView;
  readonly actor: string;
}

export function selectApprovalsForView(ctx: ApprovalViewContext): Approval[] {
  assertValidApprovalUser(ctx.actor, "当前用户");
  if (!isApprovalView(ctx.view)) throw new ValidationError(`非法审批视角：${String(ctx.view)}`);
  return ctx.approvals.filter((a) => {
    if (ctx.view === "todo") return a.status === "pending" && a.currentAssignee === ctx.actor;
    if (ctx.view === "initiated") return a.applicantId === ctx.actor;
    return (ctx.ccByApproval[a.id] ?? []).includes(ctx.actor);
  });
}

// ---- r17（M8 收官）：物资台账与单位任务流转（全集中 shared，api/web 零规则分支） ----

/** 物资分类白名单（schema v13 assets.category CHECK 同源） */
export const ASSET_CATEGORIES = ["office", "equipment", "material", "furniture", "other"] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export const ASSET_CATEGORY_LABELS: Readonly<Record<AssetCategory, string>> = {
  office: "办公用品", equipment: "设备器材", material: "物料", furniture: "家具", other: "其它",
};

/** 出入库流水类型（schema v13 asset_transactions.type CHECK 同源） */
export const ASSET_TX_TYPES = ["in", "out", "transfer"] as const;
export type AssetTxType = (typeof ASSET_TX_TYPES)[number];
export const ASSET_TX_TYPE_LABELS: Readonly<Record<AssetTxType, string>> = {
  in: "入库", out: "出库", transfer: "转移",
};

/** 单位任务状态（schema v13 unit_tasks.status CHECK 同源） */
export const UNIT_TASK_STATUSES = ["pending", "in_progress", "blocked", "done", "cancelled"] as const;
export type UnitTaskStatus = (typeof UNIT_TASK_STATUSES)[number];
export const UNIT_TASK_STATUS_LABELS: Readonly<Record<UnitTaskStatus, string>> = {
  pending: "待启动", in_progress: "进行中", blocked: "受阻", done: "已完成", cancelled: "已取消",
};

/**
 * 单位任务状态转移表（唯一口径）：
 * pending→in_progress/blocked/cancelled；in_progress→done/blocked/cancelled；
 * blocked→in_progress/cancelled；done/cancelled 终态零出边。
 */
export const UNIT_TASK_TRANSITIONS: Record<UnitTaskStatus, readonly UnitTaskStatus[]> = {
  pending: ["in_progress", "blocked", "cancelled"],
  in_progress: ["done", "blocked", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  done: [],
  cancelled: [],
};

export function canTransitionUnitTask(from: UnitTaskStatus, to: UnitTaskStatus): boolean {
  return UNIT_TASK_TRANSITIONS[from].includes(to);
}

export function assertValidUnitTaskTransition(from: UnitTaskStatus, to: UnitTaskStatus): void {
  if (!canTransitionUnitTask(from, to)) {
    throw new ValidationError(`非法单位任务状态流转：${from} → ${to}`);
  }
}

export function isUnitTaskStatus(value: unknown): value is UnitTaskStatus {
  return typeof value === "string" && (UNIT_TASK_STATUSES as readonly string[]).includes(value);
}

export function isAssetCategory(value: unknown): value is AssetCategory {
  return typeof value === "string" && (ASSET_CATEGORIES as readonly string[]).includes(value);
}

export function isAssetTxType(value: unknown): value is AssetTxType {
  return typeof value === "string" && (ASSET_TX_TYPES as readonly string[]).includes(value);
}

export const MAX_ASSET_NAME = 200;
export const MAX_ASSET_TEXT = 200;
export const MAX_ASSET_OPERATOR = 100;
export const MAX_UNIT_TASK_TITLE = 200;
export const MAX_UNIT_TASK_UNIT = 100;

function assertNonEmptyText(value: unknown, label: string, max: number): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") throw new ValidationError(`${label}不能为空`);
  if (value.length > max) throw new ValidationError(`${label}过长：最多 ${max} 字`);
  if (value.includes("\u0000")) throw new ValidationError(`${label}含非法控制字符（NUL）`);
}

export function assertValidAssetName(value: unknown): asserts value is string {
  assertNonEmptyText(value, "物资名称", MAX_ASSET_NAME);
}
export function assertValidAssetCategory(value: unknown): asserts value is AssetCategory {
  if (!isAssetCategory(value)) throw new ValidationError(`非法物资分类：${String(value)}`);
}
export function assertValidAssetText(value: unknown, label: string): asserts value is string {
  assertNonEmptyText(value, label, MAX_ASSET_TEXT);
}
export function assertValidQuantity(value: unknown, label = "数量"): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ValidationError(`${label}必须是有限数字`);
  if (!Number.isInteger(value)) throw new ValidationError(`${label}必须是整数`);
  if (value <= 0) throw new ValidationError(`${label}必须大于 0`);
}
export function assertValidAssetTxType(value: unknown): asserts value is AssetTxType {
  if (!isAssetTxType(value)) throw new ValidationError(`非法流水类型：${String(value)}`);
}
export function assertValidAssetOperator(value: unknown): asserts value is string {
  assertNonEmptyText(value, "操作人", MAX_ASSET_OPERATOR);
}
export function assertValidUnitTaskTitle(value: unknown): asserts value is string {
  assertNonEmptyText(value, "任务标题", MAX_UNIT_TASK_TITLE);
}
export function assertValidUnit(value: unknown, label = "单位"): asserts value is string {
  assertNonEmptyText(value, label, MAX_UNIT_TASK_UNIT);
}
/** 物资领域对象（schema v13 assets 表 camelCase 映射） */
export interface Asset {
  readonly id: number;
  readonly name: string;
  readonly category: AssetCategory;
  readonly quantity: number;
  readonly unit: string;
  readonly location: string;
  readonly custodian: string;
  readonly createdAt: string;
  /** r24 可选通讯录保管员；老数据为 null */
  readonly custodianMemberId?: number | null;
}

/** 出入库流水领域对象（schema v13 asset_transactions 表 camelCase 映射） */
export interface AssetTransaction {
  readonly id: number;
  readonly assetId: number;
  readonly type: AssetTxType;
  readonly quantity: number;
  readonly from: string;
  readonly to: string;
  readonly operator: string;
  readonly createdAt: string;
}

/** 单位任务领域对象（schema v13 unit_tasks 表 camelCase 映射） */
export interface UnitTask {
  readonly id: number;
  readonly title: string;
  readonly assigneeUnit: string;
  readonly status: UnitTaskStatus;
  readonly dueDate: string | null;
  readonly parentId: number | null;
}

/** 任务树节点：任务本体 + 子节点（层级装配唯一产物）；children 在装配过程中可排序 */
export interface UnitTaskTreeNode extends UnitTask {
  children: UnitTaskTreeNode[];
}

/** 流水输入（不含 id/assetId/createdAt，由 db 装配） */
export interface AssetTxInput {
  readonly type: unknown;
  readonly quantity: unknown;
  readonly from?: unknown;
  readonly to?: unknown;
  readonly operator: unknown;
}

/**
 * 库存增减唯一规则（纯函数）：入库加、出库减（负库存拒绝）、转移不改总量只换位置。
 * 转移要求来源位置与当前库存位置一致，防止凭空调拨；入/出库的 from/to 只作台账记录。
 * 返回新物资对象（不改入参），db 层按返回值单事务写回。
 */
export function applyAssetTransaction(asset: Asset, tx: AssetTxInput): Asset {
  assertValidAssetTxType(tx.type);
  assertValidQuantity(tx.quantity, "流水数量");
  assertValidAssetOperator(tx.operator);
  const qty = tx.quantity as number;
  if (tx.type === "in") {
    const to = tx.to === undefined || tx.to === null ? "" : tx.to;
    if (typeof to !== "string") throw new ValidationError("入库目标位置必须是字符串");
    assertValidAssetText(to, "入库目标位置");
    return { ...asset, quantity: asset.quantity + qty, location: to };
  }
  if (tx.type === "out") {
    const next = asset.quantity - qty;
    if (next < 0) {
      throw new ValidationError(`库存不足：${asset.name} 当前 ${asset.quantity} ${asset.unit}，出库 ${qty}`);
    }
    return { ...asset, quantity: next };
  }
  // transfer：不改数量，位置从 from 换到 to；来源必须与当前位置一致
  if (tx.from === undefined || tx.from === null || tx.to === undefined || tx.to === null) {
    throw new ValidationError("转移必须提供来源与目标位置");
  }
  if (typeof tx.from !== "string" || typeof tx.to !== "string") {
    throw new ValidationError("转移位置必须是字符串");
  }
  assertValidAssetText(tx.from, "来源位置");
  assertValidAssetText(tx.to, "目标位置");
  if (tx.from !== asset.location) {
    throw new ValidationError(`转移来源位置不匹配：当前 ${asset.location}，来源 ${tx.from}`);
  }
  return { ...asset, location: tx.to };
}

/**
 * 任务树装配唯一规则（纯函数）：parent_id 可空，指向不存在的父节点按根节点处理；
 * 环路（A→B→A）抛错防止无限递归；同级按 id 升序保证确定性。
 */
export function buildTaskTree(tasks: readonly UnitTask[]): UnitTaskTreeNode[] {
  const byId = new Map<number, UnitTaskTreeNode>();
  for (const t of tasks) byId.set(t.id, { ...t, children: [] });
  const roots: UnitTaskTreeNode[] = [];
  for (const t of tasks) {
    const node = byId.get(t.id)!;
    if (t.parentId === null || !byId.has(t.parentId)) {
      roots.push(node);
      continue;
    }
    // 环路检测：沿 parent 链向上走，遇到回到自身即报错
    const seen = new Set<number>([t.id]);
    let cursor: number | null = t.parentId;
    while (cursor !== null) {
      if (seen.has(cursor)) throw new ValidationError(`任务树存在环路：任务 ${t.id}`);
      seen.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    byId.get(t.parentId)!.children.push(node);
  }
  const sortNodes = (nodes: UnitTaskTreeNode[]): UnitTaskTreeNode[] => {
    nodes.sort((a, b) => a.id - b.id);
    for (const n of nodes) n.children = sortNodes(n.children);
    return nodes;
  };
  return sortNodes(roots);
}

// ---- r19：多端同步与冲突处理（规则唯一口径，api / db / web 零算法分支） ----

/** 变更操作枚举（唯一清单） */
export const CHANGE_OPERATIONS = ["create", "update", "delete"] as const;
export type ChangeOperation = (typeof CHANGE_OPERATIONS)[number];

/** 增量拉取默认 / 最大条数 */
export const DEFAULT_SYNC_LIMIT = 50;
export const MAX_SYNC_LIMIT = 200;

/** 变更日志条目（change_log 表 camelCase 契约） */
export interface ChangeRecord {
  readonly id: number;
  readonly entityType: string;
  readonly entityId: string;
  readonly operation: ChangeOperation;
  readonly payload: Record<string, unknown>;
  readonly userId: number | null;
  readonly createdAt: string;
  readonly version: number;
}

/** 实体当前版本（entity_versions 表 camelCase 契约） */
export interface EntityVersion {
  readonly entityType: string;
  readonly entityId: string;
  readonly version: number;
  readonly updatedAt: string;
}

/** 三方比较结果：conflicts 为真冲突字段；divergedFields 为所有分歧字段 */
export interface SyncConflictResult {
  readonly conflicts: readonly string[];
  readonly divergedFields: readonly string[];
  readonly merged: Record<string, unknown>;
  readonly hasConflict: boolean;
}

export function isChangeOperation(value: unknown): value is ChangeOperation {
  return typeof value === "string" && (CHANGE_OPERATIONS as readonly string[]).includes(value);
}

export function assertValidEntityType(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(value)) {
    throw new ValidationError(`非法实体类型：${String(value)}（须小写字母开头的 1-64 位标识）`);
  }
}

export function assertValidEntityId(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "" || value.length > 64) {
    throw new ValidationError(`非法实体 id：${String(value)}（须 1-64 位非空串）`);
  }
}

export function assertValidChangeOperation(value: unknown): asserts value is ChangeOperation {
  if (!isChangeOperation(value)) {
    throw new ValidationError(`非法变更操作：${String(value)}（允许 ${CHANGE_OPERATIONS.join("/")}）`);
  }
}

export function assertValidVersion(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1_000_000_000) {
    throw new ValidationError(`非法版本号：${String(value)}（须 0-1e9 的整数）`);
  }
}

/** since 查询参数归一：缺省为 0，正整数字符串转数值，非法一律抛错 */
export function normalizeSince(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(raw) || raw < 0) throw new ValidationError(`非法 since：${String(value)}`);
  return raw;
}

/** limit 查询参数归一：缺省 DEFAULT_SYNC_LIMIT，0→1，超过 MAX_SYNC_LIMIT 收敛 */
export function normalizeLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return DEFAULT_SYNC_LIMIT;
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(raw) || raw < 0) throw new ValidationError(`非法 limit：${String(value)}`);
  if (raw === 0) return 1;
  return Math.min(raw, MAX_SYNC_LIMIT);
}

/** 唯一版本递增入口：先守卫再 +1，避免坏值静默产出版号 */
export function nextVersion(current: unknown): number {
  assertValidVersion(current);
  return (current as number) + 1;
}

/** 稳定深度比较：键顺序无关，用于三方字段值比较（不修改入参） */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return Number.isNaN(a) && Number.isNaN(b) ? true : false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!valuesEqual(a[i], b[i])) return false;
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).sort();
  const bk = Object.keys(bo).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    if (!valuesEqual(ao[ak[i]!], bo[bk[i]!])) return false;
  }
  return true;
}

function hasKey(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * 三方比较唯一规则（base = 共同祖先快照，local / remote = 两端当前快照）：
 * - 两端都改了同一字段且值不同 → conflicts（真冲突，默认取远端，用户可改选）；
 * - 仅一端改 → 取该端值；两端都未改 → 取 base；
 * - 任一端删除字段（键缺失）视为该字段被删除，不被另一端未改的旧值复活；
 * - divergedFields = 相对 base 任一端发生变化的全部字段（排序确定，供 UI 展示）。
 * 本函数为纯函数，绝不修改三个入参。
 */
export function detectConflict(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): SyncConflictResult {
  const keys = Array.from(new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])).sort();
  const conflicts: string[] = [];
  const diverged: string[] = [];
  const merged: Record<string, unknown> = {};
  for (const key of keys) {
    const inBase = hasKey(base, key) ? base[key] : undefined;
    const inLocal = hasKey(local, key) ? local[key] : undefined;
    const inRemote = hasKey(remote, key) ? remote[key] : undefined;
    const baseHas = hasKey(base, key);
    const localHas = hasKey(local, key);
    const remoteHas = hasKey(remote, key);
    const localChanged = localHas !== baseHas || !valuesEqual(inLocal, inBase);
    const remoteChanged = remoteHas !== baseHas || !valuesEqual(inRemote, inBase);
    if (localChanged || remoteChanged) diverged.push(key);
    if (localChanged && remoteChanged && !valuesEqual(inLocal, inRemote)) {
      conflicts.push(key);
      if (remoteHas) merged[key] = inRemote;
      continue;
    }
    if (localChanged) {
      if (localHas) merged[key] = inLocal;
      continue;
    }
    if (remoteChanged) {
      if (remoteHas) merged[key] = inRemote;
      continue;
    }
    if (baseHas) merged[key] = inBase;
  }
  return { conflicts, divergedFields: diverged, merged, hasConflict: conflicts.length > 0 };
}

/** 乐观锁冲突：api 统一映射 409，载荷带冲突字段与两端快照供弹窗选边 */
export class SyncConflictError extends Error {
  constructor(
    message: string,
    readonly conflicts: readonly string[],
    readonly divergedFields: readonly string[],
    readonly currentVersion: number,
    readonly base: Record<string, unknown>,
    readonly local: Record<string, unknown>,
    readonly remote: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SyncConflictError";
  }
}

/** 增量合并结果：applied 去重后按 id 升序；conflicts 为同实体同版本不同载荷的实体键 */
export interface ChangeSetMergeResult {
  readonly applied: ChangeRecord[];
  readonly duplicates: number;
  readonly conflicts: readonly string[];
}

/**
 * 增量合并唯一规则：按变更 id 去重（重放幂等），两端同实体同版本不同载荷记实体级冲突标记。
 * 纯函数，不修改任何入参数组或条目。
 */
export function applyChangeSet(
  local: readonly ChangeRecord[],
  remote: readonly ChangeRecord[],
): ChangeSetMergeResult {
  const byId = new Map<number, ChangeRecord>();
  let duplicates = 0;
  for (const c of local) byId.set(c.id, c);
  for (const c of remote) {
    if (byId.has(c.id)) {
      duplicates++;
      continue;
    }
    byId.set(c.id, c);
  }
  const applied = [...byId.values()].sort((a, b) => a.id - b.id);
  const latestByEntity = new Map<string, ChangeRecord>();
  const conflictEntities = new Set<string>();
  for (const c of applied) {
    const key = `${c.entityType}:${c.entityId}`;
    const prev = latestByEntity.get(key);
    if (prev && prev.version === c.version && !valuesEqual(prev.payload, c.payload)) {
      conflictEntities.add(key);
    }
    if (!prev || c.version >= prev.version) latestByEntity.set(key, c);
  }
  return { applied, duplicates, conflicts: [...conflictEntities].sort() };
}

// ---- r20（M10 起步）：离线队列与 PWA（规则唯一口径，api / web 零算法分支） ----

/** 队列在 localStorage 的键（浏览器与测试内存库共用同一接口） */
export const OFFLINE_QUEUE_KEY = "xieflow.offline.queue";
/** 队列容量上限：超出丢弃最早条目，避免无限膨胀 */
export const OFFLINE_QUEUE_MAX = 100;
/** 服务端按序重放端点（客户端「立即同步」唯一入口） */
export const OFFLINE_REPLAY_PATH = "/api/offline/replay";
/** 可重放的 HTTP 方法白名单（GET 只读不入队） */
export const OFFLINE_REPLAY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type OfflineReplayMethod = (typeof OFFLINE_REPLAY_METHODS)[number];
/** 离线入队的语义状态：202 Accepted（不伪装 200 成功落库） */
export const OFFLINE_QUEUED_STATUS = 202;
/** 离线入队响应标记头：调用方可据此区分「已入队」与「已落库」 */
export const OFFLINE_HEADER = "x-xieflow-offline";
/** 队列变化 / 连接状态变化的广播事件（顶栏徽标与圆点监听） */
export const OFFLINE_QUEUE_EVENT = "xieflow:offline-queue-changed";
export const OFFLINE_CONNECTION_EVENT = "xieflow:connection-changed";
/** SW 静态缓存名带轮次：升级即换名，旧缓存由 activate 清理 */
export const PWA_CACHE_NAME = "xieflow-static-v20";

/** 队列条目：一条被离线拦截的业务 API 写请求 */
export interface OfflineQueueItem {
  readonly id: string;
  readonly method: OfflineReplayMethod;
  readonly path: string;
  readonly body: Record<string, unknown> | null;
  readonly createdAt: string;
}

/** 最小 Storage 接口：window.localStorage 与测试内存库都满足 */
export interface OfflineStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** 离线语义响应描述（web 层据此构造真正的 Response，规则仍唯一在 shared） */
export interface OfflineQueuedResponseSpec {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: {
    readonly offline: boolean;
    readonly queued: boolean;
    readonly id: string;
    readonly path: string;
    readonly method: OfflineReplayMethod;
    readonly message: string;
  };
}

export function isOfflineMethod(value: unknown): value is OfflineReplayMethod {
  return typeof value === "string" && (OFFLINE_REPLAY_METHODS as readonly string[]).includes(value);
}

/**
 * 路径白名单唯一口径：只接受本应用 /api 相对路径；拒绝外部绝对 URL、协议相对地址、
 * 认证入口（离线登录无意义）与重放端点自身（防递归）。查询串允许。
 */
export function offlineQueuePathAllowed(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) return false;
  if (!value.startsWith("/api/")) return false;
  if (value.includes("//") || value.includes("\\") || /\s/.test(value)) return false;
  if (value === OFFLINE_REPLAY_PATH || value.startsWith(`${OFFLINE_REPLAY_PATH}?`)) return false;
  if (value.startsWith("/api/auth/") || value === "/api/health") return false;
  return true;
}

/** 队列条目的唯一归一 + 校验入口（入队 / 重放 / HTTP 端点共用同一规则） */
export function normalizeOfflineQueueItem(value: unknown): OfflineQueueItem {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("非法离线队列条目：须为对象");
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || !/^[A-Za-z0-9_.:-]{1,64}$/.test(raw.id)) {
    throw new ValidationError(`非法队列条目 id：${String(raw.id)}`);
  }
  if (!isOfflineMethod(raw.method)) {
    throw new ValidationError(`非法队列条目方法：${String(raw.method)}`);
  }
  if (!offlineQueuePathAllowed(raw.path)) {
    throw new ValidationError(`非法队列条目路径：${String(raw.path)}`);
  }
  if (typeof raw.createdAt !== "string" || raw.createdAt.length === 0 || Number.isNaN(Date.parse(raw.createdAt))) {
    throw new ValidationError(`非法队列条目时间戳：${String(raw.createdAt)}`);
  }
  let body: Record<string, unknown> | null = null;
  if (raw.body !== undefined && raw.body !== null) {
    let parsed: unknown = raw.body;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        throw new ValidationError("非法队列条目载荷：JSON 解析失败");
      }
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ValidationError("非法队列条目载荷：须为对象");
    }
    body = { ...(parsed as Record<string, unknown>) };
  }
  return { id: raw.id, method: raw.method, path: raw.path, body, createdAt: raw.createdAt };
}

export function assertValidOfflineQueueItem(value: unknown): asserts value is OfflineQueueItem {
  normalizeOfflineQueueItem(value);
}

/** 整批重放请求校验：一条非法全批拒绝（零半态，绝不放行半批） */
export function assertValidOfflineReplayRequest(value: unknown): asserts value is { items: readonly OfflineQueueItem[] } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("非法重放请求：须为对象");
  }
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.items)) throw new ValidationError("非法重放请求：items 须为数组");
  if (raw.items.length > OFFLINE_QUEUE_MAX) {
    throw new ValidationError(`非法重放请求：一次最多重放 ${OFFLINE_QUEUE_MAX} 条`);
  }
  for (const item of raw.items) normalizeOfflineQueueItem(item);
}

/** 是否应把此次请求离线入队：离线 + 写方法 + 本应用白名单路径，三者同时成立 */
export function shouldQueueOffline(method: string, path: string, offline: boolean): boolean {
  if (!offline || !isOfflineMethod(method) || method === "GET") return false;
  return offlineQueuePathAllowed(path);
}

/** 读取队列：坏数据条目直接丢弃（不让一条坏 JSON 卡死整条队列），其余按持久化顺序返回 */
export function loadOfflineQueue(storage: OfflineStorage): OfflineQueueItem[] {
  let text: string | null = null;
  try {
    text = storage.getItem(OFFLINE_QUEUE_KEY);
  } catch {
    return [];
  }
  if (!text) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const items: OfflineQueueItem[] = [];
  for (const raw of parsed) {
    try {
      items.push(normalizeOfflineQueueItem(raw));
    } catch {
      /* 丢弃单条坏条目，保证队列可用 */
    }
  }
  return items;
}

export function saveOfflineQueue(storage: OfflineStorage, items: readonly OfflineQueueItem[]): void {
  storage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
}

/** 入队：未给 id / createdAt 时自动生成；超限丢最早条目 */
export function enqueueOffline(
  storage: OfflineStorage,
  input: { id?: string; method: OfflineReplayMethod; path: string; body?: unknown; createdAt?: string },
): OfflineQueueItem {
  const item = normalizeOfflineQueueItem({
    id: input.id ?? `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    method: input.method,
    path: input.path,
    body: input.body ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
  const items = loadOfflineQueue(storage);
  items.push(item);
  if (items.length > OFFLINE_QUEUE_MAX) items.splice(0, items.length - OFFLINE_QUEUE_MAX);
  saveOfflineQueue(storage, items);
  return item;
}

/** 出队：按 id 精确移除，重复出队返回 null（幂等） */
export function dequeueOffline(storage: OfflineStorage, id: string): OfflineQueueItem | null {
  const items = loadOfflineQueue(storage);
  const index = items.findIndex((i) => i.id === id);
  if (index < 0) return null;
  const [removed] = items.splice(index, 1);
  saveOfflineQueue(storage, items);
  return removed ?? null;
}

export function peekOfflineQueue(storage: OfflineStorage): OfflineQueueItem[] {
  return loadOfflineQueue(storage);
}

export function clearOfflineQueue(storage: OfflineStorage): void {
  try {
    storage.removeItem?.(OFFLINE_QUEUE_KEY);
  } catch {
    /* ignore */
  }
  saveOfflineQueue(storage, []);
}

/**
 * 重放计划唯一口径：先整批校验（零半态），再按 createdAt 升序、同刻按 id 排序，
 * 返回副本（不改入参）。api 端点与 web「立即同步」共用本函数，顺序不会两处不一致。
 */
export function planOfflineReplay(items: readonly OfflineQueueItem[]): OfflineQueueItem[] {
  assertValidOfflineReplayRequest({ items });
  return [...items].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** 离线入队的语义响应：web 层用这些字段构造真 Response，状态/文案规则只在 shared */
export function buildOfflineQueuedResponse(item: OfflineQueueItem): OfflineQueuedResponseSpec {
  return {
    status: OFFLINE_QUEUED_STATUS,
    headers: {
      "content-type": "application/json; charset=utf-8",
      [OFFLINE_HEADER]: "queued",
      "x-xieflow-queue-id": item.id,
    },
    body: {
      offline: true,
      queued: true,
      id: item.id,
      path: item.path,
      method: item.method,
      message: "当前离线：操作已存入待同步队列，恢复网络后点「立即同步」自动重发。",
    },
  };
}

// r22: 移动底栏「更多」入口的唯一显隐条件。窄屏由 CSS 断点控制，这里只负责
// 菜单开合语义：展开态隐藏「更多」（全部 tab 已在网格里），收起态显示。
// 变异红相目标：把 return !navOpen 改成 return false → e2e seam 断言变红。
export function shouldShowTabsMore(navOpen: boolean): boolean {
  return !navOpen;
}

