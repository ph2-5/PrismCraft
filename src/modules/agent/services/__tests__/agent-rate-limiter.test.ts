import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentRateLimiter } from "../agent-rate-limiter";

describe("AgentRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("maxPerMinute <= 0 或 pendingCount === 0 时直接返回", async () => {
    const limiter = new AgentRateLimiter();
    await expect(limiter.enforce(0, { maxPerMinute: 10 })).resolves.toBeUndefined();
    await expect(limiter.enforce(5, { maxPerMinute: 0 })).resolves.toBeUndefined();
  });

  it("窗口内未超限时立即返回", async () => {
    const limiter = new AgentRateLimiter();
    limiter.record(2);
    const onWaiting = vi.fn();
    await limiter.enforce(2, { maxPerMinute: 10, onWaiting });
    expect(onWaiting).not.toHaveBeenCalled();
  });

  it("超限时等待至最早时间戳滑出窗口并触发 onWaiting", async () => {
    const limiter = new AgentRateLimiter();
    const now = Date.now();
    limiter.record(8); // 8 次在窗口内
    const onWaiting = vi.fn();

    const promise = limiter.enforce(3, { maxPerMinute: 10, onWaiting }); // 8+3 > 10 → 等待
    await vi.advanceTimersByTimeAsync(61_000);

    await expect(promise).resolves.toBeUndefined();
    expect(onWaiting).toHaveBeenCalledWith(expect.any(Number));
    // 等待结束后重新计时
    expect(Date.now()).toBeGreaterThanOrEqual(now + 60_000);
  });

  it("等待期间收到 abort 信号立即返回", async () => {
    const limiter = new AgentRateLimiter();
    limiter.record(8);
    const controller = new AbortController();

    const promise = limiter.enforce(3, { maxPerMinute: 10, signal: controller.signal });
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).resolves.toBeUndefined();
  });

  it("record 累计时间戳影响后续 enforce 判断", async () => {
    const limiter = new AgentRateLimiter();
    limiter.record(9);
    const onWaiting = vi.fn();
    const promise = limiter.enforce(2, { maxPerMinute: 10, onWaiting }); // 9+2 > 10 → 等待
    await vi.advanceTimersByTimeAsync(61_000);
    await expect(promise).resolves.toBeUndefined();
    expect(onWaiting).toHaveBeenCalled();
  });
});
