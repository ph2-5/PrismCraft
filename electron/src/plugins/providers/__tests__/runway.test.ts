import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../utils", () => ({
  ensureAccessibleUrl: vi.fn((url: string) => url),
  downloadAsBase64: vi.fn(() => Promise.resolve("base64data")),
  resolveLocalUrlToBase64: vi.fn(() => Promise.resolve("data:image/png;base64,localdata")),
  stripDataUriPrefix: vi.fn((s: string) => s.replace(/^data:[^;]+;base64,/, "")),
  urlToPureBase64: vi.fn((s: string) => s.replace(/^data:[^;]+;base64,/, "")),
}));

import { RunwayPlugin } from "../runway";
import type { VideoBuildContext } from "../../types";

describe("RunwayPlugin", () => {
  let plugin: RunwayPlugin;

  beforeEach(() => {
    plugin = new RunwayPlugin();
  });

  describe("identity & capabilities", () => {
    it("should have correct id and displayName", () => {
      expect(plugin.id).toBe("runway");
      expect(plugin.displayName).toBe("Runway");
    });

    it("should have correct provider capabilities", () => {
      expect(plugin.capabilities).toEqual({
        video: true,
        image: false,
        text: false,
        vision: false,
      });
    });

    it("should have correct videoCapabilities", () => {
      expect(plugin.videoCapabilities.supportsLastFrame).toBe(false);
      expect(plugin.videoCapabilities.supportsCharacterRef).toBe(false);
      expect(plugin.videoCapabilities.supportsSceneRef).toBe(false);
      expect(plugin.videoCapabilities.maxDuration).toBe(10);
      // gen3a_turbo 已 deprecated (2026-07-30 sunset)，默认模型迁移到 gen4_turbo
      expect(plugin.videoCapabilities.defaultModel).toBe("gen4_turbo");
      expect(plugin.videoCapabilities.imageUploadMode).toBe("url");
    });
  });

  describe("match & matchPatterns", () => {
    it("should match api.dev.runwayml.com URLs", () => {
      expect(plugin.match("https://api.dev.runwayml.com/v1")).toBe(true);
    });

    it("should match runwayml.com URLs", () => {
      expect(plugin.match("https://api.runwayml.com/v1")).toBe(true);
    });

    it("should match model containing 'gen3' (backward compat)", () => {
      expect(plugin.match("https://some-api.com/v1", "gen3a_turbo")).toBe(true);
    });

    it("should match model containing 'gen4'", () => {
      expect(plugin.match("https://some-api.com/v1", "gen4_turbo")).toBe(true);
      expect(plugin.match("https://some-api.com/v1", "gen4.5")).toBe(true);
    });

    it("should not match unrelated URLs without gen3/gen4 model", () => {
      expect(plugin.match("https://api.openai.com/v1", "gpt-4")).toBe(false);
    });

    it("should not match unrelated URLs without model", () => {
      expect(plugin.match("https://api.openai.com/v1")).toBe(false);
    });

    it("should have correct matchPatterns", () => {
      expect(plugin.matchPatterns).toEqual([
        { urlPattern: "api.dev.runwayml.com" },
        { urlPattern: "", modelPattern: "gen3a" },
      ]);
    });
  });

  describe("buildVideoRequest", () => {
    it("should build basic request with promptText and default model", () => {
      const ctx: VideoBuildContext = { prompt: "a bird flying", duration: 5 };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.promptText).toBe("a bird flying");
      expect(result.body.model).toBe("gen4_turbo");
      expect(result.endpoint).toBe("/image_to_video");
    });

    it("should use provided model over default", () => {
      const ctx: VideoBuildContext = { prompt: "a bird", model: "gen3a_alpha", duration: 5 };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.model).toBe("gen3a_alpha");
    });

    it("should include promptImage when firstFrameUrl is provided", () => {
      const ctx: VideoBuildContext = {
        prompt: "a bird",
        firstFrameUrl: "https://img.example.com/first.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.promptImage).toBe("https://img.example.com/first.png");
    });

    it("should not include promptImage when firstFrameUrl is absent", () => {
      const ctx: VideoBuildContext = { prompt: "a bird", duration: 5 };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.promptImage).toBeUndefined();
    });

    it("should cap duration at maxDuration (10)", () => {
      const ctx: VideoBuildContext = { prompt: "a bird", duration: 15 };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.duration).toBe(10);
    });

    it("should pass duration as-is when within limit", () => {
      const ctx: VideoBuildContext = { prompt: "a bird", duration: 5 };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.duration).toBe(5);
    });
  });

  describe("extractTaskId", () => {
    it("should extract from response.id", () => {
      const response = { id: "runway-task-123" };
      expect(plugin.extractTaskId(response)).toBe("runway-task-123");
    });

    it("should fall back to response.task_id", () => {
      const response = { task_id: "runway-task-456" };
      expect(plugin.extractTaskId(response)).toBe("runway-task-456");
    });

    it("should prefer id over task_id", () => {
      const response = { id: "primary-id", task_id: "fallback-id" };
      expect(plugin.extractTaskId(response)).toBe("primary-id");
    });

    it("should return undefined when no id found", () => {
      expect(plugin.extractTaskId({})).toBeUndefined();
    });
  });

  describe("extractVideoUrl", () => {
    it("should extract from response.output[0]", () => {
      const response = { output: ["https://cdn.runwayml.com/video.mp4"] };
      expect(plugin.extractVideoUrl(response)).toBe("https://cdn.runwayml.com/video.mp4");
    });

    it("should fall back to response.video_url when output is empty", () => {
      const response = { output: [], video_url: "https://cdn.runwayml.com/video2.mp4" };
      expect(plugin.extractVideoUrl(response)).toBe("https://cdn.runwayml.com/video2.mp4");
    });

    it("should fall back to response.url when no output or video_url", () => {
      const response = { url: "https://cdn.runwayml.com/video3.mp4" };
      expect(plugin.extractVideoUrl(response)).toBe("https://cdn.runwayml.com/video3.mp4");
    });

    it("should prefer output[0] over top-level fields", () => {
      const response = { output: ["inner.mp4"], video_url: "outer.mp4" };
      expect(plugin.extractVideoUrl(response)).toBe("inner.mp4");
    });

    it("should return undefined when output is not an array", () => {
      const response = { output: "not-an-array" };
      expect(plugin.extractVideoUrl(response)).toBeUndefined();
    });

    it("should return undefined when no url found", () => {
      expect(plugin.extractVideoUrl({})).toBeUndefined();
    });
  });

  describe("extractStatus", () => {
    it("should map 'SUCCEEDED' to 'completed'", () => {
      const response = { status: "SUCCEEDED" };
      expect(plugin.extractStatus(response).status).toBe("completed");
    });

    it("should map 'FAILED' to 'failed'", () => {
      const response = { status: "FAILED" };
      expect(plugin.extractStatus(response).status).toBe("failed");
    });

    it("should map 'RUNNING' to 'generating'", () => {
      const response = { status: "RUNNING" };
      expect(plugin.extractStatus(response).status).toBe("generating");
    });

    it("should map unknown status to 'generating'", () => {
      const response = { status: "PENDING" };
      expect(plugin.extractStatus(response).status).toBe("generating");
    });

    it("should default to 'generating' when no status field", () => {
      const response = {};
      expect(plugin.extractStatus(response).status).toBe("generating");
    });

    it("should extract progress from response", () => {
      const response = { status: "RUNNING", progress: 0.75 };
      const result = plugin.extractStatus(response);
      expect(result.progress).toBe(0.75);
    });

    it("should extract error message from response.error", () => {
      const response = { status: "FAILED", error: "internal error" };
      const result = plugin.extractStatus(response);
      expect(result.status).toBe("failed");
      expect(result.message).toBe("internal error");
    });

    it("should extract error message from response.failure", () => {
      const response = { status: "FAILED", failure: "gpu oom" };
      const result = plugin.extractStatus(response);
      expect(result.message).toBe("gpu oom");
    });

    it("should prefer error over failure", () => {
      const response = { status: "FAILED", error: "primary", failure: "secondary" };
      const result = plugin.extractStatus(response);
      expect(result.message).toBe("primary");
    });
  });

  describe("getVideoStatusEndpoint", () => {
    it("should return correct status URL", () => {
      const url = plugin.getVideoStatusEndpoint("https://api.dev.runwayml.com/v1", "task-123");
      expect(url).toBe("https://api.dev.runwayml.com/v1/tasks/task-123");
    });
  });

  describe("getModelCapabilities", () => {
    it("should return capabilities with referenceMode merged", () => {
      const caps = plugin.getModelCapabilities("gen3a_turbo");
      expect(caps.referenceMode).toBe("merged");
      expect(caps.supportsCharacterRef).toBe(false);
      expect(caps.supportsSceneRef).toBe(false);
      expect(caps.supportsLastFrame).toBe(false);
    });

    it("should return supported image sizes", () => {
      const caps = plugin.getModelCapabilities("gen3a_turbo");
      expect(caps.supportedImageSizes).toHaveLength(3);
    });
  });

  describe("getCloudInfo", () => {
    it("should return correct cloud info", () => {
      const info = plugin.getCloudInfo("https://api.dev.runwayml.com/v1");
      expect(info.name).toBe("Runway");
      expect(info.websiteUrl).toBe("https://runwayml.com");
      expect(info.taskUrlPattern("task-1")).toBe("https://runwayml.com/tasks/task-1");
      expect(info.queryEndpoint("https://api.dev.runwayml.com/v1", "task-1")).toBe(
        "https://api.dev.runwayml.com/v1/tasks/task-1",
      );
    });
  });
});
