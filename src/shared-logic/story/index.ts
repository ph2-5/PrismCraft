export {
  fixShotParams,
  fixStoryBeat,
  validateStoryPlan,
  parseStoryPlanJSON,
  convertToStoryBeats,
  generateStoryPlanWithValidation,
} from "./story-service";
export type {
  RawStoryBeat,
  StoryBeat,
  StoryPlanValidationResult,
} from "./story-service";

export {
  generateBeatKeyframe,
  generateBeatFramePair,
  generateBeatVideo,
  generateBeatFullWorkflow,
  generateKeyframeChain,
} from "./storyboard-generation";
export type {
  Beat as StoryboardBeat,
  ApiGateway as StoryboardApiGateway,
} from "./storyboard-generation";

// P3.3：故事导演配置推荐（自动故事结构 → 导演规则）
export {
  buildDirectorConfig,
  inferPacing,
  recommendEmotionRules,
  EMOTION_RULES,
  CONTINUITY_RULES,
} from "./story-director-config";
export type {
  DirectorPacing,
  DirectorConfigBeatInput,
  BeatDirectorConfig,
  DirectorConfigOutput,
} from "./story-director-config";
