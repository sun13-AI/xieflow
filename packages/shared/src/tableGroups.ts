// 协流 XieFlow — shared/tableGroups.ts：多维表格分组视图与汇总行唯一口径（r37）
// 分桶（含 null 独立组、组序确定）/ 聚合（count|sum|avg，跳过非数值）/ 组内排序 +
// 汇总行装配全部是本文件的纯函数；api / web 零算法分支，只装配 shared 结果并映射 4xx。
// 零新依赖、零 token、聚合只读不落库（不改任何记录）。
import { ValidationError, compareValues, isEmptyFieldValue } from "./index.js";
import type { TableField, TableRecord, ViewSortRule } from "./index.js";

export const GROUP_AGGREGATORS = ["count", "sum", "avg"] as const;
export type GroupAggregator = (typeof GROUP_AGGREGATORS)[number];

export const GROUP_AGGREGATOR_LABELS: Readonly<Record<GroupAggregator, string>> = {
  count: "计数",
  sum: "求和",
  avg: "均值",
};

export function isGroupAggregator(value: unknown): value is GroupAggregator {
  return typeof value === "string" && (GROUP_AGGREGATORS as readonly string[]).includes(value);
}

export function assertValidGroupAggregator(value: unknown): asserts value is GroupAggregator {
  if (!isGroupAggregator(value)) {
    throw new ValidationError(`非法聚合方式：${String(value)}（只允许 count / sum / avg）`);
  }
}

/**
 * 分组规格（视图 group_spec 落库形态）：
 * - fieldId：分组字段（按该字段值分桶，空值独立成组）
 * - aggregator：count（组内行数）/ sum（求和）/ avg（均值）
 * - aggregateFieldId：sum / avg 的取值字段（必须数值类型）；count 忽略并归一为 null
 */
export interface GroupSpec {
  fieldId: number;
  aggregator: GroupAggregator;
  aggregateFieldId?: number | null;
}

/** 空值（null / undefined / 空串 / 空数组）独立组的固定 key 与展示名 */
export const NULL_GROUP_KEY = "__null__";
export const NULL_GROUP_LABEL = "（空值）";

export interface GroupBucket {
  key: string;
  value: unknown;
  label: string;
  records: TableRecord[];
}

/** 单组汇总（纯数值；sum/avg 无有效数值时 value=null，绝不产出 NaN/Infinity） */
export interface GroupSummary {
  count: number;
  aggregator: GroupAggregator;
  aggregateFieldId: number | null;
  /** 参与 sum/avg 的数值个数（跳过非数值）；count 时等于组内行数 */
  numericCount: number;
  value: number | null;
}

export interface GroupViewGroup {
  key: string;
  label: string;
  records: TableRecord[];
  summary: GroupSummary;
}

export interface GroupView {
  groupSpec: GroupSpec;
  groups: GroupViewGroup[];
  totalRecords: number;
  totalGroups: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 数值判定：有限数字或非空的数字字符串；null / 空串 / 布尔 / 数组 / 对象 / NaN 跳过 */
function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function valueKey(value: unknown): string {
  if (isEmptyFieldValue(value)) return NULL_GROUP_KEY;
  if (Array.isArray(value)) return `a:${JSON.stringify([...value].map(String).sort())}`;
  return `${typeof value}:${String(value)}`;
}

function valueLabel(value: unknown): string {
  if (isEmptyFieldValue(value)) return NULL_GROUP_LABEL;
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.map(String).join("、");
  return String(value);
}

/**
 * 按字段值分桶：空值（含空数组）归入独立组并恒排最后；
 * 非空组按字段类型口径排序（number 按值 / select 按候选项序 / 文本按字典序），
 * 同值再按 key 兜底，组序完全确定。
 */
export function groupRecords(
  records: readonly TableRecord[],
  fieldId: number,
  field?: TableField,
): GroupBucket[] {
  const buckets = new Map<string, GroupBucket>();
  for (const record of records) {
    const value = record.data[String(fieldId)];
    const key = valueKey(value);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, value: value ?? null, label: valueLabel(value), records: [] };
      buckets.set(key, bucket);
    }
    bucket.records.push(record);
  }
  const type = field?.type ?? "text";
  const options = field?.options ?? [];
  return [...buckets.values()].sort((a, b) => {
    const aNull = a.key === NULL_GROUP_KEY;
    const bNull = b.key === NULL_GROUP_KEY;
    if (aNull || bNull) return aNull && bNull ? 0 : aNull ? 1 : -1;
    const cmp = compareValues(type, a.value, b.value, options);
    return cmp !== 0 ? cmp : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/**
 * 单组聚合：count = 组内行数；sum / avg 只吃数值（跳过非数值），
 * 一个有效数值都没有时返回 null（不以 0 或 NaN 冒充）。
 */
export function aggregateGroup(
  records: readonly TableRecord[],
  fieldId: number,
  aggregator: GroupAggregator,
): number | null {
  if (aggregator === "count") return records.length;
  let sum = 0;
  let numericCount = 0;
  for (const record of records) {
    const n = numericValue(record.data[String(fieldId)]);
    if (n === null) continue; // 非数值跳过
    sum += n;
    numericCount++;
  }
  if (numericCount === 0) return null;
  return aggregator === "sum" ? sum : sum / numericCount;
}

/** 汇总行的数值个数（与 aggregateGroup 同一数值判定口径） */
export function countNumericValues(records: readonly TableRecord[], fieldId: number): number {
  let n = 0;
  for (const record of records) {
    if (numericValue(record.data[String(fieldId)]) !== null) n++;
  }
  return n;
}

function sortGroupRecords(
  records: readonly TableRecord[],
  fields: readonly TableField[],
  sortSpec: readonly ViewSortRule[],
): TableRecord[] {
  const byId = new Map(fields.map((f) => [f.id, f]));
  return [...records].sort((a, b) => {
    for (const rule of sortSpec) {
      const field = byId.get(rule.fieldId);
      if (!field) continue;
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

/**
 * 分组视图装配：分桶 → 组内排序（sortSpec 复用 shared compareValues 口径）→
 * 每组汇总行。返回结构全部可序列化，api 直接回传、web 直接渲染，零算法分支。
 */
export function buildGroupView(
  records: readonly TableRecord[],
  groupSpec: GroupSpec,
  fields: readonly TableField[],
  sortSpec: readonly ViewSortRule[] = [],
): GroupView {
  const groupField = fields.find((f) => f.id === groupSpec.fieldId);
  const aggregateFieldId = groupSpec.aggregateFieldId ?? groupSpec.fieldId;
  const buckets = groupRecords(records, groupSpec.fieldId, groupField);
  const groups = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    records: sortSpec.length > 0 ? sortGroupRecords(bucket.records, fields, sortSpec) : [...bucket.records],
    summary: {
      count: bucket.records.length,
      aggregator: groupSpec.aggregator,
      aggregateFieldId: groupSpec.aggregator === "count" ? null : aggregateFieldId,
      numericCount:
        groupSpec.aggregator === "count"
          ? bucket.records.length
          : countNumericValues(bucket.records, aggregateFieldId),
      value: aggregateGroup(bucket.records, aggregateFieldId, groupSpec.aggregator),
    },
  }));
  return {
    groupSpec,
    groups,
    totalRecords: records.length,
    totalGroups: groups.length,
  };
}

/** 分组规格归一（r7 normalizeViewSpec 调用）：非法字段 / 聚合 / 取值字段一律 400 守卫 */
export function normalizeGroupSpec(
  fields: readonly TableField[],
  input: unknown,
): GroupSpec | null {
  if (input === undefined || input === null) return null;
  if (!isPlainObject(input)) throw new ValidationError("分组规格必须是对象");
  const rawFieldId = input["fieldId"];
  const fieldId = Number(rawFieldId);
  if (!Number.isInteger(fieldId) || fieldId <= 0) {
    throw new ValidationError(`分组字段 id 非法：${String(rawFieldId)}`);
  }
  if (!fields.some((f) => f.id === fieldId)) {
    throw new ValidationError(`分组字段不存在：${fieldId}`);
  }
  assertValidGroupAggregator(input["aggregator"]);
  const aggregator = input["aggregator"] as GroupAggregator;
  if (aggregator === "count") return { fieldId, aggregator, aggregateFieldId: null };
  const rawAggId = input["aggregateFieldId"];
  const aggregateFieldId = Number(rawAggId);
  if (!Number.isInteger(aggregateFieldId) || aggregateFieldId <= 0) {
    throw new ValidationError(`聚合取值字段 id 非法：${String(rawAggId)}`);
  }
  const aggField = fields.find((f) => f.id === aggregateFieldId);
  if (!aggField) throw new ValidationError(`聚合取值字段不存在：${aggregateFieldId}`);
  if (aggField.type !== "number") {
    throw new ValidationError(`聚合取值字段必须是数值类型：${aggField.name}`);
  }
  return { fieldId, aggregator, aggregateFieldId };
}

/** 分组规格可读摘要（视图条与提示文案共用同一口径） */
export function describeGroupSpec(
  spec: GroupSpec | null,
  fields: readonly TableField[],
): string {
  if (spec === null) return "";
  const nameOf = (id: number): string => fields.find((f) => f.id === id)?.name ?? `#${id}`;
  const label = GROUP_AGGREGATOR_LABELS[spec.aggregator];
  const agg = spec.aggregator === "count" ? "" : `（取 ${nameOf(spec.aggregateFieldId ?? spec.fieldId)}）`;
  return `按${nameOf(spec.fieldId)}分组 · ${label}${agg}`;
}
