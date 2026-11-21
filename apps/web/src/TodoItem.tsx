// 协流 XieFlow — r57 P1-3：待办列表行组件（React.memo 隔离 App 全局搜索输入引发的全树重渲染）
// 渲染契约与 DOM seam 逐字沿用 TodosPage；候选列表只在 panelOpen 分支内计算一次。
import { memo } from "react";
import { TODO_STATUS_TRANSITIONS, type Todo, type TodoStatus } from "@xieflow/shared";

/** r34：被阻塞摘要（来自 GET /api/todos/blocked，web 只渲染不判定） */
export interface BlockedInfo {
  blockedBy: number;
  blockers: number[];
  chain: number[];
}

/** r34：前置列表条目（来自 GET /api/todos/:id/dependencies） */
export interface DepItem {
  todoId: number;
  dependsOnTodoId: number;
  title: string;
  status: TodoStatus | null;
}

const STATUS_LABELS: Record<TodoStatus, string> = {
  open: "进行中",
  done: "已完成",
  archived: "已归档",
};

interface TodoItemProps {
  todo: Todo;
  blocked?: BlockedInfo;
  deps: readonly DepItem[];
  panelOpen: boolean;
  depError: string | null;
  busy: boolean;
  focused: boolean;
  todos: readonly Todo[];
  onTogglePanel: (todo: Todo) => void;
  onTransition: (todo: Todo, to: TodoStatus) => void;
  onAddDep: (todoId: number, dependsOnTodoId: number) => void;
  onRemoveDep: (todoId: number, dependsOnTodoId: number) => void;
}

export default memo(function TodoItem({
  todo: t,
  blocked,
  deps,
  panelOpen,
  depError,
  busy,
  focused,
  todos,
  onTogglePanel,
  onTransition,
  onAddDep,
  onRemoveDep,
}: TodoItemProps) {
  return (
    <li
      key={t.id}
      className={`todo-item status-${t.status}${focused ? " todo-item-located" : ""}`}
      data-todo-id={t.id}
      data-state={focused ? "todo-item-located" : "todo-item"}
    >
      <div className="todo-title">
        {t.title}
        <span className={`status-pill pill-${t.status}`}>{STATUS_LABELS[t.status]}</span>
        {blocked && blocked.blockedBy > 0 && (
          <span className="blocked-pill" data-state="todo-blocked" title={`阻塞链：${blocked.chain.join(" → ")}`}>
            ⛔ 被 {blocked.blockedBy} 项阻塞
          </span>
        )}
        {deps.length > 0 && (!blocked || blocked.blockedBy === 0) && (
          <span className="satisfied-pill" data-state="dep-satisfied">✓ 前置已满足</span>
        )}
      </div>
      <div className="todo-due">
        {t.dueDate ? <>截止 {t.dueDate}</> : <span className="hint">无截止日</span>}
      </div>
      <div className="todo-actions">
        <button
          type="button"
          className="btn btn-small btn-ghost"
          data-action="dep-toggle"
          aria-expanded={panelOpen}
          onClick={() => onTogglePanel(t)}
        >
          前置任务{deps.length > 0 ? `（${deps.length}）` : ""}
        </button>
        {TODO_STATUS_TRANSITIONS[t.status].map((to) => (
          <button
            key={to}
            type="button"
            className={`btn btn-small ${to === "archived" ? "btn-ghost" : "btn-secondary"}`}
            disabled={busy}
            onClick={() => onTransition(t, to)}
          >
            {to === "done" ? "完成" : to === "open" ? "重开" : "归档"}
          </button>
        ))}
      </div>
      {panelOpen && (
        <div className="dep-panel" data-state="dep-panel" data-todo-id={t.id}>
          <div className="dep-panel-head">前置任务 · {t.title}</div>
          {depError !== null && (
            <p className="error-message dep-cycle-error" data-state="dep-cycle-error" role="alert">{depError}</p>
          )}
          {deps.length === 0 ? (
            <p className="empty" data-state="dep-empty">还没有前置任务——从下方选择一项待办，设为完成后才能开始。</p>
          ) : (
            <ul className="dep-list">
              {deps.map((d) => (
                <li key={d.dependsOnTodoId} data-state="dep-prereq" data-dep-id={d.dependsOnTodoId}>
                  <span>{d.title}</span>
                  <span className={`status-pill pill-${d.status ?? "open"}`}>{d.status === "done" ? "已完成" : d.status === "archived" ? "已归档" : "进行中"}</span>
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    data-action="dep-remove"
                    data-dep-id={d.dependsOnTodoId}
                    onClick={() => onRemoveDep(t.id, d.dependsOnTodoId)}
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(() => {
            const candidates = todos.filter(
              (x) => x.id !== t.id && !deps.some((d) => d.dependsOnTodoId === x.id),
            );
            return candidates.length > 0 ? (
              <div className="dep-candidates" data-state="dep-candidates">
                <span className="field-label">添加前置：</span>
                {candidates.map((cand) => (
                  <button
                    key={cand.id}
                    type="button"
                    className="btn btn-small btn-secondary dep-candidate"
                    data-action="dep-add"
                    data-dep-id={cand.id}
                    onClick={() => onAddDep(t.id, cand.id)}
                  >
                    ＋ {cand.title}
                  </button>
                ))}
              </div>
            ) : null;
          })()}
        </div>
      )}
    </li>
  );
});
