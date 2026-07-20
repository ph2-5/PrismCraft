/**
 * P1.5 拆分：PipelineState 状态容器 Hook。
 *
 * 集中管理 useNovelPipeline 的 15 个 useState 与 3 个 useRef，
 * 暴露 state 与 setter 供其他子 hook（derived-flags / tools / persistence）使用。
 *
 * 不包含任何业务逻辑（handlers / effects），仅做状态存储。
 * 唯一的 effect：挂载/卸载时维护 isMountedRef，并清理 debounce 定时器。
 */

import { useState, useRef, useEffect } from "react";
import type {
  PipelineState,
  PipelineConfig,
  ShotBreakdown,
} from "../domain/types";
import type { StoryStructure, StoryTreatment, ShotContract } from "../structure";
import { DEFAULT_PACING_CONFIG, type PacingConfig } from "../pacing";
import type { WorkflowMode } from "../workflow";
import { makeDefaultConfig, makeInitialState } from "./pipeline-helpers";

export interface UsePipelineStateOptions {
  initialConfig?: Partial<PipelineConfig>;
}

export interface UsePipelineStateResult {
  // 核心管道状态
  state: PipelineState;
  setState: React.Dispatch<React.SetStateAction<PipelineState>>;
  selectedSegmentIds: string[];
  setSelectedSegmentIds: React.Dispatch<React.SetStateAction<string[]>>;
  isProcessing: boolean;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  isImporting: boolean;
  setIsImporting: React.Dispatch<React.SetStateAction<boolean>>;
  shots: ShotBreakdown[];
  setShots: React.Dispatch<React.SetStateAction<ShotBreakdown[]>>;
  // Task 2A.13 故事结构分析 state
  storyStructure: StoryStructure | null;
  setStoryStructure: React.Dispatch<React.SetStateAction<StoryStructure | null>>;
  treatment: StoryTreatment | null;
  setTreatment: React.Dispatch<React.SetStateAction<StoryTreatment | null>>;
  shotContracts: ShotContract[];
  setShotContracts: React.Dispatch<React.SetStateAction<ShotContract[]>>;
  // Task 2A.14 节奏规划 state
  pacingConfig: PacingConfig;
  setPacingConfig: React.Dispatch<React.SetStateAction<PacingConfig>>;
  // Task 2A.19 工作流模式 state
  workflowMode: WorkflowMode;
  setWorkflowMode: React.Dispatch<React.SetStateAction<WorkflowMode>>;
  // Refs（供 persistence / tools 子 hook 使用）
  debounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  hasRecoveredRef: React.MutableRefObject<boolean>;
  isMountedRef: React.MutableRefObject<boolean>;
}

/**
 * 管道状态容器 Hook。
 *
 * 返回所有 state、setter、ref。其他子 hook 通过参数注入的方式接收这些值。
 */
export function usePipelineState({
  initialConfig,
}: UsePipelineStateOptions): UsePipelineStateResult {
  const [state, setState] = useState<PipelineState>(() =>
    makeInitialState(makeDefaultConfig(initialConfig ?? {})),
  );
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [shots, setShots] = useState<ShotBreakdown[]>([]);

  // === Task 2A.13 故事结构分析 state ===
  const [storyStructure, setStoryStructure] = useState<StoryStructure | null>(null);
  const [treatment, setTreatment] = useState<StoryTreatment | null>(null);
  const [shotContracts, setShotContracts] = useState<ShotContract[]>([]);

  // === Task 2A.14 节奏规划 state ===
  const [pacingConfig, setPacingConfig] = useState<PacingConfig>(DEFAULT_PACING_CONFIG);

  // === Task 2A.19 工作流模式 state ===
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("semi-auto");

  // === Refs ===
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // hasRecoveredRef：恢复项目时跳过一次自动创建，避免立刻创建新记录覆盖刚恢复的项目
  const hasRecoveredRef = useRef(false);
  // P1-7 修复：isMountedRef 防止 async handler 在组件卸载后 setState
  const isMountedRef = useRef(true);

  // P1-7 修复：组件卸载时标记为已卸载，并清理防抖定时器
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  return {
    state,
    setState,
    selectedSegmentIds,
    setSelectedSegmentIds,
    isProcessing,
    setIsProcessing,
    isImporting,
    setIsImporting,
    shots,
    setShots,
    storyStructure,
    setStoryStructure,
    treatment,
    setTreatment,
    shotContracts,
    setShotContracts,
    pacingConfig,
    setPacingConfig,
    workflowMode,
    setWorkflowMode,
    debounceRef,
    hasRecoveredRef,
    isMountedRef,
  };
}
