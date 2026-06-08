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
