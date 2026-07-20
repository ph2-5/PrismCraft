/**
 * P1.5 拆分：派生渲染标志 Hook。
 *
 * 接收 PipelineState（只读），计算所有派生 UI 标志：
 * - stagesForMode：当前模式下的阶段列表（用于进度条显示）
 * - canProceed：当前阶段是否允许进入下一步
 * - showImportStep / showSegmentList / showStructureAnalysis / showPacingPlanning /
 *   showEntityReview / showShotBreakdown / showFinalize / isDone：UI 区块显示标志
 *
 * 唯一的 effect：state.stage === "done" 时调用 onComplete 回调。
 *
 * 不修改任何 state，是纯派生 Hook。
 */

import { useMemo, useEffect } from "react";
import type { PipelineStage } from "../domain/types";
import { getStagesForMode } from "../import/services/pipeline-machine";
import type { UsePipelineStateResult } from "./use-pipeline-state";

export interface UsePipelineDerivedFlagsOptions {
  state: UsePipelineStateResult["state"];
  selectedSegmentIds: string[];
  isProcessing: boolean;
  shots: UsePipelineStateResult["shots"];
  onComplete: () => void;
}

export interface UsePipelineDerivedFlagsResult {
  stagesForMode: PipelineStage[];
  canProceed: boolean;
  showImportStep: boolean;
  showSegmentList: boolean;
  showStructureAnalysis: boolean;
  showPacingPlanning: boolean;
  showEntityReview: boolean;
  showShotBreakdown: boolean;
  showFinalize: boolean;
  isDone: boolean;
}

/**
 * 派生渲染标志 Hook。
 *
 * 接收 state 等只读参数，计算并返回所有派生 UI 标志。
 */
export function usePipelineDerivedFlags({
  state,
  selectedSegmentIds,
  isProcessing,
  shots,
  onComplete,
}: UsePipelineDerivedFlagsOptions): UsePipelineDerivedFlagsResult {
  // 根据当前模式计算阶段子集（用于进度条显示）
  const stagesForMode = useMemo(
    () => getStagesForMode(state.config.aiAssistLevel),
    [state.config.aiAssistLevel],
  );

  // 当前阶段是否允许进入下一步
  const canProceed = useMemo((): boolean => {
    if (isProcessing) return false;
    switch (state.stage) {
      case "project_init":
        return state.rawText.trim().length > 0;
      case "content_import":
        return selectedSegmentIds.length > 0;
      case "structure_analysis":
        // Task 2A.13：professional 模式经过此阶段，AI 识别 beats 后允许下一步
        // 失败时 storyStructure 为 null，但仍允许跳过到 character_manage（不阻塞流程）
        return true;
      case "pacing_planning":
        // Task 2A.14：professional 模式经过此阶段，用户调整节奏配置后允许下一步
        return true;
      case "character_manage":
      case "scene_manage":
        return (
          state.characters.length > 0 &&
          state.characters.every((c) => c.confirmed) &&
          state.scenes.every((s) => s.confirmed)
        );
      case "review":
      case "storyboard":
        return shots.length > 0;
      case "generation":
        return true;
      case "done":
        return false;
      default:
        return false;
    }
  }, [state, selectedSegmentIds, isProcessing, shots]);

  // 派生渲染标志（UI 区块显示控制）
  const showImportStep =
    state.stage === "project_init" ||
    (state.stage === "content_import" && state.rawText.length === 0);
  const showSegmentList = state.stage === "content_import" && state.rawText.length > 0;
  // Task 2A.13：professional 模式专属 — 显示叙事结构分析面板
  const showStructureAnalysis = state.stage === "structure_analysis";
  // Task 2A.14：professional 模式专属 — 显示节奏规划面板
  const showPacingPlanning = state.stage === "pacing_planning";
  const showEntityReview =
    state.stage === "character_manage" || state.stage === "scene_manage";
  const showShotBreakdown = state.stage === "review" || state.stage === "storyboard";
  const showFinalize = state.stage === "generation";
  const isDone = state.stage === "done";

  // done 阶段调用 onComplete
  useEffect(() => {
    if (state.stage === "done") {
      onComplete();
    }
  }, [state.stage, onComplete]);

  return {
    stagesForMode,
    canProceed,
    showImportStep,
    showSegmentList,
    showStructureAnalysis,
    showPacingPlanning,
    showEntityReview,
    showShotBreakdown,
    showFinalize,
    isDone,
  };
}
