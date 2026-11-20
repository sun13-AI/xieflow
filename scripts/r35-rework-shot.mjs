// scripts/r35-rework-shot.mjs - r35 rework#1 evidence seam (ASCII-only source).
// Real headless CDP chain: seed exactly 2 schedules -> real export button ->
// saved receipt (02) -> import THAT downloaded file -> preview (04) ->
// confirm write -> success + grid (05) -> clean-error-text pin (07).
// Never opens a visible window. Servers must already be up (scratch DB).
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
const outDir = args["out-dir"] || "docs/ui/r35";
if (!browser) throw new Error("missing --browser");

const failures = [];
const checks = [];
function check(cond, label) {
  if (cond) { checks.push(label); process.stdout.write(`  ok ${label}\n`); }
  else { failures.push(label); process.stdout.write(`  FAIL ${label}\n`); }
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

const profile = mkdtempSync(join(tmpdir(), "r35-rework-cdp-"));
const downloads = mkdtempSync(join(tmpdir(), "r35-rework-dl-"));
const portFile = join(profile, "DevToolsActivePort");
let proc = null;
let ws = null;
function killBrowser() {
  if (proc && proc.pid) {
    try { spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" }); } catch { }
  }
  try { rmSync(profile, { recursive: true, force: true }); } catch { }
  try { rmSync(downloads, { recursive: true, force: true }); } catch { }
}

const seededIds = [];
let send = null;
let evalJs = null;
let click = null;
let exists = null;
let capture = null;
try {
  // 0) deterministic seed: exactly two non-repeating events in the displayed month
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dateA = `${yyyy}-${mm}-10`;
  const dateB = `${yyyy}-${mm}-11`;
  const seeds = [
    { title: "需求评审会", date: dateA, start: "10:00", end: "11:00", repeat: "none", todoId: null },
    { title: "每日站会", date: dateB, start: "09:00", end: "09:30", repeat: "none", todoId: null },
  ];
  for (const s of seeds) {
    const r = await api("/api/schedules", "POST", s);
    check(r.status === 201 && r.json?.id > 0, `seeded ${s.title} via real HTTP`);
    if (r.json?.id) seededIds.push(r.json.id);
  }

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
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`CDP ${String(msg.error.message)}`));
    else p.resolve(msg.result);
  };
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  evalJs = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(res.exceptionDetails)}`);
    return res.result.value;
  };
  click = async (sel) => {
    const p = await evalJs(`(() => { var el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; var r=el.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`);
    if (!p) throw new Error(`click target not found: ${sel}`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, button: "none" });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
  };
  exists = (sel) => evalJs(`Boolean(document.querySelector(${JSON.stringify(sel)}))`);
  capture = async (name) => {
    const res = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const file = join(outDir, `${name}.png`);
    writeFileSync(file, Buffer.from(res.data, "base64"));
    const sha = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8).toUpperCase();
    process.stdout.write(`  shot ${name}.png sha=${sha}\n`);
    return sha;
  };
  try { await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads }); } catch { }
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  // 1) real schedules page with the two seeded events
  await send("Page.navigate", { url: `http://127.0.0.1:${webPort}/?page=schedules` });
  await sleep(2000);
  await waitFor(20000, async () => await exists('[data-state="calendar"]') ? true : null, "schedules calendar");
  const body0 = String(await evalJs(`document.body.innerText`));
  check(body0.includes(seeds[0].title) && body0.includes(seeds[1].title), "both seeded events visible in month grid");

  // 2) real export click -> downloaded .ics file + saved receipt (02)
  await click('[data-action="ics-toggle-export"]');
  await waitFor(10000, async () => await exists('[data-state="ics-export-menu"]') ? true : null, "export menu");
  await click('[data-action="ics-export-schedules"]');
  const receipt = await waitFor(15000, async () => {
    const t = await evalJs(`(() => { var el=document.querySelector('[data-state="ics-saved"]'); return el ? el.innerText : null; })()`);
    return t && t.includes("xieflow-schedules-") ? t : null;
  }, "ICS saved receipt");
  const rm = String(receipt).match(/(\d+)\s*条事件\s*\/\s*(\d+)\s*字节/);
  check(Boolean(rm), "saved receipt carries filename/count/bytes");
  const receiptCount = Number(rm?.[1] ?? -1);
  const receiptBytes = Number(rm?.[2] ?? -1);
  check(receiptCount === 2, `saved receipt event count is exactly 2 (got ${receiptCount})`);
  const dlName = await waitFor(15000, async () => readdirSync(downloads).filter((f) => f.endsWith(".ics"))[0] ?? null, "downloaded .ics file");
  await sleep(300);
  const icsBytes = readFileSync(join(downloads, dlName));
  const icsText = icsBytes.toString("utf8");
  check(icsText.startsWith("BEGIN:VCALENDAR") && icsText.includes("VERSION:2.0"), "downloaded file is a real VCALENDAR");
  check((icsText.match(/BEGIN:VEVENT/g) ?? []).length === 2, "downloaded file contains exactly two VEVENTs");
  check(icsBytes.length === receiptBytes, `receipt bytes == downloaded file bytes (${receiptBytes})`);
  check(String(receipt).includes(dlName), `receipt filename == downloaded filename (${dlName})`);
  const sha02 = await capture("02-ics-saved");

  // 3) import THAT SAME downloaded file -> real preview (04)
  await click('[data-action="ics-toggle-import"]');
  await waitFor(10000, async () => await exists('[data-state="ics-import-panel"]') ? true : null, "import panel");
  const pasted = await evalJs(`(() => {
    var ta=document.querySelector('[data-field="ics-text"]'); if(!ta) return false;
    var setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    setter.call(ta, ${JSON.stringify(icsText)});
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  })()`);
  check(pasted, "pasted the downloaded .ics bytes into the textarea");
  await sleep(300);
  const shownIcs = String(await evalJs(`document.querySelector('[data-field="ics-text"]').value`));
  // HTML textarea's API value normalizes CRLF to LF; ICS on disk uses CRLF.
  const normBreaks = (s) => String(s).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  check(normBreaks(shownIcs) === normBreaks(icsText), `textarea content matches the saved file (DOM line-break normalization; ${icsText.length} -> ${shownIcs.length} chars)`);
  await click('[data-action="ics-import-preview"]');
  const preview = await waitFor(15000, async () => {
    const t = await evalJs(`(() => { var el=document.querySelector('[data-state="ics-import-preview"]'); return el ? el.innerText : null; })()`);
    return t && t.includes("解析到") ? t : null;
  }, "import preview rows");
  check(String(preview).includes("解析到 2 条事件"), "preview reports the same 2 events as the saved receipt");
  check(String(preview).includes(seeds[0].title) && String(preview).includes(seeds[1].title), "preview titles match the exported seeds");
  check(String(preview).includes(dateA) && String(preview).includes(dateB), "preview dates match the exported seeds");
  const textHead = String(await evalJs(`document.querySelector('[data-field="ics-text"]').value.slice(0,120)`));
  check(textHead.includes("BEGIN:VCALENDAR") && textHead.includes("VERSION:2.0"), "textarea shows real ICS head, not the placeholder");
  const sha04 = await capture("04-ics-import-preview");

  // 4) confirm write -> success banner + grid no longer empty (05)
  await click('[data-action="ics-import-commit"]');
  const success = await waitFor(15000, async () => {
    const t = await evalJs(`(() => { var el=document.querySelector('[data-state="ics-import-success"]'); return el ? el.innerText : null; })()`);
    return t && t.includes("已成功导入") ? t : null;
  }, "import success banner");
  check(String(success).includes("2 条日程"), "success banner reports 2 written schedules");
  await sleep(700);
  const body1 = String(await evalJs(`document.body.innerText`));
  check(!body1.includes("本月暂无日程"), "month grid is not empty on the success frame");
  check(body1.includes(seeds[0].title) && body1.includes(seeds[1].title), "month grid shows both schedule chips");
  const sha05 = await capture("05-ics-import-success");

  // 5) clean error text: no internal audit tag visible (07)
  await send("Page.navigate", { url: `http://127.0.0.1:${webPort}/?page=schedules&shot=ics-error` });
  await sleep(1500);
  const errText = await waitFor(15000, async () => {
    const t = await evalJs(`(() => { var el=document.querySelector('[data-state="ics-error"]'); return el ? el.innerText : null; })()`);
    return t && t.includes("ICS 解析失败") ? t : null;
  }, "pinned error banner");
  check(!String(errText).includes("audit") && !String(errText).includes("400"), "error banner has no internal audit tag");
  check(String(errText).includes("请粘贴完整 .ics 文件"), "error banner gives user-facing guidance");
  const sha07 = await capture("07-ics-error");

  process.stdout.write(`R35 REWORK SHOTS: 02=${sha02} 04=${sha04} 05=${sha05} 07=${sha07}\n`);
} catch (err) {
  check(false, `chain error: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  try { if (ws) ws.close(); } catch { }
  killBrowser();
}
if (failures.length > 0) {
  process.stdout.write(`R35 REWORK SHOTS: FAIL (${failures.length}/${failures.length + checks.length})\n`);
  process.exit(1);
}
process.stdout.write(`R35 REWORK SHOTS: ALL GREEN (${checks.length} checks)\n`);
