/**
 * Novel Tools Barrel — Task 2A.2
 *
 * 导出 5 个 Novel Agent 工具 + novelTools 数组。
 *
 * 工具清单：
 * 1. segment_novel_text        — 小说文本分段
 * 2. extract_characters_from_text — 提取角色
 * 3. extract_scenes_from_text  — 提取场景
 * 4. match_entities            — 实体三级匹配（精确/模糊/冲突）
 * 5. breakdown_text_to_shots   — 段落转分镜
 *
 * 注：分镜转提示词复用统一的 generate_prompt 工具（agent-tools-story），不在本模块定义。
 *
 * 注册方式：通过 barrel 导出工具数组，由 agent 模块的 tool-registry 统一注册。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { segmentNovelTextTool } from "./segment-novel-text";
import { extractCharactersFromTextTool } from "./extract-characters-from-text";
import { extractScenesFromTextTool } from "./extract-scenes-from-text";
import { matchEntitiesTool } from "./match-entities";
import { breakdownTextToShotsTool } from "./breakdown-text-to-shots";

export { segmentNovelTextTool } from "./segment-novel-text";
export { extractCharactersFromTextTool } from "./extract-characters-from-text";
export { extractScenesFromTextTool } from "./extract-scenes-from-text";
export { matchEntitiesTool } from "./match-entities";
export { breakdownTextToShotsTool } from "./breakdown-text-to-shots";

/** Novel 工具集（5 个） */
export const novelTools: ToolImpl[] = [
  segmentNovelTextTool,
  extractCharactersFromTextTool,
  extractScenesFromTextTool,
  matchEntitiesTool,
  breakdownTextToShotsTool,
];
