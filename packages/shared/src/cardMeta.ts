// 协流 XieFlow — shared/cardMeta.ts：看板卡片元数据唯一口径（r38）
// 标签归一（trim / 去重 / 上限 / 禁空）、截止日守卫、完成列判定、逾期判定、
// 逾期列表 / 标签筛选 / 元数据摘要全部是本文件的纯函数；api / web 零算法分支，
// 只装配本模块结果并映射 4xx。零新依赖、零 token、向后兼容（老卡三字段可空）。
import { ValidationError, isIsoDate, localDateStr } from "./index.js";
import type { BoardCard } from "./index.js";

/** 单卡标签数量上限（防止无限 tag 把卡片正面撑爆） */
export const MAX_CARD_LABELS = 10;
/** 单条标签长度上限（与看板名称同一量级，取 40 字） */
export const MAX_CARD_LABEL_LENGTH = 40;
/** 完成列名称关键字（命中任一即视为「完成列」，该列卡片不标逾期红） */
export const COMPLETION_COLUMN_KEYWORDS: readonly string[] = ["完成", "done", "complete", "closed"];

/** 负责人摘要（不依赖 org 模块，结构兼容 shared/org MemberSummary） */
export interface CardAssigneeSummary {
  readonly id: number;
  readonly name: string;
  readonly departmentName?: string | null;
}

/** 带元数据的卡片形状（所有字段可空/可缺省 -> 老卡直接可用，向后兼容硬要求） */
export interface CardWithMeta {
  readonly id: number;
  readonly columnId: number;
  readonly labels?: readonly string[] | null;
  readonly assigneeMemberId?: number | null;
  readonly assigneeMember?: CardAssigneeSummary | null;
  readonly dueDate?: string | null;
}

/** 元数据摘要：标签数 / 标签清单 / 逾期态 / 截止日 / 负责人摘要 */
export interface CardMetaSummary {
  readonly labels: string[];
  readonly labelCount: number;
  readonly overdue: boolean;
  readonly dueDate: string | null;
  readonly assigneeMemberId: number | null;
  readonly assigneeMember: CardAssigneeSummary | null;
}

/**
 * 标签归一（r38 唯一入口）：
 * ① null / undefined -> []；② 必须是字符串数组，否则抛 ValidationError；
 * ③ 每条 trim，空串条目丢弃；④ 去重保序；
 * ⑤ 单条长度 > MAX_CARD_LABEL_LENGTH 抛错；⑥ 总数 > MAX_CARD_LABELS 抛错；
 * ⑦ 归一后为空数组而原输入非空 -> 抛错（禁空：全空标签集无意义）。
 */
export function normalizeCardLabels(input: unknown): string[] {
  if (input === null || input === undefined) return [];
  if (!Array.isArray(input)) {
    throw new ValidationError(`标签必须是字符串数组：${String(input)}`);
  }
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") {
      throw new ValidationError(`标签必须是字符串：${String(item)}`);
    }
    const label = item.trim();
    if (label === "") continue;
    if (label.length > MAX_CARD_LABEL_LENGTH) {
      throw new ValidationError(`标签过长：最多 ${MAX_CARD_LABEL_LENGTH} 字（当前 ${label.length} 字）`);
    }
    if (!out.includes(label)) out.push(label);
  }
  if (input.length > 0 && out.length === 0) {
    throw new ValidationError("标签不能全为空");
  }
  if (out.length > MAX_CARD_LABELS) {
    throw new ValidationError(`标签最多 ${MAX_CARD_LABELS} 个（当前 ${out.length} 个）`);
  }
  return out;
}

/** 单条标签守卫（筛选查询串用）：非空、不超长，返回 trim 后的标签 */
export function assertValidCardLabel(input: unknown): asserts input is string {
  const normalized = normalizeCardLabels([input]);
  if (normalized.length !== 1) throw new ValidationError("标签不能为空");
}

/** 截止日守卫：null / undefined 表示清空；否则必须严格 YYYY-MM-DD 真实日期 */
export function assertValidCardDueDate(input: unknown): asserts input is string | null {
  if (input === null || input === undefined) return;
  if (!isIsoDate(input)) {
    throw new ValidationError(`非法卡片截止日期：${String(input)}`);
  }
}

/** 完成列判定：列名含「完成」或匹配 done / complete / closed（大小写不敏感） */
export function isCompletionColumnName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const lower = name.trim().toLowerCase();
  if (lower === "") return false;
  return COMPLETION_COLUMN_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * 逾期判定（r38 灵魂，本地日期口径）：
 * ① 无合法截止日 -> false；② 完成列 -> false（即使日期已过也不标红）；
 * ③ 截止日 < 今天 -> true；④ 今天 / 未来 -> false（截止日按当天结束理解）。
 */
export function isOverdue(dueDate: unknown, now: Date = new Date(), columnName?: string | null): boolean {
  if (!isIsoDate(dueDate)) return false;
  if (isCompletionColumnName(columnName)) return false;
  return dueDate < localDateStr(now);
}

/** 逾期列表装配：列 id -> 列名映射由调用方提供（数据查表，非算法），判定全走 isOverdue */
export function collectOverdueCards<T extends CardWithMeta>(
  cards: readonly T[],
  now: Date = new Date(),
  columns: readonly { readonly id: number; readonly name: string }[] = [],
): T[] {
  const colName = new Map(columns.map((c) => [c.id, c.name]));
  return cards.filter((card) =>
    isOverdue(card.dueDate, now, colName.get(card.columnId) ?? null),
  );
}

/** 标签筛选：查询串先经单条守卫（trim / 禁空），再按标签数组命中 */
export function filterCardsByLabel<T extends CardWithMeta>(
  cards: readonly T[],
  label: string,
): T[] {
  assertValidCardLabel(label);
  const wanted = normalizeCardLabels([label])[0]!;
  return cards.filter((card) => (card.labels ?? []).includes(wanted));
}

/** 元数据摘要装配：标签数 / 逾期态 / 负责人摘要一次给出（api/web 只渲染） */
export function cardMetaSummary(
  card: CardWithMeta,
  now: Date = new Date(),
  columnName?: string | null,
): CardMetaSummary {
  const labels = normalizeCardLabels(card.labels ?? []);
  return {
    labels,
    labelCount: labels.length,
    overdue: isOverdue(card.dueDate, now, columnName),
    dueDate: card.dueDate ?? null,
    assigneeMemberId: card.assigneeMemberId ?? null,
    assigneeMember: card.assigneeMember ?? null,
  };
}

/** 老卡兼容读回：无新字段的 BoardCard 视作空元数据（不修改原对象） */
export function asCardWithMeta(card: BoardCard): CardWithMeta & BoardCard {
  return {
    ...card,
    labels: card.labels ?? [],
    assigneeMemberId: card.assigneeMemberId ?? null,
    dueDate: card.dueDate ?? null,
  };
}
