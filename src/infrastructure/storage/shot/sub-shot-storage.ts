/**
 * SubShot Storage — 单分镜多镜头子实体的持久化层（Task 4.10）
 *
 * 职责：
 *   - 通过 HTTP API / IPC 与 SQLite 交互（safeQuery / safeRun / safeTransaction）
 *   - DB 列（snake_case, INTEGER 时间戳） ↔ 域对象（camelCase, ISO 字符串）转换
 *   - 实现 ISubShotStorage Port 接口
 */
import { safeQuery, safeRun, safeTransaction } from "../sqlite-core";
import { errorLogger } from "@/shared/error-logger";
import type { SubShot } from "@/domain/schemas";
import type { ISubShotStorage } from "@/domain/ports";

// ============= DB 记录类型 =============

interface SubShotRow {
  id: string;
  story_beat_id: string;
  sequence: number;
  shot_type: string | null;
  camera_movement: string | null;
  camera_angle: string | null;
  duration: number | null;
  description: string | null;
  prompt: string | null;
  image_url: string | null;
  video_url: string | null;
  transition: string | null;
  created_at: number | null;
  updated_at: number | null;
}

// ============= 转换辅助 =============

function rowToSubShot(row: SubShotRow): SubShot {
  return {
    id: row.id,
    storyBeatId: row.story_beat_id,
    sequence: row.sequence,
    shotType: row.shot_type ?? "",
    cameraMovement: row.camera_movement ?? "",
    cameraAngle: row.camera_angle ?? "",
    duration: row.duration ?? 5,
    description: row.description ?? "",
    prompt: row.prompt ?? undefined,
    imageUrl: row.image_url ?? undefined,
    videoUrl: row.video_url ?? undefined,
    transition: row.transition ?? undefined,
    createdAt: row.created_at != null ? new Date(row.created_at * 1000).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at != null ? new Date(row.updated_at * 1000).toISOString() : new Date().toISOString(),
  };
}

/** 将域对象字段映射为 DB 列值（用于 INSERT/UPDATE） */
function subShotToFields(subShot: Partial<SubShot>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (subShot.storyBeatId !== undefined) fields.story_beat_id = subShot.storyBeatId;
  if (subShot.sequence !== undefined) fields.sequence = subShot.sequence;
  if (subShot.shotType !== undefined) fields.shot_type = subShot.shotType;
  if (subShot.cameraMovement !== undefined) fields.camera_movement = subShot.cameraMovement;
  if (subShot.cameraAngle !== undefined) fields.camera_angle = subShot.cameraAngle;
  if (subShot.duration !== undefined) fields.duration = subShot.duration;
  if (subShot.description !== undefined) fields.description = subShot.description;
  if (subShot.prompt !== undefined) fields.prompt = subShot.prompt;
  if (subShot.imageUrl !== undefined) fields.image_url = subShot.imageUrl;
  if (subShot.videoUrl !== undefined) fields.video_url = subShot.videoUrl;
  if (subShot.transition !== undefined) fields.transition = subShot.transition;
  return fields;
}

function buildInsertSql(table: string, fields: Record<string, unknown>): { sql: string; params: unknown[] } {
  const columns = Object.keys(fields);
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
  const params = columns.map((c) => fields[c]);
  return { sql, params };
}

function buildUpdateSql(table: string, fields: Record<string, unknown>, id: string): { sql: string; params: unknown[] } {
  const columns = Object.keys(fields);
  const setClause = columns.map((c) => `${c} = ?`).join(", ");
  const sql = `UPDATE ${table} SET ${setClause}, updated_at = (strftime('%s','now')) WHERE id = ?`;
  const params = [...columns.map((c) => fields[c]), id];
  return { sql, params };
}

// ============= Storage 实现 =============

export const subShotStorage: ISubShotStorage = {
  async getSubShotsByBeatId(beatId: string): Promise<SubShot[]> {
    try {
      const rows = await safeQuery<SubShotRow>(
        "SELECT * FROM sub_shots WHERE story_beat_id = ? AND is_deleted = 0 ORDER BY sequence ASC",
        [beatId],
      );
      return rows.map(rowToSubShot);
    } catch (e) {
      errorLogger.error("[sub-shot-storage] getSubShotsByBeatId failed", { beatId, error: e });
      return [];
    }
  },

  async getSubShotById(id: string): Promise<SubShot | null> {
    try {
      const rows = await safeQuery<SubShotRow>(
        "SELECT * FROM sub_shots WHERE id = ? AND is_deleted = 0",
        [id],
      );
      const row = rows[0];
      return row ? rowToSubShot(row) : null;
    } catch (e) {
      errorLogger.error("[sub-shot-storage] getSubShotById failed", { id, error: e });
      return null;
    }
  },

  async createSubShot(subShot: Partial<SubShot> & { id: string; storyBeatId: string }): Promise<void> {
    try {
      const fields = subShotToFields(subShot);
      fields.id = subShot.id;
      if (subShot.sequence === undefined) fields.sequence = 0;
      const { sql, params } = buildInsertSql("sub_shots", fields);
      await safeRun(sql, params);
    } catch (e) {
      errorLogger.error("[sub-shot-storage] createSubShot failed", { id: subShot.id, error: e });
      throw e;
    }
  },

  async updateSubShot(id: string, updates: Partial<SubShot>): Promise<void> {
    try {
      const fields = subShotToFields(updates);
      if (Object.keys(fields).length === 0) return;
      const { sql, params } = buildUpdateSql("sub_shots", fields, id);
      await safeRun(sql, params);
    } catch (e) {
      errorLogger.error("[sub-shot-storage] updateSubShot failed", { id, error: e });
      throw e;
    }
  },

  async deleteSubShot(id: string): Promise<void> {
    try {
      await safeRun(
        "UPDATE sub_shots SET is_deleted = 1, deleted_at = (strftime('%s','now')) WHERE id = ?",
        [id],
      );
    } catch (e) {
      errorLogger.error("[sub-shot-storage] deleteSubShot failed", { id, error: e });
      throw e;
    }
  },

  async deleteSubShotsByBeatId(beatId: string): Promise<void> {
    try {
      await safeRun(
        "UPDATE sub_shots SET is_deleted = 1, deleted_at = (strftime('%s','now')) WHERE story_beat_id = ?",
        [beatId],
      );
    } catch (e) {
      errorLogger.error("[sub-shot-storage] deleteSubShotsByBeatId failed", { beatId, error: e });
      throw e;
    }
  },

  async reorderSubShots(beatId: string, orderedIds: string[]): Promise<void> {
    try {
      const statements = orderedIds.map((id, index) => ({
        sql: "UPDATE sub_shots SET sequence = ?, updated_at = (strftime('%s','now')) WHERE id = ? AND story_beat_id = ?",
        params: [index, id, beatId],
      }));
      if (statements.length > 0) {
        await safeTransaction(statements);
      }
    } catch (e) {
      errorLogger.error("[sub-shot-storage] reorderSubShots failed", { beatId, error: e });
      throw e;
    }
  },
};
