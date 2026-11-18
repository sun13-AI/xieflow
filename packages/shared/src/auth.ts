// 协流 XieFlow — shared/auth.ts：认证唯一口径（r18 · M9 起步）
// 规则集中：PBKDF2 哈希/校验、会话过期判定、角色→权限映射、token 本地随机生成。
// 只依赖 Node 内置 node:crypto（零新增依赖、无外部 IdP、无密钥文件）。
// 本文件为 @xieflow/shared/auth 子路径导出：web 永不导入，避免 node:crypto 进入浏览器包。
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { ValidationError } from "./index.js";

/** PBKDF2-HMAC-SHA256 参数（纯 Node 内置实现，零新依赖） */
export const PBKDF2_ITERATIONS = 120_000;
export const PBKDF2_KEYLEN = 32;
export const PBKDF2_DIGEST = "sha256";

/** 密码 / 用户名守卫阈值 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 32;

/** 会话默认有效期 2 小时；登录接口可显式缩短（仅本地自测用，上界即默认值） */
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const SESSION_MIN_TTL_MS = 1;

/** 服务模式：local 单机免登录 / remote 网络版强制鉴权 */
export const SERVER_MODES = ["local", "remote"] as const;
export type ServerMode = (typeof SERVER_MODES)[number];

export function isServerMode(value: unknown): value is ServerMode {
  return typeof value === "string" && (SERVER_MODES as readonly string[]).includes(value);
}

export function normalizeServerMode(value: unknown): ServerMode {
  return isServerMode(value) ? value : "local";
}

export function assertValidServerMode(value: unknown): asserts value is ServerMode {
  if (!isServerMode(value)) throw new ValidationError(`非法服务模式：${String(value)}`);
}

/** 角色与权限（唯一映射表；api 的 401/403 与 UI 按钮可见性都从这里取） */
export const AUTH_ROLES = ["user", "admin"] as const;
export type AuthRole = (typeof AUTH_ROLES)[number];
export const ALL_AUTH_PERMISSIONS = [
  "todo:read", "todo:write", "auth:me", "auth:logout", "auth:mode", "user:manage",
] as const;
export type AuthPermission = (typeof ALL_AUTH_PERMISSIONS)[number];

export const AUTH_PERMISSIONS: Readonly<Record<AuthRole, readonly AuthPermission[]>> = {
  user: ["todo:read", "todo:write", "auth:me", "auth:logout"],
  admin: ALL_AUTH_PERMISSIONS,
};

export function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === "string" && (AUTH_ROLES as readonly string[]).includes(value);
}

export function can(role: AuthRole, permission: AuthPermission): boolean {
  return (AUTH_PERMISSIONS[role] as readonly AuthPermission[]).includes(permission);
}

export function assertPermission(role: AuthRole, permission: AuthPermission): void {
  if (!can(role, permission)) {
    throw new ForbiddenError(`角色 ${role} 无权限：${permission}`);
  }
}

/** 冲突（重复用户名）：api 映射 409，与参数非法 400 区分 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** 越权：api 映射 403 */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function assertValidUsername(value: unknown): asserts value is string {
  if (typeof value !== "string") throw new ValidationError("用户名必须是字符串");
  const name = value.trim();
  if (name.length < MIN_USERNAME_LENGTH || name.length > MAX_USERNAME_LENGTH) {
    throw new ValidationError(`用户名长度须在 ${MIN_USERNAME_LENGTH}-${MAX_USERNAME_LENGTH} 之间`);
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new ValidationError("用户名只允许字母、数字、下划线、点、连字符");
  }
}

export function assertValidPassword(value: unknown): asserts value is string {
  if (typeof value !== "string") throw new ValidationError("密码必须是字符串");
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`密码过弱：至少 ${MIN_PASSWORD_LENGTH} 位`);
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(`密码过长：最多 ${MAX_PASSWORD_LENGTH} 位`);
  }
  if (value.includes("\u0000")) throw new ValidationError("密码含非法控制字符（NUL）");
}

/**
 * 密码哈希：pbkdf2$<迭代次数>$<16字节盐hex>$<32字节摘要hex>。
 * 每次调用生成新随机盐，因此相同密码的两次哈希不同；校验靠存储串里的盐与迭代数。
 */
export function hashPassword(password: string): string {
  assertValidPassword(password);
  const salt = randomBytes(PBKDF2_KEYLEN);
  const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** 校验密码：格式非法或任何不匹配一律 false（不向调用方泄漏细节） */
export function verifyPassword(password: string, stored: string): boolean {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const saltHex = parts[2] ?? "";
  const digestHex = parts[3] ?? "";
  if (!Number.isInteger(iterations) || iterations <= 0 || iterations > 1_000_000) return false;
  if (!/^[0-9a-f]{64}$/.test(saltHex) || !/^[0-9a-f]{64}$/.test(digestHex)) return false;
  const expected = Buffer.from(digestHex, "hex");
  const actual = pbkdf2Sync(password, Buffer.from(saltHex, "hex"), iterations, expected.length, PBKDF2_DIGEST);
  return timingSafeEqual(expected, actual);
}

/** 会话领域对象（schemas v14 sessions 表 camelCase 映射，不含用户密码） */
export interface Session {
  readonly id: number;
  readonly userId: number;
  readonly token: string;
  readonly expiresAt: string;
}

/** 对外用户对象：永远不含 password_hash */
export interface AuthUser {
  readonly id: number;
  readonly username: string;
  readonly role: AuthRole;
  readonly createdAt: string;
}

export type SessionValidation = { readonly valid: true } | { readonly valid: false; readonly reason: "expired" | "invalid" };

/**
 * 会话有效性唯一判定（纯函数）：到期时刻即过期（nowMs >= expiresAt），
 * 格式损坏判 invalid。401 清假登录态与过期会话拦截都调用这里。
 */
export function validateSession(session: Session | null | undefined, nowMs: number = Date.now()): SessionValidation {
  if (!session || typeof session.token !== "string" || session.token.length === 0) {
    return { valid: false, reason: "invalid" };
  }
  const expiresAt = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAt)) return { valid: false, reason: "invalid" };
  if (nowMs >= expiresAt) return { valid: false, reason: "expired" };
  return { valid: true };
}

export function assertValidSessionToken(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new ValidationError("非法会话 token（须 64 位十六进制）");
  }
}

export function assertValidExpiresAt(value: unknown): asserts value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError("非法会话过期时间（须 ISO 时间串）");
  }
}

/** token 仅本地随机生成（32 字节 → 64 hex），不写任何密钥文件、不接外部 IdP */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}
