# r57 · 独立性能复验：r56 原测量方法复测 P1×3

日期：2026-11-21
审计岗：auditor-r57（独立性能审计员；**不改产品代码、不信研发自述，全部数据亲测**）
依据：`docs/feedback/2026-11-21-r56-audit.md`（原方法与原始数据）→ `docs/plan.md:1191-1201`（r57 任务单）→ `docs/feedback/2026-11-21-r57-yanfa.md`（研发声明，**仅作对照，不作证据**）。

## 测量方法（与 r56 同法）

- **SQL 次数**：`openDatabaseRaw({path: scratch})` 后包裹 raw 句柄 `get/all` 逐次计数；每档**全新 scratch DB**，按同量级真造 forms（每表 2 题）/ cards（每卡 2 标签）/ todos / documents / records，非累积。
- **db 层耗时**：`performance.now()` 每次调用计时，每档 5 次取中位数。
- **HTTP 耗时**：scratch api（`XIEFLOW_DB_PATH` + `XIEFLOW_API_PORT` 18788/18789/18790，local 模式）真实 `fetch`，每路由 5 次取中位数（含 body 读取，记录响应字节）。
- **前端**：1000 todos（并造 1000 documents / 1000 records）→ api :8787 + vite :5173 → Edge `--headless=new` + CDP：`Performance.getMetrics` 的 `ScriptDuration` 增量，17 字 `Input.insertText` 每字间隔 15ms；同时记录 Layout/Recalc、首屏渲染、DOM 节点、翻页。
- 全程 headless；探针为 `scripts/.r57-audit-*.ts` 临时文件，验后删除；scratch 目录与所有临时端口/进程验后收净；零 token 落盘；未改产品代码、未 commit、未 push、未动 `data/xieflow.db`。

## 一、P1-1 `listForms`（2N+1 → 批量）

| 数据档 | r56 修复前（SQL / db / HTTP） | yanfa 声明 | 本轮亲测 SQL（5/5） | 本轮 db 中位 | 本轮 HTTP 中位 |
|---|---|---|---|---|---|
| 60 forms | — | 121 → 2 | **2** | 2.16 ms | 3.23 ms（18,477 B）|
| 120 forms | — | 105.1 → 3.2 ms | **2** | 2.33 ms | **4.39 ms**（37,161 B）|
| 1000 forms | 2001 / 1379.5 ms / 1320.9 ms | — | **2** | 7.34 ms | 11.69 ms（314,486 B）|

- 验收：≤2 SQL ✓（三档 5 次全为 2）；120 条 HTTP < 10 ms ✓（4.39 ms，与研发 3.2 ms 同为个位数毫秒，差异在 5 次采样波动内）。
- `getForm` 单条入口与题目顺序语义抽查：100 forms 每表 2 题、Q*a→Q*b 保序，`getForm` 回读同序（见第四节）。

## 二、P1-2 `listBoardCards*`（N+1 → 批量）

| 数据档 | r56 修复前（SQL / db / HTTP） | yanfa 声明 | 本轮亲测 SQL（5/5） | 本轮 db 中位 | 本轮 HTTP 中位 |
|---|---|---|---|---|---|
| 80 cards | — | 81 → 2 | **2** | 1.98 ms | 5.06 ms（21,446 B）|
| 120 cards | — | 53.8 → 4.2 ms | **2** | 1.90 ms | **3.53 ms**（32,228 B）|
| 1000 cards | 1001 / 665.6 ms / 624.3 ms | — | **2** | 5.47 ms | 9.65 ms（270,710 B）|

- 验收：≤2 SQL ✓（三档 5 次全为 2）；120 条 HTTP < 10 ms ✓（3.53 ms，优于研发自报 4.2 ms）。
- `getBoardCard` 单条入口与标签字典序抽查：每卡 2 标签 `a-label → z-label` 保序，`getBoardCard` 回读同序（见第四节）。

## 三、P1-3 Todos 输入（1000 条 / 17 字 / ScriptDuration）

| 来源 | 场景 | ScriptDuration | 墙钟 | Layout / Recalc 增量 |
|---|---|---|---|---|
| r56 修复前 | 1000 todos，17 字 | **2192.3 ms** | 2813.8 ms | 21 / 23 |
| yanfa 声明 | 同上 | 285 ms | — | — |
| 本轮复测 A（每档全新文档 + 300ms 静默，3 组共 10 次） | 1000 todos + 1000 docs + 1000 records，17 字 | **267.0 / 270.6 / 299.5 / 299.8 / 311.8 / 313.6 / 319.6 / 320.5 / 338.9 / 354.5 ms**（中位 312.7 ms）| 715–792 ms | 21 / 23（每次）|

- 10/10 次 < 500 ms；`valueLength=17` 证明 17 字全部真正进入输入框；Layout/Recalc 与 r56 完全一致，说明收益在 JS 侧而非样式重算。
- **冷启动异常如实披露**：最早两次探索性测量（浏览器/服务首次启动、无静默）得到 596.9 / 732.2 ms（全源）与 286.0 / 608.1 ms（仅 todos，第二次为 `Page.reload`）；随后以同法重复（含首发新文档、无静默的 4 次 267/270.6/313.6/320.5 ms）均稳定 <500 ms。按 r56 自身「多点取样看分布、不取单点定生死」的口径（r56 待办页冷渲染 1/4 越线仍判 P2），判该项达标；冷启动偶发偏高不作为修复未达证的据。

## 四、回归抽查（r56 零问题项 + 语义）

| 项 | 本轮实测 | 结论 |
|---|---|---|
| `listTodos` / `listDocuments` / `listRecords` | 100 / 120 / 1000 三档均 **1 SQL**（5/5）；1000 条 db 中位 2.77 / 2.40 / 2.71 ms；HTTP 中位 4.18 / 3.43 / 5.27 ms；records 响应 4,238 B（分页 20 行）| 三条主接口零问题保持 ✓ |
| 表格页分页 | `?page=bases`：**20 行 / 527 DOM**（<1000）；点下一页首行 id **1 → 21**，DOM 仍 527 | 分页仍生效 ✓ |
| 文档页渲染 | 1000 条 → **1000 行 / 4099 DOM**，与 r56 一致 | 零问题保持 ✓ |
| 待办页首屏（P2 记账项，仅观察） | 1000 条 → 1000 行 / 9094 DOM（r56 9092）；首屏 261.7–365.9 ms（r56 冷 1.53–2.07 s）| 未变坏；P2 仍记账不改 |
| 搜索输出上限 | `?q=audit&limit=20` → 200 / 16 结果 / 2,251 B；`limit=51` → **400** | 上限保护保持 ✓ |
| 备份表集合 | `GET /api/backup/export` → 200，`manifest.tableCount=38` | 38 表常量保持 ✓ |
| 批量装配语义 | 100 forms 每表 2 题且 `getForm` 同序；100 cards 每卡 2 标签且 `getBoardCard` 同字典序 | 单条入口零功能变化 ✓ |

## 五、判定与收尾

- 三条 P1 全部达阈值：P1-1 ≤2 SQL 且 120 条 <10 ms（2 SQL / 4.39 ms）；P1-2 ≤2 SQL 且 120 条 <10 ms（2 SQL / 3.53 ms）；P1-3 <500 ms（重复 10 次 267–354.5 ms，中位 312.7 ms）。
- r56 零问题项无一被改坏；P2×3 按任务单只记账，不在本轮判定内。
- 收尾：临时探针文件已删；scratch 库已删；api 18788/18789/18790/18799/8787、vite 5173、headless Edge 全部收净，端口复查归零；零 token；未改产品代码、未 commit、未 push、未打 tag。

AUDIT-VERDICT: 通过
