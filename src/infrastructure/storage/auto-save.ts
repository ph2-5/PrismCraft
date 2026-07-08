import { safeQuery, safeRun } from "./sqlite-core";
import { parseRecordWithTable } from "./core";
import { DAY_MS } from "@/shared/constants";

export const autoSaveStorage = {
  async getAutoSaves<T = Record<string, unknown>>(): Promise<T[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM auto_saves ORDER BY timestamp DESC",
    );
    return result.map((r) => parseRecordWithTable(r, "auto_saves")) as T[];
  },

  async createAutoSave(autoSave: {
    id: string;
    type: string;
    data: unknown;
    timestamp?: number;
  }): Promise<void> {
    const ts = autoSave.timestamp || Math.floor(Date.now() / 1000);
    const result = await safeRun(
      "INSERT INTO auto_saves (id, type, data_json, timestamp) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, timestamp = excluded.timestamp WHERE timestamp < excluded.timestamp",
      [
        autoSave.id,
        autoSave.type,
        JSON.stringify(autoSave.data),
        ts,
      ],
    );
    if (!result || result.changes === 0) {
      const existing = await safeQuery<{ timestamp: number }>(
        "SELECT timestamp FROM auto_saves WHERE id = ?",
        [autoSave.id],
      );
      if (existing.length === 0) {
        await safeRun(
          "INSERT INTO auto_saves (id, type, data_json, timestamp) VALUES (?, ?, ?, ?)",
          [autoSave.id, autoSave.type, JSON.stringify(autoSave.data), ts],
        );
      } else if (existing[0]!.timestamp > ts) {
        return;
      }
    }
  },

  async deleteAutoSave(id: string): Promise<void> {
    await safeRun("DELETE FROM auto_saves WHERE id = ?", [id]);
  },

  async clearAllAutoSaves(): Promise<void> {
    await safeRun("DELETE FROM auto_saves");
  },

  async cleanExpiredAutoSaves(maxAgeMs: number = 7 * DAY_MS): Promise<number> {
    const cutoff = Math.floor((Date.now() - maxAgeMs) / 1000);
    const before = await safeQuery<{ id: string }>(
      "SELECT id FROM auto_saves WHERE timestamp < ?",
      [cutoff],
    );
    await safeRun("DELETE FROM auto_saves WHERE timestamp < ?", [cutoff]);
    return before.length;
  },

  async getAutoSavesByType<T = Record<string, unknown>>(type: string): Promise<T[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM auto_saves WHERE type = ? ORDER BY timestamp DESC",
      [type],
    );
    return result.map((r) => parseRecordWithTable(r, "auto_saves")) as T[];
  },

  async getAutoSaveById<T = Record<string, unknown>>(id: string): Promise<T | undefined> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM auto_saves WHERE id = ?",
      [id],
    );
    if (result.length === 0) return undefined;
    return parseRecordWithTable(result[0]!, "auto_saves") as T;
  },
};
