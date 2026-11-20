// scripts/r37-firstuse-cdp.mjs - r37 "first use" full chain proof (ASCII only).
// Real headless CDP: seed table+rows -> open bases -> select view -> set grouping in UI
// -> see summary -> collapse group -> reload keeps groupSpec -> HTTP truth -> cleanup.
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
let tableId = 0;
let viewId = 0;
function check(cond, label) {
  if (cond) process.stdout.write(`  ok ${label}\n`);
  else { failures.push(label); process.stdout.write(`  FAIL ${label}\n`); }
}

const profile = mkdtempSync(join(tmpdir(), "r37-firstuse-cdp-"));
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

const KEY = `R37CDP${Date.now()}`;

try {
  // 0) seed a table with three known rows over real HTTP
  const tbl = await api("/api/tables", "POST", { name: `${KEY} group table` });
  tableId = tbl.json.id;
  const fld = await api(`/api/tables/${tableId}/fields`);
  const statusId = fld.json.fields.find((f) => f.name === "状态").id;
  const amountId = fld.json.fields.find((f) => f.name === "金额").id;
  const nameId = fld.json.fields.find((f) => f.name === "名称").id;
  const mkRow = (name, status, amount) => api(`/api/tables/${tableId}/records`, "POST", {
    data: { [String(nameId)]: name, [String(statusId)]: status, [String(amountId)]: amount },
  });
  const r1 = await mkRow(`${KEY} A`, "未开始", 10);
  const r2 = await mkRow(`${KEY} B`, "未开始", 20);
  const r3 = await mkRow(`${KEY} C`, "进行中", 30);
  const r4 = await mkRow(`${KEY} D`, null, 5);
  check(tbl.status === 201 && r1.status === 201 && r2.status === 201 && r3.status === 201 && r4.status === 201, "seeded table + 4 amount rows via real HTTP");
  const view = await api(`/api/tables/${tableId}/views`, "POST", { name: `${KEY} view` });
  viewId = view.json.id;
  check(view.status === 201 && view.json.groupSpec === null, "seeded ungrouped view via real HTTP");

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
  async function setSelect(sel, value) {
    const done = await evalJs(`(() => {
      var el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false;
      var setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
      setter.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return el.value === ${JSON.stringify(String(value))};
    })()`);
    if (!done) throw new Error(`setSelect failed: ${sel}=${value}`);
  }
  const exists = (sel) => evalJs(`Boolean(document.querySelector(${JSON.stringify(sel)}))`);
  const inner = (sel) => evalJs(`(() => { var el=document.querySelector(${JSON.stringify(sel)}); return el ? el.innerText : ''; })()`);

  // 1) open bases page and select the seeded view
  await send("Page.navigate", { url: `http://127.0.0.1:${webPort}/?page=bases&tableId=${tableId}&viewId=${viewId}` });
  await waitFor(25000, async () => await exists(`[data-view-id="${viewId}"]`) ? true : null, "view chip");
  await click(`[data-view-id="${viewId}"]`);
  await waitFor(15000, async () => await exists('[data-state="bases-group-dropdown"]') ? true : null, "group dropdown");
  check((await inner('[data-state="bases-view-summary"]')).includes(KEY), "view selected, real view summary visible");

  // 2) set grouping through the UI dropdown
  await click('[data-state="bases-group-toggle"]');
  await waitFor(10000, async () => await exists('[data-state="bases-group-field"]') ? true : null, "group fields");
  await setSelect('[data-state="bases-group-field"]', statusId);
  await setSelect('[data-state="bases-group-aggregator"]', "sum");
  await setSelect('[data-state="bases-group-aggregate-field"]', amountId);
  await click('[data-state="bases-group-apply"]');
  await waitFor(20000, async () => await evalJs(`document.querySelectorAll('[data-state="bases-group-head"]').length`) >= 2 ? true : null, "group heads after apply");
  const heads = await evalJs(`Array.from(document.querySelectorAll('[data-state="bases-group-head"]')).map(function(e){return e.innerText;})`);
  check(heads.some((t) => t.includes("未开始")), "grouped by status: not-started group visible");
  check(heads.some((t) => t.includes("（空值）")), "empty values form an independent group");
  const sums = await evalJs(`Array.from(document.querySelectorAll('[data-state="bases-group-summary-value"]')).map(function(e){return e.innerText;})`);
  check(sums.includes("30"), "summary row shows hand-calculated sum=30 for 10+20");

  // 3) collapse a group and verify its rows disappear
  const rowsBefore = await evalJs(`document.querySelectorAll('[data-record-id]').length`);
  await click('[data-state="bases-group-head"]');
  await sleep(500);
  const rowsAfter = await evalJs(`document.querySelectorAll('[data-record-id]').length`);
  check(rowsBefore === 4 && rowsAfter < rowsBefore, `collapse hides group rows (${rowsBefore} -> ${rowsAfter})`);

  // 4) reload: groupSpec and grouped rendering persist
  await send("Page.reload", { ignoreCache: true });
  await waitFor(25000, async () => await evalJs(`document.querySelectorAll('[data-state="bases-group-head"]').length`) >= 2 ? true : null, "group heads after reload");
  check((await inner('[data-state="bases-view-summary"]')).includes("按状态分组"), "reload keeps group spec in view summary");

  // 5) independent HTTP truth
  const truth = await api(`/api/views/${viewId}`);
  check(truth.status === 200 && truth.json.groupSpec?.aggregator === "sum" && truth.json.groupSpec?.fieldId === statusId, "HTTP view truth confirms persisted groupSpec");
  const grouped = await api(`/api/views/${viewId}/grouped`);
  check(grouped.status === 200 && grouped.json.groups[0]?.summary.value === 30, "HTTP grouped truth confirms sum=30");
  check(grouped.json.totalRecords === 4, "HTTP grouped truth confirms 4 records");
} catch (err) {
  check(false, `chain error: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  try { if (ws) ws.close(); } catch { }
  killBrowser();
  if (viewId) { try { await api(`/api/views/${viewId}`, "DELETE"); } catch { } }
  if (tableId) { try { await api(`/api/tables/${tableId}`, "DELETE"); } catch { } }
}
if (failures.length > 0) {
  process.stdout.write(`R37 FIRSTUSE: FAIL (${failures.length})\n`);
  process.exit(1);
}
process.stdout.write("R37 FIRSTUSE: ALL GREEN\n");
