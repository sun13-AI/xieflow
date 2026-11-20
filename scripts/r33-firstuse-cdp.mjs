// scripts/r33-firstuse-cdp.mjs - r33 "first use" full chain proof (ASCII only).
// Real headless CDP: Ctrl+K opens global search -> type keyword -> live cross-source
// HTTP results -> keyboard select -> click meeting result -> deep-link jump + locate
// -> reload keeps deep-link -> HTTP truth -> probe cleanup. Never opens a visible window.
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

const profile = mkdtempSync(join(tmpdir(), "r33-firstuse-cdp-"));
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

const KEY = `R33CDP${Date.now()}`;
const ids = {};
try {
  // 0) seed four real modules with the same keyword (title hits + one body-only hit)
  const todo = await api("/api/todos", "POST", { title: `${KEY} 待办`, quadrant: "q1" });
  ids.todo = todo.json?.id;
  const doc = await api("/api/documents", "POST", { title: `${KEY} 文档` });
  ids.doc = doc.json?.id;
  const kb = await api("/api/knowledge/ingest", "POST", { title: "跨源检索规范", sourceType: "text", content: `正文记录 ${KEY} 的跨模块结论。` });
  ids.kb = kb.json?.doc?.id;
  const room = await api("/api/rooms", "POST", { name: `${KEY} 会议室`, location: "", capacity: 8, active: true });
  ids.room = room.json?.id;
  const meeting = await api("/api/meetings", "POST", { title: `${KEY} 会议`, roomId: ids.room, date: "2026-11-21", start: "09:00", end: "10:00", organizer: "张三", attendees: [] });
  ids.meeting = meeting.json?.id;
  check(Boolean(ids.todo && ids.doc && ids.kb && ids.room && ids.meeting), "seeded 4 modules + room via real HTTP");

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
  const exists = (sel) => evalJs(`Boolean(document.querySelector(${JSON.stringify(sel)}))`);
  async function key(k, code, vk, modifiers = 0) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
  }
  async function click(sel) {
    const p = await evalJs(`(() => { var el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; var r=el.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`);
    if (!p) throw new Error(`click target not found: ${sel}`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, button: "none" });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
  }
  const setInput = (sel, value) => evalJs(`(() => {
    var el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false;
    var proto=window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});
    el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
    return el.value;
  })()`);

  // 1) open app, Ctrl+K focuses the top-bar search box
  await send("Page.navigate", { url: `http://127.0.0.1:${webPort}/?page=home` });
  await waitFor(20000, async () => exists('[data-state="global-search-input"]'), "global search input ready");
  await key("k", "KeyK", 75, 2); // Ctrl+K
  check(await exists('[data-state="global-search-panel"]'), "Ctrl+K opened the search panel");
  const focused = await waitFor(5000, async () => {
    return await evalJs(`Boolean(document.activeElement && document.activeElement.getAttribute('data-state')==='global-search-input')`);
  }, "Ctrl+K focus").catch(() => false);
  check(focused, "Ctrl+K focused the input");

  // 2) type the shared keyword -> real /api/search returns four sources
  check(await setInput('[data-state="global-search-input"]', KEY) === KEY, "typed the shared keyword");
  await waitFor(20000, async () => {
    const n = await evalJs(`document.querySelectorAll('[data-state="global-search-result"]').length`);
    return n >= 4 ? n : 0;
  }, "live search results across 4 modules");
  const types = await evalJs(`Array.from(document.querySelectorAll('[data-state="global-search-group"]')).map(e=>e.getAttribute('data-type'))`);
  check(["todos", "documents", "knowledge_docs", "meetings"].every((t) => types.includes(t)), `result groups: ${types.join(",")}`);
  check(await exists('[data-state="global-search-highlight"]'), "matched text highlighted in results");

  // 3) keyboard down selects a result (real key event)
  await key("ArrowDown", "ArrowDown", 40);
  const selected = await evalJs(`document.querySelectorAll('[data-state="global-search-result"][data-selected="1"]').length`);
  check(selected === 1, "ArrowDown selected exactly one result");

  // 4) click the meeting result -> deep-link jump + locate
  await click('[data-state="global-search-result"][data-result-type="meetings"]');
  await waitFor(20000, async () => exists('[data-state="meetings-locate-note"]'), "meeting tab located after click");
  const href = await evalJs(`window.location.href`);
  check(href.includes("page=meetings") && href.includes(`meetingId=${ids.meeting}`), "URL carries page=meetings + meetingId deep-link");
  const focusedId = await waitFor(20000, async () => {
    const id = await evalJs(`(() => { var e=document.querySelector('[data-state="meeting-grid-bar-focused"]'); return e ? e.getAttribute('data-booking-id') : null; })()`);
    return id || null;
  }, "target meeting highlighted in the grid");
  check(String(focusedId) === String(ids.meeting), `highlighted booking id equals the clicked meeting id (${focusedId})`);

  // 5) reload keeps the deep-link and the locating state
  await send("Page.reload", { ignoreCache: true });
  await waitFor(20000, async () => exists('[data-state="meeting-grid-bar-focused"]'), "reload kept deep-link locating");
  const href2 = await evalJs(`window.location.href`);
  check(href2.includes("page=meetings") && href2.includes(`meetingId=${ids.meeting}`), "reload kept page + meetingId deep-link params");

  // 6) HTTP truth: search still returns the four probes; deep-link id resolves
  const s = await api(`/api/search?q=${encodeURIComponent(KEY)}`);
  check(s.status === 200 && (s.json?.results ?? []).length >= 4, "HTTP re-search returns the four probes");
  const m = await api(`/api/meetings/${ids.meeting}`);
  check(m.status === 200 && m.json?.title === `${KEY} 会议`, "deep-link id resolves to the clicked meeting");
} catch (err) {
  check(false, `chain error: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  try { if (ws) ws.close(); } catch { }
  killBrowser();
  // cleanup probe rows only (never touch pre-existing data)
  for (const [path, id] of [
    ["/api/meetings", ids.meeting], ["/api/rooms", ids.room], ["/api/knowledge/docs", ids.kb],
    ["/api/documents", ids.doc], ["/api/todos", ids.todo],
  ]) {
    if (id) { try { await api(`${path}/${id}`, "DELETE"); } catch { } }
  }
}

if (failures.length > 0) {
  process.stdout.write(`R33 FIRSTUSE: FAIL (${failures.length})\n`);
  process.exit(1);
}
process.stdout.write("R33 FIRSTUSE: ALL GREEN\n");
