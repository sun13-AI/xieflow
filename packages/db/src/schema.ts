// 协流 XieFlow — schema.ts：建表 SQL 与迁移（user_version 版本管理）
// 宪法第七条：schema 变更只走这里，禁止手改库文件。
import type { Migration } from "@xieflow/shared";
import { SCHEMA_VERSION } from "@xieflow/shared";

/** 全量迁移队列，按 version 升序；新迁移追加到尾部，永不修改旧条目 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "r1 · settings 表",
    up: [
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    name: "r1 · todos 表（数据层先行，UI r2 落）",
    up: [
      `CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        quadrant TEXT NOT NULL CHECK (quadrant IN ('q1','q2','q3','q4')),
        status TEXT NOT NULL CHECK (status IN ('open','done','archived')),
        due_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_todos_quadrant ON todos (quadrant)`,
      `CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos (due_date)`,
    ],
  },
];

/** 当前 schema 版本（与 shared 的 SCHEMA_VERSION 保持一致，e2e 会断言二者相等） */
export const CURRENT_SCHEMA_VERSION: number = SCHEMA_VERSION;

/**
 * 确保迁移队列覆盖到目标版本且 version 连续。
 * 参数默认用真实队列；e2e 传入构造的坏队列验证校验逻辑本身（真实行为断言）。
 */
export function assertMigrationsConsistent(
  queue: readonly Migration[] = MIGRATIONS,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): void {
  const versions = queue.map((m) => m.version);
  const max = versions.length > 0 ? Math.max(...versions) : 0;
  if (max !== targetVersion) {
    throw new Error(
      `迁移队列最高版本 ${max} 与 SCHEMA_VERSION ${targetVersion} 不一致`,
    );
  }
  for (let i = 0; i < versions.length; i++) {
    if (versions[i] !== i + 1) {
      throw new Error(`迁移版本必须从 1 连续递增，第 ${i} 个是 ${versions[i]}`);
    }
  }
}
