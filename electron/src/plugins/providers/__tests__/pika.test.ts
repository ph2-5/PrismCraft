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

import { PikaPlugin } from "../pika";
import type { VideoBuildContext } from "../../types";

describe("PikaPlugin", () => {
  let plugin: PikaPlugin;

  beforeEach(() => {
    plugin = new PikaPlugin();
  });

  describe("identity & capabilities", () => {
    it("should have correct id and displayName", () => {
      expect(plugin.id).toBe("pika");
      expect(plugin.displayName).toBe("Pika");
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
      expect(plugin.videoCapabilities.defaultModel).toBe("pika-2.2");
      expect(plugin.videoCapabilities.imageUploadMode).toBe("url");
    });
  });

  describe("match & matchPatterns", () => {
    it("should match api.pika.art URLs", () => {
      expect(plugin.match("https://api.pika.art/v1")).toBe(true);
    });

    it("should match model containing 'pika'", () => {
      expect(plugin.match("https://some-api.com/v1", "pika-2.2")).toBe(true);
    });

    it("should not match unrelated URLs without pika model", () => {
      expect(plugin.match("https://api.openai.com/v1", "gpt-4")).toBe(false);
    });

    it("should not match unrelated URLs without model", () => {
      expect(plugin.match("https://api.openai.com/v1")).toBe(false);
    });

    it("should have correct matchPatterns", () => {
      expect(plugin.matchPatterns).toEqual([
        { urlPattern: "api.pika.art" },
        { urlPattern: "", modelPattern: "pika" },
      ]);
    });
  });

  describe("buildVideoRequest", () => {
    it("should build basic request with prompt and default model", () => {
      const ctx: VideoBuildContext = { prompt: "a cat running", duration: 5 };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.prompt).toBe("a cat running");
      expect(result.body.model).toBe("pika-2.2");
      expect(result.body.aspect_ratio).toBe("16:9");
      expect(result.endpoint).toBe("/video/generate");
    });

    it("should use provided model over default", () => {
      const ctx: VideoBuildContext = { prompt: "a cat", model: "pika-3.0", duration: 5 };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.model).toBe("pika-3.0");
    });

    it("should include image_url when firstFrameUrl is provided", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat",
        firstFrameUrl: "https://img.example.com/first.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.image_url).toBe("https://img.example.com/first.png");
    });

    it("should not include image_url when firstFrameUrl is absent", () => {
      const ctx: VideoBuildContext = { prompt: "a cat", duration: 5 };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.image_url).toBeUndefined();
    });

    it("should cap duration at maxDuration (10)", () => {
      const ctx: VideoBuildContext = { prompt: "a cat", duration: 15 };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.duration).toBe(10);
    });

    it("should pass duration as-is when within limit", () => {
      const ctx: VideoBuildContext = { prompt: "a cat", duration: 3 };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.duration).toBe(3);
    });
  });

  describe("extractTaskId", () => {
    it("should extract from response.data.id", () => {
      const response = { data: { id: "task-123" } };
      expect(plugin.extractTaskId(response)).toBe("task-123");
    });

    it("should fall back to response.id", () => {
      const response = { id: "task-456" };
      expect(plugin.extractTaskId(response)).toBe("task-456");
    });

    it("should fall back to response.task_id", () => {
      const response = { task_id: "task-789" };
      expect(plugin.extractTaskId(response)).toBe("task-789");
    });

    it("should prefer data.id over top-level id", () => {
      const response = { data: { id: "inner-id" }, id: "outer-id" };
      expect(plugin.extractTaskId(response)).toBe("inner-id");
    });

    it("should return undefined when no id found", () => {
      expect(plugin.extractTaskId({})).toBeUndefined();
    });
  });

  describe("extractVideoUrl", () => {
    it("should extract from response.data.video_url", () => {
      const response = { data: { video_url: "https://cdn.pika.art/video.mp4" } };
      expect(plugin.extractVideoUrl(response)).toBe("https://cdn.pika.art/video.mp4");
    });

    it("should fall back to response.video_url", () => {
      const response = { video_url: "https://cdn.pika.art/video2.mp4" };
      expect(plugin.extractVideoUrl(response)).toBe("https://cdn.pika.art/video2.mp4");
    });

    it("should fall back to response.url", () => {
      const response = { url: "https://cdn.pika.art/video3.mp4" };
      expect(plugin.extractVideoUrl(response)).toBe("https://cdn.pika.art/video3.mp4");
    });

    it("should prefer data.video_url over top-level fields", () => {
      const response = { data: { video_url: "inner.mp4" }, video_url: "outer.mp4" };
      expect(plugin.extractVideoUrl(response)).toBe("inner.mp4");
    });

    it("should return undefined when no url found", () => {
      expect(plugin.extractVideoUrl({})).toBeUndefined();
    });
  });

  describe("extractStatus", () => {
    it("should map 'completed' to 'completed'", () => {
      const response = { data: { status: "completed" } };
      expect(plugin.extractStatus(response).status).toBe("completed");
    });

    it("should map 'failed' to 'failed'", () => {
      const response = { data: { status: "failed" } };
      expect(plugin.extractStatus(response).status).toBe("failed");
    });

    it("should map 'processing' to 'generating'", () => {
      const response = { data: { status: "processing" } };
      expect(plugin.extractStatus(response).status).toBe("generating");
    });

    it("should map unknown status to 'generating'", () => {
      const response = { data: { status: "pending" } };
      expect(plugin.extractStatus(response).status).toBe("generating");
    });

    it("should default to 'generating' when no status field", () => {
      const response = {};
      expect(plugin.extractStatus(response).status).toBe("generating");
    });

    it("should fall back to top-level status", () => {
      const response = { status: "completed" };
      expect(plugin.extractStatus(response).status).toBe("completed");
    });

    it("should extract error message from data.error", () => {
      const response = { data: { status: "failed", error: "quota exceeded" } };
      const result = plugin.extractStatus(response);
      expect(result.status).toBe("failed");
      expect(result.message).toBe("quota exceeded");
    });

    it("should extract error message from top-level error", () => {
      const response = { status: "failed", error: "server error" };
      const result = plugin.extractStatus(response);
      expect(result.message).toBe("server error");
    });
  });

  describe("getVideoStatusEndpoint", () => {
    it("should return correct status URL", () => {
      const url = plugin.getVideoStatusEndpoint("https://api.pika.art/v1", "task-123");
      expect(url).toBe("https://api.pika.art/v1/video/status/task-123");
    });
  });

  describe("getModelCapabilities", () => {
    it("should return capabilities with no character/scene ref support", () => {
      const caps = plugin.getModelCapabilities("pika-2.2");
      expect(caps.supportsCharacterRef).toBe(false);
      expect(caps.supportsSceneRef).toBe(false);
      expect(caps.supportsLastFrame).toBe(false);
      expect(caps.referenceMode).toBe("merged");
    });

    it("should return supported image sizes", () => {
      const caps = plugin.getModelCapabilities("pika-2.2");
      expect(caps.supportedImageSizes).toHaveLength(3);
    });
  });

  describe("getCloudInfo", () => {
    it("should return correct cloud info", () => {
      const info = plugin.getCloudInfo("https://api.pika.art/v1");
      expect(info.name).toBe("Pika");
      expect(info.websiteUrl).toBe("https://pika.art");
      expect(info.taskUrlPattern("task-1")).toBe("https://pika.art/tasks/task-1");
      expect(info.queryEndpoint("https://api.pika.art/v1", "task-1")).toBe(
        "https://api.pika.art/v1/video/status/task-1",
      );
    });
  });
});
