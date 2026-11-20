// scripts/r26-deeplink-shot.mjs - r26 rework#2: real CDP click -> deep-link target evidence.
// ASCII only. Invoked by scripts/shot.ps1 (Round r26, Shot 09-notif-deeplink-target).
// Args: --browser <path> --web-port <n> --out <png> --target-id <id> --target-title <text> --expected-row <n>
// The helper launches its OWN one-shot headless browser, really clicks the requested
// notification row with Input.dispatchMouseEvent, then injects a capture-time URL
// banner whose text is read from the real location.href (no product code is changed).

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (key && key.startsWith("--")) out[key.slice(2)] = argv[i + 1] ?? "";
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const browser = args.browser;
const webPort = Number(args["web-port"] || 5173);
const out = args.out;
const targetId = args["target-id"] || "";
const targetTitle = args["target-title"] || "";
const expectedRow = Number(args["expected-row"] || 2);
if (!browser || !out || !targetId || !targetTitle) {
  throw new Error("missing args: --browser --out --target-id --target-title are required");
}

const profile = mkdtempSync(join(tmpdir(), "r26fix2-cdp-"));
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
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", "--force-device-scale-factor=1",
    "--window-size=1280,900", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });

  const port = await waitFor(25000, async () => {
    try {
      const text = readFileSync(portFile, "utf8").trim().split(/\r?\n/);
      return text[0] ? Number(text[0]) : 0;
    } catch { return 0; }
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
  function send(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evalJs(expression) {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(res.exceptionDetails)}`);
    return res.result.value;
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `http://127.0.0.1:${webPort}/?page=notifications` });

  const rowsExpr = `Array.from(document.querySelectorAll('[data-state="notif-item"]')).map(function(el,i){
    var r=el.getBoundingClientRect();
    return {row:i+1,notifId:el.getAttribute('data-notification-id'),refType:el.getAttribute('data-ref-type'),
      title:(el.querySelector('.nt-title')||{innerText:''}).innerText.trim(),
      x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};
  })`;
  const rows = await waitFor(25000, async () => {
    const found = await evalJs(rowsExpr);
    return found && found.length >= expectedRow ? found : null;
  }, "notification rows");
  const clicked = rows[expectedRow - 1];
  if (!String(clicked.title).includes(targetTitle)) {
    throw new Error(`row ${expectedRow} is not the target: ${JSON.stringify(rows)}`);
  }

  // Real CDP mouse click (not a programmatic el.click()) on the second notification row.
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: clicked.x, y: clicked.y, button: "none" });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: clicked.x, y: clicked.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: clicked.x, y: clicked.y, button: "left", clickCount: 1 });

  const stateExpr = `({
    href: location.href,
    search: location.search,
    tab: (document.querySelector('.tab.tab-active')||{getAttribute:function(){return ''}}).getAttribute('data-tab'),
    activeRow: (document.querySelector('.ap-list-active [data-approval-id]')||{getAttribute:function(){return ''}}).getAttribute('data-approval-id'),
    activeText: (document.querySelector('.ap-list-active')||{innerText:''}).innerText.trim(),
    detail: (document.querySelector('.ap-main h2')||{innerText:''}).innerText.trim(),
    actor: (document.querySelector('[data-action="ap-actor"]')||{value:''}).value,
    view: (document.querySelector('.ap-view-active')||{innerText:''}).innerText.trim(),
    badge: (document.querySelector('[data-state="notif-badge"]')||{innerText:''}).innerText.trim()
  })`;
  const state = await waitFor(25000, async () => {
    const s = await evalJs(stateExpr);
    if (s && s.search.includes(`approvalId=${targetId}`) && String(s.activeRow) === String(targetId) &&
        String(s.detail).includes(targetTitle) && s.tab === "approval") return s;
    return null;
  }, "approval deep-link target state");

  // Capture-time seam: a slim bottom bar whose URL text is read from the REAL
  // location.href. It records the clicked row position so the evidence explicitly
  // shows the target came from the NON-FIRST notification, not first-row auto-select.
  const banner = `DEEP-LINK URL (from location.href): ${state.href}   |   CLICKED NOTIFICATION ROW ${expectedRow}/${rows.length}: ${clicked.title}   |   TARGET REF ID: ${targetId}`;
  await evalJs(`(() => {
    var old = document.getElementById('r26-deeplink-seam'); if (old) old.remove();
    var d = document.createElement('div');
    d.id = 'r26-deeplink-seam';
    d.setAttribute('data-state','r26-deeplink-url');
    d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#101827;color:#e8f1ff;font:12px/1.6 Consolas,monospace;padding:6px 14px;box-shadow:0 -2px 8px rgba(0,0,0,.25)';
    d.textContent = ${JSON.stringify(banner)};
    document.body.appendChild(d);
    return d.textContent;
  })()`);

  const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  process.stdout.write(JSON.stringify({
    ok: true, out, clickedRow: expectedRow, totalRows: rows.length,
    clickedNotifId: clicked.notifId, href: state.href, tab: state.tab,
    activeRow: state.activeRow, activeText: state.activeText, detail: state.detail,
    actor: state.actor, view: state.view, badge: state.badge, banner,
  }) + "\n");
} catch (err) {
  process.stderr.write(`r26-deeplink-shot failed: ${err && err.stack ? err.stack : String(err)}\n`);
  process.exitCode = 1;
} finally {
  try { if (ws) ws.close(); } catch { }
  killBrowser();
}
