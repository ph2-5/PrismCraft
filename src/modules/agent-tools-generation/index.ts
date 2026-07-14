/**
 * Agent Tools - Generation 模块
 *
 * 设计要点：
 * - 通过 barrel 导出工具数组和工具实现
 * - 内部实现细节不导出
 * - 其他模块通过 @/modules/agent-tools-generation 导入
 *
 * 本模块从 agent/tools/ 拆分而来（阶段3-2），包含 AI 生成与图像编辑工具。
 * 这些工具均为叶子工具集，无 agent/services 依赖，可直接独立。
 */

// AI 生成工具（9 个）
export {
  generateCharacterImageTool,
  generateSceneImageTool,
  generatePropImageTool,
  analyzeImageTool,
  generateTextTool,
  generateMusicTool,
  generateVoiceoverTool,
  textToSpeechTool,
  transcribeAudioTool,
  generationTools,
} from "./generation-tools";

// 图像编辑工具（10 个）
export {
  editImageTool,
  cropImageTool,
  mergeImagesTool,
  compositeImageTool,
  removeBackgroundTool,
  applyFilterTool,
  adjustColorsTool,
  inpaintTool,
  addTextOverlayTool,
  resizeImageTool,
  imageEditTools,
} from "./image-edit-tools";
