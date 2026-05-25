import { describe, it, expect, vi, beforeEach } from "vitest";
import { SsrfGuard } from "../ssrf-guard";

describe("SsrfGuard", () => {
  let guard: SsrfGuard;

  beforeEach(() => {
    guard = new SsrfGuard();
  });

  describe("validateSync - 公网 URL 放行", () => {
    it("应放行 https 公网 URL", () => {
      const result = guard.validateSync("https://api.openai.com/v1/chat/completions");
      expect(result.safe).toBe(true);
    });

    it("应放行 http 公网 URL", () => {
      const result = guard.validateSync("http://example.com/path");
      expect(result.safe).toBe(true);
    });
  });

  describe("validateSync - 私有 IP 拦截", () => {
    it("应拦截 127.0.0.1", () => {
      const result = guard.validateSync("http://127.0.0.1/admin");
      expect(result.safe).toBe(false);
    });

    it("应拦截 10.x.x.x", () => {
      const result = guard.validateSync("http://10.0.0.1/admin");
      expect(result.safe).toBe(false);
    });

    it("应拦截 172.16.x.x", () => {
      const result = guard.validateSync("http://172.16.0.1/admin");
      expect(result.safe).toBe(false);
    });

    it("应拦截 172.31.x.x", () => {
      const result = guard.validateSync("http://172.31.255.1/admin");
      expect(result.safe).toBe(false);
    });

    it("应放行 172.15.x.x（不在私有范围）", () => {
      const result = guard.validateSync("http://172.15.0.1/path");
      expect(result.safe).toBe(true);
    });

    it("应放行 172.32.x.x（不在私有范围）", () => {
      const result = guard.validateSync("http://172.32.0.1/path");
      expect(result.safe).toBe(true);
    });

    it("应拦截 192.168.x.x", () => {
      const result = guard.validateSync("http://192.168.1.1/admin");
      expect(result.safe).toBe(false);
    });

    it("应拦截 0.x.x.x", () => {
      const result = guard.validateSync("http://0.0.0.0/admin");
      expect(result.safe).toBe(false);
    });

    it("应拦截 localhost", () => {
      const result = guard.validateSync("http://localhost/admin");
      expect(result.safe).toBe(false);
    });
  });

  describe("validateSync - 云元数据端点拦截", () => {
    it("应拦截 AWS 元数据端点 169.254.169.254", () => {
      const result = guard.validateSync("http://169.254.169.254/latest/meta-data/");
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("metadata");
    });

    it("应拦截 GCP 元数据端点 metadata.google.internal", () => {
      const result = guard.validateSync("http://metadata.google.internal/");
      expect(result.safe).toBe(false);
    });

    it("应拦截 metadata.goog", () => {
      const result = guard.validateSync("http://metadata.goog/");
      expect(result.safe).toBe(false);
    });

    it("blockMetadataEndpoints=false 时应放行元数据端点", () => {
      const g = new SsrfGuard({ blockMetadataEndpoints: false });
      const result = g.validateSync("http://169.254.169.254/latest/meta-data/");
      expect(result.safe).toBe(true);
    });
  });

  describe("validateSync - 非 HTTP 协议拦截", () => {
    it("应拦截 file:// 协议", () => {
      const result = guard.validateSync("file:///etc/passwd");
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("protocol");
    });

    it("应拦截 ftp:// 协议", () => {
      const result = guard.validateSync("ftp://internal.server/data");
      expect(result.safe).toBe(false);
    });

    it("应拦截 javascript: 协议", () => {
      const result = guard.validateSync("javascript:alert(1)");
      expect(result.safe).toBe(false);
    });
  });

  describe("validateSync - 无效 URL 拦截", () => {
    it("应拦截空字符串", () => {
      const result = guard.validateSync("");
      expect(result.safe).toBe(false);
    });

    it("应拦截非 URL 字符串", () => {
      const result = guard.validateSync("not-a-url");
      expect(result.safe).toBe(false);
    });
  });

  describe("白名单机制", () => {
    it("白名单中的主机名应放行", () => {
      const g = new SsrfGuard({ customWhitelist: ["api.openai.com"] });
      const result = g.validateSync("https://api.openai.com/v1/chat/completions");
      expect(result.safe).toBe(true);
    });

    it("白名单中的 IP 应放行", () => {
      const g = new SsrfGuard({ customWhitelist: ["10.0.0.1"] });
      const result = g.validateSync("http://10.0.0.1/internal-api");
      expect(result.safe).toBe(true);
    });

    it("addWhitelist 应动态添加白名单", () => {
      guard.addWhitelist("192.168.1.1");
      const result = guard.validateSync("http://192.168.1.1/api");
      expect(result.safe).toBe(true);
    });

    it("removeWhitelist 应移除白名单", () => {
      const g = new SsrfGuard({ customWhitelist: ["10.0.0.1"] });
      g.removeWhitelist("10.0.0.1");
      const result = g.validateSync("http://10.0.0.1/api");
      expect(result.safe).toBe(false);
    });
  });

  describe("isPrivateIp", () => {
    it("应识别 IPv4 私有地址", () => {
      expect(guard.isPrivateIp("127.0.0.1")).toBe(true);
      expect(guard.isPrivateIp("10.0.0.1")).toBe(true);
      expect(guard.isPrivateIp("172.16.0.1")).toBe(true);
      expect(guard.isPrivateIp("192.168.1.1")).toBe(true);
    });

    it("应识别 IPv4 公网地址", () => {
      expect(guard.isPrivateIp("8.8.8.8")).toBe(false);
      expect(guard.isPrivateIp("1.1.1.1")).toBe(false);
      expect(guard.isPrivateIp("203.0.113.1")).toBe(false);
    });

    it("应识别 IPv6 loopback", () => {
      expect(guard.isPrivateIp("::1")).toBe(true);
    });

    it("应识别 IPv6 link-local", () => {
      expect(guard.isPrivateIp("fe80::1")).toBe(true);
    });

    it("应识别 IPv6 unique local", () => {
      expect(guard.isPrivateIp("fc00::1")).toBe(true);
      expect(guard.isPrivateIp("fd00::1")).toBe(true);
    });

    it("应识别 IPv6 公网地址", () => {
      expect(guard.isPrivateIp("2001:4860:4860::8888")).toBe(false);
    });
  });

  describe("dnsFailurePolicy", () => {
    it("dnsFailurePolicy=allow 时 DNS 失败应放行", async () => {
      const g = new SsrfGuard({
        enableDnsResolution: true,
        dnsFailurePolicy: "allow",
      });
      const result = await g.validate("https://nonexistent-domain-xyz123.com/api");
      expect(result.safe).toBe(true);
    });

    it("dnsFailurePolicy=deny 时 DNS 失败应拦截", async () => {
      const g = new SsrfGuard({
        enableDnsResolution: true,
        dnsFailurePolicy: "deny",
      });
      const result = await g.validate("https://nonexistent-domain-xyz123.com/api");
      expect(result.safe).toBe(false);
    });
  });
});
