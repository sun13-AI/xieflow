// XieFlow packages/agent/tool-registry.ts — r10 工具注册表（M5 起步）
//
// 宪法纪律：工具的 name / description / parameters 契约与入参归一全在 packages/shared；
// 本文件只做「注册 → 校验 → 执行 → 回执」装配。**handler 全部调用真实服务层（XieFlowDb）**，
// 不返回 mock/伪造数据；search_knowledge 自 r12 起改为真检索（TF-IDF 纯本地算法），
// 检索算法本身集中在 ./knowledge.ts，handler 只做取数 + 调纯函数 + 组装带来源引用的回执。
import type { XieFlowDb } from "@xieflow/db";
import {
  ValidationError,
  isToolName,
  normalizeToolCallRequest,
  assembleDocumentText,
  blocksToMarkdown,
  assertValidScheduleDate,
  assertValidScheduleRange,
  assertValidScheduleRepeat,
  type ScheduleRepeat,
  type ToolCallRequest,
  type ToolDefinition,
  type ToolName,
  type ToolResult,
} from "@xieflow/shared";
import { searchChunks } from "./knowledge.js";

/** handler 回执：人类可读摘要 + 真实数据（数据原样交给 api 落库/产物预览） */
export interface ToolHandlerResult {
  readonly summary: string;
  readonly data: unknown;
}

export type ToolHandler = (
  db: XieFlowDb,
  args: Record<string, unknown>,
) => ToolHandlerResult | Promise<ToolHandlerResult>;

export interface RegisteredTool extends ToolDefinition {
  readonly handler: ToolHandler;
}

function requireString(args: Record<string, unknown>, key: string, label: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${label}：${key} 必须是非空字符串`);
  }
  return value.trim();
}

function optionalString(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ValidationError(`${key} 必须是字符串或 null`);
  return value;
}

function requirePositiveInt(args: Record<string, unknown>, key: string, label: string): number {
  const value = args[key];
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`${label}：${key} 必须是正整数`);
  return n;
}

/** 12 个真实服务层 handler（只读 9 个 + 状态变更 3 个；search_knowledge 真检索不占位） */
const DEFAULT_TOOLS: readonly RegisteredTool[] = [
  {
    name: "list_todos",
    description: "列出全部待办（含状态与象限），只读服务层查询。",
    parameters: { type: "object", properties: {}, required: [] },
    handler: (db) => {
      const todos = db.listTodos();
      return { summary: `待办 ${todos.length} 条`, data: { todos, count: todos.length } };
    },
  },
  {
    name: "create_todo",
    description: "新建一条待办并真实落库（状态变更类工具）。",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "待办标题" },
        quadrant: { type: "string", description: "象限 q1~q4", enum: ["q1", "q2", "q3", "q4"] },
        dueDate: { type: "string", description: "可选截止日 YYYY-MM-DD" },
      },
      required: ["title", "quadrant"],
    },
    handler: (db, args) => {
      const title = requireString(args, "title", "create_todo");
      const quadrant = String(args.quadrant ?? "");
      if (!["q1", "q2", "q3", "q4"].includes(quadrant)) {
        throw new ValidationError(`非法象限：${quadrant}`);
      }
      const todo = db.createTodo(title, quadrant, optionalString(args, "dueDate"));
      return { summary: `已创建待办「${title}」（#${todo.id}）`, data: { todo } };
    },
  },
  {
    name: "list_documents",
    description: "列出全部文档（标题与修改时间），只读服务层查询。",
    parameters: { type: "object", properties: {}, required: [] },
    handler: (db) => {
      const documents = db.listDocuments();
      return { summary: `文档 ${documents.length} 篇`, data: { documents, count: documents.length } };
    },
  },
  {
    name: "create_document",
    description: "新建一篇文档并真实落库（自动带默认首块，状态变更类工具）。",
    parameters: {
      type: "object",
      properties: { title: { type: "string", description: "文档标题" } },
      required: ["title"],
    },
    handler: (db, args) => {
      const title = requireString(args, "title", "create_document");
      const document = db.createDocument(title);
      return {
        summary: `已创建文档「${title}」（#${document.id}，含默认首块）`,
        data: { document },
      };
    },
  },
  {
    name: "list_projects",
    description: "列出全部项目，只读服务层查询。",
    parameters: { type: "object", properties: {}, required: [] },
    handler: (db) => {
      const projects = db.listProjects();
      return { summary: `项目 ${projects.length} 个`, data: { projects, count: projects.length } };
    },
  },
  {
    name: "list_cards",
    description: "列出看板卡片；给 projectId 只查该项目，不给则聚合全部项目。",
    parameters: {
      type: "object",
      properties: { projectId: { type: "number", description: "可选项目 id" } },
      required: [],
    },
    handler: (db, args) => {
      const raw = args.projectId;
      if (raw !== undefined && raw !== null) {
        const projectId = Number(raw);
        if (!Number.isInteger(projectId) || projectId <= 0) {
          throw new ValidationError(`非法 projectId：${String(raw)}`);
        }
        if (db.getProject(projectId) === null) {
          throw new ValidationError(`项目不存在：${projectId}`);
        }
        const cards = db.listBoardCardsByProject(projectId);
        return { summary: `项目 ${projectId} 卡片 ${cards.length} 张`, data: { cards, count: cards.length } };
      }
      const cards = db.listProjects().flatMap((p) => db.listBoardCardsByProject(p.id));
      return { summary: `看板卡片 ${cards.length} 张`, data: { cards, count: cards.length } };
    },
  },
  {
    name: "list_tables",
    description: "列出全部多维表格，只读服务层查询。",
    parameters: { type: "object", properties: {}, required: [] },
    handler: (db) => {
      const tables = db.listTables();
      return { summary: `多维表格 ${tables.length} 张`, data: { tables, count: tables.length } };
    },
  },
  {
    name: "search_knowledge",
    description: "知识库检索（本地 TF-IDF）：返回带 doc_id / chunk_id 来源引用的命中。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "检索词" },
        limit: { type: "number", description: "最多返回条数（可选）" },
      },
      required: ["query"],
    },
    handler: (db, args) => {
      const query = requireString(args, "query", "search_knowledge");
      const limitRaw = args.limit;
      let limit = 5;
      if (limitRaw !== undefined && limitRaw !== null) {
        const n = typeof limitRaw === "number" ? limitRaw : Number(limitRaw);
        if (!Number.isInteger(n) || n <= 0) throw new ValidationError("search_knowledge：limit 必须是正整数");
        limit = n;
      }
      const results = searchChunks(query, db.listKnowledgeChunksForSearch(), limit);
      return {
        summary: results.length === 0 ? `知识库「${query}」命中 0 条` : `知识库「${query}」命中 ${results.length} 条（ sourced from ${[...new Set(results.map((r) => r.docId))].join(", ")}）`,
        data: { query, results, count: results.length },
      };
    },
  },
  {
    name: "summarize_document",
    description: "读取真实文档的块并给出标题/块数/字数摘要（只读服务层查询）。",
    parameters: {
      type: "object",
      properties: { documentId: { type: "number", description: "文档 id" } },
      required: ["documentId"],
    },
    handler: (db, args) => {
      const documentId = requirePositiveInt(args, "documentId", "summarize_document");
      const doc = db.getDocument(documentId);
      if (doc === null) throw new ValidationError(`文档不存在：${documentId}`);
      const blocks = db.listBlocks(documentId);
      const text = assembleDocumentText(blocks);
      return {
        summary: `文档「${doc.title}」共 ${blocks.length} 块 / ${text.length} 字`,
        data: { documentId, title: doc.title, blockCount: blocks.length, chars: text.length, preview: text.slice(0, 200) },
      };
    },
  },
  {
    name: "export_document_md",
    description: "按 shared blocksToMarkdown 导出真实文档 Markdown（只读，不改库）。",
    parameters: {
      type: "object",
      properties: { documentId: { type: "number", description: "文档 id" } },
      required: ["documentId"],
    },
    handler: (db, args) => {
      const documentId = requirePositiveInt(args, "documentId", "export_document_md");
      const doc = db.getDocument(documentId);
      if (doc === null) throw new ValidationError(`文档不存在：${documentId}`);
      const markdown = blocksToMarkdown(db.listBlocks(documentId));
      return {
        summary: `已导出文档「${doc.title}」的 Markdown（${markdown.length} 字符）`,
        data: { documentId, title: doc.title, markdown },
      };
    },
  },
  {
    name: "list_schedules",
    description: "列出日程；给 from/to 则按日期区间读真实服务层，否则聚合全部。",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "可选起始日 YYYY-MM-DD" },
        to: { type: "string", description: "可选结束日 YYYY-MM-DD" },
      },
      required: [],
    },
    handler: (db, args) => {
      const from = optionalString(args, "from");
      const to = optionalString(args, "to");
      if ((from === null) !== (to === null)) throw new ValidationError("list_schedules：from 与 to 必须同时提供");
      const schedules = from !== null && to !== null ? db.listSchedulesByDateRange(from, to) : db.listSchedules();
      return { summary: `日程 ${schedules.length} 条`, data: { schedules, count: schedules.length } };
    },
  },
  {
    name: "create_schedule",
    description: "新建一条日程并真实落库（状态变更类工具，复用 shared 日程守卫）。",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "日程标题" },
        date: { type: "string", description: "日期 YYYY-MM-DD" },
        start: { type: "string", description: "开始 HH:mm" },
        end: { type: "string", description: "结束 HH:mm" },
        repeat: { type: "string", description: "重复规则", enum: ["none", "daily", "weekly", "monthly"] },
      },
      required: ["title", "date", "start", "end"],
    },
    handler: (db, args) => {
      const title = requireString(args, "title", "create_schedule");
      const date = requireString(args, "date", "create_schedule");
      const start = requireString(args, "start", "create_schedule");
      const end = requireString(args, "end", "create_schedule");
      assertValidScheduleDate(date);
      assertValidScheduleRange(start, end);
      const repeatRaw = optionalString(args, "repeat") ?? "none";
      assertValidScheduleRepeat(repeatRaw);
      const schedule = db.createSchedule(title, date, start, end, null, repeatRaw as ScheduleRepeat);
      return {
        summary: `已创建日程「${title}」（#${schedule.id}，${date} ${start}-${end}）`,
        data: { schedule },
      };
    },
  },
];

/** JSON-schema 子集校验：必填项 + 类型 + enum；未知参数忽略（向后兼容） */
function assertValidArguments(def: ToolDefinition, args: Record<string, unknown>): void {
  for (const key of def.parameters.required) {
    if (!(key in args) || args[key] === "" || args[key] === null) {
      throw new ValidationError(`工具 ${def.name} 缺少必填参数：${key}`);
    }
  }
  for (const [key, spec] of Object.entries(def.parameters.properties)) {
    if (!(key in args)) continue;
    const value = args[key];
    if (spec.type === "string" && typeof value !== "string") {
      throw new ValidationError(`工具 ${def.name} 参数 ${key} 必须是字符串`);
    }
    if (spec.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new ValidationError(`工具 ${def.name} 参数 ${key} 必须是数值`);
    }
    if (spec.enum && !spec.enum.includes(String(value))) {
      throw new ValidationError(`工具 ${def.name} 参数 ${key} 取值非法：${String(value)}`);
    }
  }
}

/**
 * 工具注册表：同名注册拒绝；get/list 只暴露契约（handler 不外泄）；
 * execute 先统一归一入参（未知工具/非法参数 → ValidationError → HTTP 400），再调真实 handler。
 * handler 自身运行错误转成 ok=false 回执（让一次对话不至于整条 500），但绝不伪造成功数据。
 */
export class ToolRegistry {
  private readonly tools = new Map<ToolName, RegisteredTool>();

  constructor(tools: readonly RegisteredTool[] = []) {
    for (const tool of tools) this.register(tool);
  }

  register(def: RegisteredTool): void {
    if (!isToolName(def.name)) throw new ValidationError(`未知工具：${String(def.name)}`);
    if (this.tools.has(def.name)) throw new ValidationError(`工具重复注册：${def.name}`);
    this.tools.set(def.name, def);
  }

  get(name: unknown): RegisteredTool | undefined {
    return isToolName(name) ? this.tools.get(name) : undefined;
  }

  /** 对 UI / eval 暴露契约清单（不含 handler 函数，避免序列化爆炸） */
  list(): ToolDefinition[] {
    return [...this.tools.values()].map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));
  }

  /**
   * r47：只校验不执行（闸门零半态）：未知工具 / 非法参数在此抛 ValidationError → HTTP 400。
   * gated 模式下 pending 调用不进 handler，但入参必须先过同一校验，否则 4xx 探针会漏检。
   */
  validateCall(name: unknown, args: unknown): void {
    const call: ToolCallRequest = normalizeToolCallRequest({ name, arguments: args ?? {} });
    const def = this.tools.get(call.name);
    if (!def) throw new ValidationError(`工具未注册：${call.name}`);
    assertValidArguments(def, call.arguments);
  }

  async execute(db: XieFlowDb, name: unknown, args: unknown): Promise<ToolResult> {
    const call: ToolCallRequest = normalizeToolCallRequest({ name, arguments: args ?? {} });
    const def = this.tools.get(call.name);
    if (!def) throw new ValidationError(`工具未注册：${call.name}`);
    assertValidArguments(def, call.arguments);
    try {
      const result = await def.handler(db, call.arguments);
      return { ok: true, name: call.name, summary: result.summary, data: result.data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, name: call.name, summary: `工具执行失败：${message}`, data: null, error: message };
    }
  }
}

/** 默认注册表：12 个工具（r10 八工具 + r11 四工具），全部接真实服务层 */
export function createDefaultToolRegistry(): ToolRegistry {
  return new ToolRegistry(DEFAULT_TOOLS);
}
