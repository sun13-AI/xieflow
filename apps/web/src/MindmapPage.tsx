// 协流 XieFlow — r14「导图」tab：左 Markdown 源编辑 + 右树视图（节点可折叠/展开，双视图实时同步）
// 数据全走真实 api（mindmaps CRUD / /:id/tree / PUT /:id/content）；树解析口径只在 shared。
// 截图钉态：?page=mindmap&shot=mindmap-empty|mindmap-loading|mindmap-error|mindmap-edit|mindmap-tree|mindmap-collapsed
// ?mapId= 深链选中真实导图；?narrow=1 显式钉窄屏。编辑时前端用同一个 shared parseMarkdownToTree 即时更新右栏。
import { useCallback, useEffect, useState } from "react";
import type { Mindmap, MindmapNode, MindmapTree } from "@xieflow/shared";
import { parseMarkdownToTree, toggleNodeCollapse } from "@xieflow/shared";
import { SERVICE_DOWN_MESSAGE, fetchJsonOrThrow } from "./httpClient";

interface MindmapQuery {
  readonly shot: string;
  readonly mapId: string;
}

type MapState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | ({ phase: "ready" } & { maps: Mindmap[] });

const PINNED = new Set(["mindmap-loading", "mindmap-error", "mindmap-empty"]);

function readQuery(): MindmapQuery {
  const p = new URLSearchParams(window.location.search);
  return { shot: p.get("shot") ?? "", mapId: p.get("mapId") ?? "" };
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

interface TreeNodeProps {
  readonly node: MindmapNode;
  readonly collapsed: readonly string[];
  readonly onToggle: (id: string) => void;
}

function TreeNodeView({ node, collapsed, onToggle }: TreeNodeProps) {
  const isCollapsed = collapsed.includes(node.id);
  const hasChildren = node.children.length > 0;
  return (
    <li className="mm-node" data-node-id={node.id} data-depth={node.depth}>
      <div className="mm-node-row">
        {hasChildren ? (
          <button
            type="button"
            className="mm-toggle"
            data-action="mm-toggle"
            data-node-id={node.id}
            aria-label={isCollapsed ? "展开节点" : "折叠节点"}
            onClick={() => onToggle(node.id)}
          >
            {isCollapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="mm-toggle-leaf">·</span>
        )}
        <span className={`mm-node-label mm-kind-${node.kind}`}>{node.label}</span>
        <span className="mm-node-meta">#{node.id} · {node.kind}</span>
      </div>
      {hasChildren && !isCollapsed && (
        <ul className="mm-children">
          {node.children.map((child) => (
            <TreeNodeView key={child.id} node={child} collapsed={collapsed} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function MindmapPage() {
  const [query] = useState<MindmapQuery>(readQuery);
  const [state, setState] = useState<MapState>(() => {
    const shot = query.shot;
    if (shot === "mindmap-loading") return { phase: "loading" };
    if (shot === "mindmap-error") return { phase: "error", message: SERVICE_DOWN_MESSAGE };
    if (shot === "mindmap-empty") return { phase: "ready", maps: [] };
    return { phase: "loading" };
  });
  const [selectedId, setSelectedId] = useState<number>(() => Number(query.mapId) || 0);
  const [draft, setDraft] = useState("");
  const [tree, setTree] = useState<MindmapTree>({ roots: [], trailingBlanks: 0 });
  const [collapsed, setCollapsed] = useState<readonly string[]>([]);
  const [titleDraft, setTitleDraft] = useState("");
  const [creating, setCreating] = useState(query.shot === "mindmap-edit" && query.mapId === "");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getJson<{ mindmaps: Mindmap[] }>("/api/mindmaps");
      setState({ phase: "ready", maps: data.mindmaps });
      return data.mindmaps;
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("narrow") === "1") {
      document.documentElement.classList.add("force-narrow");
    }
    if (PINNED.has(query.shot)) return;
    void refresh().then((maps) => {
      if (!selectedId && maps.length > 0) setSelectedId(maps[0]!.id);
    });
    // selectedId 只作为初始深链一次；后续切换由点击驱动，避免反复重拉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.shot, refresh]);

  // 选中导图：真读 GET /api/mindmaps/:id/tree（不是前端伪造）；左栏 Markdown 取同一条记录
  useEffect(() => {
    if (state.phase !== "ready" || selectedId <= 0) {
      setDraft("");
      setTree({ roots: [], trailingBlanks: 0 });
      setCollapsed([]);
      return;
    }
    let alive = true;
    Promise.all([
      getJson<Mindmap>(`/api/mindmaps/${selectedId}`),
      getJson<{ tree: MindmapTree }>(`/api/mindmaps/${selectedId}/tree`),
    ]).then(([map, data]) => {
      if (!alive) return;
      setDraft(map.contentMarkdown);
      setTree(data.tree);
      setCollapsed(query.shot === "mindmap-collapsed" && data.tree.roots[0]?.children[0]
        ? [data.tree.roots[0].children[0].id]
        : []);
    }).catch((err: unknown) => {
      if (alive) setNotice(err instanceof Error ? err.message : String(err));
    });
    return () => { alive = false; };
  }, [selectedId, state.phase, query.shot]);

  // 双视图实时同步：编辑 Markdown → 立即用 shared 同一解析器重算右侧树（零网络往返）
  const onDraftChange = (value: string) => {
    setDraft(value);
    setTree(parseMarkdownToTree(value));
  };

  const createMap = async () => {
    if (titleDraft.trim() === "") {
      setNotice("请先填写导图标题");
      return;
    }
    setBusy(true);
    try {
      const created = (await sendJson("/api/mindmaps", "POST", { title: titleDraft.trim() })) as Mindmap;
      setCreating(false);
      setTitleDraft("");
      setSelectedId(created.id);
      setDraft("");
      setTree({ roots: [], trailingBlanks: 0 });
      setNotice(`已建导图 #${created.id}——在左侧写 Markdown 即可看到右侧树`);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveContent = async () => {
    if (selectedId <= 0) {
      setNotice("请先选择一张导图");
      return;
    }
    setBusy(true);
    try {
      const saved = (await sendJson(`/api/mindmaps/${selectedId}/content`, "PUT", { contentMarkdown: draft })) as Mindmap;
      setDraft(saved.contentMarkdown);
      const data = await getJson<{ tree: MindmapTree }>(`/api/mindmaps/${selectedId}/tree`);
      setTree(data.tree);
      setNotice(`已保存 Markdown（${saved.contentMarkdown.length} 字节），树视图已同步`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setCollapsed((prev) => toggleNodeCollapse(prev, id));
  const expandAll = () => setCollapsed([]);
  const removeMap = async (id: number) => {
    setBusy(true);
    try {
      await deleteJson(`/api/mindmaps/${id}`);
      if (selectedId === id) setSelectedId(0);
      setNotice(`已删除导图 #${id}`);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (state.phase === "loading") {
    return (
      <section className="card state-loading" data-state="mindmap-loading">
        <p>正在连接导图库…</p>
      </section>
    );
  }
  if (state.phase === "error") {
    return (
      <section className="card state-error" data-state="mindmap-error" role="alert">
        <h2>连接失败</h2>
        <p className="error-message">{state.message}</p>
        <p className="hint">请确认 api 服务已启动（pnpm dev:api），然后点「重试」。</p>
        <button type="button" className="btn" onClick={() => void refresh()}>重试</button>
      </section>
    );
  }

  const selected = state.maps.find((m) => m.id === selectedId);
  const pinNote = query.shot === "mindmap-empty"
    ? "首次使用空态钉注：真实 0 张导图——点「＋ 新建」即可写第一段 Markdown。"
    : query.shot === "mindmap-edit"
      ? "编辑钉注：左侧改一个字符，右侧树立即由 shared parseMarkdownToTree 重算。"
      : query.shot === "mindmap-tree"
        ? "树视图钉注：节点由 GET /api/mindmaps/:id/tree 真解析后渲染，可点箭头折叠。"
        : query.shot === "mindmap-collapsed"
          ? "折叠钉注：点节点箭头可折叠/展开，折叠状态走 shared toggleNodeCollapse。"
          : "";

  return (
    <section className="mm-shell" data-state="mindmap-ready">
      <aside className="mm-side">
        <div className="mm-side-head">
          <h2>我的导图</h2>
          <button type="button" className="btn" data-action="mm-create-open" onClick={() => setCreating(true)}>＋ 新建</button>
        </div>
        {creating && (
          <div className="mm-new">
            <input
              aria-label="导图标题"
              placeholder="导图标题"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
            />
            <button type="button" className="btn" data-action="mm-create" onClick={() => void createMap()} disabled={busy}>确认</button>
          </div>
        )}
        {state.maps.length === 0 ? (
          <p className="empty" data-state="mindmap-empty-list">还没有导图——点「＋ 新建」开始写第一段 Markdown。</p>
        ) : (
          <ul className="mm-list" data-state="mindmap-list">
            {state.maps.map((m) => (
              <li key={m.id} className={`mm-list-item${m.id === selectedId ? " mm-list-active" : ""}`}>
                <button type="button" className="mm-list-btn" data-map-id={m.id} onClick={() => setSelectedId(m.id)}>
                  <span className="mm-list-title">{m.title}</span>
                  <span className="mm-list-meta">#{m.id} · {m.contentMarkdown.length} 字节</span>
                </button>
                <button type="button" className="mm-del" data-map-id={m.id} onClick={() => void removeMap(m.id)} disabled={busy}>删</button>
              </li>
            ))}
          </ul>
        )}
        {pinNote !== "" && <p className="mm-shot-note" data-state="mindmap-pin">{pinNote}</p>}
      </aside>
      <div className="mm-main">
        <div className="mm-editor">
          <div className="mm-pane-head">
            <h3>Markdown 源</h3>
            <span className="mm-sync">双视图实时同步 · 零 token 本地解析</span>
          </div>
          <textarea
            aria-label="Markdown 源"
            className="mm-textarea"
            data-state="mindmap-editor"
            spellCheck={false}
            value={draft}
            placeholder={"# 中心主题\n\n## 分支一\n- 子节点\n  - 更深的节点"}
            onChange={(e) => onDraftChange(e.target.value)}
          />
          <div className="mm-editor-actions">
            <button type="button" className="btn" data-action="mm-save" onClick={() => void saveContent()} disabled={busy || selectedId <= 0}>
              保存 Markdown
            </button>
            <span className="mm-editor-meta">
              {selected ? `${selected.title} · #${selected.id}` : "未选择导图"} · {draft.length} 字节
            </span>
          </div>
          {notice !== "" && <p className="mm-notice" data-state="mindmap-notice">{notice}</p>}
        </div>
        <div className="mm-tree-pane">
          <div className="mm-pane-head">
            <h3>树视图</h3>
            <button type="button" className="btn" data-action="mm-expand-all" onClick={expandAll}>全部展开</button>
          </div>
          <div className="mm-tree-stat" data-state="mindmap-tree-stat">
            节点 {tree.roots.reduce((n, r) => n + 1 + countChildren(r), 0)} · 折叠 {collapsed.length}
          </div>
          {tree.roots.length === 0 ? (
            <p className="empty" data-state="mindmap-tree-empty">还没有节点——在左侧写标题或列表，右侧立即出现。</p>
          ) : (
            <ul className="mm-tree" data-state="mindmap-tree">
              {tree.roots.map((node) => (
                <TreeNodeView key={node.id} node={node} collapsed={collapsed} onToggle={toggle} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function countChildren(node: MindmapNode): number {
  return node.children.reduce((n, c) => n + 1 + countChildren(c), 0);
}
