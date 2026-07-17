/**
 * Task 2A.6 — MainWorkArea 中栏主工作区（flex:1）
 *
 * 根据 PipelineState.stage 渲染对应 Phase 内容：
 * - project_init / content_import(空) → ImportStep（文本导入）
 * - content_import(有文本) → SegmentList（段落列表）
 * - character_manage / scene_manage → EntityReviewPanel（角色/场景审查）
 * - review / storyboard → ShotBreakdownList（分镜列表）
 * - generation → FinalizePanel（最终确认导入）
 * - done → 完成提示
 *
 * 此组件为纯渲染组件，所有状态与 handlers 由父组件 StoryPipelineShell 通过 props 传入。
 */

import { CheckCircle2 } from "lucide-react";
import { t } from "@/shared/constants";
import type { PipelineState, ShotBreakdown, ExtractedCharacter, ExtractedScene } from "../domain/types";
import { ImportStep } from "./ImportStep";
import { SegmentList } from "./SegmentList";
import { EntityReviewPanel } from "./EntityReviewPanel";
import { ShotBreakdownList } from "./ShotBreakdownList";
import { FinalizePanel } from "./FinalizePanel";

export interface MainWorkAreaProps {
  state: PipelineState;
  shots: ShotBreakdown[];
  selectedSegmentIds: string[];
  isProcessing: boolean;
  isImporting: boolean;
  showImportStep: boolean;
  showSegmentList: boolean;
  showEntityReview: boolean;
  showShotBreakdown: boolean;
  showFinalize: boolean;
  isDone: boolean;
  // Handlers
  onImport: (text: string) => void;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onConfirmCharacter: (id: string) => void;
  onConfirmScene: (id: string) => void;
  onEditCharacter: (c: ExtractedCharacter) => void;
  onEditScene: (s: ExtractedScene) => void;
  onMatchCharacter: (id: string, existingId: string) => void;
  onEditShot: (shot: ShotBreakdown) => void;
  onReorderShots: (from: number, to: number) => void;
  onGeneratePrompts: () => void;
  onFinalizeImport: () => void;
}

export function MainWorkArea({
  state,
  shots,
  selectedSegmentIds,
  isProcessing,
  isImporting,
  showImportStep,
  showSegmentList,
  showEntityReview,
  showShotBreakdown,
  showFinalize,
  isDone,
  onImport,
  onToggle,
  onSelectAll,
  onConfirmCharacter,
  onConfirmScene,
  onEditCharacter,
  onEditScene,
  onMatchCharacter,
  onEditShot,
  onReorderShots,
  onGeneratePrompts,
  onFinalizeImport,
}: MainWorkAreaProps) {
  return (
    <main className="flex-1 min-w-0 overflow-y-auto p-6 bg-background" aria-label={t("novel.shell.mainWorkArea")}>
      {isDone ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <CheckCircle2 size={48} className="text-[var(--primary)] mb-3" />
          <div className="text-base font-bold mb-1">{t("novel.controls.complete")}</div>
        </div>
      ) : showImportStep ? (
        <ImportStep onImport={onImport} />
      ) : showSegmentList ? (
        <SegmentList
          segments={state.segments}
          selectedIds={selectedSegmentIds}
          onToggle={onToggle}
          onSelectAll={onSelectAll}
        />
      ) : showEntityReview ? (
        <EntityReviewPanel
          characters={state.characters}
          scenes={state.scenes}
          onConfirmCharacter={onConfirmCharacter}
          onConfirmScene={onConfirmScene}
          onEditCharacter={onEditCharacter}
          onEditScene={onEditScene}
          onMatchCharacter={onMatchCharacter}
          isProcessing={isProcessing}
        />
      ) : showShotBreakdown ? (
        <ShotBreakdownList
          shots={shots}
          onEdit={onEditShot}
          onReorder={onReorderShots}
          onGeneratePrompts={onGeneratePrompts}
        />
      ) : showFinalize ? (
        <FinalizePanel state={state} onImport={onFinalizeImport} isImporting={isImporting} />
      ) : null}
    </main>
  );
}
