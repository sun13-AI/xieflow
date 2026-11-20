// 协流 XieFlow — shared/globalSearch.ts：全局搜索唯一口径（r33 · 跨 8 源只读统一检索）
// 规则集中：normalizeQuery（trim / 小写 / 分词）、scoreMatch（标题权重 > 正文、前缀 > 包含）、
// assembleSearchResults（跨源聚合 / 分数排序 / 每源上限 / 去重 / 直达 deepLink），
// 另含 api 入参守卫（q / types / limit）与 deep-link 映射。api / web 零算法分支。
// 纯 TS 零依赖、零 token、零外部搜索服务；本文件为 @xieflow/shared/globalSearch 子路径导出。
import { ValidationError } from "./index.js";

/** 八类可检索源（全读既有表，只读不写；白名单之外一律 400「非法搜索源」） */
export const SEARCH_SOURCE_TYPES = [
  "todos", "schedules", "projects", "cards", "documents", "knowledge_docs", "members", "meetings",
] as const;
export type SearchSourceType = (typeof SEARCH_SOURCE_TYPES)[number];

/** 类型中文标签（下拉结果面板分组标题） */
export const SEARCH_SOURCE_LABELS: Record<SearchSourceType, string> = {
  todos: "待办",
  schedules: "日程",
  projects: "项目",
  cards: "看板卡片",
  documents: "文档",
  knowledge_docs: "知识库",
  members: "成员",
  meetings: "会议",
};

/** 类型分组图标（纯字符，零图标库 / 零 CDN） */
export const SEARCH_SOURCE_ICONS: Record<SearchSourceType, string> = {
  todos: "✓",
  schedules: "◷",
  projects: "▣",
  cards: "▤",
  documents: "▧",
  knowledge_docs: "▩",
  members: "◉",
  meetings: "◴",
};

/** 类型 → 目标 tab（web 点结果只消费本映射，零分支） */
export const SEARCH_SOURCE_TABS: Record<SearchSourceType, string> = {
  todos: "todos",
  schedules: "schedules",
  projects: "board",
  cards: "board",
  documents: "docs",
  knowledge_docs: "knowledge",
  members: "org",
  meetings: "meetings",
};

/** 类型 → 定位参数名（复用 r26 deep-link 机制：page + id 写地址栏，reload 不丢） */
export const SEARCH_ID_PARAMS: Record<SearchSourceType, string> = {
  todos: "todoId",
  schedules: "scheduleId",
  projects: "projectId",
  cards: "cardId",
  documents: "docId",
  knowledge_docs: "docId",
  members: "memberId",
  meetings: "meetingId",
};

/** 查询词长度上限 / 结果上限 / 每源上限（api 与 UI 同一把尺） */
export const MAX_SEARCH_QUERY = 200;
export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 50;
export const DEFAULT_SEARCH_PER_SOURCE = 5;

/** 打分权重：标题命中恒高于正文；前缀命中恒高于包含 */
export const SEARCH_TITLE_WEIGHT = 3;
export const SEARCH_BODY_WEIGHT = 1;
export const SEARCH_PREFIX_SCORE = 10;
export const SEARCH_CONTAINS_SCORE = 5;

export function isSearchSourceType(value: unknown): value is SearchSourceType {
  return typeof value === "string" && (SEARCH_SOURCE_TYPES as readonly string[]).includes(value);
}

export function assertValidSearchSourceType(value: unknown): asserts value is SearchSourceType {
  if (!isSearchSourceType(value)) throw new ValidationError(`非法搜索源：${String(value)}`);
}

/** 查询词守卫：必须字符串、trim 后非空、原始长度 ≤200（空 q / 超长 q → 400） */
export function assertValidSearchQuery(raw: unknown): string {
  if (typeof raw !== "string") throw new ValidationError("搜索词必须是字符串");
  const text = raw.trim();
  if (text === "") throw new ValidationError("搜索词不能为空");
  if (raw.length > MAX_SEARCH_QUERY) {
    throw new ValidationError(`搜索词过长：最多 ${MAX_SEARCH_QUERY} 字（当前 ${raw.length} 字）`);
  }
  return text;
}

/**
 * types 参数归一：空 / 缺省 = 八源全查；逗号分隔、去空去重；
 * 任一项不在白名单即抛 ValidationError（非法 types / 越权源 → 400）。
 * 返回顺序固定为 SEARCH_SOURCE_TYPES 的规范顺序，便于确定性断言。
 */
export function parseSearchTypes(raw: unknown): readonly SearchSourceType[] {
  if (raw === undefined || raw === null || raw === "") return SEARCH_SOURCE_TYPES;
  if (typeof raw !== "string") throw new ValidationError("types 必须是逗号分隔的字符串");
  const requested = new Set(raw.split(",").map((s) => s.trim()).filter((s) => s !== ""));
  if (requested.size === 0) return SEARCH_SOURCE_TYPES;
  for (const type of requested) assertValidSearchSourceType(type);
  return SEARCH_SOURCE_TYPES.filter((t) => requested.has(t));
}

/** limit 守卫：缺省 20，1~50 整数，越界 → 400 */
export function parseSearchLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_SEARCH_LIMIT;
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw.trim()) : raw;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_SEARCH_LIMIT) {
    throw new ValidationError(`limit 必须是 1~${MAX_SEARCH_LIMIT} 的整数`);
  }
  return n;
}

/** 归一后的查询：原文（trim + 小写）与分词数组 */
export interface NormalizedQuery {
  readonly text: string;
  readonly tokens: readonly string[];
}

/**
 * 查询归一（r33 唯一分词口径）：
 * ① trim + 小写；②按「非字母/数字」切分，连续 CJK 与连续 ASCII 词各成一 token；
 * ③空输入返回 text="" tokens=[]（assemble 据此直接返回空结果，不抛错）。
 */
export function normalizeQuery(raw: unknown): NormalizedQuery {
  if (typeof raw !== "string") return { text: "", tokens: [] };
  const text = raw.trim().toLowerCase();
  if (text === "") return { text: "", tokens: [] };
  const tokens = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  return { text, tokens };
}

/**
 * 单字段打分（r33 唯一打分口径）：
 * 每个 query token 在该字段里前缀命中记 SEARCH_PREFIX_SCORE，包含命中记 SEARCH_CONTAINS_SCORE，
 * 二者都遵循「同一 token 只取最高一档」；累加后乘字段权重（标题 3 / 正文 1）。
 * 因 3×5 > 1×10，任何标题命中都严格高于任何正文命中；前缀恒高于包含。
 * 字段里一个 token 都没命中则该字段记 0。
 */
export function scoreMatch(
  query: NormalizedQuery | string,
  text: string,
  fieldWeight: number = SEARCH_BODY_WEIGHT,
): number {
  const q = typeof query === "string" ? normalizeQuery(query) : query;
  if (q.tokens.length === 0 || typeof text !== "string") return 0;
  const lower = text.toLowerCase();
  let base = 0;
  for (const token of q.tokens) {
    if (lower.startsWith(token)) base += SEARCH_PREFIX_SCORE;
    else if (lower.includes(token)) base += SEARCH_CONTAINS_SCORE;
  }
  return base * fieldWeight;
}

/** 高亮分段（web 只渲染，切分规则在 shared，零算法分支） */
export interface HighlightSegment {
  readonly text: string;
  readonly hit: boolean;
}

/**
 * 命中高亮切分：按 query tokens 在原文里定位（大小写不敏感），重叠区间合并，
 * 未命中区间原样保留。空查询返回单段 hit=false（不高亮）。
 */
export function splitSearchHighlight(text: string, query: NormalizedQuery | string): HighlightSegment[] {
  const q = typeof query === "string" ? normalizeQuery(query) : query;
  if (typeof text !== "string" || text === "" || q.tokens.length === 0) {
    return [{ text: typeof text === "string" ? text : "", hit: false }];
  }
  const lower = text.toLowerCase();
  const spans: { start: number; end: number }[] = [];
  for (const token of q.tokens) {
    let from = 0;
    while (from <= lower.length - token.length) {
      const at = lower.indexOf(token, from);
      if (at < 0) break;
      spans.push({ start: at, end: at + token.length });
      from = at + token.length;
    }
  }
  if (spans.length === 0) return [{ text, hit: false }];
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  const out: HighlightSegment[] = [];
  let cursor = 0;
  for (const span of merged) {
    if (span.start > cursor) out.push({ text: text.slice(cursor, span.start), hit: false });
    out.push({ text: text.slice(span.start, span.end), hit: true });
    cursor = span.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false });
  return out;
}

/** 检索候选（api 从真实表行装配，只给标题与正文两字段，算法全在 shared） */
export interface SearchCandidate {
  readonly id: number;
  readonly title: string;
  readonly snippet?: string;
}

/** 单源输入：类型 + 该源候选集 */
export interface SearchSourceInput {
  readonly type: SearchSourceType;
  readonly items: readonly SearchCandidate[];
}

/** 统一结果契约（api 原样下发，web 按 type 分组渲染） */
export interface SearchResult {
  readonly type: SearchSourceType;
  readonly id: number;
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
  readonly tab: string;
  readonly deepLink: string;
}

/** 直达链接（r26 deep-link 同款：page + 实体 id 参数写地址栏，reload 后仍定位同一实体） */
export function buildSearchDeepLink(type: SearchSourceType, id: number): string {
  return `/?page=${SEARCH_SOURCE_TABS[type]}&${SEARCH_ID_PARAMS[type]}=${id}`;
}

/**
 * 跨源聚合唯一入口（r33 核心）：
 * ①空查询 → []；②每源独立打分（标题权重 3 / 正文权重 1），0 分淘汰；
 * ③源内按分数降序、同分按 id 升序取前 perSourceLimit 条（每源上限，防大源淹没小源）；
 * ④跨源按分数降序、同分按规范源序、再同分按 id 升序；⑤按 `type:id` 去重（保留先出现的高分）；
 * ⑥整体截 limit 条；⑦tab / deepLink 由类型映射生成，调用方零算法分支。
 * 输入只读不改（纯函数），同一输入多次调用逐字节同结果。
 */
export function assembleSearchResults(
  query: NormalizedQuery | string,
  sources: readonly SearchSourceInput[],
  options: { readonly limit?: unknown; readonly perSourceLimit?: unknown } = {},
): SearchResult[] {
  const q = typeof query === "string" ? normalizeQuery(query) : query;
  if (q.tokens.length === 0) return [];
  const limitRaw = options.limit ?? DEFAULT_SEARCH_LIMIT;
  const perRaw = options.perSourceLimit ?? DEFAULT_SEARCH_PER_SOURCE;
  const limit = Number.isInteger(limitRaw) && Number(limitRaw) > 0 ? Number(limitRaw) : DEFAULT_SEARCH_LIMIT;
  const perSource = Number.isInteger(perRaw) && Number(perRaw) > 0 ? Number(perRaw) : DEFAULT_SEARCH_PER_SOURCE;

  const collected: (SearchResult & { sourceOrder: number })[] = [];
  for (const source of sources) {
    assertValidSearchSourceType(source.type);
    const sourceOrder = SEARCH_SOURCE_TYPES.indexOf(source.type);
    const byId = new Map<number, SearchResult & { sourceOrder: number }>();
    for (const item of source.items) {
      if (!Number.isInteger(item.id)) continue;
      const titleScore = scoreMatch(q, item.title, SEARCH_TITLE_WEIGHT);
      const bodyScore = scoreMatch(q, item.snippet ?? "", SEARCH_BODY_WEIGHT);
      const score = titleScore + bodyScore;
      if (score <= 0) continue;
      const prev = byId.get(item.id);
      if (prev && prev.score >= score) continue; // 源内同 id 保留最高分（去重）
      byId.set(item.id, {
        type: source.type,
        id: item.id,
        title: item.title,
        snippet: item.snippet ?? "",
        score,
        tab: SEARCH_SOURCE_TABS[source.type],
        deepLink: buildSearchDeepLink(source.type, item.id),
        sourceOrder,
      });
    }
    const top = [...byId.values()]
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, perSource);
    collected.push(...top);
  }

  const seen = new Set<string>();
  return collected
    .sort((a, b) => b.score - a.score || a.sourceOrder - b.sourceOrder || a.id - b.id)
    .filter((r) => {
      const key = `${r.type}:${r.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ sourceOrder: _sourceOrder, ...rest }) => rest);
}
