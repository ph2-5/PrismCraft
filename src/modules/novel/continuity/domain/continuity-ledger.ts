/**
 * Task 2A.18 — 连续性账本类型
 *
 * 跨镜头一致性追踪的类型定义。
 *
 * 设计来源：seedance-2.0 仓库 references/shot-list-continuity.md
 *
 * 核心概念：
 * - ContinuityEntry：单个 shot 在某个属性上的连续性记录
 *   （如 shot-3 中"林辰.服装=红色"）
 * - ContinuityViolation：多个 shot 在同一属性上的冲突
 *   （如 shot-3"林辰.服装=红色" vs shot-5"林辰.服装=蓝色"）
 *
 * 属性分类（category）：
 * - character: 角色相关（服装/发色/位置等）
 * - scene: 场景相关（时间/氛围等）
 * - prop: 道具相关（位置/状态等）
 * - time: 时间相关（白天/夜晚等，独立于场景）
 * - weather: 天气相关（晴/雨/雪等，独立于场景）
 *
 * 依赖方向：仅依赖同模块（零外部依赖）
 */

// ============================================================================
// 连续性属性分类
// ============================================================================

/**
 * 连续性属性分类。
 *
 * 决定违规检测的策略和严重性：
 * - character: 角色 appearance 一致性（服装/发色等），违规通常为 warning
 * - scene: 场景属性一致性（时间/氛围等），违规通常为 warning
 * - prop: 道具位置/状态一致性，违规通常为 warning
 * - time: 时间一致性（白天/夜晚），违规通常为 error（除非有时间跳转标记）
 * - weather: 天气一致性，违规通常为 warning
 */
export type ContinuityCategory =
  | "character"
  | "scene"
  | "prop"
  | "time"
  | "weather";

// ============================================================================
// 连续性条目
// ============================================================================

/**
 * 单个 shot 在某个属性上的连续性记录。
 *
 * 一个 shot 通常会有多个 entry（每个角色一个服装 entry、每个场景一个时间 entry 等）。
 * entry 是连续性检查的原子单元，相同 key 的 entries 在不同 shot 间进行比对。
 */
export interface ContinuityEntry {
  /** 所属 shot ID */
  shotId: string;
  /** 属性分类 */
  category: ContinuityCategory;
  /**
   * 属性键（用于跨 shot 比对的唯一标识）。
   * 格式示例：
   * - "林辰.服装"（角色 + 属性）
   * - "客栈.时间"（场景 + 属性）
   * - "宝剑.位置"（道具 + 属性）
   */
  key: string;
  /** 属性值（如 "红色" / "夜晚" / "桌上"） */
  value: string;
  /**
   * 是否由用户/ShotContract 明确标记（true）还是 AI 从数据推断（false）。
   * isExplicit=true 的 entry 优先级更高，违规检测时更可信。
   */
  isExplicit: boolean;
}

// ============================================================================
// 违规
// ============================================================================

/**
 * 违规严重性。
 *
 * - warning: 可能的违规，建议用户检查（如服装颜色变化）
 * - error: 明确的违规，必须修复或添加剧情原因（如时间跳转未标记）
 */
export type ViolationSeverity = "warning" | "error";

/**
 * 单个冲突值记录。
 *
 * 用于在 ContinuityViolation.conflictingValues 中标记每个 shot 的值。
 */
export interface ConflictValue {
  /** shot ID */
  shotId: string;
  /** 该 shot 在此属性上的值 */
  value: string;
  /** 该值是否来自用户明确标记 */
  isExplicit: boolean;
}

/**
 * 连续性违规。
 *
 * 同一 key 在多个 shot 中出现冲突值时生成。
 * 用户可参考 suggestedFix 一键应用修复，或在 reason 中标记剧情原因（如时间跳转）。
 */
export interface ContinuityViolation {
  /** 唯一 ID（由 detectViolations 自动生成） */
  id: string;
  /** 涉及的 shot ID 列表（按 sequence 排序） */
  shotIds: string[];
  /** 属性分类 */
  category: ContinuityCategory;
  /** 冲突的属性键 */
  key: string;
  /** 冲突值列表（每个 shot 一个值） */
  conflictingValues: ConflictValue[];
  /** 严重性 */
  severity: ViolationSeverity;
  /** AI 生成的修复建议（由 continuity-violation-fixer 生成，初始为 undefined） */
  suggestedFix?: string;
  /**
   * 剧情原因（如有时间跳转标记或换装说明）。
   * 用户在 UI 中标记后填充，标记后该违规视为"已解释"不再阻止流程。
   */
  reason?: string;
}

// ============================================================================
// 账本
// ============================================================================

/**
 * 完整的连续性账本。
 *
 * 由 ContinuityTracker.buildLedger 产出，包含所有 entries 和 violations。
 * ContinuityLedgerPanel 直接消费此结构渲染 UI。
 */
export interface ContinuityLedger {
  /** 所有 shots 的连续性条目（按 shotId 分组） */
  entries: ContinuityEntry[];
  /** 检测到的所有违规 */
  violations: ContinuityViolation[];
  /** 生成时间戳（用于 UI 显示"X 秒前检查"） */
  generatedAt: number;
  /** 统计：总 shot 数 */
  totalShots: number;
  /** 统计：总 entry 数 */
  totalEntries: number;
  /** 统计：违规数 */
  totalViolations: number;
  /** 统计：error 级违规数 */
  errorCount: number;
  /** 统计：warning 级违规数 */
  warningCount: number;
}

// ============================================================================
// 默认严重性映射
// ============================================================================

/**
 * 不同 category 的默认严重性。
 *
 * time 默认为 error（时间跳转通常需明确标记），
 * 其他默认为 warning（可能是合理变化，需用户判断）。
 */
export const DEFAULT_SEVERITY: Record<ContinuityCategory, ViolationSeverity> = {
  character: "warning",
  scene: "warning",
  prop: "warning",
  time: "error",
  weather: "warning",
};
