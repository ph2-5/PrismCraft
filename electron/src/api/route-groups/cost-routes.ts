/**
 * cost-routes.ts — 成本追踪路由组（cost-tracking P1）
 *
 * 设计来源：docs/DESIGN-COST-TRACKING.md §任务 3（看板数据源）
 * 提供：GET /api/usage/summary（时间范围双口径汇总 + 提供商/方向分组）
 * 失败语义：聚合失败返回零值（看板显示空态，不阻塞页面）
 */
import type { Route } from "../types";
import { defineRoute } from "../types";
import { getLogger } from "../../logging";
import { ensureDbInitialized } from "../../handlers/database";
import { summarizeUsage } from "../../database/usage-repository";
import { usageSummarySchema } from "../schemas";

const logger = getLogger("cost-routes");

export const costRoutes: Record<string, Route> = {
  "usage/summary": defineRoute({
    schema: usageSummarySchema,
    handler: async (_method, body) => {
      const { from, to } = body;
      try {
        await ensureDbInitialized();
        const summary = summarizeUsage(from, to);
        return { success: true, data: summary };
      } catch (error) {
        logger.error("[usage] summary failed:", error instanceof Error ? error : new Error(String(error)));
        return {
          success: true, // 看板降级为空态，不报错阻塞页面
          data: { totalEstimatedCost: 0, effectiveCost: 0, failedCost: 0, recordCount: 0, byProvider: [], byDirection: [] },
        };
      }
    },
    methods: ["POST"],
  }),
};
