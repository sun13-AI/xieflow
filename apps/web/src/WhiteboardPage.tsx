// 协流 XieFlow — r15「白板」tab：无限画布（拖拽平移/缩放）+ 便签 CRUD + mock AI 建板 + Markdown 导出
// 数据全走真实 api（whiteboards / items CRUD / items/move / ai-create / export.md）。
// 布局归一 / 重叠避让 / 坐标换算 / 导出装配口径全在 shared，本页零算法分支。
// 截图钉态：?page=whiteboard&shot=whiteboard-empty|whiteboard-loading|whiteboard-error|whiteboard-notes|whiteboard-dragged|whiteboard-ai|whiteboard-export
// ?boardId= 深链选中真实白板；?narrow=1 显式钉窄屏。
import { useCallback, useEffect, useRef, useState } from "react";
import type { Whiteboard, WhiteboardItem, WhiteboardViewport } from "@xieflow/shared";
import {
  screenToCanvasPoint,
  canvasToScreenPoint,
  clampWhiteboardScale,
  WHITEBOARD_ITEM_TYPES,
} from "@xieflow/shared";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow } from "./httpClient";

interface WhiteboardQuery {
  readonly shot: string;
  readonly boardId: string;
}

type BoardState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | ({ phase: "ready" } & { boards: Whiteboard[] });

const PINNED = new Set(["whiteboard-loading", "whiteboard-error", "whiteboard-empty"]);
const INITIAL_VIEWPORT: WhiteboardViewport = { x: 40, y: 40, scale: 1 };

function readQuery(): WhiteboardQuery {
  const p = new URLSearchParams(window.location.search);
  return { shot: p.get("shot") ?? "", boardId: p.get("boardId") ?? "" };
}

async function getJson<T>(url: string): Promise<T> {
  return (await fetchJsonOrThrow(await fetch(url))) as T;
}

async function sendJson(url: string, method: "POST" | "PATCH" | "PUT", body: unknown): Promise<unknown> {
  return fetchJsonOrThrow(await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function deleteJson(url: string): Promise<unknown> {
  return fetchJsonOrThrow(await fetch(url, { method: "DELETE" }));
}

interface DragState {
  readonly kind: "pan" | "note";
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startCanvasX: number;
  readonly startCanvasY: number;
  readonly startViewX: number;
  readonly startViewY: number;
  readonly itemId: number;
  readonly itemX: number;
  readonly itemY: number;
  moved: boolean;
}

export default function WhiteboardPage() {
  const [query] = useState<WhiteboardQuery>(readQuery);
  const [state, setState] = useState<BoardState>(() => {
    const shot = query.shot;
    if (shot === "whiteboard-loading") return { phase: "loading" };
    if (shot === "whiteboard-error") return { phase: "error", message: SERVICE_DOWN_MESSAGE };
    if (shot === "whiteboard-empty") return { phase: "ready", boards: [] };
    return { phase: "loading" };
  });
  const [selectedId, setSelectedId] = useState<number>(() => Number(query.boardId) || 0);
  const [items, setItems] = useState<WhiteboardItem[]>([]);
  const [viewport, setViewport] = useState<WhiteboardViewport>(INITIAL_VIEWPORT);
  const [titleDraft, setTitleDraft] = useState("");
  const [themeDraft, setThemeDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getJson<{ whiteboards: Whiteboard[] }>("/api/whiteboards");
      setState({ phase: "ready", boards: data.whiteboards });
      return data.whiteboards;
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }, []);

  const loadItems = useCallback(async (id: number) => {
    if (id <= 0) {
      setItems([]);
      return;
    }
    try {
      const data = await getJson<{ items: WhiteboardItem[] }>(`/api/whiteboards/${id}/items`);
      setItems(data.items);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("narrow") === "1") {
      document.documentElement.classList.add("force-narrow");
    }
    if (PINNED.has(query.shot)) return;
    void refresh().then((boards) => {
      if (!selectedId && boards.length > 0) setSelectedId(boards[0]!.id);
    });
    // selectedId 只作为初始深链一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.shot, refresh]);

  useEffect(() => {
    if (state.phase !== "ready") return;
    void loadItems(selectedId);
  }, [selectedId, state.phase, loadItems]);

  const createBoard = async () => {
    if (titleDraft.trim() === "") {
      setNotice("请先填写白板标题");
      return;
    }
    setBusy(true);
    try {
      const created = (await sendJson("/api/whiteboards", "POST", { title: titleDraft.trim() })) as Whiteboard;
      setCreating(false);
      setTitleDraft("");
      setSelectedId(created.id);
      setNotice(`已建白板 #${created.id}——点「＋ 新建便签」开始布局`);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const removeBoard = async (id: number) => {
    setBusy(true);
    try {
      await deleteJson(`/api/whiteboards/${id}`);
      if (selectedId === id) setSelectedId(0);
      setNotice(`已删除白板 #${id}（条目级联删除）`);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (selectedId <= 0) {
      setNotice("请先选择一张白板");
      return;
    }
    setBusy(true);
    try {
      const created = (await sendJson(`/api/whiteboards/${selectedId}/items`, "POST", {
        type: "note",
        x: Math.round(80 + (items.length % 3) * 220),
        y: Math.round(80 + Math.floor(items.length / 3) * 180),
        content: "新便签——点「编辑」写内容",
      })) as WhiteboardItem;
      setItems((prev) => [...prev, created]);
      setNotice(`已建便签 #${created.id}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async (id: number) => {
    setBusy(true);
    try {
      const saved = (await sendJson(`/api/whiteboards/${selectedId}/items/${id}`, "PATCH", { content: editContent })) as WhiteboardItem;
      setItems((prev) => prev.map((it) => (it.id === id ? saved : it)));
      setEditingId(null);
      setNotice(`便签 #${id} 已保存`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const removeNote = async (id: number) => {
    setBusy(true);
    try {
      await deleteJson(`/api/whiteboards/${selectedId}/items/${id}`);
      setItems((prev) => prev.filter((it) => it.id !== id));
      setNotice(`已删除便签 #${id}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const aiCreate = async () => {
    if (selectedId <= 0) {
      setNotice("请先选择一张白板");
      return;
    }
    if (themeDraft.trim() === "") {
      setNotice("请先填写建板主题");
      return;
    }
    setBusy(true);
    try {
      const data = (await sendJson(`/api/whiteboards/${selectedId}/ai-create`, "POST", { theme: themeDraft.trim() })) as {
        items: WhiteboardItem[];
        count: number;
      };
      setItems((prev) => [...prev, ...data.items]);
      setNotice(`AI 建板完成：按「${themeDraft.trim()}」生成 ${data.count} 张便签（mock 零 token）`);
      setThemeDraft("");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const doExport = async (silentDownload: boolean) => {
    if (selectedId <= 0) {
      setNotice("请先选择一张白板");
      return;
    }
    try {
      const res = await fetch(`/api/whiteboards/${selectedId}/export.md`);
      if (!res.ok) throw new Error(`导出失败：HTTP ${res.status}`);
      const md = await res.text();
      setNotice(`已导出 Markdown（${md.length} 字符）`);
      if (!silentDownload) {
        const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `whiteboard-${selectedId}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  // 截图钉态：export 态加载后自动读真实导出内容并显示提示（不触发下载，避免 headless 挂死）
  useEffect(() => {
    if (query.shot === "whiteboard-export" && selectedId > 0 && items.length > 0 && notice === "") {
      void doExport(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.shot, selectedId, items.length]);

  const zoom = (factor: number) => {
    setViewport((prev) => {
      const scale = clampWhiteboardScale(prev.scale * factor);
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return { ...prev, scale };
      const center = screenToCanvasPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, rect.left, rect.top, prev);
      const shifted = canvasToScreenPoint(center.x, center.y, rect.left, rect.top, { ...prev, scale });
      return {
        x: prev.x + (rect.left + rect.width / 2 - shifted.x),
        y: prev.y + (rect.top + rect.height / 2 - shifted.y),
        scale,
      };
    });
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoom(e.deltaY < 0 ? 1.1 : 0.9);
  };

  const beginPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // 便签及其按钮自行处理指针：否则 viewport 的 setPointerCapture 会吞掉按钮 click
    if ((e.target as HTMLElement).closest(".wb-note")) return;
    dragRef.current = {
      kind: "pan", startClientX: e.clientX, startClientY: e.clientY,
      startCanvasX: 0, startCanvasY: 0, startViewX: viewport.x, startViewY: viewport.y,
      itemId: 0, itemX: 0, itemY: 0, moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const beginNoteDrag = (e: React.PointerEvent<HTMLElement>, item: WhiteboardItem) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = screenToCanvasPoint(e.clientX, e.clientY, rect.left, rect.top, viewport);
    dragRef.current = {
      kind: "note", startClientX: e.clientX, startClientY: e.clientY,
      startCanvasX: start.x, startCanvasY: start.y, startViewX: viewport.x, startViewY: viewport.y,
      itemId: item.id, itemX: item.x, itemY: item.y, moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (Math.abs(e.clientX - drag.startClientX) + Math.abs(e.clientY - drag.startClientY) > 2) drag.moved = true;
    if (drag.kind === "pan") {
      setViewport((prev) => ({ ...prev, x: drag.startViewX + (e.clientX - drag.startClientX), y: drag.startViewY + (e.clientY - drag.startClientY) }));
      return;
    }
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cur = screenToCanvasPoint(e.clientX, e.clientY, rect.left, rect.top, viewport);
    const nx = Math.round(drag.itemX + (cur.x - drag.startCanvasX));
    const ny = Math.round(drag.itemY + (cur.y - drag.startCanvasY));
    setItems((prev) => prev.map((it) => (it.id === drag.itemId ? { ...it, x: nx, y: ny } : it)));
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.kind !== "note" || !drag.moved) return;
    const moved = items.find((it) => it.id === drag.itemId);
    if (!moved) return;
    void sendJson(`/api/whiteboards/${selectedId}/items/move`, "POST", {
      moves: [{ id: moved.id, x: moved.x, y: moved.y }],
    }).then((data) => {
      const result = (data as { items: WhiteboardItem[] }).items;
      setItems((prev) => prev.map((it) => result.find((r) => r.id === it.id) ?? it));
      setNotice(`便签 #${moved.id} 已移动到 (${moved.x}, ${moved.y})`);
    }).catch((err: unknown) => {
      setNotice(err instanceof Error ? err.message : String(err));
    });
  };

  if (state.phase === "loading") {
    return (
      <section className="card state-loading" data-state="whiteboard-loading">
        <p>正在连接白板库…</p>
      </section>
    );
  }
  if (state.phase === "error") {
    return (
      <section className="card state-error" data-state="whiteboard-error" role="alert">
        <h2>连接失败</h2>
        <p className="error-message">{state.message}</p>
        <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后点「重试」。</p>
        <button type="button" className="btn" onClick={() => void refresh()}>重试</button>
      </section>
    );
  }

  const selected = state.boards.find((b) => b.id === selectedId);
  const pinNoteMap: Record<string, string> = {
    "whiteboard-empty": "首次使用空态钉注：真实 0 张白板——点「＋ 新建」即可开始布局。",
    "whiteboard-notes": "画布钉注：便签由 GET /api/whiteboards/:id/items 真读回，坐标即画布坐标。",
    "whiteboard-dragged": "拖拽钉注：真发 POST /items/move 落库，重叠条目由 shared collisionResolve 自动避让。",
    "whiteboard-ai": "AI 建板钉注：按主题脚本化生成 7 张便签（mock 零 token），布局互不重叠。",
    "whiteboard-export": "导出钉注：GET /:id/export.md 由 shared buildWhiteboardMarkdown 真装配。",
  };
  const pinNote = pinNoteMap[query.shot] ?? "";

  return (
    <section className="wb-shell" data-state="whiteboard-ready">
      <aside className="wb-side">
        <div className="wb-side-head">
          <h2>我的白板</h2>
          <button type="button" className="btn" data-action="wb-create-open" onClick={() => setCreating(true)}>＋ 新建</button>
        </div>
        {creating && (
          <div className="wb-new">
            <input aria-label="白板标题" placeholder="白板标题" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
            <button type="button" className="btn" data-action="wb-create" onClick={() => void createBoard()} disabled={busy}>确认</button>
          </div>
        )}
        {state.boards.length === 0 ? (
          <p className="empty" data-state="whiteboard-empty-list">还没有白板——点「＋ 新建」开始画第一张便签。</p>
        ) : (
          <ul className="wb-list" data-state="whiteboard-list">
            {state.boards.map((b) => (
              <li key={b.id} className={`wb-list-item${b.id === selectedId ? " wb-list-active" : ""}`}>
                <button type="button" className="wb-list-btn" data-board-id={b.id} onClick={() => setSelectedId(b.id)}>
                  <span className="wb-list-title">{b.title}</span>
                  <span className="wb-list-meta">#{b.id} · {items.length} 个条目</span>
                </button>
                <button type="button" className="wb-del" data-board-id={b.id} onClick={() => void removeBoard(b.id)} disabled={busy}>删</button>
              </li>
            ))}
          </ul>
        )}
        {pinNote !== "" && <p className="wb-shot-note" data-state="whiteboard-pin">{pinNote}</p>}
      </aside>
      <div className="wb-main">
        <div className="wb-toolbar">
          <span className="wb-board-title">{selected ? `${selected.title} · #${selected.id}` : "未选择白板"}</span>
          <button type="button" className="btn" data-action="wb-add-note" onClick={() => void addNote()} disabled={busy || selectedId <= 0}>＋ 新建便签</button>
          <input aria-label="AI 建板主题" className="wb-theme" placeholder="建板主题（如：季度复盘）" value={themeDraft} onChange={(e) => setThemeDraft(e.target.value)} />
          <button type="button" className="btn btn-primary" data-action="wb-ai-create" onClick={() => void aiCreate()} disabled={busy || selectedId <= 0}>✦ AI 建板</button>
          <button type="button" className="btn" data-action="wb-export" onClick={() => void doExport(false)} disabled={busy || selectedId <= 0}>导出 Markdown</button>
          <span className="wb-zoom" data-state="wb-zoom">{Math.round(viewport.scale * 100)}%</span>
          <button type="button" className="btn" data-action="wb-zoom-in" onClick={() => zoom(1.1)}>＋</button>
          <button type="button" className="btn" data-action="wb-zoom-out" onClick={() => zoom(0.9)}>－</button>
          <button type="button" className="btn" data-action="wb-zoom-reset" onClick={() => setViewport(INITIAL_VIEWPORT)}>复位</button>
        </div>
        <div
          className="wb-viewport"
          data-state="wb-canvas"
          ref={viewportRef}
          onPointerDown={beginPan}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={onWheel}
        >
          <div
            className="wb-canvas"
            data-state="wb-canvas-inner"
            style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
          >
            {items.map((item) => (
              <div
                key={item.id}
                className={`wb-note${editingId === item.id ? " wb-note-editing" : ""}`}
                data-note-id={item.id}
                data-note-type={item.type}
                style={{ left: item.x, top: item.y, width: item.w, height: item.h, background: item.color }}
              >
                <div className="wb-note-head" data-action="wb-note-drag" onPointerDown={(e) => beginNoteDrag(e, item)}>
                  <span className="wb-note-kind">{WHITEBOARD_ITEM_TYPES.includes(item.type as never) ? item.type : "note"} #{item.id}</span>
                  <span className="wb-note-pos">({item.x}, {item.y})</span>
                </div>
                {editingId === item.id ? (
                  <div className="wb-note-edit">
                    <textarea aria-label="便签内容" value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                    <div className="wb-note-edit-actions">
                      <button type="button" className="btn" data-action="wb-note-save" onClick={() => void saveNote(item.id)} disabled={busy}>保存</button>
                      <button type="button" className="btn" data-action="wb-note-cancel" onClick={() => setEditingId(null)}>取消</button>
                    </div>
                  </div>
                ) : (
                  <div className="wb-note-body" data-state="wb-note-content">{item.content || "（空便签）"}</div>
                )}
                <div className="wb-note-actions">
                  <button type="button" className="btn" data-action="wb-note-edit" onClick={() => { setEditingId(item.id); setEditContent(item.content); }}>编辑</button>
                  <button type="button" className="btn" data-action="wb-note-delete" onClick={() => void removeNote(item.id)} disabled={busy}>删</button>
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <p className="wb-canvas-empty" data-state="wb-canvas-empty">画布还是空的——点「＋ 新建便签」或「✦ AI 建板」开始。</p>
            )}
          </div>
        </div>
        <div className="wb-status">
          <span>画布：{items.length} 个条目 · 平移 ({Math.round(viewport.x)}, {Math.round(viewport.y)}) · 缩放 {Math.round(viewport.scale * 100)}%</span>
          {notice !== "" && <span className="wb-notice" data-state="whiteboard-notice">{notice}</span>}
        </div>
      </div>
    </section>
  );
}
