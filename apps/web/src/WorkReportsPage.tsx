// 协流 XieFlow — r36「报告」tab：日报 / 周报自动生成（模板化汇总，零 token）
// 时间窗过滤 / 六段 Markdown / 打印版 HTML / 计数摘要全部消费 shared/workReports，本页零算法分支。
// 截图钉态：?page=work-reports&shot=wr-empty|wr-daily|wr-weekly|wr-edit|wr-saved|wr-narrow|wr-error
// ?narrow=1 钉窄屏；?type=&date=&week= 深链 reload 保持（用户第一次用全链路）。
import { useEffect, useState, type ReactElement } from "react";
import {
  WORK_REPORT_TYPES,
  WORK_REPORT_LABELS,
  parseWorkReportPeriod,
  collectReportData,
  buildReportMarkdown,
  buildReportHtml,
  reportSummary,
  type WorkReportType,
  type WorkReportSource,
  type WorkReportData,
  type WorkReportPeriod,
  type WorkReportSummary,
} from "@xieflow/shared/workReports";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

const PINS = new Set(["wr-empty", "wr-daily", "wr-weekly", "wr-edit", "wr-saved", "wr-narrow", "wr-error"]);
const PIN_ANCHOR = "2026-11-21";

interface WorkReportResponse {
  readonly type: WorkReportType;
  readonly period: WorkReportPeriod;
  readonly data: WorkReportData;
  readonly summary: WorkReportSummary;
  readonly markdown: string;
  readonly html: string;
}

const PIN_SOURCE: WorkReportSource = {
  todos: [
    { id: 1, title: "完成产品验收", status: "done", createdAt: "2026-11-19T08:00:00.000Z", updatedAt: "2026-11-21T10:00:00.000Z" },
    { id: 2, title: "同步口径复核", status: "done", createdAt: "2026-11-20T08:00:00.000Z", updatedAt: "2026-11-20T09:00:00.000Z" },
    { id: 3, title: "补齐回归断言", status: "open", createdAt: "2026-11-21T08:00:00.000Z", updatedAt: "2026-11-21T08:00:00.000Z" },
    { id: 4, title: "报表需求整理", status: "open", createdAt: "2026-11-20T08:00:00.000Z", updatedAt: "2026-11-21T09:00:00.000Z" },
    { id: 5, title: "窄屏适配", status: "open", createdAt: "2026-11-21T08:00:00.000Z", updatedAt: "2026-11-21T08:00:00.000Z" },
    { id: 6, title: "下周交付", status: "open", createdAt: "2026-11-21T08:00:00.000Z", updatedAt: "2026-11-21T08:00:00.000Z", dueDate: "2026-11-24" },
  ],
  schedules: [
    { id: 11, title: "需求评审", date: "2026-11-21", start: "09:00", end: "10:00" },
    { id: 12, title: "研发对齐", date: "2026-11-21", start: "10:00", end: "11:00" },
    { id: 13, title: "明日复盘", date: "2026-11-22", start: "15:00", end: "16:00" },
  ],
  blocked: [{ todoId: 5, blockers: [3] }],
  documents: [{ id: 21, title: "报告设计说明", createdAt: "2026-11-21T07:00:00.000Z", updatedAt: "2026-11-21T11:00:00.000Z" }],
};
const PIN_EMPTY: WorkReportSource = { todos: [], schedules: [], blocked: [], documents: [] };

function todayStr(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function readQuery(): { shot: string; type: WorkReportType; date: string; week: string } {
  const p = new URLSearchParams(window.location.search);
  const rawType = p.get("type");
  const type: WorkReportType = rawType === "weekly" ? "weekly" : "daily";
  return {
    shot: p.get("shot") ?? "",
    type,
    date: p.get("date") ?? "",
    week: p.get("week") ?? "",
  };
}

function pinReport(shot: string, type: WorkReportType): WorkReportResponse {
  const period = parseWorkReportPeriod(type, PIN_ANCHOR);
  const data = collectReportData(shot === "wr-empty" ? PIN_EMPTY : PIN_SOURCE, period);
  return {
    type,
    period,
    data,
    summary: reportSummary(data),
    markdown: buildReportMarkdown(data),
    html: buildReportHtml(data),
  };
}

function syncUrl(type: WorkReportType, date: string, week: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("page", "work-reports");
  url.searchParams.delete("shot");
  url.searchParams.set("type", type);
  if (type === "daily") {
    url.searchParams.set("date", date);
    url.searchParams.delete("week");
  } else {
    url.searchParams.set("week", week);
    url.searchParams.delete("date");
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function WorkReportsPage(): ReactElement {
  const query = readQuery();
  const pinned = PINS.has(query.shot);
  const [type, setType] = useState<WorkReportType>(pinned && query.shot === "wr-weekly" ? "weekly" : query.type);
  const [date, setDate] = useState(query.date === "" ? todayStr() : query.date);
  const [week, setWeek] = useState(query.week === "" ? todayStr() : query.week);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">(
    query.shot === "wr-error" ? "error" : pinned ? "ready" : "loading",
  );
  const [error, setError] = useState(query.shot === "wr-error" ? `${SERVICE_DOWN_MESSAGE}` : "");
  const [report, setReport] = useState<WorkReportResponse | null>(() => pinned && query.shot !== "wr-error"
    ? pinReport(query.shot, query.shot === "wr-weekly" ? "weekly" : "daily")
    : null,
  );
  const [markdown, setMarkdown] = useState<string>(() => {
    if (!pinned || query.shot === "wr-error") return "";
    const base = pinReport(query.shot, query.shot === "wr-weekly" ? "weekly" : "daily").markdown;
    return query.shot === "wr-edit" ? `${base}\n- 人工补充：明日跟进阻塞项\n` : base;
  });
  const [title, setTitle] = useState("");
  const [saveNote, setSaveNote] = useState(query.shot === "wr-saved" ? "已存为文档（8 块）：可到文档页继续编辑。" : "");
  const [savedId, setSavedId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(query.shot === "wr-edit");
  const [printNote, setPrintNote] = useState("");

  async function load(nextType: WorkReportType = type, nextDate = date, nextWeek = week): Promise<void> {
    setPhase("loading");
    setError("");
    setSaveNote("");
    setSavedId(null);
    setDirty(false);
    const path = nextType === "daily"
      ? `/api/reports/daily?date=${encodeURIComponent(nextDate)}`
      : `/api/reports/weekly?week=${encodeURIComponent(nextWeek)}`;
    try {
      const data = await fetchJsonOrThrow(await apiFetch(path)) as WorkReportResponse;
      setReport(data);
      setMarkdown(data.markdown);
      setTitle(`${WORK_REPORT_LABELS[data.type]} · ${data.period.date}`);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  useEffect(() => {
    if (pinned) return;
    void load(type, date, week);
    // 首屏装配一次；后续切换由按钮/生成显式触发，避免日期输入中途反复请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseType(next: WorkReportType): void {
    setType(next);
    syncUrl(next, date, week);
    if (pinned) {
      const nextReport = pinReport(query.shot === "wr-empty" ? "wr-empty" : "wr-daily", next);
      setReport(nextReport);
      setMarkdown(nextReport.markdown);
      setTitle(`${WORK_REPORT_LABELS[next]} · ${nextReport.period.date}`);
      setPhase("ready");
      return;
    }
    void load(next, date, week);
  }

  function applyDate(): void {
    syncUrl(type, date, week);
    if (pinned) {
      const nextReport = pinReport(query.shot === "wr-empty" ? "wr-empty" : "wr-daily", type);
      setReport(nextReport);
      setMarkdown(nextReport.markdown);
      setPhase("ready");
      return;
    }
    void load(type, date, week);
  }

  async function save(): Promise<void> {
    setSaveNote("");
    setSavedId(null);
    try {
      const body = {
        title: title.trim() === "" ? `${WORK_REPORT_LABELS[type]} · ${type === "daily" ? date : week}` : title.trim(),
        markdown,
        type,
        ...(type === "daily" ? { date } : { week }),
      };
      const res = await apiFetch("/api/reports/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await fetchJsonOrThrow(res) as { documentId: number; imported: number; created: boolean };
      setSavedId(data.documentId);
      setSaveNote(`已存为文档 #${data.documentId}（${data.imported} 块${data.created ? "，新建" : "，覆盖原文档"}），可到文档页继续编辑。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  function print(): void {
    setPrintNote("打印版已生成：浏览器打印对话框可另存 PDF（样式随 @media print 生效）。");
    window.print();
  }

  const shotNote = query.shot === "wr-empty" ? "截图钉态：空数据六段均为「暂无」"
    : query.shot === "wr-edit" ? "截图钉态：Markdown 可编辑，人工补充行已写入预览"
      : query.shot === "wr-saved" ? "截图钉态：存为文档成功回执"
        : query.shot === "wr-narrow" ? "截图钉态：488px 窄屏纵排"
          : "";

  return (
    <div className="wr-page" data-state="wr-page">
      <h1>报告中心</h1>
      <p className="wr-intro">从真实业务数据自动汇总日报 / 周报：完成 / 进行中 / 阻塞 / 日程 / 产出 / 下一段计划，可编辑后存为文档，全程零 token。</p>

      <div className="wr-toolbar" data-state="wr-toolbar">
        {WORK_REPORT_TYPES.map((t) => (
          <button
            type="button"
            key={t}
            className={`wr-type-btn ${type === t ? "wr-type-active" : ""}`}
            data-state="wr-type-btn"
            data-type={t}
            data-action="wr-type"
            onClick={() => chooseType(t)}
          >{WORK_REPORT_LABELS[t]}</button>
        ))}
        {type === "daily" ? (
          <label className="wr-date">报告日期 <input type="date" data-field="wr-date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        ) : (
          <label className="wr-date">周锚点（任意一天 / YYYY-Www） <input data-field="wr-week" value={week} onChange={(e) => setWeek(e.target.value)} placeholder="2026-11-21 或 2026-W48" /></label>
        )}
        <button type="button" data-action="wr-generate" className="wr-primary" onClick={applyDate}>生成报告</button>
        <span className="wr-window" data-state="wr-window">{report ? `${report.period.from} → ${report.period.to}` : "—"}</span>
      </div>
      {shotNote !== "" && <p className="wr-shot-note" data-state="wr-shot-note">{shotNote}</p>}

      {phase === "error" && (
        <div className="wr-error" data-state="wr-error" role="alert">
          <h2>报告生成失败</h2>
          <p className="error-message">{error}</p>
          <p className="hint">请确认 api 服务已启动，并检查日期 / 周锚点格式。</p>
          <button type="button" onClick={() => { setError(""); setPhase("ready"); }}>重试</button>
        </div>
      )}
      {phase === "loading" && <p className="wr-loading" data-state="wr-loading">正在汇总真实业务数据…</p>}

      {phase === "ready" && report && (
        <>
          <section className="wr-summary" data-state="wr-summary" aria-label="报告计数摘要">
            <span data-summary="completed">完成 <b>{report.summary.completed}</b></span>
            <span data-summary="ongoing">进行中 <b>{report.summary.ongoing}</b></span>
            <span data-summary="blocked">阻塞 <b>{report.summary.blocked}</b></span>
            <span data-summary="schedules">日程 <b>{report.summary.schedules}</b></span>
            <span data-summary="next">下一步 <b>{report.summary.next}</b></span>
            <span data-summary="total">待办合计 <b>{report.summary.total}</b></span>
          </section>

          <section className="wr-editor">
            <div className="wr-editor-head">
              <h2>Markdown 预览（可直接编辑）</h2>
              <span className="wr-dirty" data-state="wr-dirty">{dirty ? "已修改，尚未存为文档" : "与自动汇总一致"}</span>
            </div>
            <label className="wr-title-label">文档标题 <input data-field="wr-title" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} /></label>
            <textarea
              className="wr-markdown"
              data-state="wr-markdown"
              data-field="wr-markdown"
              aria-label="报告 Markdown 预览"
              value={markdown}
              onChange={(e) => { setMarkdown(e.target.value); setDirty(true); }}
            />
            <div className="wr-actions">
              <button type="button" data-action="wr-save" className="wr-primary" onClick={() => void save()}>存为文档</button>
              <button type="button" data-action="wr-print" onClick={print}>打印 / 导出 PDF</button>
              <span className="wr-char-count" data-state="wr-char-count">{markdown.length} 字</span>
            </div>
            {printNote !== "" && <p className="wr-print-note" data-state="wr-print">{printNote}</p>}
            {saveNote !== "" && (
              <p className="wr-saved" data-state="wr-saved">
                {saveNote}
                {savedId !== null && <a href={`?page=docs&docId=${savedId}`} data-state="wr-saved-link">打开文档 #{savedId}</a>}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
