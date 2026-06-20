export type SyncStatus = "synced" | "pending" | "conflict";

export type SyncEntityType =
  | "character"
  | "scene"
  | "story"
  | "media_asset"
  | "storyboard_asset"
  | "video_task"
  | "story_version"
  | "collection"
  | "element"
  | "video_template"
  | "ast_template";

export type ChangeOperation = "insert" | "update" | "delete";

export interface VectorClock {
  [deviceId: string]: number;
}

export interface SyncChangeLogEntry {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: ChangeOperation;
  vectorClock: VectorClock;
  data: string | null;
  timestamp: number;
  synced: number;
  deviceId: string;
}

export interface SyncPushResult {
  accepted: number;
  conflicts: SyncConflict[];
  serverVectorClock: VectorClock;
  /** 已被服务端确认接受的变更 ID 列表，调用方需在整轮同步成功后统一 markChangesSynced */
  syncedIds: string[];
}

export interface SyncPullResult {
  changes: RemoteChange[];
  latestVectorClock: VectorClock;
  hasMore: boolean;
}

export interface RemoteChange {
  entityType: SyncEntityType;
  entityId: string;
  operation: ChangeOperation;
  vectorClock: VectorClock;
  data: Record<string, unknown> | null;
  timestamp: number;
  deviceId: string;
}

export interface SyncConflict {
  entityType: SyncEntityType;
  entityId: string;
  localVectorClock: VectorClock;
  remoteVectorClock: VectorClock;
  localData: Record<string, unknown> | null;
  remoteData: Record<string, unknown> | null;
  resolved: boolean;
  resolution: "local" | "remote" | "merge" | null;
}

export interface SyncStatusInfo {
  lastSyncAt: number | null;
  pendingChanges: number;
  conflicts: number;
  isSyncing: boolean;
  deviceId: string;
}

export type ConflictStrategy =
  | "last-write-wins"
  | "local-wins"
  | "remote-wins"
  | "manual";

export interface SyncConfig {
  enabled: boolean;
  autoSync: boolean;
  syncInterval: number;
  conflictStrategy: ConflictStrategy;
  endpoint: string;
  deviceId: string;
  deviceVectorClock?: VectorClock;
  server: SyncServerConfig | null;
}

export interface SyncServerConfig {
  url: string;
  connected: boolean;
  lastConnectedAt: number | null;
  serverVersion: string | null;
}

export interface SyncCredentials {
  username: string;
  token: string;
}

export interface SyncTestRequest {
  url: string;
  username: string;
  password: string;
}

export interface SyncTestResult {
  success: boolean;
  message: string;
  serverVersion?: string;
  token?: string;
  latency?: number;
}

export interface SyncAuthResult {
  success: boolean;
  token: string;
  userId: string;
  expiresIn?: number;
}

export interface SyncProxyRequest {
  action: "push" | "pull";
  changes?: unknown[];
  deviceId?: string;
  since?: number;
  page?: number;
}

export const SYNCABLE_TABLE_MAP: Record<SyncEntityType, string> = {
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

export const SYNC_TABLES: SyncEntityType[] = [
  "character",
  "scene",
  "story",
  "media_asset",
  "storyboard_asset",
  "video_task",
  "story_version",
  "collection",
  "element",
  "video_template",
  "ast_template",
];

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  autoSync: true,
  syncInterval: 30000,
  conflictStrategy: "last-write-wins",
  endpoint: "",
  deviceId: "",
  server: null,
};

export function createVectorClock(
  deviceId: string,
  counter: number = 1,
): VectorClock {
  return { [deviceId]: counter };
}

export function incrementVectorClock(
  clock: VectorClock,
  deviceId: string,
): VectorClock {
  return {
    ...clock,
    [deviceId]: (clock[deviceId] || 0) + 1,
  };
}

export function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const merged: VectorClock = { ...a };
  for (const [device, counter] of Object.entries(b)) {
    merged[device] = Math.max(merged[device] || 0, counter);
  }
  return merged;
}

export function compareVectorClocks(a: VectorClock, b: VectorClock): number {
  const allDevices = new Set([...Object.keys(a), ...Object.keys(b)]);
  let aGreater = false;
  let bGreater = false;

  for (const device of allDevices) {
    const aVal = a[device] || 0;
    const bVal = b[device] || 0;
    if (aVal > bVal) aGreater = true;
    if (bVal > aVal) bGreater = true;
  }

  if (aGreater && !bGreater) return 1;
  if (bGreater && !aGreater) return -1;
  return 0;
}

export function isVectorClockConflict(a: VectorClock, b: VectorClock): boolean {
  if (compareVectorClocks(a, b) !== 0) return false;
  const allDevices = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const d of allDevices) {
    if ((a[d] || 0) !== (b[d] || 0)) return true;
  }
  return false;
}
