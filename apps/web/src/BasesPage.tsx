// 协流 XieFlow — r6 多维表格页：网格视图（表头 = 字段列，行 = 记录）
// + 单元格按字段类型渲染与编辑 + 字段管理面板 + 筛选 / 排序 / 分页
// r7 追加：视图切换栏 + 视图编辑面板（筛选 / 排序 / 隐藏列）+ CSV 导入对话框
// （预览前 5 行 + 错误行清单 + 确认导入）。
// 数据契约与全部类型口径来自 @xieflow/shared：字段类型的校验 / 归一 / 比较
// 规则都住在 shared 的引擎里（api 与 UI 同源），本页只做展示与交互编排。
// 截图钉态：?page=bases&shot=bases-* 让 headless 确定性捕获（真实状态都存在）；
// 深链参数 ?tableId= / ?viewId= / ?filterFieldId= / ?filterValue= / ?sortFieldId= /
// ?sortDirection= / ?pageNo= 可分享、可回放（筛选排序后的形态由真实 API 查询得出）。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FIELD_TYPE_LABELS,
  fieldTypeUsesOptions,
  describeViewSpec,
  type BaseTable,
  type CsvImportRowError,
  type FieldType,
  type TableField,
  type TableRecord,
  type TableView,
} from "@xieflow/shared";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

interface BasesQuery {
  tableId: string;
  /** 当前视图（空 = 全部记录，不走视图口径） */
  viewId: string;
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
  views: TableView[];
  activeView: TableView | null;
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

/** 导入预览结果（api /api/tables/:id/import.csv/preview 的返回体） */
interface ImportPreview {
  headers: string[];
  total: number;
  preview: string[][];
  errors: CsvImportRowError[];
  importable: boolean;
}

/** 从 URL 读筛选 / 排序 / 分页参数（可分享的深链；分页参数用 pageNo 避开外壳的 page） */
function readQuery(): BasesQuery {
  const p = new URLSearchParams(window.location.search);
  const rawDirection = p.get("sortDirection") ?? "";
  return {
    tableId: p.get("tableId") ?? "",
    viewId: p.get("viewId") ?? "",
    filterFieldId: p.get("filterFieldId") ?? "",
    filterValue: p.get("filterValue") ?? "",
    sortFieldId: p.get("sortFieldId") ?? "",
    // 非法方向不带给 api（api 侧对非法方向直接 400）：深链里的脏参数不污染界面
    sortDirection: rawDirection === "asc" || rawDirection === "desc" ? rawDirection : "",
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

/** 网格数据装配：表列表 → 选中表 → 字段 → 视图 → 记录（筛选/排序/分页交给 api + shared） */
async function fetchBases(query: BasesQuery): Promise<BasesData> {
  const tablesRes = await apiFetch("/api/tables");
  const tablesData = (await fetchJsonOrThrow(tablesRes)) as { tables: BaseTable[] };
  const table = pickTable(tablesData.tables, query.tableId);
  if (table === null) {
    return {
      tables: tablesData.tables,
      table: null,
      fields: [],
      views: [],
      activeView: null,
      records: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    };
  }
  const fieldsRes = await apiFetch(`/api/tables/${table.id}/fields`);
  const fields = ((await fetchJsonOrThrow(fieldsRes)) as { fields: TableField[] }).fields;
  const viewsRes = await apiFetch(`/api/tables/${table.id}/views`);
  const views = ((await fetchJsonOrThrow(viewsRes)) as { views: TableView[] }).views;

  const activeView = views.find((v) => String(v.id) === query.viewId) ?? null;
  const params = new URLSearchParams();
  if (query.pageNo !== "") params.set("page", query.pageNo);
  // 视图口径：筛选 / 排序 / 投影都由视图 spec 决定（api 复用 shared queryRecords）
  if (!activeView) {
    if (query.filterFieldId !== "") params.set("filterFieldId", query.filterFieldId);
    if (query.filterValue !== "") params.set("filterValue", query.filterValue);
    if (query.sortFieldId !== "") params.set("sortFieldId", query.sortFieldId);
    if (query.sortDirection !== "") params.set("sortDirection", query.sortDirection);
  }
  const qs = params.toString();
  const recordsUrl = activeView
    ? `/api/views/${activeView.id}/records${qs === "" ? "" : `?${qs}`}`
    : `/api/tables/${table.id}/records${qs === "" ? "" : `?${qs}`}`;
  const recordsRes = await apiFetch(recordsUrl);
  const result = (await fetchJsonOrThrow(recordsRes)) as RecordQueryResult;
  return {
    tables: tablesData.tables,
    table,
    fields,
    views,
    activeView,
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

/** POST / PATCH JSON（导入接口需要自己看 422 的错误行清单，不能用 fetchJsonOrThrow 吞掉） */
async function sendJson(
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const res = await apiFetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, data };
}

/** 导入预览用的样例 CSV（列名 = 8 个默认字段名；带引号的多选列验证 CSV 解析） */
const SAMPLE_CSV_OK = [
  "名称,状态,负责人,金额,截止日期,标签,完成,链接",
  "量房复核,已完成,小协,1200,2026-11-20,重要,true,https://example.com/a",
  '贴砖,进行中,小流,300,2026-12-01,"重要,紧急",false,https://example.com/b',
  "水电改造,未开始,小协,9000,2026-12-15,紧急,false,",
  "设计报价,进行中,小流,1500,2026-11-28,,true,",
  "采购主材,已完成,小协,2400,2026-12-20,\"重要,紧急\",true,https://example.com/e",
].join("\n");

/** 带两行非法数据的样例 CSV（金额不是数字 / 状态不在候选项内） */
const SAMPLE_CSV_BAD = [
  "名称,状态,负责人,金额,截止日期,标签,完成,链接",
  "量房复核,已完成,小协,1200,2026-11-20,重要,true,https://example.com/a",
  "贴砖,进行中,小流,不是数字,2026-12-01,重要,false,https://example.com/b",
  "水电改造,搁置,小协,9000,2026-12-15,紧急,false,",
].join("\n");

/** 视图编辑器草稿（新建与编辑共用） */
interface ViewDraft {
  id: number | null;
  name: string;
  filters: { fieldId: string; value: string }[];
  sorts: { fieldId: string; direction: "asc" | "desc" }[];
  hidden: number[];
}

function emptyViewDraft(fields: TableField[]): ViewDraft {
  return {
    id: null,
    name: "",
    filters: fields.length > 0 ? [{ fieldId: String(fields[0]!.id), value: "" }] : [],
    sorts: fields.length > 0 ? [{ fieldId: String(fields[0]!.id), direction: "asc" }] : [],
    hidden: [],
  };
}

function draftFromView(view: TableView, fields: TableField[]): ViewDraft {
  return {
    id: view.id,
    name: view.name,
    filters: view.filterSpec.map((c) => ({
      fieldId: String(c.fieldId),
      value: Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? ""),
    })),
    sorts: view.sortSpec.map((r) => ({ fieldId: String(r.fieldId), direction: r.direction })),
    hidden: fields.filter((f) => !view.visibleFields.includes(f.id)).map((f) => f.id),
  };
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
  // r7：视图 / 导入
  const [viewDraft, setViewDraft] = useState<ViewDraft | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [filterDraft, setFilterDraft] = useState(query.filterValue);

  const shot = useMemo(() => new URLSearchParams(window.location.search).get("shot"), []);
  const editViewParam = useMemo(
    () => new URLSearchParams(window.location.search).get("editView") ?? "",
    [],
  );
  const importedParam = useMemo(
    () => new URLSearchParams(window.location.search).get("imported") ?? "",
    [],
  );
  const pinnedImportRef = useRef(false);
  const feedbackRef = useRef(false);

  const load = useCallback(
    async (next: BasesQuery): Promise<BasesData | null> => {
      try {
        const data = await fetchBases(next);
        setState({ phase: "ready", ...data });
        return data;
      } catch (err: unknown) {
        setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
        return null;
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
        views: [],
        activeView: null,
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
        views: [],
        activeView: null,
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
    void (async () => {
      const data = await load(query);
      if (!data) return;
      // 真实链路：导入成功反馈（导入行数由 shot 脚本按真实响应写进 URL）
      if (importedParam !== "" && Number(importedParam) > 0) {
        setNotice(`导入成功：${importedParam} 行已全部落库（零半态）。`);
      }
      // 视图编辑面板深链：?editView=<id> 打开该视图的编辑面板（真实数据）
      if (editViewParam !== "") {
        const hit = data.views.find((v) => String(v.id) === editViewParam);
        if (hit) setViewDraft(draftFromView(hit, data.fields));
      }
      // 导入对话框钉态：?shot=bases-import-preview / bases-import-errors
      // 预览走**真实 api**（不是假数据）：合法样例 → 前 5 行预览；
      // 非法样例 → 真实错误行清单（行号 + 原因）。
      if ((shot === "bases-import-preview" || shot === "bases-import-errors") && !pinnedImportRef.current) {
        pinnedImportRef.current = true;
        setImportOpen(true);
        setImportText(shot === "bases-import-preview" ? SAMPLE_CSV_OK : SAMPLE_CSV_BAD);
        try {
          const res = await sendJson("POST", `/api/tables/${data.table!.id}/import.csv/preview`, {
            csv: shot === "bases-import-preview" ? SAMPLE_CSV_OK : SAMPLE_CSV_BAD,
          });
          if (res.status === 200 && res.data) {
            setImportPreview(res.data as unknown as ImportPreview);
            setImportError(null);
          } else {
            setImportError(String(res.data?.error ?? `预览失败（HTTP ${res.status}）`));
          }
        } catch (err: unknown) {
          setImportError(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot, editViewParam, importedParam]);

  const data: BasesData | null = state.phase === "ready" ? state : null;
  const fields = data?.fields ?? [];
  const records = data?.records ?? [];
  const table = data?.table ?? null;
  const views = data?.views ?? [];
  const activeView = data?.activeView ?? null;

  // 深链改写筛选值时同步输入框（避免界面与口径不一致）
  useEffect(() => {
    setFilterDraft(query.filterValue);
  }, [query.filterValue]);

  /** 视图口径下的可见列（visible_fields 为空 = 全部可见） */
  const visibleColumns = useMemo(() => {
    if (!activeView || activeView.visibleFields.length === 0) return fields;
    return fields.filter((f) => activeView.visibleFields.includes(f.id));
  }, [activeView, fields]);

  /** 改查询参数 → 写 URL（可分享）→ 重拉 */
  const applyQuery = useCallback(
    async (patch: Partial<BasesQuery>): Promise<BasesData | null> => {
      const next = { ...query, ...patch };
      setQuery(next);
      const url = new URL(window.location.href);
      const keys: (keyof BasesQuery)[] = [
        "tableId",
        "viewId",
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
      return load(next);
    },
    [query, load],
  );

  /** 切换视图（视图口径：筛选 / 排序 / 投影全在视图里） */
  const switchView = useCallback(
    async (viewId: string): Promise<void> => {
      await applyQuery({
        viewId,
        filterFieldId: "",
        filterValue: "",
        sortFieldId: "",
        sortDirection: "",
        pageNo: "",
      });
    },
    [applyQuery],
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
      const res = await apiFetch(`/api/records/${recordId}`, {
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
      const res = await apiFetch(`/api/tables/${table.id}/records`, {
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
      const res = await apiFetch(`/api/records/${recordId}`, { method: "DELETE" });
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
      const res = await apiFetch("/api/tables", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: tableName }),
      });
      const created = (await fetchJsonOrThrow(res)) as BaseTable;
      setCreateOpen(false);
      setTableName("");
      setNotice(`已建表「${created.name}」——自带 8 个默认字段（7 种类型齐备）。`);
      await applyQuery({
        tableId: String(created.id),
        viewId: "",
        filterFieldId: "",
        filterValue: "",
        sortFieldId: "",
        sortDirection: "",
        pageNo: "",
      });
    } catch (err: unknown) {
      setNotice(`建表失败：${err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE}`);
    } finally {
      setBusy(false);
    }
  };

  /** 应用筛选（r7 U2-2：提交后给成功反馈，不再「静默失焦」） */
  const applyFilter = async (): Promise<void> => {
    const field = fields.find((f) => String(f.id) === query.filterFieldId);
    const result = await applyQuery({
      filterValue: filterDraft,
      pageNo: "",
    });
    if (!result) return;
    if (!field || query.filterFieldId === "") {
      setNotice("已清除筛选——显示全部记录。");
      return;
    }
    setNotice(
      `已应用筛选：「${field.name}」= ${filterDraft === "" ? "（空）" : filterDraft} —— 命中 ${result.total} 行。`,
    );
  };

  /** 清除筛选 */
  const clearFilter = async (): Promise<void> => {
    setFilterDraft("");
    const result = await applyQuery({ filterFieldId: "", filterValue: "", pageNo: "" });
    if (result) setNotice(`已清除筛选——显示全部 ${result.total} 行。`);
  };

  /**
   * 截图钉态 · U2-2 证据：调用与「应用筛选」按钮**同一个处理函数**（真实 API 查询 +
   * 真实命中数写进成功反馈条），不是伪造的一份静态文案。
   */
  useEffect(() => {
    if (shot !== "bases-filter-feedback" || state.phase !== "ready" || feedbackRef.current) return;
    feedbackRef.current = true;
    void applyFilter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot, state.phase]);

  /** 保存视图（新建 or 更新；spec 归一口径在 api / shared） */
  const saveView = async (): Promise<void> => {
    if (!table || !viewDraft) return;
    setViewError(null);
    const allIds = fields.map((f) => f.id);
    const visibleFields = allIds.filter((id) => !viewDraft.hidden.includes(id));
    const filterSpec = viewDraft.filters
      .filter((f) => f.fieldId !== "" && f.value !== "")
      .map((f) => ({ fieldId: Number(f.fieldId), value: f.value }));
    const sortSpec = viewDraft.sorts
      .filter((s) => s.fieldId !== "")
      .map((s) => ({ fieldId: Number(s.fieldId), direction: s.direction }));
    const body = {
      name: viewDraft.name,
      filterSpec,
      sortSpec,
      visibleFields,
    };
    setBusy(true);
    try {
      const res =
        viewDraft.id === null
          ? await sendJson("POST", `/api/tables/${table.id}/views`, body)
          : await sendJson("PATCH", `/api/views/${viewDraft.id}`, body);
      if (res.status !== 200 && res.status !== 201) {
        setViewError(String(res.data?.error ?? `保存视图失败（HTTP ${res.status}）`));
        return;
      }
      const saved = res.data as unknown as TableView;
      setViewDraft(null);
      setNotice(`已保存视图「${saved.name}」——切到它即可按保存的筛选 / 排序 / 隐藏列看数据。`);
      await applyQuery({ viewId: String(saved.id) });
    } catch (err: unknown) {
      setViewError(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  /** 删除视图 */
  const deleteView = async (): Promise<void> => {
    if (!viewDraft || viewDraft.id === null) return;
    setViewError(null);
    setBusy(true);
    try {
      const res = await apiFetch(`/api/views/${viewDraft.id}`, { method: "DELETE" });
      await fetchJsonOrThrow(res);
      setViewDraft(null);
      setNotice("已删除视图。");
      await applyQuery({ viewId: "" });
    } catch (err: unknown) {
      setViewError(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  /** CSV 导入预览（真实 api；不落库） */
  const runImportPreview = async (): Promise<void> => {
    if (!table) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const res = await sendJson("POST", `/api/tables/${table.id}/import.csv/preview`, { csv: importText });
      if (res.status !== 200 || !res.data) {
        setImportPreview(null);
        setImportError(String(res.data?.error ?? `预览失败（HTTP ${res.status}）`));
        return;
      }
      setImportPreview(res.data as unknown as ImportPreview);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setImportBusy(false);
    }
  };

  /** CSV 导入确认（原子：任一行非法 → 一行都不落库） */
  const confirmImport = async (): Promise<void> => {
    if (!table) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const res = await sendJson("POST", `/api/tables/${table.id}/import.csv`, { csv: importText });
      if (res.status === 201 && res.data) {
        const imported = Number(res.data["imported"] ?? 0);
        setImportOpen(false);
        setImportPreview(null);
        setImportText("");
        setNotice(`导入成功：${imported} 行已全部落库（零半态）。`);
        await load(query);
        return;
      }
      if (res.status === 422 && res.data) {
        const errors = (res.data["errors"] ?? []) as CsvImportRowError[];
        setImportError(String(res.data["error"] ?? "导入失败"));
        setImportPreview({
          headers: importPreview?.headers ?? [],
          total: Number(res.data["total"] ?? 0),
          preview: importPreview?.preview ?? [],
          errors,
          importable: false,
        });
        return;
      }
      setImportError(String(res.data?.error ?? `导入失败（HTTP ${res.status}）`));
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setImportBusy(false);
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
            onChange={(e) => void applyQuery({ tableId: e.target.value, viewId: "", pageNo: "" })}
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
          className="btn btn-secondary"
          data-state="bases-import-button"
          onClick={() => {
            setImportOpen(true);
            setImportPreview(null);
            setImportError(null);
            if (importText === "") setImportText(SAMPLE_CSV_OK);
          }}
        >
          导入 CSV
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

      {/* r7：视图切换栏（全部记录 + 已保存视图 + 新建 / 编辑入口） */}
      <div className="bases-views" data-state="bases-view-switcher">
        <span className="bases-switch-label">视图：</span>
        <button
          type="button"
          className={`bases-view-chip ${activeView === null ? "bases-view-chip-active" : ""}`}
          data-state="bases-view-all"
          onClick={() => void switchView("")}
        >
          全部记录
        </button>
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`bases-view-chip ${activeView?.id === v.id ? "bases-view-chip-active" : ""}`}
            data-state="bases-view-chip"
            data-view-id={v.id}
            onClick={() => void switchView(String(v.id))}
          >
            {v.name}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-small"
          data-state="bases-new-view"
          onClick={() => {
            setViewError(null);
            setViewDraft(emptyViewDraft(fields));
          }}
        >
          ＋ 新建视图
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          data-state="bases-edit-view"
          disabled={activeView === null}
          onClick={() => {
            if (!activeView) return;
            setViewError(null);
            setViewDraft(draftFromView(activeView, fields));
          }}
        >
          编辑视图
        </button>
      </div>

      {activeView !== null && (
        <p className="hint bases-view-summary" data-state="bases-view-summary">
          当前视图「{activeView.name}」口径：{describeViewSpec(activeView, fields)}（命中 {data!.total} 行）
        </p>
      )}

      {activeView === null && (
        <div className="bases-controls" data-state="bases-controls">
          <span className="bases-control">
            <label className="bases-switch-label" htmlFor="bases-filter-field">筛选：</label>
            <select
              id="bases-filter-field"
              data-state="bases-filter-field"
              value={query.filterFieldId}
              onChange={(e) => {
                setFilterDraft("");
                void applyQuery({ ...query, filterFieldId: e.target.value, filterValue: "", pageNo: "" });
              }}
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
              value={filterDraft}
              placeholder={filterField ? `按「${filterField.name}」筛选的值` : "筛选值"}
              disabled={filterField === null}
              onChange={(e) => setFilterDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void applyFilter();
              }}
            />
          </span>
          <span className="bases-control">
            <button
              type="button"
              className="btn btn-secondary btn-small"
              data-state="bases-filter-apply"
              disabled={filterField === null || busy}
              onClick={() => void applyFilter()}
            >
              应用筛选
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              data-state="bases-filter-clear"
              disabled={filterField === null && query.filterValue === ""}
              onClick={() => void clearFilter()}
            >
              清除
            </button>
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
              title={sortField === null ? "先选排序字段，方向才生效" : "排序方向"}
              value={query.sortDirection === "" ? "asc" : query.sortDirection}
              disabled={sortField === null}
              onChange={(e) => void applyQuery({ ...query, sortDirection: e.target.value, pageNo: "" })}
            >
              <option value="asc">升序</option>
              <option value="desc">降序</option>
            </select>
            {sortField === null && <span className="hint">先选排序字段</span>}
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
      )}

      <div className="bases-grid-wrap">
        <table
          className="bases-grid"
          data-state="bases-grid"
          style={{ minWidth: `${Math.max(760, visibleColumns.length * 132 + 72)}px` }}
        >
          <thead>
            <tr>
              {visibleColumns.map((f) => (
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
                <td className="bases-empty-row" colSpan={visibleColumns.length + 1}>
                  {activeView !== null
                    ? "当前视图条件下没有记录——回「全部记录」或改视图口径再看。"
                    : query.filterFieldId !== ""
                      ? "当前筛选条件下没有记录——换个筛选值或选「（不筛选）」看全部。"
                      : "这张表还没有行——点右上角「＋ 新增行」加第一行，点单元格即可按类型编辑。"}
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={r.id} data-record-id={r.id}>
                  {visibleColumns.map((f) => {
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
        视图口径：筛选条件之间是「且」；隐藏列只影响显示，不改数据。
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

      {viewDraft !== null && (
        <ViewEditor
          draft={viewDraft}
          fields={fields}
          busy={busy}
          error={viewError}
          onChange={setViewDraft}
          onClose={() => setViewDraft(null)}
          onSave={() => void saveView()}
          onDelete={() => void deleteView()}
        />
      )}

      {importOpen && (
        <ImportDialog
          text={importText}
          preview={importPreview}
          error={importError}
          busy={importBusy}
          tableName={table?.name ?? "当前表"}
          onText={setImportText}
          onPreview={() => void runImportPreview()}
          onConfirm={() => void confirmImport()}
          onClose={() => {
            setImportOpen(false);
            setImportPreview(null);
            setImportError(null);
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

/** 视图编辑面板（r7）：筛选条件 / 排序规则 / 隐藏列 */
function ViewEditor({
  draft,
  fields,
  busy,
  error,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  draft: ViewDraft;
  fields: TableField[];
  busy: boolean;
  error: string | null;
  onChange: (draft: ViewDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const fieldOf = (id: string): TableField | undefined => fields.find((f) => String(f.id) === id);
  return (
    <div className="modal-backdrop" data-state="bases-view-editor">
      <div className="modal-card bases-view-card" role="dialog" aria-label="视图编辑">
        <h2>{draft.id === null ? "新建视图" : "编辑视图"}</h2>
        <p className="hint">
          视图保存的是「筛选 / 排序 / 隐藏列」三样口径——切到视图即可按保存的口径看数据。
        </p>
        <label className="field">
          <span className="field-label">视图名称（必填）</span>
          <input
            type="text"
            data-state="bases-view-name"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="例：进行中的大额项目"
          />
        </label>

        <div className="bases-view-block">
          <div className="bases-view-block-head">
            <span className="field-label">筛选条件（多个条件之间是「且」）</span>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              data-state="bases-view-add-filter"
              onClick={() =>
                onChange({
                  ...draft,
                  filters: [...draft.filters, { fieldId: fields[0] ? String(fields[0].id) : "", value: "" }],
                })
              }
            >
              ＋ 添加条件
            </button>
          </div>
          {draft.filters.length === 0 && <p className="hint">未设筛选条件（显示全部记录）。</p>}
          {draft.filters.map((cond, idx) => {
            const field = fieldOf(cond.fieldId);
            return (
              <div className="bases-view-row" key={`filter-${idx}`}>
                <select
                  data-state="bases-view-filter-field"
                  value={cond.fieldId}
                  onChange={(e) => {
                    const next = [...draft.filters];
                    next[idx] = { ...cond, fieldId: e.target.value };
                    onChange({ ...draft, filters: next });
                  }}
                >
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                {field?.type === "select" ? (
                  <select
                    data-state="bases-view-filter-value"
                    value={cond.value}
                    onChange={(e) => {
                      const next = [...draft.filters];
                      next[idx] = { ...cond, value: e.target.value };
                      onChange({ ...draft, filters: next });
                    }}
                  >
                    <option value="">（空）</option>
                    {field.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    data-state="bases-view-filter-value"
                    value={cond.value}
                    placeholder={`按「${field?.name ?? "字段"}」筛选的值`}
                    onChange={(e) => {
                      const next = [...draft.filters];
                      next[idx] = { ...cond, value: e.target.value };
                      onChange({ ...draft, filters: next });
                    }}
                  />
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() =>
                    onChange({ ...draft, filters: draft.filters.filter((_, i) => i !== idx) })
                  }
                >
                  移除
                </button>
              </div>
            );
          })}
        </div>

        <div className="bases-view-block">
          <div className="bases-view-block-head">
            <span className="field-label">排序规则（按顺序生效，空值恒排最后）</span>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              data-state="bases-view-add-sort"
              onClick={() =>
                onChange({
                  ...draft,
                  sorts: [...draft.sorts, { fieldId: fields[0] ? String(fields[0].id) : "", direction: "asc" }],
                })
              }
            >
              ＋ 添加排序
            </button>
          </div>
          {draft.sorts.length === 0 && <p className="hint">未设排序（按记录的原始顺序）。</p>}
          {draft.sorts.map((rule, idx) => (
            <div className="bases-view-row" key={`sort-${idx}`}>
              <select
                data-state="bases-view-sort-field"
                value={rule.fieldId}
                onChange={(e) => {
                  const next = [...draft.sorts];
                  next[idx] = { ...rule, fieldId: e.target.value };
                  onChange({ ...draft, sorts: next });
                }}
              >
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <select
                data-state="bases-view-sort-direction"
                value={rule.direction}
                onChange={(e) => {
                  const next = [...draft.sorts];
                  next[idx] = { ...rule, direction: e.target.value as "asc" | "desc" };
                  onChange({ ...draft, sorts: next });
                }}
              >
                <option value="asc">升序</option>
                <option value="desc">降序</option>
              </select>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => onChange({ ...draft, sorts: draft.sorts.filter((_, i) => i !== idx) })}
              >
                移除
              </button>
            </div>
          ))}
        </div>

        <div className="bases-view-block">
          <span className="field-label">显示哪些列（不勾 = 隐藏该列）</span>
          <div className="bases-view-columns" data-state="bases-view-columns">
            {fields.map((f) => {
              const hidden = draft.hidden.includes(f.id);
              return (
                <label key={f.id} className="bases-view-column">
                  <input
                    type="checkbox"
                    data-state="bases-view-column-toggle"
                    checked={!hidden}
                    onChange={(e) =>
                      onChange({
                        ...draft,
                        hidden: e.target.checked
                          ? draft.hidden.filter((id) => id !== f.id)
                          : [...draft.hidden, f.id],
                      })
                    }
                  />
                  <span>{f.name}</span>
                  <span className="bases-col-type">{FIELD_TYPE_LABELS[f.type]}</span>
                </label>
              );
            })}
          </div>
        </div>

        {error && (
          <p className="error-message" role="alert" data-state="bases-view-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {draft.id !== null && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onDelete}>
              删除视图
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-state="bases-view-save"
            disabled={busy || draft.name.trim() === ""}
            onClick={onSave}
          >
            保存视图
          </button>
        </div>
      </div>
    </div>
  );
}

/** CSV 导入对话框（r7）：预览前 5 行 + 错误行清单 + 确认导入 */
function ImportDialog({
  text,
  preview,
  error,
  busy,
  tableName,
  onText,
  onPreview,
  onConfirm,
  onClose,
}: {
  text: string;
  preview: ImportPreview | null;
  error: string | null;
  busy: boolean;
  tableName: string;
  onText: (value: string) => void;
  onPreview: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" data-state="bases-import-dialog">
      <div className="modal-card bases-import-card" role="dialog" aria-label="导入 CSV">
        <h2>导入 CSV</h2>
        <p className="hint">
          第一行是表头（列名 = 字段名）。逐行按字段类型归一与校验；<strong>任一行不合法就一行都不落库</strong>
          （全成功或全不落，没有半截数据）。
          <br />
          行号口径：错误清单按<strong>数据行</strong>编号（表头不占号），即「第 N 条数据 = CSV 第 N+1 行」；预览表首列即数据行号。
        </p>
        <textarea
          className="bases-import-text"
          data-state="bases-import-text"
          rows={7}
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="名称,状态,负责人,金额,截止日期,标签,完成,链接"
        />
        {error && (
          <p className="error-message" role="alert" data-state="bases-import-error">
            {error}
          </p>
        )}
        {preview && (
          <div className="bases-import-preview" data-state="bases-import-preview">
            <p className="hint">
              共 {preview.total} 行数据 · 预览前 {preview.preview.length} 行
              {preview.errors.length > 0
                ? ` · ${preview.errors.length} 行不合法`
                : " · 全部行合法"}
            </p>
            <div className="bases-import-table-wrap">
              <table className="bases-import-table">
                <thead>
                  <tr>
                    <th>数据行号</th>
                    {preview.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, idx) => (
                    <tr key={`preview-${idx}`}>
                      <td>第 {idx + 1} 条</td>
                      {row.map((cell, cidx) => (
                        <td key={`cell-${idx}-${cidx}`}>{cell === "" ? "—" : cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.errors.length > 0 && (
              <ul className="bases-import-errors" data-state="bases-import-errors">
                {preview.errors.map((e) => (
                  <li key={`err-${e.row}`}>
                    第 {e.row} 条数据（CSV 第 {e.row + 1} 行）：{e.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {/* r7 UI 记账 U2-4 修复：把成功侧后果提前到决策点（追加 N 行 / 不可撤销） */}
        <p className="hint bases-import-consequence" data-state="bases-import-consequence">
          确认导入将向「{tableName}」追加
          {preview ? ` ${preview.total} 行` : "本次 CSV 的数据行"}，
          导入后<strong>不可撤销</strong>；
          {preview && preview.errors.length > 0
            ? `当前有 ${preview.errors.length} 行不合法，确认后服务端会整体拒绝（零半态）。`
            : "任一行不合法则一行都不落库。"}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            data-state="bases-import-preview-button"
            disabled={busy}
            onClick={onPreview}
          >
            预览
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-state="bases-import-confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            确认导入
          </button>
        </div>
      </div>
    </div>
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
      apiFetch(`/api/tables/${tableId}/fields`, {
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
                    apiFetch(`/api/fields/${f.id}`, {
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
                    apiFetch(`/api/fields/${f.id}`, {
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
                      apiFetch(`/api/fields/${f.id}`, {
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
                  void call(async () => apiFetch(`/api/fields/${f.id}`, { method: "DELETE" }))
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
