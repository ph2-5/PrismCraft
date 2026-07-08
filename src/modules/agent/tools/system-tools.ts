/**
 * 系统/项目工具（System Tools）
 *
 * 包含工具：
 * - get_project_stats：获取项目统计（角色数/场景数/故事数/视频任务状态）
 * - get_app_info：获取应用信息（版本/路径）
 * - get_disk_usage：获取磁盘使用情况
 *
 * 设计要点：
 * - 聚合多个模块的数据，一次性返回项目概览
 * - 用于 Agent 启动时注入 system prompt 的项目状态
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import { APP_VERSION } from "@/shared/constants/app-version";

/** 获取项目统计 */
export const getProjectStatsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_project_stats",
      description: "获取项目统计概览：角色数、场景数、故事数、视频任务状态、已配置能力。用于了解项目整体状态。",
      parameters: { type: "object", properties: {} },
    },
  },
  domain: "system",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute() {
    const stats = {
      characters: 0,
      scenes: 0,
      stories: 0,
      videoTasks: { active: 0, completed: 0, failed: 0, total: 0 },
      configuredCapabilities: [] as string[],
    };

    // 并行查询
    const [{ characterService }, { sceneService }] = await Promise.all([
      import("@/modules/character"),
      import("@/modules/scene"),
    ]);

    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);

    if (charResult.ok) stats.characters = charResult.value.length;
    if (sceneResult.ok) stats.scenes = sceneResult.value.length;

    // 视频任务统计（通过 store 直接读取，避免 hook 限制）
    try {
      const { useVideoTaskStore } = await import("@/modules/video/task-management");
      const store = useVideoTaskStore;
      const allTasks = store.getState().allTasks;
      stats.videoTasks = {
        active: allTasks.filter((t) => t.status === "pending" || t.status === "generating" || t.status === "retrying").length,
        completed: allTasks.filter((t) => t.status === "completed").length,
        failed: allTasks.filter((t) => t.status === "failed" || t.status === "timeout").length,
        total: allTasks.length,
      };
    } catch {
      // 视频任务模块未加载，忽略
    }

    // 已配置能力
    try {
      const { checkConfigStatus } = await import("@/shared/api-config");
      const status = await checkConfigStatus();
      const caps: string[] = [];
      if (status.text.configured) caps.push("text");
      if (status.image.configured) caps.push("image");
      if (status.vision.configured) caps.push("vision");
      if (status.video.configured) caps.push("video");
      stats.configuredCapabilities = caps;
    } catch {
      // 配置模块未加载，忽略
    }

    return { success: true, data: stats };
  },
};

/** 获取应用信息 */
export const getAppInfoTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_app_info",
      description: "获取应用信息：版本号、运行环境、可用工具数量等。",
      parameters: { type: "object", properties: {} },
    },
  },
  domain: "system",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute() {
    const { toolRegistry } = await import("../services/tool-registry");
    return {
      success: true,
      data: {
        version: APP_VERSION,
        platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        availableTools: toolRegistry.size(),
        toolNames: toolRegistry.getAllNames(),
      },
    };
  },
};

/** 获取磁盘使用情况 */
export const getDiskUsageTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_disk_usage",
      description: "获取缓存目录的磁盘使用情况（可用空间/总空间）。",
      parameters: {
        type: "object",
        properties: {
          directory: { type: "string", description: "目标目录路径（可选，默认缓存目录）" },
        },
      },
    },
  },
  domain: "system",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const { getCacheDirectory, getDiskSpace } = await import("@/shared/file-http");
    let dir = args.directory ? String(args.directory) : undefined;
    if (!dir) {
      const cacheResult = await getCacheDirectory();
      if (cacheResult?.success && cacheResult.path) {
        dir = cacheResult.path;
      } else {
        return { success: false, error: "无法获取缓存目录" };
      }
    }
    const result = await getDiskSpace(dir);
    if (!result?.success) {
      return { success: false, error: result?.error || "无法获取磁盘空间" };
    }
    return {
      success: true,
      data: {
        directory: dir,
        availableBytes: result.availableBytes,
        totalBytes: result.totalBytes,
        availableGB: result.availableBytes ? (result.availableBytes / 1024 / 1024 / 1024).toFixed(2) : undefined,
        totalGB: result.totalBytes ? (result.totalBytes / 1024 / 1024 / 1024).toFixed(2) : undefined,
      },
    };
  },
};

/** 导出所有系统工具 */
export const systemTools: ToolImpl[] = [
  getProjectStatsTool,
  getAppInfoTool,
  getDiskUsageTool,
];
