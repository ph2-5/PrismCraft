# Sync 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| engine | 🔴 高 | 向量时钟、冲突检测、变更追踪、幂等性保证、getDeviceId 异步化 |
| presentation | 🟢 低 | UI 组件，独立于 engine |

## 子域依赖图

```
engine ← @/domain/types/sync, @/infrastructure/di, @/shared/db-core, @/config/constants
presentation ← @/domain/types/sync, @/shared/ui
```

- `engine` 和 `presentation` 是两个独立子域，互不依赖
- 两者都依赖 `@/domain/types/sync` 中的类型定义
- `engine` 子域额外依赖 `@/config/constants`（API_SERVER_PORT, ELECTRON_APP_HEADERS）用于 HTTP config 路由调用

## 实际文件结构

```
src/modules/sync/engine/
  ├── changelog.ts              — 变更日志记录、recordChange 统一入口、getDeviceId（异步）
  ├── conflict-resolution.ts    — 冲突解决策略
  ├── engine.ts                 — 同步引擎核心函数（initSyncEngine, performSync 等）
  ├── sync-engine-class.ts      — SyncEngine 类实现（this.config.deviceId = await getDeviceId()）
  ├── entity-mapping.ts         — 实体类型到表名映射
  ├── remote-changes.ts         — 远程变更处理
  ├── server-store.ts           — 服务器状态存储
  ├── sync-protocol.ts          — 同步协议
  └── types.ts                  — 类型定义、DEFAULT_SYNC_CONFIG、向量时钟算法（incrementVectorClock 等）
```

⚠️ 注意：`engine/` 下**没有** `services/` 子目录，文件直接在 `engine/` 下。
⚠️ 注意：`vector-clock.ts` 和 `sync-config.ts` **不存在**，向量时钟算法和 `DEFAULT_SYNC_CONFIG` 都在 `types.ts` 中。

## 常见修改场景

### 1. 新增同步实体类型
- 修改文件：`engine/engine.ts`、`engine/changelog.ts`、`engine/entity-mapping.ts`
- 检查不变量：INV-1（变更记录必须通过 recordChange）、INV-10（状态变更必须记录 sync_id）
- 测试：`npx vitest run src/modules/sync/engine`

### 2. 修改冲突检测或解决策略
- 修改文件：`engine/engine.ts`、`engine/conflict-resolution.ts`、`engine/types.ts`（向量时钟算法）
- 检查不变量：INV-2（向量时钟偏序关系）、INV-3（四种冲突策略）、INV-6（同步操作幂等性）
- 测试：`npx vitest run src/modules/sync/engine`

### 3. 修改向量时钟算法
- 修改文件：`engine/types.ts`（incrementVectorClock, compareVectorClocks, mergeVectorClocks, isVectorClockConflict）
- 检查不变量：INV-2（时钟比较必须遵循偏序关系）
- 测试：`npx vitest run src/modules/sync/engine/__tests__/vector-clock.test.ts`

### 4. 修改设备 ID 获取逻辑
- 修改文件：`engine/changelog.ts`（getDeviceId, httpConfigGet, httpConfigSet, _cachedDeviceId）
- 检查不变量：INV-11（getDeviceId 异步，HTTP 优先 + IPC 回退 + 内存缓存）
- 关键调用点：`recordChange()`、`getSyncStatus()`、`sync-engine-class.ts` 的 `this.config.deviceId = await getDeviceId()`
- 测试：`npx vitest run src/modules/sync/engine`

### 5. 修改同步设置 UI 或冲突解决面板
- 修改文件：`presentation/SyncSettingsPanel.tsx`、`presentation/SyncConflictPanel.tsx`
- 检查不变量：INV-7（冲突面板三种解决方式）、INV-8（状态指示器实时反映）
- 测试：`npx vitest run src/modules/sync`

## 内部实现细节（非明确要求不要修改）

- `engine/types.ts` — 类型定义、DEFAULT_SYNC_CONFIG、向量时钟比较/合并/冲突检测算法
- `engine/changelog.ts` — 变更日志记录、recordChange 统一入口、getDeviceId（异步，HTTP 优先 + IPC 回退）
- `engine/engine.ts` — 同步引擎核心函数（推送/拉取/冲突解决）、isRecoveryRunning 防重入
- `engine/sync-engine-class.ts` — SyncEngine 类实现，通过 DI 容器懒加载注册
- `engine/conflict-resolution.ts` — 冲突解决策略实现
- `engine/entity-mapping.ts` — 实体类型到表名映射
- `engine/remote-changes.ts` — 远程变更应用
- `engine/server-store.ts` — 服务器状态存储
- `engine/sync-protocol.ts` — 同步协议定义

## 测试验证

- 测试命令：`npx vitest run src/modules/sync`
- 关键测试文件：
  - `engine/__tests__/vector-clock.test.ts` — 向量时钟算法
  - `engine/__tests__/changelog.test.ts` — 变更日志
  - `engine/__tests__/engine.test.ts` — 同步引擎核心
