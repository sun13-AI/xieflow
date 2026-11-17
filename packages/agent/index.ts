// XieFlow packages/agent — AI 能力包（r9：mock provider + 修订回放；r10：工具注册表 + mock 规划器）
// 契约（RevisionProvider / ToolDefinition / ToolCallRecord / PlannedChat）与所有规则
// （采纳才改库 / 脚本意图 / 工具参数归一）在 packages/shared（宪法第七条），
// 本包只放 provider / planner / registry 实现与录制回放评测集。
export { createMockProvider, scriptedRevision, MOCK_PROVIDER_ID } from "./mock-provider.js";
export {
  RECORDED_SESSIONS,
  REVISE_EVAL_CASES,
  runReplay,
  type RecordedCall,
  type RecordedSession,
  type ReplayResult,
} from "./evals/replay.js";
export {
  ToolRegistry,
  createDefaultToolRegistry,
  type ToolHandler,
  type ToolHandlerResult,
  type RegisteredTool,
} from "./tool-registry.js";
export {
  mockPlanner,
  MOCK_PLANNER_ID,
  executeChat,
  type Planner,
  type ChatExecution,
  type ExecuteChatOptions,
} from "./mock-planner.js";
export { ARTIFACT_GENERATOR_LABELS } from "@xieflow/shared";
export {
  generateHtmlReport,
  generateMarkdownTable,
  generateJsonData,
  buildArtifactFromToolResults,
  type ArtifactGenerationInput,
  type ArtifactDraft,
} from "./artifact-generators.js";
export {
  TOOL_EVAL_CASES,
  RAG_EVAL_CASES,
  runToolReplay,
  freshReplayDb,
  type RecordedToolCase,
  type ToolReplayResult,
} from "./evals/tool-replay.js";
export {
  chunkText,
  searchChunks,
  tokenizeText,
  countTokens,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
  NO_EMBEDDING,
  type ChunkOptions,
  type EmbeddingProvider,
} from "./knowledge.js";
export {
  retrieve,
  buildAugmentedPrompt,
  citationsFromHits,
  buildRagAnswer,
  type RagRetrieval,
  type RagAnswer,
} from "./rag.js";
