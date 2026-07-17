/**
 * Task 2A.4 — Pipeline 顶部进度条
 *
 * 横向步骤条，显示当前 stage 在 stages 序列中的位置。
 * 已完成阶段高亮，当前阶段强调，未达阶段灰显。
 */

import { Check } from "lucide-react";
import { t } from "@/shared/constants";
import type { PipelineStage } from "../domain/types";

export interface PipelineProgressProps {
  stage: PipelineStage;
  stages: PipelineStage[];
}

/** 将 PipelineStage 映射为 i18n key */
function stageLabel(stage: PipelineStage): string {
  return t(`novel.stages.${stage}` as Parameters<typeof t>[0]);
}

export function PipelineProgress({ stage, stages }: PipelineProgressProps) {
  const currentIndex = stages.indexOf(stage);

  return (
    <div className="border-b border-border bg-card/30 px-6 py-3">
      <div className="flex items-center gap-1 overflow-x-auto">
        {stages.map((s, i) => {
          const isCompleted = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isLast = i === stages.length - 1;

          return (
            <div key={s} className="flex items-center shrink-0">
              <div className="flex items-center gap-2">
                <div
                  className={[
                    "flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold transition-colors",
                    isCompleted
                      ? "bg-[var(--primary)] text-primary-foreground"
                      : isCurrent
                        ? "bg-[var(--primary)] text-primary-foreground ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-background"
                        : "bg-muted text-muted-foreground",
                  ].join(" ")}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted ? <Check size={12} /> : i + 1}
                </div>
                <span
                  className={[
                    "text-[12px] whitespace-nowrap",
                    isCurrent ? "font-bold text-foreground" : isCompleted ? "text-muted-foreground" : "text-muted-foreground/60",
                  ].join(" ")}
                >
                  {stageLabel(s)}
                </span>
              </div>
              {!isLast && (
                <div
                  className={[
                    "mx-2 h-px w-8",
                    i < currentIndex ? "bg-[var(--primary)]" : "bg-border",
                  ].join(" ")}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5">
        {t("novel.progress.step", { step: currentIndex + 1, total: stages.length })}
      </div>
    </div>
  );
}
