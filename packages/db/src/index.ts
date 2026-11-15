// 协流 XieFlow — index.ts：连接、迁移（IKanBot 三件套模式）
// node-sqlite3-wasm：纯 WASM，无需原生编译，跨平台（Node 24 下免预编译二进制坑）。
// CJS 包在 ESM 里走默认导入解构。
// r2：暴露 openDatabaseRaw（raw 底层句柄 + 应用过的迁移清单，供 e2e 真实触达 schema
// 约束与迁移幂等），服务层输入校验收紧为 shared 守卫（先守卫、后落库）。
import sqlite3Wasm from "node-sqlite3-wasm";
import type { Database as WasmDatabase } from "node-sqlite3-wasm";
import { MIGRATIONS, CURRENT_SCHEMA_VERSION, assertMigrationsConsistent } from "./schema.js";
import { mapSettingsRow, mapRowToTodo } from "./mappers.js";
import type { AppSetting, Todo } from "@xieflow/shared";
import { canTransitionTodo, assertValidQuadrant, assertValidTodoStatus, assertValidTitle, assertValidDueDate } from "@xieflow/shared";

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
    return mapRowToTodo(row);
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

  close(): void {
    this.db.close();
  }
}
