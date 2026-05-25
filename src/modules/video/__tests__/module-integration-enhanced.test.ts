import { describe, it, expect, vi } from "vitest";
import { loadAllContracts, validateContractStructure, findIllegalImports } from "@/__tests__/utils/contract-validator";
import { join } from "path";

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

const VIDEO_MODULE_PATH = join(__dirname, "..");
const TIMEOUT = 15000;

describe("Video 模块集成测试（增强版）", () => {
  describe("contract.json 契约验证", () => {
    const contracts = loadAllContracts(VIDEO_MODULE_PATH);

    for (const [subdomainName, contract] of contracts) {
      describe(`${subdomainName} 契约`, () => {
        it("应包含所有必要字段", () => {
          const errors = validateContractStructure(contract);
          expect(errors).toEqual([]);
        });

        it("name 应非空", () => {
          expect(contract.name, `${subdomainName} name 应非空`).toBeTruthy();
        });
      });
    }
  });

  describe("子域边界检查（相对路径 + 别名路径）", () => {
    const forbiddenPatterns = [
      /from\s+["']\.\.\/\.\.\/(story|shot|character|scene|prompt|asset|sync)\/(services|types|hooks)\//,
    ];
    const aliasPatterns = [
      /from\s+["']@\/modules\/(story|shot|character|scene|prompt|asset|sync)\/(services|types|hooks)\//,
    ];

    for (const subdomainName of ["task-management", "cache", "recovery", "utils"]) {
      it(`${subdomainName} 不应直接引用其他模块的内部文件`, () => {
        const subdomainPath = join(VIDEO_MODULE_PATH, subdomainName);
        const violations = findIllegalImports(subdomainPath, forbiddenPatterns, aliasPatterns);
        expect(violations).toEqual([]);
      });
    }
  });

  describe("子域 index.ts 导出验证", () => {
    it("task-management 子域应正确导出 hooks 和 services", async () => {
      const taskMgmt = await import("../task-management");
      expect(taskMgmt.useVideoTaskManager).toBeDefined();
      expect(taskMgmt.useVideoTaskStore).toBeDefined();
      expect(taskMgmt.useVideoTasks).toBeDefined();
      expect(taskMgmt.buildTrackingInfo).toBeDefined();
      expect(typeof taskMgmt.buildTrackingInfo).toBe("function");
    }, TIMEOUT);

    it("cache 子域应正确导出 hooks 和 services", async () => {
      const cache = await import("../cache");
      expect(cache.useVideoCacheStats).toBeDefined();
      expect(cache.cacheVideoBlob).toBeDefined();
      expect(cache.getVideoUrlWithCache).toBeDefined();
      expect(cache.getCacheStats).toBeDefined();
      expect(cache.revokeObjectURL).toBeDefined();
    }, TIMEOUT);

    it("recovery 子域应正确导出 types 和 services", async () => {
      const recovery = await import("../recovery");
      expect(recovery.recoverVideoByTaskId).toBeDefined();
      expect(recovery.saveVideoTask).toBeDefined();
      expect(recovery.verifyVideoUrl).toBeDefined();
      expect(recovery.checkForDuplicateVideos).toBeDefined();
      expect(recovery.smartRetryEngine).toBeDefined();
      expect(recovery.performIntelligentRecovery).toBeDefined();
    }, TIMEOUT);

    it("utils 子域应正确导出工具函数", async () => {
      const utils = await import("../utils");
      expect(utils.detectVideoCodec).toBeDefined();
      expect(utils.extractVideoFrames).toBeDefined();
      expect(utils.downloadJSONFile).toBeDefined();
      expect(utils.videoTemplates).toBeDefined();
      expect(utils.getTemplatesByCategory).toBeDefined();
    }, TIMEOUT);
  });

  describe("模块根 index.ts: 三级导出结构验证", () => {
    it("应从根 index.ts 导出所有子域的公共 API", async () => {
      const video = await import("../index");
      expect(video.useVideoTaskManager).toBeDefined();
      expect(video.useVideoCacheStats).toBeDefined();
      expect(video.recoverVideoByTaskId).toBeDefined();
      expect(video.detectVideoCodec).toBeDefined();
      expect(video.VideoTaskManager).toBeDefined();
      expect(video.VideoTaskManagerInitializer).toBeDefined();
    }, TIMEOUT);

    it("应导出 recovery 子域的验证和重试 API", async () => {
      const video = await import("../index");
      expect(video.verifyVideoUrl).toBeDefined();
      expect(video.checkForDuplicateVideos).toBeDefined();
      expect(video.smartRetryEngine).toBeDefined();
      expect(video.performIntelligentRecovery).toBeDefined();
    }, TIMEOUT);
  });
});
