/**
 * P1.5 拆分：业务 Handlers Hook（不含 handleNext）。
 *
 * 集中管理 useNovelPipeline 中除 handleNext 之外的所有 handlers：
 * - AI 工具调用类：handleImport / handleMatchCharacter / handleQuickGenerate
 * - 同步状态操作类：handleToggle / handleSelectAll / handleConfirmCharacter / handleConfirmScene /
 *   handleEditCharacter / handleEditScene / handleEditShot / handleReorderShots /
 *   handleGeneratePrompts / handleBeatsChange / handleShotContractsChange /
 *   handlePacingConfigChange / handleApplyPacing / handleResetPacing /
 *   setCurrentSegmentIndex / setRawText / handleAutoRun /
 *   handleSelectMode / handleLoadSampleProject / handleWorkflowModeChange
 *
 * handleNext 已拆分到 use-novel-stage-transitions.ts（5 个 stage 调度函数）。
 */

import { useCallback } from "react";
import { errorLogger } from "@/shared/error-logger";
import type {
  NovelSegment,
  CharacterInPipeline,
  SceneInPipeline,
  ShotBreakdown,
  ExtractedCharacter,
  ExtractedScene,
} from "../domain/types";
import { segmentNovelTextTool, matchEntitiesTool } from "../tools";
import { recalculateStoryStructure, type NarrativeBeat } from "../structure";
import { DEFAULT_PACING_CONFIG, type PacingResult } from "../pacing";
import type { SampleProject } from "../services/sample-projects";
import type { WorkflowMode } from "../workflow";
import { canTransition, transition, getAutoGates } from "../import/services/pipeline-machine";
import {
  NOVEL_TOOL_CTX,
  extractAndMatchEntities,
  breakdownShotsForSegments,
  toCharactersInPipeline,
  toScenesInPipeline,
  makeInitialState,
} from "./pipeline-helpers";
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
 * 业务 Handlers Hook（不含 handleNext）。
 *
 * 接收 state + setter，返回所有业务 handlers（除 handleNext）。
 * handleNext 在 use-novel-stage-transitions.ts 中实现。
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
  // ============================================================
  // handleImport：导入文本 + 占位分段 + 调用 segmentNovelTextTool 实际分段
  // ============================================================

  const handleImport = useCallback(async (text: string) => {
    // H-1 修复：新项目导入时清空 structure 子域 state
    setStoryStructure(null);
    setTreatment(null);
    setShotContracts([]);
    setPacingConfig(DEFAULT_PACING_CONFIG);

    setState((prev) => {
      const next = canTransition(prev.stage, "content_import")
        ? transition(prev, "content_import")
        : prev;
      return { ...next, rawText: text };
    });

    // 先用占位分段填充 UI（即使后续工具调用失败也有降级内容）
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

    // 接入 segmentNovelTextTool 实际分段（失败时保留占位分段作为降级）
    setIsProcessing(true);
    try {
      const result = await segmentNovelTextTool.execute({ text }, NOVEL_TOOL_CTX);
      if (!isMountedRef.current) return;
      if (result.success && result.data) {
        const data = result.data as { segments: NovelSegment[] };
        if (Array.isArray(data.segments) && data.segments.length > 0) {
          const filledSegments = data.segments.map((seg) => {
            const startChar = seg.startChar ?? 0;
            const endChar = seg.endChar ?? text.length;
            const segText =
              startChar === 0 && endChar === text.length
                ? text
                : text.slice(startChar, endChar);
            return { ...seg, text: segText };
          });
          setState((prev) => ({ ...prev, segments: filledSegments }));
          setSelectedSegmentIds(filledSegments.map((s) => s.id));
        }
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, [
    setState,
    setSelectedSegmentIds,
    setIsProcessing,
    setStoryStructure,
    setTreatment,
    setShotContracts,
    setPacingConfig,
    isMountedRef,
  ]);

  // ============================================================
  // 段落选中 handlers
  // ============================================================

  const handleToggle = useCallback((id: string) => {
    setSelectedSegmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, [setSelectedSegmentIds]);

  const handleSelectAll = useCallback(() => {
    setSelectedSegmentIds((prev) => {
      const allIds = state.segments.map((s) => s.id);
      const allSelected = allIds.length > 0 && prev.length === allIds.length;
      return allSelected ? [] : allIds;
    });
  }, [state.segments, setSelectedSegmentIds]);

  // ============================================================
  // EntityReviewPanel handlers（角色/场景确认与编辑）
  // ============================================================

  const handleConfirmCharacter = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.tempId === id ? { ...c, confirmed: true } : c,
      ),
    }));
  }, [setState]);

  const handleConfirmScene = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      scenes: prev.scenes.map((s) =>
        s.tempId === id ? { ...s, confirmed: true } : s,
      ),
    }));
  }, [setState]);

  const handleEditCharacter = useCallback((c: ExtractedCharacter) => {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((ch) =>
        ch.tempId === c.tempId ? ({ ...ch, ...c } as CharacterInPipeline) : ch,
      ),
    }));
  }, [setState]);

  const handleEditScene = useCallback((s: ExtractedScene) => {
    setState((prev) => ({
      ...prev,
      scenes: prev.scenes.map((sc) =>
        sc.tempId === s.tempId ? ({ ...sc, ...s } as SceneInPipeline) : sc,
      ),
    }));
  }, [setState]);

  const handleMatchCharacter = useCallback(async (id: string, existingId: string) => {
    const character = state.characters.find((c) => c.tempId === id);
    if (!character) return;

    setIsProcessing(true);
    try {
      let updatedCharacter: CharacterInPipeline = {
        ...character,
        matchedCharacterId: existingId,
        matchConfidence: 1.0,
        status: "matched",
      };

      try {
        const result = await matchEntitiesTool.execute(
          { charactersJson: JSON.stringify([character]) },
          NOVEL_TOOL_CTX,
        );
        if (!isMountedRef.current) return;
        if (result.success && result.data) {
          const data = result.data as { characters: ExtractedCharacter[] };
          const matchedChar = data.characters?.[0];
          if (matchedChar) {
            updatedCharacter = {
              ...character,
              ...matchedChar,
              status: matchedChar.status === "new" ? "matched" : matchedChar.status,
              matchedCharacterId: existingId,
              matchConfidence: matchedChar.matchConfidence ?? 1.0,
            };
          }
        }
      } catch (err) {
        errorLogger.warn(`[useNovelPipeline] 角色 ${id} 匹配工具调用失败，使用默认值 matched`, err);
      }

      setState((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.tempId === id
            ? {
                ...updatedCharacter,
                confirmed: c.confirmed,
                variants: c.variants,
              }
            : c,
        ),
      }));
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, [state.characters, setState, setIsProcessing, isMountedRef]);

  // ============================================================
  // ShotBreakdownList handlers
  // ============================================================

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
        ]
          .filter(Boolean)
          .join("; ");
        return {
          ...shot,
          prompt: { en: promptText, zh: promptText },
          status: "final" as const,
        };
      }),
    );
  }, [setShots]);

  // ============================================================
  // Task 2A.13 Structure 面板 handlers
  // ============================================================

  const handleBeatsChange = useCallback(
    (beats: NarrativeBeat[]) => {
      const recalculated = recalculateStoryStructure(beats, state.segments);
      setStoryStructure(recalculated);
    },
    [state.segments, setStoryStructure],
  );

  const handleShotContractsChange = useCallback(
    (contracts: UsePipelineStateResult["shotContracts"]) => {
      setShotContracts(contracts);
    },
    [setShotContracts],
  );

  // ============================================================
  // Task 2A.14 Pacing 面板 handlers
  // ============================================================

  const handlePacingConfigChange = useCallback(
    (config: UsePipelineStateResult["pacingConfig"]) => {
      setPacingConfig(config);
    },
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

  // ============================================================
  // 自动运行 / 段落索引 / rawText 设置
  // ============================================================

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

  // ============================================================
  // Task 2A.16 三档模式 + 示例项目 handlers
  // ============================================================

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

  const handleQuickGenerate = useCallback(async () => {
    if (isProcessing || state.rawText.trim().length === 0) return;
    setIsProcessing(true);
    try {
      // 1. 提取角色/场景（与 content_import → character_manage 一致）
      const entityResult = await extractAndMatchEntities(
        state.rawText,
        () => isMountedRef.current,
      );
      if (!isMountedRef.current || !entityResult) return;

      const newCharacters = toCharactersInPipeline(entityResult.characters);
      const newScenes = toScenesInPipeline(entityResult.scenes);

      // 2. 生成分镜（quick 模式没有 segments 选中流程，直接对 rawText 调用 breakdownTextToShotsTool）
      const charactersJson = JSON.stringify(newCharacters);
      const quickShots = await breakdownShotsForSegments(
        [
          {
            id: "quick-1",
            title: "快速模式",
            summary: "",
            startChar: 0,
            endChar: state.rawText.length,
            estimatedDuration: 30,
            keyEvents: [],
            text: state.rawText,
          },
        ],
        charactersJson,
        () => isMountedRef.current,
      );
      if (!isMountedRef.current || !quickShots) return;

      // 3. 更新状态：进入 character_manage 阶段（让用户查看角色），同时填充 shots
      setState((prev) => ({
        ...prev,
        stage: "character_manage",
        step: 1,
        characters: newCharacters,
        scenes: newScenes,
      }));
      setShots(quickShots);
    } catch (err) {
      errorLogger.warn("[useNovelPipeline] handleQuickGenerate 失败", err);
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, [isProcessing, state.rawText, setState, setShots, setIsProcessing, isMountedRef]);

  // ============================================================
  // Task 2A.19 工作流模式 handlers
  // ============================================================

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
    handleImport,
    handleToggle,
    handleSelectAll,
    handleConfirmCharacter,
    handleConfirmScene,
    handleEditCharacter,
    handleEditScene,
    handleMatchCharacter,
    handleEditShot,
    handleReorderShots,
    handleGeneratePrompts,
    handleAutoRun,
    setCurrentSegmentIndex,
    handleBeatsChange,
    handleShotContractsChange,
    handlePacingConfigChange,
    handleApplyPacing,
    handleResetPacing,
    handleSelectMode,
    handleLoadSampleProject,
    handleQuickGenerate,
    setRawText,
    handleWorkflowModeChange,
  };
}
