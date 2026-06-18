import { safeQuery, safeRun, safeTransaction } from "@/shared/db-core";
import type {
  SyncChangeLogEntry,
  SyncEntityType,
  ChangeOperation,
  SyncStatusInfo,
  VectorClock,
} from "./types";
import { incrementVectorClock } from "./types";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParse } from "@/shared/utils/safe-json";
import { isElectron } from "@/shared/utils/platform";
import { sanitizeIdentifier } from "@/shared/sql-safety";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";

const DEVICE_ID_STORAGE_KEY = "sync_device_id";

// HTTP 配置存储（统一通信层），失败回退到 IPC
let _httpAvailable: boolean | null = null;
let _cachedDeviceId: string | null = null;

async function httpConfigGet(key: string): Promise<unknown | null> {
  if (typeof window === "undefined" || typeof fetch !== "function") return null;
  if (_httpAvailable === null) {
    try {
      const probe = await fetch(`http://localhost:${API_SERVER_PORT}/api/health`, {
        method: "GET",
        headers: ELECTRON_APP_HEADERS,
        signal: AbortSignal.timeout(1000),
      });
      _httpAvailable = probe.ok;
    } catch {
      _httpAvailable = false;
    }
  }
  if (!_httpAvailable) return null;
  try {
    const response = await fetch(`http://localhost:${API_SERVER_PORT}/api/config/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ELECTRON_APP_HEADERS },
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const result = await response.json() as { success: boolean; data?: { value: unknown } };
    if (!result.success) return null;
    return result.data?.value ?? null;
  } catch (e) {
    _httpAvailable = false;
    errorLogger.debug("[SyncChangelog] HTTP config/get 失败，回退到 IPC", e);
    return null;
  }
}

async function httpConfigSet(key: string, value: unknown): Promise<boolean> {
  if (!_httpAvailable) return false;
  try {
    const response = await fetch(`http://localhost:${API_SERVER_PORT}/api/config/set`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ELECTRON_APP_HEADERS },
      body: JSON.stringify({ key, value }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const result = await response.json() as { success: boolean };
    return result.success;
  } catch (e) {
    _httpAvailable = false;
    errorLogger.debug("[SyncChangelog] HTTP config/set 失败，回退到 IPC", e);
    return false;
  }
}

async function getDeviceId(): Promise<string> {
  // 内存缓存优先
  if (_cachedDeviceId) return _cachedDeviceId;

  try {
    let deviceId: string | null = null;
    try {
      deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    } catch (e) { errorLogger.warn("[SyncChangelog] localStorage.getItem failed", e); }

    // 优先尝试 HTTP API（统一通信层）
    if (!deviceId) {
      const httpValue = await httpConfigGet("sync_device_id");
      if (typeof httpValue === "string" && httpValue) {
        deviceId = httpValue;
      }
    }

    // Fallback: IPC
    if (!deviceId && window.electronAPI?.getConfig) {
      try {
        const ipcValue = window.electronAPI.getConfig("sync_device_id");
        if (typeof ipcValue === "string" && ipcValue) {
          deviceId = ipcValue;
        }
      } catch (e) { errorLogger.warn("[SyncChangelog] electronAPI.getConfig failed", e); }
    }

    if (!deviceId) {
      deviceId = `dev_${crypto.randomUUID()}`;
    }
    try {
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    } catch (e) { errorLogger.warn("[SyncChangelog] localStorage.setItem failed", e); }

    // 持久化到后端（HTTP 优先，IPC 回退）
    const httpOk = await httpConfigSet("sync_device_id", deviceId);
    if (!httpOk && window.electronAPI?.setConfig) {
      try {
        window.electronAPI.setConfig("sync_device_id", deviceId);
      } catch (e) { errorLogger.warn("[SyncChangelog] electronAPI.setConfig failed", e); }
    }

    _cachedDeviceId = deviceId;
    return deviceId;
  } catch (e) {
    errorLogger.warn(
      "[SyncChangelog] 获取设备ID失败",
      e instanceof Error ? e.message : e,
    );
    return `dev_${crypto.randomUUID()}`;
  }
}

export async function ensureSyncSchema(): Promise<void> {
  if (!isElectron()) return;

  const syncColumnsNoIsDeleted = ["vector_clock", "sync_status", "last_synced_at"];
  const syncColumnsWithIsDeleted = ["vector_clock", "is_deleted", "sync_status", "last_synced_at"];
  const tablesWithIsDeleted = new Set(["characters", "scenes", "stories"]);
  const coreTables = [
    "characters",
    "scenes",
    "stories",
    "media_assets",
    "storyboard_assets",
    "video_tasks",
    "collections",
    "story_versions",
    "video_cache",
  ];

  for (const table of coreTables) {
    try {
      const columns = await safeQuery<{ name: string }>(
        `PRAGMA table_info(${sanitizeIdentifier(table)})`
      );
      if (columns.length === 0) continue;
      const columnNames = new Set(columns.map((c) => c.name));
      const syncColumns = tablesWithIsDeleted.has(table)
        ? syncColumnsWithIsDeleted
        : syncColumnsNoIsDeleted;
      const missingColumns = syncColumns.filter(
        (col) => !columnNames.has(col)
      );

      if (missingColumns.length > 0) {
        errorLogger.warn(
          `[SyncSchema] ${table} missing columns: ${missingColumns.join(", ")}. ` +
          `Schema update should be done in main process.`
        );
      }
    } catch (e) {
      errorLogger.warn(
        `[SyncSchema] ${table} sync column verification failed`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}

const ENTITY_TABLE_MAP: Record<string, string> = {
  character: "characters",
  scene: "scenes",
  story: "stories",
  story_version: "story_versions",
  media_asset: "media_assets",
  storyboard_asset: "storyboard_assets",
  video_task: "video_tasks",
  collection: "collections",
  element: "elements",
  video_template: "video_templates",
  ast_template: "ast_templates",
};

const TABLE_PK_MAP: Record<string, string> = {
  characters: "id",
  scenes: "id",
  stories: "id",
  media_assets: "id",
  storyboard_assets: "id",
  video_tasks: "task_id",
  collections: "id",
  story_versions: "id",
  elements: "id",
  video_templates: "id",
  ast_templates: "id",
};

function getTableName(entityType: string): string {
  const tableName = ENTITY_TABLE_MAP[entityType];
  if (!tableName) {
    throw new Error(`Unknown sync entity type: "${entityType}"`);
  }
  return tableName;
}

const TABLES_WITHOUT_UPDATED_AT = new Set(["video_tasks", "story_versions"]);

function generateChangeId(): string {
  return `cl_${crypto.randomUUID()}`;
}

export async function recordChange(
  entityType: SyncEntityType,
  entityId: string,
  operation: ChangeOperation,
  data?: Record<string, unknown>,
): Promise<void> {
  const deviceId = await getDeviceId();
  const id = generateChangeId();
  const tableName = getTableName(entityType);

  try {
    const pkColumn = TABLE_PK_MAP[tableName] || "id";

    const statements: { sql: string; params: unknown[] }[] = [];

    statements.push({
      sql: `SELECT vector_clock FROM ${sanitizeIdentifier(tableName)} WHERE ${sanitizeIdentifier(pkColumn)} = ?`,
      params: [entityId],
    });

    if (operation === "delete") {
      statements.push({
        sql: `SELECT vector_clock FROM sync_changelog WHERE entity_type = ? AND entity_id = ? ORDER BY timestamp DESC LIMIT 1`,
        params: [entityType, entityId],
      });
    }

    const readResults = await safeTransaction(statements);
    statements.length = 0;

    let currentClock: VectorClock = {};
    try {
      const entityRows = readResults[0] as Array<{ vector_clock: string }>;
      const raw = entityRows?.[0]?.vector_clock;
      currentClock = safeJsonParse(raw, {});
    } catch (e) {
      errorLogger.warn(
        "[SyncChangelog] 解析实体向量时钟失败",
        e instanceof Error ? e.message : e,
      );
      currentClock = {};
    }

    if (operation === "delete" && Object.keys(currentClock).length === 0) {
      try {
        const historyIndex = operation === "delete" ? 1 : -1;
        if (historyIndex >= 0 && readResults[historyIndex]) {
          const historyRows = readResults[historyIndex] as Array<{
            vector_clock: string;
          }>;
          const raw = historyRows?.[0]?.vector_clock;
          currentClock = safeJsonParse(raw, {});
        }
      } catch (e) {
        errorLogger.warn(
          "[SyncChangelog] 解析历史向量时钟失败",
          e instanceof Error ? e.message : e,
        );
        currentClock = {};
      }
    }

    const newClock = incrementVectorClock(currentClock, deviceId);

    if (operation !== "delete") {
      const updatedAtClause = TABLES_WITHOUT_UPDATED_AT.has(tableName)
        ? ""
        : ", updated_at = strftime('%s', 'now')";
      statements.push({
        sql: `UPDATE ${sanitizeIdentifier(tableName)} SET vector_clock = ?, sync_status = 'pending'${updatedAtClause} WHERE ${sanitizeIdentifier(pkColumn)} = ?`,
        params: [JSON.stringify(newClock), entityId],
      });
    }

    statements.push({
      sql: `INSERT INTO sync_changelog (id, entity_type, entity_id, operation, vector_clock, data, timestamp, synced, device_id)
       VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'), 0, ?)`,
      params: [
        id,
        entityType,
        entityId,
        operation,
        JSON.stringify(newClock),
        data ? JSON.stringify(data) : null,
        deviceId,
      ],
    });

    await safeTransaction(statements);
  } catch (error) {
    errorLogger.warn("[SyncChangelog] 记录变更失败", error);
  }
}

export async function getPendingChanges(
  limit = 100,
): Promise<SyncChangeLogEntry[]> {
  try {
    const rows = await safeQuery(
      `SELECT * FROM sync_changelog WHERE synced = 0 ORDER BY timestamp ASC LIMIT ?`,
      [limit],
    );
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      operation: row.operation as ChangeOperation,
      vectorClock: row.vector_clock
        ? safeJsonParse(row.vector_clock, {})
        : {},
      data: row.data as string | undefined,
      timestamp: row.timestamp as number,
      synced: row.synced as number,
      deviceId: row.device_id as string,
    })) as SyncChangeLogEntry[];
  } catch (e) {
    errorLogger.warn("[SyncChangelog] 查询变更日志失败", e);
    return [];
  }
}

export async function markChangesSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  try {
    const placeholders = ids.map(() => "?").join(",");

    const changes = await safeQuery(
      `SELECT DISTINCT entity_type, entity_id FROM sync_changelog WHERE id IN (${placeholders})`,
      ids,
    );

    const statements: { sql: string; params: unknown[] }[] = [];
    statements.push({
      sql: `UPDATE sync_changelog SET synced = 1 WHERE id IN (${placeholders})`,
      params: [...ids],
    });

    for (const change of changes as Array<Record<string, unknown>>) {
      const tableName = getTableName(change.entity_type as string);
      const pkColumn = TABLE_PK_MAP[tableName] || "id";
      statements.push({
        sql: `UPDATE ${sanitizeIdentifier(tableName)} SET sync_status = 'synced', last_synced_at = strftime('%s', 'now') WHERE ${sanitizeIdentifier(pkColumn)} = ?`,
        params: [change.entity_id as string],
      });
    }

    await safeTransaction(statements);
  } catch (error) {
    errorLogger.warn("[SyncChangelog] 标记同步完成失败", error);
  }
}

export async function softDelete(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  const tableName = getTableName(entityType);
  const pkColumn = TABLE_PK_MAP[tableName] || "id";
  const tablesWithIsDeleted = new Set(["characters", "scenes", "stories"]);

  if (tablesWithIsDeleted.has(tableName)) {
    const updatedAtClause = TABLES_WITHOUT_UPDATED_AT.has(tableName)
      ? ""
      : ", updated_at = strftime('%s', 'now')";

    await safeRun(
      `UPDATE ${sanitizeIdentifier(tableName)} SET is_deleted = 1, sync_status = 'pending'${updatedAtClause} WHERE ${sanitizeIdentifier(pkColumn)} = ?`,
      [entityId],
    );
  } else {
    await safeRun(
      `DELETE FROM ${sanitizeIdentifier(tableName)} WHERE ${sanitizeIdentifier(pkColumn)} = ?`,
      [entityId],
    );
  }

  await recordChange(entityType, entityId, "delete");
}

export async function getSyncStatus(): Promise<SyncStatusInfo> {
  try {
    const [pending, meta] = await Promise.all([
      safeQuery(
        `SELECT COUNT(*) as count FROM sync_changelog WHERE synced = 0`,
      ),
      safeQuery(`SELECT value FROM sync_meta WHERE key = 'last_sync_at'`),
    ]);

    let totalConflicts = 0;
    const conflictTables = [
      "characters",
      "scenes",
      "stories",
      "story_versions",
      "media_assets",
      "storyboard_assets",
      "video_tasks",
      "collections",
    ];
    for (const table of conflictTables) {
      try {
        const result = await safeQuery(
          `SELECT COUNT(*) as count FROM ${sanitizeIdentifier(table)} WHERE sync_status = 'conflict'`,
        );
        totalConflicts +=
          ((result[0] as Record<string, unknown>)?.count as number) || 0;
      } catch (e) {
        errorLogger.warn(
          `[SyncStatus] 查询 ${table} 冲突数失败`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    return {
      lastSyncAt: (meta[0] as Record<string, unknown>)?.value
        ? parseInt((meta[0] as Record<string, unknown>).value as string)
        : null,
      pendingChanges:
        ((pending[0] as Record<string, unknown>)?.count as number) || 0,
      conflicts: totalConflicts,
      isSyncing: false,
      deviceId: await getDeviceId(),
    };
  } catch (e) {
    errorLogger.warn(
      "[SyncChangelog] 获取同步状态失败",
      e instanceof Error ? e.message : e,
    );
    return {
      lastSyncAt: null,
      pendingChanges: 0,
      conflicts: 0,
      isSyncing: false,
      deviceId: await getDeviceId(),
    };
  }
}

export async function updateLastSyncTime(): Promise<void> {
  try {
    await safeRun(
      `INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync_at', ?)`,
      [Math.floor(Date.now() / 1000).toString()],
    );
  } catch (e) {
    errorLogger.warn(
      "[SyncChangelog] 更新最后同步时间失败",
      e instanceof Error ? e.message : e,
    );
  }
}

export async function cleanupSyncedChanges(
  olderThanHours = 72,
): Promise<number> {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - olderThanHours * 3600;
    const result = await safeQuery(
      `SELECT COUNT(*) as count FROM sync_changelog WHERE synced = 1 AND timestamp < ?`,
      [cutoff],
    );
    const count =
      ((result[0] as Record<string, unknown>)?.count as number) || 0;

    if (count > 0) {
      await safeRun(
        `DELETE FROM sync_changelog WHERE synced = 1 AND timestamp < ?`,
        [cutoff],
      );
    }

    return count;
  } catch (e) {
    errorLogger.warn(
      "[SyncChangelog] 清理已同步变更失败",
      e instanceof Error ? e.message : e,
    );
    return 0;
  }
}

export { getDeviceId };
