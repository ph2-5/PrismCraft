import { ipcMain } from "electron";
import { getLogger } from "../logging/logger";
import {
  initDatabase,
  getDb,
  getDbType,
  saveDatabase,
  query,
  run,
  exec,
  closeDatabase,
} from "../database";

const logger = getLogger("database");

let dbReady = false;
let initPromise: Promise<unknown> | null = null;
let pendingSaveTimeout: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 1000;

const ALLOWED_TABLES = new Set([
  "characters",
  "scenes",
  "stories",
  "story_versions",
  "story_characters",
  "story_scenes",
  "story_beats",
  "story_elements",
  "character_outfits",
  "elements",
  "media_assets",
  "video_tasks",
  "video_templates",
  "storyboard_assets",
  "collections",
  "collection_assets",
  "asset_tags",
  "generation_tasks",
  "file_index",
  "auto_saves",
  "error_logs",
  "sessions",
  "video_cache",
  "ast_templates",
  "sync_changelog",
  "sync_meta",
  "sync_conflict_backup",
  "schema_version",
  "asset_collections",
  "users",
  "image_cache",
]);

const ALLOWED_STATEMENT_PREFIXES = new Set([
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "REPLACE",
  "WITH",
  "VALUES",
  "VACUUM",
  "ANALYZE",
  "PRAGMA",
]);

const ALLOWED_PRAGMA_STATEMENTS = [
  /^PRAGMA\s+table_info\s*\(\s*"?[a-zA-Z_][a-zA-Z0-9_]*"?\s*\)$/i,
  /^PRAGMA\s+wal_checkpoint\s*\(\s*TRUNCATE\s*\)$/i,
  /^PRAGMA\s+foreign_keys\s*$/i,
  /^PRAGMA\s+journal_mode\s*$/i,
  /^PRAGMA\s+synchronous\s*$/i,
  /^PRAGMA\s+cache_size\s*$/i,
  /^PRAGMA\s+temp_store\s*$/i,
  /^PRAGMA\s+mmap_size\s*$/i,
];

const DANGEROUS_PATTERNS = [
  /\bDROP\b/i,
  /\bALTER\b/i,
  /\bTRUNCATE\b/i,
  /\bCREATE\s+TABLE\b/i,
  /\bCREATE\s+INDEX\b/i,
  /\bCREATE\s+VIEW\b/i,
  /\bCREATE\s+TRIGGER\b/i,
  /\bCREATE\s+FUNCTION\b/i,
  /\bCREATE\s+VIRTUAL\b/i,
  /\bATTACH\b/i,
  /\bDETACH\b/i,
  /sqlite_master/i,
  /sqlite_sequence/i,
  /sqlite_schema/i,
];

function validateSql(sql: string): boolean {
  if (!sql || typeof sql !== "string") {
    throw new Error("SQL must be a non-empty string");
  }

  // 剥离 SQL 注释，避免注释内容干扰 firstWord 提取和白名单匹配
  // 支持 -- 行注释和 /* */ 块注释
  const withoutComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
  const trimmed = withoutComments.trim();
  if (!trimmed) {
    throw new Error("SQL must be a non-empty string");
  }
  const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase() ?? "";

  if (firstWord === "PRAGMA") {
    const isAllowed = ALLOWED_PRAGMA_STATEMENTS.some((pattern) =>
      pattern.test(trimmed),
    );
    if (!isAllowed) {
      throw new Error(`PRAGMA statement not allowed`);
    }
    return true;
  }

  if (!ALLOWED_STATEMENT_PREFIXES.has(firstWord)) {
    throw new Error(`SQL statement type "${firstWord}" is not allowed`);
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(withoutComments)) {
      throw new Error("Dangerous SQL operation not allowed");
    }
  }

  const withoutTrailing = trimmed.replace(/;+\s*$/, "");
  if (withoutTrailing.includes(";")) {
    throw new Error("Multiple SQL statements are not allowed");
  }

  if (/--/.test(sql) || /\/\*/.test(sql)) {
    throw new Error("SQL comments are not allowed");
  }

  const tableMatches = [
    ...sql.matchAll(/FROM\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi),
    ...sql.matchAll(/INTO\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi),
    ...sql.matchAll(/(?<!DO\s)UPDATE\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi),
    ...sql.matchAll(/JOIN\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi),
    ...sql.matchAll(/DELETE\s+FROM\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi),
  ];

  for (const match of tableMatches) {
    const tableName = match[1]?.toLowerCase();
    if (!tableName) continue;
    if (!ALLOWED_TABLES.has(tableName)) {
      throw new Error(`Table "${tableName}" is not in the allowed list`);
    }
  }

  return true;
}

export { validateSql, isSensitiveQuery };

async function ensureDb(): Promise<void> {
  if (dbReady) return;
  if (!initPromise) {
    initPromise = initDatabase().then(
      (result: unknown) => {
        dbReady = true;
        return result;
      },
      (error: unknown) => {
        initPromise = null;
        throw error;
      }
    );
  }
  await initPromise;
}

/**
 * 确保数据库已初始化（供 HTTP API routes 调用）。
 * IPC handlers 内部已有懒加载，但 HTTP routes 直接调用 database 模块的 query/run，
 * 需要显式调用此函数确保数据库初始化完成。
 */
export async function ensureDbInitialized(): Promise<void> {
  await ensureDb();
}

export function scheduleSave(): void {
  if (pendingSaveTimeout) {
    clearTimeout(pendingSaveTimeout);
  }
  pendingSaveTimeout = setTimeout(() => {
    pendingSaveTimeout = null;
    try {
      saveDatabase();
    } catch (error) {
      logger.error("[DB] Scheduled save failed:", error instanceof Error ? error : new Error(String(error)));
    }
  }, SAVE_DEBOUNCE_MS);
}

const SENSITIVE_TABLES = new Set(["sync_conflict_backup", "error_logs", "sessions"]);

/**
 * 检测查询是否涉及敏感表的数据读取。
 *
 * 检测策略：
 * 1. SELECT/WITH 开头的查询，或包含 RETURNING 子句的写入：检查是否引用敏感表
 * 2. INSERT...SELECT / UPDATE...FROM / DELETE...FROM 等带子查询的写入：
 *    检查子查询是否从敏感表读取数据（防止跨表复制敏感数据到非敏感表后绕过脱敏读取）
 *
 * 攻击场景（修复前）：
 *   INSERT INTO characters (name) SELECT password FROM sessions
 *   → 原 isSensitiveQuery 仅检查 SELECT/WITH 开头，INSERT 语句返回 false，不脱敏
 *   → 攻击者随后 SELECT name FROM characters WHERE name LIKE 'sk-%' 即可读取明文密钥
 *
 * 修复后：任何 FROM/JOIN 引用敏感表的 SQL 均视为敏感查询，结果被脱敏。
 * 这不影响正常写入（INSERT INTO error_logs VALUES (?) 无 FROM 子句，不触发脱敏，
 * 且 INSERT 不返回数据，redactResult 返回 [] 无副作用）。
 */
function isSensitiveQuery(sql: string): boolean {
  // 检测读取类查询：SELECT、WITH（CTE）、或包含 RETURNING 子句
  const isReading = /^\s*(SELECT|WITH)\s/i.test(sql) || /\bRETURNING\b/i.test(sql);
  // 检测带子查询的写入（INSERT...SELECT / UPDATE...FROM / DELETE...USING 等）
  const hasSubqueryRead = /\bFROM\b/i.test(sql) || /\bJOIN\b/i.test(sql);
  if (!isReading && !hasSubqueryRead) return false;

  // 检测是否读取敏感表（FROM/JOIN 后跟敏感表名，支持双引号包裹的标识符）
  // 同时检测 INTO/UPDATE 敏感表（用于 RETURNING 场景，写入敏感表并返回数据）
  for (const table of SENSITIVE_TABLES) {
    const regex = new RegExp(`\\b(FROM|JOIN|INTO|UPDATE)\\s+"?${table}"?(?:\\s|,|;|\\)|$)`, "i");
    if (regex.test(sql)) return true;
  }
  return false;
}

function redactResult(sql: string, data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  if (!isSensitiveQuery(sql)) return data;
  return [];
}

export function setupDatabaseHandlers(): void {
  ipcMain.handle("db:init", async () => {
    try {
      await ensureDb();
      return { success: true, dbType: getDbType() };
    } catch (error) {
      logger.error("[DB] Init failed:", error instanceof Error ? error : new Error(String(error)));
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(
    "db:query",
    async (_event: Electron.IpcMainInvokeEvent, sql: string, params: unknown[] = []) => {
      try {
        validateSql(sql);
        await ensureDb();
        const cleanParams = params.map((p) => (p === undefined ? null : p));
        const result = await query(sql, cleanParams);
        return { success: true, data: redactResult(sql, result) };
      } catch (error) {
        logger.error("[DB] Query failed:", error instanceof Error ? error : new Error(String(error)), { sql: String(sql).substring(0, 200) });
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: msg || "Unknown database query error" };
      }
    }
  );

  ipcMain.handle(
    "db:get",
    async (_event: Electron.IpcMainInvokeEvent, sql: string, params: unknown[] = []) => {
      try {
        validateSql(sql);
        await ensureDb();
        const cleanParams = params.map((p) => (p === undefined ? null : p));
        const db = getDb();
        const stmt = db.prepare(sql);
        const result = stmt.get(...cleanParams);
        return { success: true, data: redactResult(sql, result) };
      } catch (error) {
        logger.error("[DB] Get failed:", error instanceof Error ? error : new Error(String(error)));
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: msg || "Unknown database get error" };
      }
    }
  );

  ipcMain.handle(
    "db:run",
    async (_event: Electron.IpcMainInvokeEvent, sql: string, params: unknown[] = []) => {
      try {
        validateSql(sql);
        await ensureDb();
        const cleanParams = params.map((p) => (p === undefined ? null : p));
        const result = await run(sql, cleanParams);
        scheduleSave();
        return { success: true, data: result };
      } catch (error) {
        logger.error("[DB] Run failed:", error instanceof Error ? error : new Error(String(error)));
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: msg || "Unknown database run error" };
      }
    }
  );

  ipcMain.handle(
    "db:transaction",
    async (
      _event: Electron.IpcMainInvokeEvent,
      statements: Array<{ sql: string; params?: unknown[] }>
    ) => {
      try {
        for (const stmt of statements) {
          validateSql(stmt.sql);
        }
        await ensureDb();
        const db = getDb();

        const results = db.transaction(() => {
          const innerResults: unknown[] = [];
          for (const { sql, params } of statements) {
            const cleanParams = (params || []).map((p) =>
              p === undefined ? null : p
            );
            const stmt = db.prepare(sql);
            const isSelect = /^\s*SELECT\s/i.test(sql);
            if (isSelect) {
              const rows = stmt.all(...cleanParams);
              innerResults.push(redactResult(sql, rows));
            } else {
              const r = stmt.run(...cleanParams);
              innerResults.push(r);
            }
          }
          return innerResults;
        });

        scheduleSave();
        return { success: true, data: results };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[DB] Transaction failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: msg || "Unknown database transaction error" };
      }
    }
  );

  const VALID_TABLES = [...ALLOWED_TABLES];

  ipcMain.handle(
    "db:batch-insert",
    async (
      _event: Electron.IpcMainInvokeEvent,
      table: string,
      columns: string[],
      rows: Array<Record<string, unknown>>
    ) => {
      try {
        if (!VALID_TABLES.includes(table)) {
          return { success: false, error: "Invalid table name" };
        }
        const sanitizedColumns = columns.filter((c) =>
          /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c)
        );
        if (sanitizedColumns.length !== columns.length) {
          return {
            success: false,
            error: "Invalid column names in batch insert",
          };
        }
        await ensureDb();
        const db = getDb();
        try {
          const tableInfo = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
          const validColumns = new Set(tableInfo.map((col) => col.name));
          for (const col of sanitizedColumns) {
            if (!validColumns.has(col)) {
              return { success: false, error: `Column does not exist in table` };
            }
          }
        } catch {
          logger.warn("Failed to validate column names", { table });
          return { success: false, error: "Failed to validate column names" };
        }

        const placeholders = sanitizedColumns.map(() => "?").join(",");
        const insertSql = `INSERT INTO "${table}" (${sanitizedColumns.map((c) => `"${c}"`).join(",")}) VALUES (${placeholders})`;
        const insert = db.prepare(insertSql);

        const doInsert = db.transaction(() => {
          let count = 0;
          for (const row of rows) {
            const values = sanitizedColumns.map((col) => row[col] ?? null);
            insert.run(...values);
            count++;
          }
          return count;
        }) as () => number;

        const inserted = doInsert();
        scheduleSave();
        return { success: true, data: { inserted } };
      } catch (error) {
        logger.error("[DB] Batch insert failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: "Database batch insert failed" };
      }
    }
  );

  ipcMain.handle("db:save", async () => {
    try {
      if (pendingSaveTimeout) {
        clearTimeout(pendingSaveTimeout);
        pendingSaveTimeout = null;
      }
      saveDatabase();
      return { success: true };
    } catch (error) {
      logger.error("[DB] Save failed:", error instanceof Error ? error : new Error(String(error)));
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg || "Unknown database save error" };
    }
  });

  ipcMain.handle("db:close", async () => {
    try {
      if (pendingSaveTimeout) {
        clearTimeout(pendingSaveTimeout);
        pendingSaveTimeout = null;
      }
      closeDatabase();
      dbReady = false;
      initPromise = null;
      return { success: true };
    } catch (error) {
      logger.error("[DB] Close failed:", error instanceof Error ? error : new Error(String(error)));
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg || "Unknown database close error" };
    }
  });

  ipcMain.handle("db:stats", async () => {
    try {
      await ensureDb();
      const stats = await query(`
        SELECT
          (SELECT COUNT(*) FROM characters) as character_count,
          (SELECT COUNT(*) FROM scenes) as scene_count,
          (SELECT COUNT(*) FROM stories) as story_count,
          (SELECT COUNT(*) FROM media_assets) as asset_count,
          (SELECT COUNT(*) FROM video_tasks) as video_task_count,
          (SELECT COUNT(*) FROM generation_tasks WHERE status = 'completed') as completed_tasks,
          (SELECT COUNT(*) FROM generation_tasks WHERE status = 'failed') as failed_tasks,
          (SELECT COUNT(*) FROM collections) as collection_count,
          (SELECT COUNT(*) FROM file_index) as file_count
      `);
      return { success: true, data: stats[0] };
    } catch (error) {
      logger.error("[DB] Stats failed:", error instanceof Error ? error : new Error(String(error)));
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg || "Unknown database stats error" };
    }
  });

  ipcMain.handle("db:type", async () => {
    try {
      await ensureDb();
      return { success: true, data: { type: getDbType() } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg || "Unknown database type error" };
    }
  });

  ipcMain.handle("db:migrate", async () => {
    return { success: true, message: "Already using better-sqlite3, no migration needed" };
  });

  ipcMain.handle("db:vacuum", async () => {
    try {
      await ensureDb();
      validateSql("VACUUM");
      await exec("VACUUM;");
      return { success: true };
    } catch (error) {
      logger.error("[DB] Vacuum failed:", error instanceof Error ? error : new Error(String(error)));
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg || "Unknown database vacuum error" };
    }
  });

  ipcMain.handle("db:analyze", async () => {
    try {
      await ensureDb();
      validateSql("ANALYZE");
      await exec("ANALYZE;");
      return { success: true };
    } catch (error) {
      logger.error("[DB] Analyze failed:", error instanceof Error ? error : new Error(String(error)));
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg || "Unknown database analyze error" };
    }
  });

  ipcMain.handle("db:checkpoint", async () => {
    try {
      await ensureDb();
      const db = getDb();
      if (db && typeof db.checkpoint === "function") {
        db.checkpoint();
      } else if (db && typeof db.exec === "function") {
        db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
      }
      return { success: true };
    } catch (error) {
      logger.error("[DB] Checkpoint failed:", error instanceof Error ? error : new Error(String(error)));
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg || "Unknown database checkpoint error" };
    }
  });
}
