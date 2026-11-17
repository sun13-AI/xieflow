// XieFlow packages/agent/mock-provider.ts — r9 AI 块级修订的 mock 模型（固定脚本化回复，零 token）
//
// 设计要点（宪法第四条：M5 起 agent 工具调用行为用录制回放评测集锁定；本轮先立骨架）：
// ① 实现 shared 的 RevisionProvider 契约（provider 无关）——M5 接真实模型只需换掉这个实现，
//    api / web / shared 三层一行不改；
// ② 固定脚本化回复：按 instruction 关键字命中只读规则表，纯字符串变换，
//    不联网、不调 LLM、不消耗 token、无随机性（同输入恒定同输出），可录制回放；
// ③ 回复带 provider 标识与可读理由，供 UI diff 面板展示「为什么这么改」。

import type {
  RevisionProvider,
  RevisionRequest,
  RevisionSuggestion,
} from "@xieflow/shared";

/** mock 模型版本标识（录制回放用例锁定此标识；换真实模型时改这里即可） */
export const MOCK_PROVIDER_ID = "mock-scripted-v1";

interface ScriptRule {
  readonly name: string;
  readonly keywords: readonly string[];
  readonly rationale: string;
  readonly apply: (originalText: string, instruction: string) => string;
}

/** 固定脚本规则表：命中第一个关键字集合即套用；无命中走默认润色规则 */
const SCRIPT_RULES: readonly ScriptRule[] = [
  {
    name: "shorten",
    keywords: ["精简", "缩短", "简练", "简洁", "压缩"],
    rationale: "脚本规则 shorten：去掉尾部冗余，保留首句主干并标注（精简稿）",
    apply: (text) => {
      const head = text.split(/[。！？!?；;]/)[0] ?? text;
      return `${head || text}（精简稿）`;
    },
  },
  {
    name: "expand",
    keywords: ["扩写", "展开", "详细", "补充"],
    rationale: "脚本规则 expand：在原文后追加一句固定说明",
    apply: (text) => `${text}。补充说明：以上要点将在后续版本细化。`,
  },
  {
    name: "bulletize",
    keywords: ["列表", "要点", "分点", "条目化"],
    rationale: "脚本规则 bulletize：按顿号/逗号拆成条目",
    apply: (text) =>
      text
        .split(/[、,，;；]/)
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .map((part) => `- ${part}`)
        .join("\n"),
  },
  {
    name: "formalize",
    keywords: ["正式", "书面", "规范", "润色"],
    rationale: "脚本规则 formalize：加固定的书面语前缀",
    apply: (text) => `经审慎评估，${text}`,
  },
];

/** 默认规则：未命中任何关键字时的确定性润色（追加 mock 标记，便于 diff 对照） */
function defaultSuggestion(originalText: string, instruction: string): string {
  return `${originalText}（已按「${instruction}」修订·mock）`;
}

/** 纯函数：给定请求 → 固定建议（无副作用、无 IO、无随机） */
export function scriptedRevision(request: RevisionRequest): RevisionSuggestion {
  const instruction = request.instruction.trim();
  const rule = SCRIPT_RULES.find((r) => r.keywords.some((k) => instruction.includes(k)));
  return {
    suggestedText: rule
      ? rule.apply(request.originalText, instruction)
      : defaultSuggestion(request.originalText, instruction),
    rationale: rule ? rule.rationale : "脚本规则 default：追加带指令标签的修订标记（未命中专用规则）",
    provider: MOCK_PROVIDER_ID,
  };
}

/** 构造 mock provider（接口 provider 无关：返回 shared 的 RevisionProvider 契约） */
export function createMockProvider(): RevisionProvider {
  return {
    id: MOCK_PROVIDER_ID,
    propose: (request: RevisionRequest) => scriptedRevision(request),
  };
}
