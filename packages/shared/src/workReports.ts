// 协流 XieFlow — shared/workReports.ts：日报 / 周报自动生成唯一口径（r36 · M10 后功能补强）
// 时间窗过滤 / 六段装配 / 打印 HTML / 计数摘要 / 保存守卫全部是本文件的纯函数；
// api / web 零算法分支，只装配 shared 结果并映射 4xx。
// 规则：完成按 updatedAt（完成时间）入窗；新建/进行中按 createdAt||updatedAt 入窗；
// 阻塞项由 r34 依赖图回带的 blockers 判定（当前未完成的前置），且同样按时间窗过滤。
// 零新依赖、零 token（模板化汇总，不接任何 LLM）、不写业务数据。
import {
  ValidationError,
  assertValidDocumentTitle,
  isIsoDate,
  localDateStr,
  MAX_MARKDOWN_LENGTH,
} from "./index.js";

export const WORK_REPORT_TYPES = ["daily", "weekly"] as const;
export type WorkReportType = (typeof WORK_REPORT_TYPES)[number];

export const WORK_REPORT_LABELS: Readonly<Record<WorkReportType, string>> = {
  daily: "日报",
  weekly: "周报",
};

export function isWorkReportType(value: unknown): value is WorkReportType {
  return typeof value === "string" && (WORK_REPORT_TYPES as readonly string[]).includes(value);
}

export function assertValidWorkReportType(value: unknown): asserts value is WorkReportType {
  if (!isWorkReportType(value)) throw new ValidationError(`未知报告类型：${String(value)}`);
}

// ---- 纯日期算术：以 UTC 日序做整数运算，避开本地时区与 DST 漂移 ----

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86400000);
}

function dateFromDayNumber(n: number): string {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

/** 该日期所在自然周的周一（闭区间起点） */
export function startOfWorkReportWeek(date: string): string {
  if (!isIsoDate(date)) throw new ValidationError(`非法日期：${date}`);
  const n = dayNumber(date);
  return dateFromDayNumber(n - ((n + 3) % 7));
}

/** 该日期所在自然周的周日（闭区间终点） */
export function endOfWorkReportWeek(date: string): string {
  return dateFromDayNumber(dayNumber(startOfWorkReportWeek(date)) + 6);
}

export function nextWorkReportDate(date: string): string {
  if (!isIsoDate(date)) throw new ValidationError(`非法日期：${date}`);
  return dateFromDayNumber(dayNumber(date) + 1);
}

function isoWeekNumber(date: string): number {
  const n = dayNumber(date);
  const thursday = n + 4 - ((n + 3) % 7);
  const year = Number(dateFromDayNumber(thursday).slice(0, 4));
  return Math.floor((thursday - dayNumber(`${year}-01-01`)) / 7) + 1;
}

/** ISO 周锚点 YYYY-Www（周一）→ YYYY-MM-DD；非法周（含 53 周不存在）抛 ValidationError */
export function workReportIsoWeekMonday(value: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!m) throw new ValidationError(`非法 ISO 周：${value}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) throw new ValidationError(`非法 ISO 周：${value}`);
  const week1Monday = startOfWorkReportWeek(localDateStr(new Date(year, 0, 4)));
  const monday = dateFromDayNumber(dayNumber(week1Monday) + (week - 1) * 7);
  if (isoWeekNumber(monday) !== week) throw new ValidationError(`该年没有第 ${week} 周：${value}`);
  return monday;
}

export interface WorkReportPeriod {
  readonly type: WorkReportType;
  readonly date: string; // daily = 锚日；weekly = 所在周周一
  readonly from: string; // YYYY-MM-DD 含
  readonly to: string;   // YYYY-MM-DD 含
}

/**
 * daily：date 必须严格 YYYY-MM-DD，闭区间 [date,date]；
 * weekly：value 可为周内任意一天（归一到周一）或 ISO 周 YYYY-Www，闭区间 [周一,周日]；
 * 空值回落 now 所在日/周（缺省锚点，不是算法分支）。
 */
export function parseWorkReportPeriod(type: unknown, value: unknown, now: Date = new Date()): WorkReportPeriod {
  assertValidWorkReportType(type);
  const raw = typeof value === "string" ? value.trim() : "";
  if (type === "daily") {
    const date = raw === "" ? localDateStr(now) : raw;
    if (!isIsoDate(date)) throw new ValidationError(`非法日报日期：${date}`);
    return { type, date, from: date, to: date };
  }
  let monday: string;
  if (raw === "") {
    monday = startOfWorkReportWeek(localDateStr(now));
  } else if (isIsoDate(raw)) {
    monday = startOfWorkReportWeek(raw);
  } else {
    monday = workReportIsoWeekMonday(raw);
  }
  return { type, date: monday, from: monday, to: dateFromDayNumber(dayNumber(monday) + 6) };
}

/** 时间窗包含判定：ISO 时间戳/日期取前 10 位；闭区间 [from,to] */
export function inWorkReportWindow(date: string | null | undefined, period: WorkReportPeriod): boolean {
  if (typeof date !== "string" || date.length < 10) return false;
  const day = date.slice(0, 10);
  return period.from <= day && day <= period.to;
}

// ---- 输入（api 只读既有业务表后映射成以下最小形状，零算法分支） ----

export interface WorkReportTodoInput {
  readonly id: number;
  readonly title: string;
  readonly status: "open" | "done" | "archived";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly dueDate?: string | null;
}

export interface WorkReportScheduleInput {
  readonly id: number;
  readonly title: string;
  readonly date: string;
  readonly start: string;
  readonly end: string;
}

export interface WorkReportDocInput {
  readonly id: number;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** r34 依赖图 blocked 条目的最小投影（api 用 buildDependencyGraph(...).blocked 装配） */
export interface WorkReportBlockedInput {
  readonly todoId: number;
  readonly blockers: readonly number[];
}

export interface WorkReportSource {
  readonly todos: readonly WorkReportTodoInput[];
  readonly schedules: readonly WorkReportScheduleInput[];
  readonly blocked: readonly WorkReportBlockedInput[];
  readonly documents?: readonly WorkReportDocInput[];
}

export interface WorkReportItem {
  readonly id: number;
  readonly title: string;
  readonly at: string; // YYYY-MM-DD
}

export interface WorkReportScheduleItem {
  readonly id: number;
  readonly title: string;
  readonly date: string;
  readonly start: string;
  readonly end: string;
}

export interface WorkReportBlockedItem {
  readonly todoId: number;
  readonly title: string;
  readonly blockers: readonly number[];
}

export interface WorkReportData {
  readonly period: WorkReportPeriod;
  readonly completed: readonly WorkReportItem[];
  readonly ongoing: readonly WorkReportItem[];
  readonly blocked: readonly WorkReportBlockedItem[];
  readonly outputs: readonly WorkReportItem[];
  readonly schedules: readonly WorkReportScheduleItem[];
  readonly next: readonly WorkReportScheduleItem[];
  readonly nextTodos: readonly WorkReportItem[];
}

function byAtThenId(a: WorkReportItem, b: WorkReportItem): number {
  return a.at === b.at ? a.id - b.id : a.at < b.at ? -1 : 1;
}

function bySchedule(a: WorkReportScheduleItem, b: WorkReportScheduleItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  return a.id - b.id;
}

/** 六段数据装配：全部只读、不改入参、同输入逐字节稳定 */
export function collectReportData(source: WorkReportSource, period: WorkReportPeriod): WorkReportData {
  const todoById = new Map(source.todos.map((t) => [t.id, t]));
  const blockedByTodo = new Map(source.blocked.map((b) => [b.todoId, b.blockers]));

  const completed: WorkReportItem[] = [];
  const ongoing: WorkReportItem[] = [];
  for (const t of source.todos) {
    if (t.status === "done" && inWorkReportWindow(t.updatedAt, period)) {
      completed.push({ id: t.id, title: t.title, at: t.updatedAt.slice(0, 10) });
    }
    if (
      t.status === "open" &&
      !blockedByTodo.has(t.id) &&
      (inWorkReportWindow(t.createdAt, period) || inWorkReportWindow(t.updatedAt, period))
    ) {
      ongoing.push({ id: t.id, title: t.title, at: t.createdAt.slice(0, 10) });
    }
  }
  completed.sort(byAtThenId);
  ongoing.sort((a, b) => a.id - b.id);

  const blocked: WorkReportBlockedItem[] = [];
  for (const b of source.blocked) {
    const t = todoById.get(b.todoId);
    if (!t || t.status !== "open") continue;
    if (!inWorkReportWindow(t.createdAt, period) && !inWorkReportWindow(t.updatedAt, period)) continue;
    blocked.push({ todoId: b.todoId, title: t.title, blockers: [...b.blockers] });
  }
  blocked.sort((a, b) => a.todoId - b.todoId);

  const outputs: WorkReportItem[] = [];
  for (const d of source.documents ?? []) {
    if (inWorkReportWindow(d.updatedAt, period)) {
      outputs.push({ id: d.id, title: d.title, at: d.updatedAt.slice(0, 10) });
    }
  }
  outputs.sort(byAtThenId);

  const schedules: WorkReportScheduleItem[] = [];
  for (const s of source.schedules) {
    if (!inWorkReportWindow(s.date, period)) continue;
    schedules.push({ id: s.id, title: s.title, date: s.date, start: s.start, end: s.end });
  }
  schedules.sort(bySchedule);

  // 下一段：daily = 次日；weekly = 下一自然周（7 天闭区间）
  const planFrom = nextWorkReportDate(period.to);
  const planTo = period.type === "daily"
    ? planFrom
    : dateFromDayNumber(dayNumber(planFrom) + 6);
  const planPeriod: WorkReportPeriod = { type: period.type, date: planFrom, from: planFrom, to: planTo };
  const next: WorkReportScheduleItem[] = [];
  for (const s of source.schedules) {
    if (!inWorkReportWindow(s.date, planPeriod)) continue;
    next.push({ id: s.id, title: s.title, date: s.date, start: s.start, end: s.end });
  }
  next.sort(bySchedule);

  const nextTodos: WorkReportItem[] = [];
  for (const t of source.todos) {
    if (t.status !== "open" || blockedByTodo.has(t.id) || !t.dueDate) continue;
    if (!inWorkReportWindow(t.dueDate, planPeriod)) continue;
    nextTodos.push({ id: t.id, title: t.title, at: t.dueDate.slice(0, 10) });
  }
  nextTodos.sort(byAtThenId);

  return { period, completed, ongoing, blocked, outputs, schedules, next, nextTodos };
}

export interface WorkReportSummary {
  readonly completed: number;
  readonly ongoing: number;
  readonly blocked: number;
  readonly schedules: number;
  readonly next: number;
  readonly total: number;
}

export function reportSummary(data: WorkReportData): WorkReportSummary {
  const completed = data.completed.length;
  const ongoing = data.ongoing.length;
  const blocked = data.blocked.length;
  return {
    completed,
    ongoing,
    blocked,
    schedules: data.schedules.length,
    next: data.next.length,
    total: completed + ongoing + blocked,
  };
}

/** XSS 五字符转义（r32 打印导出同款口径，顺序敏感：& 优先） */
export function escapeWorkReportHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sectionLines(title: string, rows: readonly string[]): string[] {
  return [`## ${title}（${rows.length}）`, ...(rows.length === 0 ? ["- 暂无"] : rows), ""];
}

/** 六段 Markdown：标题 / 完成 / 进行中 / 阻塞 / 日程 / 产出 / 下一段计划 */
export function buildReportMarkdown(data: WorkReportData): string {
  const p = data.period;
  const title = p.type === "daily"
    ? `# 协流日报 · ${p.date}`
    : `# 协流周报 · ${p.from} ~ ${p.to}`;
  const completed = data.completed.map((x) => `- ${x.title}（#${x.id}）`);
  const ongoing = data.ongoing.map((x) => `- ${x.title}（#${x.id}）`);
  const blocked = data.blocked.map((x) => `- ${x.title}（#${x.todoId}，被 ${x.blockers.map((b) => `#${b}`).join("、")} 阻塞）`);
  const schedules = data.schedules.map((x) => `- ${x.start}–${x.end} ${x.title}`);
  const outputs = data.outputs.map((x) => `- ${x.title}（#${x.id}）`);
  const planTitle = p.type === "daily" ? "明日计划" : "下周计划";
  const plan = [
    ...data.next.map((x) => `- ${x.date} ${x.start}–${x.end} ${x.title}`),
    ...data.nextTodos.map((x) => `- 待办：${x.title}（#${x.id}，截止 ${x.at}）`),
  ];
  return [
    title,
    "",
    ...sectionLines("完成", completed),
    ...sectionLines("进行中", ongoing),
    ...sectionLines("阻塞", blocked),
    ...sectionLines("日程", schedules),
    ...sectionLines("产出", outputs),
    ...sectionLines(planTitle, plan),
    "> 由真实业务数据自动生成 · 零 token 模板化汇总",
    "",
  ].join("\n");
}

/** 打印版 HTML：内嵌 @media print；所有动态文本走五字符转义 */
export function buildReportHtml(data: WorkReportData): string {
  const e = escapeWorkReportHtml;
  const p = data.period;
  const title = p.type === "daily" ? `协流日报 · ${p.date}` : `协流周报 · ${p.from} ~ ${p.to}`;
  const list = (rows: readonly string[]): string =>
    rows.length === 0 ? "<li>暂无</li>" : rows.map((r) => `<li>${e(r)}</li>`).join("");
  const planTitle = p.type === "daily" ? "明日计划" : "下周计划";
  const plan = [
    ...data.next.map((x) => `${x.date} ${x.start}-${x.end} ${x.title}`),
    ...data.nextTodos.map((x) => `待办：${x.title}（截止 ${x.at}）`),
  ];
  return [
    "<!doctype html>",
    '<html lang="zh-CN"><head><meta charset="utf-8"><title>' + e(title) + "</title>",
    "<style>body{font-family:system-ui,sans-serif;max-width:780px;margin:32px auto;color:#222}",
    "h1{font-size:22px;border-bottom:2px solid #333;padding-bottom:8px}h2{font-size:16px;margin-top:20px}",
    "li{margin:4px 0}.no-print{margin-bottom:16px}@media print{.no-print{display:none}}</style></head><body>",
    '<button class="no-print" type="button" onclick="window.print()">打印 / 另存 PDF</button>',
    `<h1>${e(title)}</h1>`,
    `<h2>完成（${data.completed.length}）</h2><ul>${list(data.completed.map((x) => `${x.title}（#${x.id}）`))}</ul>`,
    `<h2>进行中（${data.ongoing.length}）</h2><ul>${list(data.ongoing.map((x) => `${x.title}（#${x.id}）`))}</ul>`,
    `<h2>阻塞（${data.blocked.length}）</h2><ul>${list(data.blocked.map((x) => `${x.title}（#${x.todoId}，被 ${x.blockers.map((b) => `#${b}`).join("、")} 阻塞）`))}</ul>`,
    `<h2>日程（${data.schedules.length}）</h2><ul>${list(data.schedules.map((x) => `${x.start}-${x.end} ${x.title}`))}</ul>`,
    `<h2>产出（${data.outputs.length}）</h2><ul>${list(data.outputs.map((x) => `${x.title}（#${x.id}）`))}</ul>`,
    `<h2>${e(planTitle)}（${plan.length}）</h2><ul>${list(plan)}</ul>`,
    "<p>由真实业务数据自动生成 · 零 token 模板化汇总</p></body></html>",
    "",
  ].join("\n");
}

// ---- 存为文档守卫（POST /api/reports/save；复用 documents + blocks，零新 schema） ----

export interface WorkReportSaveInput {
  readonly title: string;
  readonly markdown: string;
  readonly type: WorkReportType;
  readonly period: WorkReportPeriod;
  readonly documentId?: number;
}

export function assertValidWorkReportSave(body: unknown): WorkReportSaveInput {
  if (body === null || typeof body !== "object") throw new ValidationError("保存报告请求体不能为空");
  const b = body as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  assertValidDocumentTitle(title);
  const markdown = typeof b.markdown === "string" ? b.markdown : "";
  if (markdown.trim() === "") throw new ValidationError("报告内容不能为空");
  if (markdown.length > MAX_MARKDOWN_LENGTH) {
    throw new ValidationError(`报告内容过长：最多 ${MAX_MARKDOWN_LENGTH} 字（当前 ${markdown.length} 字）`);
  }
  assertValidWorkReportType(b.type);
  const period = parseWorkReportPeriod(b.type, b.type === "daily" ? b.date : b.week);
  let documentId: number | undefined;
  if (b.documentId !== undefined && b.documentId !== null && b.documentId !== "") {
    const id = Number(b.documentId);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError(`非法文档 id：${String(b.documentId)}`);
    documentId = id;
  }
  return {
    title,
    markdown,
    type: b.type,
    period,
    ...(documentId === undefined ? {} : { documentId }),
  };
}
