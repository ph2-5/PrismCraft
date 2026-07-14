/**
 * Agent Tools - Asset 模块
 *
 * 设计要点：
 * - 通过 barrel 导出工具数组和工具实现
 * - 内部实现细节不导出
 * - 其他模块通过 @/modules/agent-tools-asset 导入
 *
 * 本模块从 agent/tools/ 拆分而来（阶段3-2），包含资产查询与资产 CRUD 工具。
 * 这些工具均为叶子工具集，无 agent/services 依赖，可直接独立。
 */

// 资产查询工具（5 个）
export {
  listCharactersTool,
  listScenesTool,
  getCharacterTool,
  getSceneTool,
  searchAssetsTool,
  assetTools,
} from "./asset-tools";

// 资产 CRUD 工具（9 个）
export {
  createCharacterTool,
  updateCharacterTool,
  deleteCharacterTool,
  createSceneTool,
  updateSceneTool,
  deleteSceneTool,
  tagAssetTool,
  organizeAssetsTool,
  deduplicateAssetsTool,
  assetCrudTools,
} from "./asset-crud-tools";
