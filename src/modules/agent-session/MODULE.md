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

## Public API

```typescript
// 会话存储
import { saveSession, loadSession, listSessions, deleteSession, persistSession } from "@/modules/agent-session";
import type { SessionListItem } from "@/modules/agent-session";

// 检查点
import {
  saveCheckpoint, initCheckpoint, clearCheckpoint,
  markInterrupted, markRunningAsInterrupted,
  listInterruptedSessions, listRunningSessions,
  getCheckpoint, loadInterruptedSession,
} from "@/modules/agent-session";
import type { SessionCheckpoint, CheckpointIndexEntry, CheckpointStatus } from "@/modules/agent-session";
import { createCheckpoint } from "@/modules/agent-session";
```

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
