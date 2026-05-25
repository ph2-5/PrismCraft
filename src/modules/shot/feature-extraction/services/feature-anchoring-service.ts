import type { FeatureAnchoringConfig } from "@/domain/schemas";

export type BlendMode = "anchor_only" | "chain_only" | "blend";

export interface BlendConfig {
  mode: BlendMode;
  chainWeight: number;
  anchorWeight: number;
  autoFallback: boolean;
}

export interface AnchoringValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  effectiveStrength: number;
}

export interface BlendPromptResult {
  prompt: string;
  chainWeight: number;
  anchorWeight: number;
  mode: BlendMode;
}

export function validateFeatureAnchoring(
  config: FeatureAnchoringConfig,
): AnchoringValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.enabled) {
    return {
      valid: true,
      errors: [],
      warnings: [],
      effectiveStrength: 0,
    };
  }

  if (!config.characterAnchors || config.characterAnchors.length === 0) {
    errors.push("特征锚定启用时必须指定至少一个角色锚点");
  }

  for (const anchor of config.characterAnchors || []) {
    if (!anchor.elementId) {
      errors.push("角色锚点缺少元素ID");
    }
    if (!anchor.referenceImageUrl) {
      errors.push(`角色锚点 ${anchor.elementId} 缺少参考图片`);
    }
    if (!anchor.featureTags || anchor.featureTags.length === 0) {
      warnings.push(`角色锚点 ${anchor.elementId} 没有指定特征标签，将使用默认特征`);
    }
    if (anchor.weight < 0 || anchor.weight > 1) {
      errors.push(`角色锚点 ${anchor.elementId} 的权重必须在 0-1 之间`);
    }
  }

  for (const anchor of config.propAnchors || []) {
    if (!anchor.elementId) {
      errors.push("道具锚点缺少元素ID");
    }
    if (!anchor.referenceImageUrl) {
      errors.push(`道具锚点 ${anchor.elementId} 缺少参考图片`);
    }
  }

  if (config.featureConsistencyStrength < 0 || config.featureConsistencyStrength > 1) {
    errors.push("特征一致性强度必须在 0-1 之间");
  }

  const effectiveStrength = config.enabled
    ? config.featureConsistencyStrength || 0.8
    : 0;

  if (effectiveStrength > 0.9) {
    warnings.push("特征一致性强度过高可能导致生成结果过于僵化");
  }

  if (effectiveStrength < 0.3) {
    warnings.push("特征一致性强度过低可能无法保证角色一致性");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    effectiveStrength,
  };
}

export function validateBlendConfig(config: FeatureAnchoringConfig): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.blend) {
    return { valid: true, errors: [], warnings: [] };
  }

  const { mode, chainWeight, anchorWeight, autoFallback: _autoFallback } = config.blend;

  if (chainWeight < 0 || chainWeight > 1) {
    errors.push("链式权重必须在 0-1 之间");
  }

  if (anchorWeight < 0 || anchorWeight > 1) {
    errors.push("锚定权重必须在 0-1 之间");
  }

  if (mode === "blend") {
    const totalWeight = chainWeight + anchorWeight;
    if (Math.abs(totalWeight - 1) > 0.01) {
      warnings.push(`blend模式下链式权重(${chainWeight})和锚定权重(${anchorWeight})总和应接近1，当前总和: ${totalWeight}`);
    }
  }

  if (mode === "anchor_only" && chainWeight > 0) {
    warnings.push("anchor_only模式下链式权重将不起作用");
  }

  if (mode === "chain_only" && anchorWeight > 0) {
    warnings.push("chain_only模式下锚定权重将不起作用");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function getBlendMode(config: FeatureAnchoringConfig): BlendMode {
  return config.blend?.mode || "anchor_only";
}

export function shouldUseChainReference(config: FeatureAnchoringConfig, hasPrevFrame: boolean): boolean {
  const mode = getBlendMode(config);
  
  if (mode === "chain_only") return hasPrevFrame;
  if (mode === "anchor_only") return false;
  
  if (mode === "blend") {
    const chainWeight = config.blend?.chainWeight || 0.5;
    return hasPrevFrame && chainWeight > 0;
  }
  
  return hasPrevFrame;
}

export function buildBlendPrompt(
  basePrompt: string,
  config: FeatureAnchoringConfig,
  chainReference?: { imageUrl?: string; description?: string },
): BlendPromptResult {
  const mode = getBlendMode(config);
  const chainWeight = config.blend?.chainWeight ?? 0.5;
  const anchorWeight = config.blend?.anchorWeight ?? 0.5;

  if (mode === "anchor_only") {
    return {
      prompt: buildAnchorPrompt(basePrompt, config),
      chainWeight: 0,
      anchorWeight,
      mode,
    };
  }

  if (mode === "chain_only") {
    return {
      prompt: buildChainPrompt(basePrompt, chainReference),
      chainWeight,
      anchorWeight: 0,
      mode,
    };
  }

  if (mode === "blend") {
    const anchorPrompt = buildAnchorPrompt(basePrompt, config);
    buildChainPrompt(basePrompt, chainReference);
    
    if (!chainReference?.imageUrl) {
      return {
        prompt: anchorPrompt,
        chainWeight: 0,
        anchorWeight,
        mode,
      };
    }

    return {
      prompt: `${anchorPrompt}. Also maintain visual consistency with the previous frame: ${chainReference.description || "scene continuity"}`,
      chainWeight,
      anchorWeight,
      mode,
    };
  }

  return {
    prompt: basePrompt,
    chainWeight: 0.5,
    anchorWeight: 0.5,
    mode: "anchor_only",
  };
}

function buildAnchorPrompt(basePrompt: string, config: FeatureAnchoringConfig): string {
  const anchorDescriptions: string[] = [];

  for (const anchor of config.characterAnchors || []) {
    const tags = anchor.featureTags?.join(", ") || "character features";
    anchorDescriptions.push(`consistent ${tags} as reference image`);
  }

  if (anchorDescriptions.length === 0) {
    return basePrompt;
  }

  return `${basePrompt}. Character appearance: ${anchorDescriptions.join("; ")}`;
}

function buildChainPrompt(basePrompt: string, chainReference?: { imageUrl?: string; description?: string }): string {
  if (!chainReference?.imageUrl) {
    return basePrompt;
  }

  const chainDesc = chainReference.description || "continuity from previous frame";
  return `${basePrompt}. Maintain visual consistency with previous frame: ${chainDesc}`;
}

export function performAutoFallback(
  config: FeatureAnchoringConfig,
  errorType: "anchor_failed" | "chain_failed" | "both_failed",
): { newConfig: FeatureAnchoringConfig; fallbackReason: string } {
  if (!config.blend?.autoFallback) {
    return { newConfig: config, fallbackReason: "autoFallback disabled" };
  }

  const mode = getBlendMode(config);

  if (mode === "blend") {
    if (errorType === "anchor_failed") {
      return {
        newConfig: { ...config, blend: { ...config.blend, mode: "chain_only" } },
        fallbackReason: "锚定失败，降级到链式模式",
      };
    }
    if (errorType === "chain_failed") {
      return {
        newConfig: { ...config, blend: { ...config.blend, mode: "anchor_only" } },
        fallbackReason: "链式失败，降级到锚定模式",
      };
    }
  }

  if (mode === "chain_only" && errorType === "chain_failed") {
    return {
      newConfig: { ...config, blend: { ...config.blend, mode: "anchor_only" } },
      fallbackReason: "链式失败，降级到锚定模式",
    };
  }

  if (mode === "anchor_only" && errorType === "anchor_failed") {
    return {
      newConfig: { ...config, blend: { ...config.blend, mode: "chain_only" } },
      fallbackReason: "锚定失败，降级到链式模式",
    };
  }

  return { newConfig: config, fallbackReason: "no fallback needed" };
}

export function validateNoFrameBinding(
  config: FeatureAnchoringConfig,
): { valid: boolean; reason?: string } {
  if (!config.enabled) return { valid: true };

  if (!config.disableFrameBinding) {
    return {
      valid: false,
      reason: "特征锚定模式下必须禁用帧绑定(disableFrameBinding=true)，否则可能导致角色外观在帧间漂移",
    };
  }

  return { valid: true };
}

export function performConfigCheck(
  config: FeatureAnchoringConfig,
): {
  anchoringValid: boolean;
  frameBindingValid: boolean;
  blendValid: boolean;
  allValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const anchoringResult = validateFeatureAnchoring(config);
  const frameBindingResult = validateNoFrameBinding(config);
  const blendResult = validateBlendConfig(config);

  const allErrors = [...anchoringResult.errors, ...blendResult.errors];
  if (!frameBindingResult.valid && frameBindingResult.reason) {
    allErrors.push(frameBindingResult.reason);
  }

  const allWarnings = [...anchoringResult.warnings, ...blendResult.warnings];

  return {
    anchoringValid: anchoringResult.valid,
    frameBindingValid: frameBindingResult.valid,
    blendValid: blendResult.valid,
    allValid: anchoringResult.valid && frameBindingResult.valid && blendResult.valid,
    errors: allErrors,
    warnings: allWarnings,
  };
}
