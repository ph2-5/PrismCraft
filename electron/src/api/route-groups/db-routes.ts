import type { Route } from "../types";
import { defineRoute } from "../types";
import { extractErrorMessage } from "../../logging/extract-error";
import { validateSql, isSensitiveQuery } from "../../handlers/database";
import { getDb, query, run } from "../../database";
import { ensureDbInitialized, scheduleSave } from "../../handlers/database";
import { dbQuerySchema, dbRunSchema, dbTransactionSchema } from "../schemas";
import { getLogger } from "../../logging";

const logger = getLogger("db-routes");

function redactSensitiveResult(sql: string, data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  if (!isSensitiveQuery(sql)) return data;
  return [];
}

export const dbRoutes: Record<string, Route> = {
  "db/query": defineRoute({
    schema: dbQuerySchema,
    handler: async (_method, body) => {
      const { sql, params } = body;
      try {
        await ensureDbInitialized();
        validateSql(sql);
        const cleanParams = params.map((p) => (p === undefined ? null : p));
        const result = await query(sql, cleanParams);
        return { success: true, data: redactSensitiveResult(sql, result) };
      } catch (error) {
        logger.error("[DB HTTP] Query failed:", error instanceof Error ? error : new Error(String(error)));
        const msg = extractErrorMessage(error);
        return { success: false, error: msg || "Unknown database query error" };
      }
    },
    methods: ["POST"],
  }),

  "db/run": defineRoute({
    schema: dbRunSchema,
    handler: async (_method, body) => {
      const { sql, params } = body;
      try {
        await ensureDbInitialized();
        validateSql(sql);
        const cleanParams = params.map((p) => (p === undefined ? null : p));
        const result = await run(sql, cleanParams);
        scheduleSave();
        return { success: true, data: result };
      } catch (error) {
        logger.error("[DB HTTP] Run failed:", error instanceof Error ? error : new Error(String(error)));
        const msg = extractErrorMessage(error);
        return { success: false, error: msg || "Unknown database run error" };
      }
    },
    methods: ["POST"],
  }),

  "db/transaction": defineRoute({
    schema: dbTransactionSchema,
    handler: async (_method, body) => {
      const { statements } = body;
      try {
        await ensureDbInitialized();
        for (const stmt of statements) {
          validateSql(stmt.sql);
        }
        const db = getDb();
        const results = db.transaction(() => {
          const innerResults: unknown[] = [];
          for (const { sql, params } of statements) {
            const cleanParams = params.map((p) => (p === undefined ? null : p));
            const stmt = db.prepare(sql);
            const isSelect = /^\s*SELECT\s/i.test(sql);
            if (isSelect) {
              const rows = stmt.all(...cleanParams);
              innerResults.push(redactSensitiveResult(sql, rows));
            } else {
              const r = stmt.run(...cleanParams);
              innerResults.push(r);
            }
          }
          return innerResults;
        }) as unknown[];
        // 与 IPC handler 保持一致：事务成功后调度持久化保存
        scheduleSave();
        return { success: true, data: results };
      } catch (error) {
        logger.error("[DB HTTP] Transaction failed:", error instanceof Error ? error : new Error(String(error)));
        const msg = extractErrorMessage(error);
        return { success: false, error: msg || "Unknown database transaction error" };
      }
    },
    methods: ["POST"],
  }),
};
