// 协流 XieFlow — r45：文档块拖拽排序规则（唯一实现，api / web 零算法分支）
// 纯函数、零依赖、零随机：拖放槽位 → move 端点 position 的换算与边界钳制集中在此。
// 宪法第七条：状态机 / 规则只准住在 packages/shared；本文件不反向 import index，
// 以免与 index 的再导出形成运行时环。

/** 拖放计划：fromIndex 源下标 / slot 钳制后的落点槽位 / position 交给 move 端点的最终下标 */
export interface BlockDropPlan {
  readonly fromIndex: number;
  readonly slot: number;
  readonly position: number;
  readonly count: number;
}

/** 目标块关系（父链用于禁止把父块拖进自己的子块） */
export interface DropBlockRef {
  readonly id: number;
  readonly parentId?: number | null;
}

/** 落点校验结果（reason 为可直接展示给用户的中文原因，valid=true 时恒 null） */
export interface DropTargetCheck {
  readonly valid: boolean;
  readonly reason: string | null;
}

/** 规则守卫失败（非自洽占位：真实抛错，调用方 / 断言层均可检出） */
export class BlockDndError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockDndError";
  }
}

function requireInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new BlockDndError(`${label}必须是整数：${String(value)}`);
  }
  return value;
}

/**
 * 拖放计划（r45 唯一口径）：
 * ① fromIndex / count 必须是整数，count ≥ 0，fromIndex ∈ [0, count)——非法输入抛错；
 * ② toIndex 必须是整数，但允许越界，按 [0, count] 钳制为 slot（count 表示放到末尾之后）；
 * ③ slot 等于源下标或源下标的紧邻后一位时，顺序完全不变 → 返回 null（UI 据此不发请求）；
 * ④ position = slot > fromIndex ? slot - 1 : slot——源块被抽出后，目标槽位换算成
 *    0..count-1 的最终下标，与 r8 shared reorderPositions / POST /api/blocks/:id/move 同源；
 * ⑤ 同输入逐字节确定，无随机、无副作用。
 */
export function planBlockDrop(
  fromIndex: unknown,
  toIndex: unknown,
  count: unknown,
): BlockDropPlan | null {
  const from = requireInteger(fromIndex, "源下标");
  const total = requireInteger(count, "块数");
  const rawTarget = requireInteger(toIndex, "目标槽位");
  if (total < 0) throw new BlockDndError(`块数不能为负：${String(total)}`);
  if (from < 0 || from >= total) {
    throw new BlockDndError(`源下标越界：${String(from)}（允许 0..${total - 1}）`);
  }
  const slot = Math.max(0, Math.min(total, rawTarget));
  if (slot === from || slot === from + 1) return null;
  const position = slot > from ? slot - 1 : slot;
  return { fromIndex: from, slot, position, count: total };
}

function invalid(reason: string): DropTargetCheck {
  return { valid: false, reason };
}

/**
 * 落点校验（r45 唯一口径）：
 * ① fromId / toId 必须是正整数，否则拒绝；
 * ② 禁止拖到自身；
 * ③ 传入 blocks 时，目标块必须存在，且沿 parentId 向上回溯不能遇到源块
 *    （不能把父块拖进自己的子块），父链成环时按已访问集合收敛、不死循环、不误判；
 * ④ valid=true 时 reason 恒 null；纯函数不改入参。
 */
export function validateDropTarget(
  fromId: unknown,
  toId: unknown,
  blocks?: readonly DropBlockRef[],
): DropTargetCheck {
  const from = requireInteger(fromId, "源块 id");
  const to = requireInteger(toId, "目标块 id");
  if (from <= 0 || to <= 0) return invalid("非法块 id");
  if (from === to) return invalid("不能拖到自身");
  if (blocks) {
    const byId = new Map<number, DropBlockRef>(blocks.map((b) => [b.id, b]));
    const target = byId.get(to);
    if (!target) return invalid("目标块不在当前文档内");
    const seen = new Set<number>([to]);
    let cursor: number | null | undefined = target.parentId ?? null;
    while (cursor !== null && cursor !== undefined) {
      if (cursor === from) return invalid("不能拖到子块");
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
  }
  return { valid: true, reason: null };
}
