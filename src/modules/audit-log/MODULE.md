# Audit Log Module ✅

<!-- AI: Before modifying this module, read contract.json for invariants -->

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 概述

审计日志模块，从 agent 模块拆分而来。

提供 Agent 工具调用审计日志的记录、查询、清除和统计能力，用于故障排查、行为审计和使用统计。

## 子域

| 子域 | 状态 | 路径 | 职责 |
|------|:----:|------|------|
| services | ✅ | `./services/` | 审计日志存储服务（JSONL 持久化 + 内存缓存） |

## Public API

### ✅ Functions

- `recordAudit` — 记录一条审计日志（entry: Omit<AuditEntry, "timestamp">）
- `queryAuditLogs` — 查询审计日志（支持按会话/工具/状态/时间筛选）
- `clearAuditLogs` — 清空指定会话的审计日志（sessionId: string）
- `clearAllAuditLogs` — 清空所有审计日志
- `getAuditStats` — 获取审计日志统计信息

### ✅ Types

- `AuditEntry` — 审计日志条目
- `AuditQueryFilter` — 审计日志查询过滤条件

## 边界约束

- 不依赖 agent 模块内部文件（仅通过 `@/modules/agent` 公共 API 动态导入 `listSessions` 用于全局查询/清空场景）
- 持久化通过 `@/shared/file-http` 统一层（不直接调 IPC）
- 文件位置：`{cacheDir}/agent/audit/{sessionId}.jsonl`
