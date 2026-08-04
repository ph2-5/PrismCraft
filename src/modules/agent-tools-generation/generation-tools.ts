/**
 * AI 生成工具（Generation Tools）— barrel 汇总
 *
 * 按能力拆分为三个实现文件（对外 API 不变）：
 * - image-tools.ts：generate_character_image / generate_scene_image / generate_prop_image / analyze_image
 * - text-tool.ts：generate_text
 * - audio-tools.ts：generate_music / generate_voiceover / text_to_speech / transcribe_audio
 *
 * 此处仅 re-export 各工具实现并组装 generationTools 数组。
 */

export {
  generateCharacterImageTool,
  generateSceneImageTool,
  generatePropImageTool,
  analyzeImageTool,
} from "./image-tools";

export { generateTextTool } from "./text-tool";

export {
  generateMusicTool,
  generateVoiceoverTool,
  textToSpeechTool,
  transcribeAudioTool,
} from "./audio-tools";

import { generateCharacterImageTool, generateSceneImageTool, generatePropImageTool, analyzeImageTool } from "./image-tools";
import { generateTextTool } from "./text-tool";
import { generateMusicTool, generateVoiceoverTool, textToSpeechTool, transcribeAudioTool } from "./audio-tools";
import type { ToolImpl } from "@/domain/types/agent-tools";

/** 导出所有生成工具 */
export const generationTools: ToolImpl[] = [
  generateCharacterImageTool,
  generateSceneImageTool,
  generatePropImageTool,
  analyzeImageTool,
  generateTextTool,
  generateMusicTool,
  generateVoiceoverTool,
  textToSpeechTool,
  transcribeAudioTool,
];
