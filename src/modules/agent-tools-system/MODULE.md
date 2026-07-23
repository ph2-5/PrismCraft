# Agent Tools System Module ✅

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

> 系统/项目工具集，从 `agent` 模块拆分而来。

<!-- AI: Before modifying this module, read contract.json for invariants -->

## 模块概览

| 项目 | 内容 |
|------|------|
| 模块路径 | `src/modules/agent-tools-system/` |
| 来源 | 从 `src/modules/agent/tools/system-tools.ts` 拆分 |
| 行数 | ~170 行（1 源文件 + 1 测试文件） |
| 工具数量 | 3 个 |
| 依赖方向 | `@/domain/*`, `@/shared/*`, `@/infrastructure/di` |

## 背景

agent 模块拆分阶段3-3：将 system 相关工具从 agent/tools 中独立出来，形成单一职责的系统信息查询工具模块。

核心改造点：
- `getAppInfoTool` 原先通过 `await import("../services/tool-registry")` 动态导入 agent/services
- 拆分后改为通过 DI container 异步获取：`await container.agentToolRegistry`
- 消除了对 `@/modules/agent/*` 的依赖（静态和动态都消除）

## 子域表

| 子域 | 状态 | 文件 | 工具 | 说明 |
|------|:----:|------|------|------|
| system-tools | ✅ | system-tools.ts | 3 | 系统信息查询（project_stats / app_info / disk_usage） |

## Public API

通过 `@/modules/agent-tools-system` 导入。

### ✅ 工具实现
- `getProjectStatsTool` — 项目统计概览工具（get_project_stats），返回角色/场景/视频任务/已配置能力
- `getAppInfoTool` — 应用信息工具（get_app_info），返回版本/平台/可用工具数
- `getDiskUsageTool` — 磁盘使用工具（get_disk_usage），返回缓存目录磁盘占用

### ✅ 工具聚合数组
- `systemTools` — 3 个系统工具的聚合数组
- `allSystemTools` — 全量工具聚合（与 systemTools 等价，便于统一注册）

### ✅ 类型签名

```typescript
// 工具实现（3 个）
export { getProjectStatsTool, getAppInfoTool, getDiskUsageTool } from "./system-tools";

// 工具聚合数组
export { systemTools } from "./system-tools";
export { allSystemTools } from "./index";
```

## 边界约束

- ✅ 允许导入：`@/domain/*`, `@/shared/*`, `@/infrastructure/di`
- ✅ 允许导入：同级模块内的相对路径（`./system-tools`）
- ❌ 禁止导入：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）
- ❌ 禁止导入：`@/modules/*/*/*`（深路径）
- ❌ 禁止导入：`@/infrastructure/*`（除 `@/infrastructure/di`）

## 依赖说明

| 依赖 | 用途 | 获取方式 |
|------|------|---------|
| `toolRegistry` | 获取可用工具数量和名称（getAppInfoTool） | `await container.agentToolRegistry` |
| `characterService` | 查询角色数量（getProjectStatsTool） | 动态 `import("@/modules/character")` |
| `sceneService` | 查询场景数量（getProjectStatsTool） | 动态 `import("@/modules/scene")` |
| `useVideoTaskStore` | 查询视频任务状态统计（getProjectStatsTool） | 动态 `import("@/modules/video/task-management")` |
| `checkConfigStatus` | 查询已配置能力（getProjectStatsTool） | 动态 `import("@/shared/api-config")` |
| `getCacheDirectory` / `getDiskSpace` | 磁盘使用查询（getDiskUsageTool） | 动态 `import("@/shared/file-http")` |
