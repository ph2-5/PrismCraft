/**
 * P1.5 拆分：阶段转换 Hook（handleNext 调度）。
 *
 * 集中管理 handleNext 及其内部按 stage 拆分的调度函数：
 * - runContentImportNext / runStructureAnalysisNext：拆分到 use-novel-structure-stage-transitions.ts
 *   （涉及 AI 工具调用：analyzeStoryStructure / extractAndMatchEntities / extractTreatment /
 *   buildShotContractsForBeats，是最复杂的业务逻辑）
 * - runPacingPlanningNext：pacing_planning → character_manage（同步转换，无 AI 调用）
 * - runReviewNext：review → storyboard（调用 breakdownTextToShotsTool 生成分镜）
 * - runGenericNext：其他 stage 转换（project_init/character_manage/scene_manage/storyboard/generation）
 */

import { useCallback } from "react";
import { canTransition, transition } from "../import/services/pipeline-machine";
import { breakdownShotsForSegments } from "./pipeline-helpers";
import { useNovelStructureStageTransitions } from "./use-novel-structure-stage-transitions";
import type { UsePipelineStateResult } from "./use-pipeline-state";

export interface UseNovelStageTransitionsOptions {
  state: UsePipelineStateResult["state"];
  setState: UsePipelineStateResult["setState"];
  selectedSegmentIds: string[];
  setIsProcessing: UsePipelineStateResult["setIsProcessing"];
  storyStructure: UsePipelineStateResult["storyStructure"];
  setStoryStructure: UsePipelineStateResult["setStoryStructure"];
  setTreatment: UsePipelineStateResult["setTreatment"];
  setShotContracts: UsePipelineStateResult["setShotContracts"];
  setShots: UsePipelineStateResult["setShots"];
  setPacingConfig: UsePipelineStateResult["setPacingConfig"];
  isMountedRef: UsePipelineStateResult["isMountedRef"];
  canProceed: boolean;
}

export interface UseNovelStageTransitionsResult {
  handleNext: () => Promise<void>;
}

/**
 * 阶段转换 Hook。
 *
 * 接收 state + setter，返回 handleNext。
 * handleNext 内部按 state.stage 调度到 5 个独立的 stage 处理函数。
 */
export function useNovelStageTransitions({
  state,
  setState,
  selectedSegmentIds,
  setIsProcessing,
  storyStructure,
  setStoryStructure,
  setTreatment,
  setShotContracts,
  setShots,
  setPacingConfig,
  isMountedRef,
  canProceed,
}: UseNovelStageTransitionsOptions): UseNovelStageTransitionsResult {
  // 复杂 stage 调度函数（content_import + structure_analysis，涉及 AI 工具调用）
  const { runContentImportNext, runStructureAnalysisNext } = useNovelStructureStageTransitions({
    state,
    setState,
    storyStructure,
    setStoryStructure,
    setTreatment,
    setShotContracts,
    setPacingConfig,
    setIsProcessing,
    isMountedRef,
  });

  /** pacing_planning → character_manage：同步转换，无 AI 调用 */
  const runPacingPlanningNext = useCallback(async () => {
    setState((prev) =>
      canTransition(prev.stage, "character_manage")
        ? transition(prev, "character_manage")
        : prev,
    );
  }, [setState]);

  /** review → storyboard：调用 breakdownTextToShotsTool 生成分镜 */
  const runReviewNext = useCallback(async () => {
    setIsProcessing(true);
    try {
      const selectedSegments = state.segments.filter((s) =>
        selectedSegmentIds.includes(s.id),
      );
      const charactersJson = JSON.stringify(state.characters);
      const orderedShots = await breakdownShotsForSegments(
        selectedSegments,
        charactersJson,
        () => isMountedRef.current,
      );
      if (!orderedShots) return;

      setShots(orderedShots);

      setState((prev) =>
        canTransition(prev.stage, "storyboard")
          ? transition(prev, "storyboard")
          : prev,
      );
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, [
    state.segments,
    state.characters,
    selectedSegmentIds,
    setState,
    setIsProcessing,
    setShots,
    isMountedRef,
  ]);

  /** 其他 stage 转换：纯同步转换 */
  const runGenericNext = useCallback(() => {
    setState((prev) => {
      switch (prev.stage) {
        case "project_init":
          return canTransition(prev.stage, "content_import")
            ? transition(prev, "content_import")
            : prev;
        case "character_manage":
          return canTransition(prev.stage, "scene_manage")
            ? transition(prev, "scene_manage")
            : prev;
        case "scene_manage":
          return canTransition(prev.stage, "review")
            ? transition(prev, "review")
            : prev;
        case "storyboard":
          return canTransition(prev.stage, "generation")
            ? transition(prev, "generation")
            : prev;
        case "generation":
          return canTransition(prev.stage, "done")
            ? transition(prev, "done")
            : prev;
        default:
          return prev;
      }
    });
  }, [setState]);

  // 主 handleNext 调度
  const handleNext = useCallback(async () => {
    if (!canProceed) return;

    if (state.stage === "content_import") {
      await runContentImportNext();
      return;
    }
    if (state.stage === "structure_analysis") {
      await runStructureAnalysisNext();
      return;
    }
    if (state.stage === "pacing_planning") {
      await runPacingPlanningNext();
      return;
    }
    if (state.stage === "review") {
      await runReviewNext();
      return;
    }
    runGenericNext();
  }, [
    canProceed,
    state.stage,
    runContentImportNext,
    runStructureAnalysisNext,
    runPacingPlanningNext,
    runReviewNext,
    runGenericNext,
  ]);

  return { handleNext };
}
