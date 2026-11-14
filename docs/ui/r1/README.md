# r1 · 截图矩阵（1 页面 × 5 状态）

截图与实现同一提交（AGENTS.md 第一条）。复拍命令：

```bash
pwsh scripts/shot.ps1 all
```

| 文件 | 状态 | 断言对照 |
|---|---|---|
| 01-loading.png | 加载态 | 无 UI 形态（React 初始 phase） |
| 02-empty.png | 空态 | e2e「新库 settings 为空」 |
| 03-ready.png | 正常态 | e2e「写入后读回 value」+ HTTP 冒烟 |
| 04-error.png | 错误态 | 无 UI 形态（fetchHealth catch 分支） |
| 05-narrow.png | 窄屏（?narrow=1 seam） | 无 UI 形态（CSS 断点） |

已知坑：Windows 显示缩放（125%）下 headless Edge 的 CSS 视口断点不可靠，
窄屏形态用 `?narrow=1` 显式钉住（与媒体查询同一套规则），不依赖视口宽度。
