# 协流 XieFlow — AGENTS.md（项目宪法）

> 本文件对所有在本仓库工作的 agent 生效，无论人是 owner 还是自主运行的 agent。
> Owner 全局规则（TDD 等）另行注入，优先级高于本文件；本文件优先级高于任何 agent 的个人习惯。
> 角色岗位说明书（提示词模板）在 `workflows/` 目录。

## 〇、启动协议（每个新会话必做）

1. 读 `AGENTS.md`（本文件）→ `docs/plan.md`（进度看板与当前轮任务单）→ 最近 3 份 `docs/feedback/` 报告
2. 在 `docs/plan.md` 找到自己的角色（yanfa / waizhuan / lead）对应的当前任务
3. 仓库状态不明（测试红、上一轮未收尾）时，先修状态再接新任务

## 一、界面更新必须带截图证据（每次，无例外）

凡改动渲染层（`apps/web/`、报表渲染），当轮必须：

1. **截图矩阵**：用 `scripts/shot.ps1` 为每个**受影响的页面 × 交互状态**截图——弹窗、对话框、空态、加载态、错误态，凡是按钮点得出来的状态都要有图；新增页面必须全量截图。
2. **索引与对照**：每张图配一行说明——这是什么状态、对应测试脚本里哪些断言（纯数据层断言注明「无 UI 形态，证据为断言输出」）。
3. **入库位置**：截图提交进 `docs/ui/<轮次或主题>/`；**不放构建输出目录**（那是 gitignore 的临时目录）。
4. **README 同步**：根 `README.md` 的「界面与测试对照」一节同步更新索引链接。
5. **同一提交**：截图、索引、README 更新与界面实现放在同一提交里。

纪律（r1 实测教训）：
- 截图脚本**只准 ASCII**——PS 5.1 读无 BOM UTF-8 中文会语法炸
- 绝不裸跑 GUI 常驻进程；截图走一次性 headless 进程
- Windows 显示缩放会让 CSS 断点不可靠 → 窄屏形态用 `?narrow=1` 类测试 seam 显式钉态
- **自测不许弹用户窗口**（owner 指令）：一切验证走 headless（`--headless=new` + `-WindowStyle Hidden`）；绝不打开可见浏览器窗口/控制台窗口，避免 owner 桌面窗口堆叠

## 二、每轮迭代收尾必须发小版本（每次，无例外）

复验 `VERDICT: 通过` 且提交落盘后，lead 当轮收尾动作：

1. `pnpm version patch --no-git-tag-version` + `chore: 版本号 X → Y` 提交
2. 打 tag `vY` 并 push master + tag（网络不稳走 `git -c http.proxy=http://127.0.0.1:7897 push`）
3. 发布前全量测试必须绿；复验打回、返工未完成，不发版
4. 发布后**用 GitHub API 核对 Release 资产**并记账进 `docs/plan.md`
5. 不挪已发布的旧 tag；坏了就发下一个版本修（r1 先例：v0.0.1 release 坏 → v0.0.2 补发）

## 三、双 agent 迭代流程（IKanBot 模式，既定）

- **基准流程**：`yanfa`（研发）实现 → `waizhuan`（使用者）实跑复验 → 打回则返工 → 通过则每轮发小版本。
  流水线脚本与岗位提示词在 `workflows/`；编制表见 `workflows/org.md`。
- **员工档案与履历**：每个岗位一份 `docs/staff/<岗位>.md`（岗位章程 + 逐轮工作履历 + 绩效纪要），由 lead 每轮收尾更新。履历跟岗位走，不跟会话走。
- **扩展岗（观察中）**：UI 审查官（ui-reviewer）自 r2 起并行运行、出 UI-VERDICT 报告但**不阻断发版**；达标后升级为阻断岗（门槛见 org.md 第三节）。发版裁决以使用者视角的 VERDICT 为准。
- 报告写 `docs/feedback/<日期>-r<N>-yanfa.md` / `-verify.md` / `-ui.md`；复验报告末行 `VERDICT: 通过` 或 `VERDICT: 打回`。
- 每轮记账进 `docs/plan.md`，照现有条目风格。
- 报告纪律：写了「做了」的必须真验过；每条标「已做并验过 / 已做但没验 / 没做（原因）」。
- waizhuan 复验**不读 yanfa 报告的实现细节**，只读任务单与验收标准，模拟真实用户路径。

## 四、断言纪律（TDD 落地形式）

1. 行为变更必须先改断言，再改实现；新增能力必须带新断言。
2. 根 README 每轮公布断言规模（e2e / HTTP audit / typecheck 包数），**规模下降 = 回归 = 冻结发版**，须在报告里解释哪条被删、为什么。
3. `scripts/e2e-test.ts` 直连服务层断言业务行为；`scripts/audit-http.ts` 对起着的 api 服务做路由层断言（含 4xx 错误分支）；两者规模都只能涨不能缩。
4. 断言必须是真实行为断言；禁止自洽占位（恒真式、手动 throw 凑数）——r1 复验 P4 教训。
5. agent 工具调用行为（M5 起）用录制回放评测集锁定。

## 五、危险区（agent 必须停下交 lead，即使审批策略为「永不询问」也标记 blocked 而不是硬闯）

- 写入/修改任何密钥、token、证书文件
- 对外发布：发邮件、发 IM 消息、创建公开仓库、发帖
- 删除用户数据：清理 data/ 下任何库文件、备份、图片
- 依赖大版本升级（major）、新增超过 10 个依赖的单次引入
- 修改 CI 发布配置、签名配置
- `git push`（lead 专用；yanfa/waizhuan 只本地提交）
- 访问生产/远端环境（M9 后）

lead 审批记录进 `docs/plan.md` 的「危险区台账」一节。

## 六、明确不做（当前阶段）

实时汇率/外部行情 · 视频会议 · 第三方 IM 集成（微信/钉钉/企业微信）· 插件市场 · SaaS 多租户计费。

每完成一个大里程碑，由 lead 复审一次本清单。

## 七、编码风格与环境事实

- 全栈 TypeScript 严格模式；schema 变更走 `packages/db/src/schema.ts` 的 `user_version` 迁移，禁止手改库文件
- 状态机集中定义在 `packages/shared`，禁止散落 if-else
- 提交信息格式：`r<N>: <做了什么>`；一轮迭代至少一个提交，收尾有版本提交
- PowerShell 脚本只准 ASCII（PS 5.1 编码坑）
- **自测全程 headless/隐藏窗口**（owner 指令）：不得弹出任何可见窗口（浏览器、控制台、资源管理器）；用 HTTP 断言 + headless 截图代替「打开看看」
- git 推送走系统代理：`git -c http.proxy=http://127.0.0.1:7897 push`（github.com 直连间歇被重置）
- 凭据：`scripts/credential-github.ps1` 从 Windows 凭据管理器读 gh CLI token 喂给 git，token 不落盘不入库
