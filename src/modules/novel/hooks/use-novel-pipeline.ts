/**
 * Task 2A.6 — useNovelPipeline Hook
 *
 * 从 NovelImportPage 提取的管道状态管理逻辑，供 StoryPipelineShell 与
 * NovelImportPage 共享，避免代码重复。
 *
 * 负责：
 * - PipelineState 初始化与转换（transition/canTransition）
 * - 段落选中状态管理
 * - 处理中状态（isProcessing/isImporting）
 * - 分镜列表管理（shots）
 * - 所有 handler（导入/确认/编辑/重排/生成提示词/导入到故事板）
 * - 派生标志（showImportStep/showSegmentList/showEntityReview/showShotBreakdown/showFinalize/isDone）
 *
 * 依赖方向：仅依赖 domain/types + import/services/pipeline-machine（同模块内）。
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import type {
  PipelineState,
  PipelineConfig,
  NovelSegment,
  CharacterInPipeline,
  SceneInPipeline,
  ShotBreakdown,
  ExtractedCharacter,
  ExtractedScene,
  PipelineStage,
} from "../domain/types";
import {
  getStagesForMode,
  transition,
  canTransition,
  getAutoGates,
} from "../import/services/pipeline-machine";

/** 默认 PipelineConfig */
function makeDefaultConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  const base: PipelineConfig = {
    mode: "semi",
    aiAssistLevel: "professional",
    projectName: "",
    style: "",
    format: "novel",
    aiModel: "",
    autoCreateEntities: false,
    gates: {
      confirmSegments: true,
      confirmEntities: true,
      confirmShots: true,
      confirmPrompts: true,
    },
  };
  // 合并 overrides，gates 单独处理避免浅合并丢失内层字段
  const { gates: overrideGates, ...restOverrides } = overrides;
  return {
    ...base,
    ...restOverrides,
    gates: overrideGates ? { ...base.gates, ...overrideGates } : base.gates,
  };
}

/** 初始 PipelineState */
function makeInitialState(config: PipelineConfig): PipelineState {
  return {
    stage: "project_init",
    step: 1,
    config,
    rawText: "",
    segments: [],
    currentSegmentIndex: 0,
    characters: [],
    scenes: [],
    characterImportance: {},
    prompts: [],
    generationResults: [],
  };
}

export interface UseNovelPipelineOptions {
  onComplete: () => void;
  initialConfig?: Partial<PipelineConfig>;
}

export interface UseNovelPipelineResult {
  // 状态
  state: PipelineState;
  selectedSegmentIds: string[];
  isProcessing: boolean;
  isImporting: boolean;
  shots: ShotBreakdown[];
  // 派生数据
  stagesForMode: PipelineStage[];
  canProceed: boolean;
  // 派生渲染标志
  showImportStep: boolean;
  showSegmentList: boolean;
  showEntityReview: boolean;
  showShotBreakdown: boolean;
  showFinalize: boolean;
  isDone: boolean;
  // Handlers
  handleImport: (text: string) => void;
  handleToggle: (id: string) => void;
  handleSelectAll: () => void;
  handleNext: () => void;
  handleConfirmCharacter: (id: string) => void;
  handleConfirmScene: (id: string) => void;
  handleEditCharacter: (c: ExtractedCharacter) => void;
  handleEditScene: (s: ExtractedScene) => void;
  handleMatchCharacter: (id: string, existingId: string) => void;
  handleEditShot: (shot: ShotBreakdown) => void;
  handleReorderShots: (from: number, to: number) => void;
  handleGeneratePrompts: () => void;
  handleFinalizeImport: () => void;
  handleAutoRun: () => void;
  /** 设置当前段落索引（SegmentNavColumn 使用） */
  setCurrentSegmentIndex: (index: number) => void;
}

/**
 * 管道状态管理 Hook。
 * 行为与原 NovelImportPage 内联逻辑完全一致，提取为 Hook 以便 StoryPipelineShell 复用。
 */
export function useNovelPipeline({
  onComplete,
  initialConfig,
}: UseNovelPipelineOptions): UseNovelPipelineResult {
  const [state, setState] = useState<PipelineState>(() =>
    makeInitialState(makeDefaultConfig(initialConfig ?? {})),
  );
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [shots, setShots] = useState<ShotBreakdown[]>([]);

  // 根据当前模式计算阶段子集（用于进度条显示）
  const stagesForMode = useMemo(
    () => getStagesForMode(state.config.aiAssistLevel),
    [state.config.aiAssistLevel],
  );

  // === Handlers ===

  const handleImport = useCallback((text: string) => {
    setState((prev) => {
      const next = canTransition(prev.stage, "content_import")
        ? transition(prev, "content_import")
        : prev;
      return { ...next, rawText: text };
    });
    // TODO: Task 2A.6+ 接入 segmentNovelTextTool 实际分段
    // 当前用简单分段占位（按段落分隔）
    const placeholderSegments: NovelSegment[] = text
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0)
      .slice(0, 20)
      .map((para, i) => ({
        id: `seg-${i + 1}`,
        title: `段落 ${i + 1}`,
        summary: para.slice(0, 80) + (para.length > 80 ? "..." : ""),
        startChar: 0,
        endChar: para.length,
        estimatedDuration: Math.max(3, Math.min(15, Math.round(para.length / 50))),
        keyEvents: [],
        text: para,
      }));
    setState((prev) => ({ ...prev, segments: placeholderSegments }));
    setSelectedSegmentIds(placeholderSegments.map((s) => s.id));
  }, []);

  const handleToggle = useCallback((id: string) => {
    setSelectedSegmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedSegmentIds((prev) => {
      const allIds = state.segments.map((s) => s.id);
      const allSelected = allIds.length > 0 && prev.length === allIds.length;
      return allSelected ? [] : allIds;
    });
  }, [state.segments]);

  const canProceed = useMemo((): boolean => {
    if (isProcessing) return false;
    switch (state.stage) {
      case "project_init":
        return state.rawText.trim().length > 0;
      case "content_import":
        return selectedSegmentIds.length > 0;
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

  const handleNext = useCallback(() => {
    if (!canProceed) return;
    setState((prev) => {
      switch (prev.stage) {
        case "project_init":
          return canTransition(prev.stage, "content_import")
            ? transition(prev, "content_import")
            : prev;
        case "content_import":
          return canTransition(prev.stage, "character_manage")
            ? {
                ...transition(prev, "character_manage"),
                characters: prev.characters,
                scenes: prev.scenes,
              }
            : prev;
        case "character_manage":
          return canTransition(prev.stage, "scene_manage")
            ? transition(prev, "scene_manage")
            : prev;
        case "scene_manage":
          return canTransition(prev.stage, "review")
            ? transition(prev, "review")
            : prev;
        case "review":
          return canTransition(prev.stage, "storyboard")
            ? transition(prev, "storyboard")
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
  }, [canProceed, state.stage]);

  // === EntityReviewPanel handlers ===

  const handleConfirmCharacter = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.tempId === id ? { ...c, confirmed: true } : c,
      ),
    }));
  }, []);

  const handleConfirmScene = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      scenes: prev.scenes.map((s) =>
        s.tempId === id ? { ...s, confirmed: true } : s,
      ),
    }));
  }, []);

  const handleEditCharacter = useCallback((c: ExtractedCharacter) => {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((ch) =>
        ch.tempId === c.tempId ? ({ ...ch, ...c } as CharacterInPipeline) : ch,
      ),
    }));
  }, []);

  const handleEditScene = useCallback((s: ExtractedScene) => {
    setState((prev) => ({
      ...prev,
      scenes: prev.scenes.map((sc) =>
        sc.tempId === s.tempId ? ({ ...sc, ...s } as SceneInPipeline) : sc,
      ),
    }));
  }, []);

  const handleMatchCharacter = useCallback((_id: string, _existingId: string) => {
    // TODO: Task 2A.6+ 接入 matchEntitiesTool 进行手动匹配
  }, []);

  // === ShotBreakdownList handlers ===

  const handleEditShot = useCallback((shot: ShotBreakdown) => {
    setShots((prev) => prev.map((s) => (s.id === shot.id ? { ...shot, status: "edited" } : s)));
  }, []);

  const handleReorderShots = useCallback((from: number, to: number) => {
    setShots((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return prev;
      next.splice(to, 0, moved);
      return next.map((s, i) => ({ ...s, sequence: i + 1 }));
    });
  }, []);

  const handleGeneratePrompts = useCallback(() => {
    // TODO: Task 2A.6+ 接入 generate_prompt 工具
    setShots((prev) => prev.map((s) => ({ ...s, status: "final" as const })));
  }, []);

  // === FinalizePanel handlers ===

  const handleFinalizeImport = useCallback(() => {
    setIsImporting(true);
    // TODO: Task 2A.6+ 接入实际导入逻辑（创建 Story + Beats + 关联角色/场景）
    window.setTimeout(() => {
      setIsImporting(false);
      setState((prev) =>
        canTransition(prev.stage, "done") ? transition(prev, "done") : prev,
      );
    }, 500);
  }, []);

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
  }, [isProcessing]);

  const setCurrentSegmentIndex = useCallback((index: number) => {
    setState((prev) => ({ ...prev, currentSegmentIndex: index }));
  }, []);

  // === done 阶段调用 onComplete ===
  useEffect(() => {
    if (state.stage === "done") {
      onComplete();
    }
  }, [state.stage, onComplete]);

  // === 派生渲染标志 ===
  const showImportStep =
    state.stage === "project_init" ||
    (state.stage === "content_import" && state.rawText.length === 0);
  const showSegmentList = state.stage === "content_import" && state.rawText.length > 0;
  const showEntityReview =
    state.stage === "character_manage" || state.stage === "scene_manage";
  const showShotBreakdown = state.stage === "review" || state.stage === "storyboard";
  const showFinalize = state.stage === "generation";
  const isDone = state.stage === "done";

  return {
    state,
    selectedSegmentIds,
    isProcessing,
    isImporting,
    shots,
    stagesForMode,
    canProceed,
    showImportStep,
    showSegmentList,
    showEntityReview,
    showShotBreakdown,
    showFinalize,
    isDone,
    handleImport,
    handleToggle,
    handleSelectAll,
    handleNext,
    handleConfirmCharacter,
    handleConfirmScene,
    handleEditCharacter,
    handleEditScene,
    handleMatchCharacter,
    handleEditShot,
    handleReorderShots,
    handleGeneratePrompts,
    handleFinalizeImport,
    handleAutoRun,
    setCurrentSegmentIndex,
  };
}
