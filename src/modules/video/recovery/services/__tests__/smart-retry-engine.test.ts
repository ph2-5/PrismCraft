import { describe, it, expect } from "vitest";
import { SmartRetryEngine, createRetryEngine } from "@/modules/video";
import type { VideoTask } from "@/domain/schemas";

function createMockTask(overrides: Partial<VideoTask> = {}): VideoTask {
  return {
    taskId: "task-1",
    status: "failed",
    progress: 0,
    message: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as VideoTask;
}

describe("SmartRetryEngine", () => {
  it("已达到最大重试次数不应重试", () => {
    const engine = new SmartRetryEngine({ maxRetries: 3 });
    const task = createMockTask({ status: "failed", message: "unknown error" });
    const decision = engine.makeRetryDecision(task, undefined, 3);
    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toContain("最大重试次数");
  });

  it("已完成的任务不应重试", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({ status: "completed", videoUrl: "https://example.com/video.mp4" });
    const decision = engine.makeRetryDecision(task);
    expect(decision.shouldRetry).toBe(false);
  });

  it("超时任务应重试", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({ status: "failed", message: "timeout: request took too long" });
    const decision = engine.makeRetryDecision(task);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.retryAfterMs).toBeGreaterThan(0);
  });

  it("限流任务应重试且延迟较长", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({ status: "failed", message: "rate limit exceeded" });
    const decision = engine.makeRetryDecision(task);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.retryAfterMs).toBeGreaterThanOrEqual(60000);
  });

  it("余额不足不应重试", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({ status: "failed", message: "quota exceeded" });
    const decision = engine.makeRetryDecision(task);
    expect(decision.shouldRetry).toBe(false);
    expect(decision.tokenWasteRisk).toBe("high");
  });

  it("参数错误不应重试", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({ status: "failed", message: "invalid parameters" });
    const decision = engine.makeRetryDecision(task);
    expect(decision.shouldRetry).toBe(false);
  });

  it("网络错误应重试", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({ status: "failed", message: "network error" });
    const decision = engine.makeRetryDecision(task);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.tokenWasteRisk).toBe("low");
  });

  it("处理中的任务不应立即重试", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({ status: "generating", createdAt: new Date().toISOString() });
    const decision = engine.makeRetryDecision(task);
    expect(decision.shouldRetry).toBe(false);
  });

  it("超过2小时的任务不应重试", () => {
    const engine = new SmartRetryEngine();
    const oldDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const task = createMockTask({ status: "failed", createdAt: oldDate, message: "unknown" });
    const decision = engine.makeRetryDecision(task);
    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toContain("超时");
  });

  it("验证失败但标记完成的任务应重试", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({ status: "completed", videoUrl: "https://example.com/video.mp4" });
    const decision = engine.makeRetryDecision(task, {
      isValid: false,
      reason: "content validation failed",
      confidence: "medium",
      details: { apiStatus: "ok", urlAccessible: true, contentValid: false },
    } as unknown as Parameters<typeof engine.makeRetryDecision>[1]);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.reason).toContain("验证失败");
  });

  it("指数退避应递增延迟", () => {
    const engine = new SmartRetryEngine({ baseDelayMs: 1000, maxDelayMs: 60000, jitter: false });
    const delays = [0, 1, 2].map(attempt => engine.getRecommendedRetryDelay(
      { shouldRetry: true, reason: "", confidence: "low", tokenWasteRisk: "low" },
      attempt,
    ));
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(delays[2]).toBeGreaterThan(delays[1]);
  });

  it("createRetryEngine 应创建独立实例", () => {
    const engine1 = createRetryEngine({ maxRetries: 5 });
    const engine2 = createRetryEngine({ maxRetries: 10 });
    expect(engine1).not.toBe(engine2);
  });
});
