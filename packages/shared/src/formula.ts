// 协流 XieFlow — r30 多维表格公式字段：纯本地表达式求值引擎
// 宪法/任务单硬约束：纯 TS tokenizer + parser + evaluator，
// 零 eval / 零 Function 构造器 / 零外部依赖；表达式只引用本表字段，读时计算不落库。
// api / web / db 均不得出现表达式解析分支——一切规则集中在本文件。

/** 公式求值结果（null = 空值；错误通过 cells.error 单独回带，不混入值） */
export type FormulaValue = number | string | boolean | null;

/** 表达式长度上限（与字段名/标题同一量级，防止钉死 UI 的超长输入） */
export const MAX_FORMULA_EXPRESSION_LENGTH = 500;

/** 语法错误（parse / compile 阶段抛；api 映射为 400） */
export class FormulaSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaSyntaxError";
  }
}

/** 运行时错误（求值阶段抛；由 recomputeFormulas 捕获为单元格 error 红标） */
export class FormulaRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaRuntimeError";
  }
}

// ---- AST（纯数据，可序列化；不含任何可执行代码） ----

export type FormulaNode =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "field"; name: string }
  | { kind: "unary"; op: "-" | "+"; operand: FormulaNode }
  | {
      kind: "binary";
      op: "+" | "-" | "*" | "/" | ">" | ">=" | "<" | "<=" | "==" | "!=";
      left: FormulaNode;
      right: FormulaNode;
    }
  | { kind: "call"; name: "IF" | "ROUND"; args: FormulaNode[] };

type Token =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "field"; value: string }
  | { kind: "ident"; value: string }
  | { kind: "op"; value: string }
  | { kind: "punct"; value: "(" | ")" | "," }
  | { kind: "eof" };

const COMPARISON_OPS = new Set([">", ">=", "<", "<=", "==", "!="]);
const ADDITIVE_OPS = new Set(["+", "-"]);
const MULTIPLICATIVE_OPS = new Set(["*", "/"]);

/** 词法分析：手写扫描，逐字符识别；无任何正则回调执行、无动态代码构造。 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < input.length && input[j]! >= "0" && input[j]! <= "9") j++;
      if (input[j] === ".") {
        j++;
        while (j < input.length && input[j]! >= "0" && input[j]! <= "9") j++;
      }
      const raw = input.slice(i, j);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new FormulaSyntaxError(`非法数字字面量：${raw}`);
      tokens.push({ kind: "number", value });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      let value = "";
      let closed = false;
      while (j < input.length) {
        const ch = input[j]!;
        if (ch === "\\") {
          const next = input[j + 1];
          if (next === undefined) throw new FormulaSyntaxError("字符串转义未闭合");
          value += next;
          j += 2;
          continue;
        }
        if (ch === quote) {
          closed = true;
          j++;
          break;
        }
        value += ch;
        j++;
      }
      if (!closed) throw new FormulaSyntaxError(`字符串字面量未闭合：${input.slice(i)}`);
      tokens.push({ kind: "string", value });
      i = j;
      continue;
    }
    if (c === "{") {
      const end = input.indexOf("}", i + 1);
      if (end === -1) throw new FormulaSyntaxError("字段引用缺少右花括号 }");
      const name = input.slice(i + 1, end).trim();
      if (name === "") throw new FormulaSyntaxError("字段引用不能为空：{}");
      tokens.push({ kind: "field", value: name });
      i = end + 1;
      continue;
    }
    if ((c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_") {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j]!)) j++;
      tokens.push({ kind: "ident", value: input.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "(" || c === ")") {
      tokens.push({ kind: "punct", value: c });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ kind: "punct", value: "," });
      i++;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (two === ">=" || two === "<=" || two === "==" || two === "!=") {
      tokens.push({ kind: "op", value: two });
      i += 2;
      continue;
    }
    if (c === "=") {
      tokens.push({ kind: "op", value: "==" });
      i++;
      continue;
    }
    if (ADDITIVE_OPS.has(c) || MULTIPLICATIVE_OPS.has(c) || c === ">" || c === "<") {
      tokens.push({ kind: "op", value: c });
      i++;
      continue;
    }
    if (c === "!") throw new FormulaSyntaxError("非法运算符：!（请用 !=）");
    throw new FormulaSyntaxError(`无法识别的字符：${c}`);
  }
  tokens.push({ kind: "eof" });
  return tokens;
}

/** 递归下降解析器：comparison → additive → multiplicative → unary → primary */
function parseTokens(tokens: Token[]): FormulaNode {
  let pos = 0;
  const peek = (): Token => tokens[pos] ?? { kind: "eof" };
  const next = (): Token => tokens[pos++] ?? { kind: "eof" };
  /** 只取 op 值，避免对 peek() 多次调用导致 TS 无法收窄 Token 联合 */
  const peekOp = (): string | null => {
    const t = peek();
    return t.kind === "op" ? t.value : null;
  };
  const peekPunct = (): string | null => {
    const t = peek();
    return t.kind === "punct" ? t.value : null;
  };
  const expectPunct = (value: "(" | ")" | ","): void => {
    const t = next();
    if (t.kind !== "punct" || t.value !== value) {
      throw new FormulaSyntaxError(`缺少 ${value}`);
    }
  };

  function parsePrimary(): FormulaNode {
    const t = next();
    if (t.kind === "number") return { kind: "number", value: t.value };
    if (t.kind === "string") return { kind: "string", value: t.value };
    if (t.kind === "field") return { kind: "field", name: t.value };
    if (t.kind === "ident") {
      const name = t.value;
      if (name === "TRUE") return { kind: "boolean", value: true };
      if (name === "FALSE") return { kind: "boolean", value: false };
      if (name !== "IF" && name !== "ROUND") {
        throw new FormulaSyntaxError(`未知函数或标识符：${name}`);
      }
      expectPunct("(");
      const args: FormulaNode[] = [];
      if (peekPunct() !== ")") {
        args.push(parseComparison());
        while (peekPunct() === ",") {
          next();
          args.push(parseComparison());
        }
      }
      expectPunct(")");
      const want = name === "IF" ? 3 : 2;
      if (args.length !== want) {
        throw new FormulaSyntaxError(`${name} 需要 ${want} 个参数，实际 ${args.length} 个`);
      }
      return { kind: "call", name, args };
    }
    if (t.kind === "punct" && t.value === "(") {
      const inner = parseComparison();
      expectPunct(")");
      return inner;
    }
    throw new FormulaSyntaxError(`表达式不完整（遇到 ${t.kind}）`);
  }

  function parseUnary(): FormulaNode {
    const t = peek();
    if (t.kind === "op" && (t.value === "-" || t.value === "+")) {
      next();
      return { kind: "unary", op: t.value as "-" | "+", operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parseMultiplicative(): FormulaNode {
    let left = parseUnary();
    while (peekOp() !== null && MULTIPLICATIVE_OPS.has(peekOp()!)) {
      const op = (next() as { kind: "op"; value: string }).value as "*" | "/";
      left = { kind: "binary", op, left, right: parseUnary() };
    }
    return left;
  }

  function parseAdditive(): FormulaNode {
    let left = parseMultiplicative();
    while (peekOp() !== null && ADDITIVE_OPS.has(peekOp()!)) {
      const op = (next() as { kind: "op"; value: string }).value as "+" | "-";
      left = { kind: "binary", op, left, right: parseMultiplicative() };
    }
    return left;
  }

  function parseComparison(): FormulaNode {
    let left = parseAdditive();
    while (peekOp() !== null && COMPARISON_OPS.has(peekOp()!)) {
      const op = (next() as { kind: "op"; value: string }).value as
        | ">"
        | ">="
        | "<"
        | "<="
        | "=="
        | "!=";
      left = { kind: "binary", op, left, right: parseAdditive() };
    }
    return left;
  }

  const ast = parseComparison();
  if (peek().kind !== "eof") {
    throw new FormulaSyntaxError(`表达式尾部有多余内容：${JSON.stringify(peek())}`);
  }
  return ast;
}

/** 解析表达式为 AST；语法错误抛 FormulaSyntaxError */
export function parseFormula(expression: string): FormulaNode {
  if (typeof expression !== "string" || expression.trim() === "") {
    throw new FormulaSyntaxError("表达式不能为空");
  }
  if (expression.length > MAX_FORMULA_EXPRESSION_LENGTH) {
    throw new FormulaSyntaxError(`表达式过长：最多 ${MAX_FORMULA_EXPRESSION_LENGTH} 字符`);
  }
  return parseTokens(tokenize(expression));
}

/** 遍历 AST 收集字段引用名（按首次出现顺序去重） */
export function collectFormulaReferences(ast: FormulaNode): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (node: FormulaNode): void => {
    if (node.kind === "field") {
      if (!seen.has(node.name)) {
        seen.add(node.name);
        out.push(node.name);
      }
      return;
    }
    if (node.kind === "unary") return walk(node.operand);
    if (node.kind === "binary") {
      walk(node.left);
      walk(node.right);
      return;
    }
    if (node.kind === "call") {
      for (const arg of node.args) walk(arg);
    }
  };
  walk(ast);
  return out;
}

/** 求值辅助：算术语境把空值当 0，数字字符串按数字处理，其余报错 */
function asNumber(value: FormulaValue, op: string): number {
  if (value === null) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new FormulaRuntimeError(`${op} 遇到非有限数值`);
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  throw new FormulaRuntimeError(`${op} 需要数值，实际为 ${JSON.stringify(value)}`);
}

function truthy(value: FormulaValue): boolean {
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && Number.isFinite(value);
  return value.length > 0;
}

/** 求值：record 是以「字段名 → 值」为键的上下文；引用不存在的字段视为空值 */
export function evaluateFormula(ast: FormulaNode, record: Record<string, unknown>): FormulaValue {
  switch (ast.kind) {
    case "number":
    case "string":
    case "boolean":
      return ast.value;
    case "field": {
      const raw = record[ast.name];
      if (raw === null || raw === undefined || raw === "") return null;
      if (typeof raw === "number" || typeof raw === "string" || typeof raw === "boolean") return raw;
      throw new FormulaRuntimeError(`字段「${ast.name}」的值类型不受公式支持`);
    }
    case "unary": {
      const v = asNumber(evaluateFormula(ast.operand, record), ast.op);
      return ast.op === "-" ? -v : v;
    }
    case "binary": {
      const left = evaluateFormula(ast.left, record);
      const right = evaluateFormula(ast.right, record);
      if (ast.op === "+") {
        if (typeof left === "string" || typeof right === "string") {
          return (left === null ? "" : String(left)) + (right === null ? "" : String(right));
        }
        return asNumber(left, "+") + asNumber(right, "+");
      }
      if (ast.op === "-" || ast.op === "*" || ast.op === "/") {
        const a = asNumber(left, ast.op);
        const b = asNumber(right, ast.op);
        if (ast.op === "/") {
          if (b === 0) throw new FormulaRuntimeError("除零错误：除数不能为 0");
          return a / b;
        }
        return ast.op === "-" ? a - b : a * b;
      }
      // 比较：两边都是数值（或数字字符串）时按数值比，否则按字符串比
      const bothNumeric =
        (left === null || typeof left === "number" || (typeof left === "string" && left.trim() !== "" && Number.isFinite(Number(left)))) &&
        (right === null || typeof right === "number" || (typeof right === "string" && right.trim() !== "" && Number.isFinite(Number(right))));
      const la: number | string = bothNumeric ? asNumber(left, ast.op) : left === null ? "" : String(left);
      const ra: number | string = bothNumeric ? asNumber(right, ast.op) : right === null ? "" : String(right);
      switch (ast.op) {
        case ">": return la > ra;
        case ">=": return la >= ra;
        case "<": return la < ra;
        case "<=": return la <= ra;
        case "==": return la === ra;
        case "!=": return la !== ra;
      }
      return false;
    }
    case "call": {
      if (ast.name === "IF") {
        const cond = evaluateFormula(ast.args[0]!, record);
        return truthy(cond)
          ? evaluateFormula(ast.args[1]!, record)
          : evaluateFormula(ast.args[2]!, record);
      }
      const x = asNumber(evaluateFormula(ast.args[0]!, record), "ROUND");
      const digits = asNumber(evaluateFormula(ast.args[1]!, record), "ROUND");
      if (!Number.isInteger(digits) || digits < 0 || digits > 10) {
        throw new FormulaRuntimeError("ROUND 的小数位数必须是 0~10 的整数");
      }
      const factor = 10 ** digits;
      const rounded = Math.round(x * factor) / factor;
      if (!Number.isFinite(rounded)) throw new FormulaRuntimeError("ROUND 结果非有限数值");
      return rounded;
    }
  }
}

// ---- 编译校验（结构化错误，api 只做 400 映射，不做解析分支） ----

export interface FormulaCompileError {
  code: "EMPTY_EXPRESSION" | "TOO_LONG" | "SYNTAX_ERROR" | "UNKNOWN_FIELD";
  message: string;
}

export interface FormulaCompileResult {
  ok: boolean;
  ast: FormulaNode | null;
  references: string[];
  error: FormulaCompileError | null;
}

/** 校验表达式：空/超长/语法错误/未知字段一律返回结构化错误（不抛） */
export function compileFormula(
  expression: string,
  fields: readonly { readonly name: string }[],
): FormulaCompileResult {
  if (typeof expression !== "string" || expression.trim() === "") {
    return {
      ok: false,
      ast: null,
      references: [],
      error: { code: "EMPTY_EXPRESSION", message: "公式表达式不能为空" },
    };
  }
  if (expression.length > MAX_FORMULA_EXPRESSION_LENGTH) {
    return {
      ok: false,
      ast: null,
      references: [],
      error: {
        code: "TOO_LONG",
        message: `公式表达式过长：最多 ${MAX_FORMULA_EXPRESSION_LENGTH} 字符`,
      },
    };
  }
  let ast: FormulaNode;
  try {
    ast = parseFormula(expression);
  } catch (err) {
    return {
      ok: false,
      ast: null,
      references: [],
      error: {
        code: "SYNTAX_ERROR",
        message: err instanceof Error ? err.message : "公式语法错误",
      },
    };
  }
  const known = new Set(fields.map((f) => f.name));
  const references = collectFormulaReferences(ast);
  for (const name of references) {
    if (!known.has(name)) {
      return {
        ok: false,
        ast,
        references,
        error: { code: "UNKNOWN_FIELD", message: `未知字段：${name}` },
      };
    }
  }
  return { ok: true, ast, references, error: null };
}

// ---- 批量重算与循环引用检测 ----

export interface FormulaFieldInput {
  id: number;
  name: string;
  /** 非公式字段可省略；带 expression 或 type=formula 视为公式列 */
  type?: string;
  expression?: string;
}

export interface FormulaRecordInput {
  id: number;
  data: Record<string, unknown>;
}

export interface FormulaCycle {
  /** 环上字段名（首尾不重复，如 [A, B] 表示 A→B→A） */
  fields: string[];
  message: string;
}

export interface FormulaCell {
  value: FormulaValue;
  error: string | null;
}

export interface FormulaComputation {
  /** recordId(字符串) → fieldId(字符串) → 单元格结果 */
  cells: Record<string, Record<string, FormulaCell>>;
  cycles: FormulaCycle[];
}

function isFormulaField(f: FormulaFieldInput): boolean {
  return f.type === "formula" || (typeof f.expression === "string" && f.expression.trim() !== "");
}

/** 循环引用检测：对公式字段间的「引用依赖图」做 DFS 三色标记 */
export function detectFormulaCycles(fields: readonly FormulaFieldInput[]): FormulaCycle[] {
  const formulaFields = fields.filter(isFormulaField);
  const byName = new Map(formulaFields.map((f) => [f.name, f]));
  const deps = new Map<string, string[]>();
  for (const f of formulaFields) {
    let refs: string[] = [];
    try {
      refs = collectFormulaReferences(parseFormula(f.expression ?? ""));
    } catch {
      refs = []; // 语法错误由 compileFormula 报，不在环检测里重复
    }
    deps.set(f.name, refs.filter((name) => byName.has(name)));
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(formulaFields.map((f) => [f.name, WHITE]));
  const stack: string[] = [];
  const cycles: FormulaCycle[] = [];
  const seen = new Set<string>();
  const visit = (name: string): void => {
    color.set(name, GRAY);
    stack.push(name);
    for (const dep of deps.get(name) ?? []) {
      const c = color.get(dep) ?? WHITE;
      if (c === WHITE) visit(dep);
      else if (c === GRAY) {
        const idx = stack.indexOf(dep);
        const cycleNames = idx === -1 ? [dep, name] : stack.slice(idx);
        const key = [...cycleNames].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push({
            fields: cycleNames,
            message: `循环引用：${[...cycleNames, cycleNames[0]].join(" → ")}`,
          });
        }
      }
    }
    stack.pop();
    color.set(name, BLACK);
  };
  for (const f of formulaFields) {
    if ((color.get(f.name) ?? WHITE) === WHITE) visit(f.name);
  }
  return cycles;
}

/** 依赖闭包：被循环引用污染的公式字段（含传递依赖）都不能出值 */
function taintedByCycles(
  fields: readonly FormulaFieldInput[],
  cycles: readonly FormulaCycle[],
): Map<string, string> {
  const tainted = new Map<string, string>();
  if (cycles.length === 0) return tainted;
  const cycleMessage = (name: string): string =>
    cycles.find((c) => c.fields.includes(name))?.message ?? "循环引用";
  for (const f of fields) if (isFormulaField(f) && cycleMessage(f.name)) {
    tainted.set(f.name, cycleMessage(f.name)!);
  }
  const byName = new Map(fields.filter(isFormulaField).map((f) => [f.name, f]));
  // 传播：任一依赖被污染 → 自身也被污染（最多迭代字段数轮，必然收敛）
  for (let pass = 0; pass < byName.size; pass++) {
    let changed = false;
    for (const f of byName.values()) {
      if (tainted.has(f.name)) continue;
      let refs: string[] = [];
      try {
        refs = collectFormulaReferences(parseFormula(f.expression ?? ""));
      } catch {
        continue;
      }
      const dep = refs.find((r) => tainted.has(r));
      if (dep) {
        tainted.set(f.name, `依赖的公式字段存在循环引用：${dep}`);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return tainted;
}

/** 拓扑序：公式字段只依赖已解析的公式字段；环上字段不再进入求值序列 */
function topologicalFormulaFields(fields: readonly FormulaFieldInput[]): FormulaFieldInput[] {
  const formulaFields = fields.filter(isFormulaField);
  const byName = new Map(formulaFields.map((f) => [f.name, f]));
  const out: FormulaFieldInput[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (f: FormulaFieldInput): void => {
    if (done.has(f.name) || visiting.has(f.name)) return;
    visiting.add(f.name);
    let refs: string[] = [];
    try {
      refs = collectFormulaReferences(parseFormula(f.expression ?? ""));
    } catch {
      refs = [];
    }
    for (const name of refs) {
      const dep = byName.get(name);
      if (dep) visit(dep);
    }
    visiting.delete(f.name);
    done.add(f.name);
    out.push(f);
  };
  for (const f of formulaFields) visit(f);
  return out;
}

/**
 * 批量重算：读时计算，绝不写回记录。
 * - 字段表 → 字段名上下文（公式列可引用另一公式列，按拓扑序求值）；
 * - 循环引用/语法错误 → 单元格 error（web 红标），值恒 null；
 * - 每条记录的 cells 以 fieldId 为键，api 直接挂到 GET 响应上。
 */
export function recomputeFormulas(
  fields: readonly FormulaFieldInput[],
  records: readonly FormulaRecordInput[],
): FormulaComputation {
  const cycles = detectFormulaCycles(fields);
  const tainted = taintedByCycles(fields, cycles);
  const ordered = topologicalFormulaFields(fields);
  const astByField = new Map<string, FormulaNode>();
  const syntaxErrorByField = new Map<string, string>();
  for (const f of ordered) {
    try {
      astByField.set(f.name, parseFormula(f.expression ?? ""));
    } catch (err) {
      syntaxErrorByField.set(f.name, err instanceof Error ? err.message : "公式语法错误");
    }
  }
  const cells: Record<string, Record<string, FormulaCell>> = {};
  for (const record of records) {
    const rid = String(record.id);
    const rowCells: Record<string, FormulaCell> = {};
    const context: Record<string, unknown> = {};
    for (const f of fields) {
      context[f.name] = record.data[String(f.id)] ?? null;
    }
    for (const f of ordered) {
      const fid = String(f.id);
      const cycleMsg = tainted.get(f.name);
      const syntaxMsg = syntaxErrorByField.get(f.name);
      if (cycleMsg !== undefined || syntaxMsg !== undefined) {
        rowCells[fid] = {
          value: null,
          error: cycleMsg ?? syntaxMsg ?? "公式不可计算",
        };
        context[f.name] = null;
        continue;
      }
      try {
        const value = evaluateFormula(astByField.get(f.name)!, context);
        rowCells[fid] = { value, error: null };
        context[f.name] = value;
      } catch (err) {
        rowCells[fid] = {
          value: null,
          error: err instanceof Error ? err.message : "公式求值失败",
        };
        context[f.name] = null;
      }
    }
    cells[rid] = rowCells;
  }
  return { cells, cycles };
}
