export {
  QUALITY_TAGS_IMAGE,
  QUALITY_TAGS_VIDEO,
  STYLE_KEYWORDS,
  SCENE_TYPE_KEYWORDS,
  MOOD_KEYWORDS,
  LIGHTING_KEYWORDS,
  CAMERA_ANGLE_KEYWORDS,
  CAMERA_MOVEMENT_KEYWORDS,
  joinParts,
  buildCharacterFullDesc,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
} from "./base";

export {
  generateCharacterImagePrompt,
  generateCharacterDetailedPromptInstruction,
  generateSimpleCharacterImagePrompt,
} from "./character";

export {
  generateSceneImagePrompt,
  generateSimpleSceneImagePrompt,
  generateScenePromptOptimization,
} from "./scene";

export {
  generateBeatImagePrompt,
  generateSimpleBeatImagePrompt,
} from "./beat-image";

export {
  generateProfessionalVideoPrompt,
  generateEnhancedVideoPrompt,
  generateQuickVideoPrompt,
  generateSingleBeatPrompt,
} from "./video";

export {
  generateFirstFramePrompt,
  generateLastFramePrompt,
  generateKeyframePrompt,
  generateCharacterAnalysisPrompt,
  generateSceneAnalysisPrompt,
} from "./server-prompts";

export {
  PromptBuilder,
  promptBuilder,
  generateStoryPlanPrompt,
  generateQuickModeVideoPrompt,
  AVAILABLE_STYLES,
  getDurationOptions,
  getResolutionOptions,
  getDurationOptionsForModel,
  getResolutionOptionsForModel,
  getStyleOptionsForModel,
} from "./builder";

export { ModelSelector, useModelSelection, type ModelSelection } from "./presentation";

// Task 4.7：Prompt 配方库（Skill 调用模式）
export {
  getRecipe,
  listRecipes,
  applyRecipe,
  getRecipeSkillIds,
  registerCustomRecipe,
  unregisterCustomRecipe,
  PromptRecipePanel,
} from "./prompt-recipes";
export type {
  RecipeId,
  SkillCombination,
  RecipeSkillParams,
  Recipe,
  PromptRecipePanelProps,
} from "./prompt-recipes";

// 提示词模板库（用户可编辑 + 内置高质量预设）
export type {
  PromptTemplateCategory,
  PromptTemplateTarget,
  PromptTemplateVariable,
  PromptTemplate,
  CreatePromptTemplateInput,
  ApplyTemplateResult,
  NegativePromptConfig,
  NegativePromptScene,
  OptimizedPromptResult,
} from "./templates";

export {
  CATEGORY_LABELS,
  TARGET_LABELS,
  BUILTIN_TEMPLATES,
  initTemplates,
  listPromptTemplates,
  searchPromptTemplates,
  getPromptTemplate,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  applyPromptTemplate,
  exportPromptTemplates,
  importPromptTemplates,
  getPromptTemplateStats,
  // 负面提示词智能生成
  getNegativePrompt,
  enhanceNegativePromptWithLLM,
  getNegativePromptConfig,
  saveNegativePromptConfig,
  getSmartNegativePrompt,
  // 提示词 LLM 自动优化
  optimizeCharacterPrompt,
  optimizeVideoPrompt,
  optimizePrompt,
  getCharacterStyles,
  getVideoStyles,
} from "./templates";
