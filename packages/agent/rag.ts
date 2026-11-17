// XieFlow packages/agent/rag.ts — r13（M6 收官）RAG 编排与引用溯源
//
// 纪律：检索仍只调 knowledge.ts 的纯函数 searchChunks（api 零算法分支），本文件只做
// 「取数 → 注入上下文 → 生成带引用标记的回答 → 输出 citations 清单」的装配。
// 零 token、零随机、同输入恒定同输出；无命中如实说「知识库没有相关内容」，绝不编造。
import type { XieFlowDb } from "@xieflow/db";
import {
  RAG_NO_HIT_ANSWER,
  RAG_SNIPPET_LENGTH,
  type KnowledgeSearchHit,
  type RagCitation,
} from "@xieflow/shared";
import { searchChunks } from "./knowledge.js";

export interface RagRetrieval {
  readonly query: string;
  readonly limit: number;
  readonly hits: readonly KnowledgeSearchHit[];
  readonly count: number;
}

/** 取数：真实 db 的全部检索源块 → 交给集中检索纯函数；api/planner 不重复实现算法。 */
export function retrieve(db: XieFlowDb, query: string, limit = 5): RagRetrieval {
  const hits = searchChunks(query, db.listKnowledgeChunksForSearch(), limit);
  return { query, limit, hits, count: hits.length };
}

/**
 *  augmented prompt：把命中按 [n] 编号注入上下文（snippet + 来源 + score），
 *  同命中同顺序逐字节确定，可录制回放；无命中时明确写「无可用上下文」。
 */
export function buildAugmentedPrompt(question: string, chunks: readonly KnowledgeSearchHit[]): string {
  const lines = chunks.map((hit, i) =>
    `[${i + 1}] doc #${hit.docId} / chunk #${hit.chunkId} (${hit.docTitle}, score ${hit.score.toFixed(6)}): ${hit.content.slice(0, RAG_SNIPPET_LENGTH)}`,
  );
  return [
    "你是协流知识库问答助手，只能依据下列检索片段回答；引用请写 [序号]。",
    `问题：${question}`,
    "检索上下文：",
    ...(lines.length > 0 ? lines : ["（无可用上下文：知识库没有相关内容）"]),
    "回答：",
  ].join("\n");
}

/** 命中 → 引用清单（四要件 + 展示字段），snippet 逐字取自真实 chunk，零编造。 */
export function citationsFromHits(hits: readonly KnowledgeSearchHit[]): RagCitation[] {
  return hits.map((hit) => ({
    docId: hit.docId,
    chunkId: hit.chunkId,
    snippet: hit.content.slice(0, RAG_SNIPPET_LENGTH),
    score: hit.score,
    docTitle: hit.docTitle,
    position: hit.position,
  }));
}

export interface RagAnswer {
  readonly answer: string;
  readonly citations: readonly RagCitation[];
  readonly augmentedPrompt: string;
  readonly hitCount: number;
  readonly noHit: boolean;
}

/**
 * 回答生成（mock，零 token）：有命中时按 [n] 注入真实片段与来源；无命中时如实说
 * 「知识库没有相关内容」并给空引用清单——这两条都是 e2e/audit/变异红相守卫点。
 */
export function buildRagAnswer(question: string, hits: readonly KnowledgeSearchHit[]): RagAnswer {
  const citations = citationsFromHits(hits);
  const augmentedPrompt = buildAugmentedPrompt(question, hits);
  if (citations.length === 0) {
    return {
      answer: `${RAG_NO_HIT_ANSWER}，无法回答「${question}」。请先在「知识库」页入库相关文档。`,
      citations: [],
      augmentedPrompt,
      hitCount: 0,
      noHit: true,
    };
  }
  const top = citations[0]!;
  const answer = [
    `根据知识库检索结果回答「${question}」：`,
    `[1] ${top.docTitle}（chunk #${top.chunkId}，相关度 ${top.score.toFixed(4)}）：${top.snippet}`,
    citations.length > 1
      ? `另有 ${citations.length - 1} 条来源见下方引用卡片，请以引用内容为准。`
      : "请以上述引用内容为准。",
  ].join("\n");
  return { answer, citations, augmentedPrompt, hitCount: citations.length, noHit: false };
}
