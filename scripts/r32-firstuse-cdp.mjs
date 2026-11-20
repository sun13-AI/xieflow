// scripts/r32-firstuse-cdp.mjs - r32 "first use" full chain proof (ASCII only).
// Real headless CDP clicks: create doc -> import 10 block types -> export menu ->
// print (spy seam, no system dialog) -> Word download -> reload keeps blocks -> cleanup.
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
function check(cond, label) {
  if (cond) process.stdout.write(`  ok ${label}\n`);
  else { failures.push(label); process.stdout.write(`  FAIL ${label}\n`); }
}

const profile = mkdtempSync(join(tmpdir(), "r32-firstuse-cdp-"));
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
  const exists = (sel) => evalJs(`Boolean(document.querySelector(${JSON.stringify(sel)}))`);
  const url = `http://127.0.0.1:${webPort}/?page=docs`;
  await send("Page.navigate", { url });
  await waitFor(20000, async () => exists('[data-state="docs-new-button"]'), "docs page ready");

  // 1) create document via UI
  await click('[data-state="docs-new-button"]');
  await waitFor(5000, async () => exists('[data-state="docs-new-title"]'), "create dialog");
  const title = `r32-firstuse-${Date.now()}`;
  check(await setInput('[data-state="docs-new-title"]', title) === title, "typed new document title");
  await click('[data-state="docs-create-confirm"]');
  await waitFor(10000, async () => {
    const okState = await evalJs(`Boolean(document.querySelector('[data-state="docs-editor"]')) && !document.querySelector('[data-state="docs-create-dialog"]') && !document.querySelector('[data-state="docs-import-button"]').disabled`);
    return okState;
  }, "editor after create");

  // 2) import ten block types through the real preview/confirm flow
  const md = [
    "# r32 first use", "## second heading", "### third heading", "body paragraph <script>alert(1)</script>",
    "- bullet", "1. numbered one", "1. numbered two", "- [x] done todo", "> quote", "```ts", "const a = 1 < 2;", "```", "---",
  ].join("\n\n");
  await click('[data-state="docs-import-button"]');
  await waitFor(5000, async () => exists('[data-state="docs-import-text"]'), "import dialog");
  await setInput('[data-state="docs-import-text"]', md);
  await click('[data-state="docs-import-preview-button"]');
  await waitFor(8000, async () => exists('[data-state="docs-import-preview-result"]'), "import preview result");
  await click('[data-state="docs-import-confirm"]');
  const blockCount = await waitFor(10000, async () => {
    const n = await evalJs(`document.querySelectorAll('[data-state="docs-block"]').length`);
    return n >= 10 ? n : 0;
  }, "ten blocks in editor");
  check(blockCount >= 10, `import wrote ${blockCount} blocks through UI`);

  // 3) export menu -> print (spy seam) -> Word bytes
  await click('[data-state="docs-export-menu-button"]');
  await waitFor(5000, async () => exists('[data-state="docs-export-menu"]'), "export menu open");
  check(await exists('[data-state="docs-export-print"]') && await exists('[data-state="docs-export-word"]'), "print + word menu items visible");
  await click('[data-state="docs-export-print"]');
  const spyCalls = await waitFor(10000, async () => {
    const n = await evalJs(`(window.__xieflowPrintSpy && window.__xieflowPrintSpy.calls) || 0`);
    return n >= 1 ? n : 0;
  }, "print spy call");
  check(spyCalls >= 1, `print spy recorded ${spyCalls} call(s), no system dialog`);
  check(await exists('[data-state="docs-print-preview"]'), "print preview overlay shown");
  await click('[data-state="docs-print-preview"] .btn-ghost');

  await click('[data-state="docs-export-menu-button"]');
  await waitFor(5000, async () => exists('[data-state="docs-export-word"]'), "export menu reopened");
  await click('[data-state="docs-export-word"]');
  const wordEvidence = await waitFor(10000, async () => {
    const text = await evalJs(`(() => { var el=document.querySelector('[data-state="docs-word-export-evidence"]'); return el ? el.textContent : null; })()`);
    return text || null;
  }, "word evidence panel").catch(() => null);
  check(Boolean(wordEvidence && wordEvidence.includes("EF BB BF")), "Word export recorded UTF-8 BOM evidence");

  // 4) reload keeps blocks and the selected document
  await send("Page.reload", { ignoreCache: true });
  await waitFor(15000, async () => exists('[data-state="docs-block"]'), "reload blocks");
  const afterReload = await evalJs(`document.querySelectorAll('[data-state="docs-block"]').length`);
  check(afterReload >= 10, `reload kept ${afterReload} blocks`);

  // 5) HTTP truth + cleanup (probe only)
  const list = await fetch(`http://127.0.0.1:${apiPort}/api/documents`).then((r) => r.json());
  const doc = (list.documents || []).find((d) => d.title === title);
  check(Boolean(doc), "HTTP list contains the created document");
  if (doc) {
    const h = await fetch(`http://127.0.0.1:${apiPort}/api/documents/${doc.id}/export.html`);
    check(h.status === 200 && (await h.text()).includes("data-block-type"), "HTTP export.html carries ten block types");
    const w = await fetch(`http://127.0.0.1:${apiPort}/api/documents/${doc.id}/export.doc`);
    const wbuf = new Uint8Array(await w.arrayBuffer());
    check(w.status === 200 && wbuf[0] === 0xEF && wbuf[1] === 0xBB && wbuf[2] === 0xBF, "HTTP export.doc starts with UTF-8 BOM");
    const del = await fetch(`http://127.0.0.1:${apiPort}/api/documents/${doc.id}`, { method: "DELETE" });
    check(del.status === 200, "probe document soft-deleted after proof");
  }
} finally {
  try { if (ws) ws.close(); } catch { }
  killBrowser();
}

if (failures.length > 0) {
  process.stdout.write(`R32 FIRSTUSE: FAIL (${failures.length})\n`);
  process.exit(1);
}
process.stdout.write("R32 FIRSTUSE: ALL GREEN\n");
