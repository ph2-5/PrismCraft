/**
 * 模型自适应层 - 模型能力配置
 *
 * 定义各视频/图片生成模型的能力参数，包括最大参考图数量、分辨率、
 * 是否支持尾帧等。用于在视频生成时根据模型能力调整参考图和参数。
 *
 * 提供商级能力（supportsLastFrame, maxDuration 等）已统一到 Electron 插件系统
 * (electron/src/plugins/)，通过 plugins/list API 端点获取。
 * 此文件仅保留模型级能力配置。
 */

import { errorLogger } from "@/shared/error-logger";
import { apiClient } from "@/infrastructure/api";

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

export const BUILTIN_MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  "seedance-2.0": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    urlTtl: 86400,
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "3:2", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "2:3", aspectRatio: "2:3" },
    ],
  },
  "seedance-1.5": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    urlTtl: 86400,
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "3:2", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "2:3", aspectRatio: "2:3" },
    ],
  },
  "doubao-seedance-1-0-pro-250528": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    providerId: "volcengine",
    urlTtl: 86400,
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "3:2", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "2:3", aspectRatio: "2:3" },
    ],
  },
  "doubao-seedream-4-0-250828": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: false,
    referenceMode: "separate",
    providerId: "volcengine",
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "3:2", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "2:3", aspectRatio: "2:3" },
    ],
  },
  "kling-v2-master": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    urlTtl: 86400,
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
      { width: 1920, height: 1080, label: "16:9", aspectRatio: "16:9" },
      { width: 1080, height: 1920, label: "9:16", aspectRatio: "9:16" },
    ],
  },
  "kling-v2-pro": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    urlTtl: 86400,
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
      { width: 1920, height: 1080, label: "16:9", aspectRatio: "16:9" },
      { width: 1080, height: 1920, label: "9:16", aspectRatio: "9:16" },
    ],
  },
  "wan-2.7": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    urlTtl: 86400,
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
    ],
  },
  "runway-gen3": {
    maxReferences: 2,
    maxResolution: 1024,
    maxSizeMB: 5,
    supportsLastFrame: false,
    referenceMode: "merged",
    urlTtl: 86400,
    defaultImageSize: "1024x1024",
    supportedImageSizes: [
      { width: 1024, height: 1024, label: "1:1", aspectRatio: "1:1" },
      { width: 1280, height: 768, label: "5:3", aspectRatio: "5:3" },
      { width: 768, height: 1280, label: "3:5", aspectRatio: "3:5" },
    ],
  },
  "svd-2.0": {
    maxReferences: 2,
    maxResolution: 1024,
    maxSizeMB: 5,
    supportsLastFrame: false,
    referenceMode: "merged",
    urlTtl: 86400,
    defaultImageSize: "1024x1024",
    supportedImageSizes: [
      { width: 1024, height: 1024, label: "1:1", aspectRatio: "1:1" },
    ],
  },
  "cogvideox-3": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    urlTtl: 86400,
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
    ],
  },
  "cogvideox-4": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    urlTtl: 86400,
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
    ],
  },
  "pixverse-v6-t2v": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    urlTtl: 86400,
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
      { width: 1920, height: 1080, label: "16:9", aspectRatio: "16:9" },
      { width: 1080, height: 1920, label: "9:16", aspectRatio: "9:16" },
    ],
  },
  "flux-pro": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: false,
    referenceMode: "separate",
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
      { width: 1920, height: 1080, label: "16:9", aspectRatio: "16:9" },
      { width: 1080, height: 1920, label: "9:16", aspectRatio: "9:16" },
    ],
  },
  "seedream-3.0": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: false,
    referenceMode: "separate",
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "3:2", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "2:3", aspectRatio: "2:3" },
    ],
  },
  "sd-3.5": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: false,
    referenceMode: "separate",
    defaultImageSize: "1024x1024",
    supportedImageSizes: [
      { width: 1024, height: 1024, label: "1:1", aspectRatio: "1:1" },
      { width: 1280, height: 720, label: "16:9", aspectRatio: "16:9" },
    ],
  },
  "sdxl": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: false,
    referenceMode: "separate",
    defaultImageSize: "1024x1024",
    supportedImageSizes: [
      { width: 1024, height: 1024, label: "1:1", aspectRatio: "1:1" },
      { width: 1280, height: 720, label: "16:9", aspectRatio: "16:9" },
    ],
  },
  "dall-e-3": {
    maxReferences: 1,
    maxResolution: 1024,
    maxSizeMB: 5,
    supportsLastFrame: false,
    referenceMode: "merged",
    providerId: "openai-compatible",
    defaultImageSize: "1024x1024",
    supportedImageSizes: [
      { width: 1024, height: 1024, label: "1:1", aspectRatio: "1:1" },
      { width: 1024, height: 1792, label: "2:3", aspectRatio: "2:3" },
      { width: 1792, height: 1024, label: "3:2", aspectRatio: "3:2" },
    ],
  },
  "hailuo-2.3": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: false,
    referenceMode: "separate",
    providerId: "minimax",
    urlTtl: 86400,
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
    ],
  },
  "veo-3": {
    maxReferences: 2,
    maxResolution: 1024,
    maxSizeMB: 5,
    supportsLastFrame: true,
    referenceMode: "merged",
    providerId: "google",
    urlTtl: 86400,
    defaultImageSize: "1024x1024",
    supportedImageSizes: [
      { width: 1024, height: 1024, label: "1:1", aspectRatio: "1:1" },
    ],
  },
  "sora-2": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    providerId: "openai-sora",
    urlTtl: 3600,
    defaultImageSize: "1024x1024",
    supportedImageSizes: [
      { width: 1024, height: 1024, label: "1:1", aspectRatio: "1:1" },
      { width: 1024, height: 1792, label: "2:3", aspectRatio: "2:3" },
      { width: 1792, height: 1024, label: "3:2", aspectRatio: "3:2" },
    ],
  },
  "gpt-image-1": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: false,
    referenceMode: "separate",
    providerId: "openai-sora",
    defaultImageSize: "1024x1024",
    supportedImageSizes: [
      { width: 1024, height: 1024, label: "1:1", aspectRatio: "1:1" },
      { width: 1024, height: 1792, label: "2:3", aspectRatio: "2:3" },
      { width: 1792, height: 1024, label: "3:2", aspectRatio: "3:2" },
    ],
  },
};

/** @deprecated Use BUILTIN_MODEL_CAPABILITIES instead */
export const MODEL_CAPABILITIES = BUILTIN_MODEL_CAPABILITIES;

export function getModelCapabilities(modelId: string): ModelCapabilities {
  if (modelProfilesCache[modelId]) {
    return modelProfilesCache[modelId].capabilities;
  }

  if (BUILTIN_MODEL_CAPABILITIES[modelId]) {
    return BUILTIN_MODEL_CAPABILITIES[modelId];
  }

  for (const [key, capabilities] of Object.entries(BUILTIN_MODEL_CAPABILITIES)) {
    const keyParts = key.split("-");
    if (keyParts.length >= 2) {
      const hasPrefix = modelId.startsWith(key.split("-")[0] + "-") && modelId.includes(keyParts.slice(1).join("-"));
      const isSubstring = modelId.includes(key) && key.length >= 4;
      if (hasPrefix || isSubstring) {
        return capabilities;
      }
    }
    if (modelId === key) {
      return capabilities;
    }
  }

  return {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    urlTtl: 3600,
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
    ],
  };
}

export function supportsLastFrame(modelId: string): boolean {
  return getModelCapabilities(modelId).supportsLastFrame;
}

export function getMaxReferences(modelId: string): number {
  return getModelCapabilities(modelId).maxReferences;
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

export function adjustReferenceImages(
  references: ReferenceImageItem[],
  modelId: string,
  mode: "video" | "keyframe" | "framePair" = "video"
): ReferenceImageItem[] {
  const capabilities = getModelCapabilities(modelId);
  const maxRefs = capabilities.maxReferences;

  const sorted = [...references].sort((a, b) => a.priority - b.priority);

  let filtered = sorted;
  if (mode === "video" && !capabilities.supportsLastFrame) {
    filtered = sorted.filter((ref) => ref.type !== "lastFrame");
  }

  if (filtered.length > maxRefs) {
    const kept = filtered.slice(0, maxRefs);
    const dropped = filtered.slice(maxRefs);
    errorLogger.warn(
      `[ModelCapabilities] 参考图数量超限: ${filtered.length} > ${maxRefs}, 丢弃 ${dropped.length} 张`,
      dropped.map((d) => d.type)
    );
    return kept;
  }

  return filtered;
}

export function getVideoGenerationStrategy(modelId: string): {
  useFirstFrame: boolean;
  useLastFrame: boolean;
  useCharacterRef: boolean;
  useSceneRef: boolean;
} {
  const capabilities = getModelCapabilities(modelId);

  return {
    useFirstFrame: true,
    useLastFrame: capabilities.supportsLastFrame,
    useCharacterRef: true,
    useSceneRef: true,
  };
}

export type ImageSizePurpose = "style_guide" | "keyframe" | "frame" | "character" | "scene";

const PURPOSE_ASPECT_RATIO: Record<ImageSizePurpose, string> = {
  style_guide: "1:1",
  keyframe: "16:9",
  frame: "16:9",
  character: "2:3",
  scene: "16:9",
};

export function resolveImageSize(
  modelId: string,
  purpose: ImageSizePurpose = "keyframe",
  preferredSize?: string,
): string {
  if (preferredSize) {
    const capabilities = getModelCapabilities(modelId);
    if (capabilities.supportedImageSizes?.length) {
      const supported = capabilities.supportedImageSizes.some(
        (s) => `${s.width}x${s.height}` === preferredSize || `${s.width}*${s.height}` === preferredSize,
      );
      if (supported) return preferredSize;

      const [prefW, prefH] = preferredSize.split(/[x*]/).map(Number);
      if (prefW && prefH) {
        const closest = findClosestSize(capabilities.supportedImageSizes, prefW, prefH);
        if (closest) return `${closest.width}x${closest.height}`;
      }
    }
    return preferredSize;
  }

  const capabilities = getModelCapabilities(modelId);
  if (capabilities.defaultImageSize) return capabilities.defaultImageSize;

  if (capabilities.supportedImageSizes?.length) {
    const targetRatio = PURPOSE_ASPECT_RATIO[purpose];
    const match = capabilities.supportedImageSizes.find((s) => s.aspectRatio === targetRatio);
    if (match) return `${match.width}x${match.height}`;
    return `${capabilities.supportedImageSizes[0].width}x${capabilities.supportedImageSizes[0].height}`;
  }

  return `${capabilities.maxResolution}x${capabilities.maxResolution}`;
}

function findClosestSize(
  sizes: ImageSizeOption[],
  targetW: number,
  targetH: number,
): ImageSizeOption | null {
  let best: ImageSizeOption | null = null;
  let bestScore = Infinity;
  for (const s of sizes) {
    const ratioDiff = Math.abs(s.width / s.height - targetW / targetH);
    const sizeDiff = Math.abs(s.width - targetW) + Math.abs(s.height - targetH);
    const score = ratioDiff * 1000 + sizeDiff;
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

export function getSupportedImageSizes(modelId: string): ImageSizeOption[] {
  const capabilities = getModelCapabilities(modelId);
  return capabilities.supportedImageSizes || [
    { width: capabilities.maxResolution, height: capabilities.maxResolution, label: "1:1", aspectRatio: "1:1" },
  ];
}

export interface ModelParameterProfile {
  modelId: string;
  displayName?: string;
  providerId?: string;
  isUserPlugin?: boolean;
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

let modelProfilesCache: Record<string, ModelParameterProfile> = {};

export function setModelProfiles(profiles: Record<string, ModelParameterProfile>): void {
  modelProfilesCache = profiles;
}

export function getModelParameterProfile(modelId: string): ModelParameterProfile | undefined {
  return modelProfilesCache[modelId];
}

export function getAllModelProfiles(): Record<string, ModelParameterProfile> {
  return modelProfilesCache;
}

export async function loadModelProfilesFromServer(): Promise<void> {
  try {
    const isElectronEnv = typeof window !== "undefined" && (window as unknown as Record<string, unknown>).electronAPI;
    if (!isElectronEnv) return;

    const response = await apiClient.get<{ modelProfiles?: Record<string, ModelParameterProfile> }>("/plugins/list");
    if (response.ok && response.value?.modelProfiles) {
      setModelProfiles(response.value.modelProfiles);
    }
  } catch (e) {
    errorLogger.warn("[ModelCapabilities] 获取远程模型配置失败，使用内置配置", e);
  }
}
