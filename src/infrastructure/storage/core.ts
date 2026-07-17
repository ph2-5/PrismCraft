import type { SyncEntityType, ChangeOperation } from "@/domain/types/sync";
import type { DbRunResult } from "@/domain/ports/sync-port";
import { isElectron } from "@/shared/utils/platform";
import { resolveImageUrl as _resolveImageUrl } from "@/shared/utils/image-url";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParse } from "@/shared/utils/safe-json";
import {
  getColumnKind,
  registerColumns,
} from "./schema-registry";
import {
  sanitizeTable,
  sanitizeIdentifier,
} from "./sql-sanitizer";
import { toSqlValue } from "@/shared/sql-safety";
export { toSqlValue };

export { isElectron };
export { _resolveImageUrl as resolveImageUrl };

export { SYNCABLE_TABLE_MAP } from "@/domain/types/sync";
export { errorLogger };
export type { DbRunResult };

type ChangeTracker = (
  entityType: SyncEntityType,
  entityId: string,
  operation: ChangeOperation,
) => Promise<void>;

let changeTracker: ChangeTracker | null = null;

export function registerChangeTracker(tracker: ChangeTracker): void {
  changeTracker = tracker;
}

export function unregisterChangeTracker(): void {
  changeTracker = null;
}

export async function trackChange(
  entityType: SyncEntityType,
  entityId: string,
  operation: ChangeOperation,
): Promise<void> {
  if (changeTracker) {
    try {
      await changeTracker(entityType, entityId, operation);
    } catch (error) {
      // 同步变更记录失败会导致多设备数据不一致，使用 error 级别确保可见
      errorLogger.error(
        `[Storage] trackChange failed for ${entityType}:${entityId} - ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

registerColumns("characters", [
  ["appearance", "json"],
  ["generation", "json"],
  ["config", "json"],
  ["meta", "json"],
  ["is_deleted", "boolean"],
]);

registerColumns("scenes", [
  ["appearance", "json"],
  ["atmosphere", "json"],
  ["generation", "json"],
  ["config", "json"],
  ["is_deleted", "boolean"],
]);

registerColumns("stories", [
  ["element_ids_json", "json"],
  ["element_bindings_json", "json"],
  ["style_guide_json", "json"],
  ["keyframe_chain_valid", "boolean"],
  ["is_deleted", "boolean"],
]);

registerColumns("story_beats", [
  ["character_ids_json", "json"],
  ["camera", "json"],
  ["generation", "json"],
  ["meta", "json"],
  ["keyframe_chain_valid", "boolean"],
]);

registerColumns("story_elements", [
  ["binding_config", "json"],
]);

registerColumns("story_versions", [
  ["beats_json", "json"],
  ["characters_json", "json"],
  ["scenes_json", "json"],
  ["auto_saved", "boolean"],
]);

registerColumns("elements", [
  ["character_config_json", "json"],
  ["scene_config_json", "json"],
  ["feature_anchor_json", "json"],
  ["reference_image_quality_json", "json"],
  ["bindings_json", "json"],
]);

registerColumns("character_outfits", [
  ["accessories_json", "json"],
  ["is_default", "boolean"],
]);

registerColumns("video_tasks", [
  ["config", "json"],
  ["provider", "json"],
  ["media_refs", "json"],
  ["tracking", "json"],
  ["is_deleted", "boolean"],
]);

registerColumns("video_templates", [
  ["shots_json", "json"],
  ["tags", "json"],
]);

registerColumns("media_assets", [
  ["tags", "json"],
]);

registerColumns("storyboard_assets", [
  ["character_ids", "json"],
]);

registerColumns("collections", []);

registerColumns("generation_tasks", [
  ["input_params", "json"],
]);

registerColumns("auto_saves", [
  ["data_json", "json"],
]);

registerColumns("file_index", [
  ["is_temporary", "boolean"],
]);

registerColumns("video_cache", []);

registerColumns("ast_templates", [
  ["tags", "json"],
  ["is_public", "boolean"],
]);

registerColumns("sync_changelog", [
  ["vector_clock", "json"],
  ["data", "json"],
]);

registerColumns("sync_conflict_backup", [
  ["local_data", "json"],
  ["remote_data", "json"],
]);

// Task 2A.7: novel_projects 表 JSON 列
registerColumns("novel_projects", [
  ["pipeline_state_json", "json"],
  ["is_deleted", "boolean"],
]);

// Task 2A.8: props 表 JSON 列
registerColumns("props", [
  ["tags_json", "json"],
  ["metadata_json", "json"],
  ["is_deleted", "boolean"],
]);

export function parseRecord(
  record: Record<string, unknown>,
  table?: string,
): Record<string, unknown> {
  if (table) {
    return parseRecordWithTable(record, table);
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if ((value === 0 || value === 1 || value === "0" || value === "1") && key.startsWith("is_")) {
      result[key] = value === 1 || value === "1";
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function parseRecordWithTable(
  record: Record<string, unknown>,
  table: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const kind = getColumnKind(table, key);

    if (kind === "boolean") {
      result[key] = value === 1 || value === "1" || value === true;
    } else if (kind === "json") {
      result[key] = safeJsonParse(value, null);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function parseRecords(
  records: Record<string, unknown>[],
  table?: string,
): Record<string, unknown>[] {
  if (table) {
    return records.map((r) => parseRecordWithTable(r, table));
  }
  return records.map((r) => parseRecord(r));
}

export interface FixedColumnTarget {
  type: "fixed";
  column: string;
}

export interface JsonContainerTarget {
  type: "json";
  container: string;
  key: string;
}

export type FieldTarget = FixedColumnTarget | JsonContainerTarget;

export type FieldValueProcessor = (value: unknown, target: FieldTarget) => unknown;

export function buildUpdateSets(
  data: Record<string, unknown>,
  fieldTargets: Record<string, FieldTarget>,
  options?: {
    valueProcessor?: FieldValueProcessor;
  },
): { sql: string; params: unknown[] } {
  const fixedSets: string[] = [];
  const fixedValues: unknown[] = [];
  const containerUpdates: Record<string, Array<{ key: string; value: unknown }>> = {};

  for (const [jsKey, target] of Object.entries(fieldTargets)) {
    const value = data[jsKey];
    if (value === undefined) continue;

    const processedValue = options?.valueProcessor
      ? options.valueProcessor(value, target)
      : value;

    if (target.type === "fixed") {
      fixedSets.push(`${sanitizeIdentifier(target.column)} = ?`);
      fixedValues.push(processedValue === null || processedValue === undefined ? null : processedValue);
    } else {
      const containerKey = target.container;
      if (!containerUpdates[containerKey]) {
        containerUpdates[containerKey] = [];
      }
      containerUpdates[containerKey].push({ key: target.key, value: processedValue });
    }
  }

  const allSets: string[] = [...fixedSets];
  const allValues: unknown[] = [...fixedValues];

  for (const [container, fields] of Object.entries(containerUpdates)) {
    const { sql: jsonSql, params: jsonParams } = buildJsonSet(container, fields);
    allSets.push(jsonSql);
    allValues.push(...jsonParams);
  }

  return { sql: allSets.join(", "), params: allValues };
}

export function buildInsertFromTargets(
  table: string,
  data: Record<string, unknown>,
  fieldTargets: Record<string, FieldTarget>,
  baseColumns: string[],
  baseValues: unknown[],
  options?: {
    valueProcessor?: FieldValueProcessor;
    conflictStrategy?: "IGNORE" | "REPLACE" | "ABORT";
  },
): { sql: string; params: unknown[] } {
  const columns = [...baseColumns];
  const values = [...baseValues];
  const containers: Record<string, Record<string, unknown>> = {};

  for (const [jsKey, target] of Object.entries(fieldTargets)) {
    const value = data[jsKey];
    if (value === undefined) continue;

    const processedValue = options?.valueProcessor
      ? options.valueProcessor(value, target)
      : value;

    if (target.type === "fixed") {
      columns.push(target.column);
      values.push(processedValue === null || processedValue === undefined ? null : processedValue);
    } else {
      const containerKey = target.container;
      if (!containers[containerKey]) {
        containers[containerKey] = {};
      }
      containers[containerKey][target.key] = processedValue;
    }
  }

  for (const [container, containerData] of Object.entries(containers)) {
    columns.push(container);
    values.push(toSqlValue(containerData));
  }

  return buildInsert(table, columns, values, options?.conflictStrategy ?? "IGNORE");
}

export function buildJsonSet(
  container: string,
  fields: Array<{ key: string; value: unknown }>,
): { sql: string; params: unknown[] } {
  const safeContainer = sanitizeIdentifier(container);
  const params: unknown[] = [];

  if (fields.length === 1) {
    const field = fields[0];
    const fieldValue = field?.value === null || field?.value === undefined ? null : field.value;
    params.push(fieldValue);
    const sql = `${safeContainer} = json_set(COALESCE(${safeContainer}, '{}'), '$.${field?.key ?? ""}', ?)`;
    return { sql, params };
  }

  const patchObj: Record<string, unknown> = {};
  for (const field of fields) {
    patchObj[field.key] = field.value === null || field.value === undefined ? null : field.value;
  }
  params.push(JSON.stringify(patchObj));
  const sql = `${safeContainer} = json_patch(COALESCE(${safeContainer}, '{}'), json(?))`;
  return { sql, params };
}

export function buildInsert(
  table: string,
  columns: string[],
  values: unknown[],
  conflictStrategy: "IGNORE" | "REPLACE" | "ABORT" = "IGNORE",
): { sql: string; params: unknown[] } {
  if (columns.length !== values.length) {
    throw new Error(
      `[buildInsert] ${table}: ${values.length} values for ${columns.length} columns`,
    );
  }
  const safeTable = sanitizeTable(table);
  const quoted = columns.map(sanitizeIdentifier).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const conflict =
    conflictStrategy === "IGNORE"
      ? " OR IGNORE"
      : conflictStrategy === "REPLACE"
        ? " OR REPLACE"
        : "";
  return {
    sql: `INSERT${conflict} INTO ${safeTable} (${quoted}) VALUES (${placeholders})`,
    params: values,
  };
}
