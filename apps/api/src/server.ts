// 协流 XieFlow — api 服务：r1 提供 /api/health（数据库探针）
// 数据文件在 data/xieflow.db；HTTP 冒烟测试与 web 健康检查都走这里。
import Fastify from "fastify";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, type XieFlowDb } from "@xieflow/db";
import { CURRENT_SCHEMA_VERSION } from "@xieflow/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "..", "data");
const DB_PATH = process.env.XIEFLOW_DB_PATH ?? join(DATA_DIR, "xieflow.db");
const PORT = Number(process.env.XIEFLOW_API_PORT ?? 8787);

mkdirSync(dirname(DB_PATH), { recursive: true });

let db: XieFlowDb | null = null;
try {
  db = openDatabase({ path: DB_PATH });
} catch (err) {
  // 启动即坏库：不让服务带病上线，进程退出由进程管理器重启
  console.error("[api] 数据库打开失败：", err);
  process.exit(1);
}

const app = Fastify({ logger: { level: "warn" } });

app.get("/api/health", async () => {
  if (!db) throw new Error("数据库未连接");
  // 探针：真读一次库，不只是进程活着
  db.setSetting("last_health_check", new Date().toISOString());
  const settings = db.listSettings();
  return { ok: true, schemaVersion: CURRENT_SCHEMA_VERSION, settings };
});

app.get("/api/settings", async () => {
  return { settings: db ? db.listSettings() : [] };
});

const stop = async () => {
  await app.close();
  db?.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await app.listen({ port: PORT, host: "127.0.0.1" });
console.log(`[api] listening http://127.0.0.1:${PORT} · db=${DB_PATH}`);
