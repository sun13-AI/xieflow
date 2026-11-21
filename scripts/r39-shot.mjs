// scripts/r39-shot.mjs - r39 one-shot headless CDP screenshot helper (ASCII only).
// Usage: node scripts/r39-shot.mjs --browser <path> --url <url> --out <png> --width <n> --height <n>
// The browser is launched headless with a fresh temp profile, navigated to the
// exact URL, and Page.captureScreenshot writes the PNG. No visible window.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (key && key.startsWith("--")) args[key.slice(2)] = process.argv[i + 1] ?? "";
}
const browser = args.browser;
const url = args.url;
const out = args.out;
const width = Number(args.width || 1280);
const height = Number(args.height || 900);
if (!browser || !url || !out) throw new Error("missing --browser --url --out");

const profile = mkdtempSync(join(tmpdir(), "r39-shot-cdp-"));
const portFile = join(profile, "DevToolsActivePort");
let proc = null;
let ws = null;
function killBrowser() {
  if (proc && proc.pid) {
    try { spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" }); } catch { }
  }
  try { rmSync(profile, { recursive: true, force: true }); } catch { }
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

try {
  proc = spawn(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--no-default-browser-check", "--force-device-scale-factor=1",
    "--window-size=1280,900", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  const port = await waitFor(25000, async () => {
    try { return Number(readFileSync(portFile, "utf8").trim().split(/\r?\n/)[0] || 0); }
    catch { return 0; }
  }, "DevToolsActivePort");
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
    try { msg = JSON.parse(ev.data); } catch { return; }
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
  async function evalJs(expression) {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(res.exceptionDetails)}`);
    return res.result.value;
  }

  await send("Page.enable");
  await send("Runtime.enable");

  // Capture-time seam only (no product-code change): this dev box persists
  // server mode "remote". Pin the mode probe to local and neutralize 401s from
  // unauthenticated background business probes so ?shot= pins render their
  // states instead of redirecting to login. No database/user setting is touched.
  await send("Fetch.enable", {
    patterns: [{ urlPattern: "*/api/*", requestStage: "Response" }],
  });
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.method === "Fetch.requestPaused") {
      void (async () => {
        const { requestId, request, responseStatusCode } = msg.params;
        if (request.method === "GET" && /\/api\/auth\/mode/.test(request.url)) {
          await send("Fetch.fulfillRequest", {
            requestId,
            responseCode: 200,
            responseHeaders: [{ name: "content-type", value: "application/json" }],
            body: Buffer.from(JSON.stringify({ mode: "local", envMode: "local" }), "utf8").toString("base64"),
          });
        } else if (responseStatusCode === 401) {
          // Capture-time empty-state payload: every common list field is an
          // empty array so no page renderer crashes while background probes
          // are unauthenticated. It never touches the database or user data.
          const emptyState = {
            schemaVersion: 25,
            settings: [], todos: [], schedules: [], notifications: [], unread: 0,
            summary: { today: 0, tomorrow: 0, week: 0, byQuadrant: { q1: 0, q2: 0, q3: 0, q4: 0 } },
            docs: [], documents: [], blocks: [], chunks: [], results: [], knowledge: [],
            projects: [], columns: [], cards: [], tables: [], fields: [], records: [], views: [],
            rooms: [], meetings: [], approvals: [], steps: [], assets: [], transactions: [],
            tasks: [], members: [], departments: [], conversations: [], messages: [],
            artifacts: [], tools: [], mindmaps: [], whiteboards: [], items: [], groups: [],
            metrics: [], reports: [], range: null,
            lastChangeAt: null, total: 0, count: 0, conflicts: [], currentVersion: 0,
            remote: {}, base: {},
          };
          await send("Fetch.fulfillRequest", {
            requestId,
            responseCode: 200,
            responseHeaders: [{ name: "content-type", value: "application/json" }],
            body: Buffer.from(JSON.stringify(emptyState), "utf8").toString("base64"),
          });
        } else {
          await send("Fetch.continueRequest", { requestId });
        }
      })();
      return;
    }
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`CDP ${String(msg.error.message)}`));
    else resolve(msg.result);
  };
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  await waitFor(20000, async () => {
    const state = await evalJs("document.readyState");
    return state === "complete" ? true : null;
  }, "document complete");
  // Wait for real rendered content, not just DOM ready: a slow first paint
  // otherwise produces a blank PNG (r39 shell chat/docs lesson).
  await waitFor(20000, async () => {
    const len = await evalJs("document.body && document.body.innerText ? document.body.innerText.length : 0");
    return Number(len) > 80 ? true : null;
  }, "rendered body text");
  await sleep(1200);
  const href = await evalJs("location.href");
  const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  process.stdout.write(JSON.stringify({ ok: true, out, width, height, href }) + "\n");
} catch (err) {
  process.stderr.write(`r39-shot failed: ${err && err.stack ? err.stack : String(err)}\n`);
  process.exitCode = 1;
} finally {
  try { if (ws) ws.close(); } catch { }
  killBrowser();
}
