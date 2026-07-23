/**
 * generation-routes.ts 路由 handler 测试
 *
 * 重点验证：
 * 1. schema 校验：generate-image / generate-video / generate-text 的入参校验
 *    - generate-image 必须有 prompt（PrismCraft 第四章新增参考图字段：referenceImageUrl/characterImageUrl/sceneImageUrl/previousFrameUrl）
 *    - generate-text 必须有 prompt
 *    - generate-video 所有字段均为 optional（prompt 在 api-gateway 内部校验，返回 empty_prompt）
 * 2. handler 调用：mock apiGateway，验证 handler 正确转发并透传结果
 * 3. 错误传播：API_NOT_CONFIGURED / UNKNOWN_PROVIDER 等 provider 错误正确透传
 *
 * 参考 shot-routes.test.ts 的 mock 模式。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type http from "http";

// ── hoisted mocks ──────────────────────────────────────────────────────
const {
  mockGenerateImage,
  mockGenerateVideo,
  mockGenerateText,
  mockAnalyzeImage,
  mockGenerateKeyframe,
  mockGenerateFramePair,
  mockVideoStatus,
  mockGenerateStoryPlanWithValidation,
  mockBuildVideoGenerationParams,
  mockBuildKeyframeGenerationParams,
  mockBuildFramePairGenerationParams,
  mockBuildQuickVideoParams,
  mockGenerateCharacterImagePrompt,
  mockGenerateSceneImagePrompt,
  mockGenerateCharacterAnalysisPrompt,
  mockGenerateSceneAnalysisPrompt,
  mockGenerateFirstFramePrompt,
  mockGenerateLastFramePrompt,
  mockGenerateCharacterDetailedPromptInstruction,
  mockGenerateScenePromptOptimization,
} = vi.hoisted(() => ({
  mockGenerateImage: vi.fn(),
  mockGenerateVideo: vi.fn(),
  mockGenerateText: vi.fn(),
  mockAnalyzeImage: vi.fn(),
  mockGenerateKeyframe: vi.fn(),
  mockGenerateFramePair: vi.fn(),
  mockVideoStatus: vi.fn(),
  mockGenerateStoryPlanWithValidation: vi.fn(),
  mockBuildVideoGenerationParams: vi.fn(),
  mockBuildKeyframeGenerationParams: vi.fn(),
  mockBuildFramePairGenerationParams: vi.fn(),
  mockBuildQuickVideoParams: vi.fn(),
  mockGenerateCharacterImagePrompt: vi.fn(),
  mockGenerateSceneImagePrompt: vi.fn(),
  mockGenerateCharacterAnalysisPrompt: vi.fn(),
  mockGenerateSceneAnalysisPrompt: vi.fn(),
  mockGenerateFirstFramePrompt: vi.fn(),
  mockGenerateLastFramePrompt: vi.fn(),
  mockGenerateCharacterDetailedPromptInstruction: vi.fn(),
  mockGenerateScenePromptOptimization: vi.fn(),
}));

vi.mock("../../../api-gateway", () => ({
  generateImage: mockGenerateImage,
  generateVideo: mockGenerateVideo,
  generateText: mockGenerateText,
  analyzeImage: mockAnalyzeImage,
  generateKeyframe: mockGenerateKeyframe,
  generateFramePair: mockGenerateFramePair,
  videoStatus: mockVideoStatus,
}));

vi.mock("@shared-logic/story/story-service", () => ({
  generateStoryPlanWithValidation: mockGenerateStoryPlanWithValidation,
}));

vi.mock("@shared-logic/video/video-task-params", () => ({
  buildVideoGenerationParams: mockBuildVideoGenerationParams,
  buildKeyframeGenerationParams: mockBuildKeyframeGenerationParams,
  buildFramePairGenerationParams: mockBuildFramePairGenerationParams,
  buildQuickVideoParams: mockBuildQuickVideoParams,
}));

vi.mock("@shared-logic/prompt/prompt-service", () => ({
  generateCharacterImagePrompt: mockGenerateCharacterImagePrompt,
  generateSceneImagePrompt: mockGenerateSceneImagePrompt,
  generateCharacterAnalysisPrompt: mockGenerateCharacterAnalysisPrompt,
  generateSceneAnalysisPrompt: mockGenerateSceneAnalysisPrompt,
  generateFirstFramePrompt: mockGenerateFirstFramePrompt,
  generateLastFramePrompt: mockGenerateLastFramePrompt,
  generateCharacterDetailedPromptInstruction: mockGenerateCharacterDetailedPromptInstruction,
  generateScenePromptOptimization: mockGenerateScenePromptOptimization,
}));

import { generationRoutes } from "../generation-routes";
import {
  generateImageSchema,
  generateVideoSchema,
  generateTextSchema,
} from "../../schemas";

const mockReq = {} as http.IncomingMessage;

describe("generation-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 路由注册 ───────────────────────────────────────────────────────
  describe("路由注册", () => {
    it("应注册核心生成路由（image/video/text）", () => {
      const expectedRoutes = [
        "generate-image",
        "generate-video",
        "generate-text",
        "generate-keyframe",
        "generate-frame-pair",
        "video-status",
        "analyze-image",
      ];
      expectedRoutes.forEach((route) => {
        expect(generationRoutes[route]).toBeDefined();
        expect(generationRoutes[route].methods).toContain("POST");
      });
    });

    it("generate-image / generate-video / generate-text 应有 schema", () => {
      expect(generationRoutes["generate-image"].schema).toBeDefined();
      expect(generationRoutes["generate-video"].schema).toBeDefined();
      expect(generationRoutes["generate-text"].schema).toBeDefined();
    });
  });

  // ── schema 校验 ─────────────────────────────────────────────────
  describe("schema 校验", () => {
    describe("generate-image schema", () => {
      it("缺少 prompt 时 schema 应拒绝", () => {
        const result = generateImageSchema.safeParse({
          size: "1024x1024",
          providerId: "openai",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(
            result.error.issues.some((i) => i.path.includes("prompt")),
          ).toBe(true);
        }
      });

      it("仅 prompt 时 schema 应接受", () => {
        const result = generateImageSchema.safeParse({ prompt: "a cat" });
        expect(result.success).toBe(true);
      });

      it("带 PrismCraft 第四章参考图字段时 schema 应接受", () => {
        const result = generateImageSchema.safeParse({
          prompt: "a cat in a scene",
          referenceImageUrl: "http://example.com/ref.png",
          characterImageUrl: "http://example.com/char.png",
          sceneImageUrl: "http://example.com/scene.png",
          previousFrameUrl: "http://example.com/prev.png",
          size: "1024x1024",
          providerId: "openai",
          modelId: "dall-e-3",
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.referenceImageUrl).toBe("http://example.com/ref.png");
          expect(result.data.characterImageUrl).toBe("http://example.com/char.png");
          expect(result.data.sceneImageUrl).toBe("http://example.com/scene.png");
          expect(result.data.previousFrameUrl).toBe("http://example.com/prev.png");
        }
      });
    });

    describe("generate-video schema", () => {
      // 注：generateVideoSchema 所有字段都是 optional（包括 prompt）。
      // prompt 为空的校验在 api-gateway.ts 内部进行（返回 empty_prompt）。
      it("空 body 时 schema 应接受（所有字段可选）", () => {
        const result = generateVideoSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      it("完整视频生成参数 schema 应接受", () => {
        const result = generateVideoSchema.safeParse({
          prompt: "a running cat",
          imageUrl: "http://example.com/img.png",
          firstFrameUrl: "http://example.com/first.png",
          lastFrameUrl: "http://example.com/last.png",
          characterRef: "char-1",
          characterRefs: ["char-1", "char-2"],
          sceneRef: "scene-1",
          referenceVideo: {
            videoUrl: "http://example.com/ref.mp4",
            mimicryLevel: "high",
          },
          duration: 5,
          providerId: "kling",
          modelId: "v1",
          format: "mp4",
        });
        expect(result.success).toBe(true);
      });

      it("referenceVideo 字符串形式 schema 应接受", () => {
        const result = generateVideoSchema.safeParse({
          prompt: "a cat",
          referenceVideo: "http://example.com/ref.mp4",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("generate-text schema", () => {
      it("缺少 prompt 时 schema 应拒绝", () => {
        const result = generateTextSchema.safeParse({
          maxTokens: 100,
          temperature: 0.7,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(
            result.error.issues.some((i) => i.path.includes("prompt")),
          ).toBe(true);
        }
      });

      it("仅 prompt 时 schema 应接受", () => {
        const result = generateTextSchema.safeParse({ prompt: "hello" });
        expect(result.success).toBe(true);
      });

      it("完整参数 schema 应接受", () => {
        const result = generateTextSchema.safeParse({
          prompt: "hello",
          maxTokens: 100,
          temperature: 0.7,
          providerId: "openai",
          modelId: "gpt-4",
        });
        expect(result.success).toBe(true);
      });
    });
  });

  // ── generate-image handler ──────────────────────────────────────
  describe("generate-image handler", () => {
    it("成功路径：应调用 apiGateway.generateImage 并透传 imageUrl", async () => {
      mockGenerateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "http://example.com/generated.png" },
      });
      const body = {
        prompt: "a cat",
        size: "1024x1024",
        providerId: "openai",
      };
      const route = generationRoutes["generate-image"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: { imageUrl?: string };
      };

      expect(mockGenerateImage).toHaveBeenCalledWith(body);
      expect(result.success).toBe(true);
      expect(result.data?.imageUrl).toBe("http://example.com/generated.png");
    });

    it("失败路径：应透传 apiGateway.generateImage 的错误", async () => {
      mockGenerateImage.mockResolvedValue({
        success: false,
        error: { code: "provider_error", message: "rate limited" },
        httpStatus: 429,
      });
      const body = { prompt: "a cat" };
      const route = generationRoutes["generate-image"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        error?: { code: string; message: string };
        httpStatus?: number;
      };

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: "provider_error",
        message: "rate limited",
      });
      expect(result.httpStatus).toBe(429);
    });

    it("应传递 PrismCraft 第四章参考图字段到 apiGateway", async () => {
      mockGenerateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: "http://x" },
      });
      const body = {
        prompt: "compose scene",
        referenceImageUrl: "http://example.com/ref.png",
        characterImageUrl: "http://example.com/char.png",
        sceneImageUrl: "http://example.com/scene.png",
        previousFrameUrl: "http://example.com/prev.png",
      };
      const route = generationRoutes["generate-image"];
      await route.handler("POST", body, mockReq);

      expect(mockGenerateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImageUrl: "http://example.com/ref.png",
          characterImageUrl: "http://example.com/char.png",
          sceneImageUrl: "http://example.com/scene.png",
          previousFrameUrl: "http://example.com/prev.png",
        }),
      );
    });
  });

  // ── generate-video handler ──────────────────────────────────────
  describe("generate-video handler", () => {
    it("成功路径：应调用 apiGateway.generateVideo 并返回 taskId", async () => {
      mockGenerateVideo.mockResolvedValue({
        success: true,
        data: { taskId: "task-abc-123", videoUrl: null, status: "processing" },
      });
      const body = {
        prompt: "a running cat",
        firstFrameUrl: "http://example.com/first.png",
        duration: 5,
        providerId: "kling",
      };
      const route = generationRoutes["generate-video"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: { taskId?: string };
      };

      expect(mockGenerateVideo).toHaveBeenCalledWith(body);
      expect(result.success).toBe(true);
      expect(result.data?.taskId).toBe("task-abc-123");
    });

    it("失败路径：应透传 apiGateway.generateVideo 的错误", async () => {
      mockGenerateVideo.mockResolvedValue({
        success: false,
        error: "network_error",
        httpStatus: 502,
      });
      const body = { prompt: "a cat" };
      const route = generationRoutes["generate-video"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        error?: string;
        httpStatus?: number;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe("network_error");
      expect(result.httpStatus).toBe(502);
    });
  });

  // ── generate-text handler ────────────────────────────────────────
  describe("generate-text handler", () => {
    it("成功路径：应调用 apiGateway.generateText 并返回 text", async () => {
      mockGenerateText.mockResolvedValue({
        success: true,
        data: { text: "Hello, world!" },
      });
      const body = {
        prompt: "Say hello",
        maxTokens: 100,
        temperature: 0.7,
      };
      const route = generationRoutes["generate-text"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: { text?: string };
      };

      expect(mockGenerateText).toHaveBeenCalledWith(body);
      expect(result.success).toBe(true);
      expect(result.data?.text).toBe("Hello, world!");
    });

    it("失败路径：应透传 apiGateway.generateText 的错误", async () => {
      mockGenerateText.mockResolvedValue({
        success: false,
        error: { code: "provider_error", message: "model not found" },
        httpStatus: 400,
      });
      const body = { prompt: "hello" };
      const route = generationRoutes["generate-text"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        error?: { code: string; message: string };
      };

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        code: "provider_error",
        message: "model not found",
      });
    });
  });

  // ── 错误传播（provider 层错误透传） ──────────────────────────────
  // 这些错误实际由 api-gateway.ts 内部生成（检查 effectiveApiKey / plugin），
  // 路由层仅做透传。这里通过 mock 模拟 gateway 返回的 error 结构。
  describe("错误传播（provider 层错误）", () => {
    it("generate-video 在 provider 未配置时应返回 API_NOT_CONFIGURED", async () => {
      // 模拟 api-gateway.ts 中 generateVideo 在 !effectiveApiKey 时的返回
      mockGenerateVideo.mockResolvedValue({
        success: false,
        error: { code: "api_not_configured", message: "video" },
        code: "api_not_configured",
        httpStatus: 400,
      });
      const route = generationRoutes["generate-video"];
      const result = (await route.handler("POST", { prompt: "x" }, mockReq)) as {
        success: boolean;
        error?: { code: string; message: string };
        code?: string;
        httpStatus?: number;
      };

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("api_not_configured");
      expect(result.code).toBe("api_not_configured");
      expect(result.httpStatus).toBe(400);
    });

    it("generate-video 在 provider 未知时应返回 UNKNOWN_PROVIDER", async () => {
      // 模拟 api-gateway.ts 中 generateVideo 在 !plugin 时的返回
      mockGenerateVideo.mockResolvedValue({
        success: false,
        error: "unknown_provider",
        code: "unknown_provider",
        httpStatus: 400,
      });
      const route = generationRoutes["generate-video"];
      const result = (await route.handler("POST", { prompt: "x" }, mockReq)) as {
        success: boolean;
        error?: string;
        code?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe("unknown_provider");
      expect(result.code).toBe("unknown_provider");
    });

    it("generate-image 在 provider 未配置时应返回 API_NOT_CONFIGURED", async () => {
      mockGenerateImage.mockResolvedValue({
        success: false,
        error: { code: "api_not_configured", message: "image" },
        code: "api_not_configured",
        httpStatus: 400,
      });
      const route = generationRoutes["generate-image"];
      const result = (await route.handler("POST", { prompt: "x" }, mockReq)) as {
        success: boolean;
        error?: { code: string; message: string };
      };

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("api_not_configured");
    });

    it("generate-text 在 provider 未配置时应返回 API_NOT_CONFIGURED", async () => {
      mockGenerateText.mockResolvedValue({
        success: false,
        error: { code: "api_not_configured", message: "text" },
        code: "api_not_configured",
        httpStatus: 400,
      });
      const route = generationRoutes["generate-text"];
      const result = (await route.handler("POST", { prompt: "x" }, mockReq)) as {
        success: boolean;
        error?: { code: string; message: string };
      };

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("api_not_configured");
    });
  });

  // ── 其他生成路由的 handler 基础验证 ──────────────────────────────
  describe("其他生成路由 handler", () => {
    it("analyze-image 应调用 apiGateway.analyzeImage", async () => {
      mockAnalyzeImage.mockResolvedValue({
        success: true,
        data: { description: "a cat" },
      });
      const body = { image: "data:image/png;base64,xxx", prompt: "describe" };
      const route = generationRoutes["analyze-image"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: { description?: string };
      };

      expect(mockAnalyzeImage).toHaveBeenCalledWith(body);
      expect(result.success).toBe(true);
      expect(result.data?.description).toBe("a cat");
    });

    it("generate-keyframe 应调用 apiGateway.generateKeyframe", async () => {
      mockGenerateKeyframe.mockResolvedValue({
        success: true,
        data: { imageUrl: "http://example.com/kf.png" },
      });
      const body = { prompt: "keyframe", characterRef: "char-1" };
      const route = generationRoutes["generate-keyframe"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: { imageUrl?: string };
      };

      expect(mockGenerateKeyframe).toHaveBeenCalledWith(body);
      expect(result.data?.imageUrl).toBe("http://example.com/kf.png");
    });

    it("video-status 应支持 GET 和 POST 方法", async () => {
      mockVideoStatus.mockResolvedValue({
        success: true,
        data: { taskId: "t-1", status: "completed", videoUrl: "http://x/v.mp4" },
      });
      const route = generationRoutes["video-status"];
      expect(route.methods).toContain("GET");
      expect(route.methods).toContain("POST");

      const result = (await route.handler("POST", { taskId: "t-1" }, mockReq)) as {
        success: boolean;
        data?: { status?: string };
      };

      expect(mockVideoStatus).toHaveBeenCalledWith({ taskId: "t-1" });
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("completed");
    });
  });

  // ── story/plan 路由 ─────────────────────────────────────────────
  describe("story/plan handler", () => {
    it("应调用 storyService.generateStoryPlanWithValidation 并包装为 { success: true, data }", async () => {
      mockGenerateStoryPlanWithValidation.mockResolvedValue({ beats: [] });
      const body = {
        story: { title: "T" },
        characters: [{ id: "c1" }],
        scenes: [{ id: "s1" }],
        options: { model: "gpt-4" },
        planPrompt: "custom plan",
      };
      const route = generationRoutes["story/plan"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: unknown;
      };

      expect(mockGenerateStoryPlanWithValidation).toHaveBeenCalledWith(
        body.story,
        body.characters,
        body.scenes,
        expect.objectContaining({ model: "gpt-4", planPrompt: "custom plan" }),
        expect.any(Function),
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ beats: [] });
    });

    it("body 缺少 story/characters/scenes 时应使用默认空值", async () => {
      mockGenerateStoryPlanWithValidation.mockResolvedValue({ ok: true });
      const route = generationRoutes["story/plan"];
      await route.handler("POST", { planPrompt: "p" }, mockReq);

      expect(mockGenerateStoryPlanWithValidation).toHaveBeenCalledWith(
        {},
        [],
        [],
        expect.objectContaining({ planPrompt: "p" }),
        expect.any(Function),
      );
    });
  });
});
