// XieFlow scripts/push-via-api.mjs - push local commits to GitHub via REST API.
// ASCII only. No dependencies (uses global fetch + child_process).
//
// WHY: on this dev box github.com:443 is intermittently reset and the local
// proxy (127.0.0.1:7897) is not always running, while api.github.com stays
// reachable. This script pushes through the API instead of git-over-https.
//
// SAFETY (learned from the r1 accident): after the push it compares the REMOTE
// tree sha with the LOCAL tree sha. A mismatch means content was lost -> it
// exits non-zero instead of pretending success. The r1 accident shipped a
// commit whose tree was built from an empty base_tree and silently dropped 33
// files; this check is the guard against a repeat.
//
// Usage:
//   node scripts/push-via-api.mjs            # push master
//   node scripts/push-via-api.mjs --tag v0.0.6   # push master + create tag
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "sun13-AI/xieflow";
const API = `https://api.github.com/repos/${REPO}`;

function git(args, opts = {}) {
  return execFileSync("git", args, { cwd: root, encoding: opts.buffer ? "buffer" : "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
}

// ---- token: reuse the repo's credential helper (never touches disk) ----
function readToken() {
  const ps = process.platform === "win32" ? "powershell.exe" : "pwsh";
  const out = execFileSync(
    ps,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "scripts", "credential-github.ps1")],
    { encoding: "utf8" },
  );
  const m = out.split(/\r?\n/).find((l) => l.startsWith("password="));
  if (!m) throw new Error("no credential found (Windows Credential Manager / gh CLI)");
  return m.slice("password=".length).trim();
}

const token = readToken();
const headers = {
  Authorization: `Bearer ${token}`,
  "User-Agent": "xieflow",
  Accept: "application/vnd.github+json",
};

async function api(path, method = "GET", body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { ...headers, "Content-Type": "application/json" } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ---- state ----
const localHead = git(["rev-parse", "HEAD"]).trim();
const localTree = git(["rev-parse", "HEAD^{tree}"]).trim();
const wantTag = process.argv.includes("--tag") ? process.argv[process.argv.indexOf("--tag") + 1] : null;

const ref = await api("/git/ref/heads/master");
let remoteSha = ref.object.sha;

// commits to replay: local commits that are not yet represented on the remote.
// The remote head may be an API-created commit whose sha has no local object
// (r1/r3 lesson), so we cannot use "<remote>..HEAD" ranges. Instead: replay the
// local commits that are NOT ancestors of the last local commit we pushed.
const markerFile = join(root, ".git", "xieflow-pushed-marker");
const lastPushedLocal = existsSync(markerFile) ? readFileSync(markerFile, "utf8").trim() : "";
let toReplay;
if (lastPushedLocal) {
  toReplay = git(["rev-list", "--reverse", `${lastPushedLocal}..HEAD`]).trim().split(/\r?\n/).filter(Boolean);
} else {
  toReplay = git(["rev-list", "--reverse", "HEAD"]).trim().split(/\r?\n/).filter(Boolean);
}
console.log(`[api-push] local HEAD ${localHead.slice(0, 7)} · remote master ${remoteSha.slice(0, 7)} · commits to replay: ${toReplay.length}`);

for (const sha of toReplay) {
  // diff base = LOCAL parent (content diff), but the tree base = REMOTE head
  // (API-created commits have different shas than local ones, so the local
  // parent sha may not exist in the remote object db).
  const localParent = execFileSync("git", ["rev-parse", `${sha}^`], { cwd: root, encoding: "utf8" }).trim();
  const parentInfo = await api(`/git/commits/${remoteSha}`);
  const baseTree = parentInfo.tree.sha;

  // changed files in this commit (name-status: A/M/D/R)
  const diff = git(["diff", "--name-status", "--no-renames", localParent, sha]).trim();
  const entries = [];
  for (const line of diff.split(/\r?\n/).filter(Boolean)) {
    const [status, path] = line.split("\t");
    if (status.startsWith("D")) {
      entries.push({ path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const content = git(["cat-file", "blob", `${sha}:${path}`], { buffer: true });
    const blob = await api("/git/blobs", "POST", {
      content: content.toString("base64"),
      encoding: "base64",
    });
    entries.push({ path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await api("/git/trees", "POST", { base_tree: baseTree, tree: entries });

  // GUARD (per commit): the tree we just built must equal the LOCAL commit's tree.
  // Any mismatch = content drift -> abort before touching the ref.
  const localTreeOfCommit = git(["rev-parse", `${sha}^{tree}`]).trim();
  if (tree.sha !== localTreeOfCommit) {
    console.error(`[api-push] TREE MISMATCH on ${sha.slice(0, 7)}: built ${tree.sha} vs local ${localTreeOfCommit}`);
    process.exit(2);
  }

  const msg = git(["log", "-1", "--format=%B", sha]).trim();
  const created = await api("/git/commits", "POST", {
    message: msg,
    tree: tree.sha,
    parents: [remoteSha],
  });
  await api("/git/refs/heads/master", "PATCH", { sha: created.sha, force: false });
  remoteSha = created.sha;
  console.log(`[api-push] replayed ${sha.slice(0, 7)} -> ${created.sha.slice(0, 7)} (${entries.length} files, tree verified ${tree.sha.slice(0, 7)})`);
}

// ---- tag ----
if (wantTag) {
  const tagObj = await api("/git/tags", "POST", {
    tag: wantTag,
    message: `${wantTag} (pushed via scripts/push-via-api.mjs)`,
    object: remoteSha,
    type: "commit",
  });
  await api("/git/refs", "POST", { ref: `refs/tags/${wantTag}`, sha: tagObj.sha });
  console.log(`[api-push] tag ${wantTag} -> ${tagObj.sha.slice(0, 7)}`);
}

// ---- GUARD: remote tree must equal local tree (r1 accident guard) ----
const finalRef = await api("/git/ref/heads/master");
const finalCommit = await api(`/git/commits/${finalRef.object.sha}`);
if (finalCommit.tree.sha !== localTree) {
  console.error(`[api-push] TREE MISMATCH — remote ${finalCommit.tree.sha.slice(0, 10)} vs local ${localTree.slice(0, 10)}`);
  console.error("[api-push] content may differ; inspect before releasing");
  process.exit(2);
}
console.log(`[api-push] OK · remote tree == local tree (${localTree.slice(0, 10)}) · master=${finalRef.object.sha.slice(0, 7)}`);
writeFileSync(markerFile, localHead, "utf8");
