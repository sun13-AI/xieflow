// 协流 XieFlow — shared/docHistory.ts：文档版本历史唯一口径（r29 · 版本快照 / 回收站）
// 三函数规则全在本文件：nextDocVersion（版本递增）/ buildVersionNote（变更摘要增/删行数）/
// canRestoreVersion（防恢复到已软删文档）。api / web 零算法分支：只装配 shared 结果并映射错误。
// 无新依赖、零 token；本文件为 @xieflow/shared/docHistory 子路径导出。
import { ValidationError } from "./index.js";

/** 版本 note 上限（写库前归一，api/web 不重复限长） */
export const DOC_VERSION_NOTE_MAX = 500;
export const MAX_DOC_VERSION = 1_000_000_000;

/** 数据库 document_versions 行 → 领域对象（snake_case 在 db/mappers 归一） */
export interface DocVersion {
  readonly id: number;
  readonly documentId: number;
  readonly version: number;
  readonly title: string;
  readonly contentMarkdown: string;
  readonly createdAt: string;
  readonly note: string;
}

/** 变更摘要（增/删行数 + 可直接落库的文案） */
export interface VersionNote {
  readonly added: number;
  readonly removed: number;
  readonly text: string;
}

/** 恢复判定所需的最小状态（版本行与文档行都满足此形状） */
export interface DocVersionState {
  readonly version: number;
  readonly deletedAt?: string | null;
}

function isPositiveVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_DOC_VERSION;
}

function versionOf(value: unknown): number {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value as number;
}

/** 规则①：nextDocVersion —— 当前版本必须是 0..MAX 的整数，返回 +1（恢复生成新版本而非覆盖） */
export function nextDocVersion(current: unknown): number {
  const n = versionOf(current);
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_DOC_VERSION) {
    throw new ValidationError(`非法文档版本号：${String(current)}`);
  }
  return n + 1;
}

/** 内容按 \n 归一后逐行切分；空串视为零行（与 blocksToMarkdown 的空文档口径一致） */
function splitLines(value: unknown): string[] {
  if (typeof value !== "string" || value === "") return [];
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/** LCS 行最长公共子序列长度（行 diff 唯一算法；超长内容退化为逐行集合比较，仍确定性） */
function lcsLength(a: readonly string[], b: readonly string[]): number {
  const n = a.length;
  const m = b.length;
  let prev = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    const cur = new Array<number>(m + 1).fill(0);
    for (let j = 1; j <= m; j += 1) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    }
    prev = cur;
  }
  return prev[m]!;
}

/** 行数增删计数（LCS：公共行不计，其余分别算删除/新增） */
export function countVersionLineChanges(oldContent: unknown, newContent: unknown): { added: number; removed: number } {
  const a = splitLines(oldContent);
  const b = splitLines(newContent);
  const common = lcsLength(a, b);
  return { added: b.length - common, removed: a.length - common };
}

/** 规则②：buildVersionNote —— 由旧/新 Markdown 内容生成变更摘要（增/删行数 + 文案） */
export function buildVersionNote(oldContent: unknown, newContent: unknown): VersionNote {
  const { added, removed } = countVersionLineChanges(oldContent, newContent);
  const text = added === 0 && removed === 0
    ? "内容无变更"
    : `变更摘要：新增 ${added} 行 / 删除 ${removed} 行`;
  return { added, removed, text: text.slice(0, DOC_VERSION_NOTE_MAX) };
}

/** 软删除判定（documents.deleted_at 非空即回收站） */
export function isDocumentSoftDeleted(doc: { readonly deletedAt?: string | null } | null | undefined): boolean {
  return doc != null && doc.deletedAt != null;
}

/** 规则③：canRestoreVersion —— 目标版本合法且源文档/目标文档均未软删才允许恢复 */
export function canRestoreVersion(
  target: DocVersionState | null | undefined,
  current: DocVersionState | null | undefined,
): boolean {
  if (!target || !current) return false;
  if (!isPositiveVersion(target.version) || !isPositiveVersion(current.version)) return false;
  if (isDocumentSoftDeleted(target) || isDocumentSoftDeleted(current)) return false;
  return true;
}

/** 恢复守卫：把 canRestoreVersion 的 false 映射为带语义的 ValidationError（api 零算法分支） */
export function assertCanRestoreVersion(
  target: DocVersionState | null | undefined,
  current: DocVersionState | null | undefined,
): void {
  if (!target) throw new ValidationError("版本不存在，无法恢复");
  if (!current) throw new ValidationError("文档不存在，无法恢复版本");
  if (!isPositiveVersion(target.version)) throw new ValidationError(`非法版本号：${String(target.version)}`);
  if (isDocumentSoftDeleted(current) || isDocumentSoftDeleted(target)) {
    throw new ValidationError("文档已删除，请先从回收站还原后再恢复版本");
  }
}

/** note 输入归一：空/非字符串回落默认文案，超长截断（api/web 零算法分支） */
export function normalizeVersionNote(value: unknown, fallback: string): string {
  const raw = typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
  return raw.slice(0, DOC_VERSION_NOTE_MAX);
}
