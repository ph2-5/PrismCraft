export { initSyncEngine, performSync, getSyncStatus, updateSyncConfig, getSyncConfig, setConflictCallback } from "./engine/engine";
export { recordChange } from "./engine/changelog";
export type {
  SyncEntityType,
  ChangeOperation,
  SyncChangeLogEntry,
  VectorClock,
  SyncStatus,
} from "./engine/types";
export { SyncConflictPanel } from "./presentation/SyncConflictPanel";
export { SyncSettingsPanel } from "./presentation/SyncSettingsPanel";
export { SyncStatusIndicator } from "./presentation/SyncStatusIndicator";
export {
  compareVectorClocks,
  mergeVectorClocks,
  createVectorClock,
  incrementVectorClock,
  isVectorClockConflict,
  DEFAULT_SYNC_CONFIG,
} from "./engine/types";
export type { SyncConflict, ConflictStrategy, SyncConfig, SyncStatusInfo, SyncPushResult, SyncPullResult, RemoteChange } from "./engine/types";
