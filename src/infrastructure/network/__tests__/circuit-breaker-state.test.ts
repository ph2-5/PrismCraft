import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCircuitBreaker,
  getCircuitState,
  executeThroughCircuit,
  resetCircuitBreaker,
  resetAllCircuitBreakers,
  getAllCircuitStates,
} from "../circuit-breaker";
import { NETWORK_CONFIG } from "@/infrastructure/network/network.config";

vi.mock("@/infrastructure/network/network.config", () => ({
  NETWORK_CONFIG: {
    circuitBreaker: {
      enabled: true,
      failureThreshold: 3,
      successThreshold: 2,
      recoveryTimeout: 30000,
      halfOpenMaxCalls: 3,
    },
  },
}));

describe("circuit-breaker-state", () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    NETWORK_CONFIG.circuitBreaker.enabled = true;
  });

  describe("初始状态", () => {
    it("should start in closed state", () => {
      expect(getCircuitState("test-provider")).toBe("closed");
    });
  });

  describe("closed → open 转换", () => {
    it("should transition to open after failureThreshold failures", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      expect(getCircuitBreaker("test-provider").state).toBe("open");
    });
  });

  describe("open 状态行为", () => {
    it("should throw or call fallback when circuit is open", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      await expect(
        executeThroughCircuit("test-provider", vi.fn().mockResolvedValue("ok")),
      ).rejects.toThrow("Circuit breaker is open");

      const fallback = vi.fn().mockResolvedValue("fallback");
      await expect(
        executeThroughCircuit("test-provider", vi.fn().mockResolvedValue("ok"), fallback),
      ).resolves.toBe("fallback");
      expect(fallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("open → half-open 转换", () => {
    it("should transition to half-open after recoveryTimeout", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      expect(getCircuitBreaker("test-provider").state).toBe("open");

      vi.advanceTimersByTime(30001);

      expect(getCircuitState("test-provider")).toBe("half-open");
    });
  });

  describe("half-open 状态行为", () => {
    it("should transition to closed after successThreshold successes", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));
      const successFn = vi.fn().mockResolvedValue("ok");

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      vi.advanceTimersByTime(30001);
      expect(getCircuitState("test-provider")).toBe("half-open");

      await expect(executeThroughCircuit("test-provider", successFn)).resolves.toBe("ok");
      await expect(executeThroughCircuit("test-provider", successFn)).resolves.toBe("ok");

      expect(getCircuitState("test-provider")).toBe("closed");
    });

    it("should transition back to open on any failure", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      vi.advanceTimersByTime(30001);
      expect(getCircuitState("test-provider")).toBe("half-open");

      await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");

      expect(getCircuitBreaker("test-provider").state).toBe("open");
    });
  });

  describe("resetCircuitBreaker", () => {
    it("should reset the specific breaker", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      expect(getCircuitBreaker("test-provider").state).toBe("open");

      resetCircuitBreaker("test-provider");

      expect(getCircuitState("test-provider")).toBe("closed");
    });
  });

  describe("resetAllCircuitBreakers", () => {
    it("should clear all breakers", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("provider-a", failingFn)).rejects.toThrow("fail");
        await expect(executeThroughCircuit("provider-b", failingFn)).rejects.toThrow("fail");
      }

      expect(getCircuitBreaker("provider-a").state).toBe("open");
      expect(getCircuitBreaker("provider-b").state).toBe("open");

      resetAllCircuitBreakers();

      expect(getAllCircuitStates()).toEqual({});
      expect(getCircuitState("provider-a")).toBe("closed");
      expect(getCircuitState("provider-b")).toBe("closed");
    });
  });

  describe("enabled 为 false", () => {
    it("should bypass circuit breaker when config.enabled is false", async () => {
      NETWORK_CONFIG.circuitBreaker.enabled = false;

      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      const successFn = vi.fn().mockResolvedValue("ok");
      await expect(executeThroughCircuit("test-provider", successFn)).resolves.toBe("ok");
      expect(successFn).toHaveBeenCalledTimes(1);
    });
  });
});
