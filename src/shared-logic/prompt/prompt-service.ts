import {
  joinParts,
  buildCharacterFullDesc,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
  QUALITY_TAGS_IMAGE,
  QUALITY_TAGS_VIDEO,
  STYLE_KEYWORDS,
  SHOT_TYPE_MAP,
  CAMERA_MOVEMENT_MAP,
  LIGHTING_MAP,
  MOOD_MAP,
  SCENE_TYPE_MAP,
} from "./prompt-engine";

export interface CharacterInput {
  name?: string;
  gender?: string;
  age?: number | string;
  style?: string;
  appearance?: {
    hairColor?: string;
    hairStyle?: string;
    eyeColor?: string;
    build?: string;
    clothing?: string;
    accessories?: string;
  };
  description?: string;
  personality?: string | string[];
  generatedImage?: string;
}

export interface SceneInput {
  name?: string;
  type?: string;
  timeOfDay?: string;
  weather?: string;
  mood?: string;
  lighting?: string;
  atmosphere?: string;
  description?: string;
  elements?: string | string[];
  generatedImage?: string;
  colors?: string | string[];
}

export interface BeatInput {
  content?: string;
  description?: string;
  shotType?: string;
  camera?: { angle?: string; movement?: string };
  duration?: number;
}

export interface ElementInput {
  id?: string;
  name?: string;
  type?: string;
  featureAnchor?: { featureTags?: string[] };
}

export interface VideoPromptParams {
  beat?: BeatInput;
  characters?: CharacterInput[];
  scenes?: SceneInput[];
  elements?: ElementInput[];
  shotInstruction?: string;
  index?: number;
}

export interface QuickModeParams {
  prompt: string;
  duration?: number;
  resolution?: string;
  style?: string;
  characters?: CharacterInput[];
  scene?: SceneInput;
  referenceImage?: string;
}

interface StoryPlanParams {
  title?: string;
  description?: string;
  genre?: string;
  tone?: string;
  targetDuration?: number;
  characters?: CharacterInput[];
  scenes?: SceneInput[];
}

function generateCharacterImagePrompt(
  character: CharacterInput,
  _options: Record<string, unknown> = {},
): string {
  const parts: string[] = [];
  parts.push(`A character portrait of ${character.name || "a character"}`);
  if (character.gender) parts.push(character.gender);
  if (character.age) parts.push(`${character.age} years old`);
  if (character.style) {
    const styleTag =
      STYLE_KEYWORDS[character.style.toLowerCase()] || character.style;
    parts.push(styleTag);
  }
  if (character.appearance) {
    const app = character.appearance;
    if (app.hairColor) parts.push(`${app.hairColor} hair`);
    if (app.hairStyle) parts.push(app.hairStyle);
    if (app.eyeColor) parts.push(`${app.eyeColor} eyes`);
    if (app.build) parts.push(app.build);
    if (app.clothing) parts.push(`wearing ${app.clothing}`);
    if (app.accessories) parts.push(app.accessories);
  }
  if (character.description) parts.push(character.description);
  if (character.personality) {
    const personality =
      Array.isArray(character.personality)
        ? character.personality.join(", ")
        : character.personality;
    parts.push(`personality: ${personality}`);
  }
  parts.push(...QUALITY_TAGS_IMAGE);
  return joinParts(parts);
}

function generateCharacterDetailedPromptInstruction(
  character: CharacterInput,
): string {
  const charDesc = buildCharacterFullDesc(character);
  return `Based on the following character description, generate a detailed image generation prompt in English. The prompt should be specific, visual, and suitable for AI image generation.

Character: ${charDesc}

Requirements:
1. Describe appearance details (hair, eyes, skin, clothing, accessories)
2. Describe pose and expression
3. Describe lighting and background
4. Use comma-separated tags format
5. Output only the prompt text, no explanation`;
}

function generateSceneImagePrompt(
  scene: SceneInput,
  _options: Record<string, unknown> = {},
): string {
  const parts: string[] = [];
  parts.push(`A scene of ${scene.name || "a location"}`);
  if (scene.type) {
    const typeTag =
      SCENE_TYPE_MAP[scene.type.toLowerCase()] || scene.type;
    parts.push(typeTag);
  }
  if (scene.timeOfDay) parts.push(scene.timeOfDay);
  if (scene.weather) parts.push(scene.weather);
  if (scene.mood) {
    const moodTag = MOOD_MAP[scene.mood.toLowerCase()] || scene.mood;
    parts.push(moodTag);
  }
  if (scene.lighting) {
    const lightTag =
      LIGHTING_MAP[scene.lighting.toLowerCase()] || scene.lighting;
    parts.push(lightTag);
  }
  if (scene.atmosphere) parts.push(scene.atmosphere);
  if (scene.description) parts.push(scene.description);
  if (scene.elements) {
    let els: string | string[] = [];
    try {
      els =
        typeof scene.elements === "string"
          ? JSON.parse(scene.elements)
          : scene.elements;
    } catch {
      els = [];
    }
    if (Array.isArray(els) && els.length > 0)
      parts.push(`elements: ${els.join(", ")}`);
  }
  parts.push(...QUALITY_TAGS_IMAGE);
  return joinParts(parts);
}

function generateScenePromptOptimization(description: string): string {
  return `Optimize the following scene description for AI image generation. Make it more specific, visual, and detailed while keeping the core concept.

Original: ${description}

Requirements:
1. Add specific visual details (colors, textures, lighting)
2. Add atmosphere and mood descriptors
3. Use comma-separated tags format
4. Keep the core scene concept
5. Output only the optimized prompt, no explanation`;
}

function generateVideoPrompt(params: VideoPromptParams): string {
  const {
    beat,
    characters = [],
    scenes = [],
    elements = [],
    shotInstruction,
  } = params;
  const parts: string[] = [];

  if (characters.length > 0) {
    const charDescs = characters.map((c) => {
      const desc = buildCharacterFullDesc(c);
      const imgNote = c.generatedImage
        ? `【重要】保持角色形象与参考图片完全一致：${c.name}`
        : "";
      return `${c.name}：${desc}${imgNote}`;
    });
    parts.push(`【核心角色】\n${charDescs.join("\n")}`);
    parts.push("【角色要求】视频全程保持以上角色的形象、服装、特征完全一致");
  }

  if (scenes.length > 0) {
    const sceneDescs = scenes.map((s) => {
      const desc = buildSceneAtmosphereDesc(s);
      const visual = buildSceneVisualDesc(s);
      const imgNote = s.generatedImage
        ? "【重要】保持场景与参考图片完全一致"
        : "";
      return `${s.name}：${[desc, visual].filter(Boolean).join("，")}${imgNote}`;
    });
    parts.push(`【固定场景】\n${sceneDescs.join("\n")}`);
  }

  if (elements && elements.length > 0) {
    const elDescs = elements.map((e) => {
      const typeLabel =
        e.type === "character" ? "角色" : e.type === "prop" ? "道具" : "特效";
      const tags = e.featureAnchor?.featureTags?.join("、") || "";
      return `${e.id}（${typeLabel}）：${e.name}${tags ? `，视觉特征：${tags}` : ""}`;
    });
    parts.push(`【全局元素定义】\n${elDescs.join("\n")}`);
    parts.push("【元素要求】跨分镜保持同一元素的视觉一致性");
  }

  if (beat) {
    parts.push(`【视频内容】\n${beat.content || beat.description || ""}`);

    if (beat.shotType) {
      const shotTag = SHOT_TYPE_MAP[beat.shotType] || beat.shotType;
      parts.push(`【景别】${shotTag}`);
    }
    if (beat.camera) {
      if (beat.camera.angle) parts.push(`【镜头角度】${beat.camera.angle}`);
      if (beat.camera.movement) {
        const moveTag =
          CAMERA_MOVEMENT_MAP[beat.camera.movement] || beat.camera.movement;
        parts.push(`【运镜方式】${moveTag}`);
      }
    }
    if (beat.duration) parts.push(`【时长】${beat.duration}秒`);
  }

  if (shotInstruction) {
    parts.push(`【镜头指令】${shotInstruction}`);
  }

  parts.push(`【质量要求】\n${QUALITY_TAGS_VIDEO.join(", ")}`);

  return parts.join("\n\n");
}

function generateSingleBeatPrompt(params: VideoPromptParams): string {
  return generateVideoPrompt(params);
}

function generateQuickModeVideoPrompt(params: QuickModeParams): string {
  const { prompt, duration, resolution, style, characters = [], scene } = params;
  const parts: string[] = [];

  const STYLE_PRESETS: Record<string, string> = {
    写实: "真实摄影风格，自然光线，细腻纹理",
    动漫: "日本动漫风格，明亮色彩，流畅线条",
    二次元: "二次元插画风格，鲜艳色彩，萌系风格",
    电影感: "电影大片风格，电影级构图，戏剧性光线",
    国潮: "中国风，传统元素，东方美学",
    赛博朋克: "赛博朋克风格，霓虹灯光，未来都市",
    古风: "中国古典风格，水墨元素，古代场景",
    "3D卡通": "3D卡通渲染风格，圆润造型，明亮色彩",
    像素风: "像素艺术风格，复古游戏感",
    水彩: "水彩画风格，柔和过渡，艺术感",
  };

  const RESOLUTION_CONFIG: Record<string, string> = {
    "720p": "1280x720 高清分辨率",
    "1080p": "1920x1080 全高清分辨率",
    "4K": "3840x2160 4K超高清分辨率",
  };

  if (characters.length > 0) {
    const charDescs = characters.map((c) => {
      const desc = c.description || c.name;
      const imgNote = c.generatedImage
        ? `【重要】保持角色形象与参考图片完全一致：${c.name}`
        : "";
      return `${c.name}：${desc}${imgNote}`;
    });
    parts.push(`【核心角色】\n${charDescs.join("\n")}`);
    parts.push("【角色要求】视频全程保持以上角色的形象、服装、特征完全一致");
  }

  if (scene) {
    const desc = buildSceneAtmosphereDesc(scene);
    const visual = buildSceneVisualDesc(scene);
    const imgNote = scene.generatedImage
      ? "【重要】保持场景与参考图片完全一致"
      : "";
    parts.push(
      `【固定场景】${scene.name}：${[desc, visual].filter(Boolean).join("，")}${imgNote}`,
    );
    parts.push("【场景要求】视频全程在该场景中进行");
  }

  parts.push(`【视频内容】\n${prompt}`);

  const styleDesc = STYLE_PRESETS[style || ""] || style;
  const resDesc =
    RESOLUTION_CONFIG[resolution || ""] || RESOLUTION_CONFIG["1080p"];
  parts.push(`【画面风格】${styleDesc}`);
  parts.push(`【技术参数】${resDesc}，视频时长${duration}秒`);

  if (params.referenceImage) {
    parts.push("【参考素材】请参考提供的图片进行生成");
  }

  parts.push(`【质量要求】\n${QUALITY_TAGS_VIDEO.join(", ")}`);

  return parts.join("\n\n");
}

function generateKeyframePrompt(params: {
  content?: string;
  shotRequirement?: {
    shotType?: string;
    cameraAngle?: string;
    cameraMovement?: string;
    action?: string;
  };
  prevKeyframe?: string;
}): string {
  const parts: string[] = [];
  parts.push("生成一张高质量的分镜预览图，要求：");
  if (params.content) parts.push(`画面内容：${params.content}`);
  if (params.shotRequirement) {
    const { shotType, cameraAngle, cameraMovement, action } =
      params.shotRequirement;
    if (shotType) parts.push(`景别：${shotType}`);
    if (cameraAngle) parts.push(`镜头角度：${cameraAngle}`);
    if (cameraMovement) parts.push(`运镜方式：${cameraMovement}`);
    if (action) parts.push(`动作：${action}`);
  }
  if (params.prevKeyframe) {
    parts.push("保持与上一分镜相同的色调、光影风格和构图语言");
  }
  parts.push(
    "画面要求：构图精美、光影自然、细节丰富、适合作为动画分镜参考",
  );
  return joinParts([...parts, ...QUALITY_TAGS_IMAGE]);
}

function generateFirstFramePrompt(params: {
  keyframePrompt?: string;
  actionDescription?: string;
}): string {
  const parts: string[] = [];
  parts.push("生成视频的第一帧（起始画面），要求：");
  parts.push(
    "这是视频的起始画面，角色处于动作开始前的初始状态。",
  );
  if (params.keyframePrompt)
    parts.push(`基于以下预览图的风格和构图：${params.keyframePrompt}`);
  if (params.actionDescription)
    parts.push(
      `动作起始状态：${params.actionDescription}（开始前的瞬间）`,
    );
  parts.push(
    "画面要求：清晰展示角色起始姿态、表情自然、光影与预览图保持一致。",
  );
  return joinParts([...parts, ...QUALITY_TAGS_IMAGE]);
}

function generateLastFramePrompt(params: {
  keyframePrompt?: string;
  actionDescription?: string;
  duration?: number;
}): string {
  const parts: string[] = [];
  parts.push("生成视频的最后一帧（结束画面），要求：");
  parts.push(
    "这是视频的结束画面，角色处于动作完成后的最终状态。",
  );
  if (params.keyframePrompt)
    parts.push(`基于以下预览图的风格和构图：${params.keyframePrompt}`);
  if (params.actionDescription)
    parts.push(
      `动作结束状态：${params.actionDescription}（完成后的瞬间）`,
    );
  if (params.duration)
    parts.push(`视频时长约 ${params.duration} 秒后的最终状态。`);
  parts.push(
    "画面要求：清晰展示角色结束姿态、动作完成感强、光影与预览图和首帧保持一致。",
  );
  return joinParts([...parts, ...QUALITY_TAGS_IMAGE]);
}

function generateStoryPlanPrompt(params: StoryPlanParams): string {
  const {
    title,
    description,
    genre,
    tone,
    targetDuration,
    characters = [],
    scenes = [],
  } = params;

  const genreGuide: Record<string, string> = {
    drama: "剧情片节奏：缓慢铺垫→矛盾激化→情感爆发→余韵收尾",
    comedy: "喜剧节奏：快速建立情境→误会叠加→笑点爆发→皆大欢喜",
    action: "动作片节奏：紧张开场→危机升级→高潮对决→胜利收尾",
    thriller: "悬疑节奏：悬念设置→线索铺陈→反转揭秘→真相大白",
    romance: "爱情节奏：相遇→相知→矛盾→和解",
    scifi: "科幻节奏：世界观建立→科技展示→危机出现→解决突破",
    fantasy: "奇幻节奏：异世界引入→冒险启程→试炼成长→终极对决",
    horror: "恐怖节奏：不安铺垫→恐怖递增→惊吓爆发→余恐未消",
  };

  const toneGuide: Record<string, string> = {
    neutral: "中性基调，客观叙事",
    light: "轻松明快，色彩明亮，节奏轻快",
    warm: "温馨细腻，近景多，暖色调",
    dark: "沉重压抑，暗色调，慢节奏，特写多",
    epic: "宏大壮阔，大场景，史诗配乐感",
    intimate: "温馨细腻，近景多，暖色调",
    humorous: "幽默诙谐，节奏轻快，夸张表现",
  };

  const charDescs =
    characters.length > 0
      ? `\n\n已有角色：\n${characters.map((c) => `- ${c.name}：${buildCharacterFullDesc(c)}`).join("\n")}`
      : "";

  const sceneDescs =
    scenes.length > 0
      ? `\n\n已有场景：\n${scenes.map((s) => `- ${s.name}（${s.type || ""}）：${buildSceneAtmosphereDesc(s)}${s.description ? `，${s.description}` : ""}`).join("\n")}`
      : "";

  return `你是一位专业的动画分镜导演，请根据以下故事信息，规划一个逻辑完整的剧情结构。

故事标题：${title || "未命名"}
故事类型：${genre || "剧情"}
故事基调：${tone || "中性"}
故事简介：${description || "无"}
目标总时长：${targetDuration || 60} 秒
${charDescs}${sceneDescs}

类型节奏指导：${genreGuide[genre || "drama"] || genreGuide.drama}
基调指导：${toneGuide[tone || "neutral"] || toneGuide.neutral}

重要说明：
- 每个镜头将生成独立的视频片段，然后按顺序拼接
- 请重点规划每个镜头的时长和排列顺序
- 所有镜头的 duration 总和必须等于目标总时长 ${targetDuration || 60} 秒

请按照以下格式返回JSON数组：
[
  {
    "type": "scene" | "dialogue" | "action" | "transition" | "effect",
    "title": "镜头标题",
    "content": "详细描述",
    "duration": 秒数
  }
]

规划要求：
1. 剧情要有完整的起承转合逻辑结构
2. 镜头类型要多样化
3. 每个镜头的 duration 要合理
4. content 描述要详细具体
5. 镜头数量建议：${Math.max(4, Math.floor((targetDuration || 60) / 8))}-${Math.min(15, Math.ceil((targetDuration || 60) / 4))}个`;
}

function generateCharacterAnalysisPrompt(): string {
  return `分析这张图片中的角色，提取以下信息并以 JSON 格式返回：
{
  "name": "角色名称",
  "gender": "性别",
  "age": "年龄数字",
  "style": "艺术风格",
  "personality": ["性格特征1", "性格特征2"],
  "appearance": {
    "hairColor": "发色",
    "hairStyle": "发型",
    "eyeColor": "眼睛颜色",
    "height": "身高描述",
    "build": "体型",
    "clothing": "服装描述"
  },
  "description": "角色整体描述"
}`;
}

function generateSceneAnalysisPrompt(): string {
  return `分析这张图片中的场景，提取以下信息并以 JSON 格式返回：
{
  "name": "场景名称",
  "type": "场景类型",
  "timeOfDay": "时间",
  "weather": "天气",
  "mood": "氛围/情绪",
  "elements": ["元素1", "元素2"],
  "colorPalette": "色调描述",
  "description": "场景整体描述"
}`;
}

export {
  generateCharacterImagePrompt,
  generateCharacterDetailedPromptInstruction,
  generateSceneImagePrompt,
  generateScenePromptOptimization,
  generateVideoPrompt,
  generateSingleBeatPrompt,
  generateQuickModeVideoPrompt,
  generateKeyframePrompt,
  generateFirstFramePrompt,
  generateLastFramePrompt,
  generateStoryPlanPrompt,
  generateCharacterAnalysisPrompt,
  generateSceneAnalysisPrompt,
};
