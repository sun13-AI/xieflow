// 协流 XieFlow — AuthPages.tsx：登录 / 注册（独立路由，不占 tab 数量 · r18 M9 起步）
// ?page=login&reason=401 → 清假登录态后的提示；?shot=login-error → 钉态错误证据。
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { goToLogin, readToken, saveToken } from "./authClient";

const REASON_TEXT: Record<string, string> = {
  "401": "登录态已失效（HTTP 401），本地假登录态已清除，请重新登录；登录后从工作台继续（原业务页请再点一次）。",
  logout: "已退出登录，会话 token 已清除。",
  remote: "远端模式需要登录后才能访问业务数据。",
  registered: "注册成功，请用刚创建的账号登录。",
};

/** r18 返工#1 U2-1：与 shared assertValidPassword 同口径的可见预告（8–200 位，不强制组合） */
function passwordHint(password: string): { text: string; cls: string } {
  if (password.length === 0) return { text: "密码规则：8–200 位，不强制大小写/数字组合；不支持 NUL 控制字符。", cls: "" };
  if (password.length < 8) return { text: `还差 ${8 - password.length} 位达到最低 8 位（最长 200 位）。`, cls: "password-hint-weak" };
  if (password.length > 200) return { text: "超过 200 位上限，请缩短后再提交。", cls: "password-hint-weak" };
  if (password.includes("\u0000")) return { text: "密码含非法控制字符，请去掉后再提交。", cls: "password-hint-weak" };
  return { text: `符合规则（${password.length} 位）${password.length >= 12 ? "，强度较好" : ""}。`, cls: "password-hint-ok" };
}

interface AuthShellProps {
  readonly kind: "login" | "register";
  readonly title: string;
  readonly subtitle: string;
  readonly reason: string | null;
  readonly shot: string | null;
}

function AuthShell({ kind, title, subtitle, reason, shot }: AuthShellProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => (reason && REASON_TEXT[reason] ? REASON_TEXT[reason] : ""));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (shot === "login-error") setError("用户名或密码错误（HTTP 401）——请检查账号与密码后重试");
    if (shot === "register-error") setError("弱密码被拒绝（HTTP 400）：密码至少 8 位");
    if (shot === "login") setNotice("演示账号：r18_shot_user；远端模式下需登录访问业务数据。");
    if (shot === "register") setNotice("账号落 users 表；密码只存 PBKDF2 摘要，不明文落库。");
  }, [shot]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (shot) return; // 截图钉态不发真实网络请求，避免污染 api 数据
    setBusy(true);
    setError("");
    try {
      if (kind === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(data?.error ?? `注册失败（HTTP ${res.status}）`);
        goToLogin("registered");
        return;
      }
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => null)) as { token?: string; error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `登录失败（HTTP ${res.status}）`);
      if (!data?.token) throw new Error("登录响应缺少 token");
      saveToken(data.token);
      window.location.replace("?page=home");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell" data-state={kind}>
      <section className="auth-card card">
        <div className="auth-brand">协流 XieFlow</div>
        <span className="auth-badge">r18 · 账号与网络版服务（M9 起步）</span>
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>

        {error !== "" && (
          <p className="auth-error" role="alert" data-state="auth-error">{error}</p>
        )}
        {notice !== "" && <p className="auth-notice" data-state="auth-notice">{notice}</p>}

        <form onSubmit={submit} className="auth-form">
          <label>
            用户名
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="至少 3 位字母/数字/_-."
              aria-label="用户名"
            />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码：8–200 位（不强制大小写/数字组合）"
              aria-label="密码"
            />
          </label>
          {kind === "register" && (
            <p className={`password-hint ${passwordHint(password).cls}`} data-state="password-hint">
              {passwordHint(password).text}
            </p>
          )}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? "提交中…" : kind === "login" ? "登录" : "注册"}
          </button>
        </form>

        <p className="auth-foot">
          {kind === "login" ? (
            <>还没有账号？<a href="?page=register">去注册</a></>
          ) : (
            <>已有账号？<a href="?page=login">去登录</a></>
          )}
          <span className="auth-foot-sep">·</span>
          <a href="?page=home">返回工作台</a>
        </p>
        <p className="auth-note" data-state="auth-note">
          认证页是独立路由，不占主界面 14 个 tab；token 仅存浏览器本地，服务端不写任何密钥文件。
        </p>
        {kind === "login" && readToken() !== null && (
          <p className="auth-notice" data-state="stale-token-hint">检测到残留 token：登录成功后会被新 token 覆盖。</p>
        )}
      </section>
    </main>
  );
}

export function LoginPage({ reason }: { readonly reason: string | null }) {
  const shot = new URLSearchParams(window.location.search).get("shot");
  return (
    <AuthShell
      kind="login"
      title="登录协流"
      subtitle="登录后在远端模式下可访问全部业务路由"
      reason={reason}
      shot={shot}
    />
  );
}

export function RegisterPage({ reason }: { readonly reason: string | null }) {
  const shot = new URLSearchParams(window.location.search).get("shot");
  return (
    <AuthShell
      kind="register"
      title="注册协流账号"
      subtitle="首个账号自动成为管理员，其余账号为普通用户"
      reason={reason}
      shot={shot}
    />
  );
}
