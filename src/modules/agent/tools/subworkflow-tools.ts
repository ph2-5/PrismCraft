/**
 * 子流程编排工具（Subworkflow Tools）— Barrel Re-export
 *
 * 本文件为拆分后的 barrel 入口，保持外部引用路径不变：
 *   import { subworkflowTools, autoCreateCharacterTool, ... } from "./subworkflow-tools";
 *
 * 实际实现已按工具类型拆分到：
 * - subworkflow-helpers.ts        — 共享辅助函数（generateJsonWithAI / executeTool / pollVideoTask 等）
 * - subworkflow-character-tools.ts — auto_create_character
 * - subworkflow-scene-tools.ts     — auto_create_scene
 * - subworkflow-story-tools.ts     — auto_plan_storyboard
 * - subworkflow-novel-tools.ts     — auto_create_from_novel
 * - subworkflow-video-tools.ts     — auto_generate_beat_full / auto_generate_video_full
 * - subworkflow-polish-tools.ts    — auto_polish_video
 * - subworkflow-utility-tools.ts   — auto_find_and_import_asset / auto_fix_common_errors
 *
 * 包含工具（9 个）：
 * - auto_create_character：一句话创建完整角色（推理设定 → 创建 → 生成图片）
 * - auto_create_scene：一句话创建完整场景（推理设定 → 创建 → 生成图片）
 * - auto_plan_storyboard：一句话生成完整分镜计划（创建故事 → 规划分镜 → 校验）
 * - auto_generate_beat_full：单分镜全自动生成（关键帧 → 首尾帧 → 视频）
 * - auto_generate_video_full：一句话完成全片生成（批量生成 → 字幕 → 配乐）
 * - auto_find_and_import_asset：AI 浏览器找素材并自动入库
 * - auto_fix_common_errors：常见错误自动修复
 * - auto_create_from_novel：小说一键转分镜
 * - auto_polish_video：视频自动润色
 */

import type { ToolImpl } from "../domain/types";

export { autoCreateCharacterTool } from "./subworkflow-character-tools";
export { autoCreateSceneTool } from "./subworkflow-scene-tools";
export { autoPlanStoryboardTool } from "./subworkflow-story-tools";
export { autoCreateFromNovelTool } from "./subworkflow-novel-tools";
export { autoGenerateBeatFullTool, autoGenerateVideoFullTool } from "./subworkflow-video-tools";
export { autoPolishVideoTool } from "./subworkflow-polish-tools";
export {
  autoFindAndImportAssetTool,
  autoFixCommonErrorsTool,
} from "./subworkflow-utility-tools";

import { autoCreateCharacterTool } from "./subworkflow-character-tools";
import { autoCreateSceneTool } from "./subworkflow-scene-tools";
import { autoPlanStoryboardTool } from "./subworkflow-story-tools";
import { autoCreateFromNovelTool } from "./subworkflow-novel-tools";
import { autoGenerateBeatFullTool, autoGenerateVideoFullTool } from "./subworkflow-video-tools";
import { autoPolishVideoTool } from "./subworkflow-polish-tools";
import { autoFindAndImportAssetTool, autoFixCommonErrorsTool } from "./subworkflow-utility-tools";

/** 导出所有子流程工具 */
export const subworkflowTools: ToolImpl[] = [
  autoCreateCharacterTool,
  autoCreateSceneTool,
  autoPlanStoryboardTool,
  autoGenerateBeatFullTool,
  autoGenerateVideoFullTool,
  autoFindAndImportAssetTool,
  autoFixCommonErrorsTool,
  autoCreateFromNovelTool,
  autoPolishVideoTool,
];
