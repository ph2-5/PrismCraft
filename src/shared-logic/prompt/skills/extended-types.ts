/**
 * 扩展 Skill 共享类型（Task 4.7 v5.3 增强）
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 * 所有类型使用 inline 字面量定义，不导入项目其他层。
 *
 * 扩展 Skill 与核心 Skill 共用 AgentContext/Skill 接口（见 skills/index.ts），
 * 但 buildInstructions 返回更具体的视觉/镜头/音频指令片段。
 */

// === 镜头相关类型 ===

export type ShotSize =
  | "extreme_wide"
  | "wide"
  | "medium"
  | "close_up"
  | "extreme_close_up";

export type CameraMovement =
  | "static"
  | "pan"
  | "tilt"
  | "dolly"
  | "handheld"
  | "tracking"
  | "crane";

export type LensParameter = "35mm" | "85mm" | "zoom" | "macro";

export interface CameraInstruction {
  shotSize: ShotSize;
  movement: CameraMovement;
  lens?: LensParameter;
}

// === 光照相关类型 ===

export type LightingType =
  | "natural"
  | "low_key"
  | "high_key"
  | "golden_hour"
  | "neon"
  | "mixed";

export interface LightingInstruction {
  type: LightingType;
  /** 对应的情绪关键词（如 "温馨" → golden_hour） */
  moodKeyword?: string;
}

// === 角色相关类型 ===

export interface CharacterIdentity {
  referenceDescription: string; // 角色身份参考描述
  outfit?: string;
  hairstyle?: string;
  expression?: string;
}

export interface MultiCharacterBlocking {
  positionRelationship: string; // 站位关系
  gazeDirection: string; // 视线方向
  interactionAction?: string; // 互动动作
}

// === 视觉风格相关类型 ===

export type VisualStyle =
  | "cyberpunk"
  | "anime"
  | "realistic"
  | "ink_wash"
  | "cinematic";

// === 特效相关类型 ===

export type VfxCategory = "particle" | "destruction" | "energy" | "weather";

export type VfxParticle =
  | "fire"
  | "smoke"
  | "magic"
  | "snow"
  | "rain";

export type VfxWeather =
  | "sunny"
  | "cloudy"
  | "rainy"
  | "snowy"
  | "foggy";

// === 音频相关类型 ===

export interface AudioDialogue {
  tone: string; // 语气
  speed: string; // 语速
  emotion: string; // 情绪
}

export interface AudioMusic {
  bgmStyle: string; // BGM 风格
  tempo: string; // 节奏
  emotion: string; // 情绪
}

export interface AudioEnvironment {
  ambient: string; // 背景音
  atmosphere: string; // 氛围音
}

export interface AudioInstruction {
  dialogue?: AudioDialogue;
  music?: AudioMusic;
  environment?: AudioEnvironment;
  lipSync?: boolean; // 是否需要口型同步
}
