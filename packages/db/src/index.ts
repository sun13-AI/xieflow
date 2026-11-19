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
  mapRowToMindmap,
  mapRowToWhiteboard,
  mapRowToWhiteboardSummary,
  mapRowToWhiteboardItem,
  mapRowToApproval,
  mapRowToApprovalStep,
  mapRowToApprovalCc,
  mapRowToAsset,
  mapRowToAssetTransaction,
  mapRowToUnitTask,
  mapRowToAuthUser,
  mapRowToSession,
  mapRowToChangeRecord,
  mapRowToEntityVersion,
  mapRowToDepartment,
  mapRowToMember,
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
  RagCitation,
  Mindmap,
  Whiteboard,
  WhiteboardSummary,
  WhiteboardItem,
  WhiteboardItemProps,
  Approval,
  ApprovalStep,
  ApprovalCc,
  ApprovalView,
  Asset,
  AssetTxInput,
  AssetTransaction,
  UnitTask,
  UnitTaskStatus,
  UnitTaskTreeNode,
} from "@xieflow/shared";
import {
  hashPassword,
  assertValidUsername,
  assertValidPassword,
  assertValidSessionToken,
  assertValidExpiresAt,
  isAuthRole,
  ConflictError,
  type AuthUser,
  type AuthRole,
  type Session,
} from "@xieflow/shared/auth";
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
  assertValidMindmapTitle,
  assertValidMindmapContent,
  assertValidMindmapContentOrEmpty,
  assertValidWhiteboardTitle,
  normalizeWhiteboardItem,
  collisionResolve,
  planAiWhiteboard,
  assertValidApprovalTitle,
  assertValidApprovalType,
  assertValidApprovalUser,
  assertValidApprovalComment,
  assertValidApprovalAction,
  planApprovalAction,
  isApprovalView,
  selectApprovalsForView,
  assertValidAssetName,
  assertValidAssetCategory,
  assertValidAssetText,
  assertValidQuantity,
  assertValidAssetOperator,
  assertValidAssetTxType,
  assertValidUnitTaskTitle,
  assertValidUnit,
  assertValidUnitTaskTransition,
  isUnitTaskStatus,
  applyAssetTransaction,
  buildTaskTree,
  ValidationError,
  assertValidEntityType,
  assertValidEntityId,
  assertValidChangeOperation,
  assertValidVersion,
  normalizeSince,
  normalizeLimit,
  nextVersion,
  detectConflict,
  valuesEqual,
  SyncConflictError,
  type ChangeRecord,
  type EntityVersion,
  type ChangeOperation,
} from "@xieflow/shared";
import {
  normalizeDepartment,
  findDuplicateDepartmentName,
  validateDepartmentMove,
  normalizeMember,
  searchMembers as searchMembersRule,
  buildOrgTree,
  resolveAssignee,
  assertAssignableMember,
  normalizeMemberRef,
  countMemberUsage,
  type Department,
  type Member,
  type OrgTreeNode,
  type MemberUsage,
  type DepartmentInput,
  type MemberInput,
} from "@xieflow/shared/org";
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
      for (const c of m.ensureColumns ?? []) {
        const cols = db.all(`PRAGMA table_info(${c.table})`) as { name: string }[];
        if (!cols.some((col) => col.name === c.column)) db.exec(c.sql);
      }
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
    /** r13：RAG 引用清单并存进 assistant.content（无需 schema 变更，reload 可复现） */
    readonly citations?: readonly RagCitation[];
  }): { messages: Message[]; artifact: Artifact } {
    if (this.getConversation(input.conversationId) === null) {
      throw new Error(`会话不存在：${input.conversationId}`);
    }
    return this.withTransaction(() => {
      const user = this.addMessage(input.conversationId, "user", { text: input.userText }, []);
      const tool = this.addMessage(input.conversationId, "tool", { text: "工具调用回执" }, input.toolCalls);
      const assistant = this.addMessage(
        input.conversationId,
        "assistant",
        { text: input.summary, ...(input.citations ? { citations: input.citations } : {}) },
        [],
      );
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

  // ---- r14：思维导图数据层（mindmaps 表；Markdown 源逐字存，树只在 shared 解析） ----

  createMindmap(input: { readonly title: unknown; readonly contentMarkdown?: unknown }): Mindmap {
    const title = input.title;
    const contentMarkdown = input.contentMarkdown ?? "";
    assertValidMindmapTitle(title);
    assertValidMindmapContentOrEmpty(contentMarkdown);
    const now = new Date().toISOString();
    const res = this.db.run(
      "INSERT INTO mindmaps (title, content_markdown, created_at, updated_at) VALUES (?, ?, ?, ?)",
      [title, contentMarkdown, now, now],
    );
    const row = this.db.get("SELECT * FROM mindmaps WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("导图写入后读回失败");
    return mapRowToMindmap(row);
  }

  getMindmap(id: number): Mindmap | null {
    const row = this.db.get("SELECT * FROM mindmaps WHERE id = ?", [id]);
    return row ? mapRowToMindmap(row) : null;
  }

  listMindmaps(): Mindmap[] {
    return this.db.all("SELECT * FROM mindmaps ORDER BY id DESC").map(mapRowToMindmap);
  }

  updateMindmapTitle(id: number, title: unknown): Mindmap | null {
    assertValidMindmapTitle(title);
    if (this.getMindmap(id) === null) return null;
    const now = new Date().toISOString();
    this.db.run("UPDATE mindmaps SET title = ?, updated_at = ? WHERE id = ?", [title, now, id]);
    return this.getMindmap(id);
  }

  /** 保存 Markdown 源：非空守卫在 shared，非法内容整条拒绝、不留半态（旧内容逐字保留） */
  updateMindmapContent(id: number, contentMarkdown: unknown): Mindmap | null {
    assertValidMindmapContent(contentMarkdown);
    if (this.getMindmap(id) === null) return null;
    const now = new Date().toISOString();
    this.db.run("UPDATE mindmaps SET content_markdown = ?, updated_at = ? WHERE id = ?", [contentMarkdown, now, id]);
    return this.getMindmap(id);
  }

  deleteMindmap(id: number): boolean {
    return this.db.run("DELETE FROM mindmaps WHERE id = ?", [id]).changes > 0;
  }

  // ---- r15：白板画布数据层（whiteboards / whiteboard_items；布局/避让规则全在 shared） ----

  createWhiteboard(input: { readonly title: unknown }): Whiteboard {
    assertValidWhiteboardTitle(input.title);
    const now = new Date().toISOString();
    const res = this.db.run("INSERT INTO whiteboards (title, created_at) VALUES (?, ?)", [input.title, now]);
    const row = this.db.get("SELECT * FROM whiteboards WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("白板写入后读回失败");
    return mapRowToWhiteboard(row);
  }

  getWhiteboard(id: number): Whiteboard | null {
    const row = this.db.get("SELECT * FROM whiteboards WHERE id = ?", [id]);
    return row ? mapRowToWhiteboard(row) : null;
  }

  listWhiteboards(): WhiteboardSummary[] {
    return this.db
      .all(
        "SELECT w.*, (SELECT COUNT(*) FROM whiteboard_items i WHERE i.board_id = w.id) AS item_count FROM whiteboards w ORDER BY w.id DESC",
      )
      .map(mapRowToWhiteboardSummary);
  }

  updateWhiteboardTitle(id: number, title: unknown): Whiteboard | null {
    assertValidWhiteboardTitle(title);
    if (this.getWhiteboard(id) === null) return null;
    this.db.run("UPDATE whiteboards SET title = ? WHERE id = ?", [title, id]);
    return this.getWhiteboard(id);
  }

  deleteWhiteboard(id: number): boolean {
    return this.db.run("DELETE FROM whiteboards WHERE id = ?", [id]).changes > 0;
  }

  /** 越权 board_id → null（api 映射 404）；非法 type/坐标 → shared ValidationError（api 映射 400） */
  createWhiteboardItem(
    boardId: number,
    input: WhiteboardItemProps & { readonly type?: unknown },
  ): WhiteboardItem | null {
    if (this.getWhiteboard(boardId) === null) return null;
    const item = normalizeWhiteboardItem(input.type, input);
    const now = new Date().toISOString();
    const res = this.db.run(
      "INSERT INTO whiteboard_items (board_id, type, x, y, w, h, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [boardId, item.type, item.x, item.y, item.w, item.h, item.content, item.color, now, now],
    );
    const row = this.db.get("SELECT * FROM whiteboard_items WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("白板条目写入后读回失败");
    return mapRowToWhiteboardItem(row);
  }

  getWhiteboardItem(id: number): WhiteboardItem | null {
    const row = this.db.get("SELECT * FROM whiteboard_items WHERE id = ?", [id]);
    return row ? mapRowToWhiteboardItem(row) : null;
  }

  /** 视觉顺序（y→x→id）稳定返回，导出 Markdown 与 UI 渲染口径一致 */
  listWhiteboardItems(boardId: number): WhiteboardItem[] {
    return this.db
      .all("SELECT * FROM whiteboard_items WHERE board_id = ? ORDER BY y ASC, x ASC, id ASC", [boardId])
      .map(mapRowToWhiteboardItem);
  }

  updateWhiteboardItem(id: number, input: WhiteboardItemProps & { readonly type?: unknown }): WhiteboardItem | null {
    const current = this.getWhiteboardItem(id);
    if (!current) return null;
    const item = normalizeWhiteboardItem(input.type ?? current.type, {
      x: input.x ?? current.x,
      y: input.y ?? current.y,
      w: input.w ?? current.w,
      h: input.h ?? current.h,
      content: input.content ?? current.content,
      color: input.color ?? current.color,
    });
    const now = new Date().toISOString();
    this.db.run(
      "UPDATE whiteboard_items SET type = ?, x = ?, y = ?, w = ?, h = ?, content = ?, color = ?, updated_at = ? WHERE id = ?",
      [item.type, item.x, item.y, item.w, item.h, item.content, item.color, now, id],
    );
    return this.getWhiteboardItem(id);
  }

  deleteWhiteboardItem(id: number): boolean {
    return this.db.run("DELETE FROM whiteboard_items WHERE id = ?", [id]).changes > 0;
  }

  /**
   * 批量移动（x/y 变更审计）：先全量校验（越权/重复/非法坐标）→ shared 重叠避让 → 单事务落库。
   * 任一异常 ROLLBACK 且调用前坐标不变（零半态）；返回本次要求移动的条目（新坐标）。
   */
  moveWhiteboardItems(
    boardId: number,
    moves: readonly { readonly id: unknown; readonly x: unknown; readonly y: unknown }[],
  ): WhiteboardItem[] | null {
    if (!Array.isArray(moves) || moves.length === 0) {
      throw new ValidationError("批量移动列表不能为空");
    }
    const ids: number[] = [];
    for (const move of moves) {
      const id = Number(move?.id);
      if (!Number.isInteger(id) || id <= 0) throw new ValidationError(`非法批量移动条目 id：${String(move?.id)}`);
      if (ids.includes(id)) throw new ValidationError(`批量移动条目 id 重复：${id}`);
      if (move.x === undefined || move.y === undefined) throw new ValidationError("批量移动必须提供 x 与 y");
      ids.push(id);
    }
    const all = this.listWhiteboardItems(boardId);
    if (ids.some((id) => !all.some((it) => it.id === id))) return null;
    const moveById = new Map(moves.map((move) => [Number(move.id), move]));
    const merged = all.map((item) => {
      const move = moveById.get(item.id);
      if (!move) return item;
      const normalized = normalizeWhiteboardItem(item.type, {
        x: move.x, y: move.y, w: item.w, h: item.h, content: item.content, color: item.color,
      });
      return { ...item, ...normalized };
    });
    const resolved = collisionResolve(merged).items;
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const item of resolved) {
        if (!moveById.has(item.id)) continue;
        this.db.run("UPDATE whiteboard_items SET x = ?, y = ?, updated_at = ? WHERE id = ?", [item.x, item.y, now, item.id]);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return resolved.filter((item) => moveById.has(item.id));
  }

  /** mock AI 建板：按主题生成 5-8 便签，与既有条目一起过 shared 避让后单事务落库 */
  aiCreateWhiteboard(boardId: number, theme: unknown): WhiteboardItem[] | null {
    if (this.getWhiteboard(boardId) === null) return null;
    const plan = planAiWhiteboard(theme as string);
    if (plan.items.length < 5 || plan.items.length > 8) {
      throw new ValidationError("AI 建板草稿数量越界（应 5-8）");
    }
    const existing = this.listWhiteboardItems(boardId);
    const drafts = plan.items.map((draft, i) => ({
      rect: { id: -(i + 1), x: draft.x, y: draft.y, w: draft.w, h: draft.h },
      type: draft.type, content: draft.content, color: draft.color,
    }));
    const resolved = collisionResolve([
      ...existing.map((it) => ({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h })),
      ...drafts.map((d) => d.rect),
    ]).items;
    const now = new Date().toISOString();
    const inserted: WhiteboardItem[] = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      // r15 返工#1（A）：避让可能移动「既有条目」。同一事务内把回写后的坐标落库，
      // 否则既有条目留在旧坐标 → AI 便签与其重叠（waizhuan P1 根因）。零半态：写回与 INSERT 同 COMMIT/ROLLBACK。
      for (let i = 0; i < existing.length; i += 1) {
        const before = existing[i]!;
        const rect = resolved[i]!;
        if (rect.x !== before.x || rect.y !== before.y) {
          this.db.run(
            "UPDATE whiteboard_items SET x = ?, y = ?, updated_at = ? WHERE id = ?",
            [rect.x, rect.y, now, before.id],
          );
        }
      }
      for (let i = 0; i < drafts.length; i += 1) {
        const rect = resolved[existing.length + i]!;
        const draft = drafts[i]!;
        const res = this.db.run(
          "INSERT INTO whiteboard_items (board_id, type, x, y, w, h, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [boardId, draft.type, rect.x, rect.y, rect.w, rect.h, draft.content, draft.color, now, now],
        );
        const row = this.db.get("SELECT * FROM whiteboard_items WHERE id = ?", [res.lastInsertRowid]);
        if (!row) throw new Error("AI 建板条目写入后读回失败");
        inserted.push(mapRowToWhiteboardItem(row));
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return inserted;
  }

  // ---- r16：审批流数据层（状态机全在 shared；本层只装配上下文并按计划单事务落库） ----

  // ---- r24：审批/物资可选成员关联（规则全在 shared/org，本层只装配 + 落库） ----

  /**
   * 成员引用解析：member_id 存在 → 校验存在且 active 后取通讯录姓名；
   * 不存在 → 原样回落自由文本（老路径逐字节不变）。
   */
  private resolveAssignment(
    text: unknown,
    memberId: unknown,
    label: string,
  ): { text: string; memberId: number | null } {
    const members = this.listMembers();
    return {
      text: resolveAssignee(text, memberId, members),
      memberId: normalizeMemberRef(memberId),
    };
  }

  createApproval(input: {
    readonly title: unknown;
    readonly type: unknown;
    readonly applicantId: unknown;
    readonly currentAssignee: unknown;
    readonly cc?: unknown;
    readonly applicantMemberId?: unknown;
    readonly currentAssigneeMemberId?: unknown;
    readonly ccMemberIds?: unknown;
  }): Approval {
    assertValidApprovalTitle(input.title);
    assertValidApprovalType(input.type);
    const applicant = this.resolveAssignment(input.applicantId, input.applicantMemberId, "申请人");
    assertValidApprovalUser(applicant.text, "发起人");
    const assignee = this.resolveAssignment(input.currentAssignee, input.currentAssigneeMemberId, "审批人");
    assertValidApprovalUser(assignee.text, "审批人");
    const ccUsers: string[] = [];
    const ccMemberIds: (number | null)[] = [];
    const ids = input.ccMemberIds === undefined || input.ccMemberIds === null ? [] : input.ccMemberIds;
    if (input.cc !== undefined && input.cc !== null && !Array.isArray(input.cc)) {
      throw new ValidationError("抄送人必须是字符串数组");
    }
    if (!Array.isArray(ids)) throw new ValidationError("抄送人成员 id 必须是数组");
    // cc 缺席但给了 ccMemberIds 时按 id 列表逐项校验（停用/越权 id 不许静默跳过）
    const ccRaw: readonly unknown[] = input.cc ?? ids.map(() => "");
    for (let i = 0; i < ccRaw.length; i++) {
      const raw = ccRaw[i];
      const resolved = this.resolveAssignment(raw, ids[i], "抄送人");
      assertValidApprovalUser(resolved.text, "抄送人");
      if (!ccUsers.includes(resolved.text)) {
        ccUsers.push(resolved.text);
        ccMemberIds.push(resolved.memberId);
      }
    }
    const now = new Date().toISOString();
    let newId = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const res = this.db.run(
        `INSERT INTO approvals (title, type, applicant_id, status, current_assignee, applicant_member_id, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)`,
        [input.title, input.type, applicant.text, assignee.text, applicant.memberId, now, now],
      );
      newId = Number(res.lastInsertRowid);
      for (let i = 0; i < ccUsers.length; i++) {
        this.db.run(
          "INSERT INTO approval_cc (approval_id, cc_user, cc_member_id, created_at) VALUES (?, ?, ?, ?)",
          [newId, ccUsers[i] ?? "", ccMemberIds[i] ?? null, now],
        );
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    const row = this.db.get("SELECT * FROM approvals WHERE id = ?", [newId]);
    if (!row) throw new Error("审批写入后读回失败");
    return mapRowToApproval(row);
  }

  getApproval(id: number): Approval | null {
    const row = this.db.get("SELECT * FROM approvals WHERE id = ?", [id]);
    return row ? mapRowToApproval(row) : null;
  }

  listApprovals(): Approval[] {
    return this.db.all("SELECT * FROM approvals ORDER BY id DESC").map(mapRowToApproval);
  }

  updateApprovalTitle(id: number, title: unknown): Approval | null {
    assertValidApprovalTitle(title);
    if (this.getApproval(id) === null) return null;
    this.db.run("UPDATE approvals SET title = ?, updated_at = ? WHERE id = ?", [title, new Date().toISOString(), id]);
    return this.getApproval(id);
  }

  deleteApproval(id: number): boolean {
    return this.db.run("DELETE FROM approvals WHERE id = ?", [id]).changes > 0;
  }

  addApprovalCc(id: number, user: unknown, memberId?: unknown): ApprovalCc | null {
    const resolved = this.resolveAssignment(user, memberId, "抄送人");
    assertValidApprovalUser(resolved.text, "抄送人");
    if (this.getApproval(id) === null) return null;
    if (this.listApprovalCc(id).includes(resolved.text)) throw new ValidationError(`抄送人重复：${resolved.text}`);
    const res = this.db.run(
      "INSERT INTO approval_cc (approval_id, cc_user, cc_member_id, created_at) VALUES (?, ?, ?, ?)",
      [id, resolved.text, resolved.memberId, new Date().toISOString()],
    );
    const row = this.db.get("SELECT * FROM approval_cc WHERE id = ?", [res.lastInsertRowid]);
    if (!row) throw new Error("抄送人写入后读回失败");
    return mapRowToApprovalCc(row);
  }

  /** r24：抄送详情（cc_member_id 随 cc_user 回带），老入口 listApprovalCc 仍是 string[] 不变 */
  listApprovalCcDetails(id: number): ApprovalCc[] {
    return this.db
      .all("SELECT * FROM approval_cc WHERE approval_id = ? ORDER BY id ASC", [id])
      .map(mapRowToApprovalCc);
  }

  listApprovalCc(id: number): string[] {
    return this.listApprovalCcDetails(id).map((cc) => cc.ccUser);
  }

  listApprovalSteps(id: number): ApprovalStep[] {
    return this.db
      .all('SELECT * FROM approval_steps WHERE approval_id = ? ORDER BY "order" ASC, id ASC', [id])
      .map(mapRowToApprovalStep);
  }

  /** 审批动作唯一落库入口：shared 决策 → 单事务更新状态/assignee + 追加步骤（4xx 零半态） */
  actOnApproval(
    id: number,
    action: unknown,
    actor: unknown,
    options: {
      readonly comment?: unknown;
      readonly targetAssignee?: unknown;
      readonly actorMemberId?: unknown;
      readonly targetAssigneeMemberId?: unknown;
    } = {},
  ): Approval | null {
    const current = this.getApproval(id);
    if (!current) return null;
    const resolvedActor = this.resolveAssignment(actor, options.actorMemberId, "操作人");
    assertValidApprovalUser(resolvedActor.text, "操作人");
    assertValidApprovalComment(options.comment);
    const target = this.resolveAssignment(options.targetAssignee, options.targetAssigneeMemberId, "转交目标");
    const ctx = {
      status: current.status,
      applicantId: current.applicantId,
      currentAssignee: current.currentAssignee,
      actor: resolvedActor.text,
      targetAssignee: target.text,
    };
    assertValidApprovalAction(action, ctx);
    const plan = planApprovalAction(action, ctx);
    const orderRow = this.db.get('SELECT COALESCE(MAX("order"), -1) + 1 AS next_order FROM approval_steps WHERE approval_id = ?', [id]) as {
      next_order: number;
    };
    const nextOrder = Number(orderRow.next_order);
    const stepMemberId = action === "delegate" ? target.memberId : resolvedActor.memberId;
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.run("UPDATE approvals SET status = ?, current_assignee = ?, updated_at = ? WHERE id = ?", [
        plan.nextStatus, plan.nextAssignee, now, id,
      ]);
      this.db.run(
        `INSERT INTO approval_steps (approval_id, "order", assignee, assignee_member_id, action, comment, acted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, nextOrder, plan.stepAssignee, stepMemberId, plan.action, options.comment ?? "", now],
      );
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return this.getApproval(id);
  }

  /** 三视角查询：cc 名单由本层装配，过滤口径复用 shared selectApprovalsForView */
  listApprovalsByView(view: ApprovalView, actor: string): Approval[] {
    if (!isApprovalView(view)) throw new ValidationError(`非法审批视角：${String(view)}`);
    const ccByApproval: Record<number, string[]> = {};
    for (const row of this.db.all("SELECT approval_id, cc_user FROM approval_cc ORDER BY id ASC")) {
      const r = row as { approval_id: number; cc_user: string };
      (ccByApproval[r.approval_id] ??= []).push(String(r.cc_user));
    }
    return selectApprovalsForView({ approvals: this.listApprovals(), ccByApproval, view, actor });
  }

  // ---- r17：物资台账与单位任务数据层（库存增减/任务流转规则全在 shared，本层只装配 + 单事务落库） ----

  createAsset(input: {
    readonly name: unknown;
    readonly category: unknown;
    readonly quantity: unknown;
    readonly unit: unknown;
    readonly location: unknown;
    readonly custodian: unknown;
    readonly custodianMemberId?: unknown;
  }): Asset {
    assertValidAssetName(input.name);
    assertValidAssetCategory(input.category);
    if (typeof input.quantity !== "number" || !Number.isInteger(input.quantity) || input.quantity < 0) {
      throw new ValidationError("初始库存必须是非负整数");
    }
    assertValidAssetText(input.unit, "计量单位");
    assertValidAssetText(input.location, "存放位置");
    const custodian = this.resolveAssignment(input.custodian, input.custodianMemberId, "保管员");
    assertValidAssetText(custodian.text, "保管人");
    const res = this.db.run(
      `INSERT INTO assets (name, category, quantity, unit, location, custodian, custodian_member_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.name, input.category, input.quantity, input.unit, input.location, custodian.text, custodian.memberId, new Date().toISOString()],
    );
    const row = this.db.get("SELECT * FROM assets WHERE id = ?", [Number(res.lastInsertRowid)]);
    if (!row) throw new Error("物资写入后读回失败");
    return mapRowToAsset(row);
  }

  getAsset(id: number): Asset | null {
    const row = this.db.get("SELECT * FROM assets WHERE id = ?", [id]);
    return row ? mapRowToAsset(row) : null;
  }

  listAssets(): Asset[] {
    return this.db.all("SELECT * FROM assets ORDER BY id DESC").map(mapRowToAsset);
  }

  updateAsset(id: number, input: {
    readonly name?: unknown;
    readonly category?: unknown;
    readonly unit?: unknown;
    readonly location?: unknown;
    readonly custodian?: unknown;
    readonly custodianMemberId?: unknown;
  }): Asset | null {
    const before = this.getAsset(id);
    if (before === null) return null;
    if (input.name !== undefined) assertValidAssetName(input.name);
    if (input.category !== undefined) assertValidAssetCategory(input.category);
    if (input.unit !== undefined) assertValidAssetText(input.unit, "计量单位");
    if (input.location !== undefined) assertValidAssetText(input.location, "存放位置");
    const custodian = (input.custodian !== undefined || input.custodianMemberId !== undefined)
      ? this.resolveAssignment(
          input.custodian !== undefined ? input.custodian : before.custodian,
          input.custodianMemberId !== undefined ? input.custodianMemberId : before.custodianMemberId,
          "保管员",
        )
      : { text: before.custodian, memberId: before.custodianMemberId ?? null };
    assertValidAssetText(custodian.text, "保管人");
    const next = {
      name: input.name ?? before.name,
      category: input.category ?? before.category,
      unit: input.unit ?? before.unit,
      location: input.location ?? before.location,
    };
    this.db.run(
      "UPDATE assets SET name = ?, category = ?, unit = ?, location = ?, custodian = ?, custodian_member_id = ? WHERE id = ?",
      [next.name, next.category, next.unit, next.location, custodian.text, custodian.memberId, id],
    );
    return this.getAsset(id);
  }

  deleteAsset(id: number): boolean {
    return this.db.run("DELETE FROM assets WHERE id = ?", [id]).changes > 0;
  }

  /**
   * 出入库流水唯一落库入口：先按 shared 规则算新库存（负库存/来源不匹配抛错），
   * 再单事务更新物资 + 追加流水；任一步失败整笔回滚（零半态）。
   */
  applyAssetTx(
    assetId: number,
    input: AssetTxInput,
    custodianMemberId?: unknown,
  ): AssetTransaction {
    const asset = this.getAsset(assetId);
    if (!asset) throw new ValidationError(`物资不存在：${assetId}`);
    assertValidAssetTxType(input.type);
    assertValidQuantity(input.quantity, "流水数量");
    assertValidAssetOperator(input.operator);
    const next = applyAssetTransaction(asset, input);
    // r24：出入库可顺带改选保管员（member_id 校验在 shared/org），老路径 custodian 列逐字节不变
    const custodian = custodianMemberId === undefined || custodianMemberId === null
      ? null
      : this.resolveAssignment(asset.custodian, custodianMemberId, "保管员");
    const from = input.from === undefined || input.from === null ? "" : input.from;
    const to = input.to === undefined || input.to === null ? "" : input.to;
    if (typeof from !== "string" || typeof to !== "string") throw new ValidationError("流水来源/目标必须是字符串");
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    let txId = 0;
    try {
      this.db.run(
        "UPDATE assets SET quantity = ?, location = ?, custodian = ?, custodian_member_id = ? WHERE id = ?",
        [
          next.quantity, next.location,
          custodian?.text ?? asset.custodian,
          custodian?.memberId ?? asset.custodianMemberId ?? null,
          assetId,
        ],
      );
      const res = this.db.run(
        'INSERT INTO asset_transactions (asset_id, type, quantity, "from", "to", operator, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [assetId, input.type, input.quantity, from, to, input.operator, now],
      );
      txId = Number(res.lastInsertRowid);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    const row = this.db.get("SELECT * FROM asset_transactions WHERE id = ?", [txId]);
    if (!row) throw new Error("流水写入后读回失败");
    return mapRowToAssetTransaction(row);
  }

  listAssetTransactions(assetId?: number): AssetTransaction[] {
    if (assetId === undefined) {
      return this.db.all("SELECT * FROM asset_transactions ORDER BY id DESC").map(mapRowToAssetTransaction);
    }
    return this.db
      .all("SELECT * FROM asset_transactions WHERE asset_id = ? ORDER BY id DESC", [assetId])
      .map(mapRowToAssetTransaction);
  }

  createUnitTask(input: {
    readonly title: unknown;
    readonly assigneeUnit: unknown;
    readonly status?: unknown;
    readonly dueDate?: unknown;
    readonly parentId?: unknown;
  }): UnitTask {
    assertValidUnitTaskTitle(input.title);
    assertValidUnit(input.assigneeUnit, "责任单位");
    const status = input.status === undefined || input.status === null ? "pending" : input.status;
    if (!isUnitTaskStatus(status)) throw new ValidationError(`非法任务状态：${String(status)}`);
    const dueDate: string | null = input.dueDate === undefined || input.dueDate === null ? null : String(input.dueDate);
    assertValidDueDate(dueDate);
    let parentId: number | null = null;
    if (input.parentId !== undefined && input.parentId !== null) {
      if (typeof input.parentId !== "number" || !Number.isInteger(input.parentId)) {
        throw new ValidationError("父任务 id 必须是整数");
      }
      if (this.getUnitTask(input.parentId) === null) throw new ValidationError(`父任务不存在：${input.parentId}`);
      parentId = input.parentId;
    }
    const res = this.db.run(
      "INSERT INTO unit_tasks (title, assignee_unit, status, due_date, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [input.title, input.assigneeUnit, status, dueDate, parentId, new Date().toISOString()],
    );
    const row = this.db.get("SELECT * FROM unit_tasks WHERE id = ?", [Number(res.lastInsertRowid)]);
    if (!row) throw new Error("任务写入后读回失败");
    return mapRowToUnitTask(row);
  }

  getUnitTask(id: number): UnitTask | null {
    const row = this.db.get("SELECT * FROM unit_tasks WHERE id = ?", [id]);
    return row ? mapRowToUnitTask(row) : null;
  }

  listUnitTasks(): UnitTask[] {
    return this.db.all("SELECT * FROM unit_tasks ORDER BY id ASC").map(mapRowToUnitTask);
  }

  transitionUnitTask(id: number, to: unknown): UnitTask | null {
    const current = this.getUnitTask(id);
    if (!current) return null;
    if (!isUnitTaskStatus(to)) throw new ValidationError(`非法任务状态：${String(to)}`);
    assertValidUnitTaskTransition(current.status, to);
    this.db.run("UPDATE unit_tasks SET status = ? WHERE id = ?", [to, id]);
    return this.getUnitTask(id);
  }

  updateUnitTask(id: number, input: {
    readonly title?: unknown;
    readonly assigneeUnit?: unknown;
    readonly dueDate?: unknown;
  }): UnitTask | null {
    const current = this.getUnitTask(id);
    if (!current) return null;
    if (input.title !== undefined) assertValidUnitTaskTitle(input.title);
    if (input.assigneeUnit !== undefined) assertValidUnit(input.assigneeUnit, "责任单位");
    if (input.dueDate !== undefined) assertValidDueDate(input.dueDate ?? null);
    const nextDueDate: string | null = input.dueDate === undefined
      ? current.dueDate
      : (input.dueDate === null ? null : String(input.dueDate));
    this.db.run(
      "UPDATE unit_tasks SET title = ?, assignee_unit = ?, due_date = ? WHERE id = ?",
      [
        input.title ?? current.title,
        input.assigneeUnit ?? current.assigneeUnit,
        nextDueDate,
        id,
      ],
    );
    return this.getUnitTask(id);
  }

  deleteUnitTask(id: number): boolean {
    return this.db.run("DELETE FROM unit_tasks WHERE id = ?", [id]).changes > 0;
  }

  /** 任务树装配唯一入口：读全表交给 shared buildTaskTree（环路/孤儿父节点规则同源） */
  getUnitTaskTree(): UnitTaskTreeNode[] {
    return buildTaskTree(this.listUnitTasks());
  }

  // ---- r18：账号与会话（schema v14）----

  /**
   * 建用户：密码在这里经 shared hashPassword 后只写 password_hash 列；
   * 首个用户自动成为 admin（自托管首启引导），其余为 user，调用方不能自选角色。
   */
  createUser(input: { readonly username: unknown; readonly password: unknown; readonly role?: unknown }): AuthUser {
    assertValidUsername(input.username);
    assertValidPassword(input.password);
    const username = input.username.trim();
    if (this.getUserByUsername(username)) {
      throw new ConflictError(`用户名已存在：${username}`);
    }
    const role: AuthRole = this.listUsers().length === 0 ? "admin" : "user";
    if (input.role !== undefined && !isAuthRole(input.role)) {
      throw new ValidationError(`非法用户角色：${String(input.role)}`);
    }
    const passwordHash = hashPassword(input.password);
    const now = new Date().toISOString();
    this.db.run(
      "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
      [username, passwordHash, role, now],
    );
    const row = this.db.get("SELECT id, username, role, created_at FROM users WHERE username = ?", [username]);
    if (!row) throw new Error(`建用户后读回失败：${username}`);
    return mapRowToAuthUser(row);
  }

  getUserById(id: number): AuthUser | null {
    const row = this.db.get("SELECT id, username, role, created_at FROM users WHERE id = ?", [id]);
    return row ? mapRowToAuthUser(row) : null;
  }

  getUserByUsername(username: string): AuthUser | null {
    const row = this.db.get("SELECT id, username, role, created_at FROM users WHERE username = ?", [username]);
    return row ? mapRowToAuthUser(row) : null;
  }

  /** 只供认证链路使用：取回哈希摘要，绝不通过任何对外接口返回 */
  getPasswordHash(userId: number): string | null {
    const row = this.db.get("SELECT password_hash FROM users WHERE id = ?", [userId]) as { password_hash?: string } | undefined;
    return row?.password_hash ?? null;
  }

  listUsers(): AuthUser[] {
    return this.db
      .all("SELECT id, username, role, created_at FROM users ORDER BY id")
      .map(mapRowToAuthUser);
  }

  deleteUser(id: number): boolean {
    return this.db.run("DELETE FROM users WHERE id = ?", [id]).changes > 0;
  }

  createSession(input: { readonly userId: unknown; readonly token: unknown; readonly expiresAt: unknown }): Session {
    const userId = Number(input.userId);
    if (!Number.isInteger(userId) || userId <= 0 || !this.getUserById(userId)) {
      throw new ValidationError(`用户不存在：${String(input.userId)}`);
    }
    assertValidSessionToken(input.token);
    assertValidExpiresAt(input.expiresAt);
    if (this.getSessionByToken(input.token)) {
      throw new ConflictError("会话 token 已存在");
    }
    this.db.run(
      "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
      [userId, input.token, input.expiresAt],
    );
    const row = this.db.get("SELECT id, user_id, token, expires_at FROM sessions WHERE token = ?", [input.token]);
    if (!row) throw new Error("建会话后读回失败");
    return mapRowToSession(row);
  }

  getSessionByToken(token: string): Session | null {
    const row = this.db.get("SELECT id, user_id, token, expires_at FROM sessions WHERE token = ?", [token]);
    return row ? mapRowToSession(row) : null;
  }

  listSessions(userId?: number): Session[] {
    const rows = userId === undefined
      ? this.db.all("SELECT id, user_id, token, expires_at FROM sessions ORDER BY id")
      : this.db.all("SELECT id, user_id, token, expires_at FROM sessions WHERE user_id = ? ORDER BY id", [userId]);
    return rows.map(mapRowToSession);
  }

  deleteSession(token: string): boolean {
    return this.db.run("DELETE FROM sessions WHERE token = ?", [token]).changes > 0;
  }

  deleteSessionsForUser(userId: number): number {
    return this.db.run("DELETE FROM sessions WHERE user_id = ?", [userId]).changes;
  }

  /** 删除已过期会话，返回被删对象（审计与测试可核对） */
  purgeExpiredSessions(nowIso: string = new Date().toISOString()): Session[] {
    if (!Number.isFinite(Date.parse(nowIso))) throw new ValidationError("非法清理基准时间");
    const expired = this.listSessions().filter((s) => Date.parse(s.expiresAt) <= Date.parse(nowIso));
    for (const s of expired) this.deleteSession(s.token);
    return expired;
  }

  // ---- r19：多端同步（schema v15）----

  /** 追加一条变更日志（乐观锁写入的内部唯一入口，单条落库） */
  appendChange(input: {
    readonly entityType: unknown;
    readonly entityId: unknown;
    readonly operation: unknown;
    readonly payload: Record<string, unknown>;
    readonly version: unknown;
    readonly userId?: unknown;
    readonly createdAt?: unknown;
  }): ChangeRecord {
    assertValidEntityType(input.entityType);
    assertValidEntityId(input.entityId);
    assertValidChangeOperation(input.operation);
    assertValidVersion(input.version);
    const createdAt = input.createdAt === undefined || input.createdAt === null
      ? new Date().toISOString()
      : String(input.createdAt);
    let userId: number | null = null;
    if (input.userId !== undefined && input.userId !== null) {
      const uid = Number(input.userId);
      if (!Number.isInteger(uid) || uid <= 0 || !this.getUserById(uid)) {
        throw new ValidationError(`变更关联用户不存在：${String(input.userId)}`);
      }
      userId = uid;
    }
    const res = this.db.run(
      `INSERT INTO change_log (entity_type, entity_id, operation, payload, user_id, created_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.entityType, input.entityId, input.operation, JSON.stringify(input.payload), userId, createdAt, input.version],
    );
    const row = this.db.get("SELECT * FROM change_log WHERE id = ?", [Number(res.lastInsertRowid)]);
    if (!row) throw new Error("变更日志写入后读回失败");
    return mapRowToChangeRecord(row);
  }

  /** 增量拉取：id > since 按 id 升序，limit 由 shared 归一（同 since 重复拉结果稳定） */
  listChanges(sinceInput: unknown = 0, limitInput: unknown = 50): ChangeRecord[] {
    const since = normalizeSince(sinceInput);
    const limit = normalizeLimit(limitInput);
    return this.db
      .all("SELECT * FROM change_log WHERE id > ? ORDER BY id ASC LIMIT ?", [since, limit])
      .map(mapRowToChangeRecord);
  }

  /** 全表最新一条变更（status 的 lastChangeId/lastChangeAt 唯一口径）：id DESC LIMIT 1，api 零排序分支 */
  listLatestChange(): ChangeRecord | null {
    const row = this.db.get("SELECT * FROM change_log ORDER BY id DESC LIMIT 1");
    return row ? mapRowToChangeRecord(row) : null;
  }

  getEntityVersion(entityType: string, entityId: string): EntityVersion | null {
    const row = this.db.get(
      "SELECT entity_type, entity_id, version, updated_at FROM entity_versions WHERE entity_type = ? AND entity_id = ?",
      [entityType, entityId],
    );
    return row ? mapRowToEntityVersion(row) : null;
  }

  listEntityVersions(): EntityVersion[] {
    return this.db
      .all("SELECT entity_type, entity_id, version, updated_at FROM entity_versions ORDER BY entity_type, entity_id")
      .map(mapRowToEntityVersion);
  }

  /** 按版本回读基线载荷（三方比较的 base 来源） */
  getChangeAtVersion(entityType: string, entityId: string, version: number): ChangeRecord | null {
    const row = this.db.get(
      "SELECT * FROM change_log WHERE entity_type = ? AND entity_id = ? AND version = ? ORDER BY id DESC LIMIT 1",
      [entityType, entityId, version],
    );
    return row ? mapRowToChangeRecord(row) : null;
  }

  getLatestChange(entityType: string, entityId: string): ChangeRecord | null {
    const row = this.db.get(
      "SELECT * FROM change_log WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT 1",
      [entityType, entityId],
    );
    return row ? mapRowToChangeRecord(row) : null;
  }

  /**
   * 乐观锁写入唯一入口：expectedVersion 等于服务端当前版本才落库并 +1；
   * 期望版本恰好落后一代且载荷完全相同 → 幂等重放（不二次递增）；
   * 其余一律抛 SyncConflictError（三方比较字段列表 + 两端快照，api 映射 409）。
   * 单事务覆盖 change_log 追加 + entity_versions upsert，零半态。
   */
  applySyncChange(input: {
    readonly entityType: unknown;
    readonly entityId: unknown;
    readonly operation: unknown;
    readonly payload: unknown;
    readonly expectedVersion: unknown;
    readonly base?: unknown;
    readonly userId?: unknown;
  }): { readonly applied: ChangeRecord; readonly version: number; readonly idempotent: boolean } {
    assertValidEntityType(input.entityType);
    assertValidEntityId(input.entityId);
    assertValidChangeOperation(input.operation);
    assertValidVersion(input.expectedVersion);
    if (input.payload === null || typeof input.payload !== "object" || Array.isArray(input.payload)) {
      throw new ValidationError("变更载荷必须是对象");
    }
    const payload = input.payload as Record<string, unknown>;
    if (input.base !== undefined && input.base !== null &&
        (typeof input.base !== "object" || Array.isArray(input.base))) {
      throw new ValidationError("三方比较基线必须是对象");
    }
    const entityType: string = input.entityType;
    const entityId: string = input.entityId;
    const expectedVersion: number = input.expectedVersion;
    const operation: ChangeOperation = input.operation;
    const currentVersion = this.getEntityVersion(entityType, entityId)?.version ?? 0;
    const latest = this.getLatestChange(entityType, entityId);

    if (expectedVersion === currentVersion) {
      const version = nextVersion(currentVersion);
      const now = new Date().toISOString();
      this.db.exec("BEGIN IMMEDIATE");
      let applied: ChangeRecord | null = null;
      try {
        applied = this.appendChange({ entityType, entityId, operation, payload, version, userId: input.userId, createdAt: now });
        this.db.run(
          `INSERT INTO entity_versions (entity_type, entity_id, version, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(entity_type, entity_id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at`,
          [entityType, entityId, version, now],
        );
        this.db.exec("COMMIT");
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      }
      return { applied: applied!, version, idempotent: false };
    }

    if (expectedVersion === currentVersion - 1 && latest && latest.version === currentVersion &&
        latest.operation === operation && valuesEqual(latest.payload, payload)) {
      return { applied: latest, version: currentVersion, idempotent: true };
    }

    const base = (input.base !== undefined && input.base !== null
      ? input.base as Record<string, unknown>
      : this.getChangeAtVersion(entityType, entityId, expectedVersion)?.payload ?? {});
    const remote = latest?.payload ?? {};
    const compared = detectConflict(base, payload, remote);
    throw new SyncConflictError(
      `版本冲突：期望 ${expectedVersion}，服务端当前 ${currentVersion}`,
      compared.conflicts,
      compared.divergedFields,
      currentVersion,
      base,
      payload,
      remote,
    );
  }

  // ---- r23：组织架构与通讯录（schema v16；规则全在 shared/org，本层只守卫+落库） ----

  listDepartments(): Department[] {
    return this.db
      .all("SELECT id, name, parent_id, sort_order, created_at FROM departments ORDER BY sort_order, id")
      .map(mapRowToDepartment);
  }

  getDepartment(id: number): Department | null {
    const row = this.db.get("SELECT id, name, parent_id, sort_order, created_at FROM departments WHERE id = ?", [id]);
    return row ? mapRowToDepartment(row) : null;
  }

  /** 重名 / 越权父部门在落库前由 shared 唯一规则判定（api 400 映射） */
  private assertDepartmentWritable(input: DepartmentInput, excludeId: number | null = null): {
    name: string; parentId: number | null; sortOrder: number;
  } {
    const normalized = normalizeDepartment(input);
    const existing = findDuplicateDepartmentName(normalized.name, this.listDepartments());
    if (existing !== null && existing !== excludeId) {
      throw new ValidationError(`部门名称已存在：${normalized.name}`);
    }
    if (normalized.parentId !== null && !this.getDepartment(normalized.parentId)) {
      throw new ValidationError(`父部门不存在：${normalized.parentId}`);
    }
    return normalized;
  }

  createDepartment(input: DepartmentInput): Department {
    const normalized = this.assertDepartmentWritable(input);
    const createdAt = new Date().toISOString();
    const res = this.db.run(
      "INSERT INTO departments (name, parent_id, sort_order, created_at) VALUES (?, ?, ?, ?)",
      [normalized.name, normalized.parentId, normalized.sortOrder, createdAt],
    );
    const row = this.db.get("SELECT id, name, parent_id, sort_order, created_at FROM departments WHERE id = ?", [Number(res.lastInsertRowid)]);
    if (!row) throw new Error("部门写入后读回失败");
    return mapRowToDepartment(row);
  }

  updateDepartment(id: number, input: DepartmentInput): Department | null {
    const existing = this.getDepartment(id);
    if (!existing) return null;
    // PATCH 语义：未提供字段沿用原值（显式 null 才清空 parentId）
    const normalized = this.assertDepartmentWritable({
      name: input.name !== undefined ? input.name : existing.name,
      parentId: input.parentId !== undefined ? input.parentId : existing.parentId,
      sortOrder: input.sortOrder !== undefined ? input.sortOrder : existing.sortOrder,
    }, id);
    validateDepartmentMove(id, normalized.parentId, this.listDepartments());
    this.db.run(
      "UPDATE departments SET name = ?, parent_id = ?, sort_order = ? WHERE id = ?",
      [normalized.name, normalized.parentId, normalized.sortOrder, id],
    );
    return this.getDepartment(id);
  }

  /** 移动唯一入口：防自挂 / 防成环 / 防越权 id 全走 shared validateDepartmentMove */
  moveDepartment(id: number, parentId: number | null): Department | null {
    const dept = this.getDepartment(id);
    if (!dept) return null;
    validateDepartmentMove(id, parentId, this.listDepartments());
    this.db.run("UPDATE departments SET parent_id = ? WHERE id = ?", [parentId, id]);
    return this.getDepartment(id);
  }

  deleteDepartment(id: number): boolean {
    return this.db.run("DELETE FROM departments WHERE id = ?", [id]).changes > 0;
  }

  listMembers(departmentId?: unknown): Member[] {
    let rows: Record<string, unknown>[];
    if (departmentId === undefined || departmentId === null) {
      rows = this.db.all("SELECT id, name, department_id, role, email, phone, title, status, user_id FROM members ORDER BY id");
    } else {
      const id = Number(departmentId);
      if (!Number.isInteger(id) || id <= 0) throw new ValidationError(`非法部门过滤 id：${String(departmentId)}`);
      rows = this.db.all(
        "SELECT id, name, department_id, role, email, phone, title, status, user_id FROM members WHERE department_id = ? ORDER BY id",
        [id],
      );
    }
    return rows.map(mapRowToMember);
  }

  getMember(id: number): Member | null {
    const row = this.db.get(
      "SELECT id, name, department_id, role, email, phone, title, status, user_id FROM members WHERE id = ?",
      [id],
    );
    return row ? mapRowToMember(row) : null;
  }

  /** 人员写入前校验关联实体真实存在（越权 id → ValidationError → api 400） */
  private assertMemberWritable(input: MemberInput): Omit<Member, "id"> {
    const normalized = normalizeMember(input);
    if (normalized.departmentId !== null && !this.getDepartment(normalized.departmentId)) {
      throw new ValidationError(`部门不存在：${normalized.departmentId}`);
    }
    if (normalized.userId !== null && !this.getUserById(normalized.userId)) {
      throw new ValidationError(`关联用户不存在：${normalized.userId}`);
    }
    return normalized;
  }

  createMember(input: MemberInput): Member {
    const normalized = this.assertMemberWritable(input);
    const res = this.db.run(
      `INSERT INTO members (name, department_id, role, email, phone, title, status, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.name, normalized.departmentId, normalized.role, normalized.email,
        normalized.phone, normalized.title, normalized.status, normalized.userId,
      ],
    );
    const member = this.getMember(Number(res.lastInsertRowid));
    if (!member) throw new Error("人员写入后读回失败");
    return member;
  }

  updateMember(id: number, input: MemberInput): Member | null {
    const existing = this.getMember(id);
    if (!existing) return null;
    // PATCH 语义：未提供字段沿用原值（显式 null 才清空 departmentId / userId）
    const normalized = this.assertMemberWritable({
      name: input.name !== undefined ? input.name : existing.name,
      email: input.email !== undefined ? input.email : existing.email,
      departmentId: input.departmentId !== undefined ? input.departmentId : existing.departmentId,
      role: input.role !== undefined ? input.role : existing.role,
      phone: input.phone !== undefined ? input.phone : existing.phone,
      title: input.title !== undefined ? input.title : existing.title,
      status: input.status !== undefined ? input.status : existing.status,
      userId: input.userId !== undefined ? input.userId : existing.userId,
    });
    this.db.run(
      `UPDATE members SET name = ?, department_id = ?, role = ?, email = ?, phone = ?, title = ?, status = ?, user_id = ?
       WHERE id = ?`,
      [
        normalized.name, normalized.departmentId, normalized.role, normalized.email,
        normalized.phone, normalized.title, normalized.status, normalized.userId, id,
      ],
    );
    return this.getMember(id);
  }

  deleteMember(id: number): boolean {
    return this.db.run("DELETE FROM members WHERE id = ?", [id]).changes > 0;
  }

  /** GET /api/org/members/:id/usage：四类关联计数口径唯一在 shared/org，本层只取关联列 */
  countMemberUsage(memberId: unknown): MemberUsage {
    const id = normalizeMemberRef(memberId);
    if (id === null) throw new ValidationError("成员 id 不能为空");
    return countMemberUsage(id, {
      approvals: this.db.all("SELECT applicant_member_id AS applicantMemberId FROM approvals"),
      steps: this.db.all("SELECT assignee_member_id AS assigneeMemberId FROM approval_steps"),
      cc: this.db.all("SELECT cc_member_id AS ccMemberId FROM approval_cc"),
      assets: this.db.all("SELECT custodian_member_id AS custodianMemberId FROM assets"),
    });
  }

  /** 姓名/邮箱/职位模糊搜索（大小写不敏感规则唯一在 shared） */
  searchMembers(query: unknown): Member[] {
    return searchMembersRule(this.listMembers(), query);
  }

  /** GET /api/org/tree：部门树带直属人员，装配规则唯一在 shared buildOrgTree */
  getOrgTree(): OrgTreeNode[] {
    return buildOrgTree(this.listDepartments(), this.listMembers());
  }
}
