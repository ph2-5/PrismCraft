import type { Result } from "@/domain/types";
import { err, fromAsyncThrowable, NotFoundError, ValidationError } from "@/domain/types";
import type { Story, CreateStoryInput, UpdateStoryInput, StoryStatus } from "@/domain/schemas";
import { createStoryInputSchema, updateStoryInputSchema, storyStatusSchema } from "@/domain/schemas";
import type { StorySearchOptions } from "@/domain/ports/storage-port";
import { container } from "@/infrastructure/di";
import { safeTransaction } from "@/shared/db-core";
import { DomainEvents } from "@/shared/event-types";
import { saveVersion } from "../../template";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";

function generateStoryId(): string {
  return `story_${crypto.randomUUID()}`;
}

/**
 * Story 关联的原始小说来源信息（从 novel_projects 表回溯）。
 * 当 Story 由小说导入管道创建时，novelSource 不为 null。
 */
export interface NovelSource {
  id: string;
  title: string;
  rawText: string;
  createdAt: number;
  updatedAt: number;
}

/** Story + 关联的原始小说来源（如果存在） */
export interface StoryWithNovelSource {
  story: Story;
  novelSource: NovelSource | null;
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
      const existing = await container.storyStorage.getStoryById(id);
      if (!existing) throw new NotFoundError("Story", id);
      const version = await container.storyStorage.getStoryVersion(id);
      await container.storyStorage.updateStory(id, parsed.data, version ?? undefined);
      const storyTitle = (parsed.data as Partial<Story>).title;
      container.eventBus.emit(DomainEvents.STORY_UPDATED, { id, storyTitle: storyTitle || id });
    });
  },

  /**
   * 更新 Story 状态。验证 status 必须为合法枚举值，并触发 STORY_UPDATED 事件。
   * 与 `update` 不同，此方法不要求乐观锁版本号，仅修改 status 字段。
   */
  async updateStatus(id: string, status: StoryStatus): Promise<Result<void>> {
    const parsed = storyStatusSchema.safeParse(status);
    if (!parsed.success) {
      return err(new ValidationError(`Invalid story status: ${status}`));
    }
    return fromAsyncThrowable(async () => {
      const existing = await container.storyStorage.getStoryById(id);
      if (!existing) throw new NotFoundError("Story", id);
      await container.storyStorage.updateStoryStatus(id, parsed.data);
      container.eventBus.emit(DomainEvents.STORY_UPDATED, {
        id,
        storyTitle: existing.title || id,
      });
    });
  },

  /**
   * 按状态过滤故事。当 status 为 undefined 时返回全部故事（等价于 getAll）。
   */
  async getByStatus(status?: StoryStatus): Promise<Result<Story[]>> {
    if (status === undefined) {
      return fromAsyncThrowable(() => container.storyStorage.getStories());
    }
    const parsed = storyStatusSchema.safeParse(status);
    if (!parsed.success) {
      return err(new ValidationError(`Invalid story status: ${status}`));
    }
    return fromAsyncThrowable(async () => {
      const all = await container.storyStorage.getStories();
      return all.filter((s) => s.status === parsed.data);
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

  async count(options?: StorySearchOptions): Promise<Result<number>> {
    return fromAsyncThrowable(async () => {
      // 当传入 options 时，使用 countStories 走 SQL COUNT 路径（支持过滤条件）
      if (options !== undefined) {
        return container.storyStorage.countStories(options);
      }
      // 无 options 时保持原有行为（getStories().length），向后兼容
      const stories = await container.storyStorage.getStories();
      return stories.length;
    });
  },

  /**
   * 按条件搜索故事。支持 query 模糊匹配（title + description）、status/genre/tone 多选过滤、
   * 字段排序与分页。空 options 等价于 getAll，但走 SQL 路径而非全表加载。
   */
  async search(options: StorySearchOptions): Promise<Result<Story[]>> {
    return fromAsyncThrowable(() => container.storyStorage.searchStories<Story>(options));
  },

  /**
   * 复制故事。基于现有故事创建变体：
   * - 复制 stories 记录（新 ID、新标题、status='draft'）
   * - 复制 story_beats（新 ID、新 story_id，保留 sequence/description/character_ids_json/scene_id/camera/generation/meta）
   * - 复制 story_characters / story_scenes / story_elements 关联
   * - 不复制 story_versions / video_tasks / media_assets
   * 返回包含新 Story 对象的 Result。
   */
  async duplicate(sourceId: string, newTitle: string): Promise<Result<Story>> {
    return fromAsyncThrowable(async () => {
      const existing = await container.storyStorage.getStoryById(sourceId);
      if (!existing) throw new NotFoundError("Story", sourceId);
      const newId = await container.storyStorage.duplicateStory(sourceId, newTitle);
      const created = await container.storyStorage.getStoryById(newId);
      if (!created) throw new NotFoundError("Story", newId);
      container.eventBus.emit(DomainEvents.STORY_CREATED, {
        id: newId,
        storyTitle: created.title,
      });
      return created;
    });
  },

  async getByBeatId(beatId: string): Promise<Result<Story>> {
    return fromAsyncThrowable(async () => {
      const story = await container.storyStorage.getStoryByBeatId(beatId);
      if (!story) throw new NotFoundError("StoryBeat", beatId);
      return story;
    });
  },

  /**
   * 查询 Story 及其关联的原始小说来源（novel_projects.story_id 回溯）。
   * 如果 Story 不是由小说导入管道创建，novelSource 为 null。
   */
  async getStoryWithNovelSource(id: string): Promise<Result<StoryWithNovelSource>> {
    return fromAsyncThrowable(async () => {
      const story = await container.storyStorage.getStoryById(id);
      if (!story) throw new NotFoundError("Story", id);
      const novelRecord = await container.novelProjectStorage.getProjectByStoryId(id);
      const novelSource: NovelSource | null = novelRecord
        ? {
            id: novelRecord.id,
            title: novelRecord.title,
            rawText: novelRecord.rawText,
            createdAt: novelRecord.createdAt,
            updatedAt: novelRecord.updatedAt,
          }
        : null;
      return { story, novelSource };
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
          { code: "StoryServiceUpdateFailed", message: t("error.batchUpdateBeatDbFailed"), cause: e },
          "StoryService",
        );
        throw e;
      }
    }
  },
};
