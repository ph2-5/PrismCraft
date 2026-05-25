import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCircuitState,
  executeThroughCircuit,
  resetCircuitBreaker,
  resetAllCircuitBreakers,
  getAllCircuitStates,
  getCircuitBreaker,
} from "../circuit-breaker";

vi.mock("../network.config", () => ({
  NETWORK_CONFIG: {
    circuitBreaker: {
      enabled: true,
      failureThreshold: 3,
      recoveryTimeout: 5000,
      halfOpenMaxCalls: 3,
      successThreshold: 2,
    },
  },
}));

describe("circuit-breaker", () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("初始状态", () => {
    it("should start in closed state", () => {
      expect(getCircuitState("test-provider")).toBe("closed");
    });

    it("should return empty states when no breakers exist", () => {
      resetAllCircuitBreakers();
      expect(getAllCircuitStates()).toEqual({});
    });
  });

  describe("closed -> open 转换", () => {
    it("should transition to open after reaching failure threshold", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      const breaker = getCircuitBreaker("test-provider");
      expect(breaker.state).toBe("open");
    });

    it("should remain closed if failures are below threshold", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");

      expect(getCircuitState("test-provider")).toBe("closed");
    });

    it("should reset failure count on success in closed state", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));
      const successFn = vi.fn().mockResolvedValue("ok");

      await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");

      await expect(executeThroughCircuit("test-provider", successFn)).resolves.toBe("ok");

      await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      expect(getCircuitState("test-provider")).toBe("closed");
    });
  });

  describe("open 状态行为", () => {
    it("should reject calls when circuit is open", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      const breaker = getCircuitBreaker("test-provider");
      expect(breaker.state).toBe("open");

      const successFn = vi.fn().mockResolvedValue("ok");
      await expect(executeThroughCircuit("test-provider", successFn)).rejects.toThrow(
        "Circuit breaker is open",
      );
    });

    it("should use fallback when circuit is open and fallback provided", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));
      const fallbackFn = vi.fn().mockResolvedValue("fallback");

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      await expect(
        executeThroughCircuit("test-provider", vi.fn().mockResolvedValue("ok"), fallbackFn),
      ).resolves.toBe("fallback");
    });
  });

  describe("open -> half-open 转换", () => {
    it("should transition to half-open after recovery timeout", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      const breaker = getCircuitBreaker("test-provider");
      expect(breaker.state).toBe("open");

      vi.advanceTimersByTime(5001);

      expect(getCircuitState("test-provider")).toBe("half-open");
    });
  });

  describe("half-open 状态行为", () => {
    it("should transition to closed after enough successes in half-open", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));
      const successFn = vi.fn().mockResolvedValue("ok");

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      vi.advanceTimersByTime(5001);

      expect(getCircuitState("test-provider")).toBe("half-open");

      await expect(executeThroughCircuit("test-provider", successFn)).resolves.toBe("ok");
      await expect(executeThroughCircuit("test-provider", successFn)).resolves.toBe("ok");

      expect(getCircuitState("test-provider")).toBe("closed");
    });

    it("should transition back to open on failure in half-open", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      vi.advanceTimersByTime(5001);

      await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");

      const breaker = getCircuitBreaker("test-provider");
      expect(breaker.state).toBe("open");
    });

    it("should limit calls in half-open state", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));
      const successFn = vi.fn().mockResolvedValue("ok");

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      vi.advanceTimersByTime(5001);

      await expect(executeThroughCircuit("test-provider", successFn)).resolves.toBe("ok");
      await expect(executeThroughCircuit("test-provider", successFn)).resolves.toBe("ok");
      await expect(executeThroughCircuit("test-provider", successFn)).resolves.toBe("ok");

      expect(getCircuitState("test-provider")).toBe("closed");
    });
  });

  describe("resetCircuitBreaker", () => {
    it("should reset breaker to closed state", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      const breaker = getCircuitBreaker("test-provider");
      expect(breaker.state).toBe("open");

      resetCircuitBreaker("test-provider");

      expect(getCircuitState("test-provider")).toBe("closed");
    });
  });

  describe("getAllCircuitStates", () => {
    it("should return states for all providers", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));
      const successFn = vi.fn().mockResolvedValue("ok");

      await expect(executeThroughCircuit("provider-a", successFn)).resolves.toBe("ok");

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("provider-b", failingFn)).rejects.toThrow("fail");
      }

      const states = getAllCircuitStates();
      expect(states["provider-a"].state).toBe("closed");
      const breakerB = getCircuitBreaker("provider-b");
      expect(breakerB.state).toBe("open");
    });
  });

  describe("half-open 并发控制", () => {
    it("should reject when half-open concurrency limit exceeded", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      vi.advanceTimersByTime(5001);
      expect(getCircuitState("test-provider")).toBe("half-open");

      let resolve1: (v: string) => void;
      let resolve2: (v: string) => void;
      let resolve3: (v: string) => void;
      const p1 = new Promise<string>((r) => { resolve1 = r; });
      const p2 = new Promise<string>((r) => { resolve2 = r; });
      const p3 = new Promise<string>((r) => { resolve3 = r; });

      const fn1 = vi.fn().mockReturnValue(p1);
      const fn2 = vi.fn().mockReturnValue(p2);
      const fn3 = vi.fn().mockReturnValue(p3);

      const exec1 = executeThroughCircuit("test-provider", fn1);
      const exec2 = executeThroughCircuit("test-provider", fn2);
      const exec3 = executeThroughCircuit("test-provider", fn3);

      const breaker = getCircuitBreaker("test-provider");
      expect(breaker.halfOpenActiveCalls).toBe(3);

      await expect(
        executeThroughCircuit("test-provider", vi.fn().mockResolvedValue("ok")),
      ).rejects.toThrow("half-open concurrency limit");

      const fallback = vi.fn().mockResolvedValue("fallback");
      await expect(
        executeThroughCircuit("test-provider", vi.fn().mockResolvedValue("ok"), fallback),
      ).resolves.toBe("fallback");
      expect(fallback).toHaveBeenCalledTimes(1);

      resolve1!("ok");
      resolve2!("ok");
      resolve3!("ok");
      await Promise.all([exec1, exec2, exec3]);
    });

    it("should not double-decrement halfOpenActiveCalls when success transitions to closed", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      vi.advanceTimersByTime(5001);
      expect(getCircuitState("test-provider")).toBe("half-open");

      let resolve1: (v: string) => void;
      let resolve2: (v: string) => void;
      const p1 = new Promise<string>((r) => { resolve1 = r; });
      const p2 = new Promise<string>((r) => { resolve2 = r; });

      const fn1 = vi.fn().mockReturnValue(p1);
      const fn2 = vi.fn().mockReturnValue(p2);

      const exec1 = executeThroughCircuit("test-provider", fn1);
      const exec2 = executeThroughCircuit("test-provider", fn2);

      const breaker = getCircuitBreaker("test-provider");
      expect(breaker.halfOpenActiveCalls).toBe(2);

      resolve1!("ok");
      resolve2!("ok");
      await Promise.all([exec1, exec2]);

      expect(getCircuitState("test-provider")).toBe("closed");
      expect(getCircuitBreaker("test-provider").halfOpenActiveCalls).toBe(0);
    });

    it("should not decrement halfOpenActiveCalls when failure transitions to open", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("test-provider", failingFn)).rejects.toThrow("fail");
      }

      vi.advanceTimersByTime(5001);
      expect(getCircuitState("test-provider")).toBe("half-open");

      let reject1: (e: Error) => void;
      let resolve2: (v: string) => void;
      const p1 = new Promise<string>((_, r) => { reject1 = r; });
      const p2 = new Promise<string>((r) => { resolve2 = r; });

      const fn1 = vi.fn().mockReturnValue(p1);
      const fn2 = vi.fn().mockReturnValue(p2);

      const exec1 = executeThroughCircuit("test-provider", fn1).catch(() => {});
      const exec2 = executeThroughCircuit("test-provider", fn2).catch(() => {});

      const breaker = getCircuitBreaker("test-provider");
      expect(breaker.halfOpenActiveCalls).toBe(2);

      reject1!(new Error("fail"));
      await exec1;

      expect(getCircuitBreaker("test-provider").state).toBe("open");

      resolve2!("ok");
      await exec2;
    });
  });

  describe("独立 provider 隔离", () => {
    it("should isolate breakers between different providers", async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));
      const successFn = vi.fn().mockResolvedValue("ok");

      for (let i = 0; i < 3; i++) {
        await expect(executeThroughCircuit("provider-a", failingFn)).rejects.toThrow("fail");
      }

      const breakerA = getCircuitBreaker("provider-a");
      expect(breakerA.state).toBe("open");
      expect(getCircuitState("provider-b")).toBe("closed");

      await expect(executeThroughCircuit("provider-b", successFn)).resolves.toBe("ok");
    });
  });
});
