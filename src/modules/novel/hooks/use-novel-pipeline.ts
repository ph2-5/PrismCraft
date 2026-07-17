/**
 * Task 2A.6 / 2A.7 — useNovelPipeline Hook
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
 * Task 2A.7 新增持久化：
 * - 挂载时检测未完成项目，暴露 pendingRecoveryProjects 给 UI 显示恢复对话框
 * - recoverProject(id) 从 DB 加载 pipeline_state_json 恢复状态
 * - 状态变化时 2 秒防抖自动保存到 DB
 * - 到达 done 阶段后清理项目记录
 *
 * 依赖方向：仅依赖 domain/types + import/services/pipeline-machine（同模块内）+
 * @/infrastructure/di（访问 novelProjectStorage token）。
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { container } from "@/infrastructure/di";
import type {
  PipelineState,
  PipelineConfig,
  NovelSegment,
  NovelProject,
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
  // Task 2A.7 持久化状态
  /** 待恢复的未完成项目列表（挂载时加载，用户恢复或新建后清空） */
  pendingRecoveryProjects: NovelProject[];
  /** 是否正在加载恢复项目 */
  isLoadingRecovery: boolean;
  /** 当前关联的 DB 项目 ID（null 表示尚未创建项目记录） */
  currentProjectId: string | null;
  /** 上次自动保存时间戳（用于 UI 显示"已保存"状态） */
  lastSavedAt: number | null;
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
  // Task 2A.7 持久化 handlers
  /** 恢复指定项目（从 DB 加载 PipelineState） */
  recoverProject: (id: string) => Promise<void>;
  /** 忽略恢复提示，开始新项目 */
  dismissRecovery: () => void;
  /** 删除指定未完成项目 */
  deletePendingProject: (id: string) => Promise<void>;
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

  // === Task 2A.7 持久化状态 ===
  const [pendingRecoveryProjects, setPendingRecoveryProjects] = useState<NovelProject[]>([]);
  const [isLoadingRecovery, setIsLoadingRecovery] = useState(true);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // hasRecoveredRef：恢复项目时跳过一次自动创建，避免立刻创建新记录覆盖刚恢复的项目
  const hasRecoveredRef = useRef(false);

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
      // Task 2A.7: 导入完成后清理 DB 项目记录（物理删除，因为已转换为正式 Story）
      if (currentProjectId !== null) {
        container.novelProjectStorage
          .hardDeleteProject(currentProjectId)
          .catch(() => {
            // 清理失败不阻塞 UI，后续 cleanExpiredProjects 会兜底
          });
        setCurrentProjectId(null);
      }
    }, 500);
  }, [currentProjectId]);

  // === Task 2A.7 持久化 handlers ===

  /**
   * 将 storage 返回的 NovelProjectRecord（state: unknown）转换为
   * NovelProject 域对象（state: PipelineState）。
   * 如果 state 损坏或缺少必要字段，回退到 makeInitialState。
   */
  const recordToProject = useCallback(
    (record: {
      id: string;
      title: string;
      rawText: string;
      state: unknown;
      createdAt: number;
      updatedAt: number;
    }): NovelProject => {
      const pipelineState =
        record.state && typeof record.state === "object" && "stage" in record.state
          ? (record.state as PipelineState)
          : makeInitialState(makeDefaultConfig({ projectName: record.title }));
      return {
        id: record.id,
        title: record.title,
        rawText: record.rawText,
        state: pipelineState,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    },
    [],
  );

  /** 挂载时加载未完成项目列表（仅一次），用于 UI 显示恢复对话框 */
  useEffect(() => {
    let cancelled = false;
    const storage = container.novelProjectStorage;
    storage
      .getAllProjects()
      .then((records) => {
        if (cancelled) return;
        const projects = records.map(recordToProject);
        setPendingRecoveryProjects(projects);
        setIsLoadingRecovery(false);
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoadingRecovery(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recordToProject]);

  /** 自动保存：state 变化时 2 秒防抖保存到 DB（仅当用户输入了文本或已关联项目时） */
  useEffect(() => {
    // 跳过：项目刚恢复（避免立刻覆盖）、用户未输入任何内容、正在加载恢复列表
    if (hasRecoveredRef.current) {
      hasRecoveredRef.current = false;
      return;
    }
    // 只在有 rawText 或已有 currentProjectId 时才自动保存（避免空项目污染 DB）
    const hasContent = state.rawText.trim().length > 0 || currentProjectId !== null;
    if (!hasContent || isLoadingRecovery) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const storage = container.novelProjectStorage;
        const title =
          state.config.projectName ||
          (state.rawText ? state.rawText.slice(0, 40) : "未命名项目");
        if (currentProjectId === null) {
          // 新项目：创建记录
          const id = `np-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          await storage.createProject({
            id,
            title,
            rawText: state.rawText,
            state,
          });
          setCurrentProjectId(id);
        } else {
          // 已有项目：更新
          await storage.updateProject(currentProjectId, {
            title,
            rawText: state.rawText,
            state,
          });
        }
        setLastSavedAt(Date.now());
      } catch {
        // 自动保存失败不阻塞 UI，下次 state 变化时会重试
      }
    }, 2000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [state, currentProjectId, isLoadingRecovery]);

  /** 恢复指定项目（从 DB 加载 pipeline_state_json） */
  const recoverProject = useCallback(async (id: string) => {
    try {
      const storage = container.novelProjectStorage;
      const record = await storage.getProjectById(id);
      if (!record) return;
      const project = recordToProject(record);
      hasRecoveredRef.current = true;
      setState(project.state);
      setSelectedSegmentIds(project.state.segments.map((s) => s.id));
      setCurrentProjectId(project.id);
      setPendingRecoveryProjects([]);
      setLastSavedAt(project.updatedAt);
    } catch {
      // 恢复失败：保留当前状态，不阻塞 UI
    }
  }, [recordToProject]);

  /** 忽略恢复提示，开始新项目（清空恢复列表） */
  const dismissRecovery = useCallback(() => {
    setPendingRecoveryProjects([]);
  }, []);

  /** 删除指定未完成项目（从 DB 物理删除） */
  const deletePendingProject = useCallback(async (id: string) => {
    try {
      const storage = container.novelProjectStorage;
      await storage.hardDeleteProject(id);
      setPendingRecoveryProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // 删除失败：UI 列表保持不变
    }
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
    // Task 2A.7 持久化
    pendingRecoveryProjects,
    isLoadingRecovery,
    currentProjectId,
    lastSavedAt,
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
    // Task 2A.7 持久化 handlers
    recoverProject,
    dismissRecovery,
    deletePendingProject,
  };
}
