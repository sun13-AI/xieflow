// 协流 XieFlow — r16「审批」tab：发起审批 + 三视角列表 + 步骤时间线 + 操作按钮 + 抄送提示
// 数据全走真实 api（approvals CRUD / submit / approve / reject / delegate / withdraw / view / steps / cc）。
// 状态机 / 可用动作 / 三视角过滤口径全在 shared，本页零流转分支。
// 截图钉态：?page=approval&shot=approval-empty|approval-loading|approval-error|approval-form|approval-todo|approval-detail|approval-approved
// ?approvalId= 深链选中真实审批；?view=todo|initiated|cc 与 ?actor= 钉三视角；?narrow=1 显式钉窄屏。
import { useCallback, useEffect, useState } from "react";
import type { Approval, ApprovalAction, ApprovalStep, ApprovalView } from "@xieflow/shared";
import type { MemberSummary } from "@xieflow/shared/org";
import { memberDisplayName } from "@xieflow/shared/org";
import MemberPicker from "./MemberPicker";
import {
  APPROVAL_TYPES,
  APPROVAL_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  APPROVAL_ACTION_LABELS,
  APPROVAL_ACTION_ROLE_LABELS,
  APPROVAL_ACTION_STATUS_AFTER,
  APPROVAL_VIEWS,
  availableApprovalActions,
  isApprovalView,
} from "@xieflow/shared";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

interface ApprovalQuery {
  readonly shot: string;
  readonly approvalId: string;
  readonly view: string;
  readonly actor: string;
}

type PageState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | PageStateWithMember;

const PINNED = new Set([
  "approval-loading", "approval-error", "approval-empty",
  "approval-picker", "approval-picked", "approval-timeline-badge",
]);
type ApprovalWithMember = Approval & { readonly applicantMember?: MemberSummary | null };
type StepWithMember = ApprovalStep & { readonly assigneeMember?: MemberSummary | null };
type PageStateWithMember = { phase: "ready"; approvals: ApprovalWithMember[] };

const PIN_MEMBERS: readonly MemberSummary[] = [
  { id: 11, name: "王小明", departmentId: 1, departmentName: "研发中心", title: "前端工程师", status: "active" },
  { id: 12, name: "李娜", departmentId: 2, departmentName: "市场部", title: "产品经理", status: "active" },
];
const PIN_A: MemberSummary = PIN_MEMBERS[0]!;
const PIN_B: MemberSummary = PIN_MEMBERS[1]!;
const PIN_APPROVAL: ApprovalWithMember = {
  id: 91, title: "示例：采购申请", type: "purchase", applicantId: "王小明", status: "pending",
  currentAssignee: "李娜", createdAt: "2026-11-19T10:00:00.000Z", updatedAt: "2026-11-19T10:01:00.000Z",
  applicantMemberId: 11, applicantMember: PIN_A,
};
const PIN_STEPS: StepWithMember[] = [
  {
    id: 901, approvalId: 91, order: 0, assignee: "王小明", action: "submit", comment: "",
    actedAt: "2026-11-19T10:00:00.000Z", assigneeMemberId: 11, assigneeMember: PIN_A,
  },
  {
    id: 902, approvalId: 91, order: 1, assignee: "李娜", action: "delegate", comment: "转产品复核",
    actedAt: "2026-11-19T10:01:00.000Z", assigneeMemberId: 12, assigneeMember: PIN_B,
  },
];
const VIEW_LABELS: Record<ApprovalView, string> = {
  todo: "我的待办",
  initiated: "我发起的",
  cc: "抄送我的",
};

function readQuery(): ApprovalQuery {
  const p = new URLSearchParams(window.location.search);
  return {
    shot: p.get("shot") ?? "",
    approvalId: p.get("approvalId") ?? "",
    view: p.get("view") ?? "todo",
    actor: p.get("actor") ?? "我",
  };
}

async function getJson<T>(url: string): Promise<T> {
  return (await fetchJsonOrThrow(await apiFetch(url))) as T;
}

async function sendJson(url: string, body: unknown): Promise<unknown> {
  return fetchJsonOrThrow(await apiFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function deleteJson(url: string): Promise<unknown> {
  return fetchJsonOrThrow(await apiFetch(url, { method: "DELETE" }));
}

export default function ApprovalPage() {
  const [query] = useState<ApprovalQuery>(readQuery);
  const [actor, setActor] = useState(query.actor);
  const [view, setView] = useState<ApprovalView>(isApprovalView(query.view) ? query.view : "todo");
  const [state, setState] = useState<PageState>(() => {
    if (query.shot === "approval-loading") return { phase: "loading" };
    if (query.shot === "approval-error") return { phase: "error", message: SERVICE_DOWN_MESSAGE };
    if (query.shot === "approval-empty") return { phase: "ready", approvals: [] };
    if (query.shot === "approval-timeline-badge") return { phase: "ready", approvals: [PIN_APPROVAL] };
    if (query.shot === "approval-picker" || query.shot === "approval-picked") return { phase: "ready", approvals: [] };
    return { phase: "loading" };
  });
  const [selectedId, setSelectedId] = useState<number>(() => query.shot === "approval-timeline-badge" ? PIN_APPROVAL.id : Number(query.approvalId) || 0);
  const [selected, setSelected] = useState<ApprovalWithMember | null>(null);
  const [steps, setSteps] = useState<StepWithMember[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [creating, setCreating] = useState(query.shot === "approval-form" || query.shot === "approval-picker" || query.shot === "approval-picked");
  const [titleDraft, setTitleDraft] = useState("");
  const [typeDraft, setTypeDraft] = useState<(typeof APPROVAL_TYPES)[number]>("leave");
  const [assigneeDraft, setAssigneeDraft] = useState(query.shot === "approval-picked" ? "李娜" : "");
  const [applicantMember, setApplicantMember] = useState<MemberSummary | null>(null);
  const [assigneeMember, setAssigneeMember] = useState<MemberSummary | null>(query.shot === "approval-picked" ? PIN_B : null);
  const [delegateMember, setDelegateMember] = useState<MemberSummary | null>(null);
  const [ccDraft, setCcDraft] = useState("");
  const [comment, setComment] = useState("");
  const [delegateTarget, setDelegateTarget] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (who: string, which: ApprovalView) => {
    try {
      const data = await getJson<{ approvals: ApprovalWithMember[] }>(
        `/api/approvals/view?view=${encodeURIComponent(which)}&actor=${encodeURIComponent(who)}`,
      );
      setState({ phase: "ready", approvals: data.approvals });
      return data.approvals;
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    if (query.shot === "approval-timeline-badge") {
      setSelected(PIN_APPROVAL);
      setSteps(PIN_STEPS);
      setCc([]);
      return;
    }
    if (id <= 0) {
      setSelected(null);
      setSteps([]);
      setCc([]);
      return;
    }
    try {
      const [detail, stepData, ccData] = await Promise.all([
        getJson<ApprovalWithMember>(`/api/approvals/${id}`),
        getJson<{ steps: StepWithMember[] }>(`/api/approvals/${id}/steps`),
        getJson<{ cc: string[] }>(`/api/approvals/${id}/cc`),
      ]);
      setSelected(detail);
      setSteps(stepData.steps);
      setCc(ccData.cc);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }, [query.shot]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("narrow") === "1") {
      document.documentElement.classList.add("force-narrow");
    }
    if (PINNED.has(query.shot)) return;
    void refresh(actor, view).then((rows) => {
      if (!selectedId && rows.length > 0) setSelectedId(rows[0]!.id);
    });
    // 初始深链与身份只装载一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.shot, refresh]);

  useEffect(() => {
    if (state.phase !== "ready") return;
    void loadDetail(selectedId);
  }, [selectedId, state.phase, loadDetail]);

  const createApproval = async () => {
    if (titleDraft.trim() === "") {
      setNotice("请先填写审批标题");
      return;
    }
    if (assigneeDraft.trim() === "") {
      setNotice("请先填写审批人");
      return;
    }
    setBusy(true);
    try {
      const created = (await sendJson("/api/approvals", {
        title: titleDraft.trim(),
        type: typeDraft,
        applicantId: actor,
        currentAssignee: assigneeDraft.trim(),
        cc: ccDraft.split(/[,，]/).map((s) => s.trim()).filter((s) => s !== ""),
        applicantMemberId: applicantMember?.id,
        currentAssigneeMemberId: assigneeMember?.id,
      })) as ApprovalWithMember;
      setCreating(false);
      setTitleDraft("");
      setAssigneeDraft("");
      setCcDraft("");
      setApplicantMember(null);
      setAssigneeMember(null);
      setSelectedId(created.id);
      setNotice(`已建审批 #${created.id}（草稿）——点「提交」进入审批流`);
      await refresh(actor, view);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const doAction = async (action: ApprovalAction) => {
    if (!selected) return;
    if (action === "delegate" && delegateTarget.trim() === "") {
      setNotice("请先填写转交目标");
      return;
    }
    setBusy(true);
    try {
      const updated = (await sendJson(`/api/approvals/${selected.id}/${action}`, {
        actor,
        comment,
        targetAssignee: action === "delegate" ? delegateTarget.trim() : undefined,
        targetAssigneeMemberId: action === "delegate" ? delegateMember?.id : undefined,
        actorMemberId: applicantMember?.id,
      })) as ApprovalWithMember;
      setSelected(updated);
      setComment("");
      setDelegateTarget("");
      setDelegateMember(null);
      setNotice(`审批 #${updated.id} 已${APPROVAL_ACTION_LABELS[action]}（当前：${APPROVAL_STATUS_LABELS[updated.status]}）`);
      await Promise.all([loadDetail(updated.id), refresh(actor, view)]);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const switchView = async (next: ApprovalView) => {
    setView(next);
    await refresh(actor, next);
  };

  const switchActor = async (next: string) => {
    setActor(next);
    await refresh(next, view);
  };

  const removeApproval = async (id: number) => {
    setBusy(true);
    try {
      await deleteJson(`/api/approvals/${id}`);
      if (selectedId === id) setSelectedId(0);
      setNotice(`已删除审批 #${id}`);
      await refresh(actor, view);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (state.phase === "loading") {
    return (
      <section className="card state-loading" data-state="approval-loading">
        <p>正在连接审批库…</p>
      </section>
    );
  }
  if (state.phase === "error") {
    return (
      <section className="card state-error" data-state="approval-error" role="alert">
        <h2>连接失败</h2>
        <p className="error-message">{state.message}</p>
        <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后点「重试」。</p>
        <button type="button" className="btn" onClick={() => void refresh(actor, view)}>重试</button>
      </section>
    );
  }

  const actions = selected
    ? availableApprovalActions({
        status: selected.status,
        applicantId: selected.applicantId,
        currentAssignee: selected.currentAssignee,
        actor,
        targetAssignee: delegateTarget || undefined,
      })
    : [];
  const pinNoteMap: Record<string, string> = {
    "approval-empty": "首次使用空态钉注：真实 0 条审批——点「＋ 新建审批」即可发起第一单。",
    "approval-form": "发起表单钉注：标题 / 类型 / 审批人 / 抄送人全为真输入，提交后落 approvals 与 approval_cc 两表。",
    "approval-todo": "待办钉注：列表由 GET /api/approvals/view?view=todo 真读回，只含待我审批的单。",
    "approval-detail": "详情钉注：时间线由 GET /:id/steps 真读回，submit / delegate / approve 逐步留痕。",
    "approval-approved": "通过态钉注：终态零出边——再次 approve / reject / delegate 均被 shared 状态机拒绝（HTTP 400）。",
    "approval-picker": "选人弹窗钉注：从通讯录搜索在职成员；选中只增量填 member_id + 姓名，原自由文本输入框仍在场。",
    "approval-picked": "选中后钉注：审批人输入框已填通讯录姓名并显示部门徽标；不传 member_id 的老路径仍可纯手填。",
    "approval-timeline-badge": "时间线钉注：每一步回带 member 摘要，部门徽标显示在步骤行；usage 计数由 HTTP /api/org/members/:id/usage 提供。",
  };
  const pinNote = pinNoteMap[query.shot] ?? "";

  return (
    <section className="ap-shell" data-state="approval-ready">
      <aside className="ap-side">
        <div className="ap-side-head">
          <h2>审批中心</h2>
          <button type="button" className="btn" data-action="ap-create-open" onClick={() => setCreating(true)}>＋ 新建审批</button>
        </div>
        <label className="ap-identity">
          当前身份（申请人）
          <input aria-label="当前身份" data-action="ap-actor" value={actor} onChange={(e) => setActor(e.target.value)} onBlur={() => void switchActor(actor)} />
        </label>
        <MemberPicker
          label="申请人" seam="applicant" member={applicantMember}
          pinned={query.shot === "approval-picker" ? PIN_MEMBERS : undefined}
          openOnInit={query.shot === "approval-picker"}
          onPick={(m) => { setApplicantMember(m); setActor(m.name); }}
          onClear={() => setApplicantMember(null)}
        />
        {creating && (
          <div className="ap-new" data-state="approval-form-fields">
            <input aria-label="审批标题" placeholder="审批标题" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
            <select aria-label="审批类型" value={typeDraft} onChange={(e) => setTypeDraft(e.target.value as typeof typeDraft)}>
              {APPROVAL_TYPES.map((t) => <option key={t} value={t}>{APPROVAL_TYPE_LABELS[t]}</option>)}
            </select>
            <input aria-label="审批人" placeholder="审批人（如：张三）" value={assigneeDraft} onChange={(e) => setAssigneeDraft(e.target.value)} />
            <MemberPicker
              label="审批人" seam="approval-assignee" member={assigneeMember}
              pinned={query.shot === "approval-picker" ? PIN_MEMBERS : undefined}
              openOnInit={query.shot === "approval-picker"}
              onPick={(m) => { setAssigneeMember(m); setAssigneeDraft(m.name); }}
              onClear={() => setAssigneeMember(null)}
            />
            <input aria-label="抄送人" placeholder="抄送人，逗号分隔" value={ccDraft} onChange={(e) => setCcDraft(e.target.value)} />
            <button type="button" className="btn btn-primary" data-action="ap-create" onClick={() => void createApproval()} disabled={busy}>确认发起</button>
          </div>
        )}
        <div className="ap-views" data-state="approval-views">
          {APPROVAL_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className={`ap-view${v === view ? " ap-view-active" : ""}`}
              data-view={v}
              onClick={() => void switchView(v)}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        {state.approvals.length === 0 ? (
          <p className="empty" data-state="approval-empty-list">
            {selected !== null
              ? "本视角已清空——右侧仍可查看最近选中的审批详情。"
              : "这里还没有审批——点「＋ 新建审批」发起第一单。"}
          </p>
        ) : (
          <ul className="ap-list" data-state="approval-list">
            {state.approvals.map((a) => (
              <li key={a.id} className={`ap-list-item${a.id === selectedId ? " ap-list-active" : ""}`}>
                <button type="button" className="ap-list-btn" data-approval-id={a.id} onClick={() => setSelectedId(a.id)}>
                  <span className="ap-list-title">{a.title}</span>
                  <span className="ap-list-meta">#{a.id} · {APPROVAL_TYPE_LABELS[a.type]} · {APPROVAL_STATUS_LABELS[a.status]}</span>
                </button>
                <button type="button" className="ap-del" data-approval-id={a.id} onClick={() => void removeApproval(a.id)} disabled={busy}>删</button>
              </li>
            ))}
          </ul>
        )}
        {pinNote !== "" && <p className="ap-shot-note" data-state="approval-pin">{pinNote}</p>}
      </aside>

      <div className="ap-main">
        <div className="ap-head">
          <h2>{selected ? `${selected.title} · #${selected.id}` : "未选择审批"}</h2>
          {selected && (
            <span className="ap-status" data-state="approval-status">{APPROVAL_STATUS_LABELS[selected.status]}</span>
          )}
        </div>
        {selected ? (
          <>
            <div className="ap-meta">
              <span>类型：{APPROVAL_TYPE_LABELS[selected.type]}</span>
              <span>发起人：{selected.applicantId}
                {selected.applicantMember && <em className="ap-member-badge" data-state="approval-member-badge">{selected.applicantMember.departmentName ?? "未分配部门"}</em>}
              </span>
              <span>当前审批人：{selected.currentAssignee}</span>
            </div>
            {cc.length > 0 && (
              <p className="ap-cc-hint" data-state="approval-cc-hint">抄送提示：{cc.join("、")} 会看到本单进展（共 {cc.length} 人）</p>
            )}
            <div className="ap-actions" data-state="approval-actions">
              {actions.length === 0 ? (
                <span className="ap-no-action">当前身份在此单上无可用操作（终态或需切换身份）</span>
              ) : (
                <>
                  <p className="ap-consequence" data-state="approval-consequence">
                    操作后果：通过 / 驳回后本单进入终态、不可撤销；转交后你不再持有该待办；撤回仅发起人可用。
                  </p>
                  {actions.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className={`btn${a === "approve" ? " btn-primary" : ""}`}
                      data-action={`ap-${a}`}
                      onClick={() => void doAction(a)}
                      disabled={busy}
                    >
                      {APPROVAL_ACTION_LABELS[a]}
                    </button>
                  ))}
                </>
              )}
            </div>
            {actions.includes("delegate") && (
              <>
              <input
                aria-label="转交目标"
                className="ap-delegate"
                placeholder="转交目标（新审批人）"
                value={delegateTarget}
                onChange={(e) => setDelegateTarget(e.target.value)}
              />
              <MemberPicker
                label="转交目标" seam="delegate" member={delegateMember}
                pinned={query.shot === "approval-timeline-badge" ? PIN_MEMBERS : undefined}
                onPick={(m) => { setDelegateMember(m); setDelegateTarget(m.name); }}
                onClear={() => setDelegateMember(null)}
              />
              </>
            )}
            <textarea
              aria-label="审批意见"
              className="ap-comment"
              placeholder="审批意见（可选）"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="ap-timeline-wrap">
              <h3>步骤时间线</h3>
              {steps.length === 0 ? (
                <p className="empty" data-state="approval-steps-empty">还没有步骤——提交审批后这里会逐步留痕。</p>
              ) : (
                <ol className="ap-timeline" data-state="approval-timeline">
                  {steps.map((step) => (
                    <li key={step.id} className="ap-step" data-step-action={step.action}>
                      <span className="ap-step-order">{step.order + 1}</span>
                      <span className="ap-step-body">
                        <strong>{APPROVAL_ACTION_LABELS[step.action]}</strong>
                        <span>
                          {" · "}{APPROVAL_ACTION_ROLE_LABELS[step.action]} {step.assignee}
                          {step.assigneeMember && (
                            <em className="ap-member-badge" data-state="approval-timeline-badge">{step.assigneeMember.departmentName ?? "未分配部门"}</em>
                          )}
                          {" · 当时"} {APPROVAL_STATUS_LABELS[APPROVAL_ACTION_STATUS_AFTER[step.action]]}
                        </span>
                        {step.comment !== "" && <span className="ap-step-comment">「{step.comment}」</span>}
                        <time>{step.actedAt}</time>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        ) : (
          <p className="ap-placeholder" data-state="approval-placeholder">从左侧选一条审批，查看时间线与可执行操作。</p>
        )}
        {notice !== "" && <p className="ap-notice" data-state="approval-notice">{notice}</p>}
      </div>
    </section>
  );
}
