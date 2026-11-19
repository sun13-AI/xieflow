# docs/ui/r23 · 组织架构与通讯录（7 张 + 十五 tab 壳基线同批重拍）

- 范围：新增 `apps/web/src/OrgPage.tsx`（「组织」tab：左侧部门树展开折叠 + 右侧人员卡片 + 新建/编辑表单 + 搜索），徽章推进 r23「组织架构与通讯录（M10 后）」；壳基线由十四张扩为**十五张**（补 `org-tab-active.png` 并同批重拍旧十四张），与 r22 逐位全异。
- 边界：本轮不把 members 接入审批/物资，既有模块零改动；真实 CRUD / 环检测 / 大小写不敏感搜索由 e2e + audit 锁定，截图钉态使用示例数据（与 r16 审批钉态同款，画面形态证据）。
- 断言：`pnpm run test:all` 全绿；e2e **1952**（+96）/ audit **1582**（+68）。变异红相 1 组（搜索大小写敏感化 → 双套件红 → 逐字节还原），见 `docs/feedback/2026-11-19-r23-yanfa.md`。

## 逐图索引

| 截图 | 形态 | 对应断言 / 拍摄方式 |
|---|---|---|
| 01-org-empty.png | 1280×800 `?page=org&shot=org-empty`：空组织目录——部门树空态 + 人员空态 + 新建部门/人员按钮在场 | `shot.ps1 shots -Round r23` 钉态；e2e「r23 组织页空态 seam」 |
| 02-org-tree.png | 1280×800：三级部门树全部展开（集团总部→研发中心→前端组/后端组，市场部同级），右侧人员卡片 4 张 | `?shot=org-tree`；e2e「r23 shared buildDepartmentTree 装配 / 树 seam」 |
| 03-org-members.png | 1280×800：人员卡片列表（姓名/状态/职位/部门/角色/邮箱/电话 + 编辑删除），部门树收起研发中心 | `?shot=org-list`；e2e「r23 人员卡片 seam」 |
| 04-org-form.png | 1280×800：新建人员表单弹窗（名称/邮箱/部门/角色/职位/电话/状态 + 保存/取消） | `?shot=org-form`；e2e「r23 表单 seam」 |
| 05-org-search.png | 1280×800：搜索框输入 `engineer`，命中 3 张职位含 Engineer 的人员卡片（大小写不敏感） | `?shot=org-search`；e2e/audit「姓名·邮箱·职位大小写不敏感搜索」 |
| 06-narrow.png | 488×900 `?narrow=1`：窄屏两栏折为单列，部门树在人员列表上方，底栏「更多 ›」入口在场（r22 更多机制继承） | `shot.ps1` `force-narrow` seam；e2e「r23 窄屏 seam」 |
| 07-error.png | 1280×800：服务不可用错误态（错误文案 + 重试按钮），r23 徽章在场 | `?shot=org-error`；e2e「r23 错误态 seam」 |
| shell/（15 张） | 十五 tab 激活态同批重拍，r23 徽章 + 十五枚药丸 + 顶栏状态区；新增 `org-tab-active.png` | `Invoke-ShellBaseline`；哈希与形态逐行见 `docs/ui/shell/README.md` |

## SHA256 自查

矩阵 7 张：`01=C280DE1A` · `02=702A6C17` · `03=D79A2324` · `04=4BB9A323` · `05=514E6EAB` · `06=8D9B0E7D` · `07=32DEF082` —— **7/7 互异**；与 shell/ 交叉重叠 0 张。
壳基线 15 张 `6670358F / 9DE3AB25 / 241D4609 / CEA441BA / 15166FE1 / 7A056D63 / F584CE1B / 39E47012 / D13E8629 / 391064D4 / DA9A75AA / CA7181C5 / 90166EF8 / 2A81BA59 / F017DF9D` —— **15/15 互异**，与 r22 十四张逐位全异（新增组织 tab）。
全库 **243 PNG / 241 互异**（同态组仅 r4 已披露 2 组，r23 零新增）；逐张 `read_image` 目验：中文无乱码、无裁切、无塌陷；窄屏 06 可见「更多 ›」入口与单列布局，15 枚 tab 壳基线激活态清晰可辨。

## 拍摄方式（诚实记账）

7 张矩阵 + 15 张壳基线全部由 `shot.ps1` 的一次性 headless Edge 进程拍摄（`--headless=new` + `-WindowStyle Hidden` + `--virtual-time-budget`），无可见窗口；06 走 `?narrow=1` 488px seam（r1 钉态惯例，不赌 Windows 显示缩放）。组织页的示例数据在 `OrgPage.tsx` 的 `shot` 钉态里构造，真实持久化证据由 headless CDP「用户第一次用」全链路与 audit 真 HTTP 提供，二者不混为一谈。服务与 scratch 库在拍摄后收净。
