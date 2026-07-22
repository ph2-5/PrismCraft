import type { ConsistencyCheckResult, FeatureAnchoringConfig, StoryElement } from "@/domain/schemas";

export function performConfigCheck(params: {
  featureAnchoring: FeatureAnchoringConfig;
  elements: StoryElement[];
}): ConsistencyCheckResult {
  const { featureAnchoring, elements } = params;

  const characterScores: ConsistencyCheckResult["characterScores"] = [];

  for (const anchor of featureAnchoring.characterAnchors) {
    const element = elements.find((e) => e.id === anchor.elementId);
    const issues: string[] = [];

    if (!anchor.referenceImageUrl) {
      issues.push("缺少角色参考图");
    }

    if (anchor.featureTags.length === 0) {
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

  const allIssues = characterScores.flatMap((s) => s.issues);
  const passed = overallScore >= 0.6 && allIssues.length === 0;

  let recommendation: ConsistencyCheckResult["recommendation"];
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

export function validateFeatureAnchoringConfig(
  config: FeatureAnchoringConfig,
): { valid: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!config.enabled) {
    return { valid: true, warnings, errors };
  }

  if (config.characterAnchors.length === 0) {
    errors.push("特征锚定已启用但未配置任何角色锚点");
  }

  for (const anchor of config.characterAnchors) {
    if (!anchor.referenceImageUrl) {
      errors.push(`角色锚点"${anchor.elementId}"缺少参考图`);
    }
    if (anchor.featureTags.length === 0) {
      warnings.push(`角色锚点"${anchor.elementId}"缺少特征标签`);
    }
    if (anchor.weight < 0.3 || anchor.weight > 1.0) {
      warnings.push(
        `角色锚点"${anchor.elementId}"权重异常(${anchor.weight})，建议范围0.3-1.0`,
      );
    }
  }

  if (!config.disableFrameBinding) {
    warnings.push("特征锚定模式下建议禁用帧绑定(disableFrameBinding=true)");
  }

  if (config.featureConsistencyStrength < 0.3) {
    warnings.push("特征一致性强度过低，可能导致角色崩坏");
  }
  if (config.featureConsistencyStrength > 0.95) {
    warnings.push("特征一致性强度过高，可能限制视频动态表现力");
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

export function validateNoFrameBinding(params: {
  videoRequestParams: Record<string, unknown>;
}): { valid: boolean; error?: string } {
  const { videoRequestParams } = params;

  const lastFrameUrl = videoRequestParams.previousLastFrameUrl as string | undefined;
  if (lastFrameUrl) {
    return {
      valid: false,
      error: "禁止使用上一分镜尾帧作为参考帧，特征锚定模式下不依赖帧间绑定",
    };
  }

  const fixedImage = videoRequestParams.fixedImage as { lockType?: string } | undefined;
  if (
    fixedImage?.lockType === "first_frame" ||
    fixedImage?.lockType === "last_frame"
  ) {
    return {
      valid: false,
      error: "特征锚定模式下禁止将参考图绑定为首帧或尾帧，参考图仅做特征约束",
    };
  }

  return { valid: true };
}
