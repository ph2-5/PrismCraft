/**
 * Task 2A.13 v5.3 增强 — 镜头契约（Shot Contract）
 *
 * 借鉴 seedance-2.0 的 shot contract 概念：
 * 每个 NarrativeBeat 产出 1-3 个 ShotContract，描述该镜头的拍摄参数
 * （景别/镜头/运动/灯光/时长/角色站位）。
 *
 * 用户可在 UI 表格中编辑 shot contract 后，再进入分镜生成阶段。
 * 后续 prompt 生成会使用 shot contract 的参数，实现
 * "返回 production object first, then prompt" 模式。
 *
 * 依赖方向：零外部依赖，所有类型自包含。
 */

/**
 * 景别（shot size）枚举。
 *
 * 影视行业标准 5 级景别：
 * - extreme_wide: 大远景（建立镜头，展示环境）
 * - wide: 远景（全身镜头，展示动作）
 * - medium: 中景（腰部以上，对话常用）
 * - close_up: 近景（胸部以上，表情展示）
 * - extreme_close_up: 特写（局部细节，强调情绪）
 */
export const SHOT_SIZES = [
  "extreme_wide",
  "wide",
  "medium",
  "close_up",
  "extreme_close_up",
] as const;

export type ShotSize = typeof SHOT_SIZES[number];

/**
 * 镜头运动方式枚举。
 *
 * - static: 静态（固定机位）
 * - pan: 摇镜头（水平转动）
 * - tilt: 俯仰镜头（垂直转动）
 * - dolly: 推拉镜头（沿光轴移动）
 * - handheld: 手持（晃动感）
 * - tracking: 跟踪镜头（跟随主体）
 */
export const SHOT_MOVEMENTS = [
  "static",
  "pan",
  "tilt",
  "dolly",
  "handheld",
  "tracking",
] as const;

export type ShotMovement = typeof SHOT_MOVEMENTS[number];

/**
 * 灯光风格枚举。
 *
 * - natural: 自然光（日间室外常用）
 * - low_key: 低调光（暗调，惊悚/恐怖）
 * - high_key: 高调光（明亮均匀，喜剧/广告）
 * - golden_hour: 黄金时刻（日出/日落，温暖）
 * - neon: 霓虹（赛博朋克/夜景）
 */
export const SHOT_LIGHTINGS = [
  "natural",
  "low_key",
  "high_key",
  "golden_hour",
  "neon",
] as const;

export type ShotLighting = typeof SHOT_LIGHTINGS[number];

/**
 * 单个镜头契约。
 *
 * 描述一个分镜的拍摄参数，是 treatment → prompt 之间的可编辑中间产物。
 * continuityNotes 字段为 Task 2A.18 连续性账本预留。
 */
export interface ShotContract {
  /** 唯一 ID */
  id: string;
  /** 关联的 NarrativeBeat ID */
  beatId: string;
  /** 分镜序号（在整个故事中的全局序号，从 1 开始） */
  shotNumber: number;
  /** 景别 */
  shotSize: ShotSize;
  /** 镜头焦距（如"35mm"/"85mm"/"变焦"） */
  lens: string;
  /** 镜头运动 */
  movement: ShotMovement;
  /** 灯光风格 */
  lighting: ShotLighting;
  /** 时长（秒，2-30 之间） */
  duration: number;
  /** 角色站位/动作描述（如"主角背对镜头，缓慢转身"） */
  blocking: string;
  /** 连续性注释（供 Task 2A.18 使用，可选） */
  continuityNotes?: string;
}

/**
 * 默认镜头焦距建议（按景别）。
 *
 * 用于 shot-contract-builder 在 AI 未返回 lens 时回退。
 */
export const DEFAULT_LENS_BY_SIZE: Record<ShotSize, string> = {
  extreme_wide: "24mm",
  wide: "35mm",
  medium: "50mm",
  close_up: "85mm",
  extreme_close_up: "100mm",
};

/**
 * 默认镜头时长建议（按景别，秒）。
 *
 * 用于 shot-contract-builder 在 AI 未返回 duration 时回退。
 * 景别越大，观众需要更多时间扫视画面，时长越长。
 */
export const DEFAULT_DURATION_BY_SIZE: Record<ShotSize, number> = {
  extreme_wide: 6,   // 大远景：6 秒（建立镜头）
  wide: 5,           // 远景：5 秒
  medium: 4,         // 中景：4 秒
  close_up: 3,       // 近景：3 秒
  extreme_close_up: 2, // 特写：2 秒
};

/**
 * 校验 ShotContract 字段合法性。
 *
 * @returns 错误消息列表（空数组表示合法）
 */
export function validateShotContract(contract: ShotContract): string[] {
  const errors: string[] = [];

  if (!contract.id) errors.push("id 不能为空");
  if (!contract.beatId) errors.push("beatId 不能为空");
  if (contract.shotNumber < 1) errors.push("shotNumber 必须 >= 1");

  if (!(SHOT_SIZES as readonly string[]).includes(contract.shotSize)) {
    errors.push(`shotSize 必须是 ${SHOT_SIZES.join("/")} 之一`);
  }
  if (!(SHOT_MOVEMENTS as readonly string[]).includes(contract.movement)) {
    errors.push(`movement 必须是 ${SHOT_MOVEMENTS.join("/")} 之一`);
  }
  if (!(SHOT_LIGHTINGS as readonly string[]).includes(contract.lighting)) {
    errors.push(`lighting 必须是 ${SHOT_LIGHTINGS.join("/")} 之一`);
  }

  if (contract.duration < 2 || contract.duration > 30) {
    errors.push("duration 必须在 2-30 秒之间");
  }
  if (!contract.lens.trim()) errors.push("lens 不能为空");
  if (!contract.blocking.trim()) errors.push("blocking 不能为空");

  return errors;
}

/**
 * clamp duration 到 [2, 30] 范围。
 */
export function clampDuration(duration: number): number {
  return Math.max(2, Math.min(30, duration));
}
