import type { Story, StoryBeat, ShotInstruction } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";

export function parseStoryPlanJSON(text: string): unknown[] | null {
  let jsonStr = text.trim();

  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1]!.trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // continue to extraction
  }

  const bracketStart = jsonStr.indexOf("[");
  const bracketEnd = jsonStr.lastIndexOf("]");
  if (bracketStart !== -1 && bracketEnd > bracketStart) {
    try {
      const parsed = JSON.parse(jsonStr.slice(bracketStart, bracketEnd + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      errorLogger.warn("[StoryPipeline] Failed to parse JSON with bracket extraction", e as Error);
      return null;
    }
  }

  return null;
}

/** Map legacy shotType + camera fields to structured shotInstruction */
function buildShotInstruction(
  shotType: string,
  cameraAngle: string | undefined,
  cameraMovement: string | undefined,
): ShotInstruction | undefined {
  const SHOT_SIZE_MAP: Record<string, ShotInstruction["shotSize"]> = {
    extreme_close: "extreme_close",
    close: "close",
    medium: "medium",
    wide: "wide",
    extreme_wide: "extreme_wide",
  };

  const ANGLE_MAP: Record<string, ShotInstruction["cameraAngle"]> = {
    eye_level: "eye_level",
    low: "low",
    high: "high",
    birds_eye: "birds_eye",
    worms_eye: "worms_eye",
    dutch: "dutch",
    birdseye: "birds_eye",
    wormseye: "worms_eye",
  };

  const MOVEMENT_MAP: Record<string, ShotInstruction["cameraMovement"]> = {
    static: "static",
    push: "push",
    pull: "pull",
    pan: "pan",
    orbit: "orbit",
    crane_up: "crane_up",
    crane_down: "crane_down",
    tracking: "tracking",
  };

  const shotSize = SHOT_SIZE_MAP[shotType];
  const mappedAngle = cameraAngle ? ANGLE_MAP[cameraAngle] : undefined;
  const mappedMovement = cameraMovement ? MOVEMENT_MAP[cameraMovement] : undefined;

  if (!shotSize && !mappedAngle && !mappedMovement) return undefined;

  return {
    shotSize: shotSize || "medium",
    cameraAngle: mappedAngle || "eye_level",
    cameraMovement: mappedMovement || "static",
  };
}

/** Extract a string from raw beat using primary/secondary keys */
function pickString(raw: Record<string, unknown>, primary: string, secondary: string): string {
  return String(raw[primary] || raw[secondary] || "");
}

/** Parse structured element bindings from raw beat */
function parseStructuredElementBindings(rawElementBindings: unknown): NonNullable<StoryBeat["elementBindings"]> {
  if (!rawElementBindings || typeof rawElementBindings !== "object") return {};
  const result: NonNullable<StoryBeat["elementBindings"]> = {};
  for (const [elId, binding] of Object.entries(rawElementBindings as Record<string, unknown>)) {
    if (!binding || typeof binding !== "object") continue;
    const b = binding as Record<string, unknown>;
    result[elId] = {
      role: (b.role as string | undefined) || (elId.startsWith("CHAR") ? "main_character" : "prop"),
      action: b.action ? String(b.action) : undefined,
      position: b.position ? String(b.position) : undefined,
      emotion: b.emotion ? String(b.emotion) : undefined,
      description: b.description ? String(b.description) : undefined,
    };
  }
  return result;
}

/** Extract fallback element IDs and bindings from beat content */
function extractFallbackElements(content: string): {
  ids: string[];
  bindings: NonNullable<StoryBeat["elementBindings"]>;
} {
  const elementIdRegex = /\b(CHAR|PROP|EFFECT)_\d{3}\b/g;
  const extracted = content.match(elementIdRegex) || [];
  const ids = [...new Set(extracted)];
  const bindings: NonNullable<StoryBeat["elementBindings"]> = {};
  for (const elId of ids) {
    bindings[elId] = { role: elId.startsWith("CHAR") ? "main_character" : "prop" };
  }
  return { ids, bindings };
}

/** Resolve final element IDs and bindings (structured takes priority, fallback from content) */
function resolveElements(
  raw: Record<string, unknown>,
  content: string,
): { ids: string[]; bindings: StoryBeat["elementBindings"] | undefined } {
  const rawElementIds = raw.ei || raw.elementIds;
  const structuredIds = Array.isArray(rawElementIds) ? rawElementIds.map(String) : [];
  const structuredBindings = parseStructuredElementBindings(raw.eb || raw.elementBindings);

  if (structuredIds.length > 0 || Object.keys(structuredBindings).length > 0) {
    return {
      ids: structuredIds.length > 0 ? structuredIds : [],
      bindings: Object.keys(structuredBindings).length > 0 ? structuredBindings : undefined,
    };
  }

  const fallback = extractFallbackElements(content);
  return {
    ids: fallback.ids,
    bindings: fallback.ids.length > 0 ? fallback.bindings : undefined,
  };
}

/** Append dialogue and emotion to beat content if present in raw */
function appendExtraFields(beat: StoryBeat, raw: Record<string, unknown>): void {
  if (raw.dialogue) beat.content = `${beat.content}\n对话：${raw.dialogue}`;
  if (raw.emotion) beat.content = `${beat.content}\n情绪：${raw.emotion}`;
}

export function convertToStoryBeats(
  rawBeats: Record<string, unknown>[],
  _story: Partial<Story>,
  globalEnhancedGeneration: boolean = true,
): StoryBeat[] {
  const validBeats: StoryBeat[] = [];

  for (const [index, raw] of rawBeats.entries()) {
    const content = pickString(raw, "c", "content");
    const description = pickString(raw, "desc", "description") || content;

    if (!description && !content) {
      errorLogger.warn(`[StoryPipeline] Skipping beat at index ${index}: missing description and content`);
      continue;
    }

    const title = pickString(raw, "t", "title");
    const shotType = pickString(raw, "st", "shotType");
    const cameraAngle = pickString(raw, "ca", "cameraAngle");
    const cameraMovement = pickString(raw, "cm", "cameraMovement");
    const rawDuration = raw.d ?? raw.duration;
    const duration = typeof rawDuration === "number" && !isNaN(rawDuration) ? rawDuration : 5;
    const type = pickString(raw, "tp", "type");
    const rawCharacterIds = raw.ci || raw.characterIds;
    const characterIds = Array.isArray(rawCharacterIds) ? rawCharacterIds.map(String) : [];
    const sceneId = raw.si || raw.sceneId ? String(raw.si || raw.sceneId) : undefined;
    const keyframePrompt = pickString(raw, "kp", "keyframePrompt");
    const firstFramePrompt = pickString(raw, "fp", "firstFramePrompt");
    const lastFramePrompt = pickString(raw, "lp", "lastFramePrompt");

    const { ids: finalElementIds, bindings: finalElementBindings } = resolveElements(raw, content);

    const beat: StoryBeat = {
      id: `beat_${crypto.randomUUID()}`,
      sequence: index + 1,
      title: title || `分镜${index + 1}`,
      content: content || "",
      description: description || content || "",
      duration,
      type: (type as StoryBeat["type"]) || "action",
      shotType: (shotType as StoryBeat["shotType"]) || "medium",
      characterIds,
      elementIds: finalElementIds,
      sceneId: sceneId || undefined,
      camera: {
        angle: cameraAngle || undefined,
        movement: cameraMovement || undefined,
      },
      imageGenerationPrompt: keyframePrompt || undefined,
      firstFramePrompt: firstFramePrompt || undefined,
      lastFramePrompt: lastFramePrompt || undefined,
      enhancedGeneration: globalEnhancedGeneration || false,
      elementBindings: finalElementBindings,
      transition: undefined,
      imageUrl: undefined,
      videoReferenceUrl: undefined,
      uploadedKeyframe: undefined,
      uploadedVideo: undefined,
      customChainTarget: undefined,
    };

    const instruction = buildShotInstruction(shotType || "medium", cameraAngle || undefined, cameraMovement || undefined);
    if (instruction) beat.shotInstruction = instruction;

    appendExtraFields(beat, raw);

    validBeats.push(beat);
  }

  return validBeats;
}
