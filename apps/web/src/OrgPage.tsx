// 协流 XieFlow — r23「组织」tab：左侧部门树（展开/折叠）+ 右侧人员卡片 + 新建/编辑表单 + 搜索
// 数据全走真实 api（departments / members CRUD + move + /api/org/tree）；
// 树装配 / 人员模糊搜索 / 状态标签全在 shared/org，本页零算法分支。
// 截图钉态：?page=org&shot=org-empty|org-tree|org-list|org-form|org-search|org-error；?narrow=1 钉窄屏。
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import type { Department, Member, MemberStatus } from "@xieflow/shared/org";
import {
  MEMBER_STATUSES,
  MEMBER_STATUS_LABELS,
  buildDepartmentTree,
  searchMembers,
} from "@xieflow/shared/org";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

interface OrgQuery {
  readonly shot: string;
  readonly departmentId: string;
  readonly memberId: string; // r33 deep-link：全局搜索成员结果定位
}

type Phase = "loading" | "error" | "ready";

type FormKind = "department" | "member";
interface FormState {
  kind: FormKind;
  editingId: number | null;
  name: string;
  email: string;
  departmentId: string;
  role: string;
  phone: string;
  title: string;
  status: MemberStatus;
  parentId: string;
  sortOrder: string;
}

const PINNED = new Set(["org-empty", "org-error", "org-tree", "org-list", "org-form", "org-search"]);

const EMPTY_FORM: FormState = {
  kind: "department", editingId: null, name: "", email: "", departmentId: "",
  role: "member", phone: "", title: "", status: "active", parentId: "", sortOrder: "0",
};

/** 截图钉态示例数据：真实 CRUD 由 e2e/audit 锁定；此处只钉画面形态（与 r16 审批钉态同款） */
const SHOT_DEPARTMENTS: Department[] = [
  { id: 1, name: "集团总部", parentId: null, sortOrder: 0, createdAt: "2026-11-19T09:00:00.000Z" },
  { id: 2, name: "研发中心", parentId: 1, sortOrder: 1, createdAt: "2026-11-19T09:01:00.000Z" },
  { id: 3, name: "前端组", parentId: 2, sortOrder: 2, createdAt: "2026-11-19T09:02:00.000Z" },
  { id: 4, name: "后端组", parentId: 2, sortOrder: 3, createdAt: "2026-11-19T09:03:00.000Z" },
  { id: 5, name: "市场部", parentId: 1, sortOrder: 4, createdAt: "2026-11-19T09:04:00.000Z" },
];
const SHOT_MEMBERS: Member[] = [
  { id: 1, name: "张伟", departmentId: 3, role: "engineer", email: "zhangwei@example.com", phone: "13800000001", title: "Frontend Engineer", status: "active", userId: null },
  { id: 2, name: "李娜", departmentId: 2, role: "manager", email: "LiNa@Example.COM", phone: "13800000002", title: "Engineering Manager", status: "active", userId: null },
  { id: 3, name: "王强", departmentId: 4, role: "engineer", email: "wangqiang@example.com", phone: "13800000003", title: "Backend Engineer", status: "active", userId: null },
  { id: 4, name: "赵敏", departmentId: 5, role: "staff", email: "zhaomin@example.com", phone: "13800000004", title: "市场经理", status: "inactive", userId: null },
];

function readQuery(): OrgQuery {
  const p = new URLSearchParams(window.location.search);
  return { shot: p.get("shot") ?? "", departmentId: p.get("departmentId") ?? "", memberId: p.get("memberId") ?? "" };
}

async function getJson<T>(url: string): Promise<T> {
  return (await fetchJsonOrThrow(await apiFetch(url))) as T;
}

async function sendJson(url: string, method: "POST" | "PATCH", body: unknown): Promise<unknown> {
  return fetchJsonOrThrow(await apiFetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

/** 部门树节点递归渲染：展开/折叠 + 选中过滤（树结构来自 shared buildDepartmentTree） */
function DeptBranch(props: {
  node: ReturnType<typeof buildDepartmentTree>[number];
  selected: number | null;
  expanded: Set<number>;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onEdit: (dept: Department) => void;
}): ReactElement {
  const { node, selected, expanded, onSelect, onToggle, onEdit } = props;
  const open = expanded.has(node.id);
  return (
    <li className="org-dept-item" data-dept-id={node.id}>
      <div className={`org-dept-row ${selected === node.id ? "org-dept-selected" : ""}`}>
        <button
          type="button"
          className="org-dept-toggle"
          aria-label={open ? "折叠部门" : "展开部门"}
          onClick={() => onToggle(node.id)}
          disabled={node.children.length === 0}
        >{node.children.length === 0 ? "·" : open ? "▾" : "▸"}</button>
        <button type="button" className="org-dept-name" onClick={() => onSelect(node.id)}>
          {node.name}
          <span className="org-dept-id">#{node.id}</span>
        </button>
        <button type="button" className="org-dept-edit" onClick={() => onEdit(node)}>编辑</button>
      </div>
      {open && node.children.length > 0 && (
        <ul className="org-dept-children">
          {node.children.map((child) => (
            <DeptBranch
              key={child.id}
              node={child}
              selected={selected}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
              onEdit={onEdit}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function OrgPage() {
  const [query] = useState<OrgQuery>(readQuery);
  const [phase, setPhase] = useState<Phase>(() => {
    if (query.shot === "org-error") return "error";
    return query.shot === "org-tree" || query.shot === "org-list" || query.shot === "org-form" || query.shot === "org-search"
      ? "ready"
      : "loading";
  });
  const [error, setError] = useState(query.shot === "org-error" ? SERVICE_DOWN_MESSAGE : "");
  const [departments, setDepartments] = useState<Department[]>(() => {
    if (PINNED.has(query.shot) && query.shot !== "org-empty" && query.shot !== "org-error") return SHOT_DEPARTMENTS;
    return [];
  });
  const [members, setMembers] = useState<Member[]>(() => {
    if (PINNED.has(query.shot) && query.shot !== "org-empty" && query.shot !== "org-error") return SHOT_MEMBERS;
    return [];
  });
  const [selected, setSelected] = useState<number | null>(() => Number(query.departmentId) || null);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(query.shot === "org-tree" || query.shot === "org-form" ? [1, 2, 3, 4, 5] : [1]));
  const [search, setSearch] = useState(query.shot === "org-search" ? "engineer" : "");
  const [form, setForm] = useState<FormState | null>(query.shot === "org-form" ? { ...EMPTY_FORM, kind: "member" } : null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getJson<{ departments: Department[]; members: Member[] }>("/api/org/tree");
      setDepartments(data.departments);
      setMembers(data.members);
      setPhase("ready");
      setError("");
      return data;
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("narrow") === "1") {
      document.documentElement.classList.add("force-narrow");
    }
    if (query.shot === "org-empty") {
      setPhase("ready");
      return;
    }
    if (PINNED.has(query.shot)) return;
    void refresh();
  }, [query.shot, refresh]);

  const tree = useMemo(() => buildDepartmentTree(departments), [departments]);
  const deptName = useCallback(
    (id: number | null) => (id === null ? "未分配部门" : (departments.find((d) => d.id === id)?.name ?? `部门 #${id}`)),
    [departments],
  );
  const scoped = useMemo(
    () => (selected === null ? members : members.filter((m) => m.departmentId === selected)),
    [members, selected],
  );
  const visible = useMemo(() => searchMembers(scoped, search), [scoped, search]);

  function toggleDept(id: number): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openForm(kind: FormKind, dept?: Department, member?: Member): void {
    setForm({
      ...EMPTY_FORM,
      kind,
      editingId: dept?.id ?? member?.id ?? null,
      name: dept?.name ?? member?.name ?? "",
      email: member?.email ?? "",
      departmentId: member?.departmentId === null || member?.departmentId === undefined ? "" : String(member.departmentId),
      role: member?.role ?? "member",
      phone: member?.phone ?? "",
      title: member?.title ?? "",
      status: member?.status ?? "active",
      parentId: dept?.parentId === null || dept?.parentId === undefined ? "" : String(dept.parentId),
      sortOrder: dept ? String(dept.sortOrder) : "0",
    });
    setNotice("");
  }

  async function submitForm(): Promise<void> {
    if (!form) return;
    setBusy(true);
    setNotice("");
    try {
      if (form.kind === "department") {
        const body = { name: form.name, parentId: form.parentId === "" ? null : form.parentId, sortOrder: form.sortOrder };
        if (form.editingId === null) await sendJson("/api/departments", "POST", body);
        else await sendJson(`/api/departments/${form.editingId}`, "PATCH", body);
      } else {
        const body = {
          name: form.name, email: form.email,
          departmentId: form.departmentId === "" ? null : form.departmentId,
          role: form.role, phone: form.phone, title: form.title, status: form.status,
        };
        if (form.editingId === null) await sendJson("/api/members", "POST", body);
        else await sendJson(`/api/members/${form.editingId}`, "PATCH", body);
      }
      setForm(null);
      setNotice(form.editingId === null ? "已新建，数据已落库" : "已保存修改");
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(id: number): Promise<void> {
    setBusy(true);
    try {
      await fetchJsonOrThrow(await apiFetch(`/api/members/${id}`, { method: "DELETE" }));
      setNotice(`已删除人员 #${id}`);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function moveSelected(parentId: number | null): Promise<void> {
    if (selected === null) return;
    setBusy(true);
    try {
      await sendJson(`/api/departments/${selected}/move`, "POST", { parentId });
      setNotice("部门已移动");
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const pinNoteMap: Record<string, string> = {
    "org-empty": "截图钉注：组织目录空态（无部门、无人员）。",
    "org-tree": "截图钉注：三级部门树全部展开的示例数据。",
    "org-list": "截图钉注：人员卡片列表（示例数据）。",
    "org-form": "截图钉注：新建人员表单（示例部门下拉）。",
    "org-search": "截图钉注：按职位 engineer 模糊搜索结果（示例数据）。",
    "org-error": "截图钉注：服务未启动的错误态。",
  };
  const pinNote = pinNoteMap[query.shot] ?? "";

  return (
    <section className="org-page" data-state="org-page">
      <div className="org-head">
        <div>
          <h2>组织架构与通讯录</h2>
          <p className="org-sub">左侧部门树可展开折叠；右侧人员卡片支持按部门筛选与姓名 / 邮箱 / 职位搜索。</p>
        </div>
        <div className="org-actions">
          <button type="button" className="org-btn" onClick={() => openForm("department")}>＋ 新建部门</button>
          <button type="button" className="org-btn org-btn-primary" onClick={() => openForm("member")}>＋ 新建人员</button>
        </div>
      </div>
      {pinNote !== "" && <p className="org-pin" data-state="org-pin">{pinNote}</p>}
      {notice !== "" && <p className="org-notice" role="status">{notice}</p>}

      {phase === "loading" && <p className="org-loading" data-state="org-loading">正在加载组织目录…</p>}
      {phase === "error" && (
        <div className="org-error" data-state="org-error" role="alert">
          <h3>组织目录暂时不可用</h3>
          <p>{error}</p>
          <button type="button" className="org-btn" onClick={() => void refresh()}>重试</button>
        </div>
      )}

      {phase === "ready" && (
        <div className="org-columns">
          <aside className="org-tree-panel" data-state="org-tree">
            <div className="org-panel-head">
              <h3>部门树</h3>
              <button type="button" className="org-link" onClick={() => setSelected(null)}>全部人员</button>
            </div>
            {departments.length === 0 ? (
              <p className="org-empty" data-state="org-empty">还没有部门——点「新建部门」开始搭建组织。</p>
            ) : (
              <ul className="org-dept-root">
                {tree.map((node) => (
                  <DeptBranch
                    key={node.id}
                    node={node}
                    selected={selected}
                    expanded={expanded}
                    onSelect={setSelected}
                    onToggle={toggleDept}
                    onEdit={(d) => openForm("department", d)}
                  />
                ))}
              </ul>
            )}
            {selected !== null && (
              <div className="org-move" data-state="org-move">
                <label>移动「{deptName(selected)}」到
                  <select value="" disabled={busy} onChange={(e) => void moveSelected(
                    e.target.value === "" || e.target.value === "none" ? null : Number(e.target.value),
                  )}>
                    <option value="">选择新父部门…</option>
                    {departments.filter((d) => d.id !== selected).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                    <option value="none">（设为根部门）</option>
                  </select>
                </label>
              </div>
            )}
          </aside>

          <div className="org-people-panel">
            <div className="org-panel-head">
              <h3>{selected === null ? "全部人员" : deptName(selected)} · {visible.length} 人</h3>
              <input
                className="org-search"
                data-state="org-search"
                type="search"
                value={search}
                placeholder="搜索姓名 / 邮箱 / 职位"
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {visible.length === 0 ? (
              <p className="org-empty" data-state="org-people-empty">
                {members.length === 0 ? "通讯录还是空的——点「新建人员」添加第一位同事。" : "没有匹配的人员，换个关键词试试。"}
              </p>
            ) : (
              <div className="org-cards" data-state="org-members">
                {visible.map((m) => (
                  <article className={`org-card${query.memberId !== "" && Number(query.memberId) === m.id ? " org-card-located" : ""}`} key={m.id} data-member-id={m.id} data-state={query.memberId !== "" && Number(query.memberId) === m.id ? "org-card-located" : "org-card"}>
                    <div className="org-card-head">
                      <strong>{m.name}</strong>
                      <span className={`org-status ${m.status === "active" ? "org-status-on" : ""}`}>
                        {MEMBER_STATUS_LABELS[m.status]}
                      </span>
                    </div>
                    <p className="org-card-title">{m.title || "—"}</p>
                    <dl>
                      <dt>部门</dt><dd>{deptName(m.departmentId)}</dd>
                      <dt>角色</dt><dd>{m.role}</dd>
                      <dt>邮箱</dt><dd>{m.email}</dd>
                      <dt>电话</dt><dd>{m.phone || "—"}</dd>
                    </dl>
                    <div className="org-card-actions">
                      <button type="button" className="org-link" onClick={() => openForm("member", undefined, m)}>编辑</button>
                      <button type="button" className="org-link org-link-danger" disabled={busy} onClick={() => void removeMember(m.id)}>删除</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {form !== null && (
        <div className="org-modal" data-state="org-form" role="dialog" aria-label={form.kind === "department" ? "部门表单" : "人员表单"}>
          <div className="org-modal-card">
            <h3>{form.editingId === null ? "新建" : "编辑"}{form.kind === "department" ? "部门" : "人员"}</h3>
            <label>名称<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            {form.kind === "department" ? (
              <>
                <label>父部门
                  <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                    <option value="">（根部门）</option>
                    {departments.filter((d) => d.id !== form.editingId).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </label>
                <label>排序值<input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></label>
              </>
            ) : (
              <>
                <label>邮箱<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                <label>部门
                  <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                    <option value="">（未分配）</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
                <label>角色<input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></label>
                <label>职位<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
                <label>电话<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                <label>状态
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as MemberStatus })}>
                    {MEMBER_STATUSES.map((s) => <option key={s} value={s}>{MEMBER_STATUS_LABELS[s]}</option>)}
                  </select>
                </label>
              </>
            )}
            <div className="org-modal-actions">
              <button type="button" className="org-btn" onClick={() => setForm(null)}>取消</button>
              <button type="button" className="org-btn org-btn-primary" disabled={busy} onClick={() => void submitForm()}>保存</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
