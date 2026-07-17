export {
  QUALITY_TAGS_IMAGE,
  QUALITY_TAGS_VIDEO,
  joinParts,
  buildCharacterFullDesc,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
  STYLE_KEYWORDS,
  SCENE_TYPE_MAP,
  MOOD_MAP,
  LIGHTING_MAP,
  SHOT_TYPE_MAP,
  CAMERA_MOVEMENT_MAP,
} from "./prompt-engine";

export {
  generateCharacterImagePrompt,
  generateCharacterDetailedPromptInstruction,
  generateSceneImagePrompt,
  generateScenePromptOptimization,
  generateVideoPrompt,
  generateSingleBeatPrompt,
  generateQuickModeVideoPrompt,
  generateKeyframePrompt,
  generateFirstFramePrompt,
  generateLastFramePrompt,
  generateStoryPlanPrompt,
  generateCharacterAnalysisPrompt,
  generateSceneAnalysisPrompt,
} from "./prompt-service";

// === Task 2A.9: Compositor 合成 prompt ===
export { generateCompositorPrompt } from "./compositor-prompt";
export type { PropInput, CompositorPromptParams } from "./compositor-prompt";
export type {
  CharacterInput,
  SceneInput,
  BeatInput,
  ElementInput,
  VideoPromptParams,
  QuickModeParams,
} from "./prompt-service";

// === Task 1.4 v5.3 增强：Skill 路由 + 安全改写 ===
export {
  registerSkill,
  getSkill,
  listSkills,
  clearSkills,
  routeSkill,
} from "./skills";
export type {
  ProjectType,
  FailureDimension,
  FailureContext,
  ConversationTurn,
  AgentContext,
  Skill,
} from "./skills";
export {
  interviewSkill,
  promptSkill,
  compressSkill,
  troubleshootSkill,
} from "./skills";

// === Task 4.7 v5.3 增强：扩展 Skill 体系 ===
export { cameraSkill } from "./skills/camera-skill";
export {
  buildCameraInstruction,
  recommendCameraByMood,
} from "./skills/camera-skill";
export type {
  ShotSize as ExtShotSize,
  CameraMovement as ExtCameraMovement,
  LensParameter,
  CameraInstruction,
} from "./skills/extended-types";

export { lightingSkill } from "./skills/lighting-skill";
export {
  buildLightingInstruction,
  recommendLightingByMood,
} from "./skills/lighting-skill";
export type { LightingType, LightingInstruction } from "./skills/extended-types";

export { charactersSkill } from "./skills/characters-skill";
export {
  buildCharacterIdentity,
  buildMultiCharacterBlocking,
  detectCharacterConflicts,
} from "./skills/characters-skill";
export type {
  CharacterIdentity as ExtCharacterIdentity,
  MultiCharacterBlocking as ExtMultiCharacterBlocking,
} from "./skills/extended-types";
export type { CharacterConflict } from "./skills/characters-skill";

export { styleSkill } from "./skills/style-skill";
export {
  buildStyleInstruction,
  rewriteIpStyle,
  listSupportedStyles,
} from "./skills/style-skill";
export type { VisualStyle } from "./skills/extended-types";

export { vfxSkill } from "./skills/vfx-skill";
export {
  buildParticleEffect,
  buildDestructionEffect,
  buildEnergyEffect,
  buildWeatherEffect,
} from "./skills/vfx-skill";
export type {
  VfxCategory,
  VfxParticle,
  VfxWeather,
} from "./skills/extended-types";

export { audioSkill } from "./skills/audio-skill";
export {
  buildDialogueInstruction,
  buildMusicInstruction,
  buildEnvironmentInstruction,
  buildAudioInstruction,
} from "./skills/audio-skill";
export type {
  AudioDialogue,
  AudioMusic,
  AudioEnvironment,
  AudioInstruction,
} from "./skills/extended-types";

// === Task 4.7 v5.3 增强：多语言词汇表 + 模型 ID 防混淆 ===
export {
  translate,
  getTranslations,
  listConcepts,
  buildMixedPrompt,
} from "./vocabulary";
export type { SupportedLanguage, MultilingualTerm } from "./vocabulary";

export {
  lookupModelId,
  normalizeModelId,
  getModelStandardName,
  listModelEntries,
  listModelsByFamily,
  areSameModel,
} from "./vocabulary";
export type { ModelIdEntry } from "./vocabulary";

export {
  rewriteIp,
  needsUserConfirmation,
  listKnownKeywords,
  filterAntislop,
  hasSlop,
  listSlopVocabulary,
} from "./safety";
export type {
  IpCategory,
  IpRewriteChange,
  IpRewriteResult,
  AntislopReplacement,
  AntislopResult,
} from "./safety";
