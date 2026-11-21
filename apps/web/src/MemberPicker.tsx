// 协流 XieFlow — r24「从通讯录选人」共享弹窗（审批申请人/审批人/转交目标/物资保管员/出入库操作人）
// 只做视图装配：搜索/部门名解析全走 api + @xieflow/shared/org 的 memberSummary/memberDisplayName；
// 选中后回填 member_id + 姓名，原自由文本输入框保留且仍可独立使用（向后兼容硬要求）。
import { useCallback, useEffect, useState } from "react";
import type { Department, Member, MemberSummary } from "@xieflow/shared/org";
import { memberDisplayName, memberSummary } from "@xieflow/shared/org";
import { apiFetch, fetchJsonOrThrow, SERVICE_DOWN_MESSAGE } from "./httpClient";

export type { MemberSummary as PickedMember } from "@xieflow/shared/org";

interface MemberPickerProps {
  readonly label: string;
  readonly member: MemberSummary | null;
  readonly onPick: (member: MemberSummary) => void;
  readonly onClear: () => void;
  /** 稳定 seam 前缀，例如 approval-assignee；截图与 e2e 用 */
  readonly seam: string;
  /** 钉态数据（截图用，不请求 api） */
  readonly pinned?: readonly MemberSummary[];
  readonly openOnInit?: boolean;
}

async function getJson<T>(url: string): Promise<T> {
  return (await fetchJsonOrThrow(await apiFetch(url))) as T;
}

/** 通讯录成员搜索选择器：保留自由文本，member_id 是纯增量字段 */
export default function MemberPicker({
  label, member, onPick, onClear, seam, pinned, openOnInit = false,
}: MemberPickerProps) {
  const [open, setOpen] = useState(openOnInit);
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState<number | null>(null);
  const [departments, setDepartments] = useState<readonly Department[]>([]);
  const [allResults, setAllResults] = useState<readonly MemberSummary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const visible = useCallback((rows: readonly MemberSummary[]) =>
    deptFilter === null ? rows : rows.filter((m) => m.departmentId === deptFilter), [deptFilter]);

  const search = useCallback(async (q: string) => {
    if (pinned) {
      const needle = q.trim().toLowerCase();
      setDepartments([...new Map(pinned.map((m) => [m.departmentId, {
        id: m.departmentId ?? 0, name: m.departmentName ?? "未分配部门", parentId: null, sortOrder: 0, createdAt: "",
      }])).values()].filter((d) => d.id > 0));
      setAllResults(pinned.filter((m) =>
        m.name.toLowerCase().includes(needle) || (m.departmentName ?? "").toLowerCase().includes(needle),
      ));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const [found, tree] = await Promise.all([
        getJson<{ members: Member[] }>(`/api/members/search?q=${encodeURIComponent(q)}`),
        getJson<{ departments: Department[] }>("/api/org/tree"),
      ]);
      setDepartments(tree.departments);
      setAllResults(found.members.map((m) => memberSummary(m, tree.departments)));
    } catch (err) {
      setError(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
      setAllResults([]);
    } finally {
      setBusy(false);
    }
  }, [pinned, visible]);

  const results = visible(allResults);

  useEffect(() => {
    if (open) void search(query);
    // 打开时拉一次；后续由搜索按钮/回车驱动，避免每次输入都发请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!pinned) return;
    const tree = [...new Map(pinned.map((m) => [m.departmentId, {
      id: m.departmentId ?? 0, name: m.departmentName ?? "未分配部门", parentId: null, sortOrder: 0, createdAt: "",
    }])).values()];
    setDepartments(tree.filter((d) => d.id > 0));
  }, [pinned]);

  return (
    <span className="mp-root" data-state={`${seam}-picker`}>
      <button
        type="button"
        className="btn mp-open"
        data-action={`${seam}-pick-open`}
        onClick={() => setOpen(true)}
      >从通讯录选人</button>
      {member !== null && (
        <span className="mp-chosen" data-state={`${seam}-chosen`}>
          {memberDisplayName(member)}
          <button type="button" className="mp-clear" data-action={`${seam}-pick-clear`} onClick={() => { onClear(); setOpen(false); }} title="解除通讯录关联">×</button>
        </span>
      )}
      {member !== null && (
        <span className="mp-chosen-hint" data-state={`${seam}-chosen-hint`}>
          已关联通讯录：手改上方姓名仅作备忘，提交仍以通讯录成员为准；点 × 解除关联。
        </span>
      )}
      {open && (
        <span className="mp-modal" data-state="member-picker" role="dialog" aria-modal="true" aria-label={`${label} — 从通讯录选人`}>
          <span className="mp-head">
            <strong>选择{label}</strong>
            <button type="button" className="mp-close" data-action={`${seam}-pick-close`} onClick={() => setOpen(false)}>关闭</button>
          </span>
          <span className="mp-search">
            <input
              aria-label={`搜索${label}`}
              data-action={`${seam}-pick-search`}
              placeholder="搜索姓名 / 邮箱 / 职位"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void search(query); }}
            />
            <button type="button" className="btn" data-action={`${seam}-pick-search-run`} onClick={() => void search(query)}>搜索</button>
          </span>
          <span className="mp-filter">
            <label htmlFor={`${seam}-dept`}>部门筛选</label>
            <select
              id={`${seam}-dept`}
              className="mp-dept-filter"
              data-action={`${seam}-pick-dept`}
              value={deptFilter ?? ""}
              onChange={(e) => {
                setDeptFilter(e.target.value === "" ? null : Number(e.target.value));
              }}
            >
              <option value="">全部部门</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <small>{deptFilter === null ? "不限部门" : `仅看 ${departments.find((d) => d.id === deptFilter)?.name ?? "该部门"}`}</small>
          </span>
          {error !== "" && <span className="mp-error" data-state="member-picker-error">{error}</span>}
          {busy && <span className="mp-empty">正在读取通讯录…</span>}
          {!busy && results.length === 0 && <span className="mp-empty" data-state="member-picker-empty">没有匹配的同事——可关闭后继续用手填姓名。</span>}
          {!busy && results.length > 0 && (
            <span className="mp-list" data-state="member-picker-results">
              {results.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className="mp-item"
                  data-member-id={m.id}
                  data-state="member-picker-item"
                  onClick={() => { onPick(m); setOpen(false); }}
                >
                  <strong>{m.name}</strong>
                  <small>{m.departmentName ?? "未分配部门"} · {m.title || m.status}</small>
                </button>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
