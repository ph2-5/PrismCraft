import { describe, it, expect, vi } from "vitest";
import { withRetry } from "@/infrastructure/storage/sqlite-core";

describe("storage/sqlite-core", () => {
  describe("withRetry", () => {
    it("should retry on retryable errors (busy)", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("database is busy"))
        .mockResolvedValueOnce("success");

      const result = await withRetry(fn, 3);
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should retry on retryable errors (locked)", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("database is locked"))
        .mockResolvedValueOnce("success");

      const result = await withRetry(fn, 3);
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should throw immediately on non-retryable errors", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("syntax error"));

      await expect(withRetry(fn, 3)).rejects.toThrow("syntax error");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should throw after max retries exhausted", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("database is busy"));

      await expect(withRetry(fn, 2)).rejects.toThrow("database is busy");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("should return result on first successful call", async () => {
      const fn = vi.fn().mockResolvedValue("ok");

      const result = await withRetry(fn, 3);
      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should handle case-insensitive retryable errors", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("Database is BUSY"))
        .mockResolvedValueOnce("success");

      const result = await withRetry(fn, 3);
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
