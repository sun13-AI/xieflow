// 协流 XieFlow — r1 最小页面：首页工作台占位
// 五个截图状态真实存在：加载中 / 空数据 / 正常 / 错误 / 窄屏（CSS 响应式）
import { useEffect, useState } from "react";
import type { AppSetting } from "@xieflow/shared";

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; settings: AppSetting[]; schemaVersion: number };

/** 健康检查：读 /api/health（dev server 代理到 api；fetch 失败即错误态） */
async function fetchHealth(): Promise<{ schemaVersion: number; settings: AppSetting[] }> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`健康检查失败：HTTP ${res.status}`);
  return (await res.json()) as { schemaVersion: number; settings: AppSetting[] };
}

export default function App() {
  const [state, setState] = useState<LoadState>(() => {
    // 截图脚本用 ?shot= 钉住特定状态（真实状态都存在，参数只为确定性捕获）
    const shot = new URLSearchParams(window.location.search).get("shot");
    if (shot === "loading") return { phase: "loading" };
    if (shot === "error")
      return { phase: "error", message: "ECONNREFUSED 127.0.0.1:8787（截图钉态）" };
    if (shot === "empty") return { phase: "ready", settings: [], schemaVersion: 2 };
    if (shot === "ready")
      return {
        phase: "ready",
        settings: [{ key: "company.name", value: "协流示例公司", updatedAt: new Date().toISOString() }],
        schemaVersion: 2,
      };
    return { phase: "loading" };
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("narrow") === "1") {
      document.documentElement.classList.add("force-narrow");
    }
    const shot = params.get("shot");
    if (shot === "loading" || shot === "error" || shot === "empty" || shot === "ready") {
      return; // 钉态不探测
    }
    let alive = true;
    fetchHealth()
      .then((data) => {
        if (alive) setState({ phase: "ready", ...data });
      })
      .catch((err: unknown) => {
        if (alive) setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <span className="logo">协流 XieFlow</span>
        <span className="badge">r1 · 立项骨架</span>
      </header>

      {state.phase === "loading" && (
        <section className="card state-loading" data-state="loading">
          <p>正在连接本地数据库…</p>
        </section>
      )}

      {state.phase === "error" && (
        <section className="card state-error" data-state="error" role="alert">
          <h2>连接失败</h2>
          <p className="error-message">{state.message}</p>
          <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后刷新本页。</p>
        </section>
      )}

      {state.phase === "ready" && (
        <section className="card state-ready" data-state="ready">
          <h2>工作台</h2>
          {state.settings.length === 0 ? (
            <p className="empty" data-state="empty">
              数据库已就绪（schema v{state.schemaVersion}），还没有任何设置项——这是正常空态。
            </p>
          ) : (
            <ul className="settings-list">
              {state.settings.map((s) => (
                <li key={s.key}>
                  <code>{s.key}</code> = {s.value}
                </li>
              ))}
            </ul>
          )}
          <dl className="meta">
            <dt>schema 版本</dt>
            <dd>v{state.schemaVersion}</dd>
            <dt>里程碑</dt>
            <dd>M0 立项</dd>
          </dl>
        </section>
      )}
    </main>
  );
}
