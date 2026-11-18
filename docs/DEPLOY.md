# 协流 XieFlow — 部署指南（r21 · M10 收官）

本文覆盖三条部署路径与数据搬家四步。所有路径共用同一套**部署契约**（定义在
`packages/shared/src/deploy.ts`）：健康探针 `/api/health`、模式探针 `/api/auth/mode`、
单机端口 `8080`、数据目录 `data/`（SQLite 文件 `data/xieflow.db`）。
`local` = 单机免登录；`remote` = 网络版强制鉴权。

---

## 一、三条部署路径

### 路径 A：网络版（cloud，已上线）

公网上线的托管实例，模式固定 `remote`，无需自行部署。
- 入口：由 owner 提供的公网地址（仓库不存_addr_，问 lead 取）。
- 数据：由平台托管，用户不直接碰 `data/`。
- 自检：`GET <入口>/api/health` 应返回 `{"ok":true,...,"mode":"remote"}`（HTTP 200）。

### 路径 B：私有化部署（docker-compose）

适合内网 / 客户机房一键起服务，模式固定 `remote`。

```bash
cd docker
docker compose up -d          # 构建镜像 + 起 app + 具名数据卷 xieflow-data
docker compose ps             # 看健康状态（healthy）
```

- Web + API 同源单端口：`http://127.0.0.1:8080`
- 环境变量：`XIEFLOW_MODE=remote`、`XIEFLOW_PORT=8080`、`XIEFLOW_DB_PATH=/app/data/xieflow.db`
- 数据卷：`xieflow-data` 挂载到容器 `/app/data`；容器重建数据不丢。
- 自检：`curl http://127.0.0.1:8080/api/health` → 200；或跑 `pwsh scripts/verify-deploy.ps1`（见第四节）。
- 停止：`docker compose down`（**不加** `-v`，加 `-v` 会删数据卷）。

> 无 docker 的机器可用静态校验：`pnpm test` 的 r21 节用 YAML 解析断言 compose 结构
> （services.app / XIEFLOW_MODE=remote / 8080:8080 / data 卷 / healthcheck），不依赖 docker。

### 路径 C：一体化单机版（portable 目录）

免安装、完全离线，模式固定 `local`（免登录），适合个人电脑 / U 盘携带。

```bash
pnpm run pack                  # 构建 release/xieflow-portable/
cd release/xieflow-portable
# Windows: 双击 start.cmd
# Linux/macOS: ./start.sh
```

- 浏览器打开 `http://127.0.0.1:8080`；首次运行会自建 `./data/` 并打印引导（见目录内 `README.txt`）。
- 数据目录自检：启动即检查 `data/` 存在且可写，不可写则大声报错退出，不带病上线。
- 停止：关掉控制台窗口或 Ctrl+C（api 子进程随主进程退出）。
- 安装包：`pnpm run dist` 产出 `release/xieflow-setup-<版本>.zip`，解压即用（语义同 portable）。

---

## 二、备份 / 恢复 / 搬迁（四步）

**数据只有一个真相源：`data/xieflow.db`（docker 为卷 `xieflow-data`）。** 备份就是复制它。

| 步骤 | 动作 | 命令示例 |
|---|---|---|
| 1. 停服 | 先停服务，避免写库时复制 | portable：关窗口；docker：`cd docker && docker compose stop` |
| 2. 备份 | 整目录复制 `data/`（含 db + 备份/图片） | `Copy-Item -Recurse data backup\data-YYYYMMDD`（Windows）或 `cp -a data backup/data-YYYYMMDD` |
| 3. 恢复 | 把备份目录复制回 `data/` | 先移走旧 `data/`，再把备份复制为 `data/`；启动后 `/api/health` 应 200 |
| 4. 搬迁 | 换新机：拷贝整个部署目录 + `data/` | portable：拷整个 `xieflow-portable/`（含 data）→ 新机双击 start.cmd；docker：`docker compose down` 后拷卷数据到新机卷再 `up` |

注意：
- 不要只复制 `.db` 而漏掉 `data/` 下的图片 / 备份文件；整目录复制最稳。
- 恢复/搬迁后**不要手改库文件**；schema 升级只由服务的 `user_version` 迁移完成（宪法第七条）。
- 跨大版本恢复前先备份原库，升级不可逆时可用备份回滚。

---

## 三、自检脚本 `scripts/verify-deploy.ps1`

起一次性 api（scratch 库）→ 等 `health 200` → 逐个探关键路由 → 收净进程，全程 headless，不留常驻服务。

```powershell
pwsh scripts/verify-deploy.ps1          # 默认端口 8790
pwsh scripts/verify-deploy.ps1 -Port 8799
```

判定：
- `/api/health`、`/api/auth/mode`、`/api/settings` → 200；
- `/api/todos`（业务路由）在 `local` 模式 → 200（在 `remote` 模式 → 401，属预期）；
- `/api/auth/me`（强保护）→ 401 且带 `cleared=true`（认证页 401 属预期，不是故障）。

脚本只认 ASCII（PS 5.1 编码坑），结束会 kill 自己起的进程树并删 scratch 库；不碰仓库 `data/`。

---

## 四、常见问题（FAQ）

**Q：双击 start.cmd 后浏览器打开是空白 / 502？**
A：先看控制台是否打印 `[portable] XieFlow ready`。若打印了但 502，说明 api 子进程没起来——
多半是 Node 版本 < 20 或 `pnpm install` 未跑；升级 Node 后重新 `pnpm run pack`。

**Q：health 一直不是 200？**
A：确认端口没被占（默认 8080 / api 8787），看 `data/` 是否可写（自检会报错）。
docker 用 `docker compose logs app` 看容器日志。

**Q：remote 模式业务路由返回 401，是不是坏了？**
A：不是。`remote` 模式强制鉴权，业务路由匿名访问 401 + `cleared=true` 是预期行为，
前端据此跳登录页。健康 / 模式 / settings 三个探针在两种模式下都公开 200。

**Q：数据会丢吗？如何升级不丢数据？**
A：数据只在 `data/`。portable 重建目录前先备份 `data/` 再拷回；docker `down` 不加 `-v`
卷就不删。schema 升级走 `user_version` 迁移，重开服务自动完成，不手改库文件。

**Q：能不能改端口？**
A：portable 设环境变量 `XIEFLOW_PORT` / `XIEFLOW_API_PORT`；docker 改 compose 的 ports
映射与对应 env。改后自检脚本用 `-Port` 指向实际 health 端口。

**Q：Windows 与 Linux/macOS 的启动差异？**
A：Windows 用 `start.cmd`，Linux/macOS 用 `start.sh`（POSIX sh，需 `chmod +x`，pack 已设 755）。
两者跑同一个 `scripts/portable-serve.mjs`，行为一致。
