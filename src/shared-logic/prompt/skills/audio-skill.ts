/**
 * Audio Skill — 对白/口型/音乐/环境音频指令构建器（Task 4.7 v5.3 增强）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 seedance-audio SKILL 模式。
 *
 * 触发场景：用户消息含音频相关关键词（对白/口型/BGM/音乐/背景音/环境音等）。
 * 行为：构建音频指令片段，覆盖 4 个维度：对白 / 口型 / 音乐 / 环境。
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

import type { AgentContext, Skill } from "./index";
import type { AudioInstruction, AudioDialogue, AudioMusic, AudioEnvironment } from "./extended-types";

// === 对白语气映射表 ===
const TONE_DESCRIPTIONS: Record<string, string> = {
  温柔: "温柔（语速缓慢，音量适中，尾音上扬）",
  坚定: "坚定（语速中等，音量较大，断句清晰）",
  紧张: "紧张（语速较快，音量起伏，呼吸急促）",
  悲伤: "悲伤（语速缓慢，音量低沉，尾音下垂）",
  愤怒: "愤怒（语速较快，音量大，咬字重）",
  冷静: "冷静（语速均匀，音量平稳，无明显起伏）",
};

// === BGM 风格映射表 ===
const BGM_STYLE_DESCRIPTIONS: Record<string, string> = {
  史诗: "史诗交响（管弦乐 + 打击乐，宏大叙事）",
  温馨: "温馨钢琴（钢琴主奏，慢节奏，柔和旋律）",
  紧张: "紧张电子（电子合成器 + 快节奏，悬疑氛围）",
  古风: "古风民乐（古筝 + 琵琶 + 笛子，传统五声音阶）",
  电子: "电子舞曲（合成器 + 鼓机，强节奏）",
  氛围: "氛围音乐（无明确节奏，环境音 + 持续音色）",
};

export const audioSkill: Skill = {
  id: "audio",
  matchers: [
    "对白",
    "台词",
    "口型",
    "bgm",
    "音乐",
    "背景音",
    "环境音",
    "音效",
    "配音",
    "audio",
    "dialogue",
    "music",
  ],

  buildInstructions(_ctx: AgentContext): string {
    return [
      "## 音频专项指令（Audio Skill）",
      "",
      "本片段构建音频指令，覆盖 4 个维度：对白 / 口型 / 音乐 / 环境。",
      "",
      "### 对白（Dialogue）",
      "字段：",
      "- **语气**：温柔 / 坚定 / 紧张 / 悲伤 / 愤怒 / 冷静",
      "- **语速**：缓慢 / 中等 / 较快 / 急促",
      "- **情绪**：与语气匹配的具体情绪描述",
      "",
      "语气描述表：",
      ...Object.entries(TONE_DESCRIPTIONS).map(([k, v]) => `- ${k}：${v}`),
      "",
      "### 口型同步（Lip Sync）",
      "- 需要口型同步时，必须提供对白时间轴（每句对白的起止时间）",
      "- 对白时长应与视频时长匹配（避免对白结束后角色嘴仍动）",
      "- 中文对口型难度较高，建议用短句（每句 < 5 秒）",
      "",
      "### 音乐（Music / BGM）",
      "字段：",
      "- **BGM 风格**：史诗 / 温馨 / 紧张 / 古风 / 电子 / 氛围",
      "- **节奏**：慢板 / 中板 / 快板",
      "- **情绪**：与画面情绪匹配",
      "",
      "BGM 风格描述表：",
      ...Object.entries(BGM_STYLE_DESCRIPTIONS).map(([k, v]) => `- ${k}：${v}`),
      "",
      "### 环境（Environment）",
      "字段：",
      "- **背景音**：场景固有声音（如街道嘈杂、森林鸟鸣、海浪）",
      "- **氛围音**：情绪性环境音（如风声渲染萧瑟、雨声渲染忧郁）",
      "",
      "### 构建规则",
      "- 对白与口型必须同步（如需口型同步，必须提供对白时间轴）",
      "- BGM 情绪必须与画面情绪匹配（紧张画面→紧张电子；温馨画面→温馨钢琴）",
      "- 环境音应与场景类型匹配（室外→自然音；室内→回声 + 物品声音）",
      "- 音频指令不强制要求（部分视频可能无声），但如有则必须完整",
      "- 输出格式：「[对白]，[BGM]，[环境音]」如「温柔对白，温馨钢琴BGM，鸟鸣背景音」",
    ].join("\n");
  },
};

// === 导出构建函数 ===

export function buildDialogueInstruction(dialogue: AudioDialogue): string {
  const toneDesc = TONE_DESCRIPTIONS[dialogue.tone] ?? dialogue.tone;
  return `${toneDesc}，语速${dialogue.speed}，${dialogue.emotion}`;
}

export function buildMusicInstruction(music: AudioMusic): string {
  const styleDesc = BGM_STYLE_DESCRIPTIONS[music.bgmStyle] ?? music.bgmStyle;
  return `${styleDesc}，${music.tempo}节奏，${music.emotion}`;
}

export function buildEnvironmentInstruction(env: AudioEnvironment): string {
  return `${env.ambient}，${env.atmosphere}`;
}

export function buildAudioInstruction(instruction: AudioInstruction): string {
  const parts: string[] = [];
  if (instruction.dialogue) {
    parts.push(`对白：${buildDialogueInstruction(instruction.dialogue)}`);
  }
  if (instruction.music) {
    parts.push(`BGM：${buildMusicInstruction(instruction.music)}`);
  }
  if (instruction.environment) {
    parts.push(`环境：${buildEnvironmentInstruction(instruction.environment)}`);
  }
  if (instruction.lipSync) {
    parts.push("需要口型同步");
  }
  return parts.join("；");
}
