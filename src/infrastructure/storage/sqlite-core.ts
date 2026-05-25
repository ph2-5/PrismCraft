import { performanceMonitor } from "@/infrastructure/monitoring";
import { extractErrorMessage } from "@/shared/error-logger";
import type { DbRunResult } from "./core";

function getElectronAPI() {
  if (!window.electronAPI) {
    throw new Error("electronAPI not available - ensure Electron preload script is loaded");
  }
  return window.electronAPI;
}

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const msg = extractErrorMessage(error);
      lastError = error instanceof Error ? error : new Error(msg);
      const isRetryable = /busy|locked|timeout/i.test(msg);
      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }
      const baseDelay = 200 * Math.pow(2, attempt);
      const jitter = Math.random() * 100;
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
    }
  }
  throw lastError;
}

function extractDbErrorMessage(response: { success: boolean; error?: string }, fallback: string): string {
  if (typeof response.error === "string" && response.error.trim().length > 0) {
    return response.error.trim();
  }
  return fallback;
}

export async function safeQuery<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return performanceMonitor.measure("db_query", sql, () =>
    withRetry(async () => {
      const response = await getElectronAPI().dbQuery(sql, params);
      if (!response.success) {
        throw new Error(extractDbErrorMessage(response, `SQLite query failed: ${sql.substring(0, 100)}`));
      }
      return (response.data ?? []) as T[];
    }),
  );
}

export async function safeRun(
  sql: string,
  params: unknown[] = [],
): Promise<DbRunResult> {
  return performanceMonitor.measure("db_query", sql, () =>
    withRetry(async () => {
      const response = await getElectronAPI().dbRun(sql, params);
      if (!response.success) {
        throw new Error(extractDbErrorMessage(response, `SQLite run failed: ${sql.substring(0, 100)}`));
      }
      return { changes: response.data?.changes, lastInsertRowid: response.data?.lastInsertRowid };
    }),
  );
}

export async function safeTransaction(
  statements: { sql: string; params: unknown[] }[],
): Promise<unknown[]> {
  return performanceMonitor.measure("db_transaction", `transaction(${statements.length})`, () =>
    withRetry(async () => {
      const response = await getElectronAPI().dbTransaction(statements);
      if (!response.success) {
        const sqlPreview = statements.map((s) => s.sql.substring(0, 50)).join("; ");
        throw new Error(extractDbErrorMessage(response, `SQLite transaction failed: ${sqlPreview}`));
      }
      return (response.data ?? []) as unknown[];
    }),
  );
}
