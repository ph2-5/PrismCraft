/**
 * Prompt 绑定指令桥接测试 —— 验证 provider 序列化不丢失绑定指令
 *
 * 背景：
 *   service 层（beat-frame-generator.ts 的 buildReferenceEnhancedPrompt）会在
 *   prompt 前注入角色/场景一致性绑定指令（如"关键要求：本图中的角色必须严格
 *   匹配提供的角色参考图..."）。这些指令必须被 provider 插件完整序列化到
 *   HTTP 请求 body 中，不能被截断、丢弃或转义破坏。
 *
 *   - service 层的 prompt 注入已由 src/ 下的 prompt-binding-injection.integration.test.ts 验证
 *   - provider 层的 HTTP 序列化已由 send.test.ts 验证
 *   - 本测试是两层之间的"桥"：验证包含绑定指令的 prompt 经 provider 序列化后，
 *     HTTP body 中仍完整保留绑定指令文本
 *
 * 测试流程：
 *   1. 构造包含绑定指令的 prompt（模拟 service 层 buildReferenceEnhancedPrompt 的输出）
 *   2. 用每个 provider 的 plugin.buildVideoRequest(ctx) 序列化
 *   3. 发送到 LocalCloudMockServer
 *   4. 断言 mock server 收到的请求 body 中完整保留了绑定指令文本
 *
 * 这验证了完整链路的"最后一公里"：prompt 注入 → provider 序列化 → HTTP body
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
import { TEST_DURATION, MINIMAL_PNG_DATA_URI } from "./fixtures";
import type { AIProviderPlugin, VideoBuildContext } from "../../types";

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

interface ProviderTestCase {
  profileId: string;
  PluginClass: new () => AIProviderPlugin;
  supportsCharacterRef: boolean;
}

const PROVIDERS: ProviderTestCase[] = [
  { profileId: "volcengine", PluginClass: VolcenginePlugin, supportsCharacterRef: true },
  { profileId: "seedance", PluginClass: SeedancePlugin, supportsCharacterRef: false },
  { profileId: "runway", PluginClass: RunwayPlugin, supportsCharacterRef: false },
  { profileId: "pika", PluginClass: PikaPlugin, supportsCharacterRef: false },
  { profileId: "luma", PluginClass: LumaPlugin, supportsCharacterRef: false },
  { profileId: "pixverse", PluginClass: PixversePlugin, supportsCharacterRef: false },
  { profileId: "zhipu", PluginClass: ZhipuPlugin, supportsCharacterRef: false },
  { profileId: "openai-compatible", PluginClass: OpenAICompatiblePlugin, supportsCharacterRef: false },
  { profileId: "openai-sora", PluginClass: OpenAISoraPlugin, supportsCharacterRef: false },
  { profileId: "google", PluginClass: GooglePlugin, supportsCharacterRef: false },
  { profileId: "minimax", PluginClass: MiniMaxPlugin, supportsCharacterRef: true },
  { profileId: "kuaishou", PluginClass: KuaishouPlugin, supportsCharacterRef: true },
];

// 模拟 service 层 buildReferenceEnhancedPrompt 的输出
// （来自 beat-frame-generator.ts 第 18-35 行，中文版）
const CHARACTER_BINDING_INSTRUCTION =
  "关键要求：本图中的角色必须严格匹配提供的角色参考图中的外观（面部、发型、服装、体型），这是最高优先级要求。";
const SCENE_BINDING_INSTRUCTION =
  "场景环境、光照和色调必须匹配提供的场景参考图。";
const BASE_PROMPT = "一个女孩走在夕阳下的街道上";
const BINDING_PROMPT = `${CHARACTER_BINDING_INSTRUCTION}\n${SCENE_BINDING_INSTRUCTION}\n\n${BASE_PROMPT}`;

describe("Prompt 绑定指令桥接测试 - provider 序列化不丢失绑定指令", () => {
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
    ({ profileId, PluginClass, supportsCharacterRef }) => {
      const profile = getProfile(profileId);
      let plugin: AIProviderPlugin;

      beforeAll(() => {
        plugin = new PluginClass();
      });

      it("角色+场景绑定指令应完整保留在 HTTP 请求 body 中", async () => {
        const ctx: VideoBuildContext = {
          prompt: BINDING_PROMPT,
          model: profile.testModel,
          duration: TEST_DURATION,
        };

        // 1. provider 序列化请求
        const result = plugin.buildVideoRequest(ctx);
        expect(result.body).toBeDefined();

        // 2. 发送到 mock server
        const url = baseUrl + result.endpoint;
        const response = await sendRequest(url, {
          method: result.method || "POST",
          headers: {
            ...plugin.getAuthHeaders(profile.testApiKey, result.endpoint),
            ...(result.extraHeaders || {}),
          },
          body: result.body,
        });

        expect(response.status).toBe(200);

        // 3. 验证 mock server 收到了请求
        expect(server.receivedRequests.length).toBeGreaterThan(0);
        const receivedRequest = server.receivedRequests[0];

        // 4. 核心断言：绑定指令完整保留在 HTTP body 中
        //    用 JSON.stringify 搜索，不依赖具体 body 结构
        const bodyJson = JSON.stringify(receivedRequest.body);
        expect(bodyJson).toContain("关键要求");
        expect(bodyJson).toContain("角色参考图");
        expect(bodyJson).toContain("场景参考图");
        expect(bodyJson).toContain("一个女孩走在夕阳下的街道上");

        // 5. 绑定指令应在原始 prompt 之前（确保不被截断到开头）
        const charIdx = bodyJson.indexOf("关键要求");
        const baseIdx = bodyJson.indexOf("一个女孩走在夕阳下的街道上");
        expect(charIdx).toBeGreaterThan(-1);
        expect(baseIdx).toBeGreaterThan(-1);
        expect(charIdx).toBeLessThan(baseIdx);
      });

      it("仅角色绑定指令应完整保留在 HTTP 请求 body 中", async () => {
        const promptWithCharOnly = `${CHARACTER_BINDING_INSTRUCTION}\n\n${BASE_PROMPT}`;
        const ctx: VideoBuildContext = {
          prompt: promptWithCharOnly,
          model: profile.testModel,
          duration: TEST_DURATION,
        };

        const result = plugin.buildVideoRequest(ctx);
        const url = baseUrl + result.endpoint;
        await sendRequest(url, {
          method: result.method || "POST",
          headers: {
            ...plugin.getAuthHeaders(profile.testApiKey, result.endpoint),
            ...(result.extraHeaders || {}),
          },
          body: result.body,
        });

        const receivedRequest = server.receivedRequests[0];
        const bodyJson = JSON.stringify(receivedRequest.body);
        expect(bodyJson).toContain("关键要求");
        expect(bodyJson).toContain("角色参考图");
        expect(bodyJson).toContain(BASE_PROMPT);
      });

      if (supportsCharacterRef) {
        it("带 characterRef + 绑定指令应同时保留文本指令和图片字段", async () => {
          const ctx: VideoBuildContext = {
            prompt: BINDING_PROMPT,
            model: profile.testModel,
            duration: TEST_DURATION,
            characterRef: MINIMAL_PNG_DATA_URI,
          };

          const result = plugin.buildVideoRequest(ctx);
          const url = baseUrl + result.endpoint;
          await sendRequest(url, {
            method: result.method || "POST",
            headers: {
              ...plugin.getAuthHeaders(profile.testApiKey, result.endpoint),
              ...(result.extraHeaders || {}),
            },
            body: result.body,
          });

          const receivedRequest = server.receivedRequests[0];
          const bodyJson = JSON.stringify(receivedRequest.body);

          // 文本绑定指令保留
          expect(bodyJson).toContain("关键要求");
          expect(bodyJson).toContain("角色参考图");

          // 图片引用字段也存在（具体字段名因 provider 而异，用 profile 校验）
          const validationErrors = profile.validateGenerateBody(
            receivedRequest.body as Record<string, unknown>,
            {
              prompt: BINDING_PROMPT,
              duration: TEST_DURATION,
              characterRefs: [MINIMAL_PNG_DATA_URI],
            },
          );
          expect(validationErrors).toEqual([]);
        });
      }
    },
  );
});
