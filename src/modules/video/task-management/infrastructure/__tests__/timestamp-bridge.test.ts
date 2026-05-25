import { describe, it, expect } from "vitest";
import { TimestampBridge } from "../timestamp-bridge";

describe("TimestampBridge", () => {
  describe("toStorage", () => {
    it("should convert milliseconds to seconds", () => {
      const ms = 1700000000000;
      const result = TimestampBridge.toStorage(ms);
      expect(result).toBe(1700000000);
    });

    it("should keep seconds as-is when below threshold", () => {
      const sec = 1700000000;
      const result = TimestampBridge.toStorage(sec);
      expect(result).toBe(1700000000);
    });

    it("should return null for null input", () => {
      expect(TimestampBridge.toStorage(null)).toBeNull();
    });

    it("should return null for undefined input", () => {
      expect(TimestampBridge.toStorage(undefined)).toBeNull();
    });

    it("should return null for NaN", () => {
      expect(TimestampBridge.toStorage(NaN)).toBeNull();
    });

    it("should return null for Infinity", () => {
      expect(TimestampBridge.toStorage(Infinity)).toBeNull();
      expect(TimestampBridge.toStorage(-Infinity)).toBeNull();
    });

    it("should floor the result", () => {
      const ms = 1700000000999;
      const result = TimestampBridge.toStorage(ms);
      expect(result).toBe(1700000000);
    });

    it("should handle string numbers", () => {
      const result = TimestampBridge.toStorage("1700000000000" as unknown as number);
      expect(result).toBe(1700000000);
    });

    it("should handle zero", () => {
      expect(TimestampBridge.toStorage(0)).toBe(0);
    });
  });

  describe("fromStorage", () => {
    it("should convert seconds to milliseconds", () => {
      const sec = 1700000000;
      const result = TimestampBridge.fromStorage(sec);
      expect(result).toBe(1700000000000);
    });

    it("should keep milliseconds as-is when above threshold", () => {
      const ms = 1700000000000;
      const result = TimestampBridge.fromStorage(ms);
      expect(result).toBe(1700000000000);
    });

    it("should return null for null input", () => {
      expect(TimestampBridge.fromStorage(null)).toBeNull();
    });

    it("should return null for undefined input", () => {
      expect(TimestampBridge.fromStorage(undefined)).toBeNull();
    });

    it("should return null for NaN", () => {
      expect(TimestampBridge.fromStorage(NaN)).toBeNull();
    });

    it("should return null for Infinity", () => {
      expect(TimestampBridge.fromStorage(Infinity)).toBeNull();
      expect(TimestampBridge.fromStorage(-Infinity)).toBeNull();
    });

    it("should handle zero", () => {
      expect(TimestampBridge.fromStorage(0)).toBe(0);
    });
  });

  describe("round-trip", () => {
    it("should round-trip a millisecond timestamp with second-level precision", () => {
      const originalMs = Math.floor(Date.now() / 1000) * 1000;
      const stored = TimestampBridge.toStorage(originalMs);
      const restored = TimestampBridge.fromStorage(stored!);

      expect(restored).toBe(originalMs);
    });

    it("should lose sub-second precision in round-trip", () => {
      const originalMs = 1700000000320;
      const stored = TimestampBridge.toStorage(originalMs);
      const restored = TimestampBridge.fromStorage(stored!);

      expect(restored).toBe(1700000000000);
      expect(restored).not.toBe(originalMs);
    });

    it("should round-trip a second timestamp correctly", () => {
      const originalSec = 1700000000;
      const restored = TimestampBridge.fromStorage(originalSec);
      const reStored = TimestampBridge.toStorage(restored!);

      expect(reStored).toBe(originalSec);
    });
  });

  describe("toStorageOrThrow", () => {
    it("should return seconds for valid input", () => {
      expect(TimestampBridge.toStorageOrThrow(1700000000000)).toBe(1700000000);
    });

    it("should throw for null-producing input", () => {
      expect(() => TimestampBridge.toStorageOrThrow(NaN)).toThrow("Invalid timestamp");
    });
  });

  describe("fromStorageOrThrow", () => {
    it("should return milliseconds for valid input", () => {
      expect(TimestampBridge.fromStorageOrThrow(1700000000)).toBe(1700000000000);
    });

    it("should throw for null-producing input", () => {
      expect(() => TimestampBridge.fromStorageOrThrow(NaN)).toThrow("Invalid timestamp");
    });
  });
});
