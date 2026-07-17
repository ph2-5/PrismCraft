/**
 * Task 2A.4 — Pipeline 底部操作按钮栏
 *
 * 提供"下一步"和"自动执行"两个主操作。
 * - canProceed=false 时下一步禁用
 * - isProcessing=true 时所有按钮禁用并显示处理中文案
 * - mode === "auto" 时隐藏"自动执行"按钮（已在自动模式）
 */

import { Loader2, ArrowRight, Zap } from "lucide-react";
import { t } from "@/shared/constants";

export interface PipelineControlsProps {
  canProceed: boolean;
  isProcessing: boolean;
  onNext: () => void;
  onAutoRun: () => void;
  mode: "auto" | "semi";
}

export function PipelineControls({
  canProceed,
  isProcessing,
  onNext,
  onAutoRun,
  mode,
}: PipelineControlsProps) {
  const nextLabel = isProcessing ? t("novel.controls.processing") : t("novel.controls.next");
  const nextDisabled = !canProceed || isProcessing;
  const showAutoRun = mode === "semi";

  return (
    <div className="border-t border-border bg-card/50 px-6 py-3 flex items-center justify-between gap-3">
      <div className="text-[11px] text-muted-foreground">
        {!canProceed && !isProcessing && t("novel.controls.cannotProceed")}
      </div>
      <div className="flex items-center gap-2">
        {showAutoRun && (
          <button
            type="button"
            onClick={onAutoRun}
            disabled={isProcessing}
            className="btn btn-ghost text-[12px] px-3 py-1.5 flex items-center gap-1.5"
            aria-label={t("novel.controls.autoRun")}
          >
            {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {t("novel.controls.autoRun")}
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
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
