// XieFlow packages/agent/evals/tool-replay.ts — r10 工具调用录制回放 + r11 多轮上下文扩充
//
// 宪法第四条：「agent 工具调用行为（M5 起）用录制回放评测集锁定」。
// 每条用例 = 一句用户消息（可带上一轮上下文）+ 期望的意图 / 工具调用序列 / 回执 ok / 产物类型 / 真实落库状态。
// runToolReplay 在**全新的内存库**上真执行 handler（含 create_todo / create_schedule 实际创建），再逐字段比对：
// 期望写错、规划漂移、handler 不真写库、指代消解失效四者任一发生都会进 failures，评测集不会退化成恒真占位。
import { openDatabase, type XieFlowDb } from "@xieflow/db";
import {
  RAG_NO_HIT_ANSWER,
  type ArtifactType,
  type PlannerContextMessage,
  type ToolName,
  type ToolCallRequest,
} from "@xieflow/shared";
import { executeChat, mockPlanner, type Planner } from "../mock-planner.js";
import { chunkText } from "../knowledge.js";
import type { ToolRegistry } from "../tool-registry.js";

export interface RecordedToolCase {
  readonly name: string;
  readonly message: string;
  readonly expected: {
    readonly intent: string;
    readonly toolCalls: readonly ToolCallRequest[];
    readonly okFlags: readonly boolean[];
    readonly summary?: string;
    readonly artifactType?: ArtifactType;
    readonly resolution?: { readonly referenceKind: string; readonly referencedTitle: string };
    /** r13：RAG 回答预期（命中数 / 无命中诚实答复 / 引用可溯源） */
    readonly rag?: { readonly noHit: boolean; readonly citationCount: number; readonly answerIncludes?: string };
  };
  /** 多轮上下文：上一轮真实落库消息归一后的轻量上下文 */
  readonly context?: readonly PlannerContextMessage[];
  /** 需要文档存在时：先在全新内存库里真建一篇（id=1，消息里「文档 1」即可命中） */
  readonly seedDocument?: string;
  /** r13：RAG 用例先在全新内存库里真入库知识文档（真实分块，非伪造） */
  readonly seedKnowledge?: readonly { readonly title: string; readonly content: string }[];
  /** 状态变更类工具必须带：回放后在真实库里查回的标题清单 */
  readonly expectState?: {
    readonly todos?: readonly string[];
    readonly documents?: readonly string[];
    readonly schedules?: readonly string[];
  };
}

export const TOOL_EVAL_CASES: readonly RecordedToolCase[] = [
  {
    name: "todos-empty",
    message: "列出所有待办",
    expected: {
      intent: "list_todos",
      toolCalls: [{ name: "list_todos", arguments: {} }],
      okFlags: [true],
      summary: "已完成「list_todos」：共 1 次工具调用。\n1. list_todos：待办 0 条",
    },
  },
  {
    name: "documents-empty",
    message: "列出文档",
    expected: { intent: "list_documents", toolCalls: [{ name: "list_documents", arguments: {} }], okFlags: [true] },
  },
  {
    name: "projects-empty",
    message: "列出项目",
    expected: { intent: "list_projects", toolCalls: [{ name: "list_projects", arguments: {} }], okFlags: [true] },
  },
  {
    name: "tables-empty",
    message: "列出表格",
    expected: { intent: "list_tables", toolCalls: [{ name: "list_tables", arguments: {} }], okFlags: [true] },
  },
  {
    name: "cards-empty",
    message: "列出看板卡片",
    expected: { intent: "list_cards", toolCalls: [{ name: "list_cards", arguments: {} }], okFlags: [true] },
  },
  {
    name: "knowledge-placeholder",
    message: "检索知识库",
    expected: {
      intent: "search_knowledge",
      toolCalls: [{ name: "search_knowledge", arguments: { query: "检索知识库" } }],
      okFlags: [true],
    },
  },
  {
    name: "create-todo-q2-default",
    message: "新建待办：写周报",
    expected: {
      intent: "create_todo+list_todos",
      toolCalls: [
        { name: "create_todo", arguments: { title: "写周报", quadrant: "q2" } },
        { name: "list_todos", arguments: {} },
      ],
      okFlags: [true, true],
    },
    expectState: { todos: ["写周报"] },
  },
  {
    name: "create-todo-q1",
    message: "创建待办 q1：修复线上问题",
    expected: {
      intent: "create_todo+list_todos",
      toolCalls: [
        { name: "create_todo", arguments: { title: "修复线上问题", quadrant: "q1" } },
        { name: "list_todos", arguments: {} },
      ],
      okFlags: [true, true],
    },
    expectState: { todos: ["修复线上问题"] },
  },
  {
    name: "create-todo-q3",
    message: "加个待办 q3：整理资料",
    expected: {
      intent: "create_todo+list_todos",
      toolCalls: [
        { name: "create_todo", arguments: { title: "整理资料", quadrant: "q3" } },
        { name: "list_todos", arguments: {} },
      ],
      okFlags: [true, true],
    },
    expectState: { todos: ["整理资料"] },
  },
  {
    name: "create-todo-q4",
    message: "添加待办 q4：预约体检",
    expected: {
      intent: "create_todo+list_todos",
      toolCalls: [
        { name: "create_todo", arguments: { title: "预约体检", quadrant: "q4" } },
        { name: "list_todos", arguments: {} },
      ],
      okFlags: [true, true],
    },
    expectState: { todos: ["预约体检"] },
  },
  {
    name: "create-document-with-first-block",
    message: "新建文档：回放用例",
    expected: {
      intent: "create_document+list_documents",
      toolCalls: [
        { name: "create_document", arguments: { title: "回放用例" } },
        { name: "list_documents", arguments: {} },
      ],
      okFlags: [true, true],
    },
    expectState: { documents: ["回放用例"] },
  },
  {
    name: "overview-three-lists",
    message: "列出待办、文档和项目",
    expected: {
      intent: "list_todos+list_documents+list_projects",
      toolCalls: [
        { name: "list_todos", arguments: {} },
        { name: "list_documents", arguments: {} },
        { name: "list_projects", arguments: {} },
      ],
      okFlags: [true, true, true],
    },
  },
  {
    name: "board-and-tables",
    message: "看板和多维表格",
    expected: {
      intent: "list_cards+list_tables",
      toolCalls: [
        { name: "list_cards", arguments: {} },
        { name: "list_tables", arguments: {} },
      ],
      okFlags: [true, true],
    },
  },
  {
    name: "create-and-list-documents",
    message: "新建待办：联调，然后列出文档",
    expected: {
      intent: "create_todo+list_todos+list_documents",
      toolCalls: [
        { name: "create_todo", arguments: { title: "联调", quadrant: "q2" } },
        { name: "list_todos", arguments: {} },
        { name: "list_documents", arguments: {} },
      ],
      okFlags: [true, true, true],
    },
    expectState: { todos: ["联调"] },
  },
  {
    name: "no-intent-empty-plan",
    message: "你好",
    expected: {
      intent: "empty",
      toolCalls: [],
      okFlags: [],
      summary: "已完成「empty」：共 0 次工具调用。",
    },
  },
  {
    name: "knowledge-and-todos",
    message: "检索知识库并列待办",
    expected: {
      intent: "list_todos+search_knowledge",
      toolCalls: [
        { name: "list_todos", arguments: {} },
        { name: "search_knowledge", arguments: { query: "检索知识库并列待办" } },
      ],
      okFlags: [true, true],
    },
  },
  {
    name: "create-document-and-tables",
    message: "创建文档：方案，并列出表格",
    expected: {
      intent: "create_document+list_documents+list_tables",
      toolCalls: [
        { name: "create_document", arguments: { title: "方案" } },
        { name: "list_documents", arguments: {} },
        { name: "list_tables", arguments: {} },
      ],
      okFlags: [true, true, true],
    },
    expectState: { documents: ["方案"] },
  },

  // ---- r11 新增 10 条：4 个新工具 + 3 条多轮指代 + 3 类产物生成 ----
  {
    name: "r11-summarize-document",
    message: "总结文档 1",
    seedDocument: "回放摘要文档",
    expected: {
      intent: "summarize_document+list_documents",
      toolCalls: [
        { name: "summarize_document", arguments: { documentId: 1 } },
        { name: "list_documents", arguments: {} },
      ],
      okFlags: [true, true],
    },
    expectState: { documents: ["回放摘要文档"] },
  },
  {
    name: "r11-export-document-md",
    message: "导出文档 1 为 Markdown",
    seedDocument: "回放导出文档",
    expected: {
      intent: "export_document_md+list_documents",
      toolCalls: [
        { name: "export_document_md", arguments: { documentId: 1 } },
        { name: "list_documents", arguments: {} },
      ],
      okFlags: [true, true],
    },
    expectState: { documents: ["回放导出文档"] },
  },
  {
    name: "r11-list-schedules-empty",
    message: "列出日程",
    expected: {
      intent: "list_schedules",
      toolCalls: [{ name: "list_schedules", arguments: {} }],
      okFlags: [true],
    },
  },
  {
    name: "r11-create-schedule-real",
    message: "新建日程：回放评审 2026-11-20 10:00-11:00",
    expected: {
      intent: "create_schedule+list_schedules",
      toolCalls: [
        { name: "create_schedule", arguments: { title: "回放评审", date: "2026-11-20", start: "10:00", end: "11:00" } },
        { name: "list_schedules", arguments: {} },
      ],
      okFlags: [true, true],
    },
    expectState: { schedules: ["回放评审"] },
  },
  {
    name: "r11-context-repeat-todo",
    message: "再建一个",
    context: [{ role: "user", text: "新建待办：写周报" }],
    expected: {
      intent: "create_todo+list_todos",
      toolCalls: [
        { name: "create_todo", arguments: { title: "写周报（再建）", quadrant: "q2" } },
        { name: "list_todos", arguments: {} },
      ],
      okFlags: [true, true],
      resolution: { referenceKind: "repeat", referencedTitle: "写周报" },
    },
    expectState: { todos: ["写周报（再建）"] },
  },
  {
    name: "r11-context-retitle-todo",
    message: "把它改成：季度周报",
    context: [{ role: "user", text: "新建待办：写周报" }],
    expected: {
      intent: "create_todo+list_todos",
      toolCalls: [
        { name: "create_todo", arguments: { title: "季度周报", quadrant: "q2" } },
        { name: "list_todos", arguments: {} },
      ],
      okFlags: [true, true],
      resolution: { referenceKind: "retitle", referencedTitle: "写周报" },
    },
    expectState: { todos: ["季度周报"] },
  },
  {
    name: "r11-context-repeat-document",
    message: "再建一个",
    context: [{ role: "user", text: "新建文档：设计方案" }],
    expected: {
      intent: "create_document+list_documents",
      toolCalls: [
        { name: "create_document", arguments: { title: "设计方案（再建）" } },
        { name: "list_documents", arguments: {} },
      ],
      okFlags: [true, true],
      resolution: { referenceKind: "repeat", referencedTitle: "设计方案" },
    },
    expectState: { documents: ["设计方案（再建）"] },
  },
  {
    name: "r11-artifact-html",
    message: "盘点待办",
    expected: {
      intent: "list_todos",
      toolCalls: [{ name: "list_todos", arguments: {} }],
      okFlags: [true],
      artifactType: "html-report",
    },
  },
  {
    name: "r11-artifact-markdown",
    message: "盘点待办",
    expected: {
      intent: "list_todos",
      toolCalls: [{ name: "list_todos", arguments: {} }],
      okFlags: [true],
      artifactType: "markdown-table",
    },
  },
  {
    name: "r11-artifact-json",
    message: "盘点待办",
    expected: {
      intent: "list_todos",
      toolCalls: [{ name: "list_todos", arguments: {} }],
      okFlags: [true],
      artifactType: "json-data",
    },
  },
];

/**
 * r13 录制回放评测集（11 条）：「根据知识库 / 查资料 / 文档里」类问答先真检索、
 * 再注入引用回答；含命中与无命中两态，每条都核对引用数、回答标记与 chunk 可溯源。
 */
export const RAG_EVAL_CASES: readonly RecordedToolCase[] = [
  {
    name: "rag-genju-kb-hit",
    message: "根据知识库，苹果 手机",
    seedKnowledge: [{ title: "回放科技稿", content: "苹果 手机 手机 平板" }],
    expected: {
      intent: "search_knowledge",
      toolCalls: [{ name: "search_knowledge", arguments: { query: "苹果 手机" } }],
      okFlags: [true],
      rag: { noHit: false, citationCount: 1, answerIncludes: "[1]" },
    },
  },
  {
    name: "rag-cha-ziliao",
    message: "查资料：番茄",
    seedKnowledge: [{ title: "回放菜谱稿", content: "番茄 炒蛋 步骤" }],
    expected: {
      intent: "search_knowledge",
      toolCalls: [{ name: "search_knowledge", arguments: { query: "番茄" } }],
      okFlags: [true],
      rag: { noHit: false, citationCount: 1, answerIncludes: "回放菜谱稿" },
    },
  },
  {
    name: "rag-wendang-li",
    message: "文档里有香蕉吗",
    seedKnowledge: [{ title: "回放水果稿", content: "苹果 香蕉 水果" }],
    expected: {
      intent: "search_knowledge",
      toolCalls: [{ name: "search_knowledge", arguments: { query: "有香蕉吗" } }],
      okFlags: [true],
      rag: { noHit: false, citationCount: 1, answerIncludes: "香蕉" },
    },
  },
  {
    name: "rag-cong-kb",
    message: "从知识库回答：平板",
    seedKnowledge: [{ title: "回放设备稿", content: "苹果 手机 平板" }],
    expected: {
      intent: "search_knowledge",
      toolCalls: [{ name: "search_knowledge", arguments: { query: "平板" } }],
      okFlags: [true],
      rag: { noHit: false, citationCount: 1, answerIncludes: "平板" },
    },
  },
  {
    name: "rag-kb-li-no-hit",
    message: "知识库里有什么",
    seedKnowledge: [{ title: "回放说明稿", content: "协流 知识库 检索 演示" }],
    expected: {
      intent: "search_knowledge",
      toolCalls: [{ name: "search_knowledge", arguments: { query: "有什么" } }],
      okFlags: [true],
      rag: { noHit: true, citationCount: 0, answerIncludes: RAG_NO_HIT_ANSWER },
    },
  },
  {
    name: "rag-empty-kb-no-hit",
    message: "根据知识库，机器人",
    expected: {
      intent: "search_knowledge",
      toolCalls: [{ name: "search_knowledge", arguments: { query: "机器人" } }],
      okFlags: [true],
      rag: { noHit: true, citationCount: 0, answerIncludes: RAG_NO_HIT_ANSWER },
    },
  },
  {
    name: "rag-two-docs-ranking",
    message: "根据知识库，苹果",
    seedKnowledge: [
      { title: "回放科技稿", content: "苹果 苹果 手机 平板" },
      { title: "回放水果稿", content: "苹果 香蕉 水果" },
    ],
    expected: {
      intent: "search_knowledge",
      toolCalls: [{ name: "search_knowledge", arguments: { query: "苹果" } }],
      okFlags: [true],
      rag: { noHit: false, citationCount: 2, answerIncludes: "[1]" },
    },
  },
  {
    name: "rag-genju-wendang",
    message: "根据文档，手机",
    seedKnowledge: [{ title: "回放参数稿", content: "手机 参数 说明" }],
    expected: {
      intent: "search_knowledge",
      toolCalls: [{ name: "search_knowledge", arguments: { query: "手机" } }],
      okFlags: [true],
      rag: { noHit: false, citationCount: 1, answerIncludes: "回放参数稿" },
    },
  },
  {
    name: "rag-cankao-kb",
    message: "参考知识库，香蕉",
    seedKnowledge: [{ title: "回放果品稿", content: "香蕉 水果 苹果" }],
    expected: {
      intent: "search_knowledge",
      toolCalls: [{ name: "search_knowledge", arguments: { query: "香蕉" } }],
      okFlags: [true],
      rag: { noHit: false, citationCount: 1, answerIncludes: "香蕉" },
    },
  },
  {
    name: "rag-shuoyixia-prefix",
    message: "根据知识库，说一下平板",
    seedKnowledge: [{ title: "回放终端稿", content: "平板 电脑 屏幕" }],
    expected: {
      intent: "search_knowledge",
      toolCalls: [{ name: "search_knowledge", arguments: { query: "平板" } }],
      okFlags: [true],
      rag: { noHit: false, citationCount: 1, answerIncludes: "[1]" },
    },
  },
  {
    name: "rag-snippet-traceable",
    message: "查资料：配置",
    seedKnowledge: [{ title: "回放配置稿", content: "配置 手册 步骤 参数" }],
    expected: {
      intent: "search_knowledge",
      toolCalls: [{ name: "search_knowledge", arguments: { query: "配置" } }],
      okFlags: [true],
      rag: { noHit: false, citationCount: 1, answerIncludes: "配置 手册" },
    },
  },
];

export interface ToolReplayResult {
  readonly total: number;
  readonly passed: number;
  readonly failures: string[];
}

/** 默认工厂：每条用例一个全新内存库（状态断言互不污染） */
export function freshReplayDb(): XieFlowDb {
  return openDatabase({ path: ":memory:" });
}

/**
 * 回放：真跑 planner + registry + 真实 db，逐字段比对录制期望，并核对状态变更类工具真写库。
 * 非恒真：期望写错 / 规划漂移 / handler 不真执行 / 指代消解失效，都会进 failures。
 */
export async function runToolReplay(
  makeDb: () => XieFlowDb,
  registry: ToolRegistry,
  cases: readonly RecordedToolCase[] = TOOL_EVAL_CASES,
  planner: Planner = mockPlanner,
): Promise<ToolReplayResult> {
  const failures: string[] = [];
  let passed = 0;
  for (const c of cases) {
    const db = makeDb();
    try {
      if (c.seedDocument !== undefined) db.createDocument(c.seedDocument);
      for (const k of c.seedKnowledge ?? []) {
        db.createKnowledgeDoc({
          title: k.title,
          sourceType: "text",
          sourceId: null,
          content: k.content,
          chunks: chunkText(k.content),
        });
      }
      const exec = await executeChat(db, registry, planner, c.message, {
        context: c.context,
        artifactType: c.expected.artifactType,
      });
      const problems: string[] = [];
      if (exec.intent !== c.expected.intent) {
        problems.push(`intent got ${exec.intent} want ${c.expected.intent}`);
      }
      const actualCalls = exec.toolCalls.map((t) => ({ name: t.name as ToolName, arguments: t.arguments }));
      if (JSON.stringify(actualCalls) !== JSON.stringify(c.expected.toolCalls)) {
        problems.push(`toolCalls got ${JSON.stringify(actualCalls)} want ${JSON.stringify(c.expected.toolCalls)}`);
      }
      if (JSON.stringify(exec.toolCalls.map((t) => t.ok)) !== JSON.stringify(c.expected.okFlags)) {
        problems.push(`okFlags got ${JSON.stringify(exec.toolCalls.map((t) => t.ok))} want ${JSON.stringify(c.expected.okFlags)}`);
      }
      if (c.expected.summary !== undefined && exec.summary !== c.expected.summary) {
        problems.push(`summary got ${exec.summary} want ${c.expected.summary}`);
      }
      if (c.expected.artifactType !== undefined && exec.artifact.type !== c.expected.artifactType) {
        problems.push(`artifactType got ${exec.artifact.type} want ${c.expected.artifactType}`);
      }
      if (c.expected.resolution !== undefined) {
        const got = { referenceKind: exec.resolution?.referenceKind, referencedTitle: exec.resolution?.referencedTitle };
        if (JSON.stringify(got) !== JSON.stringify(c.expected.resolution)) {
          problems.push(`resolution got ${JSON.stringify(got)} want ${JSON.stringify(c.expected.resolution)}`);
        }
      }
      if (c.expectState?.todos !== undefined) {
        const got = db.listTodos().map((t) => t.title);
        if (JSON.stringify(got) !== JSON.stringify(c.expectState.todos)) {
          problems.push(`todos got ${JSON.stringify(got)} want ${JSON.stringify(c.expectState.todos)}`);
        }
      }
      if (c.expectState?.documents !== undefined) {
        const got = db.listDocuments().map((d) => d.title);
        if (JSON.stringify(got) !== JSON.stringify(c.expectState.documents)) {
          problems.push(`documents got ${JSON.stringify(got)} want ${JSON.stringify(c.expectState.documents)}`);
        }
      }
      if (c.expectState?.schedules !== undefined) {
        const got = db.listSchedules().map((s) => s.title);
        if (JSON.stringify(got) !== JSON.stringify(c.expectState.schedules)) {
          problems.push(`schedules got ${JSON.stringify(got)} want ${JSON.stringify(c.expectState.schedules)}`);
        }
      }
      if (c.expected.rag !== undefined) {
        const want = c.expected.rag;
        if (exec.rag?.noHit !== want.noHit) problems.push(`rag.noHit got ${exec.rag?.noHit} want ${want.noHit}`);
        if ((exec.citations?.length ?? -1) !== want.citationCount) {
          problems.push(`citations got ${exec.citations?.length ?? -1} want ${want.citationCount}`);
        }
        if (want.answerIncludes !== undefined && !exec.summary.includes(want.answerIncludes)) {
          problems.push(`answer missing ${want.answerIncludes}: ${exec.summary}`);
        }
        if (want.noHit) {
          if (!exec.summary.includes(RAG_NO_HIT_ANSWER)) problems.push("no-hit answer lacks honesty phrase");
          if (exec.summary.includes("[1]")) problems.push("no-hit answer fabricated a citation");
        } else {
          for (const citation of exec.citations ?? []) {
            const stored = db.getKnowledgeChunk(citation.chunkId);
            if (stored === null || !stored.content.startsWith(citation.snippet)) {
              problems.push(`citation ${citation.chunkId} not traceable to stored chunk`);
            }
            if (db.getKnowledgeDoc(citation.docId) === null) {
              problems.push(`citation doc ${citation.docId} not found`);
            }
          }
        }
      }
      if (problems.length === 0) passed += 1;
      else failures.push(`${c.name}: ${problems.join("; ")}`);
    } catch (err) {
      failures.push(`${c.name}: threw ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      db.close();
    }
  }
  return { total: cases.length, passed, failures };
}
