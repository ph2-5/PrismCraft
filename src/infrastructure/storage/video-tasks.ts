import { safeQuery, safeRun, safeTransaction } from "./sqlite-core";
import { toSqlValue, trackChange, buildInsert } from "./core";
import type { VideoTask } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import {
  toStorageTimestamp,
  parseVideoTask,
  toStorageStatus,
  buildConfigJson,
  buildProviderJson,
  buildMediaRefsJson,
  buildTrackingJson,
  buildUpdateSets,
} from "./video-tasks/parser";
import { bulkPutVideoTasks as bulkPutVideoTasksFn } from "./video-tasks/bulk-operations";

export { normalizeTimestamp, toStorageTimestamp, toStorageTimestampOrNow } from "./video-tasks/parser";

export const videoTaskStorage = {
  async getVideoTasks<T = VideoTask>(): Promise<T[]> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM video_tasks ORDER BY created_at DESC",
    );
    return rows.map((row) => parseVideoTask(row)) as T[];
  },

  async getCompletedVideoTasks<T = VideoTask>(): Promise<T[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM video_tasks WHERE status = ?",
      ["completed"],
    );
    return result.map(parseVideoTask) as T[];
  },

  async getVideoTaskById<T = VideoTask>(
    taskId: string,
  ): Promise<T | null> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM video_tasks WHERE id = ?",
      [taskId],
    );
    return result.length > 0 ? (parseVideoTask(result[0]) as T) : null;
  },

  async getVideoTasksByStory<T = VideoTask>(
    storyId: string,
  ): Promise<T[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM video_tasks WHERE story_id = ? ORDER BY created_at DESC",
      [storyId],
    );
    return result.map(parseVideoTask) as T[];
  },

  async getVideoTasksByStatus<T = VideoTask>(
    status: string,
  ): Promise<T[]> {
    const storageStatus = toStorageStatus(status);
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM video_tasks WHERE status = ? ORDER BY created_at DESC",
      [storageStatus],
    );
    return result.map(parseVideoTask) as T[];
  },

  async getPendingVideoTasks<T = VideoTask>(): Promise<T[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM video_tasks WHERE status IN ('pending', 'generating') ORDER BY created_at ASC",
    );
    return result.map(parseVideoTask) as T[];
  },

  async createVideoTask(task: Partial<VideoTask> & { taskId: string }): Promise<void> {
    const nowSec = Math.floor(Date.now() / 1000);
    const taskId = task.taskId;
    const createdAtRaw = task.createdAt || new Date().toISOString();
    const createdAtSec = toStorageTimestamp(createdAtRaw) ?? nowSec;
    const columns = [
      "id", "status", "progress", "video_url", "local_video_path", "story_id", "beat_id", "message",
      "config", "provider", "media_refs", "tracking", "created_at",
    ];
    const values = [
      taskId,
      toStorageStatus(task.status || "pending"),
      task.progress || 0,
      task.videoUrl || null,
      task.localVideoPath || null,
      task.storyId || null,
      task.beatId || null,
      task.message || null,
      buildConfigJson(task),
      buildProviderJson(task),
      buildMediaRefsJson(task),
      buildTrackingJson(task, createdAtSec),
      createdAtSec,
    ];
    const { sql, params } = buildInsert("video_tasks", columns, values, "IGNORE");
    await safeRun(sql, params);
    try {
      await trackChange("video_task", taskId, "insert");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for video_task:insert", e); }
    if (task.beatId && task.status) {
      await videoTaskStorage.syncBeatVideoStatus(taskId, task.status);
    }
  },

  async updateVideoTask(
    taskId: string,
    updates: Partial<VideoTask>,
  ): Promise<void> {
    if (updates.videoUrl !== undefined && updates.urlObtainedAt === undefined) {
      updates = { ...updates, urlObtainedAt: Math.floor(Date.now() / 1000) };
    }
    const { sql: setSql, params: setParams } = buildUpdateSets(updates);
    if (setParams.length === 0) return;
    const allParams = [...setParams, Math.floor(Date.now() / 1000), taskId];
    const result = await safeRun(
      `UPDATE video_tasks SET ${setSql}, updated_at = ? WHERE id = ?`,
      allParams,
    );
    if (!result || result.changes === 0) {
      const existing = await safeQuery<{ id: string }>(
        "SELECT id FROM video_tasks WHERE id = ?",
        [taskId],
      );
      if (existing.length === 0) {
        throw new Error(`VideoTask not found for update: taskId="${taskId}"`);
      }
    }
    try {
      await trackChange("video_task", taskId, "update");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for video_task:update", e); }
    if (updates.status !== undefined) {
      await videoTaskStorage.syncBeatVideoStatus(taskId, updates.status as string);
    }
  },

  async deleteVideoTask(taskId: string): Promise<void> {
    await safeTransaction([
      { sql: "DELETE FROM video_tasks WHERE id = ?", params: [taskId] },
      { sql: "DELETE FROM video_cache WHERE task_id = ?", params: [taskId] },
    ]);
    try {
      await trackChange("video_task", taskId, "delete");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for video_task:delete", e); }
  },

  async batchDeleteVideoTasks(taskIds: string[]): Promise<void> {
    if (taskIds.length === 0) return;
    const placeholders = taskIds.map(() => "?").join(",");
    await safeTransaction([
      { sql: `DELETE FROM video_cache WHERE task_id IN (${placeholders})`, params: taskIds },
      { sql: `DELETE FROM video_tasks WHERE id IN (${placeholders})`, params: [...taskIds] },
    ]);
    for (const id of taskIds) {
      try {
        await trackChange("video_task", id, "delete");
      } catch (e) { errorLogger.warn("[Storage] trackChange failed for video_task:batchDelete", e); }
    }
  },

  async deleteVideoTasksByStatus(statuses: string[]): Promise<void> {
    if (statuses.length === 0) return;
    const placeholders = statuses.map(() => "?").join(",");
    const deleted = await safeQuery<{ id: string }>(
      `SELECT id FROM video_tasks WHERE status IN (${placeholders})`,
      statuses,
    );
    if (deleted.length === 0) return;
    const deletedIds = deleted.map((r) => r.id);
    const idPlaceholders = deletedIds.map(() => "?").join(",");
    await safeTransaction([
      {
        sql: `DELETE FROM video_cache WHERE task_id IN (${idPlaceholders})`,
        params: deletedIds,
      },
      {
        sql: `DELETE FROM video_tasks WHERE status IN (${placeholders})`,
        params: statuses,
      },
    ]);
    for (const id of deletedIds) {
      try {
        await trackChange("video_task", id, "delete");
      } catch (e) { errorLogger.warn("[Storage] trackChange failed for video_task:deleteByStatus", e); }
    }
  },

  async deleteVideoTasksByBeatId(beatId: string): Promise<void> {
    const deleted = await safeQuery<{ id: string }>(
      "SELECT id FROM video_tasks WHERE beat_id = ?",
      [beatId],
    );
    if (deleted.length === 0) return;
    const deletedIds = deleted.map((r) => r.id);
    const idPlaceholders = deletedIds.map(() => "?").join(",");
    await safeTransaction([
      {
        sql: `DELETE FROM video_cache WHERE task_id IN (${idPlaceholders})`,
        params: deletedIds,
      },
      {
        sql: "DELETE FROM video_tasks WHERE beat_id = ?",
        params: [beatId],
      },
    ]);
    for (const id of deletedIds) {
      try {
        await trackChange("video_task", id, "delete");
      } catch (e) { errorLogger.warn("[Storage] trackChange failed for video_task:deleteByBeatId", e); }
    }
  },

  async deleteVideoTasksByStoryId(storyId: string): Promise<void> {
    const deleted = await safeQuery<{ id: string }>(
      "SELECT id FROM video_tasks WHERE story_id = ?",
      [storyId],
    );
    if (deleted.length === 0) return;
    const deletedIds = deleted.map((r) => r.id);
    const idPlaceholders = deletedIds.map(() => "?").join(",");
    await safeTransaction([
      {
        sql: `DELETE FROM video_cache WHERE task_id IN (${idPlaceholders})`,
        params: deletedIds,
      },
      {
        sql: "DELETE FROM video_tasks WHERE story_id = ?",
        params: [storyId],
      },
    ]);
    for (const id of deletedIds) {
      try {
        await trackChange("video_task", id, "delete");
      } catch (e) { errorLogger.warn("[Storage] trackChange failed for video_task:deleteByStoryId", e); }
    }
  },

  async deleteExpiredVideoTasks(): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const expiredTasks = await safeQuery<{ id: string }>(
      "SELECT id FROM video_tasks WHERE json_extract(tracking, '$.expires_at') IS NOT NULL AND json_extract(tracking, '$.expires_at') < ?",
      [now],
    );
    const count = expiredTasks.length;
    if (count > 0) {
      const idPlaceholders = expiredTasks.map(() => "?").join(",");
      const ids = expiredTasks.map((r) => r.id);
      await safeTransaction([
        {
          sql: "DELETE FROM video_tasks WHERE json_extract(tracking, '$.expires_at') IS NOT NULL AND json_extract(tracking, '$.expires_at') < ?",
          params: [now],
        },
        {
          sql: `DELETE FROM video_cache WHERE task_id IN (${idPlaceholders})`,
          params: ids,
        },
      ]);
      for (const id of ids) {
        try {
        await trackChange("video_task", id, "delete");
      } catch (e) { errorLogger.warn("[Storage] trackChange failed for video_task:deleteExpired", e); }
      }
    }
    return count;
  },

  async clearVideoTasks(): Promise<void> {
    const allTasks = await safeQuery<{ id: string }>(
      "SELECT id FROM video_tasks",
    );
    await safeTransaction([
      { sql: "DELETE FROM video_tasks", params: [] },
      { sql: "DELETE FROM video_cache", params: [] },
    ]);
    for (const row of allTasks) {
      try {
        await trackChange("video_task", row.id, "delete");
      } catch (e) { errorLogger.warn("[Storage] trackChange failed for video_task:clearAll", e); }
    }
  },

  async bulkPutVideoTasks(tasks: Partial<VideoTask>[]): Promise<void> {
    return bulkPutVideoTasksFn(tasks);
  },

  async batchUpdateVideoTasks(
    updates: Array<{ taskId: string; updates: Partial<VideoTask> }>,
  ): Promise<void> {
    if (updates.length === 0) return;
    const statements: { sql: string; params: unknown[] }[] = [];
    for (const { taskId, updates: taskUpdates } of updates) {
      if (taskUpdates.videoUrl !== undefined && taskUpdates.urlObtainedAt === undefined) {
        taskUpdates.urlObtainedAt = Math.floor(Date.now() / 1000);
      }
      const { sql: setSql, params: setParams } = buildUpdateSets(taskUpdates);
      if (setParams.length === 0) continue;
      const allParams = [...setParams, Math.floor(Date.now() / 1000), taskId];
      statements.push({
        sql: `UPDATE video_tasks SET ${setSql}, updated_at = ? WHERE id = ?`,
        params: allParams,
      });
    }
    if (statements.length === 0) return;
    await safeTransaction(statements);
    for (const { taskId, updates: taskUpdates } of updates) {
      try {
        await trackChange("video_task", taskId, "update");
      } catch (e) { errorLogger.warn("[Storage] trackChange failed for video_task:batchUpdate", e); }
      if (taskUpdates.status !== undefined) {
        try {
          await videoTaskStorage.syncBeatVideoStatus(taskId, taskUpdates.status as string);
        } catch (e) { errorLogger.warn("[Storage] syncBeatVideoStatus failed in batchUpdate", e); }
      }
    }
  },

  async syncBeatVideoStatus(taskId: string, status: string): Promise<void> {
    try {
      const storageStatus = toStorageStatus(status);
      await safeRun(
        `UPDATE story_beats SET video_status = ? WHERE video_task_id = ?`,
        [storageStatus, taskId],
      );
    } catch (e) {
      errorLogger.warn("[VideoTasks] syncBeatVideoStatus failed", { taskId, status, error: e });
    }
  },
};
