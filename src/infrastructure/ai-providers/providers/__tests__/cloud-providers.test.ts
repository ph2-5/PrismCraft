import { describe, it, expect } from "vitest";
import { CLOUD_PROVIDERS, DEFAULT_CLOUD_PROVIDER } from "../cloud-providers";

describe("CLOUD_PROVIDERS", () => {
  const providerKeys = Object.keys(CLOUD_PROVIDERS);

  it("包含 7 个提供商", () => {
    expect(providerKeys).toHaveLength(7);
  });

  it("包含 volces.com 提供商", () => {
    expect(providerKeys).toContain("volces.com");
  });

  it("包含 bytepluses.com 提供商", () => {
    expect(providerKeys).toContain("bytepluses.com");
  });

  it("包含 dashscope.aliyuncs.com 提供商", () => {
    expect(providerKeys).toContain("dashscope.aliyuncs.com");
  });

  it("包含 klingai.com 提供商", () => {
    expect(providerKeys).toContain("klingai.com");
  });

  it("包含 bigmodel.cn 提供商", () => {
    expect(providerKeys).toContain("bigmodel.cn");
  });

  it("包含 openai.com 提供商", () => {
    expect(providerKeys).toContain("openai.com");
  });

  it("包含 atlascloud.ai 提供商", () => {
    expect(providerKeys).toContain("atlascloud.ai");
  });

  it("每个提供商都有 name、websiteUrl、taskUrlPattern、queryEndpoint、apiDocUrl、howToCheck", () => {
    for (const key of providerKeys) {
      const provider = CLOUD_PROVIDERS[key];
      expect(provider).toHaveProperty("name");
      expect(provider).toHaveProperty("websiteUrl");
      expect(provider).toHaveProperty("taskUrlPattern");
      expect(provider).toHaveProperty("queryEndpoint");
      expect(provider).toHaveProperty("apiDocUrl");
      expect(provider).toHaveProperty("howToCheck");
    }
  });

  it("queryEndpoint 返回正确的 URL 格式", () => {
    const baseUrl = "https://api.example.com";
    const taskId = "task-123";

    expect(CLOUD_PROVIDERS["volces.com"]!.queryEndpoint!(baseUrl, taskId)).toBe(
      "https://api.example.com/contents/generations/tasks/task-123"
    );
    expect(CLOUD_PROVIDERS["bytepluses.com"]!.queryEndpoint!(baseUrl, taskId)).toBe(
      "https://api.example.com/contents/generations/tasks/task-123"
    );
    expect(CLOUD_PROVIDERS["dashscope.aliyuncs.com"]!.queryEndpoint!(baseUrl, taskId)).toBe(
      "https://api.example.com/services/aigc/video-generation/video-synthesis/task-123"
    );
    expect(CLOUD_PROVIDERS["klingai.com"]!.queryEndpoint!(baseUrl, taskId)).toBe(
      "https://api.example.com/api/v1/video/task/task-123"
    );
    expect(CLOUD_PROVIDERS["bigmodel.cn"]!.queryEndpoint!(baseUrl, taskId)).toBe(
      "https://api.example.com/videos/generations/task-123"
    );
    expect(CLOUD_PROVIDERS["openai.com"]!.queryEndpoint!(baseUrl, taskId)).toBe(
      "https://api.example.com/video/generations/task-123"
    );
    expect(CLOUD_PROVIDERS["atlascloud.ai"]!.queryEndpoint!(baseUrl, taskId)).toBe(
      "https://api.example.com/seedance/video/task-123"
    );
  });
});

describe("DEFAULT_CLOUD_PROVIDER", () => {
  it("有 name 属性", () => {
    expect(DEFAULT_CLOUD_PROVIDER.name).toBeDefined();
    expect(typeof DEFAULT_CLOUD_PROVIDER.name).toBe("string");
  });

  it("有 howToCheck 属性", () => {
    expect(DEFAULT_CLOUD_PROVIDER.howToCheck).toBeDefined();
    expect(typeof DEFAULT_CLOUD_PROVIDER.howToCheck).toBe("string");
  });
});
