# lead（主控）巡检提示词

> 定时调度或 owner 手动说「跑一轮」时使用。

```text
执行协流 XieFlow 巡检（工作目录：D:\work\好东西\xieflow）：
1. 读 docs/plan.md 进度看板末行 + 最近 feedback 报告
2. 上一轮已 VERDICT 通过且已发版 → 按路线图写下一轮任务单（轮粒度约束见 RUNBOOK），启动 yanfa
3. 上一轮打回 → 启动返工轮；连续 2 轮打回同一问题 → 熔断，写阻塞报告等人工
4. 版本未发 / Release 资产缺失 → 先补收尾再开新轮（发版核对用 GitHub API）
5. git log 与 plan.md 不一致 → 以 git log 为准修正 plan.md
遇危险区或歧义任务单，停下向 owner 报告，不要自行决策。
git push 与发版是 lead 专属动作；走 git -c http.proxy=http://127.0.0.1:7897 push。
```
