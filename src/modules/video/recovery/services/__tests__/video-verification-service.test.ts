import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  verifyVideoUrl,
  verifyMultipleVideos,
} from "@/modules/video";

vi.mock("@/shared/error-logger", () => ({
  extractErrorMessage: vi.fn((e: unknown) =>
    e instanceof Error ? e.message : String(e)
  ),
}));

function createMockResponse(options: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  contentLength?: number | null;
  body?: ArrayBuffer;
}) {
  const headers = new Map<string, string>();
  if (options.contentType) headers.set("content-type", options.contentType);
  if (options.contentLength != null) headers.set("content-length", String(options.contentLength));

  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: {
      get: (name: string) => headers.get(name) ?? null,
    },
    arrayBuffer: vi.fn().mockResolvedValue(options.body ?? new ArrayBuffer(0)),
  };
}

describe("video-verification-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("verifyVideoUrl", () => {
    it("should return invalid when HEAD request fails", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse({ ok: false, status: 404 }) as unknown as Response
      );

      const result = await verifyVideoUrl("https://example.com/notfound.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.reason).toContain("404");
        expect(result.value.confidence).toBe("high");
      }
    });

    it("should return invalid when content type is not video", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "HEAD") {
            return Promise.resolve(
              createMockResponse({
                ok: true,
                contentType: "text/html",
                contentLength: 1024,
              }) as unknown as Response
            );
          }
          return Promise.resolve(
            createMockResponse({ ok: true }) as unknown as Response
          );
        }
      );

      const result = await verifyVideoUrl("https://example.com/page.html");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.reason).toContain("text/html");
      }
    });

    it("should return invalid when file is too small", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "HEAD") {
            return Promise.resolve(
              createMockResponse({
                ok: true,
                contentType: "video/mp4",
                contentLength: 512,
              }) as unknown as Response
            );
          }
          return Promise.resolve(
            createMockResponse({ ok: true }) as unknown as Response
          );
        }
      );

      const result = await verifyVideoUrl("https://example.com/small.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.reason).toContain("过小");
      }
    });

    it("should return invalid when file is too large", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "HEAD") {
            return Promise.resolve(
              createMockResponse({
                ok: true,
                contentType: "video/mp4",
                contentLength: 600 * 1024 * 1024,
              }) as unknown as Response
            );
          }
          return Promise.resolve(
            createMockResponse({ ok: true }) as unknown as Response
          );
        }
      );

      const result = await verifyVideoUrl("https://example.com/huge.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.reason).toContain("过大");
        expect(result.value.confidence).toBe("medium");
      }
    });

    it("should return invalid when GET request fails", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "HEAD") {
            return Promise.resolve(
              createMockResponse({
                ok: true,
                contentType: "video/mp4",
              }) as unknown as Response
            );
          }
          return Promise.resolve(
            createMockResponse({ ok: false, status: 403 }) as unknown as Response
          );
        }
      );

      const result = await verifyVideoUrl("https://example.com/forbidden.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.reason).toContain("403");
      }
    });

    it("should return invalid when video header is not recognized", async () => {
      const invalidBuffer = new Uint8Array(16).fill(0xFF).buffer;
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "HEAD") {
            return Promise.resolve(
              createMockResponse({
                ok: true,
                contentType: "video/mp4",
              }) as unknown as Response
            );
          }
          return Promise.resolve(
            createMockResponse({
              ok: true,
              status: 206,
              body: invalidBuffer,
            }) as unknown as Response
          );
        }
      );

      const result = await verifyVideoUrl("https://example.com/invalid.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.reason).toContain("不是有效的视频格式");
      }
    });

    it("should return valid for MP4 with ftyp header", async () => {
      const mp4Buffer = new Uint8Array(16);
      mp4Buffer[0] = 0x00;
      mp4Buffer[1] = 0x00;
      mp4Buffer[2] = 0x00;
      mp4Buffer[3] = 0x20;
      mp4Buffer[4] = 0x66;
      mp4Buffer[5] = 0x74;
      mp4Buffer[6] = 0x79;
      mp4Buffer[7] = 0x70;

      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "HEAD") {
            return Promise.resolve(
              createMockResponse({
                ok: true,
                contentType: "video/mp4",
                contentLength: 1024 * 1024,
              }) as unknown as Response
            );
          }
          return Promise.resolve(
            createMockResponse({
              ok: true,
              status: 206,
              body: mp4Buffer.buffer,
            }) as unknown as Response
          );
        }
      );

      const result = await verifyVideoUrl("https://example.com/valid.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(true);
        expect(result.value.reason).toContain("视频验证通过");
      }
    });

    it("should return valid for WebM header", async () => {
      const webmBuffer = new Uint8Array(16);
      webmBuffer[0] = 0x1A;
      webmBuffer[1] = 0x45;
      webmBuffer[2] = 0xDF;
      webmBuffer[3] = 0xA3;

      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "HEAD") {
            return Promise.resolve(
              createMockResponse({
                ok: true,
                contentType: "video/webm",
                contentLength: 1024 * 1024,
              }) as unknown as Response
            );
          }
          return Promise.resolve(
            createMockResponse({
              ok: true,
              status: 206,
              body: webmBuffer.buffer,
            }) as unknown as Response
          );
        }
      );

      const result = await verifyVideoUrl("https://example.com/valid.webm");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(true);
      }
    });

    it("should return valid for MP4 with moov header at offset 4", async () => {
      const moovBuffer = new Uint8Array(16);
      moovBuffer[4] = 0x6D;
      moovBuffer[5] = 0x6F;
      moovBuffer[6] = 0x6F;
      moovBuffer[7] = 0x76;

      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "HEAD") {
            return Promise.resolve(
              createMockResponse({
                ok: true,
                contentType: "video/mp4",
                contentLength: 1024 * 1024,
              }) as unknown as Response
            );
          }
          return Promise.resolve(
            createMockResponse({
              ok: true,
              status: 206,
              body: moovBuffer.buffer,
            }) as unknown as Response
          );
        }
      );

      const result = await verifyVideoUrl("https://example.com/moov.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(true);
      }
    });

    it("should return valid for MP4 with mdat header at offset 4", async () => {
      const mdatBuffer = new Uint8Array(16);
      mdatBuffer[4] = 0x6D;
      mdatBuffer[5] = 0x64;
      mdatBuffer[6] = 0x61;
      mdatBuffer[7] = 0x74;

      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "HEAD") {
            return Promise.resolve(
              createMockResponse({
                ok: true,
                contentType: "video/mp4",
                contentLength: 1024 * 1024,
              }) as unknown as Response
            );
          }
          return Promise.resolve(
            createMockResponse({
              ok: true,
              status: 206,
              body: mdatBuffer.buffer,
            }) as unknown as Response
          );
        }
      );

      const result = await verifyVideoUrl("https://example.com/mdat.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(true);
      }
    });

    it("should return valid for MP4 with wide header at offset 4", async () => {
      const wideBuffer = new Uint8Array(16);
      wideBuffer[4] = 0x77;
      wideBuffer[5] = 0x69;
      wideBuffer[6] = 0x64;
      wideBuffer[7] = 0x65;

      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "HEAD") {
            return Promise.resolve(
              createMockResponse({
                ok: true,
                contentType: "video/mp4",
                contentLength: 1024 * 1024,
              }) as unknown as Response
            );
          }
          return Promise.resolve(
            createMockResponse({
              ok: true,
              status: 206,
              body: wideBuffer.buffer,
            }) as unknown as Response
          );
        }
      );

      const result = await verifyVideoUrl("https://example.com/wide.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(true);
      }
    });

    it("should return valid when bytes start with 0x00 0x00 0x00", async () => {
      const nullBuffer = new Uint8Array(16);
      nullBuffer[0] = 0x00;
      nullBuffer[1] = 0x00;
      nullBuffer[2] = 0x00;

      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "HEAD") {
            return Promise.resolve(
              createMockResponse({
                ok: true,
                contentType: "video/mp4",
                contentLength: 1024 * 1024,
              }) as unknown as Response
            );
          }
          return Promise.resolve(
            createMockResponse({
              ok: true,
              status: 206,
              body: nullBuffer.buffer,
            }) as unknown as Response
          );
        }
      );

      const result = await verifyVideoUrl("https://example.com/null.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(true);
      }
    });

    it("should return timeout on AbortError", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

      const result = await verifyVideoUrl("https://example.com/timeout.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.reason).toContain("超时");
        expect(result.value.confidence).toBe("medium");
      }
    });

    it("should return failure on general error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network failure"));

      const result = await verifyVideoUrl("https://example.com/error.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(false);
        expect(result.value.reason).toContain("Network failure");
        expect(result.value.confidence).toBe("low");
      }
    });

    it("should skip size check when content-length is not available", async () => {
      const mp4Buffer = new Uint8Array(16);
      mp4Buffer[4] = 0x66;
      mp4Buffer[5] = 0x74;
      mp4Buffer[6] = 0x79;
      mp4Buffer[7] = 0x70;

      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "HEAD") {
            return Promise.resolve(
              createMockResponse({
                ok: true,
                contentType: "video/mp4",
              }) as unknown as Response
            );
          }
          return Promise.resolve(
            createMockResponse({
              ok: true,
              status: 206,
              body: mp4Buffer.buffer,
            }) as unknown as Response
          );
        }
      );

      const result = await verifyVideoUrl("https://example.com/nosize.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isValid).toBe(true);
      }
    });
  });

  describe("verifyMultipleVideos", () => {
    it("should verify multiple videos and return map", async () => {
      const mp4Buffer = new Uint8Array(16);
      mp4Buffer[4] = 0x66;
      mp4Buffer[5] = 0x74;
      mp4Buffer[6] = 0x79;
      mp4Buffer[7] = 0x70;

      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "HEAD") {
            return Promise.resolve(
              createMockResponse({
                ok: true,
                contentType: "video/mp4",
                contentLength: 1024 * 1024,
              }) as unknown as Response
            );
          }
          return Promise.resolve(
            createMockResponse({
              ok: true,
              status: 206,
              body: mp4Buffer.buffer,
            }) as unknown as Response
          );
        }
      );

      const urls = ["https://example.com/v1.mp4", "https://example.com/v2.mp4"];
      const result = await verifyMultipleVideos(urls);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(Map);
        expect(result.value.size).toBe(2);
        expect(result.value.has("https://example.com/v1.mp4")).toBe(true);
        expect(result.value.has("https://example.com/v2.mp4")).toBe(true);
      }
    });

    it("should return empty map for empty array", async () => {
      const result = await verifyMultipleVideos([]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.size).toBe(0);
      }
    });
  });
});
