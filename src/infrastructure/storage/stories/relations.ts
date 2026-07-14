import { safeQuery } from "../sqlite-core";
import { parseRecordWithTable } from "../core";
import { VALID_SHOT_TYPES } from "@/domain/schemas/story";
import { safeJsonParse, safeJsonParseArray } from "@/shared/utils/safe-json";
import { errorLogger } from "@/shared/error-logger";

function safeParseJson(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = safeJsonParse(raw, null);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch (e) {
    errorLogger.warn("[StoryRelations] JSON 解析失败", e);
    return null;
  }
}

function parseCharacterIds(parsed: Record<string, unknown>): string[] {
  const raw = parsed.character_ids_json;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.startsWith("[")) return safeJsonParseArray(raw);
  if (raw) return String(raw).split(",").filter(Boolean);
  return [];
}

function applyGenerationFields(beat: Record<string, unknown>, gen: Record<string, unknown> | null): void {
  if (!gen) return;
  if (gen.keyframeImageUrl || gen.keyframePrompt) {
    beat.keyframe = {
      imageUrl: gen.keyframeImageUrl,
      prompt: gen.keyframePrompt,
      generatedAt: gen.keyframeGeneratedAt,
    };
  }
  if (gen.firstFrameUrl || gen.lastFrameUrl) {
    beat.framePair = {
      firstFrame: { imageUrl: gen.firstFrameUrl, prompt: gen.firstFramePrompt },
      ...(gen.lastFrameUrl ? { lastFrame: { imageUrl: gen.lastFrameUrl, prompt: gen.lastFramePrompt } } : {}),
      generatedAt: gen.framePairGeneratedAt,
    };
  }
  if (gen.videoUrl || gen.videoTaskId) {
    beat.videoGen = { taskId: gen.videoTaskId, status: gen.videoStatus || "idle", videoUrl: gen.videoUrl };
  }
  if (gen.firstFramePromptGen) beat.firstFramePrompt = gen.firstFramePromptGen;
  if (gen.lastFramePromptGen) beat.lastFramePrompt = gen.lastFramePromptGen;
}

function applyLocalPaths(beat: Record<string, unknown>, parsed: Record<string, unknown>): void {
  if (parsed.local_video_path) beat.localVideoPath = parsed.local_video_path;
  if (parsed.local_keyframe_path) beat.localKeyframePath = parsed.local_keyframe_path;
  if (parsed.local_first_frame_path) beat.localFirstFramePath = parsed.local_first_frame_path;
  if (parsed.local_last_frame_path) beat.localLastFramePath = parsed.local_last_frame_path;
}

function applyMetaFields(beat: Record<string, unknown>, meta: Record<string, unknown> | null): void {
  if (!meta) return;
  if (meta.elementIds != null) beat.elementIds = meta.elementIds;
  if (meta.elementBindings != null) beat.elementBindings = meta.elementBindings;
  for (const [k, v] of Object.entries(meta)) {
    if (k === "elementIds" || k === "elementBindings") continue;
    const parts = k.split(".");
    let target: Record<string, unknown> = beat;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (target[part] === undefined || target[part] === null || typeof target[part] !== "object") {
        target[part] = {};
      }
      target = target[part] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]!] = v;
  }
}

function parseBeatRow(b: Record<string, unknown>) {
  const parsed = parseRecordWithTable(b, "story_beats");
  const cameraContainer = safeParseJson(parsed.camera);
  const generationContainer = safeParseJson(parsed.generation);
  const metaContainer = safeParseJson(parsed.meta);

  const beat: Record<string, unknown> = {
    id: parsed.id,
    storyId: parsed.story_id,
    sequence: parsed.sequence,
    order: parsed.order_num ?? parsed.sequence,
    description: parsed.description || "",
    duration: parsed.duration ?? 5,
    type: parsed.type,
    title: parsed.title,
    content: parsed.content,
    characterIds: parseCharacterIds(parsed),
    sceneId: parsed.scene_id,
    shotType: cameraContainer?.shotType && VALID_SHOT_TYPES.has(cameraContainer.shotType as string)
      ? cameraContainer.shotType
      : undefined,
    imageGenerationPrompt: generationContainer?.imageGenerationPrompt,
    firstFramePrompt: generationContainer?.firstFramePrompt,
    lastFramePrompt: generationContainer?.lastFramePrompt,
    enhancedGeneration: generationContainer?.enhancedGeneration === true,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  };

  if (cameraContainer && Object.keys(cameraContainer).length > 0) {
    const { shotType: _shotType, ...cameraProps } = cameraContainer;
    if (Object.keys(cameraProps).length > 0) beat.camera = cameraProps;
  }

  applyGenerationFields(beat, generationContainer);
  applyLocalPaths(beat, parsed);
  applyMetaFields(beat, metaContainer);

  return beat;
}

export async function fetchStoryRelations(storyId: string) {
  const [characters, scenes, beats, elements] = await Promise.all([
    safeQuery<{ character_id: string }>(
      "SELECT character_id FROM story_characters WHERE story_id = ? ORDER BY display_order",
      [storyId],
    ),
    safeQuery<{ scene_id: string }>(
      "SELECT scene_id FROM story_scenes WHERE story_id = ? ORDER BY display_order",
      [storyId],
    ),
    safeQuery<Record<string, unknown>>(
      "SELECT * FROM story_beats WHERE story_id = ? ORDER BY sequence",
      [storyId],
    ),
    safeQuery<{ element_id: string; binding_config: string; story_id: string }>(
      "SELECT element_id, binding_config, story_id FROM story_elements WHERE story_id = ?",
      [storyId],
    ),
  ]);

  return {
    characters: characters.map((c) => c.character_id),
    scenes: scenes.map((s) => s.scene_id),
    beats: beats.map(parseBeatRow),
    elementIds: elements.map((e) => e.element_id),
    elementBindings: elements.reduce(
      (acc, e) => {
        if (e.binding_config) {
          acc[e.element_id] = safeJsonParse(e.binding_config, {});
        }
        return acc;
      },
      {} as Record<string, unknown>,
    ),
  };
}

export async function fetchAllStoryRelations(): Promise<Map<string, {
  characters: string[];
  scenes: string[];
  beats: Record<string, unknown>[];
  elementIds: string[];
  elementBindings: Record<string, unknown>;
}>> {
  const [characters, scenes, beats, elements] = await Promise.all([
    safeQuery<{ character_id: string; story_id: string }>(
      "SELECT character_id, story_id FROM story_characters ORDER BY display_order",
    ),
    safeQuery<{ scene_id: string; story_id: string }>(
      "SELECT scene_id, story_id FROM story_scenes ORDER BY display_order",
    ),
    safeQuery<Record<string, unknown>>(
      "SELECT * FROM story_beats ORDER BY sequence",
    ),
    safeQuery<{ element_id: string; binding_config: string; story_id: string }>(
      "SELECT element_id, binding_config, story_id FROM story_elements",
    ),
  ]);

  const charMap = new Map<string, string[]>();
  for (const c of characters) {
    const list = charMap.get(c.story_id) || [];
    list.push(c.character_id);
    charMap.set(c.story_id, list);
  }

  const sceneMap = new Map<string, string[]>();
  for (const s of scenes) {
    const list = sceneMap.get(s.story_id) || [];
    list.push(s.scene_id);
    sceneMap.set(s.story_id, list);
  }

  const beatMap = new Map<string, Record<string, unknown>[]>();
  for (const b of beats) {
    const parsed = parseBeatRow(b);
    const sid = String(parsed.storyId || "");
    if (!sid) continue;
    const list = beatMap.get(sid) || [];
    list.push(parsed);
    beatMap.set(sid, list);
  }

  const elemMap = new Map<string, { ids: string[]; bindings: Record<string, unknown> }>();
  for (const e of elements) {
    const entry = elemMap.get(e.story_id) || { ids: [], bindings: {} as Record<string, unknown> };
    entry.ids.push(e.element_id);
    if (e.binding_config) {
      entry.bindings[e.element_id] = safeJsonParse(e.binding_config, {});
    }
    elemMap.set(e.story_id, entry);
  }

  const allStoryIds = new Set<string>([
    ...charMap.keys(),
    ...sceneMap.keys(),
    ...beatMap.keys(),
    ...elemMap.keys(),
  ]);

  const result = new Map<string, {
    characters: string[];
    scenes: string[];
    beats: Record<string, unknown>[];
    elementIds: string[];
    elementBindings: Record<string, unknown>;
  }>();

  for (const storyId of allStoryIds) {
    const elemEntry = elemMap.get(storyId);
    result.set(storyId, {
      characters: charMap.get(storyId) || [],
      scenes: sceneMap.get(storyId) || [],
      beats: beatMap.get(storyId) || [],
      elementIds: elemEntry?.ids || [],
      elementBindings: elemEntry?.bindings || {},
    });
  }

  return result;
}
