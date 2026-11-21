// scripts/r57-perf-cdp.mjs - r57 P1-3 headless CDP input-latency baseline (ASCII only).
// Measures Performance.ScriptDuration while typing 17 chars in the global search
// box with 1000 rendered todos. Threshold: <500 ms. Scratch DB + one-shot browser;
// no visible window, no user data, all processes stopped in finally.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const THRESHOLD_MS = 500;
const API_PORT = 8787;
const WEB_PORT = 5173;
const scratch = mkdtempSync(join(tmpdir(), "r57-perf-"));
const dbPath = join(scratch, "r57-perf.db");
const procs = [];
let browser = null;
let ws = null;

function killTree(proc) {
  if (!proc || !proc.pid) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-proc.pid, "SIGKILL");
  } catch { /* already gone */ }
}

function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH,
    `${process.env.ProgramFiles || ""}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env["ProgramFiles(x86)"] || ""}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.LOCALAPPDATA || ""}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles || ""}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(Boolean);
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error("Edge/Chrome not found for r57 CDP probe");
  return hit;
}

async function waitFor(ms, fn, label) {
  const deadline = Date.now() + ms;
  let last = null;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}; last=${JSON.stringify(last)}`);
}

async function waitHttp(url, ms, label) {
  await waitFor(ms, async () => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
      return r.ok ? true : null;
    } catch { return null; }
  }, label);
}

function startDetached(command, args, env) {
  const proc = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: "ignore",
    detached: process.platform !== "win32",
  });
  procs.push(proc);
  return proc;
}

async function main() {
  const env = {
    XIEFLOW_API_PORT: String(API_PORT),
    XIEFLOW_DB_PATH: dbPath,
    XIEFLOW_MODE: "local",
  };
  if (process.platform === "win32") {
    startDetached("cmd.exe", ["/c", "pnpm exec tsx apps/api/src/server.ts"], env);
    startDetached("cmd.exe", ["/c", "pnpm dev:web"], env);
  } else {
    startDetached("pnpm", ["exec", "tsx", "apps/api/src/server.ts"], env);
    startDetached("pnpm", ["dev:web"], env);
  }
  await waitHttp(`http://127.0.0.1:${API_PORT}/api/health`, 60000, "scratch api");
  await waitHttp(`http://127.0.0.1:${WEB_PORT}/`, 60000, "dev web");

  const base = `http://127.0.0.1:${API_PORT}`;
  let seeded = 0;
  for (let i = 0; i < 1000; i++) {
    const res = await fetch(`${base}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `r57 perf todo ${String(i).padStart(4, "0")}`, quadrant: "q1", dueDate: null }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status !== 201) throw new Error(`seed todo ${i} -> ${res.status}`);
    seeded++;
  }

  browser = findBrowser();
  const profile = join(scratch, "edge-profile");
  const portFile = join(profile, "DevToolsActivePort");
  const proc = spawn(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--no-default-browser-check", "--force-device-scale-factor=1",
    "--window-size=1280,900", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  procs.push(proc);
  const port = await waitFor(30000, async () => {
    try {
      const txt = (await import("node:fs")).readFileSync(portFile, "utf8").trim().split(/\r?\n/)[0];
      return Number(txt || 0) || null;
    } catch { return null; }
  }, "CDP port");
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no CDP page target");

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("CDP websocket error"));
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(String(ev.data)); } catch { return; }
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`CDP ${String(msg.error.message)}`));
    else resolve(msg.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(res.exceptionDetails)}`);
    return res.result.value;
  };
  const metric = (metrics, name) => metrics.find((m) => m.name === name)?.value ?? 0;

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Performance.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${WEB_PORT}/?page=todos` });
  await waitFor(90000, async () => {
    const n = await evalJs("document.querySelectorAll('[data-todo-id]').length");
    return Number(n) >= 1000 ? Number(n) : null;
  }, "1000 rendered todo rows");
  const renderedRows = await evalJs("document.querySelectorAll('[data-todo-id]').length");

  await evalJs("document.querySelector('[data-state=\"global-search-input\"]').focus()");
  await sleep(120);
  const before = (await send("Performance.getMetrics")).metrics;
  const text = "性能优化输入卡顿基线abcdefg"; // 17 chars
  if ([...text].length !== 17) throw new Error(`input length ${[...text].length} != 17`);
  for (const ch of text) {
    await send("Input.insertText", { text: ch });
    await sleep(15);
  }
  await sleep(50);
  const after = (await send("Performance.getMetrics")).metrics;
  const scriptMs = (metric(after, "ScriptDuration") - metric(before, "ScriptDuration")) * 1000;
  const pass = scriptMs < THRESHOLD_MS;
  process.stdout.write(JSON.stringify({
    ok: pass,
    seeded,
    renderedRows,
    inputChars: [...text].length,
    scriptDurationMs: Number(scriptMs.toFixed(1)),
    thresholdMs: THRESHOLD_MS,
  }) + "\n");
  if (!pass) process.exitCode = 1;
}

try {
  await main();
} catch (err) {
  process.stderr.write(`r57-perf-cdp failed: ${err && err.stack ? err.stack : String(err)}\n`);
  process.exitCode = 1;
} finally {
  try { if (ws) ws.close(); } catch { /* ignore */ }
  for (const p of procs) killTree(p);
  try { rmSync(scratch, { recursive: true, force: true }); } catch { /* ignore */ }
}
