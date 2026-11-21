// 协流 XieFlow — shared/meetings.ts：会议管理唯一口径（r28 · 本地预约台账，不接视频/外部日历）
// 三函数规则全在本文件：detectTimeConflict（同室时段重叠、边界相接不冲突）/
// validateMeetingWindow（结束晚于开始、最长 8h）/ normalizeAttendees（去重 + 停用校验）。
// api / web 零算法分支：只装配 shared 结果并把错误映射为 400/404/409。
// 无新依赖、零 token；本文件为 @xieflow/shared/meetings 子路径导出。
import { ValidationError, isIsoDate } from "./index.js";

/** 单场会议最长 8 小时（闭区间起点、开区间终点） */
export const MEETING_MAX_HOURS = 8;
export const MEETING_MAX_MINUTES = MEETING_MAX_HOURS * 60;
export const MEETING_TITLE_MAX = 200;
export const MEETING_LOCATION_MAX = 200;
export const MEETING_ORGANIZER_MAX = 100;
export const MEETING_CAPACITY_MAX = 1000;

/** 数据库行 → 领域对象（snake_case 在 db/mappers 归一，此处只声明形状） */
export interface Room {
  readonly id: number;
  readonly name: string;
  readonly location: string;
  readonly capacity: number;
  /** r43：设备白名单数组（存量 NULL 归一为空）；推荐规则在 shared/roomRecommend */
  readonly equipment?: readonly string[];
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Meeting {
  readonly id: number;
  readonly roomId: number;
  readonly title: string;
  readonly date: string;
  readonly start: string;
  readonly end: string;
  readonly organizer: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MeetingAttendee {
  readonly id: number;
  readonly meetingId: number;
  readonly memberId: number;
  readonly createdAt: string;
}

export interface MeetingWindow {
  readonly id?: number;
  readonly roomId: number;
  readonly date: string;
  readonly start: string;
  readonly end: string;
}

export interface NormalizedMeetingWindow extends MeetingWindow {
  readonly startMinutes: number;
  readonly endMinutes: number;
  readonly durationMinutes: number;
}

export interface RoomDraft {
  readonly name: string;
  readonly location: string;
  readonly capacity: number;
  readonly active: boolean;
}

export interface MeetingDraft extends NormalizedMeetingWindow {
  readonly title: string;
  readonly organizer: string;
  readonly attendees: readonly number[];
}

export interface RoomAvailabilityBooking {
  readonly id: number;
  readonly title: string;
  readonly start: string;
  readonly end: string;
}

export interface RoomAvailability {
  readonly roomId: number;
  readonly roomName: string;
  readonly date: string;
  readonly bookings: readonly RoomAvailabilityBooking[];
}

export interface AttendeeCandidate {
  readonly id: number;
  readonly status: string;
}

/** 会议室启用判定（停用会议室不可预约） */
export function isMeetingRoomActive(room: { readonly active?: unknown }): boolean {
  return room.active === true || room.active === 1;
}

/** 会议室输入归一：名称/位置 trim、容量整数 0..1000、active 默认 true */
export function normalizeRoomDraft(input: {
  readonly name?: unknown;
  readonly location?: unknown;
  readonly capacity?: unknown;
  readonly active?: unknown;
} = {}): RoomDraft {
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new ValidationError("会议室名称不能为空");
  }
  const name = input.name.trim();
  if (name.length > MEETING_LOCATION_MAX) throw new ValidationError(`会议室名称不能超过 ${MEETING_LOCATION_MAX} 字`);
  const location = typeof input.location === "string" ? input.location.trim() : "";
  if (location.length > MEETING_LOCATION_MAX) throw new ValidationError(`会议室位置不能超过 ${MEETING_LOCATION_MAX} 字`);
  const capacity = input.capacity === undefined || input.capacity === null ? 0 : Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > MEETING_CAPACITY_MAX) {
    throw new ValidationError(`会议室容量必须是 0..${MEETING_CAPACITY_MAX} 的整数`);
  }
  if (input.active !== undefined && typeof input.active !== "boolean") {
    throw new ValidationError("会议室启用状态必须是布尔值");
  }
  return { name, location, capacity, active: input.active === undefined ? true : input.active };
}

/** HH:mm → 当日分钟数（严格补零，越界拒绝） */
export function parseClockMinutes(value: unknown): number {
  if (typeof value !== "string") throw new ValidationError("会议时间必须是 HH:mm 字符串");
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new ValidationError(`非法会议时间：${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 当日分钟数 → HH:mm（补零，用于 web 时段网格） */
export function formatClockMinutes(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) {
    throw new ValidationError(`非法分钟数：${value}`);
  }
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

/** 会议标题 / 组织者守卫（api 400 唯一来源） */
export function assertValidMeetingTitle(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") throw new ValidationError("会议标题不能为空");
  if (value.trim().length > MEETING_TITLE_MAX) throw new ValidationError(`会议标题不能超过 ${MEETING_TITLE_MAX} 字`);
}

export function assertValidOrganizer(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length > MEETING_ORGANIZER_MAX) {
    throw new ValidationError(`组织者不能超过 ${MEETING_ORGANIZER_MAX} 字`);
  }
}

/** 会议日期守卫（availability 查询与预约共用，api 零算法分支） */
export function assertValidMeetingDate(value: unknown): asserts value is string {
  if (typeof value !== "string" || !isIsoDate(value)) {
    throw new ValidationError(`非法会议日期：${String(value)}`);
  }
}

/**
 * 规则②：validateMeetingWindow —— 日期真实、HH:mm 合法、结束晚于开始、最长 8 小时。
 * 返回统一分钟口径供冲突检测与可用性网格消费；api/web 不重复实现任何判定。
 */
export function validateMeetingWindow(date: unknown, start: unknown, end: unknown): NormalizedMeetingWindow {
  assertValidMeetingDate(date);
  const startMinutes = parseClockMinutes(start);
  const endMinutes = parseClockMinutes(end);
  if (endMinutes <= startMinutes) throw new ValidationError("会议结束时间必须晚于开始时间");
  const durationMinutes = endMinutes - startMinutes;
  if (durationMinutes > MEETING_MAX_MINUTES) {
    throw new ValidationError(`会议时长不得超过 ${MEETING_MAX_HOURS} 小时`);
  }
  return {
    roomId: 0, date, start: start as string, end: end as string,
    startMinutes, endMinutes, durationMinutes,
  };
}

/** 时段重叠：同一会议室、同一天，且 [start,end) 严格相交；边界相接不算冲突。 */
export function meetingWindowsOverlap(
  a: { readonly roomId: number; readonly date: string; readonly start: string; readonly end: string },
  b: { readonly roomId: number; readonly date: string; readonly start: string; readonly end: string },
): boolean {
  if (a.roomId !== b.roomId || a.date !== b.date) return false;
  const as = parseClockMinutes(a.start);
  const ae = parseClockMinutes(a.end);
  const bs = parseClockMinutes(b.start);
  const be = parseClockMinutes(b.end);
  return as < be && bs < ae;
}

/**
 * 规则①：detectTimeConflict —— 同室时段重叠检测。
 * 候选 id 与既有 id 相同视为自我排除（改期场景）；返回冲突会议 id 升序数组。
 */
export function detectTimeConflict(
  existing: readonly MeetingWindow[],
  candidate: MeetingWindow,
): readonly number[] {
  return existing
    .filter((m) => typeof m.id === "number" && m.id !== candidate.id && meetingWindowsOverlap(m, candidate))
    .map((m) => m.id!)
    .sort((a, b) => a - b);
}

/** 冲突错误：409 响应回带冲突会议 id（web 红条提示直接消费） */
export class MeetingConflictError extends Error {
  readonly conflictIds: readonly number[];

  constructor(conflictIds: readonly number[]) {
    const list = [...conflictIds];
    super(`会议室在该时段已有预约（冲突会议 id：${list.join(",")}）`);
    this.name = "MeetingConflictError";
    this.conflictIds = list;
  }
}

/** 冲突守卫：无冲突放行，有冲突抛 MeetingConflictError */
export function assertNoTimeConflict(
  existing: readonly MeetingWindow[],
  candidate: MeetingWindow,
): void {
  const conflicting = detectTimeConflict(existing, candidate);
  if (conflicting.length > 0) throw new MeetingConflictError(conflicting);
}

function attendeeId(value: unknown): number {
  const raw = typeof value === "number" || typeof value === "string"
    ? value
    : value && typeof value === "object"
      ? ((value as { memberId?: unknown }).memberId ?? (value as { id?: unknown }).id)
      : undefined;
  const id = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`非法参会人 id：${String(raw)}`);
  }
  return id;
}

/**
 * 规则③：normalizeAttendees —— 去重保序 + 成员存在性与启用状态校验。
 * 不存在 / 停用 / 非法 id 抛 ValidationError（api 映射 400），空输入合法。
 */
export function normalizeAttendees(
  input: unknown,
  members: readonly AttendeeCandidate[],
): number[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new ValidationError("参会人必须是数组");
  const seen = new Set<number>();
  const out: number[] = [];
  for (const item of input) {
    const id = attendeeId(item);
    if (seen.has(id)) continue;
    const member = members.find((m) => m.id === id);
    if (!member) throw new ValidationError(`参会人不存在：${id}`);
    if (member.status !== "active") throw new ValidationError(`参会人已停用：${id}`);
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * 预约编排（api 唯一入口）：会议室存在/启用 → 标题/组织者 → 时段 → 冲突 → 参会人。
 * 所有判定仍来自本文件三函数；调用方只装配与映射错误。
 */
export function normalizeMeetingDraft(
  input: {
    readonly roomId?: unknown;
    readonly title?: unknown;
    readonly date?: unknown;
    readonly start?: unknown;
    readonly end?: unknown;
    readonly organizer?: unknown;
    readonly attendees?: unknown;
  },
  rooms: readonly Room[],
  members: readonly AttendeeCandidate[],
  existing: readonly MeetingWindow[],
): MeetingDraft {
  const roomId = Number(input.roomId);
  if (!Number.isInteger(roomId) || roomId <= 0) throw new ValidationError(`非法会议室 id：${String(input.roomId)}`);
  const room = rooms.find((r) => r.id === roomId);
  if (!room) throw new ValidationError(`会议室不存在：${roomId}`);
  if (!isMeetingRoomActive(room)) throw new ValidationError(`会议室已停用：${roomId}`);
  assertValidMeetingTitle(input.title);
  assertValidOrganizer(input.organizer ?? "");
  const window = validateMeetingWindow(input.date, input.start, input.end);
  const candidate: MeetingWindow = { roomId, date: window.date, start: window.start, end: window.end };
  assertNoTimeConflict(existing, candidate);
  return {
    ...window,
    roomId,
    title: (input.title as string).trim(),
    organizer: ((input.organizer ?? "") as string).trim(),
    attendees: normalizeAttendees(input.attendees, members),
  };
}

/**
 * r28 返工#1：选中会议室唯一口径（web 的 roomId state / 下拉框 / POST 共用）。
 * 传入期望 id（深链 ?roomId=、当前选中、刚建成的室）与真实会议室清单：
 * 期望室存在且启用 → 原样返回；否则回落到第一间启用室；无启用室 → 0（只提示、不 POST）。
 * 修掉「库里没有 id=1 时 select 显示第一间、表单却提交 roomId:1」的首次预约死路。
 */
export function resolveSelectedRoomId(
  rooms: readonly { readonly id: number; readonly active: boolean }[],
  requestedRoomId: number | string,
): number {
  const wanted = typeof requestedRoomId === "number" ? requestedRoomId : Number(requestedRoomId);
  if (Number.isInteger(wanted) && rooms.some((r) => r.id === wanted && isMeetingRoomActive(r))) return wanted;
  return rooms.find(isMeetingRoomActive)?.id ?? 0;
}

/** 时段网格数据源：按日期列出启用会议室及当日预约（web 只渲染，不自行过滤） */
export function meetingAvailability(
  date: string,
  rooms: readonly Room[],
  meetings: readonly (MeetingWindow & { readonly title?: string })[],
): RoomAvailability[] {
  return rooms.filter(isMeetingRoomActive).map((room) => ({
    roomId: room.id,
    roomName: room.name,
    date,
    bookings: meetings
      .filter((m) => m.roomId === room.id && m.date === date)
      .map((m) => ({ id: m.id ?? 0, title: m.title ?? `#${m.id ?? 0}`, start: m.start, end: m.end }))
      .sort((a, b) => a.start.localeCompare(b.start)),
  }));
}
