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
  Conversation,
  Message,
  MessageContent,
  ToolCallRecord,
  Artifact,
  ArtifactType,
  KnowledgeDoc,
  KnowledgeChunk,
  KnowledgeSearchChunk,
  Mindmap,
  Whiteboard,
  WhiteboardSummary,
  WhiteboardItem,
  WhiteboardItemType,
  Approval,
  ApprovalStep,
  ApprovalCc,
  ApprovalType,
  ApprovalAction,
  Asset,
  AssetTransaction,
  AssetTxType,
  AssetCategory,
  UnitTask,
  UnitTaskStatus,
  ChangeRecord,
  EntityVersion,
} from "@xieflow/shared";
import type { AuthUser, AuthRole, Session } from "@xieflow/shared/auth";
import { isFieldType, isBlockType, normalizeBlockContent, isKnowledgeSourceType } from "@xieflow/shared";
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

/** r10：conversations（会话元数据，快照字段 camelCase 唯一入口） */
export function mapRowToConversation(row: Row): Conversation {
  return {
    id: Number(row.id),
    title: String(row.title),
    createdAt: String(row.created_at),
  };
}

/** r10：messages.content_json 解析（坏 JSON 视为空文本，不让一行坏数据炸掉整个对话） */
function parseMessageContent(raw: unknown): MessageContent {
  if (typeof raw !== "string" || raw === "") return { text: "" };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      return { ...obj, text: typeof obj.text === "string" ? obj.text : String(obj.text ?? "") };
    }
  } catch {
    /* 坏 JSON -> 空文本 */
  }
  return { text: "" };
}

/** r10：messages.tool_calls_json 解析为逐条工具回执数组 */
function parseToolCalls(raw: unknown): ToolCallRecord[] {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (x): x is ToolCallRecord =>
          x !== null && typeof x === "object" && typeof (x as ToolCallRecord).name === "string",
      );
    }
  } catch {
    /* 坏 JSON -> 空数组 */
  }
  return [];
}

export function mapRowToMessage(row: Row): Message {
  return {
    id: Number(row.id),
    conversationId: Number(row.conversation_id),
    role: String(row.role) as Message["role"],
    content: parseMessageContent(row.content_json),
    toolCalls: parseToolCalls(row.tool_calls_json),
    createdAt: String(row.created_at),
  };
}

/** r12：knowledge_docs（source_type 走 shared 唯一守卫，camelCase 快照唯一入口） */
export function mapRowToKnowledgeDoc(row: Row): KnowledgeDoc {
  const sourceType = String(row.source_type);
  if (!isKnowledgeSourceType(sourceType)) {
    throw new Error(`非法知识来源类型值：${row.source_type}`);
  }
  return {
    id: Number(row.id),
    title: String(row.title),
    sourceType,
    sourceId: row.source_id === null ? null : Number(row.source_id),
    content: String(row.content),
    chunkCount: Number(row.chunk_count),
    createdAt: String(row.created_at),
  };
}

/** r12：knowledge_chunks（vector 列可空，embedding 留位；快照不暴露 vector） */
export function mapRowToKnowledgeChunk(row: Row): KnowledgeChunk {
  return {
    id: Number(row.id),
    docId: Number(row.doc_id),
    position: Number(row.position),
    content: String(row.content),
    tokenCount: Number(row.token_count),
  };
}

/** r12：检索源块 = chunk JOIN 文档来源字段（agent searchChunks 的纯函数入口） */
export function mapRowToKnowledgeSearchChunk(row: Row): KnowledgeSearchChunk {
  const sourceType = String(row.source_type);
  if (!isKnowledgeSourceType(sourceType)) {
    throw new Error(`非法知识来源类型值：${row.source_type}`);
  }
  return {
    id: Number(row.id),
    docId: Number(row.doc_id),
    position: Number(row.position),
    content: String(row.content),
    docTitle: String(row.doc_title),
    sourceType,
    sourceId: row.source_id === null ? null : Number(row.source_id),
  };
}

/** r10：artifacts（产物正文按原文存，UI 直接读 content 展示） */
export function mapRowToArtifact(row: Row): Artifact {
  return {
    id: Number(row.id),
    conversationId: Number(row.conversation_id),
    type: String(row.type) as ArtifactType,
    title: String(row.title),
    content: String(row.content),
    createdAt: String(row.created_at),
  };
}

/** r14：mindmaps（Markdown 源逐字存，树由 shared 解析不落库） */
export function mapRowToMindmap(row: Row): Mindmap {
  return {
    id: Number(row.id),
    title: String(row.title),
    contentMarkdown: String(row.content_markdown),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** r15：whiteboards / whiteboard_items（布局/避让规则全在 shared，这里只做 snake→camel 映射） */
export function mapRowToWhiteboard(row: Row): Whiteboard {
  return {
    id: Number(row.id),
    title: String(row.title),
    createdAt: String(row.created_at),
  };
}

export function mapRowToWhiteboardSummary(row: Row): WhiteboardSummary {
  return { ...mapRowToWhiteboard(row), itemCount: Number(row.item_count) };
}

export function mapRowToWhiteboardItem(row: Row): WhiteboardItem {
  return {
    id: Number(row.id),
    boardId: Number(row.board_id),
    type: String(row.type) as WhiteboardItemType,
    x: Number(row.x),
    y: Number(row.y),
    w: Number(row.w),
    h: Number(row.h),
    content: String(row.content),
    color: String(row.color),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** r16：approvals / approval_steps / approval_cc（流转规则全在 shared，这里只做 snake→camel 映射） */
export function mapRowToApproval(row: Row): Approval {
  return {
    id: Number(row.id),
    title: String(row.title),
    type: String(row.type) as ApprovalType,
    applicantId: String(row.applicant_id),
    status: String(row.status) as Approval["status"],
    currentAssignee: String(row.current_assignee),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapRowToApprovalStep(row: Row): ApprovalStep {
  return {
    id: Number(row.id),
    approvalId: Number(row.approval_id),
    order: Number(row.order),
    assignee: String(row.assignee),
    action: String(row.action) as ApprovalAction,
    comment: String(row.comment),
    actedAt: String(row.acted_at),
  };
}

export function mapRowToApprovalCc(row: Row): ApprovalCc {
  return {
    id: Number(row.id),
    approvalId: Number(row.approval_id),
    ccUser: String(row.cc_user),
    createdAt: String(row.created_at),
  };
}

export function mapRowToAsset(row: Row): Asset {
  return {
    id: Number(row.id),
    name: String(row.name),
    category: String(row.category) as AssetCategory,
    quantity: Number(row.quantity),
    unit: String(row.unit),
    location: String(row.location),
    custodian: String(row.custodian),
    createdAt: String(row.created_at),
  };
}

export function mapRowToAssetTransaction(row: Row): AssetTransaction {
  return {
    id: Number(row.id),
    assetId: Number(row.asset_id),
    type: String(row.type) as AssetTxType,
    quantity: Number(row.quantity),
    from: String(row.from ?? ""),
    to: String(row.to ?? ""),
    operator: String(row.operator),
    createdAt: String(row.created_at),
  };
}

export function mapRowToUnitTask(row: Row): UnitTask {
  return {
    id: Number(row.id),
    title: String(row.title),
    assigneeUnit: String(row.assignee_unit),
    status: String(row.status) as UnitTaskStatus,
    dueDate: row.due_date === null || row.due_date === undefined ? null : String(row.due_date),
    parentId: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
  };
}

/** v14 users 行 → 对外用户对象（password_hash 永不出 mappers） */
export function mapRowToAuthUser(row: Row): AuthUser {
  return {
    id: Number(row.id),
    username: String(row.username),
    role: String(row.role) as AuthRole,
    createdAt: String(row.created_at),
  };
}

/** v14 sessions 行 → 会话对象 */
export function mapRowToSession(row: Row): Session {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    token: String(row.token),
    expiresAt: String(row.expires_at),
  };
}

/** v15 change_log 行 → 变更记录（payload JSON 解析，user_id 可空） */
export function mapRowToChangeRecord(row: Row): ChangeRecord {
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(String(row.payload ?? "{}"));
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    payload = {};
  }
  return {
    id: Number(row.id),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    operation: String(row.operation) as ChangeRecord["operation"],
    payload,
    userId: row.user_id === null || row.user_id === undefined ? null : Number(row.user_id),
    createdAt: String(row.created_at),
    version: Number(row.version),
  };
}

/** v15 entity_versions 行 → 实体版本摘要 */
export function mapRowToEntityVersion(row: Row): EntityVersion {
  return {
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    version: Number(row.version),
    updatedAt: String(row.updated_at),
  };
}
