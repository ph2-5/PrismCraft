/**
 * Agent Tools System 模块 — Barrel 入口
 *
 * 系统/项目工具集，从 agent 模块拆分而来。
 *
 * 包含工具（3 个）：
 * - get_project_stats：获取项目统计概览（角色/场景/视频任务/已配置能力）
 * - get_app_info：获取应用信息（版本/平台/可用工具数）
 * - get_disk_usage：获取缓存目录磁盘使用情况
 *
 * 设计要点：
 * - 所有跨模块依赖（characterService/sceneService/useVideoTaskStore/checkConfigStatus）
 *   均通过动态 import 延迟加载，保持静态依赖图轻量
 * - toolRegistry 通过 DI container 异步获取（await container.agentToolRegistry）
 */

import type { ToolImpl } from "@/domain/types/agent-tools";

export {
  getProjectStatsTool,
  getAppInfoTool,
  getDiskUsageTool,
  systemTools,
} from "./system-tools";

// 聚合导出
import { systemTools } from "./system-tools";

export const allSystemTools: ToolImpl[] = [...systemTools];
