import { describe, it, expect, vi } from "vitest";

const { mockResolveMediaUrl, mockResolveImageUrl } = vi.hoisted(() => ({
  mockResolveMediaUrl: vi.fn(),
  mockResolveImageUrl: vi.fn(),
}));

vi.mock("../image-url", () => ({
  resolveMediaUrl: mockResolveMediaUrl,
  resolveImageUrl: mockResolveImageUrl,
}));

import {
  createVideoErrorHandler,
  createSimpleVideoErrorHandler,
  createImageUrlErrorHandler,
} from "../media-error-handler";

function createMockVideoElement(src: string) {
  const el = {
    src,
    dataset: {} as Record<string, string>,
  } as unknown as HTMLVideoElement;
  return el;
}

function createMockImageElement(src: string) {
  const el = {
    src,
    dataset: {} as Record<string, string>,
  } as unknown as HTMLImageElement;
  return el;
}

function createSyntheticEvent<T extends HTMLElement>(target: T) {
  return { currentTarget: target } as React.SyntheticEvent<T>;
}

describe("media-error-handler", () => {
  describe("createVideoErrorHandler", () => {
    it("should set data-retried flag on first error", () => {
      const handler = createVideoErrorHandler();
      const el = createMockVideoElement("http://example.com/video.mp4");
      mockResolveMediaUrl.mockReturnValue(undefined);

      handler(createSyntheticEvent(el));

      expect(el.dataset.retried).toBe("1");
    });

    it("should not set fallback src when data-retried already set (R7 guard)", () => {
      const handler = createVideoErrorHandler(null, "http://fallback.com/video.mp4");
      const el = createMockVideoElement("http://example.com/video.mp4");
      el.dataset.retried = "1";
      mockResolveMediaUrl.mockReturnValue("http://fallback.com/video.mp4");

      handler(createSyntheticEvent(el));

      expect(el.src).toBe("http://example.com/video.mp4");
    });

    it("should set fallback src when resolveMediaUrl returns a different URL", () => {
      const handler = createVideoErrorHandler("/local/video.mp4", "http://remote/video.mp4");
      const el = createMockVideoElement("http://example.com/video.mp4");
      mockResolveMediaUrl.mockReturnValue("http://remote/video.mp4");

      handler(createSyntheticEvent(el));

      expect(el.src).toBe("http://remote/video.mp4");
    });

    it("should not set fallback src when resolveMediaUrl returns the same URL as current src", () => {
      const handler = createVideoErrorHandler(null, "http://example.com/video.mp4");
      const el = createMockVideoElement("http://example.com/video.mp4");
      mockResolveMediaUrl.mockReturnValue("http://example.com/video.mp4");

      handler(createSyntheticEvent(el));

      expect(el.src).toBe("http://example.com/video.mp4");
    });

    it("should not set fallback src when resolveMediaUrl returns undefined", () => {
      const handler = createVideoErrorHandler(null, null);
      const el = createMockVideoElement("http://example.com/video.mp4");
      mockResolveMediaUrl.mockReturnValue(undefined);

      handler(createSyntheticEvent(el));

      expect(el.src).toBe("http://example.com/video.mp4");
    });

    it("should pass fallbackLocalPath and fallbackRemoteUrl to resolveMediaUrl", () => {
      const handler = createVideoErrorHandler("/local/path.mp4", "http://remote/video.mp4");
      const el = createMockVideoElement("http://example.com/video.mp4");
      mockResolveMediaUrl.mockReturnValue(undefined);

      handler(createSyntheticEvent(el));

      expect(mockResolveMediaUrl).toHaveBeenCalledWith("/local/path.mp4", "http://remote/video.mp4");
    });

    it("should prevent infinite retry loop when fallback also fails (R7)", () => {
      const handler = createVideoErrorHandler(null, "http://fallback.com/video.mp4");
      const el = createMockVideoElement("http://example.com/video.mp4");
      mockResolveMediaUrl.mockReturnValue("http://fallback.com/video.mp4");

      handler(createSyntheticEvent(el));
      expect(el.src).toBe("http://fallback.com/video.mp4");

      mockResolveMediaUrl.mockClear();
      handler(createSyntheticEvent(el));
      expect(mockResolveMediaUrl).not.toHaveBeenCalled();
    });
  });

  describe("createSimpleVideoErrorHandler", () => {
    it("should set data-retried flag on first error", () => {
      const handler = createSimpleVideoErrorHandler();
      const el = createMockVideoElement("http://example.com/video.mp4");

      handler(createSyntheticEvent(el));

      expect(el.dataset.retried).toBe("1");
    });

    it("should not modify src", () => {
      const handler = createSimpleVideoErrorHandler();
      const el = createMockVideoElement("http://example.com/video.mp4");

      handler(createSyntheticEvent(el));

      expect(el.src).toBe("http://example.com/video.mp4");
    });

    it("should do nothing when data-retried already set", () => {
      const handler = createSimpleVideoErrorHandler();
      const el = createMockVideoElement("http://example.com/video.mp4");
      el.dataset.retried = "1";

      handler(createSyntheticEvent(el));

      expect(el.dataset.retried).toBe("1");
    });
  });

  describe("createImageUrlErrorHandler", () => {
    it("should set data-retried flag on first error", () => {
      const handler = createImageUrlErrorHandler();
      const el = createMockImageElement("http://example.com/image.png");
      mockResolveImageUrl.mockReturnValue(undefined);

      handler(createSyntheticEvent(el));

      expect(el.dataset.retried).toBe("1");
    });

    it("should set fallback src when resolveImageUrl returns a different URL", () => {
      const handler = createImageUrlErrorHandler("http://fallback.com/image.png");
      const el = createMockImageElement("http://example.com/image.png");
      mockResolveImageUrl.mockReturnValue("http://fallback.com/image.png");

      handler(createSyntheticEvent(el));

      expect(el.src).toBe("http://fallback.com/image.png");
    });

    it("should not set fallback src when resolveImageUrl returns the same URL as current src", () => {
      const handler = createImageUrlErrorHandler("http://example.com/image.png");
      const el = createMockImageElement("http://example.com/image.png");
      mockResolveImageUrl.mockReturnValue("http://example.com/image.png");

      handler(createSyntheticEvent(el));

      expect(el.src).toBe("http://example.com/image.png");
    });

    it("should not set fallback src when no fallbackUrl provided", () => {
      const handler = createImageUrlErrorHandler();
      const el = createMockImageElement("http://example.com/image.png");

      handler(createSyntheticEvent(el));

      expect(el.src).toBe("http://example.com/image.png");
      expect(mockResolveImageUrl).not.toHaveBeenCalled();
    });

    it("should not set fallback src when fallbackUrl is null", () => {
      const handler = createImageUrlErrorHandler(null);
      const el = createMockImageElement("http://example.com/image.png");

      handler(createSyntheticEvent(el));

      expect(el.src).toBe("http://example.com/image.png");
      expect(mockResolveImageUrl).not.toHaveBeenCalled();
    });

    it("should not set fallback when data-retried already set (R7 guard)", () => {
      const handler = createImageUrlErrorHandler("http://fallback.com/image.png");
      const el = createMockImageElement("http://example.com/image.png");
      el.dataset.retried = "1";
      mockResolveImageUrl.mockReturnValue("http://fallback.com/image.png");

      handler(createSyntheticEvent(el));

      expect(el.src).toBe("http://example.com/image.png");
    });

    it("should not set fallback src when resolveImageUrl returns undefined", () => {
      const handler = createImageUrlErrorHandler("invalid-url");
      const el = createMockImageElement("http://example.com/image.png");
      mockResolveImageUrl.mockReturnValue(undefined);

      handler(createSyntheticEvent(el));

      expect(el.src).toBe("http://example.com/image.png");
    });
  });
});
