/**
 * Task 2A.17 — 过期标记类型定义
 *
 * 定义跨 Task 联动的过期传播规则。
 *
 * 设计原则：
 * - 用计数器/列表而非布尔值（参考 useDirtyState.suppressDirtyCountRef 模式）
 * - 支持嵌套场景（多个上游变化同时标记 stale）
 * - 持久化到 PipelineState，关闭应用后恢复（restore 方法）
 *
 * 依赖方向：仅依赖同模块（零外部依赖）
 */

// ============================================================================
// 过期源 / 目标 / 触发类型
// ============================================================================

/**
 * 过期源：哪个 Task 的产出变化导致的过期。
 *
 * 对应 Phase 2A 各 Task：
 * - structure: Task 2A.13 故事结构变化
 * - pacing: Task 2A.14 节奏规划变化
 * - sceneVariant: Task 2A.10 场景变体变化
 * - character: Task 2A.4 角色提取变化
 * - scene: Task 2A.4 场景提取变化
 * - importance: Task 2A.5 重要性变化
 * - mode: Task 2A.16 模式切换
 * - segment: Task 2A.0 片段重新分割
 */
export type StalenessSource =
  | "structure"
  | "pacing"
  | "sceneVariant"
  | "character"
  | "scene"
  | "importance"
  | "mode"
  | "segment";

/**
 * 过期目标：哪些下游 Task 需要重新计算。
 *
 * - structure: segment 变 → structure 需重新分析（既是 source 又是 target）
 * - pacing: structure 变 → pacing 重算
 * - importance: structure/character/scene 变 → importance 重算（叙事功能变化）
 * - prompt: pacing/importance/sceneVariant 变 → prompt 重算
 * - shotRecommend: sceneVariant 变 → 镜头推荐更新
 * - overview: 任意上游变 → 概览视图刷新
 * - beats: pacing 变 → beats 时长更新
 */
export type StalenessTarget =
  | "structure"
  | "pacing"
  | "importance"
  | "prompt"
  | "shotRecommend"
  | "overview"
  | "beats";

/**
 * 触发类型分类。
 *
 * - auto_recompute: 自动重算（如 sceneVariant→shotRecommend）
 * - stale_marker: 仅标记 stale，用户进入时提示
 * - manual_confirm: 提示"已变化，是否重新生成"
 */
export type TriggerType = "auto_recompute" | "stale_marker" | "manual_confirm";

// ============================================================================
// 传播规则表（DAG 邻接表）
// ============================================================================

/**
 * 过期传播规则表。
 *
 * 描述 8 个 StalenessSource × 6 个 StalenessTarget 的传播关系（DAG）。
 * 含义：source 变化时，列表中的 targets 都需要标记 stale。
 *
 * 设计：mode 切换不触发过期（仅切换 UI，由 handleSelectMode 重置 state）。
 */
export const STALENESS_PROPAGATION: Record<StalenessSource, StalenessTarget[]> = {
  structure: ["pacing", "importance", "prompt", "overview"],
  pacing: ["prompt", "beats", "overview"],
  sceneVariant: ["shotRecommend", "prompt", "overview"],
  character: ["importance", "prompt", "overview"],
  scene: ["importance", "prompt", "overview"],
  importance: ["prompt", "overview"],
  mode: [], // 模式切换不触发过期，仅切换 UI
  segment: ["structure", "pacing", "importance", "prompt", "overview"],
};

// ============================================================================
// 触发类型映射
// ============================================================================

/**
 * 触发类型映射：哪些联动自动重算，哪些需用户确认。
 *
 * 设计原则：
 * - 影响范围大 / 代价高 → manual_confirm（询问用户）
 * - 影响范围中 / 代价低 → stale_marker（进入时提示）
 * - 影响范围小 / 立即响应 → auto_recompute
 */
export const TRIGGER_TYPE: Record<StalenessSource, TriggerType> = {
  structure: "stale_marker", // 结构变化影响范围大，标记后用户进入时提示
  pacing: "manual_confirm", // 节奏变化影响 prompt，询问用户
  sceneVariant: "auto_recompute", // 变体变化立即更新镜头推荐
  character: "stale_marker", // 角色变化标记 importance 和 prompt
  scene: "stale_marker",
  importance: "stale_marker",
  mode: "auto_recompute", // 模式切换自动切换 UI
  segment: "manual_confirm", // 重新分割影响巨大，必须用户确认
};

// ============================================================================
// 过期条目结构
// ============================================================================

/**
 * 单个过期条目。
 *
 * 一个 target 可能同时被多个 source 标记 stale（如 prompt 被 pacing+importance 同时标记），
 * 因此 staleMap 是 Map<StalenessTarget, StaleEntry[]> 而非 Map<StalenessTarget, boolean>。
 */
export interface StaleEntry {
  /** 过期源（哪个 Task 的变化导致的） */
  source: StalenessSource;
  /** 影响的下游 targets 列表（来自 STALENESS_PROPAGATION） */
  targets: StalenessTarget[];
  /** 触发类型（来自 TRIGGER_TYPE） */
  triggerType: TriggerType;
  /** 标记时间戳（用于 UI 显示"X 秒前"） */
  timestamp: number;
  /** 人类可读的原因（如"用户调整了故事结构 beats"） */
  reason: string;
  /** 影响范围（可选，未指定则全部 segment） */
  affectedSegmentIds?: string[];
}

// ============================================================================
// 事件总线事件类型
// ============================================================================

/**
 * Task 2A.17 新增的事件类型。
 *
 * 注：eventBus 支持未类型化的字符串重载，这些类型仅供订阅方作为类型提示使用。
 * 实际事件名以字符串形式 emit（如 eventBus.emit("novel:stale-changed", data)）。
 */
export interface NovelIntegrationEvents {
  "novel:stale-changed": {
    source: StalenessSource;
    targets: StalenessTarget[];
    triggerType: TriggerType;
    reason: string;
  };
  "novel:auto-recompute": {
    source: StalenessSource;
    targets: StalenessTarget[];
  };
  "novel:stale-cleared": {
    target: StalenessTarget | "all";
  };
  "novel:mode-switched": {
    from: "quick" | "standard" | "professional";
    to: "quick" | "standard" | "professional";
  };
}

/** Novel 集成层事件名集合（用于 eventBus.emit/on 的字符串参数） */
export const NOVEL_INTEGRATION_EVENTS = [
  "novel:stale-changed",
  "novel:auto-recompute",
  "novel:stale-cleared",
  "novel:mode-switched",
] as const;

/** Novel 集成层事件名类型 */
export type NovelIntegrationEventName = (typeof NOVEL_INTEGRATION_EVENTS)[number];
