# Agent Session Module

> 从 @/modules/agent 拆分而来（阶段2-b，2026-07-14）
> 职责：会话持久化 + P5 断点恢复检查点

## 概览

管理 Agent 会话的本地持久化与运行时检查点。会话保存到缓存目录的 `agent/sessions/` 子目录，每个会话一个 JSON 文件。检查点信息附加在 `AgentSession.checkpoint` 字段随会话一同持久化，并单独维护索引（`agent.checkpoints.index`）便于启动时快速检测中断会话。

## 子域

| 子域 | 文件 | 职责 |
|------|------|------|
| domain | `domain/checkpoint-types.ts` | 检查点类型定义 + createCheckpoint 工厂函数（零外部依赖） |
| services | `services/session-storage.ts` | 会话保存/加载/列出/删除，会话索引维护 |
| services | `services/session-checkpoint.ts` | 检查点初始化/更新/清除/中断检测，检查点索引维护 |
| services | `services/session-search.ts` | 会话搜索（按标题/内容）+ 序列化导出（JSON/Markdown，Task 4.9 子项 2） |

## Public API

### 会话存储（services/session-storage.ts）

- `saveSession` — 保存会话到本地（覆盖同名文件）
- `loadSession` — 加载会话
- `listSessions` — 列出所有会话（精简字段）
- `updateSessionIndex` — 更新会话索引
- `deleteSession` — 删除会话
- `persistSession` — 持久化当前会话（保存 + 更新索引）
- `SessionListItem` — 会话列表项类型

### 会话搜索与导出（services/session-search.ts，Task 4.9 子项 2）

- `searchSessionList` — 按标题过滤会话列表项（快速过滤，不加载会话内容）
- `searchInSession` — 单会话内搜索消息内容（返回 snippet + offset）
- `searchAcrossSessions` — 跨多会话搜索（全局搜索历史消息）
- `serializeSessionAsJSON` — 序列化为 JSON 字符串（重置 streaming 字段）
- `serializeSessionAsMarkdown` — 序列化为 Markdown 字符串（含角色图标、toolCalls 代码块）
- `buildExportFilename` — 生成导出文件名（清理非法字符、加日期时间戳）
- `MessageSearchMatch` — 单消息匹配结果类型（messageId/snippet/matchOffset）
- `SessionSearchResult` — 单会话搜索结果类型（sessionId/titleMatched/messageMatches）
- `ExportFormat` — 导出格式类型（"json" | "markdown"）

### 检查点（services/session-checkpoint.ts + domain/checkpoint-types.ts）

- `saveCheckpoint` — 保存检查点
- `initCheckpoint` — 初始化检查点
- `clearCheckpoint` — 清除检查点
- `markInterrupted` — 标记会话为中断
- `markRunningAsInterrupted` — 启动时把所有 running 状态标记为 interrupted
- `listInterruptedSessions` — 列出所有中断会话
- `listRunningSessions` — 列出所有运行中会话
- `getCheckpoint` — 获取检查点
- `loadInterruptedSession` — 加载中断会话
- `_resetCheckpointIndex` — 重置检查点索引（仅测试用）
- `createCheckpoint` — 创建检查点工厂函数
- `SessionCheckpoint` — 检查点类型
- `CheckpointIndexEntry` — 检查点索引项类型
- `CheckpointStatus` — 检查点状态类型

## 边界约束

- **类型依赖**：`AgentSession` 类型定义在 `@/modules/agent/domain/types.ts`，本模块通过 `import type` 从 `@/modules/agent` barrel 导入（编译时擦除，无运行时循环）
- **运行时依赖**：仅 `@/shared/file-http`（文件读写 + 配置存储）
- **向后兼容**：`@/modules/agent` barrel 从本模块 re-export 所有公共 API，现有消费者无需修改导入路径
- **配置键**：`agent.sessionIndex`（会话索引）、`agent.checkpoints.index`（检查点索引）

## 恢复流程

1. 应用启动 → `markRunningAsInterrupted()` 更新索引状态
2. UI 调用 `listInterruptedSessions()` 展示中断会话列表
3. 用户选择恢复 → `loadSession()` 加载会话历史
4. 用户重新发送消息 → AgentLoop 创建新 checkpoint 覆盖旧的

## 索引清理策略

- 会话索引：保留最近 50 条
- 检查点索引：保留最近 100 条，`completed` 状态超过 7 天自动清理
