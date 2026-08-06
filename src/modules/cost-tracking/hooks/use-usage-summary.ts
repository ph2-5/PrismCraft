/**
 * use-usage-summary.ts — 成本看板数据 hook（cost-tracking P1）
 *
 * 状态管理选型（设计文档 §任务 3）：React Query 管服务端聚合数据（缓存/失效），
 * 时间范围筛选为瞬时 UI 态（页面内 useState），不引入 Zustand 全局态。
 */
import { useQuery } from "@tanstack/react-query";
import { fetchUsageSummary, type UsageSummary } from "../services/usage-summary-service";

export interface UsageSummaryRange {
  /** 时间范围（Unix 秒）；默认近 30 天 */
  from: number;
  to: number;
}

export function useUsageSummary(range: UsageSummaryRange) {
  return useQuery({
    queryKey: ["usage-summary", range.from, range.to],
    queryFn: () => fetchUsageSummary(range.from, range.to),
    staleTime: 60_000, // 1 分钟内不重复拉取
    placeholderData: (prev) => prev, // 切换时间范围时保留旧数据避免闪空
  });
}

/** 常见时间范围（用于页面 Tab 切换） */
export const RANGE_PRESETS = {
  week: { labelKey: "costTracking.range.week" as const },
  month: { labelKey: "costTracking.range.month" as const },
  quarter: { labelKey: "costTracking.range.quarter" as const },
} as const;

export type UsageSummaryData = UsageSummary;
