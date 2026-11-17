// XieFlow packages/agent/mock-planner.ts — r10 mock 规划器（M5 起步）
//
// 脚本化三步：识别意图（shared SCRIPTED_INTENTS）→ 输出工具调用序列 → 执行 → 汇总。
// 零 token、零随机、同输入恒定同输出；换真实模型只需实现 Planner 接口并换 api 一处注入。
import type { XieFlowDb } from "@xieflow/db";
import {
  ValidationError,
  assertValidChatMessage,
  buildChatSummary,
  normalizeToolCallRequest,
  planScriptedChat,
  type ArtifactType,
  type PlannedChat,
  type ToolCallRecord,
} from "@xieflow/shared";
import type { ToolRegistry } from "./tool-registry.js";

export const MOCK_PLANNER_ID = "mock-scripted-v1";

/** provider 无关的规划器契约（api 一处注入，M5 接真实模型不改路由） */
export interface Planner {
  readonly id: string;
  plan(message: string): PlannedChat | Promise<PlannedChat>;
}

/** mock 规划器：纯函数包装 shared 脚本规则表 */
export const mockPlanner: Planner = {
  id: MOCK_PLANNER_ID,
  plan: (message: string) => planScriptedChat(message),
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
}

export interface ExecuteChatOptions {
  /** 显式工具调用覆盖规划结果（供 HTTP 层 4xx：未知工具 / 非法参数；正常对话不传） */
  readonly toolCalls?: unknown;
}

/**
 * 规划 → 执行 → 汇总。关键纪律：
 * ① 先整体归一所有工具调用（未知工具 / 非法参数立即抛错），再执行任何 handler → 无半态；
 * ② 每条工具调用都产生一条带 id/name/arguments/ok/summary 的回执，供 api 逐条落库；
 * ③ 汇总文案与产物内容都由 shared 口径拼装，不含随机/id 时间戳，可录制回放。
 */
export async function executeChat(
  db: XieFlowDb,
  registry: ToolRegistry,
  planner: Planner,
  message: string,
  options: ExecuteChatOptions = {},
): Promise<ChatExecution> {
  assertValidChatMessage(message);
  const plan = await planner.plan(message);
  const rawCalls = options.toolCalls === undefined ? plan.toolCalls : options.toolCalls;
  if (!Array.isArray(rawCalls)) {
    throw new ValidationError("toolCalls 必须是数组");
  }
  // 先整体校验（零半态）：任何一条非法都不执行前面的 handler
  const calls = rawCalls.map((raw) => normalizeToolCallRequest(raw));

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

  const summary = buildChatSummary(plan.intent, results);
  return {
    intent: plan.intent,
    toolCalls,
    summary,
    artifact: {
      type: "chat-result",
      title: `对话产物 · ${plan.intent}`,
      content: JSON.stringify({ intent: plan.intent, message, tools: toolCalls, summary }),
    },
  };
}
