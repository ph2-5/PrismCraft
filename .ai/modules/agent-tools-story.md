# Agent Tools Story 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| barrel/crud | 🟡 中 | 故事 CRUD（5 个）、deleteStoryTool 需确认、动态导入 storyboard service |
| planning | 🔴 高 | AI 规划故事分镜（2 个）、调用 textProvider、JSON 解析（extractJsonArray/extractJsonObject） |
| generation | 🔴 高 | 故事生成（3 个：风格指南/首尾帧提示词/故事创意）、调用 imageProvider/characterStorage/sceneStorage |
| suggestions | 🟡 中 | 故事建议（3 个：角色背景/场景描述/一致性检查）、调用 textProvider |

## 子域依赖图

```
story-tools.ts（barrel，自身实现 5 个 CRUD + re-export 8 个拆分工具 + 聚合 storyTools 数组）
  ├── story-tools-planning.ts（2 个） ← @/infrastructure/di（container.textProvider）、@/shared-logic/json
  ├── story-tools-generation.ts（3 个） ← @/infrastructure/di（container.imageProvider / characterStorage / sceneStorage）
  ├── story-tools-suggestions.ts（3 个） ← @/infrastructure/di（container.textProvider）
  ← @/modules/storyboard, @/modules/character, @/modules/scene（动态导入 service）
  ↑
index.ts（barrel）
  ↑
@/modules/agent/tools/index.ts（通过 toolRegistry 注册）
```

- `story-tools.ts` 是子域 barrel，自身实现 CRUD 工具 + re-export 8 个拆分工具 + 聚合 `storyTools` 数组
- 三个拆分文件彼此独立，均为叶子工具集
- 业务 service 通过动态导入避免静态循环依赖
- JSON 解析使用 `@/shared-logic/json`（`extractJsonArray`、`extractJsonObject`）

## 公共 API

### Story CRUD Tools（5 个，定义在 story-tools.ts）
- `listStoriesTool` / `getStoryTool` / `createStoryTool` / `updateStoryTool` / `deleteStoryTool`（需确认）

### Story Planning Tools（2 个）
- `planStoryTool` / `validateStoryPlanTool`

### Story Generation Tools（3 个）
- `generateStyleGuideTool` / `generateFramePromptsTool` / `generateStoryIdeasTool`

### Story Suggestions Tools（3 个）
- `suggestCharacterBackstoryTool` / `suggestSceneDescriptionTool` / `checkStoryConsistencyTool`

### 聚合导出
- `storyTools` — 所有故事工具数组（13 个）

## 常见修改场景

### 1. 新增故事工具
- 修改文件：按职责选择 `story-tools.ts`（CRUD）或对应拆分文件（planning/generation/suggestions），在 `index.ts` 追加 export，更新 `storyTools` 数组
- 检查不变量：工具命名唯一、所有工具声明 `dangerLevel`、deleteStoryTool `requiresConfirmation: true`、JSON 解析使用 `@/shared-logic/json`
- 测试：`npx vitest run src/modules/agent-tools-story/__tests__/story-tools.test.ts`

### 2. 修改 AI 规划或生成逻辑
- 修改文件：`story-tools-planning.ts`（planStoryTool / validateStoryPlanTool）或 `story-tools-generation.ts`（generateStyleGuideTool 等）
- 检查不变量：通过 `container.textProvider` / `container.imageProvider` 获取 provider；AI 返回 JSON 通过 `extractJsonArray` / `extractJsonObject` 安全解析
- 测试：`npx vitest run src/modules/agent-tools-story/__tests__/story-tools.test.ts`

### 3. 修改故事建议或一致性检查
- 修改文件：`story-tools-suggestions.ts`
- 检查不变量：通过 `container.textProvider` 获取 provider
- 测试：`npx vitest run src/modules/agent-tools-story/__tests__/story-tools.test.ts`

### 4. 修改故事 CRUD 引用检查
- 修改文件：`story-tools.ts`（deleteStoryTool）
- 检查不变量：删除前需检查是否被分镜引用，通过动态 `import("@/modules/storyboard")` 获取 service
- 测试：`npx vitest run src/modules/agent-tools-story/__tests__/story-tools.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`（constants）、`@/shared-logic/*`（json）、`@/infrastructure/di`、`@/modules/storyboard`、`@/modules/character`、`@/modules/scene`（动态导入）
- **禁止导入**：`@/modules/agent/*`（agent 依赖本模块工具数组，避免循环）、`@/infrastructure/*`（除 DI）、`@/modules/*/*/*`（深路径）
- **禁止**：直接调用 `electronAPI.*`
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：业务 service 通过动态导入避免静态循环依赖
- **必须**：JSON 解析使用 `@/shared-logic/json`（`extractJsonArray`、`extractJsonObject`）

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-tools-story`
- 关键测试文件：
  - `__tests__/story-tools.test.ts` — 13 个故事工具
