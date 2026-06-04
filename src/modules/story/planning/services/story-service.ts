import type { Result } from "@/domain/types";
import { err, fromAsyncThrowable, NotFoundError, ValidationError } from "@/domain/types";
import type { Story, CreateStoryInput, UpdateStoryInput } from "@/domain/schemas";
import { createStoryInputSchema, updateStoryInputSchema } from "@/domain/schemas";
import { container } from "@/infrastructure/di";
import { safeTransaction } from "@/shared/db-core";
import { DomainEvents } from "@/shared/event-types";
import { saveVersion } from "../../template";
import { errorLogger } from "@/shared/error-logger";

function generateStoryId(): string {
  return `story_${crypto.randomUUID()}`;
}

export const storyService = {
  async getAll(): Promise<Result<Story[]>> {
    return fromAsyncThrowable(() => container.storyStorage.getStories());
  },

  async getById(id: string): Promise<Result<Story>> {
    return fromAsyncThrowable(async () => {
      const story = await container.storyStorage.getStoryById(id);
      if (!story) throw new NotFoundError("Story", id);
      return story;
    });
  },

  async create(input: CreateStoryInput): Promise<Result<Story>> {
    const parsed = createStoryInputSchema.safeParse(input);
    if (!parsed.success) {
      return err(new ValidationError(parsed.error.message));
    }
    return fromAsyncThrowable(async () => {
      const id = generateStoryId();
      await container.storyStorage.createStory({ ...parsed.data, id });
      const created = await container.storyStorage.getStoryById(id);
      if (!created) throw new NotFoundError("Story", id);
      container.eventBus.emit(DomainEvents.STORY_CREATED, { id, storyTitle: created.title });
      return created;
    });
  },

  async update(id: string, input: UpdateStoryInput): Promise<Result<void>> {
    const parsed = updateStoryInputSchema.safeParse({ ...input, id });
    if (!parsed.success) {
      return err(new ValidationError(parsed.error.message));
    }
    return fromAsyncThrowable(async () => {
      await container.storyStorage.updateStory(id, parsed.data);
      const storyTitle = (parsed.data as Partial<Story>).title;
      container.eventBus.emit(DomainEvents.STORY_UPDATED, { id, storyTitle: storyTitle || id });
    });
  },

  async delete(id: string): Promise<Result<void>> {
    return fromAsyncThrowable(async () => {
      const existing = await container.storyStorage.getStoryById(id);
      if (!existing) throw new NotFoundError("Story", id);
      try {
        await saveVersion(existing, existing.beats || [], "删除前的备份", false);
      } catch (e) {
        errorLogger.warn("[StoryService] 删除前保存版本失败，继续删除:", e instanceof Error ? e.message : e);
      }
      await container.storyStorage.deleteStory(id);
      container.eventBus.emit(DomainEvents.STORY_DELETED, { id, storyTitle: existing.title });
    });
  },

  async count(): Promise<Result<number>> {
    return fromAsyncThrowable(async () => {
      const stories = await container.storyStorage.getStories();
      return stories.length;
    });
  },

  async getByBeatId(beatId: string): Promise<Result<Story>> {
    return fromAsyncThrowable(async () => {
      const story = await container.storyStorage.getStoryByBeatId(beatId);
      if (!story) throw new NotFoundError("StoryBeat", beatId);
      return story;
    });
  },

  async updateBeatMediaUrls(beats: Array<{
    id: string;
    keyframeImageUrl?: string;
    firstFrameImageUrl?: string;
    lastFrameImageUrl?: string;
    videoUrl?: string;
    localKeyframePath?: string;
    localFirstFramePath?: string;
    localLastFramePath?: string;
    localVideoPath?: string;
  }>): Promise<void> {
    const allStatements: { sql: string; params: unknown[] }[] = [];

    for (const beat of beats) {
      const sets: string[] = [];
      const values: unknown[] = [];

      if (beat.keyframeImageUrl) {
        sets.push("generation = json_set(COALESCE(generation, '{}'), '$.keyframeImageUrl', ?)");
        values.push(beat.keyframeImageUrl);
      }
      if (beat.firstFrameImageUrl) {
        sets.push("generation = json_set(COALESCE(generation, '{}'), '$.firstFrameUrl', ?)");
        values.push(beat.firstFrameImageUrl);
      }
      if (beat.lastFrameImageUrl) {
        sets.push("generation = json_set(COALESCE(generation, '{}'), '$.lastFrameUrl', ?)");
        values.push(beat.lastFrameImageUrl);
      }
      if (beat.videoUrl) {
        sets.push("generation = json_set(COALESCE(generation, '{}'), '$.videoUrl', ?)");
        values.push(beat.videoUrl);
      }
      if (beat.localKeyframePath) {
        sets.push("local_keyframe_path = ?");
        values.push(beat.localKeyframePath);
      }
      if (beat.localFirstFramePath) {
        sets.push("local_first_frame_path = ?");
        values.push(beat.localFirstFramePath);
      }
      if (beat.localLastFramePath) {
        sets.push("local_last_frame_path = ?");
        values.push(beat.localLastFramePath);
      }
      if (beat.localVideoPath) {
        sets.push("local_video_path = ?");
        values.push(beat.localVideoPath);
      }

      if (sets.length === 0) continue;

      const sql = `UPDATE story_beats SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`;
      allStatements.push({
        sql,
        params: [...values, Math.floor(Date.now() / 1000), beat.id],
      });
    }

    if (allStatements.length > 0) {
      try {
        await safeTransaction(allStatements);
      } catch (e) {
        errorLogger.warn(
          { code: "StoryServiceUpdateFailed", message: "批量更新分镜数据库记录失败", cause: e },
          "StoryService",
        );
        throw e;
      }
    }
  },
};
