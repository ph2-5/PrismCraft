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

export function convertToStoryBeats(
  rawBeats: Record<string, unknown>[],
  _story: Partial<Story>,
  globalEnhancedGeneration: boolean = true,
): StoryBeat[] {
  const validBeats: StoryBeat[] = [];

  for (const [index, raw] of rawBeats.entries()) {
    const title = String(raw.t || raw.title || "");
    const content = String(raw.c || raw.content || "");
    const description = String(raw.desc || raw.description || content || "");

    if (!description && !content) {
      errorLogger.warn(`[StoryPipeline] Skipping beat at index ${index}: missing description and content`);
      continue;
    }

    const shotType = String(raw.st || raw.shotType || "");
    const cameraAngle = String(raw.ca || raw.cameraAngle || "");
    const cameraMovement = String(raw.cm || raw.cameraMovement || "");
    const rawDuration = raw.d ?? raw.duration;
    const duration =
      typeof rawDuration === "number" && !isNaN(rawDuration) ? rawDuration : 5;
    const type = String(raw.tp || raw.type || "");
    const rawCharacterIds = raw.ci || raw.characterIds;
    const characterIds = Array.isArray(rawCharacterIds)
      ? rawCharacterIds.map(String)
      : [];
    const sceneId =
      raw.si || raw.sceneId ? String(raw.si || raw.sceneId) : undefined;
    const keyframePrompt = String(raw.kp || raw.keyframePrompt || "");
    const firstFramePrompt = String(raw.fp || raw.firstFramePrompt || "");
    const lastFramePrompt = String(raw.lp || raw.lastFramePrompt || "");

    const rawElementIds = raw.ei || raw.elementIds;
    const structuredElementIds = Array.isArray(rawElementIds)
      ? rawElementIds.map(String)
      : [];

    const rawElementBindings = raw.eb || raw.elementBindings;
    const structuredElementBindings: StoryBeat["elementBindings"] = {};
    if (rawElementBindings && typeof rawElementBindings === "object") {
      for (const [elId, binding] of Object.entries(rawElementBindings)) {
        if (binding && typeof binding === "object") {
          const b = binding as Record<string, unknown>;
          structuredElementBindings[elId] = {
            role:
              (b.role as string | undefined) ||
              (elId.startsWith("CHAR") ? "main_character" : "prop"),
            action: b.action ? String(b.action) : undefined,
            position: b.position ? String(b.position) : undefined,
            emotion: b.emotion ? String(b.emotion) : undefined,
            description: b.description ? String(b.description) : undefined,
          };
        }
      }
    }

    let fallbackElementIds: string[] = [];
    const fallbackElementBindings: StoryBeat["elementBindings"] = {};
    if (structuredElementIds.length === 0) {
      const elementIdRegex = /\b(CHAR|PROP|EFFECT)_\d{3}\b/g;
      const extractedElementIds = content.match(elementIdRegex) || [];
      fallbackElementIds = [...new Set(extractedElementIds)];
      for (const elId of fallbackElementIds) {
        fallbackElementBindings[elId] = {
          role: elId.startsWith("CHAR") ? "main_character" : "prop",
        };
      }
    }

    const finalElementIds =
      structuredElementIds.length > 0
        ? structuredElementIds
        : fallbackElementIds;
    const finalElementBindings =
      Object.keys(structuredElementBindings).length > 0
        ? structuredElementBindings
        : Object.keys(fallbackElementBindings).length > 0
          ? fallbackElementBindings
          : undefined;

    const beatId = `beat_${crypto.randomUUID()}`;

    const beat: StoryBeat = {
      id: beatId,
      sequence: index + 1,
      title: title || `分镜${index + 1}`,
      content: content || "",
      description: description || content || "",
      duration: duration,
      type: (type as StoryBeat["type"]) || "action",
      shotType: (shotType as StoryBeat["shotType"]) || "medium",
      characterIds: characterIds || [],
      elementIds: finalElementIds.length > 0 ? finalElementIds : [],
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
      scene: undefined,
      generationPrompt: undefined,
      transition: undefined,
      imageUrl: undefined,
      videoReferenceUrl: undefined,
      uploadedKeyframe: undefined,
      uploadedVideo: undefined,
      customChainTarget: undefined,
    };

    // Build shotInstruction from parsed shotType + camera fields
    const resolvedShotType = shotType || "medium";
    const instruction = buildShotInstruction(resolvedShotType, cameraAngle || undefined, cameraMovement || undefined);
    if (instruction) {
      beat.shotInstruction = instruction;
    }

    if (raw.dialogue) {
      beat.content = `${beat.content}\n对话：${raw.dialogue}`;
    }

    if (raw.emotion) {
      beat.content = `${beat.content}\n情绪：${raw.emotion}`;
    }

    validBeats.push(beat);
  }

  return validBeats;
}
