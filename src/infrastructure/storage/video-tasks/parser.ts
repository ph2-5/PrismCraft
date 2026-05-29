import type { VideoTask } from "@/domain/schemas";
import { parseConfig, parseProvider, parseMediaRefs, parseTracking } from "./json-schemas";

const TIMESTAMP_THRESHOLD = 1e12;

const VALID_TASK_STATUS = new Set(["pending", "generating", "completed", "failed", "cancelled", "retrying"]);

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

export function parseVideoTask(record: Record<string, unknown>): VideoTask {
  const config = parseConfig(record.config as string | null | undefined);
  const provider = parseProvider(record.provider as string | null | undefined);
  const mediaRefs = parseMediaRefs(record.media_refs as string | null | undefined);
  const tracking = parseTracking(record.tracking as string | null | undefined);

  return {
    taskId: String(record.id || ""),
    status: normalizeTaskStatus(record.status),
    progress: Number(record.progress || 0),
    videoUrl: record.video_url ? String(record.video_url) : undefined,
    localVideoPath: record.local_video_path ? String(record.local_video_path) : undefined,
    message: String(record.message || ""),
    createdAt: normalizeTimestamp(record.created_at, 0),
    updatedAt: normalizeTimestamp(record.updated_at, 0),
    expiresAt: tracking.expires_at ? normalizeTimestamp(tracking.expires_at, 0) : undefined,
    lastPolledAt: tracking.last_polled_at ? normalizeTimestamp(tracking.last_polled_at, 0) : undefined,
    pollFailureCount: Number(tracking.poll_failure_count || 0),
    pollCount: Number(tracking.poll_count || 0),
    recoveryAttempts: Number(tracking.recovery_attempts || 0),
    beatId: record.beat_id ? String(record.beat_id) : undefined,
    storyId: record.story_id ? String(record.story_id) : undefined,
    providerId: provider.provider_id ? String(provider.provider_id) : undefined,
    providerModelId: provider.provider_model_id
      ? String(provider.provider_model_id)
      : undefined,
    providerFormat: provider.provider_format
      ? String(provider.provider_format)
      : undefined,
    model: config.model ? String(config.model) : undefined,
    prompt: config.prompt ? String(config.prompt) : undefined,
    parameters: config.parameters
      ? (typeof config.parameters === "string"
        ? (() => { try { return JSON.parse(config.parameters as string) as Record<string, unknown>; } catch { return undefined; } })()
        : config.parameters as Record<string, unknown>)
      : undefined,
    fixedImageUrl: mediaRefs.fixed_image_url
      ? String(mediaRefs.fixed_image_url)
      : undefined,
    fixedImageLockType: mediaRefs.fixed_image_lock_type
      ? (String(mediaRefs.fixed_image_lock_type) as "character" | "scene")
      : undefined,
    referenceVideoUrl: mediaRefs.reference_video_url
      ? String(mediaRefs.reference_video_url)
      : undefined,
    referenceVideoMimicryLevel: mediaRefs.reference_video_mimicry_level
      ? (String(mediaRefs.reference_video_mimicry_level) as
          | "light"
          | "medium"
          | "deep")
      : undefined,
    templateId: config.template_id ? String(config.template_id) : undefined,
    templateShots: config.template_shots
      ? String(config.template_shots)
      : undefined,
    storyTitle: config.story_title ? String(config.story_title) : undefined,
    beatTitle: config.beat_title ? String(config.beat_title) : undefined,
    apiUrl: provider.api_url ? String(provider.api_url) : undefined,
    apiEndpoint: provider.api_endpoint ? String(provider.api_endpoint) : undefined,
    urlObtainedAt: tracking.url_obtained_at ? Number(tracking.url_obtained_at) : undefined,
    urlTtl: tracking.url_ttl ? Number(tracking.url_ttl) : undefined,
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

export function buildUpdateSets(updates: Partial<VideoTask>): { sql: string; params: unknown[] } {
  const fixedSets: string[] = [];
  const fixedValues: unknown[] = [];
  const containerUpdates: Record<string, Array<{ key: string; value: unknown }>> = {};

  for (const [jsKey, target] of Object.entries(fieldTargets)) {
    const value = (updates as Record<string, unknown>)[jsKey];
    if (value === undefined) continue;

    if (target.type === "fixed") {
      let processedValue = value;
      if (jsKey === "status" && typeof value === "string") {
        processedValue = toStorageStatus(value);
      }
      fixedSets.push(`${target.column} = ?`);
      fixedValues.push(processedValue === null || processedValue === undefined ? null : processedValue);
    } else {
      if (!containerUpdates[target.container]) {
        containerUpdates[target.container] = [];
      }
      let processedValue = value;
      if (target.container === "tracking") {
        if ((target.key === "last_polled_at" || target.key === "expires_at") && typeof value === "string") {
          processedValue = toStorageTimestamp(value) ?? value;
        } else if ((target.key === "last_polled_at" || target.key === "expires_at") && typeof value === "number" && value > 1e12) {
          processedValue = Math.floor(value / 1000);
        }
      }
      if (target.key === "parameters" && typeof value === "object" && value !== null) {
        processedValue = JSON.stringify(value);
      }
      containerUpdates[target.container].push({ key: target.key, value: processedValue });
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
