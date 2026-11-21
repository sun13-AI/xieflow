// scripts/r43-firstuse-cdp.mjs - r43 "first use" full chain proof (ASCII only).
// Real headless CDP: meetings tab -> create a room WITH equipment through the real
// UI -> book a meeting -> click "recommend" -> pick a room -> reload keeps state ->
// HTTP truth -> cleanup. Never opens a visible window.
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
let roomId = 0;
let meetingId = 0;
function check(cond, label) {
  if (cond) process.stdout.write(`  ok ${label}\n`);
  else { failures.push(label); process.stdout.write(`  FAIL ${label}\n`); }
}

const profile = mkdtempSync(join(tmpdir(), "r43-firstuse-cdp-"));
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

const KEY = `R43CDP${Date.now()}`;

try {
  proc = spawn(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--no-default-browser-check", "--force-device-scale-factor=1",
    "--window-size=1280,1100", "--remote-debugging-port=0",
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
    const p = await evalJs(`(() => { var el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; el.scrollIntoView({block:'center'}); var r=el.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`);
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

  // 1) open meetings tab and create a room WITH equipment through the real UI
  await send("Page.navigate", { url: `http://127.0.0.1:${webPort}/?page=meetings&date=2026-11-20` });
  await waitFor(25000, async () => await exists('[data-state="meetings-columns"]') ? true : null, "meetings page");
  await setInput('[data-state="meeting-new-room-name"]', `${KEY} 路演室`);
  await click('[data-action="meeting-new-room-equip"][data-equipment="投影"]');
  await click('[data-action="meeting-room-create"]');
  await waitFor(20000, async () => (await inner('[data-state="meeting-rooms"]')).includes(KEY) ? true : null, "created room in list");
  check((await inner('[data-state="meeting-rooms"]')).includes(KEY), "UI shows the room created with equipment");
  check((await inner('[data-state="meeting-rooms"]')).includes("投影"), "UI shows the equipment badge on the created room");

  // 2) book a meeting in that room through the real form
  await setInput('[data-state="meeting-title"]', `${KEY} 评审会`);
  await setInput('[data-state="meeting-organizer"]', "张三");
  await setInput('[data-state="meeting-start"]', "09:00");
  await setInput('[data-state="meeting-end"]', "10:00");
  await click('[data-action="meeting-book"]');
  await waitFor(20000, async () => (await inner('[data-state="meetings-message"]')).includes("预约成功") ? true : null, "booking success");

  // 3) click "recommend" for 8 attendees + 投影 + 10:00-11:00 (boundary-touch is legal)
  await setInput('[data-state="meeting-need-attendees"]', "8");
  await setInput('[data-state="meeting-start"]', "10:00");
  await setInput('[data-state="meeting-end"]', "11:00");
  await click('[data-action="meeting-recommend"]');
  await waitFor(20000, async () => await exists('[data-state="meeting-recommend-result"]') ? true : null, "recommend result");
  check((await inner('[data-state="meeting-recommend-result"]')).includes(KEY), "recommend result includes the created room");
  check((await inner('[data-state="meeting-recommend-summary"]')).includes("可用"), "recommend summary rendered");

  // 4) pick the recommended room -> form/URL/select must all agree
  await click('[data-action="meeting-recommend-pick"]');
  await waitFor(5000, async () => (await evalJs(`document.querySelector('[data-state="meeting-room-select"]').value`)) ? true : null, "picked room id");
  const beforeReload = await evalJs("location.href");
  check(beforeReload.includes("roomId="), "URL carries roomId after picking a recommendation");
  await send("Page.reload", { ignoreCache: true });
  await waitFor(25000, async () => await exists('[data-state="meetings-columns"]') ? true : null, "meetings after reload");
  check((await evalJs("location.href")).includes("roomId="), "reload keeps roomId deep-link");
  check((await inner('[data-state="meeting-rooms"]')).includes(KEY), "reload keeps the created room");

  // 5) independent HTTP truth
  const rooms = await api("/api/rooms");
  const mine = (rooms.json.rooms || []).find((r) => r.name === `${KEY} 路演室`);
  roomId = mine ? mine.id : 0;
  check(Boolean(roomId), "HTTP truth finds the created room");
  check(mine && JSON.stringify(mine.equipment) === JSON.stringify(["投影"]), "HTTP truth confirms equipment stored");
  const mtgs = await api("/api/meetings");
  const myMeeting = (mtgs.json.meetings || []).find((m) => m.title === `${KEY} 评审会`);
  meetingId = myMeeting ? myMeeting.id : 0;
  check(Boolean(meetingId), "HTTP truth finds the booked meeting");
  check(myMeeting && myMeeting.roomId === roomId, "HTTP truth confirms meeting room id matches the created room");
  const rec = await api(`/api/rooms/recommend?attendees=8&equipment=${encodeURIComponent("投影")}&date=2026-11-20&start=10:00&end=11:00`);
  check(rec.status === 200 && rec.json.available.some((h) => h.id === roomId), "HTTP truth confirms room is recommendable at boundary-touch window");
} catch (err) {
  check(false, `chain error: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  try { if (ws) ws.close(); } catch { }
  killBrowser();
  if (meetingId) { try { await api(`/api/meetings/${meetingId}`, "DELETE"); } catch { } }
  if (roomId) { try { await api(`/api/rooms/${roomId}`, "DELETE"); } catch { } }
}
if (failures.length > 0) {
  process.stdout.write(`R43 FIRSTUSE: FAIL (${failures.length})\n`);
  process.exit(1);
}
process.stdout.write("R43 FIRSTUSE: ALL GREEN\n");
