import { safeQuery } from "../sqlite-core";
import { parseRecordWithTable } from "../core";
import { errorLogger } from "@/shared/error-logger";
import { VALID_SHOT_TYPES } from "@/domain/schemas/story";
import { safeJsonParse, safeJsonParseArray } from "@/shared/utils/safe-json";

function safeParseJson(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = safeJsonParse(raw, null);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
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
    safeQuery<{ element_id: string; binding_config: string }>(
      "SELECT element_id, binding_config FROM story_elements WHERE story_id = ?",
      [storyId],
    ),
  ]);

  return {
    characters: characters.map((c) => c.character_id),
    scenes: scenes.map((s) => s.scene_id),
    beats: beats.map((b) => {
      const parsed = parseRecordWithTable(b, "story_beats");
      const cameraContainer = safeParseJson(parsed.camera);
      const generationContainer = safeParseJson(parsed.generation);
      const metaContainer = safeParseJson(parsed.meta);

      const beat: Record<string, unknown> = {
        id: parsed.id,
        sequence: parsed.sequence,
        order: parsed.order_num ?? parsed.sequence,
        description: parsed.description || "",
        duration: parsed.duration ?? 5,
        type: parsed.type,
        title: parsed.title,
        content: parsed.content,
        characterIds: (() => {
          const raw = parsed.character_ids_json;
          if (Array.isArray(raw)) return raw;
          if (typeof raw === "string" && raw.startsWith("[")) {
            return safeJsonParseArray(raw);
          }
          if (raw) return String(raw).split(",").filter(Boolean);
          return [];
        })(),
        sceneId: parsed.scene_id,
        shotType: cameraContainer?.shotType && VALID_SHOT_TYPES.has(cameraContainer.shotType as string)
          ? cameraContainer.shotType
          : undefined,
        generationPrompt: generationContainer?.generationPrompt,
        imageGenerationPrompt: generationContainer?.imageGenerationPrompt,
        firstFramePrompt: generationContainer?.firstFramePrompt,
        lastFramePrompt: generationContainer?.lastFramePrompt,
        enhancedGeneration: generationContainer?.enhancedGeneration === true,
        createdAt: parsed.created_at,
        updatedAt: parsed.updated_at,
      };

      if (cameraContainer && Object.keys(cameraContainer).length > 0) {
        const { shotType, ...cameraProps } = cameraContainer;
        if (Object.keys(cameraProps).length > 0) {
          beat.camera = cameraProps;
        }
      }

      if (generationContainer?.keyframeImageUrl || generationContainer?.keyframePrompt) {
        beat.keyframe = {
          imageUrl: generationContainer.keyframeImageUrl,
          prompt: generationContainer.keyframePrompt,
          generatedAt: generationContainer.keyframeGeneratedAt,
        };
      }

      if (generationContainer?.firstFrameUrl || generationContainer?.lastFrameUrl) {
        beat.framePair = {
          firstFrame: {
            imageUrl: generationContainer.firstFrameUrl,
            prompt: generationContainer.firstFramePrompt,
          },
          ...(generationContainer.lastFrameUrl
            ? {
                lastFrame: {
                  imageUrl: generationContainer.lastFrameUrl,
                  prompt: generationContainer.lastFramePrompt,
                },
              }
            : {}),
          generatedAt: generationContainer.framePairGeneratedAt,
        };
      }

      if (generationContainer?.videoUrl || generationContainer?.videoTaskId) {
        beat.videoGen = {
          taskId: generationContainer.videoTaskId,
          status: generationContainer.videoStatus || "idle",
          videoUrl: generationContainer.videoUrl,
        };
      }

      if (generationContainer?.firstFramePromptGen) {
        beat.firstFramePrompt = generationContainer.firstFramePromptGen;
      }
      if (generationContainer?.lastFramePromptGen) {
        beat.lastFramePrompt = generationContainer.lastFramePromptGen;
      }

      if (parsed.local_video_path) beat.localVideoPath = parsed.local_video_path;
      if (parsed.local_keyframe_path) beat.localKeyframePath = parsed.local_keyframe_path;
      if (parsed.local_first_frame_path) beat.localFirstFramePath = parsed.local_first_frame_path;
      if (parsed.local_last_frame_path) beat.localLastFramePath = parsed.local_last_frame_path;

      if (metaContainer) {
        for (const [k, v] of Object.entries(metaContainer)) {
          const parts = k.split(".");
          let target: Record<string, unknown> = beat;
          for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (
              target[part] === undefined ||
              target[part] === null ||
              typeof target[part] !== "object"
            ) {
              target[part] = {};
            }
            target = target[part] as Record<string, unknown>;
          }
          target[parts[parts.length - 1]] = v;
        }
      }

      return beat;
    }),
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
