export type {
  SyncStatus,
  SyncEntityType,
  ChangeOperation,
  SyncChangeLogEntry,
  SyncPushResult,
  SyncPullResult,
  RemoteChange,
  SyncConflict,
  SyncStatusInfo,
  ConflictStrategy,
  SyncConfig,
} from "./types";

export {
  SYNC_TABLES,
  SYNCABLE_TABLE_MAP,
  DEFAULT_SYNC_CONFIG,
} from "./types";

export {
  ensureSyncSchema,
  recordChange,
  getPendingChanges,
  markChangesSynced,
  softDelete,
  getSyncStatus,
  updateLastSyncTime,
  cleanupSyncedChanges,
  getDeviceId,
} from "./changelog";

export {
  initSyncEngine,
  destroySyncEngine,
  updateSyncConfig,
  startAutoSync,
  stopAutoSync,
  performSync,
  getSyncConfig,
} from "./engine";

export {
  getServerChangeLog,
  appendServerChanges,
  getServerVectorClock,
  saveServerVectorClock,
  clearServerSyncData,
} from "./server-store";
