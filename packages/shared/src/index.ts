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

/** 数据库 schema 版本号，每轮迁移必须 +1（宪法：禁止手改库文件） */
export const SCHEMA_VERSION: number = 2;

/** 迁移脚本类型：user_version 从 from 升到 to */
export interface Migration {
  version: number;
  name: string;
  up: string[]; // 按序执行的 SQL
}
