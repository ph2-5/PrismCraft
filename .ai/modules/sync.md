# Sync 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| engine | 🔴 高 | 向量时钟、冲突检测、变更追踪、幂等性保证 |
| presentation | 🟢 低 | UI 组件，独立于 engine |

## 子域依赖图

```
engine ← @/domain/types/sync, @/infrastructure/di, @/shared/db-core
presentation ← @/domain/types/sync, @/shared/ui
```

- `engine` 和 `presentation` 是两个独立子域，互不依赖
- 两者都依赖 `@/domain/types/sync` 中的类型定义

## 常见修改场景

### 1. 新增同步实体类型
- 修改文件：`engine/services/engine.ts`、`engine/services/changelog.ts`
- 检查不变量：INV-1（变更记录必须通过 recordChange）、INV-10（状态变更必须记录 sync_id）
- 测试：`npx vitest run src/modules/sync/engine`

### 2. 修改冲突检测或解决策略
- 修改文件：`engine/services/engine.ts`、`engine/services/vector-clock.ts`
- 检查不变量：INV-2（向量时钟偏序关系）、INV-3（四种冲突策略）、INV-6（同步操作幂等性）
- 测试：`npx vitest run src/modules/sync/engine`

### 3. 修改向量时钟算法
- 修改文件：`engine/services/vector-clock.ts`
- 检查不变量：INV-2（时钟比较必须遵循偏序关系）
- 测试：`npx vitest run src/modules/sync/engine/__tests__/vector-clock.test.ts`

### 4. 修改同步设置 UI 或冲突解决面板
- 修改文件：`presentation/SyncSettingsPanel.tsx`、`presentation/SyncConflictPanel.tsx`
- 检查不变量：INV-7（冲突面板三种解决方式）、INV-8（状态指示器实时反映）
- 测试：`npx vitest run src/modules/sync`

## 内部实现细节（非明确要求不要修改）

- `engine/services/vector-clock.ts` — 向量时钟比较、合并、冲突检测算法
- `engine/services/changelog.ts` — 变更日志记录、recordChange 统一入口
- `engine/services/engine.ts` — 同步引擎核心（推送/拉取/冲突解决）、isRecoveryRunning 防重入
- `engine/sync-config.ts` — DEFAULT_SYNC_CONFIG 默认配置

## 测试验证

- 测试命令：`npx vitest run src/modules/sync`
- 关键测试文件：
  - `engine/__tests__/vector-clock.test.ts` — 向量时钟算法
  - `engine/__tests__/changelog.test.ts` — 变更日志
  - `engine/__tests__/engine.test.ts` — 同步引擎核心
