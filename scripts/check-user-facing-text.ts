// XieFlow r39 - user-facing text guard.
// Scans apps/web/src/**/*.tsx for internal test terminology leaking into
// user-visible prose string literals. Comments and compact ASCII technical
// tokens (shot names, data-state/data-action/seam hook values, feed keys) are
// exempt: those are seam markers required by AGENTS.md article 1.
// Exit 0 = clean, exit 1 = jargon found (list printed to stderr).
export {};

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(ROOT, "apps", "web", "src");

type Term = { readonly re: RegExp; readonly label: string };

// Each term is a piece of tester vocabulary, never product vocabulary.
const TERMS: readonly Term[] = [
  { re: /截图钉态|截图钉注|钉注/, label: "截图钉态/钉注" },
  { re: /(?<![A-Za-z])audit(?![A-Za-z])/i, label: "audit" },
  { re: /(?<![A-Za-z])e2e(?![A-Za-z])/i, label: "e2e" },
  { re: /4xx/i, label: "4xx" },
  { re: /(?<![A-Za-z])seam(?![A-Za-z])/i, label: "seam" },
  { re: /shot=/i, label: "shot=" },
  { re: /\br\d{1,3}\b/i, label: "rNN 轮次号" },
];

type Literal = {
  readonly text: string;
  readonly file: string;
  readonly line: number;
  readonly col: number;
  readonly before: string;
};

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out.sort();
}

// Minimal lexer: skips // and /* */ comments, returns quoted/template literal
// payloads only. Chinese prose / whitespace marks user-visible copy; compact
// ASCII tokens are technical identifiers and are intentionally not reported.
function literals(source: string, file: string): Literal[] {
  const out: Literal[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const n = source.length;
  const advance = (): void => {
    if (source[i] === "\n") {
      line++;
      col = 1;
    } else col++;
    i++;
  };
  while (i < n) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") advance();
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      advance();
      advance();
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) advance();
      if (i < n) {
        advance();
        advance();
      }
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      const startLine = line;
      const startCol = col;
      const startIdx = i;
      const buf: string[] = [];
      advance();
      while (i < n) {
        if (source[i] === "\\") {
          buf.push(source[i]!);
          advance();
          if (i < n) {
            buf.push(source[i]!);
            advance();
          }
          continue;
        }
        if (source[i] === quote) {
          advance();
          break;
        }
        // Template ${...} is code, not prose; skip its contents verbatim so
        // identifiers inside do not become false positives.
        if (quote === "`" && source[i] === "$" && source[i + 1] === "{") {
          buf.push("$");
          advance();
          buf.push("{");
          advance();
          let depth = 1;
          while (i < n && depth > 0) {
            if (source[i] === "{") depth++;
            else if (source[i] === "}") depth--;
            buf.push(source[i]!);
            advance();
          }
          continue;
        }
        buf.push(source[i]!);
        advance();
      }
      const before = source.slice(Math.max(0, startIdx - 90), startIdx);
      out.push({ text: buf.join(""), file, line: startLine, col: startCol, before });
      continue;
    }
    advance();
  }
  return out;
}

// JSX text children (e.g. <span className="badge">r38 · ...</span>) are not
// quoted literals; collect them separately. Annotation notes rendered inside
// seam-note / shot-note elements are exempted downstream by their tag.
function jsxTextNodes(source: string, file: string): Literal[] {
  const out: Literal[] = [];
  for (let i = 0; i < source.length - 1; i++) {
    if (source[i] !== ">") continue;
    const end = source.indexOf("<", i + 1);
    if (end < 0) continue;
    const text = source.slice(i + 1, end);
    if (!/[\u3400-\u9fff]/.test(text)) continue;
    if (/[={};]/.test(text)) continue;
    let line = 1;
    for (let k = 0; k <= i; k++) if (source[k] === "\n") line++;
    out.push({ text, file, line, col: 1, before: source.slice(Math.max(0, i - 90), i + 1) });
    i = end;
  }
  return out;
}

// Exempt technical seam markers, not product copy:
//  - compact ASCII identifiers (shot names, DOM hooks, feed keys);
//  - template literals whose literal parts are compact ASCII (e.g. `${seam}-picker`);
//  - className / data-* / seam attribute values (never user prose).
//  - 图注-style钉注 annotations: these are the screenshot evidence notes
//    required by AGENTS.md article 1; they are labelled as annotations by
//    their leading `截图钉态：` / `截图钉注：` / `<topic>钉注：` prefix.
function isSeamMarker(lit: Literal): boolean {
  const { text, before } = lit;
  if (/(?:className|data-state|data-action|data-testid|seam)\s*=\s*$/.test(before)) return true;
  // JSX annotation notes: their enclosing tag declares them as seam evidence.
  if (/className="[^"]*(?:seam-note|shot-note)[^"]*"[^>]*>$/.test(before)) return true;
  const stripped = text.replace(/\$\{[^}]*\}/g, "");
  if (!/[\u3400-\u9fff\s]/.test(stripped) && /^[A-Za-z0-9_.:-]*$/.test(stripped)) return true;
  return /^(?:截图钉态[:：]|截图钉注[:：]|.{0,10}钉注[:：])/.test(text);
}

function hits(text: string): string[] {
  const found: string[] = [];
  for (const term of TERMS) if (term.re.test(text)) found.push(term.label);
  return found;
}

// r40: self-probe locks the round-marker term as REAL behavior, not a source
// string check. r39 waizhuan P5: single-digit `r2` leaked past the two-digit
// regex, so a 1..3 digit marker must now be detected (waizhuan placeholder).
const ROUND_SELF_PROBES: readonly (readonly [string, boolean])[] = [
  ["例：写 r2 复验材料", true],
  ["例：写 r39 复验材料", true],
  ["例：写 r123 复验材料", true],
  ["例：写复验材料", false],
  ["报表中心 6 张 KPI 卡", false],
];
for (const [probe, expected] of ROUND_SELF_PROBES) {
  const detected = hits(probe).includes("rNN 轮次号");
  if (detected !== expected) {
    console.error(
      `USER-FACING-TEXT: self-probe FAILED ${JSON.stringify(probe)} got=${detected} want=${expected}`,
    );
    process.exit(1);
  }
}

const files = collectTsxFiles(SRC);
const violations: string[] = [];
let literalCount = 0;
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const lit of [...literals(source, file), ...jsxTextNodes(source, file)]) {
    literalCount++;
    if (isSeamMarker(lit)) continue;
    const terms = hits(lit.text);
    if (terms.length === 0) continue;
    const excerpt = lit.text.length > 100 ? `${lit.text.slice(0, 100)}...` : lit.text;
    violations.push(
      `${relative(ROOT, file).replace(/\\/g, "/")}:${lit.line}:${lit.col} [${terms.join(",")}] ${excerpt}`,
    );
  }
}

if (violations.length > 0) {
  console.error(`USER-FACING-TEXT: FOUND ${violations.length} internal-term string(s) in ${literalCount} literals / ${files.length} tsx files`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`USER-FACING-TEXT: ALL GREEN (${literalCount} literals / ${files.length} tsx files, 0 internal-term strings)`);
