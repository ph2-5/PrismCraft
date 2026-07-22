// 重新导出 story-plan-generator 中的类型和函数，保持向后兼容
export type {
  StoryInput,
  GenerateStoryPlanOptions,
  TextGenerationResult,
  GenerateStoryPlanResult,
} from "./story-plan-generator";
export { generateStoryPlanWithValidation } from "./story-plan-generator";
export { buildShotInstructionFromLegacy } from "../prompt/prompt-service";
import { buildShotInstructionFromLegacy } from "../prompt/prompt-service";

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
  shotInstruction?: {
    shotSize?: string;
    cameraAngle?: string;
    cameraMovement?: string;
  };
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
  shotInstruction?: { shotSize?: string; cameraAngle?: string; cameraMovement?: string };
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
  // PR 2b：新格式字段（缩写 ss / 全名 shotSize）
  ss?: string;
  shotSize?: string;
  // PR 2b：完整 shotInstruction 嵌套对象（若 LLM 直接输出嵌套结构）
  shotInstruction?: { shotSize?: string; cameraAngle?: string; cameraMovement?: string };
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

interface EnumFixResult {
  value: string | undefined;
  message?: string;
}

function fixEnumField(
  rawValue: string | undefined,
  aliases: Record<string, string>,
  validValues: string[],
  defaultValue: string,
  fieldName: string,
  defaultOnMissing: boolean,
): EnumFixResult {
  const normalized = normalizeEnumValue(rawValue, aliases, validValues);
  if (normalized && normalized !== rawValue) {
    return { value: normalized, message: `${fieldName}: "${rawValue}" → "${normalized}"` };
  }
  if (!rawValue && defaultOnMissing) {
    return { value: defaultValue };
  }
  if (!normalized && rawValue) {
    return { value: defaultValue, message: `${fieldName}: "${rawValue}" 无效 → "${defaultValue}"` };
  }
  return { value: normalized ?? rawValue };
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

  // PR 2d Step 4d：清除写入端 dual-write — 不再写旧字段，只用于构造 shotInstruction
  const shotTypeFix = fixEnumField(data.shotType, SHOT_TYPE_ALIASES, validShotTypes, "medium", "shotType", true);
  if (shotTypeFix.message) autoFixed.push(shotTypeFix.message);

  const movementFix = fixEnumField(data.cameraMovement, CAMERA_MOVEMENT_ALIASES, validMovements, "static", "cameraMovement", false);
  if (movementFix.message) autoFixed.push(movementFix.message);

  const angleFix = fixEnumField(data.cameraAngle, CAMERA_ANGLE_ALIASES, validAngles, "eye_level", "cameraAngle", false);
  if (angleFix.message) autoFixed.push(angleFix.message);

  if (typeof data.duration === "number") {
    if (data.duration < 2) { fixed.duration = 2; autoFixed.push(`duration: ${data.duration} → 2`); }
    else if (data.duration > 30) { fixed.duration = 30; autoFixed.push(`duration: ${data.duration} → 30`); }
  } else if (data.duration == null) {
    fixed.duration = 5;
  }

  // PR 2d：只填充 shotInstruction 字段（读取端 PR 3 后只读 shotInstruction）
  const shotInstruction = buildShotInstructionFromLegacy({
    shotType: shotTypeFix.value as string | undefined,
    cameraAngle: angleFix.value as string | undefined,
    cameraMovement: movementFix.value as string | undefined,
  });
  if (shotInstruction) {
    fixed.shotInstruction = shotInstruction;
  }

  return { fixed, autoFixed };
}

function resolveShotTypeFromContent(content: string): string {
  if (content.includes("全景") || content.includes("establishing")) return "wide";
  if (content.includes("特写") || content.includes("close-up")) return "close";
  return "medium";
}

function resolveTypeFromContent(content: string): string {
  if (content.includes("对话") || content.includes("说")) return "dialogue";
  if (content.includes("转场") || content.includes("过渡")) return "transition";
  if (content.includes("特效") || content.includes("效果")) return "effect";
  return "action";
}

function normalizeStoryBeatData(data: StoryBeatData): StoryBeatData {
  return {
    title: data.t || data.title,
    content: data.c || data.content,
    description: data.desc || data.description,
    // PR 2b：优先读取新格式 shotSize（缩写 ss），fallback 到旧格式 shotType（缩写 st）
    shotSize: data.ss || data.shotSize || data.st || data.shotType,
    shotType: data.st || data.shotType || data.ss || data.shotSize,
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
    // PR 2b：保留 LLM 可能直接输出的 shotInstruction 嵌套对象
    shotInstruction: data.shotInstruction,
  };
}

function applyStoryBeatAutoFixes(fixed: StoryBeatData, autoFixed: string[]): void {
  if (!fixed.title && fixed.content) {
    fixed.title = String(fixed.content).slice(0, 20) + "...";
    autoFixed.push("title: 从content自动生成");
  }
  if (!fixed.content && fixed.description) {
    fixed.content = fixed.description;
    autoFixed.push("content: 从description复制");
  }
  if (!fixed.duration || typeof fixed.duration !== "number") {
    fixed.duration = 5;
    autoFixed.push("duration: 缺失 → 5");
  }
  // PR 2d Step 4d：清除写入端 dual-write — 不再写 fixed.shotType / fixed.shotSize
  // 推导出的 shotSize 仅用于构造 shotInstruction
  const derivedShotSize = fixed.shotSize || fixed.shotType || resolveShotTypeFromContent(String(fixed.content || ""));
  if (!fixed.shotType) {
    autoFixed.push(`shotType: 缺失 → "${derivedShotSize}" (仅用于构造 shotInstruction)`);
  }
  if (!fixed.type) {
    fixed.type = resolveTypeFromContent(String(fixed.content || ""));
    autoFixed.push(`type: 缺失 → "${fixed.type}"`);
  }
  // PR 2d：只填充 shotInstruction（若尚未存在），读取端 PR 3 后只读 shotInstruction
  if (!fixed.shotInstruction) {
    const shotInstruction = buildShotInstructionFromLegacy({
      shotSize: derivedShotSize,
      shotType: fixed.shotType,
      cameraAngle: fixed.cameraAngle,
      cameraMovement: fixed.cameraMovement,
    });
    if (shotInstruction) {
      fixed.shotInstruction = shotInstruction;
    }
  }
}

export function fixStoryBeat(data: StoryBeatData): {
  fixed: StoryBeatData;
  autoFixed: string[];
} {
  const fixed = { ...normalizeStoryBeatData(data) };
  const autoFixed: string[] = [];
  applyStoryBeatAutoFixes(fixed, autoFixed);
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

function parseElementBindings(raw: RawStoryBeat): {
  ids: string[];
  bindings: Record<string, unknown>;
} {
  const rawElementIds = raw.ei || raw.elementIds;
  const ids = Array.isArray(rawElementIds) ? rawElementIds.map(String) : [];
  const rawBindings = raw.eb || raw.elementBindings;
  const bindings: Record<string, unknown> = {};

  if (rawBindings && typeof rawBindings === "object") {
    for (const [elId, binding] of Object.entries(rawBindings)) {
      if (isRecordLike(binding)) {
        bindings[elId] = {
          role: binding.role || (elId.startsWith("CHAR") ? "main_character" : "prop"),
          action: binding.action ? String(binding.action) : undefined,
          position: binding.position ? String(binding.position) : undefined,
          emotion: binding.emotion ? String(binding.emotion) : undefined,
        };
      }
    }
  }

  return { ids, bindings };
}

function extractFallbackElements(content: string): {
  ids: string[];
  bindings: Record<string, unknown>;
} {
  const elementIdRegex = /\b(CHAR|PROP|EFFECT)_\d{3}\b/g;
  const extracted = content.match(elementIdRegex) || [];
  const ids = [...new Set(extracted)];
  const bindings: Record<string, unknown> = {};
  for (const elId of ids) {
    bindings[elId] = { role: elId.startsWith("CHAR") ? "main_character" : "prop" };
  }
  return { ids, bindings };
}

function resolveElements(
  content: string,
  raw: RawStoryBeat,
): { ids: string[] | undefined; bindings: Record<string, unknown> | undefined } {
  const structured = parseElementBindings(raw);
  if (structured.ids.length > 0 || Object.keys(structured.bindings).length > 0) {
    return {
      ids: structured.ids.length > 0 ? structured.ids : undefined,
      bindings: Object.keys(structured.bindings).length > 0 ? structured.bindings : undefined,
    };
  }

  const fallback = extractFallbackElements(content);
  return {
    ids: fallback.ids.length > 0 ? fallback.ids : undefined,
    bindings: fallback.ids.length > 0 ? fallback.bindings : undefined,
  };
}

interface BeatFieldValues {
  title: string;
  content: string;
  description: string;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  duration: number;
  type: string;
  characterIds: string[];
  sceneId?: string;
  keyframePrompt: string;
  firstFramePrompt: string;
  lastFramePrompt: string;
}

// eslint-disable-next-line complexity -- 数据映射函数，|| 为字段 fallback 非逻辑分支
function extractBeatFieldValues(raw: RawStoryBeat): BeatFieldValues {
  const rawDuration = raw.d ?? raw.duration;
  const rawCharacterIds = raw.ci || raw.characterIds;

  return {
    title: String(raw.t || raw.title || ""),
    content: String(raw.c || raw.content || ""),
    description: String(raw.desc || raw.description || raw.c || raw.content || ""),
    shotType: String(raw.st || raw.shotType || ""),
    cameraAngle: String(raw.ca || raw.cameraAngle || ""),
    cameraMovement: String(raw.cm || raw.cameraMovement || ""),
    duration: typeof rawDuration === "number" && !isNaN(rawDuration) ? rawDuration : 5,
    type: String(raw.tp || raw.type || ""),
    characterIds: Array.isArray(rawCharacterIds) ? rawCharacterIds.map(String) : [],
    sceneId: raw.si || raw.sceneId ? String(raw.si || raw.sceneId) : undefined,
    keyframePrompt: String(raw.kp || raw.keyframePrompt || ""),
    firstFramePrompt: String(raw.fp || raw.firstFramePrompt || ""),
    lastFramePrompt: String(raw.lp || raw.lastFramePrompt || ""),
  };
}

function buildBeatObject(
  fields: BeatFieldValues,
  index: number,
  enhancedGeneration: boolean,
  elementIds: string[] | undefined,
  elementBindings: Record<string, unknown> | undefined,
  idGenerator?: (index: number) => string,
): StoryBeat {
  // PR 2d Step 4d：清除写入端 dual-write — 只写 shotInstruction，不写旧 shotType/camera.angle/movement
  const shotInstruction = buildShotInstructionFromLegacy({
    shotType: fields.shotType || "medium",
    cameraAngle: fields.cameraAngle || undefined,
    cameraMovement: fields.cameraMovement || undefined,
  });
  return {
    id: idGenerator ? idGenerator(index) : `beat-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`,
    sequence: index + 1,
    title: fields.title || `分镜${index + 1}`,
    content: fields.content || "",
    description: fields.description || fields.content || "",
    duration: fields.duration,
    type: fields.type || "action",
    characterIds: fields.characterIds,
    sceneId: fields.sceneId,
    shotInstruction,
    imageGenerationPrompt: fields.keyframePrompt || undefined,
    firstFramePrompt: fields.firstFramePrompt || undefined,
    lastFramePrompt: fields.lastFramePrompt || undefined,
    enhancedGeneration,
    elementIds,
    elementBindings,
  } as StoryBeat;
}

function appendDialogueAndEmotion(beat: StoryBeat, raw: RawStoryBeat): void {
  if (raw.dialogue) beat.content = `${beat.content}\n对话：${raw.dialogue}`;
  if (raw.emotion) beat.content = `${beat.content}\n情绪：${raw.emotion}`;
}

function buildBeatFromRaw(
  raw: RawStoryBeat,
  index: number,
  enhancedGeneration: boolean,
  idGenerator?: (index: number) => string,
): StoryBeat {
  const fields = extractBeatFieldValues(raw);
  const { ids: elementIds, bindings: elementBindings } = resolveElements(fields.content, raw);
  const beat = buildBeatObject(fields, index, enhancedGeneration, elementIds, elementBindings, idGenerator);
  appendDialogueAndEmotion(beat, raw);
  return beat;
}

export function convertToStoryBeats(
  rawBeats: RawStoryBeat[],
  enhancedGeneration = true,
  idGenerator?: (index: number) => string,
): StoryBeat[] {
  return rawBeats.map((raw, index) => buildBeatFromRaw(raw, index, enhancedGeneration, idGenerator));
}
