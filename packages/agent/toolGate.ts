// XieFlow packages/agent/toolGate.ts — r47 AI 工具调用确认闸门（危险操作先预览后执行）
//
// 宪法纪律：闸门规则集中在本文件（纯函数），api / web 零算法分支。
// 状态变更工具白名单复用 shared 的 STATE_CHANGING_TOOLS（唯一口径），
// 只读工具直接执行，未确认的写调用拦截为 pending 并给出人类可读预览。
// 零 token / 零随机：预览文案完全由工具名 + 参数装配，可录制回放。
import {
  ValidationError,
  STATE_CHANGING_TOOLS,
  TOOL_NAMES,
  isToolName,
  type ToolCallRequest,
  type ToolName,
  type ToolConfirmStatus,
  type ToolPreviewDetail,
} from "@xieflow/shared";

/** 落库在 tool_calls_json 中的确认态（别名，唯一口径在 shared） */
export type ToolCallConfirmStatus = ToolConfirmStatus;

/** 人类可读操作摘要（别名，唯一口径在 shared） */
export type ToolPreview = ToolPreviewDetail;

function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * 写操作是否需要用户确认：白名单 = shared STATE_CHANGING_TOOLS。
 * 新增状态变更工具只需进 shared 白名单，本函数与 api/web 零改动。
 */
export function needsConfirmation(toolName: unknown): boolean {
  return (
    typeof toolName === "string" &&
    (STATE_CHANGING_TOOLS as readonly string[]).includes(toolName)
  );
}

/** 闸门覆盖的工具总数（白名单规模，供断言锁定「新增工具进白名单即生效」） */
export function confirmationToolCount(): number {
  return STATE_CHANGING_TOOLS.length;
}

/** 白名单工具名快照（按 shared 次序，只读） */
export function confirmationToolNames(): readonly ToolName[] {
  return [...STATE_CHANGING_TOOLS];
}

/**
 * 人类可读操作摘要。toolResult 可选：确认执行后把真实回执摘要拼进 detail；
 * 未传（pending 阶段）只描述「将要做什么」，不编造结果。
 */
export function buildToolPreview(
  toolCall: ToolCallRequest,
  toolResult?: { readonly ok?: boolean; readonly summary?: string },
): ToolPreview {
  const args = toolCall.arguments ?? {};
  let title = "执行工具";
  let detail = `工具 ${toolCall.name}`;
  switch (toolCall.name) {
    case "create_todo": {
      const label = asText(args.title) || "未命名待办";
      title = "新建待办";
      detail = `标题「${label}」 · 象限 ${asText(args.quadrant) || "默认"}${asText(args.dueDate) ? ` · 截止 ${asText(args.dueDate)}` : ""}`;
      break;
    }
    case "create_document": {
      title = "新建文档";
      detail = `标题「${asText(args.title) || "未命名文档"}」`;
      break;
    }
    case "create_schedule": {
      title = "新建日程";
      detail = `标题「${asText(args.title) || "未命名日程"}」 · ${asText(args.date) || "日期待定"} ${asText(args.start)}-${asText(args.end)}`;
      break;
    }
    default: {
      // 只读工具一般不会进待确认卡，但预览函数对全部工具封闭定义（零分支遗漏）
      const LABELS: Partial<Record<ToolName, string>> = {
        list_todos: "列出待办",
        list_documents: "列出文档",
        list_projects: "列出项目",
        list_cards: "列出看板卡片",
        list_tables: "列出多维表格",
        list_schedules: "列出日程",
        search_knowledge: "检索知识库",
        summarize_document: "文档摘要",
        export_document_md: "导出文档 Markdown",
      };
      title = LABELS[toolCall.name] ?? `工具 ${toolCall.name}`;
      const keys = Object.keys(args);
      detail = keys.length === 0 ? "只读查询，不改动数据" : `参数 ${keys.join(" / ")}（只读）`;
    }
  }
  const suffix = toolResult ? `；结果：${toolResult.summary ?? (toolResult.ok ? "成功" : "失败")}` : "";
  return { title, detail: detail + suffix, text: `${title} — ${detail}${suffix}` };
}

/** 一条带闸门的调用决策（callId 稳定可寻址，跨 reload 不丢） */
export interface GatedCall {
  readonly callId: string;
  readonly call: ToolCallRequest;
  readonly preview: ToolPreview;
  readonly needsConfirm: boolean;
  readonly action: "execute" | "pending";
}

export interface ExecutionPlan {
  readonly calls: readonly GatedCall[];
  readonly toExecute: readonly GatedCall[];
  readonly toPending: readonly GatedCall[];
}

/**
 * 纯函数：未确认的写调用拦截为 pending，只读调用直接执行。
 * - confirmedIds：已经用户确认的 callId（confirm 重放时传入）。
 * - autoExecute：老行为开关，true 时所有调用立即执行（向后兼容）。
 * - callIds：可选稳定 id（缺省按 index 生成 tc-N，供回放/直接调用保持确定性）。
 */
export function planToolExecution(
  calls: readonly ToolCallRequest[],
  confirmedIds: readonly string[] = [],
  autoExecute = false,
  callIds?: readonly string[],
): ExecutionPlan {
  const confirmed = new Set(confirmedIds);
  const decisions: GatedCall[] = calls.map((call, index) => {
    const callId = callIds?.[index] ?? `tc-${index + 1}`;
    const need = needsConfirmation(call.name);
    const pending = need && !autoExecute && !confirmed.has(callId);
    return {
      callId,
      call,
      preview: buildToolPreview(call),
      needsConfirm: need,
      action: pending ? "pending" : "execute",
    } as const;
  });
  return {
    calls: decisions,
    toExecute: decisions.filter((d) => d.action === "execute"),
    toPending: decisions.filter((d) => d.action === "pending"),
  };
}

/** callIds 入参归一：必须是非空字符串数组（API 400 守卫唯一口径） */
export function normalizeCallIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError("callIds 必须是非空数组");
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || item.trim() === "") {
      throw new ValidationError("callIds 每项必须是非空字符串");
    }
    out.push(item);
  }
  if (new Set(out).size !== out.length) {
    throw new ValidationError("callIds 不能重复");
  }
  return out;
}

/** 合法工具名快照（断言锁定「注册表/闸门/回放共用 shared 唯一清单」） */
export function knownToolNames(): readonly string[] {
  return TOOL_NAMES;
}

export function isKnownTool(name: unknown): boolean {
  return isToolName(name);
}
