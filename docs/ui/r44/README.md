# docs/ui/r44 · 图证与文档口径修正（轻量轮；沿用 r43 矩阵目录同批重拍）

> 工作目录 `D:\work\好东西\xieflow`。任务单：`docs/plan.md` r44（第 943–952 行）。
> 本轮只修正 r43 UI 审查记账的图证/文档口径与用户可见文案，不新增功能、不改 schema（v27 保持）。
> 渲染层确有改动（`MeetingsPage.tsx` 校验错误帧文案 + 05 冲突时段钉态），按宪法第一条
> **`scripts/shot.ps1 shots -Round r43` 全批重拍七张矩阵 + 二十 tab 壳（同一提交）**，沿用 r43 文件名与目录，废片未入库。
> 全程 headless（`r39-shot.mjs` 一次性 CDP），`XIEFLOW_DB_PATH=scripts/.tmp-r44shot/shot.db` scratch 库已删除，
> `data/xieflow.db` 全程未作数据源；服务已收净（8787/8788/5173 listen=0）。

| 图证 | r44 修正要点 | 对应断言 |
|---|---|---|
| [05-recommend-conflicts.png](../r43/05-recommend-conflicts.png) | U2-1：画面表单开始 14:30 / 结束 15:00，与推荐需求及 #21「14:00–15:30 已占用」同源；索引同步 | e2e「r44 U2-1·表单时段与推荐结果同源」；DOC-CONTRACT 时段 seam 契约 |
| [07-recommend-error.png](../r43/07-recommend-error.png) | U2-2：校验错误改「输入有误 / 请检查人数/设备/时段」纯用户文案，去掉「连接失败 / pnpm dev:api」框架 | e2e「r44 U2-2·校验/服务错误帧分流」；check:text 0 命中 |
| 其余五张矩阵 | 同批重拍，字节未变或随重拍更新 | e2e「r43 截图·七张 SHA256 两两互异」 |
| [shell/](../shell/README.md) | 二十 tab 壳同批重拍；r43→r44 changed=6 / same=14，如实披露；R44 当前哈希块在场 | e2e「r43 截图·二十 tab 壳同批重拍 20 张」 |

## 证据口径

- 7/7 矩阵 SHA256 互异、20/20 壳互异、矩阵↔壳交叉重叠 0；全库 **372 PNG / 370 互异**（同态组仅 r4 已披露 2 组）。
- 逐张 `read_image` 目验 27 张；05 表单时段与冲突原因放大逐字一致，07 错误帧无开发命令。
- 最终哈希块：[r43 矩阵索引](../r43/README.md) R43_HASHES_BEGIN/END（7 条全 SHA256）与
  [shell 索引](../shell/README.md) R44_HASHES_BEGIN/END（20 条，8 位缩写）。
  本轮重拍对象为 `docs/ui/r43/05-recommend-conflicts.png` 与 `docs/ui/r43/07-recommend-error.png`（连同全批）。
- U3 口径修正已落 shell 索引：r41→r43 changed=6 / same=14（原误写 8/12）、全库计数归位（R43 块 372/370、R41 历史块 365/363）、
  当前表图注「r37 徽章」→「纯用户文案徽章」。
