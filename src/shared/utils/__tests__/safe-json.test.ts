import { describe, it, expect } from "vitest";
import {
  safeJsonParse,
  safeJsonParseArray,
  safeJsonParseRecord,
} from "../safe-json";

describe("safe-json", () => {
  describe("safeJsonParse", () => {
    it("should return fallback for null", () => {
      expect(safeJsonParse(null, "fallback")).toBe("fallback");
    });

    it("should return fallback for undefined", () => {
      expect(safeJsonParse(undefined, "fallback")).toBe("fallback");
    });

    it("should return fallback for empty string", () => {
      expect(safeJsonParse("", "fallback")).toBe("fallback");
    });

    it("should return fallback for 0", () => {
      expect(safeJsonParse(0, "fallback")).toBe("fallback");
    });

    it("should return fallback for false", () => {
      expect(safeJsonParse(false, "fallback")).toBe("fallback");
    });

    it("should parse valid JSON string", () => {
      expect(safeJsonParse('{"name":"test"}', {} as Record<string, unknown>)).toEqual({ name: "test" });
    });

    it("should parse valid JSON array string", () => {
      expect(safeJsonParse("[1,2,3]", [])).toEqual([1, 2, 3]);
    });

    it("should parse valid JSON number string", () => {
      expect(safeJsonParse("42", 0)).toBe(42);
    });

    it("should parse valid JSON boolean string", () => {
      expect(safeJsonParse("true", false)).toBe(true);
    });

    it("should parse valid JSON null string", () => {
      expect(safeJsonParse("null", "fallback")).toBeNull();
    });

    it("should return fallback for invalid JSON string", () => {
      expect(safeJsonParse("{invalid json}", {} as Record<string, unknown>)).toEqual({});
    });

    it("should return fallback for truncated JSON string", () => {
      expect(safeJsonParse('{"name":', {} as Record<string, unknown>)).toEqual({});
    });

    it("should pass through non-string raw values", () => {
      const obj = { name: "test" };
      expect(safeJsonParse(obj, {} as Record<string, unknown>)).toBe(obj);
    });

    it("should pass through array raw values", () => {
      const arr = [1, 2, 3];
      expect(safeJsonParse(arr, [])).toBe(arr);
    });

    it("should pass through number raw values", () => {
      expect(safeJsonParse(42, 0)).toBe(42);
    });

    it("should preserve object reference for non-string input", () => {
      const obj = { a: 1 };
      const result = safeJsonParse(obj, {} as Record<string, unknown>);
      expect(result).toBe(obj);
    });

    it("should handle complex nested JSON string", () => {
      const input = '{"outer":{"inner":[1,2,3]},"flag":true}';
      expect(safeJsonParse(input, {} as Record<string, unknown>)).toEqual({
        outer: { inner: [1, 2, 3] },
        flag: true,
      });
    });

    it("should use fallback type for generic type parameter", () => {
      interface Config { timeout: number; retries: number }
      const fallback: Config = { timeout: 5000, retries: 3 };
      expect(safeJsonParse<Config>('{"timeout":1000,"retries":5}', fallback)).toEqual({
        timeout: 1000,
        retries: 5,
      });
    });
  });

  describe("safeJsonParseArray", () => {
    it("should return empty array for null", () => {
      expect(safeJsonParseArray(null)).toEqual([]);
    });

    it("should return empty array for undefined", () => {
      expect(safeJsonParseArray(undefined)).toEqual([]);
    });

    it("should return empty array for empty string", () => {
      expect(safeJsonParseArray("")).toEqual([]);
    });

    it("should parse valid JSON array string", () => {
      expect(safeJsonParseArray('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it("should return empty array for invalid JSON string", () => {
      expect(safeJsonParseArray("not an array")).toEqual([]);
    });

    it("should return empty array for JSON string that is not an array", () => {
      expect(safeJsonParseArray('{"key":"value"}')).toEqual({ key: "value" });
    });

    it("should return empty array for non-array raw value that is falsy", () => {
      expect(safeJsonParseArray(0)).toEqual([]);
    });

    it("should pass through existing array raw value", () => {
      const arr = [4, 5, 6];
      expect(safeJsonParseArray(arr)).toBe(arr);
    });
  });

  describe("safeJsonParseRecord", () => {
    it("should return empty object for null", () => {
      expect(safeJsonParseRecord(null)).toEqual({});
    });

    it("should return empty object for undefined", () => {
      expect(safeJsonParseRecord(undefined)).toEqual({});
    });

    it("should return empty object for empty string", () => {
      expect(safeJsonParseRecord("")).toEqual({});
    });

    it("should parse valid JSON object string", () => {
      expect(safeJsonParseRecord('{"name":"test","count":5}')).toEqual({
        name: "test",
        count: 5,
      });
    });

    it("should return empty object for invalid JSON string", () => {
      expect(safeJsonParseRecord("{broken")).toEqual({});
    });

    it("should return empty object for non-object raw value that is falsy", () => {
      expect(safeJsonParseRecord(0)).toEqual({});
    });

    it("should pass through existing object raw value", () => {
      const obj = { key: "value" };
      expect(safeJsonParseRecord(obj)).toBe(obj);
    });
  });
});
