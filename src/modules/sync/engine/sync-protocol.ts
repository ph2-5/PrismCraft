import type {
  SyncPushResult,
  SyncPullResult,
  RemoteChange,
  VectorClock,
} from "./types";
import { mergeVectorClocks } from "./types";
import { getPendingChanges, getSyncStatus } from "./changelog";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParse } from "@/shared/utils/safe-json";
import { fromAsyncThrowable } from "@/domain/types/result";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isVectorClock(data: unknown): data is VectorClock {
  if (!isRecord(data)) return false;
  for (const value of Object.values(data)) {
    if (!isNumber(value)) return false;
  }
  return true;
}

interface ConflictIdEntry {
  changeId?: string;
  entityId?: string;
}

function isConflictIdEntry(data: unknown): data is ConflictIdEntry {
  if (!isRecord(data)) return false;
  if (data.changeId !== undefined && !isString(data.changeId)) return false;
  if (data.entityId !== undefined && !isString(data.entityId)) return false;
  return true;
}

function asConflictIdList(data: unknown): ConflictIdEntry[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isConflictIdEntry);
}

function asConflictArray(data: unknown): SyncPushResult["conflicts"] {
  return Array.isArray(data) ? (data as SyncPushResult["conflicts"]) : [];
}

function asVectorClock(data: unknown): VectorClock {
  return isVectorClock(data) ? data : {};
}

interface PushProxyData {
  accepted?: number;
  conflicts?: unknown;
  serverVectorClock?: unknown;
}

function asPushProxyData(data: unknown): PushProxyData {
  if (!isRecord(data)) return {};
  const obj: PushProxyData = {};
  if (isNumber(data.accepted)) obj.accepted = data.accepted;
  if (data.conflicts !== undefined) obj.conflicts = data.conflicts;
  if (data.serverVectorClock !== undefined) obj.serverVectorClock = data.serverVectorClock;
  return obj;
}

interface PullProxyData {
  changes: RemoteChange[];
  latestVectorClock: VectorClock;
  hasMore: boolean;
}

function asPullProxyData(data: unknown): PullProxyData {
  if (!isRecord(data)) {
    return { changes: [], latestVectorClock: {}, hasMore: false };
  }
  const changes = Array.isArray(data.changes) ? (data.changes as RemoteChange[]) : [];
  return {
    changes,
    latestVectorClock: asVectorClock(data.latestVectorClock),
    hasMore: typeof data.hasMore === "boolean" ? data.hasMore : false,
  };
}

export async function pushChanges(
  deviceId: string,
  endpoint?: string,
  serverUrl?: string,
): Promise<SyncPushResult> {
  const pendingChanges = await getPendingChanges();

  if (pendingChanges.length === 0) {
    return { accepted: 0, conflicts: [], serverVectorClock: {}, syncedIds: [] };
  }

  const hasServer = serverUrl || endpoint;
  if (!hasServer) {
    return { accepted: 0, conflicts: [], serverVectorClock: {}, syncedIds: [] };
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
          deviceId,
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

    const proxyData = asPushProxyData(result.data);

    const conflictIds = new Set(
      asConflictIdList(proxyData.conflicts).map(
        (conf) => conf.changeId || conf.entityId,
      ),
    );
    const syncedIds = pendingChanges
      .filter((c) => !conflictIds.has(c.id) && !conflictIds.has(c.entityId))
      .map((c) => c.id);

    // 不在此处调用 markChangesSynced：交由 performSync 在 push+pull+apply 全部成功后统一标记，
    // 避免 push 成功但 pull/apply 失败时本地变更被提前标记为已同步导致数据丢失。

    return {
      accepted: proxyData.accepted ?? syncedIds.length,
      conflicts: asConflictArray(proxyData.conflicts),
      serverVectorClock: asVectorClock(proxyData.serverVectorClock),
      syncedIds,
    };
  });

  if (!result.ok) {
    errorLogger.warn("[SyncEngine] Push 失败", result.error);
    throw result.error;
  }
  return result.value;
}

export async function pullChanges(
  deviceId: string,
  endpoint?: string,
  serverUrl?: string,
): Promise<SyncPullResult> {
  const hasServer = serverUrl || endpoint;
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
            deviceId,
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

      const proxyData = asPullProxyData(result.data);
      allChanges.push(...proxyData.changes);
      if (proxyData.latestVectorClock) {
        latestVC = mergeVectorClocks(latestVC, proxyData.latestVectorClock);
      }
      hasMore = proxyData.hasMore;
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
