import { describe, it, expect } from "vitest";
import {
  resolveImageUrl,
  resolveMediaUrl,
  isLocalAssetUrl,
  isRemoteUrl,
} from "../image-url";

describe("image-url", () => {
  describe("resolveImageUrl", () => {
    it("should return undefined for null", () => {
      expect(resolveImageUrl(null)).toBeUndefined();
    });

    it("should return undefined for undefined", () => {
      expect(resolveImageUrl(undefined)).toBeUndefined();
    });

    it("should return undefined for empty string", () => {
      expect(resolveImageUrl("")).toBeUndefined();
    });

    it("should pass through data: URLs", () => {
      const url = "data:image/png;base64,iVBORw0KGgo=";
      expect(resolveImageUrl(url)).toBe(url);
    });

    it("should pass through http:// URLs", () => {
      const url = "http://example.com/image.png";
      expect(resolveImageUrl(url)).toBe(url);
    });

    it("should pass through https:// URLs", () => {
      const url = "https://example.com/image.png";
      expect(resolveImageUrl(url)).toBe(url);
    });

    it("should pass through file:// URLs", () => {
      const url = "file:///home/user/image.png";
      expect(resolveImageUrl(url)).toBe(url);
    });

    it("should pass through vcache:// URLs", () => {
      const url = "vcache://abc123";
      expect(resolveImageUrl(url)).toBe(url);
    });

    it("should pass through icache:// URLs", () => {
      const url = "icache://def456";
      expect(resolveImageUrl(url)).toBe(url);
    });

    it("should pass through /api/ URLs", () => {
      const url = "/api/images/123";
      expect(resolveImageUrl(url)).toBe(url);
    });

    it("should convert Windows absolute path to file:// URL", () => {
      expect(resolveImageUrl("C:\\Users\\test\\image.png")).toBe(
        "file://C:/Users/test/image.png",
      );
    });

    it("should convert Unix absolute path to file:// URL", () => {
      expect(resolveImageUrl("/home/user/image.png")).toBe(
        "file:///home/user/image.png",
      );
    });

    it("should normalize backslashes in Windows paths", () => {
      expect(resolveImageUrl("D:\\Projects\\assets\\img.png")).toBe(
        "file://D:/Projects/assets/img.png",
      );
    });

    it("should pass through relative paths without scheme", () => {
      expect(resolveImageUrl("images/photo.jpg")).toBe("images/photo.jpg");
    });

    it("should pass through relative path with dot prefix", () => {
      expect(resolveImageUrl("./assets/img.png")).toBe("./assets/img.png");
    });

    it("should pass through relative path with parent reference", () => {
      expect(resolveImageUrl("../images/photo.jpg")).toBe(
        "../images/photo.jpg",
      );
    });

    it("should handle Windows path with multiple backslashes", () => {
      expect(resolveImageUrl("E:\\a\\b\\c\\d.png")).toBe(
        "file://E:/a/b/c/d.png",
      );
    });
  });

  describe("resolveMediaUrl", () => {
    it("should prefer local path over remote URL", () => {
      expect(resolveMediaUrl("C:\\local\\video.mp4", "https://cdn.example.com/video.mp4")).toBe(
        "file://C:/local/video.mp4",
      );
    });

    it("should return remote URL when local path is undefined", () => {
      expect(resolveMediaUrl(undefined, "https://cdn.example.com/video.mp4")).toBe(
        "https://cdn.example.com/video.mp4",
      );
    });

    it("should return remote URL when local path is null", () => {
      expect(resolveMediaUrl(null, "https://cdn.example.com/video.mp4")).toBe(
        "https://cdn.example.com/video.mp4",
      );
    });

    it("should return remote URL when local path is empty string", () => {
      expect(resolveMediaUrl("", "https://cdn.example.com/video.mp4")).toBe(
        "https://cdn.example.com/video.mp4",
      );
    });

    it("should return undefined when both are null", () => {
      expect(resolveMediaUrl(null, null)).toBeUndefined();
    });

    it("should return undefined when both are undefined", () => {
      expect(resolveMediaUrl(undefined, undefined)).toBeUndefined();
    });

    it("should return undefined when both are empty", () => {
      expect(resolveMediaUrl("", "")).toBeUndefined();
    });

    it("should use local file:// URL when available", () => {
      expect(resolveMediaUrl("file:///local/video.mp4", "https://cdn.example.com/video.mp4")).toBe(
        "file:///local/video.mp4",
      );
    });

    it("should use local vcache:// URL when available", () => {
      expect(resolveMediaUrl("vcache://abc", "https://cdn.example.com/video.mp4")).toBe(
        "vcache://abc",
      );
    });
  });

  describe("isLocalAssetUrl", () => {
    it("should return true for file:// URLs", () => {
      expect(isLocalAssetUrl("file:///home/user/image.png")).toBe(true);
    });

    it("should return true for vcache:// URLs", () => {
      expect(isLocalAssetUrl("vcache://abc123")).toBe(true);
    });

    it("should return true for icache:// URLs", () => {
      expect(isLocalAssetUrl("icache://def456")).toBe(true);
    });

    it("should return true for data: URLs", () => {
      expect(isLocalAssetUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    });

    it("should return false for http:// URLs", () => {
      expect(isLocalAssetUrl("http://example.com/image.png")).toBe(false);
    });

    it("should return false for https:// URLs", () => {
      expect(isLocalAssetUrl("https://example.com/image.png")).toBe(false);
    });

    it("should return false for relative paths", () => {
      expect(isLocalAssetUrl("images/photo.jpg")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isLocalAssetUrl("")).toBe(false);
    });
  });

  describe("isRemoteUrl", () => {
    it("should return true for http:// URLs", () => {
      expect(isRemoteUrl("http://example.com/image.png")).toBe(true);
    });

    it("should return true for https:// URLs", () => {
      expect(isRemoteUrl("https://example.com/image.png")).toBe(true);
    });

    it("should return false for file:// URLs", () => {
      expect(isRemoteUrl("file:///home/user/image.png")).toBe(false);
    });

    it("should return false for data: URLs", () => {
      expect(isRemoteUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(false);
    });

    it("should return false for vcache:// URLs", () => {
      expect(isRemoteUrl("vcache://abc123")).toBe(false);
    });

    it("should return false for relative paths", () => {
      expect(isRemoteUrl("images/photo.jpg")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isRemoteUrl("")).toBe(false);
    });
  });
});
