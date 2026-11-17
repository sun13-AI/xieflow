// XieFlow packages/agent/mock-planner.ts — r10 mock 规划器 + r11 多轮上下文 / 产物生成（M5 收官）
//
// 脚本化：识别意图（shared SCRIPTED_INTENTS）→ 指代消解（读最近 N 条上下文）→ 输出工具调用
// → 真实执行 → 按 artifactType 生成产物 → 汇总。零 token、零随机、同输入恒定同输出；
// 换真实模型只需实现 Planner 接口并换 api 一处注入。
import type { XieFlowDb } from "@xieflow/db";
import {
  ValidationError,
  assertValidChatMessage,
  buildChatSummary,
  normalizeArtifactTypeRequest,
  normalizeContextWindow,
  normalizeToolCallRequest,
  planScriptedChat,
  isGeneratedArtifactType,
  isRagIntentQuery,
  extractRagQuery,
  type ArtifactType,
  type ContextResolution,
  type KnowledgeSearchHit,
  type PlannedChat,
  type PlannerContextMessage,
  type RagCitation,
  type ToolCallRecord,
} from "@xieflow/shared";
import { buildArtifactFromToolResults } from "./artifact-generators.js";
import { buildRagAnswer } from "./rag.js";
import type { ToolRegistry } from "./tool-registry.js";

export const MOCK_PLANNER_ID = "mock-scripted-v1";

/** provider 无关的规划器契约（api 一处注入，M5 接真实模型不改路由） */
export interface Planner {
  readonly id: string;
  plan(message: string, context?: readonly PlannerContextMessage[]): PlannedChat | Promise<PlannedChat>;
}

/** mock 规划器：纯函数包装 shared 脚本规则表（上下文可选，r10 调用方零改动） */
export const mockPlanner: Planner = {
  id: MOCK_PLANNER_ID,
  plan: (message: string, context?: readonly PlannerContextMessage[]) => planScriptedChat(message, context),
};

export interface ChatExecution {
  readonly intent: string;
  readonly toolCalls: readonly ToolCallRecord[];
  readonly summary: string;
  readonly artifact: {
    readonly type: ArtifactType;
    readonly title: string;
    readonly content: string;
  };
  /** 本次实际采用的上下文窗口大小（默认 8） */
  readonly contextWindow: number;
  /** 命中跨轮指代时的可审计元数据（未命中不出现） */
  readonly resolution?: ContextResolution;
  /** r13：RAG 回答附带的引用清单（非 RAG 对话不出现） */
  readonly citations?: readonly RagCitation[];
  /** r13：RAG 编排元数据（augmented prompt / 命中数 / 无命中标记） */
  readonly rag?: { readonly augmentedPrompt: string; readonly hitCount: number; readonly noHit: boolean };
}

export interface ExecuteChatOptions {
  /** 会话最近 N 条消息（来自真实落库，由 api 按 context_window 截取） */
  readonly context?: readonly PlannerContextMessage[];
  /** 上下文窗口大小；超限抛 ValidationError → HTTP 400 */
  readonly contextWindow?: unknown;
  /** 产物类型：缺省 chat-result；三类生成类型走对应生成器；非法 → HTTP 400 */
  readonly artifactType?: unknown;
  /** 显式工具调用覆盖规划结果（供 HTTP 层 4xx：未知工具 / 非法参数；正常对话不传） */
  readonly toolCalls?: unknown;
}

/**
 * 规划 → 执行 → 汇总 → 产物。关键纪律：
 * ① 先整体归一所有工具调用（未知工具 / 非法参数立即抛错），再执行任何 handler → 无半态；
 * ② 每条工具调用都产生一条带 id/name/arguments/ok/summary 的回执，供 api 逐条落库；
 * ③ 汇总文案与产物内容都由 shared / artifact-generators 口径拼装，不含随机/id 时间戳，可录制回放。
 */
export async function executeChat(
  db: XieFlowDb,
  registry: ToolRegistry,
  planner: Planner,
  message: string,
  options: ExecuteChatOptions = {},
): Promise<ChatExecution> {
  assertValidChatMessage(message);
  const contextWindow = normalizeContextWindow(options.contextWindow);
  const artifactType = normalizeArtifactTypeRequest(options.artifactType);
  const plan = await planner.plan(message, options.context);
  const rawCalls = options.toolCalls === undefined ? plan.toolCalls : options.toolCalls;
  if (!Array.isArray(rawCalls)) {
    throw new ValidationError("toolCalls 必须是数组");
  }
  // 先整体校验（零半态）：任何一条非法都不执行前面的 handler
  // r13：RAG 意图先真检索（唯一工具），再按命中生成带 [n] 引用的回答；
  //     显式 toolCalls 覆盖（HTTP 4xx 探针）不走 RAG 分支，保持 r10/r12 行为不变。
  const ragIntent = options.toolCalls === undefined && isRagIntentQuery(message);
  const calls = ragIntent
    ? [normalizeToolCallRequest({ name: "search_knowledge", arguments: { query: extractRagQuery(message) } })]
    : rawCalls.map((raw) => normalizeToolCallRequest(raw));
  const intent = ragIntent ? "search_knowledge" : plan.intent;

  const results = [];
  for (const call of calls) {
    results.push(await registry.execute(db, call.name, call.arguments));
  }

  const toolCalls: ToolCallRecord[] = results.map((result, index) => ({
    id: `tc-${index + 1}`,
    name: result.name,
    arguments: calls[index]!.arguments,
    ok: result.ok,
    summary: result.summary,
    data: result.data,
    ...(result.error === undefined ? {} : { error: result.error }),
  }));

  const baseSummary = buildChatSummary(intent, results);
  let summary = baseSummary;
  let citations: readonly RagCitation[] | undefined;
  let ragMeta: ChatExecution["rag"];
  if (ragIntent) {
    const searchResult = results.find((r) => r.name === "search_knowledge" && r.ok);
    const hits = (searchResult?.data as { results?: readonly KnowledgeSearchHit[] } | null)?.results ?? [];
    const rag = buildRagAnswer(message, hits);
    summary = rag.answer;
    citations = rag.citations;
    ragMeta = { augmentedPrompt: rag.augmentedPrompt, hitCount: rag.hitCount, noHit: rag.noHit };
  }
  const artifact = isGeneratedArtifactType(artifactType)
    ? buildArtifactFromToolResults(artifactType, { intent, message, toolCalls, summary, citations })
    : {
        type: artifactType,
        title: `对话产物 · ${intent}`,
        content: JSON.stringify({ intent, message, tools: toolCalls, summary, ...(citations ? { citations } : {}) }),
      };
  return {
    intent,
    toolCalls,
    summary,
    artifact,
    contextWindow,
    ...(plan.resolution ? { resolution: plan.resolution } : {}),
    ...(citations ? { citations } : {}),
    ...(ragMeta ? { rag: ragMeta } : {}),
  };
}
