// scripts/r59-a11y-cdp.mjs - r59 a11y headless CDP assertions (ASCII only).
// Real keyboard path: Tab reaches all 42 calendar cells; Enter/Space opens the
// create-schedule modal; active-tab white-on-blue contrast >= 4.5:1.
// One-shot scratch DB + hidden Edge; no visible window, no user data.
// `node scripts/r59-a11y-cdp.mjs`          -> assertions only (test:all)
// `node scripts/r59-a11y-cdp.mjs --shots`  -> assertions + docs/ui/r59 PNG matrix
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const API_PORT = 8787;
const WEB_PORT = 5173;
const SHOTS = process.argv.includes("--shots");
const SHOT_DIR = "docs/ui/r59";
const failures = [];
const metrics = {};

function check(cond, label) {
  if (cond) console.log(`  ok ${label}`);
  else {
    failures.push(label);
    console.error(`  FAIL ${label}`);
  }
}

function killTree(proc) {
  if (!proc || !proc.pid) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-proc.pid, "SIGKILL");
  } catch { /* already gone */ }
}

function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH,
    `${process.env.ProgramFiles || ""}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env["ProgramFiles(x86)"] || ""}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.LOCALAPPDATA || ""}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles || ""}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(Boolean);
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error("Edge/Chrome not found for r59 CDP probe");
  return hit;
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

async function waitHttp(url, ms, label) {
  await waitFor(ms, async () => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
      return r.ok ? true : null;
    } catch { return null; }
  }, label);
}

function startDetached(command, args, env, procs) {
  const proc = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: "ignore",
    detached: process.platform !== "win32",
  });
  procs.push(proc);
  return proc;
}

function channels(rgb) {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(String(rgb ?? ""));
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function luminance(rgb) {
  const c = channels(rgb);
  if (!c) return null;
  const [r, g, b] = c.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function main() {
  const scratch = mkdtempSync(join(tmpdir(), "r59-a11y-"));
  const procs = [];
  let ws = null;
  try {
    const env = {
      XIEFLOW_API_PORT: String(API_PORT),
      XIEFLOW_DB_PATH: join(scratch, "r59-a11y.db"),
      XIEFLOW_MODE: "local",
    };
    if (process.platform === "win32") {
      startDetached("cmd.exe", ["/c", "pnpm exec tsx apps/api/src/server.ts"], env, procs);
      startDetached("cmd.exe", ["/c", "pnpm dev:web"], env, procs);
    } else {
      startDetached("pnpm", ["exec", "tsx", "apps/api/src/server.ts"], env, procs);
      startDetached("pnpm", ["dev:web"], env, procs);
    }
    await waitHttp(`http://127.0.0.1:${API_PORT}/api/health`, 60000, "scratch api");
    await waitHttp(`http://127.0.0.1:${WEB_PORT}/`, 60000, "dev web");

    const browser = findBrowser();
    const profile = join(scratch, "edge-profile");
    const portFile = join(profile, "DevToolsActivePort");
    procs.push(spawn(browser, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
      "--no-default-browser-check", "--force-device-scale-factor=1",
      "--window-size=1280,900", "--remote-debugging-port=0",
      `--user-data-dir=${profile}`, "about:blank",
    ], { windowsHide: true, stdio: "ignore" }));
    const port = await waitFor(30000, async () => {
      try {
        const txt = readFileSync(portFile, "utf8").trim().split(/\r?\n/)[0];
        return Number(txt || 0) || null;
      } catch { return null; }
    }, "CDP port");
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
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
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
    const key = async (name, code, vk, text) => {
      const down = { type: "keyDown", key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
      if (text !== undefined) down.text = text;
      await send("Input.dispatchKeyEvent", down);
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    };
    const tab = () => key("Tab", "Tab", 9);
    const blur = () => evalJs("document.activeElement && document.activeElement.blur && document.activeElement.blur(); true;");
    const capture = async (file) => {
      if (!SHOTS) return;
      mkdirSync(SHOT_DIR, { recursive: true });
      const res = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(join(SHOT_DIR, file), Buffer.from(res.data, "base64"));
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.navigate", { url: `http://127.0.0.1:${WEB_PORT}/?page=schedules` });
    await waitFor(60000, async () => {
      const n = await evalJs("document.querySelectorAll('.cal-cell').length");
      return Number(n) === 42 ? true : null;
    }, "42 calendar cells");
    await evalJs("document.querySelectorAll('.cal-cell[role=button]').forEach((el,i)=>el.setAttribute('data-r59-cell',String(i))); true;");

    metrics.cellCount = await evalJs("document.querySelectorAll('.cal-cell[role=button]').length");
    metrics.tabindexZero = await evalJs("[...document.querySelectorAll('.cal-cell[role=button]')].filter(e=>e.tabIndex===0).length");
    check(metrics.cellCount === 42, `42 个 role=button 日历格在场（实测 ${metrics.cellCount}）`);
    check(metrics.tabindexZero === 42, `42/42 日历格 tabindex=0（实测 ${metrics.tabindexZero}）`);
    await capture("01-schedule-month.png");

    // Pass 1: real Tab traversal covering every cell.
    await blur();
    const reached = [];
    for (let i = 0; i < 120 && reached.length < 42; i++) {
      await tab();
      const idx = await evalJs("(()=>{const e=document.activeElement;return e&&e.matches&&e.matches('.cal-cell[data-r59-cell]')?Number(e.getAttribute('data-r59-cell')):null;})()");
      if (idx !== null && !reached.includes(idx)) reached.push(idx);
    }
    metrics.tabReachedCells = reached.length;
    check(reached.length === 42, `Tab 真遍历覆盖 42/42 日历格（实测 ${reached.length}）`);
    check(reached.length === 42 && new Set(reached).size === 42, "Tab 序列覆盖 42 个不同格（无重复、非空转）");
    await evalJs("document.querySelector('.cal-cell[data-r59-cell=\"41\"]').focus(); true;");
    metrics.lastCellFocused = await evalJs("document.activeElement && document.activeElement.getAttribute('data-r59-cell') === '41'");
    check(metrics.lastCellFocused === true, "程序化聚焦末格成功（Tab 可达后的焦点态取证）");
    await capture("02-last-cell-focus.png");

    // Pass 2: Tab to the first cell, then Enter opens the modal.
    await blur();
    let firstFocused = false;
    for (let i = 0; i < 120; i++) {
      await tab();
      firstFocused = await evalJs("document.activeElement && document.activeElement.getAttribute('data-r59-cell') === '0'");
      if (firstFocused) break;
    }
    metrics.tabFocusedFirstCell = firstFocused === true;
    check(metrics.tabFocusedFirstCell, "Tab 可聚焦首格（键盘可达实证）");
    metrics.focusOutline = await evalJs("getComputedStyle(document.activeElement).outline");
    check(/solid/.test(String(metrics.focusOutline)) && !/none/.test(String(metrics.focusOutline)), `焦点格 outline 可见（实测 ${metrics.focusOutline}）`);
    await capture("03-first-cell-focus.png");
    await key("Enter", "Enter", 13);
    await sleep(100);
    metrics.modalAfterEnter = await evalJs("document.querySelectorAll('[data-state=schedule-modal]').length");
    check(metrics.modalAfterEnter === 1, `Enter 后新建日程弹窗出现（实测 ${metrics.modalAfterEnter}）`);
    await capture("04-enter-modal.png");
    await evalJs("document.querySelector('[data-state=schedule-modal] .modal-actions .btn-secondary')?.click(); true;");
    await sleep(100);

    // Space path: same Tab focus, Space must also open the modal.
    await blur();
    let spaceFocused = false;
    for (let i = 0; i < 120; i++) {
      await tab();
      spaceFocused = await evalJs("document.activeElement && document.activeElement.getAttribute('data-r59-cell') === '0'");
      if (spaceFocused) break;
    }
    check(spaceFocused === true, "Space 路径同样 Tab 聚焦首格");
    await key(" ", "Space", 32, " ");
    await sleep(100);
    metrics.modalAfterSpace = await evalJs("document.querySelectorAll('[data-state=schedule-modal]').length");
    check(metrics.modalAfterSpace === 1, `Space 后新建日程弹窗出现（实测 ${metrics.modalAfterSpace}）`);
    await capture("05-space-modal.png");
    await evalJs("document.querySelector('[data-state=schedule-modal] .modal-actions .btn-secondary')?.click(); true;");
    await sleep(80);

    // Active tab contrast from real computed styles (WCAG 2.x formula).
    const style = await evalJs("(()=>{const e=document.querySelector('.tab-active');if(!e)return null;const s=getComputedStyle(e);return {color:s.color,background:s.backgroundColor,fontSize:s.fontSize,fontWeight:s.fontWeight};})()");
    metrics.activeTabStyle = style;
    metrics.activeTabRatio = style ? Number(contrast(style.color, style.background).toFixed(2)) : null;
    check(style !== null, "激活 tab 计算样式可读");
    check(metrics.activeTabRatio !== null && metrics.activeTabRatio >= 4.5, `激活 tab 白字对比度 ${metrics.activeTabRatio}:1 >= 4.5（r58 基线 4.28）`);
    check(style && style.background === "rgb(47, 104, 229)", `激活 tab 背景为 #2f68e5（实测 ${style && style.background}）`);
    await capture("06-tab-active.png");
  } finally {
    if (ws) { try { ws.close(); } catch { /* ignore */ } }
    for (const p of procs) killTree(p);
    try { rmSync(scratch, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main().then(() => {
  console.log(`R59_A11Y: ${failures.length === 0 ? "ALL GREEN" : "RED"} ${JSON.stringify(metrics)}`);
  if (failures.length > 0) {
    console.error("失败清单：");
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
  setTimeout(() => process.exit(process.exitCode ?? 0), 100);
}).catch((err) => {
  console.error(`R59_A11Y: CRASH ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
