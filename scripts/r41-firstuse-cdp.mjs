// scripts/r41-firstuse-cdp.mjs - r41 "first use" full chain proof (ASCII only).
// Real headless CDP: open forms tab -> create a form with questions through the
// real UI -> fill three responses -> view summary -> reload keeps state -> HTTP
// truth -> cleanup. Never opens a visible window.
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
let formId = 0;
function check(cond, label) {
  if (cond) process.stdout.write(`  ok ${label}\n`);
  else { failures.push(label); process.stdout.write(`  FAIL ${label}\n`); }
}

const profile = mkdtempSync(join(tmpdir(), "r41-firstuse-cdp-"));
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

const KEY = `R41CDP${Date.now()}`;

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
      var proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype);
      var setter=Object.getOwnPropertyDescriptor(proto,'value').set;
      setter.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
      return el.value === ${JSON.stringify(String(value))};
    })()`);
    if (!done) throw new Error(`setInput failed: ${sel}=${value}`);
  }
  const exists = (sel) => evalJs(`Boolean(document.querySelector(${JSON.stringify(sel)}))`);
  const inner = (sel) => evalJs(`(() => { var el=document.querySelector(${JSON.stringify(sel)}); return el ? el.innerText : ''; })()`);

  // 1) open forms tab, create a two-question form through the real UI
  await send("Page.navigate", { url: `http://127.0.0.1:${webPort}/?page=forms` });
  await waitFor(25000, async () => await exists('[data-state="forms-page"]') ? true : null, "forms page");
  await click('[data-state="forms-new"]');
  await waitFor(10000, async () => await exists('[data-state="forms-create"]') ? true : null, "create panel");
  await setInput('[data-state="forms-title"]', `${KEY} 调查`);
  await setInput('[data-state="forms-description"]', "CDP 全链路探针");
  await setInput('[data-state="forms-q-label"]', "姓名");
  await click('[data-state="forms-q-add"]');
  await evalJs(`(() => {
    var rows=document.querySelectorAll('[data-state="forms-q-type"]');
    var s=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
    s.call(rows[1],'number'); rows[1].dispatchEvent(new Event('change',{bubbles:true}));
    var labels=document.querySelectorAll('[data-state="forms-q-label"]');
    var i=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    i.call(labels[1],'评分'); labels[1].dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  })()`);
  await click('[data-state="forms-save"]');
  await waitFor(20000, async () => (await inner('[data-state="forms-list"]')).includes(KEY) ? true : null, "created form in list");
  check((await inner('[data-state="forms-list"]')).includes("2 道题"), "UI shows the created form with two questions");

  // 2) submit three real responses through the fill view
  for (const [name, score] of [["甲", "10"], ["乙", "20"], ["丙", "30"]]) {
    await click('[data-state="forms-open-fill"]');
    await waitFor(10000, async () => await exists('[data-state="forms-fill"]') ? true : null, "fill view");
    await setInput('[data-state="forms-answer-text"]', name);
    await setInput('[data-state="forms-answer-number"]', score);
    await click('[data-state="forms-submit"]');
    await waitFor(15000, async () => (await inner('[data-state="forms-submitted"]')).includes("答卷已提交") ? true : null, "submit success");
    await click('[data-state="forms-back"]');
    await waitFor(10000, async () => await exists('[data-state="forms-list"]') ? true : null, "back to list");
  }
  check(true, "three responses submitted through the real fill UI");

  // 3) summary view shows hand-computed numbers; URL deep-link survives reload
  await click('[data-state="forms-open-fill"]');
  await waitFor(10000, async () => await exists('[data-state="forms-fill"]') ? true : null, "fill view before summary");
  await click('[data-state="forms-to-summary"]');
  await waitFor(15000, async () => await exists('[data-state="forms-summary"]') ? true : null, "summary view");
  check((await inner('[data-state="forms-summary-line"]')).includes("3 份答卷"), "summary line shows 3 responses");
  check((await inner('[data-state="forms-summary-number"]')).includes("60"), "summary card shows hand-computed sum 60");
  check((await inner('[data-state="forms-summary-number"]')).includes("20"), "summary card shows hand-computed avg 20");
  const beforeReload = await evalJs("location.href");
  await send("Page.reload", { ignoreCache: true });
  await waitFor(25000, async () => await exists('[data-state="forms-summary"]') ? true : null, "summary after reload");
  check((await inner('[data-state="forms-summary-line"]')).includes("3 份答卷"), "reload keeps summary with three responses");
  check(beforeReload.includes("view=summary"), "deep-link view=summary present before reload");

  // 4) independent HTTP truth
  const list = await api("/api/forms");
  const mine = (list.json.forms || []).find((f) => f.title === `${KEY} 调查`);
  formId = mine ? mine.id : 0;
  check(Boolean(formId), "HTTP truth finds the created form");
  const sum = await api(`/api/forms/${formId}/summary`);
  check(sum.status === 200 && sum.json.total === 3, "HTTP truth confirms total=3");
  const num = (sum.json.questions || []).find((q) => q.type === "number");
  check(num && num.sum === 60 && num.avg === 20, "HTTP truth confirms sum=60 avg=20");
} catch (err) {
  check(false, `chain error: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  try { if (ws) ws.close(); } catch { }
  killBrowser();
  if (formId) { try { await api(`/api/forms/${formId}`, "DELETE"); } catch { } }
}
if (failures.length > 0) {
  process.stdout.write(`R41 FIRSTUSE: FAIL (${failures.length})\n`);
  process.exit(1);
}
process.stdout.write("R41 FIRSTUSE: ALL GREEN\n");
