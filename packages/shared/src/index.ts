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
export const SCHEMA_VERSION: number = 5;


/** 迁移脚本类型：user_version 从 from 升到 to */
export interface Migration {
  version: number;
  name: string;
  up: string[]; // 按序执行的 SQL
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
  sortFieldId?: number | null;
  sortDirection?: "asc" | "desc";
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
 */
export function queryRecords(
  records: readonly TableRecord[],
  fields: readonly TableField[],
  spec: RecordQuerySpec = {},
): RecordQueryResult {
  const byId = new Map(fields.map((f) => [f.id, f]));
  let list: TableRecord[] = [...records];
  if (spec.filterFieldId !== undefined && spec.filterFieldId !== null) {
    const field = byId.get(spec.filterFieldId);
    if (!field) {
      throw new ValidationError(`筛选字段不存在：${spec.filterFieldId}`);
    }
    const filterValue = coerceFieldValue(field.type, spec.filterValue ?? null, field.options);
    const check = validateFieldValue(field.type, filterValue, field.options);
    if (!check.valid) {
      throw new ValidationError(`筛选值类型不符：${check.error ?? "取值非法"}`);
    }
    list = list.filter((r) =>
      matchesFieldValue(field.type, r.data[String(field.id)], filterValue, field.options),
    );
  }
  if (spec.sortFieldId !== undefined && spec.sortFieldId !== null) {
    const field = byId.get(spec.sortFieldId);
    if (!field) {
      throw new ValidationError(`排序字段不存在：${spec.sortFieldId}`);
    }
    list = sortRecordsByField(list, field, spec.sortDirection ?? "asc");
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
