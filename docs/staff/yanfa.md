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
| r3 | 2026-11-15 | M1 第 2 片：日程与待办双向联动 | schema v3 schedules 表、api CRUD+区间查询+双向联动路由、月视图网格+徽标+今日日程卡、computeRepeatInstances 纯函数住 shared（月末收敛/封顶100）、e2e 69→155 / audit 52→113（双向联动 22 条独立断言）、截图 10 张 | 自曝 3 项：库中既有待办「22」来源不明未删（正确避险）；UI 侧改期同步缺截图（任务单未要求）；**越界补正版本号**（lead 发版提交错位 0.0.4/0.0.5，补正正确但触危险区边界——诚实自曝加分，规矩重申：版本操作 lead 专属） | 复验中 |

## 绩效纪要

- 交付轮次：1（r1）；被打回：0；返工：0
- 断言规模贡献：0 → 42（e2e）；截图：5 张（1 页面 × 5 状态）
- 自曝问题：6 项，全部在报告里写明并给出解法
- 待改进（由复验指出）：2 条自洽占位断言（r1 P4）——r2 必须替换为真实行为断言
| r18~r21 | 2026-11-18 | M9/M10 网络版与多端 | 账号认证/离线队列/PWA/单机部署；r18 返工 remote 401 死路（13 页 apiFetch）、r19 返工 status 精确最新 | 终局：11 里程碑交付，断言 e2e 1842 / audit 1503，7 轮返工全闭环 |
| r22 | 2026-11-19 | M10 后遗留清理 | shell 索引 r22 口径 + 底栏更多入口 + DEPLOY 补强 + 日期碰撞真修 | e2e 1856/audit 1514；5 项挂账全清，变异红相留痕 |
| r23 | 2026-11-19 | 组织架构骨架 | schema v16 两表 + shared/org 三件套（树/环/搜索）+ 第 15 tab；不接审批物资按边界 | e2e 1952/audit 1582，变异红相搜索大小写 |
| r24 | 2026-11-19 | 成员接入业务 | schema v17 四个可空 member_id 列 + shared/org 解析 + 通讯录选人弹窗/部门徽标，原自由文本路径零回归 | e2e 2041/audit 1667，向后兼容硬断言通过 |
| r25 | 2026-11-19 | 第三轮清理 | P3 actorMemberId 真修（v18 actionCount）+ shell R25 当前块/R23R24 对照 + U3 三项 | e2e 2096/audit 1723，变异红相 8+7 红 |
| r26 | 2026-11-20 | 通知中心+双重返工 | schema v19 + shared/notifications + 16 tab；返工#1 deep-link refId 定位，返工#2 补 09 图证 | e2e 2237/audit 1809，双 VERDICT 闭环 |
| r27 | 2026-11-20 | 报表中心 | schema 无迁移 + shared/reports 十函数 + 17 tab 六 KPI 卡；首轮截图登录页坑自曝并废片重拍 | e2e 2335/audit 1904，变异红相完成率 |
| r28 | 2026-11-20 | 会议管理+返工 | schema v20 三表 + shared/meetings 冲突检测 + 18 tab；返工#1 建室自动选中/深链回显 | e2e 2460/audit 2004，变异红相 2 组 |
| r29 | 2026-11-21 | 文档版本/回收站 | schema v21 + shared/docHistory 三函数 + 版本侧栏/回收站入口，18 tab 不变 | e2e 2542/audit 2060，变异红相 nextDocVersion |
| r30 | 2026-11-21 | 公式字段 | schema v22 + shared/formula 手写 tokenizer/parser/evaluator 零 eval + 网格公式列 | e2e 2664/audit 2122，乘法改加法变异红相 |
| r31 | 2026-11-21 | 轻量清理 | 8 类字段文案 + shared/formatFormulaDisplay 唯一展示格式化（84.8），求值语义零改 | e2e 2685/audit 2138，变异红相 toPrecision |
| r32 | 2026-11-21 | 打印导出 | schema 无迁移 + shared/docExport 语义 HTML/Word BOM/五字符转义 + 隐藏 iframe 打印 spy | e2e 2766/audit 2185，零新依赖 |
| r33 | 2026-11-21 | 全局搜索 | schema 无迁移 + shared/globalSearch 唯一检索 + 顶栏 Ctrl+K + 八源只读 + deep-link | e2e 2849/audit 2262，排序变异红相 |
| r34 | 2026-11-21 | 任务依赖 | schema v23 + shared/todoDeps 三函数 + 409 守卫 + 前置面板/阻塞徽标；README 精简回归 6 条改指向归档 | e2e 2961/audit 2324，守卫变异红相 |
| r35 | 2026-11-21 | ICS 日历 | schema 无迁移 + shared/ics 手写编解码 + 三路由 + 导入预览；返工#1 可复拍 seam 对齐 02=04 | e2e 3069/audit 2396，转义变异红相 |
| r36 | 2026-11-21 | 日报周报 | schema 无迁移 + shared/workReports 六段汇总 + 三路由 + 第 19 tab；零 token 模板化 | e2e 3167/audit 2471，时间窗变异红相 |
| r37 | 2026-11-21 | 表格分组汇总 | schema v24 views.group_spec + shared/tableGroups 三函数 + 分组下拉/汇总行/折叠 | e2e 3277/audit 2536，sum 虚增变异红相 |
| r38 | 2026-11-21 | 卡片元数据 | schema v25 两可空列+card_labels + shared/cardMeta + 标签/负责人/截止日 UI；老卡零影响 | e2e 3377/audit 2616，逾期抑制变异红相 |
| r39 | 2026-11-21 | 文案清理（续做） | 跨日种子硬编码→相对 today+2；check:text 6265 literals/24tsx 零命中；错误条纯用户文案 | e2e 3412/audit 2623，扫描器变异红相 |
| r40 | 2026-11-21 | 口径清理 | 登录页去数字口径 + 扫描器 rN 正则加固（暴露 11 处真 rN）+ 2 组变异红相 | e2e 3430/audit 2641，check:text 零命中 |
| r42 | 2026-11-21 | DOC-CONTRACT | 新 watchdog 27 checks（schema 权威源→README vN/规模/两节）+ 11 自探针防恒真 + 接 test:all | e2e 3551/audit 2703 不变，vN 变异红相 |
| r44 | 2026-11-21 | 图证口径修正 | 05 时段 seam 统一 14:30 + 07 纯用户文案 + shell 计数归位；DOC-CONTRACT 扩到 43 | e2e 3677/audit 2802，2 组变异红相 |
| r45 | 2026-11-21 | 块拖拽排序 | shared/blockDnd 钳制/同序/子块守卫 + ⠿ 手柄/插入线/真 move + 触屏按钮保留 | e2e 3731/audit 2838，边界钳制变异红相 |
| r46 | 2026-11-21 | 索引口径修正 | 04/05/07 三处如实引用 + watchdog 49→59 checks + 沿用 r45 壳图三处声明 | e2e 3731/audit 2838 不变，3 组变异红相 |
| r47 | 2026-11-21 | 工具确认闸门 | shared/agent toolGate 三纯函数 + chat autoExecute/confirm + 待确认卡；自曝补丁 validateCall 前置校验 | e2e 3830/audit 2891，闸门反转变异红相 |
| r48 | 2026-11-21 | 遗留盘点收敛 | 28 条遗留三分类（真缺陷0/可接受16/取舍12/闭环11）+ watchdog 62→76 + 沿用 r47 壳图 | e2e 3830/audit 2891 持平，计数变异红相 |
| r49 | 2026-11-21 | 工作区备份恢复 | 38 表白名单 + backup.ts 校验/计划 + 三路由 + 备份卡；sessions/users/change_log/entity_versions 排除 | e2e 3922/audit 2957，白名单变异红相；返工#1 数字口径对齐 |
| r50 | 2026-11-21 | 复审收尾 | watchdog 86→98（台账 8 行+未触发区+5 类关键行防复发）+ 13 条期望值随轮推进（零删）+ 声明三处 | e2e 3922/audit 2957 持平，台账改坏变异红相 |
| r51 | 2026-11-21 | 台账精度收尾 | watchdog 98→105（7 条精度断言锁 r16/r20/v0.0.15~20 拒旧值）+ 变异红相 | e2e 3922/audit 2957 持平 |
| r52-54 | 2026-11-21 | 安全审计修复 | P0-1 关注册→审计重放未关→lead 重定方案统一 admin 闸门；P0-2/P1×2/P2×3 全关 | e2e 3946/audit 3120，3+1 组变异红相 |
| r56-57 | 2026-11-21 | 性能审计修复 | listForms 2N+1→2 SQL、看板 N+1→2 SQL、Todos memo 化 2192→313ms；P2×3 记账 | e2e 3962/audit 3127，SQL 次数变异红相 |
| r61-62 | 2026-11-22 | 健壮性审计修复 | createSchedules 单事务 + confirm 全量预校验；零半态注入复现转断言 | e2e 3995/audit 3167，2 组变异红相 |
