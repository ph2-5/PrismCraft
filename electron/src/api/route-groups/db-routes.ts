import type { Route } from "../types";
import { defineRoute } from "../types";
import { validateSql } from "../../handlers/database";
import { getDb, query, run } from "../../database";
import { dbQuerySchema, dbRunSchema, dbTransactionSchema } from "../schemas";
import { getLogger } from "../../logging";

const logger = getLogger("db-routes");

function redactSensitiveResult(sql: string, data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const isSelect = /^\s*SELECT\s/i.test(sql);
  if (!isSelect) return data;

  const SENSITIVE_TABLES = new Set(["sync_conflict_backup", "error_logs", "sessions"]);
  const tableMatches = [...sql.matchAll(/FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)];
  for (const match of tableMatches) {
    if (SENSITIVE_TABLES.has(match[1]!.toLowerCase())) {
      return [];
    }
  }
  return data;
}

export const dbRoutes: Record<string, Route> = {
  "db/query": defineRoute({
    schema: dbQuerySchema,
    handler: async (_method, body) => {
      const { sql, params } = body;
      try {
        validateSql(sql);
        const cleanParams = params.map((p) => (p === undefined ? null : p));
        const result = await query(sql, cleanParams);
        return { success: true, data: redactSensitiveResult(sql, result) };
      } catch (error) {
        logger.error("[DB HTTP] Query failed:", error instanceof Error ? error : new Error(String(error)));
        const msg = error instanceof Error ? error.message : String(error);
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
        validateSql(sql);
        const cleanParams = params.map((p) => (p === undefined ? null : p));
        const result = await run(sql, cleanParams);
        return { success: true, data: result };
      } catch (error) {
        logger.error("[DB HTTP] Run failed:", error instanceof Error ? error : new Error(String(error)));
        const msg = error instanceof Error ? error.message : String(error);
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
        return { success: true, data: results };
      } catch (error) {
        logger.error("[DB HTTP] Transaction failed:", error instanceof Error ? error : new Error(String(error)));
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: msg || "Unknown database transaction error" };
      }
    },
    methods: ["POST"],
  }),
};
