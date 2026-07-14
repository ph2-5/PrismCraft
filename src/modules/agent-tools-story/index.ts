/**
 * Agent Tools - Story 模块
 *
 * 设计要点：
 * - 通过 barrel 导出工具数组和工具实现
 * - story-tools.ts 是子域 barrel，再聚合 planning/generation/suggestions 三个子文件
 * - 其他模块通过 @/modules/agent-tools-story 导入
 *
 * 本模块从 agent/tools/ 拆分而来（阶段3-2），包含故事创作工具集。
 * 这些工具均为叶子工具集，无 agent/services 依赖，可直接独立。
 */

// 故事创作工具（13 个：5 个 CRUD + 2 个 planning + 3 个 generation + 3 个 suggestions）
export {
  listStoriesTool,
  getStoryTool,
  createStoryTool,
  updateStoryTool,
  deleteStoryTool,
  planStoryTool,
  validateStoryPlanTool,
  generateStyleGuideTool,
  generateFramePromptsTool,
  generateStoryIdeasTool,
  suggestCharacterBackstoryTool,
  suggestSceneDescriptionTool,
  checkStoryConsistencyTool,
  storyTools,
} from "./story-tools";
