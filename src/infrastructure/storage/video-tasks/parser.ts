import type { VideoTask } from "@/domain/schemas";
import { parseConfig, parseProvider, parseMediaRefs, parseTracking } from "./json-schemas";
import { errorLogger } from "@/shared/error-logger";

const TIMESTAMP_THRESHOLD = 1e12;

const VALID_TASK_STATUS = new Set(["pending", "generating", "completed", "failed", "cancelled", "retrying", "timeout"]);

function normalizeTaskStatus(raw: unknown): VideoTask["status"] {
  if (raw == null) return "pending";
  const str = String(raw);
  if (str === "processing") return "generating";
  if (VALID_TASK_STATUS.has(str)) return str as VideoTask["status"];
  return "pending";
}

export function toStorageStatus(status: string): string {
  return status;
}

export function normalizeTimestamp(value: unknown, fallbackSec: number): string {
  if (value === null || value === undefined) return new Date(fallbackSec * 1000).toISOString();
  const num = Number(value);
  if (Number.isNaN(num)) return new Date(fallbackSec * 1000).toISOString();
  return new Date(num > TIMESTAMP_THRESHOLD ? num : num * 1000).toISOString();
}

export function toStorageTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const ms = new Date(value).getTime();
    if (Number.isNaN(ms)) return null;
    return Math.floor(ms / 1000);
  }
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return num > TIMESTAMP_THRESHOLD ? Math.floor(num / 1000) : Math.floor(num);
}

export function toStorageTimestampOrNow(value: unknown): number {
  return toStorageTimestamp(value) ?? Math.floor(Date.now() / 1000);
}

function optionalString(value: unknown): string | undefined {
  return value != null ? String(value) : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return value != null ? Number(value) : undefined;
}

function parseParametersField(parameters: unknown): Record<string, unknown> | undefined {
  if (!parameters) return undefined;
  if (typeof parameters === "string") {
    try {
      return JSON.parse(parameters) as Record<string, unknown>;
    } catch (e) {
      errorLogger.warn("[VideoTaskParser] parameters JSON parse failed", e);
      return undefined;
    }
  }
  return parameters as Record<string, unknown>;
}

export function parseVideoTask(record: Record<string, unknown>): VideoTask {
  const config = parseConfig(record.config as string | null | undefined);
  const provider = parseProvider(record.provider as string | null | undefined);
  const mediaRefs = parseMediaRefs(record.media_refs as string | null | undefined);
  const tracking = parseTracking(record.tracking as string | null | undefined);

  return {
    taskId: String(record.id || ""),
    status: normalizeTaskStatus(record.status),
    progress: Number(record.progress || 0),
    videoUrl: optionalString(record.video_url),
    localVideoPath: optionalString(record.local_video_path),
    message: String(record.message || ""),
    createdAt: normalizeTimestamp(record.created_at, 0),
    updatedAt: normalizeTimestamp(record.updated_at, 0),
    expiresAt: tracking.expires_at ? normalizeTimestamp(tracking.expires_at, 0) : undefined,
    lastPolledAt: tracking.last_polled_at ? normalizeTimestamp(tracking.last_polled_at, 0) : undefined,
    pollFailureCount: Number(tracking.poll_failure_count || 0),
    pollCount: Number(tracking.poll_count || 0),
    recoveryAttempts: Number(tracking.recovery_attempts || 0),
    beatId: optionalString(record.beat_id),
    storyId: optionalString(record.story_id),
    providerId: optionalString(provider.provider_id),
    providerModelId: optionalString(provider.provider_model_id),
    providerFormat: optionalString(provider.provider_format),
    model: optionalString(config.model),
    prompt: optionalString(config.prompt),
    parameters: parseParametersField(config.parameters),
    fixedImageUrl: optionalString(mediaRefs.fixed_image_url),
    fixedImageLockType: optionalString(mediaRefs.fixed_image_lock_type) as "character" | "scene" | undefined,
    referenceVideoUrl: optionalString(mediaRefs.reference_video_url),
    referenceVideoMimicryLevel: optionalString(mediaRefs.reference_video_mimicry_level) as "light" | "medium" | "deep" | undefined,
    templateId: optionalString(config.template_id),
    templateShots: optionalString(config.template_shots),
    storyTitle: optionalString(config.story_title),
    beatTitle: optionalString(config.beat_title),
    apiUrl: optionalString(provider.api_url),
    apiEndpoint: optionalString(provider.api_endpoint),
    urlObtainedAt: optionalNumber(tracking.url_obtained_at),
    urlTtl: optionalNumber(tracking.url_ttl),
  };
}

export interface FixedColumnTarget {
  type: "fixed";
  column: string;
}

export interface JsonContainerTarget {
  type: "json";
  container: "config" | "provider" | "media_refs" | "tracking";
  key: string;
}

export type FieldTarget = FixedColumnTarget | JsonContainerTarget;

export const fieldTargets: Record<string, FieldTarget> = {
  status: { type: "fixed", column: "status" },
  progress: { type: "fixed", column: "progress" },
  videoUrl: { type: "fixed", column: "video_url" },
  localVideoPath: { type: "fixed", column: "local_video_path" },
  message: { type: "fixed", column: "message" },
  storyId: { type: "fixed", column: "story_id" },
  beatId: { type: "fixed", column: "beat_id" },
  model: { type: "json", container: "config", key: "model" },
  prompt: { type: "json", container: "config", key: "prompt" },
  parameters: { type: "json", container: "config", key: "parameters" },
  templateId: { type: "json", container: "config", key: "template_id" },
  templateShots: { type: "json", container: "config", key: "template_shots" },
  storyTitle: { type: "json", container: "config", key: "story_title" },
  beatTitle: { type: "json", container: "config", key: "beat_title" },
  apiUrl: { type: "json", container: "provider", key: "api_url" },
  apiEndpoint: { type: "json", container: "provider", key: "api_endpoint" },
  providerId: { type: "json", container: "provider", key: "provider_id" },
  providerModelId: { type: "json", container: "provider", key: "provider_model_id" },
  providerFormat: { type: "json", container: "provider", key: "provider_format" },
  fixedImageUrl: { type: "json", container: "media_refs", key: "fixed_image_url" },
  fixedImageLockType: { type: "json", container: "media_refs", key: "fixed_image_lock_type" },
  referenceVideoUrl: { type: "json", container: "media_refs", key: "reference_video_url" },
  referenceVideoMimicryLevel: { type: "json", container: "media_refs", key: "reference_video_mimicry_level" },
  lastPolledAt: { type: "json", container: "tracking", key: "last_polled_at" },
  pollCount: { type: "json", container: "tracking", key: "poll_count" },
  pollFailureCount: { type: "json", container: "tracking", key: "poll_failure_count" },
  recoveryAttempts: { type: "json", container: "tracking", key: "recovery_attempts" },
  expiresAt: { type: "json", container: "tracking", key: "expires_at" },
  urlObtainedAt: { type: "json", container: "tracking", key: "url_obtained_at" },
  urlTtl: { type: "json", container: "tracking", key: "url_ttl" },
};

export function buildConfigJson(task: Partial<VideoTask>): string {
  const config: Record<string, unknown> = {};
  if (task.model !== undefined) config.model = task.model || null;
  if (task.prompt !== undefined) config.prompt = task.prompt || null;
  if (task.parameters !== undefined) config.parameters = task.parameters ? JSON.stringify(task.parameters) : null;
  if (task.templateId !== undefined) config.template_id = task.templateId || null;
  if (task.templateShots !== undefined) config.template_shots = task.templateShots || null;
  if (task.storyTitle !== undefined) config.story_title = task.storyTitle || null;
  if (task.beatTitle !== undefined) config.beat_title = task.beatTitle || null;
  return JSON.stringify(config);
}

export function buildProviderJson(task: Partial<VideoTask>): string {
  const provider: Record<string, unknown> = {};
  if (task.apiUrl !== undefined) provider.api_url = task.apiUrl || null;
  if (task.apiEndpoint !== undefined) provider.api_endpoint = task.apiEndpoint || null;
  if (task.providerId !== undefined) provider.provider_id = task.providerId || null;
  if (task.providerModelId !== undefined) provider.provider_model_id = task.providerModelId || null;
  if (task.providerFormat !== undefined) provider.provider_format = task.providerFormat || null;
  return JSON.stringify(provider);
}

export function buildMediaRefsJson(task: Partial<VideoTask>): string {
  const mediaRefs: Record<string, unknown> = {};
  if (task.fixedImageUrl !== undefined) mediaRefs.fixed_image_url = task.fixedImageUrl || null;
  if (task.fixedImageLockType !== undefined) mediaRefs.fixed_image_lock_type = task.fixedImageLockType || null;
  if (task.referenceVideoUrl !== undefined) mediaRefs.reference_video_url = task.referenceVideoUrl || null;
  if (task.referenceVideoMimicryLevel !== undefined) mediaRefs.reference_video_mimicry_level = task.referenceVideoMimicryLevel || null;
  return JSON.stringify(mediaRefs);
}

export function buildTrackingJson(task: Partial<VideoTask>, createdAtSec?: number): string {
  const tracking: Record<string, unknown> = {};
  const nowSec = Math.floor(Date.now() / 1000);
  if (task.expiresAt !== undefined) {
    tracking.expires_at = toStorageTimestamp(task.expiresAt) ?? (createdAtSec ?? nowSec) + 30 * 24 * 60 * 60;
  } else if (createdAtSec !== undefined) {
    tracking.expires_at = createdAtSec + 30 * 24 * 60 * 60;
  }
  if (task.lastPolledAt !== undefined) tracking.last_polled_at = toStorageTimestamp(task.lastPolledAt);
  if (task.pollCount !== undefined) tracking.poll_count = task.pollCount || 0;
  if (task.pollFailureCount !== undefined) tracking.poll_failure_count = task.pollFailureCount || 0;
  if (task.recoveryAttempts !== undefined) tracking.recovery_attempts = task.recoveryAttempts || 0;
  if (task.urlObtainedAt !== undefined) tracking.url_obtained_at = task.urlObtainedAt;
  if (task.urlTtl !== undefined) tracking.url_ttl = task.urlTtl;
  if (task.videoUrl) tracking.url_obtained_at = nowSec;
  return JSON.stringify(tracking);
}

function processFixedValue(jsKey: string, value: unknown): unknown {
  if (jsKey === "status" && typeof value === "string") {
    return toStorageStatus(value);
  }
  return value;
}

function processTrackingValue(key: string, value: unknown): unknown {
  if (key !== "last_polled_at" && key !== "expires_at") return value;
  if (typeof value === "string") return toStorageTimestamp(value) ?? value;
  if (typeof value === "number" && value > 1e12) return Math.floor(value / 1000);
  return value;
}

function processJsonValue(target: JsonContainerTarget, value: unknown): unknown {
  if (target.container === "tracking") {
    return processTrackingValue(target.key, value);
  }
  if (target.key === "parameters" && typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return value;
}

export function buildUpdateSets(updates: Partial<VideoTask>): { sql: string; params: unknown[] } {
  const fixedSets: string[] = [];
  const fixedValues: unknown[] = [];
  const containerUpdates: Record<string, Array<{ key: string; value: unknown }>> = {};

  for (const [jsKey, target] of Object.entries(fieldTargets)) {
    const value = (updates as Record<string, unknown>)[jsKey];
    if (value === undefined) continue;

    if (target.type === "fixed") {
      const processedValue = processFixedValue(jsKey, value);
      fixedSets.push(`${target.column} = ?`);
      fixedValues.push(processedValue === null || processedValue === undefined ? null : processedValue);
    } else {
      if (!containerUpdates[target.container]) {
        containerUpdates[target.container] = [];
      }
      const processedValue = processJsonValue(target, value);
      containerUpdates[target.container]!.push({ key: target.key, value: processedValue });
    }
  }

  const allSets: string[] = [...fixedSets];
  const allValues: unknown[] = [...fixedValues];

  for (const [container, fields] of Object.entries(containerUpdates)) {
    const pathValueParts: string[] = [];
    const containerValues: unknown[] = [];
    for (const field of fields) {
      pathValueParts.push(`'$.${field.key}', ?`);
      containerValues.push(field.value === null || field.value === undefined ? null : field.value);
    }
    allSets.push(`${container} = json_set(COALESCE(${container}, '{}'), ${pathValueParts.join(", ")})`);
    allValues.push(...containerValues);
  }

  return { sql: allSets.join(", "), params: allValues };
}
