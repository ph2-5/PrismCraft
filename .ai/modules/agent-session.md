# Agent Session 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| services/session-storage | 🔴 高 | 会话持久化（覆盖同名文件）、会话索引维护（保留最近 50 条）、write-then-clean 模式 |
| services/session-checkpoint | 🔴 高 | P5 断点恢复、检查点索引维护、启动时 `markRunningAsInterrupted` 状态迁移、索引清理策略 |
| services/session-search | 🟡 中 | 跨会话搜索、JSON/Markdown 序列化导出（重置 streaming 字段） |
| domain | 🟢 低 | 检查点类型定义 + createCheckpoint 工厂函数（零外部依赖） |

## 子域依赖图

```
domain/checkpoint-types.ts（SessionCheckpoint 等 + createCheckpoint，零依赖）
  ↑
services/session-storage.ts ← @/shared/file-http
services/session-checkpoint.ts ← @/shared/file-http、domain/checkpoint-types
services/session-search.ts ← @/shared/file-http
  │（三个 services 彼此独立）
  ↑
@/modules/agent barrel（re-export 保持向后兼容）
@/modules/agent/services/agent-loop.ts（持久化 + 检查点）
@/modules/agent/presentation/SessionHistory.tsx（会话历史 UI）
@/modules/agent/presentation/CheckpointRecovery.tsx（断点恢复 UI）
```

- `domain` 是底层类型子域，零外部依赖
- `services` 三个文件彼此独立：session-storage（持久化）、session-checkpoint（断点恢复）、session-search（搜索导出）
- `AgentSession` 类型定义在 `@/modules/agent/domain/types.ts`，本模块通过 `import type` 引用（编译时擦除，无运行时循环）
- agent barrel 从本模块 re-export 所有公共 API，保持向后兼容

## 公共 API

### 会话存储（services/session-storage.ts）
- `saveSession` / `loadSession` / `listSessions` / `updateSessionIndex` / `deleteSession` / `persistSession`
- `SessionListItem` — 会话列表项类型

### 会话搜索与导出（services/session-search.ts）
- `searchSessionList` — 按标题过滤会话列表项（快速过滤，不加载会话内容）
- `searchInSession` — 单会话内搜索消息内容（返回 snippet + offset）
- `searchAcrossSessions` — 跨多会话搜索（全局搜索历史消息）
- `serializeSessionAsJSON` / `serializeSessionAsMarkdown` — 序列化导出
- `buildExportFilename` — 生成导出文件名（清理非法字符、加日期时间戳）
- `MessageSearchMatch` / `SessionSearchResult` / `ExportFormat` 类型

### 检查点（services/session-checkpoint.ts + domain/checkpoint-types.ts）
- `saveCheckpoint` / `initCheckpoint` / `clearCheckpoint`
- `markInterrupted` / `markRunningAsInterrupted`（启动时迁移状态）
- `listInterruptedSessions` / `listRunningSessions` / `getCheckpoint` / `loadInterruptedSession`
- `_resetCheckpointIndex`（仅测试用）
- `createCheckpoint` — 工厂函数
- `SessionCheckpoint` / `CheckpointIndexEntry` / `CheckpointStatus` 类型

## 常见修改场景

### 1. 修改会话持久化或索引维护
- 修改文件：`services/session-storage.ts`
- 检查不变量：会话保存到 `{cacheDir}/agent/sessions/`（每个会话一个 JSON 文件，覆盖同名文件）；会话索引保留最近 50 条；通过 `@/shared/file-http` 持久化（禁止直接 `electronAPI`）；配置键 `agent.sessionIndex`
- 测试：`npx vitest run src/modules/agent-session/services/__tests__/session-checkpoint.test.ts`

### 2. 修改 P5 断点恢复逻辑
- 修改文件：`services/session-checkpoint.ts`
- 检查不变量：检查点信息附加在 `AgentSession.checkpoint` 字段随会话一同持久化；单独维护索引 `agent.checkpoints.index`（保留最近 100 条，`completed` 状态超过 7 天自动清理）；启动时 `markRunningAsInterrupted()` 更新索引状态
- 恢复流程：应用启动 → markRunningAsInterrupted → listInterruptedSessions → loadSession → 用户重发消息时 AgentLoop 创建新 checkpoint 覆盖旧的
- 测试：`npx vitest run src/modules/agent-session/services/__tests__/session-checkpoint.test.ts`

### 3. 修改会话搜索或导出
- 修改文件：`services/session-search.ts`
- 检查不变量：`serializeSessionAsJSON` 重置 streaming 字段；`serializeSessionAsMarkdown` 含角色图标、toolCalls 代码块；`buildExportFilename` 清理非法字符并加日期时间戳
- 测试：`npx vitest run src/modules/agent-session/services/__tests__/session-search.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`（file-http）、`@/shared-logic/*`
- **类型级依赖**：`@/modules/agent`（仅 `import type` AgentSession，编译时擦除，无运行时循环）
- **禁止导入**：`@/infrastructure/*`、其他 `@/modules/*`（运行时）
- **禁止**：直接调用 `electronAPI.*`（文件操作必须走 `@/shared/file-http`）
- **必须**：所有持久化通过 `@/shared/file-http`（文件读写 + 配置存储）
- **必须**：`@/modules/agent` barrel 从本模块 re-export 所有公共 API，保持向后兼容

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-session`
- 关键测试文件：
  - `services/__tests__/session-checkpoint.test.ts` — 检查点初始化/更新/清除/中断检测
  - `services/__tests__/session-search.test.ts` — 会话搜索与序列化导出
