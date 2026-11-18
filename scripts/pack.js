// XieFlow scripts/pack.js - build portable (unpackaged) dir + installer bundle.
// ASCII only. No dependencies.
//
// Semantics follow IKanBot's pack/dist split, adapted to a web app:
//   pack  -> release/xieflow-portable/        : 免安装目录 (run start.cmd)
//   dist  -> release/xieflow-setup-<ver>.zip  : 安装包 (portable dir zipped)
//
// Windows note: directory copies go through robocopy (built-in) because
// fs.cpSync{recursive:true} hard-crashes (0xC0000409) on Node 24.14 / Win 26200
// in this dev environment (r2 lead investigation; file-form cpSync works fine,
// every directory-form crash repros). On unix we keep cpSync.
//
// Usage:
//   pnpm pack             # portable dir only
//   pnpm dist             # portable dir + zip setup bundle
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;
const releaseDir = join(root, "release");
const portableName = "xieflow-portable";
const portableDir = join(releaseDir, portableName);
const isWin = process.platform === "win32";

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: true, ...opts });
  if (res.status !== 0) {
    console.error(`\n[pack] command failed (${res.status}): ${cmd} ${args.join(" ")}`);
    process.exit(res.status ?? 1);
  }
}

/** directory copy that survives this machine: robocopy on win, cpSync elsewhere */
function copyDir(src, dest) {
  if (isWin) {
    // robocopy exit codes 0-7 are success-ish; 8+ are failures
    const res = spawnSync("robocopy", [src, dest, "/E", "/NFL", "/NDL", "/NJH", "/NJS"], { shell: false });
    if (res.status === null || res.status >= 8) {
      console.error(`[pack] robocopy failed (${res.status}): ${src} -> ${dest}`);
      process.exit(res.status ?? 1);
    }
  } else {
    const { cpSync } = require("node:fs");
    cpSync(src, dest, { recursive: true });
  }
}

console.log(`[pack] xieflow v${version} -> ${portableDir}`);

// 1. build web assets
console.log("[pack] step 1/4: build web dist");
run("pnpm", ["--filter", "@xieflow/web", "build"], { cwd: root });

// 2. assemble portable dir
console.log("[pack] step 2/4: assemble portable dir");
rmSync(portableDir, { recursive: true, force: true });
mkdirSync(portableDir, { recursive: true });

copyDir(join(root, "apps", "web", "dist"), join(portableDir, "web"));
copyDir(join(root, "apps", "api", "src"), join(portableDir, "api", "src"));
copyDir(join(root, "packages"), join(portableDir, "packages"));
// packages/*/node_modules are workspace symlinks; they must not ship
for (const sub of ["agent", "db", "shared"]) {
  const nm = join(portableDir, "packages", sub, "node_modules");
  if (existsSync(nm)) rmSync(nm, { recursive: true, force: true });
}
// drop test fixtures that leaked into packages copy (if any)
const tmpFixture = join(portableDir, "packages", "shared", "tmp-dir-test");
if (existsSync(tmpFixture)) rmSync(tmpFixture, { recursive: true, force: true });

const apiPkg = JSON.parse(readFileSync(join(root, "apps", "api", "package.json"), "utf8"));
writeFileSync(
  join(portableDir, "package.json"),
  JSON.stringify(
    {
      name: "xieflow-portable",
      private: true,
      version,
      type: "module",
      scripts: { start: "node scripts/portable-serve.mjs" },
      dependencies: {
        "@xieflow/agent": "workspace:*",
        "@xieflow/db": "workspace:*",
        "@xieflow/shared": "workspace:*",
        fastify: apiPkg.dependencies.fastify,
        tsx: apiPkg.devDependencies.tsx,
      },
      devDependencies: { typescript: apiPkg.devDependencies.typescript },
    },
    null,
    2,
  ),
);

// workspace manifest for the portable pnpm install
writeFileSync(join(portableDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n\nallowBuilds:\n  esbuild: true\n");

mkdirSync(join(portableDir, "scripts"), { recursive: true });

// 3. install runtime deps inside the portable dir
console.log("[pack] step 3/4: install runtime deps into portable dir");
run("pnpm", ["install", "--no-frozen-lockfile"], { cwd: portableDir });

// 4. runtime entry + start scripts + README
console.log("[pack] step 4/4: write runtime entry");
const childServe = `// XieFlow portable runtime: static server on one port + api child process.
// ASCII only. Stop: close this console window (api child exits with us).
// Lives in scripts/, so the bundle root is one level up.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import http from "node:http";
import { join, dirname, extname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staticRoot = join(root, "web");
const port = Number(process.env.XIEFLOW_PORT || 8080);
const apiPort = Number(process.env.XIEFLOW_API_PORT || 8787);
const dataDir = join(root, "data");
// r21: data dir self-check - create if missing, verify writable, detect first run.
function assertDataDir() {
  const firstRun = !existsSync(dataDir);
  mkdirSync(dataDir, { recursive: true });
  if (!statSync(dataDir).isDirectory()) throw new Error("[portable] data path is not a directory: " + dataDir);
  const probe = join(dataDir, ".write-probe");
  writeFileSync(probe, "ok");
  unlinkSync(probe);
  return firstRun;
}
const firstRun = assertDataDir();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, \`http://127.0.0.1:\${port}\`);
  if (url.pathname.startsWith("/api/")) {
    const proxyReq = http.request(
      {
        host: "127.0.0.1",
        port: apiPort,
        path: url.pathname + url.search,
        method: req.method,
        headers: { ...req.headers, host: \`127.0.0.1:\${apiPort}\` },
      },
      (pr) => {
        res.writeHead(pr.statusCode, pr.headers);
        pr.pipe(res);
      },
    );
    proxyReq.on("error", () => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: "api child not running" }));
    });
    req.pipe(proxyReq);
    return;
  }
  let p = normalize(decodeURIComponent(url.pathname));
  if (p === "/" || p === "\\\\\\\\") p = "/index.html";
  const file = join(staticRoot, p);
  if (!file.startsWith(staticRoot) || !existsSync(file) || statSync(file).isDirectory()) {
    const index = join(staticRoot, "index.html"); // SPA fallback
    res.writeHead(200, { "content-type": MIME[".html"] });
    createReadStream(index).pipe(res);
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
});

// resolve tsx from the bundle root; its exports map hides dist/, so patch the
// physical path (createRequire.resolve would throw ERR_PACKAGE_PATH_NOT_EXPORTED)
const { createRequire } = await import("node:module");
const requireRoot = createRequire(join(root, "package.json"));
const tsxPkgPath = requireRoot.resolve("tsx/package.json");
const tsxCli = join(dirname(tsxPkgPath), "dist", "cli.mjs");
// api entry lives at bundle root /api/src/server.ts (root here = bundle root)
const apiEntry = join(root, "api", "src", "server.ts");
const apiChild = spawn(process.execPath, [tsxCli, apiEntry], {
  env: { ...process.env, XIEFLOW_DB_PATH: join(dataDir, "xieflow.db"), XIEFLOW_API_PORT: String(apiPort) },
  stdio: "inherit",
});
apiChild.on("exit", (code) => {
  console.error(\`[portable] api exited (\${code}); closing.\`);
  process.exit(code ?? 1);
});

server.listen(port, "127.0.0.1", () => {
  console.log("[portable] XieFlow ready:");
  console.log(\`  web+api  http://127.0.0.1:\${port}\`);
  console.log(\`  data     \${dataDir}\`);
  if (firstRun) {
    console.log("[portable] FIRST RUN: data dir created at " + dataDir);
    console.log("[portable] Open http://127.0.0.1:" + port + " in your browser (see README.txt).");
  } else {
    console.log("[portable] Existing data dir loaded (no migration of user data performed).");
  }
  console.log("  stop: close this window.");
});

const bye = () => {
  try { apiChild.kill(); } catch {}
  process.exit(0);
};
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
`;
writeFileSync(join(portableDir, "scripts", "portable-serve.mjs"), childServe);

writeFileSync(
  join(portableDir, "README.txt"),
  [
    `XieFlow v${version} portable - FIRST RUN GUIDE`,
    "=============================================",
    "",
    "1. Start:  double click start.cmd (Windows) or run ./start.sh (Linux/macOS).",
    "2. Browser: open http://127.0.0.1:8080",
    "3. Data:    auto-created at ./data/ on first run (SQLite: ./data/xieflow.db).",
    "            The data dir self-check runs at startup and fails loudly if unwritable.",
    "4. Stop:    close the console window (or press Ctrl+C).",
    "",
    "Requirements: Node.js >= 20  (https://nodejs.org)",
    "Backup: copy the whole ./data/ folder. Restore: copy it back. See docs/DEPLOY.md.",
    "",
  ].join("\n"),
);

writeFileSync(
  join(portableDir, "start.cmd"),
  [
    "@echo off",
    "rem XieFlow portable launcher (ASCII only)",
    "where node >nul 2>nul",
    "if errorlevel 1 (",
    "  echo Node.js is required. Install from https://nodejs.org then retry.",
    "  pause",
    "  exit /b 1",
    ")",
    "cd /d %~dp0",
    "node scripts\\portable-serve.mjs",
    "pause",
    "",
  ].join("\n"),
);

// r21: Linux/macOS launcher (POSIX sh, ASCII only). Same one-port runtime as start.cmd.
const startSh = join(portableDir, "start.sh");
writeFileSync(
  startSh,
  [
    "#!/bin/sh",
    "# XieFlow portable launcher for Linux/macOS (ASCII only)",
    "set -e",
    'cd "$(dirname "$0")"',
    "if ! command -v node >/dev/null 2>&1; then",
    '  echo "Node.js is required. Install from https://nodejs.org then retry."',
    "  exit 1",
    "fi",
    "exec node scripts/portable-serve.mjs",
    "",
  ].join("\n"),
  { mode: 0o755 },
);
if (!isWin) chmodSync(startSh, 0o755);

console.log(`[pack] portable dir ready: ${portableDir}`);
console.log(`[pack] try it:  cd release\\${portableName} && start.cmd`);

// ---- dist: zip the portable dir ----
if (process.argv[2] === "dist") {
  console.log("[dist] zipping portable dir -> setup bundle");
  const zipName = `xieflow-setup-${version}.zip`;
  const zipPath = join(releaseDir, zipName);
  rmSync(zipPath, { force: true });
  if (isWin) {
    run(
      "powershell.exe",
      ["-NoProfile", "-Command", `Compress-Archive -Path '${portableDir}\\*' -DestinationPath '${zipPath}' -Force`],
      { cwd: root },
    );
  } else {
    run("tar", ["-czf", zipPath, "-C", portableDir, "."], { cwd: root });
  }
  console.log(`[dist] setup bundle ready: ${zipPath}`);
  console.log("[dist] install semantics: unzip anywhere -> run start.cmd");
}

console.log("[pack] done.");
