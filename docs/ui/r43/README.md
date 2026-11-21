# docs/ui/r43 · 会议室设备与智能推荐（七张矩阵 + 二十 tab 壳同批重拍）

> 工作目录 `D:\work\好东西\xieflow`。任务单：`docs/plan.md` r43（第 249、925–940 行）。
> 截图脚本：`scripts/shot.ps1 shots -Round r43`（headless CDP，`scripts/r39-shot.mjs` 一次性进程；
> `XIEFLOW_DB_PATH` 走 `scripts/.tmp-r43shot/shot.db` scratch 库并删除，`data/xieflow.db` 全程未作数据源）。
> 全部七态由 `MeetingsPage.tsx` 的 `?shot=` 钉态驱动；设备/推荐规则只来自 `shared/roomRecommend`，
> 页面零算法分支。截图像素逐张 `read_image` 目验通过。

| 截图 | 状态与对应断言 |
|---|---|
| 01-equipment-empty.png | 存量会议室无设备：`暂无设备` 空态徽标（四室全空）。e2e「r43 设备·NULL 归一为空」；audit「建室不传设备默认空数组」 |
| 02-equipment-badges.png | 设备徽标：投影/白板/视频会议/电话会议按白名单顺序展示，停用室灰化。e2e「r43 web·设备徽标 seam」；audit「会议室列表设备字段真回带」 |
| 03-recommend-panel.png | 预约表单「帮我推荐」面板：人数 8、四项设备勾选、时段、按钮。e2e「r43 web·帮我推荐按钮 seam」；audit「GET /api/rooms/recommend -> 200」 |
| 04-recommend-results.png | 推荐结果：8 人+投影 → 可用 2 间（8 座在前、12 座在后），不可用 2 间含容量/设备/停用原因。e2e「r43 推荐·容量最接近升序」；audit「手算·按容量最接近升序」 |
| 05-recommend-conflicts.png | 冲突原因：14:30–15:00 → 中会议室给「时段冲突：会议 #21 14:00–15:30 已占用」，小室/停用室各自给原因。e2e「r43 原因·按序给全」；audit「冲突原因·回带冲突会议 id」 |
| 06-recommend-narrow.png | 窄屏 488px：会议室纵排 + 底部导航「更多 ›」，`?narrow=1` seam 显式钉态。e2e「r43 截图·七张 SHA256 互异」 |
| 07-recommend-error.png | 错误态：非法需求红条「参会人数必须是 1..1000 的整数」。e2e「r43 需求·非法设备被拒」；audit「4xx·非法设备 -> 400」 |

## R43 哈希自查（七张两两互异，与当前文件逐字一致）

<!-- R43_HASHES_BEGIN -->
`01-equipment-empty=E58DF088650D413494CF7923CA20EA1465C99071D9F116E9D1148370E1DDA07E` ·
`02-equipment-badges=38FA7ABE3A545953C4E9EBE1D329B213944EF16E7302AC70D5B8B97068CBBD24` ·
`03-recommend-panel=4F316D89431928B0447E2458111D7FE691305690F58E0D0CA4DE85F97CE02CDF` ·
`04-recommend-results=9F660504BA8A9D4EC10B051B7C6D5CCE3E81DDA63895B67B50251AC42B0FC2DD` ·
`05-recommend-conflicts=EEC63FE4D689F68FA3BA53814E380A8D46F3F44783FB3CF4B2665FC4DBA12A53` ·
`06-recommend-narrow=9FBEF86B24A04B6FD7C01C700CDBAD691255926B70A0C306FE2E8C4ED55591DD` ·
`07-recommend-error=84FCF1C3B6D45C70429CEB40AA4B64F3C778D6B498AB6B7FC4DFFCE26651867C` —— **7/7 互异**。
<!-- R43_HASHES_END -->

> 二十 tab 壳基线同批重拍于 [docs/ui/shell/](../shell/README.md)（20/20 SHA256 互异）；
> 矩阵↔壳重叠 0。首轮 04/05 结果面板被 900px 视口截断、07 错误红条空白，
> 已全批重拍修正（04/05 改 1300px，07 渲染 `error || recommendError`），废片未入库。
