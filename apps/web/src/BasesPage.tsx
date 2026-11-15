// 协流 XieFlow — r6 多维表格页：网格视图（表头 = 字段列，行 = 记录）
// + 单元格按字段类型渲染与编辑 + 字段管理面板 + 筛选 / 排序 / 分页
// 数据契约与全部类型口径来自 @xieflow/shared：字段类型的校验 / 归一 / 比较
// 规则都住在 shared 的引擎里（api 与 UI 同源），本页只做展示与交互编排。
// 截图钉态：?page=bases&shot=bases-* 让 headless 确定性捕获（真实状态都存在）；
// 深链参数 ?tableId= / ?filterFieldId= / ?filterValue= / ?sortFieldId= /
// ?sortDirection= / ?page= 可分享、可回放（筛选排序后的形态由真实 API 查询得出）。
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FIELD_TYPE_LABELS,
  fieldTypeUsesOptions,
  type BaseTable,
  type FieldType,
  type TableField,
  type TableRecord,
} from "@xieflow/shared";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow } from "./httpClient";

interface BasesQuery {
  tableId: string;
  filterFieldId: string;
  filterValue: string;
  sortFieldId: string;
  sortDirection: string;
  /** 分页页码的浏览器参数名（不叫 page——page 是外壳的 tab 选择参数） */
  pageNo: string;
}

interface BasesData {
  tables: BaseTable[];
  table: BaseTable | null;
  fields: TableField[];
  records: TableRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type BasesState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready" } & BasesData;

interface RecordQueryResult {
  records: TableRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 从 URL 读筛选 / 排序 / 分页参数（可分享的深链；分页参数用 pageNo 避开外壳的 page） */
function readQuery(): BasesQuery {
  const p = new URLSearchParams(window.location.search);
  return {
    tableId: p.get("tableId") ?? "",
    filterFieldId: p.get("filterFieldId") ?? "",
    filterValue: p.get("filterValue") ?? "",
    sortFieldId: p.get("sortFieldId") ?? "",
    sortDirection: p.get("sortDirection") ?? "",
    pageNo: p.get("pageNo") ?? "",
  };
}

/** 选中表格：URL 指定的优先，否则第一个 */
function pickTable(tables: BaseTable[], tableId: string): BaseTable | null {
  if (tables.length === 0) return null;
  const wanted = Number(tableId);
  if (tableId !== "" && Number.isInteger(wanted)) {
    const hit = tables.find((t) => t.id === wanted);
    if (hit) return hit;
  }
  return tables[0]!;
}

/** 网格数据装配：表列表 → 选中表 → 字段 → 记录（筛选/排序/分页交给 api + shared） */
async function fetchBases(query: BasesQuery): Promise<BasesData> {
  const tablesRes = await fetch("/api/tables");
  const tablesData = (await fetchJsonOrThrow(tablesRes)) as { tables: BaseTable[] };
  const table = pickTable(tablesData.tables, query.tableId);
  if (table === null) {
    return {
      tables: tablesData.tables,
      table: null,
      fields: [],
      records: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    };
  }
  const fieldsRes = await fetch(`/api/tables/${table.id}/fields`);
  const fields = ((await fetchJsonOrThrow(fieldsRes)) as { fields: TableField[] }).fields;
  const params = new URLSearchParams();
  if (query.filterFieldId !== "") params.set("filterFieldId", query.filterFieldId);
  if (query.filterValue !== "") params.set("filterValue", query.filterValue);
  if (query.sortFieldId !== "") params.set("sortFieldId", query.sortFieldId);
  if (query.sortDirection !== "") params.set("sortDirection", query.sortDirection);
  if (query.pageNo !== "") params.set("page", query.pageNo);
  const qs = params.toString();
  const recordsRes = await fetch(`/api/tables/${table.id}/records${qs === "" ? "" : `?${qs}`}`);
  const result = (await fetchJsonOrThrow(recordsRes)) as RecordQueryResult;
  return {
    tables: tablesData.tables,
    table,
    fields,
    records: result.records,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  };
}

/** 钉态种子：8 个默认字段齐备（7 种类型）+ 4 行数据，供确定性截图 */
function pinSeedFields(now: Date): TableField[] {
  const iso = now.toISOString();
  const mk = (id: number, name: string, type: FieldType, options: string[]): TableField => ({
    id,
    tableId: 1,
    name,
    type,
    position: id - 1,
    options,
    createdAt: iso,
    updatedAt: iso,
  });
  return [
    mk(1, "名称", "text", []),
    mk(2, "状态", "select", ["未开始", "进行中", "已完成"]),
    mk(3, "负责人", "text", []),
    mk(4, "金额", "number", []),
    mk(5, "截止日期", "date", []),
    mk(6, "标签", "multi-select", ["重要", "紧急"]),
    mk(7, "完成", "checkbox", []),
    mk(8, "链接", "url", []),
  ];
}

function pinSeedRecords(fields: TableField[]): TableRecord[] {
  const iso = "2026-11-15T08:00:00.000Z";
  const key = (name: string): string => String(fields.find((f) => f.name === name)!.id);
  const rows: Record<string, unknown>[] = [
    {
      [key("名称")]: "量房",
      [key("状态")]: "已完成",
      [key("负责人")]: "小协",
      [key("金额")]: 1200,
      [key("截止日期")]: "2026-11-20",
      [key("标签")]: ["重要"],
      [key("完成")]: true,
      [key("链接")]: "https://example.com/measure",
    },
    {
      [key("名称")]: "选瓷砖",
      [key("状态")]: "进行中",
      [key("负责人")]: "小流",
      [key("金额")]: 300,
      [key("截止日期")]: "2026-12-01",
      [key("标签")]: ["重要", "紧急"],
      [key("完成")]: false,
      [key("链接")]: "https://example.com/tiles",
    },
    {
      [key("名称")]: "定预算",
      [key("状态")]: "未开始",
      [key("负责人")]: "小协",
      [key("金额")]: 9000,
      [key("截止日期")]: "",
      [key("标签")]: [],
      [key("完成")]: false,
      [key("链接")]: "",
    },
  ];
  return rows.map((data, i) => ({
    id: 11 + i,
    tableId: 1,
    data,
    position: i,
    createdAt: iso,
    updatedAt: iso,
  }));
}

/** 单元格展示文案（按类型渲染；空值统一显示为占位符） */
function cellText(field: TableField, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field.type === "multi-select" && Array.isArray(value)) {
    return value.length === 0 ? "—" : value.join("、");
  }
  if (field.type === "checkbox") return value === true ? "☑ 是" : "☐ 否";
  if (field.type === "number") return String(value);
  return String(value);
}

export default function BasesPage() {
  const [query, setQuery] = useState<BasesQuery>(() => readQuery());
  const [state, setState] = useState<BasesState>({ phase: "loading" });
  const [editing, setEditing] = useState<{ recordId: number; fieldId: number } | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tableName, setTableName] = useState("");
  const [busy, setBusy] = useState(false);

  const shot = useMemo(() => new URLSearchParams(window.location.search).get("shot"), []);

  const load = useCallback(
    async (next: BasesQuery): Promise<void> => {
      try {
        const data = await fetchBases(next);
        setState({ phase: "ready", ...data });
      } catch (err: unknown) {
        setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      }
    },
    [],
  );

  useEffect(() => {
    if (shot === "bases-loading") {
      setState({ phase: "loading" });
      return;
    }
    if (shot === "bases-error") {
      setState({
        phase: "error",
        message: SERVICE_DOWN_MESSAGE + "（截图钉态：真实场景为 api 停机时 vite 代理 5xx）",
      });
      return;
    }
    if (shot === "bases-empty") {
      setState({
        phase: "ready",
        tables: [],
        table: null,
        fields: [],
        records: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });
      return;
    }
    if (shot === "bases-data" || shot === "bases-fields" || shot === "bases-narrow" || shot === "bases-edit") {
      const now = new Date();
      const fields = pinSeedFields(now);
      const table: BaseTable = {
        id: 1,
        name: "装修预算表",
        description: "M3 起步轮的样例表",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      setState({
        phase: "ready",
        tables: [table],
        table,
        fields,
        records: pinSeedRecords(fields),
        total: 3,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
      if (shot === "bases-fields") setFieldsOpen(true);
      // 单元格编辑态钉态：第一行第一列进入编辑（按类型给出对应控件）
      if (shot === "bases-edit") setEditing({ recordId: 11, fieldId: fields[0]!.id });
      return;
    }
    void load(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot]);

  const data: BasesData | null = state.phase === "ready" ? state : null;
  const fields = data?.fields ?? [];
  const records = data?.records ?? [];
  const table = data?.table ?? null;

  /** 改查询参数 → 写 URL（可分享）→ 重拉 */
  const applyQuery = useCallback(
    async (patch: Partial<BasesQuery>): Promise<void> => {
      const next = { ...query, ...patch };
      setQuery(next);
      const url = new URL(window.location.href);
      const keys: (keyof BasesQuery)[] = [
        "tableId",
        "filterFieldId",
        "filterValue",
        "sortFieldId",
        "sortDirection",
        "pageNo",
      ];
      for (const k of keys) {
        if (next[k] === "") url.searchParams.delete(k);
        else url.searchParams.set(k, next[k]);
      }
      window.history.replaceState(null, "", url);
      setEditing(null);
      await load(next);
    },
    [query, load],
  );

  /** 编辑单元格落库：PATCH /api/records/:id（整行 data 覆盖写） */
  const saveCell = async (recordId: number, field: TableField, raw: unknown): Promise<void> => {
    const record = records.find((r) => r.id === recordId);
    if (!record) return;
    let value: unknown = raw;
    if (field.type === "multi-select") {
      value = typeof raw === "string" ? raw.split(",").map((s) => s.trim()).filter((s) => s !== "") : raw;
    }
    if (field.type === "number" && typeof value === "string" && value.trim() !== "") {
      value = Number(value);
    }
    if (field.type === "date" && typeof value === "string" && value.trim() === "") {
      value = null;
    }
    const nextData = { ...record.data, [String(field.id)]: value };
    setBusy(true);
    try {
      const res = await fetch(`/api/records/${recordId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: nextData }),
      });
      await fetchJsonOrThrow(res);
      setEditing(null);
      await load(query);
    } catch (err: unknown) {
      setNotice(`保存失败：${err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE}`);
    } finally {
      setBusy(false);
    }
  };

  /** 新增行：POST /api/tables/:id/records（空行） */
  const addRow = async (): Promise<void> => {
    if (!table) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tables/${table.id}/records`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: {} }),
      });
      await fetchJsonOrThrow(res);
      setNotice("已新增一行——点单元格即可按类型编辑。");
      await load(query);
    } catch (err: unknown) {
      setNotice(`新增行失败：${err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE}`);
    } finally {
      setBusy(false);
    }
  };

  /** 删除行 */
  const removeRow = async (recordId: number): Promise<void> => {
    setBusy(true);
    try {
      const res = await fetch(`/api/records/${recordId}`, { method: "DELETE" });
      await fetchJsonOrThrow(res);
      await load(query);
    } catch (err: unknown) {
      setNotice(`删除行失败：${err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE}`);
    } finally {
      setBusy(false);
    }
  };

  /** 新建表 */
  const createTable = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: tableName }),
      });
      const created = (await fetchJsonOrThrow(res)) as BaseTable;
      setCreateOpen(false);
      setTableName("");
      setNotice(`已建表「${created.name}」——自带 8 个默认字段（7 种类型齐备）。`);
      await applyQuery({ ...query, tableId: String(created.id), filterFieldId: "", filterValue: "", sortFieldId: "", sortDirection: "", pageNo: "" });
    } catch (err: unknown) {
      setNotice(`建表失败：${err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE}`);
    } finally {
      setBusy(false);
    }
  };

  if (state.phase === "loading") {
    return (
      <section className="card state-loading" data-state="bases-loading">
        <p>正在加载多维表格…</p>
      </section>
    );
  }

  if (state.phase === "error") {
    return (
      <section className="card state-error" data-state="bases-error" role="alert">
        <h2>加载失败</h2>
        <p className="error-message">{state.message}</p>
        <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后刷新本页。</p>
      </section>
    );
  }

  if (table === null) {
    return (
      <div className="bases-page" data-state="bases-empty">
        <section className="card">
          <p className="empty" data-state="bases-empty-hint">
            还没有任何表格——点「＋ 新建表」创建第一个（会自动带上「名称 / 状态 / 负责人 / 金额 / 截止日期 / 标签 / 完成 / 链接」八个默认字段，7 种字段类型齐备）。
          </p>
          <div className="modal-actions bases-empty-actions">
            <button
              type="button"
              className="btn btn-primary"
              data-state="bases-create-table-button"
              onClick={() => {
                setTableName("");
                setCreateOpen(true);
              }}
            >
              ＋ 新建表
            </button>
          </div>
        </section>
        {createOpen && (
          <div className="modal-backdrop" data-state="bases-create-modal">
            <div className="modal-card" role="dialog" aria-label="新建表">
              <h2>新建表</h2>
              <label className="field">
                <span className="field-label">表名（必填）</span>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="例：装修预算表"
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
                  取消
                </button>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void createTable()}>
                  创建（自带 8 个默认字段）
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const filterField = fields.find((f) => String(f.id) === query.filterFieldId) ?? null;
  const sortField = fields.find((f) => String(f.id) === query.sortFieldId) ?? null;

  return (
    <div className="bases-page" data-state="bases-ready">
      <div className="toolbar bases-toolbar">
        <span className="bases-title">
          {table.name}
          <span className="hint"> — 表头 = 字段列，行 = 记录；点单元格按字段类型编辑。</span>
        </span>
        <span className="bases-switch">
          <label className="bases-switch-label" htmlFor="bases-table-switch">表格：</label>
          <select
            id="bases-table-switch"
            data-state="bases-table-switch"
            value={table.id}
            onChange={(e) => void applyQuery({ ...query, tableId: e.target.value, pageNo: "" })}
          >
            {data!.tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </span>
        <button type="button" className="btn btn-secondary" data-state="bases-fields-button" onClick={() => setFieldsOpen(true)}>
          字段管理
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setTableName("");
            setCreateOpen(true);
          }}
        >
          ＋ 新建表
        </button>
        <button
          type="button"
          className="btn btn-primary"
          data-state="bases-add-row"
          disabled={busy}
          onClick={() => void addRow()}
        >
          ＋ 新增行
        </button>
      </div>

      {notice && (
        <p className="export-banner" data-state="bases-notice" role="status">
          {notice}
        </p>
      )}

      <div className="bases-controls" data-state="bases-controls">
        <span className="bases-control">
          <label className="bases-switch-label" htmlFor="bases-filter-field">筛选：</label>
          <select
            id="bases-filter-field"
            data-state="bases-filter-field"
            value={query.filterFieldId}
            onChange={(e) => void applyQuery({ ...query, filterFieldId: e.target.value, pageNo: "" })}
          >
            <option value="">（不筛选）</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </span>
        <span className="bases-control">
          <input
            type="text"
            data-state="bases-filter-value"
            value={query.filterValue}
            placeholder={filterField ? `按「${filterField.name}」筛选的值` : "筛选值"}
            disabled={filterField === null}
            onChange={(e) => setQuery({ ...query, filterValue: e.target.value })}
            onBlur={(e) => void applyQuery({ ...query, filterValue: e.target.value, pageNo: "" })}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                void applyQuery({ ...query, filterValue: e.currentTarget.value, pageNo: "" });
            }}
          />
        </span>
        <span className="bases-control">
          <label className="bases-switch-label" htmlFor="bases-sort-field">排序：</label>
          <select
            id="bases-sort-field"
            data-state="bases-sort-field"
            value={query.sortFieldId}
            onChange={(e) => void applyQuery({ ...query, sortFieldId: e.target.value, pageNo: "" })}
          >
            <option value="">（不排序）</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </span>
        <span className="bases-control">
          <select
            data-state="bases-sort-direction"
            value={query.sortDirection === "" ? "asc" : query.sortDirection}
            disabled={sortField === null}
            onChange={(e) => void applyQuery({ ...query, sortDirection: e.target.value, pageNo: "" })}
          >
            <option value="asc">升序</option>
            <option value="desc">降序</option>
          </select>
        </span>
        <span className="hint bases-count" data-state="bases-count">
          共 {data!.total} 行 · 第 {data!.page} / {Math.max(1, data!.totalPages)} 页
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          data-state="bases-prev-page"
          disabled={data!.page <= 1}
          onClick={() => void applyQuery({ ...query, pageNo: String(data!.page - 1) })}
        >
          上一页
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          data-state="bases-next-page"
          disabled={data!.page >= data!.totalPages}
          onClick={() => void applyQuery({ ...query, pageNo: String(data!.page + 1) })}
        >
          下一页
        </button>
      </div>

      <div className="bases-grid-wrap">
        <table className="bases-grid" data-state="bases-grid">
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f.id} data-field-id={f.id} data-field-type={f.type}>
                  <span className="bases-col-name">{f.name}</span>
                  <span className="bases-col-type">{FIELD_TYPE_LABELS[f.type]}</span>
                </th>
              ))}
              <th className="bases-col-action">操作</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr data-state="bases-no-records">
                <td className="bases-empty-row" colSpan={fields.length + 1}>
                  {query.filterFieldId !== ""
                    ? "当前筛选条件下没有记录——换个筛选值或选「（不筛选）」看全部。"
                    : "这张表还没有行——点右上角「＋ 新增行」加第一行，点单元格即可按类型编辑。"}
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={r.id} data-record-id={r.id}>
                  {fields.map((f) => {
                    const value = r.data[String(f.id)];
                    const isEditing =
                      editing !== null && editing.recordId === r.id && editing.fieldId === f.id;
                    return (
                      <td
                        key={f.id}
                        data-field-id={f.id}
                        data-field-type={f.type}
                        className={`bases-cell bases-cell-${f.type}`}
                        onClick={() => {
                          if (!isEditing) setEditing({ recordId: r.id, fieldId: f.id });
                        }}
                      >
                        {isEditing ? (
                          <CellEditor
                            field={f}
                            value={value}
                            busy={busy}
                            onCommit={(v) => void saveCell(r.id, f, v)}
                            onCancel={() => setEditing(null)}
                          />
                        ) : (
                          <CellView field={f} value={value} />
                        )}
                      </td>
                    );
                  })}
                  <td className="bases-col-action">
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      disabled={busy}
                      title="删除这一行"
                      onClick={() => void removeRow(r.id)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="hint seam-note">
        字段类型口径：文本 / 数字 / 日期 / 单选 / 多选 / 复选框 / 链接——数值按值排序，日期按时间排序，单选按候选项顺序排序，空值恒排在最后。
      </p>

      {fieldsOpen && (
        <FieldsPanel
          tableId={table.id}
          fields={fields}
          busy={busy}
          onClose={() => setFieldsOpen(false)}
          onChanged={async () => {
            await load(query);
          }}
        />
      )}

      {createOpen && (
        <div className="modal-backdrop" data-state="bases-create-modal">
          <div className="modal-card" role="dialog" aria-label="新建表">
            <h2>新建表</h2>
            <label className="field">
              <span className="field-label">表名（必填）</span>
              <input
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="例：装修预算表"
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void createTable()}>
                创建（自带 8 个默认字段）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 单元格只读渲染（按字段类型） */
function CellView({ field, value }: { field: TableField; value: unknown }) {
  if (field.type === "checkbox") {
    return <span className="bases-check">{value === true ? "☑ 是" : "☐ 否"}</span>;
  }
  if (field.type === "select" && typeof value === "string" && value !== "") {
    return <span className="bases-pill">{value}</span>;
  }
  if (field.type === "multi-select" && Array.isArray(value) && value.length > 0) {
    return (
      <>
        {value.map((v) => (
          <span key={String(v)} className="bases-pill bases-pill-multi">
            {String(v)}
          </span>
        ))}
      </>
    );
  }
  if (field.type === "url" && typeof value === "string" && value !== "") {
    return (
      <a className="bases-link" href={value} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        {value}
      </a>
    );
  }
  if (field.type === "number" && value !== null && value !== undefined && value !== "") {
    return <span className="bases-number">{String(value)}</span>;
  }
  if (value === null || value === undefined || value === "") {
    return <span className="bases-empty-cell">—</span>;
  }
  return <span>{String(value)}</span>;
}

/** 单元格编辑器（按字段类型给出对应控件） */
function CellEditor({
  field,
  value,
  busy,
  onCommit,
  onCancel,
}: {
  field: TableField;
  value: unknown;
  busy: boolean;
  onCommit: (v: unknown) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<string>(() =>
    field.type === "multi-select" && Array.isArray(value)
      ? value.join(", ")
      : value === null || value === undefined
        ? ""
        : String(value),
  );
  const commit = (): void => {
    if (field.type === "checkbox") return;
    onCommit(draft);
  };
  return (
    <span className="bases-editor" onClick={(e) => e.stopPropagation()}>
      {field.type === "select" ? (
        <select
          data-state="bases-cell-editor"
          autoFocus
          value={draft}
          disabled={busy}
          onChange={(e) => onCommit(e.target.value)}
          onBlur={onCancel}
        >
          <option value="">（空）</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.type === "checkbox" ? (
        <input
          type="checkbox"
          data-state="bases-cell-editor"
          autoFocus
          checked={value === true}
          disabled={busy}
          onChange={(e) => onCommit(e.target.checked)}
          onBlur={onCancel}
        />
      ) : field.type === "date" ? (
        <input
          type="date"
          data-state="bases-cell-editor"
          autoFocus
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onCancel();
          }}
        />
      ) : field.type === "number" ? (
        <input
          type="number"
          data-state="bases-cell-editor"
          autoFocus
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onCancel();
          }}
        />
      ) : (
        <input
          type="text"
          data-state="bases-cell-editor"
          autoFocus
          value={draft}
          disabled={busy}
          placeholder={field.type === "multi-select" ? "多个值用逗号分隔" : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onCancel();
          }}
        />
      )}
    </span>
  );
}

/** 字段管理面板：增 / 改 / 删字段（类型与候选项同一口径） */
function FieldsPanel({
  tableId,
  fields,
  busy,
  onClose,
  onChanged,
}: {
  tableId: number;
  fields: TableField[];
  busy: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<FieldType>("text");
  const [draftOptions, setDraftOptions] = useState("");
  const [error, setError] = useState<string | null>(null);

  const call = async (fn: () => Promise<Response>): Promise<void> => {
    setError(null);
    try {
      const res = await fn();
      await fetchJsonOrThrow(res);
      await onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    }
  };

  const addField = async (): Promise<void> => {
    const options = draftOptions
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    await call(async () =>
      fetch(`/api/tables/${tableId}/fields`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: draftName, type: draftType, options }),
      }),
    );
    setDraftName("");
    setDraftOptions("");
  };

  return (
    <div className="modal-backdrop" data-state="bases-fields-panel">
      <div className="modal-card bases-fields-card" role="dialog" aria-label="字段管理">
        <h2>字段管理</h2>
        <p className="hint">
          字段类型决定单元格的取值校验、写入归一与排序口径（规则集中在 shared，api 与界面同源）。
        </p>
        <ul className="bases-fields-list">
          {fields.map((f) => (
            <li key={f.id} className="bases-field-row" data-field-id={f.id}>
              <input
                type="text"
                className="bases-field-name"
                defaultValue={f.name}
                onBlur={(e) => {
                  if (e.target.value === f.name || e.target.value.trim() === "") return;
                  void call(async () =>
                    fetch(`/api/fields/${f.id}`, {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ name: e.target.value }),
                    }),
                  );
                }}
              />
              <select
                defaultValue={f.type}
                onChange={(e) => {
                  const type = e.target.value as FieldType;
                  void call(async () =>
                    fetch(`/api/fields/${f.id}`, {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        type,
                        options: fieldTypeUsesOptions(type) ? f.options : [],
                      }),
                    }),
                  );
                }}
              >
                {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              {fieldTypeUsesOptions(f.type) ? (
                <input
                  type="text"
                  className="bases-field-options"
                  defaultValue={f.options.join(", ")}
                  placeholder="候选项（逗号分隔）"
                  onBlur={(e) => {
                    const options = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter((s) => s !== "");
                    void call(async () =>
                      fetch(`/api/fields/${f.id}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ options }),
                      }),
                    );
                  }}
                />
              ) : (
                <span className="bases-field-options bases-field-options-empty">—</span>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={busy}
                onClick={() =>
                  void call(async () => fetch(`/api/fields/${f.id}`, { method: "DELETE" }))
                }
              >
                删除
              </button>
            </li>
          ))}
        </ul>
        <div className="bases-field-add">
          <input
            type="text"
            data-state="bases-new-field-name"
            placeholder="新字段名"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <select
            data-state="bases-new-field-type"
            value={draftType}
            onChange={(e) => setDraftType(e.target.value as FieldType)}
          >
            {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {fieldTypeUsesOptions(draftType) ? (
            <input
              type="text"
              data-state="bases-new-field-options"
              placeholder="候选项（逗号分隔）"
              value={draftOptions}
              onChange={(e) => setDraftOptions(e.target.value)}
            />
          ) : null}
          <button
            type="button"
            className="btn btn-secondary"
            data-state="bases-add-field"
            disabled={busy || draftName.trim() === ""}
            onClick={() => void addField()}
          >
            添加字段
          </button>
        </div>
        {error && (
          <p className="error-message" role="alert" data-state="bases-fields-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
