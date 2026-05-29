import { describe, it, expect, vi } from "vitest";

vi.mock("@/infrastructure/di", () => ({
  container: {
    resolveImageUrl: (url: string) => url,
    safeRun: vi.fn(),
    toSqlValue: (v: unknown) => v,
    videoTaskStorage: {
      getTasks: vi.fn().mockResolvedValue([]),
      saveTask: vi.fn().mockResolvedValue(undefined),
      getTaskById: vi.fn().mockResolvedValue(null),
      getFailedTasks: vi.fn().mockResolvedValue([]),
      getAllTaskHistory: vi.fn().mockResolvedValue([]),
    },
    getProviderSupportedCodecs: vi.fn().mockReturnValue(["h264", "h265", "vp9"]),
    getProviderMaxDuration: vi.fn().mockReturnValue(10),
    defaultCloudProvider: {
      name: "Test Provider",
      taskUrlPattern: (id: string) => `https://test.com/tasks/${id}`,
      queryEndpoint: (url: string, id: string) => `${url}/query/${id}`,
      apiDocUrl: "https://docs.test.com",
      howToCheck: "1. 登录控制台\n2. 查看任务列表",
      websiteUrl: "https://test.com",
    },
    cloudProviders: {
      "test.com": {
        name: "Test Provider",
        taskUrlPattern: (id: string) => `https://test.com/tasks/${id}`,
        queryEndpoint: (url: string, id: string) => `${url}/query/${id}`,
        apiDocUrl: "https://docs.test.com",
        howToCheck: "1. 登录控制台\n2. 查看任务列表",
        websiteUrl: "https://test.com",
      },
    },
    isCodecSupportedByProvider: vi.fn().mockReturnValue(true),
  },
}));

vi.mock("@/shared/presentation/Toast", () => ({
  useToastHelpers: () => ({
    success: vi.fn(),
    error: vi.fn(),
    showConfirm: vi.fn(),
  }),
}));

describe("Video Module Internal Integration", () => {
  describe("行为验证: utils 子域", () => {
    it("getTemplatesByCategory('all') 应返回全部模板", async () => {
      const { getTemplatesByCategory, videoTemplates } = await import("../utils");
      const allTemplates = getTemplatesByCategory("all");
      expect(allTemplates.length).toBe(videoTemplates.length);
    });

    it("getTemplatesByCategory 按分类过滤应返回正确子集", async () => {
      const { getTemplatesByCategory, videoTemplates } = await import("../utils");
      const sceneryTemplates = getTemplatesByCategory("风景");
      for (const t of sceneryTemplates) {
        expect(t.category).toBe("风景");
      }
      expect(sceneryTemplates.length).toBeLessThan(videoTemplates.length);
    });

    it("applyVideoTemplate 应返回 prompt/duration/style", async () => {
      const { applyVideoTemplate, videoTemplates } = await import("../utils");
      const result = applyVideoTemplate(videoTemplates[0]);
      expect(result).toHaveProperty("prompt");
      expect(result).toHaveProperty("duration");
      expect(result).toHaveProperty("style");
      expect(result.prompt.length).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it("getVideoCodecLabel 应返回可读的编码标签", async () => {
      const { getVideoCodecLabel } = await import("../utils");
      expect(getVideoCodecLabel("h264")).toBe("H.264/AVC");
      expect(getVideoCodecLabel("h265")).toBe("H.265/HEVC");
      expect(getVideoCodecLabel("unknown")).toBe("未知");
    });

    it("getContainerLabel 应返回可读的容器标签", async () => {
      const { getContainerLabel } = await import("../utils");
      expect(getContainerLabel("mp4")).toBe("MP4");
      expect(getContainerLabel("webm")).toBe("WebM");
      expect(getContainerLabel("unknown")).toBe("未知");
    });

    it("detectVideoCodec 应返回函数", async () => {
      const { detectVideoCodec } = await import("../utils");
      expect(typeof detectVideoCodec).toBe("function");
    });

    it("videoTemplates 应是非空数组且每项有 name/category", async () => {
      const { videoTemplates } = await import("../utils");
      expect(Array.isArray(videoTemplates)).toBe(true);
      expect(videoTemplates.length).toBeGreaterThan(0);
      for (const t of videoTemplates) {
        expect(t).toHaveProperty("name");
        expect(t).toHaveProperty("category");
      }
    });
  });

  describe("行为验证: task-management 子域", () => {
    it("buildTrackingInfo 应构建完整的追踪信息", async () => {
      const { buildTrackingInfo } = await import("../task-management");
      const info = buildTrackingInfo("task-123", "https://api.test.com/v1", "kling", "model-a");
      expect(info.providerName).toBe("可灵 (Kling)");
      expect(info.model).toBe("model-a");
      expect(info.apiUrl).toBe("https://api.test.com/v1");
      expect(info.howToCheck).toBeDefined();
    });

    it("buildTrackingInfo 无 providerId 时应使用默认信息", async () => {
      const { buildTrackingInfo } = await import("../task-management");
      const info = buildTrackingInfo("task-456");
      expect(info.howToCheck).toBeDefined();
      expect(info.model).toBeUndefined();
    });

    it("task-management 应导出 useVideoTaskManager hook", async () => {
      const taskMgmt = await import("../task-management");
      expect(taskMgmt.useVideoTaskManager).toBeDefined();
      expect(typeof taskMgmt.useVideoTaskManager).toBe("function");
    });

    it("task-management 应导出 useVideoTaskStore hook", async () => {
      const taskMgmt = await import("../task-management");
      expect(taskMgmt.useVideoTaskStore).toBeDefined();
      expect(typeof taskMgmt.useVideoTaskStore).toBe("function");
    });

    it("task-management 应导出 buildTrackingInfo 函数", async () => {
      const taskMgmt = await import("../task-management");
      expect(typeof taskMgmt.buildTrackingInfo).toBe("function");
    });
  });

  describe("行为验证: recovery 子域 - 重复检测", () => {
    it("checkForDuplicateVideos 无已完成任务时应返回无重复", async () => {
      const { checkForDuplicateVideos } = await import("../recovery");
      const result = await checkForDuplicateVideos(
        { prompt: "测试提示词" },
        [],
      );
      expect(result.hasDuplicate).toBe(false);
    });

    it("checkForDuplicateVideos 对相同 prompt 应检测出重复", async () => {
      const { checkForDuplicateVideos } = await import("../recovery");
      const existingTasks = [
        {
          taskId: "t-1",
          status: "completed",
          videoUrl: "https://example.com/v1.mp4",
          prompt: "一个角色在森林中行走",
          providerId: "provider-a",
          providerModelId: "model-a",
        },
      ];

      const result = await checkForDuplicateVideos(
        { prompt: "一个角色在森林中行走", providerId: "provider-a", providerModelId: "model-a" },
        existingTasks,
      );
      expect(result.hasDuplicate).toBe(true);
      expect(result).toHaveProperty("similarity");
      expect(result.similarity).toBeGreaterThan(0);
    });

    it("recovery 应导出 recoverVideoByTaskId", async () => {
      const recovery = await import("../recovery");
      expect(typeof recovery.recoverVideoByTaskId).toBe("function");
    });

    it("recovery 应导出 saveVideoTask", async () => {
      const recovery = await import("../recovery");
      expect(typeof recovery.saveVideoTask).toBe("function");
    });

    it("recovery 应导出 verifyVideoUrl", async () => {
      const recovery = await import("../recovery");
      expect(typeof recovery.verifyVideoUrl).toBe("function");
    });

    it("recovery 应导出 smartRetryEngine", async () => {
      const recovery = await import("../recovery");
      expect(recovery.smartRetryEngine).toBeDefined();
      expect(typeof recovery.smartRetryEngine.makeRetryDecision).toBe("function");
    });
  });

  describe("行为验证: cache 子域", () => {
    it("cache 应导出 cacheVideoBlob", async () => {
      const cache = await import("../cache");
      expect(typeof cache.cacheVideoBlob).toBe("function");
    });

    it("cache 应导出 getVideoUrlWithCache", async () => {
      const cache = await import("../cache");
      expect(typeof cache.getVideoUrlWithCache).toBe("function");
    });

    it("cache 应导出 getCacheStats", async () => {
      const cache = await import("../cache");
      expect(typeof cache.getCacheStats).toBe("function");
    });

    it("cache 应导出 revokeObjectURL", async () => {
      const cache = await import("../cache");
      expect(typeof cache.revokeObjectURL).toBe("function");
    });

    it("useVideoCacheStats 应是函数", async () => {
      const cache = await import("../cache");
      expect(typeof cache.useVideoCacheStats).toBe("function");
    });
  });

  describe("行为验证: 模块根导出一致性", () => {
    it("根 index.ts 导出的 buildTrackingInfo 应与 task-management 子域一致", async () => {
      const root = await import("../index");
      const taskMgmt = await import("../task-management");
      expect(root.buildTrackingInfo).toBe(taskMgmt.buildTrackingInfo);
    });
  });

  describe("架构守卫: 子域边界", () => {
    it("task-management 子域不应直接引用 recovery/cache 的内部文件", async () => {
      const fs = await import("fs");
      const path = await import("path");

      const taskMgmtDir = path.resolve(process.cwd(), "src/modules/video/task-management");
      const readDir = (dir: string): string[] => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...readDir(fullPath));
          } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
            files.push(fullPath);
          }
        }
        return files;
      };

      const files = readDir(taskMgmtDir);
      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        const directRecoveryRef = content.match(/from\s+["']\.\.\/\.\.\/recovery\/(services|types)\//);
        const directCacheRef = content.match(/from\s+["']\.\.\/\.\.\/cache\/(hooks|services)\//);
        expect(directRecoveryRef).toBeNull();
        expect(directCacheRef).toBeNull();
      }
    });

    it("recovery 子域不应直接引用 task-management 的内部文件", async () => {
      const fs = await import("fs");
      const path = await import("path");

      const recoveryDir = path.resolve(process.cwd(), "src/modules/video/recovery");
      const readDir = (dir: string): string[] => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...readDir(fullPath));
          } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
            files.push(fullPath);
          }
        }
        return files;
      };

      const files = readDir(recoveryDir);
      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        const directTaskMgmtRef = content.match(/from\s+["']\.\.\/\.\.\/task-management\/(hooks|services|presentation)\//);
        expect(directTaskMgmtRef).toBeNull();
      }
    });
  });

  describe("contract.json: 子域契约验证", () => {
    it("每个子域应有 contract.json 文件", async () => {
      const fs = await import("fs");
      const path = await import("path");

      const subdomains = ["task-management", "cache", "recovery", "utils"];
      for (const sd of subdomains) {
        const contractPath = path.resolve(
          process.cwd(),
          `src/modules/video/${sd}/contract.json`,
        );
        expect(fs.existsSync(contractPath)).toBe(true);
      }
    });

    it("contract.json 应包含必要字段且值有效", async () => {
      const fs = await import("fs");
      const path = await import("path");

      const subdomains = ["task-management", "cache", "recovery", "utils"];
      for (const sd of subdomains) {
        const contractPath = path.resolve(
          process.cwd(),
          `src/modules/video/${sd}/contract.json`,
        );
        const contract = JSON.parse(fs.readFileSync(contractPath, "utf-8"));
        expect(contract.name.length).toBeGreaterThan(0);
        expect(contract.description.length).toBeGreaterThan(0);
        expect(Array.isArray(contract.dependencies)).toBe(true);
        expect(typeof contract.publicAPI).toBe("object");
        expect(Array.isArray(contract.invariants)).toBe(true);
      }
    });
  });
});
