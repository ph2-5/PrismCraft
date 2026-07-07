# Character 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| services | 🟢 低 | 标准 CRUD + Result 模式，逻辑简单 |
| hooks | 🟡 中 | 异步图片生成回调需验证实体 ID、AI 合并策略 |

## 子域依赖图

```
services ← @/domain/schemas, @/domain/types, @/infrastructure/di, @/shared/event-types
  │
  ▼
hooks ← services, @/domain/schemas, @/domain/types, @/shared/event-types
  │
  ▼
presentation ← hooks, @/shared/ui
```

- `services` 是底层子域，不依赖其他子域
- `hooks` 依赖 `services`，提供 React Query 封装
- `presentation` 仅依赖 `hooks`

## 常见修改场景

### 1. 新增角色字段或修改角色 Schema
- 修改文件：`services/character-service.ts`、`hooks/use-character-crud.ts`
- 检查不变量：INV-2（输入校验 schema）、INV-5（name 必填）、INV-6（软删除）
- 测试：`npx vitest run src/modules/character/services`

### 2. 修改角色图片生成逻辑
- 修改文件：`hooks/use-character-image.ts`
- 检查不变量：INV-7（图片操作通过 DI 容器）、R11（异步回调验证实体 ID 一致性）
- 测试：`npx vitest run src/modules/character/hooks`

### 3. 修改服装管理（增删改服装）
- 修改文件：`hooks/use-outfit-management.ts`
- 检查不变量：INV-3（领域事件触发）、R30（级联删除在 safeTransaction 中）
- 测试：`npx vitest run src/modules/character/hooks`

### 4. 新增角色列表展示字段
- 修改文件：`presentation/CharacterListItem.tsx`
- 检查不变量：INV-11（presentation 通过 hooks 获取数据）
- 测试：`npx vitest run src/modules/character/presentation`

## 内部实现细节（非明确要求不要修改）

- `services/character-service.ts` — 软删除实现（is_deleted 标记）、领域事件触发
- `hooks/use-character-crud.ts` — React Query mutation + invalidateQueries 模式
- `hooks/use-character-image.ts` — 异步图片生成 + 实体 ID 一致性验证
- `hooks/r36-ai-selective-merge.test.ts` — AI 结果合并策略（选择性合并，非整体替换）

## 测试验证

- 测试命令：`npx vitest run src/modules/character`
- 关键测试文件：
  - `services/__tests__/character-service.test.ts` — CRUD 服务
  - `hooks/__tests__/use-character-crud.test.ts` — CRUD hooks
  - `hooks/__tests__/r29-entity-id-consistency.test.ts` — 实体 ID 一致性
  - `hooks/__tests__/r36-ai-selective-merge.test.ts` — AI 合并策略
  - `presentation/__tests__/CharacterListItem.test.tsx` — 列表项组件
