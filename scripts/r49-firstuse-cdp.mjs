// scripts/r49-firstuse-cdp.mjs - r49 "first use" full chain (headless CDP, ASCII only).
// Real API + real browser clicks: seed todo -> export via UI -> choose backup file ->
// validate/preview -> restore dialog (check + confirm) -> HTTP readback -> reload -> cleanup.
// Usage: node scripts/r49-firstuse-cdp.mjs --api 8791 --web 5174 --browser <edge.exe>
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (key && key.startsWith("--")) args[key.slice(2)] = process.argv[i + 1] ?? "";
}
const api = Number(args.api || 8791);
const web = Number(args.web || 5174);
const browser = args.browser;
if (!browser) throw new Error("missing --browser");

const checks = [];
function check(cond, label) {
  checks.push({ ok: Boolean(cond), label });
  console.log(`${cond ? "  ok" : "  FAIL"} ${label}`);
}
const profile = mkdtempSync(join(tmpdir(), "r49-firstuse-cdp-"));
let proc = null;
let ws = null;
const stamp = `r49-firstuse-${Date.now()}`;
const title = `${stamp}-todo`;
let todoId = 0;
function killBrowser() {
  if (proc && proc.pid) {
    try { spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* gone */ }
  }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* gone */ }
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
  // 0. seed one known todo over real HTTP, then export a real snapshot (download target).
  const created = await fetch(`http://127.0.0.1:${api}/api/todos`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, quadrant: "q2" }),
  }).then((r) => r.json());
  todoId = created.id;
  check(todoId > 0, "seed: real todo created over HTTP");
  const exported = await fetch(`http://127.0.0.1:${api}/api/backup/export`).then((r) => r.json());
  const backupPath = join(profile, "backup.json");
  writeFileSync(backupPath, JSON.stringify(exported), "utf8");
  check(Object.keys(exported.tables).length === 38, "seed: exported backup has 38 whitelist tables");
  check(exported.tables.sessions === undefined && exported.tables.change_log === undefined, "seed: runtime tables absent");

  // 1. mutate the known row so restore has something visible to undo.
  await fetch(`http://127.0.0.1:${api}/api/todos/${todoId}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "done" }),
  });
  let todos = await fetch(`http://127.0.0.1:${api}/api/todos`).then((r) => r.json());
  check(todos.todos.find((t) => t.id === todoId)?.status === "done", "mutate: todo status changed before restore");

  // 2. headless browser + CDP.
  proc = spawn(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--no-default-browser-check", "--force-device-scale-factor=1",
    "--window-size=1280,1000", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  const port = await waitFor(25000, async () => {
    try {
      return Number(readFileSync(portFile, "utf8").trim().split(/\r?\n/)[0] || 0);
    } catch { return 0; }
  }, "DevToolsActivePort");
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no CDP page target");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("CDP ws error")); });
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
  const click = async (selector) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  await send("Page.enable");
  await send("Runtime.enable");
  await send("DOM.enable");

  // 3. Open workbench; real click on export button.
  await send("Page.navigate", { url: `http://127.0.0.1:${web}/` });
  await waitFor(20000, async () => {
    try { return (await evalJs("document.querySelectorAll('[data-state=\"backup-export-btn\"]').length")) === 1; }
    catch { return false; }
  }, "backup card rendered");
  check((await click('[data-state="backup-export-btn"]')) === true, "export: button clicked in real browser");
  await waitFor(20000, async () => {
    try { return (await evalJs("document.querySelector('[data-state=\"backup-meta\"]')?.innerText ?? ''")).includes("38"); }
    catch { return false; }
  }, "export result meta visible");
  check((await evalJs("document.querySelector('[data-state=\"backup-file-name\"]')?.innerText ?? ''")).includes("xieflow-workspace-backup-"), "export: file name rendered after click");

  // 4. Real file input -> validate -> preview table.
  const dom = await send("DOM.getDocument", { depth: 1 });
  const fileNode = await send("DOM.querySelector", { nodeId: dom.root.nodeId, selector: '[data-state="backup-file-input"]' });
  if (!fileNode.nodeId) throw new Error("file input node not found");
  await send("DOM.setFileInputFiles", { files: [backupPath], nodeId: fileNode.nodeId });
  await waitFor(20000, async () => {
    try { return (await evalJs("document.querySelector('[data-state=\"backup-file-name\"]')?.innerText ?? ''")).includes("backup.json"); }
    catch { return false; }
  }, "file selected");
  check((await click('[data-state="backup-preview-btn"]')) === true, "preview: button clicked");
  await waitFor(20000, async () => {
    try { return (await evalJs("document.querySelectorAll('[data-state=\"backup-preview-row\"]').length")) >= 1; }
    catch { return false; }
  }, "preview rows rendered");
  const previewRows = await evalJs("document.querySelectorAll('[data-state=\"backup-preview-row\"]').length");
  check(previewRows >= 1, `preview: ${previewRows} table rows rendered`);

  // 5. Restore dialog: confirm checkbox then submit.
  check((await click('[data-state="backup-restore-btn"]')) === true, "restore: open confirm dialog");
  await waitFor(20000, async () => {
    try { return (await evalJs("document.querySelectorAll('[data-state=\"backup-confirm-dialog\"]').length")) === 1; }
    catch { return false; }
  }, "confirm dialog rendered");
  check((await evalJs("document.querySelector('[data-state=\"backup-restore-submit\"]')?.disabled")) === true, "confirm: disabled before acknowledgment");
  check((await click('[data-state="backup-confirm-checkbox"]')) === true, "confirm: checkbox clicked");
  check((await evalJs("document.querySelector('[data-state=\"backup-restore-submit\"]')?.disabled")) === false, "confirm: enabled after acknowledgment");
  check((await click('[data-state="backup-restore-submit"]')) === true, "confirm: restore submitted from real dialog");
  await waitFor(20000, async () => {
    try { return (await evalJs("document.querySelectorAll('[data-state=\"backup-success\"]').length")) === 1; }
    catch { return false; }
  }, "restore success with reload hint");
  check((await evalJs("document.body.innerText.includes('重新加载')")) === true, "restore: reload hint visible");

  // 6. HTTP truth: mutated row restored to backup value.
  todos = await fetch(`http://127.0.0.1:${api}/api/todos`).then((r) => r.json());
  check(todos.todos.find((t) => t.id === todoId)?.title === title, "restore: todo title read back via HTTP");
  check(todos.todos.find((t) => t.id === todoId)?.status === "open", "restore: todo status reverted via HTTP");

  // 7. Reload via real button; page still healthy, data persists.
  check((await click('[data-state="backup-reload-btn"]')) === true, "reload: button clicked");
  await waitFor(20000, async () => {
    try { return (await evalJs("document.querySelectorAll('[data-state=\"backup-card\"]').length")) === 1; }
    catch { return false; }
  }, "reloaded backup card");
  check((await evalJs("document.querySelectorAll('[data-state=\"backup-card\"]').length")) === 1, "reload: card still present");
  todos = await fetch(`http://127.0.0.1:${api}/api/todos`).then((r) => r.json());
  check(todos.todos.find((t) => t.id === todoId)?.status === "open", "reload: restored data persists");
} catch (err) {
  check(false, `chain crashed: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  if (ws) { try { ws.close(); } catch { /* gone */ } }
  killBrowser();
  try {
    await fetch(`http://127.0.0.1:${api}/api/todos/${todoId}`, { method: "DELETE" });
  } catch { /* gone */ }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\nR49 FIRSTUSE: ${checks.length - failed.length}/${checks.length} ok`);
if (failed.length > 0) {
  for (const c of failed) console.error(`  FAIL ${c.label}`);
  process.exit(1);
}
console.log("R49 FIRSTUSE: ALL GREEN");
