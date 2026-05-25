import { describe, it, expect } from "vitest";
import {
  normalizeTimestamp,
  toStorageTimestamp,
} from "@/infrastructure/storage/video-tasks";

describe("storage/video-tasks", () => {
  describe("normalizeTimestamp", () => {
    it("should convert seconds timestamp to ISO string", () => {
      const secTimestamp = 1700000000;
      const result = normalizeTimestamp(secTimestamp, 0);
      expect(result).toBe(new Date(secTimestamp * 1000).toISOString());
    });

    it("should convert milliseconds timestamp to ISO string", () => {
      const msTimestamp = 1700000000000;
      const result = normalizeTimestamp(msTimestamp, 0);
      expect(result).toBe(new Date(msTimestamp).toISOString());
    });

    it("should return fallback as ISO string for null", () => {
      const result = normalizeTimestamp(null, 100);
      expect(result).toBe(new Date(100 * 1000).toISOString());
    });

    it("should return fallback as ISO string for undefined", () => {
      const result = normalizeTimestamp(undefined, 100);
      expect(result).toBe(new Date(100 * 1000).toISOString());
    });

    it("should return fallback as ISO string for NaN", () => {
      const result = normalizeTimestamp(NaN, 100);
      expect(result).toBe(new Date(100 * 1000).toISOString());
    });

    it("should return fallback as ISO string for non-numeric string", () => {
      const result = normalizeTimestamp("not-a-number", 50);
      expect(result).toBe(new Date(50 * 1000).toISOString());
    });

    it("should handle numeric string in seconds", () => {
      const result = normalizeTimestamp("1700000000", 0);
      expect(result).toBe(new Date(1700000000 * 1000).toISOString());
    });

    it("should handle numeric string in milliseconds", () => {
      const result = normalizeTimestamp("1700000000000", 0);
      expect(result).toBe(new Date(1700000000000).toISOString());
    });
  });

  describe("toStorageTimestamp", () => {
    it("should convert ISO string to seconds", () => {
      const isoString = new Date(1700000000000).toISOString();
      const result = toStorageTimestamp(isoString);
      expect(result).toBe(Math.floor(1700000000000 / 1000));
    });

    it("should convert milliseconds number to seconds", () => {
      const msTimestamp = 1700000000000;
      const result = toStorageTimestamp(msTimestamp);
      expect(result).toBe(Math.floor(msTimestamp / 1000));
    });

    it("should keep seconds-level number as-is", () => {
      const secTimestamp = 1700000000;
      const result = toStorageTimestamp(secTimestamp);
      expect(result).toBe(Math.floor(secTimestamp));
    });

    it("should return null for null", () => {
      const result = toStorageTimestamp(null);
      expect(result).toBeNull();
    });

    it("should return null for undefined", () => {
      const result = toStorageTimestamp(undefined);
      expect(result).toBeNull();
    });

    it("should return null for NaN", () => {
      const result = toStorageTimestamp(NaN);
      expect(result).toBeNull();
    });

    it("should return null for non-date string", () => {
      const result = toStorageTimestamp("not-a-date");
      expect(result).toBeNull();
    });
  });
});
