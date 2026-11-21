// XieFlow r54 - DOC-CONTRACT watchdog (headless, zero deps, exit 0/1).
// r54: P0-1 补修 round (remote business routes behind one admin gate; no render-layer
// change, no new feature). The current round declaration must live in BOTH root
// README sections; the danger-zone ledger (8 classification rows), the r51 precision
// section and the transparent declarations (README / r50 report / shell README R50 block)
// are kept as history. Any mismatch => exit 1. Historical r43~r53 contracts stay intact.
// Authoritative sources:
//   - schema version: packages/shared/src/index.ts  SCHEMA_VERSION constant
//   - CI smoke regex: .github/workflows/ci.yml      schemaVersion grep -E group
//   - e2e / audit counts: scripts/e2e-test.ts's own README quick-ref assertions
//     (the measured caliber the test scripts themselves publish)
// Contract targets (compact root README.md):
//   - two "vN" prose spots (CI smoke regex / schema migration queue)
//   - quick-ref line e2e/audit numbers
//   - "界面与测试对照" and "### 断言规模" sections, both naming the current round
//   - screenshot matrix index links + shell re-shoot declaration (render-change round)
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

/** r48: three-category counts in the plan.md 遗留总账 header. */
export function parseLedgerCounts(ledger: string): {
  must: number | null;
  accepted: number | null;
  tradeoff: number | null;
  closed: number | null;
} {
  const m = ledger.match(
    /真缺陷必修\s*(\d+)\s*\/\s*已披露可接受\s*(\d+)\s*\/\s*设计取舍保留\s*(\d+)\s*，另\s*(\d+)\s*条已闭环链/,
  );
  return m
    ? { must: Number(m[1]), accepted: Number(m[2]), tradeoff: Number(m[3]), closed: Number(m[4]) }
    : { must: null, accepted: null, tradeoff: null, closed: null };
}

/** r48: slice a top-level section by literal markers (its body has h3 subheads). */
export function betweenMarkers(doc: string, begin: string, end: string): string {
  const a = doc.indexOf(begin);
  const b = doc.indexOf(end);
  return a < 0 || b < 0 || b <= a ? "" : doc.slice(a, b);
}

/** r44: "changed=N / same=M" disclosure inside a shell-hash block. */
export function parseChangedSame(block: string): { changed: number | null; same: number | null } {
  const m = block.match(/changed\s*=\s*(\d+)\s*\/\s*same\s*=\s*(\d+)/);
  return { changed: m ? Number(m[1]) : null, same: m ? Number(m[2]) : null };
}

/** r44: "全库 N PNG / M 互异" global count inside a shell-hash block. */
export function parseGlobalCount(block: string): { png: number | null; distinct: number | null } {
  const m = block.match(/全库\s*(\d+)\s*PNG\s*\/\s*(\d+)\s*互异/);
  return { png: m ? Number(m[1]) : null, distinct: m ? Number(m[2]) : null };
}

/** r44: the input-error / service-error copy split in MeetingsPage's error frame. */
export function parseInputErrorCopy(src: string): { title: string | null; hint: string | null } {
  const title = src.match(/recommendError\s*!==\s*""\s*\?\s*"([^"]+)"\s*:\s*"连接失败"/);
  const hint = src.match(/recommendError\s*!==\s*""\s*\?\s*"([^"]+)"\s*:\s*"请确认 api/);
  return { title: title?.[1] ?? null, hint: hint?.[1] ?? null };
}

/** r46: first line in a document that contains a marker (empty string when absent). */
export function lineWith(doc: string, marker: string): string {
  return doc.split(/\r?\n/).find((l) => l.includes(marker)) ?? "";
}

/**
 * r50: slice the 危险区台账 table out of plan.md and return its data rows.
 * Rows start with "| rN" (e.g. "| r3 | ...", "| r15~r21 | ..."); the
 * 未触发区确认 paragraph is also tracked. Empty when the section is missing.
 */
export function parseDangerLedger(plan: string): { rows: string[]; confirmed: boolean } {
  const body = betweenMarkers(plan, "## 危险区台账", "## 任务单");
  if (!body) return { rows: [], confirmed: false };
  const rows = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^\|\s*r\d+/.test(l));
  return { rows, confirmed: body.includes("未触发区确认") };
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
const probeCS = parseChangedSame("blah changed=6 / same=14 blah");
const probeCSBad = parseChangedSame("blah changed=8 / same=12 blah");
const probeCSNone = parseChangedSame("no counts here");
check(probeCS.changed === 6 && probeCS.same === 14, "self-probe·changed=6/same=14 可解析");
check(probeCSBad.changed === 8 && probeCSBad.same === 12, "self-probe·旧 8/12 口径可检出");
check(probeCSNone.changed === null && probeCSNone.same === null, "self-probe·无 changed/same -> null");
const probeGC = parseGlobalCount("全库 372 PNG / 370 互异（同态组仅 r4）");
const probeGCOld = parseGlobalCount("全库 365 PNG / 363 互异");
check(probeGC.png === 372 && probeGC.distinct === 370, "self-probe·全库 372/370 可解析");
check(probeGCOld.png === 365 && probeGCOld.distinct === 363, "self-probe·全库 365/363 可检出");
const probeCopy = parseInputErrorCopy('x recommendError !== "" ? "输入有误" : "连接失败" y recommendError !== "" ? "请检查人数/设备/时段后重试。" : "请确认 api 服务已启动（pnpm dev:api），然后重试。" z');
const probeCopyNone = parseInputErrorCopy('static <h2>连接失败</h2>');
check(probeCopy.title === "输入有误" && probeCopy.hint === "请检查人数/设备/时段后重试。", "self-probe·输入错误文案双分支可解析");
check(probeCopyNone.title === null && probeCopyNone.hint === null, "self-probe·无输入错误分支 -> null");
check(lineWith("aa\nbb foo cc\ndd", "foo") === "bb foo cc", "self-probe·lineWith 命中行提取");
check(lineWith("aa\nbb", "zzz") === "", "self-probe·lineWith 未命中 -> 空串");
const probeLedgerDoc = (n: number): string =>
  `## 危险区台账\n${Array.from({ length: n }, (_, i) => `| r${i + 1} | 动作${i} | 类别 | lead | 结果 |`).join("\n")}\n未触发区确认：无\n## 任务单`;
const probeLedger8 = parseDangerLedger(probeLedgerDoc(8));
const probeLedger7 = parseDangerLedger(probeLedgerDoc(7));
const probeLedgerNone = parseDangerLedger("无台账节");
check(probeLedger8.rows.length === 8 && probeLedger8.confirmed, "self-probe·r50 台账 8 行可解析");
check(probeLedger7.rows.length === 7 && probeLedger7.confirmed, "self-probe·r50 台账 7 行可检出（非恒真）");
check(probeLedgerNone.rows.length === 0 && !probeLedgerNone.confirmed, "self-probe·r50 缺台账 -> 空");
const probeLedger = parseLedgerCounts("真缺陷必修 0 / 已披露可接受 16 / 设计取舍保留 12，另 11 条已闭环链");
check(
  probeLedger.must === 0 && probeLedger.accepted === 16 && probeLedger.tradeoff === 12 && probeLedger.closed === 11,
  "self-probe·r48 总账三类计数可解析",
);
const probeLedgerOther = parseLedgerCounts("真缺陷必修 1 / 已披露可接受 2 / 设计取舍保留 3，另 4 条已闭环链");
check(
  probeLedgerOther.must === 1 && probeLedgerOther.accepted === 2 && probeLedgerOther.tradeoff === 3 && probeLedgerOther.closed === 4,
  "self-probe·r48 旧/错计数可检出（非恒真）",
);
check(
  parseLedgerCounts("无分类口径").must === null,
  "self-probe·r48 缺总账口径 -> null",
);
check(
  betweenMarkers("head\n## A\nalpha\n### a1\nbeta\n## B\ntail", "## A", "## B") === "## A\nalpha\n### a1\nbeta\n",
  "self-probe·betweenMarkers 跨 h3 子节截取",
);
check(betweenMarkers("no markers", "## A", "## B") === "", "self-probe·betweenMarkers 缺标记 -> 空串");

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

const ROUND = "r54";
const uiSec = sectionBody(root, "## 界面与测试对照");
const scaleSec = sectionBody(root, "### 断言规模");
check(uiSec !== null, "README·「界面与测试对照」节在场");
check(scaleSec !== null, "README·「### 断言规模」节在场");
check(
  uiSec !== null && uiSec.includes(ROUND) && uiSec.includes("P0-1 补修轮") &&
    uiSec.includes("无渲染层改动") && uiSec.includes("沿用 r49 图证") &&
    uiSec.includes("七态矩阵") && uiSec.includes("20 壳") &&
    uiSec.includes("docs/ui/r49/README.md") && uiSec.includes("docs/ui/shell/README.md") &&
    uiSec.includes("01-backup-card.png") && uiSec.includes("07-error.png") &&
    uiSec.includes("数据备份与恢复") && uiSec.includes("二十 tab 数量不变") &&
    uiSec.includes("二次确认"),
  "README·「界面与测试对照」节声明当前轮 r54 P0-1 补修轮（沿用 r49 图证、七态矩阵 + 20 壳索引在场）",
);
const docChecksInReadme = scaleSec === null ? null : (/DOC-CONTRACT \*\*(\d+)\*\*/.exec(scaleSec)?.[1] ?? null);
check(
  scaleSec !== null && scaleSec.includes(ROUND) && scaleSec.includes("P0-1 补修轮") &&
    scaleSec.includes("remote 统一 admin 闸门") && scaleSec.includes("P0-1 注册闸门") && scaleSec.includes("零删除") &&
    counts.e2e !== null &&
    counts.audit !== null &&
    scaleSec.includes(`e2e **${counts.e2e}**`) &&
    scaleSec.includes(`HTTP audit **${counts.audit}**`) &&
    docChecksInReadme !== null && Number(docChecksInReadme) >= 98,
  `README·「### 断言规模」节声明当前轮 r54 P0-1 补修且数字与 scripts 口径一致（e2e ${counts.e2e} / audit ${counts.audit} / DOC-CONTRACT ${docChecksInReadme}）`,
);
check(
  uiSec !== null &&
    (uiSec.includes("r50 里程碑复审透明声明") || uiSec.includes("r51 台账精度修正透明声明") || uiSec.includes("r53 安全修复透明声明") || uiSec.includes("r54 补修透明声明")) &&
    uiSec.includes("沿用 r49 七图") && uiSec.includes("20 壳") &&
    uiSec.includes("mtime") && uiSec.includes("逐字沿用"),
  "README·透明声明沿用 r49 七图 + 20 壳且 mtime/哈希逐字沿用（允许 r50/r51 措辞）",
);
const r50Report = readOrEmpty("docs/feedback/2026-11-21-r50-yanfa.md");
check(
  r50Report.includes("r50") && r50Report.includes("沿用 r49 七图") &&
    r50Report.includes("20 壳") && r50Report.includes("mtime") && r50Report.includes("逐字沿用"),
  "r50 报告·透明声明沿用 r49 七图 + 20 壳（三处之二）",
);
const roundIndex50 = readOrEmpty("docs/ui/r50/README.md");
check(
  roundIndex50.includes("r50") && roundIndex50.includes("无渲染层改动") &&
    roundIndex50.includes("沿用 r49") && roundIndex50.includes("mtime") &&
    roundIndex50.includes("逐字沿用"),
  "r50 索引·零图片轻量索引透明声明在场",
);

// ---------- screenshot / shell index (r47/r48 historical + r49 render-change baseline) ----------

const baselineIndex = readOrEmpty("docs/ui/r47/README.md");
check(
  baselineIndex.includes("r47") && baselineIndex.includes("01-pending-card.png") &&
    baselineIndex.includes("07-error.png") && baselineIndex.includes("<!-- R47_HASHES_BEGIN -->"),
  "r47 索引·七态矩阵与哈希块在场（历史基线未动）",
);
const roundIndex48 = readOrEmpty("docs/ui/r48/README.md");
check(
  roundIndex48.includes("r48") && roundIndex48.includes("沿用 r47") &&
    roundIndex48.includes("无渲染层改动") && roundIndex48.includes("零图片轻量索引"),
  "r48 索引·透明声明无渲染层改动、沿用 r47 矩阵与壳图不重拍（零图片）",
);
const roundIndex49 = readOrEmpty("docs/ui/r49/README.md");
check(
  roundIndex49.includes("r49") && roundIndex49.includes("01-backup-card.png") &&
    roundIndex49.includes("05-confirm-dialog.png") && roundIndex49.includes("07-error.png") &&
    roundIndex49.includes("<!-- R49_MATRIX_HASHES_BEGIN -->") &&
    roundIndex49.includes("393 PNG / 391 互异"),
  "r49 索引·七态矩阵 + 哈希块 + 全库 393/391 计数在场",
);
const shellIndex = read("docs/ui/shell/README.md");
check(
  shellIndex.includes("r47") && shellIndex.includes("<!-- R47_HASHES_BEGIN -->"),
  "shell 索引·r47 历史哈希块保留（如实披露 changed/same）",
);
check(
  shellIndex.includes("r49") && shellIndex.includes("同批重拍") &&
    shellIndex.includes("<!-- R49_HASHES_BEGIN -->") &&
    shellIndex.includes("changed=9 / same=11") && shellIndex.includes("393 PNG / 391 互异"),
  "shell 索引·r49 二十 tab 壳同批重拍事实 + R49 当前哈希块 + changed/same 披露在场",
);
check(
  shellIndex.includes("**r50 里程碑体系复审") && shellIndex.includes("沿用 r49 七图") &&
    shellIndex.includes("20 壳") && shellIndex.includes("mtime") && shellIndex.includes("逐字沿用"),
  "shell 索引·R50 块沿用 r49 七图 + 20 壳声明在场（三处之三）",
);

// ---------- r47：确认闸门规则集中 / api 路由 / web seam ----------

const toolGate47 = read("packages/agent/toolGate.ts");
check(
  toolGate47.includes("export function needsConfirmation") &&
    toolGate47.includes("export function buildToolPreview") &&
    toolGate47.includes("export function planToolExecution") &&
    toolGate47.includes("STATE_CHANGING_TOOLS"),
  "r47·toolGate 三纯函数集中且复用 shared STATE_CHANGING_TOOLS（变异红相锚点）",
);
const api47src = read("apps/api/src/server.ts");
check(
  api47src.includes('post("/api/conversations/:id/confirm"') &&
    api47src.includes("normalizeAutoExecute") &&
    api47src.includes("findToolCallByCallId"),
  "r47·api confirm 路由 + autoExecute 归一 + db 闸门寻址在场",
);
const web47src = read("apps/web/src/ChatPage.tsx");
check(
  web47src.includes('data-state="chat-pending-card"') &&
    web47src.includes('data-state="chat-confirm-btn"') &&
    web47src.includes('data-state="chat-discard-btn"') &&
    web47src.includes('data-state="chat-auto-toggle"'),
  "r47·web 待确认卡 / 确认 / 放弃 / 自动执行 seam 四件套在场",
);

// ---------- r44：图证与文档口径修正（U2-1 / U2-2 / U3） ----------

const r44Index = readOrEmpty("docs/ui/r44/README.md");
check(
  r44Index.includes("r44") && r44Index.includes("docs/ui/r43/05-recommend-conflicts.png") &&
    r44Index.includes("docs/ui/r43/07-recommend-error.png") && r44Index.includes("同批重拍"),
  "r44 索引·重拍声明与七态矩阵链接在场",
);

// U2-1：05 图注时段必须与 MeetingsPage 的冲突钉态同源（14:30–15:00），不再留 09:00–10:00。
const meetingsSrc = read("apps/web/src/MeetingsPage.tsx");
const roundIdx = read("docs/ui/r43/README.md");
const line05 = roundIdx.split(/\r?\n/).find((l) => l.includes("05-recommend-conflicts.png")) ?? "";
check(
  meetingsSrc.includes('const conflictPin = query.shot === "meetings-recommend-conflicts"') &&
    /start:\s*conflictPin \? "14:30" : "09:00",\s*end:\s*conflictPin \? "15:00" : "10:00"/.test(meetingsSrc),
  "r44 U2-1·MeetingsPage 冲突时段 seam 钉为 14:30–15:00（表单与推荐结果同源）",
);
check(
  line05.includes("14:30") && line05.includes("15:00") && !line05.includes("09:00"),
  "r44 U2-1·r43 索引 05 图注时段 14:30–15:00 与画面 seam 一致",
);

// U2-2：校验错误帧为纯用户文案，不带开发命令；服务错误帧保留在另一分支。
const inputCopy = parseInputErrorCopy(meetingsSrc);
check(
  inputCopy.title === "输入有误" && inputCopy.hint !== null &&
    inputCopy.hint.includes("请检查人数/设备/时段") && !inputCopy.hint.includes("pnpm"),
  "r44 U2-2·校验错误帧为「输入有误 / 请检查人数/设备/时段」纯用户文案",
);
const line07 = roundIdx.split(/\r?\n/).find((l) => l.includes("07-recommend-error.png")) ?? "";
check(
  line07.includes("输入有误") && !line07.includes("连接失败") && !line07.includes("pnpm"),
  "r44 U2-2·r43 索引 07 图注改为输入有误文案（无连接失败/开发命令）",
);

// U3：shell README 三处口径修正（changed/same、全库计数归位、陈旧 r37 徽章）。
const shellR43 = sectionBody(shellIndex, "## r43 哈希自查");
const shellR41 = sectionBody(shellIndex, "## r41 哈希自查");
const cs43 = shellR43 === null ? { changed: null, same: null } : parseChangedSame(shellR43);
check(
  cs43.changed === 6 && cs43.same === 14 && (shellR43 === null || !shellR43.includes("changed=8 / same=12")),
  "r44 U3-1·shell R43 块 changed=6/same=14 如实披露（旧 8/12 已清除）",
);
const gc43 = shellR43 === null ? { png: null, distinct: null } : parseGlobalCount(shellR43);
check(gc43.png === 372 && gc43.distinct === 370, "r44 U3-2·shell R43 块全库计数归位 372/370");
const gc41 = shellR41 === null ? { png: null, distinct: null } : parseGlobalCount(shellR41);
check(
  gc41.png === 365 && gc41.distinct === 363 && (shellR41 === null || !shellR41.includes("372 PNG")),
  "r44 U3-2·shell R41 历史块计数恢复 365/363（r43 数不再串位）",
);
const shellTable = shellIndex.slice(0, shellIndex.indexOf("## r43 哈希自查"));
check(
  !shellTable.includes("r37 徽章") && shellTable.includes("纯用户文案徽章"),
  "r44 U3-3·shell 当前表图注改为纯用户文案徽章（陈旧 r37 已清除）",
);

// ---------- r45：文档块拖拽排序（规则集中 / 图证 / 变异红相锚点） ----------

const blockDndSrc = read("packages/shared/src/blockDnd.ts");
const docsWeb45 = read("apps/web/src/DocsPage.tsx");
check(
  blockDndSrc.includes("export function planBlockDrop") &&
    blockDndSrc.includes("export function validateDropTarget") &&
    blockDndSrc.includes("const slot = Math.max(0, Math.min(total, rawTarget));"),
  "r45·shared/blockDnd 计划与边界钳制公式在场（变异红相锚点）",
);
check(
  read("packages/shared/package.json").includes('"./blockDnd": "./src/blockDnd.ts"'),
  "r45·@xieflow/shared/blockDnd 子路径已登记",
);
check(
  docsWeb45.includes('from "@xieflow/shared/blockDnd"') &&
    docsWeb45.includes('data-state="docs-drag-handle"') &&
    docsWeb45.includes('data-state="docs-drop-line"') &&
    docsWeb45.includes('data-state="docs-dnd-notice"'),
  "r45·DocsPage 消费 shared 规则且手柄/插入线/回执 seam 在场",
);
// r45 历史索引仍在（r46 三修的持久记录）；r47 根 README 已推进到本轮矩阵，
// 故 r45/r46 历史契约改读该持久索引，断言条数与意图不变。
const roundIndex45 = readOrEmpty("docs/ui/r45/README.md");
const r45Hashes = sectionBody(shellIndex, "## r45 哈希自查");
const cs45 = r45Hashes === null ? { changed: null, same: null } : parseChangedSame(r45Hashes);
const gc45 = r45Hashes === null ? { png: null, distinct: null } : parseGlobalCount(r45Hashes);
check(cs45.changed === 9 && cs45.same === 11, "r45·shell R45 块 changed=9/same=11 如实披露");
check(gc45.png === 379 && gc45.distinct === 377, "r45·shell R45 块全库计数 379/377 与实测一致");
check(
  roundIndex45.includes("POST /api/blocks/:id/move") &&
    roundIndex45.includes("HTTP 400") &&
    roundIndex45.includes("共 5 张卡"),
  "r45·七态索引载明真 HTTP move 与 4xx 错误态证据（r45 历史索引持久保留）",
);

// ---------- r46：索引口径修正（U2-1 / U2-2 / U2-3，无渲染层改动沿用 r45 壳图） ----------

const r46Index = readOrEmpty("docs/ui/r46/README.md");
check(
  r46Index.includes("r46") && r46Index.includes("沿用 r45") && r46Index.includes("无渲染层改动"),
  "r46 索引·透明声明无渲染层改动、沿用 r45 矩阵与壳图不重拍",
);
check(
  shellIndex.includes("r46") && shellIndex.includes("沿用 r45"),
  "shell 索引·透明声明 r46 无渲染层改动沿用 r45 壳图不重拍",
);

const idx04 = lineWith(roundIndex45, "04-dnd-cross-type.png");
const idx05 = lineWith(roundIndex45, "05-dnd-touch.png");
const idx07 = lineWith(roundIndex45, "07-dnd-error.png");
// r47 根 README 已推进到本轮矩阵；r46 三口径在持久的 r45 索引中逐字锁定（断言条数不变）。
const root04 = idx04;
const root05 = idx05;
const root07 = idx07;

// U2-1：04 图画面正文块落末位；两处索引须引同一条真实 audit 断言 position 仍连号，不得再引标题块落末位。
check(
  idx04.includes("r45 跨类型拖拽 position 仍连号") && !idx04.includes("标题块落末位"),
  "r46 U2-1·r45 索引 04 改引真实断言 position 仍连号（不实标题块落末位已删）",
);
check(
  root04.includes("r45 跨类型拖拽 position 仍连号") && !root04.includes("标题块落末位"),
  "r46 U2-1·r45 历史索引 04 口径持续锁定（根 README 已推进 r47，三修逐字保留）",
);
// U2-2：05 图按钮浅灰描边（Pillow 逐像素与 01 同区零差异），不得称蓝框强调。
check(
  !idx05.includes("蓝框") && idx05.includes("浅灰描边"),
  "r46 U2-2·r45 索引 05 改浅灰描边如实描述（蓝框强调已删）",
);
check(
  !root05.includes("蓝框") && root05.includes("浅灰描边"),
  "r46 U2-2·r45 历史索引 05 口径持续锁定（无蓝框，根 README 已推进 r47）",
);
// U2-3：07 图红条逐字为共 5 张卡（看板词汇混用），索引须逐字引用画面原文，不得写成共 5 块。
check(
  idx07.includes("共 5 张卡") && !idx07.includes("共 5 块"),
  "r46 U2-3·r45 索引 07 逐字引用画面原文共 5 张卡（误写共 5 块已删）",
);
check(
  root07.includes("共 5 张卡") && !root07.includes("共 5 块"),
  "r46 U2-3·r45 历史索引 07 逐字锁定共 5 张卡（根 README 已推进 r47）",
);

// ---------- r48：遗留总账三分类（纯文档收敛轮的权威证据） ----------

const plan48 = read("docs/plan.md");
const ledger48 = betweenMarkers(plan48, "## 遗留总账", "## 历史轮次");
check(ledger48.length > 0, "r48·plan.md「遗留总账」节在场且可切分");
check(
  ledger48.includes("### A · 真缺陷必修") && ledger48.includes("### B · 已披露可接受") &&
    ledger48.includes("### C · 设计取舍保留") && ledger48.includes("### D · 已闭环链") &&
    ledger48.includes("### E · 重新打开触发条件"),
  "r48·总账 A/B/C/D/E 五节齐备（三类 + 闭环链 + 复评触发）",
);
const ledgerCounts = parseLedgerCounts(ledger48);
check(
  ledgerCounts.must === 0 && ledgerCounts.accepted === 16 && ledgerCounts.tradeoff === 12 && ledgerCounts.closed === 11,
  `r48·总账计数 0/16/12 + 11 闭环（实际 ${ledgerCounts.must}/${ledgerCounts.accepted}/${ledgerCounts.tradeoff}/${ledgerCounts.closed}）`,
);
check(
  ledger48.includes("最近 15 轮（r33~r47）") && ledger48.includes("28 条独立条目"),
  "r48·盘点范围与去重总数可追溯（r33~r47 三岗报告）",
);
check(
  ledger48.includes("C1 窄容器壳末枚药丸右缘裁切") && ledger48.includes("转 B1"),
  "r48·唯一必修候选 C1 的评估与转类留痕",
);
check(
  ledger48.includes("B1 复评触发") && ledger48.includes("修法配方") && ledger48.includes("overflow-x: auto"),
  "r48·B1 复评触发条件与修法配方在场（债务不无限滚）",
);
check(
  ledger48.includes("D1 错误条内部术语") && ledger48.includes("D11 r47 闸门漏检") && ledger48.includes("D10 r35 U1-1"),
  "r48·11 条闭环链首尾可追溯",
);

// ---------- r49：备份规则集中 / api 三路由 / web 卡与二次确认 ----------

const backupSrc = read("packages/shared/src/backup.ts");
check(
  backupSrc.includes("export const BACKUP_TABLES") &&
    backupSrc.includes("export function buildBackupManifest") &&
    backupSrc.includes("export function validateBackupFile") &&
    backupSrc.includes("export function planRestore") &&
    backupSrc.includes("export const BACKUP_CONFIRM_TOKEN = \"RESTORE_WORKSPACE\""),
  "r49·shared/backup 白名单 + 清单 + 校验 + 恢复计划 + 确认令牌五件套集中",
);
check(
  backupSrc.includes("if (!isBackupTable(name))") && backupSrc.includes("未知表或受保护表不属于备份白名单"),
  "r49·未知表/受保护表校验分支在场（变异红相锚点）",
);
check(
  read("packages/shared/package.json").includes('"./backup": "./src/backup.ts"'),
  "r49·@xieflow/shared/backup 子路径已登记",
);
const dbSrc49 = read("packages/db/src/index.ts");
check(
  dbSrc49.includes("exportBackupSnapshot()") && dbSrc49.includes("applyBackupPlan(") &&
    dbSrc49.includes('this.db.exec("BEGIN IMMEDIATE")') && dbSrc49.includes('this.db.exec("ROLLBACK")'),
  "r49·db 层快照导出 + 单事务替换 + 回滚在场",
);
const apiSrc49 = read("apps/api/src/server.ts");
check(
  apiSrc49.includes('get("/api/backup/export"') &&
    apiSrc49.includes('post("/api/backup/validate"') &&
    apiSrc49.includes('post("/api/backup/restore"') &&
    apiSrc49.includes("assertRestoreConfirmed(body.confirm)") &&
    apiSrc49.includes("applyBackupPlan(plan"),
  "r49·api 导出/校验/恢复三路由 + 二次确认 + 单事务接线在场",
);
const webSrc49 = read("apps/web/src/BackupCard.tsx");
check(
  webSrc49.includes('data-state="backup-card"') &&
    webSrc49.includes('data-state="backup-file-input"') &&
    webSrc49.includes('data-state="backup-preview-panel"') &&
    webSrc49.includes('data-state="backup-confirm-dialog"') &&
    webSrc49.includes('data-state="backup-confirm-checkbox"') &&
    webSrc49.includes('data-state="backup-error"') &&
    webSrc49.includes('data-state="backup-reload-btn"'),
  "r49·web 备份卡七 seam 在场",
);
check(
  read("apps/web/src/App.tsx").includes("<BackupCard />"),
  "r49·工作台设置区已挂载备份卡（tab 数量不变）",
);
check(
  root.includes("sessions") && root.includes("change_log") && root.includes("零半态"),
  "README·r49 危险区声明（运行时表不备份 + 零半态）在场",
);
check(
  read("scripts/shot.ps1").includes('-Round r49') &&
    read("scripts/shot.ps1").includes('${r49Base}?shot=backup-card'),
  "r49·shot.ps1 钉态矩阵段在场（PS5.1 ASCII 安全的 ${} 变量边界）",
);

// ---------- r50：危险区台账防复发（8 行分类表 + 未触发区确认） ----------

const plan50 = read("docs/plan.md");
const dangerLedger = parseDangerLedger(plan50);
check(
  dangerLedger.rows.length >= 8,
  `r50·docplan 危险区台账 ≥8 行分类表在场（实际 ${dangerLedger.rows.length} 行；r55 CI 修复追加为第 9 行）`,
);
check(dangerLedger.confirmed, "r50·docplan 危险区台账「未触发区确认」在场");
check(
  dangerLedger.rows.some((r) => r.includes("CI") && r.includes("verify-core") && r.includes("verify-macos")) &&
    dangerLedger.rows.some((r) => r.includes("Release") && r.includes("补发")),
  "r50·台账含 CI 拆分（verify-core/macos）+ Release backlog 补发关键行（变异红相锚点）",
);
check(
  dangerLedger.rows.some((r) => r.includes("push") && r.includes("tag")) &&
    dangerLedger.rows.some((r) => r.includes("进程") && r.includes("收净")),
  "r50·台账含 20+ 次 push/tag + r48 进程收净关键行",
);
check(
  dangerLedger.rows.some((r) =>
    ["users", "sessions", "change_log", "entity_versions"].every((t) => r.includes(t)),
  ),
  "r50·台账含 r49 四表排除红线关键行（users/sessions/change_log/entity_versions）",
);

// ---------- r51：台账精度修正防回退（git 实证锁定 + 旧值拒绝） ----------

const r51Ledger = betweenMarkers(plan50, "## 危险区台账", "## 任务单");
check(r51Ledger.length > 0, "r51·台账精度：危险区台账节可切分（防空串恒真）");
check(
  r51Ledger.includes("r16") && r51Ledger.includes("cc11340"),
  "r51·台账精度·P4：CI 拆分轮次锁定 r16 + commit cc11340",
);
check(
  r51Ledger.includes("r20") && r51Ledger.includes("73f02bb"),
  "r51·台账精度·P4：tar exclude 轮次锁定 r20 + commit 73f02bb",
);
check(
  r51Ledger.includes("v0.0.15~v0.0.20"),
  "r51·台账精度·P3：backlog 范围锁定 v0.0.15~v0.0.20（六个 tag）",
);
check(
  !r51Ledger.includes("v0.0.15~v0.0.25"),
  "r51·台账精度·P3 防回退：旧口径 v0.0.15~v0.0.25 不得回填台账",
);
check(
  !r51Ledger.includes("PID 26420"),
  "r51·台账精度·P5 防回退：瞬时 PID 26420 不得回填台账",
);
check(
  r51Ledger.includes("两个 node 进程") && r51Ledger.includes("命令行确属本仓库"),
  "r51·台账精度·P5：PID 改为描述性「两个 node 进程 + 命令行核对属本仓库」",
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
