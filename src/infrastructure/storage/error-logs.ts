import { safeQuery, safeRun } from "./sqlite-core";
import { parseRecord } from "./core";

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
    if (count > 1000) {
      await this.deleteOldErrorLogs(800);
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
      const minId = result[result.length - 1].id;
      await safeRun("DELETE FROM error_logs WHERE id < ?", [minId]);
    }
  },

  async clearErrorLogs(): Promise<void> {
    await safeRun("DELETE FROM error_logs");
  },
};
