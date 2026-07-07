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

import { LumaPlugin } from "../luma";
import type { VideoBuildContext } from "../../types";

describe("LumaPlugin", () => {
  let plugin: LumaPlugin;

  beforeEach(() => {
    plugin = new LumaPlugin();
  });

  describe("identity & capabilities", () => {
    it("should have correct id and displayName", () => {
      expect(plugin.id).toBe("luma");
      expect(plugin.displayName).toBe("Luma Dream Machine");
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
      expect(plugin.videoCapabilities.supportsLastFrame).toBe(true);
      expect(plugin.videoCapabilities.supportsCharacterRef).toBe(false);
      expect(plugin.videoCapabilities.supportsSceneRef).toBe(false);
      expect(plugin.videoCapabilities.maxDuration).toBe(9);
      expect(plugin.videoCapabilities.defaultModel).toBe("dream-machine-1.6");
      expect(plugin.videoCapabilities.imageUploadMode).toBe("url");
    });
  });

  describe("match & matchPatterns", () => {
    it("should match api.lumalabs.ai URLs", () => {
      expect(plugin.match("https://api.lumalabs.ai/v1")).toBe(true);
    });

    it("should match model containing 'dream-machine'", () => {
      expect(plugin.match("https://some-api.com/v1", "dream-machine-1.6")).toBe(true);
    });

    it("should not match unrelated URLs without dream-machine model", () => {
      expect(plugin.match("https://api.openai.com/v1", "gpt-4")).toBe(false);
    });

    it("should not match unrelated URLs without model", () => {
      expect(plugin.match("https://api.openai.com/v1")).toBe(false);
    });

    it("should have correct matchPatterns", () => {
      expect(plugin.matchPatterns).toEqual([
        { urlPattern: "api.lumalabs.ai" },
        { urlPattern: "", modelPattern: "dream-machine" },
      ]);
    });
  });

  describe("buildVideoRequest", () => {
    it("should build basic request with prompt and default model", () => {
      const ctx: VideoBuildContext = { prompt: "a dog running", duration: 5 };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.prompt).toBe("a dog running");
      expect(result.body.model).toBe("dream-machine-1.6");
      expect(result.body.aspect_ratio).toBe("16:9");
      expect(result.endpoint).toBe("/generations");
    });

    it("should use provided model over default", () => {
      const ctx: VideoBuildContext = { prompt: "a dog", model: "dream-machine-2.0", duration: 5 };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.model).toBe("dream-machine-2.0");
    });

    it("should include image_url when firstFrameUrl is provided", () => {
      const ctx: VideoBuildContext = {
        prompt: "a dog",
        firstFrameUrl: "https://img.example.com/first.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.image_url).toBe("https://img.example.com/first.png");
    });

    it("should include end_image_url when lastFrameUrl is provided", () => {
      const ctx: VideoBuildContext = {
        prompt: "a dog",
        lastFrameUrl: "https://img.example.com/last.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.end_image_url).toBe("https://img.example.com/last.png");
    });

    it("should include both image_url and end_image_url when both frames provided", () => {
      const ctx: VideoBuildContext = {
        prompt: "a dog",
        firstFrameUrl: "https://img.example.com/first.png",
        lastFrameUrl: "https://img.example.com/last.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.image_url).toBe("https://img.example.com/first.png");
      expect(result.body.end_image_url).toBe("https://img.example.com/last.png");
    });

    it("should not include image_url or end_image_url when absent", () => {
      const ctx: VideoBuildContext = { prompt: "a dog", duration: 5 };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.image_url).toBeUndefined();
      expect(result.body.end_image_url).toBeUndefined();
    });
  });

  describe("extractTaskId", () => {
    it("should extract from response.id", () => {
      const response = { id: "luma-task-123" };
      expect(plugin.extractTaskId(response)).toBe("luma-task-123");
    });

    it("should fall back to response.task_id", () => {
      const response = { task_id: "luma-task-456" };
      expect(plugin.extractTaskId(response)).toBe("luma-task-456");
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
    it("should extract from response.assets.video", () => {
      const response = { assets: { video: "https://cdn.luma.ai/video.mp4" } };
      expect(plugin.extractVideoUrl(response)).toBe("https://cdn.luma.ai/video.mp4");
    });

    it("should fall back to response.video_url", () => {
      const response = { video_url: "https://cdn.luma.ai/video2.mp4" };
      expect(plugin.extractVideoUrl(response)).toBe("https://cdn.luma.ai/video2.mp4");
    });

    it("should fall back to response.url", () => {
      const response = { url: "https://cdn.luma.ai/video3.mp4" };
      expect(plugin.extractVideoUrl(response)).toBe("https://cdn.luma.ai/video3.mp4");
    });

    it("should prefer assets.video over top-level fields", () => {
      const response = { assets: { video: "inner.mp4" }, video_url: "outer.mp4" };
      expect(plugin.extractVideoUrl(response)).toBe("inner.mp4");
    });

    it("should return undefined when no url found", () => {
      expect(plugin.extractVideoUrl({})).toBeUndefined();
    });
  });

  describe("extractStatus", () => {
    it("should map 'completed' to 'completed'", () => {
      const response = { state: "completed" };
      expect(plugin.extractStatus(response).status).toBe("completed");
    });

    it("should map 'failed' to 'failed'", () => {
      const response = { state: "failed" };
      expect(plugin.extractStatus(response).status).toBe("failed");
    });

    it("should map 'dreaming' to 'generating'", () => {
      const response = { state: "dreaming" };
      expect(plugin.extractStatus(response).status).toBe("generating");
    });

    it("should map unknown state to 'generating'", () => {
      const response = { state: "queued" };
      expect(plugin.extractStatus(response).status).toBe("generating");
    });

    it("should default to 'generating' when no state or status field", () => {
      const response = {};
      expect(plugin.extractStatus(response).status).toBe("generating");
    });

    it("should fall back to response.status when state is absent", () => {
      const response = { status: "completed" };
      expect(plugin.extractStatus(response).status).toBe("completed");
    });

    it("should extract error message from response.error", () => {
      const response = { state: "failed", error: "content policy violation" };
      const result = plugin.extractStatus(response);
      expect(result.status).toBe("failed");
      expect(result.message).toBe("content policy violation");
    });

    it("should extract error message from response.failure_reason", () => {
      const response = { state: "failed", failure_reason: "timeout" };
      const result = plugin.extractStatus(response);
      expect(result.message).toBe("timeout");
    });

    it("should prefer error over failure_reason", () => {
      const response = { state: "failed", error: "primary", failure_reason: "secondary" };
      const result = plugin.extractStatus(response);
      expect(result.message).toBe("primary");
    });
  });

  describe("getVideoStatusEndpoint", () => {
    it("should return correct status URL", () => {
      const url = plugin.getVideoStatusEndpoint("https://api.lumalabs.ai/v1", "task-123");
      expect(url).toBe("https://api.lumalabs.ai/v1/generations/task-123");
    });
  });

  describe("getModelCapabilities", () => {
    it("should return capabilities with supportsLastFrame true", () => {
      const caps = plugin.getModelCapabilities("dream-machine-1.6");
      expect(caps.supportsLastFrame).toBe(true);
      expect(caps.supportsCharacterRef).toBe(false);
      expect(caps.supportsSceneRef).toBe(false);
      expect(caps.referenceMode).toBe("merged");
    });

    it("should return supported image sizes", () => {
      const caps = plugin.getModelCapabilities("dream-machine-1.6");
      expect(caps.supportedImageSizes).toHaveLength(3);
    });
  });

  describe("getCloudInfo", () => {
    it("should return correct cloud info", () => {
      const info = plugin.getCloudInfo("https://api.lumalabs.ai/v1");
      expect(info.name).toBe("Luma AI");
      expect(info.websiteUrl).toBe("https://lumalabs.ai");
      expect(info.taskUrlPattern("task-1")).toBe("https://lumalabs.ai/dream-machine/task-1");
      expect(info.queryEndpoint("https://api.lumalabs.ai/v1", "task-1")).toBe(
        "https://api.lumalabs.ai/v1/generations/task-1",
      );
    });
  });
});
