/**
 * Task 2A.13 — 故事结构分析（叙事 beats）
 *
 * 定义叙事节点的领域类型。专业创作者按故事 beats 规划分镜，而非按字数。
 * 7 种叙事节点类型（开端/激励事件/上升动作/中点/高潮/下降动作/结局）
 * 用于在 Phase 2（内容分割）和 Phase 3（角色管理）之间新增"故事结构分析"步骤。
 *
 * 依赖方向（contract.json）：
 * - 仅依赖 @/modules/novel/domain/types（NovelSegment）
 * - 不依赖任何 infrastructure / shared-logic / 其他 modules
 */

import type { NovelSegment } from "../../domain/types";

/**
 * 叙事节点类型（7 种经典叙事结构）。
 *
 * 顺序对应故事从开头到结尾的典型流程：
 *   setup → inciting_incident → rising_action → midpoint → climax → falling_action → resolution
 *
 * 但 beats 在实际故事中可能不严格按顺序出现（如倒叙），position 字段记录实际位置。
 */
export const NARRATIVE_BEAT_TYPES = [
  "setup",              // 开端：建立世界观、介绍角色
  "inciting_incident",  // 激励事件：打破平衡，推动故事开始
  "rising_action",      // 上升动作：冲突升级，角色发展
  "midpoint",           // 中点：故事转折，目标调整
  "climax",             // 高潮：最终对决，情绪顶峰
  "falling_action",     // 下降动作：高潮后的余波
  "resolution",         // 结局：新平衡建立
] as const;

export type NarrativeBeatType = typeof NARRATIVE_BEAT_TYPES[number];

/**
 * 单个叙事节点。
 *
 * 一个 beat 关联一个或多个 NovelSegment（segmentIds），
 * 描述故事在此处的叙事功能（type）与情绪强度（emotionIntensity）。
 */
export interface NarrativeBeat {
  id: string;
  /** 关联的片段 ID 列表（一个 beat 可能跨多个 segment） */
  segmentIds: string[];
  /** 叙事节点类型 */
  type: NarrativeBeatType;
  /** 节点标题（如"城市黎明 - 开端"） */
  title: string;
  /** 此节点的叙事描述（说明该节点的叙事功能） */
  description: string;
  /** 情绪强度 0-1（0=平静，1=最强烈） */
  emotionIntensity: number;
  /** 此节点的预估时长（秒） */
  estimatedDuration: number;
  /** 在故事中的位置 0-1（0=开头，1=结尾，按 segment 顺序计算） */
  position: number;
}

/**
 * 情绪曲线采样点。
 *
 * 用于在 UI 中绘制 SVG 折线图（横轴故事进度，纵轴情绪强度）。
 * 采样点由 beats 的 emotionIntensity 与 segments 推断合成。
 */
export interface EmotionPoint {
  /** 位置 0-1 */
  position: number;
  /** 情绪强度 0-1 */
  intensity: number;
  /** 可选标签（如"紧张"/"温馨"/"悲伤"） */
  label?: string;
}

/**
 * 整体节奏分类。
 *
 * - slow: 节奏缓慢，时长偏长（开端/结局占比较大）
 * - normal: 标准节奏
 * - fast: 节奏紧凑，时长偏短（高潮/上升动作占比较大）
 */
export type OverallPacing = "slow" | "normal" | "fast";

/**
 * 完整的故事结构分析结果。
 *
 * 由 structure-analyzer.ts 的 analyzeStoryStructure 函数产出，
 * 存储在 PipelineState.stepData["structure_analysis"] 中。
 */
export interface StoryStructure {
  /** 叙事节点列表（按 position 排序） */
  beats: NarrativeBeat[];
  /** 整体节奏 */
  overallPacing: OverallPacing;
  /** 情绪曲线采样点（按 position 排序） */
  emotionCurve: EmotionPoint[];
  /** 高潮在故事中的位置 0-1（通常接近 0.7-0.8） */
  climaxPosition: number;
}

/**
 * clamp 工具函数（避免引入外部依赖）。
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 根据节点的 emotionIntensity 计算位置（0-1）。
 *
 * 按 segmentIds 关联的 NovelSegment 在 segments 数组中的索引计算加权平均位置。
 * 若 segmentIds 为空或无法匹配，回退到 beats 数组中的相对顺序。
 */
export function computeBeatPosition(
  beat: { segmentIds: string[] },
  segments: NovelSegment[],
  beatIndex: number,
  totalBeats: number,
): number {
  if (segments.length === 0 || totalBeats === 0) return 0;

  // 优先用 segmentIds 计算加权位置
  if (beat.segmentIds.length > 0) {
    let sumPositions = 0;
    let matchedCount = 0;
    for (const segId of beat.segmentIds) {
      const idx = segments.findIndex((s) => s.id === segId);
      if (idx >= 0) {
        // segment 在数组中的归一化位置（中点）
        sumPositions += (idx + 0.5) / segments.length;
        matchedCount++;
      }
    }
    if (matchedCount > 0) {
      return clamp(sumPositions / matchedCount, 0, 1);
    }
  }

  // 回退：用 beat 在数组中的相对顺序
  return clamp((beatIndex + 0.5) / totalBeats, 0, 1);
}

/**
 * 找到高潮 beat 的位置。
 *
 * 高潮（climax）beat 的位置即 climaxPosition；若无 climax beat，回退到 0.75（典型高潮位置）。
 */
export function findClimaxPosition(beats: NarrativeBeat[]): number {
  const climax = beats.find((b) => b.type === "climax");
  if (climax) return climax.position;
  // 无显式高潮时，回退到 0.75（典型高潮位置在故事的 3/4 处）
  return 0.75;
}

/**
 * 根据各 beat 的 emotionIntensity 推断整体节奏。
 *
 * 规则：
 * - 高潮前（position < climaxPosition）情绪强度普遍高 → fast
 * - 高潮后（position > climaxPosition）情绪强度普遍高 → slow（余韵）
 * - 整体强度偏低（平均 <0.4）→ slow
 * - 整体强度偏高（平均 >0.6）→ fast
 * - 其他 → normal
 */
export function inferOverallPacing(beats: NarrativeBeat[]): OverallPacing {
  if (beats.length === 0) return "normal";

  const avgIntensity = beats.reduce((sum, b) => sum + b.emotionIntensity, 0) / beats.length;
  if (avgIntensity < 0.4) return "slow";
  if (avgIntensity > 0.6) return "fast";
  return "normal";
}

/**
 * 计算情绪曲线。
 *
 * 以 beats 的 (position, emotionIntensity) 为基础采样点，
 * 在 beat 之间插入过渡点（线性插值，最多 2 个中间点），使曲线更平滑。
 */
export function computeEmotionCurve(beats: NarrativeBeat[]): EmotionPoint[] {
  if (beats.length === 0) return [];

  // 按 position 排序
  const sorted = [...beats].sort((a, b) => a.position - b.position);

  const points: EmotionPoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const beat = sorted[i]!;
    points.push({
      position: beat.position,
      intensity: beat.emotionIntensity,
      label: beat.title,
    });

    // 在 beat 之间插入 1 个中点（线性插值），使曲线更平滑
    if (i < sorted.length - 1) {
      const next = sorted[i + 1]!;
      const midPosition = (beat.position + next.position) / 2;
      const midIntensity = (beat.emotionIntensity + next.emotionIntensity) / 2;
      points.push({
        position: midPosition,
        intensity: midIntensity,
      });
    }
  }

  return points;
}
