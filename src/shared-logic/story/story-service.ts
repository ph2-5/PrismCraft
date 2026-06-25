import { generateStoryPlanPrompt } from "../prompt/prompt-service";
import type { CharacterInput, SceneInput } from "../prompt/prompt-service";

export interface RawStoryBeat {
  t?: string;
  title?: string;
  c?: string;
  content?: string;
  desc?: string;
  description?: string;
  st?: string;
  shotType?: string;
  ca?: string;
  cameraAngle?: string;
  cm?: string;
  cameraMovement?: string;
  d?: number;
  duration?: number;
  tp?: string;
  type?: string;
  ci?: string[];
  characterIds?: string[];
  si?: string;
  sceneId?: string;
  kp?: string;
  keyframePrompt?: string;
  fp?: string;
  firstFramePrompt?: string;
  lp?: string;
  lastFramePrompt?: string;
  ei?: string[];
  elementIds?: string[];
  eb?: Record<string, unknown>;
  elementBindings?: Record<string, unknown>;
  dialogue?: string;
  emotion?: string;
  [key: string]: unknown;
}

export interface StoryBeat {
  id?: string;
  sequence?: number;
  title: string;
  content: string;
  description: string;
  shotType: string;
  camera?: { angle?: string; movement?: string };
  duration: number;
  type: string;
  characterIds: string[];
  sceneId?: string;
  keyframePrompt?: string;
  firstFramePrompt?: string;
  lastFramePrompt?: string;
  enhancedGeneration?: boolean;
  elementIds?: string[];
  elementBindings?: Record<string, unknown>;
  imageGenerationPrompt?: string;
  [key: string]: unknown;
}

export interface StoryPlanValidationResult {
  fixedPlan: StoryBeat[];
  errors: string[];
  autoFixed: string[];
}

/**
 * Type guard: a non-null object treated as a string-keyed record.
 * Replaces unsafe `as Record<string, unknown>` assertions on `unknown` values
 * that have already been narrowed to "object" via typeof checks. Arrays are
 * intentionally allowed to preserve the original `typeof === "object"` behavior.
 */
function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Type guard: every element of an array is a non-null object. Used to narrow
 * `unknown[]` to `CharacterInput[]` / `SceneInput[]` whose fields are all
 * optional, so any object satisfies the structural contract. The generic
 * parameter lets callers pick the target element type without runtime field
 * checks (all fields are optional, so structural compatibility holds).
 */
function isObjectArray<T extends object>(value: unknown[]): value is T[] {
  return value.every((v) => typeof v === "object" && v !== null);
}

interface FewShotInput {
  genre: string;
  tone: string;
  beatIndex: number;
  totalBeats: number;
  hasAction?: boolean;
  hasDialogue?: boolean;
}

interface FewShotOutput {
  title: string;
  content: string;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  duration: number;
  type: string;
}

interface FewShotExample {
  input: FewShotInput;
  output: FewShotOutput;
}

const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    input: { genre: "action", tone: "epic", beatIndex: 0, totalBeats: 8, hasAction: true },
    output: {
      title: "黎明破晓",
      content: "广袤的荒野上，朝阳从地平线升起，金色的光芒穿透薄雾。远处一座孤独的城镇轮廓逐渐清晰，风卷起沙尘掠过镜头。",
      shotType: "wide", cameraAngle: "eye_level", cameraMovement: "crane_up", duration: 5, type: "scene",
    },
  },
  {
    input: { genre: "action", tone: "epic", beatIndex: 2, totalBeats: 8, hasAction: true },
    output: {
      title: "对峙",
      content: "主角与对手面对面站立，目光如炬。风吹动两人的衣角，空气中弥漫着紧张的气氛。主角缓缓拔出武器，刀刃反射出冷光。",
      shotType: "medium", cameraAngle: "low", cameraMovement: "push", duration: 4, type: "action",
    },
  },
  {
    input: { genre: "action", tone: "epic", beatIndex: 5, totalBeats: 8, hasAction: true },
    output: {
      title: "绝地反击",
      content: "主角在劣势中突然爆发，一记重击将对手击退。镜头跟随主角的动作快速推进，捕捉每一个力量爆发的瞬间。",
      shotType: "close", cameraAngle: "low", cameraMovement: "tracking", duration: 3, type: "action",
    },
  },
  {
    input: { genre: "romance", tone: "intimate", beatIndex: 0, totalBeats: 6, hasDialogue: true },
    output: {
      title: "初遇",
      content: "午后的咖啡馆，阳光透过落地窗洒下斑驳光影。她低头翻阅书页，他推门而入，风铃轻响。两人目光偶然交汇，时间仿佛静止。",
      shotType: "medium", cameraAngle: "eye_level", cameraMovement: "push", duration: 6, type: "scene",
    },
  },
  {
    input: { genre: "romance", tone: "intimate", beatIndex: 3, totalBeats: 6, hasDialogue: true },
    output: {
      title: "心声",
      content: "她望着窗外的雨幕，轻声说出藏在心底的话。他沉默片刻，然后温柔地握住她的手。特写两人交握的手指，雨滴在窗上滑落。",
      shotType: "close", cameraAngle: "eye_level", cameraMovement: "static", duration: 5, type: "dialogue",
    },
  },
  {
    input: { genre: "mystery", tone: "dark", beatIndex: 0, totalBeats: 7 },
    output: {
      title: "深夜来电",
      content: "凌晨三点，手机屏幕在黑暗中亮起。主角接起电话，对面只有沉重的呼吸声。窗外霓虹灯闪烁，映照出主角紧张的面容。",
      shotType: "close", cameraAngle: "high", cameraMovement: "static", duration: 4, type: "scene",
    },
  },
  {
    input: { genre: "mystery", tone: "dark", beatIndex: 4, totalBeats: 7 },
    output: {
      title: "真相浮现",
      content: "主角翻阅旧档案，一张泛黄的照片从文件堆中滑落。照片上的日期与案件发生日完全吻合。镜头缓缓推向照片，揭示关键线索。",
      shotType: "extreme_close", cameraAngle: "eye_level", cameraMovement: "push", duration: 4, type: "action",
    },
  },
  {
    input: { genre: "comedy", tone: "light", beatIndex: 2, totalBeats: 5, hasDialogue: true },
    output: {
      title: "乌龙误会",
      content: "主角拿着花束满怀期待地走向对方，却认错了人。一个完全陌生的人接过花束，满脸困惑。主角尴尬地站在原地，周围人忍俊不禁。",
      shotType: "medium", cameraAngle: "eye_level", cameraMovement: "static", duration: 4, type: "dialogue",
    },
  },
  {
    input: { genre: "scifi", tone: "epic", beatIndex: 0, totalBeats: 8 },
    output: {
      title: "星际启航",
      content: "巨大的太空站悬浮在蓝色星球轨道上，飞船依次驶出端口。引擎喷射出蓝白色光焰，镜头从太空站全景推至驾驶舱内主角坚定的目光。",
      shotType: "wide", cameraAngle: "birds_eye", cameraMovement: "pull", duration: 6, type: "scene",
    },
  },
  {
    input: { genre: "fantasy", tone: "epic", beatIndex: 3, totalBeats: 8, hasAction: true },
    output: {
      title: "魔法觉醒",
      content: "主角双手爆发出耀眼的金色光芒，魔法符文在空中浮现旋转。周围的风暴被力量驱散，光芒照亮了整个战场。镜头环绕主角，展现力量觉醒的壮观场面。",
      shotType: "medium", cameraAngle: "low", cameraMovement: "orbit", duration: 4, type: "effect",
    },
  },
  {
    input: { genre: "drama", tone: "neutral", beatIndex: 0, totalBeats: 6 },
    output: {
      title: "日常开始",
      content: "清晨的街道，行人匆匆。主角走出公寓大门，深呼吸一口新鲜空气。镜头跟随主角的脚步，展现平凡而真实的城市生活。",
      shotType: "medium", cameraAngle: "eye_level", cameraMovement: "tracking", duration: 5, type: "scene",
    },
  },
  {
    input: { genre: "drama", tone: "dark", beatIndex: 4, totalBeats: 6, hasDialogue: true },
    output: {
      title: "崩溃边缘",
      content: "主角独自坐在昏暗的房间里，手中的信纸微微颤抖。泪水无声地滑落，打湿了纸上的字迹。镜头缓缓推向主角的面容，捕捉每一个细微的情感变化。",
      shotType: "close", cameraAngle: "eye_level", cameraMovement: "push", duration: 5, type: "dialogue",
    },
  },
];

const SHOT_TYPE_ALIASES: Record<string, string> = {
  特写: "close", 近景: "close", 中景: "medium", 全景: "wide", 远景: "wide",
  大远景: "wide", 俯视: "birdseye", 仰视: "wormseye", 低角度: "low", 高角度: "high",
  close_up: "close", extreme_close_up: "extreme_close", wide_shot: "wide",
  medium_shot: "medium", full_shot: "wide", establishing: "wide",
};

const CAMERA_MOVEMENT_ALIASES: Record<string, string> = {
  推: "push", 拉: "pull", 摇: "pan", 移: "tracking", 升: "crane_up",
  降: "crane_down", 环绕: "orbit", 静止: "static", 固定: "static",
  zoom_in: "push", zoom_out: "pull", dolly_in: "push", dolly_out: "pull",
};

const CAMERA_ANGLE_ALIASES: Record<string, string> = {
  平视: "eye_level", 低角度: "low", 高角度: "high", 鸟瞰: "birds_eye",
  仰视: "worms_eye", 倾斜: "dutch", eye: "eye_level", normal: "eye_level",
};

function normalizeEnumValue(
  value: string | undefined,
  aliases: Record<string, string>,
  validValues: string[],
): string | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().replace(/[\s-]/g, "_");
  if (validValues.includes(lower)) return lower;
  if (aliases[value]) return aliases[value];
  if (aliases[lower]) return aliases[lower];
  for (const [alias, target] of Object.entries(aliases)) {
    if (lower === alias.toLowerCase() || lower.includes(alias.toLowerCase()))
      return target;
  }
  return undefined;
}

interface ShotParamsData {
  shotType?: string;
  cameraMovement?: string;
  cameraAngle?: string;
  duration?: number;
  [key: string]: unknown;
}

interface StoryBeatData {
  t?: string;
  title?: string;
  c?: string;
  content?: string;
  desc?: string;
  description?: string;
  st?: string;
  shotType?: string;
  ca?: string;
  cameraAngle?: string;
  cm?: string;
  cameraMovement?: string;
  d?: number;
  duration?: number;
  tp?: string;
  type?: string;
  ci?: string[];
  characterIds?: string[];
  si?: string;
  sceneId?: string;
  kp?: string;
  keyframePrompt?: string;
  fp?: string;
  firstFramePrompt?: string;
  lp?: string;
  lastFramePrompt?: string;
  ei?: string[];
  elementIds?: string[];
  eb?: Record<string, unknown>;
  elementBindings?: Record<string, unknown>;
  [key: string]: unknown;
}

export function fixShotParams(data: ShotParamsData): {
  fixed: ShotParamsData;
  autoFixed: string[];
} {
  const fixed = { ...data };
  const autoFixed: string[] = [];
  const validShotTypes = ["wide", "medium", "close", "extreme_close", "low", "high", "birdseye", "wormseye"];
  const validMovements = ["static", "push", "pull", "pan", "orbit", "crane_up", "crane_down", "tracking"];
  const validAngles = ["eye_level", "low", "high", "birds_eye", "worms_eye", "dutch"];

  const normalizedShotType = normalizeEnumValue(data.shotType, SHOT_TYPE_ALIASES, validShotTypes);
  if (normalizedShotType && normalizedShotType !== data.shotType) {
    fixed.shotType = normalizedShotType;
    autoFixed.push(`shotType: "${data.shotType}" → "${normalizedShotType}"`);
  } else if (!data.shotType) {
    fixed.shotType = "medium";
  } else if (!normalizedShotType) {
    fixed.shotType = "medium";
    autoFixed.push(`shotType: "${data.shotType}" 无效 → "medium"`);
  }

  const normalizedMovement = normalizeEnumValue(data.cameraMovement, CAMERA_MOVEMENT_ALIASES, validMovements);
  if (normalizedMovement && normalizedMovement !== data.cameraMovement) {
    fixed.cameraMovement = normalizedMovement;
    autoFixed.push(`cameraMovement: "${data.cameraMovement}" → "${normalizedMovement}"`);
  } else if (!normalizedMovement && data.cameraMovement) {
    fixed.cameraMovement = "static";
    autoFixed.push(`cameraMovement: "${data.cameraMovement}" 无效 → "static"`);
  }

  const normalizedAngle = normalizeEnumValue(data.cameraAngle, CAMERA_ANGLE_ALIASES, validAngles);
  if (normalizedAngle && normalizedAngle !== data.cameraAngle) {
    fixed.cameraAngle = normalizedAngle;
    autoFixed.push(`cameraAngle: "${data.cameraAngle}" → "${normalizedAngle}"`);
  } else if (!normalizedAngle && data.cameraAngle) {
    fixed.cameraAngle = "eye_level";
    autoFixed.push(`cameraAngle: "${data.cameraAngle}" 无效 → "eye_level"`);
  }

  if (typeof data.duration === "number") {
    if (data.duration < 2) { fixed.duration = 2; autoFixed.push(`duration: ${data.duration} → 2`); }
    else if (data.duration > 30) { fixed.duration = 30; autoFixed.push(`duration: ${data.duration} → 30`); }
  } else if (data.duration == null) {
    fixed.duration = 5;
  }

  return { fixed, autoFixed };
}

export function fixStoryBeat(data: StoryBeatData): {
  fixed: StoryBeatData;
  autoFixed: string[];
} {
  const normalized: StoryBeatData = {
    title: data.t || data.title,
    content: data.c || data.content,
    description: data.desc || data.description,
    shotType: data.st || data.shotType,
    cameraAngle: data.ca || data.cameraAngle,
    cameraMovement: data.cm || data.cameraMovement,
    duration: data.d ?? data.duration,
    type: data.tp || data.type,
    characterIds: data.ci || data.characterIds,
    sceneId: data.si || data.sceneId,
    keyframePrompt: data.kp || data.keyframePrompt,
    firstFramePrompt: data.fp || data.firstFramePrompt,
    lastFramePrompt: data.lp || data.lastFramePrompt,
    elementIds: data.ei || data.elementIds,
    elementBindings: data.eb || data.elementBindings,
  };

  const fixed = { ...normalized };
  const autoFixed: string[] = [];

  if (!fixed.title && fixed.content) { fixed.title = String(fixed.content).slice(0, 20) + "..."; autoFixed.push("title: 从content自动生成"); }
  if (!fixed.content && fixed.description) { fixed.content = fixed.description; autoFixed.push("content: 从description复制"); }
  if (!fixed.duration || typeof fixed.duration !== "number") { fixed.duration = 5; autoFixed.push("duration: 缺失 → 5"); }
  if (!fixed.shotType) {
    const content = String(fixed.content || "");
    if (content.includes("全景") || content.includes("establishing")) fixed.shotType = "wide";
    else if (content.includes("特写") || content.includes("close-up")) fixed.shotType = "close";
    else fixed.shotType = "medium";
    autoFixed.push(`shotType: 缺失 → "${fixed.shotType}"`);
  }
  if (!fixed.type) {
    const content = String(fixed.content || "");
    if (content.includes("对话") || content.includes("说")) fixed.type = "dialogue";
    else if (content.includes("转场") || content.includes("过渡")) fixed.type = "transition";
    else if (content.includes("特效") || content.includes("效果")) fixed.type = "effect";
    else fixed.type = "action";
    autoFixed.push(`type: 缺失 → "${fixed.type}"`);
  }

  return { fixed, autoFixed };
}

export function validateStoryPlan(plan: RawStoryBeat[]): StoryPlanValidationResult {
  const fixedPlan: StoryBeat[] = [];
  const allErrors: string[] = [];
  const allAutoFixed: string[] = [];

  for (let i = 0; i < plan.length; i++) {
    const { fixed, autoFixed } = fixStoryBeat(plan[i]!);
    // Runtime validation: ensure required StoryBeat fields have values
    if (!fixed.description) fixed.description = fixed.content || "";
    if (!fixed.characterIds) fixed.characterIds = [];
    fixedPlan.push(fixed as StoryBeat);
    allAutoFixed.push(...autoFixed.map((f: string) => `[分镜${i + 1}] ${f}`));
    if (!fixed.title) allErrors.push(`[分镜${i + 1}] 缺少标题`);
    if (!fixed.content || fixed.content.length < 10) allErrors.push(`[分镜${i + 1}] 内容过短`);
    if (!fixed.duration || fixed.duration < 2) allErrors.push(`[分镜${i + 1}] 时长无效`);
  }

  return { fixedPlan, errors: allErrors, autoFixed: allAutoFixed };
}

function selectFewShotExamples(context: FewShotInput, count = 3): FewShotExample[] {
  const scored = FEW_SHOT_EXAMPLES.map((example) => {
    let score = 0;
    if (example.input.genre === context.genre) score += 3;
    if (example.input.tone === context.tone) score += 2;
    const posDiff = Math.abs(
      example.input.beatIndex / Math.max(example.input.totalBeats, 1) -
      context.beatIndex / Math.max(context.totalBeats, 1),
    );
    score += Math.max(0, 2 - posDiff * 4);
    return { example, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((s) => s.example);
}

function buildFewShotPrompt(examples: FewShotExample[]): string {
  if (examples.length === 0) return "";
  const parts = ["以下是几个高质量的分镜示例，请参考其结构和详细程度：\n"];
  examples.forEach((example, i) => {
    parts.push(`示例${i + 1}（${example.input.genre}/${example.input.tone}，第${example.input.beatIndex + 1}镜/共${example.input.totalBeats}镜）：`);
    parts.push(`  标题：${example.output.title}`);
    parts.push(`  内容：${example.output.content}`);
    parts.push(`  景别：${example.output.shotType} | 角度：${example.output.cameraAngle} | 运镜：${example.output.cameraMovement}`);
    parts.push(`  时长：${example.output.duration}秒 | 类型：${example.output.type}`);
    parts.push("");
  });
  return parts.join("\n");
}

export function parseStoryPlanJSON(text: string): RawStoryBeat[] | null {
  let jsonStr = text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1]) jsonStr = codeBlockMatch[1].trim();
  const jsonMatch = jsonStr.match(/\[[\s\S]*?\]/);
  if (jsonMatch) jsonStr = jsonMatch[0];
  try {
    const parsed = JSON.parse(jsonStr);
    return validateRawStoryBeats(parsed);
  } catch {
    const start = jsonStr.indexOf("[");
    const end = jsonStr.lastIndexOf("]");
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(jsonStr.slice(start, end + 1));
        return validateRawStoryBeats(parsed);
      } catch { /* no-op */ }
    }
  }
  return null;
}

/**
 * Validate that a parsed JSON value is an array of RawStoryBeat-shaped objects.
 * Replaces unsafe `as RawStoryBeat[]` assertions with runtime element checks:
 * each element must be a non-null object. Field-level shape is left to
 * downstream consumers (all RawStoryBeat fields are optional).
 */
function validateRawStoryBeats(parsed: unknown): RawStoryBeat[] {
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid story beats: expected array");
  }
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) {
      throw new Error("Invalid story beat: expected object");
    }
  }
  return parsed as RawStoryBeat[];
}

export function convertToStoryBeats(
  rawBeats: RawStoryBeat[],
  enhancedGeneration = true,
  idGenerator?: (index: number) => string,
): StoryBeat[] {
  return rawBeats.map((raw, index) => {
    const title = String(raw.t || raw.title || "");
    const content = String(raw.c || raw.content || "");
    const description = String(raw.desc || raw.description || content || "");
    const shotType = String(raw.st || raw.shotType || "");
    const cameraAngle = String(raw.ca || raw.cameraAngle || "");
    const cameraMovement = String(raw.cm || raw.cameraMovement || "");
    const rawDuration = raw.d ?? raw.duration;
    const duration = typeof rawDuration === "number" && !isNaN(rawDuration) ? rawDuration : 5;
    const type = String(raw.tp || raw.type || "");
    const rawCharacterIds = raw.ci || raw.characterIds;
    const characterIds = Array.isArray(rawCharacterIds) ? rawCharacterIds.map(String) : [];
    const sceneId = raw.si || raw.sceneId ? String(raw.si || raw.sceneId) : undefined;
    const keyframePrompt = String(raw.kp || raw.keyframePrompt || "");
    const firstFramePrompt = String(raw.fp || raw.firstFramePrompt || "");
    const lastFramePrompt = String(raw.lp || raw.lastFramePrompt || "");

    const rawElementIds = raw.ei || raw.elementIds;
    const structuredElementIds = Array.isArray(rawElementIds) ? rawElementIds.map(String) : [];
    const rawElementBindings = raw.eb || raw.elementBindings;
    const structuredElementBindings: Record<string, unknown> = {};
    if (rawElementBindings && typeof rawElementBindings === "object") {
      for (const [elId, binding] of Object.entries(rawElementBindings)) {
        if (isRecordLike(binding)) {
          structuredElementBindings[elId] = {
            role: binding.role || (elId.startsWith("CHAR") ? "main_character" : "prop"),
            action: binding.action ? String(binding.action) : undefined,
            position: binding.position ? String(binding.position) : undefined,
            emotion: binding.emotion ? String(binding.emotion) : undefined,
          };
        }
      }
    }

    let fallbackElementIds: string[] = [];
    const fallbackElementBindings: Record<string, unknown> = {};
    if (structuredElementIds.length === 0) {
      const elementIdRegex = /\b(CHAR|PROP|EFFECT)_\d{3}\b/g;
      const extracted = content.match(elementIdRegex) || [];
      fallbackElementIds = [...new Set(extracted)];
      for (const elId of fallbackElementIds) {
        fallbackElementBindings[elId] = { role: elId.startsWith("CHAR") ? "main_character" : "prop" };
      }
    }

    const finalElementIds = structuredElementIds.length > 0 ? structuredElementIds : fallbackElementIds;
    const finalElementBindings =
      Object.keys(structuredElementBindings).length > 0 ? structuredElementBindings :
      Object.keys(fallbackElementBindings).length > 0 ? fallbackElementBindings : undefined;

    const beat: StoryBeat = {
      // ID 生成需要唯一性；默认使用 Date.now()+Math.random()（非纯），可通过 idGenerator 注入纯函数
      id: idGenerator ? idGenerator(index) : `beat-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`,
      sequence: index + 1,
      title: title || `分镜${index + 1}`,
      content: content || "",
      description: description || content || "",
      duration,
      type: type || "action",
      shotType: shotType || "medium",
      characterIds,
      sceneId,
      camera: { angle: cameraAngle || undefined, movement: cameraMovement || undefined },
      imageGenerationPrompt: keyframePrompt || undefined,
      firstFramePrompt: firstFramePrompt || undefined,
      lastFramePrompt: lastFramePrompt || undefined,
      enhancedGeneration,
      elementIds: finalElementIds.length > 0 ? finalElementIds : undefined,
      elementBindings: finalElementBindings,
    };

    if (raw.dialogue) beat.content = `${beat.content}\n对话：${raw.dialogue}`;
    if (raw.emotion) beat.content = `${beat.content}\n情绪：${raw.emotion}`;

    return beat;
  });
}

interface StoryInput {
  title?: string;
  description?: string;
  genre?: string;
  tone?: string;
  targetDuration?: number;
}

interface GenerateStoryPlanOptions {
  maxRetries?: number;
  autoFix?: boolean;
  fewShotCount?: number;
  enhancedGeneration?: boolean;
  planPrompt?: string;
}

interface TextGenerationResult {
  success: boolean;
  data?: { text?: string };
  error?: string | { code: string; message: string };
}

interface GenerateStoryPlanResult {
  beats: StoryBeat[];
  validationResults: StoryPlanValidationResult[];
  autoFixedCount: number;
  retryCount: number;
  fixDetails: string[];
}

export async function generateStoryPlanWithValidation(
  story: StoryInput,
  characters: unknown[],
  scenes: unknown[],
  options: GenerateStoryPlanOptions,
  generateTextFn: (prompt: string, opts: Record<string, unknown>) => Promise<TextGenerationResult>,
): Promise<GenerateStoryPlanResult> {
  const opts: GenerateStoryPlanOptions = { maxRetries: 5, autoFix: true, fewShotCount: 3, enhancedGeneration: true, ...options };
  const maxRetries = opts.maxRetries ?? 5;

  const basePrompt = opts.planPrompt || generateStoryPlanPrompt({
    title: story.title, description: story.description, genre: story.genre,
    tone: story.tone, targetDuration: story.targetDuration,
    characters: isObjectArray<CharacterInput>(characters) ? characters : [],
    scenes: isObjectArray<SceneInput>(scenes) ? scenes : [],
  });

  const fewShotContext: FewShotInput = {
    genre: story.genre || "drama", tone: story.tone || "neutral",
    beatIndex: 0, totalBeats: Math.floor((story.targetDuration || 60) / 5),
  };
  const fewShotExamples = selectFewShotExamples(fewShotContext, opts.fewShotCount);
  const fewShotSection = buildFewShotPrompt(fewShotExamples);
  const enrichedPrompt = `${basePrompt}\n\n${fewShotSection}`;

  let rawBeats: RawStoryBeat[] | null = null;
  let lastValidationErrors: string[] | undefined = undefined;
  let retryCount = 0;
  const validationResults: StoryPlanValidationResult[] = [];
  let autoFixedCount = 0;
  const fixDetails: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const promptToSend = lastValidationErrors
        ? `${enrichedPrompt}\n\n【重要修正要求】上一轮生成的参数存在以下问题，请务必修正：\n${lastValidationErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`
        : enrichedPrompt;

      const result = await generateTextFn(promptToSend, { maxTokens: 4000, temperature: 0.7 });
      if (!result.success || !result.data?.text) {
        const errMsg = typeof result.error === "string" ? result.error : result.error?.message || "AI 未返回有效文本";
        throw new Error(errMsg);
      }

      rawBeats = parseStoryPlanJSON(result.data.text);
      if (!rawBeats || rawBeats.length === 0) throw new Error("STORY_PLAN_PARSE_FAILED");

      const validation = validateStoryPlan(rawBeats);
      validationResults.push(validation);
      autoFixedCount += validation.autoFixed.length;
      fixDetails.push(...validation.autoFixed);
      if (validation.errors.length === 0) break;
      lastValidationErrors = validation.errors;
      retryCount++;
    } catch (error) {
      retryCount++;
      if (attempt >= maxRetries) throw new Error(`STORY_PLAN_GENERATION_FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!rawBeats) throw new Error("STORY_PLAN_GENERATION_FAILED");

  const beats = convertToStoryBeats(rawBeats, opts.enhancedGeneration);

  for (const beat of beats) {
    if (beat.shotType || beat.camera) {
      const { fixed, autoFixed } = fixShotParams({
        shotType: beat.shotType, cameraAngle: beat.camera?.angle,
        cameraMovement: beat.camera?.movement, duration: beat.duration,
      });
      if (autoFixed.length > 0 && opts.autoFix) {
        autoFixedCount += autoFixed.length;
        fixDetails.push(...autoFixed.map((f: string) => `[${beat.title}] ${f}`));
        if (fixed.shotType) beat.shotType = fixed.shotType;
        if (fixed.duration) beat.duration = fixed.duration;
        if (beat.camera) {
          if (fixed.cameraAngle) beat.camera.angle = fixed.cameraAngle;
          if (fixed.cameraMovement) beat.camera.movement = fixed.cameraMovement;
        }
      }
    }
  }

  return { beats, validationResults, autoFixedCount, retryCount, fixDetails };
}
