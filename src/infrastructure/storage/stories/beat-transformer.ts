import { toSqlValue } from "../core";

export function flattenBeat(beat: Record<string, unknown>, now: number) {
  const camera = beat.camera as Record<string, unknown> | undefined;
  const keyframe = beat.keyframe as Record<string, unknown> | undefined;
  const framePair = beat.framePair as Record<string, unknown> | undefined;
  const firstFrame = framePair?.firstFrame as
    | Record<string, unknown>
    | undefined;
  const lastFrame = framePair?.lastFrame as Record<string, unknown> | undefined;
  const videoGen = beat.videoGen as Record<string, unknown> | undefined;

  const knownKeys = new Set([
    "id",
    "sequence",
    "order",
    "description",
    "duration",
    "type",
    "title",
    "content",
    "characterIds",
    "character_ids",
    "character_ids_json",
    "sceneId",
    "scene_id",
    "scene",
    "shotType",
    "shot_type",
    "generationPrompt",
    "generation_prompt",
    "imageGenerationPrompt",
    "image_generation_prompt",
    "firstFramePrompt",
    "first_frame_prompt",
    "lastFramePrompt",
    "last_frame_prompt",
    "firstFramePromptGen",
    "first_frame_prompt_gen",
    "lastFramePromptGen",
    "last_frame_prompt_gen",
    "enhancedGeneration",
    "enhanced_generation",
    "createdAt",
    "created_at",
    "updatedAt",
    "updated_at",
    "keyframeImageUrl",
    "keyframe_image_url",
    "keyframePrompt",
    "keyframe_prompt",
    "keyframeGeneratedAt",
    "keyframe_generated_at",
    "firstFrameUrl",
    "first_frame_url",
    "lastFrameUrl",
    "last_frame_url",
    "framePairGeneratedAt",
    "frame_pair_generated_at",
    "videoUrl",
    "video_url",
    "videoTaskId",
    "video_task_id",
    "videoStatus",
    "video_status",
    "cameraAngle",
    "camera_angle",
    "cameraMovement",
    "camera_movement",
    "cameraDistance",
    "camera_distance",
    "cameraSpeed",
    "camera_speed",
    "characterOutfits",
    "character_outfits",
    "character_outfits_json",
    "camera",
    "generation",
    "meta",
    "keyframe",
    "framePair",
    "videoGen",
  ]);

  const FLATTENED_KEYFRAME_KEYS = new Set([
    "imageUrl",
    "prompt",
    "generatedAt",
    "source",
  ]);
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
  const FLATTENED_CAMERA_KEYS = new Set([
    "angle",
    "movement",
    "distance",
    "speed",
  ]);

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(beat)) {
    if (v === undefined || v === null) continue;

    if (k === "keyframe" && typeof v === "object" && v !== null) {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (
          !FLATTENED_KEYFRAME_KEYS.has(sk) &&
          sv !== undefined &&
          sv !== null
        ) {
          extra[`keyframe.${sk}`] = sv;
        }
      }
      continue;
    }
    if (k === "framePair" && typeof v === "object" && v !== null) {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (
          !FLATTENED_FRAMEPAIR_KEYS.has(sk) &&
          sv !== undefined &&
          sv !== null
        ) {
          extra[`framePair.${sk}`] = sv;
        }
      }
      continue;
    }
    if (k === "videoGen" && typeof v === "object" && v !== null) {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (
          !FLATTENED_VIDEOGEN_KEYS.has(sk) &&
          sv !== undefined &&
          sv !== null
        ) {
          extra[`videoGen.${sk}`] = sv;
        }
      }
      continue;
    }
    if (k === "camera" && typeof v === "object" && v !== null) {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (!FLATTENED_CAMERA_KEYS.has(sk) && sv !== undefined && sv !== null) {
          extra[`camera.${sk}`] = sv;
        }
      }
      continue;
    }

    if (knownKeys.has(k)) continue;
    extra[k] = v;
  }

  const cameraContainer: Record<string, unknown> = {};
  const cameraAngle = camera?.angle || beat.cameraAngle || beat.camera_angle || null;
  const cameraMovement = camera?.movement || beat.cameraMovement || beat.camera_movement || null;
  const cameraDistance = camera?.distance || beat.cameraDistance || beat.camera_distance || null;
  const cameraSpeed = camera?.speed || beat.cameraSpeed || beat.camera_speed || null;
  const shotType = beat.shotType || beat.shot_type || null;
  if (cameraAngle) cameraContainer.angle = cameraAngle;
  if (cameraMovement) cameraContainer.movement = cameraMovement;
  if (cameraDistance) cameraContainer.distance = cameraDistance;
  if (cameraSpeed) cameraContainer.speed = cameraSpeed;
  if (shotType) cameraContainer.shotType = shotType;

  const generationContainer: Record<string, unknown> = {};
  const keyframeImageUrl = keyframe?.imageUrl || beat.keyframeImageUrl || beat.keyframe_image_url || null;
  const keyframePrompt = keyframe?.prompt || beat.keyframePrompt || beat.keyframe_prompt || null;
  const keyframeGeneratedAt = keyframe?.generatedAt || beat.keyframeGeneratedAt || beat.keyframe_generated_at || null;
  const firstFrameUrl = firstFrame?.imageUrl || framePair?.firstFrameUrl || beat.firstFrameUrl || beat.first_frame_url || null;
  const firstFramePrompt = firstFrame?.prompt || framePair?.firstFramePrompt || beat.firstFramePrompt || beat.first_frame_prompt || null;
  const lastFrameUrl = lastFrame?.imageUrl || framePair?.lastFrameUrl || beat.lastFrameUrl || beat.last_frame_url || null;
  const lastFramePrompt = lastFrame?.prompt || framePair?.lastFramePrompt || beat.lastFramePrompt || beat.last_frame_prompt || null;
  const framePairGeneratedAt = framePair?.generatedAt || beat.framePairGeneratedAt || beat.frame_pair_generated_at || null;
  const videoUrl = videoGen?.videoUrl || beat.videoUrl || beat.video_url || null;
  const videoTaskId = videoGen?.taskId || beat.videoTaskId || beat.video_task_id || null;
  const videoStatus = videoGen?.status || beat.videoStatus || beat.video_status || null;
  const generationPrompt = beat.generationPrompt || beat.generation_prompt || null;
  const imageGenerationPrompt = beat.imageGenerationPrompt || beat.image_generation_prompt || null;
  const firstFramePromptGen = beat.firstFramePromptGen || beat.first_frame_prompt_gen || null;
  const lastFramePromptGen = beat.lastFramePromptGen || beat.last_frame_prompt_gen || null;
  const enhancedGeneration = beat.enhancedGeneration === true || beat.enhanced_generation === true || beat.enhancedGeneration === 1 || beat.enhanced_generation === 1;
  const characterOutfits = beat.characterOutfits || beat.character_outfits || null;

  if (keyframeImageUrl) generationContainer.keyframeImageUrl = keyframeImageUrl;
  if (keyframePrompt) generationContainer.keyframePrompt = keyframePrompt;
  if (keyframeGeneratedAt) generationContainer.keyframeGeneratedAt = keyframeGeneratedAt;
  if (firstFrameUrl) generationContainer.firstFrameUrl = firstFrameUrl;
  if (firstFramePrompt) generationContainer.firstFramePrompt = firstFramePrompt;
  if (lastFrameUrl) generationContainer.lastFrameUrl = lastFrameUrl;
  if (lastFramePrompt) generationContainer.lastFramePrompt = lastFramePrompt;
  if (framePairGeneratedAt) generationContainer.framePairGeneratedAt = framePairGeneratedAt;
  if (videoUrl) generationContainer.videoUrl = videoUrl;
  if (videoTaskId) generationContainer.videoTaskId = videoTaskId;
  if (videoStatus) generationContainer.videoStatus = videoStatus;
  if (generationPrompt) generationContainer.generationPrompt = generationPrompt;
  if (imageGenerationPrompt) generationContainer.imageGenerationPrompt = imageGenerationPrompt;
  if (firstFramePromptGen) generationContainer.firstFramePromptGen = firstFramePromptGen;
  if (lastFramePromptGen) generationContainer.lastFramePromptGen = lastFramePromptGen;
  if (enhancedGeneration) generationContainer.enhancedGeneration = true;
  if (characterOutfits) generationContainer.characterOutfits = characterOutfits;

  return {
    cameraContainer,
    generationContainer,
    metaContainer: Object.keys(extra).length > 0 ? extra : null,
    createdAt: beat.createdAt || beat.created_at || now,
    updatedAt: beat.updatedAt || beat.updated_at || now,
  };
}

export function buildBeatInsert(
  beatId: string,
  storyId: string,
  index: number,
  beat: Record<string, unknown>,
  now: number,
): { sql: string; params: unknown[] } {
  const flat = flattenBeat(beat, now);
  const localVideoPath = beat.localVideoPath || beat.local_video_path || null;
  const localKeyframePath = beat.localKeyframePath || beat.local_keyframe_path || null;
  const localFirstFramePath = beat.localFirstFramePath || beat.local_first_frame_path || null;
  const localLastFramePath = beat.localLastFramePath || beat.local_last_frame_path || null;
  return {
    sql: `INSERT OR REPLACE INTO story_beats (id, story_id, sequence, order_num, title, content, description, duration, type, character_ids_json, scene_id, camera, generation, meta, local_video_path, local_keyframe_path, local_first_frame_path, local_last_frame_path, owner_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      Array.isArray(beat.characterIds)
        ? toSqlValue(beat.characterIds)
        : beat.character_ids || beat.character_ids_json || null,
      beat.sceneId || beat.scene_id || beat.scene || null,
      toSqlValue(flat.cameraContainer),
      toSqlValue(flat.generationContainer),
      flat.metaContainer ? toSqlValue(flat.metaContainer) : null,
      localVideoPath,
      localKeyframePath,
      localFirstFramePath,
      localLastFramePath,
      1,
      flat.createdAt,
      flat.updatedAt,
    ],
  };
}
