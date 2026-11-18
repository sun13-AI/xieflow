// 协流 XieFlow — r11 AI 工作台页：多轮对话流 + 上下文提示 + 12 工具分页 + 三类产物预览
// 全部数据走真实 api（conversations / messages / artifacts / artifacts/:id/content / tools）。
// 截图钉态：?page=chat&shot=chat-empty|chat-loading|chat-error|chat-tools|chat-artifact|chat-context|
//   chat-artifact-html|chat-artifact-table|chat-tools2；深链 ?convId= 可分享回放。
// r10 U2 修复：右侧产物卡按「第 N 轮产物 / 对应消息」与对话流同轮（不再错一轮）。
import { useCallback, useEffect, useState } from "react";
import type { Artifact, Conversation, Message, RagCitation, ToolCallRecord } from "@xieflow/shared";
import { ARTIFACT_GENERATOR_LABELS, TOOL_NAMES } from "@xieflow/shared";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

interface ToolMeta {
  readonly name: string;
  readonly description: string;
}

interface ChatQuery {
  convId: string;
  shot: string;
  toolsPage: string;
}

interface ChatData {
  conversations: Conversation[];
  messages: Message[];
  artifacts: Artifact[];
  tools: ToolMeta[];
  selectedId: number | null;
}

type ChatState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | ({ phase: "ready" } & ChatData);

type PreviewMode = "html-report" | "markdown-table" | "json-data";

const TOOLS_PER_PAGE = 6;
const PREVIEW_TABS: readonly { mode: PreviewMode; label: string }[] = [
  { mode: "html-report", label: "HTML" },
  { mode: "markdown-table", label: "表格" },
  { mode: "json-data", label: "JSON" },
];

function readQuery(): ChatQuery {
  const p = new URLSearchParams(window.location.search);
  return { convId: p.get("convId") ?? "", shot: p.get("shot") ?? "", toolsPage: p.get("toolsPage") ?? "1" };
}

function pickConversation(list: readonly Conversation[], convId: string): number | null {
  if (list.length === 0) return null;
  const wanted = Number(convId);
  if (convId !== "" && Number.isInteger(wanted) && list.some((c) => c.id === wanted)) return wanted;
  return list[0]!.id;
}

async function loadChat(query: ChatQuery): Promise<ChatData> {
  const [convRes, toolRes] = await Promise.all([
    apiFetch("/api/conversations"),
    apiFetch("/api/tools"),
  ]);
  const convData = (await fetchJsonOrThrow(convRes)) as { conversations: Conversation[] };
  const toolData = (await fetchJsonOrThrow(toolRes)) as { tools: ToolMeta[] };
  const selectedId = pickConversation(convData.conversations, query.convId);
  if (selectedId === null) {
    return { conversations: [], messages: [], artifacts: [], tools: toolData.tools, selectedId: null };
  }
  const [msgRes, artRes] = await Promise.all([
    apiFetch(`/api/conversations/${selectedId}/messages`),
    apiFetch(`/api/conversations/${selectedId}/artifacts`),
  ]);
  const msgData = (await fetchJsonOrThrow(msgRes)) as { messages: Message[] };
  const artData = (await fetchJsonOrThrow(artRes)) as { artifacts: Artifact[] };
  return {
    conversations: convData.conversations,
    messages: msgData.messages,
    artifacts: artData.artifacts,
    tools: toolData.tools,
    selectedId,
  };
}

async function postJson(method: "POST" | "DELETE", url: string, body?: unknown): Promise<unknown> {
  const res = await apiFetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return fetchJsonOrThrow(res);
}

/** 产物正文优先走 /content（按 type 返回 contentType + 原文）；坏 JSON 原样降级展示 */
function prettyJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

interface ArtifactContent {
  readonly contentType: string;
  readonly content: string;
}

/** r13：引用清单从真实产物/消息取（不伪造）；产物 JSON / assistant.content.citations 两条路径 */
function citationsOfMessage(m: Message): RagCitation[] {
  return (m.content as { citations?: RagCitation[] }).citations ?? [];
}
function citationsOfArtifact(content: string): RagCitation[] {
  try {
    const parsed = JSON.parse(content) as { citations?: RagCitation[] };
    return Array.isArray(parsed.citations) ? parsed.citations : [];
  } catch {
    return [];
  }
}

async function loadArtifactContent(id: number, type?: string): Promise<ArtifactContent> {
  const suffix = type === undefined ? "" : `?type=${encodeURIComponent(type)}`;
  const res = await apiFetch(`/api/artifacts/${id}/content${suffix}`);
  const data = (await fetchJsonOrThrow(res)) as ArtifactContent;
  return data;
}

export default function ChatPage() {
  const [query, setQuery] = useState<ChatQuery>(readQuery);
  const [state, setState] = useState<ChatState>(() => {
    const shot = readQuery().shot;
    if (shot === "chat-loading") return { phase: "loading" };
    if (shot === "chat-error") return { phase: "error", message: SERVICE_DOWN_MESSAGE };
    if (shot === "chat-empty") {
      // 空态钉住「无会话」，但工具目录是 shared 的真实清单（12 个），不伪造 0 个
      const pinnedTools: ToolMeta[] = TOOL_NAMES.map((name) => ({ name, description: "mock · 零 token" }));
      return { phase: "ready", conversations: [], messages: [], artifacts: [], tools: pinnedTools, selectedId: null };
    }
    return { phase: "loading" };
  });
  const [newTitle, setNewTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [previewOverride, setPreviewOverride] = useState<PreviewMode | null>(null);
  const [preview, setPreview] = useState<ArtifactContent | null>(null);
  const [toolsPage, setToolsPage] = useState(() => (readQuery().toolsPage === "2" ? 2 : 1));

  const refresh = useCallback(async () => {
    try {
      setState({ phase: "ready", ...(await loadChat(query)) });
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [query]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("narrow") === "1") document.documentElement.classList.add("force-narrow");
    if (["chat-loading", "chat-error", "chat-empty"].includes(p.get("shot") ?? "")) return;
    void refresh();
  }, [refresh]);

  // r10 U2-1 修复：产物卡与对话流同轮（第 N 轮产物 ← 第 N 轮消息），不再错一轮。
  // 在早退之前计算，保证 hooks 无条件执行（React 规则）。
  const readyState = state.phase === "ready" ? state : null;
  const roundCount = readyState !== null ? readyState.messages.filter((m) => m.role === "user").length : 0;
  const activeArtifactIndex = readyState === null ? -1 : roundCount > 0 ? Math.min(roundCount, readyState.artifacts.length) - 1 : -1;
  const activeArtifact = activeArtifactIndex >= 0 && readyState !== null ? readyState.artifacts[activeArtifactIndex]! : null;
  // 引用清单：产物自带优先；HTML/表格产物无 JSON 字段时回退到本轮 assistant 消息
  const activeCitations = activeArtifact !== null && citationsOfArtifact(activeArtifact.content).length > 0
    ? citationsOfArtifact(activeArtifact.content)
    : readyState !== null
      ? (() => {
          const asst = readyState.messages.filter((m) => m.role === "assistant");
          const mine = asst[activeArtifactIndex];
          return mine ? citationsOfMessage(mine) : [];
        })()
      : [];

  // 预览内容由真实 /content 端点提供（钉态用产物自带内容兜底，不伪造）
  useEffect(() => {
    const forced = ["chat-artifact-html", "chat-artifact-table", "chat-artifact"].includes(query.shot);
    if (activeArtifact === null || forced) return;
    let alive = true;
    loadArtifactContent(activeArtifact.id)
      .then((data) => { if (alive) setPreview(data); })
      .catch(() => { if (alive) setPreview(null); });
    return () => { alive = false; };
  }, [activeArtifact?.id, query.shot]);

  const createConversation = async () => {
    if (newTitle.trim() === "") {
      setNotice("请先填写会话标题");
      return;
    }
    setBusy(true);
    try {
      const created = (await postJson("POST", "/api/conversations", { title: newTitle.trim() })) as Conversation;
      setNewTitle("");
      setNotice(`已创建会话「${created.title}」`);
      const next = { ...query, convId: String(created.id) };
      setQuery(next);
      const url = new URL(window.location.href);
      url.searchParams.set("convId", String(created.id));
      window.history.replaceState(null, "", url.toString());
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (state.phase !== "ready" || state.selectedId === null || draft.trim() === "") return;
    const sent = draft.trim();
    setBusy(true);
    try {
      const res = (await postJson("POST", `/api/conversations/${state.selectedId}/chat`, {
        message: sent,
        context_window: 8,
      })) as {
        summary: string;
        toolCalls: ToolCallRecord[];
        contextWindow: number;
        contextMessages: number;
        resolution?: { referenceKind: string; referencedTitle: string };
        citations?: RagCitation[];
      };
      setDraft("");
      const refNote = res.resolution
        ? ` · 引用上一轮「${res.resolution.referencedTitle}」(${res.resolution.referenceKind})`
        : "";
      const citeNote = res.citations && res.citations.length > 0
        ? ` · 引用 ${res.citations.length} 条（可点卡片跳转原文）`
        : res.citations ? " · 知识库没有相关内容（未编造引用）" : "";
      setNotice(`已执行 ${res.toolCalls.length} 次工具调用并落库 · 上下文最近 ${res.contextMessages} 条${refNote}${citeNote}`);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setQuery(readQuery());
    void refresh();
  };

  if (state.phase === "loading") {
    return (
      <section className="card state-loading" data-state="chat-loading">
        <p>正在连接 AI 工作台…</p>
      </section>
    );
  }

  if (state.phase === "error") {
    return (
      <section className="card state-error" data-state="chat-error" role="alert">
        <h2>连接失败</h2>
        <p className="error-message">{state.message}</p>
        <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后点「重试」。</p>
        <button type="button" className="btn" onClick={retry}>重试</button>
      </section>
    );
  }

  const { conversations, messages, artifacts, tools, selectedId } = state;
  const toolDetail = query.shot === "chat-tools" || query.shot === "chat-tools2";
  const artifactExpanded = ["chat-artifact", "chat-artifact-html", "chat-artifact-table", "rag-artifact-citations"].includes(query.shot);
  const shownTools = tools.slice((toolsPage - 1) * TOOLS_PER_PAGE, toolsPage * TOOLS_PER_PAGE);
  const forcedPreview: PreviewMode | null =
    query.shot === "chat-artifact-html" ? "html-report"
      : query.shot === "chat-artifact-table" ? "markdown-table"
        : query.shot === "chat-artifact" ? "json-data" : null;
  const effectiveMode: PreviewMode = forcedPreview ?? previewOverride ?? (activeArtifact?.type === "html-report" || activeArtifact?.type === "markdown-table" ? activeArtifact.type : "json-data");

  // 预览内容由真实 /content 端点提供；钉态用产物自带 content 兜底（不伪造数据）
  let previewContent: ArtifactContent | null = preview;
  if (activeArtifact !== null && forcedPreview === null) {
    previewContent = preview !== null && preview.content === activeArtifact.content
      ? preview
      : { contentType: "application/json; charset=utf-8", content: activeArtifact.content };
  }

  const contextHint = query.shot === "chat-context" || messages.length > 0;

  return (
    <div className="chat-workbench" data-state="chat-workbench">
      <aside className="chat-sidebar" data-state="chat-sidebar">
        <h2>会话</h2>
        {conversations.length === 0 ? (
          <p className="empty" data-state="chat-empty-list">还没有会话——填标题创建第一个。</p>
        ) : (
          <ul className="chat-conv-list" data-state="chat-conv-list">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  data-conv-id={c.id}
                  className={`chat-conv ${c.id === selectedId ? "chat-conv-active" : ""}`}
                  onClick={() => {
                    const next = { ...query, convId: String(c.id) };
                    setQuery(next);
                    const url = new URL(window.location.href);
                    url.searchParams.set("convId", String(c.id));
                    window.history.replaceState(null, "", url.toString());
                  }}
                >
                  <span className="chat-conv-title">{c.title}</span>
                  <span className="chat-conv-id">#{c.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.shot === "chat-empty" && (
          <p className="chat-pin-note" data-state="chat-pin-note">空态钉态：0 会话 / 0 消息 / 0 产物</p>
        )}
        <div className="chat-new">
          <input
            aria-label="新会话标题"
            placeholder="新会话标题"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button type="button" className="btn" disabled={busy} onClick={createConversation}>＋ 新建会话</button>
        </div>
        <div className="chat-tools-block">
          <p className="chat-tool-count" data-state="chat-tool-count">可用工具 {tools.length} 个（mock · 零 token）</p>
          <ul className="chat-tool-list" data-state="chat-tool-list">
            {shownTools.map((t) => (
              <li key={t.name}><code>{t.name}</code><span>{t.description.slice(0, 24)}…</span></li>
            ))}
          </ul>
          <div className="chat-tools-pager" data-state="chat-tools-pager">
            <button type="button" className="btn btn-small" disabled={toolsPage === 1} onClick={() => setToolsPage(1)}>第 1 页</button>
            <button type="button" className="btn btn-small" disabled={toolsPage === 2} onClick={() => setToolsPage(2)}>第 2 页</button>
          </div>
        </div>
      </aside>

      <section className="chat-main" data-state="chat-stream">
        <header className="chat-main-head">
          <h2>对话流</h2>
          <span className="chat-provider">provider: mock-scripted-v1</span>
        </header>
        {contextHint && (
          <p className="chat-context-hint" data-state="chat-context-hint">
            上下文提示：最近 8 条真实落库消息注入规划（可跨轮指代「再建一个 / 把它改成」）
            {query.shot === "chat-context" && (
              <span className="context-pin-note" data-state="context-pin-note"> · 上下文钉态：2 轮对话 / 6 条落库消息 / repeat 指代已解析</span>
            )}
          </p>
        )}
        {notice !== "" && <p className="chat-notice" data-state="chat-notice">{notice}</p>}
        {messages.length === 0 ? (
          <p className="empty" data-state="chat-empty-stream">
            {selectedId === null ? "先创建一个会话，再发送消息。" : "这个会话还没有消息——发一句试试（如「盘点待办和文档」）。"}
          </p>
        ) : (
          <div className={`chat-bubbles${query.shot === "rag-citation-card" ? " chat-bubbles-rag" : ""}`} data-state="chat-bubbles">
            {messages.map((m) => {
              if (m.role === "tool") {
                return (
                  <div key={m.id} className={`bubble bubble-tool ${toolDetail ? "tool-detail-open" : ""}`} data-state="bubble-tool">
                    <div className="tool-head">
                      工具调用 × {m.toolCalls.length}
                      {toolDetail && <span className="tool-detail-flag">（展开回执）</span>}
                    </div>
                    {m.toolCalls.length === 0 ? (
                      <p className="muted">本条消息无工具回执</p>
                    ) : (
                      m.toolCalls.map((t) => (
                        <div key={t.id} className="tool-call" data-tool-name={t.name}>
                          <code className="tool-name">{t.name}</code>
                          <span className={`tool-ok ${t.ok ? "ok" : "fail"}`}>{t.ok ? "成功" : "失败"}</span>
                          <span className="tool-summary">{t.summary}</span>
                          {toolDetail && (
                            <pre className="tool-args" data-state="tool-args">
                              {JSON.stringify(t.arguments, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={m.id}
                  className={`bubble ${m.role === "user" ? "bubble-user" : "bubble-ai"}`}
                  data-state={m.role === "user" ? "bubble-user" : "bubble-ai"}
                >
                  <span className="bubble-role">{m.role === "user" ? "你" : "AI"}</span>
                  <span className="bubble-text">{m.content.text}</span>
                  {m.role === "assistant" && citationsOfMessage(m).length > 0 && (
                    <div className="rag-citations" data-state="rag-citations">
                      <p className="rag-cite-head">来源引用（{citationsOfMessage(m).length} 条 · 点击跳转知识库原文）</p>
                      {citationsOfMessage(m).map((c, i) => (
                        <a
                          key={`${c.docId}-${c.chunkId}`}
                          className={`rag-cite ${query.shot === "rag-citation-card" ? "rag-cite-spotlight" : ""}`}
                          data-state="rag-cite"
                          data-cite-doc={c.docId}
                          data-cite-chunk={c.chunkId}
                          href={`?page=knowledge&docId=${c.docId}&chunkId=${c.chunkId}`}
                        >
                          <span className="rag-cite-index">[{i + 1}]</span>
                          <span className="rag-cite-title">{c.docTitle} · chunk #{c.chunkId} · 第 {c.position + 1} 片</span>
                          <span className="rag-cite-snippet">{c.snippet}</span>
                          <span className="rag-cite-foot">相关度 {c.score.toFixed(4)}</span>
                          <span className="rag-cite-jump">查看原文 →</span>
                        </a>
                      ))}
                      {query.shot === "rag-citation-card" && (
                        <p className="rag-pin-note" data-state="rag-pin-note">引用卡钉态：来源、chunk 编号、片段与相关度均来自真实检索回执</p>
                      )}
                    </div>
                  )}
                  {m.role === "assistant" && citationsOfMessage(m).length === 0 && m.content.text.includes("知识库没有相关内容") && (
                    <p className="rag-nohit" data-state="rag-nohit">知识库没有相关内容 · 本回答未引用任何来源（不编造）</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="chat-composer" data-state="chat-composer">
          <textarea
            aria-label="消息内容"
            placeholder="输入消息，例如：再建一个 / 盘点待办和文档"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
          />
          <button type="button" className="btn btn-primary" disabled={busy || selectedId === null} onClick={send}>发送</button>
        </div>
      </section>

      <aside className={`chat-artifacts ${artifactExpanded ? "artifact-expanded" : ""}`} data-state="chat-artifacts">
        <h2>产物预览</h2>
        {activeArtifact === null ? (
          <p className="empty" data-state="chat-empty-artifact">还没有产物——对话后自动生成。</p>
        ) : (
          <>
            <p className="artifact-round" data-state="artifact-round">第 {activeArtifactIndex + 1} 轮产物 · 对应本轮对话</p>
            <p className="artifact-title" data-state="artifact-title">{activeArtifact.title}</p>
            <p className="artifact-meta">type: {activeArtifact.type} · #{activeArtifact.id}</p>
            <div className="artifact-tabs" data-state="artifact-tabs" role="tablist">
              {PREVIEW_TABS.map((tab) => (
                <button
                  key={tab.mode}
                  type="button"
                  role="tab"
                  aria-selected={effectiveMode === tab.mode}
                  className={`artifact-tab ${effectiveMode === tab.mode ? "artifact-tab-active" : ""}`}
                  data-preview-mode={tab.mode}
                  onClick={() => { setPreviewOverride(tab.mode); void loadArtifactContent(activeArtifact.id).then(setPreview).catch(() => setPreview(null)); }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <p className="artifact-preview-kind" data-state="artifact-preview-kind">预览：{ARTIFACT_GENERATOR_LABELS[effectiveMode]}</p>
            {effectiveMode === "html-report" ? (
              <iframe
                className="artifact-html-frame"
                title="HTML 产物预览"
                data-state="artifact-html-frame"
                sandbox=""
                srcDoc={previewContent?.content ?? activeArtifact.content}
              />
            ) : (
              <pre className="artifact-content" data-state="artifact-content">
                {effectiveMode === "json-data"
                  ? prettyJson(previewContent?.content ?? activeArtifact.content)
                  : (previewContent?.content ?? activeArtifact.content)}
              </pre>
            )}
            <div className="artifact-citations" data-state="artifact-citations">
              <p className="artifact-cite-head">产物引用清单（{activeCitations.length} 条）</p>
              {activeCitations.length === 0 ? (
                <p className="muted">本轮产物没有引用（非 RAG 对话或知识库无命中）。</p>
              ) : (
                <ol>
                  {activeCitations.map((c) => (
                    <li key={`${c.docId}-${c.chunkId}`}>
                      <a href={`?page=knowledge&docId=${c.docId}&chunkId=${c.chunkId}`}>
                        {c.docTitle} · chunk #{c.chunkId} · 相关度 {c.score.toFixed(4)}
                      </a>
                      <span>{c.snippet}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
