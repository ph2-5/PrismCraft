/**
 * Task 2A.13 v5.3 增强 — Shot Contract 构建器
 *
 * 每个 NarrativeBeat 产出 1-3 个 ShotContract（高潮 beat 多产 shot，开端 beat 少产），
 * 调用 AI + 默认规则填充景别/镜头/运动/灯光/时长/角色站位。
 *
 * 设计要点：
 * - 通过注入的 generateTextFn 调用 AI（解耦 infrastructure，便于测试）
 * - AI 返回字段缺失时用默认值回退（DEFAULT_LENS_BY_SIZE / DEFAULT_DURATION_BY_SIZE）
 * - 不依赖 treatment（可选注入，若提供则用于指导 AI 生成更贴合的 blocking）
 *
 * 依赖方向：
 * - 仅依赖同模块 domain/narrative-beats + domain/shot-contract + 上层 domain/types
 * - 不直接依赖 infrastructure/DI（通过 generateTextFn 注入）
 */

import type { NovelSegment } from "../../domain/types";
import type { NarrativeBeat, NarrativeBeatType } from "../domain/narrative-beats";
import {
  SHOT_SIZES,
  SHOT_MOVEMENTS,
  SHOT_LIGHTINGS,
  DEFAULT_LENS_BY_SIZE,
  DEFAULT_DURATION_BY_SIZE,
  clampDuration,
  type ShotContract,
  type ShotSize,
  type ShotMovement,
  type ShotLighting,
} from "../domain/shot-contract";
import type { StoryTreatment } from "../domain/treatment";

/** AI 文本生成函数签名（与 structure-analyzer.ts 一致） */
export type GenerateTextFn = (prompt: string, options?: {
  maxTokens?: number;
  temperature?: number;
}) => Promise<{ success: boolean; data?: { text: string }; error?: string }>;

/**
 * 按 beat type 决定默认产出的 shot 数量。
 *
 * - setup: 1 个（建立镜头，单一远景即可）
 * - inciting_incident: 1-2 个（关键转折，可能需要两个角度）
 * - rising_action: 2 个（冲突升级，多角度展现）
 * - midpoint: 2 个（转折，对比镜头）
 * - climax: 3 个（高潮，多角度密集剪辑）
 * - falling_action: 1-2 个（余波，节奏放缓）
 * - resolution: 1 个（结局，稳定镜头）
 */
export const DEFAULT_SHOT_COUNT_BY_BEAT: Record<NarrativeBeatType, number> = {
  setup: 1,
  inciting_incident: 2,
  rising_action: 2,
  midpoint: 2,
  climax: 3,
  falling_action: 2,
  resolution: 1,
};

/**
 * 默认景别建议（按 beat type）。
 *
 * - setup/resolution: extreme_wide（建立/结局，远景）
 * - inciting_incident/midpoint: medium（中景，对话感）
 * - rising_action: wide（远景，动作展示）
 * - climax: close_up（近景，情绪顶峰）
 * - falling_action: medium（中景，回归对话）
 */
export const DEFAULT_SHOT_SIZE_BY_BEAT: Record<NarrativeBeatType, ShotSize> = {
  setup: "extreme_wide",
  inciting_incident: "medium",
  rising_action: "wide",
  midpoint: "medium",
  climax: "close_up",
  falling_action: "medium",
  resolution: "extreme_wide",
};

/**
 * 默认灯光建议（按 beat type + treatment tone）。
 *
 * - climax + thriller/horror: low_key（暗调，紧张）
 * - setup/resolution: natural（自然光，建立/收尾）
 * - romance 基调: golden_hour（温暖）
 * - action 基调: high_key（明亮，动感）
 * - 其他: natural
 */
export function getDefaultLighting(beatType: NarrativeBeatType, tone?: StoryTreatment["tone"]): ShotLighting {
  if (beatType === "climax" && (tone === "thriller" || tone === "horror")) {
    return "low_key";
  }
  if (tone === "romance") return "golden_hour";
  if (tone === "action") return "high_key";
  if (beatType === "setup" || beatType === "resolution") return "natural";
  return "natural";
}

/**
 * 构建 shot contract 生成提示词。
 *
 * 输入 NarrativeBeat + 关联的 NovelSegment + 可选的 treatment，
 * 要求 AI 返回 JSON 数组（每个 beat 对应 1-3 个 shot contract）。
 */
export function buildShotContractPrompt(
  beat: NarrativeBeat,
  segments: NovelSegment[],
  treatment?: StoryTreatment,
): string {
  const beatSegments = beat.segmentIds
    .map((id) => segments.find((s) => s.id === id))
    .filter((s): s is NovelSegment => s !== undefined);

  const segmentBrief = beatSegments.map((s) => ({
    title: s.title,
    summary: s.summary,
    keyEvents: s.keyEvents,
  }));

  const shotSizeList = SHOT_SIZES.join(" | ");
  const movementList = SHOT_MOVEMENTS.join(" | ");
  const lightingList = SHOT_LIGHTINGS.join(" | ");

  const shotCount = DEFAULT_SHOT_COUNT_BY_BEAT[beat.type];

  return `你是一位专业的影视分镜师。请为以下叙事节点设计 ${shotCount} 个镜头契约（shot contract）。

## 任务

为该 beat 设计 ${shotCount} 个镜头，每个镜头描述：景别/焦距/运动/灯光/时长/角色站位。

## 输入信息

**叙事节点**：
- 类型: ${beat.type}
- 标题: ${beat.title}
- 描述: ${beat.description}
- 情绪强度: ${beat.emotionIntensity}
- 预估时长: ${beat.estimatedDuration} 秒

**关联片段**（${beatSegments.length} 个）：
${JSON.stringify(segmentBrief, null, 2)}

${treatment ? `**故事 Treatment**：
- logline: ${treatment.logline}
- theme: ${treatment.theme}
- tone: ${treatment.tone}
- setting: ${treatment.settingDescription}
` : ""}
## 输出要求

返回 JSON 数组（${shotCount} 个对象），每个对象格式：

\`\`\`json
{
  "shotSize": "${shotSizeList}",
  "lens": "焦距（如 35mm/85mm/变焦）",
  "movement": "${movementList}",
  "lighting": "${lightingList}",
  "duration": 2-30,
  "blocking": "角色站位/动作描述（20-50 字）"
}
\`\`\`

## 规则

1. 景别按 beat 类型选择（高潮→近景，开端→远景）
2. 时长总和应接近 beat.estimatedDuration（${beat.estimatedDuration} 秒）
3. blocking 描述具体可见的角色动作（不要抽象描述）
4. 不要返回 id/beatId/shotNumber（由系统自动填充）
5. 不要返回任何额外解释，只返回 JSON 数组

请直接返回 JSON 数组：`;
}

/**
 * 解析 AI 返回的 JSON 数组为 ShotContract 草稿（不含 id/beatId/shotNumber）。
 *
 * 容错策略：
 * - shotSize/movement/lighting 不合法时用默认值回退
 * - lens 缺失时用 DEFAULT_LENS_BY_SIZE
 * - duration 缺失或非法时用 DEFAULT_DURATION_BY_SIZE，并 clamp 到 [2,30]
 * - blocking 缺失时为空字符串（用户需手动填写）
 */
export function parseShotContracts(
  raw: unknown[],
  beat: NarrativeBeat,
  treatment?: StoryTreatment,
): Omit<ShotContract, "id" | "beatId" | "shotNumber">[] {
  const defaultShotSize = DEFAULT_SHOT_SIZE_BY_BEAT[beat.type];
  const defaultLighting = getDefaultLighting(beat.type, treatment?.tone);

  return raw.map((item) => {
    const obj = (item ?? {}) as Record<string, unknown>;

    // 解析 shotSize
    const rawSize = typeof obj.shotSize === "string" ? obj.shotSize : "";
    const shotSize: ShotSize = (SHOT_SIZES as readonly string[]).includes(rawSize)
      ? (rawSize as ShotSize)
      : defaultShotSize;

    // 解析 movement
    const rawMovement = typeof obj.movement === "string" ? obj.movement : "";
    const movement: ShotMovement = (SHOT_MOVEMENTS as readonly string[]).includes(rawMovement)
      ? (rawMovement as ShotMovement)
      : "static";

    // 解析 lighting
    const rawLighting = typeof obj.lighting === "string" ? obj.lighting : "";
    const lighting: ShotLighting = (SHOT_LIGHTINGS as readonly string[]).includes(rawLighting)
      ? (rawLighting as ShotLighting)
      : defaultLighting;

    // 解析 lens
    const lens = typeof obj.lens === "string" && obj.lens.trim()
      ? obj.lens
      : DEFAULT_LENS_BY_SIZE[shotSize];

    // 解析 duration
    const rawDuration = typeof obj.duration === "number" ? obj.duration : DEFAULT_DURATION_BY_SIZE[shotSize];
    const duration = clampDuration(rawDuration);

    // 解析 blocking
    const blocking = typeof obj.blocking === "string" ? obj.blocking : "";

    return { shotSize, lens, movement, lighting, duration, blocking };
  });
}

/**
 * 从 AI 返回的文本中提取 JSON 数组字符串。
 *
 * 与 structure-analyzer.ts 的 extractJsonArrayFromText 实现一致，
 * 此处独立实现避免跨 service 引用。
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
 * Shot Contract 构建主函数。
 *
 * 为单个 beat 产出 1-3 个 ShotContract。
 *
 * @param beat 单个 NarrativeBeat
 * @param segments 全部 NovelSegment（用于查找 beat 关联的 segment 内容）
 * @param generateTextFn AI 文本生成函数（由调用方注入）
 * @param treatment 可选的故事大纲（用于指导 AI 生成更贴合的 blocking）
 * @param startShotNumber 该 beat 内第一个 shot 的全局序号（默认 1）
 * @returns 成功返回 ShotContract[]，失败返回 error
 */
export async function buildShotContractsForBeat(
  beat: NarrativeBeat,
  segments: NovelSegment[],
  generateTextFn: GenerateTextFn,
  treatment?: StoryTreatment,
  startShotNumber = 1,
): Promise<{ success: true; data: ShotContract[] } | { success: false; error: string }> {
  // 1. 构建提示词并调用 AI
  const prompt = buildShotContractPrompt(beat, segments, treatment);
  const aiResult = await generateTextFn(prompt, { maxTokens: 2048, temperature: 0.6 });

  let rawContracts: Omit<ShotContract, "id" | "beatId" | "shotNumber">[];

  if (!aiResult.success || !aiResult.data?.text) {
    // AI 调用失败 → 用默认规则生成（不报错，保证流程可继续）
    const shotCount = DEFAULT_SHOT_COUNT_BY_BEAT[beat.type];
    const defaultShotSize = DEFAULT_SHOT_SIZE_BY_BEAT[beat.type];
    const defaultLighting = getDefaultLighting(beat.type, treatment?.tone);
    rawContracts = Array.from({ length: shotCount }, () => ({
      shotSize: defaultShotSize,
      lens: DEFAULT_LENS_BY_SIZE[defaultShotSize],
      movement: "static" as const,
      lighting: defaultLighting,
      duration: DEFAULT_DURATION_BY_SIZE[defaultShotSize],
      blocking: beat.description || beat.title,
    }));
  } else {
    // 2. 提取并解析 JSON 数组
    try {
      const jsonStr = extractJsonArrayFromText(aiResult.data.text);
      if (!jsonStr) {
        return { success: false, error: "AI 返回内容无法解析为 JSON 数组" };
      }
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return { success: false, error: "AI 返回的 shot contract 数组为空或非数组" };
      }
      rawContracts = parseShotContracts(parsed, beat, treatment);
    } catch (e) {
      return { success: false, error: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  // 3. 填充 id / beatId / shotNumber
  const contracts: ShotContract[] = rawContracts.map((c, i) => ({
    id: `shot-${beat.id}-${i + 1}`,
    beatId: beat.id,
    shotNumber: startShotNumber + i,
    ...c,
  }));

  return { success: true, data: contracts };
}

/**
 * 批量为所有 beats 构建 shot contracts。
 *
 * 串行调用 buildShotContractsForBeat（避免并发 AI 调用过载），
 * 累积 shotNumber 保证全局唯一。
 *
 * @param beats 全部 NarrativeBeat[]
 * @param segments 全部 NovelSegment[]
 * @param generateTextFn AI 文本生成函数
 * @param treatment 可选的故事大纲
 * @returns 成功返回全部 ShotContract[]，失败返回 error + 已成功的 contracts（部分成功）
 */
export async function buildShotContractsForBeats(
  beats: NarrativeBeat[],
  segments: NovelSegment[],
  generateTextFn: GenerateTextFn,
  treatment?: StoryTreatment,
): Promise<{
  success: boolean;
  data: ShotContract[];
  errors: string[];
}> {
  const allContracts: ShotContract[] = [];
  const errors: string[] = [];
  let nextShotNumber = 1;

  for (const beat of beats) {
    const result = await buildShotContractsForBeat(
      beat,
      segments,
      generateTextFn,
      treatment,
      nextShotNumber,
    );
    if (result.success) {
      allContracts.push(...result.data);
      nextShotNumber += result.data.length;
    } else {
      errors.push(`Beat "${beat.title}" (${beat.id}): ${result.error}`);
      // 不中断，继续处理下一个 beat
    }
  }

  return {
    success: errors.length === 0,
    data: allContracts,
    errors,
  };
}
