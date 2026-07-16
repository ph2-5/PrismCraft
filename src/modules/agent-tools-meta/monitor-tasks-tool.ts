/**
 * 任务监控工具 — monitor_tasks
 *
 * 监控所有视频生成任务的进度。返回总数 + 活跃/已完成/失败计数 + 任务列表（精简字段）。
 *
 * 设计要点：
 * - 通过 container.videoTaskStorage 查询（与 video-tools.ts 一致）
 * - active 状态合并 pending/generating/retrying 并去重
 * - failed 状态合并 failed 和 timeout
 * - 列表返回精简字段并截断 prompt（避免 token 浪费）
 * - 聚合计数始终基于全量数据
 *
 * 特权访问声明：本文件通过 DI container 直接访问 videoTaskStorage，
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";
import type { VideoTask } from "@/domain/schemas";
import { truncatePrompt, isActiveTask, isFailedTask, toTimestamp } from "./monitor-tools-shared";

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
