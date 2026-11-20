# docs/ui/r32 · 文档打印导出增强矩阵（HTML 打印版 + Word 兼容）

- 轮次：r32（M10 后第十轮功能补强）。渲染层改动：文档页导出菜单、打印 iframe / 打印预览、HTML / Word 落盘佐证面板、顶栏徽章推进 r32；**18 tab 数量不变**，十八 tab 壳基线同批重拍。
- 拍法：`powershell -File scripts/shot.ps1 all -Round r32`（headless Edge，一次性进程，服务 `up/down` 收净）。种子为**真 HTTP 建文档 + 真 import.md 十种块（含 `<script>` 注入探针）**，全部字节来自运行中的 api；探针文档在矩阵末尾软删。
- 真导出文件落盘（非 PNG，不进矩阵计数）：[document-export.html](document-export.html)（`text/html` 打印版，含 `@media print` / `@page` / 页码 / 转义块）与 [document-export.doc](document-export.doc)（UTF-8 BOM `EF BB BF` + Word HTML-in-doc）。

<!-- R32_HASHES_BEGIN -->
`01-export-menu=6A0518FE` · `02-print-preview=59CD89E2` · `03-html-landing=D6FCDC3C` ·
`04-word-landing=691FF534` · `05-narrow=B2065443` · `06-error=E36FCC06` —— **6/6 互异**。
<!-- R32_HASHES_END -->

| 图 | 形态 | 对应断言 / 证据 |
|---|---|---|
| [01-export-menu.png](docs/ui/r32/01-export-menu.png) | 文档页导出菜单展开：导出 .md / 导出 ▾ / 打印 / 另存为 PDF / 下载 Word(.doc) / 打开 HTML 打印版；十种块文档在编辑器内 | e2e「r32 web·导出菜单入口在场」「打印/另存 PDF 与下载 Word 两个菜单项在场」；audit「探针文档十种块」 |
| [02-print-preview.png](docs/ui/r32/02-print-preview.png) | 打印预览覆盖层 + `打印 spy：N 次调用` 绿条；headless 只计数不弹系统对话框 | e2e「headless 打印 spy seam 在场」；CDP 全链路「print spy recorded N call(s)」 |
| [03-html-landing.png](docs/ui/r32/03-html-landing.png) | HTML 打印版落盘佐证：真 `/print-preview` 元信息（块数 / 生成时间）+ HTML 片段原文 | e2e「预览·直接携带可打印 HTML」；audit「export.html DOCTYPE / @media print / 十块顺序 / XSS 转义」 |
| [04-word-landing.png](docs/ui/r32/04-word-landing.png) | Word 落盘佐证：真 `/export.doc` 字节数、`BOM EF BB BF`、`application/msword` 与 Word 条件注释片段 | e2e「Word·UTF-8 BOM / base64 自证」；audit「Word 命名空间 / WordSection1 / 页码域码 / 正文不丢」 |
| [05-narrow.png](docs/ui/r32/05-narrow.png) | 488×1100 窄屏导出菜单钉态（`?narrow=1` 显式钉态，不赌视口宽度） | e2e「矩阵与壳基线零重叠」；截图脚本 `05-narrow` 钉态 |
| [06-error.png](docs/ui/r32/06-error.png) | 真 4xx 错误态：`GET /api/documents/99999999/export.html` 的 HTTP 状态码与响应体 | audit「越权 id 导出 HTML -> 404」；e2e「空文档/非法块守卫」 |

- SHA256 亲算：矩阵 6/6 互异，十八 tab 壳 18/18 互异，矩阵↔壳重叠 0；全库 **306 PNG / 304 互异**（r31 为 300/298，+6 = 本轮矩阵新增；同态组仅 r4 已披露 2 组，r32 零新增）。
- 与 r31 十八张同名壳逐名全异（徽章推进 r32 + 文档页导出菜单等渲染层变化），不伪造「同态」。
- 逐张 `read_image` 目验记录见 `docs/feedback/2026-11-21-r32-yanfa.md`。
