// 协流 XieFlow — r26「通知」tab：左侧类型筛选 + 右侧消息列表（未读加粗 / 时间 / 分类图标）
// 点条跳转与筛选 / 分页 / 未读分组规则全在 shared/notifications，本页零算法分支。
// 截图钉态：?page=notifications&shot=notif-empty|notif-unread|notif-filtered|notif-read|notif-refreshed|notif-error
// ?narrow=1 钉窄屏。真实 CRUD / refresh / 幂等由 e2e + audit-http 锁定。
import { useEffect, useState, type ReactElement } from "react";
import type { Notification, NotificationType } from "@xieflow/shared/notifications";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  notificationSummary,
  notificationTargetTab,
  queryNotifications,
} from "@xieflow/shared/notifications";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

interface NotificationsProps {
  readonly onNavigate: (tab: string) => void;
}

interface NotificationsQuery {
  readonly shot: string;
  readonly type: string;
}

type Phase = "loading" | "error" | "ready";
type Filter = "all" | NotificationType;

const PINNED = new Set([
  "notif-empty", "notif-unread", "notif-filtered", "notif-read", "notif-refreshed", "notif-error",
]);

const SHOT_TIME = "2026-11-20T09:30:00.000Z";
const SHOT_NOTIFICATIONS: Notification[] = [
  { id: 1, type: "approval_pending", title: "待处理审批：采购申请 #91", body: "采购申请正等待你处理，点击前往审批查看并操作。", refType: "approvals", refId: 91, readAt: null, createdAt: SHOT_TIME },
  { id: 2, type: "asset_low", title: "物资库存不足：投影仪", body: "投影仪当前库存 2台，已低于阈值 5，点击前往物资补货。", refType: "assets", refId: 81, readAt: null, createdAt: "2026-11-20T09:20:00.000Z" },
  { id: 3, type: "schedule_due", title: "日程到期：需求评审会", body: "今天 10:00 的日程「需求评审会」已到期。", refType: "schedules", refId: 31, readAt: null, createdAt: "2026-11-20T09:10:00.000Z" },
  { id: 4, type: "sync_conflict", title: "同步冲突：todo 88", body: "字段 [title] 在两端存在差异，点击前往工作台处理。", refType: "sync", refId: 12, readAt: "2026-11-20T08:50:00.000Z", createdAt: "2026-11-20T08:55:00.000Z" },
];

const TYPE_ICONS: Record<NotificationType, string> = {
  schedule_due: "◷",
  approval_pending: "✓",
  asset_low: "▣",
  sync_conflict: "⇄",
  system: "ⓘ",
};

function readQuery(): NotificationsQuery {
  const p = new URLSearchParams(window.location.search);
  return { shot: p.get("shot") ?? "", type: p.get("type") ?? "" };
}

async function getJson<T>(url: string): Promise<T> {
  return (await fetchJsonOrThrow(await apiFetch(url))) as T;
}

async function postJson<T>(url: string, body: unknown = {}): Promise<T> {
  return (await fetchJsonOrThrow(await apiFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }))) as T;
}

/** 时间展示：本地时区 HH:mm，钉态字符串由浏览器按本地时区解析，画面确定 */
function displayTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function NotificationsPage({ onNavigate }: NotificationsProps): ReactElement {
  const query = readQuery();
  const [phase, setPhase] = useState<Phase>(() => (query.shot === "notif-loading" ? "loading" : query.shot === "notif-error" ? "error" : "ready"));
  const [error, setError] = useState(query.shot === "notif-error" ? `${SERVICE_DOWN_MESSAGE}（r26 通知链路错误态）` : "");
  const [items, setItems] = useState<Notification[]>(() => {
    if (query.shot === "notif-empty") return [];
    if (query.shot === "notif-read") return SHOT_NOTIFICATIONS.map((n, i) => (i === 0 ? { ...n, readAt: SHOT_TIME } : n));
    return query.shot === "" || query.shot === "notif-loading" || query.shot === "notif-error" ? [] : SHOT_NOTIFICATIONS;
  });
  const [filter, setFilter] = useState<Filter>(() =>
    query.shot === "notif-filtered" ? "approval_pending" : NOTIFICATION_TYPES.includes(query.type as NotificationType) ? query.type as NotificationType : "all",
  );
  const [refreshNote, setRefreshNote] = useState(query.shot === "notif-refreshed" ? "refresh 完成：新增 0 条，跳过 3 条（幂等）" : "");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (PINNED.has(query.shot) || query.shot === "notif-loading") return;
    let alive = true;
    setPhase("loading");
    const suffix = filter === "all" ? "" : `?type=${encodeURIComponent(filter)}`;
    getJson<{ notifications: Notification[] }>(`/api/notifications${suffix}`)
      .then((data) => {
        if (!alive) return;
        setItems(data.notifications);
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      });
    return () => {
      alive = false;
    };
  }, [filter, query.shot]);

  const summary = notificationSummary(items);
  const visible = queryNotifications(items, { type: filter === "all" ? undefined : filter, pageSize: 100 }).notifications;

  async function markRead(n: Notification): Promise<void> {
    setActionError("");
    try {
      if (!PINNED.has(query.shot)) {
        await postJson(`/api/notifications/${n.id}/read`);
      }
      setItems((prev) => prev.map((item) => (item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item)));
      onNavigate(notificationTargetTab(n));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function markAllRead(): Promise<void> {
    setActionError("");
    try {
      if (!PINNED.has(query.shot)) await postJson("/api/notifications/read-all");
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function refresh(): Promise<void> {
    setActionError("");
    try {
      const result = PINNED.has(query.shot)
        ? { created: 0, skipped: 3 }
        : await postJson<{ created: number; skipped: number }>("/api/notifications/refresh");
      setRefreshNote(`refresh 完成：新增 ${result.created} 条，跳过 ${result.skipped} 条（幂等）`);
      if (!PINNED.has(query.shot)) {
        const data = await getJson<{ notifications: Notification[] }>("/api/notifications");
        setItems(data.notifications);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="notif-page" data-state="notif-page">
      <h1>通知中心</h1>
      <p className="notif-intro">站内消息统一聚合：日程到期、待办审批、库存不足、同步冲突与系统消息；点消息直达对应模块。</p>

      <div className="notif-toolbar">
        <span className="notif-count" data-state="notif-count">未读 {summary.unread} / 全部 {summary.total}</span>
        <button type="button" data-action="notif-refresh" onClick={() => void refresh()}>刷新通知</button>
        <button type="button" data-action="notif-read-all" onClick={() => void markAllRead()}>全部已读</button>
      </div>
      {refreshNote !== "" && <p className="notif-refresh-note" data-state="notif-refreshed">{refreshNote}</p>}
      {actionError !== "" && <p className="notif-action-error" role="alert">{actionError}</p>}

      <div className="notif-layout">
        <aside className="notif-filters" data-state="notif-filters">
          <h2>类型筛选</h2>
          <button
            type="button"
            className={`nt-filter ${filter === "all" ? "nt-filter-active" : ""}`}
            data-filter="all"
            onClick={() => setFilter("all")}
          >
            全部 <span>{summary.total}</span>
          </button>
          {NOTIFICATION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`nt-filter ${filter === t ? "nt-filter-active" : ""}`}
              data-filter={t}
              onClick={() => setFilter(t)}
            >
              <span className="nt-icon" aria-hidden="true">{TYPE_ICONS[t]}</span>
              {NOTIFICATION_TYPE_LABELS[t]} <span>{summary.unreadByType[t]}</span>
            </button>
          ))}
        </aside>

        <section className="notif-list" data-state="notif-list">
          {phase === "loading" && <p className="state-loading">正在读取通知…</p>}
          {phase === "error" && (
            <div className="state-error" role="alert" data-state="notif-error">
              <h2>连接失败</h2>
              <p className="error-message">{error}</p>
              <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后重试。</p>
              <button type="button" onClick={() => setPhase("ready")}>重试</button>
            </div>
          )}
          {phase === "ready" && visible.length === 0 && (
            <p className="empty" data-state="notif-empty">暂无通知——造出待办审批或库存不足事件后点「刷新通知」即可聚合。</p>
          )}
          {phase === "ready" && visible.map((n) => (
            <button
              type="button"
              key={n.id}
              className={`nt-item ${n.readAt === null ? "nt-unread" : ""}`}
              data-state="notif-item"
              data-notification-id={n.id}
              data-ref-type={n.refType}
              onClick={() => void markRead(n)}
            >
              <span className="nt-icon" aria-hidden="true">{TYPE_ICONS[n.type]}</span>
              <span className="nt-body">
                <span className="nt-title" data-state={n.readAt === null ? "notif-unread" : "notif-read"}>
                  {n.readAt === null && <strong>{n.title}</strong>}
                  {n.readAt !== null && <span>{n.title}</span>}
                </span>
                <span className="nt-detail">{n.body}</span>
              </span>
              <span className="nt-meta">
                <span className="nt-type">{NOTIFICATION_TYPE_LABELS[n.type]}</span>
                <time dateTime={n.createdAt}>{displayTime(n.createdAt)}</time>
              </span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
