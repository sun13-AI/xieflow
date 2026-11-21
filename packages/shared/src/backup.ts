// 协流 XieFlow — backup.ts：工作区级备份与恢复的唯一规则口径（r49）
// 宪法第七条/第四条：规则集中在此，api/web 零算法分支；任何 key 不写密钥文件、零 token。
// 危险区红线：sessions / change_log / users / entity_versions 属于认证与同步运行时状态，
//  绝不进入快照、绝不参与恢复；恢复只替换 BACKUP_TABLES 白名单业务表。
// 零半态：planRestore 先全量校验（含白名单与版本），校验不过不生成任何写入步骤；
//  真正落库由 db 层在单一 BEGIN IMMEDIATE 事务里执行，任一步失败整体 ROLLBACK。
import { SCHEMA_VERSION, ValidationError } from "./index.js";

/** 备份文件标识（防止把任意 JSON 误当备份恢复） */
export const BACKUP_FORMAT = "xieflow-workspace-backup";
/** 备份文件格式版本（与 schema 版本解耦：结构升级才 +1） */
export const BACKUP_FORMAT_VERSION = 1;
/** 恢复二次确认令牌：必须由调用方显式传入，绝不缺省 */
export const BACKUP_CONFIRM_TOKEN = "RESTORE_WORKSPACE";

/**
 * 不进备份/恢复的运行时表。
 * - sessions：登录会话（恢复若重建 users 会级联删除会话，属危险区）
 * - change_log / entity_versions：多端同步游标与版本，恢复会制造假冲突
 * - users：认证身份（sessions 的外键根，且 password_hash 不随业务快照漂移）
 */
export const BACKUP_RUNTIME_TABLES = [
  "sessions",
  "change_log",
  "entity_versions",
  "users",
] as const;

/**
 * 业务表白名单，按「父表在前、子表在后」的插入依赖顺序排列。
 * db 层恢复时按此顺序 INSERT，按反序 DELETE，全程 FK 约束保持开启。
 */
export const BACKUP_TABLES = [
  "settings",
  "departments",
  "members",
  "todos",
  "todo_dependencies",
  "schedules",
  "projects",
  "board_columns",
  "cards",
  "card_labels",
  "tables",
  "fields",
  "records",
  "views",
  "documents",
  "blocks",
  "document_versions",
  "knowledge_docs",
  "knowledge_chunks",
  "conversations",
  "messages",
  "artifacts",
  "mindmaps",
  "whiteboards",
  "whiteboard_items",
  "approvals",
  "approval_steps",
  "approval_cc",
  "assets",
  "asset_transactions",
  "unit_tasks",
  "notifications",
  "forms",
  "form_questions",
  "form_responses",
  "rooms",
  "meetings",
  "meeting_attendees",
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];
export type BackupRow = Record<string, string | number | boolean | null>;
export type BackupSnapshot = Record<string, readonly BackupRow[]>;

export interface BackupTableCount {
  readonly name: string;
  readonly rows: number;
}

export interface BackupManifest {
  readonly format: string;
  readonly formatVersion: number;
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly tableCount: number;
  readonly rowCount: number;
  readonly tables: readonly BackupTableCount[];
}

export interface BackupFile {
  readonly format: string;
  readonly formatVersion: number;
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly manifest: BackupManifest;
  readonly tables: BackupSnapshot;
}

export interface BackupValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly manifest: BackupManifest | null;
  readonly preview: readonly BackupTableCount[];
}

export interface RestoreStep {
  readonly table: string;
  readonly action: "delete" | "insert";
  readonly rows: number;
}

export interface RestorePlan {
  readonly canApply: boolean;
  readonly errors: readonly string[];
  readonly manifest: BackupManifest | null;
  readonly steps: readonly RestoreStep[];
  readonly protectedTables: readonly string[];
  readonly confirmToken: string;
}

const BACKUP_TABLE_SET = new Set<string>(BACKUP_TABLES);
const RUNTIME_TABLE_SET = new Set<string>(BACKUP_RUNTIME_TABLES);
const COLUMN_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 白名单内部使用：识别表是否在允许集合里（运行时表恒 false） */
export function isBackupTable(name: string): boolean {
  return BACKUP_TABLE_SET.has(name) && !RUNTIME_TABLE_SET.has(name);
}

/** 由快照生成清单：版本 / 时间 / 表计数；纯函数，不写任何状态 */
export function buildBackupManifest(
  snapshot: BackupSnapshot,
  createdAt: string = new Date().toISOString(),
): BackupManifest {
  const tables: BackupTableCount[] = [];
  let rowCount = 0;
  for (const name of Object.keys(snapshot)) {
    const rows = snapshot[name] ?? [];
    rowCount += rows.length;
    tables.push({ name, rows: rows.length });
  }
  tables.sort((a, b) => a.name.localeCompare(b.name));
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAt,
    tableCount: tables.length,
    rowCount,
    tables,
  };
}

/** 由快照装配完整备份文件（导出唯一出口，api 只做 HTTP 响应装配） */
export function buildBackupFile(snapshot: BackupSnapshot, createdAt?: string): BackupFile {
  const manifest = buildBackupManifest(snapshot, createdAt);
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAt: manifest.createdAt,
    manifest,
    tables: snapshot,
  };
}

/** 安全文件名：只含 ASCII 日期时间，不含用户可控文本 */
export function buildBackupFileName(createdAt: string): string {
  const stamp = createdAt.replace(/[-:T.]/g, "").slice(0, 14);
  return `xieflow-workspace-backup-${stamp || "00000000000000"}.json`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRow(row: unknown, table: string, index: number): string | null {
  if (!isPlainObject(row)) return `表 ${table} 第 ${index + 1} 行不是对象`;
  for (const [col, value] of Object.entries(row)) {
    if (!COLUMN_RE.test(col)) return `表 ${table} 第 ${index + 1} 行字段名非法：${col}`;
    if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      return `表 ${table} 第 ${index + 1} 行字段 ${col} 类型不受支持`;
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      return `表 ${table} 第 ${index + 1} 行字段 ${col} 不是有限数值`;
    }
  }
  return null;
}

/**
 * 全量结构 / 版本 / 白名单校验。返回结构化结果（不抛错），供「先预览后写」使用。
 * 变异红相锚点：去掉下面的白名单判断 → 未知表断言变红。
 */
export function validateBackupFile(input: unknown): BackupValidation {
  const errors: string[] = [];
  if (!isPlainObject(input)) {
    return { valid: false, errors: ["备份文件根节点必须是对象"], manifest: null, preview: [] };
  }
  const doc = input as Record<string, unknown>;
  if (doc.format !== BACKUP_FORMAT) errors.push(`格式标识不匹配：期望 ${BACKUP_FORMAT}`);
  if (doc.formatVersion !== BACKUP_FORMAT_VERSION) {
    errors.push(`备份格式版本不兼容：期望 ${BACKUP_FORMAT_VERSION}，实际 ${String(doc.formatVersion)}`);
  }
  if (doc.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schema 版本不兼容：期望 ${SCHEMA_VERSION}，实际 ${String(doc.schemaVersion)}`);
  }
  if (typeof doc.createdAt !== "string" || Number.isNaN(Date.parse(doc.createdAt))) {
    errors.push("备份时间缺失或不是合法时间");
  }
  if (!isPlainObject(doc.tables)) {
    errors.push("备份缺少 tables 对象");
    return { valid: false, errors, manifest: null, preview: [] };
  }

  const snapshot: BackupSnapshot = {};
  const preview: BackupTableCount[] = [];
  for (const [name, rows] of Object.entries(doc.tables)) {
    // 危险区核心：未知表 / 运行时表一律拒绝，绝不进入恢复计划。
    if (!isBackupTable(name)) {
      errors.push(`未知表或受保护表不属于备份白名单：${name}`);
      continue;
    }
    if (!Array.isArray(rows)) {
      errors.push(`表 ${name} 的值必须是数组`);
      continue;
    }
    let columns: string[] | null = null;
    for (let i = 0; i < rows.length; i++) {
      const rowError = validateRow(rows[i], name, i);
      if (rowError) {
        errors.push(rowError);
        continue;
      }
      const keys = Object.keys(rows[i] as BackupRow).sort();
      if (columns === null) columns = keys;
      else if (JSON.stringify(columns) !== JSON.stringify(keys)) {
        errors.push(`表 ${name} 第 ${i + 1} 行列结构与首行不一致`);
      }
    }
    snapshot[name] = rows as readonly BackupRow[];
    preview.push({ name, rows: rows.length });
  }
  preview.sort((a, b) => a.name.localeCompare(b.name));
  if (errors.length > 0) {
    return { valid: false, errors, manifest: null, preview };
  }
  const manifest = buildBackupManifest(snapshot, doc.createdAt as string);
  if (manifest.tableCount !== BACKUP_TABLES.length) {
    errors.push(`备份表数不完整：期望 ${BACKUP_TABLES.length}，实际 ${manifest.tableCount}`);
    return { valid: false, errors, manifest: null, preview };
  }
  return { valid: true, errors: [], manifest, preview };
}

/**
 * 恢复计划：先校验再生成；校验不过 → 零步骤（零半态）。
 * 步骤顺序固定：先按白名单反序删，再按白名单正序插，全部由调用方单事务执行。
 */
export function planRestore(input: unknown): RestorePlan {
  const validation = validateBackupFile(input);
  const protectedTables = [...BACKUP_RUNTIME_TABLES];
  if (!validation.valid || validation.manifest === null) {
    return {
      canApply: false,
      errors: validation.errors,
      manifest: null,
      steps: [],
      protectedTables,
      confirmToken: BACKUP_CONFIRM_TOKEN,
    };
  }
  const snapshot = (input as BackupFile).tables;
  const steps: RestoreStep[] = [];
  for (let i = BACKUP_TABLES.length - 1; i >= 0; i--) {
    steps.push({ table: BACKUP_TABLES[i]!, action: "delete", rows: 0 });
  }
  for (const table of BACKUP_TABLES) {
    steps.push({ table, action: "insert", rows: snapshot[table]?.length ?? 0 });
  }
  return {
    canApply: true,
    errors: [],
    manifest: validation.manifest,
    steps,
    protectedTables,
    confirmToken: BACKUP_CONFIRM_TOKEN,
  };
}

/** 二次确认令牌归一：只有严格相等才放行，缺省/错拼一律抛 400 语义错误 */
export function assertRestoreConfirmed(confirm: unknown): void {
  if (confirm !== BACKUP_CONFIRM_TOKEN) {
    throw new ValidationError(`恢复需要二次确认：confirm 必须为 ${BACKUP_CONFIRM_TOKEN}`);
  }
}

/** 人类可读的恢复后果摘要（UI 预览与 HTTP 响应共用，零随机、零算法分支在 web） */
export function describeRestoreImpact(plan: RestorePlan): string {
  if (!plan.canApply || plan.manifest === null) return "备份校验未通过，未生成任何恢复操作。";
  return `将替换 ${plan.manifest.tableCount} 张业务表、共 ${plan.manifest.rowCount} 行数据；登录会话、同步日志与账户表不受影响。`;
}
