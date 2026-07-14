# Agent Tools Workflow Module

> 工作流与子流程编排工具集，从 `agent` 模块拆分而来。

<!-- AI: Before modifying this module, read contract.json for invariants -->

## 模块概览

| 项目 | 内容 |
|------|------|
| 模块路径 | `src/modules/agent-tools-workflow/` |
| 来源 | 从 `src/modules/agent/tools/` 拆分 |
| 行数 | ~2,933 行（10 源文件 + 2 测试文件） |
| 工具数量 | 14 个（5 workflow + 9 subworkflow） |
| 依赖方向 | `@/domain/*`, `@/shared-logic/*`, `@/shared/*`, `@/infrastructure/di` |

## 背景

agent 模块拆分阶段3-5：将 workflow 与 subworkflow 相关工具从 agent/tools 中独立出来，形成单一职责的编排工具模块。

核心改造点：
- `workflow-tools.ts` 与 `subworkflow-helpers.ts` 原先静态导入 `agent/services/tool-executor` 和 `agent/services/tool-registry`
- 拆分后改为通过 DI container 异步获取：`await container.agentToolExecutor` / `await container.agentToolRegistry`
- 消除了对 `@/modules/agent/*` 的静态依赖，使模块可独立编译

## 子域表

| 子域 | 文件 | 工具 | 说明 |
|------|------|------|------|
| workflow-tools | workflow-tools.ts | 5 | 工作流编排（create/execute/batch/chain/schedule） |
| subworkflow-barrel | subworkflow-tools.ts | 0 | 子流程 barrel 聚合（不含工具实现） |
| subworkflow-helpers | subworkflow-helpers.ts | 0 | 共享辅助函数（AI JSON 推理/工具执行/视频轮询） |
| subworkflow-character | subworkflow-character-tools.ts | 1 | auto_create_character |
| subworkflow-scene | subworkflow-scene-tools.ts | 1 | auto_create_scene |
| subworkflow-story | subworkflow-story-tools.ts | 1 | auto_plan_storyboard |
| subworkflow-novel | subworkflow-novel-tools.ts | 1 | auto_create_from_novel |
| subworkflow-video | subworkflow-video-tools.ts | 2 | auto_generate_beat_full / auto_generate_video_full |
| subworkflow-polish | subworkflow-polish-tools.ts | 1 | auto_polish_video |
| subworkflow-utility | subworkflow-utility-tools.ts | 2 | auto_find_and_import_asset / auto_fix_common_errors |

## Public API

```typescript
// 工具实现（14 个）
export { createWorkflowTool, executeWorkflowTool, batchProcessTool, chainOperationsTool, scheduleTaskTool } from "./workflow-tools";
export {
  autoCreateCharacterTool, autoCreateSceneTool, autoPlanStoryboardTool,
  autoCreateFromNovelTool, autoGenerateBeatFullTool, autoGenerateVideoFullTool,
  autoPolishVideoTool, autoFindAndImportAssetTool, autoFixCommonErrorsTool,
} from "./subworkflow-tools";

// 工具聚合数组
export { workflowTools } from "./workflow-tools";
export { subworkflowTools } from "./subworkflow-tools";
export { allWorkflowTools } from "./index";

// 共享辅助函数
export {
  NOVEL_TEXT_MAX_CHARS, generateJsonWithAI, generateJsonArrayWithAI,
  executeTool, pollVideoTask, toStringArray,
} from "./subworkflow-helpers";
```

## 边界约束

- ✅ 允许导入：`@/domain/*`, `@/shared-logic/*`, `@/shared/*`, `@/infrastructure/di`
- ✅ 允许导入：同级模块内的相对路径（`./workflow-tools`, `./subworkflow-helpers` 等）
- ❌ 禁止导入：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）
- ❌ 禁止导入：`@/modules/*/*/*`（深路径）
- ❌ 禁止导入：`@/infrastructure/*`（除 `@/infrastructure/di`）

## 依赖说明

| 依赖 | 用途 | 获取方式 |
|------|------|---------|
| `toolExecutor` | 执行工具调用 | `await container.agentToolExecutor` |
| `toolRegistry` | 校验工具是否存在 | `await container.agentToolRegistry` |
| `textProvider` | AI 文本推理（subworkflow-helpers） | `container.textProvider` |
| `imageProvider` | 图片生成（subworkflow-character/scene） | `container.imageProvider` |
| `videoProvider` | 视频任务查询/生成（subworkflow-video/polish） | `container.videoProvider` |
| `characterService` | 角色创建/更新（subworkflow-character） | `@/modules/character` |
| `sceneService` | 场景创建/更新（subworkflow-scene） | `@/modules/scene` |
| `storyService` / `planStory` 等 | 故事/分镜规划（subworkflow-story/novel/video） | `@/modules/storyboard` |
