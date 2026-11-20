// scripts/r28fix1-firstuse-cdp.mjs - r28 rework#1: real headless CDP proof of the
// waizhuan P2-1 reproduction path. ASCII only. Requires api:8787 + web:5173 on a
// scratch db. Real mouse clicks on "new room" and "book"; never clicks the left
// room list. Fails (exit 1) unless both POSTs carry the NEW room id and return 201.
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
const date = args.date || "2027-03-13";
if (!browser) throw new Error("missing --browser");

const failures = [];
function check(cond, label) {
  if (cond) process.stdout.write(`  ok ${label}\n`);
  else { failures.push(label); process.stdout.write(`  FAIL ${label}\n`); }
}

const profile = mkdtempSync(join(tmpdir(), "r28fix1-cdp-"));
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
  const setInput = (sel, value) => evalJs(`(() => {
    var el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false;
    var proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});
    el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
    return el.value;
  })()`);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    window.__r28fix1 = { posts: [], leftClicks: 0 };
    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-action="meeting-room-select"]')) window.__r28fix1.leftClicks++;
    }, true);
    var orig = window.fetch;
    window.fetch = function (input, init) {
      var p = orig.apply(this, arguments);
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.indexOf('/api/') >= 0 && init && String(init.method || '').toUpperCase() === 'POST') {
        var rec = { url: url, status: 0, body: null, response: null };
        window.__r28fix1.posts.push(rec);
        try { rec.body = JSON.parse(init.body); } catch (e) { }
        p.then(function (res) {
          rec.status = res.status;
          try { res.clone().json().then(function (j) { rec.response = j; }).catch(function () {}); } catch (e) { }
        }).catch(function () {});
      }
      return p;
    };
  })()` });

  const deepLink = `http://127.0.0.1:${webPort}/?page=meetings&date=${date}`;
  await send("Page.navigate", { url: deepLink });
  await waitFor(25000, async () => {
    const n = await evalJs(`document.querySelectorAll('[data-action="meeting-room-select"]').length`);
    return n >= 0 && (await evalJs(`!!document.querySelector('[data-state="meeting-new-room-name"]')`)) ? true : null;
  }, "meetings page ready");

  // --- Path 1: create room via UI, then book WITHOUT clicking the left column ---
  const roomName = `r28fix1-CDP-${Date.now().toString(36)}`;
  await click('[data-state="meeting-new-room-name"]');
  await send("Input.insertText", { text: roomName });
  await click('[data-action="meeting-room-create"]');
  const created = await waitFor(25000, async () => {
    const s = await evalJs(`({ href: location.href, value: (document.querySelector('[data-state="meeting-room-select"]')||{value:''}).value,
      posts: window.__r28fix1.posts, left: window.__r28fix1.leftClicks })`);
    const roomPost = s.posts && s.posts.find((p) => p.url.includes("/api/rooms") && p.status === 201);
    return roomPost && roomPost.response && Number(roomPost.response.id) > 0 && s.value === String(roomPost.response.id)
      ? { id: Number(roomPost.response.id), href: s.href, value: s.value, left: s.left } : null;
  }, "new room auto-selected after create");
  check(created.id > 1, `created room id is not 1 (got ${created.id})`);
  check(new URL(created.href).searchParams.get("roomId") === String(created.id), "URL auto-carries new roomId after create");
  check(created.left === 0, "left room list was never clicked");
  await click('[data-state="meeting-title"]');
  await send("Input.insertText", { text: "r28fix1-first-book" });
  await click('[data-state="meeting-organizer"]');
  await send("Input.insertText", { text: "CDP" });
  await click('[data-action="meeting-book"]');
  const book1 = await waitFor(25000, async () => {
    const posts = await evalJs(`window.__r28fix1.posts`);
    return posts && posts.find((p) => p.url.includes("/api/meetings") && p.status === 201
      && p.body && p.body.roomId === created.id && p.response && p.response.id > 0) || null;
  }, "first booking posts new room id with 201");
  check(book1.body.roomId === created.id, `first POST roomId=${book1.body.roomId} equals new room id=${created.id}`);
  check(book1.status === 201, "first booking response status 201");

  // --- Path 2: reload deep link WITHOUT roomId, auto-echo then book again ---
  await send("Page.navigate", { url: deepLink });
  const echo = await waitFor(25000, async () => {
    const s = await evalJs(`({ href: location.href, value: (document.querySelector('[data-state="meeting-room-select"]')||{value:''}).value })`);
    return s.value && Number(s.value) > 0 ? s : null;
  }, "deep-link no-roomId auto-echo");
  check(echo.value === String(created.id), `deep link select echoes new room id (got ${echo.value})`);
  check(new URL(echo.href).searchParams.get("roomId") === String(created.id), "deep link URL corrected to new roomId");
  await setInput('[data-state="meeting-start"]', "10:00");
  await setInput('[data-state="meeting-end"]', "11:00");
  await click('[data-state="meeting-title"]');
  await send("Input.insertText", { text: "r28fix1-second-book" });
  await click('[data-action="meeting-book"]');
  const book2 = await waitFor(25000, async () => {
    const posts = await evalJs(`window.__r28fix1.posts`);
    return posts && posts.find((p) => p.url.includes("/api/meetings") && p.status === 201
      && p.body && p.body.title === "r28fix1-second-book" && p.response && p.response.id > 0) || null;
  }, "second booking after deep-link reload with 201");
  check(book2.body.roomId === created.id, `second POST roomId=${book2.body.roomId} equals new room id=${created.id}`);
  check(book2.status === 201, "second booking response status 201");

  // --- Cleanup: only this probe's meeting and room (never user data) ---
  for (const id of [book1.response.id, book2.response.id]) {
    const r = await fetch(`http://127.0.0.1:${apiPort}/api/meetings/${id}`, { method: "DELETE" });
    check(r.status === 200, `cleanup meeting ${id} -> 200`);
  }
  const rr = await fetch(`http://127.0.0.1:${apiPort}/api/rooms/${created.id}`, { method: "DELETE" });
  check(rr.status === 200, `cleanup room ${created.id} -> 200`);

  process.stdout.write(JSON.stringify({
    ok: failures.length === 0, createdRoomId: created.id, firstPost: book1.body,
    secondPost: book2.body, leftClicks: created.left, deepLinkHref: echo.href, failures,
  }) + "\n");
} catch (err) {
  process.stderr.write(`r28fix1 CDP failed: ${err && err.stack ? err.stack : String(err)}\n`);
  failures.push(String(err));
} finally {
  try { if (ws) ws.close(); } catch { }
  killBrowser();
}
if (failures.length > 0) process.exit(1);
