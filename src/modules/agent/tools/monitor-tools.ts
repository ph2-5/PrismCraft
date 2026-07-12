/**
 * 监控/通知工具（Monitor Tools）
 *
 * 包含工具：
 * - monitor_tasks：监控所有视频任务进度（按状态聚合 + 列表）
 * - notify_completion：设置通知偏好（事件类型 / 启用 / 通知方式）
 * - get_activity_log：获取活动日志（支持按类型 / 时间过滤 + 分页）
 * - watch_progress：实时查看指定任务进度（本地 + provider 实时状态）
 * - get_error_history：获取错误历史（来自 errorLogStorage）
 *
 * 设计要点：
 * - 视频任务通过 container.videoTaskStorage 查询（与 video-tools.ts 一致）
 * - 通知偏好 / 活动日志通过 @/shared/file-http 的 getConfig/setConfig 持久化
 * - 错误历史优先用 container.errorLogStorage；不可用时降级到配置存储
 * - 列表返回精简字段并截断 prompt（避免 token 浪费）
 * - 错误处理完善，存储失败时返回友好错误信息
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import { container } from "@/infrastructure/di";
import type { VideoTask } from "@/domain/schemas";

// ============= 辅助函数 =============

/** 截断 prompt 到指定长度，避免 token 浪费 */
function truncatePrompt(prompt: string | undefined, maxLen = 100): string | undefined {
  if (!prompt) return undefined;
  return prompt.length > maxLen ? `${prompt.slice(0, maxLen)}…` : prompt;
}

/** 判断任务是否处于活跃状态 */
function isActiveTask(task: VideoTask): boolean {
  return task.status === "pending" || task.status === "generating" || task.status === "retrying";
}

/** 判断任务是否处于失败状态 */
function isFailedTask(task: VideoTask): boolean {
  return task.status === "failed" || task.status === "timeout";
}

/** 安全解析时间戳（兼容 ISO 字符串 / 数字 / Unix 秒） */
function toTimestamp(value: string | number | undefined): number {
  if (!value) return 0;
  if (typeof value === "number") {
    // 数据库中可能是 Unix 秒
    return value < 1e12 ? value * 1000 : value;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

// ============= 工具实现 =============

/** 监控所有任务进度 */
export const monitorTasksTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "monitor_tasks",
      description:
        "监控所有视频生成任务的进度。返回总数 + 活跃/已完成/失败计数 + 任务列表（精简字段）。" +
        "适用于：用户要求「监控任务进度」、「查看正在进行的视频任务」、「有多少任务在跑」等场景。" +
        "status=active 返回 pending/generating/retrying 状态的任务；status=failed 包含 failed 和 timeout。",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["active", "completed", "failed", "all"],
            description: "按状态过滤，默认 active（活跃任务）。all 返回所有状态",
            default: "active",
          },
        },
      },
    },
  },
  domain: "monitor",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const status = args.status ? String(args.status) : "active";
    const storage = container.videoTaskStorage;

    let tasks: VideoTask[];
    try {
      if (status === "completed") {
        tasks = await storage.getVideoTasksByStatus("completed");
      } else if (status === "failed") {
        const [failed, timeout] = await Promise.all([
          storage.getVideoTasksByStatus("failed"),
          storage.getVideoTasksByStatus("timeout"),
        ]);
        tasks = [...failed, ...timeout];
      } else if (status === "all") {
        tasks = await storage.getVideoTasks();
      } else {
        // active: 优先用 getPendingVideoTasks，再补充 generating/retrying
        const [pending, generating, retrying] = await Promise.all([
          storage.getPendingVideoTasks(),
          storage.getVideoTasksByStatus("generating"),
          storage.getVideoTasksByStatus("retrying"),
        ]);
        const seen = new Set<string>();
        tasks = [];
        for (const t of [...pending, ...generating, ...retrying]) {
          if (!seen.has(t.taskId)) {
            seen.add(t.taskId);
            tasks.push(t);
          }
        }
      }
    } catch (e) {
      return {
        success: false,
        error: `查询视频任务失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // 按创建时间倒序（最新在前）
    tasks.sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));

    // 聚合计数（始终基于全量数据）
    let allTasks: VideoTask[];
    try {
      allTasks = await storage.getVideoTasks();
    } catch {
      allTasks = tasks;
    }
    const activeCount = allTasks.filter(isActiveTask).length;
    const completedCount = allTasks.filter((t) => t.status === "completed").length;
    const failedCount = allTasks.filter(isFailedTask).length;

    return {
      success: true,
      data: {
        totalTasks: allTasks.length,
        activeCount,
        completedCount,
        failedCount,
        filter: status,
        tasks: tasks.map((t) => ({
          taskId: t.taskId,
          prompt: truncatePrompt(t.prompt),
          status: t.status,
          progress: t.progress,
          createdAt: t.createdAt,
        })),
      },
    };
  },
};

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

/** 实时进度查看（查询指定任务的详细进度） */
export const watchProgressTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "watch_progress",
      description:
        "实时查看指定视频任务的详细进度。先从本地存储读取，若任务处于活跃状态（pending/generating/retrying），" +
        "会向 provider 实时查询最新状态并返回 ETA 与进度。" +
        "适用于：用户要求「查看这个任务的进度」、「这个任务还要多久」、「watch task xxx」等场景。",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "视频任务 ID（必填）", maxLength: 100 },
        },
        required: ["taskId"],
      },
    },
  },
  domain: "monitor",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const taskId = String(args.taskId);
    const storage = container.videoTaskStorage;

    let task: VideoTask | null;
    try {
      task = await storage.getVideoTaskById(taskId);
    } catch (e) {
      return {
        success: false,
        error: `查询任务失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    if (!task) {
      return { success: false, error: `视频任务不存在：${taskId}` };
    }

    // 已完成 / 已失败的直接返回本地状态
    if (!isActiveTask(task)) {
      return {
        success: true,
        data: {
          taskId,
          status: task.status,
          progress: task.progress,
          videoUrl: task.videoUrl,
          message: task.message || undefined,
          updatedAt: task.updatedAt,
        },
      };
    }

    // 活跃任务：向 provider 实时查询
    try {
      const result = await container.videoProvider.queryVideoStatus(taskId, {
        providerId: task.providerId,
        modelId: task.providerModelId,
        format: task.providerFormat,
      });

      if (result.success && result.data) {
        const statusData = result.data;
        const progress = statusData.progress ?? task.progress;
        // 简易 ETA 估算：基于进度百分比
        let eta: string | undefined;
        if (progress > 0 && progress < 100) {
          const createdMs = toTimestamp(task.createdAt);
          const elapsedMs = Date.now() - createdMs;
          if (elapsedMs > 0) {
            const estimatedTotalMs = elapsedMs / (progress / 100);
            const remainingMs = Math.max(0, estimatedTotalMs - elapsedMs);
            const remainingSec = Math.ceil(remainingMs / 1000);
            if (remainingSec < 60) {
              eta = `${remainingSec}s`;
            } else if (remainingSec < 3600) {
              eta = `${Math.ceil(remainingSec / 60)}m`;
            } else {
              eta = `${Math.ceil(remainingSec / 3600)}h`;
            }
          }
        }

        return {
          success: true,
          data: {
            taskId,
            status: statusData.status,
            progress,
            videoUrl: statusData.videoUrl ?? task.videoUrl,
            eta,
            message: statusData.message || task.message || undefined,
            updatedAt: task.updatedAt,
          },
        };
      }

      // provider 查询失败，返回本地状态 + 警告
      return {
        success: true,
        data: {
          taskId,
          status: task.status,
          progress: task.progress,
          message: task.message || undefined,
          warning: result.error || "provider 实时查询失败，显示本地缓存状态",
          updatedAt: task.updatedAt,
        },
      };
    } catch (e) {
      // 查询异常不阻断，返回本地状态
      return {
        success: true,
        data: {
          taskId,
          status: task.status,
          progress: task.progress,
          message: task.message || undefined,
          warning: `provider 查询异常：${e instanceof Error ? e.message : String(e)}`,
          updatedAt: task.updatedAt,
        },
      };
    }
  },
};

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

/** 导出所有监控工具 */
export const monitorTools: ToolImpl[] = [
  monitorTasksTool,
  notifyCompletionTool,
  getActivityLogTool,
  watchProgressTool,
  getErrorHistoryTool,
];
