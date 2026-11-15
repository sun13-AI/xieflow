// 协流 XieFlow — r3 日程页：月视图网格 + 日期点击建日程 + 关联待办状态徽标
// 数据契约全部来自 @xieflow/shared（repeat 枚举/标签集中定义，UI 不散落逻辑）。
// 截图钉态：?page=schedules&shot=schedule-* 让 headless 确定性捕获（真实状态都存在）。
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  REPEAT_LABELS,
  localDateStr,
  localDateOffset,
  type Schedule,
  type ScheduleRepeat,
  type Todo,
} from "@xieflow/shared";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow } from "./httpClient";

const REPEAT_OPTIONS = Object.keys(REPEAT_LABELS) as ScheduleRepeat[];
const WEEK_HEADERS = ["一", "二", "三", "四", "五", "六", "日"] as const;

const TODO_STATUS_BADGES: Record<Todo["status"], { label: string; cls: string }> = {
  open: { label: "进行中", cls: "pill-open" },
  done: { label: "已完成", cls: "pill-done" },
  archived: { label: "已归档", cls: "pill-archived" },
};

interface SchedulesLoadState {
  phase: "loading" | "error" | "ready";
  message?: string;
  schedules?: Schedule[];
  todos?: Todo[];
}

interface MonthFetch {
  schedules: Schedule[];
  todos: Todo[];
}

/** 月视图数据：当月区间日程 + 全量待办（徽标按 todoId 查状态） */
async function fetchMonth(monthStart: string, monthEnd: string): Promise<MonthFetch> {
  const [schRes, todoRes] = await Promise.all([
    fetch(`/api/schedules?from=${monthStart}&to=${monthEnd}`),
    fetch("/api/todos"),
  ]);
  const schData = (await fetchJsonOrThrow(schRes)) as { schedules: Schedule[] };
  const todoData = (await fetchJsonOrThrow(todoRes)) as { todos: Todo[] };
  return { schedules: schData.schedules, todos: todoData.todos };
}

/** 钉态种子（与 audit-http 联动断言场景同构：待办徽标 open/done 各一） */
function pinSeed(now: Date): MonthFetch {
  const today = localDateStr(now);
  const plus = (n: number): string => localDateOffset(n, now);
  const iso = `${today}T09:00:00.000Z`;
  const todos: Todo[] = [
    { id: 11, title: "写 r3 联动复验材料", quadrant: "q2", status: "open", dueDate: plus(2), createdAt: iso, updatedAt: iso },
    { id: 12, title: "r2 遗留 alert 收敛", quadrant: "q3", status: "done", dueDate: today, createdAt: iso, updatedAt: iso },
  ];
  const schedules: Schedule[] = [
    { id: 21, title: "需求评审会", date: today, start: "10:00", end: "11:00", todoId: null, repeat: "none", createdAt: iso, updatedAt: iso },
    { id: 22, title: "每日站会", date: plus(1), start: "09:00", end: "09:30", todoId: null, repeat: "daily", createdAt: iso, updatedAt: iso },
    { id: 23, title: "写 r3 联动复验材料", date: plus(2), start: "09:00", end: "10:00", todoId: 11, repeat: "none", createdAt: iso, updatedAt: iso },
    { id: 24, title: "r2 遗留 alert 收敛", date: today, start: "15:00", end: "16:00", todoId: 12, repeat: "none", createdAt: iso, updatedAt: iso },
    { id: 25, title: "月度复盘", date: plus(5), start: "14:00", end: "15:00", todoId: null, repeat: "monthly", createdAt: iso, updatedAt: iso },
  ];
  return { schedules, todos };
}

/** 窄屏钉态种子（r3 返工#1 D）：488px 视口首屏拍的是本月第一周段落，
 *  日程必须落进 11-02~11-08 一带才能进画面；日程带 todoId 以便展示徽标。 */
function pinSeedNarrow(now: Date): MonthFetch {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const firstWeek = (day: number): string => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-0${day}`;
  const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-03T09:00:00.000Z`;
  const todos: Todo[] = [
    { id: 41, title: "窄屏联动徽标样本", quadrant: "q2", status: "open", dueDate: firstWeek(4), createdAt: iso, updatedAt: iso },
  ];
  const schedules: Schedule[] = [
    { id: 51, title: "周一晨会", date: firstWeek(2), start: "09:00", end: "09:30", todoId: null, repeat: "none", createdAt: iso, updatedAt: iso },
    { id: 52, title: "窄屏联动徽标样本", date: firstWeek(4), start: "10:00", end: "11:00", todoId: 41, repeat: "none", createdAt: iso, updatedAt: iso },
    { id: 53, title: "周五复盘", date: firstWeek(6), start: "14:00", end: "15:00", todoId: null, repeat: "weekly", createdAt: iso, updatedAt: iso },
  ];
  return { schedules, todos };
}

/** 徽标种子：只保留关联日程（联动徽标形态专用） */
function pinSeedLinked(now: Date): MonthFetch {
  const full = pinSeed(now);
  return {
    schedules: full.schedules.filter((s) => s.todoId !== null),
    todos: full.todos,
  };
}

/** 月视图 6×7 网格：周一开头，返回每格的 YYYY-MM-DD 与是否当月 */
function monthCells(year: number, month: number): Array<{ date: string; inMonth: boolean }> {
  const first = new Date(year, month, 1);
  // getDay(): 0=周日…6=周六 → 周一开头偏移
  const lead = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - lead);
  const cells: Array<{ date: string; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    cells.push({ date: localDateStr(d), inMonth: d.getMonth() === month });
  }
  return cells;
}

interface Draft {
  title: string;
  date: string;
  start: string;
  end: string;
  todoId: string; // "" 表示不关联
  repeat: ScheduleRepeat;
}

const EMPTY_DRAFT: Draft = { title: "", date: "", start: "09:00", end: "10:00", todoId: "", repeat: "none" };

export default function SchedulesPage() {
  const [state, setState] = useState<SchedulesLoadState>({ phase: "loading" });
  const shot = useMemo(() => new URLSearchParams(window.location.search).get("shot"), []);
  const today = useMemo(() => localDateStr(new Date()), []);
  // 月游标：钉态固定种子所在月（本月），真实模式从本月起浏览
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [modalOpen, setModalOpen] = useState(() => shot === "schedule-modal");
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [draft, setDraft] = useState<Draft>(() => ({
    ...EMPTY_DRAFT,
    date: localDateStr(new Date()),
  }));
  const [submitError, setSubmitError] = useState<string | null>(null);

  const monthStart = useMemo(
    () => localDateStr(new Date(cursor.year, cursor.month, 1)),
    [cursor],
  );
  const monthEnd = useMemo(
    () => localDateStr(new Date(cursor.year, cursor.month + 1, 0)),
    [cursor],
  );

  const load = useCallback(async (): Promise<void> => {
    try {
      const data = await fetchMonth(monthStart, monthEnd);
      setState({ phase: "ready", ...data });
    } catch (err: unknown) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [monthStart, monthEnd]);

  useEffect(() => {
    if (shot === "schedule-empty") {
      setState({ phase: "ready", schedules: [], todos: [] });
      return;
    }
    if (shot === "schedule-loading") {
      setState({ phase: "loading" });
      return;
    }
    if (shot === "schedule-error") {
      setState({ phase: "error", message: SERVICE_DOWN_MESSAGE + "（截图钉态：真实场景为 api 停机时 vite 代理 5xx）" });
      return;
    }
    if (shot === "schedule-modal") {
      setState({ phase: "ready", schedules: [], todos: [] });
      return;
    }
    if (shot === "schedule-data" || shot === "schedule-badge") {
      const data = shot === "schedule-badge" ? pinSeedLinked(new Date()) : pinSeed(new Date());
      setState({ phase: "ready", ...data });
      return;
    }
    if (shot === "schedule-narrow") {
      setState({ phase: "ready", ...pinSeedNarrow(new Date()) });
      return;
    }
    void load();
  }, [shot, load]);

  const todos = state.phase === "ready" ? (state.todos ?? []) : [];
  const schedules = state.phase === "ready" ? (state.schedules ?? []) : [];
  const todoById = useMemo(() => new Map(todos.map((t) => [t.id, t])), [todos]);
  const schedulesByDate = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    for (const s of schedules) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [schedules]);

  /** 日期点击建日程（钉态下不交互） */
  const openCreateOn = (date: string): void => {
    if (shot) return;
    setEditing(null);
    setDraft({ ...EMPTY_DRAFT, date });
    setSubmitError(null);
    setModalOpen(true);
  };

  /** 日程块点击改期/编辑（联动入口：改 date 会回写关联待办 dueDate） */
  const openEdit = (s: Schedule): void => {
    if (shot) return;
    setEditing(s);
    setDraft({
      title: s.title,
      date: s.date,
      start: s.start,
      end: s.end,
      todoId: s.todoId === null ? "" : String(s.todoId),
      repeat: s.repeat,
    });
    setSubmitError(null);
    setModalOpen(true);
  };

  const submitDraft = async (): Promise<void> => {
    setSubmitError(null);
    const payload = {
      title: draft.title,
      date: draft.date,
      start: draft.start,
      end: draft.end,
      todoId: draft.todoId === "" ? null : Number(draft.todoId),
      repeat: draft.repeat,
    };
    try {
      const res = editing
        ? await fetch(`/api/schedules/${editing.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/schedules", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = (await fetchJsonOrThrow(res)) as { error?: string } | null;
      if (!(res.status === 201 || res.status === 200)) {
        setSubmitError(data?.error ?? "保存失败，请稍后重试");
        return;
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    }
  };

  if (state.phase === "loading") {
    return (
      <section className="card state-loading" data-state="schedule-loading">
        <p>正在加载日程…</p>
      </section>
    );
  }

  if (state.phase === "error") {
    return (
      <section className="card state-error" data-state="schedule-error" role="alert">
        <h2>加载失败</h2>
        <p className="error-message">{state.message}</p>
        <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后刷新本页。</p>
      </section>
    );
  }

  const cells = monthCells(cursor.year, cursor.month);
  const isPinned = shot !== null;

  return (
    <div className="schedules-page" data-state="schedule-ready">
      <div className="toolbar schedule-toolbar">
        <div className="month-nav">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 }))}
          >
            ‹
          </button>
          <span className="month-label">{cursor.year} 年 {cursor.month + 1} 月</span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 }))}
          >
            ›
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => {
              const n = new Date();
              setCursor({ year: n.getFullYear(), month: n.getMonth() });
            }}
          >
            今天
          </button>
        </div>
        <span className="hint">点任意日期新建日程；点日程块可改期（关联待办会同步）。</span>
      </div>

      {schedules.length === 0 && (
        <section className="card" data-state="schedule-empty">
          <p className="empty">本月暂无日程——点网格中的任意日期开始安排，或切换月份查看。</p>
        </section>
      )}

      <div className="calendar card" data-state="calendar">
        <div className="cal-header">
          {WEEK_HEADERS.map((w) => (
            <div key={w} className="cal-head-cell">{w}</div>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((c) => {
            const items = schedulesByDate.get(c.date) ?? [];
            return (
              <div
                key={c.date}
                className={`cal-cell ${c.inMonth ? "" : "cal-outside"} ${c.date === today ? "cal-today" : ""}`}
                data-date={c.date}
                onClick={() => openCreateOn(c.date)}
                role={isPinned ? undefined : "button"}
              >
                <span className="cal-day">{Number(c.date.slice(8, 10))}</span>
                <div className="cal-chips">
                  {items.map((s) => {
                    const linked = s.todoId !== null ? todoById.get(s.todoId) : undefined;
                    return (
                      <button
                        key={`${s.id}-${s.date}`}
                        type="button"
                        className="cal-chip"
                        data-schedule-id={s.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(s);
                        }}
                        title={`${s.start}–${s.end} ${s.title}`}
                      >
                        <span className="cal-chip-time">{s.start}</span>
                        <span className="cal-chip-title">{s.title}</span>
                        {linked && (
                          <span className={`status-pill ${TODO_STATUS_BADGES[linked.status].cls}`}>
                            {TODO_STATUS_BADGES[linked.status].label}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modalOpen && (
        <div className="modal-backdrop" data-state="schedule-modal">
          <div className="modal-card" role="dialog" aria-label={editing ? "编辑日程" : "新建日程"}>
            <h2>{editing ? "编辑日程" : "新建日程"}</h2>
            <label className="field">
              <span className="field-label">标题（必填，最多 200 字，当前 {draft.title.length}）</span>
              <input
                type="text"
                value={draft.title}
                maxLength={200}
                placeholder="例：季度评审会"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">日期（必填）</span>
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <div className="field-pair">
              <label className="field">
                <span className="field-label">开始时间</span>
                <input
                  type="time"
                  value={draft.start}
                  onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field-label">结束时间</span>
                <input
                  type="time"
                  value={draft.end}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                />
              </label>
            </div>
            <label className="field">
              <span className="field-label">重复</span>
              <select
                value={draft.repeat}
                onChange={(e) => setDraft({ ...draft, repeat: e.target.value as ScheduleRepeat })}
              >
                {REPEAT_OPTIONS.map((r) => (
                  <option key={r} value={r}>{REPEAT_LABELS[r]}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">关联待办（可选：改期时待办截止日跟着变）</span>
              <select
                value={draft.todoId}
                onChange={(e) => setDraft({ ...draft, todoId: e.target.value })}
              >
                <option value="">不关联</option>
                {todos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}（{TODO_STATUS_BADGES[t.status].label}）
                  </option>
                ))}
              </select>
            </label>
            {submitError && (
              <p className="error-message" role="alert">{submitError}</p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setModalOpen(false); setEditing(null); }}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void submitDraft()}>
                {editing ? "保存" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="hint seam-note">
        联动规则：待办设置截止日会自动生成关联日程；日程改期会同步回写待办的截止日，双向一致。
      </p>
    </div>
  );
}
