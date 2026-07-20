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
  shotInstruction?: {
    shotSize?: string;
    cameraAngle?: string;
    cameraMovement?: string;
  };
  duration?: number;
}

export function resolveBeatShotInfo(beat: BeatInput): {
  shotSize?: string;
  cameraAngle?: string;
  cameraMovement?: string;
} {
  return {
    shotSize: beat.shotInstruction?.shotSize ?? beat.shotType,
    cameraAngle: beat.shotInstruction?.cameraAngle ?? beat.camera?.angle,
    cameraMovement: beat.shotInstruction?.cameraMovement ?? beat.camera?.movement,
  };
}

/**
 * 旧 shotType/camera 字段 → 新 shotInstruction 字段的映射表。
 *
 * 语义映射规则（PR 2a 关键）：
 * - shotType 中的 size 类（wide/medium/close/extreme_close/extreme_wide）→ shotSize
 * - shotType 中的 angle 类（low/high/birdseye/wormseye）→ cameraAngle（修正历史 bug：
 *   旧实现把 angle 类 shotType 当成 size，丢失了角度信息）
 * - cameraAngle → cameraAngle（优先级高于 shotType 推断的 angle）
 * - cameraMovement → cameraMovement
 */
const SHOT_SIZE_FROM_LEGACY: Record<string, string> = {
  extreme_close: "extreme_close",
  close: "close",
  medium: "medium",
  wide: "wide",
  extreme_wide: "extreme_wide",
};

const CAMERA_ANGLE_FROM_LEGACY: Record<string, string> = {
  eye_level: "eye_level",
  low: "low",
  high: "high",
  birds_eye: "birds_eye",
  worms_eye: "worms_eye",
  dutch: "dutch",
  birdseye: "birds_eye",
  wormseye: "worms_eye",
};

const CAMERA_MOVEMENT_FROM_LEGACY: Record<string, string> = {
  static: "static",
  push: "push",
  pull: "pull",
  pan: "pan",
  orbit: "orbit",
  crane_up: "crane_up",
  crane_down: "crane_down",
  tracking: "tracking",
};

/**
 * 从旧的 shotType + camera 字段或新的 shotSize 字段构建 shotInstruction 对象。
 *
 * 用途：PR 2a dual-write 策略 — 写入端在填充旧字段的同时也填充 shotInstruction，
 * 让读取端（PR 1 dual-read）能优先读到新字段。修正旧 shotType 中 angle 类
 * （low/high/birdseye/wormseye）被误认为 size 的语义错误。
 *
 * PR 2b 扩展：支持直接传入 shotSize（新格式），优先级 shotSize > shotType。
 *
 * @returns 完整的 shotInstruction 对象，或 undefined（当所有输入都缺失/无效时）
 */
export function buildShotInstructionFromLegacy(params: {
  shotSize?: string;
  shotType?: string;
  cameraAngle?: string;
  cameraMovement?: string;
}): { shotSize: string; cameraAngle: string; cameraMovement: string } | undefined {
  const { shotSize: rawShotSize, shotType, cameraAngle, cameraMovement } = params;

  // PR 2b：shotSize 优先（新格式），fallback 到 shotType 推导
  const shotSize = rawShotSize
    ? (SHOT_SIZE_FROM_LEGACY[rawShotSize] ?? (SHOT_SIZE_FROM_LEGACY[shotType ?? ""] ?? undefined))
    : (shotType ? SHOT_SIZE_FROM_LEGACY[shotType] : undefined);
  // 旧 shotType 可能是 angle 类（low/high/birdseye/wormseye），若 size 映射失败则尝试 angle 映射
  const angleFromShotType = shotType && !shotSize ? CAMERA_ANGLE_FROM_LEGACY[shotType] : undefined;
  const mappedAngle = cameraAngle ? CAMERA_ANGLE_FROM_LEGACY[cameraAngle] : undefined;
  const mappedMovement = cameraMovement ? CAMERA_MOVEMENT_FROM_LEGACY[cameraMovement] : undefined;

  const finalAngle = mappedAngle ?? angleFromShotType;

  if (!shotSize && !finalAngle && !mappedMovement) return undefined;

  return {
    shotSize: shotSize || "medium",
    cameraAngle: finalAngle || "eye_level",
    cameraMovement: mappedMovement || "static",
  };
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
        ? `[Important] Keep character appearance fully consistent with reference image: ${c.name}`
        : "";
      return `${c.name}: ${desc}${imgNote}`;
    });
    parts.push(`[Core Characters]\n${charDescs.join("\n")}`);
    parts.push("[Character Requirements] Keep the appearance, clothing, and features of the above characters fully consistent throughout the video");
  }

  if (scenes.length > 0) {
    const sceneDescs = scenes.map((s) => {
      const desc = buildSceneAtmosphereDesc(s);
      const visual = buildSceneVisualDesc(s);
      const imgNote = s.generatedImage
        ? "[Important] Keep scene fully consistent with reference image"
        : "";
      return `${s.name}: ${[desc, visual].filter(Boolean).join(", ")}${imgNote}`;
    });
    parts.push(`[Fixed Scenes]\n${sceneDescs.join("\n")}`);
  }

  if (elements && elements.length > 0) {
    const elDescs = elements.map((e) => {
      const typeLabel =
        e.type === "character" ? "Character" : e.type === "prop" ? "Prop" : "Effect";
      const tags = e.featureAnchor?.featureTags?.join(", ") || "";
      return `${e.id} (${typeLabel}): ${e.name}${tags ? `, visual features: ${tags}` : ""}`;
    });
    parts.push(`[Global Element Definitions]\n${elDescs.join("\n")}`);
    parts.push("[Element Requirements] Maintain visual consistency of the same element across shots");
  }

  if (beat) {
    parts.push(`[Video Content]\n${beat.content || beat.description || ""}`);

    const shotInfo = resolveBeatShotInfo(beat);
    if (shotInfo.shotSize) {
      const shotTag = SHOT_TYPE_MAP[shotInfo.shotSize] || shotInfo.shotSize;
      parts.push(`[Shot Type] ${shotTag}`);
    }
    if (shotInfo.cameraAngle) parts.push(`[Camera Angle] ${shotInfo.cameraAngle}`);
    if (shotInfo.cameraMovement) {
      const moveTag = CAMERA_MOVEMENT_MAP[shotInfo.cameraMovement] || shotInfo.cameraMovement;
      parts.push(`[Camera Movement] ${moveTag}`);
    }
    if (beat.duration) parts.push(`[Duration] ${beat.duration}s`);
  }

  if (shotInstruction) {
    parts.push(`[Shot Instruction] ${shotInstruction}`);
  }

  parts.push(`[Quality Requirements]\n${QUALITY_TAGS_VIDEO.join(", ")}`);

  return parts.join("\n\n");
}

function generateSingleBeatPrompt(params: VideoPromptParams): string {
  return generateVideoPrompt(params);
}

function generateQuickModeVideoPrompt(params: QuickModeParams): string {
  const { prompt, duration, resolution, style, characters = [], scene } = params;
  const parts: string[] = [];

  const STYLE_PRESETS: Record<string, string> = {
    realistic: "Realistic photography style, natural lighting, fine textures",
    anime: "Japanese anime style, bright colors, smooth lines",
    "2d": "2D illustration style, vivid colors, moe style",
    cinematic: "Cinematic style, cinematic composition, dramatic lighting",
    chinese_style: "Chinese style, traditional elements, oriental aesthetics",
    cyberpunk: "Cyberpunk style, neon lights, futuristic city",
    classical: "Classical Chinese style, ink elements, ancient scenes",
    "3d_cartoon": "3D cartoon render style, rounded shapes, bright colors",
    pixel: "Pixel art style, retro game feel",
    watercolor: "Watercolor painting style, soft transitions, artistic feel",
  };

  const RESOLUTION_CONFIG: Record<string, string> = {
    "720p": "1280x720 HD resolution",
    "1080p": "1920x1080 Full HD resolution",
    "4K": "3840x2160 4K Ultra HD resolution",
  };

  if (characters.length > 0) {
    const charDescs = characters.map((c) => {
      const desc = c.description || c.name;
      const imgNote = c.generatedImage
        ? `[Important] Keep character appearance fully consistent with reference image: ${c.name}`
        : "";
      return `${c.name}: ${desc}${imgNote}`;
    });
    parts.push(`[Core Characters]\n${charDescs.join("\n")}`);
    parts.push("[Character Requirements] Keep the appearance, clothing, and features of the above characters fully consistent throughout the video");
  }

  if (scene) {
    const desc = buildSceneAtmosphereDesc(scene);
    const visual = buildSceneVisualDesc(scene);
    const imgNote = scene.generatedImage
      ? "[Important] Keep scene fully consistent with reference image"
      : "";
    parts.push(
      `[Fixed Scenes] ${scene.name}: ${[desc, visual].filter(Boolean).join(", ")}${imgNote}`,
    );
    parts.push("[Scene Requirements] The entire video takes place in this scene");
  }

  parts.push(`[Video Content]\n${prompt}`);

  const styleDesc = STYLE_PRESETS[style || ""] || style;
  const resDesc =
    RESOLUTION_CONFIG[resolution || ""] || RESOLUTION_CONFIG["1080p"];
  parts.push(`[Visual Style] ${styleDesc}`);
  parts.push(`[Technical Parameters] ${resDesc}, video duration ${duration}s`);

  if (params.referenceImage) {
    parts.push("[Reference Material] Please refer to the provided image for generation");
  }

  parts.push(`[Quality Requirements]\n${QUALITY_TAGS_VIDEO.join(", ")}`);

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
  parts.push("Generate a high-quality storyboard preview image. Requirements:");
  if (params.content) parts.push(`Visual content: ${params.content}`);
  if (params.shotRequirement) {
    const { shotType, cameraAngle, cameraMovement, action } =
      params.shotRequirement;
    if (shotType) parts.push(`Shot type: ${shotType}`);
    if (cameraAngle) parts.push(`Camera angle: ${cameraAngle}`);
    if (cameraMovement) parts.push(`Camera movement: ${cameraMovement}`);
    if (action) parts.push(`Action: ${action}`);
  }
  if (params.prevKeyframe) {
    parts.push("Maintain the same color tone, lighting style, and composition language as the previous shot");
  }
  parts.push(
    "Image requirements: exquisite composition, natural lighting, rich details, suitable as animation storyboard reference",
  );
  return joinParts([...parts, ...QUALITY_TAGS_IMAGE]);
}

function generateFirstFramePrompt(params: {
  keyframePrompt?: string;
  actionDescription?: string;
}): string {
  const parts: string[] = [];
  parts.push("Generate the first frame of the video (opening shot). Requirements:");
  parts.push(
    "This is the opening shot of the video, with the character in the initial state before the action begins.",
  );
  if (params.keyframePrompt)
    parts.push(`Based on the style and composition of the following preview image: ${params.keyframePrompt}`);
  if (params.actionDescription)
    parts.push(
      `Action start state: ${params.actionDescription} (the moment before starting)`,
    );
  parts.push(
    "Image requirements: clearly show the character's starting pose, natural expressions, lighting consistent with the preview image.",
  );
  return joinParts([...parts, ...QUALITY_TAGS_IMAGE]);
}

function generateLastFramePrompt(params: {
  keyframePrompt?: string;
  actionDescription?: string;
  duration?: number;
}): string {
  const parts: string[] = [];
  parts.push("Generate the last frame of the video (ending shot). Requirements:");
  parts.push(
    "This is the ending shot of the video, with the character in the final state after the action is completed.",
  );
  if (params.keyframePrompt)
    parts.push(`Based on the style and composition of the following preview image: ${params.keyframePrompt}`);
  if (params.actionDescription)
    parts.push(
      `Action end state: ${params.actionDescription} (the moment after completion)`,
    );
  if (params.duration)
    parts.push(`Final state after approximately ${params.duration} seconds of video.`);
  parts.push(
    "Image requirements: clearly show the character's ending pose, strong sense of action completion, lighting consistent with the preview image and first frame.",
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
    drama: "Drama pacing: slow buildup -> conflict escalation -> emotional outburst -> lingering conclusion",
    comedy: "Comedy pacing: quick setup -> stacking misunderstandings -> punchline eruption -> happy resolution",
    action: "Action pacing: tense opening -> crisis escalation -> climactic showdown -> victorious conclusion",
    thriller: "Thriller pacing: suspense setup -> clue laying -> twist reveal -> truth emerges",
    romance: "Romance pacing: encounter -> growing closer -> conflict -> reconciliation",
    scifi: "Sci-fi pacing: world-building -> tech showcase -> crisis emerges -> breakthrough resolution",
    fantasy: "Fantasy pacing: otherworld intro -> adventure begins -> trials and growth -> ultimate showdown",
    horror: "Horror pacing: unease buildup -> escalating dread -> scare eruption -> lingering terror",
  };

  const toneGuide: Record<string, string> = {
    neutral: "Neutral tone, objective narration",
    light: "Light and bright, vivid colors, brisk pace",
    warm: "Warm and tender, many close-ups, warm color palette",
    dark: "Heavy and oppressive, dark tones, slow pace, many close-ups",
    epic: "Grand and sweeping, large-scale scenes, epic soundtrack feel",
    intimate: "Warm and tender, many close-ups, warm color palette",
    humorous: "Humorous and witty, brisk pace, exaggerated expression",
  };

  const charDescs =
    characters.length > 0
      ? `\n\nExisting characters:\n${characters.map((c) => `- ${c.name}: ${buildCharacterFullDesc(c)}`).join("\n")}`
      : "";

  const sceneDescs =
    scenes.length > 0
      ? `\n\nExisting scenes:\n${scenes.map((s) => `- ${s.name} (${s.type || ""}): ${buildSceneAtmosphereDesc(s)}${s.description ? `, ${s.description}` : ""}`).join("\n")}`
      : "";

  return `You are a professional animation storyboard director. Based on the following story information, plan a logically complete plot structure.

Story title: ${title || "Untitled"}
Story genre: ${genre || "Drama"}
Story tone: ${tone || "Neutral"}
Story synopsis: ${description || "None"}
Target total duration: ${targetDuration || 60} seconds
${charDescs}${sceneDescs}

Genre pacing guide: ${genreGuide[genre || "drama"] || genreGuide.drama}
Tone guide: ${toneGuide[tone || "neutral"] || toneGuide.neutral}

Important notes:
- Each shot will generate an independent video clip, then be concatenated in order
- Focus on planning the duration and arrangement order of each shot
- The sum of all shots' duration must equal the target total duration of ${targetDuration || 60} seconds

Please return a JSON array in the following format:
[
  {
    "type": "scene" | "dialogue" | "action" | "transition" | "effect",
    "title": "Shot title",
    "content": "Detailed description",
    "duration": number_of_seconds
  }
]

Planning requirements:
1. The plot must have a complete beginning-development-climax-resolution structure
2. Shot types should be diverse
3. Each shot's duration should be reasonable
4. Content descriptions should be detailed and specific
5. Recommended number of shots: ${Math.max(4, Math.floor((targetDuration || 60) / 8))}-${Math.min(15, Math.ceil((targetDuration || 60) / 4))}`;
}

function generateCharacterAnalysisPrompt(): string {
  return `Analyze the character in this image, extract the following information and return it in JSON format:
{
  "name": "Character name",
  "gender": "Gender",
  "age": "Age number",
  "style": "Art style",
  "personality": ["Personality trait 1", "Personality trait 2"],
  "appearance": {
    "hairColor": "Hair color",
    "hairStyle": "Hair style",
    "eyeColor": "Eye color",
    "height": "Height description",
    "build": "Body type",
    "clothing": "Clothing description"
  },
  "description": "Overall character description"
}`;
}

function generateSceneAnalysisPrompt(): string {
  return `Analyze the scene in this image, extract the following information and return it in JSON format:
{
  "name": "Scene name",
  "type": "Scene type",
  "timeOfDay": "Time of day",
  "weather": "Weather",
  "mood": "Mood/atmosphere",
  "elements": ["Element 1", "Element 2"],
  "colorPalette": "Color palette description",
  "description": "Overall scene description"
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
