# Agent Tools Template Module

> 模板工具集（项目模板 + Prompt 模板），从 `agent` 模块拆分而来。

<!-- AI: Before modifying this module, read contract.json for invariants -->

## 模块概览

| 项目 | 内容 |
|------|------|
| 模块路径 | `src/modules/agent-tools-template/` |
| 来源 | 从 `src/modules/agent/tools/` 拆分 |
| 工具数量 | 9 个 |
| 依赖方向 | `@/domain/*`, `@/shared/*`, `@/infrastructure/di` |

## 背景

agent 模块拆分阶段：将项目模板管理与 Prompt 模板管理工具从 agent/tools 中独立出来，形成模板工具集模块。

核心改造点：
- `template-tools` 通过 DI container 访问 `videoTaskStorage`
- 两者都动态导入 character/scene/storyboard 服务

## 子域表

| 子域 | 文件 | 工具 | 说明 |
|------|------|------|------|
| template-tools | template-tools.ts | 5 | 项目模板管理（list_templates / apply_template / create_template / import_template / export_template） |
| prompt-template-tools | prompt-template-tools.ts | 4 | Prompt 模板管理 |

## Public API

```typescript
// template-tools（5 个）
export {
  listTemplatesTool,
  applyTemplateTool,
  createTemplateTool,
  importTemplateTool,
  exportTemplateTool,
  templateTools,
} from "./template-tools";

// prompt-template-tools（4 个）
export { promptTemplateTools } from "./prompt-template-tools";

// 工具聚合数组
export { allTemplateTools } from "./index";
```

## 边界约束

- ✅ 允许导入：`@/domain/*`, `@/shared/*`, `@/infrastructure/di`
- ✅ 允许导入：同级模块内的相对路径（`./template-tools` 等）
- ❌ 禁止导入：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）
- ❌ 禁止导入：`@/modules/*/*/*`（深路径）
- ❌ 禁止导入：`@/infrastructure/*`（除 `@/infrastructure/di`）
