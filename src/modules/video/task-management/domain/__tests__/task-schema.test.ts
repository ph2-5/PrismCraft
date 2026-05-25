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
      expect(mapApiStatus("completed")).toBe("completed");
      expect(mapApiStatus("failed")).toBe("failed");
    });

    it("should map provider-specific statuses", () => {
      expect(mapApiStatus("running")).toBe("generating");
      expect(mapApiStatus("queued")).toBe("pending");
      expect(mapApiStatus("succeeded")).toBe("completed");
      expect(mapApiStatus("success")).toBe("completed");
      expect(mapApiStatus("error")).toBe("failed");
    });

    it("should map cancelled to failed", () => {
      expect(mapApiStatus("cancelled")).toBe("failed");
    });

    it("should default to failed for unknown statuses", () => {
      expect(mapApiStatus("unknown")).toBe("failed");
      expect(mapApiStatus("")).toBe("failed");
      expect(mapApiStatus("random_string")).toBe("failed");
    });

    it("should be case-insensitive", () => {
      expect(mapApiStatus("Running")).toBe("generating");
      expect(mapApiStatus("QUEUED")).toBe("pending");
      expect(mapApiStatus("Succeeded")).toBe("completed");
    });
  });
});
