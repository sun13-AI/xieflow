# r42 截图索引 — README 版本号自动校验 watchdog（无渲染层改动）

- 轮次：r42（M10 后·文档契约 watchdog）；交付：新增 `scripts/check-doc-contract.ts`，接入 `pnpm run test:all`（与 `check:text` 并列）；零新依赖、零 token。
- **本轮无渲染层改动**（`apps/web/` 零改动，徽章仍为 r41），故截图不重拍：**沿用 r41 壳图**（`docs/ui/shell/` 二十 tab 壳基线 + `docs/ui/r41/` 七张矩阵），按 r21 U2-1 先例在此与根 README、shell 索引三处透明声明。
- 证据类型：DOC-CONTRACT 套件输出（权威源 SCHEMA_VERSION / CI smoke 正则 → README 两处 vN 文案、速查行 e2e/audit 数字、两节当前轮存在性）+ 变异红相留痕（README v26→v25 即红、逐字节还原全绿）；无 UI 形态，证据为断言输出。
- 本轮不新增截图目录图片；r41 矩阵与壳图仍是当前界面基线的唯一证据，链接见根 README「界面与测试对照」与 [shell 索引](../shell/README.md)。
