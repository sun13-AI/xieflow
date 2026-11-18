# r21 截图索引 — 私有化部署与一体化单机版（M10 收官）

- 轮次：r21（M10 第 2 片，项目最终里程碑）；证据类型：部署契约 + 数据目录 + 首启引导 + 真实 8080 部署。
- 本轮**未改渲染层**（`apps/web/` 零改动，徽章仍为 r20），故十四 tab 壳基线不重拍；06 为真实 488px 窄屏钉态（`?narrow=1`），沿用 r1~r20 `?narrow=1` 测试 seam 惯例。
- 01–04 为文本流程图 / 控制台输出 / 目录结构 / README.txt 的 PNG 渲染（数据来自真实 pack + boot 捕获，非手绘插画）；05–06 为 headless Edge 对真实运行的 portable 服务（8080）截图。
- 六图均为独立画面，SHA256 前 8 位互异（6/6）。逐张 `read_image` 目验：无乱码、无裁切、无塌陷。

| 文件 | 形态 | 证据 / 对应断言 |
|---|---|---|
| [01-docker-topology.png](01-docker-topology.png) | Docker 部署拓扑文本流程图 PNG（Browser → app container :8080 → api child :8787 → SQLite → named volume；标 XIEFLOW_MODE=remote 与 health 探针） | e2e「r21 Dockerfile 多阶段 / compose 解析出 services.app / XIEFLOW_MODE=remote / 8080:8080 / data 卷 / healthcheck 引用契约路径」 |
| [02-startcmd-first-run.png](02-startcmd-first-run.png) | start.cmd 首启控制台输出（FIRST RUN 引导 + data 目录自检 + 8080 ready + health 200） | pack → start.cmd 真 boot 实测捕获（web 200 / api health 200 / schema 15）；e2e「pack.js 首启引导四要素 / 数据目录自检」 |
| [03-portable-tree.png](03-portable-tree.png) | portable 目录结构（api/src + packages + web + scripts/portable-serve.mjs + data/ + start.cmd + 新增 start.sh + README.txt） | e2e「pack.js 生成 start.sh / POSIX shebang / 引导四要素」；pack 产物实测 `Get-ChildItem` |
| [04-readme-guide.png](04-readme-guide.png) | README.txt 首启引导（双击 start.cmd → 打开 8080 → 数据落 ./data/ → 备份见 DEPLOY.md） | e2e「README.txt 写清双击 start.cmd → 打开 8080 / 引导四要素全在 pack.js 生成逻辑中」 |
| [05-8080-home.png](05-8080-home.png) | 真实 8080 首页（1280×900，headless Edge，工作台 + 服务模式 + 多端同步卡 + 在线绿点） | portable boot 实测 `GET / -> 200`；e2e/audit「契约健康路径 200、模式探针 200」的可观察形态 |
| [06-narrow-488.png](06-narrow-488.png) | 真实 488px 窄屏（`?narrow=1`）：☰ 汉堡 + 底部导航 + 单列卡片 + 无横向溢出 | 沿用 r1~r20 窄屏 seam；e2e「r20 ≤600px 断点 / 44px / overflow-x hidden」（本轮未改渲染层，形态继承） |

**SHA256 自查（前 8 位）**：`01=5F2FD3AD` · `02=62A02E36` · `03=366D1C98` · `04=7DBCB281` · `05=290C2CFA` · `06=85BC5B8D` —— **6/6 互异**（`Get-FileHash -Algorithm SHA256` 亲算）。六图文件大小 43–101 KB，均为有效 PNG。

**拍摄方法**：01–04 由 Pillow 将真实捕获的文本数据渲染为 PNG（ASCII 内容，Consolas 等宽字体，无中文编码坑）；05–06 由 headless Edge（`--headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=6000`）对运行中的 portable 服务截图，拍完即 kill 浏览器进程树，不留常驻窗口（owner headless 指令）。boot 复验与截图完成后已 `taskkill` 收净 8080/8787 进程树并删除 scratch `data/`，全部端口 listen=0。
