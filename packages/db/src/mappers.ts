// 协流 XieFlow — mappers.ts：行 → 领域对象（snake_case ↔ camelCase 唯一入口）
import type {
  AppSetting,
  Todo,
  Quadrant,
  TodoStatus,
  Schedule,
  ScheduleRepeat,
  Project,
  BoardColumn,
  BoardCard,
  BaseTable,
  TableField,
  TableRecord,
  TableView,
  ViewFilterCondition,
  ViewSortRule,
  FieldType,
  Document,
  DocumentBlock,
  BlockType,
} from "@xieflow/shared";
import { isFieldType, isBlockType, normalizeBlockContent } from "@xieflow/shared";
import { REPEATS_ORDER } from "./repeat-order.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export function mapSettingsRow(row: Row): AppSetting {
  return {
    key: String(row.key),
    value: String(row.value),
    updatedAt: String(row.updated_at),
  };
}

const QUADRANTS: readonly Quadrant[] = ["q1", "q2", "q3", "q4"];
const STATUSES: readonly TodoStatus[] = ["open", "done", "archived"];

export function mapRowToTodo(row: Row): Todo {
  const quadrant = String(row.quadrant) as Quadrant;
  const status = String(row.status) as TodoStatus;
  if (!QUADRANTS.includes(quadrant)) {
    throw new Error(`非法象限值：${row.quadrant}`);
  }
  if (!STATUSES.includes(status)) {
    throw new Error(`非法状态值：${row.status}`);
  }
  return {
    id: Number(row.id),
    title: String(row.title),
    quadrant,
    status,
    dueDate: row.due_date === null ? null : String(row.due_date),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapRowToSchedule(row: Row): Schedule {
  const repeat = String(row.repeat) as ScheduleRepeat;
  if (!REPEATS_ORDER.includes(repeat)) {
    throw new Error(`非法重复规则值：${row.repeat}`);
  }
  return {
    id: Number(row.id),
    title: String(row.title),
    date: String(row.date),
    start: String(row.start_time),
    end: String(row.end_time),
    todoId: row.todo_id === null ? null : Number(row.todo_id),
    repeat,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapRowToProject(row: Row): Project {
  return {
    id: Number(row.id),
    name: String(row.name),
    description: row.description === null ? null : String(row.description),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapRowToBoardColumn(row: Row): BoardColumn {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    name: String(row.name),
    position: Number(row.position),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapRowToBoardCard(row: Row): BoardCard {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    columnId: Number(row.column_id),
    title: String(row.title),
    description: row.description === null ? null : String(row.description),
    position: Number(row.position),
    todoId: row.todo_id === null ? null : Number(row.todo_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** 候选项 JSON 解析（坏 JSON 视为无候选项，不让一行坏数据炸掉整表读取） */
function parseFieldOptions(raw: unknown): string[] {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    /* 坏 JSON -> 空候选项 */
  }
  return [];
}

/** 记录 data JSON 解析（坏 JSON 视为空对象） */
function parseRecordData(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* 坏 JSON -> 空对象 */
  }
  return {};
}

export function mapRowToBaseTable(row: Row): BaseTable {
  return {
    id: Number(row.id),
    name: String(row.name),
    description: row.description === null ? null : String(row.description),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapRowToTableField(row: Row): TableField {
  const type = String(row.type) as FieldType;
  if (!isFieldType(type)) {
    throw new Error(`非法字段类型值：${row.type}`);
  }
  return {
    id: Number(row.id),
    tableId: Number(row.table_id),
    name: String(row.name),
    type,
    position: Number(row.position),
    options: parseFieldOptions(row.options),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapRowToTableRecord(row: Row): TableRecord {
  return {
    id: Number(row.id),
    tableId: Number(row.table_id),
    data: parseRecordData(row.data),
    position: Number(row.position),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** 视图 spec 的 JSON 数组解析（坏 JSON 视为空数组，不让一行坏数据炸掉整表读取） */
function parseJsonArray(raw: unknown): unknown[] {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* 坏 JSON -> 空数组 */
  }
  return [];
}

export function mapRowToTableView(row: Row): TableView {
  return {
    id: Number(row.id),
    tableId: Number(row.table_id),
    name: String(row.name),
    filterSpec: parseJsonArray(row.filter_spec) as ViewFilterCondition[],
    sortSpec: parseJsonArray(row.sort_spec) as ViewSortRule[],
    visibleFields: parseJsonArray(row.visible_fields).map((v) => Number(v)),
    position: Number(row.position),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** 文档（r8） */
export function mapRowToDocument(row: Row): Document {
  return {
    id: Number(row.id),
    title: String(row.title),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** 块内容 JSON 解析：坏 JSON 视为空内容，再走 shared 引擎按类型归一/校验（唯一口径） */
function parseBlockContent(raw: unknown, type: BlockType): ReturnType<typeof normalizeBlockContent> {
  let parsed: unknown = {};
  if (typeof raw === "string" && raw !== "") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  return normalizeBlockContent(type, parsed);
}

export function mapRowToDocumentBlock(row: Row): DocumentBlock {
  const type = String(row.type) as BlockType;
  if (!isBlockType(type)) {
    throw new Error(`非法块类型值：${row.type}`);
  }
  return {
    id: Number(row.id),
    documentId: Number(row.document_id),
    type,
    position: Number(row.position),
    content: parseBlockContent(row.content, type),
    parentId: row.parent_id === null ? null : Number(row.parent_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
