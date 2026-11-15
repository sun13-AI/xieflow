# 研发视角（yanfa）· 员工档案

> 编制见 workflows/org.md。提示词：workflows/yanfa-prompt.md。

## 岗位章程

- **使命**：按任务单交付可复验的最小切片；行为先有断言再有实现。
- **义务**：TDD；改了渲染层必带截图矩阵（同一提交）；断言真实化（禁恒真式/手动 throw 凑数）；状态机只写在 packages/shared；schema 变更只走 user_version 迁移。
- **权限边界**：本地提交（r<N>: …）；**不 push、不打 tag、不改版本号**（危险区，lead 专用）；不读/不改其他岗位的报告。
- **交付物**：代码 + 断言 + 截图矩阵 + docs/feedback/<日期>-r<N>-yanfa.md（三态纪律）。
- **诚信条款**：自曝实现问题（诚实加分，隐瞒扣分）；没做的必须写明原因。

## 工作履历

| 轮次 | 日期 | 任务 | 关键产出 | 自曝问题 | 裁决 |
|---|---|---|---|---|---|
| r1 | 2026-11-15 | M0 仓库骨架 | 四包 monorepo（shared/db/web/api）、迁移 v1→v2、状态机集中、健康探针、42 断言、5 张截图、CI 定义 | 6 项：pnpm 11 弃用 onlyBuiltDependencies、CJS 包 ESM 导入、根 package.json 缺 type:module、PS 5.1 编码、SQLite 不拦空串、Windows DPR 影响截图断点 | VERDICT 通过（另补 P1 修复） |
| r2 | 2026-11-15 | M1 第 1 片（续做轮 + 返工 #1） | 接手中断半成品续完：待办页四象限 UI（弹窗/流转/计数卡）、audit-http 0→51、e2e 42→66、截图 6 张、test:all 接入 audit（run-ps1.js 包装器） | 自曝 2 项：分离进程 api 静默死亡（lead 定根因：僵尸进程抢端口）、CI 三平台 audit 实跑待实证 | 初验双打回（waizhuan P1/P3/P5 + ui U1×2/U2）→ 返工 #1（5b0422c）：P3 语义化错误文案、标题 200 上限 TDD 先红后绿、补 4 张形态图、U2 页脚清理 → 双 VERDICT 通过 |
| r2 返工#1 | 2026-11-15 | 双打回清单 A~G | 断言 e2e 66→69 / audit 51→52；截图矩阵 6→10 张；httpClient 语义化翻译；MAX_TODO_TITLE=200 全链路 | 顺带发现 waizhuan 残留 9 条测试数据（log 无 DELETE 记录），已清零复查 | 双 VERDICT 通过 |

## 绩效纪要

- 交付轮次：1（r1）；被打回：0；返工：0
- 断言规模贡献：0 → 42（e2e）；截图：5 张（1 页面 × 5 状态）
- 自曝问题：6 项，全部在报告里写明并给出解法
- 待改进（由复验指出）：2 条自洽占位断言（r1 P4）——r2 必须替换为真实行为断言
