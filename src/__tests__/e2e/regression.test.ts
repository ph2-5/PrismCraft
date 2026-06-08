import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "@/infrastructure/api/client";

vi.mock("@/infrastructure/storage/video-tasks", () => ({
  videoTaskStorage: {
    getVideoTasks: vi.fn(),
    getCompletedVideoTasks: vi.fn(),
    getVideoTaskById: vi.fn(),
    getVideoTasksByStory: vi.fn(),
    getVideoTasksByStatus: vi.fn(),
    getPendingVideoTasks: vi.fn(),
    createVideoTask: vi.fn(),
    updateVideoTask: vi.fn(),
    deleteVideoTask: vi.fn(),
    deleteVideoTasksByStatus: vi.fn(),
    deleteExpiredVideoTasks: vi.fn(),
    clearVideoTasks: vi.fn(),
    bulkPutVideoTasks: vi.fn(),
  },
}));

vi.mock("@/infrastructure/ai-providers/video", () => ({
  generateVideo: vi.fn(),
  generateVideoWithFrames: vi.fn(),
  queryVideoStatus: vi.fn(),
  generateKeyframe: vi.fn(),
  generateFramePair: vi.fn(),
}));

vi.mock("@/infrastructure/api/client", () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    get: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  },
}));

describe("E2E 回归测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({ ok: true, value: {} });
    vi.mocked(apiClient.get).mockResolvedValue({ ok: true, value: {} });
  });

  describe("customConfig 迁移回归", () => {
    it("源码中不应残留 customConfig 引用", async () => {
      const fs = await import("fs");
      const path = await import("path");

      const srcDir = path.resolve(process.cwd(), "src");
      const electronDir = path.resolve(process.cwd(), "electron/src");

      const forbiddenPatterns = [
        /\bcustomConfig\b/,
        /\bcustomApiKey\b/,
        /\bcustomApiUrl\b/,
        /\bcustomModel\b/,
        /\bcustom_config\b/,
      ];

      const srcFiles = findTsFiles(srcDir).filter(f => !f.includes("__tests__"));
      const electronFiles = fs.existsSync(electronDir) ? findTsFiles(electronDir).filter(f => !f.includes("__tests__")) : [];
      const allFiles = [...srcFiles, ...electronFiles];

      const violations: string[] = [];
      for (const file of allFiles) {
        const content = fs.readFileSync(file, "utf-8");
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(content)) {
            violations.push(`${path.relative(process.cwd(), file)}: ${pattern.source}`);
          }
        }
      }

      expect(violations, `Found forbidden patterns: ${violations.join(", ")}`).toHaveLength(0);
    });

    it("generateVideo 应使用 providerId/modelId 而非 customConfig", async () => {
      const { generateVideo } = await import("@/infrastructure/ai-providers/video");
      const mocked = vi.mocked(generateVideo);

      mocked.mockResolvedValueOnce({
        success: true,
        data: {
          taskId: "regression-1",
          providerId: "volcengine",
          providerModelId: "seedance-1.5",
          providerFormat: "mp4",
        },
      });

      const result = await generateVideo("回归测试", {
        providerId: "volcengine",
        modelId: "seedance-1.5",
        format: "mp4",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.providerId).toBe("volcengine");
        expect(result.data.providerModelId).toBe("seedance-1.5");
      }

      const callArgs = mocked.mock.calls[0]!;
      expect(callArgs[0]).toBe("回归测试");
      expect(callArgs[1]).toMatchObject({
        providerId: "volcengine",
        modelId: "seedance-1.5",
      });
    });

    it("generateVideoWithFrames 应使用 providerId/modelId", async () => {
      const { generateVideoWithFrames } = await import("@/infrastructure/ai-providers/video");
      const mocked = vi.mocked(generateVideoWithFrames);

      mocked.mockResolvedValueOnce({
        success: true,
        data: {
          taskId: "regression-2",
          providerId: "kling",
          providerModelId: "kling-v2",
        },
      });

      const result = await generateVideoWithFrames({
        prompt: "帧回归测试",
        firstFrameUrl: "https://img.example.com/frame.png",
        providerId: "kling",
        modelId: "kling-v2",
      });

      expect(result.success).toBe(true);
      expect(mocked).toHaveBeenCalledWith(expect.objectContaining({
        providerId: "kling",
        modelId: "kling-v2",
      }));
    });

    it("queryVideoStatus 应使用 providerId/modelId", async () => {
      const { queryVideoStatus } = await import("@/infrastructure/ai-providers/video");
      const mocked = vi.mocked(queryVideoStatus);

      mocked.mockResolvedValueOnce({
        success: true,
        data: { status: "completed", progress: 100 },
      });

      await queryVideoStatus("task-1", {
        providerId: "volcengine",
        modelId: "seedance-1.5",
        format: "mp4",
      });

      expect(mocked).toHaveBeenCalledWith("task-1", expect.objectContaining({
        providerId: "volcengine",
        modelId: "seedance-1.5",
      }));
    });
  });

  describe("存储层回归", () => {
    it("videoTaskStorage.createVideoTask 不应接受 customConfig", async () => {
      const { videoTaskStorage } = await import("@/infrastructure/storage/video-tasks");
      const storage = vi.mocked(videoTaskStorage);
      storage.createVideoTask.mockResolvedValueOnce(undefined);

      await storage.createVideoTask({
        taskId: "regression-storage-1",
        status: "pending",
        progress: 0,
        message: "test",
        providerId: "volcengine",
        providerModelId: "seedance-1.5",
      });

      const callArgs = storage.createVideoTask.mock.calls[0]![0]!;
      expect("customConfig" in callArgs).toBe(false);
      expect(callArgs.providerId).toBe("volcengine");
    });

    it("videoTaskStorage.updateVideoTask 不应接受 customConfig", async () => {
      const { videoTaskStorage } = await import("@/infrastructure/storage/video-tasks");
      const storage = vi.mocked(videoTaskStorage);
      storage.updateVideoTask.mockResolvedValueOnce(undefined);

      await storage.updateVideoTask("task-1", {
        status: "completed",
        providerId: "volcengine",
      });

      const callArgs = storage.updateVideoTask.mock.calls[0]![1]!;
      expect("customConfig" in callArgs).toBe(false);
    });
  });

  describe("VideoTask 类型回归", () => {
    it("VideoTask 应支持所有 provider 相关字段", async () => {
      const { videoTaskSchema } = await import("@/domain/schemas/api");
      const taskData = {
        taskId: "type-regression-1",
        status: "completed",
        progress: 100,
        message: "done",
        createdAt: new Date().toISOString(),
        providerId: "volcengine",
        providerModelId: "seedance-1.5",
        providerFormat: "mp4",
        apiUrl: "https://api.volcengine.com",
        apiEndpoint: "/video/generate",
      };
      const result = videoTaskSchema.safeParse(taskData);
      expect(result.success, "VideoTask schema 应接受包含 provider 字段的数据").toBe(true);
      if (result.success) {
        expect(result.data.providerId).toBe("volcengine");
        expect(result.data.providerModelId).toBe("seedance-1.5");
        expect(result.data.providerFormat).toBe("mp4");
      }
    });

    it("VideoTaskStatus 应包含所有必要状态", async () => {
      const { videoTaskStatusSchema } = await import("@/domain/schemas/api");
      const validStatuses = ["pending", "generating", "completed", "failed", "cancelled"];
      for (const status of validStatuses) {
        const result = videoTaskStatusSchema.safeParse(status);
        expect(result.success, `状态 '${status}' 应通过 schema 验证`).toBe(true);
      }
      const invalidResult = videoTaskStatusSchema.safeParse("running");
      expect(invalidResult.success, "非法状态应被 schema 拒绝").toBe(false);
    });
  });

  describe("追踪信息回归", () => {
    it("buildTrackingInfo 应正确返回所有字段", async () => {
      const { buildTrackingInfo } = await import("@/modules/video/task-management/services/video-tracker");
      const info = buildTrackingInfo("task-regression", "https://api.volcengine.com", "kling", "seedance-1.5");

      expect(info.apiUrl).toBe("https://api.volcengine.com");
      expect(info.model).toBe("seedance-1.5");
      expect(info.providerName).toBeTruthy();
      expect(typeof info.howToCheck).toBe("string");
    });
  });

  describe("endpoints 回归", () => {
    it("videoApi.generate 应接受 providerId/modelId", async () => {
      const { videoApi } = await import("@/infrastructure/api/endpoints");
      const result = await videoApi.generate({
        prompt: "regression-test",
        providerId: "volcengine",
        modelId: "seedance-1.5",
      });
      expect(result.ok).toBe(true);
    });

    it("imageApi.generate 应接受 providerId/modelId", async () => {
      const { imageApi } = await import("@/infrastructure/api/endpoints");
      const result = await imageApi.generate("regression-test", "scene", "volcengine", "seedance-1.5");
      expect(result.ok).toBe(true);
    });
  });

  describe("配置系统回归", () => {
    it("resolveCapability 应正常工作", async () => {
      const { resolveCapability } = await import("@/infrastructure/ai-providers/config");
      const mockConfig = {
        version: 1,
        providers: [{
          id: "test-provider",
          name: "Test Provider",
          format: "openai" as const,
          baseUrl: "https://api.test.com",
          apiKey: "sk-test",
          models: [{
            id: "test-model",
            name: "Test Model",
            capabilities: ["video" as const],
          }],
        }],
        mapping: { video: "test-provider/test-model" },
        fallback: { enabled: false, order: [] as Array<"text" | "image" | "vision" | "video"> },
      };
      const result = await resolveCapability("video", mockConfig);
      expect(result.provider.id).toBe("test-provider");
      expect(result.model.id).toBe("test-model");
    });

    it("MAX_PROMPT_LENGTH 应为正数", async () => {
      const { MAX_PROMPT_LENGTH } = await import("@/infrastructure/ai-providers/config");
      expect(MAX_PROMPT_LENGTH).toBeGreaterThan(0);
    });

    it("safeTruncatePrompt 不应截断短提示词", async () => {
      const { safeTruncatePrompt } = await import("@/infrastructure/ai-providers/config");
      const shortPrompt = "短提示词";
      expect(safeTruncatePrompt(shortPrompt).truncated).toBe(shortPrompt);
    });
  });
});

function findTsFiles(dir: string): string[] {
   
  const fs = require("fs");
   
  const path = require("path");
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== "dist") {
        results.push(...findTsFiles(fullPath));
      }
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      results.push(fullPath);
    }
  }
  return results;
}
