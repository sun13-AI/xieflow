// 协流 XieFlow — shared/docExport.ts：文档打印/Word 导出唯一引擎（r32 · 零依赖）
// 三件事全在本文件：① 块内容转义（sanitizeExportHtml）；② 语义化 HTML +
// 内嵌 @media print / @page 页码（blocksToPrintHtml）；③ Word 可打开的 HTML-in-doc
// （blocksToWordHtml，UTF-8 BOM + base64 自证）。api / web 零算法分支，只装配结果。
// 不引 pdf/docx 库、不引外部 CDN、零 token；本页面为 @xieflow/shared 根导出的一部分。
import { ValidationError, computeNumberedOrdinals, normalizeBlockContent, sanitizeFileNamePart } from "./index.js";

/** 打印版页眉文字（api/web/断言共用同一常量，避免三处文案漂移） */
export const EXPORT_HTML_HEADER_MARKER = "协流 XieFlow · 文档打印版";
/** Word 分页节名（Word 打开 .doc 时按此节套 A4 页面） */
export const EXPORT_WORD_SECTION_MARKER = "WordSection1";
/** 预览端点回带的 content-type（shared 唯一口径） */
export const EXPORT_PREVIEW_CONTENT_TYPE = "text/html; charset=utf-8";

/** 宽松块输入：真 DocumentBlock / 导入草稿都可；position / id 缺省时按输入顺序兜底 */
export interface ExportSourceBlock {
  readonly type: unknown;
  readonly content: unknown;
  readonly position?: number;
  readonly id?: number;
}

/** 打印版元信息（时间可注入，便于断言确定性） */
export interface ExportMeta {
  readonly generatedAt?: Date;
  readonly pageSize?: "A4" | "Letter";
}

/** 打印预览端点的 JSON 装配结果（api 直接 send，零算法） */
export interface PrintPreviewPayload {
  readonly title: string;
  readonly blockCount: number;
  readonly html: string;
  readonly generatedAt: string;
  readonly contentType: string;
}

/** 空文档：API 映射 422（不是 400——文档存在但无内容可导出） */
export class EmptyDocumentExportError extends Error {
  constructor() {
    super("导出失败：文档没有可导出的块（空文档）");
    this.name = "EmptyDocumentExportError";
  }
}

/** 非法块：API 映射 422（库内块类型/内容损坏，不能产出半态导出） */
export class InvalidExportBlockError extends Error {
  constructor(reason: string) {
    super(`导出失败：非法块内容（${reason}）`);
    this.name = "InvalidExportBlockError";
  }
}

/**
 * 块内容转义：块文本里的任何标记都不能穿透成可执行 HTML。
 * & < > " ' 五个字符逐一实体化，\n -> <br> 保留段落语义，非字符串一律空串。
 * 这是全部导出路径共用的唯一转义口径（变异红相目标：去掉 & 替换 → e2e/audit 变红）。
 */
export function sanitizeExportHtml(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r/g, "")
    .replace(/\n/g, "<br>");
}

/** UTF-8 → base64（纯 TS，无 Buffer / 无依赖，浏览器与 Node 同一结果） */
function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = i + 1 < bytes.length ? bytes[i + 1] ?? 0 : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] ?? 0 : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += alphabet[(n >>> 18) & 63] ?? "";
    out += alphabet[(n >>> 12) & 63] ?? "";
    out += i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] ?? "" : "=";
    out += i + 2 < bytes.length ? alphabet[n & 63] ?? "" : "=";
  }
  return out;
}

/** 与 Markdown/全文导出同一排序口径：先 position 后 id，缺省 position 用输入序兜底 */
function sortedExportBlocks(blocks: readonly ExportSourceBlock[]): { block: ExportSourceBlock; ordinal: number }[] {
  const indexed = blocks.map((block, idx) => ({ block, idx }));
  indexed.sort((a, b) => {
    const pa = a.block.position ?? a.idx;
    const pb = b.block.position ?? b.idx;
    if (pa !== pb) return pa - pb;
    const ia = a.block.id ?? a.idx;
    const ib = b.block.id ?? b.idx;
    return ia - ib;
  });
  const sorted = indexed.map((x) => x.block);
  const ordinals = computeNumberedOrdinals(sorted);
  return sorted.map((block, i) => ({ block, ordinal: ordinals[i] ?? 0 }));
}

/** 全路径共用守卫：空文档 / 非法块必须在产出任何 HTML 之前被拒绝（零半态） */
export function assertExportableBlocks(blocks: unknown): asserts blocks is readonly ExportSourceBlock[] {
  if (!Array.isArray(blocks) || blocks.length === 0) throw new EmptyDocumentExportError();
  for (const raw of blocks) {
    if (raw === null || typeof raw !== "object") throw new InvalidExportBlockError("块不是对象");
    const block = raw as ExportSourceBlock;
    if (typeof block.type !== "string") throw new InvalidExportBlockError("块类型不是字符串");
    try {
      normalizeBlockContent(block.type, block.content);
    } catch (err) {
      throw new InvalidExportBlockError(err instanceof Error ? err.message : String(err));
    }
  }
}

/** 单块 → 语义化 HTML 片段（无外部资源；列表序号用 li value 保真实编号） */
function renderExportBlockHtml(type: string, content: { text: string; checked?: boolean; language?: string }, ordinal: number): string {
  const safe = sanitizeExportHtml(content.text);
  const attr = `data-block-type="${type}"`;
  switch (type) {
    case "heading1": return `<h1 ${attr}>${safe}</h1>`;
    case "heading2": return `<h2 ${attr}>${safe}</h2>`;
    case "heading3": return `<h3 ${attr}>${safe}</h3>`;
    case "bullet": return `<ul ${attr}><li>${safe}</li></ul>`;
    case "numbered": return `<ol ${attr}><li value="${ordinal}">${safe}</li></ol>`;
    case "todo": return `<p ${attr} class="export-todo" data-checked="${content.checked === true}"><span class="export-check">${content.checked === true ? "☑" : "☐"}</span>${safe}</p>`;
    case "quote": return `<blockquote ${attr}>${safe}</blockquote>`;
    case "code": return `<pre ${attr} class="export-code ${sanitizeExportHtml(content.language ?? "")}"><code>${safe}</code></pre>`;
    case "divider": return `<hr ${attr}>`;
    default: return `<p ${attr}>${safe}</p>`;
  }
}

/** 打印样式（全部内嵌，零外链）：纸型 / 页边距 / 页码页眉 / 隐藏交互元素 */
const PRINT_STYLE = `
@page { size: A4; margin: 18mm 16mm; @bottom-center { content: "第 " counter(page) " / " counter(pages) " 页"; } }
body { font-family: "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; color: #1b1f2a; line-height: 1.65; }
.export-doc { max-width: 720px; margin: 0 auto; }
.export-doc-title { font-size: 26px; margin: 0 0 6px; }
.export-meta { color: #667085; font-size: 12px; margin: 0 0 18px; }
.export-block { margin: 8px 0; }
h1, h2, h3 { page-break-after: avoid; }
pre, blockquote { page-break-inside: avoid; }
pre { background: #f5f7fb; padding: 10px 12px; border-radius: 6px; white-space: pre-wrap; }
blockquote { border-left: 3px solid #98a6c4; padding-left: 12px; color: #475467; }
.export-footer { color: #98a2b3; font-size: 11px; text-align: center; margin-top: 24px; }
.export-footer::after { content: "第 " counter(page) " 页 / 共 " counter(pages) " 页"; }
@media print {
  body { background: #fff; }
  .export-screen-bar { display: none; }
  h1, h2, h3 { break-after: avoid-page; }
}
`;

/**
 * 块 → 可直接在浏览器打印/另存 PDF 的完整 HTML。
 * 语义化标签 + 内嵌 @media print + 页眉/页码页脚 + 全部块内容转义。
 */
export function blocksToPrintHtml(blocks: unknown, title: string, meta: ExportMeta = {}): string {
  assertExportableBlocks(blocks);
  if (typeof title !== "string" || title.trim() === "") throw new ValidationError("导出文档标题不能为空");
  const safeTitle = sanitizeExportHtml(title);
  const generatedAt = (meta.generatedAt ?? new Date()).toISOString();
  const pageSize = meta.pageSize ?? "A4";
  const body = sortedExportBlocks(blocks)
    .map(({ block, ordinal }) => renderExportBlockHtml(String(block.type), normalizeBlockContent(block.type, block.content), ordinal))
    .join("\n");
  return [
    "<!DOCTYPE html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${safeTitle}</title>`,
    `<style>${PRINT_STYLE}</style>`,
    "</head>",
    "<body>",
    `<header class="export-header">${EXPORT_HTML_HEADER_MARKER}</header>`,
    '<main class="export-doc">',
    `<h1 class="export-doc-title">${safeTitle}</h1>`,
    `<p class="export-meta">纸张 ${pageSize} · 共 ${blocks.length} 块 · 生成于 ${generatedAt}</p>`,
    body,
    "</main>",
    '<footer class="export-footer">协流 XieFlow 文档打印版 · 页码见页面下端</footer>',
    "</body></html>",
  ].join("\n");
}

/** Word 页面节样式：老式 Word 也能读懂的 mso 属性，页码用 PAGE/NUMPAGES 域码 */
const WORD_STYLE = `
@page WordSection1 { size: 21cm 29.7cm; margin: 2cm 1.8cm; mso-header-margin: 1cm; mso-footer-margin: 1cm; mso-page-numbers: 1; }
div.WordSection1 { page: WordSection1; }
body { font-family: "Microsoft YaHei", SimSun, serif; font-size: 11pt; line-height: 1.6; }
h1 { font-size: 20pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }
pre { background: #f5f7fb; padding: 8pt; white-space: pre-wrap; }
blockquote { border-left: 3pt solid #98a6c4; padding-left: 10pt; }
.export-footer { text-align: center; color: #667085; font-size: 9pt; }
`;

/**
 * 块 → Word 可直接打开的 HTML-in-doc（落盘为 .doc）。
 * UTF-8 BOM + meta charset 双保险；UTF-8 原文 base64 写在 data 属性里供外部解码核对；
 * PAGE / NUMPAGES 域码让 Word 打开后能更新真实页码。
 */
export function blocksToWordHtml(blocks: unknown, title: string, meta: ExportMeta = {}): string {
  assertExportableBlocks(blocks);
  if (typeof title !== "string" || title.trim() === "") throw new ValidationError("导出文档标题不能为空");
  const safeTitle = sanitizeExportHtml(title);
  const generatedAt = (meta.generatedAt ?? new Date()).toISOString();
  const body = sortedExportBlocks(blocks)
    .map(({ block, ordinal }) => renderExportBlockHtml(String(block.type), normalizeBlockContent(block.type, block.content), ordinal))
    .join("\n");
  return [
    "\uFEFF<html xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:w=\"urn:schemas-microsoft-com:office:word\" xmlns=\"http://www.w3.org/TR/REC-html40\">",
    "<head>",
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">',
    '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->',
    `<title>${safeTitle}</title>`,
    `<style>${WORD_STYLE}</style>`,
    "</head>",
    `<body data-utf8-base64="${utf8Base64(title)}">`,
    `<div class="${EXPORT_WORD_SECTION_MARKER}">`,
    `<h1>${safeTitle}</h1>`,
    `<p class="export-meta">协流 XieFlow · 共 ${blocks.length} 块 · 导出于 ${generatedAt}</p>`,
    body,
    `<p class="export-footer">第 <span style='mso-field-code:" PAGE "'></span> 页 / 共 <span style='mso-field-code:" NUMPAGES "'></span> 页</p>`,
    "</div></body></html>",
  ].join("\n");
}

/** 导出文件名唯一口径：保留中文、折叠特殊字符，跨平台安全 */
export function buildExportFileName(title: string, ext: "html" | "doc" | "md"): string {
  return `xieflow-${sanitizeFileNamePart(title)}.${ext}`;
}

/** 打印预览端点装配：api 直接 send 这个对象，零算法分支 */
export function buildPrintPreview(blocks: unknown, title: string, meta: ExportMeta = {}): PrintPreviewPayload {
  assertExportableBlocks(blocks);
  return {
    title,
    blockCount: blocks.length,
    html: blocksToPrintHtml(blocks, title, meta),
    generatedAt: (meta.generatedAt ?? new Date()).toISOString(),
    contentType: EXPORT_PREVIEW_CONTENT_TYPE,
  };
}
