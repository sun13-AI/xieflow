// 协流 XieFlow — shared/reports.ts：报表中心唯一口径（r27 · M10 后跨模块数据看板）
// 六类指标（待办完成率 / 日程分布 / 看板吞吐 / 审批时效 / 库存周转 / 文档产出）
// 全部由本文件的纯函数算出；api / web 零算法分支，只装配与消费结果。
// 时间范围统一为闭区间 [from,to]（YYYY-MM-DD，本地日期）；环比 = 当前区间 - 等长前一区间。
// 无新依赖、零 token、只读不写业务数据。本文件为 @xieflow/shared/reports 子路径导出。
import { ValidationError, isIsoDate, localDateStr, localDateOffset } from "./index.js";

/** 六类指标唯一枚举（api 路由白名单 / web KPI 卡顺序 / e2e 断言共用） */
export const REPORT_METRICS = [
  "todoCompletion", "scheduleLoad", "boardThroughput", "approvalSla", "assetTurnover", "docOutput",
] as const;
export type ReportMetric = (typeof REPORT_METRICS)[number];

export const REPORT_METRIC_LABELS: Readonly<Record<ReportMetric, string>> = {
  todoCompletion: "待办完成率",
  scheduleLoad: "日程分布",
  boardThroughput: "看板吞吐",
  approvalSla: "审批时效",
  assetTurnover: "库存周转",
  docOutput: "文档产出",
};

/** 时间范围预设（web 近 7/30/90 天按钮共用） */
export const REPORT_PRESETS = ["7d", "30d", "90d"] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];
export const REPORT_DEFAULT_PRESET: ReportPreset = "30d";
export const REPORT_SPARK_BUCKETS = 7;

export function isReportMetric(value: unknown): value is ReportMetric {
  return typeof value === "string" && (REPORT_METRICS as readonly string[]).includes(value);
}

export function assertValidReportMetric(value: unknown): asserts value is ReportMetric {
  if (!isReportMetric(value)) throw new ValidationError(`未知报表指标：${String(value)}`);
}

export interface ReportRange {
  readonly from: string; // YYYY-MM-DD 含
  readonly to: string;   // YYYY-MM-DD 含
}

export interface ReportWindow {
  readonly range: ReportRange;
  readonly previous: ReportRange;
  readonly days: number;
}

/** 严格闭区间：from<=to；缺省（两者都空）回落最近 30 天（含今天） */
export function parseReportRange(from: unknown, to: unknown, now: Date = new Date()): ReportRange {
  const a = typeof from === "string" ? from.trim() : "";
  const b = typeof to === "string" ? to.trim() : "";
  if (a === "" && b === "") {
    return { from: localDateOffset(-29, now), to: localDateStr(now) };
  }
  if (a === "" || b === "") throw new ValidationError("报表时间范围必须同时提供 from 与 to");
  if (!isIsoDate(a) || !isIsoDate(b)) throw new ValidationError(`非法报表日期：${!isIsoDate(a) ? a : b}`);
  if (a > b) throw new ValidationError(`报表时间范围非法：${a} > ${b}`);
  return { from: a, to: b };
}

export function reportRangeFromPreset(preset: unknown, now: Date = new Date()): ReportRange {
  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  if (!REPORT_PRESETS.includes(preset as ReportPreset)) {
    throw new ValidationError(`非法报表时间预设：${String(preset)}`);
  }
  return { from: localDateOffset(-(days - 1), now), to: localDateStr(now) };
}

function dayMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function reportRangeDays(range: ReportRange): number {
  return Math.round((dayMs(range.to) - dayMs(range.from)) / 86400000) + 1;
}

/** 前一等长区间（days = 当前区间天数），用于环比 */
export function shiftReportRange(range: ReportRange, direction: -1 | 1): ReportRange {
  const days = reportRangeDays(range) * direction;
  const shift = (date: string): string =>
    new Date(dayMs(date) + days * 86400000).toISOString().slice(0, 10);
  return { from: shift(range.from), to: shift(range.to) };
}

export function reportWindow(range: ReportRange): ReportWindow {
  return { range, previous: shiftReportRange(range, -1), days: reportRangeDays(range) };
}

/** 日期（ISO 时间戳取前 10 位）是否落闭区间 */
export function inReportRange(date: string | null | undefined, range: ReportRange): boolean {
  if (typeof date !== "string" || date.length < 10) return false;
  const day = date.slice(0, 10);
  return range.from <= day && day <= range.to;
}

/** 完成率/占比统一口径：分母<=0 记 0，整数百分比 0..100 */
export function reportPercent(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export interface ReportDetailRow {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly note: string;
}

export interface ReportComputation {
  readonly value: number;
  readonly unit: string;
  readonly spark: readonly number[];
  readonly detail: readonly ReportDetailRow[];
}

function dayIndex(range: ReportRange, date: string): number {
  const idx = Math.round((dayMs(date.slice(0, 10)) - dayMs(range.from)) / 86400000);
  return Math.max(0, Math.min(reportRangeDays(range) - 1, idx));
}

/** 迷你条序列（固定 7 桶，sum 累加 / avg 取桶均值；空桶 0） */
function makeSpark(
  range: ReportRange,
  rows: readonly { readonly date: string; readonly value: number }[],
  mode: "sum" | "avg" = "sum",
): number[] {
  const total = reportRangeDays(range);
  const sums = new Array<number>(REPORT_SPARK_BUCKETS).fill(0);
  const counts = new Array<number>(REPORT_SPARK_BUCKETS).fill(0);
  for (const row of rows) {
    const bucket = Math.min(REPORT_SPARK_BUCKETS - 1, Math.floor((dayIndex(range, row.date) / total) * REPORT_SPARK_BUCKETS));
    sums[bucket] = (sums[bucket] ?? 0) + row.value;
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return sums.map((sum, i) => (mode === "avg" && (counts[i] ?? 0) > 0 ? Math.round(sum / counts[i]!) : sum));
}

/** 计算源（全部只读；缺省即空集合，保证空数据不崩返回 0） */
export interface ReportSource {
  readonly todos?: readonly { readonly id: number; readonly title?: string; readonly status: string; readonly createdAt: string; readonly updatedAt?: string }[];
  readonly schedules?: readonly { readonly id: number; readonly title?: string; readonly date: string; readonly start?: string }[];
  readonly boardCards?: readonly { readonly id: number; readonly title?: string; readonly columnId: number; readonly todoId: number | null; readonly updatedAt: string }[];
  readonly boardColumns?: readonly { readonly id: number; readonly name: string }[];
  readonly approvals?: readonly { readonly id: number; readonly title?: string; readonly status: string; readonly createdAt: string; readonly updatedAt: string }[];
  readonly approvalSteps?: readonly { readonly id: number; readonly approvalId: number; readonly action: string; readonly actedAt: string }[];
  readonly assetTransactions?: readonly { readonly id: number; readonly assetId: number; readonly type: string; readonly quantity: number; readonly createdAt: string }[];
  readonly documents?: readonly { readonly id: number; readonly title?: string; readonly createdAt: string }[];
}

/** ① 待办完成率：区间内创建的待办，status=done 算完成；value=百分比整数 */
export function computeTodoCompletion(todos: ReportSource["todos"], range: ReportRange): ReportComputation {
  const inWindow = (todos ?? []).filter((t) => inReportRange(t.createdAt, range));
  const done = inWindow.filter((t) => t.status === "done").length;
  const detail: ReportDetailRow[] = inWindow.map((t) => ({
    key: String(t.id),
    label: t.title ?? `#${t.id}`,
    value: t.status === "done" ? 1 : 0,
    note: t.status,
  }));
  return {
    value: reportPercent(done, inWindow.length),
    unit: "%",
    spark: makeSpark(range, inWindow.map((t) => ({ date: t.createdAt, value: t.status === "done" ? 1 : 0 })), "avg"),
    detail,
  };
}

/** ② 日程分布：按日程 date 落区间；value=日程总数，detail=逐日计数 */
export function computeScheduleLoad(schedules: ReportSource["schedules"], range: ReportRange): ReportComputation {
  const inWindow = (schedules ?? []).filter((s) => inReportRange(s.date, range));
  const byDate = new Map<string, number>();
  for (const s of inWindow) byDate.set(s.date, (byDate.get(s.date) ?? 0) + 1);
  const detail: ReportDetailRow[] = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, count]) => ({
    key: date,
    label: date,
    value: count,
    note: `${count} 场日程`,
  }));
  return {
    value: inWindow.length,
    unit: "场",
    spark: makeSpark(range, inWindow.map((s) => ({ date: s.date, value: 1 }))),
    detail,
  };
}

/** ③ 看板吞吐：关联待办 status=done 且 updatedAt 落区间的卡片数；detail=按列计数 */
export function computeBoardThroughput(
  cards: ReportSource["boardCards"],
  columns: ReportSource["boardColumns"],
  todos: readonly { readonly id: number; readonly status: string }[],
  range: ReportRange,
): ReportComputation {
  const doneIds = new Set(todos.filter((t) => t.status === "done").map((t) => t.id));
  const inWindow = (cards ?? []).filter((c) => c.todoId !== null && doneIds.has(c.todoId) && inReportRange(c.updatedAt, range));
  const byColumn = new Map<number, number>();
  for (const c of inWindow) byColumn.set(c.columnId, (byColumn.get(c.columnId) ?? 0) + 1);
  const nameOf = (id: number): string => (columns ?? []).find((col) => col.id === id)?.name ?? `列 #${id}`;
  const detail: ReportDetailRow[] = [...byColumn.entries()].sort(([a], [b]) => a - b).map(([id, count]) => ({
    key: `column-${id}`,
    label: nameOf(id),
    value: count,
    note: "完成卡片",
  }));
  return {
    value: inWindow.length,
    unit: "张",
    spark: makeSpark(range, inWindow.map((c) => ({ date: c.updatedAt, value: 1 }))),
    detail,
  };
}

const SLA_TERMINAL = new Set(["approved", "rejected", "withdrawn"]);

function resolutionHours(
  approval: NonNullable<ReportSource["approvals"]>[number],
  steps: NonNullable<ReportSource["approvalSteps"]>,
): number {
  const mine = steps.filter((s) => s.approvalId === approval.id);
  const submit = mine.find((s) => s.action === "submit");
  const final = [...mine].reverse().find((s) => SLA_TERMINAL.has(s.action));
  const startMs = Date.parse(submit?.actedAt ?? approval.createdAt);
  const endMs = Date.parse(final?.actedAt ?? approval.updatedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
  return Math.round((endMs - startMs) / 3600000);
}

/** ④ 审批时效：终态审批按 updatedAt 落区间；value=平均处理小时（整数），detail=逐单耗时 */
export function computeApprovalSla(
  approvals: ReportSource["approvals"],
  steps: ReportSource["approvalSteps"],
  range: ReportRange,
): ReportComputation {
  const inWindow = (approvals ?? []).filter((a) => SLA_TERMINAL.has(a.status) && inReportRange(a.updatedAt, range));
  const rows = inWindow.map((a) => ({
    approval: a,
    hours: resolutionHours(a, steps ?? []),
  }));
  const total = rows.reduce((sum, r) => sum + r.hours, 0);
  const detail: ReportDetailRow[] = rows.map(({ approval, hours }) => ({
    key: String(approval.id),
    label: approval.title ?? `#${approval.id}`,
    value: hours,
    note: approval.status,
  }));
  return {
    value: rows.length === 0 ? 0 : Math.round(total / rows.length),
    unit: "小时",
    spark: makeSpark(range, rows.map(({ approval, hours }) => ({ date: approval.updatedAt, value: hours })), "avg"),
    detail,
  };
}

/** ⑤ 库存周转：区间内出库流水总量（入库/转移不计吞吐）；detail=按物资出库量 */
export function computeAssetTurnover(transactions: ReportSource["assetTransactions"], range: ReportRange): ReportComputation {
  const inWindow = (transactions ?? []).filter((t) => inReportRange(t.createdAt, range));
  const out = inWindow.filter((t) => t.type === "out");
  const inbound = inWindow.filter((t) => t.type === "in");
  const byAsset = new Map<number, { out: number; in: number }>();
  for (const t of inWindow) {
    const rec = byAsset.get(t.assetId) ?? { out: 0, in: 0 };
    if (t.type === "out") rec.out += t.quantity;
    if (t.type === "in") rec.in += t.quantity;
    byAsset.set(t.assetId, rec);
  }
  const detail: ReportDetailRow[] = [...byAsset.entries()].sort(([a], [b]) => a - b).map(([id, rec]) => ({
    key: String(id),
    label: `物资 #${id}`,
    value: rec.out,
    note: `入库 ${rec.in} / 出库 ${rec.out}`,
  }));
  return {
    value: out.reduce((sum, t) => sum + t.quantity, 0),
    unit: "件",
    spark: makeSpark(range, out.map((t) => ({ date: t.createdAt, value: t.quantity }))),
    detail,
  };
}

/** ⑥ 文档产出：区间内创建的文档数；detail=逐篇文档 */
export function computeDocOutput(documents: ReportSource["documents"], range: ReportRange): ReportComputation {
  const inWindow = (documents ?? []).filter((d) => inReportRange(d.createdAt, range));
  const detail: ReportDetailRow[] = inWindow.map((d) => ({
    key: String(d.id),
    label: d.title ?? `#${d.id}`,
    value: 1,
    note: "新建文档",
  }));
  return {
    value: inWindow.length,
    unit: "篇",
    spark: makeSpark(range, inWindow.map((d) => ({ date: d.createdAt, value: 1 }))),
    detail,
  };
}

export interface ReportMetricResult extends ReportComputation {
  readonly metric: ReportMetric;
  readonly label: string;
  readonly previous: number;
  readonly delta: number;
  readonly deltaPct: number; // 整数百分比；previous<=0 记 0（不除零）
}

export interface ReportOverview {
  readonly range: ReportRange;
  readonly previousRange: ReportRange;
  readonly days: number;
  readonly metrics: Readonly<Record<ReportMetric, ReportMetricResult>>;
  readonly metricOrder: readonly ReportMetric[];
}

function computeOne(metric: ReportMetric, source: ReportSource, range: ReportRange): ReportComputation {
  switch (metric) {
    case "todoCompletion": return computeTodoCompletion(source.todos, range);
    case "scheduleLoad": return computeScheduleLoad(source.schedules, range);
    case "boardThroughput": return computeBoardThroughput(source.boardCards, source.boardColumns, source.todos ?? [], range);
    case "approvalSla": return computeApprovalSla(source.approvals, source.approvalSteps, range);
    case "assetTurnover": return computeAssetTurnover(source.assetTransactions, range);
    case "docOutput": return computeDocOutput(source.documents, range);
  }
}

/** 六指标一次装配（api/overview 与 web 首屏唯一入口；纯函数、不改 source） */
export function assembleReport(source: ReportSource, range: ReportRange): ReportOverview {
  const window = reportWindow(range);
  const metrics = {} as Record<ReportMetric, ReportMetricResult>;
  for (const metric of REPORT_METRICS) {
    const current = computeOne(metric, source, window.range);
    const previous = computeOne(metric, source, window.previous).value;
    const delta = current.value - previous;
    metrics[metric] = {
      metric,
      label: REPORT_METRIC_LABELS[metric],
      value: current.value,
      unit: current.unit,
      spark: current.spark,
      detail: current.detail,
      previous,
      delta,
      deltaPct: previous > 0 ? Math.round((delta / previous) * 100) : 0,
    };
  }
  return { range: window.range, previousRange: window.previous, days: window.days, metrics, metricOrder: [...REPORT_METRICS] };
}

/** 单项下钻：按 metric 从 overview 取同一口径结果（api /:metric 唯一入口） */
export function selectReportMetric(overview: ReportOverview, metric: unknown): ReportMetricResult {
  assertValidReportMetric(metric);
  return overview.metrics[metric];
}

/** 明细按实体 id 过滤（越权/不存在 id 由 api 映射 404；本函数只返回空数组） */
export function filterReportDetail(result: ReportMetricResult, id: number): ReportDetailRow[] {
  const key = String(id);
  return result.detail.filter((row) => row.key === key || row.key === `column-${id}`);
}
