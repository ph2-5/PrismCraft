import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  DEFAULT_PROVIDER,
  getProviderInfo,
  buildTrackingInfo,
} from "../video-tracker";

describe("video-tracker", () => {
  describe("PROVIDERS 常量", () => {
    it("应该包含主流视频生成服务商", () => {
      expect(PROVIDERS["volces.com"]).toBeDefined();
      expect(PROVIDERS["bytepluses.com"]).toBeDefined();
      expect(PROVIDERS["dashscope.aliyuncs.com"]).toBeDefined();
      expect(PROVIDERS["klingai.com"]).toBeDefined();
      expect(PROVIDERS["bigmodel.cn"]).toBeDefined();
      expect(PROVIDERS["openai.com"]).toBeDefined();
      expect(PROVIDERS["atlascloud.ai"]).toBeDefined();
    });

    it("每个 provider 应该包含必要字段", () => {
      for (const provider of Object.values(PROVIDERS)) {
        expect(provider.name).toBeDefined();
        expect(typeof provider.name).toBe("string");
        expect(provider.name.length).toBeGreaterThan(0);
      }
    });

    it("火山引擎 provider 应该有正确的查询端点构造函数", () => {
      const provider = PROVIDERS["volces.com"]!;
      expect(provider.queryEndpoint).toBeDefined();
      const endpoint = provider.queryEndpoint!("https://api.example.com", "task123");
      expect(endpoint).toBe("https://api.example.com/contents/generations/tasks/task123");
    });

    it("火山引擎 provider 应该有任务 URL 模式", () => {
      const provider = PROVIDERS["volces.com"]!;
      expect(provider.taskUrlPattern).toBeDefined();
      const url = provider.taskUrlPattern!("task123");
      expect(url).toContain("volcengine.com");
    });
  });

  describe("DEFAULT_PROVIDER", () => {
    it("应该是'自定义API'", () => {
      expect(DEFAULT_PROVIDER.name).toBe("自定义API");
    });

    it("应该包含 howToCheck 说明", () => {
      expect(DEFAULT_PROVIDER.howToCheck).toBeDefined();
      expect(DEFAULT_PROVIDER.howToCheck!.length).toBeGreaterThan(0);
    });
  });

  describe("getProviderInfo", () => {
    it("apiUrl 为空时应返回 DEFAULT_PROVIDER", () => {
      expect(getProviderInfo(undefined)).toBe(DEFAULT_PROVIDER);
      expect(getProviderInfo("")).toBe(DEFAULT_PROVIDER);
    });

    it("应该根据 URL hostname 匹配 provider（火山引擎）", () => {
      const info = getProviderInfo("https://ark.cn-beijing.volces.com/api/v1");
      expect(info.name).toBe("火山引擎 (Doubao)");
    });

    it("应该根据 URL hostname 匹配 provider（阿里云）", () => {
      const info = getProviderInfo("https://dashscope.aliyuncs.com/api/v1");
      expect(info.name).toBe("阿里云百炼 (DashScope)");
    });

    it("应该根据 URL hostname 匹配 provider（可灵）", () => {
      const info = getProviderInfo("https://api.klingai.com/api/v1");
      expect(info.name).toBe("可灵AI (Kling)");
    });

    it("应该根据 URL hostname 匹配 provider（智谱）", () => {
      const info = getProviderInfo("https://open.bigmodel.cn/api/paas/v4");
      expect(info.name).toBe("智谱AI (GLM)");
    });

    it("应该根据 URL hostname 匹配 provider（OpenAI）", () => {
      const info = getProviderInfo("https://api.openai.com/v1");
      expect(info.name).toBe("OpenAI");
    });

    it("未知 URL hostname 时应返回 DEFAULT_PROVIDER", () => {
      const info = getProviderInfo("https://unknown-provider.com/api");
      expect(info).toBe(DEFAULT_PROVIDER);
    });

    it("无效 URL 但包含 provider domain 时应正确匹配", () => {
      const info = getProviderInfo("this-is-not-a-url-but-contains-volces.com-path");
      expect(info.name).toBe("火山引擎 (Doubao)");
    });

    it("无效 URL 且不包含任何已知 domain 时应返回 DEFAULT_PROVIDER", () => {
      const info = getProviderInfo("not-a-url-at-all");
      expect(info).toBe(DEFAULT_PROVIDER);
    });

    it("子域名匹配应正确工作", () => {
      const info = getProviderInfo("https://subdomain.klingai.com/api");
      expect(info.name).toBe("可灵AI (Kling)");
    });
  });

  describe("buildTrackingInfo", () => {
    it("应该构建完整的追踪信息（火山引擎）", () => {
      const info = buildTrackingInfo(
        "task-123",
        "https://ark.cn-beijing.volces.com/api/v1",
        "sk-***abc",
        "doubao-video",
      );
      expect(info.providerName).toBe("火山引擎 (Doubao)");
      expect(info.taskId).toBe("task-123");
      expect(info.apiUrl).toBe("https://ark.cn-beijing.volces.com/api/v1");
      expect(info.model).toBe("doubao-video");
      expect(info.apiKeyPreview).toBe("sk-***abc");
      expect(info.taskUrl).toBeDefined();
      expect(info.queryEndpoint).toContain("task-123");
      expect(info.apiDocUrl).toBeDefined();
      expect(info.howToCheck).toBeDefined();
      expect(info.providerWebsite).toBeDefined();
    });

    it("apiUrl 为空时 queryEndpoint 应为 undefined", () => {
      const info = buildTrackingInfo("task-123", undefined, "key", "model");
      expect(info.apiUrl).toBe("");
      expect(info.queryEndpoint).toBeUndefined();
      expect(info.providerName).toBe("自定义API");
    });

    it("model 为空时应该使用空字符串", () => {
      const info = buildTrackingInfo("task-123", "https://api.klingai.com");
      expect(info.model).toBe("");
    });

    it("apiKeyPreview 为空时应该使用空字符串", () => {
      const info = buildTrackingInfo("task-123", "https://api.klingai.com");
      expect(info.apiKeyPreview).toBe("");
    });

    it("未知 provider 时应使用 DEFAULT_PROVIDER 信息", () => {
      const info = buildTrackingInfo(
        "task-123",
        "https://unknown.com/api",
        "key",
        "model",
      );
      expect(info.providerName).toBe("自定义API");
      expect(info.taskUrl).toBeUndefined();
      expect(info.queryEndpoint).toBeUndefined();
      expect(info.apiDocUrl).toBeUndefined();
      expect(info.howToCheck).toBe(DEFAULT_PROVIDER.howToCheck);
    });

    it("taskUrl 应该根据 taskId 生成", () => {
      const info = buildTrackingInfo(
        "abc-123",
        "https://api.klingai.com",
      );
      expect(info.taskUrl).toBeDefined();
      // 可灵的 taskUrlPattern 不依赖 taskId，但应该返回有效 URL
      expect(info.taskUrl).toContain("klingai.com");
    });

    it("queryEndpoint 应该包含 baseUrl 和 taskId", () => {
      const info = buildTrackingInfo(
        "task-xyz",
        "https://api.klingai.com",
      );
      expect(info.queryEndpoint).toBe("https://api.klingai.com/api/v1/video/task/task-xyz");
    });
  });
});
