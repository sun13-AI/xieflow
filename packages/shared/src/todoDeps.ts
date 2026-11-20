// 协流 XieFlow — shared/todoDeps.ts：任务依赖与阻塞关系唯一口径（r34 · finish-to-start）
// 三函数全在本文件：canStartTodo（所有前置 done 才能开始）/ detectDependencyCycle（DFS 环检测）/
// buildDependencyGraph（Kahn 拓扑序 + 阻塞链）。api / web 零算法分支，只装配 shared 结果并映射 4xx。
// 无新依赖、零 token；本文件为 @xieflow/shared/todoDeps 子路径导出。
import { ValidationError, type Todo } from "./index.js";

/** 一条 finish-to-start 依赖：todoId 开始前，dependsOnTodoId 必须先 done */
export interface TodoDependency {
  readonly todoId: number;
  readonly dependsOnTodoId: number;
}

/** 某待办的阻塞摘要（直接未完成前置 + 传递阻塞链） */
export interface TodoBlocker {
  readonly todoId: number;
  /** 直接未完成前置 id（升序去重） */
  readonly blockers: readonly number[];
  /** 传递闭包：沿依赖边可达的全部未完成前置 id（升序去重） */
  readonly chain: readonly number[];
}

/** 依赖图装配结果 */
export interface DependencyGraph {
  /** Kahn 拓扑序：前置在前、同层 id 升序；含环时环内节点追加在尾部（不丢节点） */
  readonly order: readonly number[];
  /** 被阻塞待办列表（按 todoId 升序） */
  readonly blocked: readonly TodoBlocker[];
  /** DFS 环路径（含闭合节点），无环为 null */
  readonly cycle: readonly number[] | null;
}

type TodoLike = Pick<Todo, "id" | "status">;
type TodoTitleLike = Pick<Todo, "id" | "title">;

/** 环错误（api 映射 400，回带环路径供 web 红条消费） */
export class DependencyCycleError extends ValidationError {
  readonly cycle: readonly number[];

  constructor(cycle: readonly number[]) {
    super(`循环依赖：${formatDependencyCycle(cycle)}`);
    this.name = "DependencyCycleError";
    this.cycle = [...cycle];
  }
}

/** 重复依赖（api 映射 409） */
export class DuplicateDependencyError extends Error {
  readonly todoId: number;
  readonly dependsOnTodoId: number;

  constructor(todoId: number, dependsOnTodoId: number) {
    super(`依赖已存在：#${todoId} 已依赖 #${dependsOnTodoId}`);
    this.name = "DuplicateDependencyError";
    this.todoId = todoId;
    this.dependsOnTodoId = dependsOnTodoId;
  }
}

/** 状态机守卫错误（api 映射 409 + blockers 列表） */
export class DependencyBlockedError extends Error {
  readonly todoId: number;
  readonly blockers: readonly number[];

  constructor(todoId: number, blockers: readonly number[]) {
    super(`前置任务未完成，无法完成该待办（被 ${blockers.length} 项阻塞）`);
    this.name = "DependencyBlockedError";
    this.todoId = todoId;
    this.blockers = [...blockers];
  }
}

/** 正整数待办 id 守卫（0 / 负 / 小数 / 非数字一律拒绝） */
export function isTodoId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** 依赖对守卫：非法 id 与自依赖在落库前拦下（api 映射 400） */
export function assertValidDependencyPair(todoId: unknown, dependsOnTodoId: unknown): void {
  if (!isTodoId(todoId)) {
    throw new ValidationError(`非法待办 id：${String(todoId)}`);
  }
  if (!isTodoId(dependsOnTodoId)) {
    throw new ValidationError(`非法前置 id：${String(dependsOnTodoId)}`);
  }
  if (todoId === dependsOnTodoId) {
    throw new ValidationError("不能将待办设为自身的前置任务");
  }
}

/** 环路径可读化：无环记「无」，带标题时回带实体名（供 UI 红条） */
export function formatDependencyCycle(
  cycle: readonly number[] | null,
  todos: readonly TodoTitleLike[] = [],
): string {
  if (cycle === null || cycle.length === 0) return "无";
  const byId = new Map(todos.map((t) => [t.id, t.title]));
  return cycle.map((id) => {
    const title = byId.get(id);
    return title ? `${title}(#${id})` : `#${id}`;
  }).join(" → ");
}

/** 终点对象按 id 升序去重的稳定插入 */
function pushSortedUnique(list: number[], value: number): void {
  if (list.includes(value)) return;
  list.push(value);
  list.sort((a, b) => a - b);
}

/** todoId -> 依赖前置 id 列表（去重升序） */
function buildPrereqMap(deps: readonly TodoDependency[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const dep of deps) {
    if (!isTodoId(dep.todoId) || !isTodoId(dep.dependsOnTodoId)) continue;
    const list = map.get(dep.todoId) ?? [];
    pushSortedUnique(list, dep.dependsOnTodoId);
    map.set(dep.todoId, list);
  }
  return map;
}

/**
 * 直接未完成前置 id（升序）。前置实体不存在按「未完成」处理（FK 保证实库无孤儿，纯函数防御）。
 * archived 不算 done，只有 status === "done" 才算满足。
 */
export function blockersForTodo(
  todoId: number,
  deps: readonly TodoDependency[],
  todos: readonly TodoLike[],
): number[] {
  const byId = new Map(todos.map((t) => [t.id, t]));
  const prereq = buildPrereqMap(deps).get(todoId) ?? [];
  return prereq.filter((id) => byId.get(id)?.status !== "done");
}

/** finish-to-start 判定：所有前置均 done（或无前置）才能开始；纯函数不修改入参 */
export function canStartTodo(
  todo: TodoLike,
  deps: readonly TodoDependency[],
  todos: readonly TodoLike[],
): boolean {
  return blockersForTodo(todo.id, deps, todos).length === 0;
}

/**
 * DFS 三色环检测，节点与邻接均按 id 升序，结果确定可重放。
 * 返回闭合路径（如 [1,2,1]，自环 [1,1]）；无环返回 null。
 */
export function detectDependencyCycle(deps: readonly TodoDependency[]): number[] | null {
  const adj = buildPrereqMap(deps);
  const nodes = new Set<number>();
  for (const dep of deps) {
    if (isTodoId(dep.todoId)) nodes.add(dep.todoId);
    if (isTodoId(dep.dependsOnTodoId)) nodes.add(dep.dependsOnTodoId);
  }
  const state = new Map<number, 0 | 1 | 2>(); // 0 white / 1 gray / 2 black
  const stack: number[] = [];
  let cycle: number[] | null = null;
  const visit = (node: number): void => {
    if (cycle !== null) return;
    state.set(node, 1);
    stack.push(node);
    for (const next of adj.get(node) ?? []) {
      if (cycle !== null) return;
      const s = state.get(next) ?? 0;
      if (s === 1) {
        const idx = stack.indexOf(next);
        cycle = [...stack.slice(idx), next];
        return;
      }
      if (s === 0) {
        visit(next);
      }
    }
    stack.pop();
    state.set(node, 2);
  };
  for (const node of [...nodes].sort((a, b) => a - b)) {
    if ((state.get(node) ?? 0) === 0) visit(node);
    if (cycle !== null) break;
  }
  return cycle;
}

/** 加边是否会成环：沿「依赖」方向从 dependsOnTodoId 找回到 todoId 的路径 */
export function wouldCreateCycle(
  deps: readonly TodoDependency[],
  todoId: number,
  dependsOnTodoId: number,
): boolean {
  if (todoId === dependsOnTodoId) return true;
  const adj = buildPrereqMap(deps);
  const seen = new Set<number>();
  const walk = (node: number): boolean => {
    if (node === todoId) return true;
    if (seen.has(node)) return false;
    seen.add(node);
    for (const next of adj.get(node) ?? []) {
      if (walk(next)) return true;
    }
    return false;
  };
  return walk(dependsOnTodoId);
}

/** 依赖对 + 无环一次性守卫（db 层落库前调用） */
export function assertValidDependency(
  deps: readonly TodoDependency[],
  todoId: unknown,
  dependsOnTodoId: unknown,
): void {
  assertValidDependencyPair(todoId, dependsOnTodoId);
  if (wouldCreateCycle(deps, todoId as number, dependsOnTodoId as number)) {
    throw new DependencyCycleError(
      detectDependencyCycle([...deps, { todoId: todoId as number, dependsOnTodoId: dependsOnTodoId as number }])
        ?? [todoId as number, dependsOnTodoId as number, todoId as number],
    );
  }
}

/** 传递阻塞链：从直接前置出发，沿依赖边收集全部未完成祖先（含直接前置），升序去重 */
function collectChain(
  todoId: number,
  prereq: Map<number, number[]>,
  byId: Map<number, TodoLike>,
  seen: Set<number>,
): number[] {
  const out: number[] = [];
  const walk = (node: number): void => {
    if (seen.has(node)) return;
    seen.add(node);
    if (byId.get(node)?.status !== "done") out.push(node);
    for (const next of prereq.get(node) ?? []) walk(next);
  };
  for (const direct of prereq.get(todoId) ?? []) walk(direct);
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * 拓扑序 + 阻塞链装配（纯函数）。
 * Kahn：入度 = 自身未完成/完成的前置总数（所有前置都参与排序，不只是未完成的），
 * 每次从入度为 0 的节点中取最小 id，保证顺序确定；含环时剩余节点按 id 追加，不丢节点。
 */
export function buildDependencyGraph(
  todos: readonly TodoLike[],
  deps: readonly TodoDependency[],
): DependencyGraph {
  const byId = new Map(todos.map((t) => [t.id, t]));
  const prereq = buildPrereqMap(deps);
  const remaining = new Map<number, number>();
  const dependents = new Map<number, number[]>();
  for (const todo of todos) {
    remaining.set(todo.id, (prereq.get(todo.id) ?? []).filter((id) => byId.has(id)).length);
  }
  for (const [todoId, pre] of prereq) {
    if (!byId.has(todoId)) continue;
    for (const p of pre) {
      if (!byId.has(p)) continue;
      const list = dependents.get(p) ?? [];
      pushSortedUnique(list, todoId);
      dependents.set(p, list);
    }
  }
  const zero = todos.filter((t) => remaining.get(t.id) === 0).map((t) => t.id).sort((a, b) => a - b);
  const order: number[] = [];
  while (zero.length > 0) {
    const node = zero.shift()!;
    order.push(node);
    for (const dep of dependents.get(node) ?? []) {
      const left = (remaining.get(dep) ?? 0) - 1;
      remaining.set(dep, left);
      if (left === 0) {
        zero.push(dep);
        zero.sort((a, b) => a - b);
      }
    }
  }
  // 环内节点无法降到 0：按 id 追加，保证不丢实体（cycle 字段已单独给出）
  for (const todo of [...todos].sort((a, b) => a.id - b.id)) {
    if (!order.includes(todo.id)) order.push(todo.id);
  }

  const blocked: TodoBlocker[] = [];
  for (const todo of [...todos].sort((a, b) => a.id - b.id)) {
    const direct = blockersForTodo(todo.id, deps, todos);
    if (direct.length === 0) continue;
    blocked.push({
      todoId: todo.id,
      blockers: direct,
      chain: collectChain(todo.id, prereq, byId, new Set()),
    });
  }
  return { order, blocked, cycle: detectDependencyCycle(deps) };
}
