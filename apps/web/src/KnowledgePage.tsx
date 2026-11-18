// 协流 XieFlow — r12「知识库」tab：文档列表 + 入库（选源）+ TF-IDF 搜索 + 来源引用高亮
// 全部数据走真实 api（knowledge/docs、knowledge/ingest、knowledge/search、documents）。
// 截图钉态：?page=knowledge&shot=knowledge-empty|knowledge-loading|knowledge-error|
//   knowledge-ingest-dialog|knowledge-search|knowledge-source-highlight；?q= 为检索词深链。
// 检索算法不在本文件：api 调 agent.searchChunks（TF-IDF 纯本地），本页只渲染命中与来源引用。
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { KnowledgeDoc, KnowledgeSearchHit } from "@xieflow/shared";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

interface DocMeta {
  readonly id: number;
  readonly title: string;
}

interface KnowledgeQuery {
  readonly shot: string;
  readonly q: string;
  readonly docId: string;
  readonly chunkId: string;
}

interface Traceback {
  readonly docId: number;
  readonly chunkId: number;
  readonly title: string;
  readonly content: string;
}

interface KnowledgeData {
  readonly docs: KnowledgeDoc[];
  readonly documents: DocMeta[];
}

type KnowledgeState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | ({ phase: "ready" } & KnowledgeData);

type SourceType = "text" | "document";

function readQuery(): KnowledgeQuery {
  const p = new URLSearchParams(window.location.search);
  return { shot: p.get("shot") ?? "", q: p.get("q") ?? "", docId: p.get("docId") ?? "", chunkId: p.get("chunkId") ?? "" };
}

async function getJson<T>(url: string): Promise<T> {
  return (await fetchJsonOrThrow(await apiFetch(url))) as T;
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  return fetchJsonOrThrow(await apiFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function deleteJson(url: string): Promise<unknown> {
  return fetchJsonOrThrow(await apiFetch(url, { method: "DELETE" }));
}

/** 来源高亮：把命中内容按检索词逐字/逐词标 <mark>，中文逐字、英文数字成词。 */
function highlight(text: string, query: string): ReactNode[] {
  const terms = Array.from(new Set(
    (query.match(/[\u4e00-\u9fff]|[a-zA-Z0-9]+/g) ?? []).map((t) => t.toLowerCase()),
  )).filter((t) => t.length > 0);
  if (terms.length === 0) return [text];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    terms.includes(part.toLowerCase())
      ? <mark key={i} className="kb-mark">{part}</mark>
      : <span key={i}>{part}</span>,
  );
}

function sourceLabel(hit: KnowledgeSearchHit): string {
  const origin = hit.sourceType === "document" ? `文档 #${hit.sourceId ?? "—"}` : "纯文本";
  return `来源：${hit.docTitle} · chunk #${hit.chunkId} · 第 ${hit.position + 1} 片 · ${origin}`;
}

export default function KnowledgePage() {
  const [query] = useState<KnowledgeQuery>(readQuery);
  const [state, setState] = useState<KnowledgeState>(() => {
    const shot = query.shot;
    if (shot === "knowledge-loading") return { phase: "loading" };
    if (shot === "knowledge-error") return { phase: "error", message: SERVICE_DOWN_MESSAGE };
    if (shot === "knowledge-empty") return { phase: "ready", docs: [], documents: [] };
    return { phase: "loading" };
  });
  const [ingestOpen, setIngestOpen] = useState(query.shot === "knowledge-ingest-dialog");
  const [sourceType, setSourceType] = useState<SourceType>("text");
  const [newTitle, setNewTitle] = useState(query.shot === "knowledge-ingest-dialog" ? "r12 入库演示" : "");
  const [newContent, setNewContent] = useState(query.shot === "knowledge-ingest-dialog" ? "协流知识库支持纯文本入库，自动分块后做本地 TF-IDF 检索。" : "");
  const [newSourceId, setNewSourceId] = useState("");
  const [searchDraft, setSearchDraft] = useState(query.q);
  const [hits, setHits] = useState<KnowledgeSearchHit[] | null>(null);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<Traceback | null>(null);

  // r13：引用卡跳转后的溯源回看——真发 GET /api/knowledge/docs/:id?chunkId=，不伪造正文
  useEffect(() => {
    const docId = Number(query.docId);
    const chunkId = Number(query.chunkId);
    if (!Number.isInteger(docId) || docId <= 0 || !Number.isInteger(chunkId) || chunkId <= 0) return;
    let alive = true;
    getJson<{ doc: KnowledgeDoc; chunk: { id: number; content: string } }>(
      `/api/knowledge/docs/${docId}?chunkId=${chunkId}`,
    ).then((data) => {
      if (alive) setTrace({ docId, chunkId, title: data.doc.title, content: data.chunk.content });
    }).catch(() => { if (alive) setTrace(null); });
    return () => { alive = false; };
  }, [query.docId, query.chunkId, state.phase]);

  const refresh = useCallback(async () => {
    try {
      const [docData, srcData] = await Promise.all([
        getJson<{ docs: KnowledgeDoc[] }>("/api/knowledge/docs"),
        getJson<{ documents: DocMeta[] }>("/api/documents"),
      ]);
      setState({ phase: "ready", docs: docData.docs, documents: srcData.documents });
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("narrow") === "1") {
      document.documentElement.classList.add("force-narrow");
    }
    if (["knowledge-loading", "knowledge-error", "knowledge-empty"].includes(query.shot)) return;
    void refresh();
  }, [query.shot, refresh]);

  // q 深链 / 钉态：真发检索请求，命中来自 api（不是前端伪造）
  useEffect(() => {
    const q = query.shot === "knowledge-search" || query.shot === "knowledge-source-highlight"
      ? (query.q || "协流")
      : query.q;
    if (q.trim() === "") return;
    let alive = true;
    getJson<{ hits: KnowledgeSearchHit[] }>(`/api/knowledge/search?q=${encodeURIComponent(q)}&limit=10`)
      .then((data) => {
        if (!alive) return;
        setHits(data.hits);
        setSearchedQuery(q.trim());
        setSearchDraft(q);
      })
      .catch(() => { if (alive) setHits([]); });
    return () => { alive = false; };
  }, [query.q, query.shot, state.phase]);

  const ingest = async () => {
    if (newTitle.trim() === "") {
      setNotice("请先填写标题");
      return;
    }
    setBusy(true);
    try {
      const body = sourceType === "text"
        ? { title: newTitle.trim(), sourceType: "text", content: newContent }
        : { title: newTitle.trim(), sourceType: "document", sourceId: Number(newSourceId) };
      const created = (await postJson("/api/knowledge/ingest", body)) as {
        doc: KnowledgeDoc;
        chunks: { id: number }[];
      };
      setNotice(`入库成功：${created.doc.title}（${created.doc.chunkCount} 片）`);
      setIngestOpen(false);
      setNewTitle("");
      setNewContent("");
      setNewSourceId("");
      setHits(null);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    if (searchDraft.trim() === "") {
      setNotice("请输入检索词");
      return;
    }
    setBusy(true);
    try {
      const data = await getJson<{ hits: KnowledgeSearchHit[] }>(
        `/api/knowledge/search?q=${encodeURIComponent(searchDraft.trim())}&limit=10`,
      );
      setHits(data.hits);
      setSearchedQuery(searchDraft.trim());
      setNotice(`检索「${searchDraft.trim()}」命中 ${data.hits.length} 片`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const removeDoc = async (id: number) => {
    setBusy(true);
    try {
      await deleteJson(`/api/knowledge/docs/${id}`);
      setNotice(`已删除知识文档 #${id}`);
      setHits(null);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (state.phase === "loading") {
    return (
      <section className="card state-loading" data-state="knowledge-loading">
        <p>正在连接知识库…</p>
      </section>
    );
  }
  if (state.phase === "error") {
    return (
      <section className="card state-error" data-state="knowledge-error" role="alert">
        <h2>连接失败</h2>
        <p className="error-message">{state.message}</p>
        <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后点「重试」。</p>
        <button type="button" className="btn" onClick={() => void refresh()}>重试</button>
      </section>
    );
  }

  const spotlight = query.shot === "knowledge-source-highlight";
  return (
    <section className="kb-shell" data-state="knowledge-ready">
      <aside className="kb-side">
        <div className="kb-side-head">
          <h2>知识文档</h2>
          <button type="button" className="btn kb-ingest-btn" data-action="knowledge-ingest-open" onClick={() => setIngestOpen(true)}>＋ 入库</button>
        </div>
        {state.docs.length === 0 ? (
          <>
            <p className="empty" data-state="knowledge-empty-list">还没有知识文档——点「＋ 入库」导入第一段文本。</p>
            {query.shot === "knowledge-empty" && (
              <p className="kb-shot-note" data-state="knowledge-empty-pin">首次使用空态钉注：真实 0 篇知识文档 / 0 分块。</p>
            )}
          </>
        ) : (
          <ul className="kb-doc-list" data-state="knowledge-doc-list">
            {state.docs.map((doc) => (
              <li key={doc.id} className={`kb-doc-item${trace?.docId === doc.id ? " kb-doc-traced" : ""}`}>
                <div className="kb-doc-title">{doc.title}</div>
                <div className="kb-doc-meta">
                  <span className="kb-pill">{doc.sourceType === "document" ? `文档 #${doc.sourceId ?? "—"}` : "纯文本"}</span>
                  <span>{doc.chunkCount} 片</span>
                  <button type="button" className="kb-del" data-doc-id={doc.id} onClick={() => void removeDoc(doc.id)} disabled={busy}>删</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="kb-main">
        <div className="kb-searchbar">
          <input
            className="kb-search-input"
            data-state="knowledge-search-input"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            placeholder="输入检索词，例如：手机 / 分块"
            aria-label="知识库检索词"
          />
          <button type="button" className="btn" data-action="knowledge-search" onClick={() => void search()} disabled={busy}>检索</button>
        </div>
        {notice !== "" && <p className="kb-notice" data-state="knowledge-notice">{notice}</p>}
        {query.shot === "knowledge-ingest-dialog" && (
          <p className="kb-shot-note">入库对话框钉态：表单字段来自真实文档列表，提交走 POST /api/knowledge/ingest。</p>
        )}

        {trace !== null && (
          <div className="kb-trace" data-state="knowledge-traceback">
            <h3>溯源回看：{trace.title}</h3>
            <p className="kb-trace-meta">doc #{trace.docId} · chunk #{trace.chunkId} · 由对话引用卡跳转而来（真读 GET /api/knowledge/docs/:id?chunkId=）</p>
            <pre className="kb-trace-body">{trace.content}</pre>
          </div>
        )}
        {hits === null ? (
          <div className="kb-intro" data-state="knowledge-intro">
            <h3>本地知识检索（TF-IDF）</h3>
            <p>入库自动分块（200 字 / 40 字重叠），检索纯本地算法、零 token。命中可溯源到具体 chunk。</p>
          </div>
        ) : hits.length === 0 ? (
          <p className="empty" data-state="knowledge-search-empty">「{searchedQuery}」没有命中——换个词或先入库相关文档。</p>
        ) : (
          <ul className={`kb-hits${spotlight ? " kb-spotlight" : ""}`} data-state="knowledge-hits">
            {hits.map((hit) => (
              <li key={hit.chunkId} className="kb-hit">
                <div className="kb-hit-head">
                  <span className="kb-score">score {hit.score.toFixed(4)}</span>
                  <span className="kb-source" data-diff-kind="source">{sourceLabel(hit)}</span>
                </div>
                <p className="kb-hit-body" data-state="knowledge-highlight">{highlight(hit.content, searchedQuery)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {ingestOpen && (
        <div className="kb-modal-backdrop" data-state="knowledge-ingest-dialog">
          <div className="kb-modal" role="dialog" aria-label="知识库入库">
            <h3>知识文档入库</h3>
            <label className="kb-field">
              标题
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="给这批知识起个名字" />
            </label>
            <div className="kb-field">
              <span>来源</span>
              <div className="kb-source-switch" role="radiogroup" aria-label="入库来源">
                <button type="button" className={sourceType === "text" ? "kb-src-active" : ""} data-source="text" onClick={() => setSourceType("text")}>纯文本</button>
                <button type="button" className={sourceType === "document" ? "kb-src-active" : ""} data-source="document" onClick={() => setSourceType("document")}>已有文档</button>
              </div>
            </div>
            {sourceType === "text" ? (
              <label className="kb-field">
                内容（自动分块）
                <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={5} placeholder="粘贴要入库的正文…" />
              </label>
            ) : (
              <label className="kb-field">
                选择文档
                <select value={newSourceId} onChange={(e) => setNewSourceId(e.target.value)}>
                  <option value="">— 选一篇已有文档 —</option>
                  {state.documents.map((d) => <option key={d.id} value={d.id}>{d.title}（#{d.id}）</option>)}
                </select>
                <small>入库内容来自该文档的块正文（共享装配口径），source_id 回指原文档。</small>
              </label>
            )}
            <div className="kb-modal-actions">
              <button type="button" className="btn" onClick={() => setIngestOpen(false)}>取消</button>
              <button type="button" className="btn btn-primary" data-action="knowledge-ingest-submit" onClick={() => void ingest()} disabled={busy}>确认入库</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
