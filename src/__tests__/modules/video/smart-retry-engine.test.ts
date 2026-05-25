import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmartRetryEngine } from '@/modules/video/recovery';
import type { RetryConfig } from '@/modules/video/recovery';
import type { VideoTask } from '@/domain/schemas';

describe('SmartRetryEngine', () => {
  let engine: SmartRetryEngine;
  const defaultConfig: RetryConfig = {
    maxRetries: 60,
    baseDelayMs: 10000,
    maxDelayMs: 300000,
    exponentialBackoff: true,
    jitter: false,
  };

  const createMockTask = (overrides: Partial<VideoTask> = {}): VideoTask => ({
    taskId: 'test-task-1',
    status: 'pending',
    progress: 50,
    message: '',
    createdAt: new Date(Date.now() - 60000).toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    engine = new SmartRetryEngine(defaultConfig);
    vi.clearAllMocks();
  });

  describe('makeRetryDecision', () => {
    it('应该拒绝超过最大重试次数的任务', () => {
      const task = createMockTask({ status: 'failed' });

      const decision = engine.makeRetryDecision(task, undefined, 60);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toContain('最大重试次数');
    });

    it('不应该重试配额不足错误', () => {
      const task = createMockTask({
        status: 'failed',
        message: 'Insufficient quota',
      });

      const decision = engine.makeRetryDecision(task);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.tokenWasteRisk).toBe('high');
      expect(decision.confidence).toBe('high');
    });

    it('不应该重试参数错误', () => {
      const task = createMockTask({
        status: 'failed',
        message: 'Invalid parameters',
      });

      const decision = engine.makeRetryDecision(task);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.tokenWasteRisk).toBe('high');
    });

    it('应该重试超时错误', () => {
      const task = createMockTask({
        status: 'failed',
        message: 'Request timeout',
      });

      const decision = engine.makeRetryDecision(task);

      expect(decision.shouldRetry).toBe(true);
      expect(decision.reason).toContain('超时');
    });

    it('应该重试网络错误', () => {
      const task = createMockTask({
        status: 'failed',
        message: 'Network error',
      });

      const decision = engine.makeRetryDecision(task);

      expect(decision.shouldRetry).toBe(true);
    });

    it('应该重试服务端错误', () => {
      const task = createMockTask({
        status: 'failed',
        message: 'Internal server error',
      });

      const decision = engine.makeRetryDecision(task);

      expect(decision.shouldRetry).toBe(true);
    });

    it('应该等待速率限制', () => {
      const task = createMockTask({
        status: 'failed',
        message: 'Rate limit exceeded',
      });

      const decision = engine.makeRetryDecision(task);

      expect(decision.shouldRetry).toBe(true);
      expect(decision.retryAfterMs).toBeGreaterThanOrEqual(60000);
    });
  });

  describe('指数退避', () => {
    it('应该使用指数退避计算延迟', () => {
      const task = createMockTask({
        status: 'failed',
        message: 'Server error',
      });

      const decision0 = engine.makeRetryDecision(task, undefined, 0);
      expect(decision0.retryAfterMs).toBe(10000);

      const decision3 = engine.makeRetryDecision(task, undefined, 3);
      expect(decision3.retryAfterMs).toBe(80000);

      const decision10 = engine.makeRetryDecision(task, undefined, 10);
      expect(decision10.retryAfterMs).toBeLessThanOrEqual(300000);
    });

    it('不应该超过最大延迟', () => {
      const task = createMockTask({
        status: 'failed',
        message: 'Server error',
      });

      const decision = engine.makeRetryDecision(task, undefined, 20);

      expect(decision.retryAfterMs).toBeLessThanOrEqual(300000);
    });
  });

  describe('Token浪费风险评估', () => {
    it('应该正确评估高风险', () => {
      const task = createMockTask({
        status: 'failed',
        message: 'Invalid parameters',
      });

      const decision = engine.makeRetryDecision(task);

      expect(decision.tokenWasteRisk).toBe('high');
    });

    it('应该正确评估中风险', () => {
      const task = createMockTask({
        status: 'failed',
        message: 'Server error',
      });

      const decision = engine.makeRetryDecision(task);

      expect(['low', 'medium']).toContain(decision.tokenWasteRisk);
    });

    it('应该正确评估低风险', () => {
      const task = createMockTask({
        status: 'failed',
        message: 'Network error',
      });

      const decision = engine.makeRetryDecision(task);

      expect(decision.tokenWasteRisk).toBe('low');
    });
  });
});
