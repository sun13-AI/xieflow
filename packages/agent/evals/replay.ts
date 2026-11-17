// XieFlow packages/agent/evals — 录制回放评测集骨架（r9 立骨架，M5 起锁工具调用行为）
//
// 宪法第四条第 5 款：「agent 工具调用行为（M5 起）用录制回放评测集锁定」。
// 本轮先把「录制 → 回放 → 断言」三段式骨架立起来，作用于 r9 的 mock provider：
//  - RECORDED_SESSIONS：录制的调用会话（输入 revision + 期望输出 suggestion），
//    纯数据、可入库、可 diff 审阅；真实模型接入后，录制内容换成真实工具调用轨迹；
//  - runReplay：回放器，把录制输入重新喂给 provider，逐条比对期望输出，返回通过/失败清单；
//  - e2e 断言锁定：回放全绿 + 故意写错的期望必须被检出（防止评测集退化成恒真占位）。

import type {
  RevisionProvider,
  RevisionRequest,
} from "@xieflow/shared";

/** 一条录制的调用（输入 + 期望的整条回复，逐字段比对） */
export interface RecordedCall {
  readonly name: string;
  readonly request: RevisionRequest;
  readonly expected: {
    readonly suggestedText: string;
    readonly rationale: string;
    readonly provider: string;
  };
}

/** 录制会话（M5 扩为多步工具调用轨迹；本轮为单步 revision） */
export interface RecordedSession {
  readonly id: string;
  readonly description: string;
  readonly calls: readonly RecordedCall[];
}

export const RECORDED_SESSIONS: readonly RecordedSession[] = [
  {
    id: "revise-basic-001",
    description: "基础修订：精简 / 扩写 / 要点 / 正式 / 默认 五类脚本规则各一条",
    calls: [
      {
        name: "shorten: 精简首句",
        request: { instruction: "精简", blockType: "paragraph", originalText: "这段文字太长了。后面还有一句冗余说明。" },
        expected: {
          suggestedText: "这段文字太长了（精简稿）",
          rationale: "脚本规则 shorten：去掉尾部冗余，保留首句主干并标注（精简稿）",
          provider: "mock-scripted-v1",
        },
      },
      {
        name: "expand: 追加说明",
        request: { instruction: "扩写", blockType: "paragraph", originalText: "方案概述" },
        expected: {
          suggestedText: "方案概述。补充说明：以上要点将在后续版本细化。",
          rationale: "脚本规则 expand：在原文后追加一句固定说明",
          provider: "mock-scripted-v1",
        },
      },
      {
        name: "bulletize: 顿号拆条目",
        request: { instruction: "整理成要点列表", blockType: "paragraph", originalText: "需求梳理、接口联调、回归测试" },
        expected: {
          suggestedText: "- 需求梳理\n- 接口联调\n- 回归测试",
          rationale: "脚本规则 bulletize：按顿号/逗号拆成条目",
          provider: "mock-scripted-v1",
        },
      },
      {
        name: "formalize: 书面语前缀",
        request: { instruction: "改得更正式一些", blockType: "heading2", originalText: "本周进展" },
        expected: {
          suggestedText: "经审慎评估，本周进展",
          rationale: "脚本规则 formalize：加固定的书面语前缀",
          provider: "mock-scripted-v1",
        },
      },
      {
        name: "default: 未命中专用规则",
        request: { instruction: "换个说法", blockType: "quote", originalText: "引用原文" },
        expected: {
          suggestedText: "引用原文（已按「换个说法」修订·mock）",
          rationale: "脚本规则 default：追加带指令标签的修订标记（未命中专用规则）",
          provider: "mock-scripted-v1",
        },
      },
    ],
  },
];

/** 展平为评测用例清单（回放器消费） */
export const REVISE_EVAL_CASES: readonly RecordedCall[] = RECORDED_SESSIONS.flatMap((s) => s.calls);

export interface ReplayResult {
  total: number;
  passed: number;
  failures: string[];
}

/**
 * 回放：把录制输入重新喂给 provider（propose 允许同步或异步），逐条比对
 * suggestedText / rationale / provider 三个字段，返回通过数与失败清单。
 * 非恒真：期望写错或 provider 行为漂移都会进 failures。
 */
export async function runReplay(
  provider: RevisionProvider,
  cases: readonly RecordedCall[] = REVISE_EVAL_CASES,
): Promise<ReplayResult> {
  const failures: string[] = [];
  let passed = 0;
  for (const c of cases) {
    const actual = await provider.propose(c.request);
    const same =
      actual.suggestedText === c.expected.suggestedText &&
      actual.rationale === c.expected.rationale &&
      actual.provider === c.expected.provider;
    if (same) {
      passed += 1;
    } else {
      failures.push(
        `${c.name}: got ${JSON.stringify(actual)} want ${JSON.stringify(c.expected)}`,
      );
    }
  }
  return { total: cases.length, passed, failures };
}
