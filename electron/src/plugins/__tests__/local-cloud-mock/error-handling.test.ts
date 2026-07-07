/**
 * 边界场景测试 —— 验证错误处理 + 异常情况
 *
 * 测试场景：
 * 1. 4xx 错误（400 Bad Request, 401 Unauthorized, 404 Not Found）
 * 2. 5xx 错误（500 Internal Server Error, 502 Bad Gateway）
 * 3. 请求超时
 * 4. 空响应体
 * 5. 畸形 JSON 响应
 * 6. 缺少 taskId 的响应
 * 7. 缺少 videoUrl 的 completed 响应
 * 8. 不匹配的 provider profile
 *
 * 这验证了 provider 在异常情况下的健壮性。
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("../../../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../../utils", () => ({
  ensureAccessibleUrl: vi.fn((url: string) => url),
  downloadAsBase64: vi.fn(() => Promise.resolve("base64data")),
  resolveLocalUrlToBase64: vi.fn(() =>
    Promise.resolve("data:image/png;base64,localdata"),
  ),
  stripDataUriPrefix: vi.fn((s: string) =>
    s.replace(/^data:[^;]+;base64,/, ""),
  ),
  urlToPureBase64: vi.fn((s: string) =>
    s.replace(/^data:[^;]+;base64,/, ""),
  ),
}));

import { LocalCloudMockServer, sendRequest } from "./server";
import { allProfiles, getProfile } from "./profiles";
import { TEST_PROMPT, TEST_DURATION } from "./fixtures";

import { VolcenginePlugin } from "../../providers/volcengine";
import { SeedancePlugin } from "../../providers/seedance";
import { RunwayPlugin } from "../../providers/runway";
import { PikaPlugin } from "../../providers/pika";
import { LumaPlugin } from "../../providers/luma";
import { PixversePlugin } from "../../providers/pixverse";
import { ZhipuPlugin } from "../../providers/zhipu";
import { OpenAICompatiblePlugin } from "../../providers/openai-compatible";
import { OpenAISoraPlugin } from "../../providers/openai-sora";
import { GooglePlugin } from "../../providers/google";
import { MiniMaxPlugin } from "../../providers/minimax";
import { KuaishouPlugin } from "../../providers/kuaishou";
import type { AIProviderPlugin, VideoBuildContext } from "../../types";
import { MINIMAL_PNG_DATA_URI } from "./fixtures";

describe("边界场景测试 - 错误处理 + 异常情况", () => {
  let server: LocalCloudMockServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = new LocalCloudMockServer(allProfiles);
    const { baseUrl: url } = await server.start();
    baseUrl = url;
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    server.clearRequests();
  });

  describe("4xx 错误处理", () => {
    it("400 Bad Request 应返回错误状态码", async () => {
      server.setNextError(400, {
        error: { code: "INVALID_PROMPT", message: "Prompt is empty" },
      });

      const response = await sendRequest(baseUrl + "/seedance/video", {
        method: "POST",
        body: { prompt: "", model: "seedance-v1" },
      });

      expect(response.status).toBe(400);
      expect(response.body).toBeDefined();
    });

    it("401 Unauthorized 应返回错误状态码", async () => {
      server.setNextError(401, {
        error: { code: "UNAUTHORIZED", message: "Invalid API key" },
      });

      const response = await sendRequest(baseUrl + "/seedance/video", {
        method: "POST",
        body: { prompt: "test" },
        headers: { Authorization: "Bearer invalid-key" },
      });

      expect(response.status).toBe(401);
    });

    it("404 Not Found - 不匹配的 path 应返回 404", async () => {
      const response = await sendRequest(baseUrl + "/unknown-endpoint", {
        method: "POST",
        body: { prompt: "test" },
      });

      expect(response.status).toBe(404);
    });

    it("429 Too Many Requests 应返回错误状态码", async () => {
      server.setNextError(429, {
        error: { code: "RATE_LIMITED", message: "Too many requests" },
      });

      const response = await sendRequest(baseUrl + "/seedance/video", {
        method: "POST",
        body: { prompt: "test" },
      });

      expect(response.status).toBe(429);
    });
  });

  describe("5xx 错误处理", () => {
    it("500 Internal Server Error 应返回错误状态码", async () => {
      server.setNextError(500, {
        error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
      });

      const response = await sendRequest(baseUrl + "/seedance/video", {
        method: "POST",
        body: { prompt: "test" },
      });

      expect(response.status).toBe(500);
    });

    it("502 Bad Gateway 应返回错误状态码", async () => {
      server.setNextError(502, {
        error: { code: "BAD_GATEWAY", message: "Upstream error" },
      });

      const response = await sendRequest(baseUrl + "/seedance/video", {
        method: "POST",
        body: { prompt: "test" },
      });

      expect(response.status).toBe(502);
    });

    it("503 Service Unavailable 应返回错误状态码", async () => {
      server.setNextError(503, {
        error: { code: "SERVICE_UNAVAILABLE", message: "Service is down" },
      });

      const response = await sendRequest(baseUrl + "/seedance/video", {
        method: "POST",
        body: { prompt: "test" },
      });

      expect(response.status).toBe(503);
    });
  });

  describe("超时处理", () => {
    it("请求超时应触发 AbortError", async () => {
      // 设置服务器延迟 2000ms
      server.setDelay(2000);

      // 客户端设置 500ms 超时
      await expect(
        sendRequest(
          baseUrl + "/seedance/video",
          {
            method: "POST",
            body: { prompt: "test" },
            timeout: 500,
          },
        ),
      ).rejects.toThrow();

      // 重置延迟
      server.setDelay(0);
    });
  });

  describe("空响应和畸形响应", () => {
    it("空响应体应被正确处理", async () => {
      // 注入空响应
      server.setNextError(200, null);

      const response = await sendRequest(baseUrl + "/seedance/video", {
        method: "POST",
        body: { prompt: "test" },
      });

      expect(response.status).toBe(200);
      // 空响应被 JSON.parse 后是 null
      expect(response.body).toBeNull();
    });

    it("畸形 JSON 应被作为字符串返回", async () => {
      // 注入畸形 JSON（通过 nextError 机制）
      server.setNextError(200, "this is not json");

      const response = await sendRequest(baseUrl + "/seedance/video", {
        method: "POST",
        body: { prompt: "test" },
      });

      expect(response.status).toBe(200);
      // 畸形 JSON 应被作为字符串处理
      expect(typeof response.body).toBe("string");
    });
  });

  describe("provider 响应解析的健壮性", () => {
    let plugin: AIProviderPlugin;

    beforeAll(() => {
      plugin = new SeedancePlugin();
    });

    it("extractTaskId 对空对象应返回 undefined", () => {
      const taskId = plugin.extractTaskId({});
      expect(taskId).toBeUndefined();
    });

    it("extractTaskId 对 null/undefined 应安全返回", () => {
      const taskId1 = plugin.extractTaskId(null as unknown as Record<string, unknown>);
      expect(taskId1).toBeUndefined();
    });

    it("extractVideoUrl 对空对象应返回 undefined", () => {
      const videoUrl = plugin.extractVideoUrl({});
      expect(videoUrl).toBeUndefined();
    });

    it("extractVideoUrl 对缺少 videoUrl 的响应应返回 undefined", () => {
      const videoUrl = plugin.extractVideoUrl({
        id: "task-xxx",
        status: "completed",
      });
      expect(videoUrl).toBeUndefined();
    });

    it("Volcengine extractVideoUrl 应从 content 数组提取 video_url", () => {
      const volcPlugin = new VolcenginePlugin();
      const videoUrl = volcPlugin.extractVideoUrl({
        id: "task-xxx",
        status: "succeeded",
        content: [
          { type: "video_url", video_url: { url: "https://example.com/video.mp4" } },
        ],
      });
      // VolcenginePlugin 重写了 extractVideoUrl，能正确解析 content 数组
      expect(videoUrl).toBe("https://example.com/video.mp4");
    });
  });

  describe("provider profile 路由匹配", () => {
    it("Volcengine generate path 应正确匹配", () => {
      const profile = getProfile("volcengine");
      expect(profile.matchGeneratePath("/contents/generations/tasks", "POST")).toBe(true);
      expect(profile.matchGeneratePath("/seedance/video", "POST")).toBe(false);
    });

    it("Seedance generate path 应正确匹配", () => {
      const profile = getProfile("seedance");
      expect(profile.matchGeneratePath("/seedance/video", "POST")).toBe(true);
      expect(profile.matchGeneratePath("/contents/generations/tasks", "POST")).toBe(false);
    });

    it("Kuaishou 应匹配 image2video 和 text2video", () => {
      const profile = getProfile("kuaishou");
      expect(profile.matchGeneratePath("/v1/videos/image2video", "POST")).toBe(true);
      expect(profile.matchGeneratePath("/v1/videos/text2video", "POST")).toBe(true);
      expect(profile.matchGeneratePath("/seedance/video", "POST")).toBe(false);
    });

    it("Google generate path 应包含 :predictLongRunning", () => {
      const profile = getProfile("google");
      expect(profile.matchGeneratePath("/models/veo-3.1:predictLongRunning", "POST")).toBe(true);
      expect(profile.matchGeneratePath("/models/veo-3.1:generateContent", "POST")).toBe(false);
    });

    it("Google status path 应匹配 /operations/{taskId}", () => {
      const profile = getProfile("google");
      expect(profile.matchStatusPath("/operations/task-123", "GET")).toBe(true);
      expect(profile.extractTaskIdFromStatusPath("/operations/task-123")).toBe("task-123");
    });

    it("Pixverse 应匹配 DashScope 长路径", () => {
      const profile = getProfile("pixverse");
      expect(
        profile.matchGeneratePath(
          "/services/aigc/video-generation/video-synthesis",
          "POST",
        ),
      ).toBe(true);
    });

    it("所有 profile 的 generate 和 status path 不应冲突", () => {
      // 已知的 generate path 共享情况（实际使用中通过 apiUrl 区分）
      const knownSharedGeneratePaths = new Set([
        "/videos/generations", // zhipu 和 openai-compatible 共享
      ]);

      const conflicts: string[] = [];
      for (let i = 0; i < allProfiles.length; i++) {
        const profileA = allProfiles[i];
        if (!profileA) continue;
        for (let j = i + 1; j < allProfiles.length; j++) {
          const profileB = allProfiles[j];
          if (!profileB) continue;
          // 检查 profileA 的 generate path 是否也被 profileB 匹配
          const testPaths = [
            "/contents/generations/tasks",
            "/seedance/video",
            "/image_to_video",
            "/text_to_video",
            "/video/generate",
            "/generations",
            "/services/aigc/video-generation/video-synthesis",
            "/videos/generations",
            "/video/generations",
            "/v1/videos/image2video",
            "/v1/videos/text2video",
            "/video_generation/task",
            "/models/veo-3.1:predictLongRunning",
          ];
          for (const path of testPaths) {
            if (
              profileA.matchGeneratePath(path, "POST") &&
              profileB.matchGeneratePath(path, "POST") &&
              !knownSharedGeneratePaths.has(path)
            ) {
              conflicts.push(
                `generate path "${path}" 同时匹配 ${profileA.id} 和 ${profileB.id}`,
              );
            }
          }
        }
      }
      expect(conflicts).toEqual([]);
    });
  });

  describe("Anthropic 不支持视频生成的处理", () => {
    it("Anthropic buildVideoRequest 应抛出错误", async () => {
      const { AnthropicPlugin } = await import("../../providers/anthropic");
      const plugin = new AnthropicPlugin();

      expect(() => {
        plugin.buildVideoRequest({
          prompt: "test",
          model: "claude-3",
          duration: 5,
        });
      }).toThrow("ANTHROPIC_VIDEO_NOT_SUPPORTED");
    });

    it("Anthropic capabilities 应声明 video: false", async () => {
      const { AnthropicPlugin } = await import("../../providers/anthropic");
      const plugin = new AnthropicPlugin();
      expect(plugin.capabilities.video).toBe(false);
    });
  });

  describe("provider validateGenerateBody 校验", () => {
    it("Volcengine 应拒绝缺少 content 数组的 body", () => {
      const profile = getProfile("volcengine");
      const errors = profile.validateGenerateBody(
        { model: "test", prompt: "test" }, // 缺少 content
        { prompt: "test", duration: 5 },
      );
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes("content"))).toBe(true);
    });

    it("Seedance 应拒绝 prompt 不匹配的 body", () => {
      const profile = getProfile("seedance");
      const errors = profile.validateGenerateBody(
        { model: "test", prompt: "wrong prompt", duration: 5 },
        { prompt: "expected prompt", duration: 5 },
      );
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes("prompt"))).toBe(true);
    });

    it("Pixverse 应拒绝缺少 input 对象的 body", () => {
      const profile = getProfile("pixverse");
      const errors = profile.validateGenerateBody(
        { model: "test", prompt: "test" }, // 缺少 input
        { prompt: "test", duration: 5 },
      );
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes("input"))).toBe(true);
    });

    it("Kuaishou 应拒绝 duration 不匹配的 body", () => {
      const profile = getProfile("kuaishou");
      const errors = profile.validateGenerateBody(
        { model: "test", prompt: "test", duration: 10 },
        { prompt: "test", duration: 5 },
      );
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes("duration"))).toBe(true);
    });

    it("所有 provider 的 validateGenerateBody 对有效 body 应返回空数组", () => {
      for (const profile of allProfiles) {
        const PluginClass = PLUGIN_CLASS_MAP[profile.id];
        if (!PluginClass) {
          continue; // 跳过没有映射的 provider
        }
        const plugin = new PluginClass();
        const ctx: VideoBuildContext = {
          prompt: TEST_PROMPT,
          model: profile.testModel,
          duration: TEST_DURATION,
          firstFrameUrl: MINIMAL_PNG_DATA_URI,
        };
        const result = plugin.buildVideoRequest(ctx);
        const errors = profile.validateGenerateBody(
          result.body,
          {
            prompt: TEST_PROMPT,
            duration: TEST_DURATION,
            firstFrame: MINIMAL_PNG_DATA_URI,
          },
        );
        expect(errors).toEqual([]);
      }
    });
  });
});

/** profile id → Plugin class 映射表 */
const PLUGIN_CLASS_MAP: Record<string, new () => AIProviderPlugin> = {
  volcengine: VolcenginePlugin,
  seedance: SeedancePlugin,
  runway: RunwayPlugin,
  pika: PikaPlugin,
  luma: LumaPlugin,
  pixverse: PixversePlugin,
  zhipu: ZhipuPlugin,
  "openai-compatible": OpenAICompatiblePlugin,
  "openai-sora": OpenAISoraPlugin,
  google: GooglePlugin,
  minimax: MiniMaxPlugin,
  kuaishou: KuaishouPlugin,
};
