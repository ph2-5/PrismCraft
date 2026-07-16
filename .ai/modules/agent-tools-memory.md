# Agent Tools Memory 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| memory-tools | 🟡 中 | 6 个记忆管理工具、静态导入 @/modules/agent-memory 的函数、操作核心/归档记忆 |

## 子域依赖图

```
memory-tools.ts（6 个工具）
  ← @/domain/types/agent-tools（ToolImpl 类型）
  ← @/modules/agent-memory（静态导入 memoryService 函数）
  ↑
index.ts（barrel + allMemoryTools 聚合）
  ↑
@/modules/agent/tools/index.ts（通过 toolRegistry 注册）
```

- 单一工具文件，结构简单
- 静态导入 `@/modules/agent-memory` 的函数（memoryService 已是单例）
- 工具聚合数组 `allMemoryTools` 与 `memoryTools` 等价，便于统一注册

## 公共 API

### 工具实现
- `saveMemoryTool` — 保存记忆工具（save_memory）
- `recallMemoryTool` — 召回记忆工具（recall_memory）
- `getUserPreferencesTool` — 获取用户偏好工具（get_user_preferences）
- `updatePreferenceTool` — 更新偏好工具（update_preference）
- `deleteMemoryTool` — 删除记忆工具（delete_memory）
- `listArchivalMemoryTool` — 列出归档记忆工具（list_archival_memory）

### 工具聚合数组
- `memoryTools` — 6 个记忆工具的聚合数组
- `allMemoryTools` — 全量工具聚合（与 memoryTools 等价，便于统一注册）

## 常见修改场景

### 1. 新增记忆管理工具
- 修改文件：`memory-tools.ts`，在 `index.ts` 追加 export，更新 `memoryTools` 数组
- 检查不变量：工具命名唯一、所有工具声明 `dangerLevel`、删除类工具 `requiresConfirmation: true`、记忆操作通过 `@/modules/agent-memory` 静态导入
- 测试：`npx vitest run src/modules/agent-tools-memory/__tests__/memory-tools.test.ts`

### 2. 修改记忆工具的参数 schema
- 修改文件：`memory-tools.ts`
- 检查不变量：JSON Schema 参数必须声明 maxLength/minimum/maximum 约束
- 测试：`npx vitest run src/modules/agent-tools-memory/__tests__/memory-tools.test.ts`

### 3. 修改记忆工具的执行逻辑
- 修改文件：`memory-tools.ts`（execute 函数）
- 检查不变量：调用 `@/modules/agent-memory` 的公共 API，不直接操作存储；错误消息通过 `sanitizeErrorMessage()` 脱敏后返回 LLM
- 测试：`npx vitest run src/modules/agent-tools-memory/__tests__/memory-tools.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`、`@/modules/agent-memory`
- **禁止导入**：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）、`@/infrastructure/*`（除 `@/infrastructure/di`）、`@/modules/*/*/*`（深路径）
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：记忆操作通过 `@/modules/agent-memory` 公共 API，不直接操作存储

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-tools-memory`
- 关键测试文件：
  - `__tests__/memory-tools.test.ts` — 6 个记忆管理工具
