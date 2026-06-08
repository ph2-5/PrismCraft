import type {
  SyncPushResult,
  SyncPullResult,
  RemoteChange,
  VectorClock,
} from "./types";
import { mergeVectorClocks } from "./types";
import { getPendingChanges, markChangesSynced, getSyncStatus } from "./changelog";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParse } from "@/shared/utils/safe-json";
import { fromAsyncThrowable } from "@/domain/types/result";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";

export async function pushChanges(
  deviceId: string,
  endpoint?: string,
  serverUrl?: string,
): Promise<SyncPushResult> {
  const pendingChanges = await getPendingChanges();

  if (pendingChanges.length === 0) {
    return { accepted: 0, conflicts: [], serverVectorClock: {} };
  }

  const hasServer = serverUrl || endpoint;
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
      conflicts: (proxyData.conflicts as SyncPushResult["conflicts"]) || [],
      serverVectorClock: (proxyData.serverVectorClock as VectorClock) || {},
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
