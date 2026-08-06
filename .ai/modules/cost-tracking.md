# Cost-Tracking 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| 采集链路（主进程：api-gateway\*.ts / services/usage-tracker.ts / database/usage-repository.ts） | 🟡 中 | 侵入 13 家 provider 生成链路；改动必须保证零行为变化（R195：try/catch 包裹、不改返回值） |
| usage_records 表（migrations v13） | 🟢 低 | CREATE TABLE IF NOT EXISTS + 事务迁移；失败回滚 |

## 架构位置

```
渲染进程（src/modules/cost-tracking/）        ← P1 看板 UI（当前仅占位）
    ↕ HTTP
主进程
  api-gateway.ts / -image.ts / -text.ts       ← 采集点（成功/失败路径各 record 一次）
  services/usage-tracker.ts                   ← 环形缓冲(1000) + 5s 批写 + 静默降级
  database/usage-repository.ts                ← insertUsageBatch/updateUsageStatus/aggregateUsage
  usage_records 表（SQLite v13 + 3 索引）
```

## 关键约束（改动前必读）

1. **R195 铁律**：记录失败绝不阻塞生成主流程——采集代码只允许 try/catch 包裹，禁止修改 provider 调用返回值；
2. **采集点固定**：主进程 api-gateway 层（v0.2 评审决策），不要在渲染进程薄客户端加采集（参数不全 + 跨进程写库）；
3. **status 语义**：succeeded=已扣费 / failed=多数平台不扣费（看板双口径依据），任务级成败联动是 P1 工作；
4. **契约**：本模块 contract.json publicAPI 当前为空（P0 无渲染导出）；P1 加看板服务时同步更新；
5. **估算口径**：成本估算走 shared-logic/cost-engine（P1），禁止在业务代码另写计算逻辑（两套口径违规）。

## 测试

- `electron/src/database/__tests__/usage-repository.test.ts`（10 用例：参数化/批量/状态更新/聚合/不 throw）
- `electron/src/services/__tests__/usage-tracker.test.ts`（6 用例：缓冲/批写/满丢弃/flush/绝不 throw）
- 运行：`node node_modules/vitest/vitest.mjs run --config vitest.config.electron.ts <文件>`
