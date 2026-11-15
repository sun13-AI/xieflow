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
  computeTodoSummary,
  assembleRangeSchedules,
  computeBoardStats,
  buildBoardCsvContent,
  buildBoardCsvFileName,
  canTransitionTodo,
  queryRecords,
  type Schedule,
  type FieldType,
} from "@xieflow/shared";

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
 * 记录查询（r6 任务单核心）：按字段筛选 + 按字段排序 + 分页。
 * 规则（筛选命中 / 排序比较 / 空值恒最后 / 分页口径）集中在 shared queryRecords，
 * 路由层只负责解析查询串与 400/404 映射——api 层没有任何字段类型分支。
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
    const sortFieldId = parseOptionalQueryId(query.sortFieldId, "sortFieldId");
    const page = parseOptionalQueryId(query.page, "page");
    const pageSize = parseOptionalQueryId(query.pageSize, "pageSize");
    const sortDirection = query.sortDirection === "desc" ? "desc" : "asc";
    return queryRecords(store.listRecords(tableId), fields, {
      filterFieldId,
      filterValue: query.filterValue,
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

const stop = async () => {
  await app.close();
  db?.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await app.listen({ port: PORT, host: "127.0.0.1" });
console.log(`[api] listening http://127.0.0.1:${PORT} · db=${DB_PATH}`);
