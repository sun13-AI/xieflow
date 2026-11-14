// 协流 XieFlow — index.ts：连接、迁移（IKanBot 三件套模式）
// node-sqlite3-wasm：纯 WASM，无需原生编译，跨平台（Node 24 下免预编译二进制坑）。
// CJS 包在 ESM 里走默认导入解构。
import sqlite3Wasm from "node-sqlite3-wasm";
import type { Database as WasmDatabase } from "node-sqlite3-wasm";
import { MIGRATIONS, CURRENT_SCHEMA_VERSION, assertMigrationsConsistent } from "./schema.js";
import { mapSettingsRow, mapRowToTodo } from "./mappers.js";
import type { AppSetting, Todo } from "@xieflow/shared";
import { canTransitionTodo } from "@xieflow/shared";

export { MIGRATIONS, CURRENT_SCHEMA_VERSION, assertMigrationsConsistent };

const { Database } = sqlite3Wasm as unknown as {
  Database: new (filename: string, options?: { fileMustExist?: boolean }) => WasmDatabase;
};

export interface OpenOptions {
  /** 内存库用于测试；文件库用于真实数据 */
  path: string;
}

/** 打开数据库并迁移到最新版本。所有服务层从这里拿连接。 */
export function openDatabase(opts: OpenOptions): XieFlowDb {
  assertMigrationsConsistent();
  const db = new Database(opts.path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(db);
  return new XieFlowDb(db);
}

function migrate(db: WasmDatabase): void {
  const row = db.get("PRAGMA user_version") as { user_version?: number } | undefined;
  let current = row?.user_version ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      for (const sql of m.up) {
        db.exec(sql);
      }
      db.exec(`PRAGMA user_version = ${m.version}`);
      current = m.version;
    }
  }
  if (current !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`迁移未达目标版本：停在 ${current}，目标 ${CURRENT_SCHEMA_VERSION}`);
  }
}

/** 服务层门面：r1 只暴露 settings 与 todo 最小接口 */
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

  // ---- todos（r2 扩展 UI，数据层先落） ----

  createTodo(title: string, quadrant: string, dueDate: string | null): Todo {
    if (title.trim() === "") {
      throw new Error("待办标题不能为空");
    }
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

  /** 状态流转：非法流转抛错（状态机校验在服务层，不散落 if-else） */
  transitionTodo(id: number, to: Todo["status"]): Todo {
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
