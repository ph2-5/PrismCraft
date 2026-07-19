/**
 * Task 2A.13 v5.3 增强 — 故事 Treatment（剧本大纲）
 *
 * 借鉴 seedance-2.0 的 pro-filmmaking-standards.md 工作流：
 * 在识别叙事节点之后，新增"产出可编辑的 treatment"步骤。
 * treatment 是结构化的故事大纲（logline/theme/characterArcs/tone），
 * 由 AI 从 segments 提取，用户可编辑后再进入分镜生成。
 *
 * 这是 seedance "返回 production object first, then prompt" 模式的核心应用——
 * 先产出可编辑的工作产物（treatment + shot contract），再据此构造 prompt。
 *
 * 依赖方向：零外部依赖，所有类型自包含。
 */

/**
 * 故事基调（tone）枚举。
 *
 * 用于指导 AI 生成 prompt 时选择合适的视觉风格与镜头语言。
 */
export const STORY_TONES = [
  "drama",    // 剧情：写实、情感为主
  "comedy",   // 喜剧：明快、节奏紧凑
  "thriller", // 惊悚：暗调、紧张
  "horror",   // 恐怖：极度压抑、惊吓
  "romance",  // 爱情：温馨、柔和
  "action",   // 动作：激烈、动感
] as const;

export type StoryTone = typeof STORY_TONES[number];

/**
 * 角色弧光描述。
 *
 * 描述一个角色在故事中的成长/变化轨迹。
 * characterId 应关联到 NovelPipeline 中的 ExtractedCharacter 或已匹配的 Character。
 */
export interface CharacterArc {
  /** 角色标识（可以是 ExtractedCharacter.id 或匹配后的 Character.id） */
  characterId: string;
  /** 角色名（便于人类阅读，不参与逻辑） */
  characterName?: string;
  /** 弧光描述（如"从懦弱到勇敢"） */
  arc: string;
}

/**
 * 故事 Treatment（结构化大纲）。
 *
 * 由 treatment-extractor.ts 调用 AI 从 NovelSegment[] 提取，
 * 用户可在 UI 中编辑后保存。后续 shot contract 生成会引用 treatment。
 */
export interface StoryTreatment {
  /** 一句话故事梗概（25-50 字） */
  logline: string;
  /** 主题（如"成长"/"救赎"/"复仇"） */
  theme: string;
  /** 角色弧光列表 */
  characterArcs: CharacterArc[];
  /** 故事基调 */
  tone: StoryTone;
  /** 世界观/设定描述（50-200 字） */
  settingDescription: string;
}

/**
 * 空的 treatment（用于初始化或错误回退）。
 */
export const EMPTY_TREATMENT: StoryTreatment = {
  logline: "",
  theme: "",
  characterArcs: [],
  tone: "drama",
  settingDescription: "",
};

/**
 * 校验 treatment 是否完整（所有必填字段非空）。
 *
 * 不完整的 treatment 不能用于生成 shot contract。
 */
export function isTreatmentComplete(treatment: StoryTreatment): boolean {
  return (
    treatment.logline.trim().length > 0 &&
    treatment.theme.trim().length > 0 &&
    treatment.settingDescription.trim().length > 0
  );
}
