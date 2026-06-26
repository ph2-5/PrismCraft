import { describe, it, expect } from "vitest";
import {
  BLOB_URL_REVOKE_DELAY_MS,
  BLOB_URL_LONG_REVOKE_DELAY_MS,
  COPY_RESET_DELAY_MS,
  BATCH_OPERATION_INTERVAL_MS,
  CACHE_RETRY_INTERVAL_MS,
} from "../timers";

describe("timers 常量", () => {
  describe("BLOB_URL_REVOKE_DELAY_MS", () => {
    it("应导出一个数字", () => {
      expect(typeof BLOB_URL_REVOKE_DELAY_MS).toBe("number");
    });

    it("应为 5000ms（5 秒）", () => {
      expect(BLOB_URL_REVOKE_DELAY_MS).toBe(5000);
    });

    it("应为正数（合理延迟范围）", () => {
      expect(BLOB_URL_REVOKE_DELAY_MS).toBeGreaterThan(0);
      expect(BLOB_URL_REVOKE_DELAY_MS).toBeLessThanOrEqual(60000);
    });
  });

  describe("BLOB_URL_LONG_REVOKE_DELAY_MS", () => {
    it("应导出一个数字", () => {
      expect(typeof BLOB_URL_LONG_REVOKE_DELAY_MS).toBe("number");
    });

    it("应为 10000ms（10 秒，长延迟）", () => {
      expect(BLOB_URL_LONG_REVOKE_DELAY_MS).toBe(10000);
    });

    it("应大于 BLOB_URL_REVOKE_DELAY_MS（长延迟语义）", () => {
      expect(BLOB_URL_LONG_REVOKE_DELAY_MS).toBeGreaterThan(BLOB_URL_REVOKE_DELAY_MS);
    });
  });

  describe("COPY_RESET_DELAY_MS", () => {
    it("应导出一个数字", () => {
      expect(typeof COPY_RESET_DELAY_MS).toBe("number");
    });

    it("应为 2000ms（2 秒）", () => {
      expect(COPY_RESET_DELAY_MS).toBe(2000);
    });

    it("应为正数", () => {
      expect(COPY_RESET_DELAY_MS).toBeGreaterThan(0);
    });
  });

  describe("BATCH_OPERATION_INTERVAL_MS", () => {
    it("应导出一个数字", () => {
      expect(typeof BATCH_OPERATION_INTERVAL_MS).toBe("number");
    });

    it("应为 500ms（0.5 秒）", () => {
      expect(BATCH_OPERATION_INTERVAL_MS).toBe(500);
    });

    it("应小于 COPY_RESET_DELAY_MS（批处理间隔应小于 UI 反馈延迟）", () => {
      expect(BATCH_OPERATION_INTERVAL_MS).toBeLessThan(COPY_RESET_DELAY_MS);
    });
  });

  describe("CACHE_RETRY_INTERVAL_MS", () => {
    it("应导出一个数字", () => {
      expect(typeof CACHE_RETRY_INTERVAL_MS).toBe("number");
    });

    it("应为 1000ms（1 秒）", () => {
      expect(CACHE_RETRY_INTERVAL_MS).toBe(1000);
    });

    it("应为正数", () => {
      expect(CACHE_RETRY_INTERVAL_MS).toBeGreaterThan(0);
    });
  });

  describe("常量命名约定", () => {
    it("所有常量应以 _MS 后缀结尾（毫秒单位）", () => {
      const names = [
        "BLOB_URL_REVOKE_DELAY_MS",
        "BLOB_URL_LONG_REVOKE_DELAY_MS",
        "COPY_RESET_DELAY_MS",
        "BATCH_OPERATION_INTERVAL_MS",
        "CACHE_RETRY_INTERVAL_MS",
      ];
      names.forEach((name) => {
        expect(name.endsWith("_MS")).toBe(true);
      });
    });

    it("所有常量值应为整数毫秒", () => {
      [BLOB_URL_REVOKE_DELAY_MS, BLOB_URL_LONG_REVOKE_DELAY_MS, COPY_RESET_DELAY_MS,
       BATCH_OPERATION_INTERVAL_MS, CACHE_RETRY_INTERVAL_MS].forEach((v) => {
        expect(Number.isInteger(v)).toBe(true);
      });
    });
  });
});
