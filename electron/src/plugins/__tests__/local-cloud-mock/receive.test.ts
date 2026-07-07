/**
 * 接收端测试 —— 验证 provider 响应解析 + 状态轮询 + 视频下载链路
 *
 * 测试流程：
 * 1. 发送 generate 请求获得 taskId
 * 2. 手动设置 task 状态（pending → running → completed）
 * 3. 发送 status 请求，验证 extractStatus / extractVideoUrl
 * 4. 下载视频文件，验证内容完整性
 *
 * 这验证了"接收端"的真实可用性：provider 能正确解析云端返回的响应。
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
import { TEST_PROMPT, TEST_DURATION, MINIMAL_VIDEO_BUFFER } from "./fixtures";
import type { ProviderProfile } from "./types";

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
}

const PROVIDERS: ProviderTestCase[] = [
  { profileId: "volcengine", PluginClass: VolcenginePlugin },
  { profileId: "seedance", PluginClass: SeedancePlugin },
  { profileId: "runway", PluginClass: RunwayPlugin },
  { profileId: "pika", PluginClass: PikaPlugin },
  { profileId: "luma", PluginClass: LumaPlugin },
  { profileId: "pixverse", PluginClass: PixversePlugin },
  { profileId: "zhipu", PluginClass: ZhipuPlugin },
  { profileId: "openai-compatible", PluginClass: OpenAICompatiblePlugin },
  { profileId: "openai-sora", PluginClass: OpenAISoraPlugin },
  { profileId: "google", PluginClass: GooglePlugin },
  { profileId: "minimax", PluginClass: MiniMaxPlugin },
  { profileId: "kuaishou", PluginClass: KuaishouPlugin },
];

describe("接收端测试 - 响应解析 + 状态轮询 + 视频下载", () => {
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
    "$profileId provider 响应解析",
    ({ profileId, PluginClass }) => {
      const profile = getProfile(profileId);
      let plugin: AIProviderPlugin;

      beforeAll(() => {
        plugin = new PluginClass();
      });

      it("应从 generate 响应正确提取 taskId", async () => {
        const ctx: VideoBuildContext = {
          prompt: TEST_PROMPT,
          model: profile.testModel,
          duration: TEST_DURATION,
        };
        const result = plugin.buildVideoRequest(ctx);
        const authHeaders = plugin.getAuthHeaders(profile.testApiKey, result.endpoint);

        const response = await sendRequest(baseUrl + result.endpoint, {
          method: result.method || "POST",
          headers: { ...authHeaders, ...(result.extraHeaders || {}) },
          body: result.body,
        });

        expect(response.status).toBe(200);

        // 验证 provider 能从响应中提取 taskId
        const taskId = plugin.extractTaskId(response.body as Record<string, unknown>);
        expect(taskId).toBeDefined();
        expect(typeof taskId).toBe("string");
        expect(taskId!.length).toBeGreaterThan(0);
      });

      it("应构造正确的 status 查询 endpoint", () => {
        const taskId = "test-task-id-123";
        const statusEndpoint = plugin.getVideoStatusEndpoint(baseUrl, taskId, profile.testModel);

        // 验证 endpoint 是完整 URL
        expect(statusEndpoint).toContain(baseUrl);
        expect(statusEndpoint).toContain(taskId);

        // 验证 endpoint 能被 Mock 服务器匹配
        const statusPath = statusEndpoint.replace(baseUrl, "");
        expect(profile.matchStatusPath(statusPath, "GET")).toBe(true);
      });

      it("应从 completed 状态响应正确提取 videoUrl", async () => {
        // 1. 先发送 generate 请求获得 taskId
        const ctx: VideoBuildContext = {
          prompt: TEST_PROMPT,
          model: profile.testModel,
          duration: TEST_DURATION,
        };
        const result = plugin.buildVideoRequest(ctx);
        const authHeaders = plugin.getAuthHeaders(profile.testApiKey, result.endpoint);

        const generateResponse = await sendRequest(baseUrl + result.endpoint, {
          method: result.method || "POST",
          headers: { ...authHeaders, ...(result.extraHeaders || {}) },
          body: result.body,
        });

        const taskId = plugin.extractTaskId(generateResponse.body as Record<string, unknown>);
        expect(taskId).toBeDefined();

        // 2. 手动设置 task 为 completed 状态
        const expectedVideoUrl = `${baseUrl}/mock-video/${taskId}.mp4`;
        server.setTaskState(taskId!, "completed", expectedVideoUrl, 100);

        // 3. 发送 status 请求
        const statusEndpoint = plugin.getVideoStatusEndpoint(baseUrl, taskId!, profile.testModel);
        const statusResponse = await sendRequest(statusEndpoint, {
          method: "GET",
          headers: authHeaders,
        });

        expect(statusResponse.status).toBe(200);

        // 4. 验证 provider 能提取 videoUrl
        const videoUrl = plugin.extractVideoUrl(statusResponse.body as Record<string, unknown>);
        expect(videoUrl).toBeDefined();
        expect(videoUrl).toBe(expectedVideoUrl);
      });

      it("应从 failed 状态响应中识别失败", async () => {
        const ctx: VideoBuildContext = {
          prompt: TEST_PROMPT,
          model: profile.testModel,
          duration: TEST_DURATION,
        };
        const result = plugin.buildVideoRequest(ctx);
        const authHeaders = plugin.getAuthHeaders(profile.testApiKey, result.endpoint);

        const generateResponse = await sendRequest(baseUrl + result.endpoint, {
          method: result.method || "POST",
          headers: { ...authHeaders, ...(result.extraHeaders || {}) },
          body: result.body,
        });

        const taskId = plugin.extractTaskId(generateResponse.body as Record<string, unknown>);
        expect(taskId).toBeDefined();

        // 设置为 failed 状态
        server.setTaskState(taskId!, "failed");

        const statusEndpoint = plugin.getVideoStatusEndpoint(baseUrl, taskId!, profile.testModel);
        const statusResponse = await sendRequest(statusEndpoint, {
          method: "GET",
          headers: authHeaders,
        });

        expect(statusResponse.status).toBe(200);

        // failed 状态下不应有 videoUrl
        const videoUrl = plugin.extractVideoUrl(statusResponse.body as Record<string, unknown>);
        expect(videoUrl).toBeUndefined();
      });

      it("完整链路：generate → poll status → download video", async () => {
        // 1. generate
        const ctx: VideoBuildContext = {
          prompt: TEST_PROMPT,
          model: profile.testModel,
          duration: TEST_DURATION,
        };
        const result = plugin.buildVideoRequest(ctx);
        const authHeaders = plugin.getAuthHeaders(profile.testApiKey, result.endpoint);

        const generateResponse = await sendRequest(baseUrl + result.endpoint, {
          method: result.method || "POST",
          headers: { ...authHeaders, ...(result.extraHeaders || {}) },
          body: result.body,
        });

        const taskId = plugin.extractTaskId(generateResponse.body as Record<string, unknown>);
        expect(taskId).toBeDefined();

        // 2. 模拟状态变化：pending → running → completed
        const expectedVideoUrl = `${baseUrl}/mock-video/${taskId}.mp4`;

        // pending 状态
        server.setTaskState(taskId!, "pending", undefined, 0);
        const statusEndpoint1 = plugin.getVideoStatusEndpoint(baseUrl, taskId!, profile.testModel);
        const statusResponse1 = await sendRequest(statusEndpoint1, {
          method: "GET",
          headers: authHeaders,
        });
        expect(statusResponse1.status).toBe(200);

        // running 状态
        server.setTaskState(taskId!, "running", undefined, 50);
        const statusResponse2 = await sendRequest(statusEndpoint1, {
          method: "GET",
          headers: authHeaders,
        });
        expect(statusResponse2.status).toBe(200);

        // completed 状态
        server.setTaskState(taskId!, "completed", expectedVideoUrl, 100);
        const statusResponse3 = await sendRequest(statusEndpoint1, {
          method: "GET",
          headers: authHeaders,
        });
        expect(statusResponse3.status).toBe(200);

        // 3. 提取 videoUrl
        const videoUrl = plugin.extractVideoUrl(statusResponse3.body as Record<string, unknown>);
        expect(videoUrl).toBeDefined();
        expect(videoUrl).toBe(expectedVideoUrl);

        // 4. 下载视频文件
        const videoResponse = await fetch(videoUrl!);
        expect(videoResponse.status).toBe(200);
        expect(videoResponse.headers.get("content-type")).toBe("video/mp4");

        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
        expect(videoBuffer.length).toBe(MINIMAL_VIDEO_BUFFER.length);
        expect(videoBuffer.equals(MINIMAL_VIDEO_BUFFER)).toBe(true);
      });
    },
  );

  describe("视频下载验证", () => {
    it("Mock 服务器应提供可下载的视频文件", async () => {
      const videoUrl = `${baseUrl}/mock-video/test-download.mp4`;
      const response = await fetch(videoUrl);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("video/mp4");

      const buffer = Buffer.from(await response.arrayBuffer());
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.equals(MINIMAL_VIDEO_BUFFER)).toBe(true);
    });

    it("下载视频后 videoDownloadCount 应递增", async () => {
      const beforeCount = server.videoDownloadCount;
      await fetch(`${baseUrl}/mock-video/count-test.mp4`);
      expect(server.videoDownloadCount).toBe(beforeCount + 1);
    });
  });
});
