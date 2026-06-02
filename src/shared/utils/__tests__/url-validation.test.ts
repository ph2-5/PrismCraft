import { describe, it, expect } from "vitest";
import {
  validateExternalUrl,
  isAllowedImageUrl,
  isAllowedVideoUrl,
} from "../url-validation";

describe("url-validation", () => {
  describe("validateExternalUrl", () => {
    it("should reject empty string", () => {
      const result = validateExternalUrl("");
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("should accept data: protocol", () => {
      const result = validateExternalUrl("data:image/png;base64,abc123");
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should accept blob: protocol", () => {
      const result = validateExternalUrl("blob:http://localhost/uuid-1234");
      expect(result.valid).toBe(true);
    });

    it("should accept file: protocol", () => {
      const result = validateExternalUrl("file:///C:/Users/video.mp4");
      expect(result.valid).toBe(true);
    });

    it("should accept http: protocol", () => {
      const result = validateExternalUrl("http://example.com/video.mp4");
      expect(result.valid).toBe(true);
    });

    it("should accept https: protocol", () => {
      const result = validateExternalUrl("https://example.com/video.mp4");
      expect(result.valid).toBe(true);
    });

    it("should reject javascript: protocol", () => {
      const result = validateExternalUrl("javascript:alert(1)");
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("should reject vbscript: protocol", () => {
      const result = validateExternalUrl("vbscript:MsgBox(1)");
      expect(result.valid).toBe(false);
    });

    it("should reject ftp: protocol", () => {
      const result = validateExternalUrl("ftp://files.example.com/video.mp4");
      expect(result.valid).toBe(false);
    });

    it("should reject protocol-less string", () => {
      const result = validateExternalUrl("example.com/video.mp4");
      expect(result.valid).toBe(false);
    });

    it("should reject mailto: protocol", () => {
      const result = validateExternalUrl("mailto:test@example.com");
      expect(result.valid).toBe(false);
    });

    it("should reject tel: protocol", () => {
      const result = validateExternalUrl("tel:+1234567890");
      expect(result.valid).toBe(false);
    });

    it("should include reason for empty URL", () => {
      const result = validateExternalUrl("");
      expect(result.reason).toContain("空");
    });

    it("should include reason for unsupported protocol", () => {
      const result = validateExternalUrl("ftp://example.com");
      expect(result.reason).toContain("协议");
    });
  });

  describe("isAllowedImageUrl", () => {
    it("should return false for empty string", () => {
      expect(isAllowedImageUrl("")).toBe(false);
    });

    it("should return true for data: URLs", () => {
      expect(isAllowedImageUrl("data:image/png;base64,abc")).toBe(true);
    });

    it("should return true for blob: URLs", () => {
      expect(isAllowedImageUrl("blob:http://localhost/uuid")).toBe(true);
    });

    it("should return true for file: URLs", () => {
      expect(isAllowedImageUrl("file:///C:/image.png")).toBe(true);
    });

    it("should return true for http: URLs", () => {
      expect(isAllowedImageUrl("http://example.com/image.png")).toBe(true);
    });

    it("should return true for https: URLs", () => {
      expect(isAllowedImageUrl("https://example.com/image.png")).toBe(true);
    });

    it("should return false for javascript: URLs", () => {
      expect(isAllowedImageUrl("javascript:alert(1)")).toBe(false);
    });

    it("should return false for ftp: URLs", () => {
      expect(isAllowedImageUrl("ftp://example.com/image.png")).toBe(false);
    });

    it("should return false for protocol-less string", () => {
      expect(isAllowedImageUrl("example.com/image.png")).toBe(false);
    });
  });

  describe("isAllowedVideoUrl", () => {
    it("should return false for empty string", () => {
      expect(isAllowedVideoUrl("")).toBe(false);
    });

    it("should return true for data: URLs", () => {
      expect(isAllowedVideoUrl("data:video/mp4;base64,abc")).toBe(true);
    });

    it("should return true for blob: URLs", () => {
      expect(isAllowedVideoUrl("blob:http://localhost/uuid")).toBe(true);
    });

    it("should return true for file: URLs", () => {
      expect(isAllowedVideoUrl("file:///C:/video.mp4")).toBe(true);
    });

    it("should return true for http: URLs", () => {
      expect(isAllowedVideoUrl("http://example.com/video.mp4")).toBe(true);
    });

    it("should return true for https: URLs", () => {
      expect(isAllowedVideoUrl("https://example.com/video.mp4")).toBe(true);
    });

    it("should return false for javascript: URLs", () => {
      expect(isAllowedVideoUrl("javascript:alert(1)")).toBe(false);
    });

    it("should return false for ftp: URLs", () => {
      expect(isAllowedVideoUrl("ftp://example.com/video.mp4")).toBe(false);
    });

    it("should return false for protocol-less string", () => {
      expect(isAllowedVideoUrl("example.com/video.mp4")).toBe(false);
    });
  });

  describe("consistency between functions", () => {
    const allowedUrls = [
      "data:image/png;base64,abc",
      "blob:http://localhost/uuid",
      "file:///C:/image.png",
      "http://example.com/image.png",
      "https://example.com/video.mp4",
    ];

    const disallowedUrls = [
      "javascript:alert(1)",
      "vbscript:MsgBox(1)",
      "ftp://example.com/file",
      "mailto:test@example.com",
      "tel:+1234567890",
      "",
      "example.com/file",
    ];

    it("isAllowedImageUrl and isAllowedVideoUrl should agree on allowed URLs", () => {
      for (const url of allowedUrls) {
        expect(isAllowedImageUrl(url)).toBe(isAllowedVideoUrl(url));
      }
    });

    it("isAllowedImageUrl and isAllowedVideoUrl should agree on disallowed URLs", () => {
      for (const url of disallowedUrls) {
        expect(isAllowedImageUrl(url)).toBe(isAllowedVideoUrl(url));
      }
    });

    it("validateExternalUrl should agree with isAllowedImageUrl on allowed URLs", () => {
      for (const url of allowedUrls) {
        expect(validateExternalUrl(url).valid).toBe(isAllowedImageUrl(url));
      }
    });

    it("validateExternalUrl should agree with isAllowedImageUrl on disallowed URLs", () => {
      for (const url of disallowedUrls) {
        expect(validateExternalUrl(url).valid).toBe(isAllowedImageUrl(url));
      }
    });
  });
});
