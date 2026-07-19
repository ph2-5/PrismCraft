/**
 * Task 2A.13 — 故事结构分析器
 *
 * 核心服务：调用 AI 识别叙事节点（beats），计算情绪曲线、整体节奏、高潮位置。
 * 另提供 suggestDurationByStructure 函数，基于故事结构指导分镜时长分配。
 *
 * 设计要点：
 * - 通过注入的 generateTextFn 调用 AI（解耦 infrastructure，便于测试）
 * - 解析 AI 返回的 JSON 数组为 NarrativeBeat[]
 * - 计算 beat 的 position（基于关联的 NovelSegment 在数组中的位置）
 * - 计算 emotionCurve / overallPacing / climaxPosition
 *
 * 依赖方向：
 * - 仅依赖同模块 domain/narrative-beats + 上层 domain/types（NovelSegment）
 * - 不直接依赖 infrastructure/DI（通过 generateTextFn 注入）
 */

import type { NovelSegment } from "../../domain/types";
import {
  NARRATIVE_BEAT_TYPES,
  type NarrativeBeat,
  type NarrativeBeatType,
  type StoryStructure,
  computeBeatPosition,
  computeEmotionCurve,
  findClimaxPosition,
  inferOverallPacing,
} from "../domain/narrative-beats";

/**
 * AI 文本生成函数签名（解耦 infrastructure，便于测试）。
 *
 * 实际实现由调用方注入（通常是 container.textProvider.generateText）。
 */
export type GenerateTextFn = (prompt: string, options?: {
  maxTokens?: number;
  temperature?: number;
}) => Promise<{ success: boolean; data?: { text: string }; error?: string }>;

/**
 * 默认时长建议规则（秒）。
 *
 * 根据叙事节点类型，对 segment.estimatedDuration 进行调整：
 * - 高潮（climax）/激励事件（inciting_incident）：缩短 20%（快节奏，紧凑）
 * - 开端（setup）/结局（resolution）：延长 20%（慢节奏，建立氛围）
 * - 其他：保持原时长
 */
export const DEFAULT_DURATION_ADJUSTMENTS: Record<NarrativeBeatType, number> = {
  setup: 1.2,              // +20%
  inciting_incident: 0.8,  // -20%
  rising_action: 1.0,      // 保持
  midpoint: 1.0,           // 保持
  climax: 0.8,             // -20%
  falling_action: 1.1,     // +10%
  resolution: 1.2,         // +20%
};

/**
 * 构建结构分析提示词。
 *
 * 输入 NovelSegment[]，要求 AI 返回 JSON 数组，每项描述一个 beat。
 * 关键约束：
 * - 识别至少 3 个、最多 7 个 beats
 * - 每个 beat 必须有 type（在 NARRATIVE_BEAT_TYPES 中）、title、description
 * - emotionIntensity 在 0-1 之间
 * - segmentIds 必须是输入 segments 中存在的 ID
 */
export function buildStructureAnalysisPrompt(segments: NovelSegment[]): string {
  const segmentBrief = segments.map((s, i) => ({
    id: s.id,
    index: i,
    title: s.title,
    summary: s.summary,
    keyEvents: s.keyEvents,
    estimatedDuration: s.estimatedDuration,
  }));

  const beatTypeList = NARRATIVE_BEAT_TYPES.join(" | ");

  return `你是一位专业的影视剧本分析师。请分析以下小说片段，识别其中的叙事节点（story beats）。

## 任务

将给定的片段分组为叙事节点，每个 beat 描述一个故事功能（开端/激励事件/上升动作/中点/高潮/下降动作/结局）。

## 输入片段（${segments.length} 个）

${JSON.stringify(segmentBrief, null, 2)}

## 输出要求

返回 JSON 数组，每项格式：
\`\`\`json
{
  "type": "${beatTypeList}",
  "title": "节点标题（10字内）",
  "description": "此节点的叙事描述（说明该节点的叙事功能，30-80字）",
  "emotionIntensity": 0.0-1.0,
  "segmentIds": ["seg-id-1", "seg-id-2"]
}
\`\`\`

## 规则

1. 识别 3-7 个 beats（短故事 3 个，长故事 5-7 个）
2. 每个 beat 关联 1 个或多个 segment（通过 segmentIds）
3. segmentIds 必须是上面输入的真实 ID
4. emotionIntensity: setup/resolution 通常 0.2-0.4；rising_action 0.5-0.7；climax 0.8-1.0
5. beats 应覆盖所有 segments（每个 segment 至少属于一个 beat）
6. 不要返回任何额外解释，只返回 JSON 数组

请直接返回 JSON 数组：`;
}

/**
 * 解析 AI 返回的 JSON 数组为 NarrativeBeat[]。
 *
 * 容错策略：
 * - 字段缺失时给默认值（type 默认 "setup"，emotionIntensity 默认 0.5）
 * - segmentIds 不存在时默认为空数组
 * - 不校验 segmentIds 是否真实存在（由调用方在合并阶段处理）
 * - 不合法的 type 默认回退为 "setup"
 */
export function parseNarrativeBeats(raw: unknown[]): NarrativeBeat[] {
  return raw.map((item, i) => {
    const obj = (item ?? {}) as Record<string, unknown>;

    // 解析 type，不合法时回退为 "setup"
    const rawType = typeof obj.type === "string" ? obj.type : "";
    const type: NarrativeBeatType = (NARRATIVE_BEAT_TYPES as readonly string[]).includes(rawType)
      ? (rawType as NarrativeBeatType)
      : "setup";

    // 解析 segmentIds
    const segmentIds: string[] = Array.isArray(obj.segmentIds)
      ? obj.segmentIds.filter((v): v is string => typeof v === "string")
      : [];

    // 解析 emotionIntensity（clamp 到 0-1）
    const rawIntensity = typeof obj.emotionIntensity === "number" ? obj.emotionIntensity : 0.5;
    const emotionIntensity = Math.max(0, Math.min(1, rawIntensity));

    return {
      id: `beat-${i + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      segmentIds,
      type,
      title: typeof obj.title === "string" ? obj.title : `节点 ${i + 1}`,
      description: typeof obj.description === "string" ? obj.description : "",
      emotionIntensity,
      estimatedDuration: 0, // 由调用方在合并阶段填充
      position: 0,          // 由调用方在合并阶段填充
    };
  });
}

/**
 * 为每个 beat 计算 position 和 estimatedDuration。
 *
 * - position: 由 segmentIds 关联的 NovelSegment 位置决定（computeBeatPosition）
 * - estimatedDuration: 关联 segments 的 estimatedDuration 之和
 */
export function populateBeatPositionsAndDurations(
  beats: NarrativeBeat[],
  segments: NovelSegment[],
): NarrativeBeat[] {
  const totalBeats = beats.length;
  return beats.map((beat, beatIndex) => {
    const position = computeBeatPosition(beat, segments, beatIndex, totalBeats);

    // 计算关联 segments 的总时长
    let estimatedDuration = 0;
    for (const segId of beat.segmentIds) {
      const seg = segments.find((s) => s.id === segId);
      if (seg) {
        estimatedDuration += seg.estimatedDuration;
      }
    }
    // 若无关联 segment（AI 返回的 segmentIds 不匹配），按平均时长估算
    if (estimatedDuration === 0 && segments.length > 0) {
      const avgDuration = segments.reduce((sum, s) => sum + s.estimatedDuration, 0) / segments.length;
      estimatedDuration = avgDuration;
    }

    return { ...beat, position, estimatedDuration };
  });
}

/**
 * 故事结构分析主函数。
 *
 * 步骤：
 * 1. 构建提示词并调用 AI
 * 2. 解析 AI 返回的 JSON 数组为 NarrativeBeat[]
 * 3. 填充 position 和 estimatedDuration
 * 4. 计算 emotionCurve / overallPacing / climaxPosition
 *
 * @param segments 已分段的 NovelSegment[]
 * @param generateTextFn AI 文本生成函数（由调用方注入）
 * @returns 成功返回 StoryStructure，失败返回 error
 */
export async function analyzeStoryStructure(
  segments: NovelSegment[],
  generateTextFn: GenerateTextFn,
): Promise<{ success: true; data: StoryStructure } | { success: false; error: string }> {
  if (segments.length === 0) {
    return { success: false, error: "无 segments 可分析" };
  }

  // 1. 构建提示词并调用 AI
  const prompt = buildStructureAnalysisPrompt(segments);
  const aiResult = await generateTextFn(prompt, { maxTokens: 4000, temperature: 0.6 });

  if (!aiResult.success || !aiResult.data?.text) {
    return {
      success: false,
      error: aiResult.error || "AI 调用失败",
    };
  }

  // 2. 从 AI 文本中提取并解析 JSON 数组
  let rawBeats: unknown[];
  try {
    const jsonStr = extractJsonArrayFromText(aiResult.data.text);
    if (!jsonStr) {
      return { success: false, error: "AI 返回内容无法解析为 JSON 数组" };
    }
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      return { success: false, error: "AI 返回内容不是 JSON 数组" };
    }
    rawBeats = parsed;
  } catch (e) {
    return { success: false, error: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (rawBeats.length === 0) {
    return { success: false, error: "AI 未识别到任何叙事节点" };
  }

  // 3. 解析为 NarrativeBeat[] 并填充 position/duration
  const parsedBeats = parseNarrativeBeats(rawBeats);
  const beats = populateBeatPositionsAndDurations(parsedBeats, segments);

  // 4. 计算情绪曲线、整体节奏、高潮位置
  const emotionCurve = computeEmotionCurve(beats);
  const overallPacing = inferOverallPacing(beats);
  const climaxPosition = findClimaxPosition(beats);

  return {
    success: true,
    data: {
      beats,
      overallPacing,
      emotionCurve,
      climaxPosition,
    },
  };
}

/**
 * 从 AI 返回的文本中提取 JSON 数组字符串。
 *
 * 容错策略：
 * 1. 优先查找 ```json ... ``` 代码块
 * 2. 其次查找 [ ... ] 范围（最外层匹配）
 * 3. 都找不到时返回 null
 *
 * 注意：本函数是从 tools/helpers.ts 的 extractJsonArray 简化版，
 * 避免引入 @/shared-logic/json 依赖（保持本模块零外部依赖）。
 */
export function extractJsonArrayFromText(text: string): string | null {
  // 1. 查找 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?\s*(\[[\s\S]*?\])\s*\n?\s*```/);
  if (codeBlockMatch?.[1]) return codeBlockMatch[1].trim();

  // 2. 查找最外层 [ ... ]
  const startIdx = text.indexOf("[");
  const endIdx = text.lastIndexOf("]");
  if (startIdx >= 0 && endIdx > startIdx) {
    return text.slice(startIdx, endIdx + 1);
  }

  return null;
}

/**
 * 基于故事结构指导分镜时长分配。
 *
 * 规则：
 * - 高潮（climax）/激励事件（inciting_incident）：缩短 20%（快节奏）
 * - 开端（setup）/结局（resolution）：延长 20%（慢节奏，建立氛围）
 * - 上升动作/中点/下降动作：保持原时长
 *
 * @param segments 已分段的 NovelSegment[]
 * @param structure 故事结构分析结果
 * @returns Map<segmentId, suggestedDuration>
 */
export function suggestDurationByStructure(
  segments: NovelSegment[],
  structure: StoryStructure,
): Map<string, number> {
  const result = new Map<string, number>();

  // 建立 segmentId → beatType 映射（一个 segment 可能属于多个 beat，取第一个匹配的）
  const segmentToBeatType = new Map<string, NarrativeBeatType>();
  for (const beat of structure.beats) {
    for (const segId of beat.segmentIds) {
      if (!segmentToBeatType.has(segId)) {
        segmentToBeatType.set(segId, beat.type);
      }
    }
  }

  for (const seg of segments) {
    const beatType = segmentToBeatType.get(seg.id);
    const adjustment = beatType ? DEFAULT_DURATION_ADJUSTMENTS[beatType] : 1.0;
    const suggested = Math.round(seg.estimatedDuration * adjustment);
    // 时长限制在 [2, 30] 秒（与 segment-novel-text 工具一致）
    const clamped = Math.max(2, Math.min(30, suggested));
    result.set(seg.id, clamped);
  }

  return result;
}

/**
 * 重新计算 story structure（在用户手动编辑 beats 后调用）。
 *
 * 不调用 AI，仅根据当前 beats 重新计算 emotionCurve / overallPacing / climaxPosition。
 */
export function recalculateStoryStructure(
  beats: NarrativeBeat[],
  segments: NovelSegment[],
): StoryStructure {
  const updatedBeats = populateBeatPositionsAndDurations(beats, segments);
  const emotionCurve = computeEmotionCurve(updatedBeats);
  const overallPacing = inferOverallPacing(updatedBeats);
  const climaxPosition = findClimaxPosition(updatedBeats);

  return {
    beats: updatedBeats,
    overallPacing,
    emotionCurve,
    climaxPosition,
  };
}
