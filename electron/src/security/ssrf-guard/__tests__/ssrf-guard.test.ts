import { describe, it, expect, beforeEach } from "vitest";
import { SsrfGuard } from "../ssrf-guard";

describe("SsrfGuard", () => {
  let guard: SsrfGuard;

  beforeEach(() => {
    guard = new SsrfGuard({
      enableDnsResolution: false,
      blockMetadataEndpoints: true,
    });
  });

  describe("validateSync", () => {
    it("should allow public HTTPS URLs", () => {
      const result = guard.validateSync("https://api.openai.com/v1/chat/completions");
      expect(result.safe).toBe(true);
    });

    it("should allow public HTTP URLs", () => {
      const result = guard.validateSync("http://example.com/api");
      expect(result.safe).toBe(true);
    });

    it("should block localhost", () => {
      const result = guard.validateSync("http://localhost:3000/api");
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("Private");
    });

    it("should block 127.0.0.1", () => {
      const result = guard.validateSync("http://127.0.0.1:3000/api");
      expect(result.safe).toBe(false);
    });

    it("should block 10.x.x.x", () => {
      const result = guard.validateSync("http://10.0.0.1/api");
      expect(result.safe).toBe(false);
    });

    it("should block 192.168.x.x", () => {
      const result = guard.validateSync("http://192.168.1.1/api");
      expect(result.safe).toBe(false);
    });

    it("should block 172.16-31.x.x", () => {
      expect(guard.validateSync("http://172.16.0.1/api").safe).toBe(false);
      expect(guard.validateSync("http://172.31.255.255/api").safe).toBe(false);
      expect(guard.validateSync("http://172.15.0.1/api").safe).toBe(true);
      expect(guard.validateSync("http://172.32.0.1/api").safe).toBe(true);
    });

    it("should block cloud metadata endpoints", () => {
      expect(guard.validateSync("http://169.254.169.254/latest/meta-data/").safe).toBe(false);
      expect(guard.validateSync("http://metadata.google.internal/computeMetadata/v1/").safe).toBe(false);
    });

    it("should block non-http protocols", () => {
      expect(guard.validateSync("ftp://example.com/file").safe).toBe(false);
      expect(guard.validateSync("file:///etc/passwd").safe).toBe(false);
      expect(guard.validateSync("data:text/html,<script>").safe).toBe(false);
    });

    it("should reject invalid URLs", () => {
      const result = guard.validateSync("not-a-url");
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("Invalid");
    });

    it("should respect custom whitelist", () => {
      guard.addWhitelist("my-internal-server.company.net");
      const result = guard.validateSync("http://my-internal-server.company.net/api");
      expect(result.safe).toBe(true);
    });

    it("should remove whitelist entries", () => {
      guard.addWhitelist("my-internal-server.company.net");
      expect(guard.validateSync("http://my-internal-server.company.net/api").safe).toBe(true);

      guard.removeWhitelist("my-internal-server.company.net");
      const result = guard.validateSync("http://my-internal-server.company.net/api");
      expect(result.safe).toBe(true);
    });

    it("should allow whitelisting private IPs that would otherwise be blocked", () => {
      guard.addWhitelist("192.168.1.100");
      const result = guard.validateSync("http://192.168.1.100/api");
      expect(result.safe).toBe(true);
    });

    it("should block previously whitelisted private IP after whitelist removal", () => {
      guard.addWhitelist("192.168.1.100");
      expect(guard.validateSync("http://192.168.1.100/api").safe).toBe(true);

      guard.removeWhitelist("192.168.1.100");
      expect(guard.validateSync("http://192.168.1.100/api").safe).toBe(false);
    });
  });

  describe("isPrivateIp", () => {
    it("should detect IPv4 private addresses", () => {
      expect(guard.isPrivateIp("127.0.0.1")).toBe(true);
      expect(guard.isPrivateIp("10.0.0.1")).toBe(true);
      expect(guard.isPrivateIp("192.168.1.1")).toBe(true);
      expect(guard.isPrivateIp("172.16.0.1")).toBe(true);
    });

    it("should allow public IPv4 addresses", () => {
      expect(guard.isPrivateIp("8.8.8.8")).toBe(false);
      expect(guard.isPrivateIp("1.1.1.1")).toBe(false);
      expect(guard.isPrivateIp("203.0.113.1")).toBe(false);
    });

    it("should detect IPv6 loopback", () => {
      expect(guard.isPrivateIp("::1")).toBe(true);
    });

    it("should detect IPv6 unique local", () => {
      expect(guard.isPrivateIp("fc00::1")).toBe(true);
      expect(guard.isPrivateIp("fd00::1")).toBe(true);
    });

    it("should allow public IPv6 addresses", () => {
      expect(guard.isPrivateIp("2001:4860:4860::8888")).toBe(false);
    });

    it("should return false for non-IP strings", () => {
      expect(guard.isPrivateIp("example.com")).toBe(false);
      expect(guard.isPrivateIp("")).toBe(false);
    });
  });

  describe("validate (async with DNS)", () => {
    it("should allow URLs when DNS resolution is disabled", async () => {
      const asyncGuard = new SsrfGuard({
        enableDnsResolution: false,
      });
      const result = await asyncGuard.validate("https://api.openai.com/v1/chat/completions");
      expect(result.safe).toBe(true);
    });

    it("should block private IPs even with DNS disabled", async () => {
      const asyncGuard = new SsrfGuard({
        enableDnsResolution: false,
      });
      const result = await asyncGuard.validate("http://192.168.1.1/api");
      expect(result.safe).toBe(false);
    });

    it("should block localhost even with DNS disabled", async () => {
      const asyncGuard = new SsrfGuard({
        enableDnsResolution: false,
      });
      const result = await asyncGuard.validate("http://localhost:3000/api");
      expect(result.safe).toBe(false);
    });
  });

  describe("constructor config", () => {
    it("should accept customWhitelist in constructor", () => {
      const customGuard = new SsrfGuard({
        enableDnsResolution: false,
        customWhitelist: ["trusted-server.example.com"],
      });
      const result = customGuard.validateSync("http://trusted-server.example.com/api");
      expect(result.safe).toBe(true);
    });

    it("should allow metadata hostname when blockMetadataEndpoints is false", () => {
      const permissiveGuard = new SsrfGuard({
        enableDnsResolution: false,
        blockMetadataEndpoints: false,
      });
      const result = permissiveGuard.validateSync("http://metadata.google.internal/computeMetadata/v1/");
      expect(result.safe).toBe(true);
    });
  });
});
