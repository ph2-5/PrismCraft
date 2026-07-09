import type { VideoTask } from "@/domain/schemas";
import { container } from "@/infrastructure/di";
import { cleanExpiredTasks } from "@/modules/video/recovery";
import { cleanExpiredVideoCache } from "@/modules/video/cache";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t, HOUR_MS } from "@/shared/constants";
import { pollingState } from "./polling-engine";

const SYNC_DEBOUNCE_MS = 2000;
/** 任务过期时间（720 小时 = 30 天），用于计算 expiresAt */
const TASK_EXPIRY_MS = 720 * HOUR_MS;

interface SyncStoreAccessor {
  getState: () => { allTasks: VideoTask[] };
}

let _syncStore: SyncStoreAccessor | null = null;

export function registerSyncStore(store: SyncStoreAccessor) {
  _syncStore = store;
}

/**
 * P1-6 修复：跨窗口任务变更通知。
 *
 * 之前多窗口场景下，窗口 A 创建/更新任务后写入 SQLite，
 * 但窗口 B 的 Zustand 内存 store 无感知，仍显示旧状态。
 *
 * 使用 BroadcastChannel 在任务持久化后通知其他窗口重新加载。
 * 窗口 B 收到通知后从 SQLite 重新 loadTasksFromStorage，实现准实时同步。
 */
const CROSS_WINDOW_CHANNEL = "video-task-sync";
let _broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (_broadcastChannel) return _broadcastChannel;
  try {
    _broadcastChannel = new BroadcastChannel(CROSS_WINDOW_CHANNEL);
  } catch {
    // BroadcastChannel 不支持时静默降级（如旧版浏览器）
    return null;
  }
  return _broadcastChannel;
}

/**
 * 启动跨窗口监听。在任务初始化时调用一次。
 * 收到其他窗口的任务变更通知后，从 SQLite 重新加载任务到内存 store。
 */
export function startCrossWindowSync(onRemoteUpdate: () => void): void {
  const channel = getBroadcastChannel();
  if (!channel) return;
  channel.onmessage = () => {
    // 其他窗口的任务已变更，触发重新加载
    onRemoteUpdate();
  };
}

/** 通知其他窗口任务已变更 */
function notifyOtherWindows(): void {
  const channel = getBroadcastChannel();
  if (!channel) return;
  try {
    channel.postMessage({ type: "tasks-updated", timestamp: Date.now() });
  } catch (e) {
    errorLogger.warn("[VideoTaskSync] 跨窗口通知失败", e);
  }
}

/**
 * P2-2 修复：同步失败重试计数与指数退避参数。
 *
 * 之前同步失败后仅 log 错误，瞬态 DB 错误（如数据库锁竞争、I/O 超时）
 * 导致内存状态与持久化状态永久偏离，后续无新任务更新时不会再次尝试同步。
 *
 * 现在：非配额错误时以指数退避自动重试（2s → 4s → 8s），最多 3 次。
 * 成功或新的 scheduleSync 调用时重置计数。
 */
let syncRetryCount = 0;
const MAX_SYNC_RETRIES = 3;
const SYNC_RETRY_BASE_MS = 2000;

async function performSync(): Promise<void> {
  if (pollingState.isSyncing) return;
  pollingState.isSyncing = true;
  try {
    if (!_syncStore) return;
    const state = _syncStore.getState();
    const bulkData: Partial<VideoTask>[] = state.allTasks.map((task) => ({
      taskId: task.taskId,
      status: task.status,
      progress: task.progress,
      videoUrl: task.videoUrl,
      message: task.message,
      createdAt: task.createdAt,
      model: task.model,
      prompt: task.prompt,
      parameters: task.parameters,
      expiresAt: task.createdAt
        ? new Date(new Date(task.createdAt).getTime() + TASK_EXPIRY_MS).toISOString()
        : new Date(Date.now() + TASK_EXPIRY_MS).toISOString(),
      lastPolledAt: new Date().toISOString(),
      apiUrl: task.apiUrl,
      apiEndpoint: task.apiEndpoint,
      providerId: task.providerId,
      providerModelId: task.providerModelId,
      providerFormat: task.providerFormat,
      fixedImageUrl: task.fixedImageUrl,
      fixedImageLockType: task.fixedImageLockType,
      storyId: task.storyId,
      beatId: task.beatId,
    }));
    await container.videoTaskStorage.bulkPutVideoTasks(bulkData);
    // P1-6 修复：持久化成功后通知其他窗口重新加载
    notifyOtherWindows();
    // P2-2 修复：成功时重置重试计数
    syncRetryCount = 0;
  } catch (error) {
    errorLogger.error("Failed to sync video tasks", error);
    if (typeof window !== "undefined" && error instanceof Error) {
      if (error.name === "QuotaExceededError" || error.message.includes("quota")) {
        errorLogger.warn("[VideoTaskManager] 数据库配额不足，尝试清理旧数据");
        try {
          const cleanedTasksResult = await cleanExpiredTasks();
          const cleanedCache = await cleanExpiredVideoCache();
          errorLogger.info(
            `[VideoTaskManager] 已清理 ${cleanedTasksResult.ok ? cleanedTasksResult.value : 0} 个过期任务和 ${cleanedCache.ok ? cleanedCache.value : 0} 个过期缓存`,
          );
        } catch (cleanError) {
          errorLogger.error("[VideoTaskManager] 清理过期数据失败，数据库空间不足", cleanError);
        }
        emitToast("error", t("error.storageFull"), t("error.storageFullDesc"));
      } else if (syncRetryCount < MAX_SYNC_RETRIES) {
        // P2-2 修复：非配额错误时指数退避重试（不经过 scheduleSync 以避免重置计数）
        syncRetryCount += 1;
        const retryDelay = SYNC_RETRY_BASE_MS * Math.pow(2, syncRetryCount - 1);
        errorLogger.warn(
          `[VideoTaskSync] 同步失败，${retryDelay}ms 后重试 (${syncRetryCount}/${MAX_SYNC_RETRIES})`,
        );
        pollingState.syncTimeoutId = setTimeout(() => {
          void performSync();
        }, retryDelay);
      } else {
        errorLogger.error(
          `[VideoTaskSync] 同步重试已达上限 ${MAX_SYNC_RETRIES}，放弃重试，等待下次 scheduleSync 触发`,
        );
        syncRetryCount = 0;
      }
    }
  } finally {
    pollingState.isSyncing = false;
  }
}

export function scheduleSync() {
  if (pollingState.syncTimeoutId) {
    clearTimeout(pollingState.syncTimeoutId);
  }
  // P2-2 修复：新的外部同步请求，重置重试计数
  syncRetryCount = 0;
  pollingState.syncTimeoutId = setTimeout(() => {
    void performSync();
  }, SYNC_DEBOUNCE_MS);
}
