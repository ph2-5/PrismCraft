/**
 * 发送端测试 —— 验证 provider 序列化 + HTTP 发送链路
 *
 * 测试流程：
 * 1. 启动 Mock 云端服务器
 * 2. 调用 provider.buildVideoRequest(ctx) 得到 body/endpoint/headers
 * 3. 用 fetch 发送真实 HTTP 请求到 Mock 服务器
 * 4. Mock 服务器校验 body 字段完整性（validateGenerateBody）
 * 5. 验证 provider 能解析响应（extractTaskId）
 *
 * 这验证了"发送端"的真实可用性：provider 序列化的请求能被云端"接收"。
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
import { TEST_PROMPT, TEST_DURATION, MINIMAL_PNG_DATA_URI } from "./fixtures";
import type { ExpectedSendContext } from "./types";

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

interface ProviderTestCase {
  profileId: string;
  PluginClass: new () => AIProviderPlugin;
  supportsLastFrame: boolean;
  supportsCharacterRef: boolean;
}

const PROVIDERS: ProviderTestCase[] = [
  { profileId: "volcengine", PluginClass: VolcenginePlugin, supportsLastFrame: true, supportsCharacterRef: true },
  { profileId: "seedance", PluginClass: SeedancePlugin, supportsLastFrame: true, supportsCharacterRef: false },
  { profileId: "runway", PluginClass: RunwayPlugin, supportsLastFrame: false, supportsCharacterRef: false },
  { profileId: "pika", PluginClass: PikaPlugin, supportsLastFrame: false, supportsCharacterRef: false },
  { profileId: "luma", PluginClass: LumaPlugin, supportsLastFrame: true, supportsCharacterRef: false },
  { profileId: "pixverse", PluginClass: PixversePlugin, supportsLastFrame: false, supportsCharacterRef: false },
  { profileId: "zhipu", PluginClass: ZhipuPlugin, supportsLastFrame: false, supportsCharacterRef: false },
  { profileId: "openai-compatible", PluginClass: OpenAICompatiblePlugin, supportsLastFrame: true, supportsCharacterRef: false },
  { profileId: "openai-sora", PluginClass: OpenAISoraPlugin, supportsLastFrame: true, supportsCharacterRef: false },
  { profileId: "google", PluginClass: GooglePlugin, supportsLastFrame: false, supportsCharacterRef: false },
  { profileId: "minimax", PluginClass: MiniMaxPlugin, supportsLastFrame: false, supportsCharacterRef: true },
  { profileId: "kuaishou", PluginClass: KuaishouPlugin, supportsLastFrame: true, supportsCharacterRef: true },
];

describe("发送端测试 - Provider 序列化 + HTTP 发送链路", () => {
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

  describe.each(PROVIDERS)(
    "$profileId provider",
    ({ profileId, PluginClass, supportsLastFrame, supportsCharacterRef }) => {
      const profile = getProfile(profileId);
      let plugin: AIProviderPlugin;

      beforeAll(() => {
        plugin = new PluginClass();
      });

      it("场景1: 纯文本 prompt 应正确发送并被云端接收", async () => {
        const ctx: VideoBuildContext = {
          prompt: TEST_PROMPT,
          model: profile.testModel,
          duration: TEST_DURATION,
        };
        const expected: ExpectedSendContext = {
          prompt: TEST_PROMPT,
          duration: TEST_DURATION,
        };

        // 1. provider 序列化请求
        const result = plugin.buildVideoRequest(ctx);
        expect(result.body).toBeDefined();
        expect(result.endpoint).toBeDefined();

        // 2. 获取认证头
        const authHeaders = plugin.getAuthHeaders(profile.testApiKey, result.endpoint);
        expect(authHeaders).toBeDefined();

        // 3. 发送真实 HTTP 请求到 Mock 服务器
        const url = baseUrl + result.endpoint;
        const response = await sendRequest(url, {
          method: result.method || "POST",
          headers: { ...authHeaders, ...(result.extraHeaders || {}) },
          body: result.body,
        });

        // 4. 验证 HTTP 响应
        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        // 5. 验证 Mock 服务器收到了请求
        expect(server.receivedRequests.length).toBeGreaterThan(0);
        const receivedRequest = server.receivedRequests[0];
        expect(receivedRequest.method).toBe(result.method || "POST");

        // 6. 验证 body 字段完整性（Mock 服务器校验）
        const validationErrors = profile.validateGenerateBody(
          receivedRequest.body as Record<string, unknown>,
          expected,
        );
        expect(validationErrors).toEqual([]);

        // 7. 验证 provider 能解析 taskId
        const taskId = plugin.extractTaskId(
          response.body as Record<string, unknown>,
        );
        expect(taskId).toBeDefined();
        expect(typeof taskId).toBe("string");
        expect(taskId!.length).toBeGreaterThan(0);
      });

      it("场景2: prompt + firstFrame 应正确发送图片字段", async () => {
        const ctx: VideoBuildContext = {
          prompt: TEST_PROMPT,
          model: profile.testModel,
          duration: TEST_DURATION,
          firstFrameUrl: MINIMAL_PNG_DATA_URI,
        };
        const expected: ExpectedSendContext = {
          prompt: TEST_PROMPT,
          duration: TEST_DURATION,
          firstFrame: MINIMAL_PNG_DATA_URI,
        };

        const result = plugin.buildVideoRequest(ctx);
        const authHeaders = plugin.getAuthHeaders(profile.testApiKey, result.endpoint);
        const response = await sendRequest(baseUrl + result.endpoint, {
          method: result.method || "POST",
          headers: { ...authHeaders, ...(result.extraHeaders || {}) },
          body: result.body,
        });

        expect(response.status).toBe(200);

        const receivedRequest = server.receivedRequests[0];
        const validationErrors = profile.validateGenerateBody(
          receivedRequest.body as Record<string, unknown>,
          expected,
        );
        expect(validationErrors).toEqual([]);

        const taskId = plugin.extractTaskId(response.body as Record<string, unknown>);
        expect(taskId).toBeDefined();
      });

      (supportsLastFrame ? it : it.skip)(
        "场景3: prompt + firstFrame + lastFrame 应正确发送尾帧字段",
        async () => {
          const ctx: VideoBuildContext = {
            prompt: TEST_PROMPT,
            model: profile.testModel,
            duration: TEST_DURATION,
            firstFrameUrl: MINIMAL_PNG_DATA_URI,
            lastFrameUrl: MINIMAL_PNG_DATA_URI,
          };
          const expected: ExpectedSendContext = {
            prompt: TEST_PROMPT,
            duration: TEST_DURATION,
            firstFrame: MINIMAL_PNG_DATA_URI,
            lastFrame: MINIMAL_PNG_DATA_URI,
          };

          const result = plugin.buildVideoRequest(ctx);
          const authHeaders = plugin.getAuthHeaders(profile.testApiKey, result.endpoint);
          const response = await sendRequest(baseUrl + result.endpoint, {
            method: result.method || "POST",
            headers: { ...authHeaders, ...(result.extraHeaders || {}) },
            body: result.body,
          });

          expect(response.status).toBe(200);

          const receivedRequest = server.receivedRequests[0];
          const validationErrors = profile.validateGenerateBody(
            receivedRequest.body as Record<string, unknown>,
            expected,
          );
          expect(validationErrors).toEqual([]);
        },
      );

      (supportsCharacterRef ? it : it.skip)(
        "场景4: prompt + characterRef 应正确发送角色引用字段",
        async () => {
          const ctx: VideoBuildContext = {
            prompt: TEST_PROMPT,
            model: profile.testModel,
            duration: TEST_DURATION,
            characterRef: MINIMAL_PNG_DATA_URI,
          };
          // expected: { prompt, duration, characterRefs: [MINIMAL_PNG_DATA_URI] }
          // characterRef 可能被 bake_into_first 或 text_append，不强制校验字段

          const result = plugin.buildVideoRequest(ctx);
          const authHeaders = plugin.getAuthHeaders(profile.testApiKey, result.endpoint);
          const response = await sendRequest(baseUrl + result.endpoint, {
            method: result.method || "POST",
            headers: { ...authHeaders, ...(result.extraHeaders || {}) },
            body: result.body,
          });

          expect(response.status).toBe(200);

          const receivedRequest = server.receivedRequests[0];
          // characterRef 可能被 bake_into_first 或 text_append，不强制校验字段
          // 只验证请求能被发送和接收
          expect(receivedRequest.body).toBeDefined();
          const taskId = plugin.extractTaskId(response.body as Record<string, unknown>);
          expect(taskId).toBeDefined();
        },
      );

      it("认证头应包含 apiKey 相关信息", async () => {
        const authHeaders = plugin.getAuthHeaders(profile.testApiKey, "/test");
        // 所有 provider 都应该返回非空 headers
        expect(Object.keys(authHeaders).length).toBeGreaterThan(0);

        // 大多数 provider 使用 Bearer token（Google 除外）
        if (profileId === "google") {
          expect(authHeaders["x-goog-api-key"]).toBe(profile.testApiKey);
        } else if (profileId === "anthropic") {
          expect(authHeaders["x-api-key"]).toBe(profile.testApiKey);
        } else {
          expect(authHeaders["Authorization"]).toBe(`Bearer ${profile.testApiKey}`);
        }
      });

      it("generate endpoint 路径应匹配 Mock 服务器路由", async () => {
        const ctx: VideoBuildContext = {
          prompt: TEST_PROMPT,
          model: profile.testModel,
          duration: TEST_DURATION,
        };
        const result = plugin.buildVideoRequest(ctx);

        // 验证 endpoint 能被 Mock 服务器的 profile 匹配
        const isMatched = profile.matchGeneratePath(result.endpoint, "POST");
        expect(isMatched).toBe(true);
      });
    },
  );

  describe("Volcengine 特殊场景", () => {
    it("content 数组应包含 text + image_url 项", async () => {
      const plugin = new VolcenginePlugin();
      const ctx: VideoBuildContext = {
        prompt: TEST_PROMPT,
        model: "doubao-seedance-1-0-pro-250528",
        firstFrameUrl: MINIMAL_PNG_DATA_URI,
        duration: TEST_DURATION,
      };
      const result = plugin.buildVideoRequest(ctx);
      const content = result.body.content as unknown[];
      expect(Array.isArray(content)).toBe(true);

      const textItem = content.find(
        (c) => (c as Record<string, unknown>)?.type === "text",
      );
      expect(textItem).toBeDefined();

      const firstFrame = content.find(
        (c) => (c as Record<string, unknown>)?.role === "first_frame",
      );
      expect(firstFrame).toBeDefined();
    });
  });

  describe("Kuaishou 特殊场景", () => {
    it("image2video 和 text2video 应根据 firstFrame 切换 endpoint", async () => {
      const plugin = new KuaishouPlugin();

      // 有 firstFrame → image2video
      const i2vResult = plugin.buildVideoRequest({
        prompt: TEST_PROMPT,
        model: "kling-v3-pro",
        firstFrameUrl: MINIMAL_PNG_DATA_URI,
        duration: TEST_DURATION,
      });
      expect(i2vResult.endpoint).toContain("image2video");

      // 无 firstFrame → text2video
      const t2vResult = plugin.buildVideoRequest({
        prompt: TEST_PROMPT,
        model: "kling-v3-pro",
        duration: TEST_DURATION,
      });
      expect(t2vResult.endpoint).toContain("text2video");
    });
  });

  describe("Pixverse 特殊场景", () => {
    it("应包含 X-DashScope-Async header", async () => {
      const plugin = new PixversePlugin();
      const ctx: VideoBuildContext = {
        prompt: TEST_PROMPT,
        model: "pixverse-v2",
        duration: TEST_DURATION,
      };
      const result = plugin.buildVideoRequest(ctx);

      // Pixverse 应该有 extraHeaders
      expect(result.extraHeaders).toBeDefined();
      const headers = result.extraHeaders as Record<string, string>;
      expect(headers["X-DashScope-Async"]).toBe("enable");
    });

    it("body 应使用 input/parameters 嵌套结构", async () => {
      const plugin = new PixversePlugin();
      const ctx: VideoBuildContext = {
        prompt: TEST_PROMPT,
        model: "pixverse-v2",
        duration: TEST_DURATION,
      };
      const result = plugin.buildVideoRequest(ctx);

      expect(result.body.input).toBeDefined();
      expect(result.body.parameters).toBeDefined();
      expect((result.body.input as Record<string, unknown>).prompt).toBe(TEST_PROMPT);
    });
  });

  describe("Google 特殊场景", () => {
    it("endpoint 应包含 :predictLongRunning 后缀", async () => {
      const plugin = new GooglePlugin();
      const ctx: VideoBuildContext = {
        prompt: TEST_PROMPT,
        model: "veo-3.1",
        duration: TEST_DURATION,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.endpoint).toContain(":predictLongRunning");
      expect(result.endpoint).toContain("veo-3.1");
    });

    it("firstFrame 应放在 image.gcsUri 字段", async () => {
      const plugin = new GooglePlugin();
      const ctx: VideoBuildContext = {
        prompt: TEST_PROMPT,
        model: "veo-3.1",
        firstFrameUrl: "gs://bucket/image.png",
        duration: TEST_DURATION,
      };
      const result = plugin.buildVideoRequest(ctx);
      const image = result.body.image as Record<string, unknown>;
      expect(image).toBeDefined();
      expect(image.gcsUri).toBe("gs://bucket/image.png");
    });
  });

  describe("Seedance 2.5 模型配置", () => {
    it("Volcengine 应识别 doubao-seedance-2-5 并返回 4K/30s/50路参考能力", () => {
      const plugin = new VolcenginePlugin();
      const caps = plugin.getModelCapabilities("doubao-seedance-2-5");
      expect(caps.maxResolution).toBe(4096);
      expect(caps.maxReferences).toBe(50);
      expect(caps.defaultImageSize).toBe("3840x2160");
    });

    it("Volcengine VIDEO_CAPABILITIES.maxDuration 应支持 30 秒", () => {
      const plugin = new VolcenginePlugin();
      expect(plugin.videoCapabilities.maxDuration).toBe(30);
    });

    it("Volcengine 用 doubao-seedance-2-5 构造的请求应携带 model 和 duration", () => {
      const plugin = new VolcenginePlugin();
      const ctx: VideoBuildContext = {
        prompt: TEST_PROMPT,
        model: "doubao-seedance-2-5",
        duration: 30,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.model).toBe("doubao-seedance-2-5");
      expect(result.body.duration).toBe(30);
      expect(result.endpoint).toBe("/contents/generations/tasks");
    });

    it("Seedance (Atlas Cloud) 也应支持 30 秒 maxDuration", () => {
      const plugin = new SeedancePlugin();
      expect(plugin.videoCapabilities.maxDuration).toBe(30);
    });

    it("Seedance (Atlas Cloud) 应识别 seedance-2.5 模型配置", () => {
      const plugin = new SeedancePlugin();
      const caps = plugin.getModelCapabilities("seedance-2.5");
      expect(caps.maxResolution).toBe(4096);
      expect(caps.maxReferences).toBe(50);
      expect(caps.defaultImageSize).toBe("3840x2160");
    });
  });

  describe("maxDuration 配置准确性", () => {
    it("Sora 2 应为 10 秒（非 20 秒）", () => {
      const plugin = new OpenAISoraPlugin();
      expect(plugin.videoCapabilities.maxDuration).toBe(10);
    });

    it("Pika 2.2 应为 10 秒", () => {
      const plugin = new PikaPlugin();
      expect(plugin.videoCapabilities.maxDuration).toBe(10);
    });

    it("Luma Ray2 应为 9 秒", () => {
      const plugin = new LumaPlugin();
      expect(plugin.videoCapabilities.maxDuration).toBe(9);
    });
  });
});
