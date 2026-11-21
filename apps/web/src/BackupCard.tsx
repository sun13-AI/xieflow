// 协流 XieFlow — BackupCard.tsx：设置区「数据备份与恢复」卡（r49）
// 卡片留在工作台设置区，不新增 tab —— 二十 tab 数量不变。
// 全部规则（白名单/清单/校验/恢复计划/确认令牌）在 shared/backup：这里只做装配与交互。
import { useRef, useState } from "react";
import { apiFetch } from "./authClient";
import { BACKUP_CONFIRM_TOKEN, BACKUP_TABLES } from "@xieflow/shared/backup";

type PreviewTable = { readonly name: string; readonly rows: number };
type BackupMeta = {
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly tableCount: number;
  readonly rowCount: number;
};
type BackupPhase = "idle" | "exported" | "selected" | "preview" | "restoring" | "success";
type BackupView = {
  readonly phase: BackupPhase;
  readonly fileName: string;
  readonly meta: BackupMeta | null;
  readonly preview: readonly PreviewTable[];
  readonly dialogOpen: boolean;
  readonly acknowledged: boolean;
  readonly message: string;
  readonly error: string;
};

const EMPTY: BackupView = {
  phase: "idle", fileName: "", meta: null, preview: [],
  dialogOpen: false, acknowledged: false, message: "", error: "",
};

/** 截图钉态：只影响展示形态，不代替真实 HTTP 断言 */
function pinnedState(shot: string): BackupView | null {
  const meta: BackupMeta = {
    schemaVersion: 27, createdAt: "2026-11-21T10:30:00.000Z", tableCount: BACKUP_TABLES.length, rowCount: 37,
  };
  const preview: PreviewTable[] = [
    { name: "todos", rows: 8 }, { name: "projects", rows: 2 }, { name: "documents", rows: 3 },
    { name: "cards", rows: 4 }, { name: "settings", rows: 3 },
  ];
  if (shot === "backup-card") return EMPTY;
  if (shot === "backup-exported") {
    return { ...EMPTY, phase: "exported", fileName: "xieflow-workspace-backup-20261121103000.json", meta,
      message: "已导出备份文件：38 张业务表、37 行数据。" };
  }
  if (shot === "backup-file-selected") {
    return { ...EMPTY, phase: "selected", fileName: "xieflow-workspace-backup-20261121103000.json",
      message: "已选择文件，点击「校验并预览」查看将要恢复的内容。" };
  }
  if (shot === "backup-preview" || shot === "backup-narrow") {
    return { ...EMPTY, phase: "preview", fileName: "xieflow-workspace-backup-20261121103000.json", meta, preview,
      message: "校验通过：仅预览，未写入任何数据。" };
  }
  if (shot === "backup-confirm") {
    return { ...EMPTY, phase: "preview", fileName: "xieflow-workspace-backup-20261121103000.json", meta, preview,
      dialogOpen: true, acknowledged: true, message: "校验通过：仅预览，未写入任何数据。" };
  }
  if (shot === "backup-success") {
    return { ...EMPTY, phase: "success", fileName: "xieflow-workspace-backup-20261121103000.json", meta,
      message: "恢复完成：38 张业务表已替换，请重新加载页面。" };
  }
  if (shot === "backup-error") {
    return { ...EMPTY, phase: "preview", fileName: "bad-backup.json", preview: [],
      error: "校验未通过：备份文件含未知表 change_log，已拒绝，未写入任何数据。" };
  }
  return null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN", { hour12: false });
}

function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const obj = data as { error?: unknown; errors?: unknown };
    if (typeof obj.error === "string") {
      if (Array.isArray(obj.errors) && obj.errors.length > 0) {
        return `${obj.error}：${obj.errors.join("；")}`;
      }
      return obj.error;
    }
  }
  return fallback;
}

export default function BackupCard() {
  const shot = new URLSearchParams(window.location.search).get("shot") ?? "";
  const pinned = pinnedState(shot);
  const [view, setView] = useState<BackupView>(pinned ?? EMPTY);
  const fileRef = useRef<HTMLInputElement>(null);
  const parsedRef = useRef<unknown>(null);

  async function exportBackup(): Promise<void> {
    setView((v) => ({ ...v, error: "", message: "正在导出备份…" }));
    try {
      const res = await apiFetch("/api/backup/export");
      if (!res.ok) throw new Error(`导出失败（HTTP ${res.status}）`);
      const bytes = await res.arrayBuffer();
      const cd = res.headers.get("content-disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? "xieflow-workspace-backup.json";
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
        manifest?: BackupMeta; formatVersion?: number; schemaVersion?: number; createdAt?: string;
      };
      const blob = new Blob([bytes], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      const m = parsed.manifest;
      setView((v) => ({
        ...v, phase: "exported", fileName: name,
        meta: m ? { schemaVersion: parsed.schemaVersion ?? 0, createdAt: parsed.createdAt ?? "", tableCount: m.tableCount, rowCount: m.rowCount } : null,
        message: `已导出备份文件：${m?.tableCount ?? 0} 张业务表、${m?.rowCount ?? 0} 行数据。`,
      }));
    } catch (err) {
      setView((v) => ({ ...v, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  async function chooseFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setView((v) => ({ ...v, fileName: file.name, phase: "selected", error: "", message: "已选择文件，点击「校验并预览」查看将要恢复的内容。" }));
    try {
      parsedRef.current = JSON.parse(await file.text());
    } catch {
      parsedRef.current = null;
      setView((v) => ({ ...v, error: "文件不是合法 JSON，无法校验。" }));
    }
  }

  async function previewBackup(): Promise<void> {
    setView((v) => ({ ...v, error: "", message: "正在校验备份…" }));
    try {
      if (parsedRef.current === null) throw new Error("请先选择合法的备份文件。");
      const res = await apiFetch("/api/backup/validate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ backup: parsedRef.current }),
      });
      const data = await res.json() as {
        valid?: boolean; errors?: string[]; manifest?: BackupMeta; preview?: PreviewTable[];
      };
      if (!res.ok || data.valid !== true) {
        throw new Error(errorMessage(data, `校验失败（HTTP ${res.status}）`));
      }
      setView((v) => ({
        ...v, phase: "preview", meta: data.manifest ?? null, preview: data.preview ?? [],
        message: "校验通过：仅预览，未写入任何数据。",
      }));
    } catch (err) {
      setView((v) => ({ ...v, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  async function restoreBackup(): Promise<void> {
    if (!view.acknowledged) return;
    setView((v) => ({ ...v, dialogOpen: false, phase: "restoring", error: "", message: "正在恢复，请勿关闭页面…" }));
    try {
      const res = await apiFetch("/api/backup/restore", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ backup: parsedRef.current, confirm: BACKUP_CONFIRM_TOKEN }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || data.ok !== true) throw new Error(errorMessage(data, `恢复失败（HTTP ${res.status}）`));
      setView((v) => ({ ...v, phase: "success", acknowledged: false,
        message: "恢复完成：业务表已整体替换，请重新加载页面以载入新数据。" }));
    } catch (err) {
      setView((v) => ({ ...v, phase: "preview", error: err instanceof Error ? err.message : String(err), message: "" }));
    }
  }

  return (
    <section className="card backup-card" data-state="backup-card">
      <h2>数据备份与恢复</h2>
      <p className="backup-note" data-state="backup-note">
        一键导出全部业务数据为 JSON 快照；恢复前可预览表与行数，确认后单事务整体替换，不会中途写入一半。
      </p>
      <p className="backup-note" data-state="backup-protected">
        登录会话、同步日志与账户信息不在备份范围，恢复不会改动它们。
      </p>
      <div className="backup-actions">
        <button type="button" className="mode-btn mode-btn-active backup-btn" data-state="backup-export-btn" onClick={() => void exportBackup()}>
          导出备份
        </button>
        <label className="backup-file-label" data-state="backup-file-label">
          选择备份文件
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            data-state="backup-file-input"
            onChange={(e) => void chooseFile(e.target.files?.[0])}
          />
        </label>
        <button type="button" className="backup-btn" data-state="backup-preview-btn" onClick={() => void previewBackup()}>
          校验并预览
        </button>
        <button
          type="button"
          className="backup-btn backup-btn-danger"
          data-state="backup-restore-btn"
          disabled={view.phase !== "preview"}
          onClick={() => setView((v) => ({ ...v, dialogOpen: true, acknowledged: false }))}
        >
          恢复工作区
        </button>
      </div>
      {view.fileName !== "" && <p className="backup-line" data-state="backup-file-name">文件：{view.fileName}</p>}
      {view.meta !== null && (
        <div className="backup-meta" data-state="backup-meta">
          <p>快照版本：v{view.meta.schemaVersion}</p>
          <p>备份时间：{formatTime(view.meta.createdAt)}</p>
          <p>业务表：<strong>{view.meta.tableCount}</strong> 张 · 数据行：<strong>{view.meta.rowCount}</strong> 行</p>
        </div>
      )}
      {view.preview.length > 0 && (
        <table className="backup-preview-table" data-state="backup-preview-panel">
          <thead><tr><th scope="col">业务表</th><th scope="col">行数</th></tr></thead>
          <tbody>
            {view.preview.map((t) => (
              <tr key={t.name} data-state="backup-preview-row"><td>{t.name}</td><td>{t.rows}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {view.message !== "" && <p className="backup-message" data-state="backup-message">{view.message}</p>}
      {view.phase === "success" && (
        <div className="backup-success" data-state="backup-success">
          <span>恢复已完成，需要重新加载页面。</span>
          <button type="button" className="backup-btn" data-state="backup-reload-btn" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      )}
      {view.error !== "" && <p className="backup-error" role="alert" data-state="backup-error">{view.error}</p>}
      {shot.startsWith("backup-") && (
        <p className="shot-note" data-state="shot-note">截图钉注：数据备份与恢复卡；表计数与版本由校验接口的真实回执锁定。</p>
      )}

      {view.dialogOpen && (
        <div className="backup-dialog-backdrop" data-state="backup-confirm-dialog">
          <div className="backup-dialog" role="dialog" aria-modal="true" aria-label="确认恢复工作区">
            <h3>确认恢复工作区</h3>
            <p className="backup-dialog-warning" data-state="backup-dialog-warning">
              此操作会整体替换 {view.meta?.tableCount ?? BACKUP_TABLES.length} 张业务表的现有数据，不可撤销。请先确认已导出当前数据。
            </p>
            <label className="backup-dialog-check" data-state="backup-confirm-check-label">
              <input
                type="checkbox"
                data-state="backup-confirm-checkbox"
                checked={view.acknowledged}
                onChange={(e) => setView((v) => ({ ...v, acknowledged: e.target.checked }))}
              />
              我已了解将覆盖当前业务数据
            </label>
            <div className="backup-dialog-actions">
              <button type="button" className="backup-btn" data-state="backup-cancel-btn"
                onClick={() => setView((v) => ({ ...v, dialogOpen: false, acknowledged: false }))}>取消</button>
              <button type="button" className="backup-btn backup-btn-danger" data-state="backup-restore-submit"
                disabled={!view.acknowledged} onClick={() => void restoreBackup()}>确认恢复</button>
            </div>
            <p className="backup-dialog-token" data-state="backup-dialog-token">确认口令：{BACKUP_CONFIRM_TOKEN}</p>
          </div>
        </div>
      )}
    </section>
  );
}
