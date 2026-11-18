// XieFlow docker runtime entry (r21). ASCII only.
// Serves the built web SPA on 0.0.0.0:8080 and proxies /api/ to the api child.
// The api child uses XIEFLOW_DB_PATH on the mounted data volume; mode comes from env.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import http from "node:http";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url))); // /app
const staticRoot = join(root, "apps", "web", "dist");
const port = Number(process.env.XIEFLOW_PORT || 8080);
const apiPort = Number(process.env.XIEFLOW_API_PORT || 8787);
const dataDir = join(root, "data");

// data dir self-check: create if missing, verify writable before serving.
function assertDataDir() {
  mkdirSync(dataDir, { recursive: true });
  if (!statSync(dataDir).isDirectory()) throw new Error(`data path is not a directory: ${dataDir}`);
  const probe = join(dataDir, ".write-probe");
  writeFileSync(probe, "ok");
  unlinkSync(probe);
  console.log(`[docker] data dir OK: ${dataDir}`);
}
assertDataDir();

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
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith("/api/")) {
    const proxyReq = http.request(
      { host: "127.0.0.1", port: apiPort, path: url.pathname + url.search, method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${apiPort}` } },
      (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); },
    );
    proxyReq.on("error", () => { res.writeHead(502); res.end(JSON.stringify({ error: "api child not running" })); });
    req.pipe(proxyReq);
    return;
  }
  let p = normalize(decodeURIComponent(url.pathname));
  if (p === "/" || p === "\\") p = "/index.html";
  const file = join(staticRoot, p);
  if (!file.startsWith(staticRoot) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(200, { "content-type": MIME[".html"] });
    createReadStream(join(staticRoot, "index.html")).pipe(res); // SPA fallback
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
});

const { createRequire } = await import("node:module");
const requireRoot = createRequire(join(root, "package.json"));
const tsxPkgPath = requireRoot.resolve("tsx/package.json");
const tsxCli = join(dirname(tsxPkgPath), "dist", "cli.mjs");
const apiEntry = join(root, "apps", "api", "src", "server.ts");
const apiChild = spawn(process.execPath, [tsxCli, apiEntry], {
  env: { ...process.env, XIEFLOW_DB_PATH: join(dataDir, "xieflow.db"), XIEFLOW_API_PORT: String(apiPort) },
  stdio: "inherit",
});
apiChild.on("exit", (code) => { console.error(`[docker] api exited (${code}); closing.`); process.exit(code ?? 1); });

server.listen(port, "0.0.0.0", () => {
  console.log(`[docker] XieFlow ready on 0.0.0.0:${port} (mode=${process.env.XIEFLOW_MODE || "local"})`);
});

const bye = () => { try { apiChild.kill(); } catch {} process.exit(0); };
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
