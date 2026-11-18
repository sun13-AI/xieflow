# docs/ui/r17 —— 物资台账与单位任务流转（M8 收官，8 张；十四 tab 壳基线同批重拍）

> 与实现、根 README 索引、yanfa 报告同一提交。全部由 `scripts/shot.ps1 all -Round r17` 一次性 headless（`--headless=new -WindowStyle Hidden`）产出；seed 的一笔物资与两条任务拍后经 HTTP DELETE 清理归零（assets=0，asset_transactions 级联归零，unit_tasks=0）。
>
> seed 真 id 为 **物资 #1（投影仪，初始库存 5 台，仓库A，张三）/ 任务 #1（年度审计，审计部）+ 子任务 #2（审计子项）**（`AUTOINCREMENT` 不回退，按实图如实记录）。03→04 间真发 `POST /api/assets/1/transactions` 两次（入库 3 + 出库 2，库存 5→8→6，两条流水）；05→06 间真发 `POST /api/unit-tasks/2/transition` 两次（pending→in_progress→done）。

| 文件 | 形态 | 断言对照 / 取证方式 |
|---|---|---|
| 01-assets-empty.png | **物资空态**：十四 tab 壳「物资」激活 + 左栏「这里还没有物资——点『＋ 新建物资』开始建账」+ 首次使用空态钉注；右栏「未选择物资」引导在场、真实 0 条 | e2e「新库物资列表为空」；audit「r17 清理后物资归零」；`?shot=assets-empty` |
| 02-assets-form.png | **建账表单**：物资名称 / 分类（办公用品等五种）/ 初始库存 / 计量单位 / 存放位置 / 保管人六真输入 + 「确认建账」按钮；钉注写明落 assets 表 | audit「r17 POST 物资 -> 201」「r17 POST 物资名回读」；e2e「建账初始库存 5」；`?shot=assets-form` |
| 03-assets-ledger.png | **真实链路·台账有数据**：真物资 #1，库存 5 台、分类设备器材、存放仓库A、保管人张三；左栏列表 + 右栏详情 + 出入库表单 + 空流水引导 | audit「r17 GET 物资详情 -> 200」「r17 建账初始库存 5」；e2e「两笔物资真落库」 |
| 04-tx-timeline.png | **流水时间线**：03→04 间真发入库 3 + 出库 2 两笔，库存变 6 台；时间线两条「出库 / 入库」徽章 + 数量 + 操作人 + 来源→目标 + 逐字时间戳 | audit「r17 入库真落库 5→8」「r17 出库真落库 8→6」「r17 该物资三条流水」；e2e「入库后库存真回写」 |
| 05-unit-tasks-tree.png | **单位任务树**：十四 tab 壳「单位任务」激活；真任务 #1（年度审计，待启动）→ 子任务 #2（审计子项，待启动），三层层级由 `└` 缩进可见；每行四个流转按钮 | audit「r17 GET 任务树 -> 200」「r17 树子节点 id 正确」；e2e「数据层任务树层级正确」；`?shot=tasks-tree` |
| 06-task-transitioned.png | **流转后**：05→06 间真发 `in_progress` + `done` 两次流转，子任务 #2 标签变「已完成」（绿色），选中详情面板显示后果提示「done / cancelled 为终态不可回退」 | audit「r17 流转到 done」「r17 终态回退 -> 400」；e2e「in_progress→done 合法」「终态不可回退」 |
| 07-narrow.png | 窄屏 488×1100（`?narrow=1`）：**十四药丸单行不折行**（第十三枚物资 + 第十四枚单位任务完整可见，r17 进一步收窄至 7px/2px），徽章独占下一行；物资列表 / 详情纵排 | 无独立数字断言（CSS 断点，确定性钉态，逐张目验；十四 tab 壳基线同批重拍） |
| 08-error.png | 错误态（语义化文案「服务未启动或网络异常，请稍后重试」+ 十四 tab 壳「物资」激活，钉态） | 无独立断言（4xx 由 audit r17 节锁定）；`?shot=assets-error` |

## SHA256 自查（全 8 位前缀）

`01=A554DCDE` · `02=E8D0DAF6` · `03=707E1BD0` · `04=3F320828` · `05=26398F66` · `06=D7F3D00C` · `07=86827ECD` · `08=70E40B41` —— **8/8 两两互异**。

十四 tab 壳基线（`docs/ui/shell/`，同批重拍）：`workbench=CE038E7B` · `todos=076CC989` · `schedules=F46B74C7` · `projects=5E462372` · `board=A62A1539` · `bases=97D550AA` · `docs=FB5236B8` · `chat=B4DFF6DF` · `knowledge=96DDFAD0` · `mindmap=EBEA940D` · `whiteboard=6BDF7848` · `approval=8D097800` · `assets=F86A188C` · `unit-tasks=D3FFF776` —— **14/14 互异**；与 r16 十二张逐位全异（徽章推进 r17 + 工作台 schema v13/M8 收官 + 新增两 tab）；矩阵任一图与壳任一图不同字节。全库 `docs/ui` **160 PNG / 158 互异**，同态组仅 r4 已披露 2 组（`9E5C0C23` / `8397A028`），r17 零新增。

## 目验与取证注记

8 张逐张 `read_image` 目验（中文无乱码、无塌陷）：01 空态两处引导齐备、十四药丸完整；02 六输入与五分类选项清晰；03 真物资 #1 台账三要素与空流水引导同图；04 两条流水徽章 / 数量 / 操作人 / 时间戳逐字可读、库存由 5 变 6；05 父子任务树层级清晰、四流转按钮在场；06 子任务「已完成」绿标与终态后果提示同图可见；07 窄屏十四药丸完整无裁切（7px/2px 收窄后逐枚可见）；08 错误态文案与历史轮同构。

seed：物资 #1 经 `POST /api/assets` 真写，入库/出库经 `POST /api/assets/1/transactions` 真落库；任务 #1/#2 经 `POST /api/unit-tasks` 真写，流转经 `POST /api/unit-tasks/2/transition` 真写；拍后 `DELETE /api/assets/1` 与 `DELETE /api/unit-tasks/1`（子任务 #2 随父删除或独立清理），assets / asset_transactions / unit_tasks 全归零，8787/5173/8788/8792 全 free（headless 全程，无可见窗口）。
