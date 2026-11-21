// 协流 XieFlow — shared/forms.ts：轻量表单收集唯一口径（r41 · 创建 / 填写 / 汇总）
// 全部算法/守卫集中本文件：normalizeFormDefinition（问题类型白名单/必填/选项）/
// validateFormAnswers（必填缺失/类型不符/未知题号）/ summarizeResponses（文本列举/
// 数值总和均值/选项分布/勾选率）。api / web 零算法分支，只装配与映射 4xx。
// 无新依赖、零 token；本文件为 @xieflow/shared/forms 子路径导出。
import { ValidationError } from "./index.js";

/** 问题类型白名单（与 schema CHECK 一致） */
export const FORM_QUESTION_TYPES = ["text", "number", "select", "checkbox"] as const;
export type FormQuestionType = (typeof FORM_QUESTION_TYPES)[number];

export const FORM_TYPE_LABELS: Readonly<Record<FormQuestionType, string>> = {
  text: "文本",
  number: "数字",
  select: "单选",
  checkbox: "勾选",
};

export const MAX_FORM_TITLE = 200;
export const MAX_FORM_DESCRIPTION = 1000;
export const MAX_FORM_QUESTIONS = 50;
export const MAX_QUESTION_LABEL = 200;
export const MAX_SELECT_OPTIONS = 20;
export const MAX_OPTION_LABEL = 100;

/** 答卷答案值：文本 / 数字 / 选项字符串 / 勾选布尔 */
export type FormAnswerValue = string | number | boolean;
/** 答卷答案字典：键为题目 id 的字符串形式 */
export type FormAnswers = Record<string, FormAnswerValue>;

export interface FormQuestionDraft {
  readonly type: FormQuestionType;
  readonly label: string;
  readonly required: boolean;
  readonly options: readonly string[];
  readonly position: number;
}

export interface FormDefinition {
  readonly title: string;
  readonly description: string | null;
  readonly questions: readonly FormQuestionDraft[];
}

export interface FormQuestion extends FormQuestionDraft {
  readonly id: number;
  readonly formId: number;
}

export interface Form {
  readonly id: number;
  readonly title: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly closedAt: string | null;
}

export interface FormWithQuestions extends Form {
  readonly questions: readonly FormQuestion[];
}

export interface FormResponse {
  readonly id: number;
  readonly formId: number;
  readonly answers: FormAnswers;
  readonly createdAt: string;
}

/** 汇总输入只需要答案字典（db 层把 answers_json 解析后传入） */
export interface FormResponseInput {
  readonly answers: FormAnswers;
}

interface QuestionSummaryBase {
  readonly questionId: number;
  readonly label: string;
  readonly type: FormQuestionType;
  /** 有效作答份数（跳过的题不计入） */
  readonly answered: number;
  /** 跳过份数 = 总答卷数 - answered */
  readonly skipped: number;
}

export interface FormTextSummary extends QuestionSummaryBase {
  readonly type: "text";
  /** 文本列举：按答卷顺序逐条列出（空串不列入） */
  readonly values: readonly string[];
}

export interface FormNumberSummary extends QuestionSummaryBase {
  readonly type: "number";
  readonly count: number;
  readonly sum: number;
  readonly avg: number;
  readonly min: number | null;
  readonly max: number | null;
}

export interface FormSelectBucket {
  readonly option: string;
  readonly count: number;
  /** 占比 = 选择该选项份数 / 总答卷数（含跳过者作分母），两位小数 */
  readonly rate: number;
}

export interface FormSelectSummary extends QuestionSummaryBase {
  readonly type: "select";
  /** 按选项定义顺序排列，未命中的选项也列出（count=0） */
  readonly distribution: readonly FormSelectBucket[];
}

export interface FormCheckboxSummary extends QuestionSummaryBase {
  readonly type: "checkbox";
  readonly checked: number;
  /** 勾选率 = 勾选份数 / 总答卷数（含跳过者作分母），两位小数 */
  readonly rate: number;
}

export type FormQuestionSummary =
  | FormTextSummary
  | FormNumberSummary
  | FormSelectSummary
  | FormCheckboxSummary;

export interface FormSummary {
  readonly total: number;
  readonly questions: readonly FormQuestionSummary[];
}

/** 已关闭表单再次提交 → 409 冲突（状态冲突，不是输入非法） */
export class FormClosedError extends Error {
  readonly formId: number;
  constructor(formId: number) {
    super(`表单已关闭，不能提交新答卷：${formId}`);
    this.name = "FormClosedError";
    this.formId = formId;
  }
}

export function isFormQuestionType(value: unknown): value is FormQuestionType {
  return typeof value === "string" && (FORM_QUESTION_TYPES as readonly string[]).includes(value);
}

export function assertValidFormTitle(title: unknown): asserts title is string {
  if (typeof title !== "string" || title.trim() === "") {
    throw new ValidationError("表单标题不能为空");
  }
  if (title.length > MAX_FORM_TITLE) {
    throw new ValidationError(`表单标题过长：最多 ${MAX_FORM_TITLE} 字（当前 ${title.length} 字）`);
  }
}

export function normalizeFormDescription(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new ValidationError("表单说明必须是文本");
  const trimmed = value.trim();
  if (trimmed.length > MAX_FORM_DESCRIPTION) {
    throw new ValidationError(`表单说明过长：最多 ${MAX_FORM_DESCRIPTION} 字`);
  }
  return trimmed === "" ? null : trimmed;
}

/** 选项归一：trim / 丢空 / 去重保序 / 上限与长度守卫；非单选题恒空数组 */
export function normalizeSelectOptions(value: unknown, type: FormQuestionType): string[] {
  if (type !== "select") return [];
  if (!Array.isArray(value)) throw new ValidationError("单选题必须提供选项列表");
  if (value.length > MAX_SELECT_OPTIONS) {
    throw new ValidationError(`单选题选项最多 ${MAX_SELECT_OPTIONS} 项`);
  }
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") throw new ValidationError("单选题选项必须是文本");
    const option = raw.trim();
    if (option === "") continue;
    if (option.length > MAX_OPTION_LABEL) {
      throw new ValidationError(`单选题选项过长：最多 ${MAX_OPTION_LABEL} 字`);
    }
    if (!out.includes(option)) out.push(option);
  }
  if (out.length === 0) throw new ValidationError("单选题至少需要一个非空选项");
  return out;
}

export function normalizeQuestionDraft(value: unknown, fallbackPosition: number): FormQuestionDraft {
  const raw = (value ?? {}) as Record<string, unknown>;
  if (!isFormQuestionType(raw.type)) throw new ValidationError(`不支持的问题类型：${String(raw.type)}`);
  if (typeof raw.label !== "string" || raw.label.trim() === "") {
    throw new ValidationError("问题标题不能为空");
  }
  if (raw.label.length > MAX_QUESTION_LABEL) {
    throw new ValidationError(`问题标题过长：最多 ${MAX_QUESTION_LABEL} 字`);
  }
  if (raw.required !== undefined && typeof raw.required !== "boolean") {
    throw new ValidationError("必填标记必须是布尔值");
  }
  const position = typeof raw.position === "number" && Number.isInteger(raw.position) && raw.position >= 0
    ? raw.position
    : fallbackPosition;
  return {
    type: raw.type,
    label: raw.label.trim(),
    required: raw.required === true,
    options: normalizeSelectOptions(raw.options, raw.type),
    position,
  };
}

/**
 * 表单定义归一：标题/说明/问题白名单全在此；问题按 position 排序后重排为 0..n-1，
 * 保证重复提交与读回逐字节稳定。零问题时允许创建（UI 再从空态加题）。
 */
export function normalizeFormDefinition(input: unknown): FormDefinition {
  const raw = (input ?? {}) as Record<string, unknown>;
  assertValidFormTitle(raw.title);
  const description = normalizeFormDescription(raw.description);
  if (raw.questions !== undefined && !Array.isArray(raw.questions)) {
    throw new ValidationError("问题列表必须是数组");
  }
  const questions = (Array.isArray(raw.questions) ? raw.questions : []) as unknown[];
  if (questions.length > MAX_FORM_QUESTIONS) {
    throw new ValidationError(`问题数量最多 ${MAX_FORM_QUESTIONS} 题`);
  }
  const drafts = questions.map((q, i) => normalizeQuestionDraft(q, i));
  drafts.sort((a, b) => a.position - b.position);
  return {
    title: raw.title.trim(),
    description,
    questions: drafts.map((q, i) => ({ ...q, position: i })),
  };
}

function answerKey(id: number): string {
  return String(id);
}

/**
 * 答卷校验：必填缺失 / 类型不符 / 未知题号一律 ValidationError（api 映射 400）。
 * 返回归一后的答案字典：文本 trim、数字字符串转数值、可选未答键不落库。
 */
export function validateFormAnswers(answers: unknown, questions: readonly FormQuestion[]): FormAnswers {
  if (answers === null || typeof answers !== "object" || Array.isArray(answers)) {
    throw new ValidationError("答卷必须是对象");
  }
  const raw = answers as Record<string, unknown>;
  const byId = new Map<number, FormQuestion>(questions.map((q) => [q.id, q]));
  for (const key of Object.keys(raw)) {
    const id = Number(key);
    if (!Number.isInteger(id) || !byId.has(id)) {
      throw new ValidationError(`未知题号：${key}`);
    }
  }
  const out: FormAnswers = {};
  for (const q of questions) {
    const key = answerKey(q.id);
    const present = Object.prototype.hasOwnProperty.call(raw, key);
    const value = raw[key];
    if (!present || value === null || value === "") {
      if (q.required) throw new ValidationError(`必填题未完成：${q.label}`);
      continue;
    }
    switch (q.type) {
      case "text": {
        if (typeof value !== "string") throw new ValidationError(`题型不符：${q.label} 应为文本`);
        const text = value.trim();
        if (text === "") {
          if (q.required) throw new ValidationError(`必填题未完成：${q.label}`);
          continue;
        }
        out[key] = text;
        break;
      }
      case "number": {
        const num = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
        if (!Number.isFinite(num)) throw new ValidationError(`题型不符：${q.label} 应为数字`);
        out[key] = num;
        break;
      }
      case "select": {
        if (typeof value !== "string" || !q.options.includes(value)) {
          throw new ValidationError(`题型不符：${q.label} 的选项不在候选列表中`);
        }
        out[key] = value;
        break;
      }
      case "checkbox": {
        if (typeof value !== "boolean") throw new ValidationError(`题型不符：${q.label} 应为勾选值`);
        out[key] = value;
        break;
      }
    }
  }
  return out;
}

function roundRate(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 汇总统计：每题按类型产出文本列举 / 数值总和均值 / 选项分布 / 勾选率。
 * 分母统一为总答卷数（含跳过者），跳过的题 answered 不计入；空答卷返回零值不除零。
 */
export function summarizeResponses(
  responses: readonly FormResponseInput[],
  questions: readonly FormQuestion[],
): FormSummary {
  const total = responses.length;
  const summaries: FormQuestionSummary[] = questions.map((q) => {
    const key = answerKey(q.id);
    const present = responses.filter((r) => Object.prototype.hasOwnProperty.call(r.answers, key));
    const base = {
      questionId: q.id,
      label: q.label,
      answered: present.length,
      skipped: total - present.length,
    };
    if (q.type === "text") {
      const values = present
        .map((r) => r.answers[key])
        .filter((v): v is string => typeof v === "string" && v !== "");
      return { ...base, type: "text" as const, values: [...values] };
    }
    if (q.type === "number") {
      const nums = present
        .map((r) => r.answers[key])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      const count = nums.length;
      const sum = nums.reduce((acc, n) => acc + n, 0);
      return {
        ...base,
        type: "number" as const,
        count,
        sum: roundRate(sum),
        avg: count === 0 ? 0 : roundRate(sum / count),
        min: count === 0 ? null : Math.min(...nums),
        max: count === 0 ? null : Math.max(...nums),
      };
    }
    if (q.type === "select") {
      const distribution = q.options.map((option) => {
        const count = present.filter((r) => r.answers[key] === option).length;
        return { option, count, rate: total === 0 ? 0 : roundRate(count / total) };
      });
      return { ...base, type: "select" as const, distribution };
    }
    const checked = present.filter((r) => r.answers[key] === true).length;
    return {
      ...base,
      type: "checkbox" as const,
      checked,
      rate: total === 0 ? 0 : roundRate(checked / total),
    };
  });
  return { total, questions: summaries };
}

/** 用户可见的形态文案汇总（web 只渲染，不重写算法） */
export function formSummaryLine(summary: FormSummary): string {
  return `共 ${summary.total} 份答卷 · ${summary.questions.length} 道题`;
}
