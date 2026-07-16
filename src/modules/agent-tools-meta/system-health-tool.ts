/**
 * 系统健康检查工具 — diagnose_system_health
 *
 * 全面诊断：检查 API 配置状态、磁盘空间、视频任务状态、缓存目录。
 *
 * 设计要点：
 * - depth=quick（仅 API）/ standard（API + 磁盘 + 任务）/ thorough（全部 + 缓存）
 * - 每个检查项抽为独立小函数，自带 try/catch，互不影响
 * - 按严重程度聚合计算 overallHealth
 *
 * 特权访问声明：本文件通过 DI container 直接访问 videoTaskStorage，
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";

type CheckStatus = "healthy" | "warning" | "critical";
type Depth = "quick" | "standard" | "thorough";

interface HealthCheck {
  name: string;
  status: CheckStatus;
  message: string;
  detail?: unknown;
}

// ============= 各检查项独立函数 =============

/** 检查 API 配置状态（始终执行） */
async function checkApiConfig(): Promise<HealthCheck> {
  try {
    const { checkConfigStatus } = await import("@/shared/api-config");
    const status = await checkConfigStatus();
    const caps = ["text", "image", "vision", "video"] as const;
    const configured = caps.filter((c) => status.capabilities[c]?.configured);
    const missing = caps.filter((c) => !status.capabilities[c]?.configured);

    if (missing.length === 0) {
      return {
        name: "api_config",
        status: "healthy",
        message: "所有能力（text/image/vision/video）均已配置",
        detail: { configured: configured.length, missing: [] },
      };
    }
    if (configured.length === 0) {
      return {
        name: "api_config",
        status: "critical",
        message: `未配置任何 API 能力（缺失：${missing.join("/")}）`,
        detail: { configured: 0, missing },
      };
    }
    return {
      name: "api_config",
      status: "warning",
      message: `部分能力未配置：${missing.join("/")}`,
      detail: { configured: configured.length, missing },
    };
  } catch (e) {
    return {
      name: "api_config",
      status: "critical",
      message: `检查 API 配置失败：${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** 检查磁盘空间（standard / thorough 才执行） */
async function checkDiskSpace(): Promise<HealthCheck> {
  try {
    const { getCacheDirectory, getDiskSpace } = await import("@/shared/file-http");
    const cacheResult = await getCacheDirectory();
    if (!cacheResult?.success || !cacheResult.path) {
      return {
        name: "disk_space",
        status: "warning",
        message: cacheResult?.error || "无法获取缓存目录",
      };
    }
    const disk = await getDiskSpace(cacheResult.path);
    if (!disk?.success || disk.availableBytes === undefined || disk.totalBytes === undefined) {
      return {
        name: "disk_space",
        status: "warning",
        message: disk?.error || "无法获取磁盘空间信息",
      };
    }
    const ratio = disk.availableBytes / disk.totalBytes;
    const availableGB = (disk.availableBytes / 1024 / 1024 / 1024).toFixed(2);
    const totalGB = (disk.totalBytes / 1024 / 1024 / 1024).toFixed(2);
    let status: CheckStatus = "healthy";
    let message: string;
    if (ratio < 0.05) {
      status = "critical";
      message = `磁盘空间严重不足：可用 ${availableGB} GB / 总 ${totalGB} GB（< 5%）`;
    } else if (ratio < 0.15) {
      status = "warning";
      message = `磁盘空间较低：可用 ${availableGB} GB / 总 ${totalGB} GB`;
    } else {
      status = "healthy";
      message = `磁盘空间充足：可用 ${availableGB} GB / 总 ${totalGB} GB`;
    }
    return {
      name: "disk_space",
      status,
      message,
      detail: { availableBytes: disk.availableBytes, totalBytes: disk.totalBytes },
    };
  } catch (e) {
    return {
      name: "disk_space",
      status: "warning",
      message: `检查磁盘空间失败：${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** 检查视频任务状态（standard / thorough 才执行） */
async function checkVideoTasks(): Promise<HealthCheck> {
  try {
    const storage = container.videoTaskStorage;
    const allTasks = await storage.getVideoTasks();
    const active = allTasks.filter(
      (t) => t.status === "pending" || t.status === "generating" || t.status === "retrying",
    ).length;
    const failed = allTasks.filter(
      (t) => t.status === "failed" || t.status === "timeout",
    ).length;

    if (failed > 5) {
      return {
        name: "video_tasks",
        status: "warning",
        message: `视频任务存在较多失败（${failed} 个失败 / ${active} 个活跃 / 共 ${allTasks.length} 个）`,
        detail: { active, failed, total: allTasks.length },
      };
    }
    return {
      name: "video_tasks",
      status: "healthy",
      message: `视频任务状态正常（${active} 个活跃 / ${failed} 个失败 / 共 ${allTasks.length} 个）`,
      detail: { active, failed, total: allTasks.length },
    };
  } catch (e) {
    return {
      name: "video_tasks",
      status: "warning",
      message: `检查视频任务失败：${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** 检查缓存目录可用性（仅 thorough 才执行） */
async function checkCacheDirectory(): Promise<HealthCheck> {
  try {
    const { getCacheDirectory, fileExists } = await import("@/shared/file-http");
    const cacheResult = await getCacheDirectory();
    if (!cacheResult?.success || !cacheResult.path) {
      return {
        name: "cache_directory",
        status: "warning",
        message: cacheResult?.error || "无法获取缓存目录",
      };
    }
    const exists = await fileExists(cacheResult.path);
    return {
      name: "cache_directory",
      status: exists ? "healthy" : "warning",
      message: exists
        ? `缓存目录可访问：${cacheResult.path}`
        : `缓存目录不存在或不可访问：${cacheResult.path}`,
      detail: { path: cacheResult.path, exists },
    };
  } catch (e) {
    return {
      name: "cache_directory",
      status: "warning",
      message: `检查缓存目录失败：${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** 系统健康检查（全面诊断） */
export const diagnoseSystemHealthTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "diagnose_system_health",
      description:
        "系统健康检查（全面诊断）。检查 API 配置状态、磁盘空间、视频任务状态、缓存目录。" +
        "depth=quick（仅 API）/ standard（API + 磁盘 + 任务）/ thorough（全部 + 缓存）。" +
        "返回 overallHealth（healthy/warning/critical）和 checks 列表。",
      parameters: {
        type: "object",
        properties: {
          depth: {
            type: "string",
            enum: ["quick", "standard", "thorough"],
            description: "检查深度，默认 standard",
            default: "standard",
          },
        },
      },
    },
  },
  domain: "diagnostic",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const depth = String(args.depth || "standard") as Depth;
    const checks: HealthCheck[] = [];

    // 1. 始终检查 API 配置状态
    checks.push(await checkApiConfig());

    // 2-3. standard / thorough 才检查磁盘空间和视频任务
    if (depth !== "quick") {
      checks.push(await checkDiskSpace());
      checks.push(await checkVideoTasks());
    }

    // 4. thorough 才检查缓存目录
    if (depth === "thorough") {
      checks.push(await checkCacheDirectory());
    }

    // 计算总体健康状态
    const hasCritical = checks.some((c) => c.status === "critical");
    const hasWarning = checks.some((c) => c.status === "warning");
    const overallHealth: CheckStatus = hasCritical
      ? "critical"
      : hasWarning
        ? "warning"
        : "healthy";

    return {
      success: true,
      data: {
        overallHealth,
        depth,
        checks,
        summary: {
          total: checks.length,
          healthy: checks.filter((c) => c.status === "healthy").length,
          warning: checks.filter((c) => c.status === "warning").length,
          critical: checks.filter((c) => c.status === "critical").length,
        },
      },
    };
  },
};
