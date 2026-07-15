# Agent Tools Memory Module

> 记忆管理工具集，从 `agent` 模块拆分而来。

<!-- AI: Before modifying this module, read contract.json for invariants -->

## 模块概览

| 项目 | 内容 |
|------|------|
| 模块路径 | `src/modules/agent-tools-memory/` |
| 来源 | 从 `src/modules/agent/tools/` 拆分 |
| 工具数量 | 6 个 |
| 依赖方向 | `@/domain/*`, `@/shared/*`, `@/modules/agent-memory` |

## 背景

agent 模块拆分阶段：将记忆管理相关工具从 agent/tools 中独立出来，形成记忆工具集模块。

核心改造点：
- 静态导入 `@/modules/agent-memory` 的函数

## 子域表

| 子域 | 文件 | 工具 | 说明 |
|------|------|------|------|
| memory-tools | memory-tools.ts | 6 | 记忆管理（save_memory / recall_memory / get_user_preferences / update_preference / delete_memory / list_archival_memory） |

## Public API

```typescript
// memory-tools（6 个）
export {
  saveMemoryTool,
  recallMemoryTool,
  getUserPreferencesTool,
  updatePreferenceTool,
  deleteMemoryTool,
  listArchivalMemoryTool,
  memoryTools,
} from "./memory-tools";

// 工具聚合数组
export { allMemoryTools } from "./index";
```

## 边界约束

- ✅ 允许导入：`@/domain/*`, `@/shared/*`, `@/modules/agent-memory`
- ✅ 允许导入：同级模块内的相对路径（`./memory-tools`）
- ❌ 禁止导入：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）
- ❌ 禁止导入：`@/modules/*/*/*`（深路径）
- ❌ 禁止导入：`@/infrastructure/*`（除 `@/infrastructure/di`）
