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
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

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
    apiFetch(`/api/schedules?from=${monthStart}&to=${monthEnd}`),
    apiFetch("/api/todos"),
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
  // r26 返工#1：通知 deep-link 的 scheduleId 在月视图里高亮定位目标日程
  const [linkedScheduleId] = useState(() => Number(new URLSearchParams(window.location.search).get("scheduleId")) || 0);
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

  // r35：ICS 导出 / 订阅设置 / 导入预览（解析与规划走 shared + api，本页只装配与渲染）
  type IcsPanel = "export" | "feed" | "import" | null;
  interface IcsDraft {
    title: string;
    date: string;
    start: string;
    end: string;
    repeat: string;
  }
  interface IcsPreview {
    count: number;
    events: Array<{ uid: string; summary: string; dtStart: string; dtEnd: string; description: string; location: string }>;
    drafts: IcsDraft[];
  }
  const pinnedDraft = (title: string, date: string): IcsDraft => ({
    title,
    date,
    start: "10:00",
    end: "11:00",
    repeat: "none",
  });
  const pinnedPreview = (): IcsPreview => {
    const seed = pinSeed(new Date()).schedules.slice(0, 2);
    return {
      count: seed.length,
      events: seed.map((s) => ({
        uid: `schedule-${s.id}-${s.date.replace(/-/g, "")}@xieflow.local`,
        summary: s.title,
        dtStart: `${s.date}T${s.start}:00`,
        dtEnd: `${s.date}T${s.end}:00`,
        description: `协流 XieFlow 日程\n重复规则：${REPEAT_LABELS[s.repeat]}\n原始日期：${s.date}`,
        location: "协流 XieFlow · 日程",
      })),
      drafts: seed.map((s) => pinnedDraft(s.title, s.date)),
    };
  };
  const [icsPanel, setIcsPanel] = useState<IcsPanel>(() => {
    if (shot === "ics-export-menu" || shot === "ics-saved") return "export";
    if (shot === "ics-feed-card") return "feed";
    if (shot === "ics-import-preview" || shot === "ics-import-success" || shot === "ics-error") return "import";
    if (shot === "ics-narrow") return "import";
    return null;
  });
  const [icsSaved, setIcsSaved] = useState<{ filename: string; count: number; bytes: number } | null>(
    () => shot === "ics-saved" ? { filename: `xieflow-schedules-${localDateStr(new Date())}-${localDateOffset(30, new Date())}.ics`, count: 3, bytes: 1842 } : null,
  );
  const [icsFeedKey, setIcsFeedKey] = useState<string | null>(
    () => shot === "ics-feed-card" ? "r35feedpin0000000000000000" : null,
  );
  const [icsImportText, setIcsImportText] = useState("");
  const [icsPreview, setIcsPreview] = useState<IcsPreview | null>(
    () => (shot === "ics-import-preview" || shot === "ics-import-success" || shot === "ics-narrow") ? pinnedPreview() : null,
  );
  const [icsImportedCount, setIcsImportedCount] = useState<number | null>(
    () => shot === "ics-import-success" ? 2 : null,
  );
  const [icsError, setIcsError] = useState<string | null>(
    () => shot === "ics-error" ? "ICS 解析失败：缺少 VCALENDAR 头尾，请粘贴完整 .ics 文件" : null,
  );
  const [icsBusy, setIcsBusy] = useState(false);

  const icsErrorText = (err: unknown): string => err instanceof Error ? err.message : String(err);

  /** 真取 API 响应 → Blob 触发浏览器下载 → 页面回显落盘佐证（文件名/事件数/字节数） */
  const exportIcs = async (kind: "schedules" | "todos"): Promise<void> => {
    setIcsError(null);
    setIcsBusy(true);
    try {
      const url = kind === "schedules"
        ? `/api/schedules/export.ics?from=${monthStart}&to=${monthEnd}`
        : "/api/todos/due.ics";
      const res = await apiFetch(url);
      const text = await res.text();
      if (!res.ok) {
        let message = `导出失败（HTTP ${res.status}）`;
        try { message = (JSON.parse(text) as { error?: string }).error ?? message; } catch { /* 非 JSON 错误体 */ }
        throw new Error(message);
      }
      const filename = kind === "schedules"
        ? `xieflow-schedules-${monthStart}-${monthEnd}.ics`
        : "xieflow-todos-due.ics";
      const href = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      setIcsSaved({ filename, count: (text.match(/BEGIN:VEVENT/g) ?? []).length, bytes: new TextEncoder().encode(text).length });
    } catch (err) {
      setIcsError(icsErrorText(err));
    } finally {
      setIcsBusy(false);
    }
  };

  /** 本地随机订阅 key（存 settings，不是密钥/token） */
  const generateFeedKey = async (): Promise<void> => {
    setIcsError(null);
    setIcsBusy(true);
    try {
      const res = await apiFetch("/api/feeds/key", { method: "POST" });
      const data = (await fetchJsonOrThrow(res)) as { key: string; url: string };
      setIcsFeedKey(data.key);
    } catch (err) {
      setIcsError(icsErrorText(err));
    } finally {
      setIcsBusy(false);
    }
  };

  /** 导入预览：只解析不写库；确认后再 commit */
  const postImport = async (commit: boolean): Promise<void> => {
    setIcsError(null);
    setIcsBusy(true);
    try {
      const res = await apiFetch("/api/schedules/import.ics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ics: icsImportText, commit }),
      });
      const data = (await fetchJsonOrThrow(res)) as IcsPreview & { count: number };
      if (commit) {
        setIcsImportedCount(data.count);
        setIcsPreview(null);
        setIcsImportText("");
        await load();
      } else {
        setIcsImportedCount(null);
        setIcsPreview(data);
      }
    } catch (err) {
      setIcsError(icsErrorText(err));
    } finally {
      setIcsBusy(false);
    }
  };

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
      setState({ phase: "error", message: SERVICE_DOWN_MESSAGE });
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
        ? await apiFetch(`/api/schedules/${editing.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/schedules", {
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
        <div className="ics-tools">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            data-action="ics-toggle-export"
            onClick={() => { setIcsPanel(icsPanel === "export" ? null : "export"); setIcsError(null); }}
          >
            导出 .ics
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            data-action="ics-toggle-feed"
            onClick={() => { setIcsPanel(icsPanel === "feed" ? null : "feed"); setIcsError(null); }}
          >
            订阅设置
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            data-action="ics-toggle-import"
            onClick={() => { setIcsPanel(icsPanel === "import" ? null : "import"); setIcsError(null); }}
          >
            导入 .ics
          </button>
        </div>
        <span className="hint">{linkedScheduleId > 0
          ? `已定位通知引用的日程 #${linkedScheduleId}（高亮块即目标）`
          : "点任意日期新建日程；点日程块可改期（关联待办会同步）。"}</span>
      </div>

      {icsPanel === "export" && (
        <section className="card ics-panel" data-state="ics-export-menu">
          <h3>导出标准日历文件（iCalendar）</h3>
          <p className="hint">Outlook / Google Calendar / Apple 日历可直接打开；中文、逗号、换行与引号均已按标准转义。</p>
          <div className="ics-actions">
            <button type="button" className="btn btn-primary btn-small" data-action="ics-export-schedules" disabled={icsBusy} onClick={() => void exportIcs("schedules")}>导出本月日程 (.ics)</button>
            <button type="button" className="btn btn-secondary btn-small" data-action="ics-export-todos" disabled={icsBusy} onClick={() => void exportIcs("todos")}>导出待办截止日 (.ics)</button>
          </div>
          {icsSaved && (
            <p className="hint ics-saved" data-state="ics-saved">
              ✓ 已保存 {icsSaved.filename}（{icsSaved.count} 条事件 / {icsSaved.bytes} 字节），可在下载目录打开。
            </p>
          )}
        </section>
      )}

      {icsPanel === "feed" && (
        <section className="card ics-panel" data-state="ics-feed-card">
          <h3>日历订阅设置</h3>
          <p className="hint">订阅 key 是本地随机串（存 settings），不是密钥/token；仅本机可用的只读订阅源。</p>
          {icsFeedKey ? (
            <div className="ics-feed">
              <p className="ics-field" data-field="ics-feed-key">订阅 key：<code>{icsFeedKey}</code></p>
              <p className="ics-field" data-field="ics-feed-url">订阅 URL：<code>/api/feeds/{icsFeedKey}.ics</code></p>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                data-action="ics-feed-copy"
                onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/api/feeds/${icsFeedKey}.ics`)}
              >
                复制 URL
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-primary btn-small" data-action="ics-feed-generate" disabled={icsBusy} onClick={() => void generateFeedKey()}>生成订阅地址</button>
          )}
        </section>
      )}

      {icsPanel === "import" && (
        <section className="card ics-panel" data-state="ics-import-panel">
          <h3>导入 .ics（先预览，确认后写入）</h3>
          <label className="field">
            <span className="field-label">粘贴 .ics 全文（支持中文 / 逗号 / 换行转义）</span>
            <textarea
              data-field="ics-text"
              rows={4}
              value={icsImportText}
              placeholder="BEGIN:VCALENDAR ..."
              onChange={(e) => setIcsImportText(e.target.value)}
            />
          </label>
          <div className="ics-actions">
            <button type="button" className="btn btn-secondary btn-small" data-action="ics-import-preview" disabled={icsBusy} onClick={() => void postImport(false)}>解析预览</button>
            <button type="button" className="btn btn-primary btn-small" data-action="ics-import-commit" disabled={icsBusy || icsPreview === null} onClick={() => void postImport(true)}>确认写入</button>
          </div>
          {icsPreview && (
            <div className="ics-preview" data-state="ics-import-preview">
              <p className="hint">解析到 {icsPreview.count} 条事件（X-XIEFLOW-* 元数据用于还原重复规则）：</p>
              <table>
                <thead><tr><th>标题</th><th>日期</th><th>时间</th><th>重复</th></tr></thead>
                <tbody>
                  {icsPreview.drafts.map((d, i) => (
                    <tr key={`${d.title}-${i}`} data-row="ics-draft">
                      <td>{d.title}</td><td>{d.date}</td><td>{d.start}–{d.end}</td><td>{d.repeat}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {icsImportedCount !== null && (
            <p className="hint ics-success" data-state="ics-import-success">✓ 已成功导入 {icsImportedCount} 条日程，刷新后仍在月视图中。</p>
          )}
        </section>
      )}

      {icsError && (
        <p className="error-message" data-state="ics-error" role="alert">{icsError}</p>
      )}

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
                        className={`cal-chip${s.id === linkedScheduleId ? " cal-chip-linked" : ""}`}
                        data-schedule-id={s.id}
                        data-state={s.id === linkedScheduleId ? "schedule-linked" : undefined}
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
