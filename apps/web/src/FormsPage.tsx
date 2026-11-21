// 协流 XieFlow — r41「表单」tab：无代码表单（创建 / 填写 / 汇总）
// 归一 / 校验 / 汇总全部消费 shared/forms 与 api 回传结果；本页零算法分支。
// 明确边界：本地 / 登录用户填写，不接外部表单服务或匿名公网，零 token。
// 截图钉态：?page=forms&shot=forms-empty|forms-create|forms-questions|forms-fill|forms-submitted|forms-summary|forms-error
// ?narrow=1 钉窄屏；?formId=&view=fill|summary 深链 reload 不丢。
import { useEffect, useState, type ReactElement } from "react";
import { FORM_TYPE_LABELS, formSummaryLine, type FormQuestion, type FormWithQuestions, type FormQuestionSummary } from "@xieflow/shared/forms";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

const PINNED = new Set([
  "forms-empty", "forms-create", "forms-questions", "forms-fill", "forms-submitted", "forms-summary", "forms-error",
]);

interface QuestionDraft {
  type: "text" | "number" | "select" | "checkbox";
  label: string;
  required: boolean;
  options: string;
}

interface SummaryData { formId: number; title: string; total: number; questions: readonly FormQuestionSummary[] }
type View = "list" | "create" | "fill" | "summary";

const SHOT_QUESTIONS: FormQuestion[] = [
  { id: 11, formId: 1, type: "text", label: "姓名", required: true, options: [], position: 0 },
  { id: 12, formId: 1, type: "number", label: "评分（1-100）", required: true, options: [], position: 1 },
  { id: 13, formId: 1, type: "select", label: "所属部门", required: true, options: ["研发", "产品"], position: 2 },
  { id: 14, formId: 1, type: "checkbox", label: "是否参加复盘会", required: true, options: [], position: 3 },
];
const SHOT_FORMS: FormWithQuestions[] = [{
  id: 1,
  title: "Q4 团队反馈",
  description: "匿名收集，仅统计不记名",
  createdAt: "2026-11-21T00:00:00.000Z",
  closedAt: null,
  questions: SHOT_QUESTIONS,
}];
const SHOT_SUMMARY: SummaryData = {
  formId: 1,
  title: "Q4 团队反馈",
  total: 3,
  questions: [
    { questionId: 11, label: "姓名", type: "text", answered: 3, skipped: 0, values: ["张三", "李四", "王五"] },
    { questionId: 12, label: "评分（1-100）", type: "number", answered: 3, skipped: 0, count: 3, sum: 60, avg: 20, min: 10, max: 30 },
    { questionId: 13, label: "所属部门", type: "select", answered: 3, skipped: 0, distribution: [{ option: "研发", count: 2, rate: 0.67 }, { option: "产品", count: 1, rate: 0.33 }] },
    { questionId: 14, label: "是否参加复盘会", type: "checkbox", answered: 3, skipped: 0, checked: 2, rate: 0.67 },
  ],
};

function readQuery(): { shot: string; formId: string; view: string } {
  const p = new URLSearchParams(window.location.search);
  return { shot: p.get("shot") ?? "", formId: p.get("formId") ?? "", view: p.get("view") ?? "" };
}

async function getJson<T>(url: string): Promise<T> {
  return (await fetchJsonOrThrow(await apiFetch(url))) as T;
}

async function sendJson<T>(method: string, url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await fetchJsonOrThrow(res)) as T;
}

function syncUrl(formId: number | null, view: View): void {
  const url = new URL(window.location.href);
  url.searchParams.set("page", "forms");
  if (formId !== null) url.searchParams.set("formId", String(formId));
  else url.searchParams.delete("formId");
  url.searchParams.set("view", view);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function emptyDraft(): { title: string; description: string; questions: QuestionDraft[] } {
  return {
    title: "",
    description: "",
    questions: [{ type: "text", label: "", required: true, options: "" }],
  };
}

function pinnedQuestionsDraft(): { title: string; description: string; questions: QuestionDraft[] } {
  return {
    title: "Q4 团队反馈",
    description: "季度收集",
    questions: [
      { type: "text", label: "姓名", required: true, options: "" },
      { type: "number", label: "评分（1-100）", required: true, options: "" },
      { type: "select", label: "所属部门", required: true, options: "研发,产品" },
      { type: "checkbox", label: "是否参加复盘会", required: false, options: "" },
    ],
  };
}

export default function FormsPage(): ReactElement {
  const query = readQuery();
  const pinned = PINNED.has(query.shot);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">(
    query.shot === "forms-error" ? "error" : pinned ? "ready" : "loading",
  );
  const [view, setView] = useState<View>(
    query.shot === "forms-create" || query.shot === "forms-questions" ? "create"
      : query.shot === "forms-fill" || query.shot === "forms-submitted" ? "fill"
        : query.shot === "forms-summary" ? "summary" : "list",
  );
  const [forms, setForms] = useState<readonly FormWithQuestions[]>(
    pinned && query.shot !== "forms-empty" ? SHOT_FORMS : [],
  );
  const [selected, setSelected] = useState<FormWithQuestions | null>(
    pinned && query.shot !== "forms-empty" ? SHOT_FORMS[0]! : null,
  );
  const [summary, setSummary] = useState<SummaryData | null>(query.shot === "forms-summary" ? SHOT_SUMMARY : null);
  const [draft, setDraft] = useState(query.shot === "forms-questions" ? pinnedQuestionsDraft() : emptyDraft());
  const [answers, setAnswers] = useState<Record<string, string | boolean>>(
    query.shot === "forms-fill" || query.shot === "forms-submitted"
      ? { "11": "张三", "12": "20", "13": "研发", "14": true }
      : {},
  );
  const [submitted, setSubmitted] = useState(query.shot === "forms-submitted");
  const [message, setMessage] = useState(query.shot === "forms-submitted" ? "答卷已提交，感谢填写。" : "");
  const [error, setError] = useState(query.shot === "forms-error" ? SERVICE_DOWN_MESSAGE : "");

  async function load(): Promise<void> {
    if (pinned) return;
    setPhase("loading");
    setError("");
    try {
      const data = await getJson<{ forms: FormWithQuestions[] }>("/api/forms");
      setForms(data.forms);
      const deepId = query.formId === "" ? null : Number(query.formId);
      const target = deepId === null ? null : data.forms.find((f) => f.id === deepId) ?? null;
      setSelected(target);
      if (target && (query.view === "fill" || query.view === "summary")) {
        setView(query.view);
        if (query.view === "summary") {
          setSummary(await getJson<SummaryData>(`/api/forms/${target.id}/summary`));
        }
      } else {
        setView("list");
      }
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updateDraftQuestion(index: number, patch: Partial<QuestionDraft>): void {
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) => i === index ? { ...q, ...patch } : q),
    }));
  }

  async function createForm(): Promise<void> {
    setError("");
    try {
      const created = await sendJson<FormWithQuestions>("POST", "/api/forms", {
        title: draft.title,
        description: draft.description,
        questions: draft.questions.map((q, i) => ({
          type: q.type,
          label: q.label,
          required: q.required,
          options: q.type === "select" ? q.options.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean) : [],
          position: i,
        })),
      });
      setForms((prev) => [...prev, created]);
      setSelected(created);
      setDraft(emptyDraft());
      setView("list");
      syncUrl(created.id, "list");
      setMessage(`表单「${created.title}」已创建，可开始填写。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function submitAnswers(): Promise<void> {
    if (!selected) return;
    setError("");
    try {
      await sendJson("POST", `/api/forms/${selected.id}/responses`, answers);
      setSubmitted(true);
      setMessage("答卷已提交，感谢填写。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function openSummary(form: FormWithQuestions): Promise<void> {
    setError("");
    try {
      const data = await getJson<SummaryData>(`/api/forms/${form.id}/summary`);
      setSummary(data);
      setSelected(form);
      setView("summary");
      syncUrl(form.id, "summary");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function openFill(form: FormWithQuestions): void {
    setSelected(form);
    setAnswers({});
    setSubmitted(false);
    setView("fill");
    syncUrl(form.id, "fill");
  }

  function openCreate(): void {
    setDraft(emptyDraft());
    setView("create");
    syncUrl(null, "create");
  }

  async function toggleClosed(form: FormWithQuestions): Promise<void> {
    setError("");
    try {
      await sendJson("PATCH", `/api/forms/${form.id}`, { closedAt: form.closedAt === null ? new Date().toISOString() : null });
      await load();
      setMessage(form.closedAt === null ? "表单已关闭，不再接收新答卷。" : "表单已重新开放。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeForm(form: FormWithQuestions): Promise<void> {
    if (!window.confirm(`确认删除表单「${form.title}」及其全部答卷？此操作不可撤销。`)) return;
    setError("");
    try {
      await sendJson("DELETE", `/api/forms/${form.id}`, {});
      setSelected(null);
      setSummary(null);
      setView("list");
      syncUrl(null, "list");
      await load();
      setMessage("表单已删除。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="card forms-page" data-state="forms-page">
      <header className="forms-head">
        <div>
          <h2>表单收集</h2>
          <p className="muted">创建表单、分享填写、汇总每一份回答。本地与登录用户可用，零外部依赖。</p>
        </div>
        <button type="button" className="btn" data-state="forms-new" onClick={openCreate}>＋ 新建表单</button>
      </header>

      {message && <p className="forms-success" data-state="forms-submitted" role="status">{message}</p>}
      {error !== "" && <p className="error" data-state="forms-error" role="alert">{error}</p>}
      {phase === "loading" && <p className="muted" data-state="forms-loading">正在加载表单…</p>}

      {phase !== "error" && view === "list" && (
        <div data-state="forms-list">
          {forms.length === 0 ? (
            <div className="forms-empty" data-state="forms-empty">
              <p>还没有表单。点「＋ 新建表单」创建第一张，加问题后就能开始收集回答。</p>
            </div>
          ) : (
            <ul className="forms-list">
              {forms.map((form) => (
                <li key={form.id} className="forms-item">
                  <div>
                    <strong>{form.title}</strong>
                    <span className="muted"> · {form.questions.length} 道题 · {form.closedAt === null ? "收集中" : "已关闭"}</span>
                    {form.description && <p className="muted">{form.description}</p>}
                  </div>
                  <div className="forms-actions">
                    <button type="button" className="btn" data-state="forms-open-fill" onClick={() => openFill(form)}>填写</button>
                    <button type="button" className="btn" data-state="forms-open-summary" onClick={() => void openSummary(form)}>汇总</button>
                    <button type="button" className="btn" data-state="forms-toggle-closed" onClick={() => void toggleClosed(form)}>{form.closedAt === null ? "关闭" : "重开"}</button>
                    <button type="button" className="btn btn-danger" data-state="forms-delete" onClick={() => void removeForm(form)}>删除</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {phase !== "error" && view === "create" && (
        <div className="forms-create" data-state="forms-create">
          <h3>新建表单</h3>
          <label className="forms-field">
            表单标题
            <input data-state="forms-title" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="例：季度满意度调查" />
          </label>
          <label className="forms-field">
            说明（可选）
            <textarea data-state="forms-description" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="告诉填写者这份表单的用途" />
          </label>
          <div data-state="forms-questions">
            <h4>问题</h4>
            {draft.questions.map((q, i) => (
              <div key={i} className="forms-question-row">
                <select data-state="forms-q-type" value={q.type} onChange={(e) => updateDraftQuestion(i, { type: e.target.value as QuestionDraft["type"] })}>
                  {(Object.keys(FORM_TYPE_LABELS) as (keyof typeof FORM_TYPE_LABELS)[]).map((t) => (
                    <option key={t} value={t}>{FORM_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <input data-state="forms-q-label" value={q.label} onChange={(e) => updateDraftQuestion(i, { label: e.target.value })} placeholder="问题标题" />
                <label className="forms-required">
                  <input type="checkbox" data-state="forms-q-required" checked={q.required} onChange={(e) => updateDraftQuestion(i, { required: e.target.checked })} />
                  必填
                </label>
                {q.type === "select" && (
                  <input data-state="forms-q-options" value={q.options} onChange={(e) => updateDraftQuestion(i, { options: e.target.value })} placeholder="选项用逗号分隔：研发,产品" />
                )}
                <button type="button" className="btn btn-danger" data-state="forms-q-remove" onClick={() => setDraft((d) => ({ ...d, questions: d.questions.filter((_, idx) => idx !== i) }))}>移除</button>
              </div>
            ))}
            <button type="button" className="btn" data-state="forms-q-add" onClick={() => setDraft((d) => ({ ...d, questions: [...d.questions, { type: "text", label: "", required: false, options: "" }] }))}>＋ 添加问题</button>
          </div>
          <div className="forms-actions">
            <button type="button" className="btn btn-primary" data-state="forms-save" onClick={() => void createForm()}>创建表单</button>
            <button type="button" className="btn" data-state="forms-cancel" onClick={() => setView("list")}>取消</button>
          </div>
        </div>
      )}

      {phase !== "error" && view === "fill" && selected && (
        <div className="forms-fill" data-state="forms-fill">
          <h3>{selected.title}</h3>
          {selected.description && <p className="muted">{selected.description}</p>}
          {selected.closedAt !== null && <p className="error">该表单已关闭，不再接收新答卷。</p>}
          {selected.questions.map((q) => (
            <label key={q.id} className="forms-field">
              {q.label}{q.required ? " *" : ""}
              {q.type === "text" && (
                <input data-state="forms-answer-text" value={String(answers[String(q.id)] ?? "")} onChange={(e) => setAnswers((a) => ({ ...a, [String(q.id)]: e.target.value }))} />
              )}
              {q.type === "number" && (
                <input type="number" data-state="forms-answer-number" value={String(answers[String(q.id)] ?? "")} onChange={(e) => setAnswers((a) => ({ ...a, [String(q.id)]: e.target.value }))} />
              )}
              {q.type === "select" && (
                <select data-state="forms-answer-select" value={String(answers[String(q.id)] ?? "")} onChange={(e) => setAnswers((a) => ({ ...a, [String(q.id)]: e.target.value }))}>
                  <option value="">请选择</option>
                  {q.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              )}
              {q.type === "checkbox" && (
                <input type="checkbox" data-state="forms-answer-checkbox" checked={answers[String(q.id)] === true} onChange={(e) => setAnswers((a) => ({ ...a, [String(q.id)]: e.target.checked }))} />
              )}
            </label>
          ))}
          <div className="forms-actions">
            <button type="button" className="btn btn-primary" data-state="forms-submit" disabled={selected.closedAt !== null} onClick={() => void submitAnswers()}>提交答卷</button>
            <button type="button" className="btn" data-state="forms-to-summary" onClick={() => void openSummary(selected)}>查看汇总</button>
            <button type="button" className="btn" data-state="forms-back" onClick={() => setView("list")}>返回列表</button>
          </div>
        </div>
      )}

      {phase !== "error" && view === "summary" && summary && (
        <div className="forms-summary" data-state="forms-summary">
          <h3>{summary.title} · 答卷汇总</h3>
          <p className="muted" data-state="forms-summary-line">{formSummaryLine({ total: summary.total, questions: summary.questions })}</p>
          <div className="forms-summary-grid">
            {summary.questions.map((q) => (
              <div key={q.questionId} className="forms-summary-card" data-state="forms-summary-card">
                <strong>{q.label}</strong>
                <span className="muted"> · {FORM_TYPE_LABELS[q.type]} · 已答 {q.answered} / 跳过 {q.skipped}</span>
                {q.type === "text" && <ul data-state="forms-summary-text">{(q.values ?? []).map((v, i) => <li key={i}>{v}</li>)}</ul>}
                {q.type === "number" && (
                  <p data-state="forms-summary-number">总和 <b>{q.sum}</b> · 均值 <b>{q.avg}</b> · 范围 {q.min}~{q.max}（{q.count} 份）</p>
                )}
                {q.type === "select" && (
                  <ul data-state="forms-summary-select">
                    {(q.distribution ?? []).map((b) => <li key={b.option}>{b.option}：{b.count} 份 · {Math.round(b.rate * 100)}%</li>)}
                  </ul>
                )}
                {q.type === "checkbox" && <p data-state="forms-summary-checkbox">勾选 {q.checked} 份 · 勾选率 {Math.round((q.rate ?? 0) * 100)}%</p>}
              </div>
            ))}
          </div>
          <div className="forms-actions">
            <button type="button" className="btn" data-state="forms-back" onClick={() => setView("list")}>返回列表</button>
          </div>
        </div>
      )}
    </section>
  );
}
