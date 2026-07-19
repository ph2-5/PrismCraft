export interface ImageSizeOption {
  width: number;
  height: number;
  label: string;
  aspectRatio: string;
}

export interface ModelCapabilities {
  maxReferences: number;
  maxResolution: number;
  maxSizeMB: number;
  supportsLastFrame: boolean;
  referenceMode: "separate" | "merged";
  supportedFormats?: string[];
  supportedImageSizes?: ImageSizeOption[];
  defaultImageSize?: string;
  providerId?: string;
  urlTtl?: number;
  supportsCharacterRef?: boolean;
  supportsSceneRef?: boolean;
  nativeCharacterRef?: boolean;
  nativeSceneRef?: boolean;
  characterRefMode?: "native_field" | "multimodal" | "ref_field" | "text_append" | "bake_into_first" | "none";
  sceneRefMode?: "native_field" | "multimodal" | "ref_field" | "text_append" | "bake_into_first" | "none";
  imageUploadMode?: "base64" | "url" | "upload";
  maxCharacterRefs?: number;
  promptLanguage?: "en" | "zh" | "auto";
  supportsReferenceVideo?: boolean;
  /**
   * Task 2A.12: 模型支持的最强角色一致性策略。
   * - "multi_ref_fusion": 多参考图融合（IP-Adapter 风格，≥3 张参考图）
   * - "single_ref": 单参考图（如 Kling subject_reference）
   * - "text_only": 仅文本描述（无参考图能力）
   * - "unknown": 未知模型（按 maxCharacterRefs 推断）
   *
   * 与 characterRefMode 的关系：
   *   - consistencyStrategy 描述"能用几张图"
   *   - characterRefMode 描述"怎么把图传给 provider"
   */
  consistencyStrategy?: "multi_ref_fusion" | "single_ref" | "text_only" | "unknown";
  /**
   * Task 2A.20: 最大视频时长（秒）。
   * - Seedance 2.5: 30
   * - Seedance 2.0/1.5: 15/10
   * - 未指定时 fallback 到 15 秒（ModelParameterPanel FALLBACK_DURATIONS）
   */
  maxDuration?: number;
  /**
   * Task 2A.20: 是否支持局部重绘（partial edit）。
   * Seedance 2.5 原生支持，其他模型默认 false。
   * 为 Task 2A.22（局部重绘）提供能力探测基础。
   */
  supportsPartialEdit?: boolean;
  /**
   * Task 2A.20: 是否支持 3D 白膜预览输入。
   * Seedance 2.5 原生支持 3D 白盒输入，其他模型默认 false。
   * 为 Task 2A.21（3D 白盒编辑器）提供能力探测基础。
   */
  supports3DPreview?: boolean;
  /**
   * Task 2A.20: 全模态参考素材上限（图/视频/音频混合）。
   * - Seedance 2.5: 50（30 图 + 10 视频 + 10 音频）
   * - 其他模型未指定时 fallback 到 maxReferences
   */
  maxModalReferences?: number;
}

export interface ModelParameterProfile {
  modelId: string;
  displayName?: string;
  providerId?: string;
  isUserPlugin?: boolean;
  isCodePlugin?: boolean;
  capabilities: ModelCapabilities;
  parameters: {
    durations?: Array<{ value: number; label: string }>;
    resolutions?: Array<{ value: string; label: string; width: number; height: number }>;
    styles?: Array<{ value: string; label: string; description?: string }>;
    negativePrompt?: boolean;
    seed?: boolean;
    cfgScale?: { min: number; max: number; default: number; step: number };
    lora?: boolean;
  };
}

export enum ReferencePriority {
  CHARACTER_REF = 1,
  SCENE_REF = 2,
  FIRST_FRAME = 3,
  LAST_FRAME = 4,
  KEYFRAME_COMPOSITION = 5,
  PREV_KEYFRAME_STYLE = 6,
}

export interface ReferenceImageItem {
  url: string;
  priority: ReferencePriority;
  description?: string;
  type: "character" | "scene" | "firstFrame" | "lastFrame" | "keyframe" | "prevKeyframe";
}

export type ImageSizePurpose = "style_guide" | "keyframe" | "frame" | "character" | "scene";

export type ReferenceDeliveryMode =
  | "native_field"
  | "bake_into_first"
  | "both";

export interface ReferenceStrategy {
  characterRef: ReferenceDeliveryMode;
  sceneRef: ReferenceDeliveryMode;
}

export interface VideoGenerationStrategy {
  useFirstFrame: boolean;
  useLastFrame: boolean;
  useCharacterRef: boolean;
  useSceneRef: boolean;
  characterRefMode: string;
  sceneRefMode: string;
  imageUploadMode: string;
  maxCharacterRefs: number;
  referenceStrategy: ReferenceStrategy;
  promptLanguage: "en" | "zh" | "auto";
  supportsReferenceVideo: boolean;
}

/**
 * Task 3.2 Step 3：未知模型的默认能力策略。
 * - `conservative`（默认）：未知模型不支持 lastFrame/characterRefs/sceneRef，避免浪费生成内容
 * - `aggressive`：未知模型默认支持所有能力（旧行为，依赖主进程兜底）
 */
export type UnknownModelStrategy = "conservative" | "aggressive";
