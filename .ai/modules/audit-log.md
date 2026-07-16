# Audit Log 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| services/audit-storage | 🔴 高 | JSONL 持久化（每会话一文件）、单会话最大 500 条淘汰最旧、内存缓存、write-then-clean 模式 |

## 子域依赖图

```
services/audit-storage.ts
  ← @/domain/*（AuditEntry / AuditQueryFilter 类型）
  ← @/shared/file-http（writeFile / readFile / getCacheDirectory / deleteFile）
  ← @/modules/agent（动态 import listSessions 用于全局查询/清空场景）
  ↑
index.ts（barrel）
  ↑
@/modules/agent/services/agent-loop.ts（recordAudit 调用点）
@/modules/agent/presentation/AuditLogPanel.tsx（UI 面板）
```

- 单一 services 子域，结构简单
- 持久化通过 `@/shared/file-http` 统一层（不直接调 IPC）
- 文件位置：`{cacheDir}/agent/audit/{sessionId}.jsonl`
- 不依赖 agent 模块内部文件（仅通过 `@/modules/agent` 公共 API 动态导入 `listSessions` 用于全局查询/清空场景）

## 公共 API

### Functions
- `recordAudit` — 记录一条审计日志（entry: Omit<AuditEntry, "timestamp">）
- `queryAuditLogs` — 查询审计日志（支持按会话/工具/状态/时间筛选）
- `clearAuditLogs` — 清空指定会话的审计日志（sessionId: string）
- `clearAllAuditLogs` — 清空所有审计日志
- `getAuditStats` — 获取审计日志统计信息

### Types
- `AuditEntry` — 审计日志条目
- `AuditQueryFilter` — 审计日志查询过滤条件

## 常见修改场景

### 1. 修改审计日志存储格式
- 修改文件：`services/audit-storage.ts`
- 检查不变量：JSONL 格式存储到 `{cacheDir}/agent/audit/{sessionId}.jsonl`；单会话最大 500 条淘汰最旧；specialist 字段区分主 Agent(undefined)/子 Agent(专家名)；通过 `@/shared/file-http` 持久化（禁止直接 `electronAPI`）
- 测试：手动验证 AgentPage 工具栏 ScrollText 图标打开面板

### 2. 修改审计日志查询或统计
- 修改文件：`services/audit-storage.ts`（`queryAuditLogs` / `getAuditStats`）
- 检查不变量：支持按会话/工具/状态/时间筛选；统计信息包含工具调用次数、成功率等
- 测试：手动验证 AuditLogPanel 查询功能

### 3. 修改审计日志清除逻辑
- 修改文件：`services/audit-storage.ts`（`clearAuditLogs` / `clearAllAuditLogs`）
- 检查不变量：`clearAuditLogs(sessionId)` 清空指定会话；`clearAllAuditLogs` 清空所有；全局清空需动态 `import("@/modules/agent")` 获取 `listSessions`
- 测试：手动验证清除功能

### 4. 修改 recordAudit 调用点
- 修改文件：`@/modules/agent/services/agent-loop.ts`（recordAudit 调用点）
- 检查不变量：每次工具调用均记录审计日志；specialist 字段区分主 Agent / 子 Agent
- 测试：手动验证 Agent 工具调用后面板显示记录

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`（file-http）、`@/modules/agent`（仅动态 import `listSessions`）
- **禁止导入**：`@/modules/agent/*`（深路径，仅通过 barrel 动态 import）、`@/infrastructure/*`、其他 `@/modules/*`
- **禁止**：直接调用 `electronAPI.*`（文件操作必须走 `@/shared/file-http`）
- **必须**：所有持久化通过 `@/shared/file-http`（writeFile / readFile / getCacheDirectory / deleteFile）

## 测试验证

- 测试命令：`npx vitest run src/modules/audit-log`
- 关键测试：本模块无独立测试目录，由 `src/modules/agent/services/__tests__/agent-loop.test.ts` 覆盖 recordAudit 集成场景
