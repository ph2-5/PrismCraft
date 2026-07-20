/**
 * P1.5 细化拆分：复杂 stage 调度函数 Hook。
 *
 * 从 useNovelStageTransitions 进一步拆出，集中管理涉及 AI 工具调用的两个复杂 stage：
 * - runContentImportNext：content_import → structure_analysis | character_manage
 *   professional 模式调用 analyzeStoryStructure，quick/standard 调用 extractAndMatchEntities
 * - runStructureAnalysisNext：structure_analysis → pacing_planning
 *   并行调用 extractAndMatchEntities + extractTreatment，再 buildShotContractsForBeats
 *
 * 这两个函数是 useNovelPipeline 中最复杂的业务逻辑，单独拆出便于维护。
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
  toCharactersInPipeline,
  toScenesInPipeline,
} from "./pipeline-helpers";
import type { UsePipelineStateResult } from "./use-pipeline-state";

export interface UseNovelStructureStageOptions {
  state: UsePipelineStateResult["state"];
  setState: UsePipelineStateResult["setState"];
  storyStructure: UsePipelineStateResult["storyStructure"];
  setStoryStructure: UsePipelineStateResult["setStoryStructure"];
  setTreatment: UsePipelineStateResult["setTreatment"];
  setShotContracts: UsePipelineStateResult["setShotContracts"];
  setPacingConfig: UsePipelineStateResult["setPacingConfig"];
  setIsProcessing: UsePipelineStateResult["setIsProcessing"];
  isMountedRef: UsePipelineStateResult["isMountedRef"];
}

export interface UseNovelStructureStageResult {
  runContentImportNext: () => Promise<void>;
  runStructureAnalysisNext: () => Promise<void>;
}

/**
 * 复杂 stage 调度函数 Hook（content_import + structure_analysis）。
 */
export function useNovelStructureStageTransitions({
  state,
  setState,
  storyStructure,
  setStoryStructure,
  setTreatment,
  setShotContracts,
  setPacingConfig,
  setIsProcessing,
  isMountedRef,
}: UseNovelStructureStageOptions): UseNovelStructureStageResult {
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
    state.config.aiAssistLevel, state.rawText, state.segments,
    setState, setIsProcessing, setStoryStructure,
    setTreatment, setShotContracts, setPacingConfig, isMountedRef,
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
    storyStructure, state.rawText, state.segments,
    setState, setIsProcessing, setTreatment, setShotContracts, isMountedRef,
  ]);

  return { runContentImportNext, runStructureAnalysisNext };
}
