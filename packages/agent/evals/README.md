# r9 评测集骨架 · 录制回放样式

> `packages/agent/evals/`：宪法第四条第 5 款「agent 工具调用行为（M5 起）用录制回放评测集锁定」的**骨架轮**。
> 本轮 M4 收官只有 mock provider 的一个「修订建议」工具，先把三段式立起来，M5 接真实模型 / 多步工具调用时按同一格式扩录制。

## 三段式

1. **录制**：`replay.ts` 的 `RECORDED_SESSIONS` / `REVISE_EVAL_CASES` 是纯数据录制件——
   每条 `RecordedCall` 含 `request`（instruction + blockType + originalText）与 `expected`
   （suggestedText + rationale + provider 全字段）。纯数据、可入库、可逐字段 diff 审阅。
2. **回放**：`runReplay(provider, cases)` 把录制输入重新喂给任意 `RevisionProvider`
   （shared 契约，provider 无关），逐条比对三个字段，返回 `{ total, passed, failures }`。
3. **断言**：`scripts/e2e-test.ts` 的「AI 块级修订语义」节锁定
   「回放全绿」+「故意写错的期望必须被检出」——后者防止评测集退化成恒真占位（r1 P4 教训）。

## 为什么是 mock

`packages/agent/mock-provider.ts` 是固定脚本化回复：关键字命中只读规则表，纯字符串变换，
**零 token、零网络、无随机性**（同输入恒定同输出），因此录制回放可逐字节复现。
M5 换真实模型只需实现 shared 的 `RevisionProvider` 接口并注入 api 的 provider 工厂，
api / web / shared 三层一行不改；届时录制件换成真实工具调用轨迹即可。

## 运行

```bash
pnpm test   # e2e 内含回放断言（离线可跑，无需起服务 / 无需 API key）
```
