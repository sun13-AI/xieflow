// XieFlow packages/agent/artifact-generators.ts — r11 产物生成器（M5 收官）
//
// 三类产物统一从「真实工具回执」生成，绝不返回占位数据：
//   html-report   —— 完整可打开的 HTML（含表格 + 执行摘要，无脚本）
//   markdown-table—— GFM 表格（表头 + 分隔行 + 逐条工具回执，单元格转义）
//   json-data     —— 缩进 JSON（intent / message / tools / summary，逐字节确定）
// 规则（类型清单 / 标签 / 守卫）全部在 packages/shared；本文件只负责内容装配。
import {
  ARTIFACT_GENERATOR_LABELS,
  assertValidGeneratedArtifactType,
  type ArtifactType,
  type GeneratedArtifactType,
  type ToolCallRecord,
} from "@xieflow/shared";

/** 产物生成输入：全部来自一次真实对话的执行结果（零随机、可回放） */
export interface ArtifactGenerationInput {
  readonly intent: string;
  readonly message: string;
  readonly toolCalls: readonly ToolCallRecord[];
  readonly summary: string;
}

export interface ArtifactDraft {
  readonly type: ArtifactType;
  readonly title: string;
  readonly content: string;
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function toolRows(toolCalls: readonly ToolCallRecord[]): string {
  if (toolCalls.length === 0) return "<tr><td colspan=\"4\">本次对话没有工具调用</td></tr>";
  return toolCalls
    .map(
      (t) =>
        `<tr><td>${htmlEscape(t.id)}</td><td>${htmlEscape(t.name)}</td><td>${t.ok ? "成功" : "失败"}</td><td>${htmlEscape(t.summary)}</td></tr>`,
    )
    .join("\n");
}

/** HTML 报告：完整文档（doctype / lang / charset / 表格 / 摘要），可直接用浏览器打开预览 */
export function generateHtmlReport(input: ArtifactGenerationInput): ArtifactDraft {
  const rows = toolRows(input.toolCalls);
  const content = [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${htmlEscape(ARTIFACT_GENERATOR_LABELS["html-report"])} · ${htmlEscape(input.intent)}</title>`,
    "<style>body{font-family:system-ui,sans-serif;margin:24px;color:#1e293b}table{border-collapse:collapse;width:100%}th,td{border:1px solid #e2e8f0;padding:6px 10px;text-align:left}th{background:#f1f5f9}pre{white-space:pre-wrap;background:#f8fafc;padding:10px;border-radius:8px}</style>",
    "</head>",
    "<body>",
    `<h1>${htmlEscape(ARTIFACT_GENERATOR_LABELS["html-report"])}</h1>`,
    `<p>意图：<code>${htmlEscape(input.intent)}</code> · 工具调用 ${input.toolCalls.length} 次</p>`,
    "<table><thead><tr><th>编号</th><th>工具</th><th>状态</th><th>执行摘要</th></tr></thead><tbody>",
    rows,
    "</tbody></table>",
    `<h2>汇总</h2><pre>${htmlEscape(input.summary)}</pre>`,
    "</body>",
    "</html>",
  ].join("\n");
  return { type: "html-report", title: `${ARTIFACT_GENERATOR_LABELS["html-report"]} · ${input.intent}`, content };
}

/** Markdown 表格：GFM 表头 + 分隔行 + 逐条回执，竖线/换行转义，可直接渲染 */
export function generateMarkdownTable(input: ArtifactGenerationInput): ArtifactDraft {
  const lines = [
    `# ${ARTIFACT_GENERATOR_LABELS["markdown-table"]} · ${input.intent}`,
    "",
    `用户消息：${markdownCell(input.message)}`,
    "",
    "| 编号 | 工具 | 状态 | 摘要 | 参数 |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const t of input.toolCalls) {
    lines.push(
      `| ${markdownCell(t.id)} | ${markdownCell(t.name)} | ${t.ok ? "成功" : "失败"} | ${markdownCell(t.summary)} | ${markdownCell(JSON.stringify(t.arguments))} |`,
    );
  }
  if (input.toolCalls.length === 0) lines.push("| — | — | — | 本次对话没有工具调用 | {} |");
  lines.push("", "## 汇总", "", markdownCell(input.summary));
  return { type: "markdown-table", title: `${ARTIFACT_GENERATOR_LABELS["markdown-table"]} · ${input.intent}`, content: lines.join("\n") };
}

/** JSON 数据：与 r10 chat-result 同构，但专供数据消费场景（缩进稳定、可逐字节比对） */
export function generateJsonData(input: ArtifactGenerationInput): ArtifactDraft {
  const payload = {
    intent: input.intent,
    message: input.message,
    tools: input.toolCalls.map((t) => ({
      id: t.id,
      name: t.name,
      arguments: t.arguments,
      ok: t.ok,
      summary: t.summary,
      ...(t.error === undefined ? {} : { error: t.error }),
    })),
    summary: input.summary,
  };
  return {
    type: "json-data",
    title: `${ARTIFACT_GENERATOR_LABELS["json-data"]} · ${input.intent}`,
    content: JSON.stringify(payload, null, 2),
  };
}

/** 统一入口：chat 编排按 artifactType 选生成器；非法类型由 shared 守卫抛 ValidationError */
export function buildArtifactFromToolResults(type: GeneratedArtifactType, input: ArtifactGenerationInput): ArtifactDraft {
  assertValidGeneratedArtifactType(type);
  if (type === "html-report") return generateHtmlReport(input);
  if (type === "markdown-table") return generateMarkdownTable(input);
  return generateJsonData(input);
}
