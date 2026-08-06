/**
 * usage-summary-service.ts — 成本看板数据服务（cost-tracking P1）
 *
 * 与主进程 `POST /api/usage/summary` 通信。
 * 通过 DI 容器访问 apiClient（Result 模式，不 throw）——遵守 DDD 分层：
 * modules 层不直接依赖 infrastructure 子域内部实现。
 * 失败语义：返回零值汇总（看板显示空态），不 throw 阻塞页面。
 */
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";

/** 与主进程 usage-repository.summarizeUsage 返回结构一致 */
export interface UsageSummary {
  totalEstimatedCost: number;
  effectiveCost: number;
  failedCost: number;
  recordCount: number;
  byProvider: Array<{ providerId: string; cost: number; effectiveCost: number; count: number }>;
  byDirection: Array<{ direction: string; cost: number; count: number }>;
}

export const EMPTY_SUMMARY: UsageSummary = {
  totalEstimatedCost: 0,
  effectiveCost: 0,
  failedCost: 0,
  recordCount: 0,
  byProvider: [],
  byDirection: [],
};

interface SummaryResponse {
  success: boolean;
  data?: UsageSummary;
}

export async function fetchUsageSummary(from: number, to: number): Promise<UsageSummary> {
  try {
    const result = await container.apiClient.post<SummaryResponse>("/api/usage/summary", { from, to });
    if (result.ok && result.value.success && result.value.data) {
      return result.value.data;
    }
    return EMPTY_SUMMARY;
  } catch (e) {
    errorLogger.warn("fetch usage summary failed", e);
    return EMPTY_SUMMARY;
  }
}
