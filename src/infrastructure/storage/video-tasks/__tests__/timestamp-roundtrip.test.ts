import { describe, it, expect } from "vitest";
import { normalizeTimestamp, toStorageTimestamp, toStorageTimestampOrNow } from "../parser";

describe("timestamp roundtrip", () => {
  describe("ISO 字符串 → toStorageTimestamp → normalizeTimestamp 应保持一致", () => {
    it("标准 ISO 字符串 roundtrip 秒级精度一致", () => {
      const iso = "2024-06-15T12:30:45.123Z";
      const sec = toStorageTimestamp(iso);
      expect(sec).not.toBeNull();
      const roundtrip = normalizeTimestamp(sec!, 0);
      const originalSec = Math.floor(new Date(iso).getTime() / 1000);
      const roundtripSec = Math.floor(new Date(roundtrip).getTime() / 1000);
      expect(roundtripSec).toBe(originalSec);
    });

    it("UTC 边界日期 roundtrip", () => {
      const iso = "1970-01-01T00:00:00.000Z";
      const sec = toStorageTimestamp(iso);
      expect(sec).toBe(0);
      const roundtrip = normalizeTimestamp(sec, 0);
      expect(new Date(roundtrip).getTime()).toBe(0);
    });
  });

  describe("毫秒时间戳 → toStorageTimestamp → normalizeTimestamp 应保持一致", () => {
    it("毫秒时间戳 roundtrip 秒级精度一致", () => {
      const ms = 1718452245123;
      const sec = toStorageTimestamp(ms);
      expect(sec).not.toBeNull();
      const roundtrip = normalizeTimestamp(sec!, 0);
      const originalSec = Math.floor(ms / 1000);
      const roundtripSec = Math.floor(new Date(roundtrip).getTime() / 1000);
      expect(roundtripSec).toBe(originalSec);
    });
  });

  describe("秒时间戳 → normalizeTimestamp → toStorageTimestamp 应保持一致", () => {
    it("秒时间戳 roundtrip 秒数一致", () => {
      const sec = 1718452245;
      const iso = normalizeTimestamp(sec, 0);
      const roundtripSec = toStorageTimestamp(iso);
      expect(roundtripSec).toBe(sec);
    });

    it("零秒 roundtrip", () => {
      const sec = 0;
      const iso = normalizeTimestamp(sec, 0);
      const roundtripSec = toStorageTimestamp(iso);
      expect(roundtripSec).toBe(sec);
    });
  });

  describe("null/undefined 输入应返回 null / fallback", () => {
    it("toStorageTimestamp(null) → null", () => {
      expect(toStorageTimestamp(null)).toBeNull();
    });

    it("toStorageTimestamp(undefined) → null", () => {
      expect(toStorageTimestamp(undefined)).toBeNull();
    });

    it("normalizeTimestamp(null, 1000) → new Date(1000000).toISOString()", () => {
      expect(normalizeTimestamp(null, 1000)).toBe(new Date(1000000).toISOString());
    });

    it("normalizeTimestamp(undefined, 0) → new Date(0).toISOString()", () => {
      expect(normalizeTimestamp(undefined, 0)).toBe(new Date(0).toISOString());
    });
  });

  describe("NaN 输入应返回 null / fallback", () => {
    it("toStorageTimestamp('not a number') → null", () => {
      expect(toStorageTimestamp("not a number")).toBeNull();
    });

    it("normalizeTimestamp('not a number', 0) → new Date(0).toISOString()", () => {
      expect(normalizeTimestamp("not a number", 0)).toBe(new Date(0).toISOString());
    });
  });

  describe("toStorageTimestampOrNow 无值时应返回当前时间", () => {
    it("toStorageTimestampOrNow(null) 应接近 Math.floor(Date.now() / 1000)", () => {
      const before = Math.floor(Date.now() / 1000);
      const result = toStorageTimestampOrNow(null);
      const after = Math.floor(Date.now() / 1000);
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });

    it("toStorageTimestampOrNow(undefined) 应接近 Math.floor(Date.now() / 1000)", () => {
      const before = Math.floor(Date.now() / 1000);
      const result = toStorageTimestampOrNow(undefined);
      const after = Math.floor(Date.now() / 1000);
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });
  });

  describe("toStorageTimestampOrNow 有值时应使用该值", () => {
    it("toStorageTimestampOrNow('2024-01-01T00:00:00.000Z') 应返回对应秒数", () => {
      const expected = Math.floor(new Date("2024-01-01T00:00:00.000Z").getTime() / 1000);
      expect(toStorageTimestampOrNow("2024-01-01T00:00:00.000Z")).toBe(expected);
    });

    it("toStorageTimestampOrNow(毫秒时间戳) 应返回对应秒数", () => {
      const ms = 1704067200000;
      const expected = Math.floor(ms / 1000);
      expect(toStorageTimestampOrNow(ms)).toBe(expected);
    });
  });

  describe("边界值：TIMESTAMP_THRESHOLD 附近", () => {
    it("恰好 1e12（等于阈值）→ 应识别为秒（条件为 > 而非 >=）", () => {
      const threshold = 1e12;
      const sec = toStorageTimestamp(threshold);
      expect(sec).toBe(Math.floor(threshold));
    });

    it("1e12 - 1 → 应识别为秒", () => {
      const belowThreshold = 1e12 - 1;
      const sec = toStorageTimestamp(belowThreshold);
      expect(sec).toBe(Math.floor(belowThreshold));
    });

    it("1e12 + 1 → 应识别为毫秒", () => {
      const aboveThreshold = 1e12 + 1;
      const sec = toStorageTimestamp(aboveThreshold);
      expect(sec).toBe(Math.floor(aboveThreshold / 1000));
    });

    it("normalizeTimestamp 对 1e12 应识别为秒（条件为 > 而非 >=）", () => {
      const threshold = 1e12;
      const iso = normalizeTimestamp(threshold, 0);
      const expectedMs = threshold * 1000;
      expect(new Date(iso).getTime()).toBe(expectedMs);
    });

    it("normalizeTimestamp 对 1e12 - 1 应识别为秒", () => {
      const belowThreshold = 1e12 - 1;
      const iso = normalizeTimestamp(belowThreshold, 0);
      const expectedMs = belowThreshold * 1000;
      expect(new Date(iso).getTime()).toBe(expectedMs);
    });
  });

  describe("负时间戳应正确处理", () => {
    it("toStorageTimestamp(-1) → -1", () => {
      expect(toStorageTimestamp(-1)).toBe(-1);
    });

    it("normalizeTimestamp(-1, 0) 应不崩溃", () => {
      const result = normalizeTimestamp(-1, 0);
      expect(result).toBe(new Date(-1000).toISOString());
    });
  });

  describe("零值应正确处理", () => {
    it("toStorageTimestamp(0) → 0", () => {
      expect(toStorageTimestamp(0)).toBe(0);
    });

    it("normalizeTimestamp(0, 1000) → new Date(0).toISOString()", () => {
      expect(normalizeTimestamp(0, 1000)).toBe(new Date(0).toISOString());
    });
  });
});
