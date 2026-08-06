/**
 * usage-repository.ts — AI 调用用量记录仓储（cost-tracking P0）
 *
 * 设计来源：docs/DESIGN-COST-TRACKING.md（v0.2）
 * 职责：usage_records 表的参数化读写；仅主进程使用（与 db 同进程，无跨进程通道问题）。
 * 失败语义：本模块不主动 throw——上层 usage-tracker 负责静默降级（R195）。
 */
import { randomUUID } from "node:crypto";
import { getLogger } from "../logging/logger";
import { getDb } from "./db-connection";

const logger = getLogger("usage-repository");

/** 用量记录输入（与 usage_records 表字段一一对应） */
export interface UsageRecordInput {
  direction: "video" | "image" | "text";
  providerId: string;
  modelId: string;
  /** 计费参数（按 direction 取舍） */
  durationSeconds?: number;
  resolution?: string;
  imageCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** 本地定价引擎估算成本（元） */
  estimatedCost?: number;
  /** 关联实体（可空，生成服务层回填） */
  storyId?: string;
  beatId?: string;
  taskId?: string;
  source?: "manual" | "batch" | "workflow";
  status?: "succeeded" | "failed" | "cancelled";
  /** 额外参数快照（JSON 字符串） */
  paramsJson?: string;
  errorMessage?: string;
  /** 调用时刻（Unix 秒） */
  calledAt: number;
}

/** 已落库的记录（含 id） */
export interface UsageRecord extends UsageRecordInput {
  id: string;
}

function toRow(input: UsageRecordInput): Record<string, unknown> {
  return {
    direction: input.direction,
    provider_id: input.providerId,
    model_id: input.modelId,
    duration_seconds: input.durationSeconds ?? null,
    resolution: input.resolution ?? null,
    image_count: input.imageCount ?? null,
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
    estimated_cost: input.estimatedCost ?? null,
    status: input.status ?? "succeeded",
    story_id: input.storyId ?? null,
    beat_id: input.beatId ?? null,
    task_id: input.taskId ?? null,
    source: input.source ?? "manual",
    params_json: input.paramsJson ?? "{}",
    error_message: input.errorMessage ?? null,
    called_at: input.calledAt,
  };
}

/** 单条插入；返回新 id，失败返回 null（不 throw，供上层静默降级） */
export function insertUsage(input: UsageRecordInput): string | null {
  try {
    const id = randomUUID();
    const row = toRow(input);
    const columns = ["id", ...Object.keys(row)];
    const placeholders = columns.map(() => "?").join(", ");
    const values = [id, ...Object.values(row)];

    getDb()
      .prepare(
        `INSERT INTO usage_records (${columns.map((c) => `"${c}"`).join(", ")})
         VALUES (${placeholders})`,
      )
      .run(...values);
    return id;
  } catch (e) {
    logger.warn(`usage insert failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** 批量插入（环形缓冲批写）；返回成功条数，失败条数内部计数并告警 */
export function insertUsageBatch(inputs: UsageRecordInput[]): number {
  if (inputs.length === 0) return 0;
  let inserted = 0;
  try {
    const db = getDb();
    const runTx = db.transaction(() => {
      for (const input of inputs) {
        const id = randomUUID();
        const row = toRow(input);
        const columns = ["id", ...Object.keys(row)];
        const placeholders = columns.map(() => "?").join(", ");
        db.prepare(
          `INSERT INTO usage_records (${columns.map((c) => `"${c}"`).join(", ")})
           VALUES (${placeholders})`,
        ).run(id, ...Object.values(row));
        inserted += 1;
      }
    }) as () => void;
    runTx();
  } catch (e) {
    logger.warn(`usage batch insert failed after ${inserted}/${inputs.length}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return inserted;
}

/** 更新记录状态（失败任务成本处置，v0.2）；返回是否成功 */
export function updateUsageStatus(id: string, status: UsageRecordInput["status"], errorMessage?: string): boolean {
  try {
    const db = getDb();
    if (errorMessage !== undefined) {
      db.prepare(`UPDATE usage_records SET status = ?, error_message = ?, updated_at = (strftime('%s','now')) WHERE id = ?`)
        .run(status ?? "succeeded", errorMessage, id);
    } else {
      db.prepare(`UPDATE usage_records SET status = ?, updated_at = (strftime('%s','now')) WHERE id = ?`)
        .run(status ?? "succeeded", id);
    }
    return true;
  } catch (e) {
    logger.warn(`usage status update failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** 按任务关联回填实体（story_id/beat_id），生成服务层调用 */
export function attachUsageEntity(usageId: string, storyId?: string, beatId?: string): boolean {
  try {
    getDb()
      .prepare(
        `UPDATE usage_records
         SET story_id = COALESCE(?, story_id), beat_id = COALESCE(?, beat_id),
             updated_at = (strftime('%s','now'))
         WHERE id = ?`,
      )
      .run(storyId ?? null, beatId ?? null, usageId);
    return true;
  } catch (e) {
    logger.warn(`usage entity attach failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** 时间范围聚合（成本看板数据源） */
export interface UsageAggregate {
  totalEstimatedCost: number;
  succeededCost: number;
  failedCost: number;
  recordCount: number;
}

export function aggregateUsage(startTime: number, endTime: number): UsageAggregate {
  try {
    const row = getDb()
      .prepare(
        `SELECT
           COALESCE(SUM(estimated_cost), 0) AS total,
           COALESCE(SUM(CASE WHEN status = 'succeeded' THEN estimated_cost ELSE 0 END), 0) AS succeeded,
           COALESCE(SUM(CASE WHEN status != 'succeeded' THEN estimated_cost ELSE 0 END), 0) AS failed,
           COUNT(*) AS count
         FROM usage_records
         WHERE called_at >= ? AND called_at <= ? AND is_deleted = 0`,
      )
      .get(startTime, endTime) as { total: number; succeeded: number; failed: number; count: number } | undefined;

    return {
      totalEstimatedCost: row?.total ?? 0,
      succeededCost: row?.succeeded ?? 0,
      failedCost: row?.failed ?? 0,
      recordCount: row?.count ?? 0,
    };
  } catch (e) {
    logger.warn(`usage aggregate failed: ${e instanceof Error ? e.message : String(e)}`);
    return { totalEstimatedCost: 0, succeededCost: 0, failedCost: 0, recordCount: 0 };
  }
}

/** 成本看板汇总（P1）：总量（双口径）+ 按提供商 + 按生成类型 */
export interface UsageSummary {
  totalEstimatedCost: number;
  effectiveCost: number;
  failedCost: number;
  recordCount: number;
  byProvider: Array<{ providerId: string; cost: number; effectiveCost: number; count: number }>;
  byDirection: Array<{ direction: string; cost: number; count: number }>;
}

export function summarizeUsage(startTime: number, endTime: number): UsageSummary {
  const empty: UsageSummary = {
    totalEstimatedCost: 0,
    effectiveCost: 0,
    failedCost: 0,
    recordCount: 0,
    byProvider: [],
    byDirection: [],
  };
  try {
    const db = getDb();
    const total = db
      .prepare(
        `SELECT
           COALESCE(SUM(estimated_cost), 0) AS total,
           COALESCE(SUM(CASE WHEN status = 'succeeded' THEN estimated_cost ELSE 0 END), 0) AS effective,
           COALESCE(SUM(CASE WHEN status != 'succeeded' THEN estimated_cost ELSE 0 END), 0) AS failed,
           COUNT(*) AS count
         FROM usage_records
         WHERE called_at >= ? AND called_at <= ? AND is_deleted = 0`,
      )
      .get(startTime, endTime) as { total: number; effective: number; failed: number; count: number } | undefined;

    const byProvider = db
      .prepare(
        `SELECT provider_id AS providerId,
           COALESCE(SUM(estimated_cost), 0) AS cost,
           COALESCE(SUM(CASE WHEN status = 'succeeded' THEN estimated_cost ELSE 0 END), 0) AS effectiveCost,
           COUNT(*) AS count
         FROM usage_records
         WHERE called_at >= ? AND called_at <= ? AND is_deleted = 0
         GROUP BY provider_id
         ORDER BY cost DESC`,
      )
      .all(startTime, endTime) as Array<{ providerId: string; cost: number; effectiveCost: number; count: number }>;

    const byDirection = db
      .prepare(
        `SELECT direction,
           COALESCE(SUM(estimated_cost), 0) AS cost,
           COUNT(*) AS count
         FROM usage_records
         WHERE called_at >= ? AND called_at <= ? AND is_deleted = 0
         GROUP BY direction`,
      )
      .all(startTime, endTime) as Array<{ direction: string; cost: number; count: number }>;

    return {
      totalEstimatedCost: total?.total ?? 0,
      effectiveCost: total?.effective ?? 0,
      failedCost: total?.failed ?? 0,
      recordCount: total?.count ?? 0,
      byProvider: byProvider ?? [],
      byDirection: byDirection ?? [],
    };
  } catch (e) {
    logger.warn(`usage summarize failed: ${e instanceof Error ? e.message : String(e)}`);
    return empty;
  }
}
