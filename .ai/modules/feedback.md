# Feedback 模块 — AI 维护指南

## 修改前必读
- 本模块的契约文件：`contract.json`（每个子域一个）
- 模块概览：`MODULE.md`
- 公共 API：`index.ts`

## 子域依赖图

```
hooks ← @/domain/types/result, @/shared/error-logger
  │
  ▼
presentation ← hooks
```

- `hooks` 是底层子域，提供撤销/重做、脏数据追踪等 React hooks
- `presentation` 依赖 `hooks`，提供反馈相关的 UI 组件

## 修改规则

### 允许的导入源
- `@/domain/schemas` — 类型定义
- `@/domain/types` — Result 类型、错误类型（特别是 `@/domain/types/result`）
- `@/domain/ports` — Port 接口
- `@/infrastructure/di` — DI 容器
- `@/shared/*` — 共享工具（特别是 `@/shared/error-logger`）
- `@/modules/{other-module}` — 其他模块桶导入

### 禁止的导入
- `@/infrastructure/*`（除 `@/infrastructure/di`）— 必须通过 DI 容器
- `@/modules/*/*/*` — 必须使用桶导入
- `@/types/*`、`@/lib/*`、`@/components/*` — 已废弃

### 新增公共 API 时
1. 在子域 `index.ts` 中导出
2. 在模块 `index.ts` 中重新导出
3. 更新 `MODULE.md` 的公共 API 部分
4. 更新子域 `contract.json` 的 `publicAPI` 字段
5. 运行 `node scripts/check-module-api-consistency.mjs` 验证

### 修改子域内部实现时
1. 检查 `contract.json` 的 `invariants`，确保不违反不变量
2. 不改变公共 API 签名则无需更新文档
3. 运行 `npx eslint .` 和 `node scripts/check-architecture.mjs` 验证

## 子域详情

### hooks
- **职责**：提供反馈相关的 React hooks，包括撤销/重做栈管理、脏数据追踪
- **依赖**：`@/domain/types/result`、`@/shared/error-logger`
- **不变量**：
  - **撤销栈有最大深度限制**：超过最大深度时，最早的记录将被丢弃
  - **DirtyTracker 使用 safeDeepEqual**：脏数据检测必须使用安全的深度比较函数，避免循环引用导致的栈溢出
  - 撤销/重做操作必须保持栈的一致性
  - 新的编辑操作必须清空重做栈

### presentation
- **职责**：反馈模块的 UI 组件，包括撤销/重做按钮、保存状态指示器、脏数据提示
- **依赖**：`hooks`
- **不变量**：
  - 组件必须通过 hooks 获取状态，不直接操作撤销栈
  - 撤销/重做按钮的禁用状态必须与栈的实际状态同步

## 测试
- 测试文件位于各子域的 `__tests__/` 目录
- 运行：`npx vitest run src/modules/feedback`
- 新增服务必须编写单元测试
- 撤销栈相关测试必须验证最大深度限制
- DirtyTracker 测试必须包含循环引用场景
