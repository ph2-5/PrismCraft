import { useMemo } from "react";
import { Wallet, AlertTriangle } from "lucide-react";
import { t } from "@/shared/constants";
import { Modal } from "@/shared/presentation/Modal";
import { calculateCost } from "@shared-logic/cost-engine";
import { useUsageSummary } from "@/modules/cost-tracking";

interface EstimateConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前选中的视频模型；未选择时显示提示 */
  providerId?: string;
  modelId?: string;
  duration: number;
  /** 确认后由调用方执行真正提交 */
  onConfirm: () => void;
}

/**
 * 生成前费用预估确认弹窗（cost-tracking P1，设计文档 §任务 5）
 *
 * 展示：本次预估（calculateCost 共用定价引擎 + formula 透明度）+ 本月累计（有效成本）。
 * 仅在手动生成场景弹出；批量生成合计与工作流被动展示为后续迭代。
 */
export function EstimateConfirmDialog({
  open,
  onOpenChange,
  providerId,
  modelId,
  duration,
  onConfirm,
}: EstimateConfirmDialogProps) {
  // 本次预估：共用 cost-engine，杜绝两套口径
  const estimate = useMemo(() => {
    if (!providerId || !modelId) return null;
    return calculateCost({ providerId, modelId, durationSeconds: duration });
  }, [providerId, modelId, duration]);

  // 本月累计（有效成本）：复用看板聚合 hook
  const now = useMemo(() => Math.floor(Date.now() / 1000), [open]);
  const monthStart = useMemo(() => {
    const d = new Date(now * 1000);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }, [now]);
  const { data: monthSummary } = useUsageSummary({ from: monthStart, to: now });

  const monthEffectiveCost = monthSummary?.effectiveCost ?? 0;
  const hasEstimate = estimate && estimate.cost != null;

  return (
    <Modal open={open} onClose={() => onOpenChange(false)} ariaLabel={t("costTracking.estimate.title")}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          <span className="text-base font-medium">{t("costTracking.estimate.title")}</span>
        </div>
        <p className="text-sm text-muted-foreground">{t("costTracking.subtitle")}</p>

        {/* 本次预估 */}
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">{t("costTracking.estimate.thisTime")}</div>
          {!providerId || !modelId ? (
            <div className="mt-1 flex items-center gap-1 text-sm text-amber-600">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {t("costTracking.estimate.unknownProvider")}
            </div>
          ) : hasEstimate && estimate ? (
            <>
              <div className="mt-1 text-2xl font-semibold">¥{estimate.cost!.toFixed(2)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{estimate.formula}</div>
            </>
          ) : (
            <div className="mt-1 flex items-center gap-1 text-sm text-amber-600">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {t("costTracking.estimate.pendingNote")}
            </div>
          )}
        </div>

        {/* 本月累计 */}
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">{t("costTracking.estimate.monthTotal")}</div>
          <div className="mt-1 text-2xl font-semibold">¥{monthEffectiveCost.toFixed(2)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t("costTracking.estimate.thisMonth")}</div>
        </div>

        <p className="text-xs text-muted-foreground">{t("costTracking.estimateNote")}</p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
          >
            {t("costTracking.estimate.submit")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
