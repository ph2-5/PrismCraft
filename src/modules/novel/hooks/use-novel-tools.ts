/**
 * P1.5 拆分：业务 Handlers 组合 Hook（不含 handleNext）。
 *
 * 作为组合 hook，协调 3 个子 handler hook：
 * - useNovelImportHandlers — handleImport / handleToggle / handleSelectAll
 * - useNovelEntityHandlers — handleConfirmCharacter/Scene / handleEditCharacter/Scene / handleMatchCharacter
 * - useNovelModeHandlers — handleSelectMode / handleLoadSampleProject / handleQuickGenerate /
 *   handleAutoRun / setCurrentSegmentIndex / setRawText / handleWorkflowModeChange
 *
 * 自身仅保留 Shot/Structure/Pacing 相关 handlers（逻辑简单且短小）。
 *
 * handleNext 已拆分到 use-novel-stage-transitions.ts（5 个 stage 调度函数）。
 */

import { useCallback } from "react";
import type { ShotBreakdown } from "../domain/types";
import { recalculateStoryStructure, type NarrativeBeat } from "../structure";
import { DEFAULT_PACING_CONFIG, type PacingResult } from "../pacing";
import type { SampleProject } from "../services/sample-projects";
import type { WorkflowMode } from "../workflow";
import type { ExtractedCharacter, ExtractedScene } from "../domain/types";
import { useNovelImportHandlers } from "./use-novel-import-handlers";
import { useNovelEntityHandlers } from "./use-novel-entity-handlers";
import { useNovelModeHandlers } from "./use-novel-mode-handlers";
import type { UsePipelineStateResult } from "./use-pipeline-state";

export interface UseNovelToolsOptions {
  state: UsePipelineStateResult["state"];
  setState: UsePipelineStateResult["setState"];
  setSelectedSegmentIds: UsePipelineStateResult["setSelectedSegmentIds"];
  isProcessing: boolean;
  setIsProcessing: UsePipelineStateResult["setIsProcessing"];
  setShots: UsePipelineStateResult["setShots"];
  setStoryStructure: UsePipelineStateResult["setStoryStructure"];
  setTreatment: UsePipelineStateResult["setTreatment"];
  setShotContracts: UsePipelineStateResult["setShotContracts"];
  setPacingConfig: UsePipelineStateResult["setPacingConfig"];
  setWorkflowMode: UsePipelineStateResult["setWorkflowMode"];
  isMountedRef: UsePipelineStateResult["isMountedRef"];
}

export interface UseNovelToolsResult {
  handleImport: (text: string) => Promise<void>;
  handleToggle: (id: string) => void;
  handleSelectAll: () => void;
  handleConfirmCharacter: (id: string) => void;
  handleConfirmScene: (id: string) => void;
  handleEditCharacter: (c: ExtractedCharacter) => void;
  handleEditScene: (s: ExtractedScene) => void;
  handleMatchCharacter: (id: string, existingId: string) => Promise<void>;
  handleEditShot: (shot: ShotBreakdown) => void;
  handleReorderShots: (from: number, to: number) => void;
  handleGeneratePrompts: () => void;
  handleAutoRun: () => void;
  setCurrentSegmentIndex: (index: number) => void;
  // Task 2A.13 Structure 面板 handlers
  handleBeatsChange: (beats: NarrativeBeat[]) => void;
  handleShotContractsChange: (contracts: UsePipelineStateResult["shotContracts"]) => void;
  // Task 2A.14 Pacing 面板 handlers
  handlePacingConfigChange: (config: UsePipelineStateResult["pacingConfig"]) => void;
  handleApplyPacing: (result: PacingResult) => void;
  handleResetPacing: () => void;
  // Task 2A.16 三档模式 + 示例项目 handlers
  handleSelectMode: (level: "quick" | "standard" | "professional") => void;
  handleLoadSampleProject: (project: SampleProject) => void;
  handleQuickGenerate: () => Promise<void>;
  setRawText: (text: string) => void;
  // Task 2A.19 工作流模式
  handleWorkflowModeChange: (mode: WorkflowMode) => void;
}

/**
 * 业务 Handlers 组合 Hook（不含 handleNext）。
 *
 * 内部组合 3 个子 handler hook，自身仅保留 Shot/Structure/Pacing handlers。
 */
export function useNovelTools({
  state,
  setState,
  setSelectedSegmentIds,
  isProcessing,
  setIsProcessing,
  setShots,
  setStoryStructure,
  setTreatment,
  setShotContracts,
  setPacingConfig,
  setWorkflowMode,
  isMountedRef,
}: UseNovelToolsOptions): UseNovelToolsResult {
  // 1. 导入与段落选中 handlers
  const { handleImport, handleToggle, handleSelectAll } = useNovelImportHandlers({
    state, setState, setSelectedSegmentIds, setIsProcessing,
    setStoryStructure, setTreatment, setShotContracts, setPacingConfig, isMountedRef,
  });

  // 2. 角色/场景实体管理 handlers
  const {
    handleConfirmCharacter, handleConfirmScene,
    handleEditCharacter, handleEditScene, handleMatchCharacter,
  } = useNovelEntityHandlers({ state, setState, setIsProcessing, isMountedRef });

  // 3. ShotBreakdownList handlers
  const handleEditShot = useCallback((shot: ShotBreakdown) => {
    setShots((prev) => prev.map((s) => (s.id === shot.id ? { ...shot, status: "edited" } : s)));
  }, [setShots]);

  const handleReorderShots = useCallback((from: number, to: number) => {
    setShots((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return prev;
      next.splice(to, 0, moved);
      return next.map((s, i) => ({ ...s, sequence: i + 1 }));
    });
  }, [setShots]);

  const handleGeneratePrompts = useCallback(() => {
    setShots((prev) =>
      prev.map((shot) => {
        const charNames = shot.characters.join(", ");
        const promptText = [
          shot.description,
          shot.action ? `动作: ${shot.action}` : "",
          charNames ? `角色: ${charNames}` : "",
          shot.shotType ? `景别: ${shot.shotType}` : "",
          shot.cameraAngle ? `机位: ${shot.cameraAngle}` : "",
          shot.cameraMovement ? `运镜: ${shot.cameraMovement}` : "",
        ].filter(Boolean).join("; ");
        return { ...shot, prompt: { en: promptText, zh: promptText }, status: "final" as const };
      }),
    );
  }, [setShots]);

  // 4. Task 2A.13 Structure 面板 handlers
  const handleBeatsChange = useCallback(
    (beats: NarrativeBeat[]) => {
      const recalculated = recalculateStoryStructure(beats, state.segments);
      setStoryStructure(recalculated);
    },
    [state.segments, setStoryStructure],
  );

  const handleShotContractsChange = useCallback(
    (contracts: UsePipelineStateResult["shotContracts"]) => setShotContracts(contracts),
    [setShotContracts],
  );

  // 5. Task 2A.14 Pacing 面板 handlers
  const handlePacingConfigChange = useCallback(
    (config: UsePipelineStateResult["pacingConfig"]) => setPacingConfig(config),
    [setPacingConfig],
  );

  const handleApplyPacing = useCallback(
    (result: PacingResult) => {
      setState((prev) => ({
        ...prev,
        segments: prev.segments.map((seg) => {
          const newDuration = result.segmentDurations.get(seg.id);
          return newDuration !== undefined ? { ...seg, estimatedDuration: newDuration } : seg;
        }),
      }));
    },
    [setState],
  );

  const handleResetPacing = useCallback(() => {
    setPacingConfig(DEFAULT_PACING_CONFIG);
  }, [setPacingConfig]);

  // 6. 模式切换与示例项目 handlers
  const {
    handleAutoRun, setCurrentSegmentIndex, setRawText,
    handleSelectMode, handleLoadSampleProject,
    handleQuickGenerate, handleWorkflowModeChange,
  } = useNovelModeHandlers({
    state, setState, setSelectedSegmentIds, isProcessing, setIsProcessing,
    setShots, setStoryStructure, setTreatment, setShotContracts,
    setPacingConfig, setWorkflowMode, isMountedRef,
  });

  return {
    handleImport, handleToggle, handleSelectAll,
    handleConfirmCharacter, handleConfirmScene,
    handleEditCharacter, handleEditScene, handleMatchCharacter,
    handleEditShot, handleReorderShots, handleGeneratePrompts,
    handleAutoRun, setCurrentSegmentIndex,
    handleBeatsChange, handleShotContractsChange,
    handlePacingConfigChange, handleApplyPacing, handleResetPacing,
    handleSelectMode, handleLoadSampleProject, handleQuickGenerate,
    setRawText, handleWorkflowModeChange,
  };
}
