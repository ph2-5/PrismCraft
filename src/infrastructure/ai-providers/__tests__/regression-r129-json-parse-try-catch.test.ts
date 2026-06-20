/**
 * R129: JSON.parse 必须 try/catch
 * 回归防护: 确保 processPendingQueue 中 JSON.parse(request.payload) 包裹 try/catch，
 *           解析失败时标记任务为永久失败（status='failed'），
 *           不应让异常传播导致整个队列处理中断，
 *           应记录 warn 日志，
 *           一个任务损坏不应影响后续任务处理。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock safeRun/safeQuery 以控制数据库操作
const { mockSafeRun, mockSafeQuery, mockErrorLogger, mockIsOnline } = vi.hoisted(() => ({
  mockSafeRun: vi.fn().mockResolvedValue({ changes: 1 }),
  mockSafeQuery: vi.fn().mockResolvedValue([]),
  mockErrorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  mockIsOnline: vi.fn(() => true),
}));

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeRun: mockSafeRun,
  safeQuery: mockSafeQuery,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
  extractErrorMessage: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
}));

// Mock offline-queue-utils 以控制 isOnline、MAX_RETRY_COUNT 等
vi.mock("../offline-queue-utils", () => ({
  MAX_RETRIES: 3,
  MAX_RETRY_COUNT: 5,
  calculateRetryDelay: vi.fn(() => 5000),
  deduplicationCache: new Map(),
  DEDUPE_TTL_MS: 600000,
  pruneDeduplicationCache: vi.fn(),
  isOnline: mockIsOnline,
  priorityValue: vi.fn((p: string) => (p === "critical" ? 3 : p === "normal" ? 2 : 1)),
  computeDeduplicationKey: vi.fn(() => "key"),
  isPermanentError: vi.fn(() => false),
  getAdaptiveInterval: vi.fn(() => 5000),
}));

// Mock network.config（offline-queue-utils 依赖）
vi.mock("@/infrastructure/network/network.config", () => ({
  NETWORK_CONFIG: {
    offlineQueue: {
      processingInterval: 5000,
      maxRetries: 3,
      deduplication: false,
    },
  },
}));

import { processPendingQueue } from "../offline-queue-ops";

/** 构造 QueuedRequest 对象 */
function makeRequest(overrides: Partial<{
  id: string;
  type: string;
  payload: string;
  status: string;
  retryCount: number;
  createdAt: number;
  lastAttemptAt: number | null;
  nextRetryAt: number | null;
  error: string | null;
  priority: string;
}> = {}): Record<string, unknown> {
  return {
    id: "req-1",
    type: "image_generation",
    payload: JSON.stringify({ prompt: "test" }),
    status: "pending",
    retryCount: 0,
    createdAt: Math.floor(Date.now() / 1000),
    lastAttemptAt: null,
    nextRetryAt: null,
    error: null,
    priority: "normal",
    ...overrides,
  };
}

describe("R129: JSON.parse 必须 try/catch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline.mockReturnValue(true);
    mockSafeRun.mockResolvedValue({ changes: 1 });
    mockSafeQuery.mockResolvedValue([]);
  });

  it("payload 为合法 JSON 时应正常处理", async () => {
    // safeQuery 第一次调用返回 pending 请求列表
    mockSafeQuery.mockResolvedValueOnce([
      makeRequest({ id: "req-valid", payload: JSON.stringify({ prompt: "hello" }) }),
    ]);

    const processor = vi.fn().mockResolvedValue(true);
    const processed = await processPendingQueue(processor);

    // processor 应被调用一次，参数为解析后的 payload
    expect(processor).toHaveBeenCalledTimes(1);
    expect(processor).toHaveBeenCalledWith("image_generation", { prompt: "hello" });
    // 应标记为完成
    expect(processed).toBe(1);
  });

  it("payload 为损坏的 JSON 时应标记任务为 failed", async () => {
    const corruptedPayload = "{invalid json!!!";
    mockSafeQuery.mockResolvedValueOnce([
      makeRequest({ id: "req-corrupted", payload: corruptedPayload }),
    ]);

    const processor = vi.fn().mockResolvedValue(true);
    await processPendingQueue(processor);

    // processor 不应被调用（因为 payload 解析失败）
    expect(processor).not.toHaveBeenCalled();

    // 应调用 safeRun 标记任务为 failed，且 retry_count 设为 MAX_RETRY_COUNT
    const failedCall = mockSafeRun.mock.calls.find(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("status = 'failed'") &&
        call[0].includes("retry_count = ?"),
    );
    expect(failedCall).toBeDefined();
    // 参数应包含 MAX_RETRY_COUNT (5) 和请求 id
    expect(failedCall![1]).toContain(5);
    expect(failedCall![1]).toContain("req-corrupted");
  });

  it("payload 解析失败时不应抛出异常", async () => {
    const corruptedPayload = "not json at all";
    mockSafeQuery.mockResolvedValueOnce([
      makeRequest({ id: "req-corrupted", payload: corruptedPayload }),
    ]);

    const processor = vi.fn().mockResolvedValue(true);

    // 不应抛出异常
    await expect(processPendingQueue(processor)).resolves.not.toThrow();
  });

  it("payload 解析失败时应记录 warn 日志", async () => {
    const corruptedPayload = "{broken";
    mockSafeQuery.mockResolvedValueOnce([
      makeRequest({ id: "req-corrupted", payload: corruptedPayload }),
    ]);

    const processor = vi.fn().mockResolvedValue(true);
    await processPendingQueue(processor);

    // 应调用 errorLogger.warn 记录解析失败
    expect(mockErrorLogger.warn).toHaveBeenCalled();
    // warn 调用应包含 payload 解析失败相关的信息
    const warnCall = mockErrorLogger.warn.mock.calls.find(
      (call) => {
        const arg = call[0];
        return typeof arg === "object" && arg !== null &&
          "code" in arg && (arg as { code: string }).code === "OFFLINE_QUEUE_PAYLOAD_PARSE_FAILED";
      },
    );
    expect(warnCall).toBeDefined();
  });

  it("一个任务 payload 损坏不应影响后续任务处理", async () => {
    mockSafeQuery.mockResolvedValueOnce([
      makeRequest({ id: "req-corrupted", payload: "{broken json" }),
      makeRequest({ id: "req-valid", payload: JSON.stringify({ prompt: "valid" }) }),
    ]);

    const processor = vi.fn().mockResolvedValue(true);
    const processed = await processPendingQueue(processor);

    // 损坏的任务不应调用 processor
    // 但有效的任务应正常处理
    expect(processor).toHaveBeenCalledTimes(1);
    expect(processor).toHaveBeenCalledWith("image_generation", { prompt: "valid" });
    // 有效任务应被标记为完成
    expect(processed).toBe(1);

    // 损坏任务应被标记为 failed
    const failedCall = mockSafeRun.mock.calls.find(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("status = 'failed'") &&
        call[0].includes("retry_count = ?") &&
        call[1]?.includes("req-corrupted"),
    );
    expect(failedCall).toBeDefined();
  });
});
