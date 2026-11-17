// 协流 XieFlow — 外壳：页面切换（useState tab，无路由库）+ 首页工作台
// r3 起：工作台（设置项 + schema 卡 + 今日日程卡）/ 待办页 / 日程页三个 tab。
// r4 起：+ 项目页 / 看板页（M2 第 1 片）。
// r8 起：+ 文档页（M4 第 1 片：块级文档编辑器），壳基线随之扩为七 tab。
// r9：文档页加 Markdown 导入导出与 AI 块级修订；壳徽章随轮次更新。
// r10：+ AI 工作台页（M5 第 1 片：对话 / 工具调用 / 产物预览），壳基线扩为八 tab。
// 截图状态真实存在：加载中 / 空数据 / 正常 / 错误 / 窄屏（?narrow=1 显式钉态）
import { useEffect, useState } from "react";
import type { AppSetting, Schedule, Todo } from "@xieflow/shared";
import TodosPage from "./TodosPage";
import SchedulesPage from "./SchedulesPage";
import ProjectsPage from "./ProjectsPage";
import BoardPage from "./BoardPage";
import BasesPage from "./BasesPage";
import DocsPage from "./DocsPage";
import ChatPage from "./ChatPage";

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; settings: AppSetting[]; schemaVersion: number; todaySchedules: Schedule[]; todos: Todo[] };

type PageTab = "home" | "todos" | "schedules" | "projects" | "board" | "bases" | "docs" | "chat";

/** 健康检查 + 今日日程（工作台卡片数据源；日程查询失败不阻塞工作台） */
async function fetchHealth(): Promise<{
  schemaVersion: number;
  settings: AppSetting[];
  todaySchedules: Schedule[];
  todos: Todo[];
}> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`健康检查失败：HTTP ${res.status}`);
  const data = (await res.json()) as { schemaVersion: number; settings: AppSetting[] };
  const pad = (n: number): string => String(n).padStart(2, "0");
  const n = new Date();
  const today = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  let todaySchedules: Schedule[] = [];
  let todos: Todo[] = [];
  try {
    const [schRes, todoRes] = await Promise.all([
      fetch(`/api/schedules?from=${today}&to=${today}`),
      fetch("/api/todos"),
    ]);
    if (schRes.ok) {
      todaySchedules = ((await schRes.json()) as { schedules: Schedule[] }).schedules;
    }
    if (todoRes.ok) {
      todos = ((await todoRes.json()) as { todos: Todo[] }).todos;
    }
  } catch {
    /* 今日日程卡降级为空态，不阻塞工作台 */
  }
  return { schemaVersion: data.schemaVersion, settings: data.settings, todaySchedules, todos };
}

const TODO_BADGES: Record<Todo["status"], { label: string; cls: string }> = {
  open: { label: "进行中", cls: "pill-open" },
  done: { label: "已完成", cls: "pill-done" },
  archived: { label: "已归档", cls: "pill-archived" },
};

/** 工作台钉态种子：今日日程卡有 2 条（1 条关联待办，展示徽标形态） */
function workbenchTodaySeed(now: Date): Schedule[] {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const iso = `${today}T09:00:00.000Z`;
  return [
    { id: 31, title: "需求评审会", date: today, start: "10:00", end: "11:00", todoId: null, repeat: "none", createdAt: iso, updatedAt: iso },
    { id: 32, title: "写 r3 复验材料", date: today, start: "15:00", end: "16:00", todoId: 11, repeat: "none", createdAt: iso, updatedAt: iso },
  ];
}

export default function App() {
  // tab 与截图钉态都从 URL 读（?page=todos / ?page=schedules / ?page=projects / ?page=board 可直达/可截图）
  const [tab, setTab] = useState<PageTab>(() => {
    const page = new URLSearchParams(window.location.search).get("page");
    return page === "todos"
      ? "todos"
      : page === "schedules"
        ? "schedules"
        : page === "projects"
          ? "projects"
          : page === "board"
            ? "board"
            : page === "bases"
              ? "bases"
              : page === "docs"
                ? "docs"
                : page === "chat"
                  ? "chat"
                  : "home";
  });
  const [state, setState] = useState<LoadState>(() => {
    // 截图脚本用 ?shot= 钉住特定状态（真实状态都存在，参数只为确定性捕获）
    const shot = new URLSearchParams(window.location.search).get("shot");
    const now = new Date();
    if (shot === "loading") return { phase: "loading" };
    if (shot === "error")
      return { phase: "error", message: "ECONNREFUSED 127.0.0.1:8787（截图钉态）" };
    if (shot === "empty")
      return { phase: "ready", settings: [], schemaVersion: 5, todaySchedules: [], todos: [] };
    if (shot === "ready" || shot === "workbench")
      return {
        phase: "ready",
        settings: [{ key: "company.name", value: "协流示例公司", updatedAt: now.toISOString() }],
        schemaVersion: 8,
        todaySchedules: workbenchTodaySeed(now),
        todos: [],
      };
    return { phase: "loading" };
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("narrow") === "1") {
      document.documentElement.classList.add("force-narrow");
    }
    const shot = params.get("shot");
    if (shot === "loading" || shot === "error" || shot === "empty" || shot === "ready" || shot === "workbench") {
      return; // 钉态不探测
    }
    let alive = true;
    fetchHealth()
      .then((data) => {
        if (alive) setState({ phase: "ready", ...data });
      })
      .catch((err: unknown) => {
        if (alive) setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      alive = false;
    };
  }, []);

  const todoById = new Map(state.phase === "ready" ? state.todos.map((t) => [t.id, t]) : []);

  return (
    <main className={tab === "bases" || tab === "docs" || tab === "chat" ? "shell shell-wide" : "shell"}>
      <header className="topbar">
        <span className="logo">协流 XieFlow</span>
        <nav className="tabs" data-state="tabs">
          <button
            type="button"
            className={`tab ${tab === "home" ? "tab-active" : ""}`}
            data-tab="home"
            onClick={() => setTab("home")}
          >
            工作台
          </button>
          <button
            type="button"
            className={`tab ${tab === "todos" ? "tab-active" : ""}`}
            data-tab="todos"
            onClick={() => setTab("todos")}
          >
            待办
          </button>
          <button
            type="button"
            className={`tab ${tab === "schedules" ? "tab-active" : ""}`}
            data-tab="schedules"
            onClick={() => setTab("schedules")}
          >
            日程
          </button>
          <button
            type="button"
            className={`tab ${tab === "projects" ? "tab-active" : ""}`}
            data-tab="projects"
            onClick={() => setTab("projects")}
          >
            项目
          </button>
          <button
            type="button"
            className={`tab ${tab === "board" ? "tab-active" : ""}`}
            data-tab="board"
            onClick={() => setTab("board")}
          >
            看板
          </button>
          <button
            type="button"
            className={`tab ${tab === "bases" ? "tab-active" : ""}`}
            data-tab="bases"
            onClick={() => setTab("bases")}
          >
            表格
          </button>
          <button
            type="button"
            className={`tab ${tab === "docs" ? "tab-active" : ""}`}
            data-tab="docs"
            onClick={() => setTab("docs")}
          >
            文档
          </button>
          <button
            type="button"
            className={`tab ${tab === "chat" ? "tab-active" : ""}`}
            data-tab="chat"
            onClick={() => setTab("chat")}
          >
            AI 工作台
          </button>
        </nav>
        <span className="badge">r11 · 多轮上下文与产物生成（M5 收官）</span>
      </header>

      {tab === "todos" ? (
        <TodosPage />
      ) : tab === "schedules" ? (
        <SchedulesPage />
      ) : tab === "projects" ? (
        <ProjectsPage onOpenBoard={() => setTab("board")} />
      ) : tab === "board" ? (
        <BoardPage />
      ) : tab === "bases" ? (
        <BasesPage />
      ) : tab === "docs" ? (
        <DocsPage />
      ) : tab === "chat" ? (
        <ChatPage />
      ) : (
        <>
          {state.phase === "loading" && (
            <section className="card state-loading" data-state="loading">
              <p>正在连接本地数据库…</p>
            </section>
          )}

          {state.phase === "error" && (
            <section className="card state-error" data-state="error" role="alert">
              <h2>连接失败</h2>
              <p className="error-message">{state.message}</p>
              <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后刷新本页。</p>
            </section>
          )}

          {state.phase === "ready" && (
            <>
              <section className="card" data-state="today-schedules">
                <h2>今日日程</h2>
                {state.todaySchedules.length === 0 ? (
                  <p className="empty" data-state="today-empty">
                    今天暂无日程——切到「日程」页点日期即可安排。
                  </p>
                ) : (
                  <ul className="today-list">
                    {state.todaySchedules.map((s) => {
                      const linked = s.todoId !== null ? todoById.get(s.todoId) : undefined;
                      return (
                        <li key={`${s.id}-${s.date}`} className="today-item">
                          <span className="today-time">{s.start}–{s.end}</span>
                          <span className="today-title">{s.title}</span>
                          {linked && (
                            <span className={`status-pill ${TODO_BADGES[linked.status].cls}`}>
                              {TODO_BADGES[linked.status].label}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              <section className="card state-ready" data-state="ready">
                <h2>工作台</h2>
                {state.settings.length === 0 ? (
                  <p className="empty" data-state="empty">
                    数据库已就绪（schema v{state.schemaVersion}），还没有任何设置项——这是正常空态。
                  </p>
                ) : (
                  <ul className="settings-list">
                    {state.settings.map((s) => (
                      <li key={s.key}>
                        <code>{s.key}</code> = {s.value}
                      </li>
                    ))}
                  </ul>
                )}
                <dl className="meta">
                  <dt>schema 版本</dt>
                  <dd>v{state.schemaVersion}</dd>
                  <dt>里程碑</dt>
                  <dd>M5 AI 工作台（进行中）</dd>
                </dl>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
