// 协流 XieFlow — api 服务：健康探针 + settings + todos + schedules 路由（r3）
// 数据文件在 data/xieflow.db；audit-http.ts 对本服务的路由行为做断言。
// 路由层错误契约：输入非法 → 400（shared ValidationError）；id 不存在 → 404。
// 状态机校验走 shared（TODO_STATUS_TRANSITIONS），路由层不散落 if-else。
// r3 联动：待办 due_date ↔ 日程 date 双向同步（规则集中在 shared + db 服务层）。
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
  computeTodoSummary,
  computeRepeatInstances,
  canTransitionTodo,
  type Schedule,
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
    const bodies = store.listSchedulesByDateRange(from, to);
    const seen = new Set<number>();
    const schedules: Array<Schedule & { isInstance: boolean }> = [];
    for (const s of bodies) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        schedules.push({ ...s, isInstance: false });
      }
      for (const inst of computeRepeatInstances(s, { from, to })) {
        if (!seen.has(inst.id + inst.date.length * 0) && !schedules.some((x) => x.id === inst.id && x.date === inst.date)) {
          schedules.push({ ...inst, isInstance: inst.date !== s.date });
        }
      }
    }
    schedules.sort((a, b) => (a.date === b.date ? (a.start < b.start ? -1 : 1) : a.date < b.date ? -1 : 1));
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

const stop = async () => {
  await app.close();
  db?.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await app.listen({ port: PORT, host: "127.0.0.1" });
console.log(`[api] listening http://127.0.0.1:${PORT} · db=${DB_PATH}`);
