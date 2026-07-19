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
 *   - 首次进入显示 ModeSelector（localStorage 标记 novel_mode_selected）
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
import type { SampleProject } from "../services/sample-projects";

/** localStorage 键：是否已完成模式选择（首次进入后置为 true） */
const MODE_SELECTED_KEY = "novel_mode_selected";
/** localStorage 键：是否已完成新手引导 */
const ONBOARDING_COMPLETED_KEY = "novel_onboarding_completed";

/** 读取 localStorage 标记（容错：SSR 或隐私模式下返回 false） */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

/** 写入 localStorage 标记（容错：SSR 或隐私模式下静默失败） */
function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // 静默失败：隐私模式或存储已满
  }
}

export interface StoryPipelineShellProps {
  onComplete: () => void;
  /** 可选：初始配置（默认 semi + professional） */
  initialConfig?: Partial<PipelineConfig>;
}

export function StoryPipelineShell({ onComplete, initialConfig }: StoryPipelineShellProps) {
  const pipeline = useNovelPipeline({ onComplete, initialConfig });
  // Task 2A.15：概览模式切换（覆盖中栏和右栏，显示 StoryOverviewPanel）
  const [overviewMode, setOverviewMode] = useState(false);
  // Task 2A.16：模式选择 / 示例项目加载 / 新手引导 状态
  const [modeSelected, setModeSelected] = useState<boolean>(() => readFlag(MODE_SELECTED_KEY));
  const [showSampleLoader, setShowSampleLoader] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(
    () => !readFlag(ONBOARDING_COMPLETED_KEY),
  );
  const {
    state,
    shots,
    selectedSegmentIds,
    isProcessing,
    isImporting,
    // Task 2A.13 故事结构分析状态
    storyStructure,
    shotContracts,
    // Task 2A.14 节奏规划状态
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
    // Task 2A.7 持久化
    pendingRecoveryProjects,
    isLoadingRecovery,
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
    // Task 2A.13 Structure handlers
    handleBeatsChange,
    handleShotContractsChange,
    // Task 2A.14 Pacing handlers
    handlePacingConfigChange,
    handleApplyPacing,
    handleResetPacing,
    recoverProject,
    dismissRecovery,
    deletePendingProject,
    // Task 2A.16 三档模式 + 示例项目 handlers
    handleSelectMode,
    handleLoadSampleProject,
    handleQuickGenerate,
    setRawText,
  } = pipeline;

  // Task 2A.7: 显示恢复弹窗的条件
  // - 已加载完成（isLoadingRecovery = false）
  // - 有未完成项目
  // - 当前不在 done 阶段（done 不需要恢复）
  // - 当前 state 还是初始的 project_init 且无 rawText（用户尚未开始新输入）
  // - 模式已选择（未选择模式时不显示恢复，避免与 ModeSelector 冲突）
  const showRecoveryDialog =
    !isLoadingRecovery &&
    modeSelected &&
    pendingRecoveryProjects.length > 0 &&
    state.stage === "project_init" &&
    state.rawText.length === 0;

  const nextLabel = isProcessing ? t("novel.controls.processing") : t("novel.controls.next");
  const nextDisabled = !canProceed || isProcessing;
  const showAutoRun = state.config.mode === "semi";

  // 当前阶段在 stagesForMode 中的索引（用于底部进度显示）
  const currentStageIdx = stagesForMode.indexOf(state.stage);
  const progressStep = currentStageIdx >= 0 ? currentStageIdx + 1 : 1;

  // PhaseIndicator 点击回退（仅展示，不重置数据；用户可查看之前阶段的产出）
  const handleStageClick = (_stage: PipelineStage) => {
    // 当前实现：PhaseIndicator 点击仅作为视觉反馈，不切换 stage
    // 后续 Task 2A.7+ 接入持久化后可实现真正的阶段回退查看
  };

  // Task 2A.16：模式选择回调
  const handleModeSelect = (level: AiAssistLevel) => {
    handleSelectMode(level);
    setModeSelected(true);
    writeFlag(MODE_SELECTED_KEY, true);
    setShowSampleLoader(false);
  };

  // Task 2A.16：切换模式按钮回调（弹窗确认，避免丢失数据）
  const handleSwitchMode = () => {
    if (state.stage !== "project_init" || state.rawText.length > 0) {
      const confirmed = window.confirm(t("novel.mode.switchConfirm"));
      if (!confirmed) return;
    }
    setModeSelected(false);
    writeFlag(MODE_SELECTED_KEY, false);
  };

  // Task 2A.16：加载示例项目回调
  const handleSampleLoad = (project: SampleProject) => {
    handleLoadSampleProject(project);
    setShowSampleLoader(false);
    setModeSelected(true);
    writeFlag(MODE_SELECTED_KEY, true);
    writeFlag(ONBOARDING_COMPLETED_KEY, true);
    setShowOnboarding(false);
  };

  // Task 2A.16：新手引导完成回调
  const handleOnboardingComplete = () => {
    writeFlag(ONBOARDING_COMPLETED_KEY, true);
    setShowOnboarding(false);
  };

  // === 渲染分支 ===

  // 1. 模式未选择 → 显示 ModeSelector（或 SampleProjectLoader）
  if (!modeSelected) {
    if (showSampleLoader) {
      return (
        <div className="h-full">
          <SampleProjectLoader
            onLoad={handleSampleLoad}
            onClose={() => setShowSampleLoader(false)}
          />
        </div>
      );
    }
    return (
      <div className="h-full">
        <ModeSelector
          onSelect={handleModeSelect}
          onLoadSample={() => setShowSampleLoader(true)}
        />
      </div>
    );
  }

  // 2. quick 模式 → 显示 QuickModePanel（隐藏三栏布局）
  if (state.config.aiAssistLevel === "quick") {
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
            onClick={handleSwitchMode}
            className="btn btn-ghost text-[11px] px-2.5 py-1 flex items-center gap-1"
          >
            <Settings size={10} />
            {t("novel.mode.switchButton")}
          </button>
        </div>

        {/* 新手引导 */}
        {showOnboarding && (
          <OnboardingGuide
            onComplete={handleOnboardingComplete}
            onSkip={handleOnboardingComplete}
            onLoadSample={() => {
              setShowOnboarding(false);
              setModeSelected(false);
              writeFlag(MODE_SELECTED_KEY, false);
              setShowSampleLoader(true);
            }}
          />
        )}
      </div>
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
            onClick={() => setOverviewMode((v) => !v)}
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
          {/* Task 2A.16：切换模式按钮 */}
          <button
            type="button"
            onClick={handleSwitchMode}
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
            writeFlag(MODE_SELECTED_KEY, false);
            setShowSampleLoader(true);
          }}
        />
      )}
    </div>
  );
}
