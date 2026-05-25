# 存储层文档

> 更新日期: 2026-05-18

## 1. 概述

存储层位于 `src/infrastructure/storage/`，负责所有 SQLite 数据库操作。采用端口-适配器模式，领域层通过 `domain/ports/` 定义接口，存储层提供实现。

## 2. 存储文件清单

| 文件 | 表名 | 职责 |
|------|------|------|
| `core.ts` | — | 基础工具: buildInsert, parseRecord, toSqlValue, trackChange, isElectron, DbRunResult |
| `sqlite-core.ts` | — | SQLite 核心: safeQuery, safeRun, safeTransaction (结果缓存) |
| `db.ts` | — | 类型定义 (AutoSaveRecord, ErrorLog, SessionData) |
| `characters.ts` | characters | 角色 CRUD + 服装管理 |
| `characters/parser.ts` | — | 角色数据解析 (从 storage 迁移到 service) |
| `characters/outfit-manager.ts` | — | 服装管理 (从 characters.ts 拆分) |
| `scenes.ts` | scenes | 场景 CRUD |
| `stories.ts` | stories | 故事 CRUD |
| `stories/beat-transformer.ts` | — | 分镜数据转换 (从 stories.ts 拆分) |
| `stories/relations.ts` | — | 故事关联查询 (从 stories.ts 拆分) |
| `elements.ts` | elements | 元素 CRUD (57 行，逻辑拆分到子模块) |
| `elements/queries.ts` | — | 元素查询操作 |
| `elements/commands.ts` | — | 元素写入操作 |
| `video-tasks.ts` | video_tasks | 视频任务 CRUD (265 行) |
| `video-tasks/parser.ts` | — | 视频任务数据解析 |
| `video-tasks/bulk-operations.ts` | — | 批量操作 |
| `video-cache.ts` | video_cache | 视频缓存管理 |
| `import-export.ts` | — | 数据导入导出 |
| `auto-save.ts` | auto_saves | 自动保存 (带写入验证) |
| `versions.ts` | story_versions | 版本管理 |
| `templates.ts` | templates | 模板管理 |
| `sessions.ts` | sessions | 会话管理 |
| `collections.ts` | collections + collection_assets | 收藏集管理 (级联删除) |
| `error-logs.ts` | error_logs | 错误日志 |
| `storyboard.ts` | storyboard_assets | 分镜板综合查询 |

> **注**: 数据库表结构定义 (CREATE TABLE) 位于 `electron/src/database/db-schema.ts`，数据库初始化与连接管理位于 `electron/src/database/db-connection.ts`。

## 3. 核心工具函数

### 3.1 buildInsert

构建 INSERT 语句，支持冲突策略：

```typescript
buildInsert(table, record, conflict?: "ABORT" | "IGNORE" | "REPLACE"): { sql: string; params: unknown[] }

// 示例
buildInsert("video_tasks", { task_id: "1", status: "pending" }, "REPLACE")
// → { sql: "INSERT OR REPLACE INTO video_tasks (task_id, status) VALUES (?, ?)", params: ["1", "pending"] }
```

### 3.2 parseRecord

将数据库记录 (snake_case) 转换为领域对象 (camelCase)：

```typescript
parseRecord<VideoTask>(row, fieldMap): VideoTask
```

### 3.3 trackChange

注册变更追踪 (用于同步)，仅在 syncConfig.enabled 时注册：

```typescript
trackChange(table, id, operation): void
// 内部: if (changeTracker) changeTracker(table, id, operation)
```

### 3.4 DbRunResult

safeRun 返回值类型：

```typescript
interface DbRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}
```

## 4. video-tasks.ts 关键设计

### 4.1 状态验证在 Hook 层

存储层不再导入 TaskMachine，状态验证在 Hook 层执行：

```typescript
// hooks/use-video-task-manager.ts
if (!TaskMachine.canTransition(task.status, targetStatus)) {
  errorLogger.warn(...);
  return;
}
await videoTaskStorage.updateVideoTask(taskId, updates);
```

### 4.2 REPLACE 策略

所有 UNIQUE 冲突统一使用 `INSERT OR REPLACE`：

```sql
INSERT OR REPLACE INTO video_tasks (task_id, status, ...) VALUES (?, ?, ...)
```

### 4.3 deleteByStatus 原子性

使用子查询事务确保原子性：

```sql
BEGIN TRANSACTION;
DELETE FROM video_cache WHERE task_id IN (SELECT task_id FROM video_tasks WHERE status = ?);
DELETE FROM video_tasks WHERE status = ?;
COMMIT;
```

### 4.4 时间戳处理

存储层负责 ISO string ↔ Unix timestamp 的转换：

```typescript
function toStorageTimestamp(value: unknown): number | null {
  if (!value) return null;
  const date = new Date(value as string | number);
  return Math.floor(date.getTime() / 1000);
}

function normalizeTimestamp(value: unknown): string {
  if (!value) return new Date().toISOString();
  return new Date(value as string | number).toISOString();
}
```

## 5. 数据库初始化 (桌面端)

### 5.1 强制 better-sqlite3

桌面端不再使用 sql.js fallback。如果 better-sqlite3 加载失败，直接报错：

```typescript
if (!betterSqlite3Module) {
  throw new Error("better-sqlite3 not found. This is required for Electron desktop mode.");
}
```

### 5.2 性能优化

```typescript
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("cache_size = -64000");
db.pragma("temp_store = memory");
db.pragma("mmap_size = 268435456");
```

### 5.3 自动备份

| 参数 | 值 |
|------|-----|
| 备份间隔 | 24 小时 |
| 最大备份数 | 7 个 |
| 最大保留期 | 30 天 |
| 备份方式 | SQLite Backup API |
| 备份前 | 执行 WAL checkpoint |

### 5.4 ENOSPC 处理

```typescript
if (error.code === "ENOSPC") {
  isPersistenceAvailable = false;
  // 发送 IPC 警告到渲染进程
  mainWindow.webContents.send("db:persistence-error", {
    type: "disk-full",
    message: "磁盘空间不足！",
  });
}
```

### 5.5 IPC 接口

| 通道 | 说明 |
|------|------|
| `db:backup-status` | 获取备份状态和列表 |
| `db:create-backup` | 手动创建备份 |
| `db:persistence-error` | 磁盘满警告 (渲染→主) |

## 6. 错误处理

### 6.1 存储层错误

- 不存在的任务更新 → 抛出明确错误消息
- trackChange 失败 → `errorLogger.warn` 记录，不中断主流程
- 空 catch 块 → 至少添加 console.debug 日志

### 6.2 日志规范

```typescript
errorLogger.warn(
  { code: "TRACK_CHANGE_FAILED", message: `trackChange failed for insert, taskId=${taskId}` },
  "VideoTasks",
);
```

## 7. 完整数据库表结构

> 表结构定义文件: `electron/src/database/db-schema.ts`

数据库共包含 **28 张表**、**40 个索引**。以下按分类组织。

### 7.1 核心业务表 (9)

| 表名 | 列数 | 索引数 | 说明 |
|------|------|--------|------|
| characters | 31 | 7 | 角色表 (gender CHECK, source CHECK, 软删除, 同步) |
| scenes | 31 | 5 | 场景表 (source CHECK, 软删除, 同步) |
| stories | 15 | 0 | 故事表 (软删除, 同步) |
| story_beats | 34 | 1 | 故事节拍表 (FK→stories ON DELETE CASCADE) |
| elements | 11 | 0 | 元素表 (type CHECK IN character/prop/effect) |
| character_outfits | 13 | 1 | 角色服装表 (FK→characters ON DELETE CASCADE) |
| video_tasks | 33 | 4 | 视频任务表 (status CHECK 6 种, 软删除, 同步) |
| video_cache | 10 | 3 | 视频缓存表 (软删除, 同步) |
| media_assets | 20 | 0 | 媒体资产表 (type CHECK image/video, 软删除, 同步) |

### 7.2 关联表 (4)

| 表名 | 列数 | 索引数 | 说明 |
|------|------|--------|------|
| story_characters | 4 | 1 | 故事-角色关联 (UNIQUE(story_id, character_id), FK→stories CASCADE) |
| story_scenes | 4 | 1 | 故事-场景关联 (UNIQUE(story_id, scene_id), FK→stories CASCADE) |
| story_elements | 4 | 1 | 故事-元素绑定 (UNIQUE(story_id, element_id), FK→stories CASCADE) |
| collection_assets | 5 | 0 | 收藏集-资产关联 (asset_type CHECK) |

### 7.3 版本与模板表 (3)

| 表名 | 列数 | 索引数 | 说明 |
|------|------|--------|------|
| story_versions | 17 | 1 | 故事版本表 (软删除, 同步) |
| video_templates | 10 | 0 | 视频模板表 |
| ast_templates | 21 | 4 | AST 模板表 (category/name/usage/created 索引) |

### 7.4 生成与文件表 (3)

| 表名 | 列数 | 索引数 | 说明 |
|------|------|--------|------|
| generation_tasks | 21 | 4 | 生成任务表 (task_type CHECK, status CHECK, 复合索引) |
| file_index | 12 | 2 | 文件索引表 (file_hash 索引, 部分索引 WHERE is_temporary=1) |
| storyboard_assets | 14 | 0 | 分镜资产表 (shot_type CHECK, 软删除, 同步) |

### 7.5 系统表 (5)

| 表名 | 列数 | 索引数 | 说明 |
|------|------|--------|------|
| schema_version | 2 | 0 | 模式版本表 |
| auto_saves | 5 | 2 | 自动保存表 (type CHECK, timestamp 索引) |
| error_logs | 5 | 0 | 错误日志表 (AUTOINCREMENT 主键) |
| sessions | 4 | 0 | 会话表 |
| asset_tags | 4 | 2 | 资产标签表 (复合主键 asset_id+tag, asset_type CHECK) |

### 7.6 同步表 (3)

| 表名 | 列数 | 索引数 | 说明 |
|------|------|--------|------|
| sync_changelog | 9 | 2 | 同步变更日志 (operation CHECK, 复合索引 synced+timestamp) |
| sync_meta | 2 | 0 | 同步元数据 (key-value) |
| sync_conflict_backup | 7 | 0 | 同步冲突备份 |

### 7.7 收藏表 (1)

| 表名 | 列数 | 索引数 | 说明 |
|------|------|--------|------|
| collections | 8 | 0 | 收藏集表 (软删除, 同步) |

### 7.8 关键设计特征

1. **主键策略**: 大部分 TEXT UUID，仅 story_characters/story_scenes/story_elements/error_logs 使用 INTEGER AUTOINCREMENT，asset_tags 使用复合主键
2. **软删除**: 9 张表含 is_deleted 字段
3. **同步支持**: 9 张表含 sync_status/vector_clock/last_synced_at 三字段
4. **CHECK 约束**: 广泛使用 (gender, source, status, type, operation, confidence 等)
5. **JSON 存储**: 复杂结构以 `_json` 后缀 TEXT 存储
6. **冗余索引**: idx_video_tasks_story_id 和 idx_video_tasks_story 功能重复

### 7.9 索引汇总 (40 个)

| 索引名 | 表 | 列 | 备注 |
|--------|-----|-----|------|
| idx_characters_style | characters | style | |
| idx_characters_gender | characters | gender | |
| idx_characters_source | characters | source | |
| idx_characters_created | characters | created_at DESC | 降序 |
| idx_characters_used | characters | use_count DESC, last_used_at DESC | 复合降序 |
| idx_characters_name | characters | name | |
| idx_characters_tags | characters | tags | |
| idx_scenes_type | scenes | type | |
| idx_scenes_atmosphere | scenes | atmosphere | |
| idx_scenes_created | scenes | created_at DESC | 降序 |
| idx_scenes_name | scenes | name | |
| idx_scenes_tags | scenes | tags | |
| idx_story_characters_story | story_characters | story_id | |
| idx_story_scenes_story | story_scenes | story_id | |
| idx_story_beats_story | story_beats | story_id | |
| idx_story_elements_story | story_elements | story_id | |
| idx_character_outfits_character | character_outfits | character_id | |
| idx_video_tasks_status | video_tasks | status | |
| idx_video_tasks_story_id | video_tasks | story_id | |
| idx_video_tasks_expires_at | video_tasks | expires_at | |
| idx_video_tasks_story | video_tasks | story_id | 与 story_id 重复 |
| idx_video_cache_task_id | video_cache | task_id | |
| idx_video_cache_cached_at | video_cache | cached_at | |
| idx_video_cache_size | video_cache | file_size | |
| idx_auto_saves_type | auto_saves | type | |
| idx_auto_saves_timestamp | auto_saves | timestamp | |
| idx_tasks_status | generation_tasks | status, created_at | 复合 |
| idx_tasks_story | generation_tasks | story_id, beat_id | 复合 |
| idx_tasks_priority | generation_tasks | priority, status | 复合 |
| idx_tasks_next_retry | generation_tasks | next_retry_at | |
| idx_file_hash | file_index | file_hash | |
| idx_file_expires | file_index | expires_at | 部分索引 WHERE is_temporary=1 |
| idx_story_versions_story | story_versions | story_id, timestamp | 复合 |
| idx_ast_templates_category | ast_templates | category | |
| idx_ast_templates_name | ast_templates | name | |
| idx_ast_templates_usage | ast_templates | usage_count DESC | 降序 |
| idx_ast_templates_created | ast_templates | created_at DESC | 降序 |
| idx_asset_tags_tag | asset_tags | tag | |
| idx_asset_tags_lookup | asset_tags | asset_type, tag | 复合 |
| idx_changelog_synced | sync_changelog | synced, timestamp | 复合 |
| idx_changelog_entity | sync_changelog | entity_type, entity_id | 复合 |
