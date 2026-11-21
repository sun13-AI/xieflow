// 协流 XieFlow — shared/roomRecommend.ts：会议室智能推荐唯一口径（r43）
// 设备白名单归一 / 需求守卫 / 可用判定 / 冲突原因 / 容量最接近排序全在本文件。
// api / web 零算法分支：只装配 shared 结果并把 ValidationError 映射为 400/404。
// 只依赖 shared/meetings 的时段规则（不重复实现冲突判定）；零新依赖、零 token。
import { ValidationError, isIsoDate } from "./index.js";
import {
  MEETING_CAPACITY_MAX,
  isMeetingRoomActive,
  meetingWindowsOverlap,
  validateMeetingWindow,
} from "./meetings.js";

/** 设备白名单（本地枚举，不接外部目录）；归一化后的顺序即此固定顺序 */
export const ROOM_EQUIPMENT_WHITELIST = ["投影", "白板", "视频会议", "电话会议"] as const;
export type RoomEquipment = (typeof ROOM_EQUIPMENT_WHITELIST)[number];

const EQUIPMENT_ORDER: ReadonlyMap<string, number> = new Map(
  ROOM_EQUIPMENT_WHITELIST.map((item, index) => [item, index]),
);

/** 会议室在推荐场景下的最小形状（db mapper 回带 equipment 数组；老数据为 null/undefined） */
export interface RecommendRoom {
  readonly id: number;
  readonly name: string;
  readonly location?: string;
  readonly capacity: number;
  readonly active: boolean | number;
  readonly equipment?: readonly string[] | string | null;
}

/** 既有预约的最小形状（复用 shared/meetings 的重叠判定） */
export interface RecommendMeeting {
  readonly id?: number;
  readonly roomId: number;
  readonly date: string;
  readonly start: string;
  readonly end: string;
  readonly title?: string;
}

/** 推荐需求：人数 + 设备 + 日期 + 时段 */
export interface RecommendNeed {
  readonly attendees: number;
  readonly equipment: readonly string[];
  readonly date: string;
  readonly start: string;
  readonly end: string;
}

/** 可用会议室结果（web 点选回填 roomId） */
export interface RecommendHit {
  readonly id: number;
  readonly name: string;
  readonly location: string;
  readonly capacity: number;
  readonly equipment: readonly string[];
  readonly seatsOver: number;
}

/** 不可用会议室 + 明确原因（web 红条/灰条直接渲染） */
export interface RecommendMiss {
  readonly id: number;
  readonly name: string;
  readonly capacity: number;
  readonly equipment: readonly string[];
  readonly reasons: readonly string[];
}

/** 一次推荐完整结果（可用 + 不可用；只读，不改预约数据） */
export interface RoomRecommendation {
  readonly need: RecommendNeed;
  readonly available: readonly RecommendHit[];
  readonly unavailable: readonly RecommendMiss[];
}

function splitItems(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v : String(v)));
  if (typeof value === "string") return value.split(/[,，、]/);
  return [String(value)];
}

/**
 * 设备归一：白名单过滤 + trim + 去重 + 按白名单固定顺序排序。
 * 非白名单项被静默丢弃（读路径），写路径另用 assertValidEquipment 抛 400。
 * 接受数组或逗号/顿号分隔字符串；存量 NULL 视为空数组（向后兼容）。
 */
export function normalizeEquipment(input: unknown): string[] {
  const seen = new Set<string>();
  for (const raw of splitItems(input)) {
    const item = raw.trim();
    if (EQUIPMENT_ORDER.has(item)) seen.add(item);
  }
  return [...seen].sort((a, b) => (EQUIPMENT_ORDER.get(a)! - EQUIPMENT_ORDER.get(b)!));
}

/** 严格守卫：出现白名单外设备 → ValidationError（api 400 唯一来源） */
export function assertValidEquipment(input: unknown): void {
  for (const raw of splitItems(input)) {
    const item = raw.trim();
    if (item === "") continue;
    if (!EQUIPMENT_ORDER.has(item)) {
      throw new ValidationError(`非法会议室设备：${item}（可选：${ROOM_EQUIPMENT_WHITELIST.join("、")}）`);
    }
  }
}

/** HTTP 查询串设备解析（equipment=投影,白板 或重复参数数组）+ 严格守卫 */
export function parseEquipmentQuery(input: unknown): string[] {
  assertValidEquipment(input);
  return normalizeEquipment(input);
}

/** 存库 JSON 文本 → 归一设备数组；NULL / 坏 JSON / 存量无列一律视为空（向后兼容） */
export function parseStoredEquipment(raw: unknown): string[] {
  if (raw === undefined || raw === null || raw === "") return [];
  if (Array.isArray(raw)) return normalizeEquipment(raw);
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeEquipment(parsed) : [];
  } catch {
    return [];
  }
}

/** 人数守卫：1..MEETING_CAPACITY_MAX 整数（容量必须能容纳正整数人数） */
export function parseAttendees(value: unknown): number {
  const raw = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  const n = typeof raw === "number" ? raw : Number.NaN;
  if (!Number.isInteger(n) || n < 1 || n > MEETING_CAPACITY_MAX) {
    throw new ValidationError(`参会人数必须是 1..${MEETING_CAPACITY_MAX} 的整数`);
  }
  return n;
}

function splitDateTime(value: unknown, label: string): { date?: string; time: string } {
  if (typeof value !== "string") throw new ValidationError(`${label} 必须是字符串`);
  const full = /^(\d{4}-\d{2}-\d{2})[T ]([0-2]\d:[0-5]\d)$/.exec(value.trim());
  if (full) {
    if (!isIsoDate(full[1]!)) throw new ValidationError(`非法${label}日期：${full[1]}`);
    return { date: full[1], time: full[2]! };
  }
  const clock = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (clock) return { time: value.trim() };
  throw new ValidationError(`非法${label}：${value}`);
}

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * 需求解析：人数 + 设备 + 时段 → 统一 RecommendNeed。
 * start/end 支持 HH:mm（配 date 参数，缺省今天）或 YYYY-MM-DDTHH:mm。
 * 时段倒挂 / 超 8 小时 / 非法日期复用 shared/meetings 的 validateMeetingWindow → 400。
 */
export function parseRecommendNeed(query: Record<string, unknown>): RecommendNeed {
  const attendees = parseAttendees(query.attendees);
  const equipment = parseEquipmentQuery(query.equipment);
  const from = splitDateTime(query.start, "开始时间");
  const to = splitDateTime(query.end, "结束时间");
  const explicit = query.date;
  if (explicit !== undefined && explicit !== null && explicit !== "" &&
      (typeof explicit !== "string" || !isIsoDate(explicit))) {
    throw new ValidationError(`非法会议日期：${String(explicit)}`);
  }
  const date = (typeof explicit === "string" && explicit !== "" ? explicit : undefined)
    ?? from.date ?? to.date ?? localToday();
  const window = validateMeetingWindow(date, from.time, to.time);
  return { attendees, equipment, date, start: window.start as string, end: window.end as string };
}

function roomEquipment(room: RecommendRoom): string[] {
  return normalizeEquipment(room.equipment);
}

/** 时段冲突原因（复用 shared/meetings 的严格重叠判定，边界相接不冲突） */
function conflictReasons(room: RecommendRoom, need: RecommendNeed, meetings: readonly RecommendMeeting[]): string[] {
  const candidate = { roomId: room.id, date: need.date, start: need.start, end: need.end };
  return meetings
    .filter((m) => meetingWindowsOverlap(m, candidate))
    .map((m) => `时段冲突：会议 #${m.id ?? 0} ${m.start}–${m.end}${m.title ? ` ${m.title}` : ""}`)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * 不满足原因，稳定顺序：停用 → 容量不足 → 设备缺失 → 时段冲突。
 * roomMatchesNeed 只数本函数结果，规则绝不写两遍（变异红相同时打中两处）。
 */
export function roomMismatchReasons(
  room: RecommendRoom,
  need: RecommendNeed,
  meetings: readonly RecommendMeeting[],
): string[] {
  const reasons: string[] = [];
  if (!isMeetingRoomActive(room)) reasons.push("会议室已停用");
  if (room.capacity < need.attendees) reasons.push(`容量不足（${room.capacity} < ${need.attendees}）`);
  const owned = roomEquipment(room);
  const missing = need.equipment.filter((item) => !owned.includes(item));
  if (missing.length > 0) reasons.push(`缺少设备：${missing.join("、")}`);
  reasons.push(...conflictReasons(room, need, meetings));
  return reasons;
}

/** 可用判定：容量≥人数 + 设备全含 + 时段不冲突 + active，纯函数 */
export function roomMatchesNeed(
  room: RecommendRoom,
  need: RecommendNeed,
  meetings: readonly RecommendMeeting[],
): boolean {
  return roomMismatchReasons(room, need, meetings).length === 0;
}

/**
 * 推荐：只返回可用房，按「容量最接近人数」升序（容量相同按 id 升序）。
 * 纯函数、只读、无随机；meetings 不修改。
 */
export function recommendRooms(
  rooms: readonly RecommendRoom[],
  need: RecommendNeed,
  meetings: readonly RecommendMeeting[],
): RecommendHit[] {
  return rooms
    .filter((room) => roomMatchesNeed(room, need, meetings))
    .map((room) => ({
      id: room.id,
      name: room.name,
      location: room.location ?? "",
      capacity: room.capacity,
      equipment: roomEquipment(room),
      seatsOver: room.capacity - need.attendees,
    }))
    .sort((a, b) => a.capacity - b.capacity || a.id - b.id);
}

/** 一次装配可用 + 不可用（含原因）；api/web 只消费本结果，零算法分支 */
export function buildRoomRecommendation(
  rooms: readonly RecommendRoom[],
  need: RecommendNeed,
  meetings: readonly RecommendMeeting[],
): RoomRecommendation {
  const available: RecommendHit[] = [];
  const unavailable: RecommendMiss[] = [];
  for (const room of rooms) {
    if (roomMatchesNeed(room, need, meetings)) {
      available.push({
        id: room.id, name: room.name, location: room.location ?? "", capacity: room.capacity,
        equipment: roomEquipment(room), seatsOver: room.capacity - need.attendees,
      });
    } else {
      unavailable.push({
        id: room.id, name: room.name, capacity: room.capacity,
        equipment: roomEquipment(room), reasons: roomMismatchReasons(room, need, meetings),
      });
    }
  }
  available.sort((a, b) => a.capacity - b.capacity || a.id - b.id);
  unavailable.sort((a, b) => a.id - b.id);
  return { need, available, unavailable };
}
