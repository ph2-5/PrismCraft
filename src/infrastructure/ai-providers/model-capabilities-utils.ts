/**
 * 模型能力查询工具
 *
 * 能力查询优先级（从高到低）：
 * 1. 插件模型配置（modelProfilesCache）- 运行时从插件加载
 * 2. 内置模型能力（BUILTIN_MODEL_CAPABILITIES）- 精确匹配
 * 3. 内置模型能力 - 前缀匹配（如 "seedance-pro-2-custom" 匹配 "seedance-pro-2"）
 * 4. 保守默认值 - 确保未知模型也能安全运行
 */

import { errorLogger } from "@/shared/error-logger";
import type { ModelCapabilities, ImageSizeOption, ImageSizePurpose, ReferenceImageItem, VideoGenerationStrategy, ReferenceDeliveryMode, UnknownModelStrategy } from "./model-capabilities-types";
import { BUILTIN_MODEL_CAPABILITIES } from "./builtin-model-capabilities";
import { modelProfilesCache } from "./model-parameter-profile";

export { ReferencePriority } from "./model-capabilities-types";

/**
 * Task 3.2 Step 3：未知模型的默认能力策略。
 * 默认 conservative，避免未知模型浪费生成内容（如 lastFrame 被主进程丢弃）。
 */
let unknownModelStrategy: UnknownModelStrategy = "conservative";

/** 获取当前未知模型策略 */
export function getUnknownModelStrategy(): UnknownModelStrategy {
  return unknownModelStrategy;
}

/** 设置未知模型策略（设置页可切换为 aggressive 恢复旧行为） */
export function setUnknownModelStrategy(strategy: UnknownModelStrategy): void {
  unknownModelStrategy = strategy;
}

/** conservative 默认值：未知模型不支持 lastFrame/characterRefs/sceneRef */
const CONSERVATIVE_DEFAULTS: ModelCapabilities = {
  maxReferences: 1,
  maxResolution: 1024,
  maxSizeMB: 5,
  supportsLastFrame: false,
  referenceMode: "separate",
  urlTtl: 3600,
  defaultImageSize: "1024x1024",
  supportedImageSizes: [
    { width: 1024, height: 1024, label: "1:1", aspectRatio: "1:1" },
  ],
  supportsCharacterRef: false,
  supportsSceneRef: false,
  nativeCharacterRef: false,
  nativeSceneRef: false,
  characterRefMode: "bake_into_first",
  sceneRefMode: "bake_into_first",
  imageUploadMode: "base64",
  supportsReferenceVideo: false,
};

/** aggressive 默认值：未知模型默认支持所有能力（旧行为） */
const AGGRESSIVE_DEFAULTS: ModelCapabilities = {
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
  supportsCharacterRef: true,
  supportsSceneRef: true,
  nativeCharacterRef: false,
  nativeSceneRef: false,
  characterRefMode: "text_append",
  sceneRefMode: "text_append",
  imageUploadMode: "base64",
  supportsReferenceVideo: false,
};

/**
 * 获取模型能力配置
 *
 * 查询优先级：
 * 1. 插件缓存（modelProfilesCache）
 * 2. 内置精确匹配（BUILTIN_MODEL_CAPABILITIES[modelId]）
 * 3. 内置前缀匹配（如 "seedance-pro-2-custom" → "seedance-pro-2"）
 * 4. 保守默认值
 */
export function getModelCapabilities(modelId: string): ModelCapabilities {
  if (modelProfilesCache[modelId]) {
    return modelProfilesCache[modelId].capabilities;
  }

  if (BUILTIN_MODEL_CAPABILITIES[modelId]) {
    return BUILTIN_MODEL_CAPABILITIES[modelId];
  }

  // 按 key 长度降序排序，确保更具体的 key 优先匹配
  // 例如 "seedance-pro-2" 优先于 "seedance-pro"
  // Task 3.2 Step 6：删除冗余的 modelId === key 检查（第 2 层已做精确匹配）
  const sortedEntries = Object.entries(BUILTIN_MODEL_CAPABILITIES).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [key, capabilities] of sortedEntries) {
    if (modelId.startsWith(key + "-") || modelId.startsWith(key.replace(/-\d+$/, "") + "-")) {
      return capabilities;
    }
  }

  // Task 3.2 Step 3：根据 unknownModelStrategy 返回保守或激进默认值
  return unknownModelStrategy === "conservative" ? CONSERVATIVE_DEFAULTS : AGGRESSIVE_DEFAULTS;
}

export function supportsLastFrame(modelId: string): boolean {
  return getModelCapabilities(modelId).supportsLastFrame;
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

function resolveDeliveryMode(refMode: string, nativeRef: boolean | undefined): ReferenceDeliveryMode {
  if (refMode === "native_field" || refMode === "multimodal" || refMode === "ref_field") {
    return nativeRef ? "both" : "native_field";
  }
  return "bake_into_first";
}

export function getVideoGenerationStrategy(modelId: string): VideoGenerationStrategy {
  const capabilities = getModelCapabilities(modelId);
  const charMode = capabilities.characterRefMode ?? (capabilities.supportsCharacterRef ? "text_append" : "none");
  const sceneMode = capabilities.sceneRefMode ?? (capabilities.supportsSceneRef ? "text_append" : "none");

  const charDelivery = charMode === "none" ? "bake_into_first" : resolveDeliveryMode(charMode, capabilities.nativeCharacterRef);
  const sceneDelivery = sceneMode === "none" ? "bake_into_first" : resolveDeliveryMode(sceneMode, capabilities.nativeSceneRef);

  const useCharRef = charMode !== "none" && charMode !== "bake_into_first";
  const useSceneRef = sceneMode !== "none" && sceneMode !== "bake_into_first";

  return {
    useFirstFrame: true,
    useLastFrame: capabilities.supportsLastFrame,
    useCharacterRef: useCharRef,
    useSceneRef: useSceneRef,
    characterRefMode: charMode,
    sceneRefMode: sceneMode,
    imageUploadMode: capabilities.imageUploadMode ?? "base64",
    maxCharacterRefs: capabilities.maxCharacterRefs ?? capabilities.maxReferences,
    referenceStrategy: {
      characterRef: charDelivery,
      sceneRef: sceneDelivery,
    },
    promptLanguage: capabilities.promptLanguage ?? "auto",
    supportsReferenceVideo: capabilities.supportsReferenceVideo ?? false,
  };
}

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
    const first = capabilities.supportedImageSizes[0];
    return `${first?.width ?? capabilities.maxResolution}x${first?.height ?? capabilities.maxResolution}`;
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
