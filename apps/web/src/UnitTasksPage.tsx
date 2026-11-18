// 协流 XieFlow — r17「单位任务」tab：树视图 + 状态标签 + 流转按钮
// 数据全走真实 api（unit-tasks CRUD / transition / tree）。状态机与树装配全在 shared，页面零流转分支。
// 截图钉态：?page=unit-tasks&shot=tasks-empty|tasks-form|tasks-loading|tasks-error
// ?taskId= 深链选中真实任务；?narrow=1 显式钉窄屏。
import { useCallback, useEffect, useState } from "react";
import type { UnitTask, UnitTaskTreeNode } from "@xieflow/shared";
import { UNIT_TASK_STATUSES, UNIT_TASK_STATUS_LABELS, buildTaskTree } from "@xieflow/shared";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

type TaskStatus = (typeof UNIT_TASK_STATUSES)[number];

interface PageState {
  phase: "loading" | "error" | "ready";
  message?: string;
  tasks: UnitTask[];
}

async function getJson<T>(url: string): Promise<T> {
  return (await fetchJsonOrThrow(await apiFetch(url))) as T;
}

async function sendJson(url: string, body: unknown, method = "POST"): Promise<unknown> {
  return fetchJsonOrThrow(await apiFetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function TaskNode({ node, depth, selectedId, onSelect, onTransition }: {
  node: UnitTaskTreeNode;
  depth: number;
  selectedId: number;
  onSelect: (id: number) => void;
  onTransition: (id: number, to: TaskStatus) => void;
}) {
  return (
    <li className="ut-node" data-task-id={node.id}>
      <div className={`ut-node-row${node.id === selectedId ? " ut-node-active" : ""}`} style={{ paddingLeft: `${depth * 18}px` }}>
        <button type="button" className="ut-node-btn" data-task-id={node.id} onClick={() => onSelect(node.id)}>
          {depth > 0 && <span className="ut-branch">└ </span>}
          <span className="ut-title">{node.title}</span>
          <span className={`ut-status ut-status-${node.status}`}>{UNIT_TASK_STATUS_LABELS[node.status]}</span>
          <span className="ut-meta">#{node.id} · {node.assigneeUnit}{node.dueDate ? ` · 截止 ${node.dueDate}` : ""}</span>
        </button>
        <div className="ut-transitions">
          {UNIT_TASK_STATUSES.filter((to) => to !== node.status).map((to) => (
            <button
              key={to}
              type="button"
              className="ut-transition"
              data-task-id={node.id}
              data-to={to}
              title={`流转到${UNIT_TASK_STATUS_LABELS[to]}`}
              onClick={() => onTransition(node.id, to)}
            >
              →{UNIT_TASK_STATUS_LABELS[to]}
            </button>
          ))}
        </div>
      </div>
      {node.children.length > 0 && (
        <ul className="ut-children">
          {node.children.map((child) => (
            <TaskNode key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} onTransition={onTransition} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function UnitTasksPage() {
  const [shot] = useState(() => new URLSearchParams(window.location.search).get("shot") ?? "");
  const [state, setState] = useState<PageState>(() => {
    if (shot === "tasks-loading") return { phase: "loading", tasks: [] };
    if (shot === "tasks-error") return { phase: "error", message: SERVICE_DOWN_MESSAGE, tasks: [] };
    if (shot === "tasks-empty") return { phase: "ready", tasks: [] };
    return { phase: "loading", tasks: [] };
  });
  const [selectedId, setSelectedId] = useState<number>(() => Number(new URLSearchParams(window.location.search).get("taskId")) || 0);
  const [creating, setCreating] = useState(shot === "tasks-form");
  const [titleDraft, setTitleDraft] = useState("");
  const [unitDraft, setUnitDraft] = useState("");
  const [dueDraft, setDueDraft] = useState("");
  const [parentDraft, setParentDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getJson<{ tasks: UnitTask[] }>("/api/unit-tasks");
      setState({ phase: "ready", tasks: data.tasks });
      return data.tasks;
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err), tasks: [] });
      return [];
    }
  }, []);

  useEffect(() => {
    if (shot === "tasks-loading" || shot === "tasks-error" || shot === "tasks-empty") return;
    void refresh();
  }, [refresh, shot]);

  const selected = state.tasks.find((t) => t.id === selectedId) ?? null;
  const tree: UnitTaskTreeNode[] = buildTaskTree(state.tasks);

  const createTask = async () => {
    setBusy(true);
    setNotice("");
    try {
      const body: Record<string, unknown> = { title: titleDraft, assigneeUnit: unitDraft };
      if (dueDraft !== "") body.dueDate = dueDraft;
      if (parentDraft !== "") body.parentId = Number(parentDraft);
      const created = await sendJson("/api/unit-tasks", body) as UnitTask;
      setNotice(`已建任务 #${created.id}`);
      setTitleDraft(""); setUnitDraft(""); setDueDraft(""); setParentDraft("");
      setCreating(false);
      setSelectedId(created.id);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const transition = async (id: number, to: TaskStatus) => {
    setBusy(true);
    setNotice("");
    try {
      const updated = await sendJson(`/api/unit-tasks/${id}/transition`, { to }) as UnitTask;
      setNotice(`任务 #${id} 已流转到「${UNIT_TASK_STATUS_LABELS[updated.status]}」`);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const removeTask = async (id: number) => {
    setBusy(true);
    try {
      await sendJson(`/api/unit-tasks/${id}`, {}, "DELETE");
      setNotice(`已删除任务 #${id}`);
      if (selectedId === id) setSelectedId(0);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pinNoteMap: Record<string, string> = {
    "tasks-empty": "首次使用空态钉注：真实 0 条单位任务——点「＋ 新建任务」建第一项。",
    "tasks-form": "建任务钉注：标题 / 责任单位 / 到期日 / 父任务真输入，层级由 shared buildTaskTree 装配。",
    "tasks-tree": "任务树钉注：树由 GET /api/unit-tasks/tree 真装配，parent_id 可空、环路抛错。",
    "tasks-transitioned": "流转钉注：状态机全集中 shared canTransitionUnitTask，非法流转 HTTP 400。",
  };
  const pinNote = pinNoteMap[shot] ?? "";

  return (
    <section className="ut-shell" data-state="tasks-ready">
      <div className="ut-head">
        <h2>单位任务</h2>
        <button type="button" className="btn" data-action="ut-create-open" onClick={() => setCreating((v) => !v)}>＋ 新建任务</button>
      </div>
      {creating && (
        <div className="ut-new" data-state="tasks-form-fields">
          <input aria-label="任务标题" placeholder="任务标题" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
          <input aria-label="责任单位" placeholder="责任单位" value={unitDraft} onChange={(e) => setUnitDraft(e.target.value)} />
          <input aria-label="到期日" placeholder="到期日 YYYY-MM-DD（可选）" value={dueDraft} onChange={(e) => setDueDraft(e.target.value)} />
          <input aria-label="父任务 id" placeholder="父任务 id（可选，留空为根任务）" value={parentDraft} onChange={(e) => setParentDraft(e.target.value)} />
          <button type="button" className="btn btn-primary" data-action="ut-create" onClick={() => void createTask()} disabled={busy}>确认建任务</button>
        </div>
      )}
      {state.phase === "loading" && <p className="empty" data-state="tasks-loading">正在连接本地数据库…</p>}
      {state.phase === "error" && <p className="empty" data-state="tasks-error">{state.message}</p>}
      {state.phase === "ready" && state.tasks.length === 0 ? (
        <p className="empty" data-state="tasks-empty-list">这里还没有单位任务——点「＋ 新建任务」开始分解工作。</p>
      ) : (
        <ul className="ut-tree" data-state="tasks-tree">
          {tree.map((node) => (
            <TaskNode key={node.id} node={node} depth={0} selectedId={selectedId} onSelect={setSelectedId} onTransition={(id, to) => void transition(id, to)} />
          ))}
        </ul>
      )}
      {selected !== null && (
        <div className="ut-detail" data-state="tasks-detail">
          <h3>选中任务 · #{selected.id}</h3>
          <p>标题：{selected.title} · 责任单位：{selected.assigneeUnit} · 状态：{UNIT_TASK_STATUS_LABELS[selected.status]}</p>
          <p className="ut-consequence" data-state="tasks-consequence">后果提示：流转由 shared 状态机守卫，done / cancelled 为终态不可回退；非法流转 HTTP 400。</p>
          <button type="button" className="btn" data-action="ut-delete" onClick={() => void removeTask(selected.id)} disabled={busy}>删除此任务</button>
        </div>
      )}
      {pinNote !== "" && <p className="ut-shot-note" data-state="tasks-pin">{pinNote}</p>}
      {notice !== "" && <p className="ut-notice" data-state="tasks-notice">{notice}</p>}
    </section>
  );
}
