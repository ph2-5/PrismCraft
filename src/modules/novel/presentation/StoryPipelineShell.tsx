/**
 * Task 2A.6 — StoryPipelineShell 三栏布局容器
 *
 * 10 阶段 PipelineStage 全部在 /story 页面内完成。布局：
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  PhaseIndicator（顶部 7 步指示器）                       │
 *   ├──────────┬────────────────────────┬─────────────────────┤
 *   │ 片段导航  │       主工作区          │    上下文面板         │
 *   │ 260px    │      flex:1            │    280px            │
 *   ├──────────┴────────────────────────┴─────────────────────┤
 *   │  底部状态栏：进度 + 下一步/自动执行                       │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Task 2A.16 三档模式集成：
 *   - 首次进入显示 ModeSelector（preference 标记 novel_mode_selected）
 *   - quick 模式：渲染 QuickModePanel，隐藏 PhaseIndicator/片段导航/上下文面板
 *   - standard/professional 模式：渲染完整三栏布局
 *   - 底部状态栏新增"切换模式"按钮
 *
 * 状态管理通过 useNovelPipeline Hook（与 NovelImportPage 共享）。
 * 三栏可独立滚动；窗口缩放时左右栏宽度固定，中栏 flex 自适应。
 */

import { useState } from "react";
import { Loader2, ArrowRight, Zap, Save, BarChart3, Settings } from "lucide-react";
import { t } from "@/shared/constants";
import { confirm } from "@/shared/utils/confirm";
import { usePreference } from "@/shared/utils/preferences";
import { emitToast } from "@/shared/utils/toast-bridge";
import type { PipelineConfig, PipelineStage } from "../domain/types";
import { useNovelPipeline } from "../hooks/use-novel-pipeline";
import { PhaseIndicator } from "./PhaseIndicator";
import { SegmentNavColumn } from "./SegmentNavColumn";
import { MainWorkArea } from "./MainWorkArea";
import { ContextPanel } from "./ContextPanel";
import { NovelProjectList } from "./NovelProjectList";
import { StoryOverviewPanel } from "./StoryOverviewPanel";
import { ModeSelector, type AiAssistLevel } from "./ModeSelector";
import { QuickModePanel } from "./QuickModePanel";
import { SampleProjectLoader } from "./SampleProjectLoader";
import { OnboardingGuide } from "./OnboardingGuide";
import { WorkflowModeSelector } from "../workflow";
import type { SampleProject } from "../services/sample-projects";

/** preference 键：是否已完成模式选择（首次进入后置为 true） */
const MODE_SELECTED_KEY = "novel_mode_selected";
/** preference 键：是否已完成新手引导 */
const ONBOARDING_COMPLETED_KEY = "novel_onboarding_completed";

export interface StoryPipelineShellProps {
  onComplete: () => void;
  /** 可选：初始配置（默认 semi + professional） */
  initialConfig?: Partial<PipelineConfig>;
}

/**
 * StoryPipelineShell 内部 UI 状态与 handlers hook。
 *
 * 集中管理：
 * - 4 个 UI 状态（overviewMode / modeSelected / showSampleLoader / showOnboarding）
 * - 5 个内部 handlers（handleStageClick / handleModeSelect / handleSwitchMode / handleSampleLoad / handleOnboardingComplete）
 * - 派生标志（showRecoveryDialog / nextLabel / nextDisabled / showAutoRun / progressStep）
 *
 * 提取到模块级以减少 StoryPipelineShell 函数体行数（max-lines-per-function 警告）。
 */
interface UseShellStateOptions {
  pipeline: ReturnType<typeof useNovelPipeline>;
}

interface UseShellStateResult {
  overviewMode: boolean;
  setOverviewMode: React.Dispatch<React.SetStateAction<boolean>>;
  modeSelected: boolean;
  setModeSelected: React.Dispatch<React.SetStateAction<boolean>>;
  showSampleLoader: boolean;
  setShowSampleLoader: React.Dispatch<React.SetStateAction<boolean>>;
  showOnboarding: boolean;
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
  showRecoveryDialog: boolean;
  nextLabel: string;
  nextDisabled: boolean;
  showAutoRun: boolean;
  progressStep: number;
  handleStageClick: (stage: PipelineStage) => void;
  handleModeSelect: (level: AiAssistLevel) => void;
  handleSwitchMode: () => void;
  handleSampleLoad: (project: SampleProject) => void;
  handleOnboardingComplete: () => void;
}

function useShellState({ pipeline }: UseShellStateOptions): UseShellStateResult {
  const {
    state,
    stagesForMode,
    canProceed,
    isProcessing,
    pendingRecoveryProjects,
    isLoadingRecovery,
    handleSelectMode,
    handleLoadSampleProject,
  } = pipeline;

  const [overviewMode, setOverviewMode] = useState(false);
  const [modeSelected, setModeSelected] = usePreference<boolean>(MODE_SELECTED_KEY, false);
  const [showSampleLoader, setShowSampleLoader] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = usePreference<boolean>(
    ONBOARDING_COMPLETED_KEY,
    false,
  );
  const showOnboarding = !onboardingCompleted;
  const setShowOnboarding = (updater: boolean | ((prev: boolean) => boolean)) => {
    setOnboardingCompleted((prev) => {
      const nextShow = typeof updater === "function" ? updater(!prev) : updater;
      return !nextShow;
    });
  };

  // Task 2A.7: 显示恢复弹窗的条件
  const showRecoveryDialog =
    !isLoadingRecovery &&
    modeSelected &&
    pendingRecoveryProjects.length > 0 &&
    state.stage === "project_init" &&
    state.rawText.length === 0;

  const nextLabel = isProcessing ? t("novel.controls.processing") : t("novel.controls.next");
  const nextDisabled = !canProceed || isProcessing;
  const showAutoRun = state.config.mode === "semi";

  const currentStageIdx = stagesForMode.indexOf(state.stage);
  const progressStep = currentStageIdx >= 0 ? currentStageIdx + 1 : 1;

  // PhaseIndicator 点击：仅显示当前阶段信息，不切换 stage（不支持回退）
  const handleStageClick = (_stage: PipelineStage) => {
    const currentStageLabel = t(`novel.stages.${state.stage}` as Parameters<typeof t>[0]);
    emitToast("info", currentStageLabel);
  };

  // Task 2A.16：模式选择回调
  const handleModeSelect = (level: AiAssistLevel) => {
    handleSelectMode(level);
    setModeSelected(true);
    setShowSampleLoader(false);
  };

  // Task 2A.16：切换模式按钮回调（弹窗确认，避免丢失数据）
  const handleSwitchMode = async () => {
    if (state.stage !== "project_init" || state.rawText.length > 0) {
      const confirmed = await confirm({
        description: t("novel.mode.switchConfirm"),
        variant: "warning",
      });
      if (!confirmed) return;
    }
    setModeSelected(false);
  };

  // Task 2A.16：加载示例项目回调
  const handleSampleLoad = (project: SampleProject) => {
    handleLoadSampleProject(project);
    setShowSampleLoader(false);
    setModeSelected(true);
    setShowOnboarding(false);
  };

  // Task 2A.16：新手引导完成回调
  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  return {
    overviewMode, setOverviewMode, modeSelected, setModeSelected,
    showSampleLoader, setShowSampleLoader, showOnboarding, setShowOnboarding,
    showRecoveryDialog, nextLabel, nextDisabled, showAutoRun, progressStep,
    handleStageClick, handleModeSelect, handleSwitchMode,
    handleSampleLoad, handleOnboardingComplete,
  };
}

// ============================================================================
// 子组件：模式选择视图
// ============================================================================

interface ModeSelectViewProps {
  showSampleLoader: boolean;
  onSampleLoad: (project: SampleProject) => void;
  onCloseSampleLoader: () => void;
  onModeSelect: (level: AiAssistLevel) => void;
  onOpenSampleLoader: () => void;
}

/** 模式选择视图：显示 SampleProjectLoader 或 ModeSelector。 */
function ModeSelectView({
  showSampleLoader, onSampleLoad, onCloseSampleLoader, onModeSelect, onOpenSampleLoader,
}: ModeSelectViewProps) {
  if (showSampleLoader) {
    return (
      <div className="h-full">
        <SampleProjectLoader onLoad={onSampleLoad} onClose={onCloseSampleLoader} />
      </div>
    );
  }
  return (
    <div className="h-full">
      <ModeSelector onSelect={onModeSelect} onLoadSample={onOpenSampleLoader} />
    </div>
  );
}

// ============================================================================
// 子组件：Quick 模式视图
// ============================================================================

interface QuickModeViewProps {
  pipeline: ReturnType<typeof useNovelPipeline>;
  onSwitchMode: () => void;
  showOnboarding: boolean;
  onOnboardingComplete: () => void;
  onOnboardingLoadSample: () => void;
}

/** Quick 模式视图：QuickModePanel + 底部切换按钮 + 新手引导。 */
function QuickModeView({
  pipeline, onSwitchMode, showOnboarding, onOnboardingComplete, onOnboardingLoadSample,
}: QuickModeViewProps) {
  const { state, shots, isProcessing, handleQuickGenerate, setRawText } = pipeline;
  return (
    <div className="flex flex-col h-full bg-background">
      <QuickModePanel
        rawText={state.rawText}
        onTextChange={setRawText}
        onGenerate={handleQuickGenerate}
        isProcessing={isProcessing}
        shots={shots}
      />
      {/* 底部切换模式按钮 */}
      <div className="border-t border-border bg-card/50 px-6 py-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          ⚡ {t("novel.mode.quick.title")}
        </span>
        <button
          type="button"
          onClick={onSwitchMode}
          className="btn btn-ghost text-[11px] px-2.5 py-1 flex items-center gap-1"
        >
          <Settings size={10} />
          {t("novel.mode.switchButton")}
        </button>
      </div>

      {/* 新手引导 */}
      {showOnboarding && (
        <OnboardingGuide
          onComplete={onOnboardingComplete}
          onSkip={onOnboardingComplete}
          onLoadSample={onOnboardingLoadSample}
        />
      )}
    </div>
  );
}

// ============================================================================
// 子组件：底部状态栏
// ============================================================================

interface StatusBarProps {
  pipeline: ReturnType<typeof useNovelPipeline>;
  overviewMode: boolean;
  onToggleOverview: () => void;
  onSwitchMode: () => void;
  nextLabel: string;
  nextDisabled: boolean;
  showAutoRun: boolean;
  progressStep: number;
}

/** 底部状态栏：进度 + 保存状态 + 概览切换 + 模式切换 + 自动执行 + 下一步。 */
function StatusBar({
  pipeline, overviewMode, onToggleOverview, onSwitchMode,
  nextLabel, nextDisabled, showAutoRun, progressStep,
}: StatusBarProps) {
  const {
    state, stagesForMode, isProcessing, isImporting, canProceed,
    lastSavedAt, handleNext, handleAutoRun, workflowMode, handleWorkflowModeChange,
  } = pipeline;

  return (
    <div className="border-t border-border bg-card/50 px-6 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span>
          {t("novel.shell.progress")}: {progressStep}/{stagesForMode.length}
        </span>
        {state.segments.length > 0 && (
          <span>
            {t("novel.shell.segmentsLabel")}: {state.currentSegmentIndex + 1}/{state.segments.length}
          </span>
        )}
        {/* Task 2A.7: 显示保存状态 */}
        <span className="flex items-center gap-1">
          <Save size={10} />
          {lastSavedAt !== null
            ? `${t("novel.project.savedAt")} ${new Date(lastSavedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
            : t("novel.project.unsaved")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {!canProceed && !isProcessing && (
          <span className="text-[11px] text-muted-foreground mr-2">
            {t("novel.controls.cannotProceed")}
          </span>
        )}
        {/* Task 2A.15：概览模式切换按钮 */}
        <button
          type="button"
          onClick={onToggleOverview}
          disabled={isProcessing || isImporting}
          className={[
            "btn text-[12px] px-3 py-1.5 flex items-center gap-1.5",
            overviewMode ? "btn-primary" : "btn-ghost",
          ].join(" ")}
          aria-label={t("novel.overview.toggleAriaLabel")}
          aria-pressed={overviewMode}
        >
          <BarChart3 size={12} />
          {t("novel.overview.toggleButton")}
        </button>
        {/* Task 2A.19：工作流模式切换（半自动/全自动） */}
        <WorkflowModeSelector
          mode={workflowMode}
          onModeChange={handleWorkflowModeChange}
          disabled={isProcessing || isImporting}
          compact
        />
        {/* Task 2A.16：切换模式按钮 */}
        <button
          type="button"
          onClick={onSwitchMode}
          disabled={isProcessing || isImporting}
          className="btn btn-ghost text-[12px] px-3 py-1.5 flex items-center gap-1.5"
          aria-label={t("novel.mode.switchButton")}
        >
          <Settings size={12} />
          {t("novel.mode.switchButton")}
        </button>
        {showAutoRun && (
          <button
            type="button"
            onClick={handleAutoRun}
            disabled={isProcessing || isImporting}
            className="btn btn-ghost text-[12px] px-3 py-1.5 flex items-center gap-1.5"
            aria-label={t("novel.controls.autoRun")}
          >
            {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {t("novel.controls.autoRun")}
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={nextDisabled}
          className={[
            "btn text-[12px] px-4 py-1.5 flex items-center gap-1.5",
            nextDisabled ? "btn-muted cursor-not-allowed opacity-60" : "btn-primary",
          ].join(" ")}
          aria-label={nextLabel}
        >
          {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function StoryPipelineShell({ onComplete, initialConfig }: StoryPipelineShellProps) {
  const pipeline = useNovelPipeline({ onComplete, initialConfig });
  const {
    state, shots, selectedSegmentIds, isProcessing, isImporting,
    storyStructure, shotContracts, pacingConfig,
    showImportStep, showSegmentList, showStructureAnalysis,
    showPacingPlanning, showEntityReview, showShotBreakdown, showFinalize, isDone,
    pendingRecoveryProjects, recoverProject, dismissRecovery, deletePendingProject,
    handleImport, handleToggle, handleSelectAll,
    handleConfirmCharacter, handleConfirmScene, handleEditCharacter,
    handleEditScene, handleMatchCharacter, handleEditShot, handleReorderShots,
    handleGeneratePrompts, handleFinalizeImport, setCurrentSegmentIndex,
    handleBeatsChange, handleShotContractsChange,
    handlePacingConfigChange, handleApplyPacing, handleResetPacing,
  } = pipeline;

  const {
    overviewMode, setOverviewMode, modeSelected, setModeSelected,
    showSampleLoader, setShowSampleLoader, showOnboarding, setShowOnboarding,
    showRecoveryDialog, nextLabel, nextDisabled, showAutoRun, progressStep,
    handleStageClick, handleModeSelect, handleSwitchMode,
    handleSampleLoad, handleOnboardingComplete,
  } = useShellState({ pipeline });

  // 1. 模式未选择 → 显示 ModeSelector（或 SampleProjectLoader）
  if (!modeSelected) {
    return (
      <ModeSelectView
        showSampleLoader={showSampleLoader}
        onSampleLoad={handleSampleLoad}
        onCloseSampleLoader={() => setShowSampleLoader(false)}
        onModeSelect={handleModeSelect}
        onOpenSampleLoader={() => setShowSampleLoader(true)}
      />
    );
  }

  // 2. quick 模式 → 显示 QuickModePanel（隐藏三栏布局）
  if (state.config.aiAssistLevel === "quick") {
    return (
      <QuickModeView
        pipeline={pipeline}
        onSwitchMode={handleSwitchMode}
        showOnboarding={showOnboarding}
        onOnboardingComplete={handleOnboardingComplete}
        onOnboardingLoadSample={() => {
          setShowOnboarding(false);
          setModeSelected(false);
          setShowSampleLoader(true);
        }}
      />
    );
  }

  // 3. standard / professional 模式 → 完整三栏布局
  return (
    <div className="flex flex-col h-full bg-background">
      {/* 顶部 7 步指示器 */}
      <PhaseIndicator stage={state.stage} onStageClick={handleStageClick} />

      {/* 三栏主体 */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <SegmentNavColumn
          segments={state.segments}
          currentSegmentIndex={state.currentSegmentIndex}
          selectedIds={selectedSegmentIds}
          onSelect={setCurrentSegmentIndex}
        />
        {overviewMode ? (
          // Task 2A.15：概览模式覆盖中栏 + 右栏
          <StoryOverviewPanel
            state={state}
            shots={shots}
            storyStructure={storyStructure}
            onExit={() => setOverviewMode(false)}
          />
        ) : (
          <>
            <MainWorkArea
              state={state}
              shots={shots}
              selectedSegmentIds={selectedSegmentIds}
              isProcessing={isProcessing}
              isImporting={isImporting}
              showImportStep={showImportStep}
              showSegmentList={showSegmentList}
              showStructureAnalysis={showStructureAnalysis}
              showEntityReview={showEntityReview}
              showShotBreakdown={showShotBreakdown}
              showFinalize={showFinalize}
              isDone={isDone}
              storyStructure={storyStructure}
              shotContracts={shotContracts}
              pacingConfig={pacingConfig}
              onImport={handleImport}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onConfirmCharacter={handleConfirmCharacter}
              onConfirmScene={handleConfirmScene}
              onEditCharacter={handleEditCharacter}
              onEditScene={handleEditScene}
              onMatchCharacter={handleMatchCharacter}
              onEditShot={handleEditShot}
              onReorderShots={handleReorderShots}
              onGeneratePrompts={handleGeneratePrompts}
              onFinalizeImport={handleFinalizeImport}
              onBeatsChange={handleBeatsChange}
              onShotContractsChange={handleShotContractsChange}
              onPacingConfigChange={handlePacingConfigChange}
              onApplyPacing={handleApplyPacing}
              onResetPacing={handleResetPacing}
              showPacingPlanning={showPacingPlanning}
            />
            <ContextPanel state={state} shotCount={shots.length} />
          </>
        )}
      </div>

      {/* 底部状态栏 + 操作按钮 */}
      <StatusBar
        pipeline={pipeline}
        overviewMode={overviewMode}
        onToggleOverview={() => setOverviewMode((v) => !v)}
        onSwitchMode={handleSwitchMode}
        nextLabel={nextLabel}
        nextDisabled={nextDisabled}
        showAutoRun={showAutoRun}
        progressStep={progressStep}
      />

      {/* Task 2A.7: 未完成项目恢复弹窗 */}
      {showRecoveryDialog && (
        <NovelProjectList
          projects={pendingRecoveryProjects}
          onRecover={recoverProject}
          onDismiss={dismissRecovery}
          onDelete={deletePendingProject}
        />
      )}

      {/* Task 2A.16: 新手引导 */}
      {showOnboarding && (
        <OnboardingGuide
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingComplete}
          onLoadSample={() => {
            setShowOnboarding(false);
            setModeSelected(false);
            setShowSampleLoader(true);
          }}
        />
      )}
    </div>
  );
}
