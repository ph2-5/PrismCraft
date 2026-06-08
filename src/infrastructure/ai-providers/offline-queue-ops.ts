import { safeRun, safeQuery } from "@/infrastructure/storage/sqlite-core";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { NETWORK_CONFIG } from "@/infrastructure/network/network.config";
import type { TaskPriority } from "@/infrastructure/network/types";
import {
  type QueuedRequest,
  MAX_RETRIES,
  MAX_RETRY_COUNT,
  calculateRetryDelay,
  deduplicationCache,
  DEDUPE_TTL_MS,
  pruneDeduplicationCache,
  isOnline,
  priorityValue,
  computeDeduplicationKey,
  isPermanentError,
  getAdaptiveInterval,
} from "./offline-queue-utils";

let autoProcessInterval: ReturnType<typeof setInterval> | null = null;
let adaptiveRestartIntervalId: ReturnType<typeof setInterval> | null = null;
let currentProcessor: ((type: string, payload: Record<string, unknown>) => Promise<boolean>) | null = null;
let isProcessing = false;

if (typeof window !== "undefined") {
  const prev = window.__OFFLINE_QUEUE_STATE__;
  if (prev && typeof prev === "object") {
    if (prev.autoProcessInterval) clearInterval(prev.autoProcessInterval);
    if (prev.adaptiveRestartIntervalId) clearInterval(prev.adaptiveRestartIntervalId);
  }
  window.__OFFLINE_QUEUE_STATE__ = {
    get autoProcessInterval() { return autoProcessInterval; },
    get adaptiveRestartIntervalId() { return adaptiveRestartIntervalId; },
  };
}

function restartAutoProcessingWithAdaptiveInterval(): void {
  if (!currentProcessor) return;

  if (autoProcessInterval) {
    clearInterval(autoProcessInterval);
    autoProcessInterval = null;
  }

  const interval = getAdaptiveInterval();

  autoProcessInterval = setInterval(() => {
    if (isOnline() && currentProcessor && !isProcessing) {
      isProcessing = true;
      processPendingQueue(currentProcessor).catch((e) => {
        errorLogger.warn(
          { code: "OFFLINE_QUEUE_AUTO_PROCESS_FAILED", message: String(e) },
          "OfflineQueue",
        );
      }).finally(() => {
        isProcessing = false;
      });
    }
  }, interval);
}

export function startAutoProcessing(
  processor: (
    type: string,
    payload: Record<string, unknown>,
  ) => Promise<boolean>,
  intervalMs: number = NETWORK_CONFIG.offlineQueue.processingInterval,
): void {
  stopAutoProcessing();

  currentProcessor = processor;

  autoProcessInterval = setInterval(() => {
    if (isOnline() && currentProcessor && !isProcessing) {
      isProcessing = true;
      processPendingQueue(processor).catch((e) => {
        errorLogger.warn(
          { code: "OFFLINE_QUEUE_AUTO_PROCESS_FAILED", message: String(e) },
          "OfflineQueue",
        );
      }).finally(() => {
        isProcessing = false;
      });
    }
  }, intervalMs);

  adaptiveRestartIntervalId = setInterval(() => {
    restartAutoProcessingWithAdaptiveInterval();
  }, 60000);
}

export function stopAutoProcessing(): void {
  if (autoProcessInterval) {
    clearInterval(autoProcessInterval);
    autoProcessInterval = null;
  }
  if (adaptiveRestartIntervalId) {
    clearInterval(adaptiveRestartIntervalId);
    adaptiveRestartIntervalId = null;
  }
  currentProcessor = null;
  isProcessing = false;
}

export async function enqueueRequest(
  type: string,
  payload: Record<string, unknown>,
  priority: TaskPriority = "normal",
): Promise<string | null> {
  if (NETWORK_CONFIG.offlineQueue.deduplication) {
    pruneDeduplicationCache();
    const dedupeKey = computeDeduplicationKey(type, payload);
    const existing = deduplicationCache.get(dedupeKey);
    if (existing) {
      try {
        const rows = await safeQuery(
          `SELECT id FROM generation_tasks WHERE id = ? AND status IN ('pending', 'processing')`,
          [existing.value],
        );
        if (rows && rows.length > 0) {
          return existing.value;
        }
      } catch (error) {
        errorLogger.debug(
          { code: "OFFLINE_QUEUE_DEDUPE_CHECK_FAILED", message: "Deduplication cache entry check failed", cause: error },
          "OfflineQueue",
        );
      }
      deduplicationCache.delete(dedupeKey);
    }

    try {
      const id = `req_${crypto.randomUUID()}`;
      await safeRun(
        `INSERT INTO generation_tasks (id, task_type, status, input_params, priority, created_at)
         VALUES (?, ?, 'pending', ?, ?, ?)`,
        [id, type, JSON.stringify(payload), priority, Math.floor(Date.now() / 1000)],
      );
      deduplicationCache.set(dedupeKey, { value: id, expiresAt: Date.now() + DEDUPE_TTL_MS });
      return id;
    } catch (error) {
      errorLogger.warn(
        { code: "OFFLINE_QUEUE_ENQUEUE_FAILED", message: "Failed to enqueue offline task", cause: error },
        "OfflineQueue",
      );
      return null;
    }
  }

  try {
    const id = `req_${crypto.randomUUID()}`;
    await safeRun(
      `INSERT INTO generation_tasks (id, task_type, status, input_params, priority, created_at)
       VALUES (?, ?, 'pending', ?, ?, ?)`,
      [id, type, JSON.stringify(payload), priority, Math.floor(Date.now() / 1000)],
    );
    return id;
  } catch (error) {
    errorLogger.warn(
        { code: "OFFLINE_QUEUE_ENQUEUE_FAILED", message: "Failed to enqueue offline task", cause: error },
        "OfflineQueue",
      );
    return null;
  }
}

export async function getPendingRequests(): Promise<QueuedRequest[]> {
  try {
    const staleThreshold = Math.floor(Date.now() / 1000) - 300;
    await safeRun(
      `UPDATE generation_tasks SET status = 'pending' WHERE status = 'processing' AND last_attempt_at < ?`,
      [staleThreshold],
    );

    const now = Math.floor(Date.now() / 1000);
    const rows = await safeQuery(
      `SELECT id, task_type as type, input_params as payload, status,
              retry_count as retryCount, ? as maxRetries,
              created_at as createdAt, last_attempt_at as lastAttemptAt,
              next_retry_at as nextRetryAt, error_message as error, priority
       FROM generation_tasks
       WHERE status IN ('pending', 'failed') AND retry_count < ?
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY CASE WHEN priority = 'critical' THEN 0 WHEN priority = 'normal' THEN 1 ELSE 2 END, created_at ASC`,
      [MAX_RETRIES, MAX_RETRIES, now],
    );
    return rows as QueuedRequest[];
  } catch (e) {
    errorLogger.warn(
      { code: "OFFLINE_QUEUE_GET_PENDING_FAILED", message: e instanceof Error ? e.message : String(e) },
      "OfflineQueue",
    );
    return [];
  }
}

export async function getPendingRequestsByPriority(): Promise<QueuedRequest[]> {
  const pending = await getPendingRequests();

  return pending.sort((a, b) => {
    const priorityA = priorityValue(a.priority ?? "normal");
    const priorityB = priorityValue(b.priority ?? "normal");
    if (priorityA !== priorityB) return priorityB - priorityA;
    return a.createdAt - b.createdAt;
  });
}

export async function markRequestProcessing(id: string): Promise<void> {
  try {
    await safeRun(
      `UPDATE generation_tasks SET status = 'processing', last_attempt_at = ? WHERE id = ?`,
      [Math.floor(Date.now() / 1000), id],
    );
  } catch (e) {
    errorLogger.warn(
      { code: "OFFLINE_QUEUE_MARK_PROCESSING_FAILED", message: e instanceof Error ? e.message : String(e) },
      "OfflineQueue",
    );
  }
}

export async function markRequestCompleted(id: string): Promise<void> {
  try {
    await safeRun(
      `UPDATE generation_tasks SET status = 'completed', completed_at = ? WHERE id = ?`,
      [Math.floor(Date.now() / 1000), id],
    );
  } catch (e) {
    errorLogger.warn(
      { code: "OFFLINE_QUEUE_MARK_COMPLETED_FAILED", message: e instanceof Error ? e.message : String(e) },
      "OfflineQueue",
    );
  }
}

export async function markRequestFailed(
  id: string,
  error: string,
): Promise<void> {
  try {
    await safeRun(
      `UPDATE generation_tasks SET status = 'failed', error_message = ?, retry_count = retry_count + 1 WHERE id = ?`,
      [error, id],
    );
  } catch (e) {
    errorLogger.warn(
      { code: "OFFLINE_QUEUE_MARK_FAILED_FAILED", message: e instanceof Error ? e.message : String(e) },
      "OfflineQueue",
    );
  }
}

export async function processPendingQueue(
  processor: (
    type: string,
    payload: Record<string, unknown>,
  ) => Promise<boolean>,
  concurrency = 3,
): Promise<number> {
  if (!isOnline()) return 0;

  const pending = await getPendingRequestsByPriority();
  let processed = 0;
  let index = 0;

  async function processNext(): Promise<void> {
    while (index < pending.length) {
      const request = pending[index++]!;
      if (request.nextRetryAt && Date.now() < request.nextRetryAt * 1000) continue;

      await markRequestProcessing(request.id);

      try {
        const payload = JSON.parse(request.payload);
        const success = await processor(request.type, payload);
        if (success) {
          await markRequestCompleted(request.id);
          processed++;
        } else {
          const retryCount = (request.retryCount || 0) + 1;
          const errorMessage = "Processor returned false";
          if (retryCount >= MAX_RETRY_COUNT) {
            await safeRun(
              "UPDATE generation_tasks SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?",
              [errorMessage, Math.floor(Date.now() / 1000), request.id],
            );
          } else {
            const nextRetryAt = Math.floor((Date.now() + calculateRetryDelay(retryCount)) / 1000);
            await safeRun(
              "UPDATE generation_tasks SET status = 'pending', retry_count = ?, next_retry_at = ?, error_message = ?, updated_at = ? WHERE id = ?",
              [retryCount, nextRetryAt, errorMessage, Math.floor(Date.now() / 1000), request.id],
            );
          }
        }
      } catch (error) {
        const retryCount = (request.retryCount || 0) + 1;
        const errorMessage = extractErrorMessage(error);
        if (retryCount >= MAX_RETRY_COUNT) {
          await safeRun(
            "UPDATE generation_tasks SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?",
            [errorMessage, Math.floor(Date.now() / 1000), request.id],
          );
        } else {
          const nextRetryAt = Math.floor((Date.now() + calculateRetryDelay(retryCount)) / 1000);
          await safeRun(
            "UPDATE generation_tasks SET status = 'pending', retry_count = ?, next_retry_at = ?, error_message = ?, updated_at = ? WHERE id = ?",
            [retryCount, nextRetryAt, errorMessage, Math.floor(Date.now() / 1000), request.id],
          );
        }
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, pending.length) },
    () => processNext(),
  );
  await Promise.all(workers);

  return processed;
}

export async function recoverIncompleteTasks(): Promise<number> {
  try {
    const staleThreshold = Math.floor(Date.now() / 1000) - 300;
    await safeRun(
      `UPDATE generation_tasks SET status = 'pending' WHERE status = 'processing' AND last_attempt_at < ?`,
      [staleThreshold],
    );

    const pendingCount = await safeQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM generation_tasks WHERE status IN ('pending', 'failed') AND retry_count < ?`,
      [MAX_RETRIES],
    );

    return pendingCount[0]?.count ?? 0;
  } catch (e) {
    errorLogger.warn(
      { code: "OFFLINE_QUEUE_RECOVER_FAILED", message: e instanceof Error ? e.message : String(e) },
      "OfflineQueue",
    );
    return 0;
  }
}

export async function cleanCompletedRequests(
  olderThanHours: number = 24,
): Promise<number> {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - olderThanHours * 3600;
    const countResult = await safeQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM generation_tasks WHERE status = 'completed' AND completed_at < ?`,
      [cutoff],
    );
    const count = countResult[0]?.count || 0;
    if (count > 0) {
      await safeRun(
        `DELETE FROM generation_tasks WHERE status = 'completed' AND completed_at < ?`,
        [cutoff],
      );
    }
    return count;
  } catch (e) {
    errorLogger.warn(
      { code: "OFFLINE_QUEUE_CLEAN_FAILED", message: e instanceof Error ? e.message : String(e) },
      "OfflineQueue",
    );
    return 0;
  }
}

export async function getQueueStats(): Promise<{ pending: number; generating: number; failed: number; total: number }> {
  try {
    const result = await safeQuery<{ status: string; count: number }>("SELECT status, COUNT(*) as count FROM generation_tasks GROUP BY status");
    const stats = { pending: 0, generating: 0, failed: 0, total: 0 };
    for (const row of result) {
      const count = Number(row.count);
      stats.total += count;
      if (row.status === "pending") stats.pending = count;
      else if (row.status === "generating") stats.generating = count;
      else if (row.status === "failed") stats.failed = count;
    }
    return stats;
  } catch (e) {
    errorLogger.warn("[OfflineQueue] 获取队列统计失败", e);
    return { pending: 0, generating: 0, failed: 0, total: 0 };
  }
}

export async function retryFailedTasks(): Promise<number> {
  try {
    const failed = await safeQuery<{ id: string; error_message: string | null }>(
      "SELECT id, error_message FROM generation_tasks WHERE status = 'failed'",
      [],
    );
    let retried = 0;
    for (const task of failed) {
      if (!isPermanentError(task.error_message)) {
        await safeRun(
          "UPDATE generation_tasks SET status = 'pending', retry_count = 0, error_message = NULL WHERE id = ?",
          [task.id],
        );
        retried++;
      }
    }
    return retried;
  } catch (e) {
    errorLogger.warn("[OfflineQueue] 重试失败任务出错", e);
    return 0;
  }
}
