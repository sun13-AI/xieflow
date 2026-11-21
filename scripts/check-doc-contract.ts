// XieFlow r42 - DOC-CONTRACT watchdog (headless, zero deps, exit 0/1).
// Authoritative sources:
//   - schema version: packages/shared/src/index.ts  SCHEMA_VERSION constant
//   - CI smoke regex: .github/workflows/ci.yml      schemaVersion grep -E group
//   - e2e / audit counts: scripts/e2e-test.ts's own README quick-ref assertions
//     (the measured caliber the test scripts themselves publish)
// Contract targets (compact root README.md):
//   - two "vN" prose spots (CI smoke regex / schema migration queue)
//   - quick-ref line e2e/audit numbers
//   - "界面与测试对照" and "### 断言规模" sections, both naming the current round
//   - screenshots index + shell index transparent "no render change / reuse r41" declaration
// Any mismatch => exit 1. This script is itself guarded by self-probes so its
// parsers cannot silently become vacuous (r40 check:text ROUND_SELF_PROBES precedent).
export {};

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const readOrEmpty = (rel: string): string => {
  try {
    return read(rel);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
};

const failures: string[] = [];
let passed = 0;

function check(cond: boolean, label: string): void {
  if (cond) {
    passed++;
    console.log(`  ok ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL ${label}`);
  }
}

// ---------- pure parsers ----------

/** SCHEMA_VERSION constant from packages/shared (authoritative schema version). */
export function parseSchemaVersion(src: string): number | null {
  const m = src.match(/export const SCHEMA_VERSION:\s*number\s*=\s*(\d+)\s*;/);
  return m ? Number(m[1]) : null;
}

/** Highest version inside the CI health smoke regex group, e.g. (2|3|...|26). */
export function parseSmokeVersion(ci: string): number | null {
  const line = ci
    .split(/\r?\n/)
    .find((l) => l.includes("schemaVersion") && l.includes("grep -E"));
  if (!line) return null;
  const groups = [...line.matchAll(/\((\d+(?:\|\d+)*)\)/g)];
  let max: number | null = null;
  for (const g of groups) {
    const raw = g[1];
    if (!raw) continue;
    for (const part of raw.split("|")) {
      const n = Number(part);
      if (Number.isInteger(n) && (max === null || n > max)) max = n;
    }
  }
  return max;
}

/** "CI smoke 正则随 schema 版本同步至 vN" in root README. */
export function parseCiProseVersion(root: string): number | null {
  const m = root.match(/CI smoke 正则随 schema 版本同步至\s*v(\d+)/);
  return m ? Number(m[1]) : null;
}

/** "迁移队列（当前 vN）" in root README. */
export function parseQueueProseVersion(root: string): number | null {
  const m = root.match(/迁移队列（当前\s*v(\d+)）/);
  return m ? Number(m[1]) : null;
}

/** Latest measured e2e / audit counts published inside e2e-test.ts's own README assertions. */
export function parsePublishedCounts(src: string): { e2e: number | null; audit: number | null } {
  const e2e = [...src.matchAll(/e2e（(\d+) 断言）/g)].at(-1)?.[1];
  const audit = [...src.matchAll(/HTTP 审计（(\d+) 断言）/g)].at(-1)?.[1];
  return {
    e2e: e2e === undefined ? null : Number(e2e),
    audit: audit === undefined ? null : Number(audit),
  };
}

/** Markdown section body by exact heading, bounded by the next same-or-higher heading. */
export function sectionBody(doc: string, heading: string): string | null {
  const lines = doc.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().startsWith(heading));
  if (start < 0) return null;
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3}\s/.test(lines[i]!)) break;
    body.push(lines[i]!);
  }
  return body.join("\n");
}

// ---------- self-probes: parsers must be real, not vacuous ----------

const PROBES: readonly (readonly [string, number | null])[] = [
  ["export const SCHEMA_VERSION: number = 26;", 26],
  ["export const SCHEMA_VERSION: number = 3;", 3],
  ["// no constant", null],
];
for (const [sample, want] of PROBES) {
  check(
    parseSchemaVersion(sample) === want,
    `self-probe·SCHEMA_VERSION ${JSON.stringify(sample)} -> ${want}`,
  );
}
check(parseSmokeVersion('curl | grep -Eq \'"schemaVersion":(2|3|24|25|26)\'') === 26, "self-probe·CI smoke 组末位 26");
check(parseSmokeVersion('curl | grep -q \'"ok":true\'') === null, "self-probe·CI smoke 无版本组 -> null");
check(parseCiProseVersion("CI smoke 正则随 schema 版本同步至 v26；") === 26, "self-probe·CI 文案 v26");
check(parseCiProseVersion("CI smoke 正则随 schema 版本同步至 v25；") === 25, "self-probe·CI 文案 v25 可检出");
check(parseQueueProseVersion("迁移队列（当前 v26）。") === 26, "self-probe·队列文案 v26");
check(parseQueueProseVersion("无版本说明") === null, "self-probe·队列文案缺失 -> null");
const probeCounts = parsePublishedCounts(
  'ok(root.includes("e2e（3551 断言）+ HTTP 审计（2703 断言）")); ok(x.includes("e2e（9 断言）"));',
);
check(probeCounts.e2e === 9 && probeCounts.audit === 2703, "self-probe·取最后一条 e2e 口径 + 唯一 audit 口径");
const probeSection = sectionBody("## A\nalpha\n\n## B\nbeta", "## A");
check(probeSection !== null && probeSection.includes("alpha") && !probeSection.includes("beta"), "self-probe·章节切分");

// ---------- authoritative sources ----------

const schemaV = parseSchemaVersion(read("packages/shared/src/index.ts"));
const smokeV = parseSmokeVersion(read(".github/workflows/ci.yml"));
check(schemaV !== null, `权威源·shared SCHEMA_VERSION 可读（= ${schemaV}）`);
check(smokeV !== null, `权威源·CI smoke 正则版本组可读（= ${smokeV}）`);
check(schemaV !== null && smokeV !== null && schemaV === smokeV, "权威源·SCHEMA_VERSION 与 CI smoke 末位一致");

// ---------- root README contract ----------

const root = read("README.md");
const ciProseV = parseCiProseVersion(root);
const queueProseV = parseQueueProseVersion(root);
check(ciProseV !== null, "README·CI smoke vN 文案在场");
check(queueProseV !== null, "README·迁移队列 vN 文案在场");
check(ciProseV !== null && ciProseV === schemaV, `README·CI smoke vN = 权威 ${schemaV}（实际 ${ciProseV}）`);
check(queueProseV !== null && queueProseV === schemaV, `README·迁移队列 vN = 权威 ${schemaV}（实际 ${queueProseV}）`);

const counts = parsePublishedCounts(read("scripts/e2e-test.ts"));
check(counts.e2e !== null && counts.e2e > 0, `scripts 口径·e2e 断言数可读（= ${counts.e2e}）`);
check(counts.audit !== null && counts.audit > 0, `scripts 口径·audit 断言数可读（= ${counts.audit}）`);
if (counts.e2e !== null && counts.audit !== null) {
  const quickRef = `e2e（${counts.e2e} 断言）+ HTTP 审计（${counts.audit} 断言）`;
  check(root.includes(quickRef), `README·速查行数字与 scripts 实测口径一致（${quickRef}）`);
}

const ROUND = "r42";
const uiSec = sectionBody(root, "## 界面与测试对照");
const scaleSec = sectionBody(root, "### 断言规模");
check(uiSec !== null, "README·「界面与测试对照」节在场");
check(scaleSec !== null, "README·「### 断言规模」节在场");
check(
  uiSec !== null && uiSec.includes(ROUND) && uiSec.includes("无渲染层改动") && uiSec.includes("沿用 r41 壳图"),
  "README·「界面与测试对照」节声明当前轮 r42 无渲染层改动，沿用 r41 壳图",
);
check(
  scaleSec !== null &&
    scaleSec.includes(ROUND) &&
    counts.e2e !== null &&
    counts.audit !== null &&
    scaleSec.includes(`e2e **${counts.e2e}**`) &&
    scaleSec.includes(`HTTP audit **${counts.audit}**`),
  "README·「### 断言规模」节声明当前轮 r42 且数字与 scripts 口径一致",
);

// ---------- screenshot / shell index transparency (r21 U2-1 precedent) ----------

const roundIndex = readOrEmpty("docs/ui/r42/README.md");
check(
  roundIndex.includes(ROUND) && roundIndex.includes("无渲染层改动") && roundIndex.includes("沿用 r41 壳图"),
  "r42 索引·透明声明本轮无渲染层改动，沿用 r41 壳图",
);
const shellIndex = read("docs/ui/shell/README.md");
check(
  shellIndex.includes(ROUND) && shellIndex.includes("无渲染层改动") && shellIndex.includes("沿用 r41 壳图"),
  "shell 索引·透明声明 r42 无渲染层改动，沿用 r41 壳图",
);

// ---------- verdict ----------

if (failures.length > 0) {
  console.error(`\nDOC-CONTRACT: ${failures.length} FAILURE(S), ${passed} ok`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `\nDOC-CONTRACT: ALL GREEN (${passed} checks; schema v${schemaV}; e2e ${counts.e2e}; audit ${counts.audit})`,
);
