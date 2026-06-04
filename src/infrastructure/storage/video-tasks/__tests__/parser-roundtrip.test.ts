import { describe, it, expect } from "vitest";
import {
  parseVideoTask,
  buildConfigJson,
  buildProviderJson,
  buildMediaRefsJson,
  buildTrackingJson,
  buildUpdateSets,
  normalizeTimestamp,
  toStorageTimestamp,
  fieldTargets,
} from "../parser";
import { parseConfig, parseProvider, parseMediaRefs, parseTracking } from "../json-schemas";
import type { VideoTask } from "@/domain/schemas";

function buildFullTask(): VideoTask {
  return {
    taskId: "task-001",
    status: "generating",
    progress: 42,
    videoUrl: "https://cdn.example.com/video.mp4",
    localVideoPath: "/videos/video.mp4",
    message: "Generating video",
    createdAt: "2024-01-15T10:00:00.000Z",
    updatedAt: "2024-01-15T10:05:00.000Z",
    expiresAt: "2024-02-14T10:00:00.000Z",
    lastPolledAt: "2024-01-15T10:04:00.000Z",
    pollFailureCount: 1,
    pollCount: 5,
    recoveryAttempts: 0,
    beatId: "beat-001",
    storyId: "story-001",
    providerId: "provider-1",
    providerModelId: "model-abc",
    providerFormat: "mp4",
    model: "cogvideox-2",
    prompt: "A cat walking in the garden",
    parameters: { duration: 5, aspect_ratio: "16:9" },
    fixedImageUrl: "https://cdn.example.com/img.png",
    fixedImageLockType: "character",
    referenceVideoUrl: "https://cdn.example.com/ref.mp4",
    referenceVideoMimicryLevel: "medium",
    templateId: "tmpl-1",
    templateShots: "5",
    storyTitle: "Cat Story",
    beatTitle: "Opening",
    apiUrl: "https://api.example.com",
    apiEndpoint: "/v1/generate",
    urlObtainedAt: 1705312200,
    urlTtl: 3600,
  };
}

function buildFullRecord(): Record<string, unknown> {
  const task = buildFullTask();
  return {
    id: task.taskId,
    status: task.status,
    progress: task.progress,
    video_url: task.videoUrl,
    local_video_path: task.localVideoPath,
    message: task.message,
    created_at: toStorageTimestamp(task.createdAt),
    updated_at: toStorageTimestamp(task.updatedAt),
    beat_id: task.beatId,
    story_id: task.storyId,
    config: buildConfigJson(task),
    provider: buildProviderJson(task),
    media_refs: buildMediaRefsJson(task),
    tracking: buildTrackingJson(task, toStorageTimestamp(task.createdAt) ?? undefined),
  };
}

describe("VideoTask 序列化 roundtrip", () => {
  it("buildConfigJson → parseConfig roundtrip 应保留所有字段", () => {
    const task = buildFullTask();
    const json = buildConfigJson(task);
    const parsed = parseConfig(json);

    expect(parsed.model).toBe(task.model);
    expect(parsed.prompt).toBe(task.prompt);
    expect(parsed.template_id).toBe(task.templateId);
    expect(parsed.template_shots).toBe(task.templateShots);
    expect(parsed.story_title).toBe(task.storyTitle);
    expect(parsed.beat_title).toBe(task.beatTitle);
    const parameters = parsed.parameters;
    expect(parameters).toBeDefined();
    expect(JSON.parse(parameters!)).toEqual(task.parameters);
  });

  it("buildProviderJson → parseProvider roundtrip 应保留所有字段", () => {
    const task = buildFullTask();
    const json = buildProviderJson(task);
    const parsed = parseProvider(json);

    expect(parsed.api_url).toBe(task.apiUrl);
    expect(parsed.api_endpoint).toBe(task.apiEndpoint);
    expect(parsed.provider_id).toBe(task.providerId);
    expect(parsed.provider_model_id).toBe(task.providerModelId);
    expect(parsed.provider_format).toBe(task.providerFormat);
  });

  it("buildMediaRefsJson → parseMediaRefs roundtrip 应保留所有字段", () => {
    const task = buildFullTask();
    const json = buildMediaRefsJson(task);
    const parsed = parseMediaRefs(json);

    expect(parsed.fixed_image_url).toBe(task.fixedImageUrl);
    expect(parsed.fixed_image_lock_type).toBe(task.fixedImageLockType);
    expect(parsed.reference_video_url).toBe(task.referenceVideoUrl);
    expect(parsed.reference_video_mimicry_level).toBe(task.referenceVideoMimicryLevel);
  });

  it("buildTrackingJson → parseTracking roundtrip 应保留所有字段", () => {
    const task = buildFullTask();
    const createdAtSec = toStorageTimestamp(task.createdAt) ?? 0;
    const json = buildTrackingJson(task, createdAtSec);
    const parsed = parseTracking(json);

    expect(parsed.poll_count).toBe(task.pollCount);
    expect(parsed.poll_failure_count).toBe(task.pollFailureCount);
    expect(parsed.recovery_attempts).toBe(task.recoveryAttempts);
    expect(parsed.url_ttl).toBe(task.urlTtl);
    expect(parsed.expires_at).toBeDefined();
    expect(parsed.last_polled_at).toBeDefined();
  });

  it("全字段 VideoTask 完整 roundtrip 应保留所有字段", () => {
    const record = buildFullRecord();
    const result = parseVideoTask(record);

    expect(result.taskId).toBe("task-001");
    expect(result.status).toBe("generating");
    expect(result.progress).toBe(42);
    expect(result.videoUrl).toBe("https://cdn.example.com/video.mp4");
    expect(result.localVideoPath).toBe("/videos/video.mp4");
    expect(result.message).toBe("Generating video");
    expect(result.beatId).toBe("beat-001");
    expect(result.storyId).toBe("story-001");
    expect(result.providerId).toBe("provider-1");
    expect(result.providerModelId).toBe("model-abc");
    expect(result.providerFormat).toBe("mp4");
    expect(result.model).toBe("cogvideox-2");
    expect(result.prompt).toBe("A cat walking in the garden");
    expect(result.parameters).toEqual({ duration: 5, aspect_ratio: "16:9" });
    expect(result.fixedImageUrl).toBe("https://cdn.example.com/img.png");
    expect(result.fixedImageLockType).toBe("character");
    expect(result.referenceVideoUrl).toBe("https://cdn.example.com/ref.mp4");
    expect(result.referenceVideoMimicryLevel).toBe("medium");
    expect(result.templateId).toBe("tmpl-1");
    expect(result.templateShots).toBe("5");
    expect(result.storyTitle).toBe("Cat Story");
    expect(result.beatTitle).toBe("Opening");
    expect(result.apiUrl).toBe("https://api.example.com");
    expect(result.apiEndpoint).toBe("/v1/generate");
    expect(result.urlTtl).toBe(3600);
    expect(result.pollCount).toBe(5);
    expect(result.pollFailureCount).toBe(1);
    expect(result.recoveryAttempts).toBe(0);
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  it("最小 VideoTask roundtrip 应有合理默认值", () => {
    const record: Record<string, unknown> = {
      id: "task-min",
      status: "pending",
      config: "{}",
      provider: "{}",
      media_refs: "{}",
      tracking: "{}",
    };
    const result = parseVideoTask(record);

    expect(result.taskId).toBe("task-min");
    expect(result.status).toBe("pending");
    expect(result.progress).toBe(0);
    expect(result.message).toBe("");
    expect(result.videoUrl).toBeUndefined();
    expect(result.localVideoPath).toBeUndefined();
    expect(result.beatId).toBeUndefined();
    expect(result.storyId).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(result.prompt).toBeUndefined();
    expect(result.parameters).toBeUndefined();
    expect(result.providerId).toBeUndefined();
    expect(result.providerModelId).toBeUndefined();
    expect(result.providerFormat).toBeUndefined();
    expect(result.fixedImageUrl).toBeUndefined();
    expect(result.fixedImageLockType).toBeUndefined();
    expect(result.referenceVideoUrl).toBeUndefined();
    expect(result.referenceVideoMimicryLevel).toBeUndefined();
    expect(result.templateId).toBeUndefined();
    expect(result.templateShots).toBeUndefined();
    expect(result.storyTitle).toBeUndefined();
    expect(result.beatTitle).toBeUndefined();
    expect(result.apiUrl).toBeUndefined();
    expect(result.apiEndpoint).toBeUndefined();
    expect(result.urlObtainedAt).toBeUndefined();
    expect(result.urlTtl).toBeUndefined();
    expect(result.pollCount).toBe(0);
    expect(result.pollFailureCount).toBe(0);
    expect(result.recoveryAttempts).toBe(0);
    expect(result.expiresAt).toBeUndefined();
    expect(result.lastPolledAt).toBeUndefined();
  });

  it('status "processing" 应标准化为 "generating"', () => {
    const record: Record<string, unknown> = {
      id: "task-proc",
      status: "processing",
      config: "{}",
      provider: "{}",
      media_refs: "{}",
      tracking: "{}",
    };
    const result = parseVideoTask(record);
    expect(result.status).toBe("generating");
  });

  it("status 有效值应原样保留", () => {
    const validStatuses = ["pending", "generating", "completed", "failed", "cancelled", "retrying"] as const;
    for (const status of validStatuses) {
      const record: Record<string, unknown> = {
        id: "task-status",
        status,
        config: "{}",
        provider: "{}",
        media_refs: "{}",
        tracking: "{}",
      };
      const result = parseVideoTask(record);
      expect(result.status).toBe(status);
    }
  });

  it("parameters 对象应正确序列化和反序列化", () => {
    const task: Partial<VideoTask> = {
      parameters: { duration: 5, aspect_ratio: "16:9" },
    };
    const json = buildConfigJson(task);
    const parsed = parseConfig(json);
    expect(parsed.parameters).toBeDefined();
    const parsedParams = JSON.parse(parsed.parameters!);
    expect(parsedParams).toEqual({ duration: 5, aspect_ratio: "16:9" });
  });

  it("buildUpdateSets 部分更新 fixed 列不应影响 JSON 容器", () => {
    const result = buildUpdateSets({ status: "completed" });
    expect(result.sql).toContain("status = ?");
    expect(result.sql).not.toContain("json_set");
    expect(result.sql).not.toContain("config");
    expect(result.sql).not.toContain("provider");
    expect(result.sql).not.toContain("media_refs");
    expect(result.sql).not.toContain("tracking");
  });

  it("buildUpdateSets 部分更新 JSON 容器应使用 json_set", () => {
    const result = buildUpdateSets({ model: "new-model" });
    expect(result.sql).toContain("config = json_set(COALESCE(config, '{}'), '$.model', ?)");
    expect(result.params).toContain("new-model");
  });

  it("buildUpdateSets 同时更新多个容器的字段", () => {
    const result = buildUpdateSets({
      status: "failed",
      model: "new-model",
      providerId: "new-provider",
    });
    expect(result.sql).toContain("status = ?");
    expect(result.sql).toContain("config = json_set(COALESCE(config, '{}'), '$.model', ?)");
    expect(result.sql).toContain("provider = json_set(COALESCE(provider, '{}'), '$.provider_id', ?)");
    expect(result.params).toEqual(
      expect.arrayContaining(["failed", "new-model", "new-provider"]),
    );
  });

  it("buildTrackingJson 有 videoUrl 时应设置 url_obtained_at", () => {
    const task: Partial<VideoTask> = { videoUrl: "https://cdn.example.com/video.mp4" };
    const json = buildTrackingJson(task);
    const parsed = parseTracking(json);
    expect(parsed.url_obtained_at).toBeDefined();
    expect(typeof parsed.url_obtained_at).toBe("number");
  });

  it("buildTrackingJson 无 expiresAt 时应使用 createdAtSec + 30天", () => {
    const createdAtSec = 1700000000;
    const task: Partial<VideoTask> = {};
    const json = buildTrackingJson(task, createdAtSec);
    const parsed = parseTracking(json);
    expect(parsed.expires_at).toBe(createdAtSec + 30 * 24 * 60 * 60);
  });

  it("可选字段为 null 时不应导致解析错误", () => {
    const record: Record<string, unknown> = {
      id: "task-null",
      status: "pending",
      video_url: null,
      beat_id: null,
      model: null,
      config: "{}",
      provider: "{}",
      media_refs: "{}",
      tracking: "{}",
    };
    const result = parseVideoTask(record);
    expect(result.videoUrl).toBeUndefined();
    expect(result.beatId).toBeUndefined();
    expect(result.model).toBeUndefined();
  });

  it("空 JSON 容器应正确处理", () => {
    const record: Record<string, unknown> = {
      id: "task-empty",
      status: "pending",
      config: "{}",
      provider: "{}",
      media_refs: "{}",
      tracking: "{}",
    };
    const result = parseVideoTask(record);
    expect(result.model).toBeUndefined();
    expect(result.prompt).toBeUndefined();
    expect(result.parameters).toBeUndefined();
    expect(result.providerId).toBeUndefined();
    expect(result.providerModelId).toBeUndefined();
    expect(result.providerFormat).toBeUndefined();
    expect(result.apiUrl).toBeUndefined();
    expect(result.apiEndpoint).toBeUndefined();
    expect(result.fixedImageUrl).toBeUndefined();
    expect(result.fixedImageLockType).toBeUndefined();
    expect(result.referenceVideoUrl).toBeUndefined();
    expect(result.referenceVideoMimicryLevel).toBeUndefined();
    expect(result.expiresAt).toBeUndefined();
    expect(result.lastPolledAt).toBeUndefined();
    expect(result.urlObtainedAt).toBeUndefined();
    expect(result.urlTtl).toBeUndefined();
  });

  it("null JSON 容器应正确处理", () => {
    const record: Record<string, unknown> = {
      id: "task-null-containers",
      status: "pending",
      config: null,
      provider: null,
      media_refs: null,
      tracking: null,
    };
    const result = parseVideoTask(record);
    expect(result.model).toBeUndefined();
    expect(result.providerId).toBeUndefined();
    expect(result.fixedImageUrl).toBeUndefined();
    expect(result.expiresAt).toBeUndefined();
    expect(result.lastPolledAt).toBeUndefined();
  });

  it("无效 JSON 容器应安全降级", () => {
    const record: Record<string, unknown> = {
      id: "task-invalid-json",
      status: "pending",
      config: "invalid json",
      provider: "not json",
      media_refs: "{broken",
      tracking: "}invalid{",
    };
    const result = parseVideoTask(record);
    expect(result.model).toBeUndefined();
    expect(result.providerId).toBeUndefined();
    expect(result.fixedImageUrl).toBeUndefined();
    expect(result.expiresAt).toBeUndefined();
  });
});
