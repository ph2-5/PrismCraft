import type { Character, FeatureAnchoringConfig, StoryBeat, StoryElement, ElementFeatureAnchor, ReferenceImageQuality, ElementType } from "@/domain/schemas";

const MIN_CHARACTER_IMAGE_RESOLUTION = 256;

export function validateReferenceImageQuality(
  imageUrl: string,
  _elementType: ElementType,
): Promise<ReferenceImageQuality> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.Image) {
      resolve({
        isValid: true,
        resolution: { width: 0, height: 0 },
        minResolution: 0,
        clarityScore: 1,
        issues: [],
      });
      return;
    }

    const img = new Image();
    if (!imageUrl.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => {
      const { width, height } = img;
      const minRequired = MIN_CHARACTER_IMAGE_RESOLUTION;

      const issues: string[] = [];
      if (width < minRequired || height < minRequired) {
        issues.push(
          `分辨率不足：当前${width}x${height}，建议至少${minRequired}x${minRequired}`,
        );
      }

      if (width < 100 || height < 100) {
        issues.push("图片尺寸过小，可能影响特征提取质量");
      }

      if (imageUrl.startsWith("data:") && imageUrl.length < 5000) {
        issues.push("图片文件过小，可能模糊或损坏");
      }

      const clarityScore = Math.min(
        1,
        (width * height) / (minRequired * minRequired * 4),
      );

      resolve({
        isValid: issues.length === 0,
        resolution: { width, height },
        minResolution: minRequired,
        clarityScore,
        issues,
      });
    };

    img.onerror = () => {
      resolve({
        isValid: false,
        resolution: { width: 0, height: 0 },
        minResolution: MIN_CHARACTER_IMAGE_RESOLUTION,
        clarityScore: 0,
        issues: ["图片加载失败，请检查图片URL是否有效"],
      });
    };

    img.src = imageUrl;
  });
}

export function extractCharacterFeatures(
  character: Character,
): ElementFeatureAnchor["characterFeatures"] {
  const features: ElementFeatureAnchor["characterFeatures"] = {};

  if (character.appearance) {
    if (character.appearance.hairColor)
      features.hairColor = character.appearance.hairColor;
    if (character.appearance.hairStyle)
      features.hairStyle = character.appearance.hairStyle;
    if (character.appearance.eyeColor)
      features.eyeColor = character.appearance.eyeColor;
    if (character.appearance.build) features.build = character.appearance.build;
    if (character.appearance.clothing)
      features.clothing = character.appearance.clothing;
  }

  if (character.description) {
    const desc = character.description;
    const colorKeywords = [
      "红",
      "蓝",
      "绿",
      "黄",
      "紫",
      "白",
      "黑",
      "金",
      "银",
      "粉",
      "橙",
      "灰",
      "棕",
    ];
    const palette: string[] = [];
    for (const color of colorKeywords) {
      if (desc.includes(color)) palette.push(color + "色");
    }
    if (palette.length > 0) features.colorPalette = palette;
  }

  return Object.keys(features).length > 0 ? features : undefined;
}

export function buildFeatureTags(
  element: StoryElement,
  character?: Character,
): string[] {
  const tags: string[] = [];

  if (element.type === "character" && character) {
    if (character.name) tags.push(`角色:${character.name}`);
    if (character.appearance?.hairColor)
      tags.push(`发色:${character.appearance.hairColor}`);
    if (character.appearance?.hairStyle)
      tags.push(`发型:${character.appearance.hairStyle}`);
    if (character.appearance?.eyeColor)
      tags.push(`眼色:${character.appearance.eyeColor}`);
    if (character.appearance?.clothing)
      tags.push(`服装:${character.appearance.clothing}`);
    if (character.style) tags.push(`风格:${character.style}`);
  } else if (element.type === "prop") {
    if (element.name) tags.push(`道具:${element.name}`);
    if (element.description)
      tags.push(`描述:${element.description.slice(0, 50)}`);
  } else {
    if (element.name) tags.push(`名称:${element.name}`);
    if (element.description)
      tags.push(`描述:${element.description.slice(0, 50)}`);
  }

  return tags;
}

export function buildFeatureAnchor(
  element: StoryElement,
  character?: Character,
): ElementFeatureAnchor {
  const primaryBinding =
    element.bindings.find((b) => b.isPrimary) || element.bindings[0];

  return {
    elementId: element.id,
    elementType: element.type,
    referenceImageUrl: primaryBinding?.url || "",
    featureTags: buildFeatureTags(element, character),
    characterFeatures:
      element.type === "character" && character
        ? extractCharacterFeatures(character)
        : undefined,
    extractedAt: new Date().toISOString(),
    confidence: primaryBinding ? 0.8 : 0.3,
  };
}

export function buildFeatureAnchoringConfig(
  beat: StoryBeat,
  elements: StoryElement[],
  characters: Character[],
): FeatureAnchoringConfig {
  const boundElementIds = beat.elementIds || [];
  const characterAnchors: FeatureAnchoringConfig["characterAnchors"] = [];
  const propAnchors: FeatureAnchoringConfig["propAnchors"] = [];

  for (const elementId of boundElementIds) {
    const element = elements.find((e) => e.id === elementId);
    if (!element) continue;

    const primaryBinding =
      element.bindings.find((b) => b.isPrimary) || element.bindings[0];
    if (!primaryBinding) continue;

    const anchor = {
      elementId: element.id,
      referenceImageUrl: primaryBinding.url,
      featureTags: buildFeatureTags(
        element,
        characters.find((c) => c.name === element.name),
      ),
      weight: 0.8,
    };

    switch (element.type) {
      case "character":
        characterAnchors.push(anchor);
        break;
      case "prop":
        propAnchors.push(anchor);
        break;
    }
  }

  return {
    enabled: characterAnchors.length > 0,
    characterAnchors,
    propAnchors: propAnchors.length > 0 ? propAnchors : undefined,
    previewImageUrl: beat.keyframe?.imageUrl || undefined,
    disableFrameBinding: true,
    featureConsistencyStrength: 0.8,
  };
}
