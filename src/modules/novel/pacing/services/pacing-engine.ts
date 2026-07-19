/**
 * Task 2A.14 — 节奏规划引擎
 *
 * 核心服务：基于 StoryStructure 的叙事节点，按预设比例分配总时长到各 segment，
 * 产出可应用的 PacingResult。另提供 applyPacingToBeats 函数，将建议时长应用到 StoryBeat。
 *
 * 设计要点：
 * - 纯函数，无副作用，无 I/O，便于测试
 * - 不依赖 infrastructure/DI
 * - beat.type 决定所属阶段（setup/rising/climax/resolution），按 PacingConfig 比例分配
 * - 单个 segment 时长夹紧到 [SEGMENT_DURATION_MIN, SEGMENT_DURATION_MAX]
 * - 总时长可能因夹紧而与 targetDuration 略有差异
 *
 * 依赖方向：
 * - 仅依赖同模块 domain/pacing-types + 上层 structure/domain/narrative-beats + domain/types
 * - 不依赖 infrastructure / shared-logic / 其他 modules
 */

import type { NovelSegment } from "../../domain/types";
import type {
  NarrativeBeat,
  NarrativeBeatType,
  StoryStructure,
} from "../../structure/domain/narrative-beats";
import {
  DEFAULT_PACING_PRESETS,
  SEGMENT_DURATION_MIN,
  SEGMENT_DURATION_MAX,
  type PacingConfig,
  type PacingResult,
} from "../domain/pacing-types";

/**
 * 阶段分组（4 个阶段，对应 PacingConfig 的 4 个 ratio）。
 *
 * - setup: setup + inciting_incident
 * - rising: rising_action + midpoint
 * - climax: climax
 * - resolution: falling_action + resolution
 */
type Phase = "setup" | "rising" | "climax" | "resolution";

/**
 * 将叙事节点类型映射到阶段。
 *
 * 用于按 PacingConfig 的 4 个 ratio 分配时长。
 */
function beatTypeToPhase(type: NarrativeBeatType): Phase {
  switch (type) {
    case "setup":
    case "inciting_incident":
      return "setup";
    case "rising_action":
    case "midpoint":
      return "rising";
    case "climax":
      return "climax";
    case "falling_action":
    case "resolution":
      return "resolution";
  }
}

/**
 * 将 segments 按 beat.segmentIds 分组。
 *
 * 一个 segment 可能属于多个 beat（罕见但允许），此时它会被分到第一个匹配的 beat。
 * 未被任何 beat 关联的 segment 会被分到"未分组"桶，按平均时长处理。
 *
 * @returns Map<beatId, NovelSegment[]> + 未分组的 segments
 */
export function groupSegmentsByBeat(
  segments: NovelSegment[],
  beats: NarrativeBeat[],
): { beatGroups: Map<string, NovelSegment[]>; ungrouped: NovelSegment[] } {
  const beatGroups = new Map<string, NovelSegment[]>();
  for (const beat of beats) {
    beatGroups.set(beat.id, []);
  }

  const assignedSegmentIds = new Set<string>();
  for (const seg of segments) {
    // 找到第一个包含此 segment 的 beat
    const matchedBeat = beats.find((b) => b.segmentIds.includes(seg.id));
    if (matchedBeat) {
      beatGroups.get(matchedBeat.id)!.push(seg);
      assignedSegmentIds.add(seg.id);
    }
  }

  const ungrouped = segments.filter((s) => !assignedSegmentIds.has(s.id));
  return { beatGroups, ungrouped };
}

/**
 * 解析 PacingConfig，应用预设覆盖。
 *
 * 若 preset !== "custom"，用 DEFAULT_PACING_PRESETS 覆盖 4 个 ratio。
 * 然后归一化 ratio 使其总和为 1.0（避免用户输入不准导致总时长偏差）。
 */
export function resolvePacingConfig(config: PacingConfig): PacingConfig {
  if (config.preset !== "custom") {
    const presetRatios = DEFAULT_PACING_PRESETS[config.preset];
    return {
      ...config,
      ...presetRatios,
    };
  }
  return config;
}

/**
 * 归一化 4 个 ratio 使其总和为 1.0。
 *
 * 若总和为 0（全部 ratio 都是 0），回退到 normal 预设。
 */
export function normalizeRatios(config: PacingConfig): {
  setup: number;
  rising: number;
  climax: number;
  resolution: number;
} {
  const sum =
    config.setupDurationRatio +
    config.risingDurationRatio +
    config.climaxDurationRatio +
    config.resolutionDurationRatio;

  // 总和为 0 时回退到 normal 预设
  if (sum === 0) {
    const normal = DEFAULT_PACING_PRESETS.normal;
    return {
      setup: normal.setupDurationRatio!,
      rising: normal.risingDurationRatio!,
      climax: normal.climaxDurationRatio!,
      resolution: normal.resolutionDurationRatio!,
    };
  }

  return {
    setup: config.setupDurationRatio / sum,
    rising: config.risingDurationRatio / sum,
    climax: config.climaxDurationRatio / sum,
    resolution: config.resolutionDurationRatio / sum,
  };
}

/**
 * 按 4 个阶段比例分配总时长到各 beat。
 *
 * 每个 beat 根据其 type 归属到 4 个阶段之一，
 * 阶段总时长 = targetDuration × phaseRatio，
 * 阶段内 beat 平均分配（按 beat.estimatedDuration 加权）。
 *
 * @returns Map<beatId, beatDurationSeconds>
 */
export function allocateDurationByBeat(
  beats: NarrativeBeat[],
  config: PacingConfig,
): Map<string, number> {
  const normalized = normalizeRatios(config);
  const phaseTotals: Record<Phase, number> = {
    setup: config.targetDuration * normalized.setup,
    rising: config.targetDuration * normalized.rising,
    climax: config.targetDuration * normalized.climax,
    resolution: config.targetDuration * normalized.resolution,
  };

  // 按阶段分组 beats
  const beatsByPhase: Record<Phase, NarrativeBeat[]> = {
    setup: [],
    rising: [],
    climax: [],
    resolution: [],
  };
  for (const beat of beats) {
    const phase = beatTypeToPhase(beat.type);
    beatsByPhase[phase].push(beat);
  }

  // 阶段内按 estimatedDuration 加权分配
  const result = new Map<string, number>();
  for (const phase of ["setup", "rising", "climax", "resolution"] as Phase[]) {
    const phaseBeats = beatsByPhase[phase];
    const phaseTotal = phaseTotals[phase];
    if (phaseBeats.length === 0) continue;

    const totalEstimated = phaseBeats.reduce((sum, b) => sum + b.estimatedDuration, 0);
    if (totalEstimated === 0) {
      // estimatedDuration 全为 0 时平均分配
      const perBeat = phaseTotal / phaseBeats.length;
      for (const beat of phaseBeats) {
        result.set(beat.id, perBeat);
      }
    } else {
      for (const beat of phaseBeats) {
        const ratio = beat.estimatedDuration / totalEstimated;
        result.set(beat.id, phaseTotal * ratio);
      }
    }
  }

  return result;
}

/**
 * 将 beat 时长分配到该 beat 关联的 segments。
 *
 * segment 时长 = beatDuration × (segment.estimatedDuration / sum(segment.estimatedDuration))。
 * 若 beat 下 segments 的 estimatedDuration 全为 0，平均分配。
 * 最后夹紧到 [SEGMENT_DURATION_MIN, SEGMENT_DURATION_MAX]。
 *
 * @returns Map<segmentId, durationSeconds>
 */
export function distributeDurationToSegments(
  beatGroups: Map<string, NovelSegment[]>,
  beatDurations: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();

  for (const [beatId, segs] of beatGroups) {
    const beatDuration = beatDurations.get(beatId);
    if (beatDuration === undefined) continue;
    if (segs.length === 0) continue;

    const totalEstimated = segs.reduce((sum, s) => sum + s.estimatedDuration, 0);
    if (totalEstimated === 0) {
      // 平均分配 + 夹紧
      const perSeg = beatDuration / segs.length;
      for (const seg of segs) {
        result.set(seg.id, clampDuration(perSeg));
      }
    } else {
      for (const seg of segs) {
        const ratio = seg.estimatedDuration / totalEstimated;
        result.set(seg.id, clampDuration(beatDuration * ratio));
      }
    }
  }

  return result;
}

/**
 * 夹紧时长到 [SEGMENT_DURATION_MIN, SEGMENT_DURATION_MAX]。
 */
function clampDuration(seconds: number): number {
  return Math.max(SEGMENT_DURATION_MIN, Math.min(SEGMENT_DURATION_MAX, seconds));
}

/**
 * 未分组的 segments 按平均时长处理。
 *
 * 平均时长 = 剩余时长 / 未分组数量，剩余时长 = targetDuration - 已分配时长。
 * 若未分组数量为 0 或剩余时长 ≤ 0，使用 targetDuration / segments.length 作为回退。
 */
export function distributeUngroupedSegments(
  ungrouped: NovelSegment[],
  allocatedDuration: number,
  targetDuration: number,
): Map<string, number> {
  const result = new Map<string, number>();
  if (ungrouped.length === 0) return result;

  const remaining = Math.max(0, targetDuration - allocatedDuration);
  const perSeg = remaining > 0 ? remaining / ungrouped.length : targetDuration / ungrouped.length;
  for (const seg of ungrouped) {
    result.set(seg.id, clampDuration(perSeg));
  }
  return result;
}

/**
 * 生成节奏说明（人类可读）。
 *
 * 根据预设与配置产出 2-4 条说明，供 UI 展示。
 */
export function generatePacingNotes(
  structure: StoryStructure,
  config: PacingConfig,
): string[] {
  const notes: string[] = [];
  const normalized = normalizeRatios(config);

  // 1. 预设说明
  switch (config.preset) {
    case "slow":
      notes.push("慢节奏：开端与结局占比较高，适合氛围铺垫与情感余韵");
      break;
    case "normal":
      notes.push("标准节奏：典型比例分配，适合大多数故事");
      break;
    case "fast":
      notes.push("快节奏：高潮与上升动作占比较高，适合紧张刺激的故事");
      break;
    case "custom":
      notes.push("自定义节奏：用户手动调整比例");
      break;
  }

  // 2. 高潮占比说明
  const climaxPct = Math.round(normalized.climax * 100);
  if (normalized.climax > 0.2) {
    notes.push(`高潮占比 ${climaxPct}%（偏高）：建议高潮部分快切，单镜头时长压缩`);
  } else if (normalized.climax < 0.1) {
    notes.push(`高潮占比 ${climaxPct}%（偏低）：高潮部分可适当延长，强化情绪冲击`);
  } else {
    notes.push(`高潮占比 ${climaxPct}%：合理范围`);
  }

  // 3. 高潮位置说明
  const climaxPos = structure.climaxPosition;
  if (climaxPos > 0.8) {
    notes.push(`高潮位于故事 ${Math.round(climaxPos * 100)}% 处（偏后）：注意结局部分不要过长`);
  } else if (climaxPos < 0.6) {
    notes.push(`高潮位于故事 ${Math.round(climaxPos * 100)}% 处（偏前）：下降动作与结局需充实`);
  } else {
    notes.push(`高潮位于故事 ${Math.round(climaxPos * 100)}% 处：典型位置`);
  }

  // 4. 整体节奏说明
  switch (structure.overallPacing) {
    case "slow":
      notes.push("整体情绪强度偏低，建议延长单镜头时长，建立氛围");
      break;
    case "fast":
      notes.push("整体情绪强度偏高，建议缩短单镜头时长，加快剪辑节奏");
      break;
    case "normal":
      // 不额外添加，避免冗余
      break;
  }

  return notes;
}

/**
 * 节奏规划主函数。
 *
 * 步骤：
 * 1. 解析 PacingConfig（应用预设覆盖）
 * 2. 按 beat 分组 segments
 * 3. 按 4 阶段比例分配总时长到各 beat
 * 4. 节点内按 estimatedDuration 加权分配到 segments
 * 5. 未分组的 segments 按剩余时长平均分配
 * 6. 生成节奏说明
 *
 * @param segments 已分段的 NovelSegment[]
 * @param structure Task 2A.13 产出的 StoryStructure
 * @param config 节奏配置（preset + targetDuration + 4 ratios）
 * @returns PacingResult（segmentDurations + totalDuration + emotionCurve + pacingNotes）
 */
export function planPacing(
  segments: NovelSegment[],
  structure: StoryStructure,
  config: PacingConfig,
): PacingResult {
  const resolvedConfig = resolvePacingConfig(config);

  // 1. 分组
  const { beatGroups, ungrouped } = groupSegmentsByBeat(segments, structure.beats);

  // 2. 分配 beat 时长
  const beatDurations = allocateDurationByBeat(structure.beats, resolvedConfig);

  // 3. 分配 segment 时长
  const segmentDurations = distributeDurationToSegments(beatGroups, beatDurations);

  // 4. 处理未分组的 segments
  const allocatedTotal = Array.from(segmentDurations.values()).reduce((sum, d) => sum + d, 0);
  const ungroupedDurations = distributeUngroupedSegments(
    ungrouped,
    allocatedTotal,
    resolvedConfig.targetDuration,
  );
  for (const [segId, dur] of ungroupedDurations) {
    segmentDurations.set(segId, dur);
  }

  // 5. 计算实际总时长（夹紧后的总和）
  const totalDuration = Array.from(segmentDurations.values()).reduce((sum, d) => sum + d, 0);

  // 6. 生成节奏说明
  const pacingNotes = generatePacingNotes(structure, resolvedConfig);

  return {
    segmentDurations,
    totalDuration,
    emotionCurve: structure.emotionCurve,
    pacingNotes,
  };
}

/**
 * 可应用节奏建议的目标类型。
 *
 * 只要求有 duration 字段，避免 pacing-engine 直接依赖 shared-logic 的 StoryBeat 类型。
 * 调用方（useNovelPipeline）传入 StoryBeat[] 时结构兼容。
 */
export interface BeatWithDuration {
  duration: number;
  [key: string]: unknown;
}

/**
 * 将节奏规划结果应用到 StoryBeat.duration。
 *
 * segmentIdMap: segmentId → 该 segment 下的所有 beatId 列表。
 * 一个 segment 可能拆分成多个 beats（分镜），此时 segment 时长平均分配到该 segment 下的所有 beats。
 *
 * 返回新的 beats 数组（不修改原数组）。
 *
 * 注：Task 2A.14 基础部分未在 useNovelPipeline 中调用此函数 —
 * handleApplyPacing 直接修改 segments.estimatedDuration（影响后续分镜拆解的时长参考）。
 * 预留给 Task 2A.14 v5.3 增强（角色化产出）或 Task 2A.16 三档模式完整实现时使用：
 * 届时需要在 finalizeImport 前将 pacingResult 应用到 beats.duration（影响最终 StoryBeat 持久化）。
 */
export function applyPacingToBeats<T extends BeatWithDuration>(
  beats: T[],
  pacingResult: PacingResult,
  segmentIdMap: Map<string, string[]>,
): T[] {
  // 构建 beatId → 分配时长 的映射
  const beatDurationMap = new Map<string, number>();

  for (const [segId, beatIds] of segmentIdMap) {
    const segDuration = pacingResult.segmentDurations.get(segId);
    if (segDuration === undefined) continue;
    if (beatIds.length === 0) continue;

    // 平均分配到该 segment 下的所有 beats
    const perBeat = segDuration / beatIds.length;
    for (const beatId of beatIds) {
      beatDurationMap.set(beatId, perBeat);
    }
  }

  // 应用到 beats（未在 segmentIdMap 中的 beat 保持原 duration）
  return beats.map((beat) => {
    const beatId = (beat as { id?: string }).id;
    if (beatId === undefined) return beat;
    const newDuration = beatDurationMap.get(beatId);
    if (newDuration === undefined) return beat;
    return { ...beat, duration: newDuration };
  });
}
