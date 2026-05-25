export type {
  SyncStatus,
  SyncEntityType,
  ChangeOperation,
  VectorClock,
  SyncChangeLogEntry,
  SyncPushResult,
  SyncPullResult,
  RemoteChange,
  SyncConflict,
  SyncStatusInfo,
  ConflictStrategy,
  SyncConfig,
} from "@/domain/types/sync";

export {
  SYNC_TABLES,
  DEFAULT_SYNC_CONFIG,
  createVectorClock,
  incrementVectorClock,
  mergeVectorClocks,
  compareVectorClocks,
  isVectorClockConflict,
} from "@/domain/types/sync";

export { SYNCABLE_TABLE_MAP } from "@/domain/types/sync";
