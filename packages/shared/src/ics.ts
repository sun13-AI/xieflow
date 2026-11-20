// 协流 XieFlow — shared/ics.ts：标准 iCalendar（RFC 5545）编解码与导入规划唯一口径（r35）
// escape / UTC 日期 / 折叠 / 装配 / 回读 / 领域映射 / 导入规划全在本文件；api 与 web 只装配，
// 零算法分支、零新依赖（只用 ECMAScript + 既有 shared 数据契约）、零 token。
import {
  ValidationError,
  REPEAT_LABELS,
  TODO_STATUS_LABELS,
  LINK_SCHEDULE_DEFAULT_START,
  LINK_SCHEDULE_DEFAULT_END,
  assertValidScheduleTitle,
  assertValidScheduleRange,
  assertValidScheduleRepeat,
  localDateStr,
  localDateOffset,
  type Schedule,
  type ScheduleRepeat,
  type Todo,
} from "./index.js";

/** RFC 5545：内容行以 CRLF 结束，单行不超过 75 个八位组 */
export const ICS_LINE_SEPARATOR = "\r\n";
export const ICS_MAX_LINE_OCTETS = 75;
/** 稳定 UID 的本地域名（非密钥、非 token，仅保证跨导出一致） */
export const ICS_UID_DOMAIN = "xieflow.local";
export const ICS_DEFAULT_PRODUCT_ID = "-//XieFlow//Calendar//CN";
export const ICS_DEFAULT_CALENDAR_NAME = "协流 XieFlow";

/** ICS 事件（api/web 与 shared 之间唯一的数据契约） */
export interface IcsEvent {
  readonly uid: string;
  /** UTC：YYYYMMDDTHHMMSSZ */
  readonly dtStart: string;
  readonly dtEnd: string;
  readonly summary: string;
  readonly description: string;
  readonly location: string;
  readonly repeat?: ScheduleRepeat;
  readonly kind?: "schedule" | "todo-due";
  readonly sourceId?: number;
  readonly sourceDate?: string;
}

/** 日历头元信息（不参与 UID 计算，仅决定输出头） */
export interface IcsCalendarMeta {
  readonly productId?: string;
  readonly calendarName?: string;
  readonly method?: string;
  /** UTC 串；缺省用固定值以保证相同输入逐字节稳定 */
  readonly dtStamp?: string;
}

/** 回读解析结果 */
export interface IcsCalendar {
  readonly version: string;
  readonly productId: string;
  readonly calendarName: string;
  readonly method: string;
  readonly events: IcsEvent[];
}

/** 导入预览计划：解析出的事件 + 归一后的日程草稿（未写库） */
export interface IcsImportPlan {
  readonly calendar: IcsCalendar;
  readonly events: IcsEvent[];
  readonly drafts: IcsScheduleDraft[];
  readonly count: number;
}

export interface IcsScheduleDraft {
  readonly title: string;
  readonly date: string;
  readonly start: string;
  readonly end: string;
  readonly repeat: ScheduleRepeat;
}

/** 坏 ICS（api 映射 400） */
export class InvalidIcsError extends ValidationError {
  constructor(message: string) {
    super(`ICS 格式非法：${message}`);
    this.name = "InvalidIcsError";
  }
}

/**
 * RFC 5545 TEXT 转义：反斜杠优先，再换行，最后逗号/分号。
 * 顺序敏感：先逗号后反斜杠会把转义符再次转义（r35 变异红相监控点）。
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\r\n?|\n/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** 回读反转义：\n / \N / \, / \; / \\ */
export function unescapeIcsText(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = value[i + 1];
    if (next === undefined) {
      out += "\\";
      continue;
    }
    i++;
    if (next === "n" || next === "N") out += "\n";
    else if (next === ",") out += ",";
    else if (next === ";") out += ";";
    else if (next === "\\") out += "\\";
    else out += next; // 未知转义宽容处理：不丢字符
  }
  return out;
}

/** UTC 格式 YYYYMMDDTHHMMSSZ；Date / ISO 串 / 毫秒时间戳均可 */
export function formatIcsDate(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new InvalidIcsError("无法识别的日期");
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

/** ICS UTC 串 → Date（含 YYYYMMDD 全日值，按本地零点）；非法返回 null */
export function parseIcsDate(value: string): Date | null {
  const full = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (full) {
    const [, y, mo, d, h, mi, s] = full;
    const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
    const dt = new Date(ms);
    if (formatIcsDate(dt) !== value) return null;
    return dt;
  }
  const allDay = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (allDay) {
    const [, y, mo, d] = allDay;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0);
    return localDateStr(dt) === `${y}-${mo}-${d}` ? dt : null;
  }
  return null;
}

/** 行折叠：按 UTF-8 八位组切分，续行以单个空格开头（不切断多字节字符） */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = ICS_MAX_LINE_OCTETS;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit && current !== "") {
      parts.push(current);
      current = ` ${ch}`;
      bytes = 1 + size;
      limit = ICS_MAX_LINE_OCTETS;
    } else {
      current += ch;
      bytes += size;
    }
  }
  parts.push(current);
  return parts.join(ICS_LINE_SEPARATOR);
}

/** 续行展开：CRLF/CR/LF 统一为 LF，紧随的空格或制表符承接上一行 */
export function unfoldIcsLines(text: string): string {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const out: string[] = [];
  for (const line of normalized.split("\n")) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] = (out[out.length - 1] ?? "") + line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") throw new InvalidIcsError(`缺少 ${field}`);
  return value;
}

/**
 * VEVENT 装配：完整 VCALENDAR 头 + 逐事件标准字段 + X-XIEFLOW-* 扩展元数据。
 * 所有文本字段统一转义并折叠；相同输入（含 dtStamp）逐字节稳定。
 */
export function buildIcsCalendar(events: readonly IcsEvent[], meta: IcsCalendarMeta = {}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${escapeIcsText(meta.productId ?? ICS_DEFAULT_PRODUCT_ID)}`,
    "CALSCALE:GREGORIAN",
    `METHOD:${escapeIcsText(meta.method ?? "PUBLISH")}`,
    `X-WR-CALNAME:${escapeIcsText(meta.calendarName ?? ICS_DEFAULT_CALENDAR_NAME)}`,
  ];
  const dtStamp = meta.dtStamp ?? "20000101T000000Z";
  for (const ev of events) {
    const uid = requiredText(ev.uid, "UID");
    const dtStart = requiredText(ev.dtStart, "DTSTART");
    const dtEnd = requiredText(ev.dtEnd, "DTEND");
    const summary = requiredText(ev.summary, "SUMMARY");
    if (parseIcsDate(dtStart) === null || parseIcsDate(dtEnd) === null) {
      throw new InvalidIcsError("DTSTART/DTEND 必须是 YYYYMMDDTHHMMSSZ");
    }
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(ev.description ?? "")}`,
      `LOCATION:${escapeIcsText(ev.location ?? "")}`,
      `X-XIEFLOW-KIND:${ev.kind ?? "schedule"}`,
    );
    if (ev.repeat) lines.push(`X-XIEFLOW-REPEAT:${ev.repeat}`);
    if (ev.sourceId !== undefined) lines.push(`X-XIEFLOW-SOURCE-ID:${ev.sourceId}`);
    if (ev.sourceDate !== undefined) lines.push(`X-XIEFLOW-SOURCE-DATE:${ev.sourceDate}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join(ICS_LINE_SEPARATOR) + ICS_LINE_SEPARATOR;
}

/** 回读解析：展开续行 → 校验头尾 → 逐 VEVENT 还原文本与扩展元数据 */
export function parseIcsCalendar(ics: string): IcsCalendar {
  if (typeof ics !== "string") throw new InvalidIcsError("内容必须是字符串");
  const lines = unfoldIcsLines(ics).split("\n").filter((l) => l !== "");
  if (lines[0] !== "BEGIN:VCALENDAR" || lines[lines.length - 1] !== "END:VCALENDAR") {
    throw new InvalidIcsError("缺少 VCALENDAR 头尾");
  }
  let version = "";
  let productId = ICS_DEFAULT_PRODUCT_ID;
  let calendarName = ICS_DEFAULT_CALENDAR_NAME;
  let method = "PUBLISH";
  const events: IcsEvent[] = [];
  let cursor = 1;
  while (cursor < lines.length - 1) {
    const line = lines[cursor]!;
    if (line === "BEGIN:VEVENT") {
      const props = new Map<string, string>();
      cursor++;
      while (cursor < lines.length && lines[cursor] !== "END:VEVENT") {
        const raw = lines[cursor]!;
        const sep = raw.indexOf(":");
        if (sep < 1) throw new InvalidIcsError(`属性行非法：${raw}`);
        const name = (raw.slice(0, sep).split(";")[0] ?? "").toUpperCase();
        props.set(name, raw.slice(sep + 1));
        cursor++;
      }
      if (lines[cursor] !== "END:VEVENT") throw new InvalidIcsError("缺少 END:VEVENT");
      cursor++;
      const uid = requiredText(props.get("UID"), "UID");
      const dtStart = requiredText(props.get("DTSTART"), "DTSTART");
      const dtEnd = requiredText(props.get("DTEND"), "DTEND");
      const summary = requiredText(props.get("SUMMARY"), "SUMMARY");
      if (parseIcsDate(dtStart) === null || parseIcsDate(dtEnd) === null) {
        throw new InvalidIcsError("DTSTART/DTEND 格式非法");
      }
      const kindRaw = props.get("X-XIEFLOW-KIND");
      const repeatRaw = props.get("X-XIEFLOW-REPEAT");
      const repeat = repeatRaw && repeatRaw in REPEAT_LABELS ? (repeatRaw as ScheduleRepeat) : undefined;
      const sourceRaw = props.get("X-XIEFLOW-SOURCE-ID");
      const sourceId = sourceRaw !== undefined && /^\d+$/.test(sourceRaw) ? Number(sourceRaw) : undefined;
      events.push({
        uid: unescapeIcsText(uid),
        dtStart,
        dtEnd,
        summary: unescapeIcsText(summary),
        description: unescapeIcsText(props.get("DESCRIPTION") ?? ""),
        location: unescapeIcsText(props.get("LOCATION") ?? ""),
        ...(repeat ? { repeat } : {}),
        ...(kindRaw === "schedule" || kindRaw === "todo-due" ? { kind: kindRaw } : {}),
        ...(sourceId !== undefined ? { sourceId } : {}),
        ...(props.has("X-XIEFLOW-SOURCE-DATE") ? { sourceDate: unescapeIcsText(props.get("X-XIEFLOW-SOURCE-DATE")!) } : {}),
      });
      continue;
    }
    const sep = line.indexOf(":");
    if (sep < 1) throw new InvalidIcsError(`属性行非法：${line}`);
    const name = (line.slice(0, sep).split(";")[0] ?? "").toUpperCase();
    const value = unescapeIcsText(line.slice(sep + 1));
    if (name === "VERSION") version = value;
    else if (name === "PRODID") productId = value;
    else if (name === "X-WR-CALNAME") calendarName = value;
    else if (name === "METHOD") method = value;
    cursor++;
  }
  if (version !== "2.0") throw new InvalidIcsError("VERSION 必须为 2.0");
  return { version, productId, calendarName, method, events };
}

/** 订阅源默认滚动窗口（本地日期，前后 30/365 天），规则集中 shared，api 不散落日期算术 */
export function icsFeedWindow(now: Date = new Date()): { from: string; to: string } {
  return { from: localDateOffset(-30, now), to: localDateOffset(365, now) };
}

/** 日程 → ICS 事件（UID = id + 日期，重复实例按实例日期区分；重复调用逐字节稳定） */
export function scheduleToIcsEvent(schedule: Schedule & { isInstance?: boolean }): IcsEvent {
  const dtStart = formatIcsDate(new Date(`${schedule.date}T${schedule.start}:00`));
  const dtEnd = formatIcsDate(new Date(`${schedule.date}T${schedule.end}:00`));
  assertValidScheduleRepeat(schedule.repeat);
  const sourceDate = schedule.date;
  return {
    uid: `schedule-${schedule.id}-${sourceDate.replace(/-/g, "")}@${ICS_UID_DOMAIN}`,
    dtStart,
    dtEnd,
    summary: schedule.title,
    description: `协流 XieFlow 日程\n重复规则：${REPEAT_LABELS[schedule.repeat]}\n原始日期：${sourceDate}${schedule.todoId !== null ? `\n关联待办：#${schedule.todoId}` : ""}`,
    location: "协流 XieFlow · 日程",
    repeat: schedule.repeat,
    kind: "schedule",
    sourceId: schedule.id,
    sourceDate,
  };
}

/** 待办截止日 → 全天任务式 VEVENT（默认 09:00~10:00，与 r3 联动默认时段一致） */
export function todoDueToIcsEvent(todo: Todo): IcsEvent | null {
  if (todo.dueDate === null) return null;
  const dtStart = formatIcsDate(new Date(`${todo.dueDate}T${LINK_SCHEDULE_DEFAULT_START}:00`));
  const dtEnd = formatIcsDate(new Date(`${todo.dueDate}T${LINK_SCHEDULE_DEFAULT_END}:00`));
  return {
    uid: `todo-due-${todo.id}@${ICS_UID_DOMAIN}`,
    dtStart,
    dtEnd,
    summary: `${todo.title}（截止）`,
    description: `协流 XieFlow 待办截止日\n状态：${TODO_STATUS_LABELS[todo.status]}\n截止日期：${todo.dueDate}`,
    location: "协流 XieFlow · 待办",
    kind: "todo-due",
    sourceId: todo.id,
    sourceDate: todo.dueDate,
  };
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** ICS 事件 → 日程草稿（仅解析既有契约，校验仍走 shared 守卫；api/web 零算法分支） */
export function icsEventToScheduleDraft(event: IcsEvent): IcsScheduleDraft {
  const start = parseIcsDate(event.dtStart);
  const end = parseIcsDate(event.dtEnd);
  if (start === null || end === null) throw new InvalidIcsError("DTSTART/DTEND 格式非法");
  const repeat = event.repeat ?? "none";
  assertValidScheduleRepeat(repeat);
  const draft: IcsScheduleDraft = {
    title: event.summary,
    date: localDateStr(start),
    start: `${pad2(start.getHours())}:${pad2(start.getMinutes())}`,
    end: `${pad2(end.getHours())}:${pad2(end.getMinutes())}`,
    repeat,
  };
  assertValidScheduleTitle(draft.title);
  assertValidScheduleRange(draft.start, draft.end);
  return draft;
}

/** 导入预览规划：坏 ICS / 坏草稿在写库前抛错（零半态） */
export function planIcsImport(ics: string): IcsImportPlan {
  const calendar = parseIcsCalendar(ics);
  const drafts = calendar.events.map(icsEventToScheduleDraft);
  return { calendar, events: calendar.events, drafts, count: drafts.length };
}
