// scripts/r47-firstuse-cdp.mjs - r47 "first use" full chain (headless CDP, ASCII only).
// Real API + real browser clicks: create conversation -> send mixed message (gate on)
// -> read-only executes / write pending card -> click confirm (real write) ->
// another pending -> click discard (zero write) -> reload keeps state -> probes cleaned.
// Usage: node scripts/r47-firstuse-cdp.mjs --api 8787 --web 5173 --browser <edge.exe>
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (key && key.startsWith("--")) args[key.slice(2)] = process.argv[i + 1] ?? "";
}
const api = Number(args.api || 8787);
const web = Number(args.web || 5173);
const browser = args.browser;
if (!browser) throw new Error("missing --browser");

const checks = [];
function check(cond, label) {
  checks.push({ ok: Boolean(cond), label });
  console.log(`${cond ? "  ok" : "  FAIL"} ${label}`);
}
const profile = mkdtempSync(join(tmpdir(), "r47-firstuse-cdp-"));
let proc = null;
let ws = null;
let convId = 0;
const madeTitles = [];
function killBrowser() {
  if (proc && proc.pid) {
    try { spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* gone */ }
  }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* gone */ }
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
  // 0. create a real conversation over HTTP
  const stamp = `r47-firstuse-${Date.now()}`;
  const conv = await fetch(`http://127.0.0.1:${api}/api/conversations`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: stamp }),
  }).then((r) => r.json());
  convId = conv.id;
  check(convId > 0, "seed: real conversation created over HTTP");

  // 1. headless browser + CDP
  proc = spawn(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--no-default-browser-check", "--force-device-scale-factor=1",
    "--window-size=1280,1000", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  const port = await waitFor(25000, async () => {
    try { return Number(readFileSync(portFile, "utf8").trim().split(/\r?\n/)[0] || 0); }
    catch { return 0; }
  }, "DevToolsActivePort");
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no CDP page target");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("CDP ws error")); });
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
  const evalJs = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(res.exceptionDetails)}`);
    return res.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");

  // 2. Open chat deep-linked to the real conversation.
  await send("Page.navigate", { url: `http://127.0.0.1:${web}/?page=chat&convId=${convId}` });
  await waitFor(20000, async () => {
    try { return (await evalJs("document.querySelectorAll('[data-state=\"chat-composer\"]').length")) === 1; }
    catch { return false; }
  }, "chat composer rendered");
  check((await evalJs("document.querySelector('[data-state=\"chat-auto-toggle\"] input')?.checked")) === false, "autoExecute default off");

  // 3. Send a mixed message via the UI (write + read).
  const t1 = `${stamp}-confirm`;
  madeTitles.push(t1);
  await evalJs(`(() => {
    const ta = document.querySelector('[data-state="chat-composer"] textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${JSON.stringify(`新建待办：${t1}，然后列出待办`)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(200);
  await evalJs(`(() => { document.querySelector('[data-state="chat-composer"] button').click(); return true; })()`);
  await waitFor(20000, async () => {
    try { return (await evalJs("document.querySelectorAll('[data-state=\"chat-pending-card\"]').length")) >= 1; }
    catch { return false; }
  }, "pending confirmation card rendered");
  check((await evalJs("document.querySelectorAll('[data-state=\"chat-pending-card\"]').length")) === 1, "mixed: exactly one pending write card");
  check((await evalJs("document.querySelectorAll('[data-state=\"bubble-tool\"] .tool-call').length")) >= 1, "mixed: read-only call executed directly");

  // 4. HTTP truth: write NOT landed yet, pending in DB.
  let todos = await fetch(`http://127.0.0.1:${api}/api/todos`).then((r) => r.json());
  check(!todos.todos.some((t) => t.title === t1), "gate: write not landed before confirm");
  let msgs = await fetch(`http://127.0.0.1:${api}/api/conversations/${convId}/messages`).then((r) => r.json());
  check(msgs.messages.flatMap((m) => m.toolCalls || []).some((c) => c.confirmStatus === "pending"), "gate: pending persisted in DB");

  // 5. Click 确认执行 on the real card.
  await evalJs(`(() => { document.querySelector('[data-state="chat-confirm-btn"]').click(); return true; })()`);
  await waitFor(20000, async () => {
    try {
      todos = await fetch(`http://127.0.0.1:${api}/api/todos`).then((r) => r.json());
      return todos.todos.some((t) => t.title === t1);
    } catch { return false; }
  }, "confirmed write landed");
  check(todos.todos.some((t) => t.title === t1), "confirm: real todo created via UI click");

  // 6. Second message -> discard.
  const t2 = `${stamp}-discard`;
  madeTitles.push(t2);
  await evalJs(`(() => {
    const ta = document.querySelector('[data-state="chat-composer"] textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${JSON.stringify(`新建待办：${t2}`)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(200);
  await evalJs(`(() => { document.querySelector('[data-state="chat-composer"] button').click(); return true; })()`);
  await waitFor(20000, async () => {
    try { return (await evalJs("document.querySelectorAll('[data-state=\"chat-pending-card\"]').length")) >= 1; }
    catch { return false; }
  }, "second pending card rendered");
  await evalJs(`(() => { document.querySelector('[data-state="chat-discard-btn"]').click(); return true; })()`);
  await waitFor(20000, async () => {
    try {
      msgs = await fetch(`http://127.0.0.1:${api}/api/conversations/${convId}/messages`).then((r) => r.json());
      return msgs.messages.flatMap((m) => m.toolCalls || []).some((c) => c.confirmStatus === "discarded");
    } catch { return false; }
  }, "discard persisted");
  todos = await fetch(`http://127.0.0.1:${api}/api/todos`).then((r) => r.json());
  check(!todos.todos.some((t) => t.title === t2), "discard: zero write via UI click");
  check(msgs.messages.flatMap((m) => m.toolCalls || []).some((c) => c.confirmStatus === "discarded"), "discard: status=discarded persisted");

  // 7. Reload keeps state.
  await send("Page.reload", { ignoreCache: true });
  await waitFor(20000, async () => {
    try { return (await evalJs("document.querySelectorAll('[data-state=\"bubble-tool\"]').length")) >= 2; }
    catch { return false; }
  }, "reloaded tool bubbles");
  check((await evalJs("document.querySelectorAll('[data-state=\"bubble-tool\"]').length")) >= 2, "reload: tool bubbles persist");
  check((await evalJs("document.body.innerText.includes('已确认')")) === true, "reload: confirmed status visible");
  check((await evalJs("document.body.innerText.includes('已放弃')")) === true, "reload: discarded status visible");

  const failed = checks.filter((c) => !c.ok);
  console.log(`\nR47 FIRSTUSE: ${failed.length === 0 ? "ALL GREEN" : `${failed.length} FAILED`} (${checks.length} checks)`);
  if (failed.length > 0) process.exitCode = 1;
} catch (err) {
  console.error(`R47 FIRSTUSE crashed: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 1;
} finally {
  // cleanup: delete only this round's probes
  try {
    const todos = await fetch(`http://127.0.0.1:${api}/api/todos`).then((r) => r.json());
    for (const t of todos.todos) {
      if (madeTitles.includes(t.title)) await fetch(`http://127.0.0.1:${api}/api/todos/${t.id}`, { method: "DELETE" });
    }
    if (convId) await fetch(`http://127.0.0.1:${api}/api/conversations/${convId}`, { method: "DELETE" });
    console.log("cleanup: probes deleted");
  } catch { console.log("cleanup: best effort"); }
  killBrowser();
  await sleep(200);
}
