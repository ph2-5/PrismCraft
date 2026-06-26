import { describe, it, expect } from "vitest";
import { pollResultSchema, mapApiStatus } from "../task-schema";

describe("task-schema", () => {
  describe("pollResultSchema", () => {
    it("should validate a complete poll result", () => {
      const result = pollResultSchema.safeParse({
        status: "completed",
        progress: 100,
        videoUrl: "https://example.com/video.mp4",
      });
      expect(result.success).toBe(true);
    });

    it("should validate with minimal fields", () => {
      const result = pollResultSchema.safeParse({
        status: "processing",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid status", () => {
      const result = pollResultSchema.safeParse({
        status: "invalid_status",
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing status", () => {
      const result = pollResultSchema.safeParse({
        progress: 50,
      });
      expect(result.success).toBe(false);
    });

    it("should accept all valid statuses", () => {
      const validStatuses = ["pending", "processing", "completed", "failed", "cancelled", "running", "queued"];
      for (const status of validStatuses) {
        const result = pollResultSchema.safeParse({ status });
        expect(result.success, `status "${status}" should be valid`).toBe(true);
      }
    });

    it("should reject progress outside 0-100", () => {
      const tooHigh = pollResultSchema.safeParse({ status: "processing", progress: 150 });
      expect(tooHigh.success).toBe(false);

      const tooLow = pollResultSchema.safeParse({ status: "processing", progress: -1 });
      expect(tooLow.success).toBe(false);
    });

    it("should accept progress within 0-100", () => {
      const result = pollResultSchema.safeParse({ status: "processing", progress: 50 });
      expect(result.success).toBe(true);
    });
  });

  describe("mapApiStatus", () => {
    it("should map standard statuses directly", () => {
      expect(mapApiStatus("pending")).toBe("pending");
      expect(mapApiStatus("processing")).toBe("generating");
      expect(mapApiStatus("completed")).toBe("generating");
      expect(mapApiStatus("failed")).toBe("failed");
    });

    it("should map provider-specific statuses", () => {
      expect(mapApiStatus("running")).toBe("generating");
      expect(mapApiStatus("queued")).toBe("pending");
      expect(mapApiStatus("succeeded")).toBe("generating");
      expect(mapApiStatus("success")).toBe("generating");
      expect(mapApiStatus("error")).toBe("failed");
    });

    it("should map cancelled to cancelled (not failed)", () => {
      // M2 fix: cancelled 是用户主动取消，应映射为 cancelled 终态而非 failed。
      // 之前映射为 failed 会让恢复服务误判为可重试，导致已取消任务被自动重试。
      expect(mapApiStatus("cancelled")).toBe("cancelled");
    });

    it("should default to generating for unknown statuses", () => {
      // H1 fix: 未知 Provider 状态字符串（如 rendering/converting/moderating）
      // 必须降级为 generating，让轮询继续，而不是误判为 failed（假失败）。
      expect(mapApiStatus("unknown")).toBe("generating");
      expect(mapApiStatus("")).toBe("generating");
      expect(mapApiStatus("random_string")).toBe("generating");
    });

    it("should be case-insensitive", () => {
      expect(mapApiStatus("Running")).toBe("generating");
      expect(mapApiStatus("QUEUED")).toBe("pending");
      expect(mapApiStatus("Succeeded")).toBe("generating");
    });

    it("should not override non-completed statuses with videoUrl", () => {
      expect(mapApiStatus("failed", "https://example.com/video.mp4")).toBe("failed");
      // H1 fix: unknown 现在降级为 generating（不是 failed），即使附带 videoUrl 也不应改变。
      expect(mapApiStatus("unknown", "https://example.com/video.mp4")).toBe("generating");
      expect(mapApiStatus("error", "https://example.com/video.mp4")).toBe("failed");
      // M2 fix: cancelled 映射为 cancelled，videoUrl 不应改变它。
      expect(mapApiStatus("cancelled", "https://example.com/video.mp4")).toBe("cancelled");
      expect(mapApiStatus("pending", "https://example.com/video.mp4")).toBe("pending");
      expect(mapApiStatus("processing", "https://example.com/video.mp4")).toBe("generating");
    });

    it("should confirm completed when videoUrl is present and apiStatus is completed-like", () => {
      expect(mapApiStatus("completed", "https://example.com/video.mp4")).toBe("completed");
      expect(mapApiStatus("succeeded", "https://example.com/video.mp4")).toBe("completed");
      expect(mapApiStatus("success", "https://example.com/video.mp4")).toBe("completed");
    });

    it("should return generating when apiStatus is completed-like but no videoUrl", () => {
      expect(mapApiStatus("completed")).toBe("generating");
      expect(mapApiStatus("succeeded")).toBe("generating");
      expect(mapApiStatus("success")).toBe("generating");
    });

    it("should not treat empty string videoUrl as present", () => {
      expect(mapApiStatus("failed", "")).toBe("failed");
      // H1 fix: unknown 降级为 generating（不带 videoUrl 时也如此）。
      expect(mapApiStatus("unknown", "")).toBe("generating");
    });

    it("should fall back to status mapping when videoUrl is absent", () => {
      expect(mapApiStatus("completed")).toBe("generating");
      expect(mapApiStatus("failed")).toBe("failed");
      // H1 fix: unknown 降级为 generating，避免假失败。
      expect(mapApiStatus("unknown")).toBe("generating");
    });
  });
});
