// 协流 XieFlow — shared/org.ts：组织架构与通讯录唯一口径（r23 · M10 后功能补强）
// 规则集中：部门树装配（层级/环检测/孤儿）、部门移动守卫、人员字段与邮箱归一、
// 姓名/邮箱/职位大小写不敏感模糊搜索。api / web / db 只装配，零算法分支。
// 本文件为 @xieflow/shared/org 子路径导出；纯 TS 无 Node 依赖，浏览器可直接导入。
import { ValidationError } from "./index.js";

/** 人员状态机（唯一枚举，api CHECK / web 徽标共用） */
export const MEMBER_STATUSES = ["active", "inactive"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];
export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active: "在职",
  inactive: "离职",
};

export function isMemberStatus(value: unknown): value is MemberStatus {
  return typeof value === "string" && (MEMBER_STATUSES as readonly string[]).includes(value);
}

/** 字段长度上限（前后端共用同一把尺） */
export const MAX_DEPARTMENT_NAME = 60;
export const MAX_MEMBER_NAME = 60;
export const MAX_MEMBER_EMAIL = 160;
export const MAX_MEMBER_PHONE = 30;
export const MAX_MEMBER_TITLE = 80;
export const MAX_MEMBER_ROLE = 40;

/** 部门（schema v16 departments 表 camelCase 契约） */
export interface Department {
  readonly id: number;
  readonly name: string;
  readonly parentId: number | null;
  readonly sortOrder: number;
  readonly createdAt: string;
}

/** 部门树节点：children 由 buildDepartmentTree 装配，不落库 */
export interface DepartmentTreeNode extends Department {
  children: DepartmentTreeNode[];
}

/** 人员（schema v16 members 表 camelCase 契约；userId 可空关联 users.id） */
export interface Member {
  readonly id: number;
  readonly name: string;
  readonly departmentId: number | null;
  readonly role: string;
  readonly email: string;
  readonly phone: string;
  readonly title: string;
  readonly status: MemberStatus;
  readonly userId: number | null;
}

/** 组织树节点：部门带直属人员，children 递归 */
export interface OrgTreeNode {
  readonly department: Department;
  readonly members: Member[];
  readonly children: OrgTreeNode[];
}

export interface DepartmentInput {
  readonly name: unknown;
  readonly parentId?: unknown;
  readonly sortOrder?: unknown;
}

export interface MemberInput {
  readonly name: unknown;
  readonly email: unknown;
  readonly departmentId?: unknown;
  readonly role?: unknown;
  readonly phone?: unknown;
  readonly title?: unknown;
  readonly status?: unknown;
  readonly userId?: unknown;
}

/** 部门名守卫：非 blank 字符串且不超上限 */
export function assertValidDepartmentName(name: unknown): asserts name is string {
  if (typeof name !== "string") throw new ValidationError("部门名称必须是字符串");
  const trimmed = name.trim();
  if (trimmed === "") throw new ValidationError("部门名称不能为空");
  if (trimmed.length > MAX_DEPARTMENT_NAME) {
    throw new ValidationError(`部门名称不能超过 ${MAX_DEPARTMENT_NAME} 字`);
  }
}

/** 可空正整数 id（部门 parent / 人员 department / 关联 user 共用守卫） */
function nullableId(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
    throw new ValidationError(`非法${label}：${String(value)}`);
  }
  return n;
}

/** 部门写入前归一（api / db 共用，零字段默认值分歧） */
export function normalizeDepartment(input: DepartmentInput): {
  name: string;
  parentId: number | null;
  sortOrder: number;
} {
  assertValidDepartmentName(input.name);
  const parentId = nullableId(input.parentId, "父部门 id");
  let sortOrder = 0;
  if (input.sortOrder !== undefined && input.sortOrder !== null) {
    const n = typeof input.sortOrder === "string" && input.sortOrder.trim() !== ""
      ? Number(input.sortOrder)
      : input.sortOrder;
    if (typeof n !== "number" || !Number.isInteger(n)) {
      throw new ValidationError(`非法排序值：${String(input.sortOrder)}`);
    }
    sortOrder = n;
  }
  return { name: input.name.trim(), parentId, sortOrder };
}

/** 重名检测：忽略首尾空白与大小写，返回既有部门 id（无重名返回 null） */
export function findDuplicateDepartmentName(name: string, depts: readonly Department[]): number | null {
  const key = name.trim().toLowerCase();
  if (key === "") return null;
  for (const d of depts) {
    if (d.name.trim().toLowerCase() === key) return d.id;
  }
  return null;
}

/** 孤儿部门：parent_id 非空但指向不存在的部门（buildDepartmentTree 按根处理不丢数据） */
export function findOrphanDepartmentIds(depts: readonly Department[]): number[] {
  const ids = new Set(depts.map((d) => d.id));
  return depts.filter((d) => d.parentId !== null && !ids.has(d.parentId)).map((d) => d.id).sort((a, b) => a - b);
}

/**
 * 部门树装配唯一规则：parent_id 可空、指向不存在的父按根处理（孤儿不丢）；
 * 环（A→B→A）与自环抛错防止无限递归；同级按 sortOrder 再按 id 排序保证确定性。
 */
export function buildDepartmentTree(depts: readonly Department[]): DepartmentTreeNode[] {
  const byId = new Map<number, DepartmentTreeNode>();
  for (const d of depts) byId.set(d.id, { ...d, children: [] });
  const roots: DepartmentTreeNode[] = [];
  for (const d of depts) {
    const node = byId.get(d.id)!;
    if (d.parentId === null || !byId.has(d.parentId)) {
      roots.push(node);
      continue;
    }
    // 环检测：沿 parent 链向上走，回到已见节点即抛错（含自环 A→A）
    const seen = new Set<number>([d.id]);
    let cursor: number | null = d.parentId;
    while (cursor !== null) {
      if (seen.has(cursor)) throw new ValidationError(`部门树存在环路：部门 ${d.id}`);
      seen.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    byId.get(d.parentId)!.children.push(node);
  }
  const sortNodes = (nodes: DepartmentTreeNode[]): DepartmentTreeNode[] => {
    nodes.sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.id - b.id));
    for (const n of nodes) n.children = sortNodes(n.children);
    return nodes;
  };
  return sortNodes(roots);
}

/** 移动守卫（防自挂 / 防成环 / 防不存在）：tree 可传平铺部门或已装配的树节点 */
export function validateDepartmentMove(
  id: number,
  parentId: number | null,
  tree: readonly (Department | DepartmentTreeNode)[],
): void {
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError(`非法源部门 id：${String(id)}`);
  if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) {
    throw new ValidationError(`非法目标父部门 id：${String(parentId)}`);
  }
  if (parentId === id) throw new ValidationError(`部门不能挂到自身：${id}`);
  const byId = new Map<number, Department | DepartmentTreeNode>();
  for (const node of tree) byId.set(node.id, node);
  if (!byId.has(id)) throw new ValidationError(`源部门不存在：${id}`);
  if (parentId !== null && !byId.has(parentId)) throw new ValidationError(`目标父部门不存在：${parentId}`);
  // 沿目标父的祖先链上行，遇到 id 即会成环
  let cursor: number | null = parentId;
  const seen = new Set<number>();
  while (cursor !== null) {
    if (cursor === id) throw new ValidationError(`移动会形成环：部门 ${id} 挂到自己的后代 ${parentId}`);
    if (seen.has(cursor)) throw new ValidationError(`原树已存在环路：部门 ${cursor}`);
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
}

/** 邮箱格式守卫（简单且够用：本地部分@域名.顶级域，不含空白） */
export function isValidMemberEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= MAX_MEMBER_EMAIL;
}

function trimmedText(value: unknown, label: string, max: number, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new ValidationError(`${label}必须是字符串`);
  const text = value.trim();
  if (text.length > max) throw new ValidationError(`${label}不能超过 ${max} 字`);
  return text;
}

/** 人员写入前归一（字段校验/邮箱格式/状态枚举/可空关联，全部唯一口径） */
export function normalizeMember(input: MemberInput): Omit<Member, "id"> {
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new ValidationError("人员姓名不能为空");
  }
  if (input.name.trim().length > MAX_MEMBER_NAME) {
    throw new ValidationError(`人员姓名不能超过 ${MAX_MEMBER_NAME} 字`);
  }
  if (!isValidMemberEmail(input.email)) throw new ValidationError(`非法邮箱：${String(input.email)}`);
  const status = input.status === undefined || input.status === null ? "active" : input.status;
  if (!isMemberStatus(status)) throw new ValidationError(`非法人员状态：${String(status)}`);
  return {
    name: input.name.trim(),
    departmentId: nullableId(input.departmentId, "部门 id"),
    role: trimmedText(input.role, "角色", MAX_MEMBER_ROLE, "member"),
    email: input.email.trim(),
    phone: trimmedText(input.phone, "电话", MAX_MEMBER_PHONE, ""),
    title: trimmedText(input.title, "职位", MAX_MEMBER_TITLE, ""),
    status,
    userId: nullableId(input.userId, "关联用户 id"),
  };
}

/**
 * 人员模糊搜索唯一口径：姓名 / 邮箱 / 职位三字段，大小写不敏感子串匹配；
 * 空查询（含非字符串）返回全量副本。搜索结果保持输入顺序，不改入参。
 */
export function searchMembers(members: readonly Member[], query: unknown): Member[] {
  if (typeof query !== "string" || query.trim() === "") return [...members];
  const needle = query.trim().toLowerCase();
  return members.filter((m) =>
    m.name.toLowerCase().includes(needle) ||
    m.email.toLowerCase().includes(needle) ||
    m.title.toLowerCase().includes(needle),
  );
}

/** 组织树装配：部门树每个节点挂直属人员（departmentId 为 null/不存在的按未分配处理，不丢人员列表） */
export function buildOrgTree(depts: readonly Department[], members: readonly Member[]): OrgTreeNode[] {
  const byDept = new Map<number, Member[]>();
  for (const m of members) {
    if (m.departmentId === null) continue;
    const list = byDept.get(m.departmentId) ?? [];
    list.push(m);
    byDept.set(m.departmentId, list);
  }
  const tree = buildDepartmentTree(depts);
  const attach = (node: DepartmentTreeNode): OrgTreeNode => ({
    department: node,
    members: [...(byDept.get(node.id) ?? [])],
    children: node.children.map(attach),
  });
  return tree.map(attach);
}
