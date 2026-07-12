/**
 * Config Tools 单元测试
 *
 * 重点测试 configure_api_provider 工具（用户发 API key 即可自动配置）。
 * Mock @/shared/api-config，不真实调用 API。
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock @/shared/api-config — vi.mock 会被 hoist 到所有 import 之前
// getAllTemplatesAsync mock 返回类 PROVIDER_TEMPLATES 结构，供 getVendorPresets 派生
const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  checkConfigStatus: vi.fn(),
  testConnection: vi.fn(),
  getAllTemplatesAsync: vi.fn(),
}));

// 测试用 provider 模板数据（模拟 PROVIDER_TEMPLATES 结构）
const mockTemplates = {
  openai: {
    name: "OpenAI",
    format: "openai" as const,
    baseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-4o", name: "GPT-4o", capabilities: ["text", "image", "vision"] },
      { id: "gpt-4o-mini", name: "GPT-4o mini", capabilities: ["text", "vision"] },
    ],
  },
  ollama: {
    name: "Ollama",
    format: "openai" as const,
    baseUrl: "http://localhost:11434/v1",
    models: [
      { id: "qwen2.5:7b", name: "Qwen 2.5 7B", capabilities: ["text"] },
      { id: "nomic-embed-text", name: "Nomic Embed", capabilities: ["embedding"] },
    ],
  },
};

vi.mock("@/shared/api-config", () => ({
  loadConfig: mocks.loadConfig,
  saveConfig: mocks.saveConfig,
  checkConfigStatus: mocks.checkConfigStatus,
  testConnection: mocks.testConnection,
  getAllTemplatesAsync: mocks.getAllTemplatesAsync,
}));

import {
  loadConfig,
  saveConfig,
  testConnection,
  checkConfigStatus,
} from "@/shared/api-config";
import {
  configureApiProviderTool,
  getApiConfigTool,
  listProvidersTool,
  validateApiKeyTool,
  testConnectionTool,
  checkApiHealthTool,
  _resetVendorPresetsCache,
} from "../config-tools";
import type { ToolContext } from "../../domain/types";

// 内联 mock 类型（避免在 modules 测试中直接 import infrastructure 类型，触发 ESLint）
interface MockModel {
  id: string;
  name: string;
  capabilities: string[];
}

interface MockProvider {
  id: string;
  name: string;
  format: string;
  baseUrl: string;
  apiKey: string;
  models: MockModel[];
}

interface MockConfig {
  version: number;
  providers: MockProvider[];
  mapping: Record<string, string>;
  fallback: { enabled: boolean; order?: string[] };
}

function makeMockConfig(overrides?: Partial<MockConfig>): MockConfig {
  return {
    version: 1,
    providers: [],
    mapping: {},
    fallback: { enabled: false, order: [] },
    ...overrides,
  };
}

function makeMockProvider(overrides?: Partial<MockProvider>): MockProvider {
  return {
    id: "test_provider",
    name: "test",
    format: "openai",
    baseUrl: "https://api.test.com/v1",
    apiKey: "sk-test1234567890",
    models: [{ id: "gpt-4", name: "GPT-4", capabilities: ["text"] }],
    ...overrides,
  };
}

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

/** checkConfigStatus 返回的 mock 类型 */
interface MockConfigStatusItem {
  configured: boolean;
  provider: string;
  available: boolean;
  model?: string;
}

interface MockConfigStatus {
  capabilities: {
    text: MockConfigStatusItem;
    image: MockConfigStatusItem;
    vision: MockConfigStatusItem;
    video: MockConfigStatusItem;
    embedding: MockConfigStatusItem;
    audio: MockConfigStatusItem;
  };
  allConfigured: boolean;
  configuredCount: number;
  totalCount: number;
  missing: string[];
}

function makeMockConfigStatus(
  overrides?: Partial<MockConfigStatus>,
): MockConfigStatus {
  return {
    capabilities: {
      text: { configured: true, provider: "openai", available: true, model: "gpt-4o" },
      image: { configured: true, provider: "openai", available: true, model: "dall-e-3" },
      vision: { configured: true, provider: "openai", available: true, model: "gpt-4o" },
      video: { configured: false, provider: "未配置", available: false },
      embedding: { configured: false, provider: "未配置", available: false },
      audio: { configured: false, provider: "未配置", available: false },
    },
    allConfigured: false,
    configuredCount: 3,
    totalCount: 4,
    missing: ["视频生成"],
    ...overrides,
  };
}

describe("config-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置 vendor 预设缓存，确保每个测试重新派生（mock 可能被单测覆盖）
    _resetVendorPresetsCache();
    // 设置默认 mock 行为，单个测试可覆盖
    mocks.loadConfig.mockResolvedValue(makeMockConfig() as never);
    mocks.saveConfig.mockResolvedValue(undefined);
    mocks.testConnection.mockResolvedValue({ success: true, message: "OK" });
    mocks.checkConfigStatus.mockResolvedValue(makeMockConfigStatus() as never);
    // getAllTemplatesAsync 默认返回 mock 模板（含 openai/ollama）
    mocks.getAllTemplatesAsync.mockResolvedValue(mockTemplates);
  });

  describe("configure_api_provider", () => {
    it("1. 正常配置已知 vendor（openai）", async () => {
      const ctx = makeCtx();
      const result = await configureApiProviderTool.execute(
        { apiKey: "sk-test1234567890", vendor: "openai" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as {
        providerId: string;
        vendor: string;
        configuredCapabilities: string[];
      };
      // providerId 形如 "openai_{timestamp}"
      expect(data.providerId).toContain("openai");
      expect(data.vendor).toBe("openai");
      // openai 预设 capabilities: text, image, vision
      expect(data.configuredCapabilities).toContain("text");
      expect(saveConfig).toHaveBeenCalledTimes(1);
      // 每个 capability 调用一次 testConnection（openai = 3 次）
      expect(testConnection).toHaveBeenCalledTimes(3);
      // 进度回调被触发
      expect(ctx.onProgress).toHaveBeenCalled();
    });

    it("2. 未知 vendor 且无 baseUrl 时失败", async () => {
      const ctx = makeCtx();
      const result = await configureApiProviderTool.execute(
        { apiKey: "sk-test", vendor: "unknown_vendor" },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("未识别的 vendor");
      // 未保存配置
      expect(saveConfig).not.toHaveBeenCalled();
      // 未测试连接
      expect(testConnection).not.toHaveBeenCalled();
    });

    it("3. 自定义 baseUrl 配置", async () => {
      const ctx = makeCtx();
      await configureApiProviderTool.execute(
        {
          apiKey: "sk-test",
          vendor: "custom",
          baseUrl: "https://api.custom.com/v1",
        },
        ctx,
      );

      expect(saveConfig).toHaveBeenCalledTimes(1);
      // 检查传给 saveConfig 的配置中包含自定义 baseUrl 的 provider
      const savedConfig = vi.mocked(saveConfig).mock.calls[0][0];
      const customProvider = savedConfig.providers.find(
        (p) => p.baseUrl === "https://api.custom.com/v1",
      );
      expect(customProvider).toBeDefined();
      expect(customProvider?.baseUrl).toBe("https://api.custom.com/v1");
      // format 默认为 openai
      expect(customProvider?.format).toBe("openai");
    });

    it("4. 测试连接失败时返回失败", async () => {
      vi.mocked(testConnection).mockResolvedValue({
        success: false,
        message: "Connection refused",
      });

      const ctx = makeCtx();
      const result = await configureApiProviderTool.execute(
        { apiKey: "sk-test", vendor: "openai" },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("测试失败");
      // 配置仍被保存（即使测试失败）
      expect(saveConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe("get_api_config", () => {
    it("5. 正常获取配置（apiKey 脱敏）", async () => {
      const fullKey = "sk-1234567890abcdef";
      vi.mocked(loadConfig).mockResolvedValue(
        makeMockConfig({
          providers: [makeMockProvider({ apiKey: fullKey })],
        }) as never,
      );

      const result = await getApiConfigTool.execute({}, makeCtx());

      expect(result.success).toBe(true);
      const data = result.data as { providers: Array<{ apiKey: string }> };
      expect(data.providers).toHaveLength(1);
      // 脱敏格式：slice(0,4) + "***" + slice(-4)
      expect(data.providers[0].apiKey).toBe("sk-1***cdef");
      // 不泄露原始 key
      expect(data.providers[0].apiKey).not.toBe(fullKey);
    });

    it("6. 空配置返回空数组", async () => {
      const result = await getApiConfigTool.execute({}, makeCtx());

      expect(result.success).toBe(true);
      const data = result.data as { providers: unknown[] };
      expect(data.providers).toEqual([]);
    });
  });

  describe("list_providers", () => {
    it("7. 列出 provider 并脱敏 apiKey", async () => {
      vi.mocked(loadConfig).mockResolvedValue(
        makeMockConfig({
          providers: [
            makeMockProvider({ id: "p1", apiKey: "sk-1234567890abcdef" }),
            makeMockProvider({ id: "p2", apiKey: "sk-abcdefghij012345" }),
          ],
        }) as never,
      );

      const result = await listProvidersTool.execute({}, makeCtx());

      expect(result.success).toBe(true);
      const data = result.data as Array<{ id: string; apiKeyMasked: string }>;
      expect(data).toHaveLength(2);
      expect(data[0].apiKeyMasked).toBe("sk-1***cdef");
      expect(data[1].apiKeyMasked).toBe("sk-a***2345");
    });
  });

  describe("validate_api_key", () => {
    it("8. 验证成功", async () => {
      vi.mocked(testConnection).mockResolvedValue({ success: true, message: "OK" });

      const result = await validateApiKeyTool.execute(
        { providerId: "test_provider" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      const data = result.data as { valid: boolean };
      expect(data.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("9. 验证失败", async () => {
      vi.mocked(testConnection).mockResolvedValue({
        success: false,
        message: "Invalid API key",
      });

      const result = await validateApiKeyTool.execute(
        { providerId: "test_provider" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("验证失败");
      // 错误消息已脱敏，不再包含原始 provider 错误
      expect(result.error).not.toContain("sk-");
    });
  });

  describe("test_connection", () => {
    it("10. 测试连接成功", async () => {
      vi.mocked(testConnection).mockResolvedValue({ success: true, message: "OK" });

      const result = await testConnectionTool.execute(
        { capability: "text" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      const data = result.data as { capability: string; message: string };
      expect(data.capability).toBe("text");
      expect(data.message).toBe("OK");
      expect(result.error).toBeUndefined();
    });
  });

  describe("check_api_health", () => {
    it("11. 返回完整健康状态（部分配置）", async () => {
      vi.mocked(checkConfigStatus).mockResolvedValue(makeMockConfigStatus() as never);

      const result = await checkApiHealthTool.execute({}, makeCtx());

      expect(result.success).toBe(true);
      const data = result.data as MockConfigStatus;
      // 6 个能力项
      const caps = data.capabilities;
      expect(caps.text).toBeDefined();
      expect(caps.image).toBeDefined();
      expect(caps.vision).toBeDefined();
      expect(caps.video).toBeDefined();
      expect(caps.embedding).toBeDefined();
      expect(caps.audio).toBeDefined();
      // 默认 mock 中 text/image/vision 已配置，video/embedding/audio 未配置
      expect(caps.text.configured).toBe(true);
      expect(caps.video.configured).toBe(false);
      expect(data.allConfigured).toBe(false);
      expect(data.configuredCount).toBe(3);
      expect(data.totalCount).toBe(4);
      expect(data.missing).toContain("视频生成");
    });

    it("12. 全部能力已配置时 allConfigured=true", async () => {
      vi.mocked(checkConfigStatus).mockResolvedValue(
        makeMockConfigStatus({
          capabilities: {
            text: { configured: true, provider: "openai", available: true, model: "gpt-4o" },
            image: { configured: true, provider: "openai", available: true, model: "dall-e-3" },
            vision: { configured: true, provider: "openai", available: true, model: "gpt-4o" },
            video: { configured: true, provider: "kling", available: true, model: "kling-v1" },
            embedding: { configured: false, provider: "未配置", available: false },
            audio: { configured: false, provider: "未配置", available: false },
          },
          allConfigured: true,
          configuredCount: 4,
          missing: [],
        }) as never,
      );

      const result = await checkApiHealthTool.execute({}, makeCtx());

      expect(result.success).toBe(true);
      const data = result.data as MockConfigStatus;
      expect(data.allConfigured).toBe(true);
      expect(data.configuredCount).toBe(4);
      expect(data.missing).toEqual([]);
    });

    it("13. 全部能力未配置时 missing 包含全部 4 项", async () => {
      vi.mocked(checkConfigStatus).mockResolvedValue(
        makeMockConfigStatus({
          capabilities: {
            text: { configured: false, provider: "未配置", available: false },
            image: { configured: false, provider: "未配置", available: false },
            vision: { configured: false, provider: "未配置", available: false },
            video: { configured: false, provider: "未配置", available: false },
            embedding: { configured: false, provider: "未配置", available: false },
            audio: { configured: false, provider: "未配置", available: false },
          },
          allConfigured: false,
          configuredCount: 0,
          missing: ["文本生成", "图像生成", "视觉分析", "视频生成"],
        }) as never,
      );

      const result = await checkApiHealthTool.execute({}, makeCtx());

      expect(result.success).toBe(true);
      const data = result.data as MockConfigStatus;
      expect(data.configuredCount).toBe(0);
      expect(data.missing).toHaveLength(4);
    });

    it("14. 调用 checkConfigStatus 一次", async () => {
      await checkApiHealthTool.execute({}, makeCtx());

      expect(checkConfigStatus).toHaveBeenCalledTimes(1);
    });

    it("15. checkConfigStatus 抛错时异常向上传播（由 ToolExecutor 兜底）", async () => {
      vi.mocked(checkConfigStatus).mockRejectedValue(new Error("Network error"));

      await expect(checkApiHealthTool.execute({}, makeCtx())).rejects.toThrow(
        "Network error",
      );
    });
  });
});
