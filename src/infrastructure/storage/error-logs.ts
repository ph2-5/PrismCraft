import { safeQuery, safeRun } from "./sqlite-core";
import { parseRecord } from "./core";

/** 错误日志最大条数，超过则触发清理 */
const MAX_ERROR_LOGS = 1000;
/** 触发清理后保留的条数 */
const ERROR_LOGS_KEEP_AFTER_CLEANUP = 800;

export const errorLogStorage = {
  async addErrorLog(error: {
    message: string;
    stack?: string;
    timestamp?: number;
    component?: string;
  }): Promise<void> {
    await safeRun(
      "INSERT INTO error_logs (message, stack, timestamp, component) VALUES (?, ?, ?, ?)",
      [
        error.message,
        error.stack || null,
        error.timestamp || Math.floor(Date.now() / 1000),
        error.component || null,
      ],
    );
    const count = await this.getErrorLogCount();
    if (count > MAX_ERROR_LOGS) {
      await this.deleteOldErrorLogs(ERROR_LOGS_KEEP_AFTER_CLEANUP);
    }
  },

  async getErrorLogs<T = Record<string, unknown>>(limit = 200): Promise<T[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM error_logs ORDER BY id DESC LIMIT ?",
      [limit],
    );
    return result.map((r) => parseRecord(r)) as T[];
  },

  async getErrorLogCount(): Promise<number> {
    const result = await safeQuery<{ count: number }>(
      "SELECT COUNT(*) as count FROM error_logs",
    );
    return result[0]?.count || 0;
  },

  async deleteOldErrorLogs(keepCount: number): Promise<void> {
    if (keepCount <= 0) {
      await safeRun("DELETE FROM error_logs");
      return;
    }
    const result = await safeQuery<{ id: number }>(
      "SELECT id FROM error_logs ORDER BY id DESC LIMIT ?",
      [keepCount],
    );
    if (result.length >= keepCount) {
      const minId = result[result.length - 1]!.id;
      await safeRun("DELETE FROM error_logs WHERE id < ?", [minId]);
    }
  },

  async clearErrorLogs(): Promise<void> {
    await safeRun("DELETE FROM error_logs");
  },
};
