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
      issues.push("Missing character reference image");
    }

    if (!anchor.featureTags || anchor.featureTags.length === 0) {
      issues.push("Missing character feature tags, consistency constraint may be insufficient");
    }

    const score = Math.max(0, 0.8 - issues.length * 0.3);

    characterScores.push({
      elementId: anchor.elementId,
      elementName: element?.name || "Unknown character",
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
    errors.push("Feature anchoring is enabled but no character anchors are configured");
  }

  if (config.characterAnchors) {
    for (const anchor of config.characterAnchors) {
      if (!anchor.referenceImageUrl) {
        errors.push(`Character anchor "${anchor.elementId}" is missing reference image`);
      }
      if (!anchor.featureTags || anchor.featureTags.length === 0) {
        warnings.push(`Character anchor "${anchor.elementId}" is missing feature tags`);
      }
      if (anchor.weight < 0.3 || anchor.weight > 1.0) {
        warnings.push(
          `Character anchor "${anchor.elementId}" has abnormal weight (${anchor.weight}), recommended range 0.3-1.0`,
        );
      }
    }
  }

  if (!config.disableFrameBinding) {
    warnings.push("It is recommended to disable frame binding in feature anchoring mode (disableFrameBinding=true)");
  }

  if (config.featureConsistencyStrength !== undefined && config.featureConsistencyStrength < 0.3) {
    warnings.push("Feature consistency strength is too low, may cause character distortion");
  }
  if (config.featureConsistencyStrength !== undefined && config.featureConsistencyStrength > 0.95) {
    warnings.push("Feature consistency strength is too high, may limit video dynamic expression");
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
      error: "Using previous shot's last frame as reference is forbidden; feature anchoring mode does not rely on inter-frame binding",
    };
  }

  if (
    videoRequestParams.fixedImage &&
    (videoRequestParams.fixedImage.lockType === "first_frame" ||
      videoRequestParams.fixedImage.lockType === "last_frame")
  ) {
    return {
      valid: false,
      error: "Binding reference image as first or last frame is forbidden in feature anchoring mode; reference image is for feature constraint only",
    };
  }

  return { valid: true };
}
