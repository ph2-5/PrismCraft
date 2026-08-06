/**
 * usage-summary-service.test.ts — 成本看板数据服务测试（cost-tracking P1）
 *
 * 覆盖：成功解析 / 后端失败降级空态 / 网络异常不 throw / 请求体正确
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPost } = vi.hoisted(() => ({
  mockPost: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    apiClient: {
      post: (...args: unknown[]) => mockPost(...args),
    },
  },
}));

import { fetchUsageSummary, EMPTY_SUMMARY } from "../services/usage-summary-service";

describe("usage-summary-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sample = {
    totalEstimatedCost: 12.5,
    effectiveCost: 10,
    failedCost: 2.5,
    recordCount: 3,
    byProvider: [{ providerId: "kuaishou", cost: 10, effectiveCost: 8, count: 5 }],
    byDirection: [{ direction: "video", cost: 10, count: 5 }],
  };

  it("成功时解析后端汇总", async () => {
    mockPost.mockResolvedValueOnce({ ok: true, value: { success: true, data: sample } });
    const result = await fetchUsageSummary(1_700_000_000, 1_700_100_000);
    expect(result.totalEstimatedCost).toBe(12.5);
    expect(result.byProvider).toHaveLength(1);
    expect(result.byProvider[0].providerId).toBe("kuaishou");
  });

  it("后端返回 success:false 时降级空态", async () => {
    mockPost.mockResolvedValueOnce({ ok: true, value: { success: false, error: "boom" } });
    const result = await fetchUsageSummary(0, 1_800_000_000);
    expect(result).toEqual(EMPTY_SUMMARY);
  });

  it("Result err（网络失败）时返回空态且不 throw", async () => {
    mockPost.mockResolvedValueOnce({ ok: false, error: new Error("network down") });
    await expect(fetchUsageSummary(0, 1_800_000_000)).resolves.toEqual(EMPTY_SUMMARY);
  });

  it("请求体含时间范围（from/to），走 POST /api/usage/summary", async () => {
    mockPost.mockResolvedValueOnce({ ok: true, value: { success: true, data: EMPTY_SUMMARY } });
    await fetchUsageSummary(123, 456);
    const [endpoint, body] = mockPost.mock.calls[0];
    expect(endpoint).toBe("/api/usage/summary");
    expect(body).toEqual({ from: 123, to: 456 });
  });
});
