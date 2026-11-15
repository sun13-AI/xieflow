// 协流 XieFlow — r4 看板页：三列看板 + 卡片 + 跨列移动按钮 + 关联待办状态徽标
// 数据契约来自 @xieflow/shared；移动走 PATCH /api/cards/:id/move（重排规则集中
// shared reorderPositions，服务层保证两侧列 position 连续，UI 只消费结果）。
// r4 返工#1：D「打开看板」不再固定第一个项目——?projectId= 深链 + 项目切换下拉
// （GET /api/projects 已有，数据层零改动）；A2 无列时「＋ 新建卡片」给出语义提示，
// 不再静默 return；U3-1 页头文案与按钮渲染口径对齐（「→ 目标列」，无「←」）。
// 截图钉态：?page=board&shot=board-* 让 headless 确定性捕获（真实状态都存在）。
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_BOARD_COLUMNS,
  MAX_BOARD_NAME,
  type BoardCard,
  type BoardColumn,
  type Project,
  type Todo,
} from "@xieflow/shared";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow } from "./httpClient";

const TODO_STATUS_BADGES: Record<Todo["status"], { label: string; cls: string }> = {
  open: { label: "进行中", cls: "pill-open" },
  done: { label: "已完成", cls: "pill-done" },
  archived: { label: "已归档", cls: "pill-archived" },
};

interface BoardLoadState {
  phase: "loading" | "error" | "ready";
  message?: string;
  project?: Project | null;
  projects?: Project[];
  columns?: BoardColumn[];
  cards?: BoardCard[];
  todos?: Todo[];
}

interface BoardFetch {
  project: Project | null;
  projects: Project[];
  columns: BoardColumn[];
  cards: BoardCard[];
  todos: Todo[];
}

/** URL ?projectId= 深链目标（存在且在项目列表内才生效，否则回落第一个项目） */
function pickProject(projects: Project[], projectIdParam: string | null): Project | null {
  if (projects.length === 0) return null;
  const wanted = projectIdParam === null ? null : Number(projectIdParam);
  if (wanted !== null && Number.isInteger(wanted)) {
    const hit = projects.find((p) => p.id === wanted);
    if (hit) return hit;
  }
  return projects[0]!;
}

/** 看板数据：项目列表 + 指定项目（默认第一个）的全部列卡 + 全量待办（徽标按 todoId 查状态） */
async function fetchBoard(projectIdParam: string | null): Promise<BoardFetch> {
  const [projRes, todoRes] = await Promise.all([fetch("/api/projects"), fetch("/api/todos")]);
  const projData = (await fetchJsonOrThrow(projRes)) as { projects: Project[] };
  const todoData = (await fetchJsonOrThrow(todoRes)) as { todos: Todo[] };
  const project = pickProject(projData.projects, projectIdParam);
  if (project === null) {
    return { project: null, projects: projData.projects, columns: [], cards: [], todos: todoData.todos };
  }
  const colRes = await fetch(`/api/projects/${project.id}/columns`);
  const colData = (await fetchJsonOrThrow(colRes)) as { columns: BoardColumn[] };
  const cardLists = await Promise.all(
    colData.columns.map(async (c) => {
      const r = await fetch(`/api/projects/${project.id}/columns/${c.id}/cards`);
      const d = (await fetchJsonOrThrow(r)) as { cards: BoardCard[] };
      return d.cards;
    }),
  );
  return { project, projects: projData.projects, columns: colData.columns, cards: cardLists.flat(), todos: todoData.todos };
}

/** 钉态种子：与 audit-http 移动断言场景同构（三列、五卡、两徽标） */
function pinSeedBoard(now: Date): BoardFetch {
  const iso = now.toISOString();
  const todos: Todo[] = [
    { id: 11, title: "写 r4 看板复验材料", quadrant: "q2", status: "open", dueDate: null, createdAt: iso, updatedAt: iso },
    { id: 12, title: "确认瓷砖型号", quadrant: "q3", status: "done", dueDate: null, createdAt: iso, updatedAt: iso },
  ];
  const columns: BoardColumn[] = [
    { id: 1, projectId: 1, name: "待办", position: 0, createdAt: iso, updatedAt: iso },
    { id: 2, projectId: 1, name: "进行中", position: 1, createdAt: iso, updatedAt: iso },
    { id: 3, projectId: 1, name: "已完成", position: 2, createdAt: iso, updatedAt: iso },
  ];
  const cards: BoardCard[] = [
    { id: 1, projectId: 1, columnId: 1, title: "量房", description: null, position: 0, todoId: null, createdAt: iso, updatedAt: iso },
    { id: 2, projectId: 1, columnId: 1, title: "出平面图", description: null, position: 1, todoId: null, createdAt: iso, updatedAt: iso },
    { id: 3, projectId: 1, columnId: 1, title: "选瓷砖", description: null, position: 2, todoId: 12, createdAt: iso, updatedAt: iso },
    { id: 4, projectId: 1, columnId: 2, title: "写 r4 看板复验材料", description: null, position: 0, todoId: 11, createdAt: iso, updatedAt: iso },
    { id: 5, projectId: 1, columnId: 3, title: "定预算", description: null, position: 0, todoId: null, createdAt: iso, updatedAt: iso },
  ];
  const projects: Project[] = [
    { id: 1, name: "新家装修", description: "装修全流程跟踪", createdAt: iso, updatedAt: iso },
    { id: 2, name: "Q4 产品发布", description: null, createdAt: iso, updatedAt: iso },
  ];
  return { project: projects[0]!, projects, columns, cards, todos };
}

/** 移动后钉态种子：与 board-data 相同数据源，但卡「量房」已移到「进行中」列首位 */
function pinSeedBoardMoved(now: Date): BoardFetch {
  const seed = pinSeedBoard(now);
  const cards = seed.cards.map((c) =>
    c.id === 1
      ? { ...c, columnId: 2, position: 0 }
      : c.id === 4
        ? { ...c, position: 1 }
        : c,
  );
  return { ...seed, cards };
}

export default function BoardPage() {
  const [state, setState] = useState<BoardLoadState>({ phase: "loading" });
  const shot = useMemo(() => new URLSearchParams(window.location.search).get("shot"), []);
  const [modalOpen, setModalOpen] = useState(() => shot === "board-modal");
  const [draft, setDraft] = useState<{ title: string; todoId: string }>({ title: "", todoId: "" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const projectIdParam = new URLSearchParams(window.location.search).get("projectId");
      const data = await fetchBoard(projectIdParam);
      setState({ phase: "ready", ...data });
    } catch (err: unknown) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    if (shot === "board-empty") {
      setState({ phase: "ready", project: null, projects: [], columns: [], cards: [], todos: [] });
      return;
    }
    if (shot === "board-no-columns") {
      // 防御形态钉态：项目在场但零列（真实路径已被默认三列消灭，防御分支仍可捕获）
      const seed = pinSeedBoard(new Date());
      setState({ phase: "ready", project: seed.project, projects: seed.projects, columns: [], cards: [], todos: seed.todos });
      return;
    }
    if (shot === "board-no-columns-modal") {
      // A2 防御钉态：零列时打开「＋ 新建卡片」弹窗（创建按钮提示「先建列」，提交即出语义错误）
      const seed = pinSeedBoard(new Date());
      setState({ phase: "ready", project: seed.project, projects: seed.projects, columns: [], cards: [], todos: seed.todos });
      setModalOpen(true);
      return;
    }
    if (shot === "board-loading") {
      setState({ phase: "loading" });
      return;
    }
    if (shot === "board-error") {
      setState({ phase: "error", message: SERVICE_DOWN_MESSAGE + "（截图钉态：真实场景为 api 停机时 vite 代理 5xx）" });
      return;
    }
    if (shot === "board-data" || shot === "board-modal") {
      const seed = pinSeedBoard(new Date());
      setState({ phase: "ready", ...seed });
      return;
    }
    if (shot === "board-moved") {
      setState({ phase: "ready", ...pinSeedBoardMoved(new Date()) });
      return;
    }
    if (shot === "board-narrow") {
      setState({ phase: "ready", ...pinSeedBoard(new Date()) });
      return;
    }
    void load();
  }, [shot, load]);

  const project = state.phase === "ready" ? (state.project ?? null) : null;
  const projects = state.phase === "ready" ? (state.projects ?? []) : [];
  const columns = state.phase === "ready" ? (state.columns ?? []) : [];
  const cards = state.phase === "ready" ? (state.cards ?? []) : [];
  const todos = state.phase === "ready" ? (state.todos ?? []) : [];
  const todoById = useMemo(() => new Map(todos.map((t) => [t.id, t])), [todos]);

  /** 项目切换（D）：写 URL ?projectId= 并重拉看板（深链可分享/可回放） */
  const switchProject = async (id: string): Promise<void> => {
    const url = new URL(window.location.href);
    if (id === "") {
      url.searchParams.delete("projectId");
    } else {
      url.searchParams.set("projectId", id);
    }
    window.history.replaceState(null, "", url);
    await load();
  };

  /** 新建卡片（默认落第一列列尾）：POST 卡片路由。无列时不静默——给出语义提示（A2）。 */
  const submitDraft = async (): Promise<void> => {
    setSubmitError(null);
    if (project === null) {
      setSubmitError("还没有任何项目——请先到「项目」页创建一个项目，再回到看板。");
      return;
    }
    if (columns.length === 0) {
      setSubmitError("当前项目还没有看板列，请先建列再新建卡片。");
      return;
    }
    try {
      const res = await fetch(`/api/projects/${project.id}/columns/${columns[0]!.id}/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          todoId: draft.todoId === "" ? null : Number(draft.todoId),
        }),
      });
      const data = (await fetchJsonOrThrow(res)) as { error?: string } | null;
      if (res.status !== 201) {
        setSubmitError(data?.error ?? "新建失败，请稍后重试");
        return;
      }
      setModalOpen(false);
      setDraft({ title: "", todoId: "" });
      await load();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    }
  };

  /** 跨列移动（r4 任务单核心交互）：PATCH /api/cards/:id/move { columnId, position } */
  const moveCard = async (card: BoardCard, toColumnId: number, position: number): Promise<void> => {
    setBusyId(card.id);
    try {
      const res = await fetch(`/api/cards/${card.id}/move`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ columnId: toColumnId, position }),
      });
      const data = (await fetchJsonOrThrow(res)) as { error?: string } | null;
      if (res.status !== 200) {
        window.alert(data?.error ?? "移动失败，请稍后重试");
        return;
      }
      await load();
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusyId(null);
    }
  };

  if (state.phase === "loading") {
    return (
      <section className="card state-loading" data-state="board-loading">
        <p>正在加载看板…</p>
      </section>
    );
  }

  if (state.phase === "error") {
    return (
      <section className="card state-error" data-state="board-error" role="alert">
        <h2>加载失败</h2>
        <p className="error-message">{state.message}</p>
        <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后刷新本页。</p>
      </section>
    );
  }

  if (project === null) {
    return (
      <div className="board-page" data-state="board-empty">
        <section className="card">
          <p className="empty">还没有任何项目——先到「项目」页创建一个项目，新建项目会自动带上「{DEFAULT_BOARD_COLUMNS.join(" / ")}」三列。</p>
        </section>
      </div>
    );
  }

  const cardsByColumn = new Map<number, BoardCard[]>();
  for (const c of cards) {
    const list = cardsByColumn.get(c.columnId) ?? [];
    list.push(c);
    cardsByColumn.set(c.columnId, list);
  }
  for (const list of cardsByColumn.values()) {
    list.sort((a, b) => a.position - b.position);
  }

  return (
    <div className="board-page" data-state="board-ready">
      <div className="toolbar board-toolbar">
        <span className="board-title">
          {project.name}
          <span className="hint"> — 点「→ 目标列」按钮跨列移动卡片，列内顺序自动重排；关联待办的卡片带状态徽标。</span>
        </span>
        <span className="board-switch">
          <label className="board-switch-label" htmlFor="board-project-switch">项目：</label>
          <select
            id="board-project-switch"
            data-state="board-project-switch"
            value={project.id}
            onChange={(e) => void switchProject(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setDraft({ title: "", todoId: "" });
            setSubmitError(null);
            setModalOpen(true);
          }}
        >
          ＋ 新建卡片
        </button>
      </div>

      {columns.length === 0 && (
        <section className="card state-error" data-state="board-no-columns" role="alert">
          <p className="empty">
            这个项目还没有任何看板列——「＋ 新建卡片」暂时不可用。正常情况下新建项目会自动带上
            「{DEFAULT_BOARD_COLUMNS.join(" / ")}」三列；若列表缺失，请到「项目」页确认项目状态或检查 api 服务。
          </p>
        </section>
      )}

      <div className="board-grid" data-state="board-columns">
        {columns.map((col) => {
          const items = cardsByColumn.get(col.id) ?? [];
          return (
            <section key={col.id} className="board-column" data-column-id={col.id} data-column-name={col.name}>
              <h3 className="board-col-head">
                {col.name}
                <span className="quad-count">{items.length}</span>
              </h3>
              {items.length === 0 ? (
                <p className="empty board-col-empty">本列暂无卡片</p>
              ) : (
                <ul className="board-card-list">
                  {items.map((card) => {
                    const linked = card.todoId !== null ? todoById.get(card.todoId) : undefined;
                    return (
                      <li key={card.id} className="board-card" data-card-id={card.id}>
                        <div className="board-card-title">
                          {card.title}
                          {linked && (
                            <span className={`status-pill ${TODO_STATUS_BADGES[linked.status].cls}`}>
                              {TODO_STATUS_BADGES[linked.status].label}
                            </span>
                          )}
                        </div>
                        <div className="board-card-actions">
                          {columns
                            .filter((c) => c.id !== col.id)
                            .map((target) => (
                              <button
                                key={target.id}
                                type="button"
                                className="btn btn-ghost btn-small"
                                disabled={busyId === card.id}
                                title={`移动到「${target.name}」列末尾`}
                                onClick={() =>
                                  void moveCard(card, target.id, cardsByColumn.get(target.id)?.length ?? 0)
                                }
                              >
                                → {target.name}
                              </button>
                            ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {modalOpen && (
        <div className="modal-backdrop" data-state="board-modal">
          <div className="modal-card" role="dialog" aria-label="新建卡片">
            <h2>新建卡片</h2>
            <label className="field">
              <span className="field-label">
                标题（必填，最多 {MAX_BOARD_NAME} 字，当前 {draft.title.length}）
              </span>
              <input
                type="text"
                value={draft.title}
                maxLength={MAX_BOARD_NAME}
                placeholder="例：量房"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">关联待办（可选：卡片显示待办状态徽标）</span>
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
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void submitDraft()}>
                创建（落到「{columns[0]?.name ?? "——（先建列）"}」）
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="hint seam-note">
        移动规则：卡片移动后，源列与目标列的顺序都会自动重排（位置保持连续）；跨项目移动会被拒绝。
      </p>
    </div>
  );
}
