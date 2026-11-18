# r19 矩阵：多端同步与冲突处理（M9 收官，共 7 张）

> 同步卡在**工作台设置区**内（服务模式卡下方），不新增 tab —— 主界面 14 药丸数量不变。
> 同批重拍十四 tab 壳基线（见 `../shell/README.md`）；所有图走一次性 headless
> （`--headless=new` + `-WindowStyle Hidden`），拍后服务收净（8787/5173 全 free）。
> 七张为确定态 `?shot=sync-*` 钉态；真实 HTTP 行为（409 冲突字段 / 乐观锁 / 幂等 / 越权）由 `scripts/audit-http.ts` 独立锁定。

| 文件 | 形态 | 对应断言 / 证据性质 |
|---|---|---|
| 01-sync-idle.png | **同步卡空闲**（最近同步时间 + 未同步 0 条 + 已跟踪实体版本 6 + 无冲突表 + 手动同步按钮 + r19 徽章 + 14 药丸） | `?shot=sync-idle`；audit「r19 GET status -> 200」「r19 GET changes 空 -> 200」 |
| 02-sync-pending.png | **有未同步**（未同步 3 条、最近同步时间前移、已跟踪实体版本 6，仍无冲突） | `?shot=sync-pending`；audit「r19 增量拉取 -> 200」「r19 同一 since 重复拉逐字节一致（幂等）」 |
| 03-sync-conflicts.png | **冲突列表**（红框内实体 `todo:r19-sync-demo` + 冲突字段 `title、status` + 「查看差异并选边」按钮） | `?shot=sync-conflicts`；audit「r19 409 冲突字段列表=[title]（waizhuan 手算口径）」 |
| 04-sync-modal.png | **冲突弹窗**（遮罩 + 本地蓝/远端绿双列 diff 表：`title` 两版文案、`status` open vs done + 保留本地/保留远端/稍后处理三按钮） | `?shot=sync-modal`；e2e「r19 冲突弹窗提供本地/远端两个选边按钮」；audit「r19 409 回带基线/本地/远端值供弹窗选边」 |
| 05-sync-success.png | **同步成功后**（成功条「√ 同步成功，冲突已消化。」+ 未同步归 0 + 已跟踪实体版本 7 + 绿色成功提示） | `?shot=sync-success`；audit「r19 选边后写入版本=3」「r19 幂等重放版本不二次递增」 |
| 06-sync-narrow.png | 窄屏 488×900（`?narrow=1`）：14 药丸单行、同步卡最近同步/未同步数/按钮/提示完整，无横向裁切 | 无独立数字断言（CSS 断点钉态，逐张目验） |
| 07-sync-error.png | **错误态**（红条「同步失败：HTTP 500（截图钉态），请稍后重试。」） | `?shot=sync-error`；无独立数字断言（真实 4xx 由 audit 400/409/403 断言锁定） |

## SHA256 自查（7/7 互异，与 r18 及各轮矩阵均不同字节）

`01=F86F6EF1` · `02=05CD65B9` · `03=A5C2FBAA` · `04=AD33489A` · `05=9FB423E4` ·
`06=AED65DE6` · `07=34A5AA97` —— **7/7 两两互异**。

十四 tab 壳基线同批重拍 **14/14 互异**（`workbench=E269A1B3` / `todos=28DC21AE` / `unit-tasks=6EA8A279` 等，
与 r18 十四张逐位全异：徽章推进 r19、工作台新增多端同步卡、schema v15、M9 收官）。
全库 **198 PNG / 196 互异**，同态组仅 r4 已披露的 2 组，r19 零新增。

七张逐张 `read_image` 目验：中文无乱码、无裁切、无塌陷；01/02/05/07 四条同步卡状态彼此不同（空闲/未同步/成功/错误）；
03 冲突框与 04 弹窗的 diff 表同语汇且 04 遮罩不吞按钮；06 在 488px 下同步卡完整、药丸单行不折行。

## 清理与卫生

- 本轮无 seed 实体（七张均为真实钉态；真实同步数据由 audit 的 scratch DB 装配并随目录删除）；
- 服务模式经 `POST /api/auth/mode {"mode":"local"}` 恢复 local（本轮始终 local）；
- 全程 headless、服务收净；PowerShell 新增段全 ASCII（118932 B、非 ASCII 0、PS5.1 Parser 0 错误）；
- 未写任何密钥文件、未 push / 未打 tag / 未发版。
