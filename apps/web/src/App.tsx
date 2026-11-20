// 协流 XieFlow — 外壳：页面切换（useState tab，无路由库）+ 首页工作台
// r3 起：工作台（设置项 + schema 卡 + 今日日程卡）/ 待办页 / 日程页三个 tab。
// r4 起：+ 项目页 / 看板页（M2 第 1 片）。
// r8 起：+ 文档页（M4 第 1 片：块级文档编辑器），壳基线随之扩为七 tab。
// r9：文档页加 Markdown 导入导出与 AI 块级修订；壳徽章随轮次更新。
// r10：+ AI 工作台页（M5 第 1 片：对话 / 工具调用 / 产物预览），壳基线扩为八 tab。
// r12：+ 知识库页（M6 第 1 片：入库 / TF-IDF 检索 / 来源引用），壳基线扩为九 tab。
// r14：+ 导图页（M7 第 1 片：Markdown 双视图），壳基线扩为十 tab。
// r15：+ 白板页（M7 第 2 片：无限画布 / 便签 / AI 建板），壳基线扩为十一 tab。
// r16：+ 审批页（M8 第 1 片：发起 / 三视角 / 时间线 / 操作），壳基线扩为十二 tab。
// r17：+ 物资页 + 单位任务页（M8 收官），壳基线扩为十四 tab。
// r18：+ 登录/注册独立路由（不占 tab）+ 工作台「本机/远端」模式卡 + 401 清假登录态跳登录。
// r19：+ 工作台设置区「多端同步」卡 + 冲突弹窗选边（不新增 tab，十四 tab 数量不变）。
// r20：+ 顶栏在线圆点 / 离线队列徽标 / 立即同步 + PWA 离线缓存 + ≤600px 底部导航（无新 tab）。
// r23：+ 组织 tab（部门树 + 人员目录），壳基线扩为十五 tab。
// r26：+ 通知 tab（站内消息聚合 + 顶栏未读徽标），壳基线扩为十六 tab。
// r27：+ 报表 tab（跨模块 KPI 看板），壳基线扩为十七 tab。
// r28：+ 会议 tab（会议室预约 / 冲突检测，本地台账），壳基线扩为十八 tab。
import SyncCard from "./SyncCard";
import OfflineStatus from "./OfflineStatus";
// 截图状态真实存在：加载中 / 空数据 / 正常 / 错误 / 窄屏（?narrow=1 显式钉态）
import { useEffect, useState } from "react";
import {
  shouldShowTabsMore,
  type AppSetting,
  type Schedule,
  type Todo,
} from "@xieflow/shared";
import TodosPage from "./TodosPage";
import SchedulesPage from "./SchedulesPage";
import ProjectsPage from "./ProjectsPage";
import BoardPage from "./BoardPage";
import BasesPage from "./BasesPage";
import DocsPage from "./DocsPage";
import ChatPage from "./ChatPage";
import KnowledgePage from "./KnowledgePage";
import MindmapPage from "./MindmapPage";
import WhiteboardPage from "./WhiteboardPage";
import ApprovalPage from "./ApprovalPage";
import AssetsPage from "./AssetsPage";
import UnitTasksPage from "./UnitTasksPage";
import OrgPage from "./OrgPage";
import NotificationsPage from "./NotificationsPage";
import ReportsPage from "./ReportsPage";
import MeetingsPage from "./MeetingsPage";
import { LoginPage, RegisterPage } from "./AuthPages";
import {
  AUTH_CLEARED_EVENT,
  apiFetch,
  clearSession,
  goToLogin,
  readPreferredMode,
  readToken,
  savePreferredMode,
  type FrontendMode,
} from "./authClient";

// r18 返工#1：业务 401 不再静默降级为空态（apiFetch 已清 token + 跳登录，这里只负责停止渲染假数据）
const AUTH_401_MESSAGE = "登录态已失效，正在跳转登录页";

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; settings: AppSetting[]; schemaVersion: number; todaySchedules: Schedule[]; todos: Todo[] };

type PageTab = "home" | "todos" | "schedules" | "projects" | "board" | "bases" | "docs" | "chat" | "knowledge" | "mindmap" | "whiteboard" | "approval" | "assets" | "unit-tasks" | "org" | "notifications" | "reports" | "meetings";

/** 健康检查 + 今日日程（工作台卡片数据源；日程查询失败不阻塞工作台） */
async function fetchHealth(): Promise<{
  schemaVersion: number;
  settings: AppSetting[];
  todaySchedules: Schedule[];
  todos: Todo[];
}> {
  const res = await apiFetch("/api/health");
  if (!res.ok) throw new Error(`健康检查失败：HTTP ${res.status}`);
  const data = (await res.json()) as { schemaVersion: number; settings: AppSetting[] };
  const pad = (n: number): string => String(n).padStart(2, "0");
  const n = new Date();
  const today = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  let todaySchedules: Schedule[] = [];
  let todos: Todo[] = [];
  try {
    const [schRes, todoRes] = await Promise.all([
      apiFetch(`/api/schedules?from=${today}&to=${today}`),
      apiFetch("/api/todos"),
    ]);
    if (schRes.status === 401 || todoRes.status === 401) throw new Error(AUTH_401_MESSAGE);
    if (schRes.ok) {
      todaySchedules = ((await schRes.json()) as { schedules: Schedule[] }).schedules;
    }
    if (todoRes.ok) {
      todos = ((await todoRes.json()) as { todos: Todo[] }).todos;
    }
  } catch (err) {
    if (err instanceof Error && err.message === AUTH_401_MESSAGE) throw err;
    /* 非 401 故障降级为空态，不阻塞工作台 */
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
  const query = new URLSearchParams(window.location.search);
  const authView = query.get("page") === "login" ? "login" : query.get("page") === "register" ? "register" : null;
  const [token, setToken] = useState<string | null>(() => readToken());
  const [serverMode, setServerMode] = useState<FrontendMode>("local");
  const [preferredMode, setPreferredMode] = useState<FrontendMode>(() => readPreferredMode());
  const [modeError, setModeError] = useState("");
  // r22：底栏「更多」与顶栏 ☰ 共用一条开合状态；?nav=open 为截图/复验确定性钉态
  const [navOpen, setNavOpen] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get("nav") === "open",
  );
  const moreVisible = shouldShowTabsMore(navOpen);
  useEffect(() => {
    document.documentElement.classList.toggle("nav-open", navOpen);
  }, [navOpen]);
  function toggleNav(): void {
    setNavOpen((open) => !open);
  }

  useEffect(() => {
    const onCleared = () => setToken(null);
    window.addEventListener(AUTH_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(AUTH_CLEARED_EVENT, onCleared);
  }, []);

  // 服务端模式来自 /api/auth/mode；本机偏好来自 localStorage。远端且无 token → 登录页。
  useEffect(() => {
    let alive = true;
    apiFetch("/api/auth/mode")
      .then((r) => r.json())
      .then((data: { mode?: unknown }) => {
        if (!alive) return;
        const server: FrontendMode = data.mode === "remote" ? "remote" : "local";
        setServerMode(server);
        if ((server === "remote" || readPreferredMode() === "remote") && !readToken() && !authView) {
          goToLogin("remote");
        }
      })
      .catch(() => {
        /* 模式探测失败保持 local 默认，不阻塞单机使用 */
      });
    return () => {
      alive = false;
    };
  }, [authView]);

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
                  : page === "knowledge"
                    ? "knowledge"
                    : page === "mindmap"
                      ? "mindmap"
                      : page === "whiteboard"
                        ? "whiteboard"
                        : page === "approval"
                          ? "approval"
                          : page === "assets"
                            ? "assets"
                            : page === "unit-tasks"
                              ? "unit-tasks"
                              : page === "org"
                                ? "org"
                                : page === "notifications"
                                  ? "notifications"
                                  : page === "reports"
                                    ? "reports"
                                    : page === "meetings"
                                      ? "meetings"
                                      : "home";
  });
  // r26 返工#1：通知跳转把目标 tab 与 refId 定位参数写进地址栏，reload 后仍定位同一实体
  function navigateFromNotification(target: string, params: Readonly<Record<string, string>> = {}): void {
    const url = new URL(window.location.href);
    url.searchParams.set("page", target);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    setTab(target as PageTab);
  }

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
        schemaVersion: 16,
        todaySchedules: workbenchTodaySeed(now),
        todos: [],
      };
    return { phase: "loading" };
  });

  // r26：顶栏全局未读徽标（真实数来自 /api/notifications/summary；截图钉态用固定数）
  const shotName = query.get("shot") ?? "";
  const pinnedUnread = shotName === "notif-read-badge"
    ? 2
    : shotName.startsWith("notif-") && shotName !== "notif-empty" && shotName !== "notif-error" ? 3 : 0;
  const [notifUnread, setNotifUnread] = useState(0);
  const shownUnread = pinnedUnread > 0 ? pinnedUnread : notifUnread;
  useEffect(() => {
    if (pinnedUnread > 0 || authView) return;
    let alive = true;
    apiFetch("/api/notifications/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { unread?: unknown } | null) => {
        if (alive && data && typeof data.unread === "number") setNotifUnread(data.unread);
      })
      .catch(() => {
        /* 汇总失败不阻塞页面 */
      });
    return () => {
      alive = false;
    };
  }, [token, tab, authView, pinnedUnread]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("narrow") === "1") {
      document.documentElement.classList.add("force-narrow");
    }
    const shot = params.get("shot");
    if (shot === "loading" || shot === "error" || shot === "empty" || shot === "ready" || shot === "workbench") {
      return; // 钉态不探测
    }
    if (authView) return; // 登录/注册页不发业务请求：remote 无 token 时 401 会把 login 反复改写为 reason=401
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
  }, [authView]);

  async function switchMode(mode: FrontendMode): Promise<void> {
    setModeError("");
    try {
      const res = await apiFetch("/api/auth/mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = (await res.json().catch(() => null)) as { mode?: unknown; error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `切换失败（HTTP ${res.status}）`);
      savePreferredMode(mode);
      setPreferredMode(mode);
      setServerMode(mode === "remote" ? "remote" : "local");
      if (mode === "remote" && !readToken()) goToLogin("remote");
    } catch (err) {
      setModeError(err instanceof Error ? err.message : String(err));
    }
  }

  async function logout(): Promise<void> {
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: readToken() }),
      });
    } catch {
      /* 网络失败也要清本地假登录态 */
    }
    clearSession();
    setToken(null);
    goToLogin("logout");
  }

  // 认证页是独立路由：在 tab 壳之外整页渲染，因此 14 个 tab 数量不变。
  if (authView === "login") return <LoginPage reason={query.get("reason")} />;
  if (authView === "register") return <RegisterPage reason={query.get("reason")} />;

  const pinnedToken = query.get("auth") === "in" ? "pinned-shot-token" : token;
  const todoById = new Map(state.phase === "ready" ? state.todos.map((t) => [t.id, t]) : []);

  return (
    <main className={tab === "bases" || tab === "docs" || tab === "chat" || tab === "knowledge" || tab === "mindmap" || tab === "whiteboard" || tab === "approval" || tab === "assets" || tab === "unit-tasks" || tab === "org" || tab === "notifications" || tab === "reports" || tab === "meetings" ? "shell shell-wide" : "shell"}>
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
          <button
            type="button"
            className={`tab ${tab === "knowledge" ? "tab-active" : ""}`}
            data-tab="knowledge"
            onClick={() => setTab("knowledge")}
          >
            知识库
          </button>
          <button
            type="button"
            className={`tab ${tab === "mindmap" ? "tab-active" : ""}`}
            data-tab="mindmap"
            onClick={() => setTab("mindmap")}
          >
            导图
          </button>
          <button
            type="button"
            className={`tab ${tab === "whiteboard" ? "tab-active" : ""}`}
            data-tab="whiteboard"
            onClick={() => setTab("whiteboard")}
          >
            白板
          </button>
          <button
            type="button"
            className={`tab ${tab === "approval" ? "tab-active" : ""}`}
            data-tab="approval"
            onClick={() => setTab("approval")}
          >
            审批
          </button>
          <button
            type="button"
            className={`tab ${tab === "assets" ? "tab-active" : ""}`}
            data-tab="assets"
            onClick={() => setTab("assets")}
          >
            物资
          </button>
          <button
            type="button"
            className={`tab ${tab === "unit-tasks" ? "tab-active" : ""}`}
            data-tab="unit-tasks"
            onClick={() => setTab("unit-tasks")}
          >
            单位任务
          </button>
          <button
            type="button"
            className={`tab ${tab === "org" ? "tab-active" : ""}`}
            data-tab="org"
            onClick={() => setTab("org")}
          >
            组织
          </button>
          <button
            type="button"
            className={`tab ${tab === "notifications" ? "tab-active" : ""}`}
            data-tab="notifications"
            onClick={() => setTab("notifications")}
          >
            通知
            {shownUnread > 0 && (
              <span className="notif-badge" data-state="notif-badge" aria-label="未读通知">{shownUnread}</span>
            )}
          </button>
          <button
            type="button"
            className={`tab ${tab === "reports" ? "tab-active" : ""}`}
            data-tab="reports"
            onClick={() => setTab("reports")}
          >
            报表
          </button>
          <button
            type="button"
            className={`tab ${tab === "meetings" ? "tab-active" : ""}`}
            data-tab="meetings"
            onClick={() => setTab("meetings")}
          >
            会议
          </button>
          <span className="topbar-notif" data-state="notif-badge-global">未读 {shownUnread}</span>
        </nav>
        <div className="tabs-more-wrap" data-state="tabs-more" data-more-visible={moreVisible ? "1" : "0"}>
          <span className="tabs-more-fade" aria-hidden="true" />
          <button type="button" className="tabs-more" aria-label="更多导航" onClick={toggleNav}>更多 ›</button>
        </div>
        <span className="badge">r28 · 会议管理（预约/冲突检测）</span>
        <OfflineStatus />
        <button type="button" className="nav-toggle" data-state="nav-toggle" aria-label="展开导航" onClick={toggleNav}>☰</button>
        <span className="auth-controls" data-state="auth-controls">
          {pinnedToken ? (
            <button type="button" className="auth-top-btn" onClick={logout}>退出登录</button>
          ) : (
            <button type="button" className="auth-top-btn" onClick={() => goToLogin(null)}>登录</button>
          )}
        </span>
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
      ) : tab === "knowledge" ? (
        <KnowledgePage />
      ) : tab === "mindmap" ? (
        <MindmapPage />
      ) : tab === "whiteboard" ? (
        <WhiteboardPage />
      ) : tab === "approval" ? (
        <ApprovalPage />
      ) : tab === "assets" ? (
        <AssetsPage />
      ) : tab === "unit-tasks" ? (
        <UnitTasksPage />
      ) : tab === "org" ? (
        <OrgPage />
      ) : tab === "notifications" ? (
        <NotificationsPage onNavigate={(target, params) => navigateFromNotification(target, params)} />
      ) : tab === "reports" ? (
        <ReportsPage />
      ) : tab === "meetings" ? (
        <MeetingsPage />
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
              <section className="card server-mode-card" data-state="server-mode">
                <h2>服务模式</h2>
                <p className="mode-current">
                  当前：{serverMode === "remote" ? "远端（需登录）" : "本机（免登录）"}
                  <span className="mode-sep">·</span>
                  本机偏好：{preferredMode === "remote" ? "远端" : "本机"}
                </p>
                <p className="mode-data-note" data-state="mode-data-note">
                  数据归属：本机＝数据存这台电脑的本地库、免登录；远端＝数据由服务端提供、需登录。切换只换数据来源，不删除已有数据。
                </p>
                <p className="mode-glossary" data-state="mode-glossary">
                  「当前」是服务端实际生效的模式；「本机偏好」是你上次选的模式，重连时优先使用。
                </p>
                <div className="mode-switch">
                  <button
                    type="button"
                    className={`mode-btn ${preferredMode === "local" ? "mode-btn-active" : ""}`}
                    data-mode="local"
                    onClick={() => switchMode("local")}
                  >本机</button>
                  <button
                    type="button"
                    className={`mode-btn ${preferredMode === "remote" ? "mode-btn-active" : ""}`}
                    data-mode="remote"
                    onClick={() => switchMode("remote")}
                  >远端</button>
                </div>
                <p className="mode-consequence">切到「远端」后业务请求需带登录凭证；遇到 401 会清除本地登录态并跳转登录页。</p>
                {modeError !== "" && <p className="mode-error" role="alert">{modeError}</p>}
                {query.get("shot") === "mode-settings" && (
                  <p className="shot-note" data-state="shot-note">截图钉注：设置区「本机/远端」切换卡；服务端模式来自 GET /api/auth/mode。</p>
                )}
              </section>
              <SyncCard />
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
                  <dd>M10 多端与单机版（起步）</dd>
                </dl>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
