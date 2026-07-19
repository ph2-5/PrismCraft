/**
 * Task 2A.14 — 节奏规划类型定义
 *
 * 节奏规划引擎的核心类型：预设 / 配置 / 结果。
 * 基于 Task 2A.13 的 StoryStructure，按叙事节点分配时长，产出可应用的节奏规划。
 *
 * 依赖方向：
 * - 仅依赖同模块 structure/domain/narrative-beats（EmotionPoint 类型）
 * - 不依赖任何 infrastructure / shared-logic / 其他 modules
 */

import type { EmotionPoint } from "../../structure/domain/narrative-beats";

/**
 * 节奏预设。
 *
 * - slow: 节奏缓慢，时长偏长（开端/结局占比较大，高潮占比小）
 * - normal: 标准节奏（典型比例分配）
 * - fast: 节奏紧凑，时长偏短（高潮/上升动作占比较大）
 * - custom: 用户自定义比例（不应用预设，使用用户输入的 ratio）
 */
export type PacingPreset = "slow" | "normal" | "fast" | "custom";

/**
 * 节奏规划配置。
 *
 * 4 个 ratio 对应 4 个叙事阶段占比，总和应为 1.0：
 * - setupDurationRatio: 开端（setup + inciting_incident）
 * - risingDurationRatio: 上升动作（rising_action + midpoint）
 * - climaxDurationRatio: 高潮（climax）
 * - resolutionDurationRatio: 结局（falling_action + resolution）
 *
 * 若总和 ≠ 1.0，pacing-engine 会按比例归一化。
 */
export interface PacingConfig {
  preset: PacingPreset;
  /** 故事总时长（秒） */
  targetDuration: number;
  /** 高潮部分占比，默认 0.15 */
  climaxDurationRatio: number;
  /** 开端部分占比，默认 0.20 */
  setupDurationRatio: number;
  /** 上升动作占比，默认 0.40 */
  risingDurationRatio: number;
  /** 结局占比，默认 0.25 */
  resolutionDurationRatio: number;
}

/**
 * 节奏规划结果。
 *
 * 由 planPacing 函数产出，包含：
 * - segmentDurations: 每个 segment 的建议时长（秒）
 * - totalDuration: 实际总时长（可能与 targetDuration 略有差异，因夹紧到 [2,30] 秒）
 * - emotionCurve: 复用 StoryStructure.emotionCurve（供 UI 绘制曲线）
 * - pacingNotes: 节奏说明，如"高潮部分建议快切，时长压缩"
 */
export interface PacingResult {
  /** segmentId → 建议时长（秒） */
  segmentDurations: Map<string, number>;
  /** 实际总时长（秒） */
  totalDuration: number;
  /** 情绪曲线采样点（复用 StoryStructure.emotionCurve） */
  emotionCurve: EmotionPoint[];
  /** 节奏说明（人类可读，供 UI 展示） */
  pacingNotes: string[];
}

/**
 * 默认节奏预设比例。
 *
 * 每个预设只包含 4 个 ratio，preset 与 targetDuration 由调用方提供。
 * custom 为空对象（{}），表示使用用户输入的 ratio，不覆盖。
 *
 * 比例总和验证：
 * - slow:   0.25 + 0.40 + 0.10 + 0.25 = 1.00 ✓
 * - normal: 0.20 + 0.40 + 0.15 + 0.25 = 1.00 ✓
 * - fast:   0.15 + 0.45 + 0.20 + 0.20 = 1.00 ✓
 */
export const DEFAULT_PACING_PRESETS: Record<PacingPreset, Partial<Pick<PacingConfig, "climaxDurationRatio" | "setupDurationRatio" | "risingDurationRatio" | "resolutionDurationRatio">>> = {
  slow: {
    climaxDurationRatio: 0.10,
    setupDurationRatio: 0.25,
    risingDurationRatio: 0.40,
    resolutionDurationRatio: 0.25,
  },
  normal: {
    climaxDurationRatio: 0.15,
    setupDurationRatio: 0.20,
    risingDurationRatio: 0.40,
    resolutionDurationRatio: 0.25,
  },
  fast: {
    climaxDurationRatio: 0.20,
    setupDurationRatio: 0.15,
    risingDurationRatio: 0.45,
    resolutionDurationRatio: 0.20,
  },
  custom: {},
};

/**
 * 默认 PacingConfig（normal 预设，60 秒总时长）。
 *
 * 用于 UI 初始化与测试固定装置。
 */
export const DEFAULT_PACING_CONFIG: PacingConfig = {
  preset: "normal",
  targetDuration: 60,
  climaxDurationRatio: 0.15,
  setupDurationRatio: 0.20,
  risingDurationRatio: 0.40,
  resolutionDurationRatio: 0.25,
};

/**
 * 单个 segment 建议时长的夹紧范围（秒）。
 *
 * 与 shared-logic/story/story-service.ts 的 fixShotParams 保持一致，
 * 确保时长建议落在合理区间，避免极端值（如 0.1 秒或 300 秒）。
 */
export const SEGMENT_DURATION_MIN = 2;
export const SEGMENT_DURATION_MAX = 30;
