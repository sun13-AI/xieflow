// 协流 XieFlow — r4 项目页：项目列表 + 新建项目弹窗 → 进入看板
// 数据契约全部来自 @xieflow/shared（名称守卫 assertValidBoardName 与 api 同源）。
// 截图钉态：?page=projects&shot=project-* 让 headless 确定性捕获（真实状态都存在）。
import { useCallback, useEffect, useMemo, useState } from "react";
import { MAX_BOARD_NAME, type Project } from "@xieflow/shared";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

interface ProjectsLoadState {
  phase: "loading" | "error" | "ready";
  message?: string;
  projects?: Project[];
}

/** 钉态种子：三个项目（空态/有数据两形态共用数据源） */
function pinSeedProjects(now: Date): Project[] {
  const iso = now.toISOString();
  return [
    { id: 1, name: "新家装修", description: "装修全流程跟踪：量房 → 设计 → 施工 → 验收", createdAt: iso, updatedAt: iso },
    { id: 2, name: "Q4 产品发布", description: "版本规划、开发、测试与上线", createdAt: iso, updatedAt: iso },
    { id: 3, name: "个人成长计划", description: null, createdAt: iso, updatedAt: iso },
  ];
}

export default function ProjectsPage({ onOpenBoard }: { onOpenBoard?: () => void }) {
  const [state, setState] = useState<ProjectsLoadState>({ phase: "loading" });
  const shot = useMemo(() => new URLSearchParams(window.location.search).get("shot"), []);
  const [modalOpen, setModalOpen] = useState(() => shot === "project-modal");
  const [draft, setDraft] = useState<{ name: string; description: string }>({ name: "", description: "" });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await apiFetch("/api/projects");
      const data = (await fetchJsonOrThrow(res)) as { projects: Project[] };
      setState({ phase: "ready", projects: data.projects });
    } catch (err: unknown) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    if (shot === "project-empty") {
      setState({ phase: "ready", projects: [] });
      return;
    }
    if (shot === "project-loading") {
      setState({ phase: "loading" });
      return;
    }
    if (shot === "project-error") {
      setState({ phase: "error", message: SERVICE_DOWN_MESSAGE + "（截图钉态：真实场景为 api 停机时 vite 代理 5xx）" });
      return;
    }
    if (shot === "project-empty" || shot === "project-data" || shot === "project-modal") {
      // project-empty 已在上方处理；data/modal 钉种子数据
      setState({ phase: "ready", projects: pinSeedProjects(new Date()) });
      return;
    }
    void load();
  }, [shot, load]);

  const projects = state.phase === "ready" ? (state.projects ?? []) : [];

  const submitDraft = async (): Promise<void> => {
    setSubmitError(null);
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          description: draft.description === "" ? null : draft.description,
        }),
      });
      const data = (await fetchJsonOrThrow(res)) as { error?: string } | null;
      if (res.status !== 201) {
        setSubmitError(data?.error ?? "新建失败，请稍后重试");
        return;
      }
      setModalOpen(false);
      setDraft({ name: "", description: "" });
      await load();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    }
  };

  if (state.phase === "loading") {
    return (
      <section className="card state-loading" data-state="project-loading">
        <p>正在加载项目…</p>
      </section>
    );
  }

  if (state.phase === "error") {
    return (
      <section className="card state-error" data-state="project-error" role="alert">
        <h2>加载失败</h2>
        <p className="error-message">{state.message}</p>
        <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后刷新本页。</p>
      </section>
    );
  }

  return (
    <div className="projects-page" data-state="project-ready">
      <div className="toolbar project-toolbar">
        <span className="hint">项目是看板的容器——每个项目有独立的列与卡片。</span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setDraft({ name: "", description: "" });
            setSubmitError(null);
            setModalOpen(true);
          }}
        >
          ＋ 新建项目
        </button>
      </div>

      {projects.length === 0 ? (
        <section className="card" data-state="project-empty">
          <p className="empty">还没有任何项目——点「新建项目」创建第一个，新建项目会自动带上「待办 / 进行中 / 已完成」三列看板。</p>
        </section>
      ) : (
        <div className="project-grid" data-state="project-list">
          {projects.map((p) => (
            <section key={p.id} className="card project-card" data-project-id={p.id}>
              <h3 className="project-name">{p.name}</h3>
              {p.description ? (
                <p className="project-desc">{p.description}</p>
              ) : (
                <p className="project-desc hint">无描述</p>
              )}
              <div className="project-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    if (onOpenBoard) onOpenBoard();
                  }}
                >
                  打开看板
                </button>
              </div>
            </section>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" data-state="project-modal">
          <div className="modal-card" role="dialog" aria-label="新建项目">
            <h2>新建项目</h2>
            <label className="field">
              <span className="field-label">
                名称（必填，最多 {MAX_BOARD_NAME} 字，当前 {draft.name.length}）
              </span>
              <input
                type="text"
                value={draft.name}
                maxLength={MAX_BOARD_NAME}
                placeholder="例：新家装修"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">描述（可选）</span>
              <input
                type="text"
                value={draft.description}
                maxLength={MAX_BOARD_NAME}
                placeholder="例：装修全流程跟踪"
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
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

      <p className="hint seam-note">
        看板规则：新建项目自动带上「待办 / 进行中 / 已完成」三列；卡片可跨列移动，列内顺序自动重排。
      </p>
    </div>
  );
}
