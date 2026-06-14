interface CharacterAnchor {
  elementId: string;
  referenceImageUrl?: string;
  featureTags?: string[];
  weight: number;
}

export interface FeatureAnchoringConfig {
  enabled: boolean;
  characterAnchors: CharacterAnchor[];
  disableFrameBinding?: boolean;
  featureConsistencyStrength?: number;
}

interface Element {
  id: string;
  name: string;
}

interface ConfigCheckParams {
  featureAnchoring: FeatureAnchoringConfig;
  elements: Element[];
}

interface CharacterScore {
  elementId: string;
  elementName: string;
  score: number;
  issues: string[];
}

interface ConfigCheckResult {
  passed: boolean;
  characterScores: CharacterScore[];
  overallScore: number;
  recommendation: "accept" | "adjust" | "regenerate";
}

interface ValidationConfigResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

interface FrameBindingValidationResult {
  valid: boolean;
  error?: string;
}

export function performConfigCheck(params: ConfigCheckParams): ConfigCheckResult {
  const { featureAnchoring, elements } = params;
  const characterScores: CharacterScore[] = [];

  for (const anchor of featureAnchoring.characterAnchors) {
    const element = elements.find((e) => e.id === anchor.elementId);
    const issues: string[] = [];

    if (!anchor.referenceImageUrl) {
      issues.push("缺少角色参考图");
    }

    if (!anchor.featureTags || anchor.featureTags.length === 0) {
      issues.push("缺少角色特征标签，一致性约束可能不足");
    }

    const score = Math.max(0, 0.8 - issues.length * 0.3);

    characterScores.push({
      elementId: anchor.elementId,
      elementName: element?.name || "未知角色",
      score,
      issues,
    });
  }

  const overallScore =
    characterScores.length > 0
      ? characterScores.reduce((sum, s) => sum + s.score, 0) /
        characterScores.length
      : 0;

  const allIssues = characterScores.reduce<string[]>(
    (acc, s) => acc.concat(s.issues),
    [],
  );
  const passed = overallScore >= 0.6 && allIssues.length === 0;

  let recommendation: ConfigCheckResult["recommendation"];
  if (overallScore >= 0.8) {
    recommendation = "accept";
  } else if (overallScore >= 0.5) {
    recommendation = "adjust";
  } else {
    recommendation = "regenerate";
  }

  return {
    passed,
    characterScores,
    overallScore,
    recommendation,
  };
}

export function performConsistencyCheck(params: ConfigCheckParams): ConfigCheckResult {
  return performConfigCheck({
    featureAnchoring: params.featureAnchoring,
    elements: params.elements,
  });
}

export function validateFeatureAnchoringConfig(
  config: FeatureAnchoringConfig,
): ValidationConfigResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!config.enabled) {
    return { valid: true, warnings, errors };
  }

  if (!config.characterAnchors || config.characterAnchors.length === 0) {
    errors.push("特征锚定已启用但未配置任何角色锚点");
  }

  if (config.characterAnchors) {
    for (const anchor of config.characterAnchors) {
      if (!anchor.referenceImageUrl) {
        errors.push(`角色锚点"${anchor.elementId}"缺少参考图`);
      }
      if (!anchor.featureTags || anchor.featureTags.length === 0) {
        warnings.push(`角色锚点"${anchor.elementId}"缺少特征标签`);
      }
      if (anchor.weight < 0.3 || anchor.weight > 1.0) {
        warnings.push(
          `角色锚点"${anchor.elementId}"权重异常(${anchor.weight})，建议范围0.3-1.0`,
        );
      }
    }
  }

  if (!config.disableFrameBinding) {
    warnings.push("特征锚定模式下建议禁用帧绑定(disableFrameBinding=true)");
  }

  if (config.featureConsistencyStrength !== undefined && config.featureConsistencyStrength < 0.3) {
    warnings.push("特征一致性强度过低，可能导致角色崩坏");
  }
  if (config.featureConsistencyStrength !== undefined && config.featureConsistencyStrength > 0.95) {
    warnings.push("特征一致性强度过高，可能限制视频动态表现力");
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

export function validateNoFrameBinding(params: {
  videoRequestParams?: {
    previousLastFrameUrl?: string;
    fixedImage?: { lockType?: string };
  };
}): FrameBindingValidationResult {
  const videoRequestParams = params.videoRequestParams || {};

  if (videoRequestParams.previousLastFrameUrl) {
    return {
      valid: false,
      error: "禁止使用上一分镜尾帧作为参考帧，特征锚定模式下不依赖帧间绑定",
    };
  }

  if (
    videoRequestParams.fixedImage &&
    (videoRequestParams.fixedImage.lockType === "first_frame" ||
      videoRequestParams.fixedImage.lockType === "last_frame")
  ) {
    return {
      valid: false,
      error: "特征锚定模式下禁止将参考图绑定为首帧或尾帧，参考图仅做特征约束",
    };
  }

  return { valid: true };
}
