# r19 返工 #1 矩阵：status 最新变更修复 + 同步卡 U2 低成本修复（7 张 + 14 张 shell）

> 本矩阵是 r19 返工 #1 的**新证据**，不覆盖原 `../r19/` 矩阵（原 7 张由其 README 与 ui-reviewer 报告锁定，字节未动）。
> 全部截图走一次性 headless（`--headless=new` + `-WindowStyle Hidden`），`powershell -File scripts/shot.ps1 all -Round r19` 起收服务，
> 拍后 8787/5173 全 free、服务模式回 local；无 seed 实体，仓库 `data/xieflow.db` 未写入。
> 七张为确定态 `?shot=sync-*` 钉态；真实 HTTP 行为（6 条变更 status 回最新 id / 时间、409、幂等）由 `scripts/audit-http.ts` 独立锁定。

| 文件 | 形态 | 对应断言 / 证据性质 |
|---|---|---|
| 01-sync-idle.png | 同步卡空闲（最近同步 + 未同步 0 + 版本 6 + 灰框无冲突 + 手动同步） | `?shot=sync-idle`；audit「r19 status 回带最后变更 id/时间（精确=最新一条）」 |
| 02-sync-pending.png | 有未同步（3 条 + 版本 6） | `?shot=sync-pending`；audit「r19 增量拉取 -> 200」 |
| 03-sync-conflicts.png | 冲突列表（实体键 + `title`、`status` + 「查看差异并选边」） | `?shot=sync-conflicts`；audit「r19 409 冲突字段列表=[title]」；**U2-2 钉态字段值改为纯值** |
| 04-sync-modal.png | 冲突弹窗（本地蓝/远端绿 diff 表 + **后果提示黄条** + 三按钮，`title` 两版核心文案改为「季度复盘 / 季度规划」） | `?shot=sync-modal`；e2e「r19 返工#1 选边后果提示前置 / 稍后处理弱化 / title 两版核心文案不同」 |
| 05-sync-success.png | 同步成功后（绿条 + 未同步归 0 + 版本 7） | `?shot=sync-success`；audit「r19 选边后写入版本=3」 |
| 06-sync-narrow.png | 窄屏 488×900：十四药丸单行、同步卡完整不裁切 | 无独立数字断言（CSS 断点钉态，逐张目验） |
| 07-sync-error.png | 错误态（红条同步失败提示） | `?shot=sync-error`；无独立数字断言（真实 4xx 由 audit 锁定） |

## SHA256 自查（7 + 14 = 21/21 两两互异）

矩阵：`01=9D678D75` · `02=43E0D078` · `03=58A70674` · `04=CEFA8B38` · `05=DE998AC7` · `06=9C305446` · `07=6FB54E15`。

壳（14 张，`shell/`）：`workbench=E269A1B3` · `todos=0F9184DC` · `schedules=B002BB3D` · `projects=B86EAE19` · `board=E7BEF0B1` · `bases=DCA1920D` · `docs=610032A4` · `chat=67F006A1` · `knowledge=10EB746A` · `mindmap=CE292C61` · `whiteboard=26F86E19` · `approval=EC8D4CD5` · `assets=DCB438A9` · `unit-tasks=6EA8A279`。

- 21/21 两两互异，无同字节充数；矩阵 7/7 与原 `../r19/` 均不同字节（钉态时间前进 + U2-2 文案变更）。
- 壳 11/14 与原 `../r19/shell/` 或 `../shell/` 逐字节相同；`todos` / `assets` / `knowledge` 三张因页面内动态计数/时间戳漂移而与新拍时刻一致，**与 SyncCard 改动无关**（壳走 `?shot=<tab>`，不进入同步冲突钉态）；11 张相同者不再重复目验，原图已由 ui-reviewer 逐张背书。
- `read_image` 目验 10 张（7 张矩阵 + 3 张漂移壳）：中文无乱码、无裁切、无塌陷；04 后果黄条完整可读、`title` 两版核心文案明显不同、「稍后处理」灰化与两个主选区分；06 在 488px 下同步卡与十四药丸完整。

## 卫生

- `shot.ps1 all` 自起自收，拍后 `Test-NetConnection` 8787/5173/8788/9333 listen 全 False；
- 原 `docs/ui/r19/` 与 `docs/ui/shell/` 在拷贝后 `git checkout --` 逐字节还原（`git status -- docs/ui/r19 docs/ui/shell` 为空）；
- 未 push / 未打 tag / 未发版 / 未写密钥文件；PowerShell 脚本未改动（沿用已验 ASCII-only 的 shot.ps1）。
