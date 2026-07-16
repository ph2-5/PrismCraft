/**
 * 进度观察工具 — watch_progress
 *
 * 实时查看指定视频任务的详细进度。先从本地存储读取，若任务处于活跃状态
 * （pending/generating/retrying），会向 provider 实时查询最新状态并返回 ETA 与进度。
 *
 * 设计要点：
 * - 已完成 / 已失败任务直接返回本地状态（不查询 provider）
 * - 活跃任务向 container.videoProvider 实时查询
 * - provider 查询失败 / 异常时不阻断，返回本地状态 + 警告
 * - provider 返回的 videoUrl 优先于本地
 *
 * 重构说明：
 * 原始 execute 中的 ETA 估算嵌套分支（圈复杂度 >15）已拆为独立函数 estimateEta，
 * 保持行为不变。
 *
 * 特权访问声明：本文件通过 DI container 直接访问 videoTaskStorage 与 videoProvider，
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";
import type { VideoTask } from "@/domain/schemas";
import { isActiveTask, toTimestamp } from "./monitor-tools-shared";

// ============= 辅助函数 =============

/**
 * 估算任务剩余时间（ETA）
 *
 * 基于进度百分比和已耗时推算总时长，再计算剩余时间并格式化。
 * - progress <= 0 或 >= 100 时返回 undefined（无法估算）
 * - 创建时间无效或已耗时不正常时返回 undefined
 * - 剩余 < 60s 显示秒，< 3600s 显示分钟，否则显示小时
 */
function estimateEta(
  progress: number,
  createdAt: VideoTask["createdAt"],
): string | undefined {
  if (progress <= 0 || progress >= 100) return undefined;

  const createdMs = toTimestamp(createdAt);
  const elapsedMs = Date.now() - createdMs;
  if (elapsedMs <= 0) return undefined;

  const estimatedTotalMs = elapsedMs / (progress / 100);
  const remainingMs = Math.max(0, estimatedTotalMs - elapsedMs);
  const remainingSec = Math.ceil(remainingMs / 1000);

  if (remainingSec < 60) {
    return `${remainingSec}s`;
  }
  if (remainingSec < 3600) {
    return `${Math.ceil(remainingSec / 60)}m`;
  }
  return `${Math.ceil(remainingSec / 3600)}h`;
}

// ============= 工具实现 =============

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
        const eta = estimateEta(progress, task.createdAt);

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
