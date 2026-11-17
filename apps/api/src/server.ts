// 协流 XieFlow — api 服务：健康探针 + settings + todos + schedules + 项目/看板路由（r4）
// 数据文件在 data/xieflow.db；audit-http.ts 对本服务的路由行为做断言。
// 路由层错误契约：输入非法 → 400（shared ValidationError）；id 不存在 → 404。
// 状态机校验走 shared（TODO_STATUS_TRANSITIONS），路由层不散落 if-else。
// r3 联动：待办 due_date ↔ 日程 date 双向同步（规则集中在 shared + db 服务层）。
// r4 看板：projects / board-columns / cards CRUD + 跨列移动
// （position 重排规则集中 shared reorderPositions，路由层只做装配与 400/404 映射）。
import Fastify from "fastify";
import type { FastifyReply } from "fastify";
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
  type RevisionRequest,
  type Schedule,
  type FieldType,
  type ViewFilterCondition,
} from "@xieflow/shared";
import {
  createMockProvider,
  createDefaultToolRegistry,
  mockPlanner,
  executeChat,
} from "@xieflow/agent";

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

const app = Fastify({ logger: { level: "warn" } });

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
  return { ok: true, schemaVersion: CURRENT_SCHEMA_VERSION, settings };
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
    });
    return reply.code(201).send({
      conversationId: id,
      intent: plan.intent,
      summary: plan.summary,
      planner: chatPlanner.id,
      toolCalls: plan.toolCalls,
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

const stop = async () => {
  await app.close();
  db?.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await app.listen({ port: PORT, host: "127.0.0.1" });
console.log(`[api] listening http://127.0.0.1:${PORT} · db=${DB_PATH}`);
