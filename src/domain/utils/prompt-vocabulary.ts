import type { Character, FixedImageConfig, ReferenceVideoConfig, Scene, SceneElement, TemplateConfig } from "@/domain/schemas";

export const QUALITY_TAGS_IMAGE = [
  "masterpiece",
  "best quality",
  "highly detailed",
  "sharp focus",
  "professional",
];

export const QUALITY_TAGS_VIDEO = [
  "high quality",
  "smooth motion",
  "cinematic",
  "professional",
];

export const STYLE_KEYWORDS: Record<string, string[]> = {
  anime: ["anime style", "cel shading", "vibrant colors", "clean lines"],
  realistic: ["photorealistic", "realistic", "natural lighting", "detailed texture"],
  "3d": ["3D render", "CGI", "volumetric lighting", "subsurface scattering"],
  watercolor: ["watercolor painting", "soft edges", "flowing colors", "artistic"],
  sketch: ["pencil sketch", "hand drawn", "line art", "cross hatching"],
  chibi: ["chibi style", "cute", "small body", "big head", "deformed"],
  pixel: ["pixel art", "retro", "8-bit", "low resolution aesthetic"],
  oil_painting: ["oil painting", "thick brushstrokes", "rich colors", "canvas texture"],
};

export const SCENE_TYPE_KEYWORDS: Record<string, string[]> = {
  室内: ["interior", "indoor", "room", "enclosed space"],
  室外: ["exterior", "outdoor", "open air", "landscape"],
  城市: ["urban", "cityscape", "buildings", "streets"],
  自然: ["nature", "wilderness", "organic", "natural landscape"],
  科幻: ["sci-fi", "futuristic", "technology", "neon"],
  古风: ["traditional chinese", "ancient", "classical architecture", "oriental"],
  奇幻: ["fantasy", "magical", "mystical", "enchanted"],
  末日: ["post-apocalyptic", "ruins", "desolate", "wasteland"],
};

export const MOOD_KEYWORDS: Record<string, string[]> = {
  平静: ["peaceful", "serene", "calm", "tranquil"],
  紧张: ["tense", "suspenseful", "dramatic", "anxious"],
  欢快: ["cheerful", "joyful", "bright", "lively"],
  悲伤: ["melancholic", "sorrowful", "gloomy", "somber"],
  神秘: ["mysterious", "enigmatic", "shadowy", "cryptic"],
  浪漫: ["romantic", "dreamy", "soft", "intimate"],
  恐怖: ["horror", "creepy", "dark", "eerie"],
  史诗: ["epic", "grand", "majestic", "monumental"],
};

export const LIGHTING_KEYWORDS: Record<string, string> = {
  自然光: "natural lighting",
  暖光: "warm lighting, golden hour",
  冷光: "cool lighting, blue tones",
  逆光: "backlighting, silhouette",
  侧光: "side lighting, dramatic shadows",
  顶光: "top lighting, overhead",
  霓虹: "neon lighting, colorful glow",
  烛光: "candlelight, warm flickering",
  月光: "moonlight, soft silver glow",
};

export const CAMERA_ANGLE_KEYWORDS: Record<string, string> = {
  平视: "eye level shot",
  俯拍: "high angle shot, looking down",
  仰拍: "low angle shot, looking up",
  鸟瞰: "bird's eye view, overhead",
  特写: "close-up shot",
  侧视: "side angle shot",
};

export const CAMERA_MOVEMENT_KEYWORDS: Record<string, string> = {
  固定: "static camera, fixed shot",
  推: "push in, zoom in, dolly in",
  拉: "pull out, zoom out, dolly out",
  摇: "pan shot, camera pan",
  移: "tracking shot, dolly shot",
  跟拍: "following shot, tracking",
  升: "crane up, rising shot",
  降: "crane down, descending shot",
};

export const TRANSITION_KEYWORDS: Record<string, string> = {
  无: "",
  淡入淡出: "fade transition",
  闪黑: "cut to black transition",
  滑动: "slide transition",
  擦除: "wipe transition",
  缩放: "zoom transition",
};

export const POSITION_KEYWORDS: Record<string, string> = {
  左侧: "positioned on the left side",
  中间: "positioned in the center",
  右侧: "positioned on the right side",
  前景: "in the foreground",
  背景: "in the background",
};

export function joinParts(parts: (string | undefined | null | false)[], separator: string = ", "): string {
  return parts.filter(Boolean).join(separator);
}

export function buildCharacterAppearanceDesc(char: Character): string {
  const parts: string[] = [];
  if (char.appearance.hairColor) parts.push(`${char.appearance.hairColor}发色`);
  if (char.appearance.hairStyle) parts.push(`${char.appearance.hairStyle}发型`);
  if (char.appearance.eyeColor) parts.push(`${char.appearance.eyeColor}眼睛`);
  if (char.appearance.height) parts.push(`${char.appearance.height}身材`);
  if (char.appearance.build) parts.push(`${char.appearance.build}体型`);
  if (char.appearance.clothing) parts.push(`穿着${char.appearance.clothing}`);
  if (char.description) {
    parts.push(char.description);
    const descLower = char.description.toLowerCase();
    const hasFaceDesc = ["脸", "面", "五官", "鼻", "嘴", "眉", "下巴", "脸型", "face", "nose", "mouth", "eyebrow", "chin"].some(k => descLower.includes(k));
    if (!hasFaceDesc) {
      parts.push("面部特征清晰");
    }
    const hasAccessoryDesc = ["配饰", "耳环", "项链", "帽子", "眼镜", "围巾", "accessory", "earring", "necklace", "hat", "glasses", "scarf"].some(k => descLower.includes(k));
    if (!hasAccessoryDesc) {
      parts.push("无特殊配饰");
    }
  } else {
    parts.push("面部特征清晰");
    parts.push("无特殊配饰");
  }
  return parts.join("，");
}

export function buildCharacterFullDesc(char: Character): string {
  const parts: string[] = [];
  if (char.style) parts.push(`${char.style}风格`);
  if (char.gender) parts.push(char.gender);
  if (char.age) parts.push(`${char.age}岁`);
  const appearance = buildCharacterAppearanceDesc(char);
  if (appearance) parts.push(appearance);
  if (char.personality.length > 0) parts.push(`性格${char.personality.join("、")}`);
  return parts.join("，");
}

export function buildSceneAtmosphereDesc(scene: Scene): string {
  const parts: string[] = [];
  if (scene.timeOfDay) parts.push(scene.timeOfDay);
  if (scene.weather) parts.push(scene.weather);
  if (scene.mood) parts.push(`${scene.mood}氛围`);
  if (scene.lighting) parts.push(`${scene.lighting}照明`);
  return parts.join("，");
}

export function buildSceneVisualDesc(scene: Scene): string {
  const parts: string[] = [];
  if (scene.elements.length > 0) parts.push(`包含${scene.elements.join("、")}`);
  if (scene.colors.length > 0) parts.push(`${scene.colors.join("、")}色调`);
  return parts.join("，");
}

export function buildElementEffectDesc(element: SceneElement): string {
  const parts: string[] = [];
  if (element.dialogue) parts.push(`说"${element.dialogue}"`);
  if (element.action) parts.push(element.action);
  if (element.emotion) parts.push(`表情${element.emotion}`);
  if (element.position) parts.push(`位于${element.position}`);
  if (element.pose) parts.push(`${element.pose}姿态`);
  return parts.join("，");
}

export function buildFixedImageDesc(config: FixedImageConfig): string {
  if (!config.enabled) return "";
  const parts: string[] = [];

  if (config.characters && config.characters.length > 0) {
    config.characters.forEach((char, index) => {
      const charNum = index + 1;
      parts.push(`[图片${charNum}]: 角色"${char.characterName}"的形象参考图，请严格按照此图片中的角色外观生成，包括脸型、发型、服装、配色等所有特征`);
    });
  }

  if (config.imageUrl && config.lockType === "scene") {
    const sceneImageNum = (config.characters?.length || 0) + 1;
    parts.push(`[图片${sceneImageNum}]: 场景的形象参考图，请严格按照此图片中的场景外观生成，包括环境、建筑、色彩、氛围等所有特征`);
  }

  return parts.join("\n");
}

export function buildReferenceVideoDesc(config: ReferenceVideoConfig): string {
  if (!config.enabled) return "";
  const levelMap: Record<string, string> = {
    light: "轻度模仿参考视频风格",
    medium: "中度模仿参考视频风格和节奏",
    deep: "深度模仿参考视频的风格、节奏和构图",
  };
  return levelMap[config.mimicryLevel] || "";
}

export function buildTemplateDesc(config: TemplateConfig): string {
  if (!config.enabled || !config.template) return "";
  const tmpl = config.template as Record<string, unknown>;
  const parts: string[] = [`使用"${tmpl.name || '未知'}"模板`];
  if (config.matchCamera) parts.push("匹配运镜");
  if (config.matchTransition) parts.push("匹配转场");
  if (config.matchTiming) parts.push("匹配时间节奏");
  return parts.join("，");
}

export function getStyleKeywords(style: string): string[] {
  return STYLE_KEYWORDS[style] || STYLE_KEYWORDS.realistic;
}

export function getSceneTypeKeywords(type: string): string[] {
  return SCENE_TYPE_KEYWORDS[type] || [];
}

export function getMoodKeywords(mood: string): string[] {
  return MOOD_KEYWORDS[mood] || [];
}
