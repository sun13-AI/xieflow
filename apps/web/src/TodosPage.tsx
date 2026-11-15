// 协流 XieFlow — r2 待办页：四象限视图 + 今/明/周汇总 + 新建弹窗 + 状态流转
// 数据契约全部来自 @xieflow/shared（宪法第七条：状态机/象限/计数集中定义，UI 不散落逻辑）。
// 截图钉态：?page=todos&shot=todo-* 让 headless 确定性捕获（真实状态都存在，参数只为钉态）。
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_SUMMARY,
  QUADRANT_LABELS,
  TODO_STATUS_TRANSITIONS,
  computeTodoSummary,
  type Quadrant,
  type Todo,
  type TodoStatus,
  type TodoSummary,
} from "@xieflow/shared";

const QUADRANTS: Quadrant[] = ["q1", "q2", "q3", "q4"];

interface TodosLoadState {
  phase: "loading" | "error" | "ready";
  message?: string;
  todos?: Todo[];
  summary?: TodoSummary;
  schemaVersion?: number;
}

interface FetchResult {
  todos: Todo[];
  summary: TodoSummary;
  schemaVersion: number;
}

/** 列表 + 汇总一次取回（GET /api/todos 同时下发 todos 与 summary） */
async function fetchTodos(): Promise<FetchResult> {
  const res = await fetch("/api/todos");
  if (!res.ok) throw new Error(`待办列表加载失败：HTTP ${res.status}`);
  const data = (await res.json()) as {
    todos: Todo[];
    summary: TodoSummary;
  };
  return { todos: data.todos, summary: data.summary, schemaVersion: 2 };
}

const STATUS_LABELS: Record<TodoStatus, string> = {
  open: "进行中",
  done: "已完成",
  archived: "已归档",
};

/** 截图钉态种子数据（与 audit-http 断言场景同构：四象限齐、今/明/周计数齐） */
function pinSeed(now: Date): Todo[] {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const dayStr = (offset: number): string => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const iso = (offset: number, hour = 9): string =>
    `${dayStr(offset)}T${pad(hour)}:00:00.000Z`;
  return [
    { id: 1, title: "r2 待办页交付", quadrant: "q1", status: "open", dueDate: dayStr(0), createdAt: iso(-1), updatedAt: iso(-1) },
    { id: 2, title: "季度目标对齐会材料", quadrant: "q2", status: "open", dueDate: dayStr(1), createdAt: iso(-1), updatedAt: iso(-1) },
    { id: 3, title: "回复合作方邮件", quadrant: "q3", status: "open", dueDate: dayStr(0), createdAt: iso(-1), updatedAt: iso(-1) },
    { id: 4, title: "整理旧文档归档位", quadrant: "q4", status: "open", dueDate: dayStr(5), createdAt: iso(-1), updatedAt: iso(-1) },
    { id: 5, title: "r1 复验问题清账", quadrant: "q1", status: "done", dueDate: dayStr(0), createdAt: iso(-2), updatedAt: iso(0) },
    { id: 6, title: "十一月周报", quadrant: "q4", status: "archived", dueDate: null, createdAt: iso(-3), updatedAt: iso(-1) },
  ];
}

export default function TodosPage() {
  const [state, setState] = useState<TodosLoadState>({ phase: "loading" });
  // 弹窗可见性：截图用 ?shot=todo-modal 钉住
  const [modalOpen, setModalOpen] = useState(
    () => new URLSearchParams(window.location.search).get("shot") === "todo-modal",
  );
  const [draft, setDraft] = useState<{ title: string; quadrant: Quadrant; dueDate: string }>({
    title: "",
    quadrant: "q1",
    dueDate: "",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const shot = useMemo(
    () => new URLSearchParams(window.location.search).get("shot"),
    [],
  );

  const load = useCallback(async (): Promise<void> => {
    try {
      const data = await fetchTodos();
      setState({ phase: "ready", ...data });
    } catch (err: unknown) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    // 钉态：todo-empty / todo-modal 用空库形态；todo-data / todo-done / todo-narrow 用种子数据
    if (shot === "todo-empty" || shot === "todo-modal") {
      setState({ phase: "ready", todos: [], summary: EMPTY_SUMMARY, schemaVersion: 2 });
      return;
    }
    if (shot === "todo-data" || shot === "todo-done" || shot === "todo-narrow") {
      const todos = pinSeed(new Date());
      if (shot === "todo-done") {
        // 钉「状态流转后」形态：首条 open → done（真实流转由 HTTP 层 audit-http 断言锁住）
        const first = todos.find((t) => t.id === 1);
        if (first) first.status = "done";
      }
      // 汇总走与 api 侧同一纯函数（钉态不发请求，计数口径与 GET /api/todos 一致）
      setState({ phase: "ready", todos, summary: computeTodoSummary(todos), schemaVersion: 2 });
      return;
    }
    void load();
  }, [shot, load]);

  const todos = state.phase === "ready" ? (state.todos ?? []) : [];
  const summary = state.phase === "ready" ? (state.summary ?? EMPTY_SUMMARY) : EMPTY_SUMMARY;

  /** 新建待办：POST /api/todos，成功后刷新列表与汇总 */
  const submitDraft = async (): Promise<void> => {
    setSubmitError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          quadrant: draft.quadrant,
          dueDate: draft.dueDate === "" ? null : draft.dueDate,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setSubmitError(data?.error ?? `新建失败：HTTP ${res.status}`);
        return;
      }
      setModalOpen(false);
      setDraft({ title: "", quadrant: "q1", dueDate: "" });
      await load();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  };

  /** 状态流转：PATCH /api/todos/:id，按 shared 状态机渲染可用操作 */
  const transition = async (todo: Todo, to: TodoStatus): Promise<void> => {
    setBusyId(todo.id);
    try {
      const res = await fetch(`/api/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        window.alert(data?.error ?? `流转失败：HTTP ${res.status}`);
        return;
      }
      await load();
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  if (state.phase === "loading") {
    return (
      <section className="card state-loading" data-state="todo-loading">
        <p>正在加载待办…</p>
      </section>
    );
  }

  if (state.phase === "error") {
    return (
      <section className="card state-error" data-state="todo-error" role="alert">
        <h2>加载失败</h2>
        <p className="error-message">{state.message}</p>
        <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后刷新本页。</p>
      </section>
    );
  }

  return (
    <div className="todos-page" data-state="todo-ready">
      {/* 今/明/周汇总计数卡 */}
      <div className="summary-row">
        <div className="summary-card" data-summary="today">
          <dt>今日到期</dt>
          <dd>{summary.today}</dd>
        </div>
        <div className="summary-card" data-summary="tomorrow">
          <dt>明日到期</dt>
          <dd>{summary.tomorrow}</dd>
        </div>
        <div className="summary-card" data-summary="week">
          <dt>本周内（7 天窗口）</dt>
          <dd>{summary.week}</dd>
        </div>
        <div className="summary-card" data-summary="total">
          <dt>全部待办</dt>
          <dd>{todos.length}</dd>
        </div>
      </div>

      <div className="toolbar">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setDraft({ title: "", quadrant: "q1", dueDate: "" });
            setSubmitError(null);
            setModalOpen(true);
          }}
        >
          ＋ 新建待办
        </button>
      </div>

      {todos.length === 0 ? (
        <section className="card" data-state="todo-empty">
          <p className="empty">还没有任何待办——点「新建待办」创建第一条，或按四象限规划本周。</p>
        </section>
      ) : (
        <div className="quadrant-grid" data-state="todo-quadrants">
          {QUADRANTS.map((q) => {
            const items = todos.filter((t) => t.quadrant === q);
            return (
              <section key={q} className={`quadrant quad-${q}`} data-quadrant={q}>
                <h3>
                  {q.toUpperCase()} · {QUADRANT_LABELS[q]}
                  <span className="quad-count">{items.length}</span>
                </h3>
                {items.length === 0 ? (
                  <p className="empty">本象限暂无待办</p>
                ) : (
                  <ul className="todo-list">
                    {items.map((t) => (
                      <li key={t.id} className={`todo-item status-${t.status}`} data-todo-id={t.id}>
                        <div className="todo-title">
                          {t.title}
                          <span className={`status-pill pill-${t.status}`}>{STATUS_LABELS[t.status]}</span>
                        </div>
                        <div className="todo-due">
                          {t.dueDate ? <>截止 {t.dueDate}</> : <span className="hint">无截止日</span>}
                        </div>
                        <div className="todo-actions">
                          {TODO_STATUS_TRANSITIONS[t.status].map((to) => (
                            <button
                              key={to}
                              type="button"
                              className={`btn btn-small ${to === "archived" ? "btn-ghost" : "btn-secondary"}`}
                              disabled={busyId === t.id}
                              onClick={() => void transition(t, to)}
                            >
                              {to === "done" ? "完成" : to === "open" ? "重开" : "归档"}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" data-state="todo-modal">
          <div className="modal-card" role="dialog" aria-label="新建待办">
            <h2>新建待办</h2>
            <label className="field">
              <span className="field-label">标题（必填）</span>
              <input
                type="text"
                value={draft.title}
                placeholder="例：写 r2 复验材料"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <fieldset className="field">
              <span className="field-label">象限（必选）</span>
              <div className="quadrant-picker">
                {QUADRANTS.map((q) => (
                  <label key={q} className={`quad-option ${draft.quadrant === q ? "picked" : ""}`}>
                    <input
                      type="radio"
                      name="quadrant"
                      value={q}
                      checked={draft.quadrant === q}
                      onChange={() => setDraft({ ...draft, quadrant: q })}
                    />
                    {q.toUpperCase()} {QUADRANT_LABELS[q]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="field">
              <span className="field-label">截止日期（可选）</span>
              <input
                type="date"
                value={draft.dueDate}
                onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
              />
            </label>
            {submitError && (
              <p className="error-message" role="alert">{submitError}</p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void submitDraft()}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 状态流转说明：操作按钮按 TODO_STATUS_TRANSITIONS 渲染（open→done/archived，
          done→open/archived，archived→open），非法流转在 api 侧被 400 拒绝 */}
      <p className="hint seam-note">
        流转规则（packages/shared TODO_STATUS_TRANSITIONS）：
        {(Object.keys(TODO_STATUS_TRANSITIONS) as TodoStatus[])
          .map((from) => `${STATUS_LABELS[from]}→${TODO_STATUS_TRANSITIONS[from].map((t) => STATUS_LABELS[t]).join("/")}`)
          .join("；")}
      </p>
    </div>
  );
}
