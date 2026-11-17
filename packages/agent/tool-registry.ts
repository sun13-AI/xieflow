// XieFlow packages/agent/tool-registry.ts — r10 工具注册表（M5 起步）
//
// 宪法纪律：工具的 name / description / parameters 契约与入参归一全在 packages/shared；
// 本文件只做「注册 → 校验 → 执行 → 回执」装配。**handler 全部调用真实服务层（XieFlowDb）**，
// 不返回 mock/伪造数据；唯一例外是 search_knowledge——任务单明示 M6 前返回空结果占位，
// 且回执显式带 placeholder=true，绝不冒充命中。
import type { XieFlowDb } from "@xieflow/db";
import {
  ValidationError,
  isToolName,
  normalizeToolCallRequest,
  type ToolCallRequest,
  type ToolDefinition,
  type ToolName,
  type ToolResult,
} from "@xieflow/shared";

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

/** 8 个真实服务层 handler（只读 6 个 + 状态变更 2 个） */
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
    description: "知识库语义检索（M6 前的空结果占位，显式 placeholder=true）。",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "检索词" } },
      required: ["query"],
    },
    handler: (_db, args) => {
      const query = requireString(args, "query", "search_knowledge");
      return {
        summary: "知识库检索为 M6 前的空占位，本次命中 0 条",
        data: { query, results: [], placeholder: true },
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

/** 默认注册表：8 个工具，全部接真实服务层 */
export function createDefaultToolRegistry(): ToolRegistry {
  return new ToolRegistry(DEFAULT_TOOLS);
}
