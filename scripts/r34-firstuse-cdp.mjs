// scripts/r34-firstuse-cdp.mjs - r34 "first use" full chain proof (ASCII only).
// Real headless CDP: create A/B/C -> set B<-A, C<-B -> 409 blocked -> complete A
// -> B unlocked -> complete B -> reload keeps state -> HTTP truth -> cleanup.
// Never opens a visible window.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const args = Object.fromEntries(process.argv.slice(2).reduce((out, a, i, arr) => {
  if (a.startsWith("--")) out.push([a.slice(2), arr[i + 1] ?? ""]);
  return out;
}, []));
const browser = args.browser;
const webPort = Number(args["web-port"] || 5173);
const apiPort = Number(args["api-port"] || 8787);
if (!browser) throw new Error("missing --browser");

const failures = [];
function check(cond, label) {
  if (cond) process.stdout.write(`  ok ${label}\n`);
  else { failures.push(label); process.stdout.write(`  FAIL ${label}\n`); }
}

const profile = mkdtempSync(join(tmpdir(), "r34-firstuse-cdp-"));
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
async function api(path, method = "GET", body) {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const KEY = `R34CDP${Date.now()}`;
const ids = {};
try {
  // 0) seed three real todos and the A<-B<-C dependency chain over HTTP
  const a = await api("/api/todos", "POST", { title: `${KEY} A`, quadrant: "q1" });
  const b = await api("/api/todos", "POST", { title: `${KEY} B`, quadrant: "q1" });
  const c = await api("/api/todos", "POST", { title: `${KEY} C`, quadrant: "q1" });
  ids.A = a.json?.id; ids.B = b.json?.id; ids.C = c.json?.id;
  check(Boolean(ids.A && ids.B && ids.C), "seeded three todos via real HTTP");
  const d1 = await api(`/api/todos/${ids.B}/dependencies`, "POST", { dependsOnTodoId: ids.A });
  const d2 = await api(`/api/todos/${ids.C}/dependencies`, "POST", { dependsOnTodoId: ids.B });
  check(d1.status === 201 && d2.status === 201, "set A<-B<-C dependency chain");
  const blockedBefore = await api(`/api/todos/${ids.B}`, "PATCH", { status: "done" });
  check(blockedBefore.status === 409 && blockedBefore.json?.code === "DEPENDENCY_BLOCKED", "HTTP 409 blocked while A is open");

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
    ws.onerror = (e) => reject(new Error(`CDP websocket error: ${String(e)}`));
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
  async function click(sel) {
    const p = await evalJs(`(() => { var el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; var r=el.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`);
    if (!p) throw new Error(`click target not found: ${sel}`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, button: "none" });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
  }
  const clickIn = (id, attr, value) => evalJs(`(() => {
    var li=document.querySelector('[data-todo-id="${id}"]'); if(!li) return false;
    var btns=Array.from(li.querySelectorAll('[${attr}]'));
    var el=btns.find(function(b){return b.getAttribute('${attr}')===${JSON.stringify(value)};});
    if(!el) return false; el.click(); return true;
  })()`);

  // 1) open todos page with the real seeded data
  await send("Page.navigate", { url: `http://127.0.0.1:${webPort}/?page=todos` });
  await waitFor(20000, async () => exists(`[data-todo-id="${ids.B}"]`), "todos list with seeded probes");
  async function exists(sel) { return evalJs(`Boolean(document.querySelector(${JSON.stringify(sel)}))`); }
  const blockedTextB = await evalJs(`document.querySelector('[data-todo-id="${ids.B}"]').innerText`);
  check(blockedTextB.includes("被 1 项阻塞"), "B list item shows blocked badge");

  // 2) open B dependency panel -> A shown as prereq with status
  check(await clickIn(ids.B, "data-action", "dep-toggle"), "clicked B prereq toggle");
  await waitFor(10000, async () => exists(`[data-state="dep-panel"][data-todo-id="${ids.B}"]`), "B prereq panel opened");
  await waitFor(10000, async () => exists(`[data-state="dep-panel"][data-todo-id="${ids.B}"] [data-state="dep-prereq"]`), "B prereq row loaded");
  const prereqText = await evalJs(`document.querySelector('[data-state="dep-panel"][data-todo-id="${ids.B}"] [data-state="dep-prereq"]').innerText`);
  check(prereqText.includes(`${KEY} A`), "B panel lists A as prerequisite");
  check(prereqText.includes("进行中"), "A prerequisite shows open status badge");

  // 3) try completing B in UI -> inline 409 red bar (no alert)
  check(await evalJs(`(() => {
    var li=document.querySelector('[data-todo-id="${ids.B}"]'); if(!li) return false;
    var btn=Array.from(li.querySelectorAll('button')).find(function(b){return b.textContent.trim()==="完成";});
    if(!btn) return false; btn.click(); return true;
  })()`), "clicked B complete (blocked)");
  await waitFor(10000, async () => exists('[data-state="dep-action-error"]'), "inline 409 error bar");
  const errText = await evalJs(`document.querySelector('[data-state="dep-action-error"]').innerText`);
  check(errText.includes("前置任务未完成"), "409 error bar explains blocked reason");
  check((await api(`/api/todos/${ids.B}`)).json?.status === "open", "B still open after blocked UI attempt");

  // 4) complete A in UI -> B unblocked
  check(await evalJs(`(() => {
    var li=document.querySelector('[data-todo-id="${ids.A}"]'); if(!li) return false;
    var btn=Array.from(li.querySelectorAll('button')).find(function(b){return b.textContent.trim()==="完成";});
    if(!btn) return false; btn.click(); return true;
  })()`), "clicked A complete");
  await waitFor(10000, async () => {
    const t = await evalJs(`document.querySelector('[data-todo-id="${ids.A}"]').innerText`);
    return t.includes("已完成") ? t : null;
  }, "A becomes done in UI");
  const afterA = await evalJs(`document.querySelector('[data-todo-id="${ids.B}"]').innerText`);
  check(!afterA.includes("被 1 项阻塞"), "B blocked badge gone after A done");
  check(afterA.includes("前置已满足"), "B shows prerequisites-satisfied badge");

  // 5) complete B in UI -> success; reload keeps it
  check(await evalJs(`(() => {
    var li=document.querySelector('[data-todo-id="${ids.B}"]'); if(!li) return false;
    var btn=Array.from(li.querySelectorAll('button')).find(function(b){return b.textContent.trim()==="完成";});
    if(!btn) return false; btn.click(); return true;
  })()`), "clicked B complete (unblocked)");
  await waitFor(10000, async () => {
    const t = await evalJs(`document.querySelector('[data-todo-id="${ids.B}"]').innerText`);
    return t.includes("已完成") ? t : null;
  }, "B becomes done in UI");
  await send("Page.reload", { ignoreCache: true });
  await waitFor(20000, async () => exists(`[data-todo-id="${ids.B}"]`), "reload kept todos list");
  const afterReload = await evalJs(`document.querySelector('[data-todo-id="${ids.B}"]').innerText`);
  check(afterReload.includes("已完成"), "reload keeps B done");
  const depsAfter = await api(`/api/todos/${ids.B}/dependencies`);
  check(depsAfter.status === 200 && depsAfter.json?.dependencies?.[0]?.dependsOnTodoId === ids.A, "reload keeps B<-A dependency in HTTP truth");
  check((await api("/api/todos/blocked")).status === 200, "blocked endpoint remains healthy");
} catch (err) {
  check(false, `chain error: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  try { if (ws) ws.close(); } catch { }
  killBrowser();
  for (const id of [ids.C, ids.B, ids.A]) {
    if (id) { try { await api(`/api/todos/${id}`, "DELETE"); } catch { } }
  }
}
if (failures.length > 0) {
  process.stdout.write(`R34 FIRSTUSE: FAIL (${failures.length})\n`);
  process.exit(1);
}
process.stdout.write("R34 FIRSTUSE: ALL GREEN\n");
