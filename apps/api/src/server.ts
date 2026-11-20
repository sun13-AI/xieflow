// 协流 XieFlow — api 服务：健康探针 + settings + todos + schedules + 项目/看板路由（r4）
// 数据文件在 data/xieflow.db；audit-http.ts 对本服务的路由行为做断言。
// 路由层错误契约：输入非法 → 400（shared ValidationError）；id 不存在 → 404。
// 状态机校验走 shared（TODO_STATUS_TRANSITIONS），路由层不散落 if-else。
// r3 联动：待办 due_date ↔ 日程 date 双向同步（规则集中在 shared + db 服务层）。
// r4 看板：projects / board-columns / cards CRUD + 跨列移动
// （position 重排规则集中 shared reorderPositions，路由层只做装配与 400/404 映射）。
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, type XieFlowDb } from "@xieflow/db";
import { CURRENT_SCHEMA_VERSION } from "@xieflow/db";
import {
  ValidationError,
  assertValidTodoStatus,
  assertValidDueDate,
  assertValidScheduleDate,
  assertValidBoardName,
  assertValidTableName,
  assertValidFieldName,
  assertValidFieldType,
  assertValidFieldOptions,
  assertValidSortDirection,
  computeTodoSummary,
  assembleRangeSchedules,
  computeBoardStats,
  buildBoardCsvContent,
  buildBoardCsvFileName,
  canTransitionTodo,
  queryRecords,
  normalizeCsvImportPayload,
  planCsvImport,
  shouldCommitImport,
  assertValidDocumentTitle,
  normalizeMarkdownImportPayload,
  planMarkdownImport,
  shouldCommitMarkdownImport,
  blocksToMarkdown,
  buildDocumentMdFileName,
  assertValidRevisionInstruction,
  planRevisionApply,
  assertValidChatMessage,
  assertValidArtifactType,
  contentTypeForArtifactType,
  normalizeContextWindow,
  toPlannerContext,
  assertValidKnowledgeTitle,
  assertValidKnowledgeSourceType,
  assertValidKnowledgeContent,
  assertValidKnowledgeQuery,
  normalizeKnowledgeLimit,
  normalizeTracebackChunkId,
  assembleDocumentText,
  parseMarkdownToTree,
  buildWhiteboardMarkdown,
  isApprovalView,
  isUnitTaskStatus,
  isAssetTxType,
  normalizeSince,
  normalizeLimit,
  planOfflineReplay,
  assertValidOfflineReplayRequest,
  SyncConflictError,
  type RevisionRequest,
  type Schedule,
  type FieldType,
  type ViewFilterCondition,
} from "@xieflow/shared";
import {
  AUTH_PERMISSIONS,
  can as authCan,
  assertPermission,
  verifyPassword,
  validateSession,
  generateSessionToken,
  normalizeServerMode,
  assertValidServerMode,
  ConflictError,
  ForbiddenError,
  SESSION_TTL_MS,
  SESSION_MIN_TTL_MS,
  type AuthUser,
  type Session,
  type AuthPermission,
  type ServerMode,
} from "@xieflow/shared/auth";
import {
  createMockProvider,
  createDefaultToolRegistry,
  mockPlanner,
  executeChat,
  chunkText,
  searchChunks,
} from "@xieflow/agent";
import { memberSummary, assertAssignableMember, normalizeMemberRef, resolveMemberForUser } from "@xieflow/shared/org";
import { localDateStr } from "@xieflow/shared";
import {
  NOTIFICATION_TYPES,
  assertValidNotificationType,
  assertValidNotificationRef,
  buildNotification,
  shouldNotify,
  notificationSummary,
  queryNotifications,
  notificationTargetTab,
  notificationDeepLinkParams,
  collectNotificationCandidates,
} from "@xieflow/shared/notifications";
// r27：报表中心——所有算法/时间范围/环比口径只在 shared/reports，路由层零分支
import {
  parseReportRange,
  assembleReport,
  assertValidReportMetric,
  filterReportDetail,
  type ReportSource,
} from "@xieflow/shared/reports";

/** r27：只读装配当前库全部来源数据（六指标同一快照）；不写任何业务数据 */
function collectReportSource(store: XieFlowDb): ReportSource {
  const projects = store.listProjects();
  const boardColumns: { id: number; name: string }[] = [];
  const boardCards: NonNullable<ReportSource["boardCards"]>[number][] = [];
  for (const project of projects) {
    for (const column of store.listBoardColumns(project.id)) {
      boardColumns.push({ id: column.id, name: column.name });
      for (const card of store.listBoardCards(column.id)) {
        boardCards.push({ id: card.id, title: card.title, columnId: card.columnId, todoId: card.todoId, updatedAt: card.updatedAt });
      }
    }
  }
  const approvals = store.listApprovals();
  const approvalSteps = approvals.flatMap((a) => store.listApprovalSteps(a.id).map((s) => ({
    id: s.id, approvalId: s.approvalId, action: s.action, actedAt: s.actedAt,
  })));
  return {
    todos: store.listTodos().map((t) => ({ id: t.id, title: t.title, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt })),
    schedules: store.listSchedules().map((s) => ({ id: s.id, title: s.title, date: s.date, start: s.start })),
    boardColumns,
    boardCards,
    approvals,
    approvalSteps,
    assetTransactions: store.listAssetTransactions(),
    documents: store.listDocuments(),
  };
}

/** 报表查询参数只读装配：非法范围由 shared parseReportRange 抛 ValidationError -> 400 */
function reportRangeFromQuery(query: unknown): { from: string; to: string } {
  const q = query as { from?: unknown; to?: unknown };
  return parseReportRange(q.from, q.to);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "..", "data");
const DB_PATH = process.env.XIEFLOW_DB_PATH ?? join(DATA_DIR, "xieflow.db");
const PORT = Number(process.env.XIEFLOW_API_PORT ?? 8787);

mkdirSync(dirname(DB_PATH), { recursive: true });

let db: XieFlowDb | null = null;
try {
  db = openDatabase({ path: DB_PATH });
} catch (err) {
  // 启动即坏库：不让服务带病上线，进程退出由进程管理器重启
  console.error("[api] 数据库打开失败：", err);
  process.exit(1);
}

const ENV_MODE: ServerMode = normalizeServerMode(process.env.XIEFLOW_MODE);
let serverMode: ServerMode = ENV_MODE;
{
  const saved = db?.getSetting("server.mode");
  if (saved) serverMode = normalizeServerMode(saved.value);
}

const app = Fastify({ logger: { level: "warn" } });

/** 认证上下文：用户 + 会话 + 权限清单（全部来自 shared 唯一映射） */
interface AuthContext {
  readonly user: AuthUser;
  readonly session: Session;
  readonly permissions: readonly AuthPermission[];
}
type AuthRequest = FastifyRequest & { auth?: AuthContext };

/** 公开路由：注册 / 登录 / 登出 / 模式查询 / 健康探针 / settings 保持匿名可用 */
const PUBLIC_AUTH_PATHS = new Set([
  "/api/health", "/api/settings",
  "/api/auth/register", "/api/auth/login", "/api/auth/logout", "/api/auth/mode",
]);
/** 无论 local/remote 都强制鉴权的探针路由（audit 用它锁 401 与真实全链路） */
const ALWAYS_PROTECTED_PATHS = new Set(["/api/auth/me", "/api/auth/guard", "/api/auth/users"]);

function responseCleared(reply: FastifyReply): FastifyReply {
  return reply.header("X-Xieflow-Auth-Cleared", "1").code(401).send({
    error: "登录态无效或已过期，请重新登录",
    code: "UNAUTHORIZED",
    cleared: true,
  });
}

/** Bearer token 解析：头部优先，body.token 供登出等幂等入口使用 */
function tokenFromRequest(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (m) return (m[1] ?? "").trim();
  }
  const body = req.body as { token?: unknown } | undefined;
  if (body && typeof body.token === "string") return body.token;
  return null;
}

/** 会话解析唯一入口：坏 token / 过期 / 用户已删一律清会话并返回 null（401 清假登录态） */
function resolveAuth(req: FastifyRequest): AuthContext | null {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const store = requireDb();
  const session = store.getSessionByToken(token);
  if (!session) return null;
  if (!validateSession(session).valid) {
    store.deleteSession(session.token);
    return null;
  }
  const user = store.getUserById(session.userId);
  if (!user) {
    store.deleteSession(session.token);
    return null;
  }
  return { user, session, permissions: AUTH_PERMISSIONS[user.role] };
}

app.addHook("onRequest", async (req, reply) => {
  const url = (req.raw.url ?? "").split("?")[0] ?? "";
  if (!url.startsWith("/api/")) return;
  if (PUBLIC_AUTH_PATHS.has(url)) return;
  if (serverMode !== "remote" && !ALWAYS_PROTECTED_PATHS.has(url)) return;
  const ctx = resolveAuth(req);
  if (!ctx) return responseCleared(reply);
  (req as AuthRequest).auth = ctx;
  return;
});

function authErrorReply(err: unknown, reply: FastifyReply): FastifyReply {
  if (err instanceof ForbiddenError) return reply.code(403).send({ error: err.message, code: "FORBIDDEN" });
  if (err instanceof ConflictError) return reply.code(409).send({ error: err.message, code: "CONFLICT" });
  if (err instanceof ValidationError) return reply.code(400).send({ error: err.message });
  return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
}

/** 统一错误映射：ValidationError → 400，其余业务错误 → 400（消息透传） */
function toErrorReply(err: unknown, reply: FastifyReply): FastifyReply {
  const message = err instanceof Error ? err.message : String(err);
  return reply.code(400).send({ error: message });
}

function requireDb(): XieFlowDb {
  if (!db) throw new Error("数据库未连接");
  return db;
}

/** 路径参数 id 解析：非正整数 → 400（ValidationError），由各路由统一处理 */
function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`非法 id：${raw}`);
  }
  return id;
}

app.get("/api/health", async () => {
  const store = requireDb();
  // 探针：真读一次库，不只是进程活着
  store.setSetting("last_health_check", new Date().toISOString());
  const settings = store.listSettings();
  return { ok: true, schemaVersion: CURRENT_SCHEMA_VERSION, mode: serverMode, settings };
});

app.get("/api/settings", async () => {
  return { settings: requireDb().listSettings() };
});

// ---- todos（r2：列表/详情/新建/状态流转/删除 + 汇总计数） ----

interface CreateTodoBody {
  title?: unknown;
  quadrant?: unknown;
  dueDate?: unknown;
}

app.post("/api/todos", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as CreateTodoBody;
    if (typeof body.title !== "string") {
      throw new ValidationError("待办标题不能为空");
    }
    if (body.quadrant === undefined || body.quadrant === null) {
      throw new ValidationError("缺少 quadrant");
    }
    if (body.dueDate !== undefined && body.dueDate !== null && typeof body.dueDate !== "string") {
      throw new ValidationError("dueDate 必须是字符串或 null");
    }
    const todo = requireDb().createTodo(
      body.title,
      body.quadrant as string,
      (body.dueDate ?? null) as string | null,
    );
    return reply.code(201).send(todo);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/todos", async () => {
  const todos = requireDb().listTodos();
  // 象限/今/明/周计数在 api 侧计算并随列表下发（r2 任务单；断言见 audit-http）
  return { todos, summary: computeTodoSummary(todos) };
});

app.get("/api/todos/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const todo = requireDb().getTodo(id);
    if (!todo) {
      return reply.code(404).send({ error: `待办不存在：${id}` });
    }
    return todo;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

interface PatchTodoBody {
  status?: unknown;
}

app.patch("/api/todos/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as PatchTodoBody;
    assertValidTodoStatus(body.status);
    const store = requireDb();
    const current = store.getTodo(id);
    if (!current) {
      return reply.code(404).send({ error: `待办不存在：${id}` });
    }
    if (!canTransitionTodo(current.status, body.status)) {
      throw new ValidationError(`非法状态流转：${current.status} → ${body.status}`);
    }
    return store.transitionTodo(id, body.status);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/todos/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const deleted = requireDb().deleteTodo(id);
    if (!deleted) {
      return reply.code(404).send({ error: `待办不存在：${id}` });
    }
    return { deleted: true };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- schedules（r3：日程 CRUD + 区间查询 + 待办双向联动） ----

interface CreateScheduleBody {
  title?: unknown;
  date?: unknown;
  start?: unknown;
  end?: unknown;
  todoId?: unknown;
  repeat?: unknown;
}

app.post("/api/schedules", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as CreateScheduleBody;
    if (typeof body.title !== "string") {
      throw new ValidationError("日程标题不能为空");
    }
    if (body.date === undefined || body.date === null) {
      throw new ValidationError("缺少 date");
    }
    if (body.start === undefined || body.start === null) {
      throw new ValidationError("缺少 start");
    }
    if (body.end === undefined || body.end === null) {
      throw new ValidationError("缺少 end");
    }
    let todoId: number | null = null;
    if (body.todoId !== undefined && body.todoId !== null) {
      const n = Number(body.todoId);
      if (!Number.isInteger(n) || n <= 0) {
        throw new ValidationError(`非法 todoId：${String(body.todoId)}`);
      }
      todoId = n;
    }
    const schedule = requireDb().createSchedule(
      body.title,
      body.date as string,
      body.start as string,
      body.end as string,
      todoId,
      (body.repeat ?? "none") as Schedule["repeat"],
    );
    return reply.code(201).send(schedule);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/**
 * 区间查询：date 落在 [from, to] 的日程本体 + 各日程循环实例在窗口内的展开（并集去重）。
 * 非法 from/to → 400；from 晚于 to → 400。
 */
app.get("/api/schedules", async (req, reply) => {
  try {
    const q = (req.query ?? {}) as { from?: string; to?: string };
    const from = q.from ?? "";
    const to = q.to ?? "";
    assertValidScheduleDate(from);
    assertValidScheduleDate(to);
    if (to < from) {
      throw new ValidationError(`查询区间非法：from 晚于 to（${from} → ${to}）`);
    }
    const store = requireDb();
    // 装配规则集中在 shared（r3 返工#1 A）：本体落窗 + repeat 实例展开（含锚日在窗外的日程）+ 并集去重
    const schedules = assembleRangeSchedules(store.listSchedules(), { from, to });
    return { schedules };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/schedules/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const schedule = requireDb().getSchedule(id);
    if (!schedule) {
      return reply.code(404).send({ error: `日程不存在：${id}` });
    }
    return schedule;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

interface PatchScheduleBody {
  title?: unknown;
  date?: unknown;
  start?: unknown;
  end?: unknown;
  repeat?: unknown;
  todoId?: unknown;
}

app.patch("/api/schedules/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as PatchScheduleBody;
    const store = requireDb();
    if (store.getSchedule(id) === null) {
      return reply.code(404).send({ error: `日程不存在：${id}` });
    }
    const patch: Parameters<XieFlowDb["updateSchedule"]>[1] = {};
    if (body.title !== undefined) patch.title = body.title as string;
    if (body.repeat !== undefined) patch.repeat = body.repeat as Schedule["repeat"];
    if (body.start !== undefined) patch.start = body.start as string;
    if (body.end !== undefined) patch.end = body.end as string;
    if (body.todoId !== undefined) {
      if (body.todoId === null) {
        patch.todoId = null;
      } else {
        const n = Number(body.todoId);
        if (!Number.isInteger(n) || n <= 0) {
          throw new ValidationError(`非法 todoId：${String(body.todoId)}`);
        }
        patch.todoId = n;
      }
    }
    // date 走 updateScheduleDate（联动入口）：关联待办的 due_date 同步回写
    if (body.date !== undefined) {
      assertValidScheduleDate(body.date);
      return store.updateScheduleDate(id, body.date as string);
    }
    return store.updateSchedule(id, patch);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/schedules/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const deleted = requireDb().deleteSchedule(id);
    if (!deleted) {
      return reply.code(404).send({ error: `日程不存在：${id}` });
    }
    return { deleted: true };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- 联动路由（r3）：待办改期 / 查关联日程 ----

app.patch("/api/todos/:id/due-date", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as { dueDate?: unknown };
    assertValidDueDate(body.dueDate ?? null);
    const store = requireDb();
    if (store.getTodo(id) === null) {
      return reply.code(404).send({ error: `待办不存在：${id}` });
    }
    return store.updateTodoDueDate(id, (body.dueDate ?? null) as string | null);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/todos/:id/schedule", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const store = requireDb();
    if (store.getTodo(id) === null) {
      return reply.code(404).send({ error: `待办不存在：${id}` });
    }
    const linked = store.listSchedules().find((s) => s.todoId === id) ?? null;
    return { schedule: linked };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- projects（r4：项目 CRUD） ----

interface CreateProjectBody {
  name?: unknown;
  description?: unknown;
}

function parseDescription(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ValidationError("description 必须是字符串或 null");
  }
  return value;
}

app.post("/api/projects", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as CreateProjectBody;
    if (typeof body.name !== "string") {
      throw new ValidationError("看板名称不能为空");
    }
    const project = requireDb().createProject(body.name, parseDescription(body.description));
    return reply.code(201).send(project);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/projects", async () => {
  return { projects: requireDb().listProjects() };
});

app.get("/api/projects/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const project = requireDb().getProject(id);
    if (!project) {
      return reply.code(404).send({ error: `项目不存在：${id}` });
    }
    return project;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

interface PatchProjectBody {
  name?: unknown;
  description?: unknown;
}

app.patch("/api/projects/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as PatchProjectBody;
    const patch: Parameters<XieFlowDb["updateProject"]>[1] = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string") throw new ValidationError("看板名称不能为空");
      patch.name = body.name;
    }
    if (body.description !== undefined) patch.description = parseDescription(body.description);
    const updated = requireDb().updateProject(id, patch);
    return updated;
  } catch (err) {
    if (err instanceof Error && err.message.includes("项目不存在")) {
      const id = Number((req.params as { id: string }).id);
      return reply.code(404).send({ error: err.message });
    }
    return toErrorReply(err, reply);
  }
});

app.delete("/api/projects/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const deleted = requireDb().deleteProject(id);
    if (!deleted) {
      return reply.code(404).send({ error: `项目不存在：${id}` });
    }
    return { deleted: true };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- board columns（r4：列 CRUD + 排序） ----

interface CreateColumnBody {
  name?: unknown;
  position?: unknown;
}

app.post("/api/projects/:id/columns", async (req, reply) => {
  try {
    const projectId = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as CreateColumnBody;
    if (typeof body.name !== "string") {
      throw new ValidationError("看板名称不能为空");
    }
    // position 可缺省：服务层自动追加列尾
    const position =
      body.position === undefined || body.position === null
        ? undefined
        : Number(body.position);
    const column = requireDb().createBoardColumn(projectId, body.name, position as number);
    return reply.code(201).send(column);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/projects/:id/columns", async (req, reply) => {
  try {
    const projectId = parseId((req.params as { id: string }).id);
    const store = requireDb();
    if (store.getProject(projectId) === null) {
      return reply.code(404).send({ error: `项目不存在：${projectId}` });
    }
    return { columns: store.listBoardColumns(projectId) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

interface PatchColumnBody {
  name?: unknown;
  position?: unknown;
}

app.patch("/api/board-columns/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as PatchColumnBody;
    const patch: Parameters<XieFlowDb["updateBoardColumn"]>[1] = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string") throw new ValidationError("看板名称不能为空");
      patch.name = body.name;
    }
    if (body.position !== undefined) patch.position = Number(body.position);
    const updated = requireDb().updateBoardColumn(id, patch);
    return updated;
  } catch (err) {
    if (err instanceof Error && err.message.includes("看板列不存在")) {
      return reply.code(404).send({ error: err.message });
    }
    return toErrorReply(err, reply);
  }
});

app.delete("/api/board-columns/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const deleted = requireDb().deleteBoardColumn(id);
    if (!deleted) {
      return reply.code(404).send({ error: `看板列不存在：${id}` });
    }
    return { deleted: true };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- cards（r4：卡片 CRUD + 跨列移动） ----

interface CreateCardBody {
  title?: unknown;
  description?: unknown;
  position?: unknown;
  todoId?: unknown;
}

function parseOptionalId(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError(`非法 ${label}：${String(value)}`);
  }
  return n;
}

app.post("/api/projects/:id/columns/:colId/cards", async (req, reply) => {
  try {
    const projectId = parseId((req.params as { id: string }).id);
    const columnId = parseId((req.params as { colId: string }).colId);
    const body = (req.body ?? {}) as CreateCardBody;
    if (typeof body.title !== "string") {
      throw new ValidationError("看板名称不能为空");
    }
    const store = requireDb();
    // 项目存在性先行（404 语义），列归属一致性交服务层守卫（400 语义）
    if (store.getProject(projectId) === null) {
      return reply.code(404).send({ error: `项目不存在：${projectId}` });
    }
    const card = store.createBoardCard(
      projectId,
      columnId,
      body.title,
      parseDescription(body.description),
      parseOptionalId(body.position, "position"),
      body.todoId === undefined || body.todoId === null
        ? null
        : (parseOptionalId(body.todoId, "todoId") ?? null),
    );
    return reply.code(201).send(card);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/projects/:id/columns/:colId/cards", async (req, reply) => {
  try {
    const projectId = parseId((req.params as { id: string }).id);
    const columnId = parseId((req.params as { colId: string }).colId);
    const store = requireDb();
    if (store.getProject(projectId) === null) {
      return reply.code(404).send({ error: `项目不存在：${projectId}` });
    }
    if (store.getBoardColumn(columnId) === null) {
      return reply.code(404).send({ error: `看板列不存在：${columnId}` });
    }
    return { cards: store.listBoardCards(columnId) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/cards/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const card = requireDb().getBoardCard(id);
    if (!card) {
      return reply.code(404).send({ error: `卡片不存在：${id}` });
    }
    return card;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

interface PatchCardBody {
  title?: unknown;
  description?: unknown;
  todoId?: unknown;
}

app.patch("/api/cards/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as PatchCardBody;
    const patch: Parameters<XieFlowDb["updateBoardCard"]>[1] = {};
    if (body.title !== undefined) {
      if (typeof body.title !== "string") throw new ValidationError("看板名称不能为空");
      patch.title = body.title;
    }
    if (body.description !== undefined) patch.description = parseDescription(body.description);
    if (body.todoId !== undefined) {
      patch.todoId = body.todoId === null ? null : (parseOptionalId(body.todoId, "todoId") ?? null);
    }
    const updated = requireDb().updateBoardCard(id, patch);
    return updated;
  } catch (err) {
    if (err instanceof Error && err.message.includes("卡片不存在")) {
      return reply.code(404).send({ error: err.message });
    }
    return toErrorReply(err, reply);
  }
});

/**
 * 跨列移动（r4 任务单核心）：cardId 移到 columnId 的 position 位。
 * 重排规则集中 shared reorderPositions（服务层 moveBoardCard 唯一入口），
 * 源列与目标列的 position 在移动后都保持 0..n-1 连续（audit 有两侧实证断言）。
 * body 只带 position = 同列移动；带 columnId = 跨列移动（必须同项目，否则 400）。
 */
interface MoveCardBody {
  columnId?: unknown;
  position?: unknown;
}

app.patch("/api/cards/:id/move", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as MoveCardBody;
    const store = requireDb();
    if (store.getBoardCard(id) === null) {
      return reply.code(404).send({ error: `卡片不存在：${id}` });
    }
    if (body.position === undefined || body.position === null) {
      throw new ValidationError("缺少 position");
    }
    const to = Number(body.position);
    let targetColumnId: number | undefined;
    if (body.columnId !== undefined && body.columnId !== null) {
      targetColumnId = parseOptionalId(body.columnId, "columnId");
    }
    const moved =
      targetColumnId !== undefined
        ? store.moveBoardCard(id, targetColumnId, to)
        : store.moveBoardCardSameColumn(id, to);
    return moved;
  } catch (err) {
    if (err instanceof Error && err.message.includes("卡片不存在")) {
      return reply.code(404).send({ error: err.message });
    }
    return toErrorReply(err, reply);
  }
});

app.delete("/api/cards/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const deleted = requireDb().deleteBoardCard(id);
    if (!deleted) {
      return reply.code(404).send({ error: `卡片不存在：${id}` });
    }
    return { deleted: true };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- r5：看板统计与 CSV 台账导出（M2 收官） ----

/**
 * 看板统计（r5 任务单）：各列卡片数 / 完成率 / 待办关联数 + 项目合计。
 * 口径唯一入口 = shared computeBoardStats 纯函数（api 只装配数据 + 404/400 映射）；
 * 卡片移动后统计立即随之变化（口径与 r4 的 position 重排规则同源）。
 */
app.get("/api/projects/:id/stats", async (req, reply) => {
  try {
    const projectId = parseId((req.params as { id: string }).id);
    const store = requireDb();
    if (store.getProject(projectId) === null) {
      return reply.code(404).send({ error: `项目不存在：${projectId}` });
    }
    return computeBoardStats(
      projectId,
      store.listBoardColumns(projectId),
      store.listBoardCardsByProject(projectId),
      store.listTodos(),
    );
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/**
 * 看板台账导出（r5 任务单）：UTF-8 BOM + CRLF + RFC4180 转义，Excel 双击直开。
 * 内容唯一入口 = shared buildBoardCsvContent（每列至少一行：空列出占位行）。
 * r6 U2-2 必修：文件名含项目名（xieflow-board-<项目名>-<YYYYMMDD>.csv），不再只露内部 id；
 * 中文项目名按 RFC 5987 用 filename*=UTF-8'' 编码下发，同时给一个 ASCII 回落名。
 */
app.get("/api/projects/:id/export.csv", async (req, reply) => {
  try {
    const projectId = parseId((req.params as { id: string }).id);
    const store = requireDb();
    const project = store.getProject(projectId);
    if (!project) {
      return reply.code(404).send({ error: `项目不存在：${projectId}` });
    }
    const csv = buildBoardCsvContent(
      store.listBoardColumns(projectId),
      store.listBoardCardsByProject(projectId),
      store.listTodos(),
    );
    const fileName = buildBoardCsvFileName(project.name);
    const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, "_");
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header(
        "content-disposition",
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      )
      .send(csv);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- 多维表格（r6：表 / 字段 / 记录 + 筛选 / 排序 / 分页） ----
// 路由层只做「装配 + 400/404 映射」：字段类型的校验 / 归一 / 比较口径全在 shared
// （api 层不得出现类型分支——每种类型的差异只写 shared 一处）。

interface CreateTableBody {
  name?: unknown;
  description?: unknown;
}

app.post("/api/tables", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as CreateTableBody;
    if (typeof body.name !== "string") {
      throw new ValidationError("表格名称不能为空");
    }
    const table = requireDb().createTable(body.name, parseDescription(body.description));
    return reply.code(201).send(table);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/tables", async () => {
  return { tables: requireDb().listTables() };
});

app.get("/api/tables/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const table = requireDb().getTable(id);
    if (!table) {
      return reply.code(404).send({ error: `表格不存在：${id}` });
    }
    return table;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

interface PatchTableBody {
  name?: unknown;
  description?: unknown;
}

app.patch("/api/tables/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as PatchTableBody;
    const store = requireDb();
    if (store.getTable(id) === null) {
      return reply.code(404).send({ error: `表格不存在：${id}` });
    }
    const patch: Parameters<XieFlowDb["updateTable"]>[1] = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string") throw new ValidationError("表格名称不能为空");
      patch.name = body.name;
    }
    if (body.description !== undefined) patch.description = parseDescription(body.description);
    return store.updateTable(id, patch);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/tables/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const deleted = requireDb().deleteTable(id);
    if (!deleted) {
      return reply.code(404).send({ error: `表格不存在：${id}` });
    }
    return { deleted: true };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

interface CreateFieldBody {
  name?: unknown;
  type?: unknown;
  options?: unknown;
  position?: unknown;
}

/** 候选项请求体解析（只校验形状，类型语义交给 shared 守卫） */
function parseOptionsBody(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new ValidationError("options 必须是字符串数组");
  }
  return raw.map((item) => {
    if (typeof item !== "string") {
      throw new ValidationError("options 必须是字符串数组");
    }
    return item;
  });
}

app.post("/api/tables/:id/fields", async (req, reply) => {
  try {
    const tableId = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as CreateFieldBody;
    if (typeof body.name !== "string") {
      throw new ValidationError("字段名称不能为空");
    }
    const fieldType = body.type;
    assertValidFieldType(fieldType);
    const options = parseOptionsBody(body.options);
    assertValidFieldOptions(fieldType, options);
    const store = requireDb();
    if (store.getTable(tableId) === null) {
      return reply.code(404).send({ error: `表格不存在：${tableId}` });
    }
    const position =
      body.position === undefined || body.position === null ? undefined : Number(body.position);
    const field = store.createField(tableId, body.name, fieldType, options, position);
    return reply.code(201).send(field);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/tables/:id/fields", async (req, reply) => {
  try {
    const tableId = parseId((req.params as { id: string }).id);
    const store = requireDb();
    if (store.getTable(tableId) === null) {
      return reply.code(404).send({ error: `表格不存在：${tableId}` });
    }
    return { fields: store.listFields(tableId) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

interface PatchFieldBody {
  name?: unknown;
  type?: unknown;
  options?: unknown;
  position?: unknown;
}

app.patch("/api/fields/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as PatchFieldBody;
    const store = requireDb();
    if (store.getField(id) === null) {
      return reply.code(404).send({ error: `字段不存在：${id}` });
    }
    const patch: Parameters<XieFlowDb["updateField"]>[1] = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string") throw new ValidationError("字段名称不能为空");
      patch.name = body.name;
    }
    if (body.type !== undefined) {
      assertValidFieldType(body.type);
      patch.type = body.type;
    }
    if (body.options !== undefined) {
      patch.options = parseOptionsBody(body.options);
    }
    if (body.position !== undefined) patch.position = Number(body.position);
    return store.updateField(id, patch);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/fields/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const deleted = requireDb().deleteField(id);
    if (!deleted) {
      return reply.code(404).send({ error: `字段不存在：${id}` });
    }
    return { deleted: true };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

interface RecordBody {
  data?: unknown;
}

/** 记录 data 请求体解析（形状校验；字段级归一/校验在 shared + 服务层） */
function parseRecordDataBody(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("data 必须是对象");
  }
  return raw as Record<string, unknown>;
}

/** 查询串里的正整数 id（缺省 = 不筛/不排；非法 → 400） */
function parseOptionalQueryId(raw: unknown, label: string): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError(`非法 ${label}：${String(raw)}`);
  }
  return n;
}

/**
 * 多字段 AND 筛选的查询串解析（r7）：
 * `filters=[{"fieldId":1,"value":"x"},{"fieldId":2,"value":10}]`
 * 非法 JSON / 非数组 → 400；字段不存在 / 取值类型不符由 shared queryRecords 抛错 → 400。
 */
function parseFiltersQuery(raw: unknown): ViewFilterCondition[] | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") {
    throw new ValidationError("filters 必须是 JSON 数组");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError("filters 必须是 JSON 数组");
  }
  if (!Array.isArray(parsed)) {
    throw new ValidationError("filters 必须是 JSON 数组");
  }
  return parsed as ViewFilterCondition[];
}

/** 排序方向解析（非法方向直接 400，不再静默回落成升序） */
function parseSortDirectionQuery(raw: unknown): "asc" | "desc" | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  assertValidSortDirection(raw);
  return raw;
}

app.post("/api/tables/:id/records", async (req, reply) => {
  try {
    const tableId = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as RecordBody;
    const data = parseRecordDataBody(body.data);
    const store = requireDb();
    if (store.getTable(tableId) === null) {
      return reply.code(404).send({ error: `表格不存在：${tableId}` });
    }
    const record = store.createRecord(tableId, data);
    return reply.code(201).send(record);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/**
 * 记录查询（r6 任务单核心 + r7 扩展）：按字段筛选 + 按字段排序 + 分页。
 * 规则（筛选命中 / 排序比较 / 空值恒最后 / 分页口径 / 多条件 AND / 投影）集中在 shared
 * queryRecords，路由层只负责解析查询串与 400/404 映射——api 层没有任何字段类型分支。
 * r7：`filters` 参数传多条件（AND 语义）；`sortDirection` 非法直接 400（不再静默回落）。
 */
app.get("/api/tables/:id/records", async (req, reply) => {
  try {
    const tableId = parseId((req.params as { id: string }).id);
    const query = (req.query ?? {}) as Record<string, unknown>;
    const store = requireDb();
    if (store.getTable(tableId) === null) {
      return reply.code(404).send({ error: `表格不存在：${tableId}` });
    }
    const fields = store.listFields(tableId);
    const filterFieldId = parseOptionalQueryId(query.filterFieldId, "filterFieldId");
    const filters = parseFiltersQuery(query.filters);
    const sortFieldId = parseOptionalQueryId(query.sortFieldId, "sortFieldId");
    const page = parseOptionalQueryId(query.page, "page");
    const pageSize = parseOptionalQueryId(query.pageSize, "pageSize");
    const sortDirection = parseSortDirectionQuery(query.sortDirection);
    return queryRecords(store.listRecords(tableId), fields, {
      filterFieldId,
      filterValue: query.filterValue,
      filters,
      sortFieldId,
      sortDirection,
      page,
      pageSize,
    });
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/records/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const record = requireDb().getRecord(id);
    if (!record) {
      return reply.code(404).send({ error: `记录不存在：${id}` });
    }
    return record;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.patch("/api/records/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as RecordBody;
    const data = parseRecordDataBody(body.data);
    const store = requireDb();
    if (store.getRecord(id) === null) {
      return reply.code(404).send({ error: `记录不存在：${id}` });
    }
    return store.updateRecord(id, data);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/records/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const deleted = requireDb().deleteRecord(id);
    if (!deleted) {
      return reply.code(404).send({ error: `记录不存在：${id}` });
    }
    return { deleted: true };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- r7：视图（views CRUD + 按视图查询记录）+ CSV 导入（逐行归一 / 零半态） ----
// 视图 spec 的校验与归一口径全部在 shared `normalizeViewSpec`；
// 按视图查询记录复用 shared `queryRecords`（视图 spec 只是筛选 / 排序 / 投影参数）；
// 导入的逐行归一与错误行聚合在 shared `planCsvImport`，零半态判定在 `shouldCommitImport`。

interface ViewBody {
  name?: unknown;
  filterSpec?: unknown;
  sortSpec?: unknown;
  visibleFields?: unknown;
  position?: unknown;
}

app.post("/api/tables/:id/views", async (req, reply) => {
  try {
    const tableId = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as ViewBody;
    if (typeof body.name !== "string") {
      throw new ValidationError("视图名称不能为空");
    }
    const store = requireDb();
    if (store.getTable(tableId) === null) {
      return reply.code(404).send({ error: `表格不存在：${tableId}` });
    }
    const position =
      body.position === undefined || body.position === null ? undefined : Number(body.position);
    const view = store.createView(tableId, body.name, {
      filterSpec: body.filterSpec,
      sortSpec: body.sortSpec,
      visibleFields: body.visibleFields,
    }, position);
    return reply.code(201).send(view);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/tables/:id/views", async (req, reply) => {
  try {
    const tableId = parseId((req.params as { id: string }).id);
    const store = requireDb();
    if (store.getTable(tableId) === null) {
      return reply.code(404).send({ error: `表格不存在：${tableId}` });
    }
    return { views: store.listViews(tableId) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/views/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const view = requireDb().getView(id);
    if (!view) {
      return reply.code(404).send({ error: `视图不存在：${id}` });
    }
    return view;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.patch("/api/views/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as ViewBody;
    const store = requireDb();
    if (store.getView(id) === null) {
      return reply.code(404).send({ error: `视图不存在：${id}` });
    }
    const patch: Parameters<XieFlowDb["updateView"]>[1] = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string") throw new ValidationError("视图名称不能为空");
      patch.name = body.name;
    }
    if (body.filterSpec !== undefined) patch.filterSpec = body.filterSpec;
    if (body.sortSpec !== undefined) patch.sortSpec = body.sortSpec;
    if (body.visibleFields !== undefined) patch.visibleFields = body.visibleFields;
    if (body.position !== undefined) patch.position = Number(body.position);
    return store.updateView(id, patch);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/views/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const deleted = requireDb().deleteView(id);
    if (!deleted) {
      return reply.code(404).send({ error: `视图不存在：${id}` });
    }
    return { deleted: true };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/**
 * 按视图查询记录（r7 任务单核心）：视图 spec 只是筛选 / 排序 / 投影参数，
 * 真正的查询装配仍是 shared `queryRecords`（与直接查表同一口径）。
 */
app.get("/api/views/:id/records", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const store = requireDb();
    const view = store.getView(id);
    if (!view) {
      return reply.code(404).send({ error: `视图不存在：${id}` });
    }
    const query = (req.query ?? {}) as Record<string, unknown>;
    const page = parseOptionalQueryId(query.page, "page");
    const pageSize = parseOptionalQueryId(query.pageSize, "pageSize");
    const result = queryRecords(store.listRecords(view.tableId), store.listFields(view.tableId), {
      filters: view.filterSpec,
      sorts: view.sortSpec,
      visibleFields: view.visibleFields,
      page,
      pageSize,
    });
    return { ...result, viewId: view.id, viewName: view.name };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/**
 * CSV 导入预览（r7）：只解析不落库。
 * 返回表头、数据行总数、前 5 行原始预览与**错误行清单（行号 + 原因）**。
 * 整表级错误（CSV 为空 / 缺表头 / 未知列 / 列重复）→ 400。
 */
app.post("/api/tables/:id/import.csv/preview", async (req, reply) => {
  try {
    const tableId = parseId((req.params as { id: string }).id);
    const store = requireDb();
    if (store.getTable(tableId) === null) {
      return reply.code(404).send({ error: `表格不存在：${tableId}` });
    }
    const payload = normalizeCsvImportPayload(req.body);
    const plan = planCsvImport(store.listFields(tableId), payload.headers, payload.rows);
    return {
      headers: plan.headers,
      total: plan.total,
      preview: plan.preview,
      errors: plan.errors,
      importable: shouldCommitImport(plan),
    };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/**
 * CSV 导入提交（r7，零半态）：
 * 逐行走 shared `normalizeRecordData`；**任一行非法 → 一行都不落库**（422 + 错误行清单）；
 * 全部合法 → 整个批次在一个事务里落库（201）。绝不出现「一半成功」的半态。
 */
app.post("/api/tables/:id/import.csv", async (req, reply) => {
  try {
    const tableId = parseId((req.params as { id: string }).id);
    const store = requireDb();
    if (store.getTable(tableId) === null) {
      return reply.code(404).send({ error: `表格不存在：${tableId}` });
    }
    const payload = normalizeCsvImportPayload(req.body);
    const plan = planCsvImport(store.listFields(tableId), payload.headers, payload.rows);
    if (!shouldCommitImport(plan)) {
      return reply.code(422).send({
        error: `CSV 有 ${plan.errors.length} 行不合法，未导入任何行（零半态）`,
        imported: 0,
        total: plan.total,
        errors: plan.errors,
      });
    }
    const created = store.importRecords(tableId, plan.rows);
    return reply.code(201).send({ imported: created.length, total: plan.total, records: created });
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- r8：documents CRUD + blocks CRUD（拆 / 合 / 移动 / 批重排 / 类型转换 / 全文读） ----
// 块类型引擎（归一 / 可转性 / 拆合装配）与位置重排规则全部集中在 shared 与 db 服务层；
// 路由层只做「路径 / 请求体形状 → 服务层调用 → 400 / 404 映射」，不出现任何块类型分支。

interface CreateDocumentBody {
  title?: unknown;
}

interface PatchDocumentBody {
  title?: unknown;
}

interface CreateBlockBody {
  type?: unknown;
  content?: unknown;
  position?: unknown;
  parentId?: unknown;
  /** 可选：显式声明归属文档；与路径 id 不一致即「越权 document_id」→ 400 */
  documentId?: unknown;
}

interface PatchBlockBody {
  content?: unknown;
  position?: unknown;
  parentId?: unknown;
  documentId?: unknown;
}

/** 请求体里显式带的 documentId 必须与路径 / 块归属一致（越权 → 400） */
function assertBodyDocumentId(raw: unknown, expected: number): void {
  if (raw === undefined || raw === null) return;
  const n = Number(raw);
  if (!Number.isInteger(n) || n !== expected) {
    throw new ValidationError(`越权 document_id：${String(raw)}（应为 ${expected}）`);
  }
}

/** 文档存在性：不存在 → 404（与 todos / tables 等既有路由同一契约） */
function requireDocument(id: number, reply: FastifyReply): boolean {
  if (requireDb().getDocument(id) === null) {
    reply.code(404).send({ error: `文档不存在：${id}` });
    return false;
  }
  return true;
}

app.post("/api/documents", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as CreateDocumentBody;
    if (typeof body.title !== "string") throw new ValidationError("文档标题不能为空");
    const doc = requireDb().createDocument(body.title);
    return reply.code(201).send(doc);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/documents", async () => {
  return { documents: requireDb().listDocuments() };
});

app.get("/api/documents/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const doc = requireDb().getDocument(id);
    if (!doc) return reply.code(404).send({ error: `文档不存在：${id}` });
    return doc;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.patch("/api/documents/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as PatchDocumentBody;
    const store = requireDb();
    if (store.getDocument(id) === null) return reply.code(404).send({ error: `文档不存在：${id}` });
    if (typeof body.title !== "string") throw new ValidationError("文档标题不能为空");
    return store.updateDocument(id, body.title);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/documents/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const deleted = requireDb().deleteDocument(id);
    if (!deleted) return reply.code(404).send({ error: `文档不存在：${id}` });
    return { deleted: true };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 文档全文读：按 position 拼装（shared assembleDocumentText 唯一口径） */
app.get("/api/documents/:id/text", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const assembled = requireDb().assembleDocument(id);
    if (!assembled) return reply.code(404).send({ error: `文档不存在：${id}` });
    return assembled;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/documents/:id/blocks", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireDocument(id, reply)) return reply;
    return { blocks: requireDb().listBlocks(id) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.post("/api/documents/:id/blocks", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as CreateBlockBody;
    const store = requireDb();
    if (store.getDocument(id) === null) return reply.code(404).send({ error: `文档不存在：${id}` });
    assertBodyDocumentId(body.documentId, id);
    const block = store.createBlock(id, body.type, body.content, body.position, body.parentId);
    return reply.code(201).send(block);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 批移动重排：order 必须是本文档块 id 的完整排列（shared planBlockReorder 守卫） */
app.post("/api/documents/:id/blocks/reorder", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as { order?: unknown };
    const store = requireDb();
    if (store.getDocument(id) === null) return reply.code(404).send({ error: `文档不存在：${id}` });
    return { blocks: store.reorderBlocks(id, body.order) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/blocks/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const block = requireDb().getBlock(id);
    if (!block) return reply.code(404).send({ error: `块不存在：${id}` });
    return block;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.patch("/api/blocks/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as PatchBlockBody;
    const store = requireDb();
    const current = store.getBlock(id);
    if (current === null) return reply.code(404).send({ error: `块不存在：${id}` });
    assertBodyDocumentId(body.documentId, current.documentId);
    if (body.content === undefined) throw new ValidationError("缺少块内容 content");
    return store.updateBlock(id, body.content);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/blocks/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const deleted = requireDb().deleteBlock(id);
    if (!deleted) return reply.code(404).send({ error: `块不存在：${id}` });
    return { deleted: true };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 类型切换下拉：shared canConvertBlockType 判定（divider 等结构块拒绝互转） */
app.post("/api/blocks/:id/convert", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as { type?: unknown };
    const store = requireDb();
    if (store.getBlock(id) === null) return reply.code(404).send({ error: `块不存在：${id}` });
    return store.convertBlock(id, body.type);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 回车拆块：后半段落新块，整表 position 连号（201） */
app.post("/api/blocks/:id/split", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as { caret?: unknown };
    const store = requireDb();
    if (store.getBlock(id) === null) return reply.code(404).send({ error: `块不存在：${id}` });
    return reply.code(201).send(store.splitBlock(id, body.caret));
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 退格合块：与前一块合并，块数减一、position 收拢 */
app.post("/api/blocks/:id/merge", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const store = requireDb();
    if (store.getBlock(id) === null) return reply.code(404).send({ error: `块不存在：${id}` });
    return { blocks: store.mergeBlock(id) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 上移 / 下移：复用 shared reorderPositions 的重排口径 */
app.post("/api/blocks/:id/move", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as { position?: unknown };
    const store = requireDb();
    if (store.getBlock(id) === null) return reply.code(404).send({ error: `块不存在：${id}` });
    return { blocks: store.moveBlock(id, body.position) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- r9：Markdown 导入导出 + AI 块级修订（M4 收官） ----
// 转换 / 导入零半态 / 修订采纳判定全部集中在 shared；provider 由这一处注入，
// M5 接真实模型只需替换 revisionProvider 实现，下面路由一行不改。
const revisionProvider = createMockProvider();

interface ReviseBlockBody {
  instruction?: unknown;
  adopt?: unknown;
}

/** POST 导入预览：只解析与校验，绝不写库（与 r7 CSV preview 同款两阶段） */
app.post("/api/documents/:id/import.md/preview", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireDocument(id, reply)) return reply;
    const plan = planMarkdownImport(normalizeMarkdownImportPayload(req.body));
    return {
      documentId: id,
      total: plan.total,
      preview: plan.preview,
      errors: plan.errors,
      committable: shouldCommitMarkdownImport(plan),
    };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** POST 导入提交：整体校验 → 单事务整篇替换；任一块非法 → 422 且一块不写（零半态） */
app.post("/api/documents/:id/import.md", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireDocument(id, reply)) return reply;
    const plan = planMarkdownImport(normalizeMarkdownImportPayload(req.body));
    if (!shouldCommitMarkdownImport(plan)) {
      return reply.code(422).send({
        error: `Markdown 有 ${plan.errors.length} 块不合法，未导入任何块（零半态）`,
        imported: 0,
        total: plan.total,
        errors: plan.errors,
      });
    }
    const blocks = requireDb().importBlocks(id, plan.rows);
    return { imported: blocks.length, total: plan.total, blocks };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** GET 导出 .md：唯一装配入口 = shared blocksToMarkdown；中文名走 RFC 5987 下发 */
app.get("/api/documents/:id/export.md", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const store = requireDb();
    const doc = store.getDocument(id);
    if (!doc) return reply.code(404).send({ error: `文档不存在：${id}` });
    const md = blocksToMarkdown(store.listBlocks(id));
    const fileName = buildDocumentMdFileName(doc.title);
    const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, "_");
    return reply
      .header("content-type", "text/markdown; charset=utf-8")
      .header(
        "content-disposition",
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      )
      .send(md);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/**
 * POST 块级 AI 修订：先出建议（adopt 缺失/false → 只读、绝不写库），
 * 采纳才由 shared planRevisionApply 给出替换文本并走服务层更新块。
 * 块归属文档不一致 → 400；块不存在 → 404；instruction 空 / 超长 → 400。
 */
app.post("/api/documents/:id/blocks/:blockId/revise", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const blockId = parseId((req.params as { blockId: string }).blockId);
    const store = requireDb();
    if (!requireDocument(id, reply)) return reply;
    const block = store.getBlock(blockId);
    if (!block) return reply.code(404).send({ error: `块不存在：${blockId}` });
    if (block.documentId !== id) {
      return reply.code(400).send({ error: `越权 block_id：${blockId} 不属于文档 ${id}` });
    }
    const body = (req.body ?? {}) as ReviseBlockBody;
    assertValidRevisionInstruction(body.instruction);
    const request: RevisionRequest = {
      instruction: body.instruction,
      blockType: block.type,
      originalText: block.content.text,
    };
    const suggestion = await revisionProvider.propose(request);
    const apply = planRevisionApply(block.content.text, suggestion.suggestedText, body.adopt);
    return {
      documentId: id,
      blockId,
      provider: suggestion.provider,
      rationale: suggestion.rationale,
      originalText: block.content.text,
      suggestedText: suggestion.suggestedText,
      applied: apply.applied,
      block: apply.applied
        ? store.updateBlock(blockId, { ...block.content, text: apply.text })
        : block,
    };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- r10：AI 工作台工具目录 + 会话 / 聊天 / 产物（M5 起步） ----
// 规则（意图 / 参数归一 / 汇总口径）全在 shared；此处只做装配与 400/404 映射。
// 换真实模型只需把 planner 换成实现 Planner 接口的实例，下列路由一行不改。
const toolRegistry = createDefaultToolRegistry();
const chatPlanner = mockPlanner;

/** GET 工具目录：UI 可展示「AI 能用哪些工具」，回放评测集消费同一清单 */
app.get("/api/tools", async () => ({
  tools: toolRegistry.list(),
  planner: chatPlanner.id,
}));

/** GET 会话列表（最新在前） */
app.get("/api/conversations", async () => ({ conversations: requireDb().listConversations() }));

/** POST 建会话：空标题 / 超长由 shared 守卫 → 400 */
app.post("/api/conversations", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as { title?: unknown };
    return reply.code(201).send(requireDb().createConversation(body.title));
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

function requireConversation(id: number, reply: FastifyReply): boolean {
  if (requireDb().getConversation(id) === null) {
    reply.code(404).send({ error: `会话不存在：${id}` });
    return false;
  }
  return true;
}

app.get("/api/conversations/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireConversation(id, reply)) return reply;
    return requireDb().getConversation(id);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/conversations/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireConversation(id, reply)) return reply;
    requireDb().deleteConversation(id);
    return { deleted: true, id };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** GET 对话流：按 id 升序，tool 角色消息带 tool_calls_json 数组 */
app.get("/api/conversations/:id/messages", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireConversation(id, reply)) return reply;
    return { conversationId: id, messages: requireDb().listMessages(id) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** GET 会话产物列表（右侧预览面板数据源） */
app.get("/api/conversations/:id/artifacts", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireConversation(id, reply)) return reply;
    return { conversationId: id, artifacts: requireDb().listArtifacts(id) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** GET 单篇产物（深链预览） */
app.get("/api/artifacts/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const artifact = requireDb().getArtifact(id);
    if (!artifact) return reply.code(404).send({ error: `产物不存在：${id}` });
    return artifact;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/**
 * GET 产物可预览内容（r11）：按 type 返回 contentType + 原文。
 * 可选 ?type= 指定期望类型（非法 / 与落库类型不符 → 400）；产物不存在 → 404。
 */
app.get("/api/artifacts/:id/content", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const query = req.query as { type?: unknown };
    if (query.type !== undefined) assertValidArtifactType(query.type);
    const artifact = requireDb().getArtifact(id);
    if (!artifact) return reply.code(404).send({ error: `产物不存在：${id}` });
    assertValidArtifactType(artifact.type);
    if (query.type !== undefined && query.type !== artifact.type) {
      return reply.code(400).send({ error: `产物类型不符：期望 ${query.type}，实际 ${artifact.type}` });
    }
    return {
      id: artifact.id,
      type: artifact.type,
      title: artifact.title,
      contentType: contentTypeForArtifactType(artifact.type),
      content: artifact.content,
    };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

interface ChatBody {
  message?: unknown;
  /** 上下文窗口（最近 N 条落库消息注入规划；缺省 8，上限 20） */
  context_window?: unknown;
  /** 产物类型：chat-result / html-report / markdown-table / json-data */
  artifactType?: unknown;
  /** 显式工具调用覆盖 mock 规划（供 4xx：未知工具 / 非法参数；正常用户对话不传） */
  toolCalls?: unknown;
}

/**
 * POST 对话：取最近 N 条真实落库消息作为上下文 → mock 规划（含指代消解）
 * → 真实工具执行 → 逐条 tool_call 落库 → 按 artifactType 生成产物 → AI 汇总。
 * 400：空消息 / 超长消息 / 上下文超限 / 非法产物类型 / 未知工具 / 非法参数；404：会话不存在。
 * 事务在 db.recordChatExchange 内，执行失败时连 tool 消息都不会落库。
 */
app.post("/api/conversations/:id/chat", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireConversation(id, reply)) return reply;
    const body = (req.body ?? {}) as ChatBody;
    assertValidChatMessage(body.message);
    const contextWindow = normalizeContextWindow(body.context_window);
    const context = toPlannerContext(requireDb().listMessages(id).slice(-contextWindow));
    const options = {
      context,
      contextWindow,
      artifactType: body.artifactType,
      ...(body.toolCalls === undefined ? {} : { toolCalls: body.toolCalls }),
    };
    const plan = await executeChat(requireDb(), toolRegistry, chatPlanner, body.message, options);
    const saved = requireDb().recordChatExchange({
      conversationId: id,
      userText: body.message,
      toolCalls: plan.toolCalls,
      summary: plan.summary,
      artifact: plan.artifact,
      ...(plan.citations ? { citations: plan.citations } : {}),
    });
    return reply.code(201).send({
      conversationId: id,
      intent: plan.intent,
      summary: plan.summary,
      planner: chatPlanner.id,
      toolCalls: plan.toolCalls,
      citations: plan.citations ?? [],
      messages: saved.messages,
      artifact: saved.artifact,
      contextWindow: plan.contextWindow,
      contextMessages: context.length,
      ...(plan.resolution ? { resolution: plan.resolution } : {}),
    });
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- r12（M6 起步）：知识库入库与检索 ----
// 算法零分支纪律：分块只调 agent.chunkText，检索只调 agent.searchChunks；
// 本层只做来源内容装配、守卫与 400/404 映射、增删查找回。

interface IngestBody {
  title?: unknown;
  sourceType?: unknown;
  sourceId?: unknown;
  content?: unknown;
}

app.post("/api/knowledge/ingest", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as IngestBody;
    assertValidKnowledgeTitle(body.title);
    assertValidKnowledgeSourceType(body.sourceType);
    let content: string;
    let sourceId: number | null = null;
    if (body.sourceType === "document") {
      if (body.sourceId === undefined || body.sourceId === null) {
        throw new ValidationError("document 来源必须提供 source_id");
      }
      sourceId = parseId(String(body.sourceId));
      if (requireDb().getDocument(sourceId) === null) {
        return reply.code(404).send({ error: `来源文档不存在：${sourceId}` });
      }
      // 真实文档正文来自块装配（共享口径），api 不散落拼接规则
      content = assembleDocumentText(requireDb().listBlocks(sourceId));
      if (content.trim() === "") throw new ValidationError("来源文档没有可用正文");
    } else {
      assertValidKnowledgeContent(body.content);
      content = body.content as string;
    }
    const chunks = chunkText(content); // 自动分块，算法集中 agent
    const saved = requireDb().createKnowledgeDoc({
      title: body.title,
      sourceType: body.sourceType,
      sourceId,
      content,
      chunks,
    });
    return reply.code(201).send({ doc: saved.doc, chunks: saved.chunks });
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/knowledge/docs", async () => {
  return { docs: requireDb().listKnowledgeDocs() };
});

app.get("/api/knowledge/docs/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    // r13 溯源回看：?chunkId= 指定引用分块；非法参数 → 400 优先于文档不存在 404。
    const query = req.query as { chunkId?: unknown };
    const chunkId = normalizeTracebackChunkId(query.chunkId);
    const doc = requireDb().getKnowledgeDoc(id);
    if (!doc) return reply.code(404).send({ error: `知识文档不存在：${id}` });
    if (chunkId === null) return doc;
    // 跨文档/不存在的 chunk id → 404。
    const chunk = requireDb().getKnowledgeChunk(chunkId);
    if (chunk === null || chunk.docId !== id) {
      return reply.code(404).send({ error: `引用分块不存在：${chunkId}` });
    }
    return { doc, chunk };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/knowledge/docs/:id/chunks", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (requireDb().getKnowledgeDoc(id) === null) {
      return reply.code(404).send({ error: `知识文档不存在：${id}` });
    }
    return { docId: id, chunks: requireDb().listKnowledgeChunks(id) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/knowledge/docs/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (requireDb().getKnowledgeDoc(id) === null) {
      return reply.code(404).send({ error: `知识文档不存在：${id}` });
    }
    requireDb().deleteKnowledgeDoc(id);
    return { deleted: true, id };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/**
 * GET 检索：q 必填非空（400），limit 1~50（缺省 5）；命中带 doc_id/chunk_id 来源引用。
 * 检索是纯函数（agent.searchChunks），api 只取全部分块源 + 装配响应，零算法分支。
 */
app.get("/api/knowledge/search", async (req, reply) => {
  try {
    const query = req.query as { q?: unknown; limit?: unknown };
    assertValidKnowledgeQuery(query.q);
    const limit = normalizeKnowledgeLimit(query.limit);
    const hits = searchChunks(query.q, requireDb().listKnowledgeChunksForSearch(), limit);
    return { query: query.q, limit, count: hits.length, hits };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/**
 * r14 思维导图：CRUD + GET /:id/tree（shared 解析后的树 JSON）+ PUT /:id/content（Markdown 源）。
 * 解析/守卫全集中 shared，路由层只做 400/404 映射与装配，零算法分支。
 */
interface CreateMindmapBody {
  title?: unknown;
  contentMarkdown?: unknown;
}

app.post("/api/mindmaps", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as CreateMindmapBody;
    const map = requireDb().createMindmap({ title: body.title, contentMarkdown: body.contentMarkdown ?? "" });
    return reply.code(201).send(map);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/mindmaps", async () => ({ mindmaps: requireDb().listMindmaps() }));

app.get("/api/mindmaps/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const map = requireDb().getMindmap(id);
    if (!map) return reply.code(404).send({ error: `导图不存在：${id}` });
    return map;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.patch("/api/mindmaps/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as { title?: unknown };
    const map = requireDb().updateMindmapTitle(id, body.title);
    if (!map) return reply.code(404).send({ error: `导图不存在：${id}` });
    return map;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/mindmaps/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireDb().deleteMindmap(id)) return reply.code(404).send({ error: `导图不存在：${id}` });
    return { deleted: true, id };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 树由 shared parseMarkdownToTree 现算，不落库（改 Markdown 即改树，api 零算法分支） */
app.get("/api/mindmaps/:id/tree", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const map = requireDb().getMindmap(id);
    if (!map) return reply.code(404).send({ error: `导图不存在：${id}` });
    return { mindmapId: id, title: map.title, tree: parseMarkdownToTree(map.contentMarkdown) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.put("/api/mindmaps/:id/content", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as { contentMarkdown?: unknown };
    const map = requireDb().updateMindmapContent(id, body.contentMarkdown);
    if (!map) return reply.code(404).send({ error: `导图不存在：${id}` });
    return map;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/**
 * r15 白板（M7 收官）：whiteboards / items CRUD + 批量移动 + mock AI 建板 + Markdown 导出。
 * 布局归一 / 重叠避让 / 建板脚本 / 导出装配全集中 shared，路由层只做 400/404 映射与装配。
 */
interface WhiteboardItemBody {
  type?: unknown;
  x?: unknown;
  y?: unknown;
  w?: unknown;
  h?: unknown;
  content?: unknown;
  color?: unknown;
}

app.post("/api/whiteboards", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as { title?: unknown };
    return reply.code(201).send(requireDb().createWhiteboard({ title: body.title }));
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/whiteboards", async () => ({ whiteboards: requireDb().listWhiteboards() }));

app.get("/api/whiteboards/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const board = requireDb().getWhiteboard(id);
    if (!board) return reply.code(404).send({ error: `白板不存在：${id}` });
    return board;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.patch("/api/whiteboards/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as { title?: unknown };
    const board = requireDb().updateWhiteboardTitle(id, body.title);
    if (!board) return reply.code(404).send({ error: `白板不存在：${id}` });
    return board;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/whiteboards/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireDb().deleteWhiteboard(id)) return reply.code(404).send({ error: `白板不存在：${id}` });
    return { deleted: true, id };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.post("/api/whiteboards/:id/items", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as WhiteboardItemBody;
    const item = requireDb().createWhiteboardItem(id, body);
    if (!item) return reply.code(404).send({ error: `白板不存在：${id}` });
    return reply.code(201).send(item);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/whiteboards/:id/items", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireDb().getWhiteboard(id)) return reply.code(404).send({ error: `白板不存在：${id}` });
    return { items: requireDb().listWhiteboardItems(id) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 批量移动：路由层只装配 moves，越权/非法坐标/避让全在 shared + db 服务层 */
app.post("/api/whiteboards/:id/items/move", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as { moves?: unknown };
    const moves = body.moves as { id: unknown; x: unknown; y: unknown }[] | undefined;
    if (!Array.isArray(moves)) throw new ValidationError("moves 必须是数组");
    const items = requireDb().moveWhiteboardItems(id, moves);
    if (!items) return reply.code(404).send({ error: `白板或条目不存在：${id}` });
    return { items, count: items.length };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/whiteboards/:id/items/:itemId", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const itemId = parseId((req.params as { itemId: string }).itemId);
    const item = requireDb().getWhiteboardItem(itemId);
    if (!item || item.boardId !== id) return reply.code(404).send({ error: `条目不存在：${itemId}` });
    return item;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.patch("/api/whiteboards/:id/items/:itemId", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const itemId = parseId((req.params as { itemId: string }).itemId);
    const current = requireDb().getWhiteboardItem(itemId);
    if (!current || current.boardId !== id) return reply.code(404).send({ error: `条目不存在：${itemId}` });
    const body = (req.body ?? {}) as WhiteboardItemBody;
    const item = requireDb().updateWhiteboardItem(itemId, body);
    if (!item) return reply.code(404).send({ error: `条目不存在：${itemId}` });
    return item;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/whiteboards/:id/items/:itemId", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const itemId = parseId((req.params as { itemId: string }).itemId);
    const current = requireDb().getWhiteboardItem(itemId);
    if (!current || current.boardId !== id) return reply.code(404).send({ error: `条目不存在：${itemId}` });
    if (!requireDb().deleteWhiteboardItem(itemId)) return reply.code(404).send({ error: `条目不存在：${itemId}` });
    return { deleted: true, id: itemId };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** mock AI 建板：按主题生成 5-8 便签（零 token）；脚本生成只在 shared 一处 */
app.post("/api/whiteboards/:id/ai-create", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as { theme?: unknown };
    const items = requireDb().aiCreateWhiteboard(id, body.theme);
    if (!items) return reply.code(404).send({ error: `白板不存在：${id}` });
    return reply.code(201).send({ boardId: id, theme: body.theme, items, count: items.length });
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** GET 导出 .md：唯一装配入口 = shared buildWhiteboardMarkdown；中文名走 RFC 5987 */
app.get("/api/whiteboards/:id/export.md", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const store = requireDb();
    const board = store.getWhiteboard(id);
    if (!board) return reply.code(404).send({ error: `白板不存在：${id}` });
    const md = buildWhiteboardMarkdown(board.title, store.listWhiteboardItems(id));
    const fileName = `xieflow-whiteboard-${id}.md`;
    return reply
      .header("content-type", "text/markdown; charset=utf-8")
      .header("content-disposition", `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(board.title)}.md`)
      .send(md);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- r24：响应回带成员摘要（只装配，解析/计数规则全在 shared/org + db） ----

/** 同一语义兼容 camelCase / snake_case / 通用 memberId 三种调用方写法（r23 move 端点同款口径） */
function firstDefined(...values: unknown[]): unknown {
  for (const v of values) if (v !== undefined) return v;
  return undefined;
}

/** 成员 id → {id,name,departmentId,departmentName,title,status}；缺席/已删返回 null */
function memberSummaryOf(store: XieFlowDb, memberId: number | null | undefined) {
  if (memberId === null || memberId === undefined) return null;
  const member = store.getMember(memberId);
  return member ? memberSummary(member, store.listDepartments()) : null;
}

/** 审批详情/列表附加申请人摘要；原有字段逐字保留，老路径摘要为 null */
function withApprovalMember(store: XieFlowDb, approval: ReturnType<XieFlowDb["getApproval"]>) {
  if (approval === null) return null;
  return { ...approval, applicantMember: memberSummaryOf(store, approval.applicantMemberId) };
}

/** 步骤时间线附加执行人/操作人摘要（老步骤两个 member_id 均 NULL → 摘要 null） */
function withStepMember(store: XieFlowDb, step: ReturnType<XieFlowDb["listApprovalSteps"]>[number]) {
  return { ...step, assigneeMember: memberSummaryOf(store, step.assigneeMemberId), actorMember: memberSummaryOf(store, step.actorMemberId) };
}

/** 物资详情/列表附加保管员摘要（老数据 member_id=NULL → 摘要 null） */
function withAssetMember(store: XieFlowDb, asset: ReturnType<XieFlowDb["getAsset"]>) {
  if (asset === null) return null;
  return { ...asset, custodianMember: memberSummaryOf(store, asset.custodianMemberId) };
}

/**
 * r16 审批流（M8 起步）：approvals CRUD + submit/approve/reject/delegate/withdraw
 * + 三视角（我的待办 / 我发起的 / 抄送我的）。
 * 状态机 / 动作判定 / 三视角过滤全集中 shared + db，路由层只做装配与 400/404 映射（零流转分支）。
 */
interface ApprovalBody {
  title?: unknown;
  type?: unknown;
  applicantId?: unknown;
  currentAssignee?: unknown;
  cc?: unknown;
  actor?: unknown;
  comment?: unknown;
  targetAssignee?: unknown;
  user?: unknown;
  // r24 可选成员引用（三种写法兼容；老请求一律 undefined → 回落自由文本）
  applicantMemberId?: unknown;
  applicant_member_id?: unknown;
  currentAssigneeMemberId?: unknown;
  current_assignee_member_id?: unknown;
  assigneeMemberId?: unknown;
  assignee_member_id?: unknown;
  ccMemberIds?: unknown;
  cc_member_ids?: unknown;
  ccMemberId?: unknown;
  cc_member_id?: unknown;
  memberId?: unknown;
  member_id?: unknown;
  targetAssigneeMemberId?: unknown;
  target_assignee_member_id?: unknown;
  actorMemberId?: unknown;
  actor_member_id?: unknown;
}

app.post("/api/approvals", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as ApprovalBody;
    const created = requireDb().createApproval({
      title: body.title,
      type: body.type,
      applicantId: body.applicantId,
      currentAssignee: body.currentAssignee,
      cc: body.cc,
      applicantMemberId: firstDefined(body.applicantMemberId, body.applicant_member_id, body.memberId, body.member_id),
      currentAssigneeMemberId: firstDefined(
        body.currentAssigneeMemberId, body.current_assignee_member_id,
        body.assigneeMemberId, body.assignee_member_id,
      ),
      ccMemberIds: firstDefined(body.ccMemberIds, body.cc_member_ids),
    });
    return reply.code(201).send(withApprovalMember(requireDb(), created));
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/approvals", async () => {
  const store = requireDb();
  return { approvals: store.listApprovals().map((a) => withApprovalMember(store, a)) };
});

/** 三视角必须定义在 /:id 之前：静态段优先，避免被动态 id 吞掉 */
app.get("/api/approvals/view", async (req, reply) => {
  try {
    const q = req.query as { view?: unknown; actor?: unknown };
    if (!isApprovalView(q.view)) throw new ValidationError(`非法审批视角：${String(q.view)}`);
    const store = requireDb();
    const rows = store.listApprovalsByView(q.view, q.actor as string);
    return { approvals: rows.map((a) => withApprovalMember(store, a)) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/approvals/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const store = requireDb();
    const approval = store.getApproval(id);
    if (!approval) return reply.code(404).send({ error: `审批不存在：${id}` });
    return withApprovalMember(store, approval);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.patch("/api/approvals/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as ApprovalBody;
    const approval = requireDb().updateApprovalTitle(id, body.title);
    if (!approval) return reply.code(404).send({ error: `审批不存在：${id}` });
    return approval;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/approvals/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireDb().deleteApproval(id)) return reply.code(404).send({ error: `审批不存在：${id}` });
    return { deleted: true, id };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/approvals/:id/steps", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const store = requireDb();
    if (!store.getApproval(id)) return reply.code(404).send({ error: `审批不存在：${id}` });
    return { steps: store.listApprovalSteps(id).map((s) => withStepMember(store, s)) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/approvals/:id/cc", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const store = requireDb();
    if (!store.getApproval(id)) return reply.code(404).send({ error: `审批不存在：${id}` });
    const cc = store.listApprovalCc(id);
    return {
      cc,
      ccMembers: store.listApprovalCcDetails(id).map((c) => memberSummaryOf(store, c.ccMemberId)),
    };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.post("/api/approvals/:id/cc", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as ApprovalBody;
    const store = requireDb();
    const memberId = firstDefined(body.ccMemberId, body.cc_member_id, body.memberId, body.member_id);
    const added = store.addApprovalCc(id, body.user, memberId);
    if (!added) return reply.code(404).send({ error: `审批不存在：${id}` });
    return reply.code(201).send({
      cc: store.listApprovalCc(id),
      ccMembers: store.listApprovalCcDetails(id).map((c) => memberSummaryOf(store, c.ccMemberId)),
      ccMember: memberSummaryOf(store, added.ccMemberId),
    });
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 五个动作共用一条装配路径：动作合法性、角色与状态判定全在 shared/db */
async function runApprovalAction(
  action: "submit" | "approve" | "reject" | "delegate" | "withdraw",
  req: { params: unknown; body?: unknown },
  reply: FastifyReply,
): Promise<FastifyReply> {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as ApprovalBody;
    const store = requireDb();
    const approval = store.actOnApproval(id, action, body.actor, {
      comment: body.comment,
      targetAssignee: body.targetAssignee,
      actorMemberId: firstDefined(body.actorMemberId, body.actor_member_id, body.memberId, body.member_id),
      targetAssigneeMemberId: firstDefined(
        body.targetAssigneeMemberId, body.target_assignee_member_id,
        body.assigneeMemberId, body.assignee_member_id,
      ),
    });
    if (!approval) return reply.code(404).send({ error: `审批不存在：${id}` });
    return reply.send(withApprovalMember(store, approval));
  } catch (err) {
    return toErrorReply(err, reply);
  }
}

app.post("/api/approvals/:id/submit", async (req, reply) => runApprovalAction("submit", req, reply));
app.post("/api/approvals/:id/approve", async (req, reply) => runApprovalAction("approve", req, reply));
app.post("/api/approvals/:id/reject", async (req, reply) => runApprovalAction("reject", req, reply));
app.post("/api/approvals/:id/delegate", async (req, reply) => runApprovalAction("delegate", req, reply));
app.post("/api/approvals/:id/withdraw", async (req, reply) => runApprovalAction("withdraw", req, reply));

/**
 * r17 物资台账与单位任务（M8 收官）：
 * assets CRUD + 出入库流水（shared applyAssetTransaction + db 单事务零半态）
 * unit_tasks CRUD + 状态流转（shared canTransitionUnitTask）+ 树查询（shared buildTaskTree）。
 * 路由层只做装配与 400/404 映射，库存与状态规则零分支。
 */
interface AssetBody {
  name?: unknown;
  category?: unknown;
  quantity?: unknown;
  unit?: unknown;
  location?: unknown;
  custodian?: unknown;
  type?: unknown;
  from?: unknown;
  to?: unknown;
  operator?: unknown;
  assetId?: unknown;
  // r24 可选成员引用：物资保管员（建账/编辑）与出入库操作人/转交保管员
  custodianMemberId?: unknown;
  custodian_member_id?: unknown;
  operatorMemberId?: unknown;
  operator_member_id?: unknown;
  memberId?: unknown;
  member_id?: unknown;
}

app.post("/api/assets", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as AssetBody;
    const store = requireDb();
    const created = store.createAsset({
      name: body.name, category: body.category, quantity: body.quantity,
      unit: body.unit, location: body.location, custodian: body.custodian,
      custodianMemberId: firstDefined(body.custodianMemberId, body.custodian_member_id, body.memberId, body.member_id),
    });
    return reply.code(201).send(withAssetMember(store, created));
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/assets", async () => {
  const store = requireDb();
  return { assets: store.listAssets().map((a) => withAssetMember(store, a)) };
});

app.get("/api/assets/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const store = requireDb();
    const asset = store.getAsset(id);
    if (!asset) return reply.code(404).send({ error: `物资不存在：${id}` });
    return withAssetMember(store, asset);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.patch("/api/assets/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as AssetBody;
    const store = requireDb();
    const asset = store.updateAsset(id, {
      name: body.name, category: body.category, unit: body.unit,
      location: body.location, custodian: body.custodian,
      custodianMemberId: firstDefined(body.custodianMemberId, body.custodian_member_id, body.memberId, body.member_id),
    });
    if (!asset) return reply.code(404).send({ error: `物资不存在：${id}` });
    return withAssetMember(store, asset);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/assets/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireDb().deleteAsset(id)) return reply.code(404).send({ error: `物资不存在：${id}` });
    return { deleted: true, id };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 出入库/转移统一入口：类型合法性由 shared 守卫，账实一致由 db 单事务保障 */
app.post("/api/assets/:id/transactions", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as AssetBody;
    if (!isAssetTxType(body.type)) throw new ValidationError(`非法流水类型：${String(body.type)}`);
    const store = requireDb();
    const memberRef = firstDefined(body.memberId, body.member_id);
    const operatorRef = firstDefined(body.operatorMemberId, body.operator_member_id, memberRef);
    const custodianRef = firstDefined(body.custodianMemberId, body.custodian_member_id, memberRef);
    const operator = operatorRef === undefined
      ? body.operator
      : assertAssignableMember(operatorRef, store.listMembers(), "操作人").name;
    const tx = store.applyAssetTx(id, {
      type: body.type, quantity: body.quantity,
      from: body.from, to: body.to, operator,
    }, custodianRef);
    const after = store.getAsset(id);
    return reply.code(201).send({
      ...tx,
      operatorMember: operatorRef === undefined ? null : memberSummaryOf(store, normalizeMemberRef(operatorRef)),
      custodianMember: after ? memberSummaryOf(store, after.custodianMemberId) : null,
    });
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 流水查询：按物资 id 过滤或全量；静态段 /api/asset-transactions 独立于 /:id */
app.get("/api/asset-transactions", async (req, reply) => {
  try {
    const q = req.query as { assetId?: unknown };
    if (q.assetId !== undefined) {
      const assetId = parseId(String(q.assetId));
      if (requireDb().getAsset(assetId) === null) return reply.code(404).send({ error: `物资不存在：${assetId}` });
      return { transactions: requireDb().listAssetTransactions(assetId) };
    }
    return { transactions: requireDb().listAssetTransactions() };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/assets/:id/transactions", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (requireDb().getAsset(id) === null) return reply.code(404).send({ error: `物资不存在：${id}` });
    return { transactions: requireDb().listAssetTransactions(id) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

interface UnitTaskBody {
  title?: unknown;
  assigneeUnit?: unknown;
  status?: unknown;
  dueDate?: unknown;
  parentId?: unknown;
  to?: unknown;
}

app.post("/api/unit-tasks", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as UnitTaskBody;
    return reply.code(201).send(requireDb().createUnitTask({
      title: body.title, assigneeUnit: body.assigneeUnit, status: body.status,
      dueDate: body.dueDate, parentId: body.parentId,
    }));
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/unit-tasks", async () => ({ tasks: requireDb().listUnitTasks() }));

/** 静态段 /tree 必须在 /:id 之前，否则被动态 id 吞掉 */
app.get("/api/unit-tasks/tree", async () => ({ tree: requireDb().getUnitTaskTree() }));

app.get("/api/unit-tasks/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const task = requireDb().getUnitTask(id);
    if (!task) return reply.code(404).send({ error: `任务不存在：${id}` });
    return task;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.patch("/api/unit-tasks/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as UnitTaskBody;
    const task = requireDb().updateUnitTask(id, {
      title: body.title, assigneeUnit: body.assigneeUnit, dueDate: body.dueDate,
    });
    if (!task) return reply.code(404).send({ error: `任务不存在：${id}` });
    return task;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/unit-tasks/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireDb().deleteUnitTask(id)) return reply.code(404).send({ error: `任务不存在：${id}` });
    return { deleted: true, id };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 状态流转唯一入口：目标状态合法性由 shared isUnitTaskStatus/canTransitionUnitTask 守卫 */
app.post("/api/unit-tasks/:id/transition", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as UnitTaskBody;
    if (!isUnitTaskStatus(body.to)) throw new ValidationError(`非法任务状态：${String(body.to)}`);
    const task = requireDb().transitionUnitTask(id, body.to);
    if (!task) return reply.code(404).send({ error: `任务不存在：${id}` });
    return task;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- r18（M9 起步）：账号 / 会话 / 服务模式（规则全在 shared/auth，路由只装配与错误映射） ----

interface AuthBody {
  username?: unknown;
  password?: unknown;
  token?: unknown;
  ttlMs?: unknown;
  mode?: unknown;
}

app.post("/api/auth/register", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as AuthBody;
    const user = requireDb().createUser({ username: body.username, password: body.password });
    return reply.code(201).send({ user });
  } catch (err) {
    return authErrorReply(err, reply);
  }
});

app.post("/api/auth/login", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as AuthBody;
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = body.password;
    // 用户不存在与密码错误统一 401，避免用户枚举；哈希校验走 shared verifyPassword。
    const user = requireDb().getUserByUsername(username);
    const stored = user ? requireDb().getPasswordHash(user.id) : null;
    if (!user || typeof password !== "string" || !stored || !verifyPassword(password, stored)) {
      return reply.code(401).send({ error: "用户名或密码错误", code: "INVALID_CREDENTIALS" });
    }
    let ttl = SESSION_TTL_MS;
    if (body.ttlMs !== undefined) {
      if (typeof body.ttlMs !== "number" || !Number.isFinite(body.ttlMs)) {
        throw new ValidationError("ttlMs 必须是有限数字");
      }
      if (body.ttlMs < SESSION_MIN_TTL_MS || body.ttlMs > SESSION_TTL_MS) {
        throw new ValidationError(`ttlMs 超出允许范围（${SESSION_MIN_TTL_MS}~${SESSION_TTL_MS}）`);
      }
      ttl = body.ttlMs;
    }
    const token = generateSessionToken();
    const session = requireDb().createSession({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + ttl).toISOString(),
    });
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user,
      permissions: AUTH_PERMISSIONS[user.role],
    };
  } catch (err) {
    return authErrorReply(err, reply);
  }
});

app.post("/api/auth/logout", async (req) => {
  const token = tokenFromRequest(req);
  const deleted = token ? requireDb().deleteSession(token) : false;
  return { ok: true, cleared: true, deleted };
});

app.get("/api/auth/me", async (req, reply) => {
  const ctx = (req as AuthRequest).auth ?? resolveAuth(req);
  if (!ctx) return responseCleared(reply);
  return { user: ctx.user, permissions: ctx.permissions, expiresAt: ctx.session.expiresAt };
});

/** 受保护路由探针：local 模式下也强制 401，供 HTTP 审计独立锁定鉴权中间件 */
app.get("/api/auth/guard", async (req, reply) => {
  const ctx = (req as AuthRequest).auth ?? resolveAuth(req);
  if (!ctx) return responseCleared(reply);
  return { ok: true, userId: ctx.user.id, permissions: ctx.permissions, canManageUsers: authCan(ctx.user.role, "user:manage") };
});

app.get("/api/auth/users", async (req, reply) => {
  const ctx = (req as AuthRequest).auth ?? resolveAuth(req);
  if (!ctx) return responseCleared(reply);
  try {
    assertPermission(ctx.user.role, "user:manage");
    return { users: requireDb().listUsers() };
  } catch (err) {
    return authErrorReply(err, reply);
  }
});

app.delete("/api/auth/users/:id", async (req, reply) => {
  const ctx = (req as AuthRequest).auth ?? resolveAuth(req);
  if (!ctx) return responseCleared(reply);
  try {
    assertPermission(ctx.user.role, "user:manage");
    const id = parseId((req.params as { id: string }).id);
    if (!requireDb().deleteUser(id)) return reply.code(404).send({ error: `用户不存在：${id}` });
    return { deleted: true, id };
  } catch (err) {
    return authErrorReply(err, reply);
  }
});

app.get("/api/auth/mode", async () => ({ mode: serverMode, envMode: ENV_MODE }));

app.post("/api/auth/mode", async (req, reply) => {
  try {
    // 切到 remote 之后，再调整模式需要管理员权限；首次从 local 切换是本机自托管动作。
    if (serverMode === "remote") {
      const ctx = (req as AuthRequest).auth ?? resolveAuth(req);
      if (!ctx) return responseCleared(reply);
      assertPermission(ctx.user.role, "auth:mode");
    }
    const body = (req.body ?? {}) as AuthBody;
    assertValidServerMode(body.mode);
    serverMode = body.mode;
    requireDb().setSetting("server.mode", serverMode);
    return { mode: serverMode };
  } catch (err) {
    return authErrorReply(err, reply);
  }
});

// ---- r19：多端同步（路由层只做参数装配与状态码映射，算法全在 shared/db） ----

/**
 * r26：同步冲突事件 → 站内通知（真实 409 时记一条，refresh 幂等不重复）。
 * 通知写入失败不能掩盖原 409 契约（零影响原则）。
 */
function recordConflictNotification(err: SyncConflictError, ctx: { entityType?: unknown; entityId?: unknown }): void {
  try {
    const entityType = typeof ctx.entityType === "string" && ctx.entityType !== "" ? ctx.entityType : "entity";
    const entityId = typeof ctx.entityId === "string" && ctx.entityId !== "" ? ctx.entityId : "unknown";
    const conflictCount = Math.max(1, err.conflicts.length);
    if (!shouldNotify("sync_conflict", { conflictCount })) return;
    const refId = db?.getLatestChange(entityType, entityId)?.id ?? 0;
    const draft = buildNotification("sync_conflict", {
      conflictCount, entityType, entityId, fields: err.conflicts, refId,
    });
    db?.upsertNotification(draft);
  } catch {
    /* 通知是旁路能力，不改变同步 409 的契约 */
  }
}

/** 409 冲突：冲突字段列表 / 当前版本 / 两端快照一次回给客户端弹窗选边 */
function syncErrorReply(err: unknown, reply: FastifyReply, ctx: { entityType?: unknown; entityId?: unknown } = {}): FastifyReply {
  if (err instanceof SyncConflictError) {
    recordConflictNotification(err, ctx);
    return reply.code(409).send({
      error: err.message,
      code: "SYNC_CONFLICT",
      conflicts: err.conflicts,
      divergedFields: err.divergedFields,
      currentVersion: err.currentVersion,
      base: err.base,
      local: err.local,
      remote: err.remote,
    });
  }
  if (err instanceof ForbiddenError) return reply.code(403).send({ error: err.message, code: "FORBIDDEN" });
  if (err instanceof ValidationError) return reply.code(400).send({ error: err.message });
  return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
}

/**
 * r20：离线队列服务端按序重放。规则（条目校验 / 顺序）全在 shared，api 只装配。
 * 每条用 app.inject 真走既有路由（不复制业务分支）；任一条 >=400 即停在该条，
 * 回带 conflictIndex 供客户端把「已成功条目出队、冲突条目留队」，零半态。
 */
app.post("/api/offline/replay", async (req, reply) => {
  try {
    const body = req.body ?? {};
    assertValidOfflineReplayRequest(body);
    // planOfflineReplay 再做一次整批校验并按 createdAt 升序排序（唯一顺序口径）
    const items = planOfflineReplay(body.items);
    const auth = req.headers.authorization;
    const forwarded: Record<string, string> = typeof auth === "string" ? { authorization: auth } : {};
    const results: Array<{ id: string; method: string; path: string; status: number; ok: boolean }> = [];
    for (const item of items) {
      const injected = await app.inject({
        method: item.method,
        url: item.path,
        payload: item.body ?? undefined,
        headers: forwarded,
      });
      let payload: { error?: string; code?: string } | null = null;
      try {
        payload = injected.json() as { error?: string; code?: string };
      } catch {
        /* non-json response */
      }
      const result = {
        id: item.id, method: item.method, path: item.path,
        status: injected.statusCode, ok: injected.statusCode < 400,
      };
      results.push(result);
      if (injected.statusCode >= 400) {
        return reply.code(injected.statusCode).send({
          error: payload?.error ?? `重放失败（HTTP ${injected.statusCode}）`,
          code: injected.statusCode === 409 ? "OFFLINE_REPLAY_CONFLICT" : "OFFLINE_REPLAY_FAILED",
          conflictIndex: results.length - 1,
          replayed: results.filter((r) => r.ok).length,
          results,
        });
      }
    }
    return { replayed: results.length, conflictIndex: -1, results };
  } catch (err) {
    if (err instanceof ValidationError) return reply.code(400).send({ error: err.message, code: "INVALID_QUEUE_ITEM" });
    return reply.code(400).send({ error: err instanceof Error ? err.message : String(err), code: "OFFLINE_REPLAY_FAILED" });
  }
});

app.get("/api/sync/changes", async (req, reply) => {
  try {
    const q = req.query as { since?: unknown; limit?: unknown };
    const since = normalizeSince(q.since);
    const limit = normalizeLimit(q.limit);
    const changes = requireDb().listChanges(since, limit);
    return { changes, since, limit, count: changes.length };
  } catch (err) {
    return syncErrorReply(err, reply);
  }
});

app.post("/api/sync/apply", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as {
      entityType?: unknown; entityId?: unknown; operation?: unknown;
      payload?: unknown; expectedVersion?: unknown; base?: unknown; userId?: unknown;
    };
    // 越权防护：远端模式下普通用户不得把变更记到别人名下（admin 可代记）。
    const ctx = (req as AuthRequest).auth ?? resolveAuth(req);
    if (ctx && body.userId !== undefined && body.userId !== null &&
        Number(body.userId) !== ctx.user.id && !authCan(ctx.user.role, "user:manage")) {
      throw new ForbiddenError("不能将变更记到其他用户名下");
    }
    const result = requireDb().applySyncChange({
      entityType: body.entityType,
      entityId: body.entityId,
      operation: body.operation,
      payload: body.payload,
      expectedVersion: body.expectedVersion,
      base: body.base,
      userId: body.userId ?? ctx?.user.id,
    });
    return { applied: result.applied, version: result.version, idempotent: result.idempotent };
  } catch (err) {
    const body = (req.body ?? {}) as { entityType?: unknown; entityId?: unknown };
    return syncErrorReply(err, reply, body);
  }
});

app.get("/api/sync/status", async () => {
  const store = requireDb();
  const versions = store.listEntityVersions();
  const latest = store.listLatestChange();
  return {
    versions,
    total: versions.length,
    lastChangeId: latest ? latest.id : 0,
    lastChangeAt: latest ? latest.createdAt : null,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
});

// ---- r23：组织架构与通讯录（路由只做参数装配与状态码映射，规则全在 shared/org + db） ----

interface DepartmentBody {
  name?: unknown;
  parentId?: unknown;
  sortOrder?: unknown;
  // move 端点用
  parent_id?: unknown;
}

interface MemberBody {
  name?: unknown;
  departmentId?: unknown;
  role?: unknown;
  email?: unknown;
  phone?: unknown;
  title?: unknown;
  status?: unknown;
  userId?: unknown;
}

/** r24：成员在审批（发起/被指派/抄送）与物资（保管）中的真实引用计数 */
/** r25：当前登录用户 → 关联通讯录成员（members.user_id）；未登录/无关联返回 null，老路径不受影响 */
app.get("/api/org/members/me", async (req) => {
  const ctx = (req as AuthRequest).auth ?? resolveAuth(req);
  if (!ctx) return { userId: null, member: null };
  const member = resolveMemberForUser(ctx.user.id, requireDb().listMembers());
  return { userId: ctx.user.id, member: member ? memberSummary(member, requireDb().listDepartments()) : null };
});

app.get("/api/org/members/:id/usage", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const store = requireDb();
    const member = store.getMember(id);
    if (!member) return reply.code(404).send({ error: `人员不存在：${id}` });
    const usage = store.countMemberUsage(id);
    return { ...usage, member: memberSummary(member, store.listDepartments()), usage };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 部门树带直属人员（单条路由装配，web 不做树算法） */
app.get("/api/org/tree", async () => {
  const store = requireDb();
  return {
    tree: store.getOrgTree(),
    departments: store.listDepartments(),
    members: store.listMembers(),
  };
});

app.get("/api/departments", async () => ({ departments: requireDb().listDepartments() }));

app.post("/api/departments", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as DepartmentBody;
    return reply.code(201).send(requireDb().createDepartment({
      name: body.name, parentId: body.parentId, sortOrder: body.sortOrder,
    }));
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/departments/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const dept = requireDb().getDepartment(id);
    if (!dept) return reply.code(404).send({ error: `部门不存在：${id}` });
    return dept;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.patch("/api/departments/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as DepartmentBody;
    const dept = requireDb().updateDepartment(id, {
      name: body.name, parentId: body.parentId, sortOrder: body.sortOrder,
    });
    if (!dept) return reply.code(404).send({ error: `部门不存在：${id}` });
    return dept;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 移动唯一入口：自挂 / 成环 / 越权 id 由 shared 守卫 → 400 */
app.post("/api/departments/:id/move", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as DepartmentBody;
    const parentRaw = body.parentId !== undefined ? body.parentId : body.parent_id;
    const parentId = parentRaw === undefined || parentRaw === null || parentRaw === ""
      ? null
      : parseId(String(parentRaw));
    const dept = requireDb().moveDepartment(id, parentId);
    if (!dept) return reply.code(404).send({ error: `部门不存在：${id}` });
    return dept;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/departments/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireDb().deleteDepartment(id)) return reply.code(404).send({ error: `部门不存在：${id}` });
    return { deleted: true, id };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 静态段 /search 必须先于 /:id 注册，否则被动态 id 吞掉 */
app.get("/api/members/search", async (req, reply) => {
  try {
    const q = (req.query as { q?: unknown }).q;
    const members = requireDb().searchMembers(q);
    return { members, count: members.length, q: typeof q === "string" ? q : "" };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** 人员列表：?departmentId= 按部门过滤；?q= 走同一 shared 模糊搜索口径 */
app.get("/api/members", async (req, reply) => {
  try {
    const query = req.query as { departmentId?: unknown; q?: unknown };
    const store = requireDb();
    const byDept = query.departmentId === undefined ? store.listMembers() : store.listMembers(query.departmentId);
    const members = query.q === undefined ? byDept : requireDb().searchMembers(String(query.q)).filter(
      (m) => query.departmentId === undefined || m.departmentId === Number(query.departmentId),
    );
    return { members, count: members.length, departmentId: query.departmentId ?? null, q: query.q ?? "" };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.post("/api/members", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as MemberBody;
    return reply.code(201).send(requireDb().createMember({
      name: body.name, departmentId: body.departmentId, role: body.role, email: body.email,
      phone: body.phone, title: body.title, status: body.status, userId: body.userId,
    }));
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/members/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const member = requireDb().getMember(id);
    if (!member) return reply.code(404).send({ error: `人员不存在：${id}` });
    return member;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.patch("/api/members/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as MemberBody;
    const member = requireDb().updateMember(id, {
      name: body.name, departmentId: body.departmentId, role: body.role, email: body.email,
      phone: body.phone, title: body.title, status: body.status, userId: body.userId,
    });
    if (!member) return reply.code(404).send({ error: `人员不存在：${id}` });
    return member;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/members/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireDb().deleteMember(id)) return reply.code(404).send({ error: `人员不存在：${id}` });
    return { deleted: true, id };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

// ---- r26：通知中心（站内消息聚合；规则全在 shared/notifications，路由只装配与 400/404 映射） ----

interface NotificationBody {
  type?: unknown;
  title?: unknown;
  body?: unknown;
  refType?: unknown;
  refId?: unknown;
}

function assertNotificationRefExists(
  store: XieFlowDb,
  refType: "schedules" | "approvals" | "assets" | "sync" | "system",
  refId: number,
): void {
  if (refType === "schedules" && !store.getSchedule(refId)) {
    throw new ValidationError(`通知引用日程不存在：${refId}`);
  }
  if (refType === "approvals" && !store.getApproval(refId)) {
    throw new ValidationError(`通知引用审批不存在：${refId}`);
  }
  if (refType === "assets" && !store.getAsset(refId)) {
    throw new ValidationError(`通知引用物资不存在：${refId}`);
  }
}

app.get("/api/notifications", async (req, reply) => {
  try {
    const q = req.query as { type?: unknown; unreadOnly?: unknown; unread?: unknown; page?: unknown; pageSize?: unknown };
    const list = requireDb().listNotifications();
    const result = queryNotifications(list, {
      type: q.type,
      unreadOnly: q.unreadOnly ?? q.unread,
      page: q.page,
      pageSize: q.pageSize,
    });
    return { ...result, summary: notificationSummary(list) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/notifications/summary", async () => {
  const summary = notificationSummary(requireDb().listNotifications());
  return { ...summary, types: NOTIFICATION_TYPES };
});

/** 按当前库状态重算生成：同一事件重复 refresh 不新增（幂等由 db.upsertNotification 唯一口径锁定） */
app.post("/api/notifications/refresh", async () => {
  const store = requireDb();
  const now = new Date();
  const today = localDateStr(now);
  const candidates = collectNotificationCandidates({
    schedules: store.listSchedulesByDateRange(today, today),
    approvals: store.listApprovals(),
    assets: store.listAssets(),
    now,
  });
  let created = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    if (!shouldNotify(candidate.type, candidate.ctx)) continue;
    const draft = buildNotification(candidate.type, candidate.ctx, now);
    const result = store.upsertNotification(draft);
    if (result.created) created += 1;
    else skipped += 1;
  }
  const list = store.listNotifications();
  return { created, skipped, scanned: candidates.length, total: list.length, summary: notificationSummary(list) };
});

app.post("/api/notifications/read-all", async () => {
  const updated = requireDb().markAllNotificationsRead();
  return { updated, summary: notificationSummary(requireDb().listNotifications()) };
});

app.post("/api/notifications", async (req, reply) => {
  try {
    const body = (req.body ?? {}) as NotificationBody;
    assertValidNotificationType(body.type);
    assertValidNotificationRef(body.refType, body.refId ?? 0);
    const refId = Number(body.refId ?? 0);
    const store = requireDb();
    assertNotificationRefExists(store, body.refType, refId);
    const created = store.createNotification({
      type: body.type,
      title: typeof body.title === "string" ? body.title : "",
      body: typeof body.body === "string" ? body.body : "",
      refType: body.refType,
      refId,
      readAt: null,
      createdAt: new Date().toISOString(),
    });
    return reply.code(201).send(created);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.get("/api/notifications/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const found = requireDb().getNotification(id);
    if (!found) return reply.code(404).send({ error: `通知不存在：${id}` });
    return {
      ...found,
      tab: notificationTargetTab(found),
      deepLink: notificationDeepLinkParams(found),
    };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.patch("/api/notifications/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const body = (req.body ?? {}) as NotificationBody;
    const updated = requireDb().updateNotificationContent(id, { title: body.title, body: body.body });
    if (!updated) return reply.code(404).send({ error: `通知不存在：${id}` });
    return updated;
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.post("/api/notifications/:id/read", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    const updated = requireDb().markNotificationRead(id);
    if (!updated) return reply.code(404).send({ error: `通知不存在：${id}` });
    return { ...updated, summary: notificationSummary(requireDb().listNotifications()) };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

app.delete("/api/notifications/:id", async (req, reply) => {
  try {
    const id = parseId((req.params as { id: string }).id);
    if (!requireDb().deleteNotification(id)) return reply.code(404).send({ error: `通知不存在：${id}` });
    return { deleted: true, id };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** r27 报表总览：六类指标一次返回；from/to 闭区间，缺省最近 30 天 */
app.get("/api/reports/overview", async (req, reply) => {
  try {
    const range = reportRangeFromQuery(req.query);
    return assembleReport(collectReportSource(requireDb()), range);
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

/** r27 单项下钻：/api/reports/:metric?from=&to=[&id=]；未知 metric -> 400，越权 id -> 404 */
app.get("/api/reports/:metric", async (req, reply) => {
  try {
    const params = req.params as { metric: string };
    assertValidReportMetric(params.metric);
    const range = reportRangeFromQuery(req.query);
    const overview = assembleReport(collectReportSource(requireDb()), range);
    const result = overview.metrics[params.metric as keyof typeof overview.metrics];
    const rawId = (req.query as { id?: unknown }).id;
    if (rawId === undefined || rawId === null || rawId === "") return result;
    const id = parseId(String(rawId));
    const detail = filterReportDetail(result, id);
    if (detail.length === 0) return reply.code(404).send({ error: `报表实体不存在：${id}` });
    return { ...result, detail, entityId: id, range: overview.range };
  } catch (err) {
    return toErrorReply(err, reply);
  }
});

const stop = async () => {
  await app.close();
  db?.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await app.listen({ port: PORT, host: "127.0.0.1" });
console.log(`[api] listening http://127.0.0.1:${PORT} · db=${DB_PATH}`);
