/**
 * Pipeline State Machine — Task 2A.3
 *
 * 小说导入管道的状态机：定义阶段顺序、合法转换、三档模式跳过规则、失败重试。
 *
 * 核心概念：
 * - STAGE_ORDER: 10 阶段的完整顺序（project_init → done）
 * - VALID_TRANSITIONS: 合法的前后阶段映射（含 v5.1 三档模式的跳过路径）
 * - getStagesForMode: 三档模式（quick/standard/professional）→ 阶段子集
 * - retryStage: 失败恢复，重置指定阶段数据（不改变 stage 单向流动语义）
 *
 * v5.1 三档模式：
 * - quick (3步核心): 导入 → 角色/场景 → 生成
 * - standard (6步): + 场景管理 + review + storyboard
 * - professional (8步): + structure_analysis + pacing_planning
 *
 * 依赖方向：仅依赖 novel/domain/types（零外部依赖，纯函数模块）
 */

import type { PipelineStage, PipelineState, PipelineConfig } from "../../domain/types";
import { t } from "@/shared/constants/messages";

// ============================================================================
// 1. 阶段顺序 & 合法转换
// ============================================================================

/**
 * 10 阶段的完整顺序（v5.1 统一命名）。
 * structure_analysis（Task 2A.13）和 pacing_planning（Task 2A.14）为 v5.1 新增。
 */
export const STAGE_ORDER: PipelineStage[] = [
  "project_init",        // 阶段 1: 项目初始化
  "content_import",      // 阶段 2: 内容导入与分割
  "structure_analysis",  // 阶段: 故事结构分析（v5.1 新增，Task 2A.13）
  "pacing_planning",     // 阶段: 节奏规划（v5.1 新增，Task 2A.14）
  "character_manage",    // 阶段 3: 角色管理
  "scene_manage",        // 阶段 4: 场景管理
  "review",              // 阶段 5: 检查与调优
  "storyboard",          // 阶段 6: 剧本化（Prompt 合成）
  "generation",          // 阶段 7: 生成
  "done",
];

/**
 * 合法的前后阶段转换映射。
 *
 * v5.1 三档模式跳过路径：
 * - content_import → structure_analysis（professional）或 character_manage（quick/standard 跳过 structure）
 * - structure_analysis → pacing_planning（professional）或 character_manage（standard 跳过 pacing）
 */
export const VALID_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  project_init:        ["content_import"],
  content_import:      ["structure_analysis", "character_manage"],  // quick/standard 可跳过 structure
  structure_analysis:  ["pacing_planning", "character_manage"],     // standard 可跳过 pacing
  pacing_planning:     ["character_manage"],
  character_manage:    ["scene_manage"],
  scene_manage:        ["review"],
  review:              ["storyboard"],
  storyboard:          ["generation"],
  generation:          ["done"],
  done:                [],
};

// ============================================================================
// 2. 转换函数
// ============================================================================

/** 判断 from → to 是否为合法转换 */
export function canTransition(from: PipelineStage, to: PipelineStage): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * 执行状态转换。
 * @throws Error 如果转换不合法
 */
export function transition(state: PipelineState, to: PipelineStage): PipelineState {
  if (!canTransition(state.stage, to)) {
    throw new Error(t("error.invalidStateTransition", { from: state.stage, to }));
  }
  return { ...state, stage: to, step: 1 };
}

// ============================================================================
// 3. 自动模式 gates 控制
// ============================================================================

/**
 * 根据配置计算实际生效的 gates。
 * - auto 模式：confirmSegments 跟随用户配置，confirmShots/confirmPrompts 强制关闭
 * - semi 模式：所有 gates 默认开启（用户逐步确认）
 *
 * 注：confirmSegments 在 auto 模式下仍跟随用户配置——用户可能希望在自动流程中
 * 仍手动确认段落分割（影响后续所有阶段）。
 */
export function getAutoGates(config: PipelineConfig): PipelineConfig["gates"] {
  return {
    confirmSegments: config.gates.confirmSegments,  // 始终跟随用户配置（auto 模式下也允许手动确认段落）
    confirmEntities: true,                          // 角色/场景确认始终开启（避免错误创建）
    confirmShots: config.mode !== "auto",           // auto 模式强制关闭
    confirmPrompts: config.mode !== "auto",         // auto 模式强制关闭
  };
}

/** 判断在指定阶段是否需要暂停等待用户确认 */
export function shouldPauseAtStage(stage: PipelineStage, gates: PipelineConfig["gates"]): boolean {
  const map: Partial<Record<PipelineStage, boolean>> = {
    content_import:   gates.confirmSegments,
    character_manage: gates.confirmEntities,
    review:           gates.confirmShots,
    storyboard:       gates.confirmPrompts,
  };
  return map[stage] ?? false;
}

// ============================================================================
// 4. 三档模式 → 阶段子集（v5.1 Task 2A.16）
// ============================================================================

/**
 * 根据三档模式返回阶段子集。
 *
 * - quick: 5 阶段（导入 → 角色管理 → 生成）— 跳过 scene_manage/review/storyboard
 * - standard: 8 阶段（跳过 structure_analysis + pacing_planning）
 * - professional: 完整 10 阶段
 *
 * 注：返回的阶段顺序与 STAGE_ORDER 一致，调用方据此决定是否跳过某些阶段。
 */
export function getStagesForMode(mode: PipelineConfig["aiAssistLevel"]): PipelineStage[] {
  switch (mode) {
    case "quick":
      // 快速模式：5 阶段（导入 → 角色管理 → 生成）
      return ["project_init", "content_import", "character_manage", "generation", "done"];
    case "standard":
      // 标准模式：8 阶段（跳过 structure + pacing）
      return [
        "project_init", "content_import",
        "character_manage", "scene_manage", "review", "storyboard",
        "generation", "done",
      ];
    case "professional":
      // 专业模式：完整 10 阶段
      return STAGE_ORDER;
  }
}

// ============================================================================
// 5. 失败恢复机制
// ============================================================================

/**
 * 重试指定阶段（失败恢复）。
 *
 * 语义：将 stage 回退到指定阶段，并清空该阶段的 stepData。
 * 不违反"stage 单向流动"语义——这是"重做"而非"回退"：
 * - 只能重试当前阶段或之前的阶段（retryIndex <= currentIndex）
 * - 重试后用户需要重新执行该阶段及其后续阶段
 *
 * @throws Error 如果指定的阶段在当前阶段之后（不允许向前重试）
 */
export function retryStage(state: PipelineState, stage: PipelineStage): PipelineState {
  const currentIndex = STAGE_ORDER.indexOf(state.stage);
  const retryIndex = STAGE_ORDER.indexOf(stage);
  if (retryIndex < 0) {
    throw new Error(t("error.invalidPhase"));
  }
  if (retryIndex > currentIndex) {
    throw new Error(t("error.cannotRetryPhase", { current: state.stage, target: stage }));
  }
  return {
    ...state,
    stage,
    step: 1,
    stepData: {
      ...state.stepData,
      [stage]: undefined,
    },
  };
}

/**
 * 失败回退策略（用户可手动选择替代方案）。
 * key 为失败的操作类型，value 为建议的回退动作。
 */
export const FALLBACK_STRATEGIES: Record<string, string> = {
  extracting: "手动输入角色",
  segmenting: "手动划分段落",
  breaking: "手动输入分镜",
};

/**
 * 获取指定阶段可重试的阶段列表（当前阶段 + 之前的所有阶段）。
 * 用于 UI 显示"重新执行"按钮的可选阶段。
 */
export function getRetryableStages(currentStage: PipelineStage): PipelineStage[] {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  if (currentIndex < 0) return [];
  // 包含当前阶段和之前所有阶段，但排除 done（已完成不需要重试）
  return STAGE_ORDER.slice(0, currentIndex + 1).filter((s) => s !== "done");
}

// ============================================================================
// 6. 阶段回退（v5.2 放宽流程限制）
// ============================================================================

/**
 * 判断当前阶段是否可以回退到 target 阶段。
 *
 * 语义：回退 ≠ 重试。回退保留所有已生成数据（characters/scenes/shots 等），
 * 仅切换 stage 让用户查看或微调之前的步骤。重试会清空 stepData。
 *
 * 规则：target 必须在 STAGE_ORDER 中且 index < currentStage index（不允许向后跳）。
 * 允许跨多阶段回退（如 character_manage → content_import）。
 *
 * @param currentStage 当前阶段
 * @param target 目标阶段
 * @returns 是否允许回退
 */
export function canGoBackTo(currentStage: PipelineStage, target: PipelineStage): boolean {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const targetIndex = STAGE_ORDER.indexOf(target);
  if (currentIndex < 0 || targetIndex < 0) return false;
  // 仅允许向回退（targetIndex < currentIndex），不允许向前跳过
  // project_init 是初始阶段，不允许回退到它之前；done 不允许回退
  if (currentStage === "done") return false;
  return targetIndex < currentIndex;
}

/**
 * 执行阶段回退（不清空数据）。
 *
 * 与 transition() 不同：
 * - transition() 严格按 VALID_TRANSITIONS 单步前进
 * - goBackTo() 允许跨阶段回退，保留所有 stepData
 *
 * @throws Error 如果不允许回退到目标阶段
 */
export function goBackTo(state: PipelineState, target: PipelineStage): PipelineState {
  if (!canGoBackTo(state.stage, target)) {
    throw new Error(t("error.invalidStateTransition", { from: state.stage, to: target }));
  }
  // 保留所有 stepData，仅切换 stage
  return { ...state, stage: target, step: 1 };
}

/**
 * 获取当前阶段的上一个阶段（用于"上一步"按钮）。
 * 返回 null 表示没有上一阶段（如 project_init）。
 */
export function getPreviousStage(currentStage: PipelineStage): PipelineStage | null {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  if (currentIndex <= 0) return null;
  return STAGE_ORDER[currentIndex - 1] ?? null;
}

// ============================================================================
// 7. 阶段自由跳转（v5.2 放宽流程限制 — 用户要求"想换到哪个页面就换到哪个页面"）
// ============================================================================

/**
 * 判断是否允许从 currentStage 跳转到 targetStage。
 *
 * v5.2：用户要求完全自由切换 stage，因此允许任意方向跳转：
 * - 向前跳（targetIndex > currentIndex）：允许，但保留已生成数据
 * - 向后跳（targetIndex < currentIndex）：允许，等同回退
 * - 同阶段跳转：禁止（无意义）
 *
 * 仅禁止：currentStage 或 target 不在 STAGE_ORDER 中。
 *
 * @param currentStage 当前阶段
 * @param target 目标阶段
 * @returns 是否允许跳转
 */
export function canJumpTo(currentStage: PipelineStage, target: PipelineStage): boolean {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const targetIndex = STAGE_ORDER.indexOf(target);
  if (currentIndex < 0 || targetIndex < 0) return false;
  return currentStage !== target;
}

/**
 * 执行阶段跳转（保留所有数据，仅切换 stage）。
 *
 * 与 transition()/goBackTo() 的区别：
 * - transition()：严格按 VALID_TRANSITIONS 单步前进
 * - goBackTo()：仅允许回退
 * - jumpTo()：允许任意方向跳转，保留所有 stepData
 *
 * 调用方需自行处理"跳到未处理阶段"的 UI 状态（如显示空数据 + 提示按钮）。
 *
 * @throws Error 如果不允许跳转到目标阶段
 */
export function jumpTo(state: PipelineState, target: PipelineStage): PipelineState {
  if (!canJumpTo(state.stage, target)) {
    throw new Error(t("error.invalidStateTransition", { from: state.stage, to: target }));
  }
  // 保留所有 stepData，仅切换 stage
  return { ...state, stage: target, step: 1 };
}
