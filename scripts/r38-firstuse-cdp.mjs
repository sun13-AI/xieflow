// scripts/r38-firstuse-cdp.mjs - r38 "first use" full chain proof (ASCII only).
// Real headless CDP: seed project+member -> open board -> create card with labels /
// assignee / due date through the real UI -> see overdue red badge -> label filter ->
// reload keeps metadata -> HTTP truth -> cleanup. Never opens a visible window.
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
let projectId = 0;
let memberId = 0;
function check(cond, label) {
  if (cond) process.stdout.write(`  ok ${label}\n`);
  else { failures.push(label); process.stdout.write(`  FAIL ${label}\n`); }
}

const profile = mkdtempSync(join(tmpdir(), "r38-firstuse-cdp-"));
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
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { }
  return { status: res.status, json, text };
}

const KEY = `R38CDP${Date.now()}`;

try {
  // 0) seed project (auto three columns) and one active member over real HTTP
  const proj = await api("/api/projects", "POST", { name: `${KEY} board` });
  projectId = proj.json.id;
  const mem = await api("/api/members", "POST", {
    name: `${KEY} owner`, email: "r38.cdp@example.com", status: "active",
  });
  memberId = mem.json.id;
  const cols = await api(`/api/projects/${projectId}/columns`);
  check(proj.status === 201 && mem.status === 201 && cols.json.columns.length === 3, "seeded project + member + three columns via real HTTP");

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
  async function click(sel) {
    const p = await evalJs(`(() => { var el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; var r=el.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`);
    if (!p) throw new Error(`click target not found: ${sel}`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, button: "none" });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
  }
  async function setInput(sel, value) {
    const done = await evalJs(`(() => {
      var el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false;
      var setter=Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;
      setter.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event('input',{bubbles:true}));
      return el.value === ${JSON.stringify(String(value))};
    })()`);
    if (!done) throw new Error(`setInput failed: ${sel}=${value}`);
  }
  const exists = (sel) => evalJs(`Boolean(document.querySelector(${JSON.stringify(sel)}))`);
  const inner = (sel) => evalJs(`(() => { var el=document.querySelector(${JSON.stringify(sel)}); return el ? el.innerText : ''; })()`);

  // 1) open board with the seeded project deep-linked
  await send("Page.navigate", { url: `http://127.0.0.1:${webPort}/?page=board&projectId=${projectId}` });
  await waitFor(25000, async () => await exists('[data-state="board-columns"]') ? true : null, "board columns");

  // 2) open create modal, fill title / labels / due date
  await click('[data-state="board-ready"] .btn-primary');
  await waitFor(10000, async () => await exists('[data-state="board-modal"]') ? true : null, "create modal");
  await setInput('[data-state="board-meta-title"]', `${KEY} 元数据卡`);
  await setInput('[data-state="board-meta-labels-input"]', "前端，紧急，前端");
  await setInput('[data-state="board-meta-due-input"]', "2020-01-01");
  check((await inner('[data-state="board-meta-labels-preview"]')).includes("前端"), "label chip preview deduped in edit panel");

  // 3) pick the seeded member through the real MemberPicker
  await click('[data-action="board-assignee-pick-open"]');
  await waitFor(10000, async () => await exists('[data-action="board-assignee-pick-search"]') ? true : null, "member picker search");
  await setInput('[data-action="board-assignee-pick-search"]', KEY);
  await click('[data-action="board-assignee-pick-search-run"]');
  await waitFor(15000, async () => await exists('[data-state="member-picker-item"]') ? true : null, "member picker result");
  await click('[data-state="member-picker-item"]');
  await waitFor(10000, async () => await exists('[data-state="board-assignee-chosen"]') ? true : null, "chosen member");
  check((await inner('[data-state="board-assignee-chosen"]')).includes(KEY), "assignee chosen from real org directory");

  // 4) submit: real POST creates the card with metadata
  await click('[data-action="board-meta-submit"]');
  await waitFor(20000, async () => await evalJs(`document.querySelectorAll('[data-state="board-card"]').length`) > 0 ? true : null, "created card on board");
  check((await inner('[data-state="board-card-labels"]')).includes("前端"), "card face shows label chips");
  check((await inner('[data-state="board-card-assignee"]')).includes(KEY), "card face shows assignee name");
  check(await exists('[data-state="board-card-overdue"]'), "card face shows overdue red badge for past due date");

  // 5) label filter through the real dropdown
  await evalJs(`(() => { var el=document.querySelector('[data-state="board-label-filter"]'); var s=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; s.call(el,'前端'); el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  await sleep(500);
  check((await inner('[data-state="board-filter-count"]')).includes("1"), "label filter narrows board to the tagged card");

  // 6) reload: metadata persists
  await send("Page.reload", { ignoreCache: true });
  await waitFor(25000, async () => await evalJs(`document.querySelectorAll('[data-state="board-card"]').length`) > 0 ? true : null, "cards after reload");
  check(await exists('[data-state="board-card-overdue"]'), "reload keeps overdue red badge");

  // 7) independent HTTP truth
  const list = await api(`/api/boards/${projectId}/cards?label=${encodeURIComponent("前端")}`);
  check(list.status === 200 && list.json.count === 1, "HTTP truth confirms one tagged card");
  const card = list.json.cards[0];
  check(card.labels.includes("前端") && card.labels.includes("紧急"), "HTTP truth confirms normalized labels");
  check(card.assigneeMemberId === memberId, "HTTP truth confirms assignee member id");
  const overdue = await api(`/api/boards/${projectId}/overdue`);
  check(overdue.status === 200 && overdue.json.count === 1, "HTTP overdue endpoint hand-count matches UI red badge");
} catch (err) {
  check(false, `chain error: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  try { if (ws) ws.close(); } catch { }
  killBrowser();
  if (projectId) { try { await api(`/api/projects/${projectId}`, "DELETE"); } catch { } }
  if (memberId) { try { await api(`/api/members/${memberId}`, "DELETE"); } catch { } }
}
if (failures.length > 0) {
  process.stdout.write(`R38 FIRSTUSE: FAIL (${failures.length})\n`);
  process.exit(1);
}
process.stdout.write("R38 FIRSTUSE: ALL GREEN\n");
