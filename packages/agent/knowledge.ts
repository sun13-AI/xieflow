// XieFlow packages/agent/knowledge.ts — r12（M6 起步）知识库分块与检索引擎
//
// 宪法纪律：分块（按段落/字数 + 重叠窗口）与检索（TF-IDF 余弦相似度）算法
// 全部集中在本文件，纯 TS 零依赖、零 token；api 层只负责取数与装配，零算法分支。
// 契约（KnowledgeSearchChunk / KnowledgeSearchHit / KnowledgeChunkDraft）在 packages/shared；
// embedding 以可空 provider + 可空 vector 列留位，接真实向量模型只换一处注入。
import type { KnowledgeChunkDraft, KnowledgeSearchChunk, KnowledgeSearchHit } from "@xieflow/shared";

/** 缺省分块参数：每片 200 字，相邻两片重叠 40 字（重叠窗口，边界不丢字）。 */
export const DEFAULT_CHUNK_SIZE = 200;
export const DEFAULT_CHUNK_OVERLAP = 40;

export interface ChunkOptions {
  readonly chunkSize?: number;
  readonly overlap?: number;
}

/**
 * 分词口径（TF-IDF 与 token_count 共用，唯一实现）：中文逐字，英文/数字成词，
 * 大小写归一，标点与空白忽略。确定性、零依赖、零随机，waizhuan 可手算复核。
 */
export function tokenizeText(text: string): string[] {
  const tokens: string[] = [];
  const re = /[\u4e00-\u9fff]|[a-zA-Z0-9]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(text ?? ""))) !== null) {
    tokens.push(match[0].toLowerCase());
  }
  return tokens;
}

/** token_count：分块落库字段，与检索分词同一口径（可审计、可复算）。 */
export function countTokens(text: string): number {
  return tokenizeText(text).length;
}

/**
 * 文本分块：按段落（换行）优先、字数封顶切分，相邻片保留 overlap 字重叠窗口。
 * - 纯空白 → 零片；
 * - 一片装得下 → 原样一片；
 * - 超长文本按 chunkSize 滑窗，能落在段落边界时优先断在段落末尾；
 * - 去重叠拼接逐字等于原文（边界不丢字，e2e 有断言）。
 */
export function chunkText(text: string, options: ChunkOptions = {}): KnowledgeChunkDraft[] {
  const clean = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (clean === "") return [];
  const size = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_CHUNK_SIZE));
  const overlap = Math.max(0, Math.min(Math.floor(options.overlap ?? DEFAULT_CHUNK_OVERLAP), size - 1));
  const drafts: KnowledgeChunkDraft[] = [];
  let pos = 0;
  while (pos < clean.length) {
    let end = Math.min(pos + size, clean.length);
    if (end < clean.length) {
      // 优先断在窗口后 40% 内的段落边界（含换行符），否则硬切在字数上限
      const searchFrom = pos + Math.floor(size * 0.6);
      const newlineAt = clean.lastIndexOf("\n", end - 1);
      if (newlineAt >= searchFrom) end = newlineAt + 1;
    }
    const content = clean.slice(pos, end).trim();
    if (content.length > 0) {
      drafts.push({ position: drafts.length, content, tokenCount: countTokens(content) });
    }
    if (end >= clean.length) break;
    const next = end - overlap;
    pos = next > pos ? next : end; // 保证单调推进（极小 chunkSize 时放弃重叠也不死循环）
  }
  return drafts;
}

/**
 * TF-IDF 余弦相似度检索：纯本地算法，query 为空 / 语料为空 → 空命中；
 * 零分词交集不返回（score=0 过滤），按 score 降序（同分按 chunk id 升序，确定性）。
 * 返回体带 doc_id / chunk_id / source_type / source_id 来源引用，可溯源到具体 chunk。
 */
export function searchChunks(
  query: string,
  chunks: readonly KnowledgeSearchChunk[],
  limit: number = 5,
): KnowledgeSearchHit[] {
  const qTokens = tokenizeText(query);
  if (qTokens.length === 0 || chunks.length === 0) return [];
  const total = chunks.length;
  const chunkTokens = chunks.map((c) => tokenizeText(c.content));
  const df = new Map<string, number>();
  for (const toks of chunkTokens) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = (term: string): number => Math.log((1 + total) / (1 + (df.get(term) ?? 0))) + 1;

  const qTf = new Map<string, number>();
  for (const t of qTokens) qTf.set(t, (qTf.get(t) ?? 0) + 1);
  const qVec = new Map<string, number>();
  let qNormSq = 0;
  for (const [term, tf] of qTf) {
    const weight = (tf / qTokens.length) * idf(term);
    qVec.set(term, weight);
    qNormSq += weight * weight;
  }
  const qNorm = Math.sqrt(qNormSq);
  if (qNorm === 0) return [];

  const hits: KnowledgeSearchHit[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const toks = chunkTokens[i]!;
    if (toks.length === 0) continue;
    const dTf = new Map<string, number>();
    for (const t of toks) dTf.set(t, (dTf.get(t) ?? 0) + 1);
    let dot = 0;
    let dNormSq = 0;
    for (const [term, qw] of qVec) {
      const tf = dTf.get(term) ?? 0;
      if (tf > 0) dot += qw * (tf / toks.length) * idf(term);
    }
    for (const [term, tf] of dTf) {
      const w = (tf / toks.length) * idf(term);
      dNormSq += w * w;
    }
    const dNorm = Math.sqrt(dNormSq);
    if (dot <= 0 || dNorm === 0) continue;
    const src = chunks[i]!;
    hits.push({
      docId: src.docId,
      chunkId: src.id,
      position: src.position,
      content: src.content,
      docTitle: src.docTitle,
      sourceType: src.sourceType,
      sourceId: src.sourceId,
      score: dot / (qNorm * dNorm),
    });
  }
  hits.sort((a, b) => b.score - a.score || a.chunkId - b.chunkId);
  return hits.slice(0, Math.max(1, Math.floor(limit)));
}

/**
 * embedding 接口留位：缺省 provider 不产出向量（vector 列为 NULL）。
 * 接真实向量模型时实现本接口并在 api 注入即可，检索路径仍可回退 TF-IDF。
 */
export interface EmbeddingProvider {
  readonly id: string;
  embed(text: string): Promise<number[] | null>;
}
export const NO_EMBEDDING: EmbeddingProvider = {
  id: "none",
  embed: async () => null,
};
