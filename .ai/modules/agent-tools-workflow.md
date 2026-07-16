# Agent Tools Workflow 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| workflow-tools | 🔴 高 | 5 个工作流编排工具、create/execute/batch/chain/schedule、通过 DI container 异步获取 toolExecutor/toolRegistry |
| subworkflow-video | 🔴 高 | 完整自动生成分镜/视频（2 个工具）、长耗时操作、视频任务轮询、AI JSON 推理 |
| subworkflow-novel | 🔴 高 | 从小说自动创建（1 个工具）、NOVEL_TEXT_MAX_CHARS 输入校验、AI JSON 推理 |
| subworkflow-character/scene/story | 🟡 中 | 自动创建角色/场景/规划分镜（各 1 个工具）、调用 imageProvider/characterService/sceneService/storyService |
| subworkflow-polish | 🟡 中 | 自动精修视频（1 个工具）、调用 videoProvider |
| subworkflow-utility | 🟡 中 | 自动查找导入素材/修复常见错误（2 个工具） |
| subworkflow-helpers | 🟡 中 | 共享辅助函数（AI JSON 推理/工具执行/视频轮询） |
| barrel | 🟢 低 | 仅 index.ts 聚合导出 |

## 子域依赖图

```
workflow-tools.ts（5 个） ← @/infrastructure/di（container.agentToolExecutor / agentToolRegistry 异步获取）
subworkflow-tools.ts（barrel 聚合，0 个工具实现）
  ├── subworkflow-helpers.ts（0 个工具，共享辅助函数） ← container.textProvider、executeTool、pollVideoTask
  ├── subworkflow-character-tools.ts（1 个） ← container.imageProvider、@/modules/character
  ├── subworkflow-scene-tools.ts（1 个） ← container.imageProvider、@/modules/scene
  ├── subworkflow-story-tools.ts（1 个） ← @/modules/storyboard
  ├── subworkflow-novel-tools.ts（1 个） ← container.textProvider（AI JSON 推理）
  ├── subworkflow-video-tools.ts（2 个） ← container.videoProvider、pollVideoTask
  ├── subworkflow-polish-tools.ts（1 个） ← container.videoProvider
  └── subworkflow-utility-tools.ts（2 个） ← executeTool
  ↑
index.ts（barrel + allWorkflowTools 聚合）
  ↑
@/modules/agent/tools/index.ts（通过 toolRegistry 注册）
```

- `workflow-tools.ts` 与 `subworkflow-helpers.ts` 原先静态导入 `agent/services/tool-executor` 和 `tool-registry`，拆分后改为通过 DI container 异步获取
- `subworkflow-tools.ts` 是 barrel 聚合文件，聚合 7 个子流程实现文件
- `subworkflow-helpers.ts` 提供共享辅助函数（AI JSON 推理/工具执行/视频轮询）
- 工具聚合数组 `allWorkflowTools` = `workflowTools` + `subworkflowTools`

## 公共 API

### Workflow 工具（5 个）
- `createWorkflowTool` / `executeWorkflowTool` / `batchProcessTool` / `chainOperationsTool` / `scheduleTaskTool`
- `workflowTools` — 工作流编排工具聚合数组（5 个）

### Subworkflow 工具（9 个）
- `autoCreateCharacterTool` / `autoCreateSceneTool` / `autoPlanStoryboardTool`
- `autoCreateFromNovelTool` / `autoGenerateBeatFullTool` / `autoGenerateVideoFullTool`
- `autoPolishVideoTool` / `autoFindAndImportAssetTool` / `autoFixCommonErrorsTool`
- `subworkflowTools` — 子流程工具聚合数组（9 个）

### 共享辅助函数与常量
- `NOVEL_TEXT_MAX_CHARS` — 小说文本最大字符数常量（用于 auto_create_from_novel 输入校验）
- `generateJsonWithAI` — 调用 AI 生成单个 JSON 对象的辅助函数
- `generateJsonArrayWithAI` — 调用 AI 生成 JSON 数组的辅助函数
- `executeTool` — 通过 DI container 执行工具调用的辅助函数
- `pollVideoTask` — 轮询视频任务直至完成的辅助函数
- `toStringArray` — 将未知类型安全转换为 string[] 的辅助函数

### 工具聚合数组
- `allWorkflowTools` — 全部 14 个工作流工具的聚合数组（workflow + subworkflow）

## 常见修改场景

### 1. 新增工作流编排工具
- 修改文件：`workflow-tools.ts`，在 `index.ts` 追加 export，更新 `allWorkflowTools` 数组
- 检查不变量：工具命名唯一、所有工具声明 `dangerLevel`、通过 `await container.agentToolExecutor` / `await container.agentToolRegistry` 异步获取 agent 服务
- 测试：`npx vitest run src/modules/agent-tools-workflow/__tests__/workflow-tools.test.ts`

### 2. 新增子流程工具
- 修改文件：按职责选择对应 `subworkflow-*-tools.ts`，在 `subworkflow-tools.ts` 追加 import 和 export，更新 `subworkflowTools` 数组
- 检查不变量：工具命名唯一、所有工具声明 `dangerLevel`、AI JSON 推理使用 `generateJsonWithAI` / `generateJsonArrayWithAI`、视频任务轮询使用 `pollVideoTask`
- 测试：`npx vitest run src/modules/agent-tools-workflow/__tests__/subworkflow-tools.test.ts`

### 3. 修改共享辅助函数
- 修改文件：`subworkflow-helpers.ts`（`generateJsonWithAI` / `generateJsonArrayWithAI` / `executeTool` / `pollVideoTask` / `toStringArray`）
- 检查不变量：`executeTool` 通过 `await container.agentToolExecutor` 执行；`pollVideoTask` 轮询直至任务完成或超时；`NOVEL_TEXT_MAX_CHARS` 限制小说输入长度
- 测试：`npx vitest run src/modules/agent-tools-workflow/__tests__/`

### 4. 修改视频自动生成子流程
- 修改文件：`subworkflow-video-tools.ts`（autoGenerateBeatFullTool / autoGenerateVideoFullTool）
- 检查不变量：通过 `container.videoProvider` 创建视频任务；通过 `pollVideoTask` 轮询直至完成
- 测试：`npx vitest run src/modules/agent-tools-workflow/__tests__/subworkflow-tools.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared-logic/*`、`@/shared/*`、`@/infrastructure/di`
- **禁止导入**：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）、`@/infrastructure/*`（除 `@/infrastructure/di`）、`@/modules/*/*/*`（深路径）
- **禁止**：直接调用 `electronAPI.*`
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：`toolExecutor` / `toolRegistry` 通过 `await container.agentToolExecutor` / `await container.agentToolRegistry` 异步获取
- **必须**：跨模块 service（character/scene/storyboard）通过动态 import 获取

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-tools-workflow`
- 关键测试文件：
  - `__tests__/workflow-tools.test.ts` — 5 个工作流编排工具
  - `__tests__/subworkflow-tools.test.ts` — 9 个子流程工具
