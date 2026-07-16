/**
 * 完成通知工具 — notify_completion
 *
 * 设置任务完成/失败时的通知偏好。支持事件类型、是否启用、通知方式。
 * 配置持久化到 agent.notificationPrefs，下次启动仍生效。
 *
 * 设计要点：
 * - 通知偏好通过 @/shared/file-http 的 getConfig/setConfig 持久化
 * - 按事件类型分组存储，已有偏好时合并存储
 * - 失败时返回友好错误信息
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";

/** 设置通知偏好 */
export const notifyCompletionTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "notify_completion",
      description:
        "设置任务完成/失败时的通知偏好。支持事件类型（视频完成 / 失败 / 全部）、是否启用、通知方式（声音 / 桌面通知 / 两者）。" +
        "配置持久化到 agent.notificationPrefs，下次启动仍生效。",
      parameters: {
        type: "object",
        properties: {
          eventType: {
            type: "string",
            enum: ["video_completed", "video_failed", "all"],
            description: "监听的事件类型：视频完成 / 视频失败 / 全部",
          },
          enabled: { type: "boolean", description: "是否启用通知" },
          method: {
            type: "string",
            enum: ["sound", "desktop_notification", "both"],
            description: "通知方式，默认 desktop_notification",
            default: "desktop_notification",
          },
        },
        required: ["eventType", "enabled"],
      },
    },
  },
  domain: "monitor",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const eventType = String(args.eventType) as "video_completed" | "video_failed" | "all";
    const enabled = Boolean(args.enabled);
    const method = String(args.method || "desktop_notification") as
      | "sound"
      | "desktop_notification"
      | "both";

    try {
      const { getConfig, setConfig } = await import("@/shared/file-http");
      const existing = (await getConfig("agent.notificationPrefs")) as
        | Record<string, unknown>
        | null;
      const prefs = (existing && typeof existing === "object" ? existing : {}) as Record<
        string,
        unknown
      >;

      // 按事件类型分组存储
      prefs[eventType] = { enabled, method, updatedAt: Date.now() };

      const ok = await setConfig("agent.notificationPrefs", prefs);
      if (!ok) {
        return { success: false, error: "保存通知偏好失败：setConfig 返回 false" };
      }

      return {
        success: true,
        data: {
          configured: true,
          eventType,
          enabled,
          method,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `设置通知偏好失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
