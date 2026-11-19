# docs/ui/r22 · M10 后遗留清理与质量收敛（3 张 + 十四 tab 壳基线同批重拍）

- 范围：改渲染层（`apps/web/src/App.tsx` + `styles.css`）——≤600px 底栏右侧渐隐遮罩 + 「更多 ›」按钮，☰/更多共用一条开合状态；徽章推进 r22「遗留清理与质量收敛（M10 后）」。无新 tab。
- 与 r21 口径：r21 未改渲染层、壳基线沿用 r20 字节（ui 报告 U2-1）；本轮按宪法第一条对十四 tab 壳基线**同批重拍**，与 r21（=r20 字节）逐位全异，U2-1 闭合。
- 断言：`pnpm run test:all` 全绿；e2e **1856**（+14）/ audit **1514**（+11）。移动「更多」显隐条件做变异红相（恒 false → seam 断言变红 → 逐字节还原全绿），见 `docs/feedback/2026-11-19-r22-yanfa.md`。

## 逐图索引

| 截图 | 形态 | 对应断言 / 拍摄方式 |
|---|---|---|
| 01-mobile-390-more.png | **真 390×844**：顶栏 ☰ + r22 徽章 + 在线状态区；底部固定导航右侧渐隐遮罩 + 「更多 ›」入口，收起态可见前 6 枚 tab；正文单列、零横向溢出（`scrollWidth=clientWidth=390`） | CDP `Emulation.setDeviceMetricsOverride`（390×844×1, mobile+touch）真 390 CSS px；e2e「更多按钮在菜单未展开时可见 / 底栏渐隐遮罩在场 / data-state seam」 |
| 02-mobile-390-nav-open.png | **真 390×844**：点「更多」/☰ 后 `html.nav-open`，底栏切为 2 列网格，14 枚 tab 全部可见（末枚「单位任务」在场）；「更多」入口自动隐藏 | `?shot=ready&nav=open` 确定性钉态 + CDP 真 390px；e2e「更多按钮在菜单展开时隐藏 / 菜单展开时隐藏更多按钮」 |
| 03-narrow-docs-more.png | 488×900 `?narrow=1&page=docs`：受影响页面矩阵——文档页单列 + 底栏「更多 ›」入口在场，文档 tab 激活 | `shot.ps1 shots -Round r22` 的 `force-narrow` seam；r1~r21 窄屏 seam 继承 |
| shell/（14 张） | 十四 tab 壳基线同批重拍，r22 徽章 + 更多入口 DOM seam + 顶栏状态区 | `Invoke-ShellBaseline`；哈希与形态逐行见 `docs/ui/shell/README.md` |

## SHA256 自查

矩阵 3 张：`01=95A4FF69` · `02=5CA1E30D` · `03=9328492F` —— **3/3 互异**；与 `docs/ui/shell/` 十四张交叉重叠 0 张。
壳基线 14 张 `98E4FDEB / 60DDBAD6 / EB33939D / 36942D51 / 63761823 / 4B48E863 / 870E4715 / 30576CCF / B5ABFFD2 / EC700171 / 278C23F4 / 3DB8682C / E441E8FE / 1C96C496` —— **14/14 互异**，与 r21（=r20）零重叠。
全库 **235 PNG / 233 互异**（同态组仅 r4 已披露 2 组，r22 零新增）；逐张 `read_image` 目验：中文无乱码、无裁切、无塌陷，390px 下「更多」入口与展开态 14 tab 清晰可辨。

## 拍摄方式例外（诚实记账）

r20 06 已记录：headless `--window-size=390,844` 把布局视口钳到 500px。本轮 01/02 沿用 CDP device metrics 真 390px 截取（与 r20 同款例外），03 走 `shot.ps1` 的 `?narrow=1` 488px seam。三张均来自 headless 进程，无可见窗口；tmp-dir 中转的 CDP 图复制入库后已清理。
