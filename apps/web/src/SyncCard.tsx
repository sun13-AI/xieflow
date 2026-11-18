// 协流 XieFlow — SyncCard.tsx：设置区「多端同步」卡 + 冲突选边弹窗（r19 · M9 收官）
// 卡片留在工作台（设置区）内，不新增 tab —— 十四 tab 数量不变。
// 算法全部在 shared/db：这里是纯装配 + 状态展示 + 冲突弹窗选边调用 POST /api/sync/apply。
import { useEffect, useState } from "react";
import { apiFetch } from "./authClient";

type FieldDiff = { readonly field: string; readonly local: string; readonly remote: string };
type SyncConflict = {
  readonly entityType: string;
  readonly entityId: string;
  readonly currentVersion: number;
  readonly fields: readonly FieldDiff[];
  readonly base: Record<string, unknown>;
  readonly local: Record<string, unknown>;
  readonly remote: Record<string, unknown>;
};

type SyncView = {
  readonly lastSyncAt: string | null;
  readonly pending: number;
  readonly conflicts: readonly SyncConflict[];
  readonly totalVersions: number;
  readonly message: string;
  readonly error: string;
  readonly success: boolean;
  readonly modalOpen: boolean;
  readonly currentVersion: number;
};

const EMPTY: SyncView = {
  lastSyncAt: null, pending: 0, conflicts: [], totalVersions: 0,
  message: "", error: "", success: false, modalOpen: false, currentVersion: 0,
};

function text(v: unknown): string {
  if (v === undefined) return "（无此字段）";
  if (v === null) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function pinnedState(shot: string): SyncView | null {
  const now = new Date().toISOString();
  const earlier = new Date(Date.now() - 1000 * 60 * 42).toISOString();
  const conflict: SyncConflict = {
    entityType: "todo",
    entityId: "r19-sync-demo",
    currentVersion: 2,
    fields: [
      { field: "title", local: "本地改：季度复盘（本机）", remote: "远端改：季度复盘（服务端）" },
      { field: "status", local: "open", remote: "done" },
    ],
    base: { title: "季度复盘", status: "open" },
    local: { title: "本地改：季度复盘（本机）", status: "open" },
    remote: { title: "远端改：季度复盘（服务端）", status: "done" },
  };
  if (shot === "sync-idle") return { ...EMPTY, lastSyncAt: now, totalVersions: 6 };
  if (shot === "sync-pending") return { ...EMPTY, lastSyncAt: earlier, pending: 3, totalVersions: 6 };
  if (shot === "sync-conflicts") return { ...EMPTY, lastSyncAt: earlier, pending: 3, conflicts: [conflict], totalVersions: 6 };
  if (shot === "sync-modal") return { ...EMPTY, lastSyncAt: earlier, pending: 3, conflicts: [conflict], totalVersions: 6, modalOpen: true };
  if (shot === "sync-success") return { ...EMPTY, lastSyncAt: now, totalVersions: 7, success: true, message: "同步完成：拉取 3 条变更，写入 0 冲突。" };
  if (shot === "sync-error") return { ...EMPTY, lastSyncAt: earlier, pending: 3, error: "同步失败：HTTP 500（截图钉态），请稍后重试。" };
  return null;
}

function formatTime(iso: string | null): string {
  if (!iso) return "从未同步";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "时间未知";
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function SyncCard() {
  const shot = new URLSearchParams(window.location.search).get("shot") ?? "";
  const pinned = pinnedState(shot);
  const [view, setView] = useState<SyncView>(pinned ?? EMPTY);

  useEffect(() => {
    if (pinned) return; // 钉态不探测（真实数据由 HTTP audit 锁定）
    let alive = true;
    apiFetch("/api/sync/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((sd: { lastChangeAt: string | null; total: number } | null) => {
        if (!alive || !sd) return;
        return apiFetch("/api/sync/changes?since=0&limit=200")
          .then((r) => (r.ok ? r.json() : null))
          .then((cd: { count: number } | null) => {
            if (!alive || !cd) return;
            setView({ ...EMPTY, lastSyncAt: sd.lastChangeAt, pending: cd.count, totalVersions: sd.total });
          });
      })
      .catch((err: unknown) => {
        if (alive) setView({ ...EMPTY, error: err instanceof Error ? err.message : String(err) });
      });
    return () => { alive = false; };
  }, [pinned]);

  async function manualSync(): Promise<void> {
    setView((v) => ({ ...v, message: "正在同步…", error: "", success: false }));
    try {
      const s = await apiFetch("/api/sync/status");
      const c = await apiFetch("/api/sync/changes?since=0&limit=200");
      if (!s.ok || !c.ok) throw new Error(`同步失败（status ${s.status} / changes ${c.status}）`);
      const sd = await s.json() as { lastChangeAt: string | null; total: number };
      const cd = await c.json() as { count: number };
      setView((v) => ({
        ...v, lastSyncAt: sd.lastChangeAt, pending: cd.count, totalVersions: sd.total,
        success: true, message: `同步完成：拉取 ${cd.count} 条变更，冲突 ${v.conflicts.length} 项。`,
      }));
    } catch (err) {
      setView((v) => ({ ...v, error: err instanceof Error ? err.message : String(err), success: false, message: "" }));
    }
  }

  /** 选边：把所选快照作为新载荷，用服务端当前版本做乐观锁写入（冲突已由弹窗消化） */
  async function resolve(side: "local" | "remote"): Promise<void> {
    const active = view.conflicts[0];
    if (!active) return;
    const payload = side === "local" ? active.local : active.remote;
    try {
      const res = await apiFetch("/api/sync/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType: active.entityType, entityId: active.entityId, operation: "update",
          payload, expectedVersion: active.currentVersion, base: active.base,
        }),
      });
      if (res.status === 409) {
        const data = await res.json() as { currentVersion: number; conflicts: string[]; remote: Record<string, unknown>; base: Record<string, unknown> };
        setView((v) => ({
          ...v,
          conflicts: [{
            ...active,
            currentVersion: data.currentVersion,
            fields: data.conflicts.map((f) => ({ field: f, local: text(active.local[f]), remote: text(data.remote[f]) })),
            base: data.base, remote: data.remote,
          }],
          message: "服务端又有新改动，请重新选边。",
        }));
        return;
      }
      if (!res.ok) throw new Error(`写入失败（HTTP ${res.status}）`);
      setView((v) => ({
        ...v,
        conflicts: v.conflicts.slice(1),
        modalOpen: v.conflicts.length <= 1,
        currentVersion: active.currentVersion + 1,
        pending: Math.max(0, v.pending - 1),
        success: true,
        message: `已选择${side === "local" ? "本地" : "远端"}版本并写入，版本递增到 ${active.currentVersion + 1}。`,
      }));
    } catch (err) {
      setView((v) => ({ ...v, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  const active = view.conflicts[0];

  return (
    <section className="card sync-card" data-state="sync-card">
      <h2>多端同步</h2>
      <p className="sync-line" data-state="sync-last">最近同步：{formatTime(view.lastSyncAt)}</p>
      <p className="sync-line" data-state="sync-pending">
        未同步变更：<strong>{view.pending}</strong> 条
        <span className="mode-sep">·</span>
        已跟踪实体版本：<strong>{view.totalVersions}</strong>
      </p>
      {view.conflicts.length > 0 ? (
        <div className="sync-conflict-list" data-state="sync-conflicts">
          <p className="sync-conflict-head">冲突列表（{view.conflicts.length} 项，需选择保留哪一边）：</p>
          <ul>
            {view.conflicts.map((c) => (
              <li key={`${c.entityType}:${c.entityId}`} className="sync-conflict-item">
                <code>{c.entityType}:{c.entityId}</code>
                <span className="sync-conflict-fields">冲突字段：{c.fields.length > 0 ? c.fields.map((f) => f.field).join("、") : "无严格冲突（仅版本分叉）"}</span>
                <button type="button" className="sync-btn" onClick={() => setView((v) => ({ ...v, modalOpen: true }))}>查看差异并选边</button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="sync-empty" data-state="sync-no-conflict">当前没有待处理的同步冲突。</p>
      )}
      <div className="sync-actions">
        <button type="button" className="mode-btn mode-btn-active sync-btn" data-state="sync-manual" onClick={() => void manualSync()}>手动同步</button>
        <span className="sync-hint">增量拉取 GET /api/sync/changes；写入 POST /api/sync/apply（带期望版本，冲突 409）。</span>
      </div>
      {view.message !== "" && <p className="sync-message" data-state="sync-message">{view.message}</p>}
      {view.success && <p className="sync-success" data-state="sync-success">✓ 同步成功，冲突已消化。</p>}
      {view.error !== "" && <p className="mode-error" role="alert" data-state="sync-error">{view.error}</p>}
      {shot.startsWith("sync-") && (
        <p className="shot-note" data-state="shot-note">截图钉注：多端同步卡（形态为真实状态，数据由 HTTP audit 锁定）。</p>
      )}

      {view.modalOpen && active && (
        <div className="sync-modal-backdrop" data-state="sync-modal">
          <div className="sync-modal" role="dialog" aria-modal="true" aria-label="同步冲突选边">
            <h3>同步冲突：选择保留哪一边</h3>
            <p className="sync-modal-meta">
              实体 <code>{active.entityType}:{active.entityId}</code> · 服务端当前版本 {active.currentVersion}
            </p>
            <table className="sync-diff-table">
              <thead><tr><th>字段</th><th>本地</th><th>远端</th></tr></thead>
              <tbody>
                {active.fields.map((f) => (
                  <tr key={f.field}>
                    <td><code>{f.field}</code></td>
                    <td className="sync-diff-local">{f.local}</td>
                    <td className="sync-diff-remote">{f.remote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="sync-modal-actions">
              <button type="button" className="sync-btn" data-side="local" onClick={() => void resolve("local")}>保留本地</button>
              <button type="button" className="sync-btn sync-btn-primary" data-side="remote" onClick={() => void resolve("remote")}>保留远端</button>
              <button type="button" className="sync-btn" onClick={() => setView((v) => ({ ...v, modalOpen: false }))}>稍后处理</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
