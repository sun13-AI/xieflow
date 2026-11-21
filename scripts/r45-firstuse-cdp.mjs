// scripts/r45-firstuse-cdp.mjs - r45 "first use" full chain (headless CDP, ASCII only).
// Opens a real document, performs an HTML5 drag of the 3rd block to the 1st slot,
// reads the order back over HTTP, reloads the page and checks persistence.
// Usage: node scripts/r45-firstuse-cdp.mjs --api 8787 --web 5173 --browser <edge.exe>
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (key && key.startsWith("--")) args[key.slice(2)] = process.argv[i + 1] ?? "";
}
const api = Number(args.api || 8787);
const web = Number(args.web || 5173);
const browser = args.browser;
if (!browser) throw new Error("missing --browser");

const profile = mkdtempSync(join(tmpdir(), "r45-firstuse-cdp-"));
let proc = null;
let ws = null;
const checks = [];
function check(cond, label) {
  checks.push({ ok: Boolean(cond), label });
  console.log(`${cond ? "  ok" : "  FAIL"} ${label}`);
}
function killBrowser() {
  if (proc && proc.pid) {
    try { spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* already gone */ }
  }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* already gone */ }
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

let docId = 0;
try {
  // 1. Seed one real document with five blocks over the real API.
  const stamp = `r45-firstuse-${Date.now()}`;
  const created = await fetch(`http://127.0.0.1:${api}/api/documents`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: stamp }),
  }).then((r) => r.json());
  docId = created.id;
  const imported = await fetch(`http://127.0.0.1:${api}/api/documents/${docId}/import.md`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ markdown: "first paragraph\n\nsecond paragraph\n\nthird paragraph\n\nfourth paragraph\n\nfifth paragraph" }),
  }).then((r) => r.json());
  check(imported.imported === 5, "seed: five real blocks created via import.md");

  // 2. Headless browser + CDP.
  proc = spawn(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--no-default-browser-check", "--force-device-scale-factor=1",
    "--window-size=1280,900", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  const port = await waitFor(25000, async () => {
    try { return Number(readFileSync(portFile, "utf8").trim().split(/\r?\n/)[0] || 0); }
    catch { return 0; }
  }, "DevToolsActivePort");
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no CDP page target");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("CDP websocket error")); });
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
  const evalJs = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(res.exceptionDetails)}`);
    return res.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");

  // 3. Open document, wait for the real block rows.
  await send("Page.navigate", { url: `http://127.0.0.1:${web}/?page=docs&docId=${docId}` });
  await waitFor(20000, async () => {
    try { return (await evalJs("document.querySelectorAll('[data-state=\"docs-block\"]').length")) === 5; }
    catch { return false; }
  }, "five block rows rendered");
  const beforeUi = await evalJs("Array.from(document.querySelectorAll('[data-state=\"docs-block-input\"]')).map(e=>e.value)");
  check(beforeUi[2] === "third paragraph", "open: third block is 'third paragraph' before drag");

  // 4. Real HTML5 DnD event sequence through the app handlers (separate CDP
  //    turns so React commits dragSourceId before dragover/drop).
  const dragStarted = await evalJs(`(() => {
    const handles = Array.from(document.querySelectorAll('[data-state="docs-drag-handle"]'));
    if (handles.length !== 5) return false;
    handles[2].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
    return true;
  })()`);
  check(dragStarted === true, "drag: dragstart emitted on third handle");
  await sleep(400);
  await evalJs(`(() => {
    const row = document.querySelector('[data-state="docs-block"]');
    if (!row) return false;
    const top = row.getBoundingClientRect().top;
    row.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientY: top + 3 }));
    return true;
  })()`);
  await sleep(250);
  const dragOverLine = await evalJs("document.querySelectorAll('[data-state=\"docs-drop-line\"]').length");
  check(dragOverLine === 1, "drag: insertion line shown during dragover");
  await sleep(200);
  await evalJs(`(() => {
    const row = document.querySelector('[data-state="docs-block"]');
    if (!row) return false;
    const top = row.getBoundingClientRect().top;
    row.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientY: top + 3 }));
    const handles = Array.from(document.querySelectorAll('[data-state="docs-drag-handle"]'));
    handles[2]?.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
    return true;
  })()`);
  await waitFor(20000, async () => {
    try {
      const v = await evalJs("document.querySelector('[data-state=\"docs-block-input\"]')?.value ?? ''");
      return v === "third paragraph";
    } catch { return false; }
  }, "dropped block becomes first in UI");

  // 5. HTTP truth: order + contiguous positions.
  const after = await fetch(`http://127.0.0.1:${api}/api/documents/${docId}/blocks`).then((r) => r.json());
  const texts = after.blocks.map((b) => b.content.text);
  const positions = after.blocks.map((b) => b.position);
  check(texts[0] === "third paragraph", "HTTP readback: third block now first");
  check(JSON.stringify(positions) === JSON.stringify([0, 1, 2, 3, 4]), "HTTP readback: positions contiguous 0..4");
  check(after.blocks[0].id > 0 && after.blocks.length === 5, "HTTP readback: five blocks still present");

  // 6. Reload: UI order must persist.
  await send("Page.reload", { ignoreCache: true });
  await waitFor(20000, async () => {
    try { return (await evalJs("document.querySelectorAll('[data-state=\"docs-block\"]').length")) === 5; }
    catch { return false; }
  }, "five block rows after reload");
  const afterReload = await evalJs("Array.from(document.querySelectorAll('[data-state=\"docs-block-input\"]')).map(e=>e.value)");
  check(afterReload[0] === "third paragraph", "reload: dropped order persists (no data loss)");
  check(JSON.stringify(afterReload) === JSON.stringify(texts), "reload: full block order byte-for-byte unchanged");

  // 7. Probe cleanup.
  const del = await fetch(`http://127.0.0.1:${api}/api/documents/${docId}`, { method: "DELETE" }).then((r) => r.status);
  check(del === 200, "cleanup: probe document soft-deleted");
  docId = 0;
} finally {
  if (ws) { try { ws.close(); } catch { /* already gone */ } }
  killBrowser();
  if (docId) {
    try { await fetch(`http://127.0.0.1:${api}/api/documents/${docId}`, { method: "DELETE" }); } catch { /* best effort */ }
  }
}
const failed = checks.filter((c) => !c.ok);
console.log(`\nR45 FIRSTUSE: ${checks.length - failed.length}/${checks.length} green`);
if (failed.length) process.exit(1);
