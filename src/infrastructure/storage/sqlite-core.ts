import { classifyError } from "@/domain/types";
import { performanceMonitor } from "@/infrastructure/monitoring";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";
import type { DbRunResult } from "./core";

let _electronApiWarned = false;
let _httpAvailable: boolean | null = null;

function getElectronAPI() {
  if (!window.electronAPI) {
    if (!_electronApiWarned) {
      _electronApiWarned = true;
      errorLogger.debug("[sqlite-core] electronAPI not available - running in browser mode");
    }
    throw new Error("electronAPI not available");
  }
  return window.electronAPI;
}

// HTTP DB 端点调用（IPC/HTTP 统一通信层）
// 优先使用 HTTP API，fallback 到 IPC（向后兼容）
async function httpDbCall<T>(
  endpoint: string,
  body: unknown,
): Promise<{ success: boolean; data?: T; error?: string } | null> {
  // 仅在浏览器环境且有 fetch 时尝试 HTTP
  if (typeof window === "undefined" || typeof fetch !== "function") {
    return null;
  }

  // 首次调用时检测 HTTP 服务器是否可用（缓存结果避免重复探测）
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
      errorLogger.debug("[sqlite-core] HTTP API server not available, falling back to IPC");
    }
  }

  if (!_httpAvailable) {
    return null;
  }

  try {
    const response = await fetch(`http://localhost:${API_SERVER_PORT}/api/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...ELECTRON_APP_HEADERS,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    return (await response.json()) as { success: boolean; data?: T; error?: string };
  } catch (error) {
    // HTTP 调用失败时标记为不可用，下次回退到 IPC
    _httpAvailable = false;
    errorLogger.debug(`[sqlite-core] HTTP DB call failed for ${endpoint}, falling back to IPC`, error);
    return null;
  }
}

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const msg = extractErrorMessage(error);
      lastError = error instanceof Error ? error : new Error(msg);
      const category = classifyError(undefined, msg);
      const isRetryable = category === "database_busy" || category === "timeout";
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
      // 优先尝试 HTTP API（统一通信层）
      const httpResult = await httpDbCall<T[]>("db/query", { sql, params });
      if (httpResult !== null) {
        if (!httpResult.success) {
          throw new Error(extractDbErrorMessage(httpResult, `SQLite query failed: ${sql.substring(0, 100)}`));
        }
        return (httpResult.data ?? []) as T[];
      }
      // Fallback: IPC
      const response = await getElectronAPI().dbQuery(sql, params);
      if (!response.success) {
        // Task 4.9: 降级为 debug，避免与调用方 catch 中的日志重复输出 console.error。
        // 错误信息已通过 throw 传递给调用方，由调用方决定日志级别。
        errorLogger.debug("SQLite query failed", { sql: sql.substring(0, 200) });
        throw new Error(extractDbErrorMessage(response, "SQLite query failed"));
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
      // 优先尝试 HTTP API（统一通信层）
      const httpResult = await httpDbCall<{ changes?: number; lastInsertRowid?: number | bigint }>("db/run", { sql, params });
      if (httpResult !== null) {
        if (!httpResult.success) {
          // Task 4.9: 降级为 debug，避免与调用方 catch 中的日志重复输出 console.error。
          errorLogger.debug("SQLite run failed", { sql: sql.substring(0, 200) });
          throw new Error(extractDbErrorMessage(httpResult, "SQLite run failed"));
        }
        const data = httpResult.data;
        const rowid = data?.lastInsertRowid;
        return {
          changes: typeof data?.changes === "number" ? data.changes : undefined,
          lastInsertRowid: typeof rowid === "bigint" ? Number(rowid) : rowid,
        };
      }
      // Fallback: IPC
      const response = await getElectronAPI().dbRun(sql, params);
      if (!response.success) {
        // Task 4.9: 降级为 debug，避免与调用方 catch 中的日志重复输出 console.error。
        errorLogger.debug("SQLite run failed", { sql: sql.substring(0, 200) });
        throw new Error(extractDbErrorMessage(response, "SQLite run failed"));
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
      // 优先尝试 HTTP API（统一通信层）
      const httpResult = await httpDbCall<unknown[]>("db/transaction", { statements });
      if (httpResult !== null) {
        if (!httpResult.success) {
          const sqlPreview = statements.map((s) => s.sql.substring(0, 50)).join("; ");
          // Task 4.9: 降级为 debug，避免与调用方 catch 中的日志重复输出 console.error。
          errorLogger.debug("SQLite transaction failed", { sql: sqlPreview });
          throw new Error(extractDbErrorMessage(httpResult, "SQLite transaction failed"));
        }
        return (httpResult.data ?? []) as unknown[];
      }
      // Fallback: IPC
      const response = await getElectronAPI().dbTransaction(statements);
      if (!response.success) {
        const sqlPreview = statements.map((s) => s.sql.substring(0, 50)).join("; ");
        // Task 4.9: 降级为 debug，避免与调用方 catch 中的日志重复输出 console.error。
        errorLogger.debug("SQLite transaction failed", { sql: sqlPreview });
        throw new Error(extractDbErrorMessage(response, "SQLite transaction failed"));
      }
      return (response.data ?? []) as unknown[];
    }),
  );
}
