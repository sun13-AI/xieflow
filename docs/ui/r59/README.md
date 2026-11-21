# docs/ui/r59 · a11y 修复：日程页焦点 / 键盘态矩阵

日期：2026-11-22
角色：yanfa-r59（headless CDP 一次性捕获；不弹可见窗口）
来源：`node scripts/r59-a11y-cdp.mjs --shots`。scratch `XIEFLOW_DB_PATH` + 临时 api:8787 / vite:5173，跑完进程树与 scratch 目录收净；未用 `data/xieflow.db`。

## 截图矩阵（6 张，1256×808，逐一对应断言）

| 截图 | 形态 | 对应断言 / 实测 |
|---|---|---|
| [01-schedule-month.png](01-schedule-month.png) | 日程页月视图默认态（42 个 `role="button"` 日历格在场，激活 tab 新底色） | CDP「42 个 role=button 日历格在场（实测 42）」；e2e「r59 P1-1·日历格补 tabIndex={0}」 |
| [02-last-cell-focus.png](02-last-cell-focus.png) | 末格（第 42 格）聚焦态，蓝色 2px 焦点环可见 | CDP「Tab 真遍历覆盖 42/42 日历格」「程序化聚焦末格成功」「焦点格 outline 可见」；e2e「r59 P2·全局 :focus-visible 2px 焦点环」 |
| [03-first-cell-focus.png](03-first-cell-focus.png) | 真按 Tab 聚焦首格（键盘可达实证） | CDP「Tab 可聚焦首格（键盘可达实证）」；e2e「r59 P1-1·Enter/Space 键盘处理在场」 |
| [04-enter-modal.png](04-enter-modal.png) | 聚焦首格后按 Enter → 「新建日程」弹窗出现 | CDP「Enter 后新建日程弹窗出现（实测 1）」；e2e「r59 P1-1·键盘与点击同一处理」 |
| [05-space-modal.png](05-space-modal.png) | 再次 Tab 聚焦首格后按 Space → 同一弹窗出现 | CDP「Space 后新建日程弹窗出现（实测 1）」；与 04 为两次独立触发，字节不同 |
| [06-tab-active.png](06-tab-active.png) | 激活 tab 白字压 `#2f68e5` 的对比度实证 | CDP「激活 tab 白字对比度 4.96:1 >= 4.5（r58 基线 4.28）」；e2e「r59 P1-2·白字压激活底 ≥4.5」 |

## 实测摘要

- 键盘：42/42 格 `tabIndex=0`；真发 Tab 覆盖 42/42 且无重复；Enter 与 Space 各开 modal 1 次。
- 对比度：修复前 CDP 实取 `rgb(51,112,255)` = **4.28:1**；修复后 `rgb(47,104,229)` = **4.96:1**（审计建议值约 4.66 为估算，本轮按 WCAG 公式实测）。
- 焦点环：聚焦格计算样式 `rgb(47, 104, 229) solid 2px`，未抹除既有 outline。
- 20 tab 壳同批重拍见 [shell 当前 R59 块](../shell/README.md)；r57→r59 changed=20 / same=0（激活底色出现在每张壳图）。
- 全库 **417 PNG / 415 互异**；矩阵 6/6 SHA256 互异，矩阵↔壳重叠 0；同态组仅 r4 已披露 2 组。

## R59_HASHES_BEGIN

`01-schedule-month=39DDE285` · `02-last-cell-focus=0D07D988` · `03-first-cell-focus=07B1C70A` ·
`04-enter-modal=30E79C7D` · `05-space-modal=B6A53219` · `06-tab-active=A38C33CA` —— **6/6 互异**。

<!-- R59_HASHES_END -->
