/**
 * Task 2A.6 — PhaseIndicator 顶部 7 步指示器
 *
 * 显示当前 PipelineStage 在 7 个核心阶段中的位置：
 * ①项目初始化 → ②内容导入 → ③角色 → ④场景 → ⑤检查 → ⑥剧本化 → ⑦生成
 *
 * 交互：
 * - 已完成阶段（index < currentIndex）可点击回退查看
 * - 当前阶段高亮
 * - 未解锁阶段（index > currentIndex）灰色不可点
 *
 * 注：此组件展示 7 个"用户可见"阶段（合并了 structure_analysis/pacing_planning
 * 到 content_import 中，done 阶段不显示）。完整 10 阶段状态由 pipeline-machine 维护。
 */

import { Check } from "lucide-react";
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

export interface PhaseIndicatorProps {
  /** 当前 stage */
  stage: PipelineStage;
  /** 点击阶段回调（仅对已解锁阶段触发） */
  onStageClick?: (stage: PipelineStage) => void;
}

/** 将 PipelineStage 映射为 i18n key */
function stageLabel(stage: PipelineStage): string {
  return t(`novel.stages.${stage}` as Parameters<typeof t>[0]);
}

/**
 * 判断目标阶段是否已解锁（即 currentIndex 之前或当前）。
 * 使用 VISIBLE_PHASES 中的索引比较。
 */
function isStageUnlocked(currentStage: PipelineStage, targetStage: PipelineStage): boolean {
  const currentIdx = VISIBLE_PHASES.indexOf(currentStage);
  const targetIdx = VISIBLE_PHASES.indexOf(targetStage);
  if (currentIdx === -1 || targetIdx === -1) {
    // 当前阶段不在 VISIBLE_PHASES 中（如 structure_analysis/pacing_planning/done）
    // 则按"已完成"处理（允许回退查看）
    return true;
  }
  return targetIdx <= currentIdx;
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
    <div className="border-b border-border bg-card/30 px-6 py-3">
      <div className="flex items-center gap-1 overflow-x-auto">
        {VISIBLE_PHASES.map((s, i) => {
          const isCompleted = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isLast = i === VISIBLE_PHASES.length - 1;
          const unlocked = isStageUnlocked(displayStage, s);
          const clickable = unlocked && onStageClick !== undefined && !isCurrent;

          return (
            <div key={s} className="flex items-center shrink-0">
              <button
                type="button"
                onClick={clickable ? () => onStageClick?.(s) : undefined}
                disabled={!clickable}
                className={[
                  "flex items-center gap-2 py-1 px-1 rounded-md transition-colors",
                  "cursor-default",
                ].join(" ")}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={stageLabel(s)}
              >
                <div
                  className={[
                    "flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold transition-colors",
                    isCompleted
                      ? "bg-[var(--primary)] text-primary-foreground"
                      : isCurrent
                        ? "bg-[var(--primary)] text-primary-foreground ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-background"
                        : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {isCompleted ? <Check size={12} /> : i + 1}
                </div>
                <span
                  className={[
                    "text-[12px] whitespace-nowrap",
                    isCurrent
                      ? "font-bold text-foreground"
                      : isCompleted
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60",
                  ].join(" ")}
                >
                  {stageLabel(s)}
                </span>
              </button>
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
        {t("novel.progress.step", {
          step: currentIndex + 1,
          total: VISIBLE_PHASES.length,
        })}
      </div>
    </div>
  );
}
