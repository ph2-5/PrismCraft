import { describe, it, expect, vi } from "vitest";
import {
  retryWithBackoff,
  defaultRetryableError,
  calculateBackoffDelay,
} from "../retry-with-backoff";

describe("retry 模块", () => {
  describe("calculateBackoffDelay", () => {
    it("exponential 策略应返回 baseDelay * 2^attempt", () => {
      expect(calculateBackoffDelay(0, 100, "exponential", 10000, false)).toBe(100);
      expect(calculateBackoffDelay(1, 100, "exponential", 10000, false)).toBe(200);
      expect(calculateBackoffDelay(2, 100, "exponential", 10000, false)).toBe(400);
      expect(calculateBackoffDelay(3, 100, "exponential", 10000, false)).toBe(800);
    });

    it("linear 策略应返回 baseDelay * (attempt+1)", () => {
      expect(calculateBackoffDelay(0, 100, "linear", 10000, false)).toBe(100);
      expect(calculateBackoffDelay(1, 100, "linear", 10000, false)).toBe(200);
      expect(calculateBackoffDelay(4, 100, "linear", 10000, false)).toBe(500);
    });

    it("fixed 策略应始终返回 baseDelay", () => {
      expect(calculateBackoffDelay(0, 100, "fixed", 10000, false)).toBe(100);
      expect(calculateBackoffDelay(5, 100, "fixed", 10000, false)).toBe(100);
    });

    it("应受 maxDelayMs 上限约束", () => {
      expect(calculateBackoffDelay(10, 100, "exponential", 500, false)).toBe(500);
      expect(calculateBackoffDelay(10, 100, "exponential", 1000, false)).toBe(1000);
    });

    it("启用 jitter 时延迟应在 [0.5*delay, delay] 区间", () => {
      for (let i = 0; i < 20; i++) {
        const delay = calculateBackoffDelay(2, 100, "exponential", 10000, true);
        expect(delay).toBeGreaterThanOrEqual(200);
        expect(delay).toBeLessThanOrEqual(400);
      }
    });

    it("无 jitter 时应返回精确延迟值（整数）", () => {
      expect(calculateBackoffDelay(2, 100, "exponential", 10000, false)).toBe(400);
      expect(Number.isInteger(calculateBackoffDelay(2, 100, "exponential", 10000, false))).toBe(true);
    });

    it("返回值应向下取整", () => {
      // 0.75 抖动概率下，jitter 关闭时仍是整数；这里用 fixed 策略保证不依赖随机数
      expect(calculateBackoffDelay(0, 99.7, "fixed", 10000, false)).toBe(99);
    });
  });

  describe("defaultRetryableError", () => {
    it("null / undefined / false 应返回 false", () => {
      expect(defaultRetryableError(null)).toBe(false);
      expect(defaultRetryableError(undefined)).toBe(false);
      expect(defaultRetryableError(false)).toBe(false);
    });

    it("AbortError 应返回 false（用户主动取消）", () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      expect(defaultRetryableError(err)).toBe(false);
    });

    it("HTTP 5xx 应返回 true", () => {
      expect(defaultRetryableError({ status: 500 })).toBe(true);
      expect(defaultRetryableError({ status: 502 })).toBe(true);
      expect(defaultRetryableError({ status: 503 })).toBe(true);
      expect(defaultRetryableError({ statusCode: 504 })).toBe(true);
    });

    it("HTTP 408 / 429 应返回 true", () => {
      expect(defaultRetryableError({ status: 408 })).toBe(true);
      expect(defaultRetryableError({ status: 429 })).toBe(true);
    });

    it("HTTP 4xx（除 408/429）应返回 false", () => {
      expect(defaultRetryableError({ status: 400 })).toBe(false);
      expect(defaultRetryableError({ status: 401 })).toBe(false);
      expect(defaultRetryableError({ status: 403 })).toBe(false);
      expect(defaultRetryableError({ status: 404 })).toBe(false);
    });

    it("网络层错误码应返回 true", () => {
      expect(defaultRetryableError({ code: "ECONNREFUSED" })).toBe(true);
      expect(defaultRetryableError({ code: "ECONNRESET" })).toBe(true);
      expect(defaultRetryableError({ code: "ETIMEDOUT" })).toBe(true);
      expect(defaultRetryableError({ apiCode: "ENOTFOUND" })).toBe(true);
    });

    it("应用层错误码应返回 true", () => {
      expect(defaultRetryableError({ code: "NETWORK_ERROR" })).toBe(true);
      expect(defaultRetryableError({ code: "TIMEOUT" })).toBe(true);
      expect(defaultRetryableError({ code: "RATE_LIMITED" })).toBe(true);
      expect(defaultRetryableError({ code: "API_SERVER_ERROR" })).toBe(true);
    });

    it("错误消息匹配可重试模式时应返回 true", () => {
      expect(defaultRetryableError(new Error("Request timeout"))).toBe(true);
      expect(defaultRetryableError(new Error("ECONNREFUSED"))).toBe(true);
      expect(defaultRetryableError(new Error("rate limit exceeded"))).toBe(true);
      expect(defaultRetryableError(new Error("503 service unavailable"))).toBe(true);
      expect(defaultRetryableError(new Error("Failed to fetch"))).toBe(true);
    });

    it("普通业务错误（无匹配）应返回 false", () => {
      expect(defaultRetryableError(new Error("invalid input"))).toBe(false);
      expect(defaultRetryableError({ code: "VALIDATION_ERROR" })).toBe(false);
    });
  });

  describe("retryWithBackoff", () => {
    it("首次成功应直接返回，不触发重试", async () => {
      const fn = vi.fn().mockResolvedValue("ok");
      const onRetry = vi.fn();

      const result = await retryWithBackoff({
        fn,
        maxRetries: 3,
        baseDelayMs: 1,
        shouldJitter: false,
        onRetry,
      });

      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it("可重试错误应重试到成功", async () => {
      let attempt = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 3) {
          const err = new Error("network timeout");
          err.name = "NetworkError";
          return Promise.reject(err);
        }
        return Promise.resolve("done");
      });
      const onRetry = vi.fn();

      const result = await retryWithBackoff({
        fn,
        maxRetries: 5,
        baseDelayMs: 1,
        shouldJitter: false,
        onRetry,
      });

      expect(result).toBe("done");
      expect(fn).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenCalledTimes(2);
      // attempt 参数从 1 开始计数
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error), expect.any(Number));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), expect.any(Number));
    });

    it("不可重试错误应立即抛出，不消耗重试次数", async () => {
      const err = new Error("validation failed");
      const fn = vi.fn().mockRejectedValue(err);
      const onRetry = vi.fn();

      await expect(
        retryWithBackoff({
          fn,
          maxRetries: 5,
          baseDelayMs: 1,
          onRetry,
        }),
      ).rejects.toThrow("validation failed");

      expect(fn).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it("达到 maxRetries 仍未成功应抛出最后一个错误", async () => {
      const err = new Error("ETIMEDOUT");
      const fn = vi.fn().mockRejectedValue(err);

      await expect(
        retryWithBackoff({
          fn,
          maxRetries: 2,
          baseDelayMs: 1,
          shouldJitter: false,
        }),
      ).rejects.toThrow("ETIMEDOUT");

      // 总尝试次数 = maxRetries + 1 = 3
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("maxRetries=0 时只尝试一次", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));

      await expect(
        retryWithBackoff({
          fn,
          maxRetries: 0,
          baseDelayMs: 1,
        }),
      ).rejects.toThrow("ETIMEDOUT");

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("自定义 retryOn 谓词应被使用", async () => {
      let attempt = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) return Promise.reject(new Error("custom-error"));
        return Promise.resolve("recovered");
      });
      // 自定义：所有错误都可重试
      const retryOn = vi.fn().mockReturnValue(true);

      const result = await retryWithBackoff({
        fn,
        maxRetries: 3,
        baseDelayMs: 1,
        shouldJitter: false,
        retryOn,
      });

      expect(result).toBe("recovered");
      expect(retryOn).toHaveBeenCalled();
    });

    it("getDelayOverride 应能覆盖默认延迟", async () => {
      let attempt = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) return Promise.reject(new Error("ECONNRESET"));
        return Promise.resolve("ok");
      });
      const getDelayOverride = vi.fn().mockReturnValue(2);

      const result = await retryWithBackoff({
        fn,
        maxRetries: 2,
        baseDelayMs: 1000, // 默认延迟 1000ms
        shouldJitter: false,
        getDelayOverride,
      });

      expect(result).toBe("ok");
      expect(getDelayOverride).toHaveBeenCalledWith(expect.any(Error), 1000);
    });

    it("signal 在尝试前已 abort 应抛出 AbortError", async () => {
      const controller = new AbortController();
      controller.abort();
      const fn = vi.fn().mockResolvedValue("ok");

      await expect(
        retryWithBackoff({
          fn,
          maxRetries: 3,
          baseDelayMs: 1,
          signal: controller.signal,
        }),
      ).rejects.toThrow();

      // signal 已 abort，不应调用 fn
      expect(fn).not.toHaveBeenCalled();
    });

    it("signal abort 时抛出的错误 name 应为 AbortError", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        retryWithBackoff({
          fn: () => Promise.reject(new Error("ETIMEDOUT")),
          maxRetries: 3,
          baseDelayMs: 1,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: "AbortError" });
    });

    it("signal 在等待期间 abort 应立即抛出 AbortError", async () => {
      const controller = new AbortController();
      let attempt = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          // 在第一次失败后、等待延迟时 abort
          setTimeout(() => controller.abort(), 1);
          return Promise.reject(new Error("ETIMEDOUT"));
        }
        return Promise.resolve("ok");
      });

      await expect(
        retryWithBackoff({
          fn,
          maxRetries: 3,
          baseDelayMs: 1000, // 长延迟便于在等待期间 abort
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: "AbortError" });

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("非 Error 类型的 reject 值应被规范化为 Error", async () => {
      const fn = vi.fn().mockRejectedValue("plain string error");

      await expect(
        retryWithBackoff({
          fn,
          maxRetries: 0,
          baseDelayMs: 1,
          // 强制使其可重试以触发规范化路径
          retryOn: () => false, // 直接抛出不重试
        }),
      ).rejects.toBeInstanceOf(Error);
    });

    it("默认 backoff 应为 exponential", async () => {
      let attempt = 0;
      const delays: number[] = [];
      const fn = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt <= 2) {
          return Promise.reject(new Error("ETIMEDOUT"));
        }
        return Promise.resolve("ok");
      });

      await retryWithBackoff({
        fn,
        maxRetries: 5,
        baseDelayMs: 1,
        shouldJitter: false,
        onRetry: (_attempt, _err, delay) => {
          delays.push(delay);
        },
      });

      // attempt=0 -> delay = 1*2^0 = 1
      // attempt=1 -> delay = 1*2^1 = 2
      expect(delays).toEqual([1, 2]);
    });

    it("linear 策略应使用线性递增延迟", async () => {
      let attempt = 0;
      const delays: number[] = [];
      const fn = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt <= 2) {
          return Promise.reject(new Error("ETIMEDOUT"));
        }
        return Promise.resolve("ok");
      });

      await retryWithBackoff({
        fn,
        maxRetries: 5,
        baseDelayMs: 10,
        backoff: "linear",
        shouldJitter: false,
        onRetry: (_a, _e, delay) => {
          delays.push(delay);
        },
      });

      // attempt=0 -> delay = 10*(0+1) = 10
      // attempt=1 -> delay = 10*(1+1) = 20
      expect(delays).toEqual([10, 20]);
    });
  });
});
