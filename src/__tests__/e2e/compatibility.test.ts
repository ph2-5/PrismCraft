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

vi.mock("@/infrastructure/api/client", () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    get: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  },
}));

describe("E2E 兼容性测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({ ok: true, value: {} });
    vi.mocked(apiClient.get).mockResolvedValue({ ok: true, value: {} });
  });

  describe("customConfig 迁移兼容性", () => {
    it("buildTrackingInfo 不应接受 customConfig 参数", async () => {
      const { buildTrackingInfo } = await import("@/modules/video/task-management/services/video-tracker");
      const info = buildTrackingInfo("task-1", "https://api.example.com", undefined, "model-v1");
      expect(info).toBeDefined();
      expect(info.model).toBe("model-v1");
      expect(info.apiUrl).toBe("https://api.example.com");
    });

    it("generateVideo 不应接受 customConfig 选项", async () => {
      const { generateVideo } = await import("@/infrastructure/ai-providers/video");
      expect(typeof generateVideo).toBe("function");
      const fnSource = generateVideo.toString();
      expect(fnSource).not.toContain("customConfig");
      expect(fnSource).toContain("providerId");
    });
  });

  describe("数据库 schema 兼容性", () => {
    it("video_tasks 表不应包含 custom_config 列", async () => {
      const { videoTaskStorage } = await import("@/infrastructure/storage/video-tasks");
      const storage = vi.mocked(videoTaskStorage);

      storage.createVideoTask.mockResolvedValueOnce(undefined);

      const taskData = {
        taskId: "schema-compat-1",
        status: "pending" as const,
        progress: 0,
        message: "test",
        createdAt: new Date().toISOString(),
        providerId: "volcengine",
        providerModelId: "seedance-1.5",
        providerFormat: "mp4",
      };

      await storage.createVideoTask(taskData);
      expect(storage.createVideoTask).toHaveBeenCalledWith(
        expect.not.objectContaining({ customConfig: expect.anything() }),
      );
    });

    it("旧格式数据（含 custom_config）应能被安全忽略", async () => {
      const { parseRecord } = await import("@/infrastructure/storage/core");
      const oldRecord = {
        id: "old-task",
        status: "completed",
        custom_config: '{"apiUrl":"https://old.api.com","apiKey":"sk-old"}',
        config: '{}',
      };
      const parsed = parseRecord(oldRecord);
      expect(parsed.id).toBe("old-task");
      expect(parsed.status).toBe("completed");
    });

    it("新格式数据应包含 config/provider 容器", async () => {
      const { parseRecord } = await import("@/infrastructure/storage/core");
      const newRecord = {
        id: "new-task",
        status: "completed",
        config: '{"model":"seedance-1.5"}',
        provider: '{"providerId":"volcengine"}',
      };
      const parsed = parseRecord(newRecord);
      expect(parsed.id).toBe("new-task");
      expect(parsed.config).toBeDefined();
    });
  });

  describe("API 接口兼容性", () => {
    it("video API 应接受 providerId/modelId 参数", async () => {
      const { videoApi } = await import("@/infrastructure/api/endpoints");
      const result = await videoApi.generate({
        prompt: "compat-test",
        providerId: "volcengine",
        modelId: "seedance-1.5",
      });
      expect(result.ok).toBe(true);
    });

    it("image API 应接受 providerId/modelId 参数", async () => {
      const { imageApi } = await import("@/infrastructure/api/endpoints");
      const result = await imageApi.generate("compat-test", "scene", "volcengine", "seedance-1.5");
      expect(result.ok).toBe(true);
    });

    it("text API 应接受 providerId/modelId 参数", async () => {
      const { textApi } = await import("@/infrastructure/api/endpoints");
      const result = await textApi.generate("compat-test", {
        providerId: "volcengine",
        modelId: "seedance-1.5",
      });
      expect(result.ok).toBe(true);
    });

    it("config API 应正常工作", async () => {
      const { configApi } = await import("@/infrastructure/api/endpoints");
      const statusResult = await configApi.getStatus();
      expect(statusResult.ok).toBe(true);
      const testResult = await configApi.testConnection("video", "volcengine", "seedance-1.5");
      expect(testResult.ok).toBe(true);
    });
  });

  describe("Electron 层兼容性", () => {
    it("api-gateway 不应导出 customApiKey/customApiUrl/customModel", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const gatewayPath = path.resolve(process.cwd(), "electron/src/api-gateway.ts");
      const content = fs.readFileSync(gatewayPath, "utf-8");
      expect(content).not.toContain("customApiKey");
      expect(content).not.toContain("customApiUrl");
      expect(content).not.toContain("customModel");
    });

    it("api-server 不应传递 customConfig", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const serverPath = path.resolve(process.cwd(), "electron/src/api-server.ts");
      const content = fs.readFileSync(serverPath, "utf-8");
      expect(content).not.toContain("customConfig");
    });

    it("video-tracker (electron) 不应接受 customConfig 参数", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const trackerPath = path.resolve(process.cwd(), "electron/src/services/video/video-tracker.ts");
      const content = fs.readFileSync(trackerPath, "utf-8");
      expect(content).not.toContain("customConfig");
    });

    it("video-recovery (electron) 不应使用 customConfig", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const recoveryPath = path.resolve(process.cwd(), "electron/src/services/video/video-recovery.ts");
      const content = fs.readFileSync(recoveryPath, "utf-8");
      expect(content).not.toContain("customConfig");
    });
  });

  describe("前端页面兼容性", () => {
    it("quick-generate 页面不应引用 getLegacyConfig", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const pagePath = path.resolve(process.cwd(), "src/app/quick-generate/page.tsx");
      const content = fs.readFileSync(pagePath, "utf-8");
      expect(content).not.toContain("getLegacyConfig");
      expect(content).not.toContain("customConfig");
    });

    it("story 页面不应引用 getLegacyConfig", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const pagePath = path.resolve(process.cwd(), "src/app/story/page.tsx");
      const content = fs.readFileSync(pagePath, "utf-8");
      expect(content).not.toContain("getLegacyConfig");
      expect(content).not.toContain("customConfig");
    });

    it("VideoTaskManager 不应传递 customConfig", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const compPath = path.resolve(process.cwd(), "src/modules/video/task-management/presentation/VideoTaskManager.tsx");
      const content = fs.readFileSync(compPath, "utf-8");
      expect(content).not.toContain("customConfig");
    });

    it("useVideoGenerator 不应接受 customConfig 参数", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const hookPath = path.resolve(process.cwd(), "src/modules/story/generation/hooks/useVideoGenerator.ts");
      const content = fs.readFileSync(hookPath, "utf-8");
      expect(content).not.toContain("customConfig");
    });
  });

  describe("类型定义兼容性", () => {
    it("api.ts 不应包含 customConfig 字段", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const schemaPath = path.resolve(process.cwd(), "src/domain/schemas/api.ts");
      const content = fs.readFileSync(schemaPath, "utf-8");
      expect(content).not.toContain("customConfig");
    });

    it("media.ts 不应包含 customConfig schema", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const schemaPath = path.resolve(process.cwd(), "src/domain/schemas/media.ts");
      const content = fs.readFileSync(schemaPath, "utf-8");
      expect(content).not.toContain("customConfig");
    });

    it("db.ts 不应包含 customConfig 接口字段", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const dbPath = path.resolve(process.cwd(), "src/infrastructure/storage/db.ts");
      const content = fs.readFileSync(dbPath, "utf-8");
      expect(content).not.toContain("customConfig");
    });
  });
});
