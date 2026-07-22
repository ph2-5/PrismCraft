/**
 * Q3-3 — StoryTimeline Storage
 *
 * 故事时间线的持久化存储。对称 scenes/variant-manager.ts 的 plain object 模式。
 *
 * 表结构：story_timelines（见 electron/src/database/db-schema.ts）
 *   - id (TEXT PRIMARY KEY)
 *   - project_id / name / description / type
 *   - is_parallel / parent_timeline_id / merge_node_id
 *   - bindings_json / metadata_json
 *   - BASE_COLUMNS（owner_id/created_at/updated_at/is_deleted/deleted_at/version/sync_id）
 *
 * 访问模式：通过 DI container（container.timelineStorage）访问。
 */

import { safeQuery, safeRun } from "../sqlite-core";
import { parseRecordWithTable } from "../core";
import { errorLogger } from "@/shared/error-logger";
import type {
  StoryTimeline,
  CreateStoryTimelineInput,
  UpdateStoryTimelineInput,
} from "@/domain/schemas";

/** DB 行 → StoryTimeline 域对象 */
function rowToTimeline(row: Record<string, unknown>): StoryTimeline {
  const parsed = parseRecordWithTable(row, "story_timelines");

  const parseJson = (raw: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> => {
    if (raw && typeof raw === "object") return raw as Record<string, unknown>;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const tsToString = (v: unknown): string => {
    if (!v) return new Date().toISOString();
    if (typeof v === "number") return new Date(v * 1000).toISOString();
    return String(v);
  };

  return {
    id: String(parsed.id ?? ""),
    projectId: String(parsed.project_id ?? "default"),
    name: String(parsed.name ?? ""),
    description: String(parsed.description ?? ""),
    type: (parsed.type as StoryTimeline["type"]) ?? "main",
    isParallel: !!parsed.is_parallel,
    parentTimelineId: parsed.parent_timeline_id ? String(parsed.parent_timeline_id) : undefined,
    mergeNodeId: parsed.merge_node_id ? String(parsed.merge_node_id) : undefined,
    bindings: parseJson(parsed.bindings_json),
    metadata: parseJson(parsed.metadata_json),
    createdAt: tsToString(parsed.created_at),
    updatedAt: tsToString(parsed.updated_at),
  };
}

function generateTimelineId(): string {
  return `timeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const timelineStorage = {
  /** 获取项目的所有时间线（按 type, created_at 排序） */
  async getTimelinesForProject(projectId: string): Promise<StoryTimeline[]> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM story_timelines WHERE project_id = ? AND is_deleted = 0 ORDER BY CASE type WHEN 'main' THEN 0 ELSE 1 END, created_at ASC",
      [projectId],
    );
    return rows.map(rowToTimeline);
  },

  /** 获取所有时间线 */
  async getAllTimelines(): Promise<StoryTimeline[]> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM story_timelines WHERE is_deleted = 0 ORDER BY CASE type WHEN 'main' THEN 0 ELSE 1 END, created_at ASC",
    );
    return rows.map(rowToTimeline);
  },

  /** 获取单个时间线 */
  async getTimelineById(id: string): Promise<StoryTimeline | null> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM story_timelines WHERE id = ? AND is_deleted = 0",
      [id],
    );
    if (rows.length === 0) return null;
    return rowToTimeline(rows[0]!);
  },

  /** 获取项目的主时间线 */
  async getMainTimeline(projectId: string): Promise<StoryTimeline | null> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM story_timelines WHERE project_id = ? AND type = 'main' AND is_deleted = 0 LIMIT 1",
      [projectId],
    );
    if (rows.length === 0) return null;
    return rowToTimeline(rows[0]!);
  },

  /** 创建新时间线 */
  async createTimeline(input: CreateStoryTimelineInput): Promise<StoryTimeline> {
    const id = input.id || generateTimelineId();
    const now = Math.floor(Date.now() / 1000);
    const nowIso = new Date(now * 1000).toISOString();

    await safeRun(
      `INSERT INTO story_timelines
        (id, project_id, name, description, type,
         is_parallel, parent_timeline_id, merge_node_id,
         bindings_json, metadata_json,
         owner_id, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)`,
      [
        id,
        input.projectId ?? "default",
        input.name,
        input.description ?? "",
        input.type ?? "main",
        input.isParallel ? 1 : 0,
        input.parentTimelineId ?? null,
        input.mergeNodeId ?? null,
        JSON.stringify(input.bindings ?? {}),
        JSON.stringify(input.metadata ?? {}),
        now,
        now,
      ],
    );

    return {
      id,
      projectId: input.projectId ?? "default",
      name: input.name,
      description: input.description ?? "",
      type: input.type ?? "main",
      isParallel: input.isParallel ?? false,
      parentTimelineId: input.parentTimelineId,
      mergeNodeId: input.mergeNodeId,
      bindings: input.bindings ?? {},
      metadata: input.metadata ?? {},
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  },

  /** 更新时间线（部分更新） */
  async updateTimeline(id: string, patch: UpdateStoryTimelineInput): Promise<void> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    const fieldMap: Array<[keyof UpdateStoryTimelineInput, string]> = [
      ["projectId", "project_id"],
      ["name", "name"],
      ["description", "description"],
      ["type", "type"],
      ["parentTimelineId", "parent_timeline_id"],
      ["mergeNodeId", "merge_node_id"],
    ];

    for (const [key, col] of fieldMap) {
      if (patch[key] !== undefined) {
        sets.push(`${col} = ?`);
        params.push((patch[key] as string) ?? null);
      }
    }

    if (patch.isParallel !== undefined) {
      sets.push("is_parallel = ?");
      params.push(patch.isParallel ? 1 : 0);
    }
    if (patch.bindings !== undefined) {
      sets.push("bindings_json = ?");
      params.push(JSON.stringify(patch.bindings));
    }
    if (patch.metadata !== undefined) {
      sets.push("metadata_json = ?");
      params.push(JSON.stringify(patch.metadata));
    }

    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    params.push(Math.floor(Date.now() / 1000));
    params.push(id);

    await safeRun(
      `UPDATE story_timelines SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
  },

  /** 软删除时间线 */
  async deleteTimeline(id: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await safeRun(
      `UPDATE story_timelines SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id],
    );
  },

  /** 硬删除时间线（用于测试/清理） */
  async hardDeleteTimeline(id: string): Promise<void> {
    await safeRun(`DELETE FROM story_timelines WHERE id = ?`, [id]);
  },
};

/** 确保项目有主时间线，没有则创建 */
export async function ensureMainTimeline(projectId: string = "default"): Promise<StoryTimeline> {
  try {
    const existing = await timelineStorage.getMainTimeline(projectId);
    if (existing) return existing;
    return await timelineStorage.createTimeline({
      projectId,
      name: "主线",
      type: "main",
    });
  } catch (err) {
    errorLogger.warn("[TimelineStorage] 确保主时间线失败", err);
    throw err;
  }
}
