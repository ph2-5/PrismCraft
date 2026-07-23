# Agent Tools Project IO Module ✅

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

> 项目导入导出工具集，从 `agent` 模块拆分而来。

<!-- AI: Before modifying this module, read contract.json for invariants -->

## 模块概览

| 项目 | 内容 |
|------|------|
| 模块路径 | `src/modules/agent-tools-project-io/` |
| 来源 | 从 `src/modules/agent/tools/` 拆分 |
| 工具数量 | 4 个 |
| 依赖方向 | `@/domain/*`, `@/shared/file-http` |

## 背景

agent 模块拆分阶段：将项目导入导出相关工具从 agent/tools 中独立出来，形成项目 IO 工具集模块。

核心改造点：
- 静态导入 `@/shared/file-http`
- 动态导入 `@/modules/asset` 服务

## 子域表

| 子域 | 状态 | 文件 | 工具 | 说明 |
|------|:----:|------|------|------|
| project-io-tools | ✅ | project-io-tools.ts | 4 | 项目导入导出（export_project / import_project / export_characters / export_scenes） |

## Public API

通过 `@/modules/agent-tools-project-io` 导入。

### ✅ 工具实现
- `exportProjectTool` — 导出项目工具（export_project）
- `importProjectTool` — 导入项目工具（import_project）
- `exportCharactersTool` — 导出角色工具（export_characters）
- `exportScenesTool` — 导出场景工具（export_scenes）

### ✅ 工具聚合数组
- `projectIoTools` — 4 个项目 IO 工具的聚合数组
- `allProjectIoTools` — 全量工具聚合（与 projectIoTools 等价，便于统一注册）

### ✅ 类型签名

```typescript
// project-io-tools（4 个）
export {
  exportProjectTool,
  importProjectTool,
  exportCharactersTool,
  exportScenesTool,
  projectIoTools,
} from "./project-io-tools";

// 工具聚合数组
export { allProjectIoTools } from "./index";
```

## 边界约束

- ✅ 允许导入：`@/domain/*`, `@/shared/*`
- ✅ 允许导入：同级模块内的相对路径（`./project-io-tools`）
- ❌ 禁止导入：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）
- ❌ 禁止导入：`@/modules/*/*/*`（深路径）
- ❌ 禁止导入：`@/infrastructure/*`（除 `@/infrastructure/di`）
