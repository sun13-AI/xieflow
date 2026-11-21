// XieFlow r43 - DOC-CONTRACT watchdog (headless, zero deps, exit 0/1).
// r43: schema v27 + render-layer changes (room equipment badges + recommend panel);
// the compact root README must name the current round in both the UI and scale
// sections, carry the seven-shot matrix links, and keep the two vN prose spots in
// sync with SCHEMA_VERSION / the CI smoke regex. Any mismatch => exit 1.
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

const ROUND = "r46";
const uiSec = sectionBody(root, "## 界面与测试对照");
const scaleSec = sectionBody(root, "### 断言规模");
check(uiSec !== null, "README·「界面与测试对照」节在场");
check(scaleSec !== null, "README·「### 断言规模」节在场");
check(
  uiSec !== null && uiSec.includes(ROUND) && uiSec.includes("docs/ui/r45/01-dnd-handles.png") &&
    uiSec.includes("docs/ui/shell/README.md") && uiSec.includes("沿用 r45") && uiSec.includes("不重拍"),
  "README·「界面与测试对照」节声明当前轮 r46 沿用 r45 七矩阵 + 二十壳（无渲染层改动不重拍）",
);
check(
  scaleSec !== null &&
    scaleSec.includes(ROUND) &&
    counts.e2e !== null &&
    counts.audit !== null &&
    scaleSec.includes(`e2e **${counts.e2e}**`) &&
    scaleSec.includes(`HTTP audit **${counts.audit}**`),
  "README·「### 断言规模」节声明当前轮 r46 且数字与 scripts 口径一致",
);

// ---------- screenshot / shell index (r45 render-change round) ----------

const roundIndex = readOrEmpty("docs/ui/r45/README.md");
check(
  roundIndex.includes("r45") && roundIndex.includes("01-dnd-handles.png") &&
    roundIndex.includes("07-dnd-error.png") && roundIndex.includes("<!-- R45_HASHES_BEGIN -->"),
  "r45 索引·七态矩阵与哈希块在场",
);
const shellIndex = read("docs/ui/shell/README.md");
check(
  shellIndex.includes("r45") && shellIndex.includes("同批重拍") && shellIndex.includes("<!-- R45_HASHES_BEGIN -->"),
  "shell 索引·声明 r45 二十 tab 壳同批重拍且 R45 哈希块在场",
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
const r45Hashes = sectionBody(shellIndex, "## r45 哈希自查");
const cs45 = r45Hashes === null ? { changed: null, same: null } : parseChangedSame(r45Hashes);
const gc45 = r45Hashes === null ? { png: null, distinct: null } : parseGlobalCount(r45Hashes);
check(cs45.changed === 9 && cs45.same === 11, "r45·shell R45 块 changed=9/same=11 如实披露");
check(gc45.png === 379 && gc45.distinct === 377, "r45·shell R45 块全库计数 379/377 与实测一致");
check(
  roundIndex.includes("POST /api/blocks/:id/move") && roundIndex.includes("HTTP 400"),
  "r45·七态索引载明真 HTTP move 与 4xx 错误态证据",
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

const idx04 = lineWith(roundIndex, "04-dnd-cross-type.png");
const idx05 = lineWith(roundIndex, "05-dnd-touch.png");
const idx07 = lineWith(roundIndex, "07-dnd-error.png");
const root04 = uiSec === null ? "" : lineWith(uiSec, "04-dnd-cross-type.png");
const root05 = uiSec === null ? "" : lineWith(uiSec, "05-dnd-touch.png");
const root07 = uiSec === null ? "" : lineWith(uiSec, "07-dnd-error.png");

// U2-1：04 图画面正文块落末位；两处索引须引同一条真实 audit 断言 position 仍连号，不得再引标题块落末位。
check(
  idx04.includes("r45 跨类型拖拽 position 仍连号") && !idx04.includes("标题块落末位"),
  "r46 U2-1·r45 索引 04 改引真实断言 position 仍连号（不实标题块落末位已删）",
);
check(
  root04.includes("r45 跨类型拖拽 position 仍连号") && !root04.includes("标题块落末位"),
  "r46 U2-1·根 README 04 与 r45 索引口径一致",
);
// U2-2：05 图按钮浅灰描边（Pillow 逐像素与 01 同区零差异），不得称蓝框强调。
check(
  !idx05.includes("蓝框") && idx05.includes("浅灰描边"),
  "r46 U2-2·r45 索引 05 改浅灰描边如实描述（蓝框强调已删）",
);
check(
  !root05.includes("蓝框") && root05.includes("浅灰描边"),
  "r46 U2-2·根 README 05 与 r45 索引口径一致",
);
// U2-3：07 图红条逐字为共 5 张卡（看板词汇混用），索引须逐字引用画面原文，不得写成共 5 块。
check(
  idx07.includes("共 5 张卡") && !idx07.includes("共 5 块"),
  "r46 U2-3·r45 索引 07 逐字引用画面原文共 5 张卡（误写共 5 块已删）",
);
check(
  root07.includes("共 5 张卡") && !root07.includes("共 5 块"),
  "r46 U2-3·根 README 07 逐字引用画面原文共 5 张卡",
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
