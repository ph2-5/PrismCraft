import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/shared/file-http", () => ({
  getConfig: vi.fn(),
  setConfig: vi.fn(),
}));

import {
  getGatewayConfig,
  setGatewayConfig,
  resetGatewayConfig,
  resolveApiBaseUrl,
  buildGatewayHeaders,
  loadGatewayConfig,
  saveGatewayConfig,
  type CloudGatewayConfig,
} from "../gateway";
import { getConfig, setConfig } from "@/shared/file-http";

const mockedGetConfig = vi.mocked(getConfig);
const mockedSetConfig = vi.mocked(setConfig);

describe("resolveApiBaseUrl", () => {
  it("local 模式返回本地服务器地址", () => {
    expect(resolveApiBaseUrl({ mode: "local" }, 8933)).toBe("http://localhost:8933");
  });

  it("remote 模式返回远程 baseUrl", () => {
    expect(resolveApiBaseUrl({ mode: "remote", baseUrl: "https://api.example.com" }, 8933))
      .toBe("https://api.example.com");
  });

  it("remote 模式去除末尾斜杠", () => {
    expect(resolveApiBaseUrl({ mode: "remote", baseUrl: "https://api.example.com/" }, 8933))
      .toBe("https://api.example.com");
  });

  it("remote 模式缺少 baseUrl 时回退本地", () => {
    expect(resolveApiBaseUrl({ mode: "remote" }, 8933)).toBe("http://localhost:8933");
  });
});

describe("buildGatewayHeaders", () => {
  it("local 模式不追加鉴权头", () => {
    const headers = buildGatewayHeaders({ mode: "local" }, { "Content-Type": "application/json" });
    expect(headers).toEqual({ "Content-Type": "application/json" });
  });

  it("remote 模式带 token 时追加 Bearer 头", () => {
    const headers = buildGatewayHeaders(
      { mode: "remote", baseUrl: "https://api.example.com", token: "secret-token" },
      { "Content-Type": "application/json" },
    );
    expect(headers.Authorization).toBe("Bearer secret-token");
  });

  it("remote 模式无 token 时不追加鉴权头", () => {
    const headers = buildGatewayHeaders(
      { mode: "remote", baseUrl: "https://api.example.com" },
      { "Content-Type": "application/json" },
    );
    expect(headers.Authorization).toBeUndefined();
  });

  it("不修改入参对象", () => {
    const original = { "Content-Type": "application/json" };
    buildGatewayHeaders({ mode: "remote", token: "t" }, original);
    expect(original.Authorization).toBeUndefined();
  });
});

describe("get/set/resetGatewayConfig", () => {
  beforeEach(() => {
    resetGatewayConfig();
    vi.clearAllMocks();
  });

  it("默认本地模式", () => {
    expect(getGatewayConfig()).toEqual({ mode: "local" });
  });

  it("setGatewayConfig 合并默认值（remote 保留字段）", () => {
    setGatewayConfig({ mode: "remote", baseUrl: "https://api.example.com" } as CloudGatewayConfig);
    expect(getGatewayConfig()).toEqual({ mode: "remote", baseUrl: "https://api.example.com" });
  });

  it("resetGatewayConfig 恢复本地模式", () => {
    setGatewayConfig({ mode: "remote", baseUrl: "https://api.example.com" } as CloudGatewayConfig);
    resetGatewayConfig();
    expect(getGatewayConfig()).toEqual({ mode: "local" });
  });
});

describe("loadGatewayConfig / saveGatewayConfig", () => {
  beforeEach(() => {
    resetGatewayConfig();
    vi.clearAllMocks();
  });

  it("loadGatewayConfig 无存储配置时保持本地模式", async () => {
    mockedGetConfig.mockResolvedValue(null);
    const config = await loadGatewayConfig();
    expect(config.mode).toBe("local");
  });

  it("loadGatewayConfig 加载远程配置", async () => {
    mockedGetConfig.mockResolvedValue({ mode: "remote", baseUrl: "https://api.example.com", token: "t" });
    const config = await loadGatewayConfig();
    expect(config).toEqual({ mode: "remote", baseUrl: "https://api.example.com", token: "t" });
  });

  it("loadGatewayConfig 存储配置损坏时回退本地", async () => {
    mockedGetConfig.mockResolvedValue({ garbage: true });
    const config = await loadGatewayConfig();
    expect(config.mode).toBe("local");
  });

  it("saveGatewayConfig 持久化并更新运行时配置", async () => {
    mockedSetConfig.mockResolvedValue(true);
    const saved = await saveGatewayConfig({ mode: "remote", baseUrl: "https://api.example.com", token: "t" });
    expect(saved).toBe(true);
    expect(mockedSetConfig).toHaveBeenCalledWith("cloud.gateway", { mode: "remote", baseUrl: "https://api.example.com", token: "t" });
    expect(getGatewayConfig().mode).toBe("remote");
  });
});
