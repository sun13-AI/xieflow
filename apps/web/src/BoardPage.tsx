// 协流 XieFlow — r5 看板页：三列看板 + 卡片 + 跨列移动按钮 + 关联待办状态徽标
// + 看板统计卡（各列计数 / 完成率条）+ CSV 台账导出按钮
// 数据契约来自 @xieflow/shared；移动走 PATCH /api/cards/:id/move（重排规则集中
// shared reorderPositions，服务层保证两侧列 position 连续，UI 只消费结果）。
// r4 返工#1：D「打开看板」不再固定第一个项目——?projectId= 深链 + 项目切换下拉
// （GET /api/projects 已有，数据层零改动）；A2 无列时「＋ 新建卡片」给出语义提示，
// 不再静默 return；U3-1 页头文案与按钮渲染口径对齐（「→ 目标列」，无「←」）。
// r5：统计口径唯一入口 = shared computeBoardStats（api GET /api/projects/:id/stats
// 下发，钉态用同一纯函数本地算）；导出 = GET /api/projects/:id/export.csv
// （UTF-8 BOM，Excel 直开），落盘必须按字节（BOM 会被文本解码剥掉）。
// 截图钉态：?page=board&shot=board-* 让 headless 确定性捕获（真实状态都存在）；
// ?export=1 触发一次真实导出（用于拍「导出按钮态」的真实反馈）。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_BOARD_COLUMNS,
  MAX_BOARD_NAME,
  TODO_STATUS_LABELS,
  computeBoardStats,
  countCsvRecords,
  buildBoardCsvFileName,
  type BoardCard,
  type BoardColumn,
  type BoardStats,
  type Project,
  type Todo,
} from "@xieflow/shared";
// r38：逾期判定 / 标签筛选 / 标签归一唯一口径在 shared/cardMeta（web 零算法分支）
import { isOverdue, filterCardsByLabel, normalizeCardLabels } from "@xieflow/shared/cardMeta";
import type { MemberSummary } from "@xieflow/shared/org";
import MemberPicker from "./MemberPicker";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

const TODO_STATUS_BADGES: Record<Todo["status"], { label: string; cls: string }> = {
  open: { label: TODO_STATUS_LABELS.open, cls: "pill-open" },
  done: { label: TODO_STATUS_LABELS.done, cls: "pill-done" },
  archived: { label: TODO_STATUS_LABELS.archived, cls: "pill-archived" },
};

/** 导出反馈态（done 时带真实字节数、行数与文件名） */
type ExportState =
  | { phase: "idle" }
  | { phase: "exporting" }
  | { phase: "done"; bytes: number; rows: number; fileName: string }
  | { phase: "error"; message: string };

/** 卡片编辑草稿（r38：标签 chip / 负责人 / 截止日全部可空） */
interface CardDraft {
  title: string;
  todoId: string;
  /** 逗号分隔输入；提交前经 shared normalizeCardLabels 归一 */
  labels: string;
  assigneeMemberId: number | null;
  assigneeMember: MemberSummary | null;
  dueDate: string;
}

const EMPTY_DRAFT: CardDraft = {
  title: "", todoId: "", labels: "", assigneeMemberId: null, assigneeMember: null, dueDate: "",
};

interface BoardLoadState {
  phase: "loading" | "error" | "ready";
  message?: string;
  project?: Project | null;
  projects?: Project[];
  columns?: BoardColumn[];
  cards?: BoardCard[];
  todos?: Todo[];
  stats?: BoardStats;
}

interface BoardFetch {
  project: Project | null;
  projects: Project[];
  columns: BoardColumn[];
  cards: BoardCard[];
  todos: Todo[];
  stats: BoardStats;
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
  const [projRes, todoRes] = await Promise.all([apiFetch("/api/projects"), apiFetch("/api/todos")]);
  const projData = (await fetchJsonOrThrow(projRes)) as { projects: Project[] };
  const todoData = (await fetchJsonOrThrow(todoRes)) as { todos: Todo[] };
  const project = pickProject(projData.projects, projectIdParam);
  if (project === null) {
    return {
      project: null,
      projects: projData.projects,
      columns: [],
      cards: [],
      todos: todoData.todos,
      stats: computeBoardStats(0, [], [], todoData.todos),
    };
  }
  const colRes = await apiFetch(`/api/projects/${project.id}/columns`);
  const colData = (await fetchJsonOrThrow(colRes)) as { columns: BoardColumn[] };
  const cardLists = await Promise.all(
    colData.columns.map(async (c) => {
      const r = await apiFetch(`/api/projects/${project.id}/columns/${c.id}/cards`);
      const d = (await fetchJsonOrThrow(r)) as { cards: BoardCard[] };
      return d.cards;
    }),
  );
  // 统计由 api 下发（口径唯一入口 shared computeBoardStats）；移动后 load() 重拉即刷新
  const statsRes = await apiFetch(`/api/projects/${project.id}/stats`);
  const stats = (await fetchJsonOrThrow(statsRes)) as BoardStats;
  return {
    project,
    projects: projData.projects,
    columns: colData.columns,
    cards: cardLists.flat(),
    todos: todoData.todos,
    stats,
  };
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
  return {
    project: projects[0]!,
    projects,
    columns,
    cards,
    todos,
    // 钉态统计用同一 shared 纯函数本地算（口径与 api 完全一致）
    stats: computeBoardStats(projects[0]!.id, columns, cards, todos),
  };
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
  return { ...seed, cards, stats: computeBoardStats(seed.project!.id, seed.columns, cards, seed.todos) };
}

/** r38 钉态种子：三张卡带标签 / 负责人 / 逾期截止日（所有数值手算写死，真值由 audit/CDP 背书） */
function pinSeedBoardMeta(now: Date): BoardFetch {
  const seed = pinSeedBoard(now);
  const pinnedMember: MemberSummary = {
    id: 7, name: "张工", departmentId: 1, departmentName: "研发部", title: "前端工程师", status: "active",
  };
  const cards: BoardCard[] = seed.cards.map((c) => {
    if (c.id === 1) {
      return {
        ...c,
        labels: ["前端", "紧急"],
        assigneeMemberId: pinnedMember.id,
        assigneeMember: pinnedMember,
        dueDate: "2026-11-01", // 固定历史日期：任何当前日期下都是逾期（钉态稳定）
      };
    }
    if (c.id === 2) return { ...c, labels: ["设计"], dueDate: "2026-12-25" };
    if (c.id === 5) return { ...c, labels: ["前端"], dueDate: "2026-11-01" }; // 已完成列 -> 逾期抑制
    return c;
  });
  return { ...seed, cards };
}

export default function BoardPage() {
  const [state, setState] = useState<BoardLoadState>({ phase: "loading" });
  const shot = useMemo(() => new URLSearchParams(window.location.search).get("shot"), []);
  // r33 deep-link：卡片结果带 cardId，项目结果带 projectId（后者由 fetchBoard 选中）
  const focusCardId = useMemo(() => Number(new URLSearchParams(window.location.search).get("cardId")) || 0, []);
  const [modalOpen, setModalOpen] = useState(() => shot === "board-modal" || shot === "board-meta-assignee" || shot === "board-meta-due");
  const [draft, setDraft] = useState<CardDraft>({ ...EMPTY_DRAFT });
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [pickerOpenSeed, setPickerOpenSeed] = useState(false);
  const [labelFilter, setLabelFilter] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [exportState, setExportState] = useState<ExportState>({ phase: "idle" });

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
      setState({ phase: "ready", project: null, projects: [], columns: [], cards: [], todos: [], stats: computeBoardStats(0, [], [], []) });
      return;
    }
    if (shot === "board-no-columns") {
      // 防御形态钉态：项目在场但零列（真实路径已被默认三列消灭，防御分支仍可捕获）
      const seed = pinSeedBoard(new Date());
      setState({ phase: "ready", project: seed.project, projects: seed.projects, columns: [], cards: [], todos: seed.todos, stats: computeBoardStats(seed.project!.id, [], [], seed.todos) });
      return;
    }
    if (shot === "board-no-columns-modal") {
      // A2 防御钉态：零列时打开「＋ 新建卡片」弹窗（创建按钮提示「先建列」，提交即出语义错误）
      const seed = pinSeedBoard(new Date());
      setState({ phase: "ready", project: seed.project, projects: seed.projects, columns: [], cards: [], todos: seed.todos, stats: computeBoardStats(seed.project!.id, [], [], seed.todos) });
      setModalOpen(true);
      return;
    }
    if (shot === "board-loading") {
      setState({ phase: "loading" });
      return;
    }
    if (shot === "board-error") {
      setState({ phase: "error", message: SERVICE_DOWN_MESSAGE });
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
    // ---- r38 卡片元数据七态钉态 ----
    if (shot === "board-meta-empty") {
      setState({ phase: "ready", project: null, projects: [], columns: [], cards: [], todos: [], stats: computeBoardStats(0, [], [], []) });
      return;
    }
    if (shot === "board-meta-labels" || shot === "board-meta-narrow") {
      const seed = pinSeedBoardMeta(new Date());
      setState({ phase: "ready", ...seed });
      setLabelFilter("前端");
      return;
    }
    if (shot === "board-meta-overdue") {
      // 与 02 同数据源但清除标签筛选：三列全显，待办列逾期红标与已完成列抑制同屏可辨
      setState({ phase: "ready", ...pinSeedBoardMeta(new Date()) });
      setLabelFilter("");
      return;
    }
    if (shot === "board-meta-assignee") {
      const seed = pinSeedBoardMeta(new Date());
      setState({ phase: "ready", ...seed });
      const card = seed.cards.find((c) => c.id === 1)!;
      setDraft({
        title: card.title, todoId: card.todoId === null ? "" : String(card.todoId),
        labels: (card.labels ?? []).join("，"),
        assigneeMemberId: card.assigneeMemberId ?? null,
        assigneeMember: card.assigneeMember ?? null,
        dueDate: card.dueDate ?? "",
      });
      setEditingCardId(card.id);
      setPickerOpenSeed(true);
      return;
    }
    if (shot === "board-meta-due") {
      const seed = pinSeedBoardMeta(new Date());
      setState({ phase: "ready", ...seed });
      const card = seed.cards.find((c) => c.id === 1)!;
      setDraft({
        title: card.title, todoId: card.todoId === null ? "" : String(card.todoId),
        labels: (card.labels ?? []).join("，"),
        assigneeMemberId: card.assigneeMemberId ?? null,
        assigneeMember: card.assigneeMember ?? null,
        dueDate: card.dueDate ?? "",
      });
      setEditingCardId(card.id);
      return;
    }
    if (shot === "board-meta-error") {
      const seed = pinSeedBoardMeta(new Date());
      setState({ phase: "ready", ...seed });
      setSubmitError("卡片失败：标签过长（最多 40 字），请缩短后重试。");
      setModalOpen(true);
      return;
    }
    void load();
  }, [shot, load]);

  const project = state.phase === "ready" ? (state.project ?? null) : null;
  const projects = state.phase === "ready" ? (state.projects ?? []) : [];
  const columns = state.phase === "ready" ? (state.columns ?? []) : [];
  const cards = state.phase === "ready" ? (state.cards ?? []) : [];
  const todos = state.phase === "ready" ? (state.todos ?? []) : [];
  // 统计：api 下发的口径（shared computeBoardStats）；兜底用同一纯函数本地算
  const stats: BoardStats =
    state.phase === "ready" && state.stats
      ? state.stats
      : computeBoardStats(project?.id ?? 0, columns, cards, todos);
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

  /** 新建 / 编辑卡片（r38：标签 / 负责人 / 截止日随同一请求提交） */
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
      // 归一在 shared 唯一口径完成；空串标签列表提交 []（清空）
      const labels = draft.labels.trim() === "" ? [] : draft.labels.split(/[,，\n]/);
      const payload = {
        title: draft.title,
        todoId: draft.todoId === "" ? null : Number(draft.todoId),
        labels,
        assigneeMemberId: draft.assigneeMemberId,
        dueDate: draft.dueDate === "" ? null : draft.dueDate,
      };
      const url = editingCardId === null
        ? `/api/projects/${project.id}/columns/${columns[0]!.id}/cards`
        : `/api/cards/${editingCardId}`;
      const res = await apiFetch(url, {
        method: editingCardId === null ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await fetchJsonOrThrow(res)) as { error?: string } | null;
      if (res.status !== 201 && res.status !== 200) {
        setSubmitError(data?.error ?? (editingCardId === null ? "新建失败，请稍后重试" : "保存失败，请稍后重试"));
        return;
      }
      setModalOpen(false);
      setDraft({ ...EMPTY_DRAFT });
      setEditingCardId(null);
      await load();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    }
  };

  /** 打开编辑面板：从卡片现有元数据回填草稿（r38） */
  const openEdit = (card: BoardCard): void => {
    setDraft({
      title: card.title,
      todoId: card.todoId === null ? "" : String(card.todoId),
      labels: (card.labels ?? []).join("，"),
      assigneeMemberId: card.assigneeMemberId ?? null,
      assigneeMember: card.assigneeMember ?? null,
      dueDate: card.dueDate ?? "",
    });
    setEditingCardId(card.id);
    setSubmitError(null);
    setModalOpen(true);
  };

  /** 跨列移动（r4 任务单核心交互）：PATCH /api/cards/:id/move { columnId, position } */
  const moveCard = async (card: BoardCard, toColumnId: number, position: number): Promise<void> => {
    setBusyId(card.id);
    try {
      const res = await apiFetch(`/api/cards/${card.id}/move`, {
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

  /**
   * 导出 CSV 台账（r5 任务单）：GET /api/projects/:id/export.csv → 浏览器落盘。
   * 关键：必须按**字节**落盘（arrayBuffer → Blob）——fetch 的文本解码会把 UTF-8 BOM
   * 剥掉，按文本落盘会让 Excel 直开乱码（audit 有字节层 BOM 断言）。
   * r6 U2-2 必修：文件名含项目名（xieflow-board-<项目名>-<YYYYMMDD>.csv），
   * 不再只露内部 id；文件名口径集中在 shared buildBoardCsvFileName（与 api 响应头同源）。
   */
  const exportCsv = async (projectId: number): Promise<void> => {
    setExportState({ phase: "exporting" });
    try {
      const res = await apiFetch(`/api/projects/${projectId}/export.csv`);
      if (!res.ok) {
        setExportState({ phase: "error", message: `HTTP ${res.status}` });
        return;
      }
      const buf = await res.arrayBuffer();
      const text = new TextDecoder("utf-8").decode(buf);
      const rows = countCsvRecords(text);
      const fileName = buildBoardCsvFileName(project?.name ?? "board");
      const blob = new Blob([buf], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportState({ phase: "done", bytes: buf.byteLength, rows, fileName });
    } catch (err: unknown) {
      setExportState({ phase: "error", message: err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE });
    }
  };

  // 截图 seam：?export=1 触发一次**真实**导出（反馈条里的行数/字节数是真值）
  const exportParam = useMemo(() => new URLSearchParams(window.location.search).get("export"), []);
  const autoExported = useRef(false);
  useEffect(() => {
    if (exportParam !== "1") return;
    if (state.phase !== "ready") return;
    const pid = state.project?.id;
    if (pid === undefined || autoExported.current) return;
    autoExported.current = true;
    void exportCsv(pid);
  }, [state, exportParam]);

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

  // r38 标签筛选（归一与命中口径全在 shared/cardMeta，web 零算法分支）
  const visibleCards: BoardCard[] = labelFilter.trim() === ""
    ? cards
    : filterCardsByLabel(cards, labelFilter);
  const labelOptions: string[] = [...new Set(cards.flatMap((c) => c.labels ?? []))].sort();
  const colNameById = new Map(columns.map((c) => [c.id, c.name]));

  const cardsByColumn = new Map<number, BoardCard[]>();
  for (const c of visibleCards) {
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
        <span className="board-label-filter-wrap">
          <label className="board-switch-label" htmlFor="board-label-filter">标签：</label>
          <select
            id="board-label-filter"
            data-state="board-label-filter"
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
          >
            <option value="">全部标签</option>
            {labelOptions.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {labelFilter !== "" && <span className="board-filter-count" data-state="board-filter-count">命中 {visibleCards.length} 张</span>}
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          data-state="board-export-button"
          disabled={exportState.phase === "exporting"}
          title="导出本项目看板台账为 CSV（UTF-8 BOM，Excel 双击直开）"
          onClick={() => void exportCsv(project.id)}
        >
          {exportState.phase === "exporting" ? "导出中…" : "导出 CSV"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setDraft({ ...EMPTY_DRAFT });
            setEditingCardId(null);
            setPickerOpenSeed(false);
            setSubmitError(null);
            setModalOpen(true);
          }}
        >
          ＋ 新建卡片
        </button>
      </div>

      {exportState.phase !== "idle" && (
        <p
          className={`export-banner${exportState.phase === "error" ? " export-error" : ""}`}
          data-state={`board-export-${exportState.phase}`}
          role="status"
        >
          {exportState.phase === "exporting" && "正在生成 CSV 台账…"}
          {exportState.phase === "done" &&
            `已导出 CSV：${exportState.rows} 行（含表头）· ${(exportState.bytes / 1024).toFixed(1)} KB · 文件名 ${exportState.fileName}`}
          {exportState.phase === "error" && `导出失败：${exportState.message}`}
        </p>
      )}

      <section className="card board-stats" data-state="board-stats">
        <div className="board-stats-head">
          <h2>看板统计</h2>
          <span className="hint">
            待办完成率口径：关联待办状态为「已完成」的卡片 ÷ 本列卡片总数（零卡片列记 0%）
          </span>
        </div>
        <div className="stats-row">
          <div className="stat-card" data-stat="cards">
            <span className="stat-label">卡片总数</span>
            <span className="stat-value">{stats.totals.cardCount}</span>
          </div>
          <div className="stat-card" data-stat="done">
            <span className="stat-label">已完成</span>
            <span className="stat-value">{stats.totals.doneCount}</span>
          </div>
          <div className="stat-card" data-stat="rate">
            <span className="stat-label">项目待办完成率</span>
            <span className="stat-value">{stats.totals.completionRate}%</span>
          </div>
          <div className="stat-card" data-stat="todos">
            <span className="stat-label">关联待办</span>
            <span className="stat-value">{stats.totals.todoLinkedCount}</span>
          </div>
        </div>
        <ul className="stat-column-list">
          {stats.columns.map((c) => (
            <li key={c.id} className="stat-column" data-column-id={c.id}>
              <span className="stat-column-name">{c.name}</span>
              <span className="stat-column-count">{c.cardCount} 张</span>
              <span className="rate-bar" data-rate={c.completionRate}>
                <span className="rate-fill" style={{ width: `${c.completionRate}%` }} />
              </span>
              <span className="stat-column-rate">
                待办完成率 {c.completionRate}%（{c.doneCount}/{c.cardCount}）· 关联待办 {c.todoLinkedCount}
              </span>
            </li>
          ))}
        </ul>
      </section>

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
                      <li key={card.id} className={`board-card${focusCardId === card.id ? " board-card-located" : ""}`} data-card-id={card.id} data-state={focusCardId === card.id ? "board-card-located" : "board-card"}>
                        <div className="board-card-title">
                          {card.title}
                          {linked && (
                            <span className={`status-pill ${TODO_STATUS_BADGES[linked.status].cls}`}>
                              {TODO_STATUS_BADGES[linked.status].label}
                            </span>
                          )}
                        </div>
                        {(card.labels?.length ?? 0) > 0 && (
                          <div className="board-card-labels" data-state="board-card-labels">
                            {card.labels!.map((l) => <span className="board-label-chip" key={l}>{l}</span>)}
                          </div>
                        )}
                        <div className="board-card-meta-line" data-state="board-card-meta">
                          {card.assigneeMember && (
                            <span className="board-card-assignee" data-state="board-card-assignee">
                              负责人：{card.assigneeMember.name}{card.assigneeMember.departmentName ? `（${card.assigneeMember.departmentName}）` : ""}
                            </span>
                          )}
                          {card.dueDate && (
                            <span className="board-card-due">截止：{card.dueDate}</span>
                          )}
                          {isOverdue(card.dueDate, new Date(), colNameById.get(card.columnId) ?? null) && (
                            <span className="board-card-overdue" data-state="board-card-overdue" title="截止日已过且未进入完成列">逾期</span>
                          )}
                        </div>
                        <div className="board-card-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            data-action="board-card-edit"
                            title="编辑卡片元数据（标签 / 负责人 / 截止日）"
                            onClick={() => openEdit(card)}
                          >
                            编辑
                          </button>
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
          <div className="modal-card" role="dialog" aria-label={editingCardId === null ? "新建卡片" : "编辑卡片"}>
            <h2>{editingCardId === null ? "新建卡片" : "编辑卡片"}</h2>
            <label className="field">
              <span className="field-label">
                标题（必填，最多 {MAX_BOARD_NAME} 字，当前 {draft.title.length}）
              </span>
              <input
                type="text"
                value={draft.title}
                maxLength={MAX_BOARD_NAME}
                placeholder="例：量房"
                data-state="board-meta-title"
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
            <label className="field">
              <span className="field-label">标签（逗号分隔，提交时自动 trim / 去重）</span>
              <input
                type="text"
                value={draft.labels}
                data-state="board-meta-labels-input"
                placeholder="例：前端，紧急"
                onChange={(e) => setDraft({ ...draft, labels: e.target.value })}
              />
              <span className="board-label-preview" data-state="board-meta-labels-preview">
                {normalizeCardLabels(draft.labels.trim() === "" ? [] : draft.labels.split(/[,，\n]/)).map((l) => (
                  <span className="board-label-chip" key={l}>{l}</span>
                ))}
              </span>
            </label>
            <div className="field">
              <span className="field-label">负责人（可选，来自通讯录）</span>
              <MemberPicker
                label="负责人"
                seam="board-assignee"
                member={draft.assigneeMember}
                pinned={shot?.startsWith("board-meta-") ? [{
                  id: 7, name: "张工", departmentId: 1, departmentName: "研发部", title: "前端工程师", status: "active",
                }] : undefined}
                openOnInit={shot === "board-meta-assignee" || pickerOpenSeed}
                onPick={(m: MemberSummary) => {
                  setDraft({ ...draft, assigneeMemberId: m.id, assigneeMember: m });
                  setPickerOpenSeed(false);
                }}
                onClear={() => setDraft({ ...draft, assigneeMemberId: null, assigneeMember: null })}
              />
            </div>
            <label className="field">
              <span className="field-label">截止日（可选，留空表示清除；已过且非完成列显示逾期红标）</span>
              <input
                type="date"
                value={draft.dueDate}
                data-state="board-meta-due-input"
                onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
              />
            </label>
            {submitError && (
              <p className="error-message" data-state="board-meta-error" role="alert">{submitError}</p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setModalOpen(false); setPickerOpenSeed(false); }}>
                取消
              </button>
              <button type="button" className="btn btn-primary" data-action="board-meta-submit" onClick={() => void submitDraft()}>
                {editingCardId === null ? `创建（落到「${columns[0]?.name ?? "——（先建列）"}」）` : "保存修改"}
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
