# Agent Tools Specialist Module

> 专家委派工具集（P4 多 Agent 编排），从 `agent` 模块拆分而来。

<!-- AI: Before modifying this module, read contract.json for invariants -->

## 模块概览

| 项目 | 内容 |
|------|------|
| 模块路径 | `src/modules/agent-tools-specialist/` |
| 来源 | 从 `src/modules/agent/tools/` 拆分 |
| 工具数量 | 2 个 |
| 依赖方向 | `@/domain/*`, `@/modules/agent-specialist` |

## 背景

agent 模块拆分阶段：将专家委派相关工具从 agent/tools 中独立出来，形成专家委派工具集模块（P4 多 Agent 编排）。

核心改造点：
- 通过动态 `import("@/modules/agent")` 获取 `runSpecialist` / `listAvailableSpecialists`
- 静态导入 `@/modules/agent-specialist` 的 `specialistRegistry`

## 子域表

| 子域 | 文件 | 工具 | 说明 |
|------|------|------|------|
| specialist-tools | specialist-tools.ts | 2 | 专家委派（delegate_to_specialist / list_specialists） |

## Public API

```typescript
// specialist-tools（2 个）
export {
  delegateToSpecialistTool,
  listSpecialistsTool,
  specialistTools,
} from "./specialist-tools";

// 工具聚合数组
export { allSpecialistTools } from "./index";
```

## 边界约束

- ✅ 允许导入：`@/domain/*`, `@/modules/agent-specialist`
- ✅ 允许导入：同级模块内的相对路径（`./specialist-tools`）
- ❌ 禁止导入：`@/modules/agent/*`（通过动态 import 异步获取 agent 服务）
- ❌ 禁止导入：`@/modules/*/*/*`（深路径）
- ❌ 禁止导入：`@/infrastructure/*`（除 `@/infrastructure/di`）
