<!-- AI: Before modifying this module, read contract.json for invariants -->
# Sync Module

## 模块概述

多设备数据同步模块，负责变更追踪、向量时钟管理、冲突检测与解决策略、推送/拉取远程变更。本模块为未来多设备协同场景提供基础设施，当前以本地变更追踪和冲突检测能力为主。

---

## 子域结构

| 子域 | 路径 | 职责 |
|------|------|------|
| `engine` | [engine/](./engine/) | 同步引擎核心：变更追踪、向量时钟管理、推送/拉取远程变更、冲突检测与解决策略 |
| `presentation` | [presentation/](./presentation/) | 冲突解决面板、同步设置面板、同步状态指示器 |

---

## 公共 API

### engine 子域

| API | 签名 | 说明 |
|-----|------|------|
| `initSyncEngine` | `(config?: Partial<SyncConfig>) → void` | 初始化同步引擎 |
| `performSync` | `() → Promise<SyncPushResult & SyncPullResult>` | 执行同步（推送+拉取） |
| `getSyncStatus` | `() → Promise<SyncStatusInfo>` | 获取当前同步状态（异步，因 getDeviceId 已异步化） |
| `updateSyncConfig` | `(config: Partial<SyncConfig>) → void` | 更新同步配置 |
| `setConflictCallback` | `(cb: (conflict: SyncConflict) => Promise<ConflictStrategy>) → void` | 设置冲突回调 |
| `SyncEntityType` | `type` | 同步实体类型 |
| `ChangeOperation` | `type` | 变更操作类型 |
| `SyncChangeLogEntry` | `type` | 同步变更日志条目 |
| `VectorClock` | `type` | 向量时钟 |
| `SyncStatus` | `type` | 同步状态枚举 |
| `SyncConflict` | `type` | 同步冲突 |
| `ConflictStrategy` | `type: "local-wins" \| "remote-wins" \| "last-write-wins" \| "manual"` | 冲突解决策略 |
| `SyncConfig` | `type` | 同步配置 |
| `SyncStatusInfo` | `type` | 同步状态信息 |
| `SyncPushResult` | `type` | 同步推送结果 |
| `SyncPullResult` | `type` | 同步拉取结果 |
| `RemoteChange` | `type` | 远程变更 |

### presentation 子域

| API | 签名 | 说明 |
|-----|------|------|
| `SyncSettingsPanel` | `React.FC<SyncSettingsPanelProps>` | 同步设置面板 |

---

## 子域 API（非顶层导出）

> 以下 API 仍存在于子域内部文件，但已从模块顶层 barrel (`index.ts`) 移除，不再属于模块公共 API。仅子域内部使用。

### engine 子域（非顶层导出）

| API | 签名 | 说明 | 实际位置 |
|-----|------|------|----------|
| `getSyncConfig` | `() → SyncConfig` | 获取同步配置 | `engine/engine.ts` |
| `recordChange` | `(entityType: SyncEntityType, entityId: string, operation: ChangeOperation, data?: Record<string, unknown>) → Promise<void>` | 记录变更（异步） | `engine/changelog.ts` |
| `compareVectorClocks` | `(a: VectorClock, b: VectorClock) → -1 \| 0 \| 1` | 比较向量时钟 | `@/domain/types/sync.ts` |
| `mergeVectorClocks` | `(a: VectorClock, b: VectorClock) → VectorClock` | 合并向量时钟 | `@/domain/types/sync.ts` |
| `createVectorClock` | `(deviceId: string) → VectorClock` | 创建向量时钟 | `@/domain/types/sync.ts` |
| `incrementVectorClock` | `(clock: VectorClock, deviceId: string) → VectorClock` | 递增向量时钟 | `@/domain/types/sync.ts` |
| `isVectorClockConflict` | `(a: VectorClock, b: VectorClock) → boolean` | 检测向量时钟冲突 | `@/domain/types/sync.ts` |
| `DEFAULT_SYNC_CONFIG` | `SyncConfig` | 默认同步配置 | `engine/types.ts` |

### presentation 子域（非顶层导出）

| API | 签名 | 说明 | 实际位置 |
|-----|------|------|----------|
| `SyncConflictPanel` | `React.FC<SyncConflictPanelProps>` | 冲突解决面板（本地/远程/合并三种方式）；仍被 `SyncSettingsPanel` 内部使用 | `presentation/SyncConflictPanel.tsx` |
| `SyncStatusIndicator` | `React.FC` | 同步状态指示器 | `presentation/SyncStatusIndicator.tsx` |

---

## 依赖关系

| 依赖 | 用途 |
|------|------|
| `@/domain/types/sync` | SyncConfig, SyncEntityType, ChangeOperation, VectorClock, RemoteChange 等核心类型 |
| `@/infrastructure/di` | 依赖注入容器，获取 storage 实例 |
| `@/shared/db-core` | safeQuery, safeRun, safeTransaction 数据库操作 |
| `@/shared/error-logger` | 错误日志记录 |
| `@/shared/ui` | UI 组件基础（presentation 子域） |
| `@tanstack/react-query` | 数据获取与缓存（presentation 子域） |
| `@/config/constants` | API_SERVER_PORT, ELECTRON_APP_HEADERS（HTTP config 路由调用） |

### 子域内部依赖图

```
engine ← @/domain/types/sync, @/infrastructure/di, @/shared/db-core
presentation ← @/domain/types/sync, @/shared/ui
```

- `engine` 和 `presentation` 是两个独立子域，互不依赖
- 两者都依赖 `@/domain/types/sync` 中的类型定义

---

## 边界约束

1. 子域之间只能通过各自的 `index.ts` 导出的 API 通信
2. 禁止直接引用其他子域的内部文件（如 `../engine/engine.ts`）
3. 所有跨子域引用必须通过 `../subdomain` 导入
4. `engine` 和 `presentation` 子域互不依赖
5. 禁止导入路径：`@/types/*`、`@/lib/*`、`@/modules/*/*/*`
6. 类型必须从 `@/domain/schemas` 或 `@/domain/types/sync` 导入
7. 禁止 `@/infrastructure/*` 直接导入（除 `@/infrastructure/di`），必须通过 DI 容器

---

## 不变量

- **INV-1**：变更记录必须通过 `recordChange` 统一入口，禁止直接写入变更日志表
- **INV-2**：向量时钟用于检测并发冲突，时钟比较必须遵循偏序关系
- **INV-3**：冲突解决策略支持 `local-wins` / `remote-wins` / `last-write-wins` / `manual` 四种模式
- **INV-4**：同步操作在 `autoSync` 开启时自动定时执行，执行间隔由配置决定
- **INV-5**：`engine` 子域不依赖 `presentation` 子域
- **INV-6**：同步操作必须是幂等的，重复执行不产生副作用
- **INV-7**：冲突面板提供本地/远程/合并三种解决方式
- **INV-8**：状态指示器实时反映同步状态（idle / syncing / error）
- **INV-9**：`presentation` 子域不依赖 `engine` 子域的内部实现
- **INV-10**：同步状态变更必须记录 `sync_id`
- **INV-11**：内部函数 `getDeviceId()`（非公共 API）为异步函数，使用 HTTP `/api/config/get` 优先 + IPC `electronAPI.getConfig` 回退 + 内存缓存 `_cachedDeviceId`；模块内所有调用方必须 `await`

---

## AI 维护指南

详细 AI 重构规范请参见：[.ai/modules/sync.md](../../../.ai/modules/sync.md)

### 修改前必读顺序

1. 本文件（MODULE.md）— 模块概览与公共 API
2. 子域 `contract.json` — 不变量与依赖
3. [.ai/modules/sync.md](../../../.ai/modules/sync.md) — 详细修改规则
4. `index.ts` — 实际桶导出

### 新增公共 API 时

1. 在子域 `index.ts` 中导出
2. 在模块 `index.ts` 中重新导出
3. 更新本文件「公共 API」部分
4. 更新子域 `contract.json` 的 `publicAPI` 字段
5. 运行 `node scripts/check-module-api-consistency.mjs` 验证

### 修改子域内部实现时

1. 检查 `contract.json` 的 `invariants`，确保不违反不变量
2. 不改变公共 API 签名则无需更新文档
3. 运行 `npx eslint .` 和 `node scripts/check-architecture.mjs` 验证

### 回归守卫提醒

- **R5**：后台同步失败后必须通知用户，禁止静默失败
- **R18**：存储配额错误必须通知用户
- **R30**：级联删除操作必须在单个 `safeTransaction` 中完成

### 测试

- 测试文件位于各子域的 `__tests__/` 目录
- 运行：`npx vitest run src/modules/sync`
- 新增服务必须编写单元测试
