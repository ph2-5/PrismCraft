import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../utils", () => ({
  ensureAccessibleUrl: vi.fn((url: string) => url),
  downloadAsBase64: vi.fn(() => Promise.resolve("base64data")),
  resolveLocalUrlToBase64: vi.fn(() => Promise.resolve("data:image/png;base64,localdata")),
  stripDataUriPrefix: vi.fn((s: string) => s.replace(/^data:[^;]+;base64,/, "")),
  urlToPureBase64: vi.fn((s: string) => s.replace(/^data:[^;]+;base64,/, "")),
}));

import { VolcenginePlugin } from "../providers/volcengine";
import { KuaishouPlugin } from "../providers/kuaishou";
import { ZhipuPlugin } from "../providers/zhipu";
import { PixversePlugin } from "../providers/pixverse";
import { SeedancePlugin } from "../providers/seedance";
import { GooglePlugin } from "../providers/google";
import { OpenAISoraPlugin } from "../providers/openai-sora";
import { MiniMaxPlugin } from "../providers/minimax";
import { AnthropicPlugin } from "../providers/anthropic";
import { OpenAICompatiblePlugin } from "../providers/openai-compatible";

describe("Built-in Provider Capabilities", () => {
  describe("VolcenginePlugin", () => {
    let plugin: VolcenginePlugin;

    beforeEach(() => {
      plugin = new VolcenginePlugin();
    });

    it("should have correct capabilities", () => {
      expect(plugin.capabilities).toEqual({
        video: true,
        image: true,
        text: false,
        vision: false,
      });
    });

    it("should match volces.com URLs", () => {
      expect(plugin.match("https://ark.cn-beijing.volces.com/api/v3")).toBe(true);
    });

    it("should match bytepluses.com URLs", () => {
      expect(plugin.match("https://ark.ap-southeast.bytepluses.com/api/v3")).toBe(true);
    });

    it("should not match unrelated URLs", () => {
      expect(plugin.match("https://api.openai.com/v1")).toBe(false);
    });

    it("should have correct id and displayName", () => {
      expect(plugin.id).toBe("volcengine");
      expect(plugin.displayName).toBe("火山引擎 (Doubao)");
    });
  });

  describe("KuaishouPlugin", () => {
    let plugin: KuaishouPlugin;

    beforeEach(() => {
      plugin = new KuaishouPlugin();
    });

    it("should have correct capabilities", () => {
      expect(plugin.capabilities).toEqual({
        video: true,
        image: true,
        text: false,
        vision: false,
      });
    });

    it("should match klingai.com URLs", () => {
      expect(plugin.match("https://api.klingai.com/v1")).toBe(true);
    });

    it("should not match unrelated URLs", () => {
      expect(plugin.match("https://api.openai.com/v1")).toBe(false);
    });

    it("should have correct id", () => {
      expect(plugin.id).toBe("kuaishou");
    });
  });

  describe("ZhipuPlugin", () => {
    let plugin: ZhipuPlugin;

    beforeEach(() => {
      plugin = new ZhipuPlugin();
    });

    it("should have correct capabilities", () => {
      expect(plugin.capabilities).toEqual({
        video: true,
        image: true,
        text: false,
        vision: true,
      });
    });

    it("should match bigmodel.cn URLs", () => {
      expect(plugin.match("https://open.bigmodel.cn/api/paas/v4")).toBe(true);
    });

    it("should not match unrelated URLs", () => {
      expect(plugin.match("https://api.openai.com/v1")).toBe(false);
    });

    it("should have correct id", () => {
      expect(plugin.id).toBe("zhipu");
    });
  });

  describe("PixversePlugin", () => {
    let plugin: PixversePlugin;

    beforeEach(() => {
      plugin = new PixversePlugin();
    });

    it("should have correct capabilities", () => {
      expect(plugin.capabilities).toEqual({
        video: true,
        image: true,
        text: false,
        vision: false,
      });
    });

    it("should match dashscope.aliyuncs.com URLs", () => {
      expect(plugin.match("https://dashscope.aliyuncs.com/api/v1")).toBe(true);
    });

    it("should not match unrelated URLs", () => {
      expect(plugin.match("https://api.openai.com/v1")).toBe(false);
    });

    it("should have correct id", () => {
      expect(plugin.id).toBe("pixverse");
    });
  });

  describe("SeedancePlugin", () => {
    let plugin: SeedancePlugin;

    beforeEach(() => {
      plugin = new SeedancePlugin();
    });

    it("should have correct capabilities", () => {
      expect(plugin.capabilities).toEqual({
        video: true,
        image: true,
        text: false,
        vision: false,
      });
    });

    it("should match atlascloud.ai URLs", () => {
      expect(plugin.match("https://api.atlascloud.ai/v1")).toBe(true);
    });

    it("should match model containing 'seedance'", () => {
      expect(plugin.match("https://some-api.com/v1", "seedance-1.5-pro")).toBe(true);
    });

    it("should NOT match volces.com URLs", () => {
      expect(plugin.match("https://ark.cn-beijing.volces.com/api/v3")).toBe(false);
    });

    it("should NOT match bytepluses.com URLs", () => {
      expect(plugin.match("https://ark.ap-southeast.bytepluses.com/api/v3")).toBe(false);
    });

    it("should not match unrelated URLs without seedance model", () => {
      expect(plugin.match("https://api.openai.com/v1", "gpt-4")).toBe(false);
    });

    it("should not match unrelated URLs without model", () => {
      expect(plugin.match("https://api.openai.com/v1")).toBe(false);
    });

    it("should have correct id", () => {
      expect(plugin.id).toBe("seedance");
    });
  });

  describe("GooglePlugin", () => {
    let plugin: GooglePlugin;

    beforeEach(() => {
      plugin = new GooglePlugin();
    });

    it("should have correct capabilities", () => {
      expect(plugin.capabilities).toEqual({
        video: true,
        image: true,
        text: true,
        vision: true,
      });
    });

    it("should match generativeai.googleapis.com URLs", () => {
      expect(plugin.match("https://generativeai.googleapis.com/v1")).toBe(true);
    });

    it("should match aiplatform.googleapis.com URLs", () => {
      expect(plugin.match("https://aiplatform.googleapis.com/v1")).toBe(true);
    });

    it("should match model containing 'veo'", () => {
      expect(plugin.match("https://some-api.com/v1", "veo-3")).toBe(true);
    });

    it("should not match unrelated URLs without veo model", () => {
      expect(plugin.match("https://api.openai.com/v1", "gpt-4")).toBe(false);
    });

    it("should not match unrelated URLs without model", () => {
      expect(plugin.match("https://api.openai.com/v1")).toBe(false);
    });

    it("should have correct id", () => {
      expect(plugin.id).toBe("google");
    });

    it("should return empty auth headers (uses URL-based auth)", () => {
      expect(plugin.getAuthHeaders("test-key")).toEqual({});
    });

    it("should append key to URL", () => {
      const url = plugin.appendAuthToUrl!("https://api.com/v1/models", "AIzaTestKey");
      expect(url).toBe("https://api.com/v1/models?key=AIzaTestKey");
    });

    it("should append key with & for URLs with existing query", () => {
      const url = plugin.appendAuthToUrl!("https://api.com/v1?foo=bar", "AIzaTestKey");
      expect(url).toBe("https://api.com/v1?foo=bar&key=AIzaTestKey");
    });
  });

  describe("OpenAISoraPlugin", () => {
    let plugin: OpenAISoraPlugin;

    beforeEach(() => {
      plugin = new OpenAISoraPlugin();
    });

    it("should have correct capabilities", () => {
      expect(plugin.capabilities).toEqual({
        video: true,
        image: true,
        text: false,
        vision: false,
      });
    });

    it("should match api.openai.com AND model containing 'sora'", () => {
      expect(plugin.match("https://api.openai.com/v1", "sora-2")).toBe(true);
    });

    it("should NOT match api.openai.com without sora model", () => {
      expect(plugin.match("https://api.openai.com/v1", "gpt-4")).toBe(false);
    });

    it("should NOT match api.openai.com without model", () => {
      expect(plugin.match("https://api.openai.com/v1")).toBe(false);
    });

    it("should NOT match non-openai URLs even with sora model", () => {
      expect(plugin.match("https://other-api.com/v1", "sora-2")).toBe(false);
    });

    it("should have correct id", () => {
      expect(plugin.id).toBe("openai-sora");
    });
  });

  describe("MiniMaxPlugin", () => {
    let plugin: MiniMaxPlugin;

    beforeEach(() => {
      plugin = new MiniMaxPlugin();
    });

    it("should have correct capabilities", () => {
      expect(plugin.capabilities).toEqual({
        video: true,
        image: true,
        text: false,
        vision: false,
      });
    });

    it("should match minimaxi.com URLs", () => {
      expect(plugin.match("https://api.minimaxi.com/v1")).toBe(true);
    });

    it("should match model containing 'hailuo'", () => {
      expect(plugin.match("https://some-api.com/v1", "hailuo-2.3")).toBe(true);
    });

    it("should not match unrelated URLs without hailuo model", () => {
      expect(plugin.match("https://api.openai.com/v1", "gpt-4")).toBe(false);
    });

    it("should not match unrelated URLs without model", () => {
      expect(plugin.match("https://api.openai.com/v1")).toBe(false);
    });

    it("should have correct id", () => {
      expect(plugin.id).toBe("minimax");
    });
  });

  describe("AnthropicPlugin", () => {
    let plugin: AnthropicPlugin;

    beforeEach(() => {
      plugin = new AnthropicPlugin();
    });

    it("should have correct capabilities (no video/image)", () => {
      expect(plugin.capabilities).toEqual({
        video: false,
        image: false,
        text: true,
        vision: true,
      });
    });

    it("should match anthropic.com URLs", () => {
      expect(plugin.match("https://api.anthropic.com/v1")).toBe(true);
    });

    it("should match bedrock-runtime URLs", () => {
      expect(plugin.match("https://bedrock-runtime.us-east-1.amazonaws.com")).toBe(true);
    });

    it("should not match unrelated URLs", () => {
      expect(plugin.match("https://api.openai.com/v1")).toBe(false);
    });

    it("should throw on buildVideoRequest (defense-in-depth)", () => {
      expect(() => plugin.buildVideoRequest({ prompt: "test", duration: 5 })).toThrow("Anthropic Claude 不支持视频生成");
    });

    it("should throw on buildImageRequest (defense-in-depth)", () => {
      expect(() => plugin.buildImageRequest({ prompt: "test", size: "1024x1024", referenceImages: [] })).toThrow("Anthropic Claude 不支持图片生成");
    });

    it("should build text request correctly", () => {
      const result = plugin.buildTextRequest({
        prompt: "hello",
        maxTokens: 100,
        temperature: 0.5,
      });
      expect(result.body).toMatchObject({
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 100,
      });
      expect(result.endpoint).toBe("/messages");
    });

    it("should return x-api-key auth headers", () => {
      const headers = plugin.getAuthHeaders("sk-ant-test");
      expect(headers).toEqual({
        "x-api-key": "sk-ant-test",
        "anthropic-version": "2023-06-01",
      });
    });

    it("should extract text content from Anthropic format", () => {
      const response = {
        content: [{ type: "text", text: "Hello from Claude" }],
      };
      expect(plugin.extractTextContent(response)).toBe("Hello from Claude");
    });

    it("should have correct id", () => {
      expect(plugin.id).toBe("anthropic");
    });
  });

  describe("OpenAICompatiblePlugin", () => {
    let plugin: OpenAICompatiblePlugin;

    beforeEach(() => {
      plugin = new OpenAICompatiblePlugin();
    });

    it("should have correct capabilities (all true, fallback)", () => {
      expect(plugin.capabilities).toEqual({
        video: true,
        image: true,
        text: true,
        vision: true,
      });
    });

    it("should always match (fallback behavior)", () => {
      expect(plugin.match("https://any-url.com/api")).toBe(true);
      expect(plugin.match("https://totally-unrelated.com")).toBe(true);
      expect(plugin.match("")).toBe(true);
    });

    it("should have correct id", () => {
      expect(plugin.id).toBe("openai-compatible");
    });

    it("should return Bearer auth headers by default", () => {
      const headers = plugin.getAuthHeaders("sk-test");
      expect(headers).toEqual({ Authorization: "Bearer sk-test" });
    });
  });

  describe("Provider match priority verification", () => {
    it("Volcengine should match before Seedance for volces.com", () => {
      const volcengine = new VolcenginePlugin();
      const seedance = new SeedancePlugin();
      const url = "https://ark.cn-beijing.volces.com/api/v3";

      expect(volcengine.match(url)).toBe(true);
      expect(seedance.match(url)).toBe(false);
    });

    it("Volcengine should match before Seedance for bytepluses.com", () => {
      const volcengine = new VolcenginePlugin();
      const seedance = new SeedancePlugin();
      const url = "https://ark.ap-southeast.bytepluses.com/api/v3";

      expect(volcengine.match(url)).toBe(true);
      expect(seedance.match(url)).toBe(false);
    });

    it("OpenAI Sora should NOT match without sora model (allows OpenAI Compatible fallback)", () => {
      const sora = new OpenAISoraPlugin();
      const compatible = new OpenAICompatiblePlugin();
      const url = "https://api.openai.com/v1";

      expect(sora.match(url, "gpt-4")).toBe(false);
      expect(compatible.match(url, "gpt-4")).toBe(true);
    });
  });
});
