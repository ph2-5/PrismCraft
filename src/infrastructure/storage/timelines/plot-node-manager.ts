/**
 * Q3-3 — PlotNode Storage
 *
 * 剧情节点的持久化存储。每个 PlotNode 对应一个 NovelSegment，
 * 包含剧情事件 + 状态快照 + 状态转换 + 时间线绑定。
 *
 * 表结构：plot_nodes（见 electron/src/database/db-schema.ts）
 *   - id (TEXT PRIMARY KEY)
 *   - timeline_id (TEXT, FK story_timelines(id) ON DELETE CASCADE)
 *   - order_num / chapter_index / chapter_title / segment_id / beat_id
 *   - plot_event_type / plot_event_description / plot_event_parameters_json / ai_analysis_json
 *   - character_snapshots_json / scene_snapshots_json
 *   - transitions_json / bindings_json
 *   - snapshot_strategy / cached_prompt / metadata_json
 *   - BASE_COLUMNS
 *
 * 访问模式：通过 DI container（container.plotNodeStorage）访问。
 */

import { safeQuery, safeRun } from "../sqlite-core";
import { parseRecordWithTable } from "../core";
import type {
  PlotNode,
  CreatePlotNodeInput,
  UpdatePlotNodeInput,
  PlotEventType,
  SnapshotStrategy,
} from "@/domain/schemas";

/** DB 行 → PlotNode 域对象 */
function rowToNode(row: Record<string, unknown>): PlotNode {
  const parsed = parseRecordWithTable(row, "plot_nodes");

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

  const parseJsonArray = (raw: unknown): Record<string, unknown>[] => {
    if (Array.isArray(raw)) return raw as Record<string, unknown>[];
    if (typeof raw === "string") {
      try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const tsToString = (v: unknown): string => {
    if (!v) return new Date().toISOString();
    if (typeof v === "number") return new Date(v * 1000).toISOString();
    return String(v);
  };

  return {
    id: String(parsed.id ?? ""),
    timelineId: String(parsed.timeline_id ?? ""),
    order: Number(parsed.order_num ?? 0),
    chapterIndex: parsed.chapter_index != null ? Number(parsed.chapter_index) : undefined,
    chapterTitle: parsed.chapter_title ? String(parsed.chapter_title) : undefined,
    segmentId: parsed.segment_id ? String(parsed.segment_id) : undefined,
    beatId: parsed.beat_id ? String(parsed.beat_id) : undefined,
    plotEventType: (parsed.plot_event_type as PlotEventType) ?? "narration",
    plotEventDescription: String(parsed.plot_event_description ?? ""),
    plotEventParameters: parseJson(parsed.plot_event_parameters_json),
    aiAnalysis: parsed.ai_analysis_json != null ? parseJson(parsed.ai_analysis_json) : undefined,
    characterSnapshots: parseJsonArray(parsed.character_snapshots_json),
    sceneSnapshots: parseJsonArray(parsed.scene_snapshots_json),
    transitions: parseJsonArray(parsed.transitions_json),
    bindings: parseJsonArray(parsed.bindings_json),
    snapshotStrategy: (parsed.snapshot_strategy as SnapshotStrategy) ?? "active",
    cachedPrompt: parsed.cached_prompt ? String(parsed.cached_prompt) : undefined,
    metadata: parseJson(parsed.metadata_json),
    createdAt: tsToString(parsed.created_at),
    updatedAt: tsToString(parsed.updated_at),
  };
}

function generateNodeId(): string {
  return `plot-node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 归一化 CreatePlotNodeInput，应用默认值。
 * 提取为独立函数以降低 createNode 圈复杂度（避免重复的 ?? 操作符）。
 */
function normalizeCreateInput(input: CreatePlotNodeInput) {
  return {
    chapterIndex: input.chapterIndex,
    chapterTitle: input.chapterTitle,
    segmentId: input.segmentId,
    beatId: input.beatId,
    plotEventType: input.plotEventType ?? "narration",
    plotEventDescription: input.plotEventDescription ?? "",
    plotEventParameters: input.plotEventParameters ?? {},
    aiAnalysis: input.aiAnalysis,
    characterSnapshots: input.characterSnapshots ?? [],
    sceneSnapshots: input.sceneSnapshots ?? [],
    transitions: input.transitions ?? [],
    bindings: input.bindings ?? [],
    snapshotStrategy: input.snapshotStrategy ?? "active",
    cachedPrompt: input.cachedPrompt,
    metadata: input.metadata ?? {},
  };
}

export const plotNodeStorage = {
  /** 获取时间线的所有节点（按 order_num 排序） */
  async getNodesForTimeline(timelineId: string): Promise<PlotNode[]> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM plot_nodes WHERE timeline_id = ? AND is_deleted = 0 ORDER BY order_num ASC",
      [timelineId],
    );
    return rows.map(rowToNode);
  },

  /** 获取所有节点 */
  async getAllNodes(): Promise<PlotNode[]> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM plot_nodes WHERE is_deleted = 0 ORDER BY timeline_id, order_num",
    );
    return rows.map(rowToNode);
  },

  /** 获取单个节点 */
  async getNodeById(id: string): Promise<PlotNode | null> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM plot_nodes WHERE id = ? AND is_deleted = 0",
      [id],
    );
    if (rows.length === 0) return null;
    return rowToNode(rows[0]!);
  },

  /** 按 segmentId 查找节点 */
  async getNodeBySegment(segmentId: string): Promise<PlotNode | null> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM plot_nodes WHERE segment_id = ? AND is_deleted = 0 LIMIT 1",
      [segmentId],
    );
    if (rows.length === 0) return null;
    return rowToNode(rows[0]!);
  },

  /** 按 beatId 查找节点 */
  async getNodeByBeat(beatId: string): Promise<PlotNode | null> {
    const rows = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM plot_nodes WHERE beat_id = ? AND is_deleted = 0 LIMIT 1",
      [beatId],
    );
    if (rows.length === 0) return null;
    return rowToNode(rows[0]!);
  },

  /** 创建新节点 */
  async createNode(input: CreatePlotNodeInput): Promise<PlotNode> {
    const id = input.id || generateNodeId();
    const now = Math.floor(Date.now() / 1000);
    const nowIso = new Date(now * 1000).toISOString();
    const normalized = normalizeCreateInput(input);

    await safeRun(
      `INSERT INTO plot_nodes
        (id, timeline_id, order_num, chapter_index, chapter_title,
         segment_id, beat_id,
         plot_event_type, plot_event_description, plot_event_parameters_json, ai_analysis_json,
         character_snapshots_json, scene_snapshots_json,
         transitions_json, bindings_json,
         snapshot_strategy, cached_prompt, metadata_json,
         owner_id, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)`,
      [
        id,
        input.timelineId,
        input.order,
        normalized.chapterIndex ?? null,
        normalized.chapterTitle ?? null,
        normalized.segmentId ?? null,
        normalized.beatId ?? null,
        normalized.plotEventType,
        normalized.plotEventDescription,
        JSON.stringify(normalized.plotEventParameters),
        normalized.aiAnalysis != null ? JSON.stringify(normalized.aiAnalysis) : null,
        JSON.stringify(normalized.characterSnapshots),
        JSON.stringify(normalized.sceneSnapshots),
        JSON.stringify(normalized.transitions),
        JSON.stringify(normalized.bindings),
        normalized.snapshotStrategy,
        normalized.cachedPrompt ?? null,
        JSON.stringify(normalized.metadata),
        now,
        now,
      ],
    );

    return {
      id,
      timelineId: input.timelineId,
      order: input.order,
      chapterIndex: input.chapterIndex,
      chapterTitle: input.chapterTitle,
      segmentId: input.segmentId,
      beatId: input.beatId,
      plotEventType: normalized.plotEventType,
      plotEventDescription: normalized.plotEventDescription,
      plotEventParameters: normalized.plotEventParameters,
      aiAnalysis: input.aiAnalysis,
      characterSnapshots: normalized.characterSnapshots,
      sceneSnapshots: normalized.sceneSnapshots,
      transitions: normalized.transitions,
      bindings: normalized.bindings,
      snapshotStrategy: normalized.snapshotStrategy,
      cachedPrompt: input.cachedPrompt,
      metadata: normalized.metadata,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  },

  /** 更新节点（部分更新） */
  async updateNode(id: string, patch: UpdatePlotNodeInput): Promise<void> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    const fieldMap: Array<[keyof UpdatePlotNodeInput, string]> = [
      ["order", "order_num"],
      ["chapterIndex", "chapter_index"],
      ["chapterTitle", "chapter_title"],
      ["segmentId", "segment_id"],
      ["beatId", "beat_id"],
      ["plotEventType", "plot_event_type"],
      ["plotEventDescription", "plot_event_description"],
      ["snapshotStrategy", "snapshot_strategy"],
      ["cachedPrompt", "cached_prompt"],
    ];

    for (const [key, col] of fieldMap) {
      if (patch[key] !== undefined) {
        sets.push(`${col} = ?`);
        const value = patch[key];
        if (typeof value === "number") {
          params.push(value);
        } else {
          params.push((value as string) ?? null);
        }
      }
    }

    // JSON 列
    if (patch.plotEventParameters !== undefined) {
      sets.push("plot_event_parameters_json = ?");
      params.push(JSON.stringify(patch.plotEventParameters));
    }
    if (patch.aiAnalysis !== undefined) {
      sets.push("ai_analysis_json = ?");
      params.push(patch.aiAnalysis ? JSON.stringify(patch.aiAnalysis) : null);
    }
    if (patch.characterSnapshots !== undefined) {
      sets.push("character_snapshots_json = ?");
      params.push(JSON.stringify(patch.characterSnapshots));
    }
    if (patch.sceneSnapshots !== undefined) {
      sets.push("scene_snapshots_json = ?");
      params.push(JSON.stringify(patch.sceneSnapshots));
    }
    if (patch.transitions !== undefined) {
      sets.push("transitions_json = ?");
      params.push(JSON.stringify(patch.transitions));
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
      `UPDATE plot_nodes SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
  },

  /** 软删除节点 */
  async deleteNode(id: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await safeRun(
      `UPDATE plot_nodes SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id],
    );
  },

  /** 删除时间线的所有节点（硬删除，用于级联清理） */
  async deleteNodesForTimeline(timelineId: string): Promise<void> {
    await safeRun(`DELETE FROM plot_nodes WHERE timeline_id = ?`, [timelineId]);
  },

  /** 获取时间线节点数 */
  async getNodeCount(timelineId: string): Promise<number> {
    const rows = await safeQuery<{ count: number }>(
      "SELECT COUNT(*) as count FROM plot_nodes WHERE timeline_id = ? AND is_deleted = 0",
      [timelineId],
    );
    return rows[0]?.count ?? 0;
  },
};
