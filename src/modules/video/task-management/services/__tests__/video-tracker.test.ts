import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getProviderInfo,
  buildTrackingInfo,
  copyTrackingInfoToClipboard,
  openTaskQueryLink,
} from "../video-tracker";
import type { TrackingInfo } from "../video-tracker";

describe("video-tracker", () => {
  describe("getProviderInfo", () => {
    it("应返回已知 provider 的配置", () => {
      const kling = getProviderInfo("kling");
      expect(kling).toBeDefined();
      expect(kling?.name).toBe("可灵 (Kling)");
      expect(kling?.id).toBe("kling");
      expect(kling?.baseUrl).toBe("https://api.klingai.com");
    });

    it("应返回所有已知 provider", () => {
      const providers = ["kling", "minimax", "jimeng", "vidu", "luma", "runway"];
      for (const id of providers) {
        expect(getProviderInfo(id)).toBeDefined();
      }
    });

    it("未知 provider 应返回 undefined", () => {
      expect(getProviderInfo("unknown_provider")).toBeUndefined();
    });

    it("空字符串应返回 undefined", () => {
      expect(getProviderInfo("")).toBeUndefined();
    });
  });

  describe("buildTrackingInfo", () => {
    it("有 providerId 时应构建完整信息", () => {
      const info = buildTrackingInfo("task-123", "https://api.example.com", "kling", "v1");
      expect(info.providerName).toBe("可灵 (Kling)");
      expect(info.model).toBe("v1");
      expect(info.apiUrl).toBe("https://api.example.com");
      expect(info.queryEndpoint).toContain("task-123");
      expect(info.apiDocUrl).toBe("https://platform.klingai.com/docs");
      expect(info.howToCheck).toContain("可灵平台");
    });

    it("有 statusQueryUrl 的 provider 应生成查询端点", () => {
      const info = buildTrackingInfo("task-456", undefined, "kling");
      expect(info.queryEndpoint).toBe("https://platform.klingai.com/task?taskId=task-456");
    });

    it("无 statusQueryUrl 的 provider 不应生成查询端点", () => {
      const info = buildTrackingInfo("task-789", undefined, "jimeng");
      expect(info.queryEndpoint).toBeUndefined();
    });

    it("无 providerId 时应使用默认值", () => {
      const info = buildTrackingInfo("task-001", "https://api.example.com");
      expect(info.providerName).toBeUndefined();
      expect(info.model).toBeUndefined();
      expect(info.apiUrl).toBe("https://api.example.com");
      expect(info.queryEndpoint).toBeUndefined();
      expect(info.howToCheck).toBe("请联系服务商获取任务状态查询方式");
      expect(info.apiDocUrl).toBeUndefined();
    });

    it("未知 providerId 应使用默认 howToCheck", () => {
      const info = buildTrackingInfo("task-002", undefined, "nonexistent");
      expect(info.providerName).toBeUndefined();
      expect(info.howToCheck).toBe("请联系服务商获取任务状态查询方式");
    });

    it("所有参数为空时仍应返回有效结构", () => {
      const info = buildTrackingInfo("task-003");
      expect(info.providerName).toBeUndefined();
      expect(info.model).toBeUndefined();
      expect(info.apiUrl).toBeUndefined();
      expect(info.queryEndpoint).toBeUndefined();
      expect(info.howToCheck).toBe("请联系服务商获取任务状态查询方式");
      expect(info.apiDocUrl).toBeUndefined();
    });
  });

  describe("copyTrackingInfoToClipboard", () => {
    beforeEach(() => {
      vi.stubGlobal("navigator", {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });
    });

    it("成功复制时应返回 ok: true", async () => {
      const info: TrackingInfo = {
        providerName: "可灵 (Kling)",
        model: "v1",
        apiUrl: "https://api.example.com",
        queryEndpoint: "https://platform.klingai.com/task?taskId=123",
        howToCheck: "1. 登录可灵平台",
        apiDocUrl: "https://docs.example.com",
      };

      const result = await copyTrackingInfoToClipboard(info);
      expect(result.ok).toBe(true);

      expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
      const text = vi.mocked(navigator.clipboard.writeText).mock.calls[0]![0];
      expect(text).toContain("可灵 (Kling)");
      expect(text).toContain("v1");
      expect(text).toContain("https://api.example.com");
      expect(text).toContain("https://platform.klingai.com/task?taskId=123");
      expect(text).toContain("1. 登录可灵平台");
      expect(text).toContain("https://docs.example.com");
    });

    it("缺少可选字段时应使用默认值", async () => {
      const info: TrackingInfo = {
        howToCheck: "联系服务商",
      };

      const result = await copyTrackingInfoToClipboard(info);
      expect(result.ok).toBe(true);

      const text = vi.mocked(navigator.clipboard.writeText).mock.calls[0]![0];
      expect(text).toContain("服务商: 未知");
      expect(text).toContain("模型: 未知");
      expect(text).toContain("API地址: 未记录");
      expect(text).toContain("查询端点: 未记录");
      expect(text).not.toContain("API文档");
    });

    it("clipboard 失败时应返回 ok: false", async () => {
      vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("Permission denied"));

      const info: TrackingInfo = {
        howToCheck: "联系服务商",
      };

      const result = await copyTrackingInfoToClipboard(info);
      expect(result.ok).toBe(false);
    });
  });

  describe("openTaskQueryLink", () => {
    let windowOpenSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      windowOpenSpy = vi.spyOn(window, "open").mockReturnValue(null);
    });

    it("有 queryEndpoint 时应打开查询链接", () => {
      const info: TrackingInfo = {
        queryEndpoint: "https://platform.klingai.com/task?taskId=123",
        howToCheck: "联系服务商",
      };

      const result = openTaskQueryLink(info);
      expect(result).toBe(true);
      expect(windowOpenSpy).toHaveBeenCalledWith(
        "https://platform.klingai.com/task?taskId=123",
        "_blank",
      );
    });

    it("无 queryEndpoint 但有 apiDocUrl 时应打开文档链接", () => {
      const info: TrackingInfo = {
        howToCheck: "联系服务商",
        apiDocUrl: "https://docs.example.com",
      };

      const result = openTaskQueryLink(info);
      expect(result).toBe(true);
      expect(windowOpenSpy).toHaveBeenCalledWith("https://docs.example.com", "_blank");
    });

    it("有 queryEndpoint 时不应打开 apiDocUrl", () => {
      const info: TrackingInfo = {
        queryEndpoint: "https://platform.klingai.com/task?taskId=123",
        howToCheck: "联系服务商",
        apiDocUrl: "https://docs.example.com",
      };

      openTaskQueryLink(info);
      expect(windowOpenSpy).toHaveBeenCalledOnce();
      expect(windowOpenSpy).toHaveBeenCalledWith(
        "https://platform.klingai.com/task?taskId=123",
        "_blank",
      );
    });

    it("无 queryEndpoint 和 apiDocUrl 时应返回 false", () => {
      const info: TrackingInfo = {
        howToCheck: "联系服务商",
      };

      const result = openTaskQueryLink(info);
      expect(result).toBe(false);
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });
  });
});
