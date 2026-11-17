// 协流 XieFlow — index.ts：连接、迁移（IKanBot 三件套模式）
// node-sqlite3-wasm：纯 WASM，无需原生编译，跨平台（Node 24 下免预编译二进制坑）。
// CJS 包在 ESM 里走默认导入解构。
// r2：暴露 openDatabaseRaw（raw 底层句柄 + 应用过的迁移清单，供 e2e 真实触达 schema
// 约束与迁移幂等），服务层输入校验收紧为 shared 守卫（先守卫、后落库）。
// r3：schedules 表 CRUD + 与待办的双向联动（due_date ↔ schedule.date）。
// r4：看板数据层——projects / board_columns / cards CRUD + 跨列移动
// （position 重排规则集中 shared reorderPositions，本层只做守卫与落库）。
import sqlite3Wasm from "node-sqlite3-wasm";
import type { Database as WasmDatabase } from "node-sqlite3-wasm";
import { MIGRATIONS, CURRENT_SCHEMA_VERSION, assertMigrationsConsistent } from "./schema.js";
import {
  mapSettingsRow,
  mapRowToTodo,
  mapRowToSchedule,
  mapRowToProject,
  mapRowToBoardColumn,
  mapRowToBoardCard,
  mapRowToBaseTable,
  mapRowToTableField,
  mapRowToTableRecord,
  mapRowToTableView,
  mapRowToDocument,
  mapRowToDocumentBlock,
  mapRowToConversation,
  mapRowToMessage,
  mapRowToArtifact,
  mapRowToKnowledgeDoc,
  mapRowToKnowledgeChunk,
  mapRowToKnowledgeSearchChunk,
} from "./mappers.js";
import type {
  AppSetting,
  Todo,
  Schedule,
  ScheduleRepeat,
  Project,
  BoardColumn,
  BoardCard,
  BaseTable,
  TableField,
  TableRecord,
  TableView,
  ViewSpecInput,
  FieldType,
  Document,
  DocumentBlock,
  BlockType,
  MarkdownBlockDraft,
  Conversation,
  Message,
  MessageContent,
  MessageRole,
  ToolCallRecord,
  Artifact,
  ArtifactType,
  KnowledgeSourceType,
  KnowledgeChunkDraft,
  KnowledgeDoc,
  KnowledgeChunk,
  KnowledgeSearchChunk,
} from "@xieflow/shared";
import {
  canTransitionTodo,
  assertValidQuadrant,
  assertValidTodoStatus,
  assertValidTitle,
  assertValidDueDate,
  assertValidScheduleTitle,
  assertValidScheduleDate,
  assertValidScheduleRange,
  assertValidScheduleRepeat,
  assertValidBoardName,
  assertValidTableName,
  assertValidFieldName,
  assertValidFieldType,
  assertValidFieldOptions,
  assertValidViewName,
  normalizeRecordData,
  normalizeViewSpec,
  reorderPositions,
  DEFAULT_BOARD_COLUMNS,
  DEFAULT_TABLE_FIELDS,
  LINK_SCHEDULE_DEFAULT_START,
  LINK_SCHEDULE_DEFAULT_END,
  assertValidDocumentTitle,
  assertValidBlockType,
  assertValidBlockPosition,
  normalizeBlockContent,
  convertBlockContent,
  planBlockSplit,
  mergeBlockContent,
  planBlockReorder,
  assembleDocumentText,
  DEFAULT_DOCUMENT_FIRST_BLOCK,
  MARKDOWN_IMPORT_MAX_BLOCKS,
  assertValidConversationTitle,
  assertValidChatMessage,
  assertValidMessageRole,
  assertValidArtifactType,
  assertValidKnowledgeTitle,
  assertValidKnowledgeSourceType,
  assertValidKnowledgeContent,
  ValidationError,
} from "@xieflow/shared";
import { REPEATS_ORDER } from "./repeat-order.js";

export { MIGRATIONS, CURRENT_SCHEMA_VERSION, assertMigrationsConsistent };

const { Database } = sqlite3Wasm as unknown as {
  Database: new (filename: string, options?: { fileMustExist?: boolean }) => WasmDatabase;
};

export interface OpenOptions {
  /** 内存库用于测试；文件库用于真实数据 */
  path: string;
}

export interface OpenedDatabase {
  /** 服务层门面（迁移完成后的常规入口） */
  db: XieFlowDb;
  /** 底层 SQLite 句柄（e2e 直达 schema 约束 / PRAGMA 用；调用方负责 close） */
  raw: WasmDatabase;
  /** 本次打开实际执行的迁移版本（重开已迁移库时应为空数组） */
  appliedMigrations: number[];
}

function runMigrations(db: WasmDatabase): number[] {
  const row = db.get("PRAGMA user_version") as { user_version?: number } | undefined;
  let current = row?.user_version ?? 0;
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      for (const sql of m.up) {
        db.exec(sql);
      }
      db.exec(`PRAGMA user_version = ${m.version}`);
      current = m.version;
      applied.push(m.version);
    }
  }
  if (current !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`迁移未达目标版本：停在 ${current}，目标 ${CURRENT_SCHEMA_VERSION}`);
  }
  return applied;
}

function openRaw(opts: OpenOptions): WasmDatabase {
  assertMigrationsConsistent();
  const db = new Database(opts.path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  return db;
}

/** 打开数据库并迁移到最新版本。所有服务层从这里拿连接。 */
export function openDatabase(opts: OpenOptions): XieFlowDb {
  const raw = openRaw(opts);
  runMigrations(raw);
  return new XieFlowDb(raw);
}

/** r2：带迁移过程信息的打开方式（e2e 断言迁移幂等 / raw 直达约束用）。调用方负责 close。 */
export function openDatabaseRaw(opts: OpenOptions): OpenedDatabase {
  const raw = openRaw(opts);
  const appliedMigrations = runMigrations(raw);
  return { db: new XieFlowDb(raw), raw, appliedMigrations };
}

/** raw 句柄类型（e2e / 脚本用，不进业务代码） */
export type SqliteDatabase = WasmDatabase;

/** r3：repeat 枚举全量清单 re-export（api/web 共用，不散落字面量） */
export { REPEATS_ORDER };

/** 服务层门面：settings 与 todo 的最小接口 */
export class XieFlowDb {
  constructor(private readonly db: WasmDatabase) {}

  // ---- settings ----

  getSetting(key: string): AppSetting | null {
    const row = this.db.get("SELECT key, value, updated_at FROM settings WHERE key = ?", [key]);
    return row ? mapSettingsRow(row) : null;
  }

  setSetting(key: string, value: string): AppSetting {
    if (key.trim() === "") {
      throw new Error("settings key 不能为空");
    }
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, now],
    );
    const row = this.db.get("SELECT key, value, updated_at FROM settings WHERE key = ?", [key]);
    if (!row) throw new Error(`写入后读回失败：${key}`);
    return mapSettingsRow(row);
  }

  listSettings(): AppSetting[] {
    const rows = this.db.all("SELECT key, value, updated_at FROM settings ORDER BY key");
    return rows.map(mapSettingsRow);
  }

  // ---- todos ----

  createTodo(title: string, quadrant: string, dueDate: string | null): Todo {
    // r2：shared 守卫先行（空标题 / 非法象限 / 非法日期在落库前拦截，错误消息稳定）
    assertValidTitle(title);
    assertValidQuadrant(quadrant);
    assertValidDueDate(dueDate);
    const now = new Date().toISOString();
    const res = this.db.run(
      `INSERT INTO todos (title, quadrant, status, due_date, created_at, updated_at)
       VALUES (?, ?, 'open', ?, ?, ?)`,
      [title, quadrant, dueDate, now, now],
    );
    const row = this.db.get("SELECT * FROM todos WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("待办写入后读回失败");
    const todo = mapRowToTodo(row);
    // r3 联动：建待办即带截止日 → 自动生成关联日程（与 updateTodoDueDate 同一规则）
    if (dueDate !== null) {
      this.createSchedule(
        title,
        dueDate,
        LINK_SCHEDULE_DEFAULT_START,
        LINK_SCHEDULE_DEFAULT_END,
        todo.id,
        "none",
      );
    }
    return todo;
  }

  getTodo(id: number): Todo | null {
    const row = this.db.get("SELECT * FROM todos WHERE id = ?", [id]);
    return row ? mapRowToTodo(row) : null;
  }

  listTodos(): Todo[] {
    return this.db.all("SELECT * FROM todos ORDER BY created_at").map(mapRowToTodo);
  }

  /** 状态流转：目标状态先过 shared 守卫，再查状态机（非法流转抛错） */
  transitionTodo(id: number, to: Todo["status"]): Todo {
    assertValidTodoStatus(to);
    const row = this.db.get("SELECT * FROM todos WHERE id = ?", [id]);
    if (!row) throw new Error(`待办不存在：${id}`);
    const todo = mapRowToTodo(row);
    if (!canTransitionTodo(todo.status, to)) {
      throw new Error(`非法状态流转：${todo.status} → ${to}`);
    }
    this.db.run("UPDATE todos SET status = ?, updated_at = ? WHERE id = ?", [
      to,
      new Date().toISOString(),
      id,
    ]);
    return this.getTodo(id)!;
  }

  deleteTodo(id: number): boolean {
    const res = this.db.run("DELETE FROM todos WHERE id = ?", [id]);
    return res.changes > 0;
  }

  // ---- schedules（r3：日程 + 双向联动） ----

  createSchedule(
    title: string,
    date: string,
    start: string,
    end: string,
    todoId: number | null = null,
    repeat: ScheduleRepeat = "none",
    repeatWindow?: { from: string; to: string },
  ): Schedule {
    assertValidScheduleTitle(title);
    assertValidScheduleDate(date);
    assertValidScheduleRange(start, end);
    assertValidScheduleRepeat(repeat);
    if (repeatWindow) {
      assertValidScheduleDate(repeatWindow.from);
      assertValidScheduleDate(repeatWindow.to);
      if (repeatWindow.to < repeatWindow.from) {
        throw new Error(`实例化窗口非法：${repeatWindow.from} → ${repeatWindow.to}`);
      }
    }
    if (todoId !== null && this.getTodo(todoId) === null) {
      throw new Error(`关联的待办不存在：${todoId}`);
    }
    const now = new Date().toISOString();
    const res = this.db.run(
      `INSERT INTO schedules (title, date, start_time, end_time, todo_id, repeat, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, date, start, end, todoId, repeat, now, now],
    );
    const row = this.db.get("SELECT * FROM schedules WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("日程写入后读回失败");
    return mapRowToSchedule(row);
  }

  getSchedule(id: number): Schedule | null {
    const row = this.db.get("SELECT * FROM schedules WHERE id = ?", [id]);
    return row ? mapRowToSchedule(row) : null;
  }

  /** 按日期区间查日程（含端点；与循环实例展开后的并集一起下发由 api 层组装） */
  listSchedulesByDateRange(from: string, to: string): Schedule[] {
    assertValidScheduleDate(from);
    assertValidScheduleDate(to);
    return this.db
      .all("SELECT * FROM schedules WHERE date >= ? AND date <= ? ORDER BY date, start_time", [from, to])
      .map(mapRowToSchedule);
  }

  listSchedules(): Schedule[] {
    return this.db.all("SELECT * FROM schedules ORDER BY date, start_time").map(mapRowToSchedule);
  }

  updateSchedule(
    id: number,
    patch: { title?: string; date?: string; start?: string; end?: string; repeat?: ScheduleRepeat; todoId?: number | null },
  ): Schedule {
    const current = this.getSchedule(id);
    if (!current) throw new Error(`日程不存在：${id}`);
    // 部分补丁语义：合成后的完整值整体过守卫（先守卫、后落库）
    const title = patch.title ?? current.title;
    const date = patch.date ?? current.date;
    const start = patch.start ?? current.start;
    const end = patch.end ?? current.end;
    const repeat = patch.repeat ?? current.repeat;
    const todoId = patch.todoId !== undefined ? patch.todoId : current.todoId;
    assertValidScheduleTitle(title);
    assertValidScheduleDate(date);
    assertValidScheduleRange(start, end);
    assertValidScheduleRepeat(repeat);
    if (todoId !== null && this.getTodo(todoId) === null) {
      throw new Error(`关联的待办不存在：${todoId}`);
    }
    this.db.run(
      `UPDATE schedules SET title = ?, date = ?, start_time = ?, end_time = ?, todo_id = ?, repeat = ?, updated_at = ?
       WHERE id = ?`,
      [title, date, start, end, todoId, repeat, new Date().toISOString(), id],
    );
    return this.getSchedule(id)!;
  }

  /** 日程改期（联动入口）：更新 date 并回写关联待办的 due_date（双向闭环的另一向） */
  updateScheduleDate(id: number, date: string): Schedule {
    const moved = this.updateSchedule(id, { date });
    if (moved.todoId !== null) {
      this.db.run("UPDATE todos SET due_date = ?, updated_at = ? WHERE id = ?", [
        date,
        new Date().toISOString(),
        moved.todoId,
      ]);
    }
    return moved;
  }

  deleteSchedule(id: number): boolean {
    const res = this.db.run("DELETE FROM schedules WHERE id = ?", [id]);
    return res.changes > 0;
  }

  /** 待办设/改/清 due_date（联动入口）：清除→删关联日程；设置→生成或改期关联日程（幂等） */
  updateTodoDueDate(id: number, dueDate: string | null): Todo {
    const current = this.getTodo(id);
    if (!current) throw new Error(`待办不存在：${id}`);
    assertValidDueDate(dueDate);
    const existing = this.db.get(
      "SELECT id FROM schedules WHERE todo_id = ? ORDER BY id LIMIT 1",
      [id],
    );
    const existingId = existing ? Number((existing as { id: unknown }).id) : null;
    if (dueDate === null) {
      if (existingId !== null) this.deleteSchedule(existingId);
    } else if (existingId !== null) {
      this.updateSchedule(existingId, { date: dueDate });
    } else {
      this.createSchedule(
        current.title,
        dueDate,
        LINK_SCHEDULE_DEFAULT_START,
        LINK_SCHEDULE_DEFAULT_END,
        id,
        "none",
      );
    }
    this.db.run("UPDATE todos SET due_date = ?, updated_at = ? WHERE id = ?", [
      dueDate,
      new Date().toISOString(),
      id,
    ]);
    return this.getTodo(id)!;
  }

  close(): void {
    this.db.close();
  }

  // ---- projects / board / cards（r4：项目与看板数据层） ----

  /**
   * 项目创建（r4 返工#1 A1）：自动创建默认三列「待办 / 进行中 / 已完成」（position 0/1/2）。
   * 模板集中 shared DEFAULT_BOARD_COLUMNS——消灭「新建项目 → 看板零列零卡」用户死路，
   * 与项目页/看板空态文案口径一致。先建项目、后逐列落库（列守卫与显式建列同源）。
   */
  createProject(name: string, description: string | null = null): Project {
    // 先守卫、后落库（r2 收紧范式延续）：空名/超长名在 SQL 之前拦截
    assertValidBoardName(name);
    const now = new Date().toISOString();
    const res = this.db.run(
      "INSERT INTO projects (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)",
      [name, description, now, now],
    );
    const row = this.db.get("SELECT * FROM projects WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("项目写入后读回失败");
    const project = mapRowToProject(row);
    for (const [i, colName] of DEFAULT_BOARD_COLUMNS.entries()) {
      this.createBoardColumn(project.id, colName, i);
    }
    return project;
  }

  getProject(id: number): Project | null {
    const row = this.db.get("SELECT * FROM projects WHERE id = ?", [id]);
    return row ? mapRowToProject(row) : null;
  }

  listProjects(): Project[] {
    return this.db.all("SELECT * FROM projects ORDER BY id").map(mapRowToProject);
  }

  updateProject(
    id: number,
    patch: { name?: string; description?: string | null },
  ): Project {
    const current = this.getProject(id);
    if (!current) throw new Error(`项目不存在：${id}`);
    // 部分补丁语义：合成后的完整值整体过守卫（先守卫、后落库）
    const name = patch.name ?? current.name;
    const description =
      patch.description !== undefined ? patch.description : current.description;
    assertValidBoardName(name);
    this.db.run("UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?", [
      name,
      description,
      new Date().toISOString(),
      id,
    ]);
    return this.getProject(id)!;
  }

  /** 项目删除：列与卡片经 schema 级联（ON DELETE CASCADE）随行删除 */
  deleteProject(id: number): boolean {
    const res = this.db.run("DELETE FROM projects WHERE id = ?", [id]);
    return res.changes > 0;
  }

  createBoardColumn(projectId: number, name: string, position?: number): BoardColumn {
    assertValidBoardName(name);
    if (this.getProject(projectId) === null) {
      throw new Error(`项目不存在：${projectId}`);
    }
    // position 缺省 = 自动追加列尾（现有列数即下一个下标，与卡片同语义）
    const pos =
      position ??
      Number(
        (
          this.db.get("SELECT COUNT(*) AS n FROM board_columns WHERE project_id = ?", [
            projectId,
          ]) as { n: unknown }
        ).n,
      );
    if (!Number.isInteger(pos) || pos < 0) {
      throw new Error(`非法列位置：${String(pos)}`);
    }
    // position 在项目内唯一：先查重再落库（唯一索引兜底，服务层错误消息稳定）
    const dup = this.db.get(
      "SELECT id FROM board_columns WHERE project_id = ? AND position = ?",
      [projectId, pos],
    );
    if (dup) {
      throw new Error(`列位置已被占用：${pos}`);
    }
    const now = new Date().toISOString();
    const res = this.db.run(
      "INSERT INTO board_columns (project_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [projectId, name, pos, now, now],
    );
    const row = this.db.get("SELECT * FROM board_columns WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("看板列写入后读回失败");
    return mapRowToBoardColumn(row);
  }

  getBoardColumn(id: number): BoardColumn | null {
    const row = this.db.get("SELECT * FROM board_columns WHERE id = ?", [id]);
    return row ? mapRowToBoardColumn(row) : null;
  }

  listBoardColumns(projectId: number): BoardColumn[] {
    return this.db
      .all("SELECT * FROM board_columns WHERE project_id = ? ORDER BY position", [projectId])
      .map(mapRowToBoardColumn);
  }

  updateBoardColumn(id: number, patch: { name?: string; position?: number }): BoardColumn {
    const current = this.getBoardColumn(id);
    if (!current) throw new Error(`看板列不存在：${id}`);
    const name = patch.name ?? current.name;
    const position = patch.position ?? current.position;
    assertValidBoardName(name);
    if (!Number.isInteger(position) || position < 0) {
      throw new Error(`非法列位置：${String(position)}`);
    }
    if (
      position !== current.position &&
      this.db.get("SELECT id FROM board_columns WHERE project_id = ? AND position = ? AND id != ?", [
        current.projectId,
        position,
        id,
      ])
    ) {
      throw new Error(`列位置已被占用：${position}`);
    }
    this.db.run("UPDATE board_columns SET name = ?, position = ?, updated_at = ? WHERE id = ?", [
      name,
      position,
      new Date().toISOString(),
      id,
    ]);
    return this.getBoardColumn(id)!;
  }

  /** 列删除：列内卡片经 schema 级联（ON DELETE CASCADE）随行删除 */
  deleteBoardColumn(id: number): boolean {
    const res = this.db.run("DELETE FROM board_columns WHERE id = ?", [id]);
    return res.changes > 0;
  }

  createBoardCard(
    projectId: number,
    columnId: number,
    title: string,
    description: string | null = null,
    position?: number,
    todoId: number | null = null,
  ): BoardCard {
    assertValidBoardName(title);
    if (this.getProject(projectId) === null) {
      throw new Error(`项目不存在：${projectId}`);
    }
    const column = this.getBoardColumn(columnId);
    if (column === null) {
      throw new Error(`看板列不存在：${columnId}`);
    }
    // 卡片必须落在所属项目自己的列里（列 carries projectId；双源一致性守卫）
    if (column.projectId !== projectId) {
      throw new Error(`看板列 ${columnId} 不属于项目 ${projectId}`);
    }
    if (todoId !== null && this.getTodo(todoId) === null) {
      throw new Error(`关联的待办不存在：${todoId}`);
    }
    // position 缺省 = 追加到列尾（列内现有张数即下一个下标）
    const pos =
      position ??
      Number(
        (
          this.db.get("SELECT COUNT(*) AS n FROM cards WHERE column_id = ?", [
            columnId,
          ]) as { n: unknown }
        ).n,
      );
    if (!Number.isInteger(pos) || pos < 0) {
      throw new Error(`非法卡片位置：${String(pos)}`);
    }
    const now = new Date().toISOString();
    const res = this.db.run(
      "INSERT INTO cards (project_id, column_id, title, description, position, todo_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [projectId, columnId, title, description, pos, todoId, now, now],
    );
    const row = this.db.get("SELECT * FROM cards WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("卡片写入后读回失败");
    return mapRowToBoardCard(row);
  }

  getBoardCard(id: number): BoardCard | null {
    const row = this.db.get("SELECT * FROM cards WHERE id = ?", [id]);
    return row ? mapRowToBoardCard(row) : null;
  }

  listBoardCards(columnId: number): BoardCard[] {
    return this.db
      .all("SELECT * FROM cards WHERE column_id = ? ORDER BY position", [columnId])
      .map(mapRowToBoardCard);
  }

  listBoardCardsByProject(projectId: number): BoardCard[] {
    return this.db
      .all("SELECT * FROM cards WHERE project_id = ? ORDER BY column_id, position", [projectId])
      .map(mapRowToBoardCard);
  }

  updateBoardCard(
    id: number,
    patch: { title?: string; description?: string | null; todoId?: number | null },
  ): BoardCard {
    const current = this.getBoardCard(id);
    if (!current) throw new Error(`卡片不存在：${id}`);
    // 部分补丁语义：合成后的完整值整体过守卫（先守卫、后落库）
    const title = patch.title ?? current.title;
    const description =
      patch.description !== undefined ? patch.description : current.description;
    const todoId = patch.todoId !== undefined ? patch.todoId : current.todoId;
    assertValidBoardName(title);
    if (todoId !== null && this.getTodo(todoId) === null) {
      throw new Error(`关联的待办不存在：${todoId}`);
    }
    this.db.run(
      "UPDATE cards SET title = ?, description = ?, todo_id = ?, updated_at = ? WHERE id = ?",
      [title, description, todoId, new Date().toISOString(), id],
    );
    return this.getBoardCard(id)!;
  }

  deleteBoardCard(id: number): boolean {
    const res = this.db.run("DELETE FROM cards WHERE id = ?", [id]);
    return res.changes > 0;
  }

  /**
   * 跨列移动卡片（r4 联动入口）：cardId 移到 toColumnId 的 to 位。
   * 重排规则集中 shared reorderPositions——源列与目标列分别用同一纯函数算出
   * 全部受影响卡片的新 position；同列移动只重排一列。
   * 守卫：卡与目标列必须存在、目标列必须属于卡自己的项目（跨项目移动拒绝）。
   */
  moveBoardCard(cardId: number, toColumnId: number, to: number): BoardCard {
    const card = this.getBoardCard(cardId);
    if (!card) throw new Error(`卡片不存在：${cardId}`);
    const targetColumn = this.getBoardColumn(toColumnId);
    if (!targetColumn) throw new Error(`看板列不存在：${toColumnId}`);
    if (targetColumn.projectId !== card.projectId) {
      throw new Error(`跨项目移动被拒绝：卡片属于项目 ${card.projectId}，目标列属于项目 ${targetColumn.projectId}`);
    }
    const now = new Date().toISOString();
    if (toColumnId === card.columnId) {
      // 同列移动：一列内重排
      const siblings = this.listBoardCards(toColumnId);
      const plan = reorderPositions(siblings, cardId, to);
      for (const p of plan) {
        if (p.id === cardId) continue; // 移动卡本体随 plan 最后一并写
        this.db.run("UPDATE cards SET position = ?, updated_at = ? WHERE id = ?", [
          p.position,
          now,
          p.id,
        ]);
      }
      this.db.run("UPDATE cards SET position = ?, updated_at = ? WHERE id = ?", [
        to,
        now,
        cardId,
      ]);
    } else {
      // 跨列移动：源列收拢重排 + 目标列插入重排
      const sourceSiblings = this.listBoardCards(card.columnId);
      const sourcePlan = reorderPositions(sourceSiblings, cardId, sourceSiblings.length - 1);
      for (const p of sourcePlan) {
        if (p.id === cardId) continue; // 移动卡本体随目标列写入
        this.db.run("UPDATE cards SET position = ?, updated_at = ? WHERE id = ?", [
          p.position,
          now,
          p.id,
        ]);
      }
      const targetSiblings = this.listBoardCards(toColumnId);
      const targetPlan = reorderPositions(
        [...targetSiblings, { id: cardId, position: targetSiblings.length }],
        cardId,
        to,
      );
      for (const p of targetPlan) {
        if (p.id === cardId) {
          this.db.run(
            "UPDATE cards SET column_id = ?, position = ?, updated_at = ? WHERE id = ?",
            [toColumnId, p.position, now, cardId],
          );
        } else {
          this.db.run("UPDATE cards SET position = ?, updated_at = ? WHERE id = ?", [
            p.position,
            now,
            p.id,
          ]);
        }
      }
    }
    return this.getBoardCard(cardId)!;
  }

  /** 同列移动便捷入口：moveBoardCard 的同列特例（body 只带 position 的路由走这里） */
  moveBoardCardSameColumn(cardId: number, to: number): BoardCard {
    const card = this.getBoardCard(cardId);
    if (!card) throw new Error(`卡片不存在：${cardId}`);
    return this.moveBoardCard(cardId, card.columnId, to);
  }

  // ---- 多维表格（r6：表 / 字段 / 记录） ----

  /**
   * 建表（r6「用户第一次用」：建表即带默认字段模板，不留零字段死路）。
   * 默认字段覆盖 7 种类型（文本/单选/数字/日期/多选/复选框/链接），
   * 模板口径集中 shared DEFAULT_TABLE_FIELDS——api / UI / 文档同一来源。
   */
  createTable(name: string, description: string | null = null): BaseTable {
    assertValidTableName(name);
    const now = new Date().toISOString();
    const res = this.db.run(
      "INSERT INTO tables (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)",
      [name, description, now, now],
    );
    const row = this.db.get("SELECT * FROM tables WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("表格写入后读回失败");
    const table = mapRowToBaseTable(row);
    let position = 0;
    for (const spec of DEFAULT_TABLE_FIELDS) {
      this.createField(table.id, spec.name, spec.type, spec.options, position);
      position += 1;
    }
    return table;
  }

  getTable(id: number): BaseTable | null {
    const row = this.db.get("SELECT * FROM tables WHERE id = ?", [id]);
    return row ? mapRowToBaseTable(row) : null;
  }

  listTables(): BaseTable[] {
    return this.db.all("SELECT * FROM tables ORDER BY id").map(mapRowToBaseTable);
  }

  updateTable(id: number, patch: { name?: string; description?: string | null }): BaseTable {
    const current = this.getTable(id);
    if (!current) throw new Error(`表格不存在：${id}`);
    const name = patch.name ?? current.name;
    const description = patch.description !== undefined ? patch.description : current.description;
    assertValidTableName(name);
    this.db.run("UPDATE tables SET name = ?, description = ?, updated_at = ? WHERE id = ?", [
      name,
      description,
      new Date().toISOString(),
      id,
    ]);
    return this.getTable(id)!;
  }

  /** 删表：字段与记录经 schema 级联（ON DELETE CASCADE）随行删除 */
  deleteTable(id: number): boolean {
    const res = this.db.run("DELETE FROM tables WHERE id = ?", [id]);
    return res.changes > 0;
  }

  createField(
    tableId: number,
    name: string,
    type: FieldType,
    options: readonly string[] = [],
    position?: number,
  ): TableField {
    assertValidFieldName(name);
    assertValidFieldType(type);
    assertValidFieldOptions(type, options);
    if (this.getTable(tableId) === null) {
      throw new Error(`表格不存在：${tableId}`);
    }
    const pos =
      position ??
      Number(
        (
          this.db.get("SELECT COUNT(*) AS n FROM fields WHERE table_id = ?", [tableId]) as { n: unknown }
        ).n,
      );
    if (!Number.isInteger(pos) || pos < 0) {
      throw new Error(`非法字段位置：${String(pos)}`);
    }
    // 字段名在表内唯一：先查重再落库（错误消息稳定）
    const dupName = this.db.get("SELECT id FROM fields WHERE table_id = ? AND name = ?", [
      tableId,
      name,
    ]);
    if (dupName) {
      throw new Error(`字段名称已存在：${name}`);
    }
    const dupPos = this.db.get("SELECT id FROM fields WHERE table_id = ? AND position = ?", [
      tableId,
      pos,
    ]);
    if (dupPos) {
      throw new Error(`字段位置已被占用：${pos}`);
    }
    const now = new Date().toISOString();
    const res = this.db.run(
      "INSERT INTO fields (table_id, name, type, position, options, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [tableId, name, type, pos, JSON.stringify([...options]), now, now],
    );
    const row = this.db.get("SELECT * FROM fields WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("字段写入后读回失败");
    return mapRowToTableField(row);
  }

  getField(id: number): TableField | null {
    const row = this.db.get("SELECT * FROM fields WHERE id = ?", [id]);
    return row ? mapRowToTableField(row) : null;
  }

  listFields(tableId: number): TableField[] {
    return this.db
      .all("SELECT * FROM fields WHERE table_id = ? ORDER BY position, id", [tableId])
      .map(mapRowToTableField);
  }

  updateField(
    id: number,
    patch: { name?: string; type?: string; options?: readonly string[]; position?: number },
  ): TableField {
    const current = this.getField(id);
    if (!current) throw new Error(`字段不存在：${id}`);
    const name = patch.name ?? current.name;
    const type = (patch.type ?? current.type) as FieldType;
    assertValidFieldName(name);
    assertValidFieldType(type);
    // 改类型时：给了候选项就用新的；没给就沿用旧的（非单选类型一律清空）
    const rawOptions =
      patch.options !== undefined ? [...patch.options] : type === current.type ? [...current.options] : [];
    const options =
      type === "select" || type === "multi-select" ? rawOptions : [];
    assertValidFieldOptions(type, options);
    const position = patch.position ?? current.position;
    if (!Number.isInteger(position) || position < 0) {
      throw new Error(`非法字段位置：${String(position)}`);
    }
    if (
      name !== current.name &&
      this.db.get("SELECT id FROM fields WHERE table_id = ? AND name = ? AND id != ?", [
        current.tableId,
        name,
        id,
      ])
    ) {
      throw new Error(`字段名称已存在：${name}`);
    }
    if (
      position !== current.position &&
      this.db.get("SELECT id FROM fields WHERE table_id = ? AND position = ? AND id != ?", [
        current.tableId,
        position,
        id,
      ])
    ) {
      throw new Error(`字段位置已被占用：${position}`);
    }
    this.db.run(
      "UPDATE fields SET name = ?, type = ?, position = ?, options = ?, updated_at = ? WHERE id = ?",
      [name, type, position, JSON.stringify(options), new Date().toISOString(), id],
    );
    return this.getField(id)!;
  }

  /**
   * 删字段：同时把该字段的键从本表所有记录里清掉（不留孤儿键，
   * 否则读回时会出现「表里没有的字段值」）。
   */
  deleteField(id: number): boolean {
    const field = this.getField(id);
    if (!field) return false;
    for (const record of this.listRecords(field.tableId)) {
      const key = String(field.id);
      if (!(key in record.data)) continue;
      const next = { ...record.data };
      delete next[key];
      this.db.run("UPDATE records SET data = ?, updated_at = ? WHERE id = ?", [
        JSON.stringify(next),
        new Date().toISOString(),
        record.id,
      ]);
    }
    const res = this.db.run("DELETE FROM fields WHERE id = ?", [id]);
    return res.changes > 0;
  }

  /**
   * 建记录（表的一行）：data 的键是「字段 id 字符串」，
   * 值先经 shared normalizeRecordData 归一 + 校验（未知字段 / 类型不符一律拒绝）。
   */
  createRecord(tableId: number, data: Record<string, unknown>): TableRecord {
    if (this.getTable(tableId) === null) {
      throw new Error(`表格不存在：${tableId}`);
    }
    const fields = this.listFields(tableId);
    const normalized = normalizeRecordData(fields, data);
    const pos = Number(
      (
        this.db.get("SELECT COUNT(*) AS n FROM records WHERE table_id = ?", [tableId]) as { n: unknown }
      ).n,
    );
    const now = new Date().toISOString();
    const res = this.db.run(
      "INSERT INTO records (table_id, data, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [tableId, JSON.stringify(normalized), pos, now, now],
    );
    const row = this.db.get("SELECT * FROM records WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("记录写入后读回失败");
    return mapRowToTableRecord(row);
  }

  getRecord(id: number): TableRecord | null {
    const row = this.db.get("SELECT * FROM records WHERE id = ?", [id]);
    return row ? mapRowToTableRecord(row) : null;
  }

  listRecords(tableId: number): TableRecord[] {
    return this.db
      .all("SELECT * FROM records WHERE table_id = ? ORDER BY position, id", [tableId])
      .map(mapRowToTableRecord);
  }

  /** 编辑单元格（整行 data 覆盖写）：同样先归一 + 校验再落库 */
  updateRecord(id: number, data: Record<string, unknown>): TableRecord {
    const current = this.getRecord(id);
    if (!current) throw new Error(`记录不存在：${id}`);
    const fields = this.listFields(current.tableId);
    const normalized = normalizeRecordData(fields, data);
    this.db.run("UPDATE records SET data = ?, updated_at = ? WHERE id = ?", [
      JSON.stringify(normalized),
      new Date().toISOString(),
      id,
    ]);
    return this.getRecord(id)!;
  }

  deleteRecord(id: number): boolean {
    const res = this.db.run("DELETE FROM records WHERE id = ?", [id]);
    return res.changes > 0;
  }

  // ---- 视图（r7：筛选 / 排序 / 字段可见性持久化） ----

  /**
   * 建视图：spec 归一口径集中 shared `normalizeViewSpec`
   * （字段不存在 / 取值类型不符 / 字段重复一律拒绝——不落坏 spec）。
   * position 缺省 = 追加到本表视图列尾；视图名在表内唯一（错误消息稳定）。
   */
  createView(
    tableId: number,
    name: string,
    spec: ViewSpecInput,
    position?: number,
  ): TableView {
    assertValidViewName(name);
    if (this.getTable(tableId) === null) {
      throw new Error(`表格不存在：${tableId}`);
    }
    const fields = this.listFields(tableId);
    const normalized = normalizeViewSpec(fields, spec);
    const dupName = this.db.get("SELECT id FROM views WHERE table_id = ? AND name = ?", [
      tableId,
      name,
    ]);
    if (dupName) {
      throw new Error(`视图名称已存在：${name}`);
    }
    const pos =
      position ??
      Number(
        (
          this.db.get("SELECT COUNT(*) AS n FROM views WHERE table_id = ?", [tableId]) as {
            n: unknown;
          }
        ).n,
      );
    if (!Number.isInteger(pos) || pos < 0) {
      throw new Error(`非法视图位置：${String(pos)}`);
    }
    const now = new Date().toISOString();
    const res = this.db.run(
      "INSERT INTO views (table_id, name, filter_spec, sort_spec, visible_fields, position, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        tableId,
        name,
        JSON.stringify(normalized.filterSpec),
        JSON.stringify(normalized.sortSpec),
        JSON.stringify(normalized.visibleFields),
        pos,
        now,
        now,
      ],
    );
    const row = this.db.get("SELECT * FROM views WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("视图写入后读回失败");
    return mapRowToTableView(row);
  }

  getView(id: number): TableView | null {
    const row = this.db.get("SELECT * FROM views WHERE id = ?", [id]);
    return row ? mapRowToTableView(row) : null;
  }

  listViews(tableId: number): TableView[] {
    return this.db
      .all("SELECT * FROM views WHERE table_id = ? ORDER BY position, id", [tableId])
      .map(mapRowToTableView);
  }

  /** 改视图：部分补丁语义（未给的 spec 段沿用旧值，整体重新归一后落库） */
  updateView(
    id: number,
    patch: {
      name?: string;
      filterSpec?: unknown;
      sortSpec?: unknown;
      visibleFields?: unknown;
      position?: number;
    },
  ): TableView {
    const current = this.getView(id);
    if (!current) throw new Error(`视图不存在：${id}`);
    const name = patch.name ?? current.name;
    assertValidViewName(name);
    if (
      name !== current.name &&
      this.db.get("SELECT id FROM views WHERE table_id = ? AND name = ? AND id != ?", [
        current.tableId,
        name,
        id,
      ])
    ) {
      throw new Error(`视图名称已存在：${name}`);
    }
    const fields = this.listFields(current.tableId);
    const normalized = normalizeViewSpec(fields, {
      filterSpec: patch.filterSpec !== undefined ? patch.filterSpec : current.filterSpec,
      sortSpec: patch.sortSpec !== undefined ? patch.sortSpec : current.sortSpec,
      visibleFields:
        patch.visibleFields !== undefined ? patch.visibleFields : current.visibleFields,
    });
    const position = patch.position ?? current.position;
    if (!Number.isInteger(position) || position < 0) {
      throw new Error(`非法视图位置：${String(position)}`);
    }
    this.db.run(
      "UPDATE views SET name = ?, filter_spec = ?, sort_spec = ?, visible_fields = ?, position = ?, updated_at = ? " +
        "WHERE id = ?",
      [
        name,
        JSON.stringify(normalized.filterSpec),
        JSON.stringify(normalized.sortSpec),
        JSON.stringify(normalized.visibleFields),
        position,
        new Date().toISOString(),
        id,
      ],
    );
    return this.getView(id)!;
  }

  /** 删视图（表被删时视图经 schema 级联随行删除） */
  deleteView(id: number): boolean {
    const res = this.db.run("DELETE FROM views WHERE id = ?", [id]);
    return res.changes > 0;
  }

  /**
   * CSV 导入落库（零半态的服务层保证）：
   * ① 全部行先整体归一 + 校验——**任一行不合法则一行都不写**（校验在事务外先做完）；
   * ② 写入包在一个 SQLite 事务里：中途任何异常 → ROLLBACK，绝不留下半截数据；
   * ③ 返回写入后的记录（读回真实 id 与归一后的值）。
   */
  importRecords(tableId: number, rows: readonly Record<string, unknown>[]): TableRecord[] {
    if (this.getTable(tableId) === null) {
      throw new Error(`表格不存在：${tableId}`);
    }
    const fields = this.listFields(tableId);
    const normalized = rows.map((row) => normalizeRecordData(fields, row));
    const now = new Date().toISOString();
    const start = Number(
      (
        this.db.get("SELECT COUNT(*) AS n FROM records WHERE table_id = ?", [tableId]) as {
          n: unknown;
        }
      ).n,
    );
    const created: TableRecord[] = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (let i = 0; i < normalized.length; i += 1) {
        const res = this.db.run(
          "INSERT INTO records (table_id, data, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          [tableId, JSON.stringify(normalized[i]), start + i, now, now],
        );
        const row = this.db.get("SELECT * FROM records WHERE id = ?", [res.lastInsertRowid]);
        if (!row) throw new Error("记录写入后读回失败");
        created.push(mapRowToTableRecord(row));
      }
      this.db.exec("COMMIT");
    } catch (err: unknown) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return created;
  }

  // ---- r8：文档 / 块（块内容归一 / 类型转换 / 拆合 / 顺序 / 全文装配全在 shared） ----

  /** 单事务包装：拆 / 合 / 移动 / 重排多语句原子落库，异常整体 ROLLBACK（零半态） */
  private withTransaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (err: unknown) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /** 文档 updated_at 随块变化刷新（列表按最近编辑排序） */
  private touchDocument(documentId: number): void {
    this.db.run("UPDATE documents SET updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      documentId,
    ]);
  }

  /** 内部：插入一块并把后续块整体后移一位（不含守卫，调用方已校验；不自带事务） */
  private insertBlockRow(
    documentId: number,
    type: BlockType,
    content: ReturnType<typeof normalizeBlockContent>,
    position: number,
    parentId: number | null,
  ): DocumentBlock {
    this.db.run(
      "UPDATE blocks SET position = position + 1 WHERE document_id = ? AND position >= ?",
      [documentId, position],
    );
    const now = new Date().toISOString();
    const res = this.db.run(
      "INSERT INTO blocks (document_id, type, position, content, parent_id, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
      [documentId, type, position, JSON.stringify(content), parentId, now, now],
    );
    const row = this.db.get("SELECT * FROM blocks WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("块写入后读回失败");
    this.touchDocument(documentId);
    return mapRowToDocumentBlock(row);
  }

  /** 内部：删块 / 合块后把剩余块 position 重排为 0..n-1 连续（不留空洞） */
  private renumberBlocks(documentId: number): void {
    const blocks = this.listBlocks(documentId);
    for (let i = 0; i < blocks.length; i += 1) {
      if (blocks[i]!.position !== i) {
        this.db.run("UPDATE blocks SET position = ? WHERE id = ?", [i, blocks[i]!.id]);
      }
    }
    this.touchDocument(documentId);
  }

  /**
   * 建文档：r4 教训「用户第一次用」——自动带一个空 paragraph 首块，
   * 消灭「建完文档零块、编辑器无从下手」的死路。文档与首块一个事务落库。
   */
  createDocument(title: string): Document {
    assertValidDocumentTitle(title);
    return this.withTransaction(() => {
      const now = new Date().toISOString();
      const res = this.db.run(
        "INSERT INTO documents (title, created_at, updated_at) VALUES (?, ?, ?)",
        [title, now, now],
      );
      const row = this.db.get("SELECT * FROM documents WHERE id = ?", [res.lastInsertRowid]);
      if (!row) throw new Error("文档写入后读回失败");
      const doc = mapRowToDocument(row);
      this.insertBlockRow(
        doc.id,
        DEFAULT_DOCUMENT_FIRST_BLOCK.type,
        DEFAULT_DOCUMENT_FIRST_BLOCK.content,
        0,
        null,
      );
      return doc;
    });
  }

  getDocument(id: number): Document | null {
    const row = this.db.get("SELECT * FROM documents WHERE id = ?", [id]);
    return row ? mapRowToDocument(row) : null;
  }

  listDocuments(): Document[] {
    return this.db
      .all("SELECT * FROM documents ORDER BY updated_at DESC, id DESC")
      .map(mapRowToDocument);
  }

  updateDocument(id: number, title: string): Document {
    if (this.getDocument(id) === null) throw new Error(`文档不存在：${id}`);
    assertValidDocumentTitle(title);
    this.db.run("UPDATE documents SET title = ?, updated_at = ? WHERE id = ?", [
      title,
      new Date().toISOString(),
      id,
    ]);
    return this.getDocument(id)!;
  }

  /** 删文档：块经 schema 级联（ON DELETE CASCADE）随行删除 */
  deleteDocument(id: number): boolean {
    const res = this.db.run("DELETE FROM documents WHERE id = ?", [id]);
    return res.changes > 0;
  }

  /**
   * 建块：守卫集中在 shared（类型 / 内容归一 / 位置 0..count）；
   * parentId 非空时必须指向**同文档**已存在的块（越权 document_id / 孤儿父块一律拒绝）；
   * 指定 position 时后续块整体后移，保证 position 连号。
   */
  createBlock(
    documentId: number,
    type: unknown,
    content: unknown,
    position?: unknown,
    parentId?: unknown,
  ): DocumentBlock {
    if (this.getDocument(documentId) === null) throw new Error(`文档不存在：${documentId}`);
    assertValidBlockType(type);
    const normalized = normalizeBlockContent(type, content);
    const count = this.listBlocks(documentId).length;
    const pos = position === undefined || position === null ? count : position;
    assertValidBlockPosition(pos, count);
    let parent: number | null = null;
    if (parentId !== undefined && parentId !== null) {
      const pid = Number(parentId);
      if (!Number.isInteger(pid) || pid <= 0) {
        throw new ValidationError(`非法父块 id：${String(parentId)}`);
      }
      const parentBlock = this.getBlock(pid);
      if (parentBlock === null || parentBlock.documentId !== documentId) {
        throw new ValidationError(`父块不属于本文档（越权 document_id）：${pid}`);
      }
      parent = pid;
    }
    return this.withTransaction(() =>
      this.insertBlockRow(documentId, type, normalized, Number(pos), parent),
    );
  }

  getBlock(id: number): DocumentBlock | null {
    const row = this.db.get("SELECT * FROM blocks WHERE id = ?", [id]);
    return row ? mapRowToDocumentBlock(row) : null;
  }

  listBlocks(documentId: number): DocumentBlock[] {
    return this.db
      .all("SELECT * FROM blocks WHERE document_id = ? ORDER BY position, id", [documentId])
      .map(mapRowToDocumentBlock);
  }

  /** 编辑块内容：按块当前类型重新归一（api 层零类型分支） */
  updateBlock(id: number, content: unknown): DocumentBlock {
    const current = this.getBlock(id);
    if (!current) throw new Error(`块不存在：${id}`);
    const normalized = normalizeBlockContent(current.type, content);
    this.db.run("UPDATE blocks SET content = ?, updated_at = ? WHERE id = ?", [
      JSON.stringify(normalized),
      new Date().toISOString(),
      id,
    ]);
    this.touchDocument(current.documentId);
    return this.getBlock(id)!;
  }

  /** 类型转换：shared convertBlockContent 判定可转性 + 按目标类型归一内容 */
  convertBlock(id: number, to: unknown): DocumentBlock {
    const current = this.getBlock(id);
    if (!current) throw new Error(`块不存在：${id}`);
    const normalized = convertBlockContent(current.type, to, current.content);
    this.db.run("UPDATE blocks SET type = ?, content = ?, updated_at = ? WHERE id = ?", [
      to as string,
      JSON.stringify(normalized),
      new Date().toISOString(),
      id,
    ]);
    this.touchDocument(current.documentId);
    return this.getBlock(id)!;
  }

  /**
   * 回车拆块：shared planBlockSplit 给出前半段 / 后半段 / 新块类型，
   * 原块收前半段、新块插其后、后续块整体后移——一个事务，绝不半态。
   */
  splitBlock(id: number, caret: unknown): {
    before: DocumentBlock;
    after: DocumentBlock;
    blocks: DocumentBlock[];
  } {
    const current = this.getBlock(id);
    if (!current) throw new Error(`块不存在：${id}`);
    const c = typeof caret === "number" ? caret : Number(caret);
    const plan = planBlockSplit(current.type, current.content, c);
    return this.withTransaction(() => {
      this.db.run("UPDATE blocks SET content = ?, updated_at = ? WHERE id = ?", [
        JSON.stringify(plan.before),
        new Date().toISOString(),
        id,
      ]);
      const after = this.insertBlockRow(
        current.documentId,
        plan.afterType,
        plan.after,
        current.position + 1,
        current.parentId,
      );
      return {
        before: this.getBlock(id)!,
        after,
        blocks: this.listBlocks(current.documentId),
      };
    });
  }

  /**
   * 退格合块：与前一块合并（结果沿用前一块类型，shared mergeBlockContent 拒绝 divider 作前驱），
   * 删掉当前块并把 position 收拢连续——一个事务。首块无前驱直接抛 ValidationError。
   */
  mergeBlock(id: number): DocumentBlock[] {
    const current = this.getBlock(id);
    if (!current) throw new Error(`块不存在：${id}`);
    return this.withTransaction(() => {
      const blocks = this.listBlocks(current.documentId);
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx <= 0) throw new ValidationError("首块没有可合并的前驱块");
      const prev = blocks[idx - 1]!;
      const merged = mergeBlockContent(prev.type, prev.content, current.type, current.content);
      this.db.run("UPDATE blocks SET content = ?, updated_at = ? WHERE id = ?", [
        JSON.stringify(merged),
        new Date().toISOString(),
        prev.id,
      ]);
      this.db.run("DELETE FROM blocks WHERE id = ?", [id]);
      this.renumberBlocks(current.documentId);
      return this.listBlocks(current.documentId);
    });
  }

  /** 上移 / 下移：复用 r4 shared reorderPositions 的重排口径，整表 position 一次落库 */
  moveBlock(id: number, to: unknown): DocumentBlock[] {
    const current = this.getBlock(id);
    if (!current) throw new Error(`块不存在：${id}`);
    const target = typeof to === "number" ? to : Number(to);
    const blocks = this.listBlocks(current.documentId);
    const plan = reorderPositions(
      blocks.map((b) => ({ id: b.id, position: b.position })),
      id,
      target,
    );
    return this.withTransaction(() => {
      const now = new Date().toISOString();
      for (const p of plan) {
        this.db.run("UPDATE blocks SET position = ?, updated_at = ? WHERE id = ?", [
          p.position,
          now,
          p.id,
        ]);
      }
      this.touchDocument(current.documentId);
      return this.listBlocks(current.documentId);
    });
  }

  /** 批移动重排：shared planBlockReorder 校验 order 是本文档块 id 的完整排列 */
  reorderBlocks(documentId: number, order: unknown): DocumentBlock[] {
    if (this.getDocument(documentId) === null) throw new Error(`文档不存在：${documentId}`);
    const blocks = this.listBlocks(documentId);
    const plan = planBlockReorder(blocks, order);
    return this.withTransaction(() => {
      const now = new Date().toISOString();
      for (const p of plan) {
        this.db.run("UPDATE blocks SET position = ?, updated_at = ? WHERE id = ?", [
          p.position,
          now,
          p.id,
        ]);
      }
      this.touchDocument(documentId);
      return this.listBlocks(documentId);
    });
  }

  /** 删块：删后 position 收拢连续（不留空洞，重开不丢顺序） */
  deleteBlock(id: number): boolean {
    const current = this.getBlock(id);
    if (!current) return false;
    return this.withTransaction(() => {
      const res = this.db.run("DELETE FROM blocks WHERE id = ?", [id]);
      this.renumberBlocks(current.documentId);
      return res.changes > 0;
    });
  }

  /**
   * Markdown 导入落库（r9 零半态的服务层保证，复用 r7 importRecords 手法）：
   * ① 全部块先在事务外整体归一 + 校验——**任一块非法则一块都不写**（校验失败直接抛错）；
   * ② 数量上限守卫（MARKDOWN_IMPORT_MAX_BLOCKS）也在事务外，避免半途写入；
   * ③ 「整篇替换」先 DELETE 该文档全部块、再按 position 0..n-1 插入，包在一个
   *    SQLite 事务里：中途任何异常 → ROLLBACK，绝不留下「删了旧块没插新块」的半态；
   * ④ 返回插入后的块（读回真实 id 与归一后的内容）。
   * 调用方（api）先用 shared planMarkdownImport / shouldCommitMarkdownImport 判定，
   * 这里是第二道防线——即便绕过计划直接调用，零半态依旧成立。
   */
  importBlocks(documentId: number, rows: readonly MarkdownBlockDraft[]): DocumentBlock[] {
    if (this.getDocument(documentId) === null) {
      throw new Error(`文档不存在：${documentId}`);
    }
    if (rows.length === 0) {
      throw new ValidationError("导入块数组不能为空");
    }
    if (rows.length > MARKDOWN_IMPORT_MAX_BLOCKS) {
      throw new ValidationError(`导入块数超过上限 ${MARKDOWN_IMPORT_MAX_BLOCKS}`);
    }
    // 事务外整体校验：任何一块非法都在这里抛错，绝不进入删除/插入
    const normalized = rows.map((row) => {
      assertValidBlockType(row.type);
      return { type: row.type, content: normalizeBlockContent(row.type, row.content) };
    });
    return this.withTransaction(() => {
      this.db.run("DELETE FROM blocks WHERE document_id = ?", [documentId]);
      const now = new Date().toISOString();
      for (let i = 0; i < normalized.length; i += 1) {
        const item = normalized[i]!;
        this.db.run(
          "INSERT INTO blocks (document_id, type, position, content, parent_id, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, NULL, ?, ?)",
          [documentId, item.type, i, JSON.stringify(item.content), now, now],
        );
      }
      this.touchDocument(documentId);
      return this.listBlocks(documentId);
    });
  }

  /** 文档全文读：按 position 拼装（shared assembleDocumentText 唯一口径） */
  assembleDocument(documentId: number): {
    documentId: number;
    title: string;
    blockCount: number;
    text: string;
    blocks: DocumentBlock[];
  } | null {
    const doc = this.getDocument(documentId);
    if (doc === null) return null;
    const blocks = this.listBlocks(documentId);
    return {
      documentId: doc.id,
      title: doc.title,
      blockCount: blocks.length,
      text: assembleDocumentText(blocks),
      blocks,
    };
  }

  // ---- r10：AI 工作台对话数据层（conversations / messages / artifacts） ----

  /** 建会话：标题守卫集中 shared；created_at 服务端生成，不做客户端信任。 */
  createConversation(title: unknown): Conversation {
    assertValidConversationTitle(title);
    const now = new Date().toISOString();
    const res = this.db.run("INSERT INTO conversations (title, created_at) VALUES (?, ?)", [title, now]);
    const row = this.db.get("SELECT * FROM conversations WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("会话写入后读回失败");
    return mapRowToConversation(row);
  }

  getConversation(id: number): Conversation | null {
    const row = this.db.get("SELECT * FROM conversations WHERE id = ?", [id]);
    return row ? mapRowToConversation(row) : null;
  }

  listConversations(): Conversation[] {
    return this.db
      .all("SELECT * FROM conversations ORDER BY id DESC")
      .map(mapRowToConversation);
  }

  /** 删会话：消息与产物由 schema ON DELETE CASCADE 级联清理（无孤儿数据）。 */
  deleteConversation(id: number): boolean {
    const res = this.db.run("DELETE FROM conversations WHERE id = ?", [id]);
    return res.changes > 0;
  }

  /**
   * 追加消息：tool_calls_json 存整条工具调用回执数组，
   * 逐条落库、逐条可按 role='tool' 查回（waizhuan 查库验证的落点）。
   */
  addMessage(
    conversationId: number,
    role: unknown,
    content: MessageContent,
    toolCalls: readonly ToolCallRecord[] = [],
  ): Message {
    if (this.getConversation(conversationId) === null) {
      throw new Error(`会话不存在：${conversationId}`);
    }
    assertValidMessageRole(role);
    assertValidChatMessage(content.text);
    const now = new Date().toISOString();
    const res = this.db.run(
      "INSERT INTO messages (conversation_id, role, content_json, tool_calls_json, created_at) VALUES (?, ?, ?, ?, ?)",
      [conversationId, role, JSON.stringify(content), JSON.stringify(toolCalls), now],
    );
    const row = this.db.get("SELECT * FROM messages WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("消息写入后读回失败");
    return mapRowToMessage(row);
  }

  listMessages(conversationId: number): Message[] {
    return this.db
      .all("SELECT * FROM messages WHERE conversation_id = ? ORDER BY id", [conversationId])
      .map(mapRowToMessage);
  }

  /** 产物落库：type 由 shared 守卫，content 按原文存（JSON 字符串不被二次转义）。 */
  createArtifact(conversationId: number, type: unknown, title: unknown, content: unknown): Artifact {
    if (this.getConversation(conversationId) === null) {
      throw new Error(`会话不存在：${conversationId}`);
    }
    assertValidArtifactType(type);
    assertValidConversationTitle(title);
    if (typeof content !== "string") throw new ValidationError("产物正文必须是字符串");
    const now = new Date().toISOString();
    const res = this.db.run(
      "INSERT INTO artifacts (conversation_id, type, title, content, created_at) VALUES (?, ?, ?, ?, ?)",
      [conversationId, type, title, content, now],
    );
    const row = this.db.get("SELECT * FROM artifacts WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("产物写入后读回失败");
    return mapRowToArtifact(row);
  }

  getArtifact(id: number): Artifact | null {
    const row = this.db.get("SELECT * FROM artifacts WHERE id = ?", [id]);
    return row ? mapRowToArtifact(row) : null;
  }

  listArtifacts(conversationId: number): Artifact[] {
    return this.db
      .all("SELECT * FROM artifacts WHERE conversation_id = ? ORDER BY id", [conversationId])
      .map(mapRowToArtifact);
  }

  /**
   * 一次对话整批落库：user → tool（逐条回执）→ assistant → artifact，一个 SQLite 事务。
   * 中途任一异常 ROLLBACK，绝不留下「工具有回执但消息没落库」的半态。
   */
  recordChatExchange(input: {
    readonly conversationId: number;
    readonly userText: string;
    readonly toolCalls: readonly ToolCallRecord[];
    readonly summary: string;
    readonly artifact: { readonly type: ArtifactType; readonly title: string; readonly content: string };
  }): { messages: Message[]; artifact: Artifact } {
    if (this.getConversation(input.conversationId) === null) {
      throw new Error(`会话不存在：${input.conversationId}`);
    }
    return this.withTransaction(() => {
      const user = this.addMessage(input.conversationId, "user", { text: input.userText }, []);
      const tool = this.addMessage(input.conversationId, "tool", { text: "工具调用回执" }, input.toolCalls);
      const assistant = this.addMessage(input.conversationId, "assistant", { text: input.summary }, []);
      const artifact = this.createArtifact(
        input.conversationId,
        input.artifact.type,
        input.artifact.title,
        input.artifact.content,
      );
      return {
        messages: [user, tool, assistant],
        artifact,
      };
    });
  }

  // ---- r12：知识库数据层（knowledge_docs / knowledge_chunks，入库单事务零半态） ----

  /**
   * 知识文档 + 全部分块单事务落库。校验走 shared 守卫，chunk_count 由实际分块数得出，
   * 中途任一异常 ROLLBACK（绝不留下「有文档但没块」的半态）。
   */
  createKnowledgeDoc(input: {
    readonly title: unknown;
    readonly sourceType: unknown;
    readonly sourceId: number | null;
    readonly content: unknown;
    readonly chunks: readonly KnowledgeChunkDraft[];
  }): { doc: KnowledgeDoc; chunks: KnowledgeChunk[] } {
    const title = input.title;
    const sourceType = input.sourceType;
    const content = input.content;
    assertValidKnowledgeTitle(title);
    assertValidKnowledgeSourceType(sourceType);
    assertValidKnowledgeContent(content);
    let sourceId: number | null = null;
    if (sourceType === "document") {
      const sid = input.sourceId;
      if (typeof sid !== "number" || !Number.isInteger(sid) || sid <= 0) {
        throw new ValidationError("document 来源必须提供正整数 source_id");
      }
      sourceId = sid;
      if (this.getDocument(sourceId) === null) {
        throw new Error(`来源文档不存在：${sourceId}`);
      }
    }
    if (!Array.isArray(input.chunks)) throw new ValidationError("chunks 必须是数组");
    for (const c of input.chunks) {
      if (!Number.isInteger(c.position) || c.position < 0) throw new ValidationError("分块 position 非法");
      if (typeof c.content !== "string") throw new ValidationError("分块 content 必须是字符串");
      if (!Number.isInteger(c.tokenCount) || c.tokenCount < 0) throw new ValidationError("分块 token_count 非法");
    }
    return this.withTransaction(() => {
      const now = new Date().toISOString();
      const res = this.db.run(
        "INSERT INTO knowledge_docs (title, source_type, source_id, content, chunk_count, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [title, sourceType, sourceId, content, input.chunks.length, now],
      );
      const docRow = this.db.get("SELECT * FROM knowledge_docs WHERE id = ?", [res.lastInsertRowid]);
      if (!docRow) throw new Error("知识文档写入后读回失败");
      const inserted: KnowledgeChunk[] = [];
      for (const c of input.chunks) {
        const cr = this.db.run(
          "INSERT INTO knowledge_chunks (doc_id, position, content, token_count, vector) VALUES (?, ?, ?, ?, NULL)",
          [res.lastInsertRowid, c.position, c.content, c.tokenCount],
        );
        const chunkRow = this.db.get("SELECT * FROM knowledge_chunks WHERE id = ?", [cr.lastInsertRowid]);
        if (!chunkRow) throw new Error("知识分块写入后读回失败");
        inserted.push(mapRowToKnowledgeChunk(chunkRow));
      }
      return { doc: mapRowToKnowledgeDoc(docRow), chunks: inserted };
    });
  }

  getKnowledgeDoc(id: number): KnowledgeDoc | null {
    const row = this.db.get("SELECT * FROM knowledge_docs WHERE id = ?", [id]);
    return row ? mapRowToKnowledgeDoc(row) : null;
  }

  listKnowledgeDocs(): KnowledgeDoc[] {
    return this.db.all("SELECT * FROM knowledge_docs ORDER BY id DESC").map(mapRowToKnowledgeDoc);
  }

  /** 删知识文档：分块由 schema ON DELETE CASCADE 级联清理（无孤儿块）。 */
  deleteKnowledgeDoc(id: number): boolean {
    const res = this.db.run("DELETE FROM knowledge_docs WHERE id = ?", [id]);
    return res.changes > 0;
  }

  listKnowledgeChunks(docId: number): KnowledgeChunk[] {
    return this.db
      .all("SELECT * FROM knowledge_chunks WHERE doc_id = ? ORDER BY position, id", [docId])
      .map(mapRowToKnowledgeChunk);
  }

  getKnowledgeChunk(id: number): KnowledgeChunk | null {
    const row = this.db.get("SELECT * FROM knowledge_chunks WHERE id = ?", [id]);
    return row ? mapRowToKnowledgeChunk(row) : null;
  }

  /** 检索源块：JOIN 文档来源字段，交给 agent 的纯函数 searchChunks（api 层零算法分支）。 */
  listKnowledgeChunksForSearch(): KnowledgeSearchChunk[] {
    return this.db
      .all(
        "SELECT c.id, c.doc_id, c.position, c.content, d.title AS doc_title, d.source_type, d.source_id " +
          "FROM knowledge_chunks c JOIN knowledge_docs d ON d.id = c.doc_id ORDER BY c.id",
      )
      .map(mapRowToKnowledgeSearchChunk);
  }
}
