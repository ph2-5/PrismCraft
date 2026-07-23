<!-- AI: Before modifying this module, read contract.json for invariants -->

# Agent Tools - Story Module ✅

> 故事创作工具模块 — 从 agent/tools/ 拆分而来（阶段3-2）。

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 模块概览

- **定位**：从 agent 模块拆分出的独立工具集模块，包含故事 CRUD、规划、生成、建议工具
- **核心**：13 个工具实现（5 个 CRUD + 2 个 planning + 3 个 generation + 3 个 suggestions），通过 `toolRegistry` 注册到 agent
- **依赖**：仅依赖 `@/domain/types/agent-tools`、`@/shared/constants/tool-timeouts`、`@/infrastructure/di`、`@/shared-logic/json`、`@/modules/storyboard`、`@/modules/character`、`@/modules/scene`

## 背景

这些工具均为叶子工具集，无 `agent/services` 依赖，因此可独立成模块。从 `@/modules/agent/tools/` 拆分后，agent 模块通过 `@/modules/agent-tools-story` 导入工具数组并注册。

## 子域

| 子域 | 状态 | 路径 | 职责 |
|------|:----:|------|------|
| barrel | ✅ | `story-tools.ts` | 主入口 barrel：CRUD 工具实现 + re-export 拆分工具 + 聚合 storyTools 数组 |
| planning | ✅ | `story-tools-planning.ts` | 故事规划工具（plan_story、validate_story_plan） |
| generation | ✅ | `story-tools-generation.ts` | 故事生成工具（风格指南、首尾帧提示词、故事创意） |
| suggestions | ✅ | `story-tools-suggestions.ts` | 故事建议工具（角色背景、场景描述、一致性检查） |

## Public API

### ✅ Story CRUD Tools（5 个，定义在 story-tools.ts）

- `listStoriesTool` — 列出所有故事（支持过滤/分页）
- `getStoryTool` — 获取故事详情（含分镜）
- `createStoryTool` — 创建故事
- `updateStoryTool` — 更新故事
- `deleteStoryTool` — 删除故事（需确认）

### ✅ Story Planning Tools（2 个）

- `planStoryTool` — AI 规划故事分镜
- `validateStoryPlanTool` — 校验分镜计划

### ✅ Story Generation Tools（3 个）

- `generateStyleGuideTool` — 生成风格指南
- `generateFramePromptsTool` — 生成分镜首尾帧提示词
- `generateStoryIdeasTool` — 生成故事创意

### ✅ Story Suggestions Tools（3 个）

- `suggestCharacterBackstoryTool` — 建议角色背景故事
- `suggestSceneDescriptionTool` — 建议场景描述
- `checkStoryConsistencyTool` — 故事逻辑一致性检查

### ✅ 聚合导出

- `storyTools` — 所有故事工具数组（13 个）

## 边界约束

- **禁止**：本模块导入 `@/modules/agent/*`（agent 模块依赖本模块的工具数组，避免循环）
- **禁止**：本模块导入 `@/infrastructure/*`（除 `@/infrastructure/di` 用于 container）
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：业务 service 通过动态导入（`@/modules/storyboard` 等），避免静态循环依赖
- **必须**：JSON 解析使用 `@/shared-logic/json`（`extractJsonArray`、`extractJsonObject`）

## 依赖方向

```
agent-tools-story → @/domain/types/agent-tools（类型）
                  → @/shared/constants/tool-timeouts
                  → @/infrastructure/di（container.imageProvider / characterStorage / sceneStorage）
                  → @/shared-logic/json（extractJsonArray / extractJsonObject）
                  → @/modules/storyboard（动态导入 storyService）
                  → @/modules/character, @/modules/scene（动态导入 service）
```

## 内部结构

```
story-tools.ts (barrel)
  ├── 自身实现 CRUD 工具（5 个）
  ├── import 自 story-tools-planning.ts（2 个）
  ├── import 自 story-tools-generation.ts（3 个）
  ├── import 自 story-tools-suggestions.ts（3 个）
  ├── re-export 上述 8 个拆分工具（保持向后兼容）
  └── 聚合导出 storyTools 数组（13 个）
```
