# Sync Module

## 职责

多设备数据同步：变更追踪、向量时钟、冲突检测与解决

---

## 子域结构

本模块采用子域架构，包含 2 个内部子域：

| 子域 | 路径 | 职责 |
|------|------|------|
| `engine` | [engine/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/sync/engine/) | 同步引擎核心、变更追踪、向量时钟、冲突解决 |
| `presentation` | [presentation/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/sync/presentation/) | 冲突解决面板、同步设置、状态指示器 |

---

## 公共 API（index.ts）

### 引擎子域
- `initSyncEngine` — 初始化同步引擎
- `performSync` — 执行同步
- `getSyncStatus` — 获取同步状态
- `updateSyncConfig` — 更新同步配置
- `getSyncConfig` — 获取同步配置
- `setConflictCallback` — 设置冲突回调
- `recordChange` — 变更记录
- `SyncEntityType` — 同步实体类型 (type)
- `ChangeOperation` — 变更操作类型 (type)
- `SyncChangeLogEntry` — 同步变更日志条目类型 (type)
- `VectorClock` — 向量时钟类型 (type)
- `SyncStatus` — 同步状态类型 (type)
- `compareVectorClocks` — 比较向量时钟
- `mergeVectorClocks` — 合并向量时钟
- `createVectorClock` — 创建向量时钟
- `incrementVectorClock` — 递增向量时钟
- `isVectorClockConflict` — 检测向量时钟冲突
- `DEFAULT_SYNC_CONFIG` — 默认同步配置
- `SyncConflict` — 同步冲突类型 (type)
- `ConflictStrategy` — 冲突策略类型 (type)
- `SyncConfig` — 同步配置类型 (type)
- `SyncStatusInfo` — 同步状态信息类型 (type)
- `SyncPushResult` — 同步推送结果类型 (type)
- `SyncPullResult` — 同步拉取结果类型 (type)
- `RemoteChange` — 远程变更类型 (type)

### 展示子域
- `SyncConflictPanel` — 冲突解决面板
- `SyncSettingsPanel` — 同步设置面板
- `SyncStatusIndicator` — 同步状态指示器

---

## 依赖

- `@/domain/types/sync` - 同步核心类型
- `@/infrastructure/storage` - 数据持久化

---

## 边界约束

⚠️ **重要约束**：
- 子域之间只能通过各自的 `index.ts` 导出的 API 通信
- 禁止直接引用其他子域的内部文件（如 `../engine/engine.ts`）
- 所有跨子域引用必须通过 `../subdomain` 导入
- `engine` 和 `presentation` 子域互不依赖

---

## AI 维护指南

本模块的详细 AI 重构规范请参见：[.ai/modules/sync.md](../../../.ai/modules/sync.md)

### 快速参考

- 禁止导入路径：`@/types/*`, `@/lib/*`, `@/modules/*/*/*`
- 类型必须从：`@/domain/schemas` 导入
- 使用 Result 模式处理异步操作
- 错误处理使用：`@/shared/error-handler`
