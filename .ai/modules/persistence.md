# Persistence 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| services | 🔴 高 | 事务性级联删除、乐观锁、本地文件清理顺序 |
| hooks | 🟡 中 | 自动保存并发守卫、重试限制、dirty 状态重标记 |

## 子域依赖图

```
services ← @/shared/db-core, @/shared/sql-safety, @/shared/error-logger, @/domain/types/result
  │
  ▼
hooks ← @/domain/types/result, @/shared/utils/toast-bridge
```

- `services` 是底层子域，提供事务性删除核心服务
- `hooks` 是上层 React hooks 子域，提供自动保存和持久化守护
- 两个子域独立工作，hooks 不依赖 services 的内部实现
- 本模块不依赖其他业务模块（`@/modules/*`）

## 常见修改场景

### 1. 新增级联删除实体类型
- 修改文件：`services/transactional-delete.ts`
- 检查不变量：INV-4（同步清理本地文件）、INV-5（safeTransaction 原子性）、INV-8/INV-9（清理顺序：先收集路径 → 事务删除 → 清理文件）、INV-10（文件清理失败仅 warn 不中断）
- 测试：`npx vitest run src/modules/persistence/services`

### 2. 修改自动保存策略（重试次数、间隔）
- 修改文件：`hooks/use-auto-save.ts`
- 检查不变量：INV-1（MAX_RETRY=3）、INV-2（MIN_INTERVAL=0.5min）、INV-6（savingRef+pendingRef 防并发）、INV-7（onSave 通过 useRef 避免闭包）、INV-11（isDirty 检查）、INV-12（失败时重标记 dirty）
- 测试：`npx vitest run src/modules/persistence`

### 3. 修改持久化守护逻辑
- 修改文件：`hooks/use-persistence-guard.ts`
- 检查不变量：INV-3（cancelledRef 防卸载后保存）、R1（持久化先于状态更新）
- 测试：`npx vitest run src/modules/persistence`

### 4. 修改乐观锁策略
- 修改文件：`hooks/use-auto-save.ts`
- 检查不变量：R42（使用 ON CONFLICT...WHERE timestamp < excluded.timestamp 而非 INSERT OR REPLACE）
- 测试：`npx vitest run src/modules/persistence`

## 内部实现细节（非明确要求不要修改）

- `services/transactional-delete.ts` — 级联删除顺序（收集路径 → 事务删除 → 清理 JSON 引用 → 清理文件）
- `hooks/use-auto-save.ts` — savingRef + pendingRef 并发守卫、isDirty 检查、重标记 dirty
- `hooks/use-persistence-guard.ts` — cancelledRef 卸载保护
- 本地文件清理通过 `window.electronAPI.deleteFile`，不直接操作文件系统

## 测试验证

- 测试命令：`npx vitest run src/modules/persistence`
- 关键测试文件：
  - `services/__tests__/transactional-delete.test.ts` — 级联删除
  - `services/__tests__/r30-atomic-cascade-delete.test.ts` — 原子级联删除
