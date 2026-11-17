// XieFlow packages/agent — AI 能力包（r9：mock provider + 录制回放评测集骨架）
// 契约（RevisionProvider / RevisionRequest / RevisionSuggestion）与「采纳才改库」判定
// 全部定义在 packages/shared（宪法第七条：规则集中），本包只放 provider 实现与评测集。
export { createMockProvider, scriptedRevision, MOCK_PROVIDER_ID } from "./mock-provider.js";
export {
  RECORDED_SESSIONS,
  REVISE_EVAL_CASES,
  runReplay,
  type RecordedCall,
  type RecordedSession,
  type ReplayResult,
} from "./evals/replay.js";
