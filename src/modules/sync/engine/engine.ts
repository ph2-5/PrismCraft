import {
  type SyncConfig,
  type SyncConflict,
  type SyncEntityType,
  type ChangeOperation,
  DEFAULT_SYNC_CONFIG,
  mergeVectorClocks,
} from "./types";
import {
  updateLastSyncTime,
  ensureSyncSchema,
  getSyncStatus,
  cleanupSyncedChanges,
  getDeviceId,
  recordChange,
} from "./changelog";
import { pushChanges, pullChanges } from "./sync-protocol";
import { resolveConflict } from "./conflict-resolution";
import { applyRemoteChanges } from "./remote-changes";
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import { fromAsyncThrowable } from "@/domain/types/result";

let syncConfig: SyncConfig = { ...DEFAULT_SYNC_CONFIG };
let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let syncPromise: Promise<void> | null = null;
let needsResync = false;
let conflictCallback: ((conflicts: SyncConflict[]) => void) | null = null;
let changeTrackerRegistered = false;

if (typeof window !== "undefined") {
  const win = window as unknown as Record<string, unknown>;
  const prev = win.__SYNC_ENGINE_STATE__;
  if (prev && typeof prev === "object") {
    const prevState = prev as { syncTimer: ReturnType<typeof setInterval> | null };
    if (prevState.syncTimer) clearInterval(prevState.syncTimer);
  }
  win.__SYNC_ENGINE_STATE__ = {
    get syncTimer() { return syncTimer; },
  };
}

export function setConflictCallback(
  callback: ((conflicts: SyncConflict[]) => void) | null,
): void {
  conflictCallback = callback;
}

function registerChangeTrackerOnce(): void {
  if (changeTrackerRegistered) return;
  changeTrackerRegistered = true;
  container.syncStorage.registerChangeTracker(async (entityType, entityId, operation) => {
    await recordChange(entityType as SyncEntityType, entityId, operation as ChangeOperation);
  });
}

export async function initSyncEngine(
  config?: Partial<SyncConfig>,
): Promise<void> {
  syncConfig = { ...DEFAULT_SYNC_CONFIG, ...config };

  if (!syncConfig.deviceId) {
    syncConfig.deviceId = getDeviceId();
  }

  if (syncConfig.enabled) {
    registerChangeTrackerOnce();
  }

  await ensureSyncSchema();

  if (syncConfig.enabled && syncConfig.autoSync) {
    startAutoSync();
  }
}

export function updateSyncConfig(config: Partial<SyncConfig>): void {
  const wasEnabled = syncConfig.enabled;
  syncConfig = { ...syncConfig, ...config };

  if (syncConfig.enabled && !wasEnabled) {
    registerChangeTrackerOnce();
  }

  if (syncConfig.enabled && syncConfig.autoSync) {
    startAutoSync();
  } else {
    stopAutoSync();
  }
}

export function startAutoSync(): void {
  stopAutoSync();
  if (typeof window === "undefined") return;

  syncTimer = setInterval(async () => {
    if (!isSyncing && navigator.onLine) {
      await performSync();
    }
  }, syncConfig.syncInterval);
}

export function stopAutoSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

let lastSyncResult: { pushed: number; pulled: number; conflicts: number } = {
  pushed: 0,
  pulled: 0,
  conflicts: 0,
};

export async function performSync(): Promise<{
  pushed: number;
  pulled: number;
  conflicts: number;
}> {
  if (syncPromise) {
    needsResync = true;
    await syncPromise;
    if (needsResync) {
      needsResync = false;
      return performSync();
    }
    return { ...lastSyncResult };
  }
  if (!syncConfig.enabled || !syncConfig.endpoint) {
    return { pushed: 0, pulled: 0, conflicts: 0 };
  }

  let pushed = 0;
  let pulled = 0;
  let conflicts = 0;

  syncPromise = (async () => {
    isSyncing = true;
    const syncResult = await fromAsyncThrowable(async () => {
      const pushResult = await pushChanges(
        syncConfig.deviceId,
        syncConfig.endpoint,
        syncConfig.server?.url,
      );
      pushed = pushResult.accepted;
      conflicts = pushResult.conflicts.length;

      const manualConflicts: SyncConflict[] = [];
      for (const conflict of pushResult.conflicts) {
        if (syncConfig.conflictStrategy === "manual") {
          manualConflicts.push(conflict);
        } else {
          const resolveResult = await fromAsyncThrowable(() => resolveConflict(conflict, syncConfig.conflictStrategy));
          if (!resolveResult.ok) {
            errorLogger.warn(
              `[SyncEngine] resolveConflict failed for ${conflict.entityType}:${conflict.entityId}`,
              resolveResult.error,
            );
          }
        }
      }

      if (manualConflicts.length > 0 && conflictCallback) {
        conflictCallback(manualConflicts);
      }

      const pullResult = await pullChanges(
        syncConfig.deviceId,
        syncConfig.endpoint,
        syncConfig.server?.url,
      );
      pulled = pullResult.changes.length;

      await applyRemoteChanges(pullResult.changes, syncConfig.deviceId);

      if (pushResult.serverVectorClock) {
        syncConfig.deviceVectorClock = mergeVectorClocks(
          syncConfig.deviceVectorClock || {},
          pushResult.serverVectorClock,
        );
      }
      if (pullResult.latestVectorClock) {
        syncConfig.deviceVectorClock = mergeVectorClocks(
          syncConfig.deviceVectorClock || {},
          pullResult.latestVectorClock,
        );
      }

      updateLastSyncTime();
      cleanupSyncedChanges();
    });

    if (!syncResult.ok) {
      errorLogger.warn("[SyncEngine] 同步失败", syncResult.error);
    }
    isSyncing = false;
    lastSyncResult = { pushed, pulled, conflicts };
  })();

  await syncPromise;
  syncPromise = null;
  return { pushed, pulled, conflicts };
}

export function getSyncConfig(): SyncConfig {
  return { ...syncConfig };
}

export { getSyncStatus, ensureSyncSchema };
