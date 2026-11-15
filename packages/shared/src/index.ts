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
export const SCHEMA_VERSION: number = 4;

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
