import type { Character, CharacterOutfit } from "@/domain/schemas";
import {
  joinParts,
  buildCharacterFullDesc,
  getStyleKeywords,
  QUALITY_TAGS_IMAGE,
} from "../../base";

export function generateCharacterImagePrompt(
  char: Character,
  outfitId?: string,
): string {
  if (!char.name && !char.description && !char.gender) {
    return "";
  }

  let characterToUse = char;
  if (outfitId && char.outfits) {
    const outfit = char.outfits.find((o) => o.id === outfitId);
    if (outfit) {
      characterToUse = {
        ...char,
        appearance: {
          ...char.appearance,
          clothing: outfit.clothing,
        },
      };
    }
  }

  const styleKeywords = getStyleKeywords(characterToUse.style || "anime");
  const fullDesc = buildCharacterFullDesc(characterToUse);

  const parts = [
    `(${fullDesc})`,
    ...styleKeywords,
    "character design sheet",
    "full body",
    "white background",
    ...QUALITY_TAGS_IMAGE,
  ];

  return joinParts(parts);
}

export function generateOutfitImagePrompt(
  char: Character,
  outfit: CharacterOutfit,
): string {
  if (!char.name && !char.description && !char.gender) {
    return "";
  }

  const styleKeywords = getStyleKeywords(char.style || "anime");
  const fullDesc = buildCharacterFullDesc({
    ...char,
    appearance: {
      ...char.appearance,
      clothing: outfit.clothing,
    },
  });

  const parts = [
    `(${fullDesc})`,
    ...styleKeywords,
    "character design sheet",
    "full body",
    "white background",
    ...QUALITY_TAGS_IMAGE,
  ];

  return joinParts(parts);
}

export function generateCharacterDetailedPromptInstruction(char: Character): string {
  const basicPrompt = generateCharacterImagePrompt(char);
  if (!basicPrompt) return "";

  const style = char.style || "anime";
  const styleGuide: Record<string, string> = {
    anime: "日式动漫风格，强调线条清晰、色彩鲜明、大眼睛、小嘴巴",
    realistic: "写实风格，强调真实的光影、皮肤质感、自然比例",
    "3d": "3D渲染风格，强调体积感、材质质感、环境光遮蔽",
    watercolor: "水彩画风格，强调色彩晕染、笔触自然、边缘柔和",
    sketch: "素描风格，强调线条表现、明暗对比、手绘质感",
    chibi: "Q版风格，强调头身比夸张、可爱圆润、表情丰富",
    pixel: "像素风格，强调低分辨率美学、复古配色、清晰像素边界",
    oil_painting: "油画风格，强调笔触厚重、色彩浓郁、光影对比强烈",
  };

  return `请根据以下角色基础信息，生成一个专业的AI图像生成提示词，用于生成高质量的角色图片。

基础信息：${basicPrompt}

风格指导（${style}）：${styleGuide[style] || styleGuide.anime}

要求：
1. 详细描述角色的面部特征（眼睛形状与颜色、鼻子、嘴巴、表情）
2. 详细描述服装的材质、纹理、配饰
3. 描述角色的姿态和构图（建议全身立绘或3/4视角）
4. 添加适合该风格的光照描述
5. 添加背景描述（建议简洁的纯色或渐变背景突出角色）
6. 使用英文逗号分隔的关键词格式，便于AI图像模型理解
7. 控制在80-150个英文单词之间
8. 如果使用Stable Diffusion等动漫模型，以 "1girl" 或 "1boy" 开头；其他模型请使用自然语言描述
9. 包含负面提示词建议（如：low quality, blurry, deformed, bad anatomy）`;
}

export function generateSimpleCharacterImagePrompt(char: Character): string {
  const styleKeywords = getStyleKeywords(char.style || "anime");
  
  const parts: string[] = [];
  if (char.name) parts.push(char.name);
  if (char.gender) parts.push(char.gender);
  if (char.description) parts.push(char.description);
  if (char.appearance.hairColor) parts.push(`发色：${char.appearance.hairColor}`);
  if (char.appearance.hairStyle) parts.push(`发型：${char.appearance.hairStyle}`);
  if (char.appearance.eyeColor) parts.push(`眼睛：${char.appearance.eyeColor}`);
  if (char.appearance.clothing) parts.push(`服装：${char.appearance.clothing}`);
  if (char.personality.length > 0) parts.push(`性格：${char.personality.join(", ")}`);
  
  return joinParts([
    ...parts,
    ...styleKeywords,
    "full body",
    "character design",
    "high quality",
    "detailed",
  ]);
}
