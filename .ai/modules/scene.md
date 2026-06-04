# Scene 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| services | 🟢 低 | 标准 CRUD + Result 模式，与 character 对称 |
| hooks | 🟡 中 | dirty 状态管理、异步图片生成回调验证 |

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

### 1. 新增场景字段或修改场景 Schema
- 修改文件：`services/scene-service.ts`、`hooks/use-scene-crud.ts`
- 检查不变量：INV-2（输入校验 schema）、INV-5（name 必填）、INV-6（软删除）
- 测试：`npx vitest run src/modules/scene/services`

### 2. 修改场景图片生成逻辑
- 修改文件：`hooks/use-scene-image.ts`
- 检查不变量：INV-7（图片操作通过 DI 容器）、R11（异步回调验证实体 ID 一致性）
- 测试：`npx vitest run src/modules/scene/hooks`

### 3. 修改 dirty 状态管理
- 修改文件：`hooks/use-scene-crud.ts`
- 检查不变量：INV-11（markClean 必须在保存成功且 setCurrentScene 之后）、INV-12（保存失败时 dirty 保留）
- 测试：`npx vitest run src/modules/scene/hooks`

### 4. 新增场景列表展示字段
- 修改文件：`presentation/SceneListItem.tsx`
- 检查不变量：INV-11（presentation 通过 hooks 获取数据）
- 测试：`npx vitest run src/modules/scene/presentation`

## 内部实现细节（非明确要求不要修改）

- `services/scene-service.ts` — 软删除实现、领域事件触发
- `hooks/use-scene-crud.ts` — markClean 调用时机、dirty 状态保留逻辑
- `hooks/use-scene-image.ts` — 异步图片生成 + 实体 ID 一致性验证

## 测试验证

- 测试命令：`npx vitest run src/modules/scene`
- 关键测试文件：
  - `services/__tests__/scene-service.test.ts` — CRUD 服务
  - `hooks/__tests__/use-scene-crud.test.ts` — CRUD hooks + dirty 状态
  - `presentation/__tests__/SceneListItem.test.tsx` — 列表项组件
