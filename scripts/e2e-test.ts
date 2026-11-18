// 协流 XieFlow — e2e-test.ts：直连服务层断言业务行为（IKanBot 模式）
// r2：todo 输入校验收紧（服务层守卫）+ 今/明/周汇总计数 + raw 直达 schema 约束。
// r1 复验 P4 指出的两条自洽占位断言在本轮替换为真实行为断言（raw SQL 触达 NOT NULL /
// CHECK 约束；迁移幂等改用 PRAGMA user_version 真实读回）。
// 路由层（HTTP 侧）断言在 scripts/audit-http.ts，独立成套计数。
// r4：看板数据层——reorderPositions 排序规则（shared 纯函数）+ schema v3→v4 迁移
// （projects / board_columns / cards）+ 服务层看板 CRUD 与跨列移动闭环。
// 运行：pnpm test
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
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
} from "@xieflow/shared";
import type { TodoStatus } from "@xieflow/shared";
import { pbkdf2Sync } from "node:crypto";
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
} from "@xieflow/shared/deploy";
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
} from "@xieflow/agent";
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
      [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      "v2 旧库重开补跑 v3+v4+v5+v6+v7+v8+v9+v10+v11+v12+v13+v14+v15 迁移（真实 PRAGMA 升级路径）",
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
      [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      "v3 旧库重开只补跑 v4+v5+v6+v7+v8+v9+v10+v11+v12+v13+v14 迁移（真实 PRAGMA 升级路径）",
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
      "升级后 user_version = CURRENT_SCHEMA_VERSION（15）",
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
    eq(FIELD_TYPES.length, 7, "字段类型共 7 种（text/number/date/select/multi-select/checkbox/url）");
    eq(
      [...FIELD_TYPES],
      ["text", "number", "date", "select", "multi-select", "checkbox", "url"],
      "字段类型清单与顺序固定",
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
    eq(v5Open.appliedMigrations, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], "v4 旧库重开只补跑 v5+v6+v7+v8+v9+v10+v11+v12+v13+v14 迁移（真实 PRAGMA 升级路径）");
    const tableNames = v5Open.raw
      .all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => String((r as unknown as { name: unknown }).name));
    ok(tableNames.includes("tables"), "v5 迁移后 tables 表存在（sqlite_master 真实读回）");
    ok(tableNames.includes("fields"), "v5 迁移后 fields 表存在（sqlite_master 真实读回）");
    ok(tableNames.includes("records"), "v5 迁移后 records 表存在（sqlite_master 真实读回）");
    eq(
      (v5Open.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = CURRENT_SCHEMA_VERSION（15）",
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
      { filterSpec: [], sortSpec: [], visibleFields: [] },
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
    eq(v6Open.appliedMigrations, [6, 7, 8, 9, 10, 11, 12, 13, 14, 15], "v5 旧库重开只补跑 v6+v7+v8+v9+v10+v11+v12+v13+v14 迁移（真实 PRAGMA 升级路径）");
    const tableNames = v6Open.raw
      .all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => String((r as unknown as { name: unknown }).name));
    ok(tableNames.includes("views"), "v6 迁移后 views 表存在（sqlite_master 真实读回）");
    eq(
      (v6Open.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = CURRENT_SCHEMA_VERSION（15）",
    );
    const rawDb6: SqliteDatabase = v6Open.raw;
    eq(
      (rawDb6.all("PRAGMA table_info(views)") as unknown as { name: unknown }[]).map((c) =>
        String(c.name),
      ),
      ["id", "table_id", "name", "filter_spec", "sort_spec", "visible_fields", "position", "created_at", "updated_at"],
      "views 表 9 列齐全（id / table_id / name / 三个 spec / position / 时间戳）",
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
    eq(v7Open.appliedMigrations, [7, 8, 9, 10, 11, 12, 13, 14, 15], "v6 旧库重开补跑 v7+v8+v9+v10+v11+v12+v13+v14 迁移（真实 PRAGMA 升级路径）");
    eq(
      (v7Open.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = CURRENT_SCHEMA_VERSION（15）",
    );
    const tables = (v7Open.raw.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('documents','blocks') ORDER BY name",
    ) as { name: string }[]).map((r) => r.name);
    eq(tables, ["blocks", "documents"], "v7 迁移建出 documents / blocks 两表");
    const docCols = (v7Open.raw.all("PRAGMA table_info(documents)") as { name: string }[]).map((r) => r.name);
    eq(docCols, ["id", "title", "created_at", "updated_at"], "documents 表 4 列逐名核对");
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
    eq(v8.appliedMigrations, [8, 9, 10, 11, 12, 13, 14, 15], "v7 旧库重开只补跑 v8+v9+v10+v11+v12+v13+v14 迁移（真实 PRAGMA 升级路径）");
    eq(
      (v8.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = CURRENT_SCHEMA_VERSION（15）",
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
    eq(v9.appliedMigrations, [9, 10, 11, 12, 13, 14, 15], "v8 旧库重开只补跑 v9+v10+v11+v12+v13+v14 迁移（真实 PRAGMA 升级路径）");
    eq(
      (v9.raw.get("PRAGMA user_version") as { user_version: number }).user_version,
      CURRENT_SCHEMA_VERSION,
      "升级后 user_version = CURRENT_SCHEMA_VERSION（15）",
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
    eq((raw14.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 15, "真实 PRAGMA user_version=15");
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
    eq((raw15.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 15, "真实 PRAGMA user_version=15");
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
    eq((raw16.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 15, "真实 PRAGMA user_version=15");
    eq(
      raw16.raw.all("PRAGMA table_info(approvals)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "title", "type", "applicant_id", "status", "current_assignee", "created_at", "updated_at"],
      "approvals 表八列由 v12 迁移创建",
    );
    eq(
      raw16.raw.all("PRAGMA table_info(approval_steps)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "approval_id", "order", "assignee", "action", "comment", "acted_at"],
      "approval_steps 表七列由 v12 迁移创建（order 列名保留）",
    );
    eq(
      raw16.raw.all("PRAGMA table_info(approval_cc)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "approval_id", "cc_user", "created_at"],
      "approval_cc 表四列由 v12 迁移创建",
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
    eq((raw17.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 15, "新库 user_version=15");
    eq(
      raw17.raw.all("PRAGMA table_info(assets)").map((r) => String((r as unknown as { name: unknown }).name)),
      ["id", "name", "category", "quantity", "unit", "location", "custodian", "created_at"],
      "assets 表八列由 v13 迁移创建",
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
    eq((raw18.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 15, "新库 user_version=15");
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
    eq((raw19.raw.get("PRAGMA user_version") as { user_version: number }).user_version, 15, "r19 新库 user_version=15");
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
    eq((appSrc.match(/data-tab="/g) ?? []).length, 14, "r19 tab 数量仍为 14（同步卡不占 tab）");
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
    ok(/r20 · 离线模式与 PWA/.test(appSrc), "r20 徽章推进到 M10 起步");
    ok(/@media \(max-width:\s*600px\)/.test(cssSrc), "r20 有 <=600px 移动断点");
    ok(/overflow-x:\s*hidden/.test(cssSrc), "r20 禁止横向溢出");
    ok(/min-height:\s*44px/.test(cssSrc), "r20 触摸目标 >=44px");
    ok(/bottom-nav|net-status/.test(cssSrc), "r20 底栏/状态条样式在场");
    eq((appSrc.match(/data-tab="/g) ?? []).length, 14, "r20 本轮无新 tab（顶栏/底栏只是布局变化，仍 14 tab）");
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

  // 54. HTTP 冒烟 /api/health
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
