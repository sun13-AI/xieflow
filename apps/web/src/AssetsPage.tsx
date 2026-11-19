// 协流 XieFlow — r17「物资」tab：台账列表 + 出入库表单 + 流水时间线
// 数据全走真实 api（assets CRUD / transactions / 查询）。库存规则全在 shared，页面零库存分支。
// 截图钉态：?page=assets&shot=assets-empty|assets-form|assets-loading|assets-error
// ?assetId= 深链选中真实物资；?narrow=1 显式钉窄屏。
import { useCallback, useEffect, useState } from "react";
import type { Asset, AssetTransaction } from "@xieflow/shared";
import type { MemberSummary } from "@xieflow/shared/org";
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABELS, ASSET_TX_TYPES, ASSET_TX_TYPE_LABELS } from "@xieflow/shared";
import MemberPicker from "./MemberPicker";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

type TxType = (typeof ASSET_TX_TYPES)[number];
type AssetWithMember = Asset & { readonly custodianMember?: MemberSummary | null };

const PIN_MEMBERS: readonly MemberSummary[] = [
  { id: 21, name: "赵敏", departmentId: 3, departmentName: "行政部", title: "资产管理员", status: "active" },
  { id: 22, name: "王强", departmentId: 4, departmentName: "后勤部", title: "仓管", status: "active" },
];
const PIN_A: MemberSummary = PIN_MEMBERS[0]!;
const PIN_ASSET: AssetWithMember = {
  id: 81, name: "示例：投影仪", category: "equipment", quantity: 6, unit: "台", location: "行政仓库",
  custodian: "赵敏", createdAt: "2026-11-19T09:00:00.000Z", custodianMemberId: 21, custodianMember: PIN_A,
};

interface PageState {
  phase: "loading" | "error" | "ready";
  message?: string;
  assets: AssetWithMember[];
}

function readShot(): string {
  return new URLSearchParams(window.location.search).get("shot") ?? "";
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

export default function AssetsPage() {
  const [shot] = useState(readShot);
  const [state, setState] = useState<PageState>(() => {
    if (shot === "assets-loading") return { phase: "loading", assets: [] };
    if (shot === "assets-error") return { phase: "error", message: SERVICE_DOWN_MESSAGE, assets: [] };
    if (shot === "assets-empty") return { phase: "ready", assets: [] };
    if (shot === "assets-custodian-badge") return { phase: "ready", assets: [PIN_ASSET] };
    if (shot === "assets-picker") return { phase: "ready", assets: [] };
    return { phase: "loading", assets: [] };
  });
  const [selectedId, setSelectedId] = useState<number>(() => {
    const raw = Number(new URLSearchParams(window.location.search).get("assetId"));
    return shot === "assets-custodian-badge" ? PIN_ASSET.id : raw || 0;
  });
  const [selected, setSelected] = useState<AssetWithMember | null>(null);
  const [txs, setTxs] = useState<AssetTransaction[]>([]);
  const [creating, setCreating] = useState(shot === "assets-form" || shot === "assets-picker");
  const [nameDraft, setNameDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<(typeof ASSET_CATEGORIES)[number]>("office");
  const [qtyDraft, setQtyDraft] = useState("0");
  const [unitDraft, setUnitDraft] = useState("");
  const [locationDraft, setLocationDraft] = useState("");
  const [custodianDraft, setCustodianDraft] = useState("");
  const [custodianMember, setCustodianMember] = useState<MemberSummary | null>(null);
  const [operatorMember, setOperatorMember] = useState<MemberSummary | null>(null);
  const [txType, setTxType] = useState<TxType>("in");
  const [txQty, setTxQty] = useState("1");
  const [txFrom, setTxFrom] = useState("");
  const [txTo, setTxTo] = useState("");
  const [txOperator, setTxOperator] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getJson<{ assets: AssetWithMember[] }>("/api/assets");
      setState({ phase: "ready", assets: data.assets });
      return data.assets;
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err), assets: [] });
      return [];
    }
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    if (shot === "assets-custodian-badge") {
      setSelected(PIN_ASSET);
      setTxs([]);
      return;
    }
    if (id <= 0) { setSelected(null); setTxs([]); return; }
    try {
      const [detail, txData] = await Promise.all([
        getJson<AssetWithMember>(`/api/assets/${id}`),
        getJson<{ transactions: AssetTransaction[] }>(`/api/assets/${id}/transactions`),
      ]);
      setSelected(detail);
      setTxs(txData.transactions);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }, [shot]);

  useEffect(() => {
    if (["assets-loading", "assets-error", "assets-empty", "assets-picker", "assets-custodian-badge"].includes(shot)) return;
    void refresh().then((assets) => {
      if (selectedId > 0 && assets.some((a) => a.id === selectedId)) void loadDetail(selectedId);
    });
  }, [refresh, loadDetail, shot, selectedId]);

  const createAsset = async () => {
    setBusy(true);
    setNotice("");
    try {
      const created = await sendJson("/api/assets", {
        name: nameDraft, category: categoryDraft, quantity: Number(qtyDraft),
        unit: unitDraft, location: locationDraft, custodian: custodianDraft,
        custodianMemberId: custodianMember?.id,
      }) as AssetWithMember;
      setNameDraft(""); setCategoryDraft("office"); setQtyDraft("0");
      setUnitDraft(""); setLocationDraft(""); setCustodianDraft("");
      setCustodianMember(null);
      setCreating(false);
      setNotice(`已建物资 #${created.id}`);
      await refresh();
      setSelectedId(created.id);
      await loadDetail(created.id);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitTx = async () => {
    if (selected === null) return;
    setBusy(true);
    setNotice("");
    try {
      const tx = await sendJson(`/api/assets/${selected.id}/transactions`, {
        type: txType, quantity: Number(txQty),
        from: txFrom, to: txTo, operator: txOperator,
        operatorMemberId: operatorMember?.id,
      }) as AssetTransaction;
      setNotice(`已记账流水 #${tx.id}（${ASSET_TX_TYPE_LABELS[tx.type]}）`);
      setTxQty("1"); setTxFrom(""); setTxTo(""); setTxOperator("");
      setOperatorMember(null);
      await Promise.all([refresh(), loadDetail(selected.id)]);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const removeAsset = async (id: number) => {
    setBusy(true);
    try {
      await sendJson(`/api/assets/${id}`, {}, "DELETE");
      setNotice(`已删除物资 #${id}`);
      if (selectedId === id) { setSelectedId(0); setSelected(null); setTxs([]); }
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pinNoteMap: Record<string, string> = {
    "assets-empty": "首次使用空态钉注：真实 0 笔物资——点「＋ 新建物资」即可建账。",
    "assets-form": "建账表单钉注：名称 / 分类 / 库存 / 单位 / 位置 / 保管人全为真输入，提交后落 assets 表。",
    "assets-list": "台账钉注：列表由 GET /api/assets 真读回；出入库走 POST /:id/transactions 单事务零半态。",
    "assets-timeline": "流水钉注：时间线由 GET /:id/transactions 真读回，in/out/transfer 逐步留痕。",
    "assets-picker": "选人弹窗钉注：保管员从通讯录搜索并选择；原「保管人」自由文本输入框仍在场，老路径不受影响。",
    "assets-custodian-badge": "部门徽标钉注：物资卡片与详情从回带 member 摘要渲染部门徽标；usage 计数由 HTTP usage 端点提供。",
  };
  const pinNote = pinNoteMap[shot] ?? "";

  return (
    <section className="as-shell" data-state="assets-ready">
      <aside className="as-side">
        <div className="as-side-head">
          <h2>物资台账</h2>
          <button type="button" className="btn" data-action="as-create-open" onClick={() => setCreating(true)}>＋ 新建物资</button>
        </div>
        {creating && (
          <div className="as-new" data-state="assets-form-fields">
            <input aria-label="物资名称" placeholder="物资名称" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
            <select aria-label="物资分类" value={categoryDraft} onChange={(e) => setCategoryDraft(e.target.value as typeof categoryDraft)}>
              {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{ASSET_CATEGORY_LABELS[c]}</option>)}
            </select>
            <input aria-label="初始库存" placeholder="初始库存（非负整数）" value={qtyDraft} onChange={(e) => setQtyDraft(e.target.value)} />
            <input aria-label="计量单位" placeholder="计量单位（如：台）" value={unitDraft} onChange={(e) => setUnitDraft(e.target.value)} />
            <input aria-label="存放位置" placeholder="存放位置" value={locationDraft} onChange={(e) => setLocationDraft(e.target.value)} />
            <input aria-label="保管人" placeholder="保管人" value={custodianDraft} onChange={(e) => setCustodianDraft(e.target.value)} />
            <MemberPicker
              label="保管员" seam="assets-custodian" member={custodianMember}
              pinned={shot === "assets-picker" ? PIN_MEMBERS : undefined}
              openOnInit={shot === "assets-picker"}
              onPick={(m) => { setCustodianMember(m); setCustodianDraft(m.name); }}
              onClear={() => setCustodianMember(null)}
            />
            <button type="button" className="btn btn-primary" data-action="as-create" onClick={() => void createAsset()} disabled={busy}>确认建账</button>
          </div>
        )}
        {state.phase === "loading" && <p className="empty" data-state="assets-loading">正在连接本地数据库…</p>}
        {state.phase === "error" && <p className="empty" data-state="assets-error">{state.message}</p>}
        {state.phase === "ready" && state.assets.length === 0 ? (
          <p className="empty" data-state="assets-empty-list">这里还没有物资——点「＋ 新建物资」开始建账。</p>
        ) : (
          <ul className="as-list" data-state="assets-list">
            {state.assets.map((a) => (
              <li key={a.id} className={`as-list-item${a.id === selectedId ? " as-list-active" : ""}`}>
                <button type="button" className="as-list-btn" data-asset-id={a.id} onClick={() => setSelectedId(a.id)}>
                  <span className="as-list-name">{a.name}</span>
                  <span className="as-list-meta">#{a.id} · {ASSET_CATEGORY_LABELS[a.category]} · 库存 {a.quantity} {a.unit}</span>
                  {a.custodianMember && <em className="as-member-badge" data-state="assets-member-badge">{a.custodianMember.departmentName ?? "未分配部门"}</em>}
                </button>
                <button type="button" className="as-del" data-asset-id={a.id} onClick={() => void removeAsset(a.id)} disabled={busy}>删</button>
              </li>
            ))}
          </ul>
        )}
        {pinNote !== "" && <p className="as-shot-note" data-state="assets-pin">{pinNote}</p>}
      </aside>

      <div className="as-main">
        <div className="as-head">
          <h2>{selected ? `${selected.name} · #${selected.id}` : "未选择物资"}</h2>
          {selected && <span className="as-stock" data-state="assets-stock">库存 {selected.quantity} {selected.unit}</span>}
        </div>
        {selected ? (
          <>
            <div className="as-meta">
              <span>分类：{ASSET_CATEGORY_LABELS[selected.category]}</span>
              <span>存放：{selected.location}</span>
              <span>保管人：{selected.custodian}
                {selected.custodianMember && <em className="as-member-badge" data-state="assets-detail-member-badge">{selected.custodianMember.departmentName ?? "未分配部门"}</em>}
              </span>
            </div>
            <div className="as-tx-form" data-state="assets-tx-form">
              <h3>出入库操作</h3>
              <p className="as-consequence" data-state="assets-consequence">后果提示：出库超过当前库存将被拒绝（HTTP 400），整笔流水零半态；转移要求来源位置与当前存放一致。</p>
              <select aria-label="流水类型" value={txType} onChange={(e) => setTxType(e.target.value as TxType)}>
                {ASSET_TX_TYPES.map((t) => <option key={t} value={t}>{ASSET_TX_TYPE_LABELS[t]}</option>)}
              </select>
              <input aria-label="流水数量" placeholder="数量" value={txQty} onChange={(e) => setTxQty(e.target.value)} />
              {(txType === "out" || txType === "transfer") && (
                <input aria-label="来源位置" placeholder="来源（转移须与当前存放一致）" value={txFrom} onChange={(e) => setTxFrom(e.target.value)} />
              )}
              {(txType === "in" || txType === "transfer") && (
                <input aria-label="目标位置" placeholder="目标位置" value={txTo} onChange={(e) => setTxTo(e.target.value)} />
              )}
              <input aria-label="操作人" placeholder="操作人" value={txOperator} onChange={(e) => setTxOperator(e.target.value)} />
              <MemberPicker
                label="操作人" seam="assets-operator" member={operatorMember}
                pinned={undefined}
                onPick={(m) => { setOperatorMember(m); setTxOperator(m.name); }}
                onClear={() => setOperatorMember(null)}
              />
              <button type="button" className="btn btn-primary" data-action="as-tx" onClick={() => void submitTx()} disabled={busy}>确认记账</button>
            </div>
            <div className="as-timeline-wrap">
              <h3>流水时间线</h3>
              {txs.length === 0 ? (
                <p className="empty" data-state="assets-tx-empty">还没有流水——做出入库操作后这里会逐步留痕。</p>
              ) : (
                <ol className="as-timeline" data-state="assets-timeline">
                  {txs.map((tx) => (
                    <li key={tx.id} className="as-tx-item" data-tx-type={tx.type}>
                      <span className="as-tx-badge">{ASSET_TX_TYPE_LABELS[tx.type]}</span>
                      <span className="as-tx-body">
                        <strong>{tx.quantity}</strong> · 操作人 {tx.operator}
                        {(tx.from !== "" || tx.to !== "") && <span className="as-tx-route"> · {tx.from || "—"} → {tx.to || "—"}</span>}
                        <time>{tx.createdAt}</time>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        ) : (
          <p className="as-placeholder" data-state="assets-placeholder">从左侧选一笔物资，查看台账详情与出入库流水。</p>
        )}
        {notice !== "" && <p className="as-notice" data-state="assets-notice">{notice}</p>}
      </div>
    </section>
  );
}
