# 变更日志 (Changelog)

> 更新日期: 2026-05-18

## [0.6.0-beta.1] — 2026-05-18

### 重大变更

#### 时间类型统一

- **全项目时间戳从 number 统一为 ISO 8601 string**: 消除 number/Date/string 混用导致的时间比较和序列化不一致
- **characterSchema.createdAt**: `z.number()` → `z.string()`，Schema 层强制 ISO 8601 格式
- **videoTaskSchema 所有时间字段统一为 ISO string**: createdAt/updatedAt/completedAt 等字段全部迁移
- **存储层负责 ISO string ↔ Unix timestamp 的转换**: 存储层写入时转 Unix timestamp，读取时转回 ISO string，上层无感知
- **TaskMachine.transition 副作用**: `Date.now()` → `new Date().toISOString()`，状态转换时间戳统一为 ISO 格式

#### DI 接口注入

- **新增 2 个端口接口**: `IElementManager` (10 个方法), `IReferenceEngine` (4 个方法)，解耦领域层与基础设施层
- **DI 容器注册**: `elementManager` 和 `referenceEngine` 注册为单例，通过容器统一获取
- **消费方迁移**: ProfessionalModeEditor, ElementBindingPanel, ShotReferenceConfig 从直接导入改为 DI 获取，消除硬依赖

#### 数据安全加固

- **桌面端强制 better-sqlite3**: 移除 sql.js fallback 路径，消除数据丢失风险，桌面端不再支持降级到内存数据库
- **WAL 模式**: better-sqlite3 使用 WAL 日志模式，崩溃不丢数据，读写并发性能提升
- **自动备份**: 每 24 小时自动备份，保留 7 个备份，30 天过期，防止数据永久丢失
- **ENOSPC 检测**: 磁盘满时禁用写入，发送 IPC 警告，避免数据库损坏
- **损坏恢复**: 数据库损坏时自动重命名并重建，保留损坏文件供手动恢复

#### 文件拆分 (8 个超大文件)

| 文件 | 之前 | 之后 | 提取模块 |
|------|------|------|----------|
| use-video-task-manager.ts | 1031 行 | 624 行 | internals/{polling-engine,sync-engine,transition-guard} |
| stories.ts | 722 行 | 300 行 | stories/{beat-transformer,relations} |
| VideoTaskManager.tsx | 703 行 | 362 行 | handlers/video-task-handlers.ts |
| BeatDetailEditor.tsx | 569 行 | 219 行 | 6 个 sections 组件 |
| video-tasks.ts | 507 行 | 265 行 | video-tasks/{parser,bulk-operations} |
| elements.ts | 413 行 | 57 行 | elements/{queries,commands} |
| characters.ts | 407 行 | 203 行 | characters/{outfit-manager,parser} |
| TaskCard.tsx | 330 行 | 158 行 | task-card/{video-preview,task-actions} |

### 新增

- `src/domain/ports/element-manager-port.ts` — IElementManager 接口 (10 个方法)
- `src/domain/ports/reference-engine-port.ts` — IReferenceEngine 接口 (4 个方法)
- `src/shared/utils/url-validation.ts` — URL 安全验证工具 (SSRF 防护)
- `src/shared/ui/safe-image.tsx` — 安全图片组件 (Next/Image 封装，防止恶意 URL)
- `src/modules/video/recovery/services/smart-retry-engine.ts` — 智能重试引擎
- `electron/src/database/db-connection.ts` — 数据安全加固 (备份/ENOSPC/WAL)
- 5 个新测试文件 (story-generation-service, registry, shot-validator, smart-retry-engine, collections) — 71 个测试用例

### 修复

- **非空断言崩溃**: `storyboard-generation-service.ts` 中 `firstResult!.data!.imageUrl` → `firstResult?.data?.imageUrl ?? ""`，消除运行时 TypeError
- **非空断言崩溃**: `asa-export-service.ts` 中 8 处 `exportData.xxx!.push()` → `exportData.xxx?.push()`，消除运行时 TypeError
- **空 catch 块**: `engine.ts` 中 6 处空 catch → 添加 `console.debug` 日志，便于排查静默失败
- **空 catch 块**: `network-monitor.ts` 中 4 处空 catch → 添加 `console.debug` 日志，便于排查静默失败
- **innerHTML XSS**: `video-preview.tsx` 中 innerHTML → `createElementNS` DOM API，消除 XSS 注入风险
- **SSRF 风险**: `video-task-handlers.ts` 中 fetch URL → `isAllowedVideoUrl` 验证，阻止内网请求
- **SSRF 风险**: `asa-export-service.ts` 中 fetch URL → `isAllowedImageUrl` 验证，阻止内网请求
- **错误分类**: `story-service.ts` 中 7 处 catch 块从 `ValidationError` → `DatabaseError`，修正异常语义
- **存储层反向依赖**: `video-tasks.ts` 移除 TaskMachine 导入，状态验证移至 hook 层，恢复依赖方向
- **Sync 引擎写放大**: `registerChangeTracker` 仅在 `syncConfig.enabled` 时注册，避免无效写入
- **isElectron() 性能**: 每次调用重新计算 → 首次计算后缓存结果，减少重复检测开销
- **Window 全局类型**: 添加 `__OFFLINE_QUEUE_STATE__` 等全局变量声明，消除 TypeScript 类型错误
- **类型安全**: 22+ 处 `as unknown as T` 改为类型安全的方式，消除不安全类型断言
- **normalizeGender 迁移**: 从 storage 层移至 character 服务层，保持职责归属正确

### 测试修复

- `db-connection.test.ts`: 移除 detectDbType/migrateToBetterSqlite3 测试 (函数已删除)
- `video-tasks.test.ts`: 时间戳断言从 number → ISO string
- `task-machine.test.ts`: updatedAt 比较从直接数值 → `new Date().getTime()`
- `api-schema.test.ts`: createdAt 从 `Math.floor(Date.now()/1000)` → `new Date().toISOString()`
- `schema-validation.test.ts`: 所有时间戳字段从 number → ISO string
- `video-recovery-workflow.test.ts`: 导入路径 `@/domain/models/video` → `@/domain/schemas`
- `sqlite-core-enhanced.test.ts`: safeRun 返回值从 undefined → DbRunResult
- `regression.test.ts`: createdAt 从 number → ISO string
- `factories.ts`: videoTask createdAt 从 number → ISO string

### 代码简化

- `electron/src/db-interface.ts`: 移除 SqlJsDatabase/SqlJsStatement 类 (474→332 行, -30%)
- `electron/src/database/db-connection.ts`: 移除 sql.js 逻辑 (899→553 行, -38%)
- `electron/src/database/index.ts`: 移除 detectDbType/migrateToBetterSqlite3 导出
- `electron/src/handlers/database.ts`: db:migrate 返回 "Already using better-sqlite3"

### 测试统计

| 指标 | 0.5.0-beta.1 | 0.6.0-beta.1 |
|------|-------------|-------------|
| 测试文件 | 89 | 92 (+3) |
| 测试用例 | 1743 | 1761 (+18) |
| 失败 | 0 | 0 |

## [0.5.0-beta.1] — 2026-05-17

### 重大变更

#### 任务管理系统 v2 重构

- **新增 TaskMachine 状态机**: 强制校验所有任务状态转换，杜绝非法跳转 (如 pending→completed)
- **新增 "retrying" 状态**: `VideoTaskStatus` 从 5 种扩展为 6 种 (pending/processing/completed/failed/cancelled/retrying)
- **新增 PolicyEngine 策略引擎**: 统一管理超时策略 (2h) 和过期策略 (7d)
- **新增 TimestampBridge**: 统一内存 (ms) 与存储 (s) 的时间戳转换，消除毫秒/秒混用
- **新增 PollingScheduler**: 自适应退避轮询 (5s~60s, 1.5x factor)
- **新增 withTransitionGuard**: Store 层状态变更守卫，非法转换跳过状态但保留其他字段

#### VideoTaskManager.tsx 拆分

- 主组件从 **1740 行** 缩减为 **703 行** (-60%)
- 拆分为 9 个子组件: TaskCard, TaskFilterBar, RecoverySection, TaskTrackingDialog, VideoPreviewDialog, DeleteConfirmDialog, BulkDeleteDialog, TaskDetailDialog, task-status-helpers

#### 存储层修复

- **UNIQUE 冲突策略统一**: 从 ABORT+fallback/IGNORE 混用 → 统一 REPLACE 策略
- **deleteByStatus 原子性**: 使用子查询事务替代两步删除
- **错误消息统一**: `VideoTask not found for update: taskId="${taskId}"`
- **空 catch 块消除**: 所有静默错误改为 `errorLogger.warn` 记录

### 新增

- `src/modules/video/task-management/domain/` — 领域子域 (task-machine, task-events, task-schema, policies)
- `src/modules/video/task-management/infrastructure/` — 基础设施子域 (timestamp-bridge, polling-scheduler)
- `src/modules/video/task-management/presentation/TaskCard.tsx`
- `src/modules/video/task-management/presentation/TaskFilterBar.tsx`
- `src/modules/video/task-management/presentation/RecoverySection.tsx`
- `src/modules/video/task-management/presentation/TaskTrackingDialog.tsx`
- `src/modules/video/task-management/presentation/VideoPreviewDialog.tsx`
- `src/modules/video/task-management/presentation/DeleteConfirmDialog.tsx`
- `src/modules/video/task-management/presentation/BulkDeleteDialog.tsx`
- `src/modules/video/task-management/presentation/TaskDetailDialog.tsx`
- `src/modules/video/task-management/presentation/task-status-helpers.tsx`
- 5 个新测试文件 (task-machine, task-schema, policies, timestamp-bridge, polling-scheduler) — 117 个测试用例

### 修复

- `errorLogger.warn` 调用类型不匹配: 11 处非法属性 (taskId/field/operation/from/to) 合并到 message
- `_backup-v2/` 未排除 TypeScript 编译: tsconfig.json exclude 添加
- `VideoTaskRecord` 和 `VideoTaskHistory` 缺少 "retrying" 状态
- `videoTaskStatusSchema` 缺少 "retrying" 枚举值
- `TaskTrackingDialog.tsx` 导入路径错误 (`../../services/` → `../services/`)
- `storage-integrity.test.ts` 错误消息格式不一致
- 7 个 `contract.json` 缺少 `entryPoints` 和 `invariants` 字段 (shot 模块)
- 5 个 `contract.json` 的 `entryPoints.services` 引用不存在的文件 (prompt 模块)

### 测试改进

- 重写 `video-providers.test.ts`: 从 mock-self → 真实 process.env 测试
- 重写 `db-connection.test.ts`: mock 依赖而非模块本身
- 重写 `performance.test.ts`: 从宽松阈值 → 正确性验证
- 修复 `integration-api.test.ts`: `if (!available) return` → `describe.skipIf`
- 修复 `smoke.test.ts`: `toBeDefined()` → 行为验证
- 修复 `compatibility.test.ts`: 移除同义反复测试
- 修复 `regression.test.ts`: Schema safeParse 验证
- 修复 8 个 `module-integration.test.ts`: `toBeDefined()` → 方法名验证 + 契约语义验证
- 修复 `asset module-integration`: mock 硬编码 → `mockImplementation` 动态返回
- 修复 `video-tasks.test.ts`: buildInsert mock 添加 conflict 参数
- 修复 `video-tasks-enhanced.test.ts`: REPLACE 策略 + deleteByStatus 断言顺序

### 测试统计

| 指标 | 变更前 | 变更后 |
|------|--------|--------|
| 测试文件 | 84 | 89 (+5) |
| 测试用例 | ~1500 | 1743 (+243) |
| 失败 | 多处 | 0 |
