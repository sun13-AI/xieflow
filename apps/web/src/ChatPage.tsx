// 协流 XieFlow — r10 AI 工作台页：会话列表 + 对话流（用户 / AI / tool-call 气泡）+ 产物预览
// 全部数据走真实 api（conversations / messages / artifacts / tools）；本页只做展示与交互编排。
// 截图钉态：?page=chat&shot=chat-empty|chat-loading|chat-error|chat-tools|chat-artifact；
// 深链 ?convId= 可分享、可回放（对话流消费真实落库消息，含 tool_calls_json）。
import { useCallback, useEffect, useState } from "react";
import type { Artifact, Conversation, Message, ToolCallRecord } from "@xieflow/shared";
import { TOOL_NAMES } from "@xieflow/shared";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow } from "./httpClient";

interface ToolMeta {
  readonly name: string;
  readonly description: string;
}

interface ChatQuery {
  convId: string;
  shot: string;
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

function readQuery(): ChatQuery {
  const p = new URLSearchParams(window.location.search);
  return { convId: p.get("convId") ?? "", shot: p.get("shot") ?? "" };
}

function pickConversation(list: readonly Conversation[], convId: string): number | null {
  if (list.length === 0) return null;
  const wanted = Number(convId);
  if (convId !== "" && Number.isInteger(wanted) && list.some((c) => c.id === wanted)) return wanted;
  return list[0]!.id;
}

async function loadChat(query: ChatQuery): Promise<ChatData> {
  const [convRes, toolRes] = await Promise.all([
    fetch("/api/conversations"),
    fetch("/api/tools"),
  ]);
  const convData = (await fetchJsonOrThrow(convRes)) as { conversations: Conversation[] };
  const toolData = (await fetchJsonOrThrow(toolRes)) as { tools: ToolMeta[] };
  const selectedId = pickConversation(convData.conversations, query.convId);
  if (selectedId === null) {
    return { conversations: [], messages: [], artifacts: [], tools: toolData.tools, selectedId: null };
  }
  const [msgRes, artRes] = await Promise.all([
    fetch(`/api/conversations/${selectedId}/messages`),
    fetch(`/api/conversations/${selectedId}/artifacts`),
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
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return fetchJsonOrThrow(res);
}

/** 产物内容是 JSON 字符串；预览面板做缩进美化，坏 JSON 原样降级展示（不吞内容） */
function prettyArtifact(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

export default function ChatPage() {
  const [query, setQuery] = useState<ChatQuery>(readQuery);
  const [state, setState] = useState<ChatState>(() => {
    const shot = readQuery().shot;
    if (shot === "chat-loading") return { phase: "loading" };
    if (shot === "chat-error") return { phase: "error", message: SERVICE_DOWN_MESSAGE };
    if (shot === "chat-empty") {
      // 空态钉住「无会话」，但工具目录是 shared 的真实清单（8 个），不伪造 0 个
      const pinnedTools: ToolMeta[] = TOOL_NAMES.map((name) => ({ name, description: "mock · 零 token" }));
      return { phase: "ready", conversations: [], messages: [], artifacts: [], tools: pinnedTools, selectedId: null };
    }
    return { phase: "loading" };
  });
  const [newTitle, setNewTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

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

  const selectConversation = (id: number) => {
    const next = { ...query, convId: String(id) };
    setQuery(next);
    const url = new URL(window.location.href);
    url.searchParams.set("convId", String(id));
    window.history.replaceState(null, "", url.toString());
  };

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
      selectConversation(created.id);
      setQuery((q) => ({ ...q, convId: String(created.id) }));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (state.phase !== "ready" || state.selectedId === null || draft.trim() === "") return;
    setBusy(true);
    try {
      const res = (await postJson("POST", `/api/conversations/${state.selectedId}/chat`, {
        message: draft.trim(),
      })) as { summary: string; toolCalls: ToolCallRecord[] };
      setDraft("");
      setNotice(`已执行 ${res.toolCalls.length} 次工具调用并落库`);
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
  const toolDetail = query.shot === "chat-tools";
  const artifactExpanded = query.shot === "chat-artifact";
  const activeArtifact = artifacts[artifacts.length - 1] ?? null;

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
                  onClick={() => selectConversation(c.id)}
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
        <p className="chat-tool-count" data-state="chat-tool-count">可用工具 {tools.length} 个（mock · 零 token）</p>
      </aside>

      <section className="chat-main" data-state="chat-stream">
        <header className="chat-main-head">
          <h2>对话流</h2>
          <span className="chat-provider">provider: mock-scripted-v1</span>
        </header>
        {notice !== "" && <p className="chat-notice" data-state="chat-notice">{notice}</p>}
        {messages.length === 0 ? (
          <p className="empty" data-state="chat-empty-stream">
            {selectedId === null ? "先创建一个会话，再发送消息。" : "这个会话还没有消息——发一句试试（如「盘点待办和文档」）。"}
          </p>
        ) : (
          <div className="chat-bubbles" data-state="chat-bubbles">
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
                </div>
              );
            })}
          </div>
        )}
        <div className="chat-composer" data-state="chat-composer">
          <textarea
            aria-label="消息内容"
            placeholder="输入消息，例如：盘点待办和文档"
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
            <p className="artifact-title" data-state="artifact-title">{activeArtifact.title}</p>
            <p className="artifact-meta">type: {activeArtifact.type} · #{activeArtifact.id}</p>
            <pre className="artifact-content" data-state="artifact-content">{prettyArtifact(activeArtifact.content)}</pre>
          </>
        )}
      </aside>
    </div>
  );
}
