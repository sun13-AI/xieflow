// 协流 XieFlow — authClient.ts：浏览器端会话存取与 401 清假登录态（r18 · M9 起步）
// 认证页是独立路由（?page=login|register），不占 tab 数量；任何 401 一律清 token 并跳登录页。
export const SESSION_TOKEN_KEY = "xieflow.session.token";
export const PREFERRED_MODE_KEY = "xieflow.preferred.mode";
export const AUTH_CLEARED_EVENT = "xieflow:auth-cleared";

export type FrontendMode = "local" | "remote";

export function readToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    /* 隐私模式下 localStorage 不可写：本会话仍可用内存 token（由调用方 state 持有） */
  }
}

/** 401 / 登出统一入口：移除本地 token 并广播事件，绝不保留假登录态 */
export function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(AUTH_CLEARED_EVENT));
}

export function readPreferredMode(): FrontendMode {
  try {
    return window.localStorage.getItem(PREFERRED_MODE_KEY) === "remote" ? "remote" : "local";
  } catch {
    return "local";
  }
}

export function savePreferredMode(mode: FrontendMode): void {
  try {
    window.localStorage.setItem(PREFERRED_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function goToLogin(reason: "401" | "logout" | "remote" | "registered" | null = null): void {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("page", "login");
  if (reason) url.searchParams.set("reason", reason);
  window.location.replace(url.toString());
}

/** 带 token 的 fetch；401 时先清 token 再跳登录（r1 教训：受保护路由必须清假登录态） */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    clearSession();
    goToLogin("401");
  }
  return res;
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? `请求失败（HTTP ${res.status}）`);
  return data as T;
}
