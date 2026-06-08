import { errorLogger } from "@/shared/error-logger";
import type { ModelCapabilities, ImageSizeOption, ImageSizePurpose, ReferenceImageItem } from "./model-capabilities-types";
import { BUILTIN_MODEL_CAPABILITIES } from "./builtin-model-capabilities";
import { modelProfilesCache } from "./model-parameter-profile";

export { ReferencePriority } from "./model-capabilities-types";

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

export function getSupportedImageSizes(modelId: string): ImageSizeOption[] {
  const capabilities = getModelCapabilities(modelId);
  return capabilities.supportedImageSizes || [
    { width: capabilities.maxResolution, height: capabilities.maxResolution, label: "1:1", aspectRatio: "1:1" },
  ];
}
