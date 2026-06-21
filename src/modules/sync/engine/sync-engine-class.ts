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
  cleanupSyncedChanges,
  markChangesSynced,
  getDeviceId,
  recordChange,
} from "./changelog";
import { pushChanges, pullChanges } from "./sync-protocol";
import { resolveConflict } from "./conflict-resolution";
import { applyRemoteChanges } from "./remote-changes";
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import { fromAsyncThrowable } from "@/domain/types/result";

export type SyncResult = {
  pushed: number;
  pulled: number;
  conflicts: number;
  failed?: boolean;
};

export class SyncEngine {
  private config: SyncConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;
  private syncPromise: Promise<void> | null = null;
  private needsResync = false;
  private resyncCount = 0;
  private readonly MAX_RESYNC_RETRIES = 5;
  private conflictCallback: ((conflicts: SyncConflict[]) => void) | null = null;
  private changeTrackerRegistered = false;
  private lastSyncResult: SyncResult = { pushed: 0, pulled: 0, conflicts: 0 };

  constructor(config?: Partial<SyncConfig>) {
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
  }

  async init(config?: Partial<SyncConfig>): Promise<void> {
    if (config) {
      this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
    }

    if (!this.config.deviceId) {
      this.config.deviceId = await getDeviceId();
    }

    if (this.config.enabled) {
      this.registerChangeTrackerOnce();
    }

    await ensureSyncSchema();

    if (this.config.enabled && this.config.autoSync) {
      this.startAutoSync();
    }
  }

  setConflictCallback(callback: ((conflicts: SyncConflict[]) => void) | null): void {
    this.conflictCallback = callback;
  }

  updateConfig(config: Partial<SyncConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    if (this.config.enabled && !wasEnabled) {
      this.registerChangeTrackerOnce();
    }

    if (this.config.enabled && this.config.autoSync) {
      this.startAutoSync();
    } else {
      this.stopAutoSync();
    }
  }

  startAutoSync(): void {
    this.stopAutoSync();
    if (typeof window === "undefined") return;

    this.timer = setInterval(async () => {
      if (!this.syncing && navigator.onLine) {
        await this.performSync();
      }
    }, this.config.syncInterval);
  }

  stopAutoSync(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async performSync(): Promise<SyncResult> {
    if (this.syncPromise) {
      this.needsResync = true;
      await this.syncPromise;
      if (this.needsResync) {
        this.needsResync = false;
        // 限制最大重试次数，防止无限递归
        if (this.resyncCount >= this.MAX_RESYNC_RETRIES) {
          this.resyncCount = 0;
          errorLogger.warn(`[SyncEngine] 达到最大重试次数 ${this.MAX_RESYNC_RETRIES}，停止重试`);
          return { ...this.lastSyncResult };
        }
        this.resyncCount++;
        return this.performSync();
      }
      this.resyncCount = 0;
      return { ...this.lastSyncResult };
    }
    this.resyncCount = 0;
    if (!this.config.enabled || !this.config.endpoint) {
      return { pushed: 0, pulled: 0, conflicts: 0 };
    }

    let pushed = 0;
    let pulled = 0;
    let conflicts = 0;
    let syncFailed = false;

    this.syncPromise = (async () => {
      this.syncing = true;
      const syncResult = await fromAsyncThrowable(async () => {
        const pushResult = await pushChanges(
          this.config.deviceId,
          this.config.endpoint,
          this.config.server?.url,
        );
        pushed = pushResult.accepted;
        conflicts = pushResult.conflicts.length;

        const manualConflicts: SyncConflict[] = [];
        for (const conflict of pushResult.conflicts) {
          if (this.config.conflictStrategy === "manual") {
            manualConflicts.push(conflict);
          } else {
            const resolveResult = await fromAsyncThrowable(() => resolveConflict(conflict, this.config.conflictStrategy));
            if (!resolveResult.ok) {
              errorLogger.warn(
                `[SyncEngine] resolveConflict failed for ${conflict.entityType}:${conflict.entityId}`,
                resolveResult.error,
              );
            }
          }
        }

        if (manualConflicts.length > 0 && this.conflictCallback) {
          this.conflictCallback(manualConflicts);
        }

        const pullResult = await pullChanges(
          this.config.deviceId,
          this.config.endpoint,
          this.config.server?.url,
        );
        pulled = pullResult.changes.length;

        await applyRemoteChanges(pullResult.changes, this.config.deviceId);

        // push + pull + apply 全部成功后，才统一标记本地变更为已同步。
        // 若 pull/apply 失败会抛出异常跳过此处，下次同步会重新 push（服务端基于 vector clock 幂等去重）。
        if (pushResult.syncedIds.length > 0) {
          await markChangesSynced(pushResult.syncedIds);
        }

        if (pushResult.serverVectorClock) {
          this.config.deviceVectorClock = mergeVectorClocks(
            this.config.deviceVectorClock || {},
            pushResult.serverVectorClock,
          );
        }
        if (pullResult.latestVectorClock) {
          this.config.deviceVectorClock = mergeVectorClocks(
            this.config.deviceVectorClock || {},
            pullResult.latestVectorClock,
          );
        }

        updateLastSyncTime();
        cleanupSyncedChanges();
      });

      if (!syncResult.ok) {
        syncFailed = true;
        errorLogger.warn("[SyncEngine] 同步失败", syncResult.error);
      }
      this.syncing = false;
      // 同步失败时返回 0 计数和 failed 标志，避免上层误判部分成功
      this.lastSyncResult = syncFailed
        ? { pushed: 0, pulled: 0, conflicts: 0, failed: true }
        : { pushed, pulled, conflicts };
    })();

    await this.syncPromise;
    this.syncPromise = null;
    return syncFailed
      ? { pushed: 0, pulled: 0, conflicts: 0, failed: true }
      : { pushed, pulled, conflicts };
  }

  getConfig(): SyncConfig {
    return { ...this.config };
  }

  destroy(): void {
    this.stopAutoSync();
    this.conflictCallback = null;
    if (this.changeTrackerRegistered) {
      container.syncStorage.unregisterChangeTracker();
      this.changeTrackerRegistered = false;
    }
    this.syncPromise = null;
    this.syncing = false;
    this.needsResync = false;
  }

  get isSyncing(): boolean {
    return this.syncing;
  }

  get currentConfig(): SyncConfig {
    return { ...this.config };
  }

  private registerChangeTrackerOnce(): void {
    if (this.changeTrackerRegistered) return;
    this.changeTrackerRegistered = true;
    container.syncStorage.registerChangeTracker(async (entityType, entityId, operation) => {
      await recordChange(entityType as SyncEntityType, entityId, operation as ChangeOperation);
    });
  }
}
