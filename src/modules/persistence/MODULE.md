<!-- AI: Before modifying this module, read contract.json for invariants -->
# Persistence Module

## 模块概述

持久化模块，负责自动保存（带重试限制与最小间隔）、事务性级联删除（数据库记录 + 本地文件同步清理）。本模块是数据安全的核心保障层。

---

## 子域结构

| 子域 | 路径 | 职责 |
|------|------|------|
| `hooks` | [hooks/](./hooks/) | useAutoSave（自动保存） |
| `services` | [services/](./services/) | transactionalDelete（级联删除 + 本地文件清理） |

---

## 公共 API

### hooks 子域

| API | 签名 | 说明 |
|-----|------|------|
| `useAutoSave` | `(options: UseAutoSaveOptions & { isDirty?: () => boolean }) → { triggerSave }` | 自动保存 hook，带重试限制（MAX_RETRY=3）和最小间隔（MIN_INTERVAL=0.5min），支持 isDirty 检查跳过无变更保存 |

### services 子域

| API | 签名 | 说明 |
|-----|------|------|
| `deleteCharacterWithRefs` | `(characterId: string) → Promise<Result<void>>` | 删除角色及其关联数据（级联删除 + 本地文件清理） |
| `deleteSceneWithRefs` | `(sceneId: string) → Promise<Result<void>>` | 删除场景及其关联数据（级联删除 + 本地文件清理） |

---

## 依赖关系

| 依赖 | 用途 |
|------|------|
| `@/shared/db-core` | safeQuery, safeRun, safeTransaction 数据库操作 |
| `@/shared/sql-safety` | sanitizeTable, sanitizeIdentifier SQL 安全工具 |
| `@/shared/error-logger` | 错误日志记录 |
| `@/shared/utils/safe-json` | safeJsonParseArray JSON 安全解析 |
| `@/shared/utils/toast-bridge` | emitToast 用户通知（自动保存失败时） |
| `@/domain/types/result` | Result, fromAsyncThrowable 类型 |

### 子域内部依赖图

```
services ← @/shared/db-core, @/shared/sql-safety, @/shared/error-logger, @/domain/types/result
  │
  ▼
hooks ← @/domain/types/result, @/shared/utils/toast-bridge
```

- `services`：底层子域，提供事务性删除等持久化核心服务
- `hooks`：上层 React hooks 子域，提供自动保存

---

## 边界约束

1. 本模块不依赖其他业务模块（`@/modules/*`），仅依赖 `@/shared/*` 和 `@/domain/*`
2. 禁止导入路径：`@/types/*`、`@/lib/*`、`@/modules/*/*/*`
3. 禁止 `@/infrastructure/*` 直接导入（除 `@/infrastructure/di`），必须通过 DI 容器或 `@/shared/*` 代理导出
4. `hooks` 子域不依赖 `services` 子域的内部实现，两者独立工作
5. 事务性删除函数通过 `window.electronAPI.deleteFile` 清理本地文件，不直接操作文件系统

---

## 不变量

- **INV-1**：自动保存有 `MAX_RETRY` 限制（3 次），超过后停止重试并通过 `emitToast` 通知用户
- **INV-2**：自动保存有 `MIN_INTERVAL` 限制（0.5 分钟），防止过于频繁的写入
- **INV-4**：`deleteCharacterWithRefs` / `deleteSceneWithRefs` 在删除时同步清理本地图片文件
- **INV-5**：事务性删除使用 `safeTransaction` 保证原子性，所有 DELETE/UPDATE 语句在同一事务中执行
- **INV-6**：`useAutoSave` 使用 `savingRef` + `pendingRef` 防止并发保存，保存中的请求会被标记为 pending 后续执行
- **INV-7**：`useAutoSave` 的 `onSave` 回调通过 `useRef` 持有最新引用，避免闭包陷阱
- **INV-8**：`deleteCharacterWithRefs` 清理顺序：先收集文件路径 → 执行事务删除 → 清理 JSON 数组引用 → 清理本地文件
- **INV-9**：`deleteSceneWithRefs` 清理顺序：先收集文件路径 → 执行事务删除 → 清理本地文件
- **INV-10**：本地文件清理失败仅记录 warn 日志，不中断删除流程
- **INV-11**：`useAutoSave` 支持 `isDirty()` 回调，定时保存前检查是否有未保存修改，无修改时跳过保存
- **INV-12**：持久化操作失败时必须重新标记对应实体的脏状态（`markDirty`），确保下次保存时重试
- **INV-13**：`BeforeUnloadGuard` 仅在浏览器关闭时守卫，路由切换不清除脏状态

---

## AI 维护指南

详细 AI 重构规范请参见：[.ai/modules/persistence.md](../../../.ai/modules/persistence.md)

### 修改前必读顺序

1. 本文件（MODULE.md）— 模块概览与公共 API
2. `contract.json` — 不变量与依赖
3. [.ai/modules/persistence.md](../../../.ai/modules/persistence.md) — 详细修改规则
4. `index.ts` — 实际桶导出

### 新增公共 API 时

1. 在子域 `index.ts` 中导出
2. 在模块 `index.ts` 中重新导出
3. 更新本文件「公共 API」部分
4. 更新 `contract.json` 的 `publicAPI` 字段
5. 运行 `node scripts/check-module-api-consistency.mjs` 验证

### 修改子域内部实现时

1. 检查 `contract.json` 的 `invariants`，确保不违反不变量
2. 不改变公共 API 签名则无需更新文档
3. 运行 `npx eslint .` 和 `node scripts/check-architecture.mjs` 验证

### 回归守卫提醒

- **R1**：持久化写入必须在 React 状态更新之前完成（persist before state update）
- **R2**：删除实体时必须级联清理所有关联资源
- **R5**：自动保存失败超过重试次数后必须通知用户（当前已通过 `emitToast` 实现）
- **R8**：自动保存必须覆盖新实体（无 ID 的实体也应可自动保存）
- **R10**：异步保存操作必须使用 ref 防止并发调用（当前已通过 `savingRef` 实现）
- **R30**：级联删除操作必须在单个 `safeTransaction` 中完成（当前已实现）
- **R42**：createAutoSave 使用 `ON CONFLICT...WHERE timestamp < excluded.timestamp` 而非 `INSERT OR REPLACE`，防止覆盖更新的用户修改（乐观锁）

### 测试

- 测试文件位于各子域的 `__tests__/` 目录
- 运行：`npx vitest run src/modules/persistence`
- 新增服务必须编写单元测试
- 自动保存相关测试必须验证重试次数和间隔限制
