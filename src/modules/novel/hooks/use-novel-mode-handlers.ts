/**
 * P1.5 细化拆分：模式切换与示例项目 Handlers Hook。
 *
 * 从 useNovelTools 进一步拆出，集中管理三档模式 + 示例项目 + 工作流模式 + AutoRun：
 * - handleSelectMode：切换 aiAssistLevel（quick/standard/professional）
 * - handleLoadSampleProject：加载示例项目
 * - handleQuickGenerate：拆分到 use-novel-quick-generate.ts
 * - handleAutoRun：切换到 auto 模式
 * - setRawText / setCurrentSegmentIndex：文本与索引设置
 * - handleWorkflowModeChange：切换 semi-auto / full-auto 模式
 */

import { useCallback } from "react";
import type { WorkflowMode } from "../workflow";
import { DEFAULT_PACING_CONFIG } from "../pacing";
import type { SampleProject } from "../services/sample-projects";
import { getAutoGates } from "../import/services/pipeline-machine";
import { makeInitialState } from "./pipeline-helpers";
import { useNovelQuickGenerate } from "./use-novel-quick-generate";
import type { UsePipelineStateResult } from "./use-pipeline-state";

export interface UseNovelModeHandlersOptions {
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

export interface UseNovelModeHandlersResult {
  handleAutoRun: () => void;
  setCurrentSegmentIndex: (index: number) => void;
  setRawText: (text: string) => void;
  handleSelectMode: (level: "quick" | "standard" | "professional") => void;
  handleLoadSampleProject: (project: SampleProject) => void;
  handleQuickGenerate: () => Promise<void>;
  handleWorkflowModeChange: (mode: WorkflowMode) => void;
}

/**
 * 模式切换与示例项目 Handlers Hook。
 * handleQuickGenerate 委托给 useNovelQuickGenerate 子 hook。
 */
export function useNovelModeHandlers({
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
}: UseNovelModeHandlersOptions): UseNovelModeHandlersResult {
  const handleAutoRun = useCallback(() => {
    if (isProcessing) return;
    setIsProcessing(true);
    setState((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        mode: "auto",
        gates: getAutoGates({ ...prev.config, mode: "auto" }),
      },
    }));
    window.setTimeout(() => setIsProcessing(false), 500);
  }, [isProcessing, setIsProcessing, setState]);

  const setCurrentSegmentIndex = useCallback((index: number) => {
    setState((prev) => ({ ...prev, currentSegmentIndex: index }));
  }, [setState]);

  // Task 2A.16：QuickModePanel 文本框双向绑定用
  const setRawText = useCallback((text: string) => {
    setState((prev) => ({ ...prev, rawText: text }));
  }, [setState]);

  // Task 2A.16 三档模式 + 示例项目 handlers
  const handleSelectMode = useCallback(
    (level: "quick" | "standard" | "professional") => {
      setState((prev) => ({
        ...makeInitialState({ ...prev.config, aiAssistLevel: level }),
        // 保留 rawText 让用户可以继续使用
        rawText: prev.rawText,
      }));
      // 清空所有派生状态
      setShots([]);
      setStoryStructure(null);
      setTreatment(null);
      setShotContracts([]);
      setPacingConfig(DEFAULT_PACING_CONFIG);
      setSelectedSegmentIds([]);
    },
    [
      setState,
      setShots,
      setStoryStructure,
      setTreatment,
      setShotContracts,
      setPacingConfig,
      setSelectedSegmentIds,
    ],
  );

  const handleLoadSampleProject = useCallback((project: SampleProject) => {
    setState((prev) => ({
      ...prev,
      stage: "character_manage",
      step: 1,
      rawText: project.rawText,
      segments: project.segments,
      characters: project.characters,
      scenes: project.scenes,
      currentSegmentIndex: 0,
    }));
    setShots([]);
    setStoryStructure(null);
    setTreatment(null);
    setShotContracts([]);
    setPacingConfig(DEFAULT_PACING_CONFIG);
    setSelectedSegmentIds(project.segments.map((s) => s.id));
  }, [
    setState,
    setShots,
    setStoryStructure,
    setTreatment,
    setShotContracts,
    setPacingConfig,
    setSelectedSegmentIds,
  ]);

  // handleQuickGenerate：委托给 useNovelQuickGenerate 子 hook
  const { handleQuickGenerate } = useNovelQuickGenerate({
    state,
    setState,
    isProcessing,
    setIsProcessing,
    setShots,
    isMountedRef,
  });

  // Task 2A.19 工作流模式 handlers
  const handleWorkflowModeChange = useCallback((mode: WorkflowMode) => {
    setWorkflowMode(mode);
    setState((prev) => {
      if (mode === "full-auto") {
        const autoConfig = { ...prev.config, mode: "auto" as const };
        return {
          ...prev,
          config: {
            ...autoConfig,
            gates: getAutoGates(autoConfig),
          },
        };
      }
      return {
        ...prev,
        config: {
          ...prev.config,
          mode: "semi" as const,
          gates: {
            confirmSegments: true,
            confirmEntities: true,
            confirmShots: true,
            confirmPrompts: true,
          },
        },
      };
    });
  }, [setWorkflowMode, setState]);

  return {
    handleAutoRun,
    setCurrentSegmentIndex,
    setRawText,
    handleSelectMode,
    handleLoadSampleProject,
    handleQuickGenerate,
    handleWorkflowModeChange,
  };
}
