import { safeQuery, safeTransaction } from "../sqlite-core";
import { buildInsert, trackChange } from "../core";
import type { VideoTask } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import {
  toStorageTimestamp,
  toStorageStatus,
  buildConfigJson,
  buildProviderJson,
  buildMediaRefsJson,
  buildTrackingJson,
  buildUpdateSets,
} from "./parser";

export async function bulkPutVideoTasks(
  tasks: Partial<VideoTask>[],
): Promise<void> {
  if (tasks.length === 0) {
    return;
  }
  const taskIds = tasks.map((t) => t.taskId as string);
  const existingIdSet = new Set<string>();
  const placeholders = taskIds.map(() => "?").join(",");
  const existingRows = await safeQuery<{ id: string }>(
    `SELECT id FROM video_tasks WHERE id IN (${placeholders})`,
    taskIds,
  );
  for (const row of existingRows) {
    existingIdSet.add(row.id);
  }

  const insertStatements: { sql: string; params: unknown[] }[] = [];
  const updateTasks: Array<{ id: string; updates: Partial<VideoTask> }> =
    [];

  for (const task of tasks) {
    const taskId = task.taskId as string;
    if (existingIdSet.has(taskId)) {
      const updates: Partial<VideoTask> = {};
      for (const [jsKey, value] of Object.entries(task)) {
        if (value !== undefined) {
          (updates as Record<string, unknown>)[jsKey] = value;
        }
      }
      updateTasks.push({ id: taskId, updates });
    } else {
      const nowSec = Math.floor(Date.now() / 1000);
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
      insertStatements.push(buildInsert("video_tasks", columns, values, "REPLACE"));
    }
  }
  if (insertStatements.length > 0) {
    await safeTransaction(insertStatements);
  }
  const updateStatements: { sql: string; params: unknown[] }[] = [];
  for (const { id, updates } of updateTasks) {
    const { sql: setSql, params: setParams } = buildUpdateSets(updates);
    if (setParams.length === 0) continue;
    const allParams = [...setParams, Math.floor(Date.now() / 1000), id];
    updateStatements.push({
      sql: `UPDATE video_tasks SET ${setSql}, updated_at = ? WHERE id = ?`,
      params: allParams,
    });
  }
  if (updateStatements.length > 0) {
    await safeTransaction(updateStatements);
  }
  for (const taskId of taskIds) {
    try {
      await trackChange("video_task", taskId, "insert");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for video_task:bulkInsert", e); }
  }
}
