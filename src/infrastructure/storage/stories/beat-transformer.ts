import { toSqlValue } from "../core";

function firstOf<T>(...values: Array<unknown>): T | null {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return null;
}

function extractExtraFromObject(
  source: Record<string, unknown>,
  prefix: string,
  flattenedKeys: Set<string>,
  extra: Record<string, unknown>,
): void {
  for (const [sk, sv] of Object.entries(source)) {
    if (!flattenedKeys.has(sk) && sv !== undefined && sv !== null) {
      extra[`${prefix}.${sk}`] = sv;
    }
  }
}

const FLATTENED_KEYFRAME_KEYS = new Set(["imageUrl", "prompt", "generatedAt", "source"]);
const FLATTENED_FRAMEPAIR_KEYS = new Set([
  "firstFrame",
  "lastFrame",
  "generatedAt",
  "firstFrameUrl",
  "lastFrameUrl",
  "firstFramePrompt",
  "lastFramePrompt",
  "source",
]);
const FLATTENED_VIDEOGEN_KEYS = new Set(["videoUrl", "taskId", "status", "prompt", "createdAt", "source", "error"]);
// PR 7：camera 容器只保留 distance/speed/shotInstruction（angle/movement 已删除）
const FLATTENED_CAMERA_KEYS = new Set(["distance", "speed", "shotInstruction"]);

// PR 7：已删除的旧字段，必须在 buildExtra 中显式丢弃，避免被当成"未知字段"放入 metaContainer
// （否则 roundtrip 后会还原这些已废弃字段，破坏 PR 7 的语义）
const DEPRECATED_BEAT_KEYS = new Set([
  "shotType", "shot_type",           // 已被 shotInstruction.shotSize 替代
  "cameraAngle", "camera_angle",     // 已被 shotInstruction.cameraAngle 替代
  "cameraMovement", "camera_movement", // 已被 shotInstruction.cameraMovement 替代
]);
const DEPRECATED_CAMERA_KEYS = new Set([
  "angle",     // 已被 shotInstruction.cameraAngle 替代
  "movement",  // 已被 shotInstruction.cameraMovement 替代
  "shotType",  // 已被 shotInstruction.shotSize 替代
]);

const KNOWN_BEAT_KEYS = new Set([
  "id", "sequence", "order", "description", "duration", "type", "title", "content",
  "characterIds", "character_ids", "character_ids_json",
  "sceneId", "scene_id", "scene",
  // PR 7：shotType 已删除，只保留 shotInstruction（含历史别名 shotSize/ss）
  "shotInstruction", "shotSize", "ss",
  "generationPrompt", "generation_prompt",
  "imageGenerationPrompt", "image_generation_prompt",
  "firstFramePrompt", "first_frame_prompt",
  "lastFramePrompt", "last_frame_prompt",
  "firstFramePromptGen", "first_frame_prompt_gen",
  "lastFramePromptGen", "last_frame_prompt_gen",
  "enhancedGeneration", "enhanced_generation",
  "createdAt", "created_at", "updatedAt", "updated_at",
  "keyframeImageUrl", "keyframe_image_url",
  "keyframePrompt", "keyframe_prompt",
  "keyframeGeneratedAt", "keyframe_generated_at",
  "firstFrameUrl", "first_frame_url",
  "lastFrameUrl", "last_frame_url",
  "framePairGeneratedAt", "frame_pair_generated_at",
  "videoUrl", "video_url",
  "videoTaskId", "video_task_id",
  "videoStatus", "video_status",
  // PR 7：cameraAngle/cameraMovement 已删除（camera.distance/speed 仍保留）
  "cameraDistance", "camera_distance",
  "cameraSpeed", "camera_speed",
  "characterOutfits", "character_outfits", "character_outfits_json",
  "camera", "generation", "meta", "keyframe", "framePair", "videoGen",
  "elementIds", "elementBindings",
  // Q2-1: 原文回溯字段（chapter 识别 + 字符偏移追踪）
  "sourceText", "source_text",
  "sourceSegmentId", "source_segment_id",
  "sourceStartChar", "source_start_char",
  "sourceEndChar", "source_end_char",
  "chapterIndex", "chapter_index",
  "chapterTitle", "chapter_title",
  // Q3-2: Beat 层关联变体
  "characterVariantIds", "character_variant_ids_json",
  "sceneVariantId", "scene_variant_id",
]);

function buildExtra(beat: Record<string, unknown>): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(beat)) {
    if (v === undefined || v === null) continue;
    // PR 7：显式丢弃已删除的旧字段，不放入 metaContainer
    if (DEPRECATED_BEAT_KEYS.has(k)) continue;
    if (typeof v === "object" && v !== null) {
      const obj = v as Record<string, unknown>;
      if (k === "keyframe") { extractExtraFromObject(obj, "keyframe", FLATTENED_KEYFRAME_KEYS, extra); continue; }
      if (k === "framePair") { extractExtraFromObject(obj, "framePair", FLATTENED_FRAMEPAIR_KEYS, extra); continue; }
      if (k === "videoGen") { extractExtraFromObject(obj, "videoGen", FLATTENED_VIDEOGEN_KEYS, extra); continue; }
      if (k === "camera") {
        // PR 7：先剥离 camera.angle/movement/shotType，再提取非已知子字段
        extractExtraFromObject(filterDeprecatedCameraKeys(obj), "camera", FLATTENED_CAMERA_KEYS, extra);
        continue;
      }
    }
    if (KNOWN_BEAT_KEYS.has(k)) continue;
    extra[k] = v;
  }
  return extra;
}

// PR 7：剥离 camera 子对象中已废弃的 angle/movement/shotType 字段
function filterDeprecatedCameraKeys(camera: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [sk, sv] of Object.entries(camera)) {
    if (DEPRECATED_CAMERA_KEYS.has(sk)) continue;
    if (sv === undefined || sv === null) continue;
    filtered[sk] = sv;
  }
  return filtered;
}

function buildMetaContainer(
  beat: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> | null {
  const container: Record<string, unknown> = {};
  if (beat.elementIds != null) container.elementIds = beat.elementIds;
  if (beat.elementBindings != null) container.elementBindings = beat.elementBindings;
  Object.assign(container, extra);
  return Object.keys(container).length > 0 ? container : null;
}

function buildCameraContainer(
  beat: Record<string, unknown>,
  camera: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const container: Record<string, unknown> = {};
  // PR 7：camera 容器只写入 distance/speed/shotInstruction（angle/movement/shotType 已删除）
  const distance = firstOf(camera?.distance, beat.cameraDistance, beat.camera_distance);
  const speed = firstOf(camera?.speed, beat.cameraSpeed, beat.camera_speed);
  const shotInstruction = firstOf(
    beat.shotInstruction,
    camera?.shotInstruction,
  );
  if (distance) container.distance = distance;
  if (speed) container.speed = speed;
  if (shotInstruction) container.shotInstruction = shotInstruction;
  return container;
}

function buildGenerationContainer(
  beat: Record<string, unknown>,
  keyframe: Record<string, unknown> | undefined,
  framePair: Record<string, unknown> | undefined,
  firstFrame: Record<string, unknown> | undefined,
  lastFrame: Record<string, unknown> | undefined,
  videoGen: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const container: Record<string, unknown> = {};
  const assign = (key: string, value: unknown) => { if (value) container[key] = value; };

  assign("keyframeImageUrl", firstOf(keyframe?.imageUrl, beat.keyframeImageUrl, beat.keyframe_image_url));
  assign("keyframePrompt", firstOf(keyframe?.prompt, beat.keyframePrompt, beat.keyframe_prompt));
  assign("keyframeGeneratedAt", firstOf(keyframe?.generatedAt, beat.keyframeGeneratedAt, beat.keyframe_generated_at));
  assign("firstFrameUrl", firstOf(firstFrame?.imageUrl, framePair?.firstFrameUrl, beat.firstFrameUrl, beat.first_frame_url));
  assign("firstFramePrompt", firstOf(firstFrame?.prompt, framePair?.firstFramePrompt, beat.firstFramePrompt, beat.first_frame_prompt));
  assign("lastFrameUrl", firstOf(lastFrame?.imageUrl, framePair?.lastFrameUrl, beat.lastFrameUrl, beat.last_frame_url));
  assign("lastFramePrompt", firstOf(lastFrame?.prompt, framePair?.lastFramePrompt, beat.lastFramePrompt, beat.last_frame_prompt));
  assign("framePairGeneratedAt", firstOf(framePair?.generatedAt, beat.framePairGeneratedAt, beat.frame_pair_generated_at));
  assign("videoUrl", firstOf(videoGen?.videoUrl, beat.videoUrl, beat.video_url));
  assign("videoTaskId", firstOf(videoGen?.taskId, beat.videoTaskId, beat.video_task_id));
  assign("videoStatus", firstOf(videoGen?.status, beat.videoStatus, beat.video_status));
  assign("imageGenerationPrompt", firstOf(beat.imageGenerationPrompt, beat.image_generation_prompt));
  assign("firstFramePromptGen", firstOf(beat.firstFramePromptGen, beat.first_frame_prompt_gen));
  assign("lastFramePromptGen", firstOf(beat.lastFramePromptGen, beat.last_frame_prompt_gen));

  const enhanced = beat.enhancedGeneration === true || beat.enhanced_generation === true ||
    beat.enhancedGeneration === 1 || beat.enhanced_generation === 1;
  if (enhanced) container.enhancedGeneration = true;

  assign("characterOutfits", firstOf(beat.characterOutfits, beat.character_outfits));
  return container;
}

export interface FlattenedBeat {
  cameraContainer: Record<string, unknown>;
  generationContainer: Record<string, unknown>;
  metaContainer: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export function flattenBeat(beat: Record<string, unknown>, now: number): FlattenedBeat {
  const camera = beat.camera as Record<string, unknown> | undefined;
  const keyframe = beat.keyframe as Record<string, unknown> | undefined;
  const framePair = beat.framePair as Record<string, unknown> | undefined;
  const firstFrame = framePair?.firstFrame as Record<string, unknown> | undefined;
  const lastFrame = framePair?.lastFrame as Record<string, unknown> | undefined;
  const videoGen = beat.videoGen as Record<string, unknown> | undefined;

  const extra = buildExtra(beat);
  const cameraContainer = buildCameraContainer(beat, camera);
  const generationContainer = buildGenerationContainer(beat, keyframe, framePair, firstFrame, lastFrame, videoGen);

  return {
    cameraContainer,
    generationContainer,
    metaContainer: buildMetaContainer(beat, extra),
    createdAt: firstOf<number>(beat.createdAt, beat.created_at, now) as number,
    updatedAt: firstOf<number>(beat.updatedAt, beat.updated_at, now) as number,
  };
}

const BEAT_INSERT_SQL = `INSERT INTO story_beats (id, story_id, sequence, order_num, title, content, description, duration, type, character_ids_json, scene_id, camera, generation, meta, local_video_path, local_keyframe_path, local_first_frame_path, local_last_frame_path, character_variant_ids_json, scene_variant_id, owner_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       story_id = excluded.story_id,
       sequence = excluded.sequence,
       order_num = excluded.order_num,
       title = excluded.title,
       content = excluded.content,
       description = excluded.description,
       duration = excluded.duration,
       type = excluded.type,
       character_ids_json = excluded.character_ids_json,
       scene_id = excluded.scene_id,
       camera = excluded.camera,
       generation = excluded.generation,
       meta = excluded.meta,
       local_video_path = excluded.local_video_path,
       local_keyframe_path = excluded.local_keyframe_path,
       local_first_frame_path = excluded.local_first_frame_path,
       local_last_frame_path = excluded.local_last_frame_path,
       character_variant_ids_json = excluded.character_variant_ids_json,
       scene_variant_id = excluded.scene_variant_id,
       updated_at = excluded.updated_at`;

function resolveCharacterIdsValue(beat: Record<string, unknown>): unknown {
  if (Array.isArray(beat.characterIds)) return toSqlValue(beat.characterIds);
  return beat.character_ids || beat.character_ids_json || null;
}

// Q3-2: 解析 characterVariantIds（对称 resolveCharacterIdsValue，但可为空）
function resolveCharacterVariantIdsValue(beat: Record<string, unknown>): unknown {
  if (Array.isArray(beat.characterVariantIds)) return toSqlValue(beat.characterVariantIds);
  return beat.character_variant_ids_json || null;
}

function resolveLocalPath(beat: Record<string, unknown>, camel: string, snake: string): unknown {
  return beat[camel] || beat[snake] || null;
}

export function buildBeatInsert(
  beatId: string,
  storyId: string,
  index: number,
  beat: Record<string, unknown>,
  now: number,
): { sql: string; params: unknown[] } {
  const flat = flattenBeat(beat, now);
  return {
    sql: BEAT_INSERT_SQL,
    params: [
      beatId,
      storyId,
      index,
      beat.order ?? index,
      beat.title || null,
      beat.content || null,
      beat.description || null,
      beat.duration || null,
      beat.type || null,
      resolveCharacterIdsValue(beat),
      beat.sceneId || beat.scene_id || null,
      toSqlValue(flat.cameraContainer),
      toSqlValue(flat.generationContainer),
      flat.metaContainer ? toSqlValue(flat.metaContainer) : null,
      resolveLocalPath(beat, "localVideoPath", "local_video_path"),
      resolveLocalPath(beat, "localKeyframePath", "local_keyframe_path"),
      resolveLocalPath(beat, "localFirstFramePath", "local_first_frame_path"),
      resolveLocalPath(beat, "localLastFramePath", "local_last_frame_path"),
      resolveCharacterVariantIdsValue(beat),
      beat.sceneVariantId || beat.scene_variant_id || null,
      1,
      flat.createdAt,
      flat.updatedAt,
    ],
  };
}
