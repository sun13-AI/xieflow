// 协流 XieFlow — OfflineStatus.tsx：顶栏在线圆点 + 离线队列徽标 + 立即同步（r20 · M10 起步）
// 规则全部在 shared（队列归一 / 按序重放 / 响应语义）；这里只做状态装配与用户可见反馈。
// 截图钉态用 ?shot=net-online|net-offline|offline-queue|replay-success|pwa-install|sw-ready|offline-error。
import { useCallback, useEffect, useState } from "react";
import {
  OFFLINE_CONNECTION_EVENT,
  OFFLINE_QUEUE_EVENT,
  OFFLINE_REPLAY_PATH,
  clearOfflineQueue,
  loadOfflineQueue,
  planOfflineReplay,
  saveOfflineQueue,
} from "@xieflow/shared";
import { apiFetch, isBrowserOffline } from "./authClient";

interface NetView {
  readonly online: boolean;
  readonly count: number;
  readonly message: string;
  readonly error: string;
  readonly success: boolean;
  readonly busy: boolean;
  readonly installHint: boolean;
  readonly swReady: boolean;
}

const BASE: NetView = {
  online: true, count: 0, message: "", error: "", success: false,
  busy: false, installHint: false, swReady: false,
};

function pinned(shot: string): NetView | null {
  if (shot === "net-online") return { ...BASE, swReady: true };
  if (shot === "net-offline") return { ...BASE, online: false, count: 1 };
  if (shot === "offline-queue") return { ...BASE, online: false, count: 3, message: "离线：3 条操作已保存到本地队列。" };
  if (shot === "replay-success") return { ...BASE, count: 0, success: true, message: "已按序重放 3 条离线操作，队列已清空。" };
  if (shot === "pwa-install") return { ...BASE, swReady: true, installHint: true };
  if (shot === "sw-ready") return { ...BASE, swReady: true };
  if (shot === "offline-error") return { ...BASE, online: false, count: 2, error: "同步失败：重放冲突（HTTP 409），请处理后再试。" };
  return null;
}

export default function OfflineStatus() {
  const shot = new URLSearchParams(window.location.search).get("shot") ?? "";
  const fixed = pinned(shot);
  const [view, setView] = useState<NetView>(fixed ?? BASE);

  const refresh = useCallback(() => {
    if (fixed) return;
    setView((v) => ({ ...v, online: !isBrowserOffline(), count: loadOfflineQueue(window.localStorage).length }));
  }, [fixed]);

  const onQueueChange = useCallback(() => {
    refresh();
    const n = loadOfflineQueue(window.localStorage).length;
    if (n > 0) setView((v) => ({ ...v, message: `离线：${n} 条操作已保存到本地队列，恢复网络后点「立即同步」重发。` }));
  }, [refresh]);

  useEffect(() => {
    if (fixed) return;
    refresh();
    const onOnline = () => {
      window.dispatchEvent(new Event(OFFLINE_CONNECTION_EVENT));
      refresh();
    };
    const onOffline = () => {
      window.dispatchEvent(new Event(OFFLINE_CONNECTION_EVENT));
      refresh();
    };
    const onInstallPrompt = () => setView((v) => ({ ...v, installHint: true }));
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(OFFLINE_QUEUE_EVENT, onQueueChange);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) setView((v) => ({ ...v, swReady: true }));
      }).catch(() => { /* SW 是加分项，不阻塞 */ });
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(OFFLINE_QUEUE_EVENT, onQueueChange);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
    };
  }, [fixed, refresh]);

  async function syncNow(): Promise<void> {
    if (fixed) {
      setView({ ...BASE, count: 0, success: true, message: "已按序重放队列操作，队列已清空。" });
      return;
    }
    const items = planOfflineReplay(loadOfflineQueue(window.localStorage));
    if (items.length === 0) {
      setView((v) => ({ ...v, message: "当前没有待同步的操作。", success: false }));
      return;
    }
    setView((v) => ({ ...v, busy: true, error: "", success: false, message: "正在按序重放…" }));
    try {
      const res = await apiFetch(OFFLINE_REPLAY_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = (await res.json().catch(() => null)) as {
        replayed?: number; conflictIndex?: number; error?: string;
      } | null;
      if (res.ok) {
        clearOfflineQueue(window.localStorage);
        window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
        setView((v) => ({
          ...v, busy: false, count: 0, success: true,
          message: `已按序重放 ${data?.replayed ?? items.length} 条离线操作，队列已清空。`,
        }));
        return;
      }
      const index = data?.conflictIndex ?? -1;
      let remaining = items;
      if (index >= 0 && index < items.length) {
        remaining = items.slice(index); // 已成功条目出队；冲突及其后保留待人工处理
        saveOfflineQueue(window.localStorage, remaining);
      }
      setView((v) => ({
        ...v, busy: false, count: remaining.length, success: false,
        error: data?.error ?? `同步失败（HTTP ${res.status}）`,
      }));
    } catch (err) {
      setView((v) => ({ ...v, busy: false, success: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  return (
    <span className="offline-status" data-state="offline-status">
      <span className="net-status" data-state="net-status" data-online={view.online ? "true" : "false"} title={view.online ? "网络已连接" : "当前离线，写操作将入队"}>
        <span className="net-dot" aria-hidden="true" />
        <span className="net-label">{view.online ? "在线" : "离线"}</span>
      </span>
      <span className="queue-badge" data-state="queue-badge" data-count={view.count}>
        待同步 <strong>{view.count}</strong>
      </span>
      <button type="button" className="queue-sync-btn" data-state="queue-sync" disabled={view.busy} onClick={() => void syncNow()}>
        {view.busy ? "同步中…" : "立即同步"}
      </button>
      {view.swReady && <span className="sw-ready-hint" data-state="sw-ready">离线缓存已就绪</span>}
      {view.installHint && <span className="pwa-install-hint" data-state="pwa-install">可安装为应用 · 离线也能打开</span>}
      {view.success && <span className="net-success" data-state="replay-success">{view.message}</span>}
      {view.message !== "" && !view.success && !view.error && <span className="net-message" data-state="net-message">{view.message}</span>}
      {view.error !== "" && <span className="net-error" data-state="net-error" role="alert">{view.error}</span>}
    </span>
  );
}
