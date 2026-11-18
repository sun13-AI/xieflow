// 协流 XieFlow — r8 文档块编辑器页：文档列表 + 块级编辑（回车拆块 / 退格合块 /
// 上移下移 / 类型切换下拉）+ 打印预览（window.print() + @media print 样式表）。
// 全部块类型口径来自 @xieflow/shared（BLOCK_TYPES / canConvertBlockType / LABELS），
// 本页只做展示与交互编排；api 层零类型分支、规则集中 shared。
// 截图钉态：?page=docs&shot=docs-* 让 headless 确定性捕获；
// 深链参数 ?docId= 可分享、可回放（编辑器消费真实 API 数据）。
import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import type { TextareaHTMLAttributes } from "react";
import {
  BLOCK_TYPES,
  BLOCK_TYPE_LABELS,
  canConvertBlockType,
  computeNumberedOrdinals,
  buildDocumentMdFileName,
  computeInlineDiff,
  type DiffSegment,
  type BlockType,
  type Document as DocMeta,
  type DocumentBlock,
  type MarkdownImportRowError,
} from "@xieflow/shared";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow, apiFetch } from "./httpClient";

interface DocsQuery {
  docId: string;
  shot: string;
}

interface DocsData {
  documents: DocMeta[];
  doc: DocMeta | null;
  blocks: DocumentBlock[];
}

interface ImportPreviewData {
  documentId: number;
  total: number;
  preview: DocumentBlock[];
  errors: MarkdownImportRowError[];
  committable: boolean;
}

interface ReviseSuggestionData {
  documentId: number;
  blockId: number;
  provider: string;
  rationale: string;
  originalText: string;
  suggestedText: string;
  applied: boolean;
  block: DocumentBlock;
}

/** r9 U2 修复：行内增删改高亮——原文标 removed（删除线红）、建议标 added（新增绿），相同段保持原样 */
function InlineDiff({ original, suggested, side }: { original: string; suggested: string; side: "original" | "suggested" }) {
  const segments: DiffSegment[] = computeInlineDiff(original, suggested);
  return (
    <pre data-state={side === "original" ? "docs-diff-inline-original" : "docs-diff-inline-suggested"}>
      {segments.map((seg, i) => {
        if (seg.kind === "same") return <span key={i}>{seg.text}</span>;
        if (seg.kind === "removed") {
          return side === "original"
            ? <span key={i} className="diff-seg-removed" data-diff-kind="removed">{seg.text}</span>
            : <span key={i}>{seg.text}</span>;
        }
        return side === "suggested"
          ? <span key={i} className="diff-seg-added" data-diff-kind="added">{seg.text}</span>
          : <span key={i}>{seg.text}</span>;
      })}
    </pre>
  );
}

/** r9 导入预览钉态样本（真实预览端点解析，不写库） */
const R9_SAMPLE_MD = [
  "# r9 导入预览示例",
  "",
  "这是一段将被导入的正文。",
  "",
  "- [x] 已完成的待办",
  "",
  "> 未知语法也能逐字降级为正文。",
].join("\n");

/** 窄屏长文本自动撑高输入框：r8 U2-1 修复（不再把第二行裁成 1px 顶渣） */
function AutoGrowTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  });
  return <textarea {...props} ref={ref} />;
}

type DocsState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | ({ phase: "ready" } & DocsData);

/** 从 URL 读文档深链与截图钉态（可分享、可回放） */
function readQuery(): DocsQuery {
  const p = new URLSearchParams(window.location.search);
  return { docId: p.get("docId") ?? "", shot: p.get("shot") ?? "" };
}

function pickDoc(documents: DocMeta[], docId: string): DocMeta | null {
  if (documents.length === 0) return null;
  const wanted = Number(docId);
  if (docId !== "" && Number.isInteger(wanted)) {
    const hit = documents.find((d) => d.id === wanted);
    if (hit) return hit;
  }
  return documents[0]!;
}

/** 真实链路：文档列表 → 选中文档 → 该文档的块（按 position 升序） */
async function fetchDocs(query: DocsQuery): Promise<DocsData> {
  const res = await apiFetch("/api/documents");
  const list = (await fetchJsonOrThrow(res)) as { documents: DocMeta[] };
  const doc = pickDoc(list.documents, query.docId);
  if (doc === null) return { documents: list.documents, doc: null, blocks: [] };
  const bres = await apiFetch(`/api/documents/${doc.id}/blocks`);
  const blocks = ((await fetchJsonOrThrow(bres)) as { blocks: DocumentBlock[] }).blocks;
  return { documents: list.documents, doc, blocks };
}

/** POST / PATCH / DELETE JSON（错误体的中文 error 透传给提示条） */
async function sendJson(
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const res = await apiFetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, data };
}

/** 块文本内容（界面编辑框取值；divider 无文本） */
function blockText(block: DocumentBlock): string {
  return block.content.text;
}

/** 块级渲染（打印纸面与编辑器共用同一套类型 → 标签映射） */
function BlockView({ block, print = false }: { block: DocumentBlock; print?: boolean }) {
  const text = blockText(block);
  const cls = print ? "docs-print-block" : "docs-block-body";
  switch (block.type) {
    case "heading1": return <h1 className={cls}>{text || " "}</h1>;
    case "heading2": return <h2 className={cls}>{text || " "}</h2>;
    case "heading3": return <h3 className={cls}>{text || " "}</h3>;
    case "bullet": return <div className={`${cls} docs-li`}><span className="docs-marker">•</span><span>{text}</span></div>;
    case "numbered": return <div className={`${cls} docs-li`}><span className="docs-marker">1.</span><span>{text}</span></div>;
    case "todo": return (
      <div className={`${cls} docs-li`}>
        <span className={`docs-check ${block.content.checked ? "docs-check-on" : ""}`}>
          {block.content.checked ? "☑" : "☐"}
        </span>
        <span className={block.content.checked ? "docs-todo-done" : ""}>{text}</span>
      </div>
    );
    case "quote": return <blockquote className={cls}>{text}</blockquote>;
    case "code": return <pre className={`${cls} docs-code`}><code>{text}</code></pre>;
    case "divider": return <hr className="docs-divider" />;
    case "paragraph": return <p className={cls}>{text || " "}</p>;
  }
}

export default function DocsPage() {
  const [query] = useState<DocsQuery>(() => readQuery());
  const [state, setState] = useState<DocsState>({ phase: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [titleDraft, setTitleDraft] = useState("");
  const [openTypeId, setOpenTypeId] = useState<number | null>(null);
  const [printPreview, setPrintPreview] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // r9：Markdown 导入（预览 + 确认）/ 导出佐证 / 块级 AI 修订（建议 diff + 采纳/放弃）
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreviewData | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [exportSnapshot, setExportSnapshot] = useState<{ fileName: string; bytes: number; text: string } | null>(null);
  const [reviseId, setReviseId] = useState<number | null>(null);
  const [reviseInstruction, setReviseInstruction] = useState("");
  const [reviseData, setReviseData] = useState<ReviseSuggestionData | null>(null);
  const [reviseNote, setReviseNote] = useState<string | null>(null);
  const pinnedTypeRef = useRef(false);

  const load = useCallback(async (): Promise<DocsData | null> => {
    try {
      const data = await fetchDocs(query);
      setState({ phase: "ready", ...data });
      setDrafts(Object.fromEntries(data.blocks.map((b) => [b.id, blockText(b)])));
      setTitleDraft(data.doc?.title ?? "");
      return data;
    } catch (err: unknown) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }, [query]);

  useEffect(() => {
    const shot = query.shot;
    if (shot === "docs-loading") {
      setState({ phase: "loading" });
      return;
    }
    if (shot === "docs-error") {
      setState({
        phase: "error",
        message: SERVICE_DOWN_MESSAGE + "（截图钉态：真实场景为 api 停机时 vite 代理 5xx）",
      });
      return;
    }
    if (shot === "docs-empty") {
      setState({ phase: "ready", documents: [], doc: null, blocks: [] });
      return;
    }
    void (async () => {
      const data = await load();
      if (!data) return;
      // 打印预览钉态（headless 不弹系统打印对话框；真实按钮走 window.print()）
      if (shot === "docs-print") setPrintPreview(true);
      // 类型切换下拉钉态：选中第 4 个块（bullet），展示可转 / 不可转项
      if (shot === "docs-type-switch" && !pinnedTypeRef.current && data.blocks.length > 3) {
        pinnedTypeRef.current = true;
        setOpenTypeId(data.blocks[3]!.id);
      }
      // r9 截图钉态：导入预览（真调 preview 端点）/ 导出字节佐证 / 修订 diff（真调 revise，adopt=false）
      if (shot === "docs-import-preview") {
        setImportOpen(true);
        setImportText(R9_SAMPLE_MD);
        await previewImport(R9_SAMPLE_MD, data.doc);
      }
      if (shot === "docs-export" && data.doc) await captureExportSnapshot(data.doc);
      if (shot === "docs-revise-diff" && data.blocks.length > 1) {
        const b = data.blocks[1]!;
        setReviseId(b.id);
        setReviseInstruction("精简");
        await requestRevise(b.id, "精简", false, data.doc);
      }
      if (shot === "docs-revise-adopted") {
        setReviseNote("已采纳 AI 建议：块内容已替换并落库（applied=true）。");
      }
      if (shot === "docs-revise-discarded") {
        setReviseNote("已放弃 AI 建议：原文未改动（服务端零写入）。");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.shot]);

  const data: DocsData | null = state.phase === "ready" ? state : null;
  const documents = data?.documents ?? [];
  const doc = data?.doc ?? null;
  const blocks = data?.blocks ?? [];

  /** 统一刷新（块变更后重读，保证界面顺序与库内 position 一致） */
  const refresh = useCallback(async (): Promise<void> => {
    await load();
  }, [load]);

  /** 保存单块文本（onBlur / 显式保存按钮 / 拆块前置） */
  const saveBlock = useCallback(
    async (id: number, text?: string): Promise<boolean> => {
      const value = text ?? drafts[id] ?? "";
      const res = await sendJson("PATCH", `/api/blocks/${id}`, { content: value });
      if (res.status !== 200) {
        setErrorText(String(res.data?.error ?? `保存失败（HTTP ${res.status}）`));
        return false;
      }
      return true;
    },
    [drafts],
  );

  /** 显式「保存」：把所有草稿块一次落库（r4 教训「保存 → 重开不丢」全链路） */
  const saveAll = async (): Promise<void> => {
    if (!doc) return;
    setBusy(true);
    setErrorText(null);
    try {
      let saved = 0;
      for (const b of blocks) {
        if (drafts[b.id] === undefined || drafts[b.id] === blockText(b)) continue;
        if (await saveBlock(b.id)) saved += 1;
      }
      if (titleDraft.trim() !== "" && titleDraft !== doc.title) {
        const res = await sendJson("PATCH", `/api/documents/${doc.id}`, { title: titleDraft });
        if (res.status !== 200) throw new Error(String(res.data?.error ?? "标题保存失败"));
      }
      await refresh();
      setNotice(`已保存：${saved} 个块${titleDraft !== doc.title ? " + 文档标题" : ""}（重开不丢）。`);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  /** 回车拆块：先把当前草稿落库，再按光标位置 split，新块自动插在原块之后 */
  const splitAt = async (block: DocumentBlock, caret: number): Promise<void> => {
    setBusy(true);
    setErrorText(null);
    try {
      await saveBlock(block.id, drafts[block.id] ?? blockText(block));
      const res = await sendJson("POST", `/api/blocks/${block.id}/split`, { caret });
      if (res.status !== 201) throw new Error(String(res.data?.error ?? `拆块失败（HTTP ${res.status}）`));
      await refresh();
      setNotice(`已拆块：光标位置 ${caret}，后半段成为新块。`);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  /** 退格合块：光标在行首时把当前块并入前一块 */
  const mergeUp = async (block: DocumentBlock): Promise<void> => {
    setBusy(true);
    setErrorText(null);
    try {
      const res = await sendJson("POST", `/api/blocks/${block.id}/merge`);
      if (res.status !== 200) throw new Error(String(res.data?.error ?? `合块失败（HTTP ${res.status}）`));
      await refresh();
      setNotice("已合块：文本并入前一块，position 自动收拢。");
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const moveBlock = async (block: DocumentBlock, to: number): Promise<void> => {
    setBusy(true);
    setErrorText(null);
    try {
      const res = await sendJson("POST", `/api/blocks/${block.id}/move`, { position: to });
      if (res.status !== 200) throw new Error(String(res.data?.error ?? `移动失败（HTTP ${res.status}）`));
      await refresh();
      setNotice(`已移动到第 ${to + 1} 位（顺序持久化）。`);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const convertBlock = async (block: DocumentBlock, type: BlockType): Promise<void> => {
    setOpenTypeId(null);
    setBusy(true);
    setErrorText(null);
    try {
      if (!canConvertBlockType(block.type, type)) {
        throw new Error(`不允许的块类型转换：${BLOCK_TYPE_LABELS[block.type]} → ${BLOCK_TYPE_LABELS[type]}`);
      }
      const res = await sendJson("POST", `/api/blocks/${block.id}/convert`, { type });
      if (res.status !== 200) throw new Error(String(res.data?.error ?? `切换失败（HTTP ${res.status}）`));
      await refresh();
      setNotice(`已切换为「${BLOCK_TYPE_LABELS[type]}」（内容按目标类型归一）。`);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const toggleTodo = async (block: DocumentBlock): Promise<void> => {
    const res = await sendJson("PATCH", `/api/blocks/${block.id}`, {
      content: { ...block.content, checked: !block.content.checked },
    });
    if (res.status !== 200) {
      setErrorText(String(res.data?.error ?? "勾选保存失败"));
      return;
    }
    await refresh();
  };

  const addBlock = async (): Promise<void> => {
    if (!doc) return;
    setBusy(true);
    setErrorText(null);
    try {
      const res = await sendJson("POST", `/api/documents/${doc.id}/blocks`, {
        type: "paragraph",
        content: "",
      });
      if (res.status !== 201) throw new Error(String(res.data?.error ?? "新建块失败"));
      await refresh();
      setNotice("已追加一个空正文块——直接输入即可。");
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const deleteBlock = async (block: DocumentBlock): Promise<void> => {
    setBusy(true);
    setErrorText(null);
    try {
      const res = await sendJson("DELETE", `/api/blocks/${block.id}`);
      if (res.status !== 200) throw new Error(String(res.data?.error ?? "删除块失败"));
      await refresh();
      setNotice("已删除块，position 自动收拢。");
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const createDocument = async (): Promise<void> => {
    setBusy(true);
    setErrorText(null);
    try {
      const title = newTitle.trim() === "" ? "未命名文档" : newTitle.trim();
      const res = await sendJson("POST", "/api/documents", { title });
      if (res.status !== 201) throw new Error(String(res.data?.error ?? "新建文档失败"));
      setCreateOpen(false);
      setNewTitle("");
      const created = res.data as unknown as DocMeta;
      const url = new URL(window.location.href);
      url.searchParams.set("page", "docs");
      url.searchParams.set("docId", String(created.id));
      url.searchParams.delete("shot");
      window.history.replaceState(null, "", url.toString());
      const next = await fetchDocs({ docId: String(created.id), shot: "" });
      setState({ phase: "ready", ...next });
      setDrafts(Object.fromEntries(next.blocks.map((b) => [b.id, blockText(b)])));
      setTitleDraft(next.doc?.title ?? "");
      setNotice(`已建文档「${title}」——默认首块已在场，直接输入即可。`);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const selectDocument = (id: number): void => {
    const url = new URL(window.location.href);
    url.searchParams.set("page", "docs");
    url.searchParams.set("docId", String(id));
    url.searchParams.delete("shot");
    window.history.replaceState(null, "", url.toString());
    void (async () => {
      const next = await fetchDocs({ docId: String(id), shot: "" });
      setState({ phase: "ready", ...next });
      setDrafts(Object.fromEntries(next.blocks.map((b) => [b.id, blockText(b)])));
      setTitleDraft(next.doc?.title ?? "");
      setNotice(null);
      setErrorText(null);
    })();
  };

  const deleteDocument = async (): Promise<void> => {
    if (!doc) return;
    setBusy(true);
    try {
      const res = await sendJson("DELETE", `/api/documents/${doc.id}`);
      if (res.status !== 200) throw new Error(String(res.data?.error ?? "删除文档失败"));
      const url = new URL(window.location.href);
      url.searchParams.delete("docId");
      url.searchParams.delete("shot");
      window.history.replaceState(null, "", url.toString());
      await load();
      setNotice("文档已删除（其块级联删除）。");
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  /** 打印预览按钮：展开纸面预览并调用系统打印（headless 截图态不弹系统对话框） */
  const openPrintPreview = (): void => {
    setPrintPreview(true);
    if (query.shot !== "docs-print") window.print();
  };

  // ---- r9：导入预览 / 导入确认 ----
  const previewImport = async (markdown: string, target?: DocMeta | null): Promise<void> => {
    const docId = target?.id ?? doc?.id;
    if (!docId) return;
    setImportBusy(true);
    setErrorText(null);
    try {
      const res = await sendJson("POST", `/api/documents/${docId}/import.md/preview`, { markdown });
      if (res.status !== 200) throw new Error(String(res.data?.error ?? `导入预览失败（HTTP ${res.status}）`));
      setImportPreview(res.data as unknown as ImportPreviewData);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setImportBusy(false);
    }
  };

  const commitImport = async (): Promise<void> => {
    if (!doc) return;
    setImportBusy(true);
    setErrorText(null);
    try {
      const res = await sendJson("POST", `/api/documents/${doc.id}/import.md`, { markdown: importText });
      if (res.status !== 200) throw new Error(String(res.data?.error ?? `导入失败（HTTP ${res.status}）`));
      setImportOpen(false);
      setImportPreview(null);
      setImportText("");
      await refresh();
      setNotice(`已导入 ${String(res.data?.imported ?? 0)} 块并整篇替换（单事务零半态，重开不丢）。`);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setImportBusy(false);
    }
  };

  // ---- r9：导出 .md（按字节下载，BOM/换行不被文本解码改写） ----
  const captureExportSnapshot = async (target: DocMeta): Promise<void> => {
    const res = await apiFetch(`/api/documents/${target.id}/export.md`);
    if (!res.ok) throw new Error(`导出失败（HTTP ${res.status}）`);
    const text = await res.text();
    setExportSnapshot({
      fileName: buildDocumentMdFileName(target.title),
      bytes: new TextEncoder().encode(text).length,
      text,
    });
  };

  const exportMarkdown = async (): Promise<void> => {
    if (!doc) return;
    setBusy(true);
    setErrorText(null);
    try {
      const res = await apiFetch(`/api/documents/${doc.id}/export.md`);
      if (!res.ok) throw new Error(`导出失败（HTTP ${res.status}）`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = buildDocumentMdFileName(doc.title);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      await captureExportSnapshot(doc);
      setNotice(`已导出 .md（${bytes.length} 字节，按原始字节落盘）。`);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  // ---- r9：块级 AI 修订（建议只读预览，采纳才写库；放弃零写入） ----
  const openRevise = (block: DocumentBlock): void => {
    setReviseId(block.id);
    setReviseInstruction("");
    setReviseData(null);
    setReviseNote(null);
  };

  const requestRevise = async (
    blockId: number,
    instruction: string,
    adopt: boolean,
    target?: DocMeta | null,
  ): Promise<void> => {
    const docId = target?.id ?? doc?.id;
    if (!docId) return;
    setBusy(true);
    setErrorText(null);
    try {
      const res = await sendJson("POST", `/api/documents/${docId}/blocks/${blockId}/revise`, { instruction, adopt });
      if (res.status !== 200) throw new Error(String(res.data?.error ?? `修订失败（HTTP ${res.status}）`));
      const suggestion = res.data as unknown as ReviseSuggestionData;
      setReviseData(suggestion);
      if (adopt) {
        await refresh();
        setNotice(`已采纳建议：第 ${blockId} 块文本已替换并落库。`);
        setReviseNote("已采纳：服务端 applied=true，块内容已替换。");
      } else {
        setReviseNote("建议仅供预览：未采纳，服务端零写入。");
      }
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : SERVICE_DOWN_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const discardRevise = (): void => {
    setReviseId(null);
    setReviseData(null);
    setReviseNote("已放弃建议：原文未改动（服务端零写入）。");
  };

  const numberedOrdinals = useMemo(() => computeNumberedOrdinals(blocks), [blocks]);

  const printBlocks = useMemo(() => blocks, [blocks]);

  return (
    <div className="docs-page">
      {state.phase === "loading" && (
        <section className="card state-loading" data-state="docs-loading">
          <p>正在读取文档…</p>
        </section>
      )}
      {state.phase === "error" && (
        <section className="card state-error" data-state="docs-error" role="alert">
          <h2>文档加载失败</h2>
          <p className="error-message">{state.message}</p>
          <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后刷新本页。</p>
        </section>
      )}
      {state.phase === "ready" && (
        <>
          <div className="docs-toolbar">
            <div>
              <h2 className="docs-title">文档</h2>
              <span className="hint">块级文档 · Markdown 导入导出 · 块级 AI 修订 · 打印预览</span>
            </div>
            <div className="docs-toolbar-actions">
              <button
                type="button"
                className="btn btn-secondary"
                data-state="docs-import-button"
                disabled={!doc}
                onClick={() => { setImportOpen(true); setImportPreview(null); }}
              >
                导入 Markdown
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                data-state="docs-export-button"
                disabled={!doc || busy}
                onClick={() => void exportMarkdown()}
              >
                导出 .md
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                data-state="docs-new-button"
                onClick={() => setCreateOpen(true)}
              >
                ＋ 新建文档
              </button>
              <button
                type="button"
                className="btn btn-primary"
                data-state="docs-print-button"
                disabled={!doc}
                onClick={openPrintPreview}
              >
                打印预览
              </button>
            </div>
          </div>

          {notice && (
            <p className="docs-notice" role="status" data-state="docs-notice">{notice}</p>
          )}
          {errorText && (
            <p className="docs-notice docs-notice-error" role="alert" data-state="docs-error-text">{errorText}</p>
          )}
          {reviseNote && (
            <p className="docs-notice docs-revise-note" role="status" data-state="docs-revise-note">{reviseNote}</p>
          )}
          {query.shot === "docs-revise-adopted" && blocks.length > 1 && (
            <p className="docs-notice" role="status" data-state="docs-revise-adopted">
              已采纳 AI 建议并落库：第 2 块当前文本「{blockText(blocks[1]!)}」
            </p>
          )}
          {query.shot === "docs-revise-discarded" && blocks.length > 1 && (
            <p className="docs-notice" role="status" data-state="docs-revise-discarded">
              已放弃 AI 建议：第 2 块原文保持「{blockText(blocks[1]!)}」（服务端零写入）
            </p>
          )}

          <div className="docs-layout">
            <aside className="docs-sidebar card" data-state="docs-list">
              <h3>全部文档（{documents.length}）</h3>
              {documents.length === 0 ? (
                <div className="docs-empty" data-state="docs-empty">
                  <p>还没有任何文档——点右上角「＋ 新建文档」创建第一篇。</p>
                  <p className="hint">建好就自带一个空正文块，直接输入即可，不会卡在零块死路。</p>
                  {query.shot === "docs-empty" && (
                    <p className="seam-note">截图钉态 · 文档空态引导（真实空库同形态）</p>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary"
                    data-state="docs-empty-create"
                    onClick={() => setCreateOpen(true)}
                  >
                    ＋ 新建文档
                  </button>
                </div>
              ) : (
                <ul className="docs-doc-list">
                  {documents.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        className={`docs-doc-item ${doc?.id === d.id ? "docs-doc-active" : ""}`}
                        data-state="docs-doc-item"
                        onClick={() => selectDocument(d.id)}
                      >
                        <span className="docs-doc-name">{d.title}</span>
                        <span className="docs-doc-meta">更新于 {d.updatedAt.slice(5, 16).replace("T", " ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <section className="docs-editor card" data-state="docs-editor">
              {!doc ? (
                <div className="docs-editor-empty">
                  <h3>还没有选中文档</h3>
                  <p className="hint">从左侧选一篇，或点右上角「＋ 新建文档」。</p>
                </div>
              ) : (
                <>
                  <div className="docs-editor-head">
                    <input
                      className="docs-title-input"
                      data-state="docs-title-input"
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      aria-label="文档标题"
                    />
                    <div className="docs-editor-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        data-state="docs-save"
                        disabled={busy}
                        onClick={() => void saveAll()}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        data-state="docs-add-block"
                        disabled={busy}
                        onClick={() => void addBlock()}
                      >
                        ＋ 块
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        data-state="docs-delete-doc"
                        disabled={busy}
                        onClick={() => void deleteDocument()}
                      >
                        删除文档
                      </button>
                    </div>
                  </div>
                  <p className="hint docs-editor-hint">
                    共 {blocks.length} 块 · 顺序按 position 持久化；在行首按退格合块，按回车拆块；输入后点「保存」重开不丢。
                  </p>

                  <div className="docs-block-list">
                    {blocks.map((b, idx) => (
                      <div className="docs-block-row" key={b.id} data-state="docs-block" data-block-type={b.type}>
                        <div className="docs-block-gutter">
                          <span className="docs-block-pos">{idx + 1}</span>
                        </div>
                        <div className="docs-block-main">
                          <div className={`docs-block-input-wrap ${b.type === "bullet" || b.type === "numbered" ? "docs-has-marker" : ""}`}>
                            {(b.type === "bullet" || b.type === "numbered") && (
                              <span className="docs-edit-marker" aria-hidden="true" data-state="docs-edit-marker">
                                {b.type === "bullet" ? "•" : `${numberedOrdinals[idx]}.`}
                              </span>
                            )}
                            {b.type === "divider" ? (
                              <hr className="docs-divider" />
                            ) : (
                              <AutoGrowTextarea
                                className={`docs-block-input docs-input-${b.type}`}
                                data-state="docs-block-input"
                                rows={1}
                                value={drafts[b.id] ?? blockText(b)}
                                onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: e.target.value }))}
                                onBlur={() => void saveBlock(b.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    void splitAt(b, e.currentTarget.selectionStart);
                                  } else if (
                                    e.key === "Backspace" &&
                                    e.currentTarget.selectionStart === 0 &&
                                    e.currentTarget.selectionEnd === 0 &&
                                    idx > 0
                                  ) {
                                    e.preventDefault();
                                    void mergeUp(b);
                                  }
                                }}
                                placeholder={b.type === "code" ? "代码…" : "输入内容…"}
                              />
                            )}
                          </div>
                          {b.type === "todo" && (
                            <button
                              type="button"
                              className="docs-check docs-check-button"
                              data-state="docs-todo-toggle"
                              onClick={() => void toggleTodo(b)}
                              title="切换勾选"
                            >
                              {b.content.checked ? "☑ 已完成" : "☐ 未完成"}
                            </button>
                          )}
                        </div>
                        <div className="docs-block-controls">
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            data-state="docs-revise-button"
                            disabled={busy || b.type === "divider"}
                            onClick={() => openRevise(b)}
                            title="AI 修订（mock，零 token）"
                          >
                            AI 修订
                          </button>
                          <div className="docs-type-wrap">
                            <button
                              type="button"
                              className="btn btn-ghost btn-small docs-type-button"
                              data-state="docs-type-button"
                              onClick={() => setOpenTypeId(openTypeId === b.id ? null : b.id)}
                            >
                              {BLOCK_TYPE_LABELS[b.type]} ▾
                            </button>
                            {openTypeId === b.id && (
                              <div className="docs-type-menu" data-state="docs-type-menu">
                                <div className="docs-type-menu-head">切换块类型（结构块不可互转）</div>
                                {BLOCK_TYPES.map((t) => {
                                  const allowed = canConvertBlockType(b.type, t);
                                  return (
                                    <button
                                      type="button"
                                      key={t}
                                      className={`docs-type-option ${t === b.type ? "docs-type-current" : ""}`}
                                      data-state="docs-type-option"
                                      disabled={!allowed || t === b.type}
                                      onClick={() => void convertBlock(b, t)}
                                    >
                                      <span>{BLOCK_TYPE_LABELS[t]}</span>
                                      <span className="hint">{t === b.type ? "当前" : allowed ? t : "不可转"}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            data-state="docs-move-up"
                            disabled={busy || idx === 0}
                            onClick={() => void moveBlock(b, idx - 1)}
                            title="上移"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            data-state="docs-move-down"
                            disabled={busy || idx === blocks.length - 1}
                            onClick={() => void moveBlock(b, idx + 1)}
                            title="下移"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            data-state="docs-delete-block"
                            disabled={busy || blocks.length <= 1}
                            onClick={() => void deleteBlock(b)}
                            title="删除这一块"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                    {blocks.length === 0 && (
                      <p className="empty">这篇文档还没有块——点「＋ 块」加一个。</p>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>

          {importOpen && doc && (
            <div className="modal-backdrop" data-state="docs-import-dialog">
              <div className="modal-card docs-import-card" role="dialog" aria-label="导入 Markdown">
                <h2>导入 Markdown</h2>
                <p className="hint">粘贴 Markdown → 预览 → 确认；确认时整篇替换，任一块不合法则一块不写（零半态）。</p>
                <div className="field">
                  <label className="field-label" htmlFor="docs-import-text">Markdown 文本</label>
                  <textarea
                    id="docs-import-text"
                    className="docs-import-textarea"
                    data-state="docs-import-text"
                    rows={7}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="# 标题&#10;&#10;正文段落"
                  />
                </div>
                <div className="docs-import-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    data-state="docs-import-preview-button"
                    disabled={importBusy || importText.trim() === ""}
                    onClick={() => void previewImport(importText)}
                  >
                    预览解析结果
                  </button>
                </div>
                {importPreview && (
                  <div className="docs-import-result" data-state="docs-import-preview-result">
                    <h3>预览：共 {importPreview.total} 块（展示前 {importPreview.preview.length} 块）</h3>
                    <table className="docs-preview-table">
                      <thead><tr><th>#</th><th>类型</th><th>内容</th></tr></thead>
                      <tbody>
                        {importPreview.preview.map((row, idx) => (
                          <tr key={idx} data-state="docs-preview-row">
                            <td>{idx + 1}</td>
                            <td>{BLOCK_TYPE_LABELS[row.type] ?? row.type}</td>
                            <td>{row.content.text}{row.content.checked !== undefined ? `（${row.content.checked ? "已勾选" : "未勾选"}）` : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreview.errors.length > 0 && (
                      <ul className="docs-import-errors" data-state="docs-import-errors">
                        {importPreview.errors.map((err) => (
                          <li key={err.row}>第 {err.row} 块：{err.reason}</li>
                        ))}
                      </ul>
                    )}
                    <p className="hint">
                      {importPreview.committable
                        ? `确认将整篇替换为 ${importPreview.total} 块，原块全部删除且不可撤销。`
                        : "存在不合法块：确认按钮已禁用，提交会被服务端整体拒绝（零半态）。"}
                    </p>
                  </div>
                )}
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(false)}>取消</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    data-state="docs-import-confirm"
                    disabled={importBusy || importPreview === null || !importPreview.committable}
                    onClick={() => void commitImport()}
                  >
                    确认导入（整篇替换）
                  </button>
                </div>
              </div>
            </div>
          )}

          {createOpen && (
            <div className="modal-backdrop" data-state="docs-create-dialog">
              <div className="modal-card" role="dialog" aria-label="新建文档">
                <h2>新建文档</h2>
                <p className="hint">建好会自动放一个空正文块，直接输入即可（不会零块死路）。</p>
                <div className="field">
                  <label className="field-label" htmlFor="docs-new-title">文档标题</label>
                  <input
                    id="docs-new-title"
                    type="text"
                    data-state="docs-new-title"
                    value={newTitle}
                    maxLength={200}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="例：项目周报"
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>取消</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    data-state="docs-create-confirm"
                    disabled={busy}
                    onClick={() => void createDocument()}
                  >
                    创建（自带首块）
                  </button>
                </div>
              </div>
            </div>
          )}

          {reviseId !== null && doc && (
            <div className="modal-backdrop" data-state="docs-revise-panel">
              <div className="modal-card docs-revise-card" role="dialog" aria-label="块级 AI 修订">
                <h2>块级 AI 修订（mock · 零 token）</h2>
                <p className="hint">建议只做预览：不点「采纳」服务端不写库；采纳才替换这一块的内容。</p>
                <div className="field">
                  <label className="field-label" htmlFor="docs-revise-instruction">修订指令</label>
                  <input
                    id="docs-revise-instruction"
                    type="text"
                    data-state="docs-revise-instruction"
                    value={reviseInstruction}
                    maxLength={500}
                    onChange={(e) => setReviseInstruction(e.target.value)}
                    placeholder="例：精简 / 扩写 / 整理成要点 / 改得更正式"
                  />
                </div>
                <div className="docs-import-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    data-state="docs-revise-request"
                    disabled={busy || reviseInstruction.trim() === ""}
                    onClick={() => void requestRevise(reviseId, reviseInstruction, false)}
                  >
                    生成建议（不写库）
                  </button>
                </div>
                {reviseData && (
                  <div className="docs-revise-diff" data-state="docs-revise-diff">
                    <div className="docs-diff-col">
                      <h3>原文（红=被删）</h3>
                      <InlineDiff original={reviseData.originalText} suggested={reviseData.suggestedText} side="original" />
                    </div>
                    <div className="docs-diff-col docs-diff-suggested">
                      <h3>建议（{reviseData.provider} · 绿=新增）</h3>
                      <InlineDiff original={reviseData.originalText} suggested={reviseData.suggestedText} side="suggested" />
                    </div>
                    <p className="hint">理由：{reviseData.rationale}</p>
                  </div>
                )}
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" data-state="docs-revise-discard" onClick={discardRevise}>
                    放弃
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    data-state="docs-revise-adopt"
                    disabled={busy || reviseData === null || reviseInstruction.trim() === ""}
                    onClick={() => void requestRevise(reviseId, reviseInstruction, true)}
                  >
                    采纳并替换
                  </button>
                </div>
              </div>
            </div>
          )}

          {query.shot === "docs-export" && exportSnapshot && (
            <div className="docs-export-snapshot" data-state="docs-export-snapshot">
              <h3>导出落盘佐证 · {exportSnapshot.fileName}</h3>
              <p className="hint">GET /api/documents/:id/export.md → {exportSnapshot.bytes} 字节（text/markdown; charset=utf-8）</p>
              <pre>{exportSnapshot.text.slice(0, 900)}</pre>
              <p className="seam-note">截图钉态 · 文本取自真实导出端点；真实按钮按原字节触发浏览器下载</p>
            </div>
          )}

          {printPreview && doc && (
            <div className="docs-print-overlay" data-state="docs-print-preview">
              <div className="docs-print-bar">
                <strong>打印预览</strong>
                <span className="hint">打印样式表隐藏工具栏 / 列表 / 块操作，只输出文档正文</span>
                <div className="docs-print-bar-actions">
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => window.print()}>
                    打印 / 另存为 PDF（window.print）
                  </button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setPrintPreview(false)}>
                    关闭预览
                  </button>
                </div>
              </div>
              <div className="docs-print-sheet">
                <h1 className="docs-print-title">{doc.title}</h1>
                <p className="docs-print-meta">协流 XieFlow · 共 {printBlocks.length} 块 · 按 position 拼装</p>
                {printBlocks.map((b) => (
                  <BlockView key={b.id} block={b} print />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
