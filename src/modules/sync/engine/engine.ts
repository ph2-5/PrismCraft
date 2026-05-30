import {
  type SyncConfig,
  type SyncConflict,
  type SyncEntityType,
  type ChangeOperation,
  type RemoteChange,
  type SyncPushResult,
  type SyncPullResult,
  type VectorClock,
  DEFAULT_SYNC_CONFIG,
  compareVectorClocks,
  mergeVectorClocks,
  isVectorClockConflict,
} from "./types";
import {
  getPendingChanges,
  markChangesSynced,
  updateLastSyncTime,
  ensureSyncSchema,
  getSyncStatus,
  cleanupSyncedChanges,
  getDeviceId,
  recordChange,
} from "./changelog";
import { container } from "@/infrastructure/di";
import { safeQuery, safeRun, safeTransaction } from "@/shared/db-core";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParse } from "@/shared/utils/safe-json";
import { fromAsyncThrowable } from "@/domain/types/result";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";

let syncConfig: SyncConfig = { ...DEFAULT_SYNC_CONFIG };
let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let syncPromise: Promise<void> | null = null;
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
    await syncPromise;
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
      const pushResult = await pushChanges();
      pushed = pushResult.accepted;
      conflicts = pushResult.conflicts.length;

      const manualConflicts: SyncConflict[] = [];
      for (const conflict of pushResult.conflicts) {
        if (syncConfig.conflictStrategy === "manual") {
          manualConflicts.push(conflict);
        } else {
          const resolveResult = await fromAsyncThrowable(() => resolveConflict(conflict));
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

      const pullResult = await pullChanges();
      pulled = pullResult.changes.length;

      await applyRemoteChanges(pullResult.changes);

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

async function pushChanges(): Promise<SyncPushResult> {
  const pendingChanges = await getPendingChanges();

  if (pendingChanges.length === 0) {
    return { accepted: 0, conflicts: [], serverVectorClock: {} };
  }

  const hasServer = syncConfig.server?.url || syncConfig.endpoint;
  if (!hasServer) {
    return { accepted: 0, conflicts: [], serverVectorClock: {} };
  }

  const result = await fromAsyncThrowable(async () => {
    const response = await fetch(
      `http://localhost:${API_SERVER_PORT}/api/sync/proxy`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...ELECTRON_APP_HEADERS,
        },
        body: JSON.stringify({
          action: "push",
          deviceId: syncConfig.deviceId,
          changes: pendingChanges.map((c) => ({
            entityType: c.entityType,
            entityId: c.entityId,
            operation: c.operation,
            vectorClock: c.vectorClock,
            data: c.data
              ? (() => {
                  return safeJsonParse(c.data, {});
                })()
              : null,
            timestamp: c.timestamp,
            deviceId: c.deviceId,
          })),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Push failed: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Push proxy failed");
    }

    const proxyData = (result.data as Record<string, unknown>) || {};

    const conflictIds = new Set(
      ((proxyData.conflicts || []) as { changeId?: string; entityId?: string }[]).map(
        (conf) => conf.changeId || conf.entityId,
      ),
    );
    const syncedIds = pendingChanges
      .filter((c) => !conflictIds.has(c.id) && !conflictIds.has(c.entityId))
      .map((c) => c.id);

    await markChangesSynced(syncedIds);

    return {
      accepted: (proxyData.accepted as number) || syncedIds.length,
      conflicts: (proxyData.conflicts as SyncConflict[]) || [],
      serverVectorClock: (proxyData.serverVectorClock as VectorClock) || {},
    };
  });

  if (!result.ok) {
    errorLogger.warn("[SyncEngine] Push 失败", result.error);
    throw result.error;
  }
  return result.value;
}

async function pullChanges(): Promise<SyncPullResult> {
  const hasServer = syncConfig.server?.url || syncConfig.endpoint;
  if (!hasServer) {
    return { changes: [], latestVectorClock: {}, hasMore: false };
  }

  const result = await fromAsyncThrowable(async () => {
    const status = await getSyncStatus();
    const lastSync = status.lastSyncAt || 0;

    const allChanges: RemoteChange[] = [];
    let hasMore = true;
    let page = 0;

    let latestVC: VectorClock = {};
    while (hasMore && page < 10) {
      const response = await fetch(
        `http://localhost:${API_SERVER_PORT}/api/sync/proxy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...ELECTRON_APP_HEADERS,
          },
          body: JSON.stringify({
            action: "pull",
            deviceId: syncConfig.deviceId,
            since: lastSync,
            page,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Pull proxy failed");
      }

      const proxyData = (result.data as SyncPullResult) || {
        changes: [],
        latestVectorClock: {},
        hasMore: false,
      };
      allChanges.push(...(proxyData.changes || []));
      if (proxyData.latestVectorClock) {
        latestVC = mergeVectorClocks(latestVC, proxyData.latestVectorClock);
      }
      hasMore = proxyData.hasMore || false;
      page++;
    }

    return {
      changes: allChanges,
      latestVectorClock: latestVC,
      hasMore: false,
    };
  });

  if (!result.ok) {
    errorLogger.warn("[SyncEngine] Pull 失败", result.error);
    throw result.error;
  }
  return result.value;
}

const TABLES_WITHOUT_UPDATED_AT = new Set(["video_tasks", "story_versions"]);
const HARD_DELETE_TABLES = new Set([
  "story_versions",
  "story_characters",
  "story_scenes",
  "story_beats",
  "story_elements",
  "elements",
  "media_assets",
  "video_tasks",
  "storyboard_assets",
  "collections",
  "video_cache",
]);

async function applyRemoteChanges(changes: RemoteChange[]): Promise<void> {
  const changesByEntity: Map<string, RemoteChange[]> = new Map();
  for (const change of changes) {
    if (change.deviceId === syncConfig.deviceId) continue;
    const key = `${change.entityType}:${change.entityId}`;
    const existing = changesByEntity.get(key) || [];
    existing.push(change);
    changesByEntity.set(key, existing);
  }

  const allStatements: { sql: string; params: unknown[] }[] = [];

  for (const [, entityChanges] of changesByEntity) {
    const change = entityChanges[entityChanges.length - 1];

    const tableName = getTableName(change.entityType);
    if (!tableName) continue;

    const pk = getPkColumn(tableName);

    const entityResult = await fromAsyncThrowable(async () => {
      const hasIsDeleted = !HARD_DELETE_TABLES.has(tableName);
      const selectCols = hasIsDeleted
        ? `SELECT vector_clock, is_deleted, sync_status FROM ${tableName} WHERE ${pk} = ?`
        : `SELECT vector_clock, sync_status FROM ${tableName} WHERE ${pk} = ?`;
      const readRows = await safeQuery(selectCols, [change.entityId]);

      const localRow = (readRows?.[0] || undefined) as {
        vector_clock: string;
        is_deleted?: number;
        sync_status: string;
      } | undefined;

      let localClock: VectorClock = {};
      try {
        const raw = localRow?.vector_clock;
        localClock = safeJsonParse(raw, {});
      } catch (e) {
        errorLogger.warn("[SyncEngine] vector_clock 解析失败", e);
        localClock = {};
      }

      if (change.operation === "delete") {
        if (HARD_DELETE_TABLES.has(tableName)) {
          allStatements.push({
            sql: `DELETE FROM ${tableName} WHERE ${pk} = ?`,
            params: [change.entityId],
          });
        } else {
          const updatedAtClause = TABLES_WITHOUT_UPDATED_AT.has(tableName)
            ? ""
            : ", updated_at = ?";
          const params = TABLES_WITHOUT_UPDATED_AT.has(tableName)
            ? [JSON.stringify(change.vectorClock), change.entityId]
            : [
                JSON.stringify(change.vectorClock),
                Math.floor(Date.now() / 1000),
                change.entityId,
              ];
          allStatements.push({
            sql: `UPDATE ${tableName} SET is_deleted = 1, vector_clock = ?, sync_status = 'synced'${updatedAtClause} WHERE ${pk} = ?`,
            params,
          });
        }
      } else if (
        change.operation === "insert" ||
        change.operation === "update"
      ) {
        const compareResult = compareVectorClocks(
          localClock,
          change.vectorClock,
        );

        if (!localRow) {
          if (change.data) {
            const columns = Object.keys(change.data).filter((k) =>
              /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k),
            );
            const values = columns.map((k) => change.data![k]);
            const placeholders = columns.map(() => "?").join(",");
            const updatedAtInsClause = TABLES_WITHOUT_UPDATED_AT.has(tableName)
              ? ""
              : ", updated_at";
            const updatedAtInsValue = TABLES_WITHOUT_UPDATED_AT.has(tableName)
              ? ""
              : ", strftime('%s', 'now')";
            const isDeletedInsClause = hasIsDeleted ? ", is_deleted" : "";
            const isDeletedInsValue = hasIsDeleted ? ", 0" : "";
            allStatements.push({
              sql: `INSERT OR REPLACE INTO ${tableName} (${pk}, ${columns.join(",")}, vector_clock, sync_status${isDeletedInsClause}${updatedAtInsClause})
               VALUES (?, ${placeholders}, ?, 'synced'${isDeletedInsValue}${updatedAtInsValue})`,
              params: [
                change.entityId,
                ...values,
                JSON.stringify(change.vectorClock),
              ],
            });
          }
        } else if (compareResult < 0) {
          if (change.data) {
            const safeColumns = Object.keys(change.data).filter((k) =>
              /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k),
            );
            const updatedAtUpdClause = TABLES_WITHOUT_UPDATED_AT.has(tableName)
              ? ""
              : ", updated_at = strftime('%s', 'now')";
            const isDeletedUpdClause = hasIsDeleted ? ", is_deleted = 0" : "";
            const setClauses = safeColumns.map((k) => `${k} = ?`).join(", ");
            const values = safeColumns.map((k) => change.data![k]);
            allStatements.push({
              sql: `UPDATE ${tableName} SET ${setClauses}, vector_clock = ?, sync_status = 'synced'${isDeletedUpdClause}${updatedAtUpdClause} WHERE ${pk} = ?`,
              params: [
                ...values,
                JSON.stringify(change.vectorClock),
                change.entityId,
              ],
            });
          }
        } else if (
          compareResult === 0 &&
          isVectorClockConflict(localClock, change.vectorClock)
        ) {
          allStatements.push({
            sql: `UPDATE ${tableName} SET sync_status = 'conflict' WHERE ${pk} = ?`,
            params: [change.entityId],
          });
        }
      }
    });

    if (!entityResult.ok) {
      errorLogger.warn(
        `[SyncEngine] 处理远程变更失败 (${change.entityType}/${change.entityId})`,
        entityResult.error,
      );
    }
  }

  if (allStatements.length > 0) {
    const batchResult = await fromAsyncThrowable(async () => {
      await safeTransaction(allStatements);
    });
    if (!batchResult.ok) {
      errorLogger.warn("[SyncEngine] 批量应用远程变更失败", batchResult.error);
    }
  }
}

async function resolveConflict(conflict: SyncConflict): Promise<void> {
  const strategy = syncConfig.conflictStrategy;

  switch (strategy) {
    case "local-wins": {
      const tableName = getTableName(conflict.entityType);
      if (tableName) {
        const pk = getPkColumn(tableName);
        await safeRun(
          `UPDATE ${tableName} SET sync_status = 'pending' WHERE ${pk} = ?`,
          [conflict.entityId],
        );
      }
      break;
    }
    case "remote-wins": {
      const tableName = getTableName(conflict.entityType);
      if (tableName && conflict.remoteData) {
        const pk = getPkColumn(tableName);
        const columns = Object.keys(conflict.remoteData).filter((k) =>
          /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k),
        );
        const setClauses = columns.map((k) => `${k} = ?`).join(", ");
        const values = columns.map(
          (k) => (conflict.remoteData as Record<string, unknown>)[k],
        );

        const backupResult = await fromAsyncThrowable(async () => {
          const localBackup = await safeQuery(
            `SELECT * FROM ${tableName} WHERE ${pk} = ?`,
            [conflict.entityId],
          );
          if (localBackup && localBackup.length > 0) {
            const backupData = JSON.stringify(localBackup[0]);
            const backupId = `${conflict.entityId}_conflict_${Date.now()}`;
            await safeRun(
              `INSERT INTO sync_conflict_backup (id, entity_type, entity_id, local_data, remote_data, resolved_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [backupId, conflict.entityType, conflict.entityId, backupData, JSON.stringify(conflict.remoteData), Date.now()],
            );
          }
        });
        if (!backupResult.ok) {
          errorLogger.warn("[SyncEngine] Failed to backup local data", backupResult.error);
        }

        await safeRun(
          `UPDATE ${tableName} SET ${setClauses}, vector_clock = ?, sync_status = 'synced' WHERE ${pk} = ?`,
          [
            ...values,
            JSON.stringify(conflict.remoteVectorClock),
            conflict.entityId,
          ],
        );
      }
      break;
    }
    case "last-write-wins": {
      const tableName = getTableName(conflict.entityType);
      if (!tableName) break;
      const pk = getPkColumn(tableName);
      const localData: Record<string, unknown> = conflict.localData || {};
      const remoteData: Record<string, unknown> = conflict.remoteData || {};
      const localTime = (localData.updated_at as number) || 0;
      const remoteTime = (remoteData.updated_at as number) || 0;

      if (remoteTime >= localTime && remoteData) {
        const backupResult = await fromAsyncThrowable(async () => {
          const localBackup = await safeRun(
            `SELECT * FROM ${tableName} WHERE ${pk} = ?`,
            [conflict.entityId],
          );
          const backupArray = localBackup as Array<Record<string, unknown>> | undefined;
          if (backupArray && backupArray.length > 0) {
            const backupData = JSON.stringify(backupArray[0]);
            const backupId = `${conflict.entityId}_conflict_${Date.now()}`;
            await safeRun(
              `INSERT INTO sync_conflict_backup (id, entity_type, entity_id, local_data, remote_data, resolved_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [backupId, conflict.entityType, conflict.entityId, backupData, JSON.stringify(remoteData), Date.now()],
            );
          }
        });
        if (!backupResult.ok) {
          errorLogger.warn("[SyncEngine] Failed to backup local data", backupResult.error);
        }

        const columns = Object.keys(remoteData).filter((k) =>
          /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k),
        );
        const setClauses = columns.map((k) => `${k} = ?`).join(", ");
        const values = columns.map((k) => remoteData[k]);
        await safeRun(
          `UPDATE ${tableName} SET ${setClauses}, vector_clock = ?, sync_status = 'synced' WHERE ${pk} = ?`,
          [
            ...values,
            JSON.stringify(conflict.remoteVectorClock),
            conflict.entityId,
          ],
        );
      }
      break;
    }
    case "manual":
      await markConflict(conflict.entityType, conflict.entityId);
      break;
  }
}

async function markConflict(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  const tableName = getTableName(entityType);
  if (!tableName) return;

  const pk = getPkColumn(tableName);
  await safeRun(
    `UPDATE ${tableName} SET sync_status = 'conflict' WHERE ${pk} = ?`,
    [entityId],
  );
}

function getTableName(entityType: SyncEntityType): string | null {
  const map: Record<SyncEntityType, string> = {
    character: "characters",
    scene: "scenes",
    story: "stories",
    media_asset: "media_assets",
    storyboard_asset: "storyboard_assets",
    video_task: "video_tasks",
    story_version: "story_versions",
    collection: "collections",
    element: "elements",
    video_template: "video_templates",
    ast_template: "ast_templates",
  };
  return map[entityType] || null;
}

const TABLE_PK_MAP: Record<string, string> = {
  characters: "id",
  scenes: "id",
  stories: "id",
  media_assets: "id",
  storyboard_assets: "id",
  video_tasks: "task_id",
  collections: "id",
  story_versions: "id",
};

function getPkColumn(tableName: string): string {
  return TABLE_PK_MAP[tableName] || "id";
}

export function getSyncConfig(): SyncConfig {
  return { ...syncConfig };
}

export { getSyncStatus, ensureSyncSchema };
