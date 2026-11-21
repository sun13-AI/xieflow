// 协流 XieFlow — r27「报表」tab：跨模块 KPI 看板（六卡 + 环比 + 迷你条 + 明细下钻）
// 所有算法/时间范围/环比口径只消费 shared/reports；本页零算法分支（不引外部图表库，CSS 迷你条）。
// 截图钉态：?page=reports&shot=reports-overview|reports-empty|reports-range|reports-drilldown|reports-six-cards|reports-error
// ?narrow=1 钉窄屏；?metric=&from=&to= 深链可 reload 保持（用户第一次用全链路）。
import { useEffect, useState, type ReactElement } from "react";
import {
  REPORT_METRICS,
  REPORT_METRIC_LABELS,
  REPORT_PRESETS,
  reportRangeFromPreset,
  assembleReport,
  isReportMetric,
  type ReportMetric,
  type ReportOverview,
  type ReportMetricResult,
} from "@xieflow/shared/reports";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

const PINNED = new Set([
  "reports-overview", "reports-empty", "reports-range", "reports-drilldown", "reports-six-cards", "reports-error",
]);

type Phase = "loading" | "error" | "ready";
type Preset = (typeof REPORT_PRESETS)[number] | "custom";

const SHOT_SOURCE = {
  todos: [
    { id: 1, title: "完成产品验收", status: "done", createdAt: "2026-11-01T08:00:00.000Z" },
    { id: 2, title: "同步口径复核", status: "done", createdAt: "2026-11-02T08:00:00.000Z" },
    { id: 3, title: "补齐回归断言", status: "done", createdAt: "2026-11-03T08:00:00.000Z" },
    { id: 4, title: "整理报表需求", status: "open", createdAt: "2026-11-04T08:00:00.000Z" },
    { id: 5, title: "窄屏适配", status: "open", createdAt: "2026-11-05T08:00:00.000Z" },
  ],
  schedules: [
    { id: 11, title: "需求评审", date: "2026-11-01", start: "09:00" },
    { id: 12, title: "研发对齐", date: "2026-11-01", start: "10:00" },
    { id: 13, title: "复验排期", date: "2026-11-03", start: "09:00" },
    { id: 14, title: "周会", date: "2026-11-07", start: "09:00" },
  ],
  boardColumns: [{ id: 1, name: "待办" }, { id: 2, name: "进行中" }, { id: 3, name: "已完成" }],
  boardCards: [
    { id: 21, title: "验收卡片", columnId: 3, todoId: 1, updatedAt: "2026-11-01T10:00:00.000Z" },
    { id: 22, title: "口径卡片", columnId: 3, todoId: 2, updatedAt: "2026-11-02T10:00:00.000Z" },
    { id: 23, title: "回归卡片", columnId: 3, todoId: 3, updatedAt: "2026-11-05T10:00:00.000Z" },
  ],
  approvals: [
    { id: 31, title: "采购申请", status: "approved", createdAt: "2026-11-01T08:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z" },
    { id: 32, title: "报销申请", status: "rejected", createdAt: "2026-11-02T09:00:00.000Z", updatedAt: "2026-11-02T13:00:00.000Z" },
  ],
  approvalSteps: [
    { id: 1, approvalId: 31, action: "submit", actedAt: "2026-11-01T08:00:00.000Z" },
    { id: 2, approvalId: 31, action: "approve", actedAt: "2026-11-01T10:00:00.000Z" },
    { id: 3, approvalId: 32, action: "submit", actedAt: "2026-11-02T09:00:00.000Z" },
    { id: 4, approvalId: 32, action: "reject", actedAt: "2026-11-02T13:00:00.000Z" },
  ],
  assetTransactions: [
    { id: 41, assetId: 1, type: "in", quantity: 10, createdAt: "2026-11-01T08:00:00.000Z" },
    { id: 42, assetId: 1, type: "out", quantity: 4, createdAt: "2026-11-02T08:00:00.000Z" },
    { id: 43, assetId: 2, type: "out", quantity: 3, createdAt: "2026-11-03T08:00:00.000Z" },
    { id: 45, assetId: 3, type: "out", quantity: 2, createdAt: "2026-11-06T08:00:00.000Z" },
  ],
  documents: [
    { id: 51, title: "需求说明", createdAt: "2026-11-01T08:00:00.000Z" },
    { id: 52, title: "竞品分析", createdAt: "2026-11-03T08:00:00.000Z" },
    { id: 53, title: "复验报告", createdAt: "2026-11-07T08:00:00.000Z" },
  ],
};
const SHOT_RANGE = { from: "2026-11-01", to: "2026-11-07" };

function readQuery(): { shot: string; metric: string; from: string; to: string } {
  const p = new URLSearchParams(window.location.search);
  return { shot: p.get("shot") ?? "", metric: p.get("metric") ?? "", from: p.get("from") ?? "", to: p.get("to") ?? "" };
}

async function getJson<T>(url: string): Promise<T> {
  return (await fetchJsonOrThrow(await apiFetch(url))) as T;
}

function pinnedOverview(shot: string, range: { from: string; to: string }): ReportOverview {
  return assembleReport(shot === "reports-empty" ? {} : SHOT_SOURCE, range);
}

function syncUrl(metric: ReportMetric, from: string, to: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("page", "reports");
  url.searchParams.set("metric", metric);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/** 环比文案：+10 / -3 小时 / 0（上期无数据） */
function deltaText(result: ReportMetricResult): string {
  if (result.previous === 0) return result.delta === 0 ? "环比 0" : `环比 +${result.delta}${result.unit}（上期 0）`;
  return `环比 ${result.delta >= 0 ? "+" : ""}${result.delta}${result.unit} / ${result.deltaPct >= 0 ? "+" : ""}${result.deltaPct}%`;
}

export default function ReportsPage(): ReactElement {
  const query = readQuery();
  const shotRange = query.shot === "reports-range" ? reportRangeFromPreset("90d") : SHOT_RANGE;
  const initialRange = query.from !== "" && query.to !== ""
    ? { from: query.from, to: query.to }
    : PINNED.has(query.shot)
      ? shotRange
      : reportRangeFromPreset("30d");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [preset, setPreset] = useState<Preset>(
    query.shot === "reports-range" ? "90d" : PINNED.has(query.shot) ? "custom" : "30d",
  );
  const [rangeNote, setRangeNote] = useState("");
  const [metric, setMetric] = useState<ReportMetric>(
    isReportMetric(query.metric) ? query.metric : query.shot === "reports-drilldown" ? "approvalSla" : "todoCompletion",
  );
  const [phase, setPhase] = useState<Phase>(query.shot === "reports-error" ? "error" : PINNED.has(query.shot) ? "ready" : "loading");
  const [error, setError] = useState(query.shot === "reports-error" ? `${SERVICE_DOWN_MESSAGE}` : "");
  const [overview, setOverview] = useState<ReportOverview | null>(() => (PINNED.has(query.shot) ? pinnedOverview(query.shot, initialRange) : null));
  const [detail, setDetail] = useState<ReportMetricResult | null>(null);

  useEffect(() => {
    if (PINNED.has(query.shot)) return;
    let alive = true;
    setPhase("loading");
    getJson<ReportOverview>(`/api/reports/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((data) => {
        if (!alive) return;
        setOverview(data);
        setDetail(data.metrics[metric] ?? null);
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      });
    return () => { alive = false; };
  }, [from, to, query.shot]);

  function choosePreset(next: Preset): void {
    setPreset(next);
    if (next !== "custom") {
      const range = reportRangeFromPreset(next);
      setFrom(range.from);
      setTo(range.to);
      syncUrl(metric, range.from, range.to);
      setRangeNote(query.shot === "reports-range" ? "截图钉态：已切到近 90 天，六指标按新范围重算" : `已切到近 ${next === "7d" ? 7 : next === "30d" ? 30 : 90} 天`);
    } else {
      setRangeNote("自定义范围：选好起止日期后点「应用」");
    }
  }

  function applyCustom(): void {
    setPreset("custom");
    setRangeNote("自定义范围已应用");
    syncUrl(metric, from, to);
  }

  function chooseMetric(next: ReportMetric): void {
    setMetric(next);
    syncUrl(next, from, to);
    if (PINNED.has(query.shot)) {
      setDetail(overview?.metrics[next] ?? pinnedOverview(query.shot, { from, to }).metrics[next]);
      return;
    }
    getJson<ReportMetricResult>(`/api/reports/${next}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((data) => setDetail(data))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }

  const shown = overview ?? pinnedOverview(query.shot, { from, to });
  const shownDetail = detail ?? shown.metrics[metric];
  const shotNote = query.shot === "reports-six-cards" ? "截图钉态：六张 KPI 卡齐备（数值 + 环比 + 迷你条）"
    : query.shot === "reports-drilldown" ? "截图钉态：点击「审批时效」卡下钻明细"
      : query.shot === "reports-empty" ? "截图钉态：空数据六指标全 0，明细表空态"
        : query.shot === "reports-range" ? "截图钉态：时间范围切换到近 90 天"
          : "";

  return (
    <div className="reports-page" data-state="reports-page">
      <h1>报表中心</h1>
      <p className="reports-intro">跨模块数据看板：待办完成率 / 日程分布 / 看板吞吐 / 审批时效 / 库存周转 / 文档产出，一屏总览 + 时间范围筛选。</p>

      <div className="reports-toolbar" data-state="reports-toolbar">
        <span className="reports-range-label">时间范围</span>
        {REPORT_PRESETS.map((p) => (
          <button
            type="button"
            key={p}
            className={`reports-range-btn ${preset === p ? "reports-range-active" : ""}`}
            data-range={p}
            onClick={() => choosePreset(p)}
          >近 {p === "7d" ? 7 : p === "30d" ? 30 : 90} 天</button>
        ))}
        <button type="button" className={`reports-range-btn ${preset === "custom" ? "reports-range-active" : ""}`} data-range="custom" onClick={() => choosePreset("custom")}>自定义</button>
        <label className="reports-date">起 <input type="date" data-state="reports-from" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="reports-date">止 <input type="date" data-state="reports-to" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button type="button" data-action="reports-apply" onClick={applyCustom}>应用</button>
        <span className="reports-window" data-state="reports-window">{shown.range.from} → {shown.range.to}（{shown.days} 天）</span>
      </div>
      {rangeNote !== "" && <p className="reports-note" data-state="reports-range-note">{rangeNote}</p>}
      {shotNote !== "" && <p className="reports-note" data-state="reports-shot-note">{shotNote}</p>}
      {error !== "" && <p className="reports-action-error" role="alert">{error}</p>}

      {phase === "loading" && <p className="state-loading" data-state="reports-loading">正在装配六类指标…</p>}
      {phase === "error" && (
        <div className="state-error" role="alert" data-state="reports-error">
          <h2>连接失败</h2>
          <p className="error-message">{error}</p>
          <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后重试。</p>
          <button type="button" onClick={() => setPhase("ready")}>重试</button>
        </div>
      )}
      {phase === "ready" && (
        <>
          <section className="reports-cards" data-state="reports-cards">
            {REPORT_METRICS.map((key) => {
              const card = shown.metrics[key];
              const peak = Math.max(1, ...card.spark);
              return (
                <button
                  type="button"
                  key={key}
                  className={`reports-card ${metric === key ? "reports-card-active" : ""}`}
                  data-state="reports-kpi"
                  data-metric={key}
                  onClick={() => chooseMetric(key)}
                >
                  <span className="rc-label">{REPORT_METRIC_LABELS[key]}</span>
                  <span className="rc-value" data-state="reports-value">{card.value}<small>{card.unit}</small></span>
                  <span className={`rc-delta ${card.delta >= 0 ? "rc-up" : "rc-down"}`} data-state="reports-delta">{deltaText(card)}</span>
                  <span className="rc-spark" data-state="reports-spark" aria-hidden="true">
                    {card.spark.map((v, i) => (
                      <span key={i} className="rc-bar" style={{ height: `${4 + Math.round((v / peak) * 24)}px` }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </section>

          <section className="reports-detail" data-state="reports-detail">
            <h2>{REPORT_METRIC_LABELS[metric]} · 明细</h2>
            <p className="reports-detail-meta" data-state="reports-detail-meta">
              当前 {shownDetail.value}{shownDetail.unit} · 上期 {shownDetail.previous}{shownDetail.unit} · {deltaText(shownDetail)}
            </p>
            {shownDetail.detail.length === 0 ? (
              <p className="empty" data-state="reports-detail-empty">该指标在时间范围内暂无数据——换一段时间范围或先去对应模块造数据。</p>
            ) : (
              <table className="reports-table" data-state="reports-table">
                <thead><tr><th>对象</th><th>数值</th><th>说明</th></tr></thead>
                <tbody>
                  {shownDetail.detail.map((row) => (
                    <tr key={row.key} data-state="reports-row" data-key={row.key}>
                      <td>{row.label}</td><td>{row.value}{shownDetail.unit}</td><td>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
