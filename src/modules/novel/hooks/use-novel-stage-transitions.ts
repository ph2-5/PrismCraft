/**
 * P1.5 拆分：阶段转换 Hook（从 useNovelTools 进一步拆分）。
 *
 * 集中管理 handleNext 及其内部按 stage 拆分的 5 个调度函数：
 * - runContentImportNext：content_import → structure_analysis | character_manage
 * - runStructureAnalysisNext：structure_analysis → pacing_planning
 * - runPacingPlanningNext：pacing_planning → character_manage
 * - runReviewNext：review → storyboard
 * - runGenericNext：其他 stage 转换
 *
 * 这些函数涉及 AI 工具调用（analyzeStoryStructure / extractAndMatchEntities /
 * extractTreatment / buildShotContractsForBeats / breakdownTextToShotsTool），
 * 是 useNovelPipeline 中最复杂的业务逻辑。
 */

import { useCallback } from "react";
import { errorLogger } from "@/shared/error-logger";
import {
  analyzeStoryStructure,
  extractTreatment,
  buildShotContractsForBeats,
} from "../structure";
import { DEFAULT_PACING_CONFIG } from "../pacing";
import { canTransition, transition } from "../import/services/pipeline-machine";
import {
  createGenerateTextFn,
  extractAndMatchEntities,
  breakdownShotsForSegments,
  toCharactersInPipeline,
  toScenesInPipeline,
} from "./pipeline-helpers";
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
  /**
   * content_import 阶段处理：
   * - professional 模式：调用 analyzeStoryStructure → structure_analysis
   * - quick/standard 模式：调用 extractAndMatchEntities → character_manage
   */
  const runContentImportNext = useCallback(async () => {
    setIsProcessing(true);
    try {
      // Task 2A.13：professional 模式先进入 structure_analysis
      if (state.config.aiAssistLevel === "professional") {
        const generateTextFn = createGenerateTextFn();
        // M-3 修复：进入 structure_analysis 前清空 treatment/shotContracts
        setTreatment(null);
        setShotContracts([]);
        // Task 2A.14：进入 structure_analysis 前重置 pacingConfig
        setPacingConfig(DEFAULT_PACING_CONFIG);
        try {
          const result = await analyzeStoryStructure(state.segments, generateTextFn);
          if (!isMountedRef.current) return;
          setStoryStructure(result.success ? result.data : null);
          if (!result.success) {
            errorLogger.warn(
              "[useNovelPipeline] analyzeStoryStructure 返回失败，storyStructure 设为 null",
              new Error(result.error),
            );
          }
        } catch (err) {
          errorLogger.warn("[useNovelPipeline] analyzeStoryStructure 失败，跳过结构分析阶段", err);
          setStoryStructure(null);
        }

        setState((prev) =>
          canTransition(prev.stage, "structure_analysis")
            ? transition(prev, "structure_analysis")
            : prev,
        );
        return;
      }

      // quick/standard 模式：直接提取角色/场景并进入 character_manage
      const entityResult = await extractAndMatchEntities(
        state.rawText,
        () => isMountedRef.current,
      );
      if (!entityResult) return;

      const newCharacters = toCharactersInPipeline(entityResult.characters);
      const newScenes = toScenesInPipeline(entityResult.scenes);

      setState((prev) =>
        canTransition(prev.stage, "character_manage")
          ? {
              ...transition(prev, "character_manage"),
              characters: newCharacters,
              scenes: newScenes,
            }
          : prev,
      );
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, [
    state.config.aiAssistLevel,
    state.rawText,
    state.segments,
    setState,
    setIsProcessing,
    setStoryStructure,
    setTreatment,
    setShotContracts,
    setPacingConfig,
    isMountedRef,
  ]);

  /**
   * structure_analysis → pacing_planning 阶段处理：
   * - 调用 extractTreatment 提取 StoryTreatment
   * - 调用 buildShotContractsForBeats 构建镜头契约
   * - 若 structure 分析未做（storyStructure 为 null），直接进入 character_manage
   */
  const runStructureAnalysisNext = useCallback(async () => {
    // 无 storyStructure 时直接进入 character_manage（structure 分析失败的降级路径）
    if (!storyStructure) {
      setState((prev) =>
        canTransition(prev.stage, "character_manage")
          ? transition(prev, "character_manage")
          : prev,
      );
      return;
    }

    setIsProcessing(true);
    try {
      const generateTextFn = createGenerateTextFn();
      const [entityResult, treatmentResult] = await Promise.all([
        extractAndMatchEntities(state.rawText, () => isMountedRef.current),
        extractTreatment(state.segments, generateTextFn),
      ]);
      if (!isMountedRef.current) return;

      if (entityResult) {
        const newCharacters = toCharactersInPipeline(entityResult.characters);
        const newScenes = toScenesInPipeline(entityResult.scenes);

        // Task 2A.13：professional 模式经过 pacing_planning，先转换到 pacing_planning
        setState((prev) =>
          canTransition(prev.stage, "pacing_planning")
            ? {
                ...transition(prev, "pacing_planning"),
                characters: newCharacters,
                scenes: newScenes,
              }
            : prev,
        );
      } else {
        setState((prev) =>
          canTransition(prev.stage, "pacing_planning")
            ? transition(prev, "pacing_planning")
            : prev,
        );
      }

      // Task 2A.13：并行处理 treatment（成功时 set，失败时 set null，不阻塞流程）
      if (treatmentResult.success) {
        setTreatment(treatmentResult.data ?? null);
      } else {
        errorLogger.warn(
          "[useNovelPipeline] extractTreatment 返回失败，treatment 设为 null",
          new Error(treatmentResult.error),
        );
        setTreatment(null);
      }

      // 构建镜头契约（仅在 treatment 提取成功时执行）
      if (treatmentResult.success && treatmentResult.data) {
        try {
          const treatmentData = treatmentResult.data;
          const contractsResult = await buildShotContractsForBeats(
            storyStructure.beats,
            state.segments,
            generateTextFn,
            treatmentData,
          );
          if (!isMountedRef.current) return;
          setShotContracts(contractsResult.data);
          if (contractsResult.errors.length > 0) {
            errorLogger.warn(
              "[useNovelPipeline] buildShotContractsForBeats 部分 beat 失败",
              new Error(contractsResult.errors.join("; ")),
            );
          }
        } catch (err) {
          errorLogger.warn("[useNovelPipeline] buildShotContractsForBeats 失败，跳过镜头契约生成", err);
          setShotContracts([]);
        }
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, [
    storyStructure,
    state.rawText,
    state.segments,
    setState,
    setIsProcessing,
    setTreatment,
    setShotContracts,
    isMountedRef,
  ]);

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
