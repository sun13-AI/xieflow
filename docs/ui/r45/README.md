# docs/ui/r45 · 文档块拖拽排序（七张矩阵 + 二十 tab 壳同批重拍）

> 工作目录 `D:\work\好东西\xieflow`。任务单：`docs/plan.md` r45（第 251、955–968 行）。
> 截图脚本：`scripts/shot.ps1 shots -Round r45`（headless CDP，`scripts/r39-shot.mjs` 一次性进程；
> `XIEFLOW_DB_PATH` 走 `scripts/.tmp-r45shot/shot.db` scratch 库，探针文档经真实导入端点种子并在矩阵后软删，
> `data/xieflow.db` 全程未作数据源）。七态由 `DocsPage.tsx` 的 `?shot=docs-dnd-*` 钉态驱动；
> 所有拖放计划 / 落点换算只来自 `shared/blockDnd`，页面与 api 零算法分支。截图像素逐张 `read_image` 目验通过。

| 截图 | 状态与对应断言 |
|---|---|
| 01-dnd-handles.png | 块列表有拖拽手柄：五块混合类型（一级标题 / 正文 / 正文 / 有序列表 / 引用）左侧 ⠿ 全部在场，提示条说明触屏可达路径。e2e「r45 web·拖拽手柄 seam」；audit「r45 GET 块列表 -> 200」 |
| 02-dnd-dragging.png | 拖拽中插入线：源块为第三块，首块上方显示蓝色插入线与圆点（落点槽位 0），源块半透明。e2e「r45 web·插入线 seam」；e2e「r45 计划·第三块拖到首位 position=0」 |
| 03-dnd-dropped.png | 放下后顺序：钉态真发 `POST /api/blocks/:id/move`，「third paragraph」由第 3 位落到第 1 位，两条绿色回执可见。e2e「r45 DB·第三块拖到首位顺序正确」；audit「r45 HTTP move 后顺序逐项正确」 |
| 04-dnd-cross-type.png | 跨类型拖拽：再次真发 move 把正文块移到末位，标题 / 有序列表 / 引用块原位保留，类型标签各不相同。e2e「r45 计划·超尾越界钳制到末位槽」；audit「r45 跨类型拖到末位 -> 200」+「r45 跨类型拖拽 position 仍连号」（r46 U2-1：索引原误引标题落末位的另一场景断言，已按画面改为连号断言） |
| 05-dnd-touch.png | 触屏按钮态：每块右侧 ↑ / ↓ 按钮在场（浅灰描边 + 灰箭头，无额外高亮强调），绿条写明逐格移动，无障碍路径保留。e2e「r45 web·拖拽回执 seam」；audit「r45 同序位置重发 -> 200」（r46 U2-2：索引原称蓝色描边强调，经 Pillow 逐像素与 01 同区零差异，已删） |
| 06-dnd-narrow.png | 窄屏 488px：手柄与 ↑ / ↓ 按钮纵排仍完整可见，底部导航「更多 ›」在场，`?narrow=1` seam 显式钉态。e2e「r45 截图·七张 SHA256 互异」 |
| 07-dnd-error.png | 错误态：真发越界 `position=999999` → HTTP 400，红条逐字为「移动失败（HTTP 400）：重排目标位置非法：999999（共 5 张卡）」，顺序未被改写。audit「r45 4xx·超界 position -> 400」+「r45 4xx 零半态·顺序未被改写」（r46 U2-3：索引原文误写块口径，画面原文为「共 5 张卡」看板词汇混用；用户可见文案统一为块编辑器口径留后续轮，本轮不动代码/截图） |

## R45 哈希自查（七张两两互异，与当前文件逐字一致）

<!-- R45_HASHES_BEGIN -->
`01-dnd-handles=509A79D141A60A2BE8CDF2C2D713C57E9701D0BFF7E1C02DC8C01EADCCCFC079` ·
`02-dnd-dragging=D60F77CDE6EFCD05D57D2B1FCC68C0E0620CC74DBBA030BC5165B3DFEC8CB61F` ·
`03-dnd-dropped=6C0AEFAEA9CA3C6F654F11F5BC72FC450ABA6A6F14A87442A0DA8C2CF2CC2CD2` ·
`04-dnd-cross-type=7DE137F848DDC07062593D96930DDB88D9BA49701C6058E7ABC57D4F83AEA6BF` ·
`05-dnd-touch=277E731C59F71CEC51DC327BE24FC533F26C860A5C48896675DEF7102F5AC657` ·
`06-dnd-narrow=D7B332D1F0510D0B685024784E12FF76B7F1571B3F11B2FA3F9E0667FC015F25` ·
`07-dnd-error=651964BEB6FD2D8B9378A4ECBB17C3A4980E19BBD511A6AFD67AC45645E0E9F9` —— **7/7 互异**。
<!-- R45_HASHES_END -->

> 二十 tab 壳基线同批重拍于 [docs/ui/shell/](../shell/README.md)（20/20 SHA256 互异；r44→r45 changed=9/same=11）；
> 矩阵↔壳重叠 0。全库 **379 PNG / 377 互异**（+7 = 本轮矩阵，壳为同路径替换；同态组仅 r4 已披露 2 组，r45 零新增）。
> 首轮七张一次性捕获成功，无废片入库；探针文档在矩阵后软删，端口全收净。
