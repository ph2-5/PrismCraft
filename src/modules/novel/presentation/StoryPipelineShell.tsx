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
 * 状态管理通过 useNovelPipeline Hook（与 NovelImportPage 共享）。
 * 三栏可独立滚动；窗口缩放时左右栏宽度固定，中栏 flex 自适应。
 */

import { Loader2, ArrowRight, Zap, Save } from "lucide-react";
import { t } from "@/shared/constants";
import type { PipelineConfig, PipelineStage } from "../domain/types";
import { useNovelPipeline } from "../hooks/use-novel-pipeline";
import { PhaseIndicator } from "./PhaseIndicator";
import { SegmentNavColumn } from "./SegmentNavColumn";
import { MainWorkArea } from "./MainWorkArea";
import { ContextPanel } from "./ContextPanel";
import { NovelProjectList } from "./NovelProjectList";

export interface StoryPipelineShellProps {
  onComplete: () => void;
  /** 可选：初始配置（默认 semi + professional） */
  initialConfig?: Partial<PipelineConfig>;
}

export function StoryPipelineShell({ onComplete, initialConfig }: StoryPipelineShellProps) {
  const pipeline = useNovelPipeline({ onComplete, initialConfig });
  const {
    state,
    shots,
    selectedSegmentIds,
    isProcessing,
    isImporting,
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
    recoverProject,
    dismissRecovery,
    deletePendingProject,
  } = pipeline;

  // Task 2A.7: 显示恢复弹窗的条件
  // - 已加载完成（isLoadingRecovery = false）
  // - 有未完成项目
  // - 当前不在 done 阶段（done 不需要恢复）
  // - 当前 state 还是初始的 project_init 且无 rawText（用户尚未开始新输入）
  const showRecoveryDialog =
    !isLoadingRecovery &&
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
        <MainWorkArea
          state={state}
          shots={shots}
          selectedSegmentIds={selectedSegmentIds}
          isProcessing={isProcessing}
          isImporting={isImporting}
          showImportStep={showImportStep}
          showSegmentList={showSegmentList}
          showEntityReview={showEntityReview}
          showShotBreakdown={showShotBreakdown}
          showFinalize={showFinalize}
          isDone={isDone}
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
        />
        <ContextPanel state={state} shotCount={shots.length} />
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
    </div>
  );
}
