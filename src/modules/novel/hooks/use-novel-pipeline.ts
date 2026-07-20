/**
 * Task 2A.6 / 2A.7 — useNovelPipeline Hook（P1.5 已拆分）
 *
 * 管道状态管理组合 Hook。从原 1523 行单 Hook 拆分为 5 个子 Hook：
 * - usePipelineState：15 个 useState + 3 个 useRef 状态容器
 * - usePipelineDerivedFlags：stagesForMode / canProceed / showXxx 等派生标志
 * - useNovelTools：handleImport / handleQuickGenerate 等 AI 工具调用 + 业务 handlers（不含 handleNext）
 * - useNovelStageTransitions：handleNext 及 5 个 stage 调度函数（runContentImportNext 等）
 * - usePipelinePersistence：DB 持久化（自动保存 / recoverProject / handleFinalizeImport）
 *
 * 模块级辅助函数提取到 pipeline-helpers.ts（createGenerateTextFn / makeInitialState /
 * extractAndMatchEntities / breakdownShotsForSegments / recordToProject 等）。
 *
 * 行为与原 NovelImportPage 内联逻辑完全一致，提取为 Hook 以便 StoryPipelineShell 复用。
 *
 * 依赖方向：仅依赖 domain/types + 同模块内子 hook + @/infrastructure/di（间接，通过子 hook）。
 */

import type {
  PipelineConfig,
  NovelProject,
  ShotBreakdown,
  ExtractedCharacter,
  ExtractedScene,
} from "../domain/types";
import type { StoryStructure, StoryTreatment, ShotContract, NarrativeBeat } from "../structure";
import type { PacingConfig, PacingResult } from "../pacing";
import type { SampleProject } from "../services/sample-projects";
import type { WorkflowMode } from "../workflow";
import { usePipelineState } from "./use-pipeline-state";
import { usePipelineDerivedFlags } from "./use-pipeline-derived-flags";
import { useNovelTools } from "./use-novel-tools";
import { useNovelStageTransitions } from "./use-novel-stage-transitions";
import { usePipelinePersistence } from "./use-pipeline-persistence";

export interface UseNovelPipelineOptions {
  onComplete: () => void;
  initialConfig?: Partial<PipelineConfig>;
}

export interface UseNovelPipelineResult {
  // 状态
  state: ReturnType<typeof usePipelineState>["state"];
  selectedSegmentIds: string[];
  isProcessing: boolean;
  isImporting: boolean;
  shots: ShotBreakdown[];
  /** AI 识别的叙事 beats + 情绪曲线 + 整体节奏（professional 模式） */
  storyStructure: StoryStructure | null;
  /**
   * AI 提取的 StoryTreatment（v5.3 增强）。
   *
   * TODO(Task 2A.16): 当前 treatment 仅作为 buildShotContractsForBeats 的可选输入，
   * 未在 UI 展示。三档模式完整实现时，应新建 TreatmentPanel 组件展示
   * logline/theme/tone/characterArcs/settingDescription，让用户可编辑后回传。
   * StoryPipelineShell 也需解构 treatment 并传递给 MainWorkArea。
   */
  treatment: StoryTreatment | null;
  /** 每个 beat 产出的 ShotContract 列表（v5.3 增强） */
  shotContracts: ShotContract[];
  /** 节奏配置（预设 + 目标总时长 + 4 个 ratio） */
  pacingConfig: PacingConfig;
  // 派生数据
  stagesForMode: ReturnType<typeof usePipelineDerivedFlags>["stagesForMode"];
  canProceed: boolean;
  // 派生渲染标志
  showImportStep: boolean;
  showSegmentList: boolean;
  /** Task 2A.13：是否显示叙事结构分析面板（professional 模式专属） */
  showStructureAnalysis: boolean;
  showEntityReview: boolean;
  showShotBreakdown: boolean;
  showFinalize: boolean;
  isDone: boolean;
  /** Task 2A.14：是否显示节奏规划面板（professional 模式专属） */
  showPacingPlanning: boolean;
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
  handleImport: (text: string) => Promise<void>;
  handleToggle: (id: string) => void;
  handleSelectAll: () => void;
  handleNext: () => Promise<void>;
  handleConfirmCharacter: (id: string) => void;
  handleConfirmScene: (id: string) => void;
  handleEditCharacter: (c: ExtractedCharacter) => void;
  handleEditScene: (s: ExtractedScene) => void;
  handleMatchCharacter: (id: string, existingId: string) => Promise<void>;
  handleEditShot: (shot: ShotBreakdown) => void;
  handleReorderShots: (from: number, to: number) => void;
  handleGeneratePrompts: () => void;
  handleFinalizeImport: () => Promise<void>;
  handleAutoRun: () => void;
  /** 设置当前段落索引（SegmentNavColumn 使用） */
  setCurrentSegmentIndex: (index: number) => void;
  // Task 2A.13 Structure 面板 handlers
  /** 用户在 StructureAnalysisPanel 编辑 beats 后回调 */
  handleBeatsChange: (beats: NarrativeBeat[]) => void;
  /** 用户在 ShotContractPanel 编辑 contracts 后回调 */
  handleShotContractsChange: (contracts: ShotContract[]) => void;
  // Task 2A.14 Pacing 面板 handlers
  /** 用户在 PacingPanel 修改配置后回调 */
  handlePacingConfigChange: (config: PacingConfig) => void;
  /** 用户点击"一键应用建议时长"后回调（将建议时长应用到 segments.estimatedDuration） */
  handleApplyPacing: (result: PacingResult) => void;
  /** 用户点击"恢复默认时长"后回调（重置 pacingConfig 为 DEFAULT_PACING_CONFIG） */
  handleResetPacing: () => void;
  // Task 2A.7 持久化 handlers
  /** 恢复指定项目（从 DB 加载 PipelineState） */
  recoverProject: (id: string) => Promise<void>;
  /** 忽略恢复提示，开始新项目 */
  dismissRecovery: () => void;
  /** 删除指定未完成项目 */
  deletePendingProject: (id: string) => Promise<void>;
  // Task 2A.16 三档模式 + 示例项目 handlers
  /** 切换 aiAssistLevel（会重置 PipelineState 到 project_init，避免脏数据） */
  handleSelectMode: (level: "quick" | "standard" | "professional") => void;
  /** 加载示例项目（写入 rawText + segments + characters + scenes，进入 content_import 阶段） */
  handleLoadSampleProject: (project: SampleProject) => void;
  /** 快速模式一键生成：从 rawText 跳过 structure/pacing，直接进入 character_manage */
  handleQuickGenerate: () => Promise<void>;
  /** 设置 rawText（QuickModePanel 文本框双向绑定用） */
  setRawText: (text: string) => void;
  // Task 2A.19 工作流模式 handlers
  /** 当前工作流模式（semi-auto / full-auto），与 config.mode 联动 */
  workflowMode: WorkflowMode;
  /** 切换工作流模式（立即应用，不丢失已生成内容；联动 config.mode 与 gates） */
  handleWorkflowModeChange: (mode: WorkflowMode) => void;
}

/**
 * 管道状态管理组合 Hook。
 *
 * 内部按职责拆分为 5 个子 Hook：
 * 1. usePipelineState — 状态容器（state + setter + ref）
 * 2. usePipelineDerivedFlags — 派生 UI 标志（只读 state）
 * 3. useNovelTools — 业务 handlers（不含 handleNext）
 * 4. useNovelStageTransitions — handleNext 及 5 个 stage 调度函数
 * 5. usePipelinePersistence — DB 持久化（依赖 state + setter）
 *
 * 返回 UseNovelPipelineResult，对外 API 与原 hook 完全一致，向后兼容。
 */
export function useNovelPipeline({
  onComplete,
  initialConfig,
}: UseNovelPipelineOptions): UseNovelPipelineResult {
  // 1. 状态容器
  const {
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
  } = usePipelineState({ initialConfig });

  // 2. 派生 UI 标志
  const {
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
  } = usePipelineDerivedFlags({
    state,
    selectedSegmentIds,
    isProcessing,
    shots,
    onComplete,
  });

  // 3. 业务 handlers（AI 工具调用 + 状态操作，不含 handleNext）
  const {
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
  } = useNovelTools({
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
  });

  // 4. 阶段转换 handler（handleNext 及 5 个 stage 调度函数）
  const { handleNext } = useNovelStageTransitions({
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
  });

  // 5. DB 持久化
  const {
    pendingRecoveryProjects,
    isLoadingRecovery,
    currentProjectId,
    lastSavedAt,
    recoverProject,
    dismissRecovery,
    deletePendingProject,
    handleFinalizeImport,
  } = usePipelinePersistence({
    state,
    setState,
    selectedSegmentIds,
    setSelectedSegmentIds,
    isImporting,
    setIsImporting,
    shots,
    setStoryStructure,
    setTreatment,
    setShotContracts,
    setPacingConfig,
    debounceRef,
    hasRecoveredRef,
    isMountedRef,
  });

  return {
    state,
    selectedSegmentIds,
    isProcessing,
    isImporting,
    shots,
    storyStructure,
    treatment,
    shotContracts,
    pacingConfig,
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
    handleBeatsChange,
    handleShotContractsChange,
    handlePacingConfigChange,
    handleApplyPacing,
    handleResetPacing,
    recoverProject,
    dismissRecovery,
    deletePendingProject,
    handleSelectMode,
    handleLoadSampleProject,
    handleQuickGenerate,
    setRawText,
    workflowMode,
    handleWorkflowModeChange,
  };
}
