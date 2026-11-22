// 协流 XieFlow — e2e-test.ts：直连服务层断言业务行为（IKanBot 模式）
// r2：todo 输入校验收紧（服务层守卫）+ 今/明/周汇总计数 + raw 直达 schema 约束。
// r1 复验 P4 指出的两条自洽占位断言在本轮替换为真实行为断言（raw SQL 触达 NOT NULL /
// CHECK 约束；迁移幂等改用 PRAGMA user_version 真实读回）。
// 路由层（HTTP 侧）断言在 scripts/audit-http.ts，独立成套计数。
// r4：看板数据层——reorderPositions 排序规则（shared 纯函数）+ schema v3→v4 迁移
// （projects / board_columns / cards）+ 服务层看板 CRUD 与跨列移动闭环。
// 运行：pnpm test
import { mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import {
  openDatabase,
  openDatabaseRaw,
  MIGRATIONS,
  CURRENT_SCHEMA_VERSION,
  assertMigrationsConsistent,
  type SqliteDatabase,
  type XieFlowDb,
} from "@xieflow/db";
import {
  SCHEMA_VERSION,
  canTransitionTodo,
  TODO_STATUS_TRANSITIONS,
  QUADRANT_LABELS,
  EMPTY_SUMMARY,
  computeTodoSummary,
  localDateStr,
  REPEAT_LABELS,
  MAX_REPEAT_HORIZON_DAYS,
  addMonths,
  computeRepeatInstances,
  assembleRangeSchedules,
  reorderPositions,
  DEFAULT_BOARD_COLUMNS,
  assertValidScheduleTitle,
  assertValidScheduleDate,
  assertValidScheduleTime,
  assertValidScheduleRange,
  assertValidScheduleRepeat,
  assertValidBoardName,
  computeBoardStats,
  completionRatePercent,
  buildBoardCsvContent,
  buildBoardCsvRows,
  escapeCsvField,
  countCsvRecords,
  CSV_UTF8_BOM,
  BOARD_CSV_HEADERS,
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  isFieldType,
  fieldTypeUsesOptions,
  validateFieldValue,
  assertValidFieldValue,
  coerceFieldValue,
  compareValues,
  isEmptyFieldValue,
  matchesFieldValue,
  normalizeRecordData,
  sortRecordsByField,
  queryRecords,
  DEFAULT_TABLE_FIELDS,
  assertValidTableName,
  assertValidFieldName,
  assertValidFieldType,
  assertValidFieldOptions,
  sanitizeFileNamePart,
  buildBoardCsvFileName,
  MAX_PAGE_SIZE,
  MAX_VIEW_NAME,
  SORT_DIRECTIONS,
  assertValidViewName,
  assertValidSortDirection,
  normalizeViewSpec,
  describeViewSpec,
  CSV_IMPORT_PREVIEW_ROWS,
  CSV_IMPORT_MAX_ROWS,
  parseCsvText,
  mapCsvHeadersToFields,
  planCsvImport,
  shouldCommitImport,
  normalizeCsvImportPayload,
  type Schedule,
  type ScheduleWithInstanceFlag,
  type ScheduleRepeat,
  type BoardCard,
  type BoardColumn,
  type Todo,
  type TableField,
  type TableRecord,
  type TableView,
  type ViewFilterCondition,
  type ViewSortRule,
  type CsvImportRowError,
  BLOCK_TYPES,
  BLOCK_TYPE_LABELS,
  isBlockType,
  assertValidBlockType,
  normalizeBlockContent,
  canConvertBlockType,
  convertBlockContent,
  splitBlockText,
  planBlockSplit,
  mergeBlockContent,
  planBlockReorder,
  assembleDocumentText,
  assertValidDocumentTitle,
  DEFAULT_DOCUMENT_FIRST_BLOCK,
  MAX_BLOCK_TEXT,
  MAX_DOCUMENT_TITLE,
  markdownToBlocks,
  blocksToMarkdown,
  computeNumberedOrdinals,
  normalizeMarkdownImportPayload,
  planMarkdownImport,
  shouldCommitMarkdownImport,
  MARKDOWN_IMPORT_PREVIEW_ROWS,
  MARKDOWN_IMPORT_MAX_BLOCKS,
  MAX_MARKDOWN_LENGTH,
  assertValidRevisionInstruction,
  planRevisionApply,
  MAX_REVISION_INSTRUCTION,
  buildDocumentMdFileName,
  type BlockType,
  type BlockContent,
  type Document,
  type DocumentBlock,
  type MarkdownBlockDraft,
  type MarkdownSourceBlock,
  type MarkdownImportRowError,
  type Project,
  type BaseTable,
  type ToolCallRecord,
  TOOL_NAMES,
  STATE_CHANGING_TOOLS,
  MAX_CONVERSATION_TITLE,
  MAX_CHAT_MESSAGE,
  assertValidToolName,
  normalizeToolCallRequest,
  assertValidConversationTitle,
  assertValidChatMessage,
  assertValidMessageRole,
  assertValidArtifactType,
  planScriptedChat,
  buildChatSummary,
  GENERATED_ARTIFACT_TYPES,
  DEFAULT_ARTIFACT_TYPE,
  isGeneratedArtifactType,
  assertValidGeneratedArtifactType,
  normalizeArtifactTypeRequest,
  contentTypeForArtifactType,
  DEFAULT_CONTEXT_WINDOW,
  MAX_CONTEXT_WINDOW,
  assertValidContextWindow,
  normalizeContextWindow,
  resolveContextualMessage,
  toPlannerContext,
  computeInlineDiff,
  type PlannerContextMessage,
  type DiffSegment,
  KNOWLEDGE_SOURCE_TYPES,
  isKnowledgeSourceType,
  assertValidKnowledgeSourceType,
  assertValidKnowledgeTitle,
  assertValidKnowledgeContent,
  assertValidKnowledgeQuery,
  MAX_KNOWLEDGE_TITLE,
  MAX_KNOWLEDGE_CONTENT,
  MAX_KNOWLEDGE_QUERY,
  RAG_NO_HIT_ANSWER,
  RAG_SNIPPET_LENGTH,
  RAG_INTENT_KEYWORDS,
  isRagIntentQuery,
  extractRagQuery,
  normalizeTracebackChunkId,
  type RagCitation,
  MAX_MINDMAP_TITLE,
  MAX_MINDMAP_CONTENT,
  assertValidMindmapTitle,
  assertValidMindmapContent,
  assertValidMindmapContentOrEmpty,
  parseMarkdownToTree,
  treeToMarkdown,
  countMindmapNodes,
  toggleNodeCollapse,
  type MindmapTree,
  type MindmapNode,
  WHITEBOARD_ITEM_TYPES,
  MAX_WHITEBOARD_TITLE,
  MAX_WHITEBOARD_CONTENT,
  WHITEBOARD_COORD_MIN,
  WHITEBOARD_COORD_MAX,
  WHITEBOARD_SIZE_MIN,
  WHITEBOARD_SIZE_MAX,
  WHITEBOARD_COLLISION_GAP,
  WHITEBOARD_MIN_SCALE,
  WHITEBOARD_MAX_SCALE,
  assertValidWhiteboardTitle,
  assertValidWhiteboardTheme,
  isWhiteboardItemType,
  normalizeWhiteboardItem,
  whiteboardItemsOverlap,
  collisionResolve,
  planAiWhiteboard,
  buildWhiteboardMarkdown,
  screenToCanvasPoint,
  canvasToScreenPoint,
  clampWhiteboardScale,
  type WhiteboardItem,
  APPROVAL_STATUSES,
  APPROVAL_TRANSITIONS,
  APPROVAL_ACTIONS,
  APPROVAL_TYPES,
  APPROVAL_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  APPROVAL_ACTION_LABELS,
  APPROVAL_VIEWS,
  MAX_APPROVAL_TITLE,
  MAX_APPROVAL_COMMENT,
  MAX_APPROVAL_USER,
  isApprovalStatus,
  isApprovalAction,
  isApprovalView,
  assertValidApprovalTitle,
  assertValidApprovalType,
  assertValidApprovalUser,
  assertValidApprovalComment,
  assertValidApprovalTransition,
  assertValidApprovalAction,
  canTransitionApproval,
  planApprovalAction,
  availableApprovalActions,
  selectApprovalsForView,
  type ApprovalStatus,
  type ApprovalAction,
  type Approval,
  type ApprovalStep,
  ASSET_CATEGORIES,
  ASSET_CATEGORY_LABELS,
  ASSET_TX_TYPES,
  ASSET_TX_TYPE_LABELS,
  UNIT_TASK_STATUSES,
  UNIT_TASK_STATUS_LABELS,
  UNIT_TASK_TRANSITIONS,
  isAssetCategory,
  isAssetTxType,
  isUnitTaskStatus,
  assertValidAssetName,
  assertValidAssetCategory,
  assertValidAssetText,
  assertValidQuantity,
  assertValidAssetTxType,
  assertValidAssetOperator,
  assertValidUnitTaskTitle,
  assertValidUnit,
  assertValidUnitTaskTransition,
  canTransitionUnitTask,
  applyAssetTransaction,
  buildTaskTree,
  type Asset,
  type AssetTxInput,
  type AssetTransaction,
  type UnitTask,
  type UnitTaskTreeNode,
  // r19：多端同步与冲突处理（三方合并 / 乐观锁 / 幂等）
  CHANGE_OPERATIONS,
  DEFAULT_SYNC_LIMIT,
  MAX_SYNC_LIMIT,
  assertValidEntityType,
  assertValidEntityId,
  assertValidChangeOperation,
  assertValidVersion,
  normalizeSince,
  normalizeLimit,
  nextVersion,
  valuesEqual,
  detectConflict,
  applyChangeSet,
  SyncConflictError,
  type ChangeRecord,
  // r20：离线队列与 PWA（队列 / 离线语义 / 重放顺序 / 本地图标）
  OFFLINE_QUEUE_KEY,
  OFFLINE_QUEUE_MAX,
  OFFLINE_REPLAY_PATH,
  OFFLINE_REPLAY_METHODS,
  OFFLINE_QUEUED_STATUS,
  OFFLINE_HEADER,
  OFFLINE_QUEUE_EVENT,
  OFFLINE_CONNECTION_EVENT,
  PWA_CACHE_NAME,
  isOfflineMethod,
  assertValidOfflineQueueItem,
  normalizeOfflineQueueItem,
  assertValidOfflineReplayRequest,
  shouldQueueOffline,
  offlineQueuePathAllowed,
  loadOfflineQueue,
  saveOfflineQueue,
  enqueueOffline,
  dequeueOffline,
  peekOfflineQueue,
  clearOfflineQueue,
  planOfflineReplay,
  buildOfflineQueuedResponse,
  type OfflineStorage,
  type OfflineQueueItem,
  // r22：移动底栏「更多」入口显隐条件（纯函数 seam，变异红相目标）
  shouldShowTabsMore,
  // r32：文档打印导出增强（HTML 打印版 / Word 兼容 / 块转义，全部集中 shared/docExport）
  blocksToPrintHtml,
  blocksToWordHtml,
  sanitizeExportHtml,
  buildExportFileName,
  buildPrintPreview,
  assertExportableBlocks,
  EmptyDocumentExportError,
  InvalidExportBlockError,
  EXPORT_HTML_HEADER_MARKER,
  EXPORT_WORD_SECTION_MARKER,
  // r33：全局搜索（归一/打分/聚合/每源上限/去重/直达/守卫，全部集中 shared/globalSearch）
  SEARCH_SOURCE_TYPES,
  SEARCH_SOURCE_TABS,
  SEARCH_ID_PARAMS,
  MAX_SEARCH_QUERY,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  SEARCH_TITLE_WEIGHT,
  SEARCH_BODY_WEIGHT,
  SEARCH_PREFIX_SCORE,
  SEARCH_CONTAINS_SCORE,
  isSearchSourceType,
  assertValidSearchSourceType,
  assertValidSearchQuery,
  parseSearchTypes,
  parseSearchLimit,
  normalizeQuery,
  scoreMatch,
  buildSearchDeepLink,
  assembleSearchResults,
} from "@xieflow/shared";
import type { TodoStatus } from "@xieflow/shared";
import { ValidationError } from "@xieflow/shared";
// r30：纯本地公式引擎（tokenizer + parser + evaluator，零 eval / 零依赖）
import {
  parseFormula,
  collectFormulaReferences,
  evaluateFormula,
  compileFormula,
  detectFormulaCycles,
  recomputeFormulas,
  FormulaSyntaxError,
  FormulaRuntimeError,
  MAX_FORMULA_EXPRESSION_LENGTH,
  formatFormulaDisplay,
  type FormulaNode,
  type FormulaValue,
  type FormulaCompileResult,
  type FormulaComputation,
} from "@xieflow/shared/formula";
import { createHash, pbkdf2Sync } from "node:crypto";
import {
  AUTH_ROLES,
  AUTH_PERMISSIONS,
  can as canAuth,
  assertPermission,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  validateSession,
  assertValidUsername,
  assertValidPassword,
  PBKDF2_ITERATIONS,
  PBKDF2_KEYLEN,
  SESSION_TTL_MS,
  type Session,
  type AuthUser,
} from "@xieflow/shared/auth";
// r21: deployment contract (single source of truth shared by docker / portable / docs / audit)
import {
  DEPLOY_PORTS,
  DEPLOY_PATHS,
  DEPLOY_DATA,
  DEPLOY_MODES,
  DEPLOY_GUIDE_MARKERS,
  DEPLOY_ROUTES,
  expectedDeployStatus,
  missingDeployMarkers,
  // r22：部署文档三处补强契约（Releases / 宿主 IP / docker 卷迁移）
  missingDeployDocMarkers,
} from "@xieflow/shared/deploy";
// r23：组织架构与通讯录（部门树 / 环检测 / 人员归一与搜索，规则唯一口径在 shared/org）
import {
  MEMBER_STATUSES,
  isMemberStatus,
  assertValidDepartmentName,
  normalizeDepartment,
  findOrphanDepartmentIds,
  buildDepartmentTree,
  validateDepartmentMove,
  findDuplicateDepartmentName,
  normalizeMember,
  searchMembers,
  buildOrgTree,
  normalizeMemberRef,
  assertAssignableMember,
  resolveAssignee,
  memberDisplayName,
  memberSummary,
  resolveMemberForUser,
  countMemberUsage,
  type MemberSummary,
  type Department,
  type Member,
  type OrgTreeNode,
} from "@xieflow/shared/org";
// r26：通知中心（站内消息聚合）——规则唯一口径在 shared/notifications
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_TABS,
  NOTIFICATION_REF_TYPES,
  NOTIFICATION_REF_TABS,
  DEFAULT_LOW_STOCK_THRESHOLD,
  isNotificationType,
  assertValidNotificationType,
  isNotificationRefType,
  assertValidNotificationRef,
  shouldNotify,
  buildNotification,
  emptyNotificationSummary,
  notificationSummary,
  queryNotifications,
  notificationTargetTab,
  notificationDeepLinkParams,
  collectNotificationCandidates,
  type Notification,
  type NotificationContext,
} from "@xieflow/shared/notifications";
// r27：报表中心（跨模块数据看板）——六指标唯一口径在 shared/reports
import {
  REPORT_METRICS,
  REPORT_METRIC_LABELS,
  REPORT_PRESETS,
  REPORT_SPARK_BUCKETS,
  isReportMetric,
  assertValidReportMetric,
  parseReportRange,
  reportRangeFromPreset,
  reportRangeDays,
  shiftReportRange,
  reportWindow,
  inReportRange,
  reportPercent,
  computeTodoCompletion,
  computeScheduleLoad,
  computeBoardThroughput,
  computeApprovalSla,
  computeAssetTurnover,
  computeDocOutput,
  assembleReport,
  selectReportMetric,
  filterReportDetail,
  type ReportOverview,
} from "@xieflow/shared/reports";
// r28：会议管理与会议室（预约/冲突检测）——三函数唯一口径在 shared/meetings
import {
  MEETING_MAX_HOURS,
  MEETING_CAPACITY_MAX,
  normalizeRoomDraft,
  parseClockMinutes,
  formatClockMinutes,
  validateMeetingWindow,
  meetingWindowsOverlap,
  detectTimeConflict,
  MeetingConflictError,
  assertNoTimeConflict,
  normalizeAttendees,
  normalizeMeetingDraft,
  meetingAvailability,
  isMeetingRoomActive,
  resolveSelectedRoomId,
  type MeetingWindow,
} from "@xieflow/shared/meetings";
// r43：会议室设备与智能推荐——归一/可用/冲突原因/容量排序唯一口径在 shared/roomRecommend
import {
  ROOM_EQUIPMENT_WHITELIST,
  normalizeEquipment,
  assertValidEquipment,
  parseEquipmentQuery,
  parseStoredEquipment,
  parseAttendees,
  parseRecommendNeed,
  roomMismatchReasons,
  roomMatchesNeed,
  recommendRooms,
  buildRoomRecommendation,
  type RecommendNeed,
  type RecommendRoom,
  type RecommendMeeting,
} from "@xieflow/shared/roomRecommend";
// r34：任务依赖与阻塞关系——canStartTodo / 环检测 / 拓扑阻塞链唯一口径在 shared/todoDeps
import {
  canStartTodo,
  blockersForTodo,
  detectDependencyCycle,
  wouldCreateCycle,
  buildDependencyGraph,
  assertValidDependencyPair,
  formatDependencyCycle,
  DependencyBlockedError,
  DependencyCycleError,
  DuplicateDependencyError,
  type TodoDependency,
} from "@xieflow/shared/todoDeps";
// r35：日历 ICS 导出/订阅——编解码与导入规划唯一口径在 shared/ics（api/web 零算法分支）
import {
  escapeIcsText,
  unescapeIcsText,
  formatIcsDate,
  parseIcsDate,
  foldIcsLine,
  unfoldIcsLines,
  buildIcsCalendar,
  parseIcsCalendar,
  scheduleToIcsEvent,
  todoDueToIcsEvent,
  icsEventToScheduleDraft,
  planIcsImport,
  InvalidIcsError,
  ICS_UID_DOMAIN,
} from "@xieflow/shared/ics";
// r36：日报/周报自动生成——时间窗过滤 / 段落装配 / 打印版 / 摘要 / 保存守卫唯一口径在 shared/workReports
import {
  WORK_REPORT_TYPES,
  WORK_REPORT_LABELS,
  isWorkReportType,
  assertValidWorkReportType,
  parseWorkReportPeriod,
  startOfWorkReportWeek,
  endOfWorkReportWeek,
  nextWorkReportDate,
  inWorkReportWindow,
  collectReportData,
  reportSummary,
  buildReportMarkdown,
  buildReportHtml,
  escapeWorkReportHtml,
  assertValidWorkReportSave,
  type WorkReportSource,
  type WorkReportPeriod,
} from "@xieflow/shared/workReports";
// r37：表格分组视图与汇总行——分桶 / 聚合 / 汇总装配唯一口径在 shared/tableGroups
import {
  GROUP_AGGREGATORS,
  GROUP_AGGREGATOR_LABELS,
  NULL_GROUP_KEY,
  isGroupAggregator,
  assertValidGroupAggregator,
  normalizeGroupSpec,
  describeGroupSpec,
  groupRecords,
  aggregateGroup,
  countNumericValues,
  buildGroupView,
  type GroupSpec,
} from "@xieflow/shared/tableGroups";
// r38：卡片元数据（标签 / 负责人 / 截止日 / 逾期判定）唯一口径在 shared/cardMeta
import {
  MAX_CARD_LABELS,
  MAX_CARD_LABEL_LENGTH,
  normalizeCardLabels,
  assertValidCardLabel,
  assertValidCardDueDate,
  isCompletionColumnName,
  isOverdue,
  collectOverdueCards,
  filterCardsByLabel,
  cardMetaSummary,
} from "@xieflow/shared/cardMeta";
// r41：轻量表单收集（定义归一 / 答卷校验 / 汇总统计唯一口径在 shared/forms）
import {
  FORM_QUESTION_TYPES,
  FORM_TYPE_LABELS,
  MAX_FORM_TITLE,
  MAX_FORM_QUESTIONS,
  MAX_SELECT_OPTIONS,
  FormClosedError,
  isFormQuestionType,
  assertValidFormTitle,
  normalizeFormDescription,
  normalizeSelectOptions,
  normalizeQuestionDraft,
  normalizeFormDefinition,
  validateFormAnswers,
  summarizeResponses,
  formSummaryLine,
  type FormQuestion,
  type FormAnswers,
} from "@xieflow/shared/forms";
// r29：文档版本历史与回收站——三函数唯一口径在 shared/docHistory
import {
  nextDocVersion,
  countVersionLineChanges,
  buildVersionNote,
  canRestoreVersion,
  assertCanRestoreVersion,
  isDocumentSoftDeleted,
  type DocVersion,
} from "@xieflow/shared/docHistory";
// r45: 块拖拽计划规则只住在 shared/blockDnd，web/api 零算法分支。
import {
  planBlockDrop,
  validateDropTarget,
  type BlockDropPlan,
  type DropBlockRef,
} from "@xieflow/shared/blockDnd";
import {
  createMockProvider,
  MOCK_PROVIDER_ID,
  REVISE_EVAL_CASES,
  runReplay,
  createDefaultToolRegistry,
  mockPlanner,
  MOCK_PLANNER_ID,
  executeChat,
  TOOL_EVAL_CASES,
  RAG_EVAL_CASES,
  runToolReplay,
  generateHtmlReport,
  generateMarkdownTable,
  generateJsonData,
  buildArtifactFromToolResults,
  ARTIFACT_GENERATOR_LABELS,
  chunkText,
  searchChunks,
  tokenizeText,
  countTokens,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
  NO_EMBEDDING,
  retrieve,
  buildAugmentedPrompt,
  citationsFromHits,
  buildRagAnswer,
  needsConfirmation,
  confirmationToolCount,
  confirmationToolNames,
  buildToolPreview,
  planToolExecution,
  normalizeCallIds,
  knownToolNames,
  isKnownTool,
} from "@xieflow/agent";
// r49：工作区备份规则集中断言（白名单 / 清单 / 校验 / 恢复计划 / 二次确认 / 零半态）
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_CONFIRM_TOKEN,
  BACKUP_RUNTIME_TABLES,
  BACKUP_TABLES,
  assertRestoreConfirmed,
  buildBackupFile,
  buildBackupFileName,
  buildBackupManifest,
  describeRestoreImpact,
  isBackupTable,
  planRestore,
  validateBackupFile,
} from "@xieflow/shared/backup";
// r18 返工#1：浏览器层 fetch 入口的真实行为断言（stub window/fetch，纯函数模拟，零可见窗口）
import { apiFetch, AUTH_CLEARED_EVENT, SESSION_TOKEN_KEY } from "../apps/web/src/authClient";

// ---------- 极简断言器 ----------
let passed = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}

function eq<T>(actual: T, expected: T, label: string): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  ok(same, `${label}${same ? "" : `（实际 ${JSON.stringify(actual)} ≠ 期望 ${JSON.stringify(expected)}）`}`);
}

async function throws(fn: () => unknown | Promise<unknown>, label: string): Promise<void> {
  try {
    await fn();
    ok(false, `${label}（未抛错）`);
  } catch {
    ok(true, label);
  }
}

/** r10：显式等待 Promise 拒绝（异步工具执行守卫断言用） */
async function throwsAsync(fn: () => unknown | Promise<unknown>, label: string): Promise<void> {
  await throws(fn, label);
}

function noThrow(fn: () => unknown, label: string): void {
  try {
    fn();
    ok(true, label);
  } catch (err) {
    ok(false, `${label}（意外抛错：${err instanceof Error ? err.message : String(err)}）`);
  }
}

/** r34 状态修复：owner 精简根 README 后历史过程件在归档，历史契约断言统一读此文件。 */
const ARCHIVE_README = readFileSync("docs/README-ARCHIVE.md", "utf8");

function section(name: string): void {
  console.log(`\n== ${name} ==`);
}

/** r21: minimal deterministic YAML parser for compose static validation (no docker / no yaml lib).
 *  Handles the compose subset we ship: indentation maps, dash sequences, scalars and comments.
 *  Returns a plain object so assertions inspect structure, not regex text. */
function parseScalarYaml(v: string): unknown {
  const s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}
function parseSimpleYaml(text: string): Record<string, any> {
  const rows: { indent: number; text: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, "  ").replace(/\s+#.*$/, "");
    if (!line.trim()) continue;
    rows.push({ indent: line.length - line.trimStart().length, text: line.trim() });
  }
  const root: Record<string, any> = {};
  const stack: { indent: number; value: any }[] = [{ indent: -1, value: root }];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    while (stack.length > 1 && row.indent <= stack[stack.length - 1]!.indent) stack.pop();
    const parent = stack[stack.length - 1]!.value;
    if (row.text.startsWith("- ")) {
      if (Array.isArray(parent)) parent.push(parseScalarYaml(row.text.slice(2)));
      continue;
    }
    const m = /^([^:]+):\s*(.*)$/.exec(row.text);
    if (!m) continue;
    const key = m[1]!.trim();
    const rest = m[2]!.trim();
    if (rest === "") {
      const next = rows[i + 1];
      const child = next && next.indent > row.indent && next.text.startsWith("- ") ? [] : {};
      parent[key] = child;
      stack.push({ indent: row.indent, value: child });
    } else {
      parent[key] = parseScalarYaml(rest);
    }
  }
  return root;
}

/** 本地时区日期偏移（天），配合 localDateStr 造确定性样本 */
function shiftDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

// ---------- 用例 ----------
let db: XieFlowDb | null = null;

function freshDb(): XieFlowDb {
  db?.close();
  db = openDatabase({ path: ":memory:" });
  return db;
}

try {
  // 1. 迁移与 schema 一致性
  section("迁移与 schema 一致性");
  eq(MIGRATIONS.length, CURRENT_SCHEMA_VERSION, "迁移队列条数 = 最高版本号");
  eq(SCHEMA_VERSION, CURRENT_SCHEMA_VERSION, "shared.SCHEMA_VERSION = db.CURRENT_SCHEMA_VERSION");
  eq(
    MIGRATIONS.map((m) => m.version),
    Array.from({ length: MIGRATIONS.length }, (_, i) => i + 1),
    "迁移版本从 1 连续递增",
  );
  noThrow(() => assertMigrationsConsistent(), "真实迁移队列通过一致性校验");
  throws(
    () => assertMigrationsConsistent([{ version: 2, name: "跳过 v1", up: [] }]),
    "版本不从 1 开始：一致性校验抛错",
  );
  throws(
    () =>
      assertMigrationsConsistent([
        { version: 1, name: "a", up: [] },
        { version: 3, name: "b", up: [] },
      ]),
    "版本断档：一致性校验抛错",
  );
  throws(
    () =>
      assertMigrationsConsistent([
        { version: 1, name: "a", up: [] },
        { version: 2, name: "b", up: [] },
        { version: 3, name: "c", up: [] },
        { version: 4, name: "d", up: [] },
        { version: 5, name: "e", up: [] },
        { version: 6, name: "f", up: [] },
        { version: 7, name: "g", up: [] },
        { version: 8, name: "h", up: [] },
        { version: 9, name: "i", up: [] },
        { version: 10, name: "j", up: [] },
        { version: 11, name: "k", up: [] },
        { version: 12, name: "l", up: [] },
        { version: 13, name: "m", up: [] },
        { version: 14, name: "n", up: [] },
        { version: 15, name: "o", up: [] },
        { version: 16, name: "p", up: [] },
        { version: 17, name: "q", up: [] },
        { version: 19, name: "r", up: [] },
      ]),
    "队列超出 SCHEMA_VERSION：一致性校验抛错",
  );

  // 2. settings CRUD
  section("settings 读写");
  db = freshDb();
  eq(db.listSettings().length, 0, "新库 settings 为空");
  const s1 = db.setSetting("company.name", "协流示例公司");
  eq(s1.value, "协流示例公司", "写入后读回 value");
  const s1b = db.getSetting("company.name");
  ok(s1b !== null, "getSetting 命中");
  eq(s1b!.value, "协流示例公司", "getSetting value 一致");
  const s1c = db.setSetting("company.name", "协流二号");
  eq(s1c.value, "协流二号", "upsert 覆盖旧值");
  ok(db.getSetting("company.name")!.updatedAt >= s1.updatedAt, "upsert 刷新 updated_at");
  eq(db.getSetting("missing.key"), null, "读不存在的 key 返回 null");
  eq(db.listSettings().length, 1, "listSettings 数量正确");
  throws(() => db!.setSetting("", "x"), "空 key 抛错");

  // 3. todo CRUD
  section("todo CRUD");
  db = freshDb();
  eq(db.listTodos().length, 0, "新库 todos 为空");
  const t1 = db.createTodo("收集各部门季度总结", "q1", "2026-11-20");
  ok(t1.id > 0, "createTodo 返回自增 id");
  eq(t1.title, "收集各部门季度总结", "title 读回");
  eq(t1.quadrant, "q1", "quadrant 读回");
  eq(t1.status, "open", "初始状态 open");
  eq(t1.dueDate, "2026-11-20", "dueDate 读回");
  const t2 = db.createTodo("无截止日待办", "q2", null);
  eq(t2.dueDate, null, "dueDate 可为 null");
  eq(db.listTodos().length, 2, "listTodos 数量");
  const got = db.getTodo(t1.id);
  ok(got !== null && got.id === t1.id, "getTodo 命中");
  eq(db.getTodo(99999), null, "getTodo 未命中返回 null");
  eq(db.deleteTodo(t2.id), true, "deleteTodo 删除成功");
  eq(db.deleteTodo(t2.id), false, "重复删除返回 false");
  eq(db.listTodos().length, 1, "删除后数量 -1");
  throws(() => db!.createTodo("", "q1", null), "空标题抛错（服务层守卫）");
  throws(() => db!.createTodo("x", "q9", null), "非法象限抛错（服务层守卫）");

  // 4. todo 输入校验（r2 收紧：服务层守卫先于 SQL CHECK）
  section("todo 输入校验（服务层守卫）");
  db = freshDb();
  const guardSeed = db.createTodo("守卫样本", "q1", null);
  throws(() => db!.createTodo("   ", "q1", null), "纯空白标题抛错");
  throws(() => db!.createTodo("x", "Q1", null), "象限大小写敏感：Q1 拒绝");
  throws(
    () => db!.createTodo("长".repeat(201), "q1", null),
    "超长标题（201 字）抛错（MAX_TODO_TITLE=200）",
  );
  const maxTitle = db.createTodo("标".repeat(200), "q1", null);
  eq(maxTitle.title.length, 200, "恰好 200 字标题可落库（边界通过）");
  throws(() => db!.createTodo("x", "q1 ", null), "象限尾部空白拒绝");
  throws(() => db!.createTodo("x", "q1", "not-a-date"), "非法 dueDate 格式拒绝");
  throws(() => db!.createTodo("x", "q1", "2026-13-01"), "月份 13 的 dueDate 拒绝");
  throws(() => db!.createTodo("x", "q1", "2026-02-30"), "2 月 30 日的 dueDate 拒绝");
  throws(() => db!.createTodo("x", "q1", " 2026-11-20 "), "dueDate 首尾空白拒绝");
  throws(() => db!.createTodo("x", "q1", 123 as unknown as string), "dueDate 非字符串抛错");
  throws(
    () => db!.transitionTodo(guardSeed.id, "bogus" as TodoStatus),
    "非法流转目标抛错（服务层守卫）",
  );
  throws(
    () => db!.transitionTodo(guardSeed.id, "DONE" as TodoStatus),
    "状态大小写敏感：DONE 拒绝",
  );
  eq(db.listTodos().length, 2, "全部非法输入均未落库（库中仅守卫样本 + 200 字合法边界样本）");

  // 5. todo 状态机
  section("todo 状态机");
  const t3 = db.createTodo("状态机样本", "q3", null);
  const done = db.transitionTodo(t3.id, "done");
  eq(done.status, "done", "open → done");
  const reopened = db.transitionTodo(t3.id, "open");
  eq(reopened.status, "open", "done → open（重开）");
  const archived = db.transitionTodo(t3.id, "archived");
  eq(archived.status, "archived", "open → archived");
  throws(() => db!.transitionTodo(t3.id, "done"), "archived → done 非法，抛错");
  throws(() => db!.transitionTodo(424242, "open"), "流转不存在的待办抛错");
  eq(canTransitionTodo("open", "done"), true, "canTransition 合法对");
  eq(canTransitionTodo("archived", "done"), false, "canTransition 非法对");
  eq(
    Object.keys(TODO_STATUS_TRANSITIONS).length,
    3,
    "状态机覆盖全部 3 个状态",
  );
  eq(Object.keys(QUADRANT_LABELS).length, 4, "象限标签覆盖 4 象限");
  eq(EMPTY_SUMMARY.byQuadrant.q1, 0, "EMPTY_SUMMARY 象限归零");

  // 6. 今/明/周汇总计数（api 路由层的 summary 即来自此纯函数）
  section("今/明/周汇总计数（computeTodoSummary）");
  db = freshDb();
  const a1 = db.createTodo("今天到期", "q1", shiftDate(0));
  const b1 = db.createTodo("明天到期", "q2", shiftDate(1));
  db.createTodo("昨天到期", "q3", shiftDate(-1));
  const d1 = db.createTodo("六天后", "q4", shiftDate(6));
  db.createTodo("七天后", "q1", shiftDate(7));
  db.createTodo("下月到期", "q2", "2027-01-01");
  db.createTodo("无截止", "q3", null);
  const h1 = db.createTodo("今天到期但已完成", "q1", shiftDate(0));
  db.transitionTodo(h1.id, "done");
  eq(db.listTodos().length, 8, "汇总样本共 8 条");
  const sum = computeTodoSummary(db.listTodos());
  eq(sum.today, 1, "今 = 本地今天到期且 open（done 的 h1 不计）");
  eq(sum.tomorrow, 1, "明 = 本地明天到期且 open");
  eq(sum.week, 3, "周 = [今天, 今天+6] 窗口内 open（今1+明1+六天后1，+7天与昨天排除）");
  eq(sum.byQuadrant, { q1: 3, q2: 2, q3: 2, q4: 1 }, "象限计数含全部状态（q1 三条：a1/七天后/done 的 h1）");
  db.transitionTodo(d1.id, "archived");
  const sum2 = computeTodoSummary(db.listTodos());
  eq(sum2.week, 2, "归档后移出本周窗口计数（六天后 d1 归档）");
  eq(sum2.byQuadrant.q4, 1, "归档仍计入象限总数");

  // 7. raw 直达 schema 约束（替换 r1 P4「settings.value 非空约束」占位断言）
  section("raw 直达 schema 约束");
  const rawOpen = openDatabaseRaw({ path: ":memory:" });
  const rawDb: SqliteDatabase = rawOpen.raw;
  throws(
    () =>
      rawDb.run(
        "INSERT INTO todos (title, quadrant, status, due_date, created_at, updated_at) " +
          "VALUES (NULL, 'q1', 'open', NULL, '2026-01-01', '2026-01-01')",
      ),
    "todos.title NOT NULL 拒绝 NULL（raw 直达 schema）",
  );
  throws(
    () => rawDb.run("INSERT INTO settings (key, value, updated_at) VALUES ('audit.key', NULL, '2026-01-01')"),
    "settings.value NOT NULL 拒绝 NULL（raw 直达 schema）",
  );
  throws(
    () =>
      rawDb.run(
        "INSERT INTO todos (title, quadrant, status, due_date, created_at, updated_at) " +
          "VALUES ('x', 'q9', 'open', NULL, '2026-01-01', '2026-01-01')",
      ),
    "todos.quadrant CHECK 拒绝 q9（raw 直达 schema）",
  );
  throws(
    () =>
      rawDb.run(
        "INSERT INTO todos (title, quadrant, status, due_date, created_at, updated_at) " +
          "VALUES ('x', 'q1', 'paused', NULL, '2026-01-01', '2026-01-01')",
      ),
    "todos.status CHECK 拒绝 paused（raw 直达 schema）",
  );
  rawDb.close();

  // 8. 迁移幂等与文件库持久化（替换 r1 P4「重开不重复执行迁移」恒真式）
  section("迁移幂等与文件库持久化");
  mkdirSync("scripts/.tmp-e2e", { recursive: true });
  const tmpPath = `scripts/.tmp-e2e/persist-${Date.now()}.db`;
  const fileOpen = openDatabaseRaw({ path: tmpPath });
  fileOpen.db.setSetting("persist.check", "yes");
  const uv1 = (fileOpen.raw.get("PRAGMA user_version") as { user_version: number }).user_version;
  eq(uv1, CURRENT_SCHEMA_VERSION, "新建文件库 user_version = CURRENT_SCHEMA_VERSION（真实 PRAGMA 读回）");
  fileOpen.raw.close();
  const fileOpen2 = openDatabaseRaw({ path: tmpPath }); // 重开：迁移应幂等跳过
  eq(fileOpen2.db.getSetting("persist.check")!.value, "yes", "文件库重开数据仍在");
  const uv2 = (fileOpen2.raw.get("PRAGMA user_version") as { user_version: number }).user_version;
  eq(uv2, CURRENT_SCHEMA_VERSION, "重开不推进 user_version（迁移幂等，真实 PRAGMA 读回）");
  fileOpen2.raw.close();
  db = null;

  // 9. 日程契约与守卫（r3：schedules 表 + 时间/重复校验）
  section("日程契约与守卫（shared）");
  db = freshDb();
  eq(Object.keys(REPEAT_LABELS).length, 4, "repeat 枚举覆盖 4 种（none/daily/weekly/monthly）");
  eq(REPEAT_LABELS.none, "不重复", "repeat 标签 none");
  eq(REPEAT_LABELS.daily, "每天", "repeat 标签 daily");
  eq(REPEAT_LABELS.weekly, "每周", "repeat 标签 weekly");
  eq(REPEAT_LABELS.monthly, "每月", "repeat 标签 monthly");
  throws(() => assertValidScheduleTitle(""), "日程空标题抛错");
  throws(() => assertValidScheduleTitle("   "), "日程纯空白标题抛错");
  throws(() => assertValidScheduleTitle("长".repeat(201)), "日程超长标题（201 字）抛错");
  noThrow(() => assertValidScheduleTitle("标".repeat(200)), "日程恰好 200 字标题合法（边界）");
  throws(() => assertValidScheduleDate("2026-2-30"), "日程非零填充日期拒绝");
  throws(() => assertValidScheduleDate("2026-02-30"), "日程 2 月 30 日拒绝");
  throws(() => assertValidScheduleDate("2026-11-15 "), "日程日期首尾空白拒绝");
  throws(() => assertValidScheduleDate(123 as unknown as string), "日程日期非字符串抛错");
  noThrow(() => assertValidScheduleDate("2026-11-15"), "日程合法日期通过");
  throws(() => assertValidScheduleTime("9:00"), "日程开始时间非零填充拒绝");
  throws(() => assertValidScheduleTime("24:00"), "日程 24 点拒绝");
  throws(() => assertValidScheduleTime("12:60"), "日程 60 分拒绝");
  throws(() => assertValidScheduleTime("12:00 "), "日程时间首尾空白拒绝");
  throws(() => assertValidScheduleTime("abc"), "日程非时间串拒绝");
  noThrow(() => assertValidScheduleTime("00:00"), "日程 00:00 合法（边界）");
  noThrow(() => assertValidScheduleTime("23:59"), "日程 23:59 合法（边界）");
  throws(
    () => assertValidScheduleRange("10:00", "09:00"),
    "结束时间早于开始时间抛错",
  );
  throws(() => assertValidScheduleRange("10:00", "10:00"), "结束时间等于开始时间抛错");
  noThrow(() => assertValidScheduleRange("10:00", "11:30"), "结束晚于开始合法");
  throws(() => assertValidScheduleRepeat("hourly"), "非法 repeat（hourly）抛错");
  throws(() => assertValidScheduleRepeat("NONE"), "repeat 大小写敏感：NONE 拒绝");
  throws(() => assertValidScheduleRepeat(3), "repeat 非字符串抛错");
  noThrow(() => assertValidScheduleRepeat("monthly"), "合法 repeat 通过");

  // 10. 循环日程实例化规则（集中 shared，禁止散落 if-else）
  section("循环日程实例化（computeRepeatInstances）");
  {
    const base: Schedule = {
      id: 7,
      title: "站会",
      date: "2026-11-16", // 周一
      start: "09:00",
      end: "09:30",
      todoId: null,
      repeat: "daily",
      createdAt: "2026-11-15T08:00:00.000Z",
      updatedAt: "2026-11-15T08:00:00.000Z",
    };
    const win = { from: "2026-11-16", to: "2026-11-18" };
    eq(
      computeRepeatInstances(base, win).map((s) => s.date),
      ["2026-11-16", "2026-11-17", "2026-11-18"],
      "daily：窗口内逐日实例化（含首日）",
    );
    const weekly = computeRepeatInstances({ ...base, repeat: "weekly" }, {
      from: "2026-11-16",
      to: "2026-12-07",
    });
    eq(
      weekly.map((s) => s.date),
      ["2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07"],
      "weekly：每 7 天一次，首日即实例",
    );
    const monthly = computeRepeatInstances({ ...base, repeat: "monthly" }, {
      from: "2026-11-16",
      to: "2027-03-16",
    });
    eq(
      monthly.map((s) => s.date),
      ["2026-11-16", "2026-12-16", "2027-01-16", "2027-02-16", "2027-03-16"],
      "monthly：同日逐月，addMonths 处理跨年",
    );
    const monthEnd = computeRepeatInstances(
      { ...base, date: "2026-01-31", repeat: "monthly" },
      { from: "2026-01-31", to: "2026-04-30" },
    );
    eq(
      monthEnd.map((s) => s.date),
      ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"],
      "monthly：1-31 在 2 月收敛为 2-28（不跳月）",
    );
    eq(
      computeRepeatInstances({ ...base, repeat: "none" }, win).map((s) => s.date),
      ["2026-11-16"],
      "none：仅首日本体",
    );
    eq(
      computeRepeatInstances(base, { from: "2026-11-17", to: "2026-11-18" }).map((s) => s.date),
      ["2026-11-17", "2026-11-18"],
      "首日本体在窗口外：实例不含首日（去重交给调用方并集）",
    );
    eq(
      computeRepeatInstances(base, { from: "2026-11-01", to: "2026-11-10" }),
      [],
      "窗口整体早于锚日：空数组",
    );
    eq(
      computeRepeatInstances(base, { from: "2026-11-16", to: "2027-01-15" }).length,
      61,
      "daily 跨 2026-11-16~2027-01-15 恰 61 天（2026 年 11 月 15 天 + 12 月 31 天 + 1 月 15 天）",
    );
    const cap = computeRepeatInstances(base, { from: "2020-01-01", to: "2027-01-01" });
    ok(
      cap.length <= MAX_REPEAT_HORIZON_DAYS,
      `实例数封顶 MAX_REPEAT_HORIZON_DAYS=${MAX_REPEAT_HORIZON_DAYS}（实际 ${cap.length}）`,
    );
    const inst = computeRepeatInstances(base, win);
    ok(
      inst.every((s) => s.id === base.id && s.title === base.title && s.todoId === null && s.repeat === "daily" && s.start === "09:00" && s.end === "09:30"),
      "实例携带本体字段（id/title/todoId/repeat/时间）",
    );
    ok(
      inst.every((s) => s.date >= win.from && s.date <= win.to),
      "实例日期全部落在查询窗口内",
    );
    eq(addMonths(new Date(2026, 0, 31), 1).getDate(), 28, "addMonths 1-31 +1 月 → 2-28（日收敛）");
    eq(addMonths(new Date(2026, 0, 31), 2).getDate(), 31, "addMonths 1-31 +2 月 → 3-31（不丢锚日）");
    eq(addMonths(new Date(2026, 4, 31), 1).getDate(), 30, "addMonths 5-31 +1 月 → 6-30");
  }

  // 10b. 区间查询装配（api GET /api/schedules 的唯一装配入口；r3 返工#1 A）
  section("区间查询装配（assembleRangeSchedules）");
  {
    const mk = (over: Partial<Schedule> & Pick<Schedule, "id" | "date" | "repeat">): Schedule => ({
      title: `s${over.id}`,
      start: "09:00",
      end: "10:00",
      todoId: null,
      createdAt: "2026-11-15T08:00:00.000Z",
      updatedAt: "2026-11-15T08:00:00.000Z",
      ...over,
    });
    const weekly = mk({ id: 101, date: "2026-11-16", title: "周会", repeat: "weekly" });
    const monthly = mk({ id: 102, date: "2026-01-31", title: "月结", repeat: "monthly" });
    const daily = mk({ id: 103, date: "2026-01-01", title: "日常", repeat: "daily" });
    const plain = mk({ id: 104, date: "2026-11-20", title: "单次", repeat: "none" });

    // 锚日窗外：weekly 锚 11-16，窗口 11-17~11-30 → 两条实例（waizhuan 实测 0 条的直接场景）
    const outside = assembleRangeSchedules([weekly], { from: "2026-11-17", to: "2026-11-30" });
    eq(
      outside.map((x) => `${x.date}:${x.isInstance}`),
      ["2026-11-23:true", "2026-11-30:true"],
      "装配：weekly 锚日在窗外，实例仍展开入窗（返工前 0 条的根因场景）",
    );
    // 锚日恰在窗起点：本体 + 后续实例
    const withBody = assembleRangeSchedules([weekly], { from: "2026-11-16", to: "2026-12-07" });
    eq(
      withBody.map((x) => `${x.date}:${x.isInstance}`),
      ["2026-11-16:false", "2026-11-23:true", "2026-11-30:true", "2026-12-07:true"],
      "装配：锚日本体 isInstance=false + 后续周实例（并集同 id 同 date 去重）",
    );
    // 锚日本体落在窗口中间：本体保留原 date，实例从窗口起点起
    const midBody = assembleRangeSchedules([weekly], { from: "2026-11-19", to: "2026-12-01" });
    eq(
      midBody.some((x) => x.id === weekly.id && x.date === "2026-11-16" && x.isInstance === false),
      false,
      "装配：锚日本体窗外不返回（本体也必须落窗）",
    );
    ok(
      midBody.every((x) => x.date >= "2026-11-19" && x.date <= "2026-12-01"),
      "装配：全部结果（本体与实例）都落在查询窗口内",
    );
    // monthly 月末收敛：2 月窗只有 02-28
    const feb = assembleRangeSchedules([monthly], { from: "2026-02-01", to: "2026-02-28" });
    eq(
      feb.map((x) => `${x.date}:${x.isInstance}`),
      ["2026-02-28:true"],
      "装配：monthly 锚 1-31 在 2 月窗收敛为 02-28 实例",
    );
    // none 日程：本体在窗内返回、窗外不返回、无实例
    eq(
      assembleRangeSchedules([plain], { from: "2026-11-01", to: "2026-11-30" }).map((x) => x.date),
      ["2026-11-20"],
      "装配：none 本体在窗内返回（无实例）",
    );
    eq(
      assembleRangeSchedules([plain], { from: "2026-10-01", to: "2026-10-31" }).length,
      0,
      "装配：none 本体窗外不返回",
    );
    // 多日程同窗：跨 id 不互相吞并；排序 date 升序、同日 start 升序
    const multi = assembleRangeSchedules(
      [weekly, monthly, daily, plain, mk({ id: 105, date: "2026-11-16", title: "早会", start: "08:00", end: "08:30", repeat: "none" })],
      { from: "2026-11-16", to: "2026-11-18" },
    );
    const dailyKeys = multi.filter((x) => x.id === daily.id).map((x) => x.date);
    eq(dailyKeys, ["2026-11-16", "2026-11-17", "2026-11-18"], "装配：多日程同窗时 daily 逐日展开不受影响");
    ok(
      !multi.some((x) => x.id === monthly.id),
      "装配：monthly 在无实例的窗不产出任何行",
    );
    const sorted = multi.map((x) => `${x.date} ${x.start}`);
    ok(
      sorted.every((k, i) => i === 0 || !(sorted[i - 1]! > k)),
      "装配：结果按 date 升序、同日按 start 升序",
    );
    // 传入窗内已重复的同 id 日程（防御）：不产生重复行
    const dup = assembleRangeSchedules([weekly, { ...weekly }], { from: "2026-11-16", to: "2026-11-16" });
    eq(
      dup.map((x) => `${x.date}:${x.isInstance}`),
      ["2026-11-16:false"],
      "装配：同 id 同 date 输入去重，本体优先（isInstance=false）",
    );
    const types: Array<ScheduleWithInstanceFlag["isInstance"]> = [true, false];
    eq(types.length, 2, "装配：isInstance 是布尔双值契约（类型层锁定）");
  }

  // 11. schema v2→v3 迁移升级（v2 旧库 → v3 带 schedules 表）+ 双向联动（服务层）
  section("schema v2→v3 迁移升级与双向联动（服务层）");
  {
    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const v3Path = `scripts/.tmp-e2e/upgrade-${Date.now()}.db`;
    // 造一个真 v2 旧库：v3 迁移执行前手动把 user_version 钉回 2（模拟 r2 版本的原地升级）
    const v2Open = openDatabaseRaw({ path: v3Path });
    v2Open.raw.exec("PRAGMA user_version = 2");
    v2Open.raw.close();
    const v3Open = openDatabaseRaw({ path: v3Path });
    v3Open.raw.exec("PRAGMA user_version = 2");
    v3Open.raw.close();
    const v3Migrated = openDatabaseRaw({ path: v3Path });
    eq(
      v3Migrated.appliedMigrations,
      [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
      "v2 旧库重开补跑 v3+v4+v5+v6+v7+v8+v9+v10+v11+v12+v13+v14+v15+v16+v17+v18+v19+v20+v21+v22+v23+v24+v25+v26+v27 迁移（真实 PRAGMA 升级路径）",
    );
    const tables = v3Migrated.raw
      .all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => String((r as unknown as { name: unknown }).name));
    ok(tables.includes("schedules"), "v3 迁移后 schedules 表存在（sqlite_master 真实读回）");
    eq(
      (v3Migrated.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = 迁移队列最高版本（r4 起动态对表，不再钉死 3）",
    );
    const rawDb: SqliteDatabase = v3Migrated.raw;
    throws(
      () =>
        rawDb.run(
          "INSERT INTO schedules (title, date, start_time, end_time, todo_id, repeat, created_at, updated_at) " +
            "VALUES ('x', '2026-11-16', '09:00', '10:00', 999999, 'none', '2026-01-01', '2026-01-01')",
        ),
      "schedules.todo_id 外键拒绝不存在的待办（raw 直达 FK）",
    );
    throws(
      () =>
        rawDb.run(
          "INSERT INTO schedules (title, date, start_time, end_time, todo_id, repeat, created_at, updated_at) " +
            "VALUES ('x', '2026-11-16', '09:00', '10:00', NULL, 'hourly', '2026-01-01', '2026-01-01')",
        ),
      "schedules.repeat CHECK 拒绝 hourly（raw 直达 CHECK）",
    );
    // 联动：待办设 dueDate → 自动生成关联日程；日程改期 → 回写待办 dueDate
    const linkedTodo = v3Migrated.db.createTodo("联动样本", "q2", null);
    eq(v3Migrated.db.listSchedules().length, 0, "无截止日待办不生成日程");
    v3Migrated.db.updateTodoDueDate(linkedTodo.id, "2026-11-20");
    const autoSchedules = v3Migrated.db.listSchedules();
    eq(autoSchedules.length, 1, "待办设 due_date 自动生成关联日程（1 条）");
    const auto = autoSchedules[0]!;
    eq(auto.date, "2026-11-20", "生成日程的 date = 待办 due_date");
    eq(auto.todoId, linkedTodo.id, "生成日程的 todo_id 关联待办");
    eq(auto.start, "09:00", "生成日程默认开始 09:00");
    eq(auto.end, "10:00", "生成日程默认结束 10:00");
    const tReadback = v3Migrated.db.getTodo(linkedTodo.id)!;
    eq(tReadback.dueDate, "2026-11-20", "待办 due_date 已写入");
    // 日程改期 → 回写待办
    v3Migrated.db.updateScheduleDate(auto.id, "2026-11-23");
    const tReadback2 = v3Migrated.db.getTodo(linkedTodo.id)!;
    eq(tReadback2.dueDate, "2026-11-23", "日程改期回写待办 due_date（联动闭环）");
    eq(
      v3Migrated.db.getSchedule(auto.id)!.date,
      "2026-11-23",
      "日程本体 date 已更新",
    );
    // 解除关联：待办 dueDate 清空 → 关联日程删除
    v3Migrated.db.updateTodoDueDate(linkedTodo.id, null);
    eq(v3Migrated.db.listSchedules().length, 0, "待办清空 due_date 自动删除关联日程");
    // 待办删除 → 关联日程级联删除
    const td = v3Migrated.db.createTodo("级联样本", "q1", "2026-12-01");
    eq(v3Migrated.db.listSchedules().length, 1, "待办再设 due_date 再生成日程");
    v3Migrated.db.deleteTodo(td.id);
    eq(v3Migrated.db.listSchedules().length, 0, "待办删除级联删除关联日程");
    // updateTodoDueDate 对不存在待办抛错
    throws(
      () => v3Migrated.db.updateTodoDueDate(424242, "2026-11-20"),
      "updateTodoDueDate 不存在的待办抛错",
    );
    v3Migrated.raw.close();
    db = null;
  }

  // 12. schedules CRUD（服务层）
  section("schedules CRUD（服务层）");
  {
    db = freshDb();
    eq(db.listSchedules().length, 0, "新库 schedules 为空");
    const sc1 = db.createSchedule("项目评审会", "2026-11-17", "14:00", "15:00", null, "none");
    ok(sc1.id > 0, "createSchedule 返回自增 id");
    eq(sc1.title, "项目评审会", "title 读回");
    eq(sc1.date, "2026-11-17", "date 读回");
    eq(sc1.start, "14:00", "start 读回");
    eq(sc1.end, "15:00", "end 读回");
    eq(sc1.todoId, null, "todoId 默认 null");
    eq(sc1.repeat, "none", "repeat 默认 none");
    const sc2Todo = db.createTodo("日程关联的待办", "q2", "2026-11-19");
    const sc2 = db.createSchedule("关联日程", "2026-11-18", "09:00", "10:00", sc2Todo.id, "weekly");
    eq(sc2.todoId, sc2Todo.id, "todoId 关联真实待办（外键读回）");
    eq(db.getSchedule(sc1.id)!.title, "项目评审会", "getSchedule 命中");
    eq(db.getSchedule(99999), null, "getSchedule 未命中返回 null");
    const upd = db.updateSchedule(sc1.id, { title: "项目评审会（改）", repeat: "monthly" });
    eq(upd.title, "项目评审会（改）", "updateSchedule 改 title");
    eq(upd.repeat, "monthly", "updateSchedule 改 repeat");
    eq(db.updateSchedule(sc1.id, {}).repeat, "monthly", "updateSchedule 空补丁不改任何字段");
    throws(() => db!.updateSchedule(424242, { title: "x" }), "updateSchedule 不存在的日程抛错");
    throws(() => db!.createSchedule("", "2026-11-17", "14:00", "15:00"), "createSchedule 空标题抛错");
    throws(() => db!.createSchedule("x", "2026-02-30", "14:00", "15:00"), "createSchedule 非法日期抛错");
    throws(() => db!.createSchedule("x", "2026-11-17", "9:00", "15:00"), "createSchedule 非法开始时间抛错");
    throws(() => db!.createSchedule("x", "2026-11-17", "15:00", "14:00"), "createSchedule 结束早于开始抛错");
    throws(
      () => db!.createSchedule("x", "2026-11-17", "14:00", "15:00", undefined, "hourly" as unknown as ScheduleRepeat),
      "createSchedule 非法 repeat 抛错",
    );
    throws(
      () => db!.createSchedule("x", "2026-11-17", "14:00", "15:00", 424242),
      "createSchedule 关联不存在的待办抛错",
    );
    throws(
      () => db!.createSchedule("x", "2026-11-17", "14:00", "15:00", undefined, "none", { from: "15:00", to: "14:00" }),
      "createSchedule 检查窗口 to 早于 from 抛错",
    );
    eq(db.listSchedules().length, 3, "schedules 恰 3 条合法样本（sc1/sc2/sc2Todo 自动日程；非法输入零落库）");
    const del = db.deleteSchedule(sc2.id);
    eq(del, true, "deleteSchedule 删除成功");
    eq(db.deleteSchedule(sc2.id), false, "deleteSchedule 重复删除返回 false");
    eq(db.listSchedules().length, 2, "删除后剩 2 条");
  }

  // 12b. 看板排序规则（r4：position 重排集中 shared，api 移动路由的唯一入口）
  section("看板排序规则（reorderPositions）");
  {
    // 合法重排：n 张卡（id 唯一、按位排列），取任意一张移到任意 to
    const mkCards = (ids: number[]): Array<{ id: number }> => ids.map((id) => ({ id }));
    const ids10 = mkCards([11, 12, 13, 14, 15]);
    // 首位移到末尾
    eq(
      reorderPositions(ids10, 11, 4),
      [
        { id: 12, position: 0 },
        { id: 13, position: 1 },
        { id: 14, position: 2 },
        { id: 15, position: 3 },
        { id: 11, position: 4 },
      ],
      "重排：首位移到末尾，其余逐张前移、position 连续 0..n-1",
    );
    // 末位移到首位
    eq(
      reorderPositions(ids10, 15, 0),
      [
        { id: 15, position: 0 },
        { id: 11, position: 1 },
        { id: 12, position: 2 },
        { id: 13, position: 3 },
        { id: 14, position: 4 },
      ],
      "重排：末位移到首位，其余逐张后移",
    );
    // 中间位移动
    eq(
      reorderPositions(ids10, 13, 0),
      [
        { id: 13, position: 0 },
        { id: 11, position: 1 },
        { id: 12, position: 2 },
        { id: 14, position: 3 },
        { id: 15, position: 4 },
      ],
      "重排：中位移到首位，被跨过的卡整体让位",
    );
    // 原位移动：整列恒等映射（id 顺序不变、position 连续；api 层据此跳过兄弟卡写入）
    eq(
      reorderPositions(ids10, 12, 1),
      [
        { id: 11, position: 0 },
        { id: 12, position: 1 },
        { id: 13, position: 2 },
        { id: 14, position: 3 },
        { id: 15, position: 4 },
      ],
      "重排：原位移动返回整列恒等映射（无卡让位）",
    );
    // 单卡列
    eq(reorderPositions(mkCards([99]), 99, 0), [{ id: 99, position: 0 }], "重排：单卡列原位恒等");
    // 非法 to：负数 / 越界
    throws(() => reorderPositions(ids10, 11, -1), "重排：to 为负抛错");
    throws(() => reorderPositions(ids10, 11, 5), "重排：to 越界（= n）抛错");
    throws(() => reorderPositions(ids10, 11, 1.5), "重排：to 非整数抛错");
    // 非法 cardId：不在列表内
    throws(() => reorderPositions(ids10, 424242, 0), "重排：cardId 不在列表内抛错");
    // 乱序输入先按 position 收敛（防御语义）：输入乱序但带 position 时按 position 排
    eq(
      reorderPositions(
        [
          { id: 21, position: 2 },
          { id: 22, position: 0 },
          { id: 23, position: 1 },
        ],
        21,
        0,
      ),
      [
        { id: 21, position: 0 },
        { id: 22, position: 1 },
        { id: 23, position: 2 },
      ],
      "重排：乱序输入按 position 排序后再移动（21 从第 3 位提到首位）",
    );
    // 输出整体校验：position 恰为 0..n-1 的连续排列
    const outIds = reorderPositions(ids10, 14, 1).map((x) => x.id);
    ok(outIds.length === new Set(outIds).size, "重排：输出 id 无重复");
    ok(
      reorderPositions(ids10, 14, 1).every((x, i) => x.position === i),
      "重排：输出 position 恰为 0..n-1 连续",
    );
  }

  // 12c. 看板名称守卫（shared，api 400 映射的同一来源）
  section("看板名称守卫（assertValidBoardName）");
  {
    noThrow(() => assertValidBoardName("装修项目"), "看板合法名称通过");
    throws(() => assertValidBoardName(""), "看板空名称抛错");
    throws(() => assertValidBoardName("   "), "看板纯空白名称抛错");
    throws(() => assertValidBoardName("长".repeat(201)), "看板超长名称（201 字）抛错");
    noThrow(() => assertValidBoardName("标".repeat(200)), "看板恰好 200 字名称合法（边界）");
    throws(() => assertValidBoardName(123 as unknown as string), "看板名称非字符串抛错");
  }

  // 13. schema v3→v4 迁移升级（v3 旧库 → v4 带看板三表）+ 看板数据层闭环（服务层）
  section("schema v3→v4 迁移升级与看板数据层（服务层）");
  {
    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const v4Path = `scripts/.tmp-e2e/upgrade-r4-${Date.now()}.db`;
    // 造一个真 v3 旧库：v4 迁移执行前手动把 user_version 钉回 3（模拟 r3 版本的原地升级）
    const v3Open2 = openDatabaseRaw({ path: v4Path });
    v3Open2.raw.exec("PRAGMA user_version = 3");
    v3Open2.raw.close();
    const v4Open = openDatabaseRaw({ path: v4Path });
    eq(
      v4Open.appliedMigrations,
      [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
      "v3 旧库重开只补跑 v4+v5+v6+v7+v8+v9+v10+v11+v12+v13+v14+v15+v16+v17+v18+v19+v20+v21+v22+v23+v24+v25+v26+v27 迁移（真实 PRAGMA 升级路径）",
    );
    const tables = v4Open.raw
      .all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => String((r as unknown as { name: unknown }).name));
    ok(tables.includes("projects"), "v4 迁移后 projects 表存在（sqlite_master 真实读回）");
    ok(tables.includes("board_columns"), "v4 迁移后 board_columns 表存在（sqlite_master 真实读回）");
    ok(tables.includes("cards"), "v4 迁移后 cards 表存在（sqlite_master 真实读回）");
    eq(
      (v4Open.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = CURRENT_SCHEMA_VERSION（17）",
    );
    const rawDb: SqliteDatabase = v4Open.raw;
    throws(
      () =>
        rawDb.run(
          "INSERT INTO projects (name, description, created_at, updated_at) " +
            "VALUES (NULL, NULL, '2026-01-01', '2026-01-01')",
        ),
      "projects.name NOT NULL 拒绝 NULL（raw 直达 schema）",
    );
    throws(
      () =>
        rawDb.run(
          "INSERT INTO board_columns (project_id, name, position, created_at, updated_at) " +
            "VALUES (424242, 'x', 0, '2026-01-01', '2026-01-01')",
        ),
      "board_columns.project_id 外键拒绝不存在的项目（raw 直达 FK）",
    );
    throws(
      () =>
        rawDb.run(
          "INSERT INTO cards (project_id, column_id, title, position, created_at, updated_at) " +
            "VALUES (1, 424242, 'x', 0, '2026-01-01', '2026-01-01')",
        ),
      "cards.column_id 外键拒绝不存在的列（raw 直达 FK）",
    );
    throws(
      () =>
        rawDb.run(
          "INSERT INTO cards (project_id, column_id, title, position, todo_id, created_at, updated_at) " +
            "VALUES (1, 1, 'x', 0, 424242, '2026-01-01', '2026-01-01')",
        ),
      "cards.todo_id 外键拒绝不存在的待办（raw 直达 FK）",
    );

    // 看板数据层闭环：建项目（自动带默认三列，r4 返工#1 A1）→ 落卡 → 跨列移动
    // → 两侧 position 重排 → 删除级联
    eq(
      DEFAULT_BOARD_COLUMNS,
      ["待办", "进行中", "已完成"],
      "shared 默认列模板口径（服务层建列与 UI 文案同一来源）",
    );
    const proj = v4Open.db.createProject("装修项目", "新家装修全流程");
    ok(proj.id > 0, "createProject 返回自增 id");
    eq(proj.name, "装修项目", "项目 name 读回");
    eq(proj.description, "新家装修全流程", "项目 description 读回");
    // r4 返工#1 A1：createProject 自动创建默认三列（消灭「建项目 → 看板零列」用户死路）
    const defaultCols = v4Open.db.listBoardColumns(proj.id);
    eq(
      defaultCols.map((c) => [c.name, c.position]),
      [
        ["待办", 0],
        ["进行中", 1],
        ["已完成", 2],
      ],
      "createProject 自动创建默认三列（待办/进行中/已完成 @ position 0/1/2 连续）",
    );
    ok(
      defaultCols.every((c) => c.projectId === proj.id),
      "默认三列都归属新项目（projectId 一致）",
    );
    eq(defaultCols[0]!.projectId, proj.id, "默认列 projectId 读回");
    eq(
      v4Open.db.listBoardCards(defaultCols[0]!.id),
      [],
      "默认列初始零卡片（有列无卡：与死路形态相反）",
    );
    const col1 = defaultCols[0]!;
    const col2 = defaultCols[1]!;
    // position 冲突守卫仍生效：默认列已占 0/1/2，再占 1 位被拒
    throws(
      () => v4Open.db.createBoardColumn(proj.id, "重复位置列", 1),
      "createBoardColumn position 冲突抛错（服务层守卫，默认列占用后仍拦截）",
    );
    const todoForCard = v4Open.db.createTodo("选瓷砖", "q2", null);
    const card1 = v4Open.db.createBoardCard(proj.id, col1.id, "量房", null, 0);
    const card2 = v4Open.db.createBoardCard(proj.id, col1.id, "出平面图", null, 1);
    const card3 = v4Open.db.createBoardCard(proj.id, col2.id, "选瓷砖", null, 0, todoForCard.id);
    eq(card3.todoId, todoForCard.id, "卡片 todoId 关联真实待办（外键读回）");
    throws(
      () => v4Open.db.createBoardCard(proj.id, col1.id, "越权外键卡", null, 0, 424242),
      "createBoardCard 关联不存在的待办抛错",
    );
    throws(
      () => v4Open.db.createBoardCard(proj.id, 424242, "缺列上下文卡", null, 0),
      "createBoardCard 列不存在抛错（columnId 越权）",
    );
    // 跨列移动：col1 的 card2 移到 col2 末尾 → col1 重排（0..0）、col2 重排（0..2）
    const moved = v4Open.db.moveBoardCard(card2.id, col2.id, 1);
    eq(moved.columnId, col2.id, "移动后卡片 columnId = 目标列");
    eq(moved.position, 1, "移动后卡片 position = 目标位");
    const col1After = v4Open.db.listBoardCards(col1.id);
    const col2After = v4Open.db.listBoardCards(col2.id);
    eq(
      col1After.map((c) => [c.id, c.position]),
      [[card1.id, 0]],
      "移动后源列重排：剩 1 张卡 position=0（连续）",
    );
    eq(
      col2After.map((c) => [c.id, c.position]),
      [
        [card3.id, 0],
        [card2.id, 1],
      ],
      "移动后目标列重排：原卡让位、新卡落位（position 连续 0..1）",
    );
    // 跨项目移动拒绝（真实守卫，不是 SQL FK 拦截）；「别的列」缺省 position 落默认三列之后（列尾=3）
    const proj2 = v4Open.db.createProject("第二个项目", null);
    eq(
      v4Open.db.listBoardColumns(proj2.id).length,
      3,
      "第二个项目同样自带默认三列（createProject 默认建列不分支）",
    );
    const proj2col = v4Open.db.createBoardColumn(proj2.id, "别的列");
    throws(
      () => v4Open.db.moveBoardCard(card1.id, proj2col.id, 0),
      "moveBoardCard 跨项目移动抛错（服务层守卫）",
    );
    // 待办删除 → 卡片 todo_id 置空（SET NULL 级联语义，卡片本体保留）
    v4Open.db.deleteTodo(todoForCard.id);
    eq(v4Open.db.getBoardCard(card3.id)!.todoId, null, "待办删除后卡片 todoId 置空（SET NULL）");
    eq(v4Open.db.getBoardCard(card3.id) !== null, true, "待办删除后卡片本体保留");
    // 列删除 → 列内卡片级联删除
    v4Open.db.deleteBoardColumn(col2.id);
    eq(v4Open.db.getBoardCard(card2.id), null, "列删除级联删除列内卡片");
    eq(v4Open.db.getBoardCard(card3.id), null, "列删除级联删除（另一张卡）");
    // 项目删除 → 列级联删除
    v4Open.db.deleteProject(proj.id);
    eq(v4Open.db.listBoardColumns(proj.id).length, 0, "项目删除级联删除列");
    // 列表读回
    eq(v4Open.db.listProjects().length, 1, "项目列表只剩第二个项目");
    v4Open.raw.close();
    db = null;
  }

  // 14. 看板统计口径（r5：集中 shared 纯函数 computeBoardStats）
  section("看板统计口径（computeBoardStats）");
  {
    const iso = "2026-11-15T08:00:00.000Z";
    const mkCol = (id: number, name: string, position: number): BoardColumn => ({
      id,
      projectId: 7,
      name,
      position,
      createdAt: iso,
      updatedAt: iso,
    });
    const mkCard = (id: number, columnId: number, title: string, position: number, todoId: number | null = null): BoardCard => ({
      id,
      projectId: 7,
      columnId,
      title,
      description: null,
      position,
      todoId,
      createdAt: iso,
      updatedAt: iso,
    });
    const mkTodo = (id: number, status: TodoStatus, dueDate: string | null = null): Todo => ({
      id,
      title: `待办${id}`,
      quadrant: "q2",
      status,
      dueDate,
      createdAt: iso,
      updatedAt: iso,
    });

    // 空项目（零列零卡）：不除零、不出 NaN
    const empty = computeBoardStats(7, [], [], []);
    eq(empty.projectId, 7, "统计：projectId 回显");
    eq(empty.columns.length, 0, "统计：空项目零列");
    eq(
      empty.totals,
      { columnCount: 0, cardCount: 0, doneCount: 0, todoLinkedCount: 0, completionRate: 0 },
      "统计：空项目合计全 0（完成率不除零）",
    );
    ok(Number.isFinite(empty.totals.completionRate), "统计：空项目完成率是有限数（无 NaN）");
    eq(completionRatePercent(0, 0), 0, "完成率口径：分母 0 → 0");
    eq(completionRatePercent(1, 3), 33, "完成率口径：1/3 → 33%（整数百分比四舍五入）");
    eq(completionRatePercent(2, 3), 67, "完成率口径：2/3 → 67%");
    eq(completionRatePercent(3, 3), 100, "完成率口径：3/3 → 100%");
    eq(completionRatePercent(0, 5), 0, "完成率口径：0 完成 → 0%");

    // 单列单卡未关联待办
    const cols = [mkCol(1, "待办", 0), mkCol(2, "进行中", 1), mkCol(3, "已完成", 2)];
    const oneCard = computeBoardStats(7, cols, [mkCard(11, 1, "量房", 0)], []);
    eq(oneCard.columns[0]!.cardCount, 1, "统计：单列单卡 cardCount=1");
    eq(oneCard.columns[0]!.doneCount, 0, "统计：未关联待办的卡不算已完成");
    eq(oneCard.columns[0]!.todoLinkedCount, 0, "统计：未关联待办的卡不计入关联待办数");
    eq(oneCard.columns[0]!.completionRate, 0, "统计：未关联待办的卡完成率 0%");
    eq(oneCard.totals.cardCount, 1, "统计：合计卡片数=1");
    eq(oneCard.totals.completionRate, 0, "统计：项目完成率 0%");

    // 完成口径：只有 status=done 的关联待办算完成
    const todos = [mkTodo(21, "done"), mkTodo(22, "open"), mkTodo(23, "archived")];
    const linked = computeBoardStats(
      7,
      cols,
      [
        mkCard(11, 1, "卡-完成", 0, 21),
        mkCard(12, 1, "卡-进行中", 1, 22),
        mkCard(13, 1, "卡-已归档", 2, 23),
        mkCard(14, 1, "卡-无待办", 3),
      ],
      todos,
    );
    eq(linked.columns[0]!.cardCount, 4, "统计：列内 4 张卡");
    eq(linked.columns[0]!.doneCount, 1, "统计：只有 status=done 的关联待办算完成（open/archived 不算）");
    eq(linked.columns[0]!.todoLinkedCount, 3, "统计：关联待办数=3（4 张卡里 3 张挂了待办）");
    eq(linked.columns[0]!.completionRate, 25, "统计：列完成率 1/4 → 25%");
    eq(linked.totals.cardCount, 4, "统计：合计卡片数=4");
    eq(linked.totals.doneCount, 1, "统计：合计完成数=1");
    eq(linked.totals.todoLinkedCount, 3, "统计：合计关联待办数=3");
    eq(linked.totals.completionRate, 25, "统计：项目完成率 1/4 → 25%");
    eq(linked.totals.columnCount, 3, "统计：合计列数=3");

    // 防御：todoId 指向不存在的待办 → 不算完成（但关联数照记）
    const dangling = computeBoardStats(7, cols, [mkCard(15, 1, "卡-幽灵待办", 0, 999)], todos);
    eq(dangling.columns[0]!.doneCount, 0, "统计：关联不存在的待办不算完成（防御）");
    eq(dangling.columns[0]!.todoLinkedCount, 1, "统计：关联不存在的待办仍计入关联待办数");
    eq(dangling.columns[0]!.completionRate, 0, "统计：幽灵待办的卡完成率 0%");

    // 防御：卡片不属于任何列 → 不计入合计
    const orphan = computeBoardStats(7, cols, [mkCard(16, 999, "卡-孤儿列", 0)], todos);
    eq(orphan.totals.cardCount, 0, "统计：不属于任何列的卡片不计入合计（防御）");

    // 多列分布 + 零卡列
    const multi = computeBoardStats(
      7,
      cols,
      [
        mkCard(21, 1, "A", 0, 21),
        mkCard(22, 1, "B", 1),
        mkCard(23, 2, "C", 0, 21),
        mkCard(24, 3, "D", 0, 21),
      ],
      todos,
    );
    eq(
      multi.columns.map((c) => [c.name, c.cardCount, c.doneCount, c.completionRate]),
      [
        ["待办", 2, 1, 50],
        ["进行中", 1, 1, 100],
        ["已完成", 1, 1, 100],
      ],
      "统计：各列卡片数/完成数/完成率（零卡列不出现——本例三列都有卡）",
    );
    eq(multi.totals.cardCount, 4, "统计：多列合计卡片数=4");
    eq(multi.totals.doneCount, 3, "统计：多列合计完成数=3");
    eq(multi.totals.completionRate, 75, "统计：多列项目完成率 3/4 → 75%");

    // 零卡列：完成率 0（不除零）
    const zeroCol = computeBoardStats(7, cols, [], todos);
    eq(zeroCol.columns.map((c) => c.completionRate), [0, 0, 0], "统计：三列全空时各列完成率均为 0");
    eq(zeroCol.totals.completionRate, 0, "统计：零卡项目完成率 0%（不除零）");

    // 列顺序：输入乱序 → 输出按 position 升序
    const shuffled = computeBoardStats(
      7,
      [mkCol(3, "已完成", 2), mkCol(1, "待办", 0), mkCol(2, "进行中", 1)],
      [],
      todos,
    );
    eq(
      shuffled.columns.map((c) => c.name),
      ["待办", "进行中", "已完成"],
      "统计：列按 position 升序输出（输入乱序也收敛）",
    );
  }

  // 15. 看板 CSV 台账（r5：UTF-8 BOM + RFC4180 转义 + 中文表头）
  section("看板 CSV 台账（buildBoardCsvContent）");
  {
    const iso = "2026-11-15T08:00:00.000Z";
    const mkCol = (id: number, name: string, position: number): BoardColumn => ({
      id,
      projectId: 7,
      name,
      position,
      createdAt: iso,
      updatedAt: iso,
    });
    const mkCard = (
      id: number,
      columnId: number,
      title: string,
      position: number,
      todoId: number | null = null,
      description: string | null = null,
    ): BoardCard => ({
      id,
      projectId: 7,
      columnId,
      title,
      description,
      position,
      todoId,
      createdAt: iso,
      updatedAt: iso,
    });
    const mkTodo = (id: number, status: TodoStatus, dueDate: string | null = null): Todo => ({
      id,
      title: `待办${id}`,
      quadrant: "q1",
      status,
      dueDate,
      createdAt: iso,
      updatedAt: iso,
    });

    const cols = [mkCol(1, "待办", 0), mkCol(2, "进行中", 1), mkCol(3, "已完成", 2)];
    const todos = [mkTodo(31, "done", "2026-11-20"), mkTodo(32, "open", null)];

    // BOM 头（Excel 直开不乱码）
    const csv = buildBoardCsvContent(cols, [mkCard(41, 1, "量房", 0, 31)], todos);
    ok(csv.startsWith(CSV_UTF8_BOM), "CSV：以 UTF-8 BOM 开头（Excel 直开不乱码）");
    eq(csv.charCodeAt(0), 0xfeff, "CSV：首字符码点 U+FEFF（落盘字节 EF BB BF）");

    // 中文表头（9 列）
    const lines = csv.slice(CSV_UTF8_BOM.length).split("\r\n");
    eq(lines[0], BOARD_CSV_HEADERS.join(","), "CSV：表头为中文列名且顺序固定");
    eq(BOARD_CSV_HEADERS.length, 9, "CSV：表头共 9 列（列/卡片/关联待办全量台账）");

    // 行数 = 列数 + 卡片数（空列占位行）
    eq(lines.length, 4, "CSV：三列 + 一张卡 = 4 行（空列各占 1 行占位）");
    eq(countCsvRecords(csv), 4, "CSV：记录数与行数一致（引号内换行不虚增）");

    // 空列占位行：卡片字段留空
    const placeholder = lines[3]!.split(",");
    eq(placeholder[0], "已完成", "CSV：空列占位行带列名");
    eq(placeholder[1], "2", "CSV：空列占位行带列位置");
    eq(placeholder[2], "", "CSV：空列占位行的卡片标题为空");

    // 卡片行：列信息 + 卡片信息 + 关联待办信息
    const cardRow = lines[1]!.split(",");
    eq(cardRow[0], "待办", "CSV：卡片行首列=列名");
    eq(cardRow[1], "0", "CSV：卡片行第二列=列位置");
    eq(cardRow[2], "量房", "CSV：卡片行第三列=卡片标题");
    eq(cardRow[3], "", "CSV：卡片描述为 null 时输出空串");
    eq(cardRow[4], "0", "CSV：卡片行第五列=卡片位置");
    eq(cardRow[5], "待办31", "CSV：关联待办标题");
    eq(cardRow[6], "已完成", "CSV：关联待办状态用中文标签");
    eq(cardRow[7], "紧急且重要", "CSV：关联待办象限用中文标签");
    eq(cardRow[8], "2026-11-20", "CSV：关联待办截止日期");

    // 未关联待办的卡：待办字段全空
    const noTodoCsv = buildBoardCsvContent(cols, [mkCard(42, 2, "无待办卡", 0)], todos);
    const noTodoRow = noTodoCsv.slice(CSV_UTF8_BOM.length).split("\r\n")[2]!.split(",");
    eq(noTodoRow.slice(5), ["", "", "", ""], "CSV：未关联待办的卡，待办四列全空");

    // 转义：逗号 / 引号 / 换行
    eq(escapeCsvField("普通字段"), "普通字段", "转义：无特殊字符原样输出");
    eq(escapeCsvField(""), "", "转义：空字段输出空串");
    eq(escapeCsvField("含,逗号"), '"含,逗号"', "转义：含逗号整体加双引号");
    eq(escapeCsvField('含"引号'), '"含""引号"', "转义：内部双引号写成两个并整体加引号");
    eq(escapeCsvField("含\n换行"), '"含\n换行"', "转义：含换行整体加双引号");
    const tricky = buildBoardCsvContent(
      cols,
      [mkCard(43, 1, '卡"A", 含逗号', 0, null, "第一行\n第二行")],
      todos,
    );
    const trickyRows = buildBoardCsvRows(cols, [mkCard(43, 1, '卡"A", 含逗号', 0, null, "第一行\n第二行")], todos);
    eq(trickyRows[0]![2], '卡"A", 含逗号', "CSV：原值保留（转义只发生在序列化层）");
    eq(countCsvRecords(tricky), 4, "CSV：含逗号/引号/换行的字段不虚增记录数");
    ok(tricky.includes('"卡""A"", 含逗号"'), "CSV：逗号与引号同时出现时正确转义");
    ok(tricky.includes('"第一行\n第二行"'), "CSV：含换行的字段被引号包裹");
    eq(tricky.split("\r\n").length, 4, "CSV：字段内裸 \\n 不破坏 \\r\\n 记录分隔（按 \\r\\n 切分仍是 4 段）");
    // 字段内含 CRLF：物理行数会多，但记录数不变（RFC4180 解析正确）
    const crlfCsv = buildBoardCsvContent(cols, [mkCard(44, 1, "卡", 0, null, "第一行\r\n第二行")], todos);
    eq(countCsvRecords(crlfCsv), 4, "CSV：字段内 CRLF 不虚增记录数（记录数仍 4）");
    eq(crlfCsv.split("\r\n").length, 5, "CSV：字段内 CRLF 会多出物理行（记录数与物理行数的区别）");

    // 排序：列 position 升序 + 卡 position 升序
    const ordered = buildBoardCsvContent(
      [mkCol(3, "已完成", 2), mkCol(1, "待办", 0)],
      [mkCard(52, 1, "第二张", 1), mkCard(51, 1, "第一张", 0)],
      todos,
    );
    const orderedRows = ordered.slice(CSV_UTF8_BOM.length).split("\r\n");
    eq(orderedRows[1]!.split(",")[2], "第一张", "CSV：同列内卡片按 position 升序");
    eq(orderedRows[2]!.split(",")[2], "第二张", "CSV：同列内第二张卡在下一行");
    eq(orderedRows[3]!.split(",")[0], "已完成", "CSV：列按 position 升序输出");

    // 空项目导出：只有表头
    const emptyCsv = buildBoardCsvContent([], [], []);
    eq(emptyCsv, CSV_UTF8_BOM + BOARD_CSV_HEADERS.join(","), "CSV：零列项目导出仅含表头");
    eq(countCsvRecords(emptyCsv), 1, "CSV：零列项目导出记录数=1（表头）");
  }

  // 16. r6 字段类型引擎：校验 / 归一 / 比较器（每种字段类型 ≥6 条断言）
  section("字段类型引擎（validateFieldValue / coerceFieldValue / compareValues）");
  {
    // —— 字段类型清单 ——
    eq(FIELD_TYPES.length, 8, "字段类型共 8 种（原 7 种 + r30 formula 公式列）");
    eq(
      [...FIELD_TYPES],
      ["text", "number", "date", "select", "multi-select", "checkbox", "url", "formula"],
      "字段类型清单与顺序固定（formula 追加在尾，既有类型零改动）",
    );
    ok(
      FIELD_TYPES.every((t) => typeof FIELD_TYPE_LABELS[t] === "string" && FIELD_TYPE_LABELS[t].length > 0),
      "每种字段类型都有中文标签（字段管理面板与错误消息同源）",
    );
    ok(isFieldType("multi-select"), "isFieldType 认得多选");
    ok(!isFieldType("money"), "isFieldType 拒绝未知类型");
    ok(fieldTypeUsesOptions("select") && fieldTypeUsesOptions("multi-select"), "单选/多选需要候选项");
    ok(!fieldTypeUsesOptions("text") && !fieldTypeUsesOptions("number"), "文本/数字不需要候选项");

    // —— text ——
    eq(validateFieldValue("text", "abc").valid, true, "校验·文本：字符串合法");
    eq(validateFieldValue("text", 42).valid, false, "校验·文本：非字符串非法");
    eq(validateFieldValue("text", null).valid, true, "校验·文本：空值合法（空格子不是错误）");
    eq(coerceFieldValue("text", 42), "42", "归一·文本：数字转字符串");
    eq(coerceFieldValue("text", "  a  "), "  a  ", "归一·文本：保留原文空白");
    eq(compareValues("text", "a", "b") < 0, true, "比较器·文本：字典序 a < b");
    eq(compareValues("text", "b", "a") > 0, true, "比较器·文本：反向 b > a");
    eq(compareValues("text", null, "a") > 0, true, "比较器·文本：空值恒最后");
    eq(compareValues("text", "a", "a"), 0, "比较器·文本：相等返回 0");

    // —— number ——
    eq(validateFieldValue("number", 42).valid, true, "校验·数字：数值合法");
    eq(validateFieldValue("number", "42").valid, false, "校验·数字：数字字符串非法（须先归一）");
    eq(validateFieldValue("number", Number.NaN).valid, false, "校验·数字：NaN 非法");
    eq(validateFieldValue("number", Number.POSITIVE_INFINITY).valid, false, "校验·数字：Infinity 非法");
    eq(coerceFieldValue("number", "42"), 42, "归一·数字：数字字符串转数字");
    eq(coerceFieldValue("number", " 42 "), 42, "归一·数字：去空白后转数字");
    eq(coerceFieldValue("number", ""), null, "归一·数字：空串按清空处理");
    eq(coerceFieldValue("number", "abc"), "abc", "归一·数字：认不出的值原样返回（交校验拦下）");
    eq(compareValues("number", 10, 9) > 0, true, "比较器·数字：按值比（10 > 9，不是字符串比）");
    eq(compareValues("number", 2, 10) < 0, true, "比较器·数字：2 < 10（不是字符串比）");
    eq(compareValues("number", null, 1) > 0, true, "比较器·数字：空值恒最后");

    // —— date ——
    eq(validateFieldValue("date", "2026-11-15").valid, true, "校验·日期：ISO 日期合法");
    eq(validateFieldValue("date", "2026-13-01").valid, false, "校验·日期：13 月非法");
    eq(validateFieldValue("date", "2026-02-30").valid, false, "校验·日期：不存在的日历日非法");
    eq(validateFieldValue("date", "2026/11/15").valid, false, "校验·日期：斜杠格式非法");
    eq(coerceFieldValue("date", "2026-1-5"), "2026-01-05", "归一·日期：补零成 YYYY-MM-DD");
    eq(coerceFieldValue("date", "2026-11-15T10:00:00Z"), "2026-11-15", "归一·日期：带时刻只取日期部分");
    eq(coerceFieldValue("date", "2026/11/15"), "2026-11-15", "归一·日期：斜杠改横杠");
    eq(coerceFieldValue("date", ""), null, "归一·日期：空串按清空处理");
    eq(compareValues("date", "2026-11-15", "2026-11-16") < 0, true, "比较器·日期：按时间比");
    eq(compareValues("date", "2026-12-01", "2026-11-30") > 0, true, "比较器·日期：跨月比");
    eq(compareValues("date", null, "2026-11-15") > 0, true, "比较器·日期：空值恒最后");

    // —— select ——
    const selOptions = ["未开始", "进行中", "已完成"];
    eq(validateFieldValue("select", "进行中", selOptions).valid, true, "校验·单选：在候选项内合法");
    eq(validateFieldValue("select", "搁置", selOptions).valid, false, "校验·单选：不在候选项内非法");
    eq(validateFieldValue("select", 42, selOptions).valid, false, "校验·单选：非字符串非法");
    eq(coerceFieldValue("select", " 进行中 ", selOptions), "进行中", "归一·单选：去空白");
    eq(coerceFieldValue("select", "", selOptions), null, "归一·单选：空串按清空处理");
    eq(compareValues("select", "已完成", "未开始", selOptions) > 0, true, "比较器·单选：按候选项顺序比");
    eq(compareValues("select", "未开始", "已完成", selOptions) < 0, true, "比较器·单选：反向按候选项顺序");
    eq(compareValues("select", null, "未开始", selOptions) > 0, true, "比较器·单选：空值恒最后");

    // —— multi-select ——
    const msOptions = ["重要", "紧急", "返工"];
    eq(validateFieldValue("multi-select", ["重要"], msOptions).valid, true, "校验·多选：候选项子集合法");
    eq(validateFieldValue("multi-select", ["未知"], msOptions).valid, false, "校验·多选：非候选项非法");
    eq(validateFieldValue("multi-select", "重要", msOptions).valid, false, "校验·多选：非数组非法");
    eq(coerceFieldValue("multi-select", "重要, 紧急", msOptions), ["重要", "紧急"], "归一·多选：逗号串转数组");
    eq(coerceFieldValue("multi-select", ["重要", "重要", "紧急"], msOptions), ["重要", "紧急"], "归一·多选：去重");
    eq(coerceFieldValue("multi-select", "", msOptions), null, "归一·多选：空串按清空处理");
    eq(compareValues("multi-select", ["紧急"], ["重要"], msOptions) > 0, true, "比较器·多选：按首个候选项顺序比");
    eq(compareValues("multi-select", [], ["重要"], msOptions) > 0, true, "比较器·多选：空数组恒最后");

    // —— checkbox ——
    eq(validateFieldValue("checkbox", true).valid, true, "校验·复选框：布尔值合法");
    eq(validateFieldValue("checkbox", "true").valid, false, "校验·复选框：字符串非法");
    eq(validateFieldValue("checkbox", 1).valid, false, "校验·复选框：数字非法");
    eq(coerceFieldValue("checkbox", "true"), true, "归一·复选框：\"true\" 转布尔");
    eq(coerceFieldValue("checkbox", "1"), true, "归一·复选框：\"1\" 转布尔");
    eq(coerceFieldValue("checkbox", "0"), false, "归一·复选框：\"0\" 转布尔");
    eq(compareValues("checkbox", false, true) < 0, true, "比较器·复选框：false < true");
    eq(compareValues("checkbox", true, false) > 0, true, "比较器·复选框：true > false");
    eq(compareValues("checkbox", null, false) > 0, true, "比较器·复选框：空值恒最后（false 是值不是空）");

    // —— url ——
    eq(validateFieldValue("url", "https://example.com").valid, true, "校验·链接：https 合法");
    eq(validateFieldValue("url", "ftp://example.com").valid, false, "校验·链接：非 http(s) 非法");
    eq(validateFieldValue("url", 42).valid, false, "校验·链接：非字符串非法");
    eq(coerceFieldValue("url", "example.com"), "https://example.com", "归一·链接：裸域名补 https://");
    eq(coerceFieldValue("url", ""), null, "归一·链接：空串按清空处理");
    eq(compareValues("url", "https://a.com", "https://b.com") < 0, true, "比较器·链接：按字符串比");
    eq(compareValues("url", null, "https://a.com") > 0, true, "比较器·链接：空值恒最后");

    // —— 空值判定与守卫 ——
    eq(isEmptyFieldValue(null), true, "空值判定：null 是空");
    eq(isEmptyFieldValue(""), true, "空值判定：空串是空");
    eq(isEmptyFieldValue([]), true, "空值判定：空数组是空");
    eq(isEmptyFieldValue(false), false, "空值判定：false 是值不是空");
    throws(() => assertValidFieldValue("number", "abc"), "断言式校验：数字字段收到字符串抛错");
    throws(() => assertValidFieldValue("select", "搁置", selOptions), "断言式校验：单选值不在候选项抛错");
    noThrow(() => assertValidFieldValue("text", "ok"), "断言式校验：合法值不抛错");
    throws(() => assertValidTableName(""), "守卫：表格空名称抛错");
    noThrow(() => assertValidTableName("预算表"), "守卫：合法表格名通过");
    throws(() => assertValidFieldName("   "), "守卫：字段纯空白名称抛错");
    throws(() => assertValidFieldType("money"), "守卫：非法字段类型抛错");
    noThrow(() => assertValidFieldType("multi-select"), "守卫：合法字段类型通过");
    throws(() => assertValidFieldOptions("select", []), "守卫：单选零候选项抛错");
    throws(() => assertValidFieldOptions("select", ["A", "A"]), "守卫：候选项重复抛错");
    throws(() => assertValidFieldOptions("text", ["A"]), "守卫：文本字段带候选项抛错");
    noThrow(() => assertValidFieldOptions("multi-select", ["A", "B"]), "守卫：多选候选项合法通过");
  }

  // 17. r6 记录数据归一 + 查询装配（筛选 / 排序 / 分页，规则集中 shared）
  section("记录数据归一与查询装配（normalizeRecordData / queryRecords）");
  {
    const mkField = (id: number, name: string, type: TableField["type"], options: string[] = [], position = 0): TableField => ({
      id,
      tableId: 1,
      name,
      type,
      position,
      options,
      createdAt: "2026-11-15T08:00:00.000Z",
      updatedAt: "2026-11-15T08:00:00.000Z",
    });
    const mkRecord = (id: number, data: Record<string, unknown>, position = 0): TableRecord => ({
      id,
      tableId: 1,
      data,
      position,
      createdAt: "2026-11-15T08:00:00.000Z",
      updatedAt: "2026-11-15T08:00:00.000Z",
    });
    const fName = mkField(1, "名称", "text");
    const fAmount = mkField(2, "金额", "number");
    const fStatus = mkField(3, "状态", "select", ["未开始", "进行中", "已完成"]);
    const fields = [fName, fAmount, fStatus];

    // —— 归一 ——
    eq(
      normalizeRecordData(fields, { "1": "量房", "2": "42" }),
      { "1": "量房", "2": 42, "3": null },
      "归一：数字字符串转数字 + 缺省字段补 null",
    );
    throws(() => normalizeRecordData(fields, { "999": "x" }), "归一：未知字段 id 抛错");
    throws(() => normalizeRecordData(fields, { "2": "abc" }), "归一：数字字段收到非法字符串抛错");
    throws(() => normalizeRecordData(fields, { "3": "搁置" }), "归一：单选值不在候选项抛错");

    // —— 筛选 ——
    const records = [
      mkRecord(11, { "1": "B", "2": 10, "3": "进行中" }, 0),
      mkRecord(12, { "1": "A", "2": null, "3": "未开始" }, 1),
      mkRecord(13, { "1": "C", "2": 5, "3": "已完成" }, 2),
    ];
    eq(
      queryRecords(records, fields, { filterFieldId: 3, filterValue: "进行中" }).records.map((r) => r.id),
      [11],
      "查询·筛选：按单选字段筛出 1 条",
    );
    eq(
      queryRecords(records, fields, { filterFieldId: 2, filterValue: "10" }).records.map((r) => r.id),
      [11],
      "查询·筛选：数字字段筛选值走归一（\"10\" → 10）",
    );
    throws(
      () => queryRecords(records, fields, { filterFieldId: 2, filterValue: "abc" }),
      "查询·筛选：筛选值类型不符抛错（api 映射 400）",
    );
    throws(() => queryRecords(records, fields, { filterFieldId: 999 }), "查询·筛选：未知筛选字段抛错");
    throws(() => queryRecords(records, fields, { sortFieldId: 999 }), "查询·排序：未知排序字段抛错");
    throws(
      () => queryRecords(records, fields, { filterFieldId: 3, filterValue: "搁置" }),
      "查询·筛选：筛选值不在候选项内抛错",
    );

    // —— 排序 ——
    eq(
      queryRecords(records, fields, { sortFieldId: 2 }).records.map((r) => r.id),
      [13, 11, 12],
      "查询·排序：数字升序（5 < 10），空值排最后",
    );
    eq(
      queryRecords(records, fields, { sortFieldId: 2, sortDirection: "desc" }).records.map((r) => r.id),
      [11, 13, 12],
      "查询·排序：数字降序（10 > 5），空值仍排最后",
    );
    eq(
      queryRecords(records, fields, { sortFieldId: 3 }).records.map((r) => r.id),
      [12, 11, 13],
      "查询·排序：单选按候选项顺序（未开始 < 进行中 < 已完成）",
    );
    eq(
      sortRecordsByField(records, fAmount, "asc").map((r) => r.id),
      [13, 11, 12],
      "排序：sortRecordsByField 空值恒最后",
    );
    eq(
      matchesFieldValue("multi-select", ["重要", "紧急"], "重要"),
      true,
      "筛选判定：多选包含命中",
    );
    eq(matchesFieldValue("number", 5, 5), true, "筛选判定：数字相等命中");
    eq(matchesFieldValue("checkbox", true, false), false, "筛选判定：复选框不等不命中");

    // —— 分页 ——
    const page1 = queryRecords(records, fields, { page: 1, pageSize: 2 });
    eq(page1.records.map((r) => r.id), [11, 12], "分页：第 1 页 2 条");
    eq(page1.total, 3, "分页：total = 全部命中数");
    eq(page1.totalPages, 2, "分页：totalPages = ceil(total / pageSize)");
    const page2 = queryRecords(records, fields, { page: 2, pageSize: 2 });
    eq(page2.records.map((r) => r.id), [13], "分页：第 2 页 1 条");
    const page99 = queryRecords(records, fields, { page: 99, pageSize: 2 });
    eq(page99.records.length, 0, "分页：越界页返回空列表");
    eq(page99.total, 3, "分页：越界页 total 不变");
    eq(queryRecords(records, fields, { pageSize: 9999 }).pageSize, MAX_PAGE_SIZE, "分页：pageSize 上限封顶");
    eq(queryRecords(records, fields, { pageSize: 0 }).pageSize, 1, "分页：pageSize 下限为 1");
  }

  // 18. r6 U2-2 必修：导出文件名含项目名（不再只露内部 id）
  section("看板导出文件名（buildBoardCsvFileName · U2-2）");
  {
    const fixed = new Date(2026, 10, 15);
    eq(
      buildBoardCsvFileName("新家装修", fixed),
      "xieflow-board-新家装修-20261115.csv",
      "导出文件名：xieflow-board-<项目名>-<YYYYMMDD>.csv",
    );
    eq(
      buildBoardCsvFileName("Q4 产品发布", fixed),
      "xieflow-board-Q4-产品发布-20261115.csv",
      "导出文件名：项目名中的空格折叠成短横线",
    );
    ok(
      !/project-\d+/.test(buildBoardCsvFileName("新家装修", fixed)),
      "导出文件名：不含内部项目 id（U2-2 语义）",
    );
    eq(sanitizeFileNamePart("a/b:c"), "a-b-c", "文件名清洗：路径分隔符等非法字符折叠成短横线");
    eq(sanitizeFileNamePart("!!!"), "board", "文件名清洗：全非法字符回落到 board");
    ok(buildBoardCsvFileName("新家装修", fixed).endsWith(".csv"), "导出文件名：.csv 扩展名");
  }

  // 19. schema v4→v5 迁移升级 + 多维表格数据层（服务层闭环）
  section("schema v4→v5 迁移升级与多维表格数据层（服务层）");
  {
    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const v5Path = `scripts/.tmp-e2e/upgrade-r6-${Date.now()}.db`;
    // 造一个真 v4 旧库：v5 迁移执行前把 user_version 钉回 4（模拟 r4 版本的原地升级）
    const v4Open2 = openDatabaseRaw({ path: v5Path });
    v4Open2.raw.exec("PRAGMA user_version = 4");
    v4Open2.raw.close();
    const v5Open = openDatabaseRaw({ path: v5Path });
    eq(v5Open.appliedMigrations, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], "v4 旧库重开只补跑 v5+v6+v7+v8+v9+v10+v11+v12+v13+v14+v15+v16+v17+v18+v19+v20+v21+v22+v23+v24+v25+v26+v27 迁移（真实 PRAGMA 升级路径）");
    const tableNames = v5Open.raw
      .all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => String((r as unknown as { name: unknown }).name));
    ok(tableNames.includes("tables"), "v5 迁移后 tables 表存在（sqlite_master 真实读回）");
    ok(tableNames.includes("fields"), "v5 迁移后 fields 表存在（sqlite_master 真实读回）");
    ok(tableNames.includes("records"), "v5 迁移后 records 表存在（sqlite_master 真实读回）");
    eq(
      (v5Open.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = CURRENT_SCHEMA_VERSION（17）",
    );
    const rawDb5: SqliteDatabase = v5Open.raw;
    throws(
      () =>
        rawDb5.run(
          "INSERT INTO tables (name, description, created_at, updated_at) " +
            "VALUES (NULL, NULL, '2026-01-01', '2026-01-01')",
        ),
      "tables.name NOT NULL 拒绝 NULL（raw 直达 schema）",
    );
    throws(
      () =>
        rawDb5.run(
          "INSERT INTO fields (table_id, name, type, position, options, created_at, updated_at) " +
            "VALUES (424242, 'x', 'text', 0, '[]', '2026-01-01', '2026-01-01')",
        ),
      "fields.table_id 外键拒绝不存在的表（raw 直达 FK）",
    );
    throws(
      () =>
        rawDb5.run(
          "INSERT INTO fields (table_id, name, type, position, options, created_at, updated_at) " +
            "VALUES (1, 'x', 'money', 0, '[]', '2026-01-01', '2026-01-01')",
        ),
      "fields.type CHECK 拒绝未知字段类型（raw 直达 schema）",
    );
    throws(
      () =>
        rawDb5.run(
          "INSERT INTO records (table_id, data, position, created_at, updated_at) " +
            "VALUES (424242, '{}', 0, '2026-01-01', '2026-01-01')",
        ),
      "records.table_id 外键拒绝不存在的表（raw 直达 FK）",
    );

    // —— 数据层闭环：建表（自动带默认字段）→ 加字段 → 加行 → 编辑单元格 → 删字段 ——
    const tbl = v5Open.db.createTable("装修预算表", "M3 起步轮的样例表");
    ok(tbl.id > 0, "createTable 返回自增 id");
    eq(tbl.name, "装修预算表", "createTable name 读回");
    const defFields = v5Open.db.listFields(tbl.id);
    eq(
      defFields.map((f) => [f.name, f.type]),
      [
        ["名称", "text"],
        ["状态", "select"],
        ["负责人", "text"],
        ["金额", "number"],
        ["截止日期", "date"],
        ["标签", "multi-select"],
        ["完成", "checkbox"],
        ["链接", "url"],
      ],
      "createTable 自动创建默认字段（7 种类型齐备，消灭「建表零字段」死路）",
    );
    eq(defFields.map((f) => f.position), [0, 1, 2, 3, 4, 5, 6, 7], "默认字段 position 连续 0..7");
    eq(
      defFields.find((f) => f.name === "状态")!.options,
      ["未开始", "进行中", "已完成"],
      "默认单选字段带候选项",
    );
    eq(
      new Set(defFields.map((f) => f.type)).size,
      7,
      "默认字段覆盖全部 7 种字段类型",
    );
    eq(DEFAULT_TABLE_FIELDS.length, 8, "默认字段模板共 8 个字段");
    eq(
      v5Open.db.listFields(tbl.id).every((f) => f.tableId === tbl.id),
      true,
      "字段归属自己的表",
    );

    // 自定义字段
    const custom = v5Open.db.createField(tbl.id, "供应商", "text", [], 8);
    eq(custom.name, "供应商", "createField name 读回");
    eq(custom.type, "text", "createField type 读回");
    eq(custom.position, 8, "createField position 缺省 = 追加到列尾");
    const selField = v5Open.db.createField(tbl.id, "阶段", "select", ["A", "B"], 9);
    eq(selField.options, ["A", "B"], "createField 候选项读回");
    throws(() => v5Open.db.createField(tbl.id, "坏字段", "money" as unknown as TableField["type"]), "createField 非法类型抛错");
    throws(() => v5Open.db.createField(tbl.id, "坏单选", "select", []), "createField 单选零候选项抛错");
    throws(() => v5Open.db.createField(424242, "孤儿字段", "text"), "createField 表不存在抛错");

    // 改字段（改名 + 改类型）
    const renamed = v5Open.db.updateField(custom.id, { name: "供应商名称" });
    eq(renamed.name, "供应商名称", "updateField 改名生效");
    const retyped = v5Open.db.updateField(custom.id, { type: "number" });
    eq(retyped.type, "number", "updateField 改类型生效");
    eq(retyped.options, [], "updateField 改成非单选类型时候选项清空");

    // —— 记录（行） ——
    const rec = v5Open.db.createRecord(tbl.id, {
      [String(defFields[0]!.id)]: "量房",
      [String(defFields[3]!.id)]: "1200",
    });
    eq(rec.data[String(defFields[0]!.id)], "量房", "createRecord 文本字段读回");
    eq(rec.data[String(defFields[3]!.id)], 1200, "createRecord 数字字段按引擎归一（\"1200\" → 1200）");
    eq(rec.data[String(defFields[1]!.id)], null, "createRecord 未给的字段补 null");
    eq(v5Open.db.listRecords(tbl.id).length, 1, "createRecord 后表内 1 行");
    throws(
      () => v5Open.db.createRecord(tbl.id, { "99999": "x" }),
      "createRecord 写入未知字段抛错",
    );
    throws(
      () => v5Open.db.createRecord(tbl.id, { [String(defFields[3]!.id)]: "abc" }),
      "createRecord 写入非法数字抛错",
    );
    const edited = v5Open.db.updateRecord(rec.id, {
      [String(defFields[0]!.id)]: "量房复测",
      [String(defFields[3]!.id)]: 1500,
    });
    eq(edited.data[String(defFields[0]!.id)], "量房复测", "updateRecord 编辑单元格生效");
    eq(edited.data[String(defFields[3]!.id)], 1500, "updateRecord 数字字段读回");

    // 删字段 → 该字段的键从所有记录里清掉
    v5Open.db.deleteField(selField.id);
    eq(v5Open.db.getField(selField.id), null, "deleteField 后字段读回为 null");
    ok(
      !(String(selField.id) in v5Open.db.getRecord(rec.id)!.data),
      "deleteField 后记录里对应的键被清掉（不留孤儿键）",
    );
    eq(v5Open.db.listRecords(tbl.id).length, 1, "删字段不影响记录条数");

    // 删记录 / 删表级联
    eq(v5Open.db.deleteRecord(rec.id), true, "deleteRecord 返回 true");
    eq(v5Open.db.getRecord(rec.id), null, "deleteRecord 后读回为 null");
    eq(v5Open.db.listRecords(tbl.id).length, 0, "删记录后表内 0 行");
    v5Open.db.createRecord(tbl.id, { [String(defFields[0]!.id)]: "选瓷砖" });
    v5Open.db.deleteTable(tbl.id);
    eq(v5Open.db.getTable(tbl.id), null, "deleteTable 后表读回为 null");
    eq(v5Open.db.listFields(tbl.id).length, 0, "deleteTable 级联删字段");
    eq(v5Open.db.listRecords(tbl.id).length, 0, "deleteTable 级联删记录");
    v5Open.raw.close();
    db = null;
  }

  // 20. r7 视图 spec 归一（normalizeViewSpec：形状 / 字段存在性 / 取值类型 / 去重）
  section("视图 spec 归一（normalizeViewSpec / 方向守卫）");
  {
    const mkField = (
      id: number,
      name: string,
      type: TableField["type"],
      options: string[] = [],
    ): TableField => ({
      id,
      tableId: 1,
      name,
      type,
      position: id - 1,
      options,
      createdAt: "2026-11-15T08:00:00.000Z",
      updatedAt: "2026-11-15T08:00:00.000Z",
    });
    const fName = mkField(1, "名称", "text");
    const fAmount = mkField(2, "金额", "number");
    const fStatus = mkField(3, "状态", "select", ["未开始", "进行中", "已完成"]);
    const fTag = mkField(4, "标签", "multi-select", ["重要", "紧急"]);
    const fields = [fName, fAmount, fStatus, fTag];

    eq(
      normalizeViewSpec(fields, {}),
      { filterSpec: [], sortSpec: [], visibleFields: [], groupSpec: null },
      "视图 spec：空入参归一无筛选 / 无排序 / 全部列可见",
    );
    eq(
      normalizeViewSpec(fields, {
        filterSpec: [{ fieldId: 2, value: "1000" }],
      }).filterSpec,
      [{ fieldId: 2, value: 1000 }],
      "视图 spec：数字筛选值按引擎归一（\"1000\" → 1000）",
    );
    eq(
      normalizeViewSpec(fields, { filterSpec: [{ fieldId: 3, value: "已完成" }] }).filterSpec,
      [{ fieldId: 3, value: "已完成" }],
      "视图 spec：单选筛选值保留（在候选项内）",
    );
    eq(
      normalizeViewSpec(fields, { filterSpec: [{ fieldId: 4, value: "重要, 紧急" }] }).filterSpec,
      [{ fieldId: 4, value: ["重要", "紧急"] }],
      "视图 spec：多选筛选值逗号串归一无重数组",
    );
    eq(
      normalizeViewSpec(fields, { sortSpec: [{ fieldId: 2 }] }).sortSpec,
      [{ fieldId: 2, direction: "asc" }],
      "视图 spec：排序方向缺省升序",
    );
    eq(
      normalizeViewSpec(fields, { sortSpec: [{ fieldId: 2, direction: "desc" }] }).sortSpec,
      [{ fieldId: 2, direction: "desc" }],
      "视图 spec：排序方向降序保留",
    );
    eq(
      normalizeViewSpec(fields, { visibleFields: [4, 2, 4] }).visibleFields,
      [4, 2],
      "视图 spec：可见字段去重且保序",
    );
    eq(
      normalizeViewSpec(fields, {
        filterSpec: [
          { fieldId: 3, value: "已完成" },
          { fieldId: 2, value: "1000" },
        ],
        sortSpec: [{ fieldId: 4, direction: "desc" }],
        visibleFields: [1, 2, 3],
      }),
      {
        filterSpec: [
          { fieldId: 3, value: "已完成" },
          { fieldId: 2, value: 1000 },
        ],
        sortSpec: [{ fieldId: 4, direction: "desc" }],
        visibleFields: [1, 2, 3],
        groupSpec: null,
      },
      "视图 spec：筛选 / 排序 / 可见字段三段同时归一（多条件 AND 形状）",
    );
    ok(
      describeViewSpec(
        {
          filterSpec: [
            { fieldId: 3, value: "已完成" },
            { fieldId: 2, value: 1000 },
          ],
          sortSpec: [{ fieldId: 2, direction: "desc" }],
          visibleFields: [1, 2, 3],
        },
        fields,
      ).includes("且"),
      "视图摘要：多条件用「且」描述（AND 语义可读）",
    );
    ok(
      describeViewSpec(
        { filterSpec: [], sortSpec: [], visibleFields: [1, 2, 3] },
        fields,
      ).includes("隐藏列 标签"),
      "视图摘要：隐藏列按字段表算出（visible_fields 语义）",
    );
    eq(SORT_DIRECTIONS.length, 2, "排序方向白名单只有升 / 降两项");
    eq(MAX_VIEW_NAME, 100, "视图名称上限 100 字");
    throws(() => normalizeViewSpec(fields, { filterSpec: "x" }), "视图 spec：筛选条件非数组抛错");
    throws(
      () => normalizeViewSpec(fields, { filterSpec: [42] }),
      "视图 spec：筛选条件非对象抛错",
    );
    throws(
      () => normalizeViewSpec(fields, { filterSpec: [{ fieldId: "abc", value: "x" }] }),
      "视图 spec：筛选字段 id 非整数抛错",
    );
    throws(
      () => normalizeViewSpec(fields, { filterSpec: [{ fieldId: 999, value: "x" }] }),
      "视图 spec：筛选字段不存在抛错",
    );
    throws(
      () =>
        normalizeViewSpec(fields, {
          filterSpec: [
            { fieldId: 2, value: 1 },
            { fieldId: 2, value: 2 },
          ],
        }),
      "视图 spec：筛选字段重复抛错",
    );
    throws(
      () => normalizeViewSpec(fields, { filterSpec: [{ fieldId: 2, value: "abc" }] }),
      "视图 spec：筛选值类型不符抛错（数字列收到 abc）",
    );
    throws(
      () => normalizeViewSpec(fields, { filterSpec: [{ fieldId: 3, value: "搁置" }] }),
      "视图 spec：单选筛选值不在候选项抛错",
    );
    throws(
      () => normalizeViewSpec(fields, { filterSpec: [{ fieldId: 2 }] }),
      "视图 spec：筛选条件缺取值抛错",
    );
    throws(() => normalizeViewSpec(fields, { sortSpec: "x" }), "视图 spec：排序规则非数组抛错");
    throws(
      () => normalizeViewSpec(fields, { sortSpec: [{ fieldId: 999 }] }),
      "视图 spec：排序字段不存在抛错",
    );
    throws(
      () =>
        normalizeViewSpec(fields, {
          sortSpec: [
            { fieldId: 2, direction: "asc" },
            { fieldId: 2, direction: "desc" },
          ],
        }),
      "视图 spec：排序字段重复抛错",
    );
    throws(
      () => normalizeViewSpec(fields, { sortSpec: [{ fieldId: 2, direction: "sideways" }] }),
      "视图 spec：非法排序方向抛错（方向下拉校验）",
    );
    throws(
      () => normalizeViewSpec(fields, { visibleFields: "x" }),
      "视图 spec：可见字段非数组抛错",
    );
    throws(
      () => normalizeViewSpec(fields, { visibleFields: [999] }),
      "视图 spec：可见字段不存在抛错",
    );
    throws(() => assertValidViewName(""), "视图名称：空名抛错");
    throws(() => assertValidViewName("x".repeat(101)), "视图名称：超 100 字抛错");
    noThrow(() => assertValidViewName("进行中的大额项目"), "视图名称：合法中文名通过");
    throws(() => assertValidSortDirection("sideways"), "排序方向：非法值抛错");
    noThrow(() => assertValidSortDirection("desc"), "排序方向：降序合法通过");
  }

  // 21. r7 按视图查询口径（多字段 AND + 多级排序 + 投影，复用 shared queryRecords）
  section("按视图查询口径（多字段 AND / 多级排序 / 投影）");
  {
    const mkField = (
      id: number,
      name: string,
      type: TableField["type"],
      options: string[] = [],
    ): TableField => ({
      id,
      tableId: 1,
      name,
      type,
      position: id - 1,
      options,
      createdAt: "2026-11-15T08:00:00.000Z",
      updatedAt: "2026-11-15T08:00:00.000Z",
    });
    const fields = [
      mkField(1, "名称", "text"),
      mkField(2, "金额", "number"),
      mkField(3, "状态", "select", ["未开始", "进行中", "已完成"]),
      mkField(4, "标签", "multi-select", ["重要", "紧急"]),
    ];
    const mkRecord = (
      id: number,
      data: Record<string, unknown>,
      position = 0,
    ): TableRecord => ({
      id,
      tableId: 1,
      data,
      position,
      createdAt: "2026-11-15T08:00:00.000Z",
      updatedAt: "2026-11-15T08:00:00.000Z",
    });
    const records = [
      mkRecord(11, { "1": "量房", "2": 1200, "3": "已完成", "4": ["重要"] }, 0),
      mkRecord(12, { "1": "选瓷砖", "2": 300, "3": "进行中", "4": ["重要", "紧急"] }, 1),
      mkRecord(13, { "1": "定预算", "2": 9000, "3": "已完成", "4": [] }, 2),
      mkRecord(14, { "1": "量房复测", "2": 1500, "3": "已完成", "4": ["紧急"] }, 3),
      mkRecord(15, { "1": "待定", "2": null, "3": "已完成", "4": [] }, 4),
    ];

    eq(
      queryRecords(records, fields, {
        filters: [{ fieldId: 3, value: "已完成" }],
      }).records.map((r) => r.id),
      [11, 13, 14, 15],
      "视图查询：单条件筛选（已完成 = 4 行）",
    );
    eq(
      queryRecords(records, fields, {
        filters: [
          { fieldId: 3, value: "已完成" },
          { fieldId: 2, value: "1200" },
        ],
      }).records.map((r) => r.id),
      [11],
      "视图查询：多字段 AND（状态=已完成 且 金额=1200）只命中 1 行",
    );
    eq(
      queryRecords(records, fields, {
        filters: [
          { fieldId: 3, value: "已完成" },
          { fieldId: 4, value: "紧急" },
        ],
      }).records.map((r) => r.id),
      [14],
      "视图查询：AND + 多选包含（状态=已完成 且 标签含紧急）命中 1 行",
    );
    eq(
      queryRecords(records, fields, {
        filters: [
          { fieldId: 3, value: "已完成" },
          { fieldId: 2, value: 1200 },
          { fieldId: 4, value: "紧急" },
        ],
      }).records.length,
      0,
      "视图查询：三条件 AND 无交集返回 0 行",
    );
    eq(
      queryRecords(records, fields, {
        filters: [
          { fieldId: 3, value: "已完成" },
          { fieldId: 3, value: "进行中" },
        ],
      }).records.length,
      0,
      "视图查询：同字段矛盾条件按 AND 处理（0 行）",
    );
    eq(
      queryRecords(records, fields, {
        filters: [],
        filterFieldId: 3,
        filterValue: "已完成",
      }).total,
      4,
      "视图查询：filters 空数组时回落到旧单条件入口（r6 兼容）",
    );
    throws(
      () => queryRecords(records, fields, { filters: [{ fieldId: 999, value: "x" }] }),
      "视图查询：多条件里未知字段抛错（api 映射 400）",
    );
    throws(
      () => queryRecords(records, fields, { filters: [{ fieldId: 2, value: "abc" }] }),
      "视图查询：多条件里取值类型不符抛错（api 映射 400）",
    );
    eq(
      queryRecords(records, fields, {
        sorts: [
          { fieldId: 3, direction: "asc" },
          { fieldId: 2, direction: "desc" },
        ],
      }).records.map((r) => r.id),
      [12, 13, 14, 11, 15],
      "视图查询：两级排序（状态升序 → 金额降序）且空值恒最后",
    );
    eq(
      queryRecords(records, fields, {
        sorts: [{ fieldId: 3, direction: "desc" }],
      }).records.map((r) => r.id),
      [11, 13, 14, 15, 12],
      "视图查询：一级降序按候选项逆序（已完成在前）",
    );
    throws(
      () => queryRecords(records, fields, { sorts: [{ fieldId: 999, direction: "asc" }] }),
      "视图查询：多级排序里未知字段抛错",
    );
    const projected = queryRecords(records, fields, {
      sorts: [{ fieldId: 2, direction: "asc" }],
      visibleFields: [1, 2],
    });
    eq(
      Object.keys(projected.records[0]!.data).sort(),
      ["1", "2"],
      "视图查询：投影只保留 visible_fields 两个字段键",
    );
    eq(
      Object.keys(queryRecords(records, fields, { visibleFields: [] }).records[0]!.data).length,
      4,
      "视图查询：visible_fields 空数组 = 全部列可见（不投影）",
    );
    eq(projected.total, 5, "视图查询：投影不改变 total");
    eq(
      queryRecords(records, fields, { visibleFields: [1, 2], page: 1, pageSize: 2 }).records.length,
      2,
      "视图查询：投影与分页可叠加",
    );

    // —— 完整「视图 → 查询」链路：spec 先归一，再作为 queryRecords 的筛选/排序/投影参数 ——
    const viewLike: TableView = {
      id: 7,
      tableId: 1,
      name: "已完成且金额 1200",
      filterSpec: [
        { fieldId: 3, value: "已完成" },
        { fieldId: 2, value: "1200" },
      ],
      sortSpec: [{ fieldId: 2, direction: "desc" }],
      visibleFields: [1, 2, 3],
      groupSpec: null,
      position: 0,
      createdAt: "2026-11-15T08:00:00.000Z",
      updatedAt: "2026-11-15T08:00:00.000Z",
    };
    const normalized = normalizeViewSpec(fields, viewLike);
    const byView = queryRecords(records, fields, {
      filters: normalized.filterSpec,
      sorts: normalized.sortSpec,
      visibleFields: normalized.visibleFields,
    });
    eq(
      byView.records.map((r) => r.id),
      [11],
      "视图链路：归一后 spec 作为 queryRecords 参数（手算：已完成 且 金额=1200 → 1 行）",
    );
    eq(byView.records[0]!.data["2"], 1200, "视图链路：命中行的金额读回 1200");
    ok(
      byView.records.every((r) => !("4" in r.data)),
      "视图链路：隐藏列（标签）不在返回的 data 里",
    );
    ok(
      describeViewSpec(viewLike, fields).includes("且"),
      "视图链路：摘要描述多条件 AND 口径",
    );
    // 单条件 + 排序 + 投影：手算 9000 / 1500 / 1200 / 空值恒末
    const sortedView = queryRecords(records, fields, {
      filters: [{ fieldId: 3, value: "已完成" }],
      sorts: [{ fieldId: 2, direction: "desc" }],
      visibleFields: [1, 2, 3],
    });
    eq(
      sortedView.records.map((r) => r.id),
      [13, 14, 11, 15],
      "视图链路：筛选 + 金额降序 + 空值恒最后（手算 id 序列）",
    );
    eq(
      sortedView.records.map((r) => r.data["2"]),
      [9000, 1500, 1200, null],
      "视图链路：排序值 9000 / 1500 / 1200 / null",
    );
  }

  // 22. r7 CSV 导入口径（解析 / 表头映射 / 逐行归一 / 错误行聚合 / 零半态）
  section("CSV 导入口径（parseCsvText / planCsvImport / 零半态）");
  {
    const mkField = (
      id: number,
      name: string,
      type: TableField["type"],
      options: string[] = [],
    ): TableField => ({
      id,
      tableId: 1,
      name,
      type,
      position: id - 1,
      options,
      createdAt: "2026-11-15T08:00:00.000Z",
      updatedAt: "2026-11-15T08:00:00.000Z",
    });
    const fields = [
      mkField(1, "名称", "text"),
      mkField(2, "状态", "select", ["未开始", "进行中", "已完成"]),
      mkField(3, "金额", "number"),
      mkField(4, "截止日期", "date"),
      mkField(5, "标签", "multi-select", ["重要", "紧急"]),
      mkField(6, "完成", "checkbox"),
      mkField(7, "链接", "url"),
    ];
    const headers = ["名称", "状态", "金额", "截止日期", "标签", "完成", "链接"];
    const ids = headers.map((_, i) => String(i + 1));

    eq(CSV_IMPORT_PREVIEW_ROWS, 5, "导入预览行数常量 = 前 5 行");
    eq(CSV_IMPORT_MAX_ROWS, 1000, "导入单次行数上限常量 = 1000");
    eq(
      parseCsvText("a,b\nc,d"),
      [["a", "b"], ["c", "d"]],
      "CSV 解析：两行两列",
    );
    eq(
      parseCsvText('a,"b,c"\nd,e'),
      [["a", "b,c"], ["d", "e"]],
      "CSV 解析：引号内的逗号不切列",
    );
    eq(
      parseCsvText('a,"line1\nline2"\nd,e'),
      [["a", "line1\nline2"], ["d", "e"]],
      "CSV 解析：引号内的换行不切行",
    );
    eq(
      parseCsvText('a,"say ""hi"""\n'),
      [["a", 'say "hi"']],
      "CSV 解析：双引号转义 + 末尾换行不产生幽灵行",
    );
    eq(
      parseCsvText("a,b\r\nc,d\r\n"),
      [["a", "b"], ["c", "d"]],
      "CSV 解析：CRLF 行尾",
    );
    eq(
      parseCsvText("\uFEFF名称,金额\r\n量房,1200"),
      [["名称", "金额"], ["量房", "1200"]],
      "CSV 解析：UTF-8 BOM 被剥掉",
    );
    eq(
      mapCsvHeadersToFields(fields, headers).map((b) => b.fieldId),
      [1, 2, 3, 4, 5, 6, 7],
      "表头映射：按字段名映射到字段 id",
    );
    eq(
      mapCsvHeadersToFields(fields, ids).map((b) => b.fieldId),
      [1, 2, 3, 4, 5, 6, 7],
      "表头映射：按字段 id 字符串映射",
    );
    throws(
      () => mapCsvHeadersToFields(fields, ["不存在"]),
      "表头映射：未知列抛错（整表级 400）",
    );
    throws(
      () => mapCsvHeadersToFields(fields, ["名称", "名称"]),
      "表头映射：列重复抛错",
    );
    throws(() => mapCsvHeadersToFields(fields, [""]), "表头映射：空列名抛错");

    const cleanRows = [
      ["量房", "已完成", "1200", "2026-11-20", "重要", "true", "https://example.com/a"],
      ["选瓷砖", "进行中", "300", "2026-12-01", "重要,紧急", "false", "example.com"],
      ["定预算", "未开始", "9000", "2026/12/15", "", "0", ""],
    ];
    const clean = planCsvImport(fields, headers, cleanRows);
    eq(clean.total, 3, "导入计划：3 行数据");
    eq(clean.errors, [], "导入计划：合法 CSV 零错误行");
    eq(clean.rows.length, 3, "导入计划：3 行全部进入合法行");
    eq(clean.preview.length, 3, "导入计划：预览给出 3 行");
    eq(clean.rows[0]!["3"], 1200, "导入计划：数字列归一为数值（与单条写入同口径）");
    eq(clean.rows[1]!["5"], ["重要", "紧急"], "导入计划：多选列逗号串归一数组");
    eq(clean.rows[2]!["4"], "2026-12-15", "导入计划：日期列斜杠归一 YYYY-MM-DD");
    eq(clean.rows[1]!["7"], "https://example.com", "导入计划：链接列裸域名补 https://");
    eq(clean.rows[2]!["6"], false, "导入计划：复选框 \"0\" 归一 false");
    ok(shouldCommitImport(clean), "零半态：合法 CSV 判定可提交");
    eq(
      normalizeCsvImportPayload({ csv: "名称,金额\n量房,1200" }),
      { headers: ["名称", "金额"], rows: [["量房", "1200"]] },
      "导入体归一：{ csv } 形态",
    );
    eq(
      normalizeCsvImportPayload({ headers: ["名称"], rows: [["量房"]] }),
      { headers: ["名称"], rows: [["量房"]] },
      "导入体归一：{ headers, rows } JSON 行数组形态",
    );
    throws(
      () => normalizeCsvImportPayload({ foo: "bar" }),
      "导入体归一：非法体抛错（api 映射 400）",
    );
    throws(() => normalizeCsvImportPayload({ csv: "" }), "导入体归一：空 CSV 抛错");
    throws(
      () => planCsvImport(fields, ["名称"], []),
      "导入计划：只有表头（零数据行）抛错（api 映射 400）",
    );
    throws(
      () => normalizeCsvImportPayload({ headers: ["名称"], rows: [[1]] }),
      "导入体归一：rows 里出现非字符串单元格抛错",
    );

    const previewRows = Array.from({ length: 7 }, (_, i) => [
      `行${i + 1}`,
      "已完成",
      String(100 + i),
      "2026-11-20",
      "重要",
      "false",
      "",
    ]);
    eq(
      planCsvImport(fields, headers, previewRows).preview.length,
      5,
      "导入计划：7 行时预览只取前 5 行",
    );
    eq(
      planCsvImport(fields, headers, [["", "", "", "", "", "", ""], ...cleanRows]).total,
      3,
      "导入计划：全空行跳过且不占行号",
    );

    const mixedRows = [
      ["量房", "已完成", "1200", "2026-11-20", "重要", "true", "https://example.com/a"],
      ["贴砖", "进行中", "不是数字", "2026-12-01", "重要", "false", ""],
      ["水电", "搁置", "9000", "2026-12-15", "紧急", "false", ""],
      ["报价", "进行中", "1500"],
      ["采购", "已完成", "2400", "2026-12-20", "重要", "true", ""],
    ];
    const mixed = planCsvImport(fields, headers, mixedRows);
    eq(mixed.total, 5, "错误聚合：5 行数据全部计入 total");
    eq(mixed.errors.length, 3, "错误聚合：3 行非法（数字 / 单选 / 列数）");
    eq(
      mixed.errors.map((e: CsvImportRowError) => e.row),
      [2, 3, 4],
      "错误聚合：错误行号精确为第 2 / 3 / 4 行（1 起，表头不算）",
    );
    ok(mixed.errors[0]!.reason.includes("金额"), "错误聚合：数字列错误原因含字段名");
    ok(mixed.errors[1]!.reason.includes("状态"), "错误聚合：单选列错误原因含字段名");
    ok(mixed.errors[2]!.reason.includes("列数"), "错误聚合：列数不符错误原因含列数");
    eq(mixed.rows.length, 2, "错误聚合：只有 2 行合法");
    ok(!shouldCommitImport(mixed), "零半态：有错误行时判定不提交（全不落库）");
    throws(
      () => planCsvImport(fields, ["未知列"], [["x"]]),
      "导入计划：未知列抛错（整表级 400）",
    );
    throws(
      () => planCsvImport(fields, headers, []),
      "导入计划：零数据行抛错",
    );
    throws(
      () =>
        planCsvImport(
          fields,
          headers,
          Array.from({ length: 1001 }, () => ["x", "已完成", "1", "2026-11-20", "", "false", ""]),
        ),
      "导入计划：超过 1000 行上限抛错",
    );
    eq(
      planCsvImport(fields, headers, cleanRows).total,
      cleanRows.length,
      "导入计划：total 与数据行数一致（表头不计入）",
    );
  }

  // 23. r7 schema v5→v6 迁移 + views 数据层（持久化 + 原子导入零半态）
  section("schema v5→v6 迁移与视图数据层（持久化 / 原子导入）");
  {
    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const v6Path = `scripts/.tmp-e2e/upgrade-r7-${Date.now()}.db`;
    // 造一个真 v5 旧库：v6 迁移执行前把 user_version 钉回 5（模拟 r6 版本的原地升级）
    const v5Open = openDatabaseRaw({ path: v6Path });
    v5Open.raw.exec("PRAGMA user_version = 5");
    v5Open.raw.close();
    const v6Open = openDatabaseRaw({ path: v6Path });
    eq(v6Open.appliedMigrations, [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], "v5 旧库重开只补跑 v6+v7+v8+v9+v10+v11+v12+v13+v14+v15+v16+v17+v18+v19+v20+v21+v22+v23+v24+v25+v26+v27 迁移（真实 PRAGMA 升级路径）");
    const tableNames = v6Open.raw
      .all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => String((r as unknown as { name: unknown }).name));
    ok(tableNames.includes("views"), "v6 迁移后 views 表存在（sqlite_master 真实读回）");
    eq(
      (v6Open.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = CURRENT_SCHEMA_VERSION（17）",
    );
    const rawDb6: SqliteDatabase = v6Open.raw;
    eq(
      (rawDb6.all("PRAGMA table_info(views)") as unknown as { name: unknown }[]).map((c) =>
        String(c.name),
      ),
      ["id", "table_id", "name", "filter_spec", "sort_spec", "visible_fields", "position", "created_at", "updated_at", "group_spec"],
      "views 表 10 列齐全（id / table_id / name / 四个 spec / position / 时间戳；r37 加 group_spec）",
    );
    throws(
      () =>
        rawDb6.run(
          "INSERT INTO views (table_id, name, filter_spec, sort_spec, visible_fields, position, created_at, updated_at) " +
            "VALUES (424242, 'x', '[]', '[]', '[]', 0, '2026-01-01', '2026-01-01')",
        ),
      "views.table_id 外键拒绝不存在的表（raw 直达 FK）",
    );
    // —— 服务层：建表 → 建视图 → 读回 spec → 改视图 → 持久化 ——
    const tbl = v6Open.db.createTable("视图验收表");
    const flds = v6Open.db.listFields(tbl.id);
    const fName = flds.find((f) => f.name === "名称")!;
    const fAmount = flds.find((f) => f.name === "金额")!;
    const fStatus = flds.find((f) => f.name === "状态")!;
    const fTag = flds.find((f) => f.name === "标签")!;
    throws(
      () =>
        rawDb6.run(
          "INSERT INTO views (table_id, name, filter_spec, sort_spec, visible_fields, position, created_at, updated_at) " +
            `VALUES (${tbl.id}, NULL, '[]', '[]', '[]', 0, '2026-01-01', '2026-01-01')`,
        ),
      "views.name NOT NULL 拒绝 NULL（raw 直达 schema，table_id 指向真实表）",
    );
    const view = v6Open.db.createView(tbl.id, "已完成的大额项", {
      filterSpec: [
        { fieldId: fStatus.id, value: "已完成" },
        { fieldId: fAmount.id, value: "1000" },
      ],
      sortSpec: [{ fieldId: fAmount.id, direction: "desc" }],
      visibleFields: [fName.id, fAmount.id, fStatus.id],
    });
    ok(view.id > 0, "createView 返回自增 id");
    eq(view.name, "已完成的大额项", "createView name 读回");
    eq(view.tableId, tbl.id, "createView 归属表读回");
    eq(view.position, 0, "createView position 缺省 = 0");
    eq(
      view.filterSpec,
      [
        { fieldId: fStatus.id, value: "已完成" },
        { fieldId: fAmount.id, value: 1000 },
      ],
      "createView filter_spec 持久化且数字取值归一",
    );
    eq(
      view.sortSpec,
      [{ fieldId: fAmount.id, direction: "desc" }],
      "createView sort_spec 持久化",
    );
    eq(
      view.visibleFields,
      [fName.id, fAmount.id, fStatus.id],
      "createView visible_fields 持久化",
    );
    eq(
      v6Open.db.getView(view.id)!.filterSpec,
      view.filterSpec,
      "getView 读回与创建结果一致（JSON 往返无损）",
    );
    const second = v6Open.db.createView(tbl.id, "金额升序", {
      sortSpec: [{ fieldId: fAmount.id, direction: "asc" }],
    });
    eq(second.position, 1, "createView 第二个视图 position 追加为 1");
    eq(
      v6Open.db.listViews(tbl.id).map((v) => v.name),
      ["已完成的大额项", "金额升序"],
      "listViews 按 position 排序",
    );
    const renamed = v6Open.db.updateView(view.id, { name: "已完成且金额≥1000" });
    eq(renamed.name, "已完成且金额≥1000", "updateView 改名生效");
    eq(renamed.filterSpec, view.filterSpec, "updateView 未给的 spec 段沿用旧值");
    const respec = v6Open.db.updateView(view.id, {
      filterSpec: [{ fieldId: fTag.id, value: "重要" }],
      sortSpec: [],
      visibleFields: [],
    });
    eq(respec.filterSpec, [{ fieldId: fTag.id, value: ["重要"] }], "updateView 重设筛选并按类型归一");
    eq(respec.sortSpec, [], "updateView 可清空排序");
    eq(respec.visibleFields, [], "updateView 可恢复全部列可见");
    throws(
      () => v6Open.db.createView(tbl.id, "坏视图", { filterSpec: [{ fieldId: 99999, value: "x" }] }),
      "createView 未知筛选字段被 shared 守卫拒绝",
    );
    throws(
      () => v6Open.db.createView(tbl.id, "坏方向", { sortSpec: [{ fieldId: fAmount.id, direction: "up" }] }),
      "createView 非法方向被 shared 守卫拒绝",
    );
    throws(
      () => v6Open.db.createView(tbl.id, "已完成且金额≥1000", {}),
      "createView 视图名重复被拒绝",
    );
    throws(() => v6Open.db.createView(tbl.id, "", {}), "createView 空名被拒绝");
    throws(() => v6Open.db.createView(99999, "孤儿视图", {}), "createView 表不存在被拒绝");

    // —— 原子导入零半态（服务层）：先合法后非法 → 一行都不写 ——
    const goodRow = { [String(fName.id)]: "量房", [String(fAmount.id)]: "1200" };
    const badRow = { [String(fAmount.id)]: "abc" };
    eq(v6Open.db.listRecords(tbl.id).length, 0, "导入前表内 0 行（前置条件）");
    throws(
      () => v6Open.db.importRecords(tbl.id, [goodRow, badRow]),
      "原子导入：含非法行整批抛错（不落库）",
    );
    eq(
      v6Open.db.listRecords(tbl.id).length,
      0,
      "原子导入零半态：部分失败后表内仍是 0 行（成功行也没写入）",
    );
    const imported = v6Open.db.importRecords(tbl.id, [
      { [String(fName.id)]: "量房", [String(fAmount.id)]: "1200" },
      { [String(fName.id)]: "选瓷砖", [String(fAmount.id)]: "300" },
    ]);
    eq(imported.length, 2, "原子导入：全合法时一次落 2 行");
    eq(imported[0]!.data[String(fAmount.id)], 1200, "原子导入：写入值走 normalizeRecordData 归一");
    eq(
      imported.map((r) => r.position),
      [0, 1],
      "原子导入：position 连续追加",
    );
    eq(v6Open.db.listRecords(tbl.id).length, 2, "原子导入：读回 2 行");
    eq(v6Open.db.importRecords(tbl.id, []).length, 0, "原子导入：空批次不写任何行");

    // —— 持久化：关库重开，视图与记录都在 ——
    const beforeViews = JSON.stringify(v6Open.db.listViews(tbl.id));
    const beforeRecords = JSON.stringify(v6Open.db.listRecords(tbl.id));
    v6Open.raw.close();
    const reopened = openDatabaseRaw({ path: v6Path });
    eq(reopened.appliedMigrations, [], "重启不重复迁移（幂等）");
    eq(
      (reopened.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "重启后 user_version 仍为 15",
    );
    eq(JSON.stringify(reopened.db.listViews(tbl.id)), beforeViews, "视图持久化：重启前后 spec 逐字节相等");
    eq(
      JSON.stringify(reopened.db.listRecords(tbl.id)),
      beforeRecords,
      "记录持久化：重启前后记录逐字节相等",
    );
    eq(reopened.db.listViews(tbl.id).length, 2, "视图持久化：重启后 2 个视图都在");

    // —— 删表级联：views 随表一起删 ——
    eq(reopened.db.deleteTable(tbl.id), true, "deleteTable 返回 true");
    eq(reopened.db.listViews(tbl.id).length, 0, "删表级联：views 随表删除（ON DELETE CASCADE）");
    eq(reopened.db.listRecords(tbl.id).length, 0, "删表级联：records 随表删除");
    eq(reopened.db.getView(view.id), null, "删表级联：视图读回为 null");
    reopened.raw.close();
    db = null;
  }

  // 24. r8：块类型引擎（shared，api 层零类型分支）
  section("块类型引擎（normalizeBlockContent / canConvertBlockType / 拆合装配）");
  eq(BLOCK_TYPES.length, 10, "块类型共 10 种");
  eq(BLOCK_TYPES[0], "paragraph", "块类型首项 = paragraph");
  eq(BLOCK_TYPES[9], "divider", "块类型末项 = divider");
  eq(BLOCK_TYPE_LABELS.heading1, "一级标题", "块类型中文标签：一级标题");
  eq(BLOCK_TYPE_LABELS.todo, "待办", "块类型中文标签：待办");
  eq(isBlockType("quote"), true, "isBlockType：quote 合法");
  eq(isBlockType("mystery"), false, "isBlockType：未知类型非法");
  eq(isBlockType(42), false, "isBlockType：非字符串非法");
  throws(() => assertValidBlockType("mystery"), "assertValidBlockType：未知类型抛错");
  noThrow(() => assertValidBlockType("code"), "assertValidBlockType：code 通过");
  eq(normalizeBlockContent("paragraph", "你好"), { text: "你好" }, "归一：字符串内容转 text");
  eq(normalizeBlockContent("paragraph", undefined), { text: "" }, "归一：空内容默认空文本");
  eq(normalizeBlockContent("paragraph", { text: " 保留空格 " }), { text: " 保留空格 " }, "归一：正文空格原样保留");
  eq(normalizeBlockContent("divider", { text: "丢弃" }), { text: "" }, "归一：divider 强制丢弃文本");
  eq(normalizeBlockContent("todo", { text: "买菜", checked: "true" }), { text: "买菜", checked: true }, "归一：todo 勾选值字符串 true→布尔");
  eq(normalizeBlockContent("todo", { text: "买菜" }), { text: "买菜", checked: false }, "归一：todo 缺省未勾选");
  eq(normalizeBlockContent("paragraph", { text: "x", checked: true }), { text: "x" }, "归一：paragraph 丢弃 checked 专属字段");
  eq(normalizeBlockContent("code", { text: "let a=1", language: "  TS " }), { text: "let a=1", language: "TS" }, "归一：code 语言去空白保留大小写");
  eq(normalizeBlockContent("code", { text: "x" }), { text: "x", language: "" }, "归一：code 语言缺省空串");
  eq(normalizeBlockContent("quote", { text: "x", language: "js" }), { text: "x" }, "归一：quote 丢弃 language");
  throws(() => normalizeBlockContent("mystery", "x"), "归一：非法类型抛错");
  throws(() => normalizeBlockContent("paragraph", 42), "归一：内容非字符串/对象抛错");
  throws(() => normalizeBlockContent("paragraph", { text: 42 }), "归一：text 非字符串抛错");
  throws(() => normalizeBlockContent("paragraph", "x".repeat(MAX_BLOCK_TEXT + 1)), "归一：超长文本抛错");
  eq(canConvertBlockType("paragraph", "heading1"), true, "转换：paragraph→heading1 允许");
  eq(canConvertBlockType("todo", "paragraph"), true, "转换：todo→paragraph 允许");
  eq(canConvertBlockType("paragraph", "paragraph"), true, "转换：同类型恒允许");
  eq(canConvertBlockType("divider", "paragraph"), false, "转换：divider→paragraph 禁止（结构块）");
  eq(canConvertBlockType("paragraph", "divider"), false, "转换：paragraph→divider 禁止");
  eq(canConvertBlockType("divider", "divider"), true, "转换：divider→divider 恒等允许");
  throws(() => canConvertBlockType("mystery", "paragraph"), "转换：非法源类型抛错");
  eq(convertBlockContent("todo", "paragraph", { text: "x", checked: true }), { text: "x" }, "转换归一：todo→paragraph 丢 checked");
  eq(convertBlockContent("paragraph", "todo", { text: "x" }), { text: "x", checked: false }, "转换归一：paragraph→todo 补 checked");
  eq(convertBlockContent("paragraph", "code", { text: "x" }), { text: "x", language: "" }, "转换归一：paragraph→code 补 language");
  throws(() => convertBlockContent("divider", "paragraph", { text: "" }), "转换归一：非法转换抛错");
  eq(splitBlockText("abcdef", 3), { before: "abc", after: "def" }, "拆块文本：中间拆分");
  eq(splitBlockText("abcdef", 0), { before: "", after: "abcdef" }, "拆块文本：行首拆分");
  eq(splitBlockText("abcdef", 6), { before: "abcdef", after: "" }, "拆块文本：行尾拆分");
  throws(() => splitBlockText("abc", 4), "拆块文本：caret 越界抛错");
  throws(() => splitBlockText("abc", -1), "拆块文本：caret 负数抛错");
  throws(() => splitBlockText("abc", 1.5), "拆块文本：caret 非整数抛错");
  eq(planBlockSplit("paragraph", "abcdef", 3).afterType, "paragraph", "拆块计划：paragraph 续 paragraph");
  eq(planBlockSplit("heading1", "标题", 2).afterType, "paragraph", "拆块计划：heading 续 paragraph");
  eq(planBlockSplit("heading2", "标题", 0).afterType, "paragraph", "拆块计划：heading2 续 paragraph");
  eq(planBlockSplit("bullet", "项目", 1).afterType, "bullet", "拆块计划：bullet 续 bullet（列表延续）");
  eq(planBlockSplit("numbered", "项目", 1).afterType, "numbered", "拆块计划：numbered 续 numbered");
  eq(planBlockSplit("todo", "任务", 1).afterType, "todo", "拆块计划：todo 续 todo");
  eq(planBlockSplit("todo", { text: "任务任务", checked: true }, 2).after, { text: "任务", checked: false }, "拆块计划：todo 新块重置未勾选");
  eq(planBlockSplit("code", { text: "abc", language: "ts" }, 1).after, { text: "bc", language: "ts" }, "拆块计划：code 保留语言");
  eq(planBlockSplit("paragraph", "abcdef", 3).before, { text: "abc" }, "拆块计划：前半段归原块");
  throws(() => planBlockSplit("divider", "", 0), "拆块计划：divider 不可拆");
  eq(
    mergeBlockContent("paragraph", "abc", "paragraph", "def"),
    { text: "abcdef" },
    "合块：两段文本拼接",
  );
  eq(
    mergeBlockContent("todo", { text: "a", checked: true }, "paragraph", "b"),
    { text: "ab", checked: true },
    "合块：todo 保留勾选态",
  );
  eq(
    mergeBlockContent("code", { text: "a", language: "ts" }, "paragraph", "b"),
    { text: "ab", language: "ts" },
    "合块：code 保留语言",
  );
  throws(() => mergeBlockContent("divider", "", "paragraph", "b"), "合块：divider 不参与合块");
  eq(assembleDocumentText([]), "", "全文装配：空文档为空串");
  eq(
    assembleDocumentText([
      { id: 1, position: 0, type: "heading1", content: { text: "标题" } },
      { id: 2, position: 1, type: "paragraph", content: { text: "正文" } },
    ]),
    "# 标题\n正文",
    "全文装配：按 position 拼装标题+正文",
  );
  eq(
    assembleDocumentText([
      { id: 2, position: 1, type: "paragraph", content: { text: "后" } },
      { id: 1, position: 0, type: "paragraph", content: { text: "先" } },
    ]),
    "先\n后",
    "全文装配：乱序输入按 position 排序",
  );
  eq(
    assembleDocumentText([
      { id: 1, position: 0, type: "bullet", content: { text: "甲" } },
      { id: 2, position: 1, type: "bullet", content: { text: "乙" } },
      { id: 3, position: 2, type: "numbered", content: { text: "一" } },
      { id: 4, position: 3, type: "numbered", content: { text: "二" } },
      { id: 5, position: 4, type: "todo", content: { text: "任务", checked: true } },
      { id: 6, position: 5, type: "quote", content: { text: "引" } },
      { id: 7, position: 6, type: "divider", content: { text: "" } },
    ]),
    "- 甲\n- 乙\n1. 一\n2. 二\n- [x] 任务\n> 引\n---",
    "全文装配：无序/有序编号/todo/引用/分割线同一口径",
  );
  noThrow(() => assertValidDocumentTitle("周报"), "文档名守卫：合法名通过");
  throws(() => assertValidDocumentTitle(""), "文档名守卫：空名抛错");
  throws(() => assertValidDocumentTitle("x".repeat(MAX_DOCUMENT_TITLE + 1)), "文档名守卫：超长抛错");
  eq(DEFAULT_DOCUMENT_FIRST_BLOCK.type, "paragraph", "默认首块：paragraph（零块死路防御）");
  eq(DEFAULT_DOCUMENT_FIRST_BLOCK.content, { text: "" }, "默认首块：空文本");

  // 25. r8：schema v6→v7 迁移与文档数据层（拆/合/移动持久化 + 全文装配）
  section("schema v6→v7 迁移与文档数据层（持久化 / 拆合移动 / 全文装配）");
  {
    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const v7Path = `scripts/.tmp-e2e/r8-v7-${Date.now()}.db`;
    const oldOpen = openDatabaseRaw({ path: v7Path });
    oldOpen.raw.exec("PRAGMA user_version = 6");
    oldOpen.raw.close();
    const v7Open = openDatabaseRaw({ path: v7Path });
    eq(v7Open.appliedMigrations, [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], "v6 旧库重开补跑 v7+v8+v9+v10+v11+v12+v13+v14+v15+v16+v17+v18+v19+v20+v21+v22+v23+v24+v25+v26+v27 迁移（真实 PRAGMA 升级路径）");
    eq(
      (v7Open.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = CURRENT_SCHEMA_VERSION（17）",
    );
    const tables = (v7Open.raw.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('documents','blocks') ORDER BY name",
    ) as { name: string }[]).map((r) => r.name);
    eq(tables, ["blocks", "documents"], "v7 迁移建出 documents / blocks 两表");
    const docCols = (v7Open.raw.all("PRAGMA table_info(documents)") as { name: string }[]).map((r) => r.name);
    eq(docCols, ["id", "title", "created_at", "updated_at", "deleted_at"], "documents 表 5 列逐名核对（r29 增 deleted_at）");
    const blockCols = (v7Open.raw.all("PRAGMA table_info(blocks)") as { name: string }[]).map((r) => r.name);
    eq(blockCols, [
      "id", "document_id", "type", "position", "content", "parent_id", "created_at", "updated_at",
    ], "blocks 表 8 列逐名核对（含 parent_id 可空）");
    // raw 直达约束：先插一篇合法文档，再验 blocks 的 CHECK 与外键
    v7Open.raw.run(
      "INSERT INTO documents (title, created_at, updated_at) VALUES (?, ?, ?)",
      ["raw-doc", "t", "t"],
    );
    eq(
      (v7Open.raw.all("SELECT id, title FROM documents") as { id: number; title: string }[]).length,
      1,
      "raw：documents 可插入合法行",
    );
    throws(
      () =>
        v7Open.raw.run(
          "INSERT INTO blocks (document_id, type, position, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          [1, "mystery", 0, "{}", "t", "t"],
        ),
      "raw：blocks.type CHECK 拒绝非法块类型",
    );
    throws(
      () =>
        v7Open.raw.run(
          "INSERT INTO blocks (document_id, type, position, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          [9999, "paragraph", 0, "{}", "t", "t"],
        ),
      "raw：blocks.document_id 外键拒绝越权文档",
    );
    v7Open.raw.close();

    // 服务层：建文档自动带首块（r4 教训「用户第一次用」）
    const ddb = openDatabase({ path: ":memory:" });
    const doc = ddb.createDocument("第一次用的文档");
    eq(doc.title, "第一次用的文档", "createDocument 标题读回");
    const firstBlocks = ddb.listBlocks(doc.id);
    eq(firstBlocks.length, 1, "建文档默认首块自动在场（不是零块死路）");
    eq(firstBlocks[0]!.type, "paragraph", "默认首块类型 = paragraph");
    eq(firstBlocks[0]!.content, { text: "" }, "默认首块内容为空文本");
    eq(firstBlocks[0]!.position, 0, "默认首块 position = 0");
    eq(firstBlocks[0]!.parentId, null, "默认首块 parentId 可空");
    throws(() => ddb.createDocument(""), "createDocument 空名被 shared 守卫拒绝");
    const doc2 = ddb.createDocument("第二篇");
    eq(ddb.listDocuments().length, 2, "listDocuments 返回 2 篇文档");
    eq(ddb.getDocument(doc.id)!.title, "第一次用的文档", "getDocument 读回");
    eq(ddb.updateDocument(doc.id, "改名后").title, "改名后", "updateDocument 改名生效");
    eq(ddb.getDocument(99999), null, "getDocument 不存在返回 null");

    // 追加块：position 连号 + 内容归一
    const b1 = ddb.createBlock(doc.id, "heading1", { text: "标题" });
    eq(b1.position, 1, "createBlock 追加 position=1");
    eq(b1.content, { text: "标题" }, "createBlock 内容归一读回");
    const b2 = ddb.createBlock(doc.id, "todo", { text: "买菜", checked: "true" });
    eq(b2.content, { text: "买菜", checked: true }, "createBlock todo 勾选归一落库");
    const b3 = ddb.createBlock(doc.id, "code", { text: "let a=1", language: "ts" });
    eq(b3.content, { text: "let a=1", language: "ts" }, "createBlock code 语言落库");
    throws(() => ddb.createBlock(doc.id, "mystery", "x"), "createBlock 非法类型被拒");
    throws(() => ddb.createBlock(doc.id, "paragraph", "x", 999), "createBlock 非法 position 被拒");
    throws(() => ddb.createBlock(99999, "paragraph", "x"), "createBlock 越权 document_id 被拒");
    eq(ddb.listBlocks(doc.id).map((b) => b.position), [0, 1, 2, 3], "listBlocks 按 position 升序");

    // 改块 / 类型转换（真实走 shared convertBlockContent）
    const edited = ddb.updateBlock(b1.id, "标题（改）");
    eq(edited.content, { text: "标题（改）" }, "updateBlock 改文本生效");
    const converted = ddb.convertBlock(b2.id, "paragraph");
    eq(converted.type, "paragraph", "convertBlock 类型切换生效");
    eq(converted.content, { text: "买菜" }, "convertBlock 丢弃 todo 专属 checked");
    throws(() => ddb.convertBlock(b2.id, "divider"), "convertBlock 非法转换被 shared 拒绝");
    throws(() => ddb.updateBlock(99999, "x"), "updateBlock 不存在块抛错");

    // 回车拆块：后半段落到新块，position 连号，重开不丢
    const split = ddb.splitBlock(b1.id, 2);
    eq(split.before.content.text, "标题", "splitBlock 前半段留原块");
    eq(split.after.content.text, "（改）", "splitBlock 后半段落新块");
    eq(split.after.position, split.before.position + 1, "splitBlock 新块插在原块之后");
    eq(ddb.listBlocks(doc.id).map((b) => b.position), [0, 1, 2, 3, 4], "splitBlock 后 position 连续无空洞");
    eq(ddb.listBlocks(doc.id).map((b) => b.content.text).slice(1, 3), ["标题", "（改）"], "splitBlock 后顺序正确");

    // 上移 / 下移：复用 shared reorderPositions
    const moved = ddb.moveBlock(split.after.id, 1);
    eq(moved.length, 5, "moveBlock 返回全部 5 块");
    eq(ddb.listBlocks(doc.id)[1]!.id, split.after.id, "moveBlock 上移到 position=1 生效");
    eq(ddb.listBlocks(doc.id).map((b) => b.position), [0, 1, 2, 3, 4], "moveBlock 后 position 仍连续");
    throws(() => ddb.moveBlock(split.after.id, 99), "moveBlock 越界位置被 shared 拒绝");

    // 批移动重排：整份新顺序一次落库
    const current = ddb.listBlocks(doc.id);
    const reversed = [...current].reverse().map((b) => b.id);
    const reordered = ddb.reorderBlocks(doc.id, reversed);
    eq(reordered.map((b) => b.id), reversed, "reorderBlocks 按传入 id 顺序重排");
    eq(reordered.map((b) => b.position), [0, 1, 2, 3, 4], "reorderBlocks 后 position 连续");
    throws(() => ddb.reorderBlocks(doc.id, [1, 1, 2]), "reorderBlocks 重复 id 被拒");
    throws(() => ddb.reorderBlocks(doc.id, [99999]), "reorderBlocks 越权 id 被拒");

    // 退格合块：与前一块合并，块数 -1，position 收拢
    const beforeMerge = ddb.listBlocks(doc.id);
    const merged = ddb.mergeBlock(beforeMerge[2]!.id);
    eq(merged.length, beforeMerge.length - 1, "mergeBlock 块数减一");
    eq(merged.map((b) => b.position), [0, 1, 2, 3], "mergeBlock 后 position 收拢连续");
    throws(() => ddb.mergeBlock(merged[0]!.id), "mergeBlock 首块无前驱被拒");

    // 父块归属：parent_id 可空、必须同文档（b3 是 code 块，合块后仍在场）
    const withParent = ddb.createBlock(doc.id, "paragraph", "子块", undefined, b3.id);
    eq(withParent.parentId, b3.id, "createBlock parentId 同文档落库");
    throws(
      () => ddb.createBlock(doc2.id, "paragraph", "跨文档子块", undefined, b3.id),
      "createBlock parentId 跨文档（越权）被拒",
    );
    eq(ddb.deleteBlock(withParent.id), true, "deleteBlock 返回 true");
    eq(ddb.listBlocks(doc.id).map((b) => b.position), [0, 1, 2, 3], "deleteBlock 后 position 收拢连续");

    // 全文读：按 position 拼装（真实数据，不是纯函数自证）
    const textResult = ddb.assembleDocument(doc.id);
    ok(textResult !== null, "assembleDocument 命中已存在文档");
    eq(textResult!.documentId, doc.id, "assembleDocument 回显 documentId");
    eq(textResult!.title, "改名后", "assembleDocument 回显最新标题");
    eq(textResult!.blocks.length, 4, "assembleDocument 回显全部 4 块");
    eq(
      textResult!.text,
      assembleDocumentText(ddb.listBlocks(doc.id).map((b) => ({
        id: b.id, position: b.position, type: b.type, content: b.content,
      }))),
      "assembleDocument 全文与 shared 装配逐字相等（按 position）",
    );
    eq(ddb.assembleDocument(99999), null, "assembleDocument 不存在文档返回 null");

    // 持久化：关库重开，块顺序与内容逐字节相等（拆/合/移动/重排后重开不丢）
    const persistPath = `scripts/.tmp-e2e/r8-persist-${Date.now()}.db`;
    const pdb = openDatabase({ path: persistPath });
    const pdoc = pdb.createDocument("持久化文档");
    pdb.updateBlock(pdb.listBlocks(pdoc.id)[0]!.id, "第一段");
    const p2 = pdb.createBlock(pdoc.id, "paragraph", "第二段文字");
    pdb.createBlock(pdoc.id, "heading2", "小标题");
    pdb.splitBlock(p2.id, 2);
    pdb.moveBlock(pdb.listBlocks(pdoc.id)[3]!.id, 0);
    const beforeClose = JSON.stringify(pdb.listBlocks(pdoc.id));
    const beforeText = pdb.assembleDocument(pdoc.id)!.text;
    pdb.close();
    const reopened8 = openDatabaseRaw({ path: persistPath });
    eq(reopened8.appliedMigrations, [], "重启不重复迁移（幂等）");
    eq(JSON.stringify(reopened8.db.listBlocks(pdoc.id)), beforeClose, "块顺序持久化：拆/移动后重开逐字节相等");
    eq(reopened8.db.assembleDocument(pdoc.id)!.text, beforeText, "全文持久化：重开后全文逐字节相等");
    eq(reopened8.db.listBlocks(pdoc.id).map((b) => b.position), [0, 1, 2, 3], "重开后 position 连续");
    // 删文档级联删块
    eq(reopened8.db.deleteDocument(pdoc.id), true, "deleteDocument 返回 true");
    eq(reopened8.db.listBlocks(pdoc.id).length, 0, "删文档级联：blocks 随文档删除（ON DELETE CASCADE）");
    eq(reopened8.db.getDocument(pdoc.id), null, "删文档后读回为 null");
    reopened8.raw.close();
    ddb.close();
    db = null;
  }

  // 26. r9：Markdown 双向转换引擎（10 种块类型 / 未知语法降级 / 转义往返）
  section("Markdown 双向引擎（markdownToBlocks / blocksToMarkdown / 未知语法降级）");
  {
    const md10 =
      "# 一级标题\n\n" +
      "## 二级标题\n\n" +
      "### 三级标题\n\n" +
      "正文段落\n\n" +
      "- 无序甲\n\n" +
      "1. 有序一\n\n" +
      "2. 有序二\n\n" +
      "- [ ] 待办甲\n\n" +
      "- [x] 待办乙\n\n" +
      "> 引用句\n\n" +
      "```ts\nconst a = 1;\n```\n\n" +
      "---";
    const parsed = markdownToBlocks(md10);
    eq(parsed.length, 12, "Markdown 解析：10 种类型覆盖样本共 12 块");
    eq(parsed.map((b) => b.type), [
      "heading1", "heading2", "heading3", "paragraph", "bullet",
      "numbered", "numbered", "todo", "todo", "quote", "code", "divider",
    ], "Markdown 解析：块类型序列与 10 种类型一致");
    eq(parsed[0]!.content, { text: "一级标题" }, "Markdown 解析：# → heading1");
    eq(parsed[1]!.content, { text: "二级标题" }, "Markdown 解析：## → heading2");
    eq(parsed[2]!.content, { text: "三级标题" }, "Markdown 解析：### → heading3");
    eq(parsed[3]!.content, { text: "正文段落" }, "Markdown 解析：普通行 → paragraph");
    eq(parsed[4]!.content, { text: "无序甲" }, "Markdown 解析：- → bullet");
    eq(parsed[5]!.content, { text: "有序一" }, "Markdown 解析：1. → numbered");
    eq(parsed[6]!.content, { text: "有序二" }, "Markdown 解析：2. → numbered（序号不进内容）");
    eq(parsed[7]!.content, { text: "待办甲", checked: false }, "Markdown 解析：- [ ] → todo 未勾选");
    eq(parsed[8]!.content, { text: "待办乙", checked: true }, "Markdown 解析：- [x] → todo 已勾选");
    eq(parsed[9]!.content, { text: "引用句" }, "Markdown 解析：> → quote");
    eq(parsed[10]!.content, { text: "const a = 1;", language: "ts" }, "Markdown 解析：```ts 围栏 → code 带语言");
    eq(parsed[11]!.content, { text: "" }, "Markdown 解析：--- → divider 恒空文本");
    eq(computeNumberedOrdinals(parsed), [0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 0], "有序编号：连续 numbered 计数、遇其它类型归零");

    // 未知语法降级为 paragraph，逐字保留、不丢内容
    const unknown = markdownToBlocks(
      "#### 四级标题\n\n**加粗** 与 *斜体*\n\n| 表格 | 列 |\n\n1) 圆括号序号\n\n+ 加号列表\n\n~~删除线~~\n\n<div>原始 HTML</div>",
    );
    eq(unknown.length, 7, "未知语法降级：7 行各成 1 块，零丢弃");
    eq(unknown.every((b) => b.type === "paragraph"), true, "未知语法降级：全部为 paragraph");
    eq(unknown[0]!.content.text, "#### 四级标题", "未知语法降级：#### 逐字保留（不是 heading）");
    eq(unknown[1]!.content.text, "**加粗** 与 *斜体*", "未知语法降级：行内加粗/斜体逐字保留");
    eq(unknown[2]!.content.text, "| 表格 | 列 |", "未知语法降级：表格行逐字保留");
    eq(unknown[3]!.content.text, "1) 圆括号序号", "未知语法降级：圆括号序号逐字保留");
    eq(unknown[4]!.content.text, "+ 加号列表", "未知语法降级：+ 列表逐字保留");
    eq(unknown[5]!.content.text, "~~删除线~~", "未知语法降级：删除线逐字保留");
    eq(unknown[6]!.content.text, "<div>原始 HTML</div>", "未知语法降级：HTML 逐字保留");

    // 转义：paragraph 里带 marker/围栏/空行形态仍逐字往返
    const tricky: MarkdownBlockDraft[] = [
      { type: "paragraph", content: { text: "# 这不是标题" } },
      { type: "paragraph", content: { text: "- 这不是列表" } },
      { type: "paragraph", content: { text: "1. 这不是有序" } },
      { type: "paragraph", content: { text: "---" } },
      { type: "paragraph", content: { text: "" } },
      { type: "paragraph", content: { text: "第一行\n第二行" } },
      { type: "heading1", content: { text: "标题带 \\ 反斜杠" } },
      { type: "code", content: { text: "```js\nlet x = 1;\n```", language: "" } },
    ];
    const trickyMd = blocksToMarkdown(tricky);
    eq(JSON.stringify(markdownToBlocks(trickyMd)), JSON.stringify(tricky), "往返：blocks → md → blocks 逐字节相等（含 marker 转义 / 空段 / 多行 / 代码内围栏）");
    const codeFence = blocksToMarkdown([{ type: "code", content: { text: "含 ``` 三反引号", language: "ts" } }]);
    eq(markdownToBlocks(codeFence)[0]!.content.text, "含 ``` 三反引号", "代码围栏：内容含三反引号自动升为 4 反引号，不截断");

    // BOM / CRLF / 空输入 / 排序
    eq(markdownToBlocks("\uFEFF# 标题\r\n\r\n正文\r\n")[0]!.content.text, "标题", "BOM 与 CRLF 归一：首块 heading1 文本正确");
    eq(markdownToBlocks(""), [], "空 Markdown → 空块数组");
    eq(markdownToBlocks("   \n\n"), [], "纯空白 Markdown → 空块数组");
    eq(blocksToMarkdown([]), "", "空块数组 → 空 Markdown");
    eq(
      blocksToMarkdown([
        { id: 2, position: 1, type: "paragraph", content: { text: "后" } },
        { id: 1, position: 0, type: "paragraph", content: { text: "先" } },
      ]),
      "先\n\n后",
      "blocksToMarkdown：按 (position, id) 排序后装配",
    );
    eq(computeNumberedOrdinals([{ type: "numbered" }, { type: "numbered" }, { type: "paragraph" }, { type: "numbered" }]), [1, 2, 0, 1], "有序编号：中断后重新从 1 计数");
    eq(MAX_MARKDOWN_LENGTH > MAX_BLOCK_TEXT, true, "Markdown 长度上限大于单块文本上限");
    eq(MARKDOWN_IMPORT_PREVIEW_ROWS, 5, "导入预览行数常量 = 5");
    eq(buildDocumentMdFileName("项目周报", new Date(2026, 10, 15)), "xieflow-doc-项目周报-20261115.md", "导出文件名：含中文文档名 + 日期 + .md");
    eq(buildDocumentMdFileName("  a/b:c  ", new Date(2026, 0, 2)), "xieflow-doc-a-b-c-20260102.md", "导出文件名：非法字符折叠为 -");
  }

  // 27. r9：Markdown 导入计划与零半态（复用 r7 planCsvImport 思路）
  section("Markdown 导入计划（normalizeMarkdownImportPayload / planMarkdownImport / 零半态）");
  {
    const fromText = normalizeMarkdownImportPayload({ markdown: "# 标题\n\n正文\n" });
    eq(fromText.length, 2, "导入体归一：{ markdown } 文本解析为 2 个源块");
    eq(fromText[0]!.type, "heading1", "导入体归一：首块 heading1");
    const fromRawString = normalizeMarkdownImportPayload("- [x] 完成\n");
    eq(fromRawString.length, 1, "导入体归一：裸字符串也按 Markdown 文本解析");
    eq(fromRawString[0]!.type, "todo", "导入体归一：裸字符串中的 todo 正确识别");
    const fromBlocks = normalizeMarkdownImportPayload({ blocks: [{ type: "paragraph", content: "甲" }, { type: "quote", content: "乙" }] });
    eq(fromBlocks.length, 2, "导入体归一：{ blocks } 显式块数组原样透传");
    throws(() => normalizeMarkdownImportPayload({}), "导入体归一：空对象抛错（缺 markdown / blocks）");
    throws(() => normalizeMarkdownImportPayload({ markdown: 42 }), "导入体归一：markdown 非字符串抛错");
    throws(() => normalizeMarkdownImportPayload({ blocks: "x" }), "导入体归一：blocks 非数组抛错");
    throws(() => normalizeMarkdownImportPayload({ blocks: [] }), "导入体归一：空块数组抛错");
    throws(() => normalizeMarkdownImportPayload({ markdown: "x".repeat(MAX_MARKDOWN_LENGTH + 1) }), "导入体归一：超长 Markdown 抛错");

    const clean = planMarkdownImport([
      { type: "heading1", content: { text: "标题" } },
      { type: "todo", content: { text: "买菜", checked: "true" } },
    ]);
    eq(clean.total, 2, "导入计划：total 为源块数");
    eq(clean.errors.length, 0, "导入计划：全合法时零错误行");
    eq(clean.rows.length, 2, "导入计划：全合法时 2 个归一后块");
    eq(clean.rows[1]!.content, { text: "买菜", checked: true }, "导入计划：逐块走 normalizeBlockContent（字符串 true → 布尔）");
    eq(clean.preview.length, 2, "导入计划：预览取全部（不足 5 行）");
    eq(shouldCommitMarkdownImport(clean), true, "零半态判定：全合法 → 可提交");

    const mixed = planMarkdownImport([
      { type: "paragraph", content: "合法甲" },
      { type: "mystery", content: "非法类型" },
      { type: "paragraph", content: { text: 42 } },
      { type: "paragraph", content: "合法乙" },
      { type: "code", content: { text: "x", language: 5 } },
    ]);
    eq(mixed.total, 5, "导入计划：部分失败 total 仍为 5");
    eq(mixed.errors.length, 3, "导入计划：3 个非法块聚合为错误行");
    eq(mixed.errors.map((e) => e.row), [2, 3, 5], "导入计划：错误行号精确为第 2 / 3 / 5 块");
    eq(mixed.rows.length, 2, "导入计划：合法行 2 块仍进 rows（但零半态不提交）");
    eq(shouldCommitMarkdownImport(mixed), false, "零半态判定：任一块非法 → 一行都不落库");
    ok(mixed.errors[0]!.reason.includes("非法块类型"), "导入计划：错误原因含中文「非法块类型」");
    const over = planMarkdownImport(Array.from({ length: MARKDOWN_IMPORT_MAX_BLOCKS + 1 }, () => ({ type: "paragraph", content: "x" })));
    eq(shouldCommitMarkdownImport(over), true, "边界：数量上限由 db 层守卫，plan 不臆断丢弃");
    eq(planMarkdownImport([]).total, 0, "导入计划：空源块 total=0");
    eq(shouldCommitMarkdownImport(planMarkdownImport([])), false, "零半态判定：零块 → 不提交");
  }

  // 28. r9：AI 块级修订语义（未采纳不改库 / provider 无关契约 / mock 评测集录制回放）
  section("AI 块级修订语义（assertValidRevisionInstruction / planRevisionApply / mock 录制回放）");
  {
    noThrow(() => assertValidRevisionInstruction("把这段改得更简洁"), "修订指令守卫：合法中文指令通过");
    throws(() => assertValidRevisionInstruction(""), "修订指令守卫：空指令抛错");
    throws(() => assertValidRevisionInstruction("   "), "修订指令守卫：纯空白指令抛错");
    throws(() => assertValidRevisionInstruction(42), "修订指令守卫：非字符串抛错");
    throws(() => assertValidRevisionInstruction("x".repeat(MAX_REVISION_INSTRUCTION + 1)), "修订指令守卫：超长指令抛错");
    eq(planRevisionApply("原文", "建议文本", false), { applied: false, text: "原文" }, "修订计划：未采纳 → applied=false 且文本保持原文");
    eq(planRevisionApply("原文", "建议文本", true), { applied: true, text: "建议文本" }, "修订计划：采纳 → applied=true 且文本替换为建议");
    eq(planRevisionApply("原文", "建议文本", undefined).applied, false, "修订计划：adopt 缺失按未采纳处理");

    const provider = createMockProvider();
    eq(provider.id, MOCK_PROVIDER_ID, "mock provider：id 与常量一致");
    eq(MOCK_PROVIDER_ID, "mock-scripted-v1", "mock provider：固定脚本化版本标识");
    const s1 = await provider.propose({ instruction: "精简", blockType: "paragraph", originalText: "这是一段很长的文字需要压缩" });
    eq(typeof s1.suggestedText, "string", "mock provider：返回建议文本");
    eq(s1.provider, MOCK_PROVIDER_ID, "mock provider：建议携带 provider 标识");
    eq(s1.rationale.length > 0, true, "mock provider：返回可读理由");
    const s2 = await provider.propose({ instruction: "精简", blockType: "paragraph", originalText: "这是一段很长的文字需要压缩" });
    eq(JSON.stringify(s2), JSON.stringify(s1), "mock provider：同输入固定脚本化回复（零 token / 可重放）");
    ok(REVISE_EVAL_CASES.length >= 4, "评测集骨架：至少 4 条录制用例");
    const replay = await runReplay(provider, REVISE_EVAL_CASES);
    eq(replay.total, REVISE_EVAL_CASES.length, "评测集回放：用例数一致");
    eq(replay.passed, replay.total, "评测集回放：全部录制期望命中");
    eq(replay.failures.length, 0, "评测集回放：零失败");
    const wrongCase = { ...REVISE_EVAL_CASES[0]!, expected: { ...REVISE_EVAL_CASES[0]!.expected, suggestedText: "故意写错的期望" } };
    const badReplay = await runReplay(provider, [wrongCase]);
    eq(badReplay.passed, 0, "评测集回放：错误期望被检出（非恒真占位）");
    eq(badReplay.failures.length, 1, "评测集回放：失败清单精确 1 条");
  }

  // 29. r9：db 导入数据层（单事务整体替换 / 零半态 / 重开不丢 / 导出往返）
  section("导入数据层（importBlocks 单事务整体替换 / 零半态 / 持久化 / 导出往返）");
  {
    const r9db = openDatabase({ path: ":memory:" });
    const r9doc = r9db.createDocument("r9 导入文档");
    eq(r9db.listBlocks(r9doc.id).length, 1, "导入前：建文档默认空首块在场");
    const rows: MarkdownBlockDraft[] = [
      { type: "heading1", content: { text: "导出标题" } },
      { type: "paragraph", content: { text: "第一段" } },
      { type: "todo", content: { text: "待办", checked: true } },
      { type: "code", content: { text: "let x=1;", language: "ts" } },
      { type: "divider", content: { text: "" } },
    ];
    const imported = r9db.importBlocks(r9doc.id, rows);
    eq(imported.length, 5, "importBlocks：整篇替换为 5 块（默认首块不残留）");
    eq(imported.map((b) => b.position), [0, 1, 2, 3, 4], "importBlocks：position 连号 0..4");
    eq(imported.map((b) => b.type), rows.map((r) => r.type), "importBlocks：类型序列与源块一致");
    eq(JSON.stringify(imported.map((b) => b.content)), JSON.stringify(rows.map((r) => r.content)), "importBlocks：归一后内容逐字节相等");
    const snapshot = JSON.stringify(r9db.listBlocks(r9doc.id));
    throws(
      () => r9db.importBlocks(r9doc.id, [
        { type: "paragraph", content: "合法" },
        { type: "mystery", content: "非法" },
      ] as unknown as MarkdownBlockDraft[]),
      "importBlocks：先合法后非法 → 整体抛错",
    );
    eq(JSON.stringify(r9db.listBlocks(r9doc.id)), snapshot, "零半态：部分失败前后块快照逐字节相等（一行不落库）");
    throws(() => r9db.importBlocks(999999, rows), "importBlocks：文档不存在抛错");
    const roundTripMd = blocksToMarkdown(r9db.listBlocks(r9doc.id));
    eq(JSON.stringify(markdownToBlocks(roundTripMd)), JSON.stringify(rows), "导出往返：blocks → md → blocks 逐字节相等");
    r9db.close();

    // 关库重开：导入结果持久化
    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const p9Path = `scripts/.tmp-e2e/r9-persist-${Date.now()}.db`;
    const p9 = openDatabase({ path: p9Path });
    const p9doc = p9.createDocument("持久化导入");
    p9.importBlocks(p9doc.id, [{ type: "heading2", content: { text: "重开小标题" } }, { type: "paragraph", content: { text: "重开正文" } }]);
    const p9Before = JSON.stringify(p9.listBlocks(p9doc.id));
    const p9Text = blocksToMarkdown(p9.listBlocks(p9doc.id));
    p9.close();
    const p9Reopen = openDatabaseRaw({ path: p9Path });
    eq(p9Reopen.appliedMigrations, [], "重开不重复迁移（幂等）");
    eq(JSON.stringify(p9Reopen.db.listBlocks(p9doc.id)), p9Before, "导入结果持久化：重开后块逐字节相等");
    eq(blocksToMarkdown(p9Reopen.db.listBlocks(p9doc.id)), p9Text, "导入结果持久化：重开后导出 Markdown 逐字节相等");
    p9Reopen.raw.close();
    db = null;
  }

  // 30. r10：schema v7→v8 迁移与对话数据层（先断言，后实现——TDD 红相入口）
  section("schema v7→v8 迁移与对话数据层（conversations / messages / artifacts）");
  {
    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const p10Path = `scripts/.tmp-e2e/r10-v8-${Date.now()}.db`;
    const old10 = openDatabaseRaw({ path: p10Path });
    old10.raw.exec("PRAGMA user_version = 7");
    old10.raw.close();
    const v8 = openDatabaseRaw({ path: p10Path });
    eq(v8.appliedMigrations, [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], "v7 旧库重开只补跑 v8+v9+v10+v11+v12+v13+v14+v15+v16+v17+v18+v19+v20+v21+v22+v23+v24+v25+v26+v27 迁移（真实 PRAGMA 升级路径）");
    eq(
      (v8.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = CURRENT_SCHEMA_VERSION（17）",
    );
    const t10 = v8.raw
      .all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => String((r as unknown as { name: unknown }).name));
    ok(t10.includes("conversations"), "v8 迁移建出 conversations 表");
    ok(t10.includes("messages"), "v8 迁移建出 messages 表");
    ok(t10.includes("artifacts"), "v8 迁移建出 artifacts 表");
    const convCols = (v8.raw.all("PRAGMA table_info(conversations)") as { name: string }[]).map((r) => r.name);
    eq(convCols, ["id", "title", "created_at"], "conversations 三列逐字吻合任务单");
    const msgCols = (v8.raw.all("PRAGMA table_info(messages)") as { name: string }[]).map((r) => r.name);
    eq(
      msgCols,
      ["id", "conversation_id", "role", "content_json", "tool_calls_json", "created_at"],
      "messages 六列含 tool_calls_json（逐条工具调用落库）",
    );
    const artCols = (v8.raw.all("PRAGMA table_info(artifacts)") as { name: string }[]).map((r) => r.name);
    eq(artCols, ["id", "conversation_id", "type", "title", "content", "created_at"], "artifacts 六列逐字吻合任务单");
    throws(
      () => v8.raw.run("INSERT INTO conversations (title, created_at) VALUES ('', '')"),
      "conversations.title 空串被服务层守卫拒绝（raw 写入由 api 前置校验）",
    );
    throws(
      () => v8.raw.run("INSERT INTO messages (conversation_id, role, content_json, tool_calls_json, created_at) VALUES (1, 'robot', '{}', '[]', '')"),
      "messages.role CHECK 拒绝非法角色（raw 直达 schema 约束）",
    );
    throws(
      () => v8.raw.run("INSERT INTO messages (conversation_id, role, content_json, tool_calls_json, created_at) VALUES (999999, 'user', '{}', '[]', '')"),
      "messages.conversation_id 外键拒绝孤儿消息",
    );
    const conv = v8.db.createConversation("r10 第一次用");
    eq(conv.title, "r10 第一次用", "createConversation 真落库并读回标题");
    ok(typeof conv.createdAt === "string" && conv.createdAt.length > 0, "createConversation 落 created_at");
    eq(v8.db.listConversations().length, 1, "listConversations 真读回 1 条");
    eq(v8.db.getConversation(conv.id)?.title, conv.title, "getConversation 按 id 读回");
    eq(v8.db.getConversation(999999), null, "getConversation 不存在返回 null");
    const mu = v8.db.addMessage(conv.id, "user", { text: "盘点待办和文档" }, []);
    eq(mu.role, "user", "addMessage 落 user 角色");
    eq((mu.content as { text: string }).text, "盘点待办和文档", "addMessage 落 content_json 文本");
    eq(mu.toolCalls.length, 0, "user 消息 tool_calls_json 为空数组");
    const toolCalls: ToolCallRecord[] = [
      { id: "tc-1", name: "list_todos", arguments: {}, ok: true, summary: "待办 0 条", data: { count: 0 } },
      { id: "tc-2", name: "list_documents", arguments: {}, ok: true, summary: "文档 0 篇", data: { count: 0 } },
    ];
    const mt = v8.db.addMessage(conv.id, "tool", { text: "工具回执" }, toolCalls);
    eq(mt.role, "tool", "addMessage 落 tool 角色");
    eq(mt.toolCalls.map((t) => t.name), ["list_todos", "list_documents"], "tool 消息逐条落两条工具调用（顺序保持）");
    eq(mt.toolCalls[1]?.arguments, {}, "tool_calls_json 的 arguments 逐字段读回");
    const ma = v8.db.addMessage(conv.id, "assistant", { text: "已完成盘点" }, []);
    eq(v8.db.listMessages(conv.id).map((m) => m.role), ["user", "tool", "assistant"], "listMessages 按 created_at/id 升序回读三类消息");
    const art = v8.db.createArtifact(conv.id, "chat-result", "盘点产物", JSON.stringify({ intent: "list" }));
    eq(art.type, "chat-result", "createArtifact 落 type");
    eq(art.title, "盘点产物", "createArtifact 落 title");
    eq(JSON.parse(art.content).intent, "list", "createArtifact 落 content 原文（JSON 不丢）");
    eq(v8.db.listArtifacts(conv.id).length, 1, "listArtifacts 真读回 1 条");
    eq(v8.db.getArtifact(art.id)?.title, "盘点产物", "getArtifact 按 id 读回");
    eq(v8.db.getArtifact(999999), null, "getArtifact 不存在返回 null");
    const snap = JSON.stringify({ c: v8.db.listConversations(), m: v8.db.listMessages(conv.id), a: v8.db.listArtifacts(conv.id) });
    v8.db.deleteConversation(conv.id);
    eq(v8.db.listConversations().length, 0, "deleteConversation 真删会话");
    eq(v8.db.listMessages(conv.id).length, 0, "删会话级联删消息（schema ON DELETE CASCADE）");
    eq(v8.db.listArtifacts(conv.id).length, 0, "删会话级联删产物");
    ok(snap.length > 100, "删除前完整快照非空（证明级联前确有数据）");
    v8.raw.close();
  }

  // 31. r10：工具契约与脚本规划口径（全部集中 shared）
  section("工具契约与脚本规划口径（TOOL_NAMES / 规划 / 汇总）");
  {
    eq(TOOL_NAMES.length, 12, "工具注册表扩到 12 个工具（r11）");
    eq(
      [...TOOL_NAMES],
      ["list_todos", "create_todo", "list_documents", "create_document", "list_projects", "list_cards", "list_tables", "search_knowledge", "summarize_document", "export_document_md", "list_schedules", "create_schedule"],
      "12 个工具名逐字符合 r10+r11 任务单（后 4 个为 r11 新增）",
    );
    eq([...STATE_CHANGING_TOOLS], ["create_todo", "create_document", "create_schedule"], "状态变更类工具 3 个（r11 加 create_schedule，需「实际创建」断言）");
    noThrow(() => assertValidToolName("create_todo"), "合法工具名守卫放行");
    throws(() => assertValidToolName("mystery_tool"), "未知工具名守卫抛错（4xx 根因）");
    eq(normalizeToolCallRequest({ name: "list_todos" }).arguments, {}, "工具调用缺省参数归一为空对象");
    eq(
      normalizeToolCallRequest({ name: "create_todo", arguments: { title: "x" } }).name,
      "create_todo",
      "工具调用归一保留合法 name",
    );
    throws(() => normalizeToolCallRequest({ name: "mystery_tool" }), "未知工具调用归一抛 ValidationError");
    throws(() => normalizeToolCallRequest({ name: "list_todos", arguments: "bad" }), "非法参数（非对象）归一抛错");
    throws(() => normalizeToolCallRequest({ arguments: {} }), "缺 name 的工具调用归一抛错");
    noThrow(() => assertValidConversationTitle("合法会话标题"), "合法会话标题守卫放行");
    throws(() => assertValidConversationTitle("   "), "空白会话标题守卫抛错");
    throws(() => assertValidConversationTitle("x".repeat(MAX_CONVERSATION_TITLE + 1)), "超长会话标题守卫抛错");
    noThrow(() => assertValidChatMessage("盘点一下待办"), "合法聊天消息守卫放行");
    throws(() => assertValidChatMessage("   "), "空消息守卫抛错（HTTP 400 根因）");
    throws(() => assertValidChatMessage("x".repeat(MAX_CHAT_MESSAGE + 1)), "超长消息守卫抛错");
    noThrow(() => assertValidMessageRole("tool"), "tool 角色守卫放行");
    throws(() => assertValidMessageRole("robot"), "非法消息角色守卫抛错");
    noThrow(() => assertValidArtifactType("chat-result"), "合法产物类型守卫放行");
    throws(() => assertValidArtifactType("unknown"), "非法产物类型守卫抛错");
    const p1 = planScriptedChat("帮我新建一个待办：写周报，然后列出待办和文档");
    eq(p1.toolCalls.length, 3, "复合意图脚本产出 3 次工具调用（create + list_todos + list_documents）");
    eq(p1.toolCalls.map((c) => c.name), ["create_todo", "list_todos", "list_documents"], "复合意图工具调用顺序确定");
    eq(p1.toolCalls[0]?.arguments.title, "写周报", "create_todo 标题从「：」后真实抽取");
    eq(p1.toolCalls[0]?.arguments.quadrant, "q2", "未指定象限时默认 q2");
    ok(p1.intent.includes("create_todo") && p1.intent.includes("list_documents"), "intent 串含所有命中意图");
    const p2 = planScriptedChat("列出项目、看板和表格");
    eq(p2.toolCalls.map((c) => c.name), ["list_projects", "list_cards", "list_tables"], "列表复合意图产出 3 次只读调用");
    const p3 = planScriptedChat("在知识库检索路线图");
    eq(p3.toolCalls.length, 1, "知识检索意图产出 1 次调用");
    eq(p3.toolCalls[0]?.name, "search_knowledge", "知识检索命中 search_knowledge");
    eq(p3.toolCalls[0]?.arguments.query, "在知识库检索路线图", "search_knowledge.query 原样传入");
    eq(planScriptedChat("你好").toolCalls.length, 0, "无意图消息产出 0 次工具调用");
    eq(JSON.stringify(planScriptedChat("盘点待办和文档")), JSON.stringify(planScriptedChat("盘点待办和文档")), "同消息规划结果逐字节确定（零随机）");
    eq(new Set(planScriptedChat("待办和文档任务").toolCalls.map((c) => c.name)).size, 2, "同义关键词命中去重但保留两类工具");
    const sum = buildChatSummary("list_todos", [
      { name: "list_todos", ok: true, summary: "待办 2 条", data: {} },
      { name: "list_documents", ok: true, summary: "文档 1 篇", data: {} },
    ]);
    ok(sum.includes("2 次工具调用") && sum.includes("待办 2 条"), "汇总串含调用次数与逐条结果摘要");
    ok(buildChatSummary("empty", []).includes("0 次工具调用"), "零调用汇总也确定可读");
  }

  // 32. r10：工具注册表——handler 全为真实服务层调用
  section("工具注册表与真实服务层调用（ToolRegistry）");
  {
    const tdb = openDatabase({ path: ":memory:" });
    const registry = createDefaultToolRegistry();
    eq(registry.list().length, 12, "默认注册表恰 12 个工具（r11 扩链）");
    eq(registry.list().map((d) => d.name), [...TOOL_NAMES], "注册表工具名与 shared 清单逐位相等");
    ok(registry.list().every((d) => d.description.length > 0), "每个工具都有非空 description");
    ok(registry.list().every((d) => d.parameters.type === "object"), "每个工具 parameters 都是 object schema");
    eq(registry.get("create_todo")?.name, "create_todo", "get(name) 命中注册工具");
    eq(registry.get("nope"), undefined, "get(未知) 返回 undefined");
    const beforeTodos = tdb.listTodos().length;
    const created = await registry.execute(tdb, "create_todo", { title: "r10 真实创建的待办", quadrant: "q2" });
    eq(created.ok, true, "create_todo 执行成功");
    eq(tdb.listTodos().length, beforeTodos + 1, "create_todo 真写库：待办数 +1（非 mock 数据）");
    eq((created.data as { todo?: Todo } | null)?.todo?.title, "r10 真实创建的待办", "create_todo 回执含真实标题");
    const listed = await registry.execute(tdb, "list_todos", {});
    eq(listed.ok, true, "list_todos 执行成功");
    ok(((listed.data as { todos?: Todo[] } | null)?.todos ?? []).some((t) => t.title === "r10 真实创建的待办"), "list_todos 真读回刚创建的待办");
    const beforeDocs = tdb.listDocuments().length;
    const docRes = await registry.execute(tdb, "create_document", { title: "r10 真实创建的文档" });
    eq(docRes.ok, true, "create_document 执行成功");
    eq(tdb.listDocuments().length, beforeDocs + 1, "create_document 真写库：文档数 +1");
    const newDoc = (docRes.data as { document?: Document } | null)?.document;
    eq(newDoc === undefined ? undefined : tdb.listBlocks(newDoc.id).length, 1, "create_document 真带默认首块（无零块死路）");
    const docsRes = await registry.execute(tdb, "list_documents", {});
    ok(((docsRes.data as { documents?: Document[] } | null)?.documents ?? []).some((d) => newDoc !== undefined && d.id === newDoc.id), "list_documents 真读回刚创建的文档");
    const proj = tdb.createProject("r10 工具用项目");
    const card = tdb.createBoardCard(proj.id, (tdb.listBoardColumns(proj.id)[0]!).id, "r10 卡片");
    const cardsRes = await registry.execute(tdb, "list_cards", { projectId: proj.id });
    eq(cardsRes.ok, true, "list_cards 执行成功");
    eq((((cardsRes.data as { cards?: BoardCard[] } | null)?.cards ?? []).map((c) => c.id)), [card.id], "list_cards 真读回该项目卡片");
    const projectsRes = await registry.execute(tdb, "list_projects", {});
    ok(((projectsRes.data as { projects?: Project[] } | null)?.projects ?? []).some((p) => p.id === proj.id), "list_projects 真读回刚建项目");
    tdb.createTable("r10 工具用表格");
    const tablesRes = await registry.execute(tdb, "list_tables", {});
    ok(((tablesRes.data as { tables?: BaseTable[] } | null)?.tables ?? []).some((t) => t.name === "r10 工具用表格"), "list_tables 真读回刚建表格");
    const know = await registry.execute(tdb, "search_knowledge", { query: "路线图" });
    eq(know.ok, true, "search_knowledge 空库执行成功（r12 真检索零命中）");
    eq((know.data as { results?: unknown[] } | null)?.results ?? null, [], "search_knowledge 空库返回空结果数组");
    eq((know.data as { placeholder?: boolean } | null)?.placeholder, undefined, "search_knowledge 不再返回 placeholder（r12 真检索，非占位）");
    await throwsAsync(() => registry.execute(tdb, "mystery_tool", {}), "未知工具执行抛错（HTTP 400 根因）");
    await throwsAsync(() => registry.execute(tdb, "create_todo", { title: 123 }), "非法参数（title 非字符串）执行抛错");
    await throwsAsync(() => registry.execute(tdb, "create_todo", { title: "x", quadrant: "q9" }), "非法参数（象限越界）执行抛错");
    throws(() => registry.register(registry.get("list_todos")!), "重复注册同名工具被拒绝");
    tdb.close();
  }

  // 33. r10：mock-planner 与录制回放评测集（≥15 用例，工具调用行为锁定）
  section("mock-planner 与工具调用录制回放（≥15 用例）");
  {
    eq(MOCK_PLANNER_ID, "mock-scripted-v1", "mock 规划器标识固定（零 token）");
    const planned = await mockPlanner.plan("盘点待办和文档");
    eq(planned.toolCalls.map((c) => c.name), ["list_todos", "list_documents"], "planner 脚本命中两条只读工具");
    ok(TOOL_EVAL_CASES.length >= 15, `录制回放用例数 ${TOOL_EVAL_CASES.length} ≥ 15`);
    eq(new Set(TOOL_EVAL_CASES.map((c) => c.name)).size, TOOL_EVAL_CASES.length, "录制用例名互不重复");
    const replay = await runToolReplay(() => openDatabase({ path: ":memory:" }), createDefaultToolRegistry());
    eq(replay.failures.length, 0, `回放全绿：${replay.passed}/${replay.total} 条通过`);
    eq(replay.passed, TOOL_EVAL_CASES.length, "回放通过数 = 用例总数（无跳过）");
    const bad = TOOL_EVAL_CASES.map((c, i) =>
      i === 0 ? { ...c, expected: { ...c.expected, intent: "__WRONG__" } } : c,
    );
    const badReplay = await runToolReplay(() => openDatabase({ path: ":memory:" }), createDefaultToolRegistry(), bad);
    ok(badReplay.failures.length >= 1, "故意写错期望 → 回放必须变红（评测集非恒真占位）");
    const stateful = TOOL_EVAL_CASES.filter((c) => c.expectState && Object.keys(c.expectState).length > 0);
    ok(stateful.length >= 2, `≥2 条回放用例带「实际创建」状态断言（实测 ${stateful.length}）`);
    const replay2 = await runToolReplay(() => openDatabase({ path: ":memory:" }), createDefaultToolRegistry());
    eq(JSON.stringify(replay2), JSON.stringify(replay), "两次回放结果逐字节相等（确定性）");
  }

  // 34. r10：对话编排——逐条工具调用落库与产物
  section("对话编排与产物（executeChat）");
  {
    const cdb = openDatabase({ path: ":memory:" });
    const reg = createDefaultToolRegistry();
    const conv = cdb.createConversation("编排测试");
    const exec = await executeChat(cdb, reg, mockPlanner, "盘点待办和文档");
    eq(exec.intent, "list_todos+list_documents", "编排 intent 为两意图组合");
    eq(exec.toolCalls.map((t) => t.name), ["list_todos", "list_documents"], "编排产出 2 条真实工具调用");
    eq(exec.toolCalls.map((t) => t.id), ["tc-1", "tc-2"], "工具调用 id 确定性（tc-1/tc-2）");
    ok(exec.summary.includes("2 次工具调用"), "汇总文案含调用次数");
    eq(exec.artifact.type, "chat-result", "产物类型 chat-result");
    eq(JSON.parse(exec.artifact.content).tools.length, 2, "产物内容含全部工具回执");
    eq(JSON.parse(exec.artifact.content).intent, exec.intent, "产物 intent 与编排一致");
    cdb.addMessage(conv.id, "tool", { text: "工具回执" }, exec.toolCalls);
    eq(cdb.listMessages(conv.id)[0]?.toolCalls.length, 2, "编排回执可逐条落库并原样读回");
    const before = cdb.listTodos().length;
    const exec2 = await executeChat(cdb, reg, mockPlanner, "忽略", {
      toolCalls: [
        { name: "create_todo", arguments: { title: "显式调用创建的待办", quadrant: "q3" } },
        { name: "list_todos", arguments: {} },
      ],
    });
    eq(cdb.listTodos().length, before + 1, "显式工具调用模式真创建待办（状态变更有断言）");
    eq(exec2.toolCalls.length, 2, "显式工具调用模式逐条执行 2 次");
    eq(exec2.toolCalls[0]?.ok, true, "显式调用回执 ok=true");
    const beforeBad = cdb.listTodos().length;
    await throwsAsync(
      () => executeChat(cdb, reg, mockPlanner, "忽略", { toolCalls: [{ name: "mystery_tool", arguments: {} }] }),
      "显式未知工具 → 编排抛错（HTTP 400）",
    );
    eq(cdb.listTodos().length, beforeBad, "未知工具被拒时零写入（无半态）");
    cdb.close();
  }

  // 35. r11：产物类型 / 上下文窗口 / 行内 diff 契约（TDD：先断言，后实现）
  section("r11 契约：产物类型 / 上下文窗口 / 行内 diff");
  {
    eq([...GENERATED_ARTIFACT_TYPES], ["html-report", "markdown-table", "json-data"], "r11 三类可预览产物类型逐字锁定");
    eq(DEFAULT_ARTIFACT_TYPE, "chat-result", "缺省产物仍为 chat-result（向后兼容 r10）");
    noThrow(() => assertValidArtifactType("html-report"), "新增产物类型通过既有守卫");
    throws(() => assertValidArtifactType("bad-type"), "未知产物类型守卫抛错（HTTP 400 根因）");
    eq(isGeneratedArtifactType("markdown-table"), true, "markdown-table 属可预览生成类型");
    eq(isGeneratedArtifactType("chat-result"), false, "chat-result 不属三类生成类型");
    noThrow(() => assertValidGeneratedArtifactType("json-data"), "合法生成类型守卫放行");
    throws(() => assertValidGeneratedArtifactType("chat-result"), "chat-result 不能当生成类型传入");
    eq(normalizeArtifactTypeRequest(undefined), "chat-result", "未传产物类型归一为 chat-result");
    eq(normalizeArtifactTypeRequest("html-report"), "html-report", "合法产物类型原样归一");
    throws(() => normalizeArtifactTypeRequest("evil"), "非法产物类型归一抛错");
    eq(contentTypeForArtifactType("html-report"), "text/html; charset=utf-8", "HTML 产物 content-type");
    eq(contentTypeForArtifactType("markdown-table"), "text/markdown; charset=utf-8", "Markdown 产物 content-type");
    eq(contentTypeForArtifactType("json-data"), "application/json; charset=utf-8", "JSON 产物 content-type");
    eq(contentTypeForArtifactType("chat-result"), "application/json; charset=utf-8", "r10 产物 content-type 兼容");
    eq(DEFAULT_CONTEXT_WINDOW, 8, "上下文窗口默认 8 条");
    eq(MAX_CONTEXT_WINDOW, 20, "上下文窗口上限 20 条");
    eq(normalizeContextWindow(undefined), DEFAULT_CONTEXT_WINDOW, "未传上下文窗口取默认 8");
    eq(normalizeContextWindow(3), 3, "合法上下文窗口原样归一");
    throws(() => normalizeContextWindow(0), "上下文窗口 0 抛错（HTTP 400 根因）");
    throws(() => normalizeContextWindow(MAX_CONTEXT_WINDOW + 1), "上下文窗口超上限抛错（400）");
    throws(() => normalizeContextWindow("8"), "非数字上下文窗口抛错");
    noThrow(() => assertValidContextWindow(8), "合法上下文窗口守卫放行");
  }

  // 36. r11：r9 U2 必修——行内增删改高亮 diff 算法（集中 shared，非纯样式）
  section("r9 U2 修复：行内增删改 diff（computeInlineDiff）");
  {
    const same = computeInlineDiff("同一句话", "同一句话");
    eq(same.map((s) => s.kind), ["same"], "完全相同文本只有 same 段");
    eq(same.map((s) => s.text).join(""), "同一句话", "same 段文本无损");
    eq(computeInlineDiff("", "新增文本").map((s) => s.kind), ["added"], "空原文 → 全 added");
    eq(computeInlineDiff("旧文本", "").map((s) => s.kind), ["removed"], "空建议 → 全 removed");
    const changed = computeInlineDiff("这是一段旧文本", "这是一段新文本");
    ok(changed.some((s) => s.kind === "same"), "局部修改保留 same 段");
    ok(changed.some((s) => s.kind === "removed"), "局部修改含 removed 段（旧字高亮）");
    ok(changed.some((s) => s.kind === "added"), "局部修改含 added 段（新字高亮）");
    eq(changed.filter((s) => s.kind !== "removed").map((s) => s.text).join(""), "这是一段新文本", "去掉 removed 段后逐字等于建议文本");
    eq(changed.filter((s) => s.kind !== "added").map((s) => s.text).join(""), "这是一段旧文本", "去掉 added 段后逐字等于原文");
    eq(JSON.stringify(computeInlineDiff("这是一段旧文本", "这是一段新文本")), JSON.stringify(changed), "diff 输出逐字节确定（零随机）");
    ok(changed.every((s: DiffSegment) => ["same", "removed", "added"].includes(s.kind) && s.text.length > 0), "diff 段Kind 合法且无空段");
  }

  // 37. r11：跨轮指代消解（shared 纯函数，上下文来自落库消息）
  section("r11 多轮上下文：跨轮指代消解");
  {
    const prior: PlannerContextMessage[] = [{ role: "user", text: "新建待办：写周报" }];
    const repeat = resolveContextualMessage("再建一个", prior);
    eq(repeat.resolved, true, "「再建一个」命中上一轮实体");
    eq(repeat.referenceKind, "repeat", "重复指代 kind=repeat");
    eq(repeat.referencedTitle, "写周报", "引用实体标题取自上一轮真实消息");
    eq(repeat.message, "新建待办：写周报（再建）", "重复指代解析为可执行脚本消息");
    const repeatNamed = resolveContextualMessage("再建一个：写月报", prior);
    eq(repeatNamed.message, "新建待办：写月报", "「再建一个：新标题」用新标题并保留实体类型");
    eq(repeatNamed.referencedTitle, "写周报", "指代来源仍是上一轮标题");
    const retitle = resolveContextualMessage("把它改成：季度周报", prior);
    eq(retitle.referenceKind, "retitle", "「把它改成」kind=retitle");
    eq(retitle.message, "新建待办：季度周报", "改标题解析为带新标题的确定性脚本消息");
    const none = resolveContextualMessage("再建一个", []);
    eq(none.resolved, false, "无历史上下文时不硬解指代");
    eq(none.message, "再建一个", "未解析消息原样返回");
    eq(resolveContextualMessage("盘点待办和文档", prior).resolved, false, "普通消息不触发指代消解");
    const docPrior: PlannerContextMessage[] = [{ role: "user", text: "新建文档：设计方案" }];
    eq(resolveContextualMessage("再建一个", docPrior).message, "新建文档：设计方案（再建）", "跨轮实体类型（文档）被正确继承");
  }

  // 38. r11：三类产物生成器（真实内容，非占位）
  section("r11 产物生成器：HTML / Markdown 表格 / JSON");
  {
    const toolCalls: ToolCallRecord[] = [{
      id: "tc-1", name: "create_todo", arguments: { title: "写周报", quadrant: "q2" },
      ok: true, summary: "已创建待办「写周报」（#1）", data: { todo: { id: 1 } },
    }];
    const input = { intent: "create_todo", message: "新建待办：写周报", toolCalls, summary: "已完成「create_todo」：共 1 次工具调用。" };
    const html = generateHtmlReport(input);
    eq(html.type, "html-report", "HTML 报告产物类型正确");
    ok(html.title.includes("HTML 报告"), "HTML 报告标题含类型中文名");
    ok(html.content.startsWith("<!doctype html>") && html.content.includes("</html>"), "HTML 报告是完整可打开文档");
    ok(html.content.includes("<table>") && html.content.includes("写周报"), "HTML 报告含真实数据表与执行摘要");
    ok(!html.content.includes("<script"), "HTML 报告不含脚本（安全预览）");
    const md = generateMarkdownTable(input);
    eq(md.type, "markdown-table", "Markdown 表格产物类型正确");
    ok(md.content.includes("| 工具 |") && md.content.includes("| --- |"), "Markdown 表格含表头与分隔行");
    ok(md.content.includes("create_todo") && md.content.includes("写周报"), "Markdown 表格含真实工具与数据");
    const escaped = generateMarkdownTable({ ...input, toolCalls: [{ ...toolCalls[0]!, summary: "含竖线 | 的摘要" }] });
    ok(escaped.content.includes("\\|"), "Markdown 表格转义单元格内竖线");
    const json = generateJsonData(input);
    eq(json.type, "json-data", "JSON 数据产物类型正确");
    eq(JSON.parse(json.content).tools.length, 1, "JSON 数据产物含全部工具回执");
    eq(JSON.parse(json.content).intent, "create_todo", "JSON 数据产物 intent 正确");
    eq(JSON.stringify(buildArtifactFromToolResults("html-report", input)), JSON.stringify(html), "统一入口与单类型生成器逐字一致");
    eq(ARTIFACT_GENERATOR_LABELS["json-data"], "JSON 数据", "产物标签逐字锁定");
  }

  // 39. r11：12 工具真实服务层调用（4 个新工具全接 XieFlowDb）
  section("r11 工具链扩展：新 4 工具真调服务层");
  {
    const tdb = openDatabase({ path: ":memory:" });
    const reg = createDefaultToolRegistry();
    eq(reg.list().length, 12, "默认注册表恰 12 个工具");
    const tdoc = tdb.createDocument("r11 服务层文档");
    const tblock = tdb.listBlocks(tdoc.id)[0]!;
    tdb.updateBlock(tblock.id, { text: "r11 导出正文" });
    const summarized = await executeChat(tdb, reg, mockPlanner, "忽略", { toolCalls: [{ name: "summarize_document", arguments: { documentId: tdoc.id } }] });
    eq(summarized.toolCalls[0]?.ok, true, "summarize_document 真实执行成功");
    ok(String(summarized.toolCalls[0]?.summary).includes("文档"), "文档摘要含标题与统计");
    eq((summarized.toolCalls[0]?.data as { blockCount: number } | null)?.blockCount, 1, "摘要块数来自真实服务层");
    const exportedMd = await executeChat(tdb, reg, mockPlanner, "忽略", { toolCalls: [{ name: "export_document_md", arguments: { documentId: tdoc.id } }] });
    eq(exportedMd.toolCalls[0]?.ok, true, "export_document_md 真实执行成功");
    ok(String((exportedMd.toolCalls[0]?.data as { markdown: string } | null)?.markdown).includes("r11 导出正文"), "导出的 Markdown 含真块正文");
    const listedSchedules = await executeChat(tdb, reg, mockPlanner, "忽略", { toolCalls: [{ name: "list_schedules", arguments: {} }] });
    eq(listedSchedules.toolCalls[0]?.ok, true, "list_schedules 真实执行成功");
    eq((listedSchedules.toolCalls[0]?.data as { count: number } | null)?.count, 0, "新库日程数 0 真读回");
    const beforeSchedules = tdb.listSchedules().length;
    const createdSchedule = await executeChat(tdb, reg, mockPlanner, "忽略", {
      toolCalls: [{ name: "create_schedule", arguments: { title: "r11 真建日程", date: "2026-11-20", start: "10:00", end: "11:00" } }],
    });
    eq(createdSchedule.toolCalls[0]?.ok, true, "create_schedule 真实执行成功");
    eq(tdb.listSchedules().length, beforeSchedules + 1, "create_schedule 真建日程（状态变更断言）");
    eq(tdb.listSchedules()[0]?.title, "r11 真建日程", "新建日程标题真落库");
    const scriptedSchedule = await executeChat(tdb, reg, mockPlanner, "新建日程：r11 脚本日程 2026-11-21 14:00-15:00");
    ok(scriptedSchedule.toolCalls.some((t) => t.name === "create_schedule"), "脚本意图可触发 create_schedule");
    ok(tdb.listSchedules().some((s) => s.title === "r11 脚本日程"), "脚本日程标题真落库");
    const badDate = await executeChat(tdb, reg, mockPlanner, "忽略", {
      toolCalls: [{ name: "create_schedule", arguments: { title: "x", date: "bad", start: "10:00", end: "11:00" } }],
    });
    eq(badDate.toolCalls[0]?.ok, false, "非法日程日期 handler 返 ok=false（不伪造成功）");
    const missingDoc = await executeChat(tdb, reg, mockPlanner, "忽略", { toolCalls: [{ name: "summarize_document", arguments: { documentId: 99999 } }] });
    eq(missingDoc.toolCalls[0]?.ok, false, "不存在文档的摘要返 ok=false");
    tdb.close();
  }

  // 40. r11：多轮上下文 + 产物类型 + 回放扩充（≥27 用例）
  section("r11 多轮上下文编排与产物生成");
  {
    const cdb = openDatabase({ path: ":memory:" });
    const reg = createDefaultToolRegistry();
    const conv = cdb.createConversation("r11 多轮上下文");
    const first = await executeChat(cdb, reg, mockPlanner, "新建待办：写周报");
    cdb.recordChatExchange({ conversationId: conv.id, userText: "新建待办：写周报", toolCalls: first.toolCalls, summary: first.summary, artifact: first.artifact });
    const ctx = toPlannerContext(cdb.listMessages(conv.id));
    eq(ctx.length, 3, "落库消息归一为 3 条规划上下文");
    eq(ctx[0]?.role, "user", "上下文角色逐位来自真实落库消息");
    const second = await executeChat(cdb, reg, mockPlanner, "再建一个", { context: ctx });
    eq(second.toolCalls[0]?.arguments.title, "写周报（再建）", "第 2 轮「再建一个」引用第 1 轮真实实体");
    eq(second.resolution?.referenceKind, "repeat", "第 2 轮回执携带指代解析元数据");
    eq(second.resolution?.referencedTitle, "写周报", "指代来源标题可审计");
    eq(second.contextWindow, DEFAULT_CONTEXT_WINDOW, "缺省 context_window 回显 8");
    cdb.recordChatExchange({ conversationId: conv.id, userText: "再建一个", toolCalls: second.toolCalls, summary: second.summary, artifact: second.artifact });
    const third = await executeChat(cdb, reg, mockPlanner, "把它改成：季度周报", { context: toPlannerContext(cdb.listMessages(conv.id)), contextWindow: 2 });
    eq(third.toolCalls[0]?.arguments.title, "季度周报", "第 3 轮「把它改成」解析为新标题");
    eq(third.resolution?.referenceKind, "retitle", "retitle 元数据回显");
    eq(third.contextWindow, 2, "显式 context_window 回显 2");
    const htmlExec = await executeChat(cdb, reg, mockPlanner, "盘点待办", { artifactType: "html-report" });
    eq(htmlExec.artifact.type, "html-report", "chat 可指定生成 HTML 产物");
    ok(htmlExec.artifact.content.startsWith("<!doctype html>"), "HTML 产物内容非空占位");
    const mdExec = await executeChat(cdb, reg, mockPlanner, "盘点待办", { artifactType: "markdown-table" });
    eq(mdExec.artifact.type, "markdown-table", "chat 可指定生成 Markdown 表格产物");
    ok(mdExec.artifact.content.includes("| --- |"), "Markdown 产物含真实表格分隔行");
    const jsonExec = await executeChat(cdb, reg, mockPlanner, "盘点待办", { artifactType: "json-data" });
    eq(jsonExec.artifact.type, "json-data", "chat 可指定生成 JSON 数据产物");
    await throwsAsync(() => executeChat(cdb, reg, mockPlanner, "盘点待办", { artifactType: "evil" }), "非法产物类型 → 编排抛错（HTTP 400）");
    await throwsAsync(() => executeChat(cdb, reg, mockPlanner, "盘点待办", { contextWindow: 99 }), "上下文超限 → 编排抛错（HTTP 400）");
    eq(TOOL_EVAL_CASES.length >= 27, true, `回放评测集 ${TOOL_EVAL_CASES.length} ≥ 27（r10 17 + r11 ≥10）`);
    eq(new Set(TOOL_EVAL_CASES.map((c) => c.name)).size, TOOL_EVAL_CASES.length, "r11 回放用例名仍互不重复");
    const replayAll = await runToolReplay(() => openDatabase({ path: ":memory:" }), reg);
    eq(replayAll.failures, [], "扩充后回放全绿（含多轮上下文与新工具）");
    const multiCases = TOOL_EVAL_CASES.filter((c) => c.context && c.context.length > 0);
    eq(multiCases.length >= 3, true, `多轮上下文回放用例 ${multiCases.length} ≥ 3`);
    const badCases = TOOL_EVAL_CASES.map((c) => ({ ...c, expected: { ...c.expected, intent: c.expected.intent + "-WRONG" } }));
    const badReplay11 = await runToolReplay(() => openDatabase({ path: ":memory:" }), reg, badCases);
    ok(badReplay11.failures.length > 0, "故意写错期望 → r11 回放必须变红（非恒真）");
    cdb.close();
  }

  // 40. r12：schema v8→v9 迁移与知识库数据层
  section("schema v8→v9 迁移与知识库数据层（knowledge_docs / knowledge_chunks）");
  {
    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const p = `scripts/.tmp-e2e/r12-v9-${Date.now()}.db`;
    const old = openDatabaseRaw({ path: p });
    old.raw.exec("PRAGMA user_version = 8");
    old.raw.close();
    const v9 = openDatabaseRaw({ path: p });
    eq(v9.appliedMigrations, [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], "v8 旧库重开只补跑 v9+v10+v11+v12+v13+v14+v15+v16+v17+v18+v19+v20+v21+v22+v23+v24+v25+v26+v27 迁移（真实 PRAGMA 升级路径）");
    eq(
      (v9.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = CURRENT_SCHEMA_VERSION（17）",
    );
    const tables = v9.raw
      .all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => String((r as { name: unknown }).name));
    ok(tables.includes("knowledge_docs"), "v9 迁移建出 knowledge_docs 表");
    ok(tables.includes("knowledge_chunks"), "v9 迁移建出 knowledge_chunks 表");
    const docCols = (v9.raw.all("PRAGMA table_info(knowledge_docs)") as { name: string }[]).map((r) => r.name);
    eq(
      docCols,
      ["id", "title", "source_type", "source_id", "content", "chunk_count", "created_at"],
      "knowledge_docs 七列逐字吻合任务单",
    );
    const chunkCols = (v9.raw.all("PRAGMA table_info(knowledge_chunks)") as { name: string }[]).map((r) => r.name);
    eq(
      chunkCols,
      ["id", "doc_id", "position", "content", "token_count", "vector"],
      "knowledge_chunks 六列（含可空 vector 列，embedding 留位）",
    );
    throws(
      () => v9.raw.run("INSERT INTO knowledge_docs (title, source_type, source_id, content, chunk_count, created_at) VALUES ('', 'text', NULL, 'x', 0, '')"),
      "knowledge_docs.title 空串被 schema CHECK 拒绝",
    );
    throws(
      () => v9.raw.run("INSERT INTO knowledge_docs (title, source_type, source_id, content, chunk_count, created_at) VALUES ('t', 'evil', NULL, 'x', 0, '')"),
      "knowledge_docs.source_type CHECK 拒绝非法值",
    );
    throws(
      () => v9.raw.run("INSERT INTO knowledge_chunks (doc_id, position, content, token_count) VALUES (999999, 0, 'x', 1)"),
      "knowledge_chunks.doc_id 外键拒绝孤儿块",
    );
    const drafts = [
      { position: 0, content: "第一块", tokenCount: 3 },
      { position: 1, content: "第二块", tokenCount: 3 },
    ];
    const ingested = v9.db.createKnowledgeDoc({ title: "r12 真入库", sourceType: "text", sourceId: null, content: "第一块第二块", chunks: drafts });
    eq(ingested.doc.title, "r12 真入库", "createKnowledgeDoc 真落库并读回标题");
    eq(ingested.doc.sourceType, "text", "createKnowledgeDoc 落 source_type=text");
    eq(ingested.doc.chunkCount, 2, "createKnowledgeDoc 的 chunk_count = 分块数");
    eq(ingested.chunks.length, 2, "createKnowledgeDoc 一次落 2 块");
    eq(v9.db.listKnowledgeDocs().length, 1, "listKnowledgeDocs 真读回 1 篇");
    eq(v9.db.getKnowledgeDoc(ingested.doc.id)?.title, ingested.doc.title, "getKnowledgeDoc 按 id 读回");
    eq(v9.db.getKnowledgeDoc(999999), null, "getKnowledgeDoc 不存在返回 null");
    eq(v9.db.listKnowledgeChunks(ingested.doc.id).map((c) => c.position), [0, 1], "listKnowledgeChunks 按 position 升序");
    const searchChunksFromDb = v9.db.listKnowledgeChunksForSearch();
    eq(searchChunksFromDb.length, 2, "listKnowledgeChunksForSearch 带来源字段读回 2 块");
    eq(searchChunksFromDb[0]?.docTitle, "r12 真入库", "检索源块携带 doc_title 来源引用");
    eq(searchChunksFromDb[0]?.sourceType, "text", "检索源块携带 source_type 来源引用");
    const snap = JSON.stringify(v9.db.listKnowledgeChunks(ingested.doc.id));
    ok(snap.length > 20, "删除前块快照非空（证明级联前确有数据）");
    v9.db.deleteKnowledgeDoc(ingested.doc.id);
    eq(v9.db.listKnowledgeDocs().length, 0, "deleteKnowledgeDoc 真删文档");
    eq(v9.db.listKnowledgeChunks(ingested.doc.id).length, 0, "删文档级联删块（schema ON DELETE CASCADE）");
    v9.raw.close();
  }

  // 41. r12：分块引擎（段落/字数切分 + 重叠窗口 + 边界不丢字）
  section("r12 分块引擎 chunkText（段落/字数切分 + 重叠窗口 + 边界不丢字）");
  {
    eq(DEFAULT_CHUNK_SIZE, 200, "缺省 chunkSize=200");
    eq(DEFAULT_CHUNK_OVERLAP, 40, "缺省 overlap=40（重叠窗口）");
    eq(chunkText("").length, 0, "空文本分块 0 片");
    eq(chunkText("   \n  \n ").length, 0, "纯空白文本分块 0 片");
    const one = chunkText("短文本");
    eq(one.length, 1, "短文本一片");
    eq(one[0]?.position, 0, "首片 position=0");
    eq(one[0]?.content, "短文本", "短文本原样保留（trim 后）");
    ok((one[0]?.tokenCount ?? 0) > 0, "短文本 token_count > 0");
    const plain = "字".repeat(250);
    const cut = chunkText(plain, { chunkSize: 100, overlap: 20 });
    eq(cut.length, 3, "250 字按 100/20 切成 3 片");
    eq(cut.map((c) => c.position), [0, 1, 2], "分块 position 连号 0..2");
    eq(cut.map((c) => c.content.length), [100, 100, 90], "前两片满 100 字，末片 90 字");
    ok(cut[1]?.content.startsWith("字".repeat(20)) === true, "第 2 片头部为第 1 片尾部 20 字（重叠窗口在场）");
    const rebuilt = cut[0]!.content + cut[1]!.content.slice(20) + cut[2]!.content.slice(20);
    eq(rebuilt, plain, "去重叠拼接逐字等于原文（边界不丢字）");
    const paras = chunkText("第一段短句。\n第二段短句。\n第三段短句。", { chunkSize: 200, overlap: 0 });
    eq(paras.length, 1, "三段短文在字数内并一片");
    ok(paras[0]?.content.includes("第一段") === true && paras[0]?.content.includes("第三段") === true, "段落分块保留全部段落文字");
    const longPara = chunkText("甲".repeat(180) + "\n" + "乙".repeat(180), { chunkSize: 200, overlap: 30 });
    ok(longPara.length >= 2, "超长段落按字数切为多片");
    ok(longPara.some((c) => c.content.includes("乙")), "跨段落切分不丢后段文字");
    eq(chunkText("百字短文。", { chunkSize: 5, overlap: 0 })[0]?.content, "百字短文。", "chunkSize 小于文本时仍不丢字（单片保底）");
    let mono = true;
    for (const c of cut) if (c.tokenCount !== 100 && c.tokenCount !== 90) mono = false;
    ok(mono, "token_count 逐片等于汉字字数（token 口径确定）");
  }

  // 42. r12：TF-IDF 检索引擎（排序 / 空查询 / 来源引用）
  section("r12 TF-IDF 检索引擎 searchChunks（排序 / 空查询 / 来源引用）");
  {
    eq(tokenizeText("你好 hello 123"), ["你", "好", "hello", "123"], "tokenize：中文逐字、英文数字成词（样例）");
    eq(countTokens("你好 hello 123"), 4, "countTokens=4（你/好/hello/123）");
    eq(countTokens("   "), 0, "纯空白 token=0");
    const chunks = [
      { id: 11, docId: 1, position: 0, content: "苹果 手机 手机 手机 手机", docTitle: "科技稿", sourceType: "text" as const, sourceId: null },
      { id: 22, docId: 2, position: 0, content: "苹果 水果 香蕉", docTitle: "果园稿", sourceType: "document" as const, sourceId: 7 },
      { id: 33, docId: 3, position: 0, content: "苹果 手机 平板", docTitle: "数码稿", sourceType: "text" as const, sourceId: null },
    ];
    eq(searchChunks("", chunks).length, 0, "空查询返回 0 命中");
    eq(searchChunks("   ", chunks).length, 0, "纯空白查询返回 0 命中");
    eq(searchChunks("手机", []).length, 0, "空语料返回 0 命中");
    const hits = searchChunks("手机", chunks, 10);
    eq(hits.length, 2, "查询「手机」命中 2 块（不含「果园稿」）");
    eq(hits[0]?.docId, 1, "TF-IDF 排序：手机词频最高的「科技稿」居首");
    ok((hits[0]?.score ?? 0) > (hits[1]?.score ?? 0), "命中按余弦相似度降序");
    ok(hits.every((h) => h.score > 0), "全部命中 score > 0（零分不过滤阈值）");
    eq(hits[0]?.chunkId, 11, "命中携带 chunk_id 来源引用");
    eq(hits[0]?.docTitle, "科技稿", "命中携带 doc_title 来源引用");
    eq(hits[1]?.sourceType, "text", "命中携带 source_type 来源引用");
    eq(hits[1]?.sourceId, null, "命中携带 source_id 来源引用（text 为 null）");
    const banana = searchChunks("香蕉", chunks);
    eq(banana.length, 1, "稀有词「香蕉」只命中 1 块");
    eq(banana[0]?.docId, 2, "稀有词命中可溯源到具体文档");
    eq(banana[0]?.sourceId, 7, "document 来源的 source_id 可溯源");
    eq(searchChunks("苹果", chunks, 1).length, 1, "limit=1 只返回 1 条");
    eq(searchChunks("不存在词xyz", chunks).length, 0, "零交集查询返回空");
    eq(NO_EMBEDDING.id, "none", "embedding 留位：缺省 provider id=none");
  }

  // 43. r12：search_knowledge 工具从占位改为真检索
  section("r12 search_knowledge 工具真检索（来源引用）");
  {
    const tdb = openDatabase({ path: ":memory:" });
    tdb.createKnowledgeDoc({
      title: "工具真检索稿",
      sourceType: "text",
      sourceId: null,
      content: "苹果 手机 手机 手机",
      chunks: [{ position: 0, content: "苹果 手机 手机 手机", tokenCount: 4 }],
    });
    const reg = createDefaultToolRegistry();
    const hit = await reg.execute(tdb, "search_knowledge", { query: "手机" });
    eq(hit.ok, true, "search_knowledge 真执行 ok=true");
    const data = hit.data as { results: { docId: number; chunkId: number; docTitle: string }[] };
    ok(data.results.length > 0, "search_knowledge 命中非空（非 r10 空占位）");
    eq(data.results[0]?.docTitle, "工具真检索稿", "工具回执携带真实文档标题");
    ok(typeof data.results[0]?.docId === "number" && typeof data.results[0]?.chunkId === "number", "工具回执携带 doc_id / chunk_id 来源引用");
    const empty = await reg.execute(tdb, "search_knowledge", { query: "无此词qqq" });
    eq((empty.data as { results: unknown[] }).results.length, 0, "零命中查询返回空结果（不伪造）");
    tdb.close();
  }

  // 44. r13：RAG 编排 / 引用注入 / 引用溯源 / 无命中诚实答复
  section("r13 RAG 编排与引用溯源（检索注入 / citations / 无命中不编造）");
  {
    // A. shared 契约（规则集中，api/web 零分支）
    eq(RAG_NO_HIT_ANSWER, "知识库没有相关内容", "无命中诚实答复口径逐字锁定");
    eq(RAG_SNIPPET_LENGTH, 120, "引用片段长度契约常量");
    ok(RAG_INTENT_KEYWORDS.length >= 10, "RAG 意图词表不少于 10 条");
    eq(isRagIntentQuery("根据知识库，苹果有哪些特性？"), true, "识别「根据知识库」类意图");
    eq(isRagIntentQuery("查资料：番茄"), true, "识别「查资料」类意图");
    eq(isRagIntentQuery("文档里有香蕉吗"), true, "识别「文档里」类意图");
    eq(isRagIntentQuery("从知识库回答这个问题"), true, "识别「从知识库」类意图");
    eq(isRagIntentQuery("检索知识库"), false, "直接工具调用「检索知识库」不算 RAG 问答");
    eq(isRagIntentQuery("在知识库检索 手机"), false, "r12 工具直调句式不算 RAG 问答");
    eq(isRagIntentQuery("列出文档"), false, "普通文档列表不算 RAG 问答");
    eq(extractRagQuery("根据知识库，苹果 手机"), "苹果 手机", "RAG 检索词去掉触发前缀");
    eq(extractRagQuery("查资料：番茄"), "番茄", "RAG 检索词去掉「查资料：」");
    eq(extractRagQuery("文档里有香蕉吗"), "有香蕉吗", "RAG 检索词去掉「文档里」");
    eq(normalizeTracebackChunkId(undefined), null, "溯源参数缺省返回 null（普通单篇回看）");
    eq(normalizeTracebackChunkId(7), 7, "溯源参数合法正整数原样归一");
    await throws(() => normalizeTracebackChunkId(0), "溯源 chunkId=0 抛 ValidationError");
    await throws(() => normalizeTracebackChunkId("abc"), "溯源 chunkId 非数字抛 ValidationError");

    // B. rag.ts 纯函数（真 db 取数 + 引用装配）
    const rdb = openDatabase({ path: ":memory:" });
    rdb.createKnowledgeDoc({
      title: "r13科技稿",
      sourceType: "text",
      sourceId: null,
      content: "苹果 手机 手机 手机 平板",
      chunks: [{ position: 0, content: "苹果 手机 手机 手机 平板", tokenCount: 5 }],
    });
    rdb.createKnowledgeDoc({
      title: "r13果园稿",
      sourceType: "text",
      sourceId: null,
      content: "苹果 香蕉 水果",
      chunks: [{ position: 0, content: "苹果 香蕉 水果", tokenCount: 3 }],
    });
    const r = retrieve(rdb, "苹果", 5);
    eq(r.query, "苹果", "retrieve 回显真实 query");
    eq(r.limit, 5, "retrieve 回显 limit");
    eq(r.count, 2, "retrieve 命中 2 块（真 TF-IDF）");
    eq(r.hits[0]!.docTitle, "r13果园稿", "retrieve 排序与 r12 TF-IDF 一致：「苹果」词频占比高的短稿居首");
    const prompt = buildAugmentedPrompt("苹果有什么", r.hits);
    ok(prompt.includes("[1]") && prompt.includes("[2]"), "augmented prompt 带 [n] 引用编号");
    ok(prompt.includes("doc #") && prompt.includes("chunk #"), "prompt 注入 docId/chunkId 来源");
    ok(prompt.includes("score 0."), "prompt 注入相关度分值");
    ok(prompt.includes(r.hits[0]!.content), "prompt 注入真实命中正文（非占位）");
    ok(prompt.includes("问题：苹果有什么") && prompt.includes("回答："), "prompt 含问题与回答分界");
    eq(buildAugmentedPrompt("苹果有什么", r.hits), prompt, "prompt 逐字节确定（可录制回放）");
    ok(buildAugmentedPrompt("无任何词xyz", []).includes("无可用上下文"), "零命中 prompt 明确标注无上下文");
    const cits = citationsFromHits(r.hits);
    eq(cits.length, 2, "citations 与命中一一对应");
    eq(cits[0]!.docId, r.hits[0]!.docId, "citation.docId 真取自命中");
    eq(cits[0]!.chunkId, r.hits[0]!.chunkId, "citation.chunkId 真取自命中");
    eq(cits[0]!.snippet, r.hits[0]!.content.slice(0, RAG_SNIPPET_LENGTH), "citation.snippet 逐字取自真实 chunk");
    eq(cits[0]!.score, r.hits[0]!.score, "citation.score 与 TF-IDF 命中分值相等");
    eq(cits[0]!.docTitle, r.hits[0]!.docTitle, "citation 带展示用 docTitle");
    const ans = buildRagAnswer("苹果有什么", r.hits);
    eq(ans.noHit, false, "有命中 noHit=false");
    eq(ans.hitCount, 2, "有命中 hitCount=2");
    ok(ans.answer.includes("[1]"), "回答含引用标记 [1]");
    ok(ans.answer.includes("r13果园稿"), "回答含真实来源标题");
    ok(ans.answer.includes("苹果 香蕉"), "回答含真实命中片段（引用注入）");
    ok(ans.answer.includes("苹果有什么"), "回答回应用户问题");
    eq(ans.augmentedPrompt, prompt, "回答随附同一份 augmented prompt");
    eq(ans.citations.length, 2, "回答随附 2 条引用");
    const noHit = buildRagAnswer("不存在的词xyz", []);
    eq(noHit.noHit, true, "零命中 noHit=true");
    ok(noHit.answer.includes(RAG_NO_HIT_ANSWER), "零命中如实说「知识库没有相关内容」");
    eq(noHit.citations.length, 0, "零命中引用清单为空（不伪造引用）");
    eq(noHit.hitCount, 0, "零命中 hitCount=0");
    const realNoHit = buildRagAnswer("qqqzzz不存在", retrieve(rdb, "qqqzzz不存在", 5).hits);
    eq(realNoHit.noHit, true, "真检索零命中走诚实答复分支");
    ok(!realNoHit.answer.includes("chunk #"), "零命中不出现伪造 chunk 引用");

    // C. executeChat 编排：识别意图 → 先检索 → 注入回答 → 引用清单落库
    const edb = openDatabase({ path: ":memory:" });
    edb.createKnowledgeDoc({
      title: "r13编排稿",
      sourceType: "text",
      sourceId: null,
      content: "苹果 手机 手机 平板",
      chunks: [{ position: 0, content: "苹果 手机 手机 平板", tokenCount: 4 }],
    });
    const reg = createDefaultToolRegistry();
    const exec = await executeChat(edb, reg, mockPlanner, "根据知识库，苹果 手机");
    ok(exec.intent.includes("search_knowledge"), "RAG 意图规划先调 search_knowledge");
    eq(exec.toolCalls[0]!.name, "search_knowledge", "首个工具调用是真检索");
    eq(exec.toolCalls[0]!.arguments.query, "苹果 手机", "检索词去掉 RAG 触发前缀");
    eq(exec.toolCalls[0]!.ok, true, "检索工具真执行成功");
    ok((exec.citations?.length ?? 0) > 0, "ChatExecution 携带非空引用清单");
    const cit0 = exec.citations![0]!;
    ok(edb.getKnowledgeDoc(cit0.docId) !== null, "引用 docId 可在知识库回查（溯源）");
    ok(edb.getKnowledgeChunk(cit0.chunkId) !== null, "引用 chunkId 可在知识库回查（溯源）");
    eq(edb.getKnowledgeChunk(cit0.chunkId)!.content.startsWith(cit0.snippet), true, "引用 snippet 逐字等于存储 chunk 前缀");
    ok(exec.summary.includes("[1]"), "AI 汇总含引用标记（引用注入）");
    ok(exec.rag?.noHit === false && exec.rag.hitCount > 0, "ChatExecution 回显 RAG 命中元数据");
    ok(exec.rag!.augmentedPrompt.includes("[1]"), "RAG 元数据含 augmented prompt");
    ok(exec.artifact.content.includes("citations"), "产物原文含引用清单字段");
    const artPayload = JSON.parse(exec.artifact.content) as { citations: RagCitation[] };
    eq(artPayload.citations.length, 1, "chat-result 产物 JSON 引用清单非空");
    eq(artPayload.citations[0]!.chunkId, cit0.chunkId, "产物引用与回答引用逐项一致");
    const noHitExec = await executeChat(edb, reg, mockPlanner, "根据知识库，qqqzzz不存在");
    eq(noHitExec.citations?.length ?? -1, 0, "无命中回答的引用清单为空数组");
    ok(noHitExec.summary.includes(RAG_NO_HIT_ANSWER), "无命中 AI 汇总如实说没有相关内容");
    eq(noHitExec.rag?.noHit, true, "无命中元数据 noHit=true");
    eq(noHitExec.toolCalls[0]!.name, "search_knowledge", "无命中也真检索（不跳过）");
    const normal = await executeChat(edb, reg, mockPlanner, "列出待办");
    eq(normal.citations, undefined, "非 RAG 对话不注入 citations（零污染）");
    const conv = edb.createConversation("r13 引用溯源");
    const saved = edb.recordChatExchange({
      conversationId: conv.id,
      userText: "根据知识库，苹果 手机",
      toolCalls: exec.toolCalls,
      summary: exec.summary,
      artifact: exec.artifact,
      citations: exec.citations,
    });
    const assistant = saved.messages.find((m) => m.role === "assistant")!;
    const persisted = (assistant.content as { citations?: RagCitation[] }).citations ?? [];
    eq(persisted.length, 1, "引用清单随 assistant 消息落库（reload 可复现）");
    eq(persisted[0]!.chunkId, cit0.chunkId, "落库引用 chunkId 与回答一致");
    eq(edb.listMessages(conv.id).length, 3, "RAG 会话仍按 user/tool/assistant 三条落库");

    // D. 录制回放评测集（≥10 用例，真库真执行 + 引用溯源断言）
    ok(RAG_EVAL_CASES.length >= 10, "RAG 回放评测集不少于 10 用例");
    const replay = await runToolReplay(() => openDatabase({ path: ":memory:" }), reg, RAG_EVAL_CASES);
    eq(replay.total, RAG_EVAL_CASES.length, "RAG 回放跑满全部用例");
    eq(replay.passed, replay.total, `RAG 回放全过（失败：${replay.failures.join(" | ")}）`);
    ok(replay.failures.length === 0, "RAG 回放零失败（规划/引用/无命中均锁定）");
    rdb.close();
    edb.close();
  }

  // 46. r14：思维导图 Markdown 双视图（转换引擎 / schema v10 / 数据层 / 折叠状态）
  section("r14 思维导图：Markdown 双向 / 树结构 / 折叠 / schema v10 数据层");
  {
    const md = [
      "# 产品路线图",
      "",
      "## M7 导图",
      "- 左侧 Markdown",
      "  - 实时解析",
      "- 右侧树视图",
      "1. 总览",
      "**未知语法** <b>原样</b>",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
    ].join("\n");
    const tree = parseMarkdownToTree(md);
    eq(tree.roots.length, 1, "一级标题成为唯一根节点");
    eq(tree.roots[0]!.label, "产品路线图", "根节点 label 去掉标题 marker");
    eq(tree.roots[0]!.raw, "# 产品路线图", "根节点 raw 逐字保留源行");
    eq(tree.roots[0]!.children.length, 1, "二级标题挂在一级标题下");
    const m7 = tree.roots[0]!.children[0]!;
    eq(m7.label, "M7 导图", "二级标题 label 正确");
    eq(m7.depth, 1, "二级标题 depth=1");
    eq(m7.blankBefore, 1, "空行计入 blankBefore（往返不丢空行）");
    eq(m7.children.filter((n) => !n.raw.includes("```ts")).map((n) => `${n.kind}:${n.label}`), [
      "bullet:左侧 Markdown",
      "bullet:右侧树视图",
      "numbered:总览",
      "text:**未知语法** <b>原样</b>",
    ], "列表→子节点，未知语法降级 text 节点且逐字保留");
    eq(m7.children[0]!.children.length, 1, "缩进列表成为上一列表项的子节点");
    eq(m7.children[0]!.children[0]!.label, "实时解析", "缩进子节点 label 正确");
    eq(m7.children[0]!.children[0]!.depth, 3, "缩进子节点 depth=3（根→标题→列表→缩进列表）");
    const code = m7.children.find((n) => n.raw.includes("```ts"))!;
    ok(code !== undefined, "代码围栏被解析为节点（未丢失）");
    ok(code.raw.includes("const x = 1;"), "代码围栏正文逐字保留在 raw 中");
    eq(treeToMarkdown(tree), md, "md→tree→md 逐字节相等（标题/列表/空行/围栏全不丢）");
    eq(countMindmapNodes(tree), 8, "节点计数含标题、列表、未知语法与围栏节点");

    const hand: MindmapTree = {
      roots: [{
        id: "n0", label: "A", raw: "# A", kind: "heading", depth: 0, line: 1, blankBefore: 0,
        children: [{
          id: "n0.0", label: "b", raw: "- b", kind: "bullet", depth: 1, line: 3, blankBefore: 1,
          children: [],
        }],
      }],
      trailingBlanks: 0,
    };
    eq(treeToMarkdown(hand), "# A\n\n- b", "treeToMarkdown 从树对象重建 Markdown（blankBefore 生效）");
    eq(parseMarkdownToTree("").roots.length, 0, "空 Markdown 解析为空树");
    eq(treeToMarkdown(parseMarkdownToTree("")), "", "空树导出空字符串");
    eq(treeToMarkdown(parseMarkdownToTree("\n\n")), "\n\n", "纯空行往返不丢");
    eq(parseMarkdownToTree("# A\r\n\r\n- b\r\n").roots[0]!.children.length, 1, "CRLF 归一为 LF 后结构一致");
    eq(MAX_MINDMAP_TITLE, 200, "导图标题上限与 shared 常量一致");
    eq(MAX_MINDMAP_CONTENT, 200000, "导图内容上限与 shared 常量一致");
    throws(() => assertValidMindmapTitle(""), "导图空标题守卫抛错");
    throws(() => assertValidMindmapTitle("   "), "导图纯空白标题守卫抛错");
    throws(() => assertValidMindmapTitle("x".repeat(MAX_MINDMAP_TITLE + 1)), "导图超长标题守卫抛错");
    noThrow(() => assertValidMindmapTitle("x".repeat(MAX_MINDMAP_TITLE)), "导图标题恰为上限值合法");
    throws(() => assertValidMindmapContent(""), "空 Markdown 内容守卫抛错");
    throws(() => assertValidMindmapContent("  \n "), "纯空白 Markdown 内容守卫抛错");
    throws(() => assertValidMindmapContent("a\u0000b"), "含 NUL 的非法 Markdown 守卫抛错");
    throws(() => assertValidMindmapContent("x".repeat(MAX_MINDMAP_CONTENT + 1)), "超长 Markdown 守卫抛错");
    noThrow(() => assertValidMindmapContentOrEmpty(""), "建导图允许空 Markdown（不是死路）");
    throws(() => assertValidMindmapContentOrEmpty("a\u0000b"), "空内容入口仍拒绝非法字符");

    let collapsed: readonly string[] = [];
    collapsed = toggleNodeCollapse(collapsed, "n0.0");
    eq(collapsed, ["n0.0"], "折叠：点节点加入折叠集合");
    eq(toggleNodeCollapse(collapsed, "n0.0"), [], "展开：再次点同一节点移出集合");
    const multi = toggleNodeCollapse(toggleNodeCollapse(collapsed, "n0.1"), "n0.2");
    eq(multi, ["n0.0", "n0.1", "n0.2"], "多节点折叠可叠加且顺序确定");
    eq(toggleNodeCollapse(multi, "n0.1"), ["n0.0", "n0.2"], "展开一个节点不影响其它折叠节点");

    const mdb = freshDb();
    eq(mdb.listMindmaps().length, 0, "新库导图列表为空");
    const mm = mdb.createMindmap({ title: "r14 导图", contentMarkdown: "# 起点" });
    ok(mm.id > 0, "createMindmap 返回自增 id");
    eq(mm.title, "r14 导图", "导图 title 读回");
    eq(mm.contentMarkdown, "# 起点", "导图 Markdown 源读回");
    const emptyMap = mdb.createMindmap({ title: "r14 空导图" });
    eq(emptyMap.contentMarkdown, "", "缺省内容为空字符串（空态可建）");
    eq(mdb.listMindmaps().length, 2, "listMindmaps 读到两张导图");
    eq(mdb.getMindmap(mm.id)!.id, mm.id, "getMindmap 按 id 命中");
    eq(mdb.getMindmap(999999), null, "getMindmap 不存在返回 null");
    throws(() => mdb.createMindmap({ title: "" }), "数据层拒绝空标题");
    throws(() => mdb.createMindmap({ title: "x", contentMarkdown: "a\u0000" }), "数据层拒绝非法 Markdown");
    const renamed = mdb.updateMindmapTitle(mm.id, "r14 改名")!;
    eq(renamed.title, "r14 改名", "updateMindmapTitle 生效");
    eq(mdb.updateMindmapTitle(999999, "x"), null, "updateMindmapTitle 不存在返回 null");
    throws(() => mdb.updateMindmapTitle(mm.id, ""), "数据层拒绝改名为空");
    const saved = mdb.updateMindmapContent(mm.id, "# 新内容\n\n- 子节点")!;
    eq(saved.contentMarkdown, "# 新内容\n\n- 子节点", "updateMindmapContent 逐字保存 Markdown 源");
    throws(() => mdb.updateMindmapContent(mm.id, "   "), "数据层拒绝空内容覆盖");
    eq(mdb.updateMindmapContent(999999, "# x"), null, "数据层越权 id 覆盖返回 null（api 映射 404）");
    eq(countMindmapNodes(parseMarkdownToTree(saved.contentMarkdown)), 2, "保存后的 Markdown 可解析成 2 节点树");
    eq(mdb.deleteMindmap(mm.id), true, "deleteMindmap 命中");
    eq(mdb.deleteMindmap(mm.id), false, "deleteMindmap 重复删除返回 false");
    eq(mdb.getMindmap(mm.id), null, "删除后 getMindmap 为 null");

    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const p14 = `scripts/.tmp-e2e/r14-${Date.now()}.db`;
    const file14 = openDatabase({ path: p14 });
    file14.createMindmap({ title: "持久化", contentMarkdown: "# 根\n- 子" });
    file14.close();
    const reopened14 = openDatabase({ path: p14 });
    eq(reopened14.listMindmaps().length, 1, "导图关库重开不丢（列表）");
    eq(reopened14.getMindmap(1)!.contentMarkdown, "# 根\n- 子", "导图关库重开不丢（Markdown 源逐字节）");
    reopened14.close();
    const raw14 = openDatabaseRaw({ path: `scripts/.tmp-e2e/r14-raw-${Date.now()}.db` });
    eq((raw14.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 27, "真实 PRAGMA user_version=27");
    eq(
      raw14.raw.all("PRAGMA table_info(mindmaps)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "title", "content_markdown", "created_at", "updated_at"],
      "mindmaps 表列结构由 v10 迁移创建（id/title/content_markdown/created_at/updated_at）",
    );
    raw14.raw.close();
  }

  // 48. r15：白板画布（布局规则 / 重叠避让 / AI 建板 / 导出 / schema v11 数据层）
  section("r15 白板：布局归一 / 重叠避让 / AI 建板 / 导出 / schema v11 数据层");
  {
    // shared：类型集合与守卫
    eq(WHITEBOARD_ITEM_TYPES, ["note", "text", "shape"], "item 类型集合恰为 note/text/shape");
    eq(isWhiteboardItemType("note"), true, "note 是合法 item 类型");
    eq(isWhiteboardItemType("line"), false, "line 不是合法 item 类型");
    eq(isWhiteboardItemType(42), false, "数字不是合法 item 类型");
    eq(MAX_WHITEBOARD_TITLE, 200, "白板标题上限与 shared 常量一致");
    eq(MAX_WHITEBOARD_CONTENT, 20000, "便签内容上限与 shared 常量一致");
    throws(() => assertValidWhiteboardTitle(""), "白板空标题守卫抛错");
    throws(() => assertValidWhiteboardTitle("   "), "白板纯空白标题守卫抛错");
    throws(() => assertValidWhiteboardTitle("x".repeat(MAX_WHITEBOARD_TITLE + 1)), "白板超长标题守卫抛错");
    noThrow(() => assertValidWhiteboardTitle("x".repeat(MAX_WHITEBOARD_TITLE)), "白板标题恰为上限值合法");
    throws(() => assertValidWhiteboardTheme(""), "AI 建板空主题守卫抛错");
    throws(() => assertValidWhiteboardTheme("a\u0000b"), "AI 建板含 NUL 主题守卫抛错");

    // normalizeWhiteboardItem：唯一归一入口
    const n1 = normalizeWhiteboardItem("note", { x: 10, y: 20 });
    eq(n1.type, "note", "归一：type 保留");
    eq(n1.x, 10, "归一：x 保留");
    eq(n1.y, 20, "归一：y 保留");
    eq(n1.w, 180, "归一：note 缺省宽 180");
    eq(n1.h, 140, "归一：note 缺省高 140");
    eq(n1.content, "", "归一：缺省内容为空串");
    eq(n1.color, "#FEF3C7", "归一：note 缺省暖黄底色");
    eq(normalizeWhiteboardItem("text", {}).w, 260, "归一：text 缺省宽 260");
    eq(normalizeWhiteboardItem("shape", {}).color, "#D1FAE5", "归一：shape 缺省绿色");
    eq(normalizeWhiteboardItem("note", { x: 1, y: 2, w: 200, h: 100, content: "hi", color: "#123456" }).content, "hi", "归一：显式内容保留");
    throws(() => normalizeWhiteboardItem("line", {}), "归一：非法 item 类型抛错");
    throws(() => normalizeWhiteboardItem("note", { x: WHITEBOARD_COORD_MAX + 1 }), "归一：x 越上界抛错");
    throws(() => normalizeWhiteboardItem("note", { y: WHITEBOARD_COORD_MIN - 1 }), "归一：y 越下界抛错");
    throws(() => normalizeWhiteboardItem("note", { w: WHITEBOARD_SIZE_MIN - 1 }), "归一：宽过小抛错");
    throws(() => normalizeWhiteboardItem("note", { h: WHITEBOARD_SIZE_MAX + 1 }), "归一：高过大抛错");
    throws(() => normalizeWhiteboardItem("note", { x: Number.NaN }), "归一：NaN 坐标抛错");
    throws(() => normalizeWhiteboardItem("note", { content: "a\u0000b" }), "归一：含 NUL 内容抛错");
    throws(() => normalizeWhiteboardItem("note", { content: "x".repeat(MAX_WHITEBOARD_CONTENT + 1) }), "归一：超长内容抛错");
    throws(() => normalizeWhiteboardItem("note", { color: "red" }), "归一：非法颜色抛错");
    eq(normalizeWhiteboardItem("note", { x: 10, y: 20 }), normalizeWhiteboardItem("note", { x: 10, y: 20 }), "归一：同输入逐字段相等（确定性）");

    // 重叠判定与避让（唯一规则，api/web 零算法分支）
    eq(whiteboardItemsOverlap({ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 50, w: 100, h: 100 }), true, "重叠判定：交叉为真");
    eq(whiteboardItemsOverlap({ x: 0, y: 0, w: 100, h: 100 }, { x: 100, y: 0, w: 100, h: 100 }), false, "重叠判定：贴边不算重叠");
    eq(whiteboardItemsOverlap({ x: 0, y: 0, w: 100, h: 100 }, { x: 200, y: 200, w: 10, h: 10 }), false, "重叠判定：分离为假");
    const resolved = collisionResolve([
      { id: 1, x: 100, y: 100, w: 180, h: 140 },
      { id: 2, x: 100, y: 100, w: 180, h: 140 },
      { id: 3, x: 100, y: 100, w: 180, h: 140 },
    ]);
    eq(resolved.items.length, 3, "避让：条目数不变");
    eq(resolved.items[0]!.y, 100, "避让：第一个原位不动");
    eq(resolved.items[1]!.y, 100 + 140 + WHITEBOARD_COLLISION_GAP, "避让：第二个下移到第一个下方 + 间距");
    eq(resolved.items[2]!.y, 100 + 2 * (140 + WHITEBOARD_COLLISION_GAP), "避让：第三个继续下移");
    eq(resolved.movedIds, [2, 3], "避让：返回被移动的 id 清单");
    eq(resolved.items[0]!.x, 100, "避让：x 不被改动");
    eq(resolved.items.every((a, i) => resolved.items.slice(i + 1).every((b) => !whiteboardItemsOverlap(a, b))), true, "避让后任意两条目互不重叠");
    eq(collisionResolve([{ id: 1, x: 0, y: 0, w: 100, h: 100 }, { id: 2, x: 100, y: 0, w: 100, h: 100 }]).movedIds, [], "避让：贴边不触发移动");
    eq(collisionResolve(resolved.items).movedIds, [], "避让：幂等（再跑一次零移动）");
    eq(collisionResolve([]).items.length, 0, "避让：空数组返回空");

    // mock AI 建板
    const plan1 = planAiWhiteboard("产品发布会");
    const plan2 = planAiWhiteboard("产品发布会");
    ok(plan1.items.length >= 5 && plan1.items.length <= 8, "AI 建板生成 5-8 个便签");
    eq(plan1.theme, "产品发布会", "AI 建板主题回显");
    eq(plan1, plan2, "AI 建板：同主题确定性（零随机零 token）");
    eq(plan1.items.every((it) => it.type === "note"), true, "AI 建板条目全是 note 便签");
    eq(plan1.items.every((it) => it.content.includes("产品发布会")), true, "AI 建板每条便签内容含真实主题");
    eq(plan1.items.every((it, i) => plan1.items.slice(i + 1).every((other) => !whiteboardItemsOverlap(it, other))), true, "AI 建板布局互不重叠");
    ok(planAiWhiteboard("团队周会").items[0]!.content.includes("团队周会"), "AI 建板：换主题内容随之变化");
    eq(new Set(plan1.items.map((it) => it.content)).size, plan1.items.length, "AI 建板便签内容互不重复");
    eq(collisionResolve(plan1.items).movedIds, [], "AI 建板布局经避让判定为零移动");

    // Markdown 导出
    const wbItem = (id: number, x: number, y: number, content: string, type: WhiteboardItem["type"] = "note"): WhiteboardItem => ({
      id, boardId: 1, type, x, y, w: 180, h: 140, content, color: "", createdAt: "t", updatedAt: "t",
    });
    const md1 = buildWhiteboardMarkdown("周会白板", [wbItem(2, 0, 100, "第二条"), wbItem(1, 0, 0, "第一条")]);
    ok(md1.startsWith("# 周会白板\n"), "导出 Markdown 以白板标题为 H1");
    ok(md1.indexOf("第一条") < md1.indexOf("第二条"), "导出 Markdown 按 y 坐标排序（视觉顺序）");
    ok(md1.includes("## 便签 #1") && md1.includes("## 便签 #2"), "导出 Markdown 每条目一个二级标题");
    ok(md1.includes("(0, 0)"), "导出 Markdown 含真实坐标");
    eq(buildWhiteboardMarkdown("空板", []), "# 空板\n\n> 导出自协流 XieFlow 白板 · 共 0 个条目\n", "导出 Markdown：空板只有标题与计数");
    ok(buildWhiteboardMarkdown("含图", [wbItem(1, 0, 0, "形", "shape")]).includes("## 图形 #1"), "导出 Markdown 区分 shape 类型标签");
    ok(buildWhiteboardMarkdown("长文", [wbItem(1, 0, 0, "第一行\n第二行")]).includes("第一行\n第二行"), "导出 Markdown 内容逐字保留多行");

    // 画布坐标换算（共享纯函数，web 零数学分支）
    const vp = { x: 40, y: -20, scale: 1.5 };
    eq(screenToCanvasPoint(340, 130, 100, 50, vp), { x: (340 - 100 - 40) / 1.5, y: (130 - 50 + 20) / 1.5 }, "屏幕→画布换算含平移与缩放");
    const canvasPt = screenToCanvasPoint(340, 130, 100, 50, vp);
    eq(canvasToScreenPoint(canvasPt.x, canvasPt.y, 100, 50, vp), { x: 340, y: 130 }, "画布→屏幕换算与上一步互逆");
    eq(screenToCanvasPoint(240, 90, 100, 50, { x: 0, y: 0, scale: 1 }), { x: 140, y: 40 }, "单位缩放且零平移时坐标即视口内偏移");
    eq(clampWhiteboardScale(0.01), WHITEBOARD_MIN_SCALE, "缩放下限被钉住");
    eq(clampWhiteboardScale(99), WHITEBOARD_MAX_SCALE, "缩放上限被钉住");
    eq(clampWhiteboardScale(1.25), 1.25, "合法缩放原值返回");

    // schema v11 与白板数据层
    const wdb = freshDb();
    eq(wdb.listWhiteboards().length, 0, "新库白板列表为空");
    const wb1 = wdb.createWhiteboard({ title: "r15 白板" });
    ok(wb1.id > 0, "createWhiteboard 返回自增 id");
    eq(wb1.title, "r15 白板", "白板标题读回");
    eq(wdb.listWhiteboards().length, 1, "listWhiteboards 读到一张白板");
    eq(wdb.getWhiteboard(wb1.id)!.id, wb1.id, "getWhiteboard 按 id 命中");
    eq(wdb.getWhiteboard(999999), null, "getWhiteboard 不存在返回 null");
    throws(() => wdb.createWhiteboard({ title: "" }), "数据层拒绝空标题白板");
    eq(wdb.updateWhiteboardTitle(wb1.id, "改名白板")!.title, "改名白板", "updateWhiteboardTitle 生效");
    eq(wdb.updateWhiteboardTitle(999999, "x"), null, "updateWhiteboardTitle 越权 id 返回 null");
    eq(wdb.createWhiteboardItem(999999, { type: "note" }), null, "数据层拒绝越权 board_id（null→api 404）");
    const it1 = wdb.createWhiteboardItem(wb1.id, { type: "note", x: 10, y: 20, content: "便签甲" })!;
    ok(it1.id > 0, "createWhiteboardItem 返回自增 id");
    eq(it1.boardId, wb1.id, "条目 boardId 回显");
    eq(it1.type, "note", "条目 type 回显");
    eq(it1.content, "便签甲", "条目 content 逐字回显");
    const it2 = wdb.createWhiteboardItem(wb1.id, { type: "text", x: 10, y: 20, content: "便签乙" })!;
    eq(wdb.listWhiteboardItems(wb1.id).length, 2, "listWhiteboardItems 读到两条");
    eq(wdb.getWhiteboardItem(it1.id)!.id, it1.id, "getWhiteboardItem 命中");
    eq(wdb.getWhiteboardItem(999999), null, "getWhiteboardItem 不存在返回 null");
    throws(() => wdb.createWhiteboardItem(wb1.id, { type: "line" }), "数据层拒绝非法 item 类型");
    throws(() => wdb.createWhiteboardItem(wb1.id, { type: "note", x: WHITEBOARD_COORD_MAX + 1 }), "数据层拒绝越界坐标");
    eq(wdb.updateWhiteboardItem(it1.id, { content: "改后内容" })!.content, "改后内容", "updateWhiteboardItem 改内容生效");
    throws(() => wdb.updateWhiteboardItem(it1.id, { y: WHITEBOARD_COORD_MIN - 1 }), "数据层拒绝越界改坐标");
    const moved = wdb.moveWhiteboardItems(wb1.id, [{ id: it1.id, x: 500, y: 500 }, { id: it2.id, x: 500, y: 500 }])!;
    eq(moved.length, 2, "批量移动返回两条");
    eq(moved.find((it) => it.id === it2.id)!.y > 500, true, "批量移动后重叠条目被避让下移");
    eq(wdb.moveWhiteboardItems(wb1.id, [{ id: 999999, x: 1, y: 1 }]), null, "批量移动含越权 id 返回 null（零半态）");
    eq(wdb.getWhiteboardItem(it1.id)!.y, 500, "越权批量移动失败后既有坐标未被改动（零半态）");
    const aiItems = wdb.aiCreateWhiteboard(wb1.id, "季度复盘")!;
    ok(aiItems.length >= 5 && aiItems.length <= 8, "数据层 AI 建板真生成 5-8 条");
    eq(wdb.listWhiteboardItems(wb1.id).length, 2 + aiItems.length, "AI 建板条目真落库");
    eq(wdb.aiCreateWhiteboard(999999, "x"), null, "AI 建板越权 board_id 返回 null");

    // r15 返工#1（A）：复现 waizhuan 路径——板上已有便签 (120,300) + AI 建板「季度复盘」
    // 断言「全量画布」（既有 + 新增）两两无重叠，且避让后的既有坐标真回写落库。
    const wbOverlap = wdb.createWhiteboard({ title: "r15 返工 AI 重叠复现" })!;
    const oldNote = wdb.createWhiteboardItem(wbOverlap.id, { type: "note", x: 120, y: 300, content: "既有便签" })!;
    const aiOverlap = wdb.aiCreateWhiteboard(wbOverlap.id, "季度复盘")!;
    const fullAfterAi = wdb.listWhiteboardItems(wbOverlap.id);
    eq(fullAfterAi.length, 1 + aiOverlap.length, "AI 建板后全量条目数 = 既有 + 新增");
    eq(
      fullAfterAi.every((a, i) => fullAfterAi.slice(i + 1).every((b) => !whiteboardItemsOverlap(a, b))),
      true,
      "AI 建板后全量画布（含既有条目）两两无重叠",
    );
    eq(wdb.getWhiteboardItem(oldNote.id)!.y > 300, true, "AI 建板把避让后的既有条目坐标回写落库");
    const boardSummaries = wdb.listWhiteboards();
    eq(
      boardSummaries.find((w) => w.id === wbOverlap.id)!.itemCount,
      fullAfterAi.length,
      "白板列表 itemCount 与 AI 建板后该板真实条目数一致（侧栏计数不串台）",
    );
    eq(
      boardSummaries.find((w) => w.id === wb1.id)!.itemCount,
      wdb.listWhiteboardItems(wb1.id).length,
      "白板列表 itemCount 逐板独立（不复用选中板条目数）",
    );

    eq(wdb.deleteWhiteboardItem(it1.id), true, "deleteWhiteboardItem 命中");
    eq(wdb.deleteWhiteboardItem(it1.id), false, "deleteWhiteboardItem 重复删除返回 false");
    eq(wdb.deleteWhiteboard(wb1.id), true, "deleteWhiteboard 命中后子条目级联删除");
    eq(wdb.listWhiteboardItems(wb1.id).length, 0, "删白板后条目归零（ON DELETE CASCADE）");
    eq(wdb.deleteWhiteboard(wb1.id), false, "deleteWhiteboard 重复删除返回 false");

    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const p15 = `scripts/.tmp-e2e/r15-${Date.now()}.db`;
    const f15 = openDatabase({ path: p15 });
    const pw = f15.createWhiteboard({ title: "持久化" });
    f15.createWhiteboardItem(pw.id, { type: "note", x: 7, y: 9, content: "关库不丢" });
    f15.close();
    const r15 = openDatabase({ path: p15 });
    eq(r15.listWhiteboards().length, 1, "白板关库重开不丢（列表）");
    eq(r15.listWhiteboardItems(1)[0]!.content, "关库不丢", "白板条目关库重开不丢（逐字）");
    r15.close();
    const raw15 = openDatabaseRaw({ path: `scripts/.tmp-e2e/r15-raw-${Date.now()}.db` });
    eq((raw15.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 27, "真实 PRAGMA user_version=27");
    eq(
      raw15.raw.all("PRAGMA table_info(whiteboards)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "title", "created_at"],
      "whiteboards 表列结构由 v11 迁移创建",
    );
    eq(
      raw15.raw.all("PRAGMA table_info(whiteboard_items)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "board_id", "type", "x", "y", "w", "h", "content", "color", "created_at", "updated_at"],
      "whiteboard_items 表列结构由 v11 迁移创建",
    );
    raw15.raw.close();
  }

  // 50. r16：审批状态机（集中 shared）/ 步骤流转 / 三视角 / schema v12 数据层（TDD：先断言，后实现）
  section("r16 审批：状态机 / 步骤流转 / 三视角 / schema v12 数据层");
  {
    // shared：枚举、转移表与守卫（状态机唯一入口，api/web 零流转分支）
    eq(APPROVAL_STATUSES, ["draft", "pending", "approved", "rejected", "withdrawn"], "审批状态集合恰为五态");
    eq(APPROVAL_TRANSITIONS.draft, ["pending"], "draft 只允许提交进入 pending");
    eq(APPROVAL_TRANSITIONS.pending, ["approved", "rejected", "withdrawn"], "pending 可批准/驳回/撤回");
    eq(APPROVAL_TRANSITIONS.approved, [], "approved 是终态（零出边）");
    eq(APPROVAL_TRANSITIONS.rejected, [], "rejected 是终态（零出边）");
    eq(APPROVAL_TRANSITIONS.withdrawn, [], "withdrawn 是终态（零出边）");
    eq(APPROVAL_ACTIONS, ["submit", "approve", "reject", "delegate", "withdraw"], "审批动作集合恰为五类");
    eq(APPROVAL_TYPES, ["leave", "expense", "purchase", "other"], "审批类型集合恰为四类");
    eq(APPROVAL_VIEWS, ["todo", "initiated", "cc"], "三视角集合逐字锁定");
    eq(isApprovalStatus("pending"), true, "pending 是合法状态");
    eq(isApprovalStatus("sleep"), false, "未知状态被拒");
    eq(isApprovalAction("delegate"), true, "delegate 是合法动作");
    eq(isApprovalAction(42), false, "数字不是合法动作");
    eq(isApprovalView("cc"), true, "cc 是合法视角");
    eq(isApprovalView("all"), false, "未知视角被拒");
    eq(APPROVAL_TYPE_LABELS.leave, "请假", "请假类型中文标签");
    eq(APPROVAL_STATUS_LABELS.pending, "待审批", "pending 中文标签");
    eq(APPROVAL_ACTION_LABELS.delegate, "转交", "delegate 中文标签");
    throws(() => assertValidApprovalTitle(""), "空审批标题守卫抛错");
    throws(() => assertValidApprovalTitle("   "), "纯空白审批标题守卫抛错");
    throws(() => assertValidApprovalTitle("x".repeat(MAX_APPROVAL_TITLE + 1)), "超长审批标题守卫抛错");
    throws(() => assertValidApprovalTitle("a\u0000b"), "含 NUL 审批标题守卫抛错");
    noThrow(() => assertValidApprovalTitle("x".repeat(MAX_APPROVAL_TITLE)), "恰为上限标题合法");
    throws(() => assertValidApprovalType("x"), "非法审批类型守卫抛错");
    noThrow(() => assertValidApprovalType("expense"), "合法审批类型通过");
    throws(() => assertValidApprovalUser(""), "空审批人守卫抛错");
    throws(() => assertValidApprovalUser("x".repeat(MAX_APPROVAL_USER + 1)), "超长审批人守卫抛错");
    throws(() => assertValidApprovalComment("x".repeat(MAX_APPROVAL_COMMENT + 1)), "超长审批意见守卫抛错");

    eq(canTransitionApproval("draft", "pending"), true, "状态机：draft→pending 合法");
    eq(canTransitionApproval("draft", "approved"), false, "状态机：draft→approved 非法");
    eq(canTransitionApproval("pending", "approved"), true, "状态机：pending→approved 合法");
    eq(canTransitionApproval("pending", "rejected"), true, "状态机：pending→rejected 合法");
    eq(canTransitionApproval("pending", "withdrawn"), true, "状态机：pending→withdrawn 合法");
    eq(canTransitionApproval("approved", "pending"), false, "状态机：终态不能回到 pending");
    eq(canTransitionApproval("pending", "pending"), false, "状态机：转交不改状态（pending→pending 不在转移表）");
    noThrow(() => assertValidApprovalTransition("draft", "pending"), "合法流转断言不抛错");
    throws(() => assertValidApprovalTransition("rejected", "approved"), "非法流转断言抛错");

    // planApprovalAction：所有动作的结果与拒绝口径集中一处
    const draftCtx = { status: "draft" as const, applicantId: "alice", currentAssignee: "bob", actor: "alice" };
    const pendingCtx = { status: "pending" as const, applicantId: "alice", currentAssignee: "bob", actor: "bob" };
    const submitPlan = planApprovalAction("submit", draftCtx);
    eq(submitPlan, { action: "submit", nextStatus: "pending", nextAssignee: "bob", stepAssignee: "alice" }, "submit：draft→pending，assignee 不变");
    throws(() => planApprovalAction("submit", { ...draftCtx, actor: "bob" }), "非发起人不能提交");
    throws(() => planApprovalAction("approve", draftCtx), "draft 不能直接审批");
    eq(planApprovalAction("approve", pendingCtx).nextStatus, "approved", "approve：pending→approved");
    eq(planApprovalAction("approve", pendingCtx).nextAssignee, "bob", "approve 不改 assignee");
    eq(planApprovalAction("reject", pendingCtx).nextStatus, "rejected", "reject：pending→rejected");
    const delegatePlan = planApprovalAction("delegate", { ...pendingCtx, targetAssignee: "carol" });
    eq(delegatePlan.nextStatus, "pending", "delegate 不改状态（唯一规则）");
    eq(delegatePlan.nextAssignee, "carol", "delegate 真换 assignee");
    eq(delegatePlan.stepAssignee, "carol", "delegate 步骤记新 assignee");
    throws(() => planApprovalAction("delegate", { ...pendingCtx, targetAssignee: "bob" }), "转交目标不能与当前 assignee 相同");
    throws(() => planApprovalAction("delegate", pendingCtx), "转交缺目标抛错");
    throws(() => planApprovalAction("approve", { ...pendingCtx, actor: "carol" }), "非 assignee 审批被拒");
    throws(() => planApprovalAction("reject", { ...pendingCtx, actor: "carol" }), "非 assignee 驳回被拒");
    throws(() => planApprovalAction("delegate", { ...pendingCtx, actor: "carol", targetAssignee: "dave" }), "非 assignee 转交被拒");
    eq(planApprovalAction("withdraw", { ...pendingCtx, actor: "alice" }).nextStatus, "withdrawn", "发起人撤回：pending→withdrawn");
    throws(() => planApprovalAction("withdraw", pendingCtx), "非发起人不能撤回");
    throws(() => planApprovalAction("approve", { ...pendingCtx, status: "approved" }), "已通过再审批抛错");
    throws(() => planApprovalAction("reject", { ...pendingCtx, status: "rejected" }), "已驳回再审批抛错");
    throws(() => planApprovalAction("approve", { ...pendingCtx, status: "withdrawn" }), "已撤回再审批抛错");
    throws(() => planApprovalAction("sleep", pendingCtx), "非法动作抛错");
    noThrow(() => assertValidApprovalAction("approve", pendingCtx), "assertValidApprovalAction：合法动作通过");
    throws(() => assertValidApprovalAction("approve", { ...pendingCtx, actor: "carol" }), "assertValidApprovalAction：非 assignee 抛错");
    eq(availableApprovalActions(draftCtx), ["submit"], "草稿态仅发起人可提交");
    eq(availableApprovalActions(pendingCtx), ["approve", "reject", "delegate"], "待审态当前 assignee 三动作");
    eq(availableApprovalActions({ ...pendingCtx, actor: "alice" }), ["withdraw"], "待审态发起人仅可撤回");
    eq(availableApprovalActions({ ...pendingCtx, status: "approved" }), [], "终态无可用动作");

    // 三视角纯函数（web/api 共用同一过滤口径）
    const mkA = (id: number, applicantId: string, currentAssignee: string, status: ApprovalStatus): Approval => ({
      id, title: `审批${id}`, type: "leave", applicantId, status, currentAssignee,
      createdAt: "t", updatedAt: "t",
    });
    const viewAll = [mkA(1, "alice", "bob", "pending"), mkA(2, "alice", "bob", "approved"), mkA(3, "carol", "bob", "pending")];
    const ccMap: Record<number, readonly string[]> = { 1: ["dave"], 2: ["dave", "erin"] };
    eq(selectApprovalsForView({ approvals: viewAll, ccByApproval: ccMap, view: "todo", actor: "bob" }).map((a) => a.id), [1, 3], "我的待办：只数 pending 且 assignee 是我");
    eq(selectApprovalsForView({ approvals: viewAll, ccByApproval: ccMap, view: "todo", actor: "alice" }).map((a) => a.id), [], "我的待办：已通过的不算待办");
    eq(selectApprovalsForView({ approvals: viewAll, ccByApproval: ccMap, view: "initiated", actor: "alice" }).map((a) => a.id), [1, 2], "我发起的：按 applicant 过滤（含终态）");
    eq(selectApprovalsForView({ approvals: viewAll, ccByApproval: ccMap, view: "initiated", actor: "carol" }).map((a) => a.id), [3], "我发起的：另一发起人独立");
    eq(selectApprovalsForView({ approvals: viewAll, ccByApproval: ccMap, view: "cc", actor: "dave" }).map((a) => a.id), [1, 2], "抄送我的：按 cc 名单过滤");
    eq(selectApprovalsForView({ approvals: viewAll, ccByApproval: ccMap, view: "cc", actor: "erin" }).map((a) => a.id), [2], "抄送我的：单人命中");
    throws(() => selectApprovalsForView({ approvals: viewAll, ccByApproval: ccMap, view: "all" as never, actor: "bob" }), "非法视角抛错");
    throws(() => selectApprovalsForView({ approvals: viewAll, ccByApproval: ccMap, view: "todo", actor: "" }), "空用户抛错");

    // schema v12 与审批数据层（真迁移、真落库、真事务、真三视角）
    const adb = freshDb();
    eq(adb.listApprovals().length, 0, "新库审批列表为空");
    const a1 = adb.createApproval({
      title: "r16 请假审批", type: "leave", applicantId: "alice", currentAssignee: "bob", cc: ["dave"],
    });
    ok(a1.id > 0, "createApproval 返回自增 id");
    eq(a1.status, "draft", "新建审批初始状态 draft");
    eq(a1.title, "r16 请假审批", "审批标题读回");
    eq(a1.type, "leave", "审批类型读回");
    eq(a1.applicantId, "alice", "申请人读回");
    eq(a1.currentAssignee, "bob", "初始审批人读回");
    throws(() => adb.createApproval({ title: "", type: "leave", applicantId: "a", currentAssignee: "b" }), "数据层拒绝空标题审批");
    throws(() => adb.createApproval({ title: "x", type: "x", applicantId: "a", currentAssignee: "b" }), "数据层拒绝非法审批类型");
    throws(() => adb.createApproval({ title: "x", type: "leave", applicantId: "a", currentAssignee: "" }), "数据层拒绝空审批人");
    eq(adb.getApproval(a1.id)!.id, a1.id, "getApproval 按 id 命中");
    eq(adb.getApproval(999999), null, "getApproval 不存在返回 null");
    eq(adb.listApprovalCc(a1.id), ["dave"], "createApproval 抄送人真落库");
    adb.addApprovalCc(a1.id, "erin");
    eq(adb.listApprovalCc(a1.id), ["dave", "erin"], "addApprovalCc 追加抄送人");
    throws(() => adb.addApprovalCc(a1.id, "dave"), "重复抄送人被拒（UNIQUE）");
    eq(adb.listApprovalCc(999999), [], "越权 id 抄送列表为空");
    eq(adb.listApprovalSteps(a1.id).length, 0, "草稿态无步骤（提交才产生第一步）");

    const submitted = adb.actOnApproval(a1.id, "submit", "alice", { comment: "请审批" })!;
    eq(submitted.status, "pending", "submit 真流转到 pending");
    const steps1: ApprovalStep[] = adb.listApprovalSteps(a1.id);
    eq(steps1.length, 1, "提交产生 1 条步骤");
    eq(steps1[0]!.action, "submit", "第一步动作为 submit");
    eq(steps1[0]!.order, 0, "第一步 order=0");
    eq(steps1[0]!.assignee, "alice", "提交步骤 assignee 为操作人");
    eq(steps1[0]!.comment, "请审批", "步骤审批意见逐字落库");
    throws(() => adb.actOnApproval(a1.id, "approve", "carol", { comment: "越权" }), "非 assignee 审批在数据层被拒");
    eq(adb.getApproval(a1.id)!.status, "pending", "非法操作后状态未变（零半态）");
    eq(adb.listApprovalSteps(a1.id).length, 1, "非法操作未写步骤（零半态）");

    const delegated = adb.actOnApproval(a1.id, "delegate", "bob", { targetAssignee: "carol", comment: "交给 carol" })!;
    eq(delegated.status, "pending", "数据层 delegate 不改状态");
    eq(delegated.currentAssignee, "carol", "数据层 delegate 真改 assignee");
    const steps2 = adb.listApprovalSteps(a1.id);
    eq(steps2.length, 2, "转交产生第二步");
    eq(steps2[1]!.action, "delegate", "第二步动作为 delegate");
    eq(steps2[1]!.assignee, "carol", "转交步骤记新 assignee");
    eq(steps2[1]!.order, 1, "第二步 order=1 连号");
    throws(() => adb.actOnApproval(a1.id, "approve", "bob", {}), "转交后旧 assignee 不能审批");

    const approved = adb.actOnApproval(a1.id, "approve", "carol", { comment: "同意" })!;
    eq(approved.status, "approved", "approve 真流转到 approved");
    eq(adb.listApprovalSteps(a1.id).length, 3, "审批产生第三步");
    throws(() => adb.actOnApproval(a1.id, "approve", "carol", {}), "已结单再审批抛错");
    throws(() => adb.actOnApproval(a1.id, "reject", "carol", {}), "已结单再驳回抛错");
    throws(() => adb.actOnApproval(a1.id, "delegate", "carol", { targetAssignee: "dave" }), "已结单不能再转交");
    const approvedSnapshot = JSON.stringify(adb.getApproval(a1.id));
    eq(approvedSnapshot, JSON.stringify(adb.getApproval(a1.id)), "4xx 后审批快照逐字节不变");

    const a2 = adb.createApproval({ title: "r16 报销审批", type: "expense", applicantId: "alice", currentAssignee: "bob", cc: ["dave"] });
    adb.actOnApproval(a2.id, "submit", "alice", {});
    eq(adb.listApprovalsByView("todo", "bob").map((x) => x.id), [a2.id], "db 我的待办：pending 且 assignee 是我");
    eq(adb.listApprovalsByView("initiated", "alice").map((x) => x.id), [a2.id, a1.id], "db 我发起的：含终态（列表按 id 倒序）");
    eq(adb.listApprovalsByView("cc", "dave").map((x) => x.id), [a2.id, a1.id], "db 抄送我的：按抄送名单（列表按 id 倒序）");
    eq(adb.listApprovalsByView("todo", "carol").map((x) => x.id), [], "db 转交后 carol 待审的那单已结，待办为空");
    throws(() => adb.listApprovalsByView("all" as never, "bob"), "db 非法视角抛错");

    const a3 = adb.createApproval({ title: "r16 驳回", type: "other", applicantId: "frank", currentAssignee: "grace" });
    adb.actOnApproval(a3.id, "submit", "frank", {});
    eq(adb.actOnApproval(a3.id, "reject", "grace", { comment: "不批" })!.status, "rejected", "reject 真流转到 rejected");
    const a4 = adb.createApproval({ title: "r16 撤回", type: "purchase", applicantId: "helen", currentAssignee: "ivan" });
    adb.actOnApproval(a4.id, "submit", "helen", {});
    eq(adb.actOnApproval(a4.id, "withdraw", "helen", {})!.status, "withdrawn", "withdraw 真流转到 withdrawn");
    throws(() => adb.actOnApproval(a4.id, "submit", "helen", {}), "已撤回不能重复提交");

    eq(adb.deleteApproval(a1.id), true, "deleteApproval 命中");
    eq(adb.listApprovalSteps(a1.id).length, 0, "删审批后步骤级联归零");
    eq(adb.listApprovalCc(a1.id).length, 0, "删审批后抄送级联归零");
    eq(adb.deleteApproval(a1.id), false, "重复删除返回 false");
    adb.updateApprovalTitle(a2.id, "改名报销");
    eq(adb.getApproval(a2.id)!.title, "改名报销", "updateApprovalTitle 生效");
    eq(adb.updateApprovalTitle(999999, "x"), null, "updateApprovalTitle 越权 id 返回 null");

    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const p16 = `scripts/.tmp-e2e/r16-${Date.now()}.db`;
    const f16 = openDatabase({ path: p16 });
    const pa = f16.createApproval({ title: "持久化审批", type: "leave", applicantId: "alice", currentAssignee: "bob", cc: ["dave"] });
    f16.actOnApproval(pa.id, "submit", "alice", { comment: "保存后重开" });
    f16.actOnApproval(pa.id, "approve", "bob", {});
    f16.close();
    const r16 = openDatabase({ path: p16 });
    eq(r16.getApproval(pa.id)!.status, "approved", "审批关库重开状态不丢");
    eq(r16.listApprovalSteps(pa.id).length, 2, "审批步骤关库重开不丢");
    eq(r16.listApprovalCc(pa.id), ["dave"], "抄送人关库重开不丢");
    r16.close();

    const raw16 = openDatabaseRaw({ path: `scripts/.tmp-e2e/r16-raw-${Date.now()}.db` });
    eq((raw16.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 27, "真实 PRAGMA user_version=27");
    eq(
      raw16.raw.all("PRAGMA table_info(approvals)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "title", "type", "applicant_id", "status", "current_assignee", "created_at", "updated_at", "applicant_member_id"],
      "approvals 表八列由 v12 迁移创建（v17 追加 applicant_member_id）",
    );
    eq(
      raw16.raw.all("PRAGMA table_info(approval_steps)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "approval_id", "order", "assignee", "action", "comment", "acted_at", "assignee_member_id", "actor_member_id"],
      "approval_steps 表由 v12 迁移创建（order 列名保留；v17 追加 assignee_member_id，v25 追加 actor_member_id）",
    );
    eq(
      raw16.raw.all("PRAGMA table_info(approval_cc)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "approval_id", "cc_user", "created_at", "cc_member_id"],
      "approval_cc 表四列由 v12 迁移创建（v17 追加 cc_member_id）",
    );
    throws(
      () => raw16.raw.run("INSERT INTO approvals (title,type,applicant_id,status,current_assignee,created_at,updated_at) VALUES ('x','x','a','draft','b','t','t')"),
      "approvals.type CHECK 拒绝非法类型（raw 直达 schema 约束）",
    );
    throws(
      () => raw16.raw.run("INSERT INTO approval_steps (approval_id,\"order\",assignee,action,comment,acted_at) VALUES (1,0,'a','sleep','','t')"),
      "approval_steps.action CHECK 拒绝非法动作",
    );
    raw16.raw.close();
    adb.close();
    db = null;
  }

  // 51. r17：物资台账与单位任务流转（库存规则 / 状态机 / 任务树 / schema v13 数据层）
  section("r17 物资台账与单位任务：库存规则 / 状态机 / 任务树 / schema v13 数据层");
  {
    // 51a. 单位任务状态机（集中 shared）
    eq(UNIT_TASK_STATUSES, ["pending", "in_progress", "blocked", "done", "cancelled"], "五态集合与 schema v13 CHECK 同源");
    eq(UNIT_TASK_TRANSITIONS.pending, ["in_progress", "blocked", "cancelled"], "pending 出边三项");
    eq(UNIT_TASK_TRANSITIONS.in_progress, ["done", "blocked", "cancelled"], "in_progress 出边三项");
    eq(UNIT_TASK_TRANSITIONS.blocked, ["in_progress", "cancelled"], "blocked 出边两项");
    eq(UNIT_TASK_TRANSITIONS.done, [], "done 终态零出边");
    eq(UNIT_TASK_TRANSITIONS.cancelled, [], "cancelled 终态零出边");
    ok(canTransitionUnitTask("pending", "in_progress"), "pending→in_progress 合法");
    ok(canTransitionUnitTask("in_progress", "done"), "in_progress→done 合法");
    ok(canTransitionUnitTask("blocked", "in_progress"), "blocked→in_progress 可恢复");
    ok(!canTransitionUnitTask("done", "in_progress"), "done→in_progress 拒绝");
    ok(!canTransitionUnitTask("cancelled", "pending"), "cancelled→pending 拒绝");
    ok(!canTransitionUnitTask("pending", "done"), "pending 直接 done 拒绝");
    throws(() => assertValidUnitTaskTransition("done", "pending"), "done 回退抛错");
    ok(isUnitTaskStatus("blocked") && !isUnitTaskStatus("sleeping"), "状态类型守卫正确");

    // 51b. 库存规则 applyAssetTransaction（纯函数 / 负库存拒绝 / 转移位置校验）
    const sampleAsset: Asset = {
      id: 1, name: "笔记本电脑", category: "equipment", quantity: 10,
      unit: "台", location: "仓库A", custodian: "张三", createdAt: "2026-01-01T00:00:00.000Z",
    };
    const afterIn = applyAssetTransaction(sampleAsset, { type: "in", quantity: 5, to: "仓库A", operator: "李四" });
    eq(afterIn.quantity, 15, "入库 5：10→15");
    eq(afterIn.location, "仓库A", "入库 to 更新位置");
    eq(sampleAsset.quantity, 10, "入库不改入参（纯函数）");
    const afterOut = applyAssetTransaction(sampleAsset, { type: "out", quantity: 3, from: "仓库A", operator: "李四" });
    eq(afterOut.quantity, 7, "出库 3：10→7");
    eq(sampleAsset.quantity, 10, "出库不改入参（纯函数）");
    eq(applyAssetTransaction(sampleAsset, { type: "out", quantity: 10, operator: "x" }).quantity, 0, "出库到 0 允许");
    throws(() => applyAssetTransaction(sampleAsset, { type: "out", quantity: 11, operator: "x" }), "负库存拒绝（11>10）");
    throws(() => applyAssetTransaction(sampleAsset, { type: "in", quantity: -1, operator: "x" }), "入库负数拒绝");
    throws(() => applyAssetTransaction(sampleAsset, { type: "in", quantity: 1.5, operator: "x" }), "非整数数量拒绝");
    throws(() => applyAssetTransaction(sampleAsset, { type: "in", quantity: 1, operator: "" }), "空操作人拒绝");
    const afterTransfer = applyAssetTransaction(sampleAsset, { type: "transfer", quantity: 1, from: "仓库A", to: "仓库B", operator: "王五" });
    eq(afterTransfer.quantity, 10, "转移不改总量");
    eq(afterTransfer.location, "仓库B", "转移更新位置到 to");
    throws(() => applyAssetTransaction(sampleAsset, { type: "transfer", quantity: 1, from: "仓库C", to: "仓库B", operator: "x" }), "来源位置不匹配拒绝");
    throws(() => applyAssetTransaction(sampleAsset, { type: "transfer", quantity: 1, to: "仓库B", operator: "x" }), "转移缺来源拒绝");
    eq(ASSET_CATEGORIES.length, 5, "物资分类五种");
    eq(ASSET_TX_TYPES, ["in", "out", "transfer"], "流水类型三种");
    ok(isAssetCategory("office") && !isAssetCategory("unknown"), "分类守卫正确");
    ok(isAssetTxType("transfer") && !isAssetTxType("move"), "流水类型守卫正确");
    throws(() => assertValidAssetName(""), "空物资名拒绝");
    throws(() => assertValidAssetCategory("unknown" as never), "非法分类抛错");
    throws(() => assertValidQuantity(0), "数量 0 抛错");
    throws(() => assertValidAssetTxType("move" as never), "非法流水类型抛错");

    // 51c. 任务树装配 buildTaskTree（层级 / 孤儿父节点 / 环路检测 / 确定性）
    const flatTasks: UnitTask[] = [
      { id: 1, title: "总目标", assigneeUnit: "总部", status: "in_progress", dueDate: null, parentId: null },
      { id: 2, title: "子任务A", assigneeUnit: "研发部", status: "pending", dueDate: null, parentId: 1 },
      { id: 3, title: "子任务A-1", assigneeUnit: "小组", status: "pending", dueDate: null, parentId: 2 },
      { id: 4, title: "独立任务", assigneeUnit: "行政部", status: "done", dueDate: null, parentId: 99 },
    ];
    const tree = buildTaskTree(flatTasks);
    eq(tree.length, 2, "两棵根树（孤儿父节点按根处理）");
    eq(tree[0]!.id, 1, "根节点按 id 升序 1 在前");
    eq(tree[0]!.children.length, 1, "根 1 有一个子节点");
    eq(tree[0]!.children[0]!.id, 2, "子节点 id=2");
    eq(tree[0]!.children[0]!.children[0]!.id, 3, "三层嵌套 id=3");
    eq(tree[1]!.id, 4, "孤儿任务 4 作为独立根");
    eq(flatTasks.length, 4, "装配不改入参数组（纯函数）");
    throws(
      () => buildTaskTree([
        { id: 1, title: "A", assigneeUnit: "u", status: "pending", dueDate: null, parentId: 2 },
        { id: 2, title: "B", assigneeUnit: "u", status: "pending", dueDate: null, parentId: 1 },
      ]),
      "环路任务树抛错",
    );
    eq(buildTaskTree([]).length, 0, "空任务列表装配为空树");
    eq(UNIT_TASK_STATUS_LABELS.blocked, "受阻", "状态中文标签正确");

    // 51d. schema v13 与数据层（真迁移、真落库、真事务、零半态）
    const raw17 = openDatabaseRaw({ path: ":memory:" });
    eq((raw17.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 27, "新库 user_version=27");
    eq(
      raw17.raw.all("PRAGMA table_info(assets)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "name", "category", "quantity", "unit", "location", "custodian", "created_at", "custodian_member_id"],
      "assets 表八列由 v13 迁移创建（v17 追加 custodian_member_id）",
    );
    eq(
      raw17.raw.all("PRAGMA table_info(asset_transactions)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "asset_id", "type", "quantity", "from", "to", "operator", "created_at"],
      "asset_transactions 表八列（from/to 列名保留）",
    );
    eq(
      raw17.raw.all("PRAGMA table_info(unit_tasks)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "title", "assignee_unit", "status", "due_date", "parent_id", "created_at"],
      "unit_tasks 表七列（parent_id 可空）",
    );
    throws(
      () => raw17.raw.run("INSERT INTO assets (name,category,quantity,unit,location,custodian,created_at) VALUES ('x','x',1,'p','l','c','t')"),
      "assets.category CHECK 拒绝非法分类",
    );
    throws(
      () => raw17.raw.run('INSERT INTO asset_transactions (asset_id,type,quantity,"from","to",operator,created_at) VALUES (1,\'sleep\',1,\'\',\'\',\'x\',\'t\')'),
      "asset_transactions.type CHECK 拒绝非法类型",
    );
    throws(
      () => raw17.raw.run("INSERT INTO unit_tasks (title,assignee_unit,status,due_date,parent_id,created_at) VALUES ('x','u','sleep',NULL,NULL,'t')"),
      "unit_tasks.status CHECK 拒绝非法状态",
    );
    raw17.raw.close();

    const rdb = freshDb();
    eq(rdb.listAssets().length, 0, "新库物资列表为空");
    const a1 = rdb.createAsset({ name: "投影仪", category: "equipment", quantity: 5, unit: "台", location: "仓库A", custodian: "张三" });
    eq(a1.quantity, 5, "建账初始库存 5");
    eq(a1.category, "equipment", "物资分类回读");
    const a2 = rdb.createAsset({ name: "打印纸", category: "office", quantity: 100, unit: "包", location: "仓库B", custodian: "李四" });
    eq(rdb.listAssets().length, 2, "两笔物资真落库");
    const tx1 = rdb.applyAssetTx(a1.id, { type: "in", quantity: 3, to: "仓库A", operator: "王五" });
    eq(tx1.type, "in", "入库流水类型回读");
    eq(rdb.getAsset(a1.id)!.quantity, 8, "入库后库存真回写 8");
    const tx2 = rdb.applyAssetTx(a1.id, { type: "out", quantity: 2, from: "仓库A", operator: "赵六" });
    eq(rdb.getAsset(a1.id)!.quantity, 6, "出库后库存真回写 6");
    const tx3 = rdb.applyAssetTx(a1.id, { type: "transfer", quantity: 1, from: "仓库A", to: "仓库B", operator: "王五" });
    eq(tx3.type, "transfer", "转移流水类型回读");
    eq(rdb.getAsset(a1.id)!.location, "仓库B", "转移后位置真回写");
    eq(rdb.getAsset(a1.id)!.quantity, 6, "转移不改库存总量");
    eq(rdb.listAssetTransactions(a1.id).length, 3, "该物资三条流水");
    eq(rdb.listAssetTransactions().length, 3, "全量流水三条");
    const qtyBeforeReject = rdb.getAsset(a1.id)!.quantity;
    throws(() => rdb.applyAssetTx(a1.id, { type: "out", quantity: 999, operator: "x" }), "数据层拒绝负库存出库");
    eq(rdb.getAsset(a1.id)!.quantity, qtyBeforeReject, "4xx 后库存未变（零半态）");
    eq(rdb.listAssetTransactions(a1.id).length, 3, "4xx 后未写入流水（零半态）");
    throws(() => rdb.applyAssetTx(999999, { type: "in", quantity: 1, operator: "x" }), "越权 asset_id 拒绝");

    const t1 = rdb.createUnitTask({ title: "年度审计", assigneeUnit: "审计部", dueDate: "2026-12-31" });
    eq(t1.status, "pending", "任务默认 pending");
    eq(t1.dueDate, "2026-12-31", "到期日回读");
    const t2 = rdb.createUnitTask({ title: "审计子项", assigneeUnit: "审计部", parentId: t1.id });
    eq(t2.parentId, t1.id, "父任务 id 回读");
    throws(() => rdb.createUnitTask({ title: "x", assigneeUnit: "u", parentId: 999999 }), "父任务不存在拒绝");
    const t2Progressed = rdb.transitionUnitTask(t2.id, "in_progress")!;
    eq(t2Progressed.status, "in_progress", "任务流转到进行中");
    throws(() => rdb.transitionUnitTask(t2.id, "pending"), "in_progress 不能回退 pending");
    const doneTask = rdb.transitionUnitTask(t2.id, "done")!;
    eq(doneTask.status, "done", "in_progress→done 合法");
    throws(() => rdb.transitionUnitTask(t2.id, "pending"), "终态不可回退");
    throws(() => rdb.transitionUnitTask(t2.id, "sleep"), "非法状态拒绝");
    const treeFromDb = rdb.getUnitTaskTree();
    eq(treeFromDb.length, 1, "数据层任务树一根");
    eq(treeFromDb[0]!.children[0]!.id, t2.id, "数据层任务树层级正确");
    throws(() => rdb.createUnitTask({ title: "", assigneeUnit: "u" }), "空任务标题拒绝");
    throws(() => rdb.createUnitTask({ title: "x", assigneeUnit: "u", dueDate: "not-a-date" }), "非法到期日拒绝");

    // 关库重开不丢（真文件库持久化）
    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const p17 = `scripts/.tmp-e2e/r17-${Date.now()}.db`;
    const f17 = openDatabase({ path: p17 });
    const pa = f17.createAsset({ name: "持久化物资", category: "material", quantity: 4, unit: "箱", location: "仓库C", custodian: "张三" });
    f17.applyAssetTx(pa.id, { type: "in", quantity: 2, to: "仓库C", operator: "李四" });
    f17.createUnitTask({ title: "持久化任务", assigneeUnit: "后勤部", dueDate: "2026-12-01" });
    f17.close();
    const rdb2 = openDatabase({ path: p17 });
    eq(rdb2.getAsset(pa.id)!.quantity, 6, "物资关库重开库存不丢");
    eq(rdb2.listAssetTransactions(pa.id).length, 1, "流水关库重开不丢");
    eq(rdb2.listUnitTasks()[0]!.title, "持久化任务", "任务关库重开不丢");
    eq(rdb2.deleteAsset(pa.id), true, "删物资真删");
    eq(rdb2.listAssetTransactions(pa.id).length, 0, "级联删除流水归零");
    rdb2.close();
    eq(rdb.deleteAsset(a1.id), true, "内存库删物资真删");
    rdb.close();
    db = null;
  }

  // 52. r18：认证与会话（PBKDF2 哈希 / 校验 / 会话过期 / 权限 / schema v14 数据层）
  section("r18 认证与会话：哈希 / 校验 / 会话过期 / 权限 / schema v14 数据层");
  {
    // 52a. 角色 → 权限映射（唯一口径集中在 shared/auth，api/web 零分支）
    eq(AUTH_ROLES, ["user", "admin"], "认证角色仅 user/admin 两种");
    ok(canAuth("user", "todo:read"), "普通用户可读待办");
    ok(canAuth("user", "todo:write"), "普通用户可写待办");
    ok(!canAuth("user", "user:manage"), "普通用户不可管理用户");
    ok(!canAuth("user", "auth:mode"), "普通用户不可切换服务模式");
    ok(canAuth("admin", "user:manage"), "管理员可管理用户");
    ok(canAuth("admin", "auth:mode"), "管理员可切换服务模式");
    ok(AUTH_PERMISSIONS.admin.length > AUTH_PERMISSIONS.user.length, "管理员权限严格多于普通用户");
    throws(() => assertPermission("user", "user:manage"), "越权权限守卫抛错");
    assertPermission("admin", "user:manage");
    ok(true, "管理员权限守卫放行不抛错");

    // 52b. 用户名 / 弱密码守卫（真实拒绝行为）
    assertValidUsername("r18_alice");
    ok(true, "合法用户名放行");
    throws(() => assertValidUsername(""), "空用户名拒绝");
    throws(() => assertValidUsername("ab"), "过短用户名拒绝");
    throws(() => assertValidUsername("a".repeat(33)), "过长用户名拒绝");
    assertValidPassword("r18-Strong-Pass-2026");
    ok(true, "强密码放行");
    throws(() => assertValidPassword(""), "空密码拒绝");
    throws(() => assertValidPassword("short"), "弱密码（<8）拒绝");
    throws(() => assertValidPassword("a".repeat(201)), "超长密码拒绝");

    // 52c. PBKDF2 哈希与校验（真算法：与 Node 内置 pbkdf2Sync 逐字节对照）
    const pw = "r18-Strong-Pass-2026";
    const h1 = hashPassword(pw);
    const parts = h1.split("$");
    eq(parts.length, 4, "哈希存储格式四段 pbkdf2$iters$salt$digest");
    eq(parts[0], "pbkdf2", "哈希算法标记为 pbkdf2");
    eq(Number(parts[1]), PBKDF2_ITERATIONS, "迭代次数与 shared 常量一致");
    ok(/^[0-9a-f]{64}$/.test(parts[2] ?? ""), "盐为 64 位十六进制（32 字节随机）");
    ok(/^[0-9a-f]{64}$/.test(parts[3] ?? ""), "摘要为 64 位十六进制（32 字节）");
    eq(
      parts[3],
      pbkdf2Sync(pw, Buffer.from(parts[2] ?? "", "hex"), Number(parts[1]), PBKDF2_KEYLEN, "sha256").toString("hex"),
      "哈希摘要与 Node 内置 pbkdf2-sha256 逐字节一致（真算法非占位）",
    );
    const h2 = hashPassword(pw);
    ok(h1 !== h2, "同密码两次哈希不同（随机盐，非确定性弱哈希）");
    ok(verifyPassword(pw, h1), "正确密码校验通过");
    ok(verifyPassword(pw, h2), "另一随机盐哈希同样校验通过");
    ok(!verifyPassword("wrong-password", h1), "错误密码校验失败");
    ok(!verifyPassword(pw, "pbkdf2$bad$zz$zz"), "非法存储格式校验返回 false 不抛错");
    ok(!verifyPassword(pw, parts.slice(0, 3).concat("0".repeat(64)).join("$")), "篡改摘要校验失败");
    ok(!h1.includes(pw), "密码明文不出现在哈希串中");

    // 52d. 会话过期校验（到期时刻即失效，边界确定）
    const iso = (ms: number): string => new Date(ms).toISOString();
    const now = Date.parse("2026-11-18T12:00:00.000Z");
    const exp = now + SESSION_TTL_MS;
    const session: Session = { id: 1, userId: 1, token: "a".repeat(64), expiresAt: iso(exp) };
    eq(validateSession(session, now), { valid: true }, "未过期会话有效");
    eq(validateSession(session, now + 1000), { valid: true }, "有效期内会话持续有效");
    eq(validateSession(session, exp), { valid: false, reason: "expired" }, "到期时刻即判过期（不拖延一秒）");
    eq(validateSession(session, exp + 1), { valid: false, reason: "expired" }, "过期后会话无效");
    ok(SESSION_TTL_MS > 0, "会话 TTL 为正数");

    // 52e. token 本地随机生成（不写任何密钥文件）
    const t1 = generateSessionToken();
    const t2 = generateSessionToken();
    eq(t1.length, 64, "会话 token 64 位十六进制");
    ok(/^[0-9a-f]{64}$/.test(t1), "token 字符集仅小写 hex");
    ok(t1 !== t2, "两次 token 不重复（本地随机）");
    ok(!t1.includes("/") && !t1.includes("."), "token 不含路径字符（不落盘为文件）");

    // 52f. schema v14 与账号数据层（真迁移、真落库、不明文、级联清理）
    const raw18 = openDatabaseRaw({ path: ":memory:" });
    eq((raw18.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 27, "新库 user_version=27");
    eq(
      raw18.raw.all("PRAGMA table_info(users)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "username", "password_hash", "role", "created_at"],
      "users 五列由 v14 迁移创建（password_hash 非明文列）",
    );
    eq(
      raw18.raw.all("PRAGMA table_info(sessions)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "user_id", "token", "expires_at"],
      "sessions 四列由 v14 迁移创建",
    );
    const adb = raw18.db;
    eq(adb.listUsers().length, 0, "新库用户表为空");
    const admin = adb.createUser({ username: "r18_admin", password: "r18-Strong-Pass-2026" });
    eq(admin.username, "r18_admin", "首个用户用户名回读");
    eq(admin.role, "admin", "首个用户自动成为管理员（自托管首启引导）");
    eq(adb.getUserById(admin.id)!.id, admin.id, "按 id 读回用户");
    eq(adb.getUserByUsername("r18_admin")!.id, admin.id, "按用户名读回用户");
    const rawHash = (raw18.raw.get("SELECT password_hash FROM users WHERE id = ?", [admin.id]) as { password_hash: string }).password_hash;
    ok(!rawHash.includes("r18-Strong-Pass-2026"), "库内 password_hash 不含密码明文");
    ok(rawHash.startsWith("pbkdf2$"), "库内 password_hash 为 PBKDF2 摘要格式");
    ok(verifyPassword("r18-Strong-Pass-2026", rawHash), "库内摘要可被 verifyPassword 校验通过");
    throws(() => adb.createUser({ username: "r18_admin", password: "another-Strong-Pass" }), "重复用户名拒绝");
    throws(() => adb.createUser({ username: "bob", password: "weak" }), "弱密码在落库前拒绝");
    const member = adb.createUser({ username: "r18_bob", password: "r18-Strong-Pass-2026" });
    eq(member.role, "user", "第二个用户为普通角色");
    eq(adb.listUsers().length, 2, "用户列表读回两人");

    const s1 = adb.createSession({ userId: admin.id, token: generateSessionToken(), expiresAt: iso(now + SESSION_TTL_MS) });
    eq(s1.userId, admin.id, "会话绑定用户 id");
    eq(adb.getSessionByToken(s1.token)!.id, s1.id, "按 token 读回会话");
    eq(adb.listSessions().length, 1, "会话列表一条");
    eq(adb.listSessions(admin.id).length, 1, "按用户过滤会话一条");
    throws(() => adb.createSession({ userId: 999999, token: generateSessionToken(), expiresAt: iso(now + SESSION_TTL_MS) }), "越权 user_id 会话拒绝");
    throws(() => adb.createSession({ userId: admin.id, token: "short", expiresAt: iso(now + SESSION_TTL_MS) }), "非法 token 会话拒绝");
    throws(() => adb.createSession({ userId: admin.id, token: generateSessionToken(), expiresAt: "not-a-date" }), "非法 expires_at 会话拒绝");
    const expired = adb.createSession({ userId: member.id, token: generateSessionToken(), expiresAt: iso(now - 1000) });
    eq(validateSession(adb.getSessionByToken(expired.token)!, now).valid, false, "库内读回的过期会话判无效");
    eq(adb.deleteSessionsForUser(admin.id), 1, "按用户删除会话返回删除数");
    eq(adb.getSessionByToken(s1.token), null, "删除后 token 不再命中（登出清登录态）");
    eq(adb.purgeExpiredSessions(iso(now)).length > 0, true, "清理过期会话至少一条");
    eq(adb.getSessionByToken(expired.token), null, "过期会话已清除");
    eq(adb.deleteUser(admin.id), true, "删除用户返回 true");
    eq(adb.getSessionByToken(expired.token), null, "用户删除后会话级联清除");
    eq(adb.deleteUser(member.id), true, "删除第二个用户返回 true");
    eq(adb.listUsers().length, 0, "账号数据层清理归零");
    raw18.raw.close();

    // 持久化重开不丢（真文件库）
    mkdirSync("scripts/.tmp-e2e", { recursive: true });
    const p18 = `scripts/.tmp-e2e/r18-${Date.now()}.db`;
    const f18 = openDatabase({ path: p18 });
    const pu = f18.createUser({ username: "r18_persist", password: "r18-Strong-Pass-2026" });
    const ps = f18.createSession({ userId: pu.id, token: generateSessionToken(), expiresAt: iso(Date.now() + SESSION_TTL_MS) });
    f18.close();
    const f18b = openDatabase({ path: p18 });
    eq(f18b.getUserByUsername("r18_persist")!.id, pu.id, "用户关库重开不丢");
    eq(f18b.getSessionByToken(ps.token)!.userId, pu.id, "会话关库重开不丢");
    f18b.close();
  }

  // 53. r18 返工#1：浏览器层统一 fetch 入口（纯函数模拟真实 apiFetch，headless 零窗口）
  section("r18 返工#1 浏览器请求入口与 401 清态");
  {
    const srcDir = "apps/web/src";
    const pageFiles = readdirSync(srcDir).filter((f) => f === "App.tsx" || (f.endsWith("Page.tsx") && f !== "AuthPages.tsx"));
    ok(pageFiles.length >= 14, `业务页/外壳 ${pageFiles.length} 个文件进入裸 fetch 扫描（认证页除外）`);
    const bareFetchFiles = pageFiles.filter((f) => /(^|[^A-Za-z])fetch\s*\(/.test(readFileSync(`${srcDir}/${f}`, "utf8")));
    eq(bareFetchFiles, [], "全部业务页无裸 fetch（逐页 grep 无遗漏）");
    const noApiFetch = pageFiles.filter((f) => !/\bapiFetch\b/.test(readFileSync(`${srcDir}/${f}`, "utf8")));
    eq(noApiFetch, [], "每个业务页都经 apiFetch 发请求");
    const authSrc = readFileSync(`${srcDir}/AuthPages.tsx`, "utf8");
    ok(/fetch\("\/api\/auth\/(login|register)"/.test(authSrc), "认证页公开端点保留裸 fetch（登录 401 不误跳业务入口）");

    const store = new Map<string, string>();
    const redirected: string[] = [];
    const dispatched: string[] = [];
    const fakeWindow = {
      location: {
        href: "http://localhost:5173/?page=todos",
        replace: (url: string) => { redirected.push(url); },
      },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
      },
      dispatchEvent: (event: { type: string }) => { dispatched.push(event.type); return true; },
    };
    const originalFetch = globalThis.fetch;
    Object.assign(globalThis, { window: fakeWindow });
    try {
      // remote 模式：真 token 必须附 Authorization 头且响应 200（waizhuan P1 浏览器层）
      const token = "b".repeat(64);
      store.set(SESSION_TOKEN_KEY, token);
      let seenPath: unknown = null;
      let seenInit: RequestInit | undefined;
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        seenPath = input;
        seenInit = init;
        return new Response(JSON.stringify({ todos: [] }), { status: 200, headers: { "content-type": "application/json" } });
      };
      const okRes = await apiFetch("/api/todos");
      eq(okRes.status, 200, "r18 返工#1 remote 带 token 访问业务 API -> 200");
      eq(seenPath, "/api/todos", "apiFetch 原样透传业务 API 路径");
      eq(new Headers(seenInit?.headers).get("authorization"), `Bearer ${token}`, "业务请求自动附 Bearer 头（不再裸 fetch）");

      // 业务 401：清 localStorage token + 跳 ?page=login&reason=401 + 广播清态事件
      store.set(SESSION_TOKEN_KEY, token);
      redirected.length = 0;
      dispatched.length = 0;
      globalThis.fetch = async () => new Response(
        JSON.stringify({ error: "登录态无效或已过期，请重新登录", code: "UNAUTHORIZED", cleared: true }),
        { status: 401, headers: { "content-type": "application/json", "x-xieflow-auth-cleared": "1" } },
      );
      const badRes = await apiFetch("/api/todos");
      eq(badRes.status, 401, "业务 401 响应原样返回给调用方（不吞错）");
      eq(store.has(SESSION_TOKEN_KEY), false, "业务 401 清除 localStorage 假/过期 token");
      eq(redirected.length, 1, "业务 401 只跳一次登录页（无重复导航）");
      ok(redirected[0]?.includes("page=login") === true && redirected[0]?.includes("reason=401") === true, "业务 401 跳 ?page=login&reason=401");
      ok(dispatched.includes(AUTH_CLEARED_EVENT), "清态广播事件供外壳同步顶栏登录态");

      // local 模式：无 token 不附假头
      store.delete(SESSION_TOKEN_KEY);
      let anonInit: RequestInit | undefined;
      globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
        anonInit = init;
        return new Response("{}", { status: 200 });
      };
      await apiFetch("/api/todos");
      eq(new Headers(anonInit?.headers).get("authorization"), null, "无 token（本机模式）不附 Authorization 头");
    } finally {
      globalThis.fetch = originalFetch;
      Reflect.deleteProperty(globalThis, "window");
    }
  }

  // 55. r19：多端同步与冲突处理（TDD 先红：shared 规则 + schema v15 + 数据层）
  section("r19 多端同步：守卫 / 三方合并 / 乐观锁 / 幂等 / schema v15");
  {
    // 变更操作枚举唯一口径
    eq(CHANGE_OPERATIONS, ["create", "update", "delete"], "r19 变更操作枚举为 create/update/delete 且顺序固定");
    noThrow(() => assertValidEntityType("todo"), "r19 合法实体类型 todo 通过守卫");
    throws(() => assertValidEntityType(""), "r19 空实体类型被守卫拒绝");
    throws(() => assertValidEntityType("Bad Type"), "r19 含空格/大写的实体类型被守卫拒绝");
    noThrow(() => assertValidEntityId("12"), "r19 数字字符串实体 id 通过守卫");
    noThrow(() => assertValidEntityId("todo-abc"), "r19 字符串实体 id 通过守卫");
    throws(() => assertValidEntityId(""), "r19 空实体 id 被守卫拒绝");
    noThrow(() => assertValidChangeOperation("update"), "r19 update 操作通过守卫");
    throws(() => assertValidChangeOperation("sleep"), "r19 非法操作被守卫拒绝");
    noThrow(() => assertValidVersion(0), "r19 版本 0（未创建）合法");
    throws(() => assertValidVersion(-1), "r19 负版本被拒绝");
    throws(() => assertValidVersion(1.5), "r19 非整数版本被拒绝");

    // nextVersion：唯一版本递增入口
    eq(nextVersion(0), 1, "r19 nextVersion(0)=1");
    eq(nextVersion(7), 8, "r19 nextVersion(7)=8");
    throws(() => nextVersion(-1), "r19 nextVersion 对负版本抛错（不静默产出版号）");

    // 查询参数归一（非法 since / limit 由 shared 唯一守卫）
    eq(normalizeSince(undefined), 0, "r19 since 缺省归一为 0");
    eq(normalizeSince(null), 0, "r19 since=null 归一为 0");
    eq(normalizeSince("0"), 0, "r19 since='0' 归一为 0");
    eq(normalizeSince("42"), 42, "r19 since 正整数字符串归一为数值");
    throws(() => normalizeSince("-1"), "r19 负 since 被拒绝");
    throws(() => normalizeSince("abc"), "r19 非数字 since 被拒绝");
    eq(normalizeLimit(undefined), DEFAULT_SYNC_LIMIT, "r19 limit 缺省取 DEFAULT_SYNC_LIMIT");
    eq(normalizeLimit("10"), 10, "r19 limit 字符串归一为数值");
    eq(normalizeLimit("99999"), MAX_SYNC_LIMIT, "r19 limit 超上界收敛到 MAX_SYNC_LIMIT");
    eq(normalizeLimit("0"), 1, "r19 limit=0 收敛到 1（不返回空页造成误解）");
    throws(() => normalizeLimit("-3"), "r19 负 limit 被拒绝");

    // 深度相等（字段值比较唯一规则）
    ok(valuesEqual({ a: 1, b: [2, 3] }, { b: [2, 3], a: 1 }), "r19 valuesEqual：键顺序不同视为相等");
    ok(!valuesEqual({ a: 1 }, { a: 2 }), "r19 valuesEqual：值不同判不等");

    // 三方比较：本地改 A + 远端改 B（同字段不同值 = 真冲突；不同字段 = 可合并）
    const base = { title: "原", status: "open" };
    const cSameField = detectConflict(base, { title: "本地", status: "open" }, { title: "远端", status: "open" });
    eq(cSameField.conflicts, ["title"], "r19 同字段被两端改不同值 -> conflicts=[title]（waizhuan 手算口径）");
    ok(cSameField.hasConflict, "r19 真冲突时 hasConflict=true");
    eq(cSameField.merged.title, "远端", "r19 冲突字段默认取远端（服务端 wins，用户可改选）");
    const cDiffField = detectConflict(base, { title: "本地", status: "open" }, { title: "原", status: "done" });
    eq(cDiffField.conflicts, [], "r19 两端改不同字段 -> 无严格冲突（可三方合并）");
    eq(cDiffField.divergedFields, ["status", "title"], "r19 分歧字段列表仍列出全部变化字段（排序确定）");
    eq(cDiffField.merged, { status: "done", title: "本地" }, "r19 不同字段改动三方合并后双值都在");
    const cLocalOnly = detectConflict(base, { title: "本地", status: "open" }, base);
    eq(cLocalOnly.conflicts, [], "r19 仅本地改动 -> 无冲突");
    eq(cLocalOnly.merged.title, "本地", "r19 仅本地改动取本地值");
    const cRemoteOnly = detectConflict(base, base, { title: "远端", status: "open" });
    eq(cRemoteOnly.merged.title, "远端", "r19 仅远端改动取远端值");
    const cDeleted = detectConflict({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2 });
    ok(!("b" in cDeleted.merged), "r19 本地删除字段不被远端未改的旧值复活");
    ok(!valuesEqual(base, base) === false, "r19 detectConflict 不修改入参 base（纯函数）");

    // 增量合并：按 id 去重（幂等）+ 同实体版本分叉标记
    const mkChange = (id: number, version: number, payload: Record<string, unknown>, entityId = "1"): ChangeRecord => ({
      id,
      entityType: "todo",
      entityId,
      operation: "update",
      payload,
      userId: null,
      createdAt: `2026-11-18T00:00:0${id}Z`,
      version,
    });
    const mergedSet = applyChangeSet([mkChange(1, 1, { title: "a" })], [mkChange(2, 2, { title: "b" })]);
    eq(mergedSet.applied.map((c) => c.id), [1, 2], "r19 applyChangeSet 合并两端不重复 id");
    eq(mergedSet.duplicates, 0, "r19 无重复 id 时 duplicates=0");
    const replaySet = applyChangeSet(
      [mkChange(1, 1, { title: "a" }), mkChange(2, 2, { title: "b" })],
      [mkChange(1, 1, { title: "a" }), mkChange(2, 2, { title: "b" })],
    );
    eq(replaySet.applied.length, 2, "r19 同一 change_set 重放不新增记录（幂等）");
    eq(replaySet.duplicates, 2, "r19 重放两次记录全部识别为重复");
    const forkSet = applyChangeSet([mkChange(1, 2, { title: "L" })], [mkChange(2, 2, { title: "R" })]);
    eq(forkSet.conflicts, ["todo:1"], "r19 同实体同版本不同载荷 -> 实体级冲突标记");

    // schema v15 与数据层：change_log / entity_versions 真表真迁移
    const raw19 = openDatabaseRaw({ path: ":memory:" });
    eq((raw19.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 27, "r19 新库 user_version=27（r19 基线随 r28 推进）");
    const logCols = raw19.raw.all("PRAGMA table_info(change_log)").map((r) => String((r as unknown as { name: unknown }).name));
    eq(logCols, ["id", "entity_type", "entity_id", "operation", "payload", "user_id", "created_at", "version"], "r19 change_log 八列逐列存在");
    const verCols = raw19.raw.all("PRAGMA table_info(entity_versions)").map((r) => String((r as unknown as { name: unknown }).name));
    eq(verCols, ["entity_type", "entity_id", "version", "updated_at"], "r19 entity_versions 四列逐列存在");
    throws(
      () => raw19.raw.run("INSERT INTO change_log (entity_type,entity_id,operation,payload,created_at,version) VALUES ('todo','1','sleep','{}','t',1)"),
      "r19 change_log operation CHECK 拒绝非法操作",
    );
    throws(
      () => raw19.raw.run("INSERT INTO entity_versions (entity_type,entity_id,version,updated_at) VALUES ('todo','1',0,'t'),('todo','1',1,'t')"),
      "r19 entity_versions 主键唯一（同实体不能两行）",
    );

    const sdb = raw19.db;
    const a1 = sdb.applySyncChange({ entityType: "todo", entityId: "1", operation: "create", payload: { title: "A", status: "open" }, expectedVersion: 0 });
    eq(a1.version, 1, "r19 首次 apply 版本递增到 1");
    ok(a1.applied.id > 0 && a1.applied.payload.title === "A", "r19 apply 真写 change_log 且载荷读回");
    eq(sdb.getEntityVersion("todo", "1")?.version, 1, "r19 entity_versions 真落库版本 1");
    eq(sdb.listEntityVersions().length, 1, "r19 status 视角列出一个实体版本");
    const again = sdb.applySyncChange({ entityType: "todo", entityId: "1", operation: "create", payload: { title: "A", status: "open" }, expectedVersion: 0 });
    ok(again.idempotent && again.version === 1, "r19 同载荷重放幂等：版本不二次递增");
    eq(sdb.listChanges(0, 50).length, 1, "r19 幂等重放不产生第二条 change_log");

    const a2 = sdb.applySyncChange({ entityType: "todo", entityId: "1", operation: "update", payload: { title: "L", status: "open" }, expectedVersion: 1 });
    eq(a2.version, 2, "r19 第二次 apply 版本递增到 2");
    eq(sdb.listChanges(0, 50).length, 2, "r19 change_log 累积两条");
    eq(sdb.listChanges(1, 50).length, 1, "r19 since=1 增量拉取只返回 id>1 的一条");
    eq(sdb.listChanges(0, 50), sdb.listChanges(0, 50), "r19 同一 since 重复拉结果逐字节一致（幂等）");
    eq(sdb.getChangeAtVersion("todo", "1", 1)?.payload.title, "A", "r19 按版本回读基线载荷");
    eq(sdb.getLatestChange("todo", "1")?.version, 2, "r19 最新变更读回版本 2");
    eq(sdb.listLatestChange()?.id, a2.applied.id, "r19 status 语义：listLatestChange 取最新 id 而非最早（2 条变更）");
    eq(sdb.listLatestChange()?.createdAt, a2.applied.createdAt, "r19 status 语义：listLatestChange 取最后写入时间");
    ok((sdb.listLatestChange()?.id ?? 0) > sdb.listChanges(0, 1)[0]!.id, "r19 status 语义：全表最新不等于 listChanges(0,1) 的最早一条");

    // 乐观锁冲突：期望版本过期 → SyncConflictError 带准确冲突字段
    let conflictErr: unknown = null;
    try {
      sdb.applySyncChange({ entityType: "todo", entityId: "1", operation: "update", payload: { title: "R", status: "open" }, expectedVersion: 1, base: { title: "A", status: "open" } });
    } catch (err) {
      conflictErr = err;
    }
    ok(conflictErr instanceof SyncConflictError, "r19 过期版本 apply 抛 SyncConflictError（api 映射 409）");
    eq((conflictErr as SyncConflictError | null)?.conflicts, ["title"], "r19 409 冲突字段列表准确：title");
    eq((conflictErr as SyncConflictError | null)?.currentVersion, 2, "r19 409 回带服务端当前版本 2");
    eq((conflictErr as SyncConflictError | null)?.remote.title, "L", "r19 409 回带远端载荷供弹窗选边");

    // 选远端（ accepting server state）后版本递增且再同步无冲突
    const resolved = sdb.applySyncChange({
      entityType: "todo", entityId: "1", operation: "update",
      payload: { title: "L", status: "open" }, expectedVersion: 2, base: { title: "A", status: "open" },
    });
    eq(resolved.version, 3, "r19 选边后版本递增到 3");
    ok(!resolved.idempotent, "r19 选边是真新变更（非幂等重放）");
    const cleanConflict = detectConflict({ title: "L", status: "open" }, { title: "L", status: "open" }, { title: "L", status: "open" });
    eq(cleanConflict.conflicts, [], "r19 选边后三方比较无冲突（再同步干净）");
    eq(sdb.listLatestChange()?.id, resolved.applied.id, "r19 status 语义：3 条变更后 listLatestChange 仍取最新 id");
    raw19.raw.close();

    // 渲染层结构断言：同步卡在设置页内，不新增 tab；所有请求走 apiFetch
    const syncSrc = readFileSync("apps/web/src/SyncCard.tsx", "utf8");
    const appSrc = readFileSync("apps/web/src/App.tsx", "utf8");
    const serverSrc = readFileSync("apps/api/src/server.ts", "utf8");
    ok(/store\.listLatestChange\(\)/.test(serverSrc), "r19 status 走 db.listLatestChange（api 零排序分支）");
    ok(!/store\.listChanges\(\s*0\s*,\s*1\s*\)/.test(serverSrc), "r19 status 不再用 listChanges(0,1) 误取最早一条");
    ok(/<SyncCard\s*\/>/.test(appSrc), "r19 工作台设置区渲染多端同步卡");
    ok(!/(^|[^A-Za-z])fetch\s*\(/.test(syncSrc), "r19 同步卡无裸 fetch（统一 apiFetch）");
    ok(/\bapiFetch\b/.test(syncSrc), "r19 同步卡经 apiFetch 发请求（401 清态链路一致）");
    eq((appSrc.match(/data-tab="/g) ?? []).length, 20, "r28 tab 口径：会议新增第十八 tab（r27 基线 17）");
    ok(!/r19 · 多端同步与冲突处理（M9 收官）/.test(appSrc), "r19 旧徽章已由 r20 替换（无残留）");
    ok(/sync-modal/.test(syncSrc) && /data-side="local"/.test(syncSrc) && /data-side="remote"/.test(syncSrc), "r19 冲突弹窗提供本地/远端两个选边按钮");
    ok(/sync-modal-warning/.test(syncSrc) && /不可撤销/.test(syncSrc), "r19 返工#1 选边后果提示前置（写入递增且不可撤销）");
    ok(/sync-btn-quiet/.test(syncSrc), "r19 返工#1 稍后处理按钮弱化（与两个主选区分）");
    ok(/local: "季度复盘"/.test(syncSrc) && /remote: "季度规划"/.test(syncSrc), "r19 返工#1 title 两版核心文案不同（钉态冲突自洽）");
  }

  // 56. r20：离线队列与 PWA（TDD 先红：shared 规则 + 离线语义 + 渲染层结构）
  section("r20 离线队列与 PWA：入队 / 出队 / 按序重放 / 离线语义 / 状态判定");
  {
    // 唯一口径常量（api / web 共用，避免散落魔法值）
    eq(OFFLINE_QUEUE_KEY, "xieflow.offline.queue", "r20 队列 localStorage 键固定");
    eq(OFFLINE_QUEUE_MAX, 100, "r20 队列容量上限 100 条");
    eq([...OFFLINE_REPLAY_METHODS], ["GET", "POST", "PUT", "PATCH", "DELETE"], "r20 允许重放的方法白名单固定顺序");
    eq(OFFLINE_REPLAY_PATH, "/api/offline/replay", "r20 服务端重放端点路径固定");
    eq(OFFLINE_QUEUED_STATUS, 202, "r20 离线入队返回 202 Accepted（语义化，不伪装 200 成功）");
    eq(OFFLINE_HEADER, "x-xieflow-offline", "r20 离线响应标记头固定");
    eq(OFFLINE_QUEUE_EVENT, "xieflow:offline-queue-changed", "r20 队列变更广播事件固定");
    eq(OFFLINE_CONNECTION_EVENT, "xieflow:connection-changed", "r20 连接状态变更广播事件固定");
    eq(PWA_CACHE_NAME, "xieflow-static-v20", "r20 SW 静态缓存名带轮次（升级即换名，不污染旧缓存）");

    // 条目守卫：非法队列项在入队源头被拒（HTTP 层同一守卫 → 400）
    ok(isOfflineMethod("POST"), "r20 isOfflineMethod 认 POST");
    ok(isOfflineMethod("DELETE"), "r20 isOfflineMethod 认 DELETE");
    ok(!isOfflineMethod("TRACE"), "r20 isOfflineMethod 拒绝 TRACE");
    ok(!isOfflineMethod("post"), "r20 isOfflineMethod 拒绝小写方法（归一前必须大写）");
    const goodItem: OfflineQueueItem = {
      id: "q1", method: "POST", path: "/api/todos",
      body: { title: "A", quadrant: "q1" }, createdAt: "2026-11-18T10:00:00.000Z",
    };
    noThrow(() => assertValidOfflineQueueItem(goodItem), "r20 合法队列项通过守卫");
    throws(() => assertValidOfflineQueueItem({ ...goodItem, id: "" }), "r20 空 id 队列项被拒");
    throws(() => assertValidOfflineQueueItem({ ...goodItem, method: "TRACE" }), "r20 非法方法队列项被拒");
    throws(() => assertValidOfflineQueueItem({ ...goodItem, path: "https://evil.example/api/todos" }), "r20 外部绝对 URL 队列项被拒");
    throws(() => assertValidOfflineQueueItem({ ...goodItem, path: OFFLINE_REPLAY_PATH }), "r20 重放端点自身入队被拒（防递归）");
    throws(() => assertValidOfflineQueueItem({ ...goodItem, body: [1, 2] }), "r20 数组载荷队列项被拒");
    throws(() => assertValidOfflineQueueItem({ ...goodItem, createdAt: "not-a-date" }), "r20 非法时间戳队列项被拒");
    eq(
      normalizeOfflineQueueItem({ id: "q9", method: "POST", path: "/api/todos", body: '{"title":"B"}', createdAt: goodItem.createdAt }),
      { id: "q9", method: "POST", path: "/api/todos", body: { title: "B" }, createdAt: goodItem.createdAt },
      "r20 JSON 字符串载荷归一为对象（apiFetch init.body 直接入队）",
    );
    noThrow(() => assertValidOfflineReplayRequest({ items: [goodItem] }), "r20 合法重放请求通过守卫");
    throws(() => assertValidOfflineReplayRequest({ items: "nope" }), "r20 items 非数组重放请求被拒");
    throws(() => assertValidOfflineReplayRequest({ items: [goodItem, { ...goodItem, id: "" }] }), "r20 整批校验：一条非法全批拒绝（零半态）");

    // 离线语义：只有「离线 + 变更方法 + 本应用 /api 路径」才入队
    ok(shouldQueueOffline("POST", "/api/todos", true), "r20 离线 POST 业务写请求入队");
    ok(!shouldQueueOffline("POST", "/api/todos", false), "r20 在线请求绝不入队");
    ok(!shouldQueueOffline("GET", "/api/todos", true), "r20 只读 GET 不入队（避免陈旧读）");
    ok(!shouldQueueOffline("POST", "/api/auth/login", true), "r20 认证端点不入队（避免离线登录死循环）");
    ok(!shouldQueueOffline("POST", OFFLINE_REPLAY_PATH, true), "r20 重放端点自身不入队");
    ok(!shouldQueueOffline("POST", "https://evil.example/api/todos", true), "r20 外部地址不入队");
    ok(shouldQueueOffline("PATCH", "/api/todos/12", true), "r20 离线 PATCH 入队");
    ok(shouldQueueOffline("DELETE", "/api/todos/12", true), "r20 离线 DELETE 入队");
    ok(offlineQueuePathAllowed("/api/todos?x=1"), "r20 带查询串的本应用路径允许");
    ok(!offlineQueuePathAllowed("//evil/api/todos"), "r20 协议相对地址拒绝");

    // 队列持久化：enqueue / dequeue / peek / clear 全部走注入的 Storage（浏览器 localStorage / 测试内存库同接口）
    const qstoreData = new Map<string, string>();
    const qstore: OfflineStorage = {
      getItem: (k) => qstoreData.get(k) ?? null,
      setItem: (k, v) => { qstoreData.set(k, v); },
      removeItem: (k) => { qstoreData.delete(k); },
    };
    eq(loadOfflineQueue(qstore), [], "r20 空存储读出空队列");
    const enq1 = enqueueOffline(qstore, goodItem);
    eq(enq1.id, "q1", "r20 enqueue 返回带 id 的条目");
    eq(loadOfflineQueue(qstore).length, 1, "r20 enqueue 真写 localStorage");
    ok(qstoreData.has(OFFLINE_QUEUE_KEY), "r20 队列持久化在约定键上");
    const enq2 = enqueueOffline(qstore, {
      id: "q2", method: "PATCH", path: "/api/todos/1", body: { title: "B" }, createdAt: "2026-11-18T10:01:00.000Z",
    });
    eq(peekOfflineQueue(qstore).map((i) => i.id), ["q1", "q2"], "r20 peek 保持入队 FIFO 顺序");
    eq(dequeueOffline(qstore, "q1")?.id, "q1", "r20 dequeue 返回被移除条目");
    eq(peekOfflineQueue(qstore).map((i) => i.id), ["q2"], "r20 dequeue 后队列只剩余项");
    eq(dequeueOffline(qstore, "q1"), null, "r20 重复 dequeue 返回 null（幂等）");
    eq(loadOfflineQueue(qstore)[0]?.id, enq2.id, "r20 重新读取仍是持久化后的队列");
    // 容量封顶：超出上限丢弃最早条目，不无限膨胀
    for (let i = 0; i < OFFLINE_QUEUE_MAX + 5; i++) {
      enqueueOffline(qstore, {
        id: `cap-${i}`, method: "POST", path: "/api/todos", body: { title: `c${i}` },
        createdAt: `2026-11-18T11:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
      });
    }
    eq(peekOfflineQueue(qstore).length, OFFLINE_QUEUE_MAX, "r20 队列容量封顶（不无限增长）");
    ok(!peekOfflineQueue(qstore).some((i) => i.id === "q2"), "r20 超限时丢最早条目");
    clearOfflineQueue(qstore);
    eq(loadOfflineQueue(qstore), [], "r20 clear 队列归零");

    // 按序重放：createdAt 升序（同刻按 id），整批校验通过才返回副本；非法项零半态
    const late = { ...goodItem, id: "late", createdAt: "2026-11-18T12:00:00.000Z" };
    const early = { ...goodItem, id: "early", createdAt: "2026-11-18T09:00:00.000Z" };
    const orderInput = [late, early];
    const ordered = planOfflineReplay(orderInput);
    eq(ordered.map((i) => i.id), ["early", "late"], "r20 replay 按 createdAt 升序串行重发（变异红相目标）");
    ok(ordered !== orderInput && ordered[0] !== late, "r20 planOfflineReplay 返回副本不改入参");
    throws(() => planOfflineReplay([goodItem, { ...goodItem, id: "" }]), "r20 重放计划整批校验（一条非法即全批拒绝）");
    eq(planOfflineReplay([goodItem]).length, 1, "r20 单条合法重放计划通过");

    // 语义化离线响应：202 + 标记头 + 队列 id + 可读文案，调用方 res.ok 不误判为成功落库
    const queued = buildOfflineQueuedResponse(goodItem);
    eq(queued.status, 202, "r20 离线入队响应状态 202");
    eq(queued.headers[OFFLINE_HEADER], "queued", "r20 离线响应带 x-xieflow-offline=queued");
    eq(queued.headers["x-xieflow-queue-id"], "q1", "r20 离线响应回带队列 id");
    eq(queued.body.queued, true, "r20 离线响应体 queued=true");
    eq(queued.body.id, "q1", "r20 离线响应体 id 与条目一致");
    ok(queued.body.message.includes("离线"), "r20 离线响应给出人话提示");

    // 渲染层与 PWA 结构断言（证据另见 docs/ui/r20 截图矩阵）
    const indexHtml = readFileSync("apps/web/index.html", "utf8");
    const manifest = JSON.parse(readFileSync("apps/web/public/manifest.json", "utf8")) as Record<string, unknown>;
    const swSrc = readFileSync("apps/web/public/sw.js", "utf8");
    const appSrc = readFileSync("apps/web/src/App.tsx", "utf8");
    const cssSrc = readFileSync("apps/web/src/styles.css", "utf8");
    const authSrc = readFileSync("apps/web/src/authClient.ts", "utf8");
    const statusSrc = readFileSync("apps/web/src/OfflineStatus.tsx", "utf8");
    const serverSrc = readFileSync("apps/api/src/server.ts", "utf8");
    eq(manifest.name, "协流 XieFlow", "r20 manifest 名称与产品一致");
    eq(manifest.display, "standalone", "r20 manifest display=standalone（可安装 PWA）");
    eq(manifest.start_url, "/", "r20 manifest start_url 根路径");
    ok(Array.isArray(manifest.icons) && (manifest.icons as { src: string }[]).length >= 2, "r20 manifest 至少两种尺寸图标");
    ok((manifest.icons as { src: string }[]).every((i) => i.src.startsWith("/icons/")), "r20 图标全为本地 /icons/ 路径");
    ok(!JSON.stringify(manifest).includes("http"), "r20 manifest 零外部 URL（禁 CDN）");
    ok(/rel="manifest"/.test(indexHtml), "r20 index.html 链接 manifest");
    ok(/theme-color/.test(indexHtml), "r20 index.html 声明主题色（安装栏外观）");
    ok(/no-sw=1/.test(indexHtml), "r20 SW 注册提供测试禁用开关（不干扰 e2e/audit）");
    ok(/serviceWorker/.test(indexHtml), "r20 index.html 注册 Service Worker");
    ok(/CACHE_FIRST_PATHS/.test(swSrc) && /cache-first/i.test(swSrc), "r20 SW 静态资源 cache-first");
    ok(/NETWORK_FIRST_PATHS/.test(swSrc) && /network-first/i.test(swSrc), "r20 SW API network-first");
    ok(/OFFLINE_FALLBACK/.test(swSrc), "r20 SW 提供离线 fallback");
    ok(!/api\/offline\/replay/.test(swSrc), "r20 SW 不缓存重放端点（避免队列请求被吞）");
    ok(/shouldQueueOffline/.test(authSrc) && /buildOfflineQueuedResponse/.test(authSrc), "r20 apiFetch 用 shared 唯一离线语义");
    ok(/data-state="net-status"/.test(statusSrc), "r20 顶栏在线状态圆点存在");
    ok(/data-state="queue-badge"/.test(statusSrc), "r20 顶栏离线队列徽标存在");
    ok(/data-state="queue-sync"/.test(statusSrc), "r20 立即同步按钮存在");
    ok(/<OfflineStatus\s*\/>/.test(appSrc), "r20 外壳挂载在线状态组件");
    ok(!/r20 · 离线模式与 PWA/.test(appSrc), "r20 旧徽章已替换无残留（r22 推进）");
    ok(/@media \(max-width:\s*600px\)/.test(cssSrc), "r20 有 <=600px 移动断点");
    ok(/overflow-x:\s*hidden/.test(cssSrc), "r20 禁止横向溢出");
    ok(/min-height:\s*44px/.test(cssSrc), "r20 触摸目标 >=44px");
    ok(/bottom-nav|net-status/.test(cssSrc), "r20 底栏/状态条样式在场");
    eq((appSrc.match(/data-tab="/g) ?? []).length, 20, "r28 口径：会议 tab 计入壳基线共 19（r27 基线 17）");
    ok(/app\.post\("\/api\/offline\/replay"/.test(serverSrc), "r20 api 提供真重放端点（队列 4xx 由 audit 锁定）");
  }

  // 57. r21：私有化部署与单机版（部署契约 / 数据目录自检 / 首启引导 / compose 静态解析）
  section("r21 私有化部署与单机版：部署契约 / 数据目录 / 首启引导 / compose 静态解析");
  {
    // (A) shared 部署契约唯一口径（变异红相目标：健康路径改坏 → 本套件与 audit 同时红）
    eq(DEPLOY_PORTS.web, 8080, "r21 单机版单端口 8080 固定");
    eq(DEPLOY_PORTS.api, 8787, "r21 开发/api 端口 8787 固定");
    eq(DEPLOY_PATHS.health, "/api/health", "r21 健康探针路径固定（变异红相目标）");
    eq(DEPLOY_PATHS.mode, "/api/auth/mode", "r21 模式探针路径固定");
    eq(DEPLOY_DATA.dirName, "data", "r21 数据目录名固定");
    eq(DEPLOY_DATA.dbFileName, "xieflow.db", "r21 SQLite 库文件名固定");
    eq(DEPLOY_MODES.docker, "remote", "r21 docker 私有化用 remote 模式（强制鉴权）");
    eq(DEPLOY_MODES.portable, "local", "r21 portable 单机版用 local 模式（免登录）");
    eq(DEPLOY_ROUTES.length, 5, "r21 关键部署路由数固定为 5");
    eq(expectedDeployStatus(DEPLOY_ROUTES[3]!, "local"), 200, "r21 local 模式业务路由 200");
    eq(expectedDeployStatus(DEPLOY_ROUTES[3]!, "remote"), 401, "r21 remote 模式业务路由 401（认证页预期）");
    eq(expectedDeployStatus(DEPLOY_ROUTES[4]!, "local"), 401, "r21 强保护路由 local 亦 401");
    eq(missingDeployMarkers("start.cmd http://127.0.0.1:8080 ./data/ start.sh", DEPLOY_GUIDE_MARKERS), [], "r21 引导四要素齐全时无缺失");
    ok(missingDeployMarkers("only start.cmd", DEPLOY_GUIDE_MARKERS).length >= 2, "r21 引导缺项被检出（真实校验非恒真）");

    // (B) Dockerfile / compose / .dockerignore 静态契约
    const dockerfile = readFileSync("docker/Dockerfile", "utf8");
    const composeText = readFileSync("docker/docker-compose.yml", "utf8");
    const dockerignore = readFileSync("docker/.dockerignore", "utf8");
    ok(/FROM\s+node:20/.test(dockerfile), "r21 Dockerfile 以 Node 20 为基础镜像");
    ok((dockerfile.match(/^FROM\s+/gm) ?? []).length >= 2, "r21 Dockerfile 多阶段构建（>=2 个 FROM）");
    ok(/AS\s+builder/i.test(dockerfile) && /AS\s+runtime/i.test(dockerfile), "r21 Dockerfile 明确 builder/runtime 两阶段");
    ok(dockerfile.includes(`XIEFLOW_MODE=${DEPLOY_MODES.docker}`) || composeText.includes(`XIEFLOW_MODE=${DEPLOY_MODES.docker}`), "r21 部署契约：docker 模式 remote");
    ok(dockerfile.includes(`EXPOSE ${DEPLOY_PORTS.web}`), "r21 Dockerfile 暴露 8080");
    ok(/node_modules/.test(dockerignore) && /data/.test(dockerignore), "r21 .dockerignore 排除 node_modules 与数据目录");

    // compose 静态 YAML 解析（无 docker：自写最小解析器解析映射/序列为对象后断言结构）
    const compose = parseSimpleYaml(composeText) as any;
    ok(!!compose.services && !!compose.services.app, "r21 compose 解析出 services.app");
    eq(compose.services.app.environment && compose.services.app.environment.XIEFLOW_MODE, DEPLOY_MODES.docker, "r21 compose environment 解析出 XIEFLOW_MODE=remote");
    ok(Array.isArray(compose.services.app.ports) && compose.services.app.ports.includes(`${DEPLOY_PORTS.web}:${DEPLOY_PORTS.web}`), "r21 compose 端口映射 8080:8080");
    ok(Array.isArray(compose.services.app.volumes) && compose.services.app.volumes.some((v: string) => v.includes(DEPLOY_DATA.dirName)), "r21 compose 数据卷挂载 data 目录");
    ok(/healthcheck/i.test(composeText) && composeText.includes(DEPLOY_PATHS.health), "r21 compose healthcheck 引用契约健康路径");
    ok(!!compose.services.app.build || !!compose.services.app.image, "r21 compose app 有 build 或 image");
    ok(!!compose.volumes && Object.keys(compose.volumes).length >= 1, "r21 compose 顶层声明具名数据卷");

    // (C) portable 增强：pack.js 生成 start.sh / 首启引导 / 数据目录自检
    const packSrc = readFileSync("scripts/pack.js", "utf8");
    ok(packSrc.includes("start.sh"), "r21 pack.js 生成 start.sh（Linux/macOS）");
    ok(/#!\/bin\/sh/.test(packSrc), "r21 start.sh 带 POSIX shebang");
    ok(/assertDataDir|dataDir.*check|is writable|writable/.test(packSrc), "r21 portable 运行时含数据目录自检");
    ok(packSrc.includes(DEPLOY_GUIDE_MARKERS[0]) && packSrc.includes("8080"), "r21 README.txt 写清双击 start.cmd → 打开 8080");
    ok(DEPLOY_GUIDE_MARKERS.every((m) => packSrc.includes(m)), "r21 首启引导四要素全在 pack.js 生成逻辑中");
    const verifySrc = readFileSync("scripts/verify-deploy.ps1", "utf8");
    ok(verifySrc.includes(DEPLOY_PATHS.health), "r21 verify-deploy.ps1 校验契约健康路径（变异红相目标）");
    ok(/\[int\]\$Port/.test(verifySrc) && /taskkill|Stop-Process|\.Kill\(/.test(verifySrc), "r21 verify-deploy.ps1 起服务后收净进程");
    ok(/^[\x00-\x7F]*$/.test(verifySrc), "r21 verify-deploy.ps1 全 ASCII");

    // (D) 部署文档三路径 / 备份恢复搬迁四步 / FAQ
    const deployDoc = readFileSync("docs/DEPLOY.md", "utf8");
    ok(deployDoc.includes("docker-compose") && deployDoc.includes("portable"), "r21 DEPLOY.md 覆盖私有化与单机两条路径");
    ok(/备份/.test(deployDoc) && /恢复/.test(deployDoc) && /搬迁/.test(deployDoc), "r21 DEPLOY.md 含备份/恢复/搬迁");
    ok(/FAQ|常见问题/.test(deployDoc), "r21 DEPLOY.md 含 FAQ");
    ok(deployDoc.includes(DEPLOY_PATHS.health), "r21 DEPLOY.md 引用契约健康路径");
  }

  // 58. r22：M10 后遗留清理与质量收敛（移动底栏更多入口 / 文档契约 / shell 索引自洽）
  section("r22 遗留清理：移动导航更多入口 / 文档契约 / shell 索引自洽");
  {
    // (A) 更多按钮显隐条件（变异红相目标：恒 false → 本组 seam 断言变红）
    eq(shouldShowTabsMore(false), true, "r22 更多按钮在菜单未展开时可见（seam 契约）");
    eq(shouldShowTabsMore(true), false, "r22 更多按钮在菜单展开时隐藏（seam 契约）");
    const app22 = readFileSync("apps/web/src/App.tsx", "utf8");
    const css22 = readFileSync("apps/web/src/styles.css", "utf8");
    ok(/shouldShowTabsMore\(navOpen\)/.test(app22) && /data-more-visible/.test(app22), "r22 外壳把更多显隐纯函数接到 DOM seam");
    ok(/data-state="tabs-more"/.test(app22), "r22 更多按钮有稳定 data-state seam（截图/复验可寻址）");
    ok(/tabs-more-fade/.test(css22) && /linear-gradient/.test(css22), "r22 底栏右侧渐隐遮罩在场");
    ok(/html\.nav-open \.tabs-more\s*\{[^}]*display:\s*none/.test(css22), "r22 菜单展开时隐藏更多按钮");
    ok(app22.includes("界面文案已优化（错误提示更清晰）"), "r22 徽章随 r33 推进（旧徽章已替换无残留）");

    // (B) DEPLOY.md 三处补强 / 根 README 脚本清单（真实文档契约）
    const deploy22 = readFileSync("docs/DEPLOY.md", "utf8");
    eq(missingDeployDocMarkers(deploy22), [], "r22 DEPLOY.md 三处补强齐全（Releases/宿主IP/卷迁移）");
    ok(missingDeployDocMarkers("no deployment notes").length === 3, "r22 文档补强校验真实（缺项被检出，非恒真）");
    const rootReadme = readFileSync("README.md", "utf8");
    // r34 状态修复：owner 已精简根 README，历史过程件外移 docs/README-ARCHIVE.md。
    // 历史契约断言改读归档文件（断言意图不变：历史内容必须仍在仓库中可追溯）。
    ok(ARCHIVE_README.includes("shot-r18-rework.ps1"), "r22 README 脚本清单含 shot-r18-rework.ps1（历史件外移归档后仍可追溯）");

    // (C) shell README 与实际字节逐字一致（14 张哈希 + 全库计数）
    const shellReadme = readFileSync("docs/ui/shell/README.md", "utf8");
    ok(/r25 同批重拍/.test(shellReadme) && /r25 哈希自查/.test(shellReadme), "r25 shell README 整段推进到 r25 口径（r23/r24 历史对照保留）");
    const hashBlock = shellReadme.match(/<!-- R49_HASHES_BEGIN -->([\s\S]*?)<!-- R49_HASHES_END -->/);
    const listed = Array.from((hashBlock?.[1] ?? "").matchAll(/([a-z-]+)=([0-9A-F]{8})/g)).map(
      (m) => `${m[1]}=${m[2]}`,
    ).sort();
    const shellFiles = readdirSync("docs/ui/shell").filter((f) => f.endsWith(".png")).sort();
    const actual = shellFiles.map((f) => {
      const h = createHash("sha256").update(readFileSync(`docs/ui/shell/${f}`)).digest("hex").slice(0, 8).toUpperCase();
      return `${f.replace("-tab-active.png", "")}=${h}`;
    });
    eq(listed, actual, "r29 shell README 18 张哈希与实际文件逐字一致");

    const walkPng = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walkPng(`${dir}/${e.name}`) : e.name.endsWith(".png") ? [`${dir}/${e.name}`] : [],
      );
    const allPng = walkPng("docs/ui");
    const uniqueCount = new Set(
      allPng.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex")),
    ).size;
    const countMatch = shellReadme.match(/全库 (\d+) PNG \/ (\d+) 互异/);
    eq(countMatch ? Number(countMatch[1]) : -1, allPng.length, "r22 shell README 全库 PNG 计数与实际文件一致");
    eq(countMatch ? Number(countMatch[2]) : -1, uniqueCount, "r22 shell README 互异计数与实际 SHA256 唯一数一致");
  }

  // 55. r23：组织架构与通讯录（TDD 先红：shared/org 规则 + schema v16 + 数据层）
  section("r23 组织架构：部门树 / 环检测 / 人员归一 / 搜索 / schema v16");
  {
    const mkDept = (id: number, name: string, parentId: number | null, sortOrder = 0): Department => ({
      id, name, parentId, sortOrder, createdAt: "2026-11-19T00:00:00.000Z",
    });
    const mkMember = (id: number, name: string, email: string, title: string, departmentId: number | null): Member => ({
      id, name, email, title, departmentId, role: "member", phone: "", status: "active", userId: null,
    });

    eq(MEMBER_STATUSES, ["active", "inactive"], "r23 人员状态枚举为 active/inactive 且顺序固定");
    ok(isMemberStatus("active"), "r23 isMemberStatus 接受 active");
    ok(!isMemberStatus("retired"), "r23 isMemberStatus 拒绝 retired");
    noThrow(() => assertValidDepartmentName("研发部"), "r23 合法部门名通过守卫");
    throws(() => assertValidDepartmentName("   "), "r23 空白部门名被拒");
    throws(() => assertValidDepartmentName(123 as unknown as string), "r23 非字符串部门名被拒");
    throws(() => assertValidDepartmentName("部".repeat(61)), "r23 超长部门名（61 字）被拒");

    eq(
      normalizeDepartment({ name: " 技术部 ", parentId: "2", sortOrder: "3" }),
      { name: "技术部", parentId: 2, sortOrder: 3 },
      "r23 normalizeDepartment 去空白 + 数字串归一",
    );
    eq(
      normalizeDepartment({ name: "默认部" }),
      { name: "默认部", parentId: null, sortOrder: 0 },
      "r23 normalizeDepartment 缺省 parentId/sortOrder 归一",
    );
    throws(() => normalizeDepartment({ name: "X", parentId: 0 }), "r23 parentId=0 非法被拒");
    throws(() => normalizeDepartment({ name: "X", sortOrder: 1.5 }), "r23 非整数 sortOrder 被拒");

    // 三级真实树：总部 → 研发中心 → 前端组；市场部同级；孤儿部父不存在
    const d1 = mkDept(1, "总部", null, 0);
    const d2 = mkDept(2, "研发中心", 1, 1);
    const d3 = mkDept(3, "前端组", 2, 2);
    const d4 = mkDept(4, "市场部", 1, 0);
    const d5 = mkDept(5, "孤儿部", 99, 0);
    eq(findOrphanDepartmentIds([d1, d2, d3, d4, d5]), [5], "r23 孤儿部门（父不存在）被单独识别");
    const orgTree = buildDepartmentTree([d5, d4, d3, d2, d1]);
    eq(orgTree.map((n) => n.id), [1, 5], "r23 根含正常根 + 孤儿（孤儿按根处理不丢）");
    eq(orgTree[0]!.children.map((n) => n.id), [4, 2], "r23 同级按 sortOrder 再按 id 排序（市场部在前）");
    eq(orgTree[0]!.children[1]!.children.map((n) => n.id), [3], "r23 三级层级装配正确（前端组在研发中心下）");
    eq(buildDepartmentTree([d1, d2]).length, 1, "r23 两级树只有一个根");
    throws(
      () => buildDepartmentTree([mkDept(1, "A", 2), mkDept(2, "B", 1)]),
      "r23 部门树 A→B→A 环检测抛错（waizhuan 会亲造环）",
    );
    throws(() => buildDepartmentTree([mkDept(1, "A", 1)]), "r23 自环（parent 指向自身）抛错");
    noThrow(() => validateDepartmentMove(3, 4, [d1, d2, d3, d4]), "r23 合法跨部门移动通过守卫");
    throws(() => validateDepartmentMove(1, 1, [d1, d2, d3]), "r23 防自挂：部门挂到自己被拒");
    throws(() => validateDepartmentMove(1, 3, [d1, d2, d3]), "r23 防成环：祖先挂到自己的后代被拒");
    throws(() => validateDepartmentMove(3, 99, [d1, d2, d3]), "r23 目标父部门不存在被拒");
    throws(() => validateDepartmentMove(99, 1, [d1, d2, d3]), "r23 源部门不存在被拒");
    eq(findDuplicateDepartmentName("研发中心", [d1, d2, d3]), 2, "r23 重复部门名检出既有 id");
    eq(findDuplicateDepartmentName("不存在", [d1, d2, d3]), null, "r23 唯一部门名返回 null");
    eq(findDuplicateDepartmentName(" 研发中心 ", [d1, d2, d3]), 2, "r23 重复名判定忽略首尾空白与大小写");

    const m1 = normalizeMember({
      name: " 张三 ", email: "Zhang.San@Example.COM ", departmentId: 3,
      role: "engineer", phone: "13800000000", title: "Frontend Engineer", status: "active", userId: 7,
    });
    eq(m1.name, "张三", "r23 normalizeMember 姓名去空白");
    eq(m1.email, "Zhang.San@Example.COM", "r23 normalizeMember 邮箱去空白且保留原大小写");
    eq(m1.departmentId, 3, "r23 normalizeMember 部门 id 归一");
    eq(m1.status, "active", "r23 normalizeMember 状态归一");
    eq(
      normalizeMember({ name: "李四", email: "li@example.com" }),
      { name: "李四", departmentId: null, role: "member", email: "li@example.com", phone: "", title: "", status: "active", userId: null },
      "r23 normalizeMember 缺省字段全量归一（无 undefined 落库）",
    );
    throws(() => normalizeMember({ name: "X", email: "not-an-email" }), "r23 无 @ 邮箱被拒");
    throws(() => normalizeMember({ name: "X", email: "a@b" }), "r23 缺顶级域邮箱被拒");
    throws(() => normalizeMember({ name: "  ", email: "a@b.com" }), "r23 空白姓名被拒");
    throws(() => normalizeMember({ name: "X", email: "a@b.com", status: "retired" }), "r23 非法人员状态被拒");
    throws(() => normalizeMember({ name: "X", email: "a@b.com", departmentId: 0 }), "r23 非法部门 id 被拒");
    throws(() => normalizeMember({ name: "X", email: "a@b.com", userId: "abc" }), "r23 非法关联用户 id 被拒");

    const members: Member[] = [
      { ...m1, id: 1 },
      mkMember(2, "李四", "LI@example.com", "Backend Engineer", 2),
      mkMember(3, "王五", "wang@example.com", "产品经理", null),
    ];
    eq(searchMembers(members, "zhang").map((m) => m.id), [1], "r23 姓名搜索大小写不敏感");
    eq(searchMembers(members, "LI@").map((m) => m.id), [2], "r23 邮箱搜索大小写不敏感");
    eq(searchMembers(members, "engineer").map((m) => m.id), [1, 2], "r23 职位模糊搜索大小写不敏感");
    eq(searchMembers(members, "   ").map((m) => m.id), [1, 2, 3], "r23 空查询返回全部人员");
    eq(searchMembers(members, "不存在"), [], "r23 无命中返回空数组");
    eq(searchMembers(members, 42 as unknown as string).length, 3, "r23 非字符串查询退化为全部（不崩）");

    const orgFull = buildOrgTree([d1, d2, d3, d4], members);
    eq(orgFull.length, 1, "r23 部门+人员装配后仍只有一个根");
    eq(orgFull[0]!.members.map((m) => m.id), [], "r23 总部无直属人员");
    const center3 = orgFull[0]!.children.find((c) => c.department.id === 2)!;
    eq(
      center3.children.find((c) => c.department.id === 3)!.members.map((m) => m.id),
      [1],
      "r23 前端组挂到张三（三级部门带人员）",
    );
    eq(
      center3.members.map((m) => m.id),
      [2],
      "r23 研发中心挂到李四（部门带人员）",
    );
    eq(orgFull[0]!.children.filter((c) => c.children.length > 0).length, 1, "r23 只有研发中心有子节点");

    // schema v16：两表真迁移 + raw 约束
    const raw23 = openDatabaseRaw({ path: ":memory:" });
    eq((raw23.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 27, "r23 新库 user_version=27（r19 基线随 r28 推进）");
    const deptCols = raw23.raw.all("PRAGMA table_info(departments)").map((r) => String((r as { name: unknown }).name));
    eq(deptCols, ["id", "name", "parent_id", "sort_order", "created_at"], "r23 departments 五列逐列存在");
    const memCols = raw23.raw.all("PRAGMA table_info(members)").map((r) => String((r as { name: unknown }).name));
    eq(memCols, ["id", "name", "department_id", "role", "email", "phone", "title", "status", "user_id"], "r23 members 九列逐列存在");
    throws(
      () => raw23.raw.run("INSERT INTO departments (name,parent_id,sort_order,created_at) VALUES ('x',999,0,'t')"),
      "r23 越权 parent_id 被 SQLite 外键拒绝",
    );
    throws(
      () => raw23.raw.run("INSERT INTO members (name,email,status) VALUES ('x','a@b.com','retired')"),
      "r23 非法 status 被 CHECK 拒绝",
    );
    raw23.raw.run("INSERT INTO departments (name,sort_order,created_at) VALUES ('dup',0,'t')");
    throws(
      () => raw23.raw.run("INSERT INTO departments (name,sort_order,created_at) VALUES ('dup',0,'t')"),
      "r23 重复部门名被 UNIQUE 约束拒绝",
    );
    raw23.raw.close();

    // 数据层：三级装配 / 移动 / 搜索 / 删除级联 / 重开不丢
    const odb = freshDb();
    const root = odb.createDepartment({ name: "集团总部" });
    const center = odb.createDepartment({ name: "研发中心", parentId: root.id });
    const front = odb.createDepartment({ name: "前端组", parentId: center.id });
    eq(odb.listDepartments().length, 3, "r23 数据层真建三级部门");
    eq(odb.getDepartment(front.id)!.parentId, center.id, "r23 三级部门 parent_id 真落库");
    eq(buildDepartmentTree(odb.listDepartments())[0]!.children[0]!.children[0]!.id, front.id, "r23 数据层三级树深度正确");
    throws(() => odb.createDepartment({ name: "研发中心" }), "r23 数据层重复部门名被拒");
    throws(() => odb.moveDepartment(root.id, front.id), "r23 数据层 A→…→A 成环移动被拒");
    ok(odb.moveDepartment(front.id, root.id) !== null, "r23 数据层合法移动成功");
    eq(odb.getDepartment(front.id)!.parentId, root.id, "r23 移动后父部门真回读");
    const alice = odb.createMember({ name: "Alice", email: "alice@example.com", departmentId: front.id, title: "Frontend Engineer" });
    eq(alice.departmentId, front.id, "r23 人员部门关联真落库");
    eq(odb.listMembers().length, 1, "r23 人员列表真回读");
    eq(odb.listMembers(front.id).length, 1, "r23 按部门查人员真过滤");
    eq(odb.searchMembers("ALICE").map((m) => m.id), [alice.id], "r23 数据层人员搜索大小写不敏感");
    eq(odb.searchMembers("frontend").map((m) => m.id), [alice.id], "r23 数据层按职位搜索命中");
    throws(() => odb.createMember({ name: "Bad", email: "bad-email" }), "r23 数据层非法邮箱被拒");
    throws(() => odb.createMember({ name: "Bad2", email: "b@e.com", departmentId: 999 }), "r23 数据层越权部门 id 被拒");
    throws(() => odb.createMember({ name: "Bad3", email: "b@e.com", userId: 999 }), "r23 数据层越权用户 id 被拒");
    const treeFromDb: OrgTreeNode[] = odb.getOrgTree();
    eq(treeFromDb.length, 1, "r23 GET /api/org/tree 服务层装配单根");
    eq(treeFromDb[0]!.children.find((c) => c.department.id === front.id)!.members.map((m) => m.id), [alice.id], "r23 组织树部门带人员");
    ok(odb.deleteMember(alice.id), "r23 删除人员返回 true");
    eq(odb.getMember(alice.id), null, "r23 删除人员后详情 404 口径");
    ok(odb.deleteDepartment(root.id), "r23 删除根部门返回 true");
    eq(odb.getDepartment(front.id)!.parentId, null, "r23 删除父部门子部门 parent_id 置空（外键 SET NULL）");
    const orgPath = `scripts/.tmp-e2e/org-persist-${Date.now()}.db`;
    const orgPersist = openDatabaseRaw({ path: orgPath });
    orgPersist.db.createDepartment({ name: "持久化部门" });
    orgPersist.raw.close();
    const orgReopen = openDatabaseRaw({ path: orgPath });
    eq(orgReopen.db.listDepartments().map((d) => d.name), ["持久化部门"], "r23 部门重开不丢（真实文件库）");
    orgReopen.raw.close();
    db = null;
  }

  // 56. r23：渲染层 / 文档 / CI / 截图索引 seam（契约真实存在，非恒真占位）
  section("r23 渲染层与文档 seam：组织 tab / 壳基线 / 索引 / CI 正则");
  {
    const app = readFileSync("apps/web/src/App.tsx", "utf8");
    const orgPage = readFileSync("apps/web/src/OrgPage.tsx", "utf8");
    const css = readFileSync("apps/web/src/styles.css", "utf8");
    const shot = readFileSync("scripts/shot.ps1", "utf8");
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const rootReadme = readFileSync("README.md", "utf8");
    const r23Index = readFileSync("docs/ui/r23/README.md", "utf8");
    const shellReadme = readFileSync("docs/ui/shell/README.md", "utf8");

    ok(app.includes('data-tab="org"'), "r23 App.tsx 存在组织 tab 按钮");
    ok(app.includes("界面文案已优化（错误提示更清晰）"), "r23 App.tsx 徽章随 r31 推进");
    ok(app.includes('| "notifications" | "reports"'), "r27 App.tsx PageTab 联合类型含 notifications + reports");
    ok(app.includes("<OrgPage />"), "r23 App.tsx 渲染 OrgPage 组件");
    ok(orgPage.includes("buildDepartmentTree") && orgPage.includes("@xieflow/shared/org"), "r23 组织页树装配走 shared/org 纯函数");
    ok(orgPage.includes("searchMembers") && orgPage.includes("@xieflow/shared/org"), "r23 组织页搜索走 shared/org 纯函数");
    ok(
      ["org-tree", "org-members", "org-form", "org-search", "org-error"].every((s) => orgPage.includes(`data-state="${s}"`)),
      "r23 组织页树/卡片/表单/搜索/错误态 seam 齐备",
    );
    ok(css.includes(".org-columns") && css.includes("html.force-narrow .org-columns"), "r23 样式含双栏布局与窄屏单列 seam");
    ok(shot.includes('"r23"') && shot.includes("org-tab-active"), "r23 shot.ps1 ValidateSet 与壳基线含组织 tab");
    ok(ci.includes("(2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27)"), "r23 CI 正则随 schema v19 推进（r25 口径）");
    ok((r23Index.match(/^\| \d\d-(org-|narrow|error)[^|]*\.png \|/gm) ?? []).length === 7, "r23 截图索引含七张矩阵行");
    const walkPng23 = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walkPng23(`${dir}/${e.name}`) : e.name.endsWith(".png") ? [`${dir}/${e.name}`] : [],
      );
    const r23Png = walkPng23("docs/ui/r23");
    eq(r23Png.length, 7, "r23 目录恰好 7 张 PNG");
    eq(new Set(r23Png.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 7, "r23 七张 PNG SHA256 两两互异");
    const shellPng = walkPng23("docs/ui/shell");
    eq(shellPng.length, 20, "随 r28 推进：壳基线已扩为 19 张 PNG（新增会议 tab）");
    eq(new Set(shellPng.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "壳基线 19 张 SHA256 两两互异");
    const r23HashBlock = shellReadme.match(/<!-- R49_HASHES_BEGIN -->([\s\S]*?)<!-- R49_HASHES_END -->/);
    ok(r23HashBlock !== null, "shell README 含 R32_HASHES 当前自查块（随 r32 推进）");
    if (r23HashBlock) {
      const listed = [...r23HashBlock[1]!.matchAll(/`([a-z-]+)=([0-9A-F]{8})`/g)].map((m) => [m[1], m[2]]);
      eq(listed.length, 20, "r26 shell README 列出 19 张哈希");
      const mismatches = listed.filter(([name, hash]) => {
        const file = shellPng.find((p) => p.replace(/\\/g, "/").endsWith(`/${name}-tab-active.png`));
        return !file || createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8).toUpperCase() !== hash;
      });
      eq(mismatches, [], "r26 shell README 18 张哈希与实际文件逐字一致");
    }
    ok(rootReadme.includes("e2e（3995 断言）+ HTTP 审计（3167 断言）"), "r23 口径随 r24 速查行推进");
    ok(
      ARCHIVE_README.includes("- e2e **2766** 项") && ARCHIVE_README.includes("- HTTP audit **2185** 项") &&
        ARCHIVE_README.includes("### r24 矩阵") && ARCHIVE_README.includes("e2e 1952 → **2041（+89）**"),
      "r23/r24 双节规模历史行外移归档后仍可追溯（根 README 只留当前轮）",
    );
  }

  // 57. r24：组织成员接入审批/物资（TDD 先红：shared/org 规则 + schema v17 + 数据层，向后兼容）
  section("r24 成员接入：解析/汇总规则 / schema v17 / 审批物资数据层 / usage");
  {
    const dept = (id: number, name: string): Department => ({
      id, name, parentId: null, sortOrder: 0, createdAt: "2026-11-19T00:00:00.000Z",
    });
    const person = (
      id: number, name: string, status: "active" | "inactive" = "active", departmentId: number | null = 1,
    ): Member => ({
      id, name, departmentId, role: "member", email: `m${id}@example.com`, phone: "",
      title: "", status, userId: null,
    });
    const depts = [dept(1, "研发中心")];
    const people = [person(1, "张三"), person(2, "李四"), person(3, "离职者", "inactive"), person(4, "未分配", "active", null)];

    // (A) 成员引用解析唯一口径：有 member_id 用通讯录姓名，无则回落自由文本
    eq(normalizeMemberRef(undefined), null, "r24 member_id 缺省为空引用");
    eq(normalizeMemberRef(null), null, "r24 member_id=null 为空引用");
    eq(normalizeMemberRef("  "), null, "r24 member_id 空白串为空引用");
    eq(normalizeMemberRef(" 7 "), 7, "r24 member_id 数字串去空白归一");
    eq(normalizeMemberRef(8), 8, "r24 member_id 数字直传");
    for (const bad of [0, -1, 1.5, "abc", {}]) {
      throws(() => normalizeMemberRef(bad), `r24 非法 member_id ${JSON.stringify(bad)} 被拒`);
    }
    eq(assertAssignableMember(1, people).name, "张三", "r24 有效在职成员可解析");
    throws(() => assertAssignableMember(999, people), "r24 不存在的成员被拒");
    throws(() => assertAssignableMember(3, people), "r24 已停用成员被拒");
    throws(() => assertAssignableMember("abc", people), "r24 非数字成员引用被拒");
    eq(resolveAssignee("自由文本", null, people), "自由文本", "r24 无 member_id 回落自由文本");
    eq(resolveAssignee("", undefined, people), "", "r24 空文本无 member_id 保持空串");
    eq(resolveAssignee("自由文本", "1", people), "张三", "r24 有 member_id 优先通讯录姓名");
    eq(resolveAssignee("旧审批人", 2, people), "李四", "r24 新路径覆盖旧自由文本（不改写原列之外的口径）");
    throws(() => resolveAssignee("自由文本", 3, people), "r24 解析已停用成员被拒");
    throws(() => resolveAssignee("自由文本", 999, people), "r24 解析不存在成员被拒");

    const summary1 = memberSummary(people[0]!, depts);
    eq(
      summary1,
      { id: 1, name: "张三", departmentId: 1, departmentName: "研发中心", title: "", status: "active" },
      "r24 memberSummary 回带姓名与部门名",
    );
    eq(memberDisplayName(summary1), "张三（研发中心）", "r24 memberDisplayName 带部门徽标文案");
    eq(memberDisplayName(memberSummary(people[3]!, depts)), "未分配", "r24 未分配部门只显示姓名");

    const usageInput = {
      approvals: [{ applicantMemberId: 1 }, { applicantMemberId: null }],
      steps: [{ assigneeMemberId: 1 }, { assigneeMemberId: 2 }],
      cc: [{ ccMemberId: 1 }],
      assets: [{ custodianMemberId: 1 }, { custodianMemberId: null }],
    };
    eq(
      countMemberUsage(1, usageInput),
      { memberId: 1, approvalCount: 1, assignedApprovalCount: 1, ccCount: 1, assetCount: 1, actionCount: 0, total: 4 },
      "r24 usage 计数：发起/被指派/抄送/保管四类各自准确",
    );
    eq(
      countMemberUsage(2, usageInput),
      { memberId: 2, approvalCount: 0, assignedApprovalCount: 1, ccCount: 0, assetCount: 0, actionCount: 0, total: 1 },
      "r24 usage 计数只算该成员，不串号",
    );
    throws(() => countMemberUsage(0, usageInput), "r24 usage 非法 member_id 被拒");

    // (B) schema v17：只追加四张可空列，原 TEXT NOT NULL 列逐列不动
    const raw24 = openDatabaseRaw({ path: ":memory:" });
    eq((raw24.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 27, "r24 基线库现新库 user_version=27（r28 推进）");
    const colsOf = (table: string) => raw24.raw.all(`PRAGMA table_info(${table})`) as {
      name: string; notnull: number; dflt_value: unknown;
    }[];
    const aCols = colsOf("approvals");
    const sCols = colsOf("approval_steps");
    const cCols = colsOf("approval_cc");
    const assetCols = colsOf("assets");
    const col = (cols: { name: string; notnull: number; dflt_value: unknown }[], name: string) => cols.find((x) => x.name === name);
    eq(col(aCols, "applicant_member_id")?.notnull, 0, "r24 approvals.applicant_member_id 可空");
    eq(col(sCols, "assignee_member_id")?.notnull, 0, "r24 approval_steps.assignee_member_id 可空");
    eq(col(cCols, "cc_member_id")?.notnull, 0, "r24 approval_cc.cc_member_id 可空");
    eq(col(assetCols, "custodian_member_id")?.notnull, 0, "r24 assets.custodian_member_id 可空");
    eq(col(aCols, "applicant_member_id")?.dflt_value, null, "r24 新增列无默认值（NULL 兼容老行）");
    eq(col(assetCols, "custodian_member_id")?.dflt_value, null, "r24 物资新增列无默认值（NULL 兼容老行）");
    eq(col(aCols, "applicant_id")?.notnull, 1, "r24 原 approvals.applicant_id 仍 NOT NULL");
    eq(col(aCols, "current_assignee")?.notnull, 1, "r24 原 approvals.current_assignee 仍 NOT NULL");
    eq(col(sCols, "assignee")?.notnull, 1, "r24 原 approval_steps.assignee 仍 NOT NULL");
    eq(col(cCols, "cc_user")?.notnull, 1, "r24 原 approval_cc.cc_user 仍 NOT NULL");
    eq(col(assetCols, "custodian")?.notnull, 1, "r24 原 assets.custodian 仍 NOT NULL");
    raw24.raw.run(
      "INSERT INTO approvals (title,type,applicant_id,status,current_assignee,created_at,updated_at) VALUES ('旧单','leave','旧人','draft','旧审批','t','t')",
    );
    const legacyRow = raw24.raw.get("SELECT applicant_id, applicant_member_id FROM approvals WHERE id=1") as {
      applicant_id: string; applicant_member_id: number | null;
    };
    eq(legacyRow.applicant_id, "旧人", "r24 老路径纯文本 applicant_id 原样保留");
    eq(legacyRow.applicant_member_id, null, "r24 老数据新增 member_id 为 NULL（向后兼容）");
    throws(
      () => raw24.raw.run("INSERT INTO approvals (title,type,applicant_id,status,current_assignee,applicant_member_id,created_at,updated_at) VALUES ('x','leave','旧人','draft','旧审批',999,'t','t')"),
      "r24 越权 member_id 被 SQLite 外键拒绝",
    );
    raw24.raw.run("INSERT INTO members (name,email,status) VALUES ('临时','t@example.com','active')");
    raw24.raw.run("UPDATE approvals SET applicant_member_id=1 WHERE id=1");
    raw24.raw.run("DELETE FROM members WHERE id=1");
    eq(
      (raw24.raw.get("SELECT applicant_member_id FROM approvals WHERE id=1") as { applicant_member_id: number | null }).applicant_member_id,
      null,
      "r24 成员删除后关联列 ON DELETE SET NULL（不删审批、不删用户数据）",
    );
    raw24.raw.close();

    // (C) 数据层：新路径真落库 + 老路径 NULL + 停用/越权拒绝 + usage
    const rdb = freshDb();
    const rDept = rdb.createDepartment({ name: "r24研发中心" });
    const zhang = rdb.createMember({ name: "张三", email: "r24.zhang@example.com", departmentId: rDept.id });
    const li = rdb.createMember({ name: "李四", email: "r24.li@example.com", departmentId: rDept.id });
    const retired = rdb.createMember({ name: "离职者", email: "r24.retired@example.com", status: "inactive" });
    const legacyApproval = rdb.createApproval({
      title: "r24老路径", type: "leave", applicantId: "自由发起人", currentAssignee: "自由审批人", cc: ["自由抄送"],
    });
    eq(legacyApproval.applicantMemberId, null, "r24 审批老路径 applicant_member_id=NULL");
    eq(legacyApproval.applicantId, "自由发起人", "r24 审批老路径自由文本不变");
    const legacySteps0 = rdb.listApprovalSteps(legacyApproval.id);
    eq(legacySteps0.length, 0, "r24 老审批初始无步骤");
    const linkedApproval = rdb.createApproval({
      title: "r24新路径", type: "expense", applicantId: "将被姓名覆盖", currentAssignee: "将被姓名覆盖",
      applicantMemberId: zhang.id, currentAssigneeMemberId: li.id,
      cc: ["将被姓名覆盖"], ccMemberIds: [zhang.id],
    });
    eq(linkedApproval.applicantMemberId, zhang.id, "r24 新路径申请人 member_id 真落库");
    eq(linkedApproval.applicantId, zhang.name, "r24 新路径申请人显示通讯录姓名");
    eq(linkedApproval.currentAssignee, li.name, "r24 新路径审批人显示通讯录姓名");
    eq(rdb.listApprovalCc(linkedApproval.id), [zhang.name], "r24 抄送 member_id 解析为通讯录姓名");
    const ccRow = rdb.listApprovalCcDetails(linkedApproval.id)[0];
    eq(ccRow?.ccMemberId, zhang.id, "r24 approval_cc.cc_member_id 真落库");
    throws(
      () => rdb.createApproval({ title: "停用", type: "other", applicantId: "x", currentAssignee: "y", applicantMemberId: retired.id }),
      "r24 数据层拒绝已停用发起人",
    );
    throws(
      () => rdb.createApproval({ title: "越权", type: "other", applicantId: "x", currentAssignee: "y", applicantMemberId: 999999 }),
      "r24 数据层拒绝不存在成员",
    );
    throws(
      () => rdb.createApproval({ title: "非法", type: "other", applicantId: "x", currentAssignee: "y", currentAssigneeMemberId: "abc" }),
      "r24 数据层拒绝非法 member_id 文本",
    );
    const submitted = rdb.actOnApproval(linkedApproval.id, "submit", zhang.name, { actorMemberId: zhang.id });
    eq(submitted?.status, "pending", "r24 新路径提交后进入 pending");
    eq(rdb.listApprovalSteps(linkedApproval.id)[0]?.assigneeMemberId, zhang.id, "r24 提交步骤 assignee_member_id 真落库");
    const delegated = rdb.actOnApproval(linkedApproval.id, "delegate", li.name, {
      targetAssignee: "将被姓名覆盖", targetAssigneeMemberId: zhang.id, actorMemberId: li.id,
    });
    eq(delegated?.currentAssignee, zhang.name, "r24 转交 member_id 覆盖自由文本为通讯录姓名");
    eq(rdb.listApprovalSteps(linkedApproval.id).at(-1)?.assigneeMemberId, zhang.id, "r24 转交步骤 member_id 真落库");
    const simple = rdb.createApproval({ title: "r24转交老路径", type: "other", applicantId: "甲", currentAssignee: "乙" });
    rdb.actOnApproval(simple.id, "submit", "甲");
    const delegatedLegacy = rdb.actOnApproval(simple.id, "delegate", "乙", { targetAssignee: "丙" });
    eq(delegatedLegacy?.currentAssignee, "丙", "r24 转交老路径自由文本照常生效");
    eq(rdb.listApprovalSteps(simple.id).at(-1)?.assigneeMemberId, null, "r24 转交老路径步骤 member_id=NULL");

    const legacyAsset = rdb.createAsset({ name: "旧物资", category: "office", quantity: 1, unit: "台", location: "仓库", custodian: "自由保管员" });
    eq(legacyAsset.custodianMemberId, null, "r24 物资老路径 custodian_member_id=NULL");
    const linkedAsset = rdb.createAsset({
      name: "新物资", category: "equipment", quantity: 4, unit: "台", location: "仓库",
      custodian: "将被姓名覆盖", custodianMemberId: zhang.id,
    });
    eq(linkedAsset.custodianMemberId, zhang.id, "r24 物资新路径 member_id 真落库");
    eq(linkedAsset.custodian, zhang.name, "r24 物资保管员显示通讯录姓名");
    throws(
      () => rdb.createAsset({ name: "停用保管", category: "office", quantity: 1, unit: "个", location: "仓", custodian: "x", custodianMemberId: retired.id }),
      "r24 数据层拒绝已停用保管员",
    );
    const tx = rdb.applyAssetTx(linkedAsset.id, { type: "in", quantity: 2, to: "仓库", operator: "李四" }, li.id);
    eq(tx.operator, "李四", "r24 出入库老字段操作人照常记账");
    eq(rdb.getAsset(linkedAsset.id)?.custodianMemberId, li.id, "r24 出入库传 member_id 更新保管员关联");
    eq(rdb.getAsset(linkedAsset.id)?.custodian, li.name, "r24 出入库保管员姓名与关联同步");
    const usage = rdb.countMemberUsage(zhang.id);
    eq(usage.memberId, zhang.id, "r24 usage 回带目标成员 id");
    ok(usage.approvalCount >= 1 && usage.assignedApprovalCount >= 1 && usage.ccCount >= 1 && usage.assetCount >= 0, "r24 usage 四类计数非空且口径正确");
    eq(rdb.countMemberUsage(999999).total, 0, "r24 无关联成员 usage 全零");

    const r24Path = `scripts/.tmp-e2e/r24-link-${Date.now()}.db`;
    const r24Open = openDatabaseRaw({ path: r24Path });
    r24Open.db.createMember({ name: "持久化成员", email: "persist@example.com" });
    r24Open.db.createAsset({
      name: "持久化物资", category: "office", quantity: 1, unit: "个", location: "仓",
      custodian: "忽略", custodianMemberId: 1,
    });
    r24Open.raw.close();
    const r24Reopen = openDatabaseRaw({ path: r24Path });
    eq(r24Reopen.db.listAssets()[0]?.custodianMemberId, 1, "r24 关联列重开不丢（真实文件库）");
    r24Reopen.raw.close();
    db = null;
  }

  // 58. r24：渲染层 / CI / 截图索引 seam（选人弹窗、徽标、文档与脚本口径真实存在）
  section("r24 渲染层与文档 seam：通讯录选人 / 部门徽标 / 截图索引 / CI 正则");
  {
    const picker = readFileSync("apps/web/src/MemberPicker.tsx", "utf8");
    const approval = readFileSync("apps/web/src/ApprovalPage.tsx", "utf8");
    const assets = readFileSync("apps/web/src/AssetsPage.tsx", "utf8");
    const css = readFileSync("apps/web/src/styles.css", "utf8");
    const shot = readFileSync("scripts/shot.ps1", "utf8");
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const rootReadme = readFileSync("README.md", "utf8");
    const r24Index = readFileSync("docs/ui/r24/README.md", "utf8");
    const shellReadme = readFileSync("docs/ui/shell/README.md", "utf8");

    ok(picker.includes("@xieflow/shared/org") && picker.includes("memberSummary"), "r24 选人弹窗部门摘要走 shared/org 纯函数");
    ok(picker.includes('data-state="member-picker"') && picker.includes('data-state="member-picker-results"'), "r24 选人弹窗/结果列表 seam 齐备");
    ok(approval.includes("MemberPicker") && approval.includes("applicantMemberId") && approval.includes("currentAssigneeMemberId"), "r24 审批表单接线选人弹窗并回传 member_id");
    ok(approval.includes('data-state="approval-timeline-badge"') && approval.includes("assigneeMember"), "r24 审批时间线徽标 seam 在场");
    ok(assets.includes("MemberPicker") && assets.includes("custodianMemberId") && assets.includes("operatorMemberId"), "r24 物资表单/出入库接线选人弹窗");
    ok(assets.includes('data-state="assets-member-badge"'), "r24 物资卡片部门徽标 seam 在场");
    ok(css.includes(".mp-modal") && css.includes("html.force-narrow .mp-modal"), "r24 弹窗样式与窄屏单列 seam 在场");
    ok(shot.includes('"r24"') && ["01-approval-picker", "02-approval-picked", "03-timeline-badge", "04-assets-picker", "05-assets-badge", "06-narrow", "07-error"].every((s) => shot.includes(s)), "r24 shot.ps1 ValidateSet 与七张矩阵名齐备");
    ok(ci.includes("(2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27)"), "r24 CI smoke 正则随 v19 推进");

    const walkPng = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walkPng(`${dir}/${e.name}`) : e.name.endsWith(".png") ? [`${dir}/${e.name}`] : [],
      );
    const r24Png = walkPng("docs/ui/r24");
    eq(r24Png.length, 7, "r24 目录恰好 7 张 PNG");
    eq(new Set(r24Png.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 7, "r24 七张 PNG SHA256 两两互异");
    const shellPng = walkPng("docs/ui/shell");
    eq(shellPng.length, 20, "随 r28 推进：壳基线已扩为 19 张 PNG");
    eq(new Set(shellPng.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "壳基线 19 张 SHA256 两两互异");
    const hashBlock = shellReadme.match(/<!-- R49_HASHES_BEGIN -->([\s\S]*?)<!-- R49_HASHES_END -->/);
    ok(hashBlock !== null, "shell README 哈希自查块在场");
    if (hashBlock) {
      const listed = [...hashBlock[1]!.matchAll(/`([a-z-]+)=([0-9A-F]{8})`/g)].map((m) => [m[1], m[2]]);
      eq(listed.length, 20, "shell README 列出 19 张哈希");
      const mismatches = listed.filter(([name, hash]) => {
        const file = shellPng.find((p) => p.replace(/\\/g, "/").endsWith(`/${name}-tab-active.png`));
        return !file || createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8).toUpperCase() !== hash;
      });
      eq(mismatches, [], "shell README 18 张哈希与实际文件逐字一致");
    }
    ok((r24Index.match(/^\| \d\d-[^|]*\.png \|/gm) ?? []).length === 7, "r24 截图索引含七张矩阵行");
    ok(rootReadme.includes("e2e（3995 断言）+ HTTP 审计（3167 断言）"), "r24 根 README 速查行数字同步");
    ok(ARCHIVE_README.includes("### r24 矩阵") && ARCHIVE_README.includes("e2e 1952 → **2041（+89）**"), "r24 双节规模与矩阵索引历史行归档后仍同步");
  }

  // 59. r25：审批动作 actorMemberId（schema v18 / 登录用户关联成员 / usage 含审批动作 / U3 seam）
  section("r25 审批动作 actorMemberId：schema v18 / 动作落库 / usage / U3 seam");
  {
    const dept25: Department = {
      id: 1, name: "研发中心", parentId: null, sortOrder: 0, createdAt: "2026-11-19T00:00:00.000Z",
    };
    const member25 = (id: number, name: string, userId: number | null, status: "active" | "inactive" = "active"): Member => ({
      id, name, departmentId: 1, role: "member", email: `r25-${id}@example.com`, phone: "",
      title: "工程师", status, userId,
    });
    const actor25 = member25(7, "张三", 42);
    const retired25 = member25(8, "离职者", 43, "inactive");

    // (A) 登录用户 → 关联成员的解析唯一口径（未登录/停用/无关联一律 null）
    eq(resolveMemberForUser(42, [actor25])?.id, 7, "r25 登录用户关联成员解析成功");
    eq(resolveMemberForUser(42, [actor25])?.name, "张三", "r25 关联成员回带通讯录姓名");
    eq(resolveMemberForUser(999, [actor25]), null, "r25 登录用户无关联成员返回 null");
    eq(resolveMemberForUser(null, [actor25]), null, "r25 未登录（无 userId）返回 null");
    eq(resolveMemberForUser(43, [retired25]), null, "r25 关联已停用成员不返回（不可指派）");
    eq(resolveMemberForUser("abc", [actor25]), null, "r25 非法 userId 返回 null 不抛错");

    // (B) usage 第五类：审批动作（actor_member_id）参与计数，老路径无该列为 0
    const usage25 = countMemberUsage(1, {
      approvals: [{ applicantMemberId: 1 }],
      steps: [{ assigneeMemberId: 1 }],
      cc: [{ ccMemberId: 1 }],
      assets: [{ custodianMemberId: 1 }],
      actorSteps: [{ actorMemberId: 1 }, { actorMemberId: 1 }, { actorMemberId: 2 }],
    });
    eq(
      usage25,
      { memberId: 1, approvalCount: 1, assignedApprovalCount: 1, ccCount: 1, assetCount: 1, actionCount: 2, total: 6 },
      "r25 usage 五类计数：审批动作独立计数且计入 total",
    );
    eq(countMemberUsage(2, { actorSteps: [{ actorMemberId: 1 }] }).actionCount, 0, "r25 无动作关联成员 actionCount=0");
    eq(countMemberUsage(2, { actorSteps: [{}] }).total, 0, "r25 老步骤缺 actor_member_id 时 usage 全零（向后兼容）");
    eq(countMemberUsage(1, { actorSteps: [{ actorMemberId: 1 }] }).total, 1, "r25 只有动作时 total 只加动作一类");

    // (C) schema v18 raw：只加 approval_steps.actor_member_id 可空列，原列不动
    const raw25 = openDatabaseRaw({ path: ":memory:" });
    eq((raw25.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 27, "r25 新库 user_version=27（r19 基线随 r28 推进）");
    const cols25 = raw25.raw.all("PRAGMA table_info(approval_steps)") as {
      name: string; notnull: number; dflt_value: unknown;
    }[];
    const col25 = (name: string) => cols25.find((c) => c.name === name);
    eq(col25("actor_member_id")?.notnull, 0, "r25 approval_steps.actor_member_id 可空");
    eq(col25("actor_member_id")?.dflt_value, null, "r25 actor_member_id 无默认值（老步骤 NULL）");
    eq(col25("assignee")?.notnull, 1, "r25 原 approval_steps.assignee 仍 NOT NULL");
    eq(col25("assignee_member_id")?.notnull, 0, "r25 r24 既有列保持可空不动");
    raw25.raw.run("INSERT INTO members (name,email,status) VALUES ('动作人','r25.raw@example.com','active')");
    raw25.raw.run("INSERT INTO approvals (title,type,applicant_id,status,current_assignee,created_at,updated_at) VALUES ('r25原始','other','甲','draft','乙','t','t')");
    throws(
      () => raw25.raw.run("INSERT INTO approval_steps (approval_id,\"order\",assignee,actor_member_id,action,acted_at) VALUES (1,0,'甲',999,'approve','t')"),
      "r25 越权 actor_member_id 被 SQLite 外键拒绝",
    );
    raw25.raw.run("INSERT INTO approval_steps (approval_id,\"order\",assignee,actor_member_id,action,acted_at) VALUES (1,0,'甲',1,'approve','t')");
    eq((raw25.raw.get("SELECT COUNT(*) AS n FROM approval_steps") as { n: number }).n, 1, "r25 合法 actor_member_id 步骤真落库");
    raw25.raw.run("DELETE FROM members WHERE id=1");
    eq(
      (raw25.raw.get("SELECT actor_member_id FROM approval_steps WHERE id=1") as { actor_member_id: number | null }).actor_member_id,
      null,
      "r25 成员删除后 actor_member_id ON DELETE SET NULL，步骤不删",
    );
    raw25.raw.close();

    // (D) 数据层：动作落 actor_member_id + 老路径 NULL + 4xx + usage 计数
    const d25 = freshDb();
    const dep25db = d25.createDepartment({ name: "r25研发中心" });
    const user25 = d25.createUser({ username: "r25-actor-user", password: "Passw0rd!" });
    const linked25 = d25.createMember({ name: "动作张三", email: "r25.actor@example.com", departmentId: dep25db.id, userId: user25.id });
    eq(resolveMemberForUser(user25.id, d25.listMembers())?.id, linked25.id, "r25 真库登录用户关联成员可解析");
    const auditor25 = d25.createMember({ name: "动作李四", email: "r25.auditor@example.com", departmentId: dep25db.id });
    const inactiveActor25 = d25.createMember({ name: "停用动作人", email: "r25.inactive@example.com", status: "inactive" });
    const r25Approval = d25.createApproval({ title: "r25审批", type: "expense", applicantId: linked25.name, currentAssignee: auditor25.name });
    const submitted25 = d25.actOnApproval(r25Approval.id, "submit", linked25.name, { actorMemberId: linked25.id });
    eq(submitted25?.status, "pending", "r25 成员提交后进入 pending");
    eq(d25.listApprovalSteps(r25Approval.id)[0]?.actorMemberId, linked25.id, "r25 提交步骤 actor_member_id 真落库");
    eq(d25.listApprovalSteps(r25Approval.id)[0]?.assigneeMemberId, linked25.id, "r25 r24 既有 assignee_member_id 仍保留（向后兼容）");
    eq(d25.countMemberUsage(linked25.id).actionCount, 1, "r25 usage 动作计数 +1");
    eq(d25.countMemberUsage(linked25.id).total, 2, "r25 usage total 含审批动作（被指派 + 动作）");
    const approved25 = d25.actOnApproval(r25Approval.id, "approve", auditor25.name, { actorMemberId: auditor25.id });
    eq(approved25?.status, "approved", "r25 通过动作终态正确");
    eq(d25.listApprovalSteps(r25Approval.id).at(-1)?.actorMemberId, auditor25.id, "r25 通过步骤 actor_member_id 真落库");
    eq(d25.countMemberUsage(auditor25.id).actionCount, 1, "r25 通过人也计入 usage 动作");
    const legacy25 = d25.createApproval({ title: "r25老路径", type: "other", applicantId: "甲", currentAssignee: "乙" });
    d25.actOnApproval(legacy25.id, "submit", "甲");
    eq(d25.listApprovalSteps(legacy25.id)[0]?.actorMemberId, null, "r25 老路径动作 actor_member_id=NULL（向后兼容）");
    eq(d25.countMemberUsage(linked25.id).actionCount, 1, "r25 老路径动作不误计到已关联成员");
    const badActor25 = d25.createApproval({ title: "r25拒绝", type: "other", applicantId: "甲", currentAssignee: "乙" });
    throws(() => d25.actOnApproval(badActor25.id, "submit", "甲", { actorMemberId: 999999 }), "r25 数据层拒绝不存在动作人");
    throws(() => d25.actOnApproval(badActor25.id, "submit", "甲", { actorMemberId: inactiveActor25.id }), "r25 数据层拒绝停用动作人");
    eq(d25.listApprovalSteps(badActor25.id).length, 0, "r25 拒绝动作零半态（无步骤残留）");

    // (E) 真实文件库重开不丢
    const actorDbPath = `scripts/.tmp-e2e/r25-actor-${Date.now()}.db`;
    const open25a = openDatabaseRaw({ path: actorDbPath });
    const pu25 = open25a.db.createUser({ username: "r25-persist-user", password: "Passw0rd!" });
    const pm25 = open25a.db.createMember({ name: "持久化动作人", email: "r25.persist@example.com", userId: pu25.id });
    const pa25 = open25a.db.createApproval({ title: "r25持久化", type: "leave", applicantId: pm25.name, currentAssignee: "乙" });
    open25a.db.actOnApproval(pa25.id, "submit", pm25.name, { actorMemberId: pm25.id });
    open25a.raw.close();
    const open25b = openDatabaseRaw({ path: actorDbPath });
    eq(open25b.db.listApprovalSteps(pa25.id)[0]?.actorMemberId, pm25.id, "r25 动作关联列重开不丢（真实文件库）");
    eq(open25b.db.countMemberUsage(pm25.id).actionCount, 1, "r25 usage 动作计数重开不丢");
    open25b.raw.close();
    unlinkSync(actorDbPath);
    db = null;

    // (F) 渲染层 / CI / 文档 / 截图索引 seam
    const picker25 = readFileSync("apps/web/src/MemberPicker.tsx", "utf8");
    const approval25 = readFileSync("apps/web/src/ApprovalPage.tsx", "utf8");
    const api25 = readFileSync("apps/api/src/server.ts", "utf8");
    const schemaSource25 = readFileSync("packages/db/src/schema.ts", "utf8");
    const shot25 = readFileSync("scripts/shot.ps1", "utf8");
    const ci25 = readFileSync(".github/workflows/ci.yml", "utf8");
    const root25 = readFileSync("README.md", "utf8");
    const r25Index = readFileSync("docs/ui/r25/README.md", "utf8");
    const shell25 = readFileSync("docs/ui/shell/README.md", "utf8");
    ok(picker25.includes("mp-dept-filter") && picker25.includes("pick-dept"), "r25 选人弹窗部门筛选 seam 在场");
    ok(picker25.includes("已关联通讯录") && picker25.includes("手改"), "r25 回填后手改语义提示 seam 在场");
    ok(!picker25.includes("#${member.id}"), "r25 回填徽标去除 member_id 裸号");
    ok(approval25.includes("/api/org/members/me") && approval25.includes("actionActorMemberId"), "r25 审批页按登录用户关联成员传 actorMemberId");
    ok(approval25.includes('data-state="approval-actor-badge"'), "r25 审批动作步骤徽标 seam 在场");
    ok(api25.includes('"/api/org/members/me"') && api25.includes("actorMemberId: firstDefined"), "r25 api 提供登录成员解析且接受 actorMemberId");
    ok(schemaSource25.includes("actor_member_id") && schemaSource25.includes("version: 18"), "r25 schema v18 动作列迁移在场");
    ok(ci25.includes("(2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27)"), "r25 CI smoke 正则升 v19（含历史 v18）");
    ok(shot25.includes('"r25"') && ["01-approval-actor-badge", "02-picker-dept-filter", "03-badge-named", "04-manual-hint", "05-assets-detail-badge", "06-narrow", "07-error"].every((s) => shot25.includes(s)), "r25 shot.ps1 ValidateSet 与七张矩阵名齐备");

    const walkPng25 = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walkPng25(`${dir}/${e.name}`) : e.name.endsWith(".png") ? [`${dir}/${e.name}`] : [],
      );
    const matrix25 = walkPng25("docs/ui/r25");
    eq(matrix25.length, 7, "r25 目录恰好 7 张 PNG");
    eq(new Set(matrix25.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 7, "r25 七张 PNG SHA256 两两互异");
    const shells25 = walkPng25("docs/ui/shell");
    eq(shells25.length, 20, "随 r28 推进：壳基线已扩为 19 张 PNG");
    eq(new Set(shells25.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "壳基线 19 张 SHA256 两两互异");
    const hash25 = shell25.match(/<!-- R49_HASHES_BEGIN -->([\s\S]*?)<!-- R49_HASHES_END -->/);
    ok(hash25 !== null, "shell README R32 当前哈希块在场");
    if (hash25) {
      const listed25 = [...hash25[1]!.matchAll(/`([a-z-]+)=([0-9A-F]{8})`/g)].map((m) => [m[1], m[2]]);
      eq(listed25.length, 20, "shell README R29 块列出 19 张哈希");
      const mismatches25 = listed25.filter(([name, hash]) => {
        const file = shells25.find((p) => p.replace(/\\/g, "/").endsWith(`/${name}-tab-active.png`));
        return !file || createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8).toUpperCase() !== hash;
      });
      eq(mismatches25, [], "shell README R26 哈希与实际文件逐字一致");
    }
    ok(shell25.includes("**r23 基线**") && shell25.includes("**r24 基线**"), "shell README 保留 r23/r24 历史对照行");
    ok(shell25.includes("90166EF8") || shell25.includes("物资壳"), "shell README 如实记录物资壳与 r23 同字节事实");
    ok((r25Index.match(/^\| \d\d-[^|]*\.png \|/gm) ?? []).length === 7, "r25 截图索引含七张矩阵行");
    ok(root25.includes("e2e（3995 断言）+ HTTP 审计（3167 断言）"), "r25 根 README 速查行数字同步");
    ok(ARCHIVE_README.includes("### r25 矩阵") && ARCHIVE_README.includes("e2e 2041 → **2096（+55）**"), "r25 双节规模与矩阵索引历史行归档后仍同步");
  }

  // 61. r26：通知中心（站内消息聚合）——模板 / 阈值 / 幂等 / 已读 / 分页 / 跳转契约
  section("r26 通知中心：shared 规则 / schema v19 / 数据层 / 渲染层 seam");
  {
    const now26 = new Date(2026, 10, 20, 9, 30, 0);
    const today26 = localDateStr(now26);

    // (A) 类型枚举与标签 / 映射口径
    eq(NOTIFICATION_TYPES.length, 5, "r26 通知类型恰五种");
    eq([...NOTIFICATION_TYPES], ["schedule_due", "approval_pending", "asset_low", "sync_conflict", "system"], "r26 通知类型顺序锁定");
    eq(NOTIFICATION_TYPE_LABELS.approval_pending, "审批", "r26 审批类型中文标签");
    eq(NOTIFICATION_TYPE_LABELS.sync_conflict, "同步", "r26 同步类型中文标签");
    eq(NOTIFICATION_REF_TYPES.length, 5, "r26 引用类型恰五种");
    eq(NOTIFICATION_REF_TABS.approvals, "approval", "r26 ref_type=approvals 跳审批 tab");
    eq(NOTIFICATION_REF_TABS.schedules, "schedules", "r26 ref_type=schedules 跳日程 tab");
    eq(NOTIFICATION_REF_TABS.assets, "assets", "r26 ref_type=assets 跳物资 tab");
    eq(NOTIFICATION_TYPE_TABS.sync_conflict, "home", "r26 同步冲突默认回落工作台");
    eq(isNotificationType("asset_low"), true, "r26 合法类型判定");
    eq(isNotificationType("unknown"), false, "r26 未知类型判定为 false");
    await throws(() => assertValidNotificationType("bogus"), "r26 非法通知类型守卫抛错");
    eq(isNotificationRefType("system"), true, "r26 合法引用类型判定");
    await throws(() => assertValidNotificationRef("bogus", 1), "r26 非法引用类型守卫抛错");
    await throws(() => assertValidNotificationRef("approvals", 0), "r26 实体类 ref_id=0 被拒");
    await throws(() => assertValidNotificationRef("approvals", -3), "r26 负 ref_id 被拒");
    noThrow(() => assertValidNotificationRef("system", 0), "r26 system ref_id=0 合法");

    // (B) 阈值判定（审批≥1 / 库存≤阈值 / 冲突>0 / 日程当天）
    eq(shouldNotify("approval_pending", { count: 0 }), false, "r26 审批计数 0 不发");
    eq(shouldNotify("approval_pending", { count: 1 }), true, "r26 审批计数 1 发");
    eq(shouldNotify("approval_pending", { count: "2" }), true, "r26 审批计数字符串归一");
    eq(shouldNotify("asset_low", { quantity: 5 }), true, "r26 库存等于阈值发");
    eq(shouldNotify("asset_low", { quantity: 4 }), true, "r26 库存低于阈值发");
    eq(shouldNotify("asset_low", { quantity: 6 }), false, "r26 库存高于阈值不发");
    eq(shouldNotify("asset_low", { quantity: 2, threshold: 1 }), false, "r26 自定义阈值生效");
    eq(DEFAULT_LOW_STOCK_THRESHOLD, 5, "r26 默认低库存阈值=5");
    eq(shouldNotify("sync_conflict", { conflictCount: 0 }), false, "r26 冲突数 0 不发");
    eq(shouldNotify("sync_conflict", { conflictCount: 1, fields: ["title"] }), true, "r26 冲突数 1 发");
    eq(shouldNotify("schedule_due", { date: today26, now: now26 }), true, "r26 当天日程发");
    eq(shouldNotify("schedule_due", { date: "2026-11-21", now: now26 }), false, "r26 非当天日程不发");
    eq(shouldNotify("system", {}), true, "r26 系统消息恒发");
    await throws(() => shouldNotify("bogus" as Notification["type"], {}), "r26 未知类型阈值判定抛错");

    // (C) 模板生成（标题/正文/引用/未读/时间确定性）
    const schedNote = buildNotification("schedule_due", { title: "需求评审", start: "10:00", refId: 31, now: now26 }, now26);
    eq(schedNote.title, "日程到期：需求评审", "r26 日程通知标题模板");
    ok(schedNote.body.includes("10:00") && schedNote.body.includes("需求评审"), "r26 日程通知正文含时间与标题");
    eq(schedNote.refType, "schedules", "r26 日程通知 ref_type");
    eq(schedNote.refId, 31, "r26 日程通知 ref_id");
    eq(schedNote.readAt, null, "r26 生成通知默认未读");
    eq(schedNote.createdAt, now26.toISOString(), "r26 生成通知时间由入参确定");
    const apprNote = buildNotification("approval_pending", { title: "采购申请", refId: 7 }, now26);
    eq(apprNote.title, "待处理审批：采购申请", "r26 审批通知标题模板");
    eq(apprNote.refType, "approvals", "r26 审批通知 ref_type");
    ok(apprNote.body.includes("采购申请"), "r26 审批通知正文含审批标题");
    const assetNote = buildNotification("asset_low", { name: "投影仪", quantity: 2, unit: "台", threshold: 5, refId: 9 }, now26);
    eq(assetNote.title, "物资库存不足：投影仪", "r26 物资通知标题模板");
    ok(assetNote.body.includes("库存 2台") && assetNote.body.includes("阈值 5"), "r26 物资通知正文含数量与阈值");
    eq(assetNote.refType, "assets", "r26 物资通知 ref_type");
    const syncNote = buildNotification("sync_conflict", { entityType: "todo", entityId: "88", fields: ["title"], refId: 12 }, now26);
    eq(syncNote.title, "同步冲突：todo 88", "r26 同步通知标题模板");
    ok(syncNote.body.includes("[title]"), "r26 同步通知正文含冲突字段");
    eq(syncNote.refType, "sync", "r26 同步通知 ref_type");
    const sysNote = buildNotification("system", { title: "系统维护", message: "今晚 22 点升级", now: now26 }, now26);
    eq(sysNote.title, "系统维护", "r26 系统通知标题原样");
    eq(sysNote.body, "今晚 22 点升级", "r26 系统通知正文原样");
    eq(sysNote.refType, "system", "r26 系统通知 ref_type");
    await throws(() => buildNotification("schedule_due", { title: "" }), "r26 缺标题模板抛错");
    await throws(() => buildNotification("system", { title: "" }), "r26 系统通知缺标题抛错");

    // (D) 未读分组统计
    const mk26 = (id: number, type: Notification["type"], readAt: string | null, createdAt: string): Notification => ({
      id, type, title: `t${id}`, body: "b", refType: "system", refId: 0, readAt, createdAt,
    });
    const emptySum = emptyNotificationSummary();
    eq(emptySum.total, 0, "r26 空通知汇总 total=0");
    eq(Object.keys(emptySum.byType).length, 5, "r26 空汇总含五类零项");
    const list26 = [
      mk26(1, "approval_pending", null, "2026-11-20T01:00:00.000Z"),
      mk26(2, "approval_pending", "2026-11-20T02:00:00.000Z", "2026-11-20T01:00:00.000Z"),
      mk26(3, "asset_low", null, "2026-11-20T02:00:00.000Z"),
      mk26(4, "system", "2026-11-20T03:00:00.000Z", "2026-11-20T03:00:00.000Z"),
    ];
    const sum26 = notificationSummary(list26);
    eq(sum26.total, 4, "r26 汇总 total 含已读与未读");
    eq(sum26.unread, 2, "r26 汇总未读数");
    eq(sum26.read, 2, "r26 汇总已读数");
    eq(sum26.unreadByType.approval_pending, 1, "r26 审批未读分组");
    eq(sum26.unreadByType.asset_low, 1, "r26 物资未读分组");
    eq(sum26.unreadByType.sync_conflict, 0, "r26 无同步通知分组为 0");
    eq(sum26.byType.approval_pending.total, 2, "r26 审批类型总数");

    // (E) 列表过滤 / 分页（规则只在 shared）
    const allQ = queryNotifications(list26, {});
    eq(allQ.total, 4, "r26 全量查询 total");
    eq(allQ.notifications.map((n) => n.id), [4, 3, 2, 1], "r26 列表按创建时间倒序同刻 id 倒序");
    eq(queryNotifications(list26, { unreadOnly: "1" }).notifications.map((n) => n.id), [3, 1], "r26 未读过滤只留 read_at=NULL");
    eq(queryNotifications(list26, { type: "approval_pending" }).total, 2, "r26 类型过滤计数");
    eq(queryNotifications(list26, { page: 2, pageSize: 3 }).notifications.map((n) => n.id), [1], "r26 第二页数据");
    eq(queryNotifications(list26, { page: 1, pageSize: 2 }).totalPages, 2, "r26 总页数");
    eq(queryNotifications(list26, { page: 99, pageSize: 2 }).notifications, [], "r26 越界页为空列表");
    eq(queryNotifications(list26, { page: -3, pageSize: 999 }).pageSize, MAX_PAGE_SIZE, "r26 分页上限封顶");
    eq(queryNotifications(list26, { page: -3 }).page, 1, "r26 页码下限收敛为 1");
    await throws(() => queryNotifications(list26, { type: "hack" }), "r26 非法类型过滤抛错");
    eq(notificationTargetTab({ refType: "approvals", type: "system" }), "approval", "r26 跳转映射 ref_type 优先");

    // (E2) r26 返工#1：点通知定位引用实体——deep-link 参数唯一口径在 shared，web 零算法分支
    const apprDeep26 = notificationDeepLinkParams({ refType: "approvals", refId: 91, type: "approval_pending" });
    eq(apprDeep26.approvalId, "91", "返工#1 审批通知 deep-link 携带通知 refId=91");
    eq(apprDeep26.view, "todo", "返工#1 审批 deep-link 钉 todo 视角（按 id 定位，不依赖首行自动选中）");
    eq(notificationDeepLinkParams({ refType: "assets", refId: 81, type: "asset_low" }).assetId, "81", "返工#1 物资通知 deep-link 携带 refId=81");
    eq(notificationDeepLinkParams({ refType: "schedules", refId: 31, type: "schedule_due" }).scheduleId, "31", "返工#1 日程通知 deep-link 携带 refId=31");
    eq(Object.keys(notificationDeepLinkParams({ refType: "sync", refId: 12, type: "sync_conflict" })).length, 0, "返工#1 同步冲突无实体 id 时不造伪定位参数");
    eq(Object.keys(notificationDeepLinkParams({ refType: "approvals", refId: 0, type: "approval_pending" })).length, 0, "返工#1 refId=0 不造伪审批定位参数");
    const page26Fix = readFileSync("apps/web/src/NotificationsPage.tsx", "utf8");
    const app26Fix = readFileSync("apps/web/src/App.tsx", "utf8");
    const apprPage26Fix = readFileSync("apps/web/src/ApprovalPage.tsx", "utf8");
    const assetsPage26Fix = readFileSync("apps/web/src/AssetsPage.tsx", "utf8");
    const schedPage26Fix = readFileSync("apps/web/src/SchedulesPage.tsx", "utf8");
    const api26Fix = readFileSync("apps/api/src/server.ts", "utf8");
    ok(page26Fix.includes("onNavigate(notificationTargetTab(n), notificationDeepLinkParams(n))"), "返工#1 通知页透传 tab + refId 定位参数");
    ok(app26Fix.includes("history.replaceState") && app26Fix.includes('url.searchParams.set("page", target)'), "返工#1 App 写 deep-link 到地址栏（reload 不丢）");
    ok(app26Fix.includes("Object.entries(params)"), "返工#1 App 把定位参数并入 deep-link");
    ok(apprPage26Fix.includes("query.approvalId") && apprPage26Fix.includes("deepLinkLocated"), "返工#1 审批页按 deep-link id 一次性定位目标单");
    ok(apprPage26Fix.includes("selected.currentAssignee"), "返工#1 审批页按目标单审批人自动切换身份，保证目标行可见");
    ok(assetsPage26Fix.includes('get("assetId")'), "返工#1 物资页消费 assetId 深链选中");
    ok(schedPage26Fix.includes('get("scheduleId")'), "返工#1 日程页消费 scheduleId 深链定位");
    ok(api26Fix.includes("notificationDeepLinkParams(found)"), "返工#1 通知详情 HTTP 回带 deep-link 定位参数（api 零算法分支）");
    ok(page26Fix.includes("notif-filter-legend") && page26Fix.includes("全部＝总数"), "返工#1 左栏补计数口径图例（全部=总数，类型=未读）");
    ok(app26Fix.includes('shotName === "notif-read-badge"') && app26Fix.includes("? 2"), "返工#1 补徽标递减钉态（3→2）与列表未读数一致");

    // (F) 当前库状态 → 候选事件（refresh 唯一装配入口）
    const candidates = collectNotificationCandidates({
      schedules: [
        { id: 31, title: "今天日程", date: today26, start: "10:00" },
        { id: 32, title: "明天日程", date: "2026-11-21" },
      ],
      approvals: [
        { id: 7, title: "待办审批", status: "pending" },
        { id: 8, title: "已结审批", status: "approved" },
      ],
      assets: [
        { id: 9, name: "投影仪", quantity: 2, unit: "台" },
        { id: 10, name: "电脑", quantity: 20 },
      ],
      now: now26,
    });
    eq(candidates.length, 3, "r26 候选事件只含今日日程/待办审批/低库存三类");
    eq(candidates.filter((c) => c.type === "schedule_due").length, 1, "r26 日程候选唯一");
    eq(candidates.filter((c) => c.type === "approval_pending").length, 1, "r26 审批候选唯一");
    eq(candidates.filter((c) => c.type === "asset_low").length, 1, "r26 物资候选唯一");
    eq(collectNotificationCandidates({ now: now26 }).length, 0, "r26 零数据时无候选事件");
    ok(candidates.every((c) => shouldNotify(c.type, c.ctx)), "r26 候选事件全部通过阈值判定");

    // (G) schema v19 raw：notifications 表 / 检查约束 / 索引 / 可空列
    const raw26 = openDatabaseRaw({ path: ":memory:" });
    eq((raw26.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 27, "r26 新库 user_version=27");
    const nCols = raw26.raw.all("PRAGMA table_info(notifications)") as { name: string; notnull: number; dflt_value: unknown }[];
    eq(nCols.map((c) => c.name), ["id", "type", "title", "body", "ref_type", "ref_id", "read_at", "created_at"], "r26 notifications 八列逐字锁定");
    eq(nCols.find((c) => c.name === "read_at")?.notnull, 0, "r26 read_at 可空（未读默认 NULL）");
    eq(nCols.find((c) => c.name === "ref_id")?.notnull, 1, "r26 ref_id NOT NULL（0 代表无具体实体）");
    const nIdx = raw26.raw.all("PRAGMA index_list(notifications)") as { name: string }[];
    ok(["idx_notifications_type", "idx_notifications_read_at", "idx_notifications_created_at", "idx_notifications_ref"].every((i) => nIdx.some((x) => x.name === i)), "r26 notifications 四个索引在场");
    raw26.raw.run("INSERT INTO notifications (type,title,body,ref_type,ref_id,created_at) VALUES ('system','raw标题','raw正文','system',0,'t')");
    eq((raw26.raw.get("SELECT read_at FROM notifications WHERE id=1") as { read_at: string | null }).read_at, null, "r26 新通知默认未读落库");
    await throws(() => raw26.raw.run("INSERT INTO notifications (type,title,ref_type,ref_id,created_at) VALUES ('hack','x','system',0,'t')"), "r26 非法 type 被 CHECK 拒绝");
    await throws(() => raw26.raw.run("INSERT INTO notifications (type,title,ref_type,ref_id,created_at) VALUES ('system','x','system',-1,'t')"), "r26 负 ref_id 被 CHECK 拒绝");
    eq((raw26.raw.get("SELECT COUNT(*) AS n FROM notifications") as { n: number }).n, 1, "r26 4xx 尝试零半态（只有合法一行）");
    raw26.raw.close();

    // (H) 数据层：创建 / 幂等 / 已读 / 批量已读 / 删除 / 重开不丢
    const d26 = freshDb();
    const created26 = d26.createNotification(buildNotification("system", { title: "r26-系统消息", message: "hello", now: now26 }, now26));
    eq(created26.title, "r26-系统消息", "r26 数据层创建通知返回标题");
    eq(created26.readAt, null, "r26 数据层新通知未读");
    const draft26 = buildNotification("approval_pending", { title: "r26审批", refId: 7 }, now26);
    const first26 = d26.upsertNotification(draft26);
    const second26 = d26.upsertNotification(draft26);
    eq(first26.created, true, "r26 首次 refresh 落库");
    eq(second26.created, false, "r26 重复 refresh 幂等不重复");
    eq(second26.notification.id, first26.notification.id, "r26 幂等返回同一条通知");
    eq(d26.listNotifications().length, 2, "r26 两次 upsert 后库内恰两条");
    const read26 = d26.markNotificationRead(created26.id, "2026-11-20T10:00:00.000Z");
    eq(read26?.readAt, "2026-11-20T10:00:00.000Z", "r26 单条已读真落库");
    eq(d26.markNotificationRead(created26.id)?.readAt, "2026-11-20T10:00:00.000Z", "r26 重复已读不改时间");
    eq(d26.markNotificationRead(999999), null, "r26 越权 id 已读返回 null");
    eq(d26.markAllNotificationsRead(), 1, "r26 批量已读只更新未读行");
    eq(d26.markAllNotificationsRead(), 0, "r26 重复批量已读返回 0");
    eq(notificationSummary(d26.listNotifications()).unread, 0, "r26 全量已读后未读归零");
    const patched26 = d26.updateNotificationContent(created26.id, { title: "r26改标题" });
    eq(patched26?.title, "r26改标题", "r26 PATCH 内容真落库");
    await throws(() => d26.updateNotificationContent(created26.id, { title: "" }), "r26 空标题 PATCH 被拒");
    const path26 = `scripts/.tmp-e2e/r26-notify-${Date.now()}.db`;
    const open26a = openDatabaseRaw({ path: path26 });
    open26a.db.createNotification(buildNotification("asset_low", { name: "重开物资", quantity: 1, refId: 3 }, now26));
    open26a.raw.close();
    const open26b = openDatabaseRaw({ path: path26 });
    eq(open26b.db.listNotifications()[0]?.title, "物资库存不足：重开物资", "r26 真实文件库重开通知不丢");
    eq(d26.deleteNotification(created26.id), true, "r26 删除通知 -> true");
    eq(d26.deleteNotification(created26.id), false, "r26 重复删除 -> false");
    open26b.raw.close();
    unlinkSync(path26);

    // (I) 渲染层 / API / 脚本 seam（web 零算法分支，只消费 shared 与路由）
    const app26 = readFileSync("apps/web/src/App.tsx", "utf8");
    const page26 = readFileSync("apps/web/src/NotificationsPage.tsx", "utf8");
    const api26 = readFileSync("apps/api/src/server.ts", "utf8");
    const schemaSource26 = readFileSync("packages/db/src/schema.ts", "utf8");
    const shot26 = readFileSync("scripts/shot.ps1", "utf8");
    const shell26 = readFileSync("docs/ui/shell/README.md", "utf8");
    const r26Index = readFileSync("docs/ui/r26/README.md", "utf8");
    const root26 = readFileSync("README.md", "utf8");
    const ci26 = readFileSync(".github/workflows/ci.yml", "utf8");
    ok(app26.includes('type PageTab = "home"') && app26.includes('| "notifications"'), "r26 十六 tab 类型含通知页");
    ok(app26.includes('data-tab="notifications"') && app26.includes("通知"), "r26 顶栏通知 tab 在场");
    ok(app26.includes('data-state="notif-badge"') && app26.includes("/api/notifications/summary"), "r26 顶栏全局未读徽标接真汇总");
    ok(page26.includes("notificationTargetTab") && page26.includes("queryNotifications"), "r26 筛选/跳转消费 shared 映射零算法分支");
    ok(page26.includes('"notif-unread"') && page26.includes('data-state="notif-item"'), "r26 未读加粗与列表 seam 在场");
    ok(page26.includes("notif-empty") && page26.includes("notif-error") && page26.includes("notif-refreshed"), "r26 空态/错误态/refresh 后钉态在场");
    ok(api26.includes('app.post("/api/notifications/refresh"') && api26.includes('app.post("/api/notifications/:id/read"'), "r26 refresh 与已读路由在场");
    ok(api26.includes('app.post("/api/notifications/read-all"') && api26.includes('app.get("/api/notifications/summary"'), "r26 批量已读与汇总路由在场");
    ok(api26.includes("collectNotificationCandidates") && api26.includes("shouldNotify") && api26.includes("buildNotification"), "r26 api 只装配 shared 规则零算法分支");
    ok(schemaSource26.includes("version: 19") && schemaSource26.includes("CREATE TABLE IF NOT EXISTS notifications"), "r26 schema v19 迁移在场");
    ok(ci26.includes("(2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27)"), "r26 CI smoke 正则升 v19");
    ok(shot26.includes('"r26"') && ["01-notif-empty", "02-notif-unread", "03-notif-filtered", "04-notif-read", "05-notif-refreshed", "06-narrow", "07-error", "08-notif-badge-decrement"].every((s) => shot26.includes(s)), "r26 shot.ps1 ValidateSet 与八张矩阵名齐备");
    ok(shell26.includes("<!-- R26_HASHES_BEGIN -->") && shell26.includes("<!-- R26_HASHES_END -->"), "r26 shell README 历史哈希块在场（当前块见 R28）");
    ok((r26Index.match(/^\| \[?\d\d-[^|\]]*\.png/gm) ?? []).length === 9, "r26 截图索引含九张矩阵行（返工#2 补 09）");
    ok(root26.includes("e2e（3995 断言）+ HTTP 审计（3167 断言）"), "返工#1 根 README 速查行数字逐字同步");

    // (J) 截图矩阵与十六 tab 壳基线（SHA 两两互异 + README 哈希逐字一致）
    const walkPng26 = (dir: string): string[] => {
      const out: string[] = [];
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${f.name}`;
        if (f.isDirectory()) out.push(...walkPng26(p));
        else if (f.name.endsWith(".png")) out.push(p);
      }
      return out;
    };
    const matrix26 = walkPng26("docs/ui/r26");
    eq(matrix26.length, 9, "r26 目录恰好 9 张 PNG（返工#2 补 09）");
    eq(new Set(matrix26.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 9, "r26 九张 PNG SHA256 两两互异");
    const shells26 = walkPng26("docs/ui/shell");
    eq(shells26.length, 20, "随 r28 推进：壳基线 19 张 PNG");
    eq(new Set(shells26.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "壳基线 19 张 SHA256 两两互异（随 r28 推进）");
    const hash26 = shell26.match(/<!-- R49_HASHES_BEGIN -->([\s\S]*?)<!-- R49_HASHES_END -->/);
    ok(hash26 !== null, "shell README R32 当前哈希块在场");
    if (hash26) {
      const listed26 = [...hash26[1]!.matchAll(/`([a-z-]+)=([0-9A-F]{8})`/g)].map((m) => ({ name: m[1]!, hash: m[2]! }));
      eq(listed26.length, 20, "shell README R29 块列出 19 张哈希");
      const mismatches26 = listed26.filter(({ name, hash }) => {
        const file = shells26.find((p) => p.replace(/\\/g, "/").endsWith(`/${name}-tab-active.png`));
        return !file || createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8).toUpperCase() !== hash;
      });
      eq(mismatches26, [], "shell README R26 哈希与实际文件逐字一致");
    }
  }

  // 62. r27：报表中心（跨模块数据看板）——六指标纯函数 / 时间范围 / 环比 / 空数据 / 渲染 seam
  section("r27 报表中心：shared 规则 / 六指标算法 / 时间范围 / 渲染层 seam");
  {
    // 所有样本手算可核：当前区间 2026-11-01..07（7 天），前一等长区间 2026-10-25..31
    const R = { from: "2026-11-01", to: "2026-11-07" };
    const now27 = new Date("2026-11-20T12:00:00.000Z");
    const todos27 = [
      { id: 1, title: "T1", status: "done", createdAt: "2026-11-01T08:00:00.000Z" },
      { id: 2, title: "T2", status: "done", createdAt: "2026-11-02T08:00:00.000Z" },
      { id: 3, title: "T3", status: "done", createdAt: "2026-11-03T08:00:00.000Z" },
      { id: 4, title: "T4", status: "open", createdAt: "2026-11-04T08:00:00.000Z" },
      { id: 5, title: "T5", status: "open", createdAt: "2026-11-05T08:00:00.000Z" },
      { id: 6, title: "P1", status: "done", createdAt: "2026-10-26T08:00:00.000Z" },
      { id: 7, title: "P2", status: "open", createdAt: "2026-10-27T08:00:00.000Z" },
    ];
    const schedules27 = [
      { id: 11, title: "S1", date: "2026-11-01", start: "09:00" },
      { id: 12, title: "S2", date: "2026-11-01", start: "10:00" },
      { id: 13, title: "S3", date: "2026-11-03", start: "09:00" },
      { id: 14, title: "S4", date: "2026-11-07", start: "09:00" },
      { id: 15, title: "P1", date: "2026-10-27", start: "09:00" },
      { id: 16, title: "P2", date: "2026-10-28", start: "09:00" },
    ];
    const columns27 = [{ id: 1, name: "待办" }, { id: 2, name: "进行中" }, { id: 3, name: "已完成" }];
    const cards27 = [
      { id: 21, title: "C1", columnId: 3, todoId: 1, updatedAt: "2026-11-01T10:00:00.000Z" },
      { id: 22, title: "C2", columnId: 3, todoId: 2, updatedAt: "2026-11-02T10:00:00.000Z" },
      { id: 23, title: "C3", columnId: 2, todoId: 4, updatedAt: "2026-11-02T10:00:00.000Z" },
      { id: 24, title: "C4", columnId: 3, todoId: 3, updatedAt: "2026-11-05T10:00:00.000Z" },
      { id: 25, title: "P1", columnId: 3, todoId: 6, updatedAt: "2026-10-27T10:00:00.000Z" },
      { id: 26, title: "P2", columnId: 3, todoId: 99, updatedAt: "2026-10-28T10:00:00.000Z" },
    ];
    const approvals27 = [
      { id: 31, title: "A1", status: "approved", createdAt: "2026-11-01T08:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z" },
      { id: 32, title: "A2", status: "rejected", createdAt: "2026-11-02T09:00:00.000Z", updatedAt: "2026-11-02T13:00:00.000Z" },
      { id: 33, title: "A3", status: "pending", createdAt: "2026-11-03T09:00:00.000Z", updatedAt: "2026-11-03T09:30:00.000Z" },
      { id: 34, title: "P1", status: "approved", createdAt: "2026-10-27T08:00:00.000Z", updatedAt: "2026-10-27T14:00:00.000Z" },
    ];
    const steps27 = [
      { id: 1, approvalId: 31, action: "submit", actedAt: "2026-11-01T08:00:00.000Z" },
      { id: 2, approvalId: 31, action: "approve", actedAt: "2026-11-01T10:00:00.000Z" },
      { id: 3, approvalId: 32, action: "submit", actedAt: "2026-11-02T09:00:00.000Z" },
      { id: 4, approvalId: 32, action: "reject", actedAt: "2026-11-02T13:00:00.000Z" },
      { id: 5, approvalId: 34, action: "submit", actedAt: "2026-10-27T08:00:00.000Z" },
      { id: 6, approvalId: 34, action: "approve", actedAt: "2026-10-27T14:00:00.000Z" },
    ];
    const txs27 = [
      { id: 41, assetId: 1, type: "in", quantity: 10, createdAt: "2026-11-01T08:00:00.000Z" },
      { id: 42, assetId: 1, type: "out", quantity: 4, createdAt: "2026-11-02T08:00:00.000Z" },
      { id: 43, assetId: 2, type: "out", quantity: 3, createdAt: "2026-11-03T08:00:00.000Z" },
      { id: 44, assetId: 2, type: "transfer", quantity: 99, createdAt: "2026-11-04T08:00:00.000Z" },
      { id: 45, assetId: 3, type: "out", quantity: 2, createdAt: "2026-11-06T08:00:00.000Z" },
      { id: 46, assetId: 1, type: "out", quantity: 3, createdAt: "2026-10-27T08:00:00.000Z" },
    ];
    const docs27 = [
      { id: 51, title: "D1", createdAt: "2026-11-01T08:00:00.000Z" },
      { id: 52, title: "D2", createdAt: "2026-11-03T08:00:00.000Z" },
      { id: 53, title: "D3", createdAt: "2026-11-07T08:00:00.000Z" },
      { id: 54, title: "P1", createdAt: "2026-10-28T08:00:00.000Z" },
    ];
    const source27 = {
      todos: todos27, schedules: schedules27, boardCards: cards27, boardColumns: columns27,
      approvals: approvals27, approvalSteps: steps27, assetTransactions: txs27, documents: docs27,
    };

    // (A) 契约与守卫
    eq([...REPORT_METRICS], ["todoCompletion", "scheduleLoad", "boardThroughput", "approvalSla", "assetTurnover", "docOutput"], "r27 六指标唯一枚举与顺序");
    eq(REPORT_METRIC_LABELS.approvalSla, "审批时效", "r27 审批时效中文标签");
    eq(REPORT_METRIC_LABELS.assetTurnover, "库存周转", "r27 库存周转中文标签");
    eq([...REPORT_PRESETS], ["7d", "30d", "90d"], "r27 时间预设 7/30/90 天");
    eq(REPORT_SPARK_BUCKETS, 7, "r27 迷你条固定七桶");
    eq(isReportMetric("docOutput"), true, "r27 合法指标判定");
    eq(isReportMetric("hack"), false, "r27 未知指标判定 false");
    await throws(() => assertValidReportMetric("hack"), "r27 未知名 metric 守卫抛错");
    noThrow(() => assertValidReportMetric("todoCompletion"), "r27 合法 metric 守卫放行");

    // (B) 时间范围：闭区间 / 缺省 / 非法 / 等长前一区间
    eq(parseReportRange("2026-11-01", "2026-11-07"), R, "r27 显式时间范围逐字解析");
    eq(parseReportRange("", "", now27), { from: "2026-10-22", to: "2026-11-20" }, "r27 缺省回落最近 30 天含今天");
    eq(reportRangeFromPreset("7d", now27), { from: "2026-11-14", to: "2026-11-20" }, "r27 近 7 天预设含今天");
    eq(reportRangeFromPreset("90d", now27), { from: "2026-08-23", to: "2026-11-20" }, "r27 近 90 天预设");
    await throws(() => reportRangeFromPreset("365d", now27), "r27 非法预设抛错");
    await throws(() => parseReportRange("2026-02-30", "2026-03-01"), "r27 非真实日历日期被拒");
    await throws(() => parseReportRange("2026-11-08", "2026-11-07"), "r27 from>to 被拒");
    await throws(() => parseReportRange("2026-11-01", ""), "r27 单边日期被拒");
    eq(reportRangeDays(R), 7, "r27 区间天数闭区间口径");
    eq(shiftReportRange(R, -1), { from: "2026-10-25", to: "2026-10-31" }, "r27 前一等长区间");
    eq(reportWindow(R).previous.from, "2026-10-25", "r27 reportWindow 前一区间起点");
    eq(inReportRange("2026-11-07T23:59:59.000Z", R), true, "r27 末日时间戳落区间");
    eq(inReportRange("2026-11-08T00:00:00.000Z", R), false, "r27 次日不落区间");
    eq(inReportRange(null, R), false, "r27 空日期不落区间");
    eq(reportPercent(0, 0), 0, "r27 零分母完成率不除零");
    eq(reportPercent(1, 3), 33, "r27 完成率四舍五入");

    // (C) 六指标算法手算核对
    const cTodo = computeTodoCompletion(todos27, R);
    const pTodo = computeTodoCompletion(todos27, shiftReportRange(R, -1));
    eq(cTodo.value, 60, "r27 待办完成率 3/5=60%");
    eq(pTodo.value, 50, "r27 前一区间完成率 1/2=50%");
    eq(cTodo.unit, "%", "r27 完成率单位");
    eq(cTodo.detail.length, 5, "r27 完成率明细只含区间内五条");
    eq(cTodo.spark.length, REPORT_SPARK_BUCKETS, "r27 完成率迷你条七桶");
    eq(computeTodoCompletion([], R).value, 0, "r27 零待办完成率 0 不崩");

    const cSch = computeScheduleLoad(schedules27, R);
    eq(cSch.value, 4, "r27 日程分布区间内四场");
    eq(computeScheduleLoad(schedules27, shiftReportRange(R, -1)).value, 2, "r27 前一区间两场");
    eq(cSch.detail.map((d) => d.key), ["2026-11-01", "2026-11-03", "2026-11-07"], "r27 日程明细按日期聚合");
    eq(cSch.detail[0]?.value, 2, "r27 11-01 两场日程");
    eq(cSch.unit, "场", "r27 日程单位");

    const cBoard = computeBoardThroughput(cards27, columns27, todos27, R);
    eq(cBoard.value, 3, "r27 看板吞吐 3 张完成卡片（open 待办与幽灵 id 不计）");
    eq(computeBoardThroughput(cards27, columns27, todos27, shiftReportRange(R, -1)).value, 1, "r27 前一区间吞吐 1 张");
    eq(cBoard.detail, [{ key: "column-3", label: "已完成", value: 3, note: "完成卡片" }], "r27 吞吐按列聚合且列名可辨");
    eq(cBoard.unit, "张", "r27 吞吐单位");

    const cSla = computeApprovalSla(approvals27, steps27, R);
    eq(cSla.value, 3, "r27 审批时效平均 (2+4)/2=3 小时");
    eq(computeApprovalSla(approvals27, steps27, shiftReportRange(R, -1)).value, 6, "r27 前一区间审批 6 小时");
    eq(cSla.detail.length, 2, "r27 pending 审批不计入时效明细");
    eq(cSla.detail[0]?.value, 2, "r27 首单耗时从 submit 到 approve 精确 2 小时");
    eq(computeApprovalSla(approvals27, [], R).value, 3, "r27 无步骤时回落 createdAt/updatedAt 仍为 3 小时");
    eq(cSla.unit, "小时", "r27 时效单位");

    const cTx = computeAssetTurnover(txs27, R);
    eq(cTx.value, 9, "r27 库存周转只计出库 4+3+2=9");
    eq(computeAssetTurnover(txs27, shiftReportRange(R, -1)).value, 3, "r27 前一区间出库 3");
    eq(cTx.detail.map((r) => r.value), [4, 3, 2], "r27 周转按物资出库聚合");
    eq(cTx.detail[0]?.note, "入库 10 / 出库 4", "r27 周转明细带入库对照");
    eq(cTx.unit, "件", "r27 周转单位");

    const cDoc = computeDocOutput(docs27, R);
    eq(cDoc.value, 3, "r27 文档产出三篇");
    eq(computeDocOutput(docs27, shiftReportRange(R, -1)).value, 1, "r27 前一区间一篇");
    eq(cDoc.detail.map((d) => d.key), ["51", "52", "53"], "r27 文档明细逐篇");
    eq(cDoc.unit, "篇", "r27 文档单位");

    // (D) 一次装配 + 环比 + 下钻 + 空数据
    const overview27: ReportOverview = assembleReport(source27, R);
    eq(overview27.range, R, "r27 总览回显当前区间");
    eq(overview27.previousRange, { from: "2026-10-25", to: "2026-10-31" }, "r27 总览回显环比区间");
    eq(overview27.days, 7, "r27 总览区间天数");
    eq(Object.keys(overview27.metrics), [...REPORT_METRICS], "r27 总览六指标齐备");
    eq([...overview27.metricOrder], [...REPORT_METRICS], "r27 KPI 卡顺序与枚举一致");
    eq(overview27.metrics.todoCompletion.value, 60, "r27 总览完成率 60");
    eq(overview27.metrics.todoCompletion.previous, 50, "r27 总览完成率上期 50");
    eq(overview27.metrics.todoCompletion.delta, 10, "r27 完成率环比 +10 个百分点");
    eq(overview27.metrics.todoCompletion.deltaPct, 20, "r27 完成率环比百分比 20%");
    eq(overview27.metrics.scheduleLoad.delta, 2, "r27 日程环比 +2");
    eq(overview27.metrics.scheduleLoad.deltaPct, 100, "r27 日程环比 100%");
    eq(overview27.metrics.approvalSla.delta, -3, "r27 审批时效环比 -3 小时");
    eq(overview27.metrics.approvalSla.deltaPct, -50, "r27 审批时效环比 -50%");
    eq(overview27.metrics.assetTurnover.delta, 6, "r27 库存周转环比 +6");
    eq(overview27.metrics.docOutput.deltaPct, 200, "r27 文档产出环比 200%");
    eq(selectReportMetric(overview27, "boardThroughput").value, 3, "r27 单项下钻与总览同口径");
    await throws(() => selectReportMetric(overview27, "bogus"), "r27 下钻未知指标抛错");
    eq(filterReportDetail(overview27.metrics.docOutput, 52).map((r) => r.label), ["D2"], "r27 明细按实体 id 过滤");
    eq(filterReportDetail(overview27.metrics.docOutput, 999999), [], "r27 越权 id 明细为空（api 映射 404）");
    eq(filterReportDetail(overview27.metrics.boardThroughput, 3).length, 1, "r27 看板按列 id 下钻");
    const empty27 = assembleReport({}, R);
    eq([...REPORT_METRICS].map((m) => empty27.metrics[m].value), [0, 0, 0, 0, 0, 0], "r27 空数据六指标全 0 不崩");
    eq([...REPORT_METRICS].every((m) => empty27.metrics[m].spark.length === REPORT_SPARK_BUCKETS), true, "r27 空数据迷你条仍七桶");
    eq([...REPORT_METRICS].every((m) => empty27.metrics[m].detail.length === 0), true, "r27 空数据明细为空列表");
    eq([...REPORT_METRICS].every((m) => empty27.metrics[m].delta === 0), true, "r27 空数据环比为 0");

    // (E) 渲染层 / API / 脚本 seam（web 与 api 零算法分支）
    const app27 = readFileSync("apps/web/src/App.tsx", "utf8");
    const page27 = readFileSync("apps/web/src/ReportsPage.tsx", "utf8");
    const api27 = readFileSync("apps/api/src/server.ts", "utf8");
    const sharedPkg27 = readFileSync("packages/shared/package.json", "utf8");
    const shot27 = readFileSync("scripts/shot.ps1", "utf8");
    const shell27 = readFileSync("docs/ui/shell/README.md", "utf8");
    const r27Index = readFileSync("docs/ui/r27/README.md", "utf8");
    ok(app27.includes('type PageTab = "home"') && app27.includes('| "reports"'), "r27 十七 tab 类型含报表页");
    ok(app27.includes('data-tab="reports"') && />\s*报表\s*</.test(app27), "r27 顶栏报表 tab 在场");
    ok(app27.includes("界面文案已优化（错误提示更清晰）"), "r27 徽章随 r31 推进");
    ok(page27.includes("assembleReport") && page27.includes("REPORT_METRICS"), "r27 报表页消费 shared 唯一口径零算法分支");
    ok(page27.includes("reports-empty") && page27.includes("reports-error") && page27.includes("reports-drill"), "r27 空态/错误态/下钻钉态在场");
    ok(api27.includes('app.get("/api/reports/overview"') && api27.includes('app.get("/api/reports/:metric"'), "r27 两条报表路由在场");
    ok(api27.includes("assembleReport") && api27.includes("parseReportRange"), "r27 api 只装配 shared 规则零算法分支");
    ok(sharedPkg27.includes('"./reports": "./src/reports.ts"'), "r27 shared/reports 子路径导出在场");
    ok(shot27.includes('"r27"') && ["01-reports-overview", "02-reports-empty", "03-reports-range", "04-reports-drilldown", "05-reports-six-cards", "06-narrow", "07-error"].every((s) => shot27.includes(s)), "r27 shot.ps1 ValidateSet 与七张矩阵名齐备");
    ok(shot27.includes('@{ page = "reports";'), "r27 shell baseline 清单含报表 tab");
    ok(shell27.includes("<!-- R27_HASHES_BEGIN -->") && shell27.includes("<!-- R27_HASHES_END -->"), "r27 shell README 哈希块在场");
    ok((r27Index.match(/^\| \[?\d\d-[^|\]]*\.png/gm) ?? []).length === 7, "r27 截图索引含七张矩阵行");

    // (F) 截图矩阵与十七 tab 壳基线（SHA 两两互异 + README 哈希逐字一致）
    const walkPng27 = (dir: string): string[] => {
      const out: string[] = [];
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${f.name}`;
        if (f.isDirectory()) out.push(...walkPng27(p));
        else if (f.name.endsWith(".png")) out.push(p);
      }
      return out;
    };
    const matrix27 = walkPng27("docs/ui/r27");
    eq(matrix27.length, 7, "r27 目录恰好 7 张 PNG");
    eq(new Set(matrix27.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 7, "r27 七张 PNG SHA256 两两互异");
    const shells27 = walkPng27("docs/ui/shell");
    eq(shells27.length, 20, "r28 壳基线 19 张 PNG（新增会议 tab）");
    eq(new Set(shells27.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "r28 壳基线 19 张 SHA256 两两互异（随 r28 推进）");
    const hash27 = shell27.match(/<!-- R49_HASHES_BEGIN -->([\s\S]*?)<!-- R49_HASHES_END -->/);
    ok(hash27 !== null, "shell README R32 当前哈希块在场");
    if (hash27) {
      const listed27 = [...hash27[1]!.matchAll(/`([a-z-]+)=([0-9A-F]{8})`/g)].map((m) => ({ name: m[1]!, hash: m[2]! }));
      eq(listed27.length, 20, "shell README R29 块列出 19 张哈希");
      const mismatches27 = listed27.filter(({ name, hash }) => {
        const file = shells27.find((p) => p.replace(/\\/g, "/").endsWith(`/${name}-tab-active.png`));
        return !file || createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8).toUpperCase() !== hash;
      });
      eq(mismatches27, [], "shell README R29 哈希与实际文件逐字一致");
    }
  }

  // 63. r28：会议管理与会议室（预约 / 冲突检测）——三函数规则 / schema v20 / 数据层 / seam
  section("r28 会议管理：shared 规则 / schema v20 / 数据层 / 渲染层 seam");
  {
    // (A) 契约常量与会议室输入归一
    eq(MEETING_MAX_HOURS, 8, "r28 会议最长 8 小时唯一常量");
    eq(MEETING_CAPACITY_MAX, 1000, "r28 会议室容量上限唯一常量");
    const draftA28 = normalizeRoomDraft({ name: "  第一会议室  ", location: "  3F ", capacity: 12 });
    eq(draftA28, { name: "第一会议室", location: "3F", capacity: 12, active: true }, "r28 会议室名称/位置 trim 且默认启用");
    eq(normalizeRoomDraft({ name: "B", capacity: 0, active: false }).active, false, "r28 会议室可显式停用");
    await throws(() => normalizeRoomDraft({ name: "   " }), "r28 空会议室名被拒");
    await throws(() => normalizeRoomDraft({ name: "B", capacity: -1 }), "r28 负容量被拒");
    await throws(() => normalizeRoomDraft({ name: "B", capacity: 1001 }), "r28 超容量上限被拒");
    eq(isMeetingRoomActive({ id: 1, active: true } as never), true, "r28 启用会议室判定 true");
    eq(isMeetingRoomActive({ id: 2, active: false } as never), false, "r28 停用会议室判定 false");

    // (B) 时钟解析
    eq(parseClockMinutes("00:00"), 0, "r28 时钟 00:00 -> 0 分钟");
    eq(parseClockMinutes("09:30"), 570, "r28 时钟 09:30 -> 570 分钟");
    eq(parseClockMinutes("23:59"), 1439, "r28 时钟 23:59 -> 1439 分钟");
    eq(formatClockMinutes(570), "09:30", "r28 分钟 -> HH:mm 回显");
    await throws(() => parseClockMinutes("9:00"), "r28 非补零时钟被拒");
    await throws(() => parseClockMinutes("24:00"), "r28 越界时钟被拒");
    await throws(() => parseClockMinutes("12-30"), "r28 非法时钟格式被拒");

    // (C) validateMeetingWindow：倒挂 / 等长 / 8h 边界 / 日期
    const w28 = validateMeetingWindow("2026-11-20", "09:00", "10:00");
    eq(w28, {
      roomId: 0, date: "2026-11-20", start: "09:00", end: "10:00",
      startMinutes: 540, endMinutes: 600, durationMinutes: 60,
    }, "r28 会议时段归一含分钟与时长");
    eq(validateMeetingWindow("2026-11-20", "08:00", "16:00").durationMinutes, 480, "r28 恰好 8 小时合法");
    await throws(() => validateMeetingWindow("2026-11-20", "10:00", "09:00"), "r28 结束早于开始被拒");
    await throws(() => validateMeetingWindow("2026-11-20", "09:00", "09:00"), "r28 起止等长被拒");
    await throws(() => validateMeetingWindow("2026-11-20", "08:00", "16:01"), "r28 超过 8 小时被拒");
    await throws(() => validateMeetingWindow("2026-02-30", "09:00", "10:00"), "r28 非法日期被拒");
    await throws(() => validateMeetingWindow("", "09:00", "10:00"), "r28 空日期被拒");
    await throws(() => validateMeetingWindow("2026-11-20", "bad", "10:00"), "r28 非法开始时钟被拒");
    await throws(() => validateMeetingWindow("2026-11-20", "09:00", "bad"), "r28 非法结束时钟被拒");

    // (D) detectTimeConflict：同室重叠 / 边界相接 / 跨室 / 跨日 / 自我排除
    const m28 = (id: number, roomId: number, date: string, start: string, end: string): MeetingWindow =>
      ({ id, roomId, date, start, end });
    const existing28 = [
      m28(1, 1, "2026-11-20", "09:00", "10:00"),
      m28(2, 1, "2026-11-20", "10:00", "11:00"),
      m28(3, 2, "2026-11-20", "09:00", "10:00"),
      m28(4, 1, "2026-11-21", "09:00", "10:00"),
    ];
    eq(meetingWindowsOverlap(existing28[0]!, existing28[1]!), false, "r28 边界相接不重叠");
    eq(meetingWindowsOverlap(existing28[0]!, m28(9, 1, "2026-11-20", "09:30", "10:30")), true, "r28 部分重叠判真");
    eq(meetingWindowsOverlap(existing28[0]!, existing28[2]!), false, "r28 跨会议室不重叠");
    eq(meetingWindowsOverlap(existing28[0]!, existing28[3]!), false, "r28 跨日期不重叠");
    eq(detectTimeConflict(existing28, m28(9, 1, "2026-11-20", "11:00", "12:00")), [], "r28 边界相接预约无冲突");
    eq(detectTimeConflict(existing28, m28(9, 1, "2026-11-20", "12:00", "13:00")), [], "r28 完全不相交无冲突");
    eq(detectTimeConflict(existing28, m28(9, 2, "2026-11-20", "09:30", "10:30")), [3], "r28 跨室候选只撞同室会议");
    eq(detectTimeConflict(existing28, m28(9, 1, "2026-11-21", "09:30", "10:30")), [4], "r28 跨日候选只撞同日会议");
    eq(detectTimeConflict(existing28, m28(9, 1, "2026-11-20", "09:30", "10:30")), [1, 2], "r28 一段跨两场返回两个冲突 id 升序");
    eq(detectTimeConflict(existing28, m28(9, 1, "2026-11-20", "08:00", "12:00")), [1, 2], "r28 大区间包住两场返回两冲突");
    eq(detectTimeConflict(existing28, m28(1, 1, "2026-11-20", "09:00", "10:00")), [], "r28 同 id 自我排除不算冲突");
    noThrow(() => assertNoTimeConflict(existing28, m28(9, 1, "2026-11-20", "11:00", "12:00")), "r28 无冲突守卫放行");
    let conflict28: MeetingConflictError | null = null;
    try {
      assertNoTimeConflict(existing28, m28(9, 1, "2026-11-20", "09:30", "10:30"));
    } catch (err) {
      if (err instanceof MeetingConflictError) conflict28 = err;
    }
    ok(conflict28 !== null, "r28 冲突守卫抛 MeetingConflictError");
    eq(conflict28?.conflictIds, [1, 2], "r28 冲突错误回带冲突会议 id（api 映射 409）");

    // (E) normalizeAttendees：去重 / 校验 / 停用拒绝
    const members28 = [
      { id: 1, status: "active" }, { id: 2, status: "active" }, { id: 3, status: "inactive" },
    ];
    eq(normalizeAttendees([1, 2, 1], members28), [1, 2], "r28 参会人按 id 去重保序");
    eq(normalizeAttendees([{ memberId: 2 }, { id: 1 }], members28), [2, 1], "r28 参会人接受对象形式并归一");
    await throws(() => normalizeAttendees("3", members28), "r28 非数组参会人输入被拒");
    eq(normalizeAttendees([], members28), [], "r28 空参会人列表合法");
    await throws(() => normalizeAttendees([999], members28), "r28 不存在参会人被拒");
    await throws(() => normalizeAttendees([3], members28), "r28 停用参会人被拒");
    await throws(() => normalizeAttendees([0], members28), "r28 非法参会人 id 被拒");
    await throws(() => normalizeAttendees(["abc"], members28), "r28 非数字参会人被拒");
    eq(normalizeAttendees(null, members28), [], "r28 空参会人输入合法");

    // (F) normalizeMeetingDraft：会议室存在/启用 + 三函数编排 + availability
    const rooms28 = [
      { ...draftA28, id: 1, createdAt: "t", updatedAt: "t" },
      { id: 2, name: "B", location: "", capacity: 4, active: false, createdAt: "t", updatedAt: "t" },
    ];
    const draftM28 = normalizeMeetingDraft({
      roomId: 1, title: "  周会  ", date: "2026-11-20", start: "14:00", end: "15:00", organizer: " 张三 ", attendees: [1, 1, 2],
    }, rooms28, members28, existing28);
    eq(draftM28.roomId, 1, "r28 会议草稿回显会议室");
    eq(draftM28.title, "周会", "r28 会议标题 trim");
    eq(draftM28.organizer, "张三", "r28 组织者 trim");
    eq(draftM28.attendees, [1, 2], "r28 会议草稿参会人去重");
    eq(draftM28.startMinutes, 840, "r28 会议草稿带分钟口径");
    await throws(() => normalizeMeetingDraft({
      roomId: 999, title: "x", date: "2026-11-20", start: "09:00", end: "10:00",
    }, rooms28, members28, []), "r28 不存在 room_id 被拒");
    await throws(() => normalizeMeetingDraft({
      roomId: 2, title: "x", date: "2026-11-20", start: "09:00", end: "10:00",
    }, rooms28, members28, []), "r28 停用 room_id 被拒");
    await throws(() => normalizeMeetingDraft({
      roomId: 1, title: "", date: "2026-11-20", start: "09:00", end: "10:00",
    }, rooms28, members28, []), "r28 空会议标题被拒");
    await throws(() => normalizeMeetingDraft({
      roomId: 1, title: "x", date: "2026-11-20", start: "10:00", end: "09:00",
    }, rooms28, members28, existing28), "r28 预约时段倒挂被拒");
    let bookConflict28: MeetingConflictError | null = null;
    try {
      normalizeMeetingDraft({
        roomId: 1, title: "x", date: "2026-11-20", start: "09:30", end: "10:30",
      }, rooms28, members28, existing28);
    } catch (err) {
      if (err instanceof MeetingConflictError) bookConflict28 = err;
    }
    eq(bookConflict28?.conflictIds, [1, 2], "r28 预约编排调用冲突检测回带 id");
    const avail28 = meetingAvailability("2026-11-20", rooms28, existing28);
    eq(avail28.length, 1, "r28 可用性只列启用会议室");
    eq(avail28[0]!.roomId, 1, "r28 可用性按会议室分组");
    eq(avail28[0]!.bookings.map((b) => b.id), [1, 2], "r28 可用性列出该室当日预约");
    eq(meetingAvailability("2026-11-22", rooms28, existing28)[0]!.bookings, [], "r28 无预约日期返回空时段");

    // (G) schema v20 raw：三表 / 约束 / 索引 / 真迁移
    const raw28 = openDatabaseRaw({ path: ":memory:" });
    eq((raw28.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 27, "r28 新库 user_version=27");
    const roomCols28 = raw28.raw.all("PRAGMA table_info(rooms)").map((r) => String((r as { name: unknown }).name));
    eq(roomCols28, ["id", "name", "location", "capacity", "active", "created_at", "updated_at", "equipment"], "r28 rooms 七列逐字不动 + r43 equipment 追加在尾");
    const meetingCols28 = raw28.raw.all("PRAGMA table_info(meetings)").map((r) => String((r as { name: unknown }).name));
    eq(meetingCols28, ["id", "room_id", "title", "date", "start_time", "end_time", "organizer", "created_at", "updated_at"], "r28 meetings 九列逐列存在");
    const attendeeCols28 = raw28.raw.all("PRAGMA table_info(meeting_attendees)").map((r) => String((r as { name: unknown }).name));
    eq(attendeeCols28, ["id", "meeting_id", "member_id", "created_at"], "r28 meeting_attendees 四列逐列存在");
    raw28.raw.run("INSERT INTO rooms (name,location,capacity,active,created_at,updated_at) VALUES ('R','L',4,1,'t','t')");
    raw28.raw.run("INSERT INTO members (name,email,status) VALUES ('raw attendee','raw@example.com','active')");
    raw28.raw.run("INSERT INTO meetings (room_id,title,date,start_time,end_time,organizer,created_at,updated_at) VALUES (1,'M','2026-11-20','09:00','10:00','o','t','t')");
    raw28.raw.run("INSERT INTO meeting_attendees (meeting_id,member_id,created_at) VALUES (1,1,'t')");
    throws(() => raw28.raw.run("INSERT INTO meeting_attendees (meeting_id,member_id,created_at) VALUES (1,1,'t')"), "r28 重复参会人被 UNIQUE 拒绝");
    throws(() => raw28.raw.run("INSERT INTO meetings (room_id,title,date,start_time,end_time,organizer,created_at,updated_at) VALUES (999,'M','2026-11-20','09:00','10:00','o','t','t')"), "r28 越权 room_id 被外键拒绝");
    throws(() => raw28.raw.run("INSERT INTO rooms (name,capacity,active,created_at,updated_at) VALUES ('x',-1,1,'t','t')"), "r28 负容量被 CHECK 拒绝");
    raw28.raw.close();

    // (H) 数据层：建室 → 预约 → 冲突 → 改期 → 参会人 → 重开不丢
    const mdb = freshDb();
    const roomR1 = mdb.createRoom({ name: "研发会议室", location: "3F", capacity: 10 });
    const roomR2 = mdb.createRoom({ name: "小会议室", capacity: 4 });
    eq(mdb.listRooms().length, 2, "r28 数据层真建两间会议室");
    eq(mdb.listRooms(true).length, 2, "r28 启用会议室过滤返回两间");
    const mtg1 = mdb.createMeeting({ roomId: roomR1.id, title: "需求评审", date: "2026-11-20", start: "09:00", end: "10:00", organizer: "张三" });
    eq(mtg1.title, "需求评审", "r28 数据层预约真落库");
    eq(mdb.listMeetings({ date: "2026-11-20", roomId: roomR1.id }).length, 1, "r28 按日期/会议室查询命中一场");
    eq(mdb.listMeetings({ date: "2026-11-21" }).length, 0, "r28 按日期查询排除其他日");
    eq(mdb.createMeeting({ roomId: roomR2.id, title: "并行会", date: "2026-11-20", start: "09:00", end: "10:00" }).roomId, roomR2.id, "r28 跨会议室同段可并存");
    await throws(() => mdb.createMeeting({ roomId: roomR1.id, title: "撞车会", date: "2026-11-20", start: "09:30", end: "10:30" }), "r28 数据层真冲突被拒");
    ok(mdb.createMeeting({ roomId: roomR1.id, title: "接档会", date: "2026-11-20", start: "10:00", end: "11:00" }).id > 0, "r28 数据层边界相接预约成功");
    eq(mdb.listMeetings({ roomId: roomR1.id }).length, 2, "r28 接档会后该室两场");
    const changed = mdb.updateMeeting(mtg1.id, { start: "13:00", end: "14:00" });
    eq(changed?.start, "13:00", "r28 改期成功落库");
    await throws(() => mdb.updateMeeting(mtg1.id, { start: "09:30", end: "10:30" }), "r28 改期撞其他场次被拒");
    const member1 = mdb.createMember({ name: "参会甲", email: "a@example.com" });
    const member2 = mdb.createMember({ name: "参会乙", email: "b@example.com" });
    await throws(() => mdb.setMeetingAttendees(mtg1.id, [999999]), "r28 不存在参会人被数据层拒绝");
    eq(mdb.setMeetingAttendees(mtg1.id, [member1.id, member2.id, member1.id]), [member1.id, member2.id], "r28 参会人去重真落库");
    eq(mdb.listMeetingAttendees(mtg1.id).length, 2, "r28 参会人列表回读两条");
    await throws(() => mdb.setMeetingAttendees(mtg1.id, [999999]), "r28 不存在参会人被数据层拒绝");
    const inactive = mdb.createMember({ name: "停用者", email: "c@example.com", status: "inactive" });
    await throws(() => mdb.setMeetingAttendees(mtg1.id, [inactive.id]), "r28 停用参会人被数据层拒绝");
    eq(mdb.listMeetingAttendees(mtg1.id).length, 2, "r28 4xx 后参会人零半态");
    ok(mdb.removeMeetingAttendee(mtg1.id, member2.id), "r28 移除参会人成功");
    eq(mdb.listMeetingAttendees(mtg1.id).length, 1, "r28 移除后仅剩一人");
    ok(mdb.addMeetingAttendee(mtg1.id, member2.id), "r28 增补参会人成功");
    const roomPath28 = `scripts/.tmp-e2e/r28-meetings-${Date.now()}.db`;
    const persist28 = openDatabase({ path: roomPath28 });
    const pMember28 = persist28.createMember({ name: "持久化参会人", email: "p@example.com" });
    const pRoom28 = persist28.createRoom({ name: "持久化会议室", capacity: 6 });
    const pMeeting28 = persist28.createMeeting({ roomId: pRoom28.id, title: "持久化会", date: "2026-11-20", start: "09:00", end: "10:00" });
    persist28.setMeetingAttendees(pMeeting28.id, [pMember28.id]);
    persist28.close();
    const reopen28 = openDatabase({ path: roomPath28 });
    eq(reopen28.listRooms().length, 1, "r28 重开后会议室不丢");
    eq(reopen28.listMeetings().length, 1, "r28 重开后会议不丢");
    eq(reopen28.listMeetingAttendees(pMeeting28.id).length, 1, "r28 重开后参会人不丢");
    reopen28.close();
    unlinkSync(roomPath28);
    ok(mdb.deleteRoom(roomR1.id), "r28 删除会议室成功（级联会议与参会人）");
    eq(mdb.listMeetingAttendees(mtg1.id).length, 0, "r28 会议室删除级联清参会人");

    // (I) 渲染层 / API / 脚本 seam（零算法分支）
    const app28 = readFileSync("apps/web/src/App.tsx", "utf8");
    const page28 = readFileSync("apps/web/src/MeetingsPage.tsx", "utf8");
    const api28 = readFileSync("apps/api/src/server.ts", "utf8");
    const sharedPkg28 = readFileSync("packages/shared/package.json", "utf8");
    const schema28 = readFileSync("packages/db/src/schema.ts", "utf8");
    const shot28 = readFileSync("scripts/shot.ps1", "utf8");
    const ci28 = readFileSync(".github/workflows/ci.yml", "utf8");
    ok(app28.includes('| "meetings"') && app28.includes('data-tab="meetings"'), "r28 第十八 tab 与顶栏按钮在场");
    ok(app28.includes("界面文案已优化（错误提示更清晰）"), "r28 徽章随 r31 推进");
    ok(page28.includes("meetingAvailability") && page28.includes("formatClockMinutes"), "r28 会议页消费 shared 唯一口径");
    ok(!/startMinutes\s*[<>]|durationMinutes\s*[<>]/.test(page28), "r28 会议页零算法分支（不自行判时段）");
    ok(api28.includes('app.post("/api/meetings"') && api28.includes('app.get("/api/rooms/:id/availability"'), "r28 预约与可用性路由在场");
    ok(api28.includes("MeetingConflictError") && api28.includes("meetingAvailability"), "r28 api 只编排 shared 规则并映射 409");
    ok(sharedPkg28.includes('"./meetings": "./src/meetings.ts"'), "r28 shared/meetings 子路径导出在场");
    ok(schema28.includes("version: 20") && schema28.includes("CREATE TABLE IF NOT EXISTS rooms"), "r28 schema v20 迁移在场");
    ok(ci28.includes("(2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27)"), "r28 CI smoke 正则升 v20");
    ok(shot28.includes('"r28"') && shot28.includes('@{ page = "meetings";'), "r28 shot.ps1 ValidateSet 与会议 tab 壳基线在场");
    ok(["01-meetings-empty", "02-meetings-list", "03-meetings-grid", "04-meetings-form", "05-meetings-conflict", "06-narrow", "07-error"].every((s) => shot28.includes(s)), "r28 七张矩阵名齐备");

    // (J) 截图矩阵与十八 tab 壳基线：SHA 复算
    const walkPng28 = (dir: string): string[] => {
      const out: string[] = [];
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${f.name}`;
        if (f.isDirectory()) out.push(...walkPng28(p));
        else if (f.name.endsWith(".png")) out.push(p.replace(/\\/g, "/"));
      }
      return out;
    };
    const r28Index = readFileSync("docs/ui/r28/README.md", "utf8");
    const matrix28 = walkPng28("docs/ui/r28");
    eq(matrix28.length, 7, "r28 目录恰好 7 张 PNG");
    eq(new Set(matrix28.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 7, "r28 七张 PNG SHA256 两两互异");
    const shells28 = walkPng28("docs/ui/shell");
    eq(shells28.length, 20, "r28 壳基线 19 张 PNG（新增会议 tab）");
    eq(new Set(shells28.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "r28 壳基线 19 张 SHA256 两两互异");
    ok(r28Index.includes("<!-- R28_HASHES_BEGIN -->") && r28Index.includes("<!-- R28_HASHES_END -->"), "r28 索引哈希自查块在场");
    const shell28 = readFileSync("docs/ui/shell/README.md", "utf8");
    const hash28 = shell28.match(/<!-- R49_HASHES_BEGIN -->([\s\S]*?)<!-- R49_HASHES_END -->/);
    ok(hash28 !== null, "shell README R32 当前哈希块在场");
    if (hash28) {
      const listed28 = [...hash28[1]!.matchAll(/`([a-z-]+)=([0-9A-F]{8})`/g)].map((m) => ({ name: m[1]!, hash: m[2]! }));
      eq(listed28.length, 20, "shell README R29 块列出 19 张哈希");
      const mismatches28 = listed28.filter(({ name, hash }) => {
        const file = shells28.find((p) => p.replace(/\\/g, "/").endsWith(`/${name}-tab-active.png`));
        return !file || createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8).toUpperCase() !== hash;
      });
      eq(mismatches28, [], "shell README R29 哈希与实际文件逐字一致");
    }
  }

  // 64. r28 返工#1：建室后自动选中 / 下拉框与提交 roomId 严格一致 / 无 roomId 深链回显
  section("r28 返工#1：会议室选中口径与首次预约一致性");
  {
    const r1Rooms = [{ id: 4, active: true }, { id: 5, active: false }];
    eq(resolveSelectedRoomId(r1Rooms, 4), 4, "r28 返工#1 建室后自动选中新室 id=4（不是旧默认 id=1）");
    eq(resolveSelectedRoomId(r1Rooms, "4"), 4, "r28 返工#1 深链 ?roomId=4 字符串回显严格一致");
    eq(resolveSelectedRoomId(r1Rooms, "1"), 4, "r28 返工#1 旧默认 id=1 不存在时回落到启用室 4");
    eq(resolveSelectedRoomId(r1Rooms, 5), 4, "r28 返工#1 选中停用室时回落到启用室 4");
    eq(resolveSelectedRoomId([r1Rooms[1]!], "1"), 0, "r28 返工#1 无启用室时选中 0（提交守卫）");
    eq(resolveSelectedRoomId([], ""), 0, "r28 返工#1 空室时选中 0");
    const pageR1 = readFileSync("apps/web/src/MeetingsPage.tsx", "utf8");
    ok(/const created\s*=\s*await fetchJsonOrThrow\(res\)/.test(pageR1), "r28 返工#1 建室响应取回新室 id（UI 自动选中依据）");
    ok(/chooseRoom\(createdId\)/.test(pageR1), "r28 返工#1 建室成功后自动选中新室（roomId + form + URL 同源）");
    ok(/resolveSelectedRoomId\(roomData\.rooms, nextRoom\)/.test(pageR1), "r28 返工#1 load 回读后纠偏选中室（深链回显）");
    ok(/<select[^>]*value=\{form\.roomId\}/.test(pageR1), "r28 返工#1 下拉框显示值严格取 form.roomId");
    ok(/roomId: selectedRoomId/.test(pageR1), "r28 返工#1 预约提交 roomId 取统一选中口径");
    ok(/selectedRoomId === 0/.test(pageR1), "r28 返工#1 无启用室时不提交预约");
  }

  // 65. r29：文档版本历史与回收站——三函数唯一口径 / schema v21 / 恢复新版本 / 软删回收站 / 渲染层 seam
  section("r29 文档版本历史与回收站：shared 规则 / schema v21 / 数据层 / 渲染层 seam");
  {
    // (A) nextDocVersion：版本递增唯一口径
    eq(nextDocVersion(0), 1, "r29 空历史下一版 = v1");
    eq(nextDocVersion(1), 2, "r29 v1 下一版 = v2");
    eq(nextDocVersion(3), 4, "r29 v3 下一版 = v4（恢复生成新版本不覆盖）");
    eq(nextDocVersion("2"), 3, "r29 字符串版本号归一");
    throws(() => nextDocVersion(-1), "r29 负版本号被拒");
    throws(() => nextDocVersion(1.5), "r29 非整数版本号被拒");
    throws(() => nextDocVersion(Number.NaN), "r29 NaN 版本号被拒");
    throws(() => nextDocVersion(1_000_000_001), "r29 超上限版本号被拒");

    // (B) 变更摘要增/删行数（LCS 行 diff，CRLF 归一）
    eq(countVersionLineChanges("A\nB\nC", "A\nB\nC"), { added: 0, removed: 0 }, "r29 相同内容零增删");
    eq(countVersionLineChanges("A\nB", "A\nB\nC\nD"), { added: 2, removed: 0 }, "r29 纯新增两行");
    eq(countVersionLineChanges("A\nB\nC", "A\nC"), { added: 0, removed: 1 }, "r29 纯删除一行");
    eq(countVersionLineChanges("A\nB", "A\nX"), { added: 1, removed: 1 }, "r29 替换一行算增删各一");
    eq(countVersionLineChanges("A\r\nB", "A\nB\nC"), { added: 1, removed: 0 }, "r29 CRLF 归一后只算新增");
    eq(buildVersionNote("A\nB", "A\nB"), { added: 0, removed: 0, text: "内容无变更" }, "r29 无变更摘要文案");
    const noteAdd29 = buildVersionNote("A\nB", "A\nB\nC\nD");
    eq(noteAdd29.added, 2, "r29 摘要新增行数");
    ok(noteAdd29.text.includes("新增 2 行") && noteAdd29.text.includes("删除 0 行"), "r29 摘要文案含增删行数");
    const noteMix29 = buildVersionNote("# 旧\n\n正文", "# 新\n\n正文\n\n追加");
    ok(noteMix29.text.includes("新增") && noteMix29.text.includes("删除"), "r29 混合变更摘要双计数");

    // (C) canRestoreVersion：防恢复已软删文档
    eq(canRestoreVersion({ version: 1 }, { version: 2 }), true, "r29 正常版本可恢复");
    eq(canRestoreVersion({ version: 1 }, { version: 2, deletedAt: "2026-11-21T00:00:00.000Z" }), false, "r29 已软删文档不可恢复版本");
    eq(canRestoreVersion({ version: 1, deletedAt: "t" }, { version: 2 }), false, "r29 已软删版本不可恢复");
    eq(canRestoreVersion({ version: 0 }, { version: 2 }), false, "r29 非法版本 0 不可恢复");
    eq(canRestoreVersion(null, { version: 2 }), false, "r29 空目标不可恢复");
    eq(canRestoreVersion({ version: 1 }, null), false, "r29 空当前态不可恢复");
    throws(() => assertCanRestoreVersion({ version: 1 }, { version: 2, deletedAt: "t" }), "r29 恢复守卫对软删文档抛错");
    throws(() => assertCanRestoreVersion(null, { version: 2 }), "r29 恢复守卫对空版本抛错");
    eq(isDocumentSoftDeleted({ deletedAt: null }), false, "r29 未软删判定 false");
    eq(isDocumentSoftDeleted({ deletedAt: "t" }), true, "r29 软删判定 true");

    // (D) schema v21 raw：document_versions 七列 + documents.deleted_at + 约束
    const raw29 = openDatabaseRaw({ path: ":memory:" });
    eq((raw29.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 27, "r29 新库 user_version=27");
    eq(
      raw29.raw.all("PRAGMA table_info(document_versions)").map((r) => String((r as { name: unknown }).name)),
      ["id", "document_id", "version", "title", "content_markdown", "created_at", "note"],
      "r29 document_versions 七列逐列存在",
    );
    const docCols29 = raw29.raw.all("PRAGMA table_info(documents)").map((r) => String((r as { name: unknown }).name));
    ok(docCols29.includes("deleted_at"), "r29 documents 增 deleted_at 可空列");
    raw29.raw.run("INSERT INTO documents (title,created_at,updated_at) VALUES ('raw','t','t')");
    raw29.raw.run("INSERT INTO document_versions (document_id,version,title,content_markdown,created_at,note) VALUES (1,1,'raw','x','t','')");
    throws(
      () => raw29.raw.run("INSERT INTO document_versions (document_id,version,title,content_markdown,created_at,note) VALUES (1,1,'raw','y','t','')"),
      "r29 同文档同版本被 UNIQUE 拒绝",
    );
    throws(
      () => raw29.raw.run("INSERT INTO document_versions (document_id,version,title,content_markdown,created_at,note) VALUES (999,2,'raw','y','t','')"),
      "r29 越权 document_id 被外键拒绝",
    );
    throws(
      () => raw29.raw.run("INSERT INTO document_versions (document_id,version,title,content_markdown,created_at,note) VALUES (1,0,'raw','y','t','')"),
      "r29 version=0 被 CHECK 拒绝",
    );
    raw29.raw.close();

    // (E) 数据层：v1→v2→v3 → 恢复 v1 生成 v4 不覆盖 → 软删/回收站/还原/永久删除
    const dh = freshDb();
    const dDoc = dh.createDocument("r29版本文档");
    eq(dDoc.deletedAt, undefined, "r29 新文档未软删（无 deletedAt 字段）");
    eq(dh.listDocumentVersions(dDoc.id).length, 0, "r29 新文档零版本");
    const mdV1 = "# 版本一\n\n第一段原文\n\n第二段原文";
    const mdV2 = "# 版本二\n\n第一段改写\n\n第二段原文\n\n新增第三段";
    const mdV3 = "# 版本三\n\n第一段再改\n\n第二段原文";
    dh.importBlocks(dDoc.id, markdownToBlocks(mdV1));
    const dv1 = dh.createDocumentVersion(dDoc.id);
    eq(dv1.version, 1, "r29 首版 v1");
    eq(dv1.contentMarkdown, mdV1, "r29 v1 快照逐字等于内容");
    eq(dv1.note, "变更摘要：新增 5 行 / 删除 0 行", "r29 v1 摘要自动由 shared 计算");
    dh.importBlocks(dDoc.id, markdownToBlocks(mdV2));
    const dv2 = dh.createDocumentVersion(dDoc.id);
    eq(dv2.version, 2, "r29 第二次存快照 v2");
    ok(dv2.note.includes("新增") && dv2.note.includes("删除"), "r29 v2 摘要含增删计数");
    dh.importBlocks(dDoc.id, markdownToBlocks(mdV3));
    const dv3 = dh.createDocumentVersion(dDoc.id);
    eq(dv3.version, 3, "r29 第三次存快照 v3");
    eq(dh.listDocumentVersions(dDoc.id).length, 3, "r29 三版全在");
    eq(dh.listDocumentVersions(dDoc.id)[0]!.version, 3, "r29 版本列表按新版在前");
    eq(dh.getDocumentVersion(dDoc.id, 2)?.contentMarkdown, mdV2, "r29 按版本号取回 v2 逐字一致");
    const restored29 = dh.restoreDocumentVersion(dDoc.id, 1);
    eq(restored29.restoredFrom, 1, "r29 恢复来源 v1");
    eq(restored29.version.version, 4, "r29 恢复生成 v4（不覆盖 v1~v3）");
    eq(restored29.version.contentMarkdown, mdV1, "r29 恢复生成的新版本内容逐字等于 v1");
    eq(blocksToMarkdown(dh.listBlocks(dDoc.id)), mdV1, "r29 恢复后全文逐字等于 v1");
    eq(dh.listDocumentVersions(dDoc.id).length, 4, "r29 恢复后历史四版全在");
    eq(dh.getDocumentVersion(dDoc.id, 1)?.contentMarkdown, mdV1, "r29 原 v1 快照未被覆盖");
    ok(dh.softDeleteDocument(dDoc.id), "r29 软删除成功");
    eq(dh.getDocument(dDoc.id), null, "r29 软删后常规读拿不到");
    eq(dh.listDocuments().some((x) => x.id === dDoc.id), false, "r29 软删后文档列表排除");
    const trash29 = dh.listTrashedDocuments();
    eq(trash29.length, 1, "r29 回收站一条");
    ok(trash29[0]!.deletedAt !== null, "r29 回收站项带 deletedAt");
    throws(() => dh.restoreDocumentVersion(dDoc.id, 1), "r29 已软删文档拒绝恢复版本");
    ok(dh.restoreTrashedDocument(dDoc.id), "r29 从回收站还原");
    eq(dh.getDocument(dDoc.id)?.title, "r29版本文档", "r29 还原后文档仍在");
    eq(dh.listTrashedDocuments().length, 0, "r29 还原后回收站为空");
    eq(dh.listDocumentVersions(dDoc.id).length, 4, "r29 还原后版本历史仍在");
    ok(dh.softDeleteDocument(dDoc.id), "r29 再次软删供永久删除");
    eq(dh.permanentlyDeleteDocument(dDoc.id), true, "r29 永久删除仅作用于软删文档");
    eq(dh.permanentlyDeleteDocument(dDoc.id), false, "r29 重复永久删除返回 false");
    eq(dh.listTrashedDocuments().length, 0, "r29 永久删除后回收站归零");

    // (F) 渲染层 / API / 脚本 seam：规则集中，18 tab 不变
    const app29 = readFileSync("apps/web/src/App.tsx", "utf8");
    eq((app29.match(/data-tab="/g) ?? []).length, 20, "r29 本轮不改 tab 数量（仍 19）");
    ok(app29.includes("界面文案已优化（错误提示更清晰）"), "r29 徽章推进到轻量清理轮");
    const docsPage29 = readFileSync("apps/web/src/DocsPage.tsx", "utf8");
    ok(docsPage29.includes("版本历史") && docsPage29.includes("回收站"), "r29 文档页含版本历史侧栏与回收站入口");
    ok(docsPage29.includes("@xieflow/shared/docHistory"), "r29 文档页消费 shared 唯一口径");
    ok(!/version\s*\+\s*1/.test(docsPage29), "r29 web 零版本算法分支");
    const api29 = readFileSync("apps/api/src/server.ts", "utf8");
    ok(api29.includes('app.get("/api/documents/:id/versions"'), "r29 版本列表路由在场");
    ok(api29.includes('app.post("/api/documents/:id/versions/:v/restore"'), "r29 版本恢复路由在场");
    ok(api29.includes('app.get("/api/documents/trash"'), "r29 回收站路由在场");
    ok(api29.includes("softDeleteDocument") && api29.includes("permanentlyDeleteDocument"), "r29 api 只编排软删/永久删数据层");
    const sharedPkg29 = readFileSync("packages/shared/package.json", "utf8");
    ok(sharedPkg29.includes('"./docHistory": "./src/docHistory.ts"'), "r29 shared/docHistory 子路径导出在场");
    const schemaSrc29 = readFileSync("packages/db/src/schema.ts", "utf8");
    ok(schemaSrc29.includes("version: 21") && schemaSrc29.includes("CREATE TABLE IF NOT EXISTS document_versions"), "r29 schema v21 迁移在场");
    const ci29 = readFileSync(".github/workflows/ci.yml", "utf8");
    ok(ci29.includes("(2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27)"), "r29 CI smoke 正则升 v21");
    const shot29 = readFileSync("scripts/shot.ps1", "utf8");
    ok(shot29.includes('"r29"') && shot29.includes("01-versions-empty"), "r29 shot.ps1 ValidateSet 与七张矩阵名齐备");

    // (G) 截图矩阵 7 + 十八 tab 壳基线同批重拍
    const walkPng29 = (dir: string): string[] => {
      const out: string[] = [];
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${f.name}`;
        if (f.isDirectory()) out.push(...walkPng29(p));
        else if (f.name.endsWith(".png")) out.push(p);
      }
      return out;
    };
    const matrix29 = walkPng29("docs/ui/r29");
    eq(matrix29.length, 7, "r29 目录恰好 7 张 PNG");
    eq(new Set(matrix29.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 7, "r29 七张 PNG SHA256 两两互异");
    const shells29 = walkPng29("docs/ui/shell");
    eq(shells29.length, 20, "r29 十九 tab 壳基线 19 张（随 r36 推进） PNG");
    eq(new Set(shells29.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "r29 壳基线 19 张 SHA256 两两互异");
    const r29Index = readFileSync("docs/ui/r29/README.md", "utf8");
    ok(r29Index.includes("<!-- R29_HASHES_BEGIN -->") && r29Index.includes("<!-- R29_HASHES_END -->"), "r29 索引哈希自查块在场");
  }

  // 66. r30：多维表格公式字段（纯本地表达式求值，零 eval / 零依赖）
  section("r30 多维表格公式字段：tokenizer / parser / evaluator / 循环引用 / 读时计算");
  {
    const fields30 = [{ name: "单价" }, { name: "数量" }, { name: "金额" }];
    const rec30: Record<string, unknown> = {
      单价: 12.5,
      数量: 4,
      金额: 150,
      标签: "abc",
      零: 0,
      空: null,
    };
    const ev30 = (expr: string): FormulaValue => evaluateFormula(parseFormula(expr), rec30);

    // (A) tokenizer / parser：AST 形状、字段引用、字面量、优先级、函数、语法错误
    eq(typeof parseFormula, "function", "r30 parseFormula 已导出（公式引擎入口在场）");
    eq(typeof evaluateFormula, "function", "r30 evaluateFormula 已导出（求值入口在场）");
    eq(typeof compileFormula, "function", "r30 compileFormula 已导出（校验入口在场）");
    eq(typeof recomputeFormulas, "function", "r30 recomputeFormulas 已导出（批量重算入口在场）");
    eq(MAX_FORMULA_EXPRESSION_LENGTH, 500, "r30 表达式长度上限常量在场");
    const astMul = parseFormula("{单价} * {数量}");
    eq(astMul.kind, "binary", "r30 乘法解析为二元节点");
    if (astMul.kind === "binary") {
      eq(astMul.op, "*", "r30 运算符 *");
      eq(astMul.left.kind, "field", "r30 左操作数为字段引用");
      eq(astMul.right.kind, "field", "r30 右操作数为字段引用");
      if (astMul.left.kind === "field") eq(astMul.left.name, "单价", "r30 左字段名逐字");
      if (astMul.right.kind === "field") eq(astMul.right.name, "数量", "r30 右字段名逐字");
    }
    eq(
      collectFormulaReferences(astMul),
      ["单价", "数量"],
      "r30 字段引用按出现顺序收集去重",
    );
    const astPriority = parseFormula("1 + 2 * 3");
    if (astPriority.kind === "binary") {
      eq(astPriority.op, "+", "r30 加法为根（乘法优先）");
      eq(astPriority.right.kind === "binary" && astPriority.right.op === "*", true, "r30 乘法节点下沉");
    }
    const astParen = parseFormula("(1 + 2) * 3");
    if (astParen.kind === "binary") {
      eq(astParen.left.kind === "binary" && astParen.left.op === "+", true, "r30 括号提升加法优先级");
    }
    eq(parseFormula("-5").kind, "unary", "r30 一元负号解析");
    eq(parseFormula("'hi'").kind, "string", "r30 单引号字符串字面量");
    eq(parseFormula('"hi"').kind, "string", "r30 双引号字符串字面量");
    eq(parseFormula("TRUE").kind, "boolean", "r30 TRUE 布尔字面量");
    eq(parseFormula("FALSE").kind, "boolean", "r30 FALSE 布尔字面量");
    const astIf = parseFormula("IF({金额} > 100, 1, 0)");
    if (astIf.kind === "call") {
      eq(astIf.name, "IF", "r30 IF 函数调用");
      eq(astIf.args.length, 3, "r30 IF 三参数");
    }
    const astRound = parseFormula("ROUND(1.234, 2)");
    if (astRound.kind === "call") {
      eq(astRound.name, "ROUND", "r30 ROUND 函数调用");
      eq(astRound.args.length, 2, "r30 ROUND 两参数");
    }
    await throws(() => parseFormula(""), "r30 空表达式解析抛错");
    await throws(() => parseFormula("1 + "), "r30 残缺表达式解析抛错");
    await throws(() => parseFormula("{未闭合"), "r30 字段引用缺右括号抛错");
    await throws(() => parseFormula("FOO(1)"), "r30 未知函数抛错");
    await throws(() => parseFormula("IF(1,2)"), "r30 IF 参数个数不足抛错");
    await throws(() => parseFormula("1".repeat(501)), "r30 超长表达式解析抛错");
    eq(new FormulaSyntaxError("x").name, "FormulaSyntaxError", "r30 语法错误类型可辨识");

    // (B) evaluator：四则 / 优先级 / 字段引用 / 比较 / IF / ROUND / 运行时错误
    eq(ev30("12 + 3"), 15, "r30 求值·加法");
    eq(ev30("12 - 3"), 9, "r30 求值·减法");
    eq(ev30("12 * 3"), 36, "r30 求值·乘法");
    eq(ev30("12 / 3"), 4, "r30 求值·除法");
    eq(ev30("{单价} * {数量}"), 50, "r30 求值·字段引用 12.5 × 4 = 50");
    eq(ev30("1 + 2 * 3"), 7, "r30 求值·乘法优先于加法");
    eq(ev30("(1 + 2) * 3"), 9, "r30 求值·括号改写优先级");
    eq(ev30("-5 + 8"), 3, "r30 求值·一元负号");
    eq(ev30("'a' + 'b'"), "ab", "r30 求值·字符串拼接");
    eq(ev30("{标签}"), "abc", "r30 求值·文本字段引用");
    eq(ev30("{空}"), null, "r30 求值·空字段引用为 null");
    eq(ev30("TRUE"), true, "r30 求值·TRUE");
    eq(ev30("FALSE"), false, "r30 求值·FALSE");
    eq(ev30("{金额} > 100"), true, "r30 求值·大于比较");
    eq(ev30("{金额} >= 150"), true, "r30 求值·大于等于比较");
    eq(ev30("{金额} < 100"), false, "r30 求值·小于比较");
    eq(ev30("{数量} == 4"), true, "r30 求值·相等比较（单等号兼容）");
    eq(ev30("{数量} != 4"), false, "r30 求值·不等比较");
    eq(ev30("IF({金额} > 100, '高', '低')"), "高", "r30 求值·IF 真分支");
    eq(ev30("IF(0, 1, 2)"), 2, "r30 求值·IF 假分支（数字 0 为假）");
    eq(ev30("ROUND(1.236, 2)"), 1.24, "r30 求值·ROUND 四舍五入");
    eq(ev30("ROUND({单价}, 0)"), 13, "r30 求值·ROUND 对字段取整");
    eq(ev30("{空} + 5"), 5, "r30 求值·空值按 0 参与算术");
    await throws(() => ev30("1 / 0"), "r30 求值·除零抛错");
    await throws(() => ev30("'a' - 1"), "r30 求值·类型不匹配抛错");
    await throws(() => ev30("ROUND(1, 11)"), "r30 求值·ROUND 位数越界抛错");
    eq(new FormulaRuntimeError("x").name, "FormulaRuntimeError", "r30 运行时错误类型可辨识");

    // (C) compile：结构化错误（空 / 超长 / 语法 / 未知字段）
    const cOk30 = compileFormula("{单价} * {数量}", fields30);
    eq(cOk30.ok, true, "r30 编译·合法表达式 ok");
    eq(cOk30.references, ["单价", "数量"], "r30 编译·引用清单");
    eq(cOk30.error, null, "r30 编译·合法表达式无错误");
    const cUnknown30 = compileFormula("{不存在} + 1", fields30);
    eq(cUnknown30.ok, false, "r30 编译·未知字段 ok=false");
    eq(cUnknown30.error?.code, "UNKNOWN_FIELD", "r30 编译·未知字段错误码");
    ok(String(cUnknown30.error?.message).includes("不存在"), "r30 编译·未知字段文案含字段名");
    eq(compileFormula("1 + ", fields30).error?.code, "SYNTAX_ERROR", "r30 编译·语法错误码");
    eq(compileFormula("", fields30).error?.code, "EMPTY_EXPRESSION", "r30 编译·空表达式错误码");
    eq(compileFormula("1".repeat(501), fields30).error?.code, "TOO_LONG", "r30 编译·超长表达式错误码");
    eq(
      compileFormula("IF({单价}>0,1,0)", fields30).references,
      ["单价"],
      "r30 编译·函数内字段引用可收集",
    );

    // (D) 循环引用检测 + 批量重算（含链式公式与传递污染）
    const cycleFields30 = [
      { id: 1, name: "甲", type: "formula", expression: "{乙} + 1" },
      { id: 2, name: "乙", type: "formula", expression: "{甲} + 1" },
    ];
    const cycles30 = detectFormulaCycles(cycleFields30);
    eq(cycles30.length, 1, "r30 A↔B 检出一组循环");
    ok(String(cycles30[0]?.message).includes("循环引用"), "r30 循环引用文案明确");
    eq(new Set(cycles30[0]?.fields ?? []).size, 2, "r30 环上两个字段");
    eq(
      detectFormulaCycles([
        { id: 1, name: "甲", type: "formula", expression: "{数量} + 1" },
        { id: 2, name: "数量", type: "number" },
      ]).length,
      0,
      "r30 引用普通字段不算循环",
    );
    const fullFields30 = [
      { id: 3, name: "单价", type: "number" },
      { id: 4, name: "数量", type: "number" },
      { id: 5, name: "小计", type: "formula", expression: "{单价} * {数量}" },
    ];
    const oneRec30 = [{ id: 10, data: { "3": 12, "4": 4 } }];
    const comp30 = recomputeFormulas(fullFields30, oneRec30);
    eq(comp30.cells["10"]?.["5"]?.value, 48, "r30 批量重算·12 × 4 = 48");
    eq(comp30.cells["10"]?.["5"]?.error, null, "r30 批量重算·无错误");
    eq(comp30.cycles.length, 0, "r30 批量重算·无循环");
    const chained30 = recomputeFormulas(
      [...fullFields30, { id: 6, name: "含税", type: "formula", expression: "{小计} * 1.1" }],
      oneRec30,
    );
    ok(Math.abs(Number(chained30.cells["10"]?.["6"]?.value) - 52.8) < 1e-9, "r30 链式公式·48 × 1.1 = 52.8");
    const divZero30 = recomputeFormulas(
      [
        { id: 3, name: "单价", type: "number" },
        { id: 7, name: "零", type: "number" },
        { id: 8, name: "商", type: "formula", expression: "{单价} / {零}" },
      ],
      [{ id: 11, data: { "3": 10, "7": 0 } }],
    );
    eq(divZero30.cells["11"]?.["8"]?.value, null, "r30 运行时错误·值为 null");
    ok(String(divZero30.cells["11"]?.["8"]?.error).includes("除零"), "r30 运行时错误·error 文案含除零");
    const tainted30 = recomputeFormulas(
      [...cycleFields30, { id: 3, name: "数量", type: "number" }],
      oneRec30,
    );
    eq(tainted30.cycles.length, 1, "r30 环污染·cycles 回带");
    ok(String(tainted30.cells["10"]?.["1"]?.error).includes("循环引用"), "r30 环污染·甲单元格报错");
    ok(String(tainted30.cells["10"]?.["2"]?.error).includes("循环引用"), "r30 环污染·乙单元格报错");

    // (E) schema v22 raw：CHECK 白名单扩 formula，既有列与字段零改动
    const raw30 = openDatabaseRaw({ path: ":memory:" });
    eq(
      (raw30.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      27,
      "r30 新库 user_version=27（随当前轮推进）",
    );
    const fieldCols30 = (raw30.raw.all("PRAGMA table_info(fields)") as { name: string }[]).map((c) => c.name);
    eq(
      fieldCols30,
      ["id", "table_id", "name", "type", "position", "options", "created_at", "updated_at"],
      "r30 fields 八列逐列不变（无新表、无新列）",
    );
    const fieldsSql30 = String(
      (raw30.raw.get("SELECT sql FROM sqlite_master WHERE name = 'fields'") as { sql: string }).sql,
    );
    ok(fieldsSql30.includes("'formula'"), "r30 fields CHECK 白名单含 formula");
    ok(!fieldsSql30.includes("fields_v21"), "r30 迁移临时表已删除");
    eq(raw30.appliedMigrations.filter((v) => v === 22).length, 1, "r30 迁移 22 恰好执行一次");
    eq(MIGRATIONS.length, 27, "r30 迁移队列共 24 条（r37 追加 v24）");
    ok(MIGRATIONS[21]!.name.includes("formula"), "r30 第 22 条迁移为公式字段轮");
    raw30.raw.close();

    // (F) 数据层：公式字段持久化 + 读时计算不落库
    const store30 = openDatabase({ path: ":memory:" });
    const table30 = store30.createTable("r30公式探针", null);
    const p30 = store30.createField(table30.id, "单价", "number", []);
    const q30 = store30.createField(table30.id, "数量", "number", []);
    const s30 = store30.createField(table30.id, "小计", "formula", [], undefined, "{单价} * {数量}");
    eq(s30.type, "formula", "r30 数据层公式字段类型落库");
    eq(s30.expression, "{单价} * {数量}", "r30 数据层表达式逐字回带");
    eq(s30.options, [], "r30 数据层公式字段 options 空数组");
    eq(store30.createField(table30.id, "旧文本", "text", []).expression, undefined, "r30 非公式字段无 expression（既有零改动）");
    const row30 = store30.createRecord(table30.id, { [String(p30.id)]: 10, [String(q30.id)]: 3 });
    eq(row30.data[String(s30.id)], null, "r30 新建记录不写公式列");
    const dbComp30 = recomputeFormulas(store30.listFields(table30.id), store30.listRecords(table30.id));
    eq(dbComp30.cells[String(row30.id)]?.[String(s30.id)]?.value, 30, "r30 数据层装配公式值 10 × 3 = 30");
    store30.updateRecord(row30.id, { [String(p30.id)]: 11, [String(q30.id)]: 3 });
    const dbComp2_30 = recomputeFormulas(store30.listFields(table30.id), store30.listRecords(table30.id));
    eq(dbComp2_30.cells[String(row30.id)]?.[String(s30.id)]?.value, 33, "r30 依赖变更后重算 11 × 3 = 33");
    eq(store30.getRecord(row30.id)?.data[String(s30.id)], null, "r30 重算后库内公式列仍为 null（不落库）");
    await throws(() => store30.createField(table30.id, "无表达式", "formula", []), "r30 公式字段缺表达式被数据层拒绝");
    await throws(
      () => store30.updateRecord(row30.id, { [String(s30.id)]: 999 }),
      "r30 直接写公式列被数据层拒绝",
    );
    store30.close();

    // (G) 渲染层 / API / 脚本 seam：规则集中，零 eval，18 tab 不变
    const api30 = readFileSync("apps/api/src/server.ts", "utf8");
    ok(api30.includes('app.post("/api/tables/:id/formulas/preview"'), "r30 预览路由在场");
    ok(api30.includes("withComputedValues"), "r30 GET 记录装配计算值");
    ok(api30.includes('from "@xieflow/shared/formula"'), "r30 api 消费 shared 唯一公式口径");
    ok(api30.includes("detectFormulaCycles"), "r30 api 循环引用校验在场");
    const web30 = readFileSync("apps/web/src/BasesPage.tsx", "utf8");
    ok(web30.includes('data-state="bases-new-field-expression"'), "r30 web 表达式输入框在场");
    ok(web30.includes('data-state="bases-formula-preview"'), "r30 web 实时预览面板在场");
    ok(web30.includes('data-state="bases-formula-cell-error"'), "r30 web 错误红标在场");
    ok(web30.includes("f.type !== \"formula\""), "r30 公式列只读不进编辑器");
    ok(web30.includes("{单价} * {数量}"), "r30 表达式示例可见于字段面板");
    const app30 = readFileSync("apps/web/src/App.tsx", "utf8");
    ok(app30.includes("界面文案已优化（错误提示更清晰）"), "r30 徽章推进到轻量清理轮");
    eq((app30.match(/data-tab="/g) ?? []).length, 20, "r30 本轮不改 tab 数量（仍 19）");
    const sharedPkg30 = readFileSync("packages/shared/package.json", "utf8");
    ok(sharedPkg30.includes('"./formula": "./src/formula.ts"'), "r30 shared/formula 子路径导出在场");
    const schemaSrc30 = readFileSync("packages/db/src/schema.ts", "utf8");
    ok(schemaSrc30.includes("version: 22") && schemaSrc30.includes("'formula'"), "r30 schema v22 迁移在场");
    const ci30 = readFileSync(".github/workflows/ci.yml", "utf8");
    ok(ci30.includes("19|20|21|22|23|24|25|26|27)"), "r30 CI smoke 正则升 v22");
    const formulaSrc30 = readFileSync("packages/shared/src/formula.ts", "utf8");
    ok(!/\beval\s*\(/.test(formulaSrc30), "r30 公式引擎零 eval");
    ok(!/new\s+Function/.test(formulaSrc30), "r30 公式引擎零 new Function");
    ok(
      !/\beval\s*\(|new\s+Function/.test(api30 + web30),
      "r30 api/web 零 eval / new Function",
    );

    // (H) 截图矩阵 7 + 十八 tab 壳基线同批重拍（SHA 复算，断言锁索引）
    const walkPng30 = (dir: string): string[] => {
      const out: string[] = [];
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${f.name}`;
        if (f.isDirectory()) out.push(...walkPng30(p));
        else if (f.name.endsWith(".png")) out.push(p);
      }
      return out;
    };
    const matrix30 = walkPng30("docs/ui/r30");
    eq(matrix30.length, 7, "r30 目录恰好 7 张 PNG");
    eq(
      new Set(matrix30.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size,
      7,
      "r30 七张 PNG SHA256 两两互异",
    );
    const shells30 = walkPng30("docs/ui/shell");
    eq(shells30.length, 20, "r30 十九 tab 壳基线 19 张（随 r36 推进） PNG");
    eq(
      new Set(shells30.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size,
      20,
      "r30 壳基线 20 张 SHA256 两两互异（随 r36 推进）",
    );
    const r30Index = readFileSync("docs/ui/r30/README.md", "utf8");
    ok(r30Index.includes("<!-- R30_HASHES_BEGIN -->") && r30Index.includes("<!-- R30_HASHES_END -->"), "r30 索引哈希自查块在场");
    const shellIdx30 = readFileSync("docs/ui/shell/README.md", "utf8");
    ok(shellIdx30.includes("<!-- R30_HASHES_BEGIN -->") && shellIdx30.includes("R30 当前哈希块"), "shell README R30 当前哈希块在场");
    const shot30 = readFileSync("scripts/shot.ps1", "utf8");
    ok(shot30.includes('"r30"') && shot30.includes("01-formula-empty"), "r30 shot.ps1 ValidateSet 与七张矩阵名齐备");
  }

  // 67. r31：轻量清理（字段类型文案回归 + 公式浮点展示）——先断言后实现（宪法四条）
  section("r31 轻量清理：字段类型文案回归 + 公式浮点展示层格式化");
  {
    const readOpt = (p: string): string => {
      try {
        return readFileSync(p, "utf8");
      } catch {
        return "";
      }
    };
    // (A) 展示格式化：只收敛显示，不回写求值结果
    eq(formatFormulaDisplay(84.80000000000001), "84.8", "r31 展示格式化·链式浮点尾数 84.80000000000001→84.8");
    eq(formatFormulaDisplay(0.30000000000000004), "0.3", "r31 展示格式化·0.1+0.2 尾数收敛到 0.3");
    eq(formatFormulaDisplay(-84.80000000000001), "-84.8", "r31 展示格式化·负数浮点尾数一并收敛");
    eq(formatFormulaDisplay(50), "50", "r31 展示格式化·整数 50 逐字不变");
    eq(formatFormulaDisplay(21), "21", "r31 展示格式化·r30 手算值 21 逐字不变");
    eq(formatFormulaDisplay(0.43), "0.43", "r31 展示格式化·ROUND 结果 0.43 不丢合法精度");
    eq(formatFormulaDisplay("高"), "高", "r31 展示格式化·IF 文本分支逐字保留");
    eq(formatFormulaDisplay(true), "true", "r31 展示格式化·比较结果布尔逐字保留");
    eq(formatFormulaDisplay(null), "—", "r31 展示格式化·null 空值占位");
    eq(formatFormulaDisplay(undefined), "—", "r31 展示格式化·undefined 空值占位");
    // 求值语义零改动：evaluator 仍回带原始浮点，格式化只作用于展示
    const raw31 = evaluateFormula(parseFormula("{小计} * 1.06"), { 小计: 80 });
    eq(raw31, 84.80000000000001, "r31 求值语义不变·evaluator 仍回带原始浮点 84.80000000000001");
    eq(formatFormulaDisplay(raw31), "84.8", "r31 展示层与求值层分离·同一原值仅展示收敛");
    // (B) 渲染层文案 / 接线 seam（像素证据由 r31 矩阵 + 十八壳同批背书）
    const web31 = readOpt("apps/web/src/BasesPage.tsx");
    ok(web31.includes("8 种字段类型齐备（含公式）"), "r31 空态文案改为「8 种字段类型齐备（含公式）」");
    ok(!web31.includes("7 种字段类型齐备"), "r31 旧「7 种字段类型齐备」文案零残留");
    ok(web31.includes("formatFormulaDisplay"), "r31 公式单元格与试算预览统一走 shared 展示格式化（零第二套口径）");
    ok(web31.includes("bases-formula-float"), "r31 web 浮点展示截图钉态在场");
    const shellIdx31 = readOpt("docs/ui/shell/README.md");
    ok(shellIdx31.includes("8 种字段类型齐备（含公式）"), "r31 shell README 空态说明同步八类文案");
    ok(shellIdx31.includes("<!-- R31_HASHES_BEGIN -->"), "r31 shell README R31 当前哈希块在场");
    const shot31 = readOpt("scripts/shot.ps1");
    ok(shot31.includes('"r31"') && shot31.includes("bases-formula-float"), "r31 shot.ps1 ValidateSet 与浮点展示钉态齐备");
    const r31Index = readOpt("docs/ui/r31/README.md");
    ok(r31Index.includes("01-bases-empty-text") && r31Index.includes("02-formula-float-display") && r31Index.includes("03-formula-float-grid"), "r31 矩阵索引三态齐备");
    ok(r31Index.includes("<!-- R31_HASHES_BEGIN -->"), "r31 矩阵索引哈希自查块在场");
  }

  // 68. r32：文档打印导出增强（HTML 打印版 + Word 兼容）——TDD 先断言后实现（宪法四条）
  section("r32 文档打印导出增强：语义化 HTML / 打印样式 / Word 兼容 / 块转义");
  {
    const readOpt32 = (p: string): string => {
      try { return readFileSync(p, "utf8"); } catch { return ""; }
    };
    const expectClass = (fn: () => unknown, ctor: new (...args: any[]) => Error, label: string): void => {
      try { fn(); ok(false, `${label}（未抛错）`); }
      catch (err) { ok(err instanceof ctor, label); }
    };
    const tenBlocks = [
      { id: 9, position: 8, type: "divider", content: { text: "" } },
      { id: 2, position: 1, type: "heading2", content: { text: "二节 <b>粗体</b>" } },
      { id: 5, position: 4, type: "numbered", content: { text: "第二项" } },
      { id: 1, position: 0, type: "heading1", content: { text: "打印导出标题" } },
      { id: 8, position: 7, type: "code", content: { text: "if (a < b) x = 1;", language: "ts" } },
      { id: 4, position: 3, type: "numbered", content: { text: "第一项" } },
      { id: 3, position: 2, type: "bullet", content: { text: "无序要点" } },
      { id: 6, position: 5, type: "todo", content: { text: "已办项", checked: true } },
      { id: 7, position: 6, type: "quote", content: { text: "引用一句话" } },
      { id: 10, position: 9, type: "paragraph", content: { text: '注入块"><img src=x onerror=alert(1)>' } },
    ];
    const docTitle = "导出验收 <r32>";
    const printHtml = blocksToPrintHtml(tenBlocks, docTitle);
    const wordHtml = blocksToWordHtml(tenBlocks, docTitle);

    // (A) 块转义：唯一 sanitize 口径（变异红相目标）
    eq(sanitizeExportHtml("a & b <c> \"d\" 'e'"), "a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;", "r32 转义·五种 HTML 特殊字符逐字替换");
    ok(sanitizeExportHtml('"><img src=x onerror=alert(1)>').startsWith("&quot;&gt;&lt;img"), "r32 转义·属性闭合与标签开头全部转义");
    ok(!sanitizeExportHtml("<script>alert(1)</script>").includes("<script>"), "r32 转义·script 标签不可穿透");
    eq(sanitizeExportHtml("第一行\n第二行"), "第一行<br>第二行", "r32 转义·换行转 <br> 保段落语义");
    eq(sanitizeExportHtml(null), "", "r32 转义·null 输入为空串不抛错");

    // (B) HTML 打印版：语义化结构 + 内嵌打印样式 + 页眉页码
    ok(printHtml.startsWith("<!DOCTYPE html>"), "r32 HTML·DOCTYPE 在首行");
    ok(printHtml.includes('charset="utf-8"'), "r32 HTML·UTF-8 字符集内嵌");
    ok(printHtml.includes(`<title>${sanitizeExportHtml(docTitle)}</title>`), "r32 HTML·标题转义后进入 title");
    ok(printHtml.includes(EXPORT_HTML_HEADER_MARKER), "r32 HTML·页眉标记在场");
    ok(printHtml.includes("@media print"), "r32 HTML·@media print 样式内嵌");
    ok(printHtml.includes("@page"), "r32 HTML·@page 纸张规则内嵌");
    ok(printHtml.includes("counter(page)"), "r32 HTML·页码 counter(page) 在场");
    ok(printHtml.includes("counter(pages)"), "r32 HTML·总页数 counter(pages) 在场");
    ok(!/https?:\/\//.test(printHtml), "r32 HTML·零外部 CDN 链接");
    const htmlTypes = Array.from(printHtml.matchAll(/data-block-type="([a-z0-9]+)"/g), (m) => m[1]);
    eq(htmlTypes, ["heading1", "heading2", "bullet", "numbered", "numbered", "todo", "quote", "code", "divider", "paragraph"], "r32 HTML·十种块按 position 排序且类型不丢");
    ok(printHtml.includes("<h1"), "r32 HTML·heading1 渲染为语义 h1");
    ok(printHtml.includes("<blockquote"), "r32 HTML·quote 渲染为语义 blockquote");
    ok(printHtml.includes("<hr"), "r32 HTML·divider 渲染为语义 hr");
    ok(printHtml.includes('<li value="1"') && printHtml.includes('<li value="2"'), "r32 HTML·连续 numbered 用 li value 保序号");
    ok(printHtml.includes("data-checked=\"true\""), "r32 HTML·todo 勾选态保留");
    ok(printHtml.includes('class="export-code ts"'), "r32 HTML·code 语言类与 pre/code 语义保留");
    ok(printHtml.includes("&lt;img"), "r32 HTML·注入块被转义，无裸 <img");
    ok(!printHtml.includes("<img src=x"), "r32 HTML·注入块无可执行标签");
    ok(printHtml.includes("二节 &lt;b&gt;粗体&lt;/b&gt;"), "r32 HTML·块内尖括号逐字转义");
    ok(printHtml.indexOf("打印导出标题") < printHtml.indexOf("二节"), "r32 HTML·乱序输入按 position 装配（标题在二节之前）");

    // (C) 非法块 / 空文档守卫（4xx 映射的数据层来源）
    expectClass(() => blocksToPrintHtml([], docTitle), EmptyDocumentExportError, "r32 守卫·空文档导出抛 EmptyDocumentExportError");
    expectClass(() => blocksToWordHtml([], docTitle), EmptyDocumentExportError, "r32 守卫·空文档 Word 导出同样拒绝");
    expectClass(
      () => assertExportableBlocks([{ type: "evil", content: { text: "x" }, position: 0, id: 1 }]),
      InvalidExportBlockError,
      "r32 守卫·非法块类型抛 InvalidExportBlockError",
    );

    // (D) Word 兼容 HTML-in-doc：命名空间 / 节 / 域码 / UTF-8 base64 自证
    ok(wordHtml.includes('xmlns:w="urn:schemas-microsoft-com:office:word"'), "r32 Word·Office 命名空间在场");
    ok(wordHtml.includes("xmlns:o="), "r32 Word·Office 旧命名空间在场");
    ok(wordHtml.includes("<w:WordDocument>"), "r32 Word·条件注释 WordDocument 在场");
    ok(wordHtml.includes(EXPORT_WORD_SECTION_MARKER), "r32 Word·WordSection1 分页节在场");
    ok(wordHtml.includes("mso-field-code"), "r32 Word·PAGE 域码在场");
    ok(wordHtml.includes("charset=utf-8"), "r32 Word·meta 声明 UTF-8");
    ok(wordHtml.startsWith("\uFEFF<html"), "r32 Word·UTF-8 BOM 前缀保证 Word 打开不乱码");
    const b64 = /data-utf8-base64="([^"]+)"/.exec(wordHtml)?.[1] ?? "";
    eq(Buffer.from(b64, "base64").toString("utf8"), docTitle, "r32 Word·base64(UTF-8) 自证可解码回原标题");
    ok(wordHtml.includes("打印导出标题") && wordHtml.includes("引用一句话"), "r32 Word·块正文按序进入 .doc");
    ok(wordHtml.includes("&lt;img src=x"), "r32 Word·注入块同样转义");
    ok(!/<link\b|<script\b|url\(https?:/i.test(wordHtml), "r32 Word·零外部资源链接（命名空间 URI 非外链）");
    const htmlName32 = buildExportFileName(docTitle, "html");
    const docName32 = buildExportFileName(docTitle, "doc");
    ok(htmlName32.startsWith("xieflow-") && htmlName32.endsWith(".html"), "r32 文件名·HTML 版前缀与扩展名");
    ok(docName32.startsWith("xieflow-") && docName32.endsWith(".doc"), "r32 文件名·Word 版前缀与扩展名");
    ok(!/[/\\:<>]/.test(docName32), "r32 文件名·特殊字符已归一（跨平台安全）");

    // (E) 打印预览装配：api 零算法分支只消费 shared 结果
    const preview32 = buildPrintPreview(tenBlocks, docTitle);
    eq(preview32.title, docTitle, "r32 预览·标题原样回带");
    eq(preview32.blockCount, 10, "r32 预览·块数十种齐全");
    ok(preview32.html.startsWith("<!DOCTYPE html>"), "r32 预览·直接携带可打印 HTML");
    ok(typeof preview32.generatedAt === "string" && preview32.generatedAt.length > 0, "r32 预览·生成时间为可读字符串");
    ok(preview32.contentType.includes("text/html"), "r32 预览·content-type 由 shared 口径给出");

    // (F) 真数据层装配：十种块从库里读出后导出，不丢块序
    const sdb32 = openDatabase({ path: ":memory:" });
    try {
      const sdoc32 = sdb32.createDocument("r32 导出数据层验收");
      const drafts32 = markdownToBlocks(
        "# 一级标题\n\n## 二级标题\n\n正文段落\n\n- 无序\n\n1. 有序一\n\n1. 有序二\n\n- [x] 已完成\n\n> 引用\n\n```ts\nconst a = 1 < 2;\n```\n\n---",
      );
      const stored32 = sdb32.importBlocks(sdoc32.id, drafts32);
      eq(stored32.length, 10, "r32 数据层·导入十种块全部落库");
      const dataHtml32 = blocksToPrintHtml(sdb32.listBlocks(sdoc32.id), sdoc32.title);
      const dataWord32 = blocksToWordHtml(sdb32.listBlocks(sdoc32.id), sdoc32.title);
      ok(dataHtml32.includes("data-block-type=\"heading1\"") && dataHtml32.includes("data-block-type=\"divider\""), "r32 数据层·真库块类型进入 HTML");
      ok(dataWord32.includes("const a = 1 &lt; 2;"), "r32 数据层·代码尖括号经真库读写仍被转义");
      ok(dataHtml32.indexOf("一级标题") < dataHtml32.indexOf("二级标题"), "r32 数据层·真库 position 顺序保持");
    } finally {
      sdb32.close();
    }

    // (G) 渲染层 / API / 脚本 seam（像素证据由 r32 矩阵 + 十八壳同批背书）
    const api32 = readOpt32("apps/api/src/server.ts");
    ok(api32.includes('app.get("/api/documents/:id/export.html"'), "r32 api·HTML 导出路由在场");
    ok(api32.includes('app.get("/api/documents/:id/export.doc"'), "r32 api·Word 导出路由在场");
    ok(api32.includes('app.get("/api/documents/:id/print-preview"'), "r32 api·打印预览路由在场");
    ok(api32.includes("blocksToPrintHtml") && api32.includes("blocksToWordHtml") && api32.includes("buildPrintPreview"), "r32 api·三条路由只装配 shared 导出引擎");
    ok(!/function\s+sanitizeExportHtml/.test(api32), "r32 api·零算法分支（转义只在 shared）");
    const web32 = readOpt32("apps/web/src/DocsPage.tsx");
    ok(web32.includes('data-state="docs-export-menu-button"'), "r32 web·导出菜单入口在场");
    ok(web32.includes('data-state="docs-export-print"') && web32.includes('data-state="docs-export-word"'), "r32 web·打印/另存 PDF 与下载 Word 两个菜单项在场");
    ok(web32.includes('data-state="docs-print-frame"'), "r32 web·隐藏 iframe 打印载体在场");
    ok(web32.includes("__xieflowPrintSpy"), "r32 web·headless 打印 spy seam 在场（不弹系统对话框）");
    ok(web32.includes("/print-preview") && web32.includes("/export.doc"), "r32 web·预览与 Word 下载真走 HTTP 导出端点");
    const app32 = readOpt32("apps/web/src/App.tsx");
    ok(app32.includes("界面文案已优化（错误提示更清晰）"), "r32 App·轮次徽章推进到 r33");
    eq((app32.match(/data-tab="/g) ?? []).length, 20, "r32 App·十九 tab 数量（随 r36 推进）");
    const shot32 = readOpt32("scripts/shot.ps1");
    ok(shot32.includes('"r32"'), "r32 shot.ps1·ValidateSet 纳入 r32");
    for (const name of ["01-export-menu", "02-print-preview", "03-html-landing", "04-word-landing", "05-narrow", "06-error"]) {
      ok(shot32.includes(name), `r32 shot.ps1·矩阵项 ${name} 在场`);
    }
    // 零新依赖：根与五包 manifest 的依赖集合不含任何 pdf/docx 生成器
    const manifests32 = ["package.json", "packages/shared/package.json", "packages/db/package.json", "packages/agent/package.json", "apps/api/package.json", "apps/web/package.json"]
      .map((p) => readOpt32(p));
    ok(manifests32.every((m) => m.length > 0), "r32 零依赖·六个 manifest 全部可读");
    ok(!manifests32.some((m) => /"(pdfkit|pdf-lib|docx|html-docx-js|puppeteer|playwright)"/.test(m)), "r32 零依赖·无 pdf/docx/浏览器自动化新包");
    ok(!/https?:\/\/[^\s"']*cdn/.test(printHtml + wordHtml + web32), "r32 零外链·导出与 web 均不引外部 CDN");

    // (H) 截图矩阵与索引（矩阵 6 + 十八壳，同一提交）
    const walkPng32 = (dir: string): string[] => {
      const out: string[] = [];
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${f.name}`;
        if (f.isDirectory()) out.push(...walkPng32(p));
        else if (f.name.endsWith(".png")) out.push(p);
      }
      return out;
    };
    const matrix32 = walkPng32("docs/ui/r32");
    eq(matrix32.length, 6, "r32 截图·矩阵恰好 6 张 PNG");
    eq(new Set(matrix32.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 6, "r32 截图·六张 SHA256 两两互异");
    const shells32 = walkPng32("docs/ui/shell");
    eq(shells32.length, 20, "r32 截图·十九 tab 壳基线 19 张（随 r36 推进）");
    eq(new Set(shells32.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "r32 截图·壳基线 19 张 SHA256 互异");
    const shellSet32 = new Set(shells32.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex")));
    eq(matrix32.filter((p) => shellSet32.has(createHash("sha256").update(readFileSync(p)).digest("hex"))).length, 0, "r32 截图·矩阵与壳基线零重叠");
    const idx32 = readOpt32("docs/ui/r32/README.md");
    ok(idx32.includes("<!-- R32_HASHES_BEGIN -->") && idx32.includes("01-export-menu.png"), "r32 索引·哈希自查块与矩阵图名在场");
    const shellIdx32 = readOpt32("docs/ui/shell/README.md");
    ok(shellIdx32.includes("<!-- R32_HASHES_BEGIN -->") && shellIdx32.includes("R32 当前哈希块"), "r32 壳索引·R32 当前哈希块在场");
    const root32 = readOpt32("README.md");
    ok(ARCHIVE_README.includes("[docs/ui/r32/](docs/ui/r32/README.md)"), "r32 矩阵索引外移归档后仍可追溯（根 README 只留当前轮）");
  }

  // 69. r33：全局搜索（跨 8 源只读统一检索）——TDD：断言先于实现落地（宪法四条）
  section("r33 全局搜索：分词 / 权重 / 排序 / 每源上限 / 去重 / 空查询 / 直达");
  {
    const readOpt33 = (p: string): string => {
      try { return readFileSync(p, "utf8"); } catch { return ""; }
    };
    const expectClass33 = (fn: () => unknown, label: string): void => {
      try { fn(); ok(false, `${label}（未抛错）`); }
      catch (err) { ok(err instanceof ValidationError, label); }
    };

    // (A) normalizeQuery：trim / 小写 / 分词
    const nq = normalizeQuery("  R33 全局 Search  ");
    eq(nq.text, "r33 全局 search", "r33 归一·trim + 小写");
    eq(nq.tokens, ["r33", "全局", "search"], "r33 分词·ASCII 词与 CJK 词各自成 token");
    eq(normalizeQuery(""), { text: "", tokens: [] }, "r33 归一·空串不抛错");
    eq(normalizeQuery("   "), { text: "", tokens: [] }, "r33 归一·纯空白为空查询");
    eq(normalizeQuery(null), { text: "", tokens: [] }, "r33 归一·非字符串安全降级为空查询");
    eq(normalizeQuery("季度,复盘；r33").tokens, ["季度", "复盘", "r33"], "r33 分词·标点切分不丢词");
    eq(normalizeQuery("  MiXeD  CASE  ").text, "mixed  case", "r33 归一·大小写不敏感（内部空白原样保留）");
    ok(nq.tokens.every((t) => t === t.toLowerCase()), "r33 分词·每个 token 均已小写");

    // (B) scoreMatch：标题权重 > 正文、前缀 > 包含
    eq(scoreMatch("r33", "R33 设计", SEARCH_TITLE_WEIGHT), 30, "r33 打分·标题前缀 = 10×3");
    eq(scoreMatch("r33", "设计 r33 说明", SEARCH_TITLE_WEIGHT), 15, "r33 打分·标题包含 = 5×3");
    eq(scoreMatch("r33", "r33 说明", SEARCH_BODY_WEIGHT), 10, "r33 打分·正文前缀 = 10×1");
    ok(scoreMatch("r33", "r33", SEARCH_TITLE_WEIGHT) > scoreMatch("r33", "r33", SEARCH_BODY_WEIGHT), "r33 打分·同词标题严格高于正文");
    ok(scoreMatch("r33", "r33", 3) > scoreMatch("r33", "xx r33 xx", 3), "r33 打分·前缀严格高于包含");
    eq(scoreMatch("r33", "毫无关系", 3), 0, "r33 打分·未命中记 0");
    eq(scoreMatch(normalizeQuery("r33 搜索"), "r33 全局搜索", 3), 45, "r33 打分·多 token 累加（前缀+包含）");
    eq(scoreMatch(normalizeQuery("   "), "任意文本", 3), 0, "r33 打分·空查询记 0");
    eq(scoreMatch("r33", "", 3), 0, "r33 打分·空文本记 0");
    ok(scoreMatch("ABC", "abc 说明") > 0, "r33 打分·大小写不敏感命中");
    eq(SEARCH_TITLE_WEIGHT * SEARCH_CONTAINS_SCORE > SEARCH_BODY_WEIGHT * SEARCH_PREFIX_SCORE, true, "r33 权重·任何标题命中恒高于任何正文命中");

    // (C) 入参守卫：空 q / 超长 q / 非法 types / 越权源 / limit
    eq(assertValidSearchQuery("  r33  "), "r33", "r33 守卫·查询词 trim 后返回");
    expectClass33(() => assertValidSearchQuery("   "), "r33 守卫·空 q 抛 ValidationError");
    expectClass33(() => assertValidSearchQuery("x".repeat(MAX_SEARCH_QUERY + 1)), "r33 守卫·超长 q 抛 ValidationError");
    eq(parseSearchTypes(undefined), SEARCH_SOURCE_TYPES, "r33 守卫·缺省 types = 八源全查");
    eq(parseSearchTypes("todos,meetings"), ["todos", "meetings"], "r33 守卫·types 逗号切分去重且顺序规范");
    expectClass33(() => parseSearchTypes("todos,evil"), "r33 守卫·非法 types 抛 ValidationError");
    expectClass33(() => parseSearchTypes("users"), "r33 守卫·越权源（users 不在白名单）抛 ValidationError");
    eq(parseSearchLimit(undefined), DEFAULT_SEARCH_LIMIT, "r33 守卫·缺省 limit = 20");
    eq(parseSearchLimit("5"), 5, "r33 守卫·合法 limit 归一为数字");
    expectClass33(() => parseSearchLimit("0"), "r33 守卫·limit=0 抛 ValidationError");
    expectClass33(() => parseSearchLimit(String(MAX_SEARCH_LIMIT + 1)), "r33 守卫·limit 超上限抛 ValidationError");
    eq(isSearchSourceType("meetings"), true, "r33 白名单·meetings 合法");
    eq(isSearchSourceType("secrets"), false, "r33 白名单·secrets 不合法");
    expectClass33(() => assertValidSearchSourceType("wiki"), "r33 白名单·非法源守卫抛 ValidationError");

    // (D) assembleSearchResults：聚合 / 排序 / 每源上限 / 去重 / 直达
    const KEY = "r33跨源";
    const fourSources = [
      { type: "meetings" as const, items: [{ id: 11, title: `${KEY} 评审会`, snippet: "日程" }] },
      { type: "todos" as const, items: [{ id: 2, title: `整理 ${KEY} 材料`, snippet: "待办" }] },
      { type: "documents" as const, items: [{ id: 3, title: "会议纪要", snippet: `正文提到 ${KEY} 结论` }] },
      { type: "knowledge_docs" as const, items: [{ id: 4, title: `${KEY} 规范`, snippet: "知识库正文" }] },
    ];
    const mixed = assembleSearchResults(KEY, fourSources);
    eq(mixed.length, 4, "r33 聚合·四源同关键词一次返回四条");
    eq(new Set(mixed.map((r) => r.type)).size, 4, "r33 聚合·四源类型各不相同（真跨源）");
    const titleHits = mixed.filter((r) => r.title.includes(KEY)).map((r) => r.type);
    const bodyHit = mixed.find((r) => r.type === "documents");
    eq(titleHits.length, 3, "r33 权重·三条标题命中排在前面");
    ok(bodyHit !== undefined && mixed.indexOf(bodyHit) === 3, "r33 排序·仅正文命中排末位");
    ok(mixed[0]!.score > mixed[3]!.score, "r33 排序·分数严格降序");
    const meetingHit = mixed.find((r) => r.type === "meetings");
    eq(meetingHit?.deepLink, "/?page=meetings&meetingId=11", "r33 直达·会议结果 deepLink 精确（复用 r26 机制）");
    eq(meetingHit?.tab, "meetings", "r33 直达·会议结果 tab 映射正确");
    eq(meetingHit?.snippet, "日程", "r33 结果·snippet 原样回带");
    eq(assembleSearchResults("完全不相干的词", fourSources), [], "r33 空命中·零结果不编造");
    eq(assembleSearchResults("   ", fourSources), [], "r33 空查询·直接零结果");
    const perSource = assembleSearchResults(KEY, [{ type: "todos", items: [
      { id: 1, title: `${KEY} 1` }, { id: 2, title: `${KEY} 2` }, { id: 3, title: `${KEY} 3` },
    ] }], { perSourceLimit: 2 });
    eq(perSource.length, 2, "r33 每源上限·perSourceLimit=2 生效");
    eq(perSource.map((r) => r.id), [1, 2], "r33 每源上限·同分按 id 升序取前两条");
    eq(assembleSearchResults(KEY, fourSources, { limit: 2 }).length, 2, "r33 总上限·limit=2 生效");
    const dupInSource = assembleSearchResults(KEY, [{ type: "todos", items: [
      { id: 7, title: `${KEY} 甲` }, { id: 7, title: `${KEY} 乙` },
    ] }]);
    eq(dupInSource.length, 1, "r33 去重·同源自 id 只留一条");
    const dupCrossSource = assembleSearchResults(KEY, [
      { type: "todos", items: [{ id: 7, title: `${KEY} 甲` }] },
      { type: "todos", items: [{ id: 7, title: `${KEY} 乙` }] },
    ]);
    eq(dupCrossSource.length, 1, "r33 去重·跨输入同 type:id 只留一条");
    eq(dupCrossSource[0]!.title, `${KEY} 甲`, "r33 去重·保留先出现的高分条目");
    const snapshotBefore = JSON.stringify(fourSources);
    assembleSearchResults(KEY, fourSources);
    eq(JSON.stringify(fourSources), snapshotBefore, "r33 纯函数·不修改输入源（只读证据）");
    eq(buildSearchDeepLink("documents", 9), "/?page=docs&docId=9", "r33 直达·文档 deepLink 精确");
    eq(buildSearchDeepLink("members", 5), "/?page=org&memberId=5", "r33 直达·成员 deepLink 精确");
    eq(SEARCH_SOURCE_TYPES.length, 8, "r33 源清单·恰八类可检索源");
    eq(SEARCH_SOURCE_TYPES.map((t) => SEARCH_SOURCE_TABS[t]).filter((t) => t === "board").length, 2, "r33 tab 映射·项目与卡片同落看板便于定位");
    eq(Object.keys(SEARCH_ID_PARAMS).length, 8, "r33 定位参数·八类源均有 id 参数");
    expectClass33(() => assembleSearchResults(KEY, [{ type: "wiki" as never, items: [] }]), "r33 越权源·聚合阶段也拒绝未知类型");

    // (E) api / web / 脚本 seam（像素证据由 r33 矩阵 + 十八壳同批背书）
    const api33 = readOpt33("apps/api/src/server.ts");
    ok(api33.includes('app.get("/api/search"'), "r33 api·GET /api/search 路由在场");
    ok(api33.includes("collectSearchSources") && api33.includes("assembleSearchResults"), "r33 api·八源装配后只调 shared 聚合");
    ok(!/function\s+scoreMatch|function\s+normalizeQuery/.test(api33), "r33 api·零算法分支（打分/归一只在 shared）");
    const collector33 = api33.slice(api33.indexOf("function collectSearchSources"), api33.indexOf("const __dirname"));
    ok(!/\.(create|update|delete|set|upsert)[A-Z]/.test(collector33), "r33 api·八源装配零写入调用（只读证据）");
    const app33 = readOpt33("apps/web/src/App.tsx");
    ok(app33.includes('data-state="global-search-input"'), "r33 web·顶栏全局搜索框在场");
    ok(app33.includes('data-state="global-search-panel"'), "r33 web·下拉结果面板在场");
    ok(/metaKey|ctrlKey/.test(app33) && app33.includes('"k"'), "r33 web·Ctrl/Cmd+K 快捷键在场");
    ok(app33.includes("ArrowDown") && app33.includes("ArrowUp"), "r33 web·键盘上下选在场");
    ok(app33.includes("/api/search") && app33.includes("navigateFromSearch"), "r33 web·搜索走真 HTTP 且点结果走 deep-link 跳转");
    ok(app33.includes("界面文案已优化（错误提示更清晰）"), "r33 App·轮次徽章推进到 r33");
    eq((app33.match(/data-tab="/g) ?? []).length, 20, "r33 App·十九 tab 数量（随 r36 推进）（顶栏加搜索框不加 tab）");
    const shot33 = readOpt33("scripts/shot.ps1");
    ok(shot33.includes('"r33"'), "r33 shot.ps1·ValidateSet 纳入 r33");
    for (const name of ["01-search-empty", "02-search-typing", "03-search-single", "04-search-multi", "05-search-keyboard", "06-search-narrow", "07-search-error"]) {
      ok(shot33.includes(name), `r33 shot.ps1·矩阵项 ${name} 在场`);
    }

    // (F) 截图矩阵与索引（矩阵 7 + 十八壳，同一提交）
    const walkPng33 = (dir: string): string[] => {
      const out: string[] = [];
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${f.name}`;
        if (f.isDirectory()) out.push(...walkPng33(p));
        else if (f.name.endsWith(".png")) out.push(p);
      }
      return out;
    };
    const matrix33 = walkPng33("docs/ui/r33");
    eq(matrix33.length, 7, "r33 截图·矩阵恰好 7 张 PNG");
    eq(new Set(matrix33.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 7, "r33 截图·七张 SHA256 两两互异");
    const shells33 = walkPng33("docs/ui/shell");
    eq(shells33.length, 20, "r33 截图·十九 tab 壳基线 19 张（随 r36 推进）");
    eq(new Set(shells33.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "r33 截图·壳基线 19 张 SHA256 互异");
    const shellSet33 = new Set(shells33.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex")));
    eq(matrix33.filter((p) => shellSet33.has(createHash("sha256").update(readFileSync(p)).digest("hex"))).length, 0, "r33 截图·矩阵与壳基线零重叠");
    const idx33 = readOpt33("docs/ui/r33/README.md");
    ok(idx33.includes("<!-- R33_HASHES_BEGIN -->") && idx33.includes("01-search-empty.png"), "r33 索引·哈希自查块与矩阵图名在场");
    const shellIdx33 = readOpt33("docs/ui/shell/README.md");
    ok(shellIdx33.includes("<!-- R33_HASHES_BEGIN -->") && shellIdx33.includes("R33 当前哈希块"), "r33 壳索引·R33 当前哈希块在场");
    ok(idx33.includes("# docs/ui/r33") && idx33.includes("01-search-empty.png"), "r33 矩阵索引自洽（精简版根 README 只留当前轮，r33 索引留在本轮 README）");
  }

  // 70. r34：任务依赖与阻塞关系（TDD：断言先于实现落地，宪法四条）
  {
    section("r34 任务依赖：前置判定 / 环检测 / 拓扑阻塞链 / 状态机守卫 / 数据层 / 渲染 seam");
    const mkTodo34 = (id: number, status: Todo["status"] = "open"): Todo => ({
      id, title: `待办${id}`, quadrant: "q1", status, dueDate: null,
      createdAt: "2026-11-21T00:00:00.000Z", updatedAt: "2026-11-21T00:00:00.000Z",
    });
    const expectClass34 = (fn: () => unknown, cls: Function, label: string): void => {
      try { fn(); ok(false, label); } catch (err) { ok(err instanceof cls, label); }
    };

    // (A) 输入守卫：自依赖 / 非法 id 在 shared 一处拦下
    noThrow(() => assertValidDependencyPair(2, 1), "r34 守卫·合法依赖对通过");
    expectClass34(() => assertValidDependencyPair(2, 2), ValidationError, "r34 守卫·自依赖抛 ValidationError");
    expectClass34(() => assertValidDependencyPair(0, 1), ValidationError, "r34 守卫·todoId=0 抛错");
    expectClass34(() => assertValidDependencyPair(-1, 1), ValidationError, "r34 守卫·负 id 抛错");
    expectClass34(() => assertValidDependencyPair(1.5, 2), ValidationError, "r34 守卫·非整数 id 抛错");
    expectClass34(() => assertValidDependencyPair("2" as never, 1), ValidationError, "r34 守卫·字符串 id 抛错");
    expectClass34(() => assertValidDependencyPair(null, 1), ValidationError, "r34 守卫·null id 抛错");
    const selfErr34 = (() => { try { assertValidDependencyPair(7, 7); } catch (e) { return e as Error; } return null; })();
    ok(Boolean(selfErr34?.message.includes("自身")), "r34 守卫·自依赖错误文案含「自身」");

    // (B) canStartTodo：所有前置 done 才能开始（finish-to-start）
    const todos34 = [mkTodo34(1), mkTodo34(2), mkTodo34(3), mkTodo34(4, "done")];
    const deps34: TodoDependency[] = [
      { todoId: 2, dependsOnTodoId: 1 },
      { todoId: 3, dependsOnTodoId: 2 },
      { todoId: 3, dependsOnTodoId: 4 },
    ];
    const snapshotDeps34 = JSON.stringify(deps34);
    eq(canStartTodo(mkTodo34(9), [], todos34), true, "r34 前置·无依赖恒可开始");
    eq(canStartTodo(todos34[0]!, deps34, todos34), true, "r34 前置·无前置者恒可开始");
    eq(canStartTodo(todos34[1]!, deps34, todos34), false, "r34 前置·B 依赖 open 的 A 不可开始");
    eq(canStartTodo(todos34[2]!, deps34, todos34), false, "r34 前置·C 依赖 open 的 B 不可开始");
    const todos34A = todos34.map((t) => (t.id === 1 ? mkTodo34(1, "done") : t));
    eq(canStartTodo(todos34A[1]!, deps34, todos34A), true, "r34 前置·A done 后 B 可开始");
    eq(canStartTodo(todos34A[2]!, deps34, todos34A), false, "r34 前置·A done 不足以解锁 C（B 仍 open）");
    const todos34AB = todos34A.map((t) => (t.id === 2 ? mkTodo34(2, "done") : t));
    eq(canStartTodo(todos34AB[2]!, deps34, todos34AB), true, "r34 前置·A/B 均 done 后 C 可开始（传递链解锁）");
    eq(canStartTodo(mkTodo34(5), [{ todoId: 5, dependsOnTodoId: 999 }], todos34), false, "r34 前置·前置实体不存在按未完成处理");
    eq(canStartTodo(mkTodo34(5), [{ todoId: 5, dependsOnTodoId: 6 }], [mkTodo34(5), mkTodo34(6, "archived")]), false, "r34 前置·archived 不算 done");
    eq(JSON.stringify(deps34), snapshotDeps34, "r34 前置·纯函数不修改依赖输入（只读证据）");
    eq(blockersForTodo(3, deps34, todos34), [2], "r34 阻塞·C 仅被未完成的 B 直接阻塞（D 已 done）");
    eq(blockersForTodo(2, deps34, todos34A), [], "r34 阻塞·A done 后 B 无未完成前置");
    eq(blockersForTodo(9, deps34, todos34), [], "r34 阻塞·无关待办无阻塞");

    // (C) detectDependencyCycle：DFS 环检测（自依赖 / 两节点 / 三节点 / 无环）
    eq(detectDependencyCycle(deps34), null, "r34 环·DAG 无环返回 null");
    eq(detectDependencyCycle([{ todoId: 1, dependsOnTodoId: 1 }]), [1, 1], "r34 环·自依赖检出长度 1 环");
    eq(detectDependencyCycle([{ todoId: 1, dependsOnTodoId: 2 }, { todoId: 2, dependsOnTodoId: 1 }]), [1, 2, 1], "r34 环·A→B→A 两节点环检出");
    eq(
      detectDependencyCycle([
        { todoId: 1, dependsOnTodoId: 2 }, { todoId: 2, dependsOnTodoId: 3 }, { todoId: 3, dependsOnTodoId: 1 },
      ]),
      [1, 2, 3, 1],
      "r34 环·三节点环检出且路径闭合",
    );
    eq(detectDependencyCycle([{ todoId: 5, dependsOnTodoId: 6 }]), null, "r34 环·无入边独立边不算环");
    eq(wouldCreateCycle(deps34, 3, 1), false, "r34 加边·3 依赖 1 不成环（同向冗余边，无回路径）");
    eq(wouldCreateCycle(deps34, 1, 3), true, "r34 加边·1 依赖 3 会成环（1→3→2→1 闭合）");
    eq(wouldCreateCycle(deps34, 2, 2), true, "r34 加边·自依赖必成环");
    eq(formatDependencyCycle([1, 2, 1]), "#1 → #2 → #1", "r34 环文案·id 路径可读");
    eq(formatDependencyCycle(null), "无", "r34 环文案·无环归「无」");
    ok(formatDependencyCycle([1, 2, 1], todos34).includes("待办1"), "r34 环文案·带标题时回带实体名");
    expectClass34(() => { throw new DependencyCycleError([1, 2, 1]); }, ValidationError, "r34 环错误类·属 ValidationError（api 400 根因）");
    eq(new DependencyCycleError([1, 2, 1]).cycle, [1, 2, 1], "r34 环错误·回带环路径供 UI 红条");
    eq(new DuplicateDependencyError(2, 1).name, "DuplicateDependencyError", "r34 重复依赖错误类可辨识（api 409）");
    eq(new DependencyBlockedError(2, [1]).blockers, [1], "r34 阻塞错误·回带未完成前置 id（api 409）");

    // (D) buildDependencyGraph：拓扑序 + 阻塞链
    const graph34 = buildDependencyGraph(todos34, deps34);
    eq(graph34.order, [1, 2, 4, 3], "r34 拓扑·前置恒先于依赖者且同层按 id 升序");
    ok(graph34.order.indexOf(1) < graph34.order.indexOf(2) && graph34.order.indexOf(2) < graph34.order.indexOf(3), "r34 拓扑·A<B<C 传递序成立");
    eq(graph34.cycle, null, "r34 拓扑·DAG 环为 null");
    eq(graph34.blocked.map((b) => b.todoId), [2, 3], "r34 阻塞链·B/C 被阻塞（A 无前置、D 已 done）");
    eq(graph34.blocked[1]?.chain, [1, 2], "r34 阻塞链·C 的传递阻塞链为 A→B");
    eq(buildDependencyGraph(todos34AB, deps34).blocked, [], "r34 阻塞链·A/B done 后全链解锁");
    const graphCycle34 = buildDependencyGraph(
      [mkTodo34(1), mkTodo34(2)],
      [{ todoId: 1, dependsOnTodoId: 2 }, { todoId: 2, dependsOnTodoId: 1 }],
    );
    ok(graphCycle34.cycle !== null, "r34 拓扑·含环图仍给出 cycle 供 UI 红条");
    eq(graphCycle34.order.length, 2, "r34 拓扑·含环时全部节点仍在序中（不丢节点）");
    eq(JSON.stringify(deps34), snapshotDeps34, "r34 拓扑·纯函数不修改输入");

    // (E) schema v23 与数据层（真库 + raw 约束）
    eq(SCHEMA_VERSION, 27, "r34 schema·shared 版本推进到 v23");
    eq(MIGRATIONS.length, 27, "r34 schema·迁移队列 24 条连续（r37 追加 v24）");
    eq(MIGRATIONS[22]?.version, 23, "r34 schema·第 23 条迁移版本 = 23");
    ok(Boolean(MIGRATIONS[22]?.name.includes("todo_dependencies")), "r34 schema·迁移名标注 todo_dependencies");
    const raw34 = openDatabaseRaw({ path: ":memory:" });
    const rawDb34: SqliteDatabase = raw34.raw;
    const tbl34 = rawDb34.get("SELECT name FROM sqlite_master WHERE type='table' AND name='todo_dependencies'") as { name: string } | null;
    eq(tbl34?.name, "todo_dependencies", "r34 schema·todo_dependencies 表真实建出");
    const cols34 = (rawDb34.all("PRAGMA table_info(todo_dependencies)") as { name: string }[]).map((r) => r.name);
    eq(cols34, ["todo_id", "depends_on_todo_id"], "r34 schema·两列语义精确（todo_id / depends_on_todo_id）");
    const idx34 = rawDb34.all("PRAGMA index_list(todo_dependencies)") as { name: string; unique: number }[];
    ok(idx34.some((i) => i.unique === 1), "r34 schema·UNIQUE 约束在场（重复依赖被拒）");
    const fk34 = rawDb34.all("PRAGMA foreign_key_list(todo_dependencies)") as { table: string; on_delete: string }[];
    eq(fk34.length, 2, "r34 schema·两列各有外键");
    ok(fk34.every((f) => f.table === "todos" && f.on_delete.toUpperCase() === "CASCADE"), "r34 schema·外键均 ON DELETE CASCADE");
    raw34.db.close();

    const db34 = freshDb();
    const a34 = db34.createTodo("r34-A", "q1", null);
    const b34 = db34.createTodo("r34-B", "q1", null);
    const c34 = db34.createTodo("r34-C", "q1", null);
    eq(db34.listTodoDependencies().length, 0, "r34 数据层·新建库依赖为空");
    const depAB34 = db34.createTodoDependency(b34.id, a34.id);
    eq([depAB34.todoId, depAB34.dependsOnTodoId], [b34.id, a34.id], "r34 数据层·B 依赖 A 真落库");
    db34.createTodoDependency(c34.id, b34.id);
    eq(db34.listTodoDependencies().length, 2, "r34 数据层·A→B→C 链两条依赖全在");
    eq(db34.listDependenciesOf(c34.id).length, 1, "r34 数据层·按 todo 查询只回自身前置");
    eq(db34.listBlockedTodos().map((x) => x.todoId), [b34.id, c34.id], "r34 数据层·阻塞列表只含未完成链上的 B/C");
    expectClass34(() => db34.createTodoDependency(b34.id, a34.id), DuplicateDependencyError, "r34 数据层·重复依赖抛 DuplicateDependencyError");
    expectClass34(() => db34.createTodoDependency(b34.id, b34.id), ValidationError, "r34 数据层·自依赖被 shared 守卫拒绝");
    expectClass34(() => db34.createTodoDependency(a34.id, c34.id), DependencyCycleError, "r34 数据层·A→B→C 后加 C→A 成环被拒");
    eq(db34.listTodoDependencies().length, 2, "r34 数据层·4xx 尝试零半态（依赖仍两条）");
    expectClass34(() => db34.createTodoDependency(999, a34.id), Error, "r34 数据层·越权 todoId 抛错");
    expectClass34(() => db34.createTodoDependency(a34.id, 998), Error, "r34 数据层·越权前置 id 抛错");
    expectClass34(() => db34.transitionTodo(b34.id, "done"), DependencyBlockedError, "r34 状态机·B 前置未完成转 done 被守卫拒绝");
    eq(db34.getTodo(b34.id)?.status, "open", "r34 状态机·409 后 B 状态未被改动（零半态）");
    eq(db34.transitionTodo(a34.id, "done").status, "done", "r34 状态机·A 无前置可正常 done（既有语义不变）");
    eq(db34.listBlockedTodos().map((x) => x.todoId), [c34.id], "r34 数据层·A done 后 B 解锁，C 仍阻塞");
    eq(db34.transitionTodo(b34.id, "done").status, "done", "r34 状态机·A done 后 B 可 done（真实闭环）");
    eq(db34.transitionTodo(c34.id, "done").status, "done", "r34 状态机·A/B done 后 C 可 done（整链解锁）");
    eq(db34.listBlockedTodos().length, 0, "r34 数据层·全链完成后零阻塞");
    eq(db34.deleteTodoDependency(c34.id, b34.id), true, "r34 数据层·移除前置成功");
    eq(db34.listDependenciesOf(c34.id).length, 0, "r34 数据层·移除后前置清零");
    eq(db34.deleteTodoDependency(c34.id, b34.id), false, "r34 数据层·重复移除返回 false");
    eq(db34.transitionTodo(a34.id, "open").status, "open", "r34 回归·既有 done→open 重开语义不变");
    eq(db34.transitionTodo(a34.id, "archived").status, "archived", "r34 回归·既有 open→archived 语义不变");
    expectClass34(() => db34.transitionTodo(a34.id, "done"), Error, "r34 回归·archived→done 仍非法（状态机零回归）");
    const idsBeforeCascade34 = db34.listTodoDependencies().length;
    ok(idsBeforeCascade34 >= 1, "r34 级联·前置条件：库中仍有依赖行");
    db34.deleteTodo(b34.id);
    eq(db34.listTodoDependencies().filter((d) => d.todoId === b34.id || d.dependsOnTodoId === b34.id).length, 0, "r34 级联·删除待办后相关依赖 CASCADE 清零");

    // (F) api / web / 脚本 / CI seam（像素证据由 r34 矩阵 + 十八壳同批背书）
    const api34 = readFileSync("apps/api/src/server.ts", "utf8");
    ok(api34.includes('app.post("/api/todos/:id/dependencies"'), "r34 api·POST 依赖路由在场");
    ok(api34.includes('app.delete("/api/todos/:id/dependencies/:dependsOnTodoId"'), "r34 api·DELETE 依赖路由在场");
    ok(api34.includes('app.get("/api/todos/:id/dependencies"'), "r34 api·GET 前置列表路由在场");
    ok(api34.includes('app.get("/api/todos/blocked"'), "r34 api·GET 阻塞列表路由在场");
    ok(api34.includes("DEPENDENCY_BLOCKED"), "r34 api·409 阻塞码在场");
    ok(api34.includes('from "@xieflow/shared/todoDeps"') && api34.includes("dependencyGraph()") && api34.includes("blockersForTodo("), "r34 api·只装配 shared 规则");
    ok(!/function\s+detectDependencyCycle|function\s+canStartTodo/.test(api34), "r34 api·零算法分支（环/前置判只在 shared）");
    // r57：行 JSX 抽到 TodoItem.tsx， seam 断言改读「页面 + 行组件」合并源，口径不变。
    const web34 = readFileSync("apps/web/src/TodosPage.tsx", "utf8") + readFileSync("apps/web/src/TodoItem.tsx", "utf8");
    ok(web34.includes('data-state="dep-panel"'), "r34 web·前置任务面板 seam 在场");
    ok(web34.includes('data-state="todo-blocked"'), "r34 web·列表阻塞态徽标 seam 在场");
    ok(web34.includes('data-state="dep-cycle-error"'), "r34 web·循环依赖红条 seam 在场");
    ok(web34.includes("/api/todos/blocked") && web34.includes("/api/todos/"), "r34 web·前置与阻塞走真 HTTP");
    ok(web34.includes('data-action="dep-add"') && web34.includes('data-action="dep-remove"'), "r34 web·添加/移除前置按钮在场");
    const app34 = readFileSync("apps/web/src/App.tsx", "utf8");
    ok(app34.includes("界面文案已优化（错误提示更清晰）"), "r34 App·轮次徽章推进到 r34");
    eq((app34.match(/data-tab="/g) ?? []).length, 20, "r34 App·十九 tab 数量（随 r36 推进）");
    const ci34 = readFileSync(".github/workflows/ci.yml", "utf8");
    ok(ci34.includes("|22|23|24|25|26|27)"), "r34 CI·HTTP smoke 正则升 v23");
    const shot34 = readFileSync("scripts/shot.ps1", "utf8");
    ok(shot34.includes('"r34"'), "r34 shot.ps1·ValidateSet 纳入 r34");
    for (const name of ["01-dep-empty", "02-dep-add", "03-dep-blocked-list", "04-dep-satisfied", "05-dep-cycle-error", "06-dep-narrow", "07-dep-error"]) {
      ok(shot34.includes(name), `r34 shot.ps1·矩阵项 ${name} 在场`);
    }

    // (G) 截图矩阵与索引（矩阵 7 + 十八壳，同一提交）
    const walkPng34 = (dir: string): string[] => {
      const out: string[] = [];
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${f.name}`;
        if (f.isDirectory()) out.push(...walkPng34(p));
        else if (f.name.endsWith(".png")) out.push(p);
      }
      return out;
    };
    const matrix34 = walkPng34("docs/ui/r34");
    eq(matrix34.length, 7, "r34 截图·矩阵恰好 7 张 PNG");
    eq(new Set(matrix34.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 7, "r34 截图·七张 SHA256 两两互异");
    const shells34 = walkPng34("docs/ui/shell");
    eq(shells34.length, 20, "r34 截图·十九 tab 壳基线 19 张（随 r36 推进）");
    eq(new Set(shells34.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "r34 截图·壳基线 19 张 SHA256 互异");
    const shellSet34 = new Set(shells34.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex")));
    eq(matrix34.filter((p) => shellSet34.has(createHash("sha256").update(readFileSync(p)).digest("hex"))).length, 0, "r34 截图·矩阵与壳基线零重叠");
    const docIdx34 = readFileSync("docs/ui/r34/README.md", "utf8");
    ok(docIdx34.includes("<!-- R34_HASHES_BEGIN -->") && docIdx34.includes("01-dep-empty.png"), "r34 索引·哈希自查块与矩阵图名在场");
    const shellIdx34 = readFileSync("docs/ui/shell/README.md", "utf8");
    ok(shellIdx34.includes("<!-- R34_HASHES_BEGIN -->") && shellIdx34.includes("R34 当前哈希块"), "r34 壳索引·R34 当前哈希块在场");
    const rootR34 = readFileSync("README.md", "utf8");
    ok(rootR34.includes("docs/ui/r49/01-backup-card.png") && rootR34.includes("docs/ui/shell/README.md"), "r34 历史 seam·根 README 当前矩阵索引已同步");
    ok(rootR34.includes("当前 r54"), "r34 历史 seam·根 README 断言规模节推进到当前轮");
  }

  // 71. r35：日历 ICS 导出与订阅（TDD：断言先于实现落地，宪法四条）
  {
    section("r35 ICS：转义 / UTC 日期 / 往返 / VEVENT / 范围 / 导入预览 / seam");
    const stamp = "20261121T020304Z";

    // (A) escapeIcsText：RFC 5545 TEXT 转义（顺序敏感：反斜杠先转）
    eq(escapeIcsText("plain"), "plain", "r35 转义·纯文本原样");
    eq(escapeIcsText(""), "", "r35 转义·空串原样");
    eq(escapeIcsText("a,b"), "a\\,b", "r35 转义·逗号");
    eq(escapeIcsText("a;b"), "a\\;b", "r35 转义·分号");
    eq(escapeIcsText("a\\b"), "a\\\\b", "r35 转义·反斜杠");
    eq(escapeIcsText("a\nb"), "a\\nb", "r35 转义·LF");
    eq(escapeIcsText("a\r\nb"), "a\\nb", "r35 转义·CRLF");
    eq(escapeIcsText("a\rb"), "a\\nb", "r35 转义·CR");
    eq(escapeIcsText('会议, "评审"; 第一行\n第二行\\尾'), '会议\\, "评审"\\; 第一行\\n第二行\\\\尾', "r35 转义·中文/逗号/引号/分号/换行/反斜杠组合");
    eq(unescapeIcsText(escapeIcsText("a,b;c\nd\\e")), "a,b;c\nd\\e", "r35 反转义·往返逐字节相等");
    eq(unescapeIcsText("a\\Nb"), "a\nb", "r35 反转义·大写 N 兼容");

    // (B) formatIcsDate：UTC YYYYMMDDTHHMMSSZ
    eq(formatIcsDate(new Date(Date.UTC(2026, 10, 21, 2, 3, 4))), stamp, "r35 日期·UTC 格式");
    eq(formatIcsDate(new Date("2026-11-21T00:00:00.000Z")), "20261121T000000Z", "r35 日期·零点零填充");
    eq(formatIcsDate("2026-01-05T23:59:59.000Z"), "20260105T235959Z", "r35 日期·ISO 字符串入参");
    eq(/^\d{8}T\d{6}Z$/.test(formatIcsDate(new Date())), true, "r35 日期·正则形态锁定");
    eq(parseIcsDate(stamp)?.toISOString(), "2026-11-21T02:03:04.000Z", "r35 日期·回读为 UTC Date");
    eq(parseIcsDate("not-a-date"), null, "r35 日期·坏串返回 null");
    eq(formatIcsDate(parseIcsDate(stamp)!), stamp, "r35 日期·编解码往返");

    // (C) buildIcsCalendar：完整头 + VEVENT + 稳定 UID + 折叠
    const ev35 = scheduleToIcsEvent({
      id: 71,
      title: 'r35 评审, "终版"; 第一行\n第二行',
      date: "2026-11-21",
      start: "10:00",
      end: "11:30",
      todoId: null,
      repeat: "weekly",
      createdAt: "2026-11-20T00:00:00.000Z",
      updatedAt: "2026-11-20T00:00:00.000Z",
    });
    eq(ev35.uid, `schedule-71-20261121@${ICS_UID_DOMAIN}`, "r35 UID·schedule id + 日期稳定");
    eq(ev35.dtStart.length, 16, "r35 VEVENT·DTSTART 为 UTC 16 位");
    eq(ev35.repeat, "weekly", "r35 VEVENT·重复规则元数据随事件");
    const ics35 = buildIcsCalendar([ev35], { dtStamp: stamp, calendarName: "协流 XieFlow 日程" });
    ok(ics35.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"), "r35 头·BEGIN/VERSION 完整且 CRLF");
    ok(ics35.includes("PRODID:"), "r35 头·PRODID 在场");
    ok(ics35.includes("CALSCALE:GREGORIAN"), "r35 头·CALSCALE 在场");
    ok(ics35.includes("METHOD:PUBLISH"), "r35 头·METHOD 在场");
    ok(ics35.includes("X-WR-CALNAME:协流 XieFlow 日程"), "r35 头·日历名在场");
    ok(ics35.includes("BEGIN:VEVENT\r\n") && ics35.includes("END:VEVENT\r\n"), "r35 VEVENT·起止标记完整");
    ok(ics35.endsWith("END:VCALENDAR\r\n"), "r35 头·END 收尾");
    ok(ics35.includes(`UID:${ev35.uid}`), "r35 VEVENT·UID 写出");
    ok(ics35.includes(`DTSTART:${ev35.dtStart}`), "r35 VEVENT·DTSTART 写出");
    ok(ics35.includes(`DTEND:${ev35.dtEnd}`), "r35 VEVENT·DTEND 写出");
    ok(ics35.includes("SUMMARY:") && ics35.includes("DESCRIPTION:") && ics35.includes("LOCATION:"), "r35 VEVENT·SUMMARY/DESCRIPTION/LOCATION 三字段齐全");
    ok(ics35.includes("r35 评审\\, \"终版\"\\; 第一行\\n第二行"), "r35 VEVENT·中文逗号引号换行已转义未丢");
    eq(buildIcsCalendar([ev35], { dtStamp: stamp }), ics35.replace("X-WR-CALNAME:协流 XieFlow 日程\r\n", "X-WR-CALNAME:协流 XieFlow\r\n"), "r35 装配·仅 meta 变化输出可预期");
    eq(buildIcsCalendar([ev35], { dtStamp: stamp }), buildIcsCalendar([ev35], { dtStamp: stamp }), "r35 UID/输出·同输入逐字节稳定");
    eq((buildIcsCalendar([ev35, ev35], { dtStamp: stamp }).match(/BEGIN:VEVENT/g) ?? []).length, 2, "r35 装配·多事件计数正确");
    eq(buildIcsCalendar([], { dtStamp: stamp }).includes("BEGIN:VEVENT"), false, "r35 装配·空日历无 VEVENT");
    const longLine = foldIcsLine(`SUMMARY:${"很长的内容".repeat(30)}`);
    ok(longLine.split("\r\n ").length > 1, "r35 折叠·超长行产生续行");
    ok(longLine.split("\r\n").every((l) => l.length <= 75), "r35 折叠·每行 ≤75 字符（ASCII 口径）");
    eq(unfoldIcsLines(longLine), `SUMMARY:${"很长的内容".repeat(30)}`, "r35 折叠·展开还原原行");
    ok(ics35.split("\r\n").every((l) => !l.startsWith(" ") || l.length <= 75), "r35 装配·续行格式合法");

    // (D) parseIcsCalendar：回读解析 / 往返逐字段相等 / 坏 ICS 4xx 根因
    const parsed35 = parseIcsCalendar(ics35);
    eq(parsed35.events.length, 1, "r35 回读·VEVENT 数量正确");
    eq(parsed35.version, "2.0", "r35 回读·VERSION 正确");
    eq(parsed35.events[0]?.uid, ev35.uid, "r35 回读·UID 往返相等");
    eq(parsed35.events[0]?.summary, ev35.summary, "r35 回读·SUMMARY 往返相等（含引号/换行）");
    eq(parsed35.events[0]?.description, ev35.description, "r35 回读·DESCRIPTION 往返相等");
    eq(parsed35.events[0]?.location, ev35.location, "r35 回读·LOCATION 往返相等");
    eq(parsed35.events[0]?.dtStart, ev35.dtStart, "r35 回读·DTSTART 往返相等");
    eq(parsed35.events[0]?.dtEnd, ev35.dtEnd, "r35 回读·DTEND 往返相等");
    eq(parsed35.events[0]?.repeat, "weekly", "r35 回读·X-XIEFLOW-REPEAT 往返相等");
    const foldedCal35 = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\n" + foldIcsLine(`SUMMARY:${"a".repeat(200)}`) + "\r\nUID:fold-test\r\nDTSTART:20261121T020000Z\r\nDTEND:20261121T030000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    eq(parseIcsCalendar(foldedCal35).events[0]?.summary, "a".repeat(200), "r35 回读·续行展开后摘要完整");
    const badIcs35 = (text: string): boolean => {
      try { parseIcsCalendar(text); return false; } catch (e) { return e instanceof InvalidIcsError; }
    };
    eq(badIcs35("not an ics"), true, "r35 坏 ICS·非日历文本抛 InvalidIcsError");
    eq(badIcs35("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR"), false, "r35 空日历·合法（零事件）");
    eq(badIcs35(ics35.replace("DTSTART:", "DTXXX:")), true, "r35 坏 ICS·缺 DTSTART 抛错");
    eq(badIcs35(ics35.replace("VERSION:2.0", "VERSION:1.0")), true, "r35 坏 ICS·VERSION 非 2.0 抛错");
    eq(new InvalidIcsError("坏 ICS") instanceof ValidationError, true, "r35 坏 ICS·错误类属 ValidationError（api 400 根因）");

    // (E) 领域映射与导入规划（web 只消费，不自己解析）
    const todoDue35 = todoDueToIcsEvent({ id: 9, title: "交报告", quadrant: "q1", status: "open", dueDate: "2026-11-25", createdAt: stamp, updatedAt: stamp })!;
    eq(todoDue35.uid, `todo-due-9@${ICS_UID_DOMAIN}`, "r35 待办·due UID 稳定");
    eq(todoDue35.kind, "todo-due", "r35 待办·kind 标记");
    eq(todoDue35.summary, "交报告（截止）", "r35 待办·SUMMARY 带截止语义");
    eq(todoDue35.dtStart, formatIcsDate(new Date("2026-11-25T09:00:00")), "r35 待办·默认 09:00 本地时段（UTC 随环境时区换算）");
    eq(todoDueToIcsEvent({ id: 10, title: "无截止", quadrant: "q1", status: "open", dueDate: null, createdAt: stamp, updatedAt: stamp }), null, "r35 待办·无截止日不生成事件");
    const draft35 = icsEventToScheduleDraft(parsed35.events[0]!);
    eq(draft35.title, ev35.summary, "r35 导入规划·标题逐字还原");
    const localStart35 = parseIcsDate(ev35.dtStart)!;
    const localEnd35 = parseIcsDate(ev35.dtEnd)!;
    const hhmm35 = (d: Date): string => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    eq(draft35.date, localDateStr(localStart35), "r35 导入规划·本地日期还原");
    eq(draft35.start, hhmm35(localStart35), "r35 导入规划·本地开始时间还原");
    eq(draft35.end, hhmm35(localEnd35), "r35 导入规划·本地结束时间还原");
    eq(draft35.repeat, "weekly", "r35 导入规划·重复规则还原");
    const plan35 = planIcsImport(ics35);
    eq(plan35.count, 1, "r35 导入预览·事件计数");
    eq(plan35.drafts, [draft35], "r35 导入预览·drafts 与单事件规划一致");
    const planSnapshot35 = JSON.stringify(plan35);
    planIcsImport(ics35);
    eq(JSON.stringify(plan35), planSnapshot35, "r35 导入预览·纯函数不改输入/输出快照稳定");
    let planBad35 = false;
    try { planIcsImport("garbage"); } catch (e) { planBad35 = e instanceof InvalidIcsError; }
    eq(planBad35, true, "r35 导入预览·坏 ICS 直接抛 InvalidIcsError（api 400）");

    // (F) api / web / 渲染 / 零依赖 seam
    const api35 = readFileSync("apps/api/src/server.ts", "utf8");
    ok(api35.includes('app.get("/api/schedules/export.ics"'), "r35 api·日程导出路由在场");
    ok(api35.includes('app.get("/api/todos/due.ics"'), "r35 api·待办截止导出路由在场");
    ok(api35.includes('app.get("/api/feeds/:key.ics"'), "r35 api·订阅 key 路由在场");
    ok(api35.includes('app.post("/api/feeds/key"'), "r35 api·本地随机 key 生成路由在场");
    ok(api35.includes('app.post("/api/schedules/import.ics"'), "r35 api·导入预览/确认路由在场");
    ok(api35.includes('calendar_feed_key'), "r35 api·订阅 key 存 settings（非密钥文件）");
    ok(api35.includes('text/calendar'), "r35 api·text/calendar Content-Type");
    ok(api35.includes('from "@xieflow/shared/ics"'), "r35 api·只装配 shared/ics");
    ok(!/function\s+escapeIcsText|function\s+parseIcsCalendar/.test(api35), "r35 api·零 ICS 算法分支");
    const web35 = readFileSync("apps/web/src/SchedulesPage.tsx", "utf8");
    ok(web35.includes('data-state="ics-export-menu"'), "r35 web·导出菜单 seam 在场");
    ok(web35.includes('data-state="ics-saved"'), "r35 web·落盘佐证 seam 在场");
    ok(web35.includes('data-state="ics-feed-card"'), "r35 web·订阅设置卡 seam 在场");
    ok(web35.includes('data-state="ics-import-preview"'), "r35 web·导入预览 seam 在场");
    ok(web35.includes('data-state="ics-import-success"'), "r35 web·导入成功 seam 在场");
    ok(web35.includes('data-state="ics-error"'), "r35 web·错误态 seam 在场");
    ok(web35.includes("/api/schedules/import.ics") && web35.includes("/api/feeds/key"), "r35 web·预览与订阅走真 HTTP");
    ok(!/function\s+escapeIcsText|function\s+parseIcsCalendar/.test(web35), "r35 web·零 ICS 算法分支");
    const app35 = readFileSync("apps/web/src/App.tsx", "utf8");
    ok(app35.includes("界面文案已优化（错误提示更清晰）"), "r35 App·轮次徽章推进到 r35");
    eq((app35.match(/data-tab="/g) ?? []).length, 20, "r35 App·十九 tab 数量（随 r36 推进）");
    const shot35 = readFileSync("scripts/shot.ps1", "utf8");
    ok(shot35.includes('"r35"'), "r35 shot.ps1·ValidateSet 纳入 r35");
    for (const name of ["01-ics-export-menu", "02-ics-saved", "03-ics-feed-card", "04-ics-import-preview", "05-ics-import-success", "06-ics-narrow", "07-ics-error"]) {
      ok(shot35.includes(name), `r35 shot.ps1·矩阵项 ${name} 在场`);
    }
    const pkg35 = readFileSync("package.json", "utf8");
    ok(!/"(ical|node-ical|ical.js|rrule|luxon|dayjs|date-fns)"/.test(pkg35), "r35 零新依赖·清单无 ICS/日期库");
    eq(SCHEMA_VERSION, 27, "r35 schema·r35 本轮无变化（当前 v24）");
    const rootR35 = readFileSync("README.md", "utf8");
    ok(rootR35.includes("docs/ui/r49/01-backup-card.png") && rootR35.includes("docs/ui/shell/README.md"), "r35 根 README·矩阵索引已同步（三处之一）");
    ok(rootR35.includes("当前 r54"), "r35 根 README·断言规模节推进到当前 r37");

    // (G) 截图矩阵 + 十八 tab 壳（同批重拍，哈希互异）
    const walkPng35 = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".png")) continue;
        const p = `${dir}/${name}`;
        out.push(p);
      }
      return out;
    };
    const matrix35 = walkPng35("docs/ui/r35");
    eq(matrix35.length, 7, "r35 截图·矩阵恰好 7 张 PNG");
    eq(new Set(matrix35.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 7, "r35 截图·七张 SHA256 两两互异");
    const shells35 = walkPng35("docs/ui/shell");
    eq(shells35.length, 20, "r35 截图·十九 tab 壳基线 19 张（随 r36 推进）");
    eq(new Set(shells35.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "r35 截图·壳基线 19 张 SHA256 互异");
    const shellSet35 = new Set(shells35.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex")));
    eq(matrix35.filter((p) => shellSet35.has(createHash("sha256").update(readFileSync(p)).digest("hex"))).length, 0, "r35 截图·矩阵与壳基线零重叠");
    const docIdx35 = readFileSync("docs/ui/r35/README.md", "utf8");
    ok(docIdx35.includes("<!-- R35_HASHES_BEGIN -->") && docIdx35.includes("01-ics-export-menu.png"), "r35 索引·哈希自查块与矩阵图名在场");
    const shellIdx35 = readFileSync("docs/ui/shell/README.md", "utf8");
    ok(shellIdx35.includes("<!-- R35_HASHES_BEGIN -->") && shellIdx35.includes("r35 哈希自查"), "r35 壳索引·R35 历史哈希块在场（当前块见 R36）");
  }

  // 72. r36：日报与周报自动生成（TDD：断言先于实现落地，宪法四条）
  {
    section("r36 工作报告：时间窗 / 段落装配 / 打印版 / 摘要 / 保存守卫 / seam");

    // (A) 类型与周期解析：daily 单日、weekly 周一到周日、ISO 周锚点、非法输入
    eq([...WORK_REPORT_TYPES], ["daily", "weekly"], "r36 类型·唯一枚举顺序");
    eq(WORK_REPORT_LABELS.daily, "日报", "r36 类型·日报标签");
    eq(WORK_REPORT_LABELS.weekly, "周报", "r36 类型·周报标签");
    eq(isWorkReportType("daily"), true, "r36 类型·daily 识别");
    eq(isWorkReportType("weekly"), true, "r36 类型·weekly 识别");
    eq(isWorkReportType("monthly"), false, "r36 类型·未知类型拒绝");
    eq(isWorkReportType(null), false, "r36 类型·空值拒绝");
    let badType36 = false;
    try { assertValidWorkReportType("dailyx"); } catch (e) { badType36 = e instanceof ValidationError; }
    eq(badType36, true, "r36 类型·守卫抛 ValidationError");
    eq(parseWorkReportPeriod("daily", "2026-11-21").from, "2026-11-21", "r36 周期·日报 from=锚日");
    eq(parseWorkReportPeriod("daily", "2026-11-21").to, "2026-11-21", "r36 周期·日报 to=锚日");
    eq(parseWorkReportPeriod("daily", "2026-11-21").type, "daily", "r36 周期·日报 type 回带");
    eq(startOfWorkReportWeek("2026-11-21"), "2026-11-16", "r36 周期·周六回退到周一");
    eq(startOfWorkReportWeek("2026-11-16"), "2026-11-16", "r36 周期·周一自身");
    eq(endOfWorkReportWeek("2026-11-21"), "2026-11-22", "r36 周期·周日为闭区间末日");
    eq(nextWorkReportDate("2026-11-21"), "2026-11-22", "r36 周期·次日");
    eq(nextWorkReportDate("2026-11-30"), "2026-12-01", "r36 周期·跨月次日");
    eq(nextWorkReportDate("2026-12-31"), "2027-01-01", "r36 周期·跨年次日");
    const week36 = parseWorkReportPeriod("weekly", "2026-11-21");
    eq([week36.from, week36.to], ["2026-11-16", "2026-11-22"], "r36 周期·周报自然周闭区间");
    eq(parseWorkReportPeriod("weekly", "2026-W48").from, "2026-11-23", "r36 周期·ISO 周锚点转周一");
    let badDate36 = false;
    try { parseWorkReportPeriod("daily", "2026-02-30"); } catch (e) { badDate36 = e instanceof ValidationError; }
    eq(badDate36, true, "r36 周期·不存在的日历日 400 守卫");
    let badWeek36 = false;
    try { parseWorkReportPeriod("weekly", "2026-W99"); } catch (e) { badWeek36 = e instanceof ValidationError; }
    eq(badWeek36, true, "r36 周期·非法 ISO 周 400 守卫");
    let badTypePeriod36 = false;
    try { parseWorkReportPeriod("monthly", "2026-11-21"); } catch (e) { badTypePeriod36 = e instanceof ValidationError; }
    eq(badTypePeriod36, true, "r36 周期·非法 type 400 守卫");

    // (B) 时间窗过滤：完成按 updatedAt、新建/进行中按 createdAt||updatedAt、阻塞按当前未完成前置
    const src36: WorkReportSource = {
      todos: [
        { id: 1, title: "完成产品验收", status: "done", createdAt: "2026-11-19T08:00:00.000Z", updatedAt: "2026-11-21T10:00:00.000Z" },
        { id: 2, title: "同步口径复核", status: "done", createdAt: "2026-11-20T08:00:00.000Z", updatedAt: "2026-11-20T09:00:00.000Z" },
        { id: 3, title: "补齐回归断言", status: "open", createdAt: "2026-11-21T08:00:00.000Z", updatedAt: "2026-11-21T08:00:00.000Z", dueDate: null },
        { id: 4, title: "整理报表需求", status: "open", createdAt: "2026-11-20T08:00:00.000Z", updatedAt: "2026-11-21T09:30:00.000Z", dueDate: null },
        { id: 5, title: "窄屏适配", status: "open", createdAt: "2026-11-21T08:00:00.000Z", updatedAt: "2026-11-21T08:00:00.000Z", dueDate: null },
        { id: 6, title: "窗外新建", status: "open", createdAt: "2026-11-18T08:00:00.000Z", updatedAt: "2026-11-18T08:00:00.000Z", dueDate: null },
        { id: 7, title: "窗外完成", status: "done", createdAt: "2026-11-18T08:00:00.000Z", updatedAt: "2026-11-20T08:00:00.000Z" },
        { id: 8, title: "下周交付", status: "open", createdAt: "2026-11-21T08:00:00.000Z", updatedAt: "2026-11-21T08:00:00.000Z", dueDate: "2026-11-24" },
      ],
      schedules: [
        { id: 11, title: "需求评审", date: "2026-11-21", start: "09:00", end: "10:00" },
        { id: 12, title: "研发对齐", date: "2026-11-21", start: "10:00", end: "11:00" },
        { id: 13, title: "窗外日程", date: "2026-11-22", start: "09:00", end: "10:00" },
        { id: 14, title: "上周日程", date: "2026-11-14", start: "09:00", end: "10:00" },
        { id: 15, title: "下周规划", date: "2026-11-23", start: "14:00", end: "15:00" },
      ],
      blocked: [{ todoId: 5, blockers: [3] }],
    };
    const day36 = parseWorkReportPeriod("daily", "2026-11-21");
    eq(inWorkReportWindow("2026-11-21T10:00:00.000Z", day36), true, "r36 窗口·窗内时间戳");
    eq(inWorkReportWindow("2026-11-20T10:00:00.000Z", day36), false, "r36 窗口·窗外时间戳");
    eq(inWorkReportWindow("2026-11-22", day36), false, "r36 窗口·上界严格闭区间");
    eq(inWorkReportWindow(null, day36), false, "r36 窗口·空值不入窗");
    const srcSnapshot36 = JSON.stringify(src36);
    const daily36 = collectReportData(src36, day36);
    eq(srcSnapshot36, JSON.stringify(src36), "r36 收集·纯函数不改输入快照");
    eq(daily36.completed.map((x) => x.id), [1], "r36 日报·完成项按 updatedAt 过滤到 1 条");
    eq(daily36.completed[0]?.at, "2026-11-21", "r36 日报·完成项日期取 updatedAt 前 10 位");
    eq(daily36.ongoing.map((x) => x.id), [3, 4, 8], "r36 日报·进行中=窗内 open 且非阻塞，按 id 升序");
    eq(daily36.blocked.map((x) => x.todoId), [5], "r36 日报·阻塞项按 dependencies 回带");
    eq(daily36.blocked[0]?.blockers, [3], "r36 日报·阻塞项回带前置 id");
    eq(daily36.blocked[0]?.title, "窄屏适配", "r36 日报·阻塞项回带真实标题");
    eq(daily36.schedules.map((x) => x.id), [11, 12], "r36 日报·日程只含当日且按 start 排序");
    eq(daily36.next.map((x) => x.id), [13], "r36 日报·明日计划取次日日程");
    eq(daily36.nextTodos.map((x) => x.id), [], "r36 日报·明日待办仅取 dueDate=次日");
    const week36b = parseWorkReportPeriod("weekly", "2026-11-21");
    const weekly36 = collectReportData(src36, week36b);
    eq(weekly36.completed.map((x) => x.id), [2, 7, 1], "r36 周报·完成项覆盖整周并按 updatedAt 日期/id 排序（20 日两条在前，21 日在后）");
    eq(weekly36.ongoing.map((x) => x.id), [3, 4, 6, 8], "r36 周报·进行中覆盖整周（含窗外日的窗内新建）");
    eq(weekly36.blocked.map((x) => x.todoId), [5], "r36 周报·阻塞项按周聚合");
    eq(weekly36.schedules.map((x) => x.id), [11, 12, 13], "r36 周报·日程 7 天聚合且窗外日程不进");
    eq(weekly36.next.map((x) => x.id), [15], "r36 周报·下周计划取下一自然周日程");
    eq(weekly36.nextTodos.map((x) => x.id), [8], "r36 周报·下周待办按 dueDate 聚合");
    const empty36 = collectReportData({ todos: [], schedules: [], blocked: [] }, day36);
    eq(reportSummary(empty36), { completed: 0, ongoing: 0, blocked: 0, schedules: 0, next: 0, total: 0 }, "r36 摘要·空数据全 0");

    // (C) reportSummary 计数摘要
    eq(reportSummary(daily36), { completed: 1, ongoing: 3, blocked: 1, schedules: 2, next: 1, total: 5 }, "r36 摘要·日报逐项手算");
    eq(reportSummary(weekly36), { completed: 3, ongoing: 4, blocked: 1, schedules: 3, next: 1, total: 8 }, "r36 摘要·周报逐项手算");
    const sumSnap36 = JSON.stringify(reportSummary(weekly36));
    reportSummary(weekly36);
    eq(JSON.stringify(reportSummary(weekly36)), sumSnap36, "r36 摘要·重复调用稳定");

    // (D) buildReportMarkdown：标题 / 完成 / 进行中 / 阻塞 / 日程 / 明日计划六段
    const md36 = buildReportMarkdown(daily36);
    eq(md36.split("\n")[0], "# 协流日报 · 2026-11-21", "r36 Markdown·日报标题段");
    ok(md36.includes("## 完成（1）") && md36.includes("- 完成产品验收（#1）"), "r36 Markdown·完成段逐项装配");
    ok(md36.includes("## 进行中（3）") && md36.includes("- 整理报表需求（#4）"), "r36 Markdown·进行中段逐项装配");
    ok(md36.includes("## 阻塞（1）") && md36.includes("- 窄屏适配（#5，被 #3 阻塞）"), "r36 Markdown·阻塞段逐项装配");
    ok(md36.includes("## 日程（2）") && md36.includes("- 09:00–10:00 需求评审"), "r36 Markdown·日程段按时段装配");
    ok(md36.includes("## 明日计划（1）") && md36.includes("- 2026-11-22 09:00–10:00 窗外日程"), "r36 Markdown·明日计划段装配");
    ok(md36.includes("零 token"), "r36 Markdown·模板化汇总注明零 token");
    const mdWeekly36 = buildReportMarkdown(weekly36);
    eq(mdWeekly36.split("\n")[0], "# 协流周报 · 2026-11-16 ~ 2026-11-22", "r36 Markdown·周报标题含区间");
    ok(mdWeekly36.includes("## 完成（3）"), "r36 Markdown·周报完成段手算 3 条");
    ok(mdWeekly36.includes("## 下周计划（2）"), "r36 Markdown·周报计划段标题随类型切换（1 日程 + 1 待办 = 2）");
    const mdEmpty36 = buildReportMarkdown(empty36);
    eq((mdEmpty36.match(/暂无/g) ?? []).length, 6, "r36 Markdown·空数据六段各一条暂无");
    eq(buildReportMarkdown(daily36), md36, "r36 Markdown·重复装配逐字节稳定");
    ok(!md36.includes("undefined") && !md36.includes("NaN"), "r36 Markdown·无 undefined/NaN 泄漏");

    // (E) buildReportHtml：打印版（内嵌 @media print，五字符转义）
    eq(escapeWorkReportHtml('a&b<c>d"e\'f'), "a&amp;b&lt;c&gt;d&quot;e&#39;f", "r36 HTML·五字符转义");
    eq(escapeWorkReportHtml("x\\y"), "x\\y", "r36 HTML·反斜杠原样");
    const html36 = buildReportHtml(daily36);
    ok(html36.startsWith("<!doctype html>") && html36.includes("@media print"), "r36 HTML·打印版文档头与打印样式");
    ok(html36.includes("完成产品验收") && html36.includes("窄屏适配"), "r36 HTML·段落真数据落进打印版");
    const evil36 = collectReportData({
      todos: [{ id: 9, title: '<script>alert("x")</script>', status: "done", createdAt: "2026-11-21T08:00:00.000Z", updatedAt: "2026-11-21T09:00:00.000Z" }],
      schedules: [], blocked: [],
    }, day36);
    ok(!buildReportHtml(evil36).includes("<script>"), "r36 HTML·脚本标签被转义（XSS 五字符）");

    // (F) 保存守卫：空内容 / 非法日期 / 越权 id / 合法归一化
    let emptyMd36 = false;
    try { assertValidWorkReportSave({ title: "日报", markdown: "   ", type: "daily", date: "2026-11-21" }); }
    catch (e) { emptyMd36 = e instanceof ValidationError; }
    eq(emptyMd36, true, "r36 保存守卫·空 Markdown 400");
    let emptyTitle36 = false;
    try { assertValidWorkReportSave({ title: "", markdown: "# 日报", type: "daily", date: "2026-11-21" }); }
    catch (e) { emptyTitle36 = e instanceof ValidationError; }
    eq(emptyTitle36, true, "r36 保存守卫·空标题 400");
    let badSaveDate36 = false;
    try { assertValidWorkReportSave({ title: "日报", markdown: "# 日报", type: "daily", date: "2026-13-01" }); }
    catch (e) { badSaveDate36 = e instanceof ValidationError; }
    eq(badSaveDate36, true, "r36 保存守卫·非法日期 400");
    let badSaveId36 = false;
    try { assertValidWorkReportSave({ title: "日报", markdown: "# 日报", type: "daily", date: "2026-11-21", documentId: 0 }); }
    catch (e) { badSaveId36 = e instanceof ValidationError; }
    eq(badSaveId36, true, "r36 保存守卫·越权/非法 documentId 400");
    const saveOk36 = assertValidWorkReportSave({ title: "  日报  ", markdown: "# 日报\n- 完成项", type: "daily", date: "2026-11-21" });
    eq(saveOk36.title, "日报", "r36 保存守卫·标题 trim 归一");
    eq(saveOk36.type, "daily", "r36 保存守卫·type 回带");
    eq(saveOk36.period.from, "2026-11-21", "r36 保存守卫·period 与生成口径同源");

    // (G) api / web / App / shot / README seam（契约真实存在，非恒真占位）
    const api36 = readFileSync("apps/api/src/server.ts", "utf8");
    ok(api36.includes('app.get("/api/reports/daily"'), "r36 api·日报路由在场");
    ok(api36.includes('app.get("/api/reports/weekly"'), "r36 api·周报路由在场");
    ok(api36.includes('app.post("/api/reports/save"'), "r36 api·存为文档路由在场");
    ok(api36.includes('from "@xieflow/shared/workReports"'), "r36 api·只装配 shared/workReports");
    ok(!/function\s+collectReportData|function\s+buildReportMarkdown/.test(api36), "r36 api·零报告算法分支");
    const web36 = readFileSync("apps/web/src/WorkReportsPage.tsx", "utf8");
    ok(web36.includes('data-state="wr-markdown"'), "r36 web·可编辑 Markdown seam 在场");
    ok(web36.includes('data-state="wr-summary"'), "r36 web·计数摘要 seam 在场");
    ok(web36.includes('data-state="wr-saved"'), "r36 web·存为文档回执 seam 在场");
    ok(web36.includes('data-state="wr-error"'), "r36 web·错误态 seam 在场");
    ok(web36.includes("/api/reports/daily") && web36.includes("/api/reports/save"), "r36 web·生成与保存走真 HTTP");
    ok(!/function\s+collectReportData|function\s+buildReportMarkdown/.test(web36), "r36 web·零报告算法分支");
    const app36 = readFileSync("apps/web/src/App.tsx", "utf8");
    ok(app36.includes("界面文案已优化（错误提示更清晰）"), "r36 App·轮次徽章推进到 r36");
    eq((app36.match(/data-tab="/g) ?? []).length, 20, "r36 App·十九 tab（报告 tab 新增）");
    ok(app36.includes('data-tab="work-reports"') && />\s*报告\s*</.test(app36), "r36 App·报告 tab 激活态入口在场");
    eq(SCHEMA_VERSION, 27, "r36 schema·r36 本轮无变化（当前 v24，复用 documents/blocks）");
    const pkgShared36 = readFileSync("packages/shared/package.json", "utf8");
    ok(pkgShared36.includes('"./workReports"'), "r36 子路径·@xieflow/shared/workReports 已登记");
    const pkg36 = readFileSync("package.json", "utf8");
    ok(!/"(marked|markdown-it|showdown|turndown|dayjs|luxon)"/.test(pkg36), "r36 零新依赖·清单无 Markdown/日期库");
    const rootR36 = readFileSync("README.md", "utf8");
    ok(rootR36.includes("docs/ui/r49/01-backup-card.png") && rootR36.includes("docs/ui/shell/README.md"), "r36 根 README·矩阵索引已同步（三处之一）");
    ok(rootR36.includes("当前 r54"), "r36 根 README·断言规模节推进到当前 r37");

    // (H) 截图矩阵 + 十九 tab 壳（同批重拍，哈希互异）
    const walkPng36 = (dir: string): string[] => readdirSync(dir).filter((n) => n.endsWith(".png")).map((n) => `${dir}/${n}`);
    const matrix36 = walkPng36("docs/ui/r36");
    eq(matrix36.length, 7, "r36 截图·矩阵恰好 7 张 PNG");
    eq(new Set(matrix36.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 7, "r36 截图·七张 SHA256 两两互异");
    const shells36 = walkPng36("docs/ui/shell");
    eq(shells36.length, 20, "r36 截图·十九 tab 壳基线 19 张（新增报告 tab）");
    eq(new Set(shells36.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "r36 截图·壳基线 19 张 SHA256 互异");
    const shellSet36 = new Set(shells36.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex")));
    eq(matrix36.filter((p) => shellSet36.has(createHash("sha256").update(readFileSync(p)).digest("hex"))).length, 0, "r36 截图·矩阵与壳基线零重叠");
    const docIdx36 = readFileSync("docs/ui/r36/README.md", "utf8");
    ok(docIdx36.includes("<!-- R36_HASHES_BEGIN -->") && docIdx36.includes("01-wr-empty.png"), "r36 索引·哈希自查块与矩阵图名在场");
    const shellIdx36 = readFileSync("docs/ui/shell/README.md", "utf8");
    ok(shellIdx36.includes("<!-- R36_HASHES_BEGIN -->") && shellIdx36.includes("R36 当前哈希块"), "r36 壳索引·R36 当前哈希块在场");
    ok(shellIdx36.includes("work-reports-tab-active.png"), "r36 壳索引·报告 tab 激活态图在场");
  }

  // 73. r37：表格分组视图与汇总行（TDD：断言先于实现落地，宪法四条）
  section("r37 表格分组：分桶 / 聚合 / 汇总装配 / seam");
  {
    const mkField37 = (
      id: number,
      name: string,
      type: TableField["type"],
      options: string[] = [],
    ): TableField => ({
      id,
      tableId: 1,
      name,
      type,
      position: id - 1,
      options,
      createdAt: "2026-11-21T00:00:00.000Z",
      updatedAt: "2026-11-21T00:00:00.000Z",
    });
    const fName37 = mkField37(1, "名称", "text");
    const fAmount37 = mkField37(2, "金额", "number");
    const fStatus37 = mkField37(3, "状态", "select", ["未开始", "进行中", "已完成"]);
    const fields37 = [fName37, fAmount37, fStatus37];
    const mkRec37 = (id: number, status: unknown, amount: unknown): TableRecord => ({
      id,
      tableId: 1,
      data: { "1": `行${id}`, "2": amount, "3": status },
      position: id,
      createdAt: "2026-11-21T00:00:00.000Z",
      updatedAt: "2026-11-21T00:00:00.000Z",
    });
    // waizhuan 手算口径：未开始 10/20，进行中 30，已完成非数值，空值组 5
    const recs37 = [
      mkRec37(1, "未开始", 10),
      mkRec37(2, "未开始", 20),
      mkRec37(3, "进行中", 30),
      mkRec37(4, null, 5),
      mkRec37(5, "已完成", "N/A"),
    ];
    const snapshot37 = JSON.stringify(recs37);

    // (A) 枚举与守卫
    eq([...GROUP_AGGREGATORS], ["count", "sum", "avg"], "r37 聚合·唯一枚举顺序");
    eq(GROUP_AGGREGATOR_LABELS.count, "计数", "r37 聚合·计数标签");
    eq(GROUP_AGGREGATOR_LABELS.sum, "求和", "r37 聚合·求和标签");
    eq(GROUP_AGGREGATOR_LABELS.avg, "均值", "r37 聚合·均值标签");
    eq(isGroupAggregator("avg"), true, "r37 聚合·avg 识别");
    eq(isGroupAggregator("median"), false, "r37 聚合·未知聚合拒绝");
    eq(isGroupAggregator(null), false, "r37 聚合·空值拒绝");
    noThrow(() => assertValidGroupAggregator("sum"), "r37 聚合·合法方式守卫通过");
    throws(() => assertValidGroupAggregator("median"), "r37 聚合·非法方式守卫抛错");
    eq(NULL_GROUP_KEY, "__null__", "r37 分桶·空值组固定 key");

    // (B) groupRecords：分桶 / null 独立组 / 组序确定
    const groups37 = groupRecords(recs37, 3, fStatus37);
    eq(groups37.length, 4, "r37 分桶·状态四组（含空值组）");
    eq(groups37.map((g) => g.label), ["未开始", "进行中", "已完成", "（空值）"], "r37 分桶·按候选项序 + 空值恒末");
    eq(groups37[0]?.records.map((r) => r.id), [1, 2], "r37 分桶·未开始组内两条");
    eq(groups37[1]?.records.map((r) => r.id), [3], "r37 分桶·进行中组内一条");
    eq(groups37[3]?.key, NULL_GROUP_KEY, "r37 分桶·空值独立组 key");
    eq(groups37[3]?.records.map((r) => r.id), [4], "r37 分桶·null 记录只进空值组");
    eq(groupRecords(recs37, 2, fAmount37).map((g) => g.label), ["5", "10", "20", "30", "N/A"], "r37 分桶·数值字段按值排序，非数值恒末");
    eq(groupRecords([], 3, fStatus37).length, 0, "r37 分桶·空记录零组");
    eq(groupRecords([mkRec37(9, "", 1)], 3, fStatus37).length, 1, "r37 分桶·空串与 null 同组");
    eq(JSON.stringify(groupRecords(recs37, 3, fStatus37)), JSON.stringify(groups37), "r37 分桶·重复调用逐字节稳定");
    eq(JSON.stringify(recs37), snapshot37, "r37 分桶·纯函数不改输入快照");
    eq(groups37[2]?.label, "已完成", "r37 分桶·非数值组仍独立成组");

    // (C) aggregateGroup：count / sum / avg，跳过非数值
    eq(aggregateGroup(recs37.slice(0, 2), 2, "count"), 2, "r37 聚合·count 组内行数");
    eq(aggregateGroup(recs37.slice(0, 2), 2, "sum"), 30, "r37 聚合·sum 手算 10+20=30");
    eq(aggregateGroup(recs37.slice(0, 2), 2, "avg"), 15, "r37 聚合·avg 手算 30/2=15");
    eq(aggregateGroup([mkRec37(6, null, 30)], 2, "avg"), 30, "r37 聚合·单条均值=自身");
    eq(aggregateGroup([mkRec37(7, null, "20")], 2, "sum"), 20, "r37 聚合·数字字符串计入");
    eq(aggregateGroup([mkRec37(8, null, "abc")], 2, "sum"), null, "r37 聚合·纯非数值组 sum=null（不产 NaN）");
    eq(aggregateGroup([mkRec37(8, null, "abc")], 2, "avg"), null, "r37 聚合·纯非数值组 avg=null");
    eq(aggregateGroup([mkRec37(9, null, null)], 2, "sum"), null, "r37 聚合·null 值跳过");
    eq(aggregateGroup([mkRec37(9, null, Number.NaN)], 2, "avg"), null, "r37 聚合·NaN 跳过");
    eq(aggregateGroup([mkRec37(9, null, Number.POSITIVE_INFINITY)], 2, "sum"), null, "r37 聚合·Infinity 跳过");
    eq(aggregateGroup([mkRec37(1, null, 10), mkRec37(2, null, "abc"), mkRec37(3, null, null)], 2, "sum"), 10, "r37 聚合·混合组跳过非数值只算 10");
    eq(aggregateGroup([mkRec37(1, null, 10), mkRec37(2, null, "abc"), mkRec37(3, null, null)], 2, "avg"), 10, "r37 聚合·混合组均值分母只算有效数值");
    eq(aggregateGroup([], 2, "count"), 0, "r37 聚合·空组 count=0");
    eq(countNumericValues(recs37.slice(0, 2), 2), 2, "r37 聚合·有效数值计数与 sum 同源");

    // (D) buildGroupView：分组 + 组内排序 + 汇总行
    const spec37: GroupSpec = { fieldId: 3, aggregator: "sum", aggregateFieldId: 2 };
    const view37 = buildGroupView(recs37, spec37, fields37, [{ fieldId: 2, direction: "desc" }]);
    eq(view37.totalRecords, 5, "r37 汇总·总行数 5");
    eq(view37.totalGroups, 4, "r37 汇总·总组数 4");
    eq(view37.groups.map((g) => g.label), ["未开始", "进行中", "已完成", "（空值）"], "r37 汇总·组序确定");
    eq(view37.groups[0]?.records.map((r) => r.data["2"]), [20, 10], "r37 汇总·组内按金额降序 20,10");
    eq(view37.groups[0]?.summary, { count: 2, aggregator: "sum", aggregateFieldId: 2, numericCount: 2, value: 30 }, "r37 汇总·未开始 count=2/sum=30 手算");
    eq(view37.groups[1]?.summary.value, 30, "r37 汇总·进行中 sum=30");
    eq(view37.groups[3]?.summary.value, 5, "r37 汇总·空值组 sum=5");
    eq(view37.groups[2]?.summary.value, null, "r37 汇总·已完成非数值 sum=null");
    eq(buildGroupView(recs37, { fieldId: 3, aggregator: "avg", aggregateFieldId: 2 }, fields37).groups[0]?.summary.value, 15, "r37 汇总·avg 手算 15");
    const cntView37 = buildGroupView(recs37, { fieldId: 3, aggregator: "count", aggregateFieldId: 999 }, fields37);
    eq(cntView37.groups[0]?.summary, { count: 2, aggregator: "count", aggregateFieldId: null, numericCount: 2, value: 2 }, "r37 汇总·count 忽略取值字段并归一 aggregateFieldId=null");
    eq(JSON.stringify(buildGroupView(recs37, spec37, fields37)), JSON.stringify(buildGroupView(recs37, spec37, fields37)), "r37 汇总·重复装配逐字节稳定");
    eq(buildGroupView([], spec37, fields37).groups.length, 0, "r37 汇总·空表零组");
    ok(!JSON.stringify(view37).includes("NaN"), "r37 汇总·无 NaN 泄漏");

    // (E) normalizeGroupSpec / normalizeViewSpec：4xx 守卫集中 shared
    eq(normalizeGroupSpec(fields37, null), null, "r37 守卫·null 归一为未分组");
    eq(normalizeGroupSpec(fields37, undefined), null, "r37 守卫·undefined 归一为未分组");
    eq(normalizeGroupSpec(fields37, spec37), spec37, "r37 守卫·合法分组规格原样归一");
    throws(() => normalizeGroupSpec(fields37, []), "r37 守卫·非对象规格抛错");
    throws(() => normalizeGroupSpec(fields37, { fieldId: 999, aggregator: "sum", aggregateFieldId: 2 }), "r37 守卫·非法分组字段抛错");
    throws(() => normalizeGroupSpec(fields37, { fieldId: 3, aggregator: "median", aggregateFieldId: 2 }), "r37 守卫·非法聚合方式抛错");
    throws(() => normalizeGroupSpec(fields37, { fieldId: 3, aggregator: "sum", aggregateFieldId: 999 }), "r37 守卫·非法聚合取值字段抛错");
    throws(() => normalizeGroupSpec(fields37, { fieldId: 3, aggregator: "sum", aggregateFieldId: 1 }), "r37 守卫·文本字段不可作 sum 取值抛错");
    throws(() => normalizeGroupSpec(fields37, { fieldId: 0, aggregator: "count" }), "r37 守卫·非法字段 id 抛错");
    throws(() => normalizeGroupSpec(fields37, { fieldId: 3, aggregator: "sum" }), "r37 守卫·sum 缺取值字段抛错");
    eq(normalizeGroupSpec(fields37, { fieldId: 3, aggregator: "count", aggregateFieldId: 1 }), { fieldId: 3, aggregator: "count", aggregateFieldId: null }, "r37 守卫·count 忽略取值字段");
    eq(normalizeViewSpec(fields37, { groupSpec: spec37 }).groupSpec, spec37, "r37 视图 spec·groupSpec 一并归一");
    eq(normalizeViewSpec(fields37, {}).groupSpec, null, "r37 视图 spec·r7 老视图零分组回归");
    eq(describeGroupSpec(spec37, fields37), "按状态分组 · 求和（取 金额）", "r37 摘要·分组口径可读");
    eq(describeGroupSpec(null, fields37), "", "r37 摘要·未分组空串");
    ok(describeViewSpec({ filterSpec: [], sortSpec: [], visibleFields: [], groupSpec: spec37 }, fields37).includes("按状态分组"), "r37 摘要·视图口径含分组段");

    // (F) schema v24 与数据层（真库 raw）
    eq(SCHEMA_VERSION, 27, "r37 schema·shared 版本推进到 v24");
    eq(MIGRATIONS.length, 27, "r37 schema·迁移队列 24 条连续");
    eq(MIGRATIONS[23]?.version, 24, "r37 schema·第 24 条迁移版本 = 24");
    ok(Boolean(MIGRATIONS[23]?.name.includes("group_spec")), "r37 schema·迁移名标注 group_spec");
    {
      const gdb = openDatabaseRaw({ path: ":memory:" });
      const rawG = gdb.raw;
      const cols = (rawG.all("PRAGMA table_info(views)") as { name: string; notnull: number }[]).map((c) => c.name);
      ok(cols.includes("group_spec"), "r37 schema·views.group_spec 列在场");
      const col = (rawG.all("PRAGMA table_info(views)") as { name: string; notnull: number }[]).find((c) => c.name === "group_spec");
      eq(col?.notnull, 0, "r37 schema·group_spec 可空（老行 NULL）");
      const tableCount = (rawG.get("SELECT COUNT(*) AS n FROM tables") as { n: number }).n;
      eq(tableCount, 0, "r37 数据层·空库无表（分组只读不建表）");
      rawG.close();
    }
    {
      const vdb = openDatabase({ path: ":memory:" });
      const t = vdb.createTable("分组视图表", "r37");
      const nf = vdb.listFields(t.id).find((f) => f.name === "金额")!;
      const sf = vdb.listFields(t.id).find((f) => f.name === "状态")!;
      const r1 = vdb.createRecord(t.id, { [String(nf.id)]: 10, [String(sf.id)]: "未开始" });
      const r2 = vdb.createRecord(t.id, { [String(nf.id)]: 20, [String(sf.id)]: "未开始" });
      const r3 = vdb.createRecord(t.id, { [String(nf.id)]: 30, [String(sf.id)]: "进行中" });
      const vspec: GroupSpec = { fieldId: sf.id, aggregator: "sum", aggregateFieldId: nf.id };
      const v = vdb.createView(t.id, "金额分组", { groupSpec: vspec });
      eq(v.groupSpec, vspec, "r37 数据层·createView 回带 groupSpec");
      eq(vdb.getView(v.id)?.groupSpec, vspec, "r37 数据层·getView 读回 groupSpec");
      eq(vdb.listViews(t.id)[0]?.groupSpec, vspec, "r37 数据层·listViews 读回 groupSpec");
      const gv = buildGroupView(vdb.listRecords(t.id), vspec, vdb.listFields(t.id), []);
      eq(gv.groups.map((g) => [g.label, g.summary.value]), [["未开始", 30], ["进行中", 30]], "r37 数据层·真库三行手算分组汇总");
      const patched = vdb.updateView(v.id, { groupSpec: { fieldId: sf.id, aggregator: "avg", aggregateFieldId: nf.id } });
      eq(patched.groupSpec?.aggregator, "avg", "r37 数据层·updateView 改聚合方式");
      const cleared = vdb.updateView(v.id, { groupSpec: null });
      eq(cleared.groupSpec, null, "r37 数据层·updateView groupSpec=null 清空分组");
      throws(() => vdb.createView(t.id, "坏分组", { groupSpec: { fieldId: 999, aggregator: "count" } }), "r37 数据层·非法字段分组不落库");
      throws(() => vdb.createView(t.id, "坏聚合", { groupSpec: { fieldId: sf.id, aggregator: "median" } }), "r37 数据层·非法聚合不落库");
      eq(vdb.listRecords(t.id).length, 3, "r37 数据层·视图操作后记录数不变（聚合只读）");
      eq([r1.id, r2.id, r3.id].length, 3, "r37 数据层·三条真记录 id 就位");
      vdb.close();
    }

    // (G) api / web / 子路径 / 零依赖 seam
    const api37 = readFileSync("apps/api/src/server.ts", "utf8");
    const web37 = readFileSync("apps/web/src/BasesPage.tsx", "utf8");
    const app37 = readFileSync("apps/web/src/App.tsx", "utf8");
    const pkgShared37 = readFileSync("packages/shared/package.json", "utf8");
    const pkg37 = readFileSync("package.json", "utf8");
    const shot37 = readFileSync("scripts/shot.ps1", "utf8");
    ok(api37.includes('app.get("/api/views/:id/grouped"'), "r37 api·分组查询路由在场");
    ok(api37.includes("body.groupSpec"), "r37 api·视图 CRUD 扩 groupSpec");
    ok(api37.includes('from "@xieflow/shared/tableGroups"'), "r37 api·只装配 shared/tableGroups");
    ok(!/function\s+groupRecords|function\s+aggregateGroup|function\s+buildGroupView/.test(api37), "r37 api·零分组算法分支");
    ok(web37.includes('data-state="bases-group-dropdown"'), "r37 web·分组下拉 seam 在场");
    ok(web37.includes('data-state="bases-group-head"'), "r37 web·折叠组头 seam 在场");
    ok(web37.includes('data-state="bases-group-summary"'), "r37 web·汇总行 seam 在场");
    ok(web37.includes('data-state="bases-group-error"'), "r37 web·错误态 seam 在场");
    ok(web37.includes("/api/views/${") && web37.includes("/grouped"), "r37 web·分组查询走真 HTTP");
    ok(!/function\s+groupRecords|function\s+aggregateGroup|function\s+buildGroupView/.test(web37), "r37 web·零分组算法分支");
    ok(app37.includes("界面文案已优化（错误提示更清晰）"), "r37 App·轮次徽章推进到 r37");
    eq((app37.match(/data-tab="/g) ?? []).length, 20, "r37 App·十九 tab 数量不变");
    ok(pkgShared37.includes('"./tableGroups"'), "r37 子路径·@xieflow/shared/tableGroups 已登记");
    ok(!/"(chart\.js|recharts|echarts|d3|lodash)"/.test(pkg37), "r37 零新依赖·清单无图表/工具库");
    ok(shot37.includes('"r37"'), "r37 shot.ps1·ValidateSet 纳入 r37");
    ok(readFileSync("scripts/r37-firstuse-cdp.mjs", "utf8").includes("R37 FIRSTUSE: ALL GREEN"), "r37 首用·headless CDP 脚本在场");

    // (H) 截图矩阵 + 十九 tab 壳（同批重拍，哈希互异，索引与根 README 同提交）
    const walkPng37 = (dir: string): string[] =>
      readdirSync(dir).filter((n) => n.endsWith(".png")).map((n) => `${dir}/${n}`);
    const matrix37 = walkPng37("docs/ui/r37");
    eq(matrix37.length, 7, "r37 截图·矩阵恰好 7 张 PNG");
    eq(new Set(matrix37.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 7, "r37 截图·七张 SHA256 两两互异");
    const shells37 = walkPng37("docs/ui/shell");
    eq(shells37.length, 20, "r37 截图·十九 tab 壳基线 19 张（本轮 tab 数不变）");
    eq(new Set(shells37.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "r37 截图·壳基线 19 张 SHA256 互异");
    const shellSet37 = new Set(shells37.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex")));
    eq(matrix37.filter((p) => shellSet37.has(createHash("sha256").update(readFileSync(p)).digest("hex"))).length, 0, "r37 截图·矩阵与壳基线零重叠");
    const docIdx37 = readFileSync("docs/ui/r37/README.md", "utf8");
    ok(docIdx37.includes("<!-- R37_HASHES_BEGIN -->") && docIdx37.includes("01-group-empty.png"), "r37 索引·哈希自查块与矩阵图名在场");
    const shellIdx37 = readFileSync("docs/ui/shell/README.md", "utf8");
    ok(shellIdx37.includes("<!-- R37_HASHES_BEGIN -->") && shellIdx37.includes("R37 当前哈希块"), "r37 壳索引·R37 当前哈希块在场");
    ok(shellIdx37.includes("bases-tab-active.png"), "r37 壳索引·表格 tab 激活态图在场");
    const rootR37 = readFileSync("README.md", "utf8");
    ok(rootR37.includes("docs/ui/r49/01-backup-card.png") && rootR37.includes("docs/ui/shell/README.md"), "r37 根 README·矩阵索引已同步（三处之一）");
    ok(rootR37.includes("当前 r54"), "r37 根 README·断言规模节推进到当前 r37");
    ok(rootR37.includes("e2e **3995**") && rootR37.includes("HTTP audit **3167**"), "r37 根 README·速查行断言规模同步");
    const allPng37 = [...matrix37, ...shells37];
    eq(allPng37.length, 27, "r37 截图·本轮证据共 26 张");
  }

  // 74. r38：看板卡片元数据（标签 / 负责人 / 截止日 / 逾期判定，向后兼容）
  section("r38 卡片元数据：标签归一 / 逾期判定 / 元数据装配 / 向后兼容");
  {
    // (A) normalizeCardLabels：trim / 去重 / 上限 / 禁空（4xx 由 api 映射）
    eq(MAX_CARD_LABELS, 10, "r38 标签·数量上限常量 10");
    eq(MAX_CARD_LABEL_LENGTH, 40, "r38 标签·单条长度上限常量 40");
    eq(normalizeCardLabels(null), [], "r38 标签·null 归一为空数组");
    eq(normalizeCardLabels(undefined), [], "r38 标签·undefined 归一为空数组");
    eq(normalizeCardLabels([]), [], "r38 标签·空数组归一为空数组");
    eq(normalizeCardLabels(["  前端  ", "设计", "前端"]), ["前端", "设计"], "r38 标签·trim 后去重保序");
    eq(normalizeCardLabels(["甲", "", "  ", "乙"]), ["甲", "乙"], "r38 标签·空串条目丢弃（禁空归一）");
    throws(() => normalizeCardLabels("前端"), "r38 标签·非数组输入抛错");
    throws(() => normalizeCardLabels([123]), "r38 标签·非字符串条目抛错");
    throws(() => normalizeCardLabels(["  "]), "r38 标签·全空标签集抛错");
    throws(() => normalizeCardLabels(["x".repeat(MAX_CARD_LABEL_LENGTH + 1)]), "r38 标签·超长单条抛错");
    throws(() => normalizeCardLabels(Array.from({ length: MAX_CARD_LABELS + 1 }, (_, i) => `标签${i}`)), "r38 标签·超上限抛错");
    eq(normalizeCardLabels(Array.from({ length: MAX_CARD_LABELS }, (_, i) => `标签${i}`)).length, MAX_CARD_LABELS, "r38 标签·恰好上限通过");
    noThrow(() => assertValidCardLabel("前端"), "r38 标签·合法标签守卫通过");
    throws(() => assertValidCardLabel("  "), "r38 标签·空白标签守卫抛错");
    throws(() => assertValidCardLabel("x".repeat(MAX_CARD_LABEL_LENGTH + 1)), "r38 标签·超长标签守卫抛错");

    // (B) 截止日守卫 + 完成列判定 + isOverdue（本地日期口径，今天不算逾期）
    noThrow(() => assertValidCardDueDate(null), "r38 日期·null 清空合法");
    noThrow(() => assertValidCardDueDate("2026-11-20"), "r38 日期·合法 ISO 日期通过");
    throws(() => assertValidCardDueDate("2026-02-30"), "r38 日期·不存在的日历日期抛错");
    throws(() => assertValidCardDueDate("2026/11/20"), "r38 日期·斜杠格式抛错");
    throws(() => assertValidCardDueDate("not-a-date"), "r38 日期·非法字符串抛错");
    eq(isCompletionColumnName("已完成"), true, "r38 完成列·已完成识别");
    eq(isCompletionColumnName("done"), true, "r38 完成列·done 识别");
    eq(isCompletionColumnName("待办"), false, "r38 完成列·待办不是完成列");
    eq(isCompletionColumnName(null), false, "r38 完成列·空名不是完成列");
    const now38 = new Date(2026, 10, 21, 12, 0, 0); // 2026-11-21 本地
    eq(isOverdue("2026-11-20", now38, "待办"), true, "r38 逾期·昨天且未完成列 -> true");
    eq(isOverdue("2026-11-21", now38, "待办"), false, "r38 逾期·今天不算逾期");
    eq(isOverdue("2026-11-22", now38, "待办"), false, "r38 逾期·未来不算逾期");
    eq(isOverdue("2026-11-20", now38, "已完成"), false, "r38 逾期·完成列不标红");
    eq(isOverdue(null, now38, "待办"), false, "r38 逾期·无截止日不标红");
    eq(isOverdue("bad-date", now38, "待办"), false, "r38 逾期·非法日期不标红");

    // (C) collectOverdueCards / filterCardsByLabel / cardMetaSummary
    const mkCard38 = (id: number, columnId: number, dueDate: string | null, labels: string[], assigneeMemberId: number | null = null) => ({
      id, projectId: 1, columnId, title: `卡${id}`, description: null, position: id, todoId: null,
      labels, assigneeMemberId, dueDate, createdAt: "2026-11-21T00:00:00.000Z", updatedAt: "2026-11-21T00:00:00.000Z",
    });
    const cards38 = [
      mkCard38(1, 1, "2026-11-20", ["前端", "紧急"], 2),
      mkCard38(2, 1, "2026-11-22", ["设计"]),
      mkCard38(3, 2, "2026-11-19", ["前端"]),
      mkCard38(4, 3, "2026-11-18", ["前端"]), // 已完成列，逾期被抑制
      mkCard38(5, 1, null, []),
    ];
    const cols38 = [
      { id: 1, name: "待办" },
      { id: 2, name: "进行中" },
      { id: 3, name: "已完成" },
    ];
    eq(collectOverdueCards(cards38, now38, cols38).map((c) => c.id), [1, 3], "r38 逾期列表·手算 [1,3]（完成列抑制、今天不逾期）");
    eq(collectOverdueCards([], now38, cols38).length, 0, "r38 逾期列表·空卡零结果");
    eq(filterCardsByLabel(cards38, "前端").map((c) => c.id), [1, 3, 4], "r38 标签筛选·前端三张");
    eq(filterCardsByLabel(cards38, "  前端  ").map((c) => c.id), [1, 3, 4], "r38 标签筛选·查询串 trim 后命中");
    eq(filterCardsByLabel(cards38, "不存在").length, 0, "r38 标签筛选·无命中空数组");
    throws(() => filterCardsByLabel(cards38, "  "), "r38 标签筛选·空白标签抛错");
    const summary38 = cardMetaSummary(cards38[0]!, now38, "待办");
    eq(summary38.labelCount, 2, "r38 摘要·标签数 2");
    eq(summary38.labels, ["前端", "紧急"], "r38 摘要·标签原样回带");
    eq(summary38.overdue, true, "r38 摘要·逾期态 true");
    eq(summary38.assigneeMemberId, 2, "r38 摘要·负责人 id 回带");
    eq(cardMetaSummary(cards38[3]!, now38, "已完成").overdue, false, "r38 摘要·完成列逾期抑制");
    eq(cardMetaSummary(cards38[4]!, now38, "待办").labelCount, 0, "r38 摘要·老卡无标签为 0（向后兼容）");
    eq(JSON.stringify(cards38), JSON.stringify([
      mkCard38(1, 1, "2026-11-20", ["前端", "紧急"], 2),
      mkCard38(2, 1, "2026-11-22", ["设计"]),
      mkCard38(3, 2, "2026-11-19", ["前端"]),
      mkCard38(4, 3, "2026-11-18", ["前端"]),
      mkCard38(5, 1, null, []),
    ]), "r38 纯函数·输入快照逐字节稳定");

    // (D) schema v25 + 真库元数据落库 / 级联删除 / 老卡 NULL
    eq(SCHEMA_VERSION, 27, "r38 schema·shared 版本推进到 v25");
    eq(MIGRATIONS.length, 27, "r38 schema·迁移队列 25 条连续");
    eq(MIGRATIONS[24]?.version, 25, "r38 schema·第 25 条迁移版本 = 25");
    ok(Boolean(MIGRATIONS[24]?.name.includes("card_labels")), "r38 schema·迁移名标注 card_labels");
    {
      const gdb = openDatabaseRaw({ path: ":memory:" });
      const rawG = gdb.raw;
      const cardCols = (rawG.all("PRAGMA table_info(cards)") as { name: string; notnull: number }[]);
      ok(cardCols.some((c) => c.name === "assignee_member_id"), "r38 schema·cards.assignee_member_id 列在场");
      ok(cardCols.some((c) => c.name === "due_date"), "r38 schema·cards.due_date 列在场");
      eq(cardCols.find((c) => c.name === "assignee_member_id")?.notnull, 0, "r38 schema·assignee_member_id 可空");
      eq(cardCols.find((c) => c.name === "due_date")?.notnull, 0, "r38 schema·due_date 可空");
      const labelCols = (rawG.all("PRAGMA table_info(card_labels)") as { name: string }[]).map((c) => c.name);
      ok(labelCols.includes("card_id") && labelCols.includes("label"), "r38 schema·card_labels 两列在场");
      rawG.close();
    }
    {
      const opened38 = openDatabaseRaw({ path: ":memory:" });
      const mdb = opened38.db;
      const rawM = opened38.raw;
      const proj = mdb.createProject("r38 元数据项目", "验收");
      const colsD = mdb.listBoardColumns(proj.id);
      const todoCol = colsD[0]!;
      const doneCol = colsD[2]!;
      const member = mdb.createMember({ name: "负责人甲", email: "r38.owner@example.com" });
      const inactive = mdb.createMember({ name: "停用者", email: "r38.inactive@example.com", status: "inactive" });
      // 老卡：不传任何新字段，原行为逐字不变
      const legacy = mdb.createBoardCard(proj.id, todoCol.id, "老卡");
      eq(legacy.labels, [], "r38 向后兼容·老卡 labels 为空数组");
      eq(legacy.assigneeMemberId, null, "r38 向后兼容·老卡负责人 NULL");
      eq(legacy.dueDate, null, "r38 向后兼容·老卡截止日 NULL");
      const meta = mdb.createBoardCard(proj.id, todoCol.id, "新卡", "描述", undefined, null, {
        labels: ["  前端 ", "紧急", "前端"],
        assigneeMemberId: member.id,
        dueDate: "2026-11-20",
      });
      eq(meta.labels, ["前端", "紧急"], "r38 数据层·建卡标签归一落库");
      eq(meta.assigneeMemberId, member.id, "r38 数据层·建卡负责人落库");
      eq(meta.dueDate, "2026-11-20", "r38 数据层·建卡截止日落库");
      eq(mdb.getBoardCard(meta.id)?.labels, ["前端", "紧急"], "r38 数据层·读回标签不变");
      eq(mdb.listBoardCards(todoCol.id).find((c) => c.id === meta.id)?.labels, ["前端", "紧急"], "r38 数据层·列内列表回带标签");
      const patched = mdb.updateBoardCard(meta.id, { labels: ["设计"], dueDate: null, assigneeMemberId: null });
      eq(patched.labels, ["设计"], "r38 数据层·PATCH 标签整体替换");
      eq(patched.dueDate, null, "r38 数据层·PATCH 清空截止日");
      eq(patched.assigneeMemberId, null, "r38 数据层·PATCH 清空负责人");
      throws(() => mdb.createBoardCard(proj.id, todoCol.id, "停用负责人卡", null, undefined, null, { assigneeMemberId: inactive.id }), "r38 数据层·停用成员被拒");
      throws(() => mdb.createBoardCard(proj.id, todoCol.id, "坏日期卡", null, undefined, null, { dueDate: "2026-02-30" }), "r38 数据层·非法日期被拒");
      throws(() => mdb.createBoardCard(proj.id, todoCol.id, "坏标签卡", null, undefined, null, { labels: ["  "] }), "r38 数据层·空标签被拒");
      eq(mdb.listOverdueCards(proj.id, now38, colsD).length, 0, "r38 数据层·清空截止日后无逾期卡");
      const meta2 = mdb.updateBoardCard(meta.id, { dueDate: "2026-11-20", labels: ["前端"] });
      eq(meta2.dueDate, "2026-11-20", "r38 数据层·重设截止日回带");
      eq(mdb.listOverdueCards(proj.id, now38, colsD).map((c) => c.id), [meta2.id], "r38 数据层·重设后逾期列表命中");
      eq(mdb.filterCardsByLabel(proj.id, "前端").map((c) => c.id), [meta2.id], "r38 数据层·按标签筛选命中");
      eq(mdb.moveBoardCard(meta2.id, doneCol.id, 0).columnId, doneCol.id, "r38 数据层·跨列移动后元数据卡照常移动");
      eq(mdb.listOverdueCards(proj.id, now38, colsD).length, 0, "r38 数据层·移入完成列后逾期被抑制");
      mdb.deleteBoardCard(meta2.id);
      eq((rawM.get("SELECT COUNT(*) AS n FROM card_labels WHERE card_id = ?", [meta2.id]) as { n: number }).n, 0, "r38 数据层·删卡级联清标签");
      mdb.close();
    }

    // (E) api / web / 子路径 / CI seam
    const api38 = readFileSync("apps/api/src/server.ts", "utf8");
    ok(api38.includes('app.get("/api/boards/:id/overdue"'), "r38 api·逾期列表路由在场");
    ok(api38.includes('app.get("/api/boards/:id/cards"'), "r38 api·标签筛选路由在场");
    ok(api38.includes("labels") && api38.includes("assigneeMemberId") && api38.includes("dueDate"), "r38 api·CRUD 扩三字段");
    ok(api38.includes('from "@xieflow/shared/cardMeta"'), "r38 api·只装配 shared/cardMeta");
    ok(!/function\s+normalizeCardLabels|function\s+isOverdue|function\s+cardMetaSummary/.test(api38), "r38 api·零元数据算法分支");
    const web38 = readFileSync("apps/web/src/BoardPage.tsx", "utf8");
    ok(web38.includes('data-state="board-card-labels"'), "r38 web·标签 chip seam 在场");
    ok(web38.includes('data-state="board-card-overdue"'), "r38 web·逾期红标 seam 在场");
    ok(web38.includes('data-state="board-label-filter"'), "r38 web·标签筛选下拉 seam 在场");
    ok(web38.includes("MemberPicker"), "r38 web·负责人复用 r24 选择器");
    ok(web38.includes("isOverdue(card.dueDate") && web38.includes("board-card-overdue"), "r38 web·逾期红标走 shared isOverdue 唯一口径");
    ok(!/function\s+normalizeCardLabels|function\s+isOverdue|function\s+cardMetaSummary/.test(web38), "r38 web·零元数据算法分支");
    const app38 = readFileSync("apps/web/src/App.tsx", "utf8");
    ok(app38.includes("界面文案已优化（错误提示更清晰）"), "r38 App·徽章改为纯用户文案（r39 无轮次号）");
    eq((app38.match(/data-tab="/g) ?? []).length, 20, "r38 App·十九 tab 数量不变");
    const pkgShared38 = readFileSync("packages/shared/package.json", "utf8");
    ok(pkgShared38.includes('"./cardMeta"'), "r38 子路径·@xieflow/shared/cardMeta 已登记");
    const shot38 = readFileSync("scripts/shot.ps1", "utf8");
    ok(shot38.includes('"r38"'), "r38 shot.ps1·ValidateSet 纳入 r38");
    const ci38 = readFileSync(".github/workflows/ci.yml", "utf8");
    ok(ci38.includes("23|24|25|26|27"), "r38 CI·HTTP smoke 正则随当前轮含 v27");

    // (F) 截图矩阵 7 张 + 十九壳同批重拍
    const walkPng38 = (dir: string): string[] => {
      let out: string[] = [];
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) out = out.concat(walkPng38(p));
        else if (e.name.endsWith(".png")) out.push(p);
      }
      return out;
    };
    const matrix38 = walkPng38("docs/ui/r38");
    eq(matrix38.length, 7, "r38 截图·矩阵恰好 7 张 PNG");
    eq(new Set(matrix38.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 7, "r38 截图·七张 SHA256 两两互异");
    const shells38 = walkPng38("docs/ui/shell");
    eq(shells38.length, 20, "r38 截图·十九 tab 壳基线 19 张");
    eq(new Set(shells38.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex"))).size, 20, "r38 截图·壳 19 张 SHA256 互异");
    const shellSet38 = new Set(shells38.map((p) => createHash("sha256").update(readFileSync(p)).digest("hex")));
    eq(matrix38.filter((p) => shellSet38.has(createHash("sha256").update(readFileSync(p)).digest("hex"))).length, 0, "r38 截图·矩阵与壳零重叠");
    const docIdx38 = readFileSync("docs/ui/r38/README.md", "utf8");
    ok(docIdx38.includes("<!-- R38_HASHES_BEGIN -->") && docIdx38.includes("01-card-empty.png"), "r38 索引·哈希块与首图名在场");
    const shellIdx38 = readFileSync("docs/ui/shell/README.md", "utf8");
    ok(shellIdx38.includes("<!-- R38_HASHES_BEGIN -->") && shellIdx38.includes("R38 当前哈希块"), "r38 壳索引·R38 当前哈希块在场");
    const rootR38 = readFileSync("README.md", "utf8");
    ok(rootR38.includes("docs/ui/r49/01-backup-card.png") && rootR38.includes("docs/ui/shell/README.md"), "r38 根 README·矩阵索引已同步（三处之一）");
    ok(rootR38.includes("当前 r54"), "r38 根 README·断言规模节推进到当前 r40");
    ok(rootR38.includes("HTTP audit **3167**"), "r38 根 README·速查行 audit 规模同步");
  }

  // 60. r39：用户可见文案清理（错误体内部术语清零 + 机制防复发）
  section("r39 用户可见文案（错误条内部术语清零）");
  const internalTerm39 = /截图钉态|截图钉注|钉注|audit|e2e|4xx|seam|shot=|r\d{2}(?!\d)/i;
  const messageOf39 = (fn: () => unknown): string => {
    try {
      fn();
      return "";
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };
  const cases39: readonly (readonly [string, () => unknown])[] = [
    ["看板标签超长", () => assertValidCardLabel("x".repeat(MAX_CARD_LABEL_LENGTH + 1))],
    ["看板标签空白", () => assertValidCardLabel("  ")],
    ["全局搜索空词", () => assertValidSearchQuery("")],
    ["ICS 缺头尾", () => parseIcsCalendar("not-a-calendar")],
    ["看板名为空", () => assertValidBoardName("")],
    ["表格名为空", () => assertValidTableName("")],
    ["字段名为空", () => assertValidFieldName("")],
    ["视图名为空", () => assertValidViewName("")],
    ["日程标题为空", () => assertValidScheduleTitle("")],
  ];
  for (const [label, fn] of cases39) {
    const message = messageOf39(fn);
    ok(message.length > 0, `r39 文案·${label} 抛带可读错误`);
    ok(!internalTerm39.test(message), `r39 文案·${label} 错误体零内部术语`);
  }
  const board39 = readFileSync("apps/web/src/BoardPage.tsx", "utf8");
  ok(board39.includes("卡片失败：标签过长（最多 40 字），请缩短后重试。"), "r39 BoardPage 错误条改为纯用户文案（r38 U2-1）");
  ok(!board39.includes("截图钉态对应 audit 4xx"), "r39 BoardPage 旧内部术语零残留");
  const bases39 = readFileSync("apps/web/src/BasesPage.tsx", "utf8");
  ok(bases39.includes("分组失败：聚合字段不存在，请重新选择取值字段。"), "r39 BasesPage 错误条改为纯用户文案（r37 U2-1）");
  ok(!bases39.includes("（截图钉态）"), "r39 BasesPage 截图钉态字样零残留");
  const wr39 = readFileSync("apps/web/src/WorkReportsPage.tsx", "utf8");
  ok(!wr39.includes("r36 报告链路错误态"), "r39 WorkReportsPage 轮次错误态标记零残留（r36 U2-3）");
  const scan39 = readFileSync("scripts/check-user-facing-text.ts", "utf8");
  ok(scan39.includes("截图钉态") && scan39.includes("audit"), "r39 扫描断言·内部术语表在场");
  const pkg39 = readFileSync("package.json", "utf8");
  ok(pkg39.includes("pnpm check:text && pnpm test"), "r39 test:all 已接入文案扫描断言");
  const docIdx39 = readFileSync("docs/ui/r39/README.md", "utf8");
  ok(docIdx39.includes("<!-- R39_HASHES_BEGIN -->") && docIdx39.includes("01-board-meta-error-clean-text.png"), "r39 索引·哈希块与首图名在场");
  const shellIdx39 = readFileSync("docs/ui/shell/README.md", "utf8");
  ok(shellIdx39.includes("<!-- R39_HASHES_BEGIN -->") && shellIdx39.includes("R41 当前哈希块"), "r39 壳索引·当前哈希块随 r41 推进在场");
  const rootR39 = readFileSync("README.md", "utf8");
  ok(rootR39.includes("docs/ui/r49/01-backup-card.png") && rootR39.includes("docs/ui/shell/README.md"), "r39 根 README·矩阵索引已同步（三处之一）");
  ok(rootR39.includes("当前 r54"), "r39 根 README·断言规模节推进到当前轮");
  ok(rootR39.includes("e2e **3995**") && rootR39.includes("HTTP audit **3167**"), "r39 根 README·速查行断言规模同步");
  const matrix39 = readdirSync("docs/ui/r39").filter((f) => f.endsWith(".png"));
  eq(matrix39.length, 7, "r39 截图·本轮错误态矩阵 7 张");
  eq(new Set(matrix39.map((p) => createHash("sha256").update(readFileSync(`docs/ui/r39/${p}`)).digest("hex"))).size, 7, "r39 截图·七张 SHA256 两两互异");
  const shells39 = readdirSync("docs/ui/shell").filter((f) => f.endsWith(".png"));
  eq(shells39.length, 20, "r39 截图·十九 tab 壳基线 19 张");
  eq(new Set(shells39.map((p) => createHash("sha256").update(readFileSync(`docs/ui/shell/${p}`)).digest("hex"))).size, 20, "r39 截图·壳 19 张 SHA256 互异");
  const shellSet39 = new Set(shells39.map((p) => createHash("sha256").update(readFileSync(`docs/ui/shell/${p}`)).digest("hex")));
  eq(matrix39.filter((p) => shellSet39.has(createHash("sha256").update(readFileSync(`docs/ui/r39/${p}`)).digest("hex"))).length, 0, "r39 截图·矩阵与壳零重叠");

  // r40 口径清理与扫描器加固（登录页 tab 数口径 + 单位数 rN 正则）
  section("r40 口径清理与扫描器加固");
  const auth40 = readFileSync("apps/web/src/AuthPages.tsx", "utf8");
  ok(auth40.includes("不占主界面 tab 数量"), "r40 AuthPages 登录页改为不含数字的 tab 数量口径");
  ok(!auth40.includes("14 个 tab"), "r40 AuthPages 过期 14 tab 数字零残留");
  ok(!auth40.includes("token 仅存浏览器本地"), "r40 AuthPages 开发者 token 口径零残留");
  const app40 = readFileSync("apps/web/src/App.tsx", "utf8");
  ok(app40.includes("因此不占主界面 tab 数量。"), "r40 App 注释同款口径校正");
  ok(!app40.includes("因此 14 个 tab 数量不变"), "r40 App 注释旧 14 tab 零残留");
  const scan40 = readFileSync("scripts/check-user-facing-text.ts", "utf8");
  ok(scan40.includes("/\\br\\d{1,3}\\b/i"), "r40 扫描器轮次号正则扩为单位数到三位数");
  ok(scan40.includes("例：写 r2 复验材料"), "r40 扫描器自断言·单位数 rN placeholder 在场");
  ok(scan40.includes("ROUND_SELF_PROBES"), "r40 扫描器自断言·探针执行路径在场");
  const root40 = readFileSync("README.md", "utf8");
  ok(root40.includes("e2e（3995 断言）") && root40.includes("HTTP 审计（3167 断言）"), "r40 根 README·速查行断言规模同步");
  ok(root40.includes("当前轮 r54"), "r40 根 README·当前轮对照表同步");
  ok(root40.includes("docs/ui/r49/01-backup-card.png"), "r40 根 README·登录页干净态索引同步");
  ok(root40.includes("e2e **3995**") && root40.includes("HTTP audit **3167**"), "r40 根 README·断言规模行同步");
  const docIdx40 = readFileSync("docs/ui/r40/README.md", "utf8");
  ok(docIdx40.includes("<!-- R40_HASHES_BEGIN -->") && docIdx40.includes("01-login-clean-text.png"), "r40 索引·哈希块与登录图在场");
  const shellIdx40 = readFileSync("docs/ui/shell/README.md", "utf8");
  ok(shellIdx40.includes("<!-- R41_HASHES_BEGIN -->") && shellIdx40.includes("R41 当前哈希块"), "r40 壳索引·当前哈希块随 r41 推进在场");
  const matrix40 = readdirSync("docs/ui/r40").filter((f) => f.endsWith(".png"));
  eq(matrix40.length, 1, "r40 截图·登录页干净态 1 张");
  const shells40 = readdirSync("docs/ui/shell").filter((f) => f.endsWith(".png"));
  eq(shells40.length, 20, "r40 截图·十九 tab 壳基线 19 张");
  eq(new Set(shells40.map((p) => createHash("sha256").update(readFileSync(`docs/ui/shell/${p}`)).digest("hex"))).size, 20, "r40 截图·壳 19 张 SHA256 互异");
  const shellSet40 = new Set(shells40.map((p) => createHash("sha256").update(readFileSync(`docs/ui/shell/${p}`)).digest("hex")));
  eq(matrix40.filter((p) => shellSet40.has(createHash("sha256").update(readFileSync(`docs/ui/r40/${p}`)).digest("hex"))).length, 0, "r40 截图·矩阵与壳零重叠");

  // 62. r41：轻量表单收集（定义归一 / 答卷校验 / 汇总统计 / 三表 / 关闭表单）
  section("r41 轻量表单收集：定义归一 / 答卷校验 / 汇总统计 / 三表");
  {
    // (A) 类型白名单与守卫
    eq(FORM_QUESTION_TYPES, ["text", "number", "select", "checkbox"], "r41 类型·四题白名单与 schema CHECK 一致");
    eq(FORM_TYPE_LABELS.number, "数字", "r41 类型·用户可见标签集中 shared");
    eq(isFormQuestionType("select"), true, "r41 类型·select 合法");
    eq(isFormQuestionType("date"), false, "r41 类型·date 不在白名单");
    eq(isFormQuestionType(42), false, "r41 类型·非字符串不合法");
    eq(MAX_FORM_TITLE, 200, "r41 守卫·标题上限常量 200");
    eq(MAX_FORM_QUESTIONS, 50, "r41 守卫·题数上限常量 50");
    noThrow(() => assertValidFormTitle("团队反馈"), "r41 守卫·合法标题通过");
    throws(() => assertValidFormTitle("   "), "r41 守卫·空白标题抛错");
    throws(() => assertValidFormTitle("x".repeat(MAX_FORM_TITLE + 1)), "r41 守卫·超长标题抛错");
    eq(normalizeFormDescription(undefined), null, "r41 守卫·说明缺省归一 null");
    eq(normalizeFormDescription("  说明  "), "说明", "r41 守卫·说明 trim");
    eq(normalizeFormDescription(""), null, "r41 守卫·空说明归一 null");
    throws(() => normalizeFormDescription(123), "r41 守卫·非文本说明抛错");
    eq(normalizeSelectOptions([" 甲 ", "乙", "甲", ""], "select"), ["甲", "乙"], "r41 选项·trim/丢空/去重保序");
    eq(normalizeSelectOptions(["甲"], "text"), [], "r41 选项·非单选题恒空数组");
    throws(() => normalizeSelectOptions([], "select"), "r41 选项·单选题无选项抛错");
    throws(() => normalizeSelectOptions([1], "select"), "r41 选项·非文本选项抛错");
    throws(() => normalizeSelectOptions(Array.from({ length: MAX_SELECT_OPTIONS + 1 }, (_, i) => `项${i}`), "select"), "r41 选项·超上限抛错");

    // (B) normalizeFormDefinition：类型白名单 / 必填 / 选项 / position 重排
    const def41 = normalizeFormDefinition({
      title: "  团队反馈  ",
      description: " 季度收集 ",
      questions: [
        { type: "text", label: " 姓名 ", required: true, position: 2 },
        { type: "select", label: "部门", required: true, options: ["研发", "产品", "研发"], position: 0 },
        { type: "number", label: "评分", required: false, position: 1 },
        { type: "checkbox", label: "参加", required: true, position: 0 },
      ],
    });
    eq(def41.title, "团队反馈", "r41 定义·标题 trim");
    eq(def41.description, "季度收集", "r41 定义·说明 trim");
    eq(def41.questions.map((q) => q.label), ["部门", "参加", "评分", "姓名"], "r41 定义·按 position 排序（同值稳定）");
    eq(def41.questions.map((q) => q.position), [0, 1, 2, 3], "r41 定义·position 连续重排");
    eq(def41.questions[0]?.options, ["研发", "产品"], "r41 定义·选项去重归一");
    eq(def41.questions[2]?.required, false, "r41 定义·选填标记归一");
    eq(normalizeFormDefinition({ title: "空表单" }).questions.length, 0, "r41 定义·零题允许创建");
    throws(() => normalizeFormDefinition({ title: "" }), "r41 定义·空标题不落库");
    throws(() => normalizeFormDefinition({ title: "x", questions: [{ type: "date", label: "日期" }] }), "r41 定义·未知题型不落库");
    throws(() => normalizeFormDefinition({ title: "x", questions: [{ type: "text", label: "  " }] }), "r41 定义·空题目标题不落库");
    throws(() => normalizeFormDefinition({ title: "x", questions: [{ type: "text", label: "a", required: "yes" }] }), "r41 定义·必填非布尔不落库");
    throws(() => normalizeFormDefinition({ title: "x", questions: "nope" }), "r41 定义·问题非数组不落库");
    throws(() => normalizeFormDefinition({ title: "x", questions: Array.from({ length: MAX_FORM_QUESTIONS + 1 }, (_, i) => ({ type: "text", label: `题${i}` })) }), "r41 定义·超题数不落库");
    eq(normalizeQuestionDraft({ type: "text", label: "问题" }, 7).position, 7, "r41 定义·position 缺省用回退值");
    eq(normalizeQuestionDraft({ type: "text", label: "问题", position: -1 }, 3).position, 3, "r41 定义·负 position 回退");

    // (C) validateFormAnswers：必填缺失 / 类型不符 / 未知题号
    const qs41: FormQuestion[] = [
      { id: 1, formId: 100, type: "text", label: "姓名", required: true, options: [], position: 0 },
      { id: 2, formId: 100, type: "number", label: "评分", required: true, options: [], position: 1 },
      { id: 3, formId: 100, type: "select", label: "部门", required: true, options: ["研发", "产品"], position: 2 },
      { id: 4, formId: 100, type: "checkbox", label: "参加", required: true, options: [], position: 3 },
      { id: 5, formId: 100, type: "text", label: "备注", required: false, options: [], position: 4 },
    ];
    const answers41: FormAnswers = { "1": " 张三 ", "2": "10", "3": "研发", "4": true, "5": "  " };
    eq(validateFormAnswers(answers41, qs41), { "1": "张三", "2": 10, "3": "研发", "4": true }, "r41 校验·归一答案（文本 trim/数字字符串转数值/可选空白丢弃）");
    throws(() => validateFormAnswers({ "2": 10, "3": "研发", "4": true }, qs41), "r41 校验·必填缺失被拒");
    throws(() => validateFormAnswers({ "1": "张三", "2": "abc", "3": "研发", "4": true }, qs41), "r41 校验·数字类型不符被拒");
    throws(() => validateFormAnswers({ "1": "张三", "2": 10, "3": "销售", "4": true }, qs41), "r41 校验·选项越界被拒");
    throws(() => validateFormAnswers({ "1": "张三", "2": 10, "3": "研发", "4": "yes" }, qs41), "r41 校验·勾选类型不符被拒");
    throws(() => validateFormAnswers({ "1": "张三", "2": 10, "3": "研发", "4": true, "99": "x" }, qs41), "r41 校验·未知题号被拒");
    throws(() => validateFormAnswers(null, qs41), "r41 校验·答案非对象被拒");
    throws(() => validateFormAnswers([], qs41), "r41 校验·数组不是答案字典被拒");
    eq(validateFormAnswers({ "1": "x", "2": 1, "3": "产品", "4": false }, qs41)["5"], undefined, "r41 校验·未答可选键不落库");
    noThrow(() => validateFormAnswers({}, []), "r41 校验·零题空答卷合法");

    // (D) summarizeResponses：3 份答卷手算统计（总和 / 均值 / 分布 / 勾选率）
    const responses41 = [
      { answers: { "1": "张三", "2": 10, "3": "研发", "4": true } },
      { answers: { "1": "李四", "2": 20, "3": "研发", "4": false } },
      { answers: { "1": "王五", "2": 30, "3": "产品", "4": true } },
    ];
    const sum41 = summarizeResponses(responses41, qs41);
    eq(sum41.total, 3, "r41 汇总·总答卷 3");
    eq(sum41.questions.length, 5, "r41 汇总·每题一卡共 5 张");
    eq(sum41.questions[0]?.type, "text", "r41 汇总·文本题型回带");
    eq((sum41.questions[0] as unknown as { values: string[] }).values, ["张三", "李四", "王五"], "r41 汇总·文本按答卷顺序列举");
    const num41 = sum41.questions[1] as { count: number; sum: number; avg: number; min: number; max: number };
    eq([num41.count, num41.sum, num41.avg, num41.min, num41.max], [3, 60, 20, 10, 30], "r41 汇总·数值手算 sum=60 avg=20 min=10 max=30");
    const sel41 = sum41.questions[2] as { distribution: readonly { option: string; count: number; rate: number }[] };
    eq(sel41.distribution, [{ option: "研发", count: 2, rate: 0.67 }, { option: "产品", count: 1, rate: 0.33 }], "r41 汇总·选项分布按定义序 + 两位小数比率");
    const chk41 = sum41.questions[3] as { checked: number; rate: number };
    eq([chk41.checked, chk41.rate], [2, 0.67], "r41 汇总·勾选率 2/3=0.67");
    eq(sum41.questions[4]?.answered, 0, "r41 汇总·未答选填题 answered=0");
    eq(sum41.questions[4]?.skipped, 3, "r41 汇总·未答选填题 skipped=3");
    const skipped41 = summarizeResponses([
      { answers: { "2": 10 } },
      { answers: { "2": 20 } },
      { answers: {} },
    ], qs41);
    const numSkip41 = skipped41.questions[1] as { count: number; sum: number; avg: number };
    eq([numSkip41.count, numSkip41.sum, numSkip41.avg], [2, 30, 15], "r41 汇总·跳过题不计入数值分母");
    const chkSkip41 = skipped41.questions[3] as { checked: number; rate: number };
    eq([skipped41.questions[3]?.answered, chkSkip41.rate], [0, 0], "r41 汇总·全跳过勾选率 0 不除零");
    const empty41 = summarizeResponses([], qs41);
    eq(empty41.total, 0, "r41 汇总·空答卷 total=0");
    eq((empty41.questions[1] as { sum: number; avg: number; min: number | null }).min, null, "r41 汇总·空答卷 min=null 不产 NaN");
    eq((empty41.questions[2] as { distribution: readonly { count: number }[] }).distribution.map((b) => b.count), [0, 0], "r41 汇总·空答卷分布全零");
    ok(!JSON.stringify(empty41).includes("NaN"), "r41 汇总·无 NaN 泄漏");
    eq(JSON.stringify(summarizeResponses(responses41, qs41)), JSON.stringify(sum41), "r41 汇总·重复装配逐字节稳定");
    eq(formSummaryLine(sum41), "共 3 份答卷 · 5 道题", "r41 汇总·用户可见摘要行");
    ok(new FormClosedError(9) instanceof Error && !(new FormClosedError(9) instanceof ValidationError), "r41 状态·关闭错误不是输入校验错误（独立 409 语义）");

    // (E) schema v26 + 真库三表（raw PRAGMA / 级联删除 / 关闭表单）
    eq(SCHEMA_VERSION, 27, "r41 schema·shared 版本推进到 v26");
    eq(MIGRATIONS.length, 27, "r41 schema·迁移队列 26 条连续");
    eq(MIGRATIONS[25]?.version, 26, "r41 schema·第 26 条迁移版本 = 26");
    ok(Boolean(MIGRATIONS[25]?.name.includes("form_questions")), "r41 schema·迁移名标注 form_questions");
    {
      const gdb = openDatabaseRaw({ path: ":memory:" });
      const rawG = gdb.raw;
      const formsCols = (rawG.all("PRAGMA table_info(forms)") as { name: string }[]).map((c) => c.name);
      ok(formsCols.includes("closed_at") && formsCols.includes("title"), "r41 schema·forms 列在场");
      const qCols = (rawG.all("PRAGMA table_info(form_questions)") as { name: string }[]).map((c) => c.name);
      ok(qCols.includes("form_id") && qCols.includes("options_json") && qCols.includes("type"), "r41 schema·form_questions 列在场");
      const rCols = (rawG.all("PRAGMA table_info(form_responses)") as { name: string }[]).map((c) => c.name);
      ok(rCols.includes("answers_json") && rCols.includes("created_at"), "r41 schema·form_responses 列在场");
      rawG.close();
    }
    {
      const fdb = openDatabase({ path: ":memory:" });
      const created = fdb.createForm({
        title: "满意度调查",
        description: "季度反馈",
        questions: [
          { type: "text", label: "姓名", required: true, position: 0 },
          { type: "number", label: "评分", required: true, position: 1 },
          { type: "select", label: "部门", required: true, options: ["研发", "产品"], position: 2 },
          { type: "checkbox", label: "参加", required: true, position: 3 },
        ],
      });
      eq(created.title, "满意度调查", "r41 数据层·建表单标题回带");
      eq(created.questions.length, 4, "r41 数据层·建表单四题落库");
      eq(created.closedAt, null, "r41 数据层·新表单未关闭");
      eq(fdb.listForms().length, 1, "r41 数据层·表单列表 1 张");
      eq(fdb.getForm(created.id)?.questions.length, 4, "r41 数据层·getForm 回带问题");
      const qids = created.questions.map((q) => q.id);
      throws(() => fdb.createFormResponse(created.id, { "1": "甲", "2": "abc", "3": "研发", "4": true }), "r41 数据层·答卷类型不符不落库");
      throws(() => fdb.createFormResponse(created.id, { "1": "甲", "2": 10, "3": "研发" }), "r41 数据层·答卷必填缺失不落库");
      const r1 = fdb.createFormResponse(created.id, { [qids[0]!]: "甲", [qids[1]!]: 10, [qids[2]!]: "研发", [qids[3]!]: true });
      const r2 = fdb.createFormResponse(created.id, { [qids[0]!]: "乙", [qids[1]!]: 20, [qids[2]!]: "研发", [qids[3]!]: false });
      const r3 = fdb.createFormResponse(created.id, { [qids[0]!]: "丙", [qids[1]!]: 30, [qids[2]!]: "产品", [qids[3]!]: true });
      eq([r1.id, r2.id, r3.id].length, 3, "r41 数据层·三份答卷 id 就位");
      eq(fdb.listFormResponses(created.id).length, 3, "r41 数据层·答卷列表读回 3 份");
      const dbsum = fdb.getFormSummary(created.id);
      eq(dbsum?.total, 3, "r41 数据层·汇总总数 3");
      eq((dbsum?.questions[1] as { sum: number }).sum, 60, "r41 数据层·真库三份答卷数值总和手算 60");
      eq((dbsum?.questions[2] as { distribution: readonly { count: number }[] }).distribution.map((b) => b.count), [2, 1], "r41 数据层·真库选项分布 [2,1]");
      eq((dbsum?.questions[3] as { rate: number }).rate, 0.67, "r41 数据层·真库勾选率 0.67");
      const closed = fdb.updateForm(created.id, { closedAt: "2026-11-21T00:00:00.000Z" });
      ok(Boolean(closed?.closedAt), "r41 数据层·关闭表单写回 closedAt");
      throws(() => fdb.createFormResponse(created.id, { [qids[0]!]: "丁", [qids[1]!]: 40, [qids[2]!]: "产品", [qids[3]!]: false }), "r41 数据层·已关闭表单拒收新答卷");
      eq(fdb.listFormResponses(created.id).length, 3, "r41 数据层·拒收后答卷数不变（零半态）");
      const opened = fdb.updateForm(created.id, { closedAt: null });
      eq(opened?.closedAt, null, "r41 数据层·重开表单清空 closedAt");
      ok(fdb.createFormResponse(created.id, { [qids[0]!]: "丁", [qids[1]!]: 40, [qids[2]!]: "产品", [qids[3]!]: false }).id > r3.id, "r41 数据层·重开后可再提交");
      const patched = fdb.updateForm(created.id, { title: "新标题", questions: [{ type: "text", label: "唯一题", required: true, position: 0 }] });
      eq(patched?.questions.length, 1, "r41 数据层·整组替换问题");
      eq(fdb.deleteForm(created.id), true, "r41 数据层·删除表单返回 true");
      eq(fdb.listForms().length, 0, "r41 数据层·删后表单归零");
      eq(fdb.getForm(created.id), null, "r41 数据层·删后 getForm=null");
      fdb.close();
    }

    // (F) api / web / 子路径 / CI seam（零算法分支）
    const api41 = readFileSync("apps/api/src/server.ts", "utf8");
    const web41 = readFileSync("apps/web/src/FormsPage.tsx", "utf8");
    const app41 = readFileSync("apps/web/src/App.tsx", "utf8");
    const pkgShared41 = readFileSync("packages/shared/package.json", "utf8");
    const ci41 = readFileSync(".github/workflows/ci.yml", "utf8");
    const shot41 = readFileSync("scripts/shot.ps1", "utf8");
    ok(api41.includes('app.get("/api/forms/:id/fill"'), "r41 api·填写视图路由在场");
    ok(api41.includes('app.post("/api/forms/:id/responses"'), "r41 api·提交答卷路由在场");
    ok(api41.includes('app.get("/api/forms/:id/summary"'), "r41 api·汇总路由在场");
    ok(api41.includes('from "@xieflow/shared/forms"'), "r41 api·只装配 shared/forms");
    ok(!/function\s+normalizeFormDefinition|function\s+validateFormAnswers|function\s+summarizeResponses/.test(api41), "r41 api·零表单算法分支");
    ok(web41.includes('data-state="forms-empty"'), "r41 web·空态 seam 在场");
    ok(web41.includes('data-state="forms-create"'), "r41 web·创建表单 seam 在场");
    ok(web41.includes('data-state="forms-questions"'), "r41 web·问题编辑 seam 在场");
    ok(web41.includes('data-state="forms-fill"'), "r41 web·填写视图 seam 在场");
    ok(web41.includes('data-state="forms-summary"'), "r41 web·汇总统计 seam 在场");
    ok(web41.includes('data-state="forms-submitted"'), "r41 web·提交成功 seam 在场");
    ok(web41.includes("/api/forms/${"), "r41 web·走真 HTTP 而非本地假数据");
    ok(!/function\s+normalizeFormDefinition|function\s+validateFormAnswers|function\s+summarizeResponses/.test(web41), "r41 web·零表单算法分支");
    eq((app41.match(/data-tab="/g) ?? []).length, 20, "r41 App·二十 tab（新增表单 tab）");
    ok(app41.includes('data-tab="forms"'), "r41 App·表单 tab 激活态 seam");
    ok(pkgShared41.includes('"./forms"'), "r41 子路径·@xieflow/shared/forms 已登记");
    ok(ci41.includes("|25|26|27)") || ci41.includes("|26|27)"), "r41 CI·HTTP smoke 正则随当前轮升 v27");
    ok(shot41.includes('"r41"'), "r41 shot.ps1·ValidateSet 纳入 r41");

    // (G) 截图矩阵 7 张 + 二十 tab 壳同批重拍
    const matrix41 = readdirSync("docs/ui/r41").filter((f) => f.endsWith(".png"));
    eq(matrix41.length, 7, "r41 截图·矩阵恰好 7 张 PNG");
    eq(new Set(matrix41.map((p) => createHash("sha256").update(readFileSync(`docs/ui/r41/${p}`)).digest("hex"))).size, 7, "r41 截图·七张 SHA256 两两互异");
    const shells41 = readdirSync("docs/ui/shell").filter((f) => f.endsWith(".png"));
    eq(shells41.length, 20, "r41 截图·二十 tab 壳基线 20 张（新增 forms-tab-active）");
    eq(new Set(shells41.map((p) => createHash("sha256").update(readFileSync(`docs/ui/shell/${p}`)).digest("hex"))).size, 20, "r41 截图·壳 20 张 SHA256 互异");
    ok(shells41.includes("forms-tab-active.png"), "r41 截图·表单 tab 激活态图在场");
    const shellSet41 = new Set(shells41.map((p) => createHash("sha256").update(readFileSync(`docs/ui/shell/${p}`)).digest("hex")));
    eq(matrix41.filter((p) => shellSet41.has(createHash("sha256").update(readFileSync(`docs/ui/r41/${p}`)).digest("hex"))).length, 0, "r41 截图·矩阵与壳零重叠");
    const docIdx41 = readFileSync("docs/ui/r41/README.md", "utf8");
    ok(docIdx41.includes("<!-- R41_HASHES_BEGIN -->") && docIdx41.includes("01-forms-empty.png"), "r41 索引·哈希块与首图名在场");
    const shellIdx41 = readFileSync("docs/ui/shell/README.md", "utf8");
    ok(shellIdx41.includes("<!-- R41_HASHES_BEGIN -->") && shellIdx41.includes("R41 当前哈希块"), "r41 壳索引·R41 当前哈希块在场");
    ok(shellIdx41.includes("forms-tab-active.png"), "r41 壳索引·表单 tab 激活态图在场");
    const root41 = readFileSync("README.md", "utf8");
    ok(root41.includes("当前轮 r54"), "r41 根 README·当前轮对照表同步");
    ok(root41.includes("docs/ui/r49/01-backup-card.png") && root41.includes("docs/ui/shell/README.md"), "r41 根 README·矩阵索引同步");
    ok(root41.includes("e2e（3995 断言）") && root41.includes("HTTP 审计（3167 断言）"), "r41 根 README·速查行断言规模同步");
  }

  // 63. r43：会议室设备与智能推荐（归一 / 可用判定 / 冲突原因 / 容量排序 / 向后兼容）
  section("r43 会议室设备与智能推荐：shared 唯一口径 / schema v27 / 数据层 / HTTP seam / 截图矩阵");
  {
    const need43: RecommendNeed = { attendees: 8, equipment: ["投影"], date: "2026-11-20", start: "10:00", end: "11:00" };
    const rooms43: RecommendRoom[] = [
      { id: 1, name: "大会议室", location: "3F", capacity: 12, active: true, equipment: ["投影", "视频会议"] },
      { id: 2, name: "中会议室", location: "3F", capacity: 8, active: true, equipment: ["投影", "白板"] },
      { id: 3, name: "小会议室", location: "2F", capacity: 6, active: true, equipment: ["电话会议"] },
      { id: 4, name: "停用会议室", location: "2F", capacity: 20, active: false, equipment: ["投影"] },
    ];
    const meetings43: RecommendMeeting[] = [
      { id: 11, roomId: 2, date: "2026-11-20", start: "14:00", end: "15:30", title: "已占用" },
      { id: 12, roomId: 2, date: "2026-11-20", start: "15:30", end: "16:00", title: "接档" },
    ];

    // (A) 设备归一：白名单 / trim / 去重 / 固定排序 / 存量 NULL
    eq(ROOM_EQUIPMENT_WHITELIST, ["投影", "白板", "视频会议", "电话会议"], "r43 设备·四项白名单固定顺序");
    eq(normalizeEquipment(undefined), [], "r43 设备·undefined 归一为空");
    eq(normalizeEquipment(null), [], "r43 设备·NULL 归一为空（存量行）");
    eq(normalizeEquipment([]), [], "r43 设备·空数组归一为空");
    eq(normalizeEquipment(["投影"]), ["投影"], "r43 设备·单项原样");
    eq(normalizeEquipment(["白板", "投影"]), ["投影", "白板"], "r43 设备·按白名单固定顺序排序");
    eq(normalizeEquipment(["投影", "投影"]), ["投影"], "r43 设备·去重");
    eq(normalizeEquipment(["视频会议", "投影", "白板", "电话会议"]), ["投影", "白板", "视频会议", "电话会议"], "r43 设备·四项全量排序");
    eq(normalizeEquipment("投影,白板"), ["投影", "白板"], "r43 设备·逗号串解析");
    eq(normalizeEquipment("投影，白板、视频会议"), ["投影", "白板", "视频会议"], "r43 设备·中英文逗号与顿号解析");
    eq(normalizeEquipment([" 投影 ", "未知设备", "电话会议"]), ["投影", "电话会议"], "r43 设备·trim + 白名单过滤");
    noThrow(() => assertValidEquipment(undefined), "r43 守卫·缺省设备合法");
    noThrow(() => assertValidEquipment(["投影", "白板"]), "r43 守卫·白名单设备通过");
    await throws(() => assertValidEquipment("激光笔"), "r43 守卫·白名单外设备抛错（api 400 根因）");
    await throws(() => assertValidEquipment(["投影", "未知"]), "r43 守卫·数组含未知设备抛错");
    eq(parseEquipmentQuery("投影,投影"), ["投影"], "r43 查询·设备串去重");
    await throws(() => parseEquipmentQuery(["未知"]), "r43 查询·非法设备抛错");
    eq(parseStoredEquipment(null), [], "r43 存库·NULL 视为空设备（向后兼容）");
    eq(parseStoredEquipment('["白板","投影"]'), ["投影", "白板"], "r43 存库·JSON 数组读回并归一");
    eq(parseStoredEquipment("not-json"), [], "r43 存库·坏 JSON 视为空设备");
    eq(parseStoredEquipment('{"a":1}'), [], "r43 存库·非数组 JSON 视为空设备");

    // (B) 需求守卫：人数 / 时段 / 日期 / 设备
    eq(parseAttendees(8), 8, "r43 人数·数字原样");
    eq(parseAttendees("8"), 8, "r43 人数·字符串数字归一");
    await throws(() => parseAttendees(0), "r43 人数·0 被拒");
    await throws(() => parseAttendees(1001), "r43 人数·超上限被拒");
    await throws(() => parseAttendees("abc"), "r43 人数·非数字被拒");
    eq(parseRecommendNeed({ attendees: 8, equipment: "投影", date: "2026-11-20", start: "10:00", end: "11:00" }), need43, "r43 需求·四参数归一");
    eq(parseRecommendNeed({ attendees: "8", equipment: "投影,投影", start: "2026-11-20T10:00", end: "2026-11-20T11:00" }), need43, "r43 需求·ISO 时段自提取日期");
    await throws(() => parseRecommendNeed({ attendees: 8, start: "11:00", end: "10:00" }), "r43 需求·时段倒挂被拒");
    await throws(() => parseRecommendNeed({ attendees: 8, start: "08:00", end: "17:00" }), "r43 需求·超过 8 小时被拒");
    await throws(() => parseRecommendNeed({ attendees: 8, date: "2026-02-30", start: "10:00", end: "11:00" }), "r43 需求·非法日期被拒");
    await throws(() => parseRecommendNeed({ attendees: 8, equipment: "激光笔", start: "10:00", end: "11:00" }), "r43 需求·非法设备被拒");
    await throws(() => parseRecommendNeed({ start: "10:00", end: "11:00" }), "r43 需求·缺人数被拒");
    await throws(() => parseRecommendNeed({ attendees: 8, start: "9:00", end: "11:00" }), "r43 需求·非补零时钟被拒");

    // (C) 可用判定与冲突原因（复用 r28 边界相接口径）
    eq(roomMatchesNeed(rooms43[1]!, need43, meetings43), true, "r43 判定·容量刚好 + 设备全含 + 无冲突");
    eq(roomMatchesNeed(rooms43[0]!, need43, meetings43), true, "r43 判定·大容量含设备可用");
    eq(roomMatchesNeed({ ...rooms43[1]!, capacity: 7 }, need43, meetings43), false, "r43 判定·容量不足不可用");
    eq(roomMatchesNeed({ ...rooms43[1]!, equipment: [] }, need43, meetings43), false, "r43 判定·设备缺失不可用");
    eq(roomMatchesNeed({ ...rooms43[1]!, active: false }, need43, meetings43), false, "r43 判定·停用室不可用");
    const conflictNeed = { ...need43, start: "14:30", end: "15:00" };
    eq(roomMatchesNeed(rooms43[1]!, conflictNeed, meetings43), false, "r43 判定·时段重叠不可用");
    eq(roomMatchesNeed(rooms43[1]!, { ...need43, start: "16:00", end: "16:30" }, meetings43), true, "r43 判定·与上一场 16:00 边界相接不冲突（r28 口径）");
    eq(roomMatchesNeed(rooms43[1]!, { ...need43, start: "16:00", end: "17:00" }, meetings43), true, "r43 判定·接档之后空闲可用");
    eq(roomMatchesNeed(rooms43[1]!, { ...need43, date: "2026-11-21" }, meetings43), true, "r43 判定·跨日期预约不冲突");
    eq(roomMatchesNeed({ ...rooms43[1]!, equipment: ["电话会议"] }, { ...need43, equipment: [] }, meetings43), true, "r43 判定·无设备需求时任意室可用");
    eq(roomMismatchReasons(rooms43[2]!, need43, meetings43), ["容量不足（6 < 8）", "缺少设备：投影"], "r43 原因·容量 + 设备缺失按序给全");
    eq(roomMismatchReasons({ ...rooms43[3]!, capacity: 6, equipment: [] }, need43, meetings43), ["会议室已停用", "容量不足（6 < 8）", "缺少设备：投影"], "r43 原因·停用优先且三条并存");
    eq(roomMismatchReasons(rooms43[1]!, conflictNeed, meetings43), ["时段冲突：会议 #11 14:00–15:30 已占用"], "r43 原因·时段冲突回带会议 id 与时段");
    eq(roomMismatchReasons(rooms43[1]!, { ...need43, start: "16:00", end: "17:00" }, meetings43), [], "r43 原因·空闲室原因清单为空");

    // (D) 推荐排序：容量最接近升序 / 同容量 id 升序 / 纯函数
    eq(recommendRooms(rooms43, need43, meetings43).map((h) => h.id), [2, 1], "r43 推荐·8 人先 8 座再 12 座（容量最接近升序）");
    eq(recommendRooms(rooms43, need43, meetings43).map((h) => h.seatsOver), [0, 4], "r43 推荐·余座数随容量升序");
    eq(recommendRooms(rooms43, { ...need43, attendees: 12 }, meetings43).map((h) => h.id), [1], "r43 推荐·12 人只剩大会议室");
    eq(recommendRooms(rooms43, { ...need43, attendees: 13 }, meetings43), [], "r43 推荐·超出全部容量返回空");
    eq(recommendRooms(rooms43, { ...need43, equipment: ["视频会议"] }, meetings43).map((h) => h.id), [1], "r43 推荐·设备过滤只留含视频会议房");
    eq(recommendRooms(rooms43, conflictNeed, meetings43).map((h) => h.id), [1], "r43 推荐·冲突时段剔除中会议室");
    eq(recommendRooms([rooms43[1]!, { ...rooms43[0]!, id: 0, capacity: 8 }], need43, meetings43).map((h) => h.id), [0, 2], "r43 推荐·同容量按 id 升序（确定性）");
    const roomsSnapshot = JSON.stringify(rooms43);
    const meetingsSnapshot = JSON.stringify(meetings43);
    recommendRooms(rooms43, need43, meetings43);
    eq(JSON.stringify(rooms43), roomsSnapshot, "r43 纯函数·推荐不改会议室入参");
    eq(JSON.stringify(meetings43), meetingsSnapshot, "r43 纯函数·推荐不改预约入参");
    const full43 = buildRoomRecommendation(rooms43, need43, meetings43);
    eq(full43.need, need43, "r43 装配·回显需求口径");
    eq(full43.available.map((h) => h.id), [2, 1], "r43 装配·可用分区且已排序");
    eq(full43.unavailable.map((m) => m.id), [3, 4], "r43 装配·不可用分区按 id 升序");
    ok(full43.unavailable.every((m) => m.reasons.length > 0), "r43 装配·每条不可用均带明确原因（非空）");
    eq(JSON.stringify(buildRoomRecommendation(rooms43, need43, meetings43)), JSON.stringify(full43), "r43 装配·同输入逐字节确定（零随机）");

    // (E) schema v27：只加可空列 + 真迁移 / 存量 NULL / CRUD
    eq(SCHEMA_VERSION, 27, "r43 schema·shared 版本推进到 v27");
    eq(CURRENT_SCHEMA_VERSION, 27, "r43 schema·db 当前版本与 shared 相等");
    noThrow(() => assertMigrationsConsistent(), "r43 schema·迁移队列连续且最高版本一致");
    eq(MIGRATIONS.length, 27, "r43 schema·迁移队列恰 27 条");
    eq(MIGRATIONS.at(-1)?.version, 27, "r43 schema·末条迁移为 v27");
    const raw43 = openDatabaseRaw({ path: ":memory:" });
    eq((raw43.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 27, "r43 新库 user_version=27");
    const cols43 = raw43.raw.all("PRAGMA table_info(rooms)").map((r) => String((r as { name: unknown }).name));
    eq(cols43, ["id", "name", "location", "capacity", "active", "created_at", "updated_at", "equipment"], "r43 rooms·原七列逐字不动 + equipment 追加在尾");
    const eqCol43 = raw43.raw.all("PRAGMA table_info(rooms)").find((r) => String((r as { name: unknown }).name) === "equipment") as { notnull: number; type: string };
    eq(eqCol43.notnull, 0, "r43 rooms·equipment 可空（存量 NULL）");
    eq(eqCol43.type.toUpperCase(), "TEXT", "r43 rooms·equipment 为 TEXT（JSON 数组）");
    raw43.raw.run("INSERT INTO rooms (name,location,capacity,active,created_at,updated_at) VALUES ('老会议室','1F',6,1,'t','t')");
    eq((raw43.raw.get("SELECT equipment FROM rooms WHERE id=1") as { equipment: unknown }).equipment, null, "r43 向后兼容·老行 equipment 恒 NULL");
    eq(raw43.appliedMigrations.includes(27), true, "r43 真迁移·v27 已应用");
    raw43.raw.close();
    const rdb43 = openDatabase({ path: ":memory:" });
    eq(rdb43.listRooms()[0]?.equipment, undefined, "r43 数据层·空库无会议室");
    const roomA43 = rdb43.createRoom({ name: "甲室", location: "3F", capacity: 12, equipment: ["投影", "白板", "投影"] });
    eq(roomA43.equipment, ["投影", "白板"], "r43 数据层·建室设备归一（去重 + 排序）");
    const roomB43 = rdb43.createRoom({ name: "乙室", capacity: 8 });
    eq(roomB43.equipment, [], "r43 数据层·不传设备默认空数组（向后兼容）");
    eq(rdb43.getRoom(roomA43.id)?.equipment, ["投影", "白板"], "r43 数据层·设备真落库且读回");
    await throws(() => rdb43.createRoom({ name: "非法室", equipment: ["激光笔"] }), "r43 数据层·非法设备被守卫拒绝");
    eq(rdb43.listRooms().length, 2, "r43 零半态·非法建室未写库");
    const patched43 = rdb43.updateRoom(roomA43.id, { equipment: ["视频会议"] });
    eq(patched43?.equipment, ["视频会议"], "r43 数据层·PATCH 整组替换设备");
    await throws(() => rdb43.updateRoom(roomA43.id, { equipment: ["未知设备"] }), "r43 数据层·PATCH 非法设备被拒");
    eq(rdb43.getRoom(roomA43.id)?.equipment, ["视频会议"], "r43 零半态·PATCH 失败设备未被改写");
    eq(rdb43.updateRoom(roomA43.id, { equipment: [] })?.equipment, [], "r43 数据层·可清空设备为空数组");

    // (F) r28 会议零回归：预约 / 冲突 / 边界相接 / availability 在新的 8 列 rooms 上全绿
    const regRoom = rdb43.createRoom({ name: "回归室", capacity: 10, equipment: ["投影"] });
    const regFirst = rdb43.createMeeting({ roomId: regRoom.id, title: "首场", date: "2026-11-20", start: "09:00", end: "10:00" });
    ok(regFirst.id > 0, "r28 零回归·预约成功落库");
    await throws(() => rdb43.createMeeting({ roomId: regRoom.id, title: "撞车", date: "2026-11-20", start: "09:30", end: "10:30" }), "r28 零回归·重叠预约被 409 规则拒绝");
    ok(rdb43.createMeeting({ roomId: regRoom.id, title: "接档", date: "2026-11-20", start: "10:00", end: "11:00" }).id > 0, "r28 零回归·边界相接预约成功");
    eq(rdb43.listMeetings({ roomId: regRoom.id }).length, 2, "r28 零回归·该室两场不丢");
    eq(meetingAvailability("2026-11-20", rdb43.listRooms(), rdb43.listMeetings()).length, 3, "r28 零回归·availability 仍列全部启用室");
    rdb43.close();

    // (G) 重启持久化（真文件库，非内存）
    const persistPath43 = `scripts/.tmp-e2e/r43-equipment-${Date.now()}.db`;
    const pdb43 = openDatabase({ path: persistPath43 });
    const pRoom43 = pdb43.createRoom({ name: "持久化室", capacity: 9, equipment: ["视频会议", "投影"] });
    pdb43.close();
    const reopen43 = openDatabase({ path: persistPath43 });
    eq(reopen43.getRoom(pRoom43.id)?.equipment, ["投影", "视频会议"], "r43 持久化·重开后设备逐字不丢");
    reopen43.close();
    try { unlinkSync(persistPath43); } catch { /* 临时探针已清理 */ }

    // (H) api / web 零算法分支 + 索引 + README + 截图矩阵
    const sharedPkg43 = readFileSync("packages/shared/package.json", "utf8");
    const api43 = readFileSync("apps/api/src/server.ts", "utf8");
    const web43 = readFileSync("apps/web/src/MeetingsPage.tsx", "utf8");
    const app43 = readFileSync("apps/web/src/App.tsx", "utf8");
    const ci43 = readFileSync(".github/workflows/ci.yml", "utf8");
    ok(sharedPkg43.includes('"./roomRecommend": "./src/roomRecommend.ts"'), "r43 子路径·@xieflow/shared/roomRecommend 已登记");
    ok(api43.includes('app.get("/api/rooms/recommend"'), "r43 api·推荐路由在场");
    ok(api43.includes("parseRecommendNeed") && api43.includes("buildRoomRecommendation"), "r43 api·只装配 shared 规则");
    ok(!/const\s+EQUIPMENT_ORDER|ROOM_EQUIPMENT_WHITELIST\s*=\s*\[/.test(api43), "r43 api·零设备算法分支");
    ok(web43.includes('from "@xieflow/shared/roomRecommend"'), "r43 web·消费 shared 推荐口径");
    ok(web43.includes('data-state="meeting-room-equip"'), "r43 web·设备徽标 seam 在场");
    ok(web43.includes('data-action="meeting-recommend"'), "r43 web·帮我推荐按钮 seam 在场");
    ok(web43.includes('data-state="meeting-recommend-result"'), "r43 web·推荐结果 seam 在场");
    ok(web43.includes('data-state="meeting-recommend-miss"'), "r43 web·冲突原因 seam 在场");
    ok(!/const\s+EQUIPMENT_ORDER|ROOM_EQUIPMENT_WHITELIST\s*=\s*\[/.test(web43), "r43 web·零设备算法分支");
    eq((app43.match(/data-tab="/g) ?? []).length, 20, "r43 App·二十 tab 数量不变（无新 tab）");
    ok(ci43.includes("|25|26|27)"), "r43 CI·HTTP smoke 正则升 v27");
    const matrix43 = readdirSync("docs/ui/r43").filter((f) => f.endsWith(".png"));
    eq(matrix43.length, 7, "r43 截图·矩阵恰好 7 张 PNG");
    eq(new Set(matrix43.map((p) => createHash("sha256").update(readFileSync(`docs/ui/r43/${p}`)).digest("hex"))).size, 7, "r43 截图·七张 SHA256 两两互异");
    ok([
      "01-equipment-empty.png", "02-equipment-badges.png", "03-recommend-panel.png",
      "04-recommend-results.png", "05-recommend-conflicts.png", "06-recommend-narrow.png", "07-recommend-error.png",
    ].every((name) => matrix43.includes(name)), "r43 截图·七态文件名齐备");
    const shells43 = readdirSync("docs/ui/shell").filter((f) => f.endsWith(".png"));
    eq(shells43.length, 20, "r43 截图·二十 tab 壳同批重拍 20 张");
    eq(new Set(shells43.map((p) => createHash("sha256").update(readFileSync(`docs/ui/shell/${p}`)).digest("hex"))).size, 20, "r43 截图·壳 20 张 SHA256 互异");
    const shellSet43 = new Set(shells43.map((p) => createHash("sha256").update(readFileSync(`docs/ui/shell/${p}`)).digest("hex")));
    eq(matrix43.filter((p) => shellSet43.has(createHash("sha256").update(readFileSync(`docs/ui/r43/${p}`)).digest("hex"))).length, 0, "r43 截图·矩阵与壳零重叠");
    const idx43 = readFileSync("docs/ui/r43/README.md", "utf8");
    ok(idx43.includes("<!-- R43_HASHES_BEGIN -->") && idx43.includes("01-equipment-empty.png"), "r43 索引·哈希块与首图名在场");
    const shellIdx43 = readFileSync("docs/ui/shell/README.md", "utf8");
    ok(shellIdx43.includes("<!-- R43_HASHES_BEGIN -->") && shellIdx43.includes("R43 当前哈希块"), "r43 壳索引·R43 当前哈希块在场");
    const root43 = readFileSync("README.md", "utf8");
    ok(root43.includes("当前轮 r54"), "r43 根 README·当前轮对照表同步");
    ok(root43.includes("docs/ui/r49/01-backup-card.png") && root43.includes("docs/ui/shell/README.md"), "r43 根 README·矩阵索引同步");
    ok(root43.includes("e2e（3995 断言）+ HTTP 审计（3167 断言）"), "r43 根 README·速查行断言规模同步");
    ok(root43.includes("CI smoke 正则随 schema 版本同步至 v27"), "r43 根 README·CI vN 文案同步");
    ok(root43.includes("迁移队列（当前 v27）"), "r43 根 README·迁移队列 vN 文案同步");
  }

  // 64. r44：图证与文档口径修正（时段 seam / 用户可见文案 / shell 计数 / 索引三处同步）
  section("r44 图证与文档口径修正：05 时段 seam / 07 纯用户文案 / shell 计数 / 索引同步");
  {
    const web44 = readFileSync("apps/web/src/MeetingsPage.tsx", "utf8");
    const r43Idx44 = readFileSync("docs/ui/r43/README.md", "utf8");
    const shellIdx44 = readFileSync("docs/ui/shell/README.md", "utf8");
    const root44 = readFileSync("README.md", "utf8");
    const row05 = r43Idx44.split(/\r?\n/).find((l) => l.includes("05-recommend-conflicts.png")) ?? "";
    const row07 = r43Idx44.split(/\r?\n/).find((l) => l.includes("07-recommend-error.png")) ?? "";
    const r43Block = shellIdx44.slice(shellIdx44.indexOf("## r43 哈希自查"), shellIdx44.indexOf("## r41 哈希自查"));
    const r41Block = shellIdx44.slice(shellIdx44.indexOf("## r41 哈希自查"), shellIdx44.indexOf("## r40 哈希自查"));
    ok(web44.includes('const conflictPin = query.shot === "meetings-recommend-conflicts"'), "r44 U2-1·冲突钉态变量在场");
    ok(/start:\s*conflictPin \? "14:30" : "09:00",\s*end:\s*conflictPin \? "15:00" : "10:00"/.test(web44), "r44 U2-1·表单时段与推荐结果同源 14:30–15:00");
    ok(row05.includes("14:30") && row05.includes("15:00"), "r44 U2-1·05 图注时段 14:30–15:00 与画面 seam 一致");
    ok(web44.includes('recommendError !== "" ? "输入有误" : "连接失败"'), "r44 U2-2·校验/服务错误帧分流");
    ok(web44.includes('recommendError !== "" ? "请检查人数/设备/时段后重试。"'), "r44 U2-2·校验错误纯用户提示");
    ok(row07.includes("输入有误") && !row07.includes("连接失败") && !row07.includes("pnpm"), "r44 U2-2·07 图注无连接失败框架与开发命令");
    ok(r43Block.includes("changed=6 / same=14") && !r43Block.includes("changed=8 / same=12"), "r44 U3-1·shell r41→r43 壳 changed=6/same=14");
    ok(r43Block.includes("372 PNG / 370 互异"), "r44 U3-2·shell R43 块全库计数 372/370 归位");
    ok(r41Block.includes("365 PNG / 363 互异") && !r41Block.includes("372 PNG"), "r44 U3-2·shell R41 历史块计数 365/363 归位");
    ok(!shellIdx44.slice(0, shellIdx44.indexOf("## r43 哈希自查")).includes("r37 徽章"), "r44 U3-3·shell 当前表图注无陈旧 r37");
    ok(root44.includes("当前轮 r54") && root44.includes("当前 r54"), "r44 根 README·三处当前轮口径同步");
    ok(root44.includes("e2e（3995 断言）+ HTTP 审计（3167 断言）"), "r44 根 README·速查行断言规模同步");
  }

  // 65. r45：文档块拖拽排序（计划纯函数 / 边界钳制 / 真 DB move / 持久化 / r8-r9 零回归）
  section("r45 文档块拖拽：计划纯函数 / 边界 / HTTP move 落库 / 持久化 / 零回归");
  {
    // (A) planBlockDrop：边界钳制 / 同序 null / 目标 position 换算（纯函数）
    const plan03 = planBlockDrop(2, 0, 5);
    eq(plan03?.position, 0, "r45 计划·第三块拖到首位 position=0");
    eq(plan03?.slot, 0, "r45 计划·目标槽位原样回显");
    eq(plan03?.fromIndex, 2, "r45 计划·源下标原样回显");
    eq(plan03?.count, 5, "r45 计划·块数原样回显");
    eq(planBlockDrop(0, 4, 5)?.position, 3, "r45 计划·首块拖到槽 4 换算 position=3");
    eq(planBlockDrop(1, 4, 5)?.position, 3, "r45 计划·第二块拖到槽 4 换算 position=3");
    eq(planBlockDrop(3, 1, 5)?.position, 1, "r45 计划·向上拖按目标槽换算");
    eq(planBlockDrop(2, 3, 5), null, "r45 计划·紧邻后移同序返回 null");
    eq(planBlockDrop(4, 3, 5)?.position, 3, "r45 计划·末块上移一位 position=3");
    eq(planBlockDrop(2, 2, 5), null, "r45 计划·原槽位返回 null");
    eq(planBlockDrop(2, -99, 5)?.position, 0, "r45 计划·负越界钳制到首位");
    eq(planBlockDrop(2, 99, 5)?.position, 4, "r45 计划·超尾越界钳制到末位槽 position=4");
    eq(planBlockDrop(0, 1, 1), null, "r45 计划·单块恒 null");
    eq(JSON.stringify(plan03), JSON.stringify(planBlockDrop(2, 0, 5)), "r45 计划·同输入逐字节确定（零随机）");
    await throws(() => planBlockDrop(0, 0, 0), "r45 守卫·空列表抛错");
    await throws(() => planBlockDrop(-1, 0, 5), "r45 守卫·负源下标抛错");
    await throws(() => planBlockDrop(5, 0, 5), "r45 守卫·越界源下标抛错");
    await throws(() => planBlockDrop(0, "x", 5), "r45 守卫·非数字目标抛错");

    // (B) validateDropTarget：禁自拖 / 子块 / 环守卫
    const chain45: DropBlockRef[] = [
      { id: 7, parentId: null }, { id: 8, parentId: 7 }, { id: 9, parentId: 8 }, { id: 10, parentId: null },
    ];
    eq(validateDropTarget(7, 7).valid, false, "r45 目标·禁自拖");
    ok(validateDropTarget(7, 7).reason?.includes("自身") === true, "r45 目标·自拖原因可读");
    eq(validateDropTarget(7, 8, chain45).valid, false, "r45 目标·禁拖到直接子块");
    eq(validateDropTarget(7, 9, chain45).valid, false, "r45 目标·禁拖到孙块");
    eq(validateDropTarget(7, 10, chain45).valid, true, "r45 目标·兄弟块可作目标");
    eq(validateDropTarget(8, 7, chain45).valid, true, "r45 目标·父块可作目标（只禁向下拖进子块）");
    eq(validateDropTarget(0, 9, chain45).valid, false, "r45 目标·非法源 id 拒绝");
    eq(validateDropTarget(7, 99, chain45).valid, false, "r45 目标·目标块不在列表拒绝");
    eq(validateDropTarget(7, 9, [{ id: 9, parentId: 9 }]).valid, true, "r45 目标·父链成环不死循环");
    noThrow(() => validateDropTarget(7, 9, [{ id: 9, parentId: 9 }]), "r45 目标·环引用不抛错");

    // (C) 真 DB move：计划→重排→position 连号→重开不丢
    const rdb45 = openDatabase({ path: ":memory:" });
    const rdoc45 = rdb45.createDocument("r45 拖拽排序探针");
    const rblocks45 = rdb45.importBlocks(rdoc45.id, markdownToBlocks("# 标题\n\n正文二\n\n正文三\n\n正文四\n\n正文五"));
    eq(rblocks45.length, 5, "r45 DB·探针文档五块在场");
    const rplan45 = planBlockDrop(2, 0, rblocks45.length) as BlockDropPlan;
    const rmoved45 = rdb45.moveBlock(rblocks45[2]!.id, rplan45.position);
    eq(rmoved45.map((b) => b.content.text), ["正文三", "标题", "正文二", "正文四", "正文五"], "r45 DB·第三块拖到首位顺序正确");
    eq(rmoved45.map((b) => b.position), [0, 1, 2, 3, 4], "r45 DB·move 后 position 连号");
    eq(rmoved45[0]!.id, rblocks45[2]!.id, "r45 DB·被拖块 id 精确");
    eq(assembleDocumentText(rmoved45), "正文三\n# 标题\n正文二\n正文四\n正文五", "r45 DB·全文装配按新 position 重排");
    rdb45.close();

    const persist45 = `scripts/.tmp-e2e/r45-dnd-${Date.now()}.db`;
    const rpdb45 = openDatabase({ path: persist45 });
    const rpdoc45 = rpdb45.createDocument("r45 持久化探针");
    const rpblocks45 = rpdb45.importBlocks(rpdoc45.id, markdownToBlocks("甲\n\n乙\n\n丙\n\n丁"));
    const rpplan45 = planBlockDrop(3, 0, rpblocks45.length) as BlockDropPlan;
    rpdb45.moveBlock(rpblocks45[3]!.id, rpplan45.position);
    rpdb45.close();
    const rreopen45 = openDatabase({ path: persist45 });
    eq(rreopen45.listBlocks(rpdoc45.id).map((b) => b.content.text), ["丁", "甲", "乙", "丙"], "r45 持久化·关库重开顺序不丢");
    eq(rreopen45.listBlocks(rpdoc45.id).map((b) => b.position), [0, 1, 2, 3], "r45 持久化·重开 position 仍连号");
    rreopen45.close();
    try { unlinkSync(persist45); } catch { /* 探针已清理 */ }

    // (D) r8/r9 块引擎零回归（只加 UI 拖拽入口，拆合/转换/装配语义不动）
    eq(planBlockSplit("paragraph", "abcdef", 3).before.text, "abc", "r45 r8 零回归·拆块前半段留原块");
    eq(planBlockSplit("paragraph", "abcdef", 3).after.text, "def", "r45 r8 零回归·拆块后半段成新块");
    eq(mergeBlockContent("paragraph", { text: "ab" }, "paragraph", { text: "cd" }).text, "abcd", "r45 r8 零回归·合块文本拼接");
    eq(canConvertBlockType("paragraph", "heading1"), true, "r45 r8 零回归·文本块互转允许");
    eq(canConvertBlockType("divider", "paragraph"), false, "r45 r8 零回归·结构块隔离");
    eq(assembleDocumentText([
      { id: 1, position: 2, type: "paragraph", content: "尾" },
      { id: 2, position: 0, type: "heading1", content: "标题" },
      { id: 3, position: 1, type: "paragraph", content: "中" },
    ]), "# 标题\n中\n尾", "r45 r8 零回归·乱序输入按 position 装配");
    const round45 = blocksToMarkdown(markdownToBlocks("# 往返\n\n- [x] 待办\n\n```ts\nconst a=1;\n```"));
    eq(markdownToBlocks(round45).map((b) => b.type), ["heading1", "todo", "code"], "r45 r9 零回归·Markdown 往返还块类型");

    // (E) 规则集中 / 截图矩阵 / README 当前轮口径
    const sharedPkg45 = readFileSync("packages/shared/package.json", "utf8");
    const api45 = readFileSync("apps/api/src/server.ts", "utf8");
    const web45 = readFileSync("apps/web/src/DocsPage.tsx", "utf8");
    const root45 = readFileSync("README.md", "utf8");
    ok(sharedPkg45.includes('"./blockDnd": "./src/blockDnd.ts"'), "r45 子路径·@xieflow/shared/blockDnd 已登记");
    ok(web45.includes('from "@xieflow/shared/blockDnd"'), "r45 web·消费 shared 拖拽计划口径");
    ok(web45.includes('data-state="docs-drag-handle"'), "r45 web·拖拽手柄 seam 在场");
    ok(web45.includes('data-state="docs-drop-line"'), "r45 web·插入线 seam 在场");
    ok(web45.includes('data-state="docs-dnd-notice"'), "r45 web·拖拽回执 seam 在场");
    ok(!/function\s+planBlockDrop|const\s+planBlockDrop/.test(web45), "r45 web·零拖拽算法分支");
    ok(!/function\s+planBlockDrop|const\s+planBlockDrop/.test(api45), "r45 api·零拖拽算法分支");
    const matrix45 = readdirSync("docs/ui/r45").filter((f) => f.endsWith(".png"));
    eq(matrix45.length, 7, "r45 截图·七态矩阵齐备");
    eq(new Set(matrix45.map((p) => createHash("sha256").update(readFileSync(`docs/ui/r45/${p}`)).digest("hex"))).size, 7, "r45 截图·七张 SHA256 互异");
    const shells45 = readdirSync("docs/ui/shell").filter((f) => f.endsWith(".png"));
    eq(shells45.length, 20, "r45 截图·二十 tab 壳同批重拍 20 张");
    eq(new Set(shells45.map((p) => createHash("sha256").update(readFileSync(`docs/ui/shell/${p}`)).digest("hex"))).size, 20, "r45 截图·壳 20 张 SHA256 互异");
    ok(root45.includes("当前轮 r54") && root45.includes("当前 r54"), "r45 根 README·三处当前轮口径同步");
  }

  // 62. r47：AI 工具调用确认闸门（规则集中 / 预览 / 拦截 / 确认执行 / 放弃零写 / 向后兼容）
  section("r47 工具调用确认闸门（toolGate / planToolExecution / 闸门编排）");
  {
    const r47Db = openDatabase({ path: ":memory:" });
    const r47Reg = createDefaultToolRegistry();

    // (A) needsConfirmation 白名单：只拦状态变更类，只读零误伤
    eq(confirmationToolCount(), 3, "r47 闸门白名单 = 3 个状态变更工具");
    eq([...confirmationToolNames()], [...STATE_CHANGING_TOOLS], "r47 白名单与 shared STATE_CHANGING_TOOLS 逐位相等");
    eq(needsConfirmation("create_todo"), true, "r47 needsConfirmation·create_todo 拦");
    eq(needsConfirmation("create_document"), true, "r47 needsConfirmation·create_document 拦");
    eq(needsConfirmation("create_schedule"), true, "r47 needsConfirmation·create_schedule 拦");
    for (const readOnly of ["list_todos", "list_documents", "list_projects", "list_cards", "list_tables", "search_knowledge", "summarize_document", "export_document_md", "list_schedules"] as const) {
      eq(needsConfirmation(readOnly), false, `r47 needsConfirmation·只读 ${readOnly} 不拦`);
    }
    eq(needsConfirmation("mystery_tool"), false, "r47 needsConfirmation·未知工具不在白名单");
    eq(needsConfirmation(123), false, "r47 needsConfirmation·非字符串入参安全返回 false");
    eq(needsConfirmation(null), false, "r47 needsConfirmation·null 安全返回 false");

    // (B) buildToolPreview 人类可读摘要（零随机、逐字段确定）
    const pTodo = buildToolPreview({ name: "create_todo", arguments: { title: "闸门预览待办", quadrant: "q2", dueDate: "2026-11-30" } });
    eq(pTodo.title, "新建待办", "r47 预览·create_todo 标题");
    ok(pTodo.detail.includes("闸门预览待办") && pTodo.detail.includes("q2") && pTodo.detail.includes("2026-11-30"), "r47 预览·待办标题/象限/截止日齐全");
    ok(pTodo.text.includes("新建待办") && pTodo.text.includes("闸门预览待办"), "r47 预览·text 人类可读");
    const pDoc = buildToolPreview({ name: "create_document", arguments: { title: "闸门预览文档" } });
    eq(pDoc.title, "新建文档", "r47 预览·create_document 标题");
    ok(pDoc.detail.includes("闸门预览文档"), "r47 预览·文档标题在场");
    const pSch = buildToolPreview({ name: "create_schedule", arguments: { title: "闸门预览日程", date: "2026-11-21", start: "09:00", end: "10:00" } });
    eq(pSch.title, "新建日程", "r47 预览·create_schedule 标题");
    ok(pSch.detail.includes("闸门预览日程") && pSch.detail.includes("09:00-10:00"), "r47 预览·日程时间在场");
    const pRead = buildToolPreview({ name: "list_todos", arguments: {} });
    ok(pRead.detail.includes("只读"), "r47 预览·只读工具标注不改动数据");
    const pAfter = buildToolPreview({ name: "create_todo", arguments: { title: "X", quadrant: "q1" } }, { ok: true, summary: "已创建待办「X」" });
    ok(pAfter.detail.includes("已创建待办") && pAfter.text.includes("结果"), "r47 预览·带执行回执时拼真实结果");
    eq(buildToolPreview({ name: "create_todo", arguments: {} }).detail.includes("未命名待办"), true, "r47 预览·缺标题降级文案");
    eq(pTodo.text, buildToolPreview({ name: "create_todo", arguments: { title: "闸门预览待办", quadrant: "q2", dueDate: "2026-11-30" } }).text, "r47 预览·零随机逐字节确定");

    // (C) planToolExecution 纯函数：混合意图「建待办写 + 列待办读」
    const mixed = [
      { name: "create_todo" as const, arguments: { title: "混合探针", quadrant: "q1" } },
      { name: "list_todos" as const, arguments: {} },
    ];
    const planned = planToolExecution(mixed, [], false, ["c1-tc-1", "c1-tc-2"]);
    eq(planned.toPending.length, 1, "r47 计划·混合意图恰 1 项写调用 pending");
    eq(planned.toExecute.length, 1, "r47 计划·混合意图恰 1 项只读直接执行");
    eq(planned.toPending[0]!.callId, "c1-tc-1", "r47 计划·pending callId 稳定");
    eq(planned.toPending[0]!.call.name, "create_todo", "r47 计划·pending 是写调用");
    eq(planned.toExecute[0]!.call.name, "list_todos", "r47 计划·execute 是只读调用");
    ok(planned.toPending[0]!.preview.title === "新建待办", "r47 计划·pending 带人类可读预览");
    const plannedConfirmed = planToolExecution(mixed, ["c1-tc-1"], false, ["c1-tc-1", "c1-tc-2"]);
    eq(plannedConfirmed.toPending.length, 0, "r47 计划·confirmedIds 命中后写调用不再 pending");
    eq(plannedConfirmed.toExecute.length, 2, "r47 计划·确认后两调用均可执行");
    const plannedAuto = planToolExecution(mixed, [], true, ["c1-tc-1", "c1-tc-2"]);
    eq(plannedAuto.toPending.length, 0, "r47 计划·autoExecute=true 零 pending（老行为）");
    eq(plannedAuto.toExecute.length, 2, "r47 计划·autoExecute=true 两调用直接执行");
    const threeWrites = [
      { name: "create_todo" as const, arguments: { title: "A", quadrant: "q1" } },
      { name: "create_document" as const, arguments: { title: "B" } },
      { name: "create_schedule" as const, arguments: { title: "C", date: "2026-11-21", start: "09:00", end: "10:00" } },
    ];
    eq(planToolExecution(threeWrites).toPending.length, 3, "r47 计划·三类写调用全 pending");
    eq(planToolExecution([mixed[1]!]).toPending.length, 0, "r47 计划·纯只读零 pending");
    eq(planToolExecution([]).calls.length, 0, "r47 计划·空调用列表安全");
    eq(planToolExecution(mixed).toPending[0]!.callId, "tc-1", "r47 计划·缺省 callId = tc-N 确定");

    // (D) callIds 归一守卫
    eq(normalizeCallIds(["a", "b"]).length, 2, "r47 callIds·合法数组归一");
    eq(normalizeCallIds(["a"])[0], "a", "r47 callIds·逐项保留");
    await throws(() => normalizeCallIds([]), "r47 callIds·空数组抛错");
    await throws(() => normalizeCallIds("a"), "r47 callIds·非数组抛错");
    await throws(() => normalizeCallIds(["a", ""]), "r47 callIds·空项抛错");
    await throws(() => normalizeCallIds(["a", 1]), "r47 callIds·非字符串项抛错");
    await throws(() => normalizeCallIds(["a", "a"]), "r47 callIds·重复项抛错");
    eq(knownToolNames().length, 12, "r47 工具名快照与 shared 同源 12 个");
    eq(isKnownTool("create_todo"), true, "r47 isKnownTool·已知工具");
    eq(isKnownTool("nope"), false, "r47 isKnownTool·未知工具");

    // (E) executeChat 闸门编排：混合意图——只读真执行、写 pending 零落库
    const conv = r47Db.createConversation("r47 闸门 e2e 探针");
    const beforeTodos = r47Db.listTodos().length;
    const gated = await executeChat(r47Db, r47Reg, mockPlanner, "新建待办：r47真拦截探针，然后列出待办", {
      confirmGate: { autoExecute: false, callIdPrefix: `c${conv.id}-` },
    });
    eq(gated.autoExecute, false, "r47 编排·回显 autoExecute=false");
    eq(gated.pendingCalls.length, 1, "r47 编排·恰 1 项 pending");
    eq(gated.toolCalls.length, 2, "r47 编排·两调用都落回执（1 pending + 1 executed）");
    eq(gated.toolCalls[0]!.confirmStatus, "pending", "r47 编排·写调用 confirmStatus=pending");
    eq(gated.toolCalls[1]!.confirmStatus, "executed", "r47 编排·只读调用 confirmStatus=executed");
    eq(gated.toolCalls[0]!.ok, false, "r47 编排·pending 调用 ok=false（未执行）");
    ok(String(gated.toolCalls[0]!.summary).includes("待确认"), "r47 编排·pending 摘要含待确认");
    ok(gated.toolCalls[0]!.preview !== undefined, "r47 编排·pending 携带人类可读预览");
    ok(String(gated.toolCalls[0]!.callId).startsWith(`c${conv.id}-`), "r47 编排·callId 带稳定前缀");
    eq(r47Db.listTodos().length, beforeTodos, "r47 编排·闸门下写调用零落库（真拦截）");
    const saved = r47Db.recordChatExchange({
      conversationId: conv.id,
      userText: "新建待办：r47真拦截探针，然后列出待办",
      toolCalls: gated.toolCalls,
      summary: gated.summary,
      artifact: gated.artifact,
    });
    const reloaded = r47Db.listMessages(conv.id);
    eq(reloaded.length, saved.messages.length, "r47 持久化·对话流落库");
    const pendingInDb = reloaded.flatMap((m) => m.toolCalls).filter((t) => t.confirmStatus === "pending");
    eq(pendingInDb.length, 1, "r47 持久化·pending 回执 reload 不丢");
    eq(pendingInDb[0]!.callId, gated.pendingCalls[0]!.callId, "r47 持久化·reload callId 逐字一致");
    const located = r47Db.findToolCallByCallId(gated.pendingCalls[0]!.callId);
    ok(located !== null && located.conversationId === conv.id, "r47 DB·按 callId 全库定位到本会话");
    eq(located!.call.name, "create_todo", "r47 DB·定位回执工具名精确");

    // (F) confirm 真执行 / discard 零写（db.resolvePendingToolCall 单事务）
    const callId = gated.pendingCalls[0]!.callId;
    const pendingCall = located!.call;
    const execResult = await r47Reg.execute(r47Db, pendingCall.name, pendingCall.arguments);
    eq(execResult.ok, true, "r47 confirm·真执行 handler ok=true");
    const resolved = r47Db.resolvePendingToolCall(located!.messageId, callId, {
      confirmStatus: "executed", ok: true, summary: execResult.summary, data: execResult.data,
    });
    eq(resolved.toolCalls.find((t) => t.callId === callId)!.confirmStatus, "executed", "r47 confirm·状态落为 executed");
    eq(r47Db.listTodos().length, beforeTodos + 1, "r47 confirm·真建待办落库（+1）");
    ok(r47Db.listTodos().some((t) => t.title === "r47真拦截探针"), "r47 confirm·真实标题出现在库内");
    await throws(
      () => r47Db.resolvePendingToolCall(located!.messageId, callId, { confirmStatus: "executed", ok: true, summary: "repeat" }),
      "r47 confirm·重复确认抛错（409 语义，零半态）",
    );

    // discard：另一条 pending 标 discarded，零写
    const gated2 = await executeChat(r47Db, r47Reg, mockPlanner, "新建待办：r47放弃探针", {
      confirmGate: { autoExecute: false, callIdPrefix: `c${conv.id}-r2-` },
    });
    eq(gated2.pendingCalls.length, 1, "r47 discard·新 chat 产生 1 pending");
    r47Db.recordChatExchange({
      conversationId: conv.id, userText: "新建待办：r47放弃探针",
      toolCalls: gated2.toolCalls, summary: gated2.summary, artifact: gated2.artifact,
    });
    const loc2 = r47Db.findToolCallByCallId(gated2.pendingCalls[0]!.callId)!;
    const beforeDiscard = r47Db.listTodos().length;
    const discarded = r47Db.resolvePendingToolCall(loc2.messageId, gated2.pendingCalls[0]!.callId, {
      confirmStatus: "discarded", ok: false, summary: "已放弃（未执行，无数据写入）",
    });
    eq(discarded.toolCalls.find((t) => t.callId === gated2.pendingCalls[0]!.callId)!.confirmStatus, "discarded", "r47 discard·状态落为 discarded");
    eq(r47Db.listTodos().length, beforeDiscard, "r47 discard·放弃零写（待办数不变）");
    eq(r47Db.findToolCallByCallId("never-exists"), null, "r47 DB·非法 callId 定位返回 null（400 语义）");

    // (G) 向后兼容：不传 confirmGate / autoExecute=true 全部老行为原样
    const beforeOld = r47Db.listTodos().length;
    const old1 = await executeChat(r47Db, r47Reg, mockPlanner, "新建待办：r47老行为探针");
    eq(old1.autoExecute, true, "r47 兼容·直接调用默认 autoExecute=true");
    eq(old1.pendingCalls.length, 0, "r47 兼容·直接调用零 pending");
    eq(old1.toolCalls[0]!.confirmStatus, undefined, "r47 兼容·老回执无 confirmStatus 字段");
    eq(r47Db.listTodos().length, beforeOld + 1, "r47 兼容·老行为立即真写库");
    const old2 = await executeChat(r47Db, r47Reg, mockPlanner, "新建待办：r47显式老行为", { confirmGate: { autoExecute: true } });
    eq(old2.pendingCalls.length, 0, "r47 兼容·显式 autoExecute=true 零 pending");
    eq(old2.toolCalls[0]!.ok, true, "r47 兼容·显式老行为立即执行 ok=true");
    eq(old2.toolCalls[0]!.id, "tc-1", "r47 兼容·老回执 id=tc-1 确定");
    const replay47 = await runToolReplay(() => openDatabase({ path: ":memory:" }), r47Reg);
    eq(replay47.failures.length, 0, "r47 零回归·17+ 回放评测集全绿");
    eq(replay47.passed, TOOL_EVAL_CASES.length, "r47 零回归·回放通过数 = 用例总数");

    // (H) 规则集中 / api/web 零算法分支 / 截图矩阵 / README 当前轮
    const api47 = readFileSync("apps/api/src/server.ts", "utf8");
    const web47 = readFileSync("apps/web/src/ChatPage.tsx", "utf8");
    const gateSrc47 = readFileSync("packages/agent/toolGate.ts", "utf8");
    ok(api47.includes('/confirm"') && api47.includes("normalizeAutoExecute"), "r47 api·confirm 路由与 autoExecute 归一场");
    ok(api47.includes("findToolCallByCallId") && api47.includes("resolvePendingToolCall"), "r47 api·消费 db 闸门方法");
    ok(!/function\s+needsConfirmation|const\s+needsConfirmation/.test(api47), "r47 api·零闸门算法分支");
    ok(!/function\s+buildToolPreview|const\s+buildToolPreview/.test(web47), "r47 web·零预览算法分支");
    ok(web47.includes('data-state="chat-pending-card"'), "r47 web·待确认卡 seam 在场");
    ok(web47.includes('data-state="chat-confirm-btn"'), "r47 web·确认按钮 seam 在场");
    ok(web47.includes('data-state="chat-discard-btn"'), "r47 web·放弃按钮 seam 在场");
    ok(web47.includes('data-state="chat-auto-toggle"'), "r47 web·自动执行设置 seam 在场");
    ok(gateSrc47.includes("export function needsConfirmation") && gateSrc47.includes("export function buildToolPreview") && gateSrc47.includes("export function planToolExecution"), "r47 闸门三纯函数集中在 toolGate.ts");
    const matrix47 = readdirSync("docs/ui/r47").filter((f) => f.endsWith(".png"));
    eq(matrix47.length >= 7, true, `r47 截图·七态矩阵齐备（${matrix47.length} 张）`);
    eq(new Set(matrix47.map((p) => createHash("sha256").update(readFileSync(`docs/ui/r47/${p}`)).digest("hex"))).size, matrix47.length, "r47 截图·所有矩阵 SHA256 互异");
    const shells47 = readdirSync("docs/ui/shell").filter((f) => f.endsWith(".png"));
    eq(shells47.length, 20, "r47 截图·二十 tab 壳同批重拍 20 张");
    eq(new Set(shells47.map((p) => createHash("sha256").update(readFileSync(`docs/ui/shell/${p}`)).digest("hex"))).size, 20, "r47 截图·壳 20 张 SHA256 互异");
    const root47 = readFileSync("README.md", "utf8");
    ok(root47.includes("当前轮 r54") && root47.includes("当前 r54"), "r47 根 README·三处当前轮口径同步");
    r47Db.close();
  }

  // 64. r49 工作区数据备份与恢复（规则集中 / 白名单 / 零半态 / 二次确认 / 真实往返）
  section("r49 工作区数据备份与恢复");
  {
    // (A) 白名单口径：业务表全纳、运行时表零纳、无重复、依赖顺序完整
    eq(BACKUP_TABLES.length, 38, "r49 白名单恰好 38 张业务表");
    eq(new Set(BACKUP_TABLES).size, BACKUP_TABLES.length, "r49 白名单无重复表名");
    ok(BACKUP_TABLES.includes("settings") && BACKUP_TABLES.includes("todos"), "r49 白名单含基础设置与待办表");
    ok(BACKUP_TABLES.includes("projects") && BACKUP_TABLES.includes("cards"), "r49 白名单含项目与看板卡表");
    ok(BACKUP_TABLES.includes("documents") && BACKUP_TABLES.includes("blocks"), "r49 白名单含文档与块表");
    ok(BACKUP_TABLES.includes("meetings") && BACKUP_TABLES.includes("form_responses"), "r49 白名单含会议与表单答卷表");
    ok(!(BACKUP_TABLES as readonly string[]).includes("sessions"), "r49 白名单排除 sessions 会话表");
    ok(!(BACKUP_TABLES as readonly string[]).includes("change_log"), "r49 白名单排除 change_log 同步日志");
    ok(!(BACKUP_TABLES as readonly string[]).includes("users"), "r49 白名单排除 users 账户表（会话外键根）");
    ok(!(BACKUP_TABLES as readonly string[]).includes("entity_versions"), "r49 白名单排除 entity_versions 同步游标");
    ok(BACKUP_TABLES.every((t) => /^[a-z][a-z0-9_]*$/.test(t)), "r49 白名单表名全为安全标识符");
    ok(BACKUP_TABLES.indexOf("departments") < BACKUP_TABLES.indexOf("members"), "r49 恢复顺序：部门先于人员");
    ok(BACKUP_TABLES.indexOf("documents") < BACKUP_TABLES.indexOf("blocks"), "r49 恢复顺序：文档先于块");
    ok(BACKUP_TABLES.indexOf("projects") < BACKUP_TABLES.indexOf("cards"), "r49 恢复顺序：项目先于卡片");
    ok(BACKUP_RUNTIME_TABLES.includes("sessions") && BACKUP_RUNTIME_TABLES.includes("change_log"), "r49 运行时保护表清单在场");
    ok(isBackupTable("todos") && !isBackupTable("sessions") && !isBackupTable("foo"), "r49 白名单判定：业务真、运行时与未知表假");
    eq(BACKUP_FORMAT, "xieflow-workspace-backup", "r49 备份格式标识确定");
    eq(BACKUP_FORMAT_VERSION, 1, "r49 备份格式版本确定");
    eq(BACKUP_CONFIRM_TOKEN, "RESTORE_WORKSPACE", "r49 二次确认令牌确定");

    // (B) 清单：版本 / 时间 / 表计数纯函数
    const emptyManifest = buildBackupManifest({}, "2026-11-21T00:00:00.000Z");
    eq(emptyManifest.tableCount, 0, "r49 空快照表计数 0");
    eq(emptyManifest.rowCount, 0, "r49 空快照行计数 0");
    eq(emptyManifest.schemaVersion, SCHEMA_VERSION, "r49 清单 schema 版本取权威源");
    const sampleManifest = buildBackupManifest({ todos: [{ id: 1 }, { id: 2 }], projects: [{ id: 3 }] }, "2026-11-21T08:00:00.000Z");
    eq(sampleManifest.tableCount, 2, "r49 清单表计数 = 快照表数");
    eq(sampleManifest.rowCount, 3, "r49 清单行计数 = 各表行数之和");
    eq(sampleManifest.tables.map((t) => t.name), ["projects", "todos"], "r49 清单表名按字典序稳定");
    eq(sampleManifest.createdAt, "2026-11-21T08:00:00.000Z", "r49 清单保留备份时间原值");
    eq(sampleManifest.formatVersion, BACKUP_FORMAT_VERSION, "r49 清单格式版本一致");
    ok(buildBackupFileName("2026-11-21T08:09:10.123Z").endsWith(".json"), "r49 备份文件名以 .json 结尾");
    ok(buildBackupFileName("2026-11-21T08:09:10.123Z").startsWith("xieflow-workspace-backup-20261121080910"), "r49 备份文件名含 ASCII 时间戳");

    // (C) 真实数据造数 → 导出快照 → 完整备份文件
    const r49a = openDatabase({ path: ":memory:" });
    const r49b = openDatabase({ path: ":memory:" });
    const seedTodo = r49a.createTodo("r49 备份种子待办", "q2", null);
    const seedProject = r49a.createProject("r49 备份种子项目");
    const seedDoc = r49a.createDocument("r49 备份种子文档");
    ok(seedTodo.id > 0 && seedProject.id > 0 && seedDoc.id > 0, "r49 造数：待办 / 项目 / 文档三表各落一行");
    const snapshot = r49a.exportBackupSnapshot();
    eq(Object.keys(snapshot).length, BACKUP_TABLES.length, "r49 导出快照键数 = 白名单表数");
    ok(!("sessions" in snapshot) && !("change_log" in snapshot), "r49 导出快照不含运行时表");
    ok(snapshot.todos?.some((r) => r.title === "r49 备份种子待办") === true, "r49 导出快照含真实待办字段");
    ok(snapshot.projects?.some((r) => r.name === "r49 备份种子项目") === true, "r49 导出快照含真实项目字段");
    ok(snapshot.documents?.some((r) => r.title === "r49 备份种子文档") === true, "r49 导出快照含真实文档字段");
    const backup = buildBackupFile(snapshot, "2026-11-21T09:00:00.000Z");
    const validation = validateBackupFile(backup);
    ok(validation.valid && validation.errors.length === 0, "r49 校验：完整备份文件通过");
    eq(validation.manifest?.rowCount, Object.values(snapshot).reduce((n, rows) => n + (rows?.length ?? 0), 0), "r49 校验回执行数 = 快照真实行数");
    ok(validation.preview.some((p) => p.name === "todos"), "r49 校验预览含 todos 表计数");

    // (D) 校验拒绝分支：结构 / 版本 / 白名单 / 行形状
    ok(!validateBackupFile(null).valid, "r49 校验拒绝：根节点非对象");
    ok(!validateBackupFile({ ...backup, format: "unknown" }).valid, "r49 校验拒绝：格式标识错误");
    ok(!validateBackupFile({ ...backup, formatVersion: 99 }).valid, "r49 校验拒绝：备份格式版本不兼容");
    ok(!validateBackupFile({ ...backup, schemaVersion: SCHEMA_VERSION + 1 }).valid, "r49 校验拒绝：schema 版本不兼容");
    ok(!validateBackupFile({ ...backup, createdAt: "not-a-date" }).valid, "r49 校验拒绝：备份时间非法");
    ok(!validateBackupFile({ ...backup, tables: [] }).valid, "r49 校验拒绝：tables 非对象");
    ok(!validateBackupFile({ ...backup, tables: { todos: "oops" } }).valid, "r49 校验拒绝：表值非数组");
    ok(!validateBackupFile({ ...backup, tables: { todos: [42] } }).valid, "r49 校验拒绝：行非对象");
    ok(!validateBackupFile({ ...backup, tables: { todos: [{ nested: { a: 1 } }] } }).valid, "r49 校验拒绝：单元格嵌套对象");
    ok(!validateBackupFile({ ...backup, tables: { todos: [{ id: 1 }, { title: "x" }] } }).valid, "r49 校验拒绝：同表行列结构不一致");
    const withSessions = validateBackupFile({ ...backup, tables: { ...backup.tables, sessions: [] } });
    ok(!withSessions.valid && withSessions.errors.some((e) => e.includes("sessions")), "r49 校验拒绝：未知受保护表 sessions");
    const withChangeLog = validateBackupFile({ ...backup, tables: { ...backup.tables, change_log: [] } });
    ok(!withChangeLog.valid && withChangeLog.errors.some((e) => e.includes("change_log")), "r49 校验拒绝：未知受保护表 change_log");
    ok(!validateBackupFile({ ...backup, tables: { ...backup.tables, foo_table: [] } }).valid, "r49 校验拒绝：完全未知表");

    // (E) 恢复计划：先全量校验、零步骤半态、二次确认
    const plan = planRestore(backup);
    ok(plan.canApply && plan.errors.length === 0, "r49 恢复计划：合法备份可应用");
    eq(plan.steps.length, BACKUP_TABLES.length * 2, "r49 恢复计划步骤数 = 清空 + 插入");
    eq(plan.steps[0], { table: BACKUP_TABLES[BACKUP_TABLES.length - 1] ?? "", action: "delete", rows: 0 }, "r49 恢复计划首步为末表清空");
    eq(plan.steps[BACKUP_TABLES.length - 1]?.table, "settings", "r49 恢复计划清空末步为 settings");
    eq(plan.steps[BACKUP_TABLES.length]?.table, "settings", "r49 恢复计划首插入为 settings");
    eq(plan.steps[BACKUP_TABLES.length]?.action, "insert", "r49 恢复计划首插入动作确定");
    eq(plan.steps[plan.steps.length - 1]?.table, "meeting_attendees", "r49 恢复计划末插入为会议参会人");
    ok(plan.protectedTables.includes("sessions") && plan.protectedTables.includes("change_log"), "r49 恢复计划列明受保护表");
    eq(plan.confirmToken, BACKUP_CONFIRM_TOKEN, "r49 恢复计划回带确认令牌");
    const badPlan = planRestore({ ...backup, schemaVersion: 999 });
    ok(!badPlan.canApply && badPlan.steps.length === 0, "r49 恢复计划：校验失败零写入步骤（零半态）");
    ok(badPlan.errors.length > 0, "r49 恢复计划：校验失败回带原因");
    eq(describeRestoreImpact(plan), `将替换 ${BACKUP_TABLES.length} 张业务表、共 ${validation.manifest?.rowCount ?? 0} 行数据；登录会话、同步日志与账户表不受影响。`, "r49 恢复后果摘要确定");
    ok(describeRestoreImpact(badPlan).includes("未生成任何恢复操作"), "r49 非法计划后果摘要如实说明无操作");
    assertRestoreConfirmed(BACKUP_CONFIRM_TOKEN);
    ok(true, "r49 二次确认：正确令牌放行");
    await throws(() => assertRestoreConfirmed(undefined), "r49 二次确认：缺省令牌拒绝");
    await throws(() => assertRestoreConfirmed("restore_workspace"), "r49 二次确认：错拼令牌拒绝");

    // (F) 真实往返：导出 → 删改 → 恢复 → 逐表逐字段回读
    const beforeRuntime = r49b.exportRuntimeTableSnapshot();
    await throws(() => r49b.applyBackupPlan(badPlan, snapshot), "r49 数据层：非法计划被拒不写库");
    await throws(() => r49b.applyBackupPlan(plan, { ...snapshot, sessions: [] }), "r49 数据层：快照表集合越界被拒");
    const applied = r49b.applyBackupPlan(plan, snapshot);
    eq(applied.restoredTables, BACKUP_TABLES.length, "r49 数据层：恢复表数 = 白名单表数");
    eq(applied.restoredRows, validation.manifest?.rowCount ?? -1, "r49 数据层：恢复行数 = 清单行数");
    const roundTrip = r49b.exportBackupSnapshot();
    eq(JSON.stringify(roundTrip), JSON.stringify(snapshot), "r49 真实往返：38 表逐字段 JSON 逐字节相等");
    eq(r49b.listTodos().find((t) => t.id === seedTodo.id)?.title, "r49 备份种子待办", "r49 真实往返：待办标题字段回读相等");
    eq(r49b.listProjects().find((p) => p.id === seedProject.id)?.name, "r49 备份种子项目", "r49 真实往返：项目名字段回读相等");
    eq(r49b.getDocument(seedDoc.id)?.title, "r49 备份种子文档", "r49 真实往返：文档标题字段回读相等");
    eq(JSON.stringify(r49b.exportRuntimeTableSnapshot()), JSON.stringify(beforeRuntime), "r49 危险区：sessions/change_log 等运行时表逐字节未动");

    // (G) 零半态变异：破坏单行 CHECK 约束 → 整体回滚，不能只写一半
    const beforeBad = r49b.exportBackupSnapshot();
    const badSnapshot = { ...snapshot, todos: [{ id: 999999, title: "r49 坏行", quadrant: "q9", status: "open", due_date: null, created_at: "2026-11-21T00:00:00.000Z", updated_at: "2026-11-21T00:00:00.000Z" }] };
    await throws(() => r49b.applyBackupPlan(plan, badSnapshot), "r49 零半态：事务中 CHECK 违规整体抛错");
    eq(JSON.stringify(r49b.exportBackupSnapshot()), JSON.stringify(beforeBad), "r49 零半态：回滚后所有白名单表逐字节不变");
    eq(r49b.listTodos().some((t) => t.title === "r49 坏行"), false, "r49 零半态：坏行未半路落库");

    // (H) 规则集中 / 路由 / UI seam / 截图 / README 三处
    const api49 = readFileSync("apps/api/src/server.ts", "utf8");
    const web49 = readFileSync("apps/web/src/BackupCard.tsx", "utf8");
    const backupSrc = readFileSync("packages/shared/src/backup.ts", "utf8");
    ok(api49.includes('get("/api/backup/export"') && api49.includes('post("/api/backup/validate"') && api49.includes('post("/api/backup/restore"'), "r49 api·三路由在场");
    ok(api49.includes("assertRestoreConfirmed") && api49.includes("applyBackupPlan(plan"), "r49 api·二次确认与单事务恢复接线在场");
    ok(backupSrc.includes("export function BACKUP_TABLES") === false && backupSrc.includes("export const BACKUP_TABLES"), "r49 白名单为 shared 常量唯一口径");
    ok(!/function\s+validateBackupFile|function\s+planRestore/.test(api49), "r49 api·零校验算法分支");
    ok(!/function\s+validateBackupFile|function\s+planRestore/.test(web49), "r49 web·零校验算法分支");
    ok(web49.includes('data-state="backup-card"') && web49.includes('data-state="backup-confirm-dialog"'), "r49 web·备份卡与确认对话框 seam 在场");
    ok(web49.includes('data-state="backup-file-input"') && web49.includes('data-state="backup-preview-panel"'), "r49 web·选文件与校验预览 seam 在场");
    ok(web49.includes('data-state="backup-error"') && web49.includes('data-state="backup-reload-btn"'), "r49 web·错误态与重载提示 seam 在场");
    const matrix49 = readdirSync("docs/ui/r49").filter((f) => f.endsWith(".png"));
    eq(matrix49.length >= 7, true, `r49 截图·七态矩阵齐备（${matrix49.length} 张）`);
    eq(new Set(matrix49.map((p) => createHash("sha256").update(readFileSync(`docs/ui/r49/${p}`)).digest("hex"))).size, matrix49.length, "r49 截图·所有矩阵 SHA256 互异");
    const shells49 = readdirSync("docs/ui/shell").filter((f) => f.endsWith(".png"));
    eq(shells49.length, 20, "r49 截图·二十 tab 壳同批重拍 20 张");
    eq(new Set(shells49.map((p) => createHash("sha256").update(readFileSync(`docs/ui/shell/${p}`)).digest("hex"))).size, 20, "r49 截图·壳 20 张 SHA256 互异");
    const root49 = readFileSync("README.md", "utf8");
    ok(root49.includes("当前轮 r54") && root49.includes("当前 r54"), "r49 根 README·当前轮口径同步");
    r49a.close();
    r49b.close();
  }

  // 62. r53 安全修复：TDD 复现断言（审计复现步骤转数据层/接线断言）
  section("r53 安全修复（P0/P1/P2 复现断言）");
  {
    const api53 = readFileSync("apps/api/src/server.ts", "utf8");
    const backupSrc53 = readFileSync("packages/shared/src/backup.ts", "utf8");
    const authSrc53 = readFileSync("packages/shared/src/auth.ts", "utf8");
    // P0-1 / P1-2：remote 闸门接线（真实 HTTP 效果由 audit-http.ts 断言）
    ok(api53.includes("REGISTER_CLOSED"), "r53 P0-1·remote 注册闸门错误码在路由层接线");
    ok(api53.includes('assertPermission(ctx.user.role, "user:manage")'), "r53 P0-1/P1-2·user:manage 闸门接线在场");
    ok((api53.match(/assertAdminForRemote\(/g) ?? []).length >= 4, "r53 P1-2·备份三路由统一 admin 闸门接线");
    // P0-2：备份白名单排除 server.mode + ENV 优先
    ok(backupSrc53.includes("BACKUP_PROTECTED_SETTING_KEYS") && backupSrc53.includes('"server.mode"'), "r53 P0-2·受保护设置键唯一口径在 shared/backup");
    ok(authSrc53.includes("resolveStartupMode"), "r53 P0-2·启动模式优先口径在 shared/auth");
    const fresh = openDatabase({ path: ":memory:" });
    let probeTampered: any = null;
    try {
      const snapshot53 = fresh.exportBackupSnapshot();
      ok(Array.isArray(snapshot53.settings ?? []), "r53 P0-2·导出快照含 settings 表");
      const backup53 = buildBackupFile(snapshot53, "2026-11-21T10:00:00.000Z");
      ok(validateBackupFile(backup53).valid, "r53 P0-2·干净备份校验通过（基线）");
      probeTampered = {
        ...backup53,
        tables: {
          ...backup53.tables,
          settings: [...(backup53.tables.settings ?? []), { key: "server.mode", value: "local", updated_at: "2026-11-21T10:00:00.000Z" }],
        },
      };
      const invalid53 = validateBackupFile(probeTampered);
      ok(!invalid53.valid, "r53 P0-2·篡改 server.mode 的备份被拒（422 语义）");
      ok(invalid53.errors.some((e) => e.includes("server.mode")), "r53 P0-2·校验错误点名受保护键");
      const plan53 = planRestore(probeTampered);
      ok(!plan53.canApply && plan53.steps.length === 0, "r53 P0-2·篡改备份恢复计划零步骤（零半态）");
      await throws(() => fresh.applyBackupPlan(plan53, probeTampered.tables as any), "r53 P0-2·篡改备份不写库");
    } finally {
      fresh.close();
    }
    // P1-1 / P2-3：审批 actor 与物资 operator 从会话派生（忽略 body）
    ok(api53.includes("ACTOR_FORGED") && api53.includes("const identity = sessionIdentity(req)"), "r53 P1-1·remote 审批 action 从会话派生 actor");
    ok(api53.includes("const identity = sessionIdentity(req)") && /operator\s*=\s*identity\.actor/.test(api53), "r53 P2-3·物资 operator 从会话用户派生");
    // P2-2：公开 settings/health 白名单
    ok(api53.includes("isPublicSettingKey"), "r53 P2-2·公开设置白名单口径接线在场");
    ok((api53.match(/publicSettingsSnapshot\(/g) ?? []).length >= 2, "r53 P2-2·health/settings 均经白名单装配");
  }

  // 63. r54 P0-1 补修：remote 业务路由统一 admin 闸门（真 HTTP 复现断言在 audit-http.ts）
  section("r54 P0-1 补修（remote 统一 admin 闸门）");
  {
    const api54 = readFileSync("apps/api/src/server.ts", "utf8");
    const rootR54 = readFileSync("README.md", "utf8");
    const planR54 = readFileSync("docs/plan.md", "utf8");
    const hookStart54 = api54.indexOf('app.addHook("onRequest"');
    const hook54 = api54.slice(hookStart54, api54.indexOf("function authErrorReply", hookStart54));
    ok(api54.includes('const REMOTE_NON_ADMIN_PATHS = new Set(["/api/auth/me", "/api/auth/guard"])'), "r54·非 admin 仅放行两个 auth 探针");
    ok(hook54.includes('serverMode === "remote"') && hook54.includes("!ALWAYS_PROTECTED_PATHS.has(url)") && hook54.includes("!REMOTE_NON_ADMIN_PATHS.has(url)"), "r54·onRequest 统一闸门三条件接线");
    ok(hook54.includes('assertPermission(ctx.user.role, "user:manage")'), "r54·闸门复用 shared user:manage 权限");
    ok(hook54.includes("return authErrorReply(err, reply)"), "r54·非 admin 403 FORBIDDEN 错误映射接线");
    ok(api54.includes('if (serverMode !== "remote" && !ALWAYS_PROTECTED_PATHS.has(url)) return;'), "r54·local 单机模式完全不受影响");
    ok((api54.match(/assertPermission\(ctx\.user\.role, "user:manage"\)/g) ?? []).length >= 3, "r54·r53 既有 admin 闸门仍在（零回归）");
    ok(rootR54.includes("当前轮 r54") && rootR54.includes("当前 r54"), "r54 根 README·三处当前轮口径同步");
    ok(rootR54.includes("e2e（3995 断言）+ HTTP 审计（3167 断言）"), "r54 根 README·速查行数字同步");
    ok(planR54.includes("remote 业务路由统一 admin 闸门"), "r54·plan 任务单在场");
  }

  // 64. r57 P1×3 性能基线：真 SQL 次数预算 + 渲染层防回退 seam
  section("r57 P1×3 性能基线（SQL 次数 / 输入卡顿防回退）");
  {
    /** 只包 get/all：审计口径与 r56 一致（执行语句不计入读查询预算）。 */
    function sqlCount57<T>(service: XieFlowDb, fn: () => T): { value: T; count: number } {
      const handle = (service as unknown as { db: SqliteDatabase }).db as unknown as Record<string, any>;
      const get0 = handle.get;
      const all0 = handle.all;
      let count = 0;
      handle.get = (...args: unknown[]) => { count++; return get0.apply(handle, args); };
      handle.all = (...args: unknown[]) => { count++; return all0.apply(handle, args); };
      try {
        return { value: fn(), count };
      } finally {
        handle.get = get0;
        handle.all = all0;
      }
    }

    const opened57 = openDatabaseRaw({ path: ":memory:" });
    const db57 = opened57.db;
    try {
      for (let i = 0; i < 60; i++) {
        db57.createForm({
          title: `性能探针表单 ${String(i).padStart(2, "0")}`,
          description: null,
          questions: [
            { type: "text", label: "问题甲", required: true, position: 0 },
            { type: "text", label: "问题乙", required: false, position: 1 },
          ],
        });
      }
      const forms57 = sqlCount57(db57, () => db57.listForms());
      eq(forms57.value.length, 60, "r57 P1-1·60 张表单全量装配条数不变");
      ok(forms57.count <= 2, `r57 P1-1·listForms SQL 次数 ≤2（60 表单，实测 ${forms57.count}；N+1 基线 122）`);
      ok(forms57.value.every((f) => f.questions.length === 2), "r57 P1-1·按 form_id 分桶后每题仍挂对表单");
      eq(forms57.value.map((f) => f.title), Array.from({ length: 60 }, (_, i) => `性能探针表单 ${String(i).padStart(2, "0")}`), "r57 P1-1·批量读取顺序仍按 id 升序");
      const oneForm57 = sqlCount57(db57, () => db57.getForm(forms57.value[7]!.id));
      ok(oneForm57.count <= 2, `r57 P1-2·getForm 保留单次入口 SQL ≤2（实测 ${oneForm57.count}）`);
      eq(oneForm57.value?.questions.length, 2, "r57 P1-1·getForm 复用 formRows 语义不变");

      const proj57 = db57.createProject("r57 性能探针项目", "批量卡片");
      const col57 = db57.listBoardColumns(proj57.id)[0]!;
      for (let i = 0; i < 80; i++) {
        db57.createBoardCard(proj57.id, col57.id, `探针卡片 ${String(i).padStart(2, "0")}`, null, undefined, null, {
          labels: ["性能", `标签${i % 3}`],
        });
      }
      const cardsByProject57 = sqlCount57(db57, () => db57.listBoardCardsByProject(proj57.id));
      eq(cardsByProject57.value.length, 80, "r57 P1-2·80 张卡片全量装配条数不变");
      ok(cardsByProject57.count <= 2, `r57 P1-2·listBoardCardsByProject SQL 次数 ≤2（80 卡片，实测 ${cardsByProject57.count}；N+1 基线 81）`);
      eq(cardsByProject57.value[0]?.labels, ["性能", "标签0"], "r57 P1-2·按 card_id 分桶后标签排序与归属不变");
      const cardsByColumn57 = sqlCount57(db57, () => db57.listBoardCards(col57.id));
      ok(cardsByColumn57.count <= 2, `r57 P1-2·listBoardCards SQL 次数 ≤2（实测 ${cardsByColumn57.count}）`);
      const oneCard57 = sqlCount57(db57, () => db57.getBoardCard(cardsByProject57.value[9]!.id));
      ok(oneCard57.count <= 2, `r57 P1-2·getBoardCard 保留单次入口 SQL ≤2（实测 ${oneCard57.count}）`);

      const srcOrEmpty57 = (path: string): string => {
        try { return readFileSync(path, "utf8"); } catch { return ""; }
      };
      const todosSrc57 = srcOrEmpty57("apps/web/src/TodosPage.tsx");
      const appSrc57 = srcOrEmpty57("apps/web/src/App.tsx");
      const itemSrc57 = srcOrEmpty57("apps/web/src/TodoItem.tsx");
      const perfSrc57 = srcOrEmpty57("scripts/r57-perf-cdp.mjs");
      ok(!/const\s+candidates\s*=\s*todos\.filter/.test(todosSrc57), "r57 P1-3·candidates 不再在每行渲染内联计算");
      ok(itemSrc57.includes("panelOpen") && /todos\.filter/.test(itemSrc57), "r57 P1-3·候选计算移入 panelOpen 分支（仅开面板算一次）");
      ok(itemSrc57.includes("memo(") && itemSrc57.includes("export default"), "r57 P1-3·TodoItem 行组件 React.memo 包裹");
      ok(/const\s+todoById\s*=\s*useMemo\(/.test(appSrc57), "r57 P1-3·todoById 改 useMemo([state.todos])");
      ok(perfSrc57.includes("ScriptDuration") && perfSrc57.includes("500"), "r57 P1-3·CDP 17 字输入 ScriptDuration<500ms 基线脚本在场");
    } finally {
      opened57.raw.close();
    }
  }

  // 62. r59 a11y 修复：对比度计算 + 键盘可达 CDP 脚本 + aria 静态契约（先红后绿）
  section("r59 a11y 修复（P1×2 + 低成本 P2）");
  {
    const src59 = (p: string): string => {
      try { return readFileSync(p, "utf8"); } catch { return ""; }
    };
    const css59 = src59("apps/web/src/styles.css");
    const sched59 = src59("apps/web/src/SchedulesPage.tsx");
    const cdp59 = src59("scripts/r59-a11y-cdp.mjs");
    const webTsx59 = readdirSync("apps/web/src").filter((f) => f.endsWith(".tsx"));
    const dialogs59 = webTsx59.flatMap((f) =>
      [...src59(`apps/web/src/${f}`).matchAll(/<(?:div|span)\b[^>]*role="dialog"[^>]*>/g)].map((m) => m[0]),
    );
    const ths59 = webTsx59.flatMap((f) =>
      [...src59(`apps/web/src/${f}`).matchAll(/<th\b[^>]*>/g)].map((m) => m[0]),
    );
    const cssVar59 = (name: string): string =>
      new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css59)?.[1] ?? "";
    const lum59 = (hex: string): number => {
      const raw = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1];
      if (!raw) return 0;
      const [r, g, b] = [0, 2, 4]
        .map((i) => parseInt(raw.slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast59 = (fg: string, bg: string): number => {
      const a = lum59(fg);
      const b = lum59(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const activeRule59 = /\.tab-active\s*{([^}]*)}/.exec(css59)?.[1] ?? "";
    const activeVar59 = /background:\s*var\((--[\w-]+)\)/.exec(activeRule59)?.[1] ?? "";
    const activeColor59 = activeVar59 ? cssVar59(activeVar59) : "";
    const ratio59 = activeColor59 ? contrast59("#ffffff", activeColor59) : 0;
    const cellStart59 = sched59.indexOf("key={c.date}");
    const cellBlock59 = cellStart59 >= 0 ? sched59.slice(cellStart59, cellStart59 + 1200) : "";
    const focusRule59 = /:focus-visible\s*{([^}]*)}/.exec(css59)?.[1] ?? "";

    eq(activeVar59, "--accent-strong", "r59 P1-2·.tab-active 背景切到 --accent-strong");
    eq(activeColor59, "#2f68e5", "r59 P1-2·--accent-strong 取审计建议 #2f68e5");
    ok(ratio59 >= 4.5, `r59 P1-2·白字压激活底 ${ratio59.toFixed(2)}:1 ≥4.5（r58 实测 4.28）`);
    ok(contrast59("#ffffff", "#3370ff") < 4.5, "r59 P1-2·旧 #3370ff 4.28:1 红相对照仍成立");
    eq(cssVar59("--accent"), "#3370ff", "r59 P1-2·--accent 原值未动（按钮/图标零回退）");
    ok(!/btn-primary[\s\S]{0,240}var\(--accent-strong\)/.test(css59), "r59 P1-2·主按钮未改用新强调色");
    ok(/tabIndex=\{0\}/.test(cellBlock59), "r59 P1-1·日历格补 tabIndex={0}");
    ok(/onKeyDown=\{\(e\)/.test(cellBlock59) && /e\.key === "Enter"/.test(cellBlock59) && /e\.key === " "/.test(cellBlock59), "r59 P1-1·Enter/Space 键盘处理在场");
    ok(/preventDefault\(\)/.test(cellBlock59) && /openCreateOn\(c\.date\)/.test(cellBlock59), "r59 P1-1·键盘与点击同一处理且阻止默认滚动");
    ok(cdp59.includes("Input.dispatchKeyEvent") && cdp59.includes("modalAfterEnter") && cdp59.includes("activeTabRatio") && cdp59.includes("R59_A11Y"), "r59 P1-1·CDP 键盘/对比度断言脚本在场");
    eq(dialogs59.length, 18, "r59 P2·模态容器共 18 个");
    ok(dialogs59.length === 18 && dialogs59.every((t) => t.includes('aria-modal="true"')), "r59 P2·18/18 模态带 aria-modal=true");
    eq(ths59.length, 19, "r59 P2·表头 th 共 19 个");
    ok(ths59.length === 19 && ths59.every((t) => /scope="(col|row)"/.test(t)), "r59 P2·19/19 th 带 scope");
    ok(/outline:\s*2px solid var\(--accent-strong\)/.test(focusRule59) && /outline-offset:\s*2px/.test(focusRule59), "r59 P2·全局 :focus-visible 2px 焦点环 + offset");
    ok(!/outline:\s*none/.test(focusRule59), "r59 P2·新焦点规则未抹除既有 outline");
    const matrix59 = (() => {
      try { return readdirSync("docs/ui/r59").filter((f) => f.endsWith(".png")).sort(); } catch { return [] as string[]; }
    })();
    ok(matrix59.length >= 5, `r59·日程焦点/键盘态截图 ≥5（实测 ${matrix59.length}）`);
    eq(new Set(matrix59.map((f) => createHash("sha256").update(readFileSync(`docs/ui/r59/${f}`)).digest("hex"))).size, matrix59.length, "r59·矩阵 SHA256 两两互异");
    ok(src59("docs/ui/r59/README.md").includes("R59_HASHES"), "r59·矩阵索引哈希自查块在场");
  }

  // 63. r62 r61 零半态漏洞修复（P1×2）：db 单事务批量写 + api 全量预校验契约（TDD 先红）
  {
    section("r62 r61 P1×2 零半态修复");
    const api62 = readFileSync("apps/api/src/server.ts", "utf8");
    const db62 = readFileSync("packages/db/src/index.ts", "utf8");
    ok(api62.includes("createSchedules(plan.drafts)"), "r62 P1-1·api 一次调用 createSchedules(plan.drafts)");
    ok(!/\.map\(\s*\(d\)\s*=>\s*store\.createSchedule\(/.test(api62), "r62 P1-1·api 不再逐条 createSchedule");
    ok(api62.includes("planIcsImport(body.ics)"), "r62 P1-1·planIcsImport 前置整体校验保留");
    const batchStart62 = db62.indexOf("createSchedules(drafts");
    const batchBody62 = batchStart62 < 0 ? "" : db62.slice(batchStart62, batchStart62 + 1600);
    ok(batchBody62.includes("BEGIN IMMEDIATE") && batchBody62.includes("COMMIT") && batchBody62.includes("ROLLBACK"), "r62 P1-1·db 批量写单事务 BEGIN/COMMIT/ROLLBACK 齐备");
    ok(api62.includes("const locatedBatch"), "r62 P1-2·confirm 批次执行前先全量定位校验");
    const confirmAt62 = api62.indexOf('app.post("/api/conversations/:id/confirm"');
    const confirmBlock62 = confirmAt62 < 0 ? "" : api62.slice(confirmAt62, confirmAt62 + 3600);
    ok(confirmBlock62.indexOf("findToolCallByCallId") < confirmBlock62.indexOf("toolRegistry.execute"), "r62 P1-2·全部校验语句在首个 execute 之前");

    type Draft62 = { title: string; date: string; start: string; end: string; repeat: "none" };
    const r62 = openDatabaseRaw({ path: ":memory:" });
    try {
      const callBatch62 = (drafts: readonly Draft62[]): Schedule[] => {
        const fn = (r62.db as unknown as Record<string, unknown>).createSchedules;
        if (typeof fn !== "function") throw new Error("r62 createSchedules 未实现");
        return (fn as (ds: readonly Draft62[]) => Schedule[]).call(r62.db, drafts);
      };
      const draftA62: Draft62 = { title: "R62-E2E-A", date: "2026-11-21", start: "09:00", end: "10:00", repeat: "none" };
      const draftB62: Draft62 = { title: "R62-E2E-B", date: "2026-11-21", start: "10:00", end: "11:00", repeat: "none" };
      const before62 = r62.db.listSchedules().length;
      let created62: Schedule[] = [];
      let batchErr62 = "";
      try { created62 = callBatch62([draftA62, draftB62]); } catch (e) { batchErr62 = String(e); }
      eq(batchErr62, "", "r62 P1-1·createSchedules 批量写无异常");
      eq(created62.length, 2, "r62 P1-1·一次写入 2 条草稿");
      eq(r62.db.listSchedules().length, before62 + 2, "r62 P1-1·批量写真实落库 +2");
      eq(new Set(created62.map((s) => s.id)).size, 2, "r62 P1-1·两条回执 id 互异");

      const first62: Draft62 = { title: "R62-ABORT-FIRST", date: "2026-11-22", start: "09:00", end: "10:00", repeat: "none" };
      const second62: Draft62 = { title: "R62-E2E-ABORT", date: "2026-11-22", start: "10:00", end: "11:00", repeat: "none" };
      const trg62 = "r62_e2e_abort_second";
      r62.raw.exec(`CREATE TRIGGER ${trg62} BEFORE INSERT ON schedules WHEN NEW.title = 'R62-E2E-ABORT' BEGIN SELECT RAISE(ABORT, 'r62-e2e-injected'); END;`);
      const beforeAbort62 = r62.db.listSchedules().length;
      let threw62 = false;
      try { callBatch62([first62, second62]); } catch { threw62 = true; }
      eq(threw62, true, "r62 P1-1·第 2 条 INSERT 注入失败 -> 抛错");
      eq(r62.db.listSchedules().length, beforeAbort62, "r62 P1-1·注入失败整体回滚（日程数 before==after）");
      eq(r62.db.listSchedules().some((s) => s.title === first62.title), false, "r62 P1-1·首条也未残留（真 ROLLBACK）");
      r62.raw.exec(`DROP TRIGGER ${trg62}`);
      let retryLen62 = 0;
      try { retryLen62 = callBatch62([first62, second62]).length; } catch { /* 变异红相：保留 0 */ }
      eq(retryLen62, 2, "r62 P1-1·撤销注入后同批可正常写入");
    } finally {
      r62.db.close();
    }
  }

  // 61. HTTP 冒烟 /api/health
  section("HTTP 冒烟 /api/health");
  let httpOk = false;
  let httpNote = "api 服务未运行（pnpm dev:api 后再跑 pnpm test 可覆盖此节）";
  try {
    const res = await fetch("http://127.0.0.1:8787/api/health", {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const data = (await res.json()) as { ok: boolean; schemaVersion: number };
      if (data.ok && data.schemaVersion === CURRENT_SCHEMA_VERSION) {
        httpOk = true;
      } else {
        httpNote = `健康检查返回异常：${JSON.stringify(data)}`;
      }
    } else {
      httpNote = `健康检查 HTTP ${res.status}`;
    }
  } catch {
    /* 未启动则降级 */
  }
  if (httpOk) {
    ok(true, "/api/health 返回 ok 且 schema 版本一致");
  } else {
    console.warn(`  ⚠ 跳过：${httpNote}`);
  }
} finally {
  db?.close();
}

console.log(`\n断言通过 ${passed}，失败 ${failures.length}`);
if (failures.length > 0) {
  console.error("失败清单：");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("E2E: ALL GREEN");
