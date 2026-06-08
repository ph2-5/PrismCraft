import { describe, it, expect } from "vitest";
import { SmartRetryEngine, createRetryEngine } from "@/modules/video";
import type { VideoTask } from "@/domain/schemas";
import type { RetryDecision } from "../../types/video-recovery-types";

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
      attempt!,
    ));
    expect(delays[1]!).toBeGreaterThan(delays[0]!);
    expect(delays[2]!).toBeGreaterThan(delays[1]!);
  });

  it("createRetryEngine 应创建独立实例", () => {
    const engine1 = createRetryEngine({ maxRetries: 5 });
    const engine2 = createRetryEngine({ maxRetries: 10 });
    expect(engine1).not.toBe(engine2);
  });
});

describe("SmartRetryEngine 错误分类组合", () => {
  it("errorCode 和 errorMessage 同时存在时 errorCode 应优先", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({
      status: "failed",
      message: "rate limit exceeded",
    });
    const verification = {
      isValid: false,
      reason: "verification failed",
      confidence: "medium" as const,
      details: {
        apiStatus: "TIMEOUT_ERROR",
        errorMessage: "rate limit exceeded",
      },
    } as unknown as Parameters<typeof engine.makeRetryDecision>[1];

    const decision = engine.makeRetryDecision(task, verification, 0);

    expect(decision.errorCategory).toBe("timeout");
  });

  it("errorCode 为空但 errorMessage 包含 timeout 关键词时应正确分类", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({
      status: "failed",
      message: "Request timeout after 30s",
    });
    const decision = engine.makeRetryDecision(task);

    expect(decision.errorCategory).toBe("timeout");
  });

  it("多个 pattern 同时匹配时应使用第一个匹配", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({
      status: "failed",
      message: "timeout and rate limit both occurred",
    });
    const decision = engine.makeRetryDecision(task);

    expect(decision.errorCategory).toBe("timeout");
  });

  it("未知 errorCode 和无匹配 errorMessage 应分类为 unknown", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({
      status: "failed",
      message: "Something went wrong",
    });
    const verification = {
      isValid: false,
      reason: "verification failed",
      confidence: "medium" as const,
      details: {
        apiStatus: "SOME_NEW_ERROR",
        errorMessage: "Something went wrong",
      },
    } as unknown as Parameters<typeof engine.makeRetryDecision>[1];

    const decision = engine.makeRetryDecision(task, verification, 0);

    expect(decision.errorCategory).toBe("unknown");
  });

  it("errorCode 为 null 时应回退到 errorMessage 匹配", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({
      status: "failed",
      message: "Connection timeout",
    });
    const decision = engine.makeRetryDecision(task);

    expect(decision.errorCategory).toBe("timeout");
  });

  it("errorMessage 为 null 且 errorCode 为 null 时应分类为 unknown", () => {
    const engine = new SmartRetryEngine();
    const task = createMockTask({
      status: "failed",
      message: "",
    });
    const decision = engine.makeRetryDecision(task);

    expect(decision.errorCategory).toBe("unknown");
  });

  it("getRecommendedRetryDelay 对不同错误类型应返回不同延迟", () => {
    const engine = new SmartRetryEngine({ baseDelayMs: 1000, maxDelayMs: 300000, jitter: false });

    const timeoutDecision: RetryDecision = {
      shouldRetry: true,
      reason: "timeout",
      errorCategory: "timeout",
      confidence: "medium",
      retryAfterMs: 1000,
      tokenWasteRisk: "low",
    };
    const rateLimitDecision: RetryDecision = {
      shouldRetry: true,
      reason: "rate limit",
      errorCategory: "rate_limit",
      confidence: "high",
      retryAfterMs: 60000,
      tokenWasteRisk: "low",
    };

    const timeoutDelay = engine.getRecommendedRetryDelay(timeoutDecision, 0);
    const rateLimitDelay = engine.getRecommendedRetryDelay(rateLimitDecision, 0);

    expect(timeoutDelay).toBe(1000);
    expect(rateLimitDelay).toBe(60000);
    expect(rateLimitDelay).toBeGreaterThan(timeoutDelay);
  });

  it("连续重试后延迟应指数增长", () => {
    const engine = new SmartRetryEngine({ baseDelayMs: 1000, maxDelayMs: 300000, jitter: false });

    const delays = [0, 1, 2, 3, 4].map((attempt) =>
      engine.getRecommendedRetryDelay(
        { shouldRetry: true, reason: "", errorCategory: "unknown", confidence: "low", tokenWasteRisk: "low" },
        attempt,
      ),
    );

    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
    }

    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBe(2000);
    expect(delays[2]).toBe(4000);
  });
});
