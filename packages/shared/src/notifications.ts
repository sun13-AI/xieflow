// 协流 XieFlow — shared/notifications.ts：通知中心唯一口径（r26 · M10 后功能补强）
// 规则集中：类型/模板生成 buildNotification、阈值判定 shouldNotify、未读分组
// notificationSummary、过滤分页 queryNotifications、跳转映射 notificationTargetTab、
// 当前库状态→候选事件 collectNotificationCandidates。api / web / db 零算法分支。
// 本文件为 @xieflow/shared/notifications 子路径导出；纯 TS 无 Node 依赖。
import { ValidationError, localDateStr, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./index.js";

/** 站内通知类型（schema v19 CHECK 与 UI 筛选同一枚举） */
export const NOTIFICATION_TYPES = [
  "schedule_due", "approval_pending", "asset_low", "sync_conflict", "system",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  schedule_due: "日程",
  approval_pending: "审批",
  asset_low: "物资",
  sync_conflict: "同步",
  system: "系统",
};

/** 类型 → 默认跳转 tab（ref_type 缺席时兜底） */
export const NOTIFICATION_TYPE_TABS: Record<NotificationType, string> = {
  schedule_due: "schedules",
  approval_pending: "approval",
  asset_low: "assets",
  sync_conflict: "home",
  system: "home",
};

/** ref_type（被引用实体类别）唯一枚举 */
export const NOTIFICATION_REF_TYPES = ["schedules", "approvals", "assets", "sync", "system"] as const;
export type NotificationRefType = (typeof NOTIFICATION_REF_TYPES)[number];

/** 点通知跳转：ref_type → tab（任务单契约，web 只消费本映射） */
export const NOTIFICATION_REF_TABS: Record<NotificationRefType, string> = {
  schedules: "schedules",
  approvals: "approval",
  assets: "assets",
  sync: "home",
  system: "home",
};

/** 物资低库存默认阈值（shouldNotify 与 refresh 装配共用同一把尺） */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function assertValidNotificationType(type: unknown): asserts type is NotificationType {
  if (!isNotificationType(type)) throw new ValidationError(`非法通知类型：${String(type)}`);
}

export function isNotificationRefType(value: unknown): value is NotificationRefType {
  return typeof value === "string" && (NOTIFICATION_REF_TYPES as readonly string[]).includes(value);
}

/**
 * 引用守卫：ref_type 必须在白名单；实体类引用（schedules/approvals/assets）
 * 的 ref_id 必须是正整数；sync/system 允许 0（无具体实体行）。
 */
export function assertValidNotificationRef(refType: unknown, refId: unknown): asserts refType is NotificationRefType {
  if (!isNotificationRefType(refType)) throw new ValidationError(`非法通知引用类型：${String(refType)}`);
  const n = typeof refId === "string" && refId.trim() !== "" ? Number(refId.trim()) : refId;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
    throw new ValidationError(`非法通知引用 id：${String(refId)}`);
  }
  if (refType !== "sync" && refType !== "system" && n === 0) {
    throw new ValidationError(`通知引用 id 不能为空：${refType}`);
  }
}

/** 通知领域对象（schema v19 notifications 表 camelCase 契约） */
export interface Notification {
  readonly id: number;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly refType: NotificationRefType;
  readonly refId: number;
  readonly readAt: string | null;
  readonly createdAt: string;
}

/** 新建通知入参（id 由 SQLite 自动分配） */
export type NewNotification = Omit<Notification, "id">;

/** 模板上下文：所有字段可选，缺省由各类型的 shouldNotify 判定 */
export interface NotificationContext {
  readonly title?: unknown;
  readonly body?: unknown;
  readonly name?: unknown;
  readonly date?: unknown;
  readonly start?: unknown;
  readonly count?: unknown;
  readonly quantity?: unknown;
  readonly threshold?: unknown;
  readonly unit?: unknown;
  readonly conflictCount?: unknown;
  readonly entityType?: unknown;
  readonly entityId?: unknown;
  readonly fields?: readonly string[];
  readonly message?: unknown;
  readonly refId?: unknown;
  readonly now?: Date;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value.trim()) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value);
}

/**
 * 阈值判定（唯一口径；api refresh 与单条事件装配都走这里）：
 * ① schedule_due：日程日期恰好是今天（本地时区，不赌 UTC）；
 * ② approval_pending：待处理审批数 ≥ 1；
 * ③ asset_low：库存数量 ≤ 阈值（缺省 DEFAULT_LOW_STOCK_THRESHOLD=5）；
 * ④ sync_conflict：冲突数 > 0；
 * ⑤ system：系统消息恒发。
 * 未知类型抛 ValidationError（禁止静默放过）。
 */
export function shouldNotify(type: NotificationType, ctx: NotificationContext = {}): boolean {
  assertValidNotificationType(type);
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  switch (type) {
    case "schedule_due":
      return asText(ctx.date) === localDateStr(now) && asText(ctx.date) !== "";
    case "approval_pending":
      return asNumber(ctx.count) >= 1;
    case "asset_low":
      return asNumber(ctx.quantity, -1) <= asNumber(ctx.threshold, DEFAULT_LOW_STOCK_THRESHOLD);
    case "sync_conflict":
      return asNumber(ctx.conflictCount) > 0;
    case "system":
      return true;
  }
}

/**
 * 通知模板生成（唯一口径）：标题 / 正文 / ref_type / ref_id / created_at。
 * 生成的通知一律未读（read_at=NULL），createdAt 由入参 now 决定（确定性可测）。
 * 未知类型、空标题、非法引用一律抛 ValidationError（api 映射 400）。
 */
export function buildNotification(
  type: NotificationType,
  ctx: NotificationContext = {},
  now: Date = new Date(),
): NewNotification {
  assertValidNotificationType(type);
  const nowDate = now instanceof Date ? now : new Date();
  const createdAt = nowDate.toISOString();
  const refId = Math.max(0, Math.trunc(asNumber(ctx.refId)));
  let title: string;
  let body: string;
  let refType: NotificationRefType;
  switch (type) {
    case "schedule_due": {
      const name = asText(ctx.title);
      if (name === "") throw new ValidationError("日程通知缺少标题");
      title = `日程到期：${name}`;
      body = `今天${asText(ctx.start) !== "" ? ` ${asText(ctx.start)}` : ""}的日程「${name}」已到期，点击前往日程查看。`;
      refType = "schedules";
      break;
    }
    case "approval_pending": {
      const name = asText(ctx.title);
      if (name === "") throw new ValidationError("审批通知缺少标题");
      title = `待处理审批：${name}`;
      body = `审批「${name}」正等待处理，点击前往审批查看并操作。`;
      refType = "approvals";
      break;
    }
    case "asset_low": {
      const name = asText(ctx.name);
      if (name === "") throw new ValidationError("物资通知缺少名称");
      const qty = asNumber(ctx.quantity);
      const threshold = asNumber(ctx.threshold, DEFAULT_LOW_STOCK_THRESHOLD);
      title = `物资库存不足：${name}`;
      body = `「${name}」当前库存 ${qty}${asText(ctx.unit)}，已低于阈值 ${threshold}，点击前往物资补货。`;
      refType = "assets";
      break;
    }
    case "sync_conflict": {
      const entityType = asText(ctx.entityType) || "实体";
      const entityId = asText(ctx.entityId) || String(refId);
      const fields = (ctx.fields ?? []).join("、");
      title = `同步冲突：${entityType} ${entityId}`;
      body = fields !== ""
        ? `字段 [${fields}] 在两端存在差异，点击前往工作台处理。`
        : "多端同步检测到版本冲突，点击前往工作台处理。";
      refType = "sync";
      break;
    }
    case "system": {
      title = asText(ctx.title);
      if (title === "") throw new ValidationError("系统通知缺少标题");
      body = asText(ctx.message) || asText(ctx.body) || "系统消息，点击前往工作台查看。";
      refType = "system";
      break;
    }
  }
  assertValidNotificationRef(refType, refId);
  return { type, title, body, refType, refId, readAt: null, createdAt };
}

/** 未读分组统计（未读计数按 type 分组，all 类型均给出零项便于 UI 直接渲染） */
export interface NotificationSummary {
  readonly total: number;
  readonly unread: number;
  readonly read: number;
  readonly byType: Record<NotificationType, { readonly total: number; readonly unread: number }>;
  readonly unreadByType: Record<NotificationType, number>;
}

export function emptyNotificationSummary(): NotificationSummary {
  const byType = {} as Record<NotificationType, { total: number; unread: number }>;
  const unreadByType = {} as Record<NotificationType, number>;
  for (const t of NOTIFICATION_TYPES) {
    byType[t] = { total: 0, unread: 0 };
    unreadByType[t] = 0;
  }
  return { total: 0, unread: 0, read: 0, byType, unreadByType };
}

export function notificationSummary(list: readonly Notification[]): NotificationSummary {
  const out = emptyNotificationSummary() as {
    total: number; unread: number; read: number;
    byType: Record<NotificationType, { total: number; unread: number }>;
    unreadByType: Record<NotificationType, number>;
  };
  for (const n of list) {
    if (!isNotificationType(n.type)) continue;
    out.total += 1;
    out.byType[n.type] = { total: out.byType[n.type].total + 1, unread: out.byType[n.type].unread };
    if (n.readAt === null) {
      out.unread += 1;
      out.byType[n.type] = { total: out.byType[n.type].total, unread: out.byType[n.type].unread + 1 };
      out.unreadByType[n.type] = out.unreadByType[n.type] + 1;
    } else {
      out.read += 1;
    }
  }
  return out;
}

/** 列表查询参数（api 只装配，类型过滤 / 未读过滤 / 分页规则全在 shared） */
export interface NotificationQuerySpec {
  readonly type?: unknown;
  readonly unreadOnly?: unknown;
  readonly page?: unknown;
  readonly pageSize?: unknown;
}

export interface NotificationQueryResult {
  readonly notifications: Notification[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

function isUnreadOnly(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

/**
 * 通知列表查询唯一入口：按 created_at 降序（同刻按 id 降序），
 * type 过滤走白名单、unreadOnly 只留 read_at=NULL，分页从 1 起且 pageSize 封顶。
 */
export function queryNotifications(
  list: readonly Notification[],
  spec: NotificationQuerySpec = {},
): NotificationQueryResult {
  if (spec.type !== undefined && spec.type !== null && spec.type !== "") {
    assertValidNotificationType(spec.type);
  }
  const wantedType = spec.type as NotificationType | undefined;
  const pageSizeRaw = asNumber(spec.pageSize, DEFAULT_PAGE_SIZE);
  const pageRaw = asNumber(spec.page, 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSizeRaw)));
  const page = Math.max(1, Math.floor(pageRaw));
  const filtered = list.filter((n) =>
    (wantedType === undefined || n.type === wantedType) &&
    (!isUnreadOnly(spec.unreadOnly) || n.readAt === null),
  );
  const sorted = [...filtered].sort((a, b) =>
    a.createdAt === b.createdAt ? b.id - a.id : a.createdAt < b.createdAt ? 1 : -1,
  );
  const total = sorted.length;
  return {
    notifications: sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

/** 点条跳转：ref_type 优先（任务单契约），缺映射时回落类型默认 tab */
export function notificationTargetTab(n: Pick<Notification, "refType" | "type">): string {
  return isNotificationRefType(n.refType) ? NOTIFICATION_REF_TABS[n.refType] : NOTIFICATION_TYPE_TABS[n.type];
}

/**
 * r26 返工#1：deep-link 定位参数唯一口径。
 * ref_id 是实体 id 时才写定位参数，sync/system 的 0 不造伪 id；
 * 审批带 view=todo 锁定「按 id 定位」而非依赖列表首行自动选中。
 * web 与 api 只消费本函数，零算法分支。
 */
export function notificationDeepLinkParams(
  n: Pick<Notification, "refType" | "refId" | "type">,
): Readonly<Record<string, string>> {
  if (n.refId <= 0) return {};
  const id = String(n.refId);
  switch (n.refType) {
    case "approvals": return { approvalId: id, view: "todo" };
    case "assets": return { assetId: id };
    case "schedules": return { scheduleId: id };
    default: return {};
  }
}

/** 当前库状态 → 候选事件（refresh 唯一入口；同步冲突由 409 事件实时落库，不在此重算） */
export interface NotificationCandidate {
  readonly type: NotificationType;
  readonly ctx: NotificationContext;
}

export interface NotificationSourceState {
  readonly schedules?: readonly { readonly id: number; readonly title: string; readonly date: string; readonly start?: string }[];
  readonly approvals?: readonly { readonly id: number; readonly title: string; readonly status: string }[];
  readonly assets?: readonly { readonly id: number; readonly name: string; readonly quantity: number; readonly unit?: string }[];
  readonly now?: Date;
  readonly threshold?: number;
}

export function collectNotificationCandidates(state: NotificationSourceState): NotificationCandidate[] {
  const now = state.now instanceof Date ? state.now : new Date();
  const threshold = asNumber(state.threshold, DEFAULT_LOW_STOCK_THRESHOLD);
  const today = localDateStr(now);
  const out: NotificationCandidate[] = [];
  for (const s of state.schedules ?? []) {
    if (s.date === today) {
      out.push({ type: "schedule_due", ctx: { title: s.title, date: s.date, start: s.start, refId: s.id, now } });
    }
  }
  for (const a of state.approvals ?? []) {
    if (a.status === "pending") {
      out.push({ type: "approval_pending", ctx: { title: a.title, count: 1, refId: a.id, now } });
    }
  }
  for (const a of state.assets ?? []) {
    if (a.quantity <= threshold) {
      out.push({ type: "asset_low", ctx: { name: a.name, quantity: a.quantity, unit: a.unit, threshold, refId: a.id, now } });
    }
  }
  return out;
}
