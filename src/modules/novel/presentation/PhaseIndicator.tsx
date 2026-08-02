/**
 * 故事创作页 — 流水线阶段导航（Stepper）
 *
 * 基于功能自主设计（design-preview 未覆盖此页）：
 * - 7 个阶段节点：图标 + 阶段名，完成✓ / 当前（主色 + 脉冲点）/ 待做（灰）
 * - 连接线：已完成段用主色渐变
 * - v5.2：所有阶段可点击跳转
 */

import { Check, FolderPlus, FileUp, Users, MapPin, ClipboardCheck, Clapperboard, Sparkles } from "lucide-react";
import { t } from "@/shared/constants";
import type { PipelineStage } from "../domain/types";

/** 7 个用户可见阶段（不含 structure_analysis/pacing_planning/done） */
const VISIBLE_PHASES: PipelineStage[] = [
  "project_init",
  "content_import",
  "character_manage",
  "scene_manage",
  "review",
  "storyboard",
  "generation",
];

/** 阶段 → 图标（仅 7 个可见阶段需要，其余阶段无入口） */
const PHASE_ICONS: Partial<Record<PipelineStage, typeof Check>> = {
  project_init: FolderPlus,
  content_import: FileUp,
  character_manage: Users,
  scene_manage: MapPin,
  review: ClipboardCheck,
  storyboard: Clapperboard,
  generation: Sparkles,
};

export interface PhaseIndicatorProps {
  /** 当前 stage */
  stage: PipelineStage;
  /** 点击阶段回调（v5.2：所有阶段都可触发） */
  onStageClick?: (stage: PipelineStage) => void;
}

/** 将 PipelineStage 映射为 i18n key */
function stageLabel(stage: PipelineStage): string {
  return t(`novel.stages.${stage}` as Parameters<typeof t>[0]);
}

export function PhaseIndicator({ stage, onStageClick }: PhaseIndicatorProps) {
  // 如果当前 stage 是 structure_analysis/pacing_planning，映射到 content_import 显示
  const displayStage: PipelineStage =
    stage === "structure_analysis" || stage === "pacing_planning"
      ? "content_import"
      : stage === "done"
        ? "generation"
        : stage;
  const currentIndex = VISIBLE_PHASES.indexOf(displayStage);

  return (
    <div className="border-b border-border bg-card/40 px-5 py-2.5">
      <div className="flex items-center overflow-x-auto">
        {VISIBLE_PHASES.map((s, i) => {
          const isCompleted = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isLast = i === VISIBLE_PHASES.length - 1;
          const clickable = onStageClick !== undefined && !isCurrent;
          const Icon = PHASE_ICONS[s] ?? Sparkles;

          return (
            <div key={s} className="flex items-center shrink-0">
              <button
                type="button"
                onClick={clickable ? () => onStageClick?.(s) : undefined}
                disabled={!clickable}
                className={[
                  "flex items-center gap-2 py-1 px-1.5 rounded-md transition-colors",
                  clickable ? "cursor-pointer hover:bg-muted/50" : "cursor-default",
                ].join(" ")}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={stageLabel(s)}
              >
                <div className="relative">
                  <div
                    className={[
                      "flex items-center justify-center w-7 h-7 rounded-full transition-all",
                      isCompleted
                        ? "bg-[var(--primary)] text-primary-foreground"
                        : isCurrent
                          ? "bg-[var(--primary)] text-primary-foreground ring-4 ring-[rgba(var(--primary-rgb),0.18)]"
                          : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    {isCompleted ? <Check size={14} /> : <Icon size={13} />}
                  </div>
                  {isCurrent && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
                  )}
                </div>
                <span
                  className={[
                    "text-[12px] whitespace-nowrap",
                    isCurrent
                      ? "font-bold text-foreground"
                      : isCompleted
                        ? "text-muted-foreground"
                        : "text-muted-foreground/80 hover:text-foreground",
                  ].join(" ")}
                >
                  {stageLabel(s)}
                </span>
              </button>
              {!isLast && (
                <div
                  className={[
                    "mx-1.5 h-0.5 w-7 rounded-full",
                    i < currentIndex
                      ? "bg-gradient-to-r from-[var(--primary)] to-[rgba(var(--primary-rgb),0.5)]"
                      : "bg-border",
                  ].join(" ")}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
