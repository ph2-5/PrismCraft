/**
 * 错误历史查询工具 — get_error_history
 *
 * 获取错误历史记录（来自 errorLogStorage，按时间倒序）。支持分页和按时间过滤。
 *
 * 设计要点：
 * - 优先用 container.errorLogStorage
 * - 数据库 timestamp 为 Unix 秒，统一转为毫秒
 * - 已按 id DESC 返回（最新在前），保持顺序
 *
 * 特权访问声明：本文件通过 DI container 直接访问 errorLogStorage，
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";

/** 获取错误历史 */
export const getErrorHistoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_error_history",
      description:
        "获取错误历史记录（来自 errorLogStorage，按时间倒序）。支持分页和按时间过滤。" +
        "返回错误列表（timestamp/error/context/resolved）。" +
        "适用于：用户要求「查看错误日志」、「最近有什么错误」、「get error history」等场景。",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "返回数量上限，默认 20，最大 200", default: 20, minimum: 1, maximum: 200 },
          since: { type: "number", description: "Unix 毫秒时间戳，只返回此时间之后的错误" },
        },
      },
    },
  },
  domain: "monitor",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const limit = Math.min(Number(args.limit) || 20, 200);
    const since = args.since ? Number(args.since) : undefined;

    try {
      const storage = container.errorLogStorage;
      const rawLogs = await storage.getErrorLogs<Record<string, unknown>>(limit);

      type ErrorEntry = {
        id?: number;
        message?: string;
        stack?: string;
        timestamp?: number;
        component?: string;
      };

      let logs = (rawLogs as ErrorEntry[]).map((r) => {
        // 数据库 timestamp 为 Unix 秒，统一转为毫秒
        const ts = r.timestamp ? r.timestamp * 1000 : 0;
        return {
          timestamp: ts,
          error: r.message || "",
          context: {
            component: r.component,
            stack: r.stack,
          },
          resolved: false,
        };
      });

      if (since !== undefined && !Number.isNaN(since)) {
        logs = logs.filter((e) => e.timestamp >= since);
      }

      // 已按 id DESC 返回（最新在前），保持顺序
      return {
        success: true,
        data: {
          total: logs.length,
          errors: logs,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `获取错误历史失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
