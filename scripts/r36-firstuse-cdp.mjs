// scripts/r36-firstuse-cdp.mjs - r36 "first use" full chain proof (ASCII only).
// Real headless CDP: seed data -> generate daily -> switch weekly -> edit markdown
// -> save as document -> open doc page -> reload keeps content -> HTTP truth -> cleanup.
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
const todoIds = [];
const scheduleIds = [];
const docIds = [];
function check(cond, label) {
  if (cond) process.stdout.write(`  ok ${label}\n`);
  else { failures.push(label); process.stdout.write(`  FAIL ${label}\n`); }
}

const profile = mkdtempSync(join(tmpdir(), "r36-firstuse-cdp-"));
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

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
const TOMORROW = `${tomorrowDate.getFullYear()}-${pad(tomorrowDate.getMonth() + 1)}-${pad(tomorrowDate.getDate())}`;
const KEY = `R36CDP${Date.now()}`;

try {
  // 0) seed real business data over HTTP
  const a = await api("/api/todos", "POST", { title: `${KEY} 完成项`, quadrant: "q1" });
  todoIds.push(a.json.id);
  await api(`/api/todos/${a.json.id}`, "PATCH", { status: "done" });
  const b = await api("/api/todos", "POST", { title: `${KEY} 进行中`, quadrant: "q2" });
  todoIds.push(b.json.id);
  const c = await api("/api/todos", "POST", { title: `${KEY} 阻塞项`, quadrant: "q3" });
  todoIds.push(c.json.id);
  await api(`/api/todos/${c.json.id}/dependencies`, "POST", { dependsOnTodoId: b.json.id });
  const d = await api("/api/todos", "POST", { title: `${KEY} 明日待办`, quadrant: "q2", dueDate: TOMORROW });
  todoIds.push(d.json.id);
  const s1 = await api("/api/schedules", "POST", { title: `${KEY} 今日日程`, date: TODAY, start: "09:00", end: "10:00", repeat: "none", todoId: null });
  scheduleIds.push(s1.json.id);
  const s2 = await api("/api/schedules", "POST", { title: `${KEY} 明日日程`, date: TOMORROW, start: "15:00", end: "16:00", repeat: "none", todoId: null });
  scheduleIds.push(s2.json.id);
  check(a.status === 201 && b.status === 201 && c.status === 201 && d.status === 201, "seeded 4 todos via real HTTP");
  check(s1.status === 201 && s2.status === 201, "seeded 2 schedules via real HTTP");

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
  const exists = (sel) => evalJs(`Boolean(document.querySelector(${JSON.stringify(sel)}))`);
  const mdValue = () => evalJs(`document.querySelector('[data-field="wr-markdown"]') ? document.querySelector('[data-field="wr-markdown"]').value : ""`);

  // 1) open report tab with real data, generate daily
  await send("Page.navigate", { url: `http://127.0.0.1:${webPort}/?page=work-reports&type=daily&date=${TODAY}` });
  await waitFor(25000, async () => await exists('[data-state="wr-summary"]') ? true : null, "report summary");
  const dailyMd = await waitFor(10000, async () => {
    const v = await mdValue();
    return v && v.includes("协流日报") ? v : null;
  }, "daily markdown");
  check(dailyMd.includes(`${KEY} 完成项`) && dailyMd.includes(`${KEY} 进行中`), "daily report shows real seeded todos");
  check(dailyMd.includes(`${KEY} 今日日程`) && dailyMd.includes(`${KEY} 明日日程`), "daily report shows today + next-day schedules");
  check((await evalJs(`document.querySelector('[data-state="wr-summary"]').innerText`)).includes("阻塞"), "summary badges visible");

  // 2) real click weekly tab -> weekly title and 7-day aggregation
  await click('[data-action="wr-type"][data-type="weekly"]');
  const weeklyMd = await waitFor(15000, async () => {
    const v = await mdValue();
    return v && v.includes("协流周报") ? v : null;
  }, "weekly markdown");
  check(weeklyMd.includes(`${KEY} 完成项`) && weeklyMd.includes("下周计划"), "weekly switch regenerates 7-day report");
  check((await evalJs(`location.search`)).includes("type=weekly"), "weekly deep-link written to URL");

  // 3) real click daily, edit markdown through native setter + input event
  await click('[data-action="wr-type"][data-type="daily"]');
  await waitFor(15000, async () => {
    const v = await mdValue();
    return v && v.includes("协流日报") ? v : null;
  }, "daily back");
  const edited = await evalJs(`(() => {
    var ta=document.querySelector('[data-field="wr-markdown"]'); if(!ta) return false;
    var setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    setter.call(ta, ta.value + "\\n- " + ${JSON.stringify(KEY)} + " 人工补充\\n");
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    return ta.value.includes(${JSON.stringify(KEY)} + " 人工补充");
  })()`);
  check(Boolean(edited), "markdown textarea accepts real user edit");
  check((await evalJs(`document.querySelector('[data-state="wr-dirty"]').innerText`)).includes("已修改"), "dirty indicator switched after edit");

  // 4) real click save as document -> receipt with document link
  await click('[data-action="wr-save"]');
  const savedText = await waitFor(20000, async () => {
    const t = await evalJs(`(() => { var el=document.querySelector('[data-state="wr-saved"]'); return el ? el.innerText : null; })()`);
    return t && t.includes("已存为文档") ? t : null;
  }, "save receipt");
  check(savedText.includes("已存为文档"), "save-as-document receipt visible");
  const docId = await evalJs(`(() => { var a=document.querySelector('[data-state="wr-saved-link"]'); return a ? Number((a.href.match(/docId=(\\d+)/)||[])[1]) : 0; })()`);
  check(docId > 0, `saved receipt carries real document id (${docId})`);
  if (docId > 0) docIds.push(docId);

  // 5) open the saved document page and reload: content persists
  await send("Page.navigate", { url: `http://127.0.0.1:${webPort}/?page=docs&docId=${docId}` });
  await waitFor(25000, async () => await exists('[data-state="docs-editor"]') ? true : null, "docs editor");
  await waitFor(15000, async () => await evalJs(`document.querySelectorAll('[data-state="docs-block-input"]').length`) > 0 ? true : null, "saved report blocks");
  const blockValues = () => evalJs(`Array.from(document.querySelectorAll('[data-state="docs-block-input"]')).map(function(e){return e.value;}).join('\\n')`);
  check(String(await blockValues()).includes(`${KEY} 人工补充`), "saved report opens in docs page with edited content");
  await send("Page.reload", { ignoreCache: true });
  await waitFor(25000, async () => await exists('[data-state="docs-editor"]') ? true : null, "reloaded docs editor");
  await waitFor(15000, async () => await evalJs(`document.querySelectorAll('[data-state="docs-block-input"]').length`) > 0 ? true : null, "reloaded report blocks");
  check(String(await blockValues()).includes(`${KEY} 人工补充`), "reload keeps the saved report content");

  // 6) independent HTTP truth
  const truth = await api(`/api/documents/${docId}/text`);
  check(truth.status === 200 && truth.text.includes(`${KEY} 人工补充`), "HTTP document text confirms saved content");
  const reportTruth = await api(`/api/reports/daily?date=${TODAY}`);
  check(reportTruth.status === 200 && reportTruth.text.includes(`${KEY} 完成项`), "HTTP report endpoint still returns seeded data");
  const blocks = await api(`/api/documents/${docId}/blocks`);
  check(blocks.status === 200 && blocks.json.blocks.length >= 5, `saved report has ${blocks.json.blocks.length} editable blocks`);
} catch (err) {
  check(false, `chain error: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  try { if (ws) ws.close(); } catch { }
  killBrowser();
  for (const id of scheduleIds) {
    try { await api(`/api/schedules/${id}`, "DELETE"); } catch { }
  }
  for (const id of todoIds) {
    try { await api(`/api/todos/${id}`, "DELETE"); } catch { }
  }
  for (const id of docIds) {
    try { await api(`/api/documents/${id}`, "DELETE"); } catch { }
  }
}
if (failures.length > 0) {
  process.stdout.write(`R36 FIRSTUSE: FAIL (${failures.length})\n`);
  process.exit(1);
}
process.stdout.write("R36 FIRSTUSE: ALL GREEN\n");
