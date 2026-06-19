import type { Character, FeatureAnchoringConfig, StoryBeat, StoryElement, ElementFeatureAnchor, ReferenceImageQuality, ElementType } from "@/domain/schemas";
import { t } from "@/shared/constants";

const MIN_CHARACTER_IMAGE_RESOLUTION = 256;

const COLOR_KEYWORDS: Record<string, { zh: string[]; en: string[] }> = {
  red:    { zh: ["红", "赤", "朱", "绛"], en: ["red", "crimson", "scarlet"] },
  blue:   { zh: ["蓝", "青", "靛"], en: ["blue", "azure", "navy", "indigo", "cobalt"] },
  green:  { zh: ["绿", "翠", "碧"], en: ["green", "emerald", "olive", "jade"] },
  yellow: { zh: ["黄", "金"], en: ["yellow", "gold", "amber"] },
  purple: { zh: ["紫", "紫罗兰"], en: ["purple", "violet", "lavender", "mauve"] },
  white:  { zh: ["白", "乳白", "米白", "象牙"], en: ["white", "ivory", "cream", "pearl"] },
  black:  { zh: ["黑", "墨", "乌"], en: ["black", "onyx", "jet", "ebony"] },
  gold:   { zh: ["金", "金黄", "鎏金"], en: ["gold", "golden", "gilded"] },
  silver: { zh: ["银", "银白", "银灰"], en: ["silver", "silvery", "platinum"] },
  pink:   { zh: ["粉", "粉红", "桃红", "樱"], en: ["pink", "rose", "blush", "salmon"] },
  orange: { zh: ["橙", "橘", "橘黄"], en: ["orange", "tangerine", "copper", "rust"] },
  gray:   { zh: ["灰", "灰白", "银灰", "烟灰"], en: ["gray", "grey", "ash", "slate", "charcoal"] },
  brown:  { zh: ["棕", "褐", "栗", "咖啡", "巧克力", "茶色"], en: ["brown", "chestnut", "chocolate", "mahogany", "tan", "bronze", "maroon"] },
  cyan:   { zh: ["青", "湖蓝", "天蓝"], en: ["cyan", "teal", "turquoise", "aqua"] },
  beige:  { zh: ["米", "米色", "驼色", "卡其"], en: ["beige", "khaki", "tan", "camel"] },
};

const TAG_PREFIXES = {
  zh: {
    character: "角色",
    hairColor: "发色",
    hairStyle: "发型",
    eyeColor: "眼色",
    clothing: "服装",
    style: "风格",
    prop: "道具",
    name: "名称",
    description: "描述",
  },
  en: {
    character: "Character",
    hairColor: "Hair",
    hairStyle: "Hairstyle",
    eyeColor: "Eyes",
    clothing: "Clothing",
    style: "Style",
    prop: "Prop",
    name: "Name",
    description: "Description",
  },
} as const;

export type FeatureLanguage = "en" | "zh";

function extractColorPalette(
  description: string,
  language?: FeatureLanguage,
): string[] {
  const lang = language ?? "zh";
  const seen = new Set<string>();
  const palette: string[] = [];

  for (const [canonicalName, entry] of Object.entries(COLOR_KEYWORDS)) {
    const keywords = entry[lang];
    for (const keyword of keywords) {
      if (description.toLowerCase().includes(keyword.toLowerCase())) {
        const colorLabel = lang === "en" ? canonicalName : entry.zh[0] + "色";
        if (!seen.has(colorLabel)) {
          seen.add(colorLabel);
          palette.push(colorLabel);
        }
        break; // found match for this canonical color, move to next
      }
    }
  }

  return palette;
}

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
          t("feature.resolutionLow", { current: `${width}x${height}`, min: `${minRequired}x${minRequired}` }),
        );
      }

      if (width < 100 || height < 100) {
        issues.push(t("feature.imageTooSmall"));
      }

      if (imageUrl.startsWith("data:") && imageUrl.length < 5000) {
        issues.push(t("feature.imageFileTooSmall"));
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
        issues: [t("feature.imageLoadFailed")],
      });
    };

    img.src = imageUrl;
  });
}

export function extractCharacterFeatures(
  character: Character,
  language?: FeatureLanguage,
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
    const palette = extractColorPalette(character.description, language);
    if (palette.length > 0) features.colorPalette = palette;
  }

  return Object.keys(features).length > 0 ? features : undefined;
}

export function buildFeatureTags(
  element: StoryElement,
  character?: Character,
  language?: FeatureLanguage,
): string[] {
  const lang = language ?? "zh";
  const prefixes = TAG_PREFIXES[lang];
  const tags: string[] = [];

  if (element.type === "character" && character) {
    if (character.name) tags.push(`${prefixes.character}:${character.name}`);
    if (character.appearance?.hairColor)
      tags.push(`${prefixes.hairColor}:${character.appearance.hairColor}`);
    if (character.appearance?.hairStyle)
      tags.push(`${prefixes.hairStyle}:${character.appearance.hairStyle}`);
    if (character.appearance?.eyeColor)
      tags.push(`${prefixes.eyeColor}:${character.appearance.eyeColor}`);
    if (character.appearance?.clothing)
      tags.push(`${prefixes.clothing}:${character.appearance.clothing}`);
    if (character.style) tags.push(`${prefixes.style}:${character.style}`);
  } else if (element.type === "prop") {
    if (element.name) tags.push(`${prefixes.prop}:${element.name}`);
    if (element.description)
      tags.push(`${prefixes.description}:${element.description.slice(0, 50)}`);
  } else {
    if (element.name) tags.push(`${prefixes.name}:${element.name}`);
    if (element.description)
      tags.push(`${prefixes.description}:${element.description.slice(0, 50)}`);
  }

  return tags;
}

export function buildFeatureAnchor(
  element: StoryElement,
  character?: Character,
  language?: FeatureLanguage,
): ElementFeatureAnchor {
  const primaryBinding =
    element.bindings.find((b) => b.isPrimary) || element.bindings[0];

  return {
    elementId: element.id,
    elementType: element.type,
    referenceImageUrl: primaryBinding?.url || "",
    featureTags: buildFeatureTags(element, character, language),
    characterFeatures:
      element.type === "character" && character
        ? extractCharacterFeatures(character, language)
        : undefined,
    extractedAt: new Date().toISOString(),
    confidence: primaryBinding ? 0.8 : 0.3,
  };
}

export function buildFeatureAnchoringConfig(
  beat: StoryBeat,
  elements: StoryElement[],
  characters: Character[],
  language?: FeatureLanguage,
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
        language,
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
