/**
 * Agent Tools Shot 模块 — Barrel 入口
 *
 * 分镜生成工具集，从 agent 模块拆分而来。
 *
 * 包含工具（5 个）：
 * - generate_beat_keyframe / generate_beat_frame_pair / generate_beat_video
 * - batch_generate / regenerate_beat
 *
 * 设计要点：
 * - 通过 DI container 访问 videoTaskStorage
 * - 动态导入 storyboard/character/scene 服务
 */

import type { ToolImpl } from "@/domain/types/agent-tools";

export {
  generateBeatKeyframeTool,
  generateBeatFramePairTool,
  generateBeatVideoTool,
  batchGenerateTool,
  regenerateBeatTool,
  shotTools,
} from "./shot-tools";

// 聚合导出
import { shotTools } from "./shot-tools";

export const allShotTools: ToolImpl[] = [...shotTools];
