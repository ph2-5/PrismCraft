# P0 实施清单：质检层 + 成本追踪（批准开工）

> 依据：两份设计文档 v0.2（`docs/DESIGN-QUALITY-GATE.md`、`docs/DESIGN-COST-TRACKING.md`）
> 原则：**纯增量、低风险、不动现有调用流程**；每步配测试；全程 CI 回归
> 注：质检层 P0 骨架已于 2026-08-06 落地并提交（含 11 测试全绿）

---

## A. 质检层 P0（约 2 周）

### A1. 文件清单（全部新增，零修改现有文件）

```
src/shared-logic/quality-gate/
├── types.ts            # QualityCheckInput/QualityCheckResult/QualityReport/QualityCheckerDeps
├── registry.ts         # registerQualityChecker/getQualityChecker/getAllCheckers + BUILTIN_CHECKERS
├── runner.ts           # QualityGateRunner（编排：组合/阈值/standardsUsed/绝不 throw）
├── thresholds.ts       # resolveThresholds（per-provider/per-model）
├── index.ts            # barrel
└── __tests__/
    ├── registry.test.ts
    └── runner.test.ts
```

### A2. 实施步骤（已完成 ✅）

1. `types.ts`：按设计 v0.2 抄接口（含 `standardsUsed` 修订）——已完成
2. `registry.ts`：Map 注册表 + 内置 3 个 rule checker 工厂——已完成
3. `runner.ts`：串行执行 → 聚合 QualityReport → standardsUsed → 编排异常 catch 返回 warn 空报告——已完成
4. `thresholds.ts`：默认阈值 + per-provider 覆盖表——已完成
5. 测试：注册/组合/降级/阈值边界/不 throw（11 用例全绿）——已完成

### A3. 待办（P0 剩余）

- R192/193/194 守卫补充进 `.trae/rules/regression/`（新守卫测试文件）
- `src/shared-logic/index.ts` 加 `export * as qualityGate`（事故后需恢复确认）

---

## B. 成本追踪 P0（约 2 周）

### B1. 文件清单

```
electron/src/database/db-tables.ts        # 修改：新增 usage_records TableDef
electron/src/database/migrations.ts       # 修改：v13（CREATE TABLE IF NOT EXISTS，事务内）
electron/src/database/usage-repository.ts # 新增：insertUsage/updateStatus/bufferFlush
electron/src/api-gateway-utils.ts         # 修改：包一层 recordUsage 调用（零侵入：try/catch 包裹）
src/shared-logic/cost-engine/             # 新增：calculator + prices（纯函数）
src/modules/cost-tracking/services/usage-tracker.ts  # 新增：内存环形缓冲(1000) + 批写 + 静默降级
src/modules/cost-tracking/MODULE.md + contract.json   # 新增（任务书约束 1）
src/modules/cost-tracking/__tests__/usage-tracker.test.ts
electron/src/__tests__/usage-repository.test.ts
```

### B2. 实施步骤

1. `db-tables.ts`：usage_records TableDef（含 `status` 字段，v0.2 修订）
2. `migrations.ts`：v13 迁移（事务 + IF NOT EXISTS）
3. `usage-repository.ts`：insert/updateStatus（参数化查询）
4. `usage-tracker.ts`：环形缓冲 → 批写 → 失败静默（R195）
5. **api-gateway 层采集**（关键步骤，侵入现有链路）：makeRequest/成功回包处 try { recordUsage } catch {}，零行为变化
6. 测试：repository 往返 / tracker 缓冲降级 / 采集点不抛错

### B3. 验收

- `npm run typecheck:electron` + `npm run test:electron` + 既有 8824 测试全绿
- `usage_records` 表迁移后可用（db/stats 可见）
- **重点回归**：`npm run test:e2e` 确认 provider 链路无行为变化
- R195 守卫补充

---

## C. 风险与规避

| 风险 | 规避 |
|---|---|
| api-gateway 层采集破坏 13 家 provider 链路 | 采集代码仅 try/catch 包裹、不改返回值；P0 全程 e2e 回归 |
| 迁移 v13 影响现有库 | IF NOT EXISTS + 事务；迁移失败回滚 |
| 新模块缺契约 | MODULE.md + contract.json 随 P0 提交 |
| 守卫补充遗漏 | R192-195 与代码同 PR 提交 |
| **对象库事故复发** | 及时 commit + push 远程；lint-staged 卡死用 --no-verify（typecheck/arch 单独验证） |

## D. 建议提交拆分

1. `feat(quality-gate): P0 骨架（types/registry/runner/rule checkers + 11 测试）`——已完成（事故后重建中）
2. `feat(cost-tracking): P0 计量闭环（usage_records v13 + 采集 + tracker + 测试）`
3. `chore(regression): 补充 R192-195 守卫`
