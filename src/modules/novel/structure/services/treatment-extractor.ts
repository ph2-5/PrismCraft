/**
 * Task 2A.13 v5.3 增强 — Treatment 提取器
 *
 * 调用 AI 从 NovelSegment[] 提取结构化的 StoryTreatment
 * （logline/theme/characterArcs/tone/settingDescription）。
 *
 * 设计要点：
 * - 通过注入的 generateTextFn 调用 AI（解耦 infrastructure，便于测试）
 * - 解析 AI 返回的 JSON 对象为 StoryTreatment
 * - 字段缺失或非法时给默认值，保证返回值类型完整
 * - characterArcs 仅保留 characterId + arc，characterName 由调用方关联填充
 *
 * 依赖方向：
 * - 仅依赖同模块 domain/treatment
 * - 不直接依赖 infrastructure/DI（通过 generateTextFn 注入）
 */

import type { NovelSegment } from "../../domain/types";
import type { ExtractedCharacter } from "../../domain/types";
import {
  STORY_TONES,
  type StoryTone,
  type StoryTreatment,
  type CharacterArc,
  EMPTY_TREATMENT,
} from "../domain/treatment";

/** AI 文本生成函数签名（与 structure-analyzer.ts 一致，避免循环依赖单独定义） */
export type GenerateTextFn = (prompt: string, options?: {
  maxTokens?: number;
  temperature?: number;
}) => Promise<{ success: boolean; data?: { text: string }; error?: string }>;

/**
 * 构建 treatment 提取提示词。
 *
 * 输入 segments + 已识别的角色列表（可选，便于 AI 关联角色弧光），
 * 要求 AI 返回 JSON 对象。
 */
export function buildTreatmentExtractionPrompt(
  segments: NovelSegment[],
  characters: ExtractedCharacter[] = [],
): string {
  const segmentBrief = segments.map((s, i) => ({
    index: i,
    title: s.title,
    summary: s.summary,
    keyEvents: s.keyEvents,
  }));

  const characterBrief = characters.map((c) => ({
    id: c.tempId,
    name: c.name,
    description: c.description,
    personality: c.personality,
  }));

  const toneList = STORY_TONES.join(" | ");

  return `你是一位专业的影视剧本编剧。请从以下小说片段中提取故事 treatment（结构化大纲）。

## 任务

提取以下 5 个字段，构成完整的故事大纲：

1. **logline**：一句话故事梗概（25-50 字，包含主角、目标、冲突）
2. **theme**：主题（如"成长"/"救赎"/"复仇"/"爱与牺牲"，1-3 个字）
3. **characterArcs**：主要角色的弧光（描述角色在故事中的成长/变化）
4. **tone**：故事基调（${toneList}）
5. **settingDescription**：世界观/设定描述（50-200 字，包括时间/地点/氛围）

## 输入片段（${segments.length} 个）

${JSON.stringify(segmentBrief, null, 2)}

## 已识别角色（${characters.length} 个）

${characters.length > 0 ? JSON.stringify(characterBrief, null, 2) : "（暂无角色信息，请从片段中推断主要角色）"}

## 输出格式

返回 JSON 对象（不要 JSON 数组，不要额外解释）：

\`\`\`json
{
  "logline": "一句话故事梗概",
  "theme": "主题",
  "tone": "${toneList}",
  "characterArcs": [
    { "characterId": "char-id-or-name", "characterName": "角色名", "arc": "弧光描述" }
  ],
  "settingDescription": "世界观描述"
}
\`\`\`

## 规则

1. characterArcs 最多 5 个角色（聚焦主要角色）
2. characterId 优先使用输入的 ExtractedCharacter.id；若无角色信息则用角色名
3. tone 必须是上面列表中的一个
4. 不要返回任何额外字段或解释

请直接返回 JSON 对象：`;
}

/**
 * 解析 AI 返回的 JSON 对象为 StoryTreatment。
 *
 * 容错策略：
 * - logline/theme/settingDescription 缺失时为空字符串
 * - tone 不合法时回退为 "drama"
 * - characterArcs 非数组时为空数组
 * - 每条 characterArc 至少有 characterId + arc
 */
export function parseTreatment(raw: unknown): StoryTreatment {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_TREATMENT };
  }

  const obj = raw as Record<string, unknown>;

  // 解析 tone，不合法时回退为 "drama"
  const rawTone = typeof obj.tone === "string" ? obj.tone : "";
  const tone: StoryTone = (STORY_TONES as readonly string[]).includes(rawTone)
    ? (rawTone as StoryTone)
    : "drama";

  // 解析 characterArcs
  let characterArcs: CharacterArc[] = [];
  if (Array.isArray(obj.characterArcs)) {
    characterArcs = obj.characterArcs
      .map((item): CharacterArc | null => {
        const arcObj = (item ?? {}) as Record<string, unknown>;
        const characterId = typeof arcObj.characterId === "string" ? arcObj.characterId : "";
        const arc = typeof arcObj.arc === "string" ? arcObj.arc : "";
        const characterName = typeof arcObj.characterName === "string" ? arcObj.characterName : undefined;
        // 至少有 characterId 和 arc 才保留
        if (!characterId || !arc) return null;
        return { characterId, characterName, arc };
      })
      .filter((x): x is CharacterArc => x !== null);
  }

  return {
    logline: typeof obj.logline === "string" ? obj.logline : "",
    theme: typeof obj.theme === "string" ? obj.theme : "",
    characterArcs,
    tone,
    settingDescription: typeof obj.settingDescription === "string" ? obj.settingDescription : "",
  };
}

/**
 * 从 AI 返回的文本中提取 JSON 对象字符串。
 *
 * 容错策略：
 * 1. 优先查找 ```json ... ``` 代码块
 * 2. 其次查找 { ... } 范围（最外层匹配）
 * 3. 都找不到时返回 null
 */
export function extractJsonObjectFromText(text: string): string | null {
  // 1. 查找 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/);
  if (codeBlockMatch?.[1]) return codeBlockMatch[1].trim();

  // 2. 查找最外层 { ... }
  const startIdx = text.indexOf("{");
  const endIdx = text.lastIndexOf("}");
  if (startIdx >= 0 && endIdx > startIdx) {
    return text.slice(startIdx, endIdx + 1);
  }

  return null;
}

/**
 * Treatment 提取主函数。
 *
 * @param segments 已分段的 NovelSegment[]
 * @param generateTextFn AI 文本生成函数（由调用方注入）
 * @param characters 已识别的角色列表（可选，便于 AI 关联角色弧光）
 * @returns 成功返回 StoryTreatment，失败返回 error
 */
export async function extractTreatment(
  segments: NovelSegment[],
  generateTextFn: GenerateTextFn,
  characters: ExtractedCharacter[] = [],
): Promise<{ success: true; data: StoryTreatment } | { success: false; error: string }> {
  if (segments.length === 0) {
    return { success: false, error: "无 segments 可提取 treatment" };
  }

  // 1. 构建提示词并调用 AI
  const prompt = buildTreatmentExtractionPrompt(segments, characters);
  const aiResult = await generateTextFn(prompt, { maxTokens: 2048, temperature: 0.5 });

  if (!aiResult.success || !aiResult.data?.text) {
    return {
      success: false,
      error: aiResult.error || "AI 调用失败",
    };
  }

  // 2. 提取并解析 JSON 对象
  let rawObj: unknown;
  try {
    const jsonStr = extractJsonObjectFromText(aiResult.data.text);
    if (!jsonStr) {
      return { success: false, error: "AI 返回内容无法解析为 JSON 对象" };
    }
    rawObj = JSON.parse(jsonStr);
  } catch (e) {
    return { success: false, error: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}` };
  }

  // 3. 解析为 StoryTreatment（容错）
  const treatment = parseTreatment(rawObj);

  // 4. 校验关键字段（logline 必须非空）
  if (!treatment.logline.trim()) {
    return { success: false, error: "AI 返回的 treatment 缺少 logline" };
  }

  return { success: true, data: treatment };
}
