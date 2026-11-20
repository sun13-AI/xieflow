// scripts/r35-firstuse-cdp.mjs - r35 "first use" full chain proof (ASCII only).
// Real headless CDP: export .ics -> inspect content -> import preview -> confirm
// write -> reload keeps the imported schedule -> HTTP truth -> cleanup.
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
const ids = [];
function check(cond, label) {
  if (cond) process.stdout.write(`  ok ${label}\n`);
  else { failures.push(label); process.stdout.write(`  FAIL ${label}\n`); }
}

const profile = mkdtempSync(join(tmpdir(), "r35-firstuse-cdp-"));
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

const KEY = `R35CDP${Date.now()}`;
const title = `${KEY} 评审, "终版"; 第一行\n第二行`;
try {
  // 0) one real schedule with hard ICS characters, created through HTTP
  const seed = await api("/api/schedules", "POST", {
    title, date: "2026-11-21", start: "10:00", end: "11:30", repeat: "none", todoId: null,
  });
  check(seed.status === 201 && seed.json?.id > 0, "seeded one schedule via real HTTP");
  if (seed.json?.id) ids.push(seed.json.id);

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
  const exists = (sel) => evalJs(`Boolean(document.querySelector(${JSON.stringify(sel)}))`);
  try { await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: profile }); } catch { }

  // 1) open real schedules page with the seeded row
  await send("Page.navigate", { url: `http://127.0.0.1:${webPort}/?page=schedules` });
  await sleep(2000);
  const debugBody = await evalJs(`document.body.innerText.slice(0, 400)`);
  process.stdout.write(`  debug page: ${String(debugBody).replace(/\n/g, " | ")}\n`);
  await waitFor(20000, async () => await exists('[data-state="calendar"]') ? true : null, "schedules calendar");
  const seedVisible = await evalJs(`document.body.innerText.includes(${JSON.stringify(KEY)})`);
  check(seedVisible, "seeded schedule visible in month view");

  // 2) export .ics via real UI click -> saved receipt with filename/count/bytes
  await click('[data-action="ics-toggle-export"]');
  await waitFor(10000, async () => await exists('[data-state="ics-export-menu"]') ? true : null, "export menu");
  await click('[data-action="ics-export-schedules"]');
  const savedText = await waitFor(15000, async () => {
    const t = await evalJs(`(() => { var el=document.querySelector('[data-state="ics-saved"]'); return el ? el.innerText : null; })()`);
    return t && t.includes("xieflow-schedules-") ? t : null;
  }, "ICS saved receipt");
  check(savedText.includes(".ics") && savedText.includes("条事件"), "export wrote .ics with event count receipt");

  // 3) inspect the real exported content over HTTP (independent of the page)
  const exported = await api("/api/schedules/export.ics?from=2026-11-01&to=2026-11-30");
  check(exported.status === 200 && exported.text.startsWith("BEGIN:VCALENDAR"), "export endpoint returns a real VCALENDAR");
  check(exported.text.includes("VERSION:2.0") && exported.text.includes("DTSTART:"), "export content has standard headers/VEVENT fields");
  check(exported.text.includes("第一行\\n第二行") && exported.text.includes("\\, "), "Chinese/newline/comma escaped in exported text");
  check(!exported.text.includes("\n第二行"), "no raw newline breaks the ICS content line");

  // 4) import preview through real UI: paste exported text -> parse -> preview row
  await click('[data-action="ics-toggle-import"]');
  await waitFor(10000, async () => await exists('[data-state="ics-import-panel"]') ? true : null, "import panel");
  const pasted = await evalJs(`(() => {
    var ta=document.querySelector('[data-field="ics-text"]'); if(!ta) return false;
    var setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    setter.call(ta, ${JSON.stringify(exported.text)});
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  })()`);
  check(pasted, "pasted real exported ICS into the textarea");
  await sleep(300);
  await click('[data-action="ics-import-preview"]');
  const previewText = await waitFor(15000, async () => {
    const t = await evalJs(`(() => { var el=document.querySelector('[data-state="ics-import-preview"]'); return el ? el.innerText : null; })()`);
    return t && t.includes("解析到") ? t : null;
  }, "import preview rows");
  check(previewText.includes(KEY), "preview lists the hard-character title");

  // 5) confirm write -> success banner -> reload keeps the imported schedule
  await click('[data-action="ics-import-commit"]');
  const successText = await waitFor(15000, async () => {
    const t = await evalJs(`(() => { var el=document.querySelector('[data-state="ics-import-success"]'); return el ? el.innerText : null; })()`);
    return t && t.includes("已成功导入") ? t : null;
  }, "import success banner");
  check(successText.includes("1 条日程"), "import success reports 1 written schedule");
  await send("Page.reload", { ignoreCache: true });
  await waitFor(20000, async () => await exists('[data-state="calendar"]') ? true : null, "reloaded calendar");
  const chipCount = await evalJs(`Array.from(document.querySelectorAll('.cal-chip')).filter(function(e){return e.innerText.includes(${JSON.stringify(KEY)});}).length`);
  check(chipCount >= 2, `reload keeps both original and imported schedule (chips=${chipCount})`);
  const truth = await api("/api/schedules?from=2026-11-01&to=2026-11-30");
  const mine = truth.json.schedules.filter((s) => s.title === title);
  check(mine.length === 2, `HTTP truth has 2 rows with the imported title (got ${mine.length})`);
  if (mine.length === 2) ids.push(...mine.map((s) => s.id).filter((id) => !ids.includes(id)));
} catch (err) {
  check(false, `chain error: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  try { if (ws) ws.close(); } catch { }
  killBrowser();
  for (const id of ids) {
    try { await api(`/api/schedules/${id}`, "DELETE"); } catch { }
  }
}
if (failures.length > 0) {
  process.stdout.write(`R35 FIRSTUSE: FAIL (${failures.length})\n`);
  process.exit(1);
}
process.stdout.write("R35 FIRSTUSE: ALL GREEN\n");
