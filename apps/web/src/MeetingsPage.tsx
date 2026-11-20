// 协流 XieFlow — r28「会议」tab：本地会议室预约台账（左会议室 / 中时段网格 / 右预约表单）
// 冲突检测、时段守卫、参会人归一只消费 shared/meetings；本页零算法分支。
// 明确不做：视频会议 / 外部日历（宪法第六条）。
// 截图钉态：?page=meetings&shot=meetings-empty|meetings-list|meetings-grid|meetings-form|meetings-conflict|meetings-error
// ?narrow=1 钉窄屏；?date=&roomId= 深链 reload 不丢（用户第一次用全链路）。
import { useEffect, useState, type ReactElement } from "react";
import {
  formatClockMinutes,
  meetingAvailability,
  parseClockMinutes,
  MEETING_MAX_HOURS,
  type Room,
  type Meeting,
} from "@xieflow/shared/meetings";
import type { Member } from "@xieflow/shared/org";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

const PINNED = new Set([
  "meetings-empty", "meetings-list", "meetings-grid", "meetings-form", "meetings-conflict", "meetings-error",
]);
const GRID_START = 8 * 60;
const GRID_END = 20 * 60;

interface BookingForm {
  title: string;
  roomId: string;
  date: string;
  start: string;
  end: string;
  organizer: string;
  attendees: number[];
}

const SHOT_ROOMS: Room[] = [
  { id: 1, name: "第一会议室", location: "3F 东侧", capacity: 12, active: true, createdAt: "t", updatedAt: "t" },
  { id: 2, name: "第二会议室", location: "3F 西侧", capacity: 6, active: true, createdAt: "t", updatedAt: "t" },
  { id: 3, name: "小会议室（停用）", location: "2F", capacity: 4, active: false, createdAt: "t", updatedAt: "t" },
];
const SHOT_MEETINGS: Meeting[] = [
  { id: 11, roomId: 1, title: "需求评审", date: "2026-11-20", start: "09:00", end: "10:00", organizer: "张三", createdAt: "t", updatedAt: "t" },
  { id: 12, roomId: 1, title: "研发对齐", date: "2026-11-20", start: "10:00", end: "11:00", organizer: "李四", createdAt: "t", updatedAt: "t" },
  { id: 13, roomId: 2, title: "复验排期", date: "2026-11-20", start: "14:00", end: "15:30", organizer: "王五", createdAt: "t", updatedAt: "t" },
];
const SHOT_MEMBERS: Member[] = [
  { id: 1, name: "张三", departmentId: null, role: "member", email: "z@example.com", phone: "", title: "研发", status: "active", userId: null },
  { id: 2, name: "李四", departmentId: null, role: "member", email: "l@example.com", phone: "", title: "测试", status: "active", userId: null },
  { id: 3, name: "王五（停用）", departmentId: null, role: "member", email: "w@example.com", phone: "", title: "产品", status: "inactive", userId: null },
];

function readQuery(): { shot: string; date: string; roomId: string } {
  const p = new URLSearchParams(window.location.search);
  return { shot: p.get("shot") ?? "", date: p.get("date") ?? "", roomId: p.get("roomId") ?? "" };
}

async function getJson<T>(url: string): Promise<T> {
  return (await fetchJsonOrThrow(await apiFetch(url))) as T;
}

function syncUrl(date: string, roomId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("page", "meetings");
  url.searchParams.set("date", date);
  if (roomId !== "") url.searchParams.set("roomId", roomId);
  else url.searchParams.delete("roomId");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function todayStr(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export default function MeetingsPage(): ReactElement {
  const query = readQuery();
  const initialDate = query.date !== "" ? query.date : "2026-11-20";
  const [date, setDate] = useState(initialDate);
  const [rooms, setRooms] = useState<readonly Room[]>(PINNED.has(query.shot) ? SHOT_ROOMS : []);
  const [meetings, setMeetings] = useState<readonly Meeting[]>(
    PINNED.has(query.shot) && query.shot !== "meetings-empty" ? SHOT_MEETINGS : [],
  );
  const [members, setMembers] = useState<readonly Member[]>(PINNED.has(query.shot) ? SHOT_MEMBERS : []);
  const [roomId, setRoomId] = useState(query.roomId !== "" ? Number(query.roomId) : 1);
  const [form, setForm] = useState<BookingForm>({
    title: "", roomId: query.roomId !== "" ? query.roomId : "1",
    date: initialDate, start: "09:00", end: "10:00", organizer: "", attendees: [],
  });
  const [newRoomName, setNewRoomName] = useState("");
  const [conflict, setConflict] = useState<number[]>(query.shot === "meetings-conflict" ? [11, 12] : []);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(query.shot === "meetings-error" ? `${SERVICE_DOWN_MESSAGE}（r28 会议链路错误态）` : "");
  const [phase, setPhase] = useState<"loading" | "ready" | "error">(
    query.shot === "meetings-error" ? "error" : PINNED.has(query.shot) ? "ready" : "loading",
  );

  async function load(nextDate: string, nextRoom: number): Promise<void> {
    if (PINNED.has(query.shot)) return;
    setPhase("loading");
    try {
      const [roomData, meetingData, memberData] = await Promise.all([
        getJson<{ rooms: Room[] }>("/api/rooms"),
        getJson<{ meetings: Meeting[] }>(`/api/meetings?date=${encodeURIComponent(nextDate)}`),
        getJson<{ members: Member[] }>("/api/members"),
      ]);
      setRooms(roomData.rooms);
      setMeetings(meetingData.meetings);
      setMembers(memberData.members);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  useEffect(() => {
    void load(date, roomId);
    // 钉态与首次装载：后续由交互显式调用 load，避免刷新循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseRoom(next: number): void {
    setRoomId(next);
    setForm((f) => ({ ...f, roomId: String(next) }));
    syncUrl(date, String(next));
    setConflict([]);
  }

  function chooseDate(next: string): void {
    setDate(next);
    setForm((f) => ({ ...f, date: next }));
    syncUrl(next, String(roomId));
    setConflict([]);
    void load(next, roomId);
  }

  async function createRoom(): Promise<void> {
    if (newRoomName.trim() === "") { setMessage("请先填写会议室名称"); return; }
    try {
      const res = await apiFetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newRoomName.trim(), location: "", capacity: 8, active: true }),
      });
      await fetchJsonOrThrow(res);
      setNewRoomName("");
      setMessage("会议室已创建");
      await load(date, roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function submitBooking(): Promise<void> {
    setConflict([]);
    setMessage("");
    setError("");
    try {
      const res = await apiFetch("/api/meetings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, roomId: Number(form.roomId), attendees: form.attendees }),
      });
      if (res.status === 409) {
        const data = (await res.json()) as { conflictIds?: number[]; error?: string };
        setConflict(data.conflictIds ?? []);
        setMessage(data.error ?? "该时段已被预约");
        return;
      }
      await fetchJsonOrThrow(res);
      setMessage("预约成功");
      setForm((f) => ({ ...f, title: "", attendees: [] }));
      await load(date, roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const activeRooms = rooms.filter((r) => r.active);
  const gridRooms = meetingAvailability(date, rooms, meetings);
  const shownRoom = gridRooms.find((r) => r.roomId === roomId) ?? gridRooms[0];
  const hours: number[] = [];
  for (let m = GRID_START; m < GRID_END; m += 60) hours.push(m);
  const shotNote = query.shot === "meetings-grid" ? "截图钉态：时段网格展示当日预约（边界相接不冲突）"
    : query.shot === "meetings-form" ? "截图钉态：右侧预约表单与通讯录参会人选择"
      : query.shot === "meetings-conflict" ? "截图钉态：冲突时段被拒，红条回带冲突会议 id"
        : query.shot === "meetings-empty" ? "截图钉态：空会议室台账"
          : "";

  return (
    <div className="meetings-page" data-state="meetings-page">
      <h1>会议管理</h1>
      <p className="meetings-intro">本地会议室预约台账：同室时段重叠会被拒绝（边界相接不冲突），单场最长 {MEETING_MAX_HOURS} 小时；不接视频会议或外部日历。</p>
      {shotNote !== "" && <p className="meetings-shot-note" data-state="meetings-shot-note">{shotNote}</p>}
      {message !== "" && <p className="meetings-ok" data-state="meetings-message">{message}</p>}
      {conflict.length > 0 && (
        <p className="meetings-conflict" role="alert" data-state="meetings-conflict">
          时段冲突：与会议 {conflict.map((id) => `#${id}`).join("、")} 重叠，请改时段或换会议室。
        </p>
      )}
      {error !== "" && <p className="meetings-action-error" role="alert">{error}</p>}

      {phase === "loading" && <p className="state-loading" data-state="meetings-loading">正在装配会议室与时段…</p>}
      {phase === "error" && (
        <div className="state-error" role="alert" data-state="meetings-error">
          <h2>连接失败</h2>
          <p className="error-message">{error}</p>
          <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后重试。</p>
          <button type="button" onClick={() => { setError(""); void load(date, roomId); }}>重试</button>
        </div>
      )}
      {phase === "ready" && (
        <div className="meetings-columns" data-state="meetings-columns">
          <section className="meeting-rooms" data-state="meeting-rooms">
            <h2>会议室</h2>
            {activeRooms.length === 0 && <p className="empty" data-state="meeting-rooms-empty">还没有会议室——先在下方新建一间。</p>}
            <ul>
              {rooms.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`meeting-room ${roomId === r.id ? "meeting-room-active" : ""} ${r.active ? "" : "meeting-room-off"}`}
                    data-action="meeting-room-select" data-room-id={r.id}
                    onClick={() => chooseRoom(r.id)}
                  >
                    <strong>{r.name}</strong>
                    <small>{r.active ? `${r.location || "未填位置"} · ${r.capacity} 人` : "已停用"}</small>
                  </button>
                </li>
              ))}
            </ul>
            <div className="meeting-new-room" data-state="meeting-new-room">
              <label>新建会议室 <input data-state="meeting-new-room-name" value={newRoomName} placeholder="会议室名称" onChange={(e) => setNewRoomName(e.target.value)} /></label>
              <button type="button" data-action="meeting-room-create" onClick={() => void createRoom()}>新建</button>
            </div>
          </section>

          <section className="meeting-grid" data-state="meeting-grid">
            <h2>时段网格 · {date}</h2>
            <label className="meeting-date">日期 <input type="date" data-state="meeting-date" value={date} onChange={(e) => chooseDate(e.target.value)} /></label>
            {shownRoom === undefined ? (
              <p className="empty" data-state="meeting-grid-empty">该日期暂无可用会议室。</p>
            ) : (
              <div className="meeting-grid-body" data-room-id={shownRoom.roomId}>
                {hours.map((minute) => {
                  const hour = formatClockMinutes(minute);
                  const booked = shownRoom.bookings.filter((b) => {
                    const s = parseClockMinutes(b.start);
                    const e = parseClockMinutes(b.end);
                    return s < minute + 60 && minute < e;
                  });
                  return (
                    <div className="meeting-grid-row" key={hour} data-state="meeting-grid-row" data-hour={hour}>
                      <span className="meeting-grid-hour">{hour}</span>
                      <span className="meeting-grid-slot">
                        {booked.map((b) => (
                          <span className="meeting-grid-bar" key={b.id} data-state="meeting-grid-bar" data-booking-id={b.id}>
                            {b.start}–{b.end} {b.title}
                          </span>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="meeting-form" data-state="meeting-form">
            <h2>预约会议</h2>
            <label>会议标题 <input data-state="meeting-title" value={form.title} placeholder="例如：需求评审" onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
            <label>会议室
              <select data-state="meeting-room-select" value={form.roomId} onChange={(e) => chooseRoom(Number(e.target.value))}>
                {activeRooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label>日期 <input type="date" data-state="meeting-form-date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></label>
            <label>开始 <input type="time" data-state="meeting-start" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} /></label>
            <label>结束 <input type="time" data-state="meeting-end" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} /></label>
            <label>组织者 <input data-state="meeting-organizer" value={form.organizer} placeholder="姓名" onChange={(e) => setForm((f) => ({ ...f, organizer: e.target.value }))} /></label>
            <fieldset className="meeting-attendees" data-state="meeting-attendees">
              <legend>参会人（从通讯录选）</legend>
              {members.map((m) => (
                <label key={m.id} className="meeting-attendee">
                  <input
                    type="checkbox" data-action="meeting-attendee-toggle" data-member-id={m.id}
                    checked={form.attendees.includes(m.id)}
                    disabled={m.status !== "active"}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      attendees: e.target.checked ? [...f.attendees, m.id] : f.attendees.filter((id) => id !== m.id),
                    }))}
                  />
                  {m.name}{m.status !== "active" ? "（停用）" : ""}
                </label>
              ))}
              {members.length === 0 && <p className="empty" data-state="meeting-attendees-empty">通讯录暂无成员。</p>}
            </fieldset>
            <button type="button" className="btn-primary" data-action="meeting-book" onClick={() => void submitBooking()}>预约</button>
          </section>
        </div>
      )}
    </div>
  );
}
