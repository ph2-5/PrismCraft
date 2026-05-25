import type { Result } from "@/domain/types";
import { fromAsyncThrowable, DatabaseError } from "@/domain/types";
import type { Story, CreateStoryInput, UpdateStoryInput, BeatCamera, StoryBeatKeyframe, StoryBeatFramePair, StoryBeatVideoGeneration } from "@/domain/schemas";
import { storySchema, VALID_SHOT_TYPES } from "@/domain/schemas";
import { safeQuery, safeTransaction } from "@/infrastructure/storage/sqlite-core";
import { parseRecord, toSqlValue, trackChange } from "@/infrastructure/storage/core";
import { errorLogger } from "@/shared/error-logger";

function rowToStory(row: Record<string, unknown>): Story {
  const parsed = parseRecord(row, "stories");
  return storySchema.parse({
    id: parsed.id,
    title: parsed.title,
    description: parsed.description ?? "",
    characters: [],
    scenes: [],
    createdAt: parsed.created_at ?? parsed.createdAt,
    updatedAt: parsed.updated_at ?? parsed.updatedAt,
    genre: parsed.genre,
    tone: parsed.tone,
    targetDuration: parsed.target_duration ?? parsed.targetDuration,
    beats: [],
    elementIds: parsed.element_ids_json ?? parsed.element_ids ?? parsed.elementIds ?? [],
    elementBindings: parsed.element_bindings_json ?? parsed.element_bindings ?? {},
  });
}

export const storyRepository = {
  async findAll(): Promise<Result<Story[]>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<Record<string, unknown>>(
        "SELECT * FROM stories ORDER BY updated_at DESC",
      );
      return rows.map(rowToStory);
    });
  },

  async findById(id: string): Promise<Result<Story | null>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<Record<string, unknown>>(
        "SELECT * FROM stories WHERE id = ?",
        [id],
      );
      if (rows.length === 0) return null;
      const story = rowToStory(rows[0]);
      const [charRows, sceneRows, beatRows, elementRows] = await Promise.all([
        safeQuery<{ character_id: string }>(
          "SELECT character_id FROM story_characters WHERE story_id = ?",
          [id],
        ),
        safeQuery<{ scene_id: string }>(
          "SELECT scene_id FROM story_scenes WHERE story_id = ?",
          [id],
        ),
        safeQuery<Record<string, unknown>>(
          "SELECT * FROM story_beats WHERE story_id = ? ORDER BY sequence",
          [id],
        ),
        safeQuery<{ element_id: string; binding_config: string }>(
          "SELECT element_id, binding_config FROM story_elements WHERE story_id = ?",
          [id],
        ),
      ]);
      story.characters = charRows.map((r) => r.character_id);
      story.scenes = sceneRows.map((r) => r.scene_id);
      story.beats = beatRows.map((row) => {
        const parsed = parseRecord(row, "story_beats");
        const cameraContainer = (parsed.camera ?? {}) as Record<string, unknown>;
        const generationContainer = (parsed.generation ?? {}) as Record<string, unknown>;
        const metaContainer = (parsed.meta ?? {}) as Record<string, unknown>;

        const beat = {
          id: String(parsed.id ?? ""),
          sequence: Number(parsed.sequence ?? 0),
          order: Number(parsed.order_num ?? parsed.sequence ?? 0),
          description: String(parsed.description ?? ""),
          duration: Number(parsed.duration ?? 5),
          type: parsed.type as "action" | "dialogue" | "scene" | "transition" | "effect" | undefined,
          title: parsed.title ? String(parsed.title) : undefined,
          content: parsed.content ? String(parsed.content) : undefined,
          character: undefined as string | undefined,
          characters: [] as string[],
          scene: undefined as string | undefined,
          characterIds: Array.isArray(parsed.character_ids_json)
            ? parsed.character_ids_json
            : (typeof parsed.character_ids_json === "string" && parsed.character_ids_json.startsWith("[")
              ? (() => { try { return JSON.parse(parsed.character_ids_json); } catch { return []; } })()
              : []),
          sceneId: parsed.scene_id ? String(parsed.scene_id) : undefined,
          shotType: metaContainer.shotType && VALID_SHOT_TYPES.has(metaContainer.shotType as string) ? (metaContainer.shotType as "wide" | "medium" | "close" | "extreme_close" | "low" | "high" | "birdseye" | "wormseye") : undefined,
          generationPrompt: generationContainer.generationPrompt ? String(generationContainer.generationPrompt) : undefined,
          imageGenerationPrompt: generationContainer.imageGenerationPrompt ? String(generationContainer.imageGenerationPrompt) : undefined,
          firstFramePrompt: generationContainer.firstFramePrompt ? String(generationContainer.firstFramePrompt) : undefined,
          lastFramePrompt: generationContainer.lastFramePrompt ? String(generationContainer.lastFramePrompt) : undefined,
          enhancedGeneration: generationContainer.enhancedGeneration === 1 || generationContainer.enhancedGeneration === true || generationContainer.enhancedGeneration === "1",
          transition: undefined as string | undefined,
          imageUrl: undefined as string | undefined,
          videoReferenceUrl: undefined as string | undefined,
          uploadedKeyframe: undefined as string | undefined,
          uploadedVideo: undefined as string | undefined,
          customChainTarget: undefined as string | undefined,
          createdAt: Number(parsed.created_at) || 0,
          updatedAt: Number(parsed.updated_at) || 0,
          elementIds: [] as string[],
          elementBindings: {} as Record<string, { role?: string; position?: string; action?: string; emotion?: string; description?: string; text?: string; imageUrl?: string }>,
        };

        if (cameraContainer.angle || cameraContainer.movement || cameraContainer.distance || cameraContainer.speed) {
          (beat as Record<string, unknown>).camera = {
            angle: cameraContainer.angle ? String(cameraContainer.angle) : undefined,
            movement: cameraContainer.movement ? String(cameraContainer.movement) : undefined,
            distance: cameraContainer.distance ? String(cameraContainer.distance) : undefined,
            speed: cameraContainer.speed ? String(cameraContainer.speed) : undefined,
          };
        }

        const keyframe = generationContainer.keyframe as Record<string, unknown> | undefined;
        if (keyframe && (keyframe.imageUrl || keyframe.prompt)) {
          (beat as Record<string, unknown>).keyframe = {
            imageUrl: keyframe.imageUrl ? String(keyframe.imageUrl) : undefined,
            prompt: keyframe.prompt ? String(keyframe.prompt) : undefined,
            generatedAt: keyframe.generatedAt ? String(keyframe.generatedAt) : undefined,
          };
        }

        const framePair = generationContainer.framePair as Record<string, unknown> | undefined;
        if (framePair) {
          const firstFrame = framePair.firstFrame as Record<string, unknown> | undefined;
          const lastFrame = framePair.lastFrame as Record<string, unknown> | undefined;
          const hasFirst = firstFrame?.imageUrl || framePair.firstFrameUrl;
          const hasLast = lastFrame?.imageUrl || framePair.lastFrameUrl;
          if (hasFirst || hasLast) {
            (beat as Record<string, unknown>).framePair = {
              firstFrame: {
                imageUrl: firstFrame?.imageUrl ? String(firstFrame.imageUrl) : (framePair.firstFrameUrl ? String(framePair.firstFrameUrl) : undefined),
                prompt: firstFrame?.prompt ? String(firstFrame.prompt) : (framePair.firstFramePrompt ? String(framePair.firstFramePrompt) : undefined),
              },
              ...(hasLast ? {
                lastFrame: {
                  imageUrl: lastFrame?.imageUrl ? String(lastFrame.imageUrl) : (framePair.lastFrameUrl ? String(framePair.lastFrameUrl) : undefined),
                  prompt: lastFrame?.prompt ? String(lastFrame.prompt) : (framePair.lastFramePrompt ? String(framePair.lastFramePrompt) : undefined),
                },
              } : {}),
              generatedAt: framePair.generatedAt ? String(framePair.generatedAt) : undefined,
            };
          }
        }

        const videoGen = generationContainer.videoGen as Record<string, unknown> | undefined;
        if (videoGen && (videoGen.videoUrl || videoGen.taskId)) {
          (beat as Record<string, unknown>).videoGen = {
            taskId: videoGen.taskId ? String(videoGen.taskId) : undefined,
            status: videoGen.status ? String(videoGen.status) : "idle",
            videoUrl: videoGen.videoUrl ? String(videoGen.videoUrl) : undefined,
          };
        }

        if (generationContainer.firstFramePromptGen) {
          (beat as Record<string, unknown>).firstFramePrompt = String(generationContainer.firstFramePromptGen);
        }
        if (generationContainer.lastFramePromptGen) {
          (beat as Record<string, unknown>).lastFramePrompt = String(generationContainer.lastFramePromptGen);
        }

        if (metaContainer.characterOutfits) {
          try {
            (beat as Record<string, unknown>).characterOutfits = typeof metaContainer.characterOutfits === "string"
              ? JSON.parse(String(metaContainer.characterOutfits))
              : metaContainer.characterOutfits;
          } catch {
            (beat as Record<string, unknown>).characterOutfits = metaContainer.characterOutfits;
          }
        }

        if (generationContainer.generationParams) {
          try {
            const extra = typeof generationContainer.generationParams === "string"
              ? JSON.parse(generationContainer.generationParams)
              : generationContainer.generationParams;
            if (typeof extra === "object" && extra !== null && !Array.isArray(extra)) {
              for (const [k, v] of Object.entries(extra)) {
                const parts = k.split(".");
                let target: Record<string, unknown> = beat as Record<string, unknown>;
                for (let i = 0; i < parts.length - 1; i++) {
                  const part = parts[i];
                  if (target[part] === undefined || target[part] === null || typeof target[part] !== "object") {
                    target[part] = {};
                  }
                  target = target[part] as Record<string, unknown>;
                }
                target[parts[parts.length - 1]] = v;
              }
            }
          } catch (error) {
            errorLogger.debug("[Storage] 解析 beat JSON 失败，跳过:", error instanceof Error ? error.message : error);
          }
        }
        return beat;
      });
      story.elementIds = elementRows.map((e) => e.element_id);
      story.elementBindings = elementRows.reduce<Record<string, { role?: string; position?: string; action?: string; emotion?: string; description?: string; text?: string; imageUrl?: string }>>((acc, e) => {
        if (e.binding_config) {
          try { acc[e.element_id] = JSON.parse(e.binding_config); } catch { acc[e.element_id] = e.binding_config as { role?: string; position?: string; action?: string; emotion?: string; description?: string; text?: string; imageUrl?: string }; }
        }
        return acc;
      }, {});
      return story;
    });
  },

  async create(input: CreateStoryInput & { id: string }): Promise<Result<Story>> {
    return fromAsyncThrowable(async () => {
      const now = Math.floor(Date.now() / 1000);
      const statements: Array<{ sql: string; params: unknown[] }> = [];

      statements.push({
        sql: `INSERT OR IGNORE INTO stories (id, title, description, genre, tone, target_duration, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [input.id, input.title, input.description ?? "", input.genre ?? "", input.tone ?? "", input.targetDuration ?? null, now, now],
      });

      if (input.characters?.length) {
        for (const charId of input.characters) {
          statements.push({
            sql: "INSERT OR IGNORE INTO story_characters (story_id, character_id) VALUES (?, ?)",
            params: [input.id, charId],
          });
        }
      }

      if (input.scenes?.length) {
        for (const sceneId of input.scenes) {
          statements.push({
            sql: "INSERT OR IGNORE INTO story_scenes (story_id, scene_id) VALUES (?, ?)",
            params: [input.id, sceneId],
          });
        }
      }

      await safeTransaction(statements);
      try { await trackChange("story", input.id, "insert"); } catch (e) { errorLogger.warn("[Storage] trackChange failed for story:insert", e); }

      const result = await this.findById(input.id);
      if (!result.ok) throw result.error;
      if (!result.value) throw new DatabaseError("Failed to create story");
      return result.value;
    });
  },

  async update(id: string, input: UpdateStoryInput): Promise<Result<void>> {
    return fromAsyncThrowable(async () => {
      const statements: Array<{ sql: string; params: unknown[] }> = [];

      const mainFields: string[] = [];
      const mainValues: unknown[] = [];
      const updatable = { ...input };
      delete (updatable as Record<string, unknown>).id;

      for (const [key, value] of Object.entries(updatable)) {
        if (value === undefined) continue;
        if (key === "characters" || key === "scenes" || key === "beats" || key === "elementIds" || key === "elementBindings") continue;
        const snakeKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
        mainFields.push(`${snakeKey} = ?`);
        mainValues.push(toSqlValue(value));
      }

      if (mainFields.length > 0) {
        mainFields.push("updated_at = ?");
        mainValues.push(Math.floor(Date.now() / 1000));
        mainValues.push(id);
        statements.push({
          sql: `UPDATE stories SET ${mainFields.join(", ")} WHERE id = ?`,
          params: mainValues,
        });
      }

      if (input.characters !== undefined) {
        statements.push({ sql: "DELETE FROM story_characters WHERE story_id = ?", params: [id] });
        for (const charId of input.characters) {
          statements.push({ sql: "INSERT OR IGNORE INTO story_characters (story_id, character_id) VALUES (?, ?)", params: [id, charId] });
        }
      }

      if (input.scenes !== undefined) {
        statements.push({ sql: "DELETE FROM story_scenes WHERE story_id = ?", params: [id] });
        for (const sceneId of input.scenes) {
          statements.push({ sql: "INSERT OR IGNORE INTO story_scenes (story_id, scene_id) VALUES (?, ?)", params: [id, sceneId] });
        }
      }

      if (input.elementIds !== undefined && Array.isArray(input.elementIds)) {
        statements.push({ sql: "DELETE FROM story_elements WHERE story_id = ?", params: [id] });
        for (const elId of input.elementIds) {
          const binding = input.elementBindings?.[elId as string];
          statements.push({
            sql: "INSERT OR IGNORE INTO story_elements (story_id, element_id, binding_config) VALUES (?, ?, ?)",
            params: [id, elId, binding ? JSON.stringify(binding) : null],
          });
        }
      }

      if (input.beats !== undefined && Array.isArray(input.beats)) {
        statements.push({ sql: "DELETE FROM story_beats WHERE story_id = ?", params: [id] });
        const beatNow = Math.floor(Date.now() / 1000);
        for (let i = 0; i < input.beats.length; i++) {
          const beat = input.beats[i] as Record<string, unknown>;
          const beatId = (beat.id as string) || `beat_${id}_${i}_${Date.now()}`;
          const camera = beat.camera as BeatCamera | undefined;
          const keyframe = beat.keyframe as StoryBeatKeyframe | undefined;
          const framePair = beat.framePair as StoryBeatFramePair | undefined;
          const videoGen = beat.videoGen as StoryBeatVideoGeneration | undefined;

          const cameraContainer: Record<string, unknown> = {};
          if (camera?.angle) cameraContainer.angle = camera.angle;
          if (camera?.movement) cameraContainer.movement = camera.movement;
          if (camera?.distance) cameraContainer.distance = camera.distance;
          if (camera?.speed) cameraContainer.speed = camera.speed;

          const generationContainer: Record<string, unknown> = {};
          if (beat.generationPrompt || beat.generation_prompt) generationContainer.generationPrompt = beat.generationPrompt || beat.generation_prompt;
          if (beat.imageGenerationPrompt || beat.image_generation_prompt) generationContainer.imageGenerationPrompt = beat.imageGenerationPrompt || beat.image_generation_prompt;
          if (beat.firstFramePrompt) generationContainer.firstFramePrompt = beat.firstFramePrompt;
          if (beat.lastFramePrompt) generationContainer.lastFramePrompt = beat.lastFramePrompt;
          if (beat.firstFramePromptGen || beat.first_frame_prompt_gen) generationContainer.firstFramePromptGen = beat.firstFramePromptGen || beat.first_frame_prompt_gen;
          if (beat.lastFramePromptGen || beat.last_frame_prompt_gen) generationContainer.lastFramePromptGen = beat.lastFramePromptGen || beat.last_frame_prompt_gen;
          if (beat.enhancedGeneration || beat.enhanced_generation) generationContainer.enhancedGeneration = true;
          if (keyframe) generationContainer.keyframe = keyframe;
          if (framePair) generationContainer.framePair = framePair;
          if (videoGen) generationContainer.videoGen = videoGen;

          const metaContainer: Record<string, unknown> = {};
          if (beat.shotType || beat.shot_type) metaContainer.shotType = beat.shotType || beat.shot_type;
          if (beat.characterOutfits || beat.character_outfits_json) metaContainer.characterOutfits = beat.characterOutfits || beat.character_outfits_json;

          statements.push({
            sql: `INSERT OR REPLACE INTO story_beats (id, story_id, sequence, order_num, description, duration, type, title, content, character_ids_json, scene_id, camera, generation, meta, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [
              beatId, id, i, beat.order ?? i,
              beat.description || null, beat.duration || null, beat.type || null,
              beat.title || null, beat.content || null,
              Array.isArray(beat.characterIds) ? JSON.stringify(beat.characterIds) : (beat.character_ids_json || null),
              beat.sceneId || beat.scene_id || null,
              Object.keys(cameraContainer).length > 0 ? JSON.stringify(cameraContainer) : null,
              Object.keys(generationContainer).length > 0 ? JSON.stringify(generationContainer) : null,
              Object.keys(metaContainer).length > 0 ? JSON.stringify(metaContainer) : null,
              beat.createdAt || beat.created_at || beatNow,
              beat.updatedAt || beat.updated_at || beatNow,
            ],
          });
        }
      }

      if (statements.length > 0) {
        await safeTransaction(statements);
      }

      try { await trackChange("story", id, "update"); } catch (e) { errorLogger.warn("[Storage] trackChange failed for story:update", e); }
    });
  },

  async delete(id: string): Promise<Result<void>> {
    return fromAsyncThrowable(async () => {
      await safeTransaction([
        { sql: "DELETE FROM story_characters WHERE story_id = ?", params: [id] },
        { sql: "DELETE FROM story_scenes WHERE story_id = ?", params: [id] },
        { sql: "DELETE FROM story_beats WHERE story_id = ?", params: [id] },
        { sql: "DELETE FROM story_elements WHERE story_id = ?", params: [id] },
        { sql: "DELETE FROM story_versions WHERE story_id = ?", params: [id] },
        { sql: "DELETE FROM stories WHERE id = ?", params: [id] },
      ]);
      try { await trackChange("story", id, "delete"); } catch (e) { errorLogger.warn("[Storage] trackChange failed for story:delete", e); }
    });
  },

  async count(): Promise<Result<number>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<{ count: number }>(
        "SELECT COUNT(*) as count FROM stories",
      );
      return rows[0]?.count ?? 0;
    });
  },
};
