/**
 * 活动日志查询工具 — get_activity_log
 *
 * 获取活动日志（agent 执行记录的事件流）。支持按事件类型过滤、按起始时间过滤、分页。
 *
 * 设计要点：
 * - 日志通过 @/shared/file-http 的 getConfig 读取（agent.activityLog）
 * - 返回事件列表（timestamp/type/message/data）
 * - total 反映原始日志数量（过滤前）
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";

/** 获取活动日志 */
export const getActivityLogTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_activity_log",
      description:
        "获取活动日志（agent 执行记录的事件流）。支持按事件类型过滤、按起始时间过滤、分页。" +
        "返回事件列表（timestamp/type/message/data）。日志来自配置 agent.activityLog。",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "返回数量上限，默认 50，最大 200", default: 50, minimum: 1, maximum: 200 },
          eventType: { type: "string", description: "按事件类型过滤（如 video_completed、character_created）", maxLength: 200 },
          since: { type: "number", description: "Unix 毫秒时间戳，只返回此时间之后的事件" },
        },
      },
    },
  },
  domain: "monitor",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    try {
      const { getConfig } = await import("@/shared/file-http");
      const raw = (await getConfig("agent.activityLog")) as unknown;

      if (!Array.isArray(raw)) {
        return { success: true, data: { total: 0, events: [] } };
      }

      const limit = Math.min(Number(args.limit) || 50, 200);
      const eventType = args.eventType ? String(args.eventType) : undefined;
      const since = args.since ? Number(args.since) : undefined;

      // 过滤
      type EventEntry = {
        timestamp?: number;
        type?: string;
        message?: string;
        data?: unknown;
      };
      let events = raw as EventEntry[];
      if (eventType) {
        events = events.filter((e) => e?.type === eventType);
      }
      if (since !== undefined && !Number.isNaN(since)) {
        events = events.filter((e) => (e?.timestamp ?? 0) >= since);
      }

      // 倒序（最新在前）+ 分页
      events = events
        .slice()
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
        .slice(0, limit);

      return {
        success: true,
        data: {
          total: raw.length,
          filter: { eventType, since },
          events: events.map((e) => ({
            timestamp: e.timestamp ?? 0,
            type: e.type ?? "unknown",
            message: e.message ?? "",
            data: e.data,
          })),
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `获取活动日志失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
